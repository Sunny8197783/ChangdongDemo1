const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1', OUT = '/tmp/v4diag-enemies';
const port = 8100 + Math.floor(Math.random() * 900);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.goto(`http://localhost:${port}/?test=1&cls=sword&level=20&quest=camps&zone=plains`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 120000 });
  for (const [type, st] of [['voidknight', 'slashWind'], ['voidknight', 'slamWind'], ['wolf', 'crouch'], ['bokoblin', 'leap']]) {
    const info = await p.evaluate(({ type, st }) => {
      game.freeze(true);
      for (const o of game.enemies.list.slice()) if (o.object) o.object.visible = false;
      const e = game.debug.spawn(type, { dist: 7 }); e.sight = 40; game.player.entity.invulnerable = true; window.__e = e;
      let ok = false;
      for (let i = 0; i < 1500; i++) { game.step(1, 1 / 60, false); if (e.state === st && e.stateT > 0.3) { ok = true; break; } }
      const pos = e.object.position, pp = game.player.entity.object.position, cam = game.camera;
      const dx = pos.x - pp.x, dz = pos.z - pp.z, L = Math.hypot(dx, dz) || 1;
      cam.position.set(pp.x - dx / L * 6, pp.y + 3.2, pp.z - dz / L * 6); cam.lookAt(pos.x, pos.y + 0.5, pos.z); cam.updateMatrixWorld(true);
      game.renderNow();
      return { ok, state: e.state, d: e.distP };
    }, { type, st });
    await p.screenshot({ path: `${OUT}/tele_${type}_${st}_grass.png` });
    await p.evaluate(() => { game.scene.traverse((o) => { if (o.name && o.name.startsWith('grass_')) o.visible = false; }); game.renderNow(); });
    await p.screenshot({ path: `${OUT}/tele_${type}_${st}_nograss.png` });
    await p.evaluate(() => { game.scene.traverse((o) => { if (o.name && o.name.startsWith('grass_')) o.visible = true; }); const e = window.__e; game.enemies.remove(e); e.alive = false; });
    console.log(type, st, JSON.stringify(info));
  }
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
