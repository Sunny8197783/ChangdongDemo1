// 수렁도마뱀 (lizard) — Mirwen spear-lizard. Wades through the lake (amphibious), lurks half-submerged, telegraphed spear
// thrust (line decal = hitbox), and a lunge out of the water. Resists water ×0.5. CONTRACT §14.
import * as THREE from 'three';
import { rand, clamp } from '../core/utils.js';
import { buildLizard } from './models2.js';
import { makeEnemy, faceTo, moveTo, moveForward, angleToPlayer, newPose, dampPose, applyHumanoid, walkCycle, reactionPose,
  modelFor, beginAttack, liveAttack, attackPhase, windupK, punishAfter, attackMeta, rhythmDamp, copyPose, shapeHit } from './base.js';
import { typeName } from './codex.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const M_THRUST = attackMeta('lizard.thrust'), M_LUNGE = attackMeta('lizard.lunge');
const LUNGE_W = 1.6;
const HIP = 0.86;
const BASE = newPose(HIP);
const THRUST_LEN = 3.6, THRUST_W = 1.2;

export function createLizard(ctx, pos, opts = {}) {
  const model = modelFor(ctx, 'lizard', {}, buildLizard);
  model.lieY = 0.3;
  const e = makeEnemy(ctx, {
    kind: 'lizard', model, name: typeName('lizard'), hp: 160, radius: 0.55, height: 1.9, mass: 1.15,
    camp: opts.camp, facing: opts.facing, staggerDmg: 36, sight: 22, poiseMax: 0, resist: { water: 0.5 },
  }, pos);
  e.amphibious = true;
  e.element = 'water';
  const game = ctx.game, W = game.world;
  const cur = newPose(HIP), tgt = newPose(HIP);
  const wanderV = new THREE.Vector3();
  let phase = rand(0, 6), speed = 0, attackCd = rand(0.8, 1.6), lungeCd = rand(2, 4), strafeDir = 1, hitDone = false, tele = null;
  let wanderT = rand(2, 5), wander = null, submerge = 0, splashT = 0;
  const wet = () => (W.waterDepth ? W.waterDepth(e.object.position.x, e.object.position.z) : 0);
  const stopTele = () => { tele?.stop?.(); tele = null; };
  let H = null, recoverDur = 0.7, wetNow = false;
  const lunEnd = new THREE.Vector3(), lunStart = new THREE.Vector3(), lunDir = new THREE.Vector3();
  const thrustShape = { kind: 'line', len: THRUST_LEN, width: THRUST_W, dir: lunDir, follow: true };
  const lungeShape = { kind: 'capsule', width: LUNGE_W, pos: lunStart, end: lunEnd };
  const faceDir = () => lunDir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
  function startThrust(force) {
    if (!force && !ctx.takeToken(e)) return false;
    faceDir();
    H = beginAttack(ctx, e, 'lizard.thrust', thrustShape);
    if (!H) { ctx.releaseToken(e); return false; }
    e.setState('thrustWind'); hitDone = false; return true;
  }
  function lungeAim() {
    const pp = ctx.playerPos, p = e.object.position;
    _v.set(pp.x - p.x, 0, pp.z - p.z); const len = Math.max(0.5, _v.length() - 1.2); _v.normalize();
    lunStart.copy(p); lunEnd.set(p.x + _v.x * len, 0, p.z + _v.z * len); lunEnd.y = ctx.groundH(lunEnd.x, lunEnd.z);
  }
  function startLunge(force) {
    if (!force && !ctx.takeToken(e)) return false;
    lungeAim();
    H = beginAttack(ctx, e, 'lizard.lunge', lungeShape);
    if (!H) { ctx.releaseToken(e); return false; }
    e.setState('lungePrep'); hitDone = false; return true;
  }
  e.attackStarters['lizard.thrust'] = startThrust;
  e.attackStarters['lizard.lunge'] = startLunge;
  e.interrupt = () => { hitDone = true; stopTele(); H = null; e.leaping = false; };
  // §4.4: ice freezes it while it stands in water (2 s)
  e.react = (result, hit) => {
    if (hit?.element === 'ice' && wetNow && !e.statuses?.frozen && !e.ptArmor) { try { game.combat.applyStatus?.(e, 'frozen', 2); } catch (_) { /* */ } }
  };
  e.onResume = () => { attackCd = Math.max(attackCd, 0.6); };
  e.armor = () => (e.state === 'thrustWind' && attackPhase(H) === 2) || e.state === 'thrust' || e.state === 'lunge';
  e.die = () => stopTele();

  function splash(s = 1) {
    const p = e.object.position;
    _v.set(p.x, (W.waterLevel ?? 1.5) + 0.05, p.z);
    game.vfx.burst(_v, { owner: 'enemy', count: Math.round(16 * s), color: [0xd8f4ff, 0x6fc8ff], speed: 4 * s, spread: 0.5, dir: _d.set(0, 1, 0), size: 0.18, sizeEnd: 0.04, life: 0.6, gravity: 12, shape: 'droplet' });
    game.vfx.shockwave?.(_v, { owner: 'enemy', color: 0xbfe8ff, radius: 1.8 * s, duration: 0.45, opacity: 0.6 });
    ctx.audio('splash', { position: _v, volume: 0.45 * s });
  }

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    attackCd -= dt; lungeCd -= dt;
    const depth = wet();
    // weak to lightning ×1.5 while wet (always wet in water), ×1 otherwise; out of water it moves −30 %
    wetNow = depth > 0.3 || !!e.statuses?.wet;
    e.resist.lightning = wetNow ? 1.5 : 1;
    if (depth <= 0.3) sm *= 0.7;
    submerge = clamp(submerge + ((e.state === 'idle' && depth > 0.5) ? dt : -dt * 3), 0, 1);
    switch (e.state) {
      case 'idle':
        wanderT -= dt;
        if (wanderT <= 0) { wanderT = rand(3, 6); wander = wander ? null : wanderV.set(e.home.x + rand(-5, 5), 0, e.home.z + rand(-5, 5)); }
        if (wander) { faceTo(e, wander.x, wander.z, 3, dt); if (moveTo(e, wander.x, wander.z, 1.3 * sm, 0.6) < 0.7) wander = null; }
        if (depth > 0.5) { splashT -= dt; if (splashT <= 0) { splashT = rand(1.5, 3); game.vfx.burst(_v.set(p.x, (W.waterLevel ?? 1.5) + 0.05, p.z), { owner: 'enemy', count: 3, color: [0xf3ecdf, 0x9fdfff], speed: 0.6, spread: 0.4, dir: _d.set(0, 1, 0), size: 0.14, sizeEnd: 0.3, life: 0.8, shape: 'bubble' }); } }
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
          if (!startThrust(false)) { attackCd = 0.4; strafeDir = Math.random() < 0.5 ? 1 : -1; e.setState('strafe'); }
        } else if (d > 5.5 && d < 11 && lungeCd <= 0 && attackCd <= 0) {
          if (!startLunge(false)) lungeCd = 1.2;
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
        // the decal follows the spear line until the lock (−0.40 s); the frill flares through the windup
        if (!H || (!H.alive && !H.struck)) { H = null; ctx.releaseToken(e); e.setState('chase'); break; }
        if (!H.locked) { faceTo(e, pp.x, pp.z, 5, dt); H.setDir(faceDir()); }
        if (H.consumeStrike()) {
          if (H.contains(pp) && Math.abs(pp.y - p.y) < 2.4) ctx.hitPlayer(e, { amount: 15, knockback: 7, element: 'physical', attack: M_THRUST });
          ctx.audio('blink', { position: p, volume: 0.35, pitch: 0.7 });
          H = null; e.setState('thrust');
        }
        break;
      case 'thrust':
        if (e.stateT < 0.08) moveForward(e, 4 * sm);
        if (e.stateT > 0.12) { recoverDur = punishAfter(ctx, e, 'lizard.thrust') || 0.7; e.setState('recover'); }
        break;
      case 'lungePrep':
        if (!H || (!H.alive && !H.struck)) { H = null; ctx.releaseToken(e); e.setState('chase'); break; }
        if (!H.locked) { faceTo(e, pp.x, pp.z, 7, dt); lungeAim(); H.setPos(lunStart); H.setEnd(lunEnd); }
        if (H.consumeStrike()) {
          // launch along the drawn capsule; hits only along it (body contact inside the capsule)
          const T = 0.55;
          _v.set(lunEnd.x - p.x, 0, lunEnd.z - p.z); const len = _v.length(); if (len > 1e-3) _v.multiplyScalar(1 / len);
          e.velocity.set(_v.x * len / T, 22 * T / 2, _v.z * len / T);
          e.grounded = false; e.leaping = true; hitDone = false; H = null;
          if (depth > 0.3) splash(1.2);
          e.setState('lunge');
          ctx.audio('jump', { position: p, volume: 0.5, pitch: 0.8 });
        }
        break;
      case 'lunge':
        if (!hitDone && d < e.radius + 1.1 && Math.abs(pp.y - p.y) < 1.6 && shapeHit(ctx, lungeShape, pp)) { hitDone = true; ctx.hitPlayer(e, { amount: 18, knockback: 10, launch: 3, attack: M_LUNGE }); }
        if (e.grounded && e.stateT > 0.1) {
          e.leaping = false; stopTele(); ctx.dust(p, 0.8); if (wet() > 0.3) splash(1);
          lungeCd = rand(5, 8); recoverDur = punishAfter(ctx, e, 'lizard.lunge') || 0.6; e.setState('recover'); e._prone = true;
        }
        break;
      case 'recover':
        if (e.stateT > recoverDur) { e._prone = false; ctx.releaseToken(e); attackCd = rand(1.0, 2.0); e.setState('chase'); }
        break;
      case 'return':
        faceTo(e, e.home.x, e.home.z, 5, dt);
        if (moveTo(e, e.home.x, e.home.z, 3 * sm, 0.8) < 1) e.setState('idle');
        break;
    }
    speed = Math.sqrt(e.move.x * e.move.x + e.move.z * e.move.z);
  };

  e.pose = (dt, sm, stunned) => {
    copyPose(tgt, BASE);
    const AH = liveAttack(e), ph = attackPhase(AH), holding = ph === 1;
    const t = game.time + e.id.length;
    let lambda = 12, rl = 0;
    phase += dt * (1.2 + speed * 2.2);
    const st = e.state;
    if (st === 'dead') { tgt.aRz = -1.3; tgt.aLz = 1.3; tgt.headX = -0.4; tgt.lRx = -0.5; tgt.kR = 0.4; lambda = 8; }
    else if ((rl = reactionPose(e, tgt, HIP, t, model.lieY))) lambda = rl;
    else if (stunned) { tgt.headY = Math.sin(t * 5) * 0.4; tgt.roll = Math.sin(t * 2.5) * 0.12; tgt.pitch = 0.25; tgt.kR = tgt.kL = 0.4; tgt.hipY = HIP - 0.1; }
    else if (st === 'thrustWind' && ph === 2) {
      tgt.aRx = -1.55; tgt.fRx = 0; tgt.aRz = -0.05; tgt.spineY = -0.45; tgt.pitch = 0.4; tgt.aLx = 0.4;
      tgt.lRx = -0.4; tgt.lLx = 0.7; tgt.kR = 0.6; tgt.kL = 0.1; tgt.hipY = HIP - 0.16; lambda = 40;
    } else if (st === 'thrustWind') {
      const k = windupK(AH);
      tgt.aRx = -1.4 * k - 0.2; tgt.fRx = -1.6 * k; tgt.aRz = -0.25; tgt.spineY = 0.6 * k; tgt.pitch = -0.12 * k;
      tgt.aLx = -1.2; tgt.aLz = 0.5; tgt.fLx = -0.8; tgt.lRx = 0.5; tgt.lLx = -0.55; tgt.kL = 0.6; tgt.kR = 0.25; tgt.hipY = HIP - 0.12 * k;
      tgt.roll = Math.sin(t * 55) * 0.02 * k; lambda = 13;
    } else if (st === 'thrust') {
      tgt.aRx = -1.55; tgt.fRx = 0; tgt.aRz = -0.05; tgt.spineY = -0.45; tgt.pitch = 0.4; tgt.aLx = 0.4;
      tgt.lRx = -0.4; tgt.lLx = 0.7; tgt.kR = 0.6; tgt.kL = 0.1; tgt.hipY = HIP - 0.16; lambda = 32;
    } else if (st === 'recover' && e._prone) { tgt.pitch = 1.0; tgt.hipY = HIP - 0.45; tgt.aRx = -0.6; tgt.aLx = -0.6; tgt.kR = tgt.kL = 1.0; tgt.lRx = tgt.lLx = -0.8; tgt.headX = 0.4; lambda = 9; }
    else if (st === 'recover') { tgt.aRx = -1.45; tgt.fRx = -0.05; tgt.pitch = 0.45; tgt.spineX = 0.25; tgt.lLx = 0.5; tgt.kL = 0.5; tgt.kR = 0.4; tgt.headX = 0.35; tgt.hipY = HIP - 0.15; lambda = 7; }   // spear stuck
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
    rhythmDamp(cur, tgt, lambda, dt, holding);
    applyHumanoid(model, cur);
    if (holding) return;
    // tail sway (counter to the stride) + droop when hurt
    const sway = Math.sin(phase * 0.5) * (0.25 + speed * 0.05);
    model.tail1.rotation.set(-0.25 + (e.hurt * 0.3), sway, 0);
    model.tail2.rotation.set(0.2, sway * 1.4 + Math.sin(t * 3) * 0.1, 0);
  };
  return e;
}
