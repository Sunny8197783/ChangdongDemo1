// 츄츄 — jelly slime. Squash & stretch hops, quivering lunge, elemental variants, goo pop on death.
import * as THREE from 'three';
import { rand, clamp, damp, ELEMENT_COLORS } from '../core/utils.js';
import { buildChuchu } from './models.js';
import { Spring } from './common.js';
import { makeEnemy, faceTo } from './base.js';

const _v = new THREE.Vector3();
const STATUS = { fire: { burning: 3 }, ice: { chilled: 3 }, lightning: { shocked: 2.5 } };

export function createChuchu(ctx, pos, opts = {}) {
  const variant = opts.variant || 'normal';
  const model = buildChuchu(variant);
  const V = model.variant, el = V.element;
  const resist = el ? { [el]: 0 } : null;
  const e = makeEnemy(ctx, {
    kind: 'chuchu', model, name: V.name, hp: 60, radius: 0.6, height: 1.0, mass: 0.7,
    camp: opts.camp, facing: opts.facing, staggerDmg: 22, sight: 18, resist,
  }, pos);
  e.variant = variant; e.element = el;
  e.friction = 9;
  const game = ctx.game;
  const sy = new Spring(260, 9), wob = new Spring(160, 5), lean = new Spring(120, 10);
  sy.reset(1);
  let hopT = rand(0.5, 2), lungeCd = rand(1, 2), hit = false, touchCd = 0, aura = null, idleHopT = rand(1, 3);
  let crouch = 0, quiver = 0;
  if (el) {
    const col = ELEMENT_COLORS[el];
    const shape = el === 'fire' ? 'ember' : el === 'ice' ? 'snow' : 'spark';
    aura = game.vfx.emitter?.({ follow: model.core, rate: el === 'fire' ? 14 : 9, color: [col, 0xffffff], speed: 0.9, spread: 1,
      size: el === 'lightning' ? 0.1 : 0.16, sizeEnd: 0, life: 0.7, shape, gravity: el === 'fire' ? -3 : el === 'ice' ? 0.6 : 0, drag: 1, offset: new THREE.Vector3(0, 0.2, 0) });
  }

  function hop(dirX, dirZ, h, up) {
    e.velocity.x += dirX * h; e.velocity.z += dirZ * h; e.velocity.y = up;
    e.grounded = false; e.leaping = true;
    sy.kick(4); wob.kick(rand(-2, 2));
    ctx.audio('jump', { position: e.object.position, volume: 0.25, pitch: 1.6 + Math.random() * 0.3 });
  }
  function land() {
    e.leaping = false;
    sy.kick(-7); wob.kick(rand(-4, 4));
    ctx.audio('land', { position: e.object.position, volume: 0.3, pitch: 1.5 });
    _v.copy(e.object.position); _v.y += 0.05;
    game.vfx.burst(_v, { count: 6, color: V.body, speed: 2, spread: 0.6, dir: _v.set(0, 1, 0), size: 0.12, sizeEnd: 0.02, life: 0.4, gravity: 12, shape: 'soft', additive: false });
  }

  e.react = (result, hit, lx, lz) => {
    sy.kick(-6 - Math.min(10, (result?.damage || 0) / 4));
    wob.kick((Math.random() < 0.5 ? -1 : 1) * 8);
    lean.kick(lz * 6);
    if (e.state === 'lungePrep') e.setState('chase');
  };
  e.die = () => { aura?.stop?.(); };

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    lungeCd -= dt; touchCd -= dt;
    if (e.grounded && e.leaping && e.stateT > 0.08) land();
    // elemental aura contact
    if (el && touchCd <= 0 && d < e.radius + 0.6 && Math.abs(pp.y - p.y) < 1.2) {
      touchCd = 1.2;
      ctx.hitPlayer(e, { amount: 6, element: el, status: STATUS[el], knockback: 4, noReaction: false });
    }
    switch (e.state) {
      case 'idle': {
        idleHopT -= dt;
        if (idleHopT <= 0 && e.grounded) {
          idleHopT = rand(1.5, 3.5);
          const a = Math.hypot(p.x - e.home.x, p.z - e.home.z) > 4 ? Math.atan2(e.home.x - p.x, e.home.z - p.z) : rand(0, 6.28);
          e.facing = a; crouch = 0.25;
          setTimeoutHop(() => hop(Math.sin(a), Math.cos(a), 1.6, 4.2));
        }
        break;
      }
      case 'alert':
        faceTo(e, pp.x, pp.z, 8, dt);
        if (e.stateT < 0.02 && e.grounded) hop(0, 0, 0, 5);
        if (e.stateT > 0.7 && e.grounded) e.setState('chase');
        break;
      case 'chase': {
        if (!e.aggro) { e.setState('return'); break; }
        faceTo(e, pp.x, pp.z, 6, dt);
        if (!e.grounded) break;
        if (d < 3.4 && lungeCd <= 0) { e.setState('lungePrep'); game.events.emit('enemyAttack', { enemy: e, kind: 'lunge' }); break; }
        hopT -= dt * sm;
        if (hopT < 0.22) crouch = 1 - hopT / 0.22;
        if (hopT <= 0) {
          hopT = rand(0.35, 0.65);
          _v.set(pp.x - p.x, 0, pp.z - p.z).normalize();
          hop(_v.x, _v.z, (d > 6 ? 4.2 : 2.8) * sm, 5.2);
          crouch = 0;
        }
        break;
      }
      case 'lungePrep':
        faceTo(e, pp.x, pp.z, 8, dt);
        quiver = clamp(e.stateT / 0.55, 0, 1);
        crouch = quiver;
        if (e.stateT > 0.55 / Math.max(0.4, sm)) {
          _v.set(pp.x - p.x, 0, pp.z - p.z); const len = Math.max(0.1, _v.length()); _v.multiplyScalar(1 / len);
          hop(_v.x, _v.z, Math.min(10, len * 2.6 + 3), 6);
          crouch = 0; quiver = 0; hit = false;
          e.setState('lunge');
        }
        break;
      case 'lunge':
        if (!hit && d < e.radius + 0.75 && Math.abs(pp.y + 0.6 - (p.y + 0.4)) < 1.3) {
          hit = true;
          ctx.hitPlayer(e, { amount: 10, element: el || 'physical', status: el ? STATUS[el] : null, knockback: 7, launch: 2 });
          e.velocity.x *= -0.3; e.velocity.z *= -0.3;
        }
        if (e.grounded && e.stateT > 0.1) { lungeCd = rand(1.8, 3); e.setState('chase'); hopT = rand(0.5, 0.9); }
        break;
      case 'stagger':
        if (e.stateT > e.staggerDur * 0.7) e.setState(e.aggro ? 'chase' : 'idle');
        break;
      case 'return': {
        if (!e.grounded) break;
        hopT -= dt;
        if (hopT <= 0) {
          hopT = rand(0.5, 0.8);
          _v.set(e.home.x - p.x, 0, e.home.z - p.z); const len = _v.length();
          if (len < 1.5) { e.setState('idle'); break; }
          _v.multiplyScalar(1 / len); e.facing = Math.atan2(_v.x, _v.z);
          hop(_v.x, _v.z, 3, 4.6);
        }
        break;
      }
    }
  };

  // deferred idle hop (after brief crouch) without timers: store a pending action
  let pending = null, pendingT = 0;
  function setTimeoutHop(fn) { pending = fn; pendingT = 0.22; }

  e.pose = (dt, sm, stunned) => {
    if (pending) { pendingT -= dt; if (pendingT <= 0) { const f = pending; pending = null; f(); } }
    const t = game.time;
    let target = 1;
    if (!e.grounded) target = 1 + clamp(e.velocity.y * 0.05, -0.15, 0.3);
    else if (crouch > 0) target = 1 - crouch * 0.35;
    if (e.state === 'dead') target = 0.6;
    const y = Math.max(0.35, sy.update(dt, target));
    const w = wob.update(dt);
    const breathe = Math.sin(t * 3 + e.id.length) * 0.03;
    const xz = 1 / Math.sqrt(y);
    const qv = quiver > 0 ? Math.sin(t * 70) * 0.05 * quiver : 0;
    const rig = model.rig;
    rig.scale.set(xz * (1 + w * 0.06) + qv, y + breathe, xz * (1 - w * 0.06) - qv);
    rig.position.set(0, 0, 0);
    // lean into motion
    let lz = 0;
    if (!e.grounded) {
      const c = Math.cos(-e.facing), s = Math.sin(-e.facing);
      lz = (-e.velocity.x * s + e.velocity.z * c) * 0.04;
    }
    rig.rotation.set(lean.update(dt, clamp(lz, -0.4, 0.4)), 0, w * 0.03);
    if (stunned) { rig.rotation.z += Math.sin(t * 6) * 0.15; rig.rotation.x += Math.cos(t * 6) * 0.1; }
    model.core.position.y = 0.38 + Math.sin(t * 4) * 0.04;
    model.eyes.scale.y = (Math.sin(t * 1.3 + e.id.length) > 0.985) ? 0.15 : 1; // blink
    if (e.hurt > 0.5) model.eyes.scale.y = 0.3;
  };

  e.deathUpdate = (dt) => {
    e.deathT += dt;
    const p = e.object.position;
    if (e.deathT < 0.32) {
      // swell up before popping
      e.move.set(0, 0, 0);
      const k = e.deathT / 0.32;
      const s = 1 + k * 0.45 + Math.sin(e.deathT * 60) * 0.05;
      model.rig.scale.set(s, s * (1 - k * 0.15), s);
      e.velocity.multiplyScalar(0.9);
      return false;
    }
    if (!e.dissolved) {
      e.dissolved = true;
      _v.copy(p); _v.y += 0.5;
      const vfx = game.vfx;
      vfx.burst(_v, { count: 34, color: [V.body, V.core], speed: 6, speedVar: 3, spread: 1, size: 0.22, sizeEnd: 0.05, life: 0.7, gravity: 16, shape: 'soft', additive: false });
      vfx.burst(_v, { count: 16, color: [0xffffff, V.body], speed: 3, spread: 1, size: 0.35, sizeEnd: 0, life: 0.35, shape: 'soft' });
      vfx.decal?.(p, { color: V.body, base: V.body, radius: 1.3, duration: 6, opacity: 0.55, type: 'soft' });
      vfx.shockwave?.(_v.set(p.x, p.y + 0.1, p.z), { color: V.body, radius: 2.2, duration: 0.35, opacity: 0.7 });
      if (el) vfx.explosion?.(_v.set(p.x, p.y + 0.5, p.z), { element: el, scale: 0.6 });
      ctx.audio('steam', { position: p, volume: 0.4, pitch: 1.8 });
      ctx.dissolveFx(e, 0.6);
      ctx.loot.drop(e);
      model.root.visible = false;
    }
    return e.deathT > 0.5;
  };
  return e;
}
