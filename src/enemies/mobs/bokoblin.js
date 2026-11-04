// 뿔도깨비 (bokoblin) v4 model (PLAN v4 §4.1). Owned by mobmodels.
// humanoid2 with the v3 rest layout (hip 0.74 …); tusked under-bite jaw; heavy brow ridge; two curved horns with 2 ring bands each;
// 4-finger fist gripping a knotted club (3 bone spikes + leather wrap); loincloth front/back + shoulder strap + belt pouch + bone necklace;
// ear springs + loincloth springs; war-paint stripes and belly gradient in vertex colour.
import { P, S, HS, C, K, B, CAP, T, TUBE, CARD, both, eye, humanoid2, bone, bandAt, curve, mixInto } from './rig.js';

const BK = {
  skin: 0xe2665a, skinDark: 0xb84a46, skinDeep: 0x8e3536, belly: 0xf3b092, bone: 0xf0e2c0, horn: 0xe6d6ae, hornTip: 0xb8a27a,
  cloth: 0xc99a58, clothDark: 0x8e6236, leather: 0x6e4428, leatherDark: 0x4a2c1a, wood: 0x9c6c3e, woodDark: 0x6a4626,
  paint: 0x3a1616, iris: 0xe89a1c, mouth: 0x4a1418, nail: 0x3a2418,
};
const HIP = 0.74;

function skinPaint(l, n, out, v) {
  // belly gradient: front-facing lower torso lighter
  void l; void n; void v; return out;
}

export function bokoblinDef() {
  const bones = humanoid2({ hipY: HIP, neckY: 0.66, shoulderX: 0.46, shoulderY: 0.48, upperLen: 0.36, foreLen: 0.3, hipX: 0.2, thighLen: 0.32,
    jaw: [0, 0.02, 0.16], lids: [[-0.15, 0.32, 0.31], [0.15, 0.32, 0.31]],
    hand: { thumb: [0.07, -0.03, 0.06], fingers: [0, -0.06, 0.03] } });
  bones.push(
    bone('weapon', 'handR', [0, -0.07, 0.03], [-0.55, 0, 0]),
    bone('earR', 'neck', [-0.34, 0.2, -0.02]), bone('earL', 'neck', [0.34, 0.2, -0.02]),
    bone('clothF', 'rig', [0, -0.04, 0.27]), bone('clothB', 'rig', [0, -0.04, -0.26]),
  );
  const parts = [];
  const add = (...a) => parts.push(...a);

  // ---------------------------------------------------------------- torso (spine; origin y 0.82)
  const torsoCol = (l, n, out) => {
    // belly gradient (front/down lighter) + war-paint chevron stripes across the chest
    mixInto(out, BK.skin, BK.belly, (n.z * 0.9 - 0.25 - l.y * 0.6) * 1.6);
    // two slanted stripes on each pec (front only)
    const ax = Math.abs(l.x), u = ax * 0.8 + (l.y - 0.45);
    if (n.z > 0.25 && ax < 0.4 && l.y > 0.3 && l.y < 0.66 && Math.abs(u - 0.16) < 0.065) mixInto(out, BK.paint, BK.paint, 0);   // one broad chevron band
  };
  add(P('spine', S(0.42, 16, 12), torsoCol, [0, 0.3, 0], [0, 0, 0], [1.12, 1.0, 0.88], { blend: { axis: '+y', band: 0.06 } }));
  add(...both([P('spine', S(0.2, 10, 8), BK.skin, [-0.36, 0.5, 0], [0, 0, 0], [1.15, 0.92, 1])]));      // shoulder masses
  add(P('spine', S(0.24, 10, 8), BK.skin, [0, 0.36, -0.22], [0, 0, 0], [1.4, 1.0, 0.7]));          // back hump
  // shoulder strap (diagonal) + bone necklace
  add(P('spine', T(0.36, 0.028, 18, 4), BK.leather, [0, 0.36, 0.0], [Math.PI / 2, 0.55, 0], [1.0, 0.9, 1]));
  add(P('spine', T(0.24, 0.012, 16, 3), BK.leatherDark, [0, 0.6, 0.04], [Math.PI / 2 - 0.28, 0, 0], [1, 1, 1], { small: true }));
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.32;
    add(P('spine', K(0.032 + (i === 0 ? 0.012 : 0), 0.13 + (i === 0 ? 0.05 : 0), 5), BK.bone, [Math.sin(a) * 0.25, 0.55 - Math.abs(i) * 0.015, 0.22 + Math.cos(a) * 0.04], [2.7, 0, -a * 0.6], [1, 1, 1], { small: true }));
  }

  // ---------------------------------------------------------------- pelvis (rig; origin y 0.74)
  add(P('rig', S(0.3, 12, 8), BK.skinDark, [0, 0, 0], [0, 0, 0], [1.15, 0.72, 0.9]));
  add(P('rig', T(0.33, 0.055, 18, 5), BK.leather, [0, 0.06, 0], [Math.PI / 2, 0, 0], [1.05, 0.86, 1]));
  add(P('rig', B(0.12, 0.1, 0.04), 0xc8a24a, [0, 0.06, 0.29]));                                      // buckle
  add(P('rig', B(0.06, 0.05, 0.05), BK.leatherDark, [0, 0.06, 0.31], [0, 0, 0], [1, 1, 1], { small: true }));
  add(P('rig', S(0.09, 8, 6), BK.leather, [0.3, -0.02, 0.1], [0, 0, 0], [1, 1.15, 0.8]));              // belt pouch
  add(P('rig', B(0.13, 0.04, 0.12), BK.leatherDark, [0.31, 0.07, 0.1], [0, 0, 0.1], [1, 1, 1], { small: true }));
  add(P('rig', S(0.025, 4, 3), 0xc8a24a, [0.38, 0.05, 0.12], [0, 0, 0], [1, 1, 1], { small: true }));
  // loincloth (spring bones; tattered hem = two tapered cards)
  add(P('clothF', CARD(0.34, 0.44, 3, { bend: 0.05, taper: 0.8 }), BK.cloth, [0, 0, 0], [0.08, 0, 0], [1, 1, 1], { ao: false }));
  add(P('clothF', CARD(0.12, 0.1, 1, { taper: 0.1 }), BK.clothDark, [-0.08, -0.44, 0.012], [0.08, 0, 0], [1, 1, 1], { small: true, ao: false }));
  add(P('clothF', CARD(0.12, 0.13, 1, { taper: 0.1 }), BK.clothDark, [0.07, -0.42, 0.012], [0.08, 0, 0], [1, 1, 1], { small: true, ao: false }));
  add(P('clothB', CARD(0.38, 0.4, 3, { bend: -0.05, taper: 0.85 }), BK.clothDark, [0, 0, 0], [-0.08, 0, 0], [1, 1, 1], { ao: false }));

  // ---------------------------------------------------------------- head (neck; origin y 1.48)
  const headCol = (l, n, out) => {
    mixInto(out, BK.skin, BK.skinDark, (0.1 - l.y) * 3);
    // war paint: two cheek stripes under the eyes
  };
  const craniumCol = (l, n, out) => {
    headCol(l, n, out);
    // war paint: one stripe down from each eye to the cheek
    if (n.z > 0.35 && l.y > 0.04 && l.y < 0.2 && Math.abs(Math.abs(l.x) - 0.17 - (0.2 - l.y) * 0.5) < 0.026) mixInto(out, BK.paint, BK.paint, 0);
  };
  add(P('neck', S(0.36, 16, 12), craniumCol, [0, 0.17, -0.02], [0, 0, 0], [1.05, 0.92, 1], { blend: { axis: '+y', band: 0.06 } }));
  add(P('neck', S(0.21, 12, 8), headCol, [0, 0.03, 0.3], [0, 0, 0], [1.3, 0.85, 1]));                 // muzzle
  add(P('neck', S(0.075, 8, 6), BK.skinDark, [0, 0.1, 0.5], [0, 0, 0], [1.25, 0.8, 1]));          // nose
  add(...both([P('neck', S(0.025, 4, 3), BK.skinDeep, [-0.04, 0.08, 0.56], [0, 0, 0], [1, 1, 1], { small: true })]));
  // brow ridge (heavy, angry) + brows
  add(P('neck', TUBE([[-0.28, 0.36, 0.18], [-0.14, 0.37, 0.33], [0, 0.32, 0.37], [0.14, 0.37, 0.33], [0.28, 0.36, 0.18]], [0.04, 0.055, 0.05, 0.055, 0.04], 6), BK.skinDark, [0, 0, 0]));
  add(...both([P('neck', B(0.15, 0.035, 0.05), BK.skinDeep, [-0.14, 0.41, 0.33], [0.1, 0.25, -0.38], [1, 1, 1], { small: true })]));
  // eyes (yellow sclera, amber iris) + lids (scale-y blink)
  add(...eye('neck', [-0.15, 0.25, 0.31], 0.088, { sclera: 0xf8eab8, iris: BK.iris, yaw: -0.18, hiSide: 1 }));
  add(...eye('neck', [0.15, 0.25, 0.31], 0.088, { sclera: 0xf8eab8, iris: BK.iris, yaw: 0.18, hiSide: 1 }));
  for (const [side, x] of [['R', -0.15], ['L', 0.15]]) {
    add(P('lid' + side, S(0.098, 8, 6, { phS: 0, phL: Math.PI }), BK.skinDark, [0, -0.07, -0.006], [0, x < 0 ? 0.18 : -0.18, 0], [1, 1, 0.72], { small: true, ao: false }));
  }
  // ears (spring bones): long, pointed, flat
  const earR = [[0, 0, 0], [-0.14, 0.04, -0.01], [-0.3, 0.1, -0.03], [-0.44, 0.17, -0.06]];
  add(P('earR', TUBE(earR, [0.085, 0.078, 0.045, 0.006], 6), BK.skin, [0, 0, 0], [0, 0, 0], [1, 1, 0.42]));
  add(P('earR', TUBE(earR.map((p) => [p[0] * 0.85, p[1] * 0.85 + 0.005, p[2] + 0.025]), [0.05, 0.045, 0.025, 0.004], 5), BK.skinDeep, [0, 0, 0], [0, 0, 0], [1, 1, 0.3], { small: true }));
  add(P('earR', T(0.035, 0.009, 8, 3), 0xd4b048, [-0.12, -0.05, 0.0], [0, Math.PI / 2, 0], [1, 1, 1], { small: true }));   // earring
  const earL = earR.map((p) => [-p[0], p[1], p[2]]);
  add(P('earL', TUBE(earL, [0.085, 0.078, 0.045, 0.006], 6), BK.skin, [0, 0, 0], [0, 0, 0], [1, 1, 0.42]));
  add(P('earL', TUBE(earL.map((p) => [p[0] * 0.85, p[1] * 0.85 + 0.005, p[2] + 0.025]), [0.05, 0.045, 0.025, 0.004], 5), BK.skinDeep, [0, 0, 0], [0, 0, 0], [1, 1, 0.3], { small: true }));
  // two distinct curved horns (sweep up/out, tips curl forward) with 2 ring bands each
  const hornR = curve([-0.15, 0.4, 0.02], [-0.3, 0.62, -0.06], [-0.36, 0.78, 0.17], 6);
  const hornL = curve([0.15, 0.4, 0.02], [0.26, 0.66, -0.02], [0.24, 0.84, 0.12], 6);   // the left horn is taller and straighter (asymmetric)
  const hornCol = (l, n, out) => mixInto(out, BK.horn, BK.hornTip, (l.y - 0.55) * 3.5);
  for (const [h, rr] of [[hornR, 0.078], [hornL, 0.072]]) {
    add(P('neck', TUBE(h, [rr, rr * 0.86, rr * 0.7, rr * 0.5, rr * 0.3, 0.008], 7), hornCol, [0, 0, 0], [0, 0, 0], [1, 1, 1], { proxy: true }));
    add(bandAt('neck', h, 0.22, rr * 0.88, 0.016, BK.leatherDark), bandAt('neck', h, 0.42, rr * 0.74, 0.014, BK.leatherDark));
  }
  // under-bite jaw (jaw bone at neck-local (0, 0.02, 0.16)): lower jaw juts forward past the muzzle, 2 tusks + lower teeth, dark mouth
  add(P('jaw', S(0.2, 10, 6), BK.skinDark, [0, -0.1, 0.14], [0, 0, 0], [1.12, 0.46, 1.08], { blend: { axis: '+y', band: 0.04 } }));
  add(P('neck', B(0.26, 0.07, 0.18), BK.mouth, [0, 0.0, 0.32], [0, 0, 0], [1, 1, 1], { small: true, ao: false }));
  for (const sx of [-1, 1]) {
    add(P('jaw', TUBE(curve([sx * 0.12, -0.07, 0.3], [sx * 0.14, 0.02, 0.33], [sx * 0.16, 0.12, 0.3], 4), [0.034, 0.026, 0.014, 0.004], 6), BK.bone, [0, 0, 0], [0, 0, 0], [1, 1, 1], { small: true }));
    for (let i = 0; i < 2; i++) add(P('jaw', K(0.016, 0.05, 4), BK.bone, [sx * (0.03 + i * 0.045), -0.035, 0.33 - i * 0.015], [0, 0, 0], [1, 1, 1], { small: true }));
  }
  add(P('neck', B(0.22, 0.018, 0.02), BK.skinDeep, [0, 0.035, 0.405], [0, 0, 0], [1, 1, 1], { small: true }));   // upper lip line

  // ---------------------------------------------------------------- arms
  for (const s of ['R', 'L']) {
    add(P('arm' + s, CAP(0.12, 0.2, 8, 3), BK.skin, [0, -0.17, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.07 } }));
    add(P('fore' + s, CAP(0.122, 0.16, 8, 3), BK.skin, [0, -0.14, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.06 } }));
    add(P('fore' + s, C(0.142, 0.13, 0.12, 9), BK.leather, [0, -0.2, 0]));                              // bracer
    add(P('fore' + s, T(0.138, 0.012, 10, 3), BK.leatherDark, [0, -0.16, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { small: true }));
    add(P('hand' + s, S(0.105, 8, 6), BK.skinDark, [0, -0.03, 0.0], [0, 0, 0], [1, 0.85, 1.1], { dark: 0.92 }));
  }
  // right fist wraps the club handle (fingers modelled curled around the weapon axis); left hand open, 4 fingers + thumb
  for (let i = 0; i < 4; i++) {
    const z = -0.045 + i * 0.03;
    add(P('fingersR', TUBE(curve([0.07, 0.0, z], [0.06, -0.09, z], [-0.04, -0.08, z + 0.005], 4), [0.03, 0.029, 0.026, 0.022], 5), BK.skinDark, [0, 0, 0], [-0.55, 0, 0], [1, 1, 1], { small: true, dark: 0.9 }));
    add(P('fingersR', K(0.014, 0.03, 4), BK.nail, [-0.06, -0.075, z + 0.005], [-0.55, 0, 1.6], [1, 1, 1], { small: true }));
  }
  add(P('thumbR', CAP(0.03, 0.05, 5, 2), BK.skinDark, [0, -0.02, 0.02], [0.4, 0, 0.9], [1, 1, 1], { small: true }));
  for (let i = 0; i < 4; i++) {
    const x = -0.045 + i * 0.03;
    add(P('fingersL', CAP(0.026, 0.07, 4, 2), BK.skinDark, [x, -0.05, 0.01], [0.25, 0, (i - 1.5) * 0.08], [1, 1, 1], { small: true, dark: 0.9 }));
    add(P('fingersL', K(0.013, 0.03, 4), BK.nail, [x, -0.11, 0.025], [Math.PI + 0.25, 0, 0], [1, 1, 1], { small: true }));
  }
  add(P('thumbL', CAP(0.028, 0.05, 5, 2), BK.skinDark, [0, -0.03, 0.02], [0.5, 0, -0.6], [1, 1, 1], { small: true }));

  // ---------------------------------------------------------------- legs + feet (3 toes, claws)
  for (const s of ['R', 'L']) {
    add(P('leg' + s, CAP(0.14, 0.14, 8, 3), BK.skin, [0, -0.15, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.07 } }));
    add(P('knee' + s, CAP(0.128, 0.12, 8, 3), BK.skinDark, [0, -0.13, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.06 } }));
    add(P('knee' + s, C(0.148, 0.148, 0.07, 9), BK.cloth, [0, -0.08, 0]));                              // shin wrap
    add(P('knee' + s, T(0.146, 0.01, 10, 3), BK.leatherDark, [0, -0.05, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { small: true }));
    add(P('knee' + s, S(0.15, 9, 7), BK.skinDark, [0, -0.3, 0.06], [0, 0, 0], [1, 0.52, 1.45], { dark: 0.92 }));
    for (let i = -1; i <= 1; i++) {
      add(P('knee' + s, S(0.05, 6, 4), BK.skinDark, [i * 0.07, -0.33, 0.24], [0, 0, 0], [1, 0.8, 1.2], { small: true, dark: 0.88 }));
      add(P('knee' + s, K(0.02, 0.05, 4), BK.nail, [i * 0.07, -0.34, 0.29], [Math.PI / 2, 0, 0], [1, 1, 1], { small: true }));
    }
  }

  // ---------------------------------------------------------------- club (weapon; axis +z): leather-wrapped grip, knotted shaft, 3 bone spikes
  add(P('weapon', C(0.038, 0.046, 0.34, 8), BK.woodDark, [0, 0, 0.0], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 3; i++) add(P('weapon', T(0.047, 0.014, 8, 3), BK.leather, [0, 0, -0.08 + i * 0.07], [0, 0, 0], [1, 1, 1], { small: true }));
  const shaft = [[0, 0, 0.15], [0.01, 0.005, 0.38], [-0.005, 0.0, 0.62], [0, 0.01, 0.86], [0, 0, 0.98]];
  const woodCol = (l, n, out) => mixInto(out, BK.wood, BK.woodDark, 0.5 + 0.5 * Math.sin(l.z * 23 + Math.atan2(l.y, l.x) * 3) * 0.6);
  add(P('weapon', TUBE(shaft, [0.05, 0.075, 0.1, 0.125, 0.06], 9), woodCol, [0, 0, 0], [0, 0, 0], [1, 1, 1], { proxy: true }));
  for (const [x, y, z, r] of [[0.07, 0.03, 0.5, 0.045], [-0.08, -0.02, 0.7, 0.05], [0.03, -0.1, 0.62, 0.04], [-0.02, 0.1, 0.82, 0.045]]) {
    add(P('weapon', S(r, 6, 5), BK.woodDark, [x, y, z], [0, 0, 0], [1, 1, 1], { small: true }));          // knots
  }
  add(P('weapon', K(0.04, 0.17, 5), BK.bone, [0.13, 0.02, 0.72], [0, 0, -1.45]));
  add(P('weapon', K(0.04, 0.17, 5), BK.bone, [-0.12, 0.05, 0.62], [0, 0, 1.4]));
  add(P('weapon', K(0.045, 0.2, 5), BK.bone, [0.0, 0.15, 0.86], [0.15, 0, 0]));
  add(P('weapon', T(0.11, 0.016, 10, 3), BK.leather, [0, 0, 0.55], [0, 0, 0], [1, 1, 1], { small: true }));

  return {
    type: 'bokoblin', bones, parts, hipY: HIP, headTop: 1.75, lieY: 0.28, sphere: [1.0, 1.6], kind: 'humanoid',
    outline: { t: 0.017, color: 0x241210 }, proxyMin: 0.11,
    lids: { open: 0.3, closed: 1.0 }, jawOpen: 0.32,
    springs: [
      { bone: 'earR', axis: 'z', k: 140, d: 8, gain: [0.05, 0.08], sway: 0.04, swayHz: 0.6, min: -0.5, max: 0.5 },
      { bone: 'earL', axis: 'z', k: 140, d: 8, gain: [0.05, -0.08], sway: 0.04, swayHz: 0.65, min: -0.5, max: 0.5 },
      { bone: 'clothF', axis: 'x', k: 90, d: 7, gain: [0.12, 0], sway: 0.03, swayHz: 0.8, min: -0.8, max: 0.3 },
      { bone: 'clothB', axis: 'x', k: 90, d: 7, gain: [-0.12, 0], sway: 0.03, swayHz: 0.7, min: -0.3, max: 0.8 },
    ],
    anchors: { weapon: ['weapon', [0, 0.05, 0.92]], head: ['neck', [0, 0.36, 0.1]], hand: ['handR', [0, -0.05, 0.02]], mouth: ['jaw', [0, -0.05, 0.3]], core: ['spine', [0, 0.3, 0.3]] },
    aliases: { weapon: 'weapon' },
    features: { face: true, hands: true, aoVertexColors: true, lod: true, horns: 2, tusks: true, club: true, necklace: true, warPaint: true },
    poses: {
      windup(t, p) { p.aRx = -3.4 * Math.min(1, t * 1.2) - 0.2; p.jaw = 0.9 * t; },   // club over the head, roar
      hold(t, p) { p.aRx = -3.6; p.jaw = 1; },
      recover(t, p) { p.aRx = -0.15; p.fRx = -0.05; p.pitch = 0.6; },               // club stuck in the ground, head low
    },
  };
}
void skinPaint; void HS;
