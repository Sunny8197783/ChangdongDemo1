// Copied from docs/v4/evidence/v4diag-perf/inject.js (PLAN v4 header) with fixed paths: repo root = this file's ../../.., output = tools/playtest4/out/perf/.
// In-page instrumentation. Evaluated after game.ready. Exposes window.PROF.
(() => {
  const g = window.game, R = g.renderer, T = g.THREE, gl = R.getContext();
  const _px = new Uint8Array(4); const SYNC = () => { const fb = gl.getParameter(gl.FRAMEBUFFER_BINDING); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); };
  const P = window.PROF = { SYNC, frame: null, frames: [], mods: {}, gl: { tex: 0, texBytes: 0, buf: 0, bufBytes: 0, compile: 0, link: 0, diag: 0 } };
  R.info.autoReset = false;
  // ---- gl call counters (uploads / compiles)
  const wrapGL = (name, fn) => { const o = gl[name].bind(gl); gl[name] = (...a) => { fn(a); return o(...a); }; };
  wrapGL('texImage2D', (a) => { P.gl.tex++; });
  wrapGL('texSubImage2D', (a) => { P.gl.tex++; });
  if (gl.texImage3D) wrapGL('texImage3D', () => { P.gl.tex++; });
  wrapGL('bufferData', (a) => { P.gl.buf++; P.gl.bufBytes += a[1]?.byteLength || (typeof a[1] === 'number' ? a[1] : 0); });
  wrapGL('bufferSubData', (a) => { P.gl.buf++; P.gl.bufBytes += a[2]?.byteLength || 0; });
  wrapGL('compileShader', () => { P.gl.compile++; });
  wrapGL('linkProgram', () => { P.gl.link++; });
  wrapGL('getProgramInfoLog', () => { P.gl.diag++; });
  // ---- per draw records
  const _s = new T.Sphere(), _v = new T.Vector3();
  let passName = 'other';
  const origRBD = R.renderBufferDirect.bind(R);
  R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    const F = P.frame;
    if (F) {
      const pn = passName;
      const pp = F.pass[pn] || (F.pass[pn] = { calls: 0, tris: 0, transp: 0, additive: 0, px: 0 });
      pp.calls++;
      // tris estimate
      let n = geometry.index ? geometry.index.count : (geometry.attributes.position?.count || 0);
      const dr = geometry.drawRange; n = Math.min(n, dr.count === Infinity ? n : dr.count);
      if (group) n = Math.min(n, group.count);
      let inst = 1;
      if (object.isInstancedMesh) inst = object.count; else if (geometry.isInstancedBufferGeometry) inst = geometry.instanceCount === Infinity ? 1 : geometry.instanceCount;
      const tris = (object.isMesh ? n / 3 : 0) * inst;
      pp.tris += tris;
      if (pn === 'scene') {
        const key = (object.name || object.parent?.name || object.type) + '|' + material.type;
        const k = F.byObj[key] || (F.byObj[key] = { calls: 0, tris: 0 }); k.calls++; k.tris += tris;
        const mk = material.type + (material.transparent ? '/T' : '') + (material.blending === T.AdditiveBlending || (material.blending === T.CustomBlending && material.blendDst === T.OneFactor) ? '/add' : '');
        F.byMat[mk] = (F.byMat[mk] || 0) + 1;
        if (material.transparent) {
          pp.transp++;
          const add = material.blending === T.AdditiveBlending || (material.blending === T.CustomBlending && material.blendDst === T.OneFactor);
          if (add) pp.additive++;
          // screen coverage estimate from bounding sphere (non-particle)
          if (!object.name?.startsWith('vfx-additive') && !object.name?.startsWith('vfx-alpha')) {
            if (!geometry.boundingSphere) geometry.computeBoundingSphere();
            _s.copy(geometry.boundingSphere).applyMatrix4(object.matrixWorld);
            if (_s.radius < 1e5) {
              _v.copy(_s.center).applyMatrix4(camera.matrixWorldInverse);
              const d = Math.max(-_v.z, 0.3);
              const H = F.H, f = H / 2 / Math.tan(camera.fov * Math.PI / 360);
              const rpx = Math.min(_s.radius * f / d, F.W);
              const area = Math.min(Math.PI * rpx * rpx, F.W * F.H) * (-_v.z + _s.radius > 0 ? 1 : 0) * 0.5; // ~50% of disc filled
              pp.px += area * inst;
              F.tlist.push([key, Math.round(area)]);
            }
          }
        }
      }
    }
    return origRBD(camera, scene, geometry, material, object, group);
  };
  // ---- pass wrappers
  const passes = g.composer.passes;
  const pnames = passes.map((p) => p.constructor.name === 'RenderPass' ? 'scene' : p.constructor.name === 'UnrealBloomPass' ? 'bloom' : p.constructor.name === 'OutputPass' ? 'output' : 'sanitize');
  P.finish = false;
  passes.forEach((p, i) => {
    const o = p.render.bind(p);
    p.render = (...a) => {
      passName = pnames[i];
      if (P.finish) SYNC(); const t0 = performance.now();
      const c0 = R.info.render.calls;
      o(...a);
      if (P.finish) SYNC();
      const F = P.frame;
      if (F) { const pp = F.pass[pnames[i]] || (F.pass[pnames[i]] = { calls: 0, tris: 0, transp: 0, additive: 0, px: 0 }); pp.ms = (pp.ms || 0) + performance.now() - t0; pp.rcalls = (pp.rcalls || 0) + R.info.render.calls - c0; }
      passName = 'other';
    };
  });
  // shadow map
  const sm = R.shadowMap, so = sm.render.bind(sm);
  sm.render = (...a) => {
    const prev = passName; passName = 'shadow';
    if (P.finish) SYNC(); const t0 = performance.now(); const willRun = sm.needsUpdate || sm.autoUpdate;
    so(...a);
    if (P.finish && willRun) SYNC();
    const F = P.frame; if (F && willRun) { const pp = F.pass.shadow || (F.pass.shadow = { calls: 0, tris: 0, transp: 0, additive: 0, px: 0 }); pp.ms = (pp.ms || 0) + performance.now() - t0; pp.runs = (pp.runs || 0) + 1; }
    passName = prev;
  };
  // ---- module update timers
  const ORDER = ['world', 'vfx', 'combat', 'audio', 'player', 'spells', 'sword', 'skills', 'enemies', 'story', 'cinematic', 'ui'];
  for (const m of ORDER) {
    const mod = g[m]; if (!mod || typeof mod.update !== 'function') continue;
    const o = mod.update.bind(mod);
    P.mods[m] = { ms: 0, n: 0, max: 0 };
    mod.update = (...a) => { const t0 = performance.now(); try { return o(...a); } finally { const d = performance.now() - t0; const M = P.mods[m]; M.ms += d; M.n++; if (d > M.max) M.max = d; if (P.frame) P.frame.mod[m] = (P.frame.mod[m] || 0) + d; } };
  }
  // world sub-systems
  P.sub = {};
  const wrapSub = (label, obj, fn = 'update') => {
    if (!obj || typeof obj[fn] !== 'function') return;
    const o = obj[fn].bind(obj); P.sub[label] = { ms: 0, n: 0 };
    obj[fn] = (...a) => { const t0 = performance.now(); try { return o(...a); } finally { P.sub[label].ms += performance.now() - t0; P.sub[label].n++; } };
  };
  wrapSub('world.grass', g.world.grass); wrapSub('world.flora', g.world.flora); wrapSub('world.structures', g.world.structures);
  // ---- counters for new three objects (global ids)
  P.ids = () => ({ obj: new T.Object3D().id, mat: (() => { const m = new T.Material(); const id = m.id; m.dispose(); return id; })(), geo: (() => { const q = new T.BufferGeometry(); const id = q.id; q.dispose(); return id; })() });
  // ---- one instrumented frame
  P.step = (dt = 1 / 60, render = true) => {
    const W = R.domElement.width, H = R.domElement.height;
    const F = P.frame = { pass: {}, mod: {}, byObj: {}, byMat: {}, tlist: [], W, H };
    R.info.reset();
    const gl0 = { ...P.gl };
    const t0 = performance.now();
    g.step(1, dt, render);
    if (P.finish && render) SYNC();
    F.ms = performance.now() - t0;
    F.calls = R.info.render.calls; F.tris = R.info.render.triangles;
    F.glDelta = Object.fromEntries(Object.keys(P.gl).map((k) => [k, P.gl[k] - gl0[k]]));
    P.frame = null;
    return F;
  };
  // particle overdraw estimate (premultiplied quads, CPU data)
  P.particlePx = () => {
    const cam = g.camera; const H = R.domElement.height, W = R.domElement.width;
    const f = H / 2 / Math.tan(cam.fov * Math.PI / 360);
    const out = {};
    for (const [nm, ps] of [['add', g.vfx?._add], ['alpha', g.vfx?._alpha]]) void 0;
    let tot = 0, n = 0, big = 0;
    g.scene.traverse((o) => {
      if (o.name !== 'vfx-additive' && o.name !== 'vfx-alpha') return;
      const geo = o.geometry, ip = geo.attributes.iPos, cnt = geo.instanceCount; let px = 0;
      for (let i = 0; i < cnt; i++) {
        _v.set(ip.array[i * 4], ip.array[i * 4 + 1], ip.array[i * 4 + 2]).applyMatrix4(cam.matrixWorldInverse);
        if (_v.z > -0.1) continue;
        const s = ip.array[i * 4 + 3] * f / -_v.z; const a = Math.min(s * s, W * H);
        px += a; if (a > W * H * 0.05) big++;
      }
      out[o.name] = { n: cnt, px: Math.round(px) }; tot += px; n += cnt;
    });
    out.totalScreens = +(tot / (W * H)).toFixed(2); out.bigQuads = big;
    return out;
  };
  P.sceneInfo = () => {
    let meshes = 0, vis = 0, lights = [], inst = 0, skinned = 0, outl = 0, castS = 0, transparentMats = new Set(), mats = new Set(), geos = new Set();
    g.scene.traverse((o) => {
      if (o.isLight) lights.push(o.type + (o.visible ? '' : '(hidden)') + ':' + (+o.intensity).toFixed(1));
      if (o.isMesh || o.isLine || o.isPoints) {
        meshes++; let v = true; for (let p = o; p; p = p.parent) if (!p.visible) { v = false; break; }
        if (v) { vis++; if (o.isInstancedMesh) inst++; if (o.isSkinnedMesh) skinned++; if (/outline/i.test(o.name) || o.userData?.isOutline) outl++; if (o.castShadow) castS++; mats.add(o.material); geos.add(o.geometry); }
      }
    });
    const sun = g.world.sun || null;
    return { meshes, visible: vis, instanced: inst, skinned, outlines: outl, castShadow: castS, lights, programs: R.info.programs.length, textures: R.info.memory.textures, geometries: R.info.memory.geometries, uniqueMats: mats.size,
      pr: R.getPixelRatio(), canvas: [R.domElement.width, R.domElement.height], rt: { w: g.composer.renderTarget1.width, h: g.composer.renderTarget1.height, type: g.composer.renderTarget1.texture.type, samples: g.composer.renderTarget1.samples },
      bloom: g.bloomPass ? { enabled: g.bloomPass.enabled, mips: g.bloomPass.nMips, res: [g.bloomPass.resolution.x, g.bloomPass.resolution.y], first: g.bloomPass.renderTargetsHorizontal?.[0] ? [g.bloomPass.renderTargetsHorizontal[0].width, g.bloomPass.renderTargetsHorizontal[0].height] : null } : null,
      shadow: (() => { let s = null; g.scene.traverse((o) => { if (o.isDirectionalLight && o.castShadow) s = { size: o.shadow.mapSize.x, extent: o.shadow.camera.right, type: R.shadowMap.type }; }); return s; })(),
      grass: g.world.grass?.layers?.map((L) => ({ n: L.L.name, chunks: L.geo.instanceCount, tris: Math.round(L.geo.drawRange.count / 3) * L.geo.instanceCount })),
      vfx: g.vfx?.stats?.(), entities: g.entities.length, settings: { ...g.settings.values }, perfScale: g.perfScale };
  };
  return true;
})();
