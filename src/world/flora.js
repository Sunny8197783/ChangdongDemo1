// Trees (puffy BotW canopies), conifers, bushes and rocks — all instanced, with colliders.
import * as THREE from 'three';
import { toonMat } from '../core/utils.js';
import { mulberry32, fbm, sstep, distPolyline } from './noise.js';
import { part, merge, mat4, instanced, SWAY_GLSL } from './prefab.js';
import { LAYOUT, WATER_LEVEL, pathWeight } from './terrain.js';

const col = (hex) => new THREE.Color(hex);

function swayMaterial(uTime, opts = {}) {
  const m = toonMat(0xffffff, { vertexColors: true, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\n' + SWAY_GLSL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\ntransformed += swayOffset(position, instanceMatrix);\n#endif');
  };
  m.customProgramCacheKey = () => 'sway';
  return m;
}

function canopyColor(bottom, top, yMin, yMax) {
  const b = col(bottom), t = col(top);
  return (x, y, z, c) => {
    const k = sstep(yMin, yMax, y);
    c.copy(b).lerp(t, k);
  };
}

function deciduousVariant(rnd, v) {
  const parts = [];
  const H = 2.6 + rnd() * 1.2;
  const lean = (rnd() - 0.5) * 0.15;
  parts.push(part(new THREE.CylinderGeometry(0.2, 0.36, H + 0.6, 7, 3), 0x7a5634, mat4(0, (H + 0.6) / 2 - 0.3, 0, lean, 0, lean * 0.5)));
  // branches
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    parts.push(part(new THREE.CylinderGeometry(0.06, 0.12, 1.5, 5), 0x6e4b2c,
      mat4(Math.cos(a) * 0.45, H - 0.2 + rnd() * 0.6, Math.sin(a) * 0.45, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9)));
  }
  const blobs = v === 2 ? 7 : 6 + (v % 2);
  const yTop = H + 3.4;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rnd();
    const ring = i === 0 ? 0 : 1.2 + rnd() * 0.6;
    const r = i === 0 ? 2.1 + rnd() * 0.3 : 1.35 + rnd() * 0.5;
    const y = i === 0 ? H + 1.9 : H + 0.9 + rnd() * 1.4;
    parts.push(part(new THREE.IcosahedronGeometry(r, 1), canopyColor(0x3f8a34, 0x9bd655, H, yTop),
      mat4(Math.cos(a) * ring, y, Math.sin(a) * ring, 0, 0, 0, 1, 0.85, 1), { jitter: 0.25 }));
  }
  return merge(parts);
}

function pineVariant(rnd) {
  const parts = [];
  const H = 7 + rnd() * 2;
  parts.push(part(new THREE.CylinderGeometry(0.14, 0.3, H * 0.5, 6), 0x5e4027, mat4(0, H * 0.25 - 0.2, 0)));
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 2.2 * (1 - t * 0.68);
    const h = 2.9 - t * 0.9;
    const y = 1.6 + t * (H - 3.6) + h / 2;
    parts.push(part(new THREE.ConeGeometry(r, h, 9, 1), canopyColor(0x245a3e, 0x4f9254, y - h / 2, y + h / 2),
      mat4(0, y, 0, 0, rnd() * 3, 0), { jitter: 0.18 }));
  }
  return merge(parts);
}

function bushVariant(rnd) {
  const parts = [];
  const n = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = i === 0 ? 0 : 0.5 + rnd() * 0.3;
    const r = i === 0 ? 0.85 : 0.55 + rnd() * 0.25;
    parts.push(part(new THREE.IcosahedronGeometry(r, 1), canopyColor(0x3c7f31, 0x8fca4e, -0.2, 1.3),
      mat4(Math.cos(a) * d, r * 0.6, Math.sin(a) * d, 0, 0, 0, 1, 0.8, 1), { jitter: 0.18 }));
  }
  return merge(parts);
}

function rockVariant(rnd, mossy = true) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const moss = col(0x6fa548), grey = col(0x9a948a), dark = col(0x77716a), warm = col(0xa99278);
  const p = part(g, (x, y, z, c) => {
    c.copy(grey).lerp(dark, Math.max(0, -y) * 0.8).lerp(warm, (Math.sin(x * 3 + z * 2) * 0.5 + 0.5) * 0.3);
    if (mossy && y > 0.35) c.lerp(moss, sstep(0.35, 0.8, y) * 0.85);
  }, mat4(0, 0, 0, 0, 0, 0, 1.25 + rnd() * 0.4, 0.65 + rnd() * 0.3, 1), { jitter: 0.55 });
  return p;
}

// Split instances into spatial chunks (each its own InstancedMesh + bounding sphere) so frustum culling works
// for both the main and the (small, player-following) shadow camera.
const CHUNKS = [];
function chunked(group, geo, mats, opts, size = 80, small = false) {
  const bins = new Map();
  for (let i = 0; i < mats.length; i++) {
    const e = mats[i].elements;
    const k = Math.floor(e[12] / size) + ',' + Math.floor(e[14] / size);
    let b = bins.get(k); if (!b) bins.set(k, b = { m: [], c: [] });
    b.m.push(mats[i]); if (opts.colors) b.c.push(opts.colors[i]);
  }
  for (const b of bins.values()) {
    const m = instanced(group, geo, b.m, { ...opts, colors: opts.colors ? b.c : undefined });
    CHUNKS.push({ mesh: m, outline: m.userData.outline || null, small, c: m.boundingSphere.center, r: m.boundingSphere.radius });
  }
}

export function buildFlora(game, world, uTime) {
  const { getHeight, colliders } = world;
  const group = new THREE.Group(); group.name = 'flora';
  game.scene.add(group);
  const rnd = mulberry32(2024);
  const nrm = new THREE.Vector3();

  const occupied = new Map();
  const key = (x, z) => `${Math.floor(x / 3)},${Math.floor(z / 3)}`;
  function spaced(x, z, minD) {
    const cx = Math.floor(x / 3), cz = Math.floor(z / 3);
    const n = Math.ceil(minD / 3);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const arr = occupied.get(`${cx + i},${cz + j}`);
      if (arr) for (const p of arr) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < (minD + p[2]) ** 2 * 0.25) return false;
    }
    return true;
  }
  function occupy(x, z, r) { const k = key(x, z); let a = occupied.get(k); if (!a) occupied.set(k, a = []); a.push([x, z, r * 2]); }

  const L = LAYOUT;
  function allowed(x, z, margin, maxSlope = 0.22, maxR = 172) {
    const r = Math.hypot(x, z);
    if (r > maxR) return false;
    const h = getHeight(x, z);
    if (h < WATER_LEVEL + 0.9) return false;
    world.getNormal(x, z, nrm);
    if (1 - nrm.y > maxSlope) return false;
    for (const c of L.camps) if (Math.hypot(x - c.x, z - c.z) < c.r + 5 + margin) return false;
    if (Math.hypot(x - L.training[0], z - L.training[1]) < L.trainingR + 4 + margin) return false;
    if (Math.hypot(x - L.spawn[0], z - L.spawn[1]) < 9 + margin) return false;
    if (Math.abs(x) < 16 && z > 60 && z < 135) return false; // keep the spawn vista open
    if (Math.hypot(x - L.arena.x, z - L.arena.z) < L.arena.r + 9 + margin) return false;
    if (Math.abs(x - L.ramp.x) < L.ramp.hw + 4 + margin && z > L.ramp.z0 - 2 && z < L.ramp.z1 + 6) return false;
    if (distPolyline(x, z, L.river) < 7 + margin) return false;
    if (pathWeight(x, z) > 0.01) return false;
    for (const k in L.paths) if (distPolyline(x, z, L.paths[k]) < 3.2 + margin) return false;
    return true;
  }
  const forest = (x, z) => fbm(x * 0.017 + 40, z * 0.017 - 13, 3, 300);

  // ---------------- deciduous trees
  const decGeos = [0, 1, 2].map((v) => deciduousVariant(rnd, v));
  const decMats = [[], [], []], decCols = [[], [], []];
  const tint = new THREE.Color();
  const addDec = (x, z, s) => {
    const v = Math.floor(rnd() * 3);
    const y = getHeight(x, z) - 0.25;
    decMats[v].push(mat4(x, y, z, 0, rnd() * Math.PI * 2, 0, s, s * (0.9 + rnd() * 0.2), s));
    const golden = rnd() < 0.07;
    if (golden) tint.setRGB(1.35, 1.05, 0.45); else tint.setRGB(0.9 + rnd() * 0.18, 0.92 + rnd() * 0.16, 0.85 + rnd() * 0.2);
    decCols[v].push(tint.clone());
    colliders.push({ x, z, r: 0.42 * s + 0.1, kind: 'tree' });
    occupy(x, z, 2.2 * s);
  };
  // big lone trees
  const lone = [[-24, 92], [30, 112], [-62, 70], [66, 30], [-40, -40], [42, -30], [-100, -40], [120, 10], [-20, -100], [70, -80], [-105, 40], [95, 90]];
  for (const [x, z] of lone) if (allowed(x, z, 2)) addDec(x, z, 1.9 + rnd() * 0.5);
  let tries = 0, placed = 0;
  while (tries++ < 14000 && placed < 230) {
    const x = (rnd() - 0.5) * 330, z = (rnd() - 0.5) * 330;
    const f = forest(x, z);
    const p = f > 0.22 ? 0.9 : f > 0.1 ? 0.18 : 0.015;
    if (rnd() > p) continue;
    const r = Math.hypot(x, z);
    if (r > 150) continue;
    const s = 0.85 + rnd() * 0.55;
    if (!allowed(x, z, 1.5)) continue;
    if (!spaced(x, z, 4.4 * s)) continue;
    addDec(x, z, s); placed++;
  }
  for (let v = 0; v < 3; v++) if (decMats[v].length) {
    chunked(group, decGeos[v], decMats[v], { colors: decCols[v], material: swayMaterial(uTime), outline: 0.045, outlineColor: 0x1d3318, sway: uTime });
  }

  // ---------------- pines: foot of mountains + clusters
  const pineGeos = [0, 1].map(() => pineVariant(rnd));
  const pineMats = [[], []], pineCols = [[], []];
  tries = 0; placed = 0;
  while (tries++ < 20000 && placed < 520) {
    const a = rnd() * Math.PI * 2;
    const forestCluster = rnd() < 0.25;
    const rr = forestCluster ? 60 + rnd() * 90 : 118 + rnd() * 95;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (Math.abs(x) > 178 || Math.abs(z) > 178) continue;
    if (forestCluster && forest(x, z) < 0.12) continue;
    const s = 0.8 + rnd() * 0.7;
    if (!allowed(x, z, 1, 0.42, 250)) continue;
    if (!spaced(x, z, 3.2 * s)) continue;
    const v = rnd() < 0.5 ? 0 : 1;
    const y = getHeight(x, z) - 0.3;
    pineMats[v].push(mat4(x, y, z, (rnd() - 0.5) * 0.06, rnd() * 6.28, (rnd() - 0.5) * 0.06, s, s * (0.85 + rnd() * 0.35), s));
    pineCols[v].push(new THREE.Color().setRGB(0.88 + rnd() * 0.2, 0.92 + rnd() * 0.15, 0.9 + rnd() * 0.2));
    if (Math.hypot(x, z) < 174) colliders.push({ x, z, r: 0.35 * s + 0.1, kind: 'tree' });
    occupy(x, z, 1.8 * s); placed++;
  }
  for (let v = 0; v < 2; v++) if (pineMats[v].length) {
    chunked(group, pineGeos[v], pineMats[v], { colors: pineCols[v], material: swayMaterial(uTime), outline: 0.04, outlineColor: 0x14281c, sway: uTime });
  }

  // ---------------- bushes
  const bushGeo = bushVariant(rnd);
  const bushM = [], bushC = [];
  tries = 0;
  while (tries++ < 9000 && bushM.length < 300) {
    const x = (rnd() - 0.5) * 320, z = (rnd() - 0.5) * 320;
    const f = forest(x, z);
    if (f < 0.0 && rnd() > 0.25) continue;
    if (!allowed(x, z, 0, 0.3, 160)) continue;
    if (!spaced(x, z, 1.8)) continue;
    const s = 0.7 + rnd() * 0.7;
    bushM.push(mat4(x, getHeight(x, z) - 0.15, z, 0, rnd() * 6.28, 0, s, s * (0.8 + rnd() * 0.4), s));
    bushC.push(new THREE.Color().setRGB(0.88 + rnd() * 0.22, 0.9 + rnd() * 0.18, 0.85 + rnd() * 0.2));
    occupy(x, z, 1 * s);
  }
  chunked(group, bushGeo, bushM, { colors: bushC, material: swayMaterial(uTime), outline: 0.035, outlineColor: 0x1d3318, sway: uTime, cast: false }, 80, true);

  // ---------------- rocks
  const rockGeos = [0, 1, 2].map((i) => rockVariant(rnd, i !== 2));
  const rockMat = toonMat(0xffffff, { vertexColors: true, flatShading: true });
  const rockM = [[], [], []], rockS = [[], [], []];
  const addRock = (x, z, s, sink = 0.3) => {
    const v = Math.floor(rnd() * 3);
    (s > 0.7 ? rockM : rockS)[v].push(mat4(x, getHeight(x, z) - s * sink, z, (rnd() - 0.5) * 0.4, rnd() * 6.28, (rnd() - 0.5) * 0.4, s, s * (0.7 + rnd() * 0.5), s));
    if (s > 0.7) colliders.push({ x, z, r: s * 1.05, kind: 'rock' });
    occupy(x, z, s * 1.2);
  };
  tries = 0; let big = 0;
  while (tries++ < 8000 && big < 95) {
    const x = (rnd() - 0.5) * 330, z = (rnd() - 0.5) * 330;
    if (!allowed(x, z, 1, 0.5, 168)) continue;
    const s = 0.9 + rnd() * rnd() * 2.6;
    if (!spaced(x, z, s * 2.5)) continue;
    addRock(x, z, s, 0.35); big++;
    // little satellites
    const k = Math.floor(rnd() * 4);
    for (let i = 0; i < k; i++) {
      const a = rnd() * 6.28, d = s * 1.3 + rnd() * 1.5;
      addRock(x + Math.cos(a) * d, z + Math.sin(a) * d, 0.25 + rnd() * 0.35, 0.25);
    }
  }
  tries = 0; let small = 0;
  while (tries++ < 6000 && small < 260) {
    const x = (rnd() - 0.5) * 330, z = (rnd() - 0.5) * 330;
    const h = getHeight(x, z);
    if (h < WATER_LEVEL - 0.5) continue;
    if (Math.hypot(x, z) > 168) continue;
    if (!allowed(x, z, -2, 0.6, 168) && rnd() > 0.15) continue;
    addRock(x, z, 0.2 + rnd() * 0.45, 0.25); small++;
  }
  // stepping stones at the ford
  const F = LAYOUT.ford;
  for (let i = -3; i <= 3; i++) {
    const x = F.x + i * 1.35 + (rnd() - 0.5) * 0.4, z = F.z - i * 0.6 + (rnd() - 0.5) * 0.4;
    const v = 2;
    rockM[v].push(mat4(x, WATER_LEVEL - 0.25, z, 0, rnd() * 6, 0, 0.62, 0.38, 0.55));
  }
  for (let v = 0; v < 3; v++) if (rockM[v].length) chunked(group, rockGeos[v], rockM[v], { material: rockMat, outline: 0.035, outlineColor: 0x2a2520 });
  for (let v = 0; v < 3; v++) if (rockS[v].length) chunked(group, rockGeos[v], rockS[v], { material: rockMat, outline: 0.03, outlineColor: 0x2a2520, cast: false }, 80, true);

  // distance LOD per chunk: small props vanish far away, outlines (sub-pixel there) drop beyond ~150 m
  const chunks = CHUNKS.splice(0);
  function update(cam) {
    const p = cam.position;
    for (const k of chunks) {
      const d = Math.hypot(k.c.x - p.x, k.c.z - p.z) - k.r;
      k.mesh.visible = !(k.small && d > 100);
      if (k.outline) k.outline.visible = k.mesh.visible && d < 150;
    }
  }
  return { group, update };
}
