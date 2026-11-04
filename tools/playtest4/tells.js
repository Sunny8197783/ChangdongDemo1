// playtest4 section: tells (PLAN v4 §7.8 T1–T4). Owned by tells.
//   T1 (B): each shape alone at 8 m in S-plains with grass ≥ 600 changed px (960×540); winding (normal.y > 0 + DoubleSide);
//           heightField conformance (decal within 0.1 m of the terrain).
//   T2 (B, branch form): telegraph pixels with legacy particles over the decals ÷ hidden ≥ 0.95; grass on ÷ off ≥ 0.95;
//           behind a > 1 m wall 40 % ± 5 %; rim colour bloom on/off ΔRGB ≤ 8. (R-mage / R-sword / R-boss with real looks: I.)
//   T3 (B): timing (linear progress, one strike latch, floors, tellMul, enemySpeed), hitTest = core reference on 10,000 points,
//           canAttack (punish, off-screen melee), pool 16, ≤ 3 Hz flashes, ≤ 16 KB uploads, events, legacy adapter.
//   T4 (B): rim clone interior ≤ 15 % / perimeter ≥ 60 %, glint/icons/diamonds/chevrons/shockwave per kind, footprints,
//           colour-blind palettes keep shapes, near-white perfect front, renderThumb per kind.
module.exports = async function tells(PT) {
  const W = 960, H = 540;
  // TELLS_ONLY=<regex> runs only the matching blocks (development convenience; default: all)
  const only = process.env.TELLS_ONLY ? new RegExp(process.env.TELLS_ONLY) : null;
  const pg0 = await PT.boot('&cls=mage&level=30', { w: W, h: H });
  const pg = Object.create(pg0);
  pg.run = (label, fn, arg) => (only && !only.test(label) ? Promise.resolve(null) : pg0.run(label, fn, arg));
  PT.check('boot: game.ready', pg.ready, pg.params);
  if (!pg.ready) { await pg.close(); return; }
  PT.note(`boot ${pg.bootMs} ms`);
  PT.check('real tells module loaded (not the stub)', await pg.eval(() => !!game.tells && game.tells.isStub === false && !game.stubbed.includes('tells')));

  // shared in-page helpers
  await pg.eval(() => {
    const g = game, T = g.THREE;
    const X = window.TX = {};
    X.fake = (x, z, o = {}) => ({ object: { position: new T.Vector3(x, PT.groundHeight(x, z), z) }, alive: true, radius: 0.6, height: 1.6, facing: o.facing ?? Math.PI, type: o.type || 'fake', ...o });
    X.clear = () => { g.tells.debug.reset(); PT.step(0.3); };
    g.settings.set('teachSlowmo', false, { persist: false });   // the teaching slow motion has its own check
    X.reset = () => { X.clear(); PT.tp(-20, 45); PT.look(0, -0.42); PT.step(0.15); };
    X.front = (d = 8) => { const p = g.player.object.position; return new T.Vector3(p.x, PT.groundHeight(p.x, p.z - d), p.z - d); };
  });

  // ==================================================================================================== T3 timing
  await pg.run('T3 timing', () => {
    const g = game, T = g.THREE, X = window.TX, TL = g.tells;
    X.reset();
    const e = X.fake(-20, 37);
    // progress linear in enemyTime; strike latch exactly once within one sub-step of dur
    const h = TL.attack(e, { id: 'lin', tell: 'danger', cls: 'mobHeavy', windup: 1.2, shape: { kind: 'circle', pos: e.object.position, r: 3 } });
    PT.check('attack returns a handle with the §7.4.4 fields', h && ['id', 'enemy', 'start', 'dur', 'progress', 'remaining', 'locked', 'done', 'alive'].every((k) => k in h) &&
      ['consumeStrike', 'contains', 'setPos', 'setDir', 'setEnd', 'extend', 'stop'].every((k) => typeof h[k] === 'function'));
    let maxErr = 0, strikes = 0, strikeAt = -1, steps = 0;
    while (steps < 200) {
      const want = (g.enemyTime - h.start) / h.dur;
      if (want <= 1) maxErr = Math.max(maxErr, Math.abs(h.progress - Math.min(1, Math.max(0, want))));
      if (h.consumeStrike()) { strikes++; if (strikeAt < 0) strikeAt = g.enemyTime; }
      g.step(1, 1 / 60); steps++;
      if (strikes && steps > 90) break;
    }
    PT.check('progress linear (|fill − t/dur| ≤ 0.02)', maxErr <= 0.02, maxErr);
    PT.check('consumeStrike true exactly once', strikes === 1, strikes);
    PT.check('strike within 1 sub-step of start + dur', strikeAt >= h.start + h.dur - 1e-9 && strikeAt - (h.start + h.dur) <= 1 / 60 + 1e-6, { strikeAt, due: h.start + h.dur });
    PT.check('handle done after the strike', h.done === true && h.alive === false && h.consumeStrike() === false);
    // floors per class (§5.7) at normal difficulty
    const MIN = { mobLight: 0.75, mobHeavy: 0.85, combo: 0.55, mobRanged: 0.90, elite: 0.80, boss: 1.00, bossAoE: 1.20, unblockable: 1.00 };
    const bad = [];
    for (const [cls, f] of Object.entries(MIN)) {
      const hh = TL.attack(X.fake(-20, 37), { id: 'floor_' + cls, cls, windup: 0.1, melee: false, shape: { kind: 'circle', r: 1 } });
      if (!hh || Math.abs(hh.dur - f) > 1e-6) bad.push([cls, hh?.dur]);
      hh?.stop();
    }
    PT.check('floors per class (windup 0.1 → MIN[cls])', bad.length === 0 && TL.MIN.bossAoE === 1.2, bad);
    PT.check('authored windups above the floor are kept', Math.abs(TL.windup(e, 1.4, 'mobLight') - 1.4) < 1e-9);
    // lock ≥ class minimum
    const hl = TL.attack(X.fake(-20, 37), { id: 'lock', cls: 'boss', windup: 1.5, lockAt: 0.2, melee: false, shape: { kind: 'circle', r: 1 } });
    PT.check('aim lock ≥ class minimum (boss 0.40 s)', Math.abs(hl.lockAt - 0.4) < 1e-9, hl.lockAt); hl.stop();
    // difficulty tellMul (story 1.5, easy 1.3, hard 0.9 but never below floor × 0.9)
    const S = g.settings, out = {};
    for (const d of ['story', 'easy', 'hard']) {
      S.set('difficulty', d, { persist: false });
      const hh = TL.attack(X.fake(-20, 37), { id: 'd', cls: 'mobLight', windup: 1.0, melee: false, shape: { kind: 'circle', r: 1 } });
      const hf = TL.attack(X.fake(-20, 37), { id: 'd', cls: 'mobLight', windup: 0.2, melee: false, shape: { kind: 'circle', r: 1 } });
      out[d] = [hh.dur, hf.dur]; hh.stop(); hf.stop();
    }
    S.set('difficulty', 'normal', { persist: false });
    PT.check('tellMul: story ×1.5, easy ×1.3, hard ×0.9 (floor × 0.9 minimum)', Math.abs(out.story[0] - 1.5) < 1e-6 && Math.abs(out.easy[0] - 1.3) < 1e-6 &&
      Math.abs(out.hard[0] - 0.9) < 1e-6 && Math.abs(out.hard[1] - 0.75 * 0.9) < 1e-6, out);
    S.set('tellMul', 1.5, { persist: false });
    const hs = TL.attack(X.fake(-20, 37), { id: 's', cls: 'mobLight', windup: 1.0, melee: false, shape: { kind: 'circle', r: 1 } });
    S.set('tellMul', 1, { persist: false });
    PT.check('settings.tellMul ×1.5 multiplies dur', Math.abs(hs.dur - 1.5) < 1e-6, hs.dur); hs.stop();
    // e.timeMul
    const hm = TL.attack(X.fake(-20, 37, { timeMul: 1.25 }), { id: 'tm', cls: 'mobLight', windup: 1.0, melee: false, shape: { kind: 'circle', r: 1 } });
    PT.check('e.timeMul scales dur', Math.abs(hm.dur - 1.25) < 1e-6, hm.dur); hm.stop();
    // enemySpeed 0.7 stretches the game-time duration ×1/0.7
    S.set('enemySpeed', 0.7, { persist: false });
    const he = TL.attack(X.fake(-20, 37), { id: 'es', cls: 'mobLight', windup: 1.0, melee: false, shape: { kind: 'circle', r: 1 } });
    const g0 = g.time; let gHit = -1;
    for (let i = 0; i < 240 && gHit < 0; i++) { g.step(1, 1 / 60); if (he.consumeStrike()) gHit = g.time; }
    S.set('enemySpeed', 1, { persist: false });
    PT.check('enemySpeed 0.7 stretches the windup in game time ×1/0.7', gHit > 0 && Math.abs((gHit - g0) / (1 / 0.7) - 1) < 0.03, { gameSec: gHit - g0, want: 1 / 0.7 });
    X.clear();
  });

  await pg.run('T3 hitTest = core reference (10,000 random points)', async () => {
    const g = game, T = g.THREE, TL = game.tells;
    const ref = await import('/src/core/tellgeom.js');
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const kinds = ['circle', 'ring', 'cone', 'line', 'capsule', 'conecap'];
    let mism = 0, n = 0, hm = 0; const ex = [];
    const fake = { object: { position: new T.Vector3(0, 0, 0) }, alive: true, radius: 0.5, height: 1.6 };
    for (let i = 0; i < 10000; i++) {
      const kind = kinds[i % kinds.length];
      const a = rnd() * Math.PI * 2;
      const sh = { kind, pos: new T.Vector3(rnd() * 4 - 2, 0, rnd() * 4 - 2), dir: new T.Vector3(Math.sin(a), 0, Math.cos(a)), r: 1 + rnd() * 5, inner: rnd() * 2,
        angle: 0.1 + rnd() * 2.5, len: 1 + rnd() * 8, width: 0.4 + rnd() * 2.5 };
      if (kind === 'capsule' || kind === 'conecap') sh.end = new T.Vector3(sh.pos.x + rnd() * 8 - 4, 0, sh.pos.z + rnd() * 8 - 4);
      if (kind === 'conecap' && i % 2) delete sh.dir;
      const p = { x: rnd() * 20 - 10, y: 0, z: rnd() * 20 - 10 };
      const pad = (i % 3) * 0.15;
      const a1 = TL.hitTest(sh, p, pad), a2 = ref.hitTest(sh, p, pad);
      n++; if (a1 !== a2) { mism++; if (ex.length < 3) ex.push({ kind, p }); }
      // the handle's own contains() uses the same geometry
      if (i % 10 === 0) {
        const h = TL.attack(fake, { id: 'ht', cls: 'check', windup: 1, melee: false, sound: false, body: false, shape: sh });
        if (h) { if (h.contains(p, pad) !== a2) hm++; h.stop(); }
      }
    }
    PT.check('tells.hitTest equals the reference', mism === 0, { n, mism, ex });
    PT.check('TellHandle.contains equals the reference (1,000 handles)', hm === 0, hm);
    window.TX.clear();
  });

  await pg.run('T3 canAttack / punish / events', () => {
    const g = game, T = g.THREE, X = window.TX, TL = g.tells;
    X.reset();
    const pp = g.player.object.position;
    const ev = {}; for (const n of ['tellStart', 'tellCommit', 'tellEnd', 'tellFirst', 'punishWindow']) ev[n] = PT.events(n).length;
    TL.debug.resetSeen();
    const e = X.fake(pp.x, pp.z - 6);
    const h = TL.attack(e, { id: 'ev', tell: 'danger', cls: 'mobLight', windup: 0.9, shape: { kind: 'cone', pos: e.object.position, dir: new T.Vector3(0, 0, 1), r: 4, angle: 0.785 } });
    for (let i = 0; i < 80; i++) { g.step(1, 1 / 60); h.consumeStrike(); }
    const d = (n) => PT.events(n).length - ev[n];
    const st = PT.events('tellStart').slice(-1)[0]?.p;
    PT.check('tellStart payload {enemy, id, nameKo, tell, windup, pos, targetsPlayer}', st && st.enemy === e && st.id === 'ev' && st.tell === 'danger' && Math.abs(st.windup - 0.9) < 1e-6 && st.pos && st.targetsPlayer === true);
    PT.check('events: tellStart, tellCommit, tellEnd(strike), tellFirst once', d('tellStart') === 1 && d('tellCommit') === 1 && d('tellEnd') === 1 && d('tellFirst') === 1 &&
      PT.events('tellEnd').slice(-1)[0].p.reason === 'strike', { s: d('tellStart'), c: d('tellCommit'), e: d('tellEnd'), f: d('tellFirst') });
    const h2 = TL.attack(e, { id: 'ev2', tell: 'danger', cls: 'mobLight', windup: 0.9, shape: { kind: 'circle', r: 2 } });
    h2.stop();
    PT.check('stop → tellEnd {reason:cancel}; tellFirst not repeated', PT.events('tellEnd').slice(-1)[0].p.reason === 'cancel' && d('tellFirst') === 1);
    PT.check('tellFirst persisted in save section "tells"', !!g.save.sectionsSnapshot?.()?.tells?.seen?.danger, g.save.sectionsSnapshot?.()?.tells);
    // punish window
    TL.punish(e, 1.5, { mul: 1.4 });
    const pw = PT.events('punishWindow').slice(-1)[0]?.p;
    PT.check('punish → punishWindow {enemy, dur, mul} + e.vulnerableUntil/Mul', pw && pw.enemy === e && pw.dur === 1.5 && pw.mul === 1.4 &&
      Math.abs(e.vulnerableUntil - (g.enemyTime + 1.5)) < 1e-6 && e.vulnerableMul === 1.4);
    PT.check('canAttack false during the punish window; attack() returns null', TL.canAttack(e) === false && TL.attack(e, { id: 'x', cls: 'mobLight', windup: 1 }) === null);
    PT.step(1.6);
    PT.check('canAttack true after the window', TL.canAttack(e) === true);
    // off-screen melee rule: behind the camera and > 3 m away → refused; ranged still allowed; within 3 m allowed
    PT.look(0, -0.3); PT.step(0.05);
    const behind = X.fake(pp.x, pp.z + 7), near = X.fake(pp.x, pp.z + 2.5), front = X.fake(pp.x, pp.z - 7);
    PT.check('off-screen melee > 3 m: canAttack({melee}) false, attack() null', TL.canAttack(behind, { melee: true }) === false &&
      TL.attack(behind, { id: 'm', cls: 'mobLight', windup: 1, shape: { kind: 'circle', r: 1 } }) === null);
    const hr = TL.attack(behind, { id: 'r', cls: 'mobRanged', windup: 1, tell: 'projectile' });
    PT.check('off-screen ranged attack still allowed', !!hr); hr?.stop();
    PT.check('off-screen melee within 3 m allowed; on-screen melee allowed', TL.canAttack(near, { melee: true }) === true && TL.canAttack(front, { melee: true }) === true);
    // nextImpact
    const hn = TL.attack(front, { id: 'n', cls: 'mobLight', windup: 1.0, shape: { kind: 'circle', pos: pp.clone(), r: 2 } });
    PT.step(0.4);
    const ni = TL.nextImpact(pp);
    PT.check('nextImpact(pos) = remaining of the tell holding the player', Math.abs(ni - hn.remaining) < 1e-6 && ni > 0.5 && ni < 0.65, ni);
    hn.stop();
    PT.check('nextImpact Infinity with no tells', TL.nextImpact(pp) === Infinity);
    X.clear();
  });

  await pg.run('T3 pool / flashes / uploads / legacy adapter', () => {
    const g = game, T = g.THREE, X = window.TX, TL = g.tells;
    X.reset();
    const pp = g.player.object.position;
    const hs = [];
    for (let i = 0; i < 20; i++) hs.push(TL.attack(X.fake(pp.x + (i % 5) * 2 - 4, pp.z - 6 - Math.floor(i / 5) * 2), { id: 'p' + i, cls: 'mobLight', windup: 2, melee: false, sound: false,
      shape: { kind: i % 2 ? 'circle' : 'line', r: 1, len: 3, width: 1, dir: new T.Vector3(0, 0, 1) } }));
    PT.step(0.05);
    const pool = TL.debug.pool();
    const firstDecals = hs.slice(0, 16).every((h) => h && h.decal && h.decal.active), skipped = hs.slice(16).every((h) => h && !h.decal);
    PT.check('pool 16: the first 16 decals stay, the next 4 are skipped (never recycled), handles still time', pool.active === 16 && pool.max === 16 && firstDecals && skipped &&
      hs.slice(16).every((h) => h.dur === 2 && h.alive), pool);
    // uploads by tells with 16 decals + sprites live: overlay-only frame vs no tells
    const upl = () => { const m = PT.measure(() => { g.tells.update(1 / 60, 1 / 60); g.renderNow(); }, { groups: false }); return m.uploadBytes; };
    upl(); upl();                                   // first frames create the GPU buffers (bufferData), not per-frame cost
    const withT = upl();
    TL.debug.setVisible(false); g.renderNow(); const base = PT.measure(() => g.renderNow(), { groups: false }).uploadBytes; TL.debug.setVisible(true);
    PT.check('tells uploads ≤ 16 KB/frame (16 decals live)', withT - base <= 16384, { tellsBytes: withT - base });
    PT.note(`uploads with 16 decals: ${withT - base} B/frame`);
    for (const h of hs) h.stop();
    X.clear();
    // ≤ 3 Hz flashes: luminance of a decal's rim region sampled each frame over a 2 s tell
    const e = X.fake(pp.x, pp.z - 8);
    const h = TL.attack(e, { id: 'hz', tell: 'danger', cls: 'mobHeavy', windup: 2.0, melee: false, sound: false, shape: { kind: 'circle', pos: X.front(8), r: 3 } });
    const gl = g.renderer.getContext(), w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight, px = new Uint8Array(w * hh * 4);
    const lum = []; let mask = null;
    for (let i = 0; i < 44; i++) {                  // 20 Hz sampling (Nyquist for a 3 Hz limit), 2.2 s
      g.step(2, 1 / 60, false); g.step(1, 1 / 60, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (!mask) { mask = []; for (let k = 0; k < w * hh; k += 7) mask.push(k); }
      let s = 0; for (const k of mask) s += px[k * 4] + px[k * 4 + 1] + px[k * 4 + 2];
      lum.push(s / mask.length);
    }
    // count brightness peaks (rise then fall of > 4 % of the mean) per second
    let peaks = 0, dir = 0; const mean = lum.reduce((a, b) => a + b, 0) / lum.length, thr = mean * 0.04;
    let lastExt = lum[0];
    for (let i = 1; i < lum.length; i++) {
      if (dir >= 0 && lum[i] < lastExt - thr) { if (dir > 0) peaks++; dir = -1; lastExt = lum[i]; }
      else if (dir <= 0 && lum[i] > lastExt + thr) { dir = 1; lastExt = lum[i]; }
      else if ((dir >= 0 && lum[i] > lastExt) || (dir < 0 && lum[i] < lastExt)) lastExt = lum[i];
    }
    const hz = peaks / (lum.length / 20);
    PT.check('no flashes faster than 3 Hz', hz <= 3, { peaks, hz: +hz.toFixed(2) });
    h.stop(); X.clear();
    // legacy adapter (v3 full-angle degrees → rad half-angle)
    let done = 0;
    const lh = TL.telegraph({ shape: 'cone', pos: X.front(6), dir: new T.Vector3(0, 0, 1), r: 4, angle: 90, dur: 0.5, color: 'damage', onDone: () => done++ });
    const lrec = TL.debug.decals.fams.radial.recs.find((r) => r.active && r.clock === 'game');
    PT.check('telegraph(o): v3 handle {alive, progress, timeLeft, stop, setPos, setDir}', lh && lh.alive && typeof lh.stop === 'function' && typeof lh.setPos === 'function' && 'timeLeft' in lh);
    PT.check('telegraph(o): 90° full → 0.785 rad half-angle; damage → danger', lrec && Math.abs(lrec.S.angle - Math.PI / 4) < 1e-6 && lrec.tell === 0, lrec?.S?.angle);
    PT.step(0.6);
    PT.check('telegraph(o): onDone once, handle ends', done === 1 && !lh.alive, done);
    const pr = TL.telegraph({ shape: 'circle', pos: X.front(6), r: 2, dur: 1, parryable: true }), gr = TL.telegraph({ shape: 'circle', pos: X.front(4), r: 2, dur: 1, color: 'grab' });
    const recs = TL.debug.decals.fams.radial.recs.filter((r) => r.active && r.clock === 'game').map((r) => r.tell);
    PT.check('telegraph(o): parryable → parry, grab → unblockable', recs.includes(1) && recs.includes(2), recs);
    pr.stop(); gr.stop();
    const hha = TL.telegraph({ shape: 'cone', pos: X.front(6), dir: new T.Vector3(0, 0, 1), r: 4, halfAngle: 0.5, tell: 'unblockable', dur: 1 });
    const hr = TL.debug.decals.fams.radial.recs.filter((r) => r.active && r.clock === 'game' && r.S.kind === 'cone').sort((a, b) => b.serial - a.serial)[0];
    PT.check('telegraph(o): accepts halfAngle (rad) and tell', hr && Math.abs(hr.S.angle - 0.5) < 1e-6 && hr.tell === 2, hr ? [hr.S.angle, hr.tell] : TL.debug.decals.fams.radial.recs.filter((r) => r.active).map((r) => [r.clock, r.S.kind]));
    hha.stop(); PT.step(0.3);
    const n0 = TL.debug.pool().active;
    const hp = TL.telegraph({ shape: 'circle', pos: X.front(6), r: 3, dur: 0.5, owner: 'player' });
    PT.check('telegraph(o): owner player → timed handle, no threat-scene decal', hp && hp.alive && TL.debug.pool().active === n0);
    X.clear();
  });


  // ==================================================================================================== T1 renders
  await pg.run('T1 shapes render', () => {
    const g = game, T = g.THREE, X = window.TX, TL = g.tells;
    X.reset();
    const grass = []; g.scene.traverse((o) => { if (/^grass_/.test(o.name)) grass.push(o); });
    PT.check('plains with grass (grass meshes visible)', grass.length > 0 && grass.some((o) => o.visible), grass.length);
    // point on the ground ahead at ≈ 8 m from the camera
    const cam = g.camera.position, pp = g.player.object.position, fw = new T.Vector3(); g.camera.getWorldDirection(fw); fw.y = 0; fw.normalize();
    let best = null;
    for (let k = 0; k < 12; k += 0.1) { const q = new T.Vector3(pp.x + fw.x * k, 0, pp.z + fw.z * k); q.y = PT.groundHeight(q.x, q.z); const d = q.distanceTo(cam); if (!best || Math.abs(d - 8) < Math.abs(best.d - 8)) best = { q, d }; }
    const c = best.q, dir = fw.clone();
    const back = c.clone().addScaledVector(dir, -3);
    const shapes = {
      circle: { kind: 'circle', pos: c, r: 3 },
      ring: { kind: 'ring', pos: c, r: 5, inner: 2 },
      cone: { kind: 'cone', pos: back, dir, r: 4, angle: 0.785 },
      line: { kind: 'line', pos: back.clone().addScaledVector(dir, -1), dir, len: 8, width: 1.6 },
      capsule: { kind: 'capsule', pos: back, end: c.clone().addScaledVector(dir, 3), width: 1.6 },
      conecap: { kind: 'conecap', pos: back.clone().addScaledVector(dir, -1), end: c, width: 1.4, r: 3, angle: 0.6 },
    };
    const res = {};
    const e = X.fake(c.x, c.z - 30);
    for (const [k, sh] of Object.entries(shapes)) {
      const h = TL.attack(e, { id: 't1_' + k, tell: 'danger', cls: 'check', windup: 2, melee: false, sound: false, body: false, icon: false, shape: sh });
      PT.step(0.5);
      res[k] = PT.pixels.diff((on) => TL.debug.setVisible(on)).changed;
      h.stop(); PT.step(0.3);
    }
    PT.note(`camera distance ${best.d.toFixed(2)} m; changed px ${JSON.stringify(res)}`);
    PT.check('each shape alone at 8 m (960×540, grass on): ≥ 600 changed px', Object.values(res).every((v) => v >= 600), res);
    // winding regression: every family grid has triangle normals up; DoubleSide; mapping is orientation-preserving
    const D = TL.debug.decals; let down = 0, tris = 0;
    for (const f of Object.values(D.fams)) {
      const pos = f.geo.attributes.position, idx = f.geo.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i] * 3, b = idx[i + 1] * 3, cc = idx[i + 2] * 3, P = pos.array;
        const ux = P[b] - P[a], uz = P[b + 2] - P[a + 2], vx = P[cc] - P[a], vz = P[cc + 2] - P[a + 2];
        const ny = uz * vx - ux * vz;   // (u × v).y
        tris++; if (!(ny > 0)) down++;
      }
    }
    PT.check('winding regression: decal triangle normals up (normal.y > 0)', down === 0 && tris > 0, { tris, down });
    PT.check('winding regression: decal material DoubleSide, toneMapped off, fog off, depthWrite off', D.material.side === T.DoubleSide && D.material.toneMapped === false && D.material.fog === false && D.material.depthWrite === false);
    // heightField conformance: shader height lookup (JS replica) at decal vertices and cell centres vs world.getHeight
    PT.check('world.heightField used by the vertex shader', D.useHF === true && D.uniforms.uUseHF.value === 1);
    let maxErr = 0, worst = null;
    for (const [cx, cz] of [[-20, 45], [-35, 60], [10, 20], [40, -30], [-60, -10]]) {
      const r = 6, n = 32;
      for (let j = 0; j <= n * 2; j++) for (let i = 0; i <= n * 2; i++) {
        const x = cx + (i / (n * 2) * 2 - 1) * r, z = cz + (j / (n * 2) * 2 - 1) * r;
        // vertices at even (i, j); odd = midpoints, interpolated linearly from the vertices like the rasteriser
        let hv;
        if (i % 2 === 0 && j % 2 === 0) hv = D.heightAt(x, z);
        else { const s = r / n; const x0 = cx + (Math.floor(i / 2) / n * 2 - 1) * r, z0 = cz + (Math.floor(j / 2) / n * 2 - 1) * r;
          const fx = (x - x0) / (2 * s), fz = (z - z0) / (2 * s);
          const a = D.heightAt(x0, z0), b = D.heightAt(x0 + 2 * s, z0), c2 = D.heightAt(x0, z0 + 2 * s), d = D.heightAt(x0 + 2 * s, z0 + 2 * s);
          hv = fz >= fx ? a + (d - c2) * fx + (c2 - a) * fz : a + (b - a) * fx + (d - b) * fz; }
        const err = Math.abs(hv + 0.06 - g.world.getHeight(x, z) - 0.06);
        if (err > maxErr) { maxErr = err; worst = [x, z]; }
      }
    }
    PT.check('heightField conformance: decal surface within 0.1 m of the terrain (6 m decal, 5 spots)', maxErr <= 0.1, { maxErr: +maxErr.toFixed(3), worst });
    X.clear();
  });

  // ==================================================================================================== T2 occlusion
  await pg.run('T2 threat scene wins (branch form)', () => {
    const g = game, T = g.THREE, X = window.TX, TL = g.tells;
    X.reset();
    PT.note(`kit-p0a: ${g.vfx?.kit ? 'present (kit linework + legacy particles over the decals)' : 'absent (legacy particles used)'}`);
    const c = X.front(5.5), e = X.fake(c.x, c.z - 30);
    const mk = (sh) => TL.attack(e, { id: 't2', tell: 'danger', cls: 'check', windup: 3, melee: false, sound: false, body: false, icon: false, shape: sh });
    const h = mk({ kind: 'circle', pos: c, r: 3 });
    const hc = mk({ kind: 'cone', pos: c.clone().add(new T.Vector3(-3, 0, 2)), dir: new T.Vector3(1, 0, -1).normalize(), r: 4, angle: 0.6 });
    PT.step(0.6);
    const tellPx = () => PT.pixels.diff((on) => TL.debug.setVisible(on)).changed;
    // (a) legacy particles over the decals (additive + alpha), sampled over several frames
    const vfxObjs = []; g.scene.traverse((o) => { if (/^(vfx|kit)/i.test(o.name) || o.userData?.owner === 'player') vfxObjs.push(o); });
    const setVfx = (on) => vfxObjs.forEach((o) => { o.visible = on; });
    const ratios = [];
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 6; i++) {
        g.vfx.burst?.(c.clone().add(new T.Vector3((i - 3) * 0.8, 0.4, (k - 1.5) * 0.7)), { count: 40, color: [0xff7a30, 0xffe08a], speed: 2.5, size: 0.9, sizeEnd: 0.3, life: 0.8, additive: i % 2 === 0, up: 1 });
        g.vfx.burst?.(c.clone().add(new T.Vector3((i - 3) * 0.6, 0.2, 1)), { count: 30, color: [0x4aa8ff, 0x9ad8ff], speed: 1.5, size: 1.2, sizeEnd: 0.6, life: 0.9, up: 0.5 });
      }
      // kit-p0a linework (player rings / stars on the ground) over the same decals
      const K = g.vfx.kit;
      if (K?.line) for (let i = 0; i < 4; i++) {
        try { K.line({ shape: i % 2 ? 'ring' : 'star', points: 6, pos: c.clone().add(new T.Vector3((i - 1.5) * 1.2, 0, 0)), plane: 'ground', r: 1.6 + i * 0.4, width: 0.12, el: ['fire', 'ice', 'lightning', 'nature'][i], life: 1.5, owner: 'player', role: 'line' }); } catch (_) { /* */ }
      }
      g.step(6, 1 / 60, false);
      const on = tellPx(); setVfx(false); const off = tellPx(); setVfx(true);
      ratios.push(+(on / Math.max(1, off)).toFixed(3));
    }
    const pcount = g.vfx.stats?.()?.particles ?? null;
    PT.check('telegraph pixels with player VFX (legacy particles + kit linework) ÷ hidden ≥ 0.95 in every sample', ratios.every((r) => r >= 0.95), { ratios, particles: pcount });
    PT.step(1.0);
    // (b) grass on ÷ off
    const grass = []; g.scene.traverse((o) => { if (/^grass_/.test(o.name)) grass.push(o); });
    const gOn = tellPx(); grass.forEach((o) => { o.visible = false; }); const gOff = tellPx(); grass.forEach((o) => { o.visible = true; });
    PT.check('telegraph pixels with grass ÷ without ≥ 0.95', gOn / Math.max(1, gOff) >= 0.95, { gOn, gOff, ratio: +(gOn / Math.max(1, gOff)).toFixed(3) });
    // (c) a > 1 m wall in front: occluded decal pixels at 40 % ± 5 % alpha (ratio of decal contribution with/without the occlusion rule)
    const cam = g.camera.position;
    const mid = cam.clone().lerp(c, 0.55);
    const wall = new T.Mesh(new T.BoxGeometry(2.2, 2.6, 0.3), new T.MeshLambertMaterial({ color: 0x8a7a66 }));
    wall.position.set(mid.x, PT.groundHeight(mid.x, mid.z) + 1.3, mid.z); wall.lookAt(cam.x, wall.position.y, cam.z);
    g.scene.add(wall); wall.updateMatrixWorld(true);
    const wm = PT.pixels.mask(wall).mask;
    const occA = PT.pixels.diff((on) => TL.debug.setVisible(on), { thr: 0 });
    TL.debug.occlusion(false); const occB = PT.pixels.diff((on) => TL.debug.setVisible(on), { thr: 0 }); TL.debug.occlusion(true);
    let sa = 0, sb = 0, n = 0; const rs = [];
    for (let k = 0; k < wm.length; k++) {
      if (!wm[k]) continue;
      const i = k * 4;
      const da = Math.abs(occA.on.px[i] - occA.off.px[i]) + Math.abs(occA.on.px[i + 1] - occA.off.px[i + 1]) + Math.abs(occA.on.px[i + 2] - occA.off.px[i + 2]);
      const db = Math.abs(occB.on.px[i] - occB.off.px[i]) + Math.abs(occB.on.px[i + 1] - occB.off.px[i + 1]) + Math.abs(occB.on.px[i + 2] - occB.off.px[i + 2]);
      if (db > 30) { sa += da; sb += db; n++; rs.push(da / db); }
    }
    rs.sort((x, y) => x - y);
    g.scene.remove(wall); wall.geometry.dispose(); wall.material.dispose();
    // median per-pixel ratio: the wall's lowest metre is (by the rule) not an occluder, so the mean is biased upward
    const a = rs.length ? rs[rs.length >> 1] : 0;
    PT.check('behind a > 1 m wall the decal shows at 40 % ± 5 % alpha', n > 200 && Math.abs(a - 0.40) <= 0.05, { alpha: +a.toFixed(3), mean: +(sb ? sa / sb : 0).toFixed(3), px: n });
    // (d) bloom on/off: rim colour ΔRGB ≤ 8
    const bp = g.bloomPass; const keep = bp?.enabled;
    const rimPx = (buf, mask) => { const out = []; for (let k = 0; k < mask.length; k++) if (mask[k]) out.push(k); return out; };
    const A0 = PT.pixels.diff((on) => TL.debug.setVisible(on), { thr: 60 });
    const pts = rimPx(A0.on, A0.mask).filter((k) => { const i = k * 4; return A0.on.px[i] > 200 && A0.on.px[i + 1] < 90 && A0.on.px[i + 2] < 110; });   // rim red pixels
    if (bp) bp.enabled = true; const B1 = PT.pixels.render();
    if (bp) bp.enabled = false; const B0 = PT.pixels.render();
    if (bp) bp.enabled = keep;
    let dmax = 0;
    for (const k of pts) { const i = k * 4; dmax = Math.max(dmax, Math.abs(B1.px[i] - B0.px[i]), Math.abs(B1.px[i + 1] - B0.px[i + 1]), Math.abs(B1.px[i + 2] - B0.px[i + 2])); }
    PT.check('rim colour bloom on vs off: ΔRGB ≤ 8 (threat scene after the post chain)', !!bp && pts.length > 100 && dmax <= 8, { rimPx: pts.length, dmax });
    h.stop(); hc.stop(); X.clear();
  });

  // ==================================================================================================== T4 cues
  await pg.run('T4 body rims', () => {
    const g = game, T = g.THREE, X = window.TX, TL = g.tells;
    X.reset();
    const grass = []; g.scene.traverse((o) => { if (/^grass_/.test(o.name)) grass.push(o); });
    grass.forEach((o) => { o.visible = false; });
    const pp = g.player.object.position;
    const e = PT.spawnAt('bokoblin', pp.x + 0.5, pp.z - 5);
    PT.check('spawned a real enemy', !!e);
    if (!e) { grass.forEach((o) => { o.visible = true; }); return; }
    PT.armor(e); PT.step(0.1);
    e.object.position.set(pp.x + 0.5, PT.groundHeight(pp.x + 0.5, pp.z - 5), pp.z - 5); e.object.updateMatrixWorld(true);
    const h = TL.attack(e, { id: 'rim', tell: 'danger', cls: 'mobHeavy', windup: 3, melee: false, sound: false, icon: false });
    // advance the tell without moving the enemy: enemyTime only
    g.enemyTime += 2.0; TL.update(0, 1 / 60);
    PT.check('rim clone assigned (≤ 4 calls)', TL.debug.rims() >= 1 && TL.debug.rims() <= 4, TL.debug.rims());
    const srcMeshes = TL.debug.rimsApi.slots.filter((s) => s.active).map((s) => s.src);
    TL.debug.setVisible(false); const body = PT.pixels.mask(srcMeshes).mask; TL.debug.setVisible(true);   // body only (the clone follows its source's visibility)
    const rim = PT.pixels.diff((on) => TL.debug.setVisible(on), { thr: 30 });
    const W = rim.w, Hh = rim.h;
    let inside = 0, area = 0, per = 0, cov = 0;
    for (let y = 1; y < Hh - 1; y++) for (let x = 1; x < W - 1; x++) {
      const k = y * W + x;
      if (body[k]) { area++; if (rim.mask[k]) inside++; }
      if (body[k] && (!body[k - 1] || !body[k + 1] || !body[k - W] || !body[k + W])) {
        per++;
        let hit = false;
        for (let dy = -3; dy <= 3 && !hit; dy++) for (let dx = -3; dx <= 3 && !hit; dx++) { const q = (y + dy) * W + (x + dx); if (q >= 0 && q < body.length && !body[q] && rim.mask[q]) hit = true; }
        if (hit) cov++;
      }
    }
    PT.check('rim clone changes ≤ 15 % of the enemy interior', area > 300 && inside / area <= 0.15, { area, inside, share: +(inside / Math.max(1, area)).toFixed(3) });
    PT.check('rim clone outlines ≥ 60 % of the silhouette perimeter', per > 50 && cov / per >= 0.6, { per, cov, share: +(cov / Math.max(1, per)).toFixed(3) });
    PT.check('rim clone: matrixAutoUpdate false, shares geometry, skinned source → SkinnedMesh bound to the same skeleton',
      TL.debug.rimsApi.slots.filter((s) => s.active).every((s) => s.clone.matrixAutoUpdate === false && s.clone.geometry === s.src.geometry && (!s.src.isSkinnedMesh || s.clone.skeleton === s.src.skeleton)));
    h.stop(); PT.step(0.1);
    PT.check('rims released after the tell', TL.debug.rims() === 0);
    e.alive = false; e.object.visible = false; grass.forEach((o) => { o.visible = true; });
    X.clear();
  });

  await pg.run('T4 cues per kind', () => {
    const g = game, T = g.THREE, X = window.TX, TL = g.tells;
    X.reset();
    const pp = g.player.object.position;
    const e = X.fake(pp.x, pp.z - 6), c = X.front(6);
    const px = (fn) => PT.pixels.diff((on) => TL.debug.setVisible(on)).changed;
    // glint at lock (gold for parry)
    const hp = TL.attack(e, { id: 'g', tell: 'parry', cls: 'mobHeavy', windup: 1.2, melee: false, sound: false, shape: { kind: 'circle', pos: c, r: 2 } });
    PT.step(0.88);
    const gl = TL.debug.sprites('glint'), glS = TL.debug.spritesApi.recs.find((s) => s.active && s.kind === 'glint');
    PT.check('glint star appears at lock (gold for parry)', gl === 1 && glS && glS.cell === 'star' && glS.col.getHex() === 0xFFD23A, glS?.col?.getHexString?.());
    hp.stop(); X.clear();
    // icons
    const hu = TL.attack(e, { id: 'u', tell: 'unblockable', cls: 'unblockable', windup: 1.2, melee: false, sound: false, shape: { kind: 'circle', pos: c, r: 2 } });
    const hj = TL.attack(X.fake(pp.x + 3, pp.z - 6), { id: 'j', tell: 'jump', cls: 'boss', windup: 1.0, melee: false, sound: false, shape: { kind: 'circle', pos: X.front(8), r: 3 }, shockwave: { speed: 12, band: 0.25, maxR: 9 } });
    PT.step(0.1);
    const icons = TL.debug.spritesApi.recs.filter((s) => s.active && s.kind === 'icon').map((s) => s.cell).sort();
    PT.check('icons: ⚠ for unblockable, ⤒ for jump from windup start', icons.join() === 'jump,warn', icons);
    const iconPx = PT.pixels.diff((on) => { TL.debug.spritesApi.mesh.visible = on; }).changed;
    PT.check('icons render (changed px)', iconPx > 150, iconPx);
    PT.step(1.0); hj.consumeStrike(); hu.consumeStrike(); PT.step(0.2);
    const R = hj.shockwaveR();
    PT.check('jump: travelling shockwave ring (12 m/s) after the hit', R > 1.5 && R < 4 && TL.debug.pool().waves === 1, { R, pool: TL.debug.pool() });
    const wavePx = px();
    PT.check('shockwave renders', wavePx > 150, wavePx);
    PT.check('shockwaveHits(pos) on the band only', hj.shockwaveHits({ x: hj.wave.x + R, z: hj.wave.z }) && !hj.shockwaveHits({ x: hj.wave.x + R + 1, z: hj.wave.z }));
    PT.step(1.0);
    PT.check('shockwave ends at maxR', hj.shockwaveR() === -1 && TL.debug.pool().waves === 0);
    X.clear();
    // punish diamonds + text
    const ep = X.fake(pp.x, pp.z - 5);
    TL.punish(ep, 1.2, { mul: 1.3 }); PT.step(0.2);
    PT.check('punish: 4 rotating diamond sparkles + 공격 기회! text', TL.debug.sprites('punish') === 4 && TL.debug.sprites('punishText') === 1);
    const d0 = TL.debug.spritesApi.recs.find((s) => s.active && s.kind === 'punish'); const a0 = [d0.x, d0.z]; PT.step(0.2);
    PT.check('punish diamonds rotate around the enemy', Math.hypot(d0.x - a0[0], d0.z - a0[1]) > 0.1);
    PT.check('punish renders', px() > 100);
    PT.step(1.2);
    PT.check('punish sparkles end with the window', TL.debug.sprites('punish') === 0);
    // safe zone: mint ring + rising chevrons, in footprints; hazard hatch
    const sz = TL.safe({ pos: c, r: 2.5, dur: 3 });
    const hz = TL.hazard({ pos: X.front(10), r: 2, dur: 3, kind: 'fire', nameKo: '불길' });
    PT.step(0.4);
    const ch = TL.debug.spritesApi.recs.filter((s) => s.active && s.kind === 'safe');
    const y0 = ch.map((s) => s.y); PT.step(0.1);
    PT.check('safe: rising vertical chevrons over a ring', ch.length === 6 && ch.every((s) => s.cell === 'chevron') && TL.debug.pool().zones === 2);
    PT.check('safe chevrons rise (≥ 4 of 6 higher after 0.1 s; the others wrapped)', ch.filter((s, i) => s.y > y0[i]).length >= 4);
    PT.check('safe + hazard render', px() > 600);
    const F = TL.footprints();
    PT.check('footprints include the safe zone and the hazard (circles)', F.n === 2 && F.data[2] === 1 && F.data[10] === 1, Array.from(F.data.slice(0, 16)));
    const hzAt = TL.hazardAt(X.front(10)), hzOut = TL.hazardAt(X.front(14));
    PT.check('hazardAt(pos) → {kind, nameKo} inside, null outside', hzAt && hzAt.nameKo === '불길' && hzAt.kind === 'fire' && hzOut === null);
    sz.stop(); hz.stop(); PT.step(0.4);
    PT.check('zones end on stop()', TL.debug.pool().zones === 0);
    // projectile ground marker follows its object
    const orb = new T.Object3D(); orb.position.copy(c).add(new T.Vector3(0, 1.2, 0)); g.scene.add(orb);
    const mk = TL.projectile(orb, { r: 0.6 }); PT.step(0.1);
    PT.check('projectile marker (pool 12) renders', TL.debug.pool().markers === 1 && px() > 60);
    orb.position.x += 2; PT.step(0.05);
    const mrec = TL.debug.decals.fams.marker.recs.find((r) => r.active);
    PT.check('marker follows the orb on the ground', mrec && Math.abs(mrec.S.px - orb.position.x) < 0.05 && mrec.flat === 0);
    g.scene.remove(orb); PT.step(0.3);
    PT.check('marker ends when the orb is removed', TL.debug.pool().markers === 0);
    mk.stop(); X.clear();
    // P1: rising-edge ribbon on AoE rims > 6 m, visible at a grazing camera angle
    PT.look(0, -0.05); PT.step(0.05);
    const hb = TL.attack(X.fake(pp.x, pp.z - 12), { id: 'rb', tell: 'danger', cls: 'bossAoE', windup: 2, melee: false, sound: false, body: false, icon: false, shape: { kind: 'circle', pos: X.front(12), r: 8 } });
    PT.step(1.0);
    const rbPx = PT.pixels.diff((on) => { TL.debug.decals.fams.ribbon.mesh.visible = on; }).changed;
    PT.check('P1 ribbon: AoE r > 6 m gets a 0.35 m rising-edge ribbon (visible at a grazing angle)', TL.debug.pool().ribbons === 1 && rbPx > 200, { ribbons: TL.debug.pool().ribbons, px: rbPx });
    hb.stop(); PT.step(0.3);
    PT.check('ribbon ends with its tell', TL.debug.pool().ribbons === 0);
    X.clear();
  });

  await pg.run('T4 settings: teaching slow motion, strong emphasis', () => {
    const g = game, T = g.THREE, X = window.TX, TL = g.tells, S = g.settings;
    X.reset();
    const pp = g.player.object.position, c = X.front(6), e = X.fake(pp.x, pp.z - 6);
    S.set('teachSlowmo', true, { persist: false });
    TL.debug.resetSeen();
    const h = TL.attack(e, { id: 'teach', tell: 'danger', cls: 'mobLight', windup: 1.0, melee: false, sound: false, shape: { kind: 'circle', pos: c, r: 2 } });
    let got = false, scale = 1;
    for (let i = 0; i < 90 && !got; i++) { g.step(1, 1 / 60); if (g.timeScale.has('teach')) { got = true; scale = g.timeScale.value(); } }
    PT.check('first tell of a kind → teaching slow motion 0.4× near the hit (compensated)', got && Math.abs(scale - 0.4) < 1e-6 && g.timeScale.comp() > 2.4, { got, scale, rem: h.remaining });
    while (h.alive) { g.step(1, 1 / 60); h.consumeStrike(); }
    PT.step(0.8);
    const h2 = TL.attack(e, { id: 'teach2', tell: 'danger', cls: 'mobLight', windup: 1.0, melee: false, sound: false, shape: { kind: 'circle', pos: c, r: 2 } });
    let again = false;
    for (let i = 0; i < 80; i++) { g.step(1, 1 / 60); if (g.timeScale.has('teach')) again = true; h2.consumeStrike(); }
    PT.check('…only once per kind (no first-encounter timing bonus)', !again && Math.abs(h2.dur - 1.0) < 1e-6);
    S.set('teachSlowmo', false, { persist: false });
    X.clear();
    // strong emphasis: thicker rim (5 px), fill 0.28, icons on every tell
    const shp = { kind: 'circle', pos: c, r: 2.5 };
    const run = () => { const hh = TL.attack(e, { id: 'st', tell: 'danger', cls: 'check', windup: 2, melee: false, sound: false, body: false, shape: shp }); PT.step(0.3);
      const d = PT.pixels.diff((on) => TL.debug.setVisible(on)); const icons = TL.debug.sprites('icon'); hh.stop(); PT.step(0.3); return { d, icons }; };
    const lum = (r) => { let s2 = 0; for (let k = 0; k < r.d.mask.length; k++) if (r.d.mask[k]) { const i = k * 4; s2 += Math.abs(r.d.on.px[i] - r.d.off.px[i]) + Math.abs(r.d.on.px[i + 1] - r.d.off.px[i + 1]) + Math.abs(r.d.on.px[i + 2] - r.d.off.px[i + 2]); } return s2; };
    const a = run(); S.set('threatEmphasis', 'strong', { persist: false }); const b = run(); S.set('threatEmphasis', 'normal', { persist: false });
    PT.check('threatEmphasis strong: stronger decal (rim 5 px, fill 0.28) and an icon on every tell', lum(b) > lum(a) * 1.2 && a.icons === 0 && b.icons === 1, { normal: lum(a), strong: lum(b), icons: [a.icons, b.icons] });
    X.clear();
  });

  if (!only || only.test('T3 alloc')) {
    // CDP heap sampling while tells.update runs with 10 live tells, zones, markers and punish sparkles (render on)
    await pg0.eval(() => {
      const g = game, T = g.THREE, X = window.TX, TL = g.tells; X.reset();
      const pp = g.player.object.position;
      window.__allocSetup = () => {
        for (let i = 0; i < 10; i++) {
          const e = X.fake(pp.x + i - 5, pp.z - 7);
          TL.attack(e, { id: 'al' + i, tell: ['danger', 'parry', 'unblockable', 'jump'][i % 4], cls: 'mobLight', windup: 30, melee: false, sound: false,
            shape: { kind: ['circle', 'cone', 'line', 'capsule', 'ring'][i % 5], pos: e.object.position, dir: new T.Vector3(0, 0, 1), r: 2, len: 4, width: 1, end: new T.Vector3(pp.x, 0, pp.z) } });
        }
        TL.safe({ pos: X.front(3), r: 2, dur: 30 }); TL.hazard({ pos: X.front(9), r: 2, dur: 30 });
        const orb = new T.Object3D(); orb.position.copy(X.front(5)); g.scene.add(orb); TL.projectile(orb); window.__orb = orb;
        TL.punish(X.fake(pp.x, pp.z - 5), 30);
      };
      window.__allocSetup(); g.step(30, 1 / 60, false);
    });
    const cdp = await pg0.cdp();
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 1024 });
    const frames = 180;
    await pg0.eval((n) => { const g = game; for (let i = 0; i < n; i++) { window.__orb.position.x += 0.01; g.tells.update(1 / 60, 1 / 60); g.tells.preOverlay(); } }, frames);
    const prof = (await cdp.send('HeapProfiler.stopSampling')).profile;
    let tellsBytes = 0; const sites = {};
    const walk = (nd) => { const u = nd.callFrame.url || ''; if (/\/src\/tells/.test(u) && nd.selfSize) { tellsBytes += nd.selfSize; const k = `${nd.callFrame.functionName} ${u.replace(/^.*\/src\//, 'src/')}:${nd.callFrame.lineNumber + 1}`; sites[k] = (sites[k] || 0) + nd.selfSize; } for (const c of nd.children || []) walk(c); };
    walk(prof.head);
    const perFrame = tellsBytes / frames;
    PT.check('tells.update + preOverlay allocate ~0 per frame (≤ 64 B/frame sampled; §2.7)', perFrame <= 64, { bytesPerFrame: +perFrame.toFixed(1), top: Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 4) });
    const cpu = await pg0.eval(() => { const g = game, ts = []; for (let i = 0; i < 120; i++) { const t = performance.now(); g.tells.update(1 / 60, 1 / 60); ts.push(performance.now() - t); } ts.sort((a, b) => a - b);
      const out = { median: +ts[60].toFixed(3), p95: +ts[114].toFixed(3) }; g.scene.remove(window.__orb); window.TX.clear(); return out; });
    PT.note(`tells.update CPU with 10 tells + zones + marker + punish: median ${cpu.median} ms, p95 ${cpu.p95} ms`);
    PT.check('tells.update CPU ≤ 0.5 ms median (10 live tells)', cpu.median <= 0.5, cpu);
  }

  await pg.run('T4 footprints / colour-blind / perfect front / thumbs / budgets', async () => {
    const g = game, T = g.THREE, X = window.TX, TL = g.tells;
    X.reset();
    const pp = g.player.object.position, c = X.front(6);
    const e1 = X.fake(pp.x - 3, pp.z - 6), e2 = X.fake(pp.x + 3, pp.z - 6), e3 = X.fake(pp.x, pp.z - 9);
    const h1 = TL.attack(e1, { id: 'f1', cls: 'mobLight', windup: 2, melee: false, sound: false, shape: { kind: 'cone', pos: e1.object.position, dir: new T.Vector3(0, 0, 1), r: 4, angle: 0.6 } });
    const h2 = TL.attack(e2, { id: 'f2', cls: 'mobLight', windup: 2, melee: false, sound: false, body: false, shape: { kind: 'capsule', pos: e2.object.position, end: new T.Vector3(pp.x + 3, 0, pp.z), width: 1.2 } });
    const h3 = TL.attack(e3, { id: 'f3', cls: 'boss', windup: 2, melee: false, sound: false, body: false, shape: { kind: 'conecap', pos: e3.object.position, end: new T.Vector3(pp.x, 0, pp.z - 4), width: 1.2, r: 3, angle: 0.5 } });
    PT.step(0.1);
    const F = TL.footprints(), kinds = [];
    for (let i = 0; i < F.n; i++) kinds.push(F.data[i * 8 + 2]);
    const cone = Array.from({ length: F.n }, (_, i) => i).find((i) => F.data[i * 8 + 2] === 3 && Math.abs(F.data[i * 8] - e1.object.position.x) < 1e-3);
    PT.check('footprints(): true shapes — cone (r, dir, half-angle), capsule, conecap = capsule + cone, winding-up body circle r + 1 m',
      F.n === 5 && kinds.filter((k) => k === 3).length === 2 && kinds.filter((k) => k === 5).length === 2 && kinds.filter((k) => k === 1).length === 1 &&
      cone != null && Math.abs(F.data[cone * 8 + 3] - 4) < 1e-6 && Math.abs(F.data[cone * 8 + 6] - 0.6) < 1e-6 && Math.abs(F.data[cone * 8 + 5] - 1) < 1e-6 &&
      Math.abs(F.data[kinds.indexOf(1) * 8 + 3] - 1.6) < 1e-5, { n: F.n, kinds });
    PT.check('footprints() returns one reused object', TL.footprints() === F && F.data instanceof Float32Array && F.data.length === 64);
    const A = TL.active();
    PT.check('active(): reused records {enemy, id, nameKo, tell, pos, dur, progress, remaining, onScreen, behind, targetsPlayer}', A.length === 3 && TL.active() === A &&
      A.every((r) => r.pos.isVector3 && 'onScreen' in r && 'behind' in r && r.progress >= 0 && r.remaining > 0), A.length);
    // budgets with every kind live: decals ≤ 6 calls, rims ≤ 4, sprites 1, markers 1, total overlay ≤ 12; programs ≤ 4
    const orb = new T.Object3D(); orb.position.copy(c).setY(c.y + 1); g.scene.add(orb);
    const z1 = TL.safe({ pos: X.front(3), r: 1.5, dur: 3 }), z2 = TL.hazard({ pos: X.front(9), r: 2, dur: 3 }), m1 = TL.projectile(orb);
    const hj = TL.attack(X.fake(pp.x, pp.z - 7), { id: 'jb', tell: 'jump', cls: 'boss', windup: 1, melee: false, sound: false, shape: { kind: 'circle', pos: X.front(7), r: 3 } });
    TL.punish(e3, 3);
    PT.step(1.05); hj.consumeStrike(); PT.step(0.05);
    const m = PT.draws();
    const fams = Object.values(TL.debug.decals.fams).filter((f) => f.mesh.visible && f.name !== 'marker').length;
    PT.check('overlay calls ≤ 12 (decals ≤ 6 + rims ≤ 4 + 1 sprite batch + 1 marker batch)', m.overlayCalls <= 12 && fams <= 6 && TL.debug.rims() <= 4, { overlay: m.overlayCalls, decalCalls: fams, rims: TL.debug.rims() });
    PT.note(`overlay with every cue live: ${m.overlayCalls} calls, ${m.overlayTris} tris`);
    const progs = (g.renderer.info.programs || []).filter((p) => /tells-/.test(p.name || ''));
    PT.check('tells programs ≤ 4', progs.length >= 2 && progs.length <= 4, progs.map((p) => p.name));
    const mats = []; TL.debug.root.traverse((o) => { if (o.material) mats.push(o.material); });
    PT.check('no program-key flips: every tells material keeps its program (no defines)', mats.every((mm) => !mm.defines || Object.keys(mm.defines).length === 0));
    g.scene.remove(orb); z1.stop(); z2.stop(); m1.stop();
    for (const h of [h1, h2, h3]) h.stop();
    X.clear();
    // colour-blind: colours swap, shapes stay
    const shp = { kind: 'circle', pos: c, r: 2.5 };
    const run = (cb) => {
      g.settings.set('colorblind', cb, { persist: false });
      const h = TL.attack(e1, { id: 'cb', tell: 'parry', cls: 'check', windup: 2, melee: false, sound: false, body: false, icon: false, shape: shp });
      PT.step(0.5);
      const d = PT.pixels.diff((on) => TL.debug.setVisible(on), { thr: 8 });
      const rim = TL.debug.decals.uniforms.uRim.value[1].clone();
      h.stop(); PT.step(0.3);
      return { d, rim };
    };
    const n0 = run('off'), n1 = run('protan');
    g.settings.set('colorblind', 'off', { persist: false });
    const iou = PT.pixels.iou(n0.d.mask, n1.d.mask);
    PT.check('colour-blind protan: parry rim colour changes (#3A8DFF) …', n0.rim.getHex() === 0xFFD23A && n1.rim.getHex() === 0x3A8DFF, [n0.rim.getHexString(), n1.rim.getHexString()]);
    PT.check('… but the shape (dashed rim mask) stays: IoU ≥ 0.9', iou >= 0.9, +iou.toFixed(3));
    // P1: faint element glyph in the fill (vfx kit glyph atlas): visible, faint, same program, rim/outline untouched
    if (g.vfx?.kit?.glyph) {
      const U = TL.debug.decals.uniforms;
      const hg = TL.attack(e1, { id: 'gl', tell: 'danger', cls: 'check', windup: 3, melee: false, sound: false, body: false, icon: false, el: 'fire', shape: { kind: 'circle', pos: c, r: 3 } });
      PT.step(0.2);
      const rec = TL.debug.decals.fams.radial.recs.find((r) => r.active && r.owner === hg);
      const cols = U.uGlyphCols.value;
      const gd = PT.pixels.diff((on) => { U.uGlyphCols.value = on ? cols : 0; }, { thr: 6 });
      let dmax = 0, dsum = 0;
      for (let k = 0; k < gd.mask.length; k++) if (gd.mask[k]) { const i = k * 4; const d = Math.max(Math.abs(gd.on.px[i] - gd.off.px[i]), Math.abs(gd.on.px[i + 1] - gd.off.px[i + 1]), Math.abs(gd.on.px[i + 2] - gd.off.px[i + 2])); dmax = Math.max(dmax, d); dsum += d; }
      const withG = PT.pixels.diff((on) => TL.debug.setVisible(on)).changed;
      U.uGlyphCols.value = 0; const noG = PT.pixels.diff((on) => TL.debug.setVisible(on)).changed; U.uGlyphCols.value = cols;
      const progs = (g.renderer.info.programs || []).filter((p) => /tells-/.test(p.name || '')).length;
      PT.check('P1 element glyph: drawn in the fill from the kit atlas (el:\'fire\')', !!rec && rec.style >= 64 && cols === 4 && U.uGlyph.value === g.vfx.kit.glyph('fire').tex && gd.changed >= 80,
        { style: rec?.style, cols, px: gd.changed });
      PT.check('P1 element glyph: faint (mean ΔRGB ≤ 40, max ≤ 80) and the decal footprint is unchanged (±2 %)', gd.changed > 0 && dsum / gd.changed <= 40 && dmax <= 80 && Math.abs(withG - noG) <= 0.02 * noG,
        { mean: +(dsum / Math.max(1, gd.changed)).toFixed(1), max: dmax, withG, noG });
      PT.check('P1 element glyph: no new program (tells programs ≤ 4)', progs <= 4, progs);
      const hn = TL.attack(e1, { id: 'gl2', tell: 'danger', cls: 'check', windup: 3, melee: false, sound: false, body: false, icon: false, el: 'physical', shape: { kind: 'circle', pos: c, r: 3 } });
      const rn = TL.debug.decals.fams.radial.recs.find((r) => r.active && r.owner === hn);
      PT.check('P1 element glyph: none for physical / unknown elements', !!rn && rn.style < 64, rn?.style);
      hg.stop(); hn.stop(); PT.step(0.3);
    } else PT.note('P1 element glyph: no vfx kit on this page (fallback: no glyph)');
    // near-white front in the last perfect window
    const nearWhite = (buf, mask) => { let n = 0; for (let k = 0; k < mask.length; k++) if (mask[k]) { const i = k * 4, r = buf.px[i], gg = buf.px[i + 1], b = buf.px[i + 2]; if (r > 225 && gg > 205 && b > 200) n++; } return n; };
    const hf = TL.attack(e1, { id: 'pf', tell: 'danger', cls: 'mobHeavy', windup: 1.5, melee: false, sound: false, body: false, icon: false, shape: { kind: 'circle', pos: c, r: 3 } });
    PT.step(0.6);
    const d1 = PT.pixels.diff((on) => TL.debug.setVisible(on)); const w1 = nearWhite(d1.on, d1.mask);
    PT.step(0.75);   // remaining ≈ 0.15 s < 0.20 s perfect window
    const d2 = PT.pixels.diff((on) => TL.debug.setVisible(on)); const w2 = nearWhite(d2.on, d2.mask);
    PT.check('time front turns near-white (#FFF4F0) in the last perfect window only', w1 === 0 && w2 > 40, { before: w1, inWindow: w2, remaining: +hf.remaining.toFixed(3) });
    hf.stop(); X.clear();
    // renderThumb per kind
    const kinds2 = ['danger', 'parry', 'unblockable', 'jump', 'projectile', 'hazard', 'safe', 'punish'];
    const out = {};
    for (const k of kinds2) {
      const url = await TL.renderThumb(k, 96);
      let opaque = 0;
      if (url) { const im = new Image(); im.src = url; await im.decode(); const cv = document.createElement('canvas'); cv.width = 96; cv.height = 96; const x = cv.getContext('2d'); x.drawImage(im, 0, 0);
        const dd = x.getImageData(0, 0, 96, 96).data; for (let i = 3; i < dd.length; i += 4) if (dd[i] > 30) opaque++; }
      out[k] = opaque;
    }
    PT.check('renderThumb(kind, size) returns a rendered image per kind', Object.values(out).every((v) => v > 150), out);
    window.__tellThumb = await TL.renderThumb('danger', 160);
  });

  // ==================================================================================================== fallback without world.heightField
  if (!only || only.test('T1 fallback')) {
    const pf = await PT.boot('&cls=mage&level=30&stub=world', { w: 640, h: 360 });
    await pf.run('T1 fallback (world stub: no heightField → CPU 24×24 grids)', () => {
      const g = game, T = g.THREE, TL = g.tells, D = TL.debug.decals;
      g.settings.set('teachSlowmo', false, { persist: false });
      PT.check('fallback active (no heightField)', D.useHF === false && D.uniforms.uUseHF.value === 0);
      const p = g.player.object.position; PT.look(0, -0.42); PT.step(0.1);
      const e = { object: { position: new T.Vector3(p.x, 0, p.z - 6) }, alive: true, radius: 0.6, height: 1.6 };
      const h = TL.attack(e, { id: 'fb', tell: 'danger', cls: 'check', windup: 3, melee: false, sound: false, body: false, shape: { kind: 'circle', pos: new T.Vector3(p.x, 0, p.z - 4), r: 2.5 } });
      PT.step(0.3);
      const px = PT.pixels.diff((on) => TL.debug.setVisible(on)).changed;
      PT.check('fallback decal renders (≥ 600 px at 640×360)', px >= 600, px);
      const tex = D.uniforms.uGrid.value; let v0 = tex.version;
      h.setPos(new T.Vector3(p.x + 0.05, 0, p.z - 4)); PT.step(0.05);
      const small = tex.version - v0; v0 = tex.version;
      h.setPos(new T.Vector3(p.x + 0.5, 0, p.z - 4)); PT.step(0.05);
      const big = tex.version - v0;
      PT.check('grid rebuilt only when the decal moves > 0.1 m', small === 0 && big >= 1, { small, big });
      const calls = Object.values(D.fams).filter((f) => f.mesh.visible).length;
      PT.check('fallback keeps the instanced families (≤ 16 calls; here ' + calls + ')', calls <= 16);
      h.stop();
    });
    PT.check('fallback page: no console errors', pf.errors().length === 0, pf.errors().slice(0, 3));
    await pf.close();
  }

  // ==================================================================================================== static greps (rule 5 / rule 6)
  {
    const fs = require('fs'), path = require('path');
    const dir = path.join(PT.root, 'src', 'tells');
    const files = ['src/tells.js', ...fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => 'src/tells/' + f)];
    const white = [], korean = [], emissive = [];
    for (const f of files) {
      const txt = fs.readFileSync(path.join(PT.root, f), 'utf8');
      if (/0xffffff\b|#ffffff\b|#fff\b/i.test(txt)) white.push(f);
      if (f !== 'src/tells/text.js' && /[\uAC00-\uD7A3]/.test(txt.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))) korean.push(f);
      const m = txt.match(/emissive(?:Intensity|Mul)?\s*[:=]\s*([\d.]+)/gi) || [];
      for (const x of m) if (parseFloat(x.split(/[:=]/)[1]) > 1.2) emissive.push(f + ': ' + x);
    }
    PT.check('rule 5: no 0xffffff effect colours and no emissive multiplier > 1.2 in src/tells*', white.length === 0 && emissive.length === 0, { white, emissive });
    PT.check('rule 6: Korean world text only in src/tells/text.js', korean.length === 0, korean);
  }

  await pg.close();
};
