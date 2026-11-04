// Regular-enemy model registry (PLAN v4 §4.0, §7.4.6). Owned by mobmodels.
//
//   createModel(type, {variant?, scale?, palette?, seed?, game?}) → EnemyModel | null   (null → caller keeps its v3 model)
//   wrapLegacy(v3Model | root, opts) → EnemyModel                                      (v3 models behind the same contract)
//   preview(type, {variant?}) → Object3D       (fresh idle-posed root for codex thumbnails / game.render.snapshot)
//   prewarm(game) → Material[]                 (every material any mob model uses; also schedules the per-type builds in idle time)
//   TYPES: string[]                            (types with a v4 model factory)
//
// EnemyModel (§4.0): { root, meshes, proxy, lod, bones, features, tellAnchors, flashUniform, rimSource(), pose(name, t), update(frameDt), dispose() }
// v4 models additionally keep the v3 pivot names (rig, spine, neck, armR/L, foreR/L, handR/L, legR/L, kneeR/L, jaw, weapon, …, headTop, lieY,
// skin.meshes, outlines) so v3 behaviour pose code (enemies/base.js applyHumanoid, reactionPose) drives them unchanged.
import * as THREE from 'three';
import * as Rig from './rig.js';
import { buildBokoblin, buildShaman, buildChuchu, buildDummy } from '../models.js';
import { buildLizard, buildShroom, buildWolf, buildWraith, buildVoidKnight } from '../models2.js';
import { bokoblinDef } from './bokoblin.js';
import { shamanDef } from './shaman.js';
import { chuchuDef, CHU_TYPES } from './chuchu.js';
import { lizardDef } from './lizard.js';
import { shroomDef } from './shroom.js';
import { wolfDef } from './wolf.js';

/** type → (opts) => def (rig.defineType input). Filled by the species files as they land. */
const FACTORIES = {};
export const TYPES = [];
/** Register a species definition factory (species files call this; createModel then returns v4 models for the type). */
export function registerType(type, defFor, { variants = null } = {}) {
  FACTORIES[type] = { defFor, variants };
  if (!TYPES.includes(type)) TYPES.push(type);
}

registerType('bokoblin', () => bokoblinDef());
registerType('shaman', (o) => shamanDef(o), { variants: ['fire', 'ice'] });
registerType('chuchu', (o) => chuchuDef(o), { variants: CHU_TYPES });
registerType('lizard', () => lizardDef());
registerType('shroom', () => shroomDef());
registerType('wolf', (o) => wolfDef(o), { variants: [null, 'alpha'] });

const V3 = {
  bokoblin: () => buildBokoblin(), shaman: (o) => buildShaman(o?.element || o?.variant || 'fire'), chuchu: (o) => buildChuchu(o?.variant || 'normal'),
  dummy: () => buildDummy(), lizard: () => buildLizard(), shroom: () => buildShroom(), wolf: () => buildWolf(), wraith: () => buildWraith(), voidknight: () => buildVoidKnight(),
};
/** The v3 builder output for a type (MM2 sheets put it in the row above the v4 model). */
export function legacyModel(type, opts = {}) { const f = V3[type]; return f ? f(opts) : null; }

const warnOnce = (() => { const seen = new Set(); return (k, ...a) => { if (seen.has(k)) return; seen.add(k); console.warn('[mobmodels]', ...a); }; })();

/** Build (once) and return the cached type record, or null when no v4 factory exists. */
export function buildType(type, opts = {}) {
  const F = FACTORIES[type];
  if (!F) return null;
  const def = F.defFor(opts);
  if (!def) return null;
  const key = def.key || def.type;
  const have = Rig.builtTypes().get(key);
  if (have) return have;
  try { return Rig.defineType(def); } catch (err) { warnOnce('build:' + key, 'build failed', key, err); return null; }
}

export function createModel(type, opts = {}) {
  if (opts.game) Rig.setGame(opts.game);
  const T = buildType(type, opts);
  if (!T) return null;
  try { return Rig.instantiate(T, opts); } catch (err) { warnOnce('inst:' + type, 'instantiate failed', type, err); return null; }
}

export function preview(type, opts = {}) {
  const m = createModel(type, opts);
  if (m) { m.pose('idle', 0.4); m.root.updateMatrixWorld(true); return m.root; }
  const v3 = legacyModel(type, opts);
  return v3 ? v3.root : null;
}

let _idle = null;
/** Every material a mob model uses (shared; compile once). Also warms them as skinned meshes and builds the types in idle time. */
export function prewarm(game) {
  if (game) Rig.setGame(game);
  const mats = Rig.materials();
  // one tiny skinned instance per material so the skinned program variants are what gets compiled
  try {
    const warm = warmObject();
    game?.render?.warm?.(warm);
  } catch (err) { warnOnce('warm', 'warm failed', err?.message || err); }
  if (!_idle) {
    const queue = [];
    for (const t of TYPES) { const F = FACTORIES[t]; for (const v of F.variants || [null]) queue.push([t, v ? { variant: v } : {}]); }
    const ric = (typeof window !== 'undefined' && window.requestIdleCallback) || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 30));
    const step = (dl) => {
      while (queue.length && (dl?.timeRemaining?.() ?? 8) > 4) { const [t, o] = queue.shift(); buildType(t, o); }
      if (queue.length) ric(step);
    };
    _idle = queue;
    if (queue.length) ric(step);
  }
  return Rig.allMaterials().concat([mats.body, mats.shell, mats.glow]).filter((m, i, a) => a.indexOf(m) === i);
}
/** Build every type now (tests / bench). Returns rig.stats(). */
export function buildAll() {
  for (const t of TYPES) { const F = FACTORIES[t]; for (const v of F.variants || [null]) buildType(t, v ? { variant: v } : {}); }
  return Rig.stats();
}
export const stats = () => Rig.stats();

let _warmObj = null;
function warmObject() {
  if (_warmObj) return _warmObj;
  const S = Rig.S;
  const base = { type: '__warm', bones: [Rig.bone('rig', null, [0, 0.5, 0])], sphere: [0.5, 1], headTop: 1, kind: 'prop',
    parts: [Rig.P('rig', S(0.3), 0xa0a0a0, [0, 0, 0], [0, 0, 0], [1, 1, 1], { lod: true, proxy: true }), Rig.P('rig', S(0.05), 0xffe080, [0, 0.3, 0], [0, 0, 0], [1, 1, 1], { glow: true })],
    applyPose() {} };
  const a = Rig.instantiate(Rig.defineType({ ...base }), {});
  const b = Rig.instantiate(Rig.defineType({ ...base, key: '__warmShell', bones: [Rig.bone('rig', null, [0, 0.5, 0])], shell: true }), {});
  const g = new THREE.Group(); g.name = 'mob4:warm'; g.add(a.root, b.root); g.position.set(0, -500, 0);
  _warmObj = g;
  return g;
}

// =====================================================================================================================
// wrapLegacy: v3 model objects (models.js / models2.js builders) behind the EnemyModel contract
// =====================================================================================================================
const _box = new THREE.Box3(), _ctr = new THREE.Vector3();
export function wrapLegacy(m, opts = {}) {
  if (!m) return null;
  if (m.v4) return m;                     // already a v4 model
  if (m.isObject3D) m = { root: m };
  if (m._wrapped) return m;
  const root = m.root;
  const meshesMap = m.skin?.meshes || {};
  const meshes = Object.values(meshesMap);
  if (!meshes.length) root.traverse((o) => { if ((o.isSkinnedMesh || o.isMesh) && o.name !== 'outline') meshes.push(o); });
  const outlines = m.outlines || m.skin?.outlines || [];
  const body = meshesMap.body || meshesMap.rock || meshes[0] || null;
  const proxy = outlines[0] || null;
  const anchor = (parent, x, y, z, name) => { const o = new THREE.Object3D(); o.name = 'anchor:' + name; o.position.set(x, y, z); parent.add(o); return o; };
  let headAnchor = m.neck || null;
  if (!headAnchor) {
    root.updateMatrixWorld(true); _box.setFromObject(root); _box.getCenter(_ctr);
    headAnchor = anchor(root, 0, m.headTop ?? (_box.max.y - root.position.y), 0, 'head');
  }
  const weapon = m.weapon || m.staff || m.gem || m.orb || null;
  const core = m.core || m.gem || m.orb || m.spine || m.rig || root;
  m.meshes = meshes;
  m.proxy = proxy;
  m.lod = body;
  m.bones = {
    root: m.rig || root, spine: m.spine || m.rig || root, head: m.neck || headAnchor, jaw: m.jaw, armL: m.armL, armR: m.armR, handL: m.handL, handR: m.handR,
    weapon, tail: [m.tail1, m.tail2].filter(Boolean), all: m,
  };
  m.features = { face: false, hands: false, springs: 0, aoVertexColors: false, lod: false, legacy: true };
  m.tellAnchors = { weapon: weapon || m.handR || headAnchor, head: headAnchor, hand: m.handR || weapon || core, mouth: m.jaw || headAnchor, core };
  // hit flash: lazily one cloned material set per entity (same program keys), driven by the uniform's value
  let clones = null;
  const applyFlash = (v) => {
    if (!clones) {
      if (!(v > 0)) return;
      clones = [];
      for (const mesh of meshes) {
        const mat = mesh.material;
        if (!mat || !mat.emissive) continue;
        const c = mat.clone(); c.onBeforeCompile = mat.onBeforeCompile; c.customProgramCacheKey = mat.customProgramCacheKey;
        mesh.material = c; clones.push({ mat: c, e: c.emissive.clone(), ei: c.emissiveIntensity });
      }
    }
    const k = v > 1 ? 1 : v < 0 ? 0 : v;
    for (const r of clones) { r.mat.emissive.copy(r.e).lerp(FLASH_COL, k); r.mat.emissiveIntensity = r.ei + (1.2 - r.ei) * k; }
  };
  let fv = 0;
  m.flashUniform = { get value() { return fv; }, set value(v) { fv = v; applyFlash(v); } };
  const rim = proxy ? [proxy] : body ? [body] : [];
  m.rimSource = () => rim;
  const kind = m.quadruped || m.legs ? 'quad' : (m.spine && m.armR) ? 'humanoid' : (m.core && m.eyes) ? 'blob' : 'prop';
  const hip = m.rig ? m.rig.position.y : 0;
  m.hipY = m.hipY ?? hip;
  const P = Rig.newPose(hip);
  m.pose = (name, t = 0) => {
    if (kind === 'humanoid') { Rig.humanoidPose(name, t, P, hip); Rig.applyHumanoidPose(m, P); return; }
    legacyPose(m, kind, name, t, hip);
  };
  m.poseTarget = (name, t = 0, out = P) => { if (kind === 'humanoid') Rig.humanoidPose(name, t, out, hip); return out; };
  m.update = () => {};
  m.dispose = () => { root.parent?.remove(root); };
  m._wrapped = true;
  return m;
}
const FLASH_COL = new THREE.Color(1.0, 0.93, 0.84);
function legacyPose(m, kind, name, t, hip) {
  const k = name === 'windup' || name === 'hold' ? (name === 'hold' ? 1 : Math.min(1, t)) : 0;
  if (kind === 'quad') {
    m.rig.position.y = hip - 0.12 * k; m.rig.rotation.x = 0.12 * k;
    if (m.neck) m.neck.rotation.x = -0.25 * k; if (m.jaw) m.jaw.rotation.x = 0.1 + 0.4 * k;
    if (m.legs) for (let i = 0; i < m.legs.length; i++) { m.legs[i].up.rotation.x = (i < 2 ? 0.35 : -0.25) * k; m.legs[i].low.rotation.x = (i < 2 ? -0.5 : 0.6) * k; }
  } else if (kind === 'blob') {
    m.rig.scale.set(1 + 0.12 * k, 1 - 0.18 * k, 1 + 0.12 * k);
  } else if (m.rig) {
    m.rig.rotation.z = Math.sin(t * 3) * 0.05 * (name === 'idle' ? 1 : 0);
  }
}
