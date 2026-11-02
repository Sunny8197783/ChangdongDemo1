// Enemies module: camps of chuchus / bokoblins / shamans, training dummies, stone golem boss, loot, objective flow.
import * as THREE from 'three';
import { rand, pick, clamp } from './core/utils.js';
import { Telegraphs } from './enemies/common.js';
import { updateEnemy, alert as alertEnemy } from './enemies/base.js';
import { createBokoblin } from './enemies/bokoblin.js';
import { createShaman } from './enemies/shaman.js';
import { createChuchu } from './enemies/chuchu.js';
import { createGolem } from './enemies/golem.js';
import { createDummy } from './enemies/dummy.js';
import { EnemyProjectiles } from './enemies/projectiles.js';
import { Loot } from './enemies/loot.js';
import { buildGolem } from './enemies/models.js';

const FACTORIES = { bokoblin: createBokoblin, shaman: createShaman, chuchu: createChuchu, golem: createGolem, dummy: createDummy };
const CAMP_MIX = [
  { chuchu: 3, bokoblin: 2, shaman: 0 },
  { chuchu: 1, bokoblin: 2, shaman: 2 },
  { chuchu: 2, bokoblin: 3, shaman: 2 },
];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export function createEnemies(game) {
  const all = [];          // every live controller (incl. dying, dummies)
  const list = [];         // alive enemies (non-dummy first, then dummies) — rebuilt each frame
  const camps = [];        // {id, index, members:[], cleared}
  let boss = null, bossSpawnT = -1, victoryT = -1, phase = 'camps', kills = 0, playTime = 0, campsCleared = 0;
  const tokens = new Set();

  const ctx = {
    game,
    playerPos: new THREE.Vector3(), playerCenter: new THREE.Vector3(), playerAlive: false,
    telegraphs: null, projectiles: null, loot: null,
    audio(name, opts) { try { game.audio?.play?.(name, opts); } catch (_) { /* optional */ } },
    takeToken(e) {
      if (tokens.has(e)) return true;
      if (tokens.size >= 2) return false;
      tokens.add(e); e.token = true; return true;
    },
    releaseToken(e) { tokens.delete(e); e.token = false; },
    alertCamp(e) {
      for (const o of all) {
        if (o === e || o.aggro || o.dying || o.isDummy || o.isBoss) continue;
        if ((e.camp != null && o.camp === e.camp) || o.object.position.distanceTo(e.object.position) < 14) {
          o._alertDelay = rand(0.15, 0.6);
        }
      }
    },
    /** True if the player is in front of e within range (half-angle in radians) and vertically close. */
    meleeCheck(e, range, halfAngle) {
      const pe = game.player?.entity; if (!pe || !pe.alive) return false;
      const p = e.object.position, pp = ctx.playerPos;
      const dx = pp.x - p.x, dz = pp.z - p.z, d = Math.hypot(dx, dz);
      if (d > range + (pe.radius || 0.4) || Math.abs(pp.y - p.y) > 2.2 + e.height * 0.3) return false;
      let a = Math.atan2(dx, dz) - e.facing; a = Math.atan2(Math.sin(a), Math.cos(a));
      return Math.abs(a) < halfAngle || d < 1.0;
    },
    hitPlayer(e, h) {
      const pe = game.player?.entity; if (!pe || !pe.alive) return null;
      _v.subVectors(ctx.playerPos, e.object.position).setY(0);
      if (_v.lengthSq() < 1e-6) _v.set(Math.sin(e.facing), 0, Math.cos(e.facing)); _v.normalize();
      return game.combat.dealDamage(pe, {
        amount: h.amount, element: h.element || 'physical', source: e, point: ctx.playerCenter.clone(),
        direction: _v.clone(), knockback: h.knockback ?? 6, launch: h.launch ?? 0, status: h.status || undefined, heavy: h.amount >= 20,
      });
    },
    /** Area slam damaging the player. */
    slam(center, radius, h, source, fx = 1) {
      const vfx = game.vfx;
      _v2.copy(center); _v2.y = game.world.getHeight(center.x, center.z) + 0.15;
      vfx.shockwave(_v2, { color: 0xf0d6a0, radius: radius * 1.15, duration: 0.45, opacity: 0.85, thickness: 0.35 });
      vfx.burst(_v2, { count: Math.round(18 * fx), color: [0xd9c094, 0x9a8460], speed: 5 * fx, spread: 0.35, dir: _v.set(0, 1, 0), size: 0.8 * fx, sizeEnd: 1.8 * fx, life: 0.9, shape: 'smoke', additive: false, drag: 2.2, ground: true });
      vfx.debris?.(_v2, { count: Math.round(6 * fx), size: 0.3 * fx, speed: 6, material: 'rock' });
      vfx.shake(0.25 * fx);
      ctx.audio('land', { position: _v2, volume: 0.8, pitch: 0.6 });
      const pe = game.player?.entity; if (!pe || !pe.alive) return;
      const pp = ctx.playerPos;
      const d = Math.hypot(pp.x - center.x, pp.z - center.z);
      if (d > radius + (pe.radius || 0.4)) return;
      if (h.jumpAvoid && pp.y - game.world.getHeight(pp.x, pp.z) > 0.9) return;
      _v.set(pp.x - center.x, 0, pp.z - center.z); if (_v.lengthSq() < 1e-4) _v.set(0, 0, 1); _v.normalize();
      game.combat.dealDamage(pe, { amount: h.amount, element: h.element || 'physical', source, point: ctx.playerCenter.clone(), direction: _v.clone(),
        knockback: h.knockback ?? 8, launch: h.launch ?? 4, heavy: true });
    },
    dust(pos, s = 1) {
      _v2.copy(pos); _v2.y += 0.1;
      game.vfx.burst(_v2, { count: Math.round(8 * s) + 2, color: [0xd9c4a0, 0xb09a78], speed: 2.2 * s, spread: 0.4, dir: _v.set(0, 1, 0), size: 0.4 * s, sizeEnd: 1.0 * s, life: 0.6, shape: 'smoke', additive: false, drag: 2.5 });
    },
    dissolveFx(e, s = 1) {
      const c = e.getCenter(_v2);
      const vfx = game.vfx;
      vfx.burst(c, { count: Math.round(30 * s), color: [0x5a2a7a, 0x24103a], speed: 2.2 * s, speedVar: 1.2, spread: 1, size: 0.7 * s, sizeEnd: 1.6 * s, life: 1.1, shape: 'smoke', additive: false, drag: 2, gravity: -1.5 });
      vfx.burst(c, { count: Math.round(26 * s), color: [0xd9a0ff, 0xffffff], speed: 3.5 * s, spread: 1, size: 0.13, sizeEnd: 0, life: 1.0, lifeVar: 0.4, shape: 'spark', drag: 1.5, gravity: -2.5 });
      vfx.burst(c, { count: Math.round(12 * s), color: [0xff8ad8, 0xb07aff], speed: 1.2, spread: 1, size: 0.25, sizeEnd: 0, life: 1.4, shape: 'ember', gravity: -2 });
      vfx.flash?.(c, { color: 0xb07aff, intensity: 4 * s, distance: 8 * s, duration: 0.4 });
      ctx.audio('enemy_death', { position: c, volume: 0.5, pitch: 1.3 });
    },
    onEnemyDied(e) { onDied(e); },
    remove(e) { removeEnemy(e); },
    spawnSummon(type, pos, opts = {}) {
      pos.y = game.world.getHeight(pos.x, pos.z);
      const e = spawn(type, pos, { ...opts, camp: null });
      e.summoned = true;
      e.velocity.y = 7; e.grounded = false;
      game.vfx.debris?.(pos, { count: 8, size: 0.3, speed: 6, material: 'rock' });
      ctx.dust(pos, 1.2);
      alertEnemy(ctx, e);
      return e;
    },
  };

  function spawn(type, pos, opts = {}) {
    const f = FACTORIES[type];
    const p = pos.clone();
    if (opts.snap !== false) p.y = game.world.getHeight(p.x, p.z);
    const e = f(ctx, p, opts);
    game.scene.add(e.object);
    game.combat.register(e);
    all.push(e);
    if (opts.camp != null && camps[opts.camp]) camps[opts.camp].members.push(e);
    return e;
  }

  function removeEnemy(e) {
    if (e.removed) return;
    e.removed = true;
    e.object.removeFromParent();
    game.combat.unregister(e);
    const i = all.indexOf(e); if (i >= 0) all.splice(i, 1);
  }

  function onDied(e) {
    if (e.isDummy) return;
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
    if (e.isBoss) {
      phase = 'done';
      game.events.emit('bossDefeated', { boss: e });
      game.slowmo(0.25, 1.2);
      victoryT = 4.5; // lets the crumble start before the victory screen
      game.world.setArenaGlow?.(0.3);
      for (const o of all) if (o !== e && o.alive && !o.isDummy) game.combat.dealDamage(o, { amount: 9999, element: 'physical', source: 'player', noReaction: true });
    }
  }

  function celebrate(pos) {
    const vfx = game.vfx;
    _v.copy(pos); _v.y += 1.5;
    vfx.burst(_v, { count: 70, color: [0xffe27a, 0xffffff], speed: 9, spread: 0.5, dir: _v2.set(0, 1, 0), size: 0.2, sizeEnd: 0, life: 1.6, shape: 'spark', gravity: 6, drag: 1 });
    vfx.burst(_v, { count: 40, color: [0x8fffc1, 0x7fe3ff], speed: 6, spread: 1, size: 0.25, sizeEnd: 0, life: 1.8, shape: 'ember', gravity: -1 });
    vfx.shockwave(_v2.set(pos.x, pos.y + 0.2, pos.z), { color: 0xffe27a, radius: 14, duration: 1.0, opacity: 0.7 });
    vfx.flash?.(_v, { color: 0xffe27a, intensity: 8, distance: 25, duration: 0.8 });
    ctx.audio('reaction', { position: pos, volume: 0.9, pitch: 1.2 });
  }

  let prebuiltGolem = null;
  function spawnBoss() {
    const A = game.world.bossArena;
    const pos = (A?.position || new THREE.Vector3(0, 0, -120)).clone();
    // face the arena entrance (south, +Z) / player
    const pp = ctx.playerPos;
    const facing = Math.atan2(pp.x - pos.x, pp.z - pos.z);
    boss = spawn('golem', pos, { facing, model: prebuiltGolem });
    prebuiltGolem = null;
    phase = 'boss';
    game.world.setArenaGlow?.(0.55);
    game.events.emit('bossSpawn', { boss });
    game.vfx.shake(0.35);
  }

  function populate() {
    const W = game.world;
    (W.camps || []).forEach((c, i) => {
      const camp = { id: c.id || 'camp' + i, index: i, members: [], cleared: false, position: c.position, fire: c.fire || c.position };
      camps.push(camp);
      const mix = CAMP_MIX[i] || CAMP_MIX[CAMP_MIX.length - 1];
      const fire = camp.fire, R = c.radius || 12;
      let k = 0;
      const nb = mix.bokoblin;
      for (let j = 0; j < nb; j++) {
        const sit = j < Math.min(2, nb - (i > 0 ? 1 : 0));
        const a = (j / nb) * Math.PI * 2 + i;
        const r = sit ? 2.6 : rand(5, R * 0.55);
        _v.set(fire.x + Math.sin(a) * r, 0, fire.z + Math.cos(a) * r);
        const facing = sit ? Math.atan2(fire.x - _v.x, fire.z - _v.z) : a;
        spawn('bokoblin', _v, { camp: i, sit, facing });
        k++;
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

  // --------------------------------------------------------------- separation between enemies
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
        const ma = a.mass || 1, mb = b.isDummy ? 1e6 : (b.mass || 1), wa = mb / (ma + mb), wb = ma / (ma + mb);
        pa.x -= dx * push * wa; pa.z -= dz * push * wa;
        pb.x += dx * push * wb; pb.z += dz * push * wb;
      }
    }
  }

  const api = {
    list, all,
    get boss() { return boss; },
    get kills() { return kills; },
    get inCombat() {
      for (const e of all) if (e.alive && e.aggro && !e.isDummy && e.distP < 30) return true;
      return false;
    },
    getObjective() {
      return { phase, campsCleared, campsTotal: camps.length, boss: boss && boss.alive ? boss : null,
        camps: camps.map((c) => ({ id: c.id, cleared: c.cleared, alive: c.members.filter((m) => m.alive).length, position: c.position })) };
    },
    /** Debug / tests: spawn(type, pos, opts). */
    spawn(type, pos, opts) { return spawn(type, pos, opts); },
    /** Debug: start the boss fight immediately. */
    spawnBoss() { if (!boss) { for (const c of camps) c.cleared = true; campsCleared = camps.length; spawnBoss(); } return boss; },

    init() {
      ctx.telegraphs = new Telegraphs(game.scene, 10);
      ctx.projectiles = new EnemyProjectiles(ctx);
      ctx.loot = new Loot(ctx);
      populate();
      // prebuild the golem + compile its shader programs now, so the boss reveal doesn't hitch
      try {
        prebuiltGolem = buildGolem();
        prebuiltGolem.root.position.set(0, -500, 0);
        game.scene.add(prebuiltGolem.root);
        prebuiltGolem.root.updateMatrixWorld(true);
        game.renderer.compile(game.scene, game.camera);
        game.scene.remove(prebuiltGolem.root);
        prebuiltGolem.root.position.set(0, 0, 0);
      } catch (err) { console.warn('[enemies] golem warmup', err); prebuiltGolem = null; }
      game.events.on('playerDeath', () => { for (const e of all) { if (e.aggro && !e.isBoss) { e.aggro = false; ctx.releaseToken(e); e.setState('return'); } } });
    },

    update(dt, realDt) {
      playTime += realDt;
      const pe = game.player?.entity;
      if (pe) {
        ctx.playerPos.copy(pe.object.position);
        if (pe.getCenter) pe.getCenter(ctx.playerCenter); else ctx.playerCenter.copy(ctx.playerPos).setY(ctx.playerPos.y + (pe.height || 1.8) * 0.5);
        ctx.playerAlive = pe.alive !== false;
      }
      for (let i = all.length - 1; i >= 0; i--) {
        const e = all[i];
        if (e._alertDelay > 0) { e._alertDelay -= dt; if (e._alertDelay <= 0 && !e.aggro && e.alive && ctx.playerAlive) alertEnemy(ctx, e, false); }
        try { updateEnemy(ctx, e, dt); } catch (err) {
          if (!e._errLogged) { console.error('[enemies] update', e.kind, err); e._errLogged = true; }
        }
      }
      separate();
      // distance LOD: outlines are sub-pixel far away; hide them (halves far-camp draw calls)
      const cp = game.camera.position;
      for (const e of all) {
        if (!e.object) continue;
        if (!e._outlines) { e._outlines = []; e.object.traverse((o) => { if (o.isMesh && o.name === 'outline') e._outlines.push(o); }); }
        const far = e.object.position.distanceToSquared(cp) > 55 * 55;
        if (e._olFar !== far) { e._olFar = far; for (const o of e._outlines) o.visible = !far; }
      }
      ctx.projectiles.update(dt);
      ctx.loot.update(dt);
      ctx.telegraphs.update(dt, game.time);
      // rebuild alive list
      list.length = 0;
      for (const e of all) if (e.alive && !e.isDummy) list.push(e);
      for (const e of all) if (e.alive && e.isDummy) list.push(e);

      if (bossSpawnT > 0) { bossSpawnT -= dt; if (bossSpawnT <= 0) spawnBoss(); }
      if (victoryT > 0) {
        victoryT -= realDt;
        if (victoryT <= 0) {
          const stats = { kills, timeSec: Math.round(playTime), reactions: game.combat.discovered?.size ?? 0 };
          game.events.emit('victory', { stats });
          game.setState?.('victory');
        }
      }
    },
  };
  return api;
}
