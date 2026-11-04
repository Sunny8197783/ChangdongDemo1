// node proposal.js <scene: plains|fight> — synced render cost of the current real default vs proposed laptop settings (frozen content)
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1'; const port = 8100 + Math.floor(Math.random() * 899);
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(res); }).listen(port);
const scene = process.argv[2] || 'fight';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://localhost:${port}/?test=1&cls=mage&skills=preset:endgame_mage&level=30`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 180000 });
  const r = await p.evaluate(async ({ scene }) => {
    const g = game, T = g.THREE, R = g.renderer, C = g.composer; g.freeze(true); g.debug.tp({ x: -6, z: 20 }); g.step(30, 1 / 60, false);
    const { ShaderPass } = await import('./vendor/three/addons/postprocessing/ShaderPass.js');
    const { FXAAShader } = await import('./vendor/three/addons/shaders/FXAAShader.js');
    if (scene === 'fight') {
      const pp = g.player.object.position.clone(); const foes = [];
      const types = ['bokoblin', 'chuchu', 'lizard', 'wolf', 'shroom', 'wraith', 'voidknight', 'shaman', 'bokoblin', 'chuchu', 'wolf', 'lizard'];
      for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, rr = 6 + (i % 3) * 2; const e = g.enemies.spawn(types[i], new T.Vector3(pp.x + Math.sin(a) * rr, 0, pp.z + Math.cos(a) * rr), { level: 28 }); if (e) { e.hp = e.maxHp = 1e7; e.aggro = true; foes.push(e); } }
      const S = g.skills; const ids = g.progression.learnedSkills().filter((i) => S.defs.get(i) && !['basic', 'passive'].includes(S.defs.get(i).slot));
      for (let fr = 0; fr < 90; fr++) { if (fr % 12 === 0) { S.resetCooldowns?.(); const id = ids[(fr / 12) % ids.length]; const tgt = foes[(fr / 12) % 12]; const o = g.player.object.position.clone(); o.y += 1.5; const t = tgt.object.position.clone(); t.y += 1; try { S.cast(id, { free: true, aim: { origin: o, dir: t.clone().sub(o).normalize(), point: t, target: tgt } }); } catch (_) {} } g.step(1, 1 / 60, false); }
    }
    const gl = R.getContext(); const px = new Uint8Array(4);
    const SYNC = () => { const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); };
    let shadowEvery = 1, fr = 0;
    const one = () => { if (++fr % shadowEvery === 0) R.shadowMap.needsUpdate = true; SYNC(); const t = performance.now(); C.render(0); SYNC(); return performance.now() - t; };
    const avg = (n) => { const v = []; for (let i = 0; i < n; i++) v.push(one()); v.sort((a, b) => a - b); return v[n >> 1]; };
    const pr0 = R.getPixelRatio();
    const setPR = (x) => { R.setPixelRatio(x); C.setPixelRatio(x); R.setSize(innerWidth, innerHeight); C.setSize(innerWidth, innerHeight); };
    const setMSAA = (n) => { if (C.renderTarget1.samples === n) return; C.renderTarget1.samples = n; C.renderTarget2.samples = n; C.renderTarget1.dispose(); C.renderTarget2.dispose(); };
    const sun = (() => { let s; g.scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) s = o; }); return s; })();
    const setShadow = (size) => { if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; } };
    const fxaa = new ShaderPass(FXAAShader); fxaa.enabled = false; C.insertPass(fxaa, C.passes.length);   // after OutputPass (sRGB) as FXAA expects
    const bloom = g.bloomPass; const bloomFull = () => bloom.setSize(R.domElement.width, R.domElement.height); const bloomHalf = () => bloom.setSize(R.domElement.width / 2, R.domElement.height / 2);
    const parts = []; g.scene.traverse((o) => { if (o.name === 'vfx-additive' || o.name === 'vfx-alpha') parts.push(o); });
    const grassL = g.world.grass.layers;
    const cfgs = {
      A_current_medium: () => { setPR(pr0); setMSAA(4); shadowEvery = 1; setShadow(2048); bloom.enabled = true; bloomFull(); fxaa.enabled = false; },
      B_noMSAA: () => { setMSAA(0); },
      C_noMSAA_fxaa: () => { setMSAA(0); fxaa.enabled = true; fxaa.material.uniforms.resolution.value.set(1 / R.domElement.width, 1 / R.domElement.height); },
      D_C_scale085: () => { setPR(pr0 * 0.85); fxaa.material.uniforms.resolution.value.set(1 / R.domElement.width, 1 / R.domElement.height); },
      E_D_shadow1024_every2: () => { setShadow(1024); shadowEvery = 2; },
      F_E_bloomHalfRes: () => { bloomHalf(); },
      G_F_grass04: () => { g.world.grass.setDensity(0.4); },
      H_G_noParticles_upperBound: () => { parts.forEach((o) => (o.visible = false)); },
    };
    const out = {}; let base = null;
    for (const [k, fn] of Object.entries(cfgs)) { fn(); one(); one(); const v = avg(5); if (base == null) base = v; out[k] = { ms: Math.round(v), rel: +(v / base).toFixed(2) }; }
    parts.forEach((o) => (o.visible = true));
    // repeat A at the end to estimate drift
    cfgs.A_current_medium(); g.world.grass.setDensity(0.6); one(); out.A_again = { ms: Math.round(avg(5)) };
    out.flora = { ...g.world.flora.stats }; out.grassChunks = g.world.grass.stats.chunks; out.canvas = [R.domElement.width, R.domElement.height];
    return out;
  }, { scene });
  console.log(scene, JSON.stringify(r));
  fs.writeFileSync(`/tmp/v4diag-perf/proposal_${scene}.json`, JSON.stringify(r, null, 1));
  await b.close(); server.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
