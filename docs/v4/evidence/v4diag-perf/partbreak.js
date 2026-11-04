const { chromium } = require('/opt/node-tools/node_modules/playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = '/home/user/changdongdemo1'; const port = 8100 + Math.floor(Math.random() * 899);
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(res); }).listen(port);
const cls = process.argv[2] || 'mage';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://localhost:${port}/?test=1&cls=${cls}&skills=preset:endgame_${cls}&level=30`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 180000 });
  const r = await p.evaluate(() => {
    const g = game, T = g.THREE; g.freeze(true); g.debug.tp({ x: -6, z: 20 }); g.step(30, 1 / 60, false);
    const NAMES = { 0: 'soft/glow', 1: 'spark', 2: 'smoke', 3: 'shard', 4: 'ember', 5: 'snow', 6: 'leaf', 7: 'ring', 8: 'streak', 9: 'crescent', 10: 'puff/dust', 11: 'dot', 12: 'flare', 13: 'rock', 14: 'bolt', 15: 'mote', 16: 'rune', 17: 'petal', 18: 'droplet', 19: 'feather', 20: 'bubble', 21: 'wisp', 22: 'thorn', 23: 'raven' };
    const pp = g.player.object.position.clone(); const foes = [];
    const types = ['bokoblin', 'chuchu', 'lizard', 'wolf', 'shroom', 'wraith', 'voidknight', 'shaman', 'bokoblin', 'chuchu', 'wolf', 'lizard'];
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, rr = 6 + (i % 3) * 2; const e = g.enemies.spawn(types[i], new T.Vector3(pp.x + Math.sin(a) * rr, 0, pp.z + Math.cos(a) * rr), { level: 28 }); if (e) { e.hp = e.maxHp = 1e7; e.aggro = true; foes.push(e); } }
    const S = g.skills; const ids = g.progression.learnedSkills().filter((i) => S.defs.get(i) && S.defs.get(i).type !== 'passive' && !['basic', 'passive'].includes(S.defs.get(i).slot));
    const cam = g.camera, H = 720, W = 1280, f = H / 2 / Math.tan(cam.fov * Math.PI / 360), v = new T.Vector3();
    const agg = {}; let samples = 0; const perSkill = {};
    let k = 0, cur = null;
    for (let fr = 0; fr < 12 * ids.length * 2; fr++) {
      if (fr % 24 === 0) { cur = ids[k++ % ids.length]; S.resetCooldowns?.(); const tgt = foes[k % foes.length]; const o = g.player.object.position.clone(); o.y += 1.5; const t = tgt.object.position.clone(); t.y += 1; try { S.cast(cur, { free: true, aim: { origin: o, dir: t.clone().sub(o).normalize(), point: t, target: tgt } }); } catch (_) {} }
      g.step(1, 1 / 60, false);
      if (fr % 4 === 0) {
        g.camera.updateMatrixWorld(); samples++;
        let tot = 0;
        g.scene.traverse((o) => {
          if (o.name !== 'vfx-additive' && o.name !== 'vfx-alpha') return;
          const geo = o.geometry, ip = geo.attributes.iPos.array, im = geo.attributes.iMisc.array, iv = geo.attributes.iVel.array, n = geo.instanceCount;
          for (let i = 0; i < n; i++) {
            v.set(ip[i * 4], ip[i * 4 + 1], ip[i * 4 + 2]).applyMatrix4(cam.matrixWorldInverse); if (v.z > -0.1) continue;
            let s = ip[i * 4 + 3] * f / -v.z; const st = iv[i * 4 + 3] > 0 ? 1 + Math.hypot(iv[i * 4], iv[i * 4 + 1], iv[i * 4 + 2]) * iv[i * 4 + 3] : 1;
            const a = Math.min(s * s * st, W * H); tot += a;
            const key = o.name.slice(4) + ':' + (NAMES[Math.round(im[i * 2 + 1])] || im[i * 2 + 1]);
            const A = agg[key] || (agg[key] = { n: 0, px: 0, big: 0 }); A.n++; A.px += a; if (a > W * H * 0.02) A.big++;
          }
        });
        const P = perSkill[cur] || (perSkill[cur] = { samples: 0, screens: 0, max: 0 }); P.samples++; P.screens += tot / (W * H); P.max = Math.max(P.max, tot / (W * H));
      }
    }
    const rows = Object.entries(agg).map(([k, a]) => [k, +(a.n / samples).toFixed(0), +(a.px / samples / (W * H)).toFixed(2), +(a.big / samples).toFixed(1)]).sort((a, b) => b[2] - a[2]);
    const ps = Object.entries(perSkill).map(([k, P]) => [k, +(P.screens / P.samples).toFixed(1), +P.max.toFixed(1)]).sort((a, b) => b[1] - a[1]);
    return { samples, byKind: rows, perSkill: ps, settings: { particleScale: g.settings.values.particleScale, eq: g.settings.values.effectQuality } };
  });
  fs.writeFileSync(`/tmp/v4diag-perf/partbreak_${cls}.json`, JSON.stringify(r, null, 1));
  console.log(cls, JSON.stringify(r.byKind.slice(0, 12)), '\nperSkill', JSON.stringify(r.perSkill));
  await b.close(); server.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
