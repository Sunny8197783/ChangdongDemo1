// 칼리스, 거울의 사도 (id kalis, the 거울의 정원 ledge; DESIGN §8.5, CONTRACT §15). Human-size, 7000 HP.
// - Mirror: copies the player's class kit (CLASS_DEFS dodge / defend style, melee or caster family) and the 2 most-invested
//   elements (progression.pointsIn), and casts their attune basics (element bolt volleys) plus one quick skill (element burst).
// - Hades-style twist: at 0 HP he survives once (「거울은 깨지지 않는다」) at 50 % HP; the arena mirrors wake and fire light
//   beams; his projectiles can be parried / reflected back.
// - Phase 2 stagger check: 10 s to fill his break gauge (bossCheck kind 'stagger') before the 「거울 붕괴」 wipe (45 % maxHp, never lethal).
import { THREE, S, C, K, B, CAP, T, OCT, P, mergeParts, vcMat, vcBasicMat, pivot, buildSkin, glowify, once, glowSpriteMat } from './kit.js';
import { humanoid } from '../models.js';
import { createBoss } from '../bossbase.js';
import { newPose, dampPose, applyHumanoid, walkCycle } from '../base.js';
import { ALL_ELEMENTS, elColor, elName } from '../../core/elements.js';
import { CLASS_DEFS, familyOf } from '../../core/classes.js';
import { clamp, rand } from '../../core/utils.js';

export const KALIS_DATA = {
  id: 'kalis', name: '칼리스', title: '거울의 사도', sub: '그대의 힘을 비추는 자',
  hp: 7000, reviveFrac: 0.5,
  phases: [{ name: '거울의 사도' }],
  phase2Name: '깨지지 않는 거울', reviveLine: '거울은 깨지지 않는다.',
  bolt: 13, burst: 22, slash: 20, beam: 18, wipeFrac: 0.45, checkDur: 10, checkEvery: 34,
  fallbackElements: ['light', 'shadow'],
};
const HIP = 0.98;
const KC = { plate: 0xdfe6f0, plateDark: 0xa8b4c8, trim: 0xffe9a8, cloth: 0xf4f0ff, clothDark: 0xc8c0e8, glass: 0xbfe8ff };
const STATUS_OF = { fire: { burning: 3 }, ice: { chilled: { dur: 4, stacks: 2 } }, lightning: { shocked: 3 }, water: { wet: 6 }, nature: { seeded: { dur: 6, stacks: 2 } }, shadow: { blight: 2.5 }, earth: { muddy: 1 } };

function geos() {
  return once('kalis', () => ({
    torso: mergeParts([
      P(S(0.38, 14, 10), KC.plate, [0, 0.3, 0], [0, 0, 0], [1.1, 1.15, 0.8]),
      P(OCT(0.32), KC.glass, [0, 0.38, 0.22], [0, 0, 0], [1, 1.2, 0.5]),
      P(S(0.22, 10, 8), KC.plateDark, [0.42, 0.56, 0], [0, 0, -0.4], [1.2, 0.7, 1.1]),
      P(S(0.22, 10, 8), KC.plateDark, [-0.42, 0.56, 0], [0, 0, 0.4], [1.2, 0.7, 1.1]),
      P(K(0.1, 0.5, 4), KC.glass, [0.48, 0.8, -0.05], [0, 0, -0.4]), P(K(0.1, 0.5, 4), KC.glass, [-0.48, 0.8, -0.05], [0, 0, 0.4]),
      P(B(0.72, 1.2, 0.04), KC.cloth, [0, -0.1, -0.32], [0.12, 0, 0]),
      P(B(0.66, 0.12, 0.05), KC.trim, [0, -0.66, -0.4], [0.12, 0, 0]),
    ]),
    pelvis: mergeParts([
      P(S(0.3, 12, 9), KC.plateDark, [0, 0, 0], [0, 0, 0], [1.1, 0.7, 0.9]),
      P(T(0.32, 0.04, 14), KC.trim, [0, 0.05, 0], [Math.PI / 2, 0, 0]),
      P(new THREE.CylinderGeometry(0.34, 0.5, 0.7, 12, 1, true), KC.cloth, [0, -0.36, 0]),
    ]),
    head: mergeParts([
      P(S(0.23, 14, 10), KC.plate, [0, 0.14, 0], [0, 0, 0], [1, 1.1, 1.05]),
      P(B(0.34, 0.24, 0.04), KC.glass, [0, 0.12, 0.22]),        // mirror visor
      ...[0, 1, 2, 3, 4].map((i) => P(K(0.05, 0.36 + (i % 2) * 0.14, 4), KC.trim, [(i - 2) * 0.09, 0.42, -0.02], [-0.2, 0, (i - 2) * -0.18])),   // halo crown
    ]),
    upperArm: mergeParts([P(CAP(0.1, 0.24), KC.plateDark, [0, -0.17, 0])]),
    foreArm: mergeParts([P(CAP(0.1, 0.2), KC.plate, [0, -0.16, 0]), P(C(0.13, 0.11, 0.16, 8), KC.trim, [0, -0.28, 0])]),
    thigh: mergeParts([P(CAP(0.12, 0.22), KC.plateDark, [0, -0.18, 0])]),
    shin: mergeParts([P(CAP(0.11, 0.22), KC.plate, [0, -0.17, 0]), P(B(0.16, 0.08, 0.3), KC.plateDark, [0, -0.38, 0.06])]),
    glaive: mergeParts([
      P(C(0.03, 0.03, 2.0, 6), KC.trim, [0, 0, 0.3], [Math.PI / 2, 0, 0]),
      P(K(0.12, 0.8, 4), KC.glass, [0, 0, 1.65], [Math.PI / 2, 0, 0], [1, 1, 0.25]),
      P(K(0.08, 0.5, 4), KC.glass, [0, 0, -0.85], [-Math.PI / 2, 0, 0], [1, 1, 0.25]),
      P(OCT(0.09), KC.trim, [0, 0, 1.2]),
    ]),
  }));
}
function glowFor(els) {
  return once('kalisGlow:' + els.join(','), () => ({
    visor: glowify(mergeParts([P(B(0.28, 0.03, 0.02), 0xffffff, [0, 0.14, 0.245])]), 2.4),
    prismA: glowify(mergeParts([P(OCT(0.16), elColor(els[0], 'hex'), [0, 0, 0], [0, 0, 0], [1, 1.5, 1])]), 2.0),
    prismB: glowify(mergeParts([P(OCT(0.16), elColor(els[1], 'hex'), [0, 0, 0], [0, 0, 0], [1, 1.5, 1])]), 2.0),
    edge: glowify(mergeParts([P(B(0.02, 0.02, 0.7), elColor(els[0], 'hex'), [0, 0.04, 1.6])]), 2.2),
  }));
}
export function buildKalis(els = KALIS_DATA.fallbackElements) {
  const g = geos(), gl = glowFor(els);
  const m = humanoid(g, { hipY: HIP, neckY: 0.72, shoulderX: 0.46, shoulderY: 0.54, upperLen: 0.38, foreLen: 0.34, hipX: 0.19, thighLen: 0.44 });
  const glaive = pivot(m.handR, 0, 0, 0); glaive.rotation.x = -0.25;
  const prA = pivot(m.root, 0.8, 2.1, -0.3), prB = pivot(m.root, -0.8, 2.1, -0.3);
  m.bones.push(glaive, prA, prB);
  const n = m.bones.length;
  m.parts.push([n - 3, g.glaive]);
  const sk = buildSkin('kalis:' + els.join(','), m.root, m.bones, [
    { name: 'body', mat: vcMat(), parts: m.parts, outline: 0.022 },
    { name: 'glow', mat: vcBasicMat(), parts: [[2, gl.visor], [n - 2, gl.prismA], [n - 1, gl.prismB], [n - 3, gl.edge]], shadow: false },
  ], [1.1, 2.4]);
  const halo = new THREE.Sprite(glowSpriteMat(0xfff1c0, 0.25)); halo.scale.setScalar(2.4); halo.position.set(0, 2.2, -0.2); m.root.add(halo);
  Object.assign(m, { weapon: glaive, prismA: prA, prismB: prB, halo, skin: sk, outlines: sk.outlines, headTop: 2.4, elements: els.slice() });
  return m;
}

/** The two most-invested elements (ties → the class primaries), never undefined. */
export function mirrorElements(game) {
  const P = game.progression;
  const cls = P?.cls;
  const prim = CLASS_DEFS[cls]?.primary || [];
  const scored = ALL_ELEMENTS.map((el) => {
    let pts = 0; try { pts = P?.pointsIn?.(el, { forGates: false }) || 0; } catch (_) { pts = 0; }
    return { el, pts: pts + (prim.includes(el) ? 0.5 : 0) };
  }).sort((a, b) => b.pts - a.pts);
  const out = scored.filter((s) => s.pts > 0).slice(0, 2).map((s) => s.el);
  for (const el of [...prim, ...KALIS_DATA.fallbackElements]) if (out.length < 2 && !out.includes(el)) out.push(el);
  return out.slice(0, 2);
}

let spare = null;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
const BASE = newPose(HIP);

export function createKalis(ctx, arena, opts = {}) {
  const game = ctx.game, vfx = game.vfx;
  const D = KALIS_DATA;
  const A = arena || { position: new THREE.Vector3(60, 38, -150), radius: 18 };
  const els = mirrorElements(game);
  const cls = game.progression?.cls || 'mage';
  const kit = { family: familyOf(cls), style: CLASS_DEFS[cls]?.style || 'staff', dodge: CLASS_DEFS[cls]?.dodge || 'blink', defend: CLASS_DEFS[cls]?.defend || 'barrier' };
  const model = (spare && spare.elements.join() === els.join()) ? spare : buildKalis(els); spare = null;
  const cur = newPose(HIP), tgt = newPose(HIP);
  let revived = false, cd = 2, dodgeCd = 0, guardT = 0, guardCd = 6, hits = 0, hitWin = 0, act = null, actT = 0, tele = null, speed = 0, ph = 0, fade = 1;
  let check = { active: false, t: 0, next: D.checkEvery }, beamCd = 6, prismT = 0;
  const mirrors = (A.mirrors || []).map((m) => ({ ...m, pos: (m.position || m.pos).clone() }));
  const actPos = new THREE.Vector3(), actDir = new THREE.Vector3();

  const e = createBoss(ctx, {
    id: 'kalis', name: D.name, title: D.title, sub: D.sub, model, arena: A, zoneId: 'ascent',
    position: A.position.clone(), baseHp: D.hp, radius: 0.6, height: 2.3, mass: 3, breakMax: 120, music: 'boss',
    resist: { [els[0]]: 0.6, [els[1]]: 0.6 }, phases: D.phases, dissolveColor: 0xfff1c0,
    facing: Math.atan2(ctx.realPlayerPos.x - A.position.x, ctx.realPlayerPos.z - A.position.z),
    canDie: () => revived,
    onZero: () => revive(),
    debugDefeat: (b) => { revived = true; b.transitioning = false; b.invulnerable = false; game.combat.dealDamage(b, { amount: b.hp + 1, fixed: true, source: 'player', noReaction: true, ignoreShield: true, noCrit: true }); if (!b.defeated) b.defeat(null); return true; },
    onDebugPhase: () => { if (!revived) revive(); },
    dissolveAt: 0.8, dissolveDur: 1.8,
  });
  e.noPhysics = true;
  e.object.position.y = ctx.groundH(A.position.x, A.position.z);
  e.mirror = { elements: els, kit };
  e.weakness = ALL_ELEMENTS.filter((el) => game.elements?.DEFS?.[els[0]]?.opposite === el || game.elements?.DEFS?.[els[1]]?.opposite === el);
  // phase 2 (the revive) shown on the bar; the framework keeps a single HP phase so 0 HP routes to onZero → revive
  const basePayload = e.spawnPayload;
  e.spawnPayload = () => { const o = basePayload(); o.phases = [{ at: 0, name: D.phase2Name }]; return o; };
  e.debugPhase = (n) => { if (n >= 2 && !revived) revive(); return revived ? 2 : 1; };

  function revive() {
    if (revived) return;
    revived = true;
    e.hp = Math.round(e.maxHp * D.reviveFrac);
    e.invulnerable = true; e.transitioning = true;
    act = null; tele?.stop?.(); tele = null;
    e.setState('revive');
    game.events.emit('bossPhase', { boss: e, id: 'kalis', phase: 2, name: D.phase2Name });
    try { game.cinematic?.subtitle?.(D.reviveLine, 2.6); } catch (_) { /* */ }
    vfx.preset?.('explosion_light', e.getCenter(_v), { scale: 2.6 });
    vfx.flashSprite?.(_v, 0xffffff, 8, 0.4, 1.6);
    for (const m of mirrors) vfx.runeCircle?.(m.pos, { element: 'light', r: 1.6, dur: 3, rotSpeed: 1 });
    ctx.audio('shatter', { position: e.object.position, volume: 1, pitch: 0.6 });
    check.next = 12;
    setTimeoutGame(2.4, () => { e.invulnerable = false; e.transitioning = false; e.setState('idle'); });
  }
  const timers = [];
  function setTimeoutGame(t, fn) { timers.push({ t, fn }); }

  function orbs(el, n) {
    model.weapon.getWorldPosition(_v); _v.y += 0.2;
    for (let i = 0; i < n; i++) {
      const a = e.facing + (i - (n - 1) / 2) * 0.18;
      _w.set(_v.x + Math.sin(a) * 0.5, _v.y, _v.z + Math.cos(a) * 0.5);
      ctx.projectiles.orb(_w, el, e, { color: elColor(el, 'hex'), amount: D.bolt, speed: 10, status: STATUS_OF[el] || null });
    }
    ctx.audio('cast_' + el, { position: e.object.position, volume: 0.7, pitch: 0.85 });
  }
  function dodge() {
    // the player's own dodge style (blink / dashstep / backflip / shieldstep / spiritswap / shadowroll) → a quick reposition
    const p = e.object.position, pp = ctx.playerPos;
    const away = Math.atan2(p.x - pp.x, p.z - pp.z) + rand(-0.9, 0.9);
    const dist = kit.dodge === 'blink' || kit.dodge === 'spiritswap' ? 6 : 3.5;
    try { vfx.spawnAfterimage?.(model.root, { color: elColor(els[0], 'hex'), life: 0.4 }); } catch (_) { /* */ }
    vfx.burst(e.getCenter(_v), { count: 18, color: [0xffffff, elColor(els[0], 'hex')], speed: 4, spread: 1, size: 0.14, sizeEnd: 0, life: 0.4, shape: 'spark' });
    p.x += Math.sin(away) * dist; p.z += Math.cos(away) * dist; e.clampToArena(1.5); p.y = ctx.groundH(p.x, p.z);
    ctx.audio('blink', { position: p, volume: 0.6, pitch: 1.1 });
    dodgeCd = 4;
  }
  // defend: the player's own defend style → a guard window (×0.4 from the front; 'counter' strikes back)
  e.onBeforeDamage = (hit) => {
    if (guardT <= 0 || hit?.isDot) return null;
    if (kit.defend === 'counter' && !act) { act = 'counter'; actT = 0; }
    vfx.burst(e.getCenter(_v), { count: 10, color: [0xffffff, 0xbfe8ff], speed: 4, spread: 1, size: 0.12, sizeEnd: 0, life: 0.3, shape: 'spark' });
    return { mul: 0.4 };
  };
  e.react = ((base) => (res, hit, lx, lz) => {
    base?.(res, hit, lx, lz);
    hits++; hitWin = 1.2;
    if (hits >= 3 && dodgeCd <= 0 && !act && !e.transitioning) { hits = 0; dodge(); }
  })(e.react);

  function beginAct(kind) {
    act = kind; actT = 0;
    const p = e.object.position, pp = ctx.playerPos;
    actDir.set(pp.x - p.x, 0, pp.z - p.z).normalize();
    game.events.emit('enemyAttack', { enemy: e, kind });
    if (kind === 'burst') {
      actPos.set(pp.x, 0, pp.z); actPos.y = ctx.groundH(actPos.x, actPos.z);
      tele = ctx.tele({ shape: 'circle', pos: actPos, r: 3.4, dur: 1.0, color: 'damage' });
      vfx.runeCircle?.(actPos, { element: els[1], r: 3.4, dur: 1.2, rotSpeed: 2 });
    } else if (kind === 'slash') {
      tele = ctx.tele({ shape: 'line', pos: p, dir: actDir, len: 7, width: 1.8, dur: 0.7, color: 'damage', parryable: true });
      actPos.copy(p);
    }
  }
  function startCheck() {
    check.active = true; check.t = 0;
    e.breakValue = e.breakMax;
    act = null; tele?.stop?.();
    const dur = D.checkDur + (game.difficulty?.checkAdd ?? (game.settings?.values?.difficulty === 'easy' ? 4 : 0));
    check.dur = dur;
    e.emitCheck('stagger', 'start', dur);
    vfx.runeCircle?.(e.object.position, { element: 'light', r: 4, dur, rotSpeed: 0.6 });
    tele = ctx.tele({ shape: 'circle', pos: e.object.position, r: A.radius - 1, dur, color: 0xffe08a });
  }
  const offBreak = game.events.on('break', (p) => {
    if (p?.target !== e || !check.active) return;
    check.active = false; check.next = D.checkEvery;
    tele?.stop?.(); tele = null;
    e.emitCheck('stagger', 'success', 0);
    e.setState('staggered'); guardT = 0;
    vfx.preset?.('explosion_light', e.getCenter(_v), { scale: 1.8 });
  });

  e.think = (dt, sm) => {
    e.baseTick(dt);
    for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
    const p = e.object.position, pp = ctx.playerPos, d = e.distP;
    cd -= dt * sm; dodgeCd -= dt; guardT -= dt; guardCd -= dt; hitWin -= dt; if (hitWin <= 0) hits = 0;
    prismT += dt;
    speed = 0;
    if (e.transitioning || e.state === 'revive' || !e.playerInArena(14)) return;
    if (e.state === 'staggered') { if (e.stateT > 5) e.setState('idle'); return; }
    // phase 2: mirror beams + the stagger check
    if (revived) {
      beamCd -= dt;
      if (beamCd <= 0 && mirrors.length) {
        beamCd = rand(5, 7);
        const m = mirrors[Math.floor(rand(0, mirrors.length))];
        _d.set(pp.x - m.pos.x, 0, pp.z - m.pos.z); const len = _d.length(); _d.normalize();
        const tp = m.pos.clone(); tp.y = ctx.groundH(tp.x, tp.z);
        const h = ctx.tele({ shape: 'line', pos: tp, dir: _d, len: len + 4, width: 1.6, dur: 1.1, color: 0xffe08a });
        const dir = _d.clone();
        setTimeoutGame(1.1, () => {
          const end = tp.clone().addScaledVector(dir, len + 4); end.y += 1.2;
          const from = tp.clone(); from.y += 1.2;
          try { vfx.beam?.(from, end, { color: 0xffe9a8, width: 0.5, duration: 0.35 }); } catch (_) { /* */ }
          _v.subVectors(ctx.realPlayerPos, tp).setY(0);
          const along = _v.dot(dir), across = Math.abs(_v.x * dir.z - _v.z * dir.x);
          const pe = game.player?.entity;
          if (pe && pe.alive !== false && along > 0 && along < len + 4 && across < 1.0) game.combat.dealDamage(pe, { amount: D.beam, element: 'light', source: e, point: ctx.realPlayerPos.clone().setY(ctx.realPlayerPos.y + 1), knockback: 6 });
          void h;
        });
      }
      if (!check.active) { check.next -= dt; if (check.next <= 0) startCheck(); }
      else {
        check.t += dt;
        if (check.t >= check.dur) {
          check.active = false; check.next = D.checkEvery; tele?.stop?.(); tele = null;
          e.emitCheck('stagger', 'fail', 0);
          // 거울 붕괴: a heavy, never-lethal blow
          const pe = game.player?.entity;
          vfx.preset?.('explosion_light', e.getCenter(_v), { scale: 3.5 });
          vfx.screenFlash?.(0xffffff, 0.5);
          if (pe && pe.alive !== false) {
            const mh = game.player?.maxHp || pe.maxHp || 100;
            const dmg = Math.min(Math.round(mh * D.wipeFrac), Math.max(0, (pe.hp ?? mh) - 1));
            if (dmg > 0) game.combat.dealDamage(pe, { amount: dmg, fixed: true, element: 'light', source: e, point: ctx.realPlayerPos.clone().setY(ctx.realPlayerPos.y + 1), knockback: 16, launch: 6, noReaction: true });
          }
        }
        return;   // he channels during the check
      }
    }
    if (act) {
      actT += dt * sm;
      if (act === 'volley') { if (actT > 0.55 && !e._fired) { e._fired = true; orbs(els[0], revived ? 5 : 3); } if (actT > 1.0) { act = null; e._fired = false; cd = rand(1.4, 2.2); } }
      else if (act === 'burst') {
        if (actT > 1.0 && !e._fired) {
          e._fired = true; tele = null;
          vfx.preset?.('explosion_' + els[1], _v.copy(actPos).setY(actPos.y + 0.6), { scale: 1.6 });
          const pe = ctx.target, tp = ctx.playerPos;
          if (pe && pe.alive !== false && Math.hypot(tp.x - actPos.x, tp.z - actPos.z) < 3.4 + 0.4) ctx.hitPlayer(e, { amount: D.burst, element: els[1], knockback: 8, launch: 4, status: STATUS_OF[els[1]] || null });
        }
        if (actT > 1.5) { act = null; e._fired = false; cd = rand(1.6, 2.4); }
      } else if (act === 'slash' || act === 'counter') {
        const wind = act === 'counter' ? 0.15 : 0.7;
        if (actT > wind && !e._fired) {
          e._fired = true;
          p.addScaledVector(actDir, act === 'counter' ? 1.5 : 5.5); e.clampToArena(1.5); p.y = ctx.groundH(p.x, p.z);
          vfx.smear?.('arc', e.getCenter(_v), e.object.quaternion, 2, els[0]);
          if (ctx.meleeCheck(e, act === 'counter' ? 3 : 3.2, 1.0)) ctx.hitPlayer(e, { amount: D.slash, element: els[0], knockback: 9, status: STATUS_OF[els[0]] || null });
          tele?.stop?.(); tele = null;
        }
        if (actT > wind + 0.5) { act = null; e._fired = false; cd = rand(1.2, 2); }
      }
      return;
    }
    // positioning: casters kite, melee kits press in
    const want = Math.atan2(pp.x - p.x, pp.z - p.z);
    let df = want - e.facing; df = Math.atan2(Math.sin(df), Math.cos(df)); e.facing += clamp(df, -7 * dt, 7 * dt);
    const ideal = kit.family === 'melee' ? 2.8 : 8;
    const radial = d > ideal + 1 ? 1 : d < ideal - 1 ? -1 : 0;
    const strafe = Math.sin(e.bossT * 0.7) > 0 ? 1 : -1;
    _d.set(Math.sin(e.facing), 0, Math.cos(e.facing));
    speed = 3.4 * sm;
    p.x += (_d.x * radial + -_d.z * strafe * 0.6) * speed * dt; p.z += (_d.z * radial + _d.x * strafe * 0.6) * speed * dt;
    e.clampToArena(1.5); p.y = ctx.groundH(p.x, p.z);
    if (guardCd <= 0 && d < 6) { guardCd = rand(5, 8); guardT = 1.2; }
    if (cd <= 0) {
      const r = Math.random();
      if (kit.family === 'melee' && d < 5 && r < 0.55) beginAct('slash');
      else if (r < 0.75) beginAct('volley');
      else beginAct('burst');
    }
  };

  e.pose = (dt) => {
    Object.assign(tgt, BASE);
    const t = game.time;
    ph += dt * (1.2 + speed * 2.2);
    let lambda = 10;
    const s = e.state;
    if (s === 'revive') { const k = clamp(e.stateT / 2.2, 0, 1); tgt.pitch = -0.5 * (1 - k); tgt.headX = -0.6 * (1 - k); tgt.aRx = -2.8 * k; tgt.aLx = -2.8 * k; tgt.aRz = -0.4; tgt.aLz = 0.4; tgt.hipY = HIP + 0.2 * Math.sin(k * Math.PI); lambda = 6; }
    else if (s === 'staggered') { tgt.pitch = -0.4; tgt.headX = -0.5; tgt.aRx = -1.6; tgt.aLx = -1.6; tgt.roll = Math.sin(t * 3) * 0.12; tgt.hipY = HIP - 0.2; tgt.kR = tgt.kL = 0.6; lambda = 10; }
    else if (check.active) { tgt.aRx = -3.0; tgt.aLx = -3.0; tgt.aRz = -0.6; tgt.aLz = 0.6; tgt.headX = -0.4; tgt.pitch = -0.1; tgt.hipY = HIP + 0.1 + Math.sin(t * 2) * 0.05; lambda = 6; }
    else if (act === 'volley') { const k = clamp(actT / 0.5, 0, 1); tgt.aRx = -1.6 * k; tgt.fRx = -0.2; tgt.aLx = -1.2 * k; tgt.aLz = 0.4; tgt.spineY = 0.3 * k; lambda = 14; }
    else if (act === 'burst') { const k = clamp(actT / 0.8, 0, 1); tgt.aRx = -2.9 * k; tgt.aLx = -0.4; tgt.pitch = -0.15 * k; tgt.headX = -0.2; lambda = 10; }
    else if (act === 'slash' || act === 'counter') { const k = clamp(actT / 0.6, 0, 1); tgt.aRx = -1.1 - k * 0.8; tgt.aRz = 0.8 - (e._fired ? 2 : 0); tgt.spineY = e._fired ? 0.8 : -0.7 * k; tgt.pitch = 0.3; tgt.hipY = HIP - 0.2; tgt.lRx = -0.6; tgt.kR = 0.8; tgt.lLx = 0.5; lambda = e._fired ? 28 : 12; }
    else {
      const amt = clamp(speed / 3.4, 0, 1);
      if (amt > 0.05) walkCycle(tgt, ph, amt * 0.8, 0.3);
      tgt.aRx = -0.5; tgt.aRz = -0.3; tgt.fRx = -0.7; tgt.aLx = -0.3; tgt.aLz = 0.3; tgt.spineX = Math.sin(t * 1.5) * 0.02;
      if (guardT > 0) { tgt.aLx = -1.5; tgt.fLx = -1.2; tgt.aRx = -1.2; tgt.fRx = -1.0; tgt.hipY -= 0.1; }
    }
    dampPose(cur, tgt, lambda, dt);
    applyHumanoid(model, cur);
    // floating prisms orbit (secondary motion), brighter in phase 2
    const r = revived ? 1.1 : 0.85, w = revived ? 2.2 : 1.2;
    model.prismA.position.set(Math.sin(prismT * w) * r, 2.0 + Math.sin(prismT * 2.3) * 0.15, Math.cos(prismT * w) * r);
    model.prismB.position.set(-Math.sin(prismT * w) * r, 2.0 + Math.cos(prismT * 2.1) * 0.15, -Math.cos(prismT * w) * r);
    model.prismA.rotation.y += dt * 2; model.prismB.rotation.y -= dt * 2;
    model.halo.material.opacity = (revived ? 0.55 : 0.25) + Math.sin(t * 3) * 0.08 + (guardT > 0 ? 0.3 : 0);
    void fade;
  };
  const baseClean = e.cleanupParts;
  e.cleanupParts = () => { baseClean(); try { offBreak(); } catch (_) { /* */ } };
  e.isRevived = () => revived;
  void elName;
  return e;
}
createKalis.prewarm = (ctx) => {
  const els = mirrorElements(ctx.game);
  if (!spare || spare.elements.join() !== els.join()) spare = buildKalis(els);
  return spare.root;
};
