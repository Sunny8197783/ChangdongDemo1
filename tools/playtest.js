// Automated end-to-end play-test.
// Usage: node tools/playtest.js [--out dir] [--quick]
// Boots ?test=1 in headless Chromium, freezes the rAF loop and drives the game with game.step() (fixed 60 Hz,
// no rendering except for screenshots), so it runs at CPU speed even on SwiftShader.
// Flow: walk → cycle 5 elements → basic/heavy/ultimate of each at dummies (real input path) → deliberate
// reactions & zone fusions → camp0 fight → clear camps → boss → victory. Logs event counts, reaction ids and errors.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(__dirname, '..');
const outDir = opt('--out', '/tmp/claude-0/-home-user/73b5b35e-096f-5c23-8d86-2f6619326bcd/scratchpad');
const noShots = args.includes('--noshots');
const port = 8000 + Math.floor(Math.random() * 900);
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(port);

// ---------------- in-page helpers ----------------
function installHelpers() {
  const g = window.game, T = g.THREE;
  const PT = window.PT = { counts: {}, reactions: {}, combos: {}, log: [], fails: [] };
  const emit = g.events.emit.bind(g.events);
  g.events.emit = (n, p = {}) => {
    PT.counts[n] = (PT.counts[n] || 0) + 1;
    if (n === 'reaction') PT.reactions[p.id] = (PT.reactions[p.id] || 0) + 1;
    if (n === 'zoneCombo') PT.combos[p.id] = (PT.combos[p.id] || 0) + 1;
    return emit(n, p);
  };
  g.freeze(true);
  PT.step = (sec) => g.step(Math.max(1, Math.round(sec * 60)), 1 / 60);
  PT.note = (s) => PT.log.push(s);
  PT.heal = () => { const p = g.player; p.hp = p.maxHp; p.mp = p.maxMp; p.stamina = p.maxStamina; };
  PT.tp = (x, z) => {
    const p = g.player.object.position; p.set(x, g.world.getHeight(x, z) + 0.05, z);
    g.player.entity.velocity?.set(0, 0, 0); PT.step(0.2);
  };
  PT.center = (e) => (g.combat.getCenter ? g.combat.getCenter(e, new T.Vector3()) : e.object.position.clone().setY(e.object.position.y + 1));
  // Aim the camera crosshair at a world point (two passes to account for the over-shoulder offset).
  PT.lookAt = (pt) => {
    for (let i = 0; i < 3; i++) {
      const c = g.camera.position;
      const dx = pt.x - c.x, dy = pt.y - c.y, dz = pt.z - c.z;
      const h = Math.hypot(dx, dz);
      g.player.setLook(Math.atan2(-dx, -dz), Math.atan2(dy, h));
      g.step(2, 1 / 60);
    }
  };
  PT.clearSt = (e) => { for (const k of Object.keys(e.statuses || {})) g.combat.clearStatus(e, k); };
  PT.clearZones = () => { for (const z of g.spells.zones || []) z.time = 0; PT.step(1.2); };
  PT.dummy = () => g.enemies.list.find((e) => e.isDummy && e.alive);
  PT.cast = (el, kind, opts = {}) => g.spells.cast(el, kind, { free: true, ...opts });
  PT.reactionCount = (id) => PT.reactions[id] || 0;
  PT.comboCount = (id) => PT.combos[id] || 0;
  // run seq of [el, kind, waitSec] at target e, return whether reaction id fired
  PT.tryReaction = (id, e, seq, isCombo = false) => {
    const before = isCombo ? PT.comboCount(id) : PT.reactionCount(id);
    const trace = [];
    const off = g.events.on('damage', (p) => { if (p.target === e) trace.push(`${p.element}:${p.reaction?.id || p.reaction || '-'}`); });
    for (const [el, kind, wait] of seq) {
      if (typeof el === 'function') { el(); PT.step(wait ?? 0.2); continue; }
      if (e?.alive) PT.lookAt(PT.center(e));
      const okCast = PT.cast(el, kind, { charge: 1 });
      trace.push(`cast ${el}_${kind}${okCast ? '' : ' FAILED'}`);
      PT.step(wait ?? 0.6);
    }
    off();
    const ok = (isCombo ? PT.comboCount(id) : PT.reactionCount(id)) > before;
    PT.note(`${isCombo ? 'combo' : 'reaction'} ${id}: ${ok ? 'OK' : 'NOT TRIGGERED [' + trace.slice(0, 12).join(' ') + ']'}`);
    if (!ok) PT.fails.push(id);
    return ok;
  };
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
  const t0 = Date.now();
  const stamp = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
  await p.goto(`http://localhost:${port}/?test=1${opt('--url', '')}`);
  await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 90000 });
  await p.waitForTimeout(1500);
  await p.evaluate(installHelpers);
  const run = async (label, fn) => {
    try { const r = await p.evaluate(fn); console.log(`[${stamp()}] ${label}:`, JSON.stringify(r)); return r; }
    catch (e) { console.log(`[${stamp()}] ${label} FAILED:`, e.message.split('\n')[0]); logs.push(`[harness] ${label}: ${e.message}`); return null; }
  };
  const shot = async (name) => {
    if (noShots) return;
    try {
      await p.evaluate(() => { game.step(1, 1 / 60, false); game.renderNow(); });
      await p.screenshot({ path: path.join(outDir, `pt_${name}.png`), timeout: 120000 });
      console.log(`[${stamp()}] shot pt_${name}.png`);
    } catch (e) { console.log('shot failed', name, e.message.split('\n')[0]); }
  };

  if (opt('--eval')) {
    await run('eval', new Function(`return (async()=>{${opt('--eval')}})()`));
    if (opt('--shot')) await shot(opt('--shot'));
    console.log(logs.join('\n')); await b.close(); server.close(); return;
  }
  await run('boot', () => ({ stubbed: game.stubbed, state: game.state, entities: game.entities.length, enemies: game.enemies.list.length }));
  await shot('01_spawn');

  // ---- 1. walk / sprint / jump / blink ----
  await run('walk', () => {
    const p0 = game.player.object.position.clone();
    game.input.simulate({ keys: { KeyW: true } }); PT.step(1.5);
    game.input.simulate({ keys: { KeyW: true, ShiftLeft: true } }); PT.step(1.0);
    game.input.simulate({ keys: { KeyW: true, Space: true } }); PT.step(0.1);
    game.input.simulate({ keys: { KeyW: true } }); PT.step(0.8);
    game.input.simulate({ keys: { KeyW: true, KeyQ: true } }); PT.step(0.1);
    game.input.simulate({ keys: {} }); PT.step(0.8);
    const p1 = game.player.object.position;
    return { moved: +p0.distanceTo(p1).toFixed(1), y: +p1.y.toFixed(2), ground: +game.world.getHeight(p1.x, p1.z).toFixed(2), stamina: Math.round(game.player.stamina) };
  });

  // ---- 2. element cycle + all 15 spells through the real input path at the training dummies ----
  await run('elements+spells via input', () => {
    const d = PT.dummy(); const dp = d.object.position;
    PT.tp(dp.x + 3, dp.z + 12);
    const res = {};
    for (let i = 0; i < 5; i++) {
      PT.heal(); game.spells.resetCooldowns?.();
      const code = 'Digit' + (i + 1);
      game.input.simulate({ keys: { [code]: true } }); PT.step(0.05); game.input.simulate({}); PT.step(0.05);
      const el = game.spells.element;
      PT.lookAt(PT.center(d));
      const casts0 = PT.counts.spellCast || 0;
      game.input.simulate({ mouse: { 0: true } }); PT.step(0.05); game.input.simulate({}); PT.step(0.5);
      PT.lookAt(PT.center(d));
      game.input.simulate({ mouse: { 2: true } }); PT.step(1.3); game.input.simulate({}); PT.step(0.8);
      PT.lookAt(PT.center(d));
      game.input.simulate({ keys: { KeyF: true } }); PT.step(0.05); game.input.simulate({}); PT.step(i === 0 ? 2.5 : 1.5);
      res[el] = (PT.counts.spellCast || 0) - casts0;
      Object.values(d.statuses || {}).length && PT.clearSt(d);
    }
    return { castsPerElement: res, damageEvents: PT.counts.damage || 0 };
  });
  await shot('02_training');

  // ---- 3. deliberate reactions on a dummy ----
  await run('reactions', () => {
    const d = PT.dummy(); const dp = d.object.position;
    PT.tp(dp.x + 2, dp.z + 10);
    game.spells.setElement?.(0);
    const water = () => game.spells.spawnZone('water', d.object.position.clone(), { radius: 3, duration: 3 });
    const home = d.object.position.clone(); home.x -= 4;
    const reset = (e = d) => {
      if (e !== d) { e.object.position.set(home.x, game.world.getHeight(home.x, home.z), home.z); e.velocity.set(0, 0, 0); }
      PT.clearZones(); PT.clearSt(e); game.spells.resetCooldowns?.(); PT.heal(); PT.step(0.3); };
    const R = PT.tryReaction;
    // light, real enemy for launch / freeze reactions (dummies are too heavy to launch)
    const mob = () => {
      const pos = d.object.position.clone(); pos.x -= 4;
      const m = game.enemies.spawn('chuchu', pos, {}); m.hp = m.maxHp = 5000; return m;
    };
    let m = mob();
    reset(m); R('updraft', m, [['wind', 'heavy', 0.3], ['wind', 'basic', 0.8]]);
    PT.step(3); reset(m); R('skyslam', m, [['wind', 'heavy', 0.3], ['earth', 'basic', 0.9]]);
    PT.step(3); reset(m); R('shatter', m, [['ice', 'heavy', 0.5], ['earth', 'basic', 0.7]]);
    game.combat.dealDamage(m, { amount: 99999, element: 'fire', source: 'player', point: PT.center(m), noReaction: true });
    reset(); R('superconduct', d, [[() => game.combat.applyStatus(d, 'chilled', 3), 0, 0.1], ['lightning', 'basic', 0.4]]);
    reset(); R('melt', d, [['ice', 'basic', 0.5], ['ice', 'basic', 0.5], ['fire', 'basic', 0.6]]);
    reset(); R('evaporate', d, [[water, 0, 0.8], ['fire', 'basic', 0.6]]);
    reset(); R('flashfreeze', d, [[() => game.combat.applyStatus(d, 'wet', 4), 0, 0.2], ['ice', 'basic', 0.6]]);
    reset(); R('overload', d, [['fire', 'basic', 0.6], ['lightning', 'basic', 0.4]]);
    reset(); R('swirl', d, [['fire', 'basic', 0.6], ['wind', 'basic', 0.6]]);
    reset(); R('magma', d, [['fire', 'basic', 0.6], ['earth', 'basic', 0.7]]);
    reset(); R('electrocute', d, [['lightning', 'ultimate', 2.0], ['lightning', 'basic', 0.4]]);
    PT.step(2);
    return { reactions: PT.reactions };
  });
  await shot('03_reactions');

  // ---- 4. zone fusions ----
  await run('fusions', () => {
    const d = PT.dummy(); const dp = d.object.position.clone();
    const at = (dx = 0, dz = 0) => new game.THREE.Vector3(dp.x + dx, game.world.getHeight(dp.x + dx, dp.z + dz), dp.z + dz);
    const zone = (type, r = 3.5, dur = 5) => () => game.spells.spawnZone(type, at(), { radius: r, duration: dur });
    const reset = () => { PT.clearZones(); for (const e of game.entities) if (e.team === 'enemy') PT.clearSt(e); game.spells.resetCooldowns?.(); PT.heal(); PT.step(0.5); };
    const R = (id, seq) => PT.tryReaction(id, d, seq, true);
    PT.tp(dp.x + 2, dp.z + 11);
    reset(); R('fire_tornado', [['wind', 'ultimate', 0.6], ['fire', 'basic', 1.0]]);
    reset(); R('blizzard', [['wind', 'ultimate', 0.6], ['ice', 'basic', 1.0]]);
    reset(); R('storm_tornado', [['wind', 'ultimate', 0.6], ['lightning', 'heavy', 1.0]]);
    reset(); R('steam_burst', [[zone('ice'), 0, 0.3], ['fire', 'basic', 0.8]]);
    reset(); R('electro_water', [[zone('water'), 0, 0.3], ['lightning', 'basic', 0.6]]);
    reset(); R('freeze_water', [[zone('water'), 0, 0.3], ['ice', 'basic', 0.8]]);
    reset(); R('magma', [[zone('fire'), 0, 0.3], ['earth', 'basic', 0.8]]);
    reset(); R('fire_wave', [['fire', 'heavy', 1.0], ['wind', 'basic', 1.0]]);
    reset(); R('infusion', [[zone('storm', 4, 6), 0, 0.3], ['earth', 'basic', 1.0]]);
    PT.step(1);
    return { combos: PT.combos, fails: PT.fails };
  });
  await shot('04_fusions');

  // Any REACTIONS entry never seen: force it with direct combat.dealDamage sequences on the dummy.
  await run('reaction coverage', () => {
    const C = game.combat, d = PT.dummy();
    const seen = new Set([...Object.keys(PT.reactions), ...Object.keys(PT.combos)]);
    const missing = C.REACTIONS.filter((r) => !seen.has(r.id)).map((r) => r.id);
    const hit = (el, extra = {}) => C.dealDamage(d, { amount: 10, element: el, source: 'player', point: PT.center(d), ...extra });
    const forced = {};
    const direct = {
      melt: () => { C.applyStatus(d, 'chilled', 3); hit('fire'); },
      evaporate: () => { C.applyStatus(d, 'wet', 3); hit('fire'); },
      flashfreeze: () => { C.applyStatus(d, 'wet', 3); hit('ice'); },
      electrocute: () => { C.applyStatus(d, 'wet', 3); hit('lightning'); },
      superconduct: () => { C.applyStatus(d, 'chilled', 3); hit('lightning'); },
      overload: () => { C.applyStatus(d, 'burning', 3); hit('lightning'); },
      swirl: () => { C.applyStatus(d, 'burning', 3); hit('wind'); },
      shatter: () => { C.applyStatus(d, 'frozen', 3); hit('earth'); },
      magma: () => { C.applyStatus(d, 'burning', 3); hit('earth'); },
      updraft: () => { C.applyStatus(d, 'airborne', 2); hit('wind'); },
      skyslam: () => { C.applyStatus(d, 'airborne', 2); hit('earth'); },
    };
    for (const id of missing) {
      PT.clearSt(d);
      const b = PT.reactionCount(id) + PT.comboCount(id);
      try { direct[id]?.(); } catch (e) { forced[id] = 'error ' + e.message; continue; }
      PT.step(0.3);
      forced[id] = PT.reactionCount(id) + PT.comboCount(id) > b ? 'OK(direct)' : 'FAILED';
    }
    return { missingViaSpells: missing, forced };
  });

  // ---- 5. camp0 fight with real spells ----
  await run('camp0 fight', () => {
    const W = game.world, E = game.enemies;
    const camp = W.camps[0]; const cp = camp.position;
    const members = E.list.filter((e) => !e.isDummy && e.alive && e.object.position.distanceTo(cp) < camp.radius + 6);
    PT.tp(cp.x + 16, cp.z + 4); PT.heal();
    let killsBefore = E.kills, casts = 0;
    const order = ['fire', 'ice', 'lightning', 'wind', 'earth'];
    for (let round = 0; round < 40; round++) {
      const target = members.find((e) => e.alive);
      if (!target) break;
      PT.heal(); game.spells.resetCooldowns?.();
      PT.lookAt(PT.center(target));
      const el = order[round % 5];
      const kind = round % 7 === 6 ? 'ultimate' : round % 3 === 2 ? 'heavy' : 'basic';
      if (PT.cast(el, kind, { charge: 1 })) casts++;
      PT.step(0.7);
    }
    const alive = members.filter((e) => e.alive).length;
    return { members: members.length, killedBySpells: E.kills - killsBefore, aliveLeft: alive, casts, playerHp: Math.round(game.player.hp), inCombat: E.inCombat };
  });
  await shot('05_camp0');
  await run('finish camp0', () => {
    const W = game.world, E = game.enemies, cp = W.camps[0].position;
    for (const e of E.list.slice()) if (!e.isDummy && e.alive && e.object.position.distanceTo(cp) < 30)
      game.combat.dealDamage(e, { amount: 99999, element: 'fire', source: 'player', point: PT.center(e), noReaction: true });
    PT.step(3);
    return { obj: E.getObjective().campsCleared, campCleared: PT.counts.campCleared || 0 };
  });

  // ---- 6. clear remaining camps → boss spawn ----
  await run('clear camps', () => {
    const E = game.enemies;
    for (let pass = 0; pass < 4; pass++) {
      for (const e of E.list.slice()) if (!e.isDummy && !e.isBoss && e.alive)
        game.combat.dealDamage(e, { amount: 99999, element: 'earth', source: 'player', point: PT.center(e), noReaction: true });
      PT.step(1.5);
    }
    PT.step(4);
    const o = E.getObjective();
    return { phase: o.phase, campsCleared: o.campsCleared, campsTotal: o.campsTotal, boss: !!E.boss, bossSpawn: PT.counts.bossSpawn || 0 };
  });

  // ---- 7. boss fight ----
  await run('boss approach', () => {
    const A = game.world.bossArena, b = game.enemies.boss;
    if (!b) return { boss: false };
    PT.tp(A.position.x, A.position.z + 16); PT.heal();
    PT.step(6); // entrance + roar
    PT.lookAt(PT.center(b));
    return { bossHp: b.hp, maxHp: b.maxHp, pos: b.object.position.toArray().map((v) => +v.toFixed(1)), ground: +game.world.getHeight(b.object.position.x, b.object.position.z).toFixed(1), inv: !!b.invulnerable };
  });
  await shot('06_boss');
  await run('boss fight', () => {
    const b = game.enemies.boss; if (!b) return { boss: false };
    const hp0 = b.hp; const order = ['fire', 'ice', 'lightning', 'wind', 'earth'];
    for (let i = 0; i < 25 && b.alive; i++) {
      PT.heal(); game.spells.resetCooldowns?.();
      PT.lookAt(PT.center(b));
      PT.cast(order[i % 5], i % 5 === 4 ? 'ultimate' : i % 2 ? 'heavy' : 'basic', { charge: 1 });
      PT.step(0.8);
    }
    return { hp0, hp: Math.round(b.hp), maxHp: b.maxHp, phase2: b.phase ?? null, playerHp: Math.round(game.player.hp), playerHurt: PT.counts.playerHurt || 0 };
  });
  await shot('07_boss_fight');
  await run('boss kill → victory', () => {
    const b = game.enemies.boss; if (!b) return { boss: false };
    for (let i = 0; i < 30 && b.alive; i++) {
      if (!b.invulnerable) game.combat.dealDamage(b, { amount: 500, element: 'earth', source: 'player', point: PT.center(b), noReaction: true });
      PT.step(0.5);
    }
    // v2: the story plays the ending cutscene (~42 s) before the victory screen
    let endingCut = false;
    for (let i = 0; i < 140 && game.state !== 'victory'; i++) { if (game.state === 'cutscene') endingCut = true; PT.step(0.5); }
    return { bossAlive: b.alive, state: game.state, endingCutscene: endingCut, bossDefeated: PT.counts.bossDefeated || 0, victory: PT.counts.victory || 0 };
  });
  await p.waitForTimeout(300);
  await shot('08_victory');

  const summary = await run('summary', () => ({
    counts: PT.counts, reactions: PT.reactions, combos: PT.combos, notes: PT.log, fails: PT.fails,
    allReactionIds: game.combat.REACTIONS.map((r) => r.id),
    discovered: [...game.combat.discovered],
    entities: game.entities.length, sceneChildren: game.scene.children.length,
    vfx: game.vfx.stats?.(),
  }));
  if (summary) {
    const seen = new Set([...Object.keys(summary.reactions), ...Object.keys(summary.combos)]);
    const never = summary.allReactionIds.filter((id) => !seen.has(id));
    console.log('\nREACTIONS NEVER TRIGGERED:', never.length ? never.join(', ') : 'none');
  }
  console.log('\nCONSOLE:', logs.length ? '\n' + logs.slice(0, 60).join('\n') : 'no errors/warnings');
  await b.close(); server.close();
})();
