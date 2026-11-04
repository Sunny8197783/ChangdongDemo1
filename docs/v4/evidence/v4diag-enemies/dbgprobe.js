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
  const logs = []; p.on('console', (m) => logs.push(m.type() + ': ' + m.text().slice(0, 300)));
  await p.goto(`http://localhost:${port}/?test=1&cls=sword&level=20&quest=done`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 180000 });
  const r = await p.evaluate(() => {
    game.freeze(true);
    document.querySelectorAll('body > div').forEach((d) => { if (!d.querySelector('canvas')) d.style.visibility = 'hidden'; });
    game.debug.tp('golem'); game.step(30, 1 / 60, false);
    const pp = game.player.entity.object.position, cam = game.camera, V = game.THREE.Vector3;
    const f = new V(); cam.getWorldDirection(f); f.y = 0; f.normalize();
    const h = game.vfx.telegraph({ shape: 'circle', pos: pp.clone().addScaledVector(f, 7), r: 2.8, dur: 3, color: 'damage' });
    game.step(60, 1 / 60, false);
    let mesh = null; game.scene.traverse((o) => { if (o.name === 'vfx-telegraph' && o.visible) mesh = o; });
    const R = game.renderer; const props = R.properties.get(mesh.material);
    const prog = props.currentProgram;
    const u = mesh.material.uniforms;
    // ensure render
    game.renderNow();
    const prog2 = R.properties.get(mesh.material).currentProgram;
    let onBR = mesh.onBeforeRender.toString().slice(0, 80);
    const vis = []; let o = mesh; while (o) { vis.push(o.type + ':' + o.visible); o = o.parent; }
    const a = mesh.geometry.attributes.position.array;
    const cen = new V(a[3 * 144], a[3 * 144 + 1], a[3 * 144 + 2]);
    const ndc = cen.clone().project(cam);
    return { prog: !!prog, prog2: !!prog2, diag: prog2?.diagnostics || null, uProg: u.uProg.value, uAlpha: u.uAlpha.value, col: u.uColor.value.toArray(), onBR, vis, cen: cen.toArray(), ndc: ndc.toArray(), checkErr: R.debug?.checkShaderErrors, fogNear: game.scene.fog?.near, fogFar: game.scene.fog?.far, matVisible: mesh.material.visible, opacity: mesh.material.opacity, layers: mesh.layers.mask, camLayers: cam.layers.mask };
  });
  console.log(JSON.stringify(r, null, 1));


  const q = await p.evaluate(() => {
    let mesh = null; game.scene.traverse((o) => { if (o.name === 'vfx-telegraph' && o.visible) mesh = o; });
    const T = game.THREE;
    const clone = new T.Mesh(mesh.geometry.clone(), new T.MeshBasicMaterial({ color: 0xff00ff, depthTest: false, side: T.DoubleSide }));
    clone.renderOrder = 999; clone.frustumCulled = false; game.scene.add(clone); game.renderNow();
    window.__clone = clone;
    const R = game.renderer, gl = R.getContext();
    const attr = mesh.geometry.attributes.position; const ga = R.attributes ? null : null;
    return { version: attr.version, usage: attr.usage, ranges: attr.updateRanges ? attr.updateRanges.length : 'n/a', updateRange: attr.updateRange, isGL2: R.capabilities.isWebGL2, idx: !!mesh.geometry.index, drawRange: mesh.geometry.drawRange, mw: mesh.matrixWorld.elements.slice(12, 15), mAuto: mesh.matrixAutoUpdate, scale: mesh.scale.toArray(), pos: mesh.position.toArray() };
  });
  console.log('Q', JSON.stringify(q));
  await p.screenshot({ path: `${OUT}/dbg_clone.png`, timeout: 180000 });
  await p.evaluate(() => { game.scene.remove(window.__clone); game.scene.traverse((o) => { if (o.name === 'vfx-telegraph') { o.material.side = game.THREE.DoubleSide; o.material.needsUpdate = true; } }); game.renderNow(); });
  await p.screenshot({ path: `${OUT}/dbg_orig_doubleside.png`, timeout: 180000 });
  await p.evaluate(() => { let mesh = null; game.scene.traverse((o) => { if (o.name === 'vfx-telegraph' && o.visible) mesh = o; }); mesh.material = new game.THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false }); mesh.renderOrder = 999; game.renderNow(); });
  await p.screenshot({ path: `${OUT}/dbg_origmesh_basic.png`, timeout: 180000 });
  console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 10).join('\n'));
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
