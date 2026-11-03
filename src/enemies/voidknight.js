// 공허 기사 (voidknight, elite 420) — guard stance (frontal hits ×0.35 unless heavy/broken), voidShield 100, breakMax 60, poise.
// Moves: 3-hit combo (cone telegraphs), overhead void slam (circle, parryable: gold rim + glint), shield bash on guarded hits.
import * as THREE from 'three';
import { rand, clamp } from '../core/utils.js';
import { buildVoidKnight } from './models2.js';
import { makeEnemy, faceTo, moveTo, moveForward, angleToPlayer, newPose, dampPose, applyHumanoid, walkCycle, reactionPose } from './base.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const HIP = 1.02;
const BASE = newPose(HIP);
const VOID = 0xb36bff;
const COMBO = [{ wind: 0.7, amount: 16, range: 3.2, ang: 1.0 }, { wind: 0.45, amount: 16, range: 3.2, ang: 1.0 }, { wind: 0.6, amount: 24, range: 3.6, ang: 0.7, heavy: true }];

export function createVoidKnight(ctx, pos, opts = {}) {
  const model = buildVoidKnight();
  model.lieY = 0.35;
  const e = makeEnemy(ctx, {
    kind: 'voidknight', model, name: '공허 기사', hp: 420, radius: 0.75, height: 2.5, mass: 2.4,
    camp: opts.camp, facing: opts.facing, staggerDmg: 999, sight: 24, poiseMax: 120, isElite: true,
    resist: { shadow: 0.5, light: 1.3 },
  }, pos);
  e.element = 'void'; e.isVoid = true; e.isElite = true;
  e.voidShield = 100; e.voidShieldMax = 100; e.breakMax = 60;
  e.weakness = ['light'];
  e.dissolveColor = VOID;
  const game = ctx.game;
  const cur = newPose(HIP), tgt = newPose(HIP);
  let phase = rand(0, 6), speed = 0, attackCd = rand(1, 2), slamCd = rand(4, 6), step = 0, hitDone = false, tele = null, guard = 0, bashCd = 0;
  const stopTele = () => { tele?.stop?.(); tele = null; };
  e.interrupt = () => { hitDone = true; stopTele(); step = 0; };
  e.onResume = () => { attackCd = Math.max(attackCd, 0.8); };
  e.armor = () => e.state === 'slash' || e.state === 'slam';
  e.die = () => stopTele();
  e.onBreak = () => { stopTele(); e.setState('stagger'); e.reactDur = 2.0; guard = 0; };

  // guard stance: frontal non-heavy hits are deflected (the block result goes through combat's onBeforeDamage hook)
  e.onBeforeDamage = (hit) => {
    if (guard < 0.6 || e.statuses?.broken || e.state === 'stagger') return null;
    if (hit?.heavy || hit?.charged || hit?.finisher || hit?.tier === 'ult' || hit?.isDot) return null;
    const p = e.object.position;
    const src = hit?.source?.object?.position || hit?.point || ctx.playerPos;
    let a = Math.atan2(src.x - p.x, src.z - p.z) - e.facing; a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) > 1.1) return null;
    _v.copy(model.shield.getWorldPosition(_v));
    game.vfx.burst(_v, { count: 10, color: [0xe6c8ff, VOID], speed: 4, spread: 0.6, size: 0.12, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 });
    ctx.audio('block_hit', { position: p, volume: 0.5, pitch: 0.7 });
    if (bashCd <= 0 && e.distP < 3 && e.state === 'guard') { bashCd = 3; e.setState('bash'); hitDone = false; }
    return { mul: 0.35 };
  };

  function slash(i) {
    const c = COMBO[i];
    _d.set(Math.sin(e.facing), 0, Math.cos(e.facing));
    tele = ctx.tele({ shape: 'cone', pos: e.object.position, dir: _d, r: c.range, angle: c.ang * 114, dur: c.wind, color: 'void' });
    e.setState('slashWind'); hitDone = false;
  }

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    attackCd -= dt; slamCd -= dt; bashCd -= dt;
    switch (e.state) {
      case 'idle': guard = Math.max(0, guard - dt); break;
      case 'alert':
        faceTo(e, pp.x, pp.z, 6, dt);
        if (e.stateT < 0.02) { model.weapon.getWorldPosition(_v); game.vfx.burst(_v, { count: 18, color: [0xe6c8ff, VOID], speed: 3, spread: 1, size: 0.16, sizeEnd: 0, life: 0.6, shape: 'wisp' }); }
        if (e.stateT > 0.9) e.setState('guard');
        break;
      case 'guard': {
        // advance behind the shield
        if (!e.aggro) { e.setState('return'); break; }
        guard = Math.min(1, guard + dt * 4);
        faceTo(e, pp.x, pp.z, 4.5, dt);
        if (d > 2.8) moveForward(e, (d > 8 ? 3.0 : 1.9) * sm);
        if (slamCd <= 0 && d < 7 && d > 2 && ctx.takeToken(e)) {
          e.setState('slamWind'); game.events.emit('enemyAttack', { enemy: e, kind: 'slam' });
          _v.set(p.x + Math.sin(e.facing) * 2.6, 0, p.z + Math.cos(e.facing) * 2.6); _v.y = ctx.groundH(_v.x, _v.z);
          tele = ctx.tele({ shape: 'circle', pos: _v, r: 2.8, dur: 1.0, color: 'void', parryable: true });
          guard = 0;
        } else if (d < 3.3 && attackCd <= 0 && angleToPlayer(ctx, e) < 0.7 && ctx.takeToken(e)) {
          step = 0; guard = 0; slash(0); game.events.emit('enemyAttack', { enemy: e, kind: 'combo' });
        }
        break;
      }
      case 'slashWind': {
        const c = COMBO[step];
        if (e.stateT < c.wind * 0.6) { faceTo(e, pp.x, pp.z, 4, dt); _d.set(Math.sin(e.facing), 0, Math.cos(e.facing)); tele?.setDir?.(_d); tele?.setPos?.(p); }
        if (e.stateT > c.wind / Math.max(0.5, sm)) { e.setState('slash'); ctx.audio('swing', { position: p, volume: 0.5, pitch: 0.7 }); }
        break;
      }
      case 'slash': {
        const c = COMBO[step];
        if (e.stateT < 0.12) moveForward(e, 4 * sm);
        if (!hitDone && e.stateT > 0.05 && e.stateT < 0.2 && ctx.meleeCheck(e, c.range, c.ang)) {
          hitDone = true; ctx.hitPlayer(e, { amount: c.amount, element: 'void', knockback: c.heavy ? 11 : 6, launch: c.heavy ? 3 : 0 });
        }
        if (e.stateT > 0.32) {
          stopTele();
          if (step < COMBO.length - 1 && d < 4.5) { step++; slash(step); }
          else { e.setState('recover'); }
        }
        break;
      }
      case 'slamWind':
        if (e.stateT > 1.0 / Math.max(0.5, sm)) {
          e.setState('slam');
          _v.set(p.x + Math.sin(e.facing) * 2.6, 0, p.z + Math.cos(e.facing) * 2.6);
          ctx.slam(_v, 2.8, { amount: 26, element: 'void', knockback: 12, launch: 5 }, e, 1.2);
          game.vfx.preset?.('explosion_shadow', _v, { scale: 0.8 });
          game.vfx.groundDecal?.('violet', _v, 2.6, 7);
          stopTele();
        }
        break;
      case 'slam':
        if (e.stateT > 0.9) { slamCd = rand(6, 9); e.setState('recover'); }
        break;
      case 'bash':
        faceTo(e, pp.x, pp.z, 8, dt);
        if (e.stateT > 0.18 && e.stateT < 0.3) moveForward(e, 6 * sm);
        if (!hitDone && e.stateT > 0.2 && e.stateT < 0.34 && ctx.meleeCheck(e, 2.2, 0.9)) { hitDone = true; ctx.hitPlayer(e, { amount: 10, knockback: 14, status: { stunned: 0.5 } }); }
        if (e.stateT > 0.55) e.setState('guard');
        break;
      case 'recover':
        if (e.stateT > 0.9) { ctx.releaseToken(e); attackCd = rand(1.4, 2.4); step = 0; e.setState('guard'); }
        break;
      case 'return':
        faceTo(e, e.home.x, e.home.z, 4, dt);
        if (moveTo(e, e.home.x, e.home.z, 2.4 * sm, 0.8) < 1) e.setState('idle');
        break;
    }
    if (e.state !== 'guard' && e.state !== 'bash') guard = Math.max(0, guard - dt * 3);
    speed = Math.hypot(e.move.x, e.move.z);
  };

  e.pose = (dt, sm, stunned) => {
    Object.assign(tgt, BASE);
    const t = game.time + e.id.length;
    let lambda = 10, rl = 0;
    phase += dt * (1.0 + speed * 2);
    const st = e.state;
    if (st === 'dead') { tgt.aRz = -1.2; tgt.aLz = 1.2; tgt.headX = -0.4; lambda = 6; }
    else if ((rl = reactionPose(e, tgt, HIP, t, model.lieY))) lambda = rl;
    else if (stunned) { tgt.headY = Math.sin(t * 4) * 0.3; tgt.pitch = 0.3; tgt.aRz = -0.6; tgt.aLz = 0.6; tgt.kR = tgt.kL = 0.5; tgt.hipY = HIP - 0.15; }
    else if (st === 'slashWind') {
      const k = clamp(e.stateT / (COMBO[step].wind * 0.7), 0, 1), side = step === 1 ? -1 : 1;
      tgt.aRx = -2.2 * k; tgt.aRz = -0.9 * side * k; tgt.fRx = -0.8 * k; tgt.spineY = 0.6 * side * k; tgt.pitch = -0.1 * k;
      if (step === 2) { tgt.aRx = -3.2 * k; tgt.aRz = -0.2; tgt.spineY = 0.1; tgt.pitch = -0.25 * k; }
      tgt.aLx = -0.9; tgt.aLz = 0.6; tgt.fLx = -1.2; tgt.lRx = 0.35; tgt.lLx = -0.45; tgt.kL = 0.5; tgt.hipY = HIP - 0.08;
      tgt.roll = Math.sin(t * 50) * 0.015 * k; lambda = 12;
    } else if (st === 'slash') {
      const side = step === 1 ? -1 : 1;
      tgt.aRx = -0.9; tgt.aRz = 0.6 * side; tgt.fRx = -0.1; tgt.spineY = -0.6 * side; tgt.pitch = 0.35;
      if (step === 2) { tgt.aRx = -0.4; tgt.aRz = 0; tgt.spineY = 0; tgt.pitch = 0.55; tgt.hipY = HIP - 0.2; }
      tgt.aLx = -0.6; tgt.aLz = 0.6; tgt.lRx = 0.5; tgt.lLx = -0.6; tgt.kL = 0.6; lambda = 30;
    } else if (st === 'slamWind') {
      const k = clamp(e.stateT / 0.8, 0, 1);
      tgt.aRx = -3.3 * k; tgt.aLx = -3.0 * k; tgt.aRz = -0.15; tgt.aLz = 0.15; tgt.fRx = tgt.fLx = -0.4; tgt.pitch = -0.35 * k; tgt.headX = -0.3 * k;
      tgt.hipY = HIP + 0.05 * k; tgt.roll = Math.sin(t * 60) * 0.02 * k; lambda = 9;
    } else if (st === 'slam') { tgt.aRx = -0.2; tgt.aLx = -0.2; tgt.pitch = 0.8; tgt.spineX = 0.3; tgt.hipY = HIP - 0.35; tgt.kR = tgt.kL = 0.9; tgt.lRx = tgt.lLx = -0.6; lambda = 26; }
    else if (st === 'bash') { tgt.aLx = -1.6; tgt.aLz = 0.1; tgt.fLx = -0.2; tgt.spineY = -0.5; tgt.pitch = 0.3; tgt.lLx = 0.6; tgt.lRx = -0.4; tgt.kR = 0.5; lambda = 24; }
    else if (st === 'recover') { tgt.aRx = -0.6; tgt.pitch = 0.25; tgt.hipY = HIP - 0.12; tgt.kR = tgt.kL = 0.3; lambda = 6; }
    else {
      const amt = clamp(speed / 2.6, 0, 1);
      if (amt > 0.05) walkCycle(tgt, phase, amt * 0.75, 0);
      // guard: shield raised, sword cocked back
      const g = guard;
      tgt.aLx = -1.35 * g - 0.2; tgt.aLz = 0.35 + 0.2 * g; tgt.fLx = -1.3 * g - 0.3;
      tgt.aRx = -0.5 - 0.6 * g; tgt.aRz = -0.35; tgt.fRx = -0.9 * g - 0.3;
      tgt.spineY = 0.25 * g; tgt.hipY -= 0.08 * g; tgt.kR += 0.2 * g; tgt.kL += 0.25 * g;
      tgt.spineX = Math.sin(t * 1.6) * 0.02;   // breathing
    }
    dampPose(cur, tgt, lambda, dt);
    applyHumanoid(model, cur);
  };
  return e;
}
