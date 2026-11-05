// 칼리스, 거울의 사도 (id kalis, the 거울의 정원 ledge; PLAN v4 §4.13). Human-size, 7000 HP.
// - Mirror: copies the player's class kit (CLASS_DEFS dodge style, melee or caster family) and the 2 most-invested elements;
//   his copied element effects are ENEMY-owned (vfx owner:'enemy': dark core + the element's mid rim; never the player's look).
// - Attacks (game.tells, bossbase bossAttack / bossHit):
//   kalis.slash (danger, conecap)  capsule along the 5.5 m dash + the end cone, drawn together; afterwards his mirror armour cracks 1.0 s (×1.5)
//   kalis.counter                  a visible 반격 자세 (mirror shield glows); hitting him during it → a 0.5 s counter cone (r 3, 0.44 rad)
//   kalis.volley (projectile)      3 orbs (phase 2: 4), homing 0.5 s
//   kalis.burst (danger)           circle r 3.4 (the tells decal is the marker; no rune circle)
//   kalis.beams (phase 2)          lines from the ledge mirrors
//   kalis.check                    10 s (+ difficulty checkAddSec): a bar + 3 crystal targets (his mirror shards); break all 3 or his gauge → 4 s stagger
// - At 0 HP he survives once (「거울은 깨지지 않는다」) at 50 % HP.
import { THREE, S, C, K, B, CAP, T, OCT, P, mergeParts, vcMat, vcBasicMat, pivot, buildSkin, glowify, once, glowSpriteMat } from './kit.js';
import { humanoid } from '../models.js';
import { skinOutlineMat } from '../common.js';
import { createBoss, finishBoss, bossAttack, bossHit, bossPunish, rhythm, cancelled, stopAttacks, bossTime } from '../bossbase.js';
import { newPose, dampPose, applyHumanoid, walkCycle } from '../base.js';
import { ALL_ELEMENTS, elColor } from '../../core/elements.js';
import { CLASS_DEFS, familyOf } from '../../core/classes.js';
import { clamp, rand } from '../../core/utils.js';
import { attackSpec, BOSS_UI } from './codex.js';
import { proxyParts, strips, updateStrips, contract } from './rig.js';

export const KALIS_DATA = {
  id: 'kalis', name: '칼리스', title: '거울의 사도', sub: '그대의 힘을 비추는 자',
  hp: 7000, reviveFrac: 0.5,
  phases: [{ name: '거울의 사도' }],
  phase2Name: '깨지지 않는 거울', reviveLine: '거울은 깨지지 않는다.',
  bolt: 13, burst: 22, slash: 20, counter: 18, beam: 18, wipeFrac: 0.45, checkDur: 10, checkEvery: 34,
  fallbackElements: ['light', 'shadow'], shards: 6,
};
const HIP = 0.98;
// white plate with a glass-blue gradient toward the extremities (§4.13)
const KC = { plate: 0xe6ecf4, plateMid: 0xc4d4e8, plateDark: 0x9cb2d0, trim: 0xd8c48a, cloth: 0xe8e4f4, clothDark: 0xb8b0d8, glass: 0x9fd0ee, glassDeep: 0x6a9cc8 };
const STATUS_OF = { fire: { burning: 3 }, ice: { chilled: { dur: 4, stacks: 2 } }, lightning: { shocked: 3 }, water: { wet: 6 }, nature: { seeded: { dur: 6, stacks: 2 } }, shadow: { blight: 2.5 }, earth: { muddy: 1 } };

function geos() {
  return once('kalis4', () => ({
    torso: mergeParts([
      P(S(0.38, 14, 10), KC.plate, [0, 0.34, 0], [0, 0, 0], [1.1, 1.05, 0.8]),
      P(S(0.36, 12, 8), KC.plateMid, [0, 0.08, 0], [0, 0, 0], [1.0, 0.6, 0.78]),
      P(OCT(0.3), KC.glass, [0, 0.4, 0.23], [0, 0, 0], [1, 1.2, 0.45]),
      P(OCT(0.14), KC.glassDeep, [0, 0.4, 0.3], [0, 0, 0], [1, 1.2, 0.4]),
      P(S(0.22, 10, 8), KC.plateMid, [0.42, 0.58, 0], [0, 0, -0.4], [1.25, 0.7, 1.1]),
      P(S(0.22, 10, 8), KC.plateMid, [-0.42, 0.58, 0], [0, 0, 0.4], [1.25, 0.7, 1.1]),
      P(K(0.1, 0.5, 4), KC.glass, [0.48, 0.82, -0.05], [0, 0, -0.4]), P(K(0.1, 0.5, 4), KC.glass, [-0.48, 0.82, -0.05], [0, 0, 0.4]),
      P(B(0.6, 0.05, 0.05), KC.trim, [0, 0.66, 0.24], [-0.3, 0, 0]),
    ]),
    pelvis: mergeParts([
      P(S(0.3, 12, 9), KC.plateDark, [0, 0, 0], [0, 0, 0], [1.1, 0.7, 0.9]),
      P(T(0.32, 0.04, 14), KC.trim, [0, 0.05, 0], [Math.PI / 2, 0, 0]),
      P(new THREE.CylinderGeometry(0.34, 0.5, 0.7, 12, 1, true), KC.clothDark, [0, -0.36, 0]),
      ...[-1, 0, 1].map((i) => P(B(0.16, 0.42, 0.03), KC.plateMid, [i * 0.18, -0.3, 0.33], [0.12, 0, i * -0.1])),     // tassets
    ]),
    head: mergeParts([
      P(S(0.23, 14, 10), KC.plate, [0, 0.14, 0], [0, 0, 0], [1, 1.1, 1.05]),
      P(B(0.34, 0.24, 0.04), KC.glass, [0, 0.12, 0.22]),        // mirror visor
      // crown of facets
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => P(OCT(0.07 + (i % 2) * 0.03), i % 2 ? KC.glass : KC.glassDeep, [Math.sin((i - 3) * 0.42) * 0.22, 0.42 + (i % 2) * 0.06, Math.cos((i - 3) * 0.42) * 0.12 - 0.04], [0, (i - 3) * 0.42, 0], [0.6, 1.8, 0.6])),
      P(T(0.2, 0.02, 14), KC.trim, [0, 0.34, -0.02], [Math.PI / 2 - 0.15, 0, 0]),
    ]),
    upperArm: mergeParts([P(CAP(0.1, 0.24), KC.plateMid, [0, -0.17, 0]), P(S(0.12, 8, 6), KC.plate, [0, -0.02, 0], [0, 0, 0], [1.1, 0.7, 1.1])]),
    foreArm: mergeParts([P(CAP(0.1, 0.2), KC.plate, [0, -0.16, 0]), P(C(0.13, 0.11, 0.16, 8), KC.trim, [0, -0.28, 0]), P(B(0.12, 0.12, 0.14), KC.plateDark, [0, -0.4, 0.02])]),
    thigh: mergeParts([P(CAP(0.12, 0.22), KC.plateMid, [0, -0.18, 0])]),
    shin: mergeParts([P(CAP(0.11, 0.22), KC.plate, [0, -0.17, 0]), P(K(0.07, 0.18, 4), KC.glass, [0, -0.04, 0.12], [-0.3, 0, 0]), P(B(0.16, 0.08, 0.3), KC.plateDark, [0, -0.38, 0.06])]),
    // spear with a mirror blade
    glaive: mergeParts([
      P(C(0.03, 0.03, 2.0, 6), KC.trim, [0, 0, 0.3], [Math.PI / 2, 0, 0]),
      P(K(0.14, 0.85, 4), KC.glass, [0, 0, 1.68], [Math.PI / 2, 0, 0], [1, 1, 0.22]),
      P(K(0.09, 0.4, 4), KC.glassDeep, [0, 0, 1.45], [Math.PI / 2, 0, 0], [1, 1, 0.3]),
      P(B(0.36, 0.04, 0.06), KC.trim, [0, 0, 1.22]),
      P(K(0.08, 0.5, 4), KC.glass, [0, 0, -0.85], [-Math.PI / 2, 0, 0], [1, 1, 0.25]),
    ]),
    shield: mergeParts([P(new THREE.CircleGeometry(0.36, 6), KC.glass, [0, -0.3, 0.16], [0, 0, 0], [1, 1.25, 1]), P(T(0.36, 0.03, 6, 4), KC.trim, [0, -0.3, 0.165], [0, 0, Math.PI / 6], [1, 1.25, 1])]),
    cape: mergeParts([P(B(0.2, 0.62, 0.03), KC.cloth, [0, -0.31, 0]), P(B(0.2, 0.06, 0.035), KC.trim, [0, -0.6, 0])]),
    pGlaive: mergeParts([P(B(0.1, 0.06, 2.6), 0x202020, [0, 0, 0.5])]),
    shard: (() => { const g = new THREE.OctahedronGeometry(0.22, 0); g.scale(0.5, 1.4, 0.12); return g; })(),
  }));
}
function glowFor(els) {
  return once('kalisGlow4:' + els.join(','), () => ({
    visor: glowify(mergeParts([P(B(0.28, 0.03, 0.02), 0xcfe6f4, [0, 0.14, 0.245])]), 1.15),
    edge: glowify(mergeParts([P(B(0.02, 0.02, 0.75), elColor(els[0], 'hex'), [0, 0.04, 1.62])]), 1.1),
    shieldGlow: glowify(mergeParts([P(new THREE.RingGeometry(0.3, 0.36, 6), 0x9fd0ee, [0, -0.3, 0.17], [0, 0, Math.PI / 6], [1, 1.25, 1])]), 1.15),
  }));
}
let shardMat = null;
const DIMS = { pelvis: [0.33, 0.24, 0.27], torso: [0.43, 0.46, 0.33], torsoY: 0.3, head: [0.24, 0.28, 0.26], headY: 0.16, arm: [0.1, 0.1], leg: [0.12, 0.11], upperLen: 0.38, foreLen: 0.38, thighLen: 0.44, shinLen: 0.46 };
export function buildKalis(els = KALIS_DATA.fallbackElements) {
  const g = geos(), gl = glowFor(els);
  const m = humanoid(g, { hipY: HIP, neckY: 0.72, shoulderX: 0.46, shoulderY: 0.54, upperLen: 0.38, foreLen: 0.34, hipX: 0.19, thighLen: 0.44 });
  const glaive = pivot(m.handR, 0, 0, 0); glaive.rotation.x = -0.25;
  const shield = pivot(m.foreL, 0.06, -0.1, 0.08); shield.rotation.y = -0.4;
  const glowB = pivot(shield); glowB.scale.setScalar(0.001);            // 반격 자세: the shield rim glows (scale 0 ↔ 1)
  m.bones.push(glaive, shield, glowB);
  const n = m.bones.length;
  m.parts.push([n - 3, g.glaive], [n - 2, g.shield]);
  const cape = strips(m.spine, 4, { x0: -0.27, dx: 0.18, y: 0.6, z: -0.3, dz: 0.02, len: 0.62, rx: 0.1, bones: m.bones, parts: m.parts, geo: g.cape, k: 55, d: 6 });
  const pparts = proxyParts(m, DIMS); pparts.push([n - 3, g.pGlaive]);
  const sk = buildSkin('kalis4:' + els.join(','), m.root, m.bones, [
    { name: 'body', mat: vcMat(), parts: m.parts, shadow: false },
    { name: 'glow', mat: vcBasicMat(), parts: [[2, gl.visor], [n - 3, gl.edge], [n - 1, gl.shieldGlow]], shadow: false },
    { name: 'proxy', mat: skinOutlineMat(0.022), parts: pparts },
  ], [1.1, 2.4]);
  // orbiting mirror shards: one instanced mesh (1 draw), shiny glass colour, never casts
  if (!shardMat) shardMat = new THREE.MeshBasicMaterial({ color: 0xb8dcf0, transparent: true, opacity: 0.9, depthWrite: true });
  const shards = new THREE.InstancedMesh(g.shard, shardMat, KALIS_DATA.shards);
  shards.frustumCulled = false; shards.castShadow = false; shards.name = 'kalisShards';
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.root.add(shards);
  const halo = new THREE.Sprite(glowSpriteMat(0x9fd0ee, 0.15)); halo.scale.setScalar(2.0); halo.position.set(0, 2.2, -0.2); m.root.add(halo);
  Object.assign(m, { weapon: glaive, shieldB: shield, shieldGlow: glowB, shards, halo, skin: sk, headTop: 2.4, elements: els.slice(), cape });
  // shard state: orbit angle per shard; `free[i]` = world position when a shard is detached as a crystal target
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
  const free = Array.from({ length: KALIS_DATA.shards }, () => ({ on: false, pos: new THREE.Vector3(), broken: false }));
  const inv = new THREE.Matrix4();
  let time = 0;
  m.shardFree = free;
  m.orbit = { r: 0.95, w: 1.2, crack: 0 };
  contract(m, { weapon: glaive, springs: cape.length, features: { glassGradient: true, facetCrown: true, cape: true, orbitingShards: true, mirrorSpear: true, mirrorShield: true },
    update(dt) {
      time += dt;
      updateStrips(cape, dt, time, 0.08, m.rig.rotation.x + m.spine.rotation.x);
      const O = m.orbit;
      m.root.updateMatrixWorld();
      inv.copy(m.root.matrixWorld).invert();
      for (let i = 0; i < KALIS_DATA.shards; i++) {
        const F = free[i];
        if (F.broken) { _s.setScalar(0.0001); _p.set(0, -50, 0); }
        else if (F.on) { _p.copy(F.pos).applyMatrix4(inv); _p.y += Math.sin(time * 3 + i) * 0.08; _s.setScalar(2.2); }
        else { const a = time * O.w + i * (Math.PI * 2 / KALIS_DATA.shards); _p.set(Math.sin(a) * O.r, 1.7 + Math.sin(time * 2.1 + i) * 0.18, Math.cos(a) * O.r); _s.setScalar(1 - O.crack * 0.35); }
        _e.set(O.crack * 0.8 * Math.sin(i), time * 2 + i, O.crack * 0.5);
        _q.setFromEuler(_e);
        _m4.compose(_p, _q, _s);
        shards.setMatrixAt(i, _m4);
      }
      shards.instanceMatrix.addUpdateRange(0, KALIS_DATA.shards * 16);
      shards.instanceMatrix.needsUpdate = true;
    } });
  return m;
}

/** The two most-invested elements (ties → the class primaries), never undefined. */
export function mirrorElements(game) {
  const Pg = game.progression;
  const cls = Pg?.cls;
  const prim = CLASS_DEFS[cls]?.primary || [];
  const scored = ALL_ELEMENTS.map((el) => {
    let pts = 0; try { pts = Pg?.pointsIn?.(el, { forGates: false }) || 0; } catch (_) { pts = 0; }
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
  const kit = { family: familyOf(cls), dodge: CLASS_DEFS[cls]?.dodge || 'blink' };
  const model = (spare && spare.elements.join() === els.join()) ? spare : buildKalis(els); spare = null;
  const cur = newPose(HIP), tgt = newPose(HIP);
  let revived = false, cd = 2, dodgeCd = 0, guardT = 0, guardCd = 6, hits = 0, hitWin = 0, act = null, h = null, speed = 0, ph = 0, crackT = 0, staggerT = 0;
  const check = { active: false, t: 0, next: D.checkEvery, dur: 10, crystals: [] };
  let beamCd = 6;
  const beams = [];         // {h, from, dir}
  const mirrors = (A.mirrors || []).map((m) => ({ ...m, pos: (m.position || m.pos).clone() }));
  const actPos = new THREE.Vector3(), actDir = new THREE.Vector3(), actEnd = new THREE.Vector3();

  const e = createBoss(ctx, {
    id: 'kalis', name: D.name, title: D.title, sub: D.sub, model, arena: A, zoneId: 'ascent',
    position: A.position.clone(), baseHp: D.hp, radius: 0.6, height: 2.3, mass: 3, breakMax: 120, music: 'boss',
    resist: { [els[0]]: 0.6, [els[1]]: 0.6 }, phases: D.phases, dissolveColor: 0xc8e0f0,
    facing: Math.atan2(ctx.realPlayerPos.x - A.position.x, ctx.realPlayerPos.z - A.position.z),
    canDie: () => revived,
    onZero: () => revive(),
    debugDefeat: (b) => { revived = true; b.transitioning = false; b.invulnerable = false; game.combat.dealDamage(b, { amount: b.hp + 1, fixed: true, source: 'player', noReaction: true, ignoreShield: true, noCrit: true }); if (!b.defeated) b.defeat(null); return true; },
    onDebugPhase: () => { if (!revived) revive(); },
    dissolveAt: 0.8, dissolveDur: 1.8,
    onRemove: () => { for (const c of check.crystals) { try { game.combat.unregister(c); } catch (_) { /* */ } c.object.removeFromParent(); } },
  });
  e.noPhysics = true;
  e.object.position.y = ctx.groundH(A.position.x, A.position.z);
  e.mirror = { elements: els, kit };
  e.weakness = ALL_ELEMENTS.filter((el) => game.elements?.DEFS?.[els[0]]?.opposite === el || game.elements?.DEFS?.[els[1]]?.opposite === el);
  const basePayload = e.spawnPayload;
  e.spawnPayload = () => { const o = basePayload(); o.phases = [{ at: 0, name: D.phase2Name }]; return o; };
  e.debugPhase = (n) => { if (n >= 2 && !revived) revive(); return revived ? 2 : 1; };

  function revive() {
    if (revived) return;
    revived = true;
    e.hp = Math.round(e.maxHp * D.reviveFrac);
    e.invulnerable = true; e.transitioning = true;
    stopAttacks(e); act = null; h = null; beams.length = 0;
    e.setState('revive');
    game.events.emit('bossPhase', { boss: e, id: 'kalis', phase: 2, name: D.phase2Name });
    try { game.cinematic?.subtitle?.(D.reviveLine, 2.6); } catch (_) { /* */ }
    vfx.preset?.('explosion_light', e.getCenter(_v), { owner: 'enemy', scale: 1.4 });
    ctx.audio('shatter', { position: e.object.position, volume: 1, pitch: 0.6 });
    model.orbit.r = 1.15; model.orbit.w = 2.0;
    check.next = 12;
    timers.push({ t: 2.4, fn: () => { e.invulnerable = false; e.transitioning = false; e.setState('idle'); } });
  }
  const timers = [];

  function dodge() {
    const p = e.object.position, pp = ctx.playerPos;
    const away = Math.atan2(p.x - pp.x, p.z - pp.z) + rand(-0.9, 0.9);
    const dist = kit.dodge === 'blink' || kit.dodge === 'spiritswap' ? 6 : 3.5;
    vfx.burst(e.getCenter(_v), { owner: 'enemy', count: 8, color: [elColor(els[0], 'hex'), 0x6a9cc8], speed: 4, spread: 1, size: 0.14, sizeEnd: 0, life: 0.35, shape: 'spark', element: els[0] });
    p.x += Math.sin(away) * dist; p.z += Math.cos(away) * dist; e.clampToArena(1.5); p.y = ctx.groundH(p.x, p.z);
    ctx.audio('blink', { position: p, volume: 0.6, pitch: 1.1 });
    dodgeCd = 4;
  }
  // 반격 자세: a visible guard stance (shield glows); a hit during it → the counter (×0.4 taken while guarding)
  e.onBeforeDamage = (hit) => {
    if (guardT <= 0 || hit?.isDot) return null;
    if (!act && !e.transitioning) start('counter');
    return { mul: 0.4 };
  };
  e.react = ((base) => (res, hit, lx, lz) => {
    base?.(res, hit, lx, lz);
    hits++; hitWin = 1.2;
    if (hits >= 3 && dodgeCd <= 0 && !act && !e.transitioning && !e.isBroken?.() && !(crackT > 0)) { hits = 0; dodge(); }
  })(e.react);

  /** Start attack `kind` now. Returns the handle or null. */
  function start(kind) {
    const p = e.object.position, pp = ctx.playerPos;
    actDir.set(pp.x - p.x, 0, pp.z - p.z); if (actDir.lengthSq() < 1e-6) actDir.set(Math.sin(e.facing), 0, Math.cos(e.facing)); actDir.normalize();
    let hh = null;
    if (kind === 'slash') {
      const S = attackSpec('kalis.slash');
      actPos.copy(p); actEnd.copy(p).addScaledVector(actDir, S.dash);
      hh = bossAttack(ctx, e, 'kalis.slash', { shape: { pos: actPos, end: actEnd, dir: actDir }, el: els[0] });
    } else if (kind === 'counter') {
      guardT = 0;
      hh = bossAttack(ctx, e, 'kalis.counter', { shape: { pos: p, dir: actDir }, el: els[0] });
    } else if (kind === 'volley') {
      hh = bossAttack(ctx, e, 'kalis.volley', { el: els[0] });
    } else if (kind === 'burst') {
      actPos.set(pp.x, 0, pp.z); actPos.y = ctx.groundH(actPos.x, actPos.z);
      hh = bossAttack(ctx, e, 'kalis.burst', { shape: { pos: actPos }, el: els[1] });
    } else if (kind === 'beams') return startBeam();
    if (hh) { act = kind; h = hh; e.facing = Math.atan2(actDir.x, actDir.z); }
    return hh;
  }
  function startBeam() {
    const pp = ctx.playerPos;
    const src = mirrors.length ? mirrors[Math.floor(rand(0, mirrors.length))].pos : _w.copy(e.object.position);
    const from = new THREE.Vector3(src.x, 0, src.z); from.y = ctx.groundH(from.x, from.z);
    const dir = new THREE.Vector3(pp.x - from.x, 0, pp.z - from.z); const len = dir.length() + 4; dir.normalize();
    const hh = bossAttack(ctx, e, 'kalis.beams', { shape: { pos: from, dir, len }, hold: false, el: 'light' });
    if (hh) beams.push({ h: hh, from, dir, len });
    return hh;
  }
  function resolve(hh) {
    const p = e.object.position;
    if (act === 'slash') {
      p.copy(actEnd); e.clampToArena(1.5); p.y = ctx.groundH(p.x, p.z);
      vfx.smear?.('arc', e.getCenter(_v), e.object.quaternion, 1.8, els[0], { owner: 'enemy' });
      bossHit(ctx, e, hh, { attack: 'kalis.slash', amount: D.slash, element: els[0], knockback: 9, status: STATUS_OF[els[0]] || null, from: actPos });
      // the mirror armour cracks: punish window
      const S = attackSpec('kalis.slash');
      crackT = S.punishDur; bossPunish(ctx, e, S.punishDur, S.punishMul);
    } else if (act === 'counter') {
      vfx.smear?.('arc', e.getCenter(_v), e.object.quaternion, 1.4, els[0], { owner: 'enemy' });
      bossHit(ctx, e, hh, { attack: 'kalis.counter', amount: D.counter, element: els[0], knockback: 10, status: STATUS_OF[els[0]] || null });
    } else if (act === 'volley') {
      const S = attackSpec('kalis.volley'), n = revived ? S.orbs2 : S.orbs;
      model.weapon.getWorldPosition(_v); _v.y += 0.2;
      for (let i = 0; i < n; i++) {
        const a = e.facing + (i - (n - 1) / 2) * 0.2;
        _w.set(_v.x + Math.sin(a) * 0.5, _v.y, _v.z + Math.cos(a) * 0.5);
        ctx.projectiles.orb(_w, els[0], e, { color: elColor(els[0], 'hex'), amount: D.bolt, speed: 9, homing: S.homing, attackId: 'kalis.volley', status: STATUS_OF[els[0]] || null });
      }
      ctx.audio('cast_' + els[0], { position: p, volume: 0.7, pitch: 0.85 });
    } else if (act === 'burst') {
      vfx.preset?.('explosion_' + els[1], _v.copy(actPos).setY(actPos.y + 0.6), { owner: 'enemy', scale: 0.9 });
      bossHit(ctx, e, hh, { attack: 'kalis.burst', amount: D.burst, element: els[1], knockback: 8, launch: 4, status: STATUS_OF[els[1]] || null, from: actPos });
    }
  }

  // ---- the stagger check: a bar (bossCheck duration) + 3 crystal targets (detached mirror shards)
  for (let i = 0; i < 3; i++) {
    const obj = new THREE.Object3D(); game.scene.add(obj);
    const c = { id: 'kalisCrystal' + i, name: BOSS_UI.crystal, team: 'enemy', isProp: true, alive: false, object: obj, hp: 1e9, maxHp: 1e9, radius: 0.7, height: 1.4, mass: 1e6,
      statuses: {}, velocity: new THREE.Vector3(), xpValue: 0, k: i,
      onHit() { breakCrystal(c); }, onDeath() { breakCrystal(c); }, getCenter(out = new THREE.Vector3()) { return out.copy(obj.position).setY(obj.position.y + 0.7); } };
    check.crystals.push(c);
  }
  function startCheck() {
    check.active = true; check.t = 0;
    e.breakValue = e.breakMax;
    stopAttacks(e); act = null; h = null;
    const Dif = game.difficulty || {};
    const dur = D.checkDur + (Dif.checkAddSec ?? Dif.checkAdd ?? 0);
    check.dur = dur;
    const p = e.object.position;
    for (let i = 0; i < 3; i++) {
      const c = check.crystals[i], a = e.facing + (i - 1) * 2.1;
      c.object.position.set(p.x + Math.sin(a) * 4.5, 0, p.z + Math.cos(a) * 4.5); c.object.position.y = ctx.groundH(c.object.position.x, c.object.position.z) + 0.8;
      c.alive = true; c.hp = 1e9;
      const F = model.shardFree[i]; F.on = true; F.broken = false; F.pos.copy(c.object.position).setY(c.object.position.y + 0.7);
      try { game.combat.register(c); } catch (_) { /* */ }
    }
    e.emitCheck('stagger', 'start', dur);
  }
  function breakCrystal(c) {
    if (!c.alive || !check.active) return;
    c.alive = false;
    try { game.combat.unregister(c); } catch (_) { /* */ }
    const F = model.shardFree[c.k]; F.broken = true;
    vfx.burst(c.getCenter(_v), { owner: 'enemy', count: 10, color: [0x9fd0ee, 0x6a9cc8], speed: 4, spread: 1, size: 0.12, sizeEnd: 0, life: 0.5, shape: 'shard', gravity: 6, element: 'ice' });
    ctx.audio('shatter', { position: _v, volume: 0.7, pitch: 1.2 });
    if (check.crystals.every((q) => !q.alive)) endCheck(true);
  }
  function endCheck(ok) {
    check.active = false; check.next = D.checkEvery;
    for (const c of check.crystals) { if (c.alive) { c.alive = false; try { game.combat.unregister(c); } catch (_) { /* */ } } }
    for (let i = 0; i < 3; i++) { model.shardFree[i].on = false; model.shardFree[i].broken = false; }
    e.emitCheck('stagger', ok ? 'success' : 'fail', 0);
    if (ok) {
      const st = attackSpec('kalis.check').stagger;
      e.setState('staggered'); staggerT = st; guardT = 0;
      bossPunish(ctx, e, st, 1.5);
    } else {
      const pe = game.player?.entity;
      vfx.preset?.('explosion_light', e.getCenter(_v), { owner: 'enemy', scale: 1.6 });
      if (pe && pe.alive !== false) {
        const mh = game.player?.maxHp || pe.maxHp || 100;
        const dmg = Math.min(Math.round(mh * D.wipeFrac), Math.max(0, (pe.hp ?? mh) - 1));
        if (dmg > 0) bossHit(ctx, e, null, { attack: 'kalis.check', amount: dmg, fixed: true, element: 'light', knockback: 16, launch: 6, noReaction: true });
      }
    }
  }
  const offBreak = game.events.on('break', (p) => { if (p?.target === e && check.active) endCheck(true); });

  e.think = (dt, sm) => {
    e.baseTick(dt);
    for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
    const p = e.object.position, pp = ctx.playerPos, d = e.distP;
    cd -= dt * sm; dodgeCd -= dt; guardT -= dt; guardCd -= dt; hitWin -= dt; if (hitWin <= 0) hits = 0;
    if (crackT > 0) crackT -= dt;
    model.orbit.crack = crackT > 0 ? 1 : Math.max(0, model.orbit.crack - dt * 3);
    model.shieldGlow.scale.setScalar(guardT > 0 ? 1 : 0.001);
    speed = 0;
    // strike latches
    for (let i = beams.length - 1; i >= 0; i--) {
      const B = beams[i];
      if (B.h.consumeStrike()) {
        _v.copy(B.from).setY(B.from.y + 1.2); _w.copy(B.from).addScaledVector(B.dir, B.len).setY(_v.y);
        try { vfx.beam?.(_v, _w, { owner: 'enemy', color: 0x9fd0ee, width: 0.3, duration: 0.3 }); } catch (_) { /* */ }
        bossHit(ctx, e, B.h, { attack: 'kalis.beams', amount: D.beam, element: 'light', knockback: 6, from: B.from });
        beams.splice(i, 1);
      } else if (cancelled(B.h)) beams.splice(i, 1);
    }
    if (h) {
      if (cancelled(h)) { h = null; act = null; cd = 0.6; }
      else if (h.consumeStrike()) { const hh = h; h = null; resolve(hh); e._recT = act === 'slash' ? attackSpec('kalis.slash').punishDur : 0.5; e._recA = act; act = 'rec'; e._recS = 0; }
    }
    if (e.transitioning || e.state === 'revive' || !e.playerInArena(14)) return;
    if (e.state === 'staggered') { staggerT -= dt; if (staggerT <= 0) e.setState('idle'); return; }
    if (e.isBroken?.()) return;
    if (revived) {
      beamCd -= dt;
      if (beamCd <= 0 && !check.active) { beamCd = rand(5, 7); startBeam(); }
      if (!check.active) { check.next -= dt; if (check.next <= 0) startCheck(); }
      else {
        check.t += dt;
        if (check.t >= check.dur) endCheck(false);
        return;   // he channels during the check
      }
    }
    if (act) {
      if (act === 'rec') { e._recS += dt; if (e._recS > e._recT) { act = null; cd = rand(1.2, 2.2); } return; }
      if (h && !h.locked) {
        // aim tracks until the lock
        actDir.set(pp.x - p.x, 0, pp.z - p.z); if (actDir.lengthSq() > 1e-6) actDir.normalize();
        if (act === 'slash') { actPos.copy(p); actEnd.copy(p).addScaledVector(actDir, attackSpec('kalis.slash').dash); h.setPos(actPos); h.setEnd(actEnd); h.setDir(actDir); e.facing = Math.atan2(actDir.x, actDir.z); }
        else if (act === 'counter') { h.setPos(p); h.setDir(actDir); e.facing = Math.atan2(actDir.x, actDir.z); }
        else if (act === 'burst') { actPos.set(pp.x, 0, pp.z); actPos.y = ctx.groundH(actPos.x, actPos.z); h.setPos(actPos); }
      }
      if (act === 'slash' && h && rhythm(game, h) === 'strike') {
        const k = clamp(1 - h.remaining / 0.12, 0, 1);
        p.copy(actPos).lerp(actEnd, k); p.y = ctx.groundH(p.x, p.z);
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
    speed = (guardT > 0 ? 1.2 : 3.4) * sm;
    p.x += (_d.x * radial + -_d.z * strafe * 0.6) * speed * dt; p.z += (_d.z * radial + _d.x * strafe * 0.6) * speed * dt;
    e.clampToArena(1.5); p.y = ctx.groundH(p.x, p.z);
    if (guardCd <= 0 && d < 6) { guardCd = rand(6, 9); guardT = attackSpec('kalis.counter').stance; }
    if (cd <= 0 && guardT <= 0) {
      const r = Math.random();
      const k = d < 7 && r < 0.45 ? 'slash' : r < 0.75 ? 'volley' : 'burst';
      if (!start(k)) cd = 0.5;
    }
  };

  e.pose = (dt) => {
    Object.assign(tgt, BASE);
    const t = game.time;
    ph += dt * (1.2 + speed * 2.2);
    let lambda = 10;
    const s = e.state;
    const a = act === 'rec' ? e._recA : act;
    const strike = h && rhythm(game, h) === 'strike';
    if (s === 'revive') { const k = clamp(e.stateT / 2.2, 0, 1); tgt.pitch = -0.5 * (1 - k); tgt.headX = -0.6 * (1 - k); tgt.aRx = -2.8 * k; tgt.aLx = -2.8 * k; tgt.aRz = -0.4; tgt.aLz = 0.4; tgt.hipY = HIP + 0.2 * Math.sin(k * Math.PI); lambda = 6; }
    else if (s === 'staggered' || e.isBroken?.()) { tgt.hipY = HIP - 0.45; tgt.pitch = 0.35; tgt.lRx = -1.4; tgt.kR = 2.0; tgt.lLx = 0.2; tgt.kL = 1.5; tgt.aRx = -0.4; tgt.aLx = -0.3; tgt.headX = 0.4; lambda = 6; }
    else if (check.active) { tgt.aRx = -3.0; tgt.aLx = -3.0; tgt.aRz = -0.6; tgt.aLz = 0.6; tgt.headX = -0.4; tgt.pitch = -0.1; tgt.hipY = HIP + 0.1 + Math.sin(t * 2) * 0.05; lambda = 6; }
    else if (act === 'rec' && a === 'slash') { tgt.pitch = 0.45; tgt.headX = 0.35; tgt.aRx = -0.5; tgt.aRz = -0.7; tgt.aLx = -0.2; tgt.hipY = HIP - 0.2; tgt.kR = tgt.kL = 0.5; lambda = 8; }   // cracked, off balance
    else if (a === 'volley') { tgt.aRx = -1.6; tgt.fRx = -0.2; tgt.aLx = -1.2; tgt.aLz = 0.4; tgt.spineY = 0.3; lambda = 10; }
    else if (a === 'burst') { tgt.aRx = -2.9; tgt.aLx = -0.4; tgt.pitch = -0.15; tgt.headX = -0.2; lambda = 8; }
    else if (a === 'slash' || a === 'counter') {
      tgt.aRx = -1.9; tgt.aRz = 0.8; tgt.spineY = -0.7; tgt.pitch = 0.3; tgt.hipY = HIP - 0.2; tgt.lRx = -0.6; tgt.kR = 0.8; tgt.lLx = 0.5; lambda = 12;
      if (strike || act === 'rec') { tgt.aRz = -1.2; tgt.spineY = 0.8; lambda = 40; }
    } else {
      const amt = clamp(speed / 3.4, 0, 1);
      if (amt > 0.05) walkCycle(tgt, ph, amt * 0.8, 0.3);
      tgt.aRx = -0.5; tgt.aRz = -0.3; tgt.fRx = -0.7; tgt.aLx = -0.3; tgt.aLz = 0.3; tgt.spineX = Math.sin(t * 1.5) * 0.02;
      if (guardT > 0) { tgt.aLx = -1.5; tgt.aLz = 0.2; tgt.fLx = -1.3; tgt.aRx = -1.2; tgt.fRx = -1.0; tgt.hipY -= 0.12; tgt.kR += 0.3; tgt.kL += 0.3; }   // 반격 자세: shield raised
    }
    dampPose(cur, tgt, lambda, dt);
    applyHumanoid(model, cur);
    model.halo.material.opacity = (revived ? 0.3 : 0.15) + (guardT > 0 ? 0.25 : 0);
  };
  const baseClean = e.cleanupParts;
  e.cleanupParts = () => { baseClean(); try { offBreak(); } catch (_) { /* */ } };
  e.isRevived = () => revived;
  e.isGuarding = () => guardT > 0;
  e.check = check;
  finishBoss(ctx, e, {
    type: 'kalis', preview: () => buildKalis(els).root,
    debugAttack: (id) => {
      stopAttacks(e); act = null; h = null; beams.length = 0; guardT = 0; e.setState('idle');
      const k = String(id).replace(/^kalis\./, '');
      if (k === 'check') { if (!revived) revive(); e.invulnerable = false; e.transitioning = false; e.setState('idle'); startCheck(); return null; }
      if (k === 'counter') { guardT = attackSpec('kalis.counter').stance; return start('counter'); }
      return start(k);
    },
    onBroken: () => { act = null; h = null; guardT = 0; if (check.active) endCheck(true); },
  });
  return e;
}
createKalis.prewarm = (ctx) => {
  const els = mirrorElements(ctx.game);
  if (!spare || spare.elements.join() !== els.join()) spare = buildKalis(els);
  return spare.root;
};
