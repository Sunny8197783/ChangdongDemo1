const { boot } = require('./lib.js');
const cls = process.argv[2] || 'mage', want = +(process.argv[3] || 2);
(async () => {
  const g = await boot(`&cls=${cls}&level=30&skills=preset:endgame_${cls}`, { w: 1280, h: 720 });
  const P = g.p; let got = 0;
  await P.evaluate(() => {
    const G = game, T = G.THREE, pl = G.player;
    const W = G.world, gh = (x, z) => (W.getGroundHeight ? W.getGroundHeight(x, z) : W.getHeight(x, z));
    pl.object.position.set(-19.98, gh(-19.98, 45.81) + 0.05, 45.81); pl.setLook(0, -0.25); G.step(10, 1 / 30);
    const pp = pl.object.position;
    const roster = [['bokoblin', -2, -6], ['bokoblin', 2.5, -6.5], ['voidknight', 0, -8], ['wolf', -4, -8], ['wolf', 4, -8], ['lizard', -1, -10], ['shaman', 3, -12]];
    window.__foes = roster.map(([t, dx, dz]) => G.debug.spawn(t, { pos: new T.Vector3(pp.x + dx, pp.y, pp.z + dz) })).filter(Boolean);
    for (const e of window.__foes) { e.hp = e.maxHp = 1e6; e.isBoss = true; }
    window.__st = { castT: 0, ci: 0, ultT: 3, t: 0, f: 0 };
    window.__tick = (cls) => {
      const S = window.__st, lo = G.skills.loadout, slots = ['q1', 'q2', 'q3', 'q4'].map((k) => lo[k]).filter(Boolean);
      pl.entity.hp = pl.entity.maxHp = 1e6; for (const e of window.__foes) if (e.hp < 1e5) e.hp = 1e6;
      let cx = 0, cz = 0, k = 0; for (const e of window.__foes) if (e.alive) { cx += e.object.position.x; cz += e.object.position.z; k++; }
      if (k) pl.setLook(Math.atan2(-(cx / k - pp.x), -(cz / k - pp.z)), -0.25);
      S.castT -= 1 / 30; S.ultT -= 1 / 30;
      if (S.castT <= 0) { S.castT = 0.6; try { G.debug.cast(slots[S.ci++ % slots.length]); } catch (_) {} }
      if (S.ultT <= 0 && lo.ult) { S.ultT = 7; try { G.debug.cast(lo.ult); } catch (_) {} }
      if (cls !== 'mage') G.input.simulate(S.f % 6 < 3 ? { mouse: { 0: true } } : null);
      G.step(1, 1 / 30); S.t += 1 / 30; S.f++;
      const tele = G.scene.children.filter((o) => o.name === 'vfx-telegraph' && o.visible);
      return { t: S.t, tele: tele.length };
    };
  });
  let lastShot = -10;
  for (let i = 0; i < 600 && got < want; i++) {
    const s = await P.evaluate((c) => window.__tick(c), cls);
    if (s.t > 2.5 && s.tele > 0 && s.t - lastShot > 2) {
      lastShot = s.t;
      await P.evaluate(() => { game.renderNow(); });
      await P.screenshot({ path: `/tmp/v4diag-readability/human_${cls}_${got}_asShipped.png` });
      await P.evaluate(() => { for (const o of game.scene.children) if (o.name === 'vfx-telegraph') o.material.side = game.THREE.DoubleSide; game.renderNow(); });
      await P.screenshot({ path: `/tmp/v4diag-readability/human_${cls}_${got}_teleCullFixed.png` });
      await P.evaluate(() => { for (const o of game.scene.children) if (o.name === 'vfx-telegraph') o.material.side = game.THREE.FrontSide; });
      console.log('shot', got, s.t.toFixed(2)); got++;
    }
  }
  await g.close();
})();
