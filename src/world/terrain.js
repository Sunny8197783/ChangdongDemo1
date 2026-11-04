// Terrain: analytic height composition baked into a grid; mesh + data textures + exact queries.
import * as THREE from 'three';
import { toonMat } from '../core/utils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, vnoise, ridge, sstep, smin, distPolyline, mulberry32 } from './noise.js';
import { VILLAGE } from './villageLayout.js';
import { WATER } from './zones.js';
import { terraform, terraformColor } from './terraform.js';

export const SIZE = 360;
export const SEG = 240;
export const CELL = SIZE / SEG;
export const ORIGIN = -SIZE / 2;
export const NV = SEG + 1;
export const WATER_LEVEL = WATER;   // 1.5 (zones.js owns the value so the terraform can use it while baking)
export const BOUNDS = 170;
/** v4 terrain chunking: CHUNKS × CHUNKS chunks of CHUNK_CELLS cells; LOD1 keeps every LOD_STEP-th grid line beyond NEAR_D m. */
export const CHUNKS = 8, CHUNK_CELLS = SEG / CHUNKS, LOD_STEP = 3, NEAR_D = 120;

function smoothPath(pts, per = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal');
  const n = Math.max(8, (pts.length - 1) * per);
  return curve.getSpacedPoints(n).map((v) => [v.x, v.z]);
}

function bbox(pts, m) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  return { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m };
}
const inBox = (b, x, z) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;

export const LAYOUT = {
  spawn: [VILLAGE.houses[0].door[0], VILLAGE.houses[0].door[1]],
  training: [VILLAGE.training.x, VILLAGE.training.z], trainingR: VILLAGE.training.r,
  camps: [
    { id: 'camp0', name: '서쪽 뿔도깨비 야영지', x: -80, z: 20, r: 14 },
    { id: 'camp1', name: '동쪽 뿔도깨비 야영지', x: 85, z: -5, r: 14 },
    { id: 'camp2', name: '북쪽 뿔도깨비 야영지', x: 10, z: -55, r: 14 },
  ],
  arena: { x: 0, z: -125, r: 24, rise: 9 },
  ramp: { x: 0, z0: -101, z1: -77, hw: 3.6 },
  lake: { x: 38, z: 38, rx: 30, rz: 21 },
  riverRaw: [[-126, -104], [-112, -84], [-86, -52], [-58, -26], [-30, -6], [-8, 10], [14, 24], [32, 34]],
  pathsRaw: {
    main: [[0, 113], [0, 100], [-5, 82], [-12, 60], [-16, 36], [-13, 12], [-6, -14], [3, -36], [10, -55]],
    arena: [[10, -55], [7, -70], [2, -84], [0, -96], [0, -104]],
    west: [[-12, 60], [-34, 50], [-58, 34], [-80, 20]],
    east: [[0, 100], [24, 89], [54, 79], [78, 60], [90, 30], [85, -5]],
  },
  hills: [ [-48, 92, 6, 17], [58, 112, 5, 15], [-30, -78, 7, 17], [52, -62, 6, 14],
    [-128, 12, 8, 15], [124, -30, 7, 15], [44, -100, 7, 13], [-64, -104, 8, 15], [-104, 120, 7, 16],
    [100, 110, 6, 14], [-40, 10, 3, 12], [55, 10, 3.5, 11], [-90, 60, 4, 14],
  ],
  mesas: [
    { x: 126, z: 58, r: 20, h: 11 }, { x: -124, z: 78, r: 18, h: 10 }, { x: 108, z: -92, r: 16, h: 13 },
    { x: -96, z: -70, r: 12, h: 8 },
  ],
};

LAYOUT.river = smoothPath(LAYOUT.riverRaw, 8);
LAYOUT.paths = Object.fromEntries(Object.entries(LAYOUT.pathsRaw).map(([k, v]) => [k, smoothPath(v, 6)]));
LAYOUT.riverBox = bbox(LAYOUT.river, 22);
LAYOUT.pathBoxes = Object.fromEntries(Object.entries(LAYOUT.paths).map(([k, v]) => [k, bbox(v, 6)]));

// Ford: where the main path crosses the river.
{
  let best = Infinity, bp = null;
  for (const p of LAYOUT.paths.main) {
    const d = distPolyline(p[0], p[1], LAYOUT.river);
    if (d < best) { best = d; bp = p; }
  }
  LAYOUT.ford = { x: bp[0], z: bp[1] };
}

const _seg = { i: 0, t: 0, u: 0 };

function riverWidth(u) { return 3.2 + u * 2.2; }

/** 0..1 village blend weight (1 inside the cozy nook, 0 outside). */
export function villageMask(x, z) {
  const M = VILLAGE.mask;
  const vx = (x - M.x) / M.rx, vz = (z - M.z) / M.rz;
  const d2 = vx * vx + vz * vz;
  if (d2 > 2.0) return 0;
  return sstep(1.28, 0.9, Math.sqrt(d2) + vnoise(x * 0.05, z * 0.05, 121) * 0.07);
}

function mountainFactor(x, z) {
  const r = Math.hypot(x, z);
  const ang = Math.atan2(z, x);
  const wob = fbm(Math.cos(ang) * 2.2 + 7, Math.sin(ang) * 2.2 + 3, 3, 91) * 16;
  // behind the village (south) the rise starts later so roofs and the altar have sky behind them
  const south = sstep(0.45, 0.9, z / Math.max(r, 1));
  return sstep(136 + south * 14, 178 + south * 6, r + wob) * (1 - villageMask(x, z));
}

/** Village stone lanes weight 0..1. */
const laneBox = (() => { const pts = VILLAGE.lanes.flat(); return bbox(pts, 4); })();
export function laneWeight(x, z) {
  if (!inBox(laneBox, x, z)) return 0;
  let w = 0;
  for (const l of VILLAGE.lanes) {
    const d = distPolyline(x, z, l);
    if (d < 3) w = Math.max(w, sstep(1.9, 1.1, d + vnoise(x * 0.5, z * 0.5, 72) * 0.35));
  }
  const P = VILLAGE.plaza;
  const dp = Math.hypot(x - P.x, z - P.z);
  if (dp < P.r + 2) w = Math.max(w, sstep(P.r + 0.4, P.r - 0.6, dp + vnoise(x * 0.4, z * 0.4, 73) * 0.6));
  const A = VILLAGE.altar;
  const da = Math.hypot(x - A.x, z - A.z);
  if (da < A.r + 3) w = Math.max(w, sstep(A.r + 1.6, A.r + 0.6, da));
  return w;
}

/** Pre-flatten height (no camps/arena/paths). */
function rawHeight(x, z) {
  let h = 6.2 + fbm(x * 0.011, z * 0.011, 4, 1) * 4.5 + fbm(x * 0.045, z * 0.045, 3, 5) * 0.9;
  for (const [hx, hz, a, s] of LAYOUT.hills) {
    const dx = x - hx, dz = z - hz; const d2 = dx * dx + dz * dz;
    if (d2 < 9 * s * s) h += a * Math.exp(-d2 / (2 * s * s));
  }
  for (const m of LAYOUT.mesas) {
    const d = Math.hypot(x - m.x, z - m.z) + vnoise(x * 0.12, z * 0.12, 33) * 2.5;
    if (d < m.r + 8) {
      const t = sstep(m.r + 4, m.r, d);
      // terraced cliff: two steps
      const step = sstep(0.0, 0.25, t) * 0.45 + sstep(0.55, 0.8, t) * 0.55;
      h += m.h * step + fbm(x * 0.08, z * 0.08, 2, 44) * 0.6 * t;
    }
  }
  const mf = mountainFactor(x, z);
  if (mf > 0) {
    const rd = ridge(x * 0.018, z * 0.018, 4, 7);
    // southern backdrop (behind 바람결 마을) is a lower, rolling valley wall instead of a sheer cliff
    const south = sstep(0.45, 0.9, z / Math.max(Math.hypot(x, z), 1));
    h += Math.pow(mf, 1.6) * (38 + rd * 62) * (1 - 0.55 * south) + mf * fbm(x * 0.06, z * 0.06, 3, 9) * 5;
  }
  // lake
  const L = LAYOUT.lake;
  const lx = (x - L.x) / L.rx, lz = (z - L.z) / L.rz;
  let dn = Math.sqrt(lx * lx + lz * lz);
  if (dn < 2.2) {
    dn += vnoise(x * 0.07, z * 0.07, 61) * 0.09;
    const shape = dn < 1 ? WATER_LEVEL - 3.8 * (1 - dn * dn) - 0.25 : WATER_LEVEL - 0.25 + (dn - 1) * 9;
    h = smin(h, shape, 2.0);
  }
  // river
  if (inBox(LAYOUT.riverBox, x, z)) {
    const d = distPolyline(x, z, LAYOUT.river, _seg);
    if (d < 22) {
      const rw = riverWidth(_seg.u);
      let depth = 1.5;
      const fd = Math.hypot(x - LAYOUT.ford.x, z - LAYOUT.ford.z);
      depth = depth - 1.15 * sstep(9, 3, fd);
      const shape = d < rw ? WATER_LEVEL - depth * (1 - (d / rw) * (d / rw)) - 0.15 : WATER_LEVEL - 0.15 + (d - rw) * 0.55;
      // close the head of the river into a gorge wall
      const head = sstep(0.0, 0.02, _seg.u);
      h = smin(h, shape + (1 - head) * 30, 1.6);
    }
  }
  // village nook: ground eased to a gentle plateau, rising a little toward the cliffs behind
  const vm = villageMask(x, z);
  if (vm > 0) {
    const vh = VILLAGE.base + fbm(x * 0.03, z * 0.03, 2, 122) * 0.55 + sstep(150, 168, z) * 2.4;
    h = h + (vh - h) * vm;
  }
  return h;
}

// Precompute flatten targets
const T = {};
function avgRaw(x, z, r) {
  let s = 0, n = 0;
  for (let a = 0; a < 8; a++) { s += rawHeight(x + Math.cos(a) * r, z + Math.sin(a) * r); n++; }
  return (s + rawHeight(x, z) * 2) / (n + 2);
}
T.camps = LAYOUT.camps.map((c) => avgRaw(c.x, c.z, c.r * 0.6));
T.training = avgRaw(LAYOUT.training[0], LAYOUT.training[1], 6);
T.arena = avgRaw(LAYOUT.arena.x, LAYOUT.arena.z, 10) + LAYOUT.arena.rise;
T.rampEnd = rawHeight(LAYOUT.ramp.x, LAYOUT.ramp.z1);
T.pads = VILLAGE.pads.map((p) => rawHeight(p.x, p.z));
T.glade = avgRaw(64, -48, 6);        // v3: 녹스's glade
T.hollow = avgRaw(86, -74, 4) - 0.5; // v3: 모르그로스's hollow floor
{
  const Pd = VILLAGE.pond;
  T.pond = rawHeight(Pd.x, Pd.z) - 0.35;
  VILLAGE.pond.level = T.pond;
}
LAYOUT.targets = T;

/** Path weight 0..1 (1 in the middle of a dirt path). */
export function pathWeight(x, z) {
  let w = 0;
  for (const k in LAYOUT.paths) {
    if (!inBox(LAYOUT.pathBoxes[k], x, z)) continue;
    const d = distPolyline(x, z, LAYOUT.paths[k]);
    const width = k === 'arena' ? 2.2 : 1.7;
    w = Math.max(w, sstep(width + 1.2, width * 0.4, d + vnoise(x * 0.35, z * 0.35, 71) * 0.7));
  }
  return w;
}

/** Zone weights used for both height and colouring. */
function zones(x, z, out) {
  out.camp = 0; out.campIdx = -1; out.arena = 0; out.training = 0; out.ramp = 0;
  for (let i = 0; i < LAYOUT.camps.length; i++) {
    const c = LAYOUT.camps[i];
    const d = Math.hypot(x - c.x, z - c.z);
    const w = sstep(c.r + 12, c.r + 2, d);
    if (w > out.camp) { out.camp = w; out.campIdx = i; }
  }
  const tr = Math.hypot(x - LAYOUT.training[0], z - LAYOUT.training[1]);
  out.training = sstep(LAYOUT.trainingR + 9, LAYOUT.trainingR, tr);
  const A = LAYOUT.arena;
  const da = Math.hypot(x - A.x, z - A.z) + vnoise(x * 0.2, z * 0.2, 81) * 1.6 * sstep(A.r, A.r + 3, Math.hypot(x - A.x, z - A.z));
  out.arena = sstep(A.r + 6, A.r + 1.5, da);
  out.arenaD = Math.hypot(x - A.x, z - A.z);
  const R = LAYOUT.ramp;
  const wx = sstep(R.hw + 3, R.hw, Math.abs(x - R.x));
  const wz = sstep(R.z0 - 4, R.z0 - 1, z) * sstep(R.z1 + 6, R.z1, z);
  out.ramp = wx * wz;
  out.rampT = Math.min(1, Math.max(0, (z - R.z0) / (R.z1 - R.z0)));
  return out;
}

const _z = {};
export function fullHeight(x, z) {
  let h = rawHeight(x, z);
  zones(x, z, _z);
  if (_z.camp > 0) h = h + (T.camps[_z.campIdx] - h) * _z.camp;
  if (_z.training > 0) h = h + (T.training - h) * _z.training;
  if (_z.arena > 0) h = h + (T.arena - h) * _z.arena;
  if (_z.ramp > 0) {
    const t = _z.rampT;
    const rh = T.arena + (T.rampEnd - T.arena) * (t * t * (3 - 2 * t));
    h = h + (rh - h) * _z.ramp;
  }
  const pw = pathWeight(x, z);
  if (pw > 0 && _z.arena < 0.5) h -= 0.14 * pw;
  if (villageMask(x, z) > 0) {
    const pads = VILLAGE.pads;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i]; const dx = x - p.x, dz = z - p.z;
      if (Math.abs(dx) > p.r + 3 || Math.abs(dz) > p.r + 3) continue;
      const w = sstep(p.r + 2.5, p.r, Math.hypot(dx, dz));
      if (w > 0) h = h + (T.pads[i] - h) * w;
    }
    const Pd = VILLAGE.pond;
    const dd = Math.hypot(x - Pd.x, z - Pd.z) / Pd.r + vnoise(x * 0.3, z * 0.3, 74) * 0.06;
    if (dd < 1.6) {
      const shape = dd < 1 ? T.pond - 0.12 - Pd.depth * (1 - dd * dd) : T.pond - 0.12 + (dd - 1) * 2.2;
      h = smin(h, shape, 0.6);
    }
  }
  return terraform(x, z, h, T, _z.arena);
}

// ---------------------------------------------------------------- build
export function buildTerrain(game) {
  const heights = new Float32Array(NV * NV);
  for (let j = 0; j < NV; j++) {
    const z = ORIGIN + j * CELL;
    for (let i = 0; i < NV; i++) heights[j * NV + i] = fullHeight(ORIGIN + i * CELL, z);
  }

  function getHeight(x, z) {
    let gx = (x - ORIGIN) / CELL, gz = (z - ORIGIN) / CELL;
    if (gx < 0) gx = 0; else if (gx > SEG - 1e-4) gx = SEG - 1e-4;
    if (gz < 0) gz = 0; else if (gz > SEG - 1e-4) gz = SEG - 1e-4;
    const i = gx | 0, j = gz | 0;
    const fx = gx - i, fz = gz - j;
    const k = j * NV + i;
    const h00 = heights[k], h10 = heights[k + 1], h01 = heights[k + NV], h11 = heights[k + NV + 1];
    if (fz >= fx) return h00 + (h11 - h01) * fx + (h01 - h00) * fz;
    return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
  }

  // normals (grid, central differences)
  const normals = new Float32Array(NV * NV * 3);
  const H = (i, j) => heights[Math.min(SEG, Math.max(0, j)) * NV + Math.min(SEG, Math.max(0, i))];
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    const nx = H(i - 1, j) - H(i + 1, j), nz = H(i, j - 1) - H(i, j + 1), ny = 2 * CELL;
    const l = Math.hypot(nx, ny, nz); const k = (j * NV + i) * 3;
    normals[k] = nx / l; normals[k + 1] = ny / l; normals[k + 2] = nz / l;
  }

  // colours + grass density
  const C = (hex) => new THREE.Color(hex);
  const P = {
    grassA: C(0x6fbf3c), grassB: C(0xa9d64a), grassDark: C(0x3f8f36), grassBlue: C(0x5aa85a),
    alpine: C(0x6c9a48), dry: C(0xc8cf5e),
    dirt: C(0xb8915c), dirtDark: C(0x8f6e46), path: C(0xcaa56e),
    sand: C(0xe8d49b), wetSand: C(0xa89a72), lakebed: C(0x6f8a6a),
    rock: C(0x9a8670), rockDark: C(0x6a5a4c), rockWarm: C(0xb48a62), rockBlue: C(0x7f8fae),
    snow: C(0xf5f8fc), stone: C(0xb9b4a6),
    cobble: C(0xc9bda4), cobbleDark: C(0x9a8f7c), lawn: C(0x7fc44a),
  };
  const colors = new Float32Array(NV * NV * 3);
  const colTexData = new Uint8Array(NV * NV * 4);
  const col = new THREE.Color(), tmp = new THREE.Color();
  const zz = {};
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    const x = ORIGIN + i * CELL, z = ORIGIN + j * CELL;
    const k = j * NV + i;
    const h = heights[k];
    const ny = normals[k * 3 + 1];
    const slope = 1 - ny;
    zones(x, z, zz);
    const n1 = fbm(x * 0.02, z * 0.02, 3, 101) * 0.5 + 0.5;
    const n2 = fbm(x * 0.06 + 9, z * 0.06, 3, 102) * 0.5 + 0.5;
    const n3 = vnoise(x * 0.25, z * 0.25, 103) * 0.5 + 0.5;
    const mf = mountainFactor(x, z);
    // grass
    col.copy(P.grassA).lerp(P.grassB, sstep(0.35, 0.8, n1));
    col.lerp(P.grassDark, sstep(0.55, 0.85, n2) * 0.55);
    col.lerp(P.dry, sstep(0.72, 0.95, n1 * 0.6 + n3 * 0.4) * 0.35);
    col.lerp(P.alpine, sstep(0.0, 0.6, mf) * 0.6);
    let dens = 1;
    // shore / sand
    const sandW = sstep(WATER_LEVEL + 1.4, WATER_LEVEL + 0.5, h + n3 * 0.4);
    if (sandW > 0) {
      tmp.copy(P.sand).lerp(P.wetSand, sstep(WATER_LEVEL + 0.1, WATER_LEVEL - 0.6, h));
      tmp.lerp(P.lakebed, sstep(WATER_LEVEL - 0.8, WATER_LEVEL - 2.5, h));
      col.lerp(tmp, sandW); dens *= 1 - sstep(0.2, 0.7, sandW);
    }
    // path
    const pw = pathWeight(x, z);
    if (pw > 0) { tmp.copy(P.path).lerp(P.dirt, n3 * 0.6); col.lerp(tmp, pw * 0.92); dens *= 1 - sstep(0.15, 0.6, pw); }
    // village: cobbled lanes + plaza, trimmed lawn, pond shore
    const vm = villageMask(x, z);
    if (vm > 0) {
      const lw = laneWeight(x, z);
      if (lw > 0) {
        const cob = Math.sin(x * 2.6 + Math.sin(z * 1.9) * 1.3) * Math.sin(z * 2.4 + Math.sin(x * 1.7)) * 0.5 + 0.5;
        tmp.copy(P.cobble).lerp(P.cobbleDark, sstep(0.55, 0.8, cob) * 0.6 + n3 * 0.2);
        col.lerp(tmp, lw * 0.95); dens *= 1 - sstep(0.1, 0.5, lw);
      }
      col.lerp(P.lawn, vm * 0.25 * (1 - lw));
      dens *= 1 - vm * 0.35;
      const Pd = VILLAGE.pond;
      const dpd = Math.hypot(x - Pd.x, z - Pd.z) / Pd.r;
      if (dpd < 1.35) { tmp.copy(P.sand).lerp(P.lakebed, sstep(1.0, 0.6, dpd)); col.lerp(tmp, sstep(1.35, 1.05, dpd)); dens *= sstep(1.05, 1.35, dpd); }
    }
    // camps: trampled dirt
    if (zz.camp > 0) {
      const c = LAYOUT.camps[zz.campIdx];
      const d = Math.hypot(x - c.x, z - c.z) + vnoise(x * 0.3, z * 0.3, 7) * 2.5;
      const w = sstep(c.r + 3, c.r - 3, d);
      tmp.copy(P.dirt).lerp(P.dirtDark, n3 * 0.7);
      col.lerp(tmp, w * 0.9); dens *= 1 - sstep(0.1, 0.6, w);
    }
    // training clearing: worn grass
    if (zz.training > 0) {
      const d = Math.hypot(x - LAYOUT.training[0], z - LAYOUT.training[1]);
      const w = sstep(8.5, 6, d + n3 * 1.5);
      col.lerp(P.dry, w * 0.35); dens *= 1 - w * 0.55;
    }
    // arena stone plateau
    if (zz.arena > 0.5) { col.lerp(P.stone, sstep(LAYOUT.arena.r + 2, LAYOUT.arena.r - 1, zz.arenaD)); dens *= sstep(LAYOUT.arena.r, LAYOUT.arena.r + 4, zz.arenaD); }
    // rock on slopes
    const rockW = sstep(0.17, 0.3, slope + (n3 - 0.5) * 0.08 + mf * 0.05);
    if (rockW > 0) {
      const band = Math.sin(h * 0.9 + n2 * 3) * 0.5 + 0.5;
      tmp.copy(P.rock).lerp(P.rockWarm, band * 0.55).lerp(P.rockDark, sstep(0.5, 0.9, n2) * 0.5);
      tmp.lerp(P.rockBlue, mf * 0.35);
      // green ledges break up moderate slopes (no uniform brown wall)
      const ledge = sstep(0.45, 0.72, n1 * 0.7 + n3 * 0.3) * (1 - sstep(0.32, 0.5, slope));
      tmp.lerp(P.grassDark, ledge * 0.75);
      col.lerp(tmp, rockW); dens *= 1 - rockW * (1 - ledge * 0.6);
    }
    // snow
    const snowW = sstep(50, 60, h + n2 * 10) * (1 - sstep(0.38, 0.6, slope));
    if (snowW > 0) { col.lerp(P.snow, snowW); dens *= 1 - snowW; }
    dens *= terraformColor(x, z, h, slope, n1, n2, n3, col);   // v3 zones (Mirwen, Elderwood, ledge, plateau, ramps)
    if (h < WATER_LEVEL + 0.35) dens = 0;
    if (vm > 0 && h < T.pond + 0.2 && Math.hypot(x - VILLAGE.pond.x, z - VILLAGE.pond.z) < VILLAGE.pond.r * 1.3) dens = 0;
    dens *= 1 - sstep(0.4, 0.95, mf) * 0.85;
    dens *= 1 - sstep(38, 48, h);
    colors[k * 3] = col.r; colors[k * 3 + 1] = col.g; colors[k * 3 + 2] = col.b;
    colTexData[k * 4] = Math.min(255, col.r * 255); colTexData[k * 4 + 1] = Math.min(255, col.g * 255);
    colTexData[k * 4 + 2] = Math.min(255, col.b * 255); colTexData[k * 4 + 3] = Math.max(0, Math.min(255, dens * 255));
  }

  // ---------------------------------------------------------------- mesh: v4 8×8 chunks, 2 LODs with skirts (PLAN §2.1 #4)
  // LOD0 = the full 1.5 m grid (same triangulation as getHeight), one Mesh per chunk (three.js frustum-culls its bounding
  // sphere), drawn only within NEAR_D of the camera. LOD1 = every 3rd grid line, all 64 chunks merged into ONE far mesh;
  // its vertex shader collapses the chunks LOD0 is drawing (uTerrNear mask), so the far terrain costs one draw call.
  // Skirts (both windings) hide the T-junction cracks between LODs.
  const geoFor = (ci, cj, step, chunkId) => {
    const c0 = ci * CHUNK_CELLS, r0 = cj * CHUNK_CELLS, n = CHUNK_CELLS / step + 1;
    const nv = n * n + 4 * (n - 1) * 2;   // grid + skirt rows (2 verts per edge segment end, shared per edge)
    const P = new Float32Array(nv * 3), N3 = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3), U = new Float32Array(nv * 2), A = new Float32Array(nv);
    let v = 0;
    const put = (gi, gj, dy) => {
      const k = gj * NV + gi;
      P[v * 3] = ORIGIN + gi * CELL; P[v * 3 + 1] = heights[k] + dy; P[v * 3 + 2] = ORIGIN + gj * CELL;
      N3[v * 3] = normals[k * 3]; N3[v * 3 + 1] = normals[k * 3 + 1]; N3[v * 3 + 2] = normals[k * 3 + 2];
      Cc[v * 3] = colors[k * 3]; Cc[v * 3 + 1] = colors[k * 3 + 1]; Cc[v * 3 + 2] = colors[k * 3 + 2];
      U[v * 2] = P[v * 3] / 7; U[v * 2 + 1] = P[v * 3 + 2] / 7; A[v] = chunkId;
      return v++;
    };
    const grid = new Int32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) grid[j * n + i] = put(c0 + i * step, r0 + j * step, 0);
    const idx = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = grid[j * n + i], b = grid[(j + 1) * n + i], c = grid[(j + 1) * n + i + 1], d = grid[j * n + i + 1];
      idx.push(a, b, c, a, c, d);
    }
    // skirts: each border edge gets a strip hanging SKIRT m below (emitted in both windings)
    const depth = step > 1 ? 3.0 : 1.2;
    const edge = (list) => {
      let prevTop = -1, prevBot = -1;
      for (const [gi, gj] of list) {
        const top = grid[((gj - r0) / step) * n + (gi - c0) / step];
        const bot = put(gi, gj, -depth);
        if (prevTop >= 0) idx.push(prevTop, prevBot, top, top, prevBot, bot, prevTop, top, prevBot, top, bot, prevBot);
        prevTop = top; prevBot = bot;
      }
    };
    const s0 = [], s1 = [], s2 = [], s3 = [];
    for (let t = 0; t < n; t++) {
      s0.push([c0 + t * step, r0]); s1.push([c0 + t * step, r0 + CHUNK_CELLS]);
      s2.push([c0, r0 + t * step]); s3.push([c0 + CHUNK_CELLS, r0 + t * step]);
    }
    edge(s0); edge(s1); edge(s2); edge(s3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P.subarray(0, v * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N3.subarray(0, v * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(Cc.subarray(0, v * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U.subarray(0, v * 2), 2));
    geo.setAttribute('aChunk', new THREE.BufferAttribute(A.subarray(0, v), 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    return geo;
  };

  // v4 terrain shader (PLAN §2.1 #4: the terrain is fragment-bound). Same look as the v3 4-step toon material
  // (gradient levels 0.42…1.0 of getGradientMap(4), hemisphere + sun, shadows, fog), but lighting terms are evaluated per
  // VERTEX (sun N·L as one varying stepped per fragment = crisp bands; hemisphere/ambient/point lights as one irradiance
  // varying): the fragment shader is one grain fetch where slope < 0.25 (cross-fade to triplanar + strata 0.25–0.35 and
  // above), the shadow mask, and ONE overlay-mask fetch (burn R/G, bless B, curse A) only inside uOverlayCircle.
  const grain = makeGrainTexture();
  const lv = (i) => Math.round(255 * (0.42 + 0.58 * (i / 3))) / 255;
  const burn = {
    uBurnTex: { value: null }, uBurnXform: { value: new THREE.Vector4(0, 0, 0, 0) }, uBurnTime: { value: 0 },
    uOverlayCircle: { value: new THREE.Vector4(0, 0, 0, 0) },
    uTerrNear: { value: Array.from({ length: CHUNKS * CHUNKS / 4 }, () => new THREE.Vector4()) },
  };
  {
    const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat); blank.needsUpdate = true;
    burn.uBurnTex.value = blank;
  }
  const mat = new THREE.ShaderMaterial({
    name: 'terrainV4', lights: true, fog: true, vertexColors: true,
    uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog]), burn, {
      uGrain: { value: grain }, uLevels: { value: new THREE.Vector4(lv(0), lv(1), lv(2), lv(3)) },
    }),
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      #include <shadowmap_pars_vertex>
      #include <lights_pars_begin>
      attribute float aChunk;
      uniform vec4 uTerrNear[${CHUNKS * CHUNKS / 4}];
      varying vec3 vTW; varying vec3 vTN; varying vec3 vCol; varying vec3 vInd; varying float vNL;
      void main() {
        #include <beginnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        if (aChunk >= 0.0) { int ci = int(aChunk + 0.5); if (uTerrNear[ci / 4][ci - (ci / 4) * 4] > 0.5) transformed = vec3(0.0, -2000.0, 0.0); }
        #include <project_vertex>
        #include <worldpos_vertex>
        #include <shadowmap_vertex>
        #include <fog_vertex>
        vTW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTN = normalize(mat3(modelMatrix) * objectNormal);
        vCol = color;
        vec3 nV = normalize(transformedNormal);
        vec3 ind = ambientLightColor;
        #if NUM_HEMI_LIGHTS > 0
          #pragma unroll_loop_start
          for (int i = 0; i < NUM_HEMI_LIGHTS; i++) ind += getHemisphereLightIrradiance(hemisphereLights[i], nV);
          #pragma unroll_loop_end
        #endif
        #if NUM_POINT_LIGHTS > 0
          PointLight pl; IncidentLight il;
          #pragma unroll_loop_start
          for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
            pl = pointLights[i]; getPointLightInfo(pl, mvPosition.xyz, il);
            ind += il.color * saturate(dot(nV, il.direction) * 0.5 + 0.5);
          }
          #pragma unroll_loop_end
        #endif
        vInd = ind * RECIPROCAL_PI;
        #if NUM_DIR_LIGHTS > 0
          vNL = dot(nV, directionalLights[0].direction);
        #else
          vNL = -1.0;
        #endif
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <packing>
      #include <fog_pars_fragment>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      // 5-tap PCF (centre + 4 diagonals at the light's shadow radius): terrain only, ~⅓ of the 17-tap PCF cost
      float terrShadow() {
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
          DirectionalLightShadow L = directionalLightShadows[0];
          vec4 sc = vDirectionalShadowCoord[0];
          sc.xyz /= sc.w; sc.z += L.shadowBias;
          if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
          vec2 d = L.shadowRadius / L.shadowMapSize;
          return (texture2DCompare(directionalShadowMap[0], sc.xy, sc.z) * 2.0
            + texture2DCompare(directionalShadowMap[0], sc.xy + vec2(-d.x, -d.y), sc.z) + texture2DCompare(directionalShadowMap[0], sc.xy + vec2(d.x, -d.y), sc.z)
            + texture2DCompare(directionalShadowMap[0], sc.xy + vec2(-d.x, d.y), sc.z) + texture2DCompare(directionalShadowMap[0], sc.xy + vec2(d.x, d.y), sc.z)) / 6.0;
        #else
          return 1.0;
        #endif
      }
      uniform sampler2D uGrain; uniform vec4 uLevels;
      uniform sampler2D uBurnTex; uniform vec4 uBurnXform; uniform float uBurnTime; uniform vec4 uOverlayCircle;
      varying vec3 vTW; varying vec3 vTN; varying vec3 vCol; varying vec3 vInd; varying float vNL;
      void main() {
        vec3 tn = normalize(vTN);
        float slope = 1.0 - clamp(tn.y, 0.0, 1.0);
        vec4 tx = texture2D(uGrain, vTW.xz / 7.0);
        vec3 albedo;
        if (slope > 0.25) {
          vec3 bw = pow(abs(tn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          // biplanar: top + the dominant side projection (2 fetches instead of 3)
          vec4 side = bw.z > bw.x ? texture2D(uGrain, vTW.xy / 7.0) : texture2D(uGrain, vTW.zy / 7.0);
          vec4 tri = mix(side, tx, bw.y / max(1e-3, bw.y + max(bw.x, bw.z)));
          tx = mix(tx, tri, smoothstep(0.25, 0.35, slope));
          albedo = vCol * tx.rgb;
          float band = sin(vTW.y * 1.3 + tx.r * 3.0 + sin(vTW.x * 0.05 + vTW.z * 0.07) * 2.0);
          float band2 = sin(vTW.y * 3.7 + 1.3);
          albedo *= 1.0 - smoothstep(0.35, 0.75, slope) * (0.09 + 0.07 * band + 0.03 * band2);
        } else albedo = vCol * tx.rgb;
        vec3 emissive = vec3(0.0);
        vec2 ovd = vTW.xz - uOverlayCircle.xy;
        if (dot(ovd, ovd) < uOverlayCircle.z * uOverlayCircle.z) {
          vec4 bt4 = texture2D(uBurnTex, (vTW.xz - uBurnXform.xy) * uBurnXform.zw); vec2 bt = bt4.rg;
          // v3 surface2: B = blessed (gold sheen, soft pulse), A = cursed (violet miasma, dark veins)
          float blessK = bt4.b * smoothstep(0.3, 0.7, tn.y);
          albedo = mix(albedo, albedo * vec3(1.18, 1.08, 0.78) + vec3(0.1, 0.08, 0.0), blessK * 0.7);
          emissive += vec3(1.0, 0.82, 0.38) * blessK * (0.18 + 0.1 * sin(uBurnTime * 2.4 + vTW.x * 0.6 + vTW.z * 0.5));
          float curseK = bt4.a;
          if (curseK > 0.004) {
            float vein = smoothstep(0.62, 0.95, sin(vTW.x * 2.3 + sin(vTW.z * 1.7) * 2.0) * sin(vTW.z * 2.1 + sin(vTW.x * 1.3) * 2.0) * 0.5 + 0.5);
            albedo = mix(albedo, vec3(0.2, 0.12, 0.28) + albedo * 0.25, curseK * 0.75);
            emissive += vec3(0.62, 0.22, 1.0) * curseK * vein * (0.35 + 0.25 * sin(uBurnTime * 3.1 + vTW.z));
          }
          if (bt.r + bt.g > 0.004) {
            float flat_ = smoothstep(0.55, 0.85, tn.y);
            float ch = smoothstep(0.05, 0.75, bt.r) * flat_;
            float speck = fract(sin(dot(floor(vTW.xz * 3.0), vec2(12.9898, 78.233))) * 43758.5453);
            albedo = mix(albedo, vec3(0.13, 0.11, 0.10) + speck * 0.05, ch * 0.85);
            emissive += vec3(1.0, 0.32, 0.05) * bt.g * flat_ * (0.55 + 0.35 * sin(uBurnTime * 9.0 + vTW.x * 1.7 + vTW.z * 1.3));
            emissive += vec3(0.9, 0.25, 0.04) * ch * step(0.92, speck) * (0.4 + 0.4 * sin(uBurnTime * 3.0 + speck * 40.0)) * (1.0 - bt.g) * smoothstep(0.6, 1.0, bt.r);
          }
        }
        vec3 light = vInd;
        #if NUM_DIR_LIGHTS > 0
          float u = vNL * 0.5 + 0.5;
          float g = u < 0.25 ? uLevels.x : (u < 0.5 ? uLevels.y : (u < 0.75 ? uLevels.z : uLevels.w));
          light += directionalLights[0].color * (g * (receiveShadow ? terrShadow() : 1.0) * RECIPROCAL_PI);
        #endif
        gl_FragColor = vec4(albedo * light + emissive, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  mat.customProgramCacheKey = () => 'terrainV4';
  const group = new THREE.Group(); group.name = 'terrain';
  // v4: terrain chunks draw after the renderOrder-0 opaques (flora, props, characters) so early-z rejects the ground they
  // cover; grass (−0.5) and opaque water (−0.4) still draw before it
  const chunks = [];
  const farParts = [];
  for (let cj = 0; cj < CHUNKS; cj++) for (let ci = 0; ci < CHUNKS; ci++) {
    const id = cj * CHUNKS + ci;
    const g0 = geoFor(ci, cj, 1, -1);
    const m = new THREE.Mesh(g0, mat);
    m.name = 'terrainChunk'; m.receiveShadow = true; m.castShadow = false; m.visible = false; m.renderOrder = 1;
    group.add(m);
    const bb = g0.boundingBox;
    chunks.push({ id, ci, cj, mesh: m, x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z,
      sphere: new THREE.Sphere().copy(g0.boundingSphere), box: bb.clone(), near: false, inView: false });
    farParts.push(geoFor(ci, cj, LOD_STEP, id));
  }
  const farGeo = mergeGeometries(farParts, false);
  for (const gq of farParts) gq.dispose();
  farGeo.computeBoundingSphere();
  const far = new THREE.Mesh(farGeo, mat);
  far.name = 'terrainFar'; far.receiveShadow = true; far.castShadow = false; far.frustumCulled = false; far.renderOrder = 1;
  group.add(far);
  game.scene.add(group);
  const mesh = group;

  // per-frame LOD + visibility (camera xz distance to the chunk AABB; frustum test only for the debug count)
  const tFrustum = new THREE.Frustum(), tPM = new THREE.Matrix4();
  // visible = LOD0 chunk meshes in view (one draw each); farInView = LOD1 chunks in view (all inside ONE far draw)
  const tStats = { total: CHUNKS * CHUNKS, visible: 0, near: 0, far: 0, farInView: 0, inView: 0, calls: 0 };
  const nearMask = burn.uTerrNear.value;
  function updateChunks(cam, nearD = NEAR_D) {
    tPM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    tFrustum.setFromProjectionMatrix(tPM);
    const px = cam.position.x, pz = cam.position.z, n2 = nearD * nearD;
    let vis = 0, nn = 0, ff = 0, nearAll = 0;
    for (let i = 0; i < chunks.length; i++) {
      const C = chunks[i];
      const dx = Math.max(C.x0 - px, 0, px - C.x1), dz = Math.max(C.z0 - pz, 0, pz - C.z1);
      const near = dx * dx + dz * dz < n2;
      const inView = tFrustum.intersectsBox(C.box);
      C.near = near; C.inView = inView;
      C.mesh.visible = near;
      nearMask[i >> 2].setComponent(i & 3, near ? 1 : 0);
      if (near) nearAll++;
      if (inView) { vis++; if (near) nn++; else ff++; }
    }
    tStats.inView = vis; tStats.visible = nn; tStats.near = nearAll; tStats.far = CHUNKS * CHUNKS - nearAll; tStats.farInView = ff; tStats.calls = nn + 1;
    return tStats;
  }

  const heightTex = new THREE.DataTexture(heights, NV, NV, THREE.RedFormat, THREE.FloatType);
  heightTex.minFilter = heightTex.magFilter = THREE.NearestFilter;
  heightTex.needsUpdate = true;
  const colorTex = new THREE.DataTexture(colTexData, NV, NV, THREE.RGBAFormat);
  colorTex.minFilter = colorTex.magFilter = THREE.LinearFilter;
  colorTex.needsUpdate = true;

  return { mesh, group, chunks, far, material: mat, updateChunks, chunkStats: tStats, heights, normals, getHeight, heightTex, colorTex, colTexData, mountainFactor, burn };
}

/** Painterly grain texture to break vertex colour flatness. */
function makeGrainTexture() {
  const S = 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(5);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S, y = rnd() * S, r = 2 + rnd() * 9;
    const v = 205 + rnd() * 50 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.18 + rnd() * 0.25})`;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath(); g.ellipse(x + ox, y + oy, r * 1.6, r, rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  }
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * S, y = rnd() * S;
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(190,190,190,0.3)';
    g.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;   // v4: anisotropic taps were ~15 % of the Elderwood frame (SwiftShader); the grain is subtle at grazing angles
  return tex;
}

/** Far mountain silhouette ring, hazed by fog. */
export function buildDistantMountains(game) {
  const SEGS = 256, ROWS = 5;
  const pos = [], colors = [], index = [];
  const c0 = new THREE.Color(0x6f8aa6), c1 = new THREE.Color(0x92a7bd), snow = new THREE.Color(0xeef3fa);
  const c = new THREE.Color();
  for (let r = 0; r < ROWS; r++) {
    const t = r / (ROWS - 1);
    for (let s = 0; s <= SEGS; s++) {
      const a = (s / SEGS) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const peak = 70 + ridge(ca * 3 + 10, sa * 3 + 10, 5, 5) * 150 + fbm(ca * 9, sa * 9, 2, 6) * 20;
      const rad = 560 - t * 260;
      const prof = Math.sin(t * Math.PI) ** 0.8;
      const y = -30 + prof * peak * (0.7 + 0.3 * (1 - t));
      pos.push(ca * rad, y, sa * rad);
      c.copy(c0).lerp(c1, t * 0.6);
      if (y > 120) c.lerp(snow, Math.min(1, (y - 120) / 40));
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < ROWS - 1; r++) for (let s = 0; s < SEGS; s++) {
    const a = r * (SEGS + 1) + s, b = a + 1, cc = a + SEGS + 1, d = cc + 1;
    index.push(a, cc, b, b, cc, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0.5, 0.6, 0.4).normalize() }, uHaze: { value: new THREE.Color(0xd4f0ff) } },
    vertexShader: /* glsl */`
      varying vec3 vCol; varying vec3 vN; varying float vY;
      void main(){ vCol = color; vN = normal; vY = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSun; uniform vec3 uHaze; varying vec3 vCol; varying vec3 vN; varying float vY;
      void main(){
        float l = dot(normalize(vN), uSun);
        float band = l > 0.25 ? 1.0 : (l > -0.1 ? 0.82 : 0.68);
        vec3 c = vCol * band;
        float haze = 0.42 + 0.4 * (1.0 - smoothstep(-10.0, 160.0, vY));
        gl_FragColor = vec4(mix(c, uHaze, haze), 1.0);
      }`,
    vertexColors: true, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'farMountains';
  mesh.renderOrder = 99;   // v4: after the terrain / props (early-z), before the sky
  game.scene.add(mesh);
  return mesh;
}

/** GLSL: exact terrain height from the float height texture (needs `uniform sampler2D uHeightTex`). */
export const TERRAIN_GLSL = /* glsl */`
  float terrainH(vec2 p){
    vec2 g = (p - vec2(${ORIGIN.toFixed(4)})) / ${CELL.toFixed(6)};
    g = clamp(g, vec2(0.0), vec2(${(NV - 1.001).toFixed(4)}));
    ivec2 c = ivec2(floor(g)); vec2 f = g - vec2(c);
    float h00 = texelFetch(uHeightTex, c, 0).r;
    float h10 = texelFetch(uHeightTex, c + ivec2(1,0), 0).r;
    float h01 = texelFetch(uHeightTex, c + ivec2(0,1), 0).r;
    float h11 = texelFetch(uHeightTex, c + ivec2(1,1), 0).r;
    if (f.y >= f.x) return h00 + (h11 - h01) * f.x + (h01 - h00) * f.y;
    return h00 + (h10 - h00) * f.x + (h11 - h10) * f.y;
  }
`;

/**
 * v4 (world.heightField.glsl): exact terrain height at world xz from the R32F height texture passed as `tex`
 * (vertex-centred texels, triangle interpolation identical to getHeight). Usable in vertex and fragment shaders.
 */
export const HEIGHTFIELD_GLSL = /* glsl */`
  float awHeightField(sampler2D tex, vec2 xz){
    vec2 g = (xz - vec2(${ORIGIN.toFixed(4)})) / ${CELL.toFixed(6)};
    g = clamp(g, vec2(0.0), vec2(${(SEG - 1e-4).toFixed(4)}));
    ivec2 c = ivec2(floor(g)); vec2 f = g - vec2(c);
    float h00 = texelFetch(tex, c, 0).r;
    float h10 = texelFetch(tex, c + ivec2(1,0), 0).r;
    float h01 = texelFetch(tex, c + ivec2(0,1), 0).r;
    float h11 = texelFetch(tex, c + ivec2(1,1), 0).r;
    if (f.y >= f.x) return h00 + (h11 - h01) * f.x + (h01 - h00) * f.y;
    return h00 + (h10 - h00) * f.x + (h11 - h10) * f.y;
  }
`;
