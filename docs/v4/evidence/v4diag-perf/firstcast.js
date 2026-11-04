// node firstcast.js <cls>  — cast every learned skill once on a fresh page; record program links / new materials / texture uploads per skill
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1'; const port = 8100 + Math.floor(Math.random() * 899);
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(res); }).listen(port);
const cls = process.argv[2] || 'mage';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(`http://localhost:${port}/?test=1&cls=${cls}&skills=preset:endgame_${cls}&level=30`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 180000 });
  await p.evaluate(() => game.freeze(true));
  await p.evaluate(fs.readFileSync(__dirname + '/inject.js', 'utf8'));
  const r = await p.evaluate(() => {
    const g = game, T = g.THREE, R = g.renderer; g.debug.tp({ x: -6, z: 20 }); g.step(30, 1 / 60, false);
    for (let i = 0; i < 3; i++) PROF.step(1 / 60, true);
    const pp = g.player.object.position.clone();
    const foes = []; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; const e = g.enemies.spawn(['bokoblin','wolf','lizard','chuchu','shroom','wraith'][i], new T.Vector3(pp.x + Math.sin(a) * 7, 0, pp.z + Math.cos(a) * 7), { level: 28 }); if (e) { e.hp = e.maxHp = 1e7; foes.push(e); } }
    for (let i = 0; i < 5; i++) PROF.step(1 / 60, true);
    const S = g.skills; const ids = g.progression.learnedSkills().filter((i) => S.defs.get(i) && S.defs.get(i).type !== 'passive');
    const out = [];
    let k = 0;
    for (const id of ids) {
      const pr0 = R.info.programs.length, gl0 = { ...PROF.gl }, id0 = PROF.ids();
      S.resetCooldowns?.(); const tgt = foes[k++ % foes.length];
      const o = g.player.object.position.clone(); o.y += 1.5; const t = tgt.object.position.clone(); t.y += 1;
      let err = null; const t0 = performance.now();
      try { S.cast(id, { free: true, aim: { origin: o, dir: t.clone().sub(o).normalize(), point: t, target: tgt } }); } catch (e) { err = e.message; }
      const castMs = performance.now() - t0;
      let worst = 0; for (let i = 0; i < 20; i++) { PROF.SYNC(); const a = performance.now(); g.step(1, 1 / 60, true); PROF.SYNC(); worst = Math.max(worst, performance.now() - a); }
      const id1 = PROF.ids();
      out.push({ id, slot: S.defs.get(id)?.slot, newPrograms: R.info.programs.length - pr0, links: PROF.gl.link - gl0.link, texUp: PROF.gl.tex - gl0.tex, newMats: id1.mat - id0.mat, newGeos: id1.geo - id0.geo, newObj: id1.obj - id0.obj, castMs: +castMs.toFixed(1), worstSyncedFrameMs: +worst.toFixed(0), err });
      g.step(60, 1 / 60, false);
    }
    return { programsEnd: R.info.programs.length, out };
  });
  fs.writeFileSync(`/tmp/v4diag-perf/firstcast_${cls}.json`, JSON.stringify(r, null, 1));
  console.log(cls, 'programs', r.programsEnd); for (const x of r.out) if (x.newPrograms || x.links || x.newMats > 3 || x.newGeos > 3 || x.worstSyncedFrameMs > 1500) console.log(JSON.stringify(x));
  await b.close(); server.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
