// v4 regular-enemy model kit (PLAN v4 §4.0, §7.4.6). Owned by mobmodels.
//
//   defineType(def)  → a cached per-type build: ONE indexed skinned geometry holding [body | LOD] index ranges, a glow geometry,
//                      a silhouette-only outline proxy, shared bone inverses. Built once per type (boot / requestIdleCallback),
//                      shared by every instance; instances clone only the bone hierarchy + Skeleton (spawn ≤ 1 ms).
//   instantiate(T, opts) → EnemyModel (§4.0 contract) incl. the v3 pivot names (rig, spine, neck, armR, …) so v3 pose code keeps working.
//
// Draw calls per mob: body (toon, vertex colours) + glow (unlit) + outline proxy (inverted hull) = 3; beyond the LOD distance the body
// mesh draws its LOD index range and the proxy hides (2). Shadow: the body mesh draws ONLY its LOD range in the shadow pass
// (onBeforeShadow), so accessories, springs, glow and eyes never cast and the caster stays ≤ 2k tris.
// Per-instance hit flash without per-entity materials: bone 0 is a dummy with no vertices; its matrix element [0].w carries
// flashUniform.value into the shared body shader (written in onBeforeRender, so the shared material never changes).
//
// humanoid2 / reptile / quadruped rigs: the v3 13-bone humanoid (same pivot names, same rest layout as models.js humanoid()) +
// jaw, lidL/lidR, thumb/fingers per hand, spring bones; smooth 2-bone weights in a 6 cm band at shoulders, elbows, hips, knees, waist.
import * as THREE from 'three';
import { toonMat } from '../../core/utils.js';
import { Spring } from '../common.js';
import * as Settings from '../../core/settings.js';

const TAU = Math.PI * 2;
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const _ident = new THREE.Matrix4();

let GAME = null;
/** Registry hook: the game reference (camera, quality budget, frame flags) used by model.update(). */
export function setGame(g) { if (g) GAME = g; }

// =====================================================================================================================
// materials (created once, shared by every mob type; returned by prewarm())
// =====================================================================================================================
function patchFlash(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying float vMobFlash;')
    .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n#ifdef USE_SKINNING\n  vMobFlash = getBoneMatrix(0.0)[0].w;\n#else\n  vMobFlash = 0.0;\n#endif');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vMobFlash;')
    .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, vec3(1.0, 0.93, 0.84), clamp(vMobFlash, 0.0, 1.0) * 0.72);\n#include <opaque_fragment>');
}
function flashable(m, key) {
  const base = m.onBeforeCompile;
  m.onBeforeCompile = function (sh, r) { if (base) base.call(this, sh, r); patchFlash(sh); };
  m.customProgramCacheKey = function () { return key; };
  return m;
}
const VC_BASE = new THREE.Color(1, 1, 1);
let MATS = null;
export function materials() {
  if (MATS) return MATS;
  const body = flashable(toonMat(VC_BASE, { vertexColors: true }), 'toonRim+dis+mob4');   // base = neutral multiplier for the vertex colours
  body.name = 'mob4.body';
  const shell = flashable(toonMat(VC_BASE, { vertexColors: true, transparent: true, opacity: 0.84 }), 'toonRim+dis+mob4');
  shell.name = 'mob4.shell'; shell.depthWrite = true;
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true }); glow.name = 'mob4.glow';
  MATS = { body, shell, glow, outlines: new Map() };
  return MATS;
}
// Outline proxy material: skinned inverted hull pushed along the projected normal by a constant pixel width (crisp ~1.6 px linework at
// every distance, unlike the v3 world-space hull that falls below 1 px at gameplay range) + a small world push against z-fighting.
// One program; colours are uniforms (one material per colour, same program). uRes = the scene render target size (game.post.sceneRes).
const OUTLINE_RES = { value: new THREE.Vector2(1280, 720) };
const OUTLINE_VS = /* glsl */`
  uniform float uPx; uniform float uMinW; uniform vec2 uRes; uniform float uPull;
  #include <common>
  #include <skinning_pars_vertex>
  #include <fog_pars_vertex>
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    vec3 transformed = vec3(position);
    #include <skinning_vertex>
    vec3 on = normalize(objectNormal);
    transformed += on * uMinW;
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    // pull the hull a few cm toward the camera so the line survives where the feet / hem meet the floor (not buried in the ground)
    mvPosition.xyz *= max(0.0, 1.0 - uPull / max(0.25, length(mvPosition.xyz)));
    vec4 clip = projectionMatrix * mvPosition;
    vec2 d = (projectionMatrix * vec4(normalize(normalMatrix * on), 0.0)).xy;
    float L = length(d);
    if (L > 1e-5) clip.xy += d / L * uPx * 2.0 / uRes * clip.w;
    gl_Position = clip;
    #include <fog_vertex>
  }`;
const OUTLINE_FS = /* glsl */`
  uniform vec3 color;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
  }`;
export function outlineMat(t = 0.022, color = 0x1a1410) {
  const M = materials(), k = t.toFixed(4) + ':' + color;
  let m = M.outlines.get(k);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), color: { value: new THREE.Color(color) }, uPx: { value: 1.6 }, uMinW: { value: t * 0.3 }, uRes: OUTLINE_RES, uPull: { value: 0.03 } },
      vertexShader: OUTLINE_VS, fragmentShader: OUTLINE_FS, side: THREE.BackSide, fog: true,
    });
    m.name = 'mob4.outline';
    M.outlines.set(k, m);
  }
  return m;
}
/** Keep the outline pixel width right: the scene render target size (game.post.sceneRes) or the drawing buffer. */
function syncOutlineRes() {
  const g = GAME; if (!g) return;
  const sr = g.post?.sceneRes?.value;
  if (sr && sr.x > 0) { if (OUTLINE_RES.value.x !== sr.x || OUTLINE_RES.value.y !== sr.y) OUTLINE_RES.value.set(sr.x, sr.y); return; }
  const c = g.renderer?.domElement; if (c && (OUTLINE_RES.value.x !== c.width || OUTLINE_RES.value.y !== c.height)) OUTLINE_RES.value.set(c.width, c.height);
}
export function allMaterials() { const M = materials(); return [M.body, M.shell, M.glow, ...M.outlines.values()]; }

// =====================================================================================================================
// primitive specs (rebuilt at three detail levels: body 1, proxy ~0.6, LOD ~0.5)
// =====================================================================================================================
export const S = (r, w = 10, h = 8, o = {}) => ({ k: 'sph', r, w, h, ...o });
export const HS = (r, w = 10, h = 5, thL = Math.PI / 2, o = {}) => ({ k: 'sph', r, w, h, thL, ...o });   // hemisphere / cap
export const C = (rt, rb, h, n = 10, o = {}) => ({ k: 'cyl', rt, rb, h, n, ...o });
export const K = (r, h, n = 8, o = {}) => ({ k: 'cone', r, h, n, ...o });
export const B = (x, y, z) => ({ k: 'box', x, y, z });
export const CAP = (r, l, n = 8, cs = 3) => ({ k: 'cap', r, l, n, cs });
export const T = (R, t, n = 12, m = 6, arc = TAU) => ({ k: 'tor', R, t, n, m, arc });
export const OCT = (r) => ({ k: 'oct', r });
export const ICO = (r, d = 0) => ({ k: 'ico', r, d });
export const LATHE = (pts, n = 12) => ({ k: 'lathe', pts, n });
/** Tapered tube along a polyline/curve: pts [[x,y,z]…], radii per point (or [r0, r1] linear), radial segments n. Closed tip. */
export const TUBE = (pts, radii, n = 6, o = {}) => ({ k: 'tube', pts, radii, n, ...o });
/** Flat card (double-sided quad strip) for cloth strips / fur cards: w × h, segs along h. */
export const CARD = (w, h, segs = 2, o = {}) => ({ k: 'card', w, h, segs, ...o });
export const FN = (fn, ext) => ({ k: 'fn', fn, ext });

const seg = (n, d, min) => Math.max(min, Math.round(n * d));
function tubeGeo(spec, d) {
  const pts = spec.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const nPts = pts.length;
  const radii = spec.radii.length === nPts ? spec.radii : pts.map((_, i) => spec.radii[0] + (spec.radii[1] - spec.radii[0]) * (i / (nPts - 1)));
  const n = seg(spec.n, d, 3), comp = spec._comp ? 1 / Math.cos(Math.PI / n) : 1;
  const pos = [], idx = [];
  const tan = new THREE.Vector3(), nor = new THREE.Vector3(), bin = new THREE.Vector3(), prevT = new THREE.Vector3(), qq = new THREE.Quaternion();
  for (let i = 0; i < nPts; i++) {
    tan.subVectors(pts[Math.min(nPts - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    if (i === 0) {   // parallel-transport frame (no flips along curved horns / tails)
      const up = Math.abs(tan.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      nor.crossVectors(tan, up).normalize();
    } else { qq.setFromUnitVectors(prevT, tan); nor.applyQuaternion(qq).normalize(); }
    prevT.copy(tan);
    bin.crossVectors(nor, tan).normalize();
    const r = radii[i] * comp;
    for (let j = 0; j < n; j++) {
      const a = j / n * TAU, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(pts[i].x + (nor.x * ca + bin.x * sa) * r, pts[i].y + (nor.y * ca + bin.y * sa) * r, pts[i].z + (nor.z * ca + bin.z * sa) * r);
    }
  }
  for (let i = 0; i < nPts - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + j, e = (i + 1) * n + (j + 1) % n;
    idx.push(a, c, b, b, c, e);
  }
  // caps: base fan + tip fan (tip radius may be ~0)
  const base = pos.length / 3; pos.push(pts[0].x, pts[0].y, pts[0].z);
  for (let j = 0; j < n; j++) idx.push(base, j, (j + 1) % n);
  const tip = pos.length / 3; const L = pts[nPts - 1]; pos.push(L.x, L.y, L.z);
  for (let j = 0; j < n; j++) idx.push(tip, (nPts - 1) * n + (j + 1) % n, (nPts - 1) * n + j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function cardGeo(spec, d) {
  const segs = seg(spec.segs, d, 1), w = spec.w, h = spec.h, bend = spec.bend || 0, taper = spec.taper ?? 1;
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, y = -t * h, z = bend * t * t, hw = w * 0.5 * (1 - (1 - taper) * t);
    pos.push(-hw, y, z, hw, y, z);
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3, a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Lathe surfaces: normals point away from the axis and every triangle winds front-facing outward (whatever the profile order). */
function orientOutward(g) {
  const p = g.attributes.position, nA = g.attributes.normal, ix = g.index.array;
  let dot = 0;
  for (let i = 0; i < p.count; i++) dot += nA.getX(i) * p.getX(i) + nA.getZ(i) * p.getZ(i);
  if (dot < 0) for (let i = 0; i < nA.count; i++) nA.setXYZ(i, -nA.getX(i), -nA.getY(i), -nA.getZ(i));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < ix.length; t += 3) {
    a.fromBufferAttribute(p, ix[t]); b.fromBufferAttribute(p, ix[t + 1]); c.fromBufferAttribute(p, ix[t + 2]);
    b.sub(a); c.sub(a); b.cross(c);
    n.fromBufferAttribute(nA, ix[t]).add(_v.fromBufferAttribute(nA, ix[t + 1])).add(_v.fromBufferAttribute(nA, ix[t + 2]));
    if (b.dot(n) < 0) { const k = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = k; }
  }
  return g;
}
/** Build a primitive at detail d (1 = authoring). comp = circumscribe low-poly circles (outline proxy). */
function primGeo(sp, d, comp) {
  let g;
  const cf = (n) => (comp ? 1 / Math.cos(Math.PI / n) : 1);
  switch (sp.k) {
    case 'sph': { const w = seg(sp.w, d, 4), h = seg(sp.h, d, 3); g = new THREE.SphereGeometry(sp.r * cf(w), w, h, sp.phS ?? 0, sp.phL ?? TAU, sp.thS ?? 0, sp.thL ?? Math.PI); break; }
    case 'cyl': { const n = seg(sp.n, d, 3); g = new THREE.CylinderGeometry(sp.rt * cf(n), sp.rb * cf(n), sp.h, n, sp.hs || 1, !!sp.open); break; }
    case 'cone': { const n = seg(sp.n, d, 3); g = new THREE.ConeGeometry(sp.r * cf(n), sp.h, n, sp.hs || 1, !!sp.open); break; }
    case 'box': g = new THREE.BoxGeometry(sp.x, sp.y, sp.z); break;
    case 'cap': { const n = seg(sp.n, d, 4); g = new THREE.CapsuleGeometry(sp.r * cf(n), sp.l, seg(sp.cs, d, 1), n); break; }
    case 'tor': g = new THREE.TorusGeometry(sp.R, sp.t, seg(sp.m, d, 3), seg(sp.n, d, 4), sp.arc); break;
    case 'oct': g = new THREE.OctahedronGeometry(sp.r, 0); break;
    case 'ico': g = new THREE.IcosahedronGeometry(sp.r, sp.d); break;
    case 'lathe': { const n = seg(sp.n, d, 5); g = orientOutward(new THREE.LatheGeometry(sp.pts.map((p) => new THREE.Vector2(p[0] * cf(n), p[1])), n)); break; }
    case 'tube': g = tubeGeo({ ...sp, _comp: comp }, d); break;
    case 'card': g = cardGeo(sp, d); break;
    case 'fn': g = sp.fn(d, comp); break;
    default: throw new Error('mob4 prim ' + sp.k);
  }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.index) { const n = g.attributes.position.count, ix = new Uint16Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
/** Half extents of a primitive in its own space (AO ellipsoids, size classification). */
function primExt(sp) {
  switch (sp.k) {
    case 'sph': return [sp.r, sp.r * (sp.thL != null && sp.thL < Math.PI ? 0.6 : 1), sp.r];
    case 'cyl': { const r = Math.max(sp.rt, sp.rb); return [r, sp.h / 2, r]; }
    case 'cone': return [sp.r * 0.8, sp.h / 2, sp.r * 0.8];
    case 'box': return [sp.x / 2, sp.y / 2, sp.z / 2];
    case 'cap': return [sp.r, sp.l / 2 + sp.r, sp.r];
    case 'tor': return [sp.R + sp.t, sp.R + sp.t, sp.t];
    case 'oct': case 'ico': return [sp.r, sp.r, sp.r];
    case 'card': return [sp.w / 2, sp.h / 2, 0.02];
    default: { if (sp.ext) return sp.ext; const g = primGeo(sp, 1, false); g.computeBoundingBox(); const b = g.boundingBox; return [(b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2]; }
  }
}

// =====================================================================================================================
// part list authoring
// =====================================================================================================================
/**
 * Part: P(bone, spec, color, p, r, s, flags)
 *   color: hex | (local:Vector3, normal:Vector3, out:THREE.Color) => void   (local = bone-local position)
 *   flags: { small, lod (force), noLod, proxy (force), noProxy, ao:false (no AO receive/cast), dark:k (extremity),
 *            blend:{axis:'-y'|'+y'|'-z'|'+z'|'-x'|'+x', band:0.06} (smooth 2-bone weight with the parent bone), glow (→ glow geometry) }
 */
export const P = (bone, spec, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], flags = {}) => ({ bone, spec, color, p, r, s, f: flags });
/** Mirror a part list over x (bone names ending in R/L swap). */
export function mirror(parts) {
  const out = [];
  for (const q of parts) {
    const bone = q.bone.endsWith('R') ? q.bone.slice(0, -1) + 'L' : q.bone.endsWith('L') ? q.bone.slice(0, -1) + 'R' : q.bone;
    out.push({ ...q, bone, p: [-q.p[0], q.p[1], q.p[2]], r: [q.r[0], -q.r[1], -q.r[2]], spec: mirrorSpec(q.spec), f: { ...q.f } });
  }
  return out;
}
function mirrorSpec(sp) { if (sp.k === 'tube') return { ...sp, pts: sp.pts.map((p) => [-p[0], p[1], p[2]]) }; return sp; }
/** Both sides: the given (right-side, −x) parts + their mirror. */
export const both = (parts) => parts.concat(mirror(parts));

/** Eye: sclera + iris + pupil + highlight (+ optional glow iris). Returns parts on `bone` at p (centre), facing +Z rotated by yaw. */
export function eye(bone, p, r, o = {}) {
  const yaw = o.yaw ?? 0, sq = o.squash ?? [1, 1, 0.62];
  const dz = r * sq[2];
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const at = (k, up = 0, side = 0) => [p[0] + fx * dz * k + side * fz, p[1] + up, p[2] + fz * dz * k - side * fx];
  const flags = { small: true, ao: false };
  const parts = [P(bone, S(r, 10, 8), o.sclera ?? 0xf1ebdf, p, [0, yaw, 0], sq, { ...flags, eyeball: true })];
  const ir = r * (o.irisK ?? 0.62);
  const irisPart = P(bone, S(ir, 8, 6), o.iris ?? 0x6a4a2a, at(0.78), [0, yaw, 0], [1, o.slit ? 1.05 : 1, 0.38], { ...flags, glow: !!o.glowIris });
  parts.push(irisPart);
  const pr = r * (o.pupilK ?? 0.36);
  parts.push(P(bone, S(pr, 6, 4), o.pupil ?? 0x120c0a, at(0.98), [0, yaw, 0], o.slit ? [0.32, 2.1, 0.3] : [1, 1, 0.35], flags));
  const hs = o.hiSide ?? 1;
  parts.push(P(bone, S(r * 0.17, 4, 3), 0xfdf6ea, at(1.02, r * 0.3, -hs * r * 0.22), [0, 0, 0], [1, 1, 0.5], flags));
  return parts;
}

// =====================================================================================================================
// rigs
// =====================================================================================================================
/** Bone spec helper: [name, parent, [x,y,z], [rx,ry,rz]?]. */
export const bone = (name, parent, p, r = [0, 0, 0]) => ({ name, parent, p, r });
/**
 * humanoid2: the v3 13 bones with the v3 rest layout (models.js humanoid(): rig at hipY, spine +0.08, neck at neckY…) +
 * jaw, lidL/lidR, thumb/fingers per hand (+ caller extras: weapon, springs). o = v3 humanoid params + face params.
 */
export function humanoid2(o) {
  const sh = o.shoulderX, L = [];
  L.push(bone('rig', null, [0, o.hipY, 0]), bone('spine', 'rig', [0, 0.08, 0]), bone('neck', 'spine', [0, o.neckY, 0.02]));
  L.push(bone('armR', 'spine', [-sh, o.shoulderY, 0]), bone('armL', 'spine', [sh, o.shoulderY, 0]));
  L.push(bone('foreR', 'armR', [0, -o.upperLen, 0]), bone('foreL', 'armL', [0, -o.upperLen, 0]));
  L.push(bone('handR', 'foreR', [0, -o.foreLen, 0.03]), bone('handL', 'foreL', [0, -o.foreLen, 0.03]));
  L.push(bone('legR', 'rig', [-o.hipX, -0.06, 0]), bone('legL', 'rig', [o.hipX, -0.06, 0]));
  L.push(bone('kneeR', 'legR', [0, -o.thighLen, 0]), bone('kneeL', 'legL', [0, -o.thighLen, 0]));
  if (o.jaw) L.push(bone('jaw', 'neck', o.jaw));
  if (o.lids) { L.push(bone('lidR', 'neck', o.lids[0]), bone('lidL', 'neck', o.lids[1])); }
  const hand = o.hand || { thumb: [0.05, -0.04, 0.05], fingers: [0, -0.08, 0.03] };
  for (const s of ['R', 'L']) {
    const m = s === 'R' ? -1 : 1;
    L.push(bone('thumb' + s, 'hand' + s, [hand.thumb[0] * -m, hand.thumb[1], hand.thumb[2]]));
    L.push(bone('fingers' + s, 'hand' + s, hand.fingers));
  }
  if (o.digitigrade) {
    // reptile variant: knee → ankle (reverse joint) → foot
    for (const s of ['R', 'L']) L.push(bone('ankle' + s, 'knee' + s, [0, -o.shinLen, -0.06]));
  }
  if (o.tail) {
    let parent = 'rig';
    o.tail.forEach((p, i) => { L.push(bone('tail' + (i + 1), parent, p)); parent = 'tail' + (i + 1); });
  }
  return L;
}
/** Quadruped rig (wolf): v3 names rig, neck, jaw, legs[i].up/low, tail1, tail2 (+ paws, tail3, ears, mane spring). */
export function quadruped(o) {
  const L = [bone('rig', null, [0, o.bodyY, 0]), bone('neck', 'rig', o.neck), bone('jaw', 'neck', o.jaw)];
  o.legs.forEach(([x, z], i) => {
    L.push(bone('leg' + i, 'rig', [x, -0.08, z]), bone('low' + i, 'leg' + i, [0, -o.upperLen, 0]), bone('paw' + i, 'low' + i, [0, -o.lowerLen, 0.02]));
  });
  let parent = 'rig';
  o.tail.forEach((p, i) => { L.push(bone('tail' + (i + 1), parent, p)); parent = 'tail' + (i + 1); });
  if (o.ears) { L.push(bone('earR', 'neck', o.ears[0]), bone('earL', 'neck', o.ears[1])); }
  if (o.lids) { L.push(bone('lidR', 'neck', o.lids[0]), bone('lidL', 'neck', o.lids[1])); }
  return L;
}

// =====================================================================================================================
// type build (once per type)
// =====================================================================================================================
const AXIS = { x: 0, y: 1, z: 2 };
function restMatrices(boneSpecs) {
  const idx = new Map(), world = [];
  boneSpecs.forEach((b, i) => idx.set(b.name, i));
  for (let i = 0; i < boneSpecs.length; i++) {
    const b = boneSpecs[i];
    _e.set(b.r[0], b.r[1], b.r[2]); _q.setFromEuler(_e);
    const local = new THREE.Matrix4().compose(_v.set(b.p[0], b.p[1], b.p[2]), _q, _s.set(1, 1, 1));
    const pi = b.parent == null ? -1 : idx.get(b.parent);
    if (b.parent != null && pi === undefined) throw new Error('mob4 bone parent ' + b.parent);
    world.push(pi < 0 ? local : new THREE.Matrix4().multiplyMatrices(world[pi], local));
  }
  return { idx, world };
}

/**
 * Assemble a part list into arrays. mode: 'body' | 'lod' | 'proxy' | 'glow'.
 * Returns {pos, nrm, col, si, sw, index, vCount, tris, parts:[{start, count, inv, ext, caster}]}
 */
function assemble(def, R, list, mode) {
  const d = mode === 'body' || mode === 'glow' ? 1 : mode === 'lod' ? (def.lodDetail ?? 0.5) : (def.proxyDetail ?? 0.6);
  const comp = mode === 'proxy';
  const chunks = [];
  let vTot = 0, iTot = 0;
  const local = new THREE.Vector3(), nl = new THREE.Vector3();
  for (const q of list) {
    const bi = R.idx.get(q.bone);
    if (bi === undefined) throw new Error(`mob4 ${def.type}: unknown bone ${q.bone}`);
    const g = primGeo(q.spec, d, comp);
    _e.set(q.r[0], q.r[1], q.r[2]); _q.setFromEuler(_e);
    const Mp = new THREE.Matrix4().compose(new THREE.Vector3(q.p[0], q.p[1], q.p[2]), _q.clone(), new THREE.Vector3(q.s[0], q.s[1], q.s[2]));
    const Mb = new THREE.Matrix4().multiplyMatrices(R.world[bi], Mp);
    const nMp = new THREE.Matrix3().getNormalMatrix(Mp), nMb = new THREE.Matrix3().getNormalMatrix(Mb);
    const pa = g.attributes.position, na = g.attributes.normal, n = pa.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), lp = new Float32Array(n * 3);
    const si = new Uint8Array(n * 4), sw = new Float32Array(n * 4);
    const blend = q.f.blend, parentBi = blend ? R.idx.get(def.bones[bi].parent) : -1;
    const bAx = blend ? AXIS[blend.axis[1]] : 0, bSg = blend ? (blend.axis[0] === '-' ? -1 : 1) : 1, band = blend?.band ?? 0.06;
    const colFn = typeof q.color === 'function' ? q.color : null;
    if (!colFn) { if (q.color == null) _c2.setRGB(1, 1, 1); else _c2.setHex(q.color); }
    for (let i = 0; i < n; i++) {
      local.fromBufferAttribute(pa, i).applyMatrix4(Mp);
      nl.fromBufferAttribute(na, i).applyMatrix3(nMp).normalize();
      lp[i * 3] = local.x; lp[i * 3 + 1] = local.y; lp[i * 3 + 2] = local.z;
      _v.copy(local).applyMatrix4(R.world[bi]);
      pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
      _n.fromBufferAttribute(na, i).applyMatrix3(nMb).normalize();
      nrm[i * 3] = _n.x; nrm[i * 3 + 1] = _n.y; nrm[i * 3 + 2] = _n.z;
      if (colFn) { _c.setRGB(1, 1, 1); colFn(local, nl, _c, _v); } else _c.copy(_c2);
      if (def.paint && mode !== 'glow') def.paint(_v, _n, _c, q, local);
      if (q.f.dark) _c.multiplyScalar(q.f.dark);
      if (q.f.glowK) _c.multiplyScalar(Math.min(1.2, q.f.glowK));
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      if (parentBi >= 0 && parentBi !== undefined) {
        const dd = bSg * local.getComponent(bAx);
        const wc = Math.min(1, Math.max(0, 0.5 + dd / band));
        si[i * 4] = bi; sw[i * 4] = wc; si[i * 4 + 1] = parentBi; sw[i * 4 + 1] = 1 - wc;
      } else { si[i * 4] = bi; sw[i * 4] = 1; }
    }
    const ix = g.index.array;
    chunks.push({ q, pos, nrm, col, si, sw, ix, n, lp, inv: new THREE.Matrix4().copy(Mb).invert(), ext: primExt(q.spec), Mb });
    vTot += n; iTot += ix.length;
    g.dispose();
  }
  const out = { pos: new Float32Array(vTot * 3), nrm: new Float32Array(vTot * 3), col: new Float32Array(vTot * 3), si: new Uint8Array(vTot * 4), sw: new Float32Array(vTot * 4),
    index: vTot > 65535 ? new Uint32Array(iTot) : new Uint16Array(iTot), vCount: vTot, tris: iTot / 3, chunks };
  let vo = 0, io = 0;
  for (const ch of chunks) {
    out.pos.set(ch.pos, vo * 3); out.nrm.set(ch.nrm, vo * 3); out.col.set(ch.col, vo * 3); out.si.set(ch.si, vo * 4); out.sw.set(ch.sw, vo * 4);
    for (let i = 0; i < ch.ix.length; i++) out.index[io + i] = ch.ix[i] + vo;
    ch.start = vo; vo += ch.n; io += ch.ix.length;
  }
  if (mode === 'body' || mode === 'lod') ambientOcclusion(def, out);
  return out;
}
const AO_KINDS = { sph: 1, cap: 1, cyl: 1, box: 1, cone: 1, oct: 1, ico: 1, lathe: 1 };
/** Crevice AO baked into vertex colours (−25 % value where a vertex sits on another part's surface), + ground-contact darkening. */
function ambientOcclusion(def, A) {
  const casters = A.chunks.filter((c) => c.q.f.ao !== false && !c.q.f.small && c.q.f.aoCast !== false && AO_KINDS[c.q.spec.k] && Math.max(...c.ext) >= (def.aoMin ?? 0.07));
  const v = new THREE.Vector3(), q = new THREE.Vector3();
  const strength = def.aoStrength ?? 0.25;
  for (const ch of A.chunks) {
    if (ch.q.f.ao === false) continue;
    for (let i = 0; i < ch.n; i++) {
      const o = (ch.start + i) * 3;
      v.set(A.pos[o], A.pos[o + 1], A.pos[o + 2]);
      let k = 0;
      for (let c = 0; c < casters.length; c++) {
        const cc = casters[c]; if (cc === ch) continue;
        q.copy(v).applyMatrix4(cc.inv);
        const e = cc.ext, rx = q.x / e[0], ry = q.y / e[1], rz = q.z / e[2];
        const rho = Math.sqrt(rx * rx + ry * ry + rz * rz);
        if (rho < 1.22) { const t = Math.min(1, (1.22 - rho) / 0.27); if (t > k) k = t; if (k >= 1) break; }
      }
      // ground contact: the lowest 12 cm get up to −15 %
      const gy = A.pos[o + 1], gk = gy < 0.12 ? (0.12 - Math.max(0, gy)) / 0.12 * 0.15 : 0;
      const f = (1 - strength * k * k * (3 - 2 * k)) * (1 - gk);
      A.col[o] *= f; A.col[o + 1] *= f; A.col[o + 2] *= f;
    }
  }
}

function geometryFrom(parts, { color = true, colorFloat = false } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(parts.pos, 3));
  // normals as normalized Int8 (3 B instead of 12 B per vertex: smaller first-sight upload)
  const n8 = new Int8Array(parts.nrm.length);
  for (let i = 0; i < n8.length; i++) n8[i] = Math.max(-127, Math.min(127, Math.round(parts.nrm[i] * 127)));
  g.setAttribute('normal', new THREE.BufferAttribute(n8, 3, true));
  if (color) {
    if (colorFloat) g.setAttribute('color', new THREE.BufferAttribute(parts.col, 3));
    else {
      const c8 = new Uint8Array(parts.col.length);
      for (let i = 0; i < c8.length; i++) c8[i] = Math.max(0, Math.min(255, Math.round(parts.col[i] * 255)));
      g.setAttribute('color', new THREE.BufferAttribute(c8, 3, true));
    }
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(parts.si, 4));
  const w8 = new Uint8Array(parts.sw.length);
  for (let i = 0; i < parts.sw.length; i += 4) {
    if (parts.sw[i + 1] > 0) { const a = Math.round(parts.sw[i] * 255); w8[i] = a; w8[i + 1] = 255 - a; } else w8[i] = 255;
  }
  g.setAttribute('skinWeight', new THREE.BufferAttribute(w8, 4, true));
  g.setIndex(new THREE.BufferAttribute(parts.index, 1));
  return g;
}
function concat(a, b) {
  const out = { pos: new Float32Array(a.pos.length + b.pos.length), nrm: new Float32Array(a.nrm.length + b.nrm.length), col: new Float32Array(a.col.length + b.col.length),
    si: new Uint8Array(a.si.length + b.si.length), sw: new Float32Array(a.sw.length + b.sw.length), vCount: a.vCount + b.vCount };
  const big = out.vCount > 65535;
  out.index = big ? new Uint32Array(a.index.length + b.index.length) : new Uint16Array(a.index.length + b.index.length);
  for (const k of ['pos', 'nrm', 'col', 'si', 'sw']) { out[k].set(a[k], 0); out[k].set(b[k], a[k].length); }
  out.index.set(a.index, 0);
  for (let i = 0; i < b.index.length; i++) out.index[a.index.length + i] = b.index[i] + a.vCount;
  return out;
}

const TYPES = new Map();
/**
 * def: { type, bones:[bone()], parts:[P], glow:[P], hipY?, headTop, lieY, sphere:[cy, r], outline:{t, color},
 *        springs:[{bone, axis:'x'|'z', k, d, gain:[forward, side], sway, swayHz, min, max}], lids:{open, closed}, blink:[min, max],
 *        anchors:{weapon:[bone, [x,y,z]], head, hand, mouth, core}, kind:'humanoid'|'quad'|'blob'|'prop', aliases:{v3name: bone|anchor},
 *        poses:{name: (t, P, m) => void}, features:{…}, shell:boolean (body uses the transparent shell material), paint(v, n, c, part) }
 */
export function defineType(def) {
  if (TYPES.has(def.key || def.type)) return TYPES.get(def.key || def.type);
  const t0 = performance.now();
  const bones = [bone('__flash', null, [0, 0, 0]), ...def.bones];
  def.bones = bones;
  const R = restMatrices(bones);
  const bodyParts = def.parts.filter((q) => !q.f.glow && !q.f.proxyOnly);
  const proxyOnly = def.parts.filter((q) => q.f.proxyOnly);
  const glowParts = def.parts.filter((q) => q.f.glow).concat(def.glow || []);
  const size = (q) => { const e = primExt(q.spec); return Math.max(e[0] * q.s[0], e[1] * q.s[1], e[2] * q.s[2]); };
  const lodParts = bodyParts.filter((q) => q.f.lod || (!q.f.noLod && !q.f.small && size(q) >= (def.lodMin ?? 0.09)));
  // silhouette-only proxy: big parts; no cards, trims (tori) or thin parts (their hull would paint over them at close range)
  const thin = (q) => { const e = primExt(q.spec); return Math.min(e[0] * q.s[0], e[1] * q.s[1], e[2] * q.s[2]) < 0.03; };
  const proxyParts = bodyParts.filter((q) => q.f.proxy || (!q.f.noProxy && !q.f.small && q.spec.k !== 'card' && q.spec.k !== 'tor' && !thin(q) && size(q) >= (def.proxyMin ?? 0.12)));
  const body = assemble(def, R, bodyParts, 'body');
  const lod = assemble(def, R, lodParts, 'lod');
  const proxy = assemble(def, R, proxyParts.concat(proxyOnly), 'proxy');
  const glow = glowParts.length ? assemble(def, R, glowParts, 'glow') : null;
  const both2 = concat(body, lod);
  const geo = geometryFrom(both2);
  const bodyCount = body.index.length, lodCount = lod.index.length;
  geo.setDrawRange(0, bodyCount);
  const lodView = new THREE.BufferGeometry();
  for (const k of Object.keys(geo.attributes)) lodView.setAttribute(k, geo.attributes[k]);
  lodView.setIndex(geo.index); lodView.setDrawRange(bodyCount, lodCount);
  const proxyGeo = geometryFrom(proxy, { color: false });
  const glowGeo = glow ? geometryFrom(glow, { colorFloat: true }) : null;
  const sphere = new THREE.Sphere(new THREE.Vector3(0, def.sphere[0], 0), def.sphere[1]);
  for (const g of [geo, lodView, proxyGeo, glowGeo]) if (g) g.boundingSphere = sphere;
  const inverses = R.world.map((w) => new THREE.Matrix4().copy(w).invert());
  // eye-group extents (bind space) for the 6 px readability check
  const eyes = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, n: 0 };
  for (const A2 of [body, glow]) if (A2) for (const c of A2.chunks) {
    if (!c.q.f.eyeball) continue;
    eyes.n++;
    for (let i = 0; i < c.n; i++) { const x = c.pos[i * 3], y = c.pos[i * 3 + 1]; if (x < eyes.minX) eyes.minX = x; if (x > eyes.maxX) eyes.maxX = x; if (y < eyes.minY) eyes.minY = y; if (y > eyes.maxY) eyes.maxY = y; }
  }
  const TT = {
    type: def.type, key: def.key || def.type, def, geo, lodView, proxyGeo, glowGeo, bodyCount, lodCount, sphere, inverses, boneSpecs: bones, boneIdx: R.idx,
    tris: { body: body.tris, lod: lod.tris, proxy: proxy.tris, glow: glow ? glow.tris : 0, shadow: lod.tris },
    verts: { body: body.vCount, lod: lod.vCount, proxy: proxy.vCount, glow: glow ? glow.vCount : 0 },
    bytes: [geo, proxyGeo, glowGeo].reduce((s, g) => s + (g ? Object.values(g.attributes).reduce((a, at) => a + at.array.byteLength, 0) + g.index.array.byteLength : 0), 0),
    eyes, buildMs: 0, instances: 0,
    partTris: body.chunks.map((c) => [c.q.bone + ':' + c.q.spec.k, c.ix.length / 3]),
  };
  TT.buildMs = +(performance.now() - t0).toFixed(2);
  TYPES.set(TT.key, TT);
  return TT;
}
export function builtTypes() { return TYPES; }

// =====================================================================================================================
// poses (canonical, exaggerated for readability; §4.0 rhythm). Humanoid keys = enemies/base.js HUMAN_KEYS + extras.
// =====================================================================================================================
export const POSE_KEYS = ['hipY', 'hipZ', 'pitch', 'roll', 'spineX', 'spineY', 'headX', 'headY', 'headZ',
  'aRx', 'aRz', 'fRx', 'aLx', 'aLz', 'fLx', 'lRx', 'lRz', 'kR', 'lLx', 'lLz', 'kL', 'jaw', 'grip', 'sqY', 'sqXZ'];
export function newPose(hipY) { const p = {}; for (const k of POSE_KEYS) p[k] = 0; p.hipY = hipY; p.sqY = 1; p.sqXZ = 1; return p; }
const ease = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
/** Generic humanoid pose table; t = seconds (idle, walk) or progress 0..1 (others). Species override via def.poses[name](t, p, m). */
export function humanoidPose(name, t, p, hip) {
  p.hipY = hip;
  switch (name) {
    case 'walk': {
      const s = Math.sin(t * 7), c = Math.cos(t * 7);
      p.lRx = s * 0.75; p.lLx = -s * 0.75; p.kR = Math.max(0, -c) + 0.1; p.kL = Math.max(0, c) + 0.1;
      p.aRx = -s * 0.6; p.aLx = s * 0.6; p.fRx = p.fLx = -0.35; p.hipY = hip - Math.abs(c) * 0.06 + 0.03; p.pitch = 0.12; p.spineY = s * 0.12; p.roll = c * 0.05;
      p.grip = 0.6; break;
    }
    case 'windup': {   // anticipation: crouch, weapon arm back/up, squash ×1.15
      const k = ease(t);
      p.aRx = -3.0 * k - 0.2; p.fRx = -0.9 * k; p.aRz = -0.35 * k; p.aLx = -0.9 * k; p.aLz = 0.5 * k; p.fLx = -0.6 * k;
      p.pitch = -0.25 * k; p.spineX = -0.2 * k; p.spineY = 0.45 * k; p.headX = 0.15 * k; p.lRx = 0.35 * k; p.lLx = -0.45 * k; p.kL = 0.55 * k; p.kR = 0.2 * k;
      p.hipY = hip - 0.08 * k; p.jaw = 0.7 * k; p.grip = 1; p.sqY = 1 - 0.13 * k; p.sqXZ = 1 + 0.07 * k; break;
    }
    case 'hold': {     // frozen at the top (identical for every t: angular velocity 0)
      humanoidPose('windup', 1, p, hip); p.sqY = 1 / 1.15; p.sqXZ = 1.08; p.jaw = 0.85; break;
    }
    case 'strike': {   // ≤ 0.12 s snap through, stretch
      const k = ease(t);
      p.aRx = -3.2 + 2.7 * k; p.fRx = -0.9 + 0.8 * k; p.aRz = -0.1; p.aLx = 0.5 * k; p.aLz = 0.4;
      p.pitch = -0.25 + 0.75 * k; p.spineX = -0.2 + 0.55 * k; p.spineY = 0.45 - 0.95 * k; p.headX = -0.2 * k;
      p.lRx = 0.5; p.lLx = -0.7; p.kL = 0.6; p.kR = 0.2; p.hipY = hip - 0.12 * k; p.jaw = 0.9; p.grip = 1;
      p.sqY = 0.87 + 0.21 * k; p.sqXZ = 1.07 - 0.1 * k; break;
    }
    case 'recover': {  // visible slump: weapon down, head low, knees bent
      const k = ease(Math.min(1, t * 3)), b = Math.sin(t * Math.PI * 4) * 0.03 * (1 - t);
      p.aRx = -0.4; p.fRx = -0.2; p.aRz = -0.15; p.aLx = 0.15; p.aLz = 0.3; p.pitch = 0.55 * k + b; p.spineX = 0.3 * k; p.spineY = -0.3;
      p.headX = 0.45 * k; p.lRx = 0.35; p.lLx = -0.45; p.kL = 0.55; p.kR = 0.35; p.hipY = hip - 0.16 * k; p.jaw = 0.35; p.grip = 0.7;
      p.sqY = 1.0 - 0.04 * k; break;
    }
    case 'stagger': {
      const k = Math.sin(Math.min(1, t) * Math.PI);
      p.pitch = -0.55 * k; p.spineX = -0.3 * k; p.headX = -0.6 * k; p.aRx = -1.2 * k; p.aRz = -1.1 * k; p.aLx = -1.4 * k; p.aLz = 1.2 * k;
      p.fRx = p.fLx = -0.5; p.lRx = 0.4 * k; p.lLx = -0.6 * k; p.kL = 0.6 * k; p.hipY = hip - 0.1 * k; p.hipZ = -0.15 * k; p.jaw = 0.8 * k; break;
    }
    case 'die': {
      const k = ease(t);
      p.aRz = -1.4 * k; p.aLz = 1.4 * k; p.aRx = -0.5 * k; p.aLx = -0.5 * k; p.lRx = -0.6 * k; p.lLx = -0.2 * k; p.kR = 0.5 * k; p.kL = 0.3 * k; p.headX = -0.4 * k; p.jaw = 0.6 * k;
      p.pitch = -1.45 * k; p.hipY = hip + (0.3 - hip) * k; break;
    }
    default: {         // idle: breathing
      const b = Math.sin(t * 2);
      p.spineX = b * 0.03; p.aRx = -0.25 + b * 0.04; p.aLx = -0.1; p.aLz = 0.18; p.aRz = -0.18; p.fRx = -0.5; p.fLx = -0.35;
      p.kR = p.kL = 0.12; p.lRx = p.lLx = -0.06; p.headX = Math.sin(t * 0.7) * 0.05; p.jaw = 0.05 + Math.max(0, b) * 0.05; p.grip = 0.6;
      p.sqY = 1 + b * 0.012;
    }
  }
  return p;
}
/** Apply a humanoid pose object to the pivots (same mapping as enemies/base.js applyHumanoid) + extras. */
export function applyHumanoidPose(m, p) {
  const b = m.bones.all || m.bones;
  m.rig.position.set(0, p.hipY, p.hipZ);
  m.rig.rotation.set(p.pitch, 0, p.roll);
  m.rig.scale.set(p.sqXZ, p.sqY, p.sqXZ);
  m.spine.rotation.set(p.spineX, p.spineY, 0);
  m.neck.rotation.set(p.headX, p.headY, p.headZ);
  m.armR.rotation.set(p.aRx, 0, p.aRz); m.foreR.rotation.x = p.fRx;
  m.armL.rotation.set(p.aLx, 0, p.aLz); m.foreL.rotation.x = p.fLx;
  m.legR.rotation.set(p.lRx, 0, p.lRz); m.kneeR.rotation.x = p.kR;
  m.legL.rotation.set(p.lLx, 0, p.lLz); m.kneeL.rotation.x = p.kL;
  if (b.jaw) b.jaw.rotation.x = (b.jaw.userData.rx0 || 0) + p.jaw * (m._jawOpen ?? 0.35);
  if (b.fingersR) { const g = p.grip; b.fingersR.rotation.x = g * 1.2; b.fingersL.rotation.x = g * 1.0; b.thumbR.rotation.z = -g * 0.5; b.thumbL.rotation.z = g * 0.5; }
}

// =====================================================================================================================
// instances
// =====================================================================================================================
let _uid = 0;
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Create one EnemyModel instance of a built type. opts: {scale, seed, game}. */
export function instantiate(TT, opts = {}) {
  const def = TT.def, M = materials();
  if (opts.game) setGame(opts.game);
  const root = new THREE.Group(); root.name = 'mob4:' + TT.key;
  const list = new Array(TT.boneSpecs.length);
  for (let i = 0; i < TT.boneSpecs.length; i++) {
    const s = TT.boneSpecs[i], b = new THREE.Bone();
    b.name = s.name; b.position.set(s.p[0], s.p[1], s.p[2]); b.rotation.set(s.r[0], s.r[1], s.r[2]);
    b.userData.rx0 = s.r[0]; b.userData.ry0 = s.r[1]; b.userData.rz0 = s.r[2];
    (s.parent == null ? root : list[TT.boneIdx.get(s.parent)]).add(b);
    list[i] = b;
  }
  const skeleton = new THREE.Skeleton(list, TT.inverses);
  const bodyMat = def.shell ? M.shell : M.body;
  const mk = (geo, mat, name) => {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.name = name; m.bindMode = THREE.AttachedBindMode; m.bind(skeleton, _ident);
    m.boundingSphere = TT.sphere; m.raycast = () => {};
    root.add(m); return m;
  };
  const body = mk(TT.geo, bodyMat, 'body');
  body.castShadow = true; body.receiveShadow = true;
  if (def.shell) body.renderOrder = 2;
  const glow = TT.glowGeo ? mk(TT.glowGeo, M.glow, 'glow') : null;
  if (glow) glow.castShadow = false;
  const oc = def.outline || {};
  const proxy = mk(TT.proxyGeo, outlineMat(oc.t ?? 0.022, oc.color ?? 0x1a1410), 'outline');
  proxy.castShadow = false; proxy.receiveShadow = false;
  const lod = mk(TT.lodView, bodyMat, 'lod');
  lod.visible = false; lod.castShadow = false;

  const st = { lod: false, outline: true, blinkT: 0, blinkNext: 0, blinkDur: 0.14, t: 0, first: true, lastPose: null };
  const rnd = mulberry((opts.seed ?? (++_uid * 7919)) + TT.key.length * 131);
  st.blinkNext = 3 + rnd() * 3;
  const flash = { value: 0 };
  const bodyCount = TT.bodyCount, lodCount = TT.lodCount;
  body.onBeforeRender = function (r, s, c, geo) {
    geo.drawRange.start = st.lod ? bodyCount : 0; geo.drawRange.count = st.lod ? lodCount : bodyCount;
    const v = flash.value;
    if (v > 0) { skeleton.boneMatrices[3] = v > 1 ? 1 : v; if (skeleton.boneTexture) skeleton.boneTexture.needsUpdate = true; }
  };
  body.onBeforeShadow = function (r, o, c, sc, geo) { geo.drawRange.start = bodyCount; geo.drawRange.count = lodCount; };
  body.onAfterShadow = function (r, o, c, sc, geo) { geo.drawRange.start = 0; geo.drawRange.count = bodyCount; };

  const B = {};
  for (const b of list) B[b.name] = b;
  const anchors = {};
  for (const [k, a] of Object.entries(def.anchors || {})) {
    const o3 = new THREE.Object3D(); o3.name = 'anchor:' + k; o3.position.set(a[1][0], a[1][1], a[1][2]); B[a[0]].add(o3); anchors[k] = o3;
  }
  // springs (secondary motion; only on lastStep)
  const springs = (def.springs || []).map((s) => ({ ...s, b: B[s.bone], sp: new Spring(s.k ?? 120, s.d ?? 9), rest: (B[s.bone].userData[s.axis === 'z' ? 'rz0' : 'rx0']) || 0,
    off: 0, prev: new THREE.Vector3(), ph: rnd() * TAU }));
  const hip = def.hipY ?? (B.rig ? B.rig.position.y : 0);
  const pose = newPose(hip);
  const kind = def.kind || 'humanoid';
  const model = {
    v4: true, type: def.type, key: TT.key, root, skeleton, meshes: glow ? [body, glow] : [body], proxy, lod, glow, body,
    bones: { root: B.rig || list[1], spine: B.spine || B.rig, head: B.neck || B.head || B.rig, jaw: B.jaw, lidL: B.lidL, lidR: B.lidR,
      armL: B.armL, armR: B.armR, handL: B.handL, handR: B.handR, weapon: B[def.weaponBone || 'weapon'] || anchors.weapon,
      tail: ['tail1', 'tail2', 'tail3', 'tail4'].map((n) => B[n]).filter(Boolean), all: B },
    features: { face: true, hands: true, springs: springs.length, aoVertexColors: true, lod: true, ...(def.features || {}) },
    tellAnchors: { weapon: anchors.weapon || B.weapon, head: anchors.head || B.neck, hand: anchors.hand || B.handR, mouth: anchors.mouth || B.jaw || B.neck, core: anchors.core || B.spine || B.rig },
    flashUniform: flash,
    headTop: def.headTop, lieY: def.lieY ?? 0.3, hipY: hip, tris: TT.tris,
    // v3 compatibility (CONTRACT §14 model fields used by base.js / behaviour files)
    skin: { meshes: glow ? { body, glow } : { body }, outlines: [proxy], skeleton }, outlines: [proxy],
    rimSource() { return st.lod ? RIM_LOD : RIM_PROXY; },
    get lodActive() { return st.lod; },
    /** Canonical pose `name` at t (seconds for idle/walk, progress 0..1 otherwise), applied directly (blend < 1 lerps toward it). */
    pose(name, t = 0, blend = 1) { st.lastPose = name; applyPose(model, name, t, blend); },
    /** Fill a pose object (POSE_KEYS) for `name` at t without applying it (for damped blending by the behaviour code). */
    poseTarget(name, t = 0, out = pose) { return poseFill(model, name, t, out); },
    update(frameDt) { updateModel(model, st, springs, frameDt, rnd); },
    setLod(on) { setLod(st, model, on); },
    dispose() {
      root.parent?.remove(root);
      skeleton.dispose();
      TT.instances = Math.max(0, TT.instances - 1);
    },
    _st: st, _pose: pose, _kind: kind, _def: def, _anchors: anchors, _springs: springs,
  };
  const RIM_PROXY = [proxy], RIM_LOD = [lod];
  // v3 names (rig/spine/neck/arms/legs/hands/jaw + per-type aliases such as weapon, staff, gem, halo, tail1, sac, cap, orb, shield, core, eyes, legs)
  for (const n of ['rig', 'spine', 'neck', 'armR', 'armL', 'foreR', 'foreL', 'handR', 'handL', 'legR', 'legL', 'kneeR', 'kneeL', 'jaw', 'tail1', 'tail2']) if (B[n]) model[n] = B[n];
  for (const [alias, target] of Object.entries(def.aliases || {})) model[alias] = typeof target === 'function' ? target(B, anchors) : (B[target] || anchors[target]);
  if (def.quadLegs) { model.legs = def.quadLegs.map(([u, l]) => ({ up: B[u], low: B[l] })); model.quadruped = true; }
  if (def.variant) model.variant = def.variant;
  model._jawOpen = def.jawOpen ?? 0.35;
  if (opts.scale && opts.scale !== 1) root.scale.setScalar(opts.scale);
  TT.instances++;
  if (def.lids && B.lidL) { B.lidL.scale.y = def.lids.open; B.lidR.scale.y = def.lids.open; }
  def.onInstance?.(model, B, anchors);
  applyPose(model, 'idle', 0, 1);
  return model;
}

function poseFill(m, name, t, out) {
  const def = m._def;
  for (const k of POSE_KEYS) out[k] = 0;
  out.sqY = 1; out.sqXZ = 1; out.hipY = m.hipY;
  if (m._kind === 'humanoid') humanoidPose(name, t, out, m.hipY);
  const f = def.poses?.[name] || def.poses?.default;
  if (f) f(t, out, m, name);
  return out;
}
const _pp = newPose(0), _pc = newPose(0);
function applyPose(m, name, t, blend) {
  const def = m._def;
  if (def.applyPose) { def.applyPose(m, name, t, blend); return; }
  poseFill(m, name, t, _pp);
  if (blend < 1) {
    readHumanoid(m, _pc);
    for (const k of POSE_KEYS) _pp[k] = _pc[k] + (_pp[k] - _pc[k]) * blend;
  }
  applyHumanoidPose(m, _pp);
  def.afterPose?.(m, name, t, _pp);
}
function readHumanoid(m, p) {
  p.hipY = m.rig.position.y; p.hipZ = m.rig.position.z; p.pitch = m.rig.rotation.x; p.roll = m.rig.rotation.z; p.sqY = m.rig.scale.y; p.sqXZ = m.rig.scale.x;
  p.spineX = m.spine.rotation.x; p.spineY = m.spine.rotation.y; p.headX = m.neck.rotation.x; p.headY = m.neck.rotation.y; p.headZ = m.neck.rotation.z;
  p.aRx = m.armR.rotation.x; p.aRz = m.armR.rotation.z; p.fRx = m.foreR.rotation.x; p.aLx = m.armL.rotation.x; p.aLz = m.armL.rotation.z; p.fLx = m.foreL.rotation.x;
  p.lRx = m.legR.rotation.x; p.lRz = m.legR.rotation.z; p.kR = m.kneeR.rotation.x; p.lLx = m.legL.rotation.x; p.lLz = m.legL.rotation.z; p.kL = m.kneeL.rotation.x;
  const j = m.bones.jaw; p.jaw = j ? (j.rotation.x - (j.userData.rx0 || 0)) / (m._jawOpen || 0.35) : 0;
  const A = m.bones.all || m.bones; p.grip = A.fingersR ? A.fingersR.rotation.x / 1.2 : 0;
}

function setLod(st, m, on) {
  if (st.lod === on) return;
  st.lod = on;
  m.proxy.visible = !on && st.outline;
}
const _dist = { lod: 25, outline: 25 };
/** LOD / outline distances from the live quality budget (preset enemyLodDist × budget.enemyLodMul; outlines ≤ budget.enemyOutlineDist). Reused object. */
export function lodDistances() {
  const g = GAME, q = g?.quality, b = q?.budget;
  const preset = Settings.PRESETS?.[q?.preset] || Settings.PRESETS?.medium;
  const base = preset?.enemyLodDist ?? 25;
  _dist.lod = base * (b?.enemyLodMul ?? 1);
  _dist.outline = Math.min(b?.enemyOutlineDist ?? preset?.enemyOutlineDist ?? 25, _dist.lod);
  return _dist;
}
const _wp = new THREE.Vector3();
function updateModel(m, st, springs, dt, rnd) {
  const g = GAME;
  if (g?.frame && g.frame.lastStep === false) return;
  if (!(dt > 0)) return;
  if (dt > 0.1) dt = 0.1;
  st.t += dt;
  syncOutlineRes();
  const def = m._def;
  // ---- LOD + outline distance (hysteresis 1 m)
  const cam = g?.camera;
  if (cam) {
    const e = m.root.matrixWorld.elements, cp = cam.position;
    const dx = e[12] - cp.x, dy = e[13] - cp.y, dz = e[14] - cp.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const D = lodDistances(), lodD = D.lod, olD = D.outline;
    const h = st.lod ? -1 : 1;
    const lodOn = d > lodD + h;
    st.outline = d < olD - (m.proxy.visible ? -1 : 1);
    setLod(st, m, lodOn);
    m.proxy.visible = !st.lod && st.outline;
  }
  // ---- blink (seeded 3–6 s); lids scale-y 0 → 1
  const lids = def.lids;
  if (lids && m.bones.lidL) {
    st.blinkT += dt;
    let k = 0;
    if (st.blinkT >= st.blinkNext) {
      const u = (st.blinkT - st.blinkNext) / st.blinkDur;
      if (u >= 1) { st.blinkT = 0; st.blinkNext = 3 + rnd() * 3; } else k = Math.sin(u * Math.PI);
    }
    const base = m._lidBase ?? lids.open;
    const y = base + (lids.closed - base) * k;
    m.bones.lidL.scale.y = y; m.bones.lidR.scale.y = y;
  }
  // ---- springs: lag behind the parent's motion (model-local), plus a slow sway
  if (springs.length) {
    const yaw = m.root.rotation.y, cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (let i = 0; i < springs.length; i++) {
      const s = springs[i], par = s.b.parent;
      const e = par.matrixWorld.elements;
      _wp.set(e[12], e[13], e[14]);
      if (st.first) s.prev.copy(_wp);
      const vx = (_wp.x - s.prev.x) / dt, vy = (_wp.y - s.prev.y) / dt, vz = (_wp.z - s.prev.z) / dt;
      s.prev.copy(_wp);
      const fwd = vx * sy + vz * cy, side = vx * cy - vz * sy;   // model-local forward / right velocity
      const gain = s.gain || [0.08, 0.06];
      let tgt = s.off + (s.axis === 'z' ? side * gain[1] : -fwd * gain[0]) + (s.vy ? vy * s.vy : 0);
      tgt += Math.sin(st.t * (s.swayHz ?? 1.3) * TAU + s.ph) * (s.sway ?? 0.05);
      const mn = s.min ?? -0.9, mx = s.max ?? 0.9;
      tgt = tgt < mn ? mn : tgt > mx ? mx : tgt;
      const x = s.sp.update(dt, tgt);
      if (s.axis === 'z') s.b.rotation.z = s.rest + x; else s.b.rotation.x = s.rest + x;
    }
  }
  st.first = false;
  def.update?.(m, dt, st);
}

/** Build-cost numbers of every built type (for notes / MM1). */
export function stats() {
  const out = {};
  for (const [k, T2] of TYPES) out[k] = { tris: T2.tris, verts: T2.verts, kb: Math.round(T2.bytes / 1024), buildMs: T2.buildMs, instances: T2.instances };
  return out;
}

// =====================================================================================================================
// authoring helpers
// =====================================================================================================================
const _up = new THREE.Vector3();
/** Euler [x,y,z] that turns the primitive's `axis` ('y' cylinders/cones/capsules, 'z' tori) onto direction d. */
export function orient(d, axis = 'y') {
  _v.set(d[0], d[1], d[2]).normalize();
  _up.set(axis === 'z' ? 0 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
  _q.setFromUnitVectors(_up, _v); _e.setFromQuaternion(_q);
  return [_e.x, _e.y, _e.z];
}
/** Point + tangent on a polyline at u ∈ [0,1]. */
export function along(pts, u) {
  const n = pts.length - 1, f = Math.min(n - 1e-6, Math.max(0, u * n)), i = Math.floor(f), t = f - i;
  const a = pts[i], b = pts[i + 1];
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], d: [b[0] - a[0], b[1] - a[1], b[2] - a[2]] };
}
/** A ring band (torus) around a polyline (horn bands, wraps) at u. */
export function bandAt(boneName, pts, u, R, t, color, flags = {}) {
  const { p, d } = along(pts, u);
  return P(boneName, T(R, t, 10, 4), color, p, orient(d, 'z'), [1, 1, 1], { small: true, ...flags });
}
/** Smooth quadratic-bezier polyline from a → c with control b, n points. */
export function curve(a, b, c, n = 5) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1], u * u * a[2] + 2 * u * t * b[2] + t * t * c[2]]);
  }
  return out;
}
/** Hex lerp → THREE.Color (linear), for vertex-colour painters. */
export function mixInto(out, a, b, t) { _c.setHex(a); _c2.setHex(b); out.copy(_c).lerp(_c2, t < 0 ? 0 : t > 1 ? 1 : t); return out; }
/** Vertical gradient painter: c0 at local y0 → c1 at y1. */
export const grad = (c0, c1, y0, y1, axis = 'y') => (l, n, out) => mixInto(out, c0, c1, ((axis === 'y' ? l.y : axis === 'z' ? l.z : l.x) - y0) / (y1 - y0));
/** Belly painter: base colour on the back, belly colour where the local normal faces +z (front) and down. */
export const belly = (base, bel, k = 0.55) => (l, n, out) => mixInto(out, base, bel, (n.z * 0.8 - n.y * 0.4 - (1 - k)) / k);
