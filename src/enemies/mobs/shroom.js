// 포자 버섯병 (shroom) v4 model (PLAN v4 §4.5). Owned by mobmodels.
// humanoid2 (v3 rest layout, hip 0.42): cap with pleated gill fans underneath, spore pores (glow) that swell before the lob,
// cap on a spring bone (bounce), root-toe feet (3 per foot), moss/lichen patches in vertex colour, stub arms with 3 fingers,
// sleepy eyes with lids, spore sac on the back (v3 `sac`).
import * as THREE from 'three';
import { P, S, C, K, CAP, T, TUBE, FN, both, eye, humanoid2, bone, curve, mixInto } from './rig.js';

const SR = { cap: 0xcc5442, capDark: 0x8e3028, spot: 0xf4ecd0, stem: 0xeadfc4, stemDark: 0xc4b08c, gill: 0xdcbca0, gillDark: 0xa88468,
  moss: 0x6a9a3a, lichen: 0xa8c060, sac: 0xb4e05c, sacDark: 0x7aa83a, pore: 0xd8ff6a, mouth: 0x3a1a10, root: 0x9a7a52 };
const HIP = 0.42;
const hash = (x, y, z) => { const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return h - Math.floor(h); };
const noise3 = (x, y, z) => { // cheap value-ish noise for moss patches
  return (Math.sin(x * 7.1 + Math.sin(z * 3.3)) + Math.sin(y * 6.3 + Math.cos(x * 4.1)) + Math.sin(z * 5.7 + y * 2.9)) / 3;
};

/** Pleated gill fan: an annulus under the cap whose vertices alternate up/down (radial ridges). */
function gillGeo(d) {
  const n = Math.max(16, Math.round(40 * d)), pos = [], idx = [];
  const r0 = 0.17, r1 = 0.56;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, up = i % 2 ? 0.035 : -0.01;
    pos.push(Math.cos(a) * r0, 0.03, Math.sin(a) * r0, Math.cos(a) * r1, up, Math.sin(a) * r1);
  }
  for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function shroomDef() {
  const bones = humanoid2({ hipY: HIP, neckY: 0.56, shoulderX: 0.28, shoulderY: 0.36, upperLen: 0.24, foreLen: 0.2, hipX: 0.16, thighLen: 0.16,
    jaw: [0, -0.16, 0.2], lids: [[-0.1, 0.0, 0.25], [0.1, 0.0, 0.25]], hand: { thumb: [0.04, -0.02, 0.03], fingers: [0, -0.05, 0.02] } });
  bones.push(bone('cap', 'neck', [0, 0.1, 0]), bone('pores', 'cap', [0, 0, 0]), bone('sac', 'spine', [0, 0.26, -0.3]), bone('capTilt', 'cap', [0, 0, 0]));
  const parts = [], glow = [], add = (...a) => parts.push(...a);
  const mossy = (base, k = 1) => (l, n, out, v) => {
    out.setHex(base);
    const m = noise3(v.x * 1.3, v.y * 1.3, v.z * 1.3);
    if (m > 0.45 * k) mixInto(out, base, m > 0.62 ? SR.moss : SR.lichen, Math.min(1, (m - 0.45) * 5));
    return out;
  };
  // ---------------------------------------------------------------- stem body (spine) + moss collar
  add(P('spine', C(0.22, 0.3, 0.52, 12), mossy(SR.stem), [0, 0.2, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '+y', band: 0.06 } }));
  add(P('spine', S(0.27, 12, 8), (l, n, out) => mixInto(out, SR.stem, SR.stemDark, -n.y), [0, 0.04, 0.02], [0, 0, 0], [1.15, 0.72, 1.1]));
  add(P('spine', T(0.29, 0.05, 16, 5), mossy(SR.moss, 0.2), [0, -0.02, 0], [Math.PI / 2, 0, 0], [1.05, 1, 1]));
  for (const [x, y, z, r] of [[0.21, 0.3, 0.12, 0.07], [-0.18, 0.12, 0.2, 0.06], [0.05, 0.36, -0.2, 0.06], [-0.2, 0.3, -0.1, 0.05]]) add(P('spine', S(r, 6, 4), SR.moss, [x, y, z], [0, 0, 0], [1, 0.6, 1], { small: true }));
  // spore sac (v3 `sac`): veined bulb
  add(P('sac', S(0.17, 10, 8), (l, n, out) => mixInto(out, SR.sac, SR.sacDark, Math.abs(Math.sin(Math.atan2(l.z, l.x) * 5)) > 0.85 ? 1 : 0), [0, 0, 0]));
  add(P('sac', S(0.06, 6, 4), 0xe0ff9a, [0.06, 0.1, 0.08], [0, 0, 0], [1, 1, 1], { small: true }));
  add(P('sac', T(0.1, 0.02, 10, 3), SR.root, [0, -0.1, 0.06], [1.2, 0, 0], [1, 1, 1], { small: true }));
  // ---------------------------------------------------------------- head: stem top with the face
  add(P('neck', C(0.2, 0.23, 0.36, 12), mossy(SR.stem, 1.2), [0, -0.06, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '+y', band: 0.06 } }));
  add(...eye('neck', [-0.1, -0.05, 0.2], 0.06, { sclera: 0xf4eedc, iris: 0x8aa83a, pupilK: 0.42, yaw: -0.4 }));
  add(...eye('neck', [0.1, -0.05, 0.2], 0.06, { sclera: 0xf4eedc, iris: 0x8aa83a, pupilK: 0.42, yaw: 0.4 }));
  for (const [s2, x] of [['R', -1], ['L', 1]]) add(P('lid' + s2, S(0.068, 8, 6, { phS: 0, phL: Math.PI }), SR.stemDark, [0, -0.05, 0], [0, x * 0.4, 0], [1, 1, 0.75], { small: true, ao: false }));
  add(...both([P('neck', S(0.03, 5, 4), 0xe8a090, [-0.15, -0.13, 0.18], [0, 0, 0], [1, 0.6, 0.5], { small: true })]));     // cheek blush
  add(P('jaw', T(0.045, 0.012, 8, 3, Math.PI), SR.mouth, [0, 0.0, 0.03], [0, 0, Math.PI], [1.2, 0.8, 1], { small: true }));
  // ---------------------------------------------------------------- cap (spring bone): dome, rim, spots, pleated gills, pores (glow)
  const capCol = (l, n, out, v) => {
    mixInto(out, SR.cap, SR.capDark, (0.2 - l.y) * 3);
    const m = noise3(v.x * 2.1, v.y * 2.1, v.z * 2.1);
    if (m > 0.55) mixInto(out, out.getHex(), SR.lichen, (m - 0.55) * 3);
    return out;
  };
  add(P('capTilt', S(0.62, 16, 8, { thL: Math.PI * 0.55 }), capCol, [0, 0.12, 0], [0, 0, 0], [1, 0.78, 1], { proxy: true, aoCast: false }));
  add(P('capTilt', T(0.585, 0.045, 24, 4), SR.capDark, [0, 0.11, 0], [Math.PI / 2, 0, 0]));
  add(P('capTilt', FN(gillGeo, [0.56, 0.03, 0.56]), (l, n, out) => mixInto(out, SR.gill, SR.gillDark, (Math.hypot(l.x, l.z) - 0.17) * 1.5), [0, 0.06, 0], [0, 0, 0], [1, 1, 1], { ao: false }));
  for (let i = 0; i < 10; i++) {
    const a = i * 2.39, el = 0.32 + (i % 3) * 0.27;
    add(P('capTilt', S(0.065 + (i % 2) * 0.03, 7, 4), SR.spot, [Math.sin(a) * Math.sin(el) * 0.6, 0.13 + Math.cos(el) * 0.47, Math.cos(a) * Math.sin(el) * 0.6], [0, 0, 0], [1, 0.38, 1], { small: true, ao: false }));
  }
  const pores = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.4, el = 0.6 + (i % 2) * 0.3;
    const px = Math.sin(a) * Math.sin(el), py = Math.cos(el), pz = Math.cos(a) * Math.sin(el);
    // glowing pore core sits just under the cap surface (pops out when the pores bone swells) + a dark pore rim on the surface
    pores.push(P('pores', S(0.04, 5, 4), SR.pore, [px * 0.555, 0.12 + py * 0.435, pz * 0.555], [0, 0, 0], [1, 1, 1], { glowK: 1.15 }));
    add(P('capTilt', S(0.045, 6, 4), SR.capDark, [px * 0.6, 0.12 + py * 0.468, pz * 0.6], [0, 0, 0], [1, 0.45, 1], { small: true, ao: false }));
  }
  glow.push(...pores);
  // ---------------------------------------------------------------- stub arms, 3 fingers
  for (const s2 of ['R', 'L']) {
    add(P('arm' + s2, CAP(0.07, 0.14, 6, 2), SR.stem, [0, -0.11, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.05 } }));
    add(P('fore' + s2, CAP(0.065, 0.11, 6, 2), SR.stemDark, [0, -0.09, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.04 } }));
    add(P('hand' + s2, S(0.065, 7, 5), SR.stemDark, [0, -0.01, 0.0], [0, 0, 0], [1, 0.9, 1]));
    for (let i = 0; i < 3; i++) add(P('fingers' + s2, CAP(0.02, 0.04, 4, 2), SR.stemDark, [(i - 1) * 0.035, -0.03, 0.01], [0.2, 0, (i - 1) * 0.25], [1, 1, 1], { small: true }));
    add(P('thumb' + s2, CAP(0.02, 0.03, 4, 2), SR.stemDark, [0, -0.01, 0.02], [0.6, 0, s2 === 'R' ? 0.8 : -0.8], [1, 1, 1], { small: true }));
  }
  // ---------------------------------------------------------------- short legs + root-toe feet (3 per foot)
  for (const s2 of ['R', 'L']) {
    add(P('leg' + s2, CAP(0.1, 0.06, 6, 2), SR.stemDark, [0, -0.08, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.05 } }));
    add(P('knee' + s2, CAP(0.09, 0.04, 6, 2), SR.stemDark, [0, -0.06, 0], [0, 0, 0], [1, 1, 1], { blend: { axis: '-y', band: 0.04 } }));
    add(P('knee' + s2, S(0.11, 8, 5), SR.root, [0, -0.13, 0.03], [0, 0, 0], [1.1, 0.5, 1.3]));
    for (let i = -1; i <= 1; i++) {
      const a = i * 0.55;
      add(P('knee' + s2, TUBE(curve([0, -0.14, 0.05], [Math.sin(a) * 0.12, -0.17, 0.05 + Math.cos(a) * 0.12], [Math.sin(a) * 0.2, -0.2, 0.04 + Math.cos(a) * 0.2], 4), [0.04, 0.03, 0.018, 0.006], 5),
        SR.root, [0, 0, 0], [0, 0, 0], [1, 1, 1], { small: true, dark: 0.9 }));
    }
  }
  return {
    type: 'shroom', bones, parts, glow, hipY: HIP, headTop: 1.55, lieY: 0.22, sphere: [0.8, 1.3], kind: 'humanoid',
    outline: { t: 0.018, color: 0x2a1410 }, proxyMin: 0.1, lids: { open: 0.55, closed: 1.0 }, jawOpen: 0.4,
    springs: [
      { bone: 'cap', axis: 'x', k: 90, d: 5, gain: [0.08, 0], vy: -0.04, sway: 0.025, swayHz: 0.6, min: -0.5, max: 0.5 },
      { bone: 'capTilt', axis: 'z', k: 90, d: 5, gain: [0, 0.08], sway: 0.025, swayHz: 0.5, min: -0.5, max: 0.5 },
    ],
    anchors: { weapon: ['sac', [0, 0, 0]], head: ['cap', [0, 0.55, 0]], hand: ['handR', [0, -0.03, 0]], mouth: ['jaw', [0, 0, 0.05]], core: ['pores', [0, 0.4, 0]] },
    aliases: { sac: 'sac', cap: 'cap', pores: 'pores' },
    features: { face: true, hands: true, aoVertexColors: true, lod: true, gills: true, pores: 7, rootToes: 3, moss: true, sleepyLids: true },
    afterPose(m, name, t) {
      // pores swell before the lob; the cap droops in recovery
      const k = name === 'windup' ? Math.min(1, t) : name === 'hold' ? 1 : 0;
      m.bones.all.pores.scale.setScalar(1 + 0.085 * k);
      m.bones.all.capTilt.rotation.x = name === 'recover' ? 0.35 : 0;
    },
    poses: {
      windup(t, p) { p.aRx = -2.4 * t; p.fRx = -1.0 * t; p.aLx = -0.5 * t; p.spineX = -0.25 * t; p.headX = -0.2 * t; p.hipY = HIP - 0.05 * t; },
      hold(t, p) { p.aRx = -2.6; p.fRx = -1.0; p.aLx = -0.5; p.spineX = -0.3; p.headX = -0.2; p.hipY = HIP - 0.05; },
      strike(t, p) { p.aRx = -2.6 + 2.0 * t; p.fRx = -1.0 + 0.8 * t; p.spineX = -0.3 + 0.6 * t; p.headX = 0.2 * t; },
      recover(t, p) { p.headX = 0.45; p.spineX = 0.3; p.pitch = 0.3; p.aRx = 0.1; p.aLx = 0.1; },
    },
  };
}
void hash;
