// 공허 망령 (wraith) v4 model (PLAN v4 §4.7). Owned by mobmodels.
// humanoid2 (v3 rest layout, hip 1.15, floats with e.hover): hood with a bone mask inside (eye glow), skeletal hands with claws,
// a chain wrapped around the torso (merged links), robe hem as 3 spring strips (tattered) + ragged skirt, hood-tip spring,
// lifted palette (dusty violet robe, pale bone; body luma ≥ 0.18 on the Elderwood floor). The cast orb (v3 `orb`) sits on the left hand.
// Trailing smoke (vfx kit ribbon, enemy-owned) is P1.
import * as THREE from 'three';
import { P, S, C, K, CAP, T, TUBE, CARD, OCT, FN, both, humanoid2, bone, curve, mixInto } from './rig.js';

const WR = { robe: 0x8a7eac, robeDark: 0x6a5e8c, robeDeep: 0x4e4470, trim: 0xb49ad8, bone: 0xe2dcec, boneDark: 0xb4aac4, chain: 0x9aa0b4, chainDark: 0x6a6e80,
  hollow: 0x1a1226, void: 0xb36bff, core: 0xe6c8ff };
const HIP = 1.15;

/** Ragged open skirt (v3 recipe) at any detail. */
function skirtGeo(d, comp) {
  const n = Math.max(6, Math.round(14 * d));
  const g = new THREE.ConeGeometry(0.52 * (comp ? 1 / Math.cos(Math.PI / n) : 1), 1.1, n, 3, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.5) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, y - 0.06 - Math.abs(Math.sin(a * 5)) * 0.2); } }
  g.computeVertexNormals();
  return g;
}

export function wraithDef() {
  const bones = humanoid2({ hipY: HIP, neckY: 0.6, shoulderX: 0.36, shoulderY: 0.44, upperLen: 0.34, foreLen: 0.32, hipX: 0.12, thighLen: 0.3,
    jaw: [0, 0.02, 0.18], hand: { thumb: [0.04, -0.03, 0.04], fingers: [0, -0.05, 0.02] } });
  bones.push(bone('orb', 'handL', [0, -0.12, 0.08]),
    bone('hem1', 'rig', [0.3, -0.92, 0.22]), bone('hem2', 'rig', [-0.34, -0.92, 0.1]), bone('hem3', 'rig', [0.06, -0.94, -0.36]), bone('hoodTip', 'neck', [0, 0.34, -0.3], [-2.2, 0, 0]));
  const parts = [], glow = [], add = (...a) => parts.push(...a);
  const robeCol = (l, n, out) => { mixInto(out, WR.robe, WR.robeDark, (-l.y - 0.3) * 0.9); if (n.y > 0.5) mixInto(out, out.getHex(), WR.trim, 0.25); return out; };
  // ---------------------------------------------------------------- skirt (rig) + hem strips (springs)
  add(P('rig', FN(skirtGeo, [0.52, 0.55, 0.52]), robeCol, [0, -0.45, 0], [0, 0, 0], [1, 1, 1], { proxy: true, aoCast: false }));
  add(P('rig', K(0.42, 0.9, 12, { open: true }), WR.robeDeep, [0, -0.4, -0.03], [0, 0, 0], [1, 1, 1], { aoCast: false }));
  add(P('rig', T(0.3, 0.035, 14, 4), WR.trim, [0, 0.02, 0], [Math.PI / 2, 0, 0]));
  for (const [b, w, h] of [['hem1', 0.16, 0.34], ['hem2', 0.15, 0.3], ['hem3', 0.18, 0.36]]) add(P(b, CARD(w, h, 3, { taper: 0.15, bend: 0.04 }), WR.robeDark, [0, 0, 0], [0, Math.atan2(bones.find((q) => q.name === b).p[0], bones.find((q) => q.name === b).p[2]), 0], [1, 1, 1], { ao: false }));
  // ---------------------------------------------------------------- torso: robe chest, shoulders, ribcage, chain wrapped around
  add(P('spine', S(0.3, 12, 9), robeCol, [0, 0.26, 0], [0, 0, 0], [1.1, 1.15, 0.85], { blend: { axis: '+y', band: 0.06 } }));
  add(...both([P('spine', S(0.16, 9, 7), WR.robe, [-0.28, 0.44, 0], [0, 0, 0], [1.2, 0.8, 1])]));
  add(P('spine', K(0.36, 0.5, 10), WR.robeDark, [0, 0.62, -0.16], [-0.9, 0, 0], [1, 1, 0.7]));
  for (let i = 0; i < 3; i++) add(P('spine', T(0.13 - i * 0.015, 0.016, 10, 3, Math.PI * 1.2), WR.bone, [0, 0.36 - i * 0.08, 0.2], [0, 0, -Math.PI * 0.1 + Math.PI], [1, 0.6, 1], { small: true }));   // ribs
  for (let i = 0; i < 16; i++) {          // chain links along a helix
    const a = i / 16 * Math.PI * 2.4 - 0.6, y = 0.08 + i * 0.03, r = 0.33 - Math.abs(i - 8) * 0.004;
    add(P('spine', T(0.034, 0.011, 6, 3), i % 2 ? WR.chain : WR.chainDark, [Math.sin(a) * r, y, Math.cos(a) * r * 0.82], [i % 2 ? Math.PI / 2 : 0, a + Math.PI / 2, 0.5], [1, 1.4, 1], { small: true }));
  }
  add(P('spine', T(0.05, 0.014, 8, 3), WR.chain, [0.2, 0.05, 0.24], [0.3, 0.4, 0], [1, 1, 1], { small: true }));   // hanging shackle
  // ---------------------------------------------------------------- head: hood shell, bone mask (eye holes, cracks), jaw, hood tip (spring)
  add(P('neck', S(0.34, 12, 9, { thL: Math.PI * 0.65 }), WR.robeDark, [0, 0.14, -0.04], [-0.3, 0, 0], [1, 1.1, 1.1]));
  add(P('neck', T(0.29, 0.032, 14, 4), WR.trim, [0, 0.1, 0.16], [0.35, 0, 0], [1, 1.1, 1]));
  add(P('neck', S(0.24, 10, 8), WR.hollow, [0, 0.1, -0.06], [0, 0, 0], [1, 1.05, 0.95], { ao: false }));
  add(P('hoodTip', K(0.16, 0.46, 8), WR.robeDark, [0, 0.2, 0], [0, 0, 0], [1, 1, 1]));
  const maskCol = (l, n, out) => { out.setHex(WR.bone); if (Math.abs(l.x + 0.06 - (l.y - 0.1) * 0.5) < 0.008 && l.y > 0.12 && l.y < 0.24 && l.x < 0) out.setHex(WR.boneDark); return out; };
  add(P('neck', S(0.17, 10, 8), maskCol, [0, 0.12, 0.16], [0, 0, 0], [0.95, 1.05, 0.62], { proxy: true }));
  add(...both([P('neck', S(0.045, 6, 5), WR.hollow, [-0.065, 0.14, 0.245], [0, 0, 0], [1.2, 0.85, 0.6], { small: true, ao: false })]));   // eye holes
  add(P('neck', K(0.02, 0.05, 3), WR.hollow, [0, 0.08, 0.26], [Math.PI, 0, 0], [1, 1, 0.6], { small: true, ao: false }));                 // nose hole
  add(P('neck', TUBE([[-0.13, 0.21, 0.19], [0, 0.24, 0.23], [0.13, 0.21, 0.19]], [0.018, 0.026, 0.018], 4), WR.boneDark, [0, 0, 0], [0, 0, 0], [1, 1, 1], { small: true }));   // brow
  add(P('jaw', S(0.11, 8, 6), WR.bone, [0, -0.06, 0.02], [0, 0, 0], [1, 0.55, 0.62]));
  for (let i = -2; i <= 2; i++) add(P('jaw', B2(0.018, 0.03, 0.012), WR.bone, [i * 0.028, -0.01, 0.08], [0, 0, 0], [1, 1, 1], { small: true }));
  glow.push(...both([P('neck', S(0.03, 6, 5), WR.core, [-0.065, 0.14, 0.235], [0, 0, 0], [1.3, 0.7, 0.5], { glowK: 1.15, eyeball: true })]));
  // ---------------------------------------------------------------- arms: sleeves, skeletal hands with claws
  for (const s2 of ['R', 'L']) {
    add(P('arm' + s2, C(0.08, 0.13, 0.32, 9), WR.robe, [0, -0.15, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.06 } }));
    add(P('fore' + s2, C(0.13, 0.2, 0.32, 10, { open: true }), WR.robeDark, [0, -0.14, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.05 } }));
    add(P('fore' + s2, T(0.195, 0.018, 12, 3), WR.trim, [0, -0.3, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { small: true }));
    add(P('fore' + s2, CAP(0.025, 0.12, 5, 2), WR.boneDark, [0, -0.3, 0], [0, 0, 0], [1, 1, 1], { small: true }));        // wrist bones
    add(P('hand' + s2, S(0.05, 7, 5), WR.bone, [0, -0.0, 0.0], [0, 0, 0], [1, 0.7, 1.1]));
    for (let i = 0; i < 4; i++) {
      const x = -0.036 + i * 0.024;
      add(P('fingers' + s2, TUBE([[x, 0, 0], [x * 1.3, -0.07, 0.025], [x * 1.4, -0.13, 0.07]], [0.011, 0.009, 0.006], 4), WR.bone, [0, 0, 0], [0, 0, 0], [1, 1, 1], { small: true }));
      add(P('fingers' + s2, K(0.008, 0.045, 3), WR.hollow, [x * 1.45, -0.15, 0.09], [Math.PI - 0.6, 0, 0], [1, 1, 1], { small: true }));   // claws
    }
    add(P('thumb' + s2, TUBE([[0, 0, 0], [0, -0.04, 0.04], [0, -0.07, 0.07]], [0.011, 0.009, 0.005], 4), WR.bone, [0, 0, 0], [0, 0, s2 === 'R' ? 0.6 : -0.6], [1, 1, 1], { small: true }));
  }
  // ---------------------------------------------------------------- legs: tattered wisps under the skirt
  for (const s2 of ['R', 'L']) {
    add(P('leg' + s2, CARD(0.06, 0.32, 2, { taper: 0.4 }), WR.robeDeep, [0, -0.02, 0.05], [0, 0, 0], [1, 1, 1], { ao: false }));
    add(P('knee' + s2, CARD(0.04, 0.22, 2, { taper: 0.1 }), WR.robeDeep, [0, 0, 0.05], [0, 0, 0], [1, 1, 1], { ao: false }));
  }
  // ---------------------------------------------------------------- glow: void core in the chest + the cast orb + hem rune ring
  glow.push(P('spine', OCT(0.085), WR.void, [0, 0.3, 0.2], [0, 0, 0], [1, 1.3, 0.6], { glowK: 1.1 }));
  glow.push(P('orb', S(0.11, 10, 8), WR.core, [0, 0, 0], [0, 0, 0], [1, 1, 1], { glowK: 1.15 }));
  glow.push(P('orb', T(0.15, 0.008, 16, 3), WR.void, [0, 0, 0], [0.4, 0, 0.3], [1, 1, 1], { glowK: 1.1 }));
  glow.push(P('rig', T(0.16, 0.01, 12, 3), WR.void, [0, -0.2, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { glowK: 1.0 }));
  return {
    type: 'wraith', bones, parts, glow, hipY: HIP, headTop: 2.3, lieY: 0.3, sphere: [1.2, 1.6], kind: 'humanoid',
    outline: { t: 0.017, color: 0x120c1e }, proxyMin: 0.08, jawOpen: 0.4,
    springs: [
      { bone: 'hem1', axis: 'x', k: 60, d: 5, gain: [0.16, 0], sway: 0.1, swayHz: 0.7, min: -1.0, max: 0.6 },
      { bone: 'hem2', axis: 'x', k: 60, d: 5, gain: [0.16, 0], sway: 0.1, swayHz: 0.55, min: -1.0, max: 0.6 },
      { bone: 'hem3', axis: 'x', k: 60, d: 5, gain: [-0.16, 0], sway: 0.1, swayHz: 0.62, min: -0.6, max: 1.0 },
      { bone: 'hoodTip', axis: 'x', k: 80, d: 6, gain: [0.1, 0], sway: 0.05, swayHz: 0.4, min: -0.6, max: 0.6 },
    ],
    anchors: { weapon: ['orb', [0, 0, 0]], hand: ['orb', [0, 0, 0]], head: ['neck', [0, 0.42, 0.05]], mouth: ['jaw', [0, -0.03, 0.08]], core: ['spine', [0, 0.3, 0.22]] },
    aliases: { orb: 'orb' },
    features: { face: true, faceEquivalent: 'bone mask + eye glow + jaw', hands: true, aoVertexColors: true, lod: true, chain: 16, hemStrips: 3, boneMask: true, smokeTrail: 'P1' },
    poses: {
      idle(t, p) { p.aLx = -0.6; p.fLx = -0.9; p.aLz = 0.25; p.lRx = p.lLx = 0.25; p.kR = p.kL = 0.3; p.hipY = HIP + Math.sin(t * 1.6) * 0.04; },
      walk(t, p) { p.lRx = p.lLx = 0.35; p.kR = p.kL = 0.4; p.pitch = 0.2; p.aRx = 0.3; p.aLx = 0.3; p.hipY = HIP + Math.sin(t * 2) * 0.05; },
      windup(t, p) { p.aLx = -1.6 * t - 0.3; p.fLx = -0.6; p.aLz = 0.3; p.aRx = -0.6 * t; p.aRz = -0.6 * t; p.spineX = -0.25 * t; p.headX = -0.15 * t; p.jaw = 0.8 * t; },
      hold(t, p) { p.aLx = -1.9; p.fLx = -0.6; p.aLz = 0.3; p.aRx = -0.6; p.aRz = -0.6; p.spineX = -0.25; p.headX = -0.15; p.jaw = 0.9; p.hipY = HIP + 0.05; },
      strike(t, p) { p.aLx = -1.9 + 0.6 * t; p.fLx = -0.2; p.spineX = 0.2 * t; p.jaw = 1; },
      recover(t, p) { p.aLx = -0.4; p.aRx = -0.2; p.spineX = 0.35; p.headX = 0.4; p.hipY = HIP - 0.12; },
    },
  };
}
function B2(x, y, z) { return { k: 'box', x, y, z }; }
