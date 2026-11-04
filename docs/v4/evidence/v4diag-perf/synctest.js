const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1'; const port = 8100 + Math.floor(Math.random() * 899);
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(res); }).listen(port);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://localhost:${port}/?test=1&cls=mage&skills=preset:endgame_mage&level=30`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 180000 });
  const r = await p.evaluate(() => {
    const g = game; g.freeze(true); g.debug.tp({ x: -6, z: 128 }); g.step(20, 1/60, false);
    const gl = g.renderer.getContext(); const px = new Uint8Array(4);
    const sync = () => { const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); };
    const out = {};
    for (const mode of ['none', 'finish', 'read', 'read']) {
      const ts = [];
      for (let i = 0; i < 8; i++) { const t = performance.now(); g.step(1, 1/60, true); if (mode === 'finish') gl.finish(); if (mode === 'read') sync(); ts.push(+(performance.now() - t).toFixed(1)); }
      out[mode + ts.length + Math.random().toFixed(2)] = ts;
    }
    // composer only
    const ts = []; for (let i = 0; i < 6; i++) { sync(); const t = performance.now(); g.composer.render(0); sync(); ts.push(+(performance.now() - t).toFixed(1)); } out.composerOnly = ts;
    const ts2 = []; for (let i = 0; i < 6; i++) { sync(); const t = performance.now(); sync(); ts2.push(+(performance.now() - t).toFixed(1)); } out.syncOnly = ts2;
    return out;
  });
  console.log(JSON.stringify(r)); await b.close(); server.close();
})();
