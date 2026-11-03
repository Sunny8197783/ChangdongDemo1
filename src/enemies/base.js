// Shared enemy entity: perception/aggro/leash, hit reactions, launch tumble, stun stars, generic death.
import * as THREE from 'three';
import { clamp, damp, dampAngle, rand } from '../core/utils.js';
import { Spring, integrate, textures } from './common.js';

let uid = 0;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const TAU = Math.PI * 2;
const EMPTY = [];

export function makeEnemy(ctx, cfg, pos) {
  const object = cfg.model.root;
  object.position.copy(pos);
  const e = {
    id: 'enemy' + (++uid), team: 'enemy', alive: true, object,
    radius: cfg.radius, height: cfg.height, hp: cfg.hp, maxHp: cfg.hp, mass: cfg.mass ?? 1,
    velocity: new THREE.Vector3(), grounded: true, resist: cfg.resist || null, statuses: {},
    name: cfg.name, isBoss: !!cfg.isBoss, isDummy: !!cfg.isDummy,
    // controller
    kind: cfg.kind, model: cfg.model, move: new THREE.Vector3(), home: pos.clone(), camp: cfg.camp ?? null,
    facing: cfg.facing ?? rand(0, TAU), state: 'idle', stateT: 0, aggro: false, sight: cfg.sight ?? 22, leash: cfg.leash ?? 42,
    distP: 999, flX: new Spring(200, 13), flZ: new Spring(200, 13), tumble: 0, tumbleV: 0, launched: false,
    staggerDur: 0.6, staggerDmg: cfg.staggerDmg ?? 30, noTumble: !!cfg.noTumble, hurt: 0,
    // v3 (DESIGN §9 A2): poise for elites / heavies (light hits drain it without interrupting; at 0 → 붕괴 stagger)
    poiseMax: cfg.poiseMax || 0, poise: cfg.poiseMax || 0, poiseRegenT: 0, target: null,
    xpValue: cfg.xpValue ?? 0, zoneLevel: 1, zoneDmgMul: 1, isElite: !!cfg.isElite,
    dying: false, deathT: 0, dissolved: false, removed: false, token: false, icon: null, iconT: 0, stars: null,
    // v2 hit feel: snapped hurt overlay (holds during hitstop), squash spring, reaction states
    chaseState: cfg.chaseState || 'chase', hurtSnap: 0, hitLX: 0, hitLZ: -1, sq: new Spring(300, 12),
    reactDur: 0, juggleT: 0, panicCd: 0, panicDir: 0, panicT: 0, gravityMul: 1, _lodAcc: 0, _lodTick: 0,
    getCenter(out = new THREE.Vector3()) { return out.copy(object.position).setY(object.position.y + e.height * 0.5); },
    onHit(result, hit) { onHit(ctx, e, result, hit); },
    onDeath(result, hit) { onDeath(ctx, e, result, hit); },
    /** Perfect parry / guard counter by `by` (combat calls this on the attacker). */
    onParried(by) { onParried(ctx, e, by); },
    showAlert() { showIcon(e, '!'); },
    setState(s) { e.state = s; e.stateT = 0; },
  };
  object.rotation.y = e.facing;
  object.traverse((o) => { o.userData.enemy = e; });
  return e;
}

// ------------------------------------------------------------------ icons (! / ?) and dizzy stars
function showIcon(e, kind) {
  const tex = textures();
  if (!e.icon) {
    e.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.alert, depthTest: false, transparent: true }));
    e.icon.renderOrder = 20; e.icon.center.set(0.5, 0);
    e.object.add(e.icon);
  }
  e.icon.material.map = kind === '?' ? tex.question : kind === 'break' ? tex.poise : tex.alert;
  e.icon.visible = true; e.iconT = 0; e.iconDur = kind === '?' ? 1.6 : kind === 'break' ? 1.1 : 1.25;
  e.iconW = kind === 'break' ? 2.6 : 1;
}
function updateIcon(e, dt) {
  if (!e.icon || !e.icon.visible) return;
  e.iconT += dt;
  const t = e.iconT, k = e.isBoss ? 2 : 1;
  const pop = t < 0.12 ? t / 0.12 * 1.35 : t < 0.25 ? 1.35 - (t - 0.12) / 0.13 * 0.35 : 1;
  const fade = t > e.iconDur - 0.25 ? Math.max(0, (e.iconDur - t) / 0.25) : 1;
  const s = 0.75 * pop * fade * k;
  e.icon.scale.set(s * (e.iconW || 1), s, 1);
  e.icon.position.set(0, e.model.headTop + 0.15 + Math.sin(t * 9) * 0.04 + (t < 0.2 ? t : 0.2), 0);
  if (t > e.iconDur) e.icon.visible = false;
}
function updateStars(e, dt, on) {
  if (!on) { if (e.stars && e.stars.visible) e.stars.visible = false; return; }
  if (!e.stars) {
    e.stars = new THREE.Group();
    const mat = new THREE.SpriteMaterial({ map: textures().star, transparent: true, depthWrite: false });
    for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(mat); s.scale.setScalar(0.24); e.stars.add(s); }
    e.object.add(e.stars);
  }
  e.stars.visible = true;
  e.stars.position.y = e.model.headTop + 0.05;
  e.stars.rotation.y += dt * 4;
  const r = e.isBoss ? 1.2 : 0.42;
  const ch = e.stars.children;
  for (let i = 0; i < ch.length; i++) {
    const a = i / 4 * TAU;
    ch[i].position.set(Math.cos(a) * r, Math.sin(a * 2 + e.stars.rotation.y * 2) * 0.06, Math.sin(a) * r);
  }
}

// ------------------------------------------------------------------ aggro
export { showIcon };
export function alert(ctx, e, silent = false) {
  if (e.aggro || e.dying || e.isDummy) return;
  e.aggro = true;
  if (!silent || e.state === 'idle' || e.state === 'return') e.setState('alert');
  showIcon(e, '!');
  ctx.game.events.emit('enemyAlert', { enemy: e });
  ctx.alertCamp(e);
}

function perceive(ctx, e, dt = 0.016) {
  const pp = ctx.playerPos, pAlive = ctx.playerAlive;
  if (e.isBoss) return;
  if (e.giveUpT > 0) e.giveUpT -= dt;
  // the village is a safe haven: never aggro on a player inside it, and give up the chase when they reach it
  const safe = ctx.playerInVillage && !homeInVillage(ctx, e);
  if (safe && e.aggro && !e.summoned) e.giveUp = true;
  if (!e.aggro) {
    if (e.giveUpT > 0 || safe) return;
    const sight = (e.state === 'return' ? e.sight * 0.55 : (e.sitting ? e.sight * 0.75 : e.sight)) * (ctx.threat ? ctx.threat.stealthMul : 1);
    if (pAlive && e.distP < sight && Math.abs(pp.y - e.object.position.y) < 14) alert(ctx, e);
  } else {
    const leashD = Math.hypot(pp.x - e.home.x, pp.z - e.home.z);
    const L = e.leash + (e.provokedT > 0 ? (e.leashBonus || 0) : 0);
    if (e.giveUp) { e.giveUp = false; e.provokedT = 0; e.giveUpT = 5; }
    if (e.giveUpT > 0 || !pAlive || (!(e.provokedT > 0) && (leashD > L || e.distP > L + 12)) || e.distP > L + 40) {
      e.aggro = false; ctx.releaseToken(e);
      e.setState('return');
      if (pAlive) showIcon(e, '?');
    }
  }
}

// ------------------------------------------------------------------ hit / death
const REACT_STATES = { flinch: 1, stagger: 1, knockdown: 1, getup: 1, parried: 1, recoil: 1, panic: 1 };
export const isReacting = (e) => REACT_STATES[e.state] === 1;

/** Enter a hit-reaction state (interrupts any attack). */
export function react(ctx, e, state, dur) {
  if (e.dying || e.isBoss) return;
  ctx.releaseToken(e);
  if (e.state !== state || state === 'flinch' || state === 'recoil') {
    e.interrupt?.(state);
    e.leaping = false;
    e.setState(state);
    e.reactDur = dur;
    e._kdDust = false;
  } else {
    // already in it: extend a little (combo keeps them reeling) without restarting the animation
    e.reactDur = Math.min(e.stateT + Math.max(dur * 0.6, e.reactDur - e.stateT), e.stateT + dur * 1.2);
  }
}

function onParried(ctx, e, by) {
  if (e.dying) return;
  const bp = by?.object?.position;
  // ranged attacks (shaman orbs) get reflected instead; only stagger attackers in melee reach
  if (bp && Math.hypot(bp.x - e.object.position.x, bp.z - e.object.position.z) > e.radius + 4.5) return;
  if (bp) {
    _v.set(e.object.position.x - bp.x, 0, e.object.position.z - bp.z);
    if (_v.lengthSq() < 1e-6) _v.set(-Math.sin(e.facing), 0, -Math.cos(e.facing)); _v.normalize();
  } else _v.set(-Math.sin(e.facing), 0, -Math.cos(e.facing));
  const c = Math.cos(-e.facing), s = Math.sin(-e.facing);
  e.hitLX = _v.x * c + _v.z * s; e.hitLZ = -_v.x * s + _v.z * c;
  e.hurtSnap = 1.2; e.sq.x = -0.16; e.sq.v = 0;
  e.flX.x = e.hitLZ * 4; e.flX.v = 0;
  if (e.isDummy) { e.onDummyParried?.(by); return; }
  if (e.isBoss) { e.onBossParried?.(by); return; }
  e.velocity.addScaledVector(_v, 4.5 / Math.sqrt(e.mass || 1));
  react(ctx, e, 'parried', 1.6);
  ctx.audio('shatter', { position: e.object.position, volume: 0.35, pitch: 1.6 });
}

/** The enemy's attack bounced off the player's guard: short recoil (opening for a counter). */
export function recoil(ctx, e, by) {
  if (e.dying || e.isBoss || e.isDummy || isReacting(e)) return;
  const bp = by?.object?.position || ctx.playerPos;
  _v.set(e.object.position.x - bp.x, 0, e.object.position.z - bp.z);
  if (_v.lengthSq() < 1e-6) _v.set(-Math.sin(e.facing), 0, -Math.cos(e.facing)); _v.normalize();
  e.velocity.addScaledVector(_v, 3 / Math.sqrt(e.mass || 1));
  const c = Math.cos(-e.facing), s = Math.sin(-e.facing);
  e.hitLX = _v.x * c + _v.z * s; e.hitLZ = -_v.x * s + _v.z * c;
  e.hurtSnap = 0.7;
  react(ctx, e, 'recoil', 0.6);
}

function onHit(ctx, e, result, hit) {
  if (e.dying) return;
  const dmg = result?.damage || 0;
  const tags = hit?.tags || EMPTY;
  const isDot = tags.includes('dot') || tags.includes('tick');
  // provoked: chase the attacker beyond the normal leash for a while, and don't regen
  e.provokedT = 8; e.sinceHurt = 0; e.giveUpT = 0;
  e.leashBonus = Math.max(e.leashBonus || 0, Math.max(0, (e.distP || 0) - e.leash + 10));
  e.waterBlockT = 0;
  if (!e.aggro && !e.isDummy) alert(ctx, e, true);
  // hit direction in local space
  if (hit?.direction && hit.direction.lengthSq() > 1e-6) _v.copy(hit.direction);
  else if (hit?.point) _v.subVectors(e.object.position, hit.point);
  else _v.set(-Math.sin(e.facing), 0, -Math.cos(e.facing));
  _v.y = 0; if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1); _v.normalize();
  const c = Math.cos(-e.facing), s = Math.sin(-e.facing);
  const lx = _v.x * c + _v.z * s, lz = -_v.x * s + _v.z * c;
  const heavy = !!hit?.heavy;
  if (isDot) {
    e.flX.kick(lz * 1.2); e.flZ.kick(-lx * 1.2); e.hurt = Math.max(e.hurt, 0.5);
    e.react?.(result, hit, lx, lz);
    return;
  }
  // SNAP the hurt pose on the hit frame: springs get a displacement (not just a velocity) and the additive hurt
  // overlay jumps to full — gameplay dt is ~0 during hitstop, so the pose holds for the whole freeze, then recovers.
  const massK = 1 / Math.sqrt(e.mass || 1);
  const snap = Math.min(3, 1 + dmg / 30) * (heavy ? 1.35 : 1) * massK;
  e.flX.x = lz * snap * 1.5; e.flX.v = lz * snap * 4;
  e.flZ.x = -lx * snap * 1.5; e.flZ.v = -lx * snap * 4;
  e.hitLX = lx; e.hitLZ = lz;
  e.hurtSnap = Math.min(1.25, 0.8 + dmg / 90 + (heavy ? 0.2 : 0));
  e.sq.x = -Math.min(0.2, 0.08 + 0.03 * snap); e.sq.v = 0;
  e.hurt = 1;
  if (!e.isBoss && !e.isDummy && !e.statuses.frozen) {
    const p = e.object.position;
    const air = e.launched || (!e.grounded && !e.leaping && (e.statuses.airborne || e.velocity.y > 2));
    const kb = hit?.knockback || 0, launch = hit?.launch || 0;
    const big = kb >= 10 || dmg >= 60 || (heavy && dmg >= 40 && launch < 4);
    if (air) {
      // juggle: every air hit pops them back up and makes them floaty for a moment → airborne combos
      const h = p.y - ctx.groundH(p.x, p.z);
      if (h < 6.5) e.velocity.y = Math.max(e.velocity.y, launch > 0 ? e.velocity.y : 3.6);
      if (kb < 8) { e.velocity.x *= 0.45; e.velocity.z *= 0.45; }
      e.juggleT = 0.55;
      e.tumbleV += (lz >= 0 ? 1 : -1) * 2;
      if (!e.launched && !e.noTumble) { e.launched = true; e.launchT = 0; e.tumbleV = (lz >= 0 ? 1 : -1) * 6; }
    } else if (e.state === 'knockdown') {
      react(ctx, e, 'knockdown', 0.35); // hits on a downed enemy keep it down a little longer
    } else if (big) {
      react(ctx, e, 'knockdown', 0.85);
    } else if (e.state === 'parried') {
      // stays open; hits don't cut the parry window short
    } else if (e.poiseMax > 0) {
      // poise (DESIGN §9 A2): hits drain it without interrupting; at 0 the 붕괴 stagger (0.8–1.2 s) + pop
      e.poise -= (hit?.poise ?? dmg * 0.5) * (heavy ? 1.6 : 1);
      e.poiseRegenT = 2.5;
      if (e.poise <= 0) {
        e.poise = e.poiseMax;
        react(ctx, e, 'stagger', 0.8 + Math.min(0.4, dmg / 200));
        e.reactDur = Math.max(e.reactDur, 0.8);
        showIcon(e, 'break');
        ctx.game.events.emit('enemyPoiseBreak', { enemy: e });
        ctx.audio('shatter', { position: e.object.position, volume: 0.5, pitch: 0.9 });
      }
    } else if (heavy || dmg >= e.staggerDmg) {
      react(ctx, e, 'stagger', heavy ? 0.9 : 0.55);
    } else if (!(e.armor?.())) {
      react(ctx, e, 'flinch', 0.42);
    }
  }
  e.react?.(result, hit, lx, lz);
}

function onDeath(ctx, e, result, hit) {
  if (e.dying) return;
  e.dying = true; e.deathT = 0;
  ctx.releaseToken(e);
  if (e.icon) e.icon.visible = false;
  if (e.stars) e.stars.visible = false;
  if (!e.isBoss) {
    if (hit?.direction) _v.copy(hit.direction).setY(0); else _v.set(Math.sin(e.facing + Math.PI), 0, Math.cos(e.facing + Math.PI));
    if (_v.lengthSq() > 1e-6) _v.normalize();
    e.velocity.addScaledVector(_v, 3 / (e.mass || 1));
    e.velocity.y = Math.max(e.velocity.y, 5.5);
    e.grounded = false;
    const c = Math.cos(-e.facing), s = Math.sin(-e.facing);
    const lz = -_v.x * s + _v.z * c;
    e.tumbleV = (lz >= 0 ? 1 : -1) * rand(7, 10);
  }
  e.setState('dead');
  ctx.onEnemyDied(e, result, hit);
  e.die?.(result, hit);
}

function genericDeath(ctx, e, dt) {
  const game = ctx.game;
  e.deathT += dt;
  e.move.set(0, 0, 0);
  integrate(game, e, dt);
  e.pose?.(dt, 1, false);
  const rig = e.model.rig;
  if (!e.grounded) e.tumble += e.tumbleV * dt;
  else {
    // settle lying on back/front
    const target = Math.round((e.tumble - Math.PI / 2 * Math.sign(e.tumbleV || 1)) / TAU) * TAU + Math.PI / 2 * Math.sign(e.tumbleV || 1);
    e.tumble = damp(e.tumble, target, 10, dt);
    if (e.landed > 2) ctx.dust(e.object.position, 0.8);
  }
  rig.rotation.x += e.tumble * -1;
  if (e.grounded) rig.position.y = damp(rig.position.y, e.model.lieY ?? 0.3, 8, dt);
  if (!e.dissolved && e.deathT > (e.dissolveAt ?? 1.05)) {
    e.dissolved = true;
    ctx.dissolveFx(e, 0.7);
    ctx.loot.drop(e);
    // DESIGN §9 A4: 0.9 s shader dissolve with a void-violet edge (vfx.dissolve), fallback = the v2 squash
    e._vd = false;
    try { e._vd = !!ctx.game.vfx?.dissolve?.(e, { dur: 0.9, color: e.dissolveColor ?? 0x9a5cff }); } catch (_) { e._vd = false; }
  }
  if (e.dissolved && e._vd) return e.deathT > (e.dissolveAt ?? 1.05) + 1.0;
  if (e.dissolved) {
    const k = clamp((e.deathT - (e.dissolveAt ?? 1.05)) / 0.35, 0, 1);
    const sc = 1 - k * k;
    e.object.scale.set(1 + k * 0.4, Math.max(0.001, sc), 1 + k * 0.4);
    if (k >= 1) return true;
  }
  return false;
}

// ------------------------------------------------------------------ per-frame
function resume(e) {
  e.setState(e.aggro ? e.chaseState : 'idle');
  e.onResume?.();
}
/** Generic hit-reaction / panic state update (replaces think while reacting). */
function reactUpdate(ctx, e, dt, sm) {
  const st = e.state;
  if (st === 'knockdown') {
    if (!e._kdDust && e.stateT > 0.2 && e.grounded) { e._kdDust = true; ctx.dust(e.object.position, 0.9 * Math.sqrt(e.mass || 1)); }
    if (e.stateT > e.reactDur && e.grounded) { e.setState('getup'); e.reactDur = 0.5; }
  } else if (st === 'panic') {
    e.panicT -= dt;
    if (e.panicT <= 0) { e.panicT = rand(0.3, 0.6); e.panicDir += rand(-1.1, 1.1); }
    const sp = 4.4 * sm;
    if (e.kind === 'chuchu') {
      if (e.grounded && e.stateT > 0.05) {
        e.velocity.x = Math.sin(e.panicDir) * 3.2; e.velocity.z = Math.cos(e.panicDir) * 3.2; e.velocity.y = 4.2; e.grounded = false;
      }
    } else { e.move.x = Math.sin(e.panicDir) * sp; e.move.z = Math.cos(e.panicDir) * sp; }
    e.facing = dampAngle(e.facing, e.panicDir, 10, dt);
    if (e.blocked) e.panicDir += Math.PI * 0.7;
    if (e.stateT > e.reactDur) resume(e);
  } else if (e.stateT > e.reactDur) resume(e);
}

/** Additive hurt overlay on humanoid-ish rigs: head whip, spine bend away from the hit, arms flung. */
function applyHurt(e) {
  const k = e.hurtSnap;
  if (k <= 0) return;
  const a = k > 1 ? 1 : k * k * (3 - 2 * k);
  const m = e.model, lx = e.hitLX, lz = e.hitLZ, w = e.isBoss ? 0.22 : 1;
  if (m.spine) {
    m.spine.rotation.x += lz * 0.55 * a * w; m.spine.rotation.z -= lx * 0.4 * a * w;
    m.neck.rotation.x += lz * 0.7 * a * w; m.neck.rotation.y += lx * 0.45 * a * w;
    if (!e.isBoss) {
      m.armR.rotation.x -= 0.75 * a; m.armR.rotation.z -= 0.55 * a;
      m.armL.rotation.x -= 0.75 * a; m.armL.rotation.z += 0.55 * a;
      m.foreR.rotation.x -= 0.5 * a; m.foreL.rotation.x -= 0.5 * a;
      m.kneeR.rotation.x += 0.35 * a; m.kneeL.rotation.x += 0.35 * a;
    }
  }
  if (m.spine || e.kind === 'chuchu') { m.rig.position.x += lx * 0.12 * a * w; m.rig.position.z += lz * 0.12 * a * w; }
}

const _CINE_SKIP = { idle: 1 };
export function updateEnemy(ctx, e, dt) {
  const game = ctx.game;
  if (e.dying) {
    const done = e.deathUpdate ? e.deathUpdate(dt) : genericDeath(ctx, e, dt);
    if (done) ctx.remove(e);
    return;
  }
  // AI targeting goes through enemies.getThreatTarget (CONTRACT §14): ctx.playerPos / playerCenter / target become this
  // enemy's target for the rest of its update (the real player is restored by ctx.retarget for the next enemy)
  ctx.retarget?.(e);
  const pp = ctx.playerPos, p = e.object.position;
  e.distP = Math.hypot(pp.x - p.x, pp.z - p.z);
  // cinematic: AI frozen, no movement or attacks; pose held (except fresh hit snaps so finisher impacts read)
  if (ctx.cine) {
    if (e.hurtSnap > 0) { visuals(ctx, e, dt, 0, false); e.hurtSnap = Math.max(0, e.hurtSnap - dt * 5); }
    return;
  }
  // distance LOD: idle enemies far from the player think/animate at 1/4 rate (accumulated dt)
  if (!e.aggro && !e.isBoss && e.distP > 60 && !e.launched && !isReacting(e) && dt > 0) {
    e._lodAcc += dt;
    if ((++e._lodTick & 3) !== 0) return;
    dt = Math.min(e._lodAcc, 0.2); e._lodAcc = 0;
  } else e._lodAcc = 0;
  const combat = game.combat, st = e.statuses;
  const frozen = !!st.frozen, stunned = !!st.stunned && !frozen;
  const can = combat.canAct(e) !== false;
  const sm = can ? (combat.speedMul(e) ?? 1) : 0;
  e.stateT += dt;
  e.hurt = Math.max(0, e.hurt - dt * 4);
  if (e.provokedT > 0) { e.provokedT -= dt; if (e.provokedT <= 0) e.leashBonus = 0; }
  e.sinceHurt = (e.sinceHurt ?? 99) + dt;
  if (e.poiseMax > 0 && e.poise < e.poiseMax) { e.poiseRegenT -= dt; if (e.poiseRegenT <= 0) e.poise = Math.min(e.poiseMax, e.poise + e.poiseMax * 0.35 * dt); }
  e.panicCd -= dt;
  // out-of-combat regen: only after resting at home unhurt for 4s (no instant full heal on return)
  if (!e.aggro && !e.isBoss && !e.isDummy && e.state === 'idle' && e.sinceHurt > 4 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3 * dt);
  if (!e.isDummy) perceive(ctx, e, dt);

  // burning → panic a bit (run around flailing), then fight on
  if (st.burning && !e.isBoss && !e.isDummy && can && !e.launched && e.panicCd <= 0 && !isReacting(e) && e.state !== 'dead') {
    e.panicCd = rand(4, 6);
    ctx.releaseToken(e); e.interrupt?.('panic');
    e.setState('panic'); e.reactDur = rand(1.3, 1.9); e.panicT = 0;
    e.panicDir = Math.atan2(p.x - pp.x, p.z - pp.z) + rand(-0.8, 0.8);
    if (!e.leaping) e.velocity.y = Math.max(e.velocity.y, 3);
    ctx.audio('enemy_hurt', { position: p, volume: 0.4, pitch: 1.5 });
  }

  // launch / tumble
  if (!e.noTumble && !e.launched && !e.grounded && ((st.airborne && e.state !== 'knockdown' && e.state !== 'getup') || (e.velocity.y > 6 && !e.leaping))) {
    e.launched = true; e.launchT = 0; ctx.releaseToken(e); e.interrupt?.('launch');
    const c = Math.cos(-e.facing), s = Math.sin(-e.facing);
    const lz = -e.velocity.x * s + e.velocity.z * c;
    e.tumbleV = (lz >= 0 ? 1 : -1) * rand(5, 7);
  }
  if (e.juggleT > 0) e.juggleT -= dt;
  e.gravityMul = e.juggleT > 0 && e.velocity.y < 2 ? 0.42 : 1;

  e.move.set(0, 0, 0);
  if (!e.isDummy) {
    if (can && !e.launched) { if (isReacting(e)) reactUpdate(ctx, e, dt, sm); else e.think(dt, sm); }
    if (!e.noPhysics) integrate(game, e, dt);
    if (ctx.village && !e.isBoss) keepOutOfVillage(ctx, e);
  } else {
    e.velocity.set(0, 0, 0);
  }

  if (e.launched) {
    e.launchT += dt;
    if (e.grounded && e.launchT > 0.08) {
      e.launched = false;
      ctx.dust(e.object.position, 0.7 * (e.mass || 1));
      // bounce once on a hard landing, then lie there (knockdown → get up)
      if (e.landed > 7) { e.velocity.y = Math.min(4, e.landed * 0.3); e.grounded = false; }
      e.setState('knockdown'); e.reactDur = 0.7; e._kdDust = true;
      ctx.audio('land', { position: e.object.position, volume: 0.5, pitch: 0.8 });
    }
  }
  visuals(ctx, e, dt, sm, stunned, frozen);
  e.object.rotation.y = e.facing;
  updateIcon(e, dt);
}

function visuals(ctx, e, dt, sm, stunned, frozen = false) {
  const rig = e.model.rig;
  // airborne: lean back into a readable "hurt in the air" arc (≤ ~100°) instead of a blurry spin
  if (e.launched) {
    const tgt = (e.tumbleV >= 0 ? -1 : 1) * (e.velocity.y > 0 ? 1.0 : 1.5);
    if (!frozen) e.tumble = damp(e.tumble, tgt, Math.min(9, Math.abs(e.tumbleV) + 2), dt);
  } else e.tumble = damp(e.tumble, 0, 9, dt);
  if (frozen) return;
  if (e.kind !== 'shaman' && e.kind !== 'chuchu') rig.scale.set(1, 1, 1);
  e.pose(dt, sm, stunned);
  rig.rotation.x += e.flX.update(dt) * 0.12 - e.tumble;
  rig.rotation.z += e.flZ.update(dt) * 0.12;
  applyHurt(e);
  const q = e.sq.update(dt) * (e.isBoss ? 0.3 : 1);
  if (q !== 0) { rig.scale.x *= 1 - q * 0.5; rig.scale.y *= 1 + q; rig.scale.z *= 1 - q * 0.5; }
  e.hurtSnap = Math.max(0, e.hurtSnap - dt * 5);
  // v3 combat draws instanced stun/break stars (1 call total): the per-entity sprites only show for parried / dizzy
  updateStars(e, dt, (stunned && !ctx.v3Stars) || e.state === 'parried' || e.dizzyT > 0);
}

function homeInVillage(ctx, e) {
  if (e._homeInV === undefined) {
    const V = ctx.village;
    e._homeInV = Math.hypot(e.home.x - V.center.x, e.home.z - V.center.z) < V.radius + 2;
  }
  return e._homeInV;
}
function keepOutOfVillage(ctx, e) {
  // only wild enemies are kept out (debug/test spawns inside the village are left alone)
  if (homeInVillage(ctx, e)) return;
  const V = ctx.village, p = e.object.position;
  const dx = p.x - V.center.x, dz = p.z - V.center.z, R = V.radius + 2;
  const d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return;
  const d = Math.sqrt(d2) || 1;
  p.x = V.center.x + dx / d * R; p.z = V.center.z + dz / d * R;
  if (e.aggro) e.giveUp = true;
}

// ------------------------------------------------------------------ movement helpers
/** Face toward a point with a max angular speed (rad/s). */
export function faceTo(e, x, z, rate, dt) {
  const a = Math.atan2(x - e.object.position.x, z - e.object.position.z);
  e.facing = dampAngle(e.facing, a, rate, dt);
  return a;
}
/** Sets e.move toward (x,z) at speed; returns remaining distance. */
export function moveTo(e, x, z, speed, stopAt = 0.3) {
  const p = e.object.position;
  _v2.set(x - p.x, 0, z - p.z);
  const d = _v2.length();
  if (d > stopAt) { _v2.multiplyScalar(speed / d); e.move.x = _v2.x; e.move.z = _v2.z; }
  return d;
}
/** Move along facing direction. */
export function moveForward(e, speed) {
  e.move.x = Math.sin(e.facing) * speed; e.move.z = Math.cos(e.facing) * speed;
}
/** Angle between facing and the direction to the player (radians, abs). */
export function angleToPlayer(ctx, e) {
  const p = e.object.position, pp = ctx.playerPos;
  const a = Math.atan2(pp.x - p.x, pp.z - p.z);
  let d = (a - e.facing) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

// ------------------------------------------------------------------ humanoid pose helpers
export const HUMAN_KEYS = ['hipY', 'hipZ', 'pitch', 'roll', 'spineX', 'spineY', 'headX', 'headY', 'headZ',
  'aRx', 'aRz', 'fRx', 'aLx', 'aLz', 'fLx', 'lRx', 'lRz', 'kR', 'lLx', 'lLz', 'kL'];
export function newPose(hipY) {
  const p = {}; for (const k of HUMAN_KEYS) p[k] = 0; p.hipY = hipY; return p;
}
export function dampPose(cur, tgt, lambda, dt) {
  const k = 1 - Math.exp(-lambda * dt);
  for (let i = 0; i < HUMAN_KEYS.length; i++) { const key = HUMAN_KEYS[i]; cur[key] += (tgt[key] - cur[key]) * k; }
}
export function applyHumanoid(m, p) {
  m.rig.position.set(0, p.hipY, p.hipZ);
  m.rig.rotation.set(p.pitch, 0, p.roll);
  m.spine.rotation.set(p.spineX, p.spineY, 0);
  m.neck.rotation.set(p.headX, p.headY, p.headZ);
  m.armR.rotation.set(p.aRx, 0, p.aRz); m.foreR.rotation.x = p.fRx;
  m.armL.rotation.set(p.aLx, 0, p.aLz); m.foreL.rotation.x = p.fLx;
  m.legR.rotation.set(p.lRx, 0, p.lRz); m.kneeR.rotation.x = p.kR;
  m.legL.rotation.set(p.lLx, 0, p.lLz); m.kneeL.rotation.x = p.kL;
}
/** Fill humanoid target with a walk/run cycle. */
export function walkCycle(t, ph, amt, run = 0) {
  const s = Math.sin(ph), c = Math.cos(ph);
  t.lRx = s * 0.75 * amt; t.lLx = -s * 0.75 * amt;
  t.kR = Math.max(0, -c) * 1.0 * amt + 0.1; t.kL = Math.max(0, c) * 1.0 * amt + 0.1;
  t.aRx = -s * 0.6 * amt; t.aLx = s * 0.6 * amt;
  t.fRx = -0.3 - run * 0.5; t.fLx = -0.3 - run * 0.5;
  t.hipY -= Math.abs(Math.cos(ph)) * 0.06 * amt - 0.03 * amt;
  t.pitch += 0.12 * amt + run * 0.18;
  t.spineY = s * 0.12 * amt;
  t.roll = c * 0.05 * amt;
}

/**
 * Generic humanoid poses for hit-reaction states. Fills `t` and returns a damping lambda, or 0 if the enemy
 * isn't reacting. lieY = hip height when lying on the back.
 */
export function reactionPose(e, t, HIP, time, lieY = 0.3) {
  const st = e.state;
  if (REACT_STATES[st] !== 1) return 0;
  const T = e.stateT, D = Math.max(0.01, e.reactDur);
  if (st === 'flinch') {
    const k = 1 - clamp(T / D, 0, 1);
    t.pitch = -0.28 * k; t.spineX = -0.2 * k; t.headX = -0.45 * k;
    t.aRx = -0.6 * k; t.aRz = -0.5 * k; t.aLx = -0.6 * k; t.aLz = 0.5 * k; t.fRx = t.fLx = -0.6;
    t.lRx = 0.25 * k; t.lLx = -0.3 * k; t.kL = 0.35 * k + 0.1; t.kR = 0.15; t.hipY = HIP - 0.06 * k;
    return 22;
  }
  if (st === 'stagger') {
    const k = Math.sin(clamp(T / D, 0, 1) * Math.PI);
    t.pitch = -0.55 * k; t.spineX = -0.3 * k; t.headX = -0.6 * k;
    t.aRx = -1.2 * k; t.aRz = -1.1 * k; t.aLx = -1.4 * k; t.aLz = 1.2 * k; t.fRx = t.fLx = -0.5;
    t.lRx = 0.4 * k; t.lLx = -0.6 * k; t.kL = 0.6 * k; t.hipY = HIP - 0.1 * k; t.hipZ = -0.15 * k;
    t.roll = Math.sin(T * 9) * 0.08 * k;
    return 16;
  }
  if (st === 'parried') {
    // big stumble back with arms flung wide, then a dizzy sway until the window closes
    const k = clamp(T / 0.35, 0, 1), sway = clamp((T - 0.3) / 0.3, 0, 1) * (1 - clamp((T - D + 0.25) / 0.25, 0, 1));
    const reel = 1 - k * 0.45;
    t.pitch = -0.6 * reel + 0.18 * sway; t.spineX = -0.4 * reel; t.headX = -0.7 * reel + 0.35 * sway;
    t.aRx = -2.3 * reel - 0.2; t.aRz = -1.3 * reel; t.aLx = -2.0 * reel - 0.2; t.aLz = 1.3 * reel;
    t.fRx = t.fLx = -0.4; t.lRx = 0.55 * reel; t.lLx = -0.5 * reel; t.kR = 0.5; t.kL = 0.6;
    t.hipY = HIP - 0.12; t.hipZ = -0.12 * reel;
    t.roll = Math.sin(time * 3.2) * 0.14 * sway; t.headY = Math.sin(time * 3.2 + 1) * 0.5 * sway; t.headZ = Math.cos(time * 3.2) * 0.3 * sway;
    if (sway > 0) { t.aRx = -0.3 * sway - 0.2; t.aLx = -0.3 * sway - 0.2; t.aRz = -0.7; t.aLz = 0.7; }
    return T < 0.3 ? 20 : 7;
  }
  if (st === 'recoil') {
    const k = Math.sin(clamp(T / D, 0, 1) * Math.PI * 0.5 + Math.PI * 0.5);
    t.aRx = -3.0 * k; t.aRz = -0.7 * k; t.fRx = -0.6 * k; t.aLx = -1.2 * k; t.aLz = 0.7 * k;
    t.pitch = -0.4 * k; t.spineX = -0.35 * k; t.spineY = 0.3 * k; t.headX = -0.4 * k;
    t.lRx = 0.45 * k; t.lLx = -0.35 * k; t.kR = 0.3; t.kL = 0.5 * k; t.hipY = HIP - 0.08 * k;
    return 18;
  }
  if (st === 'knockdown') {
    const f = clamp(T / 0.22, 0, 1), fall = f * f * (3 - 2 * f);
    t.pitch = -1.45 * fall - 0.3 * (1 - fall); t.hipY = HIP + (lieY - HIP) * fall; t.hipZ = -0.25 * fall;
    t.headX = 0.35 * fall - 0.5 * (1 - fall); t.spineX = 0.1;
    t.aRz = -1.25; t.aLz = 1.25; t.aRx = -0.4; t.aLx = -0.4; t.fRx = t.fLx = -0.3;
    t.lRx = -0.25; t.lLx = -0.45; t.kR = 0.35; t.kL = 0.6;
    if (T > 0.3) { t.headY = Math.sin(time * 2.4) * 0.25; t.aRx += Math.sin(time * 5) * 0.1; }
    return T < 0.22 ? 28 : 10;
  }
  if (st === 'getup') {
    const k = clamp(T / D, 0, 1);
    const up = k * k * (3 - 2 * k);
    // on back → crouch → stand
    t.pitch = -1.45 * (1 - up) + 0.45 * Math.sin(up * Math.PI);
    t.hipY = lieY + (HIP - lieY) * up - 0.25 * Math.sin(up * Math.PI);
    t.lRx = t.lLx = -1.2 * Math.sin(up * Math.PI); t.kR = t.kL = 1.5 * Math.sin(up * Math.PI);
    t.aRx = -0.8 * (1 - up); t.aLx = -0.8 * (1 - up); t.aRz = -0.5; t.aLz = 0.5; t.headX = 0.3 * (1 - up);
    return 14;
  }
  if (st === 'panic') {
    const ph = time * 16 + e.id.length;
    walkCycleInto(t, ph * 0.9, 1.1);
    t.aRx = -2.7 + Math.sin(ph) * 0.6; t.aLx = -2.7 + Math.cos(ph) * 0.6; t.aRz = -0.55; t.aLz = 0.55; t.fRx = t.fLx = -0.5;
    t.headY = Math.sin(time * 9) * 0.5; t.headX = -0.35; t.pitch = 0.05;
    return 16;
  }
  return 0;
}
function walkCycleInto(t, ph, amt) { walkCycle(t, ph, amt, 1); }
