// Melee look engine v4 (PLAN §3, §1.4, §5.4; owner melee). Every melee move runs inside a CAST CONTEXT:
//   cc = {castId, tier, el, skillId, kind, look, row, budgets …}
// set by the engine (sword.js) at the start of a combo swing / charged release / skill / ultimate / finisher, carried by the action
// and by every task it schedules, and read by the VFX GATE: every legacy `vfx.*` call of the sword files goes through L.call(),
// which restyles it to the v4 language (element 4-step ramps, no white, no glow/flare/puff sprites, per-tier particle / handle
// budgets, flashes and FOV kicks only for U/F tiers, explosions → one element burst per cast, castId + owner on every spec).
// The primary shape of every move is the slash crescent (sword/fx.js) whose leading edge carries the element motif.
// Motifs: earth / nature / light / shadow are melee's (sword/motifs/*.js, registered with kit.registerMotif); fire / ice / lightning /
// wind / water are magic's — when magic registered them, L.motif() uses them, otherwise a melee-local recipe built from kit
// primitives (LW/RB/BT/SP/DC) plays, never the generic fallback.
// sword.lookOf(id) → 'bespoke' | 'archetype' (declared; ML1 verifies it by measurement).
import * as THREE from 'three';
import { rampOf } from './fx.js';
import { installEarth } from './motifs/earth.js';
import { installNature } from './motifs/nature.js';
import { installLight } from './motifs/light.js';
import { installShadow } from './motifs/shadow.js';
import { ROWS, STARRED, ARCH_LOOKS } from './rows.js';

export const MELEE_MOTIF_ELEMENTS = ['earth', 'nature', 'light', 'shadow'];
export const KINDS = ['cast', 'trail', 'burst', 'spark', 'zone', 'pillar', 'wave', 'aura', 'summon'];
// §1.4 / §3.3 per-tier budgets (particles per cast; Z = per second), kit handles, accents per legacy burst call
export const TIER_BUDGET = {
  B: { particles: 16, handles: 4, arcs: 2, accent: 6, rings: 1, decals: 0, glints: 1 },
  C: { particles: 48, handles: 8, arcs: 3, accent: 12, rings: 2, decals: 1, glints: 1 },
  A: { particles: 80, handles: 8, arcs: 4, accent: 14, rings: 2, decals: 1, glints: 1 },
  Z: { particles: 30, handles: 6, arcs: 2, accent: 8, rings: 2, decals: 1, glints: 1, perSec: 30 },
  U: { particles: 150, handles: 12, arcs: 6, accent: 24, rings: 3, decals: 2, glints: 2 },
  F: { particles: 250, handles: 16, arcs: 8, accent: 32, rings: 4, decals: 2, glints: 3 },
};
const Z_ARCH = new Set(['zone', 'buff', 'summon', 'wall', 'lane', 'mine']);
const Z_IDS = new Set(['earth.steps', 'nature.podseed']);
const A_IDS = new Set(['water.bubble']);
// per-element slash profile (distinct silhouettes, §1.4): band = crescent thickness (rin = rout·(1 − band)), span ×, edge offset
export const ARC_STYLE = {
  physical: { band: 0.42, span: 1, h: 0, life: 1 },
  fire: { band: 0.55, span: 1.05, h: 0.0, life: 1.0 },
  ice: { band: 0.22, span: 0.9, h: 0.1, life: 1.1 },
  lightning: { band: 0.14, span: 1.1, h: 0.18, life: 0.75 },
  wind: { band: 0.62, span: 1.2, h: -0.1, life: 0.9 },
  water: { band: 0.34, span: 0.95, h: -0.18, life: 1.15 },
  earth: { band: 0.7, span: 0.8, h: -0.25, life: 1.1 },
  nature: { band: 0.26, span: 1.0, h: 0.26, life: 1.05 },
  light: { band: 0.18, span: 0.85, h: 0.34, life: 1.0 },
  shadow: { band: 0.5, span: 0.75, h: 0.08, life: 0.9 },
};
const SPARK_SHAPE = { fire: 'ember', ice: 'shard', lightning: 'spark', wind: 'leaf', water: 'droplet', earth: 'rock', nature: 'petal', light: 'mote', shadow: 'wisp', physical: 'spark' };
const NORMAL_SP = { rock: 1, leaf: 1, petal: 1, feather: 1, droplet: 1, smoke: 1, thorn: 1, raven: 1 };
const SOFTISH = { soft: 1, glow: 1, flare: 1, puff: 1, star: 1, ring: 1, bubble: 1, rune: 1, bolt: 1, crescent: 1 };
const DECAL_OF = { fire: 'scorch', ice: 'frost', lightning: 'lichtenberg', wind: 'ripple', water: 'ripple', earth: 'crack', nature: 'flower', light: 'rune', shadow: 'violet', physical: 'crack' };
const UP = new THREE.Vector3(0, 1, 0);
// handles a motif kind may spawn (checked before the call; the cast's handle budget is §1.4's)
const HEAVY_MOTIF = { burst: 3, pillar: 3, wave: 3, zone: 2, summon: 3, aura: 2, cast: 1, trail: 1 };

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _d = new THREE.Vector3();
const BURST_OPTS = { count: 0, shape: 'spark', color: [0, 0], speed: 6, speedVar: 3, spread: 1, dir: null, size: 0.12, sizeEnd: 0.03, life: 0.3, lifeVar: 0.1,
  gravity: 4, drag: 3, additive: undefined, alpha: 1, velocityStretch: 0, owner: 'player', castId: 0, el: 'physical', disc: false, radius: 0, inward: false, curl: 0, tangential: 0, up: 0, ground: false, rotSpeed: undefined };
const SPARK_O = { _look: true, count: 6, shape: 'spark', el: 'physical', dir: null, spread: 1, speed: 5, gravity: 4, size: 0.12, life: 0.4, drag: 2.5, velocityStretch: 0.04 };
const BURST_KEYS = ['disc', 'radius', 'inward', 'curl', 'tangential', 'up', 'ground'];

export function createLooks(game, E) {
  const kit = () => game.vfx?.kit || null;
  const V = () => game.vfx || null;
  const warned = new Set();
  const warnOnce = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn('[sword:looks]', k, ...a); } };
  let serial = 0;
  const stats = { casts: 0, gated: 0, dropped: 0, bursts: 0, sparks: 0, flashes: 0 };
  const byCast = new Map();   // castId → cc (last 64)
  const motifCost = new Map(); // 'el:kind:tier' → handles spawned (max seen)

  const L = {
    cur: null, stats, ROWS, ARC_STYLE, TIER_BUDGET,
    get kit() { return kit(); },
  };

  // ------------------------------------------------------------------ registry / tiers / declared looks
  const defOf = (id) => { try { return game.skills?.def?.(id) || game.skills?.defs?.get?.(id) || null; } catch (_) { return null; } };
  function tierOf(def, id = def?.id) {
    const slot = def?.slot;
    if (slot === 'basic') return 'B';
    if (slot === 'charged') return 'C';
    if (slot === 'ultimate') return 'U';
    if (slot === 'finisher') return 'F';
    if (slot === 'support') return 'Z';
    if (A_IDS.has(id)) return 'A';
    if (Z_IDS.has(id) || Z_ARCH.has(def?.archetype)) return 'Z';
    return 'A';
  }
  L.tierOf = tierOf;
  /** The melee bespoke set (§3.7): ★ rows, every *.basic / *.charged / *.ult, the starter_<melee cls> loadouts. Enumerated, not hard-coded. */
  function bespokeSet() {
    const out = new Set(STARRED);
    const ids = registryIds();
    for (const id of ids) { const d = defOf(id); if (!d) continue; if (/\.(basic|charged|ult)$/.test(id)) out.add(id); }
    const P = game.skills?.PRESETS || game.skills?.presets || null;
    for (const c of ['sword', 'paladin', 'shadowblade']) {
      const r = P?.['starter_' + c]?.ranks;
      if (r) for (const nid of Object.keys(r)) { if (ids.includes(nid)) out.add(nid); }
    }
    return out;
  }
  function registryIds() { try { return [...(game.skills?.defs?.keys?.() || [])]; } catch (_) { return []; } }
  L.registryIds = registryIds;
  let _bes = null;
  L.bespokeSet = () => (_bes || (_bes = bespokeSet()));
  /** Declared look level of a registry skill in the melee family. */
  L.lookOf = (id) => {
    const d = defOf(id); if (!d) return null;
    if (ROWS[id] && L.bespokeSet().has(id)) return 'bespoke';
    if (ROWS[id]) return 'bespoke';
    return 'archetype';
  };

  // ------------------------------------------------------------------ cast contexts
  /** info: {skillId, slot, el, castId, kind:'combo'|'heavy'|'skill'|'ultimate'|'finisher'|'support'|'counter', archetype, tier} */
  L.begin = (info = {}) => {
    const def = info.skillId ? defOf(info.skillId) : null;
    let tier = info.tier;
    if (!tier) {
      if (def) tier = tierOf(def, info.skillId);
      else tier = info.kind === 'combo' || info.kind === 'counter' ? 'B' : info.kind === 'heavy' ? 'C' : info.kind === 'ultimate' ? 'U' : info.kind === 'finisher' ? 'F' : info.kind === 'support' ? 'Z' : 'A';
    }
    const B = TIER_BUDGET[tier] || TIER_BUDGET.A;
    const el = info.el || 'physical';
    const row = info.skillId ? ROWS[info.skillId] || null : null;
    const cc = {
      castId: info.castId || game.nextCastId?.() || ++serial, tier, el, skillId: info.skillId || null, kind: info.kind || 'skill', archetype: def?.archetype || info.archetype || null,
      row, arch: !row && def?.archetype ? ARCH_LOOKS[def.archetype] || null : null, look: row ? 'bespoke' : 'archetype', weapon: E.weapon?.id || 'longsword', t0: game.time || 0,
      pLeft: B.particles, hLeft: B.handles, arcs: 0, rings: 0, decals: 0, glints: 0, bursts: 0, flashes: 0, fovs: 0, runes: 0, contacts: 0,
      zT: 0, struck: false, finalDone: false, spawned: 0, mute: row?.mute ?? null, data: {},
    };
    stats.casts++;
    if (info.track !== false) L.last = cc;
    byCast.set(cc.castId, cc);
    if (byCast.size > 64) byCast.delete(byCast.keys().next().value);
    return cc;
  };
  L.cast = (id) => byCast.get(id) || null;
  /** Run fn inside cc (restores the previous context). */
  L.run = (cc, fn, a, b, c) => {
    const prev = L.cur; L.cur = cc || prev;
    try { return fn(a, b, c); } finally { L.cur = prev; }
  };
  // Z tier: particles refill at ≤ 30 /s (persistent parts)
  const tickers = [];
  // FX solids the camera comes close to (a lunge carries the chase camera through the impact point) fade out instead of filling
  // the screen (§1.4 coverage ceiling; the threat read stays clear)
  const NEAR = new Array(48).fill(null); let nearI = 0; const _cp = new THREE.Vector3(), _cf = new THREE.Vector3();
  function nearWatch(h) { if (h && h._r) { NEAR[nearI] = h; nearI = (nearI + 1) % NEAR.length; } return h; }
  L.update = (dt) => {
    const cam = game.camera;
    if (cam) {
      cam.getWorldPosition(_cp); cam.getWorldDirection(_cf);
      for (let i = 0; i < NEAR.length; i++) {
        const h = NEAR[i]; if (!h) continue; if (!h.alive) { NEAR[i] = null; continue; }
        const p = h._r.pos; if (!p) continue;
        const depth = (p.x - _cp.x) * _cf.x + (p.y - _cp.y) * _cf.y + (p.z - _cp.z) * _cf.z;
        if (depth < 2.5 || _cp.distanceToSquared(p) < 9) { h.stop(false); NEAR[i] = null; }   // beside / behind / at the camera
      }
    }
    for (let i = 0; i < tickers.length; i++) { try { tickers[i](dt); } catch (err) { warnOnce('ticker', err); } }
    for (const cc of byCast.values()) {
      if (cc.tier !== 'Z') continue;
      if (cc.pLeft < 30) cc.pLeft = Math.min(30, cc.pLeft + dt * 30);
    }
  };
  const useP = (cc, n) => { const k = Math.max(0, Math.min(Math.floor(n), Math.floor(cc.pLeft))); cc.pLeft -= k; return k; };
  // handle budget per cast = kit handles actually spawned with the castId (vfx.debug.byCast, the measured truth) + slash crescents
  const usedH = (cc) => { let h = 0; try { h = V()?.debug?.byCast?.(cc.castId)?.handles || 0; } catch (_) { h = 0; } return h; };   // kit handles only (§1.4 'Kit handles'); crescents are melee's pooled meshes (draw-call budget)
  // a motif's real handle count is learned (max seen); on its first use it may spawn more than predicted, so while a motif runs the kit
  // spawners refuse (inert handle) once the cast's §1.4 handle budget is spent — the budget is a hard cap, never overshot
  const INERT = { alive: false, stop() { return this; }, setPos() { return this; }, setDir() { return this; }, setScale() { return this; }, setAlpha() { return this; }, push() { return this; }, setEnds() { return this; } };
  const SPAWNERS = ['line', 'mesh', 'ribbon', 'bolt', 'decal'];   // (kit decals are linework handles too)
  const capped = (K, cc, fn) => {
    const lim = (TIER_BUDGET[cc.tier] || TIER_BUDGET.A).handles, orig = SPAWNERS.map((k) => K[k]);
    SPAWNERS.forEach((k, i) => { const f = orig[i]; if (typeof f === 'function') K[k] = function (...a) { if (usedH(cc) >= lim) { stats.dropped++; return INERT; } const h = f.apply(this, a); if (k === 'mesh') nearWatch(h); return h; }; });
    try { return fn(); } finally { SPAWNERS.forEach((k, i) => { K[k] = orig[i]; }); }
  };
  const useH = (cc, n = 1) => { const lim = (TIER_BUDGET[cc.tier] || TIER_BUDGET.A).handles; if (lim - usedH(cc) < n) { stats.dropped++; return false; } cc.hLeft = lim - usedH(cc) - n; return true; };
  L.usedH = usedH;
  L.useP = useP; L.useH = useH;

  // ------------------------------------------------------------------ helpers
  function elOf(o, cc) {
    const e = o?.element || o?.el;
    if (e && rampOf(game, e)) return e === 'void' ? 'shadow' : e;
    return cc?.el || 'physical';
  }
  const hexOf = (el, step) => rampOf(game, el)[step];
  const gy = (x, z) => { try { const w = game.world; const h = w?.getGroundHeight ? w.getGroundHeight(x, z) : w?.getHeight?.(x, z); return Number.isFinite(h) ? h : 0; } catch (_) { return 0; } };
  const nearGround = (p, h = 1.6) => p.y - gy(p.x, p.z) < h;

  /** kit.motif when the element's motif is registered (melee's own, or magic's at integration), else the melee-local recipe. */
  L.motif = (el, kind, spec) => {
    const K = kit(); if (!K || !spec?.pos) return null;
    spec.owner = 'player';
    if (spec.castId == null && L.cur) spec.castId = L.cur.castId;
    const cc = spec.castId ? byCast.get(spec.castId) : null;
    const key = el + ':' + kind + ':' + (spec.tier || cc?.tier || '');
    if (cc && kind !== 'spark' && !useH(cc, Math.max(HEAVY_MOTIF[kind] || 1, motifCost.get(key) || 0))) { if (kind === 'burst') { spec.n = Math.min(spec.n ?? 6, 6); return L.motif(el, 'spark', spec); } return null; }
    if (cc && kind === 'spark') return capped(K, cc, () => ((K.motifSource?.(el, kind) === 'registered' || K.hasMotif?.(el, kind)) ? K.motif(el, kind, spec) : local(el, kind, spec)));
    if (cc && kind !== 'spark') {
      // learn the real handle cost of each motif (measured through vfx.debug.byCast) so later casts budget it exactly
      const h0 = usedH(cc); const out = capped(K, cc, () => ((K.motifSource?.(el, kind) === 'registered' || K.hasMotif?.(el, kind)) ? K.motif(el, kind, spec) : local(el, kind, spec)));
      const d = usedH(cc) - h0; if (d > (motifCost.get(key) || 0)) motifCost.set(key, d);
      return out;
    }
    if (K.motifSource?.(el, kind) === 'registered' || K.hasMotif?.(el, kind)) return K.motif(el, kind, spec);
    return local(el, kind, spec);
  };

  // ------------------------------------------------------------------ melee-local recipes for the caster-owned elements
  // (used only while magic's motif for that element is absent; built from kit primitives, each element with its own signature)
  const LOCAL_SIG = {
    fire: { shape: 'crescent', n: 8, width: 0.07, star: 'rays', starN: 8, r2: 0.5, grav: -2.5 },
    ice: { shape: 'star', points: 6, width: 0.035, star: 'poly', sides: 6, r2: 0.45, grav: 7 },
    lightning: { shape: 'star', points: 4, width: 0.03, star: 'ticks', starN: 6, r2: 0.2, grav: 4, bolt: true },
    wind: { shape: 'spiral', turns: 0.9, arms: 3, width: 0.045, star: 'arc', r2: 0.15, grav: 1 },
    water: { shape: 'ring', width: 0.03, star: 'ripple', r2: 0, grav: 12 },
    physical: { shape: 'ticks', n: 8, width: 0.03, star: 'ring', r2: 0.55, grav: 5 },
  };
  function local(el, kind, s) {
    const K = kit(); const S = LOCAL_SIG[el] || LOCAL_SIG.physical; const R = K.ramp(el); const out = [];
    const RN = rampOf(game, el);
    const ln = (sp) => { if (sp.color == null) { sp.color = RN.mid; if (sp.color2 == null) sp.color2 = RN.light; } else if (sp.color === R.light) { sp.color = RN.mid; sp.color2 = RN.light; } return K.line(sp); };
    const cid = s.castId;
    const r = Math.max(0.3, Math.min(s.r ?? 1.1, 6));
    const pos = s.pos;
    const ground = nearGround(pos);
    const G = ground ? K.v3(pos.x, gy(pos.x, pos.z), pos.z) : pos;
    const cc0 = byCast.get(cid) || L.cur;
    const sp = (n, o) => { if (cc0) L.h.spark(cc0, pos, el, Math.min(12, n), s.dir || null, { shape: SPARK_SHAPE[el], gravity: S.grav, ...(o || null) }); else K.spark(pos, el, Math.min(12, n), s.dir || null, { castId: cid, shape: SPARK_SHAPE[el], gravity: S.grav, ...(o || null) }); };
    switch (kind) {
      case 'spark': sp(s.n ?? 6); return null;
      case 'burst': {
        if (el === 'fire') {
          // ring of 8 crescent flame petals opening in 0.2 s + heat-shimmer ring + scorch
          out.push(ln({ shape: 'rays', n: 8, r2: 0.55, el, pos: G, plane: ground ? 'ground' : 'billboard', r: r * 1.2, width: 0.09, life: 0.42, tIn: 0.12, tOut: 0.25, scaleIn: 'expand', erode: true, castId: cid, color: R.light, color2: R.mid, spin: 0.6 }));
          out.push(ln({ shape: 'ring', el, pos: G, plane: ground ? 'ground' : 'billboard', r: r * 1.5, width: 0.025, life: 0.32, tIn: 0, tOut: 0.2, scaleIn: 'expand', castId: cid, alpha: 0.6 }));
          if (ground && s.decal !== false) out.push(K.decal('scorch', G, r * 0.8, 1.2, { el, castId: cid }));
        } else if (el === 'ice') {
          out.push(ln({ shape: 'star', points: 6, r2: 0.42, el, pos, plane: 'billboard', r, width: 0.035, life: 0.4, tIn: 0.08, tOut: 0.22, erode: true, castId: cid, color: R.light, color2: R.mid }));
          out.push(ln({ shape: 'poly', sides: 6, el, pos: G, plane: ground ? 'ground' : 'billboard', r: r * 1.35, width: 0.03, life: 0.45, tOut: 0.25, scaleIn: 'expand', castId: cid, alpha: 0.7 }));
          if (ground && s.decal !== false) out.push(K.decal('frost', G, r * 0.9, 1.2, { el, castId: cid }));
        } else if (el === 'lightning') {
          for (let i = 0; i < 2; i++) { const a = i * 2.6 + (cid || 0) * 0.7; out.push(K.bolt({ from: pos, to: K.v3(pos.x + Math.cos(a) * r * 1.4, pos.y + 0.3, pos.z + Math.sin(a) * r * 1.4), forks: 1, el, castId: cid, seed: (cid || 1) * 7 + i })); }
          out.push(ln({ shape: 'star', points: 4, r2: 0.18, el, pos, plane: 'billboard', r: r * 0.8, width: 0.03, life: 0.12, tIn: 0, tOut: 0.08, castId: cid, color: R.light, color2: R.mid }));
          if (ground && s.decal !== false) out.push(K.decal('lichtenberg', G, r, 0.6, { el, castId: cid }));
        } else if (el === 'wind') {
          out.push(ln({ shape: 'spiral', turns: 0.9, arms: 3, r2: 0.15, el, pos: G, plane: ground ? 'ground' : 'billboard', r: r * 1.3, width: 0.045, life: 0.45, tIn: 0.1, tOut: 0.25, spin: 2.4, castId: cid, alpha: 0.75 }));
          const a = Math.atan2(s.dir?.z ?? 1, s.dir?.x ?? 0);
          out.push(ln({ shape: 'arc', arc: [a - 0.8, a + 0.8], el, pos: G, plane: ground ? 'ground' : 'billboard', r: r * 1.7, width: 0.04, life: 0.4, tOut: 0.2, scaleIn: 'expand', castId: cid, alpha: 0.6 }));
        } else if (el === 'water') {
          out.push(ln({ shape: 'ring', el, pos: G, plane: ground ? 'ground' : 'billboard', r: r * 1.2, width: 0.035, life: 0.5, tOut: 0.3, scaleIn: 'expand', castId: cid }));
          if (ground) out.push(ln({ shape: 'ripple', el, pos: G, plane: 'ground', r: r * 1.7, width: 0.03, life: 0.8, tOut: 0.4, alpha: 0.35, castId: cid }));
          const a = Math.atan2(s.dir?.z ?? 1, s.dir?.x ?? 0);
          out.push(ln({ shape: 'arc', arc: [a - 1.1, a + 1.1], el, pos, plane: 'billboard', r: r * 0.9, width: 0.05, life: 0.35, tOut: 0.2, castId: cid, color: R.light }));
        } else {
          out.push(ln({ shape: 'ticks', n: 8, r2: 0.55, el, pos, plane: 'billboard', r, width: 0.03, life: 0.35, tOut: 0.2, castId: cid }));
        }
        sp(s.n ?? 10, { speed: 6 * Math.sqrt(r) });
        return out;
      }
      case 'pillar': {
        const h = Math.min(8, s.h ?? 4), rr = Math.min(0.6, s.r ?? 0.5);
        const base = K.v3(G.x, G.y, G.z), top = K.v3(G.x, G.y + h, G.z);
        if (el === 'lightning') out.push(K.bolt({ from: top, to: base, forks: 2, el, life: 0.06, afterglow: 0.25, castId: cid, seed: cid }));
        else if (el === 'fire') { for (let i = 0; i < 3; i++) out.push(ln({ shape: 'crescent', el, pos: K.v3(G.x, G.y + 0.6 + i * h * 0.28, G.z), plane: 'billboard', r: rr * (1.6 - i * 0.35), width: 0.08, life: 0.5, tIn: 0.06 + i * 0.05, tOut: 0.25, erode: true, castId: cid, rot: i * 2.1 })); }
        else if (el === 'ice') out.push(ln({ shape: 'poly', sides: 6, el, pos: K.v3(G.x, G.y + h * 0.5, G.z), plane: 'billboard', r: rr * 2, width: 0.035, life: 0.5, tOut: 0.25, castId: cid }));
        else out.push(K.ribbon({ points: [base, top], width: rr, life: 0.4, el, castId: cid, alpha: 0.7 }));
        out.push(ln({ shape: 'ring', el, pos: G, plane: 'ground', r: rr * 2.4, width: 0.03, life: 0.5, tOut: 0.3, scaleIn: 'expand', castId: cid }));
        K.spark(base, el, 8, UP, { castId: cid, shape: SPARK_SHAPE[el], gravity: -2, speed: 5 });
        return out;
      }
      case 'wave': {
        const dir = s.dir || { x: 0, z: 1 }, a = Math.atan2(dir.z, dir.x), half = Math.min(1.4, s.arc ?? 0.7), rr = Math.min(s.r ?? 4, 10);
        out.push(ln({ shape: el === 'water' ? 'arc' : el === 'fire' ? 'arc' : 'arc', arc: [a - half, a + half], el, pos: G, plane: 'ground', r: rr, width: el === 'lightning' ? 0.03 : 0.06, life: s.life ?? 0.45, tOut: 0.25, scaleIn: 'expand', castId: cid }));
        if (el === 'ice') out.push(K.decal('frost', G, rr * 0.5, 1.0, { el, castId: cid }));
        else if (el === 'fire') out.push(K.decal('scorch', G, rr * 0.4, 1.0, { el, castId: cid }));
        else out.push(ln({ shape: 'arc', arc: [a - half * 0.8, a + half * 0.8], el, pos: G, plane: 'ground', r: rr * 0.8, width: 0.025, life: (s.life ?? 0.45) * 0.85, tOut: 0.2, scaleIn: 'expand', castId: cid, alpha: 0.5 }));
        return out;
      }
      case 'zone': {
        const rr = Math.max(0.6, Math.min(s.r ?? 3, 10)), life = s.life ?? 3;
        out.push(ln({ shape: el === 'ice' ? 'poly' : el === 'wind' ? 'spiral' : el === 'water' ? 'ripple' : 'dots', sides: 6, turns: 1.2, arms: 3, n: Math.round(10 + rr * 6), el, pos: G, plane: 'ground', r: el === 'wind' ? rr * 1.25 : rr, width: 0.035, life, tIn: 0.25, tOut: 0.4, spin: el === 'wind' ? 0.8 : 0.25, alpha: 0.35, castId: cid, follow: s.follow }));
        // wind: polar spiral arms only (translucent, no ground fill); the others add their element decal
        if (el !== 'wind') out.push(K.decal(DECAL_OF[el] || 'crack', G, rr * 0.9, Math.min(life, 6), { el, castId: cid, alpha: 0.28 }));
        return out;
      }
      case 'aura': {
        const rr = Math.min(s.r ?? 0.9, 2), life = s.life ?? 2;
        out.push(ln({ shape: 'dots', n: 14, el, pos, follow: s.follow, followOff: K.v3(0, 0.05, 0), plane: 'ground', r: rr, width: 0.03, life, tIn: 0.2, tOut: 0.3, spin: 1.2, alpha: 0.35, castId: cid }));
        return out;
      }
      case 'cast': {
        out.push(ln({ shape: 'glyph', glyph: el, el, pos, follow: s.follow, plane: 'billboard', r: Math.min(0.6, s.r ?? 0.4), life: s.life ?? 0.3, tIn: 0.08, tOut: 0.12, spin: 1.2, castId: cid, color: R.light }));
        return out;
      }
      case 'trail': {
        if (s.follow) out.push(K.ribbon({ follow: s.follow, width: s.width ?? 0.2, taper: 0.9, life: s.life ?? 0.22, el, castId: cid, maxLen: s.len ?? 3 }));
        return out;
      }
      case 'summon': {
        out.push(ln({ shape: 'glyph', glyph: el, el, pos: G, plane: 'ground', r: Math.min(1.4, s.r ?? 1), life: 0.6, tIn: 0.2, tOut: 0.25, spin: 0.8, castId: cid, alpha: 0.6 }));
        sp(8, { gravity: -2 });
        return out;
      }
      default: return null;
    }
  }

  // ------------------------------------------------------------------ the gate (legacy vfx calls → v4)
  function burst(cc, pos, o) {
    if (!pos || !o) return null;
    if (cc.mute?.particles && !o._look) { stats.dropped++; return null; }
    const B = TIER_BUDGET[cc.tier];
    const el = elOf(o, cc);
    let shape = o.shape || 'soft';
    const smoke = shape === 'smoke' || shape === 'dust';
    if (SOFTISH[shape]) shape = SPARK_SHAPE[el] || 'spark';
    else if (smoke) shape = 'smoke';
    else if (shape === 'snow') shape = 'shard';
    let n = Math.round(o.count ?? 12);
    n = Math.min(n, o._look ? 12 : B.accent, smoke ? 6 : 99);
    n = useP(cc, n);
    if (n <= 0) { stats.dropped++; return null; }
    const R = rampOf(game, el);
    const O = BURST_OPTS;
    O.count = n; O.shape = shape;
    O.color[0] = R.mid; O.color[1] = smoke ? R.dark : el === 'light' ? R.light : R.dark;   // saturated mid → dark (normal blend: no white-out)
    O.speed = Math.min(o.speed ?? 3, 11); O.speedVar = o.speedVar ?? O.speed * 0.5; O.spread = o.spread ?? 1; O.dir = o.dir || null;
    const big = smoke ? 0.7 : (shape === 'leaf' || shape === 'petal' || shape === 'feather' || shape === 'wisp' ? 0.22 : 0.16);
    O.size = Math.min(o.size ?? 0.12, big); O.sizeEnd = Math.min(o.sizeEnd ?? O.size * 0.3, big);
    O.life = Math.min(o.life ?? 0.4, smoke ? 0.6 : 0.6); O.lifeVar = Math.min(o.lifeVar ?? O.life * 0.3, 0.15);
    O.gravity = o.gravity ?? 0; O.drag = o.drag ?? 2;
    O.additive = el === 'light' && !NORMAL_SP[shape] ? undefined : false;
    O.alpha = Math.min(o.alpha ?? 1, smoke ? 0.3 : 0.9);
    O.velocityStretch = shape === 'spark' || shape === 'ember' || shape === 'streak' ? Math.min(0.06, o.velocityStretch === true ? 0.06 : (o.velocityStretch || 0.03)) : 0;
    O.castId = cc.castId; O.el = el; O.owner = 'player';
    for (const k of BURST_KEYS) O[k] = o[k] ?? BURST_OPTS_DEF[k];
    O.rotSpeed = o.rotSpeed;
    if (smoke && pos.y - gy(pos.x, pos.z) > 1.2) { _p.copy(pos); _p.y = gy(pos.x, pos.z) + 0.6; pos = _p; }
    stats.gated++;
    try { V().burst(pos, O); } catch (err) { warnOnce('burst', err); }
    return null;
  }
  const BURST_OPTS_DEF = { disc: false, radius: 0, inward: false, curl: 0, tangential: 0, up: 0, ground: false };

  function emitter(cc, o) {
    if (!o) return null;
    const el = elOf(o, cc), R = rampOf(game, el);
    let shape = o.shape || 'spark';
    if (SOFTISH[shape]) shape = SPARK_SHAPE[el];
    const rate = Math.min(o.rate ?? 10, cc.tier === 'Z' ? 12 : 20);
    const spec = { ...o, rate, shape, color: [R.light, R.mid], size: Math.min(o.size ?? 0.1, 0.14), alpha: Math.min(o.alpha ?? 1, 0.8), additive: NORMAL_SP[shape] ? false : o.additive, owner: 'player', castId: cc.castId, el };
    try { return V().emitter(spec); } catch (err) { warnOnce('emitter', err); return null; }
  }

  /** legacy explosion / impact / payload → one element burst per cast (the move's final hit), then sparks. */
  function impact(cc, pos, o, name) {
    if (!pos) return null;
    const el = elOf(o, cc);
    if (cc.mute?.impacts && !o?._look) return null;
    const r = Math.min(cc.tier === 'U' || cc.tier === 'F' ? 3.2 : 1.8, 0.6 + (o?.scale ?? 1) * 0.6);
    // §3.6 basic attack: smear + ≤ 6 sparks per hit, nothing persists → no burst on tier B
    if (cc.tier !== 'B' && cc.bursts < (cc.tier === 'U' ? 2 : cc.tier === 'F' ? 3 : 1)) {
      cc.bursts++; stats.bursts++;
      const n = useP(cc, cc.tier === 'B' ? 6 : 10);
      return L.motif(el, 'burst', { pos: _q.copy(pos), r, n, castId: cc.castId, dir: o?.normal || null, tier: cc.tier });
    }
    const n = useP(cc, 6);
    if (n > 0) L.motif(el, 'spark', { pos, n, castId: cc.castId });
    void name;
    return null;
  }
  function ring(cc, pos, o) {
    if (!pos || cc.rings >= TIER_BUDGET[cc.tier].rings || !useH(cc)) return null;
    if (cc.mute?.rings && !o?._look) return null;
    cc.rings++;
    const el = elOf(o, cc);
    const K = kit(); if (!K) return null;
    const rad = Math.min(o?.radius ?? 3, cc.tier === 'U' || cc.tier === 'F' ? 9 : cc.tier === 'B' ? 1.6 : 5);
    return K.line({ color: rampOf(game, el).mid, shape: el === 'ice' ? 'poly' : 'ring', sides: 6, pos, plane: o?.vertical ? 'billboard' : 'ground', r: rad, width: Math.min(0.06, 0.02 + rad * 0.006), el,
      alpha: Math.min(0.8, o?.opacity ?? 0.8), life: Math.min(0.6, Math.max(0.15, o?.duration ?? 0.4)), tIn: 0, tOut: 0.25, scaleIn: 'expand', owner: 'player', castId: cc.castId });
  }
  function beam(cc, from, to, o) {
    if (!from || !to) return null;
    if (cc.mute?.beams && !o?._look) return null;
    const el = elOf(o, cc);
    const K = kit(); if (!K || !useH(cc)) return null;
    const dy = from.y - to.y;
    const jag = o?.jagged ?? 0;
    if (el === 'lightning' || jag > 0.3) return K.bolt({ from, to, forks: Math.min(2, o?.branches ?? 1), width: 0.07, halo: 0.25, life: Math.min(0.08, (o?.duration ?? 0.2) * 0.4), afterglow: 0.22, el, castId: cc.castId, seed: cc.castId });
    // straight beams: a thin tapered ribbon (light rays, earth/ice lances)
    const w = Math.min(0.5, Math.max(0.08, (o?.width ?? 0.3) * 0.5));
    void dy;
    return K.ribbon({ points: [from.clone ? from.clone() : K.v3(from.x, from.y, from.z), to.clone ? to.clone() : K.v3(to.x, to.y, to.z)], width: w, taper: 0.7, life: Math.min(0.5, o?.duration ?? 0.3), el, alpha: 0.7, castId: cc.castId });
  }
  function rune(cc, pos, o) {
    if (!pos) return null;
    const el = elOf(o, cc);
    // the magic circles the user likes: kept for charged / U / F anticipation (one per cast), linework dots otherwise
    const K = kit(); if (!K) return null;
    if ((cc.tier === 'C' || cc.tier === 'U' || cc.tier === 'F') && cc.runes < (cc.tier === 'C' ? 1 : 2) && useH(cc, 3)) {
      // rune circle in kit linework (§3.1 craft: outer ring → glyph band → sigil; opposed spins, back-out scale-in, fade in the last 30 %)
      cc.runes++;
      const r = Math.min(o?.r ?? 2, cc.tier === 'C' ? 1.2 : 4), life = Math.min(o?.dur ?? 1, cc.tier === 'C' ? 0.9 : 2.5), R = rampOf(game, el);
      const G = nearGround(pos, 2.5) ? K.v3(pos.x, gy(pos.x, pos.z), pos.z) : pos;
      const base = { el, pos: G, plane: 'ground', life, tIn: 0.28, tOut: life * 0.3, scaleIn: 'backOut', owner: 'player', castId: cc.castId };
      const h = K.line({ ...base, shape: 'glyph', glyph: el, r: r * 0.62, spin: 0.9, color: R.mid, color2: R.dark, alpha: 0.8 });
      K.line({ ...base, shape: 'ring', r, width: Math.min(0.05, 0.02 + r * 0.008), spin: -0.4, color: R.mid, alpha: 0.85 });
      K.line({ ...base, shape: 'ticks', n: 24, r2: 0.86, r: r * 0.9, width: 0.025, spin: -0.6, color: R.light, alpha: 0.7 });
      return h;
    }
    if (!useH(cc)) return null;
    return K.line({ color: rampOf(game, el).mid, shape: 'dots', n: 18, el, pos, plane: 'ground', r: Math.min(o?.r ?? 2, 3), width: 0.035, life: Math.min(o?.dur ?? 0.8, 1.2), tIn: 0.15, tOut: 0.3, spin: 1.2, alpha: 0.6, castId: cc.castId });
  }
  function screenFlash(cc, color, a, dur) {
    if (cc.tier !== 'U' && cc.tier !== 'F') return null;
    if (cc.flashes >= 1) return null;
    try { if (game.settings?.get?.('flashReduce') || game.assist?.flashReduce) return null; } catch (_) { /* */ }
    cc.flashes++; stats.flashes++;
    try { return V().screenFlash(hexOf(cc.el, 'mid'), Math.min(0.2, a ?? 0.2), Math.min(0.15, dur ?? 0.12)); } catch (_) { return null; }
  }
  function fovKick(cc, deg, dur) {
    if (cc.tier !== 'U' && cc.tier !== 'F') return null;
    if (cc.fovs >= 1) return null;
    cc.fovs++;
    try { return V().fovKick(Math.max(-3, Math.min(3, deg ?? 3)), Math.min(0.3, dur ?? 0.25)); } catch (_) { return null; }
  }
  /** flash / flashSprite / lightPulse → a 2-frame 4-point star glint (ramp light, never white), ≤ 1–3 per cast. */
  function glint(cc, pos) {
    if (!pos || cc.glints >= TIER_BUDGET[cc.tier].glints) return null;
    const K = kit(); if (!K || !useH(cc)) return null;
    cc.glints++;
    return K.line({ shape: 'star', points: 4, r2: 0.16, el: cc.el, pos, plane: 'billboard', r: cc.tier === 'B' ? 0.35 : 0.55, width: 0.03, life: 0.07, tIn: 0, tOut: 0.04, castId: cc.castId, color: rampOf(game, cc.el).light });
  }
  function decal(cc, pos, o) {
    if (!pos || cc.decals >= TIER_BUDGET[cc.tier].decals) return null;
    const K = kit(); if (!K || !useH(cc)) return null;
    cc.decals++;
    const el = elOf(o, cc);
    return K.decal(DECAL_OF[el] || 'crack', pos, Math.min(o?.radius ?? 1.5, cc.tier === 'U' || cc.tier === 'F' ? 6 : cc.tier === 'Z' ? 2.2 : 3), Math.min(o?.duration ?? 2, cc.tier === 'U' || cc.tier === 'F' ? 6 : 2), { el, castId: cc.castId, alpha: 0.3 });
  }
  function debris(cc, pos, o) {
    if (!pos) return null;
    const el = elOf(o, cc);
    const n = useP(cc, Math.min(o?.count ?? 6, cc.tier === 'B' ? 3 : 8));
    if (n <= 0) return null;
    if (el === 'earth' && kit()?.hasMotif?.('earth', 'spark')) return L.motif('earth', 'spark', { pos, n, castId: cc.castId, chips: true });
    const K = kit(); K?.spark?.(pos, el, n, UP, { castId: cc.castId, shape: el === 'earth' ? 'rock' : SPARK_SHAPE[el], gravity: 12, speed: Math.min(8, o?.speed ?? 5) });
    return null;
  }

  /** The gate. Returns what the legacy call returned (or a restyled handle / null). */
  L.call = (name, a) => {
    const vfx = V(); if (!vfx) return null;
    const cc = L.cur;
    if (!cc) {
      // ambient (no cast): basic attacks leave nothing behind (R4) → only camera / telegraph / smear pass
      if (name === 'shake' || name === 'smear' || name === 'kick') { try { return vfx[name]?.(...a); } catch (_) { return null; } }
      if (name === 'telegraph') { if (a[0]) a[0].owner = 'player'; try { return vfx.telegraph?.(a[0]); } catch (_) { return null; } }
      stats.dropped++;
      return null;
    }
    switch (name) {
      case 'burst': return burst(cc, a[0], a[1]);
      case 'emitter': return emitter(cc, a[0]);
      case 'explosion': case 'impact': return impact(cc, a[0], a[1], name);
      case 'shockwave': return ring(cc, a[0], a[1]);
      case 'beam': return beam(cc, a[0], a[1], a[2]);
      case 'runeCircle': return rune(cc, a[0], a[1]);
      case 'screenFlash': return screenFlash(cc, a[0], a[1], a[2]);
      case 'fovKick': return fovKick(cc, a[0], a[1]);
      case 'flash': case 'flashSprite': case 'lightPulse': return glint(cc, a[0]);
      case 'decal': return decal(cc, a[0], a[1]);
      case 'groundDecal': return decal(cc, a[1], { radius: a[2], duration: a[3], ...(a[4] || null) });
      case 'debris': return debris(cc, a[0], a[1]);
      case 'dome': { if (!useH(cc)) return null; const o = { ...(a[1] || {}), el: cc.el, radius: Math.min(2, a[1]?.radius ?? 2), owner: 'player', castId: cc.castId }; try { return vfx.dome(a[0], o); } catch (_) { return null; } }
      case 'telegraph': { if (a[0]) a[0].owner = 'player'; try { return vfx.telegraph?.(a[0]); } catch (_) { return null; } }
      case 'shake': { try { return vfx.shake?.(Math.min(0.6, (a[0] ?? 0.3) * 0.6)); } catch (_) { return null; } }
      case 'smear': { try { return vfx.smear?.(a[0], a[1], a[2], a[3], a[4]); } catch (_) { return null; } }
      default: { try { return vfx[name]?.(...a); } catch (_) { return null; } }
    }
  };

  // ------------------------------------------------------------------ melee presentation primitives used by the engine
  /** Per blade contact: motif spark (≤ 6 particles); counted against the cast budget. */
  L.contact = (point, dir, el, heavy) => {
    const cc = L.cur; if (!cc || !point) return;
    cc.contacts++;
    if (cc.mute?.contacts) return;
    const n = useP(cc, Math.min(6, heavy ? 6 : 4));
    if (n <= 0) return;
    stats.sparks++;
    L.motif(el || cc.el, 'spark', { pos: point, dir, n, castId: cc.castId });
  };
  /** The move's final hit (combo finisher swing / charged release / skill payload): the full burst, once per cast. */
  L.final = (point, el, r = 1, dir = null) => {
    const cc = L.cur; if (!cc || !point || cc.finalDone) return null;
    cc.finalDone = true;
    if (cc.bursts >= 1) return null;
    if (cc.tier === 'B') { L.motif(el || cc.el, 'spark', { pos: point, n: useP(cc, 4), castId: cc.castId, dir }); return null; }
    cc.bursts++;
    return L.motif(el || cc.el, 'burst', { pos: point, r, n: useP(cc, cc.tier === 'B' ? 5 : 10), castId: cc.castId, dir, tier: cc.tier });
  };
  /** Slash crescent options for the current cast (element profile + budget); null → skip. */
  L.arcFor = (o) => {
    const cc = L.cur;
    const el = o.el || cc?.el || 'physical';
    if (cc) {
      if (cc.arcs >= TIER_BUDGET[cc.tier].arcs && !o._look) return null;
      if (cc.arcs > 0 && !useH(cc)) return null;
      cc.arcs++;
    }
    const St = ARC_STYLE[el] || ARC_STYLE.physical;
    o.el = el;
    o.castId = cc?.castId || 0;
    if (!o._raw) {
      const rout = o.rout ?? 2.5;
      o.rin = Math.max(rout * (1 - St.band), o.rinMin ?? 0);
      const mid = ((o.a0 ?? -1.5) + (o.a1 ?? 1.5)) * 0.5, half = ((o.a1 ?? 1.5) - (o.a0 ?? -1.5)) * 0.5 * St.span;
      o.a0 = mid - half; o.a1 = mid + half;
      o.h = (o.h ?? 1.1) + St.h;
      o.life = (o.life ?? 0.26) * St.life;
    }
    if (cc?.tier === 'B') { o.life = Math.min(o.life ?? 0.26, 0.26); if (cc.weapon === 'daggers') o.life = Math.min(o.life, 0.14); }
    return o;
  };
  /** spike pools (ice prisms / strata rock / thorns): counted as accents of the cast. */
  L.spikeOk = () => { const cc = L.cur; if (!cc) return true; if (cc.pLeft < 1) return false; cc.pLeft -= 1; return true; };

  // ------------------------------------------------------------------ bespoke rows: hook points
  /** Run a row hook ('start' | 'strike' | 'final' | 'end') for the current cast. */
  L.hook = (when, a, b) => {
    const cc = L.cur; const R = cc?.row || cc?.arch; if (!R) return;
    const fn = R[when]; if (typeof fn !== 'function') return;
    try { fn(L, cc, a, b); } catch (err) { warnOnce('row:' + cc.skillId + ':' + when, err); }
  };
  /** Helpers rows use (kit + budgets). */
  L.h = {
    pos: () => game.player?.object?.position,
    fwd: (out, yaw = game.player?.facing ?? 0) => out.set(Math.sin(yaw), 0, Math.cos(yaw)),
    ground: (p) => { p.y = gy(p.x, p.z); return p; },
    gy, rampOf: (el) => rampOf(game, el),
    line: (cc, spec) => {
      const K = kit(); if (!K || !useH(cc)) return null; spec.castId = cc.castId; spec.owner = 'player';
      // primary linework in the saturated mid step (R6), the light step as the second colour
      if (spec.color == null && spec.el && spec.el !== 'light') { const R = rampOf(game, spec.el); spec.color = R.mid; if (spec.color2 == null) spec.color2 = R.light; }
      return K.line(spec);
    },
    mesh: (cc, name, spec) => { const K = kit(); if (!K || !useH(cc)) return null; spec.castId = cc.castId; spec.owner = 'player'; return nearWatch(K.mesh(name, spec)); },
    ribbon: (cc, spec) => { const K = kit(); if (!K || !useH(cc)) return null; spec.castId = cc.castId; spec.owner = 'player'; return K.ribbon(spec); },
    bolt: (cc, spec) => { const K = kit(); if (!K || !useH(cc)) return null; spec.castId = cc.castId; spec.owner = 'player'; return K.bolt(spec); },
    decal: (cc, kind, pos, r, life, o = {}) => { const K = kit(); if (!K || !useH(cc)) return null; o.castId = cc.castId; cc.decals++; return K.decal(kind, pos, r, life, o); },
    spark: (cc, pos, el, n, dir, o = {}) => {
      if (!pos) return;
      const B = SPARK_O; B.count = Math.min(12, n); B.shape = o.shape || SPARK_SHAPE[el]; B.el = el; B.dir = dir || null; B.spread = dir ? 0.55 : 1;
      B.speed = o.speed ?? 5; B.gravity = o.gravity ?? 4; B.size = o.size ?? (B.shape === 'spark' || B.shape === 'ember' ? 0.1 : 0.15); B.life = o.life ?? 0.4;
      burst(cc, pos, B);
    },
    motif: (cc, el, kind, spec) => { spec.castId = cc.castId; return L.motif(el, kind, spec); },
    arc: (o) => E.S?.arc?.({ ...o, _look: true }),
    v3: (x, y, z) => new THREE.Vector3(x, y, z),
    playerObj: () => game.player?.object || null,
    yaw: () => game.player?.facing ?? 0,
    tip: (out) => { const pl = game.player; if (pl?.getWeaponTip) return pl.getWeaponTip('main', out); return pl?.getSwordTip?.(out) || out; },
    /** schedule fn after t game seconds inside the current cast context (engine scheduler; tasks keep their cast) */
    after: (t, fn) => { const S = E.S; if (S?.after) S.after(t, fn); else fn(); },
    /** n spikes of an engine spike pool ('iceSpikes' | 'rockSpikes' | 'crystal') around p within spread metres (deterministic per castId) */
    spikes: (cc, kind, p, n, h = 1, spread = 0.6) => {
      const pool = E.S?.fx?.[kind]; if (!pool?.spawn || !p) return 0;
      let k = 0;
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996 + (cc.castId % 13) * 0.7, rr = n > 1 ? spread * (0.35 + 0.65 * ((i * 0.618 + cc.castId * 0.13) % 1)) : 0;
        _p.set(p.x + Math.cos(a) * rr, 0, p.z + Math.sin(a) * rr); _p.y = gy(_p.x, _p.z);
        if (pool.spawn(_p, h * (1 - 0.35 * (i % 3) / 2), 0.32 + 0.1 * (i % 2), 0.03 * i, 0.9, 0.25 + 0.1 * (i % 3), rampOf(game, cc.el).mid)) k++;
      }
      return k;
    },
  };

  // ------------------------------------------------------------------ motifs (factory time: before the boot prewarm)
  L.installMotifs = () => {
    const K = kit(); if (!K?.registerMotif || !K.registerShape) { warnOnce('kit', 'vfx.kit absent: melee motifs not registered (legacy-restrained looks)'); return false; }
    const api = { game, kit: K, gy, rampOf: (el) => rampOf(game, el), SPARK_SHAPE, onFrame: (fn) => { tickers.push(fn); } };
    try { installEarth(api); installNature(api); installLight(api); installShadow(api); } catch (err) { console.error('[sword:looks] motifs', err); return false; }
    // motifs reached from outside the gate (vfx.hitFeel's once-per-cast burst, presets) for a melee castId run under the same hard handle cap
    if (typeof K.motif === 'function' && !K.motif._meleeCap) {
      const orig = K.motif;
      const wrapped = function (el, kind, spec) { const cc = spec?.castId ? byCast.get(spec.castId) : null; return cc ? capped(K, cc, () => orig.call(this, el, kind, spec)) : orig.call(this, el, kind, spec); };
      wrapped._meleeCap = true; K.motif = wrapped;
    }
    L.motifsInstalled = true;
    return true;
  };
  L.installed = true;
  return L;
}
