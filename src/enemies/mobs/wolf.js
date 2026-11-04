// 타락 늑대 (wolf, pack of 3) v4 model (PLAN v4 §4.6). Owned by mobmodels.
// Quadruped rig (v3 names rig, neck, jaw, legs[i].up/low, tail1, tail2 + paws, tail3, ears, mane): lighter palette — slate grey-violet
// body #5E5A72, pale muzzle + chest blaze #B9B3C8, dark back stripe; fur-tuft clusters on the neck, shoulders and tail; 3-bone tail
// (tail3 spring); ear springs; visible fangs; larger eyes with glowing amber irises; void cracks on the flanks that swell during the
// crouch (glow). Variant 'alpha': bigger mane and a white scar.
import { P, S, C, K, CAP, TUBE, both, eye, quadruped, bone, curve, mixInto } from './rig.js';

const WF = { fur: 0x5e5a72, furDark: 0x58546e, stripe: 0x4c4864, pale: 0xb9b3c8, paleDark: 0xa49eb6, mane: 0x5a5572, sheen: 0x7a7692, claw: 0xe0dae8, nose: 0x1e1a26,
  mouth: 0x3a1a2a, void: 0xb06aff, eye: 0xffb347, scar: 0xece8f4, inner: 0x9a7a96 };

export function wolfDef(opts = {}) {
  const alpha = opts.variant === 'alpha';
  const bones = quadruped({ bodyY: 0.62, neck: [0, 0.18, 0.55], jaw: [0, -0.06, 0.14], upperLen: 0.32, lowerLen: 0.3,
    legs: [[0.17, 0.42], [-0.17, 0.42], [0.16, -0.42], [-0.16, -0.42]], tail: [[0, 0.12, -0.7], [0, 0, -0.42], [0, 0, -0.36]],
    ears: [[-0.12, 0.2, -0.02], [0.12, 0.2, -0.02]], lids: [[-0.1, 0.155, 0.22], [0.1, 0.155, 0.22]] });
  bones.push(bone('mane', 'rig', [0, 0.22, 0.38]), bone('cracks', 'rig', [0, 0, 0]));
  const parts = [], glow = [], add = (...a) => parts.push(...a);
  // body colour: dark back stripe on top, pale chest blaze + belly underneath, slate flanks
  const coat = (l, n, out, v) => {
    out.setHex(WF.fur);
    if (n.y > 0.3) mixInto(out, WF.fur, WF.sheen, (n.y - 0.3) * 1.5);                                   // light catches the top coat
    if (n.y > 0.55 && Math.abs(v.x) < 0.09) mixInto(out, out.getHex(), WF.stripe, (n.y - 0.55) * 4);
    if (n.y < -0.35) mixInto(out, WF.fur, WF.paleDark, (-n.y - 0.35) * 2.5);
    if (v.z > 0.25 && n.z > 0.2 && v.y < 0.66) mixInto(out, WF.fur, WF.pale, (n.z - 0.2) * 2.2);        // chest blaze
    if (alpha && n.x > 0.5 && v.z > -0.5 && v.z < -0.1 && Math.abs(v.y - 0.66 - (v.z + 0.3) * 0.6) < 0.02) out.setHex(WF.scar);   // flank scar
    return out;
  };
  // ---------------------------------------------------------------- body (rig; origin y 0.62)
  add(P('rig', S(0.42, 14, 10), coat, [0, 0.02, 0.18], [0, 0, 0], [0.82, 0.84, 1.12]));
  add(P('rig', S(0.36, 12, 9), coat, [0, -0.01, -0.34], [0.05, 0, 0], [0.78, 0.78, 1.02]));
  add(P('rig', S(0.26, 10, 8), coat, [0, -0.1, -0.08], [0, 0, 0], [0.75, 0.6, 1.3]));             // belly bridge
  // void cracks (glow, on a bone that swells during the crouch)
  for (const sx of [-1, 1]) {
    glow.push(P('cracks', TUBE([[sx * 0.335, 0.12, 0.14], [sx * 0.345, 0.04, 0.08], [sx * 0.335, 0.0, 0.16], [sx * 0.32, -0.08, 0.1]], [0.016, 0.014, 0.012, 0.004], 4), WF.void, [0, 0, 0], [0, 0, 0], [1, 1, 1], { glowK: 1.1 }));
    glow.push(P('cracks', TUBE([[sx * 0.3, 0.08, -0.28], [sx * 0.31, 0.0, -0.22], [sx * 0.3, -0.06, -0.3]], [0.014, 0.012, 0.004], 4), WF.void, [0, 0, 0], [0, 0, 0], [1, 1, 1], { glowK: 1.1 }));
  }
  // fur tufts: shoulders + haunches (merged cone clusters)
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) add(P('rig', K(0.06, 0.2, 4), WF.mane, [sx * (0.24 + i * 0.02), 0.2 - i * 0.07, 0.3 - i * 0.05], [-1.6, 0, sx * (0.6 + i * 0.15)], [1, 1, 0.45], { small: true }));
    for (let i = 0; i < 2; i++) add(P('rig', K(0.05, 0.16, 4), WF.furDark, [sx * 0.24, 0.12 - i * 0.08, -0.52], [-1.9, 0, sx * 0.5], [1, 1, 0.45], { small: true }));
  }
  // neck ruff / mane (spring): ring of fur cones, bigger for the alpha
  const nM = alpha ? 11 : 8, mL = alpha ? 0.34 : 0.24;
  for (let i = 0; i < nM; i++) {
    const a = (i / (nM - 1) - 0.5) * Math.PI * 1.5;
    add(P('mane', K(0.075, mL * (1 - Math.abs(a) * 0.15), 4), i % 2 ? WF.mane : WF.stripe, [Math.sin(a) * 0.2, Math.cos(a) * 0.12, -0.02], [-1.35 + Math.cos(a) * 0.3, 0, -a * 0.6], [1, 1, 0.5], { noProxy: !alpha }));
  }
  add(P('mane', S(0.22, 10, 8), coat, [0, -0.04, 0.04], [0.5, 0, 0], [0.9, 0.9, 1.05], { blend: null }));    // neck mass
  // ---------------------------------------------------------------- head (neck bone): skull, muzzle, nose, brow, eyes, ears, fangs, jaw
  const headCoat = (l, n, out) => {
    out.setHex(WF.fur);
    if (l.z > 0.18 && n.y < 0.5) mixInto(out, WF.fur, WF.pale, (l.z - 0.18) * 6);
    if (n.y > 0.6 && Math.abs(l.x) < 0.06) mixInto(out, WF.fur, WF.stripe, 0.7);
    if (alpha && n.z > 0 && Math.abs(l.x - 0.11 - (l.y - 0.1) * 0.25) < 0.016 && l.y > 0.02 && l.y < 0.26) out.setHex(WF.scar);   // scar over the left eye
    return out;
  };
  add(P('neck', S(0.24, 12, 9), headCoat, [0, 0.05, 0.04], [0, 0, 0], [0.95, 0.85, 1.05]));
  add(P('neck', TUBE([[0, 0.02, 0.16], [0, 0.0, 0.32], [0, -0.01, 0.46]], [0.13, 0.095, 0.06], 9), headCoat, [0, 0, 0], [0, 0, 0], [1, 0.82, 1]));
  add(P('neck', S(0.045, 6, 5), WF.nose, [0, 0.03, 0.5], [0, 0, 0], [1.2, 0.8, 1]));
  add(P('neck', TUBE([[-0.17, 0.16, 0.12], [0, 0.17, 0.22], [0.17, 0.16, 0.12]], [0.025, 0.035, 0.025], 5), WF.furDark));       // brow
  add(...eye('neck', [-0.1, 0.11, 0.215], 0.058, { sclera: 0x2a2234, iris: WF.eye, glowIris: true, yaw: -0.4, pupilK: 0.34, slit: true, irisK: 0.78 }));
  add(...eye('neck', [0.1, 0.11, 0.215], 0.058, { sclera: 0x2a2234, iris: WF.eye, glowIris: true, yaw: 0.4, pupilK: 0.34, slit: true, irisK: 0.78 }));
  for (const [s2, x] of [['R', -1], ['L', 1]]) add(P('lid' + s2, S(0.066, 8, 6, { phS: 0, phL: Math.PI }), WF.furDark, [0, -0.045, 0], [0, x * 0.4, 0], [1, 1, 0.75], { small: true, ao: false }));
  for (const s2 of ['R', 'L']) {
    const sx = s2 === 'R' ? -1 : 1;
    add(P('ear' + s2, K(0.08, 0.26, 5), WF.furDark, [0, 0.11, 0], [-0.15, 0, -sx * 0.25], [1, 1, 0.5]));
    add(P('ear' + s2, K(0.05, 0.18, 4), WF.inner, [0, 0.09, 0.025], [-0.15, 0, -sx * 0.25], [1, 1, 0.3], { small: true }));
  }
  add(...both([P('neck', K(0.018, 0.075, 4), WF.claw, [-0.05, -0.05, 0.42], [Math.PI, 0, 0], [1, 1, 1], { small: true })]));     // upper fangs
  add(P('jaw', TUBE([[0, -0.02, 0.04], [0, -0.03, 0.18], [0, -0.02, 0.3]], [0.085, 0.07, 0.045], 7), WF.pale, [0, 0, 0], [0, 0, 0], [1, 0.55, 1], { blend: { axis: '+z', band: 0.05 } }));
  add(...both([P('jaw', K(0.015, 0.06, 4), WF.claw, [-0.045, 0.01, 0.27], [0, 0, 0], [1, 1, 1], { small: true })]));            // lower fangs
  for (let i = 0; i < 3; i++) add(...both([P('jaw', K(0.009, 0.025, 4), WF.claw, [-0.05, 0.0, 0.12 + i * 0.045], [0, 0, 0], [1, 1, 1], { small: true })]));
  add(P('neck', C(0.07, 0.07, 0.2, 6), WF.mouth, [0, -0.04, 0.3], [Math.PI / 2, 0, 0], [1, 0.4, 1], { small: true, ao: false }));
  // ---------------------------------------------------------------- legs (4): upper, lower, paw with toes + claws
  for (let i = 0; i < 4; i++) {
    const front = i < 2;
    add(P('leg' + i, CAP(front ? 0.095 : 0.11, 0.2, 7, 2), coat, [0, -0.15, front ? 0.0 : -0.02], [front ? 0 : -0.15, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.07 } }));
    add(P('low' + i, CAP(0.065, 0.22, 7, 2), WF.furDark, [0, -0.14, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.05 } }));
    add(P('paw' + i, S(0.075, 8, 5), WF.furDark, [0, -0.01, 0.04], [0, 0, 0], [1, 0.55, 1.35]));
    for (let j = -1; j <= 1; j += 2) add(P('paw' + i, K(0.012, 0.045, 4), WF.claw, [j * 0.03, -0.03, 0.14], [Math.PI / 2, 0, 0], [1, 1, 1], { small: true }));
    add(P('paw' + i, K(0.012, 0.045, 4), WF.claw, [0, -0.03, 0.15], [Math.PI / 2, 0, 0], [1, 1, 1], { small: true }));
  }
  // ---------------------------------------------------------------- tail (3 bones; bushy, pale tip, tufts)
  const tailCol = (l, n, out) => mixInto(out, WF.fur, WF.mane, n.y > 0.3 ? 0.8 : 0.2);
  add(P('tail1', TUBE([[0, 0, 0.1], [0, 0.02, -0.2], [0, 0, -0.44]], [0.09, 0.12, 0.12], 8), tailCol, [0, 0, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-z', band: 0.08 } }));
  add(P('tail2', TUBE([[0, 0, 0.02], [0, 0, -0.2], [0, 0, -0.38]], [0.12, 0.12, 0.1], 8), tailCol, [0, 0, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-z', band: 0.08 } }));
  add(P('tail3', TUBE([[0, 0, 0.02], [0, 0, -0.18], [0, 0, -0.36]], [0.1, 0.07, 0.01], 8), (l, n, out) => mixInto(out, WF.fur, WF.pale, (-l.z - 0.12) * 4), [0, 0, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-z', band: 0.07 } }));
  for (let i = 0; i < 3; i++) add(P('tail2', K(0.05, 0.16, 4), WF.mane, [0, 0.09, -0.08 - i * 0.12], [-1.9, 0, (i - 1) * 0.4], [1, 1, 0.5], { small: true }));
  return {
    type: 'wolf', key: alpha ? 'wolf:alpha' : 'wolf', variant: alpha ? 'alpha' : null, bones, parts, glow, headTop: 1.1, lieY: 0.25, sphere: [0.6, 1.3], kind: 'quad',
    hipY: 0.62, outline: { t: 0.017, color: 0x16121e }, proxyMin: 0.1, lids: { open: 0.3, closed: 1.0 }, jawOpen: 0.5,
    quadLegs: [['leg0', 'low0'], ['leg1', 'low1'], ['leg2', 'low2'], ['leg3', 'low3']],
    springs: [
      { bone: 'earR', axis: 'x', k: 160, d: 8, gain: [0.06, 0], sway: 0.03, swayHz: 0.4, min: -0.6, max: 0.4 },
      { bone: 'earL', axis: 'x', k: 160, d: 8, gain: [0.06, 0], sway: 0.03, swayHz: 0.45, min: -0.6, max: 0.4 },
      { bone: 'tail3', axis: 'z', k: 60, d: 5, gain: [0, -0.1], sway: 0.12, swayHz: 0.5, min: -0.9, max: 0.9 },
      { bone: 'mane', axis: 'x', k: 120, d: 7, gain: [0.06, 0], vy: -0.03, sway: 0.02, swayHz: 0.3, min: -0.4, max: 0.4 },
    ],
    anchors: { weapon: ['jaw', [0, 0, 0.3]], mouth: ['jaw', [0, 0, 0.3]], head: ['neck', [0, 0.28, 0.05]], hand: ['paw0', [0, 0, 0.1]], core: ['rig', [0, 0.05, 0.1]] },
    aliases: { tail1: 'tail1', tail2: 'tail2', tail3: 'tail3', mane: 'mane' },
    features: { face: true, hands: true, handsEquivalent: 'paws with toes + claws', aoVertexColors: true, lod: true, furTufts: true, fangs: true, glowEyes: true, voidCracks: true, alpha },
    update(m) {
      // paws stay level (counter-rotate against the leg chain)
      const A = m.bones.all;
      for (let i = 0; i < 4; i++) A['paw' + i].rotation.x = -(A['leg' + i].rotation.x + A['low' + i].rotation.x) * 0.8;
    },
    applyPose(m, name, t) {
      const A = m.bones.all, r = A.rig;
      const k = name === 'windup' ? Math.min(1, t) : name === 'hold' ? 1 : 0;
      let pitch = 0, y = 0.62, jaw = 0.1, head = 0, gait = 0, amt = 0;
      if (name === 'idle') { y = 0.62 + Math.sin(t * 2) * 0.008; head = Math.sin(t * 0.8) * 0.05; jaw = 0.12 + Math.max(0, Math.sin(t * 2)) * 0.05; }
      else if (name === 'walk') { gait = t * 9; amt = 1; y = 0.62 - Math.abs(Math.cos(gait)) * 0.03; }
      else if (k > 0) { y = 0.62 - 0.16 * k; pitch = 0.12 * k; head = -0.35 * k; jaw = 0.1 + 0.55 * k; }     // crouch, snarl
      else if (name === 'strike') { y = 0.68; pitch = -0.15; head = 0.1; jaw = 0.75; amt = 0.6; gait = 1.2; }
      else if (name === 'recover') { y = 0.58; pitch = 0.18; head = 0.35; jaw = 0.25; }                      // slides, head low
      else if (name === 'stagger') { y = 0.58; pitch = -0.2; head = -0.3; jaw = 0.4; }
      else if (name === 'die') { y = 0.62 - 0.35 * t; r.rotation.z = 1.4 * t; jaw = 0.5; }
      r.position.set(0, y, 0); r.rotation.x = pitch; if (name !== 'die') r.rotation.z = 0;
      r.scale.set(1 + 0.05 * k, 1 - 0.1 * k, 1 + 0.03 * k);
      A.neck.rotation.set(head - pitch * 0.8, 0, 0);
      A.jaw.rotation.x = jaw * m._jawOpen;
      for (let i = 0; i < 4; i++) {
        const ph = gait + (i === 0 || i === 3 ? 0 : Math.PI), sw = Math.sin(ph) * 0.55 * amt, lift = Math.max(0, Math.cos(ph)) * 0.5 * amt;
        A['leg' + i].rotation.x = sw - (k * 0.9 + (name === 'strike' ? 0.6 : 0)) * (i < 2 ? -0.45 : 0.85);
        A['low' + i].rotation.x = (i < 2 ? -lift : lift) * 0.8 + k * (i < 2 ? -0.6 : 1.1);
      }
      A.tail1.rotation.set(-0.45 + k * 0.6, Math.sin(t * 3) * 0.2 * (name === 'idle' ? 1 : 0), 0); A.tail2.rotation.set(-0.2, 0, 0);
      A.cracks.scale.setScalar(1 + 0.06 * k);
      m._lidBase = 0.3 + (k > 0 ? -0.12 : 0);
    },
  };
}
