// 삼두 물뱀 레비아탄 (id hydra, Mirwen lake; DESIGN §8.5, CONTRACT §15). A 15 m serpent: a body in the lake + 3 heads on
// 6-bone necks (2500 HP each, element-tinted water / ice / lightning) + the body pool (4000).
// - Head element shields (ring glyph): ×0.3 except from the counters (water ← lightning, ice · ice ← fire · lightning ← earth, water).
// - Freezing the lake (any ice hit on water → world 'waterFrozen' in the arena, or ice on the body) raises a ring of ice discs for 10 s.
// - Severing a head makes the remaining heads swap elements and gain +20 % speed.
// - Telegraphed attacks: bite (line), element spit volley, tidal sweep (ring: dodge it, or stand on ice / a pillar top).
// - Phase 2 「심연의 몸통」 when all heads are severed: the body rises, the core is exposed; water spouts + faster tides.
import { THREE, S, C, K, B, T, OCT, P, mergeParts, vcMat, vcBasicMat, pivot, buildSkin, glowify, once, chain, ringMat, glowSpriteMat } from './kit.js';
import { createBoss } from '../bossbase.js';
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
const HC = { scale: 0x2f6f7a, scaleDark: 0x1c4650, belly: 0x9fd8c8, fin: 0x3fa8b8, finDark: 0x24707e, horn: 0xe8e0c8, barn: 0x8a9a88, teeth: 0xf4f0e0 };

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
    const eyes = glowify(mergeParts([P(S(0.16, 8, 6), 0xffffff, [0.62, 0.42, 1.25], [0, 0, 0], [1.2, 0.7, 0.8]), P(S(0.16, 8, 6), 0xffffff, [-0.62, 0.42, 1.25], [0, 0, 0], [1.2, 0.7, 0.8])]), 2.2);
    const core = glowify(mergeParts([P(OCT(1.0), 0x7fe8ff, [0, 2.2, 3.4], [0, 0, 0], [1, 1.4, 0.7]), P(T(1.3, 0.12, 16), 0x4fb4ff, [0, 2.2, 3.3])]), 1.8);
    const ring = new THREE.TorusGeometry(2.5, 0.08, 6, 32);
    for (const q of [head, jaw, eyes]) q.scale(1.35, 1.35, 1.35);
    return { body, segs, head, jaw, eyes, core, ring };
  });
}

export function buildHydra() {
  const g = geos();
  const root = new THREE.Group();
  const body = pivot(root, 0, 0, 0);
  const bones = [body];
  const parts = [[0, g.body]];
  const glowParts = [[0, g.core]];
  const necks = [];
  for (let n = 0; n < 3; n++) {
    const [x, y, z, yaw] = NECK_BASES[n];
    const base = pivot(body, x, y, z); base.rotation.y = yaw;
    bones.push(base);
    const segs = chain(base, SEG, SEG_LEN);
    segs.forEach((s, k) => { bones.push(s); parts.push([bones.length - 1, g.segs[k]]); });
    const head = pivot(segs[SEG - 1], 0, SEG_LEN, 0);
    bones.push(head); const hi = bones.length - 1;
    parts.push([hi, g.head]); glowParts.push([hi, g.eyes]);
    const jaw = pivot(head, 0, -0.3, 0.5);
    bones.push(jaw); parts.push([bones.length - 1, g.jaw]);
    // element shield glyph (own material per head so it can be recoloured as a uniform)
    const ring = new THREE.Mesh(g.ring, ringMat('hydra' + n, 0x7fd3ff));
    ring.position.set(0, 0.4, 1.5); ring.rotation.x = 0.2; ring.frustumCulled = false;
    head.add(ring);
    necks.push({ base, segs, head, jaw, ring, baseYaw: yaw });
  }
  const sk = buildSkin('hydra', root, bones, [
    { name: 'body', mat: vcMat(), parts, outline: 0.06 },
    { name: 'glow', mat: vcBasicMat(), parts: glowParts, shadow: false },
  ], [6, 16]);
  const halo = new THREE.Sprite(glowSpriteMat(0x7fe8ff, 0.0)); halo.scale.setScalar(7); halo.position.set(0, 2.2, 3.4); body.add(halo);
  return { root, rig: body, body, necks, halo, skin: sk, outlines: sk.outlines, headTop: 14 };
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
    onPhase: (i) => { if (i === 1) { rise = 0; vfx.preset?.('explosion_water', _v.copy(e.object.position).setY(waterY + 1), { scale: 3 }); ctx.audio('boss_roar', { position: e.object.position, volume: 1, pitch: 0.7 }); e.shakeAt(e.object.position, 0.7); } },
    onRespawnPhase: () => { if (e.phase === 0) { for (const h of heads) { h.dead = false; h.sever = 0; h.state = 'idle'; } e.reviveParts(); assignElements(); speedMul = 1; } },
    onPartBreak: (part) => severHead(part),
    onBodyHit: (res, hit) => { if (hit?.element === 'ice') freezeRing(); },
    deathPose: (dt, t) => { model.body.position.y = -Math.min(6, t * 2.2); model.body.rotation.z = Math.min(0.5, t * 0.2); },
    dissolveAt: 2.2, dissolveDur: 2.0, dissolveColor: 0x4fb4ff,
    onDefeat: () => { for (const h of heads) h.N.ring.visible = false; vfx.preset?.('explosion_water', _v.copy(e.object.position).setY(waterY + 2), { scale: 4 }); },
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
  let speedMul = 1, tideCd = 12, spoutCd = 6, freezeCd = 0, rise = 1, coreGlow = 0, rippleT = 0, ice = null;
  const tideState = { t: -1, tele: null };

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
    h.dead = true; h.sever = 0; h.tele?.stop?.(); h.tele = null; h.N.ring.visible = false;
    h.N.head.getWorldPosition(_v);
    vfx.preset?.('explosion_' + h.el, _v, { scale: 2.2 });
    vfx.burst(_v, { count: 50, color: [0xd8f4ff, elColor(h.el, 'mid')], speed: 9, spread: 1, size: 0.35, sizeEnd: 0.05, life: 1.2, gravity: 10, shape: 'droplet' });
    ctx.audio('boss_roar', { position: _v, volume: 1, pitch: 1.3 });
    e.shakeAt(_v, 0.6);
    // the survivors swap elements and speed up (+20 %)
    const live = heads.filter((q) => !q.dead);
    if (live.length > 1) { const first = live[0].el; for (let k = 0; k < live.length - 1; k++) live[k].el = live[k + 1].el; live[live.length - 1].el = first; }
    speedMul *= 1.2;
    assignElements();
    for (const q of live) { q.N.head.getWorldPosition(_w); vfx.burst(_w, { count: 18, color: [0xffffff, elColor(q.el, 'mid')], speed: 4, spread: 1, size: 0.3, sizeEnd: 0, life: 0.6, shape: 'spark' }); }
  }

  /** Ice on the lake: a ring of walkable ice discs around the body for 10 s (melee classes can reach the heads). */
  function freezeRing() {
    if (freezeCd > 0) return;
    const sf = W.surface; if (!sf?.freezeWater) return;
    freezeCd = 12;
    const c = A.position;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      _v.set(c.x + Math.sin(a) * 10.5, waterY, c.z + Math.cos(a) * 10.5);
      try { sf.freezeWater(_v, 4.2, 10); } catch (_) { /* */ }
    }
    vfx.shockwave?.(_v.set(c.x, waterY + 0.1, c.z), { color: 0xd8f6ff, radius: 14, duration: 0.8, opacity: 0.8 });
    e.emitCheck?.('freeze', 'start', 10);
  }
  const offFrozen = game.events.on?.('waterFrozen', (p) => {
    if (e.defeated || !p?.position) return;
    if (Math.hypot(p.position.x - A.position.x, p.position.z - A.position.z) < A.radius + 6) freezeRing();
  });
  e.freezeRing = freezeRing;

  // ---------------------------------------------------------------- attacks
  function headPick(kind) {
    const live = heads.filter((h) => !h.dead && h.state === 'idle' && h.cd <= 0);
    if (!live.length) return null;
    const pp = ctx.playerPos;
    live.sort((a, b) => a.N.head.getWorldPosition(_v).distanceToSquared(pp) - b.N.head.getWorldPosition(_w).distanceToSquared(pp));
    return kind === 'bite' ? live[0] : live[live.length - 1];
  }
  function startBite(h) {
    h.state = 'biteWind'; h.t = 0; h.hitDone = false;
    const p = e.object.position, pp = ctx.playerPos;
    h.target = (h.target || new THREE.Vector3()).copy(pp);
    _d.set(pp.x - p.x, 0, pp.z - p.z); const len = _d.length(); _d.normalize();
    _v.set(p.x + _d.x * 3, ctx.groundH(p.x + _d.x * 3, p.z + _d.z * 3), p.z + _d.z * 3);
    h.tele = ctx.tele({ shape: 'line', pos: _v, dir: _d, len: Math.min(17, len + 1.5), width: 3.2, dur: 1.1 / speedMul, color: 'damage' });
    game.events.emit('enemyAttack', { enemy: e, kind: 'bite' });
  }
  function startSpit(h) { h.state = 'spitWind'; h.t = 0; h.spits = 0; game.events.emit('enemyAttack', { enemy: e, kind: 'spit' }); }
  function startTide() {
    tideState.t = 0;
    _v.set(A.position.x, waterY, A.position.z);
    tideState.tele = ctx.tele({ shape: 'ring', pos: _v, r: 19, inner: 5.5, dur: 1.7 / Math.max(1, speedMul * 0.9), color: 'damage' });
    ctx.audio('charge', { position: e.object.position, volume: 0.9, pitch: 0.4 });
    game.events.emit('enemyAttack', { enemy: e, kind: 'tide' });
  }
  function tideHit() {
    const c = A.position;
    _v.set(c.x, waterY + 0.2, c.z);
    vfx.shockwave?.(_v, { color: 0xbfe8ff, radius: 20, duration: 0.9, opacity: 0.9, thickness: 0.8 });
    vfx.shockwave?.(_v, { color: 0xffffff, radius: 14, duration: 0.7, opacity: 0.6, thickness: 0.4 });
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      _w.set(c.x + Math.sin(a) * 12, waterY + 0.3, c.z + Math.cos(a) * 12);
      vfx.burst(_w, { count: 10, color: [0xffffff, 0x6fc8ff], speed: 7, spread: 0.4, dir: _d.set(Math.sin(a), 1.2, Math.cos(a)).normalize(), size: 0.3, sizeEnd: 0.06, life: 0.9, gravity: 12, shape: 'droplet' });
    }
    e.shakeAt(c, 0.5);
    ctx.audio('splash', { position: c, volume: 1, pitch: 0.6 });
    // in the water (and not on ice / a pillar top) inside the ring band → hit
    const pe = game.player?.entity, pp = ctx.realPlayerPos;
    if (!pe || pe.alive === false) return;
    const d = Math.hypot(pp.x - c.x, pp.z - c.z);
    const onIce = !!W.surface?.onIce?.(pp.x, pp.z);
    const wet = (W.waterDepth?.(pp.x, pp.z) || 0) > 0.15 && pp.y < waterY + 0.8;
    if (d < 19.5 && d > 5 && wet && !onIce) {
      _d.set(pp.x - c.x, 0, pp.z - c.z).normalize();
      game.combat.dealDamage(pe, { amount: D.tide, element: 'water', source: e, point: pp.clone().setY(pp.y + 1), direction: _d.clone(), knockback: 14, launch: 5, heavy: true, status: { wet: 6 } });
    }
  }
  const spouts = [];
  function startSpouts() {
    const pp = ctx.playerPos;
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + rand(0, 1), r = k === 0 ? 0 : rand(3, 6);
      const p = new THREE.Vector3(pp.x + Math.sin(a) * r, 0, pp.z + Math.cos(a) * r); p.y = Math.max(ctx.groundH(p.x, p.z), waterY - 0.1);
      spouts.push({ p, t: -k * 0.35, tele: ctx.tele({ shape: 'circle', pos: p, r: 2.6, dur: 1.2 + k * 0.35, color: 'damage' }) });
    }
  }

  e.think = (dt, sm) => {
    e.baseTick(dt);
    const k = sm * speedMul;
    freezeCd -= dt; tideCd -= dt * k; spoutCd -= dt * k;
    const p = e.object.position, pp = ctx.playerPos;
    // keep the body anchored in the lake centre, facing the player slowly
    p.x = A.position.x; p.z = A.position.z;
    const want = Math.atan2(pp.x - p.x, pp.z - p.z);
    let df = want - e.facing; df = Math.atan2(Math.sin(df), Math.cos(df));
    e.facing += clamp(df, -0.35 * dt, 0.35 * dt);
    if (e.transitioning || !e.playerInArena(22)) { for (const h of heads) if (h.state !== 'idle' && h.state !== 'recover') { h.state = 'idle'; h.tele?.stop?.(); } return; }
    // tidal sweep
    if (tideState.t >= 0) {
      tideState.t += dt * k;
      if (tideState.t >= 1.7) { tideState.t = -1; tideHit(); }
    } else if (tideCd <= 0) { tideCd = (e.phase >= 1 ? 9 : 14) + rand(0, 3); startTide(); }
    if (e.phase >= 1 && spoutCd <= 0) { spoutCd = rand(5, 7); startSpouts(); }
    for (let i = spouts.length - 1; i >= 0; i--) {
      const s = spouts[i]; s.t += dt;
      if (s.t >= 1.2) {
        spouts.splice(i, 1);
        vfx.preset?.('impact_water', _v.copy(s.p).setY(s.p.y + 0.5), { scale: 1.6 });
        vfx.burst(_v.copy(s.p), { count: 24, color: [0xffffff, 0x6fc8ff], speed: 10, spread: 0.25, dir: _d.set(0, 1, 0), size: 0.4, sizeEnd: 0.1, life: 1.1, gravity: 14, shape: 'droplet' });
        const pe = game.player?.entity, rp = ctx.realPlayerPos;
        if (pe && pe.alive !== false && Math.hypot(rp.x - s.p.x, rp.z - s.p.z) < 2.6 + 0.4) game.combat.dealDamage(pe, { amount: D.spout, element: 'water', source: e, point: rp.clone().setY(rp.y + 1), knockback: 4, launch: 9, heavy: true, status: { wet: 5 } });
      }
    }
    // heads
    const d = e.distP;
    let busy = 0;
    for (const h of heads) {
      if (h.dead) continue;
      h.cd -= dt * k; h.t += dt * k;
      if (h.state !== 'idle') busy++;
      switch (h.state) {
        case 'biteWind':
          if (h.t > 1.1) { h.state = 'bite'; h.t = 0; ctx.audio('boss_roar', { position: p, volume: 0.6, pitch: 1.5 }); }
          break;
        case 'bite': {
          h.N.head.getWorldPosition(_v);
          if (!h.hitDone && h.t > 0.12 && h.t < 0.45) {
            const pe = ctx.target;
            if (pe && pe.alive !== false && _v.distanceTo(ctx.playerCenter) < 3.2) {
              h.hitDone = true;
              _d.subVectors(ctx.playerCenter, _v).setY(0).normalize();
              ctx.hitPlayer(e, { amount: D.bite, element: h.el, knockback: 12, launch: 3 });
            }
          }
          if (h.t > 0.5) { h.state = 'recover'; h.t = 0; h.tele?.stop?.(); h.tele = null; ctx.dust(_v.setY(Math.max(ctx.groundH(_v.x, _v.z), waterY)), 2); vfx.shockwave?.(_v, { color: 0xbfe8ff, radius: 3.5, duration: 0.5, opacity: 0.7 }); }
          break;
        }
        case 'recover':
          // the head lies low for a moment: the melee window
          if (h.t > 1.5) { h.state = 'idle'; h.cd = rand(2.5, 4) / speedMul; }
          break;
        case 'spitWind':
          if (h.t > 0.7) { h.state = 'spit'; h.t = 0; }
          break;
        case 'spit':
          if (h.t > 0.28 * h.spits && h.spits < 3) {
            h.spits++;
            h.N.head.getWorldPosition(_v); _v.y += 0.2;
            const col = elColor(h.el, 'mid');
            ctx.projectiles.orb(_v, h.el, e, { color: col, amount: D.spit, speed: 11 });
            vfx.burst(_v, { count: 12, color: [0xffffff, col], speed: 4, spread: 0.6, size: 0.25, sizeEnd: 0, life: 0.4, shape: 'spark' });
            ctx.audio('cast_' + h.el, { position: _v, volume: 0.6, pitch: 0.7 });
          }
          if (h.t > 1.2) { h.state = 'idle'; h.cd = rand(3, 5) / speedMul; }
          break;
      }
    }
    // up to 2 heads attack at once (no allocation unless an attack actually starts)
    let live = 0, ready = 0;
    for (const h of heads) { if (!h.dead) { live++; if (h.state === 'idle' && h.cd <= 0) ready++; } }
    if (live && ready && busy < Math.min(2, live)) {
      const reach = d < 17;
      const h = headPick(reach && Math.random() < 0.65 ? 'bite' : 'spit');
      if (h) { if (reach && h === headPick('bite')) startBite(h); else startSpit(h); }
    }
    // ambient: ripples + the core shimmer
    rippleT -= dt;
    if (rippleT <= 0) { rippleT = 1.4; vfx.shockwave?.(_v.set(p.x, waterY + 0.05, p.z), { color: 0xbfe8ff, radius: 9, duration: 1.4, opacity: 0.35, thickness: 0.2 }); }
    void ice;
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
      else if (h.state === 'bite' || h.state === 'recover') {
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
  return e;
}
createHydra.prewarm = () => { if (!spare) spare = buildHydra(); return spare.root; };
