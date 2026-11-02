// Shared enemy entity: perception/aggro/leash, hit reactions, launch tumble, stun stars, generic death.
import * as THREE from 'three';
import { clamp, damp, dampAngle, rand } from '../core/utils.js';
import { Spring, integrate, textures } from './common.js';

let uid = 0;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const TAU = Math.PI * 2;

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
    dying: false, deathT: 0, dissolved: false, removed: false, token: false, icon: null, iconT: 0, stars: null,
    getCenter(out = new THREE.Vector3()) { return out.copy(object.position).setY(object.position.y + e.height * 0.5); },
    onHit(result, hit) { onHit(ctx, e, result, hit); },
    onDeath(result, hit) { onDeath(ctx, e, result, hit); },
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
  e.icon.material.map = kind === '?' ? tex.question : tex.alert;
  e.icon.visible = true; e.iconT = 0; e.iconDur = kind === '?' ? 1.6 : 1.25;
}
function updateIcon(e, dt) {
  if (!e.icon || !e.icon.visible) return;
  e.iconT += dt;
  const t = e.iconT, k = e.isBoss ? 2 : 1;
  const pop = t < 0.12 ? t / 0.12 * 1.35 : t < 0.25 ? 1.35 - (t - 0.12) / 0.13 * 0.35 : 1;
  const fade = t > e.iconDur - 0.25 ? Math.max(0, (e.iconDur - t) / 0.25) : 1;
  const s = 0.75 * pop * fade * k;
  e.icon.scale.set(s, s, 1);
  e.icon.position.set(0, e.model.headTop + 0.15 + Math.sin(t * 9) * 0.04 + (t < 0.2 ? t : 0.2), 0);
  if (t > e.iconDur) e.icon.visible = false;
}
function updateStars(e, dt, on) {
  if (!on) { if (e.stars) e.stars.visible = false; return; }
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
  e.stars.children.forEach((s, i) => {
    const a = i / 4 * TAU;
    s.position.set(Math.cos(a) * r, Math.sin(a * 2 + e.stars.rotation.y * 2) * 0.06, Math.sin(a) * r);
  });
}

// ------------------------------------------------------------------ aggro
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
  e.distP = Math.hypot(pp.x - e.object.position.x, pp.z - e.object.position.z);
  if (e.isBoss) return;
  if (e.giveUpT > 0) e.giveUpT -= dt;
  if (!e.aggro) {
    if (e.giveUpT > 0) return;
    const sight = e.state === 'return' ? e.sight * 0.55 : (e.sitting ? e.sight * 0.75 : e.sight);
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
function onHit(ctx, e, result, hit) {
  if (e.dying) return;
  const dmg = result?.damage || 0;
  // provoked: chase the attacker beyond the normal leash for a while, and don't regen
  e.provokedT = 8; e.sinceHurt = 0; e.giveUpT = 0;
  e.leashBonus = Math.max(e.leashBonus || 0, Math.max(0, (e.distP || 0) - e.leash + 10));
  e.waterBlockT = 0;
  if (!e.aggro && !e.isDummy) alert(ctx, e, true);
  // hit direction in local space
  if (hit?.direction && hit.direction.lengthSq() > 1e-6) _v.copy(hit.direction);
  else if (hit?.point) _v.subVectors(e.object.position, hit.point);
  else _v.set(0, 0, 1);
  _v.y = 0; if (_v.lengthSq() < 1e-6) _v.set(0, 0, 1); _v.normalize();
  const c = Math.cos(-e.facing), s = Math.sin(-e.facing);
  const lx = _v.x * c + _v.z * s, lz = -_v.x * s + _v.z * c;
  const amt = (2.5 + Math.min(6, dmg / 6)) / Math.sqrt(e.mass || 1) * (hit?.heavy ? 1.6 : 1);
  e.flX.kick(lz * amt);
  e.flZ.kick(-lx * amt);
  e.hurt = 1;
  if (!e.isBoss && !e.isDummy && (hit?.heavy || dmg >= e.staggerDmg) && !e.statuses.frozen) {
    ctx.releaseToken(e);
    e.staggerDur = hit?.heavy ? 0.95 : 0.55;
    e.setState('stagger');
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
    ctx.dissolveFx(e);
    ctx.loot.drop(e);
  }
  if (e.dissolved) {
    const k = clamp((e.deathT - (e.dissolveAt ?? 1.05)) / 0.35, 0, 1);
    const sc = 1 - k * k;
    e.object.scale.set(1 + k * 0.4, Math.max(0.001, sc), 1 + k * 0.4);
    if (k >= 1) return true;
  }
  return false;
}

// ------------------------------------------------------------------ per-frame
export function updateEnemy(ctx, e, dt) {
  const game = ctx.game;
  if (e.dying) {
    const done = e.deathUpdate ? e.deathUpdate(dt) : genericDeath(ctx, e, dt);
    if (done) ctx.remove(e);
    return;
  }
  const combat = game.combat, st = e.statuses;
  const frozen = !!st.frozen, stunned = !!st.stunned && !frozen;
  const can = combat.canAct(e) !== false;
  const sm = can ? (combat.speedMul(e) ?? 1) : 0;
  e.stateT += dt;
  e.hurt = Math.max(0, e.hurt - dt * 4);
  if (e.provokedT > 0) { e.provokedT -= dt; if (e.provokedT <= 0) e.leashBonus = 0; }
  e.sinceHurt = (e.sinceHurt ?? 99) + dt;
  // out-of-combat regen: only after resting at home unhurt for 4s (no instant full heal on return)
  if (!e.aggro && !e.isBoss && !e.isDummy && e.state === 'idle' && e.sinceHurt > 4 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3 * dt);
  if (!e.isDummy) perceive(ctx, e, dt);

  // launch / tumble
  if (!e.noTumble && !e.launched && !e.grounded && (st.airborne || (e.velocity.y > 6 && !e.leaping))) {
    e.launched = true; e.launchT = 0; ctx.releaseToken(e);
    const c = Math.cos(-e.facing), s = Math.sin(-e.facing);
    const lz = -e.velocity.x * s + e.velocity.z * c;
    e.tumbleV = (lz >= 0 ? 1 : -1) * rand(8, 12);
  }

  e.move.set(0, 0, 0);
  if (!e.isDummy) {
    if (can && !e.launched) e.think(dt, sm);
    if (!e.noPhysics) integrate(game, e, dt);
  } else {
    e.velocity.set(0, 0, 0);
  }

  if (e.launched) {
    e.launchT += dt;
    if (!frozen) e.tumble += e.tumbleV * dt;
    if (e.grounded && e.launchT > 0.08) {
      e.launched = false;
      e.tumble = ((e.tumble % TAU) + TAU) % TAU; if (e.tumble > Math.PI) e.tumble -= TAU;
      ctx.dust(e.object.position, 0.7 * (e.mass || 1));
      e.staggerDur = 0.75; e.setState('stagger');
    }
  } else {
    e.tumble = damp(e.tumble, 0, 7, dt);
  }

  if (!frozen) {
    e.pose(dt, sm, stunned);
    const rig = e.model.rig;
    rig.rotation.x += e.flX.update(dt) * 0.12 - e.tumble;
    rig.rotation.z += e.flZ.update(dt) * 0.12;
    updateStars(e, dt, stunned);
  }
  e.object.rotation.y = e.facing;
  updateIcon(e, dt);
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
