// Debug / test functions (CONTRACT §21). game.debug. Every function feature-detects its target and never throws.
import * as THREE from 'three';
import { ALL_ELEMENTS } from './elements.js';
import { access } from './classes.js';

export function createDebug(game) {
  const v = new THREE.Vector3();
  const warned = new Set();
  const warn = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn('[debug]', ...a); } };
  const safe = (name, fn) => (...a) => { try { return fn(...a); } catch (err) { warn(name, name, 'failed:', err?.message || err); return null; } };
  const P = () => game.progression;
  const playerPos = () => game.player?.object?.position || game.player?.entity?.object?.position || null;

  // ---- per-event counter (enabled in test mode by main.js through events.enableCount)
  const counts = new Map();
  let counting = false;
  const events = {
    enable() {
      if (counting) return; counting = true;
      const E = game.events, orig = E.emit.bind(E);
      E.emit = (name, payload) => { counts.set(name, (counts.get(name) || 0) + 1); return orig(name, payload); };
    },
    count(name) { return counts.get(name) || 0; },
    reset(name) { if (name) counts.delete(name); else counts.clear(); },
    all() { return Object.fromEntries(counts); },
  };

  /** Find an alive non-player entity nearest to the player (optionally within r). */
  function nearestEnemy(r = 60) {
    const pp = playerPos(); if (!pp) return null;
    let best = null, bd = r * r;
    for (const e of game.entities || []) {
      if (!e?.alive || e.team === 'player' || e.isProp) continue;
      const p = e.object?.position; if (!p) continue;
      const d = p.distanceToSquared(pp);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  /** Spawn (or reuse) a training dummy near the player. Works with the enemies stub too. */
  function spawnDummy(pos, opts = {}) {
    let d = null;
    try { d = game.enemies?.spawn?.('dummy', pos, { facing: opts.facing ?? 0 }); } catch (err) { warn('dummy', 'enemies.spawn(dummy) failed', err?.message); }
    if (!d) {
      const object = new THREE.Object3D(); object.position.copy(pos); game.scene?.add?.(object);
      d = { id: 'dummy', type: 'dummy', team: 'enemy', alive: true, object, radius: 0.5, height: 1.8, hp: 1e6, maxHp: 1e6, mass: 1e6,
        velocity: new THREE.Vector3(), statuses: {}, isDummy: true };
      try { game.combat?.register?.(d); } catch (_) { game.entities.push(d); }
      if (!game.entities.includes(d)) game.entities.push(d);
    }
    d.xpValue = 0;
    if (opts.hp) { d.hp = d.maxHp = opts.hp; }
    if (opts.aggro) { d.aggro = true; d.debugAggro = true; }
    return d;
  }

  const D = {
    events,
    nearestEnemy, spawnDummy,
    level: safe('level', (n) => { P()?.setLevel?.(n); return P()?.level; }),
    xp: safe('xp', (n) => P()?.addXp?.(n, { kind: 'debug' })),
    learn: safe('learn', (id) => P()?.learn?.(id)),
    learnAll: safe('learnAll', () => {
      const pr = P(); if (!pr?.hasTrees?.()) { warn('learnAll', 'no trees registered'); return false; }
      const map = {};
      for (const el of ALL_ELEMENTS) {
        if (!pr.debug.ungate && !access(pr.cls, el)) continue;
        const cap = pr.tierCap?.(el);
        for (const n of pr.nodesOf(el)) {
          if (!pr.debug.ungate && cap === 'T3' && (n.tier || 1) >= 4) continue;
          if (n.type === 'modifier' && n.exclusive && /b$/.test(n.id)) continue;   // presets always pick 'a'
          map[n.id] = n.maxRank || 1;
        }
      }
      pr.setRanks(map, { ignoreBudget: true, ignoreGates: true });
      try { game.skills?.autoEquip?.(); } catch (_) { /* */ }
      return true;
    }),
    respec: safe('respec', () => P()?.respecAll?.()),
    equip: safe('equip', (slot, id) => game.skills?.equip?.(slot, id)),
    cast: safe('cast', (id, opts = {}) => game.skills?.cast?.(id, { free: true, ...opts })),
    preset: safe('preset', (name) => game.skills?.applyPreset?.(name)),
    freeSpirits: safe('freeSpirits', () => { for (const el of ['water', 'shadow', 'nature', 'light']) P()?.freeSpirit?.(el); P()?.breakSeals?.(); return true; }),
    breakSeals: safe('breakSeals', () => P()?.breakSeals?.()),
    tp: safe('tp', (id) => {
      const W = game.world; let target = null;
      if (id && typeof id === 'object' && 'x' in id) target = id;
      const z = W?.zones && (Array.isArray(W.zones) ? W.zones.find((q) => q.id === id) : W.zones[id]);
      if (!target && z) target = z.center || z.position || z.spawn;
      const g = !target && W?.gates && (Array.isArray(W.gates) ? W.gates.find((q) => q.id === id) : W.gates[id]);
      if (!target && g) target = g.position || g.pos;
      if (!target && id === 'village') target = W?.playerSpawn;
      if (!target && W?.bossArenas?.[id]) target = W.bossArenas[id].position;
      if (!target) { warn('tp:' + id, 'unknown tp target', id); return false; }
      const pp = playerPos(); if (!pp) return false;
      const h = W.getGroundHeight ? W.getGroundHeight(target.x, target.z) : (W.getHeight?.(target.x, target.z) ?? 0);
      pp.set(target.x, h + 0.05, target.z);
      game.player?.entity?.velocity?.set?.(0, 0, 0);
      return true;
    }),
    spawn: safe('spawn', (type, opts = {}) => {
      const pp = playerPos(); if (!pp) return null;
      const pos = opts.pos || v.set(pp.x, pp.y, pp.z - (opts.dist ?? 6)).clone();
      if (type === 'dummy') return spawnDummy(pos, opts);
      return game.enemies?.spawn?.(type, pos, opts) || null;
    }),
    boss: safe('boss', (id) => game.enemies?.spawnBoss?.(id)),
    bossPhase: safe('bossPhase', (n) => (game.enemies?.boss?.debugPhase ? game.enemies.boss.debugPhase(n) : game.enemies?.debugPhase?.(n))),
    killBoss: safe('killBoss', () => {
      if (game.enemies?.debugDefeat) return game.enemies.debugDefeat();
      const b = game.enemies?.boss; if (!b?.alive) return false;
      return game.combat?.dealDamage?.(b, { amount: (b.hp || 1e6) + 1, element: 'physical', source: 'player', noReaction: true, ignoreShield: true });
    }),
    /** Damage the player through combat. combat:true also marks an aggroed dummy within 30 m (inCombat() → true). */
    hurt: safe('hurt', (amount = 10, { combat = false, element = 'physical', dot = false } = {}) => {
      const pl = game.player; if (!pl?.entity) return null;
      if (combat) {
        const pp = playerPos();
        let d = (game.enemies?.list || game.entities || []).find((e) => e?.isDummy && e.alive && pp && e.object?.position?.distanceTo(pp) < 30);
        if (!d && pp) d = spawnDummy(v.set(pp.x + 4, pp.y, pp.z - 4).clone(), {});
        if (d) { d.aggro = true; d.debugAggro = true; d.alert = true; }
      }
      const hit = { amount, element, source: 'debug', noReaction: true, noCrit: true, tags: dot ? ['dot', 'debug'] : ['debug'], isDot: !!dot };
      return game.combat?.dealDamage?.(pl.entity, hit) || null;
    }),
    regenState: () => game.player?.regen || null,
    react: safe('react', (id, target) => {
      const t = target || nearestEnemy();
      if (!t) { warn('react', 'no target for react'); return false; }
      if (game.combat?.debugReact) return game.combat.debugReact(id, t);
      warn('debugReact', 'combat.debugReact missing'); return false;
    }),
    /** {calls, tris, programs, particles, decals, lights} for one rendered frame (autoReset handled like playtest2:383). */
    drawStats: safe('drawStats', () => {
      const R = game.renderer, inf = R.info;
      const prevAuto = inf.autoReset;
      inf.autoReset = false; inf.reset();
      game.step ? game.step(1, 1 / 60, true) : game.renderNow?.();
      const out = { calls: inf.render.calls, tris: inf.render.triangles, programs: inf.programs?.length ?? 0 };
      inf.autoReset = prevAuto;
      const vs = game.vfx?.stats?.() || null;
      out.particles = vs?.particles ?? game.vfx?.particleCount ?? 0;
      out.decals = vs?.decals ?? 0;
      let lights = 0; game.scene.traverse((o) => { if (o.isLight && o.visible) lights++; });
      out.lights = lights;
      return out;
    }),
    stats: () => game.stats?.dump?.(),
  };
  return D;
}
