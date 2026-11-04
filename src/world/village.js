// 「바람결 마을」: cozy BotW-style village in the southern nook + 원소의 제단, training ground, tutorial rock spire.
// Everything static is merged into a handful of meshes: one vertex-coloured toon mesh (+ one outline), one emissive
// mesh (windows, lantern glass, rune bands), windmill sails (rotating), altar crystals (instanced), chimney smoke and
// altar glow (GPU points), pond water. ≈10 draw calls for the whole village.
import * as THREE from 'three';
import { toonMat, ELEMENT_COLORS } from '../core/utils.js';
import { ALL_ELEMENTS, ELEMENT_DEFS, elColor } from '../core/elements.js';
import { mulberry32, sstep } from './noise.js';
import { part, merge, mat4, staticMesh, outlineMat, occludable } from './prefab.js';
import { VILLAGE, yawTo } from './villageLayout.js';

const C = (h) => new THREE.Color(h);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const CYL12 = new THREE.CylinderGeometry(1, 1, 1, 12);
const CYL20 = new THREE.CylinderGeometry(1, 1, 1, 20, 1);
const ICO0 = new THREE.IcosahedronGeometry(1, 0);
const ICO1 = new THREE.IcosahedronGeometry(1, 1);
const PRISM = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 3); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); g.translate(0, 0.5, 0); return g; })();
const CONE8 = new THREE.ConeGeometry(1, 1, 8);

function woodColor(base = 0x8a6239, dark = 0x5c3f24) {
  const a = C(base), b = C(dark);
  return (x, y, z, c) => { c.copy(a).lerp(b, (Math.sin(y * 7 + x * 3 + z * 5) * 0.5 + 0.5) * 0.45); };
}
function stoneColor(base = 0xbab3a2, dark = 0x8e877a, moss = true) {
  const a = C(base), b = C(dark), m = C(0x79a14c);
  return (x, y, z, c) => {
    c.copy(a).lerp(b, (Math.sin(x * 2.7 + y * 3.3) * Math.sin(z * 2.9 - y * 1.7) * 0.5 + 0.5) * 0.65);
    if (moss) { const k = Math.sin(x * 2.1 + z * 1.3 + y) * 0.5 + 0.5; if (k > 0.75 && y < 7.6) c.lerp(m, (k - 0.75) * 1.6); }
  };
}
function plasterColor(base = 0xf3e8cf) {
  const a = C(base), b = C(0xe2d3b0);
  return (x, y, z, c) => { c.copy(a).lerp(b, (Math.sin(x * 1.3 + y * 2.1) * Math.sin(z * 1.7 + y) * 0.5 + 0.5) * 0.5); };
}
function stripeColor(a, b, freq = 5) {
  const ca = C(a), cb = C(b);
  return (x, y, z, c) => { c.copy(Math.sin(x * freq) > 0 ? ca : cb); };
}
const ROOFS = [
  { a: 0xd8b060, b: 0xb88d44, thick: 0.5, jitter: 0 },   // thatch
  { a: 0xc4553c, b: 0x9a3a2a, thick: 0.24, jitter: 0 },     // red tile
  { a: 0x4f7cb3, b: 0x355d8e, thick: 0.24, jitter: 0 },     // blue tile
];

export function buildVillage(game, world, { uTime, waterMaterial }) {
  const { getHeight, colliders } = world;
  const group = new THREE.Group(); group.name = 'village';
  game.scene.add(group);
  const rnd = mulberry32(777);
  const P = [];   // toon parts
  const E = [];   // emissive parts (MeshBasic, vertex colours may exceed 1 for bloom)
  const smokeSpots = [];
  const hy = (x, z) => getHeight(x, z);
  const add = (g, color, m, opts) => { P.push(part(g, color, m, opts)); };
  const emit = (g, color, m, mul = 1) => {
    const c = C(color).multiplyScalar(mul);
    E.push(part(g, (x, y, z, o) => o.copy(c), m));
  };
  const box = (m, color, opts) => add(BOX, color, m, opts);
  const L = (T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => T.clone().multiply(mat4(x, y, z, rx, ry, rz, sx, sy, sz));
  const wood = woodColor(), woodLight = woodColor(0xb08a58, 0x8a6a40), woodDark = woodColor(0x5e3f26, 0x3e2916);
  const stone = stoneColor(), stoneWarm = stoneColor(0xc9b99a, 0x9a8a70, false);
  const circleColliders = (x, z, r, kind) => colliders.push({ x, z, r, kind });

  // ------------------------------------------------------------------ houses
  function house(h) {
    const y0 = Math.min(hy(h.x, h.z), hy(h.door[0], h.door[1])) - 0.05;
    const T = mat4(h.x, y0, h.z, 0, h.yaw, 0);
    const w = h.w, d = h.d, floors = h.floors || 1;
    const H1 = 2.7, H2 = floors > 1 ? 2.3 : 0, wallTop = 0.45 + H1 + H2;
    const roof = ROOFS[h.style];
    const plaster = plasterColor(h.style === 2 ? 0xeef0e6 : 0xf3e8cf);
    // foundation
    box(L(T, 0, 0.0, 0, 0, 0, 0, w + 0.5, 0.9, d + 0.5), stoneWarm);
    // walls
    box(L(T, 0, 0.45 + H1 / 2, 0, 0, 0, 0, w, H1, d), plaster);
    if (floors > 1) box(L(T, 0, 0.45 + H1 + H2 / 2 + 0.02, 0, 0, 0, 0, w + 0.35, H2, d + 0.35), plaster);
    // timber frame: corner posts, sill / mid / top beams, braces
    const ow = (w + (floors > 1 ? 0.35 : 0)) / 2 + 0.05, od = (d + (floors > 1 ? 0.35 : 0)) / 2 + 0.05;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(L(T, sx * (w / 2 + 0.03), 0.45 + H1 / 2, sz * (d / 2 + 0.03), 0, 0, 0, 0.26, H1, 0.26), woodDark);
    box(L(T, 0, 0.5, 0, 0, 0, 0, w + 0.12, 0.2, d + 0.12), woodDark);
    box(L(T, 0, 0.45 + H1, 0, 0, 0, 0, w + 0.2 + (floors > 1 ? 0.35 : 0), 0.24, d + 0.2 + (floors > 1 ? 0.35 : 0)), woodDark);
    if (floors > 1) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(L(T, sx * ow, 0.45 + H1 + H2 / 2, sz * od, 0, 0, 0, 0.22, H2, 0.22), woodDark);
      box(L(T, 0, wallTop, 0, 0, 0, 0, w + 0.6, 0.22, d + 0.6), woodDark);
      // diagonal braces on the front of the upper floor
      for (const s of [-1, 1]) box(L(T, s * w * 0.3, 0.45 + H1 + H2 / 2, od, 0, 0, s * 0.75, 0.16, H2 * 1.15, 0.12), woodDark);
    } else {
      for (const s of [-1, 1]) box(L(T, s * (w / 2 + 0.04), 0.45 + H1 * 0.5, 0, 0.62 * s, 0, 0, 0.12, H1 * 1.05, 0.14), woodDark);
    }
    // gable attic + roof planes (ridge along local X)
    const rd = (d + (floors > 1 ? 0.35 : 0)) / 2, rH = Math.max(1.5, rd * 0.85);
    add(PRISM, plaster, L(T, 0, wallTop, 0, 0, 0, 0, w + (floors > 1 ? 0.3 : -0.02), rH / 1.5, (rd * 2) / 1.732));
    // gable timber
    for (const s of [-1, 1]) box(L(T, s * (w / 2 + 0.08), wallTop + rH * 0.35, 0, 0, 0, 0, 0.12, rH * 0.7, 0.16), woodDark);
    const len = Math.hypot(rd, rH), pitch = Math.atan2(rH, rd);
    const L2 = len + 0.75, ra = C(roof.a), rb = C(roof.b);
    const roofCol = (lx, ly, lz, c) => {
      if (roof.thick > 0.3) c.copy(ra).lerp(rb, (Math.sin(lx * 19 + lz * 7) * 0.5 + 0.5) * 0.3 + (ly > 0 ? 0 : 0.35));
      else c.copy(ra).lerp(rb, Math.sin(lz * L2 * 9.5) > 0.3 ? 0.55 : 0);
    };
    for (const s of [-1, 1]) {
      const cy = wallTop + rH / 2 - Math.sin(pitch) * 0.2 + Math.cos(pitch) * roof.thick / 2;
      const cz = s * (rd / 2 + Math.cos(pitch) * 0.2 + Math.sin(pitch) * roof.thick / 2);
      const RP = L(T, 0, cy, cz, s * pitch, 0, 0);
      if (roof.thick > 0.3) {
        add(BOX, roofCol, L(RP, 0, 0, 0, 0, 0, 0, w + 1.1, roof.thick, L2), { localColor: true });
        // thatch: a soft rolled eave
        add(CYL8, ROOFS[0].b, L(RP, 0, -0.05, L2 / 2 * s - 0.05 * s, 0, 0, Math.PI / 2, roof.thick * 0.55, w + 1.15, roof.thick * 0.55));
      } else {
        // tiles: overlapping rows, alternating shade, each row slightly lifted at its lower edge
        const rows = Math.max(4, Math.round(L2 / 0.55)), rl = L2 / rows;
        for (let r = 0; r < rows; r++) {
          const zz = (-L2 / 2 + rl * (r + 0.5)) * s;
          add(BOX, r % 2 ? roof.b : roof.a, L(RP, 0, 0.02, zz, -0.06 * s, 0, 0, w + 1.1, roof.thick, rl * 1.12));
        }
      }
    }
    box(L(T, 0, wallTop + rH + roof.thick * 0.6, 0, Math.PI / 4, 0, 0, w + 1.2, roof.thick * 0.8, roof.thick * 0.8), roof.thick > 0.3 ? 0x9c7436 : 0x7a2c22);
    // chimney
    const chx = w * 0.28 * (rnd() < 0.5 ? -1 : 1), chz = -rd * 0.35;
    box(L(T, chx, wallTop + rH * 0.75, chz, 0, 0, 0, 0.7, rH * 1.3, 0.7), stone);
    box(L(T, chx, wallTop + rH * 1.42, chz, 0, 0, 0, 0.86, 0.18, 0.86), 0x77706a);
    smokeSpots.push(new THREE.Vector3().setFromMatrixPosition(L(T, chx, wallTop + rH * 1.55, chz)));
    // door + frame + step + awning
    const fz = d / 2 + 0.06;
    box(L(T, 0, 0.45 + 1.05, fz, 0, 0, 0, 1.05, 2.1, 0.1), woodColor(0x7a4a2a, 0x5a3420));
    box(L(T, 0, 0.45 + 2.15, fz + 0.02, 0, 0, 0, 1.35, 0.16, 0.16), woodDark);
    for (const s of [-1, 1]) box(L(T, s * 0.62, 0.45 + 1.08, fz + 0.02, 0, 0, 0, 0.14, 2.16, 0.16), woodDark);
    box(L(T, 0.32, 0.45 + 1.05, fz + 0.08, 0, 0, 0, 0.09, 0.09, 0.06), 0xd8b45a);
    box(L(T, 0, 0.16, fz + 0.55, 0, 0, 0, 1.5, 0.3, 0.8), stoneWarm);
    if (h.home || rnd() < 0.6) {
      box(L(T, 0, 0.45 + 2.55, fz + 0.45, -0.35, 0, 0, 1.9, 0.1, 1.0), roofCol, { localColor: true });
      for (const s of [-1, 1]) box(L(T, s * 0.85, 0.45 + 2.3, fz + 0.78, 0.7, 0, 0, 0.08, 0.08, 0.7), woodDark);
    }
    // windows (glow) + shutters + flower boxes
    const win = (lx, ly, lz, ry) => {
      const W = L(T, lx, ly, lz, 0, ry, 0);
      emit(BOX, 0xffd796, L(W, 0, 0, 0.0, 0, 0, 0, 0.8, 0.85, 0.06), 0.95);
      box(L(W, 0, 0, 0.04, 0, 0, 0, 0.1, 0.9, 0.06), woodDark);
      box(L(W, 0, 0, 0.04, 0, 0, 0, 0.85, 0.08, 0.06), woodDark);
      box(L(W, 0, 0.48, 0.03, 0, 0, 0, 1.0, 0.12, 0.12), woodDark);
      const sc = h.style === 2 ? 0x3e6e9e : (h.style === 1 ? 0x4f8a4a : 0x8a4a3a);
      for (const s of [-1, 1]) box(L(W, s * 0.62, 0, 0.06, 0, s * 0.35, 0, 0.42, 0.92, 0.06), sc);
      if (rnd() < 0.75) {
        box(L(W, 0, -0.56, 0.18, 0, 0, 0, 0.95, 0.22, 0.3), wood);
        const fc = [0xff6f91, 0xffd23f, 0xffffff, 0xb57cff, 0xff8f3f][Math.floor(rnd() * 5)];
        for (let k = 0; k < 4; k++) add(ICO0, k % 2 ? fc : 0x4d9a3a, L(W, -0.33 + k * 0.22, -0.4, 0.2, rnd(), rnd(), 0, 0.15));
      }
    };
    const wy = 0.45 + 1.45;
    win(-w * 0.3, wy, d / 2 + 0.03, 0); win(w * 0.3, wy, d / 2 + 0.03, 0);
    win(w / 2 + 0.03, wy, 0, Math.PI / 2); win(-w / 2 - 0.03, wy, 0, -Math.PI / 2);
    win(0, wy, -d / 2 - 0.03, Math.PI);
    if (floors > 1) { win(-w * 0.25, 0.45 + H1 + H2 * 0.5, od, 0); win(w * 0.25, 0.45 + H1 + H2 * 0.5, od, 0); }
    // side props: barrel, crate, firewood stack
    const side = rnd() < 0.5 ? -1 : 1;
    add(CYL12, wood, L(T, side * (w / 2 + 0.7), 0.45, d / 2 - 0.6, 0, 0, 0, 0.42, 0.9, 0.42));
    box(L(T, side * (w / 2 + 0.75), 0.35, d / 2 - 1.6, 0, 0.3, 0, 0.7, 0.7, 0.7), woodLight);
    for (let k = 0; k < 6; k++) add(CYL6, woodColor(0x9a6c40, 0x6a4628), L(T, -side * (w / 2 + 0.45), 0.2 + Math.floor(k / 3) * 0.3, -d / 4 + (k % 3) * 0.32 - 0.3, Math.PI / 2, 0, 0, 0.14, 1.3, 0.14));
    // colliders along the long axis
    const n = Math.max(2, Math.round(w / d * 2));
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : (k / (n - 1) - 0.5) * (w - d * 0.8);
      const c = Math.cos(h.yaw), s = Math.sin(h.yaw);
      circleColliders(h.x + c * t, h.z - s * t, d / 2 + 0.25, 'house');
    }
  }
  for (const h of VILLAGE.houses) house(h);

  // ------------------------------------------------------------------ plaza: well + flower beds + benches
  {
    const [wx, wz] = VILLAGE.well; const y = hy(wx, wz);
    const T = mat4(wx, y, wz);
    add(CYL20, stone, L(T, 0, 0.45, 0, 0, 0, 0, 1.35, 0.95, 1.35));
    add(CYL20, 0x2f5f7a, L(T, 0, 0.94, 0, 0, 0, 0, 1.05, 0.02, 1.05));
    add(CYL20, stoneWarm, L(T, 0, 0.97, 0, 0, 0, 0, 1.45, 0.12, 1.45));
    for (const s of [-1, 1]) box(L(T, s * 1.15, 1.7, 0, 0, 0, 0, 0.2, 1.6, 0.2), woodDark);
    box(L(T, 0, 2.4, 0, 0, 0, 0, 2.6, 0.12, 0.12), woodDark);
    for (const s of [-1, 1]) box(L(T, 0, 2.75, s * 0.48, s * 0.75, 0, 0, 2.9, 0.12, 1.25), ROOFS[1].a);
    add(CYL8, wood, L(T, 0.2, 1.65, 0, 0, 0, 0, 0.28, 0.36, 0.28));
    circleColliders(wx, wz, 1.55, 'well');
    // flower beds ring
    const PL = VILLAGE.plaza;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const x = PL.x + Math.cos(a) * (PL.r - 1.4), z = PL.z + Math.sin(a) * (PL.r - 1.4);
      // skip lanes
      let near = false;
      for (const l of VILLAGE.lanes) for (const p of l) if (Math.hypot(p[0] - x, p[1] - z) < 2.6) near = true;
      if (near) continue;
      flowerBed(x, z, a + Math.PI / 2, 2.2, 0.9);
    }
    // benches
    for (const a of [0.9, 3.9]) {
      const x = PL.x + Math.cos(a) * 3.3, z = PL.z + Math.sin(a) * 3.3;
      const B = mat4(x, hy(x, z), z, 0, -a + Math.PI / 2, 0);
      box(L(B, 0, 0.45, 0, 0, 0, 0, 1.8, 0.1, 0.5), woodLight);
      for (const s of [-1, 1]) box(L(B, s * 0.7, 0.22, 0, 0, 0, 0, 0.12, 0.45, 0.45), woodDark);
    }
  }
  function flowerBed(x, z, ry, len, wid) {
    const T = mat4(x, hy(x, z), z, 0, ry, 0);
    box(L(T, 0, 0.12, 0, 0, 0, 0, len, 0.3, wid), woodColor(0x7d5a36, 0x5a3e24));
    box(L(T, 0, 0.26, 0, 0, 0, 0, len - 0.15, 0.06, wid - 0.15), 0x5a3f26);
    const pal = [0xff6f91, 0xffd23f, 0xfff4e0, 0xb57cff, 0xff8f3f, 0x6fb7ff];
    const n = Math.round(len * 4);
    for (let k = 0; k < n; k++) {
      const lx = (rnd() - 0.5) * (len - 0.3), lz = (rnd() - 0.5) * (wid - 0.3);
      add(ICO0, 0x4d9a3a, L(T, lx, 0.34, lz, rnd(), rnd(), 0, 0.17, 0.2, 0.17));
      add(ICO0, pal[Math.floor(rnd() * pal.length)], L(T, lx, 0.5 + rnd() * 0.1, lz, rnd(), rnd(), 0, 0.12));
    }
  }

  // ------------------------------------------------------------------ market stalls
  for (const st of VILLAGE.stalls) {
    const y = hy(st.x, st.z); const T = mat4(st.x, y, st.z, 0, st.yaw, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(L(T, sx * 1.4, 1.25, sz * 0.8, 0, 0, 0, 0.14, 2.5, 0.14), woodDark);
    box(L(T, 0, 0.85, 0.35, 0, 0, 0, 2.9, 0.12, 1.0), woodLight);
    box(L(T, 0, 0.45, 0.35, 0, 0, 0, 2.7, 0.8, 0.9), wood);
    const aw = rnd() < 0.5 ? [0xd94a3a, 0xf4ead2] : [0x3f7fc0, 0xf4ead2];
    for (let k = 0; k < 6; k++) box(L(T, -1.375 + k * 0.55, 2.55, 0.25, -0.32, 0, 0, 0.56, 0.08, 2.2), k % 2 ? aw[1] : aw[0]);
    for (let k = 0; k < 7; k++) box(L(T, -1.5 + k * 0.5, 2.18, 1.3, 0, 0, 0, 0.5, 0.3, 0.04), k % 2 ? aw[1] : aw[0]);
    // goods: fruit piles, crates, sacks
    const fruit = [0xe8473a, 0xffb43a, 0x8fd24a, 0xb05ad8];
    for (let k = 0; k < 14; k++) add(ICO1, fruit[k % 4], L(T, -1.2 + (k % 7) * 0.4, 0.98 + Math.floor(k / 7) * 0.13, 0.2 + Math.floor(k / 7) * 0.25, 0, 0, 0, 0.13));
    box(L(T, 1.9, 0.35, 0.2, 0, 0.4, 0, 0.7, 0.7, 0.7), woodLight);
    box(L(T, 1.85, 0.95, 0.25, 0, 0.1, 0, 0.5, 0.5, 0.5), woodLight);
    add(ICO1, 0xd8c39a, L(T, -1.9, 0.4, 0.4, 0, 0, 0, 0.45, 0.5, 0.4), { jitter: 0.08 });
    circleColliders(st.x + Math.sin(st.yaw) * 0.35, st.z + Math.cos(st.yaw) * 0.35, 1.35, 'stall');
  }
  // handcart near the market
  {
    const x = 15, z = 135.5; const T = mat4(x, hy(x, z), z, 0, 0.6, 0);
    box(L(T, 0, 0.75, 0, 0, 0, 0, 1.4, 0.5, 2.0), woodLight);
    for (const s of [-1, 1]) add(CYL12, woodDark, L(T, s * 0.8, 0.45, 0, 0, 0, Math.PI / 2, 0.45, 0.12, 0.45));
    for (const s of [-1, 1]) box(L(T, s * 0.45, 0.65, 1.6, 0, 0, 0, 0.08, 0.08, 1.4), woodDark);
    for (let k = 0; k < 6; k++) add(ICO1, [0xffb43a, 0x8fd24a][k % 2], L(T, -0.4 + (k % 3) * 0.4, 1.1, -0.4 + Math.floor(k / 3) * 0.7, 0, 0, 0, 0.2));
    circleColliders(x, z, 1.2, 'cart');
  }

  // ------------------------------------------------------------------ windmill
  let sails = null;
  {
    const Wm = VILLAGE.windmill; const y = hy(Wm.x, Wm.z) - 0.1;
    const face = yawTo(Wm.x, Wm.z, VILLAGE.plaza.x, VILLAGE.plaza.z);
    const T = mat4(Wm.x, y, Wm.z, 0, face, 0);
    add(CYL8, stone, L(T, 0, 1.0, 0, 0, 0, 0, 3.2, 2.0, 3.2));
    const tower = new THREE.CylinderGeometry(1.75, 2.75, 8.5, 8, 3);
    add(tower, plasterColor(), L(T, 0, 2.0 + 4.25, 0));
    add(CYL8, woodDark, L(T, 0, 4.0, 0, 0, 0, 0, 2.6, 0.22, 2.6));
    add(CYL8, woodDark, L(T, 0, 8.0, 0, 0, 0, 0, 2.12, 0.22, 2.12));
    add(new THREE.ConeGeometry(2.3, 3.2, 8), ROOFS[1].a, L(T, 0, 10.5 + 1.6, 0));
    box(L(T, 0, 1.1, 3.22, 0, 0, 0, 1.2, 2.2, 0.12), woodColor(0x7a4a2a, 0x5a3420));
    emit(BOX, 0xffd796, L(T, 0, 6.0, 2.36, -0.12, 0, 0, 0.7, 0.8, 0.06), 0.95);
    emit(BOX, 0xffd796, L(T, Math.sin(0.8) * 2.58, 4.4, Math.cos(0.8) * 2.58, -0.12, 0.8, 0, 0.6, 0.7, 0.06), 0.95);
    box(L(T, 0, 9.8, 2.4, Math.PI / 2, 0, 0, 0.4, 2.4, 0.4), woodDark);
    circleColliders(Wm.x, Wm.z, 3.0, 'windmill');
    // rotating sails (own mesh): 4 lattice arms with cloth
    const sp = [];
    for (let k = 0; k < 4; k++) {
      const R = mat4(0, 0, 0, 0, 0, (k / 4) * Math.PI * 2);
      sp.push(part(BOX, woodDark, R.clone().multiply(mat4(0, 3.6, 0, 0, 0, 0, 0.22, 7.2, 0.18))));
      sp.push(part(BOX, 0xf3ead6, R.clone().multiply(mat4(0.62, 4.2, -0.04, 0, 0.08, 0, 1.05, 5.4, 0.04))));
      for (let j = 0, NR = 5; j < NR; j++) sp.push(part(BOX, woodDark, R.clone().multiply(mat4(0.62, 1.8 + j * 1.2, 0.02, 0, 0, 0, 1.15, 0.07, 0.07))));
    }
    sp.push(part(CYL12, woodDark, mat4(0, 0, 0.1, Math.PI / 2, 0, 0, 0.45, 0.5, 0.45)));
    const g = merge(sp);
    sails = staticMesh(group, g, { outline: 0.04, outlineColor: 0x2a2018 });
    sails.position.setFromMatrixPosition(L(T, 0, 9.8, 3.4));
    sails.rotation.order = 'YXZ'; sails.rotation.y = face;
    sails.name = 'windmillSails';
  }

  // ------------------------------------------------------------------ pond
  let pond = null;
  {
    const Pd = VILLAGE.pond;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rnd() * 0.2, r = Pd.r * (1.02 + rnd() * 0.12);
      const x = Pd.x + Math.cos(a) * r, z = Pd.z + Math.sin(a) * r;
      const s = 0.35 + rnd() * 0.45;
      add(ICO1, stone, mat4(x, hy(x, z) + s * 0.1, z, rnd(), rnd() * 3, 0, s * 1.3, s * 0.7, s), { jitter: 0.25 });
    }
    // reeds + lily pads
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = Pd.r * (0.82 + rnd() * 0.2);
      const x = Pd.x + Math.cos(a) * r, z = Pd.z + Math.sin(a) * r;
      add(CYL6, 0x5f9a3a, mat4(x, Pd.level + 0.5, z, (rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3, 0.035, 1.2 + rnd() * 0.5, 0.035));
      if (i % 3 === 0) add(CYL8, 0x7a4f2a, mat4(x, Pd.level + 1.2, z, 0, 0, 0, 0.06, 0.25, 0.06));
    }
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2, r = Pd.r * rnd() * 0.75;
      add(CYL12, 0x58a84a, mat4(Pd.x + Math.cos(a) * r, Pd.level + 0.03, Pd.z + Math.sin(a) * r, 0, rnd() * 6, 0, 0.35 + rnd() * 0.2, 0.02, 0.35 + rnd() * 0.2));
      if (i % 3 === 0) add(ICO0, 0xffc8e0, mat4(Pd.x + Math.cos(a) * r, Pd.level + 0.1, Pd.z + Math.sin(a) * r, 0, 0, 0, 0.12));
    }
    if (waterMaterial) {
      const m = waterMaterial.clone();
      m.uniforms.uTime = waterMaterial.uniforms.uTime;
      m.uniforms.uLevel = { value: Pd.level };
      m.uniforms.uHeightTex = waterMaterial.uniforms.uHeightTex;
      if (waterMaterial.uniforms.uColorTex) m.uniforms.uColorTex = waterMaterial.uniforms.uColorTex;
      const g = new THREE.CircleGeometry(Pd.r * 1.25, 28); g.rotateX(-Math.PI / 2);
      pond = new THREE.Mesh(g, m);
      pond.position.set(Pd.x, Pd.level, Pd.z);
      pond.renderOrder = -0.4; pond.name = 'pond';
      group.add(pond);
    }
  }

  // ------------------------------------------------------------------ 원소의 제단 (elemental altar)
  const crystalSpots = [];
  {
    const A = VILLAGE.altar; const y = hy(A.x, A.z);
    const T = mat4(A.x, y, A.z);
    const altarStone = stoneColor(0xd6d0c2, 0xa9a292, false);
    add(CYL20, altarStone, L(T, 0, 0.1, 0, 0, 0, 0, A.r, 0.5, A.r));
    add(CYL20, altarStone, L(T, 0, 0.45, 0, 0, 0, 0, A.r - 0.7, 0.4, A.r - 0.7));
    add(CYL20, stoneColor(0xe4ded0, 0xbdb6a6, false), L(T, 0, 0.75, 0, 0, 0, 0, A.r - 1.4, 0.3, A.r - 1.4));
    // inner glowing ring band
    emit(new THREE.TorusGeometry(A.r - 1.9, 0.06, 4, 48), 0x9fe8ff, L(T, 0, 0.92, 0, Math.PI / 2, 0, 0), 1.6);
    emit(new THREE.TorusGeometry(1.2, 0.05, 4, 32), 0xfff1c0, L(T, 0, 0.92, 0, Math.PI / 2, 0, 0), 1.6);
    // central star-pedestal
    add(CYL8, altarStone, L(T, 0, 1.15, 0, 0, 0, 0, 0.7, 0.5, 0.7));
    emit(new THREE.OctahedronGeometry(0.32, 0), 0xffffff, L(T, 0, 1.75, 0, 0, 0.4, 0, 1, 1.5, 1), 1.4);
    // v3: one pillar per element (ALL_ELEMENTS, 9) — iterate the registry, never a fixed count
    const NP = ALL_ELEMENTS.length;
    for (let i = 0; i < NP; i++) {
      const a = (i / NP) * Math.PI * 2 + Math.PI; // first pillar faces south (village side)
      const px = Math.sin(a) * (A.r - 1.05), pz = Math.cos(a) * (A.r - 1.05);
      const el = ALL_ELEMENTS[i]; const ec = elColor(el, 'hex');
      const Pm = L(T, px, 0, pz, 0, a, 0);
      const lost = !!ELEMENT_DEFS[el]?.isNew;   // the four erased spirits: darker, cracked-looking stone
      const st = lost ? stoneColor(0xb7b0c4, 0x8a8296, false) : altarStone;
      const k = NP > 6 ? 0.82 : 1;                 // slimmer pillars so nine fit the ring
      box(L(Pm, 0, 0.75, 0, 0, 0, 0, 1.0 * k, 0.6, 1.0 * k), st);
      add(CYL8, st, L(Pm, 0, 2.3, 0, 0, Math.PI / 8, 0, 0.38 * k, 2.6, 0.38 * k));
      box(L(Pm, 0, 3.7, 0, 0, 0, 0, 0.95 * k, 0.3, 0.95 * k), st);
      add(CONE8, st, L(Pm, 0, 4.0, 0, Math.PI, Math.PI / 8, 0, 0.5 * k, 0.35, 0.5 * k));
      // element rune bands
      emit(new THREE.TorusGeometry(0.41 * k, 0.045, 4, 16), ec, L(Pm, 0, 1.6, 0, Math.PI / 2, 0, 0), lost ? 1.2 : 1.8);
      emit(new THREE.TorusGeometry(0.41 * k, 0.045, 4, 16), ec, L(Pm, 0, 3.2, 0, Math.PI / 2, 0, 0), lost ? 1.2 : 1.8);
      emit(BOX, ec, L(Pm, 0, 2.4, 0.39 * k, 0, 0, Math.PI / 4, 0.22, 0.22, 0.03), 1.8);
      crystalSpots.push({ base: new THREE.Vector3().setFromMatrixPosition(L(Pm, 0, 5.0, 0)), color: ec, el, lost });
      const wp = new THREE.Vector3().setFromMatrixPosition(Pm);
      circleColliders(wp.x, wp.z, 0.6 * k, 'pillar');
    }
  }

  // ------------------------------------------------------------------ training ground
  {
    const Tg = VILLAGE.training; const y = hy(Tg.x, Tg.z);
    const face = yawTo(Tg.x, Tg.z, VILLAGE.plaza.x, VILLAGE.plaza.z);
    const T = mat4(Tg.x, y, Tg.z, 0, face, 0);
    // weapon rack at the back
    const R = L(T, -4.5, 0, -6.2, 0, 0.5, 0);
    for (const s of [-1, 1]) box(L(R, s * 1.1, 0.8, 0, 0, 0, 0, 0.14, 1.6, 0.14), woodDark);
    box(L(R, 0, 1.45, 0, 0, 0, 0, 2.4, 0.1, 0.12), woodDark);
    box(L(R, 0, 0.5, 0, 0, 0, 0, 2.4, 0.1, 0.12), woodDark);
    for (let k = 0; k < 4; k++) {
      box(L(R, -0.75 + k * 0.5, 1.0, 0.08, 0.12, 0, 0, 0.06, 1.7, 0.03), 0xcfd6dc);
      box(L(R, -0.75 + k * 0.5, 0.35, 0.08, 0, 0, 0, 0.24, 0.05, 0.06), 0x8a6a3a);
    }
    // straw archery target
    const A = L(T, 5.2, 0, -5.4, 0, -0.5, 0);
    for (const s of [-1, 1]) box(L(A, s * 0.5, 0.9, -0.3, -0.25, 0, 0, 0.1, 1.9, 0.1), woodDark);
    add(CYL20, 0xd9be6a, L(A, 0, 1.25, 0, Math.PI / 2 - 0.25, 0, 0, 0.75, 0.25, 0.75));
    add(CYL20, 0xf3efe2, L(A, 0, 1.25, 0.03, Math.PI / 2 - 0.25, 0, 0, 0.55, 0.25, 0.55));
    add(CYL20, 0xd8403a, L(A, 0, 1.25, 0.06, Math.PI / 2 - 0.25, 0, 0, 0.3, 0.25, 0.3));
    // hay bales
    for (const [lx, lz] of [[-6.5, 2.5], [-7, 0.8], [6.8, 1.2]]) add(CYL12, (x, yy, z, c) => c.set(0xd6b45e).lerp(C(0xb8943e), (Math.sin(x * 9 + z * 7) * 0.5 + 0.5) * 0.4), L(T, lx, 0.45, lz, Math.PI / 2, 0.3, 0, 0.55, 1.1, 0.55), { jitter: 0.04 });
    // banner poles with element flags
    for (let k = 0; k < 2; k++) {
      const B = L(T, k ? 7.8 : -7.8, 0, -3.5);
      add(CYL6, woodDark, L(B, 0, 2.2, 0, 0, 0, 0, 0.07, 4.4, 0.07));
      for (let s2 = 0; s2 < 3; s2++) box(L(B, 0.55, 4.0 - s2 * 0.4, 0, 0, 0, 0, 1.0, 0.4, 0.03), s2 % 2 ? 0xe9c46a : 0x2f6fb0);
    }
  }

  // ------------------------------------------------------------------ tutorial rock spire
  {
    const S = VILLAGE.spire; const y = hy(S.x, S.z) - 0.6;
    const T = mat4(S.x, y, S.z);
    const rock = stoneColor(0xa89a86, 0x7a6e62, false);
    const tiers = 6;
    for (let k = 0; k < tiers; k++) {
      const t = k / tiers, t2 = (k + 1) / tiers;
      const r0 = S.rBase + (S.rTop - S.rBase) * t, r1 = S.rBase + (S.rTop - S.rBase) * t2;
      const h = (S.height + 0.6) / tiers;
      const g = new THREE.CylinderGeometry(r1 * (0.95 + rnd() * 0.08), r0 * (1.0 + rnd() * 0.06), h * 1.08, 9, 1);
      add(g, rock, L(T, (rnd() - 0.5) * 0.4, h * k + h / 2, (rnd() - 0.5) * 0.4, 0, rnd() * 3, 0), { jitter: 0.35 });
    }
    // grassy cap + ledges
    const topY = y + S.height + 0.6;
    add(new THREE.CylinderGeometry(S.rTop + 0.25, S.rTop - 0.1, 0.5, 12), (x, yy, z, c) => c.set(0x6fb04a).lerp(C(0x4f8a3a), (Math.sin(x * 3 + z * 2) * 0.5 + 0.5) * 0.4), mat4(S.x, topY - 0.15, S.z), { jitter: 0.12 });
    for (let k = 0; k < 7; k++) {
      const a = rnd() * Math.PI * 2, hh = 2 + rnd() * (S.height - 4);
      const rr = S.rBase + (S.rTop - S.rBase) * (hh / S.height);
      add(ICO1, rock, mat4(S.x + Math.cos(a) * rr, y + hh, S.z + Math.sin(a) * rr, rnd(), rnd(), rnd(), 0.9 + rnd() * 0.8, 0.5 + rnd() * 0.4, 0.9 + rnd() * 0.8), { jitter: 0.3 });
    }
    for (let k = 0; k < 9; k++) {
      const a = rnd() * Math.PI * 2, rr = S.rBase + 0.8 + rnd() * 2.5;
      const x = S.x + Math.cos(a) * rr, z = S.z + Math.sin(a) * rr, s = 0.5 + rnd() * 1.1;
      add(ICO1, rock, mat4(x, hy(x, z) - s * 0.2, z, rnd(), rnd(), 0, s * 1.2, s * 0.8, s), { jitter: 0.3 });
    }
    // little wind shrine on top: stone pedestal + two posts + lintel + glowing wind rune
    const Sh = mat4(S.x, topY + 0.1, S.z, 0, yawTo(S.x, S.z, VILLAGE.tutorialMeadow.x, VILLAGE.tutorialMeadow.z), 0);
    add(CYL8, stoneWarm, L(Sh, 0, 0.3, 0, 0, 0, 0, 0.55, 0.6, 0.55));
    add(CYL8, stoneWarm, L(Sh, 0, 0.66, 0, 0, 0, 0, 0.7, 0.12, 0.7));
    for (const s of [-1, 1]) box(L(Sh, s * 1.25, 1.1, -0.8, 0, 0, 0, 0.28, 2.2, 0.28), 0xc4553c);
    box(L(Sh, 0, 2.25, -0.8, 0, 0, 0, 3.2, 0.24, 0.36), 0x9a3a2a);
    box(L(Sh, 0, 1.85, -0.8, 0, 0, 0, 2.6, 0.14, 0.2), 0xc4553c);
    emit(new THREE.TorusGeometry(0.42, 0.05, 4, 24), ELEMENT_COLORS.wind, L(Sh, 0, 0.74, 0, Math.PI / 2, 0, 0), 1.7);
    colliders.push({ x: S.x, z: S.z, r: S.rBase - 0.3, rTop: S.rTop + 0.1, base: y + 0.6, top: topY, kind: 'spire' });
    world._spireTop = { x: S.x, z: S.z, r: S.rTop + 0.15, y: topY + 0.1 };
  }

  // ------------------------------------------------------------------ lanterns along lanes
  const lanternSpots = [];
  {
    const seen = [];
    for (const lane of VILLAGE.lanes) {
      for (let i = 0; i < lane.length - 1; i++) {
        const [ax, az] = lane[i], [bx, bz] = lane[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        for (let t = 3; t < len; t += 9) {
          const ux = (bx - ax) / len, uz = (bz - az) / len;
          const side = (i + Math.floor(t / 9)) % 2 ? 1 : -1;
          const x = ax + ux * t - uz * 1.9 * side, z = az + uz * t + ux * 1.9 * side;
          if (seen.some((p) => Math.hypot(p[0] - x, p[1] - z) < 6)) continue;
          if (Math.hypot(x - VILLAGE.plaza.x, z - VILLAGE.plaza.z) < VILLAGE.plaza.r + 0.5) continue;
          if (colliders.some((c) => c.kind !== 'tree' && Math.hypot(c.x - x, c.z - z) < c.r + 0.6)) continue;
          seen.push([x, z]); lanternSpots.push([x, z, Math.atan2(ux * side, uz * side)]);
        }
      }
    }
    for (const [x, z, ry] of lanternSpots) {
      const T = mat4(x, hy(x, z), z, 0, ry, 0);
      add(CYL6, woodDark, L(T, 0, 1.3, 0, 0, 0, 0, 0.08, 2.6, 0.08));
      box(L(T, 0.35, 2.5, 0, 0, 0, 0, 0.75, 0.07, 0.07), woodDark);
      box(L(T, 0.62, 2.2, 0, 0, 0, 0, 0.32, 0.05, 0.32), woodDark);
      add(CONE8, woodDark, L(T, 0.62, 2.0 + 0.47, 0, 0, Math.PI / 8, 0, 0.28, 0.2, 0.28));
      emit(BOX, 0xffc46a, L(T, 0.62, 2.0, 0, 0, 0, 0, 0.24, 0.34, 0.24), 1.75);
      circleColliders(x, z, 0.2, 'lantern');
    }
  }

  // ------------------------------------------------------------------ fences (posts + 2 rails following the ground)
  function fence(pts, gap = null) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2.2));
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (gap && gap(x, z)) continue;
        add(CYL6, woodLight, mat4(x, hy(x, z) + 0.5, z, 0, 0, 0, 0.08, 1.1, 0.08));
        if (k < n) {
          const t2 = (k + 1) / n, x2 = ax + (bx - ax) * t2, z2 = az + (bz - az) * t2;
          if (gap && gap(x2, z2)) continue;
          const mx = (x + x2) / 2, mz = (z + z2) / 2, l = Math.hypot(x2 - x, z2 - z);
          const dy = hy(x2, z2) - hy(x, z);
          const ry = Math.atan2(-(z2 - z), x2 - x), rz = Math.atan2(dy, l);
          for (const hh of [0.45, 0.85]) box(mat4(mx, hy(mx, mz) + hh, mz, 0, ry, rz, Math.hypot(l, dy) + 0.1, 0.09, 0.06), woodLight);
        }
      }
    }
  }
  for (const gd of VILLAGE.gardens) {
    const { x, z, w, d } = gd;
    fence([[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2], [x - w / 2, z - d / 2]], (px, pz) => Math.abs(pz - (z - d / 2)) < 0.1 && Math.abs(px - x) < 0.9);
    for (let r = 0; r < 3; r++) for (let k = 0; k < Math.floor(w / 0.8); k++) {
      const px = x - w / 2 + 0.6 + k * 0.8, pz = z - d / 2 + 0.9 + r * 1.1;
      add(ICO0, r === 1 ? 0xff8f3f : 0x58a84a, mat4(px, hy(px, pz) + 0.2, pz, rnd(), rnd(), 0, 0.28, 0.25, 0.28));
    }
  }
  {
    const Tg = VILLAGE.training, pts = [];
    for (let k = 0; k <= 14; k++) { const a = Math.PI * 0.9 + (k / 14) * Math.PI * 1.25; pts.push([Tg.x + Math.cos(a) * (Tg.r + 1.6), Tg.z + Math.sin(a) * (Tg.r + 1.6)]); }
    fence(pts, (px, pz) => {
      const dx = px - Tg.x, dz = pz - Tg.z, a = Math.atan2(dx, dz);
      const face = yawTo(Tg.x, Tg.z, VILLAGE.plaza.x, VILLAGE.plaza.z);
      return Math.abs(Math.atan2(Math.sin(a - face), Math.cos(a - face))) < 0.5;
    });
  }
  // northern village edge, gap at the gate
  fence([[-44, 124], [-30, 119], [-22, 113.5], [-8, 112.5], [-2.5, 112.5]]);
  fence([[2.5, 112.5], [8, 112], [12, 107.5]]);
  fence([[29, 111], [40, 114], [48, 124]]);

  // ------------------------------------------------------------------ gate arch at the north entrance
  {
    const G = VILLAGE.gate; const T = mat4(G.x, hy(G.x, G.z - 7.5), G.z - 7.5);
    for (const s of [-1, 1]) {
      add(CYL8, woodDark, L(T, s * 2.4, 2.4, 0, 0, 0, 0, 0.22, 4.8, 0.22));
      add(CYL8, stone, L(T, s * 2.4, 0.3, 0, 0, 0, 0, 0.45, 0.6, 0.45));
      circleColliders(G.x + s * 2.4, G.z - 7.5, 0.35, 'gate');
      // hanging lanterns
      box(L(T, s * 1.7, 4.0, 0, 0, 0, 0, 0.3, 0.06, 0.3), woodDark);
      emit(BOX, 0xffb85a, L(T, s * 1.7, 3.72, 0, 0, 0, 0, 0.24, 0.4, 0.24), 1.75);
    }
    box(L(T, 0, 4.7, 0, 0, 0, 0, 6.2, 0.3, 0.32), woodDark);
    box(L(T, 0, 5.1, 0, 0, 0, 0, 6.8, 0.22, 0.42), ROOFS[1].a);
    box(L(T, 0, 4.25, 0.18, 0, 0, 0, 2.6, 0.55, 0.06), woodLight);
  }

  // ------------------------------------------------------------------ laundry lines
  for (const [ax, az, bx, bz] of VILLAGE.laundry) {
    const ya = hy(ax, az), yb = hy(bx, bz);
    for (const [x, z, y] of [[ax, az, ya], [bx, bz, yb]]) add(CYL6, woodDark, mat4(x, y + 1.15, z, 0, 0, 0, 0.07, 2.3, 0.07));
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
    const n = 8;
    const cloth = [0xffffff, 0x8ec5ff, 0xffb3c6, 0xfff1a8, 0xb6e3a0, 0xe8473a];
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, sag = Math.sin(t * Math.PI) * 0.25;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ya + (yb - ya) * t + 2.2 - sag;
      box(mat4(x, y, z, 0, ry, 0, len / n + 0.02, 0.03, 0.03), 0xe8e0cc);
      if (k % 2 === 0 || rnd() < 0.4) {
        const cw = 0.35 + rnd() * 0.25, ch = 0.45 + rnd() * 0.35;
        box(mat4(x, y - ch / 2 - 0.02, z, 0, ry, (rnd() - 0.5) * 0.12, cw, ch, 0.025), cloth[Math.floor(rnd() * cloth.length)]);
      }
    }
  }

  // ------------------------------------------------------------------ scattered props: crates, barrels, sacks
  for (let i = 0; i < 18; i++) {
    const h = VILLAGE.houses[i % VILLAGE.houses.length];
    const a = h.yaw + Math.PI + (rnd() - 0.5) * 1.6;
    const x = h.x + Math.sin(a) * (h.d / 2 + 1.0), z = h.z + Math.cos(a) * (h.d / 2 + 1.0);
    if (Math.hypot(x - h.door[0], z - h.door[1]) < 2) continue;
    if (rnd() < 0.5) box(mat4(x, hy(x, z) + 0.32, z, 0, rnd() * 3, 0, 0.64), woodLight);
    else add(CYL12, wood, mat4(x, hy(x, z) + 0.42, z, 0, 0, 0, 0.36, 0.84, 0.36));
  }

  // ------------------------------------------------------------------ build meshes
  const staticGeo = merge(P);
  const main = staticMesh(group, staticGeo, { outline: 0.035, outlineColor: 0x2a2018 });
  main.name = 'villageStatic';
  main.userData.outline = main.children[0];
  const emGeo = merge(E);
  const emMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  const emissive = new THREE.Mesh(emGeo, emMat);
  emissive.name = 'villageGlow';
  group.add(emissive);

  // altar crystals (instanced, element-coloured, bloom) + glow points
  const crystalGeo = new THREE.OctahedronGeometry(0.42, 0); crystalGeo.scale(0.75, 1.5, 0.75);
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
  const crystals = new THREE.InstancedMesh(crystalGeo, crystalMat, ALL_ELEMENTS.length);
  crystals.name = 'altarCrystals';
  // the four lost spirits' crystals stay dim (grey-violet) until their spirit is freed (spiritFreed → crystalLit)
  const freed = (el) => { try { const P = game.progression; return !!(P?.spiritsFreed?.has?.(el) ?? P?.storyGateOpen?.(el)); } catch (_) { return false; } };
  const crystalTint = (c, lit) => (lit ? C(c.color).multiplyScalar(2.2) : C(c.color).lerp(C(0x6a6478), 0.75).multiplyScalar(0.9));
  crystalSpots.forEach((c, i) => crystals.setColorAt(i, crystalTint(c, !c.lost || freed(c.el))));
  crystals.instanceColor.needsUpdate = true;
  crystals.frustumCulled = false;
  group.add(crystals);
  const glowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  // glow + motes around the altar crystals and the shrine (Points, additive, GPU animated)
  const NCS = crystalSpots.length;
  const NG = NCS + NCS * 12;
  const gp = new Float32Array(NG * 3), gc = new Float32Array(NG * 3), gs = new Float32Array(NG * 2);
  crystalSpots.forEach((c, i) => {
    const col = C(c.color);
    gp.set([c.base.x, c.base.y, c.base.z], i * 3); gc.set([col.r, col.g, col.b], i * 3); gs.set([0, -1], i * 2);
    for (let k = 0; k < 12; k++) {
      const j = NCS + i * 12 + k;
      gp.set([c.base.x, c.base.y - 2.5, c.base.z], j * 3); gc.set([col.r, col.g, col.b], j * 3); gs.set([rnd(), rnd()], j * 2);
    }
  });
  const ggeo = new THREE.BufferGeometry();
  ggeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  ggeo.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  ggeo.setAttribute('aSeed', new THREE.BufferAttribute(gs, 2));
  const gUniforms = { uTime, uMap: { value: glowTex }, uScale: { value: 1 } };
  const glow = new THREE.Points(ggeo, new THREE.ShaderMaterial({
    uniforms: gUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uScale; attribute vec2 aSeed; varying vec3 vC; varying float vA;
      void main(){
        vec3 p = position; vC = color;
        float sz;
        if (aSeed.y < 0.0) { p.y += sin(uTime * 1.3 + p.x) * 0.22; sz = 520.0; vA = 0.55 + 0.15 * sin(uTime * 2.0 + p.z); }
        else {
          float life = fract(uTime * (0.18 + aSeed.x * 0.12) + aSeed.y);
          float a = aSeed.x * 40.0 + uTime * (0.6 + aSeed.y);
          p += vec3(cos(a) * (0.4 + aSeed.y * 0.5), life * 3.4, sin(a) * (0.4 + aSeed.y * 0.5));
          sz = 70.0 * (1.0 - life * 0.6); vA = smoothstep(0.0, 0.15, life) * (1.0 - life);
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = sz * uScale / -mv.z;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; varying vec3 vC; varying float vA;
      void main(){ float m = texture2D(uMap, gl_PointCoord).r; gl_FragColor = vec4(vC * 1.6 * m * vA, 1.0); }`,
  }));
  glow.frustumCulled = false; glow.name = 'altarGlow'; glow.renderOrder = 6;
  group.add(glow);

  // chimney smoke (GPU loop per chimney)
  const NS = smokeSpots.length * 9;
  const spA = new Float32Array(NS * 3), spB = new Float32Array(NS * 2);
  smokeSpots.forEach((s, i) => { for (let k = 0; k < 9; k++) { const j = i * 9 + k; spA.set([s.x, s.y, s.z], j * 3); spB.set([k / 9, rnd()], j * 2); } });
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(spA, 3));
  sgeo.setAttribute('aSeed', new THREE.BufferAttribute(spB, 2));
  const smoke = new THREE.Points(sgeo, new THREE.ShaderMaterial({
    uniforms: { uTime, uMap: { value: glowTex }, uScale: gUniforms.uScale, uWind: { value: world.wind?.dir2 || new THREE.Vector2(0.8, -0.6) } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uScale; uniform vec2 uWind; attribute vec2 aSeed; varying float vA; varying float vL;
      void main(){
        float life = fract(uTime * 0.11 + aSeed.x);
        vec3 p = position + vec3(uWind.x * life * life * 6.0 + sin(uTime + aSeed.y * 9.0) * 0.3 * life, life * 7.0, uWind.y * life * life * 6.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (180.0 + life * 700.0) * uScale / -mv.z;
        vA = smoothstep(0.0, 0.12, life) * (1.0 - life) * 0.45; vL = life;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; varying float vA; varying float vL;
      void main(){ float m = texture2D(uMap, gl_PointCoord).r; gl_FragColor = vec4(mix(vec3(0.82, 0.8, 0.78), vec3(0.95, 0.96, 0.98), vL), m * vA); }`,
  }));
  smoke.frustumCulled = false; smoke.name = 'chimneySmoke'; smoke.renderOrder = 4;
  group.add(smoke);

  // ------------------------------------------------------------------ public data (world.village)
  const V3 = (x, z, dy = 0) => new THREE.Vector3(x, hy(x, z) + dy, z);
  const spot = (x, z, yaw) => ({ position: V3(x, z), yaw });
  const home = VILLAGE.houses[0];
  const A = VILLAGE.altar, Tg = VILLAGE.training, S = VILLAGE.spire, M = VILLAGE.tutorialMeadow;
  const toPlaza = (x, z) => yawTo(x, z, VILLAGE.plaza.x, VILLAGE.plaza.z);
  const data = {
    name: '바람결 마을',
    center: V3(VILLAGE.center[0], VILLAGE.center[1]), radius: VILLAGE.radius,
    // just outside the front door; facing (object convention, like npc spots) turned so the camera clears the house
    playerHome: V3(home.door[0] + Math.sin(home.yaw) * 2.5, home.door[1] + Math.cos(home.yaw) * 2.5),
    playerHomeYaw: home.yaw + 1.134,
    npcSpots: {
      elder: spot(-2.6, 133.2, yawTo(-2.6, 133.2, home.door[0], home.door[1])),
      mageMentor: spot(A.x - 2.2, A.z + A.r + 1.0, yawTo(A.x - 2.2, A.z + A.r + 1.0, 0, 137)),
      swordMentor: spot(A.x + 2.4, A.z + A.r + 0.8, yawTo(A.x + 2.4, A.z + A.r + 0.8, 0, 137)),
      captain: spot(2.2, 114.5, Math.PI * 0.05),
      merchant: spot(-11.4, 139.6, yawTo(-11.4, 139.6, 0, 137)),
      child: spot(M.x + 2.5, M.z + 3.5, yawTo(M.x + 2.5, M.z + 3.5, S.x, S.z)),
      villagerA: spot(-19.8, 141.5, Math.PI / 2),
      villagerB: spot(-27, 151.5, toPlaza(-27, 151.5)),
      villagerC: spot(29.5, 129.5, yawTo(29.5, 129.5, VILLAGE.pond.x, VILLAGE.pond.z)),
      // v3 mentors around the altar ring + the sage (이솔데) by the library + the reaction trainer at the training ground
      rangerMentor: spot(A.x - A.r - 1.4, A.z + 2.6, yawTo(A.x - A.r - 1.4, A.z + 2.6, A.x, A.z)),
      paladinMentor: spot(A.x - A.r - 1.0, A.z - 3.2, yawTo(A.x - A.r - 1.0, A.z - 3.2, A.x, A.z)),
      spiritMentor: spot(A.x + A.r + 1.3, A.z - 2.4, yawTo(A.x + A.r + 1.3, A.z - 2.4, A.x, A.z)),
      shadowMentor: spot(A.x - 1.6, A.z - A.r - 1.5, yawTo(A.x - 1.6, A.z - A.r - 1.5, A.x, A.z)),
      sage: spot(6.2, 147.6, toPlaza(6.2, 147.6)),
      trainer: spot(Tg.x + 7.2, Tg.z - 1.5, yawTo(Tg.x + 7.2, Tg.z - 1.5, Tg.x, Tg.z)),
    },
    /** The reaction-trainer dummy (DESIGN §5.6 / story trainer): its spot at the training ground. */
    reactionDummy: spot(Tg.x + 5.2, Tg.z - 4.6, yawTo(Tg.x + 5.2, Tg.z - 4.6, VILLAGE.plaza.x, VILLAGE.plaza.z)),
    altar: V3(A.x, A.z, 0.9),
    altarRadius: A.r,
    altarCrystals: crystalSpots.map((c) => ({ element: c.el, position: c.base.clone() })),
    trainingGround: V3(Tg.x, Tg.z),
    trainingDummies: VILLAGE.dummies.map((d) => spot(d.x, d.z, d.yaw)),
    tutorialHill: new THREE.Vector3(S.x, world._spireTop.y, S.z),
    tutorialHillRadius: S.rTop,
    tutorialMeadow: V3(M.x, M.z),
    pond: { position: new THREE.Vector3(VILLAGE.pond.x, VILLAGE.pond.level, VILLAGE.pond.z), radius: VILLAGE.pond.r },
    windmill: V3(VILLAGE.windmill.x, VILLAGE.windmill.z),
    well: V3(VILLAGE.well[0], VILLAGE.well[1]),
    gate: V3(VILLAGE.gate.x, VILLAGE.gate.z - 7.5),
    lanterns: lanternSpots.map(([x, z]) => V3(x, z, 2.0)),
    barrels: VILLAGE.barrels.map(([x, z]) => V3(x, z)),
  };

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  let alt = 0;
  return {
    group, data, main, emissive, crystals, glow, smoke, sails, pond,
    meshes: [main, emissive, crystals, glow, smoke, sails, pond].filter(Boolean),
    update(t, cam, dt) {
      if (sails) sails.rotation.z = t * 0.55;
      gUniforms.uScale.value = game.renderer.domElement.height / 720;
      // crystals: bob + spin (5 matrices; skip when far)
      if (cam && cam.position.distanceToSquared(data.altar) < 200 * 200) {
        for (let i = 0; i < crystalSpots.length; i++) {
          const c = crystalSpots[i];
          e.set(0, t * 0.8 + i * 1.3, 0); q.setFromEuler(e);
          pv.copy(c.base); pv.y += Math.sin(t * 1.4 + i * 1.256) * 0.18;
          m4.compose(pv, q, sc); crystals.setMatrixAt(i, m4);
        }
        crystals.instanceMatrix.needsUpdate = true;
      }
      alt += dt || 0;
    },
    /** Brighten / dim the altar (0..2), e.g. during the blessing ceremony. */
    setAltarGlow(v) { crystals.material.color.setScalar(Math.max(0.2, v)); },
    /** Light (or dim) one element's altar crystal (instance colour only: no recompile). */
    setCrystalLit(el, lit = true) {
      const i = crystalSpots.findIndex((c) => c.el === el); if (i < 0) return false;
      crystals.setColorAt(i, crystalTint(crystalSpots[i], lit)); crystals.instanceColor.needsUpdate = true; return true;
    },
    refreshCrystals() { crystalSpots.forEach((c, i) => crystals.setColorAt(i, crystalTint(c, !c.lost || freed(c.el)))); crystals.instanceColor.needsUpdate = true; },
  };
}
