// node /tmp/v4diag-vfx/cap.js <cls> <label> <skillId,skillId,...>
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = '/home/user/changdongdemo1';
const [cls, label, list] = process.argv.slice(2);
const ids = list.split(',');
const OUT = '/tmp/v4diag-vfx/tele';
fs.mkdirSync(OUT, { recursive: true });
const TIMES = (process.env.TIMES || '0.06,0.18,0.35,0.6,1.0,1.6').split(',').map(Number);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const port = 8100 + Math.floor(Math.random() * 900);
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(port);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const logs = [];
  p.on('pageerror', e => logs.push('[pageerror] ' + e.message));
  p.on('console', m => { if (m.type() === 'error') logs.push('[err] ' + m.text()); });
  await p.goto(`http://localhost:${port}/?test=1&cls=${cls}&level=40&skills=all&unlock=all&points=inf`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 });
  await p.evaluate(() => {
    const g = game; g.freeze(true);
    // hide HUD so screenshots show the scene only
    const st = document.createElement('style'); st.textContent = '#ui, .aw-hud, #hud { opacity: 0.0 !important; }'; document.head.appendChild(st);
    g.step(30, 1 / 60);
    const pp = g.player.object.position; window.__home = pp.clone();
    const T = g.THREE; const W = g.world;
    window.__dummies = [];
    for (const [dx, dz] of [[0, -7], [-2.5, -6], [2.5, -6], [0, -10]]) {
      const x = pp.x + dx, z = pp.z + dz; const y = W.getGroundHeight ? W.getGroundHeight(x, z) : W.getHeight(x, z);
      const d = g.debug.spawnDummy(new T.Vector3(x, y, z), { facing: 0 }); if (d) { d.xpValue = 0; d.hp = d.maxHp = 1e6; window.__dummies.push(d); }
    }
    g.step(10, 1 / 60);
    g.scene.traverse((o) => { if (o.name === 'vfx-telegraph') { o.material.side = T.DoubleSide; o.material.needsUpdate = true; } });
  });
  const results = [];
  for (const id of ids) {
    const r = await p.evaluate(async (id) => {
      const g = game, pp = g.player.object.position, h = window.__home;
      pp.copy(h); g.player.setLook?.(0, -0.12);
      for (const d of window.__dummies) { d.hp = d.maxHp; d.alive = true; if (d.statuses) for (const k in d.statuses) delete d.statuses[k]; }
      g.skills.resetCooldowns?.(); if (g.state !== 'playing') g.setState?.('playing');
      g.step(420, 1 / 60); // let previous effects die
      pp.copy(h); g.player.setLook?.(0, -0.12); g.step(4, 1 / 60);
      const def = g.skills.defs.get(id);
      if (!def) return { id, err: 'nodef' };
      const d0 = window.__dummies[0];
      const o = pp.clone(); o.y += 1.5; const t = d0.object.position.clone(); t.y += 1;
      const aim = { origin: o, dir: t.clone().sub(o).normalize(), point: d0.object.position.clone(), target: d0 };
      return { id, slot: def.slot, arch: def.archetype || null };
    }, id);
    if (r.err) { results.push(r); continue; }
    // baseline
    await p.evaluate(() => { const c = game.camera; window.__cp = c.position.clone(); window.__cq = c.quaternion.clone(); game.renderNow(); });
    await p.screenshot({ path: `${OUT}/${label}_${r.id}_base.png` });
    // baseline with telegraph only
    await p.evaluate(() => { const g = game; const d0 = window.__dummies[0];
      window.__tg = g.vfx.telegraph({ shape: 'circle', pos: d0.object.position.clone(), r: 3, dur: 3, color: 'damage' });
      g.step(30, 1/60); const c = g.camera; c.position.copy(window.__cp); c.quaternion.copy(window.__cq); c.updateMatrixWorld();
      g.scene.traverse((o) => { if (o.name === 'vfx-telegraph') o.userData.__tv = o.visible; }); g.renderNow(); });
    await p.screenshot({ path: `${OUT}/${r.id}_T0_on.png` });
    await p.evaluate(() => { game.scene.traverse((o) => { if (o.name === 'vfx-telegraph') o.visible = false; }); game.renderNow(); game.scene.traverse((o) => { if (o.name === 'vfx-telegraph') o.visible = o.userData.__tv; }); });
    await p.screenshot({ path: `${OUT}/${r.id}_T0_off.png` });
    const ok = await p.evaluate((id) => {
      const g = game, pp = g.player.object.position;
      const d0 = window.__dummies[0];
      const o = pp.clone(); o.y += 1.5; const t = d0.object.position.clone(); t.y += 1;
      const aim = { origin: o, dir: t.clone().sub(o).normalize(), point: d0.object.position.clone(), target: d0 };
      try { return g.skills.cast(id, { free: true, aim, charge: 1 }); } catch (e) { return 'threw ' + e.message; }
    }, id);
    r.ok = ok;
    let tPrev = 0;
    for (const tt of [0.2, 0.45, 0.9]) {
      const n = Math.max(1, Math.round((tt - tPrev) * 60)); tPrev = tt;
      await p.evaluate((n) => { const g = game; g.step(n, 1 / 60); const c = g.camera; c.position.copy(window.__cp); c.quaternion.copy(window.__cq); c.updateMatrixWorld();
        g.scene.traverse((o) => { if (o.name === 'vfx-telegraph') o.userData.__tv = o.visible; }); g.renderNow(); }, n);
      await p.screenshot({ path: `${OUT}/${r.id}_${tt}_on.png` });
      await p.evaluate(() => { game.scene.traverse((o) => { if (o.name === 'vfx-telegraph') o.visible = false; }); game.renderNow(); game.scene.traverse((o) => { if (o.name === 'vfx-telegraph') o.visible = o.userData.__tv; }); });
      await p.screenshot({ path: `${OUT}/${r.id}_${tt}_off.png` });
    }
    results.push(r);
    console.log(JSON.stringify({ id: r.id, ok: r.ok }));
  }
  
  if (logs.length) console.log(logs.slice(0, 15).join('\n'));
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
