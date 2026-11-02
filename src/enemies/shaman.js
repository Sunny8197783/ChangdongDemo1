// 보코 주술사 — ranged goblin caster. Keeps distance, casts homing elemental orbs, teleports away when crowded.
import * as THREE from 'three';
import { rand, clamp, pick, ELEMENT_COLORS } from '../core/utils.js';
import { buildShaman } from './models.js';
import { makeEnemy, faceTo, moveTo, newPose, dampPose, applyHumanoid, walkCycle } from './base.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const HIP = 0.66;
const BASE = newPose(HIP);

export function createShaman(ctx, pos, opts = {}) {
  const element = opts.element || pick(['fire', 'ice']);
  const model = buildShaman(element);
  model.lieY = 0.22;
  const e = makeEnemy(ctx, {
    kind: 'shaman', model, name: '보코 주술사', hp: 110, radius: 0.45, height: 1.5, mass: 0.8,
    camp: opts.camp, facing: opts.facing, staggerDmg: 26, sight: 24,
    resist: { [element]: 0.5 },
  }, pos);
  e.element = element;
  const game = ctx.game, col = ELEMENT_COLORS[element];
  const cur = newPose(HIP), tgt = newPose(HIP);
  let phase = 0, speed = 0, castCd = rand(1, 2.5), tpCd = 2, strafeDir = 1, strafeT = 0, castEmitter = null, fired = false;
  const tpTo = new THREE.Vector3();

  function stopCastFx() { castEmitter?.stop?.(); castEmitter = null; }

  function pickTeleport() {
    const p = e.object.position, pp = ctx.playerPos;
    for (let i = 0; i < 10; i++) {
      const away = Math.atan2(p.x - pp.x, p.z - pp.z) + rand(-1.3, 1.3);
      const r = rand(10, 14);
      const x = pp.x + Math.sin(away) * r, z = pp.z + Math.cos(away) * r;
      if (Math.hypot(x - e.home.x, z - e.home.z) > 26) continue;
      if (game.world.waterDepth?.(x, z) > 0.3) continue;
      tpTo.set(x, game.world.getHeight(x, z), z);
      const tmp = tpTo.clone(); game.world.resolveCollision?.(tmp, 0.6);
      tpTo.copy(tmp);
      return true;
    }
    tpTo.set(e.home.x + rand(-5, 5), 0, e.home.z + rand(-5, 5)); tpTo.y = game.world.getHeight(tpTo.x, tpTo.z);
    return true;
  }
  function smoke(at) {
    _v.copy(at); _v.y += 0.8;
    game.vfx.burst(_v, { count: 26, color: [0x5a2a8a, 0x2a1440], speed: 2.5, spread: 1, size: 0.7, sizeEnd: 1.4, life: 0.7, shape: 'smoke', drag: 2.5, additive: false });
    game.vfx.burst(_v, { count: 20, color: [0xd9a0ff, col], speed: 5, spread: 1, size: 0.14, sizeEnd: 0, life: 0.5, shape: 'spark', drag: 3 });
  }

  e.react = () => { if (e.state === 'cast') { stopCastFx(); } };
  e.die = () => { stopCastFx(); };

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    castCd -= dt; tpCd -= dt;
    if (e.state !== 'cast') stopCastFx();
    switch (e.state) {
      case 'idle':
        break;
      case 'alert':
        faceTo(e, pp.x, pp.z, 8, dt);
        if (e.stateT > 0.7) e.setState('kite');
        break;
      case 'kite': {
        if (!e.aggro) { e.setState('return'); break; }
        faceTo(e, pp.x, pp.z, 7, dt);
        if (d < 5 && tpCd <= 0) { e.setState('vanish'); smoke(p); ctx.audio('blink', { position: p, volume: 0.6, pitch: 0.8 }); break; }
        _v.set(pp.x - p.x, 0, pp.z - p.z).normalize();
        strafeT -= dt; if (strafeT <= 0) { strafeT = rand(1, 2.5); strafeDir = Math.random() < 0.5 ? -1 : 1; }
        let radial = 0;
        if (d < 10) radial = -2.6; else if (d > 17) radial = 2.4;
        e.move.set(-_v.z * strafeDir * 1.6 + _v.x * radial, 0, _v.x * strafeDir * 1.6 + _v.z * radial).multiplyScalar(sm);
        if (castCd <= 0 && d < 28) {
          e.setState('cast'); fired = false;
          game.events.emit('enemyAttack', { enemy: e, kind: 'cast' });
          castEmitter = game.vfx.emitter?.({ follow: model.gem, rate: 40, color: [col, 0xffffff], speed: 1.2, spread: 1, size: 0.12, sizeEnd: 0, life: 0.45, shape: 'spark', drag: 2, gravity: -1 });
          ctx.audio('charge', { position: p, volume: 0.35, pitch: 1.3 });
        }
        break;
      }
      case 'cast': {
        faceTo(e, pp.x, pp.z, 6, dt);
        if (!fired && e.stateT > 0.95 / Math.max(0.4, sm)) {
          fired = true; stopCastFx();
          model.gem.getWorldPosition(_v2);
          ctx.projectiles.orb(_v2, element, e);
          ctx.audio('cast_' + element, { position: p, volume: 0.6, pitch: 0.8 });
        }
        if (e.stateT > 1.35) { castCd = rand(2.6, 3.8); e.setState('kite'); }
        break;
      }
      case 'vanish':
        if (e.stateT > 0.32) {
          pickTeleport();
          p.copy(tpTo); e.velocity.set(0, 0, 0);
          smoke(p);
          e.setState('appear'); tpCd = rand(4.5, 6.5);
        }
        break;
      case 'appear':
        faceTo(e, pp.x, pp.z, 10, dt);
        if (e.stateT > 0.35) { castCd = Math.min(castCd, 0.6); e.setState('kite'); }
        break;
      case 'stagger':
        if (e.stateT > e.staggerDur) e.setState(e.aggro ? 'kite' : 'idle');
        break;
      case 'return':
        faceTo(e, e.home.x, e.home.z, 5, dt);
        if (moveTo(e, e.home.x, e.home.z, 2.6 * sm, 0.8) < 1) { e.setState('idle'); }
        break;
    }
    speed = Math.hypot(e.move.x, e.move.z);
  };

  e.pose = (dt, sm, stunned) => {
    Object.assign(tgt, BASE);
    const t = game.time * 1 + e.id.length * 0.7;
    let lambda = 10;
    phase += dt * (1 + speed * 2.6);
    const st = e.state;
    let scale = 1, gemGlow = 1;
    if (st === 'dead') {
      tgt.aRz = -1.3; tgt.aLz = 1.3; tgt.headX = -0.5; tgt.lRx = -0.5; tgt.kR = 0.4; lambda = 8;
    } else if (stunned) {
      tgt.headY = Math.sin(t * 5) * 0.4; tgt.headZ = Math.cos(t * 5) * 0.3; tgt.roll = Math.sin(t * 2.5) * 0.12; tgt.pitch = 0.2;
      tgt.aRx = -0.3; tgt.aLz = 0.4;
    } else if (st === 'cast') {
      const k = clamp(e.stateT / 0.5, 0, 1);
      if (!fired) {
        tgt.aRx = -2.9 * k; tgt.aRz = -0.25; tgt.fRx = -0.2; tgt.aLx = -1.4 * k; tgt.aLz = 0.6; tgt.fLx = -0.9;
        tgt.pitch = -0.2 * k; tgt.headX = -0.25 * k; tgt.spineY = 0.2;
        gemGlow = 1 + k * 2.5 + Math.sin(t * 30) * 0.4 * k;
        tgt.hipY = HIP + Math.sin(e.stateT * 6) * 0.03;
      } else {
        tgt.aRx = -1.4; tgt.fRx = -0.1; tgt.aLx = -0.3; tgt.pitch = 0.35; tgt.spineX = 0.2; tgt.spineY = -0.3; lambda = 22;
      }
    } else if (st === 'vanish') {
      scale = Math.max(0.01, 1 - e.stateT / 0.32); tgt.aRx = -2.5; tgt.aLx = -2.5; tgt.aLz = 0.8; tgt.aRz = -0.8;
    } else if (st === 'appear') {
      scale = Math.min(1, 0.05 + e.stateT / 0.3); tgt.aRx = -1.5; tgt.aLz = 1.2;
    } else if (st === 'stagger') {
      const k = Math.sin(clamp(e.stateT / e.staggerDur, 0, 1) * Math.PI);
      tgt.pitch = -0.5 * k; tgt.headX = -0.6 * k; tgt.aRz = -1.0 * k; tgt.aLz = 1.1 * k; tgt.aLx = -1 * k; tgt.hipZ = -0.12 * k; lambda = 16;
    } else if (st === 'alert') {
      tgt.aLx = -1.6; tgt.aLz = 0.5; tgt.aRx = -1.2; tgt.headX = -0.2; tgt.pitch = -0.1; lambda = 14;
    } else {
      const amt = clamp(speed / 2.4, 0, 1);
      if (amt > 0.05) walkCycle(tgt, phase, amt * 0.7, 0);
      tgt.aRx = -0.45 + Math.sin(t * 1.7) * 0.05; tgt.fRx = -0.6; tgt.aRz = -0.15;
      tgt.aLx = -0.2 + Math.sin(t * 1.3) * 0.08; tgt.aLz = 0.25; tgt.fLx = -0.5;
      tgt.hipY += Math.sin(t * 2.2) * 0.02;
      tgt.headY = e.aggro ? 0 : Math.sin(t * 0.4) * 0.5;
      if (e.aggro) tgt.pitch += 0.1;
    }
    dampPose(cur, tgt, lambda, dt);
    applyHumanoid(model, cur);
    model.rig.scale.set(1 + (1 - scale) * 0.6, scale, 1 + (1 - scale) * 0.6);
    model.gem.rotation.y += dt * 2.5;
    model.gem.position.y = 1.55 + Math.sin(t * 3) * 0.03;
    const gs = 0.7 * gemGlow; model.halo.scale.set(gs, gs, 1);
    model.gemMat.emissiveIntensity = 1.2 + gemGlow * 0.6;
  };
  return e;
}
