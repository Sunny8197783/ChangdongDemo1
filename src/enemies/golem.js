// 고대 바위 골렘 — boss (PLAN v4 §4.9). Floating boulders bound by a glowing crystal core.
// Entrance rise + roar; three telegraphed attacks through game.tells (bossbase.js bossAttack / bossHit, one strike latch):
//   golem.slam  (jump tell)   circle r 7.5 fills, then a shockwave ring travels r 1 → 7.5 at 12 m/s: hit when the front passes the
//                             player with feet − ground ≤ 0.6 m (jump over it); recover 1.3 s, punish ×1.25
//   golem.throw (danger)      the landing circle r 3.4 shows from the windup start; aim locks 0.35 s before release; flight 0.9–1.6 s
//   golem.punch (parry)       cone r 8.5 / 1.05 rad, fist glows; whiffed → fist planted 1.2 s and the cage opens (core ×2);
//                             parried → 1.6 s stagger, cage open (×2)
// Poise 280 → 2.4 s stagger (cd 9, core ×2); phase 2 at 50 % (red core, faster windups, summons chuchus); a break = 3.5 s stagger (bossbase).
// The model is bosses/golem_model.js (v4 contract); prewarmGolem(game) builds it ahead of the fight.
import * as THREE from 'three';
import { rand, clamp, pick } from '../core/utils.js';
import { makeEnemy, faceTo, moveForward, angleToPlayer, newPose, dampPose, applyHumanoid } from './base.js';
import { buildGolemModel, previewGolem } from './bosses/golem_model.js';
import { bossAttack, bossHit, bossPunish, rhythm, cancelled, finishBoss, stopAttacks } from './bossbase.js';
import { codexOf, registerBossCodex } from './bosses/codex.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _d = new THREE.Vector3();
const HIP = 2.62;
const BASE = newPose(HIP);
const DMG = { slam: 30, throw: 22, punch: 26 };
const DUST = [0xb8a582, 0x8a7a5a];
const ROCK_G = 22;

let spare = null;
/** Build (once) and warm the golem model ahead of the fight; returns its root for the caller's compile staging. */
export function prewarmGolem(game) {
  try { registerBossCodex(game); game?.enemies?.registerPreview?.('golem', previewGolem); } catch (_) { /* */ }
  if (!spare) spare = buildGolemModel();
  try { game?.render?.warm?.(spare.root); game?.render?.warm?.(spare.thrown); } catch (_) { /* */ }
  return spare.root;
}
function takeModel() { const m = spare || buildGolemModel(); spare = null; return m; }

export function createGolem(ctx, pos, opts = {}) {
  const game = ctx.game, vfx = game.vfx, world = game.world;
  const model = opts.model?.isV4 ? opts.model : takeModel();
  const nameKo = codexOf('golem')?.nameKo || '';
  const e = makeEnemy(ctx, {
    kind: 'golem', model, name: nameKo, hp: 2200, radius: 2.1, height: 6, mass: 4, isBoss: true,
    resist: { earth: 0.5 }, noTumble: true, facing: opts.facing ?? 0, staggerDmg: 1e9,
  }, pos);
  const arena = world.bossArena || { position: pos.clone(), radius: 24 };
  e.aggro = true; e.friction = 10;
  e.invulnerable = true;
  e.bossId = 'golem';
  game.scene.add(model.thrown);
  const cur = newPose(HIP), tgt = newPose(HIP);
  let mul = 1, cd = 2, lastAtk = '', phase = 0, speed = 0, poise = 0, poiseCd = 0, summonDone = false, debrisT = 0, staggerLen = 2.4;
  let h = null;                          // the live attack handle
  const slamCenter = new THREE.Vector3(), throwTarget = new THREE.Vector3(), rockFrom = new THREE.Vector3(), rockVel = new THREE.Vector3();
  const wave = { on: false, t: 0, done: false, center: new THREE.Vector3(), handle: null };
  const rock = { on: false, t: 0, T: 1 };
  const groundY = pos.y;
  e.object.position.y = groundY - 7.5;
  e.noPhysics = true;
  e.phase = 0; e.phase2 = false;
  e.setState('emerge');

  const shakeAt = (p, amt) => { const d = Math.hypot(ctx.playerPos.x - p.x, ctx.playerPos.z - p.z); vfx.shake?.(amt * clamp(1 - d / 45, 0.15, 1)); };
  const smoke = (p, n, s = 1) => vfx.burst(p, { owner: 'enemy', count: n, color: DUST, speed: 2.5 * s, spread: 0.5, dir: _v2.set(0, 1, 0), size: 0.6 * s, sizeEnd: 1.2 * s, life: 0.7, shape: 'smoke', drag: 2.5, additive: false });
  function roar() {
    ctx.audio('boss_roar', { position: e.object.position, volume: 1 });
    shakeAt(e.object.position, 0.6);
    vfx.shockwave?.(_v.set(e.object.position.x, groundY + 0.2, e.object.position.z), { owner: 'enemy', color: 0xb8a582, radius: 10, duration: 0.8, opacity: 0.45 });
  }
  function step(foot) {
    foot.getWorldPosition(_v); _v.y = world.getHeight(_v.x, _v.z) + 0.1;
    ctx.audio('golem_step', { position: _v, volume: 1 });
    shakeAt(_v, 0.16);
    smoke(_v, 6);
  }
  function pickAttack(d) {
    const ang = angleToPlayer(ctx, e);
    const o = [];
    if (d < 8 && ang < 1.0) o.push('punch', 'punch');
    if (d < 12) o.push('slam');
    if (d > 7) o.push('throw');
    if (d > 14) o.push('throw');
    let a = pick(o.length ? o : ['throw']);
    if (a === lastAtk && o.length > 1 && Math.random() < 0.6) a = pick(o);
    return a;
  }
  const fwd = (out) => out.set(Math.sin(e.facing), 0, Math.cos(e.facing));
  function predicted(out, lead) {
    const pp = ctx.playerPos, pv = (ctx.target || game.player?.entity)?.velocity;
    out.copy(pp); if (pv) { out.x += pv.x * lead; out.z += pv.z * lead; }
    out.y = world.getHeight(out.x, out.z);
    return out;
  }

  /** Start attack `a` now (AI and e.debugAttack). Returns the handle or null (tells refused). */
  function start(a) {
    const p = e.object.position;
    let hh = null;
    if (a === 'slam') {
      fwd(_d); slamCenter.set(p.x + _d.x * 3.2, 0, p.z + _d.z * 3.2); slamCenter.y = world.getHeight(slamCenter.x, slamCenter.z);
      hh = bossAttack(ctx, e, 'golem.slam', { shape: { pos: slamCenter } });
      if (hh) e.setState('slamWind');
    } else if (a === 'throw') {
      rock.T = clamp(e.distP / 16, 0.9, 1.6);
      predicted(throwTarget, 0.3);
      const base = e.phase2 ? 0.9 : 1.0;
      hh = bossAttack(ctx, e, 'golem.throw', { windup: base + rock.T, lockAt: rock.T + 0.35, shape: { pos: throwTarget } });
      if (hh) { e.setState('throwWind'); rock.on = false; }
    } else if (a === 'punch') {
      fwd(_d);
      hh = bossAttack(ctx, e, 'golem.punch', { shape: { pos: p, dir: _d } });
      if (hh) { e.setState('punchWind'); ctx.audio('blink', { position: p, volume: 0.6, pitch: 0.35 }); }
    }
    if (hh) { h = hh; lastAtk = a; }
    return hh;
  }
  function toRecover(sec) { e.setState('recover'); e._recT = sec; h = null; }
  function openCage(sec, mulCore) { model.setCage(1); e._cageT = sec; bossPunish(ctx, e, sec, mulCore); }

  e.onBossParried = () => {
    if (['emerge', 'roar', 'phase2', 'stagger'].includes(e.state)) return;
    staggerLen = 1.6; stopAttacks(e); h = null; e.setState('stagger'); openCage(1.6, 2.0);
    ctx.audio('shatter', { position: e.object.position, volume: 0.7, pitch: 0.7 });
  };
  e.react = (result) => {
    poise += result?.damage || 0;
    if (!e.phase2 && e.hp <= e.maxHp * 0.5 && e.state !== 'phase2') {
      e.phase2 = true; e.phase = 1; mul = 1.2; stopAttacks(e); h = null; wave.on = false; e.setState('phase2'); summonDone = false; e.invulnerable = true;
      game.events.emit('bossPhase', { boss: e, id: 'golem', phase: 2, name: e.phases?.[1]?.name || '' });
      return;
    }
    if (poise > 280 && poiseCd <= 0 && !['emerge', 'roar', 'phase2', 'stagger'].includes(e.state)) {
      poise = 0; poiseCd = 9; staggerLen = 2.4; stopAttacks(e); h = null; wave.on = false; e.setState('stagger'); openCage(2.4, 2.0);
      ctx.audio('shatter', { position: e.object.position, volume: 0.7, pitch: 0.6 });
    }
  };

  function resolveSlam(hh) {
    shakeAt(slamCenter, 0.75);
    vfx.debris?.(slamCenter, { owner: 'enemy', count: 14, size: 0.55, speed: 10, life: 2.2, material: 'rock' });
    vfx.decal?.(slamCenter, { owner: 'enemy', radius: 5, duration: 6, type: 'crack' });
    smoke(slamCenter, 10, 1.6);
    vfx.fovKick?.(3, 0.3);
    ctx.audio('explode_earth', { position: slamCenter, volume: 1, pitch: 0.7 });
    wave.on = true; wave.t = 0; wave.done = false; wave.center.copy(slamCenter); wave.handle = hh;
  }
  /** The travelling shockwave: hit once when its front passes the player on the ground (jump over it). */
  function waveUpdate(dt) {
    if (!wave.on) return;
    wave.t += dt;
    const sR = wave.handle?.shockwaveR?.();
    const R = sR != null && sR >= 0 ? sR : 1 + 12 * wave.t;
    const pp = ctx.playerPos, d = Math.hypot(pp.x - wave.center.x, pp.z - wave.center.z);
    if (!wave.done && R >= d - 0.15 && d <= 7.5 + 0.15) {
      wave.done = true;
      bossHit(ctx, e, null, { attack: 'golem.slam', amount: DMG.slam, knockback: 12, launch: 7, from: wave.center }, { jumpAvoid: true });
    }
    if (R >= 7.5 + 0.3) { wave.on = false; wave.done = true; }
  }
  function releaseRock() {
    e.model.fistR.getWorldPosition(rockFrom); rockFrom.y += 1.0;
    const T = Math.max(0.3, h ? h.remaining : rock.T);
    rock.on = true; rock.t = 0; rock.T = T;
    rockVel.set((throwTarget.x - rockFrom.x) / T, (throwTarget.y - rockFrom.y + 0.5 * ROCK_G * T * T) / T, (throwTarget.z - rockFrom.z) / T);
    model.thrown.position.copy(rockFrom); model.thrown.visible = true; model.thrown.scale.setScalar(0.4);
    ctx.audio('cast_earth', { position: e.object.position, volume: 0.9, pitch: 0.6 });
  }
  function rockUpdate(dt) {
    if (!rock.on) return;
    rock.t += dt;
    rockVel.y -= ROCK_G * dt;
    model.thrown.position.addScaledVector(rockVel, dt);
    model.thrown.rotation.x += dt * 4; model.thrown.rotation.z += dt * 3;
    model.thrown.scale.setScalar(Math.min(1, 0.4 + rock.t * 3));
    if (rock.t > rock.T + 0.4) { rock.on = false; model.thrown.visible = false; }
  }
  function landRock(hh) {
    rock.on = false; model.thrown.visible = false;
    bossHit(ctx, e, hh, { attack: 'golem.throw', amount: DMG.throw, knockback: 12, launch: 6, from: throwTarget });
    vfx.debris?.(throwTarget, { owner: 'enemy', count: 10, size: 0.45, speed: 8, material: 'rock' });
    smoke(throwTarget, 8, 1.2);
    ctx.audio('explode_earth', { position: throwTarget, volume: 0.9 });
  }

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    const k = sm * mul;
    cd -= dt * k; poiseCd -= dt; poise = Math.max(0, poise - dt * 30);
    if (e._cageT > 0) { e._cageT -= dt; if (e._cageT <= 0) model.setCage(0); }
    _v.set(p.x - arena.position.x, 0, p.z - arena.position.z);
    const ar = arena.radius - 3;
    if (_v.length() > ar) { _v.setLength(ar); p.x = arena.position.x + _v.x; p.z = arena.position.z + _v.z; }
    const playerHere = ctx.playerAlive && Math.hypot(pp.x - arena.position.x, pp.z - arena.position.z) < arena.radius + 16;
    waveUpdate(dt); rockUpdate(dt);
    // the strike latch: polled every sub-step, whatever pose state the attack is in
    if (h && cancelled(h)) { h = null; if (/Wind$|Drop$|^punch$|^throwRel$/.test(e.state)) toRecover(0.5); }
    if (h && h.consumeStrike()) {
      const id = h.bossId; const hh = h; h = null;
      if (id === 'golem.slam') { resolveSlam(hh); e.setState('slam'); }
      else if (id === 'golem.throw') { landRock(hh); toRecover(0.5); }
      else if (id === 'golem.punch') {
        const r = bossHit(ctx, e, hh, { attack: 'golem.punch', amount: DMG.punch, knockback: 15, launch: 4 });
        e.model.fistR.getWorldPosition(_v); _v.y = world.getHeight(_v.x, _v.z); smoke(_v, 8);
        shakeAt(p, 0.35);
        if (!(r && r.parried) && e.state !== 'stagger') { e.setState('planted'); openCage(1.2, 2.0); }
      }
    }
    switch (e.state) {
      case 'emerge': {
        const t = clamp(e.stateT / 3.4, 0, 1);
        p.y = groundY - 7.5 * (1 - (1 - Math.pow(1 - t, 2.2)));
        debrisT -= dt;
        if (debrisT <= 0 && t < 1) {
          debrisT = 0.3;
          _v.set(p.x + rand(-3, 3), groundY + 0.2, p.z + rand(-3, 3));
          vfx.debris?.(_v, { owner: 'enemy', count: 4, size: 0.4, speed: 7, life: 1.8, material: 'rock' });
          smoke(_v, 6, 1.4);
          shakeAt(p, 0.22);
          ctx.audio('golem_step', { position: p, volume: 0.6, pitch: 0.7 });
        }
        if (t >= 1) { p.y = groundY; e.noPhysics = false; e.setState('roar'); roar(); }
        break;
      }
      case 'roar':
        if (e.stateT > 1.8) { e.invulnerable = false; e.setState('chase'); cd = 1; }
        break;
      case 'phase2':
        if (e.stateT > 0.4 && !summonDone) {
          summonDone = true; model.setPhase(true); roar();
          for (let i = 0; i < 3; i++) {
            const a = e.facing + (i - 1) * 1.2;
            _v.set(p.x + Math.sin(a) * 6, 0, p.z + Math.cos(a) * 6);
            ctx.spawnSummon('chuchu', _v, { variant: pick(['normal', 'fire', 'normal']) });
          }
        }
        if (e.stateT > 2.2) { e.invulnerable = false; e.setState('chase'); cd = 0.8; }
        break;
      case 'wait':
        if (playerHere) { e.setState('chase'); break; }
        faceTo(e, arena.position.x, arena.position.z, 1, dt);
        if (Math.hypot(p.x - arena.position.x, p.z - arena.position.z) > 3) moveForward(e, 1.6);
        break;
      case 'chase':
        if (!playerHere) { e.setState('wait'); break; }
        faceTo(e, pp.x, pp.z, 1.5 * k, dt);
        if (d > 6.5) moveForward(e, 2.3 * k);
        if (cd <= 0) { if (!start(pickAttack(d))) cd = 0.4; }
        break;
      case 'slamWind':
        faceTo(e, pp.x, pp.z, 0.4, dt);
        break;
      case 'slam':
        if (!wave.on && e.stateT > 0.3) { toRecover(1.3); bossPunish(ctx, e, 1.3, 1.25); }
        break;
      case 'throwWind':
        faceTo(e, pp.x, pp.z, 2.2, dt);
        if (h && !h.locked) { predicted(throwTarget, 0.3); h.setPos(throwTarget); }
        if (h && h.remaining <= rock.T + 1e-3 && !rock.on) { releaseRock(); e.setState('throwRel'); }
        break;
      case 'throwRel':
        break;
      case 'punchWind':
        if (h && !h.locked) { faceTo(e, pp.x, pp.z, 2.5, dt); fwd(_d); h.setPos(p); h.setDir(_d); }
        if (h && rhythm(game, h) === 'strike') e.setState('punch');
        break;
      case 'punch':
        if (!h && e.stateT > 0.5) toRecover(0.6);
        break;
      case 'planted':
        if (e.stateT > 1.2) toRecover(0.4);
        break;
      case 'recover':
        if (e.stateT > (e._recT ?? 0.75) / k) { cd = rand(1.0, 2.0) / mul; e.setState('chase'); }
        break;
      case 'stagger':
        if (e.stateT > staggerLen) { e.setState('chase'); cd = 0.5; }
        break;
    }
    if (e.state === 'slamWind' && h && rhythm(game, h) === 'strike') e.setState('slamDrop');
    speed = Math.hypot(e.move.x, e.move.z);
  };

  e.pose = (dt, sm, stunned) => {
    Object.assign(tgt, BASE);
    const t = game.time;
    const k = (sm || 1) * mul;
    let lambda = 6;
    const st = e.state;
    const prev = phase;
    phase += dt * speed * 1.25;
    if (speed > 0.2) {
      const s = Math.sin(phase), c = Math.cos(phase);
      tgt.lRx = s * 0.45; tgt.lLx = -s * 0.45; tgt.kR = Math.max(0, -c) * 0.7; tgt.kL = Math.max(0, c) * 0.7;
      tgt.aRx = -s * 0.3; tgt.aLx = s * 0.3; tgt.roll = c * 0.06; tgt.spineY = s * 0.1; tgt.hipY = HIP - Math.abs(c) * 0.12;
      tgt.pitch = 0.08;
      if (Math.floor(prev / Math.PI) !== Math.floor(phase / Math.PI)) step(Math.floor(phase / Math.PI) % 2 ? model.kneeL : model.kneeR);
    } else {
      tgt.spineX = Math.sin(t * 1.2) * 0.03; tgt.aRx = Math.sin(t * 1.2) * 0.05; tgt.aLx = -Math.sin(t * 1.2) * 0.05;
    }
    tgt.aRz = -0.18; tgt.aLz = 0.18; tgt.fRx = -0.25; tgt.fLx = -0.25;
    const staggered = st === 'stagger' || e.isBroken?.();
    if (st === 'emerge') {
      tgt.aRx = -2.6; tgt.aLx = -2.6; tgt.aRz = -0.6; tgt.aLz = 0.6; tgt.headX = 0.5; tgt.pitch = 0.3; lambda = 3;
    } else if (st === 'roar' || (st === 'phase2' && e.stateT < 1.8)) {
      tgt.aRz = -1.2; tgt.aLz = 1.2; tgt.aRx = -0.6; tgt.aLx = -0.6; tgt.fRx = -1.2; tgt.fLx = -1.2;
      tgt.headX = -0.45; tgt.pitch = -0.25; tgt.spineX = -0.2; lambda = 5;
    } else if (staggered) {
      // kneel: one knee down, arms hanging, the cage open (§4.15)
      tgt.hipY = HIP - 1.0; tgt.pitch = 0.45; tgt.lRx = -1.4; tgt.kR = 2.0; tgt.lLx = 0.2; tgt.kL = 1.5;
      tgt.aRx = -0.4; tgt.aLx = -0.4; tgt.aRz = -0.6; tgt.aLz = 0.6; tgt.fRx = tgt.fLx = -0.2; tgt.headX = 0.5;
      tgt.roll = Math.sin(t * 3) * 0.05; lambda = 5;
    } else if (st === 'slamWind') {
      // anticipation: both arms high, squash (the pose freezes at the top during the hold)
      tgt.aRx = -3.0; tgt.aLx = -3.0; tgt.aRz = 0.25; tgt.aLz = -0.25; tgt.fRx = -0.7; tgt.fLx = -0.7;
      tgt.pitch = -0.3; tgt.spineX = -0.2; tgt.headX = -0.2; tgt.hipY = HIP + 0.15; lambda = 4.5 * k;
    } else if (st === 'slamDrop' || st === 'slam' || (st === 'recover' && lastAtk === 'slam')) {
      tgt.aRx = -1.1; tgt.aLx = -1.1; tgt.aRz = 0.1; tgt.aLz = -0.1; tgt.fRx = -0.6; tgt.fLx = -0.6;
      tgt.pitch = 0.6; tgt.spineX = 0.35; tgt.hipY = HIP - 0.55; tgt.lRx = -0.6; tgt.lLx = -0.6; tgt.kR = tgt.kL = 1.0;
      lambda = st === 'slamDrop' ? 40 : st === 'slam' ? 20 : 3;           // recovery: slumped, slow to rise
    } else if (st === 'throwWind') {
      const kk = clamp(e.stateT * k / 0.6, 0, 1);
      tgt.aRx = -2.9 * kk; tgt.aRz = -0.4; tgt.fRx = -1.3 * kk; tgt.spineY = 0.55 * kk; tgt.spineX = -0.2 * kk; tgt.pitch = -0.15;
      tgt.aLx = -1.2; tgt.aLz = 0.6; tgt.lRx = 0.3; tgt.lLx = -0.3; lambda = 6 * k;
    } else if (st === 'throwRel') {
      tgt.aRx = -1.2; tgt.fRx = -0.1; tgt.spineY = -0.5; tgt.pitch = 0.3; tgt.aLx = 0.3; lambda = 18;
    } else if (st === 'punchWind') {
      tgt.aRx = -1.3; tgt.aRz = -1.4; tgt.fRx = -0.9; tgt.spineY = 0.9; tgt.pitch = 0.1; tgt.aLx = -0.6; tgt.aLz = 0.4;
      tgt.hipY = HIP - 0.25; tgt.kR = tgt.kL = 0.5; tgt.lRx = tgt.lLx = -0.3; lambda = 6 * k;
    } else if (st === 'punch' || st === 'planted' || (st === 'recover' && lastAtk === 'punch')) {
      // strike, then the fist stays planted in the ground (the punish window)
      tgt.aRx = st === 'planted' ? -0.9 : -1.5; tgt.aRz = 0.2; tgt.fRx = -0.2; tgt.spineY = -1.0; tgt.pitch = st === 'planted' ? 0.55 : 0.25; tgt.aLx = 0.2; tgt.aLz = 0.5;
      tgt.hipY = HIP - (st === 'planted' ? 0.6 : 0.25); tgt.kR = tgt.kL = 0.7; tgt.lRx = tgt.lLx = -0.4;
      lambda = st === 'punch' ? 40 : 4;
    } else if (st === 'dead') {
      tgt.hipY = HIP - 0.8; tgt.pitch = 0.35; tgt.aRz = -0.8; tgt.aLz = 0.8; tgt.headX = 0.6; tgt.kR = tgt.kL = 1.2; tgt.lRx = tgt.lLx = -1.0; lambda = 3;
    }
    if (stunned) { tgt.headY = Math.sin(t * 3) * 0.3; tgt.roll = Math.sin(t * 2) * 0.06; }
    dampPose(cur, tgt, lambda, dt);
    applyHumanoid(model, cur);
  };

  // ---------------------------------------------------------------- death: crumble
  let parts = null, boomT = 0;
  e.deathUpdate = (dt) => {
    e.deathT += dt;
    const p = e.object.position;
    rock.on = false; model.thrown.visible = false;
    if (e.deathT < 2.4) {
      e.pose(dt, 1, false);
      model.rig.position.x = Math.sin(e.deathT * 70) * 0.06 * e.deathT;
      boomT -= dt;
      if (boomT <= 0) {
        boomT = rand(0.25, 0.4);
        pick(model.floaters).mesh.getWorldPosition(_v);
        vfx.debris?.(_v, { owner: 'enemy', count: 4, size: 0.45, speed: 6, material: 'rock' });
        smoke(_v, 4);
        shakeAt(p, 0.25);
      }
      return false;
    }
    if (!parts) {
      parts = [];
      model.coreGroup.getWorldPosition(_v);
      vfx.preset?.('explosion_earth', _v, { owner: 'enemy', scale: 1.6 });
      vfx.shockwave?.(_v.set(p.x, groundY + 0.3, p.z), { owner: 'enemy', color: 0xb8a582, radius: 14, duration: 1.0, opacity: 0.5 });
      vfx.shake?.(1);
      ctx.audio('explode_earth', { position: p, volume: 1.2, pitch: 0.5 });
      ctx.audio('shatter', { position: p, volume: 1 });
      const mat = model.skin?.meshes?.rock?.material;
      model.root.updateMatrixWorld(true);
      for (const rp of model.rockParts || []) {
        const m = new THREE.Mesh(rp.geo, mat);
        rp.bone.matrixWorld.decompose(m.position, m.quaternion, m.scale);
        _v.copy(m.position);
        game.scene.add(m);
        _v2.subVectors(_v, p).setY(0).normalize();
        parts.push({ m, v: new THREE.Vector3(_v2.x * rand(2, 6), rand(3, 9), _v2.z * rand(2, 6)), w: new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)), rest: false });
      }
      model.root.visible = false;
      ctx.dissolveFx(e, 2);
      ctx.loot.drop(e, 14, 3);
    }
    const t2 = e.deathT - 2.4;
    for (const pt of parts) {
      if (!pt.rest) {
        pt.v.y -= 22 * dt;
        pt.m.position.addScaledVector(pt.v, dt);
        pt.m.rotation.x += pt.w.x * dt; pt.m.rotation.z += pt.w.z * dt;
        const gh = world.getHeight(pt.m.position.x, pt.m.position.z) + 0.3;
        if (pt.m.position.y < gh) {
          pt.m.position.y = gh;
          if (pt.v.y < -6) { pt.v.y *= -0.3; pt.v.x *= 0.5; pt.v.z *= 0.5; pt.w.multiplyScalar(0.5); }
          else pt.rest = true;
        }
      }
      if (t2 > 4) { const s = Math.max(0.001, 1 - (t2 - 4) / 1.5); pt.m.scale.setScalar(s); pt.m.position.y -= dt * 0.4; }
    }
    if (t2 > 5.5) { for (const pt of parts) pt.m.removeFromParent(); model.dispose(); return true; }
    return false;
  };

  finishBoss(ctx, e, {
    type: 'golem', preview: previewGolem,
    debugAttack: (id) => {
      const a = String(id).replace(/^golem\./, '');
      if (['emerge', 'roar', 'phase2'].includes(e.state)) { e.invulnerable = false; e.object.position.y = groundY; e.noPhysics = false; }
      stopAttacks(e); h = null; wave.on = false;
      e.setState('chase');
      return start(a);
    },
    onBroken: (dur) => { h = null; wave.on = false; staggerLen = dur; e.setState('stagger'); model.setCage(1); e._cageT = dur; },
  });
  // the enemies module (mobs) assigns e.spawnPayload after this factory returns: keep the brief on whatever it sets
  let payloadFn = e.spawnPayload || null;
  Object.defineProperty(e, 'spawnPayload', {
    configurable: true,
    get() { return payloadFn ? () => { const o = payloadFn(); if (o && !o.brief) o.brief = e.brief.slice(); return o; } : null; },
    set(fn) { payloadFn = fn; },
  });
  try { game.render?.warm?.(model.root); } catch (_) { /* */ }
  return e;
}
