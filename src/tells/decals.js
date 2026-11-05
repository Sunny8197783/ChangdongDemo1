// tells decals (PLAN v4 §5.2, §5.3): ONE program for every decal shape (circle, ring, cone, line, capsule, conecap),
// instanced per family (radial, linear, zone, wave, marker), terrain-conforming in the vertex shader through
// world.heightField (fallback: per-decal 24×24 CPU height grids in a texture, rebuilt only when a decal moves > 0.1 m).
// Drawn in game.render.threatScene after the post chain: toneMapped false, fog off, sRGB output, DoubleSide with
// triangle normals up (the v3 mirrored-plane bug is guarded by T1), lifted 0.06 m.
//
// Layers (bottom → top): dark outer band (max(0.12 m, 3 px), 0.75) · fill (0.16 / strong 0.28; hazard hatch; 3 flat
// chevrons on directional shapes) · region behind the LINEAR time front (0.32) · front line (0.12 m; near-white
// #FFF4F0 in the last perfect window) · rim (max(0.18 m, 3 px | strong 5 px), 0.95; dashed parry, double unblockable;
// lock flash = own hue +35 % value and 1.5× thicker from the lock on) · end: snap to 0.5 fill for 2 frames, fade 0.12 s.
// Soft occlusion: the scene point behind the fragment (sceneDepth → projInv → camWorld) counts as an occluder only when
// it is nearer than the decal and > 1.0 m above the decal plane → 40 % alpha (grass and flat ground never occlude).
import * as THREE from 'three';
import { THREAT, THREAT_LAYERS, THREAT_FRONT, threatColor } from '../core/threat.js';
import { SHAPE_CODE, TELL_CODE, TELL_KINDS, decalQuad, makeShape } from './shapes.js';
import { END } from './timing.js';

export const STRIDE = 24;                 // floats per instance (6 × vec4)
export const GRID_N = 24;                 // fallback CPU grid resolution
export const FAMILIES = {                 // name → {cap, segAcross, segAlong, order}
  radial: { cap: 16, sx: 32, sz: 32, order: 1 },
  linear: { cap: 16, sx: 6, sz: 40, order: 2 },
  zone: { cap: 8, sx: 28, sz: 28, order: 0 },
  wave: { cap: 4, sx: 48, sz: 48, order: 3 },
  marker: { cap: 12, sx: 8, sz: 8, order: 4 },
  ribbon: { cap: 6, sx: 96, sz: 1, order: 5 },     // P1: 0.35 m vertical rising-edge ribbon on AoE rims > 6 m
};
export const RIBBON = { minR: 6, height: 0.35, alpha: 0.55 };
export const ATTACK_POOL = 16;            // §5.2: pool 16 shared by the radial + linear attack decals
/** Style bits (iT.w). */
export const STYLE = { noFront: 4, solid: 8, noChevron: 16, marker: 32 };
/** P1 element glyph in the fill: style += (atlas index + 1) × GLYPH_SHIFT (0 = none). Faint: alpha GLYPH_A, the rim hue 45 % toward the front white. */
export const GLYPH_SHIFT = 64;
const GLYPH_A = '0.2';

const RIBBON_H = '0.35', RIBBON_A = '0.55';
const VERT = /* glsl */`
  attribute vec4 iO;   // origin x, y, z, flat (1 = flat at y)
  attribute vec4 iF;   // forward x, z, along min, along max
  attribute vec4 iS;   // half across, kind, p0, p1
  attribute vec4 iT;   // p2, p3, tell code, style bits
  attribute vec4 iD;   // progress, alpha, lock flash, locked
  attribute vec4 iE;   // perfect fraction, end snap, conecap cone rotation, fallback grid slot
  uniform sampler2D uHF; uniform vec4 uHFInfo; uniform float uUseHF;
  uniform sampler2D uGrid; uniform float uLift;
  varying vec2 vP; varying vec3 vW; varying float vViewZ;
  varying vec4 vS; varying vec4 vT; varying vec4 vD; varying vec4 vE;
  float hfAt(vec2 xz) {
    vec2 g = (xz - uHFInfo.xy) / uHFInfo.z;
    g = clamp(g, vec2(0.0), vec2(uHFInfo.w - 1e-4));
    ivec2 c = ivec2(floor(g)); vec2 f = g - vec2(c);
    float h00 = texelFetch(uHF, c, 0).r;
    float h10 = texelFetch(uHF, c + ivec2(1, 0), 0).r;
    float h01 = texelFetch(uHF, c + ivec2(0, 1), 0).r;
    float h11 = texelFetch(uHF, c + ivec2(1, 1), 0).r;
    if (f.y >= f.x) return h00 + (h11 - h01) * f.x + (h01 - h00) * f.y;
    return h00 + (h10 - h00) * f.x + (h11 - h10) * f.y;
  }
  float gridAt(vec2 uv, float slot) {
    float n = ${GRID_N}.0;
    vec2 g = clamp(uv, 0.0, 1.0) * (n - 1.0);
    ivec2 c = ivec2(min(floor(g), vec2(n - 2.0))); vec2 f = g - vec2(c);
    int row = int(slot + 0.5) * ${GRID_N};
    float a = texelFetch(uGrid, ivec2(c.x, row + c.y), 0).r;
    float b = texelFetch(uGrid, ivec2(c.x + 1, row + c.y), 0).r;
    float d = texelFetch(uGrid, ivec2(c.x, row + c.y + 1), 0).r;
    float e = texelFetch(uGrid, ivec2(c.x + 1, row + c.y + 1), 0).r;
    return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
  }
  void main() {
    vS = iS; vT = iT; vD = iD; vE = iE;
    if (iO.w > 1.5) {                   // ribbon: x = angle around the rim, z = height (grows with the progress)
      float th = (position.x * 0.5 + 0.5) * 6.2831853;
      float hgt = (position.z * 0.5 + 0.5) * ${RIBBON_H} * max(0.25, iD.x);
      vec2 rxz = iO.xz + vec2(sin(th), cos(th)) * iS.z;
      float rh = iO.w > 2.5 ? iO.y : (uUseHF > 0.5 ? hfAt(rxz) : iO.y);
      vec3 rw = vec3(rxz.x, rh + uLift + hgt, rxz.y);
      vP = vec2(position.z * 0.5 + 0.5, 0.0); vW = rw;
      vec4 rmv = viewMatrix * vec4(rw, 1.0); vViewZ = rmv.z;
      gl_Position = projectionMatrix * rmv;
      return;
    }
    float across = position.x * iS.x;
    float along = mix(iF.z, iF.w, position.z * 0.5 + 0.5);
    vec2 F = iF.xy; vec2 R = vec2(F.y, -F.x);
    vec2 xz = iO.xz + R * across + F * along;
    float h;
    if (iO.w > 0.5) h = iO.y;
    else if (uUseHF > 0.5) h = hfAt(xz);
    else h = gridAt(vec2(position.x * 0.5 + 0.5, position.z * 0.5 + 0.5), iE.w);
    vec3 w = vec3(xz.x, h + uLift, xz.y);
    vP = vec2(across, along); vW = w;
    vec4 mv = viewMatrix * vec4(w, 1.0);
    vViewZ = mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */`
  uniform vec3 uRim[8]; uniform vec3 uEdge[8]; uniform vec3 uFill[8]; uniform float uFillA[8];
  uniform vec3 uFrontWhite; uniform float uTime; uniform float uStrong; uniform float uLockGain;
  uniform sampler2D uDepth; uniform float uHasDepth; uniform vec2 uCanvasRes; uniform vec2 uUvScale;
  uniform mat4 uProjInv; uniform mat4 uCamWorld; uniform float uOccMul; uniform float uOccOn; uniform float uLift;
  uniform float uThumb; uniform sampler2D uGlyph; uniform float uGlyphCols;
  varying vec2 vP; varying vec3 vW; varying float vViewZ;
  varying vec4 vS; varying vec4 vT; varying vec4 vD; varying vec4 vE;
  float sdPie(vec2 p, float a, float r) {
    if (a > 3.1) return length(p) - r;
    vec2 c = vec2(sin(a), cos(a));
    p.x = abs(p.x);
    float l = length(p) - r;
    float m = length(p - c * clamp(dot(p, c), 0.0, r));
    return max(l, m * sign(c.y * p.x - c.x * p.y));
  }
  float sdSeg(vec2 p, float L) { return length(p - vec2(0.0, clamp(p.y, 0.0, L))); }
  vec4 over(vec4 acc, vec3 c, float a) { return vec4(c * a + acc.rgb * (1.0 - a), a + acc.a * (1.0 - a)); }
  float band(float x, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa * 0.5, x); }
  void main() {
    int kind = int(vS.y + 0.5);
    int tc = int(vT.z + 0.5);
    if (kind == 6) {                    // rising-edge ribbon: rim hue, fading upward
      vec3 rc = min(uRim[tc] * (1.0 + uLockGain * vD.z), vec3(1.0));
      float ra = (1.0 - vP.x) * ${RIBBON_A} * mix(0.6, 1.0, vD.w) * vD.y;
      if (ra < 0.004) discard;
      gl_FragColor = vec4(rc, ra);
      #include <colorspace_fragment>
      return;
    }
    int st = int(vT.w + 0.5);
    vec2 p = vP;
    vec2 dpx = dFdx(p), dpy = dFdy(p);                  // for the glyph's textureGrad (taken before any divergent branch)
    float mpp = max(length(fwidth(p)) * 0.7071, 1e-4);   // metres per pixel
    float aa = mpp;
    float sd, f, fillLen; bool directional = false;
    float r0 = vS.z, r1 = vS.w;
    float dash = 1.0;
    bool parry = tc == 1;
    if (kind == 0) {                    // circle
      float d = length(p); sd = d - r0; f = d / r0; fillLen = r0;
      if (parry) dash = step(fract(atan(p.x, p.y) / 6.28318 * 12.0), 0.62);
    } else if (kind == 1) {             // ring: outer r0, inner r1
      float d = length(p); sd = max(d - r0, r1 - d); f = (d - r1) / max(0.05, r0 - r1); fillLen = max(0.05, r0 - r1);
      if (parry) dash = step(fract(atan(p.x, p.y) / 6.28318 * 12.0), 0.62);
    } else if (kind == 2) {             // cone: radius r0, half-angle r1
      float d = length(p); sd = sdPie(p, r1, r0); f = d / r0; fillLen = r0; directional = true;
      if (parry) dash = d > r0 - 0.5 ? step(fract(atan(p.x, p.y) / 6.28318 * 12.0), 0.62) : step(fract(d / 1.6), 0.62);
    } else if (kind == 3) {             // line: len r0, half width r1, from the origin along +y
      vec2 q = abs(p - vec2(0.0, r0 * 0.5)) - vec2(r1, r0 * 0.5);
      sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); f = p.y / max(0.05, r0); fillLen = r0; directional = true;
      if (parry) dash = step(fract((abs(p.x) > r1 - 0.4 ? p.y : p.x) / 1.6), 0.62);
    } else if (kind == 4) {             // capsule: segment length r0, half width r1
      sd = sdSeg(p, r0) - r1; f = (p.y + r1) / (r0 + 2.0 * r1); fillLen = r0 + 2.0 * r1; directional = true;
      if (parry) dash = step(fract(p.y / 1.6), 0.62);
    } else {                            // conecap: capsule (r0, r1) + cone (radius vT.x, half-angle vT.y) at the end
      float sc = sdSeg(p, r0) - r1;
      float cr = vE.z; float cs = sin(cr), cc = cos(cr);
      vec2 q = p - vec2(0.0, r0);
      q = vec2(cc * q.x - cs * q.y, cs * q.x + cc * q.y);
      float sk = sdPie(q, vT.y, vT.x);
      sd = min(sc, sk); fillLen = r0 + r1 + vT.x; directional = true;
      f = sk < sc ? (r0 + r1 + length(q)) / fillLen : (p.y + r1) / fillLen;
      if (parry) dash = step(fract(p.y / 1.6), 0.62);
    }
    bool hazard = tc == 5, safe = tc == 6;
    bool solid = (st & ${STYLE.solid}) != 0, marker = (st & ${STYLE.marker}) != 0;
    bool noFront = (st & ${STYLE.noFront}) != 0 || hazard || safe || marker;
    bool chevOn = directional && (st & ${STYLE.noChevron}) == 0 && !hazard && !safe && !solid;
    float wEdge = max(${THREAT_LAYERS.edge.widthM.toFixed(3)}, ${THREAT_LAYERS.edge.minPx.toFixed(1)} * mpp);
    if (sd > wEdge + aa) discard;
    float locked = vD.w, flash = vD.z;
    float rimPx = mix(${THREAT_LAYERS.rim.minPx.toFixed(1)}, ${THREAT_LAYERS.rim.strongPx.toFixed(1)}, uStrong);
    float wRim = max(${THREAT_LAYERS.rim.widthM.toFixed(3)}, rimPx * mpp) * (1.0 + 0.5 * locked);
    if (safe || marker) wRim = max(0.09, 2.0 * mpp) * mix(1.0, 1.6, uStrong);
    vec3 rimCol = uRim[tc], edgeCol = uEdge[tc], fillCol = uFill[tc];
    rimCol = min(rimCol * (1.0 + uLockGain * flash), vec3(1.0));       // lock flash: own hue brighter, never toward white
    float inside = 1.0 - smoothstep(-aa * 0.5, aa * 0.5, sd);
    float edgeM = (1.0 - inside) * band(sd, wEdge, aa);
    float rimM;
    if (tc == 2) {                      // unblockable: double rim
      float t = -sd;
      rimM = inside * max(band(t, wRim * 0.5, aa), (1.0 - band(t, wRim * 0.95, aa)) * band(t, wRim * 1.45, aa));
    } else rimM = inside * band(-sd, wRim, aa) * dash;
    float fA = uFillA[tc] + (uStrong > 0.5 && !safe && !marker ? ${(THREAT_LAYERS.fill.strongAlpha - THREAT_LAYERS.fill.alpha).toFixed(3)} : 0.0);
    float prog = vD.x;
    vec4 acc = vec4(0.0);
    acc = over(acc, edgeCol, edgeM * ${THREAT_LAYERS.edge.alpha.toFixed(2)});
    if (hazard) {
      float h = fract((p.x + p.y) / 0.55 - uTime * 0.12);
      fA = mix(0.05, fA, step(h, 0.42));
    }
    float fillA = fA;
    if (!noFront && f < prog) fillA = max(${THREAT_LAYERS.front.behindAlpha.toFixed(2)}, fA + 0.06);
    if (vE.y > 0.5) fillA = ${THREAT_LAYERS.end.snapFill.toFixed(2)};
    if (solid) fillA = 0.9;
    acc = over(acc, solid ? rimCol : fillCol, inside * fillA);
    int gi = st / ${GLYPH_SHIFT} - 1;
    if (gi >= 0 && !hazard && !safe && !marker && !solid && uGlyphCols > 0.5) {   // P1: faint element glyph in the fill
      vec2 gc = vec2(0.0); float gR = 0.0;
      if (kind == 0) gR = min(r0 * 0.45, 2.0);
      else if (kind == 2) { gc = vec2(0.0, r0 * 0.55); gR = min(min(r0 * 0.24, 1.6), 0.5 * r0 * sin(min(r1, 1.5708))); }
      else if (kind == 3 || kind == 4) { gc = vec2(0.0, r0 * 0.5); gR = min(min(r1 * 0.85, 1.4), r0 * 0.3); }
      if (gR > 0.35) {
        vec2 lq = (p - gc) / (2.0 * gR);
        if (abs(lq.x) < 0.49 && abs(lq.y) < 0.49) {
          float cols = uGlyphCols;
          vec2 cell = vec2(mod(float(gi), cols), floor(float(gi) / cols));
          vec2 guv = (cell + vec2(0.5 + lq.x, 0.5 - lq.y)) / cols;
          float k = 1.0 / (2.0 * gR * cols);
          float sdf = textureGrad(uGlyph, guv, vec2(dpx.x, -dpx.y) * k, vec2(dpy.x, -dpy.y) * k).r;
          float gw = max(mpp * 4.0 / gR, 0.01);
          float gm = smoothstep(0.5 - gw, 0.5 + gw, sdf);
          acc = over(acc, mix(rimCol, uFrontWhite, 0.45), inside * gm * ${GLYPH_A} * (1.0 - 0.5 * vE.y));
        }
      }
    }
    if (chevOn) {
      float sp = fillLen / 3.0;
      float v = f * fillLen - abs(p.x) * 0.55;
      float ph = fract(v / sp - uTime * 0.6);
      float cw = min(0.3, sp * 0.18) / sp;
      float ch = step(ph, cw) * step(0.0, f) * step(f, 1.0);
      acc = over(acc, rimCol, inside * ch * 0.22);
    }
    if (!noFront && prog < 0.999 && vE.y < 0.5) {
      float wF = max(${(THREAT_LAYERS.front.widthM / 2).toFixed(3)}, 1.0 * mpp);
      float fd = abs(f - prog) * fillLen;
      float frontM = inside * band(fd, wF, aa);
      vec3 fc = prog >= vE.x ? uFrontWhite : mix(rimCol, vec3(1.0), 0.4);
      acc = over(acc, fc, frontM * 0.95);
    }
    float rimA = hazard ? ${(THREAT.hazard.rimAlpha ?? 0.5).toFixed(2)} : mix(${THREAT_LAYERS.rim.alpha.toFixed(2)}, 1.0, flash);
    acc = over(acc, rimCol, rimM * rimA);
    if (acc.a < 0.004) discard;
    float occ = 1.0;
    if (uHasDepth > 0.5 && uOccOn > 0.5 && uThumb < 0.5) {
      vec2 suv = gl_FragCoord.xy / uCanvasRes;
      float d = texture2D(uDepth, suv * uUvScale).x;
      if (d < 0.99999) {
        vec4 v = uProjInv * vec4(suv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w;
        if (-v.z < -vViewZ - 0.3) {
          vec3 sw = (uCamWorld * vec4(v.xyz, 1.0)).xyz;
          if (sw.y - (vW.y - uLift) > ${THREAT_LAYERS.occluderMinHeight.toFixed(2)}) occ = uOccMul;
        }
      }
    }
    gl_FragColor = vec4(acc.rgb / max(acc.a, 1e-4), acc.a * vD.y * occ);
    #include <colorspace_fragment>
  }`;


/**
 * addUpdateRange(0, count) without a fresh range object per frame (r160 pushes a new {start, count} each call; three
 * clears the list after the upload, so one reused record is equivalent and allocation-free).
 */
export function setRange(buf, range, count) {
  range.start = 0; range.count = count;
  const R = buf.updateRanges;
  if (R) { R.length = 0; R[0] = range; } else buf.addUpdateRange(0, count);
}

let _blank = null;
function blankGlyph() {   // 1×1 R8 zero texture: the sampler is always bound (one program with or without the kit atlas)
  if (!_blank) { _blank = new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat, THREE.UnsignedByteType); _blank.needsUpdate = true; }
  return _blank;
}

function gridGeometry(sx, sz) {
  const g = new THREE.PlaneGeometry(2, 2, sx, sz);
  g.rotateX(-Math.PI / 2);                    // normals +y; (x, z) in [−1, 1]
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  return g;
}

export function createDecals(game) {
  const root = new THREE.Group(); root.name = 'tells-decals';
  root.matrixAutoUpdate = false;
  const HF = game.world?.heightField || null;
  const useHF = !!(HF && HF.tex && HF.origin && HF.texel);
  const P = game.post || {};
  const uni = (v) => ({ value: v });
  const totalSlots = Object.values(FAMILIES).reduce((a, f) => a + f.cap, 0);
  // fallback height grids (only when world.heightField is absent)
  let gridTex = null, gridData = null;
  if (!useHF) {
    gridData = new Float32Array(GRID_N * GRID_N * totalSlots);
    gridTex = new THREE.DataTexture(gridData, GRID_N, GRID_N * totalSlots, THREE.RedFormat, THREE.FloatType);
    gridTex.needsUpdate = true;
  } else {
    gridTex = new THREE.DataTexture(new Float32Array(1), 1, 1, THREE.RedFormat, THREE.FloatType); gridTex.needsUpdate = true;
  }
  const res = HF?.res ? (HF.res.x ?? HF.res) : (HF?.tex?.image?.width || 1);
  const uniforms = {
    uHF: uni(useHF ? HF.tex : gridTex), uHFInfo: uni(new THREE.Vector4(HF?.origin?.x || 0, HF?.origin?.z || 0, HF?.texel || 1, (res || 1) - 1)),
    uUseHF: uni(useHF ? 1 : 0), uGrid: uni(gridTex), uLift: uni(THREAT_LAYERS.lift),
    uRim: uni([]), uEdge: uni([]), uFill: uni([]), uFillA: uni([]),
    uFrontWhite: uni(new THREE.Color(THREAT_FRONT.perfect)), uTime: uni(0), uStrong: uni(0), uLockGain: uni(THREAT_FRONT.lockValueGain),
    uDepth: P.sceneDepth || uni(null), uHasDepth: uni(0), uCanvasRes: P.canvasRes || uni(new THREE.Vector2(1, 1)), uUvScale: P.uvScale || uni(new THREE.Vector2(1, 1)),
    uProjInv: P.projInv || uni(new THREE.Matrix4()), uCamWorld: P.camWorld || uni(new THREE.Matrix4()),
    uOccMul: uni(THREAT_LAYERS.occludedAlpha), uOccOn: uni(1), uThumb: uni(0),
    uGlyph: uni(blankGlyph()), uGlyphCols: uni(0),
  };
  for (let i = 0; i < 8; i++) { uniforms.uRim.value.push(new THREE.Color()); uniforms.uEdge.value.push(new THREE.Color()); uniforms.uFill.value.push(new THREE.Color()); uniforms.uFillA.value.push(0.16); }
  let paletteKey = null;
  function setPalette(cb) {
    const key = cb || 'off';
    if (key === paletteKey) return false;
    paletteKey = key;
    for (let i = 0; i < 8; i++) {
      const c = threatColor(TELL_KINDS[i], cb);
      uniforms.uRim.value[i].setHex(c.rim);
      uniforms.uEdge.value[i].setHex(c.edge);
      uniforms.uFill.value[i].setHex(c.fill ?? c.rim);
      uniforms.uFillA.value[i] = c.fill == null ? 0.0 : (TELL_KINDS[i] === 'safe' ? 0.12 : TELL_KINDS[i] === 'hazard' ? 0.18 : (c.fillAlpha ?? 0.16));
    }
    return true;
  }
  setPalette(game.assist?.colorblind || null);
  const material = new THREE.ShaderMaterial({
    name: 'tells-decal', uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
    extensions: { derivatives: true },
  });

  // ---- families
  const fams = {};
  let slot = 0;
  for (const [name, F] of Object.entries(FAMILIES)) {
    const base = gridGeometry(F.sx, F.sz);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.attributes.position);
    const arr = new Float32Array(F.cap * STRIDE);
    const ib = new THREE.InstancedInterleavedBuffer(arr, STRIDE, 1);
    ib.setUsage(THREE.DynamicDrawUsage);
    const names = ['iO', 'iF', 'iS', 'iT', 'iD', 'iE'];
    names.forEach((n, k) => geo.setAttribute(n, new THREE.InterleavedBufferAttribute(ib, 4, k * 4)));
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = 'tells-decal-' + name; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.renderOrder = F.order;
    mesh.visible = false;
    root.add(mesh);
    const recs = [];
    for (let i = 0; i < F.cap; i++) recs.push(makeRec(name, slot++));
    fams[name] = { name, F, geo, ib, arr, mesh, recs, live: 0, range: { start: 0, count: 0 } };
  }
  root.updateMatrixWorld(true);
  const famList = Object.keys(fams);

  function makeRec(fam, gslot) {
    return { fam, slot: gslot, active: false, S: makeShape(), q: { ox: 0, oz: 0, fx: 0, fz: 1, aMin: 0, aMax: 0, half: 0, p0: 0, p1: 0, p2: 0, p3: 0, coneRot: 0, fillLen: 1 },
      oy: 0, flat: 0, tell: 0, style: 0, mode: 'tell', clock: 'enemy', start: 0, dur: 1, lockAt: 0.35, perfectFrac: 2, alpha: 1,
      endAt: -1, endFrames: 0, fadeT: 0, fading: false, killAt: Infinity, fadeIn: 0, born: 0, owner: null, visible: true,
      gx: NaN, gz: NaN, gfx: 0, gfz: 0, gw: 0, progOverride: -1, onFree: null, serial: 0 };
  }
  let serial = 0;
  const warned = {};
  function alloc(famName) {
    const fam = fams[famName]; if (!fam) return null;
    if (famName === 'radial' || famName === 'linear') {
      let n = 0;
      for (const r of fams.radial.recs) if (r.active) n++;
      for (const r of fams.linear.recs) if (r.active) n++;
      if (n >= ATTACK_POOL) { if (!warned.pool) { warned.pool = true; console.warn('[tells] decal pool full (16): new decal skipped, the attack is still timed'); } return null; }
    }
    for (const r of fam.recs) {
      if (!r.active) {
        r.active = true; r.fading = false; r.endAt = -1; r.endFrames = 0; r.fadeT = 0; r.alpha = 1; r.killAt = Infinity; r.progOverride = -1;
        r.style = 0; r.tell = 0; r.mode = 'tell'; r.clock = 'enemy'; r.owner = null; r.visible = true; r.onFree = null; r.perfectFrac = 2;
        r.gx = NaN; r.serial = ++serial; r.fadeIn = 0;
        return r;
      }
    }
    if (!warned[famName]) { warned[famName] = true; console.warn(`[tells] ${famName} pool full: skipped`); }
    return null;
  }
  function free(r) {
    if (!r || !r.active) return;
    r.active = false; r.owner = null;
    const cb = r.onFree; r.onFree = null;
    if (cb) { try { cb(r); } catch (err) { console.error('[tells] decal onFree', err); } }
  }
  /** Begin the end animation (snap = the 2-frame 0.5 fill of a completed tell; else a plain fade). */
  function end(r, snap = true) {
    if (!r || !r.active || r.fading) return;
    r.fading = true; r.endFrames = snap ? 0 : 99; r.fadeT = 0;
  }
  const gh = (x, z) => { const W = game.world; try { return W?.getHeight ? W.getHeight(x, z) : 0; } catch (_) { return 0; } };
  /** Recompute the quad of a record from its shape record r.S (call after changing r.S). */
  function layout(r) {
    decalQuad(r.S, r.q);
    const ground = gh(r.S.px, r.S.pz);
    r.flat = r.S.py > ground + 1.0 ? 1 : 0;
    r.oy = r.flat ? r.S.py : ground;
    if (!useHF && !r.flat) rebuildGrid(r);
  }
  let gridDirty = false;
  function rebuildGrid(r) {
    const q = r.q;
    if (Math.abs(q.ox - r.gx) <= 0.1 && Math.abs(q.oz - r.gz) <= 0.1 && Math.abs(q.fx - r.gfx) < 0.01 && Math.abs(q.fz - r.gfz) < 0.01 && Math.abs(q.aMax - q.aMin + q.half - r.gw) < 0.05) return;
    r.gx = q.ox; r.gz = q.oz; r.gfx = q.fx; r.gfz = q.fz; r.gw = q.aMax - q.aMin + q.half;
    const Rx = q.fz, Rz = -q.fx, row0 = r.slot * GRID_N * GRID_N;
    for (let j = 0; j < GRID_N; j++) {
      const along = q.aMin + (q.aMax - q.aMin) * (j / (GRID_N - 1));
      for (let i = 0; i < GRID_N; i++) {
        const across = (i / (GRID_N - 1) * 2 - 1) * q.half;
        gridData[row0 + j * GRID_N + i] = gh(q.ox + Rx * across + q.fx * along, q.oz + Rz * across + q.fz * along);
      }
    }
    gridDirty = true;
  }

  /** Per-frame pack + upload (once per frame). tE = enemyTime, tG = game.time, tR = realTime, dtR = real dt. */
  function frame(tE, tG, tR, dtR, perfectMul) {
    uniforms.uTime.value = tR;
    uniforms.uHasDepth.value = P.sceneDepth?.value ? 1 : 0;
    for (let fi = 0; fi < famList.length; fi++) {
      const name = famList[fi];
      const fam = fams[name], A = fam.arr;
      let n = 0;
      for (let i = 0; i < fam.recs.length; i++) {
        const r = fam.recs[i];
        if (!r.active) continue;
        const now = r.clock === 'game' ? tG : tE;
        let prog = r.progOverride >= 0 ? r.progOverride : (r.dur > 0 ? (now - r.start) / r.dur : 1);
        if (prog > 1) prog = 1; else if (prog < 0) prog = 0;
        if (r.mode === 'tell' && prog >= 1 && !r.fading) { r.fading = true; r.endFrames = 0; r.fadeT = 0; }
        // alpha
        let alpha = r.alpha, snap = 0;
        if (r.fadeIn > 0) { const k = (now - r.start) / r.fadeIn; if (k < 1) alpha *= k < 0 ? 0 : k; }
        if (r.fading) {
          if (r.endFrames < 2) { snap = 1; r.endFrames++; }
          else { r.fadeT += dtR; const k = 1 - r.fadeT / END.fade; alpha *= k > 0 ? k : 0; if (k <= 0) { free(r); continue; } }
        }
        if (!r.visible) continue;
        const lockT = r.start + r.dur - r.lockAt;
        const locked = r.mode === 'tell' && now >= lockT ? 1 : 0;
        let flash = 0;
        if (locked) { const k = (now - lockT) / THREAT_FRONT.lockFlashSec; flash = k < 1 ? 1 - k : 0; }
        const q = r.q, b = n * STRIDE;
        A[b] = q.ox; A[b + 1] = r.oy; A[b + 2] = q.oz; A[b + 3] = name === 'ribbon' ? 2 + (r.flat || !useHF ? 1 : 0) : r.flat;
        A[b + 4] = q.fx; A[b + 5] = q.fz; A[b + 6] = q.aMin; A[b + 7] = q.aMax;
        A[b + 8] = q.half; A[b + 9] = name === 'ribbon' ? 6 : SHAPE_CODE[r.S.kind]; A[b + 10] = q.p0; A[b + 11] = q.p1;
        A[b + 12] = q.p2; A[b + 13] = q.p3; A[b + 14] = r.tell; A[b + 15] = r.style;
        A[b + 16] = prog; A[b + 17] = alpha; A[b + 18] = flash; A[b + 19] = locked;
        A[b + 20] = r.mode === 'tell' ? r.perfectFrac : 2; A[b + 21] = snap; A[b + 22] = q.coneRot; A[b + 23] = r.slot;
        n++;
      }
      fam.live = n;
      fam.geo.instanceCount = n;
      fam.mesh.visible = n > 0;
      if (n > 0) { setRange(fam.ib, fam.range, n * STRIDE); fam.ib.needsUpdate = true; }
    }
    if (gridDirty) { gridTex.needsUpdate = true; gridDirty = false; }
    void perfectMul;
  }
  function count(famNames) {
    let n = 0;
    for (const name of famNames || Object.keys(fams)) for (const r of fams[name].recs) if (r.active) n++;
    return n;
  }
  /** JS replica of the vertex-shader height lookup (T1 conformance check). */
  function heightAt(x, z) {
    if (!useHF) return gh(x, z);
    const U = uniforms.uHFInfo.value, data = HF.tex.image.data, W = HF.tex.image.width;
    let gx = (x - U.x) / U.z, gz = (z - U.y) / U.z;
    const mx = U.w - 1e-4; gx = Math.max(0, Math.min(mx, gx)); gz = Math.max(0, Math.min(mx, gz));
    const cx = Math.floor(gx), cz = Math.floor(gz), fx = gx - cx, fz = gz - cz;
    const t = (i, j) => data[(cz + j) * W + (cx + i)];
    const h00 = t(0, 0), h10 = t(1, 0), h01 = t(0, 1), h11 = t(1, 1);
    if (fz >= fx) return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
    return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
  }
  /** P1 glyph atlas (vfx kit `GL`): bind it once; returns true when glyphs can be drawn. */
  function setGlyphAtlas(tex, cols) {
    if (!tex || !(cols > 0)) return false;
    uniforms.uGlyph.value = tex; uniforms.uGlyphCols.value = cols;
    return true;
  }
  return { root, material, uniforms, fams, alloc, free, end, layout, frame, setPalette, count, heightAt, useHF, TELL_CODE, setGlyphAtlas };
}
