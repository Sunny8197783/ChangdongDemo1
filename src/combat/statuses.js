// Status registry + runtime (CONTRACT §8.1, DESIGN §4.4). Owner: combat.
// STATUS_DEFS is pure data (Korean names for the UI). createStatuses(game, C) implements applyStatus / canAct /
// speedMul / canMove / the per-frame tick (DoTs use the source's power snapshot), the aura-order ring and the
// boss rules (×bossMul duration, bossImmune → +break). No allocation per frame.
//
// Aura rule: a status is an aura iff its def has an `element` (and no `aura:false`) AND the stored st.el is an element.
// `frozen` counts as the `chilled` aura; `airborne` is an aura for the wind/earth matrix column (aura:true).

export const STATUS_DEFS = {
  burning:  { nameKo: '화상', color: '#ff7a2a', element: 'fire', dur: 4, dot: { dmg: 6, bossDmg: 8, every: 0.5 }, cancels: ['wet', 'chilled'], spreads: true },
  wet:      { nameKo: '젖음', color: '#5fb8ff', element: 'water', dur: 8, speedMul: 0.92, cancels: ['burning'] },
  chilled:  { nameKo: '냉기', color: '#9fe8ff', element: 'ice', dur: 4, stack: { max: 6, onMax: 'frozen' }, speedMul: 0.6 },
  frozen:   { nameKo: '빙결', color: '#d8f6ff', auraAs: 'chilled', dur: 2.5, preventsAct: true, bossMul: 0.4, blocks: ['burning', 'chilled'], drImmune: 2.0 },
  shocked:  { nameKo: '감전', color: '#c9a4ff', element: 'lightning', dur: 5, dot: { dmg: 3, every: 0.9 }, microStun: true },
  stunned:  { nameKo: '경직', color: '#e0a85a', dur: 1.0, preventsAct: true, bossMul: 0.4, drImmune: 1.5, aura: false },
  encrusted: { nameKo: '석화', color: '#c8955a', element: 'earth', dur: 6, speedMul: 0.9, breakTakenMul: 1.2 },
  airborne: { nameKo: '공중', color: '#c8ffe9', dur: 3, aura: true, bossImmune: true },
  exposed:  { nameKo: '노출', color: '#d070ff', dur: 6, dmgTakenMul: 1.3 },
  seeded:   { nameKo: '씨앗', color: '#8fe05a', element: 'nature', dur: 8, stack: { max: 5, maxStat: 'seededMaxAdd' }, dot: { dmg: 2, every: 1, perStack: true, element: 'nature' } },
  radiant:  { nameKo: '성흔', color: '#ffe08a', element: 'light', dur: 10, stack: { max: 5 }, elDmgTaken: { light: 0.03, perStack: true } },
  corroded: { nameKo: '침식', color: '#b14bff', element: 'shadow', dur: 8, stack: { max: 5, maxStat: 'corrodedMaxAdd' }, dmgTakenPerStack: 0.05, lifestealPerStack: 0.01 },
  dazzled:  { nameKo: '눈부심', color: '#fff6c0', dur: 3, windupMul: 1.4, spreadAdd: 15, parryWindowAdd: 0.1, bossMul: 0.5 },
  rooted:   { nameKo: '속박', color: '#6fcf4a', dur: 2, preventsMove: true, bossImmune: 'break', breakOnImmune: 40 },
  asleep:   { nameKo: '수면', color: '#c9b8ff', dur: 4, preventsAct: true, wakeOnHit: true, firstHitMul: 1.5, buildup: 100, bossImmune: true },
  muddy:    { nameKo: '진흙', color: '#8a6a3a', dur: 1, speedMul: 0.55, bossSpeedMul: 0.8, noDodge: true },
  hexed:    { nameKo: '저주', color: '#7a3cff', dur: 10, dmgTakenMul: 1.2 },
  quickened: { nameKo: '촉진', color: '#c8ff6a', dur: 6, flatOn: { lightning: 25, nature: 25 } },
  cracked:  { nameKo: '균열', color: '#9a7bff', dur: 6 },
  marked:   { nameKo: '표식', color: '#b98bff', dur: 6, stack: { max: 5 } },
  blight:   { nameKo: '공허 침식', color: '#5a2a9a', dur: 6, playerOnly: true, flags: ['regenDisabled'], dmgDealtMul: 0.9 },
  // reaction-owned statuses (not auras; shown as pips by the UI through statusInfo)
  necroflame: { nameKo: '흑염', color: '#9a5cff', dur: 6, dot: { dmg: 10, every: 0.5, element: 'shadow', healPct: 0.3 }, aura: false },
  broken:   { nameKo: '붕괴', color: '#ffffff', dur: 4, dmgTakenMul: 1.5, aura: false },
  cursedMist: { nameKo: '독무', color: '#7a3cff', dur: 1, dmgDealtMul: 0.7, aura: false },
};

/** Ids of every aura-capable status (data-driven). */
export const AURA_STATUSES = Object.keys(STATUS_DEFS).filter((k) => {
  const d = STATUS_DEFS[k]; return d.aura === true || (d.aura !== false && (d.element || d.auraAs));
});

const RING_MAX = 8;

export function createStatuses(game, C) {
  const stats = () => game.stats;
  const fromPlayer = (src) => src === 'player' || src?.team === 'player';
  const dotHit = { amount: 0, element: 'fire', source: null, tags: ['dot'], noReaction: true, isDot: true, powerSnap: 1, noCrit: true, statusId: null };

  // ---------------- aura order ring (newest first) ----------------
  function ringTouch(t, key) {
    let r = t.auraOrder;
    if (!r) r = t.auraOrder = [];
    const i = r.indexOf(key);
    if (i === 0) return;
    if (i > 0) r.splice(i, 1);
    r.unshift(key);
    if (r.length > RING_MAX) r.length = RING_MAX;
  }
  function ringDrop(t, key) {
    const r = t.auraOrder; if (!r) return;
    const i = r.indexOf(key); if (i >= 0) r.splice(i, 1);
  }
  /** Is `name` currently an aura on t (element-tagged)? */
  function isAura(t, name) {
    const st = t?.statuses?.[name]; if (!st) return false;
    const d = STATUS_DEFS[name];
    if (!d) return false;
    if (d.aura === true) return true;
    if (d.aura === false) return false;
    if (d.auraAs) return true;
    return !!(d.element && st.el && st.el !== 'physical');
  }
  const ringKeyOf = (name) => STATUS_DEFS[name]?.auraAs || name;

  function removeStatus(t, name, why) {
    const s = t?.statuses; if (!s || !s[name]) return;
    const st = s[name];
    delete s[name];
    const key = ringKeyOf(name);
    if (key === 'chilled') { if (!s.chilled && !s.frozen) ringDrop(t, 'chilled'); }
    else ringDrop(t, key);
    if (name === 'frozen' && st.time <= 0) t._freezeImmuneUntil = game.time + (t.isBoss ? 4 : (STATUS_DEFS.frozen.drImmune || 1.5));
    if (name === 'stunned' && st.time <= 0) t._stunImmuneUntil = game.time + (t.isBoss ? 2 : 0.75);
    if (why !== 'clear') { try { C._onStatusEnd?.(t, name, st, why); } catch (_) { /* */ } }
  }

  function maxStacks(t, name, d, source) {
    let m = d.stack?.max || 1;
    if (d.stack?.maxStat && fromPlayer(source)) { try { m += stats()?.get?.(d.stack.maxStat) || 0; } catch (_) { /* */ } }
    return m;
  }
  function freezeThreshold(source) {
    let n = STATUS_DEFS.chilled.stack.max;
    if (fromPlayer(source)) { try { n -= stats()?.get?.('chillToFreezeAdd') || 0; } catch (_) { /* */ } }
    return Math.max(2, n);
  }

  const sk = (k, d) => { try { const v = stats()?.get?.(k); return v === undefined || v === null ? d : v; } catch (_) { return d; } };
  function playerDur(name, sec) {
    if (name === 'burning') return sec + (sk('burnDurAdd', 0) || 0);
    if (name === 'wet') return sec + (sk('wetDurAdd', 0) || 0);
    if (name === 'frozen') return (sec + (sk('frozenDurAdd', 0) || 0)) * (sk('frozenDurMul', 1) || 1);
    return sec;
  }
  /** CONTRACT §8.1 signature: applyStatus(t, name, seconds, extra={stacks, source, power, el}). */
  function applyStatus(t, name, seconds, extra) {
    if (!t || !t.alive || !name) return false;
    if (!t.statuses) t.statuses = {};
    const s = t.statuses, d = STATUS_DEFS[name] || null;
    if (seconds == null || !(seconds > 0)) seconds = d?.dur ?? 3;
    const isPl = t.team === 'player';
    if (d?.playerOnly && !isPl) return false;
    const src = extra?.source;
    // boss rules
    if (t.isBoss && d?.bossImmune) {
      if (d.bossImmune === 'break' && d.breakOnImmune) { try { C.addBreak?.(t, d.breakOnImmune, { kind: 'status' }); } catch (_) { /* */ } }
      return false;
    }
    if (t.isBoss && d?.bossMul) seconds *= d.bossMul;
    // tree passives (player sources only): 불씨의 숨결 / 서리 손길 / 영구동토 / 물의 인도
    if (!isPl && fromPlayer(src)) seconds = playerDur(name, seconds);
    if (isPl && name === 'shocked') { try { if (stats()?.get?.('selfElectroImmune')) return false; } catch (_) { /* */ } }
    if (isPl && name === 'burning') { try { if (stats()?.get?.('burnImmune')) return false; } catch (_) { /* */ } }
    if (isPl && name === 'blight') { try { if (stats()?.get?.('blightImmune')) return false; } catch (_) { /* */ } }
    const now = game.time;
    // diminishing returns (existing v2 rules)
    if (name === 'stunned') {
      if (!s.stunned && (t._stunImmuneUntil || 0) > now) return false;
      if (s.stunned) { seconds = Math.min(seconds, (t.isBoss ? 0.8 : 2) - s.stunned.age); if (seconds <= s.stunned.time) return false; }
    }
    if (name === 'frozen') {
      if (!s.frozen && (t._freezeImmuneUntil || 0) > now) return false;
      if (s.frozen) { seconds = Math.min(seconds, (t.isBoss ? 1.2 : 3.5) - s.frozen.age); if (seconds <= s.frozen.time) return false; }
    }
    // cancels / blocks (wet ↔ burning extinguish; frozen blocks burning & chilled). necroflame is not water-cancellable.
    if (name === 'burning') { if (s.wet) { removeStatus(t, 'wet', 'cancel'); return false; } if (s.frozen) return false; if (s.chilled) removeStatus(t, 'chilled', 'cancel'); }
    if (name === 'wet' && s.burning) removeStatus(t, 'burning', 'cancel');
    if (name === 'chilled') {
      if (s.frozen) return false;
      if (s.chilled) {
        const st = s.chilled;
        st.stacks = (st.stacks || 1) + Math.max(1, extra?.stacks || 1);
        st.time = Math.max(st.time, seconds); st.dur = Math.max(st.dur, seconds);
        if (extra?.el) st.el = extra.el;
        if (src !== undefined) st.source = src;
        ringTouch(t, 'chilled');
        if (st.stacks >= freezeThreshold(src) && !t.isBoss && !isPl) { st.stacks = 0; applyStatus(t, 'frozen', STATUS_DEFS.frozen.dur, { source: src, el: 'ice' }); }
        return true;
      }
    }
    if (name === 'frozen') { if (s.burning) removeStatus(t, 'burning', 'cancel'); t.velocity?.multiplyScalar?.(0.1); }

    const had = !!s[name];
    const cur = s[name] || (s[name] = { time: 0, dur: 0, age: 0, stacks: 0, tick: 0.5, el: null, source: null, power: 1, stunT: 0 });
    if (!had) { cur.stacks = 0; cur.age = 0; cur.el = null; cur.source = null; cur.power = 1; cur.holy = false; cur.stunT = 0; cur.spreadT = 0.6; }
    cur.time = Math.max(cur.time, seconds); cur.dur = Math.max(cur.dur, seconds);
    // stacks (buildup statuses: one hit = one stack unless extra.stacks)
    if (d?.stack) {
      const add = Math.max(1, extra?.stacks || 1);
      cur.stacks = Math.min(maxStacks(t, name, d, src), (had ? cur.stacks : 0) + add);
      if (had) cur.time = Math.max(cur.time, d.dur || seconds);   // refresh
    } else cur.stacks = 1;
    if (extra) {
      if (extra.el !== undefined) cur.el = extra.el;
      if (extra.source !== undefined) cur.source = extra.source;
      if (extra.power != null) cur.power = extra.power;
      if (extra.holy) cur.holy = true;
      for (const k in extra) if (!(k in cur) && k !== 'stacks') cur[k] = extra[k];   // legacy extras (e.g. {earth:true})
    }
    if (!cur.el && d?.element && extra?.el === undefined) cur.el = d.element;
    if (!had || extra?.power == null) {
      if (fromPlayer(cur.source ?? src)) { try { cur.power = extra?.power ?? stats()?.derived?.().power ?? 1; } catch (_) { cur.power = 1; } }
    }
    if (!had) {
      if (d?.dot) cur.tick = d.dot.every;
      if (name === 'shocked') { cur.tick = 0.9; cur.stunT = 0; }
      game.events.emit('statusApplied', { target: t, status: name, stacks: cur.stacks, el: cur.el });
    }
    if (isAura(t, name)) ringTouch(t, ringKeyOf(name));
    return true;
  }

  function hasStatus(t, name) { return !!t?.statuses?.[name]; }
  function stacksOf(t, name) { const st = t?.statuses?.[name]; return st ? (st.stacks || 1) : 0; }
  function clearStatus(t, name) {
    if (!t?.statuses) return;
    if (name) removeStatus(t, name, 'clear');
    else { for (const k in t.statuses) delete t.statuses[k]; if (t.auraOrder) t.auraOrder.length = 0; }
  }
  function canAct(e) {
    const s = e?.statuses; if (!s) return true;
    if (s.frozen || s.stunned || s.asleep) return false;
    if (s.shocked && s.shocked.stunT > 0) return false;
    return true;
  }
  function canMove(e) {
    const s = e?.statuses; if (!s) return true;
    return canAct(e) && !s.rooted;
  }
  function speedMul(e) {
    const s = e?.statuses; if (!s) return 1;
    if (s.frozen || s.stunned || s.asleep || s.rooted) return 0;
    let m = 1;
    if (s.chilled) m *= fromPlayer(s.chilled.source) ? Math.max(0.2, 0.6 - (sk('chillSlowAdd', 0) || 0)) : 0.6;
    if (s.wet) m *= 0.92;
    if (s.encrusted) m *= 0.9;
    if (s.muddy) m *= e.isBoss ? 0.8 : 0.55;
    return m;
  }
  /** Damage-taken multiplier from target statuses (the §8.3 conditional term; the flat quickened bonus is separate). */
  function takenMul(t, el) {
    const s = t?.statuses; if (!s) return 1;
    let m = 1;
    if (s.exposed) m *= 1.3;
    if (s.hexed) m *= 1.2;
    if (s.broken) m *= 1.5;
    if (s.corroded) m *= 1 + STATUS_DEFS.corroded.dmgTakenPerStack * (s.corroded.stacks || 1);
    if (s.radiant && el === 'light') m *= 1 + STATUS_DEFS.radiant.elDmgTaken.light * (s.radiant.stacks || 1);
    if (s.shocked && fromPlayer(s.shocked.source)) m *= 1 + (sk('shockedTakenAdd', 0) || 0);   // 정전기
    return m;
  }
  function flatBonus(t, el) {
    const q = t?.statuses?.quickened; if (!q) return 0;
    return STATUS_DEFS.quickened.flatOn[el] || 0;
  }
  /** Outgoing-damage multiplier of an attacker (blight / cursed mist). */
  function dealtMul(src) {
    const s = src?.statuses; if (!s) return 1;
    let m = 1;
    if (s.blight) m *= STATUS_DEFS.blight.dmgDealtMul;
    if (s.cursedMist) m *= STATUS_DEFS.cursedMist.dmgDealtMul;
    return m;
  }

  /** shadow.rx 침식의 지식: inside a curse mist / necroflame the corroded stacks do not fade. */
  function inCurse(e) {
    if (e.statuses?.cursedMist || e.statuses?.necroflame) return true;
    const Z = game.spells?.api?.zones;
    try { return !!(Z?.isInside?.('miasma', e.object.position) || game.world?.surface2?.isCursed?.(e.object.position)); } catch (_) { return false; }
  }
  // ---------------- per-frame tick ----------------
  const near = [];
  function tickDot(e, k, st, d) {
    const dot = d.dot;
    st.tick -= game._combatDt;
    if (st.tick > 0) return true;
    st.tick += dot.every;
    if (st.tick < 0) st.tick = dot.every;
    let amt = e.isBoss && dot.bossDmg ? dot.bossDmg : dot.dmg;
    if (dot.perStack) amt *= (st.stacks || 1);
    if (k === 'burning' && st.holy) amt *= 1.5;
    const isPl = e.team === 'player';
    if (!isPl && fromPlayer(st.source ?? 'player')) {
      if (k === 'burning') amt *= sk('burnTickMul', 1) || 1;
      else if (k === 'seeded') amt *= sk('seededDotMul', 1) || 1;
    }
    dotHit.amount = amt;
    dotHit.element = dot.element || d.element || 'physical';
    dotHit.source = isPl ? (st.source && typeof st.source === 'object' ? st.source : 'env') : (st.source || 'player');
    dotHit.powerSnap = st.power || 1;
    dotHit.statusId = k;
    dotHit.point = null;
    const r = C.dealDamage(e, dotHit);
    if (dot.healPct && r?.damage > 0 && fromPlayer(dotHit.source) && !isPl) { try { C.healPlayer(r.damage * dot.healPct, 'necroflame'); } catch (_) { /* */ } }
    return e.alive;
  }
  function update(dt) {
    game._combatDt = dt;
    const ents = game.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive || !e.statuses) continue;
      if (e.isDummy && e._dummyRefill > 0) { e._dummyRefill -= dt; if (e._dummyRefill <= 0) e.hp = e.maxHp; }
      const s = e.statuses;
      for (const k in s) {
        const st = s[k];
        st.time -= dt; st.age = (st.age || 0) + dt;
        const d = STATUS_DEFS[k];
        if (d?.dot && k !== 'shocked') {
          if (!tickDot(e, k, st, d)) break;
          if (k === 'burning') {
            st.spreadT -= dt;
            if (st.spreadT <= 0) {
              st.spreadT = 0.6;
              const c = C.getCenter(e, C._tv(2));
              C.queryRadius(c, (e.radius || 0.5) + 0.4, e.team, near);
              for (let j = 0; j < near.length; j++) { const o = near[j]; if (o !== e && !o.statuses?.burning && !o.statuses?.wet) applyStatus(o, 'burning', 2.5, { source: st.source, el: 'fire', power: st.power }); }
            }
          }
        } else if (k === 'shocked') {
          if (st.stunT > 0) st.stunT -= dt;
          st.tick -= dt;
          if (st.tick <= 0) {
            st.tick = 0.9; st.stunT = e.isBoss ? 0 : 0.22;
            dotHit.amount = 3; dotHit.element = 'lightning';
            dotHit.source = e.team === 'player' ? (st.source && typeof st.source === 'object' ? st.source : 'env') : (st.source || 'player');
            dotHit.powerSnap = st.power || 1; dotHit.statusId = k; dotHit.point = null;
            C.dealDamage(e, dotHit);
            if (!e.alive) break;
          }
        } else if (k === 'airborne') {
          if (e.grounded && st.age > 0.35) st.time = 0;
        } else if (k === 'frozen') {
          if (e.velocity) { const kd = Math.pow(0.8, dt * 60); e.velocity.x *= kd; e.velocity.z *= kd; }
        }
        if (k === 'corroded' && st.time < 0.25 && fromPlayer(st.source) && sk('corrodeNoFadeInCurse', false) && inCurse(e)) st.time = 0.25;
        if (st.time <= 0 && s[k] === st) removeStatus(e, k, 'expire');
      }
    }
  }

  /** Sleep buildup (pollen): reaching def.buildup puts the target to sleep. */
  function addSleep(t, n) {
    if (!t?.alive || t.isBoss) return false;
    t._sleepBuild = (t._sleepBuild || 0) + n;
    if (t._sleepBuild >= STATUS_DEFS.asleep.buildup) { t._sleepBuild = 0; return applyStatus(t, 'asleep', STATUS_DEFS.asleep.dur); }
    return false;
  }

  return { applyStatus, hasStatus, clearStatus, removeStatus, stacksOf, canAct, canMove, speedMul, takenMul, flatBonus, dealtMul,
    isAura, ringKeyOf, update, addSleep, statusInfo: (id) => STATUS_DEFS[id] || null };
}
