const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = '/home/user/changdongdemo1', port = 8100 + Math.floor(Math.random() * 899);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = []; p.on('pageerror', e => logs.push(e.message));
  await p.goto(`http://localhost:${port}/?test=1&cls=mage&level=30&skills=preset:endgame_mage`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const g = window.game; g.freeze(true);
    const pp = g.player.object.position.clone();
    const d = g.debug.spawn('dummy', { hp: 1e9 });
    const fwd = new pp.constructor(0,0,-1);
    const tpos = pp.clone().add(fwd.clone().multiplyScalar(7));
    const lo = g.skills.serialize();
    // telegraph only
    g.vfx.telegraph({ shape: 'circle', pos: tpos, r: 4, dur: 2.0 });
    g.vfx.telegraph({ shape: 'cone', pos: pp.clone().add(fwd.clone().multiplyScalar(2)), dir: fwd, r: 6, angle: 70, dur: 2.0 });
    g.step(30, 1/60, false); g.renderNow();
    const info1 = { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
    return { lo, info1, ids: Object.keys(g.skills.defs || {}).slice(0, 5) };
  });
  await p.screenshot({ path: '/tmp/v4diag-webvfx/a_telegraph_only.png' });
  const r2 = await p.evaluate(async () => {
    const g = window.game; const lo = g.skills.serialize(); delete lo.attuned; lo.basic=g.skills.skillForSlot("basic"); lo.charged=g.skills.skillForSlot("charged"); lo.ult=g.skills.skillForSlot("ult");
    const ids = Object.values(lo).filter(Boolean);
    const cast = [];
    for (const id of ids.slice(0, 6)) { try { g.debug.cast(id); cast.push(id); } catch (e) { cast.push('ERR ' + id); } g.step(6, 1/60, false); }
    g.step(6, 1/60, false); g.renderNow();
    const st = g.vfx.stats ? g.vfx.stats() : null;
    return { cast, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles, st };
  });
  await p.screenshot({ path: '/tmp/v4diag-webvfx/b_telegraph_plus_skills.png' });
  console.log(JSON.stringify({ r, r2, logs: logs.slice(0, 5) }, null, 1));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
