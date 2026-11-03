// 공허 망령 (wraith) — floating void spirit. Hovers and drifts, blinks away through violet smoke when pressed, charges a homing
// void bolt (telegraphed by a gathering orb + rising wisps). voidShield 60 (break it with light / reactions). CONTRACT §14.
import * as THREE from 'three';
import { rand, clamp } from '../core/utils.js';
import { buildWraith } from './models2.js';
import { makeEnemy, faceTo, moveTo, newPose, dampPose, applyHumanoid, reactionPose } from './base.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const HIP = 1.15;
const BASE = newPose(HIP);
const VOID = 0xb36bff;

export function createWraith(ctx, pos, opts = {}) {
  const model = buildWraith();
  model.lieY = 0.4;
  const e = makeEnemy(ctx, {
    kind: 'wraith', model, name: '공허 망령', hp: 140, radius: 0.5, height: 2.0, mass: 0.6,
    camp: opts.camp, facing: opts.facing, staggerDmg: 32, sight: 26, chaseState: 'drift', resist: { shadow: 0.5, light: 1.3 },
    noTumble: false,
  }, pos);
  e.element = 'void'; e.isVoid = true; e.voidShield = 60; e.voidShieldMax = 60;
  e.hover = 0.35; e.dissolveColor = VOID;
  const game = ctx.game;
  const cur = newPose(HIP), tgt = newPose(HIP);
  let castCd = rand(1.4, 2.6), tpCd = 3, fired = false, strafeDir = 1, strafeT = 0, em = null, fade = 1;
  const tpTo = new THREE.Vector3();
  const stopFx = () => { em?.stop?.(); em = null; };
  e.interrupt = () => { fired = true; stopFx(); };
  e.onResume = () => { castCd = Math.max(castCd, 0.7); };
  e.die = () => stopFx();

  function smoke(at, s = 1) {
    _v.copy(at); _v.y += 1.1;
    game.vfx.burst(_v, { count: Math.round(22 * s), color: [0x5a2a9a, 0x160f24], speed: 2.6, spread: 1, size: 0.6, sizeEnd: 1.4, life: 0.8, shape: 'smoke', additive: false, drag: 2.5 });
    game.vfx.burst(_v, { count: Math.round(16 * s), color: [0xe6c8ff, VOID], speed: 4.5, spread: 1, size: 0.14, sizeEnd: 0, life: 0.5, shape: 'wisp', drag: 3 });
  }
  function pickTeleport() {
    const pp = ctx.playerPos, p = e.object.position;
    for (let i = 0; i < 8; i++) {
      const a = Math.atan2(p.x - pp.x, p.z - pp.z) + rand(-1.6, 1.6), r = rand(8, 12);
      const x = pp.x + Math.sin(a) * r, z = pp.z + Math.cos(a) * r;
      if (Math.hypot(x - e.home.x, z - e.home.z) > 28) continue;
      tpTo.set(x, ctx.groundH(x, z), z);
      return;
    }
    tpTo.set(e.home.x, ctx.groundH(e.home.x, e.home.z), e.home.z);
  }

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    castCd -= dt; tpCd -= dt;
    if (e.state !== 'cast') stopFx();
    switch (e.state) {
      case 'idle':
        e.facing += dt * 0.2;
        break;
      case 'alert':
        faceTo(e, pp.x, pp.z, 6, dt);
        if (e.stateT > 0.8) e.setState('drift');
        break;
      case 'drift': {
        if (!e.aggro) { e.setState('return'); break; }
        faceTo(e, pp.x, pp.z, 5, dt);
        if (d < 4.5 && tpCd <= 0) { e.setState('vanish'); smoke(p); ctx.audio('blink', { position: p, volume: 0.5, pitch: 0.6 }); break; }
        _v.set(pp.x - p.x, 0, pp.z - p.z).normalize();
        strafeT -= dt; if (strafeT <= 0) { strafeT = rand(1.2, 2.6); strafeDir = Math.random() < 0.5 ? -1 : 1; }
        const radial = d < 8 ? -2 : d > 14 ? 2 : 0;
        e.move.set(-_v.z * strafeDir * 1.8 + _v.x * radial, 0, _v.x * strafeDir * 1.8 + _v.z * radial).multiplyScalar(sm);
        if (castCd <= 0 && d < 24) {
          e.setState('cast'); fired = false;
          game.events.emit('enemyAttack', { enemy: e, kind: 'cast' });
          em = game.vfx.emitter?.({ follow: model.orb, rate: 36, color: [0xe6c8ff, VOID], speed: 1.4, spread: 1, size: 0.13, sizeEnd: 0, life: 0.5, shape: 'wisp', drag: 2, gravity: -1.5 });
          ctx.audio('charge', { position: p, volume: 0.35, pitch: 0.7 });
        }
        break;
      }
      case 'cast':
        faceTo(e, pp.x, pp.z, 6, dt);
        if (!fired && e.stateT > 0.9 / Math.max(0.4, sm)) {
          fired = true; stopFx();
          model.orb.getWorldPosition(_v);
          ctx.projectiles.orb(_v, 'void', e, { color: VOID, amount: 13, speed: 9.5, status: { blight: 2 } });
          ctx.audio('cast_shadow', { position: p, volume: 0.6, pitch: 0.7 });
        }
        if (e.stateT > 1.3) { castCd = rand(2.4, 3.6); e.setState('drift'); }
        break;
      case 'vanish':
        fade = Math.max(0, 1 - e.stateT / 0.3);
        if (e.stateT > 0.3) { pickTeleport(); p.copy(tpTo); e.velocity.set(0, 0, 0); smoke(p); e.setState('appear'); tpCd = rand(4, 6); }
        break;
      case 'appear':
        fade = Math.min(1, e.stateT / 0.3);
        faceTo(e, pp.x, pp.z, 10, dt);
        if (e.stateT > 0.35) { fade = 1; castCd = Math.min(castCd, 0.5); e.setState('drift'); }
        break;
      case 'return':
        faceTo(e, e.home.x, e.home.z, 4, dt);
        if (moveTo(e, e.home.x, e.home.z, 2.6 * sm, 0.8) < 1) e.setState('idle');
        break;
    }
  };

  e.pose = (dt, sm, stunned) => {
    Object.assign(tgt, BASE);
    const t = game.time + e.id.length;
    let lambda = 8, rl = 0;
    const st = e.state;
    const bob = Math.sin(t * 1.8) * 0.12;
    if (st === 'dead') { tgt.pitch = -0.6; tgt.aRz = -1.2; tgt.aLz = 1.2; lambda = 6; }
    else if ((rl = reactionPose(e, tgt, HIP, t, model.lieY))) lambda = rl;
    else if (stunned) { tgt.roll = Math.sin(t * 3) * 0.2; tgt.headZ = Math.sin(t * 4) * 0.35; }
    else if (st === 'cast') {
      const k = clamp(e.stateT / 0.8, 0, 1);
      if (!fired) { tgt.aLx = -1.8 * k; tgt.aLz = 0.3; tgt.fLx = -0.6; tgt.aRx = -0.8 * k; tgt.aRz = -0.9 * k; tgt.pitch = -0.2 * k; tgt.headX = -0.3 * k; tgt.spineY = -0.3 * k; }
      else { tgt.aLx = -1.4; tgt.fLx = 0; tgt.pitch = 0.3; tgt.spineY = 0.3; lambda = 20; }
    } else {
      // floaty idle: arms drift, the robe sways with the motion
      tgt.aRx = -0.4 + Math.sin(t * 1.3) * 0.15; tgt.aLx = -0.4 + Math.cos(t * 1.2) * 0.15; tgt.aRz = -0.35; tgt.aLz = 0.35; tgt.fRx = tgt.fLx = -0.5;
      tgt.pitch = 0.1 + Math.hypot(e.move.x, e.move.z) * 0.05; tgt.headX = 0.15 + Math.sin(t * 0.7) * 0.1;
    }
    tgt.hipY += bob;
    // tatters trail behind (the "legs" are robe strips)
    tgt.lRx = tgt.lLx = 0.3 + Math.sin(t * 3.1) * 0.15; tgt.kR = tgt.kL = 0.3 + Math.sin(t * 3.7) * 0.2;
    dampPose(cur, tgt, lambda, dt);
    applyHumanoid(model, cur);
    model.rig.scale.set(1 + (1 - fade) * 0.4, Math.max(0.02, fade), 1 + (1 - fade) * 0.4);
    model.orb.scale.setScalar(st === 'cast' && !fired ? 0.6 + clamp(e.stateT / 0.9, 0, 1) * 1.1 : 0.6 + Math.sin(t * 4) * 0.08);
  };
  return e;
}
