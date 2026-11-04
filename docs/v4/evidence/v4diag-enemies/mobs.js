// Regular enemy close-ups + per-model stats + attack-windup gameplay shots.
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1';
const OUT = '/tmp/v4diag-enemies';
const port = 8100 + Math.floor(Math.random() * 900);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(port);
const LIST = (process.argv[2] || 'bokoblin,shaman,chuchu,chuchu:fire,chuchu:shadow,lizard,shroom,wolf,wraith,voidknight').split(',');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  const logs = [];
  p.on('console', m => { if (['error'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  await p.goto(`http://localhost:${port}/?test=1&cls=sword&level=20&quest=camps&zone=plains`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 120000 });
  await p.evaluate(() => { game.freeze(true); });
  const results = {};
  for (const spec of LIST) {
    const [type, variant] = spec.split(':');
    const r = await p.evaluate(({ type, variant }) => {
      const THREE = game.THREE;
      for (const o of game.enemies.list.slice()) { if (o.object) o.object.visible = false; }
      const pp = game.player.entity.object.position;
      const e = game.debug.spawn(type, { dist: 7, variant, element: variant });
      if (!e) return { err: 'nospawn' };
      e.sight = 0; e.facing = 0; // face +z (toward player who is at +z? player at pp, enemy at pp.z-7 → +z faces player)
      game.step(20, 1 / 60, false);
      e.facing = 0; e.object.rotation.y = 0; e.object.updateMatrixWorld(true);
      // stats
      let meshes = 0, tris = 0, outlineTris = 0, sprites = 0, mats = new Set(), bones = 0;
      e.object.traverse((o) => {
        if (o.isSprite) { if (o.visible) sprites++; return; }
        if (!o.isMesh || !o.visible) return;
        meshes++; const g = o.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
        const ic = o.isInstancedMesh ? o.count : 1;
        if (o.name === 'outline') outlineTris += n * ic; else tris += n * ic;
        mats.add(o.material.type + (o.material.vertexColors ? '+vc' : ''));
        if (o.isSkinnedMesh) bones = Math.max(bones, o.skeleton.bones.length);
      });
      const pos = e.object.position.clone(), h = e.height;
      const cam = game.camera;
      const dist = Math.max(2.4, h * 1.55);
      cam.position.set(pos.x + dist * 0.45, pos.y + h * 0.75, pos.z + dist);
      cam.lookAt(pos.x, pos.y + h * 0.5, pos.z);
      cam.updateMatrixWorld(true);
      game.renderNow();
      window.__e = e;
      return { name: e.name, hp: e.maxHp, radius: e.radius, height: h, meshes, tris: Math.round(tris), outlineTris: Math.round(outlineTris), sprites, mats: [...mats], bones, resist: e.resist, voidShield: e.voidShield || 0, poiseMax: e.poiseMax, breakMax: e.breakMax || 0 };
    }, { type, variant });
    await p.screenshot({ path: `${OUT}/mob_${spec.replace(':', '_')}_front.png` });
    // side/back view
    await p.evaluate(() => {
      const e = window.__e, pos = e.object.position, h = e.height, cam = game.camera, dist = Math.max(2.4, h * 1.55);
      cam.position.set(pos.x - dist, pos.y + h * 0.9, pos.z - dist * 0.35); cam.lookAt(pos.x, pos.y + h * 0.5, pos.z); cam.updateMatrixWorld(true); game.renderNow();
    });
    await p.screenshot({ path: `${OUT}/mob_${spec.replace(':', '_')}_side.png` });
    // aggro: step until an attack windup state, then render a gameplay-distance view
    const w = await p.evaluate(() => {
      const e = window.__e; e.sight = 40; const pe = game.player.entity;
      pe.invulnerable = true;
      const seen = []; let shot = null;
      const WIND = { windup: 1, leapPrep: 1, leap: 1, lungePrep: 1, cast: 1, thrustWind: 1, lob: 1, crouch: 1, slashWind: 1, slamWind: 1 };
      for (let i = 0; i < 900; i++) {
        game.step(1, 1 / 60, false);
        if (seen[seen.length - 1] !== e.state) seen.push(e.state);
        if (WIND[e.state] && e.stateT > 0.3) { shot = e.state; break; }
        if (!e.alive) break;
      }
      const pos = e.object.position, pp = pe.object.position, cam = game.camera;
      // typical 3rd-person camera: 6 m behind the player, 3 m up, looking at the enemy
      const dx = pos.x - pp.x, dz = pos.z - pp.z, L = Math.hypot(dx, dz) || 1;
      cam.position.set(pp.x - dx / L * 6, pp.y + 3.2, pp.z - dz / L * 6); cam.lookAt(pos.x, pos.y + 1, pos.z); cam.updateMatrixWorld(true);
      game.renderNow();
      const vs = game.vfx?.stats?.();
      return { seen: seen.slice(0, 14), shot, dist: +e.distP.toFixed(2), telegraphs: vs?.telegraphs };
    });
    await p.screenshot({ path: `${OUT}/mob_${spec.replace(':', '_')}_windup.png` });
    await p.evaluate(() => { const e = window.__e; game.enemies.remove?.(e); if (e.object.parent) e.object.parent.remove(e.object); e.alive = false; game.player.entity.hp = game.player.entity.maxHp; });
    results[spec] = { ...r, windup: w };
    console.log(spec, JSON.stringify(results[spec]));
  }
  fs.writeFileSync(`${OUT}/mobs.json`, JSON.stringify(results, null, 1));
  console.log(logs.slice(0, 20).join('\n'));
  await b.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
