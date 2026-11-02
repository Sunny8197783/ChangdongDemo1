// 고대 바위 골렘 — boss. Floating boulders bound by a glowing crystal core.
// Entrance rise + roar, ground slam (telegraphed ring), rock throw, sweeping punch, poise stagger,
// phase 2 at 50% (red core, faster, summons chuchus), crumbling death.
import * as THREE from 'three';
import { rand, clamp, damp, pick } from '../core/utils.js';
import { buildGolem } from './models.js';
import { makeEnemy, faceTo, moveForward, angleToPlayer, newPose, dampPose, applyHumanoid } from './base.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const HIP = 2.62;
const BASE = newPose(HIP);
const C1 = { col: 0x6fdcff, em: 0x2fb8ff, glow: 0x5fd0ff };
const C2 = { col: 0xff6a4a, em: 0xff2a10, glow: 0xff5a3a };

export function createGolem(ctx, pos, opts = {}) {
  const model = opts.model || buildGolem();
  const e = makeEnemy(ctx, {
    kind: 'golem', model, name: '고대 바위 골렘', hp: 2200, radius: 2.1, height: 6, mass: 4, isBoss: true,
    resist: { earth: 0.5 }, noTumble: true, facing: opts.facing ?? 0, staggerDmg: 1e9,
  }, pos);
  const game = ctx.game, vfx = game.vfx, world = game.world;
  const arena = world.bossArena || { position: pos.clone(), radius: 24 };
  e.aggro = true; e.friction = 10;
  e.invulnerable = true;
  const cur = newPose(HIP), tgt = newPose(HIP);
  let phase2 = false, mul = 1, cd = 2, lastAtk = '', phase = 0, lastStep = 0, speed = 0, poise = 0, poiseCd = 0, hitDone = false;
  let coreFlash = 0, debrisT = 0, slamCenter = new THREE.Vector3(), throwTarget = new THREE.Vector3(), summonDone = false;
  const groundY = pos.y;
  e.object.position.y = groundY - 7.5;
  e.noPhysics = true;
  e.setState('emerge');

  const setCore = (C) => {
    model.crystalMat.color.setHex(C.col); model.crystalMat.emissive.setHex(C.em);
    for (const g of model.glows) g.material.color.setHex(C.glow);
    model.eyeMat.emissive.setHex(C === C2 ? 0xff6a3a : 0x6fe0ff); model.eyeMat.color.setHex(C === C2 ? 0xffb090 : 0xaef4ff);
  };

  function shakeAt(p, amt) {
    const d = Math.hypot(ctx.playerPos.x - p.x, ctx.playerPos.z - p.z);
    vfx.shake(amt * clamp(1 - d / 45, 0.15, 1));
  }
  function roar() {
    ctx.audio('boss_roar', { position: e.object.position, volume: 1 });
    shakeAt(e.object.position, 0.6);
    model.neck.getWorldPosition(_v);
    vfx.shockwave(_v, { color: phase2 ? 0xff7a4a : 0x9fe8ff, radius: 9, duration: 0.7, vertical: true, opacity: 0.5, thickness: 0.3 });
    vfx.shockwave(_v.set(e.object.position.x, groundY + 0.2, e.object.position.z), { color: 0xe0c090, radius: 12, duration: 0.8, opacity: 0.6 });
    vfx.fovKick?.(6, 0.6);
  }
  function step(foot) {
    foot.getWorldPosition(_v); _v.y = world.getHeight(_v.x, _v.z) + 0.1;
    ctx.audio('golem_step', { position: _v, volume: 1 });
    shakeAt(_v, 0.16);
    vfx.burst(_v, { count: 10, color: [0xcdb48a, 0x9a8a6a], speed: 2.5, spread: 0.5, dir: _v2.set(0, 1, 0), size: 0.6, sizeEnd: 1.3, life: 0.8, shape: 'smoke', drag: 2.5, additive: false });
  }
  function pickAttack(d) {
    const ang = angleToPlayer(ctx, e);
    const opts = [];
    if (d < 8 && ang < 1.0) opts.push('punch', 'punch');
    if (d < 12) opts.push('slam');
    if (d > 7) opts.push('throw');
    if (d > 14) opts.push('throw');
    let a = pick(opts.length ? opts : ['throw']);
    if (a === lastAtk && opts.length > 1 && Math.random() < 0.6) a = pick(opts);
    lastAtk = a;
    return a;
  }

  let staggerLen = 2.4;
  // perfect parry of a punch: the colossus reels for 1.6 s, core exposed
  e.onBossParried = () => {
    if (['emerge', 'roar', 'phase2', 'stagger'].includes(e.state)) return;
    staggerLen = 1.6; e.setState('stagger'); coreFlash = 1;
    ctx.audio('shatter', { position: e.object.position, volume: 0.7, pitch: 0.7 });
  };
  e.react = (result, hit) => {
    coreFlash = 1;
    poise += result?.damage || 0;
    if (!phase2 && e.hp <= e.maxHp * 0.5 && e.state !== 'phase2') {
      phase2 = true; mul = 1.35; e.setState('phase2'); summonDone = false; e.invulnerable = true;
      return;
    }
    if (poise > 280 && poiseCd <= 0 && !['emerge', 'roar', 'phase2', 'stagger'].includes(e.state)) {
      poise = 0; poiseCd = 9; staggerLen = 2.4; e.setState('stagger');
      ctx.audio('shatter', { position: e.object.position, volume: 0.7, pitch: 0.6 });
      model.coreGroup.getWorldPosition(_v);
      vfx.burst(_v, { count: 30, color: [0xffffff, phase2 ? C2.glow : C1.glow], speed: 7, spread: 1, size: 0.2, sizeEnd: 0, life: 0.6, shape: 'shard', gravity: 8 });
    }
  };

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    const k = sm * mul;
    cd -= dt * k; poiseCd -= dt; poise = Math.max(0, poise - dt * 30);
    // keep within arena
    _v.set(p.x - arena.position.x, 0, p.z - arena.position.z);
    const ar = arena.radius - 3;
    if (_v.length() > ar) { _v.setLength(ar); p.x = arena.position.x + _v.x; p.z = arena.position.z + _v.z; }
    const playerHere = ctx.playerAlive && Math.hypot(pp.x - arena.position.x, pp.z - arena.position.z) < arena.radius + 16;

    switch (e.state) {
      case 'emerge': {
        const T = 3.4;
        const t = clamp(e.stateT / T, 0, 1);
        p.y = groundY - 7.5 * (1 - (1 - Math.pow(1 - t, 2.2)));
        debrisT -= dt;
        if (debrisT <= 0 && t < 1) {
          debrisT = 0.22;
          _v.set(p.x + rand(-3, 3), groundY + 0.2, p.z + rand(-3, 3));
          vfx.debris(_v, { count: 6, size: 0.45, speed: 8, life: 2, material: 'rock' });
          vfx.burst(_v, { count: 8, color: [0xcdb48a, 0x8a7a5a], speed: 3, spread: 0.6, dir: _v2.set(0, 1, 0), size: 1, sizeEnd: 2, life: 1.2, shape: 'smoke', additive: false, drag: 2 });
          shakeAt(p, 0.22);
          ctx.audio('golem_step', { position: p, volume: 0.6, pitch: 0.7 });
        }
        if (t >= 1) { p.y = groundY; e.noPhysics = false; e.setState('roar'); roar(); }
        break;
      }
      case 'roar':
        if (e.stateT > 1.8) { e.invulnerable = false; e.setState('chase'); cd = 1; }
        break;
      case 'phase2': {
        if (e.stateT > 0.4 && !summonDone) {
          summonDone = true; setCore(C2); roar();
          model.coreGroup.getWorldPosition(_v);
          vfx.explosion?.(_v, { element: 'fire', scale: 1.4 });
          for (let i = 0; i < 3; i++) {
            const a = e.facing + (i - 1) * 1.2;
            _v.set(p.x + Math.sin(a) * 6, 0, p.z + Math.cos(a) * 6);
            ctx.spawnSummon('chuchu', _v, { variant: pick(['normal', 'fire', 'normal']) });
          }
        }
        if (e.stateT > 2.2) { e.invulnerable = false; e.setState('chase'); cd = 0.8; }
        break;
      }
      case 'wait':
        if (playerHere) { e.setState('chase'); break; }
        faceTo(e, arena.position.x, arena.position.z, 1, dt);
        if (Math.hypot(p.x - arena.position.x, p.z - arena.position.z) > 3) moveForward(e, 1.6);
        break;
      case 'chase': {
        if (!playerHere) { e.setState('wait'); break; }
        faceTo(e, pp.x, pp.z, 1.5 * k, dt);
        if (d > 6.5) moveForward(e, 2.3 * k);
        if (cd <= 0) {
          const a = pickAttack(d);
          game.events.emit('enemyAttack', { enemy: e, kind: a });
          if (a === 'slam') {
            e.setState('slamWind');
            _v.set(Math.sin(e.facing), 0, Math.cos(e.facing));
            slamCenter.set(p.x + _v.x * 3.2, 0, p.z + _v.z * 3.2); slamCenter.y = world.getHeight(slamCenter.x, slamCenter.z);
            ctx.telegraphs.show(slamCenter, 7.5, 1.15 / k, 0xff3a22);
          } else if (a === 'throw') e.setState('throwWind');
          else e.setState('punchWind');
          hitDone = false;
        }
        break;
      }
      case 'slamWind':
        faceTo(e, pp.x, pp.z, 0.4, dt);
        if (e.stateT > 1.15 / k) { e.setState('slam'); }
        break;
      case 'slam':
        if (!hitDone && e.stateT > 0.16) {
          hitDone = true;
          ctx.slam(slamCenter, 7.5, { amount: 30, knockback: 14, launch: 9, element: 'physical', jumpAvoid: true }, e, 1.6);
          vfx.debris(slamCenter, { count: 22, size: 0.6, speed: 12, life: 2.5, material: 'rock' });
          vfx.decal?.(slamCenter, { radius: 6, duration: 7, type: 'crack', color: phase2 ? 0xff6a3a : 0x6fdcff });
          shakeAt(slamCenter, 0.75);
          vfx.fovKick?.(4, 0.35);
          ctx.audio('explode_earth', { position: slamCenter, volume: 1, pitch: 0.7 });
        }
        if (e.stateT > 0.35) { e.setState('recover'); }
        break;
      case 'throwWind': {
        faceTo(e, pp.x, pp.z, 2.2, dt);
        if (e.stateT > 1.0 / k) {
          model.fistR.getWorldPosition(_v);
          _v.y += 1.2;
          // lead the target a little
          const pv = game.player?.entity?.velocity;
          throwTarget.copy(pp);
          if (pv) throwTarget.addScaledVector(pv, 0.3);
          throwTarget.y = world.getHeight(throwTarget.x, throwTarget.z);
          ctx.projectiles.boulder(_v, throwTarget, e, { amount: 22, radius: 3.4, flight: clamp(d / 16, 0.9, 1.6) });
          ctx.audio('cast_earth', { position: p, volume: 0.9, pitch: 0.6 });
          e.setState('throwRel');
        }
        break;
      }
      case 'throwRel':
        if (e.stateT > 0.5) e.setState('recover');
        break;
      case 'punchWind':
        faceTo(e, pp.x, pp.z, 2.5, dt);
        if (e.stateT > 0.8 / k) { e.setState('punch'); ctx.audio('blink', { position: p, volume: 0.8, pitch: 0.35 }); }
        break;
      case 'punch': {
        const t = e.stateT * k;
        if (t < 0.3) moveForward(e, 3.5);
        if (!hitDone && t > 0.1 && t < 0.32 && ctx.meleeCheck(e, 8.5, 1.15)) {
          hitDone = true;
          ctx.hitPlayer(e, { amount: 26, knockback: 17, launch: 5 });
          shakeAt(p, 0.35);
        }
        if (t > 0.18 && t < 0.2) { model.fistR.getWorldPosition(_v); ctx.dust(_v.setY(world.getHeight(_v.x, _v.z)), 1.2); }
        if (t > 0.5) e.setState('recover');
        break;
      }
      case 'recover':
        if (e.stateT > (lastAtk === 'slam' ? 1.3 : 0.75) / k) { cd = rand(1.0, 2.0) / mul; e.setState('chase'); }
        break;
      case 'stagger':
        if (e.stateT > staggerLen) { e.setState('chase'); cd = 0.5; }
        break;
    }
    speed = Math.hypot(e.move.x, e.move.z);
  };

  e.pose = (dt, sm, stunned) => {
    Object.assign(tgt, BASE);
    const t = game.time;
    const k = (sm || 1) * mul;
    let lambda = 6;
    const st = e.state;
    // walking
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
    if (st === 'emerge') {
      tgt.aRx = -2.6; tgt.aLx = -2.6; tgt.aRz = -0.6; tgt.aLz = 0.6; tgt.headX = 0.5; tgt.pitch = 0.3; lambda = 3;
    } else if (st === 'roar' || (st === 'phase2' && e.stateT < 1.8)) {
      tgt.aRz = -1.2; tgt.aLz = 1.2; tgt.aRx = -0.6; tgt.aLx = -0.6; tgt.fRx = -1.2; tgt.fLx = -1.2;
      tgt.headX = -0.45 + Math.sin(t * 40) * 0.03; tgt.pitch = -0.25; tgt.spineX = -0.2; lambda = 5;
    } else if (st === 'slamWind') {
      tgt.aRx = -3.0; tgt.aLx = -3.0; tgt.aRz = 0.25; tgt.aLz = -0.25; tgt.fRx = -0.7; tgt.fLx = -0.7;
      tgt.pitch = -0.3; tgt.spineX = -0.2; tgt.headX = -0.2; tgt.hipY = HIP + 0.15;
      tgt.roll = Math.sin(t * 35) * 0.012; lambda = 4.5 * k;
    } else if (st === 'slam' || (st === 'recover' && lastAtk === 'slam')) {
      tgt.aRx = -1.1; tgt.aLx = -1.1; tgt.aRz = 0.1; tgt.aLz = -0.1; tgt.fRx = -0.6; tgt.fLx = -0.6;
      tgt.pitch = 0.6; tgt.spineX = 0.35; tgt.hipY = HIP - 0.55; tgt.lRx = -0.6; tgt.lLx = -0.6; tgt.kR = tgt.kL = 1.0;
      lambda = st === 'slam' ? 30 : 4;
    } else if (st === 'throwWind') {
      const kk = clamp(e.stateT * k / 0.6, 0, 1);
      tgt.aRx = -2.9 * kk; tgt.aRz = -0.4; tgt.fRx = -1.3 * kk; tgt.spineY = 0.55 * kk; tgt.spineX = -0.2 * kk; tgt.pitch = -0.15;
      tgt.aLx = -1.2; tgt.aLz = 0.6; tgt.lRx = 0.3; tgt.lLx = -0.3; lambda = 6 * k;
    } else if (st === 'throwRel') {
      tgt.aRx = -1.2; tgt.fRx = -0.1; tgt.spineY = -0.5; tgt.pitch = 0.3; tgt.aLx = 0.3; lambda = 18;
    } else if (st === 'punchWind') {
      tgt.aRx = -1.3; tgt.aRz = -1.4; tgt.fRx = -0.9; tgt.spineY = 0.9; tgt.pitch = 0.1; tgt.aLx = -0.6; tgt.aLz = 0.4;
      tgt.hipY = HIP - 0.25; tgt.kR = tgt.kL = 0.5; tgt.lRx = tgt.lLx = -0.3;
      tgt.roll = Math.sin(t * 40) * 0.012; lambda = 6 * k;
    } else if (st === 'punch' || (st === 'recover' && lastAtk === 'punch')) {
      tgt.aRx = -1.5; tgt.aRz = 0.2; tgt.fRx = -0.2; tgt.spineY = -1.0; tgt.pitch = 0.25; tgt.aLx = 0.2; tgt.aLz = 0.5;
      tgt.hipY = HIP - 0.25; tgt.kR = tgt.kL = 0.5; tgt.lRx = tgt.lLx = -0.3;
      lambda = st === 'punch' ? 16 * k : 4;
    } else if (st === 'stagger') {
      tgt.hipY = HIP - 1.0; tgt.pitch = 0.45; tgt.lRx = -1.4; tgt.kR = 2.0; tgt.lLx = 0.2; tgt.kL = 1.5;
      tgt.aRx = -0.4; tgt.aLx = -0.4; tgt.aRz = -0.6; tgt.aLz = 0.6; tgt.fRx = tgt.fLx = -0.2; tgt.headX = 0.5;
      tgt.roll = Math.sin(t * 3) * 0.05; lambda = 5;
    } else if (st === 'dead') {
      tgt.hipY = HIP - 0.8; tgt.pitch = 0.35; tgt.aRz = -0.8; tgt.aLz = 0.8; tgt.headX = 0.6; tgt.kR = tgt.kL = 1.2; tgt.lRx = tgt.lLx = -1.0;
      tgt.roll = Math.sin(t * 25) * 0.03; lambda = 3;
    }
    if (stunned) { tgt.headY = Math.sin(t * 3) * 0.3; tgt.roll = Math.sin(t * 2) * 0.06; }
    dampPose(cur, tgt, lambda, dt);
    applyHumanoid(model, cur);
    // floating boulders + core
    for (let i = 0; i < model.floaters.length; i++) {
      const f = model.floaters[i];
      f.mesh.position.y = f.base.y + Math.sin(t * 1.6 + f.ph) * f.amp;
    }
    coreFlash = Math.max(0, coreFlash - dt * 4);
    const pulse = 0.5 + 0.5 * Math.sin(t * (phase2 ? 7 : 3.5));
    const exposed = st === 'stagger' || st === 'recover' ? 1.2 : 0;
    model.crystalMat.emissiveIntensity = 1.6 + pulse * 0.9 + coreFlash * 3 + exposed;
    const gs = 3.0 + pulse * 0.6 + coreFlash * 1.5 + exposed;
    model.coreGlow.scale.set(gs, gs, 1);
    model.core.rotation.y += dt * (phase2 ? 2.5 : 1);
  };

  // ---------------------------------------------------------------- death: crumble
  let parts = null, boomT = 0;
  e.deathUpdate = (dt) => {
    e.deathT += dt;
    const p = e.object.position;
    if (e.deathT < 2.4) {
      e.pose(dt, 1, false);
      model.rig.position.x = Math.sin(e.deathT * 70) * 0.06 * e.deathT;
      boomT -= dt;
      if (boomT <= 0) {
        boomT = rand(0.18, 0.35);
        const src = pick(model.floaters).mesh;
        src.getWorldPosition(_v);
        vfx.explosion?.(_v, { element: pick(['earth', phase2 ? 'fire' : 'ice', 'lightning']), scale: 0.6 });
        vfx.debris(_v, { count: 6, size: 0.5, speed: 7, material: 'rock' });
        shakeAt(p, 0.25);
      }
      model.crystalMat.emissiveIntensity = 2 + Math.random() * 4;
      return false;
    }
    if (!parts) {
      // detach boulders into free-falling pieces
      parts = [];
      model.coreGroup.getWorldPosition(_v);
      vfx.explosion?.(_v, { element: 'lightning', scale: 2.6 });
      vfx.explosion?.(_v, { element: 'earth', scale: 2.2 });
      vfx.burst(_v, { count: 80, color: [0xffffff, phase2 ? C2.glow : C1.glow], speed: 14, spread: 1, size: 0.3, sizeEnd: 0, life: 1.4, shape: 'shard', gravity: 6 });
      vfx.shockwave(_v.set(p.x, groundY + 0.3, p.z), { color: 0xffffff, radius: 22, duration: 1.1, opacity: 0.8 });
      vfx.flash?.(_v.set(p.x, groundY + 4, p.z), { color: 0xffffff, intensity: 30, distance: 60, duration: 0.8 });
      vfx.screenFlash?.(0xffffff, 0.6, 0.5);
      vfx.shake(1);
      ctx.audio('explode_earth', { position: p, volume: 1.2, pitch: 0.5 });
      ctx.audio('shatter', { position: p, volume: 1 });
      // the live model is one skinned mesh: spawn a free rigid piece per rock part at its bone's world transform
      const mat = model.skin?.meshes?.rock?.material;
      model.root.updateMatrixWorld(true);
      for (const rp of model.rockParts || []) {
        const m = new THREE.Mesh(rp.geo, mat);
        m.castShadow = true;
        rp.bone.matrixWorld.decompose(m.position, m.quaternion, m.scale);
        _v.copy(m.position);
        game.scene.add(m);
        _v2.subVectors(_v, p).setY(0).normalize();
        parts.push({ m, v: new THREE.Vector3(_v2.x * rand(2, 6), rand(3, 9), _v2.z * rand(2, 6)), w: new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)), rest: false });
      }
      model.root.visible = false;
      for (const g of model.glows) g.visible = false;
      ctx.dissolveFx(e, 3);
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
          if (pt.v.y < -6) { pt.v.y *= -0.3; pt.v.x *= 0.5; pt.v.z *= 0.5; pt.w.multiplyScalar(0.5); ctx.dust(pt.m.position, 0.6); }
          else pt.rest = true;
        }
      }
      if (t2 > 4) { const s = Math.max(0.001, 1 - (t2 - 4) / 1.5); pt.m.scale.setScalar(s); pt.m.position.y -= dt * 0.4; }
    }
    if (t2 > 5.5) {
      for (const pt of parts) { pt.m.removeFromParent(); }
      return true;
    }
    return false;
  };
  return e;
}
