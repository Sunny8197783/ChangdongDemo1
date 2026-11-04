const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1';
const port = 8100 + Math.floor(Math.random() * 900);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(`http://localhost:${port}/?test=1&cls=sword&level=20&quest=done`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 180000 });
  const r = await p.evaluate(() => {
    game.freeze(true); const out = {};
    const T = game.THREE, W = game.world, rc = new T.Raycaster();
    const terr = []; game.scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry?.attributes?.position?.count > 5000 && !o.name.startsWith('grass') ) terr.push(o); });
    for (const where of [{ x: 0, z: 10 }, 'golem', 'elderwood']) {
      game.debug.tp(where); game.step(20, 1 / 60, false);
      const pp = game.player.entity.object.position; const s = [];
      for (const [dx, dz] of [[0, -7], [3, -7], [-3, -5], [0, -10]]) {
        const x = pp.x + dx, z = pp.z + dz;
        rc.set(new T.Vector3(x, 200, z), new T.Vector3(0, -1, 0)); const hit = rc.intersectObjects(terr, false)[0];
        s.push({ gh: +W.getHeight(x, z).toFixed(2), ggh: +(W.getGroundHeight ? W.getGroundHeight(x, z) : NaN).toFixed(2), ray: hit ? +hit.point.y.toFixed(2) : null, obj: hit?.object?.name || hit?.object?.type });
      }
      const h = game.vfx.telegraph({ shape: 'circle', pos: pp.clone().add(new T.Vector3(0, 0, -7)), r: 2.8, dur: 1 });
      game.step(30, 1 / 60, false);
      let vis = 0; game.scene.traverse((o) => { if (o.name === 'vfx-telegraph' && o.visible) vis++; });
      out[JSON.stringify(where)] = { pp: pp.toArray().map((v) => +v.toFixed(2)), s, teleVisible: vis, alive: h.alive };
      h.stop();
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
