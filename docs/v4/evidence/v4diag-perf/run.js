// node run.js <scenario> [--w 1280 --h 720] [--msaa 4] [--finish] [--shot]
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }; const flag = (k) => args.includes(k);
const root = '/home/user/changdongdemo1';
const port = 8100 + Math.floor(Math.random() * 899);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(port);
const SC = {
  village: { url: '&cls=mage&skills=preset:endgame_mage&level=30', tp: [-6, 128] },
  plains: { url: '&cls=mage&skills=preset:endgame_mage&level=30', tp: [-6, 20] },
  mirwen: { url: '&cls=mage&skills=preset:endgame_mage&level=30', tp: [-56, -60] },
  elderwood: { url: '&cls=mage&skills=preset:endgame_mage&level=30', tp: [70, -50] },
  fight_mage: { url: '&cls=mage&skills=preset:endgame_mage&level=30', tp: [-6, 20], fight: true },
  fight_sword: { url: '&cls=sword&skills=preset:endgame_sword&level=30', tp: [-6, 20], fight: true },
  fight_ranger: { url: '&cls=ranger&skills=preset:endgame_ranger&level=30', tp: [-6, 20], fight: true },
  fight_paladin: { url: '&cls=paladin&skills=preset:endgame_paladin&level=30', tp: [-6, 20], fight: true },
  fight_shadowblade: { url: '&cls=shadowblade&skills=preset:endgame_shadowblade&level=30', tp: [-6, 20], fight: true },
  fight_spiritcaller: { url: '&cls=spiritcaller&skills=preset:endgame_spiritcaller&level=30', tp: [-6, 20], fight: true },
  golem: { url: '&cls=mage&skills=preset:endgame_mage&level=20&quest=boss&boss=golem', boss: true },
  hydra: { url: '&cls=mage&skills=preset:endgame_mage&level=20&boss=hydra', boss: true },
  nox: { url: '&cls=mage&skills=preset:endgame_mage&level=20&boss=nox', boss: true },
  treant: { url: '&cls=mage&skills=preset:endgame_mage&level=20&boss=treant', boss: true },
  kalis: { url: '&cls=mage&skills=preset:endgame_mage&level=25&boss=kalis', boss: true },
  nidhoggra: { url: '&cls=mage&skills=preset:endgame_mage&level=25&boss=nidhoggra', boss: true },
};
const name = args[0]; const S = SC[name];
const W = +opt('--w', 1280), H = +opt('--h', 720);
const out = { scenario: name, viewport: [W, H] };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const logs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
  p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const tBoot = Date.now();
  await p.goto(`http://localhost:${port}/?test=1${S.url}`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 180000 });
  out.bootMs = Date.now() - tBoot;
  if (S.boss) { await p.waitForFunction(() => !!game.enemies?.boss, null, { timeout: 60000 }).catch(() => logs.push('no boss')); }
  await p.evaluate(() => game.freeze(true));
  await p.evaluate(fs.readFileSync(__dirname + '/inject.js', 'utf8'));
  const msaa = +opt('--msaa', 0);
  out.config = await p.evaluate(({ msaa, finish }) => {
    const c = game.composer; if (msaa) { c.renderTarget1.samples = msaa; c.renderTarget2.samples = msaa; c.renderTarget1.dispose(); c.renderTarget2.dispose(); }
    PROF.finish = finish; return { msaa, finish };
  }, { msaa, finish: flag('--finish') });
  // place
  await p.evaluate(({ S }) => {
    const g = game;
    if (S.tp) g.debug.tp({ x: S.tp[0], z: S.tp[1] });
    if (S.boss) { const bp = g.enemies.boss.object.position; g.debug.tp({ x: bp.x + 4, z: bp.z + 16 }); for (let i = 0; i < 30 && g.cinematic?.active; i++) { g.cinematic.skip?.(); g.step(30, 1 / 60); } }
    g.step(30, 1 / 60, false);
    if (g.state !== 'playing') g.setState('playing');
  }, { S });
  // warm-up 20 rendered frames (first-draw costs) — record them as hitches
  out.warm = await p.evaluate(() => { const r = []; for (let i = 0; i < 6; i++) { const F = PROF.step(1 / 60, true); r.push({ ms: +F.ms.toFixed(1), calls: F.calls, gl: F.glDelta }); } return r; });
  // fight setup
  if (S.fight) {
    out.fightSetup = await p.evaluate(() => {
      const g = game, T = g.THREE, pp = g.player.object.position.clone();
      const types = ['bokoblin', 'chuchu', 'lizard', 'wolf', 'shroom', 'wraith', 'voidknight', 'shaman', 'bokoblin', 'chuchu', 'wolf', 'lizard'];
      const gl0 = { ...PROF.gl }; const t0 = performance.now(); const id0 = PROF.ids();
      window._foes = [];
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, r = 6 + (i % 3) * 2;
        const e = g.enemies.spawn(types[i], new T.Vector3(pp.x + Math.sin(a) * r, 0, pp.z + Math.cos(a) * r), { level: 28 });
        if (e) { e.hp = e.maxHp = 1e7; e.aggro = true; _foes.push(e); }
      }
      const id1 = PROF.ids();
      return { spawned: _foes.length, spawnMs: +(performance.now() - t0).toFixed(1), newObj3D: id1.obj - id0.obj, newMats: id1.mat - id0.mat, newGeos: id1.geo - id0.geo, gl: Object.fromEntries(Object.keys(PROF.gl).map((k) => [k, PROF.gl[k] - gl0[k]])) };
    });
    out.fightFirstFrames = await p.evaluate(() => { const r = []; for (let i = 0; i < 4; i++) { const F = PROF.step(1 / 60, true); r.push({ ms: +F.ms.toFixed(1), calls: F.calls, gl: F.glDelta }); } return r; });
  }
  // cast loop helper
  await p.evaluate(() => {
    window._castAll = (k) => {
      const g = game, Sk = g.skills;
      const ids = g.progression.learnedSkills().filter((i) => !['finisher', 'basic', 'passive'].includes(Sk.defs.get(i)?.slot) && Sk.defs.get(i)?.type !== 'passive');
      if (!ids.length) return null;
      const id = ids[k % ids.length];
      const foes = (window._foes || []).filter((e) => e.alive !== false);
      const tgt = foes.length ? foes[k % foes.length] : g.enemies.boss;
      if (!tgt) return null;
      Sk.resetCooldowns?.(); try { g.player.entity.hp = g.player.entity.maxHp; } catch (_) {}
      const o = g.player.object.position.clone(); o.y += 1.5; const t = tgt.object.position.clone(); t.y += 1;
      try { Sk.cast(id, { free: true, aim: { origin: o, dir: t.clone().sub(o).normalize(), point: t, target: tgt } }); } catch (e) { return 'err:' + e.message; }
      // basic attack spam
      try { g.input?.debugPress?.('attack'); } catch (_) {}
      return id;
    };
  });

  if (flag('--alloc')) {
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('HeapProfiler.enable'); await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await p.evaluate(() => { if (window.gc) gc(); });
    const h0 = await p.evaluate(() => performance.memory.usedJSHeapSize);
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    await cdp.send('Profiler.start');
    const FR = +opt('--simframes', 1800);
    const simRes = await p.evaluate(({ FR }) => {
      const id0 = PROF.ids(); const t0 = performance.now(); let k = 0; const hs = []; const slow = [];
      for (let i = 0; i < FR; i++) { if (i % 12 === 0) _castAll(k++); const a = performance.now(); game.step(1, 1 / 60, (i % 30) === 0); const d = performance.now() - a; if (d > 25) slow.push([i, +d.toFixed(0)]); if (i % 60 === 0) hs.push(+(performance.memory.usedJSHeapSize / 1048576).toFixed(1)); }
      const id1 = PROF.ids();
      const mods = {}; for (const m in PROF.mods) mods[m] = { avg: +(PROF.mods[m].ms / Math.max(1, PROF.mods[m].n)).toFixed(3), max: +PROF.mods[m].max.toFixed(1) };
      return { frames: FR, wallMs: +(performance.now() - t0).toFixed(0), heapMBperSec: hs, new: { obj3D: id1.obj - id0.obj, mats: id1.mat - id0.mat, geos: id1.geo - id0.geo }, mods, slow: slow.slice(0, 30), vfx: game.vfx.stats(), entities: game.entities.length };
    }, { FR });
    const prof = (await cdp.send('Profiler.stop')).profile;
    const hp = (await cdp.send('HeapProfiler.stopSampling')).profile;
    // aggregate heap samples by allocation site (self)
    const sites = {}; let total = 0;
    const walk = (n, stack) => { const cf = n.callFrame; const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/src\//, 'src/').replace(/^.*\/vendor\//, 'vendor/')}:${cf.lineNumber + 1}`; total += n.selfSize; if (n.selfSize) sites[key] = (sites[key] || 0) + n.selfSize; for (const c of n.children || []) walk(c, stack); };
    walk(hp.head, []);
    const secs = FR / 60;
    simRes.allocMBperGameSec = +(total / 1048576 / secs).toFixed(2);
    simRes.topAlloc = Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, +(v / 1048576 / secs).toFixed(3)]);
    // cpu profile: self time per function
    const self = {}; const byId = new Map(prof.nodes.map((n) => [n.id, n]));
    const dts = prof.timeDeltas; const cnt = {};
    for (let i = 0; i < prof.samples.length; i++) cnt[prof.samples[i]] = (cnt[prof.samples[i]] || 0) + (dts[i] || 0);
    let tot = 0;
    for (const [id, us] of Object.entries(cnt)) { const n = byId.get(+id); const cf = n.callFrame; const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/src\//, 'src/').replace(/^.*\/vendor\//, 'vendor/')}:${cf.lineNumber + 1}`; self[key] = (self[key] || 0) + us; tot += us; }
    simRes.cpuTop = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => [k, +(v / 1000).toFixed(0), +(100 * v / tot).toFixed(1)]);
    simRes.h0MB = +(h0 / 1048576).toFixed(1);
    out.alloc = simRes;
    fs.writeFileSync(`/tmp/v4diag-perf/alloc_${name}.json`, JSON.stringify(simRes, null, 1));
    console.log('alloc', simRes.allocMBperGameSec, 'MB/game-s', simRes.wallMs, 'ms');
    if (flag('--allocOnly')) { await b.close(); server.close(); return; }
  }
  // measured frames: N frames, cast every 15 frames in fights/boss
  const N = +opt('--frames', S.fight || S.boss ? 90 : 40);
  out.measure = await p.evaluate(({ N, fight, boss }) => {
    const g = game; const frames = []; const casts = [];
    const id0 = PROF.ids(); let k = 0; const mem0 = performance.memory.usedJSHeapSize;
    for (const m in PROF.mods) { PROF.mods[m].ms = 0; PROF.mods[m].n = 0; PROF.mods[m].max = 0; }
    for (const s in PROF.sub) { PROF.sub[s].ms = 0; PROF.sub[s].n = 0; }
    // rotate the camera through 4 yaws during measure
    let worst = null; let simMs = 0;
    for (let i = 0; i < N; i++) {
      if ((fight || boss) && i % 12 === 0) casts.push(_castAll(k++));
      if (i % Math.ceil(N / 4) === 0) g.player.setLook?.((i / N) * Math.PI * 2, -0.15);
      const F = PROF.step(1 / 60, true);
      const pxP = (i % 10 === 5) ? PROF.particlePx() : null;
      const rec = { ms: F.ms, calls: F.calls, tris: F.tris, pass: F.pass, mod: F.mod, gl: F.glDelta, ppx: pxP };
      frames.push(rec);
      if (!worst || F.calls > worst.calls) worst = { calls: F.calls, tris: F.tris, pass: F.pass, byMat: F.byMat, topObj: Object.entries(F.byObj).sort((a, b) => b[1].calls - a[1].calls).slice(0, 25), topTris: Object.entries(F.byObj).sort((a, b) => b[1].tris - a[1].tris).slice(0, 15), tlist: F.tlist.sort((a, b) => b[1] - a[1]).slice(0, 20), i };
    }
    const id1 = PROF.ids(); const mem1 = performance.memory.usedJSHeapSize;
    // sim-only timing
    const t0 = performance.now(); for (let i = 0; i < 30; i++) { if ((fight || boss) && i % 12 === 0) _castAll(k++); g.step(1, 1 / 60, false); } simMs = (performance.now() - t0) / 30;
    const agg = (f) => { const v = frames.map(f).sort((a, b) => a - b); return { med: +v[v.length >> 1].toFixed(2), p95: +v[Math.floor(v.length * 0.95)].toFixed(2), max: +v[v.length - 1].toFixed(2), avg: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) }; };
    const passAgg = {};
    for (const fr of frames) for (const pn in fr.pass) { const A = passAgg[pn] || (passAgg[pn] = { calls: 0, tris: 0, transp: 0, additive: 0, px: 0, ms: 0, runs: 0, n: 0 }); const q = fr.pass[pn]; A.calls += q.calls; A.tris += q.tris; A.transp += q.transp; A.additive += q.additive; A.px += q.px; A.ms += q.ms || 0; A.runs += q.runs || 0; A.n++; }
    for (const pn in passAgg) { const A = passAgg[pn]; for (const k2 of ['calls', 'tris', 'transp', 'additive', 'px', 'ms', 'runs']) A[k2] = +(A[k2] / frames.length).toFixed(2); }
    const modAgg = {}; for (const m in PROF.mods) modAgg[m] = { avg: +(PROF.mods[m].ms / Math.max(1, PROF.mods[m].n)).toFixed(3), max: +PROF.mods[m].max.toFixed(2) };
    const subAgg = {}; for (const s in PROF.sub) subAgg[s] = +(PROF.sub[s].ms / Math.max(1, PROF.sub[s].n)).toFixed(3);
    const pp = frames.filter((f) => f.ppx).map((f) => f.ppx);
    const glTot = {}; for (const fr of frames) for (const kk in fr.gl) glTot[kk] = (glTot[kk] || 0) + fr.gl[kk];
    return { N, frameMs: agg((f) => f.ms), calls: agg((f) => f.calls), tris: agg((f) => f.tris), passes: passAgg, mods: modAgg, sub: subAgg, simOnlyMs: +simMs.toFixed(2),
      perSecNew: { obj3D: +((id1.obj - id0.obj) / (N / 60)).toFixed(0), mats: +((id1.mat - id0.mat) / (N / 60)).toFixed(0), geos: +((id1.geo - id0.geo) / (N / 60)).toFixed(0) },
      heapDeltaMB: +((mem1 - mem0) / 1048576).toFixed(2), glPerFrame: Object.fromEntries(Object.entries(glTot).map(([a, b]) => [a, +(b / N).toFixed(1)])),
      particles: pp, perFrame: frames.map((f) => [+f.ms.toFixed(0), +(f.pass.shadow?.ms || 0).toFixed(0), +(f.pass.scene?.ms || 0).toFixed(0), f.calls]), worst, casts: casts.slice(0, 12), hitches: frames.map((f, i) => [i, +f.ms.toFixed(0), f.gl.link, f.gl.tex, f.gl.diag]).filter((x) => x[2] > 0 || x[4] > 0) };
  }, { N, fight: !!S.fight, boss: !!S.boss });
  out.scene = await p.evaluate(() => PROF.sceneInfo());
  fs.writeFileSync(`/tmp/v4diag-perf/res_${name}${opt('--tag', '')}.json`, JSON.stringify(out, null, 1));
  if (flag('--ablate')) { out.ablate = await p.evaluate(fs.readFileSync(__dirname + '/ablate.js', 'utf8')); console.log('ablate', JSON.stringify(out.ablate)); }
  if (flag('--shot')) { await p.evaluate(() => { game.renderNow(); }); await p.screenshot({ path: `/tmp/v4diag-perf/shot_${name}.png`, timeout: 120000 }); out.shot = `/tmp/v4diag-perf/shot_${name}.png`; }
  out.logs = logs.slice(0, 15);
  const fn = `/tmp/v4diag-perf/res_${name}${opt('--tag', '')}.json`;
  fs.writeFileSync(fn, JSON.stringify(out, null, 1));
  console.log('wrote', fn, 'boot', out.bootMs, 'frame', JSON.stringify(out.measure.frameMs), 'calls', JSON.stringify(out.measure.calls));
  await b.close(); server.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
