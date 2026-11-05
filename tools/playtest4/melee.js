// playtest4 section: melee (PLAN v4 §7.8 ML1; owner melee). Run: node tools/playtest4.js melee [--full] [--sheets]
//  static   rule 5 grep (no 0xffffff / #ffffff, no emissive / intensity multiplier > 1.2) in src/sword*; no reserved threat shapes in melee
//           linework; no game.hitstop in melee files; the 4 melee motif files exist
//  ML1.a    fresh boot: first cast of every measured skill ≤ 8 ms CPU, 0 first draws of never-drawn programs
//  ML1.b    registration: earth / nature / light / shadow × 9 motif kinds + FM shapes; lookOf(id) for every registry skill ≥ 'archetype'
//           (declared), the bespoke set 'bespoke'
//  ML1.c    per-cast measurement (percast method, 640×360, fx 1.0, melee family): newWhite, luma rise, sat, coverage (counting override
//           on player FX at the peak frame, and vfx.debug.byCast), detail, crisp, particles, handles, generic flag → measured level;
//           ceilings + floors per tier (§1.4). Default: bespoke set + 1 skill per archetype as 검사; --full: every registry skill,
//           and the bespoke set as 성기사 and 암살자
//  ML1.d    0 new materials per cast after the first
//  ML1.e    stacked 7-cast melee rotation (1 s) ≤ 12 % near-white
//  ML1.f    element silhouettes: impact-frame masks of the 9 elements per archetype, pairwise IoU < 0.5 (default 4 archetypes + basic, --full all)
//  ML1.g    dodge-cancel windows via player.action.dodgeCancelable: every combo swing (3 weapons × 9 elements) locks ≤ 0.25 s; charged
//           cancellable while charging and ≤ 0.10 s after release; actives ≤ 0.10 s after the first damage frame; ultimates from the
//           first damage frame; finishers never cancellable and fully invulnerable
//  --sheets contact sheets tools/playtest4/sheets/melee/<id>.png (anticipation / impact / dissipation) for the bespoke set + one skill per
//           archetype, and sheets/melee/arch_<name>.png (impact frame × 9 elements)
//  (I) telegraph retention ≥ 95 % is verified by core at integration (R-sword with the real looks of both families).
const fs = require('fs'); const path = require('path');

const TIER = {
  B: { white: 0.015, luma: 6, sat: 0.40, cov: 0.05, detail: 500, crisp: 0.25, particles: 16, handles: 4 },
  C: { white: 0.04, luma: 12, sat: 0.40, cov: 0.30, detail: 2000, crisp: 0.25, particles: 80, handles: 8 },
  A: { white: 0.04, luma: 12, sat: 0.40, cov: 0.30, detail: 2000, crisp: 0.25, particles: 80, handles: 8 },
  Z: { white: 0.03, luma: 8, sat: 0.35, cov: 0.15, detail: 1200, crisp: 0.30, particlesPerSec: 30, handles: 6 },
  U: { white: 0.05, whitePeak: 0.12, luma: 20, sat: 0.35, cov: 1.0, detail: 8000, crisp: 0.20, particles: 150, handles: 12 },
  F: { white: 0.06, whitePeak: 0.15, luma: 99, sat: 0.30, cov: 1.5, detail: 10000, crisp: 0.20, particles: 250, handles: 99 },
};
// R6: light (ivory, saturation ≤ 0.35 by rule) and physical have no saturation floor
const SAT_EXEMPT = new Set(['light', 'physical']);
const WINDOW = { B: 0.6, C: 1.2, A: 1.2, Z: 1.5, U: 2.2, F: 3.0 };
const EVERY = +(process.env.MELEE_EVERY || 6);
const ELS = ['fire', 'ice', 'lightning', 'wind', 'water', 'earth', 'nature', 'light', 'shadow'];

function grepStatic(root) {
  const files = [path.join(root, 'src/sword.js')];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(path.join(root, 'src/sword'));
  const hits = [], reserved = [], hitstop = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      const rel = path.relative(root, f) + ':' + (i + 1);
      if (/0x[fF]{6}\b/.test(l) || /#[fF]{6}\b/.test(l)) hits.push(rel + ' white');
      const m = l.match(/(emissiveIntensity|intensity|uIntensity)\s*[:=]\s*([0-9.]+)/); if (m && +m[2] > 1.2) hits.push(rel + ' ' + m[1] + ' ' + m[2]);
      if (/\*\s*(1\.[3-9]|[2-9]\.\d)\s*[,)]/.test(l) && /col|Col|color/.test(l) && /glsl|vec3|uCol/.test(l)) hits.push(rel + ' colour multiplier');
      if (/shape:\s*'(hatch|chevron|chevrons|diamond)'/.test(l) || /decal\('hatch'/.test(l)) reserved.push(rel);
      if (/game\.hitstop\s*\?*\.?\(/.test(l)) hitstop.push(rel);
    });
  }
  return { files: files.length, hits, reserved, hitstop };
}

// ======================================================================================== in-page helpers
function installML() {
  const g = window.game, T = g.THREE, PT = window.PT;
  if (window.ML) return true;
  const ML = window.ML = {};
  const SPOT = { x: -20, z: 45 };
  ML.setup = (dist = 3.4) => {
    PT.tp(SPOT.x, SPOT.z, 0.1); PT.clearEnemies?.(false);
    PT.look(Math.PI, -0.18); g.step(10, 1 / 60, false);
    const pp = g.player.object.position, f = new T.Vector3(); g.camera.getWorldDirection(f); f.y = 0; f.normalize();
    g.player.setFacing?.(Math.atan2(f.x, f.z));
    ML.dummy = g.debug.spawn('dummy', { pos: pp.clone().addScaledVector(f, dist), hp: 1e9 });
    if (ML.dummy) PT.armor(ML.dummy);
    g.step(20, 1 / 60, false);
    return !!ML.dummy;
  };
  ML.home = () => {
    PT.tp(SPOT.x, SPOT.z, 0.05); PT.look(Math.PI, -0.18); g.step(2, 1 / 60, false);
    const pp = g.player.object.position, f = new T.Vector3(); g.camera.getWorldDirection(f); f.y = 0; f.normalize();
    g.player.setFacing?.(Math.atan2(f.x, f.z));
    if (ML.dummy?.alive) { const q = pp.clone().addScaledVector(f, 3.4); ML.dummy.object.position.set(q.x, ML.dummy.object.position.y, q.z); }
  };
  ML.aim = () => {
    const pl = g.player; const o = pl.object.position.clone(); o.y += 1.4;
    const d = ML.dummy; const c = d?.alive ? g.combat.getCenter(d, new T.Vector3()) : o.clone().add(new T.Vector3(0, 0, -4));
    return { origin: o, dir: c.clone().sub(o).normalize(), point: c, target: d?.alive ? d : null };
  };
  ML.fxObjs = () => { const out = []; g.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite) && o.visible && o.userData?.owner === 'player' && o !== g.player?.object) out.push(o); }); return out; };
  ML.diff = () => { const list = ML.fxObjs(); return PT.pixels.diff((on) => { for (const o of list) o.visible = on; }); };
  ML.clear = () => {
    try { g.sword.clearFx(); } catch (_) { /* */ }
    try { g.spells?.clearFx?.(); } catch (_) { /* */ }
    try { g.vfx?.clear?.(); } catch (_) { /* */ }   // lingering kit handles / particles of the previous cast
    g.skills.resetCooldowns?.(); PT.keepAlive(); PT.heal();
    if (g.state !== 'playing') { try { g.setState('playing'); } catch (_) { /* */ } }
    g.step(2, 1 / 60, false); ML.home();
  };
  /** Cast id (or call fn) and sample the window. Returns metrics + optional frames and the peak mask. */
  ML.measure = (id, { win = 1.4, every = 4, frames = false, keepMask = false, fn = null } = {}) => {
    ML.clear();
    const aim = ML.aim();
    g.debug.newMaterials();
    const t0 = performance.now();
    let castId = 0;
    if (fn) castId = fn(aim); else { g.skills.cast(id, { free: true, aim, charge: 1 }); castId = g.sword.lastCastId; }
    const castMs = performance.now() - t0;
    const n = Math.max(3, Math.round(win * 60 / every));
    const S = [];
    let peak = null, peakD = null, cov = 0; const shots = [];
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < every; j++) { PT.keepAlive(); g.step(1, 1 / 60, false); if (g.state !== 'playing' && g.state !== 'cinematic') break; }
      const d = ML.diff();
      const rec = { t: +((k + 1) * every / 60).toFixed(3), changed: d.changed, white: d.newWhite, sat: d.sat, rise: d.lumaRise };
      S.push(rec);
      if (!peak || d.changed > peak.changed) {
        peak = rec; peakD = d;
        if (!peak.cov || d.changed > (peak.covAt || 0) * 1.15) { const f = PT.fragments({ owner: 'player' }); rec.cov = f.scene; rec.covAt = d.changed; cov = Math.max(cov, f.scene); }
      }
      if (frames && (k === 1 || k === Math.round(n * 0.3) || k === Math.round(n * 0.75))) shots.push(PT.pixels.dataURL(false));
    }
    let crisp = 0;
    if (peakD && peakD.changed > 0) crisp = PT.pixels.sobel({ mask: peakD.mask, w: peakD.w, h: peakD.h }, peakD.on);
    const bc = g.vfx.debug.byCast(castId) || {};
    const cc = g.sword.look.cast(castId);
    const out = {
      id, castId, castMs: +castMs.toFixed(2), peakT: peak?.t ?? 0,
      detail: peak?.changed ?? 0, sat: +(peak?.sat ?? 0).toFixed(3), crisp: +crisp.toFixed(3),
      white: +Math.max(0, ...S.map((s) => s.white)).toFixed(4), whiteOver5: S.filter((s) => s.white > 0.05).length * every / 60, whiteOver6: S.filter((s) => s.white > 0.06).length * every / 60,
      rise: +Math.max(0, ...S.map((s) => s.rise)).toFixed(2),
      cov: +Math.max(cov, bc.coverage ?? 0).toFixed(3), covKit: bc.coverage ?? 0, particles: bc.particles ?? 0, handles: (bc.handles ?? 0) + (cc ? cc.arcs : 0), generic: !!bc.generic,
      newMats: g.debug.newMaterials(), look: id ? g.debug.lookOf(id, 'melee') : null, path: g.skills.lastPath, tierCC: cc?.tier || null,
    };
    if (frames) out.frames = shots;
    if (keepMask && peakD) out.mask = Array.from(peakD.mask);
    return out;
  };
  /** Archetype look of element el (no bespoke row): the registered melee archetype with a ctx built like the skills runtime's. */
  ML.archCast = (name, rep, el, aim) => {
    const fn = g.archetypes.getArchetype(name, 'melee'); if (!fn) return 0;
    const def = g.skills.def(rep); const params = g.skills.effectiveParams(rep);
    const castId = g.nextCastId();
    const ctx = { game: g, skillId: 'iou.' + name, def, element: el, params, family: 'melee', style: g.player.style || 'longsword', cls: g.progression.cls, origin: aim.origin.clone(), aim, charge: 1, slot: def.slot, awakened: false, castMul: 1,
      S: g.spells?.api, M: g.sword.api, castId, cooldown: 0, after: (t, f) => g.sword.api.after(t, f), baseDamage: () => params.dmg ?? 10,
      hit(base) { const h = base || {}; h.skillId = rep; h.slot = def.slot; if (!h.element) h.element = el; h.source = g.player.entity; h.tier = h.tier || 'heavy'; h.tags = h.tags || []; return h; } };
    fn(ctx);
    return castId;
  };
  /** Combo swing of element el (basic) through playLegacy. */
  ML.basicCast = (el) => { g.sword.api.playLegacy(el, 'combo', { free: true, skillId: el + '.basic' }); return g.sword.lastCastId; };
  return true;
}

/** Dodge-cancel windows (ML1.g), in page. */
function dodgeWindows(arg) {
  const g = window.game, PT = window.PT, ML = window.ML;
  const A = g.player.action;
  const res = { combo: [], heavy: [], active: [], ult: [], fin: null };
  // longest contiguous span with dodgeCancelable false while an action runs (game seconds)
  const lockSpan = (maxSec, stopWhen) => {
    let run = 0, worst = 0, frames = 0;
    for (let f = 0; f < maxSec * 60; f++) {
      PT.keepAlive(); g.step(1, 1 / 60, false); frames++;
      const busy = !!g.sword.action;
      if (busy && !A.dodgeCancelable) { run += 1 / 60; worst = Math.max(worst, run); } else run = 0;
      if (stopWhen && stopWhen()) break;
      if (!busy && f > 4) break;
    }
    return +worst.toFixed(3);
  };
  for (const el of arg.els) {
    ML.clear();
    const len = { longsword: 4, hammer: 3, daggers: 6 }[g.sword.api.weapon().id] || 4;
    for (let i = 0; i < len; i++) {
      g.sword.api.playLegacy(el, 'combo', { free: true, skillId: el + '.basic' });
      const name = g.sword.action?.name || '?';
      const lock = lockSpan(1.6);
      res.combo.push({ el, step: i, name, lock });
    }
    // charged: while charging (v3 skills charge) cancellable; after release ≤ 0.10 s lock
    ML.clear();
    g.sword.api.playLegacy(el, 'heavy', { free: true, charge: 1, skillId: el + '.charged' });
    const firstLock = (() => { let t = 0; for (let f = 0; f < 120; f++) { if (A.dodgeCancelable || !g.sword.action) break; g.step(1, 1 / 60, false); t += 1 / 60; } return +t.toFixed(3); })();
    res.heavy.push({ el, afterRelease: firstLock });
  }
  // actives (archetype path) and ultimates
  for (const id of arg.actives) {
    ML.clear();
    g.skills.cast(id, { free: true, aim: ML.aim(), charge: 1 });
    let t = 0, dmgT = null, freeT = null;
    const off = g.events.on('damage', (p) => { if (dmgT == null && p?.target && p.target.team !== 'player' && !p.dot && p.skillId === id) dmgT = t; });
    for (let f = 0; f < 150; f++) { g.step(1, 1 / 60, false); t += 1 / 60; if (freeT == null && (A.dodgeCancelable || !g.sword.action)) { freeT = t; } if (freeT != null && dmgT != null) break; }
    off();
    const slot = g.skills.def(id)?.slot;
    (slot === 'ultimate' ? res.ult : res.active).push({ id, dmgT: dmgT == null ? null : +dmgT.toFixed(3), freeT: freeT == null ? null : +freeT.toFixed(3) });
  }
  // finisher: never cancellable, fully invulnerable while it plays
  if (arg.fin) {
    ML.clear();
    g.progression.awakening = 100;
    g.skills.cast(arg.fin, { free: true, aim: ML.aim() });
    let frames = 0, cancel = 0, vuln = 0;
    for (let f = 0; f < 60 * 8; f++) {
      g.step(1, 1 / 60, false);
      const a = g.sword.action;
      if (!a || a.kind !== 'finisher') { if (frames > 0) break; continue; }
      frames++;
      if (A.dodgeCancelable || A.cancelable) cancel++;
      if (!g.player.entity.invulnerable) vuln++;
    }
    if (g.state !== 'playing') { for (let k = 0; k < 600 && g.state !== 'playing'; k++) g.step(1, 1 / 60, false); }
    res.fin = { id: arg.fin, frames, cancel, vuln };
  }
  return res;
}

module.exports = async function (PT) {
  const t0 = Date.now();
  const root = PT.root;
  const full = !!PT.flags.full, sheets = !!PT.flags.sheets;
  const part = process.env.MELEE_PART || 'all';
  const st = grepStatic(root);
  PT.check('ML static: rule 5 in src/sword* (no 0xffffff / #ffffff, no multiplier > 1.2)', st.hits.length === 0, st.hits.length ? st.hits.slice(0, 20) : { files: st.files });
  PT.check('ML static: no reserved threat shapes (hatch / chevron / diamond) in melee linework', st.reserved.length === 0, st.reserved);
  PT.check('ML static: no game.hitstop in melee files (finisher / parry feel through vfx.hitFeel tiers)', st.hitstop.length === 0, st.hitstop);
  for (const el of ['earth', 'nature', 'light', 'shadow']) PT.check(`ML static: src/sword/motifs/${el}.js exists`, fs.existsSync(path.join(root, 'src/sword/motifs', el + '.js')));
  PT.check('ML static: src/sword/looks.js exists', fs.existsSync(path.join(root, 'src/sword/looks.js')));

  // ================================================================== fresh page (검사): first casts, registration, lookOf
  const pg = await PT.boot('&cls=sword&level=30&skills=preset:endgame_sword', { w: 640, h: 360 });
  PT.check('ML boot (sword, endgame)', pg.ready, pg.bootMs);
  if (!pg.ready) { await pg.close(); return; }
  await pg.eval(installML);
  const reg = await pg.run('ML1.b registration', () => {
    const g = window.game, K = g.vfx?.kit, L = g.sword?.look;
    PT.check('kit present and the melee look engine installed', !!K && !!L?.installed && !!L.motifsInstalled);
    const kinds = ['cast', 'trail', 'burst', 'spark', 'zone', 'pillar', 'wave', 'aura', 'summon'];
    const miss = [];
    for (const el of ['earth', 'nature', 'light', 'shadow']) for (const k of kinds) if (!K.hasMotif(el, k)) miss.push(el + ':' + k);
    PT.check('4 melee elements × 9 motif kinds registered (kit.registerMotif)', miss.length === 0, miss);
    const shapes = ['earth.rock', 'earth.spike', 'earth.slab', 'nature.vine', 'nature.thorn', 'nature.petal', 'nature.leaf', 'light.ray', 'light.halo', 'light.feather', 'shadow.tendril', 'shadow.crescent', 'shadow.raven', 'shadow.raven2'];
    const ms = shapes.filter((s) => !K._fm?.hasShape?.(s));
    PT.check('FM shapes registered (§3.5 melee primaries)', ms.length === 0, ms);
    const ids = L.registryIds();
    const levels = {}; const bad = [];
    for (const id of ids) { const lv = g.debug.lookOf(id, 'melee'); levels[id] = lv; if (lv !== 'bespoke' && lv !== 'archetype') bad.push(id + ':' + lv); }
    PT.check(`lookOf: every registry skill declares ≥ 'archetype' in the melee family (${ids.length} ids)`, bad.length === 0, bad);
    const bespoke = [...L.bespokeSet()];
    const nb = bespoke.filter((id) => levels[id] !== 'bespoke');
    PT.check(`lookOf: the melee bespoke set (${bespoke.length}) declares 'bespoke'`, nb.length === 0, nb);
    return { ids, levels, bespoke, arch: Object.fromEntries(ids.map((id) => [id, g.skills.def(id)?.archetype || null])), tier: Object.fromEntries(ids.map((id) => [id, L.tierOf(g.skills.def(id), id)])), el: Object.fromEntries(ids.map((id) => [id, g.skills.def(id)?.element || null])) };
  });
  if (!reg) { await pg.close(); return; }
  const BESPOKE = reg.bespoke;
  const perArch = {};
  for (const id of reg.ids) { const a = reg.arch[id]; if (a && !perArch[a] && !BESPOKE.includes(id)) perArch[a] = id; }
  for (const id of reg.ids) { const a = reg.arch[id]; if (a && !perArch[a]) perArch[a] = id; }
  let set = full ? reg.ids.slice() : [...new Set([...BESPOKE, ...Object.values(perArch)])];
  if (process.env.MELEE_IDS) set = process.env.MELEE_IDS.split(',');
  const sheetSet = new Set([...BESPOKE, ...Object.values(perArch)]);

  // dev probe: MELEE_PART=probe MELEE_PROBE=<file exporting an in-page function source> (diagnostics only)
  if (part === 'probe' && process.env.MELEE_PROBE) {
    const src = fs.readFileSync(process.env.MELEE_PROBE, 'utf8');
    const out = await pg.eval(new Function('return ' + src)(), process.env.MELEE_PROBE_ARG || null);
    console.log(JSON.stringify(out, null, 1));
    await pg.close(); return;
  }
  // ML1.a first casts on the fresh page
  if (part === 'all' || part === 'first') {
    const first = await pg.run('ML1.a first cast', (ids) => {
      const g = window.game, ML = window.ML; ML.setup();
      g.renderNow(); g.debug.firstDraws();
      const out = [];
      for (const id of ids) {
        ML.clear();
        const aim = ML.aim();
        const t = performance.now(); try { g.skills.cast(id, { free: true, aim, charge: 1 }); } catch (_) { /* */ }
        const ms = performance.now() - t;
        const t2 = performance.now(); g.step(1, 1 / 60, true); const stepMs = performance.now() - t2;
        g.step(8, 1 / 60, false); g.renderNow();
        out.push({ id, ms: +ms.toFixed(2), stepMs: +stepMs.toFixed(1), firstDraws: g.debug.firstDraws() });
        g.step(30, 1 / 60, false);
      }
      return out;
    }, set);
    if (first) {
      const slow = first.filter((r) => r.ms > 8);
      PT.check(`ML1.a first cast of every measured skill ≤ 8 ms CPU (${first.length})`, slow.length === 0, slow.length ? slow : { max: Math.max(...first.map((r) => r.ms)) });
      const fd = first.filter((r) => r.firstDraws > 0);
      PT.check('ML1.a 0 first draws of never-drawn programs on first casts (boot warm-up)', fd.length === 0, fd.slice(0, 12));
    }
  }

  // ================================================================== ML1.g dodge-cancel windows
  if (part === 'all' || part === 'dodge') {
    const actives = [...new Set(Object.values(perArch).filter((id) => reg.tier[id] === 'A' || reg.tier[id] === 'Z'))].slice(0, full ? 99 : 6);
    const ults = reg.ids.filter((id) => /\.ult$/.test(id)).slice(0, full ? 99 : 3);
    for (const [cls, w] of [['sword', 'longsword'], ['paladin', 'hammer'], ['shadowblade', 'daggers']]) {
      const p2 = cls === 'sword' ? pg : await PT.boot(`&cls=${cls}&level=30&skills=preset:endgame_${cls}`, { w: 640, h: 360 });
      if (!p2.ready) { PT.check(`ML1.g ${cls} boot`, false); continue; }
      if (p2 !== pg) await p2.eval(installML);
      await p2.eval(() => window.ML.setup());
      const r = await p2.run(`ML1.g ${cls}`, dodgeWindows, { els: ELS, actives: cls === 'sword' ? [...actives, ...ults] : [], fin: cls === 'sword' ? 'fire.finisher' : null });
      if (r) {
        const worst = r.combo.reduce((m, x) => (x.lock > m.lock ? x : m), { lock: 0 });
        const bad = r.combo.filter((x) => x.lock > 0.25 + 1 / 60 + 1e-6);
        PT.check(`ML1.g ${w}: every combo swing (9 elements) dodge-locks ≤ 0.25 s (worst ${worst.name} ${worst.el} ${worst.lock} s)`, bad.length === 0, bad.length ? bad.slice(0, 10) : { swings: r.combo.length, worst: worst.lock });
        const hb = r.heavy.filter((x) => x.afterRelease > 0.10 + 1 / 60 + 1e-6);
        PT.check(`ML1.g ${w}: charged releases dodge-cancellable ≤ 0.10 s after release`, hb.length === 0, hb.length ? hb : { max: Math.max(...r.heavy.map((x) => x.afterRelease)) });
        if (r.active.length) {
          const ab = r.active.filter((x) => x.freeT == null || (x.dmgT != null ? x.freeT > x.dmgT + 0.10 + 2 / 60 + 1e-6 : x.freeT > 0.35 + 2 / 60));
          PT.check(`ML1.g actives dodge-cancellable ≤ 0.10 s after the first damage frame (0.35 s without) (${r.active.length})`, ab.length === 0, ab.length ? ab : r.active);
        }
        if (r.ult.length) {
          const ub = r.ult.filter((x) => x.freeT == null || (x.dmgT != null ? x.freeT > x.dmgT + 2 / 60 + 1e-6 : x.freeT > 0.35 + 2 / 60));
          PT.check(`ML1.g ultimates dodge-cancellable from the first damage frame (${r.ult.length})`, ub.length === 0, ub.length ? ub : r.ult);
        }
        if (r.fin) PT.check(`ML1.g finisher ${r.fin.id}: never dodge-cancellable and invulnerable for its whole duration`, r.fin.frames > 10 && r.fin.cancel === 0 && r.fin.vuln === 0, r.fin);
      }
      if (p2 !== pg) { const e2 = p2.errors(); PT.check(`ML1.g ${cls} page: no uncaught errors`, e2.length === 0, e2.slice(0, 6)); await p2.close(); }
    }
  }

  // ================================================================== ML1.c per-cast measurement
  const rows = [];
  if (part === 'all' || part === 'measure') {
    await pg.run('ML1.c setup', () => window.ML.setup());
    const tstart = Date.now();
    for (const id of set) {
      const tier = reg.tier[id] || 'A';
      const r = await pg.eval(({ id, win, frames, every }) => window.ML.measure(id, { win, frames, every }), { id, win: WINDOW[tier], frames: sheets && sheetSet.has(id), every: EVERY });
      r.tier = tier; r.el = reg.el[id] || 'physical'; rows.push(r);
      if (process.env.MELEE_VERBOSE) { const f = []; judge(r, f); console.log('   ', id, tier, JSON.stringify({ d: r.detail, c: r.crisp, s: r.sat, w: r.white, cov: r.cov, p: r.particles, h: r.handles, why: r.why })); }
      if (r.frames) {
        await PT.sheet(pg, r.frames.map((u, i) => ({ url: u, label: `${id} ${['anticipation', 'impact', 'dissipation'][i] || ''}` })), path.join(root, 'tools/playtest4/sheets/melee', id + '.png'), { cols: 3, cellW: 320, cellH: 180, title: `${id} (melee, ${tier}, ${r.look})` });
        delete r.frames;
      }
    }
    PT.note(`ML1.c measured ${rows.length} casts in ${((Date.now() - tstart) / 1000).toFixed(0)} s`);
    const fails = [];
    for (const r of rows) judge(r, fails);
    PT.check(`ML1.c every measured cast meets its tier ceilings and floors (${rows.length})`, fails.length === 0, fails.slice(0, 40));
    const bes = rows.filter((r) => BESPOKE.includes(r.id));
    PT.check(`ML1.c bespoke set measured 'bespoke' (${bes.length}/${BESPOKE.length})`, bes.length === BESPOKE.length && bes.every((r) => r.measured === 'bespoke'), bes.filter((r) => r.measured !== 'bespoke').map((r) => r.id + ':' + r.measured));
    const archOk = rows.filter((r) => !BESPOKE.includes(r.id));
    PT.check(`ML1.c archetype representatives measured ≥ 'archetype' (${archOk.length})`, archOk.every((r) => r.measured === 'archetype' || r.measured === 'bespoke'), archOk.filter((r) => r.measured === 'fail').map((r) => r.id));
    const summary = (k) => { const v = rows.map((r) => r[k]); return { max: Math.max(...v), median: v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] }; };
    PT.note(`ML1.c ranges: white ${JSON.stringify(summary('white'))} cov ${JSON.stringify(summary('cov'))} detail ${JSON.stringify(summary('detail'))} crisp ${JSON.stringify(summary('crisp'))} sat ${JSON.stringify(summary('sat'))} particles ${JSON.stringify(summary('particles'))}`);
    try { fs.mkdirSync(path.join(PT.OUT, 'melee'), { recursive: true }); fs.writeFileSync(path.join(PT.OUT, 'melee', 'ml1_rows.json'), JSON.stringify(rows, null, 1)); } catch (_) { /* */ }

    // ML1.d materials: second round
    await pg.run('ML1.d materials', (ids) => {
      const g = window.game, ML = window.ML;
      ML.clear(); g.step(10, 1 / 60, false); g.debug.newMaterials();
      for (const id of ids) { ML.clear(); g.skills.cast(id, { free: true, aim: ML.aim(), charge: 1 }); g.step(50, 1 / 60, false); }
      const n = g.debug.newMaterials();
      PT.check(`0 new materials per cast after the first (${ids.length} casts)`, n === 0, n);
    }, set.filter((id) => reg.tier[id] !== 'F'));

    // ML1.e stacked rotation
    await pg.run('ML1.e stacked 7-cast melee rotation', () => {
      const g = window.game, ML = window.ML;
      ML.clear();
      const ids = ['fire.basic', 'fire.charged', 'fire.cyclone', 'lightning.dash', 'fire.phoenix', 'lightning.mine', 'fire.ult'];
      let peak = 0, k = 0;
      for (let f = 0; f < 96; f++) {
        if (f % 8 === 0 && k < ids.length) { g.skills.resetCooldowns?.(); g.skills.cast(ids[k++], { free: true, aim: ML.aim(), charge: 1 }); }
        PT.keepAlive(); g.step(1, 1 / 60, false);
        if (f % 4 === 3) { const d = ML.diff(); if (d.newWhite > peak) peak = d.newWhite; }
      }
      PT.check('stacked 7-cast melee rotation ≤ 12 % near-white (v3: 94–97 %)', peak <= 0.12, +peak.toFixed(4));
      ML.clear();
    });
  }

  // ================================================================== ML1.f element silhouettes per archetype
  if (part === 'all' || part === 'iou') {
    const ARCH = full ? Object.keys(perArch) : ['projectile', 'nova', 'cone', 'zone'];
    const iouFails = [];
    const runSet = [['basic', null], ...ARCH.map((a) => [a, perArch[a]])];
    for (const [name, rep] of runSet) {
      if (name !== 'basic' && !rep) continue;
      const masks = {}; const frames = [];
      for (const el of ELS) {
        const r = await pg.eval(({ name, rep, el, sheets }) => {
          const ML = window.ML; ML.setup();
          const out = ML.measure(null, { win: 0.8, every: 3, keepMask: true, fn: (aim) => (name === 'basic' ? ML.basicCast(el) : ML.archCast(name, rep, el, aim)) });
          if (sheets) out.shot = window.PT.pixels.dataURL(true);
          return out;
        }, { name, rep, el, sheets });
        masks[el] = r.mask; if (r.shot) frames.push({ url: r.shot, label: `${name} · ${el}` });
      }
      let worst = 0, pair = null;
      for (let i = 0; i < ELS.length; i++) for (let j = i + 1; j < ELS.length; j++) {
        const A = masks[ELS[i]], B = masks[ELS[j]]; if (!A || !B) continue;
        let I = 0, U = 0; for (let k = 0; k < A.length; k++) { const x = A[k], y = B[k]; if (x && y) I++; if (x || y) U++; }
        const iou = U ? I / U : 0; if (iou > worst) { worst = iou; pair = ELS[i] + '/' + ELS[j]; }
      }
      if (worst >= 0.5) iouFails.push(`${name}: ${pair} ${worst.toFixed(2)}`);
      PT.note(`ML1.f ${name}: max element IoU ${worst.toFixed(2)} (${pair})`);
      if (sheets && frames.length) await PT.sheet(pg, frames, path.join(root, 'tools/playtest4/sheets/melee', 'arch_' + name + '.png'), { cols: 3, cellW: 256, cellH: 144, title: `melee archetype ${name} × 9 elements (impact frame)` });
    }
    PT.check(`ML1.f element silhouettes: pairwise impact-frame IoU < 0.5 for ${runSet.length} melee forms`, iouFails.length === 0, iouFails);
  }

  const errs = pg.errors();
  PT.check('ML page: no uncaught errors', errs.length === 0, errs.slice(0, 8));
  await pg.close();

  // ================================================================== --full: the bespoke set as 성기사 (hammer) and 암살자 (daggers)
  if (full && (part === 'all' || part === 'measure')) {
    for (const cls of ['paladin', 'shadowblade']) {
      const p2 = await PT.boot(`&cls=${cls}&level=30&skills=preset:endgame_${cls}`, { w: 640, h: 360 });
      if (!p2.ready) { PT.check(`ML ${cls} boot`, false); continue; }
      await p2.eval(installML); await p2.eval(() => window.ML.setup());
      const bad = [];
      for (const id of BESPOKE) {
        const tier = reg.tier[id] || 'A';
        const r = await p2.eval(({ id, win, every }) => window.ML.measure(id, { win, every }), { id, win: WINDOW[tier], every: EVERY });
        r.tier = tier; r.el = reg.el[id] || 'physical';
        const f = []; judge(r, f); if (f.length) bad.push(...f);
      }
      PT.check(`ML1.c (${cls}) bespoke set within ceilings / floors`, bad.length === 0, bad.slice(0, 20));
      const e2 = p2.errors(); PT.check(`ML ${cls} page: no uncaught errors`, e2.length === 0, e2.slice(0, 6));
      await p2.close();
    }
  }
  PT.skip('ML1 telegraph retention ≥ 95 % (R-sword)', 'verified at integration (I) with the real tells and both families');
  PT.note(`melee section ${((Date.now() - t0) / 1000).toFixed(0)} s`);
};

function judge(r, fails) {
  const T = TIER[r.tier] || TIER.A, why = [];
  if (r.tier === 'U' || r.tier === 'F') { if (r.white > T.whitePeak) why.push('white ' + r.white); if ((r.tier === 'U' ? r.whiteOver5 : r.whiteOver6) > 0.15 + 1e-6) why.push('white>' + (r.tier === 'U' ? 5 : 6) + '% for ' + r.whiteOver5 + ' s'); }
  else if (r.white > T.white) why.push('white ' + r.white);
  if (r.rise > T.luma) why.push('luma +' + r.rise);
  if (r.cov > T.cov) why.push('cov ' + r.cov);
  if (r.sat < T.sat && !SAT_EXEMPT.has(r.el)) why.push('sat ' + r.sat);
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
