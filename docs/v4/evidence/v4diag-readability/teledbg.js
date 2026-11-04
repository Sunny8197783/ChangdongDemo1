const { boot } = require('./lib.js'); const fs = require('fs');
(async () => {
  const g = await boot('&cls=mage');
  const r = await g.p.evaluate(() => {
    const G = game, T = G.THREE, R = G.renderer, gl = R.getContext(), pl = G.player;
    const W = G.world, gh = (x, z) => (W.getGroundHeight ? W.getGroundHeight(x, z) : W.getHeight(x, z));
    pl.object.position.set(-19.98, gh(-19.98, 45.81) + 0.05, 45.81); pl.setLook(0, -0.3); G.step(20, 1 / 30);
    const pp = pl.object.position;
    const tm = G.scene.children.filter((o) => o.name === 'vfx-telegraph');
    const h = G.vfx.telegraph({ shape: 'circle', pos: new T.Vector3(pp.x, pp.y, pp.z - 6), r: 2.8, dur: 1, color: 'damage' });
    G.step(12, 1 / 30);
    const m = tm.find((o) => o.visible);
    const info = { parentIsScene: m.parent === G.scene, layers: m.layers.mask, camLayers: G.camera.layers.mask, matrixWorld: m.matrixWorld.elements.slice(12, 15), uniforms: Object.keys(m.material.uniforms), progs: R.info.programs.length, vis: m.visible, matVisible: m.material.visible, opacity: m.material.opacity, transparent: m.material.transparent, posCount: m.geometry.attributes.position.count, idx: !!m.geometry.index, drawRange: m.geometry.drawRange, groups: m.geometry.groups.length, sideflag: m.material.side };
    const p0 = Array.from(m.geometry.attributes.position.array.slice(0, 9)); info.p0 = p0;
    const old = m.material; m.material = new T.MeshBasicMaterial({ color: 0xff0000, side: T.DoubleSide });
    G.renderNow(); const a = R.domElement.toDataURL('image/png'); m.material = old;
    // check program diagnostics
    G.renderNow();
    const prog = R.properties.get(old)?.currentProgram; info.progDiag = prog ? (prog.diagnostics || 'ok') : 'no program';
    info.programName = prog?.name;
    return { info, a };
  });
  fs.writeFileSync('/tmp/v4diag-readability/teledbg.png', Buffer.from(r.a.split(',')[1], 'base64'));
  console.log(JSON.stringify(r.info, null, 1)); console.log(g.logs.join('\n'));
  await g.close();
})();
