// Geometry helpers: vertex-coloured part merging, instanced outlines, instanced prefabs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMat } from '../core/utils.js';
import { hash2 } from './noise.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Clean a geometry to position/normal/color (non-indexed) with a colour (hex, Color or fn(x,y,z,c)). */
export function part(geo, color, matrix, opts = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (opts.jitter) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const hx = Math.round(x * 1000), hy = Math.round(y * 1000), hz = Math.round(z * 1000);
      const j = opts.jitter;
      p.setXYZ(i, x + (hash2(hx, hy + hz, 1) - 0.5) * j, y + (hash2(hy, hz + hx, 2) - 0.5) * j, z + (hash2(hz, hx + hy, 3) - 0.5) * j);
    }
    if (!opts.keepNormals) smoothNormals(g);
  }
  if (matrix && !opts.localColor) g.applyMatrix4(matrix);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  const pos = g.attributes.position;
  for (let i = 0; i < n; i++) {
    if (typeof color === 'function') color(pos.getX(i), pos.getY(i), pos.getZ(i), c, i);
    else c.set(color);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (matrix && opts.localColor) g.applyMatrix4(matrix);
  return g;
}

/** Recompute normals averaged by position (smooth across duplicated verts). */
export function smoothNormals(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, nrm = g.attributes.normal;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i) * 1e3)},${Math.round(p.getY(i) * 1e3)},${Math.round(p.getZ(i) * 1e3)}`;
    let a = map.get(key); if (!a) { a = [0, 0, 0, []]; map.set(key, a); }
    a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i); a[3].push(i);
  }
  for (const a of map.values()) {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    for (const i of a[3]) nrm.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
  }
  nrm.needsUpdate = true;
}

export function merge(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  return g;
}

// ---- BotW-style see-through: props between the camera and the hero dither away (screen-door discard)
export const OCC = { uOccA: { value: new THREE.Vector3(0, -999, 0) }, uOccB: { value: new THREE.Vector3(0, -999, 1) }, uOccR: { value: 1.3 } };
const OCC_PARS_V = 'varying vec3 vOccW;';
const OCC_V = `{ vec4 occW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  occW = instanceMatrix * occW;
  #endif
  vOccW = (modelMatrix * occW).xyz; }`;
const OCC_PARS_F = 'varying vec3 vOccW; uniform vec3 uOccA; uniform vec3 uOccB; uniform float uOccR;';
const OCC_F = `{ vec3 ab = uOccB - uOccA; float h = clamp(dot(vOccW - uOccA, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  float od = length(vOccW - uOccA - ab * h);
  float f = (1.0 - smoothstep(uOccR * 0.55, uOccR, od)) * (1.0 - smoothstep(0.88, 0.98, h));
  if (f > 0.0) { float dth = fract(dot(floor(gl_FragCoord.xy), vec2(0.5, 0.25))); if (dth < f * 0.8) discard; } }`;
/** Make a (toon) material fade out where it sits between the camera and the player. Chains existing onBeforeCompile. */
export function occludable(mat) {
  if (!mat || mat.userData.occ) return mat;
  mat.userData.occ = true;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    Object.assign(sh.uniforms, OCC);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + OCC_PARS_V).replace('#include <project_vertex>', '#include <project_vertex>\n' + OCC_V);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + OCC_PARS_F).replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + OCC_F);
  };
  mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|occ'; };
  return mat;
}

export const SWAY_GLSL = /* glsl */`
  vec3 swayOffset(vec3 p, mat4 im){
    float h = max(0.0, p.y - 1.4);
    vec3 wp = im[3].xyz;
    float s = sin(uTime * 1.3 + wp.x * 0.13 + wp.z * 0.09) * 0.7 + sin(uTime * 2.9 + wp.z * 0.31 + p.x) * 0.3;
    return vec3(0.8, 0.0, -0.6) * (s + 0.6) * h * h * 0.0045;
  }`;

const outlineMats = new Map();
/** Outline material supporting both instanced and non-instanced meshes. */
export function outlineMat(thickness = 0.04, color = 0x1a1410, sway = null) {
  const key = thickness + ':' + color + (sway ? ':sway' : '');
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { thickness: { value: thickness }, color: { value: new THREE.Color(color) } }]), sway ? { uTime: sway } : {}, OCC),
    defines: sway ? { SWAY: 1 } : {},
    vertexShader: /* glsl */`
      uniform float thickness;
      #include <common>
      #include <fog_pars_vertex>
      #ifdef SWAY
      uniform float uTime;
      ${SWAY_GLSL}
      #endif
      ${OCC_PARS_V}
      void main(){
        vec3 p = position + normalize(normal) * thickness;
        vec4 mvPosition = vec4(p, 1.0);
        #ifdef USE_INSTANCING
          #ifdef SWAY
          mvPosition.xyz += swayOffset(position, instanceMatrix);
          #endif
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vOccW = (modelMatrix * mvPosition).xyz;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      #include <common>
      #include <fog_pars_fragment>
      ${OCC_PARS_F}
      void main(){ ${OCC_F} gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.BackSide, fog: true,
  });
  outlineMats.set(key, m);
  return m;
}

/** Static merged mesh + outline added to parent. */
export function staticMesh(parent, geo, { outline = 0.04, outlineColor = 0x1a1410, cast = true, receive = true, material } = {}) {
  const mat = occludable(material || toonMat(0xffffff, { vertexColors: true }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = cast; mesh.receiveShadow = receive;
  if (outline) {
    const o = new THREE.Mesh(geo, outlineMat(outline, outlineColor));
    o.raycast = () => {};
    mesh.add(o);
  }
  parent.add(mesh);
  return mesh;
}

/** Instanced mesh with optional instanced outline; matrices: Matrix4[] ; colors optional Color[]. */
export function instanced(parent, geo, matrices, { material, outline = 0.04, outlineColor = 0x1a1410, colors, cast = true, receive = true, sway = null } = {}) {
  const mat = occludable(material || toonMat(0xffffff, { vertexColors: true }));
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
  for (let i = 0; i < matrices.length; i++) {
    mesh.setMatrixAt(i, matrices[i]);
    if (colors) mesh.setColorAt(i, colors[i]);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = cast; mesh.receiveShadow = receive;
  mesh.computeBoundingSphere();
  parent.add(mesh);
  if (outline) {
    const o = new THREE.InstancedMesh(geo, outlineMat(outline, outlineColor, sway), matrices.length);
    o.instanceMatrix = mesh.instanceMatrix;
    o.boundingSphere = mesh.boundingSphere;
    o.raycast = () => {};
    o.castShadow = false; o.receiveShadow = false;
    parent.add(o);
    mesh.userData.outline = o;
  }
  return mesh;
}
