// v2/v3 automated play-test: story (wake → class panel pick (검사) → 각인 의식 → training (v3 steps) → updraft → camps →
// golem boss + cinematic finisher → golem defeated → reveal stage (v3: not victory)), sword combat per element (legacy
// keymap), settings, performance.
// Usage: node tools/playtest2.js [--only story,sword,settings,perf] [--out dir] [--noshots]
// Same harness approach as tools/playtest.js: freeze the rAF loop and drive everything with game.step().
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(__dirname, '..');
const outDir = opt('--out', '/tmp/claude-0/-home-user/73b5b35e-096f-5c23-8d86-2f6619326bcd/scratchpad');
const noShots = args.includes('--noshots');
const only = (opt('--only', 'story,sword,settings,perf')).split(',');
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
  const PT = window.PT = { counts: {}, log: [], fails: [], hitstops: [], trace: [] };
  const emit = g.events.emit.bind(g.events);
  g.events.emit = (n, p = {}) => { PT.counts[n] = (PT.counts[n] || 0) + 1; return emit(n, p); };
  g.freeze(true);
  PT.step = (sec) => g.step(Math.max(1, Math.round(sec * 60)), 1 / 60);
  PT.check = (name, ok, info) => { PT.log.push(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`); if (!ok) PT.fails.push(name); return ok; };
  PT.heal = () => { const p = g.player; p.hp = p.maxHp; p.mp = p.maxMp; p.stamina = p.maxStamina; };
  PT.ground = (x, z) => (g.world.getGroundHeight ? g.world.getGroundHeight(x, z) : g.world.getHeight(x, z));
  PT.tp = (x, z, settle = 0.2) => {
    const p = g.player.object.position; p.set(x, PT.ground(x, z) + 0.05, z);
    g.player.entity.velocity?.set(0, 0, 0); PT.step(settle);
  };
  PT.center = (e) => (g.combat.getCenter ? g.combat.getCenter(e, new T.Vector3()) : e.object.position.clone().setY(e.object.position.y + 1));
  PT.lookAt = (pt) => {
    for (let i = 0; i < 3; i++) {
      const c = g.camera.position;
      const dx = pt.x - c.x, dy = pt.y - c.y, dz = pt.z - c.z;
      g.player.setLook(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
      g.step(2, 1 / 60);
    }
  };
  PT.face = (pt) => { const p = g.player.object.position; g.player.setFacing?.(Math.atan2(pt.x - p.x, pt.z - p.z)); PT.lookAt(pt); };
  PT.press = (keys, hold = 0.05, after = 0.05) => { g.input.simulate({ keys }); PT.step(hold); g.input.simulate({}); PT.step(after); };
  PT.click = (btn, hold = 0.05, after = 0.05) => { g.input.simulate({ mouse: { [btn]: true } }); PT.step(hold); g.input.simulate({}); PT.step(after); };
  PT.dummy = () => g.enemies.list.find((e) => e.isDummy && e.alive);
  // Drive the open dialogue to its end. picker(choiceTexts) → index.
  PT.runDialogue = (picker = () => 0, max = 400) => {
    const S = g.story; const picks = [];
    for (let i = 0; i < max; i++) {
      const d = S.getDialogueState();
      if (!d) { if (g.state !== 'dialogue') break; PT.step(0.1); continue; }
      if (d.choices) { const k = picker(d.choices); picks.push(d.choices[k]); S.choose(k); PT.step(0.15); continue; }
      S.advance(); PT.step(0.08);
    }
    PT.step(0.3);
    return picks;
  };
  // hitstop probe (v4, PLAN §7.9): at every damage event, the hitstop granted for this hit in game.debug.hitstopLog()
  // (combat calls hitFeel → game.hitstop before it emits 'damage') and the hit's castId (captured from combat.dealDamage).
  // v4 expectation: the first hit of each castId logs a granted hitstop ≥ 0.025 s; DoT ticks (and, with the v4 vfx kit,
  // later hits of the same castId) log none. Hits without a castId (legacy callers) each count as their own cast.
  PT.ticks = 0; PT.tickHs = 0; PT.hits = [];
  let curCid = null, lastSeq = 0;
  const C = g.combat;
  if (C?.dealDamage) { const orig = C.dealDamage; C.dealDamage = function (t, hit) { const prev = curCid; curCid = hit?.castId ?? null; try { return orig.apply(this, arguments); } finally { curCid = prev; } }; }
  // largest granted hitstop logged since the previous damage event (log records carry a monotonic seq)
  const newHs = () => {
    let best = 0;
    // granted, or dropped only by the 80 ms per-target budget (§2.5: over-budget requests are dropped by design)
    for (const r of g.debug?.hitstopLog?.() || []) if ((r.seq ?? 0) > lastSeq) { lastSeq = r.seq; if (r.granted || r.reason === 'budget') best = Math.max(best, r.sec); }
    return best;
  };
  g.events.on('damage', (p) => {
    if (!p || p.isPlayer || !PT.probe) { newHs(); return; }
    const hs = newHs();
    if (p.dot) { PT.ticks++; if (hs > 0) PT.tickHs++; return; }
    PT.hits.push({ m: !!p.melee, cid: curCid, hs: +hs.toFixed(3), act: +Math.max(0, g._hitstop || 0).toFixed(3) });
    PT.hitstops.push((p.melee ? 'm' : 's') + hs.toFixed(3));
  });
  /** v4 §7.9: first hit per castId logs a hitstop ≥ 0.025 s (granted, or dropped by the 80 ms budget); with the v4 kit later
   *  hits of the same castId log none; ticks none. */
  PT.hitstopOk = () => {
    const first = new Set(), bad = [];
    const v4 = !!g.vfx?.kit;
    for (const h of PT.hits) {
      const isFirst = h.cid == null || !first.has(h.cid);
      if (h.cid != null) first.add(h.cid);
      // legacy hits without a castId keep the v3 rule (spell volleys share one global freeze): a running freeze counts
      if (isFirst && !(h.hs >= 0.025) && !(h.cid == null && h.act >= 0.02)) bad.push(['first', h]);
      if (!isFirst && v4 && h.hs > 0) bad.push(['repeat', h]);
    }
    if (PT.tickHs > 0) bad.push(['ticks', PT.tickHs]);
    return { ok: PT.hits.length > 0 && bad.length === 0, bad: bad.slice(0, 6), n: PT.hits.length, casts: first.size };
  };
}

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const t0 = Date.now();
  const stamp = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
  const allLogs = [];
  const results = [];
  async function openPage(query) {
    const p = await b.newPage({ viewport: { width: 640, height: 360 } });
    const logs = [];
    p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 500)}`); });
    p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
    await p.goto(`http://localhost:${port}/?test=1${/path=|cls=none/.test(query) ? '' : '&path=all'}${query}`);   // v3: legacy keymap
    await p.waitForFunction(() => window.game && window.game.ready, null, { timeout: 120000 });
    await p.waitForTimeout(800);
    await p.evaluate(installHelpers);
    const run = async (label, fn, arg) => {
      try { const r = await p.evaluate(fn, arg); console.log(`[${stamp()}] ${label}:`, JSON.stringify(r)); return r; }
      catch (e) { console.log(`[${stamp()}] ${label} FAILED:`, e.message.split('\n')[0]); logs.push(`[harness] ${label}: ${e.message.split('\n')[0]}`); return null; }
    };
    const shot = async (name) => {
      if (noShots) return;
      try {
        await p.evaluate(() => { game.step(1, 1 / 60, true); });
        await p.screenshot({ path: path.join(outDir, `v2_${name}.png`), timeout: 180000 });
        console.log(`[${stamp()}] shot v2_${name}.png`);
      } catch (e) { console.log('shot failed', name, e.message.split('\n')[0]); }
    };
    const finish = async (label) => {
      const r = await p.evaluate(() => ({ log: PT.log, fails: PT.fails, stubbed: game.stubbed })).catch(() => ({ log: [], fails: ['page'] }));
      console.log(`\n--- ${label} results ---\n` + r.log.join('\n'));
      results.push({ label, fails: r.fails, stubbed: r.stubbed });
      allLogs.push(`== ${label}: ` + (logs.length ? '\n' + logs.slice(0, 40).join('\n') : 'no console errors/warnings'));
      await p.close();
    };
    return { p, run, shot, finish };
  }

  if (opt('--eval')) {
    const { run, shot, finish } = await openPage(opt('--url', ''));
    await run('eval', new Function(`return (async()=>{${opt('--eval')}})()`));
    if (opt('--shot')) await shot(opt('--shot'));
    await finish('eval');
    await b.close(); server.close(); return;
  }
  // =============================================================== STORY
  if (only.includes('story')) {
    const { run, shot, finish } = await openPage('&cls=none&cine=1');   // cine=1: story cinematics play in test mode
    await run('boot', () => ({ stubbed: game.stubbed, state: game.state, stage: game.story.stage, cls: game.progression.cls }));
    await run('wake: talk to 노아', () => {
      PT.step(1);
      const okStart = PT.check('stage wake at start', game.story.stage === 'wake', game.story.stage);
      game.story.talkTo('elder'); PT.step(0.3);
      PT.check('dialogue state + input locked', game.state === 'dialogue' && game.input.gameLocked, { state: game.state, locked: game.input.gameLocked });
      const picks = PT.runDialogue();
      PT.step(1);
      PT.check('wake → choose', game.story.stage === 'choose', game.story.stage);
      PT.check('input unlocked after dialogue', !game.input.gameLocked && game.state === 'playing', { state: game.state, locked: game.input.gameLocked });
      return { okStart, picks, obj: game.story.getObjective()?.desc };
    });
    await shot('01_story_choose');
    await run('choose: class panel → 검사', () => {
      const v = game.world.village; const m = game.story.npcs?.swordMentor;
      const mp = m?.pos || v.npcSpots.swordMentor.position;
      PT.tp(mp.x + 2, mp.z + 2);
      game.story.talkTo('swordMentor'); PT.step(0.3);
      // v3: the mentor's pitch ends by opening the class panel (ui); without ui, a 6-option dialogue ask
      const picks = PT.runDialogue((cs) => { const k = cs.findIndex((c) => /검사/.test(c)); return k >= 0 ? k : 0; });
      PT.step(0.3);
      const panel = game.ui?._parts?.classPanel;
      const panelOpen = !!(panel && (panel.isOpen || game.ui.classPanelOpen));
      if (panelOpen) panel.pick('sword', { noConfirm: true });
      PT.step(0.3);
      const pr = game.progression;
      PT.check('class panel opened after the mentor talk', panelOpen || game.stubbed?.includes('ui'), { panelOpen });
      PT.check('progression class sword', pr.cls === 'sword', { cls: pr.cls });
      PT.check('player class sword', game.player.cls === 'sword');
      return { picks, panelOpen, state: game.state, cin: game.cinematic.active };
    });
    await run('class rite cutscene (각인 의식)', () => {
      let sawCut = game.state === 'cutscene' || game.cinematic.active; let t = 0;
      for (; t < 40 && !(game.story.stage === 'training' && game.state === 'playing' && !game.cinematic.active); t += 0.25) {
        PT.step(0.25); if (game.state === 'cutscene' || game.cinematic.active) sawCut = true;
        if (t > 3 && t < 3.3) window.__blessMid = true;
      }
      PT.check('class rite played', sawCut);
      PT.check('training started after the rite', game.story.stage === 'training', { stage: game.story.stage, t });
      PT.check('input unlocked after the rite', !game.input.gameLocked, [...(game.input._locks || [])]);
      return { t, trainStep: game.story.trainStep, state: game.state };
    });
    await run('training (v3 steps)', () => {
      const T = game.world.village.trainingGround; const steps = [];
      PT.tp(T.x, T.z + 4); PT.step(1.0); steps.push(game.story.trainStep);
      const d = game.enemies.list.filter((e) => e.isDummy && e.alive).sort((a, b) => a.object.position.distanceTo(game.player.object.position) - b.object.position.distanceTo(game.player.object.position))[0];
      const dp = d.object.position;
      const approach = () => { PT.tp(dp.x + 1.8, dp.z + 1.8, 0.1); PT.face(PT.center(d)); };
      const S = game.story, sk = game.skills, P = game.progression;
      approach();
      // basic: real LMB combo clicks
      const dmg0 = PT.counts.damage || 0;
      PT.probe = true; PT.hitstops.length = 0; PT.hits.length = 0; PT.tickHs = 0;
      for (let i = 0; i < 12 && S.trainStep === 'basic'; i++) { PT.click(0, 0.05, 0.35); }
      PT.probe = false;
      PT.check('training basic (5 hits)', !!S.S?.trainDone?.basic || S.trainStep !== 'basic', { step: S.trainStep, dmg: (PT.counts.damage || 0) - dmg0 });
      { const r = PT.hitstopOk(); PT.check('first hit of each castId had a granted hitstop ≥ 0.025 s (v4 §7.9)', r.ok, { ...r, hs: PT.hitstops.slice(0, 12) }); }
      steps.push(S.trainStep);
      // charged: hold RMB
      for (let i = 0; i < 3 && S.trainStep === 'charged'; i++) { approach(); PT.heal(); PT.click(2, 1.0, 1.2); }
      steps.push(S.trainStep);
      // (v3: a fresh class has no quick skill yet, so the story defers 'quick' until after 'learn')
      const pressQuick = () => {
        for (let i = 0; i < 3 && S.trainStep === 'quick'; i++) { approach(); PT.heal(); game.player.lastHurtT = -1e9; sk?.resetCooldowns?.(); PT.press({ Digit1: true }, 0.05, 1.2); }
      };
      pressQuick();
      steps.push(S.trainStep);
      // defend: hold E while the story triggers dummy practice attacks
      approach(); PT.heal();
      game.input.simulate({ keys: { KeyE: true } });
      for (let i = 0; i < 40 && S.trainStep === 'defend'; i++) PT.step(0.25);
      game.input.simulate({}); PT.step(0.3);
      steps.push(S.trainStep);
      // dodge
      PT.heal(); PT.press({ KeyW: true, KeyQ: true }, 0.08, 0.6);
      PT.step(2);
      steps.push(S.trainStep);
      // learn: learn a quick-slot active (as the tree would) and put it in slot 1
      if (S.trainStep === 'learn') {
        if (!(P.points > 0)) { P.addXp?.(400, { kind: 'debug' }); PT.step(0.2); }
        let learned = null, sid = null;
        for (const el of game.classes.classElements(P.cls)) {
          for (const n of P.nodesOf(el)) {
            const q = (n.grants || []).find((id) => sk?.defs?.get?.(id)?.slot === 'quick');
            if (q && P.rank(n.id) === 0 && P.canLearn(n.id).ok && P.learn(n.id)) { learned = n; sid = q; break; }
          }
          if (learned) break;
        }
        PT.step(0.2);
        game.player.lastHurtT = -1e9;
        const eq = !!(sid && sk.equip('q1', sid));
        PT.step(0.5);
        PT.check('training learn: quick active learned + equipped in slot 1', !!learned && eq, { learned: learned?.id, sid, eq, step: S.trainStep });
      }
      steps.push(S.trainStep);
      // quick (deferred until a skill is slotted): press 1
      pressQuick();
      PT.check('training quick: slot 1 cast', !!S.S?.trainDone?.quick || (S.trainStep !== 'quick' && S.trainStep !== 'learn'), { step: S.trainStep });
      steps.push(S.trainStep);
      // report back to the mentor
      if (S.trainStep === 'done') {
        const mn = S.npcs.swordMentor; PT.tp(mn.pos.x + 1.5, mn.pos.z + 1.5, 0.3);
        PT.check('F prompt near mentor', S.hasPrompt());
        const ult0 = PT.counts.spellCast || 0;
        PT.press({ KeyF: true }, 0.05, 0.3); // F must talk, not cast the ultimate
        PT.check('F talks (no ultimate cast)', game.state === 'dialogue' && (PT.counts.spellCast || 0) === ult0, { state: game.state });
        PT.runDialogue(); PT.step(1);
      }
      PT.check('training complete → updraft', S.stage === 'updraft', { stage: S.stage, steps });
      return { steps, stage: S.stage, blocked: PT.counts.blocked || 0, parry: PT.counts.parry || 0, dash: PT.counts.dash || 0 };
    });
    await shot('02_training_done');
    await run('updraft quest', () => {
      PT.step(2);
      const v = game.world.village, S = game.world.surface;
      const timo = game.story.npcs?.child;
      PT.tp(timo.pos.x + 1.5, timo.pos.z + 1.5); PT.step(0.3);
      game.story.talkTo('child'); PT.step(0.3);
      PT.runDialogue();
      const hill = v.tutorialHill;
      PT.check('feather active on hill', !!game.story.getMarkers().find((m) => m.kind === 'quest'), game.story.getObjective()?.desc);
      // pick a fire spot on the meadow side of the spire, a few metres out from its base
      const M = v.tutorialMeadow; const dir = new game.THREE.Vector3(M.x - hill.x, 0, M.z - hill.z).normalize();
      const fire = new game.THREE.Vector3(hill.x + dir.x * 9, 0, hill.z + dir.z * 9); fire.y = PT.ground(fire.x, fire.z);
      // explode a barrel there (props are player-attackable entities), fall back to direct ignite
      let how = 'barrel';
      const barrel = S.addBarrel ? S.addBarrel(fire.clone()) : null;
      if (barrel) game.combat.dealDamage(barrel, { amount: 50, element: 'fire', source: 'player', point: fire.clone().setY(fire.y + 0.5) });
      PT.step(1.5);
      if (!S.burningNear(fire, 6)) { how = 'ignite'; S.ignite(fire, 4); PT.step(1.0); }
      const burning = S.burningNear(fire, 6);
      PT.check('grass burning at fire spot', burning > 0, { how, burning });
      // stand just outside the fire (upwind side away from spire), jump + glide over it toward the spire
      PT.heal();
      const start = fire.clone().addScaledVector(dir, 3.5); PT.tp(start.x, start.z, 0.1);
      game.player.entity.hp = game.player.entity.maxHp;
      const faceP = hill.clone(); faceP.y = game.player.object.position.y + 2; PT.face(faceP);
      const y0 = game.player.object.position.y; let maxUp = 0, maxY = y0, sawUpdraft = false, gotFeather = false;
      game.input.simulate({ keys: { Space: true, KeyW: true } }); PT.step(0.45); // jump, keep Space held → glide
      for (let i = 0; i < 160; i++) {
        const pp = game.player.object.position;
        const up = S.getUpdraft(pp); maxUp = Math.max(maxUp, up); if (up > 0) sawUpdraft = true;
        // ride the column above the fire until high enough, then glide onto the spire and drop onto its top
        if (!PT.cross && pp.y > hill.y + 4) PT.cross = true;
        const high = !!PT.cross;
        const hd = Math.hypot(hill.x - pp.x, hill.z - pp.z);
        let keys = { Space: true };
        if (high) { if (hd > 1.2) { keys.KeyW = true; PT.face(new game.THREE.Vector3(hill.x, pp.y, hill.z)); } else keys = {}; }
        else { const dxf = fire.x - pp.x, dzf = fire.z - pp.z; if (dxf * dxf + dzf * dzf > 2) { PT.face(new game.THREE.Vector3(fire.x, pp.y, fire.z)); keys.KeyW = true; } }
        game.input.simulate({ keys }); PT.step(0.1);
        maxY = Math.max(maxY, game.player.object.position.y);
        if (i % 8 === 0) PT.trace.push([i, ...game.player.object.position.toArray().map((x) => +x.toFixed(1)), game.player.gliding ? 'G' : game.player.grounded ? 'g' : 'a', +up.toFixed(0)]);
        PT.heal(); game.player.entity.hp = game.player.entity.maxHp;
        if (game.story.S?.featherGot || PT.counts.questComplete >= 4) { gotFeather = true; break; }
        if (game.player.grounded && high && i > 20) { const hp = game.player.object.position; if (Math.hypot(hp.x - hill.x, hp.z - hill.z) < 3) break; }
      }
      game.input.simulate({}); PT.step(0.5);
      const pp = game.player.object.position;
      PT.check('updraft felt (surface.getUpdraft > 0)', sawUpdraft, { maxUp: +maxUp.toFixed(1) });
      PT.check('player ROSE while gliding over fire', maxY - y0 > 6, { y0: +y0.toFixed(1), maxY: +maxY.toFixed(1), hillY: +hill.y.toFixed(1) });
      PT.check('updraftEnter emitted', (PT.counts.updraftEnter || 0) > 0);
      // walk to the feather if we landed on top but not on it
      if (game.story.stage === 'updraft' && pp.y > hill.y - 1) {
        for (let i = 0; i < 30 && game.story.stage === 'updraft'; i++) { PT.face(new game.THREE.Vector3(hill.x, pp.y + 1, hill.z)); game.input.simulate({ keys: { KeyW: true } }); PT.step(0.1); }
        game.input.simulate({}); PT.step(0.3);
      }
      const onHill = Math.hypot(pp.x - hill.x, pp.z - hill.z) < 3.4 && pp.y > hill.y - 1;
      PT.check('reached tutorialHill top', onHill, { p: pp.toArray().map((x) => +x.toFixed(1)), hill: hill.toArray().map((x) => +x.toFixed(1)) });
      PT.check('feather collected (+stamina)', game.player.maxStamina >= 120, { maxStamina: game.player.maxStamina, stamina: Math.round(game.player.stamina) });
      return { stage: game.story.stage, trace: PT.trace };
    });
    await shot('03_updraft_hill');
    await run('camps', () => {
      for (let i = 0; i < 20 && game.story.stage !== 'camps'; i++) PT.step(0.5);
      PT.check('camps quest started', game.story.stage === 'camps', game.story.stage);
      const E = game.enemies;
      // fight camp0 a little with real sword input, then clear the rest
      const cp = game.world.camps[0].position; PT.tp(cp.x + 10, cp.z + 4); PT.heal();
      const k0 = E.kills;
      for (let r = 0; r < 30; r++) {
        const t = E.list.filter((e) => !e.isDummy && e.alive && e.object.position.distanceTo(cp) < 30)[0]; if (!t) break;
        const tp = t.object.position; PT.tp(tp.x + 1.6, tp.z + 1.2, 0.05); PT.face(PT.center(t)); PT.heal();
        for (let c = 0; c < 4; c++) PT.click(0, 0.05, 0.3);
      }
      const realKills = E.kills - k0;
      for (let pass = 0; pass < 4; pass++) {
        for (const e of E.list.slice()) if (!e.isDummy && !e.isBoss && e.alive) game.combat.dealDamage(e, { amount: 99999, element: 'earth', source: 'player', point: PT.center(e), noReaction: true });
        PT.step(1.5);
      }
      PT.step(4);
      PT.check('boss stage after camps', game.story.stage === 'boss' && !!E.boss, { stage: game.story.stage, boss: !!E.boss });
      return { realKills, camps: E.getObjective().campsCleared };
    });
    await run('boss + finisher', () => {
      for (let i = 0; i < 30 && (game.cinematic.active || game.state === 'cutscene'); i++) { game.cinematic.skip?.(); PT.step(0.5); }   // boss intro
      const A = game.world.bossArena, b = game.enemies.boss; if (!b) return { boss: false };
      PT.tp(A.position.x, A.position.z + 14); PT.heal(); PT.step(6);
      // v3: the R finisher comes from a capstone; take the sword/lightning capstone like the v2 'master' path did
      game.skills?.applyPreset?.('legacy_master_lightning'); PT.step(0.2);
      PT.face(PT.center(b));
      // a few real sword combos
      const hp0 = b.hp;
      for (let i = 0; i < 6; i++) { const bp = b.object.position; PT.tp(bp.x + 2.5, bp.z + 3.5, 0.05); PT.face(PT.center(b)); PT.heal(); PT.click(0, 0.05, 0.35); }
      const comboDmg = hp0 - b.hp;
      // fill the gauge and press R
      game.progression.addAwakening(100); PT.step(0.1);
      PT.check('gauge full', game.progression.canFinisher());
      const hpF = b.hp;
      PT.press({ KeyR: true }, 0.05, 0.3);
      const started = !!game.cinematic.active; let peak = false, t = 0;
      for (; t < 15 && game.cinematic.active; t += 0.1) { PT.step(0.1); if (t > 1.0 && t < 1.2) window.__finMid = true; }
      PT.step(1.0);
      PT.check('finisher cinematic started', started && (PT.counts.finisherStart || 0) > 0, { started, fs: PT.counts.finisherStart || 0 });
      PT.check('finisher cinematic ended', !game.cinematic.active, { t: +t.toFixed(1) });
      PT.check('finisher dealt damage', b.hp < hpF || !b.alive, { hpF, hp: Math.round(b.hp) });
      PT.check('input unlocked after finisher', !game.input.gameLocked, [...(game.input._locks || [])]);
      const cd = game.camera.position.distanceTo(game.player.object.position);
      PT.check('camera returned to player', cd < 14, { camDist: +cd.toFixed(1) });
      return { comboDmg: Math.round(comboDmg), finisherDmg: Math.round(hpF - b.hp), finT: +t.toFixed(1), state: game.state };
    });
    await shot('04_after_finisher');
    await run('golem kill → reveal (v3: not victory)', () => {
      const b = game.enemies.boss; if (!b) return { boss: false };
      let sawDefeat = null; const off = game.events.on('bossDefeated', (p) => { sawDefeat = { id: p?.id, final: !!p?.final }; });
      for (let i = 0; i < 40 && b.alive; i++) { if (!b.invulnerable) game.combat.dealDamage(b, { amount: 500, element: 'earth', source: 'player', point: PT.center(b), noReaction: true }); PT.step(0.5); }
      let t = 0;
      for (; t < 40 && game.story.stage !== 'reveal'; t += 0.5) PT.step(0.5);
      // the reveal cinematic follows; it is skippable
      let skipped = false;
      for (let i = 0; i < 40 && (game.cinematic.active || game.state === 'cutscene'); i++) { if (game.cinematic.skip) { game.cinematic.skip(); skipped = true; } PT.step(0.5); }
      PT.step(1);
      off();
      PT.check('bossDefeated golem (final:false)', sawDefeat?.id === 'golem' && !sawDefeat.final, sawDefeat);
      PT.check('stage reveal after the golem', game.story.stage === 'reveal', { stage: game.story.stage, t });
      PT.check('no victory after the golem', game.state !== 'victory' && !(PT.counts.victory > 0), { state: game.state, victory: PT.counts.victory || 0 });
      PT.check('playing after the reveal cinematic', game.state === 'playing' && !game.input.gameLocked, { state: game.state, skipped });
      return { t, state: game.state, quests: { start: PT.counts.questStart, done: PT.counts.questComplete } };
    });
    await shot('05_reveal');
    await finish('story');
  }

  // =============================================================== SWORD COMBAT
  if (only.includes('sword')) {
    const { run, shot, finish } = await openPage('&cls=sword&path=all');
    await run('sword per element', () => {
      const els = ['fire', 'ice', 'lightning', 'wind', 'earth']; const out = {};
      const d = PT.dummy(); const dp = d.object.position;
      const prep = () => { PT.tp(dp.x + 1.6, dp.z + 1.6, 0.05); PT.face(PT.center(d)); PT.heal(); d.hp = d.maxHp; for (const k in game.sword.cooldowns) game.sword.cooldowns[k] = 0; };
      for (const el of els) {
        game.sword.setElement(el); PT.step(0.1);
        const r = {};
        for (const kind of ['combo', 'heavy', 'ultimate']) {
          prep(); PT.hitstops.length = 0; PT.hits.length = 0; PT.ticks = 0; PT.tickHs = 0; PT.probe = true;
          const dmg0 = PT.counts.damage || 0;
          if (kind === 'combo') { for (let s = 0; s < 4; s++) PT.click(0, 0.05, 0.32); PT.step(0.6); }
          else if (kind === 'heavy') PT.click(2, 1.0, 1.4);
          else { PT.press({ KeyF: true }, 0.05, 3.5); }
          PT.probe = false;
          const hits = (PT.counts.damage || 0) - dmg0;
          const hr = PT.hitstopOk();
          r[kind] = { hits, ticks: PT.ticks, casts: hr.casts, minHitstop: PT.hitstops.length ? Math.min(...PT.hitstops.map((h) => +h.slice(1))) : 0 };
          PT.check(`${el} ${kind} dealt damage`, hits > 0, hits);
          PT.check(`${el} ${kind} hitstop on the first hit of each castId`, hr.ok, { ...hr, hs: PT.hitstops.slice(0, 12), ticks: PT.ticks });
        }
        out[el] = r;
      }
      return out;
    });
    await shot('06_sword_ult');
    await run('parry & perfect dodge', () => {
      const d = PT.dummy(); const dp = d.object.position;
      PT.tp(dp.x + 2.0, dp.z + 1.0, 0.3); PT.face(PT.center(d)); PT.heal();
      PT.step(3);
      // perfect parry: press E just before the practice swing lands
      const p0 = PT.counts.parry || 0;
      const r = game.enemies.practiceAttack(game.player.entity);
      let parried = false;
      if (r) {
        PT.step(Math.max(0.02, (r.eta || 1) - 0.1));
        game.input.simulate({ keys: { KeyE: true } });
        for (let i = 0; i < 30 && (PT.counts.parry || 0) === p0; i++) PT.step(0.05);
        game.input.simulate({}); PT.step(0.4);
        parried = (PT.counts.parry || 0) > p0;
      }
      PT.check('perfect parry (간파)', parried, { r: r && { kind: r.kind, eta: r.eta } });
      PT.step(3); PT.heal();
      // perfect dodge: dash right before impact
      const pd0 = PT.counts.perfectDodge || 0;
      PT.tp(dp.x + 2.0, dp.z + 1.0, 0.3); PT.face(PT.center(d));
      const r2 = game.enemies.practiceAttack(game.player.entity);
      let dodged = false;
      if (r2) {
        const lead = 0.08;
        PT.step(Math.max(0.02, (r2.eta || 1) - lead));
        game.input.simulate({ keys: { KeyQ: true, KeyD: true } }); PT.step(0.05); game.input.simulate({});
        for (let i = 0; i < 20 && (PT.counts.perfectDodge || 0) === pd0; i++) PT.step(0.05);
        dodged = (PT.counts.perfectDodge || 0) > pd0;
      }
      PT.check('perfect dodge (완벽 회피)', dodged, { r2: r2 && { kind: r2.kind, eta: r2.eta } });
      PT.step(1.5);
      return { parry: PT.counts.parry || 0, perfectDodge: PT.counts.perfectDodge || 0, blocked: PT.counts.blocked || 0 };
    });
    await finish('sword');
  }

  // =============================================================== SETTINGS
  if (only.includes('settings')) {
    const { run, shot, finish } = await openPage('');
    await run('settings live', () => {
      const S = game.settings, R = game.renderer, inf = R.info; inf.autoReset = false;
      const frame = () => { inf.reset(); game.step(1, 1 / 60, true); return { calls: inf.render.calls, tris: inf.render.triangles }; };
      const out = {};
      out.base = frame();
      S.set('grassDensity', 0.1); game.step(10, 1 / 60); out.grass10 = frame();
      PT.check('grassDensity lowers triangles', out.grass10.tris < out.base.tris * 0.98, { base: out.base.tris, low: out.grass10.tris });
      S.set('grassDensity', 1); game.step(10, 1 / 60); out.grass100 = frame();
      PT.check('grassDensity raises triangles', out.grass100.tris > out.grass10.tris, out.grass100.tris);
      // v4 (§2.4): renderScale bounds the render size (scene pass allocation/viewport), the canvas pixel ratio stays
      const C4 = game.composer, rw0 = C4.viewport.w; S.set('renderScale', 0.5); PT.step(0.1, true); game.renderNow?.(); out.scale = [rw0, C4.viewport.w, R.getPixelRatio()];
      PT.check('renderScale lowers the render size', C4.viewport.w < rw0 && C4.state.allocW < R.domElement.width, out.scale);
      S.set('renderScale', 1);
      S.set('shadows', false); game.step(2, 1 / 60); frame(); const ns = frame();   // 1st frame renders the clearing shadow pass
      // v4: shadows off = one clearing pass with no casters, then the map is never re-rendered (no program-key flip)
      PT.check('shadows off', (!R.shadowMap.enabled || R.shadowMap.needsUpdate === false) && ns.calls < out.grass100.calls, { calls: ns.calls, before: out.grass100.calls });
      S.set('shadows', true); game.step(2, 1 / 60); frame();
      S.set('shadowQuality', 'high'); game.step(2, 1 / 60); frame(); S.set('shadowQuality', 'medium');
      S.set('bloom', false); PT.check('bloom off', !game.bloomPass.enabled); S.set('bloom', true);
      S.set('drawDistance', 0.2); game.step(5, 1 / 60); out.dd = frame(); S.set('drawDistance', 0.6);
      S.set('particleScale', 0.2); PT.check('particleScale read by vfx', Math.abs((game.vfx.particleScale ?? 0.2) - 0.2) < 0.01, game.vfx.particleScale);
      S.applyPreset('low'); game.step(5, 1 / 60); out.low = frame();
      S.applyPreset('medium'); game.step(5, 1 / 60); out.medium = frame();
      inf.autoReset = true;
      return out;
    });
    await run('settings menu', () => {
      game.ui.openSettings?.(); PT.step(0.2);
      const open = !!game.ui.settingsOpen; const locked = game.input.gameLocked;
      game.ui.closeSettings?.(); PT.step(0.2);
      PT.check('settings menu opens/closes and locks input', open && locked && !game.input.gameLocked, { open, locked });
      return { open, locked };
    });
    await finish('settings');
  }

  // =============================================================== PERF
  if (only.includes('perf')) {
    const { run, shot, finish } = await openPage('');
    const perf = await run('perf', () => {
      const R = game.renderer, inf = R.info; inf.autoReset = false;
      const W = game.world, v = W.village;
      const spots = {
        village: [v.center.x, v.center.z + 6],
        meadow: [0, 60],
        camp: [W.camps[0].position.x + 14, W.camps[0].position.z + 6],
        boss: [W.bossArena.position.x, W.bossArena.position.z + 18],
      };
      const out = {};
      for (const preset of ['medium', 'low']) {
        game.settings.applyPreset(preset); game.step(3, 1 / 60);
        for (const [k, [x, z]] of Object.entries(spots)) {
          PT.tp(x, z, 0.5);
          if (k === 'boss') PT.lookAt(W.bossArena.position.clone().setY(W.bossArena.position.y + 4));
          else if (k === 'camp') PT.lookAt(W.camps[0].position.clone().setY(W.camps[0].position.y + 1));
          game.step(5, 1 / 60);
          inf.reset();
          const t = performance.now(); game.step(1, 1 / 60, true); const ms = performance.now() - t;
          out[`${preset}:${k}`] = { calls: inf.render.calls, tris: inf.render.triangles, cpuMs: Math.round(ms) };
        }
      }
      // CPU cost of the update loop (no render), 120 frames at the camp
      const cp = W.camps[0].position; PT.tp(cp.x + 14, cp.z + 6, 0.3);
      const t1 = performance.now(); game.step(120, 1 / 60); out.updateMsPerFrame = +((performance.now() - t1) / 120).toFixed(2);
      inf.autoReset = true;
      game.settings.applyPreset('medium');
      return out;
    });
    await finish('perf');
  }

  console.log('\n=========== SUMMARY ===========');
  for (const r of results) console.log(`${r.label}: ${r.fails.length ? 'FAIL ' + r.fails.join(' | ') : 'all PASS'}  stubbed=${JSON.stringify(r.stubbed)}`);
  console.log('\nCONSOLE:\n' + allLogs.join('\n'));
  await b.close(); server.close();
})();
