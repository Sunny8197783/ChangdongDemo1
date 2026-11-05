// 말랑이 (id chuchu) — jelly slime. Squash & stretch hops, quivering lunge, elemental variants, goo pop on death.
import * as THREE from 'three';
import { rand, clamp, damp, ELEMENT_COLORS } from '../core/utils.js';
import { buildChuchu } from './models.js';
import { Spring } from './common.js';
import { makeEnemy, faceTo, modelFor, beginAttack, liveAttack, attackPhase, windupK, punishAfter, attackMeta, shapeHit } from './base.js';
import { CHU_NAMES } from './codex.js';

const _v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const M_LUNGE = attackMeta('chuchu.lunge'), M_AURA = attackMeta('chuchu.aura');
const AURA_EVERY = 2.0, AURA_R = 1.6, LUNGE_W = 1.2, LAND_R = 1.2;
const STATUS = { fire: { burning: 3 }, ice: { chilled: 3 }, lightning: { shocked: 2.5 }, water: { wet: 5 }, nature: { seeded: { dur: 5, stacks: 1 } }, shadow: { blight: 2.5 } };
const AURA_SHAPE = { fire: 'ember', ice: 'snow', water: 'droplet', nature: 'petal', light: 'spark', shadow: 'wisp' };

export function createChuchu(ctx, pos, opts = {}) {
  const variant = CHU_NAMES[opts.variant] ? opts.variant : 'normal';
  const model = modelFor(ctx, 'chuchu', { variant }, () => buildChuchu(variant === 'wind' ? 'normal' : variant));
  const V = model.variant || { body: 0x4fc6c0, core: 0x2b8f9a }, el = variant === 'normal' ? null : variant;
  const resist = el ? { [el]: 0 } : null;
  const e = makeEnemy(ctx, {
    kind: 'chuchu', model, name: CHU_NAMES[variant], hp: 60, radius: 0.6, height: 1.0, mass: 0.7, variant,
    camp: opts.camp, facing: opts.facing, staggerDmg: 22, sight: 18, resist,
  }, pos);
  e.variant = variant; e.element = el; e.codexKey = variant === 'normal' ? 'chuchu' : 'chuchu:' + variant;
  const _end = new THREE.Vector3();
  let H = null, landTele = null, auraT = rand(0.8, AURA_EVERY), popPending = false, recoverDur = 0.8;
  const lungeShape = { kind: 'capsule', width: LUNGE_W, pos: new THREE.Vector3(), end: _end };
  const landShape = { kind: 'circle', r: LAND_R, pos: _end };
  const auraShape = { kind: 'circle', r: AURA_R, follow: true };
  function lungeTarget() {
    const pp = ctx.playerPos, p = e.object.position;
    _v.set(pp.x - p.x, 0, pp.z - p.z); const len = Math.max(0.1, _v.length());
    const L = Math.min(5.2, len + 0.4);
    _end.set(p.x + _v.x / len * L, 0, p.z + _v.z / len * L); _end.y = ctx.groundH(_end.x, _end.z);
    lungeShape.pos.copy(p);
  }
  function startLunge(force) {
    if (liveAttack(e) && !force) return false;
    lungeTarget();
    H = beginAttack(ctx, e, 'chuchu.lunge', lungeShape);
    if (!H) return false;
    // the landing circle (second decal, same timing) — part of the hitbox
    try { landTele = game.tells && !game.tells.isStub && game.tells.telegraph ? game.tells.telegraph({ shape: 'circle', pos: _end, r: LAND_R, dur: H.dur, color: 'damage' }) : null; } catch (_) { landTele = null; }
    e.setState('lungePrep'); return true;
  }
  function startAura(force) {
    if (!el || (liveAttack(e) && !force)) return false;
    H = beginAttack(ctx, e, 'chuchu.aura', auraShape, { sound: false });
    if (!H) return false;
    auraT = AURA_EVERY; return true;
  }
  e.attackStarters['chuchu.lunge'] = startLunge;
  if (el) e.attackStarters['chuchu.aura'] = startAura;
  e.friction = 9;
  const game = ctx.game;
  let pending = null, pendingT = 0;
  const sy = new Spring(260, 9), wob = new Spring(160, 5), lean = new Spring(120, 10);
  sy.reset(1);
  let hopT = rand(0.5, 2), lungeCd = rand(1, 2), hit = false, touchCd = 0, aura = null, idleHopT = rand(1, 3);
  let crouch = 0, quiver = 0;
  if (el) {
    const col = ELEMENT_COLORS[el] ?? 0xf3ecdf;
    const shape = AURA_SHAPE[el] || 'spark';
    aura = game.vfx.emitter?.({ owner: 'enemy', follow: model.core, rate: el === 'fire' ? 14 : 9, color: [col, 0xf3ecdf], speed: 0.9, spread: 1,
      size: el === 'lightning' ? 0.1 : 0.16, sizeEnd: 0, life: 0.7, shape, gravity: el === 'fire' ? -3 : el === 'ice' ? 0.6 : 0, drag: 1, offset: new THREE.Vector3(0, 0.2, 0) });
  }

  function hop(dirX, dirZ, h, up) {
    e.velocity.x += dirX * h; e.velocity.z += dirZ * h; e.velocity.y = up;
    e.grounded = false; e.leaping = true;
    sy.kick(4); wob.kick(rand(-2, 2));
    ctx.audio('jump', { position: e.object.position, volume: 0.25, pitch: 1.6 + Math.random() * 0.3 });
  }
  function land() {
    e.leaping = false;
    sy.kick(-7); wob.kick(rand(-4, 4));
    ctx.audio('land', { position: e.object.position, volume: 0.3, pitch: 1.5 });
    _v.copy(e.object.position); _v.y += 0.05;
    game.vfx.burst(_v, { owner: 'enemy', count: 6, color: V.body, speed: 2, spread: 0.6, dir: _v.set(0, 1, 0), size: 0.12, sizeEnd: 0.02, life: 0.4, gravity: 12, shape: 'soft', additive: false });
  }

  e.react = (result, hit, lx, lz) => {
    // snap: displace the jelly immediately so the squash reads during hitstop, then it wobbles back
    sy.x = Math.max(0.45, sy.x - 0.25 - Math.min(0.25, (result?.damage || 0) / 120)); sy.v = 0;
    sy.kick(-2);
    wob.kick((Math.random() < 0.5 ? -1 : 1) * 8);
    lean.kick(lz * 6);
    if (e.state === 'lungePrep' && !e.ptArmor) { H?.stop?.(); H = null; landTele?.stop?.(); landTele = null; e.setState('chase'); }
    // §4.3: a weak-element hit pops it at once when HP ≤ 40 %
    if (hit?.element && e.weakness.includes(hit.element) && e.hp > 0 && e.hp <= e.maxHp * 0.4 && !e.ptArmor) popPending = true;
  };
  e.die = () => { aura?.stop?.(); landTele?.stop?.(); };
  e.interrupt = () => { crouch = 0; quiver = 0; pending = null; hit = true; H = null; landTele?.stop?.(); landTele = null; };
  e.onResume = () => { lungeCd = Math.max(lungeCd, 0.8); hopT = rand(0.3, 0.6); };

  e.think = (dt, sm) => {
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    lungeCd -= dt; touchCd -= dt;
    if (e.grounded && e.leaping && e.stateT > 0.08) land();
    if (popPending) { popPending = false; if (e.alive && !e.dying) game.combat.dealDamage(e, { amount: e.hp + 1, fixed: true, source: 'player', noReaction: true, element: 'physical' }); return; }
    // elemental aura (§4.3): every 2.0 s, 0.5 s body glow + small circle tell, hits only inside the circle
    const AH = liveAttack(e);
    if (el && AH && AH.id === 'chuchu.aura') {
      if (AH.consumeStrike()) {
        H = null;
        if (AH.contains(pp) && Math.abs(pp.y - p.y) < 1.6) ctx.hitPlayer(e, { amount: 6, element: el, status: STATUS[el] || undefined, knockback: 4, attack: M_AURA });
        _v.copy(p); _v.y += 0.4;
        game.vfx.burst(_v, { owner: 'enemy', count: 8, color: [V.body, V.core], speed: 3, spread: 0.3, dir: UP, size: 0.14, sizeEnd: 0, life: 0.35, shape: 'spark', drag: 3 });
        lungeTarget();
      }
    } else if (el && e.aggro && !AH && e.state === 'chase' && d < 3.2) {
      auraT -= dt;
      if (auraT <= 0) { if (!startAura(false)) auraT = 0.3; }
    }
    switch (e.state) {
      case 'idle': {
        idleHopT -= dt;
        if (idleHopT <= 0 && e.grounded) {
          idleHopT = rand(1.5, 3.5);
          const a = Math.hypot(p.x - e.home.x, p.z - e.home.z) > 4 ? Math.atan2(e.home.x - p.x, e.home.z - p.z) : rand(0, 6.28);
          e.facing = a; crouch = 0.25;
          setTimeoutHop(() => hop(Math.sin(a), Math.cos(a), 1.6, 4.2));
        }
        break;
      }
      case 'alert':
        faceTo(e, pp.x, pp.z, 8, dt);
        if (e.stateT < 0.02 && e.grounded) hop(0, 0, 0, 5);
        if (e.stateT > 0.7 && e.grounded) e.setState('chase');
        break;
      case 'chase': {
        if (!e.aggro) { e.setState('return'); break; }
        faceTo(e, pp.x, pp.z, 6, dt);
        if (!e.grounded) break;
        if (d < 3.4 && lungeCd <= 0 && !liveAttack(e)) { if (!startLunge(false)) lungeCd = 0.5; break; }
        hopT -= dt * sm;
        if (hopT < 0.22) crouch = 1 - hopT / 0.22;
        if (hopT <= 0) {
          hopT = rand(0.35, 0.65);
          _v.set(pp.x - p.x, 0, pp.z - p.z).normalize();
          hop(_v.x, _v.z, (d > 6 ? 4.2 : 2.8) * sm, 5.2);
          crouch = 0;
        }
        break;
      }
      case 'lungePrep': {
        if (!H || (!H.alive && !H.struck)) { H = null; e.setState('chase'); break; }
        if (!H.locked) { faceTo(e, pp.x, pp.z, 8, dt); lungeTarget(); H.setPos(p); H.setEnd(_end); landTele?.setPos?.(_end); }
        const ph = attackPhase(H);
        quiver = ph === 0 ? windupK(H) : ph === 1 ? 0 : 0;
        crouch = ph === 2 ? 0.2 : ph === 1 ? 1 : quiver;
        if (H.consumeStrike()) {
          // hop along the decal; the flight resolves the hit (body contact inside the capsule / landing circle)
          _v.set(_end.x - p.x, 0, _end.z - p.z); const len = Math.max(0.1, _v.length()); _v.multiplyScalar(1 / len);
          const T = 0.5;
          e.velocity.set(_v.x * len / T, 22 * T / 2, _v.z * len / T); e.grounded = false; e.leaping = true;
          sy.kick(4); wob.kick(rand(-2, 2));
          crouch = 0; quiver = 0; hit = false; H = null;
          e.setState('lunge');
        }
        break;
      }
      case 'lunge':
        if (!hit && d < e.radius + 0.75 && Math.abs(pp.y + 0.6 - (p.y + 0.4)) < 1.3 && (shapeHit(ctx, lungeShape, pp) || shapeHit(ctx, landShape, pp))) {
          hit = true;
          ctx.hitPlayer(e, { amount: 10, element: el || 'physical', status: el ? (STATUS[el] || null) : null, knockback: 7, launch: 2, attack: M_LUNGE });
        }
        if (e.grounded && e.stateT > 0.1) {
          landTele?.stop?.(); landTele = null; e.leaping = false;
          recoverDur = punishAfter(ctx, e, 'chuchu.lunge') || 0.8;
          e.setState('splat'); lungeCd = rand(1.8, 3);
        }
        break;
      case 'splat':
        // lands squashed for the punish window (×1.5)
        e.velocity.x *= 0.8; e.velocity.z *= 0.8;
        if (e.stateT > recoverDur) { e.setState('chase'); hopT = rand(0.4, 0.8); }
        break;
      case 'return': {
        if (!e.grounded) break;
        hopT -= dt;
        if (hopT <= 0) {
          hopT = rand(0.5, 0.8);
          _v.set(e.home.x - p.x, 0, e.home.z - p.z); const len = _v.length();
          if (len < 1.5) { e.setState('idle'); break; }
          _v.multiplyScalar(1 / len); e.facing = Math.atan2(_v.x, _v.z);
          hop(_v.x, _v.z, 3, 4.6);
        }
        break;
      }
    }
  };

  // deferred idle hop (after brief crouch) without timers: store a pending action
  function setTimeoutHop(fn) { pending = fn; pendingT = 0.22; }

  e.pose = (dt, sm, stunned) => {
    if (pending) { pendingT -= dt; if (pendingT <= 0) { const f = pending; pending = null; f(); } }
    const t = game.time;
    let target = 1;
    if (!e.grounded) target = 1 + clamp(e.velocity.y * 0.05, -0.15, 0.3);
    else if (crouch > 0) target = 1 - crouch * 0.35;
    const rs = e.state;
    const AH = liveAttack(e), aph = attackPhase(AH);
    if (rs === 'splat') target = 0.55;
    // aura: body glow over the 0.5 s windup (flash uniform, warm tint ≤ 0.45)
    if (e.flashUniform && AH && AH.id === 'chuchu.aura') e.flashUniform.value = 0.45 * AH.progress;
    else if (e.flashUniform && e._auraGlow) e.flashUniform.value = 0;
    e._auraGlow = !!(AH && AH.id === 'chuchu.aura');
    // hold (§4.0): the lunge crouch freezes at the top (springs and quiver paused)
    if (aph === 1 && AH.id === 'chuchu.lunge') return;
    if (rs === 'dead') target = 0.6;
    else if (rs === 'knockdown') target = 0.5;               // splat
    else if (rs === 'getup') target = 1.15;
    else if (rs === 'flinch' || rs === 'stagger') target = 0.8;
    else if (rs === 'recoil') target = 1.2;
    const y = Math.max(0.35, sy.update(dt, target));
    const w = wob.update(dt);
    const breathe = Math.sin(t * 3 + e.id.length) * 0.03;
    const xz = 1 / Math.sqrt(y);
    const qv = quiver > 0 ? Math.sin(t * 70) * 0.05 * quiver : 0;
    const rig = model.rig;
    rig.scale.set(xz * (1 + w * 0.06) + qv, y + breathe, xz * (1 - w * 0.06) - qv);
    rig.position.set(0, 0, 0);
    // lean into motion
    let lz = 0;
    if (!e.grounded) {
      const c = Math.cos(-e.facing), s = Math.sin(-e.facing);
      lz = (-e.velocity.x * s + e.velocity.z * c) * 0.04;
    }
    rig.rotation.set(lean.update(dt, clamp(lz, -0.4, 0.4)), 0, w * 0.03);
    if (stunned || rs === 'parried') { rig.rotation.z += Math.sin(t * 6) * 0.15; rig.rotation.x += Math.cos(t * 6) * 0.1; }
    if (rs === 'panic') { rig.rotation.z += Math.sin(t * 22) * 0.2; }
    model.core.position.y = 0.38 + Math.sin(t * 4) * 0.04;
    model.eyes.scale.y = (Math.sin(t * 1.3 + e.id.length) > 0.985) ? 0.15 : 1; // blink
    if (e.hurt > 0.5) model.eyes.scale.y = 0.3;
  };

  e.deathUpdate = (dt) => {
    e.deathT += dt;
    const p = e.object.position;
    if (e.deathT < 0.32) {
      // swell up before popping
      e.move.set(0, 0, 0);
      const k = e.deathT / 0.32;
      const s = 1 + k * 0.45 + Math.sin(e.deathT * 60) * 0.05;
      model.rig.scale.set(s, s * (1 - k * 0.15), s);
      e.velocity.multiplyScalar(0.9);
      return false;
    }
    if (!e.dissolved) {
      e.dissolved = true;
      _v.copy(p); _v.y += 0.5;
      const vfx = game.vfx;
      vfx.burst(_v, { owner: 'enemy', count: 34, color: [V.body, V.core], speed: 6, speedVar: 3, spread: 1, size: 0.22, sizeEnd: 0.05, life: 0.7, gravity: 16, shape: 'soft', additive: false });
      vfx.burst(_v, { owner: 'enemy', count: 16, color: [0xf3ecdf, V.body], speed: 3, spread: 1, size: 0.35, sizeEnd: 0, life: 0.35, shape: 'soft' });
      vfx.decal?.(p, { owner: 'enemy', color: V.body, base: V.body, radius: 1.3, duration: 6, opacity: 0.55, type: 'soft' });
      vfx.shockwave?.(_v.set(p.x, p.y + 0.1, p.z), { owner: 'enemy', color: V.body, radius: 2.2, duration: 0.35, opacity: 0.7 });
      if (el) vfx.explosion?.(_v.set(p.x, p.y + 0.5, p.z), { owner: 'enemy', element: el, scale: 0.6 });
      ctx.audio('steam', { position: p, volume: 0.4, pitch: 1.8 });
      ctx.dissolveFx(e, 0.6);
      ctx.loot.drop(e);
      model.root.visible = false;
    }
    return e.deathT > 0.5;
  };
  return e;
}
