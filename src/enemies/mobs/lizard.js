// 수렁도마뱀 (lizard) v4 model (PLAN v4 §4.4). Owned by mobmodels.
// Reptile variant of humanoid2 (own proportions, v3 pivot names kept: hip 0.86, tail1/tail2 for the v3 tail sway): digitigrade legs
// (knee → ankle → toes; the ankle counter-rotates in update()), long tapered snout with a teeth row and a jaw bone, slit-pupil eyes,
// 4-bone tail (tail3/tail4 on springs), dorsal frill that flares on windup (spring + pose), scale-ridge bands along the spine,
// wet-skin gradient (dark back, pale belly), bone-tipped spear with a cloth wrap, shell pauldron.
import { P, S, C, K, B, CAP, T, TUBE, CARD, both, eye, humanoid2, bone, curve, mixInto } from './rig.js';

const LZ = { back: 0x2f6e56, scale: 0x3f8f6c, side: 0x5aa47c, belly: 0xd2dca0, bellyDark: 0xaab878, frill: 0x36b4c4, frillDark: 0x1f6f88, membrane: 0x7ad6d0,
  leather: 0x6a4a2e, bone: 0xece0bc, spear: 0x7a5a36, cloth: 0xc84a3a, shell: 0x9a8656, shellDark: 0x6a5a38, eye: 0xf0d040, mouth: 0x5a2030, claw: 0x2a2a22 };
const HIP = 0.86;

/** Wet skin: dark back → scale green → pale belly, by the bind-space normal; scale-ridge bands across the back. */
function skin(l, n, out, v) {
  mixInto(out, LZ.back, LZ.scale, 0.55 - n.y * 0.9);
  if (n.y < -0.2) mixInto(out, LZ.scale, LZ.side, (-n.y - 0.2) * 1.6);
  if (v && n.y > 0.3 && Math.sin((v.y - v.z) * 38) > 0.72) out.multiplyScalar(0.8);   // scale-ridge bands
  return out;
}

export function lizardDef() {
  const tail = [[0, -0.02, -0.24], [0, -0.02, -0.42], [0, -0.03, -0.38], [0, -0.03, -0.32]];
  const bones = humanoid2({ hipY: HIP, neckY: 0.62, shoulderX: 0.42, shoulderY: 0.52, upperLen: 0.36, foreLen: 0.32, hipX: 0.19, thighLen: 0.34,
    jaw: [0, -0.02, 0.1], lids: [[-0.15, 0.2, 0.2], [0.15, 0.2, 0.2]], digitigrade: true, shinLen: 0.3, tail,
    hand: { thumb: [0.05, -0.03, 0.04], fingers: [0, -0.06, 0.03] } });
  bones.push(bone('weapon', 'handR', [0, -0.02, 0], [-0.35, 0, 0]), bone('frill', 'spine', [0, 0.52, -0.25], [-0.25, 0, 0]), bone('wrap', 'weapon', [0, 0.04, 1.2]));
  const parts = [], add = (...a) => parts.push(...a);
  // ---------------------------------------------------------------- torso (lean, forward-leaning chest), belly plates, shell pauldron
  add(P('spine', S(0.34, 12, 10), skin, [0, 0.3, 0.02], [0.18, 0, 0], [0.92, 1.18, 0.8], { blend: { axis: '+y', band: 0.06 } }));
  const plates = (l, n, out) => { mixInto(out, LZ.belly, LZ.bellyDark, Math.sin(l.y * 40) > 0.6 ? 1 : 0); return out; };
  add(P('spine', S(0.27, 10, 8), plates, [0, 0.24, 0.15], [0.18, 0, 0], [0.8, 1.02, 0.5]));
  add(...both([P('spine', S(0.17, 9, 7), skin, [-0.32, 0.52, 0], [0, 0, 0], [1.1, 0.9, 1])]));
  add(P('armL', S(0.18, 10, 6, { thL: Math.PI * 0.55 }), (l, n, out) => mixInto(out, LZ.shell, LZ.shellDark, Math.abs(Math.sin(l.x * 30) * Math.sin(l.z * 30)) > 0.5 ? 1 : 0),
    [0.02, 0.06, 0], [0, 0, -0.35], [1.15, 0.8, 1.2]));                                                    // shell pauldron
  add(P('armL', T(0.2, 0.018, 12, 3), LZ.shellDark, [0.02, 0.03, 0], [Math.PI / 2, 0, -0.35], [1.15, 1.2, 1], { small: true }));
  add(P('spine', T(0.3, 0.028, 16, 4), LZ.leather, [0, 0.38, 0.0], [Math.PI / 2, -0.5, 0], [1, 0.85, 1]));   // strap
  // dorsal frill (spring + flare): 5 spines with a membrane
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.22, h = 0.3 - Math.abs(i - 2) * 0.05;
    add(P('frill', TUBE([[Math.sin(a) * 0.03, 0, i * -0.07], [Math.sin(a) * 0.05, h * 0.6, i * -0.07 - 0.04], [Math.sin(a) * 0.06, h, i * -0.07 - 0.1]], [0.025, 0.016, 0.004], 4), LZ.frill, [0, 0, 0], [0, 0, 0], [1, 1, 1], { small: true }));
  }
  add(P('frill', CARD(0.3, 0.24, 2, { taper: 0.35 }), LZ.membrane, [0, 0.0, -0.14], [Math.PI, Math.PI / 2, 0], [1, 1, 1], { ao: false }));
  // ---------------------------------------------------------------- pelvis + loin cloth
  add(P('rig', S(0.27, 10, 8), skin, [0, 0, -0.02], [0, 0, 0], [1.1, 0.78, 1.0]));
  add(P('rig', T(0.29, 0.045, 16, 4), LZ.leather, [0, 0.04, 0], [Math.PI / 2, 0, 0], [1.05, 0.92, 1]));
  add(P('rig', CARD(0.26, 0.3, 2, { taper: 0.7 }), 0x5f8a4a, [0, 0.0, 0.27], [0.1, 0, 0], [1, 1, 1], { ao: false }));
  // ---------------------------------------------------------------- tail: 4 tapered segments, smooth weights between them, ridge spikes
  const tr = [0.19, 0.145, 0.105, 0.065, 0.012];
  for (let i = 0; i < 4; i++) {
    const L = i === 0 ? -0.42 : i === 1 ? -0.38 : i === 2 ? -0.32 : -0.36;
    add(P('tail' + (i + 1), TUBE([[0, 0, 0.04], [0, 0, L * 0.5], [0, -0.005, L]], [tr[i], (tr[i] + tr[i + 1]) / 2, tr[i + 1]], 8), skin, [0, 0, 0], [0, 0, 0], [1, 0.85, 1],
      { blend: i ? { axis: '-z', band: 0.08 } : null }));
    add(P('tail' + (i + 1), K(0.03 - i * 0.005, 0.1 - i * 0.015, 4), LZ.frill, [0, tr[i] * 0.85, L * 0.45], [-0.8, 0, 0], [1, 1, 0.5], { small: true }));
  }
  // ---------------------------------------------------------------- head: cranium, long tapered snout, teeth, slit eyes, crest, jaw
  add(P('neck', CAP(0.1, 0.2, 8, 2), skin, [0, -0.1, -0.04], [0.5, 0, 0], [1, 1, 1], { blend: { axis: '+y', band: 0.06 } }));   // neck column
  add(P('neck', S(0.22, 12, 9), skin, [0, 0.12, 0.0], [0, 0, 0], [1, 0.88, 1.08]));
  add(P('neck', TUBE([[0, 0.1, 0.1], [0, 0.09, 0.3], [0, 0.07, 0.48], [0, 0.05, 0.6]], [0.16, 0.12, 0.08, 0.045], 9), skin, [0, 0, 0], [0, 0, 0], [1.05, 0.72, 1]));
  add(...both([P('neck', S(0.016, 4, 3), LZ.mouth, [-0.03, 0.085, 0.6], [0, 0, 0], [1, 1, 1], { small: true })]));      // nostrils
  for (let i = 0; i < 6; i++) {          // upper teeth row
    const z = 0.2 + i * 0.065, x = 0.11 - i * 0.012;
    add(...both([P('neck', K(0.013, 0.045, 4), LZ.bone, [-x, 0.0, z], [Math.PI, 0, 0], [1, 1, 1], { small: true })]));
  }
  add(P('neck', TUBE([[-0.16, 0.24, -0.02], [0, 0.31, 0.05], [0.16, 0.24, -0.02]], [0.03, 0.045, 0.03], 5), LZ.back, [0, 0, 0]));   // brow crest
  add(...both([P('neck', K(0.05, 0.2, 4), LZ.frill, [-0.16, 0.22, -0.12], [-1.3, 0, -0.5], [1, 1, 0.35], { small: true })]));       // head spikes
  add(...eye('neck', [-0.15, 0.17, 0.15], 0.06, { sclera: 0xe8e4a0, iris: LZ.eye, slit: true, yaw: -0.85, pupilK: 0.4, irisK: 0.8 }));
  add(...eye('neck', [0.15, 0.17, 0.15], 0.06, { sclera: 0xe8e4a0, iris: LZ.eye, slit: true, yaw: 0.85, pupilK: 0.4, irisK: 0.8 }));
  for (const [s2, x] of [['R', -1], ['L', 1]]) add(P('lid' + s2, S(0.068, 8, 6, { phS: 0, phL: Math.PI }), LZ.back, [0, -0.03, 0], [0, x * 0.85, 0], [1, 1, 0.75], { small: true, ao: false }));
  add(P('jaw', TUBE([[0, -0.04, 0.0], [0, -0.06, 0.2], [0, -0.05, 0.38], [0, -0.03, 0.48]], [0.12, 0.1, 0.065, 0.035], 8), (l, n, out) => mixInto(out, LZ.side, LZ.belly, -n.y),
    [0, 0, 0], [0, 0, 0], [1.05, 0.55, 1], { blend: { axis: '+z', band: 0.05 } }));
  for (let i = 0; i < 5; i++) add(...both([P('jaw', K(0.012, 0.04, 4), LZ.bone, [-(0.085 - i * 0.012), -0.02, 0.12 + i * 0.07], [0, 0, 0], [1, 1, 1], { small: true })]));
  add(P('neck', B(0.16, 0.03, 0.3), LZ.mouth, [0, 0.02, 0.35], [0, 0, 0], [1, 1, 1], { small: true, ao: false }));
  // ---------------------------------------------------------------- arms + 3-claw hands
  for (const s2 of ['R', 'L']) {
    add(P('arm' + s2, CAP(0.095, 0.2, 8, 2), skin, [0, -0.16, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.06 } }));
    add(P('fore' + s2, CAP(0.085, 0.17, 8, 2), skin, [0, -0.14, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.05 } }));
    add(P('fore' + s2, C(0.1, 0.095, 0.08, 8), LZ.leather, [0, -0.22, 0]));
    add(P('fore' + s2, K(0.03, 0.12, 4), LZ.frill, [0, -0.12, -0.08], [-1.9, 0, 0], [1, 1, 0.4], { small: true }));   // forearm fin
    add(P('hand' + s2, S(0.075, 8, 6), skin, [0, -0.02, 0.01], [0, 0, 0], [0.9, 1, 1.1]));
  }
  for (let i = 0; i < 3; i++) {
    const z = -0.03 + i * 0.03;
    add(P('fingersR', TUBE(curve([0.05, 0.0, z], [0.05, -0.08, z], [-0.03, -0.07, z], 4), [0.022, 0.02, 0.016, 0.01], 4), LZ.scale, [0, 0, 0], [-0.35, 0, 0], [1, 1, 1], { small: true }));
    const x = -0.03 + i * 0.03;
    add(P('fingersL', TUBE([[x, 0, 0.01], [x * 1.2, -0.06, 0.03], [x * 1.3, -0.1, 0.05]], [0.02, 0.016, 0.01], 4), LZ.scale, [0, 0, 0], [0, 0, 0], [1, 1, 1], { small: true }));
    add(P('fingersL', K(0.01, 0.035, 4), LZ.claw, [x * 1.35, -0.12, 0.055], [Math.PI - 0.4, 0, 0], [1, 1, 1], { small: true }));
  }
  add(P('thumbR', CAP(0.02, 0.04, 4, 2), LZ.scale, [0, -0.02, 0.02], [0.4, 0, 0.8], [1, 1, 1], { small: true }));
  add(P('thumbL', CAP(0.02, 0.04, 4, 2), LZ.scale, [0, -0.02, 0.02], [0.4, 0, -0.8], [1, 1, 1], { small: true }));
  // ---------------------------------------------------------------- digitigrade legs: thigh, shin angled back to the ankle, metatarsus + 3 toes
  for (const s2 of ['R', 'L']) {
    add(P('leg' + s2, CAP(0.13, 0.16, 8, 2), skin, [0, -0.15, 0.03], [0.2, 0, 0], [1, 1, 1.05], { blend: { axis: '-y', band: 0.07 } }));
    add(P('knee' + s2, TUBE([[0, 0.03, 0.02], [0, -0.14, -0.04], [0, -0.3, -0.06]], [0.1, 0.075, 0.06], 7), skin, [0, 0, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.06 } }));
    add(P('ankle' + s2, TUBE([[0, 0.02, 0], [0, -0.08, 0.05], [0, -0.13, 0.12]], [0.06, 0.05, 0.045], 6), skin, [0, 0, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.04 } }));
    for (let i = -1; i <= 1; i++) {
      add(P('ankle' + s2, TUBE([[0, -0.13, 0.12], [i * 0.05, -0.15, 0.2], [i * 0.07, -0.15, 0.27]], [0.035, 0.028, 0.018], 4), LZ.scale, [0, 0, 0], [0, 0, 0], [1, 1, 1], { small: true, dark: 0.9 }));
      add(P('ankle' + s2, K(0.014, 0.05, 4), LZ.claw, [i * 0.075, -0.155, 0.3], [Math.PI / 2, 0, 0], [1, 1, 1], { small: true }));
    }
  }
  // ---------------------------------------------------------------- spear (axis +z): shaft, bindings, bone tip + barbs, cloth wrap (spring)
  add(P('weapon', C(0.025, 0.03, 2.1, 6), LZ.spear, [0, 0, 0.35], [Math.PI / 2, 0, 0], [1, 1, 1], { proxy: true }));
  for (const z of [-0.06, 0.06, 1.28]) add(P('weapon', T(0.034, 0.012, 8, 3), 0xc8a868, [0, 0, z], [0, 0, 0], [1, 1, 1], { small: true }));
  add(P('weapon', K(0.075, 0.36, 5), LZ.bone, [0, 0, 1.58], [Math.PI / 2, 0, 0], [1, 1, 0.42], { proxy: true }));
  add(...both([P('weapon', K(0.03, 0.13, 4), LZ.bone, [-0.06, 0, 1.38], [Math.PI / 2, 0, 0.6], [1, 1, 0.6], { small: true })]));
  add(P('wrap', CARD(0.05, 0.28, 2, { taper: 0.5 }), LZ.cloth, [0, 0, 0], [0, 0, 0], [1, 1, 1], { ao: false }));
  add(P('wrap', CARD(0.04, 0.22, 2, { taper: 0.4 }), LZ.cloth, [0.02, 0, 0.03], [0, 0, 0.3], [1, 1, 1], { ao: false }));
  return {
    type: 'lizard', bones, parts, hipY: HIP, headTop: 2.05, lieY: 0.28, sphere: [1.0, 1.9], kind: 'humanoid',
    outline: { t: 0.017, color: 0x0e1e18 }, proxyMin: 0.1, lids: { open: 0.25, closed: 1.0 }, jawOpen: 0.45,
    springs: [
      { bone: 'tail3', axis: 'z', k: 70, d: 6, gain: [0, -0.1], sway: 0.1, swayHz: 0.45, min: -0.8, max: 0.8 },
      { bone: 'tail4', axis: 'z', k: 60, d: 5, gain: [0, -0.12], sway: 0.14, swayHz: 0.5, min: -0.9, max: 0.9 },
      { bone: 'frill', axis: 'x', k: 130, d: 8, gain: [0.08, 0], sway: 0.03, swayHz: 0.8, min: -0.9, max: 0.5 },
      { bone: 'wrap', axis: 'x', k: 50, d: 4, gain: [0.2, 0], sway: 0.15, swayHz: 1.2, min: -1.2, max: 1.2 },
    ],
    anchors: { weapon: ['weapon', [0, 0, 1.7]], head: ['neck', [0, 0.32, 0.05]], hand: ['handR', [0, -0.04, 0.02]], mouth: ['jaw', [0, -0.03, 0.45]], core: ['spine', [0, 0.3, 0.25]] },
    aliases: { weapon: 'weapon', frill: 'frill', tail3: 'tail3', tail4: 'tail4' },
    features: { face: true, hands: true, aoVertexColors: true, lod: true, digitigrade: true, tailBones: 4, frillFlare: true, slitPupils: true, teeth: true, shellPauldron: true },
    afterPose(m, name, t) {
      const fr = m._springs.find((s) => s.bone === 'frill');
      const k = name === 'windup' ? Math.min(1, t) : name === 'hold' ? 1 : 0;
      if (fr) fr.off = -0.75 * k;                       // flare on windup
      m.bones.all.frill.scale.set(1 + 0.25 * k, 1 + 0.35 * k, 1);
    },
    update(m) {
      // digitigrade: the ankle counter-rotates so the toes stay near the ground
      const A = m.bones.all;
      A.ankleR.rotation.x = -(A.legR.rotation.x + A.kneeR.rotation.x) * 0.7;
      A.ankleL.rotation.x = -(A.legL.rotation.x + A.kneeL.rotation.x) * 0.7;
    },
    poses: {
      windup(t, p) { p.aRx = -1.2 * t - 0.4; p.fRx = -1.2 * t; p.aRz = -0.2; p.spineY = 0.55 * t; p.pitch = -0.1 * t; p.hipY = HIP - 0.1 * t; p.kR = p.kL = 0.5 * t; p.jaw = 0.9 * t; },
      hold(t, p) { p.aRx = -1.6; p.fRx = -1.2; p.aRz = -0.2; p.spineY = 0.55; p.pitch = -0.1; p.hipY = HIP - 0.1; p.kR = p.kL = 0.5; p.jaw = 1; },
      strike(t, p) { p.aRx = -1.6 + 0.6 * t; p.fRx = -1.2 + 1.2 * t; p.spineY = 0.55 - 0.9 * t; p.pitch = 0.35 * t; p.lRx = -0.5 * t; p.kR = 0.4; },
      recover(t, p) { p.aRx = -0.6; p.fRx = 0; p.pitch = 0.5; p.headX = 0.3; },   // spear stuck forward-down
    },
  };
}
