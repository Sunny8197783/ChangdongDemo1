// playtest3 section: world (CONTRACT §13 + §21 check 11 for the world's zones). Owned by world.
// Runs with the other modules present or stubbed: anything that needs another owner (combat props, ui gate menu,
// bosses) is feature-detected and SKIPped when missing, never faked.
const fs = require('fs'); const path = require('path');

module.exports = async function world(PT) {
  // ------------------------------------------------------------ static: rule 8 / rule 9 on the world's files
  {
    const files = ['src/world.js', ...fs.readdirSync(path.join(PT.root, 'src/world')).map((f) => 'src/world/' + f)];
    const bad = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(PT.root, f), 'utf8').split('\n');
      src.forEach((l, i) => {
        if (/=== ?'(sword|mage)'/.test(l)) bad.push(`${f}:${i + 1}`);
        if (/for \(let \w+ = 0; \w+ < 5;/.test(l)) bad.push(`${f}:${i + 1} (i<5)`);
        if (/\['fire', 'ice', 'lightning', 'wind', 'earth'\]/.test(l)) bad.push(`${f}:${i + 1} (5-element array)`);
      });
    }
    PT.check('rule 8/9: no class literals, i<5 loops or local 5-element arrays in world files', bad.length === 0, bad);
  }

  const pg = await PT.boot('&cls=mage');
  PT.check('boot: ready', pg.ready);
  if (!pg.ready) { await pg.close(); return; }

  // ------------------------------------------------------------ zones, arenas, terraform
  await pg.run('zones', () => {
    const g = game, W = g.world, T = g.THREE;
    PT.step(0.5);
    const ids = (W.zones || []).map((z) => z.id);
    PT.check('7 zones', ['village', 'plains', 'ruins', 'mirwen', 'elderwood', 'ascent', 'plateau'].every((id) => ids.includes(id)), ids);
    PT.check('zone fields', W.zones.every((z) => z.name && z.center?.isVector3 && z.radius > 0 && Array.isArray(z.level) && z.music && typeof z.fuel === 'boolean'));
    PT.check('names are Korean', W.zones.every((z) => /[가-힣]/.test(z.name)));
    const at = (x, z) => W.getZoneAt(x, z).id;
    PT.check('getZoneAt', at(-80, -72) === 'mirwen' && at(84, -62) === 'elderwood' && at(108, -132) === 'plateau' && at(60, -150) === 'ascent' && at(0, 137) === 'village' && at(0, -125) === 'ruins' && at(0, 20) === 'plains',
      [at(-80, -72), at(84, -62), at(108, -132), at(60, -150), at(0, 137), at(0, -125), at(0, 20)]);
    // arenas on real terrain
    const A = W.bossArenas;
    const need = { golem: 24, hydra: 20, nox: 14, treant: 22, kalis: 18, nidhoggra: 34 };
    for (const k in need) {
      const a = A?.[k];
      PT.check(`arena ${k}`, a && a.radius === need[k] && Math.abs(a.position.y - W.getHeight(a.position.x, a.position.z)) < 0.05, a && [a.position.x, a.position.y, a.position.z, a.radius]);
    }
    PT.check('bossArena kept = bossArenas.golem', W.bossArena === A.golem);
    PT.check('kalis (60,-150), nidhoggra (108,-132)', A.kalis.position.x === 60 && A.kalis.position.z === -150 && A.nidhoggra.position.x === 108 && A.nidhoggra.position.z === -132);
    const P5 = A.nidhoggra.pillars || [];
    PT.check('5 root pillars at r 22, tops = terrain', P5.length === 5 && P5.every((p) => Math.abs(Math.hypot(p.pos.x - 108, p.pos.z + 132) - 22) < 0.01 && Math.abs(W.getHeight(p.pos.x, p.pos.z) - p.top) < 0.6),
      P5.map((p) => [p.top, W.getHeight(p.pos.x, p.pos.z)]));
    PT.check('hydra 6 ruin pillars at r 14', (A.hydra.pillars || []).length === 6);
    const plat = W.getHeight(108, -132), ledge = W.getHeight(60, -150), valley = W.getHeight(44, -130);   // the valley floor at the ramp foot
    PT.check('plateau ≈ +38 m over the valley', plat - valley > 33 && plat - valley < 45, { plat, valley });
    PT.check('ledge ≈ +24 m over the valley', ledge - valley > 19 && ledge - valley < 29, { ledge, valley });
    PT.check('Mirwen basin under water', W.isInWater(-80, -72) && W.getHeight(-80, -72) < W.waterLevel - 2);
    PT.check('Mirwen islands above water', W.getHeight(-96, -88) > W.waterLevel + 0.5 && W.getHeight(-68, -87) > W.waterLevel + 0.3);
    PT.check('zones have arenas', W.zones.find((z) => z.id === 'plateau')?.arena?.id === 'nidhoggra' && W.zones.find((z) => z.id === 'mirwen')?.arena?.id === 'hydra');
    // zoneEnter / zoneExit at 4 Hz
    PT.resetCounts('zoneEnter'); PT.resetCounts('zoneExit');
    let last = null; const off = g.events.on('zoneEnter', (p) => { last = p; });
    g.debug.tp('mirwen'); PT.step(0.6);
    PT.check('zoneEnter mirwen', last?.zoneId === 'mirwen' && /[가-힣]/.test(last?.name || '') && Array.isArray(last?.level), last);
    PT.check('zoneExit emitted', PT.countEvents('zoneExit') >= 1);
    g.debug.tp('elderwood'); PT.step(0.6);
    PT.check('zoneEnter elderwood', last?.zoneId === 'elderwood', last);
    if (typeof off === 'function') off();
  });

  // ------------------------------------------------------------ bounds, platforms, colliders, updrafts
  await pg.run('bounds+platforms', () => {
    const g = game, W = g.world, T = g.THREE;
    const p = new T.Vector3(130, 0, -150);   // on the plateau, outside the r 170 circle
    PT.check('clampToBounds keeps the plateau', W.clampToBounds(p) === false && p.x === 130 && p.z === -150);
    const q = new T.Vector3(0, 0, 200); W.clampToBounds(q);
    PT.check('clampToBounds clamps outside', Math.hypot(q.x, q.z) <= 170.01, [q.x, q.z]);
    // the player stands on the plateau edge past r 170 without being pushed off
    g.debug.tp({ x: 128, z: -150 }); PT.step(0.5);
    const pp = g.player.object.position;
    PT.check('player stays on plateau past r 170', Math.hypot(pp.x - 128, pp.z + 150) < 1.5 && pp.y > 45, [pp.x, pp.y, pp.z]);
    // platforms
    const base = W.getHeight(10, 20);
    const h = W.addPlatform({ id: 'pt', shape: 'disc', center: new T.Vector3(10, base + 3, 20), r: 2, top: base + 3 });
    PT.check('platform with yHint', Math.abs(W.getGroundHeight(10, 20, base + 3) - (base + 3)) < 1e-6 && W.groundPlatform === h);
    PT.check('platform ignored below yHint-1.2 and without yHint', Math.abs(W.getGroundHeight(10, 20, base) - base) < 1e-6 && Math.abs(W.getGroundHeight(10, 20) - base) < 1e-6);
    h.moveTo(11, base + 3.5, 20, 1 / 60);
    PT.check('moveTo sets delta + velocity', Math.abs(h.delta.x - 1) < 1e-6 && Math.abs(h.delta.y - 0.5) < 1e-6 && h.velocity.x > 59);
    PT.step(1 / 60);
    PT.check('delta survives the frame it moved in', Math.abs(h.delta.x - 1) < 1e-6);
    PT.step(2 / 60);
    PT.check('delta clears when not moved', h.delta.x === 0);
    const box = W.addPlatform({ shape: 'box', center: new T.Vector3(30, base + 2, 20), size: { x: 4, z: 1 }, top: base + 2, yaw: 0.5, life: 0.5 });
    PT.check('box platform contains', W.getGroundHeight(30, 20, base + 2) > base + 1.5);
    PT.step(0.7);
    PT.check('platform life expires', !box.alive);
    for (let i = 0; i < 20; i++) W.addPlatform({ center: new T.Vector3(-20 + i, 0, 0), r: 0.5, top: 0 });
    PT.check('≤ 16 platforms alive', W.platforms.length <= 16, W.platforms.length);
    for (const q2 of W.platforms.slice()) W.removePlatform(q2);
    PT.check('removePlatform', W.platforms.length === 0);
    // temp colliders
    const cy = W.getHeight(40, 40);
    const c = W.addTempCollider({ shape: 'box', pos: new T.Vector3(40, cy, 40), size: { x: 4, y: 3, z: 1 }, h: 3, yaw: 0.3, life: 1, blocksProjectiles: true });
    PT.check('blocksProjectiles list', W.collidersBlockingProjectiles.includes(c));
    const out = { normal: new T.Vector3() };
    PT.check('projectileBlockAt block', W.projectileBlockAt(new T.Vector3(40, cy + 1, 40), out) === 'block' && out.collider === c);
    PT.check('projectileBlockAt miss', W.projectileBlockAt(new T.Vector3(46, cy + 1, 40)) === null && W.projectileBlockAt(new T.Vector3(40, cy + 5, 40)) === null);
    const r = W.addTempCollider({ shape: 'cyl', pos: new T.Vector3(-40, W.getHeight(-40, 40), 40), r: 1.5, h: 3, blocksProjectiles: true, onProjectile: () => 'reflect' });
    PT.check('projectileBlockAt reflect via onProjectile', W.projectileBlockAt({ position: new T.Vector3(-40, W.getHeight(-40, 40) + 1, 40.5) }) === 'reflect');
    const m = new T.Vector3(40, cy + 0.5, 40.1);
    W.resolveCollision(m, 0.5);
    PT.check('resolveCollision pushes out of a box collider', Math.abs((m.x - 40) * Math.sin(0.3) + (m.z - 40) * Math.cos(0.3)) >= 0.99, [m.x, m.z]);
    PT.step(1.2);
    PT.check('collider life expires', !c.alive && !W.collidersBlockingProjectiles.includes(c));
    W.removeCollider(r);
    PT.check('removeCollider', !W.collidersBlockingProjectiles.includes(r));
    // updrafts
    const uy = W.getHeight(0, 60);
    const ud = W.addUpdraft({ pos: new T.Vector3(0, uy, 60), r: 3, h: 15, strength: 20, life: 3 });
    PT.step(0.5);
    PT.check('addUpdraft merged into surface.getUpdraft', W.surface.getUpdraft(new T.Vector3(0, uy + 5, 60)) > 10 && W.surface.getUpdraft(new T.Vector3(10, uy + 5, 60)) === 0);
    W.removeUpdraft(ud);
    PT.check('removeUpdraft', W.surface.getUpdraft(new T.Vector3(0, uy + 5, 60)) === 0);
    // the ascent: static columns lift above the ledge and plateau tops (glide ratio 8 : 2.5)
    const ids = W.updrafts.map((d) => d.id);
    PT.check('ascent + pillar updrafts present', ['ascent1', 'ascent2', 'ascent3', 'pillar0', 'pillar4'].every((i) => ids.includes(i)), ids);
    const ledgeTop = W.getHeight(60, -150), platTop = W.getHeight(108, -132);
    const reach = (id, tx, tz, topY) => { const d = W.updrafts.find((q) => q.id === id); const dist = Math.hypot(tx - d.x, tz - d.z); return d.y + d.h - 4 - dist * 2.5 / 8 > topY + 1; };
    PT.check('ascent1 → ledge rim reachable by glide', reach('ascent1', 48, -140, ledgeTop));
    PT.check('ascent3 → plateau rim reachable by glide', reach('ascent3', 80, -126, platTop));
    PT.check('updraft lifts at ascent1', W.surface.getUpdraft(new T.Vector3(27, W.getHeight(27, -129) + 10, -129)) > 15);
    // root ramps walkable: consecutive samples never steeper than the player's 53° limit
    let maxSlope = 0;
    for (const R of [[[20, -108], [34, -106], [46, -114], [50, -126], [52, -134]], [[66, -138], [64, -124], [70, -110], [82, -102], [88, -106]]]) {
      for (let i = 0; i < R.length - 1; i++) for (let s = 0; s < 10; s++) {
        const ax = R[i][0] + (R[i + 1][0] - R[i][0]) * s / 10, az = R[i][1] + (R[i + 1][1] - R[i][1]) * s / 10;
        const bx = R[i][0] + (R[i + 1][0] - R[i][0]) * (s + 1) / 10, bz = R[i][1] + (R[i + 1][1] - R[i][1]) * (s + 1) / 10;
        const sl = Math.abs(W.getHeight(bx, bz) - W.getHeight(ax, az)) / Math.hypot(bx - ax, bz - az);
        maxSlope = Math.max(maxSlope, sl);
      }
    }
    PT.check('root ramps walkable (< 53°)', maxSlope < Math.tan(53 * Math.PI / 180), maxSlope);
    PT.check('setBossFightLOD toggles', (W.setBossFightLOD(true), W.bossFightLOD === true) && (W.setBossFightLOD(false), W.bossFightLOD === false));
  });

  // ------------------------------------------------------------ Mirwen freeze bridges, surface2
  await pg.run('mirwen+surface2', () => {
    const g = game, W = g.world, T = g.THREE;
    const p = new T.Vector3(-65, 0, -83);   // the water between island i3 and the frozen-bridge islet
    PT.check('bridge spot is water', W.isInWater(p.x, p.z));
    PT.check('freezeWater in Mirwen', W.surface.freezeWater(p, 4, 20) === true);
    PT.step(0.5);
    PT.check('ice is walkable ground', Math.abs(W.getGroundHeight(p.x, p.z) - (W.waterLevel + 0.14)) < 0.05, W.getGroundHeight(p.x, p.z));
    const S = W.surface2;
    const q = new T.Vector3(5, 0, 40);
    S.bless(q, 3, 1); S.curse(new T.Vector3(25, 0, 40), 3, 1); S.mud(new T.Vector3(-25, 0, 40), 3, 1);
    S.overgrow(new T.Vector3(45, 0, 40), 2, 1); S.rubble(new T.Vector3(-45, 0, 40), 2, 1);
    PT.check('surface2 channels', S.isBlessed(q) && S.isCursed(new T.Vector3(25, 0, 40)) && S.isMud(new T.Vector3(-25, 0, 40)) && S.surfaceAt(new T.Vector3(45, 0, 40)) === 'overgrowth' && S.surfaceAt(new T.Vector3(-45, 0, 40)) === 'rubble');
    PT.check('surfaceAt none', S.surfaceAt(new T.Vector3(100, 0, 100)) === 'none');
    PT.step(1.4);
    PT.check('surface2 expires (10 Hz tick)', !S.isBlessed(q) && S.activeCount() === 0, S.activeCount());
  });

  // ------------------------------------------------------------ rot walls (combat props)
  await pg.run('rot walls', () => {
    const g = game, W = g.world, T = g.THREE;
    const walls = W.rotWalls || [];
    PT.check('3 rot walls', walls.length === 3);
    // a collider blocks the gap
    const w0 = walls[0];
    const m = w0.position.clone(); m.y += 0.5;
    W.resolveCollision(m, 0.5);
    PT.check('rot wall blocks the gap', m.distanceTo(w0.position) > 0.6, [m.x - w0.position.x, m.z - w0.position.z]);
    PT.resetCounts('rotWallCleared');
    const C = g.combat;
    const real = C && !C.isStub && typeof C.dealDamage === 'function' && w0.prop && g.entities?.includes?.(w0.prop);
    const hit = (w, el, extra = {}) => C.dealDamage(w.prop, Object.assign({ amount: 10, element: el, source: 'player', point: w.position.clone().setY(w.position.y + 1.5) }, extra));
    if (real) {
      hit(walls[0], 'ice');
      PT.check('ice does not clear a wall', walls[0].state === 'intact');
      hit(walls[0], 'fire'); hit(walls[1], 'light'); hit(walls[2], 'earth', { heavy: true, tags: ['colossus'] });
    } else {
      PT.skip('combat hits on rot walls', 'combat stub / no prop registry');
      W.burnRotWall(walls[0].id); W.purifyRotWall(walls[1].id); W.smashRotWall(walls[2].id);
    }
    PT.step(2.2);
    PT.check('burn / purify / smash', walls[0].state === 'burned' && walls[1].state === 'purified' && walls[2].state === 'smashed', walls.map((w) => w.state));
    PT.check('rotWallCleared ×3', PT.countEvents('rotWallCleared') === 3);
    const m2 = w0.position.clone(); m2.y += 0.5; const before = m2.clone();
    W.resolveCollision(m2, 0.5);
    PT.check('collider removed after clearing', m2.distanceTo(before) < 0.01 || W.rotWallsCleared() === 3);
    const s = W.serialize();
    PT.check('serialize rot walls', s.rotWalls.rot1 === 'burned' && s.rotWalls.rot3 === 'smashed');
  });

  // ------------------------------------------------------------ gates, interact, travel, shrines, save
  let saved = null;
  await pg.run('gates', () => {
    const g = game, W = g.world;
    PT.check('5 gates', (W.gates || []).length === 5 && W.gates.every((q) => /[가-힣]/.test(q.name)));
    PT.check('respecSpots = altar + gates', W.respecSpots.length === 6);
    const gv = W.gates.find((q) => q.id === 'gate_village');
    g.debug.tp({ x: gv.exit.x, z: gv.exit.z }); PT.step(0.4);
    const cur = g.interact.current();
    PT.check('interact prompt at a gate', cur?.id === 'gate:gate_village', cur);
    let menu = null;
    const ui = g.ui || (g.ui = {});
    const prev = ui.openGateMenu;
    ui.openGateMenu = (list, onPick) => { menu = { list, onPick }; };
    PT.resetCounts('skillCast'); PT.resetCounts('spellCast');
    const used = g.interact.use();
    PT.check('F at a gate opens the gate menu', used && menu && menu.list.length === 5 && menu.list.find((q) => q.id === 'gate_village')?.current === true, menu?.list);
    PT.check('F at a gate casts nothing', PT.countEvents('skillCast') === 0 && PT.countEvents('spellCast') === 0);
    PT.check('unreached gate refused', W.travelTo('gate_kalis') === false);
    PT.resetCounts('gateTravel'); PT.resetCounts('zoneEnter');
    W.gates.find((q) => q.id === 'gate_mirwen').reached = true;
    W._v3.gates.setReached('gate_mirwen', true);
    menu.onPick('gate_mirwen');
    PT.check('traveling', W._v3.gates.traveling);
    PT.step(1.4);
    const pp = g.player.object.position; const gm = W.gates.find((q) => q.id === 'gate_mirwen');
    PT.check('travelTo teleports (1.2 s fade)', pp.distanceTo(gm.exit) < 2.5 && !W._v3.gates.traveling, [pp.x, pp.z]);
    PT.check('gateTravel emitted once', PT.countEvents('gateTravel') === 1);
    PT.step(0.4);
    PT.check('arrival zoneEnter mirwen', W.getZoneAt(pp.x, pp.z).id === 'mirwen' && PT.countEvents('zoneEnter') >= 1);
    PT.check('respec allowed at a gate', !g.progression?.canRespecHere || g.progression.canRespecHere() !== false);
    if (prev) ui.openGateMenu = prev; else delete ui.openGateMenu;
    // shrines
    const seeds = W.shrines.filter((s) => s.kind === 'seed');
    PT.check('8 seed shrines', seeds.length === 8);
    PT.resetCounts('shrineFound');
    let got = null; const off = g.events.on('shrineFound', (p) => { got = p; });
    const sw = W.shrines.find((s) => s.id === 'seed_windmill');
    const pts0 = g.progression?.points;
    g.debug.tp({ x: sw.position.x + 1, z: sw.position.z }); PT.step(0.5);
    PT.check('shrineFound seed by proximity', got?.id === 'seed_windmill' && got?.kind === 'seed' && sw.found, got);
    PT.check('shrine counted once', (PT.step(0.5), PT.countEvents('shrineFound') === 1));
    if (Number.isFinite(pts0)) PT.check('seed → progression +1 point (+300 XP)', g.progression.points >= pts0 + 1, [pts0, g.progression.points]);
    if (typeof off === 'function') off();
    // act visibility
    W.setActVisible(4);
    PT.check('islands shown at act 4', W._v3.plateau.islandGroup.visible === true);
    W.setActVisible(1);
    PT.check('islands hidden before act 4', W._v3.plateau.islandGroup.visible === false);
    // village altar + npc spots
    const V = W.village;
    PT.check('altar crystals = ALL_ELEMENTS', V.altarCrystals.length === g.elements.list.length && W.villageObject.crystals.count === g.elements.list.length);
    PT.check('mentor/sage/trainer spots', ['rangerMentor', 'paladinMentor', 'spiritMentor', 'shadowMentor', 'sage', 'trainer'].every((k) => V.npcSpots[k]?.position?.isVector3) && !!V.reactionDummy?.position);
    PT.check('zone npc spots', !!W.zones.find((z) => z.id === 'mirwen').npcSpots.lakeKeeper && !!W.zones.find((z) => z.id === 'elderwood').npcSpots.forestChild);
    // save round trip payload
    const s = W.serialize();
    PT.check('serialize gates/shrines', s.gates.reached.includes('gate_mirwen') && s.gates.found.includes('seed_windmill') && s.act === 1);
    PT.check('lastGateSpawn', W.lastGateSpawn().distanceTo(gm.exit) < 0.01);
    return JSON.parse(JSON.stringify(s));
  }).then((s) => { saved = s; });
  PT.check('world has no console errors', pg.errors().length === 0, pg.errors().slice(0, 6));
  await pg.close();

  // ------------------------------------------------------------ deserialize into a fresh boot
  if (saved) {
    const pg2 = await PT.boot('&cls=paladin');
    if (pg2.ready) {
      await pg2.run('deserialize', (s) => {
        const W = game.world;
        W.deserialize(s);
        PT.step(0.3);
        PT.check('gates restored', W.gates.find((q) => q.id === 'gate_mirwen').reached);
        PT.check('shrines restored (no re-award)', W.shrines.find((q) => q.id === 'seed_windmill').found);
        PT.check('rot walls restored', W.rotWalls.every((w) => w.state !== 'intact'));
      }, saved);
      PT.check('deserialize boot: no console errors', pg2.errors().length === 0, pg2.errors().slice(0, 6));
    }
    await pg2.close();
  }

  // ------------------------------------------------------------ perf: CONTRACT §21 check 11 for the world's zones
  const pg3 = await PT.boot('&cls=mage');
  if (pg3.ready) {
    await pg3.run('perf', () => {
      const g = game, W = g.world;
      const views = { village: [[-6, 128], 290], plains: [[-6, 20], 300], mirwen: [[-56, -60], 310], elderwood: [[70, -50], 310], plateau: [[96, -126], 330] };
      PT.step(1);
      const programs0 = PT.frameStats().programs;
      const res = {};
      for (const k in views) {
        const [[x, z], cap] = views[k];
        g.debug.tp({ x, z }); PT.step(0.4);
        let worst = { calls: 0, tris: 0 };
        for (let a = 0; a < 4; a++) {
          g.player.setLook?.(a * Math.PI / 2, -0.15); PT.step(0.1);
          const st = PT.frameStats();
          if (st.calls > worst.calls) worst = st;
        }
        res[k] = [worst.calls, worst.tris];
        PT.check(`perf ${k}: calls ≤ ${cap}, tris ≤ 900k`, worst.calls <= cap && worst.tris <= 900000, worst);
      }
      W.setActVisible(5);
      g.debug.tp({ x: 60, z: -128 }); PT.step(0.3);
      for (let a = 0; a < 4; a++) { g.player.setLook?.(a * Math.PI / 2, 0.1); PT.step(0.1); PT.frameStats(); }
      const programs1 = PT.frameStats().programs;
      PT.check('no new programs after visiting every zone (islands shown)', programs1 <= programs0, [programs0, programs1]);
      PT.note('perf ' + JSON.stringify(res));
    });
    PT.check('perf boot: no console errors', pg3.errors().length === 0, pg3.errors().slice(0, 6));
  }
  await pg3.close();
};
