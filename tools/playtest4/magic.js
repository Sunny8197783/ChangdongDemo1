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
//           and tools/playtest4/sheets/caster/arch_<name>_{1,2,3}.png (impact frame × 9 elements, 3 per sheet); frames are cropped to the action
//  (I) telegraph retention ≥ 95 % is verified by core at integration with the real looks of both families.
const fs = require('fs'); const path = require('path');

// v4 look rolled back to v3 at user request: the v4 look floors (rule 5 palette grep, motif files / registration, lookOf levels,
// MG1.c per-tier ceilings / floors and measured look level, MG1.f element silhouettes) no longer apply; they are reported as notes.
// MG1.a (first-cast warm-up), MG1.d (materials), MG1.e (near-white rotation) and MG1.g (castLock) are still checks.
const LOOK_ROLLED_BACK = true;

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
  MG.setup = (side = 0) => {
    PT.tp(SPOT.x, SPOT.z, 0.1); PT.clearEnemies?.(false);
    // the background must not change between casts: soak the test meadow (fire skills cannot ignite it; scorched grass would grey every
    // later measurement) and regrow anything already burnt
    try { const sf = g.world?.surface, c = new T.Vector3(SPOT.x, 0, SPOT.z); sf?.wet?.(c, 40, 3600); sf?.regrow?.(c, 40); } catch (_) { /* */ }
    PT.look(0, -0.18); g.step(10, 1 / 60, false);
    const pp = g.player.object.position, f = new T.Vector3(); g.camera.getWorldDirection(f); f.y = 0; f.normalize();
    // side: lateral offset (m) for skills that move the player through the target (dash): the camera boom then never sits on the dummy
    MG.dummy = g.debug.spawn('dummy', { pos: pp.clone().addScaledVector(f, 7).add(new T.Vector3(-f.z, 0, f.x).multiplyScalar(side)), hp: 1e9 });
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
  MG.measure = (id, { win = 1.4, samples = 6, frames = false, keepMask = false, fn = null, covCeil = 1e9, afterHit = false } = {}) => {
    const every = Math.max(2, Math.round(win * 60 / samples));
    const arch = id ? g.skills.def(id)?.archetype : null;
    MG.setup(arch === 'dash' ? 1.2 : 0); MG.clear();   // same spot, camera and dummy for every cast (blinks / dashes move the player)
    const aim = MG.aim();
    g.debug.newMaterials();
    const t0 = performance.now();
    let castId = 0, hitF = -1, fNow = 0;
    const unHit = afterHit ? g.events.on('damage', (ev) => { if (hitF < 0 && ev?.target && ev.target !== g.player?.entity) hitF = fNow; }) : null;
    if (fn) castId = fn(aim); else { g.debug.cast(id, { aim, charge: 1 }); castId = g.skills.lastCastId; }
    const castMs = performance.now() - t0;
    // sampling (percast method: peak over the cast window): a regular grid of `samples` diffs plus adaptive diffs whenever the
    // per-frame player-FX coverage estimator (CPU, every frame) rises above the last diffed level — so short impact frames are caught
    const N = Math.round(win * 60), maxExtra = samples + 6;
    const S = [];
    let hSeen = 0, pend = [], peak = null, peakD = null, shotA = null, shotPeak = null, shotD = null, fragCalls = 0, fragUsed = false, covRatio = 1, covChecked = 0, extra = 0, lastF = 0, diffCv = 0, covMax = 0, reg = 0;
    for (let f = 1; f <= N; f++) {
      PT.keepAlive(); g.step(1, 1 / 60, false); fNow = f;
      let cv = g.vfx.debug.coverage?.()?.screens ?? 0;
      const regular = f % every === 0;
      // new shapes of this cast (byCast handle count grew): one diff 4 frames later, once they have scaled in (a burst between two grid
      // samples whose coverage estimate does not rise — thin linework, bolts — is otherwise never diffed)
      const hc = g.vfx.debug.byCast(castId)?.handles ?? 0; if (hc > hSeen) { hSeen = hc; if (!pend.length || pend[pend.length - 1] < f + 4) pend.push(f + 4, f + 10); }
      const fresh = pend.length > 0 && f >= pend[0];
      const rising = !regular && extra < maxExtra && f - lastF >= 3 && ((cv * covRatio > 0.001 && cv * covRatio > diffCv * 1.25) || fresh);
      // coverage truth: the counting override (PT.fragments) at every new estimator maximum above the ceiling (≤ 6 per cast); other frames
      // scale the estimator by the latest measured fragments / estimate ratio (the estimator counts whole quads, the override shaded fragments)
      const est = cv;
      cv = est * covRatio;
      if ((cv > covCeil * 0.7 || est > covCeil * 0.7) && fragCalls < 6 && est > covChecked * 1.05) {
        fragCalls++; covChecked = est;
        try { const fr = PT.fragments({ owner: fxOwner }); covRatio = Math.min(4, fr.scene / Math.max(1e-6, est)); cv = fr.scene; fragUsed = true; } catch (_) { /* */ }
      }
      if (cv > covMax) covMax = cv;
      if (!regular && !rising) continue;
      if (rising) extra++;
      while (pend.length && pend[0] <= f) pend.shift();
      const d = MG.diff();
      diffCv = Math.max(diffCv * 0.85, cv);
      const rec = { t: +(f / 60).toFixed(3), dt: (f - lastF) / 60, changed: d.changed, white: d.newWhite, sat: d.sat, rise: d.lumaRise, cov: cv };
      lastF = f;
      S.push(rec);
      // afterHit (silhouettes): the impact frame = the peak after the first hit (hitF ≥ 0), so the shared anticipation glyph does not decide it
      if ((!afterHit || hitF < 0 || f >= hitF) && (!peak || d.changed > peak.changed || (afterHit && hitF >= 0 && peak.t * 60 < hitF))) { peak = rec; peakD = d; if (frames) shotPeak = PT.pixels.dataURL(true); }
      // contact sheet: anticipation (2nd grid sample), impact (the peak frame), dissipation (the last grid sample)
      // (the window holds floor(N / every) grid samples, which can be < samples: the last grid sample is the dissipation frame)
      if (regular) { reg++; if (frames && reg === 2) shotA = PT.pixels.dataURL(true); if (frames && reg >= 3) shotD = PT.pixels.dataURL(true); }
    }
    try { unHit?.(); } catch (_) { /* */ }
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
    if (frames) { out.frames = [shotA, shotPeak, shotD].filter(Boolean); if (peakD) out.crop = MG.cropRect(peakD); }
    if (keepMask && peakD) out.mask = Array.from(peakD.mask);   // (only for IoU)
    if (window.__MG_DEBUG) out.samples = S.map((r) => r.t + ':' + r.changed);
    return out;
  };
  /** Contact-sheet framing (§1.8 review): a 16:9 window around the peak changed mask, the player and the dummy (+ margin), ≥ 208 px wide,
   *  so the sheet shows the effect near native resolution instead of a whole downscaled frame. */
  MG.cropRect = (d, extra = null) => {
    const W = d.w, H = d.h; let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d.mask[y * W + x]) { const yy = H - 1 - y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    const v = new T.Vector3(), add = (p) => { if (!p) return; v.copy(p).project(g.camera); if (v.z > 1) return; const sx = (v.x * 0.5 + 0.5) * W, sy = (0.5 - v.y * 0.5) * H; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); };
    const pp = g.player?.object?.position; if (pp) { add(pp); add(pp.clone().setY(pp.y + 1.8)); }
    if (MG.dummy?.object) { const q = MG.dummy.object.position; add(q); add(q.clone().setY(q.y + 1.8)); }
    if (extra) { x0 = Math.min(x0, extra.x); y0 = Math.min(y0, extra.y); x1 = Math.max(x1, extra.x + extra.w); y1 = Math.max(y1, extra.y + extra.h); }
    if (x1 < 0) return { x: 0, y: 0, w: W, h: H };
    const m = 14; x0 -= m; y0 -= m; x1 += m; y1 += m;
    let w = Math.max(208, x1 - x0), h = Math.max(117, y1 - y0);
    if (w / h < 16 / 9) w = h * 16 / 9; else h = w * 9 / 16;
    w = Math.min(W, Math.round(w)); h = Math.min(H, Math.round(h));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return { x: Math.round(Math.max(0, Math.min(W - w, cx - w / 2))), y: Math.round(Math.max(0, Math.min(H - h, cy - h / 2))), w, h };
  };
  /** Palette swatch through the real pipeline: an opaque 0.25 m `mid` ring + a `mid`-tinted FM solid, 4 m ahead on the test ground.
   *  Its mean saturation is the most any effect of that element can reach on this ground after the post chain (grade / tone map). */
  MG.swatch = (el) => {
    const K = g.vfx.kit; MG.setup(); MG.clear();
    const pp = g.player.object.position, f = new T.Vector3(); g.camera.getWorldDirection(f); f.y = 0; f.normalize();
    const at = pp.clone().addScaledVector(f, 4); at.y += 1.2; const R = K.ramp(el);
    const shape = { fire: 'fire.comet', water: 'water.droplet', ice: 'ice.prism', lightning: 'lightning.orb', wind: 'wind.crescent' }[el] || 'physical.chunk';
    K.line({ shape: 'ring', el, pos: at, plane: 'billboard', r: 0.8, width: 0.25, life: 5, tIn: 0, tOut: 0, alpha: 1, color: R.mid });
    K.mesh(shape, { pos: at.clone().add(new T.Vector3(0, -1.0, 0)), scale: 1.5, life: 5, tIn: 0, tOut: 0, el, color: R.mid, tintAmt: 0.5 });
    g.step(3, 1 / 60, false);
    const d = MG.diff(); MG.clear();
    return { sat: +d.sat.toFixed(3), px: d.changed };
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

/** Crop data-URL frames to rect r in the page (async canvas). */
const cropFrames = (pg, urls, r) => pg.eval(async ({ urls, r }) => Promise.all(urls.map(async (u) => {
  const im = new Image(); im.src = u; await im.decode();
  const c = document.createElement('canvas'); c.width = r.w; c.height = r.h; c.getContext('2d').drawImage(im, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return c.toDataURL('image/png');
})), { urls, r });

module.exports = async function (PT) {
  const t0 = Date.now();
  const root = PT.root;
  const full = !!PT.flags.full, sheets = !!PT.flags.sheets;
  const g5 = grepRule5(root);
  const lookCheck = (name, ok, detail) => LOOK_ROLLED_BACK ? PT.note(`(skipped: v4 look rolled back to v3 at user request) ${name}: ${ok ? 'pass' : 'fail'}`) : PT.check(name, ok, detail);
  lookCheck('MG static: rule 5 in src/spells* (no 0xffffff / #ffffff, no multiplier > 1.2)', g5.hits.length === 0, g5.hits.length ? g5.hits.slice(0, 20) : { files: g5.files });
  PT.check('MG static: no reserved threat shapes (hatch / chevron / diamond) in player linework', g5.reserved.length === 0, g5.reserved);
  for (const el of ['fire', 'ice', 'lightning', 'wind', 'water']) lookCheck(`MG static: src/spells/motifs/${el}.js exists`, fs.existsSync(path.join(root, 'src/spells/motifs', el + '.js')));

  // ================================================================== fresh page: first casts, registration, lookOf, castLock
  const pg = await PT.boot('&cls=mage&level=30&skills=preset:endgame_mage', { w: 640, h: 360 });
  PT.check('MG boot (mage, endgame)', pg.ready, pg.bootMs);
  if (!pg.ready) { await pg.close(); return; }
  await pg.eval(installMG);
  const reg = await pg.run('MG1.b registration', (bespoke) => {
    const g = window.game, K = g.vfx?.kit;
    // v4 look rolled back to v3 at user request: the motif / FM-shape / lookOf look-level checks no longer apply (notes only)
    const tierOf = (def, id) => { if (!def) return 'A'; if (def.slot === 'basic') return 'B'; if (def.slot === 'charged') return 'C'; if (def.slot === 'ultimate' || /\.awakened$/.test(id)) return 'U'; if (def.slot === 'finisher') return 'F'; if (def.slot === 'support') return 'Z'; return 'A'; };
    const ROLLED_BACK = true;   // v4 look rolled back to v3 at user request
    const CHECK = (name, ok, detail) => ROLLED_BACK ? PT.note(`(skipped: v4 look rolled back to v3 at user request) ${name}: ${ok ? 'pass' : 'fail'}`) : PT.check(name, ok, detail);
    PT.check('kit present', !!K);
    const kinds = ['cast', 'trail', 'burst', 'spark', 'zone', 'pillar', 'wave', 'aura', 'summon'];
    const miss = [];
    for (const el of ['fire', 'ice', 'lightning', 'wind', 'water']) for (const k of kinds) if (!K.hasMotif(el, k)) miss.push(el + ':' + k);
    CHECK('5 elements × 9 motif kinds registered (kit.registerMotif)', miss.length === 0, miss);
    const shapes = ['fire.flame', 'fire.tongue', 'fire.comet', 'fire.petal', 'fire.meteor', 'ice.prism', 'ice.stub', 'ice.shard', 'ice.lance', 'lightning.orb', 'lightning.spike', 'lightning.disc', 'wind.crescent', 'wind.leaf', 'water.droplet', 'water.sheet', 'water.bead'];
    const ms = shapes.filter((s) => !K._fm?.hasShape?.(s));
    CHECK('FM shapes registered (§3.5 primaries)', ms.length === 0, ms);
    const ids = [...g.skills.defs.keys()];
    const levels = {}; const bad = [];
    for (const id of ids) { const lv = g.debug.lookOf(id, 'caster'); levels[id] = lv; if (lv !== 'bespoke' && lv !== 'archetype') bad.push(id + ':' + lv); }
    CHECK(`lookOf: every registry skill declares ≥ 'archetype' (${ids.length} ids)`, bad.length === 0, bad);
    const nb = bespoke.filter((id) => levels[id] !== 'bespoke');
    CHECK(`lookOf: the bespoke set (${bespoke.length}) declares 'bespoke'`, nb.length === 0, nb);
    // the bespoke set is derived data: every *.basic / *.charged / *.ult of the registry and the starter_<cls> loadouts of the caster classes
    const need = ids.filter((id) => /\.(basic|charged|ult)$/.test(id));
    for (const cls of ['mage', 'ranger', 'spiritcaller']) {
      const pr = g.skills.PRESETS?.['starter_' + cls];
      for (const nid of Object.keys(pr?.ranks || {})) for (const sid of (g.skills.node(nid)?.grants || [])) if (g.skills.def(sid)) need.push(sid);
    }
    const notIn = [...new Set(need)].filter((id) => !bespoke.includes(id));
    PT.check(`bespoke set covers every registry basic / charged / ult and the caster starter loadouts (${new Set(need).size})`, notIn.length === 0, notIn);
    return { ids, levels, el: Object.fromEntries(ids.map((id) => [id, g.skills.def(id)?.element || g.spells.element])), arch: Object.fromEntries(ids.map((id) => [id, g.skills.def(id)?.archetype || null])), tier: Object.fromEntries(ids.map((id) => [id, tierOf(g.skills.def(id), id)])) };
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
    // time spent in other modules' event listeners during the cast (e.g. ui's first-reaction discovery card, progression xp) is
    // reported separately (evMs) and not charged to the cast: the check is about magic's own first-cast work (assets, programs, JIT)
    const ev = g.events, emit0 = ev.emit; let evMs = 0, depth = 0;
    ev.emit = function (...a) { if (depth) return emit0.apply(this, a); depth++; const t = performance.now(); try { return emit0.apply(this, a); } finally { evMs += performance.now() - t; depth--; } };
    const out = [];
    for (const id of ids) {
      MG.clear();
      const aim = MG.aim();
      evMs = 0;
      const t = performance.now(); try { g.debug.cast(id, { aim, charge: 1 }); } catch (_) { /* */ }
      const msAll = performance.now() - t, ms = msAll - evMs;
      const t2 = performance.now(); g.step(1, 1 / 60, true); const stepMs = performance.now() - t2;
      g.step(6, 1 / 60, false); g.renderNow();
      const rec = { id, ms: +ms.toFixed(2), evMs: +evMs.toFixed(2), stepMs: +stepMs.toFixed(1), firstDraws: g.debug.firstDraws() };
      g.step(30, 1 / 60, false);
      if (ms > 8) {   // separate a first-cast cost from machine load (4 CPUs shared): the same cast warm, 3 times
        const w = [];
        for (let k = 0; k < 3; k++) { MG.clear(); evMs = 0; const t3 = performance.now(); try { g.debug.cast(id, { aim: MG.aim(), charge: 1 }); } catch (_) { /* */ } w.push(performance.now() - t3 - evMs); g.step(30, 1 / 60, false); }
        w.sort((a, b) => a - b); rec.warm = +w[1].toFixed(2); rec.extra = +(ms - w[1]).toFixed(2);
      }
      out.push(rec);
    }
    ev.emit = emit0;
    return out;
  }, set);
  if (first) {
    // a cast over 8 ms counts as a first-cast hitch unless the same cast warm is itself slow (machine load) and the first-cast extra is ≤ 2 ms
    const slow = first.filter((r) => r.ms > 8 && !(r.warm > 6 && r.extra <= 2));
    const loaded = first.filter((r) => r.ms > 8 && !slow.includes(r));
    if (loaded.length) PT.note(`MG1.a over 8 ms only under machine load (warm cast as slow): ${JSON.stringify(loaded)}`);
    const evHeavy = first.filter((r) => r.evMs > 4);
    if (evHeavy.length) PT.note(`MG1.a other modules' event listeners during first casts (not charged): ${JSON.stringify(evHeavy.map((r) => ({ id: r.id, evMs: r.evMs })))}`);
    PT.check(`MG1.a first cast of every measured skill ≤ 8 ms CPU (${first.length})`, slow.length === 0, slow.length ? slow : { max: Math.max(...first.map((r) => r.ms)), median: first.map((r) => r.ms).sort((a, b) => a - b)[first.length >> 1] });
    const fd = first.filter((r) => r.firstDraws > 0);
    PT.check('MG1.a 0 first draws of never-drawn programs on first casts (boot warm-up)', fd.length === 0, fd.slice(0, 12));
  }

  // MG1.g castLock
  if (want('g')) await pg.run('MG1.g castLock', () => {
    const g = window.game, MG = window.MG, Sp = g.spells;
    MG.clear(); g.step(30, 1 / 60, false);
    // a finisher from MG1.a may still be playing (cinematic onEnd / 11 s safety net): wait for it (integration)
    let waited = 0; while (Sp.castLock > 0 && waited < 13) { g.step(60, 1 / 60, false); waited++; }
    if (waited) PT.note(`waited ${waited} s for an earlier finisher to end`);
    PT.check('castLock = 0 when free', Sp.castLock === 0, Sp.castLock);
    g.debug.cast('fire.basic', { aim: MG.aim() });
    PT.check('castLock = 0 after a basic', Sp.castLock === 0, Sp.castLock);
    MG.clear(); g.debug.cast('fire.ult', { aim: MG.aim() });
    const a = Sp.castLock;
    PT.check('castLock > 0 and ≤ 0.25 s during the ultimate anticipation', a > 0 && a <= 0.25, a);
    for (let i = 0; i < 40; i++) g.step(1, 1 / 60, false);
    PT.check('castLock back to 0 after 0.67 s', Sp.castLock === 0, Sp.castLock);
    MG.clear();
    // clearFx ends an active finisher (fin cleared, castLock 0, invulnerability restored) instead of leaving castLock at 0.05 forever
    const ent = g.player?.entity, inv0 = !!ent?.invulnerable;
    const ok = Sp.finisher('fire', { free: true, noCinematic: true }) !== false;
    g.step(10, 1 / 60, false);
    PT.check('castLock > 0 during a finisher', ok && Sp.castLock > 0, { ok, lock: Sp.castLock });
    MG.clear();
    PT.check('clearFx ends the finisher: castLock 0, finisherActive false, invulnerability restored', Sp.castLock === 0 && !Sp.finisherActive && !!ent?.invulnerable === inv0, { lock: Sp.castLock, fin: Sp.finisherActive, inv: !!ent?.invulnerable });
    g.step(60, 1 / 60, false);
    PT.check('castLock still 0 one second after clearFx', Sp.castLock === 0, Sp.castLock);
  });

  // ================================================================== MG1.c per-cast measurement
  if (process.env.MG_DEBUG) await pg.eval(() => { window.__MG_DEBUG = true; });
  const res = await pg.run('MG1.c setup', () => window.MG.setup());
  // per-element saturation reference (see MG.swatch): the §1.4 sat floor assumes the ramp's `mid` (saturation ≥ 0.5, R6) survives
  // the pipeline; where even an opaque swatch reads lower on the test ground, the floor is 85 % of the swatch (never above §1.4)
  const swatch = await pg.run('MG1.c palette swatches', (els) => { const o = {}; for (const el of els) o[el] = window.MG.swatch(el); return o; }, ['fire', 'ice', 'lightning', 'wind', 'water', 'earth', 'nature', 'light', 'shadow', 'physical']);
  PT.note(`MG1.c palette swatch saturation on the test ground: ${Object.entries(swatch || {}).map(([k, v]) => k + ' ' + v.sat).join(', ')}`);
  const satFloorOf = (el, T) => Math.min(T.sat, 0.85 * (swatch?.[el]?.sat ?? 1));
  const rows = [];
  const tstart = Date.now();
  for (const id of want('c') ? set : []) {
    const tier = reg.tier[id] || 'A';
    const r = await pg.eval(({ id, win, samples, frames, covCeil }) => window.MG.measure(id, { win, samples, frames, covCeil }), { id, win: WINDOW[tier], samples: SAMPLES[tier], covCeil: (TIER[tier] || TIER.A).cov, frames: sheets && (BESPOKE.includes(id) || Object.values(perArch).includes(id)) });
    r.tier = tier; rows.push(r);
    if (r.frames) {
      const cr = r.crop || { x: 0, y: 0, w: 640, h: 360 };
      const fr = await cropFrames(pg, r.frames, cr);
      await PT.sheet(pg, fr.map((u, i) => ({ url: u, label: `${id} ${['anticipation', 'impact', 'dissipation'][i] || ''}` })), path.join(root, 'tools/playtest4/sheets/caster', id + '.png'), { cols: 3, cellW: cr.w, cellH: cr.h, title: `${id} (${tier}, ${r.look}) · crop ${cr.w}×${cr.h} of 640×360` });
      delete r.frames; delete r.crop;
    }
  }
  PT.note(`MG1.c measured ${rows.length} casts in ${((Date.now() - tstart) / 1000).toFixed(0)} s`);
  if (process.env.MG_DEBUG) for (const r of rows) console.log('   ', r.id, r.detail, (r.samples || []).join(' '));
  const fails = [];
  for (const r of rows) {
    const T = TIER[r.tier] || TIER.A, why = [];
    if (r.tier === 'U' || r.tier === 'F') { if (r.white > T.whitePeak) why.push('white ' + r.white); if ((r.tier === 'U' ? r.whiteOver5 : r.whiteOver6) > 0.15 + 1e-6) why.push('white>' + (r.tier === 'U' ? 5 : 6) + '% for ' + r.whiteOver5 + ' s'); }
    else if (r.white > T.white) why.push('white ' + r.white);
    if (r.rise > T.luma) why.push('luma +' + r.rise);
    if (r.cov > T.cov) why.push('cov ' + r.cov);
    const satFloor = satFloorOf(reg.el[r.id], T);   // light: ivory ramp (§3.2, saturation ≤ 0.35 below hi) — the swatch rule covers it too
    r.satFloor = +satFloor.toFixed(3);
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
  lookCheck(`MG1.c every measured cast meets its tier ceilings and floors (${rows.length})`, fails.length === 0, fails.slice(0, 40));
  const bes = rows.filter((r) => BESPOKE.includes(r.id));
  lookCheck(`MG1.c bespoke set measured 'bespoke' (${bes.length}/${BESPOKE.length})`, bes.length === BESPOKE.length && bes.every((r) => r.measured === 'bespoke'), bes.filter((r) => r.measured !== 'bespoke').map((r) => r.id + ':' + r.measured));
  const archOk = rows.filter((r) => !BESPOKE.includes(r.id));
  lookCheck(`MG1.c archetype representatives measured ≥ 'archetype' (${archOk.length})`, archOk.every((r) => r.measured === 'archetype' || r.measured === 'bespoke'), archOk.filter((r) => r.measured === 'fail').map((r) => r.id));
  const summary = (k) => { const v = rows.map((r) => r[k]); return { max: Math.max(...v), median: v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] }; };
  PT.note(`MG1.c ranges: white ${JSON.stringify(summary('white'))} cov ${JSON.stringify(summary('cov'))} detail ${JSON.stringify(summary('detail'))} crisp ${JSON.stringify(summary('crisp'))} sat ${JSON.stringify(summary('sat'))}`);
  try { fs.mkdirSync(path.join(PT.OUT, 'magic'), { recursive: true }); fs.writeFileSync(path.join(PT.OUT, 'magic', 'mg1_rows.json'), JSON.stringify(rows, null, 1)); } catch (_) { /* */ }

  // ================================================================== MG1.d materials: second round without enemies
  if (want('d')) await pg.run('MG1.d materials', (ids) => {
    const g = window.game, MG = window.MG;
    for (const e of PT.enemies()) { e.alive = false; try { g.combat.unregister?.(e); } catch (_) { /* */ } }
    MG.dummy = null;
    MG.clear(); g.step(10, 1 / 60, false); g.debug.newMaterials();
    for (const id of ids.own) { MG.clear(); g.debug.cast(id, { aim: MG.aim(), charge: 1 }); g.step(50, 1 / 60, false); }
    const n = g.debug.newMaterials();
    PT.check(`0 new materials per cast after the first (${ids.own.length} casts, no enemies)`, n === 0, n);
    // finishers are staged by the cinematic module (ux, src/cinematic*): their materials are reported, not charged to magic
    if (ids.fin.length) {
      let waited = 0; while (g.spells.castLock > 0 && waited < 13) { g.step(60, 1 / 60, false); waited++; }
      g.debug.newMaterials();
      for (const id of ids.fin) { MG.clear(); g.debug.cast(id, { aim: MG.aim(), charge: 1 }); g.step(50, 1 / 60, false); for (let w = 0; g.spells.castLock > 0 && w < 13; w++) g.step(60, 1 / 60, false); }
      PT.note(`MG1.d finishers (cinematic, ux): ${g.debug.newMaterials()} new materials over ${ids.fin.length} repeat casts (not magic's)`);
    }
  }, { own: set.filter((id) => reg.tier[id] !== 'F'), fin: set.filter((id) => reg.tier[id] === 'F') });
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
        const out = MG.measure(null, { win: 0.8, samples: 4, keepMask: true, afterHit: true, frames: !!sheets, fn: (aim) => MG.archCast(name, rep, el, aim) });
        if (sheets) { out.shot = out.frames?.[1] || out.frames?.[0] || null; delete out.frames; }   // out.crop: framing of this element's impact
        return out;
      }, { name, rep, el, sheets });
      masks[el] = r.mask; if (r.shot) frames.push({ url: r.shot, label: `${name} · ${el}`, crop: r.crop });
    }
    const els = Object.keys(masks); let worst = 0, pair = null;
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const A = masks[els[i]], B = masks[els[j]]; if (!A || !B) continue;
      let I = 0, U = 0; for (let k = 0; k < A.length; k++) { const x = A[k], y = B[k]; if (x && y) I++; if (x || y) U++; }
      const iou = U ? I / U : 0; if (iou > worst) { worst = iou; pair = els[i] + '/' + els[j]; }
    }
    if (worst >= 0.5) iouFails.push(`${name}: ${pair} ${worst.toFixed(2)}`);
    PT.note(`MG1.f ${name}: max element IoU ${worst.toFixed(2)} (${pair})`);
    if (sheets && frames.length) {
      // one common window (union of the 9 impact framings) so the elements compare 1:1; 3 sheets of 3 elements at native resolution
      const cs = frames.map((f) => f.crop).filter(Boolean);
      let cr = { x: 0, y: 0, w: 640, h: 360 };
      if (cs.length) { const x0 = Math.min(...cs.map((c) => c.x)), y0 = Math.min(...cs.map((c) => c.y)), x1 = Math.max(...cs.map((c) => c.x + c.w)), y1 = Math.max(...cs.map((c) => c.y + c.h));
        let w = x1 - x0, h = y1 - y0; if (w / h < 16 / 9) w = h * 16 / 9; else h = w * 9 / 16; w = Math.min(640, Math.round(w)); h = Math.min(360, Math.round(h));
        cr = { x: Math.max(0, Math.min(640 - w, Math.round((x0 + x1 - w) / 2))), y: Math.max(0, Math.min(360 - h, Math.round((y0 + y1 - h) / 2))), w, h }; }
      const urls = await cropFrames(pg, frames.map((f) => f.url), cr);
      try { fs.unlinkSync(path.join(root, 'tools/playtest4/sheets/caster', 'arch_' + name + '.png')); } catch (_) { /* replaced by the 3 parts */ }
      for (let k = 0; k < 3; k++) {
        const part = urls.slice(k * 3, k * 3 + 3).map((u, i) => ({ url: u, label: frames[k * 3 + i].label }));
        if (part.length) await PT.sheet(pg, part, path.join(root, 'tools/playtest4/sheets/caster', `arch_${name}_${k + 1}.png`), { cols: 3, cellW: cr.w, cellH: cr.h, title: `archetype ${name} × elements ${k * 3 + 1}-${k * 3 + part.length} of 9 (impact frame) · crop ${cr.w}×${cr.h}` });
      }
    }
  }
  lookCheck(`MG1.f element silhouettes: pairwise impact-frame IoU < 0.5 for ${ARCH.length} archetypes`, iouFails.length === 0, iouFails);

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
      lookCheck(`MG1.c (${cls}) bespoke set within ceilings / floors`, bad.length === 0, bad.slice(0, 20));
      const e2 = p2.errors(); PT.check(`MG ${cls} page: no uncaught errors`, e2.length === 0, e2.slice(0, 6));
      await p2.close();
    }
  }
  PT.skip('MG1 telegraph retention ≥ 95 % (R-mage / R-boss)', 'verified at integration (I) with the real tells and both families');
  PT.note(`magic section ${((Date.now() - t0) / 1000).toFixed(0)} s`);
};
module.exports.installMG = installMG;
