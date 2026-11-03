// playtest3 harness (CONTRACT §21). Owned by core. Used by tools/playtest3.js and every tools/playtest3/<owner>.js section.
//
// Node side:   const pg = await PT.boot('&cls=paladin')   → a booted, frozen page (window.PT installed in it)
//              await pg.run('label', (arg) => { ...in page... }, arg)   → returns the in-page result; checks are collected
//              PT.check(name, cond, info)  (node-side assertion)   PT.skip(name, reason)   PT.note(text)
//              pg.errors()  → console errors / page errors so far (expected 404s of not-yet-existing modules filtered)
//              await pg.close()
// In page:     PT.check(name, cond, info) · PT.skip(name, reason) · PT.step(seconds) (fixed 60 Hz, deterministic)
//              PT.dummyRing(n, r, {aggro=false, hp=1e6}) → dummies (xpValue 0) · PT.frameStats() → {calls, tris, programs, …}
//              PT.countEvents(name) → count since boot (or since PT.resetCounts()) · PT.tp(x, z) · PT.heal()
//              PT.fixture(name) → await import('/tools/playtest3/fixtures/<name>.js').default
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

function startServer(root = ROOT) {
  const port = 8100 + Math.floor(Math.random() * 900);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve({ server, port }));
  });
}

/** Module files main.js imports; a 404 for one that does not exist on disk yet is an expected stub, not an error. */
const MODULE_FILES = ['world', 'vfx', 'combat', 'audio', 'player', 'spells', 'sword', 'skills', 'enemies', 'story', 'cinematic', 'ui'];
function missingModules(root = ROOT) { return MODULE_FILES.filter((m) => !fs.existsSync(path.join(root, 'src', m + '.js'))); }

// ---------------- in-page helpers (serialised into the page) ----------------
function installInPage() {
  const g = window.game, T = g.THREE;
  if (window.PT && window.PT.__v3) return true;
  const PT = window.PT = { __v3: true, checks: [], notes: [] };
  g.freeze(true);
  const counts = {};
  const emit = g.events.emit.bind(g.events);
  g.events.emit = (n, p) => { counts[n] = (counts[n] || 0) + 1; return emit(n, p); };
  PT.check = (name, cond, info) => { PT.checks.push({ name, ok: !!cond, info: info === undefined ? null : info }); return !!cond; };
  PT.skip = (name, reason) => { PT.checks.push({ name, skip: true, info: reason || null }); };
  PT.note = (s) => PT.notes.push(String(s));
  PT.step = (sec) => g.step(Math.max(1, Math.round(sec * 60)), 1 / 60);
  PT.countEvents = (name) => counts[name] || 0;
  PT.resetCounts = (name) => { if (name) delete counts[name]; else for (const k of Object.keys(counts)) delete counts[k]; };
  PT.heal = () => { const p = g.player; if (!p) return; p.hp = p.maxHp; if (p.entity) p.entity.hp = p.maxHp; p.mp = p.maxMp; p.stamina = p.maxStamina; };
  PT.tp = (x, z) => {
    const p = g.player?.object?.position; if (!p) return;
    const W = g.world; const h = W.getGroundHeight ? W.getGroundHeight(x, z) : (W.getHeight ? W.getHeight(x, z) : 0);
    p.set(x, h + 0.05, z); g.player.entity?.velocity?.set?.(0, 0, 0); PT.step(0.1);
  };
  PT.dummyRing = (n = 6, r = 6, { aggro = false, hp = 1e6 } = {}) => {
    const pp = g.player?.object?.position || new T.Vector3();
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = pp.x + Math.sin(a) * r, z = pp.z + Math.cos(a) * r;
      const W = g.world; const y = W.getGroundHeight ? W.getGroundHeight(x, z) : (W.getHeight ? W.getHeight(x, z) : 0);
      const pos = new T.Vector3(x, y, z);
      const d = g.debug?.spawnDummy ? g.debug.spawnDummy(pos, { aggro, hp, facing: a + Math.PI }) : g.enemies?.spawn?.('dummy', pos, {});
      if (d) { d.xpValue = 0; if (hp) { d.hp = d.maxHp = hp; } if (aggro) { d.aggro = true; d.debugAggro = true; } out.push(d); }
    }
    PT.step(0.05);
    return out;
  };
  /** One rendered frame's draw stats. renderer.info.autoReset is switched off around it (same as playtest2:383). */
  PT.frameStats = () => {
    if (g.debug?.drawStats) { const s = g.debug.drawStats(); if (s) return s; }
    const inf = g.renderer.info; const prev = inf.autoReset; inf.autoReset = false; inf.reset();
    g.step(1, 1 / 60, true);
    const out = { calls: inf.render.calls, tris: inf.render.triangles, programs: inf.programs?.length ?? 0 };
    inf.autoReset = prev; return out;
  };
  PT.fixture = async (name) => (await import(`/tools/playtest3/fixtures/${name}.js?${Date.now()}`)).default;
  PT.drain = () => { const c = PT.checks.splice(0), n = PT.notes.splice(0); return { checks: c, notes: n }; };
  return true;
}

function createHarness({ out = console.log, viewport = { width: 640, height: 360 }, root = ROOT } = {}) {
  const results = [];   // {section, name, ok|skip, info}
  let browser = null, srv = null, section = 'main';
  const missing = missingModules(root);
  const missRe = missing.length ? new RegExp(`/src/(${missing.join('|')})\\.js`) : null;

  const PT = {
    root, missing,
    get section() { return section; },
    setSection(s) { section = s; },
    check(name, cond, info) {
      const ok = !!cond; results.push({ section, name, ok, info: info === undefined ? null : info });
      out(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${info != null && !ok ? '  ' + JSON.stringify(info).slice(0, 400) : ''}`);
      return ok;
    },
    skip(name, reason) { results.push({ section, name, skip: true, info: reason }); out(`  SKIP  ${name}  (${reason || ''})`); },
    note(s) { out(`  ..    ${s}`); },
    results,
    async start() {
      if (!srv) srv = await startServer(root);
      if (!browser) browser = await chromium.launch({ args: LAUNCH_ARGS });
      return srv.port;
    },
    async stop() { try { await browser?.close(); } catch (_) { /* */ } try { srv?.server.close(); } catch (_) { /* */ } browser = null; srv = null; },
    url(params = '') { return `http://localhost:${srv.port}/?test=1${params}`; },
    /** Boot ?test=1<params>; wait for game.ready; freeze and install window.PT. opts.init(page) runs before navigation. */
    async boot(params = '', opts = {}) {
      await PT.start();
      const page = await browser.newPage({ viewport: opts.viewport || viewport });
      const logs = [];
      page.on('console', (m) => {
        const t = m.type(); if (t !== 'error' && t !== 'warning') return;
        const loc = m.location?.()?.url || '';
        const text = m.text();
        logs.push({ type: t, text: text.slice(0, 500), url: loc });
      });
      page.on('pageerror', (e) => logs.push({ type: 'pageerror', text: `${e.message} ${(e.stack || '').split('\n').slice(1, 3).join(' ')}`.slice(0, 600) }));
      if (opts.init) await opts.init(page);
      await page.goto(PT.url(params));
      let ready = true;
      await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: opts.timeout || 120000 }).catch(() => { ready = false; });
      if (ready) await page.evaluate(installInPage);
      const pg = {
        page, ready, params,
        /** console errors + page errors (expected 404s/stub warnings of not-yet-existing module files filtered). */
        errors() {
          return logs.filter((l) => {
            if (l.type === 'warning') return false;
            if (/Failed to load resource/.test(l.text) && missRe && missRe.test(l.url || '')) return false;
            return true;
          }).map((l) => `[${l.type}] ${l.text}`);
        },
        warnings() { return logs.filter((l) => l.type === 'warning').map((l) => l.text); },
        async run(label, fn, arg) {
          let res, err = null;
          try { res = await page.evaluate(fn, arg); } catch (e) { err = e; }
          const { checks, notes } = await page.evaluate(() => (window.PT ? window.PT.drain() : { checks: [], notes: [] })).catch(() => ({ checks: [], notes: [] }));
          for (const n of notes) PT.note(`${label}: ${n}`);
          for (const c of checks) {
            if (c.skip) PT.skip(`${label}: ${c.name}`, c.info);
            else PT.check(`${label}: ${c.name}`, c.ok, c.info);
          }
          if (err) PT.check(`${label}: no exception`, false, String(err.message || err).slice(0, 500));
          return res;
        },
        async eval(fn, arg) { return page.evaluate(fn, arg); },
        async close() { try { await page.close(); } catch (_) { /* */ } },
      };
      return pg;
    },
    summary() {
      const pass = results.filter((r) => r.ok === true).length, fail = results.filter((r) => r.ok === false && !r.skip).length;
      const skip = results.filter((r) => r.skip).length;
      return { pass, fail, skip, failures: results.filter((r) => r.ok === false && !r.skip).map((r) => `${r.section}: ${r.name}`) };
    },
  };
  return PT;
}

module.exports = { createHarness, startServer, missingModules, installInPage, LAUNCH_ARGS, ROOT };
