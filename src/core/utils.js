import * as THREE from 'three';

export const ELEMENT_COLORS = {
  fire: 0xff6a1f, ice: 0x7fe3ff, lightning: 0xc9a4ff, wind: 0x8fffc1, earth: 0xe0a85a, physical: 0xffffff,
};
export const ELEMENT_NAMES_KO = {
  fire: '화염', ice: '냉기', lightning: '번개', wind: '바람', earth: '대지', physical: '물리',
};
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
  return m;
}

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
