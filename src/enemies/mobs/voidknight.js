// 공허 기사 (voidknight, elite) v4 model (PLAN v4 §4.8). Owned by mobmodels.
// humanoid2 (v3 rest layout, hip 1.02): bevelled layered pauldrons (3 plates each), plate segments with a lighter steel-blue edge trim
// (vertex rim), rivets as merged small spheres, tabard cloth on a spring (front + back), glowing rune slots on the sword and the shield
// that light up per combo step (model.setComboStep(0..3)), visor glow. Armour base #3B3550 only in the recesses; plate faces lifted so
// there is no black on black; trim #8C93B8.
import { P, S, C, K, B, CAP, T, CARD, OCT, both, humanoid2, bone, mixInto } from './rig.js';

const VK = { base: 0x1c1828, plate: 0x4a4366, plateLight: 0x5c547a, trim: 0x6a6490, trimLight: 0x8c88b4, cloth: 0x4c2c74, clothDark: 0x2e1c4a, leather: 0x4a382c,
  rivet: 0x9894b4, void: 0xb36bff, core: 0xf0d8ff, blade: 0x464860, bladeEdge: 0x9ca2c4 };
const HIP = 1.02;

/** Plate painter: lighter trim band where the normal turns away from the plate face (bevel/edge rim). */
const plateCol = (base, trim = VK.trim) => (l, n, out) => { mixInto(out, base, trim, (Math.abs(n.y) - 0.62) * 4); return out; };

export function voidknightDef() {
  const bones = humanoid2({ hipY: HIP, neckY: 0.82, shoulderX: 0.56, shoulderY: 0.6, upperLen: 0.42, foreLen: 0.38, hipX: 0.23, thighLen: 0.44,
    hand: { thumb: [0.06, -0.03, 0.05], fingers: [0, -0.07, 0.03] } });
  bones.push(bone('weapon', 'handR', [0, -0.05, 0.02], [-0.4, 0, 0]), bone('shield', 'foreL', [0.12, -0.22, 0.1], [0, -0.2, 0]),
    bone('tabardF', 'rig', [0, -0.02, 0.33]), bone('tabardB', 'rig', [0, 0.0, -0.31]),
    bone('rune1', 'weapon', [0, 0.04, 0.55]), bone('rune2', 'weapon', [0, 0.04, 0.85]), bone('rune3', 'weapon', [0, 0.04, 1.15]),
    bone('srune1', 'shield', [0, 0.25, 0.07]), bone('srune2', 'shield', [0, 0, 0.09]), bone('srune3', 'shield', [0, -0.25, 0.07]));
  const parts = [], glow = [], add = (...a) => parts.push(...a);
  const rivets = (bn, pts, r = 0.022) => pts.forEach((p) => add(P(bn, S(r, 4, 3), VK.rivet, p, [0, 0, 0], [1, 1, 0.7], { small: true })));
  // ---------------------------------------------------------------- torso: breastplate, ab plates, back, gorget, rivets
  add(P('spine', S(0.44, 12, 10), plateCol(VK.plate), [0, 0.32, 0], [0, 0, 0], [1.15, 1.1, 0.85], { blend: { axis: '+y', band: 0.06 } }));
  add(P('spine', B(0.52, 0.44, 0.12), plateCol(VK.plateLight), [0, 0.38, 0.3], [-0.1, 0, 0]));
  add(P('spine', B(0.1, 0.46, 0.135), VK.trim, [0, 0.38, 0.31], [-0.1, 0, 0]));                                 // centre ridge
  for (let i = 0; i < 3; i++) add(P('spine', B(0.46 - i * 0.04, 0.08, 0.1), plateCol(VK.plate, VK.trimLight), [0, 0.1 - i * 0.085, 0.28 - i * 0.01], [-0.05, 0, 0]));   // ab plates
  add(P('spine', C(0.2, 0.26, 0.14, 10), plateCol(VK.plateLight), [0, 0.74, 0.0]));                              // gorget
  rivets('spine', [[-0.21, 0.55, 0.36], [0.21, 0.55, 0.36], [-0.21, 0.2, 0.36], [0.21, 0.2, 0.36], [0, 0.6, 0.37]]);
  // layered pauldrons: 3 bevelled plates each + spike + rivets
  for (const s2 of ['R', 'L']) {
    const sx = s2 === 'R' ? -1 : 1;
    for (let i = 0; i < 3; i++) {
      const r = 0.25 - i * 0.03, y = 0.08 - i * 0.085, x = sx * (0.03 + i * 0.03), rz = -sx * (0.18 + i * 0.14);
      add(P('arm' + s2, S(r, 10, 6, { thL: Math.PI * 0.5 }), plateCol(i === 1 ? VK.plateLight : VK.plate), [x, y, 0], [0, 0, rz], [1.0, 0.62, 1.05]));
      add(P('arm' + s2, T(r * 0.99, 0.015, 14, 3), VK.trim, [x, y, 0], [Math.PI / 2, 0, rz], [1.0, 1.05, 1], { small: true }));
    }
    add(P('arm' + s2, K(0.06, 0.32, 5), VK.base, [sx * 0.08, 0.32, -0.04], [0, 0, -sx * 0.45]));
    rivets('arm' + s2, [[sx * 0.1, 0.2, 0.2], [sx * 0.1, 0.2, -0.2]], 0.02);
  }
  // ---------------------------------------------------------------- pelvis: belt, faulds, tabard front/back (springs)
  add(P('rig', S(0.34, 10, 8), 0x2c2840, [0, 0, 0], [0, 0, 0], [1.15, 0.7, 0.95]));
  add(P('rig', T(0.36, 0.06, 16, 4), VK.leather, [0, 0.06, 0], [Math.PI / 2, 0, 0]));
  add(P('rig', B(0.15, 0.12, 0.06), VK.trim, [0, 0.06, 0.35]));
  add(...both([P('rig', B(0.26, 0.42, 0.05), plateCol(VK.plate), [-0.22, -0.22, 0.2], [0.1, 0, 0.12])]));          // faulds
  add(P('tabardF', CARD(0.3, 0.62, 3, { taper: 0.75, bend: 0.06 }), (l, n, out) => mixInto(out, VK.cloth, VK.clothDark, -l.y * 1.3), [0, 0, 0], [0.05, 0, 0], [1, 1, 1], { ao: false }));
  add(P('tabardF', CARD(0.05, 0.5, 2, { taper: 0.9 }), VK.trim, [0, -0.02, 0.012], [0.05, 0, 0], [1, 1, 1], { small: true, ao: false }));
  add(P('tabardB', CARD(0.5, 0.72, 3, { taper: 0.8, bend: -0.06 }), (l, n, out) => mixInto(out, VK.cloth, VK.clothDark, -l.y * 1.3), [0, 0, 0], [-0.05, 0, 0], [1, 1, 1], { ao: false }));
  // ---------------------------------------------------------------- helm: dome, visor slit frame, face plate, crest, horns
  add(P('neck', S(0.26, 12, 10), plateCol(VK.plate), [0, 0.14, 0], [0, 0, 0], [1, 1.12, 1.08], { blend: { axis: '+y', band: 0.05 } }));
  add(P('neck', B(0.38, 0.07, 0.1), VK.base, [0, 0.14, 0.22]));
  add(P('neck', K(0.2, 0.2, 8), plateCol(VK.plateLight), [0, 0.0, 0.18], [Math.PI / 2 + 0.3, 0, 0], [1, 1, 0.6]));
  add(P('neck', B(0.05, 0.26, 0.34), VK.trim, [0, 0.36, -0.02]));
  add(...both([P('neck', K(0.05, 0.42, 5), VK.base, [-0.2, 0.44, -0.06], [-0.4, 0, 0.45]), P('neck', T(0.05, 0.012, 8, 3), VK.trim, [-0.17, 0.32, -0.04], [-0.4 + Math.PI / 2, 0, 0.45], [1, 1, 1], { small: true })]));
  rivets('neck', [[-0.2, 0.08, 0.17], [0.2, 0.08, 0.17]], 0.018);
  glow.push(P('neck', B(0.28, 0.03, 0.02), VK.core, [0, 0.14, 0.275], [0, 0, 0], [1, 1, 1], { glowK: 1.15, eyeball: true }));        // visor
  // ---------------------------------------------------------------- arms: mail sleeve + plate vambrace + gauntlets with fingers
  for (const s2 of ['R', 'L']) {
    add(P('arm' + s2, CAP(0.13, 0.22, 8, 2), 0x2c2840, [0, -0.18, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.07 } }));
    add(P('fore' + s2, CAP(0.12, 0.18, 8, 2), 0x2c2840, [0, -0.16, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.06 } }));
    add(P('fore' + s2, C(0.16, 0.13, 0.24, 8), plateCol(VK.plateLight), [0, -0.24, 0]));
    add(P('fore' + s2, T(0.155, 0.014, 10, 3), VK.trim, [0, -0.13, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { small: true }));
    add(P('fore' + s2, S(0.1, 8, 6), plateCol(VK.plate), [0, 0.0, 0.0], [0, 0, 0], [1.05, 0.8, 1.1]));                 // couter
    add(P('hand' + s2, B(0.14, 0.12, 0.15), plateCol(VK.plate), [0, -0.02, 0.0]));
    for (let i = 0; i < 4; i++) add(P('fingers' + s2, B(0.03, 0.08, 0.035), VK.plateLight, [-0.045 + i * 0.03, -0.035, 0.04], [0.3, 0, 0], [1, 1, 1], { small: true }));
    add(P('thumb' + s2, B(0.03, 0.06, 0.035), VK.plateLight, [0, -0.03, 0.02], [0.4, 0, s2 === 'R' ? 0.7 : -0.7], [1, 1, 1], { small: true }));
  }
  // ---------------------------------------------------------------- legs: cuisses, knee cops, greaves, sabatons
  for (const s2 of ['R', 'L']) {
    add(P('leg' + s2, CAP(0.15, 0.2, 8, 2), 0x2c2840, [0, -0.18, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.07 } }));
    add(P('leg' + s2, B(0.22, 0.32, 0.08), plateCol(VK.plate), [0, -0.17, 0.13]));
    add(P('knee' + s2, CAP(0.13, 0.2, 8, 2), plateCol(VK.plate), [0, -0.17, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.06 } }));
    add(P('knee' + s2, S(0.12, 8, 6), plateCol(VK.plateLight), [0, -0.01, 0.1], [0, 0, 0], [1, 1, 0.8]));
    add(P('knee' + s2, B(0.22, 0.12, 0.36), plateCol(VK.plate), [0, -0.4, 0.08]));
    add(P('knee' + s2, B(0.23, 0.03, 0.37), VK.trim, [0, -0.35, 0.08], [0, 0, 0], [1, 1, 1], { small: true }));
  }
  // ---------------------------------------------------------------- sword (axis +z) with 3 rune slots; shield with 3 rune slots
  add(P('weapon', B(0.06, 0.06, 0.34), VK.leather, [0, 0, 0.02]));
  add(P('weapon', B(0.5, 0.07, 0.09), plateCol(VK.plateLight), [0, 0, 0.22]));
  add(P('weapon', OCT(0.065), VK.trim, [0, 0, -0.18]));
  add(P('weapon', B(0.16, 0.03, 1.5), (l, n, out) => mixInto(out, VK.blade, VK.bladeEdge, (Math.abs(l.x) - 0.05) * 30), [0, 0, 1.0], [0, 0, 0], [1, 1, 1], { proxy: true }));
  add(P('weapon', K(0.08, 0.26, 4), VK.blade, [0, 0, 1.88], [Math.PI / 2, 0, 0], [1, 1, 0.2]));
  for (const z of [0.55, 0.85, 1.15]) add(P('weapon', B(0.06, 0.036, 0.12), VK.base, [0, 0, z], [0, 0, 0], [1, 1, 1], { small: true }));   // empty rune slots
  add(P('shield', C(0.46, 0.46, 0.08, 6), plateCol(VK.plate, VK.trimLight), [0, 0, 0], [Math.PI / 2, 0, 0], [1, 1.3, 1]));
  add(P('shield', C(0.5, 0.5, 0.05, 6), VK.trim, [0, 0, -0.03], [Math.PI / 2, 0, 0], [1, 1.3, 1]));
  add(P('shield', K(0.12, 0.22, 6), VK.trim, [0, 0, 0.1], [Math.PI / 2, 0, 0]));
  add(P('shield', B(0.06, 0.7, 0.04), VK.plateLight, [0, 0, 0.05]));
  rivets('shield', [[0.36, 0.3, 0.05], [-0.36, 0.3, 0.05], [0.36, -0.3, 0.05], [-0.36, -0.3, 0.05], [0, 0.52, 0.05], [0, -0.52, 0.05]], 0.024);
  // glow: void chest core, sword groove, rune slots (scaled 0 → 1 per combo step)
  glow.push(P('spine', OCT(0.09), VK.void, [0, 0.4, 0.37], [0, 0, 0], [1, 1.2, 0.6], { glowK: 1.1 }));
  glow.push(P('weapon', B(0.022, 0.032, 1.36), VK.void, [0, 0.0, 1.0], [0, 0, 0], [1, 1, 1], { glowK: 0.9 }));
  for (const r of ['rune1', 'rune2', 'rune3']) glow.push(P(r, B(0.045, 0.045, 0.1), VK.core, [0, 0, 0], [0, 0, 0], [1, 1, 1], { glowK: 1.15 }));
  for (const r of ['srune1', 'srune2', 'srune3']) glow.push(P(r, OCT(0.05), VK.void, [0, 0, 0], [0, 0, 0], [1, 1.3, 0.5], { glowK: 1.15 }));
  return {
    type: 'voidknight', bones, parts, glow, hipY: HIP, headTop: 2.6, lieY: 0.3, sphere: [1.3, 2.2], kind: 'humanoid',
    outline: { t: 0.02, color: 0x100c1a }, proxyMin: 0.13,
    springs: [
      { bone: 'tabardF', axis: 'x', k: 80, d: 6, gain: [0.12, 0], sway: 0.03, swayHz: 0.6, min: -0.9, max: 0.3 },
      { bone: 'tabardB', axis: 'x', k: 80, d: 6, gain: [-0.12, 0], sway: 0.03, swayHz: 0.5, min: -0.3, max: 0.9 },
      { bone: 'tabardF', axis: 'z', k: 80, d: 6, gain: [0, 0.1], sway: 0.02, swayHz: 0.45, min: -0.5, max: 0.5 },
    ],
    anchors: { weapon: ['weapon', [0, 0, 1.85]], hand: ['handR', [0, -0.05, 0.02]], head: ['neck', [0, 0.5, 0]], mouth: ['neck', [0, 0.1, 0.3]], core: ['spine', [0, 0.4, 0.4]], shield: ['shield', [0, 0, 0.12]] },
    aliases: { weapon: 'weapon', shield: 'shield' },
    features: { face: true, faceEquivalent: 'helm visor slit + glow', hands: true, aoVertexColors: true, lod: true, pauldronPlates: 3, rivets: 19, tabardSpring: true, runeSlots: 6, visorGlow: true },
    onInstance(m, B2) {
      const runes = [[B2.rune1, B2.srune1], [B2.rune2, B2.srune2], [B2.rune3, B2.srune3]];
      /** Light the rune slots of combo steps 1..n (0 = all dark). */
      m.setComboStep = (n) => { for (let i = 0; i < 3; i++) { const s = i < n ? 1 : 0.001; runes[i][0].scale.setScalar(s); runes[i][1].scale.setScalar(s); } };
      m.setComboStep(0);
    },
    afterPose(m, name, t) { if (name === 'windup' || name === 'hold' || name === 'strike') m.setComboStep(m._comboStep ?? 1); else if (name === 'idle') m.setComboStep(0); },
    poses: {
      windup(t, p) { p.aLx = -0.7; p.fLx = -1.2; p.aLz = 0.2; },
      hold(t, p) { p.aLx = -0.7; p.fLx = -1.2; p.aLz = 0.2; },
    },
  };
}
