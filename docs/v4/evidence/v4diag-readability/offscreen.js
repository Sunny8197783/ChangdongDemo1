const { boot } = require('./lib.js');
const cls = process.argv[2] || 'sword';
(async () => {
  const g = await boot(`&cls=${cls}&level=30&skills=preset:endgame_${cls}`);
  const r = await g.p.evaluate(({ cls }) => {
    const G = game, T = G.THREE, pl = G.player, pe = pl.entity, cam = G.camera;
    const W = G.world, gh = (x, z) => (W.getGroundHeight ? W.getGroundHeight(x, z) : W.getHeight(x, z));
    pl.object.position.set(-19.98, gh(-19.98, 45.81) + 0.05, 45.81); pl.setLook(0, -0.25); G.step(10, 1 / 30);
    const pp = pl.object.position;
    const roster = [['bokoblin', -2, -6], ['bokoblin', 2.5, -6.5], ['voidknight', 0, -8], ['wolf', -4, -8], ['wolf', 4, -8], ['wolf', 0, -9], ['lizard', -1, -10], ['shaman', 3, -12]];
    const foes = roster.map(([t, dx, dz]) => G.debug.spawn(t, { pos: new T.Vector3(pp.x + dx, pp.y, pp.z + dz) })).filter(Boolean);
    for (const e of foes) { e.hp = e.maxHp = 1e6; }
    const WIND = new Set(['windup', 'leapPrep', 'slashWind', 'slamWind', 'crouch', 'thrustWind', 'lungePrep', 'cast', 'lob', 'bash']);
    const last = new Map(); const ev = []; const v = new T.Vector3();
    let tgt = null, tT = 0;
    for (let f = 0; f < 900; f++) {
      pe.hp = pe.maxHp = 1e6; for (const e of foes) if (e.hp < 1e5) e.hp = 1e6;
      // player behaviour: lock onto nearest enemy for 2 s, attack with LMB (melee) and stand still
      tT -= 1 / 30;
      if (!tgt || tT <= 0) { let bd = 1e9; for (const e of foes) { const d = e.object.position.distanceTo(pp); if (e.alive && d < bd) { bd = d; tgt = e; } } tT = 2; }
      if (tgt) { const q = tgt.object.position; pl.setLook(Math.atan2(-(q.x - pp.x), -(q.z - pp.z)), -0.25); }
      G.input.simulate(f % 8 < 4 ? { mouse: { 0: true } } : null);
      G.step(1, 1 / 30);
      for (const e of foes) {
        const s = e.state, ps = last.get(e); last.set(e, s);
        if (s !== ps && WIND.has(s)) {
          v.copy(e.object.position); v.y += (e.height || 1.5) * 0.6; const d = v.distanceTo(pp);
          const n = v.clone().project(cam); const on = n.z < 1 && Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1;
          const inCenter = n.z < 1 && Math.abs(n.x) <= 0.6 && Math.abs(n.y) <= 0.7;
          ev.push({ k: e.kind, s, on, inCenter, d: +d.toFixed(1) });
        }
      }
    }
    G.input.simulate(null);
    const close = ev.filter((x) => x.d < 6);
    return { n: ev.length, offscreen: ev.filter((x) => !x.on).length, offscreenClose: close.filter((x) => !x.on).length, closeN: close.length, periphery: ev.filter((x) => x.on && !x.inCenter).length, byKind: ev.reduce((a, x) => { const k = x.k + ':' + x.s; a[k] = a[k] || [0, 0]; a[k][0]++; if (!x.on) a[k][1]++; return a; }, {}) };
  }, { cls });
  console.log(cls, JSON.stringify(r)); await g.close();
})();
