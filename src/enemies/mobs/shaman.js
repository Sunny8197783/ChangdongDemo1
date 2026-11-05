// 도깨비 주술사 (shaman) v4 model (PLAN v4 §4.2). Owned by mobmodels.
// humanoid2 (v3 rest layout, hip 0.66) with a visible face (hooked nose, mouth line + fangs, painted brow), long-fingered hands,
// robe lathe with a glyph-trim band and a tattered hem on 2 spring strips, hood with a feather crest (spring), bone staff with a skull +
// feathers holding the element gem inside an orbiting ring (glow; `halo` = the ring bone, scaled by the cast so it grows).
import { P, S, C, K, B, CAP, T, TUBE, CARD, LATHE, OCT, both, eye, humanoid2, bone, curve, mixInto } from './rig.js';
import { ELEMENT_COLORS } from '../../core/utils.js';

const SH = { skin: 0x74aec0, skinDark: 0x548aa0, robe: 0x6a49a6, robeDark: 0x46307a, robeDeep: 0x34245c, trim: 0xe4bf5c, glyph: 0x5a2a18,
  bone: 0xeee2c6, boneDark: 0xb8a888, hood: 0x553a90, paint: 0xd6463a, feather1: 0xd8503a, feather2: 0x3eaed0, feather3: 0xf0d050, mouth: 0x2a1220, nail: 0x2a2030 };
const HIP = 0.66;

function gemColor(el) {
  const c = ELEMENT_COLORS?.[el];
  return typeof c === 'number' ? c : 0xff7a3a;
}

export function shamanDef(opts = {}) {
  const el = opts.element || opts.variant || 'fire';
  const bones = humanoid2({ hipY: HIP, neckY: 0.56, shoulderX: 0.34, shoulderY: 0.4, upperLen: 0.3, foreLen: 0.28, hipX: 0.14, thighLen: 0.22,
    jaw: [0, -0.02, 0.18], lids: [[-0.1, 0.235, 0.255], [0.1, 0.235, 0.255]], hand: { thumb: [0.05, -0.03, 0.04], fingers: [0, -0.06, 0.02] } });
  bones.push(
    bone('staff', 'handR', [0, 0, 0.02], [0.25, 0, 0]), bone('gem', 'staff', [0, 1.55, 0]), bone('ring', 'gem', [0, 0, 0]),
    bone('hemR', 'rig', [-0.3, -0.62, 0.12]), bone('hemL', 'rig', [0.28, -0.62, -0.14]),
    bone('crest', 'neck', [0, 0.42, -0.12], [-0.4, 0, 0]), bone('feathers', 'staff', [0, 1.06, 0]),
  );
  const parts = [], add = (...a) => parts.push(...a);
  // ---------------------------------------------------------------- robe (rig): lathe skirt with a glyph-trim band near the hem
  const robeCol = (l, n, out) => {
    mixInto(out, SH.robe, SH.robeDark, (-l.y - 0.1) * 1.4);
    if (l.y < -0.52 && l.y > -0.62) {
      out.setHex(SH.trim);
      const a = Math.atan2(l.z, l.x);
      if (Math.sin(a * 14) > 0.55 && l.y < -0.545 && l.y > -0.6) out.setHex(SH.glyph);
    }
  };
  add(P('rig', LATHE([[0.0, -0.585], [0.46, -0.585], [0.49, -0.56], [0.42, -0.45], [0.33, -0.2], [0.28, 0.0], [0.24, 0.1], [0.0, 0.12]], 14), robeCol, [0, 0, 0]));
  add(P('rig', T(0.28, 0.045, 14, 4), SH.robeDeep, [0, 0.07, 0], [Math.PI / 2, 0, 0]));                 // sash
  add(P('rig', CARD(0.1, 0.36, 2, { taper: 0.6 }), SH.trim, [0.12, 0.04, 0.29], [0.12, 0, 0.05], [1, 1, 1], { ao: false }));   // sash tail
  add(P('rig', S(0.05, 6, 4), SH.bone, [0.13, 0.02, 0.3], [0, 0, 0], [1, 1, 0.6], { small: true }));
  // tattered hem: 2 spring strips
  add(P('hemR', CARD(0.16, 0.22, 2, { taper: 0.25 }), SH.robeDark, [0, 0, 0], [0.15, -0.4, 0], [1, 1, 1], { ao: false }));
  add(P('hemL', CARD(0.15, 0.2, 2, { taper: 0.25 }), SH.robeDark, [0, 0, 0], [-0.15, 2.6, 0], [1, 1, 1], { ao: false }));
  // ---------------------------------------------------------------- torso (spine)
  add(P('spine', S(0.31, 12, 10), SH.robe, [0, 0.24, 0], [0, 0, 0], [1.05, 1.1, 0.88], { blend: { axis: '+y', band: 0.06 } }));
  add(...both([P('spine', S(0.16, 9, 7), SH.robeDark, [-0.3, 0.42, 0], [0, 0, 0], [1.1, 0.85, 1])]));
  add(P('spine', T(0.2, 0.028, 14, 4), SH.bone, [0, 0.46, 0.07], [Math.PI / 2 - 0.35, 0, 0]));          // bone collar
  add(P('spine', S(0.055, 6, 5), SH.bone, [0, 0.36, 0.28], [0, 0, 0], [1, 1.15, 0.7], { small: true }));   // pendant skull
  add(...both([P('spine', S(0.014, 4, 3), SH.mouth, [-0.02, 0.37, 0.32], [0, 0, 0], [1, 1, 1], { small: true })]));
  add(P('spine', K(0.34, 0.44, 10), SH.hood, [0, 0.6, -0.2], [-0.95, 0, 0], [1, 1, 0.65]));            // hood back drape
  // ---------------------------------------------------------------- head (neck)
  const headCol = (l, n, out) => {
    mixInto(out, SH.skin, SH.skinDark, (0.05 - l.y) * 4);
    if (n.z > 0.3 && l.y > 0.24 && l.y < 0.29 && Math.abs(l.x) < 0.17) out.setHex(SH.paint);          // painted brow
  };
  add(P('neck', S(0.26, 12, 10), headCol, [0, 0.12, 0.02], [0, 0, 0], [1, 1, 1], { blend: { axis: '+y', band: 0.05 } }));
  add(P('neck', S(0.15, 10, 8), headCol, [0, 0.04, 0.2], [0, 0, 0], [1.15, 0.85, 1]));
  add(P('neck', TUBE(curve([0, 0.18, 0.32], [0, 0.12, 0.46], [0, 0.03, 0.42], 5), [0.05, 0.045, 0.035, 0.022, 0.012], 6), SH.skinDark, [0, 0, 0]));   // hooked nose
  add(P('neck', TUBE([[-0.25, 0.3, 0.12], [-0.12, 0.31, 0.24], [0, 0.28, 0.27], [0.12, 0.31, 0.24], [0.25, 0.3, 0.12]], [0.025, 0.035, 0.03, 0.035, 0.025], 5), SH.skinDark));   // brow ridge
  add(...eye('neck', [-0.1, 0.17, 0.252], 0.07, { sclera: 0xf3e8c8, iris: 0xffd860, glowIris: true, yaw: -0.25, pupilK: 0.32, slit: true }));
  add(...eye('neck', [0.1, 0.17, 0.252], 0.07, { sclera: 0xf3e8c8, iris: 0xffd860, glowIris: true, yaw: 0.25, pupilK: 0.32, slit: true }));
  for (const [side, x] of [['R', -0.1], ['L', 0.1]]) add(P('lid' + side, S(0.078, 8, 6, { phS: 0, phL: Math.PI }), SH.skinDark, [0, -0.065, -0.004], [0, x < 0 ? 0.25 : -0.25, 0], [1, 1, 0.72], { small: true, ao: false }));
  add(P('neck', B(0.16, 0.022, 0.03), SH.mouth, [0, -0.04, 0.33], [0, 0, 0], [1, 1, 1], { small: true }));     // mouth line
  add(P('jaw', S(0.13, 9, 6), SH.skinDark, [0, -0.07, 0.1], [0, 0, 0], [1.1, 0.5, 1], { blend: { axis: '+y', band: 0.04 } }));
  add(...both([P('jaw', K(0.014, 0.045, 4), SH.bone, [-0.05, -0.02, 0.2], [0, 0, 0], [1, 1, 1], { small: true })]));     // little fangs
  const earR = [[-0.22, 0.12, -0.02], [-0.34, 0.1, -0.05], [-0.44, 0.04, -0.08]];
  add(P('neck', TUBE(earR, [0.06, 0.04, 0.006], 5), SH.skin, [0, 0, 0], [0, 0, 0], [1, 1, 0.45]));
  add(P('neck', TUBE(earR.map((p) => [-p[0], p[1], p[2]]), [0.06, 0.04, 0.006], 5), SH.skin, [0, 0, 0], [0, 0, 0], [1, 1, 0.45]));
  // hood (shell over the head) + trim + feather crest (spring)
  add(P('neck', S(0.36, 12, 9, { thL: Math.PI * 0.6 }), SH.hood, [0, 0.13, -0.05], [-0.38, 0, 0], [1.02, 1.05, 1.05]));
  add(P('neck', T(0.32, 0.03, 16, 4), SH.trim, [0, 0.1, 0.17], [0.38, 0, 0], [1, 1.1, 1]));
  add(P('neck', K(0.15, 0.48, 8), SH.hood, [0, 0.33, -0.42], [-2.1, 0, 0]));
  const fcol = [SH.feather1, SH.feather2, SH.feather3];
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.35;
    add(P('crest', TUBE(curve([0, 0, 0], [Math.sin(a) * 0.08, 0.16, -0.03], [Math.sin(a) * 0.16, 0.3, -0.12], 4), [0.012, 0.04, 0.035, 0.004], 4), fcol[i], [0, 0, 0], [0, 0, 0], [1, 1, 0.35], { ao: false }));
  }
  add(P('crest', S(0.04, 6, 4), SH.bone, [0, 0, 0], [0, 0, 0], [1, 1, 1], { small: true }));
  // ---------------------------------------------------------------- arms: sleeves, long-fingered hands
  for (const s of ['R', 'L']) {
    add(P('arm' + s, C(0.1, 0.15, 0.3, 9), SH.robe, [0, -0.14, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.06 } }));
    add(P('fore' + s, C(0.14, 0.21, 0.26, 10, { open: false }), SH.robeDark, [0, -0.12, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.05 } }));
    add(P('fore' + s, T(0.205, 0.02, 12, 3), SH.trim, [0, -0.25, 0], [Math.PI / 2, 0, 0]));
    add(P('fore' + s, CAP(0.05, 0.08, 6, 2), SH.skin, [0, -0.27, 0.0], [0, 0, 0], [1, 1, 1], { small: true }));
    add(P('hand' + s, S(0.07, 8, 6), SH.skin, [0, -0.025, 0.01], [0, 0, 0], [0.9, 1, 1.1], { dark: 0.95 }));
  }
  for (let i = 0; i < 4; i++) {
    const z = -0.04 + i * 0.027;
    add(P('fingersR', TUBE(curve([0.05, 0.0, z], [0.06, -0.1, z], [-0.03, -0.09, z], 4), [0.017, 0.016, 0.014, 0.011], 4), SH.skin, [0, 0, 0], [0.25, 0, 0], [1, 1, 1], { small: true }));
    const x = -0.04 + i * 0.027;
    add(P('fingersL', TUBE([[x, 0, 0.01], [x * 1.3, -0.07, 0.03], [x * 1.5, -0.13, 0.06]], [0.016, 0.014, 0.008], 4), SH.skin, [0, 0, 0], [0, 0, 0], [1, 1, 1], { small: true }));
    add(P('fingersL', K(0.009, 0.03, 4), SH.nail, [x * 1.55, -0.145, 0.065], [Math.PI - 0.4, 0, 0], [1, 1, 1], { small: true }));
  }
  add(P('thumbR', CAP(0.017, 0.05, 4, 2), SH.skin, [0, -0.02, 0.01], [0.4, 0, 0.8], [1, 1, 1], { small: true }));
  add(P('thumbL', CAP(0.017, 0.05, 4, 2), SH.skin, [0, -0.02, 0.01], [0.5, 0, -0.7], [1, 1, 1], { small: true }));
  // ---------------------------------------------------------------- legs (mostly under the robe) + bare feet
  for (const s of ['R', 'L']) {
    add(P('leg' + s, CAP(0.08, 0.1, 6, 2), SH.robeDeep, [0, -0.1, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.05 } }));
    add(P('knee' + s, CAP(0.07, 0.06, 6, 2), SH.skinDark, [0, -0.08, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.05 } }));
    add(P('knee' + s, S(0.1, 8, 6), SH.skinDark, [0, -0.17, 0.05], [0, 0, 0], [1, 0.5, 1.5], { dark: 0.9 }));
    add(P('knee' + s, T(0.072, 0.012, 8, 3), SH.bone, [0, -0.1, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { small: true }));    // anklet
  }
  // ---------------------------------------------------------------- staff (axis +y): shaft, wraps, skull, prongs, feathers (spring)
  add(P('staff', C(0.028, 0.036, 1.75, 7), SH.boneDark, [0, 0.35, 0]));
  for (const y of [0.0, 0.1, 0.9]) add(P('staff', T(0.038, 0.012, 8, 3), 0x7a4a2a, [0, y, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { small: true }));
  add(P('staff', S(0.12, 10, 8), SH.bone, [0, 1.25, 0.02], [0, 0, 0], [0.95, 0.9, 1.05]));                    // skull
  add(P('staff', S(0.075, 8, 6), SH.bone, [0, 1.19, 0.08], [0, 0, 0], [1, 0.8, 1]));
  add(...both([P('staff', S(0.032, 6, 4), SH.mouth, [-0.045, 1.27, 0.12], [0, 0, 0], [1, 1, 0.6], { small: true })]));   // sockets
  add(P('staff', B(0.08, 0.012, 0.02), SH.mouth, [0, 1.16, 0.15], [0, 0, 0], [1, 1, 1], { small: true }));
  add(...both([P('staff', TUBE(curve([-0.07, 1.3, 0], [-0.18, 1.45, 0], [-0.1, 1.66, 0], 4), [0.03, 0.025, 0.018, 0.006], 5), SH.bone, [0, 0, 0])]));   // gem cradle prongs
  add(P('feathers', CARD(0.05, 0.22, 2, { taper: 0.3 }), SH.feather1, [0.05, 0, 0.02], [0, 0, 0.25], [1, 1, 1], { ao: false }));
  add(P('feathers', CARD(0.05, 0.2, 2, { taper: 0.3 }), SH.feather2, [-0.05, 0, 0.01], [0, 0, -0.3], [1, 1, 1], { ao: false }));
  add(P('feathers', T(0.04, 0.012, 8, 3), 0x7a4a2a, [0, 0.0, 0], [Math.PI / 2, 0, 0], [1, 1, 1], { small: true }));
  // ---------------------------------------------------------------- glow: eyes (iris above), element gem + orbiting ring with beads
  const gc = gemColor(el), glowK = 1.15;
  const glow = [
    P('gem', OCT(0.1), gc, [0, 0, 0], [0, 0, 0], [0.85, 1.3, 0.85], { glowK }),
    P('ring', T(0.2, 0.012, 20, 3), gc, [0, 0, 0], [0, 0, 0], [1, 1, 1], { glowK }),
    P('ring', S(0.025, 5, 4), gc, [0.2, 0, 0], [0, 0, 0], [1, 1, 1], { glowK }),
    P('ring', S(0.025, 5, 4), gc, [-0.1, 0.173, 0], [0, 0, 0], [1, 1, 1], { glowK }),
    P('ring', S(0.025, 5, 4), gc, [-0.1, -0.173, 0], [0, 0, 0], [1, 1, 1], { glowK }),
  ];
  return {
    type: 'shaman', key: 'shaman:' + el, element: el, bones, parts, glow, hipY: HIP, headTop: 1.55, lieY: 0.26, sphere: [0.9, 1.5], kind: 'humanoid',
    outline: { t: 0.016, color: 0x34205e }, proxyMin: 0.07, lids: { open: 0.35, closed: 1.0 }, jawOpen: 0.3,
    springs: [
      { bone: 'hemR', axis: 'x', k: 80, d: 6, gain: [0.14, 0], sway: 0.05, swayHz: 0.7, min: -0.9, max: 0.4 },
      { bone: 'hemL', axis: 'x', k: 80, d: 6, gain: [0.14, 0], sway: 0.05, swayHz: 0.8, min: -0.9, max: 0.4 },
      { bone: 'crest', axis: 'x', k: 120, d: 7, gain: [0.1, 0], sway: 0.04, swayHz: 1.1, min: -0.6, max: 0.6 },
      { bone: 'feathers', axis: 'z', k: 70, d: 5, gain: [0, 0.12], sway: 0.08, swayHz: 0.9, min: -0.8, max: 0.8 },
    ],
    anchors: { weapon: ['gem', [0, 0, 0]], head: ['neck', [0, 0.4, 0.05]], hand: ['handL', [0, -0.05, 0.02]], mouth: ['jaw', [0, -0.03, 0.2]], core: ['gem', [0, 0, 0]] },
    aliases: { staff: 'staff', gem: 'gem', halo: 'ring', weapon: 'staff' },
    features: { face: true, hands: true, aoVertexColors: true, lod: true, robeLathe: true, hood: true, featherCrest: true, gemRing: true, glyphTrim: true },
    onInstance(m, B) { B.ring.scale.set(0.7, 0.7, 1); },
    afterPose(m, name, t) {
      // the ring grows during the cast (behaviour code scales `halo` itself while casting)
      const k = name === 'windup' ? Math.min(1, t) : name === 'hold' ? 1 : 0;
      const s = 0.7 + k * 0.9; m.bones.all.ring.scale.set(s, s, 1);
    },
    poses: {
      windup(t, p) { p.aRx = -1.6 * t - 0.3; p.fRx = -0.5 * t; p.aRz = -0.2; p.aLx = -1.2 * t; p.aLz = 0.6 * t; p.headX = -0.15 * t; p.spineX = -0.15 * t; },
      hold(t, p) { p.aRx = -1.9; p.fRx = -0.5; p.aRz = -0.2; p.aLx = -1.2; p.aLz = 0.6; p.headX = -0.15; p.spineX = -0.15; },
      strike(t, p) { p.aRx = -1.9 + 1.0 * t; p.fRx = -0.5; p.aLx = -0.4; p.aLz = 0.4; p.spineX = 0.2 * t; },
    },
  };
}
