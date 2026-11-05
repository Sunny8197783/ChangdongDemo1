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
import { hitTest as refHitTest } from '../core/tellgeom.js';
import { attackSpec, attacksOf, codexOf, BOSS_BRIEF, registerBossCodex } from './bosses/codex.js';

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
  // game.bossTrialHpMul: the post-game 정령 시련 (story/trials.js) re-fights a mid-boss at +30 % HP; parts are sized
  // from e.maxHp, so they scale with it
  const trialMul = Number.isFinite(game.bossTrialHpMul) && game.bossTrialHpMul > 0 ? game.bossTrialHpMul : 1;
  const hp = Math.round((cfg.baseHp || 4000) * (cfg.noScale ? 1 : sc.hpMul) * trialMul);
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
      onDeath(result, hit) { partHit(part, result, hit); if (part.hp > 0) { part.alive = true; if (!game.entities?.includes?.(part)) { try { game.combat.register(part); } catch (_) { /* */ } } return; } partBreak(part, hit); },
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
    if (dmg > 0 && part.fwd > 0) {
      // while the pool ignores damage (transition / invulnerable), the part must not lose HP either, or a
      // forwarding part could die with the pool still standing (softlock)
      if (e.invulnerable || e.transitioning) { part.hp = Math.min(part.maxHp, part.hp + dmg); if (part.hp > 0) part.alive = true; return; }
      forward(dmg * part.fwd, hit);
    }
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
    parts: e.partList.slice(), locks: e.locks.slice(), brief: (BOSS_BRIEF[cfg.id] || []).slice(),
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

// ====================================================================== v4 boss contract (PLAN §4.0, §4.15, §7.4.5)
// Shared by every boss (createBoss users and golem.js):
//   bossAttack(ctx, e, id, over)   → game.tells.attack with the §4 numbers (nameKo from bosses/codex.js) + enemyAttack {id, nameKo, tell, windup}
//   bossHit(ctx, e, handle|shape|null, hit, {jumpAvoid, pad})   → the ONE hit path: tells.hitTest / h.contains, attack:{id, nameKo, kind}
//   rhythm(game, h)                → 'wind' | 'hold' | 'strike' | 'done' (hold 0.15 s at the top, strike ≤ 0.12 s before the hit)
//   finishBoss(ctx, e, o)          → contract fields, enemy-time clock, per-entity hitstop, pose hold/LOD rate, break → 3.5 s stagger,
//                                    first-sight encounter, codex/preview registration; call it at the end of every boss factory.
const _tp = new THREE.Vector3(), _td = new THREE.Vector3();
const _fr = new THREE.Frustum(), _fm = new THREE.Matrix4(), _fs = new THREE.Sphere();
export const BOSS_BREAK = Object.freeze({ dur: 3.5, cd: 12, mul: 1.5 });
export const RHYTHM = Object.freeze({ hold: 0.15, strike: 0.12 });
const warned = {};
const warnOnce = (k, ...a) => { if (!warned[k]) { warned[k] = true; console.warn('[bosses]', ...a); } };
const META = {};
/** Reused hit metadata object per attack id ({id, nameKo, kind}). */
export function attackMeta(id) {
  if (META[id]) return META[id];
  const S = attackSpec(id);
  return (META[id] = Object.freeze({ id, nameKo: S?.nameKo || '', kind: S?.kind === 'check' ? 'melee' : (S?.kind || 'melee') }));
}
export const bossTime = (game) => game.enemyTime || 0;
/** Reference hit test (tells when present, else core/tellgeom). */
export function shapeHit(game, shape, pos, pad = 0.15) {
  const T = game.tells;
  try { if (T?.hitTest) return T.hitTest(shape, pos, pad); } catch (_) { /* */ }
  return refHitTest(shape, pos, pad);
}

/** Start boss attack `id` now through game.tells.attack. Returns the TellHandle, or null when tells refuses. */
export function bossAttack(ctx, e, id, over = null) {
  const game = ctx.game, S = attackSpec(id);
  if (!S || !e || e.defeated || e.alive === false) return null;
  if (e.bossBrokenUntil > bossTime(game)) return null;
  const T = game.tells;
  if (!T?.attack) { warnOnce('tells', 'game.tells.attack missing'); return null; }
  const p2 = (e.phase || 0) >= 1 || !!e.phase2;
  const shape = S.shape || over?.shape ? Object.assign({}, S.shape || null, over?.shape || null) : undefined;
  const spec = { id, nameKo: S.nameKo, tell: S.tell, cls: S.cls, windup: over?.windup ?? ((p2 && S.windup2) || S.windup),
    melee: S.melee ?? S.kind === 'melee', anchor: S.anchor };
  if (shape) spec.shape = shape;
  if (S.lockAt != null) spec.lockAt = S.lockAt;
  if (S.punishDur) spec.punishDur = S.punishDur;
  if (S.shockwave) spec.shockwave = S.shockwave;
  if (S.targetsPlayer === false) spec.targetsPlayer = false;
  if (over) for (const k of ['body', 'icon', 'sound', 'targetsPlayer', 'lockAt', 'melee', 'anchor', 'el']) if (over[k] !== undefined) spec[k] = over[k];
  let h = null;
  try { h = T.attack(e, spec); } catch (err) { console.error('[bosses] tells.attack', id, err); h = null; }
  if (!h) return null;
  h.bossId = id;
  const L = e._handles || (e._handles = []);
  for (let i = L.length - 1; i >= 0; i--) if (!L[i].alive) L.splice(i, 1);
  L.push(h);
  if (!over || over.hold !== false) e._holdH = h;
  game.events.emit('enemyAttack', { enemy: e, kind: id.slice(id.indexOf('.') + 1), id, nameKo: S.nameKo, tell: S.tell, windup: h.dur });
  return h;
}
/** Stop every live attack handle of e (break / phase change / death). */
export function stopAttacks(e, reason = 'cancel') {
  const L = e?._handles; if (!L) return;
  for (let i = 0; i < L.length; i++) if (L[i].alive) { try { L[i].stop(reason); } catch (_) { /* */ } }
  L.length = 0; e._holdH = null;
}
/** Rhythm phase of handle h on enemy time: anticipation → hold (≤ 0.15 s, from lock) → strike (last 0.12 s) → done. */
export function rhythm(game, h) {
  if (!h) return 'done';
  const t = bossTime(game), hit = h.start + h.dur;
  if (t >= hit || h.alive === false) return 'done';
  if (t >= hit - RHYTHM.strike) return 'strike';
  const lock = hit - (h.lockAt ?? 0.4);
  if (t >= Math.max(lock, hit - RHYTHM.strike - RHYTHM.hold)) return 'hold';
  return 'wind';
}
/** True for a handle that ended without striking (stopped by tells, a break or a phase change). */
export const cancelled = (h) => !!h && h.alive === false && !(h.struck || h._struck);

/**
 * The single boss hit path. src = TellHandle (h.contains), a tells shape (tells.hitTest), or null (caller already tested).
 * hit = {attack:id, amount, element, knockback, launch, status, from?}; o = {jumpAvoid, pad}. Returns the combat result or null.
 */
export function bossHit(ctx, e, src, hit, o = null) {
  const game = ctx.game;
  const pe = ctx.target || game.player?.entity;
  if (!pe || pe.alive === false || e?.noDamage) return null;
  const pp = ctx.playerPos;
  const pad = o?.pad ?? 0.15;
  let inside = true;
  if (src && typeof src.contains === 'function') inside = src.contains(pp, pad);
  else if (src) inside = shapeHit(game, src, pp, pad);
  if (!inside) return null;
  if (o?.jumpAvoid) {
    const gy = game.world?.getGroundHeight ? game.world.getGroundHeight(pp.x, pp.z) : ctx.groundH(pp.x, pp.z);
    if (pp.y - gy > 0.6) return null;
  }
  if (pe.isDecoy || typeof pe.hp !== 'number') { try { pe.onDecoyHit?.(e); } catch (_) { /* */ } pe.alive = false; return { damage: 0, absorbed: true }; }
  _td.subVectors(pp, hit.from || e.object.position).setY(0);
  if (_td.lengthSq() < 1e-6) _td.set(Math.sin(e.facing || 0), 0, Math.cos(e.facing || 0));
  _td.normalize();
  const attack = hit.attack ? attackMeta(hit.attack) : undefined;
  return game.combat.dealDamage(pe, {
    amount: hit.amount, element: hit.element || 'physical', source: e, point: _tp.copy(pp).setY(pp.y + 1).clone(), direction: _td.clone(),
    knockback: hit.knockback ?? 6, launch: hit.launch ?? 0, status: hit.status || undefined, heavy: hit.heavy ?? hit.amount >= 20,
    attack, sourceName: e.name, noReaction: hit.noReaction, fixed: hit.fixed,
  });
}

/** Punish window (tells.punish, or the stub-equivalent fields + event). */
export function bossPunish(ctx, e, dur, mul) {
  const game = ctx.game;
  if (!(dur > 0) || !e || e.defeated) return;
  if (game.tells?.punish) { try { game.tells.punish(e, dur, { mul }); return; } catch (err) { console.error('[bosses] punish', err); } }
  e.vulnerableUntil = bossTime(game) + dur; e.vulnerableMul = mul;
  game.events.emit('punishWindow', { enemy: e, dur, mul });
}

const SEEN_SIGHT = {}, SEEN_AGGRO = {};
/**
 * Finish a boss entity (call last in every factory, after e.think / e.pose exist).
 * o: {type, cameraHint?, debugAttack(id) → handle, immune?, anchors?, onBroken?(dur)}
 */
export function finishBoss(ctx, e, o = {}) {
  const game = ctx.game, type = o.type || e.bossId || e.kind;
  registerBossCodex(game);
  const model = e.model || {};
  // ---- §7.4.5 fields
  const cx = codexOf(type);
  if (!Array.isArray(e.weakness)) e.weakness = cx ? cx.weak.map((w) => w.el) : [];
  e.immune = o.immune || e.immune || [];
  e.attacks = attacksOf(type);
  e.debugAttack = (id) => { e.vulnerableUntil = -1; e.bossBrokenUntil = -1; try { return o.debugAttack ? o.debugAttack(id) : null; } catch (err) { console.error('[bosses] debugAttack', id, err); return null; } };
  e.timeMul = e.timeMul ?? 1;
  e.cameraHint = o.cameraHint || null;
  e.codexKey = type;
  e.brief = (BOSS_BRIEF[type] || []).slice();
  e.flashUniform = model.flashUniform || (model.flashUniform = { value: 0 });
  const anchors = model.tellAnchors || null;
  e.tellAnchor = (kind) => (anchors && (anchors[kind] || anchors.head)) || e.object;
  e.rimSource = () => (model.rimSource ? model.rimSource() : null);
  const basePayload = e.spawnPayload;
  if (basePayload && !e._briefWrapped) { e._briefWrapped = true; e.spawnPayload = () => { const p = basePayload(); if (!p.brief) p.brief = e.brief.slice(); return p; }; }
  try { game.enemies?.registerPreview?.(type, o.preview || (() => null)); } catch (_) { /* */ }

  // ---- break → a real 3.5 s stagger (§4.15)
  const prevBreak = e.onBreak;
  e.bossBrokenUntil = -1; e.bossBreakCdUntil = -1;
  e.onBreak = () => {
    try { prevBreak?.(); } catch (err) { console.error('[bosses] onBreak', err); }
    if (e.defeated || e.transitioning) return;
    const t = bossTime(game);
    if (e.bossBreakCdUntil > t) return;
    e.bossBrokenUntil = t + BOSS_BREAK.dur; e.bossBreakCdUntil = t + BOSS_BREAK.cd;
    e._brokenT = Math.max(e._brokenT || 0, BOSS_BREAK.cd);       // combat/break.js refills the gauge after the cd
    stopAttacks(e);
    try { o.onBroken?.(BOSS_BREAK.dur); } catch (err) { console.error('[bosses] onBroken', err); }
    bossPunish(ctx, e, BOSS_BREAK.dur, BOSS_BREAK.mul);
    game.events.emit('bossBroken', { boss: e, dur: BOSS_BREAK.dur });
    try { game.audio?.play?.('break_boss', { pos: e.object.position }); } catch (_) { /* */ }
  };
  e.isBroken = () => e.bossBrokenUntil > bossTime(game);

  // ---- hit flash (the uniform decays once per frame in the pose wrapper)
  const react = e.react;
  e.react = (res, hit, lx, lz) => { e.flashUniform.value = 1; return react?.(res, hit, lx, lz); };

  // ---- clock: enemy time (assist.enemySpeed, frozen by a global hitstop); per-entity hitstop skips the update
  const think = e.think;
  let lastET = null, still = 0;
  e.think = (dt, sm) => {
    const t = bossTime(game);
    let d = lastET == null ? dt : t - lastET;
    lastET = t;
    if (!(d >= 0)) d = 0;
    if (d === 0 && dt > 0) { if (++still > 30) d = dt; } else still = 0;     // a host that never advances enemyTime
    if (d > 0.1) d = 0.1;
    if (e.hitstopUntil > (game.realTime || 0)) { e.stateT -= dt; return; }
    e.stateT += d - dt;
    encounter(d);
    think(d, sm);
  };
  // ---- pose: once per frame (lastStep), hold at the top of each windup, half rate > 30 m, paused > 60 m (§2.6)
  const pose = e.pose;
  let acc = 0, odd = false;
  e.pose = (dt, sm, stunned) => {
    acc += dt;
    if (game.frame && game.frame.lastStep === false) return;
    const h = e._holdH;
    if (h) { const ph = rhythm(game, h); if (ph === 'hold') { acc = 0; return; } if (ph === 'done') e._holdH = null; }
    const cam = game.camera;
    if (cam && !e.defeated) {
      const p = e.object.position, dx = p.x - cam.position.x, dz = p.z - cam.position.z, d2 = dx * dx + dz * dz;
      if (d2 > 3600 && !o.noDistanceRate) return;
      if (d2 > 900 && !o.noDistanceRate) { odd = !odd; if (odd) return; }
    }
    const fu = e.flashUniform;
    if (fu.value > 0) fu.value = Math.max(0, fu.value - acc * 6);
    const step = Math.min(acc, 0.1); acc = 0;
    pose(step, sm, stunned);
    try { model.update?.(step); } catch (_) { /* */ }
  };

  // ---- first sight (≤ 30 m, in view) / first aggro per session → noteEncounter + enemyEncounter
  let sightT = 0;
  function encounter(d) {
    if (SEEN_SIGHT[type] && SEEN_AGGRO[type]) return;
    sightT -= d; if (sightT > 0) return;
    sightT = 0.25;
    const cam = game.camera, pp = ctx.realPlayerPos;
    if (!SEEN_AGGRO[type] && e.aggro && e.playerInArena?.(6) !== false) emitEnc(false);
    if (SEEN_SIGHT[type] || !cam || !pp) return;
    const p = e.object.position, dx = p.x - pp.x, dz = p.z - pp.z;
    if (dx * dx + dz * dz > 900 && !(o.sightRange && dx * dx + dz * dz < o.sightRange * o.sightRange)) return;
    cam.updateMatrixWorld(); _fm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_fm);
    _fs.center.set(p.x, p.y + (e.height || 2) * 0.5, p.z); _fs.radius = Math.max(1, e.radius || 1);
    if (_fr.intersectsSphere(_fs)) emitEnc(true);
  }
  function emitEnc(sight) {
    (sight ? SEEN_SIGHT : SEEN_AGGRO)[type] = true;
    let first = false;
    try { first = !!game.enemies?.noteEncounter?.(type, { sight })?.first; } catch (_) { /* */ }
    game.events.emit('enemyEncounter', { type, enemy: e, first, sight });
  }
  return e;
}
/** Test hook: forget the per-session encounter books. */
export function resetEncounters() { for (const k of Object.keys(SEEN_SIGHT)) delete SEEN_SIGHT[k]; for (const k of Object.keys(SEEN_AGGRO)) delete SEEN_AGGRO[k]; }
