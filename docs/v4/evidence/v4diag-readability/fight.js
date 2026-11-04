// Busy-fight readability measurement. node fight.js <cls> [seconds]
const { boot } = require('./lib.js'); const fs = require('fs');
const cls = process.argv[2] || 'mage', SECS = +(process.argv[3] || 14);
(async () => {
  const g = await boot(`&cls=${cls}&level=30&skills=preset:endgame_${cls}&cad=${process.argv[4]||0.55}&armor=${process.argv[5]||0}&fix=${process.argv[6]||0}`);
  const out = await g.p.evaluate(async ({ SECS, cls }) => {
    const G = game, T = G.THREE, R = G.renderer, gl = R.getContext();
    const pl = G.player, pe = pl.entity;
    // find flat open spot: walk away from village a bit (try candidates, pick flattest)
    const W = G.world, gh = (x, z) => (W.getGroundHeight ? W.getGroundHeight(x, z) : W.getHeight(x, z));
    const p0 = new T.Vector3(0, 0, 45);
    let best = null;
    for (let k = 0; k < 40; k++) {
      const a = k * 2.4, r = 4 + (k % 5) * 8; const x = p0.x + Math.cos(a) * r, z = p0.z + Math.sin(a) * r;
      let mn = 1e9, mx = -1e9, blk = 0; const tv = new T.Vector3(); for (let i = -3; i <= 3; i++) for (let j = -5; j <= 2; j++) { const h = gh(x + i * 3, z + j * 3); mn = Math.min(mn, h); mx = Math.max(mx, h); tv.set(x + i * 3, h, z + j * 3); const ox = tv.x, oz = tv.z; W.resolveCollision?.(tv, 0.5); if (Math.abs(tv.x - ox) + Math.abs(tv.z - oz) > 0.01) blk++; }
      const wd = W.waterDepth ? W.waterDepth(x, z) : 0;
      const sc = (mx - mn) + (wd > 0 ? 100 : 0) + blk * 5;
      if (!best || sc < best.sc) best = { x, z, sc };
    }
    pl.object.position.set(best.x, gh(best.x, best.z) + 0.05, best.z);
    pl.setLook(0, -0.2); G.step(10, 1 / 30);
    const FIX = new URLSearchParams(location.search).get('fix') === '1';
    if (FIX) G.scene.traverse((o) => { if (o.name === 'vfx-telegraph') o.material.side = T.DoubleSide; });
    const baseVisible = new Set(); G.scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.visible) baseVisible.add(o); });
    // enemies
    const pp = pl.object.position;
    const roster = [['bokoblin', -2, -6], ['bokoblin', 2.5, -6.5], ['voidknight', 0, -8], ['wolf', -4, -8], ['wolf', 4, -8], ['lizard', -1, -10], ['shaman', 3, -12]];
    const foes = [];
    for (const [t, dx, dz] of roster) { const e = G.debug.spawn(t, { pos: new T.Vector3(pp.x + dx, pp.y, pp.z + dz) }); if (e) foes.push(e); }
    const ARM = new URLSearchParams(location.search).get('armor') === '1';
    for (const e of foes) { e.hp = e.maxHp = 1e6; if (ARM) e.isBoss = true; }
    const keepAlive = () => { pe.hp = pe.maxHp = 1e6; for (const e of foes) { if (e.hp < 1e5) e.hp = 1e6; } };
    const loadout = G.skills.loadout; const slots = ['q1', 'q2', 'q3', 'q4'].map((k) => loadout[k]).filter(Boolean);
    const WIND = new Set(['windup', 'leapPrep', 'slashWind', 'slamWind', 'crouch', 'thrustWind', 'lungePrep', 'cast', 'lob', 'punchWind', 'throwWind']);
    const isTele = (o) => o.name === 'vfx-telegraph' || (o.renderOrder === 5 && o.material?.uniforms?.uProg && o.material.uniforms.uAlpha && !o.material.uniforms.uShape);
    const inEnemy = new Set(); const refreshEnemySet = () => { inEnemy.clear(); for (const e of G.enemies.all) e.object.traverse((o) => inEnemy.add(o)); };
    const playerSet = new Set(); pl.object.traverse((o) => playerSet.add(o));
    const DPR = R.getPixelRatio(), Wd = R.domElement.width, Ht = R.domElement.height;
    const buf = () => new Uint8Array(Wd * Ht * 4);
    const bufs = { A: buf(), Ab: buf(), B: buf(), C: buf(), D: buf(), F: buf(), Bg: buf(), Cg: buf() };
    const grab = (dst) => { G.renderNow(); gl.readPixels(0, 0, Wd, Ht, gl.RGBA, gl.UNSIGNED_BYTE, dst); };
    const shots = [];
    const setVis = (list, v) => { for (const o of list) o.visible = v; };
    const diff = (a, b, i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    const samples = []; const coverByName = {};
    const transitions = []; const hist = {}; const lastState = new Map();
    let castI = 0, castT = 0, ultT = 3, t = 0; const dt = 1 / 30; let frame = 0;
    const nameOf = (o) => o.name || (o.parent?.name ? o.parent.name + '/' + o.type : o.type);
    while (t < SECS) {
      keepAlive();
      // keep camera looking at the pack centroid
      let cx = 0, cz = 0, n = 0; for (const e of foes) if (e.alive) { cx += e.object.position.x; cz += e.object.position.z; n++; }
      if (n) { cx /= n; cz /= n; const yaw = Math.atan2(-(cx - pp.x), -(cz - pp.z)); pl.setLook(yaw, -0.25); }
      castT -= dt; ultT -= dt;
      if (castT <= 0) { castT = +(new URLSearchParams(location.search).get('cad') || 0.55); const id = slots[castI++ % slots.length]; try { G.debug.cast(id); } catch (_) {} }
      if (ultT <= 0 && loadout.ult) { ultT = 7; try { G.debug.cast(loadout.ult); } catch (_) {} }
      if (cls !== 'mage' && frame % 6 < 3) G.input.simulate({ mouse: { 0: true } }); else G.input.simulate(null);
      G.step(1, dt); t += dt; frame++;
      for (const e of G.enemies.all) {
        const s = e.state, ps = lastState.get(e); const hk = (e.kind) + ':' + s + (e.statuses ? ':' + Object.keys(e.statuses).filter((k) => e.statuses[k]).join('+') : ''); hist[hk] = (hist[hk] || 0) + 1;
        if (!ps || ps.s !== s) { if (ps && WIND.has(ps.s)) transitions.push({ type: e.type || e.kind || e.id, state: ps.s, frames: frame - ps.f, gameT: +(e._lastStateT ?? 0).toFixed(3) }); lastState.set(e, { s, f: frame }); }
        e._lastStateT = e.stateT;
      }
      const winders = G.enemies.all.filter((e) => e.alive && WIND.has(e.state));
      const teles = []; G.scene.traverse((o) => { if (o.visible && isTele(o)) teles.push(o); });
      if (frame % 5 !== 0 || (!winders.length && !teles.length) || t < 1.5) continue;
      // classify
      refreshEnemySet();
      const vfx = [];
      G.scene.traverse((o) => {
        if (!(o.isMesh || o.isPoints || o.isSprite || o.isLine) || !o.visible) return;
        if (isTele(o) || playerSet.has(o)) return;
        if (inEnemy.has(o)) { if (/^(vfx|status)/.test(o.name)) vfx.push(o); return; }
        if (baseVisible.has(o) && !/^(vfx|status|spells|skills)/.test(o.name)) return;
        vfx.push(o);
      });
      grab(bufs.A);
      const bOn = G.bloomPass.enabled; G.bloomPass.enabled = false; grab(bufs.Ab); G.bloomPass.enabled = bOn;
      setVis(vfx, false); grab(bufs.B);
      setVis(teles, false); grab(bufs.C); setVis(teles, true);
      const enemyMeshes = []; const tgt = winders[0];
      if (tgt) tgt.object.traverse((o) => { if (o.visible && (o.isMesh || o.isSprite)) enemyMeshes.push(o); });
      setVis(enemyMeshes, false); grab(bufs.D); setVis(enemyMeshes, true);
      const pm = []; pl.object.traverse((o) => { if (o.visible && (o.isMesh || o.isSprite || o.isPoints)) pm.push(o); });
      setVis(pm, false); grab(bufs.F); setVis(pm, true);
      const grass = []; G.scene.traverse((o) => { if (/^grass_/.test(o.name) && o.visible) grass.push(o); });
      setVis(grass, false); grab(bufs.Bg); setVis(teles, false); grab(bufs.Cg); setVis(teles, true); setVis(grass, true);
      // per-vfx coverage attribution (cheap: only names) — count vfx objects by name
      for (const o of vfx) { const k = nameOf(o); coverByName[k] = (coverByName[k] || 0) + 1; }
      setVis(vfx, true);
      const { A, Ab, B, C, D, F, Bg, Cg } = bufs; let tgPix = 0, tgGrass = 0;
      let tPix = 0, tLost = 0, tNoise = 0, tSig = 0, tBloom = 0, tPlayer = 0, ePix = 0, eLost = 0, eNoise = 0, eSig = 0, ePlayer = 0, eBloom = 0;
      for (let y = 0; y < Ht; y += 2) for (let x = 0; x < Wd; x += 2) {
        const i = (y * Wd + x) * 4;
        const sTg = diff(Bg, Cg, i); if (sTg > 24) { tgPix++; if (diff(B, C, i) < sTg * 0.5) tgGrass++; }
        const sT = diff(B, C, i), sE = tgt ? diff(B, D, i) : 0, nV = diff(A, B, i), nP = diff(B, F, i), nBl = diff(A, Ab, i);
        if (sT > 24) { tPix++; tSig += sT; tNoise += nV; tBloom += nBl; if (nV > sT) tLost++; if (nP > 24) tPlayer++; }
        if (sE > 30) { ePix++; eSig += sE; eNoise += nV; eBloom += nBl; if (nV > sE * 0.5) eLost++; if (nP > 30) ePlayer++; }
      }
      const tScr = teles.map((o) => { const c = (o.geometry.boundingSphere?.center || o.position).clone(); const v = c.clone().project(G.camera); return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3)]; });
      const sm = { tScr, t: +t.toFixed(2), winders: winders.map((e) => (e.type || e.kind || e.id) + ':' + e.state), teles: teles.length, vfxObjs: vfx.length,
        tgPix, tGrassFrac: tgPix ? +(tgGrass / tgPix).toFixed(3) : null, tPix, tLostFrac: tPix ? +(tLost / tPix).toFixed(3) : null, tSigAvg: tPix ? Math.round(tSig / tPix) : null, tNoiseAvg: tPix ? Math.round(tNoise / tPix) : null, tBloomAvg: tPix ? Math.round(tBloom / tPix) : null, tPlayerFrac: tPix ? +(tPlayer / tPix).toFixed(3) : null,
        ePix, eLostFrac: ePix ? +(eLost / ePix).toFixed(3) : null, eSigAvg: ePix ? Math.round(eSig / ePix) : null, eNoiseAvg: ePix ? Math.round(eNoise / ePix) : null, eBloomAvg: ePix ? Math.round(eBloom / ePix) : null, ePlayerFrac: ePix ? +(ePlayer / ePix).toFixed(3) : null,
        calls: R.info.render.calls };
      samples.push(sm);
      if (shots.length < 4 && ((sm.tLostFrac ?? 0) > 0.3 || (sm.eLostFrac ?? 0) > 0.3) && sm.t > shots.length * 3) {
        G.renderNow(); const a = R.domElement.toDataURL('image/png');
        setVis(vfx, false); G.renderNow(); const b = R.domElement.toDataURL('image/png'); setVis(vfx, true);
        shots.push({ t: sm.t, a, b, info: sm });
      }
    }
    G.input.simulate(null);
    return { hist, spot: best, samples, transitions, coverByName, shots, dpr: DPR, size: [Wd, Ht], vfxStats: G.vfx.stats?.() };
  }, { SECS, cls });
  const dir = '/tmp/v4diag-readability/';
  out.shots.forEach((s, k) => { fs.writeFileSync(`${dir}${cls}_a${process.argv[5]||0}_f${process.argv[6]||0}_busy${k}_full.png`, Buffer.from(s.a.split(',')[1], 'base64')); fs.writeFileSync(`${dir}${cls}_a${process.argv[5]||0}_f${process.argv[6]||0}_busy${k}_novfx.png`, Buffer.from(s.b.split(',')[1], 'base64')); s.a = s.b = undefined; });
  fs.writeFileSync(`${dir}fight_${cls}_a${process.argv[5]||0}_f${process.argv[6]||0}.json`, JSON.stringify(out, null, 1));
  const S = out.samples; const avg = (k) => { const v = S.map((s) => s[k]).filter((x) => x != null); return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) : null; };
  const cnt = (k, th) => S.filter((s) => s[k] != null && s[k] > th).length;
  console.log(JSON.stringify({ cls, n: S.length, withTele: S.filter((s) => s.tPix).length, withWind: S.filter((s) => s.ePix).length,
    tLostAvg: avg('tLostFrac'), tLost50: cnt('tLostFrac', 0.5), tLost25: cnt('tLostFrac', 0.25), eLostAvg: avg('eLostFrac'), eLost50: cnt('eLostFrac', 0.5), eLost25: cnt('eLostFrac', 0.25),
    tPlayerAvg: avg('tPlayerFrac'), tGrassAvg: avg('tGrassFrac'), ePlayerAvg: avg('ePlayerFrac'), tSig: avg('tSigAvg'), tNoise: avg('tNoiseAvg'), tBloom: avg('tBloomAvg'), eBloom: avg('eBloomAvg'), shots: out.shots.map((s) => s.t) }));
  console.log('coverByName', JSON.stringify(Object.entries(out.coverByName).sort((a, b) => b[1] - a[1]).slice(0, 25)));
  console.log('hist', JSON.stringify(Object.entries(out.hist).sort((a,b)=>b[1]-a[1]).slice(0,40)));
  console.log('transitions', JSON.stringify(out.transitions.slice(0, 40)));
  console.log(g.logs.slice(0, 8).join('\n'));
  await g.close();
})();
