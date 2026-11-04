// Boss close-ups + stats + a gameplay-view shot during the first telegraphed attack windup.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1', OUT = '/tmp/v4diag-enemies';
const port = 8100 + Math.floor(Math.random() * 900);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(port);
const id = process.argv[2] || 'golem';
const QUEST = { golem: 'boss', hydra: 'mirwen', nox: 'elderwood', treant: 'elderwood', kalis: 'ascent', nidhoggra: 'finale' };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const logs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  await p.goto(`http://localhost:${port}/?test=1&cls=sword&level=25&skills=preset:endgame_sword&boss=${id}`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 180000 });
  await p.waitForTimeout(1500);
  const info = await p.evaluate((id) => {
    game.freeze(true);
    const e = game.enemies.boss; if (!e) return { err: 'noboss' };
    window.__b = e;
    const pe = game.player.entity; pe.invulnerable = true; pe.maxHp = 1e6; pe.hp = 1e6;
    // put the player in the arena, ~14 m from the boss (golem / treant need the player in the arena to act)
    const A = game.world.bossArenas?.[id] || game.world.bossArena || { position: e.object.position, radius: 20 };
    const bp = e.object.position;
    let dx = A.position.x - bp.x, dz = A.position.z - bp.z; let L = Math.hypot(dx, dz);
    if (L < 1) { dx = Math.sin(e.facing); dz = Math.cos(e.facing); L = 1; }
    const R = id === 'nidhoggra' ? 26 : id === 'hydra' ? 13 : id === 'treant' ? 13 : id === 'golem' ? 12 : 8;
    const tx = bp.x + dx / L * R, tz = bp.z + dz / L * R;
    game.debug.tp({ x: tx, z: tz });
    // stats
    let meshes = 0, tris = 0, outl = 0, inst = 0; const mats = new Set();
    e.object.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      meshes++; const g = o.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3; const c = o.isInstancedMesh ? o.count : 1; if (o.isInstancedMesh) inst++;
      if (o.name === 'outline' || (o.material && o.material.side === 1 && o.material.type === 'ShaderMaterial')) outl += n * c; else tris += n * c;
      mats.add(o.material.type);
    });
    const parts = (e.parts || []).map((q) => ({ id: q.partId || q.id, name: q.name, hp: q.maxHp, inv: !!q.invulnerable }));
    const box = new game.THREE.Box3().setFromObject(e.object); const size = box.getSize(new game.THREE.Vector3());
    return { name: e.name, hp: e.maxHp, meshes, tris: Math.round(tris), outlineTris: Math.round(outl), instanced: inst, mats: [...mats], parts, size: size.toArray().map((v) => +v.toFixed(1)), voidShield: e.voidShield || 0, breakMax: e.breakMax || 0, phases: (e.phases || []).map((q) => q.name) };
  }, id);
  console.log('INFO', JSON.stringify(info));
  // hero shot: camera at 1.1× the box size in front of the boss
  const hero = async (name, yawOff, hk) => {
    await p.evaluate(({ yawOff, hk }) => {
      const e = window.__b, cam = game.camera, T = game.THREE;
      const box = new T.Box3().setFromObject(e.object); const c = box.getCenter(new T.Vector3()); const s = box.getSize(new T.Vector3());
      const R = Math.max(s.x, s.y, s.z) * 0.9 + 3, a = e.facing + yawOff;
      cam.position.set(c.x + Math.sin(a) * R, c.y + s.y * hk, c.z + Math.cos(a) * R); cam.lookAt(c.x, c.y, c.z); cam.updateMatrixWorld(true); game.renderNow();
    }, { yawOff, hk });
    await p.screenshot({ path: `${OUT}/boss_${id}_${name}.png`, timeout: 180000 });
  };
  await p.evaluate(() => game.step(30, 1 / 60, false));
  await hero('hero', 0.35, 0.1);
  await hero('side', 1.6, 0.25);
  // gameplay view during attack windups: catch the first 3 attacks
  const shots = [];
  for (let k = 0; k < 3; k++) {
    const r = await p.evaluate(() => {
      const e = window.__b; let fired = null;
      const off = game.events.on('enemyAttack', (q) => { if (q.enemy === e || q.enemy?.parentBoss === e) fired = fired || q.kind; });
      let n = 0;
      for (; n < 60 * 14 && !fired; n++) game.step(1, 1 / 60, false);
      if (typeof off === 'function') off();
      if (!fired) return { none: true, n };
      game.step(24, 1 / 60, false);   // 0.4 s into the windup
      const pp = game.player.entity.object.position, bp = e.object.position, cam = game.camera;
      const dx = bp.x - pp.x, dz = bp.z - pp.z, L = Math.hypot(dx, dz) || 1;
      cam.position.set(pp.x - dx / L * 6.5, pp.y + 3.4, pp.z - dz / L * 6.5); cam.lookAt(bp.x, Math.min(bp.y + 2, pp.y + 2.5), bp.z); cam.updateMatrixWorld(true);
      const R = game.renderer, inf = R.info; inf.autoReset = false; inf.reset(); game.renderNow(); const calls = inf.render.calls, tris = inf.render.triangles; inf.autoReset = true;
      return { kind: fired, afterFrames: n, tele: game.vfx.stats().telegraphs, dist: +L.toFixed(1), calls, tris, state: e.state };
    });
    console.log('ATK', k, JSON.stringify(r));
    if (r.none) break;
    await p.screenshot({ path: `${OUT}/boss_${id}_atk${k}_${r.kind}.png`, timeout: 180000 });
    await p.evaluate(() => {
      const e = window.__b, pp = game.player.entity.object.position, bp = e.object.position, cam = game.camera;
      const mx = (pp.x + bp.x) / 2, mz = (pp.z + bp.z) / 2, dx = bp.x - pp.x, dz = bp.z - pp.z, L = Math.hypot(dx, dz) || 1;
      const R = Math.max(10, L * 1.1);
      cam.position.set(mx - dz / L * R, pp.y + R * 0.8, mz + dx / L * R); cam.lookAt(mx, pp.y, mz); cam.updateMatrixWorld(true); game.renderNow();
    });
    await p.screenshot({ path: `${OUT}/boss_${id}_atk${k}_${r.kind}_over.png`, timeout: 180000 });
    shots.push(r);
  }
  fs.writeFileSync(`${OUT}/boss_${id}.json`, JSON.stringify({ info, shots }, null, 1));
  console.log(logs.slice(0, 12).join('\n'));
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
