// Enemies module (v3, CONTRACT §14/§15): camps (말랑이 / 뿔도깨비 / 도깨비 주술사), training dummies, zone encounters
// (수렁도마뱀, 포자 버섯병, 타락 늑대, 공허 망령, 공허 기사), zone scaling + XP, threat/taunt/stealth targeting, the boss registry
// (golem here; hydra/nox/treant/kalis/nidhoggra loaded dynamically from ./enemies/bosses/index.js), prewarmBoss, run stats.
import * as THREE from 'three';
import { rand, pick } from './core/utils.js';
import { Telegraphs } from './enemies/common.js';
import { updateEnemy, alert as alertEnemy, recoil as recoilEnemy, shapeHit } from './enemies/base.js';
import { createBokoblin } from './enemies/bokoblin.js';
import { createShaman } from './enemies/shaman.js';
import { createChuchu } from './enemies/chuchu.js';
import * as GolemMod from './enemies/golem.js';
import { createDummy } from './enemies/dummy.js';
import { createLizard } from './enemies/lizard.js';
import { createShroom } from './enemies/shroom.js';
import { createWolf } from './enemies/wolf.js';
import { createWraith } from './enemies/wraith.js';
import { createVoidKnight } from './enemies/voidknight.js';
import { EnemyProjectiles } from './enemies/projectiles.js';
import { Loot } from './enemies/loot.js';
import { buildGolem } from './enemies/models.js';
import * as MobModels from './enemies/mobs/index.js';
import * as Codex from './enemies/codex.js';
import { scaling as zoneScaling, applyScaling, difficultyOf, XP_VALUES } from './enemies/scaling.js';
import { createThreat } from './enemies/threat.js';
import { createEncounters } from './enemies/encounters.js';

const FACTORIES = {
  bokoblin: createBokoblin, shaman: createShaman, chuchu: createChuchu, golem: (c, p, o) => GolemMod.createGolem(c, p, o), dummy: createDummy,
  lizard: createLizard, shroom: createShroom, wolf: createWolf, wraith: createWraith, voidknight: createVoidKnight,
};
const CAMP_MIX = [
  { chuchu: 3, bokoblin: 2, shaman: 0 },
  { chuchu: 1, bokoblin: 2, shaman: 2 },
  { chuchu: 2, bokoblin: 3, shaman: 2 },
];
/** Golem data for the extended bossSpawn payload (all Korean text in data). */
const GOLEM_INFO = { title: '봉인의 수문장', sub: '고대 유적을 지키는 바위의 파수꾼', phases: [{ name: '각성' }, { at: 0.5, name: '붉은 핵' }] };

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _cone = { kind: 'cone', pos: { x: 0, z: 0 }, dir: { x: 0, z: 1 }, r: 2, angle: 1 };
const _circ = { kind: 'circle', pos: { x: 0, z: 0 }, r: 2 };
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
const warned = {};
const warnOnce = (k, ...a) => { if (warned[k]) return; warned[k] = true; console.warn('[enemies]', ...a); };

export function createEnemies(game) {
  const all = [];          // every live controller (incl. dying, dummies)
  const list = [];         // alive enemies (non-dummy first, then dummies) — rebuilt each frame
  const camps = [];        // {id, index, members:[], cleared}
  let boss = null, bossSpawnT = -1, phase = 'camps', kills = 0, playTime = 0, campsCleared = 0;
  const tokens = new Set();
  let rangedToken = null;
  const threat = createThreat(game, all);
  const run = { combo: 0, maxCombo: 0, comboT: 0, reactions: 0 };

  const ctx = {
    game, threat,
    playerPos: new THREE.Vector3(), playerCenter: new THREE.Vector3(), playerAlive: false,
    realPlayerPos: new THREE.Vector3(), realPlayerCenter: new THREE.Vector3(), realPlayerAlive: false,
    target: null,          // the current enemy's threat target (player entity or a taunt ally)
    telegraphs: null, projectiles: null, loot: null,
    cine: false, village: null, playerInVillage: false, v3Stars: false,
    /** Feet height (frozen water / spire tops count as ground). */
    groundH(x, z) { const w = game.world; return w.getGroundHeight ? w.getGroundHeight(x, z) : w.getHeight(x, z); },
    audio(name, opts) { try { game.audio?.play?.(name, opts); } catch (_) { /* optional */ } },
    /**
     * Per-enemy target resolution (CONTRACT §14): playerPos / playerCenter / target become the enemy's threat target
     * (taunt ally or the player). Called by base.js updateEnemy before think(); restored to the player after the loop.
     */
    retarget(e) {
      const T = threat.getThreatTarget(e);
      const pe = game.player?.entity;
      ctx.target = T || pe || null;
      e.target = ctx.target;
      if (!T || T === pe) {
        ctx.playerPos.copy(ctx.realPlayerPos); ctx.playerCenter.copy(ctx.realPlayerCenter); ctx.playerAlive = ctx.realPlayerAlive;
      } else {
        const tp = T.object?.position || T.position;
        ctx.playerPos.copy(tp);
        if (T.getCenter) T.getCenter(ctx.playerCenter); else ctx.playerCenter.copy(tp).setY(tp.y + (T.height || 1.4) * 0.5);
        ctx.playerAlive = true;
      }
    },
    restoreTarget() {
      ctx.playerPos.copy(ctx.realPlayerPos); ctx.playerCenter.copy(ctx.realPlayerCenter); ctx.playerAlive = ctx.realPlayerAlive;
      ctx.target = game.player?.entity || null;
    },
    /** Telegraph decal (vfx.telegraph, CONTRACT §20) with difficulty telegraphMul; fallback = the v2 ground ring. */
    tele(o) {
      // v4: difficulty.telegraphMul is a legacy alias fixed at 1 (tells applies assist.tellMul once) — never multiplied here
      try { const h = game.vfx?.telegraph?.(o); if (h) return h; } catch (err) { warnOnce('tele', 'telegraph failed', err?.message); }
      const col = typeof o.color === 'number' ? o.color : o.color === 'void' ? 0x9a5cff : 0xff3a22;
      const it = ctx.telegraphs.show(o.pos, o.r ?? (o.len ? o.len * 0.5 : 2), o.dur ?? 1, col);
      return { stop() { it.t = Math.max(it.t, it.dur); }, setPos() {}, setDir() {}, get alive() { return it.active; } };
    },
    /** ≤ 1 ranged cast at a time (§4.0). */
    takeRangedToken(e) {
      if (rangedToken === e) return true;
      if (rangedToken && rangedToken.alive && !rangedToken.dying && !rangedToken.removed) return false;
      rangedToken = e; return true;
    },
    releaseRangedToken(e) { if (rangedToken === e) rangedToken = null; },
    takeToken(e) {
      if (tokens.has(e)) return true;
      if (tokens.size >= 2) return false;
      tokens.add(e); e.token = true; return true;
    },
    releaseToken(e) { tokens.delete(e); e.token = false; if (rangedToken === e) rangedToken = null; },
    alertCamp(e) {
      for (const o of all) {
        if (o === e || o.aggro || o.dying || o.isDummy || o.isBoss) continue;
        if ((e.camp != null && o.camp === e.camp) || (e.pack != null && o.pack === e.pack) || o.object.position.distanceTo(e.object.position) < 14) {
          o._alertDelay = rand(0.15, 0.6);
        }
      }
    },
    /** True if the target is in front of e within range (half-angle in radians) and vertically close. */
    // v4 hitbox = decal (§4.0): one shared hit test (tells.hitTest, pad 0.15); the v3 +radius and d < 1 m shortcut are gone
    meleeCheck(e, range, halfAngle) {
      const pe = ctx.target || game.player?.entity; if (!pe || pe.alive === false) return false;
      const p = e.object.position, pp = ctx.playerPos;
      if (Math.abs(pp.y - p.y) > 2.2 + e.height * 0.3) return false;
      _cone.pos.x = p.x; _cone.pos.z = p.z; _cone.dir.x = Math.sin(e.facing); _cone.dir.z = Math.cos(e.facing); _cone.r = range; _cone.angle = halfAngle;
      return shapeHit(ctx, _cone, pp);
    },
    hitPlayer(e, h) {
      if (e?.noDamage) return null;
      const pe = ctx.target || game.player?.entity; if (!pe || pe.alive === false) return null;
      // spirit decoys / water clones without HP absorb one hit
      if (pe.isDecoy || typeof pe.hp !== 'number') { try { pe.onDecoyHit?.(e); } catch (_) { /* */ } pe.alive = false; return { damage: 0, absorbed: true }; }
      _v.subVectors(ctx.playerPos, e.object.position).setY(0);
      if (_v.lengthSq() < 1e-6) _v.set(Math.sin(e.facing), 0, Math.cos(e.facing)); _v.normalize();
      const r = game.combat.dealDamage(pe, {
        amount: h.amount, element: h.element || 'physical', source: e, point: ctx.playerCenter.clone(),
        direction: _v.clone(), knockback: h.knockback ?? 6, launch: h.launch ?? 0, status: h.status || undefined, heavy: h.amount >= 20,
        attack: h.attack || undefined, sourceName: e.name,
      });
      // the blow bounced off the player's guard → attacker recoils (parries are handled by onParried)
      if (r?.blocked && !r.parried && game.player?.blocking) recoilEnemy(ctx, e, pe);
      return r;
    },
    /** Area slam damaging the player (and a taunt target inside the area). */
    slam(center, radius, h, source, fx = 1) {
      const vfx = game.vfx;
      _v2.copy(center); _v2.y = ctx.groundH(center.x, center.z) + 0.15;
      _circ.pos.x = center.x; _circ.pos.z = center.z; _circ.r = radius;
      const shape = h.shape || _circ, handle = h.handle && h.handle.contains ? h.handle : null;
      vfx.shockwave(_v2, { owner: 'enemy', color: h.element === 'void' ? 0xb36bff : 0xf0d6a0, radius: radius * 1.15, duration: 0.45, opacity: 0.85, thickness: 0.35 });
      vfx.burst(_v2, { owner: 'enemy', count: Math.round(18 * fx), color: [0xd9c094, 0x9a8460], speed: 5 * fx, spread: 0.35, dir: _v.set(0, 1, 0), size: 0.8 * fx, sizeEnd: 1.8 * fx, life: 0.9, shape: 'smoke', additive: false, drag: 2.2, ground: true });
      vfx.debris?.(_v2, { owner: 'enemy', count: Math.round(6 * fx), size: 0.3 * fx, speed: 6, material: 'rock' });
      vfx.groundDecal?.('crack', _v2, radius * 0.8, 6);
      vfx.shake(0.25 * fx);
      ctx.audio('land', { position: _v2, volume: 0.8, pitch: 0.6 });
      const hitOne = (ent, pp) => {
        if (!ent || ent.alive === false) return;
        if (!(handle ? handle.contains(pp) : shapeHit(ctx, shape, pp))) return;
        if (h.jumpAvoid && pp.y - ctx.groundH(pp.x, pp.z) > 0.6) return;
        if (ent.isDecoy || typeof ent.hp !== 'number') { ent.alive = false; return; }
        _v.set(pp.x - center.x, 0, pp.z - center.z); if (_v.lengthSq() < 1e-4) _v.set(0, 0, 1); _v.normalize();
        game.combat.dealDamage(ent, { amount: h.amount, element: h.element || 'physical', source, point: pp.clone().setY(pp.y + 1), direction: _v.clone(),
          knockback: h.knockback ?? 8, launch: h.launch ?? 4, heavy: true, status: h.status || undefined, attack: h.attack || undefined, sourceName: source?.name });
      };
      if (source?.noDamage) return;
      const pe = game.player?.entity;
      if (pe) hitOne(pe, ctx.realPlayerPos);
      const T = threat.tauntTarget;
      if (T && T !== pe && T.object) hitOne(T, T.object.position);
    },
    dust(pos, s = 1) {
      _v2.copy(pos); _v2.y += 0.1;
      game.vfx.burst(_v2, { owner: 'enemy', count: Math.round(8 * s) + 2, color: [0xd9c4a0, 0xb09a78], speed: 2.2 * s, spread: 0.4, dir: _v.set(0, 1, 0), size: 0.4 * s, sizeEnd: 1.0 * s, life: 0.6, shape: 'smoke', additive: false, drag: 2.5 });
    },
    dissolveFx(e, s = 1) {
      const c = e.getCenter(_v2);
      const vfx = game.vfx;
      vfx.burst(c, { owner: 'enemy', count: Math.round(30 * s), color: [0x5a2a7a, 0x24103a], speed: 2.2 * s, speedVar: 1.2, spread: 1, size: 0.7 * s, sizeEnd: 1.6 * s, life: 1.1, shape: 'smoke', additive: false, drag: 2, gravity: -1.5 });
      vfx.burst(c, { owner: 'enemy', count: Math.round(26 * s), color: [0xd9a0ff, 0xf3ecdf], speed: 3.5 * s, spread: 1, size: 0.13, sizeEnd: 0, life: 1.0, lifeVar: 0.4, shape: 'spark', drag: 1.5, gravity: -2.5 });
      vfx.burst(c, { owner: 'enemy', count: Math.round(12 * s), color: [0xff8ad8, 0xb07aff], speed: 1.2, spread: 1, size: 0.25, sizeEnd: 0, life: 1.4, shape: 'ember', gravity: -2 });
      vfx.flash?.(c, { owner: 'enemy', color: 0xb07aff, intensity: 4 * s, distance: 8 * s, duration: 0.4 });
      ctx.audio('enemy_death', { position: c, volume: 0.5, pitch: 1.3 });
    },
    onEnemyDied(e) { onDied(e); },
    remove(e) { removeEnemy(e); },
    spawn(type, pos, opts) { return spawn(type, pos, opts); },
    spawnSummon(type, pos, opts = {}) {
      pos.y = ctx.groundH(pos.x, pos.z);
      const e = spawn(type, pos, { ...opts, camp: null });
      if (!e) return null;
      e.summoned = true;
      if (!opts.noLeap) { e.velocity.y = 7; e.grounded = false; }
      game.vfx.debris?.(pos, { owner: 'enemy', count: 8, size: 0.3, speed: 6, material: 'rock' });
      ctx.dust(pos, 1.2);
      alertEnemy(ctx, e);
      return e;
    },
    /** Add a ready-made entity (bosses) to the scene / combat / update list. */
    adopt(e) {
      if (!e.object.parent) game.scene.add(e.object);
      game.combat.register(e);
      if (!all.includes(e)) all.push(e);
      return e;
    },
    onBossDefeated(e) { if (e === boss) phase = 'done'; },
  };

  function spawn(type, pos, opts = {}) {
    const f = FACTORIES[type];
    if (!f) { warnOnce('type:' + type, 'unknown enemy type', type); return null; }
    const p = pos.clone();
    if (opts.snap !== false) p.y = ctx.groundH(p.x, p.z);
    // v3: opts.element picks the 말랑이 variant; opts.elite marks elites
    if (type === 'chuchu' && !opts.variant && opts.element && Codex.CHU_NAMES[opts.element]) opts = { ...opts, variant: opts.element };
    const e = f(ctx, p, opts);
    if (opts.elite) e.isElite = true;
    if (opts.bench) { e.bench = true; e.xpValue = 0; e.noLoot = true; e.noDamage = true; }
    applyScaling(game, e, type, opts);
    if (opts.bench) e.xpValue = 0;
    game.scene.add(e.object);
    // §2.5: compile + draw every new material once on the first spawn of each type (no first-use hitch)
    const wk = type + ':' + (opts.variant || opts.element || '');
    if (!warmed.has(wk)) { warmed.add(wk); try { game.render?.warm?.(e.object); } catch (_) { /* */ } }
    game.combat.register(e);
    all.push(e);
    if (opts.camp != null && camps[opts.camp]) camps[opts.camp].members.push(e);
    return e;
  }

  /** Per-instance THREE.Skeleton bone textures (one float DataTexture each) are not freed by removeFromParent:
   *  dispose each unique skeleton (geometries / materials are shared caches and stay). */
  const _skels = new Set();
  const warmed = new Set();
  function disposeSkeletons(root) {
    if (!root?.traverse) return;
    _skels.clear();
    root.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) _skels.add(o.skeleton); });
    for (const sk of _skels) { try { sk.dispose(); } catch (_) { /* */ } }
    _skels.clear();
  }
  function removeEnemy(e) {
    if (e.removed) return;
    e.removed = true;
    e.object.removeFromParent();
    disposeSkeletons(e.object);
    game.combat.unregister(e);
    ctx.releaseToken(e);
    if (e.isBoss && !e._partsCleaned) { e._partsCleaned = true; try { e.cleanupParts?.(); } catch (_) { /* */ } }
    const i = all.indexOf(e); if (i >= 0) all.splice(i, 1);
    if (e === boss) { if (e.bossId === 'nidhoggra' || e.bossId === 'nox' || e.bossId === 'treant') { try { game.world?.setBossFightLOD?.(false); } catch (_) { /* */ } } boss = null; }
  }

  function onDied(e) {
    if (e.isDummy || e.bench) return;
    kills++;
    if (e.camp != null) {
      const c = camps[e.camp];
      if (c && !c.cleared && c.members.every((m) => !m.alive)) {
        c.cleared = true; campsCleared++;
        const pos = c.fire || c.position;
        game.events.emit('campCleared', { campId: c.id, index: c.index, total: camps.length });
        celebrate(pos);
        if (campsCleared >= camps.length && !boss && bossSpawnT < 0) bossSpawnT = 3;
      }
    }
    // the golem (v2 boss path; v3 bosses defeat through bossbase). No victory here any more (story emits it after the finale).
    if (e.isBoss && e.kind === 'golem') {
      phase = 'done';
      game.events.emit('bossDefeated', { boss: e, id: 'golem', name: e.name, final: false });
      try { game.timeScale?.set?.('bossDeath', 0.25, 1.2); } catch (_) { /* */ }
      game.world.setArenaGlow?.(0.3);
      for (const o of all) if (o !== e && o.alive && !o.isDummy) game.combat.dealDamage(o, { amount: 9999, element: 'physical', source: 'player', noReaction: true });
    }
  }

  function celebrate(pos) {
    const vfx = game.vfx;
    _v.copy(pos); _v.y += 1.5;
    vfx.burst(_v, { owner: 'world', count: 70, color: [0xffe27a, 0xf3ecdf], speed: 9, spread: 0.5, dir: _v2.set(0, 1, 0), size: 0.2, sizeEnd: 0, life: 1.6, shape: 'spark', gravity: 6, drag: 1 });
    vfx.burst(_v, { owner: 'world', count: 40, color: [0x8fffc1, 0x7fe3ff], speed: 6, spread: 1, size: 0.25, sizeEnd: 0, life: 1.8, shape: 'ember', gravity: -1 });
    vfx.shockwave(_v2.set(pos.x, pos.y + 0.2, pos.z), { owner: 'world', color: 0xffe27a, radius: 14, duration: 1.0, opacity: 0.7 });
    vfx.flash?.(_v, { owner: 'world', color: 0xffe27a, intensity: 8, distance: 25, duration: 0.8 });
    ctx.audio('reaction', { position: pos, volume: 0.9, pitch: 1.2 });
  }

  // ------------------------------------------------------------------ bosses: registry, prewarm, spawn
  const registry = new Map();      // id → factory (ctx, arena, opts) → entity; factory.prewarm?(ctx, arena) → Object3D|[]
  const prewarmed = new Map();     // id → Promise
  let prebuiltGolem = null;
  let bossesLoaded = null;         // Promise of the dynamic bosses import
  const NO_GIFT = Object.freeze({ ready: false, charges: 0, element: null, purpose: null, use() { return false; } });
  const bosses = {
    register(id, factory) { if (id && typeof factory === 'function') registry.set(id, factory); },
    get(id) { return registry.get(id) || null; },
    has(id) { return registry.has(id); },
    list() { return [...registry.keys()]; },
    /** V, 정령의 선물 (finale only, CONTRACT §15). */
    get gift() { return (boss && boss.alive !== false && !boss.defeated && boss.gift) || NO_GIFT; },
  };
  const golemFactory = (c, arena, opts = {}) => {
    const A = arena || game.world.bossArena;
    const pos = (A?.position || new THREE.Vector3(0, 0, -120)).clone();
    const pp = ctx.realPlayerPos;
    const facing = opts.facing ?? Math.atan2(pp.x - pos.x, pp.z - pos.z);
    const e = spawn('golem', pos, { facing, model: prebuiltGolem, zoneId: 'ruins', xpValue: XP_VALUES.golem });
    prebuiltGolem = null;
    e.bossId = 'golem'; e.title = GOLEM_INFO.title; e.sub = GOLEM_INFO.sub; e.phases = GOLEM_INFO.phases; e.music = 'boss';
    e.debugDefeat = () => { e.invulnerable = false; game.combat.dealDamage(e, { amount: e.hp + 1, fixed: true, source: 'player', noReaction: true, ignoreShield: true, noCrit: true }); return true; };
    e.debugPhase = (n) => { if (n >= 2 && e.hp > e.maxHp * 0.5) { e.invulnerable = false; e.hp = Math.floor(e.maxHp * 0.5); e.react?.({ damage: 1 }, {}); } return n; };
    e.spawnPayload = () => ({ boss: e, id: 'golem', name: e.name, title: e.title, sub: e.sub, phases: e.phases.slice(1), parts: [], locks: [] });
    return e;
  };
  golemFactory.adopted = true;
  registry.set('golem', golemFactory);

  function bossArena(id) { return game.world?.bossArenas?.[id] || (id === 'golem' ? game.world?.bossArena : null) || null; }
  function buildForWarm(id) {
    const f = registry.get(id);
    if (id === 'golem') { if (!prebuiltGolem) prebuiltGolem = buildGolem(); return prebuiltGolem.root; }
    return f?.prewarm?.(ctx, bossArena(id)) || null;
  }
  function stage(objs) {
    const tmp = [];
    for (const o of (objs ? [].concat(objs) : [])) {
      if (!o || o.parent) continue;
      o.position.set(0, -500, 0); game.scene.add(o); o.updateMatrixWorld(true); tmp.push(o);
    }
    return tmp;
  }
  function unstage(tmp) { for (const o of tmp) { game.scene.remove(o); o.position.set(0, 0, 0); } }

  /** Build the model once and compile its programs (CONTRACT §15). Idempotent; resolves true when compiled. */
  function prewarmBoss(id) {
    if (!id) return Promise.resolve(false);
    if (prewarmed.has(id)) return prewarmed.get(id);
    const job = (async () => {
      if (!registry.has(id) && bossesLoaded) { try { await bossesLoaded; } catch (_) { /* */ } }
      if (!registry.has(id)) { prewarmed.delete(id); return false; }
      let tmp = [];
      try { tmp = stage(buildForWarm(id)); } catch (err) { console.error('[enemies] prewarm build', id, err); return false; }
      try {
        const R = game.renderer;
        if (R?.compileAsync && !game.isTest) await R.compileAsync(game.scene, game.camera);
        else R?.compile?.(game.scene, game.camera);
      } catch (err) { console.warn('[enemies] prewarm compile', id, err?.message); }
      finally { unstage(tmp); }
      return true;
    })();
    prewarmed.set(id, job);
    return job;
  }
  /** Synchronous variant (test mode / init): build + renderer.compile now. */
  function prewarmBossSync(id) {
    if (prewarmed.has(id)) return true;
    if (!registry.has(id)) return false;
    let tmp = [];
    try { tmp = stage(buildForWarm(id)); } catch (err) { console.error('[enemies] prewarm build', id, err); }
    try { game.renderer?.compile?.(game.scene, game.camera); } catch (err) { console.warn('[enemies] prewarm compile', id, err?.message); }
    unstage(tmp);
    prewarmed.set(id, Promise.resolve(true));
    return true;
  }

  function spawnBossNow(id, opts = {}) {
    const f = registry.get(id);
    if (!f) { warnOnce('noboss:' + id, 'boss not registered', id); return null; }
    if (boss && boss.alive !== false && !boss.defeated) {
      if (boss.bossId === id) return boss;
      despawnBoss();
    }
    let e = null;
    try { e = f(ctx, bossArena(id), opts); } catch (err) { console.error('[enemies] boss factory', id, err); return null; }
    if (!e) return null;
    if (!f.adopted) ctx.adopt(e);
    boss = e;
    phase = 'boss';
    if (id === 'golem') { for (const c of camps) c.cleared = true; campsCleared = camps.length; bossSpawnT = -1; game.world.setArenaGlow?.(0.55); }
    if (id === 'nidhoggra' || id === 'nox' || id === 'treant') { try { game.world?.setBossFightLOD?.(true); } catch (_) { /* */ } }
    game.events.emit('bossSpawn', e.spawnPayload ? e.spawnPayload() : { boss: e, id, name: e.name });
    game.vfx.shake?.(0.35);
    return e;
  }
  /**
   * spawnBoss(id = 'golem', opts): prewarms first (behind a fade when not prewarmed yet), then spawns in world.bossArenas[id].
   * Returns the entity when it can spawn at once (prewarmed, or test mode) — otherwise a Promise of the entity.
   */
  function spawnBoss(id = 'golem', opts = {}) {
    if (registry.has(id) && (prewarmed.has(id) || game.isTest)) {
      if (!prewarmed.has(id)) prewarmBossSync(id);
      return spawnBossNow(id, opts);
    }
    const ov = game.cinematic?.overlay;
    try { ov?.fade?.(1, 0.25); } catch (_) { /* */ }
    return (async () => {
      if (!registry.has(id) && bossesLoaded) { try { await bossesLoaded; } catch (_) { /* */ } }
      if (game.isTest && registry.has(id)) prewarmBossSync(id); else await prewarmBoss(id);
      const e = spawnBossNow(id, opts);
      try { ov?.fade?.(0, 0.5); } catch (_) { /* */ }
      return e;
    })();
  }
  function despawnBoss() {
    const b = boss; if (!b) return;
    removeEnemy(b);
    boss = null;
  }

  // ------------------------------------------------------------------ camps (Act 1)
  function populate() {
    const W = game.world;
    (W.camps || []).forEach((c, i) => {
      const camp = { id: c.id || 'camp' + i, index: i, members: [], cleared: false, position: c.position, fire: c.fire || c.position };
      camps.push(camp);
      const mix = CAMP_MIX[i] || CAMP_MIX[CAMP_MIX.length - 1];
      const fire = camp.fire, R = c.radius || 12;
      const nb = mix.bokoblin;
      for (let j = 0; j < nb; j++) {
        const sit = j < Math.min(2, nb - (i > 0 ? 1 : 0));
        const a = (j / nb) * Math.PI * 2 + i;
        const r = sit ? 2.6 : rand(5, R * 0.55);
        _v.set(fire.x + Math.sin(a) * r, 0, fire.z + Math.cos(a) * r);
        const facing = sit ? Math.atan2(fire.x - _v.x, fire.z - _v.z) : a;
        spawn('bokoblin', _v, { camp: i, sit, facing });
      }
      const tents = c.tents || [];
      for (let j = 0; j < mix.shaman; j++) {
        const t = tents[j % Math.max(1, tents.length)];
        if (t) _v.set(t.x + rand(-1.5, 1.5), 0, t.z + rand(-1.5, 1.5)).lerp(fire, 0.35);
        else { const a = rand(0, 6.28); _v.set(fire.x + Math.sin(a) * 6, 0, fire.z + Math.cos(a) * 6); }
        spawn('shaman', _v, { camp: i, element: j % 2 ? 'ice' : 'fire', facing: Math.atan2(fire.x - _v.x, fire.z - _v.z) });
      }
      for (let j = 0; j < mix.chuchu; j++) {
        const a = rand(0, 6.28), r = rand(4, R * 0.7);
        _v.set(fire.x + Math.sin(a) * r, 0, fire.z + Math.cos(a) * r);
        const variant = (i === 0 && j === 0) ? 'normal' : Math.random() < 0.45 ? pick(['fire', 'ice', 'lightning']) : 'normal';
        spawn('chuchu', _v, { camp: i, variant });
      }
    });
    // training dummies
    const T = W.trainingArea;
    if (T) {
      const spawnP = W.playerSpawn || new THREE.Vector3(T.x, T.y, T.z + 20);
      const face = Math.atan2(spawnP.x - T.x, spawnP.z - T.z);
      for (let j = -1; j <= 1; j++) {
        const a = face + Math.PI / 2;
        _v.set(T.x + Math.sin(a) * j * 4.5, 0, T.z + Math.cos(a) * j * 4.5 - Math.cos(face) * Math.abs(j) * 1.5);
        spawn('dummy', _v, { facing: face });
      }
    }
  }

  // ------------------------------------------------------------------ zone encounters (lazy, ≤ 18 alive)
  const aliveCount = () => { let n = 0; for (const e of all) if (e.alive && !e.isDummy && !e.isBoss) n++; return n; };
  const encounters = createEncounters(ctx, {
    spawn: (type, x, z, opts) => spawn(type, _v.set(x, 0, z), opts),
    remove: (e) => removeEnemy(e),
    aliveCount,
  });

  // ------------------------------------------------------------------ separation between enemies
  function separate() {
    for (let i = 0; i < all.length; i++) {
      const a = all[i]; if (a.dying || a.isDummy) continue;
      const pa = a.object.position;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j]; if (b.dying) continue;
        const pb = b.object.position;
        const dx = pb.x - pa.x, dz = pb.z - pa.z, rr = a.radius + b.radius;
        if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), push = (rr - d) / d;
        const ma = a.isBoss ? 1e6 : (a.mass || 1), mb = b.isDummy || b.isBoss ? 1e6 : (b.mass || 1), wa = mb / (ma + mb), wb = ma / (ma + mb);
        pa.x -= dx * push * wa; pa.z -= dz * push * wa;
        pb.x += dx * push * wb; pb.z += dz * push * wb;
      }
    }
  }

  // ------------------------------------------------------------------ run stats (victory payload)
  function onDamage(p) {
    if (!p || p.isPlayer || p.isProp || p.dot) return;
    const src = p.source;
    const fromPlayer = src === 'player' || src === game.player?.entity || src?.team === 'player';
    if (!fromPlayer) return;
    if (run.comboT > 0) run.combo++; else run.combo = 1;
    run.comboT = 2.5;
    if (run.combo > run.maxCombo) run.maxCombo = run.combo;
  }

  // ------------------------------------------------------------------ v4: codex, encounters, previews, bench (§7.4.5)
  const codexMap = {};
  for (const k in Codex.CODEX) codexMap[k] = Codex.CODEX[k];
  const previews = new Map();
  let seenSave = {};                          // save section 'encounters': type → true (first sight / aggro ever)
  const seenSession = {}, aggroSession = {};
  try { game.save?.section?.('encounters', { serialize: () => ({ seen: { ...seenSave } }), load: (d) => { seenSave = d && d.seen && typeof d.seen === 'object' ? { ...d.seen } : {}; } }); }
  catch (err) { warnOnce('save', 'save.section unavailable', err?.message); }
  const codexKey = (e) => e.codexKey || e.bossId || e.kind;
  function noteEncounter(type, { sight = true } = {}) {
    const first = !seenSave[type];
    seenSave[type] = true;
    return { first };
  }
  function encounter(e, sight) {
    const type = codexKey(e);
    const book = sight ? seenSession : aggroSession;
    if (book[type]) return;
    book[type] = true;
    const { first } = noteEncounter(type, { sight });
    game.events.emit('enemyEncounter', { type, enemy: e, first, sight });
  }
  let sightT = 0;
  function scanSight(dt) {
    sightT -= dt; if (sightT > 0) return;
    sightT = 0.25;
    const cam = game.camera; if (!cam) return;
    let frustumReady = false;
    const pp = ctx.realPlayerPos;
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (!e.alive || e.dying || e.isDummy || e.bench || e.isBoss) continue;
      const type = codexKey(e);
      if (!seenSession[type]) {
        const p = e.object.position, dx = p.x - pp.x, dz = p.z - pp.z;
        if (dx * dx + dz * dz <= 900) {
          if (!frustumReady) { cam.updateMatrixWorld(); _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _frustum.setFromProjectionMatrix(_pm); frustumReady = true; }
          _sph.center.set(p.x, p.y + e.height * 0.5, p.z); _sph.radius = Math.max(0.5, e.radius);
          if (_frustum.intersectsSphere(_sph)) encounter(e, true);
        }
      }
      if (e.aggro && !aggroSession[type]) encounter(e, false);
    }
  }
  let lastET = null;

  const api = {
    list, all, FACTORIES, bosses, encounters,
    substeps: true,
    /** Test / debug access to the projectile pools (orbs, spores, clouds). */
    get projectiles() { return ctx.projectiles; },
    // ---- v4 (§7.4.5)
    registerCodex(entries) { for (const c of [].concat(entries || [])) if (c && c.type) codexMap[c.type] = c; },
    codex() { return codexMap; },
    noteEncounter,
    /** Test hook: forget every encounter (session + save section). */
    debugResetEncounters() { seenSave = {}; for (const k in seenSession) delete seenSession[k]; for (const k in aggroSession) delete aggroSession[k]; },
    aggroCount() { let n = 0; for (const e of all) if (e.alive && !e.dying && e.aggro && !e.isDummy && !e.bench) n++; return n; },
    orbCount() { return ctx.projectiles?.orbCount?.() ?? 0; },
    orbEta(pos) { return ctx.projectiles?.orbEta?.(pos) ?? Infinity; },
    previewModel(type, opts = {}) {
      const f = previews.get(type);
      if (f) { try { return f(opts) || null; } catch (err) { warnOnce('pv:' + type, 'preview failed', type, err?.message); return null; } }
      try { return MobModels.preview?.(type, opts) || null; } catch (err) { warnOnce('pv:' + type, 'preview failed', type, err?.message); return null; }
    },
    registerPreview(type, fn) { if (type && typeof fn === 'function') previews.set(type, fn); },
    /** Benchmark mobs (§2.8): never deal damage, drop loot, give XP or count for quests. */
    spawnBench(n = 8) {
      const ROSTER = ['bokoblin', 'wolf', 'lizard', 'shaman', 'voidknight', 'shroom', 'wraith', 'chuchu', 'bokoblin', 'wolf', 'chuchu', 'chuchu'];
      const out = [], pp = ctx.realPlayerPos;
      const yaw = game.player?.yaw ?? 0;
      for (let i = 0; i < n; i++) {
        const a = yaw + Math.PI + (i / Math.max(1, n - 1) - 0.5) * 1.6, r = 6 + (i % 3) * 2.5;
        _v.set(pp.x + Math.sin(a) * r, 0, pp.z + Math.cos(a) * r);
        const e = spawn(ROSTER[i % ROSTER.length], _v, { bench: true, variant: i % 3 === 1 ? 'fire' : undefined });
        if (e) { e.aggro = true; e.setState(e.chaseState || 'chase'); out.push(e); }
      }
      return out;
    },
    despawnBench(listB) { for (const e of [].concat(listB || [])) if (e) removeEnemy(e); },
    get boss() { return boss && (boss.alive !== false || boss.dying) ? boss : null; },
    get kills() { return kills; },
    get inCombat() {
      for (const e of all) if (e.alive && e.aggro && !e.isDummy && e.distP < 30) return true;
      return false;
    },
    /** Objective (CONTRACT §14): {phase, zoneId, campsCleared, campsTotal, boss, groupsLeft} (+ v2 camps list). */
    getObjective() {
      const zoneId = encounters.current || null;
      const b = boss && boss.alive && !boss.defeated ? boss : null;
      let ph = b ? 'boss' : phase;
      const groupsLeft = zoneId ? encounters.groupsLeft(zoneId) : 0;
      if (!b && zoneId && encounters.groupsTotal(zoneId) && phase !== 'camps') ph = groupsLeft ? 'zone' : 'done';
      return { phase: ph, zoneId, campsCleared, campsTotal: camps.length, boss: b, groupsLeft,
        camps: camps.map((c) => ({ id: c.id, cleared: c.cleared, alive: c.members.filter((m) => m.alive).length, position: c.position })) };
    },
    /** DESIGN §5.3 zone row × difficulty: {hpMul, dmgMul, level, zoneMin, row}. */
    scaling(zoneId) { return zoneScaling(game, zoneId); },
    /** Debug / tests: spawn(type, pos, opts:{zoneId, level, element, elite, variant, …}). */
    spawn(type, pos, opts) { return spawn(type, pos, opts); },
    remove(e) { removeEnemy(e); },
    // ---- threat (CONTRACT §14)
    setTauntTarget: (ent, dur, range) => threat.setTauntTarget(ent, dur, range),
    /** Reflect enemy orbs inside a cone (wind.gust reflect:true). */
    reflectProjectiles(origin, dir, len = 8, angDeg = 70) { try { return ctx.projectiles?.reflectCone?.(origin, dir, len, angDeg) || 0; } catch (_) { return 0; } },
    /** Per-enemy sight loss (shadow raven swarm): sight radius × mul for dur seconds; an aggroed enemy with mul ≈ 0 loses track. */
    setSightMul(e, mul, dur = 3) {
      if (!e) return;
      e.sightMul = Math.max(0, +mul || 0); e.sightMulUntil = (game.time || 0) + (+dur || 3);
      if (e.sightMul <= 0.05 && e.aggro && !e.isBoss) { e.aggro = false; e.giveUpT = Math.min(+dur || 3, 3); }
    },
    clearTauntTarget: () => threat.clearTauntTarget(),
    getThreatTarget: (e) => threat.getThreatTarget(e),
    setPlayerStealth: (mul, dur) => threat.setPlayerStealth(mul, dur),
    anyAggroWithin: (pos, r) => threat.anyAggroWithin(pos, r),
    getRunStats() {
      return { kills, time: Math.round(playTime), timeSec: Math.round(playTime), maxCombo: run.maxCombo, reactions: run.reactions,
        reactionsFound: game.combat?.discovered?.size ?? 0 };
    },
    // ---- bosses (CONTRACT §14/§15)
    prewarmBoss, spawnBoss, despawnBoss,
    isPrewarmed: (id) => prewarmed.has(id),
    debugDefeat(id) {
      const b = boss && !boss.defeated ? boss : null;
      if (!b || (id && b.bossId !== id)) return false;
      return b.debugDefeat ? b.debugDefeat() : !!game.combat.dealDamage(b, { amount: b.hp + 1, fixed: true, source: 'player', noReaction: true, ignoreShield: true });
    },
    debugPhase(n) { return boss?.debugPhase?.(n) ?? false; },
    get bossesReady() { return bossesLoaded; },
    /**
     * Training: make the nearest dummy perform ONE slow, telegraphed practice attack (2 damage) on targetEntity
     * so a block / parry can be practiced. Returns {kind:'swing'|'orb', eta, source} or null (no dummy / busy).
     */
    practiceAttack(targetEntity = game.player?.entity) {
      if (!targetEntity?.object) return null;
      const tp = targetEntity.object.position;
      let best = null, bd = Infinity;
      for (const e of all) {
        if (!e.isDummy || !e.alive || !e.practice) continue;
        const d = e.object.position.distanceToSquared(tp);
        if (d < bd) { bd = d; best = e; }
      }
      return best ? best.practice(targetEntity) : null;
    },
    spawnPracticeAttack(targetEntity) { return api.practiceAttack(targetEntity); },
    serialize() { return { encounters: encounters.serialize() }; },
    deserialize(o) { if (o?.encounters) encounters.deserialize(o.encounters); },

    /** Hidden instances of every regular-enemy model so their programs compile at boot (main.js prewarm). */
    prewarm() {
      // v4: the mobmodels registry warms every mob material (and builds the types in idle time); golem via GolemMod
      const out = [];
      try { const mats = MobModels.prewarm?.(game); if (Array.isArray(mats) && MobModels.warmObject) out.push(MobModels.warmObject()); } catch (err) { console.warn('[enemies] prewarm', err?.message || err); }
      try { const g = GolemMod.prewarmGolem?.(game); if (g?.isObject3D) out.push(g); } catch (err) { console.warn('[enemies] prewarmGolem', err?.message || err); }
      for (const o of out) if (!o.parent) o.position.set(0, -500, 0);
      return out;
    },

    init() {
      ctx.telegraphs = new Telegraphs(game.scene, 10);
      ctx.projectiles = new EnemyProjectiles(ctx);
      ctx.loot = new Loot(ctx);
      ctx.v3Stars = !!game.combat?.STATUS_DEFS;
      populate();
      // prebuild the golem + compile its shader programs now, so the boss reveal doesn't hitch
      try { prewarmBossSync('golem'); } catch (err) { console.warn('[enemies] golem warmup', err); prebuiltGolem = null; }
      // v3 bosses live in their own folder, loaded dynamically: a broken/missing boss file never breaks this module
      bossesLoaded = import('./enemies/bosses/index.js')
        .then((m) => { m.registerBosses?.(api); return true; })
        .catch((err) => { warnOnce('bosses', 'bosses unavailable:', err?.message || err); return false; });
      const ev = game.events;
      ev.on('playerDeath', () => {
        for (const e of all) { if (e.aggro && !e.isBoss) { e.aggro = false; ctx.releaseToken(e); e.setState('return'); } }
        try { boss?.respawnPhase?.(); } catch (err) { console.error('[enemies] respawnPhase', err); }
      });
      ev.on('damage', onDamage);
      ev.on('playerHurt', () => { run.combo = 0; run.comboT = 0; });
      ev.on('reaction', () => { run.reactions++; });
      ev.on('stateChange', (p) => { if (p?.state === 'title') threat.reset(); });
    },

    update(dtIn, realDt) {
      // enemy logic runs on game.enemyTime deltas (assist.enemySpeed; frozen during a global hitstop)
      const et = game.enemyTime;
      let dt = dtIn;
      if (typeof et === 'number') { if (lastET !== null) { const d = et - lastET; dt = d >= 0 && d < 0.25 ? d : dtIn; } lastET = et; }
      ctx.visualStep = game.frame ? game.frame.lastStep !== false : true;
      playTime += realDt;
      const pe = game.player?.entity;
      if (pe) {
        ctx.realPlayerPos.copy(pe.object.position);
        if (pe.getCenter) pe.getCenter(ctx.realPlayerCenter); else ctx.realPlayerCenter.copy(ctx.realPlayerPos).setY(ctx.realPlayerPos.y + (pe.height || 1.8) * 0.5);
        ctx.realPlayerAlive = pe.alive !== false;
      }
      ctx.restoreTarget();
      if (run.comboT > 0) { run.comboT -= realDt; if (run.comboT <= 0) run.combo = 0; }
      threat.update(dt);
      ctx.cine = !!game.cinematic?.active;
      const V = ctx.village = game.world.village?.center ? game.world.village : null;
      ctx.playerInVillage = !!V && Math.hypot(ctx.realPlayerPos.x - V.center.x, ctx.realPlayerPos.z - V.center.z) < V.radius + 4;
      for (let i = all.length - 1; i >= 0; i--) {
        const e = all[i];
        if (!e) continue;
        if (e._alertDelay > 0) { e._alertDelay -= dt; if (e._alertDelay <= 0 && !e.aggro && e.alive && ctx.realPlayerAlive) alertEnemy(ctx, e, false); }
        try { updateEnemy(ctx, e, dt); } catch (err) {
          if (!e._errLogged) { console.error('[enemies] update', e.kind, err); e._errLogged = true; }
        }
      }
      ctx.restoreTarget();
      separate();
      // distance LOD for wrapped v3 models only (v4 models switch LOD / outline in model.update from game.quality.budget)
      const cp = game.camera.position;
      for (let i = 0; ctx.visualStep && i < all.length; i++) {
        const e = all[i];
        if (e.noLod || e.model?.v4) continue;
        const d2 = e.object.position.distanceToSquared(cp);
        const far = d2 > 45 * 45, noSh = d2 > 70 * 70;
        if (e._olFar !== far) { e._olFar = far; const ol = e.model?.outlines; if (ol) for (const o of ol) o.visible = !far; }
        if (e._shFar !== noSh) {
          e._shFar = noSh; const ms = e.model?.skin?.meshes;
          if (ms) for (const k in ms) { const m = ms[k]; if (m.userData._cs === undefined) m.userData._cs = m.castShadow; m.castShadow = !noSh && m.userData._cs; }
        }
      }
      if (!ctx.cine) ctx.projectiles.update(dt);
      ctx.loot.update(dt);
      ctx.telegraphs.update(dt, game.time);
      encounters.update(realDt);
      if (ctx.visualStep) scanSight(realDt);
      // rebuild alive list
      list.length = 0;
      for (const e of all) if (e.alive && !e.isDummy) list.push(e);
      for (const e of all) if (e.alive && e.isDummy) list.push(e);

      if (bossSpawnT > 0) { bossSpawnT -= dt; if (bossSpawnT <= 0) spawnBoss('golem'); }
    },
  };
  return api;
}
