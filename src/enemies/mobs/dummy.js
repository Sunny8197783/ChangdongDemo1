// 훈련용 허수아비 (training dummy) v4 model. Owned by mobmodels.
// Wobble pivot `rig` (v3 name), straw body with rope bindings and a painted target, sack head with a stitched face (button eyes,
// stitched mouth, painted brows), cross-bar arm (`swing` bone: practice attacks swing it) ending in straw tufts on springs, a cloth tag.
import { P, S, C, K, B, T, CARD, both, bone, mixInto } from './rig.js';

const DM = { straw: 0xe8c46a, strawDark: 0xc69a44, wood: 0x8a5c34, woodDark: 0x6a4424, rope: 0x6b4a2a, sack: 0xe9d9b0, sackDark: 0xc8b48a, stitch: 0x3a2416,
  target: 0xd84a3a, targetW: 0xf6efe0, stone: 0x7a7266, cloth: 0x4a7ab0 };

export function dummyDef() {
  const bones = [bone('rig', null, [0, 0.2, 0]), bone('neck', 'rig', [0, 1.75, 0]), bone('swing', 'rig', [0, 1.4, 0]),
    bone('tuftR', 'swing', [-0.85, 0, 0]), bone('tuftL', 'swing', [0.85, 0, 0]), bone('tag', 'rig', [0.18, 1.1, 0.3])];
  const parts = [], add = (...a) => parts.push(...a);
  const strawCol = (l, n, out) => mixInto(out, DM.straw, DM.strawDark, 0.5 + 0.5 * Math.sin(Math.atan2(l.z, l.x) * 18 + l.y * 4));
  // base (root): stone plinth + post socket
  add(P('rig', C(0.35, 0.45, 0.16, 10), DM.stone, [0, -0.12, 0]), P('rig', C(0.13, 0.13, 0.2, 8), DM.woodDark, [0, 0.0, 0]));
  add(P('rig', C(0.09, 0.11, 1.6, 8), DM.wood, [0, 0.6, 0]));
  // straw body + bindings + painted target
  add(P('rig', C(0.32, 0.26, 0.8, 14), strawCol, [0, 1.15, 0]), P('rig', C(0.27, 0.32, 0.18, 14), DM.strawDark, [0, 0.72, 0]));
  add(P('rig', T(0.31, 0.03, 16, 4), DM.rope, [0, 0.95, 0], [Math.PI / 2, 0, 0]), P('rig', T(0.3, 0.03, 16, 4), DM.rope, [0, 1.38, 0], [Math.PI / 2, 0, 0]));
  add(P('rig', T(0.29, 0.02, 16, 3), DM.rope, [0, 1.15, 0], [Math.PI / 2 - 0.5, 0, 0.3], [1, 1, 1], { small: true }));
  add(P('rig', C(0.24, 0.24, 0.02, 18), DM.target, [0, 1.2, 0.3], [Math.PI / 2, 0, 0]), P('rig', C(0.15, 0.15, 0.025, 18), DM.targetW, [0, 1.2, 0.305], [Math.PI / 2, 0, 0]),
    P('rig', C(0.07, 0.07, 0.03, 12), DM.target, [0, 1.2, 0.31], [Math.PI / 2, 0, 0]));
  // cross-bar arm + straw tufts (springs)
  add(P('swing', C(0.05, 0.05, 1.5, 8), DM.wood, [0, 0, 0], [0, 0, Math.PI / 2]));
  for (const [b, sx] of [['tuftR', -1], ['tuftL', 1]]) {
    add(P(b, K(0.13, 0.32, 8), strawCol, [sx * 0.04, 0, 0], [0, 0, -sx * Math.PI / 2]));
    add(P(b, T(0.07, 0.02, 10, 3), DM.rope, [0, 0, 0], [0, Math.PI / 2, 0], [1, 1, 1], { small: true }));
  }
  // sack head with a stitched face
  add(P('neck', S(0.27, 12, 10), (l, n, out) => mixInto(out, DM.sack, DM.sackDark, -l.y * 2), [0, 0.25, 0]));
  add(P('neck', K(0.13, 0.26, 8), DM.straw, [0, 0.57, 0]), P('neck', T(0.12, 0.025, 10, 3), DM.rope, [0, 0.47, 0], [Math.PI / 2, 0, 0]));
  add(P('neck', T(0.16, 0.022, 12, 3), DM.rope, [0, 0.03, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { small: true }));
  for (const sx of [-1, 1]) {
    add(P('neck', C(0.045, 0.045, 0.02, 10), DM.stitch, [sx * 0.09, 0.3, 0.255], [Math.PI / 2 - 0.2, 0, 0], [1, 1, 1], { small: true, eyeball: true }));     // button eyes
    add(P('neck', S(0.012, 4, 3), DM.sack, [sx * 0.09 + 0.015, 0.315, 0.27], [0, 0, 0], [1, 1, 1], { small: true }));
    add(P('neck', B(0.08, 0.016, 0.02), DM.stitch, [sx * 0.09, 0.38, 0.235], [-0.3, 0, sx * -0.25], [1, 1, 1], { small: true }));             // painted brows
  }
  add(P('neck', B(0.16, 0.014, 0.02), DM.stitch, [0, 0.16, 0.262], [-0.2, 0, 0], [1, 1, 1], { small: true }));                              // stitched mouth
  for (let i = -2; i <= 2; i++) add(P('neck', B(0.01, 0.045, 0.02), DM.stitch, [i * 0.035, 0.16, 0.265], [-0.2, 0, 0], [1, 1, 1], { small: true }));
  add(P('tag', CARD(0.1, 0.18, 2, { taper: 0.7 }), DM.cloth, [0, 0, 0], [0.1, 0, 0], [1, 1, 1], { ao: false }));
  return {
    type: 'dummy', bones, parts, hipY: 0.2, headTop: 2.6, lieY: 0.2, sphere: [1.3, 1.7], kind: 'prop',
    outline: { t: 0.02, color: 0x2a1a10 }, proxyMin: 0.12,
    springs: [
      { bone: 'tuftR', axis: 'x', k: 90, d: 5, gain: [0.1, 0], sway: 0.05, swayHz: 0.5 },
      { bone: 'tuftL', axis: 'x', k: 90, d: 5, gain: [0.1, 0], sway: 0.05, swayHz: 0.55 },
      { bone: 'tag', axis: 'x', k: 50, d: 4, gain: [0.2, 0], sway: 0.08, swayHz: 0.8 },
    ],
    anchors: { weapon: ['tuftR', [-0.2, 0, 0]], hand: ['tuftR', [-0.2, 0, 0]], head: ['neck', [0, 0.6, 0]], mouth: ['neck', [0, 0.16, 0.27]], core: ['rig', [0, 1.2, 0.32]] },
    aliases: { swing: 'swing' },
    features: { face: true, faceEquivalent: 'stitched sack face', hands: true, handsEquivalent: 'straw tufts', aoVertexColors: true, lod: true },
    applyPose(m, name, t) {
      const A = m.bones.all;
      const k = name === 'windup' ? Math.min(1, t) : name === 'hold' ? 1 : 0;
      A.rig.rotation.set(name === 'stagger' ? Math.sin(t * 12) * 0.2 * (1 - t) : 0, 0, name === 'idle' ? Math.sin(t * 1.3) * 0.02 : 0);
      A.swing.rotation.y = name === 'strike' ? -1.2 + 2.4 * Math.min(1, t) : name === 'recover' ? 1.2 : 1.0 * k;     // practice swing
      A.neck.rotation.x = name === 'recover' ? 0.3 : 0;
    },
  };
}
