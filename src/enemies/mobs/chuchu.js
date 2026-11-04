// 말랑이 (chuchu) + 8 element variants, v4 model (PLAN v4 §4.3). Owned by mobmodels.
// Translucent shell (20×14) with the inner core visible (variants: an element glyph-shaped crystal), a lighter squash-ring band,
// mouth shapes per state (smile idle, `O` on the lunge, `x x` eyes on death), seeded blink, wobbling crown (2 springs).
// Variant silhouettes: 불꽃 3 flame tongues · 얼음 3 hex prisms · 전기 2 antenna sparks · 바람 leaf-swirl tuft · 물방울 droplet top-knot ·
// 새싹 sprout with 2 leaves · 햇살 small halo ring · 그늘 2 shadow horns. Draws: shell (transparent toon) + inner (glow) + outline proxy.
import * as THREE from 'three';
import { P, S, C, K, T, TUBE, OCT, FN, bone, curve, mixInto } from './rig.js';
import { CHU_VARIANTS } from '../models.js';

const PAL = {
  normal: { body: 0x56c8c0, belly: 0x9ae8dc, core: 0x2b8f9a },
  fire: { body: 0xff8a48, belly: 0xffc08a, core: 0xffd04a, deco: 0xff6a2a, deco2: 0xffc23a },
  ice: { body: 0xa8e6ff, belly: 0xe0f6ff, core: 0xd8f6ff, deco: 0xbfeeff, deco2: 0x7ac8f0 },
  lightning: { body: 0xf0d84a, belly: 0xfff0a0, core: 0xb57bff, deco: 0xfff070, deco2: 0xc89aff },
  wind: { body: 0x9adcb8, belly: 0xd6f6e2, core: 0xe6fff0, deco: 0x6ac08a, deco2: 0xc8f0d0 },
  water: { body: 0x56a8f0, belly: 0xa8d8ff, core: 0xd8f0ff, deco: 0x6ab8ff, deco2: 0xbfe4ff },
  nature: { body: 0x86d850, belly: 0xc8f096, core: 0xf0ff9a, deco: 0x4aa83a, deco2: 0x8a5a30 },
  light: { body: 0xffe6a0, belly: 0xfff4d0, core: 0xfff0c0, deco: 0xffe070, deco2: 0xfff2b0 },
  shadow: { body: 0x7a4aaa, belly: 0xa87ad0, core: 0xd9a0ff, deco: 0x3a2050, deco2: 0x9a6ad0 },
};
export const CHU_TYPES = Object.keys(PAL);

/** v3 shell profile (flattened bottom, slight pear bulge), rebuilt at any detail; comp = circumscribed for the proxy. */
function shellGeo(d, comp) {
  const w = Math.max(8, Math.round(20 * d)), h = Math.max(6, Math.round(14 * d));
  const g = new THREE.SphereGeometry(0.62 * (comp ? 1 / Math.cos(Math.PI / w) : 1), w, h);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i);
    if (y < -0.25) y = -0.25 - (y + 0.25) * 0.35;
    const t = (y + 0.62) / 1.24, bulge = 1 + 0.12 * Math.sin(t * Math.PI) - 0.1 * t * t;
    p.setXYZ(i, p.getX(i) * bulge, y + 0.36, p.getZ(i) * bulge);
  }
  g.computeVertexNormals();
  return g;
}

export function chuchuDef(opts = {}) {
  const variant = PAL[opts.variant] ? opts.variant : 'normal';
  const C3 = PAL[variant];
  const el = variant === 'normal' ? null : variant;
  const bones = [
    bone('rig', null, [0, 0, 0]), bone('core', 'rig', [0, 0.38, -0.05]), bone('eyes', 'rig', [0, 0.5, 0]), bone('blink', 'eyes', [0, 0, 0]),
    bone('mouthSmile', 'rig', [0, 0.3, 0.665]), bone('mouthO', 'rig', [0, 0.29, 0.665]), bone('eyesX', 'rig', [0, 0.5, 0.62]),
    bone('crown', 'rig', [0, 0.86, -0.02]), bone('podR', 'rig', [-0.52, 0.18, 0.12]), bone('podL', 'rig', [0.52, 0.18, 0.12]),
  ];
  const parts = [], glow = [], add = (...a) => parts.push(...a), gl = (...a) => glow.push(...a);
  // shell: belly gradient + a lighter squash-ring band at the widest point
  const shellCol = (l, n, out) => {
    mixInto(out, C3.body, C3.belly, (n.z * 0.8 - n.y * 0.25 - 0.2) * 1.2);
    if (l.y > 0.2 && l.y < 0.27) mixInto(out, C3.belly, 0xf2fbff, 0.35);
    if (l.y < 0.05) out.multiplyScalar(0.82);
  };
  add(P('rig', FN(shellGeo, [0.68, 0.45, 0.68]), shellCol, [0, 0, 0], [0, 0, 0], [1, 1, 1], { lod: true, proxy: true, aoCast: false }));
  // pseudopods (the slime's hands): two shell nubs that stretch on the lunge
  for (const s2 of ['R', 'L']) add(P('pod' + s2, S(0.12, 8, 6), shellCol, [0, 0, 0], [0, 0, s2 === 'R' ? 0.5 : -0.5], [1.15, 0.7, 0.9], { aoCast: false }));
  // ---------------- inner (glow mesh: unlit): core crystal, eyes, mouths, shine, variant crown
  const k = el ? 1.12 : 0.85;
  const coreSpec = {
    normal: () => [P('core', S(0.24, 10, 8), C3.core, [0, 0, 0], [0, 0, 0], [1, 0.9, 1], { glowK: k })],
    fire: () => [P('core', TUBE(curve([0, -0.2, 0], [0.08, 0.02, 0], [0, 0.26, 0], 5), [0.15, 0.16, 0.12, 0.07, 0.005], 7), C3.core, [0, 0, 0], [0, 0, 0], [1, 1, 0.8], { glowK: k })],
    ice: () => [P('core', C(0.15, 0.15, 0.34, 6), C3.core, [0, 0, 0], [0.2, 0.3, 0.1], [1, 1, 1], { glowK: k }), P('core', K(0.15, 0.1, 6), C3.core, [0, 0.22, 0], [0.2, 0.3, 0.1], [1, 1, 1], { glowK: k })],
    lightning: () => [P('core', TUBE([[-0.06, 0.24, 0], [0.08, 0.06, 0], [-0.06, 0.0, 0], [0.06, -0.22, 0]], [0.07, 0.08, 0.08, 0.02], 5), C3.core, [0, 0, 0], [0, 0, 0], [1, 1, 0.7], { glowK: k })],
    wind: () => [P('core', T(0.14, 0.05, 16, 5, Math.PI * 1.6), C3.core, [0, 0, 0], [0, 0.3, 0], [1, 1, 1], { glowK: k }), P('core', S(0.07, 6, 5), C3.core, [0, 0, 0], [0, 0, 0], [1, 1, 1], { glowK: k })],
    water: () => [P('core', S(0.16, 10, 8), C3.core, [0, -0.04, 0], [0, 0, 0], [1, 1, 1], { glowK: k }), P('core', K(0.13, 0.22, 10), C3.core, [0, 0.15, 0], [0, 0, 0], [1, 1, 1], { glowK: k })],
    nature: () => [P('core', S(0.2, 10, 6), C3.core, [0, 0, 0], [0, 0, 0.6], [0.55, 1.1, 0.35], { glowK: k }), P('core', C(0.012, 0.012, 0.36, 4), C3.deco ?? C3.core, [0, 0, 0.02], [0, 0, 0.6], [1, 1, 1], { glowK: 0.9 })],
    light: () => [P('core', OCT(0.18), C3.core, [0, 0, 0], [0, 0, 0], [1, 1.25, 1], { glowK: k }), P('core', OCT(0.13), C3.core, [0, 0, 0], [0, Math.PI / 4, 0], [1.3, 0.7, 1.3], { glowK: k })],
    shadow: () => [P('core', T(0.15, 0.06, 14, 5, Math.PI * 1.25), C3.core, [0, 0, 0], [0, 0, 2.2], [1, 1, 1], { glowK: k })],
  };
  gl(...coreSpec[variant]());
  // eyes (dark ovals + 2 highlights) on the blink bone
  for (const sx of [-1, 1]) {
    gl(P('blink', S(0.11, 10, 8), 0x14141c, [sx * 0.21, 0.0, 0.6], [0, sx * 0.3, 0], [0.9, 1.25, 0.5], { eyeball: true }));
    gl(P('blink', S(0.036, 5, 4), 0xf4f8ff, [sx * 0.21 + 0.035, 0.07, 0.655], [0, 0, 0], [1, 1, 0.5]));
    gl(P('blink', S(0.018, 4, 3), 0xf4f8ff, [sx * 0.21 - 0.03, -0.04, 0.66], [0, 0, 0], [1, 1, 0.5]));
    // x x eyes (death), hidden by default (bone scale 0)
    gl(P('eyesX', C(0.016, 0.016, 0.16, 4), 0x14141c, [sx * 0.21, 0, 0], [0, 0, 0.785], [1, 1, 1]));
    gl(P('eyesX', C(0.016, 0.016, 0.16, 4), 0x14141c, [sx * 0.21, 0, 0], [0, 0, -0.785], [1, 1, 1]));
  }
  gl(P('mouthSmile', T(0.09, 0.016, 12, 3, Math.PI * 0.8), 0x14141c, [0, 0.03, 0.0], [0, 0, Math.PI * 1.1], [1.2, 1, 1]));
  gl(P('mouthO', S(0.075, 8, 6), 0x2a0e18, [0, 0, 0], [0, 0, 0], [1, 1.25, 0.35]));
  gl(P('mouthO', T(0.075, 0.014, 10, 3), 0x14141c, [0, 0, 0.012], [0, 0, 0], [1, 1.25, 1]));
  gl(P('rig', S(0.09, 6, 5), 0xf2f8ff, [-0.28, 0.74, 0.32], [0, 0, 0.6], [1.4, 0.7, 0.5], { glowK: 0.95 }));     // shine
  // crown (variant silhouette, spring bone)
  const D = C3.deco, D2 = C3.deco2;
  const crown = {
    normal: () => [P('crown', S(0.07, 6, 5), C3.belly, [0, 0.02, 0], [0, 0, 0], [1, 1.3, 1])],
    fire: () => [-1, 0, 1].map((i) => P('crown', TUBE(curve([i * 0.12, -0.04, 0], [i * 0.2, 0.12, 0.02], [i * 0.1, 0.28 - Math.abs(i) * 0.08, -0.02], 4), [0.08, 0.07, 0.035, 0.004], 6), i === 0 ? D2 : D, [0, 0, 0], [0, 0, 0], [1, 1, 0.6], { glowK: 1.15 })),
    ice: () => [-1, 0, 1].map((i) => P('crown', C(0.06, 0.06, 0.24 - Math.abs(i) * 0.06, 6), i === 0 ? D : D2, [i * 0.13, 0.08 - Math.abs(i) * 0.02, 0], [0, 0.5, i * 0.35], [1, 1, 1], { glowK: 1.05 })),
    lightning: () => [-1, 1].flatMap((i) => [
      P('crown', TUBE([[i * 0.08, -0.02, 0], [i * 0.14, 0.12, 0], [i * 0.1, 0.18, 0], [i * 0.18, 0.32, 0]], [0.025, 0.02, 0.018, 0.008], 4), D2, [0, 0, 0], [0, 0, 0], [1, 1, 1], { glowK: 1.1 }),
      P('crown', OCT(0.05), D, [i * 0.18, 0.34, 0], [0, 0, 0], [1, 1.3, 1], { glowK: 1.18 })]),
    wind: () => [0, 1, 2].map((i) => P('crown', TUBE(curve([0, 0, 0], [Math.cos(i * 2.1) * 0.18, 0.1, Math.sin(i * 2.1) * 0.18], [Math.cos(i * 2.1 + 1) * 0.12, 0.24, Math.sin(i * 2.1 + 1) * 0.12], 5), [0.012, 0.05, 0.06, 0.035, 0.004], 4), i ? D : D2, [0, 0, 0], [0, 0, 0], [1, 0.6, 1], { glowK: 1.0 })),
    water: () => [P('crown', S(0.08, 8, 6), D, [0, 0.06, 0], [0, 0, 0], [1, 1, 1], { glowK: 1.05 }), P('crown', K(0.072, 0.16, 8), D, [0, 0.17, 0], [0, 0, 0], [1, 1, 1], { glowK: 1.05 })],
    nature: () => [P('crown', C(0.018, 0.022, 0.16, 5), D2, [0, 0.06, 0]),
      P('crown', S(0.1, 8, 5), D, [-0.09, 0.15, 0], [0, 0, 0.7], [1, 0.28, 0.55], { glowK: 1.0 }), P('crown', S(0.1, 8, 5), D, [0.09, 0.17, 0], [0, 0, -0.6], [1, 0.28, 0.55], { glowK: 1.0 })],
    light: () => [P('crown', T(0.16, 0.022, 18, 4), D, [0, 0.18, 0], [Math.PI / 2 - 0.25, 0, 0], [1, 1, 1], { glowK: 1.15 }), P('crown', C(0.01, 0.01, 0.16, 4), D2, [0, 0.08, 0])],
    shadow: () => [-1, 1].map((i) => P('crown', TUBE(curve([i * 0.14, -0.04, 0], [i * 0.24, 0.1, -0.02], [i * 0.16, 0.26, 0.06], 5), [0.06, 0.05, 0.035, 0.02, 0.004], 6), D, [0, 0, 0], [0, 0, 0], [1, 1, 1], { glowK: 0.9 })),
  };
  gl(...crown[variant]());
  return {
    type: 'chuchu', key: 'chuchu:' + variant, variant: { ...(CHU_VARIANTS[variant] || CHU_VARIANTS.normal), element: el, body: C3.body, core: C3.core },
    bones, parts, glow, shell: true, hipY: 0, headTop: 1.2, lieY: 0, sphere: [0.5, 1.0], kind: 'blob',
    outline: { t: 0.024, color: 0x14262a }, lodDetail: 0.55, proxyDetail: 0.6,
    springs: [
      { bone: 'crown', axis: 'x', k: 110, d: 6, gain: [0.1, 0], vy: -0.05, sway: 0.06, swayHz: 0.9, min: -0.7, max: 0.7 },
      { bone: 'crown', axis: 'z', k: 110, d: 6, gain: [0, 0.1], sway: 0.05, swayHz: 0.7, min: -0.7, max: 0.7 },
    ],
    anchors: { core: ['core', [0, 0, 0]], head: ['crown', [0, 0.1, 0]], mouth: ['mouthO', [0, 0, 0.02]], hand: ['core', [0, 0, 0.3]], weapon: ['mouthO', [0, 0, 0.02]] },
    aliases: { core: 'core', eyes: 'eyes' },
    features: { face: true, hands: true, handsEquivalent: 'pseudopods', aoVertexColors: true, lod: true, innerCore: true, mouthStates: 3, crown: variant },
    onInstance(m, B) { B.mouthO.scale.setScalar(0.001); B.eyesX.scale.setScalar(0.001); m._blinkNext = 3 + Math.random() * 3; m._blinkT = 0; },
    update(m, dt) {
      // seeded-ish blink on the private blink bone (behaviour code may scale `eyes` too; both multiply)
      m._blinkT += dt;
      let y = 1;
      if (m._blinkT > m._blinkNext) { const u = (m._blinkT - m._blinkNext) / 0.14; if (u >= 1) { m._blinkT = 0; m._blinkNext = 3 + ((m._blinkNext * 9301 + 49297) % 233280) / 233280 * 3; } else y = 1 - Math.sin(u * Math.PI) * 0.85; }
      m.bones.all.blink.scale.y = y;
    },
    /** Blob poses: squash/stretch on the rig, mouth/eye state bones. */
    applyPose(m, name, t) {
      const A = m.bones.all, r = A.rig;
      const k = name === 'windup' ? Math.min(1, t) : name === 'hold' ? 1 : 0;
      let sx = 1, sy = 1, y = 0;
      if (name === 'idle') { const b = Math.sin(t * 3); sy = 1 + b * 0.03; sx = 1 - b * 0.015; }
      else if (name === 'walk') { const h = Math.abs(Math.sin(t * 6)); y = h * 0.25; sy = 1 + (h - 0.5) * 0.16; sx = 1 - (h - 0.5) * 0.08; }
      else if (k > 0) { sy = 1 - 0.25 * k; sx = 1 + 0.12 * k; if (name === 'hold') sx += Math.sin(t * 60) * 0.012; }      // quiver, squash ×1.15+
      else if (name === 'strike') { sy = 1.2; sx = 0.9; y = 0.2 * Math.sin(Math.min(1, t) * Math.PI); }
      else if (name === 'recover') { sy = 0.7; sx = 1.22; }                                                                // lands squashed
      else if (name === 'stagger') { sy = 0.85 + Math.sin(t * 20) * 0.05; sx = 1.08; }
      else if (name === 'die') { sy = Math.max(0.2, 1 - t * 0.7); sx = 1 + t * 0.35; }
      r.scale.set(sx, sy, sx); r.position.set(0, y, 0); r.rotation.set(0, 0, 0);
      const o = name === 'windup' || name === 'hold' || name === 'strike';
      const dead = name === 'die';
      A.mouthO.scale.setScalar(o ? 1 : 0.001); A.mouthSmile.scale.setScalar(o || dead ? 0.001 : 1);
      A.eyesX.scale.setScalar(dead ? 1 : 0.001); A.eyes.scale.setScalar(dead ? 0.001 : 1);
      A.core.position.y = 0.38 + (name === 'idle' ? Math.sin(t * 4) * 0.04 : 0);
      const pod = name === 'strike' ? 1.35 : k > 0 ? 0.8 : 1; A.podR.scale.set(pod, 1, 1); A.podL.scale.set(pod, 1, 1);
    },
  };
}
