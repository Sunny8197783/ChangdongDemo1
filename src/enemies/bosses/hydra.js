// 삼두 물뱀 레비아탄 (id hydra, Mirwen lake; DESIGN §8.5, CONTRACT §15). A 15 m serpent: a body in the lake + 3 heads on
// 6-bone necks (2500 HP each, element-tinted water / ice / lightning) + the body pool (4000).
// - Head element shields (ring glyph): ×0.3 except from the counters (water ← lightning, ice · ice ← fire · lightning ← earth, water).
// - Freezing the lake (any ice hit on water → world 'waterFrozen' in the arena, or ice on the body) raises a ring of ice discs for 10 s.
// - Severing a head makes the remaining heads swap elements and gain +20 % speed.
// - Telegraphed attacks: bite (line), element spit volley, tidal sweep (ring: dodge it, or stand on ice / a pillar top).
// - Phase 2 「심연의 몸통」 when all heads are severed: the body rises, the core is exposed; water spouts + faster tides.
import { THREE, S, C, K, B, T, OCT, P, mergeParts, vcMat, vcBasicMat, pivot, buildSkin, glowify, once, chain, ringMat, glowSpriteMat } from './kit.js';
import { skinOutlineMat } from '../common.js';
import { createBoss, finishBoss, bossAttack, bossHit, bossPunish, rhythm, cancelled, stopAttacks, bossTime } from '../bossbase.js';
import { attackSpec } from './codex.js';
import { elColor } from '../../core/elements.js';
import { clamp, damp, rand } from '../../core/utils.js';

export const HYDRA_DATA = {
  id: 'hydra', name: '삼두 물뱀 레비아탄', title: '미르웬의 군주', sub: '세 개의 머리, 세 개의 원소',
  headHp: 2500, bodyHp: 4000,
  heads: [
    { id: 'head_water', name: '물의 머리', element: 'water' },
    { id: 'head_ice', name: '얼음의 머리', element: 'ice' },
    { id: 'head_lightning', name: '번개의 머리', element: 'lightning' },
  ],
  /** element shield counters (DESIGN §8.5) */
  counters: { water: ['lightning', 'ice'], ice: ['fire'], lightning: ['earth', 'water'] },
  phases: [{ name: '세 개의 머리' }, { at: 4000 / 11500, name: '심연의 몸통' }],
  bite: 22, spit: 14, tide: 28, spout: 18,
};
const SEG = 6, SEG_LEN = 1.8;
const NECK_BASES = [[-2.4, 2.0, 1.4, -0.5], [0, 2.7, 2.3, 0], [2.4, 2.0, 1.4, 0.5]];
const HC = { scale: 0x3f8a96, scaleDark: 0x2a5e6a, belly: 0x9fd8c8, fin: 0x3fa8b8, finDark: 0x24707e, horn: 0xe8e0c8, barn: 0x8a9a88, teeth: 0xf4f0e0 };

// ---------------------------------------------------------------- model
function geos() {
  return once('hydra', () => {
    const body = mergeParts([
      P(S(1, 20, 14), HC.scale, [0, 0.4, 0], [0, 0, 0], [5.6, 2.6, 6.6]),
      P(S(1, 18, 12), HC.belly, [0, -0.3, 1.2], [0, 0, 0], [4.2, 1.8, 4.6]),
      P(S(1, 16, 10), HC.scaleDark, [0, 0.9, -3.4], [0, 0, 0], [3.8, 1.9, 3.8]),
      // dorsal fin spikes
      ...[0, 1, 2, 3, 4, 5].map((i) => P(K(0.55, 2.4 - i * 0.2, 5), HC.fin, [0, 2.7 - i * 0.18, 1.6 - i * 1.15], [-0.5, 0, 0], [1, 1, 0.35])),
      // barnacles / coral
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => P(S(0.35 + (i % 3) * 0.12, 8, 6), HC.barn, [Math.sin(i * 2.3) * 4.2, 1.2 + Math.cos(i * 1.7) * 0.6, Math.cos(i * 2.3) * 4.8], [0, 0, 0], [1, 0.6, 1])),
      // tail coils breaking the surface
      P(T(2.2, 0.9, 14, 8), HC.scale, [-4.5, -0.4, -6], [Math.PI / 2 - 0.3, 0.4, 0], [1, 1, 1]),
      P(K(0.8, 3, 6), HC.finDark, [-6.6, 0.3, -6.8], [0, 0, 1.2], [1, 1, 0.3]),
    ]);
    const segOf = (r0, r1) => mergeParts([
      P(C(r1, r0, SEG_LEN + 0.35, 12), HC.scale, [0, SEG_LEN / 2, 0]),
      P(S(r0 * 0.82, 10, 8), HC.belly, [0, SEG_LEN / 2, r0 * 0.5], [0, 0, 0], [0.9, 1.5, 0.55]),
      P(S(r0 * 1.02, 12, 6), HC.scaleDark, [0, 0.05, 0], [0, 0, 0], [1, 0.35, 1]),
      P(K(r0 * 0.36, 1.0, 4), HC.fin, [0, SEG_LEN / 2, -r0], [-0.9, 0, 0], [1, 1, 0.3]),
    ]);
    const segs = [segOf(1.15, 1.05), segOf(1.05, 0.95), segOf(0.95, 0.86), segOf(0.86, 0.78), segOf(0.78, 0.72), segOf(0.72, 0.7)];
    const head = mergeParts([
      P(S(1, 16, 12), HC.scale, [0, 0.2, 0.4], [0, 0, 0], [1.15, 0.85, 1.45]),
      P(S(1, 14, 10), HC.scale, [0, 0.05, 1.7], [0.1, 0, 0], [0.75, 0.5, 1.15]),
      P(S(0.5, 10, 8), HC.belly, [0, -0.25, 1.4], [0, 0, 0], [1.2, 0.5, 1.8]),
      // horns + gill fins
      P(K(0.22, 1.6, 6), HC.horn, [0.55, 0.9, -0.3], [-0.9, 0, -0.35]),
      P(K(0.22, 1.6, 6), HC.horn, [-0.55, 0.9, -0.3], [-0.9, 0, 0.35]),
      P(K(0.45, 1.3, 4), HC.fin, [1.05, 0.1, -0.1], [0, 0.4, -1.4], [1, 1, 0.25]),
      P(K(0.45, 1.3, 4), HC.fin, [-1.05, 0.1, -0.1], [0, -0.4, 1.4], [1, 1, 0.25]),
      P(K(0.35, 1.0, 4), HC.finDark, [0, 0.9, 0.6], [-0.4, 0, 0], [1, 1, 0.25]),
      // upper teeth
      ...[-0.42, -0.14, 0.14, 0.42].map((x) => P(K(0.07, 0.3, 4), HC.teeth, [x, -0.25, 2.3], [Math.PI, 0, 0])),
    ]);
    const jaw = mergeParts([
      P(S(1, 12, 9), HC.scaleDark, [0, -0.1, 1.0], [0, 0, 0], [0.65, 0.3, 1.25]),
      ...[-0.36, -0.1, 0.1, 0.36].map((x) => P(K(0.06, 0.26, 4), HC.teeth, [x, 0.18, 1.8], [0, 0, 0])),
    ]);
    const eyes = glowify(mergeParts([
      P(S(0.16, 8, 6), 0xd8e86a, [0.62, 0.42, 1.25], [0, 0, 0], [1.2, 0.7, 0.8]), P(S(0.16, 8, 6), 0xd8e86a, [-0.62, 0.42, 1.25], [0, 0, 0], [1.2, 0.7, 0.8]),
      P(B(0.04, 0.17, 0.05), 0x1a2410, [0.66, 0.42, 1.36]), P(B(0.04, 0.17, 0.05), 0x1a2410, [-0.66, 0.42, 1.36]),          // slit pupils
      ...[-0.42, -0.14, 0.14, 0.42].map((x) => P(K(0.03, 0.12, 4), 0xc8eef0, [x, -0.3, 2.28], [Math.PI, 0, 0])),           // faint tooth glints
    ]), 1.15);
    const core = glowify(mergeParts([P(OCT(1.0), 0x7fe8ff, [0, 2.2, 3.4], [0, 0, 0], [1, 1.4, 0.7]), P(T(1.3, 0.12, 16), 0x4fb4ff, [0, 2.2, 3.3])]), 1.15);
    // silhouette proxy (outline + rim source + the only shadow caster): body, neck segments, heads
    const pBody = mergeParts([P(S(1, 10, 7), HC.scale, [0, 0.4, 0], [0, 0, 0], [5.6, 2.6, 6.6]), P(S(1, 8, 6), HC.scale, [0, 0.9, -3.4], [0, 0, 0], [3.8, 1.9, 3.8])]);
    const pSeg = [1.15, 1.05, 0.95, 0.86, 0.78, 0.72].map((r0, k) => mergeParts([P(C(r0 * 0.93, r0, SEG_LEN + 0.35, 7), HC.scale, [0, SEG_LEN / 2, 0])]));
    const pHead = mergeParts([P(S(1, 9, 6), HC.scale, [0, 0.2, 0.4], [0, 0, 0], [1.15, 0.85, 1.45]), P(S(1, 8, 6), HC.scale, [0, 0.05, 1.7], [0.1, 0, 0], [0.75, 0.5, 1.15])]);
    pHead.scale(1.35, 1.35, 1.35);
    const ring = new THREE.TorusGeometry(2.5, 0.08, 6, 32);
    for (const q of [head, jaw, eyes]) q.scale(1.35, 1.35, 1.35);
    return { body, segs, head, jaw, eyes, core, ring, pBody, pSeg, pHead };
  });
}

export function buildHydra() {
  const g = geos();
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);
  const bones = [body];
  const parts = [[0, g.body]];
  const glowParts = [[0, g.core]];
  const proxyParts = [[0, g.pBody]];
  const necks = [];
  for (let n = 0; n < 3; n++) {
    const [x, y, z, yaw] = NECK_BASES[n];
    const base = pivot(body, x, y, z); base.rotation.y = yaw;
    bones.push(base);
    const segs = chain(base, SEG, SEG_LEN);
    segs.forEach((s, k) => { bones.push(s); parts.push([bones.length - 1, g.segs[k]]); proxyParts.push([bones.length - 1, g.pSeg[k]]); });
    const head = pivot(segs[SEG - 1], 0, SEG_LEN, 0);
    bones.push(head); const hi = bones.length - 1;
    parts.push([hi, g.head]); glowParts.push([hi, g.eyes]); proxyParts.push([hi, g.pHead]);
    const jaw = pivot(head, 0, -0.3, 0.5);
    bones.push(jaw); parts.push([bones.length - 1, g.jaw]);
    // element shield glyph (own material per head so it can be recoloured as a uniform)
    const ring = new THREE.Mesh(g.ring, ringMat('hydra' + n, 0x7fd3ff));
    ring.position.set(0, 0.4, 1.5); ring.rotation.x = 0.2; ring.frustumCulled = false;
    head.add(ring);
    necks.push({ base, segs, head, jaw, ring, baseYaw: yaw });
  }
  const sk = buildSkin('hydra', root, bones, [
    { name: 'body', mat: vcMat(), parts, shadow: false },
    { name: 'glow', mat: vcBasicMat(), parts: glowParts, shadow: false },
    { name: 'proxy', mat: skinOutlineMat(0.06), parts: proxyParts },
  ], [6, 16]);
  const proxy = sk.meshes.proxy; proxy.name = 'outline'; proxy.receiveShadow = false;
  const halo = new THREE.Sprite(glowSpriteMat(0x7fe8ff, 0.0)); halo.scale.setScalar(7); halo.position.set(0, 2.2, 3.4); body.add(halo);
  const rim = [proxy];
  const anchors = { head: necks[1].head, mouth: necks[1].jaw, core: body };
  return { root, rig: body, body, necks, halo, skin: sk, outlines: [proxy], headTop: 14, isV4: true,
    meshes: [sk.meshes.body, sk.meshes.glow], proxy, lod: proxy, flashUniform: { value: 0 }, rimSource: () => rim, tellAnchors: anchors,
    bones: { root: body, spine: body, head: necks[1].head, jaw: necks[1].jaw, neck: necks.map((n) => n.segs) },
    features: { face: true, hands: false, springs: 0, aoVertexColors: false, lod: false, slitPupils: true, teeth: true, contractOnly: true },
    pose() {}, update() {}, dispose() {} };
}

let spare = null;
function takeModel() { const m = spare || buildHydra(); spare = null; return m; }

// precomputed uniform-bend reach table: α → (forward distance, height) for the 6-segment neck + head
const REACH = [];
for (let i = 0; i <= 24; i++) {
  const a = -0.05 + i * 0.022;
  let dx = 0, dy = 0;
  for (let k = 1; k <= SEG + 1; k++) { dx += SEG_LEN * Math.sin(k * a); dy += SEG_LEN * Math.cos(k * a); }
  REACH.push({ a, dx, dy });
}
function bendFor(dist, dh) {
  let best = REACH[0], bs = 1e9;
  for (const r of REACH) { const s = Math.abs(r.dx - dist) + 0.4 * Math.abs(r.dy - dh); if (s < bs) { bs = s; best = r; } }
  return best.a;
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();

// ---------------------------------------------------------------- boss
export function createHydra(ctx, arena, opts = {}) {
  const game = ctx.game, vfx = game.vfx, W = game.world;
  const D = HYDRA_DATA;
  const A = arena || { position: new THREE.Vector3(-82, -1, -80), radius: 20, waterLevel: 1.5 };
  const waterY = A.waterLevel ?? A.surfaceY ?? 1.5;
  const model = takeModel();
  const baseY = waterY - 0.4;
  const e = createBoss(ctx, {
    id: 'hydra', name: D.name, title: D.title, sub: D.sub, model, arena: A, zoneId: 'mirwen',
    position: new THREE.Vector3(A.position.x, baseY, A.position.z),
    baseHp: D.headHp * 3 + D.bodyHp, radius: 5.5, height: 5, mass: 50, breakMax: 120, music: 'boss',
    resist: { water: 0.5 }, phases: D.phases, transition: 3.0, weakness: ['lightning', 'fire', 'earth'],
    facing: Math.atan2(ctx.realPlayerPos.x - A.position.x, ctx.realPlayerPos.z - A.position.z),
    gate: (i) => i !== 1 || heads.every((h) => h.dead),
    onPhase: (i) => { if (i === 1) { rise = 0; vfx.preset?.('explosion_water', _v.copy(e.object.position).setY(waterY + 1), { owner: 'enemy', scale: 1.8 }); ctx.audio('boss_roar', { position: e.object.position, volume: 1, pitch: 0.7 }); e.shakeAt(e.object.position, 0.7); } },
    onRespawnPhase: () => { if (e.phase === 0) { for (const h of heads) { h.dead = false; h.sever = 0; h.state = 'idle'; } e.reviveParts(); assignElements(); speedMul = 1; } },
    onPartBreak: (part) => severHead(part),
    onBodyHit: (res, hit) => { if (hit?.element === 'ice') freezeRing(); },
    deathPose: (dt, t) => { model.body.position.y = -Math.min(6, t * 2.2); model.body.rotation.z = Math.min(0.5, t * 0.2); },
    dissolveAt: 2.2, dissolveDur: 2.0, dissolveColor: 0x4fb4ff,
    onDefeat: () => { for (const h of heads) h.N.ring.visible = false; vfx.preset?.('explosion_water', _v.copy(e.object.position).setY(waterY + 2), { owner: 'enemy', scale: 2.4 }); },
  });
  e.noLod = true;
  e.object.rotation.y = e.facing;
  // body only takes ×0.15 while a head lives (the heads are the way in); full damage in phase 2
  e.setBodyMul(() => (e.phase >= 1 ? 1 : 0.15));

  const heads = D.heads.map((hd, i) => {
    const N = model.necks[i];
    const part = e.addPart({ id: hd.id, name: hd.name, hp: Math.round(D.headHp * (e.maxHp / (D.headHp * 3 + D.bodyHp))), bone: N.head, offset: new THREE.Vector3(0, 0, 0), radius: 1.7, height: 2.6,
      element: hd.element, shield: { element: hd.element, counters: D.counters[hd.element] } });
    return { i, N, part, el: hd.element, state: 'idle', t: 0, cd: 1.5 + i * 1.3, bend: 0.1, bendT: 0.1, yawT: 0, yaw: 0, jaw: 0, dead: false, sever: 0, tele: null, hitDone: false, spits: 0, ph: i * 2.1 };
  });
  const iceDiscs = Array.from({ length: 8 }, () => new THREE.Vector3());
  let iceUntil = -1;
  let speedMul = 1, tideCd = 12, spoutCd = 6, freezeCd = 0, rise = 1, coreGlow = 0, rippleT = 0, ice = null;

  function assignElements() {
    // live heads take the elements in order (rotating on each sever)
    for (const h of heads) {
      h.part.shield.element = h.el; h.part.shield.counters = D.counters[h.el]; h.part.element = h.el;
      h.N.ring.material.color.setHex(elColor(h.el, 'hex'));
    }
  }
  assignElements();

  function severHead(part) {
    const h = heads.find((q) => q.part === part); if (!h || h.dead) return;
    h.dead = true; h.sever = 0; h.handle?.stop?.(); h.handle = null; h.state = 'idle'; if (biting === h) biting = null; h.N.ring.visible = false;
    h.N.head.getWorldPosition(_v);
    vfx.preset?.('explosion_' + h.el, _v, { owner: 'enemy', scale: 1.32 });
    vfx.burst(_v, { owner: 'enemy', count: 25, color: [0xd8f4ff, elColor(h.el, 'mid')], speed: 9, spread: 1, size: 0.35, sizeEnd: 0.05, life: 1.2, gravity: 10, shape: 'droplet' });
    ctx.audio('boss_roar', { position: _v, volume: 1, pitch: 1.3 });
    e.shakeAt(_v, 0.6);
    // the survivors swap elements and speed up (+20 %)
    const live = heads.filter((q) => !q.dead);
    if (live.length > 1) { const first = live[0].el; for (let k = 0; k < live.length - 1; k++) live[k].el = live[k + 1].el; live[live.length - 1].el = first; }
    speedMul *= 1.2;
    assignElements();
    for (const q of live) { q.N.head.getWorldPosition(_w); vfx.burst(_w, { owner: 'enemy', count: 18, color: [0xc8d0dc, elColor(q.el, 'mid')], speed: 4, spread: 1, size: 0.3, sizeEnd: 0, life: 0.6, shape: 'spark' }); }
  }

  /** Ice on the lake: a ring of walkable ice discs around the body for 10 s (melee classes can reach the heads). */
  function freezeRing() {
    if (freezeCd > 0) return;
    const sf = W.surface; if (!sf?.freezeWater) return;
    freezeCd = 12;
    const c = A.position;
    iceUntil = bossTime(game) + 10;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      _v.set(c.x + Math.sin(a) * 10.5, waterY, c.z + Math.cos(a) * 10.5);
      iceDiscs[k].copy(_v);
      try { sf.freezeWater(_v, 4.2, 10); } catch (_) { /* */ }
    }
    vfx.shockwave?.(_v.set(c.x, waterY + 0.1, c.z), { owner: 'enemy', color: 0xd8f6ff, radius: 14, duration: 0.8, opacity: 0.8 });
    e.emitCheck?.('freeze', 'start', 10);
  }
  const offFrozen = game.events.on?.('waterFrozen', (p) => {
    if (e.defeated || !p?.position) return;
    if (Math.hypot(p.position.x - A.position.x, p.position.z - A.position.z) < A.radius + 6) freezeRing();
  });
  e.freezeRing = freezeRing;

  // ---------------------------------------------------------------- attacks (PLAN §4.10; all through game.tells)
  // concurrency: ≤ 1 bite + ≤ 1 other attack (spit / tide / spouts) at a time
  const tide = { h: null, safes: [] };
  const spouts = [];          // {h, p}
  const pillars = (A.pillars || []).map((q) => q.pos);
  const marks = [0, 1, 2].map(() => { const o = new THREE.Object3D(); game.scene.add(o); return { obj: o, m: null }; });
  let biting = null, other = null;
  function headPick(near) {
    let best = null, bd = near ? Infinity : -1;
    const pp = ctx.playerPos;
    for (const h of heads) {
      if (h.dead || h.state !== 'idle' || h.cd > 0) continue;
      const d = h.N.head.getWorldPosition(_v).distanceToSquared(pp);
      if (near ? d < bd : d > bd) { bd = d; best = h; }
    }
    return best;
  }
  function startBite(h) {
    const p = e.object.position, pp = ctx.playerPos;
    _d.set(pp.x - p.x, 0, pp.z - p.z); const len = _d.length(); _d.normalize();
    _v.set(p.x + _d.x * 3, 0, p.z + _d.z * 3); _v.y = Math.max(ctx.groundH(_v.x, _v.z), waterY);
    e.model.tellAnchors.mouth = h.N.jaw; e.model.tellAnchors.head = h.N.head;
    const hh = bossAttack(ctx, e, 'hydra.bite', { shape: { pos: _v, dir: _d, len: Math.min(17, len + 1.5) } });
    if (!hh) return null;
    h.state = 'biteWind'; h.t = 0; h.handle = hh; biting = h;
    h.target = (h.target || new THREE.Vector3()).copy(pp);
    return hh;
  }
  function startSpit(h) {
    e.model.tellAnchors.mouth = h.N.jaw;
    const hh = bossAttack(ctx, e, 'hydra.spit', { el: h.el });
    if (!hh) return null;
    h.state = 'spitWind'; h.t = 0; h.handle = hh; other = hh;
    return hh;
  }
  /** 3 non-homing orbs at predicted positions, each with a landing marker (r 1.2). */
  function fireSpit(h) {
    const S = attackSpec('hydra.spit');
    h.N.head.getWorldPosition(_v); _v.y += 0.2;
    const pe = ctx.target || game.player?.entity, pv = pe?.velocity, pp = ctx.playerPos;
    for (let k = 0; k < S.orbs; k++) {
      const lead = 0.5 + k * 0.45, side = (k - 1) * 1.6;
      _w.set(pp.x + (pv ? pv.x * lead : 0), 0, pp.z + (pv ? pv.z * lead : 0));
      _d.set(_w.x - _v.x, 0, _w.z - _v.z).normalize();
      _w.x += -_d.z * side; _w.z += _d.x * side; _w.y = Math.max(ctx.groundH(_w.x, _w.z), waterY);
      const o = ctx.projectiles.orb(_v, h.el, e, { amount: D.spit, speed: 10, homing: 0, attackId: 'hydra.spit', attack: { id: 'hydra.spit' } });
      if (o?.vel) { _d.set(_w.x - _v.x, _w.y + 0.9 - _v.y, _w.z - _v.z).normalize().multiplyScalar(o.speed || 10); o.vel.copy(_d); }
      const M = marks[k]; M.m?.stop?.(); M.obj.position.copy(_w); M.obj.updateMatrixWorld();
      M.m = game.tells?.projectile?.(M.obj, { r: S.markerR }) || null; M.orb = o; M.t = 0;
    }
    ctx.audio('cast_' + h.el, { position: _v, volume: 0.6, pitch: 0.7 });
  }
  function startTide() {
    _v.set(A.position.x, waterY, A.position.z);
    const hh = bossAttack(ctx, e, 'hydra.tide', { shape: { pos: _v }, hold: false });
    if (!hh) return null;
    tide.h = hh; other = hh;
    // safe tiles: pillar tops (+ the ice discs while the lake is frozen)
    for (const s of tide.safes) s?.stop?.();
    tide.safes.length = 0;
    const T = game.tells;
    if (T?.safe) {
      for (const q of pillars) tide.safes.push(T.safe({ pos: q, r: 1.5, dur: hh.dur + 0.3 }));
      if (iceUntil > bossTime(game)) for (const c of iceDiscs) tide.safes.push(T.safe({ pos: c, r: 3.6, dur: hh.dur + 0.3 }));
    }
    ctx.audio('charge', { position: e.object.position, volume: 0.9, pitch: 0.4 });
    return hh;
  }
  function tideHit(hh) {
    const c = A.position;
    _v.set(c.x, waterY + 0.2, c.z);
    vfx.shockwave?.(_v, { owner: 'enemy', color: 0x3f8a96, radius: 19, duration: 0.9, opacity: 0.55, thickness: 0.6 });
    e.shakeAt(c, 0.5);
    ctx.audio('splash', { position: c, volume: 1, pitch: 0.6 });
    // inside the drawn ring AND in the water (not on ice / a pillar top = the safe tiles)
    const pp = ctx.playerPos;
    const onIce = !!W.surface?.onIce?.(pp.x, pp.z);
    const wet = (W.waterDepth?.(pp.x, pp.z) || 0) > 0.15 && pp.y < waterY + 0.8;
    if (wet && !onIce) bossHit(ctx, e, hh, { attack: 'hydra.tide', amount: D.tide, element: 'water', knockback: 14, launch: 5, heavy: true, status: { wet: 6 }, from: c });
  }
  function startSpouts() {
    const pp = ctx.playerPos, S = attackSpec('hydra.spouts');
    let first = null;
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + rand(0, 1), r = k === 0 ? 0 : rand(3, 6);
      const p = new THREE.Vector3(pp.x + Math.sin(a) * r, 0, pp.z + Math.cos(a) * r); p.y = Math.max(ctx.groundH(p.x, p.z), waterY - 0.1);
      const hh = bossAttack(ctx, e, 'hydra.spouts', { windup: S.stagger[k], shape: { pos: p }, hold: false });
      if (hh) { spouts.push({ h: hh, p }); if (!first) first = hh; }
    }
    if (first) other = first;
    return first;
  }
  function spoutHit(s) {
    vfx.preset?.('impact_water', _v.copy(s.p).setY(s.p.y + 0.5), { owner: 'enemy', scale: 1.2 });
    bossHit(ctx, e, s.h, { attack: 'hydra.spouts', amount: D.spout, element: 'water', knockback: 4, launch: 9, heavy: true, status: { wet: 5 }, from: s.p });
  }
  const otherBusy = () => {
    if ((other && other.alive) || spouts.length > 0) return true;
    for (let i = 0; i < heads.length; i++) { const s = heads[i].state; if (s === 'spitWind' || s === 'spit') return true; }
    return false;
  };

  e.think = (dt, sm) => {
    e.baseTick(dt);
    const k = sm * speedMul;
    freezeCd -= dt; tideCd -= dt * k; spoutCd -= dt * k;
    const p = e.object.position, pp = ctx.playerPos;
    p.x = A.position.x; p.z = A.position.z;
    const want = Math.atan2(pp.x - p.x, pp.z - p.z);
    let df = want - e.facing; df = Math.atan2(Math.sin(df), Math.cos(df));
    e.facing += clamp(df, -0.35 * dt, 0.35 * dt);
    // landing markers follow their orb's life
    for (const M of marks) if (M.m) { M.t += dt; if (M.t > 2.5 || (M.orb && M.orb.active === false)) { M.m.stop?.(); M.m = null; } }
    // strike latches (every sub-step)
    if (tide.h) { if (tide.h.consumeStrike()) { tideHit(tide.h); tide.h = null; } else if (cancelled(tide.h)) tide.h = null; }
    for (let i = spouts.length - 1; i >= 0; i--) { const s = spouts[i]; if (s.h.consumeStrike()) { spoutHit(s); spouts.splice(i, 1); } else if (cancelled(s.h)) spouts.splice(i, 1); }
    if (e.transitioning || !e.playerInArena(22)) {
      for (const h of heads) if (h.state !== 'idle' && h.state !== 'recover') { h.state = 'idle'; h.handle?.stop?.(); h.handle = null; }
      return;
    }
    const d = e.distP;
    for (const h of heads) {
      if (h.dead) continue;
      h.cd -= dt * k; h.t += dt;
      const hh = h.handle;
      if (hh && cancelled(hh)) { h.handle = null; if (h.state !== 'recover') { h.state = 'idle'; h.cd = 1; } if (biting === h) biting = null; continue; }
      switch (h.state) {
        case 'biteWind':
          if (hh && rhythm(game, hh) === 'strike') { h.state = 'bite'; h.t = 0; ctx.audio('boss_roar', { position: p, volume: 0.6, pitch: 1.5 }); }
          // falls through to the latch below
        case 'bite':
          if (hh && hh.consumeStrike()) {
            h.state = 'bite'; h.t = 0; h.handle = null;
            bossHit(ctx, e, hh, { attack: 'hydra.bite', amount: D.bite, element: h.el, knockback: 12, launch: 3 });
            h.N.head.getWorldPosition(_v); _v.y = Math.max(ctx.groundH(_v.x, _v.z), waterY);
            vfx.shockwave?.(_v, { owner: 'enemy', color: 0x3f8a96, radius: 3, duration: 0.45, opacity: 0.5 });
            // the head lies low: the punish window (2.0 s, ×1.5)
            const S = attackSpec('hydra.bite');
            h.state = 'recover'; h.t = 0; h.recT = S.punishDur; biting = null;
            bossPunish(ctx, e, S.punishDur, S.punishMul);
          }
          break;
        case 'recover':
          if (h.t > (h.recT ?? 1)) { h.state = 'idle'; h.cd = rand(2.5, 4) / speedMul; }
          break;
        case 'spitWind':
          if (hh && hh.consumeStrike()) { h.handle = null; h.state = 'spit'; h.t = 0; fireSpit(h); }
          break;
        case 'spit':
          if (h.t > 0.6) { h.state = 'idle'; h.cd = rand(3, 5) / speedMul; if (other && !other.alive) other = null; }
          break;
      }
    }
    if (other && !other.alive && !otherBusy()) other = null;
    if (!e.isBroken() && !(e.vulnerableUntil > bossTime(game))) {
      // tide / spouts (other slot), then the heads
      if (!otherBusy() && tideCd <= 0) { if (startTide()) tideCd = (e.phase >= 1 ? 9 : 14) + rand(0, 3); else tideCd = 1; }
      if (!otherBusy() && e.phase >= 1 && spoutCd <= 0) { spoutCd = rand(5, 7); startSpouts(); }
      if (!biting && d < 17) { const h = headPick(true); if (h && Math.random() < 0.65) startBite(h); }
      if (!otherBusy()) { const h = headPick(false); if (h && Math.random() < 0.5) startSpit(h); }
    }
    rippleT -= dt;
    if (rippleT <= 0) { rippleT = 2.0; vfx.shockwave?.(_v.set(p.x, waterY + 0.05, p.z), { owner: 'enemy', color: 0x3f8a96, radius: 8, duration: 1.4, opacity: 0.22, thickness: 0.15 }); }
    void ice;
  };
  const debugAttack = (id) => {
    for (const h of heads) { if (!h.dead) { h.handle?.stop?.(); h.handle = null; h.state = 'idle'; h.cd = 0; } }
    stopAttacks(e); biting = null; other = null; spouts.length = 0; tide.h = null;
    if (id === 'hydra.bite') { const h = headPick(true); return h ? startBite(h) : null; }
    if (id === 'hydra.spit') { const h = headPick(false); return h ? startSpit(h) : null; }
    if (id === 'hydra.tide') return startTide();
    if (id === 'hydra.spouts') return startSpouts();
    return null;
  };

  // ---------------------------------------------------------------- pose (render-rate procedural animation)
  e.pose = (dt) => {
    const t = game.time;
    const m = model, p = e.object.position;
    const pp = ctx.playerPos;
    rise = Math.min(1, rise + dt * 0.4);
    const up = e.phase >= 1 ? rise * 3.2 : 0;
    m.body.position.set(0, Math.sin(t * 0.9) * 0.25 + up, 0);
    m.body.rotation.set(Math.sin(t * 0.6) * 0.03, 0, Math.sin(t * 0.7) * 0.04);
    coreGlow = damp(coreGlow, e.phase >= 1 ? 1 : 0.15, 3, dt);
    m.halo.material.opacity = coreGlow * (0.6 + Math.sin(t * 5) * 0.2);
    // local target for each neck (the player in the body frame)
    _w.set(pp.x - p.x, 0, pp.z - p.z).applyAxisAngle(_d.set(0, 1, 0), -e.facing);
    for (const h of heads) {
      const N = h.N;
      if (h.dead) {
        h.sever = Math.min(1, h.sever + dt * 0.6);
        // the stump droops into the lake
        for (let k = 0; k < SEG; k++) N.segs[k].rotation.set(0.25 + h.sever * 0.35, 0, Math.sin(t + k) * 0.05);
        N.head.scale.setScalar(Math.max(0.001, 1 - h.sever * 1.4));
        continue;
      }
      const lx = _w.x - NECK_BASES[h.i][0], lz = _w.z - NECK_BASES[h.i][2];
      const dist = Math.hypot(lx, lz);
      h.yawT = Math.atan2(lx, lz) - N.baseYaw;
      let bend = 0.06 + Math.sin(t * 0.8 + h.ph) * 0.03, jaw = 0.05;
      if (h.state === 'biteWind') { bend = -0.06; jaw = 0.5; }
      else if (h.state === 'bite' || h.state === 'recover' || e.isBroken?.()) {
        const tgt = h.target || pp;
        const tlx = tgt.x - p.x, tlz = tgt.z - p.z;
        const dd = Math.min(15, Math.hypot(tlx, tlz) - 1.5);
        bend = bendFor(dd, (Math.max(ctx.groundH(tgt.x, tgt.z), waterY) + 1.2) - (p.y + up + 2.2));
        jaw = h.state === 'bite' ? (h.t < 0.25 ? 0.9 : 0.1) : 0.15;
      } else if (h.state === 'spitWind' || h.state === 'spit') { bend = clamp(bendFor(Math.min(9, dist * 0.5), 9), 0.02, 0.2); jaw = 0.75; }
      const rate = h.state === 'bite' ? 16 : h.state === 'recover' ? 3 : 4;
      h.bend = damp(h.bend, bend, rate, dt);
      h.yaw = damp(h.yaw, clamp(h.yawT, -1.2, 1.2), h.state === 'bite' ? 2 : 3, dt);
      h.jaw = damp(h.jaw, jaw, 12, dt);
      N.base.rotation.y = N.baseYaw + h.yaw;
      for (let k = 0; k < SEG; k++) N.segs[k].rotation.set(h.bend + Math.sin(t * 1.6 - k * 0.6 + h.ph) * 0.035, 0, Math.sin(t * 1.1 - k * 0.5 + h.ph) * 0.05);
      N.head.rotation.set(-h.bend * SEG + (h.state === 'biteWind' ? -0.35 : h.state === 'bite' || h.state === 'recover' ? 0.45 : 0.15), 0, 0);
      N.jaw.rotation.x = h.jaw;
      N.ring.rotation.z += dt * 0.8;
      const pulse = h.part.lock ? 1 : 0.75 + Math.sin(t * 3 + h.i) * 0.15;
      N.ring.material.opacity = pulse;
    }
  };

  const baseRemove = e.cleanupParts;
  e.cleanupParts = () => { baseRemove(); try { if (typeof offFrozen === 'function') offFrozen(); } catch (_) { /* */ } };
  e.heads = heads;
  finishBoss(ctx, e, { type: 'hydra', cameraHint: { dist: 1.6, height: 1.5 }, debugAttack, preview: () => buildHydra().root, noDistanceRate: true,
    onBroken: () => { for (const h of heads) if (!h.dead) { h.handle = null; h.state = 'recover'; h.t = 0; h.recT = 3.5; } biting = null; other = null; spouts.length = 0; tide.h = null; } });
  return e;
}
createHydra.prewarm = () => { if (!spare) spare = buildHydra(); return spare.root; };
