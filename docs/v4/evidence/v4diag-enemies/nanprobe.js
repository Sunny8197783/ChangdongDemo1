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
  for (const where of ['golem', 'plains']) {
    for (const fix of [false, true]) {
      await p.evaluate(({ where, fix }) => {
        game.freeze(true);
        document.querySelectorAll('body > div').forEach((d) => { if (!d.querySelector('canvas')) d.style.visibility = 'hidden'; });
        game.debug.tp(where === 'plains' ? { x: 0, z: 10 } : where); game.step(30, 1 / 60, false);
        if (fix) game.scene.traverse((o) => { if (o.name === 'vfx-telegraph' && !o.material.userData.fixed) { o.material.fragmentShader = o.material.fragmentShader.replace('exp(-pow((f - uProg) / 0.025, 2.0))', 'exp(-((f - uProg) / 0.025) * ((f - uProg) / 0.025))'); o.material.needsUpdate = true; o.material.userData.fixed = true; } });
        const pp = game.player.entity.object.position, cam = game.camera, V = game.THREE.Vector3;
        const f = new V(); cam.getWorldDirection(f); f.y = 0; f.normalize();
        window.__h = game.vfx.telegraph({ shape: 'circle', pos: pp.clone().addScaledVector(f, 7), r: 2.8, dur: 1, color: 'damage' });
        window.__h2 = game.vfx.telegraph({ shape: 'cone', pos: pp.clone().addScaledVector(f, 4).add(new V(-f.z * 4, 0, f.x * 4)), dir: f, r: 3.2, angle: 114, dur: 1, color: 'void' });
        game.step(42, 1 / 60, false); game.renderNow();
      }, { where, fix });
      await p.screenshot({ path: `${OUT}/nan_${where}_${fix ? 'fixed' : 'orig'}.png`, timeout: 180000 });
      await p.evaluate(() => { window.__h.stop(); window.__h2.stop(); game.renderNow(); });
      await p.screenshot({ path: `${OUT}/nan_${where}_${fix ? 'fixed' : 'orig'}_off.png`, timeout: 180000 });
      console.log(where, fix);
    }
  }
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
