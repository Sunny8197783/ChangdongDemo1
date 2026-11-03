// 타락 늑대 (wolf) — void-touched pack hunter. Packs of 3 circle the target at 6 m (each wolf holds its own slot angle),
// then dart in one at a time for a telegraphed lunge bite and spring back out. Void element. CONTRACT §14.
import * as THREE from 'three';
import { rand, clamp, damp } from '../core/utils.js';
import { buildWolf } from './models2.js';
import { makeEnemy, faceTo, moveTo, moveForward, isReacting } from './base.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const CIRCLE_R = 6.2;

export function createWolf(ctx, pos, opts = {}) {
  const model = buildWolf();
  model.lieY = 0.25;
  const e = makeEnemy(ctx, {
    kind: 'wolf', model, name: '타락 늑대', hp: 110, radius: 0.55, height: 1.1, mass: 0.85,
    camp: opts.camp, facing: opts.facing, staggerDmg: 26, sight: 26, chaseState: 'circle', resist: { shadow: 0.6, light: 1.25 },
  }, pos);
  e.element = 'void'; e.isVoid = true;
  e.pack = opts.pack ?? null; e.packSlot = opts.packSlot ?? Math.floor(rand(0, 3));
  e.dissolveColor = 0xb36bff;
  const game = ctx.game;
  let gait = rand(0, 6), speed = 0, dartCd = rand(1.5, 3) + e.packSlot * 0.9, slotA = e.packSlot * 2.09 + rand(-0.3, 0.3), hitDone = false;
  let jaw = 0, howlT = 0, tele = null, lean = 0, bodyPitch = 0;
  const stopTele = () => { tele?.stop?.(); tele = null; };
  e.interrupt = () => { hitDone = true; stopTele(); };
  e.onResume = () => { dartCd = Math.max(dartCd, 1.0); };
  e.die = () => stopTele();

  function voidWisps(s = 1) {
    model.rig.getWorldPosition(_v);
    game.vfx.burst(_v, { count: Math.round(10 * s), color: [0xb36bff, 0x2a1440], speed: 1.6, spread: 1, size: 0.3, sizeEnd: 0.7, life: 0.8, shape: 'wisp', additive: false, drag: 2, gravity: -1 });
  }

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    dartCd -= dt;
    switch (e.state) {
      case 'idle':
        if (Math.random() < dt * 0.05) { e.setState('sniff'); }
        break;
      case 'sniff':
        if (e.stateT > 2.5) e.setState('idle');
        break;
      case 'alert':
        faceTo(e, pp.x, pp.z, 10, dt);
        if (e.stateT < 0.02) { howlT = 1.1; ctx.audio('wolf_howl', { position: p, volume: 0.6, pitch: 1 + e.packSlot * 0.08 }); voidWisps(0.8); }
        if (e.stateT > 1.0) e.setState('circle');
        break;
      case 'circle': {
        if (!e.aggro) { e.setState('return'); break; }
        // orbit the target on this wolf's slot, drifting slowly so the pack wheels around
        slotA += dt * 0.45 * (e.packSlot % 2 ? 1 : -1);
        const tx = pp.x + Math.sin(slotA) * CIRCLE_R, tz = pp.z + Math.cos(slotA) * CIRCLE_R;
        const rem = moveTo(e, tx, tz, (d > 12 ? 7.5 : 4.8) * sm, 0.4);
        if (rem > 1.5) faceTo(e, tx, tz, 8, dt); else faceTo(e, pp.x, pp.z, 6, dt);
        if (dartCd <= 0 && d < 9 && rem < 3) {
          if (ctx.takeToken(e)) {
            e.setState('crouch'); game.events.emit('enemyAttack', { enemy: e, kind: 'bite' });
            _d.set(pp.x - p.x, 0, pp.z - p.z).normalize();
            tele = ctx.tele({ shape: 'line', pos: p, dir: _d, len: Math.min(9, d + 1), width: 1.3, dur: 0.55, color: 'void' });
          } else dartCd = rand(0.6, 1.2);
        }
        break;
      }
      case 'crouch':
        faceTo(e, pp.x, pp.z, 9, dt);
        if (e.stateT < 0.35) { _d.set(Math.sin(e.facing), 0, Math.cos(e.facing)); tele?.setDir?.(_d); tele?.setPos?.(p); }
        if (e.stateT > 0.55 / Math.max(0.5, sm)) { e.setState('dart'); hitDone = false; ctx.audio('blink', { position: p, volume: 0.3, pitch: 1.3 }); }
        break;
      case 'dart':
        moveForward(e, 13 * sm);
        jaw = 1;
        if (!hitDone && ctx.meleeCheck(e, 1.4, 0.8)) {
          hitDone = true; ctx.hitPlayer(e, { amount: 11, element: 'void', knockback: 5, status: { blight: 1.5 } });
          voidWisps(0.6);
        }
        if (e.stateT > 0.42 || (hitDone && e.stateT > 0.2)) { stopTele(); e.setState('retreat'); }
        break;
      case 'retreat':
        _v.set(p.x - pp.x, 0, p.z - pp.z).normalize();
        e.move.set(_v.x * 6 * sm, 0, _v.z * 6 * sm);
        faceTo(e, pp.x, pp.z, 6, dt);
        if (e.stateT > 0.6) { ctx.releaseToken(e); dartCd = rand(2.6, 4.2); slotA = Math.atan2(p.x - pp.x, p.z - pp.z); e.setState('circle'); }
        break;
      case 'return':
        faceTo(e, e.home.x, e.home.z, 6, dt);
        if (moveTo(e, e.home.x, e.home.z, 4.5 * sm, 0.8) < 1) e.setState('idle');
        break;
    }
    speed = Math.hypot(e.move.x, e.move.z);
  };

  // quadruped pose: trot/gallop gait (diagonal pairs), body pitch on accel, jaw, tail, howl
  e.pose = (dt, sm, stunned) => {
    const t = game.time + e.id.length;
    const st = e.state;
    gait += dt * (2 + speed * 1.6);
    jaw = Math.max(0, jaw - dt * 3);
    if (howlT > 0) howlT -= dt;
    const run = clamp(speed / 7, 0, 1), amt = clamp(speed / 3, 0, 1);
    const L = model.legs;
    let crouch = 0, headX = 0, headY = 0;
    if (st === 'crouch') crouch = clamp(e.stateT / 0.3, 0, 1);
    if (st === 'sniff') { headX = 0.5 + Math.sin(t * 6) * 0.08; headY = Math.sin(t * 1.3) * 0.5; }
    if (howlT > 0) { headX = -0.9 * Math.sin(Math.min(1, (1.1 - howlT) / 0.3) * Math.PI * 0.5); jaw = 0.8; }
    const react = isReacting(e);
    for (let i = 0; i < 4; i++) {
      // diagonal pairs (FL+BR, FR+BL); gallop brings the front pair together
      const ph = gait + (i === 0 || i === 3 ? 0 : Math.PI) + (run > 0.6 && i < 2 ? -0.6 : 0);
      const sw = Math.sin(ph) * (0.55 + run * 0.35) * amt;
      const lift = Math.max(0, Math.cos(ph)) * 0.9 * amt;
      L[i].up.rotation.x = sw - crouch * (i < 2 ? -0.5 : 0.9);
      L[i].low.rotation.x = (i < 2 ? -lift : lift) * 0.8 + crouch * (i < 2 ? -0.6 : 1.1);
    }
    let pitchT = run * 0.08 - crouch * 0.12, roll = 0, hipY = 0.62 - crouch * 0.2 - Math.abs(Math.sin(gait)) * 0.04 * amt;
    if (st === 'dart') pitchT = 0.18;
    if (react) { pitchT = -0.3; roll = Math.sin(t * 10) * 0.1; }
    if (stunned) { roll = Math.sin(t * 3) * 0.2; headY = Math.sin(t * 4) * 0.4; }
    if (st === 'dead') { roll = 1.4; hipY = 0.3; }
    bodyPitch = damp(bodyPitch, pitchT, 10, dt);
    lean = damp(lean, clamp(-e.flZ.x * 0.1, -0.3, 0.3), 8, dt);
    const rig = model.rig;
    rig.position.set(0, hipY, 0);
    rig.rotation.set(bodyPitch, 0, roll + lean);
    model.neck.rotation.set(headX - bodyPitch * 0.8 + (e.aggro ? 0.12 : 0) + Math.sin(gait * 2) * 0.05 * amt, headY, 0);
    model.jaw.rotation.x = 0.1 + jaw * 0.55 + (e.aggro && st !== 'dart' ? Math.max(0, Math.sin(t * 7)) * 0.08 : 0);   // snarl
    const wag = Math.sin(t * (e.aggro ? 4 : 2)) * (e.aggro ? 0.15 : 0.35);
    model.tail1.rotation.set(e.aggro ? -0.1 : 0.35 - run * 0.4, wag, 0);
    model.tail2.rotation.set(0.15, wag * 1.4, 0);
  };
  return e;
}
