// Shared boss framework (CONTRACT §14 bossbase, §15; DESIGN §8.5). Used by every boss in src/enemies/bosses/*.
//   createBoss(ctx, cfg) → entity (built on base.js makeEnemy, isBoss):
//   - HP phases with names: cfg.phases = [{name}, {at:0.66, name}, …]; crossing a threshold clamps HP to it, makes the boss
//     invulnerable for the transition (cfg.transition s, or until cinematic.playPhase ends), emits bossPhase and calls cfg.onPhase(i)
//   - break gauge (breakMax), numeric voidShield, isVoid
//   - weak-point sub-entities: e.addPart({id, name, hp, bone|offset, radius, height, mul, element, shield, lock, fwd, onBreak, onHit})
//     registered with combat (team 'enemy', isBossPart), forwarding damage to the parent pool
//   - per-phase checkpoint: respawnPhase() on player death restores the phase-start HP and parts
//   - arena clamp, telegraph helper (vfx.telegraph → common ring fallback), dissolve on defeat (vfx.dissolve → dissolveFx)
//   - defeat path: cfg.canDie() / cfg.onZero() (Nox purify, Kalis revive) → defeat() emits bossDefeated exactly once
//   - debugPhase(n), debugDefeat(), music hint, bossSpawn payload (spawnPayload())
import * as THREE from 'three';
import { clamp } from '../core/utils.js';
import { makeEnemy } from './base.js';
import { bossScaling, XP_VALUES } from './scaling.js';

const _v = new THREE.Vector3(), _q = new THREE.Vector3();
let partUid = 0;

/** resist map that applies `mulFn()` on top of a base per-element table (Proxy: unknown keys → base ?? 1). */
function scaledResist(base, mulFn) {
  return new Proxy(base || {}, {
    get(t, k) { if (typeof k !== 'string') return undefined; const m = mulFn(k); const b = t[k]; return (b == null ? 1 : b) * m; },
    has() { return true; },
  });
}

export function createBoss(ctx, cfg) {
  const game = ctx.game;
  const arena = cfg.arena || { position: cfg.position || new THREE.Vector3(), radius: 24 };
  const sc = bossScaling(game, cfg.zoneId || 'plains');
  const hp = Math.round((cfg.baseHp || 4000) * (cfg.noScale ? 1 : sc.hpMul));
  let bodyMul = 1;
  const pos = (cfg.position || arena.position).clone();
  const e = makeEnemy(ctx, {
    kind: cfg.id, model: cfg.model, name: cfg.name, hp, radius: cfg.radius ?? 1.2, height: cfg.height ?? 3, mass: cfg.mass ?? 6, isBoss: true,
    resist: null, noTumble: true, facing: cfg.facing ?? 0, staggerDmg: 1e9,
  }, pos);
  e.resist = scaledResist(cfg.resist, (k) => (typeof bodyMul === 'function' ? bodyMul(k) : bodyMul));
  e.bossId = cfg.id; e.title = cfg.title || ''; e.sub = cfg.sub || '';
  e.zoneId = cfg.zoneId || null; e.zoneLevel = sc.level; e.zoneMin = sc.zoneMin; e.zoneDmgMul = sc.dmgMul;
  e.xpValue = cfg.xpValue ?? XP_VALUES[cfg.id] ?? 0;
  e.aggro = true; e.noPhysics = cfg.noPhysics !== false; e.friction = 10;
  if (cfg.breakMax) e.breakMax = cfg.breakMax;
  if (cfg.voidShield) { e.voidShield = cfg.voidShield; e.voidShieldMax = cfg.voidShield; }
  if (cfg.isVoid) e.isVoid = true;
  if (cfg.isFinalBoss) e.isFinalBoss = true;
  e.weakness = cfg.weakness || null;
  e.music = cfg.music || 'boss';
  e.arena = arena;
  e.dissolveColor = cfg.dissolveColor ?? 0xb14bff;
  e.phases = cfg.phases || [{ name: '' }];
  e.phase = 0;                // 0-based index into e.phases
  e.parts = [];
  e.partList = [];            // [{id, name}] for the ui
  e.locks = [];               // bossSpawn payload extension
  e.defeated = false;
  e.transitioning = false;
  e.bossT = 0;
  const checkpoint = { hp, phase: 0 };
  let transT = 0, defeatT = -1, dissolving = false, revived = false, xpHold = null;

  // ------------------------------------------------------------------ helpers for boss files
  e.setBodyMul = (m) => { bodyMul = m; };
  e.tele = (o) => ctx.tele(o);
  e.shakeAt = (p, amt) => {
    const d = Math.hypot(ctx.realPlayerPos.x - p.x, ctx.realPlayerPos.z - p.z);
    game.vfx.shake?.(amt * clamp(1 - d / 60, 0.15, 1));
  };
  e.emitCheck = (kind, state, duration = 0) => game.events.emit('bossCheck', { id: cfg.id, kind, duration, state, boss: e });
  e.clampToArena = (margin = 2) => {
    const p = e.object.position;
    _v.set(p.x - arena.position.x, 0, p.z - arena.position.z);
    const R = arena.radius - margin;
    if (_v.lengthSq() > R * R) { _v.setLength(R); p.x = arena.position.x + _v.x; p.z = arena.position.z + _v.z; }
  };
  e.playerInArena = (extra = 14) => ctx.realPlayerAlive && Math.hypot(ctx.realPlayerPos.x - arena.position.x, ctx.realPlayerPos.z - arena.position.z) < arena.radius + extra;

  // ------------------------------------------------------------------ parts (weak points / heads / plates / shards)
  e.addPart = (o) => {
    const obj = new THREE.Object3D();
    obj.name = 'bosspart:' + o.id;
    game.scene.add(obj);
    const part = {
      id: 'bp' + (++partUid), partId: o.id, name: o.name || '', team: 'enemy', isBossPart: true, alive: true, object: obj,
      hp: o.hp, maxHp: o.hp, radius: o.radius ?? 1.2, height: o.height ?? 2.4, mass: 1e6, statuses: {}, velocity: new THREE.Vector3(),
      parent: e, bone: o.bone || null, offset: o.offset ? o.offset.clone() : new THREE.Vector3(), worldPos: o.worldPos || null,
      mul: o.mul ?? 1, shield: o.shield || null, lock: o.lock ? { ...o.lock, gauge: 100 } : null, fwd: o.fwd ?? 1,
      element: o.element || null, invulnerable: !!o.invulnerable, isVoid: !!o.isVoid, xpValue: 0, zoneLevel: e.zoneLevel,
      weakness: o.weakness || null, data: o.data || null,
      getCenter(out = new THREE.Vector3()) { return out.copy(obj.position).setY(obj.position.y + part.height * 0.5); },
      onHit(result, hit) { partHit(part, result, hit); },
      onDeath(result, hit) { partHit(part, result, hit); partBreak(part, hit); },
      onParried(by) { e.onParried?.(by); },
    };
    part.resist = scaledResist(o.resist, (k) => partMul(part, k));
    if (o.onBreak) part.onBreak = o.onBreak;
    if (o.onPartHit) part.onPartHit = o.onPartHit;
    e.parts.push(part);
    e.partList.push({ id: part.partId, name: part.name });
    if (part.lock) e.locks.push({ partId: part.partId, lock: part.lock.element, counters: part.lock.counters.slice() });
    syncPart(part);
    try { game.combat.register(part); } catch (_) { /* */ }
    return part;
  };
  e.getPart = (id) => e.parts.find((p) => p.partId === id) || null;
  function partMul(part, k) {
    let m = typeof part.mul === 'function' ? part.mul(k) : part.mul;
    const S = part.shield;
    if (S && S.element) m *= S.counters.includes(k) ? (S.counterMul ?? 1.25) : (S.mul ?? 0.3);
    if (part.lock && part.lock.gauge > 0) m *= cfg.lockMul ?? 0.35;
    return m;
  }
  function syncPart(part) {
    const o = part.object;
    if (part.worldPos) o.position.copy(part.worldPos);
    else if (part.bone) { part.bone.getWorldPosition(o.position); o.position.add(part.offset); }
    else { o.position.copy(e.object.position).add(part.offset); }
    o.position.y -= part.height * 0.5;   // combat entities are cylinders from position.y up
  }
  /** Lock stripping (DESIGN §8.6): counter hit strips poise×1, a reaction on the part ×2, the gift 50% once. */
  e.stripLock = (part, amount, by) => {
    const L = part?.lock;
    if (!L || L.gauge <= 0) return false;
    L.gauge = Math.max(0, L.gauge - amount);
    if (L.gauge <= 0) {
      L.stripped = by;
      game.events.emit('lockStripped', { boss: e, id: cfg.id, partId: part.partId, lock: L.element, by });
      try { cfg.onLockStripped?.(part, by); } catch (err) { console.error('[boss] onLockStripped', err); }
      return true;
    }
    return false;
  };
  function partHit(part, result, hit) {
    if (e.defeated) return;
    const dmg = result?.damage || 0;
    // lock gauge
    const L = part.lock;
    if (L && L.gauge > 0 && hit && (hit.source === 'player' || hit.source?.team === 'player' || hit.source === game.player?.entity)) {
      const el = hit.element || 'physical';
      const poise = hit.poise ?? Math.max(4, (hit.amount || dmg) * 0.5);
      if (result?.reaction) e.stripLock(part, poise * 2 * (cfg.lockRate ?? 1), 'reaction');
      else if (L.counters.includes(el)) e.stripLock(part, poise * (cfg.lockRate ?? 1), 'counter');
    }
    try { part.onPartHit?.(part, result, hit); } catch (err) { console.error('[boss] onPartHit', err); }
    try { cfg.onPartHit?.(part, result, hit); } catch (err) { console.error('[boss] cfg.onPartHit', err); }
    // forward to the parent pool (never below the current phase floor; the kill goes through combat for XP)
    if (dmg > 0 && part.fwd > 0) forward(dmg * part.fwd, hit);
  }
  function partBreak(part, hit) {
    if (!part.alive && part._broken) return;
    part._broken = true; part.alive = false; part.hp = 0;
    try { part.onBreak?.(part, hit); } catch (err) { console.error('[boss] part onBreak', err); }
    try { cfg.onPartBreak?.(part, hit); } catch (err) { console.error('[boss] onPartBreak', err); }
  }
  e.reviveParts = (filter) => {
    for (const p of e.parts) {
      if (filter && !filter(p)) continue;
      p.hp = p.maxHp; p.alive = true; p._broken = false; if (p.lock) { p.lock.gauge = 100; p.lock.stripped = null; }
      if (!game.entities?.includes?.(p)) { try { game.combat.register(p); } catch (_) { /* */ } }
    }
  };
  e.breakPart = (part, hit) => { if (part?.alive) { part.alive = false; partBreak(part, hit); } };
  function forward(amount, hit) {
    if (e.invulnerable || e.transitioning) return;
    const floor = phaseFloor();
    const next = e.hp - amount;
    if (next <= 0 && floor <= 0) {
      // let combat kill the pool so `kill` (XP) and onDeath run exactly as for a direct hit
      game.combat.dealDamage(e, { amount: e.hp + 1, fixed: true, source: hit?.source || 'player', noReaction: true, ignoreShield: true, noCrit: true, tags: ['bossPart'] });
      return;
    }
    e.hp = Math.max(Math.max(1, floor), next);
    checkPhase();
  }

  // ------------------------------------------------------------------ phases
  function phaseFloor() {
    const nxt = e.phases[e.phase + 1];
    return nxt ? nxt.at * e.maxHp : 0;
  }
  function checkPhase() {
    if (e.transitioning || e.defeated) return;
    const nxt = e.phases[e.phase + 1];
    if (!nxt) return;
    if (cfg.gate && !cfg.gate(e.phase + 1)) { e.hp = Math.max(e.hp, nxt.at * e.maxHp); return; }   // boss-owned checks hold the floor
    if (e.hp <= nxt.at * e.maxHp + 0.5) enterPhase(e.phase + 1);
  }
  function enterPhase(i, silentCine = false) {
    if (i <= e.phase || i >= e.phases.length) return;
    e.phase = i;
    e.hp = Math.max(1, Math.round(e.phases[i].at * e.maxHp));
    checkpoint.hp = e.hp; checkpoint.phase = i;
    e.transitioning = true; e.invulnerable = true;
    transT = cfg.transition ?? 2.4;
    game.events.emit('bossPhase', { boss: e, id: cfg.id, phase: i + 1, name: e.phases[i].name || '' });
    try { game.post?.pulse?.(0.6, 0.5); } catch (_) { /* */ }
    try { game.timeScale?.set?.('bossPhase', 0.35, 0.6); } catch (_) { /* */ }
    try { cfg.onPhase?.(i); } catch (err) { console.error('[boss] onPhase', err); }
    const C = game.cinematic;
    if (!silentCine && C?.playPhase && !game.isTest) {
      let done = false;
      try { C.playPhase(cfg.id, i + 1, () => { done = true; endTransition(); }); } catch (_) { done = true; }
      void done;
    }
  }
  function endTransition() {
    if (!e.transitioning) return;
    e.transitioning = false; e.invulnerable = !!cfg.keepInvulnerable?.();
    try { cfg.onPhaseStart?.(e.phase); } catch (err) { console.error('[boss] onPhaseStart', err); }
  }
  e.enterPhase = enterPhase;
  e.endTransition = endTransition;

  // ------------------------------------------------------------------ hits on the main body
  const baseReact = e.react;
  e.react = (result, hit, lx, lz) => {
    baseReact?.(result, hit, lx, lz);
    if (e.defeated) return;
    try { cfg.onBodyHit?.(result, hit); } catch (err) { console.error('[boss] onBodyHit', err); }
    checkPhase();
  };

  // ------------------------------------------------------------------ death / defeat
  e.onDeath = (result, hit) => {
    if (e.defeated) return;
    // a boss whose own rules forbid dying here (more phases, Nox purify, Kalis's 2nd life) is restored at 1 HP
    const allow = (e.phase >= e.phases.length - 1) && (cfg.canDie ? cfg.canDie(e) : true);
    if (!allow) {
      e.alive = true; e.hp = Math.max(1, Math.round(e.maxHp * 0.001));
      if (!game.entities?.includes?.(e)) { try { game.combat.register(e); } catch (_) { /* */ } }
      xpHold = e.xpValue; e.xpValue = 0;            // the `kill` event that follows this onDeath awards nothing
      if (e.phase < e.phases.length - 1) {
        const nxt = e.phases[e.phase + 1];
        e.hp = Math.max(1, Math.round(nxt.at * e.maxHp));
        if (!cfg.gate || cfg.gate(e.phase + 1)) enterPhase(e.phase + 1);
      } else { try { cfg.onZero?.(e, hit); } catch (err) { console.error('[boss] onZero', err); } }
      return;
    }
    defeat(hit);
  };
  /** The final defeat: emit bossDefeated once, dissolve, remove. cfg.finale(onDone) can delay the event (nidhoggra). */
  function defeat(hit) {
    if (e.defeated) return;
    e.defeated = true; e.dying = true; e.deathT = 0; e.alive = false; e.invulnerable = true;
    e.setState('dead');
    for (const p of e.parts) { p.alive = false; }
    try { cfg.onDefeat?.(e, hit); } catch (err) { console.error('[boss] onDefeat', err); }
    try { game.timeScale?.set?.('bossDeath', 0.25, 1.0); } catch (_) { /* */ }
    const emit = () => {
      if (e._defeatEmitted) return;
      e._defeatEmitted = true;
      game.events.emit('bossDefeated', { boss: e, id: cfg.id, name: e.name, final: !!cfg.isFinalBoss });
      ctx.onBossDefeated?.(e);
    };
    if (cfg.finale) {
      let fired = false;
      const done = () => { if (fired) return; fired = true; emit(); };
      e._finaleFallback = 25;   // game-time safety net if the cinematic never calls back
      e._finaleDone = done;
      try { cfg.finale(done); } catch (err) { console.error('[boss] finale', err); done(); }
    } else emit();
    defeatT = 0;
  }
  e.defeat = defeat;
  e.deathUpdate = (dt) => {
    e.deathT += dt;
    if (e._finaleDone && !e._defeatEmitted) { e._finaleFallback -= dt; if (e._finaleFallback <= 0) e._finaleDone(); }
    try { cfg.deathPose?.(dt, e.deathT); } catch (_) { /* */ }
    const dAt = cfg.dissolveAt ?? 1.2;
    if (!dissolving && e.deathT > dAt) {
      dissolving = true;
      let ok = false;
      try { ok = !!game.vfx?.dissolve?.(e, { dur: cfg.dissolveDur ?? 1.6, color: e.dissolveColor, stagger: true }); } catch (_) { ok = false; }
      if (!ok) { ctx.dissolveFx(e, 2.5); e._fallbackShrink = true; }
      try { cfg.onDissolve?.(e); } catch (_) { /* */ }
    }
    if (e._fallbackShrink) { const k = clamp((e.deathT - dAt) / 0.6, 0, 1); e.object.scale.setScalar(Math.max(0.001, 1 - k)); }
    const done = e.deathT > dAt + (cfg.dissolveDur ?? 1.6) + 0.8 && (e._defeatEmitted || !e._finaleDone);
    if (done) cleanup();
    return done;
  };
  function cleanup() {
    for (const p of e.parts) { try { game.combat.unregister(p); } catch (_) { /* */ } p.object.removeFromParent(); }
    try { cfg.onRemove?.(e); } catch (err) { console.error('[boss] onRemove', err); }
  }
  e.cleanupParts = cleanup;

  // ------------------------------------------------------------------ checkpoint (DESIGN §8.5: a checkpoint at each phase start)
  e.respawnPhase = () => {
    if (e.defeated) return;
    e.hp = Math.max(e.hp, checkpoint.hp);
    e.transitioning = false; e.invulnerable = false;
    try { cfg.onRespawnPhase?.(e.phase); } catch (err) { console.error('[boss] onRespawnPhase', err); }
  };

  // ------------------------------------------------------------------ debug (CONTRACT §15)
  e.debugPhase = (n) => {
    const i = clamp((n | 0) - 1, 0, e.phases.length - 1);
    if (i <= e.phase) return e.phase + 1;
    for (let k = e.phase + 1; k <= i; k++) {
      e.transitioning = false;
      try { cfg.onDebugPhase?.(k); } catch (_) { /* */ }
      enterPhase(k, true);
    }
    endTransition();
    return e.phase + 1;
  };
  e.debugDefeat = () => {
    if (e.defeated) return true;
    if (cfg.debugDefeat) { try { return cfg.debugDefeat(e); } catch (err) { console.error('[boss] debugDefeat', err); } }
    e.transitioning = false; e.invulnerable = false;
    e.phase = e.phases.length - 1;
    game.combat.dealDamage(e, { amount: e.hp + 1, fixed: true, source: 'player', noReaction: true, ignoreShield: true, noCrit: true, tags: ['debug'] });
    if (!e.defeated) defeat(null);
    return true;
  };

  // ------------------------------------------------------------------ per-frame framework tick (called by the boss's think)
  e.baseTick = (dt) => {
    e.bossT += dt;
    if (xpHold != null && !e.defeated) { e.xpValue = xpHold; xpHold = null; }
    if (e.transitioning) {
      transT -= dt;
      if (transT <= 0 && !(game.cinematic?.active && game.cinematic?.mode === 'gameplay')) endTransition();
    }
    for (let i = 0; i < e.parts.length; i++) syncPart(e.parts[i]);
  };

  /** bossSpawn payload (CONTRACT §9, extended). */
  e.spawnPayload = () => ({
    boss: e, id: cfg.id, name: e.name, title: e.title, sub: e.sub,
    phases: e.phases.slice(1).map((p) => ({ at: p.at, name: p.name })),
    parts: e.partList.slice(), locks: e.locks.slice(),
  });
  void _q;
  return e;
}

/** Shared idempotent model cache for prewarm(): build(key) once, hand it to the first spawn, rebuild for later spawns. */
export function modelCache(build) {
  let spare = null;
  return {
    prewarm() { if (!spare) spare = build(); return spare.root || spare; },
    take() { const m = spare || build(); spare = null; return m; },
  };
}
