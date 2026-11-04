const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1'; const port = 8100 + Math.floor(Math.random() * 899);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
const OUT = '/tmp/v4diag-webcombat';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('console', m => { if (['error','warning'].includes(m.type())) console.log('[console]', m.text().slice(0, 300)); });
  await p.goto(`http://localhost:${port}/?test=1&cls=sword&level=30&skills=preset:endgame_sword&quest=camps&zone=plains`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 });
  await p.waitForTimeout(4500);   // let the level-up banner fade
  const r = await p.evaluate(() => {
    const g = window.game; g.freeze(true); g.step(90, 1/30, false);
    const e = g.debug.spawn('voidknight', { dist: 5, level: 20 }); e.maxHp = e.hp = 1e8; window.__e = e;
    const tl = () => g.vfx?.stats?.().telegraphs || 0;
    const timeline = []; let t = 0, first = null;
    for (let i = 0; i < 600; i++) { g.step(1, 1/30, false); t += 1/30;
      if (tl() > 0 && first == null) first = t;
      if (first != null && t - first > 0.33) break; }
    const tm = g.scene.getObjectByName('vfx-telegraph');
    const vis = []; g.scene.traverse(o => { if (o.name === 'vfx-telegraph' && o.visible) vis.push({ prog: +o.material.uniforms.uProg.value.toFixed(2), a: o.material.uniforms.uAlpha.value }); });
    g.renderNow();
    return { first, state: e.state, vis, dist: e.distP };
  });
  console.log('A', JSON.stringify(r));
  await p.screenshot({ path: OUT + '/C_voidknight_cone_grass.png' });
  const r2 = await p.evaluate(() => { const g = window.game; let info = null;
    g.scene.traverse(o => { if (o.name === 'vfx-telegraph' && o.visible) {
      const arr = o.geometry.attributes.position.array; let ys = [], xs = [], zs = [];
      for (let i = 0; i < arr.length; i += 3) { xs.push(arr[i]); ys.push(arr[i+1]); zs.push(arr[i+2]); }
      const mn = a => Math.min(...a).toFixed(2), mx = a => Math.max(...a).toFixed(2);
      const u = o.material.uniforms;
      info = { parent: o.parent?.type, pos: o.position.toArray(), x: [mn(xs), mx(xs)], y: [mn(ys), mx(ys)], z: [mn(zs), mx(zs)], shape: u.uShape.value, ang: u.uAngle.value, color: u.uColor.value.getHexString(), layers: o.layers.mask, drawRange: o.geometry.drawRange, transparent: o.material.transparent, depthTest: o.material.depthTest };
    } });
    const e = window.__e; const pp = g.player.entity.object.position;
    info.knight = e.object.position.toArray().map(v => +v.toFixed(2)); info.player = pp.toArray().map(v => +v.toFixed(2));
    info.gh = g.world?.getHeight ? +g.world.getHeight(e.object.position.x, e.object.position.z).toFixed(2) : 'none';
    g.scene.traverse(o => { if (o.name === 'vfx-telegraph' && o.visible) { o.material.uniforms.uAlpha.value = 1; o.material.uniforms.uColor.value.setHex(0xff00ff); o.material.depthTest = false; } });
    g.renderNow(); return info; });
  console.log('dbg', JSON.stringify(r2));
  const r3 = await p.evaluate(() => { const g = window.game; const out = [];
    for (const pr of g.renderer.info.programs) { if (pr.diagnostics && !pr.diagnostics.runnable) out.push({ name: pr.name, d: JSON.stringify(pr.diagnostics).slice(0, 600) }); }
    let tm = null; g.scene.traverse(o => { if (o.name === 'vfx-telegraph' && o.visible) tm = o; });
    const props = g.renderer.properties.get(tm.material);
    return { bad: out, hasProgram: !!props.currentProgram, progName: props.currentProgram?.name, runnable: props.currentProgram?.diagnostics?.runnable, onBefore: typeof tm.onBeforeRender, vis: tm.visible, parentVis: tm.parent.visible, matVis: tm.material.visible, sceneOverride: !!g.scene.overrideMaterial };
  });
  console.log('prog', JSON.stringify(r3));
  await p.evaluate(() => { const g = window.game; g.scene.traverse(o => { if (o.name === 'vfx-telegraph') { o.material.side = 2; o.material.depthTest = true; o.material.uniforms.uColor.value.setHex(0x9a5cff); o.material.uniforms.uAlpha.value = 0.9; o.material.needsUpdate = true; } });
    g.scene.traverse(o => { if (/^grass_/.test(o.name)) o.visible = true; }); g.renderNow(); });
  await p.screenshot({ path: OUT + '/F_voidknight_cone_doubleside_grass.png' });
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
