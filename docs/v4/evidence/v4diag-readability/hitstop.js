const { boot } = require('./lib.js');
const cls = process.argv[2] || 'sword';
(async () => {
  const g = await boot(`&cls=${cls}&level=30&skills=preset:endgame_${cls}`);
  const r = await g.p.evaluate(({ cls }) => {
    const G = game, T = G.THREE, pl = G.player, pe = pl.entity;
    const W = G.world, gh = (x, z) => (W.getGroundHeight ? W.getGroundHeight(x, z) : W.getHeight(x, z));
    pl.object.position.set(-19.98, gh(-19.98, 45.81) + 0.05, 45.81); pl.setLook(0, -0.25); G.step(10, 1 / 60);
    const pp = pl.object.position;
    const roster = [['bokoblin', -2, -6], ['bokoblin', 2.5, -6.5], ['voidknight', 0, -8], ['wolf', -4, -8], ['wolf', 4, -8], ['lizard', -1, -10], ['shaman', 3, -12]];
    const foes = roster.map(([t, dx, dz]) => G.debug.spawn(t, { pos: new T.Vector3(pp.x + dx, pp.y, pp.z + dz) })).filter(Boolean);
    for (const e of foes) e.hp = e.maxHp = 1e6;
    const lo = G.skills.loadout; const slots = ['q1', 'q2', 'q3', 'q4'].map((k) => lo[k]).filter(Boolean);
    let hsF = 0, slowF = 0, n = 0, gameT0 = G.time, castT = 0, ci = 0, ultT = 3; const ids = {};
    const hsCalls = []; const orig = G.hitstop.bind(G); G.hitstop = (s) => { hsCalls.push(s); return orig(s); };
    for (let f = 0; f < 600; f++) {
      pe.hp = pe.maxHp = 1e6; for (const e of foes) if (e.hp < 1e5) e.hp = 1e6;
      let cx = 0, cz = 0, k = 0; for (const e of foes) if (e.alive) { cx += e.object.position.x; cz += e.object.position.z; k++; }
      if (k) pl.setLook(Math.atan2(-(cx / k - pp.x), -(cz / k - pp.z)), -0.25);
      castT -= 1 / 60; ultT -= 1 / 60;
      if (castT <= 0) { castT = 0.7; try { G.debug.cast(slots[ci++ % slots.length]); } catch (_) {} }
      if (ultT <= 0 && lo.ult) { ultT = 7; try { G.debug.cast(lo.ult); } catch (_) {} }
      if (cls !== 'mage' && cls !== 'ranger' && cls !== 'spiritcaller') G.input.simulate(f % 12 < 6 ? { mouse: { 0: true } } : null);
      const inHs = G._hitstop > 0 || G._hitstopFrames > 0;
      G.step(1, 1 / 60);
      n++; if (inHs) hsF++;
      const ts = G.timeScale.value(); if (ts < 0.99) { slowF++; for (const a of G.timeScale.active()) ids[a.id] = (ids[a.id] || 0) + 1; }
    }
    G.input.simulate(null);
    const hist = {}; for (const s of hsCalls) { const k = s.toFixed(2); hist[k] = (hist[k] || 0) + 1; }
    return { frames: n, hitstopFrac: +(hsF / n).toFixed(3), slowFrac: +(slowF / n).toFixed(3), slowIds: ids, gameSecondsPer10Real: +(G.time - gameT0).toFixed(2), hitstopCalls: hsCalls.length, hist };
  }, { cls });
  console.log(cls, JSON.stringify(r)); await g.close();
})();
