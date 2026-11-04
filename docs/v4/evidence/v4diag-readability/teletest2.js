const { boot } = require('./lib.js'); const fs = require('fs');
(async () => {
  const g = await boot('&cls=mage&level=30&skills=preset:endgame_mage');
  const r = await g.p.evaluate(() => {
    const G = game, T = G.THREE, R = G.renderer, gl = R.getContext(), pl = G.player;
    const W = G.world, gh = (x, z) => (W.getGroundHeight ? W.getGroundHeight(x, z) : W.getHeight(x, z));
    pl.object.position.set(-19.98, gh(-19.98, 45.81) + 0.05, 45.81); pl.setLook(0, -0.3); G.step(20, 1 / 30);
    const pp = pl.object.position;
    const Wd = R.domElement.width, Ht = R.domElement.height; const A = new Uint8Array(Wd * Ht * 4), B = new Uint8Array(Wd * Ht * 4);
    const grab = (d) => { G.renderNow(); gl.readPixels(0, 0, Wd, Ht, gl.RGBA, gl.UNSIGNED_BYTE, d); };
    const cnt = () => { let n = 0, s = 0; for (let i = 0; i < A.length; i += 8) { const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); if (d > 24) { n++; s += d; } } return [n, n ? Math.round(s / n) : 0]; };
    const res = {};
    const shots = {};
    const tm = G.scene.children.filter((o) => o.name === 'vfx-telegraph');
    const c = new T.Vector3(pp.x, pp.y, pp.z - 6);
    for (const shape of ['circle', 'cone', 'line']) {
      const h = G.vfx.telegraph({ shape, pos: shape === 'circle' ? c : pp.clone().add(new T.Vector3(0, 0, -1.5)), dir: new T.Vector3(0, 0, -1), r: 2.8, len: 8, width: 1.4, angle: 90, dur: 1, color: 'void' });
      G.step(12, 1 / 30); // 0.4 s → 40% fill
      grab(A); const vis = tm.filter((o) => o.visible); vis.forEach((o) => (o.visible = false)); grab(B); vis.forEach((o) => (o.visible = true));
      res[shape] = { def: cnt() };
      vis.forEach((o) => (o.material.side = T.DoubleSide)); shots[shape] = (G.renderNow(), R.domElement.toDataURL('image/png')); vis.forEach((o) => (o.material.side = T.FrontSide));
      // grass hidden
      const grass = []; G.scene.traverse((o) => { if (/^grass/.test(o.name) && o.visible) grass.push(o); });
      grass.forEach((o) => (o.visible = false)); grab(A); vis.forEach((o) => (o.visible = false)); grab(B); vis.forEach((o) => (o.visible = true)); grass.forEach((o) => (o.visible = true));
      res[shape].noGrass = cnt();
      vis.forEach((o) => (o.material.side = T.DoubleSide)); grab(A); vis.forEach((o) => (o.visible = false)); grab(B); vis.forEach((o) => { o.visible = true; o.material.side = T.FrontSide; });
      res[shape].doubleSide = cnt();
      res[shape].mats = vis.map((o) => ({ ro: o.renderOrder, blend: o.material.blending, alpha: o.material.uniforms.uAlpha.value, prog: +o.material.uniforms.uProg.value.toFixed(2), y: o.geometry.attributes.position.array[1].toFixed(2), gy: gh(o.geometry.attributes.position.array[0], o.geometry.attributes.position.array[2]).toFixed(2) }));
      h.stop();
    }
    return { res, shots, size: [Wd, Ht] };
  });
  for (const k in r.shots) fs.writeFileSync(`/tmp/v4diag-readability/tele2_${k}.png`, Buffer.from(r.shots[k].split(',')[1], 'base64'));
  delete r.shots; console.log(JSON.stringify(r, null, 1)); console.log(g.logs.slice(0, 5).join('\n'));
  await g.close();
})();
