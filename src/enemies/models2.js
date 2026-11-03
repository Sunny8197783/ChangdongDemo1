// v3 regular-enemy models (CONTRACT §14): 수렁도마뱀, 포자 버섯병, 타락 늑대, 공허 망령, 공허 기사.
// Same pipeline as models.js: rigid-skinned pivots, ONE vertex-coloured toon SkinnedMesh + ONE skinned outline + ONE unlit glow
// slot per model (≈ 3 draw calls), geometry cached per kind and shared by every instance, shared materials only (no compiles).
import * as THREE from 'three';
import { P, mergeParts, vcMat, vcBasicMat, pivot, buildSkin } from './common.js';
import { humanoid } from './models.js';

const S = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const C = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
const K = (r, h, n = 8) => new THREE.ConeGeometry(r, h, n);
const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const CAP = (r, l, n = 8) => new THREE.CapsuleGeometry(r, l, 4, n);
const T = (r, t, n = 12) => new THREE.TorusGeometry(r, t, 6, n);
const OCT = (r) => new THREE.OctahedronGeometry(r, 0);

const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());
/** Brighten vertex colours (unlit glow slot; > 1 feeds the bloom). */
function glowify(geo, k) { const c = geo.attributes.color.array; for (let i = 0; i < c.length; i++) c[i] *= k; return geo; }

// ======================================================================= 수렁도마뱀 (lizard)
const LZ = { scale: 0x3f8a6a, scaleDark: 0x2a5f4c, belly: 0xc9d79a, frill: 0x2fb0c0, frillDark: 0x1f6f88, leather: 0x6a4a2e,
  bone: 0xe8dcb8, spear: 0x7a5a36, tip: 0xa8d8e0, eye: 0xffe04a };
function lizardGeos() {
  return once('lizard', () => ({
    torso: mergeParts([
      P(S(0.38, 14, 10), LZ.scale, [0, 0.3, 0], [0.15, 0, 0], [1.05, 1.15, 0.85]),
      P(S(0.3, 12, 9), LZ.belly, [0, 0.24, 0.16], [0.15, 0, 0], [0.9, 1.0, 0.55]),
      P(S(0.18), LZ.scale, [0.32, 0.52, 0], [0, 0, 0], [1.1, 0.9, 1]),
      P(S(0.18), LZ.scale, [-0.32, 0.52, 0], [0, 0, 0], [1.1, 0.9, 1]),
      // dorsal ridge spines
      P(K(0.06, 0.22, 5), LZ.frill, [0, 0.62, -0.22], [-0.6, 0, 0]),
      P(K(0.07, 0.26, 5), LZ.frill, [0, 0.42, -0.3], [-0.9, 0, 0]),
      P(K(0.06, 0.22, 5), LZ.frill, [0, 0.2, -0.32], [-1.2, 0, 0]),
      // shoulder strap + shell pauldron
      P(T(0.3, 0.03, 14), LZ.leather, [0, 0.42, 0.02], [Math.PI / 2 - 0.4, 0.5, 0], [1, 1, 1]),
      P(S(0.2, 10, 8), 0x8a7a5a, [0.36, 0.6, 0], [0, 0, -0.4], [1.1, 0.6, 1.1]),
      P(S(0.09, 8, 6), 0xd8c89a, [0.4, 0.68, 0.06]),
    ]),
    pelvis: mergeParts([
      P(S(0.28, 12, 9), LZ.scale, [0, 0, 0], [0, 0, 0], [1.1, 0.75, 0.95]),
      P(T(0.3, 0.05, 16), LZ.leather, [0, 0.05, 0], [Math.PI / 2, 0, 0], [1.05, 0.9, 1]),
      P(B(0.3, 0.34, 0.04), 0x5f8a4a, [0, -0.2, 0.27], [0.1, 0, 0]),
      P(B(0.34, 0.3, 0.04), 0x4a6a3a, [0, -0.18, -0.26], [-0.1, 0, 0]),
    ]),
    head: mergeParts([
      P(S(0.24, 14, 10), LZ.scale, [0, 0.12, 0.02], [0, 0, 0], [1, 0.9, 1.05]),
      P(S(0.17, 12, 9), LZ.scale, [0, 0.06, 0.28], [0.1, 0, 0], [0.95, 0.65, 1.5]),
      P(S(0.14, 10, 8), LZ.belly, [0, -0.02, 0.26], [0.1, 0, 0], [0.9, 0.45, 1.4]),
      // frill fan
      P(K(0.12, 0.42, 4), LZ.frill, [0.24, 0.16, -0.08], [0, 0.2, -1.1], [1, 1, 0.3]),
      P(K(0.12, 0.42, 4), LZ.frill, [-0.24, 0.16, -0.08], [0, -0.2, 1.1], [1, 1, 0.3]),
      P(K(0.1, 0.38, 4), LZ.frillDark, [0, 0.36, -0.12], [-0.5, 0, 0], [1, 1, 0.3]),
      P(S(0.05, 8, 6), 0x1a1a10, [0.11, 0.18, 0.18]),
      P(S(0.05, 8, 6), 0x1a1a10, [-0.11, 0.18, 0.18]),
      P(K(0.02, 0.06, 4), LZ.bone, [0.06, -0.04, 0.48], [Math.PI, 0, 0]),
      P(K(0.02, 0.06, 4), LZ.bone, [-0.06, -0.04, 0.48], [Math.PI, 0, 0]),
    ]),
    eyes: mergeParts([P(S(0.03, 6, 5), LZ.eye, [0.12, 0.19, 0.22]), P(S(0.03, 6, 5), LZ.eye, [-0.12, 0.19, 0.22])]),
    upperArm: mergeParts([P(CAP(0.1, 0.2), LZ.scale, [0, -0.16, 0])]),
    foreArm: mergeParts([
      P(CAP(0.09, 0.16), LZ.scaleDark, [0, -0.14, 0]),
      P(C(0.11, 0.11, 0.06, 8), LZ.leather, [0, -0.2, 0]),
      P(S(0.1, 8, 6), LZ.scale, [0, -0.32, 0.03]),
      P(K(0.02, 0.08, 4), LZ.bone, [0.05, -0.38, 0.09], [1.2, 0, 0]),
      P(K(0.02, 0.08, 4), LZ.bone, [-0.05, -0.38, 0.09], [1.2, 0, 0]),
    ]),
    thigh: mergeParts([P(CAP(0.13, 0.16), LZ.scale, [0, -0.15, 0.02])]),
    shin: mergeParts([
      P(CAP(0.1, 0.16), LZ.scaleDark, [0, -0.15, -0.04], [-0.2, 0, 0]),
      P(S(0.13, 9, 7), LZ.scale, [0, -0.32, 0.08], [0, 0, 0], [1, 0.45, 1.6]),
      P(K(0.025, 0.1, 4), LZ.bone, [0.06, -0.33, 0.28], [Math.PI / 2, 0, 0]),
      P(K(0.025, 0.1, 4), LZ.bone, [-0.06, -0.33, 0.28], [Math.PI / 2, 0, 0]),
    ]),
    tail1: mergeParts([P(K(0.2, 0.75, 10), LZ.scale, [0, 0, -0.36], [-Math.PI / 2, 0, 0], [1, 1, 0.8]), P(K(0.05, 0.18, 4), LZ.frill, [0, 0.14, -0.3], [-1.0, 0, 0])]),
    tail2: mergeParts([P(K(0.12, 0.7, 8), LZ.scaleDark, [0, 0, -0.34], [-Math.PI / 2, 0, 0], [1, 1, 0.8]), P(K(0.04, 0.14, 4), LZ.frill, [0, 0.08, -0.25], [-1.1, 0, 0])]),
    spear: mergeParts([
      P(C(0.025, 0.03, 2.1, 6), LZ.spear, [0, 0, 0.35], [Math.PI / 2, 0, 0]),
      P(T(0.035, 0.012, 6), 0xd0b070, [0, 0, 0.0]), P(T(0.035, 0.012, 6), 0xd0b070, [0, 0, 0.12]),
      P(K(0.07, 0.32, 4), LZ.tip, [0, 0, 1.55], [Math.PI / 2, 0, 0], [1, 1, 0.45]),
      P(K(0.035, 0.12, 4), LZ.bone, [0.06, 0, 1.36], [Math.PI / 2, 0, -0.6]),
      P(K(0.035, 0.12, 4), LZ.bone, [-0.06, 0, 1.36], [Math.PI / 2, 0, 0.6]),
      P(B(0.05, 0.18, 0.01), 0x2fb0c0, [0, -0.1, 1.28]),
    ]),
  }));
}
export function buildLizard() {
  const g = lizardGeos();
  const m = humanoid(g, { hipY: 0.86, neckY: 0.62, shoulderX: 0.42, shoulderY: 0.52, upperLen: 0.36, foreLen: 0.32, hipX: 0.19, thighLen: 0.36 });
  const tail1 = pivot(m.rig, 0, -0.02, -0.24), tail2 = pivot(tail1, 0, 0, -0.68);
  const spear = pivot(m.handR, 0, 0, 0); spear.rotation.x = -0.35;
  m.bones.push(tail1, tail2, spear);
  const n = m.bones.length;
  m.parts.push([n - 3, g.tail1], [n - 2, g.tail2], [n - 1, g.spear]);
  const glow = once('lizardGlow', () => glowify(g.eyes.clone(), 2.4));
  const sk = buildSkin('lizard', m.root, m.bones, [
    { name: 'body', mat: vcMat(), parts: m.parts, outline: 0.022 },
    { name: 'glow', mat: vcBasicMat(), parts: [[2, glow]], shadow: false },
  ], [1.0, 1.9]);
  Object.assign(m, { tail1, tail2, weapon: spear, skin: sk, outlines: sk.outlines, headTop: 2.05 });
  return m;
}

// ======================================================================= 포자 버섯병 (shroom)
const SR = { cap: 0xc9503f, capDark: 0x8a2f2a, spot: 0xf4ecd0, stem: 0xe8dcc0, stemDark: 0xc0ad8a, gill: 0xd8b8a0, moss: 0x6a9a3a, eye: 0xd8ff6a };
function shroomGeos() {
  return once('shroom', () => {
    const capG = new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const spots = [];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39, el = 0.35 + (i % 3) * 0.28;
      spots.push(P(S(0.07 + (i % 2) * 0.03, 8, 6), SR.spot, [Math.sin(a) * Math.sin(el) * 0.6, 0.12 + Math.cos(el) * 0.6, Math.cos(a) * Math.sin(el) * 0.6], [0, 0, 0], [1, 0.4, 1]));
    }
    return {
      torso: mergeParts([
        P(C(0.22, 0.3, 0.5, 12), SR.stem, [0, 0.22, 0]),
        P(S(0.26, 12, 9), SR.stemDark, [0, 0.05, 0], [0, 0, 0], [1.2, 0.7, 1.1]),
        P(C(0.31, 0.31, 0.06, 14), SR.moss, [0, 0.0, 0]),
        P(S(0.08), SR.moss, [0.2, 0.3, 0.17]), P(S(0.06), SR.moss, [-0.18, 0.12, 0.2]),
      ]),
      pelvis: mergeParts([P(S(0.26, 12, 9), SR.stemDark, [0, 0, 0], [0, 0, 0], [1.15, 0.7, 1.05])]),
      head: mergeParts([
        P(capG, SR.cap, [0, 0.12, 0], [0, 0, 0], [1, 0.78, 1]),
        P(new THREE.CylinderGeometry(0.56, 0.2, 0.1, 16, 1, true), SR.gill, [0, 0.1, 0]),
        P(T(0.58, 0.04, 18), SR.capDark, [0, 0.12, 0], [Math.PI / 2, 0, 0]),
        ...spots,
        // face on the stem top
        P(S(0.05, 8, 6), 0x1a1010, [0.1, -0.06, 0.24]), P(S(0.05, 8, 6), 0x1a1010, [-0.1, -0.06, 0.24]),
        P(B(0.12, 0.03, 0.02), 0x3a1a10, [0, -0.17, 0.27], [0, 0, 0]),
      ]),
      eyes: mergeParts([P(S(0.03, 6, 5), SR.eye, [0.1, -0.05, 0.28]), P(S(0.03, 6, 5), SR.eye, [-0.1, -0.05, 0.28])]),
      upperArm: mergeParts([P(CAP(0.07, 0.14), SR.stem, [0, -0.11, 0])]),
      foreArm: mergeParts([P(CAP(0.065, 0.12), SR.stemDark, [0, -0.1, 0]), P(S(0.09, 8, 6), SR.cap, [0, -0.22, 0], [0, 0, 0], [1, 0.6, 1])]),
      thigh: mergeParts([P(CAP(0.1, 0.06), SR.stemDark, [0, -0.08, 0])]),
      shin: mergeParts([P(CAP(0.09, 0.04), SR.stemDark, [0, -0.06, 0]), P(S(0.12, 8, 6), SR.stemDark, [0, -0.13, 0.04], [0, 0, 0], [1.1, 0.5, 1.4])]),
      sac: mergeParts([P(S(0.16, 10, 8), 0xb0e05a, [0, 0, 0]), P(S(0.06), 0xe8ff9a, [0.05, 0.1, 0.06])]),
    };
  });
}
export function buildShroom() {
  const g = shroomGeos();
  const m = humanoid(g, { hipY: 0.42, neckY: 0.56, shoulderX: 0.28, shoulderY: 0.36, upperLen: 0.24, foreLen: 0.2, hipX: 0.16, thighLen: 0.16 });
  const sac = pivot(m.spine, 0, 0.26, -0.3);
  m.bones.push(sac); m.parts.push([m.bones.length - 1, g.sac]);
  const glow = once('shroomGlow', () => glowify(g.eyes.clone(), 2.2));
  const sk = buildSkin('shroom', m.root, m.bones, [
    { name: 'body', mat: vcMat(), parts: m.parts, outline: 0.024 },
    { name: 'glow', mat: vcBasicMat(), parts: [[2, glow]], shadow: false },
  ], [0.8, 1.3]);
  Object.assign(m, { sac, skin: sk, outlines: sk.outlines, headTop: 1.55, cap: m.neck });
  return m;
}

// ======================================================================= 타락 늑대 (wolf, void-touched)
const WF = { fur: 0x3a3448, furDark: 0x231f2e, furLight: 0x5a5070, mane: 0x2a1f3a, claw: 0xd8d0e0, void: 0xb06aff, eye: 0xd9a0ff, nose: 0x15101c };
function wolfGeos() {
  return once('wolf', () => ({
    body: mergeParts([
      P(S(0.42, 14, 10), WF.fur, [0, 0, 0.12], [0, 0, 0], [0.85, 0.8, 1.35]),
      P(S(0.36, 12, 9), WF.furDark, [0, -0.02, -0.38], [0, 0, 0], [0.8, 0.75, 1.0]),
      P(S(0.3, 12, 9), WF.furLight, [0, -0.14, 0.2], [0, 0, 0], [0.7, 0.5, 1.1]),
      // mane ridge (tufts)
      ...[0, 1, 2, 3, 4].map((i) => P(K(0.09, 0.32 - i * 0.03, 5), WF.mane, [0, 0.3 - i * 0.02, 0.34 - i * 0.18], [-1.2, 0, 0])),
      P(K(0.07, 0.24, 4), WF.mane, [0.16, 0.22, 0.3], [-1.0, 0, -0.5]),
      P(K(0.07, 0.24, 4), WF.mane, [-0.16, 0.22, 0.3], [-1.0, 0, 0.5]),
    ]),
    head: mergeParts([
      P(S(0.24, 12, 9), WF.fur, [0, 0.04, 0.05], [0, 0, 0], [0.95, 0.85, 1.05]),
      P(S(0.14, 10, 8), WF.furDark, [0, -0.02, 0.3], [0.1, 0, 0], [0.8, 0.65, 1.5]),
      P(S(0.045, 6, 5), WF.nose, [0, 0.02, 0.5]),
      P(K(0.07, 0.24, 4), WF.furDark, [0.12, 0.26, -0.02], [-0.2, 0, -0.25]),
      P(K(0.07, 0.24, 4), WF.furDark, [-0.12, 0.26, -0.02], [-0.2, 0, 0.25]),
      P(K(0.08, 0.2, 4), WF.mane, [0, 0.16, -0.18], [-1.4, 0, 0]),
    ]),
    jaw: mergeParts([
      P(S(0.11, 9, 7), WF.furLight, [0, -0.02, 0.18], [0, 0, 0], [0.8, 0.4, 1.6]),
      P(K(0.018, 0.07, 4), WF.claw, [0.05, 0.03, 0.3], [0, 0, 0]),
      P(K(0.018, 0.07, 4), WF.claw, [-0.05, 0.03, 0.3], [0, 0, 0]),
    ]),
    upperLeg: mergeParts([P(CAP(0.09, 0.22), WF.fur, [0, -0.17, 0])]),
    lowerLeg: mergeParts([P(CAP(0.065, 0.22), WF.furDark, [0, -0.15, 0]), P(S(0.08, 8, 6), WF.furDark, [0, -0.32, 0.05], [0, 0, 0], [1, 0.5, 1.4]),
      P(K(0.015, 0.06, 4), WF.claw, [0.03, -0.34, 0.14], [Math.PI / 2, 0, 0]), P(K(0.015, 0.06, 4), WF.claw, [-0.03, -0.34, 0.14], [Math.PI / 2, 0, 0])]),
    tail1: mergeParts([P(K(0.12, 0.5, 8), WF.fur, [0, 0, -0.22], [-Math.PI / 2, 0, 0])]),
    tail2: mergeParts([P(K(0.09, 0.42, 6), WF.mane, [0, 0, -0.2], [-Math.PI / 2, 0, 0])]),
    glowHead: glowify(mergeParts([
      P(S(0.035, 6, 5), WF.eye, [0.1, 0.1, 0.24], [0, 0, 0], [1.4, 0.7, 0.6]), P(S(0.035, 6, 5), WF.eye, [-0.1, 0.1, 0.24], [0, 0, 0], [1.4, 0.7, 0.6]),
    ]), 2.6),
    glowBody: glowify(mergeParts([
      // void cracks along the flanks
      P(B(0.02, 0.18, 0.02), WF.void, [0.33, 0.05, 0.1], [0.3, 0, 0.2]), P(B(0.02, 0.14, 0.02), WF.void, [0.31, 0.0, -0.2], [-0.4, 0, 0.2]),
      P(B(0.02, 0.18, 0.02), WF.void, [-0.33, 0.05, 0.1], [0.3, 0, -0.2]), P(B(0.02, 0.14, 0.02), WF.void, [-0.31, 0.0, -0.2], [-0.4, 0, -0.2]),
      P(OCT(0.05), WF.void, [0, 0.33, 0.1]),
    ]), 1.8),
  }));
}
export function buildWolf() {
  const g = wolfGeos();
  const root = new THREE.Group();
  const rig = pivot(root, 0, 0.62, 0);
  const neck = pivot(rig, 0, 0.18, 0.55);
  const jaw = pivot(neck, 0, -0.06, 0.14);
  const legs = [[0.17, 0.42], [-0.17, 0.42], [0.16, -0.42], [-0.16, -0.42]].map(([x, z]) => {
    const up = pivot(rig, x, -0.08, z), low = pivot(up, 0, -0.32, 0);
    return { up, low };
  });
  const tail1 = pivot(rig, 0, 0.12, -0.7), tail2 = pivot(tail1, 0, 0, -0.42);
  const bones = [rig, neck, jaw, tail1, tail2];
  const parts = [[0, g.body], [1, g.head], [2, g.jaw], [3, g.tail1], [4, g.tail2]];
  for (const L of legs) { bones.push(L.up); parts.push([bones.length - 1, g.upperLeg]); bones.push(L.low); parts.push([bones.length - 1, g.lowerLeg]); }
  const sk = buildSkin('wolf', root, bones, [
    { name: 'body', mat: vcMat(), parts, outline: 0.02 },
    { name: 'glow', mat: vcBasicMat(), parts: [[1, g.glowHead], [0, g.glowBody]], shadow: false },
  ], [0.6, 1.3]);
  return { root, rig, neck, jaw, legs, tail1, tail2, skin: sk, outlines: sk.outlines, headTop: 1.1, quadruped: true };
}

// ======================================================================= 공허 망령 (wraith)
const WR = { robe: 0x2a1f3e, robeDark: 0x160f24, trim: 0x6a4aa0, bone: 0xd8d0e8, void: 0xb36bff, core: 0xe6c8ff };
function wraithGeos() {
  return once('wraith', () => {
    const skirt = new THREE.ConeGeometry(0.5, 1.1, 10, 3, true);
    { // ragged hem
      const p = skirt.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.5) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, y - 0.08 - Math.abs(Math.sin(a * 5)) * 0.22); } }
      skirt.computeVertexNormals();
    }
    return {
      torso: mergeParts([
        P(S(0.3, 12, 9), WR.robe, [0, 0.26, 0], [0, 0, 0], [1.1, 1.15, 0.85]),
        P(S(0.16), WR.robe, [0.28, 0.44, 0], [0, 0, 0], [1.2, 0.8, 1]), P(S(0.16), WR.robe, [-0.28, 0.44, 0], [0, 0, 0], [1.2, 0.8, 1]),
        P(T(0.24, 0.03, 12), WR.trim, [0, 0.46, 0.04], [Math.PI / 2 - 0.3, 0, 0]),
        P(K(0.36, 0.5, 10), WR.robeDark, [0, 0.62, -0.16], [-0.9, 0, 0], [1, 1, 0.7]),
        // ribcage hint (bone)
        P(T(0.12, 0.015, 8), WR.bone, [0, 0.3, 0.2], [0, 0, 0], [1, 0.6, 1]), P(T(0.1, 0.015, 8), WR.bone, [0, 0.2, 0.2], [0, 0, 0], [1, 0.6, 1]),
      ]),
      pelvis: mergeParts([P(skirt, WR.robe, [0, -0.45, 0]), P(new THREE.ConeGeometry(0.42, 0.9, 10, 1, true), WR.robeDark, [0, -0.4, -0.03])]),
      head: mergeParts([
        P(new THREE.SphereGeometry(0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.65), WR.robeDark, [0, 0.14, -0.04], [-0.3, 0, 0], [1, 1.1, 1.1]),
        P(K(0.18, 0.55, 8), WR.robeDark, [0, 0.36, -0.42], [-2.2, 0, 0]),
        P(S(0.2, 12, 9), 0x0a0612, [0, 0.08, 0.06]),
        P(T(0.29, 0.03, 14), WR.trim, [0, 0.1, 0.16], [0.35, 0, 0], [1, 1.1, 1]),
      ]),
      upperArm: mergeParts([P(C(0.08, 0.13, 0.32, 8), WR.robe, [0, -0.15, 0])]),
      foreArm: mergeParts([
        P(C(0.14, 0.2, 0.32, 8, 1), WR.robeDark, [0, -0.14, 0]),
        P(B(0.03, 0.16, 0.02), WR.bone, [0.03, -0.36, 0.03], [0.2, 0, 0.1]), P(B(0.03, 0.18, 0.02), WR.bone, [-0.01, -0.37, 0.04], [0.2, 0, 0]),
        P(B(0.03, 0.15, 0.02), WR.bone, [-0.05, -0.35, 0.03], [0.2, 0, -0.1]),
      ]),
      thigh: mergeParts([P(B(0.04, 0.3, 0.02), WR.robeDark, [0, -0.2, 0.05])]),
      shin: mergeParts([P(B(0.03, 0.2, 0.02), WR.robeDark, [0, -0.1, 0.05])]),
      glowHead: glowify(mergeParts([
        P(S(0.045, 8, 6), WR.core, [0.08, 0.1, 0.22], [0, 0, 0], [1.3, 0.6, 0.5]), P(S(0.045, 8, 6), WR.core, [-0.08, 0.1, 0.22], [0, 0, 0], [1.3, 0.6, 0.5]),
      ]), 2.8),
      glowBody: glowify(mergeParts([P(OCT(0.09), WR.void, [0, 0.28, 0.16]), P(T(0.16, 0.012, 10), WR.void, [0, -0.2, 0], [Math.PI / 2, 0, 0])]), 2.0),
      orb: glowify(mergeParts([P(S(0.11, 10, 8), WR.core)]), 2.4),
    };
  });
}
export function buildWraith() {
  const g = wraithGeos();
  const m = humanoid(g, { hipY: 1.15, neckY: 0.6, shoulderX: 0.36, shoulderY: 0.44, upperLen: 0.34, foreLen: 0.32, hipX: 0.12, thighLen: 0.3 });
  const orb = pivot(m.handL, 0, -0.12, 0.08);
  m.bones.push(orb);
  const iOrb = m.bones.length - 1;
  const sk = buildSkin('wraith', m.root, m.bones, [
    { name: 'body', mat: vcMat(), parts: m.parts, outline: 0.02 },
    { name: 'glow', mat: vcBasicMat(), parts: [[2, g.glowHead], [1, g.glowBody], [iOrb, g.orb]], shadow: false },
  ], [1.2, 1.6]);
  Object.assign(m, { orb, skin: sk, outlines: sk.outlines, headTop: 2.3 });
  return m;
}

// ======================================================================= 공허 기사 (voidknight, elite)
const VK = { plate: 0x2a2534, plateLight: 0x4a4258, plateDark: 0x15121c, trim: 0x8a7aa8, cloth: 0x3a1f5a, void: 0xb36bff, core: 0xf0d8ff, leather: 0x2a1e18 };
function knightGeos() {
  return once('voidknight', () => ({
    torso: mergeParts([
      P(S(0.44, 14, 10), VK.plate, [0, 0.32, 0], [0, 0, 0], [1.15, 1.1, 0.85]),
      P(B(0.5, 0.42, 0.12), VK.plateLight, [0, 0.36, 0.3], [-0.1, 0, 0]),
      P(B(0.1, 0.42, 0.13), VK.trim, [0, 0.36, 0.31], [-0.1, 0, 0]),
      // pauldrons (layered)
      P(S(0.27, 12, 9), VK.plate, [0.48, 0.6, 0], [0, 0, -0.35], [1.2, 0.75, 1.15]),
      P(S(0.22, 10, 8), VK.plateLight, [0.52, 0.5, 0], [0, 0, -0.55], [1.15, 0.6, 1.1]),
      P(S(0.27, 12, 9), VK.plate, [-0.48, 0.6, 0], [0, 0, 0.35], [1.2, 0.75, 1.15]),
      P(S(0.22, 10, 8), VK.plateLight, [-0.52, 0.5, 0], [0, 0, 0.55], [1.15, 0.6, 1.1]),
      P(K(0.07, 0.34, 5), VK.plateDark, [0.55, 0.82, -0.04], [0, 0, -0.5]),
      P(K(0.07, 0.34, 5), VK.plateDark, [-0.55, 0.82, -0.04], [0, 0, 0.5]),
      // tattered cape
      P(B(0.62, 0.95, 0.04), VK.cloth, [0, 0.05, -0.36], [0.12, 0, 0]),
      P(K(0.1, 0.26, 4), VK.cloth, [0.2, -0.48, -0.42], [Math.PI, 0, 0], [1, 1, 0.3]),
      P(K(0.1, 0.3, 4), VK.cloth, [-0.14, -0.5, -0.42], [Math.PI, 0, 0], [1, 1, 0.3]),
    ]),
    pelvis: mergeParts([
      P(S(0.34, 12, 9), VK.plateDark, [0, 0, 0], [0, 0, 0], [1.15, 0.7, 0.95]),
      P(T(0.36, 0.06, 16), VK.leather, [0, 0.06, 0], [Math.PI / 2, 0, 0]),
      P(B(0.14, 0.12, 0.05), VK.trim, [0, 0.06, 0.34]),
      P(B(0.26, 0.46, 0.05), VK.plate, [0.2, -0.24, 0.24], [0.1, 0, -0.08]),
      P(B(0.26, 0.46, 0.05), VK.plate, [-0.2, -0.24, 0.24], [0.1, 0, 0.08]),
      P(B(0.5, 0.5, 0.05), VK.cloth, [0, -0.25, -0.28], [-0.08, 0, 0]),
    ]),
    head: mergeParts([
      P(S(0.26, 14, 10), VK.plate, [0, 0.14, 0], [0, 0, 0], [1, 1.12, 1.08]),
      P(B(0.36, 0.06, 0.1), VK.plateDark, [0, 0.14, 0.22]),        // visor slit frame
      P(K(0.2, 0.2, 8), VK.plateLight, [0, 0.0, 0.18], [Math.PI / 2 + 0.3, 0, 0], [1, 1, 0.6]),
      P(K(0.05, 0.42, 5), VK.plateDark, [0.2, 0.44, -0.06], [-0.4, 0, -0.45]),
      P(K(0.05, 0.42, 5), VK.plateDark, [-0.2, 0.44, -0.06], [-0.4, 0, 0.45]),
      P(B(0.04, 0.24, 0.32), VK.trim, [0, 0.36, -0.02]),
    ]),
    upperArm: mergeParts([P(CAP(0.13, 0.22), VK.plateDark, [0, -0.18, 0]), P(S(0.13, 10, 8), VK.plate, [0, -0.02, 0])]),
    foreArm: mergeParts([P(CAP(0.12, 0.18), VK.plate, [0, -0.16, 0]), P(C(0.16, 0.13, 0.2, 8), VK.plateLight, [0, -0.26, 0]), P(S(0.12, 10, 8), VK.plateDark, [0, -0.4, 0.02])]),
    thigh: mergeParts([P(CAP(0.15, 0.2), VK.plateDark, [0, -0.18, 0]), P(B(0.2, 0.3, 0.06), VK.plate, [0, -0.16, 0.14])]),
    shin: mergeParts([P(CAP(0.13, 0.2), VK.plate, [0, -0.17, 0]), P(S(0.12, 9, 7), VK.plateLight, [0, -0.02, 0.1]), P(B(0.2, 0.1, 0.34), VK.plateDark, [0, -0.4, 0.08])]),
    sword: mergeParts([
      P(B(0.06, 0.06, 0.34), VK.leather, [0, 0, 0.02]),
      P(B(0.48, 0.06, 0.08), VK.plateLight, [0, 0, 0.22]),
      P(OCT(0.06), VK.trim, [0, 0, -0.18]),
      P(B(0.15, 0.025, 1.5), 0x3a3448, [0, 0, 1.0]),
      P(K(0.075, 0.24, 4), 0x3a3448, [0, 0, 1.86], [Math.PI / 2, 0, 0], [1, 1, 0.17]),
    ]),
    shield: mergeParts([
      P(C(0.46, 0.46, 0.08, 6), VK.plate, [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1.3, 1]),
      P(C(0.5, 0.5, 0.05, 6), VK.plateDark, [0, 0, -0.03], [Math.PI / 2, 0, 0], [1, 1.3, 1]),
      P(K(0.12, 0.22, 6), VK.trim, [0, 0, 0.1], [Math.PI / 2, 0, 0]),
      P(B(0.06, 0.7, 0.04), VK.trim, [0, 0, 0.05]),
    ]),
    glowHead: glowify(mergeParts([P(B(0.26, 0.03, 0.02), VK.core, [0, 0.14, 0.27])]), 2.8),
    glowBody: glowify(mergeParts([
      P(OCT(0.1), VK.void, [0, 0.4, 0.37]),
      P(B(0.02, 0.24, 0.02), VK.void, [0.16, 0.24, 0.36], [0, 0, 0.5]), P(B(0.02, 0.2, 0.02), VK.void, [-0.14, 0.5, 0.36], [0, 0, -0.6]),
    ]), 2.0),
    glowSword: glowify(mergeParts([P(B(0.03, 0.03, 1.4), VK.void, [0, 0.02, 1.0])]), 2.2),
    glowShield: glowify(mergeParts([P(T(0.3, 0.02, 6), VK.void, [0, 0, 0.06], [0, 0, Math.PI / 6], [1, 1.3, 1])]), 1.8),
  }));
}
export function buildVoidKnight() {
  const g = knightGeos();
  const m = humanoid(g, { hipY: 1.02, neckY: 0.82, shoulderX: 0.56, shoulderY: 0.6, upperLen: 0.42, foreLen: 0.38, hipX: 0.23, thighLen: 0.44 });
  const sword = pivot(m.handR, 0, 0, 0); sword.rotation.x = -0.4;
  const shield = pivot(m.foreL, 0.12, -0.22, 0.1); shield.rotation.y = -0.2;
  m.bones.push(sword, shield);
  const iS = m.bones.length - 2, iSh = m.bones.length - 1;
  m.parts.push([iS, g.sword], [iSh, g.shield]);
  const sk = buildSkin('voidknight', m.root, m.bones, [
    { name: 'body', mat: vcMat(), parts: m.parts, outline: 0.026 },
    { name: 'glow', mat: vcBasicMat(), parts: [[2, g.glowHead], [1, g.glowBody], [iS, g.glowSword], [iSh, g.glowShield]], shadow: false },
  ], [1.3, 2.2]);
  Object.assign(m, { weapon: sword, shield, skin: sk, outlines: sk.outlines, headTop: 2.6 });
  return m;
}
