// harness helpers
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2':'font/woff2' };
exports.open = async (query, { w = 1280, h = 720, wait = true } = {}) => {
  const port = 8100 + Math.floor(Math.random() * 899);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  }).listen(port);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  await p.goto(`http://localhost:${port}/${query}`);
  if (wait) await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 }).catch(() => logs.push('[harness] ready timeout'));
  const H = {
    p, b, logs,
    ev: (fn, arg) => p.evaluate(fn, arg),
    async shot(name) { await p.waitForTimeout(600); await p.evaluate(() => { try { game.renderNow(); } catch (_) {} }); await p.screenshot({ path: `/tmp/v4diag-ux/${name}.png`, timeout: 120000 }); },
    async step(sec, keys = null, mouse = null, chunk = 30) { // fixed dt 1/30
      const n = Math.round(sec * 30);
      await p.evaluate(({ n, keys, mouse, chunk }) => { game.freeze(true); if (keys || mouse) game.input.simulate({ keys: keys || {}, mouse: mouse || {} }); for (let i = 0; i < n; i += chunk) game.step(Math.min(chunk, n - i), 1 / 30, false); }, { n, keys, mouse, chunk });
    },
    async release() { await p.evaluate(() => game.input.simulate(null)); },
    async tap(code, sec = 0.1) { await H.step(sec, { [code]: true }); await H.release(); await H.step(1/30); },
    async click(btn = 0, sec = 0.1) { await H.step(sec, null, { [btn]: true }); await H.release(); await H.step(1/30); },
    state: () => p.evaluate(() => ({ state: game.state, stage: game.story?.stage, obj: game.story?.getObjective?.(), pos: game.player?.position ? [game.player.object.position.x, game.player.object.position.z].map(v => +v.toFixed(1)) : null, hp: game.player?.hp, lvl: game.progression?.level, cls: game.progression?.cls, locks: [...game.input._locks] })),
    async uiText() { return p.evaluate(() => { const out = []; document.querySelectorAll('body *').forEach(e => { if (e.children.length === 0 && e.offsetParent !== null) { const t = e.textContent.trim(); if (t) out.push(t); } }); return out.join(' | ').slice(0, 4000); }); },
    async close() { await b.close(); server.close(); },
  };
  return H;
};
exports.ext = (H) => {
  H.walkTo = async (x, z, r = 2.5, maxSec = 60, sprint = true) => {
    let t = 0;
    while (t < maxSec) {
      const d = await H.p.evaluate(({ x, z }) => { const p = game.player.object.position; const dx = x - p.x, dz = z - p.z; game.player.setLook(Math.atan2(-dx, -dz)); return Math.hypot(dx, dz); }, { x, z });
      if (d < r) break;
      await H.step(0.5, sprint ? { KeyW: true, ShiftLeft: true } : { KeyW: true }); t += 0.5;
    }
    await H.release(); await H.step(0.1);
    return t;
  };
  H.talkUntilDone = async (maxN = 60) => { // advance dialogue with Space until not in dialogue; collects lines
    const lines = [];
    for (let i = 0; i < maxN; i++) {
      const st = await H.p.evaluate(() => ({ s: game.state, t: document.querySelector('.st-dlg.on .st-box')?.innerText || '' }));
      if (st.s !== 'dialogue') break;
      if (st.t && lines[lines.length - 1] !== st.t) lines.push(st.t.replace(/\n+/g, ' / '));
      await H.step(1.0, { KeyF: true }); await H.release(); await H.step(0.3);
    }
    return lines;
  };
};
exports.ext2 = (H) => {
  H.ents = (filter = '') => H.p.evaluate((f) => game.entities.filter(e => e.alive !== false && e.hp > 0 && (!f || (e.name || e.type || '').includes(f))).map(e => { const p = (e.object || e.mesh || e.group || e.root)?.position || e.position; return { id: e.id, type: e.type, name: e.name, hp: Math.round(e.hp), maxHp: e.maxHp, p: p ? [+p.x.toFixed(1), +p.z.toFixed(1)] : null, d: p ? +Math.hypot(p.x - game.player.object.position.x, p.z - game.player.object.position.z).toFixed(1) : null }; }).sort((a, b) => a.d - b.d).slice(0, 12), filter);
  H.face = (x, z) => H.p.evaluate(({ x, z }) => { const p = game.player.object.position; game.player.setLook(Math.atan2(-(x - p.x), -(z - p.z)), -0.08); }, { x, z });
};
