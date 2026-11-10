// 포자 버섯병 (shroom) — Elderwood mushroom soldier. Slow waddle, lobs spore sacs that burst into lingering spore clouds
// (seeded on the player = poison), cap puff when hit, spore burst on death. CONTRACT §14.
import * as THREE from 'three';
import { rand, clamp } from '../core/utils.js';
import { buildShroom } from './models2.js';
import { makeEnemy, faceTo, moveTo, newPose, dampPose, applyHumanoid, walkCycle, reactionPose,
  modelFor, beginAttack, liveAttack, attackPhase, windupK, punishAfter, rhythmDamp } from './base.js';
import { typeName } from './codex.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const HIP = 0.42;
const BASE = newPose(HIP);

export function createShroom(ctx, pos, opts = {}) {
  const model = modelFor(ctx, 'shroom', {}, buildShroom);
  model.lieY = 0.25;
  const e = makeEnemy(ctx, {
    kind: 'shroom', model, name: typeName('shroom'), hp: 120, radius: 0.55, height: 1.4, mass: 0.9,
    camp: opts.camp, facing: opts.facing, staggerDmg: 30, sight: 20, chaseState: 'kite', resist: { nature: 0.5, fire: 1.3 },
  }, pos);
  e.element = 'nature';
  const game = ctx.game;
  const cur = newPose(HIP), tgt = newPose(HIP);
  let phase = rand(0, 6), speed = 0, lobCd = rand(1.2, 2.4), fired = false, puff = 0, strafeDir = 1, strafeT = 0;
  const lobTo = new THREE.Vector3();
  let H = null, recoverDur = 1.0;
  const lobShape = { kind: 'circle', r: 2.2, pos: lobTo };
  const FLIGHT = 1.0;
  function aimLob() {
    const pp = ctx.playerPos, pv = ctx.target?.velocity;
    lobTo.set(pp.x + (pv ? pv.x * 0.35 : 0), 0, pp.z + (pv ? pv.z * 0.35 : 0));
    lobTo.y = ctx.groundH(lobTo.x, lobTo.z);
  }
  function startLob(force) {
    if (!force && !ctx.takeRangedToken(e)) return false;
    aimLob();
    H = beginAttack(ctx, e, 'shroom.lob', lobShape);     // landing circle visible from windup start through the flight
    if (!H) { ctx.releaseRangedToken(e); return false; }
    e.setState('lob'); fired = false;
    ctx.audio('charge', { position: e.object.position, volume: 0.3, pitch: 0.6 });
    return true;
  }
  e.attackStarters['shroom.lob'] = startLob;

  function sporePuff(s = 1) {
    model.neck.getWorldPosition(_v); _v.y += 0.25;
    game.vfx.burst(_v, { owner: 'enemy', count: Math.round(12 * s), color: [0xd8ff6a, 0x8fe05a], speed: 2.2 * s, spread: 1, size: 0.4, sizeEnd: 1.1, life: 1.1, shape: 'smoke', additive: false, drag: 2.5, gravity: -0.6 });
    game.vfx.burst(_v, { owner: 'enemy', count: Math.round(8 * s), color: [0xf3ecdf, 0xe8ff9a], speed: 1.5, spread: 1, size: 0.1, sizeEnd: 0, life: 1.2, shape: 'spark', gravity: -1 });
  }
  e.react = (result) => { puff = 1; if ((result?.damage || 0) > 8) sporePuff(0.5); };
  e.interrupt = () => { fired = true; H = null; ctx.releaseRangedToken(e); };
  e.onResume = () => { lobCd = Math.max(lobCd, 0.8); };
  e.die = () => {
    sporePuff(1.6);
    ctx.releaseRangedToken(e);
    // §4.5: 0.6 s swelling tell, then the last spore cloud (tells.hazard r 2.4, 3.5 s) where it falls
    const dh = beginAttack(ctx, e, 'shroom.deathCloud', { kind: 'circle', r: 2.4, pos: e.object.position.clone() }, { sound: false });
    ctx.projectiles.cloud?.(e.object.position, e, { r: 2.4, life: 3.5, delay: dh ? dh.dur : 0.6, tell: dh, attackId: 'shroom.deathCloud' });
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
        if (lobCd <= 0 && d < 20 && !startLob(false)) lobCd = 0.6;
        break;
      }
      case 'lob':
        if (!H || (!H.alive && !H.struck)) { H = null; ctx.releaseRangedToken(e); e.setState('kite'); break; }
        if (!H.locked) { faceTo(e, pp.x, pp.z, 5, dt); aimLob(); H.setPos(lobTo); }
        else if (!fired) {
          // release at the lock: the sac flies for the rest of the tell and bursts on the drawn circle
          fired = true;
          model.sac.getWorldPosition(_v);
          ctx.projectiles.spore?.(_v, lobTo, e, { flight: Math.max(0.3, H.remaining), noTele: true, attackId: 'shroom.lob' });
          sporePuff(0.5);
          ctx.audio('throw', { position: p, volume: 0.4, pitch: 1.2 });
          recoverDur = punishAfter(ctx, e, 'shroom.lob') || 1.0;    // cap droop
          ctx.releaseRangedToken(e);
          e.setState('lobRecover');
        }
        break;
      case 'lobRecover':
        if (H && H.consumeStrike()) H = null;
        if (e.stateT > recoverDur && !(H && H.alive)) { H = null; lobCd = rand(2.8, 4.2); e.setState('kite'); }
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
    const AH = liveAttack(e), off = AH ? AH.lockAt : 0, ph = st0(AH) ? attackPhase(AH, off) : -1, holding = ph === 1;
    const t = game.time + e.id.length;
    let lambda = 10, rl = 0;
    phase += dt * (1.6 + speed * 3.2);
    puff = Math.max(0, puff - dt * 3);
    const st = e.state;
    if (st === 'dead') { tgt.pitch = -0.4; tgt.headX = 0.4; lambda = 8; }
    else if ((rl = reactionPose(e, tgt, HIP, t, model.lieY))) lambda = rl;
    else if (stunned) { tgt.roll = Math.sin(t * 3) * 0.18; tgt.headZ = Math.sin(t * 4) * 0.3; }
    else if (st === 'lobRecover') { tgt.pitch = 0.55; tgt.headX = 0.7; tgt.aRx = -0.5; tgt.aLx = -0.5; tgt.aRz = -0.15; tgt.aLz = 0.15; tgt.hipY = HIP - 0.06; lambda = 9; }   // cap droop
    else if (st === 'lob') {
      const k = windupK(AH, off);
      if (!fired && ph === 2) { tgt.pitch = 0.35; tgt.headX = 0.45; tgt.aRx = -0.9; tgt.aLx = -0.9; lambda = 40; }
      else if (!fired) { tgt.pitch = -0.35 * k; tgt.headX = -0.5 * k; tgt.aRx = -2.6 * k; tgt.aLx = -2.6 * k; tgt.hipY = HIP - 0.1 * k; tgt.kR = tgt.kL = 0.5 * k; }
      else { tgt.pitch = 0.4; tgt.headX = 0.5; tgt.aRx = -0.8; tgt.aLx = -0.8; lambda = 20; }
    } else {
      const amt = clamp(speed / 1.4, 0, 1);
      if (amt > 0.05) { walkCycle(tgt, phase, amt * 0.9, 0); tgt.roll = Math.sin(phase) * 0.14 * amt; }   // waddle
      tgt.aRz = -0.35; tgt.aLz = 0.35; tgt.aRx = -0.2 + Math.sin(t * 1.4) * 0.1; tgt.aLx = -0.2 + Math.cos(t * 1.3) * 0.1;
      tgt.hipY += Math.sin(t * 2.1) * 0.015;
      tgt.headY = e.aggro ? 0 : Math.sin(t * 0.5) * 0.4;
    }
    rhythmDamp(cur, tgt, lambda, dt, holding);
    applyHumanoid(model, cur);
    if (holding) return;
    // cap jiggle (secondary motion) + sac breathing
    const j = Math.sin(t * 9) * 0.04 * (puff + speed * 0.1);
    model.neck.scale.set(1 + puff * 0.12 + j, 1 - puff * 0.1, 1 + puff * 0.12 - j);
    const b = 1 + Math.sin(t * 2.4) * 0.06 + (st === 'lob' && !fired ? windupK(AH, off) * 0.4 : 0);
    model.sac.scale.setScalar(b);
  };
  return e;
}
const st0 = (h) => !!(h && h.id === 'shroom.lob');
