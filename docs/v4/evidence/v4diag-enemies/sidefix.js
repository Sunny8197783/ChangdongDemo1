const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1', OUT = '/tmp/v4diag-enemies';
const port = 8100 + Math.floor(Math.random() * 900);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.goto(`http://localhost:${port}/?test=1&cls=sword&level=20&quest=done`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 180000 });
  for (const where of ['plains', 'golem', 'elderwood']) {
    for (const fix of [false, true]) {
      await p.evaluate(({ where, fix }) => {
        game.freeze(true);
        document.querySelectorAll('body > div').forEach((d) => { if (!d.querySelector('canvas')) d.style.visibility = 'hidden'; });
        game.scene.traverse((o) => { if (o.name === 'vfx-telegraph') { o.material.side = fix ? game.THREE.DoubleSide : game.THREE.FrontSide; o.material.needsUpdate = true; } });
        game.debug.tp(where === 'plains' ? { x: 0, z: 10 } : where); game.step(30, 1 / 60, false);
        const pp = game.player.entity.object.position, cam = game.camera, V = game.THREE.Vector3;
        const f = new V(); cam.getWorldDirection(f); f.y = 0; f.normalize(); const side = new V(-f.z, 0, f.x);
        window.__hs = [
          game.vfx.telegraph({ shape: 'circle', pos: pp.clone().addScaledVector(f, 8), r: 2.8, dur: 1, color: 'damage' }),
          game.vfx.telegraph({ shape: 'cone', pos: pp.clone().addScaledVector(f, 5).addScaledVector(side, 5), dir: f.clone().negate(), r: 3.2, angle: 114, dur: 1, color: 'void' }),
          game.vfx.telegraph({ shape: 'line', pos: pp.clone().addScaledVector(f, 5).addScaledVector(side, -4), dir: f.clone().negate(), len: 3.6, width: 1.2, dur: 1, color: 'damage' }),
        ];
        game.step(36, 1 / 60, false); game.renderNow();
      }, { where, fix });
      await p.screenshot({ path: `${OUT}/side_${where}_${fix ? 'fixed' : 'orig'}.png`, timeout: 180000 });
      await p.evaluate(() => { for (const h of window.__hs) h.stop(); game.renderNow(); });
      await p.screenshot({ path: `${OUT}/side_${where}_${fix ? 'fixed' : 'orig'}_off.png`, timeout: 180000 });
    }
  }
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
