// Stats & modifier aggregator (CONTRACT §5). game.stats.
//   set(sourceId, mods, {duration}) / clear / has / timeLeft / get(key) / markDirty / update(dt) / derived()
//   elementDmg(el) / reactionDmg(id, family?) / consume(key) / registerProc(sourceId, event, fn)
// Source records are pooled and reused (no allocation per set()). Recompute is lazy (at most once per frame on the next
// get() or in update()). update(dt) runs in GAME time (core frame order, only while 'playing') and emits at most ONE
// statsChanged per frame. Mastery is NOT a source here; it lives in progression.damageMul.
import { ALL_ELEMENTS } from './elements.js';
import { CLASS_DEFS } from './classes.js';

// Key kinds: 'mul' (default 1, product), 'add' (default 0, sum), 'flag' (default false, OR).
const MUL_KEYS = ['atkMul', 'dmgTakenMul', 'moveMul', 'atkSpeed', 'castSpeed', 'cdrMul', 'maxHpMul', 'maxResMul', 'healMul',
  'regenRateMul', 'poiseMul', 'glideStamMul', 'dashDistMul', 'nextMul',
  'rxAll'];   // rxAll: global reaction-damage multiplier (e.g. the 방랑자 breadth source: 1 + 0.04 × trees)
const ADD_KEYS = ['critChance', 'critMul', 'regenDelayAdd', 'regenRateAdd', 'lifesteal', 'chainBonus', 'extraDash', 'extraJumps',
  'parryWindowAdd', 'chillToFreezeAdd', 'seededMaxAdd', 'corrodedMaxAdd', 'podCapAdd', 'resolveRegenAdd'];
const FLAG_KEYS = ['noKnockback', 'noGlide', 'regenDisabled', 'burnImmune', 'infiniteGlide', 'noRegenPause', 'freeNext', 'blightImmune'];

const KIND = new Map();
for (const k of MUL_KEYS) KIND.set(k, 'mul');
for (const k of ADD_KEYS) KIND.set(k, 'add');
for (const k of FLAG_KEYS) KIND.set(k, 'flag');
for (const el of ALL_ELEMENTS) KIND.set(el + 'Dmg', 'mul');
/** Kind of a key. Unknown keys follow the naming convention: *Mul / *Dmg / rx_* / rxFamily_* multiply, booleans OR, rest add. */
export function keyKind(key, sample) {
  let k = KIND.get(key);
  if (k) return k;
  if (typeof sample === 'boolean') k = 'flag';
  else if (/(Mul|Dmg)$/.test(key) || key.startsWith('rx_') || key.startsWith('rxFamily_')) k = 'mul';
  else k = 'add';
  KIND.set(key, k);
  return k;
}
export const MODS_KEYS = { mul: MUL_KEYS, add: ADD_KEYS, flag: FLAG_KEYS };
const defOf = (kind) => (kind === 'mul' ? 1 : kind === 'add' ? 0 : false);

export function createStats(game) {
  const sources = new Map();     // id → record
  const pool = [];               // free records
  const agg = Object.create(null);   // key → aggregated value
  const procs = new Map();       // sourceId → [{event, fn, off}]
  let dirty = true, changed = false, lastEmitFrame = -1, frameNo = 0;
  let emitCount = 0;

  function rec(id) {
    let r = sources.get(id);
    if (!r) {
      r = pool.pop() || { id: '', keys: [], vals: [], n: 0, expires: Infinity };
      r.id = id; r.n = 0; r.expires = Infinity;
      sources.set(id, r);
    }
    return r;
  }
  function release(r) {
    sources.delete(r.id);
    r.n = 0; r.id = '';
    for (let i = 0; i < r.vals.length; i++) r.vals[i] = 0;   // drop references
    pool.push(r);
  }

  function recompute() {
    for (const k in agg) agg[k] = defOf(keyKind(k));
    for (const r of sources.values()) {
      for (let i = 0; i < r.n; i++) {
        const k = r.keys[i], v = r.vals[i];
        const kind = keyKind(k, v);
        let cur = agg[k];
        if (cur === undefined) cur = defOf(kind);
        if (kind === 'mul') cur *= (typeof v === 'number' ? v : 1);
        else if (kind === 'add') cur += (typeof v === 'number' ? v : 0);
        else cur = cur || !!v;
        agg[k] = cur;
      }
    }
    dirty = false;
  }

  const DER = { maxHp: 100, maxMp: 100, maxResolve: 0, maxStamina: 100, power: 1, defense: 0, crit: 0.1, critMul: 1.5, move: 1,
    regenDelay: 5, regenDelayOOC: 3, regenRate: 0.015, regenRateOOC: 0.08 };

  const S = {
    /** Replace a source's contribution. duration (s, game time) makes it timed. */
    set(sourceId, mods, opts) {
      if (!sourceId) return;
      const r = rec(sourceId);
      r.n = 0;
      if (mods) {
        for (const k in mods) {
          const v = mods[k];
          if (v === undefined || v === null) continue;
          r.keys[r.n] = k; r.vals[r.n] = v; r.n++;
          keyKind(k, v);
        }
      }
      const d = opts?.duration;
      r.expires = d != null && d > 0 ? (game.time || 0) + d : Infinity;
      S.markDirty();
    },
    clear(sourceId) {
      const r = sources.get(sourceId);
      const pl = procs.get(sourceId);
      if (pl) { for (const p of pl) p.off?.(); procs.delete(sourceId); }
      if (!r) return false;
      release(r); S.markDirty();
      return true;
    },
    /** Clear every source whose id starts with prefix (e.g. 'buff:'). */
    clearPrefix(prefix) {
      let any = false;
      for (const id of [...sources.keys()]) if (id.startsWith(prefix)) { S.clear(id); any = true; }
      for (const id of [...procs.keys()]) if (id.startsWith(prefix)) S.clear(id);
      return any;
    },
    has(sourceId) { return sources.has(sourceId); },
    timeLeft(sourceId) {
      const r = sources.get(sourceId); if (!r) return 0;
      return r.expires === Infinity ? Infinity : Math.max(0, r.expires - (game.time || 0));
    },
    sourceIds() { return [...sources.keys()]; },
    /** Aggregated value of a key (default 1 / 0 / false). Never allocates. */
    get(key) {
      if (dirty) recompute();
      const v = agg[key];
      return v === undefined ? defOf(keyKind(key)) : v;
    },
    markDirty() { dirty = true; changed = true; },
    /** Use up an additive/flag key (e.g. 'freeNext'): clears every source that contributes it. Returns true if any. */
    consume(key) {
      let hit = false;
      for (const r of sources.values()) {   // deleting the current entry during Map iteration is safe
        for (let i = 0; i < r.n; i++) if (r.keys[i] === key && r.vals[i]) { S.clear(r.id); hit = true; break; }
      }
      return hit;
    },
    /** Core frame order: expire timed sources (game time), recompute if dirty, emit ONE statsChanged per frame at most. */
    update(dt) {
      frameNo++;
      const now = game.time || 0;
      for (const r of sources.values()) if (r.expires <= now) { S.clear(r.id); }
      S.flush();
    },
    /** Recompute + emit without expiring (used by main outside 'playing' so menus see changes). */
    flush() {
      if (dirty) recompute();
      if (changed && lastEmitFrame !== frameNo) {
        changed = false; lastEmitFrame = frameNo; emitCount++;
        game.events.emit('statsChanged', {});
      }
    },
    get emitCount() { return emitCount; },
    /** Base stats from class + level growth (DESIGN §5.3) + mods. Reused object. */
    derived() {
      if (dirty) recompute();
      const P = game.progression;
      const c = CLASS_DEFS[P?.cls] || CLASS_DEFS.mage;
      const b = c.base;
      const L = Math.max(1, P?.level || 1);
      const g = (L - 1);
      DER.maxHp = Math.round(b.hp * (1 + 0.06 * g) * S.get('maxHpMul'));
      const resMul = (1 + 0.02 * g) * S.get('maxResMul');
      DER.maxMp = Math.round((b.mp || 0) * resMul);
      DER.maxResolve = Math.round((b.resolve || 0) * resMul);
      DER.maxStamina = Math.round((b.stamina || 100) * (1 + 0.02 * g));
      DER.power = (b.power || 1) * (1 + 0.04 * g);
      DER.defense = b.defense || 0;
      DER.crit = b.crit ?? 0.1;
      DER.critMul = 1.5 + S.get('critMul');
      DER.move = (b.move || 1) * S.get('moveMul');
      const hard = game.difficulty?.id === 'hard';
      DER.regenDelay = 5; DER.regenDelayOOC = 3;
      DER.regenRate = 0.015 * (hard ? 0.8 : 1); DER.regenRateOOC = 0.08;
      return DER;
    },
    /** Product of every source's <el>Dmg (keystones etc.). NOT mastery. */
    elementDmg(el) { return el ? S.get(el + 'Dmg') : 1; },
    /** Product of rx_<id> and the family bonus rxFamily_<family> (+ the global 'rxAll' key, e.g. breadth). */
    reactionDmg(id, family) {
      let m = S.get('rx_' + id) * S.get('rxAll');
      if (family) m *= S.get('rxFamily_' + family);
      else {
        const def = game.combat?.REACTION_DEFS?.find?.((r) => r.id === id);
        if (def?.family) m *= S.get('rxFamily_' + def.family);
      }
      return m;
    },
    /** Proc listener owned by a source; removed on clear(sourceId). */
    registerProc(sourceId, eventName, fn) {
      if (!sourceId || !eventName || typeof fn !== 'function') return;
      const off = game.events.on(eventName, fn);
      if (!procs.has(sourceId)) procs.set(sourceId, []);
      procs.get(sourceId).push({ event: eventName, fn, off });
    },
    /** Debug snapshot (allocates; tests only). */
    dump() {
      if (dirty) recompute();
      const out = { sources: {}, agg: { ...agg } };
      for (const r of sources.values()) {
        const m = {}; for (let i = 0; i < r.n; i++) m[r.keys[i]] = r.vals[i];
        out.sources[r.id] = { mods: m, timeLeft: S.timeLeft(r.id) };
      }
      return out;
    },
    reset() { for (const id of [...sources.keys()]) S.clear(id); for (const id of [...procs.keys()]) S.clear(id); S.markDirty(); },
  };
  return S;
}
