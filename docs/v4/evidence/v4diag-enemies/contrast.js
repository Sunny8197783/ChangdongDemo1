// Telegraph decal visibility: real gameplay camera, 4 surfaces, circle r=2.8 at 7 m, progress 0.3 / 0.8 → with / without / mask shots.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1', OUT = '/tmp/v4diag-enemies/contrast';
fs.mkdirSync(OUT, { recursive: true });
const port = 8100 + Math.floor(Math.random() * 900);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.goto(`http://localhost:${port}/?test=1&cls=sword&level=20&quest=done`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 180000 });
  await p.evaluate(() => { game.freeze(true); document.querySelectorAll('body > div').forEach((d) => { if (d.id !== 'app' && !d.querySelector('canvas')) d.style.visibility = 'hidden'; }); });
  const spots = [['plains', { x: 0, z: 10 }], ['ruins', 'golem'], ['mirwen', { x: -66, z: -60 }], ['elderwood', 'elderwood']];
  const res = {};
  for (const [name, where] of spots) {
    for (const [shape, prog] of [['circle', 0.3], ['circle', 0.8], ['line', 0.5], ['cone', 0.5]]) {
      const key = `${name}_${shape}_${prog}`;
      await p.evaluate(({ where, shape, prog }) => {
        for (const o of game.enemies.list.slice()) if (o.object) o.object.visible = false;
        game.debug.tp(where);
        game.step(40, 1 / 60, false);
        const pp = game.player.entity.object.position, cam = game.camera, V = game.THREE.Vector3;
        const f = new V(); cam.getWorldDirection(f); f.y = 0; f.normalize();
        const pos = pp.clone().addScaledVector(f, shape === 'line' ? 4 : 7);
        const dur = 1.0;
        window.__h = game.vfx.telegraph({ shape, pos, dir: f.clone().negate(), r: shape === 'cone' ? 3.2 : 2.8, angle: 114, len: 3.6, width: 1.2, dur, color: shape === 'cone' ? 'void' : 'damage' });
        // advance to the wanted progress without moving the camera
        const n = Math.round(prog * dur * 60);
        game.step(n, 1 / 60, false);
        window.__tm = []; game.scene.traverse((o) => { if (o.name === 'vfx-telegraph' && o.visible) window.__tm.push(o); });
        game.renderNow();
      }, { where, shape, prog });
      await p.screenshot({ path: `${OUT}/${key}_with.png`, timeout: 180000 });
      await p.evaluate(() => { for (const m of window.__tm) m.visible = false; game.renderNow(); });
      await p.screenshot({ path: `${OUT}/${key}_without.png`, timeout: 180000 });
      await p.evaluate(() => {
        const M = new game.THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false, fog: false });
        const hid = []; game.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.visible) { o.visible = false; hid.push(o); } });
        for (const m of window.__tm) { m.visible = true; m.userData._mat = m.material; m.material = M; }
        const bp = game.bloomPass; const be = bp ? bp.enabled : null; if (bp) bp.enabled = false;
        game.renderNow();
        window.__restore = () => { for (const m of window.__tm) { m.material = m.userData._mat; m.visible = false; } for (const o of hid) o.visible = true; if (bp) bp.enabled = be; window.__h?.stop?.(); };
      });
      await p.screenshot({ path: `${OUT}/${key}_mask.png`, timeout: 180000 });
      await p.evaluate(() => window.__restore());
      res[key] = true; console.log(key);
    }
  }
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
