const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1';
const port = 8100 + Math.floor(Math.random() * 899);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(port);
const OUT = '/tmp/v4diag-webcombat';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  p.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  await p.goto(`http://localhost:${port}/?test=1&cls=mage&level=30&skills=preset:endgame_mage&quest=camps&zone=plains`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  const TYPE = process.argv[2] || 'voidknight';
  const r = await p.evaluate(async (TYPE) => {
    const g = window.game; g.freeze(true);
    const e = g.debug.spawn(TYPE, { dist: 6, level: 20 });
    if (!e) return { err: 'nospawn' };
    e.maxHp = e.hp = 1e8; window.__e = e;
    const tl = () => g.vfx?.stats?.().telegraphs || 0;
    let t = 0; const states = new Set();
    for (let i = 0; i < 900; i++) { g.step(1, 1/30, false); t += 1/30; states.add(e.state); if (tl() > 0) break; }
    g.step(6, 1/30, false); g.renderNow();
    return { t: t.toFixed(2), state: e.state, tele: tl(), states: [...states] };
  }, TYPE);
  console.log('A', JSON.stringify(r));
  await p.screenshot({ path: OUT + '/A_' + TYPE + '_clean.png' });
  const r2 = await p.evaluate((TYPE) => {
    const g = window.game; const lo = g.skills?.loadout || {}; const e = window.__e;
    const tl = () => g.vfx?.stats?.().telegraphs || 0;
    for (let i = 0; i < 200 && tl() > 0; i++) g.step(1, 1/30, false);
    let t = 0; for (let i = 0; i < 900; i++) { g.step(1, 1/30, false); t += 1/30; if (tl() > 0) break; }
    const st0 = e.state; e.armor = () => true; e.superArmor = true; e.interrupt = () => {}; e.stagger = () => {};
    const ids = ['q1','q2','q3','q4','ult'].map(k => lo[k]).filter(Boolean); const res = [];
    for (const id of ids) { try { res.push(id + ':' + JSON.stringify(g.debug.cast(id, { target: e, pos: e.object.position.clone() })).slice(0, 40)); } catch (err) { res.push(id + ':ERR'); } g.step(1, 1/30, false); }
    g.step(2, 1/30, false); g.renderNow();
    return { t: t.toFixed(2), st0, state: e.state, hp: e.hp, playerHp: g.player.entity?.hp, tele: tl(), res, ds: g.debug.drawStats?.(), vs: g.vfx?.stats?.() };
  }, TYPE);
  console.log('B', JSON.stringify(r2));
  await p.screenshot({ path: OUT + '/B_' + TYPE + '_with_skills.png' });
  console.log(logs.slice(0, 10).join('\n') || 'no errors');
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
