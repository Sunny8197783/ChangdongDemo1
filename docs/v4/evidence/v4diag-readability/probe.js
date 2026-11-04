const { boot } = require('./lib.js');
(async () => {
  const g = await boot('&cls=mage&level=30&skills=preset:endgame_mage');
  const r = await g.p.evaluate(() => {
    const sk = game.skills;
    const names = {}; game.scene.traverse(o => { if (o.isMesh || o.isPoints || o.isSprite) { const n = o.name || o.type; names[n] = (names[n] || 0) + 1; } });
    return { loadout: sk?.loadout || sk?.getLoadout?.() || null, keys: Object.keys(sk || {}).slice(0, 60), pos: game.player.object.position.toArray(), zone: game.world?.zoneAt?.(game.player.object.position) ?? null,
      state: game.state, settings: game.settings?.values, names, bloom: { t: game.bloomPass.threshold, s: game.bloomPass.strength, r: game.bloomPass.radius, en: game.bloomPass.enabled } };
  });
  console.log(JSON.stringify(r, null, 1).slice(0, 6000));
  console.log(g.logs.slice(0, 10).join('\n'));
  await g.close();
})();
