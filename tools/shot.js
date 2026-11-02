// Usage: node tools/shot.js [--out file.png] [--wait ms] [--eval "js run in page after boot"] [--url query]
// Starts (or reuses) a static server on :8080 and screenshots the game in headless Chromium (SwiftShader WebGL).
// Prints console errors/warnings and game.stubbed. The --eval script may be async and return JSON-serializable data.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(__dirname, '..');
const port = +opt('--port', 8000 + Math.floor(Math.random() * 900));
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(port);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +opt('--w', 1280), height: +opt('--h', 720) } });
  const logs = [];
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${(e.stack||'').split('\n').slice(0,4).join('\n')}`));
  await p.goto(`http://localhost:${port}/?test=1${opt('--url', '')}`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 60000 }).catch(() => logs.push('[harness] game.ready timeout'));
  await p.waitForTimeout(+opt('--wait', 3000));
  const ev = opt('--eval');
  if (ev) { try { const r = await p.evaluate(`(async()=>{${ev}})()`); console.log('EVAL:', JSON.stringify(r)); } catch (e) { console.log('EVAL ERROR:', e.message); } }
  const info = await p.evaluate(() => ({ stubbed: game.stubbed, fps: Math.round(game.fps || 0), state: game.state, entities: game.entities.length, calls: game.renderer.info.render.calls, tris: game.renderer.info.render.triangles }));
  console.log('INFO:', JSON.stringify(info));
  await p.evaluate(() => { game.freeze(true); game.renderNow(); });
  await p.screenshot({ path: opt('--out', 'shot.png'), timeout: 120000 });
  console.log(logs.length ? logs.slice(0, 40).join('\n') : 'no console errors');
  await b.close(); server.close();
})();
