// Zone encounters (CONTRACT §14, DESIGN §8.2 / §12): lazy spawn per group when the player comes near (inside a loaded zone),
// despawn beyond 120 m or 30 s after zoneExit, ≤ 18 regular enemies alive in total. Cleared groups stay cleared.
// Table: {zoneId: {groups:[{id, pos:[x,z], r, spawns:[{type, count, opts}], onCleared?}]}}. Act-1 camps stay in enemies.js (populate).

export const ENCOUNTERS = {
  mirwen: {
    groups: [
      { id: 'mw_shore', pos: [-58, -86], r: 6, spawns: [{ type: 'lizard', count: 2 }, { type: 'chuchu', count: 2, opts: { variant: 'water' } }] },
      { id: 'mw_falls', pos: [-102, -56], r: 6, spawns: [{ type: 'lizard', count: 2 }, { type: 'wraith', count: 1 }] },
      { id: 'mw_reeds', pos: [-68, -50], r: 6, spawns: [{ type: 'chuchu', count: 2, opts: { variant: 'water' } }, { type: 'chuchu', count: 1, opts: { variant: 'ice' } }, { type: 'lizard', count: 1 }] },
      { id: 'mw_ruin', pos: [-104, -90], r: 5, spawns: [{ type: 'lizard', count: 2 }, { type: 'chuchu', count: 1, opts: { variant: 'water' } }] },
    ],
  },
  elderwood: {
    groups: [
      { id: 'ew_spores', pos: [72, -70], r: 6, spawns: [{ type: 'shroom', count: 2 }, { type: 'chuchu', count: 2, opts: { variant: 'nature' } }] },
      { id: 'ew_pack', pos: [98, -44], r: 5, spawns: [{ type: 'wolf', count: 3, pack: true }] },
      { id: 'ew_ring', pos: [80, -36], r: 6, spawns: [{ type: 'shroom', count: 2 }, { type: 'chuchu', count: 1, opts: { variant: 'shadow' } }] },
      { id: 'ew_knight', pos: [108, -56], r: 5, spawns: [{ type: 'voidknight', count: 1, opts: { elite: true } }, { type: 'wraith', count: 1 }] },
      { id: 'ew_deep', pos: [74, -84], r: 6, spawns: [{ type: 'wolf', count: 3, pack: true }, { type: 'shroom', count: 1 }] },
    ],
  },
  ascent: {
    groups: [
      { id: 'as_valley', pos: [30, -134], r: 6, spawns: [{ type: 'wraith', count: 2 }, { type: 'wolf', count: 3, pack: true }] },
      { id: 'as_ramp', pos: [80, -118], r: 5, spawns: [{ type: 'voidknight', count: 1, opts: { elite: true } }, { type: 'wraith', count: 2 }] },
      { id: 'as_light', pos: [44, -150], r: 5, spawns: [{ type: 'chuchu', count: 2, opts: { variant: 'light' } }, { type: 'chuchu', count: 2, opts: { variant: 'shadow' } }] },
    ],
  },
  plateau: { groups: [] },   // the plateau is the final arena: minions come from the boss
};

export const ENC_RULES = { spawnR: 70, despawnR: 120, exitGrace: 30, maxAlive: 18, tick: 0.5 };

export function createEncounters(ctx, hooks) {
  const game = ctx.game;
  const loaded = new Map();   // zoneId → {groups:[{def, members:[], spawned, cleared}], exitT}
  const cleared = new Set();  // group ids
  let acc = 0, curZone = null;

  function load(zoneId) {
    const def = ENCOUNTERS[zoneId];
    if (!def) return false;
    let z = loaded.get(zoneId);
    if (!z) {
      z = { id: zoneId, exitT: -1, groups: def.groups.map((g) => ({ def: g, members: [], spawned: false, cleared: cleared.has(g.id) })) };
      loaded.set(zoneId, z);
    }
    z.exitT = -1;
    return true;
  }
  function despawnGroup(G) {
    for (const m of G.members) if (!m.removed) hooks.remove(m);
    G.members.length = 0; G.spawned = false;
  }
  function unload(zoneId) {
    const z = loaded.get(zoneId);
    if (!z) return false;
    for (const G of z.groups) despawnGroup(G);
    loaded.delete(zoneId);
    return true;
  }
  function spawnGroup(z, G) {
    const g = G.def;
    let k = 0;
    const packId = g.id + ':' + Math.floor(game.time * 10);
    for (const s of g.spawns) {
      for (let i = 0; i < (s.count || 1); i++) {
        if (hooks.aliveCount() >= ENC_RULES.maxAlive) break;
        const a = (k / Math.max(1, countOf(g))) * Math.PI * 2 + 0.7;
        const r = (g.r || 5) * (0.35 + 0.5 * ((k * 7) % 5) / 5);
        const x = g.pos[0] + Math.sin(a) * r, zz = g.pos[1] + Math.cos(a) * r;
        const opts = { ...(s.opts || {}), zoneId: z.id, encounter: g.id, facing: a + Math.PI };
        if (s.pack) { opts.pack = packId; opts.packSlot = i; }
        const e = hooks.spawn(s.type, x, zz, opts);
        if (e) { e.encounter = g.id; G.members.push(e); }
        k++;
      }
    }
    G.spawned = true;
  }
  const countOf = (g) => g.spawns.reduce((n, s) => n + (s.count || 1), 0);

  function update(dt) {
    acc += dt;
    if (acc < ENC_RULES.tick) return;
    const step = acc; acc = 0;
    const pp = ctx.realPlayerPos;
    for (const [zid, z] of loaded) {
      if (z.exitT >= 0) { z.exitT += step; if (z.exitT > ENC_RULES.exitGrace) { unload(zid); continue; } }
      for (const G of z.groups) {
        if (G.cleared) continue;
        const d = Math.hypot(pp.x - G.def.pos[0], pp.z - G.def.pos[1]);
        if (G.spawned) {
          // cleared when every member died; despawn (to respawn fresh later) when the player is far away
          let alive = 0;
          for (const m of G.members) if (m.alive && !m.removed) alive++;
          if (alive === 0 && G.members.length && G.members.every((m) => m.dying || m.removed || !m.alive) && G.members.some((m) => m.dying || m.hp <= 0)) {
            G.cleared = true; cleared.add(G.def.id);
            game.events.emit('encounterCleared', { zoneId: zid, groupId: G.def.id, left: z.groups.filter((q) => !q.cleared).length });
            try { G.def.onCleared?.(game); } catch (_) { /* */ }
          } else if (d > ENC_RULES.despawnR) despawnGroup(G);
        } else if (z.exitT < 0 && d < ENC_RULES.spawnR && hooks.aliveCount() < ENC_RULES.maxAlive) spawnGroup(z, G);
      }
    }
  }

  game.events.on('zoneEnter', (p) => { if (p?.zoneId) { curZone = p.zoneId; load(p.zoneId); } });
  game.events.on('zoneExit', (p) => { const z = loaded.get(p?.zoneId); if (z) z.exitT = 0; });

  return {
    load, unload, update,
    get current() { return curZone; },
    get loaded() { return loaded; },
    groupsLeft(zoneId) { const z = loaded.get(zoneId); const def = ENCOUNTERS[zoneId]; if (!def) return 0; return def.groups.filter((g) => !cleared.has(g.id)).length; void z; },
    groupsTotal(zoneId) { return ENCOUNTERS[zoneId]?.groups.length || 0; },
    isCleared: (id) => cleared.has(id),
    serialize: () => [...cleared],
    deserialize(list) { if (Array.isArray(list)) for (const id of list) cleared.add(id); },
    reset() { for (const id of [...loaded.keys()]) unload(id); cleared.clear(); },
    table: ENCOUNTERS,
  };
}
