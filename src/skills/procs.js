// Passive procs (CONTRACT §7.1 `procs: [{event, fn}]`), registered by id. Owned by skills.
// One listener per event name dispatches to the procs of the currently learned nodes (+ talents); the active set is
// rebuilt on learn/unlearn/respec/class change. 'tick' procs run at 4 Hz from update(). Proc damage is guarded against
// re-entry (a proc hit never triggers procs) and never scales damage itself (combat.dealDamage does, §8.3).
import * as THREE from 'three';

export function createProcs(game, K) {
  const E = game.events;
  const warned = new Set();
  const log = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn(...a); } };
  const P = () => game.progression;
  const pl = () => game.player;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const near = [];
  const icd = new Map();        // key → game time when ready
  const tCd = new WeakMap();    // target → {key: readyTime}
  let inProc = false;
  let hitCount = 0, waterHits = 0;
  const echoes = [];            // pooled {t, target, amount}
  const echoPool = [];

  // ---------------------------------------------------------------- helpers
  const now = () => game.time || 0;
  const isPlayerSrc = (s) => s === 'player' || (s && typeof s === 'object' && s.team === 'player');
  const playerHit = (p) => p && !p.isPlayer && p.target && p.target.team !== 'player' && isPlayerSrc(p.source);
  const hasSt = (t, n) => { try { return game.combat?.hasStatus ? game.combat.hasStatus(t, n) : !!t?.statuses?.[n]; } catch (_) { return false; } };
  const stacks = (t, n) => t?.statuses?.[n]?.stacks || (hasSt(t, n) ? 1 : 0);
  const ready = (k, cd) => { const t = icd.get(k) || -1e9; if (now() < t) return false; icd.set(k, now() + cd); return true; };
  const readyT = (t, k, cd) => {
    if (!t) return false;
    let m = tCd.get(t); if (!m) { m = {}; tCd.set(t, m); }
    if (now() < (m[k] || -1e9)) return false; m[k] = now() + cd; return true;
  };
  const center = (e, out) => out.copy(e.object.position).setY(e.object.position.y + (e.height || 1.6) * 0.5);
  function enemiesNear(pos, r) {
    near.length = 0;
    try { game.combat?.queryRadius?.(pos, r, 'enemy', near); } catch (_) { near.length = 0; }
    return near;
  }
  function deal(t, amount, el, extra) {
    if (!t?.alive || !(amount > 0)) return;
    const C = game.combat; if (!C?.dealDamage) return;
    const was = inProc; inProc = true;
    try {
      const hit = { amount, element: el || 'physical', source: pl()?.entity || 'player', point: center(t, v2).clone(), noReaction: true, tags: ['proc'], skillId: 'proc', tier: 'light' };
      if (extra) Object.assign(hit, extra);
      C.dealDamage(t, hit);
    } catch (err) { log('procDmg', '[skills] proc damage failed', err); }
    finally { inProc = was; }
  }
  function status(t, name, dur, st) {
    try {
      const C = game.combat; if (!C?.applyStatus || !t?.alive) return;
      if (C.STATUS_DEFS) C.applyStatus(t, name, dur, { stacks: st || undefined, source: pl()?.entity || 'player' });
      else for (let i = 0; i < Math.max(1, st || 1); i++) C.applyStatus(t, name, dur);
    } catch (_) { /* */ }
  }
  function heal(pct, src) {
    const p = pl(); if (!p || !(pct > 0)) return;
    const mx = p.maxHp || p.entity?.maxHp || 100;
    try {
      if (game.combat?.healPlayer) game.combat.healPlayer(mx * pct, src || 'proc');
      else { p.hp = Math.min(mx, (p.hp || 0) + mx * pct); if (p.entity) p.entity.hp = p.hp; }
    } catch (_) { /* */ }
  }
  function restore(mp, res) {
    const p = pl(); if (!p) return;
    try {
      if ((p.resource || (game.skills?.family?.() === 'melee' ? 'resolve' : 'mp')) === 'resolve') {
        if (p.addResolve) p.addResolve(res); else if (p.resolve != null) p.resolve = Math.min(p.maxResolve || 100, p.resolve + res);
      } else if (p.restoreMp) p.restoreMp(mp); else if (p.mp != null) p.mp = Math.min(p.maxMp || 100, p.mp + mp);
    } catch (_) { /* */ }
  }
  function playerPos(out) { const p = pl()?.object?.position; return p ? out.copy(p) : out.set(0, 0, 0); }
  function vfx(fn, ...a) { try { game.vfx?.[fn]?.(...a); } catch (_) { /* */ } }

  // ---------------------------------------------------------------- the proc table (id → {event, fn(payload, rank)})
  const PROCS = {
    'fire.rx.overheat': (p) => {                      // burning targets hit by any reaction explode (25, r 3; 1.5 s / target)
      const t = p?.target; if (!t?.alive || !hasSt(t, 'burning') || !readyT(t, 'overheat', 1.5)) return;
      center(t, v1);
      K.api.after?.(0.1, () => { vfx('explosion', v1, { element: 'fire', scale: 0.7 }); for (const e of enemiesNear(v1, 3)) deal(e, 25, 'fire'); });
    },
    'fire.p2.onKill': (p, r) => {
      const t = p?.target; if (!t || t.team === 'player' || !isPlayerSrc(p.source) || !hasSt(t, 'burning')) return;
      restore(4 * r, 4 * r); heal(0.02 * r, 'fire.p2');
    },
    'fire.cap.every3': (p) => {
      if (!playerHit(p) || p.dot) return;
      if (++hitCount % 3 === 0) status(p.target, 'burning', 3, 1);
    },
    'ice.rx.shatterFlash': (p) => {
      if (p?.id !== 'shatter' || !p.target) return;
      center(p.target, v1);
      for (const e of enemiesNear(v1, 4)) if (e !== p.target && hasSt(e, 'chilled')) status(e, 'frozen', 2.5);
    },
    'ice.p2.refund': (p, r) => { if (playerHit(p) && hasSt(p.target, 'frozen') && ready('ice.p2', 0.5)) restore(3 * r, 4 * r); },
    'ice.cap.aura': (p, r, dt) => {
      if (!ready('ice.cap.aura', 2)) return;
      playerPos(v1); for (const e of enemiesNear(v1, 6)) status(e, 'chilled', 4, 1);
    },
    'lightning.p2.bolt': (p, r) => {
      if (!playerHit(p) || !p.crit || !hasSt(p.target, 'shocked') || !ready('lightning.p2', 1)) return;
      center(p.target, v1); vfx('impact', v1, { element: 'lightning' });
      deal(p.target, 20 + 10 * r, 'lightning');
    },
    'lightning.cap.every3': (p) => {
      if (!playerHit(p) || p.dot || p.element !== 'lightning') return;
      if (++hitCount % 3 !== 0) return;
      center(p.target, v1); let n = 0;
      for (const e of enemiesNear(v1, 8)) { if (e === p.target) continue; deal(e, Math.max(1, (p.amount || 10) * 0.3), 'lightning', { status: undefined }); if (++n >= 2) break; }
    },
    'earth.rx.crystal': (p) => {
      if (!p?.elements?.includes?.('earth') || !ready('earth.rx', 4)) return;
      const other = p.elements.find((e) => e !== 'earth') || 'earth';
      try { game.spells?.api?.objects?.spawn?.('crystal', (p.point || center(p.target, v1)), { element: other, source: 'earth.rx' }); } catch (_) { /* */ }
    },
    'earth.p2.spikes': (p, r) => {
      if (!(p?.perfect || p?.parried) || p.target !== pl()?.entity) return;
      playerPos(v1); vfx('explosion', v1, { element: 'earth', scale: 0.6 });
      for (const e of enemiesNear(v1, 3)) deal(e, 30 * r, 'earth', { launch: 2 });
    },
    'earth.cap.heart': () => {
      const p = pl(); const S = game.stats; if (!p || !S) return;
      const low = (p.hp || 0) < 0.4 * (p.maxHp || 100);
      if (low && !S.has('proc:earth.cap')) S.set('proc:earth.cap', { dmgTakenMul: 0.75 });
      else if (!low && S.has('proc:earth.cap')) S.clear('proc:earth.cap');
    },
    'water.rx.spread': (p) => {
      if (!playerHit(p) || p.element !== 'water' || !readyT(p.target, 'wetSpread', 0.5)) return;
      center(p.target, v1);
      let best = null, bd = 16;
      for (const e of enemiesNear(v1, 4)) { if (e === p.target || hasSt(e, 'wet')) continue; const d = e.object.position.distanceToSquared(v1); if (d < bd) { bd = d; best = e; } }
      if (best) status(best, 'wet', 11);
    },
    'water.p2.droplet': (p, r) => {
      if (!playerHit(p) || p.dot) return;
      if (++waterHits % 4 !== 0) return;
      try { game.spells?.api?.objects?.spawn?.('droplet', playerPos(v1), { heal: 0.02 * r, orbit: true, max: 3 }); }
      catch (_) { /* */ }
      if (!game.spells?.api?.objects?.spawn) heal(0.02 * r * 0.5, 'water.p2');   // fallback until magic's droplet objects land
    },
    'water.cap.ward': () => {
      const S = game.stats; const e = pl()?.entity; if (!S || !e) return;
      const wet = hasSt(e, 'wet');
      if (wet && !S.has('proc:water.cap')) S.set('proc:water.cap', { dmgTakenMul: 0.85 });
      else if (!wet && S.has('proc:water.cap')) S.clear('proc:water.cap');
    },
    'nature.p2.spread': (p, r) => {
      const t = p?.target; if (!t || t.team === 'player' || !hasSt(t, 'seeded')) return;
      center(t, v1);
      for (const e of enemiesNear(v1, 6)) if (e !== t) status(e, 'seeded', 8, 1 + r);
    },
    'nature.cap.grove': () => {
      const S = game.stats; if (!S) return;
      playerPos(v1);
      let on = false;
      try { const W = game.world; on = !!(W?.surface2?.isOvergrowth?.(v1) || W?.surface?.isGrass?.(v1) || W?.isGrass?.(v1.x, v1.z)); } catch (_) { on = false; }
      if (on && !S.has('proc:nature.cap')) S.set('proc:nature.cap', { regenDelayAdd: -2 });
      else if (!on && S.has('proc:nature.cap')) S.clear('proc:nature.cap');
    },
    'light.p1.grace': (p, r) => {
      if (!(p?.perfect || p?.parried) || p.target !== pl()?.entity) return;
      heal(0.03 * r, 'light.p1');
      if (p.source && typeof p.source === 'object' && p.source.alive) status(p.source, 'radiant', 10, 1);
    },
    'shadow.p1.drain': (p, r) => { if (playerHit(p) && p.element === 'shadow' && p.amount > 0) healFlat(p.amount * 0.02 * r); },
    'shadow.p2.echo': (p, r) => {
      if (!playerHit(p) || p.element !== 'shadow' || !(p.amount > 0) || p.dot) return;
      const o = echoPool.pop() || { t: 0, target: null, amount: 0 };
      o.t = 3; o.target = p.target; o.amount = p.amount * 0.1 * r;
      if (echoes.length < 24) echoes.push(o); else echoPool.push(o);
    },
    'shadow.cap.cloak': () => {
      try { game.enemies?.setPlayerStealth?.(true, 1.5); } catch (_) { /* */ }
      game.stats?.set?.('proc:shadow.cap', { critChance: 1 }, { duration: 1.5 });
    },
    // talents
    'mage.t25b.reset': (p) => {
      if (!p?.target || !(Math.random() < (game.stats?.get?.('reactionCdResetChance') || 0))) return;
      const lc = K.api.lastCast; if (!lc?.id || now() - lc.t > 2) return;
      try { K.api._resetOne?.(lc.id); } catch (_) { /* */ }
    },
  };
  function healFlat(n) {
    const p = pl(); if (!p || !(n > 0)) return;
    try {
      if (game.combat?.healPlayer) game.combat.healPlayer(n, 'lifesteal');
      else { const mx = p.maxHp || 100; p.hp = Math.min(mx, (p.hp || 0) + n); if (p.entity) p.entity.hp = p.hp; }
    } catch (_) { /* */ }
  }
  const TALENT_PROCS = { 'mage.t25b': [{ event: 'reaction', fn: 'mage.t25b.reset' }] };

  // ---------------------------------------------------------------- active set
  const byEvent = new Map();      // event → [{fn, rank, id}]
  const listening = new Set();
  function listen(ev) {
    if (listening.has(ev) || ev === 'tick') return;
    listening.add(ev);
    E.on(ev, (payload) => {
      if (inProc) return;
      const list = byEvent.get(ev); if (!list || !list.length) return;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        try { e.fn(payload, e.rank, 0); } catch (err) { log('proc:' + e.id, '[skills] proc failed', e.id, err); }
      }
    });
  }
  function add(ev, procId, rank, nodeId) {
    const fn = PROCS[procId]; if (!fn) { log('noproc:' + procId, '[skills] unknown proc', procId); return; }
    if (!byEvent.has(ev)) byEvent.set(ev, []);
    byEvent.get(ev).push({ fn, rank, id: procId, node: nodeId });
    listen(ev);
  }
  function sync() {
    for (const l of byEvent.values()) l.length = 0;
    const pr = P(); if (!pr) return;
    for (const id of pr.learnedNodes?.() || []) {
      const n = K.nodes.get(id); if (!n?.procs) continue;
      const r = pr.rank(id);
      for (const pc of n.procs) add(pc.event, pc.fn, r, id);
    }
    for (const tid of K.talents?.active || []) for (const pc of TALENT_PROCS[tid] || []) add(pc.event, pc.fn, 1, tid);
    // clear dynamic sources whose node is gone
    const S = game.stats;
    for (const k of ['earth.cap', 'water.cap', 'nature.cap', 'shadow.cap']) if (S?.has?.('proc:' + k) && !(pr.rank(k) > 0)) S.clear('proc:' + k);
  }
  for (const ev of ['skillLearned', 'skillUnlearned', 'respec', 'classChosen', 'treesRegistered', 'levelUp', 'talentChosen']) E.on(ev, () => sync());

  // ---------------------------------------------------------------- buff riders (generic, data-driven by skill params)
  // hit-limited buffs (params.hits, e.g. 서리 반격: the next 3 hits taken, freezing the attacker) and next-hit buffs
  // (params.nextCrit / nextHit / firstHit: consumed by the first landed player hit). They act on the `buff:<id>` source,
  // whoever set it (the archetype impl or the generic fallback), so nothing is applied twice.
  const hitsTaken = new Map();   // skillId → hits taken since cast
  const RIDERS_TAKEN = [], RIDERS_DEALT = [];
  for (const [id, d] of K.defs) {
    const p = d.params || {};
    if (p.hits) RIDERS_TAKEN.push(id);
    if (p.nextCrit || p.nextHit || p.firstHit) RIDERS_DEALT.push(id);
  }
  E.on('skillCast', (p) => { if (p?.id && hitsTaken.has(p.id)) hitsTaken.set(p.id, 0); });
  E.on('damage', (p) => {
    if (!p) return;
    const S = game.stats; if (!S) return;
    if (p.isPlayer && !p.dot) {
      for (const id of RIDERS_TAKEN) {
        if (!S.has('buff:' + id)) continue;
        const d = K.defs.get(id); const n = (hitsTaken.get(id) || 0) + 1; hitsTaken.set(id, n);
        const src = p.source && typeof p.source === 'object' && p.source.alive ? p.source : null;
        if (src && d.params.counterFreeze) {
          if (src.isBoss) { status(src, 'chilled', 4, 3); try { game.combat?.addBreak?.(src, 20); } catch (_) { /* */ } }
          else status(src, 'frozen', 2.5);
        }
        if (n >= d.params.hits) { S.clear('buff:' + id); hitsTaken.set(id, 0); }
      }
    } else if (playerHit(p) && !inProc) {
      for (const id of RIDERS_DEALT) {
        if (!S.has('buff:' + id)) continue;
        const d = K.defs.get(id); const left = S.timeLeft('buff:' + id);
        if (d.params.mods && left > 0) S.set('buff:' + id, d.params.mods, { duration: left });   // keep the aura, drop the rider
        else S.clear('buff:' + id);
      }
    }
  });

  let tickT = 0;
  function update(dt) {
    // echoes (shadow.p2) in game time
    for (let i = echoes.length - 1; i >= 0; i--) {
      const o = echoes[i]; o.t -= dt;
      if (o.t > 0) continue;
      echoes[i] = echoes[echoes.length - 1]; echoes.pop();
      if (o.target?.alive) { center(o.target, v1); vfx('impact', v1, { element: 'shadow' }); deal(o.target, o.amount, 'shadow', { isDot: false }); }
      o.target = null; echoPool.push(o);
    }
    tickT -= dt;
    if (tickT > 0) return;
    tickT = 0.25;
    const list = byEvent.get('tick');
    if (list) for (const e of list) { try { e.fn(null, e.rank, 0.25); } catch (err) { log('proc:' + e.id, '[skills] tick proc failed', e.id, err); } }
  }
  return { PROCS, sync, update, active: byEvent, get inProc() { return inProc; } };
}
