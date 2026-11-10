// 고대 바위 골렘 — v4 model (PLAN §4.9, §4.0 contract). Owned by bosses. ≤ 14k body tris + a silhouette proxy (outline, rim, shadow).
//   detail-2 rocks (one bone each, so they can bob), carved rune strips and crack seams in the phase colour (one unlit material whose colour
//   is a uniform: phase 2 = brighter red, never a program flip), a crystal core inside a 4-segment rock cage ring that opens when staggered,
//   fists as rock clusters with knuckle shards, moss strands on springs (Spring), and a thrown-rock mesh for golem.throw.
// buildGolemModel() → EnemyModel-shaped object with the humanoid pose bones used by golem.js (rig, spine, neck, armR/L, foreR/L, legR/L, kneeR/L).
import * as THREE from 'three';
import { P, mergeParts, vcFlatMat, vcMat, pivot, buildSkin, rockGeo, skinOutlineMat, Spring } from '../common.js';

export const GOLEM_COLORS = { p1: 0x5fc8f0, p2: 0xf06a48, rune1: 0x4fb0dc, rune2: 0xe0603c };
const STONE = 0x8f887a, STONE_D = 0x6d675c, STONE_L = 0xa59c8a, MOSS = 0x6f9a48, MOSS_D = 0x4f7434;
const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const K = (r, h, n = 5) => new THREE.ConeGeometry(r, h, n);

let shared = null;
function geos() {
  if (shared) return shared;
  const rock = (r, seed, sq, d = 2, moss = true) => rockGeo(r, seed, sq, d, moss ? 0x7fae4e : null, STONE);
  const lo = (r, seed, sq) => rockGeo(r, seed, sq, 0, null, STONE);
  // rune strip: a carved groove (dark stone lip) + the glowing inlay on top, oriented on a rock face
  const runeGeo = mergeParts([P(B(0.08, 0.62, 0.06), 0xc8e4f2, [0, 0, 0]), P(B(0.26, 0.06, 0.06), 0xc8e4f2, [0, 0.18, 0]), P(B(0.2, 0.06, 0.06), 0xc8e4f2, [0, -0.16, 0])]);
  const seamGeo = mergeParts([P(B(0.05, 0.5, 0.05), 0xb8dcee, [0, 0, 0], [0, 0, 0.35]), P(B(0.04, 0.34, 0.05), 0xb8dcee, [0.1, -0.36, 0], [0, 0, -0.4])]);
  const coreGeo = new THREE.OctahedronGeometry(0.62, 1); coreGeo.scale(0.85, 1.25, 0.6);
  const coreInner = new THREE.OctahedronGeometry(0.26, 0); coreInner.scale(0.8, 1.3, 0.7);
  const coreMerged = mergeParts([P(coreGeo, 0xbfe6f4, [0, 0, 0]), P(coreInner, 0xe2f2f8, [0, 0, 0.12])]);
  // cage: 4 rock arcs around the core (each its own bone so they can swing open)
  const arc = mergeParts([P(new THREE.TorusGeometry(0.78, 0.13, 6, 8, Math.PI / 2 - 0.12), STONE_D, [0, 0, 0], [0, 0, 0.06], [1, 1.3, 1]),
    P(K(0.08, 0.3, 4), STONE_L, [0.55, 0.55, 0.05], [0, 0, -0.8])]);
  const knuckles = mergeParts([0, 1, 2, 3].map((i) => P(K(0.12, 0.42, 5), STONE_L, [-0.36 + i * 0.24, -0.62, 0.45], [1.25, 0, 0])));
  const strand = mergeParts([P(K(0.09, 0.9, 5), MOSS, [0, -0.45, 0], [Math.PI, 0, 0]), P(K(0.06, 0.5, 5), MOSS_D, [0.06, -0.75, 0.02], [Math.PI, 0, 0.2])]);
  // face (review: readable from the front): deep-set glowing eye slits under a heavy brow, a glowing mouth crack
  const eyes = mergeParts([P(B(0.36, 0.12, 0.12), 0xd2f0fa, [0.3, 0.5, 0.86], [0, 0, -0.22]), P(B(0.36, 0.12, 0.12), 0xd2f0fa, [-0.3, 0.5, 0.86], [0, 0, 0.22]),
    P(B(0.1, 0.1, 0.05), 0xe8f6fb, [0.32, 0.51, 0.93]), P(B(0.1, 0.1, 0.05), 0xe8f6fb, [-0.28, 0.51, 0.93]),
    P(B(0.5, 0.06, 0.08), 0xb8dcee, [0, 0.16, 0.9], [0, 0, 0.06]), P(B(0.16, 0.05, 0.08), 0xb8dcee, [0.3, 0.2, 0.86], [0, 0.3, -0.4])]);
  const brow = mergeParts([P(B(1.3, 0.22, 0.4), STONE_D, [0, 0.68, 0.8], [0.3, 0, 0]), P(B(0.9, 0.2, 0.3), STONE_D, [0, 0.02, 0.84], [-0.2, 0, 0])]);
  shared = { rock, lo, runeGeo, seamGeo, coreMerged, arc, knuckles, strand, eyes, brow };
  return shared;
}

/** Build one golem model (one per fight; geometry built here, materials per instance so the phase colour is a uniform). */
let _glowMat = null;
export function buildGolemModel() {
  const G = geos();
  const root = new THREE.Group(); root.name = 'golem';
  const rig = pivot(root, 0, 2.55, 0);
  const bones = [rig], rocks = [], glowParts = [], proxyParts = [], rockParts = [], floaters = [];
  const bi = (b) => { let i = bones.indexOf(b); if (i < 0) { bones.push(b); i = bones.length - 1; } return i; };
  /** One rock on its own bone (+ its low-poly silhouette in the proxy). */
  const R = (parent, r, seed, sq, moss = true, x = 0, y = 0, z = 0, d = 2, proxy = true) => {
    const b = pivot(parent, x, y, z);
    const geo = G.rock(r, seed, sq, d, moss);
    rocks.push([bi(b), geo]); rockParts.push({ geo, bone: b });
    if (proxy) proxyParts.push([bi(b), G.lo(r * 1.02, seed, sq)]);
    return b;
  };
  const fl = (b, amp = 0.06) => { floaters.push({ mesh: b, baseY: b.position.y, ph: (floaters.length * 1.7) % 6.28, amp }); return b; };
  const at = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = geo.clone(); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
  const rune = (b, x, y, z, ry = 0, rz = 0) => glowParts.push([bi(b), at(G.runeGeo, x, y, z, 0, ry, rz)]);
  const seam = (b, x, y, z, ry = 0, rz = 0) => glowParts.push([bi(b), at(G.seamGeo, x, y, z, 0, ry, rz)]);

  // ---- torso
  fl(R(rig, 0.95, 2, [1.2, 0.7, 0.95]));
  const spine = pivot(rig, 0, 0.75, 0);
  const chest = R(spine, 1.55, 5, [1.25, 1.0, 0.92], true, 0, 1.15, -0.05);
  rune(chest, 0.95, 0.35, 1.0, 0.6); rune(chest, -0.95, 0.35, 1.0, -0.6); seam(chest, 0.45, -0.55, 1.25, 0.2); seam(chest, -0.5, 0.75, 1.15, -0.3, 0.4);
  fl(R(spine, 0.7, 9, [1, 0.8, 0.7], true, 0.7, 2.0, -0.95));
  fl(R(spine, 0.6, 11, [1, 0.9, 0.7], true, -0.8, 1.8, -1.0));
  seam(spine, 0, 1.4, -1.35, Math.PI);
  // crystal core inside the cage ring (the weak point)
  const coreGroup = pivot(spine, 0, 1.1, 1.38);
  const core = pivot(coreGroup);
  glowParts.push([bi(core), G.coreMerged]);
  const cage = [];
  for (let k = 0; k < 4; k++) {
    const b = pivot(coreGroup); b.rotation.z = k * Math.PI / 2;
    const hinge = pivot(b); rocks.push([bi(hinge), G.arc]); proxyParts.push([bi(hinge), G.arc]);
    cage.push(hinge);
  }
  // ---- head
  const neck = pivot(spine, 0, 2.35, 0.25);
  const head = fl(R(neck, 0.74, 17, [1.25, 0.85, 1.0], false, 0, 0.42, 0.08), 0.04);
  rocks.push([bi(neck), G.brow]);
  glowParts.push([bi(neck), G.eyes]);
  R(neck, 0.35, 21, [2.2, 0.5, 0.8], true, 0, 0.72, 0.45, 1, false);
  // ---- arms (rock-cluster fists with knuckle shards)
  const springs = [];
  const arm = (side) => {
    const sh = pivot(spine, side * 2.05, 1.7, 0);
    const shR = fl(R(sh, 0.78, 30 + side, [1.1, 0.85, 1], true, side * 0.15, 0.25, 0));
    rune(shR, side * 0.55, 0.15, 0.55, side * 0.7);
    fl(R(sh, 0.55, 33 + side, [0.9, 1.3, 0.9], true, 0, -1.05, 0));
    const elbow = pivot(sh, 0, -1.75, 0);
    const fore = fl(R(elbow, 0.58, 37 + side, [0.95, 1.25, 0.95], true, 0, -0.6, 0));
    rune(fore, 0, 0, 0.6); seam(fore, side * 0.45, -0.2, 0.35, side * 0.9);
    const fist = fl(R(elbow, 0.72, 41 + side, [1.05, 0.95, 1.1], false, 0, -1.5, 0.1));
    R(fist, 0.38, 45 + side, [1, 0.9, 1], false, side * 0.42, -0.2, 0.3, 1);
    R(fist, 0.34, 47 + side, [1, 0.8, 1], false, -side * 0.38, -0.25, 0.32, 1);
    rocks.push([bi(fist), G.knuckles]);
    // moss strand hanging from the shoulder (2-bone spring chain)
    const s0 = pivot(shR, side * 0.2, -0.5, -0.45), s1 = pivot(s0, 0, -0.85, 0);
    rocks.push([bi(s0), G.strand], [bi(s1), G.strand]);
    springs.push({ b0: s0, b1: s1, a: new Spring(60, 6), c: new Spring(90, 7), side });
    return { sh, elbow, fist };
  };
  const aR = arm(-1), aL = arm(1);
  // chest moss beard strands
  for (let k = 0; k < 2; k++) {
    const s0 = pivot(chest, (k ? 0.5 : -0.4), -0.9, 1.15), s1 = pivot(s0, 0, -0.85, 0);
    rocks.push([bi(s0), G.strand], [bi(s1), G.strand]);
    springs.push({ b0: s0, b1: s1, a: new Spring(55, 5), c: new Spring(80, 6), side: k ? 1 : -1 });
  }
  // ---- legs
  const leg = (side) => {
    const hip = pivot(rig, side * 0.85, -0.3, 0);
    fl(R(hip, 0.6, 50 + side, [0.95, 1.1, 0.95], true, 0, -0.55, 0));
    const knee = pivot(hip, 0, -1.2, 0);
    const shin = fl(R(knee, 0.55, 55 + side, [0.95, 1.05, 0.95], true, 0, -0.45, 0));
    seam(shin, 0, 0.1, 0.5);
    R(knee, 0.6, 60 + side, [1.15, 0.5, 1.45], false, 0, -0.98, 0.18);
    return { hip, knee };
  };
  const lR = leg(-1), lL = leg(1);

  // ---- materials: one golem fights at a time, so the glow material (phase colour = material colour) is shared by every
  //      build — a rebuilt golem (2nd spawn, codex preview) is already warm and queues no render.warm
  if (!_glowMat) { _glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: GOLEM_COLORS.p1 }); _glowMat.name = 'golemGlow'; }
  const glowMat = _glowMat; glowMat.color.setHex(GOLEM_COLORS.p1);
  const sk = buildSkin('golem4', root, bones, [
    { name: 'rock', mat: vcFlatMat(), parts: rocks, shadow: false },
    { name: 'glow', mat: glowMat, parts: glowParts, shadow: false },
    { name: 'proxy', mat: skinOutlineMat(0.05), parts: proxyParts },
  ], [3.2, 5.5]);
  const proxy = sk.meshes.proxy; proxy.name = 'outline'; proxy.castShadow = true; proxy.receiveShadow = false;
  // thrown rock (golem.throw): a plain mesh sharing the rock material, hidden until thrown
  const thrown = new THREE.Mesh(G.rock(0.9, 77, [1, 0.85, 1], 1, false), vcMat());
  thrown.visible = false; thrown.castShadow = false; thrown.frustumCulled = false; thrown.name = 'golemRock';
  const flash = { value: 0 };
  const _col = new THREE.Color();
  const rimArr = [proxy];
  let phaseHex = GOLEM_COLORS.p1, cageOpen = 0, cageT = 0, time = 0;
  const m = {
    type: 'golem', isV4: true, root, rig, spine, neck, armR: aR.sh, armL: aL.sh, foreR: aR.elbow, foreL: aL.elbow, fistR: aR.fist, fistL: aL.fist,
    legR: lR.hip, legL: lL.hip, kneeR: lR.knee, kneeL: lL.knee, core, coreGroup, cage, glowMat, floaters, rockParts, thrown,
    skin: sk, outlines: [proxy], headTop: 6.3,
    // §4.0 contract
    meshes: [sk.meshes.rock, sk.meshes.glow], proxy, lod: proxy,
    bones: { root: rig, spine, head: neck, armL: aL.sh, armR: aR.sh, handL: aL.fist, handR: aR.fist, legL: lL.hip, legR: lR.hip },
    features: { face: true, hands: true, springs: springs.length, aoVertexColors: true, lod: false, runeStrips: true, crackSeams: true, coreCage: true, knuckleShards: true, moss: true },
    tellAnchors: { hand: aR.fist, weapon: aR.fist, head: head, core: coreGroup, mouth: head },
    flashUniform: flash,
    rimSource: () => rimArr,
    /** Phase colour of runes, seams, eyes and core (uniform). */
    setPhase(p2) { phaseHex = p2 ? GOLEM_COLORS.p2 : GOLEM_COLORS.p1; },
    /** 0..1: the cage ring swings open (staggered / fist planted). */
    setCage(k) { cageT = k; },
    pose() {},
    update(dt) {
      time += dt;
      cageOpen += (cageT - cageOpen) * Math.min(1, dt * 8);
      for (let k = 0; k < 4; k++) { const c = cage[k]; c.position.set(0, 0, cageOpen * 0.35); c.rotation.set(-cageOpen * 0.9, 0, cageOpen * 0.25); }
      for (let i = 0; i < floaters.length; i++) { const f = floaters[i]; f.mesh.position.y = f.baseY + Math.sin(time * 1.6 + f.ph) * f.amp; }
      core.rotation.y += dt * (phaseHex === GOLEM_COLORS.p2 ? 2.5 : 1);
      // moss springs hang against the torso swing
      const lean = rig.rotation.x + spine.rotation.x;
      for (let i = 0; i < springs.length; i++) {
        const s = springs[i];
        s.b0.rotation.x = s.a.update(dt, -lean - (s.b0.parent === spine ? 0 : (s.side < 0 ? aR.sh.rotation.x : aL.sh.rotation.x) * 0.6));
        s.b1.rotation.x = s.c.update(dt, s.b0.rotation.x * 0.4 + Math.sin(time * 1.3 + i) * 0.06);
      }
      // glow colour: phase colour, brightened (≤ ×1.2) by the hit flash and the open cage
      const k = 1 + Math.min(0.2, flash.value * 0.2 + cageOpen * 0.1);
      glowMat.color.setHex(phaseHex).multiplyScalar(k);
      void _col;
    },
    dispose() { thrown.removeFromParent(); },
  };
  return m;
}

/** Turntable / codex preview (a fresh model's root). */
export function previewGolem() { return buildGolemModel().root; }
