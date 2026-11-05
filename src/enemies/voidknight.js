// 공허 기사 (voidknight, elite 420) — guard stance (frontal hits ×0.35 unless heavy/broken), voidShield 100, breakMax 60, poise.
// Moves: 3-hit combo (cone telegraphs), overhead void slam (circle, parryable: gold rim + glint), shield bash on guarded hits.
import * as THREE from 'three';
import { rand, clamp } from '../core/utils.js';
import { buildVoidKnight } from './models2.js';
import { makeEnemy, faceTo, moveTo, moveForward, angleToPlayer, newPose, dampPose, applyHumanoid, walkCycle, reactionPose,
  modelFor, beginAttack, liveAttack, attackPhase, windupK, punishAfter, attackMeta, rhythmDamp } from './base.js';
import { typeName } from './codex.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const HIP = 1.02;
const BASE = newPose(HIP);
const VOID = 0xb36bff;
// v4 (§4.8): 0.80 / 0.55 / 0.65 s, cones r 3.2 / 3.2 / 3.6, half-angles 1.0 / 0.70 / 1.0 rad; each follow-up decal appears when the previous hit resolves
const COMBO = [{ id: 'voidknight.combo1', amount: 16, range: 3.2, ang: 1.0 }, { id: 'voidknight.combo2', amount: 16, range: 3.2, ang: 0.7 }, { id: 'voidknight.combo3', amount: 24, range: 3.6, ang: 1.0, heavy: true }];
const M_SLAM = attackMeta('voidknight.slam'), M_BASH = attackMeta('voidknight.bash');
const GUARDED_FOR_BASH = 2;

export function createVoidKnight(ctx, pos, opts = {}) {
  const model = modelFor(ctx, 'voidknight', {}, buildVoidKnight);
  model.lieY = 0.35;
  const e = makeEnemy(ctx, {
    kind: 'voidknight', model, name: typeName('voidknight'), hp: 420, radius: 0.75, height: 2.5, mass: 2.4,
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
  let H = null, recoverDur = 0.9, guardedHits = 0, guardedT = 0;
  const atkDir = new THREE.Vector3(), slamPos = new THREE.Vector3();
  const coneShape = { kind: 'cone', r: 3.2, angle: 1.0, dir: atkDir, follow: true };
  const slamShape = { kind: 'circle', r: 2.8, pos: slamPos };
  const bashShape = { kind: 'cone', r: 2.0, angle: 0.52, dir: atkDir, follow: true };
  const faceDir = () => atkDir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
  const setRune = (n) => { try { model.setComboStep?.(n); } catch (_) { /* */ } };
  function startCombo(force) {
    if (!force && !ctx.takeToken(e)) return false;
    step = 0; guard = 0;
    if (!slash(0)) { ctx.releaseToken(e); return false; }
    return true;
  }
  function startSlam(force) {
    if (!force && !ctx.takeToken(e)) return false;
    const p = e.object.position;
    slamPos.set(p.x + Math.sin(e.facing) * 2.6, 0, p.z + Math.cos(e.facing) * 2.6); slamPos.y = ctx.groundH(slamPos.x, slamPos.z);
    H = beginAttack(ctx, e, 'voidknight.slam', slamShape);
    if (!H) { ctx.releaseToken(e); return false; }
    e.setState('slamWind'); guard = 0; e.parryDur = 2.0; return true;
  }
  function startBash() {
    faceDir();
    H = beginAttack(ctx, e, 'voidknight.bash', bashShape);
    if (!H) return false;
    e.setState('bash'); hitDone = false; guardedHits = 0; return true;
  }
  e.attackStarters['voidknight.combo1'] = startCombo;
  e.attackStarters['voidknight.combo2'] = (f) => { if (!startCombo(f)) return false; H?.stop?.(); return slash(1); };
  e.attackStarters['voidknight.combo3'] = (f) => { if (!startCombo(f)) return false; H?.stop?.(); return slash(2); };
  e.attackStarters['voidknight.slam'] = startSlam;
  e.attackStarters['voidknight.bash'] = () => startBash();
  e.interrupt = () => { hitDone = true; stopTele(); step = 0; H = null; setRune(0); e.parryDur = 1.6; };
  e.onResume = () => { attackCd = Math.max(attackCd, 0.8); };
  e.armor = () => (e.state === 'slashWind' && attackPhase(H) === 2) || e.state === 'slam';
  e.die = () => stopTele();
  e.onBreak = () => { stopTele(); e.setState('stagger'); e.reactDur = 2.0; guard = 0; };

  // guard stance: frontal non-heavy hits are deflected (the block result goes through combat's onBeforeDamage hook)
  e.onBeforeDamage = (hit) => {
    if (guard < 0.6 || e.statuses?.broken || e.state === 'stagger') return null;
    if (hit?.heavy || hit?.charged || hit?.finisher || hit?.tier === 'ult' || hit?.isDot) return null;
    const p = e.object.position;
    const src = hit?.source?.object?.position || hit?.point || ctx.playerPos;
    let a = Math.atan2(src.x - p.x, src.z - p.z) - e.facing; a = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(a) > 2.1) return { mul: 1.5 };      // §4.8: back ×1.5
    if (Math.abs(a) > 1.1) return null;
    _v.copy(model.shield.getWorldPosition(_v));
    game.vfx.burst(_v, { owner: 'enemy', count: 10, color: [0xe6c8ff, VOID], speed: 4, spread: 0.6, size: 0.12, sizeEnd: 0, life: 0.3, shape: 'spark', drag: 3 });
    ctx.audio('block_hit', { position: p, volume: 0.5, pitch: 0.7 });
    // §4.8: the bash only after 2 consecutive guarded hits (0.55 s visible shield raise; knockback only)
    guardedHits = guardedT > 0 ? guardedHits + 1 : 1; guardedT = 1.5;
    if (guardedHits >= GUARDED_FOR_BASH && bashCd <= 0 && e.distP < 3 && e.state === 'guard') { bashCd = 3; startBash(); }
    return { mul: 0.35 };
  };

  function slash(i) {
    const c = COMBO[i];
    step = i; faceDir(); coneShape.r = c.range; coneShape.angle = c.ang;
    H = beginAttack(ctx, e, c.id, coneShape);
    if (!H) return false;
    setRune(i + 1);
    e.setState('slashWind'); hitDone = false;
    return true;
  }

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    attackCd -= dt; slamCd -= dt; bashCd -= dt; guardedT -= dt;
    switch (e.state) {
      case 'idle': guard = Math.max(0, guard - dt); break;
      case 'alert':
        faceTo(e, pp.x, pp.z, 6, dt);
        if (e.stateT < 0.02) { model.weapon.getWorldPosition(_v); game.vfx.burst(_v, { owner: 'enemy', count: 18, color: [0xe6c8ff, VOID], speed: 3, spread: 1, size: 0.16, sizeEnd: 0, life: 0.6, shape: 'wisp' }); }
        if (e.stateT > 0.9) e.setState('guard');
        break;
      case 'guard': {
        // advance behind the shield
        if (!e.aggro) { e.setState('return'); break; }
        guard = Math.min(1, guard + dt * 4);
        faceTo(e, pp.x, pp.z, 4.5, dt);
        if (d > 2.8) moveForward(e, (d > 8 ? 3.0 : 1.9) * sm);
        if (slamCd <= 0 && d < 7 && d > 2) { if (!startSlam(false)) slamCd = 1; }
        else if (d < 3.3 && attackCd <= 0 && angleToPlayer(ctx, e) < 0.7) { if (!startCombo(false)) attackCd = 0.5; }
        break;
      }
      case 'slashWind': {
        const c = COMBO[step];
        if (!H || (!H.alive && !H.struck)) { H = null; setRune(0); ctx.releaseToken(e); e.setState('guard'); break; }
        if (!H.locked) { faceTo(e, pp.x, pp.z, 4, dt); H.setDir(faceDir()); }
        if (attackPhase(H) === 2) moveForward(e, 3 * sm);
        if (H.consumeStrike()) {
          if (H.contains(pp) && Math.abs(pp.y - p.y) < 2.6) ctx.hitPlayer(e, { amount: c.amount, element: 'void', knockback: c.heavy ? 11 : 6, launch: c.heavy ? 3 : 0, attack: attackMeta(c.id) });
          ctx.audio('swing', { position: p, volume: 0.5, pitch: 0.7 });
          H = null;
          // the next decal appears only now (one by one); after hit 3 → 1.0 s recovery (punish ×1.25)
          if (step < COMBO.length - 1 && d < 5) { if (!slash(step + 1)) { recoverDur = 0.6; setRune(0); e.setState('recover'); } }
          else if (step === COMBO.length - 1) { recoverDur = punishAfter(ctx, e, c.id) || 1.0; setRune(0); e.setState('recover'); }
          else { recoverDur = 0.6; setRune(0); e.setState('recover'); }
        }
        break;
      }
      case 'slamWind':
        if (!H || (!H.alive && !H.struck)) { H = null; ctx.releaseToken(e); e.parryDur = 1.6; e.setState('guard'); break; }
        if (H.consumeStrike()) {
          e.setState('slam');
          ctx.slam(slamPos, 2.8, { amount: 26, element: 'void', knockback: 12, launch: 5, handle: H, attack: M_SLAM }, e, 1.2);
          game.vfx.preset?.('explosion_shadow', slamPos, { owner: 'enemy', scale: 0.8 });
          game.vfx.groundDecal?.('violet', slamPos, 2.6, 7);
          H = null;
        }
        break;
      case 'slam':
        if (e.stateT > 0.9) { slamCd = rand(6, 9); e.parryDur = 1.6; recoverDur = 0.9; e.setState('recover'); }
        break;
      case 'bash':
        if (!H || (!H.alive && !H.struck)) { H = null; e.setState('guard'); break; }
        if (!H.locked) { faceTo(e, pp.x, pp.z, 8, dt); H.setDir(faceDir()); }
        if (attackPhase(H) === 2) moveForward(e, 6 * sm);
        if (H.consumeStrike()) {
          // knockback only (no stun)
          if (H.contains(pp) && Math.abs(pp.y - p.y) < 2.4) ctx.hitPlayer(e, { amount: 10, knockback: 14, attack: M_BASH });
          H = null; e.setState('bashEnd');
        }
        break;
      case 'bashEnd':
        if (e.stateT > 0.3) e.setState('guard');
        break;
      case 'recover':
        if (e.stateT > recoverDur) { ctx.releaseToken(e); attackCd = rand(1.4, 2.4); step = 0; e.setState('guard'); }
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
    const AH = liveAttack(e), ph = attackPhase(AH), holding = ph === 1;
    const t = game.time + e.id.length;
    let lambda = 10, rl = 0;
    phase += dt * (1.0 + speed * 2);
    const st = e.state;
    if (st === 'dead') { tgt.aRz = -1.2; tgt.aLz = 1.2; tgt.headX = -0.4; lambda = 6; }
    else if ((rl = reactionPose(e, tgt, HIP, t, model.lieY))) lambda = rl;
    else if (stunned) { tgt.headY = Math.sin(t * 4) * 0.3; tgt.pitch = 0.3; tgt.aRz = -0.6; tgt.aLz = 0.6; tgt.kR = tgt.kL = 0.5; tgt.hipY = HIP - 0.15; }
    else if (st === 'slashWind' && ph === 2) {
      const side = step === 1 ? -1 : 1;
      tgt.aRx = -0.9; tgt.aRz = 0.6 * side; tgt.fRx = -0.1; tgt.spineY = -0.6 * side; tgt.pitch = 0.35;
      if (step === 2) { tgt.aRx = -0.4; tgt.aRz = 0; tgt.spineY = 0; tgt.pitch = 0.55; tgt.hipY = HIP - 0.2; }
      tgt.aLx = -0.6; tgt.aLz = 0.6; tgt.lRx = 0.5; tgt.lLx = -0.6; tgt.kL = 0.6; lambda = 40;
    } else if (st === 'slashWind') {
      const k = windupK(AH), side = step === 1 ? -1 : 1;
      tgt.aRx = -2.2 * k; tgt.aRz = -0.9 * side * k; tgt.fRx = -0.8 * k; tgt.spineY = 0.6 * side * k; tgt.pitch = -0.1 * k;
      if (step === 2) { tgt.aRx = -3.2 * k; tgt.aRz = -0.2; tgt.spineY = 0.1; tgt.pitch = -0.25 * k; }
      tgt.aLx = -0.9; tgt.aLz = 0.6; tgt.fLx = -1.2; tgt.lRx = 0.35; tgt.lLx = -0.45; tgt.kL = 0.5; tgt.hipY = HIP - 0.08;
      tgt.roll = Math.sin(t * 50) * 0.015 * k; lambda = 12;
    } else if (st === 'slash') {
      const side = step === 1 ? -1 : 1;
      tgt.aRx = -0.9; tgt.aRz = 0.6 * side; tgt.fRx = -0.1; tgt.spineY = -0.6 * side; tgt.pitch = 0.35;
      if (step === 2) { tgt.aRx = -0.4; tgt.aRz = 0; tgt.spineY = 0; tgt.pitch = 0.55; tgt.hipY = HIP - 0.2; }
      tgt.aLx = -0.6; tgt.aLz = 0.6; tgt.lRx = 0.5; tgt.lLx = -0.6; tgt.kL = 0.6; lambda = 30;
    } else if (st === 'slamWind' && ph === 2) { tgt.aRx = -0.2; tgt.aLx = -0.2; tgt.pitch = 0.8; tgt.spineX = 0.3; tgt.hipY = HIP - 0.35; tgt.kR = tgt.kL = 0.9; tgt.lRx = tgt.lLx = -0.6; lambda = 40; }
    else if (st === 'slamWind') {
      const k = windupK(AH);
      tgt.aRx = -3.3 * k; tgt.aLx = -3.0 * k; tgt.aRz = -0.15; tgt.aLz = 0.15; tgt.fRx = tgt.fLx = -0.4; tgt.pitch = -0.35 * k; tgt.headX = -0.3 * k;
      tgt.hipY = HIP + 0.05 * k; tgt.roll = Math.sin(t * 60) * 0.02 * k; lambda = 9;
    } else if (st === 'slam') { tgt.aRx = -0.2; tgt.aLx = -0.2; tgt.pitch = 0.8; tgt.spineX = 0.3; tgt.hipY = HIP - 0.35; tgt.kR = tgt.kL = 0.9; tgt.lRx = tgt.lLx = -0.6; lambda = 26; }
    else if (st === 'bash' && ph !== 2) { const k = windupK(AH); tgt.aLx = -2.3 * k; tgt.aLz = 0.5; tgt.fLx = -0.9 * k; tgt.spineY = 0.4 * k; tgt.pitch = -0.15 * k; tgt.lRx = 0.4; tgt.lLx = -0.5; tgt.kL = 0.5; lambda = 14; }   // visible shield raise
    else if (st === 'bash' || st === 'bashEnd') { tgt.aLx = -1.6; tgt.aLz = 0.1; tgt.fLx = -0.2; tgt.spineY = -0.5; tgt.pitch = 0.3; tgt.lLx = 0.6; tgt.lRx = -0.4; tgt.kR = 0.5; lambda = 24; }
    else if (st === 'recover') { tgt.aRx = -0.25; tgt.fRx = -0.05; tgt.pitch = 0.5; tgt.spineX = 0.25; tgt.headX = 0.4; tgt.hipY = HIP - 0.22; tgt.kR = tgt.kL = 0.55; tgt.aLx = -0.3; tgt.aLz = 0.5; lambda = 6; }   // sword dragging, guard down
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
    rhythmDamp(cur, tgt, lambda, dt, holding);
    applyHumanoid(model, cur);
  };
  return e;
}
