const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = '/home/user/changdongdemo1', port = 8100 + Math.floor(Math.random() * 899);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
const CLS = process.argv[2] || 'mage';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(`http://localhost:${port}/?test=1&cls=${CLS}&level=30&skills=preset:endgame_${CLS}`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  const out = await p.evaluate(async () => {
    const g = window.game; g.freeze(true); g.debug.tp('plateau'); g.step(30, 1/60, false);
    const pp = g.player.object.position.clone(); const fwd = new pp.constructor(); g.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const d = g.debug.spawn('dummy', { pos: pp.clone().addScaledVector(fwd, 7), hp: 1e9 });
    const gl = g.renderer.getContext();
    const meas = () => { g.renderNow(); const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let white = 0, lum = 0; for (let i = 0; i < W * H; i++) { const l = 0.3 * px[i*4] + 0.59 * px[i*4+1] + 0.11 * px[i*4+2]; lum += l; if (l > 235) white++; } return [white / (W * H), lum / (W * H)]; };
    const base = meas();
    const rows = [];
    for (const s of ['basic', 'charged', 'q1', 'q2', 'q3', 'q4', 'ult', 'sup']) {
      const id = g.skills.skillForSlot(s); if (!id) continue;
      g.skills.resetCooldowns?.();
      try { g.debug.cast(id, { target: d }); } catch (e) { rows.push({ s, id, err: e.message }); continue; }
      let peakW = 0, peakL = 0, peakP = 0, peakCalls = 0, t50 = null;
      for (let f = 0; f < 90; f += 3) { g.step(3, 1/60, false); const [w, l] = meas(); const st = g.vfx.stats(); if (w > peakW) peakW = w; if (l > peakL) peakL = l; if (st.particles > peakP) peakP = st.particles; peakCalls = Math.max(peakCalls, g.renderer.info.render.calls); }
      rows.push({ slot: s, id, peakWhite: +peakW.toFixed(3), peakLuma: +peakL.toFixed(0), peakParticles: peakP });
      g.step(240, 1/60, false);
    }
    return { base: base.map(x => +x.toFixed(3)), rows };
  });
  console.log(JSON.stringify(out));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
