const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = '/home/user/changdongdemo1';
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
async function boot(params, { w = 960, h = 540 } = {}) {
  const port = 8100 + Math.floor(Math.random() * 900);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(port);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  await p.goto(`http://localhost:${port}/?test=1${params}`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 });
  await p.evaluate(() => game.freeze(true));
  return { p, b, server, logs, close: async () => { await b.close(); server.close(); } };
}
module.exports = { boot };
