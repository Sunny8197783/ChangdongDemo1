// Shared status-visual assets owned by combat (CONTRACT rule 7: combat must not statically import spells/*).
// Same shader sources as the spell assets, so three reuses the compiled programs (no extra compiles).
import * as THREE from 'three';
import { toonMat, addOutline } from '../core/utils.js';

const cache = new Map();
const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

/** Time uniform for the status shaders (advanced by statusfx.update). */
export const uTime = { value: 0 };

export function fresnelMat(color, { power = 2.2, intensity = 1.1, core = 0.1, opacity = 1 } = {}) {
  intensity = Math.min(1.2, intensity);   // v4 rule 5: no emissive multiplier > 1.2
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) }, power: { value: power },
      intensity: { value: intensity }, core: { value: core }, opacity: { value: opacity }, time: uTime,
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float power, intensity, core, opacity;
      varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), power);
        float a = clamp(f + core, 0.0, 1.0) * opacity;
        gl_FragColor = vec4(color * intensity * a, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

export function flameMat() {
  return once('flameMat', () => new THREE.ShaderMaterial({
    uniforms: { time: uTime, uHoly: { value: 0 } },
    vertexShader: /* glsl */`
      uniform float time; varying vec2 vUv; varying float vPhase;
      void main(){
        vUv = uv;
        vec3 p = position;
        #ifdef USE_INSTANCING
          vec4 wp0 = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
          vPhase = wp0.x * 3.1 + wp0.z * 1.7;
        #else
          vPhase = 0.0;
        #endif
        float w = uv.y * uv.y;
        p.x += sin(time * 9.0 + uv.y * 5.0 + vPhase) * 0.18 * w;
        p.z += cos(time * 7.0 + uv.y * 4.0 + vPhase) * 0.14 * w;
        vec4 lp = vec4(p,1.0);
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * lp;
      }`,
    fragmentShader: /* glsl */`
      uniform float time; varying vec2 vUv; varying float vPhase;
      void main(){
        float y = vUv.y;
        // v4 burning re-ramp (PLAN §3.8): base fire.light → body fire.mid → tip fire.dark at alpha 0.6; ×1.0 intensity, no white
        vec3 c = mix(vec3(1.0, 0.647, 0.227), vec3(0.941, 0.4, 0.102), smoothstep(0.08, 0.5, y));
        c = mix(c, vec3(0.478, 0.118, 0.039), smoothstep(0.5, 0.95, y));
        float flick = 0.85 + 0.15*sin(time*23.0 + vPhase*3.0 + y*8.0);
        float a = mix(0.9, 0.6, smoothstep(0.0, 0.85, y)) * (1.0 - smoothstep(0.9, 1.0, y)) * flick;
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
}
/** Tinted flame tongue (holy white-gold / necro violet): same lathe, colour from uniforms; instancing-ready. */
export function tintFlameMat(core, edge) {
  return new THREE.ShaderMaterial({
    uniforms: { time: uTime, uCore: { value: new THREE.Color(core) }, uEdge: { value: new THREE.Color(edge) } },
    vertexShader: /* glsl */`
      uniform float time; varying vec2 vUv; varying float vPhase;
      void main(){
        vUv = uv; vec3 p = position; float w = uv.y * uv.y;
        #ifdef USE_INSTANCING
          vec4 wp0 = instanceMatrix * vec4(0.0,0.0,0.0,1.0); vPhase = wp0.x * 3.1 + wp0.z * 1.7;
        #else
          vPhase = 0.0;
        #endif
        p.x += sin(time * 8.0 + uv.y * 5.0 + vPhase) * 0.16 * w; p.z += cos(time * 6.5 + uv.y * 4.0 + vPhase) * 0.12 * w;
        vec4 lp = vec4(p, 1.0);
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * lp;
      }`,
    fragmentShader: /* glsl */`
      uniform float time; uniform vec3 uCore, uEdge; varying vec2 vUv; varying float vPhase;
      void main(){
        float y = vUv.y;
        vec3 c = mix(uCore, uEdge, smoothstep(0.1, 0.85, y));
        float a = (1.0 - smoothstep(0.55, 1.0, y)) * (0.8 + 0.2 * sin(time * 21.0 + y * 9.0 + vPhase * 3.0));
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}
/** Instanced fresnel shell: per-instance colour (× intensity baked in) via instanceColor. */
export function shellMat() {
  return new THREE.ShaderMaterial({
    uniforms: { power: { value: 1.8 }, core: { value: 0.05 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vCol;
      void main(){
        vec4 lp = vec4(position, 1.0); vec3 n = normal;
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp; n = mat3(instanceMatrix) * n;
        #endif
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        vec4 mv = modelViewMatrix * lp;
        vN = normalize(normalMatrix * n); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float power, core; varying vec3 vN; varying vec3 vV; varying vec3 vCol;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), power);
        float a = clamp(f + core, 0.0, 1.0);
        gl_FragColor = vec4(vCol * a, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}
/** Instanced inverted-hull outline (same technique as vfx/debris.js). */
export function instOutlineMat(color = 0x1a1410, thickness = 0.04) {
  return new THREE.ShaderMaterial({
    uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */`
      uniform float thickness;
      void main() {
        vec3 p = position + normalize(normal) * thickness;
        vec4 lp = vec4(p, 1.0);
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * lp;
      }`,
    fragmentShader: /* glsl */`uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }`,
    side: THREE.BackSide,
  });
}

export function flameGeo() {
  return once('flameGeo', () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const r = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (1 - t) * 0.5 + 0.02 * (1 - t);
      pts.push(new THREE.Vector2(r, t * 1.6));
    }
    return new THREE.LatheGeometry(pts, 8);
  });
}
export function crystalGeo() {
  return once('crystalGeo', () => {
    const g = new THREE.OctahedronGeometry(0.5, 0);
    g.scale(0.55, 1.6, 0.55);
    g.translate(0, 0.8, 0);
    return g;
  });
}
export function iceMat() {
  return once('iceMat', () => toonMat(0xaef0ff, { emissive: 0x2a8fbf, emissiveIntensity: 0.55, transparent: true, opacity: 0.78 }));
}
export function rockMat() {
  return once('rockMatEnc', () => toonMat(0xb08a5e, { flatShading: true, emissive: 0x3a2412, emissiveIntensity: 0.3 }));
}
export function starGeo() {
  return once('starGeo', () => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.07 : 0.17;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
    g.center();
    return g;
  });
}
/** Small faceted shard chips (encrusted rock armour). */
export function chipGeo() {
  return once('chipGeo', () => { const g = new THREE.DodecahedronGeometry(0.22, 0); g.scale(1, 0.7, 1); return g; });
}
/** Vine ring (rooted): a thin twisted torus. */
export function vineGeo() {
  return once('vineGeo', () => {
    const g = new THREE.TorusGeometry(1, 0.06, 5, 28);
    g.rotateX(Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, p.getY(i) + Math.sin(a * 5) * 0.08); }
    g.computeVertexNormals();
    return g;
  });
}
export { toonMat, addOutline };
