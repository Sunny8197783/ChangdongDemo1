// Boss rig helpers (PLAN v4 §4.0 model contract for the humanoid bosses: nox, kalis, treant). Owned by bosses.
//   proxyParts(m, d)    → [[boneIndex, geo]…] a low-poly silhouette (pelvis, torso, head, limbs) for the outline proxy / rim / shadow caster
//   strips(parent, n, o) → spring strip chains (cloak / vines / cape) driven by the existing Spring class on lastStep
//   contract(m, o)      → fills the EnemyModel fields on a humanoid() model built with buildSkin (meshes, proxy, lod, bones, rimSource, …)
import * as THREE from 'three';
import { P, mergeParts, pivot, Spring } from '../common.js';

const Sg = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const Cy = (rt, rb, h, n = 6) => new THREE.CylinderGeometry(rt, rb, h, n);

/** Low-poly silhouette parts for a humanoid() model (bone order of models.js humanoid). d = radii / lengths. */
export function proxyParts(m, d) {
  const c = 0x202020;
  const limb = (r0, r1, len) => mergeParts([P(Cy(r1, r0, len, 6), c, [0, -len / 2, 0])]);
  const out = [
    [0, mergeParts([P(Sg(1), c, [0, d.pelvisY ?? 0, 0], [0, 0, 0], d.pelvis)])],
    [1, mergeParts([P(Sg(1), c, [0, d.torsoY, 0], [0, 0, 0], d.torso)])],
    [2, mergeParts([P(Sg(1), c, [0, d.headY, d.headZ ?? 0], [0, 0, 0], d.head)])],
    [3, limb(d.arm[0], d.arm[0] * 0.9, d.upperLen)], [4, limb(d.arm[0], d.arm[0] * 0.9, d.upperLen)],
    [5, limb(d.arm[1], d.arm[1] * 0.85, d.foreLen)], [6, limb(d.arm[1], d.arm[1] * 0.85, d.foreLen)],
    [9, limb(d.leg[0], d.leg[0] * 0.9, d.thighLen)], [10, limb(d.leg[0], d.leg[0] * 0.9, d.thighLen)],
    [11, limb(d.leg[1], d.leg[1] * 0.8, d.shinLen)], [12, limb(d.leg[1], d.leg[1] * 0.8, d.shinLen)],
  ];
  return out;
}

/**
 * n spring strips hanging from `parent` (each a 2-bone chain: root pivot + tip pivot), spread along x.
 * o: {x0, dx, y, z, len, rx (rest pitch), bones (array to push into), parts (array), geo (strip geo), k, d}
 */
export function strips(parent, n, o) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const b0 = pivot(parent, o.x0 + i * o.dx, o.y, o.z + (o.dz || 0) * Math.abs(i - (n - 1) / 2));
    b0.rotation.x = o.rx || 0;
    const b1 = pivot(b0, 0, -o.len, 0);
    o.bones.push(b0); const i0 = o.bones.length - 1;
    o.bones.push(b1); const i1 = o.bones.length - 1;
    o.parts.push([i0, o.geo], [i1, o.geo2 || o.geo]);
    list.push({ b0, b1, rest: o.rx || 0, a: new Spring(o.k ?? 70, o.d ?? 7), c: new Spring((o.k ?? 70) * 1.4, (o.d ?? 7) * 1.1), ph: i * 1.3, side: Math.sign(o.x0 + i * o.dx) });
  }
  return list;
}
/** Drive strips: they trail behind the body's motion (vel = world velocity of the parent, local frame ignored for cost). */
export function updateStrips(list, dt, t, swing = 0, lean = 0) {
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    s.b0.rotation.x = s.rest + s.a.update(dt, swing - lean + Math.sin(t * 1.4 + s.ph) * 0.05);
    s.b0.rotation.z = Math.sin(t * 0.9 + s.ph) * 0.04 * s.side;
    s.b1.rotation.x = s.c.update(dt, (s.b0.rotation.x - s.rest) * 0.5);
  }
}

/** Fill the §4.0 EnemyModel fields on a humanoid model whose skin has slots body/glow/proxy. */
export function contract(m, o = {}) {
  const sk = m.skin;
  const proxy = sk.meshes.proxy;
  if (proxy) { proxy.name = 'outline'; proxy.castShadow = true; proxy.receiveShadow = false; }
  const rim = proxy ? [proxy] : [];
  m.isV4 = true;
  m.meshes = Object.keys(sk.meshes).filter((k) => k !== 'proxy').map((k) => sk.meshes[k]);
  m.proxy = proxy || null; m.lod = proxy || null;
  m.outlines = rim.slice();
  m.flashUniform = m.flashUniform || { value: 0 };
  m.rimSource = () => rim;
  m.bones = { root: m.rig, spine: m.spine, head: m.neck, armL: m.armL, armR: m.armR, handL: m.handL, handR: m.handR, legL: m.legL, legR: m.legR, ...(o.bones || {}) };
  m.tellAnchors = { head: m.neck, hand: m.handR, weapon: o.weapon || m.handR, mouth: m.neck, core: o.core || m.spine };
  m.features = { face: true, hands: true, springs: o.springs || 0, aoVertexColors: true, lod: false, ...(o.features || {}) };
  m.pose = m.pose || (() => {});
  m.update = o.update || (() => {});
  m.dispose = () => {};
  return m;
}
