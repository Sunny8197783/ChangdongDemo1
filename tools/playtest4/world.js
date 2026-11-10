// playtest4 section: world (PLAN v4 §7.8 W1, B). Owned by world.
//   W1: terrain chunks (visible LOD0 chunk draws ≤ 24 and < total), the world rows of §1.2 per S-* scene (world-owned
//       share of scene + shadow draw calls, shadow tris), noTerrain ≥ 0.80 in S-elderwood (ABAB), 0 point lights at medium,
//       village-only / always-drawn meshes hidden outside the village, flora / grass distances per preset + governor budget,
//       uploads ≤ 60 KB per frame in S-* (camera turning), world transparents ≤ 0.5 screens, heightField = getHeight
//       within 0.05 m (GPU), beacon ≤ 2 calls and hidden within 15 m / on reach, static matrices, surface attack names.
//   Counts are 640×360, prod=1&governor=0&seed=1, medium (§1.0). World ownership = world.debug.owns(obj) (scene roots the
//   world module created); NPCs (ux) and training dummies (mobs) are reported separately.
const SCENES = ['S-plains', 'S-village', 'S-mirwen', 'S-elderwood'];
// world-owned budgets per scene: S-plains §1.2 world row; the other totals minus the player (8 + 4) and world-space UI (4)
const BUDGET = {
  'S-plains': { scene: 110, shadow: 14 },
  'S-village': { total: 175 - 12 - 4 },
  'S-mirwen': { total: 160 - 12 - 4 },
  'S-elderwood': { total: 160 - 12 - 4 },
};

module.exports = async function world(PT) {
  const t0 = Date.now();
  // ================================================================== per-scene counts (S-*)
  for (const id of SCENES) {
    const pg = await PT.bootScene(id, { w: 640, h: 360 });
    PT.check(`${id}: boot`, pg.ready, pg.params);
    if (!pg.ready) { await pg.close(); continue; }
    await pg.run(id, ({ id, B }) => {
      const g = window.game, PT = window.PT, W = g.world;
      const owns = W.debug?.owns;
      PT.check('world.debug API', !!(owns && W.debug.terrainChunks && W.debug.transparents && W.debug.setGrassVisible && W.heightField && W.setBeacon));
      if (!owns) return;
      // ---- draw calls per yaw: world-owned share (scene + shadow), others listed
      const recs = [];
      const oRBD = g.renderer.renderBufferDirect.bind(g.renderer);
      let pass = 'scene', cur = null;
      g.renderer.renderBufferDirect = function (c, s, geo, m, o, gr) {
        if (cur && owns(o)) { const n = geo.index ? geo.index.count : (geo.attributes.position?.count || 0); const dr = geo.drawRange.count === Infinity ? n : Math.min(n, geo.drawRange.count);
          const inst = o.isInstancedMesh ? o.count : 1; const tris = (o.isMesh ? dr / 3 : 0) * inst;
          if (pass === 'shadow') { cur.wShadow++; cur.wShadowTris += tris; } else if (pass === 'scene') { cur.wScene++; cur.wTris += tris; if (m.transparent) cur.wTransp++; } }
        return oRBD(c, s, geo, m, o, gr);
      };
      const sm = g.renderer.shadowMap, smo = sm.render.bind(sm);
      sm.render = (...a) => { const p = pass; pass = 'shadow'; try { return smo(...a); } finally { pass = p; } };
      try {
        for (let i = 0; i < 4; i++) {
          PT.look(i * Math.PI / 2, -0.15); PT.step(0.1);
          cur = { wScene: 0, wShadow: 0, wTris: 0, wShadowTris: 0, wTransp: 0 };
          const d = PT.draws();
          const tc = W.debug.terrainChunks();
          recs.push({ yaw: i * 90, ...cur, wTris: Math.round(cur.wTris), wShadowTris: Math.round(cur.wShadowTris), total: d.total, scene: d.calls, shadow: d.shadowCalls,
            tris: d.tris + d.shadowTris, chunks: tc.visible, chunksTotal: tc.total, farInView: tc.farInView, groups: Object.fromEntries(Object.entries(d.byGroup).map(([k, v]) => [k, `${v.calls}+${v.shadowCalls}`])) });
          cur = null;
        }
      } finally { g.renderer.renderBufferDirect = oRBD; sm.render = smo; }
      const mx = (k) => Math.max(...recs.map((r) => r[k]));
      PT.note(`${id} per yaw: ` + recs.map((r) => `${r.yaw}°: world ${r.wScene}+${r.wShadow} (${Math.round(r.wTris / 1000)}k+${Math.round(r.wShadowTris / 1000)}k tris), all ${r.scene}+${r.shadow}, chunks ${r.chunks}/${r.chunksTotal} (+${r.farInView} far)`).join(' | '));
      PT.note(`${id} groups (harness byGroup, NPCs/dummies count as 'world' there): ` + JSON.stringify(recs.map((r) => r.groups)));
      PT.check('terrain: LOD0 chunk draws ≤ 24 and < total at every yaw', recs.every((r) => r.chunks <= 24 && r.chunks < r.chunksTotal), recs.map((r) => r.chunks));
      if (B.scene) {
        PT.check(`world draw calls ≤ ${B.scene} scene + ${B.shadow} shadow (max yaw)`, mx('wScene') <= B.scene && mx('wShadow') <= B.shadow, { scene: mx('wScene'), shadow: mx('wShadow') });
        PT.check('world shadow pass ≤ 20k tris', mx('wShadowTris') <= 20000, mx('wShadowTris'));
      } else {
        PT.check(`world draw calls scene + shadow ≤ ${B.total} (scene total ${B.total + 16} − player 12 − ui 4)`, recs.every((r) => r.wScene + r.wShadow <= B.total), recs.map((r) => r.wScene + r.wShadow));
      }
      // ---- point lights (medium: none from the world; total reported)
      let wl = 0, al = 0; g.scene.traverse((o) => { if (o.isPointLight && o.visible) { al++; if (owns(o)) wl++; } });
      PT.check('0 world point lights at medium (game.render.pointLights false)', g.render?.pointLights === false && wl === 0, { world: wl, all: al });
      // ---- always-drawn world meshes anchored in the village while outside it
      const VM = { x: 0, z: 139, r: 70 };
      const cam = g.camera.position, outside = Math.hypot(cam.x - VM.x, cam.z - VM.z) > VM.r;
      const always = [];
      for (const r of W.debug.roots()) r.traverseVisible((o) => {
        if (!(o.isMesh || o.isPoints) || o.frustumCulled !== false || (o.isInstancedMesh && o.count === 0)) return;
        if (o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        const c = o.geometry?.boundingSphere?.center?.clone().applyMatrix4(o.matrixWorld);
        const vil = /village|worldTree|altar|chimney|pond|sign/i.test(o.name + ' ' + (o.parent?.name || '')) || (c && Math.hypot(c.x - VM.x, c.z - VM.z) < VM.r && (o.geometry.boundingSphere.radius < 60));
        if (vil) always.push(o.name || o.parent?.name || o.type);
      });
      if (outside) PT.check('0 always-drawn village meshes outside the village radius', always.length === 0, always);
      else PT.note(`inside the village: always-drawn village meshes ${always.length} (${always.join(', ')})`);
      return recs;
    }, { id, B: BUDGET[id] });

    // ---- uploads while the camera turns (60°/s, every frame rendered; world-owned attribute versions + total GL bytes)
    await pg.run(`${id} uploads`, () => {
      const g = window.game, PT = window.PT, W = g.world;
      PT.look(0, -0.15); PT.step(0.1);
      for (let i = 0; i < 4; i++) { PT.look(i * Math.PI / 2, -0.15); PT.draws(); }   // first-view geometry uploads happen once
      PT.look(0, -0.15); PT.step(0.2); PT.draws();
      const ver = new Map();
      const attrs = (o, fn) => { const G = o.geometry; if (G) { for (const k in G.attributes) fn(G.attributes[k]); if (G.index) fn(G.index); } if (o.instanceMatrix) fn(o.instanceMatrix); if (o.instanceColor) fn(o.instanceColor); };
      const scan = (count) => { let b = 0; for (const r of W.debug.roots()) r.traverse((o) => attrs(o, (a) => {
        const v = ver.get(a);
        if (count && v !== a.version) b += (a.updateRanges?.length ? a.updateRanges.reduce((s, q) => s + q.count, 0) : a.array.length) * a.array.BYTES_PER_ELEMENT;
        ver.set(a, a.version);
      })); return b; };
      scan(false);
      const world = [], total = [];
      for (let f = 0; f < 60; f++) {
        PT.look(f / 60 * (Math.PI / 3), -0.15);
        const d = PT.measure(() => g.step(1, 1 / 60, true));
        world.push(scan(true)); total.push(d.uploadBytes);
      }
      const mx = (a) => Math.max(...a), p95 = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)];
      PT.check('world uploads ≤ 60 KB every frame while turning', mx(world) <= 60 * 1024, { maxKB: +(mx(world) / 1024).toFixed(1), p95KB: +(p95(world) / 1024).toFixed(1) });
      PT.note(`total GL uploads (all owners) while turning: max ${(mx(total) / 1024).toFixed(1)} KB, p95 ${(p95(total) / 1024).toFixed(1)} KB, median ${(total.slice().sort((a, b) => a - b)[30] / 1024).toFixed(1)} KB`);
      PT.note(`flora: ${JSON.stringify(W.debug.flora())}`);
    });

    // ---- world transparents (fragment counting override, owner = world transparent materials)
    await pg.run(`${id} transparents`, () => {
      const g = window.game, PT = window.PT, W = g.world;
      const vals = [], scene = [];
      for (let i = 0; i < 4; i++) {
        PT.look(i * Math.PI / 2, -0.15); PT.step(0.1); g.renderNow();
        const f = PT.fragments({ owner: (o) => W.debug.owns(o) });
        vals.push(f.transparent); scene.push(f.scene);
      }
      PT.check('world transparents ≤ 0.5 screens (max over 4 yaws)', Math.max(...vals) <= 0.5, vals);
      PT.note(`world scene fragments ÷ screen per yaw: ${scene.join(', ')} (S-* scene budget 2.2 for every owner together)`);
      PT.note(`world transparent drawables this frame: ${W.debug.transparents()}`);
    });
    await pg.close();
  }

  // ================================================================== noTerrain ABAB (S-elderwood, 960×540)
  // v4 draws the sky LAST (only visible sky pixels shade; v3 shaded a full-screen sky first). Hiding the terrain therefore
  // makes the sky shade the pixels the terrain covered, which v3's ablation never paid. The terrain-share gate keeps the
  // terrain's depth in frame B (same meshes, a colorWrite:false material) so it measures what the row means — the terrain's
  // own fragment cost; the plain hide ratio and the trivial-material ratio are reported next to it.
  {
    const pg = await PT.bootScene('S-elderwood', { w: 960, h: 540 });
    if (pg.ready) {
      await pg.run('noTerrain', () => {
        const g = window.game, PT = window.PT, W = g.world, T = g.THREE;
        // §2.2 medium has 0 point lights; lights other owners still add on this branch (vfx P0) are hidden for the measurement
        let foreign = 0; g.scene.traverse((o) => { if (o.isPointLight && o.visible && !W.debug.owns(o)) { o.visible = false; foreign++; } });
        PT.clearEnemies(false);
        PT.look(0, -0.15); PT.step(0.1); g.renderNow(); g.renderNow();
        const terr = []; g.scene.traverse((o) => { if (o.isMesh && /^terrain/.test(o.name)) terr.push(o); });
        const vis = terr.map((o) => o.visible), mat0 = terr[0].material;
        const depthOnly = new T.MeshBasicMaterial({ colorWrite: false });
        const basic = new T.MeshBasicMaterial({ vertexColors: true });
        const setM = (m) => terr.forEach((o) => { o.material = m; });
        setM(depthOnly); g.renderNow(); setM(basic); g.renderNow(); setM(mat0); g.renderNow();
        const r = PT.gpuRatio(() => setM(depthOnly), () => setM(mat0), { pairs: 11, reps: 3 });
        const hide = PT.gpuRatio(() => terr.forEach((o) => (o.visible = false)), () => terr.forEach((o, i) => (o.visible = vis[i])), { pairs: 7, reps: 2 });
        const triv = PT.gpuRatio(() => setM(basic), () => setM(mat0), { pairs: 7, reps: 2 });
        setM(mat0); depthOnly.dispose(); basic.dispose();
        PT.check('noTerrain ≥ 0.80 in S-elderwood (terrain shading removed, depth kept; ABAB 11 pairs, median)', r.ratio >= 0.8, { ratio: r.ratio, pairs: r.pairs, foreignPointLightsHidden: foreign });
        PT.note(`plain hide (sky shades the hole, v4 sky-last order): ${hide.ratio} ${JSON.stringify(hide.pairs)}; MeshBasic vertex-colour terrain: ${triv.ratio}`);
      });
    } else PT.check('S-elderwood 960×540 boot', false);
    await pg.close();
  }

  // ================================================================== presets, budget, heightField, beacon, statics, names
  const pg = await PT.boot('&cls=mage&level=30&skills=preset:endgame_mage', { w: 640, h: 360 });
  PT.check('boot (plains page)', pg.ready);
  if (pg.ready) {
    await pg.run('presets', () => {
      const g = window.game, PT = window.PT, W = g.world, S = g.settings;
      PT.tp(-20, 45); PT.look(0, -0.15); PT.step(0.2);
      const want = { low: [120, 20, 0.25, 0.6, false, 1024], medium: [200, 35, 0.4, 0.7, false, 1024], high: [350, 55, 0.85, 1.0, true, 2048] };
      const got = {};
      for (const q of ['low', 'medium', 'high']) {
        S.applyPreset(q); g.quality?.set?.(0, 'test'); PT.step(0.1);
        const st = W.debug.flora();
        got[q] = [Math.round(st.maxD), Math.round(st.outD), +W.grass.density.toFixed(2), +W.grass.fadeMul.toFixed(2), W.grass.layers[0].mesh.receiveShadow, W.sun.shadow.mapSize.x];
      }
      PT.check('flora tree / outline distance, grass density / fade / receiveShadow, shadow map size per preset', JSON.stringify(got) === JSON.stringify(want), got);
      S.applyPreset('medium'); PT.step(0.1);
      const cam = W.sun.shadow.camera;
      PT.check('shadow extent ±32 m, casters within 60 m', cam.right === 32 && cam.top === 32 && W.sun.position.distanceTo(W.sun.target.position) <= 60.01, { r: cam.right, d: +W.sun.position.distanceTo(W.sun.target.position).toFixed(2) });
      if (g.quality?.set && g.quality.budget) {
        g.quality.set(4, 'test'); PT.step(0.1);
        const st = W.debug.flora();
        PT.check('governor L4 budget: flora ×0.6, outlines 20 m, grass ×0.5 (live)', Math.abs(st.maxD - 120) < 1 && st.outD === 20 && Math.abs(W.grass.density - 0.2) < 1e-6, { maxD: st.maxD, outD: st.outD, grass: W.grass.density });
        g.quality.set(0, 'test'); PT.step(0.1);
        PT.check('budget restores at L0', Math.abs(W.debug.flora().maxD - 200) < 1 && Math.abs(W.grass.density - 0.4) < 1e-6);
      } else PT.skip('governor budget', 'game.quality.budget missing');
      // flora re-cull cadence: a still camera never re-culls; turning re-culls at most every 4th frame
      PT.step(0.2); const c0 = W.debug.flora().culls; PT.step(0.5); const c1 = W.debug.flora().culls;
      for (let f = 0; f < 40; f++) { PT.look(f * 0.05, -0.15); g.step(1, 1 / 60, false); }
      const c2 = W.debug.flora().culls;
      PT.check('flora re-cull: none while still, ≤ every 4th frame while turning', c1 === c0 && c2 - c1 <= 10 && c2 - c1 >= 5, { still: c1 - c0, turning40: c2 - c1 });
      PT.check('grass receiveShadow off at medium', W.grass.layers.every((L) => L.mesh.receiveShadow === false));
      PT.check('terrain never casts shadows', (() => { let ok = true; W.terrainMesh.traverse((o) => { if (o.castShadow && o.name !== 'worldShadowHook') ok = false; }); return ok; })());
      // shadow-only casters (flora families, village proxy) reach the shadow pass through the hook, never the main pass
      {
        const R = g.renderer, o = R.renderBufferDirect.bind(R); let main = 0, shadow = 0; let inShadow = false;
        const sm = R.shadowMap, smo = sm.render.bind(sm);
        sm.render = (...a) => { inShadow = true; try { return smo(...a); } finally { inShadow = false; } };
        R.renderBufferDirect = function (c, sc, geo, m, ob, gr) { if (/^floraShadow_|villageShadowProxy/.test(ob.name)) { if (inShadow) shadow++; else main++; } return o(c, sc, geo, m, ob, gr); };
        try { PT.tp(-20, 45); PT.step(0.1); g.step(1, 1 / 60, true); g.renderNow(); } finally { R.renderBufferDirect = o; sm.render = smo; }
        PT.check('shadow-only casters draw in the shadow pass only', shadow >= 1 && main === 0, { shadow, main });
      }
    });

    await pg.run('heightField', () => {
      const g = window.game, W = g.world, HF = W.heightField, T = g.THREE, PT = window.PT;
      PT.check('heightField fields', HF && HF.tex?.isDataTexture && HF.tex.image.data instanceof Float32Array && HF.origin && HF.size && HF.texel > 0 && typeof HF.glsl === 'string',
        HF && { origin: HF.origin, size: HF.size, texel: HF.texel, res: HF.res, format: HF.format });
      const N = 4096; let s = 99991; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const pos = new Float32Array(N * 3), xz = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 168; xz[i * 2] = Math.cos(a) * r; xz[i * 2 + 1] = Math.sin(a) * r;
        pos[i * 3] = ((i % 64) + 0.5) / 32 - 1; pos[i * 3 + 1] = (Math.floor(i / 64) + 0.5) / 32 - 1; }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('aXZ', new T.BufferAttribute(xz, 2));
      const mat = new T.ShaderMaterial({ uniforms: { uH: { value: HF.tex } },
        vertexShader: `uniform sampler2D uH; attribute vec2 aXZ; varying float vH; ${HF.glsl} void main(){ vH = awHeightField(uH, aXZ); gl_PointSize = 1.0; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: 'varying float vH; void main(){ gl_FragColor = vec4(vH, 0.0, 0.0, 1.0); }' });
      const sc = new T.Scene(); sc.add(new T.Points(geo, mat));
      const rt = new T.WebGLRenderTarget(64, 64, { type: T.FloatType });
      const R = g.renderer, prev = R.getRenderTarget(); R.setRenderTarget(rt); R.setClearColor(0, 0); R.clear(); R.render(sc, new T.Camera()); R.setRenderTarget(prev);
      const buf = new Float32Array(64 * 64 * 4); R.readRenderTargetPixels(rt, 0, 0, 64, 64, buf);
      let maxErr = 0; for (let i = 0; i < N; i++) maxErr = Math.max(maxErr, Math.abs(buf[i * 4] - W.getHeight(xz[i * 2], xz[i * 2 + 1])));
      // CPU texel identity: texel (i, j) = getHeight(origin + i·texel)
      let maxTex = 0; const D = HF.tex.image.data, nx = HF.res.x;
      for (let k = 0; k < 500; k++) { const i = Math.floor(rnd() * (nx - 1)), j = Math.floor(rnd() * (HF.res.z - 1)); maxTex = Math.max(maxTex, Math.abs(D[j * nx + i] - W.getHeight(HF.origin.x + i * HF.texel, HF.origin.z + j * HF.texel))); }
      rt.dispose(); geo.dispose(); mat.dispose();
      PT.check('heightField (GPU awHeightField) matches getHeight within 0.05 m (4096 random points)', maxErr <= 0.05, { maxErr: +maxErr.toFixed(5) });
      PT.check('heightField texels = getHeight at vertex positions', maxTex <= 1e-4, { maxTex });
    });

    await pg.run('beacon', () => {
      const g = window.game, PT = window.PT, W = g.world, T = g.THREE;
      PT.tp(-20, 45); PT.look(0, -0.1); PT.step(0.2);
      const owns = W.debug.owns;
      const count = () => { let n = 0; const o = g.renderer.renderBufferDirect.bind(g.renderer); g.renderer.renderBufferDirect = function (c, s, geo, m, ob, gr) { if (/^beacon/.test(ob.name)) n++; return o(c, s, geo, m, ob, gr); }; try { g.renderNow(); } finally { g.renderer.renderBufferDirect = o; } return n; };
      W.setBeacon(null); PT.step(0.6);   // ux sets the objective beacon on every quest step (integration): start from unset
      const c0 = count();
      const progs0 = g.renderer.info.programs.length;
      W.setBeacon(new T.Vector3(-20, 0, 0), { kind: 'quest' }); PT.step(0.6);
      const c1 = count(), a1 = W.beacon.alpha, progs1 = g.renderer.info.programs.length;
      PT.check('beacon ≤ 2 draw calls, 0 when unset', c0 === 0 && c1 >= 1 && c1 <= 2, { unset: c0, set: c1 });
      PT.check('beacon programs prewarmed (no new program on first draw)', progs1 === progs0, { before: progs0, after: progs1 });
      PT.check('beacon visible from afar (alpha ≥ 0.8 at 45 m)', a1 >= 0.8, a1);
      PT.tp(-20, 9); PT.step(1.0); const a2 = W.beacon.alpha;
      PT.tp(-20, 4.5); PT.step(1.0); const a3 = W.beacon.alpha;
      PT.check('beacon fades within 15 m of the player', a2 < 0.6 && a3 < 0.25, { at9m: +a2.toFixed(3), at4_5m: +a3.toFixed(3) });
      PT.tp(-20, 1); PT.step(1.0);
      PT.check('beacon hides when reached', W.beacon.reached && W.beacon.alpha < 0.01 && count() === 0, { reached: W.beacon.reached, alpha: W.beacon.alpha });
      W.setBeacon(new T.Vector3(10, 0, -55), { kind: 'camp' }); PT.step(0.2);
      PT.check('setBeacon kinds + owned by world', W.beacon.kind === 'camp' && owns(W.beacon.group) && W.beacon.group.visible);
      W.setBeacon(null); PT.step(0.1);
      PT.check('setBeacon(null) hides', !W.beacon.group.visible && count() === 0);
    });

    await pg.run('statics + names', () => {
      const g = window.game, PT = window.PT, W = g.world;
      let st = 0, dyn = 0; const dynNames = new Set();
      for (const r of W.debug.roots()) r.traverse((o) => { if (o.matrixAutoUpdate) { dyn++; dynNames.add(o.name || o.type); } else st++; });
      PT.check('static world objects: matrixAutoUpdate = false (only animated / prop objects stay dynamic)', st > 100 && dyn <= 40, { static: st, dynamic: dyn, names: [...dynNames].slice(0, 20) });
      let n0 = 0; g.scene.traverse(() => n0++); PT.step(2); let n1 = 0; g.scene.traverse(() => n1++);
      PT.check('Object3D count flat while idling', n1 - n0 <= 2, { before: n0, after: n1 });
      const A = W.surfaceAttack?.('burning'), names = W.surfaceNamesKo || {};
      PT.check('surface attack descriptors (§7.4.2 names)', A && A.id === 'surface.burning' && A.kind === 'surface' && names.burning === '불길' && names.mud === '진흙' &&
        names.cursed === '저주받은 땅' && names.blight === '오염' && names.void === '공허', A);
      PT.check('camp names 서쪽/동쪽/북쪽 뿔도깨비 야영지', W.camps.map((c) => c.name).join() === '서쪽 뿔도깨비 야영지,동쪽 뿔도깨비 야영지,북쪽 뿔도깨비 야영지', W.camps.map((c) => c.name));
      // the player's burn from burning grass carries the world source
      const P = g.player?.entity || g.entities?.find?.((e) => e.team === 'player');
      if (P && W.surface?.ignite) {
        let st2 = null, spot = null;
        // the endgame mage build can be burn-immune (tree passive): lift that for this check only
        const SG = g.stats, sg0 = SG?.get; if (sg0) SG.get = function (k, ...a) { return k === 'burnImmune' ? 0 : sg0.call(this, k, ...a); };
        for (const [x, z] of [[-20, 45], [-30, 40], [-12, 52], [30, 60]]) {
          PT.tp(x, z); PT.heal(); P.statuses = {};
          W.surface.ignite(g.player.object.position.clone(), 2.5, 1);
          for (let k = 0; k < 8 && !st2; k++) { PT.step(0.25); st2 = P.statuses?.burning || null; }
          if (st2) { spot = [x, z]; break; }
        }
        if (sg0) SG.get = sg0;
        PT.check('burning grass on the player carries attack surface.burning', !!st2 && st2.source?.attack?.id === 'surface.burning', st2 ? { src: st2.source?.id, spot } : 'no burning status');
      } else PT.skip('burning grass source', 'no player entity / surface');
    });
  }
  await pg.close();

  // ================================================================== grep: no white effect colours in world vfx calls
  {
    const fs = require('fs'), path = require('path');
    const dir = path.join(PT.root, 'src', 'world'); const bad = [];
    for (const f of ['world.js'].map((x) => path.join(PT.root, 'src', x)).concat(fs.readdirSync(dir).map((x) => path.join(dir, x)))) {
      const src = fs.readFileSync(f, 'utf8').split('\n');
      src.forEach((l, i) => { if (/vfx\?*\.\w+\?*\.?\(/.test(l) && /0xffffff/i.test(l)) bad.push(`${path.basename(f)}:${i + 1}`); });
    }
    PT.check('no 0xffffff in world vfx calls (rule 5)', bad.length === 0, bad);
  }
  PT.note(`world section ${Math.round((Date.now() - t0) / 1000)} s`);
};
