// page-side ablation: synced composer.render cost for variants. returns {variant: ms}
(() => {
  const g = game, R = g.renderer, T = g.THREE, S = PROF.SYNC;
  const meas = (n = 3) => { const v = []; for (let i = 0; i < n; i++) { R.shadowMap.needsUpdate = true; S(); const t = performance.now(); g.composer.render(0); S(); v.push(performance.now() - t); } v.sort((a, b) => a - b); return +v[n >> 1].toFixed(0); };
  const meshesWhere = (pred) => { const a = []; g.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible && pred(o)) a.push(o); }); return a; };
  const hide = (arr) => { for (const o of arr) o.visible = false; return () => { for (const o of arr) o.visible = true; }; };
  const out = {}; const ratio = {};
  meas(1);
  out.base = meas();
  const one = () => { R.shadowMap.needsUpdate = true; S(); const t = performance.now(); g.composer.render(0); S(); return performance.now() - t; };
  const pair = (name, on, off) => { const rs = []; for (let i = 0; i < 3; i++) { const b = one(); on(); const v = one(); off(); rs.push(v / b); } rs.sort((a, b) => a - b); ratio[name] = +rs[1].toFixed(2); };
  let _u;
  pair('noShadowPass', () => { _u = R.shadowMap.render; R.shadowMap.render = () => {}; }, () => { R.shadowMap.render = _u; });
  pair('noGrass', () => { _u = hide(meshesWhere((o) => /^grass_/.test(o.name))); }, () => _u());
  pair('noFlora', () => { _u = hide(meshesWhere((o) => { for (let p = o; p; p = p.parent) if (p.name === 'flora') return true; return false; })); }, () => _u());
  pair('noOutlines', () => { _u = hide(meshesWhere((o) => /outline/i.test(o.name) || (o.material?.side === T.BackSide && o.material?.type === 'ShaderMaterial'))); }, () => _u());
  pair('noTransparent', () => { _u = hide(meshesWhere((o) => o.material && !Array.isArray(o.material) && o.material.transparent)); }, () => _u());
  pair('noParticles', () => { _u = hide(meshesWhere((o) => o.name === 'vfx-additive' || o.name === 'vfx-alpha')); }, () => _u());
  pair('noTerrain', () => { _u = hide(meshesWhere((o) => o.name === 'terrain')); }, () => _u());
  pair('noSkinned', () => { _u = hide(meshesWhere((o) => o.isSkinnedMesh)); }, () => _u());
  pair('noBloom', () => { g.bloomPass.enabled = false; }, () => { g.bloomPass.enabled = true; });
  { const pr = R.getPixelRatio(); const setPR = (x) => { R.setPixelRatio(x); g.composer.setPixelRatio(x); R.setSize(innerWidth, innerHeight); g.composer.setSize(innerWidth, innerHeight); };
    pair('scale075', () => { setPR(pr * 0.75); one(); }, () => { setPR(pr); one(); }); }
  { const c = g.composer; const setS = (n) => { c.renderTarget1.samples = n; c.renderTarget2.samples = n; c.renderTarget1.dispose(); c.renderTarget2.dispose(); };
    pair('msaa4', () => { setS(4); one(); }, () => { setS(0); one(); }); }
  { let vis; pair('emptyScene', () => { vis = []; g.scene.children.forEach((c) => { if (c.visible && !c.isLight && !c.isCamera) { vis.push(c); c.visible = false; } }); }, () => vis.forEach((c) => (c.visible = true))); }
  out.ratio = ratio;
  return out;
  // shadow map: skip update
  { const o = R.shadowMap.render; R.shadowMap.render = () => {}; out.noShadowPass = meas(); R.shadowMap.render = o; }
  { const u = hide(meshesWhere((o) => /^grass_/.test(o.name))); out.noGrass = meas(); u(); }
  { const u = hide(meshesWhere((o) => { for (let p = o; p; p = p.parent) if (p.name === 'flora') return true; return false; })); out.noFlora = meas(); u(); }
  { const u = hide(meshesWhere((o) => /outline/i.test(o.name) || o.userData?.isOutline || (o.material?.side === T.BackSide && o.material?.type === 'ShaderMaterial'))); out.noOutlines = meas(); u(); }
  { const u = hide(meshesWhere((o) => o.material && !Array.isArray(o.material) && o.material.transparent)); out.noTransparent = meas(); u(); }
  { const u = hide(meshesWhere((o) => o.name === 'vfx-additive' || o.name === 'vfx-alpha')); out.noParticles = meas(); u(); }
  { const u = hide(meshesWhere((o) => o.name === 'terrain')); out.noTerrain = meas(); u(); }
  { const u = hide(meshesWhere((o) => o.isSkinnedMesh)); out.noSkinned = meas(); u(); }
  { const b = g.bloomPass.enabled; g.bloomPass.enabled = false; out.noBloom = meas(); g.bloomPass.enabled = b; }
  { const sp = g.composer.passes.find((p) => p.constructor.name === 'ShaderPass'); sp.enabled = false; out.noSanitize = meas(); sp.enabled = true; }
  // MSAA 4 (the real-machine default at medium/high)
  { const c = g.composer; const s0 = c.renderTarget1.samples; c.renderTarget1.samples = 4; c.renderTarget2.samples = 4; c.renderTarget1.dispose(); c.renderTarget2.dispose(); meas(1); out.msaa4 = meas(); c.renderTarget1.samples = s0; c.renderTarget2.samples = s0; c.renderTarget1.dispose(); c.renderTarget2.dispose(); meas(1); }
  // render scale 0.75
  { const pr = R.getPixelRatio(); R.setPixelRatio(pr * 0.75); g.composer.setPixelRatio(pr * 0.75); R.setSize(innerWidth, innerHeight); g.composer.setSize(innerWidth, innerHeight); meas(1); out.scale075 = meas();
    R.setPixelRatio(pr); g.composer.setPixelRatio(pr); R.setSize(innerWidth, innerHeight); g.composer.setSize(innerWidth, innerHeight); meas(1); }
  // everything except opaque world: only scene pass with nothing? (empty scene floor)
  { const vis = []; g.scene.children.forEach((c) => { if (c.visible && !c.isLight && !c.isCamera) { vis.push(c); c.visible = false; } }); out.emptyScene = meas(); vis.forEach((c) => (c.visible = true)); }
  out.base2 = meas();
  return out;
})();
