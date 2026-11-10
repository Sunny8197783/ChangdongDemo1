// 뿔도깨비 (id bokoblin) — melee goblin with club. Camp idle (sit by bonfire), alert, chase, strafe, telegraphed swing, leap smash.
import * as THREE from 'three';
import { rand, clamp, pick } from '../core/utils.js';
import { buildBokoblin } from './models.js';
import { makeEnemy, faceTo, moveTo, moveForward, angleToPlayer, newPose, dampPose, applyHumanoid, walkCycle, reactionPose,
  modelFor, beginAttack, liveAttack, attackPhase, windupK, punishAfter, attackMeta, rhythmDamp, copyPose } from './base.js';
import { typeName } from './codex.js';

const _v = new THREE.Vector3(), _dir = new THREE.Vector3();
const M_SWING = attackMeta('bokoblin.swing'), M_LEAP = attackMeta('bokoblin.leap');
const HIP = 0.74;

export function createBokoblin(ctx, pos, opts = {}) {
  const model = modelFor(ctx, 'bokoblin', {}, buildBokoblin);
  model.lieY = 0.28;
  const e = makeEnemy(ctx, {
    kind: 'bokoblin', model, name: typeName('bokoblin'), hp: 140, radius: 0.55, height: 1.7, mass: 1,
    camp: opts.camp, facing: opts.facing, staggerDmg: 34,
  }, pos);
  const cur = newPose(HIP), tgt = newPose(HIP);
  const wanderV = new THREE.Vector3();
  let phase = rand(0, 6), speed = 0, attackCd = rand(0.5, 1.5), leapCd = rand(2, 5);
  let strafeDir = 1, swingHit = false, wanderT = rand(2, 6), wander = null, lookT = 0, lookY = 0;
  let leapTarget = new THREE.Vector3(), smashCombo = false, H = null, recoverDur = 0.7, launched = false;
  // per-entity reusable decal shapes (hitbox = decal, §4.0): swing cone r 2.9 + 0.6 lunge, half-angle 1.0 rad; leap circle r 2.9
  const swingShape = { kind: 'cone', r: 3.5, angle: 1.0, dir: _dir, follow: true };
  const leapShape = { kind: 'circle', r: 2.9, pos: leapTarget };
  e.sitting = !!opts.sit;

  const game = ctx.game;
  // reactions (base.js): interrupted attacks reset (base stops the TellHandle); super-armor only during the active swing frames
  e.interrupt = () => { swingHit = true; smashCombo = false; e.sitting = false; H = null; e.leaping = false; };
  const faceDir = () => _dir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
  function startSwing(force) {
    if (!force && !ctx.takeToken(e)) return false;
    faceDir();
    H = beginAttack(ctx, e, 'bokoblin.swing', swingShape);
    if (!H) { ctx.releaseToken(e); return false; }
    e.setState('windup'); swingHit = false; return true;
  }
  function predictLanding() {
    const pp = ctx.playerPos, p = e.object.position;
    leapTarget.set(pp.x, 0, pp.z);
    _v.set(leapTarget.x - p.x, 0, leapTarget.z - p.z);
    const len = _v.length(); if (len > 0.5) leapTarget.addScaledVector(_v, -1.1 / len);
    leapTarget.y = ctx.groundH(leapTarget.x, leapTarget.z);
  }
  function startLeap(force) {
    if (!force && !ctx.takeToken(e)) return false;
    predictLanding();
    H = beginAttack(ctx, e, 'bokoblin.leap', leapShape);
    if (!H) { ctx.releaseToken(e); return false; }
    launched = false; e.setState('leapPrep'); return true;
  }
  e.attackStarters['bokoblin.swing'] = startSwing;
  e.attackStarters['bokoblin.leap'] = startLeap;
  e.onResume = () => { attackCd = Math.max(attackCd, 0.6); };
  e.armor = () => (e.state === 'windup' && attackPhase(H) === 2) || e.state === 'swing' || e.state === 'leap';

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    attackCd -= dt; leapCd -= dt;
    switch (e.state) {
      case 'idle': {
        if (e.sitting) break;
        wanderT -= dt;
        if (wanderT <= 0) {
          wanderT = rand(3, 7);
          wander = wander ? null : wanderV.set(e.home.x + rand(-4, 4), 0, e.home.z + rand(-4, 4));
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
        if (d < 3.0 && attackCd <= 0 && angleToPlayer(ctx, e) < 0.6) {
          if (!startSwing(false)) { attackCd = 0.4; strafeDir = Math.random() < 0.5 ? 1 : -1; e.setState('strafe'); }
        } else if (d > 5 && d < 9.5 && leapCd <= 0 && attackCd <= 0 && Math.random() < 0.02) {
          if (!startLeap(false)) leapCd = 1.5;
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
      case 'windup': {
        // anticipation → hold → strike on the one TellHandle (§4.0); aim tracks until the lock
        if (!H || (!H.alive && !H.struck)) { H = null; ctx.releaseToken(e); e.setState('chase'); break; }
        if (!H.locked) { faceTo(e, pp.x, pp.z, 4.5, dt); H.setDir(faceDir()); if (d > 1.8) moveForward(e, 0.9 * sm); }
        if (attackPhase(H) === 2) moveForward(e, 5 * sm);     // the 0.6 m lunge (inside the decal)
        if (H.consumeStrike()) {
          if (H.contains(pp) && Math.abs(pp.y - p.y) < 2.4) ctx.hitPlayer(e, { amount: 14, knockback: 8, launch: 2.5, attack: M_SWING });
          ctx.dust(e.model.weapon.getWorldPosition(_v), 0.35);
          ctx.audio('blink', { position: p, volume: 0.35, pitch: 0.55 });
          e.setState('swing');
        }
        break;
      }
      case 'swing':
        if (e.stateT > 0.12) { recoverDur = punishAfter(ctx, e, 'bokoblin.swing') || 0.7; smashCombo = false; e.setState('recover'); }
        break;
      case 'leapPrep': {
        if (!H || !H.alive) { H = null; ctx.releaseToken(e); e.setState('chase'); break; }
        faceTo(e, pp.x, pp.z, 6, dt);
        if (!H.locked) { predictLanding(); H.setPos(leapTarget); }
        else if (!launched) {
          // launch at the lock: the flight ends exactly at the hit (decal from prep start)
          const T = Math.max(0.2, H.remaining);
          e.velocity.set((leapTarget.x - p.x) / T, (leapTarget.y - p.y) / T + 22 * T / 2, (leapTarget.z - p.z) / T);
          e.grounded = false; e.leaping = true; launched = true;
          e.setState('leap');
          ctx.audio('jump', { position: p, volume: 0.6, pitch: 0.7 });
        }
        break;
      }
      case 'leap':
        if (H && H.consumeStrike()) {
          e.leaping = false;
          p.x = leapTarget.x; p.z = leapTarget.z;
          ctx.slam(leapTarget, 2.9, { amount: 18, knockback: 11, launch: 6, handle: H, attack: M_LEAP }, e);
          recoverDur = punishAfter(ctx, e, 'bokoblin.leap') || 1.2;
          e.setState('recover'); smashCombo = true; H = null;
          leapCd = rand(6, 10);
        } else if (!H || (!H.alive && !H.struck)) { H = null; e.leaping = false; if (e.grounded) { ctx.releaseToken(e); e.setState('chase'); } }
        break;
      case 'recover':
        if (e.stateT > recoverDur) {
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
    speed = Math.sqrt(e.move.x * e.move.x + e.move.z * e.move.z);
  };

  e.pose = (dt, sm, stunned) => {
    copyPose(tgt, BASE);
    const AH = liveAttack(e), ph = attackPhase(AH), holding = ph === 1;
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
    } else if (st === 'windup' && ph === 2) {
      // strike (≤ 0.12 s)
      tgt.aRx = -0.55; tgt.fRx = -0.1; tgt.aRz = -0.1; tgt.aLx = 0.5; tgt.aLz = 0.4;
      tgt.pitch = 0.5; tgt.spineX = 0.35; tgt.spineY = -0.5; tgt.headX = -0.2;
      tgt.lRx = 0.5; tgt.lLx = -0.7; tgt.kL = 0.6; tgt.kR = 0.2; tgt.hipY = HIP - 0.12;
      lambda = 40;
    } else if (st === 'windup') {
      const k = windupK(AH);
      tgt.aRx = -3.4 * k - 0.2; tgt.fRx = -0.9 * k; tgt.aRz = -0.35;
      tgt.aLx = -0.9; tgt.aLz = 0.5; tgt.fLx = -0.6;
      tgt.pitch = -0.28 * k; tgt.spineX = -0.2 * k; tgt.spineY = 0.45 * k; tgt.headX = 0.2;
      tgt.lRx = 0.35; tgt.lLx = -0.45; tgt.kL = 0.5; tgt.kR = 0.15;
      tgt.hipY = HIP - 0.05;
      // trembling tension (anticipation only; the hold is perfectly still)
      tgt.roll = Math.sin(t * 60) * 0.025 * k;
      lambda = 14;
    } else if (st === 'swing') {
      tgt.aRx = -0.55; tgt.fRx = -0.1; tgt.aRz = -0.1;
      tgt.aLx = 0.5; tgt.aLz = 0.4;
      tgt.pitch = 0.5; tgt.spineX = 0.35; tgt.spineY = -0.5; tgt.headX = -0.2;
      tgt.lRx = 0.5; tgt.lLx = -0.7; tgt.kL = 0.6; tgt.kR = 0.2; tgt.hipY = HIP - 0.12;
      lambda = 34;
    } else if (st === 'recover') {
      // visible slump for the whole punish window: club stuck in the ground, head low
      tgt.aRx = smashCombo ? -0.2 : -0.45; tgt.fRx = -0.1; tgt.pitch = smashCombo ? 0.75 : 0.5; tgt.spineX = 0.35; tgt.spineY = -0.25;
      tgt.lRx = 0.45; tgt.lLx = -0.55; tgt.kL = 0.65; tgt.kR = 0.4; tgt.hipY = HIP - (smashCombo ? 0.3 : 0.16);
      tgt.headX = 0.55; tgt.aLx = 0.35; tgt.aLz = 0.4; lambda = 7;
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
    rhythmDamp(cur, tgt, lambda, dt, holding);
    if (e.hurt > 0 && !holding) cur.headX -= e.hurt * 0.04;
    applyHumanoid(model, cur);
  };
  return e;
}

const BASE = newPose(HIP);
