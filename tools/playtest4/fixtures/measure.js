// Copied from docs/v4/evidence/v4diag-webvfx/measure.js (PLAN v4 header) with fixed paths: repo root = this file's ../../.., output = tools/playtest4/out/webvfx/.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', '..', '..'), port = 8100 + Math.floor(Math.random() * 899);
const CLS = process.argv[2] || 'mage';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
const OUTDIR = path.join(__dirname, '..', 'out', 'webvfx'); fs.mkdirSync(OUTDIR, { recursive: true });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const logs = []; p.on('pageerror', e => logs.push(e.message));
  await p.goto(`http://localhost:${port}/?test=1&cls=${CLS}&level=30&skills=preset:endgame_${CLS}`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  const setup = await p.evaluate(() => {
    const g = window.game; g.freeze(true);
    g.debug.tp('plateau'); g.step(20, 1/60, false);
    const pp = g.player.object.position.clone();
    const fwd = new pp.constructor(); g.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const tpos = pp.clone().addScaledVector(fwd, 7);
    window.__d = g.debug.spawn('dummy', { pos: tpos.clone(), hp: 1e9 });
    window.__tp = tpos; window.__fwd = fwd;
    window.__grab = () => { g.renderNow(); const gl = g.renderer.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return { px, w, h }; };
    window.__tele = (on) => g.scene.traverse((o) => { if (o.name === 'vfx-telegraph' && o.userData.__was !== undefined) o.visible = on && o.userData.__was; });
    window.__mark = () => g.scene.traverse((o) => { if (o.name === 'vfx-telegraph') o.userData.__was = o.visible; });
    return { pp: pp.toArray(), tpos: tpos.toArray() };
  });
  // telegraphs: circle at the dummy, a cone from the dummy toward the player, a line
  await p.evaluate(() => { const g = window.game; const tp = window.__tp, f = window.__fwd;
    g.vfx.telegraph({ shape: 'circle', pos: tp, r: 3.5, dur: 30 });
    g.vfx.telegraph({ shape: 'line', pos: tp.clone().addScaledVector(f, -1).add(new tp.constructor(-3,0,0)), dir: f.clone().negate(), len: 6, width: 1.6, dur: 30 });
    g.step(40, 1/60, false); window.__mark(); const vis=[]; g.scene.traverse(o=>{ if(o.name==="vfx-telegraph") vis.push(o.visible); }); window.__vis=vis; });
  console.log("VIS", JSON.stringify(await p.evaluate(()=>({vis:window.__vis, act:window.game.vfx.stats().telegraphs}))));
  const m0 = await p.evaluate(() => {
    const A = window.__grab(); window.__tele(false); const B = window.__grab(); window.__tele(true);
    const mask = new Uint8Array(A.w * A.h); let n = 0, sum = 0;
    for (let i = 0; i < mask.length; i++) { const d = Math.abs(A.px[i*4]-B.px[i*4]) + Math.abs(A.px[i*4+1]-B.px[i*4+1]) + Math.abs(A.px[i*4+2]-B.px[i*4+2]); if (d > 24) { mask[i] = 1; n++; sum += d; } }
    window.__mask = mask; return { maskPx: n, maskFrac: +(n / mask.length).toFixed(4), meanDelta: +(sum / Math.max(1, n)).toFixed(1) };
  });
  await p.screenshot({ path: `${OUTDIR}/${CLS}_1_telegraph_only.png` });
  const casts = await p.evaluate(() => { const g = window.game; const out = [];
    const slots = ['basic', 'charged', 'q1', 'q2', 'q3', 'q4', 'ult'];
    for (const s of slots) { const id = g.skills.skillForSlot(s); if (!id) continue; try { g.debug.cast(id, { target: window.__d }); out.push(id); } catch (e) { out.push('ERR:' + id); } g.step(9, 1/60, false); }
    return out; });
  const results = [];
  for (let k = 0; k < 4; k++) {
    const r = await p.evaluate(() => {
      const g = window.game; const A = window.__grab(); window.__tele(false); const B = window.__grab(); window.__tele(true);
      const mask = window.__mask; let n = 0, sum = 0, washed = 0, fxPx = 0;
      // FX coverage: compare B to the "nothing" baseline isn't available; estimate bright/additive coverage = pixels with luma > 235
      for (let i = 0; i < mask.length; i++) { const l = 0.3*A.px[i*4] + 0.59*A.px[i*4+1] + 0.11*A.px[i*4+2]; if (l > 235) fxPx++;
        if (!mask[i]) continue; const d = Math.abs(A.px[i*4]-B.px[i*4]) + Math.abs(A.px[i*4+1]-B.px[i*4+1]) + Math.abs(A.px[i*4+2]-B.px[i*4+2]); n++; sum += d; if (d <= 24) washed++; }
      const st = g.vfx.stats(); const info = g.renderer.info.render;
      return { meanDeltaInMask: +(sum / Math.max(1, n)).toFixed(1), maskPxLost: +(washed / Math.max(1, n)).toFixed(3), nearWhiteFrac: +(fxPx / mask.length).toFixed(3), particles: st.particles, additive: st.additive, calls: info.calls, tris: info.triangles };
    });
    results.push(r);
    if (k === 0) await p.screenshot({ path: `${OUTDIR}/${CLS}_2_telegraph_plus_fx.png` });
    await p.evaluate(() => window.game.step(12, 1/60, false));
  }
  console.log(JSON.stringify({ CLS, setup, m0, casts, results, logs: logs.slice(0, 5) }));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
