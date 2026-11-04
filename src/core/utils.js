import * as THREE from 'three';
import { ELEMENT_DEFS, PSEUDO_ELEMENTS } from './elements.js';

// Legacy element maps (v1/v2 code). v4: every element colour comes from the elements.js ramps (PLAN §3.2); the new elements and the pseudo
// elements are explicit keys, and any unknown key falls back to 'physical' (v4 ramp mid / '물리') instead of undefined.
// New code uses elColor / elName from elements.js (ELEMENT_NAMES_KO.ice stays '냉기' for legacy strings).
const withFallback = (obj) => new Proxy(obj, {
  get(t, k) { return (typeof k === 'string' && !(k in t)) ? t.physical : t[k]; },
});
export const ELEMENT_COLORS = withFallback({
  fire: ELEMENT_DEFS.fire.colors.hex, ice: ELEMENT_DEFS.ice.colors.hex, lightning: ELEMENT_DEFS.lightning.colors.hex,
  wind: ELEMENT_DEFS.wind.colors.hex, earth: ELEMENT_DEFS.earth.colors.hex,
  water: ELEMENT_DEFS.water.colors.hex, nature: ELEMENT_DEFS.nature.colors.hex, light: ELEMENT_DEFS.light.colors.hex,
  shadow: ELEMENT_DEFS.shadow.colors.hex, physical: PSEUDO_ELEMENTS.physical.hex, void: PSEUDO_ELEMENTS.void.hex,
});
export const ELEMENT_NAMES_KO = withFallback({
  fire: '화염', ice: '냉기', lightning: '번개', wind: '바람', earth: '대지',
  water: '물', nature: '자연', light: '빛', shadow: '그림자', physical: '물리', void: '공허',
});
/** LEGACY: the 5 classic elements (never 9). v3 code iterates ALL_ELEMENTS from elements.js. */
export const ELEMENTS = ['fire', 'ice', 'lightning', 'wind', 'earth'];

const gradientMaps = new Map();
/** Shared toon ramp texture. */
export function getGradientMap(steps = 3) {
  if (gradientMaps.has(steps)) return gradientMaps.get(steps);
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    // Slightly lifted shadows for the soft BotW look.
    const v = Math.round(255 * (0.42 + 0.58 * (i / (steps - 1))));
    data.set([v, v, v, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  gradientMaps.set(steps, tex);
  return tex;
}

/** Cel-shaded material. */
export function toonMat(color = 0xffffff, opts = {}) {
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: getGradientMap(opts.steps || 3),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: !!opts.vertexColors,
    map: opts.map || null,
  });
  if (opts.flatShading) m.flatShading = true;
  if (opts.rim !== false) { m.onBeforeCompile = toonRim; m.customProgramCacheKey = toonRimKey; }
  return m;
}

// ---- toon dissolve chunk (CONTRACT §3.3). Every toon material (toonRim) carries `uDissolve` (−1 = off, a uniform
// branch only) and `uDissolveColor` from boot, so dissolving never compiles. vfx.dissolve clones a material once
// (same program key) and animates the CLONE's uniforms via dissolveUniforms(clone). Shared materials are never dissolved.
const DIS_PARS_V = 'varying vec3 vDisW;';
const DIS_V = `{ vec4 disP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    disP = instanceMatrix * disP;
  #endif
  vDisW = (modelMatrix * disP).xyz; }`;
const DIS_PARS_F = `varying vec3 vDisW; uniform float uDissolve; uniform vec3 uDissolveColor;
  float disHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float disNoise(vec3 x) { vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(disHash(i), disHash(i + vec3(1,0,0)), f.x), mix(disHash(i + vec3(0,1,0)), disHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(disHash(i + vec3(0,0,1)), disHash(i + vec3(1,0,1)), f.x), mix(disHash(i + vec3(0,1,1)), disHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
const DIS_F = `float disEdge = 0.0;
  if (uDissolve >= 0.0) {
    float dn = disNoise(vDisW * 2.3) * 0.65 + disNoise(vDisW * 6.1) * 0.35;
    if (dn < uDissolve) discard;
    disEdge = 1.0 - smoothstep(0.0, 0.07, dn - uDissolve);
  }`;
/** Per-material dissolve uniforms (created lazily, shared with the compiled program of THIS material). */
export function dissolveUniforms(mat) {
  if (!mat) return null;
  if (!mat._dis) mat._dis = { uDissolve: { value: -1 }, uDissolveColor: { value: new THREE.Color(0x9a5cff) } };
  return mat._dis;
}
// Cheap fresnel rim for the bright BotW-style silhouette edge (keeps the surface's own hue) + the dissolve chunk.
function toonRim(sh) {
  const u = dissolveUniforms(this);
  if (u) { sh.uniforms.uDissolve = u.uDissolve; sh.uniforms.uDissolveColor = u.uDissolveColor; }
  else { sh.uniforms.uDissolve = { value: -1 }; sh.uniforms.uDissolveColor = { value: new THREE.Color() }; }
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + DIS_PARS_V)
    .replace('#include <project_vertex>', DIS_V + '\n#include <project_vertex>');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\n' + DIS_PARS_F)
    .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + DIS_F)
    .replace('#include <opaque_fragment>', `
    { float rimK = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
      outgoingLight += rimK * 0.3 * diffuseColor.rgb * vec3(1.0, 0.96, 0.88);
      outgoingLight += uDissolveColor * disEdge * 4.0; }
    #include <opaque_fragment>`);
}
function toonRimKey() { return 'toonRim+dis'; }
export { toonRim as toonRimCompile, toonRimKey };

const outlineMats = new Map();
function outlineMaterial(thickness, color) {
  const key = thickness.toFixed(4) + ':' + color;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { thickness: { value: thickness }, color: { value: new THREE.Color(color) } },
  ]);
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform float thickness;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position + normalize(normal) * thickness;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
  });
  outlineMats.set(key, m);
  return m;
}

/** Inverted-hull outline; added as a child of mesh. */
export function addOutline(mesh, thickness = 0.03, color = 0x1a1410) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness, color));
  o.name = 'outline';
  o.castShadow = false; o.receiveShadow = false;
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const angleDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
export const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const _pool = Array.from({ length: 32 }, () => new THREE.Vector3());
/** Scratch vector i (0..31). Don't hold across calls into other modules. */
export const tmpV = (i = 0) => _pool[i & 31];
