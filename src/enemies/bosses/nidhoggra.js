// 공허룡 니드호그라 (id nidhoggra, the root plateau; DESIGN §8.6, CONTRACT §15). The final boss: a 70 m void wyrm.
// Real terrain only (no moving platforms, no spine running). All damage goes through boss parts (the head itself is armoured):
//   Phase 1 「뿌리를 갉는 자」: the head plate carries one of 5 locks (rotating every 20 s, the player's counters first); claw slam
//     (parryable, golden glint), void breath sweep (step behind a root pillar), void-mist minions every 30 s, and at 66 % the
//     lightning-rod check (3 rods + a player lightning.rod; or perfect-parry the charged breath) → 6 s stagger → phase 2.
//   Phase 2 「정령의 족쇄」: the wyrm coils past the 5 root pillars; every 15 s one oath shard drapes beside a pillar top for 10 s
//     (updraft up, glide, land, hit it; ranged ×0.7 from the ground). A shard broken after its lock was stripped by a counter or a
//     reaction grants that oath's buff. At 33 % the 공허 해일 stagger check (12 s to break it; failure knocks you down and restarts).
//   Phase 3 (cut line 3 — the P1 sky phase is not built): 「세계수의 새벽」 the heart crystal opens on the plateau (×2.5, 20 s windows);
//     V throws 루미엘의 창. The final strike → cinematic.playFinale(onDone) → bossDefeated {id:'nidhoggra', final:true}.
// Locks: a counter hit strips poise×1, a reaction ×2, the gift (V) 50 % once per lock and never grants a shard buff.
import * as THREE from 'three';
import { createBoss } from '../bossbase.js';
import { buildNidhoggra, layBody, poseLimb, SEGMENTS, SHARD_ELEMENTS } from './nidhoggra_model.js';
import { CLASS_DEFS, CLASS_IDS, classElements } from '../../core/classes.js';
import { elColor } from '../../core/elements.js';
import { clamp, damp, rand } from '../../core/utils.js';

/** DESIGN §8.6 lock table (data; playtest3 checks every class opens ≥ 4 of 5 per phase). */
export const NIDHOGGRA_LOCKS = {
  phase1: [
    { id: 'veil_light', nameKo: '거울 장막', element: 'light', counters: ['shadow', 'lightning', 'earth'] },
    { id: 'veil_water', nameKo: '물 장막', element: 'water', counters: ['lightning', 'ice', 'nature', 'earth'] },
    { id: 'veil_earth', nameKo: '암석 장막', element: 'earth', counters: ['water', 'wind', 'nature'] },
    { id: 'veil_shadow', nameKo: '그림자 장막', element: 'shadow', counters: ['light', 'fire', 'wind'] },
    { id: 'veil_nature', nameKo: '덩굴 장막', element: 'nature', counters: ['fire', 'ice', 'shadow'] },
  ],
  phase2: [
    { id: 'oath_fire', nameKo: '화염 서약', element: 'fire', counters: ['water', 'ice', 'earth'] },
    { id: 'oath_ice', nameKo: '빙결 서약', element: 'ice', counters: ['fire', 'light', 'earth'] },
    { id: 'oath_lightning', nameKo: '번개 서약', element: 'lightning', counters: ['earth', 'water', 'nature', 'light'] },
    { id: 'oath_wind', nameKo: '바람 서약', element: 'wind', counters: ['earth', 'ice', 'shadow'] },
    { id: 'oath_earth', nameKo: '대지 서약', element: 'earth', counters: ['lightning', 'wind', 'water'] },
  ],
};
/** Shard buffs (DESIGN §8.6), as game.stats sources `boss:nidhoggra_<el>` for the rest of the fight. */
export const SHARD_BUFFS = {
  fire: { nameKo: '화염의 서약: 공격에 화상이 깃든다', mods: { fireDmg: 1.2 } },
  ice: { nameKo: '빙결의 서약: 반격이 적을 얼린다', mods: { chillToFreezeAdd: 2, parryWindowAdd: 0.05 } },
  lightning: { nameKo: '번개의 서약: 공격·시전 속도 +20%', mods: { atkSpeed: 1.2, castSpeed: 1.2 } },
  wind: { nameKo: '바람의 서약: 활공 스태미나 무한, 상승 기류 +30%', mods: { infiniteGlide: true, glideStamMul: 0 } },
  earth: { nameKo: '대지의 서약: 받는 피해 -20%', mods: { dmgTakenMul: 0.8 } },
};
/** How many locks of a phase the class can open (all 6 accessible elements, or the 2 primaries only). */
export function lockCoverage(cls, phase = 1, primaryOnly = false) {
  const els = primaryOnly ? (CLASS_DEFS[cls]?.primary || []) : classElements(cls);
  return NIDHOGGRA_LOCKS['phase' + phase].filter((L) => L.counters.some((c) => els.includes(c))).length;
}
export function lockCoverageTable() {
  const out = {};
  for (const c of CLASS_IDS) out[c] = { p1: lockCoverage(c, 1), p2: lockCoverage(c, 2), p1Primary: lockCoverage(c, 1, true), p2Primary: lockCoverage(c, 2, true) };
  return out;
}

export const NIDHOGGRA_DATA = {
  id: 'nidhoggra', name: '니드호그라', title: '공허룡', sub: '세계수의 뿌리를 갉는 자',
  pool: 20200, shardHp: 1000, heartHp: 4000,
  phases: [{ name: '뿌리를 갉는 자' }, { at: 0.66, name: '정령의 족쇄' }, { at: 0.33, name: '세계수의 새벽' }],
  plateEvery: 20, shardEvery: 15, shardWindow: 10, minionsEvery: 30, rodsCharge: 4, tideDur: 12, heartWindow: 20, heartClosed: 8,
  claw: 30, breath: 28, rain: 20, rodFailFrac: 0.4, tideFailFrac: 0.25, spear: { charges: 3, recharge: 5, frac: 0.03 },
  ui: { plate: '머리 장막', heart: '아스트라의 핵', rod: '볼타의 피뢰침' },
};

let spare = null;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

export function createNidhoggra(ctx, arena, opts = {}) {
  const game = ctx.game, vfx = game.vfx;
  const D = NIDHOGGRA_DATA;
  const A = arena || { position: new THREE.Vector3(108, 52, -132), radius: 34, pillars: [] };
  const C0 = A.position.clone();
  const top = C0.y;
  const pillars = (A.pillars || []).map((q) => ({ pos: (q.pos || q.position).clone(), top: q.top ?? (q.pos || q.position).y }));
  while (pillars.length < 5) { const a = 0.25 + pillars.length * 1.2566; pillars.push({ pos: new THREE.Vector3(C0.x + Math.sin(a) * 22, top + 12, C0.z + Math.cos(a) * 22), top: top + 12 }); }
  const model = spare || buildNidhoggra(); spare = null;
  game.scene.add(model.root);
  const anchor = new THREE.Object3D();   // the entity's object follows the head
  const cls = game.progression?.cls || 'mage';
  const myEls = classElements(cls);

  // entrance side: the wyrm rises on the far side of the plateau from the player
  const entryA = Math.atan2(ctx.realPlayerPos.x - C0.x, ctx.realPlayerPos.z - C0.z);
  const a0 = Number.isFinite(entryA) ? entryA + Math.PI : 0;
  const fwd = new THREE.Vector3(-Math.sin(a0), 0, -Math.cos(a0));   // from the head toward the plateau centre

  const st = {
    plateT: D.plateEvery, lockIdx: 0, order: [], rods: { active: false, t: 0, lit: [false, false, false], done: false, cd: 0 },
    shardIdx: -1, shardT: 4, shardWin: 0, tide: { active: false, t: 0, done: false, retry: 0 }, heartOpen: false, heartT: 0,
    minionT: 12, minions: [], atk: null, atkT: 0, cd: 3, stagger: 0, tele: null, rodTele: [], clawL: null, breathDir: new THREE.Vector3(),
    gift: { ready: false, charges: 0, element: null, purpose: null, recharge: 0 }, headPos: new THREE.Vector3(), headLook: new THREE.Vector3(),
    flyIn: 0, buffs: [],
  };
  const segPts = Array.from({ length: SEGMENTS }, () => new THREE.Vector3());
  const ctrl = Array.from({ length: 9 }, () => new THREE.Vector3());
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');

  const e = createBoss(ctx, {
    id: 'nidhoggra', name: D.name, title: D.title, sub: D.sub, model: { root: anchor, rig: anchor, headTop: 8, outlines: [] }, arena: A, zoneId: 'plateau',
    position: C0.clone(), baseHp: D.pool, radius: 4.5, height: 6, mass: 500, breakMax: 200, music: 'final_boss', isVoid: true, isFinalBoss: true,
    phases: D.phases, transition: 3.2, lockMul: 0.35, dissolveColor: 0xfff1c0,
    gate: (i) => (i === 1 ? st.rods.done : i === 2 ? st.tide.done : true),
    canDie: () => e.phase >= 2,
    onPhase: (i) => onPhase(i),
    onPartBreak: (part) => onPartBreak(part),
    onLockStripped: (part, by) => onStrip(part, by),
    onDebugPhase: (k) => { if (k === 1) st.rods.done = true; if (k === 2) { for (const s of shards) if (s.part.alive) { s.part.alive = false; s.broken = true; } st.tide.done = true; } },
    onRespawnPhase: () => { st.rods.active = false; st.tide.active = false; clearTele(); if (e.phase === 1) for (const s of shards) if (!s.broken) { s.part.hp = s.part.maxHp; s.part.alive = true; } },
    finale: (done) => {
      const C = game.cinematic;
      if (C?.playFinale) { try { C.playFinale(() => done()); return; } catch (err) { console.error('[nidhoggra] playFinale', err); } }
      done();
    },
    onDefeat: () => { clearTele(); for (const b of st.buffs) { try { game.stats?.clear?.(b); } catch (_) { /* */ } } st.gift.ready = false; st.gift.charges = 0; },
    onDissolve: () => { try { vfx.dissolve?.(model.root, { dur: 2.6, color: 0xfff1c0, stagger: true }); } catch (_) { /* */ } },
    deathPose: (dt, t) => { model.heartHalo.material.opacity = Math.min(1, 0.6 + t); },
    dissolveAt: 0.6, dissolveDur: 2.6,
    onRemove: () => { model.root.removeFromParent(); killMinions(); },
  });
  e.noLod = true; e.noPhysics = true;
  e.setBodyMul(() => (st.tide.active ? 0.05 : 0));   // armoured: all damage goes through the plate / shards / heart
  e.lockTable = NIDHOGGRA_LOCKS;
  e.modelRoot = model.root;

  // ---------------------------------------------------------------- parts
  const plate = e.addPart({ id: 'headPlate', name: D.ui.plate, hp: e.maxHp * 10, worldPos: new THREE.Vector3(), radius: 5.5, height: 7, fwd: 1,
    lock: { element: 'light', counters: [] }, mul: () => (plate.lock && plate.lock.gauge <= 0 ? 1.5 : 1) });
  const shardSpan = 0.33 * e.maxHp, shardHp = Math.round(D.shardHp * (e.maxHp / D.pool));
  const shards = NIDHOGGRA_LOCKS.phase2.map((L, i) => {
    const part = e.addPart({ id: L.id, name: L.nameKo, hp: shardHp, worldPos: new THREE.Vector3(), radius: 1.8, height: 3.6, fwd: shardSpan / (5 * shardHp),
      invulnerable: true, lock: { element: L.element, counters: L.counters.slice() },
      mul: () => (Math.hypot(ctx.realPlayerPos.x - part.object.position.x, ctx.realPlayerPos.z - part.object.position.z) > 7 || ctx.realPlayerPos.y < part.object.position.y - 3 ? 0.7 : 1) * (part.lock.gauge <= 0 ? 1.5 : 1) });
    return { i, L, part, broken: false, pillar: pillars[i % pillars.length], pos: part.worldPos };
  });
  const heartSpan = 0.33 * e.maxHp, heartHp = Math.round(D.heartHp * (e.maxHp / D.pool));
  const heart = e.addPart({ id: 'heart', name: D.ui.heart, hp: heartHp, worldPos: new THREE.Vector3(), radius: 2.4, height: 3.6, fwd: heartSpan / heartHp, mul: 2.5, invulnerable: true });
  // the head plate is not a real HP bar: hide it from the payload's part list during phase 2+
  for (const p of [plate, ...shards.map((s) => s.part), heart]) p.invulnerable = p !== plate;

  // ---------------------------------------------------------------- lightning rods (props)
  const rods = [0, 1, 2].map((k) => {
    const a = a0 + Math.PI + (k - 1) * 1.6;
    const obj = new THREE.Object3D();
    obj.position.set(C0.x + Math.sin(a) * 15, 0, C0.z + Math.cos(a) * 15); obj.position.y = ctx.groundH(obj.position.x, obj.position.z);
    game.scene.add(obj);
    const r = { id: 'nidRod' + k, team: 'enemy', isProp: true, alive: false, object: obj, hp: 1e9, maxHp: 1e9, radius: 1.0, height: 6, mass: 1e6, statuses: {}, velocity: new THREE.Vector3(), xpValue: 0, k,
      name: D.ui.rod, onHit() { lightRod(k); }, onDeath() { lightRod(k); }, getCenter(out = new THREE.Vector3()) { return out.copy(obj.position).setY(obj.position.y + 3); } };
    return r;
  });
  function lightRod(k) {
    if (!st.rods.active || st.rods.lit[k]) return;
    st.rods.lit[k] = true;
    const p = rods[k].object.position;
    model.rods.setColorAt(k, _c.setHex(0xe9d8ff).multiplyScalar(2.4)); model.rods.instanceColor.needsUpdate = true;
    vfx.preset?.('impact_lightning', _v.copy(p).setY(p.y + 5.9), { scale: 1.6 });
    ctx.audio('impact_lightning', { position: p, volume: 0.9 });
  }
  const _c = new THREE.Color();

  // ---------------------------------------------------------------- lock rotation (phase 1) + gift
  function buildOrder() {
    // the plates the player can counter come first (shuffled), the rest after
    const can = [], cant = [];
    for (const L of NIDHOGGRA_LOCKS.phase1) (L.counters.some((c) => myEls.includes(c)) ? can : cant).push(L);
    for (const arr of [can, cant]) for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    st.order = can.concat(cant);
  }
  function setPlateLock(L) {
    plate.lock.element = L.element; plate.lock.counters = L.counters.slice(); plate.lock.gauge = 100; plate.lock.stripped = null; plate.lock.giftUsed = false;
    plate.lock.id = L.id; plate.name = L.nameKo;
    model.lock.material.color.setHex(elColor(L.element, 'hex'));
    offerGift(L.element, 'lock');
  }
  function offerGift(element, purpose, charges = 1) {
    const G = st.gift;
    G.ready = true; G.charges = charges; G.element = element; G.purpose = purpose;
    game.events.emit('giftReady', { element, purpose });
  }
  const gift = {
    get ready() { return st.gift.ready && st.gift.charges > 0 && !e.defeated && st.gift.recharge <= 0; },
    get charges() { return st.gift.charges; },
    get element() { return st.gift.element; },
    get purpose() { return st.gift.purpose; },
    /** V: strip 50 % of the current lock (no shard buff), add break during the tide check, or throw 루미엘의 창 at the heart. */
    use() {
      const G = st.gift;
      if (!gift.ready) return false;
      if (G.purpose === 'spear') {
        G.charges--; G.recharge = 0.4;
        if (G.charges <= 0) G.rechargeFull = D.spear.recharge;
        throwSpear();
        game.events.emit('giftUsed', { element: 'light', purpose: 'spear' });
        return true;
      }
      if (st.tide.active) { G.charges--; try { game.combat?.addBreak?.(e, 40); } catch (_) { /* */ } game.events.emit('giftUsed', { element: G.element, purpose: 'lock' }); return true; }
      const part = currentLockPart();
      if (!part || !part.lock || part.lock.gauge <= 0) return false;
      G.charges--;
      part.lock.giftUsed = true;
      e.stripLock(part, 50, 'gift');
      part.getCenter(_v);
      vfx.preset?.('rx_resonance', _v, { scale: 1.2 });
      game.events.emit('giftUsed', { element: G.element, purpose: 'lock' });
      return true;
    },
  };
  e.gift = gift;
  function currentLockPart() {
    if (e.phase === 0) return plate;
    if (e.phase === 1 && st.shardIdx >= 0) return shards[st.shardIdx].part;
    return null;
  }
  function onStrip(part, by) {
    part.getCenter(_v);
    vfx.preset?.('rx_shatter', _v, { scale: 1.6 });
    vfx.burst(_v, { count: 40, color: [0xffffff, elColor(part.lock.element, 'hex')], speed: 8, spread: 1, size: 0.3, sizeEnd: 0, life: 0.8, shape: 'shard', gravity: 6 });
    ctx.audio('shatter', { position: _v, volume: 1, pitch: 0.7 });
    if (part !== plate) {
      const s = shards.find((q) => q.part === part);
      if (s && (by === 'counter' || by === 'reaction') && !part.lock.giftUsed) s.buffEarned = true;
    }
  }
  function grantBuff(el) {
    const B = SHARD_BUFFS[el]; if (!B) return;
    const id = 'boss:nidhoggra_' + el;
    try { game.stats?.set?.(id, B.mods, { duration: 900 }); st.buffs.push(id); } catch (_) { /* */ }
    try { game.ui?.tip?.('shard_' + el, B.nameKo); } catch (_) { /* */ }
    game.events.emit('shardBuff', { element: el, nameKo: B.nameKo });
  }
  function onPartBreak(part) {
    const s = shards.find((q) => q.part === part);
    if (!s) return;
    s.broken = true;
    if (s.buffEarned) grantBuff(s.L.element);
    // the freed oath: a spirit-coloured pillar of light
    s.pos.y += 0;
    vfx.preset?.('explosion_' + s.L.element, s.pos, { scale: 2.4 });
    for (let k = 0; k < 4; k++) vfx.burst(_v.copy(s.pos).setY(s.pos.y + k * 3), { count: 14, color: [0xffffff, elColor(s.L.element, 'hex')], speed: 3, spread: 1, size: 0.4, sizeEnd: 0, life: 1.4, shape: 'spark', gravity: -6 });
    if (st.shardIdx === s.i) { st.shardIdx = -1; st.shardT = 3; st.tele?.stop?.(); st.tele = null; }
  }

  // ---------------------------------------------------------------- phases
  function clearTele() { st.tele?.stop?.(); st.tele = null; for (const h of st.rodTele) h?.stop?.(); st.rodTele.length = 0; }
  function onPhase(i) {
    clearTele(); st.atk = null;
    if (i === 1) {
      st.rods.active = false; hideRods();
      plate.lock.gauge = 0; plate.alive = false; plate.invulnerable = true;
      st.shardT = 4; st.shardIdx = -1; st.gift.ready = false;
      vfx.preset?.('rx_break', st.headPos, { scale: 2.5 });
      ctx.audio('boss_roar', { position: st.headPos, volume: 1, pitch: 0.55 });
    } else if (i === 2) {
      st.tide.active = false;
      heart.invulnerable = false; st.heartOpen = true; st.heartT = D.heartWindow;
      offerGift('light', 'spear', D.spear.charges);
      vfx.preset?.('explosion_light', _v.copy(C0).setY(top + 2), { scale: 3.5 });
      try { game.post?.grade?.('golden', 0.35); } catch (_) { /* */ }
      ctx.audio('boss_roar', { position: st.headPos, volume: 1, pitch: 0.45 });
    }
  }
  function hideRods() { for (const r of rods) { if (r.alive) { r.alive = false; try { game.combat.unregister(r); } catch (_) { /* */ } } } model.rods.count = 0; }
  function startRods() {
    st.rods.active = true; st.rods.t = 0; st.rods.lit = [false, false, false];
    for (const r of rods) { r.alive = true; try { game.combat.register(r); } catch (_) { /* */ } }
    for (let k = 0; k < 3; k++) model.rods.setColorAt(k, _c.setHex(0x8a7aa8));
    model.rods.instanceColor.needsUpdate = true;
    e.emitCheck('rods', 'start', D.rodsCharge);
    st.tele = ctx.tele({ shape: 'cone', pos: _v.copy(st.headPos).setY(top), dir: fwd, r: 30, angle: 100, dur: D.rodsCharge, color: 'void' });
    for (const r of rods) st.rodTele.push(ctx.tele({ shape: 'ring', pos: r.object.position, r: 2.2, inner: 1.6, dur: D.rodsCharge, color: 0xc9a4ff }));
    ctx.audio('charge', { position: st.headPos, volume: 1, pitch: 0.4 });
  }
  function playerRodCount() {
    try { const o = game.spells?.api?.objects; const n = o?.count?.('rod') ?? o?.list?.('rod')?.length ?? 0; return n > 0 ? 1 : 0; } catch (_) { return 0; }
  }
  function endRods(ok) {
    st.rods.active = false; clearTele();
    e.emitCheck('rods', ok ? 'success' : 'fail', 0);
    if (ok) {
      st.rods.done = true; st.stagger = 6;
      vfx.preset?.('rx_overload', st.headPos, { scale: 3 });
      vfx.flashSprite?.(st.headPos, 0xe9d8ff, 10, 0.5, 1.6);
      e.shakeAt(st.headPos, 1.0);
    } else {
      st.rods.cd = 6;
      const pe = game.player?.entity;
      vfx.preset?.('explosion_lightning', _v.copy(ctx.realPlayerPos).setY(ctx.realPlayerPos.y + 1), { scale: 2.5 });
      if (pe && pe.alive !== false) {
        const mh = game.player?.maxHp || pe.maxHp || 100;
        const dmg = Math.min(Math.round(mh * D.rodFailFrac), Math.max(0, (pe.hp ?? mh) - 1));
        if (dmg > 0) game.combat.dealDamage(pe, { amount: dmg, fixed: true, element: 'lightning', source: e, point: ctx.realPlayerPos.clone().setY(ctx.realPlayerPos.y + 1), knockback: 14, launch: 5, noReaction: true });
      }
      hideRods();
    }
  }
  const offBlocked = game.events.on('blocked', (p) => {
    if (!p?.parried) return;
    if (p.source !== e) return;
    if (st.rods.active) endRods(true);
  });
  const offBreak = game.events.on('break', (p) => {
    if (p?.target !== e || !st.tide.active) return;
    st.tide.active = false; st.tide.done = true; clearTele();
    e.emitCheck('tide', 'success', 0);
    e.hp = Math.min(e.hp, Math.round(0.33 * e.maxHp)); e.enterPhase(2);
  });
  function startTide() {
    st.tide.active = true; st.tide.t = 0;
    e.breakValue = e.breakMax;
    const dur = D.tideDur + (game.settings?.values?.difficulty === 'easy' ? 4 : 0);
    st.tide.dur = dur;
    e.emitCheck('tide', 'start', dur);
    st.tele = ctx.tele({ shape: 'ring', pos: _v.copy(C0).setY(top), r: A.radius - 2, inner: 4, dur, color: 'void' });
    offerGift('void', 'lock', 1);
    ctx.audio('charge', { position: st.headPos, volume: 1, pitch: 0.3 });
  }
  function failTide() {
    st.tide.active = false; st.tide.retry = 4; clearTele();
    e.emitCheck('tide', 'fail', 0);
    vfx.shockwave?.(_v.copy(C0).setY(top + 0.3), { color: 0x9a5cff, radius: A.radius, duration: 1.0, opacity: 0.9, thickness: 1 });
    const pe = game.player?.entity;
    if (pe && pe.alive !== false) {
      const mh = game.player?.maxHp || pe.maxHp || 100;
      const dmg = Math.min(Math.round(mh * D.tideFailFrac), Math.max(0, (pe.hp ?? mh) - 1));
      _d.set(ctx.realPlayerPos.x - C0.x, 0, ctx.realPlayerPos.z - C0.z).normalize();
      if (dmg > 0) game.combat.dealDamage(pe, { amount: dmg, fixed: true, element: 'void', source: e, point: ctx.realPlayerPos.clone().setY(ctx.realPlayerPos.y + 1), direction: _d.clone(), knockback: 12, launch: 6, noReaction: true });
    }
  }
  function throwSpear() {
    const pp = ctx.realPlayerCenter;
    heart.getCenter(_v);
    try { vfx.beam?.(pp.clone(), _v.clone(), { color: 0xfff1c0, width: 0.6, duration: 0.3 }); } catch (_) { /* */ }
    vfx.preset?.('impact_light', _v, { scale: 1.8 });
    if (!heart.invulnerable && heart.alive) game.combat.dealDamage(heart, { amount: Math.round(heart.maxHp * D.spear.frac), fixed: true, element: 'light', source: 'player', noReaction: true, tags: ['gift'] });
  }

  // ---------------------------------------------------------------- minions
  function killMinions() { for (const m of st.minions) if (m.alive) { try { game.combat.dealDamage(m, { amount: 1e6, fixed: true, source: 'player', noReaction: true }); } catch (_) { /* */ } } st.minions.length = 0; }
  function spawnMinions() {
    st.minions = st.minions.filter((m) => m.alive && !m.removed);
    const pp = ctx.realPlayerPos;
    for (let k = st.minions.length; k < 3; k++) {
      const a = rand(0, 6.28), r = rand(6, 10);
      _v.set(pp.x + Math.sin(a) * r, 0, pp.z + Math.cos(a) * r);
      _d.set(_v.x - C0.x, 0, _v.z - C0.z); if (_d.length() > A.radius - 4) { _d.setLength(A.radius - 4); _v.set(C0.x + _d.x, 0, C0.z + _d.z); }
      const m = ctx.spawnSummon('wraith', _v.clone(), { zoneId: 'plateau', noLeap: true });
      if (m) { m.xpValue = 0; st.minions.push(m); vfx.burst(m.getCenter(_w), { count: 24, color: [0x5a2a9a, 0x160f24], speed: 3, spread: 1, size: 0.6, sizeEnd: 1.4, life: 0.9, shape: 'smoke', additive: false }); }
    }
  }

  // ---------------------------------------------------------------- attacks
  function nearestLimb() {
    const pp = ctx.playerPos;
    let best = model.limbs[0], bd = Infinity;
    for (const L of model.limbs) { const d = L.shoulder.distanceToSquared(pp); if (d < bd) { bd = d; best = L; } }
    return best;
  }
  function begin(kind) {
    st.atk = kind; st.atkT = 0;
    const pp = ctx.playerPos;
    game.events.emit('enemyAttack', { enemy: e, kind });
    if (kind === 'claw') {
      const L = st.clawL = nearestLimb();
      _v.set(pp.x, 0, pp.z); _d.set(_v.x - C0.x, 0, _v.z - C0.z); if (_d.length() > A.radius - 3) { _d.setLength(A.radius - 3); _v.set(C0.x + _d.x, 0, C0.z + _d.z); }
      _v.y = ctx.groundH(_v.x, _v.z);
      L.slamAt = (L.slamAt || new THREE.Vector3()).copy(_v);
      st.tele = ctx.tele({ shape: 'circle', pos: _v, r: 5, dur: 1.2, color: 'void', parryable: true });
    } else if (kind === 'breath') {
      _v.copy(st.headPos); _v.y = ctx.groundH(_v.x, _v.z);
      st.breathDir.set(pp.x - _v.x, 0, pp.z - _v.z).normalize();
      st.tele = ctx.tele({ shape: 'cone', pos: _v, dir: st.breathDir, r: 26, angle: 70, dur: 1.5, color: 'void' });
      ctx.audio('charge', { position: st.headPos, volume: 0.9, pitch: 0.5 });
    } else if (kind === 'rain') {
      st.rain = [];
      for (let k = 0; k < 4; k++) {
        const a = k * 1.57 + rand(0, 1), r = k === 0 ? 0 : rand(3, 7);
        const p = new THREE.Vector3(pp.x + Math.sin(a) * r, 0, pp.z + Math.cos(a) * r); p.y = ctx.groundH(p.x, p.z);
        st.rain.push({ p, h: ctx.tele({ shape: 'circle', pos: p, r: 3, dur: 1.4 + k * 0.2, color: 'void' }), t: -k * 0.2, done: false });
      }
    }
  }
  function pillarCovers(from, to) {
    // stepping behind a root pillar blocks the breath
    for (const P of pillars) {
      _w.subVectors(to, from).setY(0); const len = _w.length(); if (len < 1e-3) continue; _w.multiplyScalar(1 / len);
      _d.set(P.pos.x - from.x, 0, P.pos.z - from.z);
      const along = _d.dot(_w); if (along < 0 || along > len) continue;
      const across = Math.abs(_d.x * _w.z - _d.z * _w.x);
      if (across < 3.2 && len - along < 9) return true;
    }
    return false;
  }
  function resolveAttack() {
    const pe = game.player?.entity, rp = ctx.realPlayerPos;
    if (st.atk === 'claw') {
      const L = st.clawL;
      ctx.slam(L.slamAt, 5, { amount: D.claw, element: 'void', knockback: 14, launch: 6 }, e, 2.4);
      st.dip = 2.6;
      vfx.groundDecal?.('violet', L.slamAt, 5, 8);
      e.shakeAt(L.slamAt, 1.1);
    } else if (st.atk === 'breath') {
      _v.copy(st.headPos); _v.y = ctx.groundH(_v.x, _v.z);
      for (let k = 1; k <= 8; k++) { _w.copy(_v).addScaledVector(st.breathDir, k * 3); _w.y += 1.5; vfx.burst(_w, { count: 10, color: [0xb14bff, 0x2a1440], speed: 4, spread: 0.6, dir: st.breathDir, size: 0.9, sizeEnd: 2.0, life: 0.9, shape: 'smoke', additive: k % 2 === 0, drag: 1.5 }); }
      if (pe && pe.alive !== false) {
        _d.set(rp.x - _v.x, 0, rp.z - _v.z); const dd = _d.length(); _d.normalize();
        const inCone = dd < 26 && _d.dot(st.breathDir) > Math.cos(35 * Math.PI / 180);
        if (inCone && !pillarCovers(_v, rp)) game.combat.dealDamage(pe, { amount: D.breath, element: 'void', source: e, point: rp.clone().setY(rp.y + 1), direction: st.breathDir.clone(), knockback: 10, heavy: true, status: { blight: 3 } });
      }
    }
  }

  // ---------------------------------------------------------------- per frame
  e.think = (dt, sm) => {
    e.baseTick(dt);
    const G = st.gift;
    if (G.recharge > 0) G.recharge -= dt;
    if (st.dip > 0) st.dip -= dt;
    if (G.rechargeFull > 0) { G.rechargeFull -= dt; if (G.rechargeFull <= 0 && G.purpose === 'spear') { G.charges = D.spear.charges; game.events.emit('giftReady', { element: 'light', purpose: 'spear' }); } }
    // rain resolution runs even between attacks
    if (st.rain) for (const r of st.rain) {
      if (r.done) continue; r.t += dt;
      if (r.t >= 1.4) { r.done = true; vfx.preset?.('explosion_shadow', _v.copy(r.p).setY(r.p.y + 0.5), { scale: 1.2 }); const pe = game.player?.entity, rp = ctx.realPlayerPos; if (pe && pe.alive !== false && Math.hypot(rp.x - r.p.x, rp.z - r.p.z) < 3.4) game.combat.dealDamage(pe, { amount: D.rain, element: 'void', source: e, point: rp.clone().setY(rp.y + 1), knockback: 6, launch: 4 }); }
    }
    if (e.transitioning || e.defeated) return;
    if (!e.playerInArena(30)) return;
    if (st.stagger > 0) { st.stagger -= dt; if (st.stagger <= 0 && st.rods.done && e.phase === 0) e.enterPhase(1); return; }
    // phase-1 plate rotation + the rods check at 66 %
    if (e.phase === 0) {
      if (!st.order.length) buildOrder();
      if (st.plateT >= D.plateEvery || plate.lock.counters.length === 0) { st.plateT = 0; setPlateLock(st.order[st.lockIdx++ % st.order.length]); }
      st.plateT += dt;
      st.rods.cd -= dt;
      if (!st.rods.active && !st.rods.done && st.rods.cd <= 0 && e.hp <= 0.66 * e.maxHp + 1) { st.atk = null; clearTele(); startRods(); }
      if (st.rods.active) {
        st.rods.t += dt;
        const lit = st.rods.lit.filter(Boolean).length + playerRodCount();
        if (lit >= 3) endRods(true);
        else if (st.rods.t >= D.rodsCharge) endRods(false);
        return;
      }
    }
    // phase-2 shard windows + the tide check at 33 %
    if (e.phase === 1) {
      if (st.tide.active) {
        st.tide.t += dt;
        if (st.tide.t >= st.tide.dur) failTide();
        return;
      }
      if (st.tide.retry > 0) { st.tide.retry -= dt; if (st.tide.retry <= 0) startTide(); }
      else if (!st.tide.done && shards.every((s) => s.broken)) startTide();
      st.shardT -= dt;
      if (st.shardIdx >= 0) {
        st.shardWin -= dt;
        if (st.shardWin <= 0) { const s = shards[st.shardIdx]; s.part.invulnerable = true; st.shardIdx = -1; st.shardT = D.shardEvery - D.shardWindow; st.tele?.stop?.(); st.tele = null; }
      } else if (st.shardT <= 0) {
        const s = shards.find((q) => !q.broken && q.i > (st.lastShard ?? -1)) || shards.find((q) => !q.broken);
        if (s) {
          st.shardIdx = s.i; st.lastShard = s.i; st.shardWin = D.shardWindow;
          s.part.invulnerable = false; s.part.lock.gauge = Math.max(s.part.lock.gauge, s.part.lock.stripped ? 0 : 100);
          st.tele = ctx.tele({ shape: 'ring', pos: _v.set(s.pillar.pos.x, s.pillar.top, s.pillar.pos.z), r: 4, inner: 3, dur: D.shardWindow, color: 'holy' });
          offerGift(s.L.element, 'lock');
        }
      }
    }
    // phase-3 (cut line): heart windows
    if (e.phase === 2) {
      st.heartT -= dt;
      if (st.heartT <= 0) { st.heartOpen = !st.heartOpen; st.heartT = st.heartOpen ? D.heartWindow : D.heartClosed; heart.invulnerable = !st.heartOpen; }
    }
    // minions
    st.minionT -= dt;
    if (st.minionT <= 0 && e.phase < 2) { st.minionT = D.minionsEvery; spawnMinions(); }
    // attacks
    if (st.atk) {
      st.atkT += dt * sm;
      const T = st.atk === 'claw' ? 1.2 : st.atk === 'breath' ? 1.5 : 1.8;
      if (!st.resolved && st.atkT >= T) { st.resolved = true; st.tele = null; resolveAttack(); }
      if (st.atkT >= T + 1.2) { st.atk = null; st.resolved = false; st.cd = rand(2.0, 3.2); }
      return;
    }
    st.cd -= dt * sm;
    if (st.cd <= 0) {
      const d = Math.hypot(ctx.playerPos.x - st.headPos.x, ctx.playerPos.z - st.headPos.z);
      const r = Math.random();
      if (e.phase === 0) begin(d < 22 && r < 0.55 ? 'claw' : 'breath');
      else if (e.phase === 1) begin(r < 0.5 ? 'rain' : 'breath');
      else begin(st.heartOpen ? 'rain' : r < 0.5 ? 'breath' : 'claw');
    }
  };

  // parry the claw → big stagger (+15 break from combat's blocked listener)
  e.onParried = () => {
    if (st.atk !== 'claw' && !st.rods.active) return;
    st.atk = null; st.resolved = false; st.tele?.stop?.(); st.tele = null;
    st.stagger = Math.max(st.stagger, 2.2);
    try { game.hitstop?.(0.12); } catch (_) { /* */ }
    vfx.flashSprite?.(st.headPos, 0xffe08a, 8, 0.25, 1.4);
  };

  // ---------------------------------------------------------------- body + limbs (render rate)
  const sideV = new THREE.Vector3();
  e.pose = (dt) => {
    const t = game.time;
    anchor.rotation.set(0, 0, 0); anchor.scale.set(1, 1, 1);
    st.flyIn = Math.min(1, st.flyIn + dt * 0.35);
    const rise = 1 - Math.pow(1 - st.flyIn, 3);
    const pp = ctx.playerPos;
    sideV.set(fwd.z, 0, -fwd.x);
    // head target per phase
    const H = _v;
    if (e.phase === 0 || e.defeated && e.phase === 0) {
      H.copy(C0).addScaledVector(fwd, -27).setY(top + 10 + Math.sin(t * 0.7) * 0.8);
      if (st.atk === 'breath' || st.rods.active) H.y += 2;
      // after a claw slam / a parry / the rods stagger the head sags onto the rim: the melee window
      if (st.stagger > 0 || st.dip > 0) { H.copy(C0).addScaledVector(fwd, -22).setY(top + 4.2); }
    } else if (e.phase === 1) {
      H.copy(C0).setY(top + 22 + Math.sin(t * 0.5) * 1.2);
      if (st.tide.active) { H.copy(C0).addScaledVector(fwd, -8).setY(top + 4); }
    } else {
      H.copy(C0).addScaledVector(fwd, -10).setY(top + 3.5);   // crashed onto the plateau, the heart exposed in front
    }
    H.y -= (1 - rise) * 40;
    st.headPos.x = damp(st.headPos.x || H.x, H.x, 1.6, dt); st.headPos.y = damp(st.headPos.y || H.y, H.y, 1.6, dt); st.headPos.z = damp(st.headPos.z || H.z, H.z, 1.6, dt);
    // look at the player (clamped), lunge on the breath / roar
    st.headLook.set(pp.x - st.headPos.x, (pp.y + 1) - st.headPos.y, pp.z - st.headPos.z).normalize();
    const yaw = Math.atan2(st.headLook.x, st.headLook.z), pitch = -Math.asin(clamp(st.headLook.y, -0.9, 0.9));
    model.head.position.copy(st.headPos);
    model.head.rotation.set(pitch * 0.8 + (st.stagger > 0 ? 0.4 : 0), yaw, Math.sin(t * 0.6) * 0.05, 'YXZ');
    const jawOpen = st.atk === 'breath' ? clamp(st.atkT / 0.4, 0, 1) * 0.6 : st.rods.active ? 0.5 : st.tide.active ? 0.7 : 0.08 + Math.max(0, Math.sin(t * 0.9)) * 0.05;
    model.jawPivot.rotation.x = damp(model.jawPivot.rotation.x, jawOpen, 6, dt);
    model.mouthGlow.material.opacity = st.rods.active ? 0.9 : st.atk === 'breath' ? 0.7 : st.tide.active ? 0.8 : 0.1;
    if (st.rods.active) model.mouthGlow.material.color.setHex(0xe9d8ff); else model.mouthGlow.material.color.setHex(0xb14bff);
    model.lock.visible = e.phase === 0 && plate.lock.gauge > 0;
    model.lock.rotation.z += dt;
    // entity anchor + plate part at the head
    anchor.position.copy(st.headPos).setY(st.headPos.y - 3);
    plate.worldPos.copy(st.headPos).setY(st.headPos.y + 2.8);
    // spine control points (neck → tail) per phase
    _d.set(-Math.sin(yaw), 0, -Math.cos(yaw));   // behind the head
    ctrl[0].copy(st.headPos).addScaledVector(_d, 6).setY(st.headPos.y - 1.5);
    if (e.phase === 0) {
      const R = [37, 43, 47, 48, 46, 42, 40, 38];
      for (let k = 1; k < 9; k++) {
        const a = a0 + (k - 1) * 0.32 + Math.sin(t * 0.4 + k) * 0.03;
        ctrl[k].set(C0.x + Math.sin(a) * R[k - 1], top + [2, -5, -14, -24, -30, -34, -36, -38][k - 1], C0.z + Math.cos(a) * R[k - 1]);
      }
    } else if (e.phase === 1) {
      // the coil around the 5 root pillars (the active shard segment dips beside its pillar top)
      for (let k = 1; k < 9; k++) {
        const P = pillars[(k - 1) % 5];
        const act = st.shardIdx >= 0 && shards[st.shardIdx].pillar === P && k <= 5;
        _w.set(P.pos.x - C0.x, 0, P.pos.z - C0.z).normalize();
        const out = k <= 5 ? 3.5 : 10 + k;
        ctrl[k].set(P.pos.x + _w.x * out, (act ? P.top + 2.5 : P.top + 6 + Math.sin(t * 0.8 + k) * 0.8) - (k > 5 ? (k - 5) * 9 : 0), P.pos.z + _w.z * out);
      }
    } else {
      for (let k = 1; k < 9; k++) {
        const a = a0 + (k - 1) * 0.42;
        ctrl[k].set(C0.x + Math.sin(a) * (14 + k * 3.5), top + (k < 3 ? 1.5 : -(k - 2) * 7), C0.z + Math.cos(a) * (14 + k * 3.5));
      }
    }
    if (rise < 1) for (let k = 1; k < 9; k++) ctrl[k].y -= (1 - rise) * 40;
    layBody(model, curve, segPts, t);
    // shards ride the spine (segments 4, 8, 12, 16, 20) unless their window is open
    for (const s of shards) {
      if (st.shardIdx === s.i) {
        _w.set(C0.x - s.pillar.pos.x, 0, C0.z - s.pillar.pos.z).normalize();
        s.pos.set(s.pillar.pos.x + _w.x * 3.2, s.pillar.top + 1.8, s.pillar.pos.z + _w.z * 3.2);
      } else s.pos.copy(segPts[4 + s.i * 4]).setY(segPts[4 + s.i * 4].y + 5.5);
      const sc = s.broken ? 0.001 : 1 + (st.shardIdx === s.i ? Math.sin(t * 6) * 0.12 : 0);
      _m.compose(s.pos, _q.setFromAxisAngle(_w.set(0, 1, 0), t * 0.8 + s.i), _s.set(sc, sc, sc));
      model.shards.setMatrixAt(s.i, _m);
    }
    model.shards.instanceMatrix.needsUpdate = true;
    // heart: in the chest (segment 2), at ground level once it crashes down
    if (e.phase >= 2) heart.worldPos.copy(C0).addScaledVector(fwd, -3).setY(top + 1.8);
    else heart.worldPos.copy(segPts[2]).setY(segPts[2].y - 1.5);
    model.heart.position.copy(heart.worldPos);
    model.heart.rotation.y += dt * 0.6;
    model.heartHalo.material.opacity = e.phase >= 2 ? (st.heartOpen ? 0.85 : 0.3) : 0.12;
    // forelimbs: shoulders off the neck segments, claws planted on the plateau rim (or slamming)
    for (const L of model.limbs) {
      const sp = segPts[2];
      L.shoulder.copy(sp).addScaledVector(sideV, L.side * 6).setY(sp.y + 0.5);
      if (e.phase === 0 || e.phase === 2) {
        L.target.copy(C0).addScaledVector(fwd, e.phase === 2 ? -6 : -18).addScaledVector(sideV, L.side * 10).setY(top + 0.4);
        if (st.atk === 'claw' && st.clawL === L && L.slamAt) {
          const k = st.atkT;
          const lift = k < 1.0 ? Math.sin(Math.min(1, k / 0.9) * Math.PI * 0.5) * 7 : Math.max(0, 7 - (k - 1.0) * 60);
          L.target.lerp(L.slamAt, Math.min(1, k / 0.6)).setY(L.slamAt.y + 0.4 + lift);
        }
      } else {
        L.target.copy(L.shoulder).addScaledVector(fwd, 4).setY(L.shoulder.y - 8);
      }
      poseLimb(L, yaw);
    }
    // wings: void-mist ribbons at the shoulders, slow beats
    for (let k = 0; k < 2; k++) {
      const w = model.wings[k], side = k === 0 ? 1 : -1;
      w.position.copy(segPts[3]).addScaledVector(sideV, side * 2).setY(segPts[3].y + 2);
      w.rotation.set(0.2, yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2) * 0 + Math.PI, side * (0.35 + Math.sin(t * 1.1) * 0.25), 'YXZ');
    }
    // rods
    if (st.rods.active) {
      let n = 0;
      for (const r of rods) { const s = Math.min(1, st.rods.t * 1.5); _m.compose(r.object.position, _q.identity(), _s.set(1, s, 1)); model.rods.setMatrixAt(n++, _m); }
      model.rods.count = n; model.rods.instanceMatrix.needsUpdate = true;
    }
  };
  const baseClean = e.cleanupParts;
  e.cleanupParts = () => {
    baseClean();
    for (const r of rods) { try { game.combat.unregister(r); } catch (_) { /* */ } r.object.removeFromParent(); }
    try { offBlocked(); offBreak(); } catch (_) { /* */ }
    model.root.removeFromParent();
  };
  // bossSpawn payload: the full lock table (phase-1 plate rotation + the 5 shard oaths)
  e.locks.length = 0;
  for (const L of NIDHOGGRA_LOCKS.phase1) e.locks.push({ partId: 'headPlate', lock: L.element, counters: L.counters.slice(), phase: 1 });
  for (const s of shards) e.locks.push({ partId: s.part.partId, lock: s.L.element, counters: s.L.counters.slice(), phase: 2 });
  // ui part list: plate + 5 shards + heart (the plate bar is the lock gauge stand-in)
  e.partList.length = 0;
  for (const s of shards) e.partList.push({ id: s.part.partId, name: s.part.name });
  e.partList.push({ id: 'heart', name: D.ui.heart });
  e.st = st; e.shards = shards; e.heartPart = heart; e.plate = plate; e.rodsList = rods; e.lightRod = lightRod;
  return e;
}
createNidhoggra.prewarm = () => { if (!spare) spare = buildNidhoggra(); return spare.root; };
