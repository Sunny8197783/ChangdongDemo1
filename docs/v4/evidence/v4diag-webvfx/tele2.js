const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = '/home/user/changdongdemo1', port = 8100 + Math.floor(Math.random() * 899);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
const SPOT = process.argv[2] || 'plateau';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const logs=[]; p.on('console', m => { if (['error','warning'].includes(m.type())) logs.push(m.text().slice(0,300)); });
  await p.goto(`http://localhost:${port}/?test=1&cls=mage&level=30`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 });
  await p.waitForTimeout(1000);
  const r = await p.evaluate((SPOT) => {
    const g = window.game; g.freeze(true); if (SPOT !== 'village') g.debug.tp(SPOT); g.step(20, 1/60, false);
    const pp = g.player.object.position.clone();
    const fwd = new pp.constructor(); g.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const tp = pp.clone().addScaledVector(fwd, 6);
    g.vfx.telegraph({ shape: 'circle', pos: tp, r: 3, dur: 3 });
    g.vfx.telegraph({ shape: 'cone', pos: pp.clone().addScaledVector(fwd, 2).add(new pp.constructor(fwd.z * 5, 0, -fwd.x * 5)), dir: fwd, r: 5, angle: 60, dur: 3 });
    g.step(90, 1/60, false);
    const names = {}; g.scene.traverse(o => { if (o.isMesh || o.isInstancedMesh) { const n = o.name || '(noname)'; if (/grass|foliage|flower|weed/i.test(n)) names[n] = (names[n] || 0) + 1; } });
    g.renderNow(); let m=null; g.scene.traverse(o=>{ if(o.name==='vfx-telegraph'&&o.visible) m=o; }); const prog = g.renderer.properties.get(m.material);
    return { names, prog: !!prog.currentProgram, progDiag: prog.currentProgram?.diagnostics || null, mAuto: m.matrixAutoUpdate, mw: m.matrixWorld.elements.slice(12,15), fog: !!g.scene.fog, fogType: g.scene.fog?.isFogExp2 ? 'exp2' : 'lin', progs: g.renderer.info.programs.length };
  }, SPOT);
  console.log(JSON.stringify(r)); console.log(logs.join('\n')); console.log(logs.join('\n'));
  const dbg = await p.evaluate(() => { const g = window.game; let m=null; g.scene.traverse(o=>{ if(o.name==='vfx-telegraph'&&o.visible&&!m) m=o; });
    const a = m.geometry.attributes.position; const c = new m.position.constructor(); let n=0; for (let i=0;i<a.count;i++){ c.x+=a.getX(i); c.y+=a.getY(i); c.z+=a.getZ(i); n++; } c.multiplyScalar(1/n);
    const ndc = c.clone().project(g.camera);
    // render ONLY the telegraph on black, bypassing composer
    const vis=[]; g.scene.traverse(o=>{ if(o!==g.scene && o.visible && o!==m && (o.isMesh||o.isPoints||o.isLine||o.isSprite)) { vis.push(o); o.visible=false; } });
    const bg=g.scene.background; g.scene.background=null; const fog=g.scene.fog; 
    g.renderer.setRenderTarget(null); g.renderer.render(g.scene, g.camera);
    const gl=g.renderer.getContext(); const W=gl.drawingBufferWidth,H=gl.drawingBufferHeight; const px=new Uint8Array(W*H*4); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,px);
    let lit=0; for(let i=0;i<W*H;i++){ if(px[i*4]+px[i*4+1]+px[i*4+2]>30) lit++; }
    g.scene.fog=null; g.renderer.render(g.scene, g.camera); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,px);
    let lit2=0; for(let i=0;i<W*H;i++){ if(px[i*4]+px[i*4+1]+px[i*4+2]>30) lit2++; }
    const side0 = m.material.side; m.material.side = 2; m.material.needsUpdate = true; g.renderer.render(g.scene, g.camera); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,px);
    let lit3=0; for(let i=0;i<W*H;i++){ if(px[i*4]+px[i*4+1]+px[i*4+2]>30) lit3++; } m.material.side = side0; m.material.needsUpdate = true;
    // geometric facing: normal of first triangle
    const idx = m.geometry.index; const A=new m.position.constructor().fromBufferAttribute(a, idx.getX(0)), B=new m.position.constructor().fromBufferAttribute(a, idx.getX(1)), C=new m.position.constructor().fromBufferAttribute(a, idx.getX(2));
    const nrm = B.clone().sub(A).cross(C.clone().sub(A)).normalize();
    window.__extra = { side0, litDoubleSide: lit3, triNormalY: +nrm.y.toFixed(3) };
    g.scene.fog=fog; g.scene.background=bg; for(const o of vis) o.visible=true;
    return { ...window.__extra, center: c.toArray(), ndc: ndc.toArray(), litPx: lit, litPxNoFog: lit2, W, H, hidden: vis.length, near: g.camera.near, far: g.camera.far, fogNear: fog?.near, fogFar: fog?.far, camPos: g.camera.position.toArray() }; });
  console.log('DBG', JSON.stringify(dbg));
  await p.evaluate(() => window.game.renderNow());
  await p.screenshot({ path: `/tmp/v4diag-webvfx/tele_${SPOT}_with_grass.png` });
  await p.evaluate(() => { const g = window.game; g.scene.traverse(o => { if (o.name === 'vfx-telegraph') { o.material.side = 2; o.material.needsUpdate = true; } }); g.renderNow(); });
  await p.screenshot({ path: `/tmp/v4diag-webvfx/tele_${SPOT}_doubleside.png` });
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
