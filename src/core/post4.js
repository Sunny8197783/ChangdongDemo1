// Render path v4 (PLAN §2.4). Owned by core.
//   ScenePass4  RenderPass(scene, camera) → scene target (HalfFloat, samples 0|4, DepthTexture), drawn into a
//               viewport/scissor of round(alloc × scale): dynamic resolution WITHOUT reallocation.
//   BloomPass4  own pass: bright = NaN/Inf scrub + clamp 16 + threshold 1.0 into a ¼-area target; blur chain of 3 mips
//               (5 at high), first mip = 1/16 render area; output = bloom texture (game.post.bloomTex), never blended back.
//   FinalPass4  renderToScreen: scene × uvScale, FXAA (every tap tone-mapped, ACES × exposure), + bloom × strength
//               (uBloomOn), grade, chroma/radial pulse, CAS-lite sharpen when scale < 1, dither, NaN guard, linear → sRGB.
// Targets are allocated once at the maximum render size (canvas drawing buffer × renderScale) and only re-allocated on a
// canvas resize / renderScale change (never by the governor). No program is ever recompiled at runtime: every switch is a
// uniform (uBloomOn, uSharpen, uChroma, uGradeMix …).
//   createComposer4(renderer, scene, camera, {msaa, bloomMips}) → Composer4 (EffectComposer-shaped: passes, readBuffer,
//   renderTarget1/2, render(dt), setSize(w, h, renderScale), setScale(s), get scale, viewport {w, h}, uvScale)
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// shared GLSL: NaN/Inf scrub, ACES filmic (identical to three r160's ACESFilmicToneMapping), sRGB OETF
const COMMON = `
  vec3 scrub(vec3 c){ if (any(isnan(c)) || any(isinf(c))) return vec3(0.0); return c; }
  vec3 RRTAndODTFit4(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 aces4(vec3 color, float exposure){
    const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    color *= exposure / 0.6;
    color = ACESInputMat * color; color = RRTAndODTFit4(color); color = ACESOutputMat * color;
    return clamp(color, 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
`;

function quadMat(uniforms, frag, { additive = false } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: frag,
    depthTest: false, depthWrite: false, toneMapped: false, fog: false,
  });
  if (additive) { m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendEquation = THREE.AddEquation; m.transparent = true; }
  m.name = 'post4';
  return m;
}

function halfTarget(w, h, name) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
  });
  rt.texture.name = name;
  return rt;
}
/** viewport (w × h at the bottom-left) + scissor on a render target; returns the uv scale (viewport ÷ allocation). */
function setVp(rt, w, h, out) {
  rt.viewport.set(0, 0, w, h); rt.scissor.set(0, 0, w, h);
  rt.scissorTest = w < rt.width || h < rt.height;
  if (out) out.set(w / rt.width, h / rt.height);
  return out;
}

/** Scene pass (constructor name kept for tools that look for 'RenderPass'). */
class RenderPass {
  constructor(scene, camera) { this.scene = scene; this.camera = camera; this.enabled = true; this.needsSwap = false; this.isPass = true; }
  setSize() {}
  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);   // autoClear clears colour + depth inside the scissor
  }
}

/** Own bloom (not an UnrealBloom subclass). Output only: this.texture (the first mip). */
class BloomPass4 {
  constructor({ mips = 3 } = {}) {
    this.isPass = true; this.enabled = true; this.needsSwap = false;
    this.strength = 0.4; this.threshold = 1.0; this.radius = 0.6; this.clampMax = 16;
    this.maxMips = 5; this.mips = Math.max(1, Math.min(this.maxMips, mips | 0));
    this.bright = null; this.chain = [];
    this.allocW = 0; this.allocH = 0;
    this._uv = new THREE.Vector2(1, 1);
    this.brightMat = quadMat({
      tSrc: { value: null }, uUv: { value: new THREE.Vector2(1, 1) }, uClamp: { value: new THREE.Vector2(1, 1) }, uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 1.0 }, uMax: { value: 16 },
    }, `uniform sampler2D tSrc; uniform vec2 uUv, uClamp, uTexel; uniform float uThreshold, uMax; varying vec2 vUv;
      ${COMMON}
      vec3 tap(vec2 uv){ vec3 c = scrub(texture2D(tSrc, min(uv, uClamp)).rgb); return min(max(c, vec3(0.0)), vec3(uMax)); }
      void main(){
        vec2 uv = vUv * uUv;
        vec3 a = tap(uv + uTexel * vec2(-1.0, -1.0)), b = tap(uv + uTexel * vec2(1.0, -1.0));
        vec3 c = tap(uv + uTexel * vec2(-1.0, 1.0)), d = tap(uv + uTexel * vec2(1.0, 1.0));
        // Karis-weighted average: one very bright texel cannot flicker the whole bloom
        float wa = 1.0 / (1.0 + max(a.r, max(a.g, a.b))), wb = 1.0 / (1.0 + max(b.r, max(b.g, b.b)));
        float wc = 1.0 / (1.0 + max(c.r, max(c.g, c.b))), wd = 1.0 / (1.0 + max(d.r, max(d.g, d.b)));
        vec3 m = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
        float l = max(m.r, max(m.g, m.b));
        float k = max(l - uThreshold, 0.0) / max(l, 1e-4);
        gl_FragColor = vec4(m * k, 1.0);
      }`);
    this.downMat = quadMat({
      tSrc: { value: null }, uUv: { value: new THREE.Vector2(1, 1) }, uClamp: { value: new THREE.Vector2(1, 1) }, uTexel: { value: new THREE.Vector2() },
    }, `uniform sampler2D tSrc; uniform vec2 uUv, uClamp, uTexel; varying vec2 vUv;
      vec3 tap(vec2 uv){ return texture2D(tSrc, min(uv, uClamp)).rgb; }
      void main(){
        vec2 uv = vUv * uUv;
        vec3 s = tap(uv) * 0.5;
        s += (tap(uv + uTexel * vec2(-1.0, -1.0)) + tap(uv + uTexel * vec2(1.0, -1.0)) + tap(uv + uTexel * vec2(-1.0, 1.0)) + tap(uv + uTexel * vec2(1.0, 1.0))) * 0.125;
        gl_FragColor = vec4(s, 1.0);
      }`);
    this.upMat = quadMat({
      tSrc: { value: null }, uUv: { value: new THREE.Vector2(1, 1) }, uClamp: { value: new THREE.Vector2(1, 1) }, uTexel: { value: new THREE.Vector2() },
      uWeight: { value: 0.6 },
    }, `uniform sampler2D tSrc; uniform vec2 uUv, uClamp, uTexel; uniform float uWeight; varying vec2 vUv;
      vec3 tap(vec2 uv){ return texture2D(tSrc, min(uv, uClamp)).rgb; }
      void main(){
        vec2 uv = vUv * uUv;
        // 3×3 tent on the lower mip
        vec3 s = tap(uv) * 4.0;
        s += (tap(uv + vec2(uTexel.x, 0.0)) + tap(uv - vec2(uTexel.x, 0.0)) + tap(uv + vec2(0.0, uTexel.y)) + tap(uv - vec2(0.0, uTexel.y))) * 2.0;
        s += tap(uv + uTexel) + tap(uv - uTexel) + tap(uv + vec2(uTexel.x, -uTexel.y)) + tap(uv + vec2(-uTexel.x, uTexel.y));
        gl_FragColor = vec4(s * (uWeight / 16.0), 1.0);
      }`, { additive: true });
    this.quad = new FullScreenQuad(this.brightMat);
    this.vp = [];   // per-level viewport sizes [bright, mip1, …]
  }
  get texture() { return this.chain[0]?.texture || null; }
  /** Allocation at the maximum render size (w × h). Never called by the governor. */
  setSize(w, h) {
    const bw = Math.max(1, Math.ceil(w / 2)), bh = Math.max(1, Math.ceil(h / 2));
    if (this.allocW === w && this.allocH === h && this.bright) return;
    this.allocW = w; this.allocH = h;
    this.bright?.dispose(); for (const rt of this.chain) rt.dispose();
    this.bright = halfTarget(bw, bh, 'bloom4.bright');
    this.chain = [];
    let cw = bw, ch = bh;
    for (let i = 0; i < this.maxMips; i++) { cw = Math.max(1, Math.ceil(cw / 2)); ch = Math.max(1, Math.ceil(ch / 2)); this.chain.push(halfTarget(cw, ch, 'bloom4.mip' + (i + 1))); }
    this.vp = Array.from({ length: this.maxMips + 1 }, () => ({ w: 1, h: 1, uv: new THREE.Vector2(1, 1), clamp: new THREE.Vector2(1, 1), texel: new THREE.Vector2() }));
  }
  /** Fill the per-level viewports for a scene viewport of w × h. */
  layout(w, h) {
    let cw = Math.max(1, Math.round(w / 2)), ch = Math.max(1, Math.round(h / 2));
    const levels = [this.bright, ...this.chain];
    for (let i = 0; i <= this.mips; i++) {
      const rt = levels[i], V = this.vp[i];
      if (i > 0) { cw = Math.max(1, Math.round(cw / 2)); ch = Math.max(1, Math.round(ch / 2)); }
      V.w = Math.min(cw, rt.width); V.h = Math.min(ch, rt.height);
      V.uv.set(V.w / rt.width, V.h / rt.height);
      V.clamp.set((V.w - 0.5) / rt.width, (V.h - 0.5) / rt.height);
      V.texel.set(1 / rt.width, 1 / rt.height);
    }
  }
  /** src = the scene target; srcUv/srcClamp/srcTexel describe its live viewport. */
  render(renderer, src, srcUv, srcClamp, srcTexel, w, h) {
    this.layout(w, h);
    const levels = [this.bright, ...this.chain];
    // bright: scene → ¼ area
    let U = this.brightMat.uniforms;
    U.tSrc.value = src.texture; U.uUv.value.copy(srcUv); U.uClamp.value.copy(srcClamp); U.uTexel.value.copy(srcTexel);
    U.uThreshold.value = this.threshold; U.uMax.value = this.clampMax;
    setVp(this.bright, this.vp[0].w, this.vp[0].h, null);
    renderer.setRenderTarget(this.bright); this.quad.material = this.brightMat; this.quad.render(renderer);
    // down chain
    this.quad.material = this.downMat; U = this.downMat.uniforms;
    for (let i = 1; i <= this.mips; i++) {
      const s = this.vp[i - 1];
      U.tSrc.value = levels[i - 1].texture; U.uUv.value.copy(s.uv); U.uClamp.value.copy(s.clamp); U.uTexel.value.copy(s.texel);
      setVp(levels[i], this.vp[i].w, this.vp[i].h, null);
      renderer.setRenderTarget(levels[i]); this.quad.render(renderer);
    }
    // up chain: additive tent of mip i+1 onto mip i, down to the first mip (the output)
    this.quad.material = this.upMat; U = this.upMat.uniforms; U.uWeight.value = this.radius;
    const prevAuto = renderer.autoClear; renderer.autoClear = false;
    try {
      for (let i = this.mips - 1; i >= 1; i--) {
        const s = this.vp[i + 1];
        U.tSrc.value = levels[i + 1].texture; U.uUv.value.copy(s.uv); U.uClamp.value.copy(s.clamp); U.uTexel.value.copy(s.texel);
        setVp(levels[i], this.vp[i].w, this.vp[i].h, null);
        renderer.setRenderTarget(levels[i]); this.quad.render(renderer);
      }
    } finally { renderer.autoClear = prevAuto; }
  }
  /** Energy normaliser for the up chain (1 + r + r² … over the mips summed into the first one). */
  get norm() { let n = 0, w = 1; for (let i = 0; i < this.mips; i++) { n += w; w *= this.radius; } return 1 / Math.max(1e-3, n); }
  dispose() { this.bright?.dispose(); for (const rt of this.chain) rt.dispose(); this.brightMat.dispose(); this.downMat.dispose(); this.upMat.dispose(); }
}

/** The merged final pass (tone map + FXAA + bloom + grade + pulse + CAS + dither + sRGB) to the canvas. */
class FinalPass4 {
  constructor() {
    this.isPass = true; this.enabled = true; this.needsSwap = false; this.renderToScreen = true;
    this.uniforms = {
      tDiffuse: { value: null }, tBloom: { value: null },
      uUvScale: { value: new THREE.Vector2(1, 1) }, uClamp: { value: new THREE.Vector2(1, 1) }, uTexel: { value: new THREE.Vector2(1, 1) },
      uBloomUv: { value: new THREE.Vector2(1, 1) }, uBloomClamp: { value: new THREE.Vector2(1, 1) },
      uBloomOn: { value: 1 }, uBloomStrength: { value: 0.4 }, uExposure: { value: 1.05 },
      uFxaa: { value: 1 }, uSharpen: { value: 0 }, uDither: { value: 1 },
      uChroma: { value: 0 }, uRadial: { value: 0 },
      uGradeTint: { value: new THREE.Vector3(1, 1, 1) }, uGradeSat: { value: 1 }, uGradeContrast: { value: 1 }, uGradeMix: { value: 0 },
    };
    this.material = quadMat(this.uniforms, `
      uniform sampler2D tDiffuse, tBloom;
      uniform vec2 uUvScale, uClamp, uTexel, uBloomUv, uBloomClamp;
      uniform float uBloomOn, uBloomStrength, uExposure, uFxaa, uSharpen, uDither, uChroma, uRadial;
      uniform vec3 uGradeTint; uniform float uGradeSat, uGradeContrast, uGradeMix;
      varying vec2 vUv;
      ${COMMON}
      vec3 grade(vec3 c){
        if (uGradeMix > 0.001) {
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          vec3 g = mix(vec3(l), c, uGradeSat) * uGradeTint;
          g = (g - 0.18) * uGradeContrast + 0.18;
          c = mix(c, max(g, vec3(0.0)), uGradeMix);
        }
        return c;
      }
      vec3 hdr(vec2 uv){ return grade(min(max(scrub(texture2D(tDiffuse, clamp(uv, vec2(0.0), uClamp)).rgb), vec3(0.0)), vec3(512.0))); }
      vec3 tm(vec2 uv){ return aces4(hdr(uv), uExposure); }
      float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
      void main(){
        vec2 uv = vUv * uUvScale;
        vec3 centreHdr;
        vec3 col;
        if (uChroma > 0.0005 || uRadial > 0.0005) {
          // pulse: radial blur + chromatic split (HDR, before tone mapping, as the v3 sanitize pass did)
          vec2 d = vUv - 0.5;
          vec3 acc = vec3(0.0);
          for (int i = 0; i < 6; i++) { float t = float(i) / 5.0; acc += hdr((vUv - d * (uRadial * 0.07 * t)) * uUvScale); }
          vec3 c = acc / 6.0;
          vec2 off = d * uChroma * 0.018;
          c.r = mix(c.r, hdr((vUv + off) * uUvScale).r, 0.85);
          c.b = mix(c.b, hdr((vUv - off) * uUvScale).b, 0.85);
          centreHdr = c;
          col = aces4(c, uExposure);
        } else {
          centreHdr = hdr(uv);
          vec3 rgbM = aces4(centreHdr, uExposure);
          col = rgbM;
          if (uFxaa > 0.5 || uSharpen > 0.001) {
            // FXAA 3.11-lite on tone-mapped taps (HDR fireflies cannot drive the edge test)
            vec3 rgbNW = tm(uv + uTexel * vec2(-1.0, -1.0)), rgbNE = tm(uv + uTexel * vec2(1.0, -1.0));
            vec3 rgbSW = tm(uv + uTexel * vec2(-1.0, 1.0)), rgbSE = tm(uv + uTexel * vec2(1.0, 1.0));
            float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE), lM = luma(rgbM);
            float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
            float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
            if (uFxaa > 0.5 && lMax - lMin > max(0.0312, lMax * 0.125)) {
              vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
              float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
              float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
              dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;
              vec3 rgbA = 0.5 * (tm(uv + dir * (1.0 / 3.0 - 0.5)) + tm(uv + dir * (2.0 / 3.0 - 0.5)));
              vec3 rgbB = rgbA * 0.5 + 0.25 * (tm(uv - dir * 0.5) + tm(uv + dir * 0.5));
              float lB = luma(rgbB);
              col = (lB < lMin || lB > lMax) ? rgbA : rgbB;
            } else if (uSharpen > 0.001) {
              // CAS-lite: contrast-adaptive negative lobe from the 4 diagonal taps (only while rendering below canvas size)
              vec3 mn = min(rgbM, min(min(rgbNW, rgbNE), min(rgbSW, rgbSE)));
              vec3 mx = max(rgbM, max(max(rgbNW, rgbNE), max(rgbSW, rgbSE)));
              vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
              vec3 w = -amp * (uSharpen * 0.2);
              col = clamp((rgbM + (rgbNW + rgbNE + rgbSW + rgbSE) * w) / (1.0 + 4.0 * w), 0.0, 1.0);
            }
          }
        }
        if (uBloomOn > 0.5) {
          // bloom is added in HDR before the tone curve: delta = TM(c + bloom) − TM(c), added to the anti-aliased colour
          vec3 b = scrub(texture2D(tBloom, min(vUv * uBloomUv, uBloomClamp)).rgb) * uBloomStrength;
          col += aces4(centreHdr + b, uExposure) - aces4(centreHdr, uExposure);
        }
        col = toSRGB(clamp(col, 0.0, 1.0));
        // ordered-ish dither (±0.5 LSB) against banding in the sky and soft effects
        float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) * (uDither / 255.0);
        if (any(isnan(col))) col = vec3(0.0);
        gl_FragColor = vec4(col, 1.0);
      }`);
    this.quad = new FullScreenQuad(this.material);
  }
  setSize() {}
  render(renderer) {
    renderer.setRenderTarget(null);
    this.quad.render(renderer);
  }
}

/**
 * EffectComposer-shaped composer for the v4 chain. `scale` (0.25–1, relative to the allocation) sets the live
 * viewport; changing it never reallocates anything.
 */
export function createComposer4(renderer, scene, camera, { msaa = 0, bloomMips = 3 } = {}) {
  const mkScene = (w, h) => new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, samples: msaa, depthTexture: new THREE.DepthTexture(w, h),
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
  });
  let sceneRT = mkScene(1, 1);
  sceneRT.texture.name = 'scene4';
  const scenePass = new RenderPass(scene, camera);
  const bloomPass = new BloomPass4({ mips: bloomMips });
  const finalPass = new FinalPass4();
  const state = { allocW: 1, allocH: 1, canvasW: 1, canvasH: 1, scale: 1, vw: 1, vh: 1, reallocs: 0 };
  const uvScale = new THREE.Vector2(1, 1), clampV = new THREE.Vector2(1, 1), texel = new THREE.Vector2(1, 1);
  const C = {
    passes: [scenePass, bloomPass, finalPass],
    scenePass, bloomPass, finalPass,
    get renderTarget1() { return sceneRT; }, get renderTarget2() { return sceneRT; },
    get readBuffer() { return sceneRT; }, get writeBuffer() { return sceneRT; },
    uvScale, state,
    get scale() { return state.scale; },
    /** live render viewport {w, h} in drawing-buffer px */
    viewport: { w: 1, h: 1 },
    /**
     * (Re)allocate at the maximum render size: the canvas drawing buffer (cw × ch) × maxScale. Called on boot, on a canvas
     * resize and on a renderScale change only.
     */
    setSize(cw, ch, maxScale = 1) {
      const w = Math.max(1, Math.round(cw * maxScale)), h = Math.max(1, Math.round(ch * maxScale));
      state.canvasW = cw; state.canvasH = ch;
      if (w !== state.allocW || h !== state.allocH) {
        sceneRT.setSize(w, h);               // the DepthTexture is re-created at the new size by three (setupDepthTexture)
        bloomPass.setSize(w, h);
        state.allocW = w; state.allocH = h; state.reallocs++;
      } else if (!bloomPass.bright) bloomPass.setSize(w, h);
      C.setScale(state.scale);
    },
    setPixelRatio() {},
    /** Live viewport fraction of the allocation (dynamic resolution). No allocation, no program change. */
    setScale(s) {
      s = Math.max(0.25, Math.min(1, +s || 1));
      state.scale = s;
      state.vw = Math.max(1, Math.min(state.allocW, Math.round(state.allocW * s)));
      state.vh = Math.max(1, Math.min(state.allocH, Math.round(state.allocH * s)));
      setVp(sceneRT, state.vw, state.vh, uvScale);
      clampV.set((state.vw - 0.5) / state.allocW, (state.vh - 0.5) / state.allocH);
      texel.set(1 / state.allocW, 1 / state.allocH);
      C.viewport.w = state.vw; C.viewport.h = state.vh;
      return s;
    },
    setBloomMips(n) { bloomPass.mips = Math.max(1, Math.min(bloomPass.maxMips, n | 0)); },
    /** bloomOn: settings × governor; strength: final multiplier; sharpen: CAS amount (0 at full size) */
    render(dt = 0) {
      if (scenePass.enabled) scenePass.render(renderer, sceneRT);
      const F = finalPass.uniforms;
      const bloomOn = bloomPass.enabled && C.bloomActive !== false && bloomPass.strength > 0;
      if (bloomOn) {
        bloomPass.render(renderer, sceneRT, uvScale, clampV, texel, state.vw, state.vh);
        const V = bloomPass.vp[1];
        F.tBloom.value = bloomPass.texture; F.uBloomUv.value.copy(V.uv); F.uBloomClamp.value.copy(V.clamp);
        F.uBloomStrength.value = bloomPass.strength * bloomPass.norm * (C.bloomMul ?? 1);
      }
      F.uBloomOn.value = bloomOn ? 1 : 0;
      F.tDiffuse.value = sceneRT.texture;
      F.uUvScale.value.copy(uvScale); F.uClamp.value.copy(clampV); F.uTexel.value.copy(texel);
      F.uExposure.value = renderer.toneMappingExposure;
      // CAS-lite while the render is smaller than the canvas
      const fill = Math.min(state.vw / state.canvasW, state.vh / state.canvasH);
      F.uSharpen.value = fill < 0.995 ? Math.min(1, (1 - fill) * 2.5 + 0.35) : 0;
      if (finalPass.enabled) finalPass.render(renderer);
      return dt;
    },
    bloomActive: true, bloomMul: 1,
    dispose() { sceneRT.dispose(); bloomPass.dispose(); finalPass.material.dispose(); },
    /** materials of the chain (warm-up) */
    materials() { return [bloomPass.brightMat, bloomPass.downMat, bloomPass.upMat, finalPass.material]; },
  };
  return C;
}
