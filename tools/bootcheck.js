// Usage: node tools/bootcheck.js [config …]   (config = extra URL params, e.g. '&cls=paladin')
// Boots URL configs headless (no screenshots) and prints state, stubbed modules, draw calls / triangles / programs and
// console errors. Default configs (CONTRACT §21): one per class with its starter preset, the final boss, the legacy
// configs, and three boot-safety configs that temporarily rename src/skills/, src/enemies/bosses/ and src/tells.js away
// (v4 §7.9: without src/tells.js the game boots on the core tells stub and enemies still telegraph through the fixed
// vfx.telegraph decal; the same check also runs with &stub=tells).
// Exit code 1 if a config does not reach 'playing' or throws an uncaught page error.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..');
const port = 8100 + Math.floor(Math.random() * 900);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
}).listen(port);

const CLASSES = ['mage', 'sword', 'ranger', 'paladin', 'spiritcaller', 'shadowblade'];
const SAFETY = { '@noSkills': 'src/skills', '@noBosses': 'src/enemies/bosses', '@noTells': 'src/tells.js' };
const SAFETY_URL = { '@noSkills': '&cls=paladin', '@noBosses': '&quest=final&boss=nidhoggra', '@noTells': '&cls=mage&skills=preset:starter_mage' };
const defaults = [
  ...CLASSES.map((c) => `&cls=${c}&skills=preset:starter_${c}`),
  '&quest=final&boss=nidhoggra',
  '', '&cls=sword&path=all', '&cls=sword&path=master&el=fire', '&path=master&el=ice', '&cls=none', '&intro=1',
  '@noSkills', '@noBosses', '@noTells', '&cls=mage&skills=preset:starter_mage&stub=tells',
];
const TELLS_CHECK = /@noTells|stub=tells/;
const configs = process.argv.slice(2).length ? process.argv.slice(2) : defaults;

// renamed directories are always restored, even on Ctrl-C
const renamed = [];
function restore() { while (renamed.length) { const [from, to] = renamed.pop(); try { fs.renameSync(to, from); } catch (e) { console.error('RESTORE FAILED', from, e.message); } } }
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('exit', restore);

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = 0;
  for (const c of configs) {
    let url = c, label = c || '(default)';
    if (SAFETY[c]) {
      const dir = path.join(root, SAFETY[c]), away = dir + '.__bootcheck_away';
      if (fs.existsSync(dir)) { fs.renameSync(dir, away); renamed.push([dir, away]); label = `${c} (${SAFETY[c]}/ renamed away)`; }
      else label = `${c} (${SAFETY[c]}/ not present)`;
      url = SAFETY_URL[c];
    }
    const p = await b.newPage({ viewport: { width: 640, height: 360 } });
    const logs = [], pageErrors = [];
    p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
    p.on('pageerror', (e) => { pageErrors.push(e.message); logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`); });
    await p.goto(`http://localhost:${port}/?test=1${url}`);
    await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 120000 }).catch(() => logs.push('[harness] ready timeout'));
    const info = await p.evaluate(() => {
      game.freeze(true); game.step(240, 1 / 60);
      const ds = game.debug?.drawStats?.() || {};
      return { state: game.state, stubbed: game.stubbed, cls: game.progression.cls, level: game.progression.level, stage: game.story?.stage,
        boss: game.enemies?.boss?.bossId || game.enemies?.boss?.id || game.enemies?.boss?.type || null, calls: ds.calls, tris: ds.tris, programs: ds.programs };
    }).catch((e) => ({ err: e.message }));
    // tells stub: an enemy attack still shows the fixed v3 decal (vfx.telegraph) and the attack lands without errors
    if (TELLS_CHECK.test(c) && !info.err) {
      info.tells = await p.evaluate(() => {
        const g = game, T = g.THREE, pp = g.player.object.position;
        // outside the village (a safe haven: no aggro there)
        const W = g.world, gh = (x, z) => (W.getGroundHeight ? W.getGroundHeight(x, z) : W.getHeight ? W.getHeight(x, z) : 0);
        pp.set(-20, gh(-20, 45) + 0.05, 45); g.step(30, 1 / 60);
        const out = { stub: !!g.tells?.isStub, decals: 0, tellStarts: 0, enemyAttacks: 0 };
        const offs = [g.events.on('tellStart', () => out.tellStarts++), g.events.on('enemyAttack', () => out.enemyAttacks++)];
        const spawned = [];
        for (const [type, dx, dz] of [['bokoblin', 2.5, 0.5], ['voidknight', -3, 2], ['shaman', 1, 6]]) {
          try { const e = g.enemies?.spawn?.(type, new T.Vector3(pp.x + dx, gh(pp.x + dx, pp.z + dz), pp.z + dz)); if (e) spawned.push(e); } catch (err) { out.spawnErr = err.message; }
        }
        const countDecals = () => {
          let n = 0; g.scene.traverse((o) => { if (o.visible && /telegraph/i.test(o.name || '')) n++; });
          if (g.vfx?.debug?.telegraphs) n = Math.max(n, g.vfx.debug.telegraphs()?.count || 0);
          return Math.max(n, g.vfx?.stats?.()?.telegraphs || 0);
        };
        let seen = 0;
        for (let i = 0; i < 40; i++) {
          g.step(6, 1 / 60);
          seen = Math.max(seen, countDecals());
          if (g.player.hp < g.player.maxHp * 0.5) { g.player.hp = g.player.maxHp; if (g.player.entity) g.player.entity.hp = g.player.maxHp; }
        }
        // the stub's own path: tells.attack(e, spec with a shape) draws the fixed v3 decal through vfx.telegraph
        let e0 = null;
        try { e0 = g.enemies?.spawn?.('bokoblin', new T.Vector3(pp.x + 14, gh(pp.x + 14, pp.z - 10), pp.z - 10)); } catch (_) { e0 = null; }
        e0 = e0 || spawned[0];
        let direct = 0;
        if (e0 && g.tells?.attack) {
          const h = g.tells.attack(e0, { id: 'bootcheck.slam', tell: 'danger', cls: 'mobHeavy', windup: 0.9, shape: { kind: 'circle', r: 3, pos: e0.object.position.clone() } });
          g.step(10, 1 / 60); direct = countDecals(); h?.stop?.();
        }
        out.decals = seen; out.direct = direct; out.spawned = spawned.length;
        for (const f of offs) if (typeof f === 'function') f();
        return out;
      }).catch((err) => ({ err: err.message }));
    }
    const okStates = /intro=1|cls=none/.test(url) ? ['playing', 'cutscene', 'dialogue'] : ['playing'];
    let ok = okStates.includes(info.state) && !pageErrors.length;
    if (info.tells && (info.tells.err || !info.tells.stub || !(info.tells.direct > 0) || !(info.tells.enemyAttacks + info.tells.tellStarts > 0))) ok = false;
    if (!ok) failed++;
    console.log(`== ${label}: ${JSON.stringify(info)}${ok ? '' : '  <-- NOT OK'}`);
    const errs = logs.filter((l) => !l.startsWith('[warning]'));
    console.log(errs.length ? errs.slice(0, 20).join('\n') : '   no console errors');
    await p.close();
    restore();
  }
  await b.close(); server.close();
  process.exit(failed ? 1 : 0);
})();
