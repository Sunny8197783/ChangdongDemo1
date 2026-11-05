// Trees (puffy BotW canopies), conifers, bushes and rocks — all instanced, with colliders.
import * as THREE from 'three';
import { toonMat } from '../core/utils.js';
import { mulberry32, fbm, sstep, distPolyline } from './noise.js';
import { part, merge, mat4, outlineMat, occludable, SWAY_GLSL } from './prefab.js';
import { LAYOUT, WATER_LEVEL, pathWeight, villageMask } from './terrain.js';
import { VILLAGE } from './villageLayout.js';
import { floraBlocked, elderwoodWeight } from './terraform.js';

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

// Variants take a seed (own RNG) and an LOD level so the far LOD has the same silhouette with fewer triangles.
function deciduousVariant(seed, v, lod = 0) {
  const rnd = mulberry32(seed);
  const parts = [];
  const H = 2.6 + rnd() * 1.2;
  const lean = (rnd() - 0.5) * 0.15;
  parts.push(part(new THREE.CylinderGeometry(0.2, 0.36, H + 0.6, lod ? 5 : 7, lod ? 1 : 3), 0x7a5634, mat4(0, (H + 0.6) / 2 - 0.3, 0, lean, 0, lean * 0.5)));
  // branches
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2, by = rnd();
    if (!lod) parts.push(part(new THREE.CylinderGeometry(0.06, 0.12, 1.5, 5), 0x6e4b2c,
      mat4(Math.cos(a) * 0.45, H - 0.2 + by * 0.6, Math.sin(a) * 0.45, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9)));
  }
  const blobs = v === 2 ? 7 : 6 + (v % 2);
  const yTop = H + 3.4;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rnd();
    const ring = i === 0 ? 0 : 1.2 + rnd() * 0.6;
    const r = i === 0 ? 2.1 + rnd() * 0.3 : 1.35 + rnd() * 0.5;
    const y = i === 0 ? H + 1.9 : H + 0.9 + rnd() * 1.4;
    parts.push(part(new THREE.IcosahedronGeometry(r * (lod ? 1.06 : 1), lod ? 0 : 1), canopyColor(0x3f8a34, 0x9bd655, H, yTop),
      mat4(Math.cos(a) * ring, y, Math.sin(a) * ring, 0, 0, 0, 1, 0.85, 1), { jitter: lod ? 0.12 : 0.25 }));
  }
  return merge(parts);
}

function pineVariant(seed, lod = 0) {
  const rnd = mulberry32(seed);
  const parts = [];
  const H = 7 + rnd() * 2;
  parts.push(part(new THREE.CylinderGeometry(0.14, 0.3, H * 0.5, lod ? 4 : 6), 0x5e4027, mat4(0, H * 0.25 - 0.2, 0)));
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = 2.2 * (1 - t * 0.68);
    const h = 2.9 - t * 0.9;
    const y = 1.6 + t * (H - 3.6) + h / 2;
    parts.push(part(new THREE.ConeGeometry(r, h, lod ? 6 : 9, 1, lod > 0), canopyColor(0x245a3e, 0x4f9254, y - h / 2, y + h / 2),
      mat4(0, y, 0, 0, rnd() * 3, 0), { jitter: lod ? 0.1 : 0.18 }));
  }
  return merge(parts);
}

function bushVariant(seed, lod = 0) {
  const rnd = mulberry32(seed);
  const parts = [];
  const n = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = i === 0 ? 0 : 0.5 + rnd() * 0.3;
    const r = i === 0 ? 0.85 : 0.55 + rnd() * 0.25;
    parts.push(part(new THREE.IcosahedronGeometry(r, lod ? 0 : 1), canopyColor(0x3c7f31, 0x8fca4e, -0.2, 1.3),
      mat4(Math.cos(a) * d, r * 0.6, Math.sin(a) * d, 0, 0, 0, 1, 0.8, 1), { jitter: lod ? 0.1 : 0.18 }));
  }
  return merge(parts);
}

function rockVariant(seed, mossy = true, lod = 0) {
  const rnd = mulberry32(seed);
  const g = new THREE.IcosahedronGeometry(1, lod ? 0 : 1);
  const moss = col(0x6fa548), grey = col(0x9a948a), dark = col(0x77716a), warm = col(0xa99278);
  const p = part(g, (x, y, z, c) => {
    c.copy(grey).lerp(dark, Math.max(0, -y) * 0.8).lerp(warm, (Math.sin(x * 3 + z * 2) * 0.5 + 0.5) * 0.3);
    if (mossy && y > 0.35) c.lerp(moss, sstep(0.35, 0.8, y) * 0.85);
  }, mat4(0, 0, 0, 0, 0, 0, 1.25 + rnd() * 0.4, 0.65 + rnd() * 0.3, 1), { jitter: lod ? 0.35 : 0.55 });
  return p;
}

// Per-instance culled sets: ONE InstancedMesh per variant holding only the instances inside the (padded) camera
// frustum and draw distance, a far-LOD InstancedMesh, and an outline InstancedMesh within the outline distance.
// v4 (PLAN §2.6/§2.7): the scene meshes never cast; shadows come from ONE shadow-only InstancedMesh per family
// (deciduous / pine / rock) using the family's far-LOD geometry, on layer SHADOW_LAYER (seen by the sun's shadow camera
// only), holding the instances within the caster radius of the player (rocks: near only). Uploads are live ranges only
// (addUpdateRange) and skipped when the culled set did not change.
export const SHADOW_LAYER = 1;
const SETS = [];
const _sph = new THREE.Sphere();

// ---- texture-indexed instancing (v4 uploads): every set keeps ALL its instance matrices + colours in one static
// RGBA32F texture (5 texels per instance) and the static instanceMatrix; a culled draw only uploads a Float32
// index list (`awIdx`, 4 B per drawn instance, live range). The patched vertex shader replaces instanceMatrix /
// instanceColor by the fetched values (includes expanded first, so every chunk that reads them is covered).
function expandIncludes(src) {
  return src.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (m, name) => {
    const c = THREE.ShaderChunk[name];
    return c === undefined ? m : expandIncludes(c);
  });
}
const INST_HEAD = /* glsl */`
  uniform highp sampler2D uInstTex; attribute float awIdx;
  mat4 awInstM; vec3 awInstC;
  void awInstFetch() {
    int i = int(awIdx + 0.5);
    awInstM = mat4(texelFetch(uInstTex, ivec2(0, i), 0), texelFetch(uInstTex, ivec2(1, i), 0), texelFetch(uInstTex, ivec2(2, i), 0), texelFetch(uInstTex, ivec2(3, i), 0));
    awInstC = texelFetch(uInstTex, ivec2(4, i), 0).rgb;
  }
`;
function texInstanced(mat, uTex) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.uniforms.uInstTex = uTex;
    let vs = expandIncludes(sh.vertexShader).replace(/\binstanceMatrix\b/g, 'awInstM').replace(/\binstanceColor\b/g, 'awInstC');
    vs = vs.replace(/void\s+main\s*\(\s*\)\s*\{/, (m) => m + '\n  awInstFetch();');
    sh.vertexShader = INST_HEAD + vs;
  };
  mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|awinst'; };
  return mat;
}
function instTexture(src, srcCol, n) {
  const data = new Float32Array(5 * 4 * Math.max(1, n));
  for (let i = 0; i < n; i++) {
    data.set(src.subarray(i * 16, i * 16 + 16), i * 20);
    if (srcCol) { data[i * 20 + 16] = srcCol[i * 3]; data[i * 20 + 17] = srcCol[i * 3 + 1]; data[i * 20 + 18] = srcCol[i * 3 + 2]; }
    else { data[i * 20 + 16] = data[i * 20 + 17] = data[i * 20 + 18] = 1; }
    data[i * 20 + 19] = 1;
  }
  const t = new THREE.DataTexture(data, 5, Math.max(1, n), THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
/** Geometry view sharing every attribute of `geo` + its own instanced index attribute. */
function indexedGeo(geo, n) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = geo.index;
  for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
  g.boundingSphere = geo.boundingSphere; g.boundingBox = geo.boundingBox;
  const idx = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n)), 1);
  idx.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('awIdx', idx);
  return g;
}
function compactMesh(group, geo, material, n, src, srcCol, opts = {}) {
  const m = new THREE.InstancedMesh(geo, material, n);
  m.instanceMatrix.array.set(src.subarray(0, n * 16)); m.instanceMatrix.needsUpdate = true;   // static (raycasts; uploaded once)
  if (srcCol) { m.instanceColor = new THREE.InstancedBufferAttribute(srcCol.slice(0, n * 3), 3); }
  m.frustumCulled = false; m.count = 0;
  m.castShadow = !!opts.cast; m.receiveShadow = opts.receive !== false;
  if (opts.layer != null) m.layers.set(opts.layer);
  m.matrixAutoUpdate = false;
  group.add(m);
  return m;
}
function chunked(group, geo, mats, opts, _size = 80, small = false) {
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const n = mats.length;
  const cols = opts.colors;
  const src = new Float32Array(n * 16), cen = new Float32Array(n * 4);
  const srcCol = cols ? new Float32Array(n * 3) : null;
  const bs = geo.boundingSphere;
  for (let i = 0; i < n; i++) {
    const e = mats[i].elements; src.set(e, i * 16);
    const sc = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
    cen[i * 4] = e[12] + bs.center.x * sc; cen[i * 4 + 1] = e[13] + bs.center.y * sc; cen[i * 4 + 2] = e[14] + bs.center.z * sc; cen[i * 4 + 3] = bs.radius * sc;
    if (srcCol) { const c = cols[i]; srcCol[i * 3] = c.r; srcCol[i * 3 + 1] = c.g; srcCol[i * 3 + 2] = c.b; }
  }
  const uTex = { value: instTexture(src, srcCol, n) };
  const base = typeof opts.material === 'function' ? opts.material() : (opts.material || toonMat(0xffffff, { vertexColors: true }));
  const material = texInstanced(occludable(base), uTex);
  const mesh = compactMesh(group, indexedGeo(geo, n), material, n, src, srcCol);
  const far = opts.lodGeo ? compactMesh(group, indexedGeo(opts.lodGeo, n), material, n, src, srcCol) : null;
  let outline = null;
  if (opts.outline) {
    const om0 = outlineMat(opts.outline, opts.outlineColor ?? 0x1a1410, opts.sway);
    const om = om0.clone(); for (const k in om0.uniforms) om.uniforms[k] = om0.uniforms[k];   // shared uniform objects (OCC, time)
    outline = new THREE.InstancedMesh(indexedGeo(geo, n), texInstanced(om, uTex), n);
    outline.frustumCulled = false; outline.castShadow = false; outline.receiveShadow = false; outline.raycast = () => {};
    outline.count = 0; outline.matrixAutoUpdate = false;
    group.add(outline);
  }
  SETS.push({ mesh, far, outline, n, src, cen, srcCol, small, lodD: small ? 35 : 70, family: opts.cast === false ? null : (opts.family || null),
    shadowGeo: opts.lodGeo || geo, hN: -1, hF: -1, hO: -1, famBase: 0 });
}

/** Live-range upload of the first k indices (skipped when count and content hash are unchanged). */
function fin(m, k, hash, S, key) {
  if (!m) return 0;
  if (S[key] === hash && m.count === k) return 0;
  S[key] = hash;
  m.count = k; m.visible = k > 0;
  const A = m.geometry.attributes.awIdx; A.clearUpdateRanges(); if (k) { A.addUpdateRange(0, k); A.needsUpdate = true; }
  return k;
}
function refreshSet(S, cam, frustum, maxD, outD) {
  const { mesh, far, outline, n, cen } = S;
  const dst = mesh.geometry.attributes.awIdx.array;
  const fdst = far ? far.geometry.attributes.awIdx.array : null;
  const odst = outline ? outline.geometry.attributes.awIdx.array : null;
  const px = cam.position.x, pz = cam.position.z;
  const maxD2 = maxD * maxD, outD2 = outD * outD, lod2 = S.lodD * S.lodD;
  let c = 0, fc = 0, oc = 0, hn = 7, hf = 7, ho = 7;
  for (let i = 0; i < n; i++) {
    const x = cen[i * 4], y = cen[i * 4 + 1], z = cen[i * 4 + 2], r = cen[i * 4 + 3];
    const dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz;
    if (d2 > maxD2) continue;
    _sph.center.set(x, y, z); _sph.radius = r + 2;
    if (!frustum.intersectsSphere(_sph)) continue;
    if (far && d2 > lod2) { fdst[fc++] = i; hf = (hf * 31 + i) | 0; }
    else { dst[c++] = i; hn = (hn * 31 + i) | 0; }
    if (odst && d2 < outD2) { odst[oc++] = i; ho = (ho * 31 + i) | 0; }
  }
  fin(mesh, c, hn, S, 'hN'); fin(far, fc, hf, S, 'hF'); fin(outline, oc, ho, S, 'hO');
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
    if (Math.abs(x) < 12 && z > 60 && z < 118) return false; // keep the road vista open
    if (villageMask(x, z) > 0.02) return false;
    { const Sp = VILLAGE.spire; if (Math.hypot(x - Sp.x, z - Sp.z) < Sp.rBase + 3 + margin) return false; }
    { const M = VILLAGE.tutorialMeadow; if (Math.hypot(x - M.x, z - M.z) < 11 + margin) return false; }
    if (Math.hypot(x - L.arena.x, z - L.arena.z) < L.arena.r + 9 + margin) return false;
    if (Math.abs(x - L.ramp.x) < L.ramp.hw + 4 + margin && z > L.ramp.z0 - 2 && z < L.ramp.z1 + 6) return false;
    if (distPolyline(x, z, L.river) < 7 + margin) return false;
    if (pathWeight(x, z) > 0.01) return false;
    for (const k in L.paths) if (distPolyline(x, z, L.paths[k]) < 3.2 + margin) return false;
    if (floraBlocked(x, z, margin)) return false;   // v3 arenas, ramps, plateau/ledge, gate pads, rot-wall gaps
    return true;
  }
  const forest = (x, z) => fbm(x * 0.017 + 40, z * 0.017 - 13, 3, 300);

  // ---------------- deciduous trees
  const decGeos = [0, 1, 2].map((v) => deciduousVariant(500 + v, v)), decLod = [0, 1, 2].map((v) => deciduousVariant(500 + v, v, 1));
  const decMats = [[], [], []], decCols = [[], [], []];
  const tint = new THREE.Color();
  const addDec = (x, z, s) => {
    const v = Math.floor(rnd() * 3);
    const y = getHeight(x, z) - 0.25;
    decMats[v].push(mat4(x, y, z, 0, rnd() * Math.PI * 2, 0, s, s * (0.9 + rnd() * 0.2), s));
    const golden = rnd() < 0.07;
    const ew = elderwoodWeight(x, z);
    if (ew > 0.3) tint.setRGB(0.62 + rnd() * 0.12, 0.66 + rnd() * 0.1, 0.7 + rnd() * 0.18);   // 잿빛 수림: ash-grey, violet-tinged canopies
    else if (golden) tint.setRGB(1.35, 1.05, 0.45); else tint.setRGB(0.9 + rnd() * 0.18, 0.92 + rnd() * 0.16, 0.85 + rnd() * 0.2);
    decCols[v].push(tint.clone());
    colliders.push({ x, z, r: 0.42 * s + 0.1, kind: 'tree' });
    occupy(x, z, 2.2 * s);
  };
  // big lone trees
  const lone = [[-24, 92], [30, 112], [-62, 70], [66, 30], [-40, -40], [42, -30], [-100, -40], [120, 10], [-20, -100], [70, -80], [-105, 40], [95, 90]];
  for (const [x, z] of lone) if (allowed(x, z, 2)) addDec(x, z, 1.9 + rnd() * 0.5);
  // a few shade trees inside the village (hand placed between houses)
  for (const [x, z, s] of [[-6, 128, 1.5], [8, 158, 1.3], [-31, 147, 1.2], [36, 131, 1.25], [-19, 154.5, 1.1], [17, 135, 1.0], [-8, 168, 1.6], [28, 157, 1.35]]) addDec(x, z, s);
  let tries = 0, placed = 0;
  while (tries++ < 16000 && placed < 250) {
    const x = (rnd() - 0.5) * 330, z = (rnd() - 0.5) * 330;
    const f = forest(x, z) + elderwoodWeight(x, z) * 0.3;   // v3: Elderwood is a dense wood
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
    chunked(group, decGeos[v], decMats[v], { family: 'dec', lodGeo: decLod[v], colors: decCols[v], material: swayMaterial(uTime), outline: 0.045, outlineColor: 0x1d3318, sway: uTime });
  }

  // ---------------- pines: foot of mountains + clusters
  const pineGeos = [0, 1].map((v) => pineVariant(600 + v)), pineLod = [0, 1].map((v) => pineVariant(600 + v, 1));
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
    chunked(group, pineGeos[v], pineMats[v], { family: 'pine', lodGeo: pineLod[v], colors: pineCols[v], material: swayMaterial(uTime), outline: 0.04, outlineColor: 0x14281c, sway: uTime });
  }

  // ---------------- bushes
  const bushGeo = bushVariant(700), bushLod = bushVariant(700, 1);
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
  chunked(group, bushGeo, bushM, { lodGeo: bushLod, colors: bushC, material: swayMaterial(uTime), outline: 0.035, outlineColor: 0x1d3318, sway: uTime, cast: false }, 80, true);

  // ---------------- rocks
  const rockGeos = [0, 1, 2].map((i) => rockVariant(800 + i, i !== 2)), rockLod = [0, 1, 2].map((i) => rockVariant(800 + i, i !== 2, 1));
  const rockMat = () => toonMat(0xffffff, { vertexColors: true, flatShading: true });   // v4: one material per set (own instance texture)
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
  for (let v = 0; v < 3; v++) if (rockM[v].length) chunked(group, rockGeos[v], rockM[v], { family: 'rock', lodGeo: rockLod[v], material: rockMat, outline: 0.035, outlineColor: 0x2a2520 });
  for (let v = 0; v < 3; v++) if (rockS[v].length) chunked(group, rockGeos[v], rockS[v], { lodGeo: rockLod[v], material: rockMat, outline: 0.03, outlineColor: 0x2a2520, cast: false }, 80, true);

  // per-instance culling (see chunked()). v4: tree range = settings.treeDist (120/200/350 m) × budget.floraMul × the
  // legacy drawDistance factor; small props at half that; outlines within budget.floraOutlineDist (20/35/55 m).
  const sets = SETS.splice(0);
  // shadow-only casters: one InstancedMesh per family (far-LOD geometry of its first variant) over a family texture of
  // every member's instances; its customDepthMaterial reads the same texture (4 B per caster uploaded per change)
  const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  const families = {};
  for (const S of sets) {
    if (!S.family) continue;
    const F = families[S.family] || (families[S.family] = { sets: [], n: 0, geo: S.shadowGeo, mesh: null, h: -1, r: S.family === 'rock' ? 22 : 48 });
    S.famBase = F.n; F.sets.push(S); F.n += S.n;
  }
  for (const k in families) {
    const F = families[k];
    const src = new Float32Array(F.n * 16);
    for (const S of F.sets) src.set(S.src, S.famBase * 16);
    const uTex = { value: instTexture(src, null, F.n) };
    F.mesh = compactMesh(group, indexedGeo(F.geo, F.n), shadowMat, F.n, src, null, { cast: true, receive: false, layer: SHADOW_LAYER });
    F.mesh.customDepthMaterial = texInstanced(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uTex);
    F.mesh.name = 'floraShadow_' + k;
  }
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  const cullCam = new THREE.PerspectiveCamera();
  const lastPos = new THREE.Vector3(1e9, 0, 0), lastDir = new THREE.Vector3(), dir = new THREE.Vector3();
  let ddMul = 1, frame = 0, dirty = true, shadowR = 48, since = 99, lastFov = 0;
  const range = { treeDist: 200, outlineDist: 35, mul: 1 };
  const lastFocus = new THREE.Vector3(1e9, 0, 0);
  const stats = { instances: 0, far: 0, outlines: 0, shadow: 0, culls: 0, maxD: 0, outD: 0 };
  const COS2 = Math.cos(2 * Math.PI / 180);
  function refreshShadows(focus) {
    if (!focus) return;
    for (const k in families) {
      const F = families[k], dst = F.mesh.geometry.attributes.awIdx.array;
      const R = Math.min(F.r, shadowR), R2 = R * R;
      let c = 0, h = 7;
      for (const S of F.sets) {
        const { cen, n, famBase } = S;
        for (let i = 0; i < n; i++) {
          const dx = cen[i * 4] - focus.x, dz = cen[i * 4 + 2] - focus.z;
          if (dx * dx + dz * dz > R2) continue;
          dst[c++] = famBase + i; h = (h * 31 + famBase + i) | 0;
        }
      }
      fin(F.mesh, c, h, F, 'h');
      stats.shadow += c;
    }
  }
  function update(cam, focus) {
    frame++; since++;
    cam.getWorldDirection(dir);
    const moved = lastPos.distanceToSquared(cam.position) > 1.0 || dir.dot(lastDir) < COS2 || (focus && lastFocus.distanceToSquared(focus) > 4) || cam.fov !== lastFov;
    // re-cull at most every 4th frame (padded frustum covers the frames in between), or at once when marked dirty
    if (!dirty && !(moved && since >= 4)) return;
    dirty = false; since = 0; stats.culls++;
    if (focus) lastFocus.copy(focus);
    lastPos.copy(cam.position); lastDir.copy(dir); lastFov = cam.fov;
    cam.updateMatrixWorld();
    cullCam.copy(cam, false);
    cullCam.fov = Math.min(150, cam.fov + 16); cullCam.updateProjectionMatrix();
    pm.multiplyMatrices(cullCam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    const maxD = range.treeDist * ddMul * range.mul, smallD = maxD * 0.5, outD = range.outlineDist;
    stats.instances = 0; stats.far = 0; stats.outlines = 0; stats.shadow = 0; stats.maxD = maxD; stats.outD = outD;
    for (const S of sets) {
      refreshSet(S, cam, frustum, S.small ? smallD : maxD, outD);
      stats.instances += S.mesh.count; stats.far += S.far ? S.far.count : 0;
      stats.outlines += S.outline ? S.outline.count : 0;
    }
    refreshShadows(focus);
  }
  return {
    group, update, stats, families,
    /** Legacy 0..1 slider (v3 drawDistance; boss-fight LOD passes 0.3): factor relative to the 0.8 default. */
    setDrawDistance(v) { const m = Math.max(0.25, Math.min(1.25, (v ?? 0.8) / 0.8)); if (m !== ddMul) { ddMul = m; dirty = true; } },
    /** v4: preset ranges (metres) and the governor multiplier. */
    setRange({ treeDist, outlineDist, mul } = {}) {
      let ch = false;
      if (Number.isFinite(treeDist) && treeDist !== range.treeDist) { range.treeDist = treeDist; ch = true; }
      if (Number.isFinite(outlineDist) && outlineDist !== range.outlineDist) { range.outlineDist = outlineDist; ch = true; }
      if (Number.isFinite(mul) && mul !== range.mul) { range.mul = mul; ch = true; }
      if (ch) dirty = true;
    },
    setShadowRadius(r) { if (r !== shadowR) { shadowR = r; dirty = true; } },
    markDirty() { dirty = true; },
  };
}
