// playtest4 section: mobmodels (PLAN v4 §7.8 MM1, MM2). Owned by mobmodels.
//   MM1 (B): model contract for every type (incl. wrapLegacy); build once per type (spawn ≤ 1 ms, first sight ≤ 8 ms, shared geometry);
//            tri budgets; ≤ 3 draws (LOD ≤ 2 beyond the LOD distance); shadow via LOD ≤ 2k; aggregate 12-mob budget (≤ 140k + 24k shadow, ≤ 36 + 12 calls).
//   MM2 (B + review): features checklist; eye group ≥ 6 px at 8 m (1280×720); outline visible on 4 sides on the Elderwood floor;
//            wolf / voidknight / wraith body luma ≥ 0.18 linear (every body ≥ 0.12); turntable sheets (--sheets) → tools/playtest4/sheets/mobs/<type>.png.
// Branch-side: the mobs behaviour files may still build v3 models, so MM1/MM2 instantiate the registry directly in the booted page
// (S-plains / S-elderwood with the game's own enemies cleared); at integration the same numbers apply to the real F-* roster (C6).
const path = require('path');

const TYPES = ['bokoblin', 'shaman', 'chuchu', 'lizard', 'shroom', 'wolf', 'wraith', 'voidknight', 'dummy'];
const CHU = ['normal', 'fire', 'ice', 'lightning', 'wind', 'water', 'nature', 'light', 'shadow'];
/** Body (+ glow) triangle budgets per species (§4.1–4.8; regular mob ≤ 9k). */
const BUDGET = { bokoblin: 8000, shaman: 7000, chuchu: 4000, lizard: 8500, shroom: 7000, wolf: 8000, wraith: 6000, voidknight: 9000, dummy: 9000 };
const PROXY = { bokoblin: 2500 };
/** Per-species feature items of the §4 Model lines (model.features keys). */
const SPECIES = {
  bokoblin: ['horns', 'tusks', 'club', 'necklace', 'warPaint'], shaman: ['robeLathe', 'hood', 'featherCrest', 'gemRing', 'glyphTrim'],
  chuchu: ['innerCore', 'mouthStates', 'crown'], lizard: ['digitigrade', 'tailBones', 'frillFlare', 'slitPupils', 'teeth', 'shellPauldron'],
  shroom: ['gills', 'pores', 'rootToes', 'moss', 'sleepyLids'], wolf: ['furTufts', 'fangs', 'glowEyes', 'voidCracks'],
  wraith: ['chain', 'hemStrips', 'boneMask'], voidknight: ['pauldronPlates', 'rivets', 'tabardSpring', 'runeSlots', 'visorGlow'], dummy: [],
};
/** Every build key (type + variants) → createModel opts. */
const KEYS = [...TYPES.filter((t) => t !== 'chuchu' && t !== 'shaman' && t !== 'wolf').map((t) => [t, t, {}]),
  ['shaman:fire', 'shaman', { element: 'fire' }], ['shaman:ice', 'shaman', { element: 'ice' }], ['wolf', 'wolf', {}], ['wolf:alpha', 'wolf', { variant: 'alpha' }],
  ...CHU.map((v) => ['chuchu:' + v, 'chuchu', { variant: v }])].filter((k, i, a) => a.findIndex((x) => x[0] === k[0]) === i);
/** F-* roster (PLAN §1.1). */
const ROSTER = [['bokoblin', {}], ['bokoblin', {}], ['wolf', {}], ['wolf', {}], ['lizard', {}], ['shaman', { element: 'fire' }], ['voidknight', {}], ['shroom', {}], ['wraith', {}],
  ['chuchu', { variant: 'normal' }], ['chuchu', { variant: 'fire' }], ['chuchu', { variant: 'ice' }]];

/** In-page helpers installed once per page (window.MMT). */
function installMMT() {
  if (window.MMT) return true;
  const g = window.game, T = g.THREE;
  const MMT = window.MMT = {};
  MMT.camPose = () => { g.renderNow(); const c = g.camera; const f = new T.Vector3(); c.getWorldDirection(f); f.y = 0; f.normalize(); return { p: c.position.clone(), f }; };
  /** Place a model root on the ground d metres in front of the camera (lateral offset), facing the camera. */
  MMT.place = (m, d, lat = 0) => {
    const { p, f } = MMT.camPose();
    const x = p.x + f.x * d - f.z * lat, z = p.z + f.z * d + f.x * lat;
    const W = g.world, y = W.getGroundHeight ? W.getGroundHeight(x, z) : W.getHeight(x, z);
    m.root.position.set(x, y + (m.type === 'wraith' ? 0.35 : 0), z); m.root.rotation.y = Math.atan2(-f.x, -f.z);
    if (!m.root.parent) g.scene.add(m.root);
    m.root.updateMatrixWorld(true);
    return m;
  };
  MMT.measure = (fn) => window.PT.measure(fn || null, { groups: false });
  MMT.diffDraws = (a, b) => ({ calls: b.calls - a.calls, tris: b.tris - a.tris, shadowCalls: b.shadowCalls - a.shadowCalls, shadowTris: b.shadowTris - a.shadowTris });
  MMT.lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return true;
}

module.exports = async function mobmodels(PT) {
  // ------------------------------------------------------------------ static: PLAN §7.2 rule 5 (no 0xffffff effect colours, emissive ≤ 1.2) + rule 1 imports
  {
    const fs = require('fs'), root = path.resolve(__dirname, '..', '..'), dir = path.join(root, 'src/enemies/mobs');
    const bad5 = [], bad1 = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((l, i) => {
        if (/0x[fF]{6}\b|#[fF]{6}\b/.test(l)) bad5.push(`${f}:${i + 1}`);
        const m = /emissiveIntensity:\s*([\d.]+)/.exec(l); if (m && +m[1] > 1.2) bad5.push(`${f}:${i + 1} emissive ${m[1]}`);
        const k = /glowK:\s*([\d.]+)/.exec(l); if (k && +k[1] > 1.2) bad5.push(`${f}:${i + 1} glowK ${k[1]}`);
        const im = /^\s*import\s.*from\s+'([^']+)'/.exec(l);
        if (im && !(im[1] === 'three' || im[1].startsWith('three/addons/') || im[1].startsWith('./') || /^\.\.\/(common|models|models2)\.js$/.test(im[1]) || im[1].startsWith('../../core/'))) bad1.push(`${f}:${i + 1} ${im[1]}`);
      });
    }
    PT.check('rule 5: no 0xffffff colours and no emissive/glow multiplier > 1.2 in src/enemies/mobs/*', bad5.length === 0, bad5);
    PT.check('rule 1: mobs/* import only own files, ../common.js, src/core/* and three', bad1.length === 0, bad1);
  }
  // ================================================================== page 1: S-plains (contract, build cost, draws, budgets, features, eyes)
  const pg = await PT.bootScene('S-plains', { w: 640, h: 360 });
  PT.check('boot: game.ready', pg.ready, pg.params);
  if (!pg.ready) { await pg.close(); return; }
  await pg.eval(installMMT);

  // ------------------------------------------------------------------ MM1: registry + wrapLegacy + v4 contract
  const c1 = await pg.run('MM1 contract', async ({ TYPES }) => {
    const MM = await import('/src/enemies/mobs/index.js');
    const g = window.game, T = g.THREE;
    PT.check('registry exports createModel/wrapLegacy/preview/prewarm/TYPES', ['createModel', 'wrapLegacy', 'preview', 'prewarm'].every((k) => typeof MM[k] === 'function') && Array.isArray(MM.TYPES));
    const mats = MM.prewarm(g);
    PT.check('prewarm(game) returns every material (body, shell, glow, outline)', Array.isArray(mats) && mats.length >= 4 && mats.every((m) => m && m.isMaterial), mats.map((m) => m?.name || m?.type));
    const contract = (m, legacy) => {
      const bad = [];
      if (!m || !m.root?.isObject3D) return ['root'];
      if (!Array.isArray(m.meshes) || !m.meshes.length || !m.meshes.every((x) => x.isSkinnedMesh || x.isMesh)) bad.push('meshes');
      if (!legacy && !(m.proxy && m.proxy.isSkinnedMesh)) bad.push('proxy');
      if (!(m.lod && (m.lod.isSkinnedMesh || m.lod.isMesh))) bad.push('lod');
      for (const k of ['root', 'spine', 'head']) if (!m.bones?.[k]?.isObject3D) bad.push('bones.' + k);
      const f = m.features || {};
      for (const k of ['face', 'hands', 'springs', 'aoVertexColors', 'lod']) if (!(k in f)) bad.push('features.' + k);
      for (const k of ['head', 'core']) if (!m.tellAnchors?.[k]?.isObject3D) bad.push('tellAnchors.' + k);
      if (!m.flashUniform || typeof m.flashUniform.value !== 'number') bad.push('flashUniform');
      const rs = m.rimSource?.();
      if (!Array.isArray(rs) || rs.length < 1 || rs.length > 2 || !rs.every((x) => x.isSkinnedMesh || x.isMesh)) bad.push('rimSource');
      for (const k of ['pose', 'update', 'dispose']) if (typeof m[k] !== 'function') bad.push(k);
      try { for (const n of ['idle', 'walk', 'windup', 'hold', 'strike', 'recover', 'stagger', 'die']) m.pose(n, 0.5); m.pose('idle', 0); m.update(1 / 60); } catch (e) { bad.push('pose/update threw ' + e.message); }
      if (!m.headTop || !m.rig) bad.push('v3 fields (headTop, rig)');
      return bad;
    };
    for (const t of TYPES) {
      const v3 = MM.legacyModel(t, t === 'chuchu' ? { variant: 'fire' } : {});
      const w = MM.wrapLegacy(v3);
      const bad = contract(w, true);
      PT.check(`wrapLegacy(${t}) fills the contract (v3 object kept)`, bad.length === 0 && w === v3 && w.features.legacy === true, bad);
      w.flashUniform.value = 0.8;
      let lit = false; w.root.traverse((o) => { if (o.isMesh && o.name !== 'outline' && o.material?.emissive && o.material.emissive.r > 0.5) lit = true; });
      w.flashUniform.value = 0;
      PT.check(`wrapLegacy(${t}) flashUniform drives a flash`, lit);
    }
    const out = {};
    for (const t of TYPES) {
      const m = MM.createModel(t, { game: g });
      const bad = m ? contract(m, false) : ['createModel returned null'];
      PT.check(`createModel(${t}) fills the §4.0 contract`, bad.length === 0, bad);
      out[t] = !!m;
      if (m) {
        // v3 pivot names kept for the v3 pose code (applyHumanoid / reactionPose / per-type fields)
        const need = { bokoblin: ['weapon'], shaman: ['staff', 'gem', 'halo'], chuchu: ['core', 'eyes', 'variant'], lizard: ['tail1', 'tail2', 'weapon'], shroom: ['sac', 'cap'],
          wolf: ['legs', 'jaw', 'neck', 'tail1', 'tail2'], wraith: ['orb'], voidknight: ['weapon', 'shield'], dummy: [] }[t] || [];
        const hum = ['bokoblin', 'shaman', 'lizard', 'shroom', 'wraith', 'voidknight'].includes(t) ? ['spine', 'neck', 'armR', 'armL', 'foreR', 'foreL', 'handR', 'handL', 'legR', 'legL', 'kneeR', 'kneeL'] : [];
        const miss = need.concat(hum).filter((k) => !m[k]);
        PT.check(`createModel(${t}) keeps the v3 field names`, miss.length === 0, miss);
        m.dispose();
      }
    }
    PT.check('wrapLegacy(v4 model) returns it unchanged', (() => { const m = MM.createModel('bokoblin'); const ok = MM.wrapLegacy(m) === m; m.dispose(); return ok; })());
    return out;
  }, { TYPES });

  // ------------------------------------------------------------------ MM1: first sight (before any instance of a type is drawn), build cost, spawn
  const cost = await pg.run('MM1 build/spawn/first sight', async ({ KEYS }) => {
    const MM = await import('/src/enemies/mobs/index.js');
    const g = window.game;
    PT.clearEnemies(false);
    g.player.object.visible = false;
    // the materials' skinned programs are compiled by prewarm (warm object drawn once)
    MM.prewarm(g); g.render.flushWarm?.(64);
    // core P0b's warm = compile + one real draw per material (SwiftShader JITs shaders at first draw): emulate it with the warm object in view
    const warmObj = MM.warmObject();
    { const { p, f } = window.MMT.camPose(); g.scene.add(warmObj); warmObj.position.set(p.x + f.x * 4, p.y - 1, p.z + f.z * 4); warmObj.updateMatrixWorld(true); g.renderNow(); g.renderNow(); g.scene.remove(warmObj); warmObj.position.set(0, -500, 0); }
    g.renderNow(); g.renderNow();
    const st = MM.buildAll();
    const res = {};
    const base = []; for (let i = 0; i < 5; i++) { const t0 = performance.now(); g.renderNow(); base.push(performance.now() - t0); }
    base.sort((a, b) => a - b); const baseMs = base[2];
    const Rig = await import('/src/enemies/mobs/rig.js');
    for (const [key, type, opts] of KEYS) {
      // first sight = create + game.render.warm + geometry upload + first draw of a type never drawn before, minus the same frame once warm.
      // 5 genuine first sights per type (fresh re-keyed builds of the same definition); best and median reported (the machine is shared; samples spike).
      const trials = [];
      for (let tr = 0; tr < 5; tr++) {
        const def = MM.defFor(type, opts); def.key = (def.key || def.type) + '#fs' + tr;
        const TT = Rig.defineType(def);
        window.PT.gpuSync();       // empty the GPU command queue first: we time CPU-side work, not SwiftShader rasterising earlier frames
        const t0 = performance.now();
        const fm = Rig.instantiate(TT, { game: g });
        window.MMT.place(fm, 7);
        g.render.warm(fm.root, { now: true });
        fm.update(1 / 60);
        g.renderNow();
        const first0 = performance.now() - t0;
        const again = []; for (let i = 0; i < 3; i++) { window.PT.gpuSync(); const a = performance.now(); g.renderNow(); again.push(performance.now() - a); }
        again.sort((a, b) => a - b);
        trials.push(first0 - again[1]);
        fm.dispose(); TT.geo.dispose(); TT.proxyGeo.dispose(); TT.glowGeo?.dispose(); Rig.builtTypes().delete(TT.key);
      }
      trials.sort((a, b) => a - b);
      const first = trials[0], firstMed = trials[2];   // best of 5 (the 4-CPU machine is shared: stalls of 0.3–4 s from other processes were seen)
      const m = MM.createModel(type, { ...opts, game: g });
      // spawn cost: 20 more instances (shared geometry, cloned skeleton only)
      const sp = [];
      const insts = [];
      for (let i = 0; i < 20; i++) { const a = performance.now(); insts.push(MM.createModel(type, { ...opts, game: g })); sp.push(performance.now() - a); }
      sp.sort((a, b) => a - b);
      const shared = insts[0].body.geometry === insts[1].body.geometry && insts[0].proxy.geometry === insts[1].proxy.geometry && insts[0].skeleton !== insts[1].skeleton &&
        insts[0].body.material === insts[1].body.material && (!insts[0].glow || insts[0].glow.geometry === insts[1].glow.geometry);
      for (const x of insts) x.dispose();
      m.dispose();
      res[key] = { firstMs: +first.toFixed(2), firstMed: +firstMed.toFixed(2), spawnMed: +sp[10].toFixed(3), spawnMax: +sp[19].toFixed(3), shared, buildMs: st[key]?.buildMs, kb: st[key]?.kb, tris: st[key]?.tris };
    }
    g.player.object.visible = true;
    return { res, baseMs };
  }, { KEYS });
  if (cost) {
    const R = cost.res, keys = Object.keys(R);
    const worstFirst = Math.max(...keys.map((k) => R[k].firstMs)), worstSpawn = Math.max(...keys.map((k) => R[k].spawnMed));
    PT.check('build once per type: instances share BufferGeometry + materials, clone only the skeleton', keys.every((k) => R[k].shared), keys.filter((k) => !R[k].shared));
    PT.check(`spawn ≤ 1 ms per mob (median of 20 per type; worst ${worstSpawn.toFixed(3)} ms)`, worstSpawn <= 1.0, Object.fromEntries(keys.map((k) => [k, R[k].spawnMed])));
    PT.check(`first sight ≤ 8 ms incl. game.render.warm (worst ${worstFirst.toFixed(2)} ms over a ${cost.baseMs.toFixed(1)} ms frame)`, worstFirst <= 8, Object.fromEntries(keys.map((k) => [k, R[k].firstMs])));
    PT.note('first sight median of 5 (ms): ' + keys.map((k) => `${k} ${R[k].firstMed}`).join(', '));
    PT.note('build ms / KB per type: ' + keys.map((k) => `${k} ${R[k].buildMs}ms ${R[k].kb}KB`).join(', '));
    // ---------------------------------------------------------------- tri budgets
    for (const k of keys) {
      const t = R[k].tris, type = k.split(':')[0];
      const body = t.body + t.glow, bud = BUDGET[type] ?? 9000, pb = PROXY[type] ?? 3000;
      PT.check(`tri budgets ${k}: body+glow ${body} ≤ ${bud}, proxy ${t.proxy} ≤ ${pb}, LOD ${t.lod} ≤ 3200, shadow ${t.shadow} ≤ 2000`,
        body <= bud && body <= 9000 && t.proxy <= pb && t.lod <= 3200 && t.shadow <= 2000, t);
    }
  }

  // ------------------------------------------------------------------ MM1: draws per mob (near ≤ 3, far LOD ≤ 2 no outline), shadow via LOD
  const dr = await pg.run('MM1 draws', async ({ KEYS }) => {
    const MM = await import('/src/enemies/mobs/index.js');
    const g = window.game, MMT = window.MMT;
    g.player.object.visible = false;
    const base = MMT.measure();
    const out = {};
    for (const [key, type, opts] of KEYS) {
      const m = MM.createModel(type, { ...opts, game: g });
      MMT.place(m, 8); m.update(1 / 60);
      const near = MMT.diffDraws(base, MMT.measure());
      const rimNear = m.rimSource()[0] === m.proxy;
      MMT.place(m, 34); m.update(1 / 60);
      const far = MMT.diffDraws(base, MMT.measure());
      const rimFar = m.rimSource()[0] === m.lod && m.lodActive && !m.proxy.visible;
      m.dispose();
      out[key] = { near, far, rimNear, rimFar };
    }
    g.player.object.visible = true;
    return out;
  }, { KEYS });
  if (dr) {
    const keys = Object.keys(dr);
    PT.check('≤ 3 scene draws per mob at 8 m (body, glow, outline proxy)', keys.every((k) => dr[k].near.calls <= 3 && dr[k].near.calls >= 1), Object.fromEntries(keys.map((k) => [k, dr[k].near.calls])));
    PT.check('≤ 2 scene draws per mob beyond the LOD distance (34 m), outline hidden, rimSource → LOD', keys.every((k) => dr[k].far.calls <= 2 && dr[k].rimFar), Object.fromEntries(keys.map((k) => [k, dr[k].far.calls])));
    PT.check('rimSource() near = the outline proxy (≤ 2 meshes)', keys.every((k) => dr[k].rimNear));
    PT.check('shadow: 1 caster draw per mob = the LOD range (≤ 2k tris)', keys.every((k) => dr[k].near.shadowCalls <= 1 && dr[k].near.shadowTris <= 2000), Object.fromEntries(keys.map((k) => [k, [dr[k].near.shadowCalls, dr[k].near.shadowTris]])));
    PT.note('near draws/tris/shadow: ' + keys.map((k) => `${k} ${dr[k].near.calls}c/${dr[k].near.tris}t/${dr[k].near.shadowTris}st`).join(', '));
  }

  // ------------------------------------------------------------------ MM1: aggregate 12-mob F-* roster
  const agg = await pg.run('MM1 aggregate', async ({ ROSTER }) => {
    const MM = await import('/src/enemies/mobs/index.js');
    const g = window.game, MMT = window.MMT, T = g.THREE;
    g.player.object.visible = false;
    window.PT.look(0, -0.22); window.PT.step(0.05);
    const base = MMT.measure();
    const pp = g.player.object.position, list = [];
    ROSTER.forEach(([t, o], i) => {
      const a = (i / ROSTER.length) * Math.PI * 1.2 - Math.PI * 0.6, r = 6 + (i % 4) * 2;
      const m = MM.createModel(t, { ...o, game: g });
      const x = pp.x + Math.sin(a) * r, z = pp.z - Math.cos(a) * r;
      m.root.position.set(x, window.PT.groundHeight(x, z) + (t === 'wraith' ? 0.35 : 0), z); m.root.rotation.y = Math.atan2(pp.x - x, pp.z - z);
      g.scene.add(m.root); m.root.updateMatrixWorld(true); list.push(m);
    });
    for (const m of list) { m.pose('idle', 0.3); m.update(1 / 60); }
    const d = MMT.diffDraws(base, MMT.measure());
    // all 12 posed through a windup + springs for 1 s: still within budget, update() cost
    let upd = 0;
    for (let f = 0; f < 60; f++) { const t0 = performance.now(); for (const m of list) { m.pose('windup', f / 60); m.update(1 / 60); } upd += performance.now() - t0; }
    const d2 = MMT.diffDraws(base, MMT.measure());
    for (const m of list) m.dispose();
    g.player.object.visible = true;
    return { d, d2, updMsPerFrame: +(upd / 60).toFixed(3) };
  }, { ROSTER });
  if (agg) {
    const { d, d2 } = agg;
    PT.check(`aggregate 12-mob roster: scene ${d.calls} ≤ 36 calls, ${d.tris} ≤ 140k tris; shadow ${d.shadowCalls} ≤ 12 calls, ${d.shadowTris} ≤ 24k tris`,
      d.calls <= 36 && d.tris <= 140000 && d.shadowCalls <= 12 && d.shadowTris <= 24000, d);
    PT.check('aggregate holds while posed (windup + springs)', d2.calls <= 36 && d2.tris <= 140000 && d2.shadowCalls <= 12 && d2.shadowTris <= 24000, d2);
    PT.note(`12-mob pose+update CPU: ${agg.updMsPerFrame} ms/frame`);
  }

  // ------------------------------------------------------------------ MM2: features checklist, blink, eye group ≥ 6 px at 8 m on 1280×720
  const f2 = await pg.run('MM2 features', async ({ KEYS, SPECIES }) => {
    const MM = await import('/src/enemies/mobs/index.js');
    const Rig = await import('/src/enemies/mobs/rig.js');
    const g = window.game;
    const fov = g.camera.fov * Math.PI / 180, pxPerM = 720 / (2 * 8 * Math.tan(fov / 2));
    const out = {};
    for (const [key, type, opts] of KEYS) {
      const m = MM.createModel(type, { ...opts, game: g });
      const f = m.features, bad = [];
      if (f.face !== true) bad.push('face'); if (f.hands !== true) bad.push('hands'); if (!(f.springs >= 2)) bad.push('springs ' + f.springs);
      if (f.aoVertexColors !== true) bad.push('ao'); if (f.lod !== true) bad.push('lod');
      for (const k of SPECIES[type] || []) if (!f[k]) bad.push(k);
      const A = m.bones.all;
      if (['bokoblin', 'shaman', 'lizard', 'shroom', 'wraith'].includes(type) && !A.jaw) bad.push('jaw bone');
      if (['bokoblin', 'shaman', 'lizard', 'shroom', 'wraith', 'voidknight'].includes(type) && !(A.thumbR && A.fingersR && A.thumbL && A.fingersL)) bad.push('thumb/fingers bones');
      // blink: lids (or the chuchu blink bone) close at least once in 7 s of update()
      let closed = false;
      const lid = A.lidL || A.blink;
      if (lid) {
        g.frame && (g.frame.lastStep = true);
        for (let i = 0; i < 7 * 30; i++) { m.update(1 / 30); const y = lid.scale.y; if ((A.lidL && y > 0.9) || (!A.lidL && y < 0.3)) closed = true; }
        if (!closed) bad.push('blink');
      }
      // springs move under motion
      const s0 = m._springs.map((s) => s.b.rotation[s.axis]);
      for (let i = 0; i < 20; i++) { m.root.position.x += 0.1; m.root.position.z += 0.1; m.root.updateMatrixWorld(true); m.update(1 / 60); }
      const moved = m._springs.filter((s, i) => Math.abs(s.b.rotation[s.axis] - s0[i]) > 0.01).length;
      if (moved < 2) bad.push('springs move ' + moved);
      const T2 = Rig.builtTypes().get(m.key);
      const eyePx = T2.eyes.n ? (T2.eyes.maxX - T2.eyes.minX) * pxPerM : 0;
      out[key] = { bad, eyePx: +eyePx.toFixed(1) };
      m.dispose();
    }
    return { out, fovDeg: g.camera.fov };
  }, { KEYS, SPECIES });
  if (f2) {
    const keys = Object.keys(f2.out);
    for (const k of keys) PT.check(`features checklist ${k} (face, hands, ≥ 2 springs, AO, LOD, blink, §4 items)`, f2.out[k].bad.length === 0, f2.out[k].bad);
    PT.check(`eye group ≥ 6 px wide at 8 m on 1280×720 (camera fov ${f2.fovDeg}°)`, keys.every((k) => f2.out[k].eyePx >= 6), Object.fromEntries(keys.map((k) => [k, f2.out[k].eyePx])));
  }
  PT.check('no page errors (S-plains)', pg.errors().length === 0, pg.errors().slice(0, 5));

  // ------------------------------------------------------------------ MM2 --sheets: turntables (v3 row above), 3 m and 8 m, front / ¾ / side, idle + windup
  if (PT.flags.sheets) {
    const dir = path.join(__dirname, 'sheets', 'mobs');
    const sheetKeys = TYPES.map((t) => [t, t === 'shaman' ? { element: 'fire' } : t === 'chuchu' ? { variant: 'fire' } : {}]).concat([['wolf', { variant: 'alpha' }, 'wolf_alpha']]);
    for (const [type, opts, name] of sheetKeys) {
      const frames = await pg.eval(async ({ type, opts }) => {
        const MM = await import('/src/enemies/mobs/index.js');
        const g = window.game;
        const views = [[0, 3, 'idle', 'front 3 m'], [0.75, 3, 'idle', '¾ 3 m'], [Math.PI / 2, 3, 'idle', 'side 3 m'], [0.75, 3, 'windup', '¾ windup 3 m'], [0, 8, 'idle', 'front 8 m'], [0.75, 8, 'windup', '¾ windup 8 m']];
        const v3 = MM.wrapLegacy(MM.legacyModel(type, { ...opts, element: opts.element }));
        const v4 = MM.createModel(type, { ...opts, game: g });
        const out = [];
        for (const [M, tag] of [[v3, 'v3'], [v4, 'v4']]) for (const [yaw, dist, pose, label] of views) {
          M.pose(pose, pose === 'idle' ? 0.3 : 1); M.setLod?.(false); if (M.proxy) M.proxy.visible = true;
          const h = (M.headTop || 1.8) * 1.12, d = Math.max(dist, h / (2 * Math.tan(15 * Math.PI / 180)));
          out.push({ url: await g.render.snapshot(M.root, { w: 200, h: 250, yaw, pitch: 0.12, dist: d }), label: `${tag} ${label}${d > dist + 0.05 ? ' (' + d.toFixed(1) + ' m)' : ''}` });
        }
        v4.dispose();
        return out;
      }, { type, opts });
      const file = path.join(dir, (name || type) + '.png');
      const r = await PT.sheet(pg, frames, file, { cols: 6, cellW: 200, cellH: 250, title: `${name || type}: v3 (top) vs v4 (bottom)` });
      PT.check(`sheet ${path.basename(file)} written ≤ 150 KB`, r.kb <= 150, r);
    }
    // chuchu variants: all 9 silhouettes, front + ¾ + windup
    const vf = await pg.eval(async ({ CHU }) => {
      const MM = await import('/src/enemies/mobs/index.js');
      const g = window.game, out = [];
      for (const v of CHU) {
        const m = MM.createModel('chuchu', { variant: v, game: g }); m.setLod(false);
        m.pose('idle', 0.3); out.push({ url: await g.render.snapshot(m.root, { w: 160, h: 140, yaw: 0.5, pitch: 0.2, dist: 3 }), label: v });
        m.pose('windup', 1); out.push({ url: await g.render.snapshot(m.root, { w: 160, h: 140, yaw: 0.5, pitch: 0.2, dist: 3 }), label: v + ' windup' });
        m.dispose();
      }
      return out;
    }, { CHU });
    const r2 = await PT.sheet(pg, vf, path.join(dir, 'chuchu_variants.png'), { cols: 6, cellW: 160, cellH: 140, title: 'chuchu: 9 variants (idle / windup)' });
    PT.check('sheet chuchu_variants.png written ≤ 150 KB', r2.kb <= 150, r2);
  } else PT.skip('MM2 turntable sheets', 'run with --sheets');
  await pg.close();

  // ================================================================== page 2: S-elderwood floor (outline 4 sides, body luma)
  const pe = await PT.bootScene('S-elderwood', { w: 640, h: 360 });
  PT.check('boot S-elderwood', pe.ready, pe.params);
  if (pe.ready) {
    await pe.eval(installMMT);
    const lu = await pe.run('MM2 Elderwood', async ({ KEYS }) => {
      const MM = await import('/src/enemies/mobs/index.js');
      const g = window.game, MMT = window.MMT, P = window.PT.pixels;
      PT.clearEnemies(false);
      g.player.object.visible = false;
      // grass blades hide the feet (a world/density matter, not the outline): hide them for the 4-side test
      if (g.world.debug?.setGrassVisible) g.world.debug.setGrassVisible(false); else g.scene.traverse((o) => { if (/^grass_/.test(o.name)) o.visible = false; });
      // look down so the floor (not the tree trunks / sky) is behind the whole silhouette: "on the Elderwood floor"
      window.PT.look(0, -0.4); window.PT.step(0.05);
      MM.prewarm(g); g.render.flushWarm?.(64);
      const out = {};
      for (const [key, type, opts] of KEYS) {
        const m = MM.createModel(type, { ...opts, game: g });
        MMT.place(m, 5.5); m.pose('idle', 0.3); m.update(1 / 60); m.setLod(false); m.proxy.visible = true;
        // silhouette of the lit body only: no cast shadow (it would count as model pixels), glow parts are deliberately not outlined
        m.body.castShadow = false; if (m.glow) m.glow.visible = false;
        const A = P.render();
        m.proxy.visible = false; const B = P.render();
        m.root.visible = false; const C = P.render(); m.root.visible = true; m.proxy.visible = true;
        const w = A.w, h = A.h, n = w * h;
        const M = new Uint8Array(n), O = new Uint8Array(n);
        let x0 = w, x1 = -1, y0 = h, y1 = -1;
        for (let k = 0, i = 0; k < n; k++, i += 4) {
          const dAC = Math.abs(A.px[i] - C.px[i]) + Math.abs(A.px[i + 1] - C.px[i + 1]) + Math.abs(A.px[i + 2] - C.px[i + 2]);
          const dAB = Math.abs(A.px[i] - B.px[i]) + Math.abs(A.px[i + 1] - B.px[i + 1]) + Math.abs(A.px[i + 2] - B.px[i + 2]);
          if (dAC > 12) { M[k] = 1; const x = k % w, y = (k / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          if (dAB > 20) O[k] = 1;
        }
        // outline on 4 sides: share of silhouette rows/columns whose extreme model pixel has an outline pixel within 3 px inward
        const side = (dir) => {
          let rows = 0, hit = 0;
          const outer = dir === 'L' || dir === 'R' ? [y0, y1] : [x0, x1];
          for (let a = outer[0]; a <= outer[1]; a++) {
            let e = -1;
            if (dir === 'L') { for (let x = x0; x <= x1; x++) if (M[a * w + x]) { e = x; break; } }
            else if (dir === 'R') { for (let x = x1; x >= x0; x--) if (M[a * w + x]) { e = x; break; } }
            else if (dir === 'B') { for (let y = y0; y <= y1; y++) if (M[y * w + a]) { e = y; break; } }   // readPixels rows run bottom-up
            else { for (let y = y1; y >= y0; y--) if (M[y * w + a]) { e = y; break; } }
            if (e < 0) continue;
            rows++;
            let ok = false;
            for (let s = 0; s <= 3 && !ok; s++) {
              const kk = dir === 'L' ? a * w + e + s : dir === 'R' ? a * w + e - s : dir === 'B' ? (e + s) * w + a : (e - s) * w + a;
              if (kk >= 0 && kk < n && O[kk]) ok = true;
            }
            if (ok) hit++;
          }
          return rows ? +(hit / rows).toFixed(2) : 0;
        };
        // body luma (linear) over model pixels not covered by the outline, from the proxy-hidden frame B
        let ls = 0, ln = 0;
        for (let k = 0, i = 0; k < n; k++, i += 4) {
          if (!M[k] || O[k]) continue;
          ls += 0.2126 * MMT.lin(B.px[i]) + 0.7152 * MMT.lin(B.px[i + 1]) + 0.0722 * MMT.lin(B.px[i + 2]); ln++;
        }
        out[key] = { sides: { L: side('L'), R: side('R'), T: side('T'), B: side('B') }, luma: ln ? +(ls / ln).toFixed(3) : 0, px: ln };
        m.dispose();
      }
      g.player.object.visible = true;
      return out;
    }, { KEYS });
    if (lu) {
      const keys = Object.keys(lu);
      for (const k of keys) {
        const s = lu[k].sides;
        PT.check(`outline visible on 4 sides on the Elderwood floor: ${k}`, s.L >= 0.5 && s.R >= 0.5 && s.T >= 0.5 && s.B >= 0.5, s);
      }
      // fix round 1 (docs/v4/review.md): the void species are dark again (v3 identity), so their body luma sits in a 0.06–0.16 band — read by the
      // 4-side outline above and the violet rune/crack/eye accents, not by a light albedo (the old ≥ 0.18 gate is what washed them out to grey).
      const VOID = ['wolf', 'wolf:alpha', 'voidknight', 'wraith'];
      for (const k of VOID) if (lu[k]) PT.check(`${k} body mean luma ${lu[k].luma} in 0.06..0.16 linear (dark void identity, not black; Elderwood)`, lu[k].luma >= 0.06 && lu[k].luma <= 0.16, lu[k]);
      PT.check('every other body mean luma ≥ 0.12 linear (Elderwood)', keys.filter((k) => !VOID.includes(k)).every((k) => lu[k].luma >= 0.12), Object.fromEntries(keys.map((k) => [k, lu[k].luma])));
    }
    PT.check('no page errors (S-elderwood)', pe.errors().length === 0, pe.errors().slice(0, 5));
  }
  await pe.close();
};
module.exports.TYPES = TYPES; module.exports.CHU = CHU; module.exports.BUDGET = BUDGET; module.exports.PROXY = PROXY;
