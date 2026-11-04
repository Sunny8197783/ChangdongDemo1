const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = '/home/user/changdongdemo1', port = 8100 + Math.floor(Math.random() * 899);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.goto(`http://localhost:${port}/?test=1&cls=mage&level=30`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 });
  await p.waitForTimeout(1000);
  const r = await p.evaluate(() => {
    const g = window.game; g.freeze(true); g.debug.tp('plateau'); g.step(20, 1/60, false);
    const pp = g.player.object.position.clone();
    const fwd = new pp.constructor(); g.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const tp = pp.clone().addScaledVector(fwd, 6);
    const h = g.vfx.telegraph({ shape: 'circle', pos: tp, r: 3, dur: 3 });
    g.step(60, 1/60, false); g.renderNow();
    let m = null; g.scene.traverse(o => { if (o.name === 'vfx-telegraph' && o.visible) m = o; });
    const pos = m.geometry.attributes.position.array;
    const u = m.material.uniforms;
    return { alive: h.alive, prog: h.progress, tp: tp.toArray(), v0: [pos[0], pos[1], pos[2]], vmid: [pos[pos.length/2|0], pos[(pos.length/2|0)+1], pos[(pos.length/2|0)+2]],
      uAlpha: u.uAlpha.value, uProg: u.uProg.value, layers: m.layers.mask, camLayers: g.camera.layers.mask, parent: m.parent?.type, inScene: !!m.parent,
      ground: g.world.getHeight(tp.x, tp.z), transparent: m.material.transparent, matVisible: m.material.visible, renderNowSrc: String(g.renderNow).slice(0, 300) };
  });
  console.log(JSON.stringify(r, null, 1));
  await p.screenshot({ path: '/tmp/v4diag-webvfx/tele_frozen.png' });
  await p.evaluate(() => { const g = window.game; g.freeze(false); });
  await p.evaluate(() => { const g = window.game; const pp = g.player.object.position.clone(); const fwd = new pp.constructor(); g.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    g.vfx.telegraph({ shape: 'circle', pos: pp.clone().addScaledVector(fwd, 6), r: 3, dur: 4 }); });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: '/tmp/v4diag-webvfx/tele_live.png' });
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
