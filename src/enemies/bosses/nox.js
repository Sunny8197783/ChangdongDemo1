// 녹스, 타락한 정령 (id nox, Elderwood glade duel; DESIGN §8.5, CONTRACT §15). A human-size raven knight, 4000 HP, voidShield 100
// (it re-forms 12 s after it breaks: break it with light, reactions or a break).
// - Teleport-slash: he melts into ravens, reappears beside the target, a violet glint + parryable line telegraph, then a dash cut.
//   A perfect parry staggers him for 2 s (+15 break from combat).
// - Raven volley (a fan of void bolts) and a shadow wave (cone).
// - Phase 2 「그림자 분신」 at 50 %: a shadow clone joins (it only teleport-slashes; 2 hits of light dispel it).
// - At 0 HP he is not killed: the 정화 sequence plays (kneel, violet → gold light), then bossDefeated {id:'nox'} (he joins: shadow unlocked).
import { THREE, S, C, K, B, CAP, T, OCT, P, mergeParts, vcMat, vcBasicMat, pivot, buildSkin, glowify, once, glowSpriteMat } from './kit.js';
import { humanoid } from '../models.js';
import { createBoss } from '../bossbase.js';
import { makeEnemy, newPose, dampPose, applyHumanoid, walkCycle } from '../base.js';
import { clamp, rand } from '../../core/utils.js';

export const NOX_DATA = {
  id: 'nox', name: '녹스', title: '타락한 정령', sub: '그림자의 정령, 공허에 물들다',
  hp: 4000, voidShield: 100, shieldRegen: 12,
  phases: [{ name: '타락한 기사' }, { at: 0.5, name: '그림자 분신' }],
  slash: 24, volley: 11, wave: 20, clone: { hpFrac: 0.08, name: '녹스의 분신' },
  purifyLine: '…빛이… 따뜻하구나. 고맙다, 각인자여.',
};
const HIP = 0.98;
const NX = { plate: 0x1f1a2e, plateLight: 0x3a3150, feather: 0x15111f, featherHi: 0x3a2a5a, trim: 0x8a6ac0, beak: 0x2a2234, void: 0xb36bff, core: 0xf0d8ff, gold: 0xffd36a };

function geos() {
  return once('nox', () => {
    const feathers = (n, x0, y0, z0, sx, rot) => Array.from({ length: n }, (_, i) => P(K(0.12, 0.7 + (i % 3) * 0.12, 4), i % 2 ? NX.feather : NX.featherHi,
      [x0 + i * sx, y0 - Math.abs(i - n / 2) * 0.05, z0], [rot[0], rot[1], rot[2] + (i - n / 2) * 0.12], [1, 1, 0.3]));
    return {
      torso: mergeParts([
        P(S(0.4, 14, 10), NX.plate, [0, 0.3, 0], [0, 0, 0], [1.1, 1.15, 0.8]),
        P(B(0.42, 0.36, 0.1), NX.plateLight, [0, 0.36, 0.28], [-0.1, 0, 0]),
        P(S(0.22, 10, 8), NX.plateLight, [0.42, 0.56, 0], [0, 0, -0.4], [1.2, 0.7, 1.1]),
        P(S(0.22, 10, 8), NX.plateLight, [-0.42, 0.56, 0], [0, 0, 0.4], [1.2, 0.7, 1.1]),
        // feather mantle on the shoulders
        ...feathers(6, -0.5, 0.62, -0.05, 0.2, [-2.6, 0, 0]),
        // cloak of raven feathers down the back
        P(B(0.7, 1.1, 0.05), NX.feather, [0, -0.05, -0.32], [0.15, 0, 0]),
        ...feathers(7, -0.42, -0.6, -0.4, 0.14, [Math.PI, 0, 0]),
      ]),
      pelvis: mergeParts([
        P(S(0.3, 12, 9), NX.plate, [0, 0, 0], [0, 0, 0], [1.1, 0.7, 0.9]),
        P(T(0.32, 0.05, 14), NX.trim, [0, 0.05, 0], [Math.PI / 2, 0, 0]),
        P(B(0.24, 0.5, 0.04), NX.feather, [0.16, -0.28, 0.24], [0.1, 0, -0.1]),
        P(B(0.24, 0.5, 0.04), NX.feather, [-0.16, -0.28, 0.24], [0.1, 0, 0.1]),
      ]),
      head: mergeParts([
        P(S(0.24, 14, 10), NX.plate, [0, 0.14, 0], [0, 0, 0], [1, 1.1, 1.1]),
        P(K(0.12, 0.5, 6), NX.beak, [0, 0.08, 0.36], [Math.PI / 2 + 0.25, 0, 0], [1, 1, 0.75]),     // raven-beak visor
        ...[0, 1, 2, 3, 4].map((i) => P(K(0.07, 0.5 - i * 0.04, 4), NX.featherHi, [0, 0.36 - i * 0.02, -0.08 - i * 0.08], [-0.9 - i * 0.15, 0, 0], [1, 1, 0.3])),
        P(K(0.05, 0.3, 4), NX.trim, [0.2, 0.3, -0.04], [-0.5, 0, -0.5]), P(K(0.05, 0.3, 4), NX.trim, [-0.2, 0.3, -0.04], [-0.5, 0, 0.5]),
      ]),
      upperArm: mergeParts([P(CAP(0.11, 0.24), NX.plate, [0, -0.17, 0])]),
      foreArm: mergeParts([P(CAP(0.1, 0.2), NX.plateLight, [0, -0.16, 0]), P(C(0.13, 0.11, 0.18, 8), NX.trim, [0, -0.28, 0]), P(S(0.1, 8, 6), NX.plate, [0, -0.38, 0.02])]),
      thigh: mergeParts([P(CAP(0.13, 0.2), NX.plate, [0, -0.18, 0])]),
      shin: mergeParts([P(CAP(0.11, 0.22), NX.plateLight, [0, -0.17, 0]), P(K(0.06, 0.2, 4), NX.trim, [0, -0.05, 0.12], [-0.3, 0, 0]), P(B(0.16, 0.08, 0.3), NX.plate, [0, -0.38, 0.06])]),
      blade: mergeParts([
        P(B(0.05, 0.05, 0.3), NX.beak, [0, 0, 0.02]), P(B(0.34, 0.05, 0.06), NX.trim, [0, 0, 0.18]),
        P(B(0.1, 0.02, 1.15), 0x2a2040, [0, 0, 0.8], [0, 0, 0]),
        P(K(0.05, 0.3, 4), 0x2a2040, [0, 0, 1.5], [Math.PI / 2, 0, 0], [1, 1, 0.2]),
      ]),
      wing: mergeParts([...Array.from({ length: 6 }, (_, i) => P(K(0.16, 1.4 - i * 0.12, 4), i % 2 ? NX.feather : NX.featherHi, [0.15 + i * 0.22, -0.3 - i * 0.12, 0], [0, 0, 2.3 - i * 0.14], [1, 1, 0.25]))]),
      glowHead: glowify(mergeParts([P(B(0.08, 0.035, 0.02), NX.core, [0.08, 0.16, 0.24], [0, 0, -0.25]), P(B(0.08, 0.035, 0.02), NX.core, [-0.08, 0.16, 0.24], [0, 0, 0.25])]), 3.0),
      glowBody: glowify(mergeParts([P(OCT(0.09), NX.void, [0, 0.4, 0.34]), P(T(0.12, 0.012, 10), NX.void, [0, 0.4, 0.33])]), 2.2),
      glowBlade: glowify(mergeParts([P(B(0.025, 0.025, 1.1), NX.void, [0, 0.015, 0.82])]), 2.4),
    };
  });
}
export function buildNox(clone = false) {
  const g = geos();
  const m = humanoid(g, { hipY: HIP, neckY: 0.74, shoulderX: 0.48, shoulderY: 0.56, upperLen: 0.4, foreLen: 0.36, hipX: 0.2, thighLen: 0.44 });
  const blade = pivot(m.handR, 0, 0, 0); blade.rotation.x = -0.3;
  const wingR = pivot(m.spine, -0.2, 0.5, -0.32), wingL = pivot(m.spine, 0.2, 0.5, -0.32);
  wingL.scale.x = -1;
  m.bones.push(blade, wingR, wingL);
  const n = m.bones.length;
  m.parts.push([n - 3, g.blade], [n - 2, g.wing], [n - 1, g.wing]);
  const sk = buildSkin(clone ? 'noxclone' : 'nox', m.root, m.bones, [
    { name: 'body', mat: vcMat(), parts: m.parts, outline: 0.024 },
    { name: 'glow', mat: vcBasicMat(), parts: [[2, g.glowHead], [1, g.glowBody], [n - 3, g.glowBlade]], shadow: false },
  ], [1.1, 2.2]);
  const halo = new THREE.Sprite(glowSpriteMat(NX.void, 0.0)); halo.scale.setScalar(3.4); halo.position.set(0, 1.4, 0); m.root.add(halo);
  Object.assign(m, { weapon: blade, wingR, wingL, halo, skin: sk, outlines: sk.outlines, headTop: 2.35 });
  return m;
}

let spare = null;
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _w = new THREE.Vector3();
const BASE = newPose(HIP);

/** Shared brain for Nox and his clone: teleport-slash (parryable), raven volley, shadow wave. */
function brain(ctx, e, model, D, isClone) {
  const game = ctx.game, vfx = game.vfx;
  const cur = newPose(HIP), tgt = newPose(HIP);
  const st = { cd: isClone ? 2.5 : 1.6, tele: null, hitDone: false, fade: 1, from: new THREE.Vector3(), dir: new THREE.Vector3(), phase: rand(0, 6), speed: 0, stagger: 0, combo: 0 };
  function ravens(at, s = 1) {
    _v.copy(at); _v.y += 1.1;
    vfx.burst(_v, { count: Math.round(14 * s), color: [0x2a1f3e, 0x0a0612], speed: 3.5, spread: 1, size: 0.5, sizeEnd: 1.2, life: 0.7, shape: 'smoke', additive: false, drag: 2.5 });
    vfx.burst(_v, { count: Math.round(8 * s), color: [0x3a2a5a, 0x15111f], speed: 6, spread: 1, size: 0.35, sizeEnd: 0.2, life: 0.8, shape: 'raven', additive: false, drag: 1.5, gravity: -2 });
    vfx.burst(_v, { count: Math.round(10 * s), color: [0xe6c8ff, 0xb36bff], speed: 4, spread: 1, size: 0.12, sizeEnd: 0, life: 0.45, shape: 'wisp', drag: 3 });
  }
  function startTeleport() {
    e.setState('vanish'); ravens(e.object.position); ctx.audio('blink', { position: e.object.position, volume: 0.6, pitch: 0.55 });
    game.events.emit('enemyAttack', { enemy: e, kind: 'teleportSlash' });
  }
  function appear() {
    const pp = ctx.playerPos, p = e.object.position;
    // beside / behind the target, inside the arena
    const side = Math.random() < 0.5 ? 1 : -1;
    const pf = ctx.target?.object ? (ctx.target.facing ?? Math.atan2(p.x - pp.x, p.z - pp.z)) : 0;
    const a = pf + Math.PI + side * rand(0.6, 1.4);
    _v.set(pp.x + Math.sin(a) * 4.2, 0, pp.z + Math.cos(a) * 4.2);
    const A = e.arena || e.parentBoss?.arena;
    if (A) { const dx = _v.x - A.position.x, dz = _v.z - A.position.z, d = Math.hypot(dx, dz), R = A.radius - 1.5; if (d > R) { _v.x = A.position.x + dx / d * R; _v.z = A.position.z + dz / d * R; } }
    _v.y = ctx.groundH(_v.x, _v.z);
    p.copy(_v); e.velocity.set(0, 0, 0);
    e.facing = Math.atan2(pp.x - p.x, pp.z - p.z);
    ravens(p, 0.8);
    st.from.copy(p); st.dir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
    st.tele = ctx.tele({ shape: 'line', pos: p, dir: st.dir, len: 7.5, width: 1.6, dur: 0.75, color: 'void', parryable: true });
    e.setState('slashWind'); st.hitDone = false;
  }
  e.onBossParried = () => {
    if (e.state !== 'slash' && e.state !== 'slashWind') return;
    st.tele?.stop?.(); st.tele = null;
    e.setState('staggered'); st.stagger = 2.0;
    vfx.burst(e.getCenter(_v), { count: 30, color: [0xffe08a, 0xffffff], speed: 7, spread: 1, size: 0.16, sizeEnd: 0, life: 0.5, shape: 'star' });
    ctx.audio('parry', { position: e.object.position, volume: 1 });
  };
  e.think = (dt, sm) => {
    if (!isClone) e.baseTick(dt);
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    st.cd -= dt * sm;
    e.move.set(0, 0, 0);
    if (!isClone && (e.transitioning || e.state === 'purify')) return;
    switch (e.state) {
      case 'idle': case 'chase': {
        if (!isClone && !e.playerInArena(16)) { e.setState('idle'); break; }
        e.setState('chase');
        const want = Math.atan2(pp.x - p.x, pp.z - p.z);
        let df = want - e.facing; df = Math.atan2(Math.sin(df), Math.cos(df)); e.facing += clamp(df, -6 * dt, 6 * dt);
        if (d > 3.2) { e.move.x = Math.sin(e.facing) * 3.4 * sm; e.move.z = Math.cos(e.facing) * 3.4 * sm; }
        if (st.cd <= 0) {
          const r = Math.random();
          if (isClone || r < 0.5 || d > 9) startTeleport();
          else if (r < 0.78) { e.setState('volleyWind'); game.events.emit('enemyAttack', { enemy: e, kind: 'volley' }); }
          else {
            e.setState('waveWind');
            st.dir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
            st.tele = ctx.tele({ shape: 'cone', pos: p, dir: st.dir, r: 7, angle: 70, dur: 0.9, color: 'void' });
            game.events.emit('enemyAttack', { enemy: e, kind: 'wave' });
          }
        }
        break;
      }
      case 'vanish':
        st.fade = Math.max(0, 1 - e.stateT / 0.35);
        if (e.stateT > 0.45) { st.fade = 0; appear(); }
        break;
      case 'slashWind':
        st.fade = Math.min(1, e.stateT / 0.2);
        if (e.stateT > 0.75 / Math.max(0.6, sm)) { e.setState('slash'); ctx.audio('swing', { position: p, volume: 0.7, pitch: 0.6 }); }
        break;
      case 'slash': {
        // dash cut along the committed line
        const k = Math.min(1, e.stateT / 0.18);
        p.set(st.from.x + st.dir.x * 7 * k, 0, st.from.z + st.dir.z * 7 * k); p.y = ctx.groundH(p.x, p.z);
        if (!st.hitDone && e.stateT > 0.04) {
          // hit if the target is inside the swept line so far
          _v.subVectors(ctx.playerPos, st.from).setY(0);
          const along = _v.dot(st.dir), across = Math.abs(_v.x * st.dir.z - _v.z * st.dir.x);
          if (along > -0.5 && along < 7 * k + 0.8 && across < 1.3) { st.hitDone = true; ctx.hitPlayer(e, { amount: D.slash, element: 'void', knockback: 9, launch: 2 }); }
        }
        if (e.stateT > 0.18 && !st._trail) { st._trail = true; vfx.smear?.('arc', e.getCenter(_v), e.object.quaternion, 2.2, 'shadow'); }
        if (e.stateT > 0.5) { st._trail = false; st.tele?.stop?.(); st.tele = null; st.cd = rand(1.6, 2.6) * (isClone ? 1.4 : 1); e.setState('chase'); }
        break;
      }
      case 'volleyWind':
        if (e.stateT > 0.7) {
          model.weapon.getWorldPosition(_v); _v.y += 0.3;
          for (let i = -2; i <= 2; i++) {
            const a = e.facing + i * 0.22;
            _w.set(_v.x + Math.sin(a) * 0.6, _v.y, _v.z + Math.cos(a) * 0.6);
            ctx.projectiles.orb(_w, 'void', e, { color: 0xb36bff, amount: D.volley, speed: 10 });
          }
          ctx.audio('cast_shadow', { position: p, volume: 0.8, pitch: 0.6 });
          e.setState('recover'); st.cd = rand(1.8, 2.8);
        }
        break;
      case 'waveWind':
        if (e.stateT > 0.9) {
          st.tele?.stop?.(); st.tele = null;
          vfx.preset?.('explosion_shadow', _v.copy(p).addScaledVector(st.dir, 3.5), { scale: 1.2, dir: st.dir });
          vfx.groundDecal?.('violet', _v, 3.5, 6);
          if (ctx.meleeCheck(e, 7, 0.62)) ctx.hitPlayer(e, { amount: D.wave, element: 'void', knockback: 12, launch: 4, status: { blight: 2.5 } });
          e.setState('recover'); st.cd = rand(1.6, 2.4);
        }
        break;
      case 'staggered':
        st.stagger -= dt;
        if (st.stagger <= 0) { e.setState('chase'); st.cd = 1.2; }
        break;
      case 'recover':
        if (e.stateT > 0.6) e.setState('chase');
        break;
    }
    st.speed = Math.hypot(e.move.x, e.move.z);
    if (!e.noPhysics) return;
    p.x += e.move.x * dt; p.z += e.move.z * dt; p.y = ctx.groundH(p.x, p.z);
    if (!isClone) e.clampToArena(1.5);
  };
  e.pose = (dt) => {
    Object.assign(tgt, BASE);
    const t = game.time + (isClone ? 1.7 : 0);
    let lambda = 10;
    st.phase += dt * (1.2 + st.speed * 2.2);
    const s = e.state;
    if (s === 'purify' || s === 'dead') {
      const k = clamp(e.stateT / 0.8, 0, 1);
      tgt.hipY = HIP - 0.45 * k; tgt.pitch = 0.35 * k; tgt.lRx = -1.4 * k; tgt.kR = 2.0 * k; tgt.lLx = 0.2 * k; tgt.kL = 1.5 * k;   // kneel
      tgt.aRx = -0.4; tgt.aRz = -0.5; tgt.aLx = -0.2; tgt.headX = 0.4 * k - Math.max(0, e.stateT - 1.6) * 0.6;
      lambda = 5;
    } else if (s === 'slashWind') {
      tgt.aRx = -1.0; tgt.aRz = 0.9; tgt.fRx = -1.2; tgt.spineY = -0.9; tgt.pitch = 0.35; tgt.hipY = HIP - 0.25; tgt.lRx = -0.8; tgt.kR = 1.0; tgt.lLx = 0.6; tgt.kL = 0.5;
      tgt.aLx = -0.4; tgt.aLz = 0.9; tgt.roll = Math.sin(t * 60) * 0.02; lambda = 14;
    } else if (s === 'slash') { tgt.aRx = -1.2; tgt.aRz = -1.1; tgt.fRx = -0.1; tgt.spineY = 0.9; tgt.pitch = 0.6; tgt.hipY = HIP - 0.3; tgt.lRx = 0.7; tgt.lLx = -0.8; tgt.kL = 0.8; lambda = 30; }
    else if (s === 'volleyWind') { const k = clamp(e.stateT / 0.6, 0, 1); tgt.aRx = -2.6 * k; tgt.aLx = -2.2 * k; tgt.aLz = 0.6; tgt.pitch = -0.2 * k; tgt.headX = -0.3 * k; lambda = 12; }
    else if (s === 'waveWind') { const k = clamp(e.stateT / 0.8, 0, 1); tgt.aRx = -3.0 * k; tgt.aRz = -0.2; tgt.pitch = -0.3 * k; tgt.hipY = HIP + 0.05; lambda = 10; }
    else if (s === 'staggered') { tgt.pitch = -0.45; tgt.spineX = -0.3; tgt.headX = -0.5; tgt.aRx = -1.8; tgt.aLx = -1.6; tgt.aLz = 1.1; tgt.aRz = -1.0; tgt.roll = Math.sin(t * 3) * 0.12; tgt.hipY = HIP - 0.1; lambda = 12; }
    else if (s === 'recover') { tgt.pitch = 0.25; tgt.aRx = -0.6; lambda = 8; }
    else {
      const amt = clamp(st.speed / 3, 0, 1);
      if (amt > 0.05) walkCycle(tgt, st.phase, amt, 0.4);
      // duelist stance: blade low and back, off-hand forward
      tgt.aRx = -0.4; tgt.aRz = -0.5; tgt.fRx = -0.6; tgt.aLx = -0.9; tgt.aLz = 0.4; tgt.fLx = -0.9; tgt.spineY = 0.25; tgt.kR += 0.15; tgt.kL += 0.2; tgt.hipY -= 0.06;
      tgt.spineX = Math.sin(t * 1.5) * 0.02;
    }
    dampPose(cur, tgt, lambda, dt);
    applyHumanoid(model, cur);
    const f = st.fade;
    model.rig.scale.set(1 + (1 - f) * 0.4, Math.max(0.02, f), 1 + (1 - f) * 0.4);
    // wings: folded, flare on teleport / stagger
    const flare = s === 'vanish' || s === 'slashWind' ? 1 : s === 'staggered' ? 0.6 : 0.15 + Math.sin(t * 1.2) * 0.05;
    model.wingR.rotation.set(0.2, -0.3 - flare * 0.9, -flare * 0.5);
    model.wingL.rotation.set(0.2, 0.3 + flare * 0.9, flare * 0.5);
  };
  return st;
}

export function createNox(ctx, arena, opts = {}) {
  const game = ctx.game, vfx = game.vfx;
  const D = NOX_DATA;
  const A = arena || { position: new THREE.Vector3(64, 0, -48), radius: 14 };
  const model = spare || buildNox(); spare = null;
  let purified = false, shieldT = 0, clone = null;
  const e = createBoss(ctx, {
    id: 'nox', name: D.name, title: D.title, sub: D.sub, model, arena: A, zoneId: 'elderwood',
    position: A.position.clone(), baseHp: D.hp, radius: 0.6, height: 2.3, mass: 3, voidShield: D.voidShield, isVoid: true, breakMax: 100,
    resist: { shadow: 0.5, light: 1.3 }, weakness: ['light'], phases: D.phases, transition: 2.0, music: 'boss', dissolveColor: 0xffd36a,
    facing: Math.atan2(ctx.realPlayerPos.x - A.position.x, ctx.realPlayerPos.z - A.position.z),
    canDie: () => purified,
    onZero: () => startPurify(),
    onPhase: (i) => { if (i === 1) spawnClone(); },
    onRespawnPhase: () => { e.voidShield = D.voidShield; },
    debugDefeat: () => { if (!purified && e.state !== 'purify') startPurify(true); return true; },
    dissolveAt: 0.2, dissolveDur: 1.8,
    onDefeat: () => { killClone(); },
  });
  e.noPhysics = true;
  e.object.position.y = ctx.groundH(A.position.x, A.position.z);
  brain(ctx, e, model, D, false);

  function spawnClone() {
    if (clone) return;
    const cm = buildNox(true);
    cm.halo.material.opacity = 0.5;
    const pos = e.object.position.clone(); pos.x += 3;
    const c = makeEnemy(ctx, { kind: 'noxclone', model: cm, name: D.clone.name, hp: Math.round(e.maxHp * D.clone.hpFrac), radius: 0.6, height: 2.3, mass: 3, isBoss: false, noTumble: true, resist: { light: 2, shadow: 0.3 } }, pos);
    c.aggro = true; c.noPhysics = true; c.parentBoss = e; c.arena = A; c.isVoid = true; c.xpValue = 0; c.zoneDmgMul = e.zoneDmgMul; c.summoned = true;
    c.isDummy = false; c.noLod = false;
    brain(ctx, c, cm, D, true);
    c.deathUpdate = (dt) => { c.deathT += dt; if (!c._puff) { c._puff = true; ctx.dissolveFx(c, 1.2); } cm.rig.scale.setScalar(Math.max(0.01, 1 - c.deathT * 2)); return c.deathT > 0.5; };
    ctx.adopt(c);
    clone = c;
    vfx.burst(c.getCenter(_v), { count: 40, color: [0x3a2a5a, 0x0a0612], speed: 5, spread: 1, size: 0.5, sizeEnd: 1.1, life: 0.9, shape: 'raven', additive: false });
    game.events.emit('bossSummon', { boss: e, id: 'nox', kind: 'clone' });
  }
  function killClone() { if (clone && clone.alive) { clone.alive = false; clone.dying = true; clone.deathT = 0; } clone = null; }

  function startPurify(fast = false) {
    if (e.state === 'purify') return;
    killClone();
    e.invulnerable = true; e.voidShield = 0; e.transitioning = false;
    e.setState('purify');
    e._purifyT = fast ? 1.6 : 3.4;
    ctx.audio('boss_roar', { position: e.object.position, volume: 0.8, pitch: 0.9 });
    try { game.cinematic?.subtitle?.(D.purifyLine, 3); } catch (_) { /* */ }
  }

  const think = e.think;
  e.think = (dt, sm) => {
    // void shield re-forms 12 s after it breaks
    if (!e.defeated && e.state !== 'purify') {
      if ((e.voidShield || 0) <= 0) { shieldT += dt; if (shieldT > D.shieldRegen) { shieldT = 0; e.voidShield = D.voidShield; vfx.burst(e.getCenter(_v), { count: 30, color: [0xb36bff, 0x2a1440], speed: 2, spread: 1, size: 0.4, sizeEnd: 0.9, life: 0.8, shape: 'wisp', inward: true }); } }
      else shieldT = 0;
    }
    if (e.state === 'purify') {
      e.baseTick(dt);
      e._purifyT -= dt;
      const p = e.object.position;
      if (Math.random() < dt * 20) { _v.set(p.x + rand(-1, 1), p.y + rand(0.2, 2.2), p.z + rand(-1, 1)); vfx.burst(_v, { count: 2, color: [0xffffff, 0xffe08a], speed: 1, spread: 1, size: 0.18, sizeEnd: 0, life: 1.0, shape: 'feather', gravity: -1.5 }); }
      model.halo.material.color.setHex(0xffe08a); model.halo.material.opacity = Math.min(0.9, (3.4 - e._purifyT) * 0.3);
      if (e._purifyT <= 0 && !purified) {
        purified = true;
        vfx.preset?.('explosion_light', e.getCenter(_v), { scale: 2.2 });
        vfx.flashSprite?.(_v, 0xfff1c0, 6, 0.4, 1.4);
        // he is not killed: award the act-boss XP through the usual `kill` event, then the defeat path (bossDefeated)
        game.events.emit('kill', { target: e, source: 'player', point: _v.clone(), xp: e.xpValue || 0, zoneLevel: e.zoneLevel || 1 });
        e.defeat(null);
      }
      return;
    }
    think(dt, sm);
    model.halo.material.opacity = (e.voidShield || 0) > 0 ? 0.35 + Math.sin(e.bossT * 4) * 0.1 : 0;
  };
  e.isPurified = () => purified;
  return e;
}
createNox.prewarm = () => { if (!spare) spare = buildNox(); return spare.root; };
