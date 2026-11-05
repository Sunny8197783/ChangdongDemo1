// playtest4 section: magic (PLAN v4 §7.8 MG1; owner magic). Run: node tools/playtest4.js magic [--full] [--sheets]
//  static   rule 5 grep (no 0xffffff / #ffffff, no emissive / intensity multiplier > 1.2) in src/spells*; no reserved shapes in player linework
//  MG1.a    fresh boot: first cast of every measured skill ≤ 8 ms CPU and 0 first draws of never-drawn programs (warm-up)
//  MG1.b    registration: 5 motif elements × 9 kinds + FM shapes; lookOf(id) for every registry skill ≥ 'archetype' (declared), bespoke set 'bespoke'
//  MG1.c    per-cast measurement (percast method, 640×360, fx 1.0): newWhite, luma rise, sat, coverage (vfx.debug.byCast), detail, crisp,
//           particles, handles, generic flag → measured level; ceilings + floors per tier (§1.4). Default: bespoke set + 1 skill per archetype;
//           --full: every registry skill (mage) + the bespoke set as ranger and spiritcaller
//  MG1.d    0 new materials per cast after the first (second round without enemies)
//  MG1.e    stacked 7-cast mage rotation (1 s) ≤ 12 % near-white
//  MG1.f    element silhouettes: impact-frame masks of the 9 elements per archetype, pairwise IoU < 0.5 (default 4 archetypes, --full all)
//  MG1.g    castLock: > 0 during the ultimate anticipation (≤ 0.25 s), 0 when free and after a basic; > 0 during a finisher
//  --sheets contact sheets tools/playtest4/sheets/caster/<id>.png (anticipation / impact / dissipation) for the bespoke set + one per archetype,
//           and tools/playtest4/sheets/caster/arch_<name>.png (impact frame × 9 elements)
//  (I) telegraph retention ≥ 95 % is verified by core at integration with the real looks of both families.
const fs = require('fs'); const path = require('path');

const BESPOKE = ['fire.charged', 'ice.nova', 'lightning.ult', 'wind.charged', 'wind.gust', 'water.ult', 'earth.charged', 'earth.ult', 'light.flash', 'light.sanctuary', 'light.ult', 'nature.roots',
  'fire.basic', 'ice.basic', 'lightning.basic', 'wind.basic', 'water.basic', 'earth.basic', 'nature.basic', 'light.basic', 'shadow.basic',
  'ice.charged', 'lightning.charged', 'water.charged', 'nature.charged', 'light.charged', 'shadow.charged',
  'fire.ult', 'ice.ult', 'wind.ult', 'nature.ult', 'shadow.ult', 'fire.salamander', 'fire.cyclone', 'wind.vortex', 'nature.spore'];
// §1.4 per-tier ceilings / floors
const TIER = {
  B: { white: 0.015, luma: 6, sat: 0.40, cov: 0.05, detail: 500, crisp: 0.25, particles: 16, handles: 4 },
  C: { white: 0.04, luma: 12, sat: 0.40, cov: 0.30, detail: 2000, crisp: 0.25, particles: 80, handles: 8 },
  A: { white: 0.04, luma: 12, sat: 0.40, cov: 0.30, detail: 2000, crisp: 0.25, particles: 80, handles: 8 },
  Z: { white: 0.03, luma: 8, sat: 0.35, cov: 0.15, detail: 1200, crisp: 0.30, particlesPerSec: 30, handles: 6 },
  U: { white: 0.05, whitePeak: 0.12, luma: 20, sat: 0.35, cov: 1.0, detail: 8000, crisp: 0.20, particles: 150, handles: 12 },
  F: { white: 0.06, whitePeak: 0.15, luma: 99, sat: 0.30, cov: 1.5, detail: 10000, crisp: 0.20, particles: 250, handles: 99 },
};
const WINDOW = { B: 1.0, C: 1.4, A: 1.4, Z: 1.8, U: 2.6, F: 3.6 };
const SAMPLES = { B: 5, C: 6, A: 6, Z: 6, U: 8, F: 8 };   // diff samples per cast window (each = 2 renders at 640×360 on SwiftShader)

function grepRule5(root) {
  const files = [path.join(root, 'src/spells.js')];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(path.join(root, 'src/spells'));
  const hits = [], reserved = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      const rel = path.relative(root, f) + ':' + (i + 1);
      if (/0x[fF]{6}\b/.test(l) || /#[fF]{6}\b/.test(l)) hits.push(rel + ' white');
      const m = l.match(/(emissiveIntensity|intensity)\s*:\s*([0-9.]+)/); if (m && +m[2] > 1.2) hits.push(rel + ' ' + m[1] + ' ' + m[2]);
      const c = l.match(/coreMat\([^,()]+,\s*([0-9.]+)\)/); if (c && +c[1] > 1.2) hits.push(rel + ' coreMat ' + c[1]);
      if (/shape:\s*'(hatch|chevron|chevrons|diamond)'/.test(l) || /decal\('hatch'/.test(l)) reserved.push(rel);
    });
  }
  return { files: files.length, hits, reserved };
}

// ======================================================================================== in-page helpers
function installMG() {
  const g = window.game, T = g.THREE, PT = window.PT;
  if (window.MG) return true;
  const MG = window.MG = {};
  // the plains meadow (the F-* fighting ground, tall grass: ground linework must survive it), yaw 0, dummy at 7 m; the §1.4 percast
  // plateau measured lower saturation on its yellow-green ground for every element (kept as an option: window.__MG_SPOT)
  const SPOT = window.__MG_SPOT || { x: -30, z: 30 };
  MG.SPOT = SPOT;
  MG.setup = () => {
    PT.tp(SPOT.x, SPOT.z, 0.1); PT.clearEnemies?.(false);
    // the background must not change between casts: soak the test meadow (fire skills cannot ignite it; scorched grass would grey every
    // later measurement) and regrow anything already burnt
    try { const sf = g.world?.surface, c = new T.Vector3(SPOT.x, 0, SPOT.z); sf?.wet?.(c, 40, 3600); sf?.regrow?.(c, 40); } catch (_) { /* */ }
    PT.look(0, -0.18); g.step(10, 1 / 60, false);
    const pp = g.player.object.position, f = new T.Vector3(); g.camera.getWorldDirection(f); f.y = 0; f.normalize();
    MG.dummy = g.debug.spawn('dummy', { pos: pp.clone().addScaledVector(f, 7), hp: 1e9 });
    if (MG.dummy) PT.armor(MG.dummy);
    g.step(20, 1 / 60, false);
    return !!MG.dummy;
  };
  MG.aim = () => {
    const pl = g.player; const o = new T.Vector3();
    try { pl.getWeaponTip ? pl.getWeaponTip('main', o) : o.copy(pl.object.position).setY(pl.object.position.y + 1.5); } catch (_) { o.copy(pl.object.position).setY(pl.object.position.y + 1.5); }
    const d = MG.dummy; const c = d?.alive ? g.combat.getCenter(d, new T.Vector3()) : o.clone().add(new T.Vector3(0, 0, -7));
    return { origin: o, dir: c.clone().sub(o).normalize(), point: c, target: d?.alive ? d : null };
  };
  /** Objects currently visible that belong to player FX (owner 'player': kit pools, particles, spell objects). */
  MG.fxObjs = () => { const out = []; g.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite) && o.visible && o.userData?.owner === 'player' && o !== g.player?.object) out.push(o); }); return out; };
  MG.diff = () => { const list = MG.fxObjs(); return PT.pixels.diff((on) => { for (const o of list) o.visible = on; }); };
  MG.clear = () => { try { g.spells.clearFx(); } catch (_) { /* */ } g.skills.resetCooldowns?.(); PT.keepAlive(); g.step(2, 1 / 60, false); };
  const lumaAt = (px, i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  /** Cast id (or call fn) and sample the window. Returns metrics + optional frames (data URLs) and the peak mask. */
  // coverage truth: the core counting override (PT.fragments) restricted to player-FX objects — called only when the cheap runtime
  // estimator of a sample exceeds the tier ceiling (≤ 3 calls per cast); otherwise the (conservative) estimator stands
  const fxOwner = (o) => o.userData?.owner === 'player' && o !== g.player?.object;
  MG.measure = (id, { win = 1.4, samples = 6, frames = false, keepMask = false, fn = null, covCeil = 1e9 } = {}) => {
    const every = Math.max(2, Math.round(win * 60 / samples));
    MG.setup(); MG.clear();   // same spot, camera and dummy for every cast (blinks / dashes move the player)
    const aim = MG.aim();
    g.debug.newMaterials();
    const t0 = performance.now();
    let castId = 0;
    if (fn) castId = fn(aim); else { g.debug.cast(id, { aim, charge: 1 }); castId = g.skills.lastCastId; }
    const castMs = performance.now() - t0;
    // sampling (percast method: peak over the cast window): a regular grid of `samples` diffs plus adaptive diffs whenever the
    // per-frame player-FX coverage estimator (CPU, every frame) rises above the last diffed level — so short impact frames are caught
    const N = Math.round(win * 60), maxExtra = samples + 4;
    const S = [];
    let peak = null, peakD = null, shots = [], fragCalls = 0, fragUsed = false, covRatio = 1, covChecked = 0, extra = 0, lastF = 0, diffCv = 0, covMax = 0, reg = 0;
    for (let f = 1; f <= N; f++) {
      PT.keepAlive(); g.step(1, 1 / 60, false);
      let cv = g.vfx.debug.coverage?.()?.screens ?? 0;
      const regular = f % every === 0;
      const rising = !regular && extra < maxExtra && f - lastF >= 3 && cv * covRatio > 0.001 && cv * covRatio > diffCv * 1.25;
      // coverage truth: the counting override (PT.fragments) at every new estimator maximum above the ceiling (≤ 6 per cast); other frames
      // scale the estimator by the latest measured fragments / estimate ratio (the estimator counts whole quads, the override shaded fragments)
      const est = cv;
      cv = est * covRatio;
      if (cv > covCeil && fragCalls < 6 && est > covChecked * 1.05) {
        fragCalls++; covChecked = est;
        try { const fr = PT.fragments({ owner: fxOwner }); covRatio = Math.min(1, fr.scene / Math.max(1e-6, est)); cv = Math.min(est, fr.scene); fragUsed = true; } catch (_) { /* */ }
      }
      if (cv > covMax) covMax = cv;
      if (!regular && !rising) continue;
      if (rising) extra++;
      const d = MG.diff();
      diffCv = Math.max(diffCv * 0.85, cv);
      const rec = { t: +(f / 60).toFixed(3), dt: (f - lastF) / 60, changed: d.changed, white: d.newWhite, sat: d.sat, rise: d.lumaRise, cov: cv };
      lastF = f;
      S.push(rec);
      if (!peak || d.changed > peak.changed) { peak = rec; peakD = d; }
      if (regular) { reg++; if (frames && (reg === 2 || reg === Math.round(samples * 0.3) + 1 || reg === Math.round(samples * 0.75) + 1)) shots.push(PT.pixels.dataURL(false)); }
    }
    let crisp = 0;
    if (peakD && peakD.changed > 0) crisp = PT.pixels.sobel({ mask: peakD.mask, w: peakD.w, h: peakD.h }, peakD.on);
    const bc = g.vfx.debug.byCast(castId) || {};
    const out = {
      id, castId, castMs: +castMs.toFixed(2), peakT: peak?.t ?? 0,
      // sat: mean HSV saturation of the changed pixels over the cast window (pixel-weighted over every diffed frame); satPeak: at the peak frame
      detail: peak?.changed ?? 0, sat: +(S.reduce((t, s) => t + s.sat * s.changed, 0) / Math.max(1, S.reduce((t, s) => t + s.changed, 0))).toFixed(3), satPeak: +(peak?.sat ?? 0).toFixed(3), crisp: +crisp.toFixed(3),
      white: +Math.max(0, ...S.map((s) => s.white)).toFixed(4), whiteOver5: S.reduce((t, s) => t + (s.white > 0.05 ? s.dt : 0), 0), whiteOver6: S.reduce((t, s) => t + (s.white > 0.06 ? s.dt : 0), 0),
      rise: +Math.max(0, ...S.map((s) => s.rise)).toFixed(2),
      cov: +covMax.toFixed(4), diffs: S.length, covFrag: fragUsed, covByCast: bc.coverage ?? 0, particles: bc.particles ?? 0, handles: bc.handles ?? 0, generic: !!bc.generic,
      newMats: g.debug.newMaterials(), look: id ? g.debug.lookOf(id, 'caster') : null, path: g.skills.lastPath,
    };
    if (frames) out.frames = shots;
    if (keepMask && peakD) out.mask = Array.from(peakD.mask);   // (only for IoU)
    return out;
  };
  /** Archetype look of element el (no bespoke row): call the registered caster archetype with a ctx built like the skills runtime's. */
  MG.archCast = (name, rep, el, aim) => {
    const fn = g.archetypes.getArchetype(name, 'caster'); if (!fn) return 0;
    const def = g.skills.def(rep); const params = g.skills.effectiveParams(rep);
    const castId = g.nextCastId();
    const ctx = { game: g, skillId: 'iou.' + name, def, element: el, params, family: 'caster', style: 'staff', cls: 'mage', origin: aim.origin.clone(), aim, charge: 1, slot: def.slot, awakened: false, castMul: 1,
      S: g.spells?.api, castId, cooldown: 0, after: (t, f) => g.spells._S.later(t, f), baseDamage: () => params.dmg ?? 10,
      hit(base) { const h = base || {}; h.skillId = rep; h.slot = def.slot; if (!h.element) h.element = el; h.source = g.player.entity; h.tier = h.tier || 'heavy'; h.tags = h.tags || []; return h; } };
    fn(ctx);
    return castId;
  };
  return true;
}

module.exports = async function (PT) {
  const t0 = Date.now();
  const root = PT.root;
  const full = !!PT.flags.full, sheets = !!PT.flags.sheets;
  const g5 = grepRule5(root);
  PT.check('MG static: rule 5 in src/spells* (no 0xffffff / #ffffff, no multiplier > 1.2)', g5.hits.length === 0, g5.hits.length ? g5.hits.slice(0, 20) : { files: g5.files });
  PT.check('MG static: no reserved threat shapes (hatch / chevron / diamond) in player linework', g5.reserved.length === 0, g5.reserved);
  for (const el of ['fire', 'ice', 'lightning', 'wind', 'water']) PT.check(`MG static: src/spells/motifs/${el}.js exists`, fs.existsSync(path.join(root, 'src/spells/motifs', el + '.js')));

  // ================================================================== fresh page: first casts, registration, lookOf, castLock
  const pg = await PT.boot('&cls=mage&level=30&skills=preset:endgame_mage', { w: 640, h: 360 });
  PT.check('MG boot (mage, endgame)', pg.ready, pg.bootMs);
  if (!pg.ready) { await pg.close(); return; }
  await pg.eval(installMG);
  const reg = await pg.run('MG1.b registration', (bespoke) => {
    const g = window.game, K = g.vfx?.kit, L = g.spells?.looks;
    PT.check('kit present and caster looks installed', !!K && !!L?.installed);
    const kinds = ['cast', 'trail', 'burst', 'spark', 'zone', 'pillar', 'wave', 'aura', 'summon'];
    const miss = [];
    for (const el of ['fire', 'ice', 'lightning', 'wind', 'water']) for (const k of kinds) if (!K.hasMotif(el, k)) miss.push(el + ':' + k);
    PT.check('5 elements × 9 motif kinds registered (kit.registerMotif)', miss.length === 0, miss);
    const shapes = ['fire.flame', 'fire.tongue', 'fire.comet', 'fire.petal', 'fire.meteor', 'ice.prism', 'ice.stub', 'ice.shard', 'ice.lance', 'lightning.orb', 'lightning.spike', 'lightning.disc', 'wind.crescent', 'wind.leaf', 'water.droplet', 'water.sheet', 'water.bead'];
    const ms = shapes.filter((s) => !K._fm?.hasShape?.(s));
    PT.check('FM shapes registered (§3.5 primaries)', ms.length === 0, ms);
    const ids = [...g.skills.defs.keys()];
    const levels = {}; const bad = [];
    for (const id of ids) { const lv = g.debug.lookOf(id, 'caster'); levels[id] = lv; if (lv !== 'bespoke' && lv !== 'archetype') bad.push(id + ':' + lv); }
    PT.check(`lookOf: every registry skill declares ≥ 'archetype' (${ids.length} ids)`, bad.length === 0, bad);
    const nb = bespoke.filter((id) => levels[id] !== 'bespoke');
    PT.check(`lookOf: the bespoke set (${bespoke.length}) declares 'bespoke'`, nb.length === 0, nb);
    // the bespoke set is derived data: every *.basic / *.charged / *.ult of the registry and the starter_<cls> loadouts of the caster classes
    const need = ids.filter((id) => /\.(basic|charged|ult)$/.test(id));
    for (const cls of ['mage', 'ranger', 'spiritcaller']) {
      const pr = g.skills.PRESETS?.['starter_' + cls];
      for (const nid of Object.keys(pr?.ranks || {})) for (const sid of (g.skills.node(nid)?.grants || [])) if (g.skills.def(sid)) need.push(sid);
    }
    const notIn = [...new Set(need)].filter((id) => !bespoke.includes(id));
    PT.check(`bespoke set covers every registry basic / charged / ult and the caster starter loadouts (${new Set(need).size})`, notIn.length === 0, notIn);
    PT.note(`motif sources: ${['earth', 'nature', 'light', 'shadow'].map((e) => e + '=' + L.motifSource(e)).join(' ')}`);
    return { ids, levels, el: Object.fromEntries(ids.map((id) => [id, g.skills.def(id)?.element || g.spells.element])), arch: Object.fromEntries(ids.map((id) => [id, g.skills.def(id)?.archetype || null])), tier: Object.fromEntries(ids.map((id) => [id, L.tierOf(g.skills.def(id), id)])) };
  }, BESPOKE);
  if (!reg) { await pg.close(); return; }
  // measured set: bespoke + first registry skill of every archetype not covered (default) / all (full)
  const perArch = {};
  for (const id of reg.ids) { const a = reg.arch[id]; if (a && !perArch[a]) perArch[a] = id; }
  for (const id of BESPOKE) { const a = reg.arch[id]; if (a) perArch[a] = perArch[a] && BESPOKE.includes(perArch[a]) ? perArch[a] : id; }
  // developer iteration only: MG_IDS=a,b limits the measured set, MG_PARTS=a,c,d,e,f,g limits the parts (default: everything)
  const parts = process.env.MG_PARTS ? new Set(process.env.MG_PARTS.split(',')) : null; const want = (p) => !parts || parts.has(p);
  const set = process.env.MG_IDS ? process.env.MG_IDS.split(',') : full ? reg.ids.slice() : [...new Set([...BESPOKE, ...Object.values(perArch)])];

  // MG1.a first casts on the fresh page (every measured skill's first cast; no rendering before the cast)
  const first = !want('a') ? null : await pg.run('MG1.a first cast', (ids) => {
    const g = window.game, MG = window.MG; MG.setup();
    g.renderNow(); g.debug.firstDraws();
    const out = [];
    for (const id of ids) {
      MG.clear();
      const aim = MG.aim();
      const t = performance.now(); try { g.debug.cast(id, { aim, charge: 1 }); } catch (_) { /* */ }
      const ms = performance.now() - t;
      const t2 = performance.now(); g.step(1, 1 / 60, true); const stepMs = performance.now() - t2;
      g.step(6, 1 / 60, false); g.renderNow();
      out.push({ id, ms: +ms.toFixed(2), stepMs: +stepMs.toFixed(1), firstDraws: g.debug.firstDraws() });
      g.step(30, 1 / 60, false);
    }
    return out;
  }, set);
  if (first) {
    const slow = first.filter((r) => r.ms > 8);
    PT.check(`MG1.a first cast of every measured skill ≤ 8 ms CPU (${first.length})`, slow.length === 0, slow.length ? slow : { max: Math.max(...first.map((r) => r.ms)) });
    const fd = first.filter((r) => r.firstDraws > 0);
    PT.check('MG1.a 0 first draws of never-drawn programs on first casts (boot warm-up)', fd.length === 0, fd.slice(0, 12));
  }

  // MG1.g castLock
  if (want('g')) await pg.run('MG1.g castLock', () => {
    const g = window.game, MG = window.MG, Sp = g.spells;
    MG.clear(); g.step(30, 1 / 60, false);
    PT.check('castLock = 0 when free', Sp.castLock === 0, Sp.castLock);
    g.debug.cast('fire.basic', { aim: MG.aim() });
    PT.check('castLock = 0 after a basic', Sp.castLock === 0, Sp.castLock);
    MG.clear(); g.debug.cast('fire.ult', { aim: MG.aim() });
    const a = Sp.castLock;
    PT.check('castLock > 0 and ≤ 0.25 s during the ultimate anticipation', a > 0 && a <= 0.25, a);
    for (let i = 0; i < 40; i++) g.step(1, 1 / 60, false);
    PT.check('castLock back to 0 after 0.67 s', Sp.castLock === 0, Sp.castLock);
    MG.clear();
  });

  // ================================================================== MG1.c per-cast measurement
  const res = await pg.run('MG1.c setup', () => window.MG.setup());
  const rows = [];
  const tstart = Date.now();
  for (const id of want('c') ? set : []) {
    const tier = reg.tier[id] || 'A';
    const r = await pg.eval(({ id, win, samples, frames, covCeil }) => window.MG.measure(id, { win, samples, frames, covCeil }), { id, win: WINDOW[tier], samples: SAMPLES[tier], covCeil: (TIER[tier] || TIER.A).cov, frames: sheets && (BESPOKE.includes(id) || Object.values(perArch).includes(id)) });
    r.tier = tier; rows.push(r);
    if (r.frames) {
      await PT.sheet(pg, r.frames.map((u, i) => ({ url: u, label: `${id} ${['anticipation', 'impact', 'dissipation'][i] || ''}` })), path.join(root, 'tools/playtest4/sheets/caster', id + '.png'), { cols: 3, cellW: 320, cellH: 180, title: `${id} (${tier}, ${r.look})` });
      delete r.frames;
    }
  }
  PT.note(`MG1.c measured ${rows.length} casts in ${((Date.now() - tstart) / 1000).toFixed(0)} s`);
  const fails = [];
  for (const r of rows) {
    const T = TIER[r.tier] || TIER.A, why = [];
    if (r.tier === 'U' || r.tier === 'F') { if (r.white > T.whitePeak) why.push('white ' + r.white); if ((r.tier === 'U' ? r.whiteOver5 : r.whiteOver6) > 0.15 + 1e-6) why.push('white>' + (r.tier === 'U' ? 5 : 6) + '% for ' + r.whiteOver5 + ' s'); }
    else if (r.white > T.white) why.push('white ' + r.white);
    if (r.rise > T.luma) why.push('luma +' + r.rise);
    if (r.cov > T.cov) why.push('cov ' + r.cov);
    // §3.2 / R6: the light ramp is ivory (saturation ≤ 0.35 on every step below hi) — its saturation floor is the palette's, not 0.40
    const satFloor = reg.el[r.id] === 'light' ? Math.min(T.sat, 0.15) : T.sat;
    if (r.sat < satFloor) why.push('sat ' + r.sat);
    if (r.detail < T.detail) why.push('detail ' + r.detail);
    if (r.crisp < T.crisp) why.push('crisp ' + r.crisp);
    const pmax = T.particlesPerSec ? T.particlesPerSec * Math.max(1, WINDOW[r.tier]) : T.particles;
    if (r.particles > pmax) why.push('particles ' + r.particles);
    if (r.handles > T.handles) why.push('handles ' + r.handles);
    if (r.generic) why.push('generic motif');
    r.measured = why.length ? 'fail' : r.look;
    r.why = why;
    if (why.length) fails.push(`${r.id}[${r.tier}] ${why.join(', ')}`);
  }
  PT.check(`MG1.c every measured cast meets its tier ceilings and floors (${rows.length})`, fails.length === 0, fails.slice(0, 40));
  const bes = rows.filter((r) => BESPOKE.includes(r.id));
  PT.check(`MG1.c bespoke set measured 'bespoke' (${bes.length}/${BESPOKE.length})`, bes.length === BESPOKE.length && bes.every((r) => r.measured === 'bespoke'), bes.filter((r) => r.measured !== 'bespoke').map((r) => r.id + ':' + r.measured));
  const archOk = rows.filter((r) => !BESPOKE.includes(r.id));
  PT.check(`MG1.c archetype representatives measured ≥ 'archetype' (${archOk.length})`, archOk.every((r) => r.measured === 'archetype' || r.measured === 'bespoke'), archOk.filter((r) => r.measured === 'fail').map((r) => r.id));
  const summary = (k) => { const v = rows.map((r) => r[k]); return { max: Math.max(...v), median: v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] }; };
  PT.note(`MG1.c ranges: white ${JSON.stringify(summary('white'))} cov ${JSON.stringify(summary('cov'))} detail ${JSON.stringify(summary('detail'))} crisp ${JSON.stringify(summary('crisp'))} sat ${JSON.stringify(summary('sat'))}`);
  try { fs.mkdirSync(path.join(PT.OUT, 'magic'), { recursive: true }); fs.writeFileSync(path.join(PT.OUT, 'magic', 'mg1_rows.json'), JSON.stringify(rows, null, 1)); } catch (_) { /* */ }

  // ================================================================== MG1.d materials: second round without enemies
  if (want('d')) await pg.run('MG1.d materials', (ids) => {
    const g = window.game, MG = window.MG;
    for (const e of PT.enemies()) { e.alive = false; try { g.combat.unregister?.(e); } catch (_) { /* */ } }
    MG.dummy = null;
    MG.clear(); g.step(10, 1 / 60, false); g.debug.newMaterials();
    for (const id of ids) { MG.clear(); g.debug.cast(id, { aim: MG.aim(), charge: 1 }); g.step(50, 1 / 60, false); }
    const n = g.debug.newMaterials();
    PT.check(`0 new materials per cast after the first (${ids.length} casts, no enemies)`, n === 0, n);
  }, set);
  // ================================================================== MG1.e stacked rotation
  if (want('e')) await pg.run('MG1.e stacked 7-cast rotation', () => {
    const g = window.game, MG = window.MG;
    MG.setup(); MG.clear();
    const ids = ['fire.basic', 'fire.charged', 'fire.cyclone', 'ice.pillar', 'fire.phoenix', 'lightning.mine', 'fire.ult'];
    let peak = 0, k = 0;
    for (let f = 0; f < 96; f++) {
      if (f % 8 === 0 && k < ids.length) { g.skills.resetCooldowns?.(); g.debug.cast(ids[k++], { aim: MG.aim(), charge: 1 }); }
      PT.keepAlive(); g.step(1, 1 / 60, false);
      if (f % 4 === 3) { const d = MG.diff(); if (d.newWhite > peak) peak = d.newWhite; }
    }
    PT.check('stacked 7-cast mage rotation ≤ 12 % near-white (v3: 94–97 %)', peak <= 0.12, +peak.toFixed(4));
    MG.clear();
  });

  // ================================================================== MG1.f element silhouettes per archetype (impact-frame IoU)
  const ARCH = !want('f') ? [] : process.env.MG_ARCH ? process.env.MG_ARCH.split(',') : full ? Object.keys(perArch) : ['projectile', 'nova', 'cone', 'zone'];
  const iouFails = [];
  for (const name of ARCH) {
    const rep = perArch[name]; if (!rep) continue;
    const masks = {};
    const frames = [];
    for (const el of ['fire', 'ice', 'lightning', 'wind', 'water', 'earth', 'nature', 'light', 'shadow']) {
      const r = await pg.eval(({ name, rep, el, sheets }) => {
        const MG = window.MG; MG.setup();
        const out = MG.measure(null, { win: 0.8, samples: 4, keepMask: true, fn: (aim) => MG.archCast(name, rep, el, aim) });
        if (sheets) out.shot = window.PT.pixels.dataURL(true);
        return out;
      }, { name, rep, el, sheets });
      masks[el] = r.mask; if (r.shot) frames.push({ url: r.shot, label: `${name} · ${el}` });
    }
    const els = Object.keys(masks); let worst = 0, pair = null;
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const A = masks[els[i]], B = masks[els[j]]; if (!A || !B) continue;
      let I = 0, U = 0; for (let k = 0; k < A.length; k++) { const x = A[k], y = B[k]; if (x && y) I++; if (x || y) U++; }
      const iou = U ? I / U : 0; if (iou > worst) { worst = iou; pair = els[i] + '/' + els[j]; }
    }
    if (worst >= 0.5) iouFails.push(`${name}: ${pair} ${worst.toFixed(2)}`);
    PT.note(`MG1.f ${name}: max element IoU ${worst.toFixed(2)} (${pair})`);
    if (sheets && frames.length) await PT.sheet(pg, frames, path.join(root, 'tools/playtest4/sheets/caster', 'arch_' + name + '.png'), { cols: 3, cellW: 256, cellH: 144, title: `archetype ${name} × 9 elements (impact frame)` });
  }
  PT.check(`MG1.f element silhouettes: pairwise impact-frame IoU < 0.5 for ${ARCH.length} archetypes`, iouFails.length === 0, iouFails);

  const errs = pg.errors();
  PT.check('MG page: no uncaught errors', errs.length === 0, errs.slice(0, 8));
  await pg.close();

  // ================================================================== --full: the bespoke set as ranger (bow) and spiritcaller (totem)
  if (full) {
    for (const cls of ['ranger', 'spiritcaller']) {
      const p2 = await PT.boot(`&cls=${cls}&level=30&skills=preset:endgame_${cls}`, { w: 640, h: 360 });
      if (!p2.ready) { PT.check(`MG ${cls} boot`, false); continue; }
      await p2.eval(installMG); await p2.eval(() => window.MG.setup());
      const bad = [];
      for (const id of BESPOKE) {
        const tier = reg.tier[id] || 'A', T = TIER[tier];
        const r = await p2.eval(({ id, win, samples, covCeil }) => window.MG.measure(id, { win, samples, covCeil }), { id, win: WINDOW[tier], samples: SAMPLES[tier], covCeil: T.cov });
        const why = [];
        if (r.white > (T.whitePeak || T.white)) why.push('white ' + r.white);
        if (r.cov > T.cov) why.push('cov ' + r.cov);
        if (r.handles > T.handles) why.push('handles ' + r.handles);
        if (r.generic) why.push('generic');
        if (r.detail < T.detail) why.push('detail ' + r.detail);
        if (why.length) bad.push(`${id}: ${why.join(', ')}`);
      }
      PT.check(`MG1.c (${cls}) bespoke set within ceilings / floors`, bad.length === 0, bad.slice(0, 20));
      const e2 = p2.errors(); PT.check(`MG ${cls} page: no uncaught errors`, e2.length === 0, e2.slice(0, 6));
      await p2.close();
    }
  }
  PT.skip('MG1 telegraph retention ≥ 95 % (R-mage / R-boss)', 'verified at integration (I) with the real tells and both families');
  PT.note(`magic section ${((Date.now() - t0) / 1000).toFixed(0)} s`);
};
module.exports.installMG = installMG;
