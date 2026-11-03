// Usage: node tools/bootcheck.js [config …]   (config = extra URL params, e.g. '&cls=paladin')
// Boots URL configs headless (no screenshots) and prints state, stubbed modules, draw calls / triangles / programs and
// console errors. Default configs (CONTRACT §21): one per class with its starter preset, the final boss, the legacy
// configs, and two boot-safety configs that temporarily rename src/skills/ and src/enemies/bosses/ away.
// Exit code 1 if a config does not reach 'playing' or throws an uncaught page error.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(__dirname, '..');
const port = 8100 + Math.floor(Math.random() * 900);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
}).listen(port);

const CLASSES = ['mage', 'sword', 'ranger', 'paladin', 'spiritcaller', 'shadowblade'];
const SAFETY = { '@noSkills': 'src/skills', '@noBosses': 'src/enemies/bosses' };
const defaults = [
  ...CLASSES.map((c) => `&cls=${c}&skills=preset:starter_${c}`),
  '&quest=final&boss=nidhoggra',
  '', '&cls=sword&path=all', '&cls=sword&path=master&el=fire', '&path=master&el=ice', '&cls=none', '&intro=1',
  '@noSkills', '@noBosses',
];
const configs = process.argv.slice(2).length ? process.argv.slice(2) : defaults;

// renamed directories are always restored, even on Ctrl-C
const renamed = [];
function restore() { while (renamed.length) { const [from, to] = renamed.pop(); try { fs.renameSync(to, from); } catch (e) { console.error('RESTORE FAILED', from, e.message); } } }
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('exit', restore);

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = 0;
  for (const c of configs) {
    let url = c, label = c || '(default)';
    if (SAFETY[c]) {
      const dir = path.join(root, SAFETY[c]), away = dir + '.__bootcheck_away';
      if (fs.existsSync(dir)) { fs.renameSync(dir, away); renamed.push([dir, away]); label = `${c} (${SAFETY[c]}/ renamed away)`; }
      else label = `${c} (${SAFETY[c]}/ not present)`;
      url = c === '@noBosses' ? '&quest=final&boss=nidhoggra' : '&cls=paladin';
    }
    const p = await b.newPage({ viewport: { width: 640, height: 360 } });
    const logs = [], pageErrors = [];
    p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
    p.on('pageerror', (e) => { pageErrors.push(e.message); logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`); });
    await p.goto(`http://localhost:${port}/?test=1${url}`);
    await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 120000 }).catch(() => logs.push('[harness] ready timeout'));
    const info = await p.evaluate(() => {
      game.freeze(true); game.step(240, 1 / 60);
      const ds = game.debug?.drawStats?.() || {};
      return { state: game.state, stubbed: game.stubbed, cls: game.progression.cls, level: game.progression.level, stage: game.story?.stage,
        boss: game.enemies?.boss?.bossId || game.enemies?.boss?.id || game.enemies?.boss?.type || null, calls: ds.calls, tris: ds.tris, programs: ds.programs };
    }).catch((e) => ({ err: e.message }));
    const okStates = /intro=1|cls=none/.test(url) ? ['playing', 'cutscene', 'dialogue'] : ['playing'];
    const ok = okStates.includes(info.state) && !pageErrors.length;
    if (!ok) failed++;
    console.log(`== ${label}: ${JSON.stringify(info)}${ok ? '' : '  <-- NOT OK'}`);
    const errs = logs.filter((l) => !l.startsWith('[warning]'));
    console.log(errs.length ? errs.slice(0, 20).join('\n') : '   no console errors');
    await p.close();
    restore();
  }
  await b.close(); server.close();
  process.exit(failed ? 1 : 0);
})();
