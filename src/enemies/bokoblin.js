// 뿔도깨비 (id bokoblin) — melee goblin with club. Camp idle (sit by bonfire), alert, chase, strafe, telegraphed swing, leap smash.
import * as THREE from 'three';
import { rand, clamp, pick } from '../core/utils.js';
import { buildBokoblin } from './models.js';
import { makeEnemy, faceTo, moveTo, moveForward, angleToPlayer, newPose, dampPose, applyHumanoid, walkCycle, reactionPose } from './base.js';

const _v = new THREE.Vector3();
const HIP = 0.74;

export function createBokoblin(ctx, pos, opts = {}) {
  const model = buildBokoblin();
  model.lieY = 0.28;
  const e = makeEnemy(ctx, {
    kind: 'bokoblin', model, name: '뿔도깨비', hp: 140, radius: 0.55, height: 1.7, mass: 1,
    camp: opts.camp, facing: opts.facing, staggerDmg: 34,
  }, pos);
  const cur = newPose(HIP), tgt = newPose(HIP);
  let phase = rand(0, 6), speed = 0, attackCd = rand(0.5, 1.5), leapCd = rand(2, 5);
  let strafeDir = 1, swingHit = false, wanderT = rand(2, 6), wander = null, lookT = 0, lookY = 0;
  let leapTarget = new THREE.Vector3(), ring = null, smashCombo = false;
  e.sitting = !!opts.sit;

  const game = ctx.game;
  const attack = (kind) => game.events.emit('enemyAttack', { enemy: e, kind });
  // reactions (base.js): interrupted attacks reset; super-armor only during the active swing frames
  e.interrupt = () => { swingHit = true; smashCombo = false; e.sitting = false; if (ring && (e.state === 'leap' || e.state === 'leapPrep')) ring.t = Math.max(ring.t, ring.dur); ring = null; };
  e.onResume = () => { attackCd = Math.max(attackCd, 0.6); };
  e.armor = () => (e.state === 'swing' && e.stateT < 0.2) || e.state === 'leap';

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    attackCd -= dt; leapCd -= dt;
    switch (e.state) {
      case 'idle': {
        if (e.sitting) break;
        wanderT -= dt;
        if (wanderT <= 0) {
          wanderT = rand(3, 7);
          wander = wander ? null : _v.set(e.home.x + rand(-4, 4), 0, e.home.z + rand(-4, 4)).clone();
        }
        if (wander) {
          faceTo(e, wander.x, wander.z, 4, dt);
          if (moveTo(e, wander.x, wander.z, 1.4 * sm, 0.6) < 0.7) wander = null;
        }
        break;
      }
      case 'alert':
        e.sitting = false;
        faceTo(e, pp.x, pp.z, 8, dt);
        if (e.stateT < 0.02 && e.grounded) e.velocity.y = 4.5;
        if (e.stateT > 0.75) e.setState('chase');
        break;
      case 'chase': {
        if (!e.aggro) { e.setState('return'); break; }
        faceTo(e, pp.x, pp.z, 7, dt);
        if (d > 2.3) moveForward(e, (d > 6 ? 4.8 : 3.6) * sm);
        if (d < 2.6 && attackCd <= 0 && angleToPlayer(ctx, e) < 0.6) {
          if (ctx.takeToken(e)) { e.setState('windup'); attack('windup'); }
          else { strafeDir = Math.random() < 0.5 ? 1 : -1; e.setState('strafe'); }
        } else if (d > 5 && d < 9.5 && leapCd <= 0 && attackCd <= 0 && Math.random() < 0.02) {
          if (ctx.takeToken(e)) { e.setState('leapPrep'); attack('leap'); }
        } else if (d < 5.5 && attackCd > 0.3 && Math.random() < 0.01) {
          strafeDir = Math.random() < 0.5 ? 1 : -1; e.setState('strafe');
        }
        break;
      }
      case 'strafe': {
        faceTo(e, pp.x, pp.z, 8, dt);
        _v.set(pp.x - p.x, 0, pp.z - p.z).normalize();
        const radial = clamp((d - 4.2) * 0.8, -1.5, 1.5);
        e.move.set(-_v.z * strafeDir * 2.3 + _v.x * radial, 0, _v.x * strafeDir * 2.3 + _v.z * radial).multiplyScalar(sm);
        if (e.stateT > 1.6 || (attackCd <= 0 && e.stateT > 0.6)) e.setState('chase');
        break;
      }
      case 'windup':
        faceTo(e, pp.x, pp.z, 4.5, dt);
        if (d > 1.8) moveForward(e, 0.9 * sm);
        if (e.stateT > 0.62 / Math.max(0.5, sm)) { e.setState('swing'); swingHit = false; ctx.audio('blink', { position: p, volume: 0.35, pitch: 0.55 }); }
        break;
      case 'swing': {
        const t = e.stateT;
        if (t < 0.16) moveForward(e, 4.2 * sm);
        if (!swingHit && t > 0.07 && t < 0.22) {
          if (ctx.meleeCheck(e, 2.9, 1.25)) {
            swingHit = true;
            ctx.hitPlayer(e, { amount: 14, knockback: 8, launch: 2.5 });
          }
        }
        if (t > 0.12 && t < 0.14) { ctx.dust(e.model.weapon.getWorldPosition(_v), 0.35); }
        if (t > 0.3) { e.setState('recover'); }
        break;
      }
      case 'leapPrep': {
        faceTo(e, pp.x, pp.z, 6, dt);
        if (e.stateT > 0.5) {
          // predict landing ~0.75s flight
          const T = 0.75;
          leapTarget.set(pp.x, 0, pp.z);
          _v.set(leapTarget.x - p.x, 0, leapTarget.z - p.z);
          const len = _v.length(); if (len > 0.5) leapTarget.addScaledVector(_v, -1.1 / len);
          leapTarget.y = ctx.groundH(leapTarget.x, leapTarget.z);
          e.velocity.set((leapTarget.x - p.x) / T, 22 * T / 2, (leapTarget.z - p.z) / T);
          e.grounded = false; e.leaping = true;
          ring = ctx.telegraphs.show(leapTarget, 2.9, T, 0xff5a2a);
          e.setState('leap');
          ctx.audio('jump', { position: p, volume: 0.6, pitch: 0.7 });
        }
        break;
      }
      case 'leap':
        if (e.grounded && e.stateT > 0.1) {
          e.leaping = false;
          ctx.slam(e.object.position, 2.9, { amount: 18, knockback: 11, launch: 6 }, e);
          e.setState('recover'); smashCombo = true;
          leapCd = rand(6, 10);
        }
        break;
      case 'recover':
        if (e.stateT > (smashCombo ? 0.9 : 0.55)) {
          smashCombo = false; ctx.releaseToken(e);
          attackCd = rand(1.1, 2.3);
          e.setState('chase');
        }
        break;
      case 'return': {
        faceTo(e, e.home.x, e.home.z, 5, dt);
        if (moveTo(e, e.home.x, e.home.z, 3 * sm, 0.8) < 1) {
          e.setState('idle');
          e.sitting = !!opts.sit;
          if (opts.facing != null) e.facing = opts.facing;
        }
        break;
      }
    }
    speed = Math.hypot(e.move.x, e.move.z);
  };

  e.pose = (dt, sm, stunned) => {
    Object.assign(tgt, BASE);
    const t = game.time + e.id.length;
    let lambda = 12, rl = 0;
    phase += dt * (1.2 + speed * 2.3);
    const st = e.state;
    if (st === 'dead') {
      tgt.aRz = -1.4; tgt.aLz = 1.4; tgt.aRx = -0.5; tgt.aLx = -0.5; tgt.lRx = -0.6; tgt.lLx = -0.2; tgt.kR = 0.5; tgt.kL = 0.3; tgt.headX = -0.4;
      lambda = 8;
    } else if ((rl = reactionPose(e, tgt, HIP, t, model.lieY))) {
      lambda = rl;
    } else if (stunned) {
      tgt.headY = Math.sin(t * 5) * 0.4; tgt.headZ = Math.cos(t * 5) * 0.3; tgt.roll = Math.sin(t * 2.5) * 0.12;
      tgt.pitch = 0.2; tgt.aRx = 0.2; tgt.aLx = 0.2; tgt.aRz = -0.5; tgt.aLz = 0.5; tgt.fRx = -0.4; tgt.fLx = -0.4; tgt.kR = tgt.kL = 0.4; tgt.lRx = tgt.lLx = -0.3; tgt.hipY = HIP - 0.08;
    } else if (st === 'idle' && e.sitting) {
      tgt.hipY = 0.32; tgt.pitch = 0.18; tgt.lRx = tgt.lLx = -1.45; tgt.kR = tgt.kL = 1.35; tgt.lRz = 0.18; tgt.lLz = -0.18;
      tgt.aRx = -0.9; tgt.aLx = -0.9; tgt.fRx = -0.5; tgt.fLx = -0.6; tgt.aRz = -0.15; tgt.aLz = 0.15;
      tgt.spineX = 0.12 + Math.sin(t * 1.6) * 0.03; tgt.headX = -0.15 + Math.sin(t * 0.7) * 0.08; tgt.headY = Math.sin(t * 0.33) * 0.5;
      lambda = 5;
    } else if (st === 'windup') {
      const k = clamp(e.stateT / 0.35, 0, 1);
      tgt.aRx = -3.4 * k - 0.2; tgt.fRx = -0.9 * k; tgt.aRz = -0.35;
      tgt.aLx = -0.9; tgt.aLz = 0.5; tgt.fLx = -0.6;
      tgt.pitch = -0.28 * k; tgt.spineX = -0.2 * k; tgt.spineY = 0.45 * k; tgt.headX = 0.2;
      tgt.lRx = 0.35; tgt.lLx = -0.45; tgt.kL = 0.5; tgt.kR = 0.15;
      tgt.hipY = HIP - 0.05;
      // trembling tension
      tgt.roll = Math.sin(t * 60) * 0.025 * k;
      lambda = 14;
    } else if (st === 'swing') {
      tgt.aRx = -0.55; tgt.fRx = -0.1; tgt.aRz = -0.1;
      tgt.aLx = 0.5; tgt.aLz = 0.4;
      tgt.pitch = 0.5; tgt.spineX = 0.35; tgt.spineY = -0.5; tgt.headX = -0.2;
      tgt.lRx = 0.5; tgt.lLx = -0.7; tgt.kL = 0.6; tgt.kR = 0.2; tgt.hipY = HIP - 0.12;
      lambda = 34;
    } else if (st === 'recover') {
      tgt.aRx = -0.7; tgt.fRx = -0.3; tgt.pitch = smashCombo ? 0.6 : 0.3; tgt.spineX = 0.2; tgt.spineY = -0.2;
      tgt.lRx = 0.4; tgt.lLx = -0.5; tgt.kL = 0.5; tgt.kR = 0.3; tgt.hipY = HIP - (smashCombo ? 0.25 : 0.08);
      tgt.headX = 0.3; tgt.aLx = 0.2; lambda = 7;
    } else if (st === 'leapPrep') {
      tgt.hipY = HIP - 0.3; tgt.pitch = 0.55; tgt.lRx = tgt.lLx = -1.1; tgt.kR = tgt.kL = 1.6;
      tgt.aRx = -3.3; tgt.fRx = -0.6; tgt.aLx = -2.8; tgt.aLz = 0.3; tgt.headX = -0.4;
      tgt.roll = Math.sin(t * 50) * 0.03; lambda = 10;
    } else if (st === 'leap') {
      const up = e.velocity.y > 0;
      tgt.aRx = up ? -3.6 : -0.8; tgt.fRx = up ? -0.8 : -0.1; tgt.aLx = up ? -3.2 : -1.2; tgt.aLz = 0.4;
      tgt.pitch = up ? -0.35 : 0.5; tgt.lRx = -0.9; tgt.lLx = -0.4; tgt.kR = 1.2; tgt.kL = 0.8; tgt.spineX = up ? -0.3 : 0.4;
      lambda = up ? 10 : 22;
    } else if (st === 'alert') {
      tgt.aRx = -2.2; tgt.fRx = -0.6; tgt.aLx = -1.8; tgt.aLz = 0.7; tgt.aRz = -0.6; tgt.headX = -0.25; tgt.pitch = -0.15;
      tgt.kR = tgt.kL = e.grounded ? 0.4 : 0.9; tgt.lRx = tgt.lLx = e.grounded ? -0.25 : -0.7;
      lambda = 16;
    } else {
      // locomotion / idle stand
      const amt = clamp(speed / 3, 0, 1.2);
      if (amt > 0.05) walkCycle(tgt, phase, amt, clamp((speed - 3) / 2, 0, 1));
      else {
        tgt.spineX = Math.sin(t * 2) * 0.03; tgt.aRx = -0.25 + Math.sin(t * 2) * 0.04; tgt.aLx = -0.1; tgt.aLz = 0.18; tgt.aRz = -0.18;
        tgt.fRx = -0.5; tgt.fLx = -0.35; tgt.kR = tgt.kL = 0.12; tgt.lRx = tgt.lLx = -0.06;
        lookT -= dt; if (lookT <= 0) { lookT = rand(1.5, 4); lookY = rand(-0.7, 0.7); }
        tgt.headY = e.aggro ? 0 : lookY;
      }
      if (st === 'strafe') { tgt.aRx = -1.0; tgt.fRx = -0.8; tgt.aRz = -0.3; tgt.pitch = 0.2; tgt.hipY -= 0.08; }
      if (e.aggro && st === 'chase') { tgt.aRx -= 0.5; tgt.fRx = -0.9; }
    }
    dampPose(cur, tgt, lambda, dt);
    if (e.hurt > 0) cur.headX -= e.hurt * 0.04;
    applyHumanoid(model, cur);
  };
  return e;
}

const BASE = newPose(HIP);
