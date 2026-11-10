// Progression v3 (CONTRACT §4, DESIGN §5). game.progression.
// class + level/XP + skill points (DERIVED) + element trees (registered by skills in its factory) + mastery.
// Never imports src/skills/* (CONTRACT rule 7): tree data arrives through registerTrees(trees).
// The v2 API (choose / path / element / isMaster / hasAwakenedUltimate / hasFinisher / hasSupport) stays as shims (§22).
//
// Node stat sources: progression owns the `node:<id>` sources in game.stats (node.mods(rank)), refreshed on every
// learn / unlearn / setRanks / respec / class change / deserialize.
import { ELEMENTS } from './utils.js';
import { ALL_ELEMENTS } from './elements.js';
const NO_GATES = Object.freeze({ forGates: false });   // reused options (mastery() runs per hit)
import { CLASS_DEFS, access as classAccess } from './classes.js';

export const LEVEL_CAP = 30;
export const TIER_GATE = { 1: 0, 2: 2, 3: 5, 4: 9, 5: 14 };
export const ACT_BOSSES = ['golem', 'hydra', 'nox', 'treant', 'kalis'];
const STORY_SPIRITS = ['water', 'shadow', 'nature'];   // any 2 freed → 루미엘의 깃털
const MASTERY_RANKS = [[14, '대가'], [10, '전문'], [5, '숙련'], [1, '입문'], [0, 'none']];

export function xpToNextLevel(L) { return Math.round(40 * Math.pow(L, 1.4) + 60); }
/** Skill points earned from levels alone (class choice +1, L2-20 +1, even levels 22-30 +1). */
export function levelPoints(L, chosen = true) {
  if (!chosen) return 0;
  let p = 1 + Math.max(0, Math.min(L, 20) - 1);
  for (let l = 22; l <= Math.min(L, LEVEL_CAP); l += 2) p++;
  return p;
}

export function createProgression(game) {
  const ev = (n, p) => game.events?.emit?.(n, p);
  const warned = new Set();
  const warnOnce = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn(...a); } };

  // tree index (filled by registerTrees)
  const nodeIndex = new Map();     // nodeId → node (with .element)
  const skillToNode = new Map();   // skillId → [nodeId]
  const treesByEl = {};            // el → tree
  const nodesByEl = {};            // el → node[]

  // derived caches (invalidated by rev)
  let rev = 0, cacheRev = -1;
  const ptsGate = Object.create(null), ptsMast = Object.create(null);
  let spentCache = 0, firstCap = null, anySupport = false;
  const unlockedCache = [];
  const masteryObjs = Object.create(null);
  const breadthObj = { trees5: 0, bonus: 0, awakened: false };

  function bump() { rev++; P.rev = rev; }
  function refresh() {
    if (cacheRev === rev) return;
    cacheRev = rev;
    for (const el of ALL_ELEMENTS) { ptsGate[el] = 0; ptsMast[el] = 0; }
    spentCache = 0; firstCap = null; anySupport = false;
    for (const id of P.granted) {
      const n = nodeIndex.get(id); const el = n?.element || id.split('.')[0];
      if (ptsGate[el] !== undefined) ptsGate[el] += 1;
    }
    for (const [id, r] of P.ranks) {
      if (r <= 0) continue;
      const n = nodeIndex.get(id); if (!n) continue;
      const c = (n.cost ?? 1) * r;
      if (!P.granted.has(id)) { spentCache += c; ptsGate[n.element] += c; ptsMast[n.element] += c; }
      if (n.type === 'capstone' && !firstCap) firstCap = n;
      if (n.type === 'support') anySupport = true;
    }
    unlockedCache.length = 0;
    if (!nodeIndex.size && P._legacy) {
      if (P.chosen) { if (P._legacy.path === 'master') unlockedCache.push(P._legacy.element || 'fire'); else unlockedCache.push(...ELEMENTS); }
    } else if (P.chosen) {
      for (const el of ALL_ELEMENTS) if (ptsGate[el] > 0 && (P.debug.ungate || classAccess(P.cls, el))) unlockedCache.push(el);
    }
    let t5 = 0; for (const el of ALL_ELEMENTS) if (ptsGate[el] >= 5) t5++;
    breadthObj.trees5 = t5; breadthObj.bonus = 0.04 * Math.min(4, t5); breadthObj.awakened = t5 >= 3;
  }

  function earned() {
    if (P.debug.infPoints) return 9999;
    let p = levelPoints(P.level, P.chosen);
    for (const b of ACT_BOSSES) if (P.bossesDefeated.has(b)) p++;
    p += P.shrinesFound.size + (P.bonusPoints || 0);
    return p;
  }
  function changed(reason) {
    bump();
    try { game.stats?.markDirty?.(); } catch (_) { /* */ }
    ev('pointsChanged', { points: P.points, reason });
  }
  function applyNodeSource(id) {
    const S = game.stats; if (!S) return;
    const n = nodeIndex.get(id); if (!n || typeof n.mods !== 'function') return;
    const r = P.rank(id);
    if (r > 0) { try { S.set('node:' + id, n.mods(r) || null); } catch (err) { warnOnce('mods:' + id, '[progression] node mods failed', id, err); } }
    else S.clear('node:' + id);
  }
  function applyAllNodeSources() {
    const S = game.stats; if (!S) return;
    S.clearPrefix?.('node:');
    for (const id of P.granted) applyNodeSource(id);
    for (const [id, r] of P.ranks) if (r > 0) applyNodeSource(id);
  }
  function grantPrimaries() {
    P.granted.clear();
    const c = CLASS_DEFS[P.cls];
    if (c) for (const el of c.primary) P.granted.add(el + '.attune');
  }
  function requiresMet(n) {
    if (n.requires && P.rank(n.requires) < 1) return false;
    if (n.requiresAny && n.requiresAny.length && !n.requiresAny.some((r) => P.rank(r) >= 1)) return false;
    return true;
  }
  function spiritCount() { let k = 0; for (const el of STORY_SPIRITS) if (P.spiritsFreed.has(el)) k++; return k; }
  function maybeFeather() {
    if (!P.lumielFeather && spiritCount() >= 2) { P.lumielFeather = true; ev('lumielFeather', {}); }
  }
  /** Player within maxD of the altar (altarOnly) or of any respec spot (world.respecSpots: altar + gates). */
  function nearRespecSpot(maxD = 8, altarOnly = false) {
    const pos = game.player?.object?.position || game.player?.entity?.object?.position; if (!pos) return false;
    const W = game.world;
    const spots = [];
    const altar = W?.altar || W?.village?.altar || (Array.isArray(W?.respecSpots) ? W.respecSpots[0] : null);
    if (altar) spots.push(altar);
    if (!altarOnly && Array.isArray(W?.respecSpots)) spots.push(...W.respecSpots);
    for (const s of spots) {
      if (!s) continue;
      const dx = (s.x ?? 0) - pos.x, dz = (s.z ?? 0) - pos.z;
      if (dx * dx + dz * dz <= maxD * maxD) return true;
    }
    return false;
  }

  const P = {
    rev: 0,
    // ---- state
    cls: null, classDef: null, chosen: false,
    level: 1, xp: 0, totalXp: 0,
    ranks: new Map(), granted: new Set(), talentChoice: null,
    spiritsFreed: new Set(), sealsBroken: false, lumielFeather: false, bossesDefeated: new Set(), shrinesFound: new Set(),
    landmarksFound: new Set(), bonusPoints: 0,
    awakening: 0,
    debug: { ungate: false, infPoints: false, strictPlace: false },   // never serialized
    _legacy: null,     // {path, element} from the v2 choose() shim; used only while no trees are registered

    get points() { refresh(); return Math.max(0, earned() - spentCache); },
    earnedPoints() { return earned(); },
    spentPoints() { refresh(); return spentCache; },

    // ---- tree data
    registerTrees(trees) {
      nodeIndex.clear(); skillToNode.clear();
      for (const k of Object.keys(treesByEl)) delete treesByEl[k];
      for (const k of Object.keys(nodesByEl)) delete nodesByEl[k];
      const list = Array.isArray(trees) ? trees : Object.values(trees || {});
      for (const t of list) {
        if (!t?.element || !Array.isArray(t.nodes)) continue;
        treesByEl[t.element] = t; nodesByEl[t.element] = [];
        for (const n of t.nodes) {
          if (!n?.id) continue;
          if (!n.element) n.element = t.element;
          nodeIndex.set(n.id, n); nodesByEl[t.element].push(n);
          for (const s of n.grants || []) { if (!skillToNode.has(s)) skillToNode.set(s, []); skillToNode.get(s).push(n.id); }
        }
      }
      for (const id of [...P.ranks.keys()]) if (!nodeIndex.has(id)) P.ranks.delete(id);
      bump(); applyAllNodeSources();
      changed('registerTrees');
      ev('treesRegistered', { count: nodeIndex.size });
    },
    hasTrees() { return nodeIndex.size > 0; },
    node(id) { return nodeIndex.get(id) || null; },
    nodesOf(el) { return nodesByEl[el] || []; },
    tree(el) { return treesByEl[el] || null; },
    nodeForSkill(skillId) { const a = skillToNode.get(skillId); return a ? nodeIndex.get(a[0]) : null; },

    // ---- class
    setClass(cls) {
      if (!CLASS_DEFS[cls]) { warnOnce('cls:' + cls, '[progression] unknown class', cls); return; }
      P.cls = cls; P.classDef = CLASS_DEFS[cls]; P.chosen = true; P.talentChoice = null;
      P.ranks.clear(); grantPrimaries();
      P.awakening = 0;
      bump(); applyAllNodeSources();
      changed('class');
      ev('classChosen', { cls });
    },
    canChangeClass() {
      if (game.enemies?.boss?.alive) return { ok: false, reason: 'boss' };
      if (!(game.isTest && !P.debug.strictPlace) && !nearRespecSpot(8, true)) return { ok: false, reason: 'place' };
      return { ok: true };
    },
    /** 직업 변경 at the altar: keeps level/XP/world, resets the tree. Emits classChanged then respec. */
    changeClass(to) {
      const c = P.canChangeClass(); if (!c.ok || !CLASS_DEFS[to] || to === P.cls) return false;
      const from = P.cls;
      P.setClass(to);
      ev('classChanged', { from, to });
      ev('respec', {});
      return true;
    },
    chooseTalent(choice) {
      if (choice !== 'a' && choice !== 'b') return false;
      P.talentChoice = choice; bump(); try { game.stats?.markDirty?.(); } catch (_) { /* */ }
      ev('talentChosen', { cls: P.cls, choice });
      return true;
    },

    // ---- XP / level
    xpToNext(L = P.level) { return xpToNextLevel(L); },
    /** source.kind 'kill' gets the DESIGN §5.1 falloff (×0.5 at ≥ zoneLevel+6) / catch-up (×1.5 at ≤ zoneMin−3). */
    addXp(n, source = { kind: 'debug' }) {
      let amt = +n || 0; if (amt <= 0) return 0;
      if (source?.kind === 'kill') {
        const zl = source.zoneLevel || 1, zmin = source.zoneMin || zl;
        if (P.level >= zl + 6) amt *= 0.5;
        else if (P.level <= zmin - 3) amt *= 1.5;
      }
      amt = Math.round(amt);
      if (amt <= 0) return 0;
      P.totalXp += amt;
      let ups = 0;
      if (P.level < LEVEL_CAP) {
        P.xp += amt;
        while (P.level < LEVEL_CAP && P.xp >= P.xpToNext()) {
          P.xp -= P.xpToNext();
          const before = levelPoints(P.level, P.chosen);
          P.level++; ups++;
          bump();
          ev('levelUp', { level: P.level, pointsGained: levelPoints(P.level, P.chosen) - before });
        }
      }
      if (P.level >= LEVEL_CAP) P.xp = 0;
      ev('xpGained', { amount: amt, source, level: P.level, xp: P.xp, xpToNext: P.xpToNext() });
      if (ups) changed('level');
      return amt;
    },
    setLevel(L) {
      L = Math.max(1, Math.min(LEVEL_CAP, Math.round(+L || 1)));
      if (L === P.level) return;
      const before = levelPoints(P.level, P.chosen);
      P.level = L; P.xp = 0;
      let tot = 0; for (let l = 1; l < L; l++) tot += xpToNextLevel(l);
      P.totalXp = tot;
      bump();
      ev('levelUp', { level: L, pointsGained: levelPoints(L, P.chosen) - before });
      changed('level');
    },
    /** Extra points. A boss id ('golem'… or {id}) records the act boss instead (idempotent with the bossDefeated listener). */
    addPoints(n = 1, src = null) {
      const id = typeof src === 'string' ? src : src?.id;
      if (id && ACT_BOSSES.includes(id)) { if (!P.bossesDefeated.has(id)) { P.bossesDefeated.add(id); changed('boss'); } return; }
      P.bonusPoints += n; changed('bonus');
    },

    // ---- tree
    pointsIn(el, opts) {
      refresh();
      const forGates = opts?.forGates !== false;
      return (forGates ? ptsGate[el] : ptsMast[el]) || 0;
    },
    access(el) { return classAccess(P.cls, el); },
    storyGateOpen(el) {
      if (P.debug.ungate) return true;
      if (el === 'light') return P.lumielFeather || P.spiritsFreed.has('light');
      if (STORY_SPIRITS.includes(el)) return P.spiritsFreed.has(el);
      return P.sealsBroken;
    },
    tierCap(el) {
      if (P.debug.ungate) return 'CAP';
      const a = P.access(el);
      if (!a) return null;
      if (a === 'secondary') return 'T3';
      return P.storyGateOpen(el) ? 'CAP' : 'T4';
    },
    tierGate(tier) { return TIER_GATE[tier] || 0; },
    rank(id) { const r = P.ranks.get(id) || 0; return r > 0 ? r : (P.granted.has(id) ? 1 : 0); },
    isLearned(id) { return P.rank(id) > 0; },
    isGranted(id) { return P.granted.has(id); },
    canLearn(id) {
      const n = nodeIndex.get(id);
      if (!n) return { ok: false, reason: 'unknown' };
      const r = P.rank(id);
      if (r >= (n.maxRank || 1)) return { ok: false, reason: 'maxRank' };
      const el = n.element;
      if (!P.debug.ungate) {
        const a = P.access(el);
        if (!a) return { ok: false, reason: 'class' };
        const tier = n.tier || 1;
        if (a === 'secondary' && tier >= 4) return { ok: false, reason: 'tier' };
        if (n.type === 'capstone' && !P.storyGateOpen(el)) return { ok: false, reason: 'story' };
        if (P.pointsIn(el) < (TIER_GATE[tier] || 0)) return { ok: false, reason: 'gate' };
      }
      if (r === 0 && !requiresMet(n)) return { ok: false, reason: 'prereq' };
      if (n.exclusive && P.rank(n.exclusive) > 0) return { ok: false, reason: 'exclusive' };
      if (!P.debug.infPoints && P.points < (n.cost ?? 1)) return { ok: false, reason: 'points' };
      return { ok: true };
    },
    learn(id) {
      if (!P.canLearn(id).ok) return false;
      const n = nodeIndex.get(id);
      const r = (P.ranks.get(id) || 0) + 1;
      P.ranks.set(id, r);
      bump(); applyNodeSource(id);
      changed('learn');
      ev('skillLearned', { id, rank: r, element: n.element });
      return true;
    },
    canRespecHere() {
      if (game.isTest && !P.debug.strictPlace) return true;
      return nearRespecSpot(8, false);
    },
    canUnlearn(id) {
      const n = nodeIndex.get(id);
      const r = P.ranks.get(id) || 0;
      if (!n || r <= 0) return { ok: false, reason: P.granted.has(id) ? 'granted' : 'unknown' };
      if (!P.canRespecHere()) return { ok: false, reason: 'place' };
      const el = n.element;
      if (r === 1) {
        for (const m of nodesByEl[el] || []) {
          if (m.id === id || P.rank(m.id) <= 0 || P.granted.has(m.id)) continue;
          if (m.requires === id) return { ok: false, reason: 'dependent' };
          if (m.requiresAny?.includes(id) && !m.requiresAny.some((q) => q !== id && P.rank(q) > 0)) return { ok: false, reason: 'dependent' };
        }
      }
      if (!P.debug.ungate) {
        // Simulate the removal: every remaining learned node of tier t must still have ≥ gate(t) points in the tiers
        // BELOW t (a node's own tier never props up its own gate, so a refund can't hollow out a learned tier).
        const tierPts = [0, 0, 0, 0, 0, 0];
        for (const m of nodesByEl[el] || []) {
          const mr = P.granted.has(m.id) ? 1 : (m.id === id ? r - 1 : P.rank(m.id));
          if (mr <= 0) continue;
          tierPts[m.tier || 1] += P.granted.has(m.id) ? 1 : (m.cost ?? 1) * mr;
        }
        for (const m of nodesByEl[el] || []) {
          if (P.granted.has(m.id)) continue;
          const mr = m.id === id ? r - 1 : P.rank(m.id);
          if (mr <= 0) continue;
          const t = m.tier || 1;
          let below = 0; for (let k = 1; k < t; k++) below += tierPts[k];
          if (below < (TIER_GATE[t] || 0)) return { ok: false, reason: 'gate' };
        }
      }
      return { ok: true };
    },
    unlearn(id) {
      if (!P.canUnlearn(id).ok) return false;
      const n = nodeIndex.get(id);
      const r = (P.ranks.get(id) || 0) - 1;
      if (r > 0) P.ranks.set(id, r); else P.ranks.delete(id);
      bump(); applyNodeSource(id);
      checkAwakening();
      changed('unlearn');
      ev('skillUnlearned', { id, rank: r, element: n.element });
      return true;
    },
    respecAll() {
      if (!P.canRespecHere()) return false;
      P.ranks.clear();
      bump(); applyAllNodeSources(); checkAwakening();
      changed('respec');
      ev('respec', {});
      return true;
    },
    /** Presets/tests: replace the ranks. ignoreGates also sets debug.ungate (CONTRACT §21). */
    setRanks(map, { ignoreBudget = false, ignoreGates = false } = {}) {
      if (ignoreGates) P.debug.ungate = true;
      P.ranks.clear();
      const learned = [];
      for (const id of Object.keys(map || {})) {
        const n = nodeIndex.get(id);
        if (!n) { warnOnce('setRanks:' + id, '[progression] setRanks: unknown node', id); continue; }
        if (P.granted.has(id)) continue;
        const r = Math.max(0, Math.min(n.maxRank || 1, Math.round(+map[id] || 0)));
        if (r > 0) { P.ranks.set(id, r); learned.push(id); }
      }
      bump();
      if (!ignoreBudget && earned() - P.spentPoints() < 0) warnOnce('budget', '[progression] setRanks over budget');
      applyAllNodeSources(); checkAwakening();
      changed('setRanks');
      ev('respec', {});
      for (const id of learned) ev('skillLearned', { id, rank: P.ranks.get(id), element: nodeIndex.get(id).element });
      return true;
    },
    learnedNodes() { const out = [...P.granted]; for (const [id, r] of P.ranks) if (r > 0 && !P.granted.has(id)) out.push(id); return out; },
    learnedSkills() {
      const out = new Set();
      for (const id of P.learnedNodes()) for (const s of nodeIndex.get(id)?.grants || []) out.add(s);
      return [...out];
    },
    hasSkill(skillId) {
      const a = skillToNode.get(skillId);
      if (!a) return false;
      for (const id of a) if (P.rank(id) > 0) return true;
      return false;
    },
    /** Reused object per element (no allocation): {points, rank, dmgBonus, milestones}. */
    mastery(el) {
      let o = masteryObjs[el];
      if (!o) o = masteryObjs[el] = { points: 0, rank: 'none', dmgBonus: 0, milestones: [] };
      const pts = P.pointsIn(el, NO_GATES);
      o.points = pts;
      let rk = 'none';
      for (let i = 0; i < MASTERY_RANKS.length; i++) if (pts >= MASTERY_RANKS[i][0]) { rk = MASTERY_RANKS[i][1]; break; }   // no iterator allocation (per-hit path)
      if (rk === '대가' && P.access(el) !== 'primary' && !P.debug.ungate) rk = '전문';
      o.rank = rk;
      o.dmgBonus = 0.02 * Math.min(15, pts);
      o.milestones.length = 0;
      if (pts >= 5) o.milestones.push(5);
      if (pts >= 10) o.milestones.push(10);
      if (pts >= 15) o.milestones.push(15);
      return o;
    },
    /** DESIGN §5.7 방랑자: +4% reaction damage per tree with ≥ 5 points (max 4); 3 such trees → 방랑자의 각성. */
    breadth() { refresh(); return breadthObj; },
    judgmentThreshold() {
      const m10 = P.pointsIn('light', NO_GATES) >= 10 ? 4 : 5;
      const p2 = P.rank('light.p2');
      const p2v = p2 >= 2 ? 3 : p2 === 1 ? 4 : 5;
      return Math.max(3, Math.min(5, m10, p2v));
    },

    // ---- elements
    /** Class-accessible elements with points (granted counts). Cached array; do not mutate. */
    unlockedElements() { refresh(); return unlockedCache; },
    isElementUnlocked(el) { refresh(); return unlockedCache.includes(el); },
    freeSpirit(el) {
      if (!el || P.spiritsFreed.has(el)) return;
      P.spiritsFreed.add(el); bump();
      ev('spiritFreed', { element: el });
      maybeFeather();
    },
    breakSeals() { if (P.sealsBroken) return; P.sealsBroken = true; bump(); ev('sealsBroken', {}); },

    // ---- combat hooks
    /** MASTERY ONLY: 1 + 0.02 × min(15, points in tree, granted excluded). */
    damageMul(el) {
      if (!nodeIndex.size && P._legacy?.path === 'master') return el === P._legacy.element ? 1.25 : 1;   // v2 fallback (skills absent)
      return 1 + 0.02 * Math.min(15, P.pointsIn(el, NO_GATES));
    },

    // ---- awakening (enabled iff any capstone OR breadth awakening; v2 master fallback)
    awakeningEnabled() { refresh(); return !!firstCap || breadthObj.awakened || (!nodeIndex.size && P._legacy?.path === 'master'); },
    addAwakening(n) {
      if (!P.awakeningEnabled() || !(n > 0)) return;
      const was = P.awakening;
      P.awakening = Math.min(100, P.awakening + n);
      if (P.awakening !== was) ev('awakeningChanged', { value: P.awakening });
      if (was < 100 && P.awakening >= 100) ev('awakeningReady', {});
    },
    canFinisher() { return P.awakeningEnabled() && P.awakening >= 100; },
    consumeAwakening() {
      if (!P.canFinisher()) return false;
      P.awakening = 0; ev('awakeningChanged', { value: 0 });
      return true;
    },

    // ---- v2 shims (§22)
    choose(cls, path = 'all', element = null) {
      P._legacy = { path, element: path === 'master' ? (element || 'fire') : null };
      P.setClass(CLASS_DEFS[cls] ? cls : 'mage');
      P.debug.ungate = true;
      const preset = path === 'master' ? 'legacy_master_' + (element || 'fire') : 'legacy_all';
      try { game.skills?.applyPreset?.(preset); } catch (err) { console.warn('[progression] legacy preset failed', err); }
      bump();
      ev('pathChosen', { cls: P.cls, path: P.path, element: P.element });
    },
    get path() {
      if (!P.chosen) return null;
      refresh();
      if (firstCap) return 'master';
      if (!nodeIndex.size && P._legacy) return P._legacy.path;
      return 'all';
    },
    get element() {
      if (!P.chosen) return null;
      refresh();
      if (firstCap) return firstCap.element;
      if (!nodeIndex.size && P._legacy) return P._legacy.element;
      return null;
    },
    isMaster() { return P.path === 'master'; },
    hasAwakenedUltimate(el) {
      refresh();
      if (!nodeIndex.size) return P._legacy?.path === 'master' && (!el || el === P._legacy.element);
      if (el) return P.rank(el + '.cap') > 0;
      return !!firstCap;
    },
    hasFinisher() { refresh(); return !!firstCap || (!nodeIndex.size && P._legacy?.path === 'master'); },
    hasSupport() { refresh(); return anySupport || (!nodeIndex.size && P._legacy?.path === 'master'); },

    // ---- persistence (points are never stored: they are derived)
    serialize() {
      return {
        cls: P.cls, level: P.level, xp: P.xp, totalXp: P.totalXp,
        ranks: Object.fromEntries([...P.ranks].filter(([, r]) => r > 0)),
        talentChoice: P.talentChoice,
        spiritsFreed: [...P.spiritsFreed], sealsBroken: P.sealsBroken, lumielFeather: P.lumielFeather,
        bossesDefeated: [...P.bossesDefeated], shrinesFound: [...P.shrinesFound], landmarksFound: [...P.landmarksFound],
        bonusPoints: P.bonusPoints,
      };
    },
    deserialize(o) {
      if (!o || typeof o !== 'object') return false;
      P.cls = CLASS_DEFS[o.cls] ? o.cls : null; P.classDef = CLASS_DEFS[P.cls] || null; P.chosen = !!P.cls;
      P.level = Math.max(1, Math.min(LEVEL_CAP, (o.level | 0) || 1));
      P.xp = Math.max(0, +o.xp || 0); P.totalXp = Math.max(0, +o.totalXp || 0);
      P.talentChoice = o.talentChoice === 'a' || o.talentChoice === 'b' ? o.talentChoice : null;
      P.spiritsFreed = new Set(o.spiritsFreed || []); P.sealsBroken = !!o.sealsBroken; P.lumielFeather = !!o.lumielFeather;
      P.bossesDefeated = new Set(o.bossesDefeated || []); P.shrinesFound = new Set(o.shrinesFound || []);
      P.landmarksFound = new Set(o.landmarksFound || []); P.bonusPoints = +o.bonusPoints || 0;
      grantPrimaries();
      P.ranks.clear();
      for (const [id, r] of Object.entries(o.ranks || {})) {
        if (nodeIndex.size && !nodeIndex.has(id)) continue;      // unknown ids dropped; their points come back (derived)
        if (P.granted.has(id)) continue;
        const n = nodeIndex.get(id);
        const rr = Math.max(0, Math.min(n?.maxRank || 3, r | 0));
        if (rr > 0) P.ranks.set(id, rr);
      }
      P.awakening = 0; P._legacy = null;
      bump(); applyAllNodeSources();
      changed('load');
      if (P.cls) ev('classChosen', { cls: P.cls, loaded: true });
      return true;
    },
    reset() {
      P.cls = null; P.classDef = null; P.chosen = false;
      P.level = 1; P.xp = 0; P.totalXp = 0;
      P.ranks.clear(); P.granted.clear(); P.talentChoice = null;
      P.spiritsFreed.clear(); P.sealsBroken = false; P.lumielFeather = false;
      P.bossesDefeated.clear(); P.shrinesFound.clear(); P.landmarksFound.clear(); P.bonusPoints = 0;
      P.awakening = 0; P._legacy = null;
      P.debug.ungate = false; P.debug.infPoints = false;
      bump();
      try { game.stats?.clearPrefix?.('node:'); game.stats?.markDirty?.(); } catch (_) { /* */ }
    },
  };

  function checkAwakening() {
    if (!P.awakeningEnabled() && P.awakening > 0) { P.awakening = 0; ev('awakeningChanged', { value: 0 }); }
  }

  // ---- listeners (XP sources, DESIGN §5.1)
  const E = game.events;
  if (E?.on) {
    E.on('kill', (p) => {
      const t = p?.target;
      const xp = p?.xp ?? t?.xpValue;
      if (!(xp > 0) || t?.team === 'player') return;
      P.addXp(xp, { kind: 'kill', id: t?.type || t?.id, zoneLevel: p?.zoneLevel ?? t?.zoneLevel ?? 1, zoneMin: t?.zoneMin });
    });
    E.on('reactionDiscovered', (p) => P.addXp(60, { kind: 'reaction', id: p?.id }));
    E.on('shrineFound', (p) => {
      const id = p?.id; if (!id) return;
      if (p.kind === 'seed') { if (P.shrinesFound.has(id)) return; P.shrinesFound.add(id); changed('shrine'); P.addXp(300, { kind: 'shrine', id }); }
      else if (p.kind === 'landmark') { if (P.landmarksFound.has(id)) return; P.landmarksFound.add(id); P.addXp(80, { kind: 'landmark', id }); }
    });
    E.on('bossDefeated', (p) => {
      const id = p?.id; if (!id) return;
      if (ACT_BOSSES.includes(id) && !P.bossesDefeated.has(id)) { P.bossesDefeated.add(id); changed('boss'); }
    });
  }
  return P;
}
