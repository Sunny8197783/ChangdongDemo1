// 수렁도마뱀 (lizard) — Mirwen spear-lizard. Wades through the lake (amphibious), lurks half-submerged, telegraphed spear
// thrust (line decal = hitbox), and a lunge out of the water. Resists water ×0.5. CONTRACT §14.
import * as THREE from 'three';
import { rand, clamp } from '../core/utils.js';
import { buildLizard } from './models2.js';
import { makeEnemy, faceTo, moveTo, moveForward, angleToPlayer, newPose, dampPose, applyHumanoid, walkCycle, reactionPose } from './base.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const HIP = 0.86;
const BASE = newPose(HIP);
const THRUST_LEN = 3.6, THRUST_W = 1.2;

export function createLizard(ctx, pos, opts = {}) {
  const model = buildLizard();
  model.lieY = 0.3;
  const e = makeEnemy(ctx, {
    kind: 'lizard', model, name: '수렁도마뱀', hp: 160, radius: 0.55, height: 1.9, mass: 1.15,
    camp: opts.camp, facing: opts.facing, staggerDmg: 36, sight: 22, poiseMax: 0, resist: { water: 0.5 },
  }, pos);
  e.amphibious = true;
  e.element = 'water';
  const game = ctx.game, W = game.world;
  const cur = newPose(HIP), tgt = newPose(HIP);
  let phase = rand(0, 6), speed = 0, attackCd = rand(0.8, 1.6), lungeCd = rand(2, 4), strafeDir = 1, hitDone = false, tele = null;
  let wanderT = rand(2, 5), wander = null, submerge = 0, splashT = 0;
  const wet = () => (W.waterDepth ? W.waterDepth(e.object.position.x, e.object.position.z) : 0);
  const attack = (kind) => game.events.emit('enemyAttack', { enemy: e, kind });
  const stopTele = () => { tele?.stop?.(); tele = null; };
  e.interrupt = () => { hitDone = true; stopTele(); };
  e.onResume = () => { attackCd = Math.max(attackCd, 0.6); };
  e.armor = () => e.state === 'thrust' || e.state === 'lunge';
  e.die = () => stopTele();

  function splash(s = 1) {
    const p = e.object.position;
    _v.set(p.x, (W.waterLevel ?? 1.5) + 0.05, p.z);
    game.vfx.burst(_v, { count: Math.round(16 * s), color: [0xd8f4ff, 0x6fc8ff], speed: 4 * s, spread: 0.5, dir: _d.set(0, 1, 0), size: 0.18, sizeEnd: 0.04, life: 0.6, gravity: 12, shape: 'droplet' });
    game.vfx.shockwave?.(_v, { color: 0xbfe8ff, radius: 1.8 * s, duration: 0.45, opacity: 0.6 });
    ctx.audio('splash', { position: _v, volume: 0.45 * s });
  }

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    attackCd -= dt; lungeCd -= dt;
    const depth = wet();
    submerge = clamp(submerge + ((e.state === 'idle' && depth > 0.5) ? dt : -dt * 3), 0, 1);
    switch (e.state) {
      case 'idle':
        wanderT -= dt;
        if (wanderT <= 0) { wanderT = rand(3, 6); wander = wander ? null : _v.set(e.home.x + rand(-5, 5), 0, e.home.z + rand(-5, 5)).clone(); }
        if (wander) { faceTo(e, wander.x, wander.z, 3, dt); if (moveTo(e, wander.x, wander.z, 1.3 * sm, 0.6) < 0.7) wander = null; }
        if (depth > 0.5) { splashT -= dt; if (splashT <= 0) { splashT = rand(1.5, 3); game.vfx.burst(_v.set(p.x, (W.waterLevel ?? 1.5) + 0.05, p.z), { count: 3, color: [0xffffff, 0x9fdfff], speed: 0.6, spread: 0.4, dir: _d.set(0, 1, 0), size: 0.14, sizeEnd: 0.3, life: 0.8, shape: 'bubble' }); } }
        break;
      case 'alert':
        faceTo(e, pp.x, pp.z, 8, dt);
        if (e.stateT < 0.02 && depth > 0.4) splash(0.8);
        if (e.stateT > 0.6) e.setState('chase');
        break;
      case 'chase': {
        if (!e.aggro) { e.setState('return'); break; }
        faceTo(e, pp.x, pp.z, 6.5, dt);
        if (d > 2.6) moveForward(e, (d > 7 ? 4.6 : 3.4) * sm * (depth > 0.6 ? 0.8 : 1));
        if (d < 3.3 && attackCd <= 0 && angleToPlayer(ctx, e) < 0.5) {
          if (ctx.takeToken(e)) {
            e.setState('thrustWind'); attack('thrust');
            _d.set(Math.sin(e.facing), 0, Math.cos(e.facing));
            tele = ctx.tele({ shape: 'line', pos: p, dir: _d, len: THRUST_LEN, width: THRUST_W, dur: 0.62, color: 'damage' });
          } else { strafeDir = Math.random() < 0.5 ? 1 : -1; e.setState('strafe'); }
        } else if (d > 5.5 && d < 11 && lungeCd <= 0 && attackCd <= 0) {
          if (ctx.takeToken(e)) { e.setState('lungePrep'); attack('lunge'); }
        }
        break;
      }
      case 'strafe':
        faceTo(e, pp.x, pp.z, 8, dt);
        _v.set(pp.x - p.x, 0, pp.z - p.z).normalize();
        e.move.set(-_v.z * strafeDir * 2.1 + _v.x * clamp((d - 4.5) * 0.8, -1.5, 1.5), 0, _v.x * strafeDir * 2.1 + _v.z * clamp((d - 4.5) * 0.8, -1.5, 1.5)).multiplyScalar(sm);
        if (e.stateT > 1.4 || (attackCd <= 0 && e.stateT > 0.5)) e.setState('chase');
        break;
      case 'thrustWind':
        // the decal follows the spear line; aim is committed for the last 0.2 s
        if (e.stateT < 0.42) { faceTo(e, pp.x, pp.z, 5, dt); _d.set(Math.sin(e.facing), 0, Math.cos(e.facing)); tele?.setDir?.(_d); tele?.setPos?.(p); }
        if (e.stateT > 0.62 / Math.max(0.5, sm)) { e.setState('thrust'); hitDone = false; ctx.audio('blink', { position: p, volume: 0.35, pitch: 0.7 }); }
        break;
      case 'thrust':
        if (e.stateT < 0.12) moveForward(e, 5.5 * sm);
        if (!hitDone && e.stateT > 0.04 && e.stateT < 0.2 && ctx.meleeCheck(e, THRUST_LEN, 0.34)) {
          hitDone = true; ctx.hitPlayer(e, { amount: 15, knockback: 7, element: 'physical' });
        }
        if (e.stateT > 0.42) { e.setState('recover'); stopTele(); }
        break;
      case 'lungePrep':
        faceTo(e, pp.x, pp.z, 7, dt);
        if (e.stateT > 0.5 / Math.max(0.5, sm)) {
          const T = 0.6;
          _v.set(pp.x - p.x, 0, pp.z - p.z); const len = Math.max(0.5, _v.length() - 1.2); _v.normalize();
          e.velocity.set(_v.x * len / T, 22 * T / 2, _v.z * len / T);
          e.grounded = false; e.leaping = true; hitDone = false;
          tele = ctx.tele({ shape: 'circle', pos: _d.set(p.x + _v.x * len, 0, p.z + _v.z * len).setY(ctx.groundH(p.x + _v.x * len, p.z + _v.z * len)), r: 1.6, dur: T, color: 'damage' });
          if (depth > 0.3) splash(1.2);
          e.setState('lunge');
          ctx.audio('jump', { position: p, volume: 0.5, pitch: 0.8 });
        }
        break;
      case 'lunge':
        if (!hitDone && d < e.radius + 1.1 && Math.abs(pp.y - p.y) < 1.6) { hitDone = true; ctx.hitPlayer(e, { amount: 18, knockback: 10, launch: 3 }); }
        if (e.grounded && e.stateT > 0.1) {
          e.leaping = false; stopTele(); ctx.dust(p, 0.8); if (wet() > 0.3) splash(1);
          lungeCd = rand(5, 8); e.setState('recover');
        }
        break;
      case 'recover':
        if (e.stateT > 0.6) { ctx.releaseToken(e); attackCd = rand(1.0, 2.0); e.setState('chase'); }
        break;
      case 'return':
        faceTo(e, e.home.x, e.home.z, 5, dt);
        if (moveTo(e, e.home.x, e.home.z, 3 * sm, 0.8) < 1) e.setState('idle');
        break;
    }
    speed = Math.hypot(e.move.x, e.move.z);
  };

  e.pose = (dt, sm, stunned) => {
    Object.assign(tgt, BASE);
    const t = game.time + e.id.length;
    let lambda = 12, rl = 0;
    phase += dt * (1.2 + speed * 2.2);
    const st = e.state;
    if (st === 'dead') { tgt.aRz = -1.3; tgt.aLz = 1.3; tgt.headX = -0.4; tgt.lRx = -0.5; tgt.kR = 0.4; lambda = 8; }
    else if ((rl = reactionPose(e, tgt, HIP, t, model.lieY))) lambda = rl;
    else if (stunned) { tgt.headY = Math.sin(t * 5) * 0.4; tgt.roll = Math.sin(t * 2.5) * 0.12; tgt.pitch = 0.25; tgt.kR = tgt.kL = 0.4; tgt.hipY = HIP - 0.1; }
    else if (st === 'thrustWind') {
      const k = clamp(e.stateT / 0.4, 0, 1);
      tgt.aRx = -1.4 * k - 0.2; tgt.fRx = -1.6 * k; tgt.aRz = -0.25; tgt.spineY = 0.6 * k; tgt.pitch = -0.12 * k;
      tgt.aLx = -1.2; tgt.aLz = 0.5; tgt.fLx = -0.8; tgt.lRx = 0.5; tgt.lLx = -0.55; tgt.kL = 0.6; tgt.kR = 0.25; tgt.hipY = HIP - 0.12 * k;
      tgt.roll = Math.sin(t * 55) * 0.02 * k; lambda = 13;
    } else if (st === 'thrust') {
      tgt.aRx = -1.55; tgt.fRx = 0; tgt.aRz = -0.05; tgt.spineY = -0.45; tgt.pitch = 0.4; tgt.aLx = 0.4;
      tgt.lRx = -0.4; tgt.lLx = 0.7; tgt.kR = 0.6; tgt.kL = 0.1; tgt.hipY = HIP - 0.16; lambda = 32;
    } else if (st === 'recover') { tgt.aRx = -1.0; tgt.fRx = -0.4; tgt.pitch = 0.2; tgt.lLx = 0.3; tgt.kL = 0.3; lambda = 7; }
    else if (st === 'lungePrep') {
      tgt.hipY = HIP - 0.35; tgt.pitch = 0.6; tgt.lRx = tgt.lLx = -1.1; tgt.kR = tgt.kL = 1.5; tgt.aRx = -1.2; tgt.fRx = -1.2; tgt.aLx = -0.6;
      tgt.roll = Math.sin(t * 45) * 0.03; lambda = 10;
    } else if (st === 'lunge') { tgt.aRx = -1.5; tgt.fRx = -0.1; tgt.pitch = 0.75; tgt.lRx = 0.6; tgt.lLx = 0.6; tgt.kR = tgt.kL = 0.3; lambda = 16; }
    else if (st === 'alert') { tgt.aRx = -1.7; tgt.fRx = -0.8; tgt.aLx = -1.0; tgt.aLz = 0.6; tgt.headX = -0.35; tgt.pitch = -0.15; lambda = 15; }
    else {
      const amt = clamp(speed / 3, 0, 1.2);
      if (amt > 0.05) walkCycle(tgt, phase, amt, clamp((speed - 3) / 2, 0, 1));
      else { tgt.spineX = Math.sin(t * 2) * 0.03; tgt.aRx = -0.5; tgt.fRx = -0.9; tgt.aLx = -0.15; tgt.aLz = 0.2; tgt.kR = tgt.kL = 0.18; tgt.headY = e.aggro ? 0 : Math.sin(t * 0.4) * 0.6; }
      tgt.pitch += 0.12;   // lizards lean forward
      if (st === 'strafe') { tgt.aRx = -1.1; tgt.fRx = -1.2; tgt.hipY -= 0.1; }
    }
    // half-submerged lurk: sink the rig, head up
    if (submerge > 0) { tgt.hipY -= submerge * 0.7; tgt.pitch -= submerge * 0.2; tgt.headX -= submerge * 0.3; }
    dampPose(cur, tgt, lambda, dt);
    applyHumanoid(model, cur);
    // tail sway (counter to the stride) + droop when hurt
    const sway = Math.sin(phase * 0.5) * (0.25 + speed * 0.05);
    model.tail1.rotation.set(-0.25 + (e.hurt * 0.3), sway, 0);
    model.tail2.rotation.set(0.2, sway * 1.4 + Math.sin(t * 3) * 0.1, 0);
  };
  return e;
}
