// Skills runtime (CONTRACT §7.2–7.5): loadout, attune, per-id cooldowns (compensated time), the cast pipeline,
// archetype ctx, key handling (v3 keymap only), and the reused HUD state. Owned by skills.
import * as THREE from 'three';
import { ALL_ELEMENTS, elColor, elName } from '../core/elements.js';
import { CLASS_DEFS, familyOf, styleOf, classElements } from '../core/classes.js';
import { KEY_LABELS } from '../core/keymap.js';
import { createFallback, baseDamage } from './fallback.js';

export const SLOTS = ['basic', 'charged', 'q1', 'q2', 'q3', 'q4', 'ult', 'sup', 'fin'];
const LOADOUT_SLOTS = ['q1', 'q2', 'q3', 'q4', 'ult', 'sup'];
const SLOT_KEY = { basic: 'LMB', charged: 'RMB', q1: '1', q2: '2', q3: '3', q4: '4', ult: 'X', sup: 'G', fin: 'R' };
const HUD_KIND = { basic: 'basic', charged: 'heavy', ultimate: 'ultimate', support: 'support', finisher: 'finisher', quick: 'skill' };
/** spellCast kind mapping (CONTRACT §7.2 step 4). */
const SPELL_KIND = { basic: 'basic', charged: 'heavy', ultimate: 'ultimate' };
const MIN_CHARGE = 0.15;

export function installRuntime(game, K) {
  const E = game.events;
  const warned = new Set();
  const log = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn(...a); } };
  const P = () => game.progression;
  const pl = () => game.player;
  const fallback = createFallback(game);
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

  // ------------------------------------------------------------------ state
  const loadout = { q1: null, q2: null, q3: null, q4: null, ult: null, sup: null };
  const cooldowns = new Map();          // skillId → seconds left (compensated time)
  const cdTotal = new Map();            // skillId → last full cooldown (HUD fraction)
  const charges = new Map();            // skillId → {n, max, t}
  const timers = [];                    // pooled {t, fn, alive}
  const timerPool = [];
  let spellCastSeq = 0;
  const charge = { active: false, t: 0, frac: 0, id: null, el: null };
  let wheelCd = 0;
  let lastCast = { id: null, t: -1e9, el: null, slot: null };
  let paramsRev = -1;
  const paramsCache = new Map();
  const tipShown = { empty: false };

  const R = K.api;
  const defs = K.defs;

  // ------------------------------------------------------------------ helpers
  const family = () => game.player?.family || familyOf(P()?.cls);
  const style = () => game.player?.style || styleOf(P()?.cls);
  const isLearned = (id) => !!P()?.hasSkill?.(id);
  const now = () => game.time || 0;
  /** Compensated time factor (focus slow-mo does not slow the player's skills, CONTRACT §3.3). */
  const comp = () => { try { return game.timeScale?.comp?.() ?? game.player?.timeComp?.() ?? 1; } catch (_) { return 1; } };
  const ownsInput = () => game.keymapMode === 'v3';
  function mute(name, fn) {
    const orig = E.emit;
    E.emit = function (n, p) { if (n === name) return undefined; return orig.call(this, n, p); };
    try { fn(); } finally { E.emit = orig; }
  }
  E.on('spellCast', () => { spellCastSeq++; });

  // ------------------------------------------------------------------ timers (game time unless real)
  function after(t, fn) {
    const o = timerPool.pop() || { t: 0, fn: null, alive: false };
    o.t = t; o.fn = fn; o.alive = true; timers.push(o);
    return o;
  }
  function runTimers(dt) {
    for (let i = timers.length - 1; i >= 0; i--) {
      const o = timers[i];
      o.t -= dt;
      if (o.t > 0) continue;
      timers[i] = timers[timers.length - 1]; timers.pop();
      const fn = o.fn; o.fn = null; o.alive = false; timerPool.push(o);
      try { fn?.(); } catch (err) { log('timer', '[skills] timer failed', err); }
    }
  }

  // ------------------------------------------------------------------ params (modifiers only, never scaled)
  function deepMerge(base, over) {
    const out = Array.isArray(base) ? base.slice() : { ...base };
    for (const k in over) {
      const v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], v);
      else out[k] = v;
    }
    return out;
  }
  function effectiveParams(id) {
    const rev = P()?.rev ?? 0;
    if (rev !== paramsRev) { paramsCache.clear(); paramsRev = rev; }
    let p = paramsCache.get(id);
    if (p) return p;
    const def = defs.get(id); if (!def) return {};
    p = def.params || {};
    for (const mid of def.modifiers || []) {
      if (P()?.rank?.(mid) > 0) { const m = K.nodes.get(mid); if (m?.params) p = deepMerge(p, m.params); }
    }
    paramsCache.set(id, p);
    return p;
  }

  // ------------------------------------------------------------------ elements / attune
  const elemList = [];   // class elements ∪ unlocked (reused)
  let elemRev = -1;
  function elementsList() {
    const pr = P(); const rev = (pr?.rev ?? 0) * 31 + (pr?.cls ? pr.cls.length : 0);
    if (rev === elemRev && elemList.length) return elemList;
    elemRev = rev; elemList.length = 0;
    const cls = pr?.cls;
    for (const el of classElements(cls)) elemList.push(el);
    const un = pr?.unlockedElements?.() || [];
    for (const el of ALL_ELEMENTS) if (un.includes(el) && !elemList.includes(el)) elemList.push(el);
    return elemList;
  }
  function attuneList() { return P()?.unlockedElements?.() || []; }
  function attune(el, { silent = false, force = false } = {}) {
    if (!el || !ALL_ELEMENTS.includes(el)) return false;
    if (!force && !attuneList().includes(el)) return false;
    const prev = R.attuned;
    if (prev === el) return true;
    if (charge.active) cancelCharge();
    R.attuned = el;
    const idx = elementsList().indexOf(el);
    K.adapters.setElementSilent(el, idx, (fn) => mute('elementChanged', fn));
    try { pl()?.setStaffElement?.(el); } catch (_) { /* */ }
    if (!silent) {
      E.emit('attuneChanged', { element: el, prev });
      E.emit('elementChanged', { element: el, index: idx, cls: P()?.cls });
    }
    return true;
  }
  function cycleAttune(dir = +1) {
    const list = attuneList(); if (!list.length) return;
    const i = list.indexOf(R.attuned);
    const j = ((i < 0 ? 0 : i + (dir >= 0 ? 1 : -1)) % list.length + list.length) % list.length;
    if (list[j] !== R.attuned) { attune(list[j]); try { game.audio?.play?.('ui_select', { pitch: 1.1, volume: 0.5 }); } catch (_) { /* */ } }
  }
  function ensureAttune(silent = false) {
    const list = attuneList();
    if (R.attuned && list.includes(R.attuned)) return;
    const c = CLASS_DEFS[P()?.cls];
    const want = (c && c.primary.find((e) => list.includes(e))) || list[0] || c?.primary?.[0] || null;
    if (!want) { R.attuned = null; return; }
    attune(want, { silent: silent || !ownsInput(), force: true });
  }

  // ------------------------------------------------------------------ loadout
  function slotAccepts(slot, def) {
    if (!def) return false;
    if (slot === 'ult') return def.slot === 'ultimate' && !def.replaces;
    if (slot === 'sup') return def.slot === 'support';
    if (/^q[1-4]$/.test(slot)) return def.slot === 'quick' || def.slot === 'support';
    return false;
  }
  /** The ONE equip rule (DESIGN §5.5): out of combat, OR paused in the tree with no damage in the last 5 s. */
  function canEquip(slot, id) {
    if (!LOADOUT_SLOTS.includes(slot)) return { ok: false, reason: 'slot' };
    const def = defs.get(id);
    if (!def || !slotAccepts(slot, def)) return { ok: false, reason: 'slot' };
    if (!isLearned(id)) return { ok: false, reason: 'unlearned' };
    const p = pl();
    let inCombat = false;
    try { inCombat = typeof p?.inCombat === 'function' ? !!p.inCombat() : (now() - (p?.lastHurtT ?? -1e9) < 3); } catch (_) { inCombat = false; }
    if (inCombat) {
      const treeOk = !!game.ui?.skillTreeOpen && game.state === 'paused' && now() - (p?.lastHurtT ?? -1e9) >= 5;
      if (!treeOk) return { ok: false, reason: 'combat' };
    }
    return { ok: true };
  }
  function equip(slot, id, { force = false } = {}) {
    if (!id) { unequip(slot); return true; }
    if (!force) { const c = canEquip(slot, id); if (!c.ok) return false; }
    else if (!slotAccepts(slot, defs.get(id))) return false;
    for (const s of LOADOUT_SLOTS) if (s !== slot && loadout[s] === id) { loadout[s] = null; E.emit('loadoutChanged', { slot: s, id: null }); }
    if (loadout[slot] === id) return true;
    loadout[slot] = id;
    E.emit('loadoutChanged', { slot, id });
    return true;
  }
  function unequip(slot) {
    if (!LOADOUT_SLOTS.includes(slot) || !loadout[slot]) return;
    loadout[slot] = null; E.emit('loadoutChanged', { slot, id: null });
  }
  function equippedSomewhere(id) { for (const s of LOADOUT_SLOTS) if (loadout[s] === id) return true; return false; }
  /** Fill empty quick slots / ult / sup with learned skills (primary trees first, then by tier). */
  function autoEquip() {
    const pr = P(); if (!pr) return;
    const learned = [];
    const order = elementsList();
    for (const el of order) {
      const t = K.trees[el]; if (!t) continue;
      for (const n of t.nodes) if (pr.rank(n.id) > 0) for (const g of n.grants || []) learned.push(g);
    }
    for (const id of learned) {
      const def = defs.get(id); if (!def || equippedSomewhere(id)) continue;
      if (def.slot === 'ultimate' && !def.replaces && !loadout.ult) equip('ult', id, { force: true });
      else if (def.slot === 'support' && !loadout.sup) equip('sup', id, { force: true });
      else if (def.slot === 'quick') { const s = ['q1', 'q2', 'q3', 'q4'].find((q) => !loadout[q]); if (s) equip(s, id, { force: true }); }
    }
  }
  function cleanupUnlearned() {
    for (const s of LOADOUT_SLOTS) if (loadout[s] && !isLearned(loadout[s])) unequip(s);
    const S = game.stats;
    if (S) for (const id of defs.keys()) if (!isLearned(id) && S.has?.('buff:' + id)) S.clear('buff:' + id);
    try { K.kits?.refresh?.(); } catch (_) { /* */ }
    // summons (treant, totem, clone, …) of skills that are no longer learned
    try {
      const Sp = game.spells?.api;
      for (const id of defs.keys()) if (!isLearned(id) && defs.get(id).archetype === 'summon') { Sp?.despawnSummon?.(id); game.spells?.despawnSummon?.(id); }
    } catch (_) { /* */ }
    paramsCache.clear();
  }

  // ------------------------------------------------------------------ cooldowns
  function cdLeft(id) {
    const c = charges.get(id);
    if (c) return c.n > 0 ? 0 : c.t;
    return cooldowns.get(id) || 0;
  }
  function isReady(id) { return cdLeft(id) <= 0; }
  function maxCharges(id) { const def = defs.get(id); return effectiveParams(id).charges || def?.charges || 0; }
  function startCooldown(id, def) {
    const cdr = game.stats?.get?.('cdrMul') ?? 1;
    const mc = maxCharges(id);
    if (mc > 1) {
      let c = charges.get(id);
      if (!c) { c = { n: mc, max: mc, t: 0 }; charges.set(id, c); }
      c.max = mc; c.n = Math.max(0, c.n - 1);
      if (c.t <= 0) c.t = (def.recharge || def.cd || 1) * cdr;
      cdTotal.set(id, (def.recharge || def.cd || 1) * cdr);
      return;
    }
    const cd = (def.cd || 0) * cdr;
    if (cd > 0) { cooldowns.set(id, cd); cdTotal.set(id, cd); }
  }
  let tickDt = 0;
  const tickCd = (t, id) => { const n = t - tickDt; if (n <= 0) cooldowns.delete(id); else cooldowns.set(id, n); };
  const tickCharge = (c, id) => {
    if (c.n >= c.max) { c.t = 0; return; }
    c.t -= tickDt;
    if (c.t <= 0) { c.n++; const def = defs.get(id); c.t = c.n < c.max ? (def?.recharge || def?.cd || 1) * (game.stats?.get?.('cdrMul') ?? 1) : 0; }
  };
  /** No allocation: Map.forEach with hoisted callbacks. */
  function tickCooldowns(dt) {
    tickDt = dt;
    if (cooldowns.size) cooldowns.forEach(tickCd);
    if (charges.size) charges.forEach(tickCharge);
  }
  function resetOne(id) { cooldowns.delete(id); const c = charges.get(id); if (c) { c.n = c.max; c.t = 0; } }
  function resetCooldowns() { cooldowns.clear(); for (const c of charges.values()) { c.n = c.max; c.t = 0; } }

  // ------------------------------------------------------------------ cast pipeline
  function fail(id, reason) {
    E.emit('skillFail', { id, reason });
    E.emit('spellFail', { reason: reason === 'resource' ? 'mana' : reason, spellId: id });
    return false;
  }
  function resolveElement(def) {
    if (def.element) return def.element;
    return R.attuned || CLASS_DEFS[P()?.cls]?.primary?.[0] || 'fire';
  }
  function aimFor(opts) {
    if (opts?.aim) return opts.aim;
    try { const a = pl()?.getAim?.(); if (a) return a; } catch (_) { /* */ }
    const pos = pl()?.object?.position || v1.set(0, 0, 0);
    const o = pos.clone(); o.y += 1.5;
    const d = new THREE.Vector3(); try { game.camera.getWorldDirection(d); } catch (_) { d.set(0, 0, -1); }
    return { origin: o, dir: d, point: o.clone().addScaledVector(d, 20), target: null };
  }
  function originFor(fam, aim) {
    const p = pl();
    try {
      if (p?.getWeaponTip) return p.getWeaponTip('main', new THREE.Vector3());
      if (fam === 'melee' && p?.getSwordTip) return p.getSwordTip(new THREE.Vector3());
      if (p?.getStaffTip) return p.getStaffTip(new THREE.Vector3());
    } catch (_) { /* */ }
    return aim?.origin ? aim.origin.clone() : (p?.object?.position?.clone?.() || new THREE.Vector3()).setY((p?.object?.position?.y || 0) + 1.5);
  }
  function tierOf(def, slot) {
    if (slot === 'ult' || def.slot === 'ultimate' || def.slot === 'finisher') return 'ult';
    if (def.slot === 'charged' || def.tags?.includes('heavy')) return 'heavy';
    return def.slot === 'basic' ? 'light' : 'heavy';
  }
  function buildCtx(id, def, el, fam, opts, aim, castMul) {
    const params = effectiveParams(id);
    const slot = opts.slot || def.slot;
    const src = game.player?.entity || 'player';
    const tier = tierOf(def, slot);
    const awakened = !!opts.awakened;
    const ctx = {
      game, skillId: id, def, element: el, params, family: fam, style: style(), cls: P()?.cls,
      origin: originFor(fam, aim), aim, charge: opts.charge ?? 1, slot, awakened, castMul,
      S: game.spells?.api || null, M: game.sword?.api || null,
      hit(base) {
        const h = base || {};
        h.skillId = id; h.slot = slot; if (!h.element) h.element = el; h.source = src; if (!h.tier) h.tier = tier;
        if (castMul !== 1) h.castMul = (h.castMul || 1) * castMul;
        if (def.slot === 'charged') h.charged = true;
        if (def.slot === 'finisher') h.finisher = true;
        if (!h.tags) h.tags = def.tags?.length ? def.tags.slice() : [];
        if (awakened && h.status) for (const k in h.status) { const v = h.status[k]; if (v && typeof v === 'object' && v.stacks) h.status[k] = { ...v, stacks: v.stacks + 1 }; }
        return h;
      },
      after: (t, fn) => (ctx.S?.later ? ctx.S.later(t, fn) : after(t, fn)),
      get powerForDisplay() { return game.stats?.derived?.().power ?? 1; },
      // runtime extras for implementations
      baseDamage: () => baseDamage(params, ctx.charge),
      cooldown: def.cd || 0,
    };
    return ctx;
  }
  function anim(kind, el) { try { pl()?.playCast?.(kind || 'basic', el); } catch (_) { /* */ } }

  /** Implementation resolution (CONTRACT §7.2 step 3). Returns the path name used, or null. */
  function perform(id, def, el, fam, opts, ctx) {
    const A = game.archetypes;
    // 1. bespoke impl (skill id, then def.custom)
    let fn = A?.getImpl?.(id, fam) || (def.custom && def.custom !== id ? A?.getImpl?.(def.custom, fam) : null);
    if (fn) { anim(def.anim, el); fn(ctx); return 'impl'; }
    // 2. legacy adapters
    // The v2 legacy moves only match the v3 tree text for the staff (caster) and for the melee combo / charged /
    // finisher: a bow or totem caster must fire its own archetype (arrows, totems), and melee ultimates / supports
    // must play the skill the tree describes (meteor, fire spirit, ...), not the old v2 sword move list.
    const legacyOk = def.legacy && (fam === 'caster' ? ctx.style === 'staff' || !ctx.style
      : fam === 'melee' ? def.slot !== 'ultimate' && def.slot !== 'support' : true);
    if (legacyOk && K.adapters.tryLegacy(def, fam, el, { charge: opts.charge, aim: ctx.aim, skillId: id, awakened: ctx.awakened, castId: ctx.castId })) return 'legacy';
    // finisher without legacy: cinematic path (works for all 9 elements, §16)
    if (def.slot === 'finisher' && game.cinematic?.finisher && !game.cinematic.isStub) {
      const target = ctx.aim?.target;
      let impacted = false;
      try {
        game.cinematic.finisher({ element: el, cls: P()?.cls, skillId: id, name: def.nameKo, target,
          onImpact: () => { if (impacted) return; impacted = true; fallback.run(ctx); }, onEnd: () => { if (!impacted) { impacted = true; fallback.run(ctx); } } });
        return 'cinematic';
      } catch (err) { log('fin:' + id, '[skills] cinematic finisher failed', err); }
    }
    // 3. archetype of the family
    const name = def.archetype;
    if (name) {
      fn = A?.getArchetype?.(name, fam);
      if (fn) { anim(def.anim, el); fn(ctx); return 'archetype'; }
      // 4. caster archetype fired from the weapon tip (melee family "검기")
      if (fam !== 'caster') {
        fn = A?.getArchetype?.(name, 'caster');
        if (fn) { anim(def.anim, el); ctx.family = 'caster'; ctx.meleeFallback = true; fn(ctx); return 'casterArchetype'; }
      }
    }
    // 5. generic fallback (fail soft, logged once per archetype/family)
    log('noArch:' + (name || def.slot) + ':' + fam, `[skills] no implementation for archetype '${name || def.slot}' (${fam}); using the generic fallback`);
    anim(def.anim, el);
    fallback.run(ctx);
    return 'generic';
  }

  function spendResource(fam, amount) {
    if (!(amount > 0)) return true;
    const p = pl(); if (!p) return true;
    if (fam === 'melee') {
      if (typeof p.spendResolve === 'function') return !!p.spendResolve(amount);
      return true;   // 투지 not implemented yet (player wave 1): free
    }
    if (typeof p.spendMp === 'function') return !!p.spendMp(amount);
    return true;
  }
  function resourceCost(def, fam) { return (def.cost || 0) * (fam === 'melee' ? 0.8 : 1); }

  /**
   * cast(skillId, {free, charge, aim, noAttune, slot, awakened}) — the single cast pipeline.
   * Emits exactly one skillCast, and exactly one spellCast (by the legacy code, or here for archetype/bespoke paths).
   */
  function cast(id, opts = {}) {
    const def = defs.get(id);
    if (!def) return fail(id, 'locked');
    const pr = P(); const free = !!opts.free;
    const fam = family();
    // 1. gate
    if (!free && !game.isTest && !pr?.hasSkill?.(id)) return fail(id, 'locked');
    if (!free && !isReady(id)) return fail(id, 'cooldown');
    const ent = pl()?.entity;
    if (ent && ent.alive === false) return fail(id, 'cantAct');
    try { if (!free && ent && game.combat?.canAct && !game.combat.canAct(ent)) return fail(id, 'cantAct'); } catch (_) { /* */ }
    if (def.slot === 'finisher' && !free) {
      if (!pr?.canFinisher?.()) return fail(id, 'resource');
    }
    // resource: resonance freeNext (§7.2 step 6), mage 원소 연쇄, ranger focus talent → free
    const S = game.stats;
    const el = resolveElement(def);
    let castMul = opts.awakened ? 1.3 : 1, freeCast = free;
    let usedFreeNext = false;
    if (!free && S?.get?.('freeNext')) { castMul *= S.get('nextMul') || 1; freeCast = true; usedFreeNext = true; }
    let usedChain = false;
    if (!freeCast) { const m = K.kits?.chainFreeMul?.(def, el); if (m) { castMul *= m; freeCast = true; usedChain = true; } }
    if (!freeCast && S?.get?.('focusFreeCast') && game.timeScale?.has?.('focus')) freeCast = true;
    if (!freeCast) {
      const cost = resourceCost(def, fam);
      if (!spendResource(fam, cost)) { try { game.audio?.play?.('mana_empty', { volume: 0.5 }); } catch (_) { /* */ } return fail(id, 'resource'); }
    }
    if (def.slot === 'finisher' && !free) { if (!pr.consumeAwakening?.()) return fail(id, 'resource'); }
    // lightning keystone: casts cost 2% of current HP (never lethal)
    const hpCost = !free ? (S?.get?.('castHpCost') || 0) : 0;
    if (hpCost > 0 && pl()) {
      const p = pl(); const amt = Math.min(Math.max(0, (p.hp || 0) - 1), (p.hp || 0) * hpCost);
      if (amt > 0) { p.hp -= amt; if (p.entity) p.entity.hp = p.hp; }
    }
    // 2. auto-attune (BotW flow): once, setters silent
    if (!opts.noAttune && def.element && def.element !== R.attuned && def.slot !== 'finisher') attune(def.element, { force: true });
    // 3. implementation
    const aim = aimFor(opts);
    const ctx = buildCtx(id, def, el, fam, opts, aim, castMul);
    // v4 (PLAN §7.4.1): one castId per cast, stamped before perform; spells/sword use ctx.castId ?? game.nextCastId()
    ctx.castId = opts.castId ?? game.nextCastId?.() ?? 0;
    const seq0 = spellCastSeq;
    let path = null;
    try { path = perform(id, def, el, fam, opts, ctx); }
    catch (err) {
      log('cast:' + id + ':' + fam, '[skills] cast failed', id, fam, err);
      try { fallback.run(ctx); path = 'generic'; } catch (_) { path = null; }
    }
    if (!path) return fail(id, 'cantAct');
    R.lastPath = path;
    // 4. events: exactly one skillCast; spellCast unless the performing (legacy) code emitted it
    const slot = opts.slot || def.slot;
    const origin = ctx.origin;
    E.emit('skillCast', { id, element: el, slot, cls: pr?.cls, family: fam, origin, path, castId: ctx.castId });
    R.lastCastId = ctx.castId;
    if (spellCastSeq === seq0) { opts._emitted = true; E.emit('spellCast', { element: el, kind: SPELL_KIND[def.slot] || 'skill', spellId: id, origin, skillId: id }); }
    // 5. cooldown (compensated time)
    if (!free || game.isTest) startCooldown(id, def);
    // 6. resonance consumption
    if (usedFreeNext) { try { S.consume('freeNext'); } catch (_) { /* */ } }
    if (usedChain) K.kits?.consumeChain?.();
    lastCast.id = id; lastCast.t = now(); lastCast.el = el; lastCast.slot = slot;
    return true;
  }

  /** Slot → skill id (X casts the awakened variant when the capstone is learned; R casts the attuned finisher). */
  function skillForSlot(slot) {
    const el = R.attuned;
    if (slot === 'basic') return el ? el + '.basic' : null;
    if (slot === 'charged') return el ? el + '.charged' : null;
    if (slot === 'ult') {
      const id = loadout.ult; if (!id) return null;
      const d = defs.get(id); const aw = d?.element ? d.element + '.awakened' : null;
      if (aw && defs.has(aw) && isLearned(aw)) return aw;
      return id;
    }
    if (slot === 'fin') {
      if (el && isLearned(el + '.finisher')) return el + '.finisher';
      for (const e of attuneList()) if (isLearned(e + '.finisher')) return e + '.finisher';
      if (P()?.breadth?.().awakened) return 'breadth.finisher';
      return null;
    }
    return loadout[slot] || null;
  }
  function castSlot(slot, opts = {}) {
    const id = skillForSlot(slot);
    if (!id) {
      if (/^q[1-4]$/.test(slot) && !tipShown.empty) { tipShown.empty = true; try { game.ui?.tip?.('emptySlot', '1~4: 빠른 슬롯 · Z: 원소 전환'); } catch (_) { /* */ } }
      E.emit('skillFail', { id: null, reason: 'locked', slot });
      return false;
    }
    const o = opts.slot ? opts : { ...opts, slot };
    // breadth awakening: an ultimate without its capstone casts the awakened variant (+30%, +1 stack)
    if (slot === 'ult' && !defs.get(id)?.replaces && P()?.breadth?.().awakened) { o.awakened = true; }
    return cast(id, o);
  }

  // ------------------------------------------------------------------ input (v3 keymap only; never F)
  function cancelCharge() {
    if (!charge.active) return;
    charge.active = false; charge.frac = 0;
    try { pl()?.setCharging?.(false, charge.el, 0); } catch (_) { /* */ }
  }
  const QUICK_KEYS = ['q1', 'q2', 'q3', 'q4', 'ult', 'sup', 'fin'];
  const act = (n) => { const I = game.input; return I.actionPressed ? I.actionPressed(n) : false; };
  const down = (n) => { const I = game.input; return I.actionDown ? I.actionDown(n) : false; };
  const rel = (n) => { const I = game.input; return I.actionReleased ? I.actionReleased(n) : false; };
  function handleInput(dt) {
    const I = game.input; if (!I || I.gameLocked) { cancelCharge(); return; }
    // basic (hold to auto-cast)
    const hold = game.settings?.values?.holdToCast !== false;
    if (!charge.active && (act('basic') || (hold && down('basic')))) {
      const id = skillForSlot('basic');
      if (id && isReady(id)) castSlot('basic');
    }
    // charged: hold RMB, release to cast
    if (act('charged') && !charge.active) {
      const id = skillForSlot('charged');
      if (id && defs.has(id) && isReady(id)) { charge.active = true; charge.t = 0; charge.frac = 0; charge.id = id; charge.el = R.attuned; }
    }
    if (charge.active) {
      const d = defs.get(charge.id);
      const ct = (d?.chargeTime || 1) / Math.max(0.2, game.stats?.get?.('chargeSpeedMul') || 1);
      charge.t += dt; charge.frac = Math.min(1, charge.t / ct);
      try { pl()?.setCharging?.(true, charge.el, charge.frac); } catch (_) { /* */ }
      if (rel('charged') || !down('charged')) {
        const frac = charge.frac;
        cancelCharge();
        if (frac >= MIN_CHARGE) castSlot('charged', { charge: frac });
      }
    }
    for (let i = 0; i < QUICK_KEYS.length; i++) if (act(QUICK_KEYS[i])) castSlot(QUICK_KEYS[i]);
    if (act('attuneNext')) cycleAttune(+1);
    const w = I.wheel || 0;
    wheelCd -= dt;
    if (w && wheelCd <= 0) { cycleAttune(w > 0 ? 1 : -1); wheelCd = 0.15; }
    if (act('gift')) useGift();
  }

  function useGift() {
    const g = game.enemies?.bosses?.gift || game.enemies?.gift;
    try { if (g?.ready && typeof g.use === 'function') return g.use() !== false; } catch (err) { log('gift', '[skills] gift failed', err); }
    return false;
  }

  // ------------------------------------------------------------------ HUD state (reused; no allocation per call)
  const HUD = {
    v: 3, cls: null, family: 'caster', resource: 'mp', resourceValue: 0, resourceMax: 0, attuned: null,
    elements: [], slots: [], charging: false, chargeFrac: 0,
    awakening: { enabled: false, value: 0, ready: false },
    signature: { kind: 'attunement', value: 0, max: 3, extra: null },
    gift: null, element: null, index: 0,
  };
  const elemPool = [];
  for (let i = 0; i < ALL_ELEMENTS.length + 2; i++) elemPool.push({ id: null, name: '', color: 0, css: '', access: null, unlocked: false, attuned: false, points: 0, mastery: 'none', locked: true });
  for (const s of SLOTS) HUD.slots.push({ slot: s, key: SLOT_KEY[s] || KEY_LABELS[s] || s, id: null, name: '', desc: '', element: null, kind: 'skill', archetype: null,
    cost: 0, resource: 'mp', cooldown: 0, cooldownLeft: 0, ready: false, locked: true, awakened: false, charges: 0 });
  const giftObj = { ready: false, charges: 0, element: null };
  function getHudState() {
    const pr = P(); const p = pl();
    const fam = family();
    HUD.cls = pr?.cls || null; HUD.family = fam;
    HUD.resource = p?.resource || (fam === 'melee' ? 'resolve' : 'mp');
    HUD.resourceValue = HUD.resource === 'resolve' ? (p?.resolve ?? 0) : (p?.mp ?? 0);
    HUD.resourceMax = HUD.resource === 'resolve' ? (p?.maxResolve ?? 100) : (p?.maxMp ?? 100);
    HUD.attuned = R.attuned; HUD.element = R.attuned;
    const list = elementsList();
    HUD.elements.length = 0;
    const un = attuneList();
    for (let i = 0; i < list.length && i < elemPool.length; i++) {
      const el = list[i], o = elemPool[i];
      o.id = el; o.name = elName(el); o.color = elColor(el, 'hex'); o.css = elColor(el, 'css');
      o.access = pr?.access?.(el) || null; o.unlocked = un.includes(el); o.locked = !o.unlocked; o.attuned = el === R.attuned;
      o.points = pr?.pointsIn?.(el) || 0; o.mastery = pr?.mastery?.(el)?.rank || 'none';
      HUD.elements.push(o);
    }
    HUD.index = Math.max(0, list.indexOf(R.attuned));
    const res = HUD.resource;
    for (const o of HUD.slots) {
      const id = skillForSlot(o.slot);
      const d = id ? defs.get(id) : null;
      o.id = d ? id : null;
      o.name = d?.nameKo || ''; o.desc = d?.desc || '';
      o.element = d ? (d.element || R.attuned) : (o.slot === 'basic' || o.slot === 'charged' ? R.attuned : null);
      o.kind = o.slot === 'fin' ? 'finisher' : o.slot === 'sup' ? 'support' : o.slot === 'ult' ? 'ultimate' : d ? (HUD_KIND[d.slot] || 'skill') : (o.slot === 'basic' ? 'basic' : o.slot === 'charged' ? 'heavy' : 'skill');
      o.archetype = d?.archetype || null;
      o.cost = d ? Math.round(resourceCost(d, fam)) : 0; o.resource = res;
      o.cooldown = d ? (cdTotal.get(id) || d.cd || 0) : 0;
      o.cooldownLeft = d ? cdLeft(id) : 0;
      const c = d ? charges.get(id) : null; o.charges = c ? c.n : 0;
      o.locked = !d || !isLearned(id);
      o.awakened = !!d?.replaces || (o.slot === 'ult' && !!pr?.breadth?.().awakened);
      o.ready = !!d && !o.locked && o.cooldownLeft <= 0 && (o.slot !== 'fin' || !!pr?.canFinisher?.());
    }
    HUD.charging = charge.active; HUD.chargeFrac = charge.frac;
    HUD.awakening.enabled = !!pr?.awakeningEnabled?.(); HUD.awakening.value = pr?.awakening || 0; HUD.awakening.ready = !!pr?.canFinisher?.();
    K.kits?.fillSignature?.(HUD.signature);
    const g = game.enemies?.bosses?.gift || game.enemies?.gift;
    if (g) { giftObj.ready = !!g.ready; giftObj.charges = g.charges || 0; giftObj.element = g.element || null; HUD.gift = giftObj; } else HUD.gift = null;
    return HUD;
  }

  // ------------------------------------------------------------------ presets / persistence
  function applyPreset(name, { ignoreBudget = true } = {}) {
    const preset = K.PRESETS[name]; const pr = P();
    if (!preset || !pr?.setRanks) return false;
    pr.setRanks(preset.ranks, { ignoreBudget, ignoreGates: true });
    for (const s of LOADOUT_SLOTS) loadout[s] = null;
    if (preset.loadout) for (const s of LOADOUT_SLOTS) { const id = preset.loadout[s]; if (id && isLearned(id)) equip(s, id, { force: true }); }
    autoEquip();
    const want = preset.attune && attuneList().includes(preset.attune) ? preset.attune : null;
    if (want) attune(want, { silent: !ownsInput() }); else ensureAttune();
    resetCooldowns();
    E.emit('loadoutChanged', { slot: '*', id: null });
    return true;
  }
  function serialize() { return { ...loadout, attuned: R.attuned }; }
  function deserialize(o) {
    if (!o || typeof o !== 'object') { cleanupUnlearned(); ensureAttune(true); return; }
    for (const s of LOADOUT_SLOTS) { const id = o[s]; loadout[s] = id && defs.has(id) && isLearned(id) && slotAccepts(s, defs.get(id)) ? id : null; }
    if (o.attuned && attuneList().includes(o.attuned)) attune(o.attuned, { silent: true }); else ensureAttune(true);
    E.emit('loadoutChanged', { slot: '*', id: null });
  }

  // ------------------------------------------------------------------ update
  function update(dt, realDt) {
    const cdt = (dt || 0) * comp();
    tickCooldowns(cdt);
    runTimers(dt || 0);
    if (game.state === 'playing' && ownsInput()) handleInput(cdt);
    else if (charge.active) cancelCharge();
  }

  // ------------------------------------------------------------------ listeners (§4 rules)
  E.on('skillLearned', () => { paramsCache.clear(); autoEquip(); ensureAttune(); });
  E.on('skillUnlearned', () => { cleanupUnlearned(); ensureAttune(); });
  E.on('respec', () => { cleanupUnlearned(); ensureAttune(); });
  E.on('classChosen', (p) => {
    if (!p?.loaded) { for (const s of LOADOUT_SLOTS) loadout[s] = null; }
    resetCooldowns(); cancelCharge(); R.attuned = null;
    cleanupUnlearned(); ensureAttune();
  });
  E.on('stateChange', (p) => { if (p?.state !== 'playing') cancelCharge(); });
  E.on('playerDeath', () => cancelCharge());

  Object.defineProperties(R, {
    ownsInput: { get: ownsInput, enumerable: true, configurable: true },
    lastCast: { get: () => lastCast, configurable: true },
    charging: { get: () => charge.active, configurable: true },
    chargeFrac: { get: () => charge.frac, configurable: true },
  });
  Object.assign(R, {
    loadout, attuned: null, lastPath: null,
    attune, cycleAttune, equip, unequip, canEquip, autoEquip,
    cast, castSlot, skillForSlot, isReady, cooldownLeft: cdLeft, resetCooldowns,
    /** benchmark / tests: exact copy of the cooldown + charge state, and its restore (core bench.js, §2.8) */
    cooldownSnapshot() { return { cd: [...cooldowns], tot: [...cdTotal], ch: [...charges].map(([k, c]) => [k, { ...c }]) }; },
    cooldownRestore(s) {
      if (!s) return;
      cooldowns.clear(); for (const [k, v] of s.cd) cooldowns.set(k, v);
      cdTotal.clear(); for (const [k, v] of s.tot) cdTotal.set(k, v);
      const keep = new Set(s.ch.map((e) => e[0]));
      for (const k of [...charges.keys()]) if (!keep.has(k)) charges.delete(k);
      for (const [k, c] of s.ch) { const cur = charges.get(k); if (cur) Object.assign(cur, c); else charges.set(k, { ...c }); }
    },
    family, style, effectiveParams, applyPreset, getHudState, useGift,
    serialize, deserialize, after,
    _update: update, _resetOne: resetOne, _ensureAttune: ensureAttune, _cleanup: cleanupUnlearned,
  });
  return R;
}
