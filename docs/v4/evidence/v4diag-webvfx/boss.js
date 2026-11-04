const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = '/home/user/changdongdemo1', port = 8100 + Math.floor(Math.random() * 899);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
const BOSS = process.argv[2] || 'hydra', Q = process.argv[3] || 'final';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const logs = []; p.on('pageerror', e => logs.push(e.message));
  await p.goto(`http://localhost:${port}/?test=1&cls=mage&level=30&skills=preset:endgame_mage&quest=${Q}&boss=${BOSS}`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 });
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => { const g = window.game; g.freeze(true); g.player.entity && (g.player.entity.invulnerable = true);
    let t = 0, found = null; const seen = [];
    for (let i = 0; i < 900 && !found; i++) { g.step(1, 1/60, false); t++; const n = g.vfx.stats().telegraphs; if (n > 0) { const ms = []; g.scene.traverse(o => { if (o.name === 'vfx-telegraph' && o.visible) ms.push(o); }); if (ms.length) { g.step(12, 1/60, false); found = { frame: t, n }; } } }
    return { found, state: g.state, boss: g.enemies?.boss?.id || g.enemies?.boss?.name || null };
  });
  console.log(JSON.stringify(r));
  await p.evaluate(() => window.game.renderNow());
  await p.screenshot({ path: `/tmp/v4diag-webvfx/boss_${BOSS}_asis.png` });
  await p.evaluate(() => { const g = window.game; g.scene.traverse(o => { if (o.name === 'vfx-telegraph') { o.material.side = 2; o.material.needsUpdate = true; } }); g.renderNow(); });
  await p.screenshot({ path: `/tmp/v4diag-webvfx/boss_${BOSS}_doubleside.png` });
  console.log(logs.slice(0, 3).join('\n'));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
