// 공허룡 니드호그라 — model (DESIGN §8.6, CONTRACT §15). A 70 m serpentine dragon on a Catmull-Rom spine:
//   24 spine segments (InstancedMesh body + instanced back-face outline + instanced violet crack glow = 3 calls),
//   head + jaw (merged, outlined), a ring of eyes, horns, 2 forelimbs (upper / fore / claw, outlined), 2 void-mist wing ribbons,
//   5 oath shards (instanced, element-tinted at construction), the heart crystal (아스트라의 핵) + halo, a lock glyph on the brow,
//   and 4 lightning rods (instanced). ≈ 28 draw calls. Every material is created here once and compiled by prewarm.
import { THREE, S, C, K, B, T, OCT, ICO, P, mergeParts, vcMat, vcBasicMat, glowify, once, glowSpriteMat } from './kit.js';
import { addOutline, toonMat } from '../../core/utils.js';
import { elColor, CLASSIC_ELEMENTS } from '../../core/elements.js';

export const SEGMENTS = 24;
/** The 5 stolen oath shards are the classic five (DESIGN §8.1). */
export const SHARD_ELEMENTS = CLASSIC_ELEMENTS.slice();
const NC = { scale: 0x1a1622, scaleHi: 0x2e2840, belly: 0x3a3450, horn: 0x5a5070, claw: 0xd8d0e8, void: 0xb14bff, core: 0xf0d8ff, teeth: 0xe8e0f0 };

function geos() {
  return once('nidhoggra', () => {
    // one spine segment: a fat ellipsoid with a dorsal spike and belly plates (local +Z = along the spine)
    const seg = mergeParts([
      P(S(1, 14, 10), NC.scale, [0, 0, 0], [0, 0, 0], [1.0, 0.85, 1.25]),
      P(S(0.8, 12, 8), NC.belly, [0, -0.38, 0.05], [0, 0, 0], [0.85, 0.5, 1.1]),
      P(K(0.32, 1.3, 5), NC.scaleHi, [0, 1.05, -0.2], [-0.45, 0, 0], [1, 1, 0.45]),
      P(K(0.18, 0.7, 4), NC.scaleHi, [0.62, 0.55, -0.1], [-0.4, 0, -0.7], [1, 1, 0.4]),
      P(K(0.18, 0.7, 4), NC.scaleHi, [-0.62, 0.55, -0.1], [-0.4, 0, 0.7], [1, 1, 0.4]),
    ]);
    seg.deleteAttribute('color');
    const crack = mergeParts([
      P(B(0.06, 0.06, 1.6), NC.void, [0.55, 0.45, 0], [0, 0.3, 0.6]),
      P(B(0.06, 0.06, 1.3), NC.void, [-0.5, 0.5, 0.1], [0, -0.4, -0.6]),
      P(OCT(0.14), NC.core, [0, 0.82, 0.3]),
    ]);
    crack.deleteAttribute('color');
    const head = mergeParts([
      P(S(1, 16, 12), NC.scale, [0, 0.2, 0], [0, 0, 0], [2.6, 1.7, 3.0]),
      P(S(1, 14, 10), NC.scale, [0, 0.05, 3.2], [0.08, 0, 0], [1.7, 1.0, 2.6]),
      P(B(3.4, 0.5, 1.4), NC.scaleHi, [0, 1.35, 1.2], [0.2, 0, 0]),                      // brow ridge (the lock plate sits here)
      P(K(0.5, 4.2, 6), NC.horn, [1.6, 1.8, -1.2], [-1.0, 0, -0.45]),
      P(K(0.5, 4.2, 6), NC.horn, [-1.6, 1.8, -1.2], [-1.0, 0, 0.45]),
      P(K(0.35, 2.6, 5), NC.horn, [2.2, 0.6, -0.4], [-1.3, 0, -1.0]),
      P(K(0.35, 2.6, 5), NC.horn, [-2.2, 0.6, -0.4], [-1.3, 0, 1.0]),
      ...[-1.0, -0.5, 0, 0.5, 1.0].map((x) => P(K(0.12, 0.7, 4), NC.teeth, [x, -0.65, 5.2], [Math.PI, 0, 0])),
      P(K(1.0, 3.2, 6), NC.scaleHi, [0, 1.0, -2.6], [-1.9, 0, 0], [1, 1, 0.35]),          // crest
    ]);
    const jaw = mergeParts([
      P(S(1, 12, 9), NC.belly, [0, -0.2, 2.4], [0, 0, 0], [1.6, 0.55, 2.8]),
      ...[-0.9, -0.45, 0, 0.45, 0.9].map((x) => P(K(0.1, 0.6, 4), NC.teeth, [x, 0.35, 4.6], [0, 0, 0])),
    ]);
    const eyes = glowify(mergeParts([
      ...Array.from({ length: 8 }, (_, i) => { const a = -1.1 + i * 0.31; return P(S(0.2, 8, 6), NC.core, [Math.sin(a) * 2.45, 0.75 + Math.cos(i * 1.7) * 0.18, 1.6 + Math.cos(a) * 1.2], [0, 0, 0], [1.3, 0.6, 0.8]); }),
    ]), 2.8);
    const upper = mergeParts([P(C(1.1, 1.4, 6.5, 10), NC.scale, [0, -3.2, 0]), P(K(0.4, 1.8, 5), NC.scaleHi, [0, -0.8, -1.1], [-0.9, 0, 0], [1, 1, 0.4])]);
    const fore = mergeParts([P(C(0.9, 1.1, 6.0, 10), NC.scaleHi, [0, -3.0, 0])]);
    const claw = mergeParts([
      P(S(1.3, 12, 9), NC.scale, [0, 0, 0.4], [0, 0, 0], [1.2, 0.6, 1.4]),
      ...[-0.9, -0.3, 0.3, 0.9].map((x, i) => P(K(0.28, 2.0 + (i % 2) * 0.4, 5), NC.claw, [x, -0.2, 2.0], [Math.PI / 2 + 0.25, 0, x * 0.15])),
    ]);
    const shard = new THREE.OctahedronGeometry(1.0, 0); shard.scale(1.8, 4.2, 1.8);
    const heart = glowify(mergeParts([P(OCT(1.6), 0xfff1c0, [0, 0, 0], [0, 0, 0], [1, 1.4, 1]), P(T(2.2, 0.12, 20), 0xffd36a, [0, 0, 0], [Math.PI / 2, 0, 0])]), 1.8);
    const rod = mergeParts([P(C(0.18, 0.35, 5.5, 6), 0xffffff, [0, 2.75, 0]), P(OCT(0.6), 0xffffff, [0, 5.9, 0], [0, 0, 0], [1, 1.6, 1])]);
    rod.deleteAttribute('color');
    // void-mist wing ribbon (local: root at x=0, spreading to +x)
    const wing = new THREE.PlaneGeometry(26, 10, 12, 3); wing.translate(13, 0, 0);
    { const p = wing.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setY(i, y * (1 - x / 34) - x * 0.15); p.setZ(i, Math.sin(x * 0.35) * 0.8); } wing.computeVertexNormals(); }
    const lockRing = new THREE.TorusGeometry(1.3, 0.12, 6, 28);
    // scale: the largest thing in the game (DESIGN §8.6)
    for (const q of [upper, fore]) q.scale(1.6, 1.6, 1.6);
    claw.scale(1.6, 1.6, 1.6);
    return { seg, crack, head, jaw, eyes, upper, fore, claw, shard, heart, rod, wing, lockRing };
  });
}

function mats() {
  return once('nidhoggraMats', () => ({
    body: toonMat(0xffffff, {}),
    outline: new THREE.MeshBasicMaterial({ color: 0x0a0810, side: THREE.BackSide }),
    crack: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    shard: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    rod: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    wing: new THREE.MeshBasicMaterial({ color: 0x6a2aa8, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    lock: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
  }));
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();

export function buildNidhoggra() {
  const g = geos(), M = mats();
  const root = new THREE.Group(); root.name = 'nidhoggra';
  const mkInst = (geo, mat, n, name) => { const im = new THREE.InstancedMesh(geo, mat, n); im.name = name; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(im); return im; };
  const body = mkInst(g.seg, M.body, SEGMENTS, 'nid-body'); body.castShadow = true;
  const outline = mkInst(g.seg, M.outline, SEGMENTS, 'outline');
  const cracks = mkInst(g.crack, M.crack, SEGMENTS, 'nid-cracks');
  // per-segment colours: obsidian body darkening to the tail; violet cracks brighter near the chest (set at construction)
  for (let i = 0; i < SEGMENTS; i++) {
    const k = i / (SEGMENTS - 1);
    body.setColorAt(i, _c.setHex(0x3a3450).lerp(new THREE.Color(0x16121e), k));
    cracks.setColorAt(i, _c.setHex(0xd08aff).multiplyScalar(2.2 - k * 1.2));
  }
  body.instanceColor.needsUpdate = true; cracks.instanceColor.needsUpdate = true;
  const shards = mkInst(g.shard, M.shard, SHARD_ELEMENTS.length, 'nid-shards');
  SHARD_ELEMENTS.forEach((el, i) => shards.setColorAt(i, _c.setHex(elColor(el, 'hex')).multiplyScalar(1.8)));
  shards.instanceColor.needsUpdate = true;
  const rods = mkInst(g.rod, M.rod, 4, 'nid-rods');
  for (let i = 0; i < 4; i++) rods.setColorAt(i, _c.setHex(0x8a7aa8));
  rods.instanceColor.needsUpdate = true; rods.count = 0;

  const head = new THREE.Group(); head.scale.setScalar(1.9); root.add(head);
  const headMesh = new THREE.Mesh(g.head, vcMat()); headMesh.castShadow = true; addOutline(headMesh, 0.09); head.add(headMesh);
  const jawPivot = new THREE.Group(); jawPivot.position.set(0, -0.6, 0.6); head.add(jawPivot);
  const jawMesh = new THREE.Mesh(g.jaw, vcMat()); addOutline(jawMesh, 0.08); jawPivot.add(jawMesh);
  const eyes = new THREE.Mesh(g.eyes, vcBasicMat()); head.add(eyes);
  const lock = new THREE.Mesh(g.lockRing, M.lock); lock.position.set(0, 1.9, 1.6); lock.rotation.x = -0.9; head.add(lock);
  const mouthGlow = new THREE.Sprite(glowSpriteMat(0xb14bff, 0)); mouthGlow.scale.setScalar(6); mouthGlow.position.set(0, -0.3, 4.6); head.add(mouthGlow);

  // forelimbs: three world-space pieces each (upper arm, forearm, claw), posed by a 2-bone solve in nidhoggra.js
  const limbs = [1, -1].map((side) => {
    const up = new THREE.Group(); root.add(up);
    const um = new THREE.Mesh(g.upper, vcMat()); um.castShadow = true; addOutline(um, 0.07); up.add(um);
    const fo = new THREE.Group(); root.add(fo);
    const fm = new THREE.Mesh(g.fore, vcMat()); fm.castShadow = true; addOutline(fm, 0.07); fo.add(fm);
    const cl = new THREE.Group(); root.add(cl);
    const cm = new THREE.Mesh(g.claw, vcMat()); cm.castShadow = true; addOutline(cm, 0.06); cl.add(cm);
    return { side, up, fo, cl, upLen: 10.1, foLen: 9.6, shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3(), target: new THREE.Vector3(), lift: 0 };
  });
  const wings = [1, -1].map((side) => { const w = new THREE.Mesh(g.wing, M.wing); w.scale.x = side; w.frustumCulled = false; w.renderOrder = 3; root.add(w); return w; });
  const heart = new THREE.Group(); root.add(heart);
  const heartMesh = new THREE.Mesh(g.heart, vcBasicMat()); heart.add(heartMesh);
  const heartHalo = new THREE.Sprite(glowSpriteMat(0xfff1c0, 0.0)); heartHalo.scale.setScalar(9); heart.add(heartHalo);

  return { root, body, outline, cracks, shards, rods, head, jawPivot, eyes, lock, mouthGlow, limbs, wings, heart, heartHalo,
    mats: M, outlines: [], skin: null, headTop: 8 };
}

// ---------------------------------------------------------------- spine sampling
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _look = new THREE.Matrix4();
/**
 * Lay the 24 segments along the curve (index 0 = neck, behind the head), tapering to the tail. Writes body / outline / crack
 * matrices; out[i] receives each segment centre (pre-allocated Vector3s). No allocation.
 */
export function layBody(model, curve, out, t) {
  for (let i = 0; i < SEGMENTS; i++) curve.getPoint(i / (SEGMENTS - 1), out[i]);
  for (let i = 0; i < SEGMENTS; i++) {
    const u = i / (SEGMENTS - 1);
    _p.copy(out[i]);
    const j = i < SEGMENTS - 1 ? i + 1 : i - 1;
    _n.subVectors(out[j], _p); if (i === SEGMENTS - 1) _n.negate();
    const spacing = _n.length();
    if (spacing < 1e-4) _n.set(0, 0, -1);
    _look.lookAt(_n.multiplyScalar(-1).add(_p), _p, _up);   // +Z along the spine toward the head
    _q.setFromRotationMatrix(_look);
    const r = ((1 - u) * 2.6 + 0.6 + (u < 0.15 ? (0.15 - u) * 4 : 0)) * 1.7;
    const breathe = 1 + Math.sin(t * 1.6 - i * 0.4) * 0.03;
    // segments stretch along the spine so the body reads as one continuous coil (no gaps between the scales)
    _s.set(r * breathe, r * breathe, Math.max(r * 1.15, spacing / 2.0));
    _m.compose(_p, _q, _s);
    model.body.setMatrixAt(i, _m); model.cracks.setMatrixAt(i, _m);
    _s.multiplyScalar(1.07); _m.compose(_p, _q, _s); model.outline.setMatrixAt(i, _m);
  }
  model.body.instanceMatrix.needsUpdate = true; model.outline.instanceMatrix.needsUpdate = true; model.cracks.instanceMatrix.needsUpdate = true;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ny = new THREE.Vector3(0, -1, 0), _qy = new THREE.Quaternion();
/** Two-bone solve (elbow bends up/outward) and pose the three limb pieces. L.shoulder / L.target are set by the caller. */
export function poseLimb(L, yaw) {
  const S0 = L.shoulder, T0 = L.target;
  _a.subVectors(T0, S0);
  let d = _a.length();
  const a = L.upLen, b = L.foLen;
  d = Math.min(d, a + b - 0.05); if (d < 1e-3) d = 1e-3;
  _a.normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
  // bend axis: perpendicular to the reach, biased upward
  _b.set(0, 1, 0).addScaledVector(_a, -_a.y); if (_b.lengthSq() < 1e-4) _b.set(1, 0, 0); _b.normalize();
  L.elbow.copy(S0).addScaledVector(_a, Math.cos(ang) * a).addScaledVector(_b, Math.sin(ang) * a);
  L.wrist.copy(S0).addScaledVector(_a, d);
  L.up.position.copy(S0); L.up.quaternion.setFromUnitVectors(_ny, _b.subVectors(L.elbow, S0).normalize());
  L.fo.position.copy(L.elbow); L.fo.quaternion.setFromUnitVectors(_ny, _b.subVectors(L.wrist, L.elbow).normalize());
  L.cl.position.copy(L.wrist); _qy.setFromAxisAngle(_b.set(0, 1, 0), yaw); L.cl.quaternion.copy(_qy);
}
