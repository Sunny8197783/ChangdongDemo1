// 녹스, 타락한 정령 (id nox, Elderwood glade duel; PLAN v4 §4.11). A human-size raven knight, 4000 HP, voidShield 100
// (it re-forms 12 s after it breaks: break it with light, reactions or a break → a 3 s kneel, punish ×1.5).
// Attacks (game.tells, bossbase bossAttack / bossHit):
//   nox.teleportSlash (parry) he melts into ravens; a raven-smoke marker appears in front of / beside the player inside the camera view
//                             (±0.87 rad of camera forward) with the line (len 7, width 1.6); he arrives 0.3 s later; gold glint −0.35;
//                             a perfect parry staggers him 2 s (punish ×1.5). ≤ 1 teleport-slash at a time, clone included.
//   nox.volley (projectile)   feather-fan glow, 3 orbs (phase 2: 4) homing 0.5 s
//   nox.wave (danger)         cone r 7, half-angle 0.61 rad
// Phase 2 「그림자 분신」 at 50 %: a translucent clone with the same tells. At 0 HP: the 정화 sequence, then bossDefeated {id:'nox'}.
import { THREE, S, C, K, B, CAP, T, OCT, P, mergeParts, vcMat, vcBasicMat, pivot, buildSkin, glowify, once, glowSpriteMat } from './kit.js';
import { humanoid } from '../models.js';
import { skinOutlineMat } from '../common.js';
import { createBoss, finishBoss, bossAttack, bossHit, bossPunish, rhythm, cancelled, stopAttacks } from '../bossbase.js';
import { makeEnemy, newPose, dampPose, applyHumanoid, walkCycle } from '../base.js';
import { clamp, rand } from '../../core/utils.js';
import { attackSpec } from './codex.js';
import { proxyParts, strips, updateStrips, contract } from './rig.js';

export const NOX_DATA = {
  id: 'nox', name: '녹스', title: '타락한 정령', sub: '그림자의 정령, 공허에 물들다',
  hp: 4000, voidShield: 100, shieldRegen: 12, kneel: 3,
  phases: [{ name: '타락한 기사' }, { at: 0.5, name: '그림자 분신' }],
  slash: 24, volley: 11, wave: 20, clone: { hpFrac: 0.08, name: '녹스의 분신' },
  purifyLine: '…빛이… 따뜻하구나. 고맙다, 각인자여.',
};
const HIP = 0.98;
// palette lifted (§4.11): charcoal + violet trim + pale bone beak
const NX = { plate: 0x2e2838, plateLight: 0x4a4260, feather: 0x2c2438, featherHi: 0x4e4070, trim: 0x9a7cff, beak: 0xd8cdb8, beakDark: 0xa89c86, void: 0x8a6ce0, core: 0xd8c8ff };

function geos() {
  return once('nox4', () => {
    const fan = (n, x0, y0, z0, sx, rot, len = 0.7) => Array.from({ length: n }, (_, i) => P(K(0.12, len + (i % 3) * 0.12, 4), i % 2 ? NX.feather : NX.featherHi,
      [x0 + i * sx, y0 - Math.abs(i - n / 2) * 0.05, z0], [rot[0], rot[1], rot[2] + (i - n / 2) * 0.12], [1, 1, 0.3]));
    const pauldron = (sx) => [
      P(S(0.2, 10, 7), NX.plateLight, [sx * 0.42, 0.58, 0], [0, 0, -sx * 0.4], [1.25, 0.7, 1.15]),
      P(S(0.16, 8, 6), NX.plate, [sx * 0.5, 0.5, 0], [0, 0, -sx * 0.5], [1.2, 0.6, 1.1]),
      ...Array.from({ length: 5 }, (_, i) => P(K(0.07, 0.42 - i * 0.03, 4), i % 2 ? NX.featherHi : NX.feather, [sx * (0.36 + i * 0.06), 0.44 - i * 0.03, -0.12 + i * 0.06], [0, 0, sx * (2.5 + i * 0.12)], [1, 1, 0.3])),
    ];
    return {
      torso: mergeParts([
        P(S(0.4, 14, 10), NX.plate, [0, 0.3, 0], [0, 0, 0], [1.1, 1.15, 0.8]),
        ...[0, 1, 2].map((i) => P(B(0.44 - i * 0.06, 0.14, 0.08), i % 2 ? NX.plate : NX.plateLight, [0, 0.5 - i * 0.13, 0.3 - i * 0.01], [-0.15, 0, 0])),
        P(B(0.05, 0.36, 0.04), NX.trim, [0, 0.36, 0.33]),
        ...pauldron(1), ...pauldron(-1),
        ...fan(6, -0.5, 0.62, -0.05, 0.2, [-2.6, 0, 0]),
      ]),
      pelvis: mergeParts([
        P(S(0.3, 12, 9), NX.plate, [0, 0, 0], [0, 0, 0], [1.1, 0.7, 0.9]),
        P(T(0.32, 0.04, 14), NX.trim, [0, 0.05, 0], [Math.PI / 2, 0, 0]),
        P(B(0.24, 0.5, 0.04), NX.feather, [0.16, -0.28, 0.24], [0.1, 0, -0.1]),
        P(B(0.24, 0.5, 0.04), NX.feather, [-0.16, -0.28, 0.24], [0.1, 0, 0.1]),
      ]),
      head: mergeParts([
        // beak helm: skull cap + 3 layered plates + the long pale beak (upper + lower)
        P(S(0.24, 14, 10), NX.plate, [0, 0.14, 0], [0, 0, 0], [1, 1.1, 1.1]),
        P(S(0.25, 12, 8), NX.plateLight, [0, 0.2, -0.04], [-0.2, 0, 0], [1.02, 0.7, 1.05]),
        P(S(0.22, 12, 8), NX.plate, [0, 0.27, -0.08], [-0.35, 0, 0], [0.95, 0.55, 1.0]),
        P(B(0.34, 0.06, 0.2), NX.plateLight, [0, 0.1, 0.17], [0.25, 0, 0]),
        P(K(0.1, 0.52, 6), NX.beak, [0, 0.07, 0.42], [Math.PI / 2 + 0.22, 0, 0], [1, 1, 0.75]),
        P(K(0.07, 0.34, 6), NX.beakDark, [0, 0.0, 0.34], [Math.PI / 2 + 0.05, 0, 0], [1, 1, 0.6]),
        ...[0, 1, 2, 3, 4].map((i) => P(K(0.07, 0.5 - i * 0.04, 4), NX.featherHi, [0, 0.36 - i * 0.02, -0.08 - i * 0.08], [-0.9 - i * 0.15, 0, 0], [1, 1, 0.3])),
        P(K(0.05, 0.3, 4), NX.trim, [0.2, 0.3, -0.04], [-0.5, 0, -0.5]), P(K(0.05, 0.3, 4), NX.trim, [-0.2, 0.3, -0.04], [-0.5, 0, 0.5]),
      ]),
      upperArm: mergeParts([P(CAP(0.11, 0.24), NX.plate, [0, -0.17, 0]), P(T(0.12, 0.02, 10), NX.trim, [0, -0.3, 0], [Math.PI / 2, 0, 0])]),
      foreArm: mergeParts([
        P(CAP(0.1, 0.2), NX.plateLight, [0, -0.16, 0]), P(C(0.13, 0.11, 0.18, 8), NX.trim, [0, -0.28, 0]), P(S(0.1, 8, 6), NX.plate, [0, -0.38, 0.02]),
        ...[-0.05, 0, 0.05].map((x, i) => P(K(0.025, 0.16, 4), NX.beak, [x, -0.48, 0.07], [0.9 - i * 0.1, 0, x * 2])),          // talon gauntlet
        P(K(0.025, 0.12, 4), NX.beak, [0.08, -0.43, 0.02], [0.5, 0, -0.8]),
      ]),
      thigh: mergeParts([P(CAP(0.13, 0.2), NX.plate, [0, -0.18, 0])]),
      shin: mergeParts([P(CAP(0.11, 0.22), NX.plateLight, [0, -0.17, 0]), P(K(0.06, 0.2, 4), NX.trim, [0, -0.05, 0.12], [-0.3, 0, 0]), P(B(0.16, 0.08, 0.3), NX.plate, [0, -0.38, 0.06]),
        ...[-0.05, 0.05].map((x) => P(K(0.025, 0.12, 4), NX.beakDark, [x, -0.4, 0.24], [1.4, 0, 0]))]),
      // feather blade: hilt + a long feather-shaped blade with barbs
      blade: mergeParts([
        P(B(0.05, 0.05, 0.3), NX.beak, [0, 0, 0.02]), P(B(0.34, 0.05, 0.06), NX.trim, [0, 0, 0.18]),
        P(S(0.5, 10, 4), 0x3a3052, [0, 0, 0.85], [0, 0, 0], [0.12, 0.03, 1.4]),
        ...Array.from({ length: 6 }, (_, i) => P(B(0.16, 0.015, 0.05), 0x3a3052, [0.06 * (i % 2 ? 1 : -1), 0, 0.45 + i * 0.16], [0, (i % 2 ? 0.5 : -0.5), 0])),
      ]),
      wing: mergeParts([...Array.from({ length: 6 }, (_, i) => P(K(0.16, 1.4 - i * 0.12, 4), i % 2 ? NX.feather : NX.featherHi, [0.15 + i * 0.22, -0.3 - i * 0.12, 0], [0, 0, 2.3 - i * 0.14], [1, 1, 0.25]))]),
      cloak: mergeParts([P(B(0.16, 0.5, 0.03), NX.feather, [0, -0.25, 0]), P(K(0.09, 0.32, 4), NX.featherHi, [0, -0.5, 0.01], [Math.PI, 0, 0], [1, 1, 0.3])]),
      glowHead: glowify(mergeParts([P(B(0.08, 0.035, 0.02), NX.core, [0.08, 0.16, 0.24], [0, 0, -0.25]), P(B(0.08, 0.035, 0.02), NX.core, [-0.08, 0.16, 0.24], [0, 0, 0.25])]), 1.15),
      glowBody: glowify(mergeParts([P(OCT(0.09), NX.void, [0, 0.4, 0.34]), P(T(0.12, 0.012, 10), NX.void, [0, 0.4, 0.33])]), 1.1),
      glowBlade: glowify(mergeParts([P(B(0.02, 0.02, 1.25), NX.void, [0.06, 0.01, 0.85]), P(B(0.02, 0.02, 1.25), NX.void, [-0.06, 0.01, 0.85])]), 1.1),
      pBlade: mergeParts([P(B(0.14, 0.05, 1.5), 0x202020, [0, 0, 0.8])]),
    };
  });
}
const DIMS = { pelvis: [0.33, 0.22, 0.27], torso: [0.46, 0.48, 0.34], torsoY: 0.32, head: [0.26, 0.3, 0.3], headY: 0.16, arm: [0.11, 0.1], leg: [0.13, 0.11], upperLen: 0.4, foreLen: 0.4, thighLen: 0.44, shinLen: 0.46 };
let cloneMat = null;
export function buildNox(clone = false) {
  const g = geos();
  const m = humanoid(g, { hipY: HIP, neckY: 0.74, shoulderX: 0.48, shoulderY: 0.56, upperLen: 0.4, foreLen: 0.36, hipX: 0.2, thighLen: 0.44 });
  const blade = pivot(m.handR, 0, 0, 0); blade.rotation.x = -0.3;
  const wingR = pivot(m.spine, -0.2, 0.5, -0.32), wingL = pivot(m.spine, 0.2, 0.5, -0.32);
  wingL.scale.x = -1;
  m.bones.push(blade, wingR, wingL);
  const n = m.bones.length;
  m.parts.push([n - 3, g.blade], [n - 2, g.wing], [n - 1, g.wing]);
  const pparts = proxyParts(m, DIMS); pparts.push([n - 3, g.pBlade]);
  // layered feather cloak: 6 spring strips down the back
  const cloak = strips(m.spine, 6, { x0: -0.3, dx: 0.12, y: 0.62, z: -0.3, dz: 0.03, len: 0.5, rx: 0.12, bones: m.bones, parts: m.parts, geo: g.cloak, k: 60, d: 6 });
  if (clone && !cloneMat) cloneMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, color: 0xa898e0, depthWrite: false });
  const sk = buildSkin(clone ? 'noxclone4' : 'nox4', m.root, m.bones, [
    { name: 'body', mat: clone ? cloneMat : vcMat(), parts: m.parts, shadow: false },
    { name: 'glow', mat: vcBasicMat(), parts: [[2, g.glowHead], [1, g.glowBody], [n - 3, g.glowBlade]], shadow: false },
    ...(clone ? [] : [{ name: 'proxy', mat: skinOutlineMat(0.024), parts: pparts }]),
  ], [1.1, 2.2]);
  const halo = new THREE.Sprite(glowSpriteMat(NX.void, 0.0)); halo.scale.setScalar(3.0); halo.position.set(0, 1.4, 0); m.root.add(halo);
  Object.assign(m, { weapon: blade, wingR, wingL, halo, skin: sk, headTop: 2.35, cloak });
  let time = 0;
  contract(m, { weapon: blade, springs: cloak.length, features: { beakHelm: true, featherCloak: true, featherPauldrons: true, featherBlade: true, talons: true },
    update(dt) { time += dt; updateStrips(cloak, dt, time, 0.1, m.rig.rotation.x + m.spine.rotation.x); } });
  if (clone) { m.outlines = []; m.proxy = null; m.lod = null; }
  return m;
}

let spare = null, spareClone = null;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3();
const BASE = newPose(HIP);
const ARRIVE = [[0, 4.2], [-0.5, 4.2], [0.5, 4.2], [0, 3.2], [-0.9, 3.2], [0.9, 3.2], [0, 2.4], [-1.4, 2.4], [1.4, 2.4], [0, 1.8]];

/** Shared brain for Nox and his clone (same tells): teleport-slash (parry), raven volley, shadow wave. */
function brain(ctx, e, model, D, isClone) {
  const game = ctx.game, vfx = game.vfx;
  const cur = newPose(HIP), tgt = newPose(HIP);
  const owner = () => (isClone ? e.parentBoss : e) || e;          // ≤ 1 teleport-slash per Nox incl. the clone
  const st = { cd: isClone ? 2.5 : 1.6, h: null, fade: 1, from: new THREE.Vector3(), to: new THREE.Vector3(), dir: new THREE.Vector3(), phase: rand(0, 6), speed: 0, stagger: 0, kneel: 0 };
  function ravens(at, s = 1) {
    _v.copy(at); _v.y += 1.1;
    vfx.burst(_v, { owner: 'enemy', count: Math.round(10 * s), color: [0x3a3050, 0x1a1424], speed: 3, spread: 1, size: 0.45, sizeEnd: 1.0, life: 0.6, shape: 'smoke', additive: false, drag: 2.5 });
    vfx.burst(_v, { owner: 'enemy', count: Math.round(5 * s), color: [0x4e4070, 0x2c2438], speed: 5, spread: 1, size: 0.3, sizeEnd: 0.2, life: 0.7, shape: 'raven', additive: false, drag: 1.5, gravity: -2 });
  }
  /** Arrival point: in front of / beside the player, inside the camera view (±0.87 rad of camera forward), inside the arena. */
  function arrival(out) {
    const pp = ctx.playerPos, cam = game.camera;
    if (cam) { cam.getWorldDirection(_f); _f.y = 0; if (_f.lengthSq() < 1e-6) _f.set(0, 0, 1); _f.normalize(); } else _f.set(0, 0, 1);
    const yaw = Math.atan2(_f.x, _f.z), A = e.arena || e.parentBoss?.arena, R = A ? A.radius - 1.5 : 1e9;
    const off = rand(-0.7, 0.7);
    // candidates inside the view cone (±0.7 rad) and inside the arena; nearest-to-random first
    let ok = false;
    for (let i = 0; i < ARRIVE.length && !ok; i++) {
      const a = yaw + clamp(off + ARRIVE[i][0], -0.75, 0.75), r = ARRIVE[i][1];
      out.set(pp.x + Math.sin(a) * r, 0, pp.z + Math.cos(a) * r);
      ok = !A || Math.hypot(out.x - A.position.x, out.z - A.position.z) <= R;
    }
    if (!ok && A) { const dx = out.x - A.position.x, dz = out.z - A.position.z, d = Math.hypot(dx, dz) || 1; out.x = A.position.x + dx / d * R; out.z = A.position.z + dz / d * R; }
    out.y = ctx.groundH(out.x, out.z);
    return out;
  }
  function start(kind) {
    const p = e.object.position, pp = ctx.playerPos;
    let h = null;
    if (kind === 'teleportSlash') {
      const O = owner();
      if (O._slashH && O._slashH.alive) return null;
      arrival(st.to);
      st.dir.set(pp.x - st.to.x, 0, pp.z - st.to.z); if (st.dir.lengthSq() < 1e-6) st.dir.set(0, 0, 1); st.dir.normalize();
      h = bossAttack(ctx, e, 'nox.teleportSlash', { shape: { pos: st.to, dir: st.dir } });
      if (!h) return null;
      O._slashH = h;
      e.setState('vanish'); ravens(p); ravens(st.to, 0.7);                 // raven-smoke marker at the arrival point
      ctx.audio('blink', { position: p, volume: 0.6, pitch: 0.55 });
    } else if (kind === 'volley') {
      h = bossAttack(ctx, e, 'nox.volley');
      if (h) e.setState('volleyWind');
    } else if (kind === 'wave') {
      st.dir.set(Math.sin(e.facing), 0, Math.cos(e.facing));
      h = bossAttack(ctx, e, 'nox.wave', { shape: { pos: p, dir: st.dir } });
      if (h) e.setState('waveWind');
    }
    if (h) st.h = h;
    return h;
  }
  e.noxStart = start;
  e.noxArrival = st.to;
  e.onBossParried = () => {
    if (e.state !== 'slash' && e.state !== 'slashWind') return;
    stopAttacks(e); st.h = null; st.fade = 1;
    const S = attackSpec('nox.teleportSlash');
    e.setState('staggered'); st.stagger = S.punishDur;
    if (!isClone) bossPunish(ctx, e, S.punishDur, S.punishMul);
    ctx.audio('parry', { position: e.object.position, volume: 1 });
  };
  e.noxKneel = (sec) => { stopAttacks(e); st.h = null; st.fade = 1; e.setState('kneel'); st.kneel = sec; };
  e.think = (dt, sm) => {
    if (!isClone) e.baseTick(dt);
    const pp = ctx.playerPos, p = e.object.position, d = e.distP;
    st.cd -= dt * sm;
    e.move.set(0, 0, 0);
    if (!isClone && (e.transitioning || e.state === 'purify')) return;
    const h = st.h;
    if (h && cancelled(h)) { st.h = null; st.fade = 1; if (!['staggered', 'kneel'].includes(e.state)) e.setState('recover'); }
    if (h && h.consumeStrike()) {
      st.h = null;
      if (h.bossId === 'nox.teleportSlash') {
        e.setState('slash');
        p.copy(st.from).addScaledVector(st.dir, 7); p.y = ctx.groundH(p.x, p.z);
        const r = bossHit(ctx, e, h, { attack: 'nox.teleportSlash', amount: D.slash, element: 'shadow', knockback: 9, launch: 2, from: st.from });
        vfx.smear?.('arc', e.getCenter(_v), e.object.quaternion, 2.0, 'shadow', { owner: 'enemy' });
        if (r?.parried && e.state !== 'staggered') e.onBossParried();
      } else if (h.bossId === 'nox.volley') {
        const S = attackSpec('nox.volley'), n = ((isClone ? e.parentBoss?.phase : e.phase) || 0) >= 1 ? S.orbs2 : S.orbs;
        model.weapon.getWorldPosition(_v); _v.y += 0.3;
        for (let i = 0; i < n; i++) {
          const a = e.facing + (i - (n - 1) / 2) * 0.26;
          _w.set(_v.x + Math.sin(a) * 0.6, _v.y, _v.z + Math.cos(a) * 0.6);
          ctx.projectiles.orb(_w, 'shadow', e, { color: NX.void, amount: D.volley, speed: 9, homing: S.homing, attackId: 'nox.volley' });
        }
        ctx.audio('cast_shadow', { position: p, volume: 0.8, pitch: 0.6 });
        e.setState('recover'); st.cd = rand(1.8, 2.8);
      } else if (h.bossId === 'nox.wave') {
        vfx.preset?.('explosion_shadow', _v.copy(p).addScaledVector(st.dir, 3.5), { owner: 'enemy', scale: 0.9, dir: st.dir });
        bossHit(ctx, e, h, { attack: 'nox.wave', amount: D.wave, element: 'shadow', knockback: 12, launch: 4, status: { blight: 2.5 } });
        e.setState('recover'); st.cd = rand(1.6, 2.4);
      }
    }
    switch (e.state) {
      case 'idle': case 'chase': {
        if (!isClone && !e.playerInArena(16)) { e.setState('idle'); break; }
        e.setState('chase');
        const want = Math.atan2(pp.x - p.x, pp.z - p.z);
        let df = want - e.facing; df = Math.atan2(Math.sin(df), Math.cos(df)); e.facing += clamp(df, -6 * dt, 6 * dt);
        if (d > 3.2) { e.move.x = Math.sin(e.facing) * 3.4 * sm; e.move.z = Math.cos(e.facing) * 3.4 * sm; }
        if (st.cd <= 0) {
          const r = Math.random();
          const k = isClone || r < 0.5 || d > 9 ? 'teleportSlash' : r < 0.78 ? 'volley' : 'wave';
          if (!start(k) && !start(k === 'teleportSlash' ? 'volley' : 'teleportSlash')) st.cd = 0.5;
        }
        break;
      }
      case 'vanish':
        st.fade = Math.max(0, 1 - e.stateT / 0.25);
        if (e.stateT >= attackSpec('nox.teleportSlash').marker) {
          p.copy(st.to); e.velocity.set(0, 0, 0); st.from.copy(st.to);
          e.facing = Math.atan2(st.dir.x, st.dir.z);
          ravens(p, 0.6); e.setState('slashWind');
        }
        break;
      case 'slashWind':
        st.fade = Math.min(1, e.stateT / 0.2);
        if (st.h && !st.h.locked) {
          st.dir.set(pp.x - st.from.x, 0, pp.z - st.from.z); if (st.dir.lengthSq() > 1e-6) { st.dir.normalize(); st.h.setDir(st.dir); }
          e.facing = Math.atan2(st.dir.x, st.dir.z);
        }
        if (st.h && rhythm(game, st.h) === 'strike') {
          const k = 1 - st.h.remaining / 0.12;           // the dash (≤ 0.12 s, ends on the hit)
          p.copy(st.from).addScaledVector(st.dir, 7 * clamp(k, 0, 1)); p.y = ctx.groundH(p.x, p.z);
        }
        break;
      case 'slash':
        if (e.stateT > 0.5) { st.cd = rand(1.6, 2.6) * (isClone ? 1.4 : 1); e.setState('chase'); }
        break;
      case 'volleyWind': case 'waveWind':
        if (st.h && !st.h.locked) {
          const want = Math.atan2(pp.x - p.x, pp.z - p.z); let df = want - e.facing; df = Math.atan2(Math.sin(df), Math.cos(df)); e.facing += clamp(df, -4 * dt, 4 * dt);
          if (e.state === 'waveWind') { st.dir.set(Math.sin(e.facing), 0, Math.cos(e.facing)); st.h.setDir(st.dir); st.h.setPos(p); }
        }
        break;
      case 'staggered':
        st.stagger -= dt;
        if (st.stagger <= 0) { e.setState('chase'); st.cd = 1.2; }
        break;
      case 'kneel':
        st.kneel -= dt;
        if (st.kneel <= 0) { e.setState('chase'); st.cd = 1.0; }
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
    if (s === 'purify' || s === 'dead' || s === 'kneel' || e.isBroken?.()) {
      const k = s === 'kneel' || s === 'purify' || s === 'dead' ? clamp(e.stateT / 0.5, 0, 1) : 1;
      tgt.hipY = HIP - 0.45 * k; tgt.pitch = 0.35 * k; tgt.lRx = -1.4 * k; tgt.kR = 2.0 * k; tgt.lLx = 0.2 * k; tgt.kL = 1.5 * k;   // kneel
      tgt.aRx = -0.4; tgt.aRz = -0.5; tgt.aLx = -0.2; tgt.headX = 0.4 * k - (s === 'purify' ? Math.max(0, e.stateT - 1.6) * 0.6 : 0);
      lambda = 5;
    } else if (s === 'slashWind') {
      tgt.aRx = -1.0; tgt.aRz = 0.9; tgt.fRx = -1.2; tgt.spineY = -0.9; tgt.pitch = 0.35; tgt.hipY = HIP - 0.25; tgt.lRx = -0.8; tgt.kR = 1.0; tgt.lLx = 0.6; tgt.kL = 0.5;
      tgt.aLx = -0.4; tgt.aLz = 0.9; lambda = 14;
      if (st.h && rhythm(game, st.h) === 'strike') { tgt.aRx = -1.2; tgt.aRz = -1.1; tgt.fRx = -0.1; tgt.spineY = 0.9; tgt.pitch = 0.6; lambda = 40; }
    } else if (s === 'slash') { tgt.aRx = -1.2; tgt.aRz = -1.1; tgt.fRx = -0.1; tgt.spineY = 0.9; tgt.pitch = 0.6; tgt.hipY = HIP - 0.3; tgt.lRx = 0.7; tgt.lLx = -0.8; tgt.kL = 0.8; lambda = 30; }
    else if (s === 'volleyWind') { const k = clamp(e.stateT / 0.6, 0, 1); tgt.aRx = -2.6 * k; tgt.aLx = -2.2 * k; tgt.aLz = 0.6; tgt.pitch = -0.2 * k; tgt.headX = -0.3 * k; lambda = 12; }
    else if (s === 'waveWind') { const k = clamp(e.stateT / 0.8, 0, 1); tgt.aRx = -3.0 * k; tgt.aRz = -0.2; tgt.pitch = -0.3 * k; tgt.hipY = HIP + 0.05; lambda = 10; }
    else if (s === 'staggered') { tgt.pitch = -0.45; tgt.spineX = -0.3; tgt.headX = -0.5; tgt.aRx = -1.8; tgt.aLx = -1.6; tgt.aLz = 1.1; tgt.aRz = -1.0; tgt.roll = Math.sin(t * 3) * 0.12; tgt.hipY = HIP - 0.1; lambda = 12; }
    else if (s === 'recover') { tgt.pitch = 0.35; tgt.aRx = -0.3; tgt.headX = 0.3; tgt.hipY = HIP - 0.1; lambda = 6; }
    else {
      const amt = clamp(st.speed / 3, 0, 1);
      if (amt > 0.05) walkCycle(tgt, st.phase, amt, 0.4);
      tgt.aRx = -0.4; tgt.aRz = -0.5; tgt.fRx = -0.6; tgt.aLx = -0.9; tgt.aLz = 0.4; tgt.fLx = -0.9; tgt.spineY = 0.25; tgt.kR += 0.15; tgt.kL += 0.2; tgt.hipY -= 0.06;
      tgt.spineX = Math.sin(t * 1.5) * 0.02;
    }
    dampPose(cur, tgt, lambda, dt);
    applyHumanoid(model, cur);
    const f = st.fade;
    model.rig.scale.set(1 + (1 - f) * 0.4, Math.max(0.02, f), 1 + (1 - f) * 0.4);
    const flare = s === 'vanish' || s === 'slashWind' ? 1 : s === 'staggered' ? 0.6 : 0.15 + Math.sin(t * 1.2) * 0.05;
    model.wingR.rotation.set(0.2, -0.3 - flare * 0.9, -flare * 0.5);
    model.wingL.rotation.set(0.2, 0.3 + flare * 0.9, flare * 0.5);
    if (isClone) model.update(dt);
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
    resist: { shadow: 0.5, light: 1.3 }, weakness: ['light'], phases: D.phases, transition: 2.0, music: 'boss', dissolveColor: 0xd8b86a,
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
  // breaking the void shield → a 3 s kneel (punish ×1.5)
  e.onShieldBroken = () => { if (e.defeated || e.state === 'purify') return; e.noxKneel(D.kneel); bossPunish(ctx, e, D.kneel, 1.5); };

  function spawnClone() {
    if (clone) return;
    const cm = spareClone || buildNox(true); spareClone = null;
    const pos = e.object.position.clone(); pos.x += 3;
    const c = makeEnemy(ctx, { kind: 'noxclone', model: cm, name: D.clone.name, hp: Math.round(e.maxHp * D.clone.hpFrac), radius: 0.6, height: 2.3, mass: 3, isBoss: false, noTumble: true, resist: { light: 2, shadow: 0.3 } }, pos);
    c.aggro = true; c.noPhysics = true; c.parentBoss = e; c.arena = A; c.isVoid = true; c.xpValue = 0; c.zoneDmgMul = e.zoneDmgMul; c.summoned = true;
    c.isDummy = false; c.noLod = false; c.codexKey = 'nox';
    c.weakness = ['light']; c.immune = []; c.attacks = e.attacks; c.timeMul = 1;
    brain(ctx, c, cm, D, true);
    c.debugAttack = (id) => c.noxStart(String(id).replace(/^nox\./, ''));
    c.deathUpdate = (dt) => { c.deathT += dt; if (!c._puff) { c._puff = true; ctx.dissolveFx(c, 1.0); } cm.rig.scale.setScalar(Math.max(0.01, 1 - c.deathT * 2)); return c.deathT > 0.5; };
    ctx.adopt(c);
    clone = c;
    game.events.emit('bossSummon', { boss: e, id: 'nox', kind: 'clone' });
  }
  function killClone() { if (clone && clone.alive) { stopAttacks(clone); clone.alive = false; clone.dying = true; clone.deathT = 0; } clone = null; }

  function startPurify(fast = false) {
    if (e.state === 'purify') return;
    killClone(); stopAttacks(e);
    e.invulnerable = true; e.voidShield = 0; e.transitioning = false;
    e.setState('purify');
    e._purifyT = fast ? 1.6 : 3.4;
    ctx.audio('boss_roar', { position: e.object.position, volume: 0.8, pitch: 0.9 });
    try { game.cinematic?.subtitle?.(D.purifyLine, 3); } catch (_) { /* */ }
  }

  const think = e.think;
  e.think = (dt, sm) => {
    if (!e.defeated && e.state !== 'purify') {
      if ((e.voidShield || 0) <= 0) { shieldT += dt; if (shieldT > D.shieldRegen) { shieldT = 0; e.voidShield = D.voidShield; } }
      else shieldT = 0;
    }
    if (e.state === 'purify') {
      e.baseTick(dt);
      e._purifyT -= dt;
      model.halo.material.color.setHex(0xd8b86a); model.halo.material.opacity = Math.min(0.6, (3.4 - e._purifyT) * 0.2);
      if (e._purifyT <= 0 && !purified) {
        purified = true;
        vfx.preset?.('explosion_light', e.getCenter(_v), { owner: 'enemy', scale: 1.2 });
        game.events.emit('kill', { target: e, source: 'player', point: _v.clone(), xp: e.xpValue || 0, zoneLevel: e.zoneLevel || 1 });
        e.defeat(null);
      }
      return;
    }
    think(dt, sm);
    model.halo.material.opacity = (e.voidShield || 0) > 0 ? 0.22 + Math.sin(e.bossT * 4) * 0.06 : 0;
  };
  e.isPurified = () => purified;
  finishBoss(ctx, e, {
    type: 'nox', preview: () => buildNox().root,
    debugAttack: (id) => { stopAttacks(e); e._slashH = null; e.setState('chase'); return e.noxStart(String(id).replace(/^nox\./, '')); },
    onBroken: (dur) => e.noxKneel(dur),
  });
  e.getClone = () => clone;
  return e;
}
createNox.prewarm = () => { if (!spare) spare = buildNox(); if (!spareClone) spareClone = buildNox(true); return [spare.root, spareClone.root]; };
