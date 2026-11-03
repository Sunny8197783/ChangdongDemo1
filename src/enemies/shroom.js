// 포자 버섯병 (shroom) — Elderwood mushroom soldier. Slow waddle, lobs spore sacs that burst into lingering spore clouds
// (seeded on the player = poison), cap puff when hit, spore burst on death. CONTRACT §14.
import * as THREE from 'three';
import { rand, clamp } from '../core/utils.js';
import { buildShroom } from './models2.js';
import { makeEnemy, faceTo, moveTo, newPose, dampPose, applyHumanoid, walkCycle, reactionPose } from './base.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const HIP = 0.42;
const BASE = newPose(HIP);

export function createShroom(ctx, pos, opts = {}) {
  const model = buildShroom();
  model.lieY = 0.25;
  const e = makeEnemy(ctx, {
    kind: 'shroom', model, name: '포자 버섯병', hp: 120, radius: 0.55, height: 1.4, mass: 0.9,
    camp: opts.camp, facing: opts.facing, staggerDmg: 30, sight: 20, chaseState: 'kite', resist: { nature: 0.5, fire: 1.3 },
  }, pos);
  e.element = 'nature';
  const game = ctx.game;
  const cur = newPose(HIP), tgt = newPose(HIP);
  let phase = rand(0, 6), speed = 0, lobCd = rand(1.2, 2.4), fired = false, puff = 0, strafeDir = 1, strafeT = 0;
  const lobTo = new THREE.Vector3();

  function sporePuff(s = 1) {
    model.neck.getWorldPosition(_v); _v.y += 0.25;
    game.vfx.burst(_v, { count: Math.round(12 * s), color: [0xd8ff6a, 0x8fe05a], speed: 2.2 * s, spread: 1, size: 0.4, sizeEnd: 1.1, life: 1.1, shape: 'smoke', additive: false, drag: 2.5, gravity: -0.6 });
    game.vfx.burst(_v, { count: Math.round(8 * s), color: [0xffffff, 0xe8ff9a], speed: 1.5, spread: 1, size: 0.1, sizeEnd: 0, life: 1.2, shape: 'spark', gravity: -1 });
  }
  e.react = (result) => { puff = 1; if ((result?.damage || 0) > 8) sporePuff(0.5); };
  e.interrupt = () => { fired = true; };
  e.onResume = () => { lobCd = Math.max(lobCd, 0.8); };
  e.die = () => {
    sporePuff(1.6);
    // a last spore cloud where it falls
    ctx.projectiles.cloud?.(e.object.position, e, { r: 2.4, life: 3.5 });
  };

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    lobCd -= dt;
    switch (e.state) {
      case 'idle': break;
      case 'alert':
        faceTo(e, pp.x, pp.z, 6, dt);
        if (e.stateT < 0.02) sporePuff(0.6);
        if (e.stateT > 0.8) e.setState('kite');
        break;
      case 'kite': {
        if (!e.aggro) { e.setState('return'); break; }
        faceTo(e, pp.x, pp.z, 4, dt);
        _v.set(pp.x - p.x, 0, pp.z - p.z).normalize();
        strafeT -= dt; if (strafeT <= 0) { strafeT = rand(1.5, 3); strafeDir = Math.random() < 0.5 ? -1 : 1; }
        const radial = d < 7 ? -1.4 : d > 13 ? 1.4 : 0;
        e.move.set(-_v.z * strafeDir * 0.8 + _v.x * radial, 0, _v.x * strafeDir * 0.8 + _v.z * radial).multiplyScalar(sm);
        if (lobCd <= 0 && d < 20) { e.setState('lob'); fired = false; game.events.emit('enemyAttack', { enemy: e, kind: 'lob' }); ctx.audio('charge', { position: p, volume: 0.3, pitch: 0.6 }); }
        break;
      }
      case 'lob':
        faceTo(e, pp.x, pp.z, 5, dt);
        if (!fired && e.stateT > 0.75 / Math.max(0.4, sm)) {
          fired = true;
          // lead the target a little
          const pv = ctx.target?.velocity;
          lobTo.set(pp.x + (pv ? pv.x * 0.5 : 0), 0, pp.z + (pv ? pv.z * 0.5 : 0));
          lobTo.y = ctx.groundH(lobTo.x, lobTo.z);
          model.sac.getWorldPosition(_v);
          ctx.projectiles.spore?.(_v, lobTo, e, { flight: 1.0 });
          sporePuff(0.5);
          ctx.audio('throw', { position: p, volume: 0.4, pitch: 1.2 });
        }
        if (e.stateT > 1.25) { lobCd = rand(2.8, 4.2); e.setState('kite'); }
        break;
      case 'return':
        faceTo(e, e.home.x, e.home.z, 4, dt);
        if (moveTo(e, e.home.x, e.home.z, 1.6 * sm, 0.8) < 1) e.setState('idle');
        break;
    }
    speed = Math.hypot(e.move.x, e.move.z);
  };

  e.pose = (dt, sm, stunned) => {
    Object.assign(tgt, BASE);
    const t = game.time + e.id.length;
    let lambda = 10, rl = 0;
    phase += dt * (1.6 + speed * 3.2);
    puff = Math.max(0, puff - dt * 3);
    const st = e.state;
    if (st === 'dead') { tgt.pitch = -0.4; tgt.headX = 0.4; lambda = 8; }
    else if ((rl = reactionPose(e, tgt, HIP, t, model.lieY))) lambda = rl;
    else if (stunned) { tgt.roll = Math.sin(t * 3) * 0.18; tgt.headZ = Math.sin(t * 4) * 0.3; }
    else if (st === 'lob') {
      const k = clamp(e.stateT / 0.7, 0, 1);
      if (!fired) { tgt.pitch = -0.35 * k; tgt.headX = -0.5 * k; tgt.aRx = -2.6 * k; tgt.aLx = -2.6 * k; tgt.hipY = HIP - 0.1 * k; tgt.kR = tgt.kL = 0.5 * k; }
      else { tgt.pitch = 0.4; tgt.headX = 0.5; tgt.aRx = -0.8; tgt.aLx = -0.8; lambda = 20; }
    } else {
      const amt = clamp(speed / 1.4, 0, 1);
      if (amt > 0.05) { walkCycle(tgt, phase, amt * 0.9, 0); tgt.roll = Math.sin(phase) * 0.14 * amt; }   // waddle
      tgt.aRz = -0.35; tgt.aLz = 0.35; tgt.aRx = -0.2 + Math.sin(t * 1.4) * 0.1; tgt.aLx = -0.2 + Math.cos(t * 1.3) * 0.1;
      tgt.hipY += Math.sin(t * 2.1) * 0.015;
      tgt.headY = e.aggro ? 0 : Math.sin(t * 0.5) * 0.4;
    }
    dampPose(cur, tgt, lambda, dt);
    applyHumanoid(model, cur);
    // cap jiggle (secondary motion) + sac breathing
    const j = Math.sin(t * 9) * 0.04 * (puff + speed * 0.1);
    model.neck.scale.set(1 + puff * 0.12 + j, 1 - puff * 0.1, 1 + puff * 0.12 - j);
    const b = 1 + Math.sin(t * 2.4) * 0.06 + (st === 'lob' && !fired ? clamp(e.stateT / 0.75, 0, 1) * 0.4 : 0);
    model.sac.scale.setScalar(b);
  };
  return e;
}
