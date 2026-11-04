const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1', OUT = '/tmp/v4diag-enemies';
const port = 8100 + Math.floor(Math.random() * 900);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  await p.goto(`http://localhost:${port}/?test=1&cls=sword&level=20&quest=camps&zone=plains`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 120000 });
  const setup = () => p.evaluate(() => {
    const pp = game.player.entity.object.position, cam = game.camera;
    cam.position.set(pp.x + 0.01, pp.y + 16, pp.z - 7); cam.lookAt(pp.x, pp.y, pp.z - 7.01); cam.updateMatrixWorld(true); game.renderNow();
  });
  const r = await p.evaluate(() => {
    game.freeze(true);
    for (const o of game.enemies.list.slice()) if (o.object) o.object.visible = false;
    const pp = game.player.entity.object.position, V = game.THREE.Vector3;
    game.vfx.telegraph({ shape: 'circle', pos: pp.clone().add(new V(0, 0, -6)), r: 3, dur: 5, color: 'damage' });
    game.vfx.telegraph({ shape: 'cone', pos: pp.clone().add(new V(5, 0, -6)), dir: new V(0, 0, 1), r: 3.2, angle: 114, dur: 5, color: 'void' });
    game.vfx.telegraph({ shape: 'line', pos: pp.clone().add(new V(-5, 0, -9)), dir: new V(0, 0, 1), len: 3.6, width: 1.2, dur: 5, color: 'damage' });
    game.step(40, 1 / 60, false);
    return game.vfx.stats().telegraphs;
  });
  console.log('active', r);
  await setup(); await p.screenshot({ path: `${OUT}/tele3_top.png` });
  await p.evaluate(() => { game.scene.traverse((o) => { if (o.name && o.name.startsWith('grass_')) o.visible = false; }); });
  await setup(); await p.screenshot({ path: `${OUT}/tele3_top_nograss.png` });
  await p.evaluate(() => { game.scene.traverse((o) => { if (o.name === 'vfx-telegraph') { o.material.depthTest = false; } }); });
  await setup(); await p.screenshot({ path: `${OUT}/tele3_top_nodepth.png` });
  const dbg = await p.evaluate(() => {
    const R = game.renderer, inf = R.info; inf.autoReset = false;
    const meshes = []; game.scene.traverse((o) => { if (o.name === 'vfx-telegraph') meshes.push(o); });
    const vis = meshes.filter((m) => m.visible);
    inf.reset(); game.renderNow(); const a = inf.render.calls;
    for (const m of vis) m.visible = false; inf.reset(); game.renderNow(); const bb = inf.render.calls; for (const m of vis) m.visible = true;
    inf.autoReset = true;
    const m = vis[0]; const a0 = m.geometry.attributes.position.array;
    let minY = 1e9, maxY = -1e9; for (let i = 1; i < a0.length; i += 3) { minY = Math.min(minY, a0[i]); maxY = Math.max(maxY, a0[i]); }
    // where is the overlay pass? list composer passes
    const passes = (game.composer?.passes || []).map((p) => p.constructor.name);
    const sc = game.scene; let parentScene = m.parent === sc;
    return { withTele: a, without: bb, nVis: vis.length, minY, maxY, x: [a0[0], a0[a0.length - 3]], z: [a0[2], a0[a0.length - 1]], passes, parentScene, pp: game.player.entity.object.position.toArray(), cam: game.camera.position.toArray(), prog: m.material.uniforms.uProg.value, uAlpha: m.material.uniforms.uAlpha.value, fog: !!m.material.fog, sceneFog: game.scene.fog && game.scene.fog.constructor.name };
  });
  console.log(JSON.stringify(dbg));
  await p.evaluate(() => { const hid = []; game.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.name !== 'vfx-telegraph' && o.visible) { o.visible = false; hid.push(o); } }); window.__hid = hid; });
  await setup(); await p.screenshot({ path: `${OUT}/tele3_only.png` });
  const px = await p.evaluate(() => { const m = []; game.scene.traverse((o) => { if (o.name === 'vfx-telegraph' && o.visible) m.push(o); });
    const mm = m[0]; mm.material.uniforms.uAlpha.value = 1; mm.material.uniforms.uProg.value = 1; mm.material.depthTest = false; mm.material.fog = false; mm.material.needsUpdate = true; game.renderNow(); return m.length; });
  await p.screenshot({ path: `${OUT}/tele3_only_nofog.png` });
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
