// playtest4 harness (PLAN v4 §7.8). Owned by core. Used by tools/playtest4.js and every tools/playtest4/<owner>.js section.
//
// Node side
//   const pg = await PT.boot(params, {w, h})   booted, frozen page (window.PT installed); always adds prod=1&governor=0&seed=1
//                                              unless params override them. w×h default 640×360 (never above 1280×720).
//   const pg = await PT.bootScene(id, {w, h, params})   boot with the §1.1 scene's URL params, then in-page PT.scene(id)
//   await pg.run(label, (arg) => { …in page… }, arg)    result returned; in-page PT.check/skip/note collected
//   PT.check(name, cond, info) · PT.skip(name, why) · PT.note(text) · PT.flags {perf, full, sheets}
//   await PT.alloc(pg, seconds, {cadence, cls})  CDP HeapProfiler sampling → {mbPerGameSec, totalMB, top:[[site, MB/s]], gcPauses:null}
//   await PT.sheet(pg, frames, path, {cols, cellW, cellH, labels})  contact sheet PNG (≤ 150 KB) from data URLs
//   await PT.gpuRatioPages(pgA, pgB, {pairs = 5, prep})  ABAB frozen-frame GPU ratio A/B across two pages (median of pair ratios)
//   await PT.baseline(params, opts)  boots the v3 baseline build (git archive of V3_REF into tools/playtest4/out/v3base)
//   pg.errors() · pg.warnings() · pg.close() · pg.eval(fn, arg) · pg.cdp() (CDP session)
//
// In page (window.PT)
//   PT.check / skip / note · PT.step(sec) (60 Hz, deterministic) · PT.tp(x, z) · PT.heal() · PT.fixture(name)
//   PT.scene(id)             S-<zone>, F-<cls>, B-<boss>, R-<cls>, R-boss, P-bench set-up (positions, enemies, camera; deterministic)
//   PT.sweep(fn)             runs fn() at 4 yaws (0, 90, 180, 270°) → {max, median, values}
//   PT.draws()               renders one frame → {calls, tris, shadowCalls, shadowTris, overlayCalls, overlayTris, postCalls,
//                            transparent, additive, uploadBytes, uploads, programs, total, totalTris, byGroup}
//   PT.fragments({owner})    counting override → shaded fragments ÷ screen px {scene, transparent, post, player, enemy, world}
//   PT.rotate(cls, seconds, {cadence = 0.5, ultEvery = 7, warm = 1, sampleEvery = 10}) → [{t, draws, coverage, particles}]
//   PT.simMs(frames) · PT.cpuFrame(frames) → median ms (render off) / {frameMs, submitMs, p95, p99}
//   PT.longFrames(seconds) (async) → {over33, over50, longTasks, frames}
//   PT.pixels.render() → {px, w, h} · .diff(toggle, {thr = 25}) · .luma(buf) · .mask(objects) · .sobel(mask, buf) · .iou(a, b)
//   PT.armor(e) · PT.keepAlive() · PT.waitEvent(name, sec) · PT.events(name) · PT.countEvents(name) · PT.resetCounts()
//   PT.gpuSync() · PT.gpuMs(fn, n) · PT.gpuRatio(setA, setB, {pairs = 5})
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out');
const V3_REF = 'de5d823';   // finished, published v3 (+ the v4 plan docs): the GPU-ratio baseline
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const DEFAULT_PARAMS = { prod: '1', governor: '0', seed: '1' };
const MODULE_FILES = ['world', 'vfx', 'combat', 'tells', 'audio', 'player', 'spells', 'sword', 'skills', 'enemies', 'story', 'cinematic', 'ui'];

function startServer(root) {
  return new Promise((resolve, reject) => {
    const tryPort = (attempt) => {
      const port = 8100 + Math.floor(Math.random() * 900);
      const server = http.createServer((req, res) => {
        let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
        const f = path.join(root, p);
        if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(f).pipe(res);
      });
      server.once('error', (e) => { if (attempt < 8) tryPort(attempt + 1); else reject(e); });
      server.listen(port, () => resolve({ server, port, root }));
    };
    tryPort(0);
  });
}
function missingModules(root) { return MODULE_FILES.filter((m) => !fs.existsSync(path.join(root, 'src', m + '.js'))); }

/** Merge `?test=1` params: defaults (prod=1&governor=0&seed=1) unless the caller passes the key. */
function buildQuery(params = '', defaults = DEFAULT_PARAMS) {
  const s = String(params || '').replace(/^[?&]+/, '');
  const q = new URLSearchParams(s);
  for (const [k, v] of Object.entries(defaults)) if (!q.has(k)) q.set(k, v);
  q.delete('test');
  const rest = q.toString();
  return '?test=1' + (rest ? '&' + rest : '');
}

/** URL params of the §1.1 scenes (in-page PT.scene(id) does the rest). */
const CLASSES = ['mage', 'sword', 'ranger', 'paladin', 'spiritcaller', 'shadowblade'];
const BOSSES = ['golem', 'hydra', 'nox', 'treant', 'kalis', 'nidhoggra'];
function sceneParams(id) {
  const [kind, arg] = [id.split('-')[0], id.slice(id.indexOf('-') + 1)];
  if (kind === 'S') return `&cls=mage&level=30&skills=preset:endgame_mage${arg === 'plains' ? '' : '&zone=' + arg}`;
  if (kind === 'F') return `&cls=${arg}&level=30&skills=preset:endgame_${arg}`;
  if (kind === 'B') return `&cls=mage&level=${arg === 'nidhoggra' ? 25 : 20}&skills=preset:endgame_mage${arg === 'nidhoggra' ? '&quest=final' : ''}&boss=${arg}`;
  if (kind === 'R') return arg === 'boss' ? '&cls=mage&level=30&skills=preset:endgame_mage&boss=kalis' : `&cls=${arg}&level=30&skills=preset:endgame_${arg}`;
  if (kind === 'P') return '&cls=mage&level=30&skills=preset:endgame_mage';
  throw new Error('unknown scene ' + id);
}
/** Default scene list (§1.0): F-mage, F-ranger, B-nidhoggra, R-mage, R-sword, R-boss and all S-*; --full adds the rest. */
function sceneList({ full = false } = {}) {
  const S = ['S-village', 'S-plains', 'S-mirwen', 'S-elderwood'];
  if (!full) return [...S, 'F-mage', 'F-ranger', 'B-nidhoggra', 'R-mage', 'R-sword', 'R-boss'];
  return [...S, ...CLASSES.map((c) => 'F-' + c), ...BOSSES.map((b) => 'B-' + b), ...CLASSES.map((c) => 'R-' + c), 'R-boss'];
}

// =====================================================================================================================
// in-page helpers (serialised into the page)
// =====================================================================================================================
function installInPage() {
  const g = window.game, T = g.THREE, R = g.renderer, gl = R.getContext();
  if (window.PT && window.PT.__v4) return true;
  const PT = window.PT = { __v4: true, checks: [], notes: [] };
  g.freeze(true);
  // ---- checks
  PT.check = (name, cond, info) => { PT.checks.push({ name, ok: !!cond, info: info === undefined ? null : info }); return !!cond; };
  PT.skip = (name, reason) => { PT.checks.push({ name, skip: true, info: reason || null }); };
  PT.note = (s) => PT.notes.push(String(s));
  PT.drain = () => ({ checks: PT.checks.splice(0), notes: PT.notes.splice(0) });
  PT.step = (sec, render = false) => g.step(Math.max(1, Math.round(sec * 60)), 1 / 60, render);
  PT.fixture = async (name) => (await import(`/tools/playtest4/fixtures/${name}.js?${Date.now()}`)).default;
  const gh = (x, z) => { const W = g.world; return W.getGroundHeight ? W.getGroundHeight(x, z) : (W.getHeight ? W.getHeight(x, z) : 0); };
  PT.groundHeight = gh;
  PT.tp = (x, z, settle = 0.1) => {
    const p = g.player?.object?.position; if (!p) return;
    p.set(x, gh(x, z) + 0.05, z); g.player.entity?.velocity?.set?.(0, 0, 0); if (settle > 0) PT.step(settle);
  };
  PT.heal = () => { const p = g.player; if (!p) return; p.hp = p.maxHp; if (p.entity) p.entity.hp = p.maxHp; p.mp = p.maxMp; p.stamina = p.maxStamina; };
  PT.look = (yaw, pitch = -0.2) => { if (g.player?.setLook) g.player.setLook(yaw, pitch); else { g.camera.rotation.set(pitch, yaw, 0, 'YXZ'); } };

  // ---- events (timestamps on game.enemyTime and game.time)
  const counts = {}, logs = {};
  const emit = g.events.emit.bind(g.events);
  g.events.emit = (n, p) => {
    counts[n] = (counts[n] || 0) + 1;
    const L = logs[n]; if (L) { L.push({ t: g.time, et: g.enemyTime, rt: g.realTime, p }); if (L.length > 500) L.shift(); }
    return emit(n, p);
  };
  PT.countEvents = (name) => counts[name] || 0;
  PT.resetCounts = (name) => { if (name) delete counts[name]; else for (const k of Object.keys(counts)) delete counts[k]; };
  /** Start (or read) the event log of `name`: [{t, et, rt, p}]. */
  PT.events = (name) => logs[name] || (logs[name] = []);
  /** Steps game time until `name` fires (or sec game seconds pass). Returns the record or null. */
  PT.waitEvent = (name, sec = 5) => {
    const L = PT.events(name), n0 = L.length, frames = Math.round(sec * 60);
    for (let i = 0; i < frames; i++) { g.step(1, 1 / 60); if (L.length > n0) return L[n0]; }
    return null;
  };

  // ---- enemies
  PT.enemies = () => (g.enemies?.all || g.enemies?.list || g.entities || []).filter((e) => e && e.alive && e.team !== 'player' && !e.isProp);
  /** Test-only super armour: mobs keep attacking (no flinch / stagger / death). Mobs may honour e.ptArmor. */
  PT.armor = (e) => {
    if (!e) return e;
    e.ptArmor = true; e.hp = e.maxHp = 1e7; e.staggerDmg = 1e9; e.noTumble = true; e.poiseMax = 0; e.poise = 0;
    e.aggro = true; e.debugAggro = true; e.alert = true; e.xpValue = 0;
    return e;
  };
  PT.keepAlive = () => {
    const pl = g.player; if (pl) { pl.hp = pl.maxHp; if (pl.entity) pl.entity.hp = pl.maxHp; pl.mp = pl.maxMp; pl.stamina = pl.maxStamina; }
    for (const e of PT.enemies()) if (e.ptArmor && e.hp < 1e6) e.hp = 1e7;
  };
  PT.clearEnemies = (keepBoss = false) => {
    for (const e of PT.enemies()) {
      if (keepBoss && e.isBoss) continue;
      if (e.isDummy && !e.ptKeep) { e.object?.parent?.remove?.(e.object); }
      e.alive = false; e.object && (e.object.visible = false);
      try { g.combat?.unregister?.(e); } catch (_) { /* */ }
    }
    PT.step(0.05);
  };

  // ---- §1.1 scenes
  const PLAINS = { x: -20, z: 45 };
  const F_ROSTER = [['bokoblin'], ['bokoblin'], ['wolf'], ['wolf'], ['lizard'], ['shaman'], ['voidknight'], ['shroom'], ['wraith'],
    ['chuchu', { variant: 'normal' }], ['chuchu', { variant: 'fire' }], ['chuchu', { variant: 'ice' }]];
  const R_ROSTER = [['bokoblin', -2, -6], ['bokoblin', 2.5, -6.5], ['voidknight', 0, -8], ['wolf', -4, -8], ['wolf', 4, -8], ['lizard', -1, -10], ['shaman', 3, -12]];
  PT.sceneInfo = null;
  PT.spawnAt = (type, x, z, opts = {}) => {
    const pos = new T.Vector3(x, gh(x, z), z);
    let e = null;
    try { e = g.enemies?.spawn?.(type, pos, { ...opts }) || g.debug?.spawn?.(type, { ...opts, pos }); } catch (err) { PT.note(`spawn ${type} failed: ${err.message}`); }
    return e;
  };
  /** Set up a §1.1 scene in the booted page (deterministic with seed=1). Returns {id, spot, enemies, boss}. */
  PT.scene = (id) => {
    const kind = id.split('-')[0], arg = id.slice(id.indexOf('-') + 1);
    let spot = PLAINS;
    if (kind === 'S' && arg !== 'plains') {
      const zs = g.world?.zones; const z = zs && (Array.isArray(zs) ? zs.find((q) => q.id === arg) : zs[arg]);
      const c = z?.center || z?.position || (z ? { x: z.x, z: z.z } : null);
      if (c) spot = { x: c.x, z: c.z };
      if (arg === 'village' && g.world?.playerSpawn) spot = { x: g.world.playerSpawn.x, z: g.world.playerSpawn.z };
    }
    if (kind !== 'B' && !(kind === 'R' && arg === 'boss')) PT.tp(spot.x, spot.z, 0.1);
    if (kind === 'S' || kind === 'P') PT.clearEnemies(false);
    const foes = [];
    if (kind === 'F' || kind === 'P') {
      PT.clearEnemies(false);
      const pp = g.player.object.position;
      F_ROSTER.forEach(([t, o], i) => {
        const a = (i / F_ROSTER.length) * Math.PI * 1.2 - Math.PI * 0.6, r = 6 + (i % 4) * 2;   // 6–12 m, in front (−z)
        const e = PT.spawnAt(t, pp.x + Math.sin(a) * r, pp.z - Math.cos(a) * r, o || {});
        if (e) foes.push(PT.armor(e));
      });
      PT.look(0, -0.22);
    } else if (kind === 'R') {
      if (arg !== 'boss') {
        PT.clearEnemies(false);
        const pp = g.player.object.position;
        for (const [t, dx, dz] of R_ROSTER) { const e = PT.spawnAt(t, pp.x + dx, pp.z + dz); if (e) foes.push(PT.armor(e)); }
      } else {
        PT.clearEnemies(true);
        const b = g.enemies?.boss; const pp = g.player.object.position;
        for (const [t, dx, dz] of R_ROSTER.slice(0, 2)) { const e = PT.spawnAt(t, pp.x + dx, pp.z + dz); if (e) foes.push(PT.armor(e)); }
        if (b) { b.ptArmor = true; foes.push(b); }
      }
      PT.look(0, -0.25);
    } else if (kind === 'B') {
      const b = g.enemies?.boss; if (b) { b.ptArmor = true; b.aggro = true; foes.push(b); }
    }
    PT.keepAlive();
    PT.step(0.1);
    PT.sceneInfo = { id, spot, enemies: foes.length, boss: g.enemies?.boss?.bossId || null };
    PT.foes = foes;
    return PT.sceneInfo;
  };
  /** Runs fn() at 4 yaws (0, 90, 180, 270°; pitch −0.15) and returns {max, median, values}. fn returns a number or {value}. */
  PT.sweep = (fn, { pitch = -0.15, settle = 0.05 } = {}) => {
    const values = [];
    for (let i = 0; i < 4; i++) {
      PT.look(i * Math.PI / 2, pitch); PT.step(settle);
      const r = fn(i); values.push(typeof r === 'number' ? r : r);
    }
    const nums = values.map((v) => (typeof v === 'number' ? v : (v?.value ?? v?.total ?? 0))).slice().sort((a, b) => a - b);
    return { max: nums[nums.length - 1], median: (nums[1] + nums[2]) / 2, values };
  };

  // ---- draw / upload instrumentation (installed once; counts only while M.on)
  const M = PT._m = { on: false, pass: 'other', f: null };
  const blankFrame = () => ({ scene: { calls: 0, tris: 0, transparent: 0, additive: 0 }, shadow: { calls: 0, tris: 0 }, overlay: { calls: 0, tris: 0 },
    post: { calls: 0, tris: 0, px: 0 }, other: { calls: 0, tris: 0 }, uploadBytes: 0, uploads: 0, texUploads: 0, byGroup: {} });
  const isAdd = (m) => m.blending === T.AdditiveBlending || (m.blending === T.CustomBlending && m.blendDst === T.OneFactor);
  let groupOf = null;   // object → group name (built per measured frame)
  const _vp = new Int32Array(4);
  const origRBD = R.renderBufferDirect.bind(R);
  R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (M.on && M.f) {
      const P = M.f[M.pass] || M.f.other;
      let n = geometry.index ? geometry.index.count : (geometry.attributes.position?.count || 0);
      const dr = geometry.drawRange; if (dr && dr.count !== Infinity) n = Math.min(n, dr.count);
      if (group) n = Math.min(n, group.count);
      let inst = 1;
      if (object.isInstancedMesh) inst = object.count; else if (geometry.isInstancedBufferGeometry) inst = geometry.instanceCount === Infinity ? 1 : geometry.instanceCount;
      const tris = (object.isMesh || object.isSkinnedMesh ? n / 3 : 0) * inst;
      P.calls++; P.tris += tris;
      if (M.pass === 'scene') {
        if (material.transparent) { P.transparent++; if (isAdd(material)) P.additive++; }
        if (groupOf) { const gname = groupOf(object); const G = M.f.byGroup[gname] || (M.f.byGroup[gname] = { calls: 0, tris: 0, shadowCalls: 0, shadowTris: 0 }); G.calls++; G.tris += tris; }
      } else if (M.pass === 'shadow' && groupOf) {
        const gname = groupOf(object); const G = M.f.byGroup[gname] || (M.f.byGroup[gname] = { calls: 0, tris: 0, shadowCalls: 0, shadowTris: 0 }); G.shadowCalls++; G.shadowTris += tris;
      } else if (M.pass === 'post') {
        const v = gl.getParameter(gl.VIEWPORT); _vp.set(v); P.px += _vp[2] * _vp[3];
      }
    }
    return origRBD(camera, scene, geometry, material, object, group);
  };
  const wrapGL = (name, fn) => { if (!gl[name]) return; const o = gl[name].bind(gl); gl[name] = (...a) => { if (M.on && M.f) fn(a); return o(...a); }; };
  wrapGL('bufferData', (a) => { M.f.uploads++; M.f.uploadBytes += a[1]?.byteLength || (typeof a[1] === 'number' ? a[1] : 0); });
  wrapGL('bufferSubData', (a) => { M.f.uploads++; const src = a[2]; M.f.uploadBytes += src ? (a[4] ? a[4] * (src.BYTES_PER_ELEMENT || 1) : (src.byteLength - (a[3] || 0) * (src.BYTES_PER_ELEMENT || 1))) : 0; });
  wrapGL('texSubImage2D', () => { M.f.texUploads++; });
  wrapGL('texImage2D', () => { M.f.texUploads++; });
  // pass attribution: shadow map, composer passes (RenderPass = scene, others = post), overlay (game.render.drawOverlay)
  const sm = R.shadowMap, smo = sm.render.bind(sm);
  sm.render = (...a) => { const prev = M.pass; M.pass = 'shadow'; try { return smo(...a); } finally { M.pass = prev; } };
  const wrapped = new WeakSet();
  const wrapPasses = () => {
    for (const p of g.composer.passes) {
      if (wrapped.has(p)) continue; wrapped.add(p);
      const isScene = p.constructor?.name === 'RenderPass' || (p.scene === g.scene && p.camera);
      const o = p.render.bind(p);
      p.render = (...a) => { const prev = M.pass; M.pass = isScene ? 'scene' : 'post'; try { return o(...a); } finally { M.pass = prev; } };
    }
  };
  if (g.render?.drawOverlay) {
    const od = g.render.drawOverlay.bind(g.render);
    g.render.drawOverlay = (...a) => { const prev = M.pass; M.pass = 'overlay'; try { return od(...a); } finally { M.pass = prev; } };
  }
  /** Object → group (world / player / enemies / fx / tells / ui) for per-owner draw shares. */
  const buildGroups = () => {
    const map = new Map();
    const mark = (root, name) => root?.traverse?.((o) => map.set(o, name));
    mark(g.render?.threatScene, 'tells');
    for (const e of PT.enemies()) mark(e.object, 'enemies');
    mark(g.player?.object, 'player');
    return (o) => {
      const v = map.get(o); if (v) return v;
      const ow = o.userData?.owner;
      if (ow === 'player') return 'fx';
      if (ow === 'enemy') return 'enemyFx';
      const nm = o.name || o.parent?.name || '';
      if (/^(vfx|spells|sword|skills|fx|kit)/i.test(nm)) return 'fx';
      if (/^(ui|beacon|hud)/i.test(nm)) return 'ui';
      return 'world';
    };
  };
  /** Measure one frame rendered by fn (default: one 1/60 step with render). */
  PT.measure = (fn, { groups = true } = {}) => {
    wrapPasses();
    const inf = R.info, prevAuto = inf.autoReset; inf.autoReset = false; inf.reset();
    groupOf = groups ? buildGroups() : null;
    M.f = blankFrame(); M.on = true; M.pass = 'other';
    try { (fn || (() => g.step(1, 1 / 60, true)))(); } finally { M.on = false; inf.autoReset = prevAuto; groupOf = null; }
    const f = M.f, W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    return {
      calls: f.scene.calls, tris: Math.round(f.scene.tris), shadowCalls: f.shadow.calls, shadowTris: Math.round(f.shadow.tris),
      overlayCalls: f.overlay.calls, overlayTris: Math.round(f.overlay.tris), postCalls: f.post.calls, postPasses: +(f.post.px / (W * H)).toFixed(3),
      transparent: f.scene.transparent, additive: f.scene.additive, uploadBytes: f.uploadBytes, uploads: f.uploads, texUploads: f.texUploads,
      programs: inf.programs?.length ?? 0, total: f.scene.calls + f.shadow.calls + f.overlay.calls,
      totalTris: Math.round(f.scene.tris + f.shadow.tris + f.overlay.tris), other: f.other.calls, byGroup: f.byGroup,
    };
  };
  PT.draws = (opts) => PT.measure(null, opts);

  // ---- fragment counting override (§7.8): every material outputs 1.0 with ONE/ONE blending into a HalfFloat target
  const fragRT = { rt: null, w: 0, h: 0 };
  const FRAG_KEY = '|ptcount';
  const patchMat = (m, count) => {
    if (m.userData.__ptSave) return;
    m.userData.__ptSave = { obc: m.onBeforeCompile, key: m.customProgramCacheKey, blending: m.blending, bs: m.blendSrc, bd: m.blendDst, be: m.blendEquation,
      bsa: m.blendSrcAlpha, bda: m.blendDstAlpha, bea: m.blendEquationAlpha, cw: m.colorWrite, tm: m.toneMapped, transparent: m.transparent };
    const S = m.userData.__ptSave;
    m.onBeforeCompile = function (sh, r) {
      if (S.obc) S.obc.call(this, sh, r);
      const fs = sh.fragmentShader, i = fs.lastIndexOf('}');
      sh.fragmentShader = fs.slice(0, i) + '\n  gl_FragColor = vec4(1.0);\n}\n';
    };
    const k0 = S.key;
    m.customProgramCacheKey = function () { return (k0 ? k0.call(this) : '') + FRAG_KEY; };
    m.blending = T.CustomBlending; m.blendSrc = T.OneFactor; m.blendDst = T.OneFactor; m.blendEquation = T.AddEquation;
    m.blendSrcAlpha = T.OneFactor; m.blendDstAlpha = T.OneFactor; m.blendEquationAlpha = T.AddEquation;
    m.colorWrite = count; m.needsUpdate = true;
  };
  const restoreMat = (m) => {
    const S = m.userData.__ptSave; if (!S) return;
    m.onBeforeCompile = S.obc; m.customProgramCacheKey = S.key || T.Material.prototype.customProgramCacheKey;
    m.blending = S.blending; m.blendSrc = S.bs; m.blendDst = S.bd; m.blendEquation = S.be;
    m.blendSrcAlpha = S.bsa; m.blendDstAlpha = S.bda; m.blendEquationAlpha = S.bea; m.colorWrite = S.cw;
    delete m.userData.__ptSave; m.needsUpdate = true;
  };
  const sumTarget = (rt, w, h) => {
    const buf = new Uint16Array(w * h * 4);
    R.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    let s = 0; for (let i = 0; i < buf.length; i += 4) s += T.DataUtils.fromHalfFloat(buf[i]);
    return s;
  };
  /**
   * Shaded fragments ÷ screen pixels of the current (frozen) frame, per pass. owner: 'player' | 'enemy' | 'world' |
   * function(object) → boolean restricts the counted objects (the others still occlude). Patched programs stay cached.
   */
  PT.fragments = ({ owner = null } = {}) => {
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const w = W, h = H;
    if (!fragRT.rt || fragRT.w !== w || fragRT.h !== h) {
      fragRT.rt?.dispose();
      fragRT.rt = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType });
      fragRT.w = w; fragRT.h = h;
    }
    const grp = buildGroups();
    const ownerOk = (o) => {
      if (!owner) return true;
      if (typeof owner === 'function') return owner(o);
      const gname = grp(o);
      return owner === 'player' ? gname === 'fx' : owner === 'enemy' ? (gname === 'enemies' || gname === 'enemyFx') : gname === 'world';
    };
    const run = (filter) => {
      const mats = [], hidden = [];
      g.scene.traverse((o) => {
        const ms = o.material; if (!ms || !(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
        for (const m of Array.isArray(ms) ? ms : [ms]) {
          if (!m || m.userData.__ptSave) continue;
          if (m.isRawShaderMaterial) { if (o.visible) { o.visible = false; hidden.push(o); } continue; }   // raw GLSL3: cannot be patched; not counted
          patchMat(m, filter(o, m)); mats.push(m);
        }
      });
      const bg = g.scene.background, prevRT = R.getRenderTarget(), prevAuto = R.autoClear;
      g.scene.background = null;
      try {
        R.setRenderTarget(fragRT.rt); R.setClearColor(0x000000, 0); R.clear();
        R.render(g.scene, g.camera);
      } finally { g.scene.background = bg; R.setRenderTarget(prevRT); R.autoClear = prevAuto; for (const m of mats) restoreMat(m); for (const o of hidden) o.visible = true; }
      return sumTarget(fragRT.rt, w, h) / (w * h);
    };
    const multi = (o, m) => { if (!ownerOk(o)) return false; return true; };
    const out = {};
    out.scene = +run((o) => ownerOk(o)).toFixed(3);
    out.transparent = +run((o, m) => !!m.transparent && ownerOk(o)).toFixed(3);
    if (!owner) {
      out.player = +run((o) => grp(o) === 'fx').toFixed(3);
      out.enemy = +run((o) => grp(o) === 'enemies' || grp(o) === 'enemyFx').toFixed(3);
      out.world = +run((o) => grp(o) === 'world').toFixed(3);
    }
    void multi;
    // post passes: full-screen draws weighted by their viewport area (full-res equivalents)
    const d = PT.measure(() => g.renderNow(), { groups: false });
    out.post = d.postPasses;
    return out;
  };

  // ---- rotation (§1.1): one loadout skill every cadence s (round robin incl. charged at charge 1), basic attacks between,
  // ultimate every ultEvery s, cooldowns reset; 1 s warm then samples every sampleEvery frames with render
  PT.rotate = (cls, seconds = 6, { cadence = 0.5, ultEvery = 7, warm = 1, sampleEvery = 10, dt = 1 / 60, measure = true, onSample = null } = {}) => {
    const S = g.skills; const out = [];
    if (!S) return out;
    const ids = ['charged', 'q1', 'q2', 'q3', 'q4'].map((s) => S.skillForSlot?.(s) || S.loadout?.[s]).filter(Boolean);
    const ult = S.skillForSlot?.('ult') || S.loadout?.ult;
    let castT = 0, ultT = Math.min(3, ultEvery), k = 0, frame = 0;
    const total = Math.round((warm + seconds) / dt);
    const melee = (g.skills?.family?.() ?? 'caster') === 'melee';
    for (let f = 0; f < total; f++) {
      PT.keepAlive();
      castT -= dt; ultT -= dt;
      if (castT <= 0 && ids.length) { castT += cadence; S.resetCooldowns?.(); const id = ids[k++ % ids.length]; try { g.debug.cast(id, { charge: 1 }); } catch (_) { /* */ } }
      if (ultT <= 0 && ult) { ultT += ultEvery; S.resetCooldowns?.(); try { g.debug.cast(ult); } catch (_) { /* */ } }
      g.input.simulate((frame % 6) < 3 && (melee || frame % 12 < 3) ? { mouse: { 0: true } } : null);
      const t = f * dt, sample = measure && t >= warm && (frame % sampleEvery) === 0;
      if (sample) {
        const draws = PT.measure(() => g.step(1, dt, true));
        const cov = g.vfx?.debug?.coverage?.() ?? null;
        const st = g.vfx?.stats?.() || {};
        const rec = { t: +(t - warm).toFixed(3), draws, coverage: cov, particles: st.particles ?? null };
        if (onSample) onSample(rec);
        out.push(rec);
      } else g.step(1, dt, false);
      frame++;
    }
    g.input.simulate(null);
    return out;
  };

  // ---- CPU timing
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
  PT.median = median; PT.pct = pct;
  /** Median simulation ms per frame (render off). */
  PT.simMs = (frames = 120) => { const ts = []; for (let i = 0; i < frames; i++) { const t = performance.now(); g.step(1, 1 / 60, false); ts.push(performance.now() - t); } return +median(ts).toFixed(3); };
  /** Whole-frame CPU ms (update + submit, render on, no GPU sync) and render-submit ms (composer + overlay). */
  PT.cpuFrame = (frames = 60) => {
    const fr = [], sub = [];
    const rf = g.renderNow;
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now(); g.step(1, 1 / 60, false); const t1 = performance.now(); rf(); const t2 = performance.now();
      fr.push(t2 - t0); sub.push(t2 - t1);
    }
    return { frameMs: +median(fr).toFixed(3), submitMs: +median(sub).toFixed(3), submitP95: +pct(sub, 0.95).toFixed(3), p95: +pct(fr, 0.95).toFixed(3), p99: +pct(fr, 0.99).toFixed(3) };
  };
  /** Frames > 33 / 50 ms (CPU side, step + render) and long tasks over `seconds` of 60 Hz frames. */
  PT.longFrames = async (seconds = 5, { perFrame = null } = {}) => {
    let longTasks = 0, obs = null;
    try { obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 50) longTasks++; }); obs.observe({ entryTypes: ['longtask'] }); } catch (_) { obs = null; }
    let over33 = 0, over50 = 0; const n = Math.round(seconds * 60); let worst = 0;
    for (let i = 0; i < n; i++) {
      perFrame?.(i);
      const t = performance.now(); g.step(1, 1 / 60, true); const d = performance.now() - t;
      if (d > 33) over33++; if (d > 50) over50++; if (d > worst) worst = d;
      if (i % 15 === 14) await new Promise((r) => setTimeout(r, 0));
    }
    await new Promise((r) => setTimeout(r, 0));
    obs?.disconnect();
    return { frames: n, over33, over50, longTasks, worstMs: +worst.toFixed(1) };
  };

  // ---- GPU sync / timing
  const _px1 = new Uint8Array(4);
  PT.gpuSync = () => { const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px1); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); };
  /** Median wall ms of n synced renders of the frozen frame (fn defaults to game.renderNow). */
  PT.gpuMs = (fn = null, n = 3) => { const ts = []; const f = fn || g.renderNow; for (let i = 0; i < n; i++) { PT.gpuSync(); const t = performance.now(); f(); PT.gpuSync(); ts.push(performance.now() - t); } return median(ts); };
  /** Same-page ABAB ratio: setA()/setB() switch state; ratio = median over pairs of gpu(A)/gpu(B). */
  PT.gpuRatio = (setA, setB, { pairs = 5, reps = 1 } = {}) => {
    const r = [];
    g.renderNow(); PT.gpuSync();
    for (let i = 0; i < pairs; i++) { setA(); const a = PT.gpuMs(null, reps); setB(); const b = PT.gpuMs(null, reps); r.push(a / Math.max(1e-3, b)); }
    return { ratio: +median(r).toFixed(3), pairs: r.map((x) => +x.toFixed(3)) };
  };

  // ---- pixels
  const P = PT.pixels = {};
  P.render = (render = true) => {
    if (render) g.renderNow();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4);
    const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    return { px, w, h };
  };
  const lumaAt = (px, i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  /** Pixels changed by toggle(false) vs toggle(true) (toggle(on) shows/hides the subject). → {changed, mask, on, off, newWhite, sat, lumaRise} */
  P.diff = (toggle, { thr = 25 } = {}) => {
    toggle(true); const A = P.render(); toggle(false); const B = P.render(); toggle(true);
    const n = A.w * A.h, mask = new Uint8Array(n);
    let changed = 0, newWhite = 0, satSum = 0, rise = 0;
    for (let k = 0, i = 0; k < n; k++, i += 4) {
      const d = Math.abs(A.px[i] - B.px[i]) + Math.abs(A.px[i + 1] - B.px[i + 1]) + Math.abs(A.px[i + 2] - B.px[i + 2]);
      if (d <= thr) continue;
      mask[k] = 1; changed++;
      const la = lumaAt(A.px, i), lb = lumaAt(B.px, i); rise += la - lb;
      if (la > 235 && lb <= 235) newWhite++;
      const mx = Math.max(A.px[i], A.px[i + 1], A.px[i + 2]), mn = Math.min(A.px[i], A.px[i + 1], A.px[i + 2]);
      satSum += mx > 0 ? (mx - mn) / mx : 0;
    }
    return { changed, mask, w: A.w, h: A.h, on: A, off: B, newWhite: newWhite / n, sat: changed ? satSum / changed : 0, lumaRise: rise / n };
  };
  /** Mean luma (0–255) and near-white share of a buffer (default: a fresh render). */
  P.luma = (buf = null) => {
    const B = buf || P.render(); const n = B.w * B.h; let s = 0, white = 0;
    for (let i = 0; i < n * 4; i += 4) { const l = lumaAt(B.px, i); s += l; if (l > 235) white++; }
    return { mean: s / n, white: white / n };
  };
  /** Screen mask of objects (rendered vs hidden diff, thr 1). */
  P.mask = (objects, { thr = 1 } = {}) => {
    const list = [].concat(objects).filter(Boolean); const vis = list.map((o) => o.visible);
    const r = P.diff((on) => list.forEach((o, i) => { o.visible = on ? vis[i] : false; }), { thr });
    return { mask: r.mask, w: r.w, h: r.h, count: r.changed };
  };
  /** Crisp-edge ratio: share of mask pixels whose 3×3 Sobel luma gradient magnitude > thr (default 40). */
  P.sobel = (m, buf, { thr = 40 } = {}) => {
    const { mask, w, h } = m; const px = (buf || P.render()).px; let n = 0, crisp = 0;
    const L = (x, y) => lumaAt(px, (y * w + x) * 4);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (!mask[y * w + x]) continue; n++;
      const gx = -L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1) + L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1);
      const gy = -L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1) + L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1);
      if (Math.sqrt(gx * gx + gy * gy) > thr) crisp++;
    }
    return n ? crisp / n : 0;
  };
  /** Intersection over union of two masks (Uint8Array of equal length). */
  P.iou = (a, b) => { const A = a.mask || a, B = b.mask || b; let i = 0, u = 0; for (let k = 0; k < A.length; k++) { const x = A[k], y = B[k]; if (x && y) i++; if (x || y) u++; } return u ? i / u : 0; };
  /** Canvas data URL of the current frame (render first). */
  P.dataURL = (render = true) => { if (render) g.renderNow(); return R.domElement.toDataURL('image/png'); };
  return true;
}

// =====================================================================================================================
// node side
// =====================================================================================================================
function createHarness({ out = console.log, root = ROOT, flags = {} } = {}) {
  const results = [];
  let browser = null; const servers = {}; let section = 'main';
  const missing = missingModules(root);
  const missRe = missing.length ? new RegExp(`/src/(${missing.join('|')})\\.js`) : null;

  async function server(r = root) { if (!servers[r]) servers[r] = await startServer(r); return servers[r]; }
  async function launch() { if (!browser) browser = await chromium.launch({ args: LAUNCH_ARGS }); return browser; }

  const PT = {
    root, missing, flags, OUT, V3_REF, CLASSES, BOSSES, sceneParams, sceneList, buildQuery,
    get section() { return section; },
    setSection(s) { section = s; },
    check(name, cond, info) {
      const ok = !!cond; results.push({ section, name, ok, info: info === undefined ? null : info });
      out(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${info != null ? '  ' + JSON.stringify(info).slice(0, ok ? 200 : 500) : ''}`);
      return ok;
    },
    skip(name, reason) { results.push({ section, name, skip: true, info: reason }); out(`  SKIP  ${name}  (${reason || ''})`); },
    note(s) { out(`  ..    ${s}`); },
    results,
    async stop() {
      try { await browser?.close(); } catch (_) { /* */ }
      for (const k of Object.keys(servers)) { try { servers[k].server.close(); } catch (_) { /* */ } delete servers[k]; }
      browser = null;
    },
    /** Boot ?test=1<params> (+ prod=1&governor=0&seed=1 unless given); wait for game.ready; freeze; install window.PT. */
    async boot(params = '', opts = {}) {
      const srv = await server(opts.root || root); await launch();
      const w = Math.min(1280, opts.w || 640), h = Math.min(720, opts.h || 360);
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const logs = [];
      page.on('console', (m) => {
        const t = m.type(); if (t !== 'error' && t !== 'warning') return;
        logs.push({ type: t, text: m.text().slice(0, 500), url: m.location?.()?.url || '' });
      });
      page.on('pageerror', (e) => logs.push({ type: 'pageerror', text: `${e.message} ${(e.stack || '').split('\n').slice(1, 3).join(' ')}`.slice(0, 600) }));
      if (opts.init) await opts.init(page);
      const q = buildQuery(params, opts.defaults || DEFAULT_PARAMS);
      const t0 = Date.now();
      await page.goto(`http://localhost:${srv.port}/${q}`);
      let ready = true;
      await page.waitForFunction(() => window.game && window.game.ready, null, { timeout: opts.timeout || 180000 }).catch(() => { ready = false; });
      const bootMs = Date.now() - t0;
      if (ready) await page.evaluate(installInPage);
      let cdp = null;
      const pg = {
        page, ready, params: q, bootMs,
        errors() {
          return logs.filter((l) => {
            if (l.type === 'warning') return false;
            if (/Failed to load resource/.test(l.text) && (!l.url || (missRe && missRe.test(l.url)))) return false;
            return true;
          }).map((l) => `[${l.type}] ${l.text}`);
        },
        warnings() { return logs.filter((l) => l.type === 'warning').map((l) => l.text); },
        async run(label, fn, arg) {
          let res, err = null;
          try { res = await page.evaluate(fn, arg); } catch (e) { err = e; }
          const { checks, notes } = await page.evaluate(() => (window.PT ? window.PT.drain() : { checks: [], notes: [] })).catch(() => ({ checks: [], notes: [] }));
          for (const n of notes) PT.note(`${label}: ${n}`);
          for (const c of checks) { if (c.skip) PT.skip(`${label}: ${c.name}`, c.info); else PT.check(`${label}: ${c.name}`, c.ok, c.info); }
          if (err) PT.check(`${label}: no exception`, false, String(err.message || err).slice(0, 500));
          return res;
        },
        async eval(fn, arg) { return page.evaluate(fn, arg); },
        async cdp() { if (!cdp) cdp = await page.context().newCDPSession(page); return cdp; },
        async close() { try { await page.close(); } catch (_) { /* */ } },
      };
      return pg;
    },
    /** Boot the §1.1 scene `id` and set it up in page. opts.params are appended to the scene's params. */
    async bootScene(id, opts = {}) {
      const pg = await PT.boot(sceneParams(id) + (opts.params || ''), opts);
      if (pg.ready) pg.scene = await pg.eval((sid) => window.PT.scene(sid), id).catch((e) => ({ err: e.message }));
      return pg;
    },
    /** Boot the v3 baseline build (git archive of V3_REF, cached in tools/playtest4/out/v3base). */
    async baseline(params = '', opts = {}) {
      const dir = path.join(OUT, 'v3base');
      if (!fs.existsSync(path.join(dir, 'index.html'))) {
        fs.mkdirSync(dir, { recursive: true });
        const tar = execFileSync('git', ['-C', root, 'archive', '--format=tar', V3_REF], { maxBuffer: 1 << 30 });
        execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 1 << 30 });
      }
      // v3 has no prod/governor/seed params; harmless to pass
      return PT.boot(params, { ...opts, root: dir });
    },
    /** CDP heap sampling over `seconds` game-seconds of a rotation (or plain steps) → MB allocated per game-second. */
    async alloc(pg, seconds = 20, { cadence = 0.5, rotate = true, interval = 8192 } = {}) {
      const cdp = await pg.cdp();
      await cdp.send('HeapProfiler.enable');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: interval, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      const sim = await pg.eval(({ seconds, cadence, rotate }) => {
        const t0 = performance.now();
        if (rotate) window.PT.rotate(null, seconds, { cadence, warm: 0, measure: false });
        else window.game.step(Math.round(seconds * 60), 1 / 60, false);
        return { wallMs: performance.now() - t0 };
      }, { seconds, cadence, rotate });
      const hp = (await cdp.send('HeapProfiler.stopSampling')).profile;
      const sites = {}; let total = 0;
      const walk = (n) => {
        const cf = n.callFrame; total += n.selfSize;
        if (n.selfSize) { const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\/src\//, 'src/').replace(/^.*\/vendor\//, 'vendor/')}:${cf.lineNumber + 1}`; sites[key] = (sites[key] || 0) + n.selfSize; }
        for (const c of n.children || []) walk(c);
      };
      walk(hp.head);
      const MB = 1048576;
      return { mbPerGameSec: +(total / MB / seconds).toFixed(3), totalMB: +(total / MB).toFixed(2), wallMs: Math.round(sim.wallMs),
        top: Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, +(v / MB / seconds).toFixed(3)]), gcPauses: null };
    },
    /** Contact sheet: frames = [dataURL | {url, label}] → PNG at `file` (≤ maxKB, downscaled until it fits). */
    async sheet(pg, frames, file, { cols = 3, cellW = 320, cellH = 180, labels = null, title = '', maxKB = 150 } = {}) {
      const list = frames.map((f, i) => (typeof f === 'string' ? { url: f, label: labels?.[i] || '' } : f));
      let scale = 1, b64 = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        b64 = await pg.page.evaluate(async ({ list, cols, cellW, cellH, title, scale }) => {
          const W = Math.round(cellW * scale), H = Math.round(cellH * scale), rows = Math.ceil(list.length / cols), top = title ? 18 : 0;
          const c = document.createElement('canvas'); c.width = W * cols; c.height = H * rows + top;
          const x = c.getContext('2d'); x.fillStyle = '#101418'; x.fillRect(0, 0, c.width, c.height);
          x.font = '12px sans-serif';
          if (title) { x.fillStyle = '#e8e8e8'; x.fillText(title, 4, 13); }
          for (let i = 0; i < list.length; i++) {
            const im = new Image(); im.src = list[i].url; await im.decode().catch(() => {});
            const cx = (i % cols) * W, cy = Math.floor(i / cols) * H + top;
            try { x.drawImage(im, cx, cy, W, H); } catch (_) { /* */ }
            if (list[i].label) { x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(cx, cy, W, 16); x.fillStyle = '#fff'; x.fillText(list[i].label, cx + 3, cy + 12); }
          }
          return c.toDataURL('image/png').split(',')[1];
        }, { list, cols, cellW, cellH, title, scale });
        if (Buffer.byteLength(b64, 'base64') <= maxKB * 1024) break;
        scale *= 0.82;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
      return { file, kb: Math.round(Buffer.byteLength(b64, 'base64') / 1024), scale: +scale.toFixed(2) };
    },
    /** Cross-page ABAB GPU ratio A/B of each page's frozen frame (prep(page) runs once per page first). */
    async gpuRatioPages(pgA, pgB, { pairs = 5, prep = null, reps = 2 } = {}) {
      for (const p of [pgA, pgB]) { if (prep) await p.eval(prep); await p.eval(() => { window.game.renderNow(); }); }
      const ms = (p) => p.eval((reps) => {
        const g = window.game, gl = g.renderer.getContext(), px = new Uint8Array(4);
        const sync = () => { const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); };
        const ts = []; for (let i = 0; i < reps; i++) { sync(); const t = performance.now(); g.renderNow(); sync(); ts.push(performance.now() - t); }
        ts.sort((a, b) => a - b); return ts[Math.floor(ts.length / 2)];
      }, reps);
      const r = [];
      for (let i = 0; i < pairs; i++) { const a = await ms(pgA); const b = await ms(pgB); r.push(a / Math.max(1e-3, b)); }
      const s = r.slice().sort((x, y) => x - y);
      return { ratio: +s[Math.floor(s.length / 2)].toFixed(3), pairs: r.map((x) => +x.toFixed(3)) };
    },
    summary() {
      const pass = results.filter((r) => r.ok === true).length, fail = results.filter((r) => r.ok === false && !r.skip).length;
      const skip = results.filter((r) => r.skip).length;
      return { pass, fail, skip, failures: results.filter((r) => r.ok === false && !r.skip).map((r) => `${r.section}: ${r.name}`) };
    },
  };
  return PT;
}

module.exports = { createHarness, startServer, missingModules, installInPage, buildQuery, sceneParams, sceneList, LAUNCH_ARGS, ROOT, OUT, V3_REF };
