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
    X.clear();
  });

  await pg.close();
};
