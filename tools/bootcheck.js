// Usage: node tools/bootcheck.js  — boots several URL configs (no screenshots), prints stubbed + console errors.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..');
const port = 8000 + Math.floor(Math.random() * 900);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(port);
const configs = process.argv.slice(2).length ? process.argv.slice(2) : ['', '&cls=sword&path=all', '&cls=sword&path=master&el=fire', '&path=master&el=ice', '&cls=none', '&intro=1'];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const c of configs) {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const logs = [];
    p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
    p.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
    await p.goto(`http://localhost:${port}/?test=1${c}`);
    await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 }).catch(() => logs.push('[harness] ready timeout'));
    const info = await p.evaluate(() => { game.freeze(true); game.step(240, 1 / 60); game.step(1, 1 / 60, true);
      return { stubbed: game.stubbed, state: game.state, cls: game.progression.cls, stage: game.story?.stage, calls: game.renderer.info.render.calls, tris: game.renderer.info.render.triangles }; }).catch(e => ({ err: e.message }));
    console.log(`== ${c || '(default)'}: ${JSON.stringify(info)}`);
    console.log(logs.length ? logs.slice(0, 30).join('\n') : '   no console errors');
    await p.close();
  }
  await b.close(); server.close();
})();
