// 수련용 허수아비 — straw training dummy on a post. Never dies (combat clamps hp for isDummy), wobbles on hit.
// v2: can perform a slow, telegraphed practice swing (or launch a slow practice orb) so the player can learn to block.
import * as THREE from 'three';
import { clamp, dampAngle } from '../core/utils.js';
import { buildDummy } from './models.js';
import { Spring } from './common.js';
import { makeEnemy, modelFor, beginAttack, attackMeta, attackPhase } from './base.js';
import { typeName } from './codex.js';

const _v = new THREE.Vector3(), _c = new THREE.Vector3();
const SWING_REACH = 3.4;

export function createDummy(ctx, pos, opts = {}) {
  const model = modelFor(ctx, 'dummy', {}, buildDummy);
  const game = ctx.game;
  const e = makeEnemy(ctx, {
    kind: 'dummy', model, name: typeName('dummy'), hp: 300, radius: 0.45, height: 2.3, mass: 6, isDummy: true,
    facing: opts.facing ?? 0, noTumble: true,
  }, pos);
  const baseFacing = e.facing;
  const wx = new Spring(90, 3.2), wz = new Spring(90, 3.2), spin = new Spring(40, 2.5);
  // practice attack: null | {phase:'tell'|'swing'|'orb'|'recover', t, target, done, ring}
  let prac = null;
  e.dizzyT = 0;
  e.react = (result, hit, lx, lz) => {
    const a = 1.2 + Math.min(4, (result?.damage || 0) / 12) * (hit?.heavy ? 1.6 : 1);
    // snap displacement (reads during hitstop) + velocity for the springy wobble afterwards
    wx.x += lz * a * 0.18; wz.x -= lx * a * 0.18;
    wx.kick(lz * a); wz.kick(-lx * a);
    spin.kick((Math.random() - 0.5) * a * 2);
    e.flX.reset(); e.flZ.reset();
  };
  e.onDummyParried = () => {
    e.dizzyT = 1.6; spin.kick(14); wx.kick(-3);
    if (prac) prac.phase = 'recover', prac.t = 0;
  };
  e.think = () => {};

  const swingShape = { kind: 'circle', r: SWING_REACH, pos: e.object.position };
  /**
   * Start a practice attack. practice('danger' | 'parry') (§7.4.5): a slow (×1.5) telegraphed swing at the player through
   * game.tells (danger = dodge or block, parry = gold, perfect guard → dizzy). practice(targetEntity) (v3): swing in reach, else a slow orb.
   * Returns {kind, eta, source} or null if busy.
   */
  e.practice = (arg) => {
    const kindArg = typeof arg === 'string' ? arg : null;
    const target = kindArg ? game.player?.entity : arg;
    if (prac || !target?.object) return null;
    const tp = target.object.position, p = e.object.position;
    const d = Math.hypot(tp.x - p.x, tp.z - p.z);
    const kind = kindArg ? 'swing' : d <= SWING_REACH + 0.3 ? 'swing' : 'orb';
    prac = { phase: 'tell', t: 0, target, kind, done: false, H: null };
    if (kind === 'swing') {
      e.timeMul = 1.5;
      prac.H = beginAttack(ctx, e, kindArg === 'parry' ? 'dummy.parry' : 'dummy.practice', swingShape);
      e.timeMul = 1;
      if (!prac.H) { prac = null; return null; }
    } else game.events.emit('enemyAttack', { enemy: e, kind: 'practice' });
    e.showAlert?.();
    ctx.audio('charge', { position: p, volume: 0.35, pitch: 0.9 });
    return { kind, eta: kind === 'swing' ? prac.H.dur : 1.0 + d / 5.5, source: e, tell: kindArg || 'danger' };
  };
  e.attackStarters['dummy.practice'] = () => !!e.practice('danger');
  e.attackStarters['dummy.parry'] = () => !!e.practice('parry');

  function updatePractice(dt) {
    if (!prac) return 0;
    const P = prac; P.t += dt;
    const p = e.object.position, tp = P.target.object.position;
    let twist = 0;
    if (P.phase === 'tell') {
      e.facing = dampAngle(e.facing, Math.atan2(tp.x - p.x, tp.z - p.z), 6, dt);
      const k = P.H ? clamp(P.H.progress * 1.15, 0, 1) : clamp(P.t / 1.1, 0, 1);
      twist = -1.3 * k + (attackPhase(P.H) === 1 ? 0 : Math.sin(P.t * 50) * 0.03 * k); // wind up (slow & readable), still at the top
      if (P.kind === 'orb' && P.t > 0.9) {
        _c.set(p.x, p.y + 2.0, p.z);
        _c.x += Math.sin(e.facing) * 0.5; _c.z += Math.cos(e.facing) * 0.5;
        ctx.projectiles.orb(_c, 'physical', e, { amount: 2, speed: 5.5, practice: true, color: 0xffd27a });
        ctx.audio('cast_wind', { position: p, volume: 0.5, pitch: 1.3 });
        P.phase = 'recover'; P.t = 0; spin.kick(-6);
      } else if (P.kind === 'swing' && (P.H ? P.H.consumeStrike() : P.t > 1.1)) { P.phase = 'swing'; P.t = 0.1; P.done = false; ctx.audio('sword_swing', { position: p, volume: 0.6, pitch: 0.8 }); }
      else if (P.kind === 'swing' && P.H && !P.H.alive) { prac = null; return 0; }
    } else if (P.phase === 'swing') {
      const k = clamp(P.t / 0.22, 0, 1);
      twist = -1.3 + 3.6 * k;
      if (!P.done && P.t > 0.1) {
        P.done = true;
        const te = P.target;
        const d = Math.hypot(tp.x - p.x, tp.z - p.z);
        if (te.alive !== false && (P.H ? P.H.contains(tp) : d < SWING_REACH + 0.15) && Math.abs(tp.y - p.y) < 2.5) {
          _v.set(tp.x - p.x, 0, tp.z - p.z).normalize();
          te.getCenter ? te.getCenter(_c) : _c.copy(tp).setY(tp.y + 1);
          const r = game.combat.dealDamage(te, { amount: 2, element: 'physical', source: e, point: _c.clone(), direction: _v.clone(), knockback: 3, tags: ['practice'], hitstop: 0.06,
            attack: attackMeta(P.H?.id || 'dummy.practice'), sourceName: e.name });
          if (r?.blocked && !r.parried) { spin.kick(-8); wx.kick(-2); }
        }
      }
      if (P.t > 0.3) { P.phase = 'recover'; P.t = 0; spin.x = 2.3; }
    } else if (P.phase === 'recover') {
      e.facing = dampAngle(e.facing, baseFacing, 3, dt);
      if (P.t > 0.9) prac = null;
    }
    return twist;
  }

  e.pose = (dt) => {
    const r = model.rig;
    const tw = updatePractice(dt);
    if (e.dizzyT > 0) e.dizzyT -= dt;
    const dz = e.dizzyT > 0 ? Math.sin(game.time * 7) * 0.12 : 0;
    r.rotation.set(wx.update(dt) * 0.25 + dz, spin.update(dt) * 0.3 + tw, wz.update(dt) * 0.25 + dz * 0.6);
    e.flX.reset(); e.flZ.reset();
  };
  e.object.position.y = ctx.groundH(pos.x, pos.z);
  return e;
}
