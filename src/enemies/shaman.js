// 도깨비 주술사 (id shaman) — ranged goblin caster. Keeps distance, casts homing elemental orbs, teleports away when crowded.
import * as THREE from 'three';
import { rand, clamp, pick, ELEMENT_COLORS } from '../core/utils.js';
import { buildShaman } from './models.js';
import { makeEnemy, faceTo, moveTo, newPose, dampPose, applyHumanoid, walkCycle, reactionPose,
  modelFor, beginAttack, liveAttack, attackPhase, windupK, attackMeta, rhythmDamp, copyPose } from './base.js';
import { typeName } from './codex.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _dir = new THREE.Vector3();
const M_ORB = attackMeta('shaman.orb');
const BLINK_CD = 8, SHIMMER = 0.4, DAZE = 1.5;
const HIP = 0.66;
const BASE = newPose(HIP);

export function createShaman(ctx, pos, opts = {}) {
  const element = opts.element || pick(['fire', 'ice']);
  const model = modelFor(ctx, 'shaman', { element, variant: element }, () => buildShaman(element));
  model.lieY = 0.22;
  const e = makeEnemy(ctx, {
    kind: 'shaman', model, name: typeName('shaman'), hp: 110, radius: 0.45, height: 1.5, mass: 0.8,
    camp: opts.camp, facing: opts.facing, staggerDmg: 26, sight: 24, chaseState: 'kite',
    resist: { [element]: 0.5 },
  }, pos);
  e.element = element;
  const game = ctx.game, col = ELEMENT_COLORS[element];
  const cur = newPose(HIP), tgt = newPose(HIP);
  let phase = 0, speed = 0, castCd = rand(1, 2.5), tpCd = 2, strafeDir = 1, strafeT = 0, castEmitter = null, fired = false, H = null, dazePending = false;
  const aimShape = { kind: 'line', len: 6, width: 0.35, dir: _dir, follow: true };
  const faceDir = () => _dir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
  function startCast(force) {
    if (!force && !ctx.takeRangedToken(e)) return false;
    faceDir();
    H = beginAttack(ctx, e, 'shaman.orb', aimShape);
    if (!H) { ctx.releaseRangedToken(e); return false; }
    e.setState('cast'); fired = false;
    castEmitter = game.vfx.emitter?.({ owner: 'enemy', follow: model.gem, rate: 14, color: [col, 0x3a2a4a], speed: 0.8, spread: 1, size: 0.1, sizeEnd: 0, life: 0.4, shape: 'spark', drag: 2, gravity: -1 });
    ctx.audio('charge', { position: e.object.position, volume: 0.35, pitch: 1.3 });
    return true;
  }
  e.attackStarters['shaman.orb'] = startCast;
  const tpTo = new THREE.Vector3();

  function stopCastFx() { castEmitter?.stop?.(); castEmitter = null; }

  function pickTeleport() {
    const p = e.object.position, pp = ctx.playerPos;
    for (let i = 0; i < 10; i++) {
      const away = Math.atan2(p.x - pp.x, p.z - pp.z) + rand(-1.3, 1.3);
      const r = rand(10, 14);
      const x = pp.x + Math.sin(away) * r, z = pp.z + Math.cos(away) * r;
      if (Math.sqrt((x - e.home.x) * (x - e.home.x) + (z - e.home.z) * (z - e.home.z)) > 26) continue;
      if (ctx.village && Math.sqrt((x - ctx.village.center.x) * (x - ctx.village.center.x) + (z - ctx.village.center.z) * (z - ctx.village.center.z)) < ctx.village.radius + 3) continue;
      if (game.world.waterDepth?.(x, z) > 0.3) continue;
      tpTo.set(x, ctx.groundH(x, z), z);
      const tmp = tpTo.clone(); game.world.resolveCollision?.(tmp, 0.6);
      tpTo.copy(tmp);
      return true;
    }
    tpTo.set(e.home.x + rand(-5, 5), 0, e.home.z + rand(-5, 5)); tpTo.y = ctx.groundH(tpTo.x, tpTo.z);
    return true;
  }
  /** Arrival shimmer (enemy style, small): the blink destination reads before the caster appears. */
  function shimmer(at) {
    _v.copy(at); _v.y += 0.6;
    game.vfx.burst(_v, { owner: 'enemy', count: 8, color: [0x9a6ad0, 0x2a1440], speed: 0.6, spread: 1, size: 0.5, sizeEnd: 0.9, life: SHIMMER + 0.2, shape: 'smoke', drag: 2, additive: false });
    game.vfx.burst(_v, { owner: 'enemy', count: 6, color: [col, 0x5a3a7a], speed: 0.8, spread: 1, size: 0.1, sizeEnd: 0, life: SHIMMER, shape: 'spark', drag: 2, gravity: -1.5 });
  }
  function smoke(at) {
    _v.copy(at); _v.y += 0.8;
    game.vfx.burst(_v, { owner: 'enemy', count: 26, color: [0x5a2a8a, 0x2a1440], speed: 2.5, spread: 1, size: 0.7, sizeEnd: 1.4, life: 0.7, shape: 'smoke', drag: 2.5, additive: false });
    game.vfx.burst(_v, { owner: 'enemy', count: 20, color: [0xd9a0ff, col], speed: 5, spread: 1, size: 0.14, sizeEnd: 0, life: 0.5, shape: 'spark', drag: 3 });
  }

  // a hit during the cast interrupts it → dazed 1.5 s with a ×1.5 punish window (§4.2)
  e.react = () => {
    if (e.state === 'cast') stopCastFx();
    if (dazePending && !e.dying) {
      dazePending = false;
      if (game.tells?.punish) game.tells.punish(e, DAZE * (e.timeMul ?? 1), { mul: 1.5 });
      e.setState('dazed'); e.dizzyT = DAZE;
    }
  };
  e.interrupt = () => { if (e.state === 'cast' && !fired) dazePending = true; stopCastFx(); fired = true; H = null; ctx.releaseRangedToken(e); };
  e.onResume = () => { castCd = Math.max(castCd, 0.8); };
  e.die = () => { stopCastFx(); ctx.releaseRangedToken(e); };

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
        if (d < 5 && tpCd <= 0) {
          // §4.2: the destination shimmers for 0.4 s first, then the blink
          pickTeleport(); shimmer(tpTo); e.setState('vanish'); ctx.audio('blink', { position: p, volume: 0.6, pitch: 0.8 }); break;
        }
        _v.set(pp.x - p.x, 0, pp.z - p.z).normalize();
        strafeT -= dt; if (strafeT <= 0) { strafeT = rand(1, 2.5); strafeDir = Math.random() < 0.5 ? -1 : 1; }
        let radial = 0;
        if (d < 10) radial = -2.6; else if (d > 17) radial = 2.4;
        e.move.set(-_v.z * strafeDir * 1.6 + _v.x * radial, 0, _v.x * strafeDir * 1.6 + _v.z * radial).multiplyScalar(sm);
        if (castCd <= 0 && d < 28 && !startCast(false)) castCd = 0.5;
        break;
      }
      case 'cast': {
        if (!H && !fired && !startCast(true)) { e.setState('kite'); break; }    // external setState('cast') (tests)
        if (H && !H.locked) { faceTo(e, pp.x, pp.z, 6, dt); H.setDir(faceDir()); }
        if (H && H.consumeStrike()) {
          fired = true; stopCastFx(); H = null;
          model.gem.getWorldPosition(_v2);
          ctx.projectiles.orb(_v2, element, e, { speed: 7.5, attackId: 'shaman.orb' });
          ctx.releaseRangedToken(e);
          ctx.audio('cast_' + element, { position: p, volume: 0.6, pitch: 0.8 });
        } else if (H && !H.alive && !H.struck) { H = null; fired = true; ctx.releaseRangedToken(e); }
        if (fired && e.stateT > 0.25 && !H) { castCd = rand(2.6, 3.8); e.setState('kite'); }
        break;
      }
      case 'dazed':
        if (e.stateT > DAZE * (e.timeMul ?? 1)) { castCd = Math.max(castCd, 0.8); e.setState('kite'); }
        break;
      case 'vanish':
        if (e.stateT > SHIMMER) {
          smoke(p);
          p.copy(tpTo); e.velocity.set(0, 0, 0);
          smoke(p);
          e.setState('appear'); tpCd = rand(BLINK_CD, BLINK_CD + 2);
        }
        break;
      case 'appear':
        faceTo(e, pp.x, pp.z, 10, dt);
        if (e.stateT > 0.35) { castCd = Math.max(castCd, 1.0); e.setState('kite'); }    // no cast for 1.0 s after a blink
        break;
      case 'return':
        faceTo(e, e.home.x, e.home.z, 5, dt);
        if (moveTo(e, e.home.x, e.home.z, 2.6 * sm, 0.8) < 1) { e.setState('idle'); }
        break;
    }
    speed = Math.sqrt(e.move.x * e.move.x + e.move.z * e.move.z);
  };

  e.pose = (dt, sm, stunned) => {
    copyPose(tgt, BASE);
    const AH = liveAttack(e), ph = attackPhase(AH), holding = ph === 1;
    const t = game.time * 1 + e.id.length * 0.7;
    let lambda = 10, rl = 0;
    phase += dt * (1 + speed * 2.6);
    const st = e.state;
    let scale = 1, gemGlow = 1;
    if (st === 'dead') {
      tgt.aRz = -1.3; tgt.aLz = 1.3; tgt.headX = -0.5; tgt.lRx = -0.5; tgt.kR = 0.4; lambda = 8;
    } else if ((rl = reactionPose(e, tgt, HIP, t, model.lieY))) {
      lambda = rl;
    } else if (stunned) {
      tgt.headY = Math.sin(t * 5) * 0.4; tgt.headZ = Math.cos(t * 5) * 0.3; tgt.roll = Math.sin(t * 2.5) * 0.12; tgt.pitch = 0.2;
      tgt.aRx = -0.3; tgt.aLz = 0.4;
    } else if (st === 'dazed') {
      tgt.headY = Math.sin(t * 4) * 0.35; tgt.headX = 0.35; tgt.pitch = 0.3; tgt.spineX = 0.25; tgt.roll = Math.sin(t * 2.2) * 0.1;
      tgt.aRx = 0.1; tgt.aRz = -0.3; tgt.aLx = 0.1; tgt.aLz = 0.3; tgt.kR = tgt.kL = 0.35; tgt.hipY = HIP - 0.1; lambda = 8;
    } else if (st === 'cast') {
      const k = AH ? windupK(AH) : 1;
      if (!fired) {
        tgt.aRx = -2.9 * k; tgt.aRz = -0.25; tgt.fRx = -0.2; tgt.aLx = -1.4 * k; tgt.aLz = 0.6; tgt.fLx = -0.9;
        tgt.pitch = -0.2 * k; tgt.headX = -0.25 * k; tgt.spineY = 0.2;
        gemGlow = 1 + k * 1.6;      // the gem ring grows steadily until the shot (no flicker)
        tgt.hipY = HIP + Math.sin(e.stateT * 6) * 0.03;
      } else {
        tgt.aRx = -1.4; tgt.fRx = -0.1; tgt.aLx = -0.3; tgt.pitch = 0.35; tgt.spineX = 0.2; tgt.spineY = -0.3; lambda = 22;
      }
    } else if (st === 'vanish') {
      scale = Math.max(0.01, 1 - e.stateT / 0.32); tgt.aRx = -2.5; tgt.aLx = -2.5; tgt.aLz = 0.8; tgt.aRz = -0.8;
    } else if (st === 'appear') {
      scale = Math.min(1, 0.05 + e.stateT / 0.3); tgt.aRx = -1.5; tgt.aLz = 1.2;
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
    rhythmDamp(cur, tgt, lambda, dt, holding);
    applyHumanoid(model, cur);
    model.rig.scale.set(1 + (1 - scale) * 0.6, scale, 1 + (1 - scale) * 0.6);
    model.gem.rotation.y += dt * 2.5;
    model.gem.position.y = 1.55 + Math.sin(t * 3) * 0.03;
    const gs = 0.7 * gemGlow; model.halo.scale.set(gs, gs, 1);
    model.gem.scale.setScalar(1 + (gemGlow - 1) * 0.25);
  };
  return e;
}
