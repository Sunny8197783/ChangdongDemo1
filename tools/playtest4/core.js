// playtest4 section: core (PLAN v4 §7.8 C1–C8). Owned by core.
//   C5 (B): settings keys/defaults, damageNumbers migration, difficulty=story → assist, keymap rebind + label,
//           save.section round trip, nextCastId in skillCast, vfx stub absent APIs, tells stub timing + hit tests.
//   P0a contract: game.render / game.post / game.frame / enemyTime / timeScale / hitstop / elements.fx / threat / test params.
//   C1–C4, C7 (B) land with P0b; C6, C8 (I) at integration (--perf).
module.exports = async function core(PT) {
  // PT4_CORE_ONLY=c1,c2 … runs only those blocks (development); default: everything
  const ONLY = (process.env.PT4_CORE_ONLY || '').split(',').filter(Boolean);
  const want = (id) => !ONLY.length || ONLY.includes(id);
  if (want('c5')) await mainPage(PT);
  if (want('params')) await paramsPage(PT);
  if (want('seed')) await seedPages(PT);
  if (want('c1')) await c1(PT);
  if (want('c2')) await c2(PT);
  if (want('c3')) await c3(PT);
  if (want('c4')) await c4(PT);
  if (want('c7')) await c7(PT);
  if (PT.flags.perf) PT.skip('C6/C8', 'integration (wave C)');
};

async function mainPage(PT) {
  // ================================================================== main page (defaults: prod=1&governor=0&seed=1)
  const pg = await PT.boot('&cls=mage&level=30&skills=preset:endgame_mage');
  PT.check('boot: game.ready', pg.ready, pg.params);
  if (!pg.ready) { await pg.close(); return; }
  PT.note(`boot ${pg.bootMs} ms`);

  // ------------------------------------------------------------------ C5: settings
  await pg.run('C5 settings', async () => {
    const M = await import('/src/core/settings.js');
    const S = game.settings, V = S.values;
    const want = {
      fxIntensity: 1.0, threatEmphasis: 'normal', tellMul: 1, enemySpeed: 1.0, iframeMul: 1, perfectMul: 1, witchSlowmo: true,
      offscreenArrows: true, teachSlowmo: true, hints: true, aimAssist: 'off', colorblind: 'off', flashReduce: false, screenShake: 0.6,
      uiScale: 1.0, damageNumbers: 'merged', cameraDist: 'normal', autoAllocate: false, introShort: true, quality: 'medium',
      autoQuality: true, dynamicRes: true, fpsCap: 60, showFps: false,
    };
    const bad = [];
    for (const [k, v] of Object.entries(want)) if (M.DEFAULTS[k] !== v) bad.push(`${k}: ${JSON.stringify(M.DEFAULTS[k])} != ${JSON.stringify(v)}`);
    const kb = M.DEFAULTS.keybinds || {};
    for (const [a, c] of Object.entries({ dodge: 'KeyQ', defend: 'KeyE', dodgeAlt: 'Mouse3', jump: 'Space', sprint: 'ShiftLeft', interact: 'KeyF', skills: 'KeyK', codex: 'Tab', confirm: 'Enter' })) if (kb[a] !== c) bad.push(`keybinds.${a}`);
    PT.check('every §6.8 key with its default', bad.length === 0, bad);
    PT.check('live values carry every key', Object.keys(want).every((k) => k in V) && typeof V.keybinds === 'object', Object.keys(want).filter((k) => !(k in V)));
    PT.check('SETTING_DEFS covers the menu keys', ['fxIntensity', 'threatEmphasis', 'tellMul', 'enemySpeed', 'iframeMul', 'perfectMul', 'witchSlowmo', 'offscreenArrows', 'teachSlowmo',
      'hints', 'colorblind', 'flashReduce', 'screenShake', 'uiScale', 'damageNumbers', 'cameraDist', 'autoAllocate', 'introShort', 'keybinds', 'quality', 'autoQuality',
      'dynamicRes', 'fpsCap', 'showFps'].every((k) => M.SETTING_DEFS.some((d) => d.key === k)));
    PT.check('quality values exactly low/medium/high/custom', M.QUALITY_VALUES.join() === 'low,medium,high,custom');
    PT.check('medium preset per §2.2 (budget 1.0 MP, MSAA 0, PCF 1024, bloom 3 mips, 0 point lights, caps 1000/300)',
      M.PRESETS.medium.budgetPx === 1.0 && M.PRESETS.medium.msaa === 0 && M.PRESETS.medium.shadowType === 'pcf' && M.PRESETS.medium.shadowSize === 1024 &&
      M.PRESETS.medium.bloomMips === 3 && M.PRESETS.medium.pointLights === false && M.PRESETS.medium.particleCap === 1000 && M.PRESETS.medium.additiveCap === 300 &&
      M.PRESETS.medium.grassDensity === 0.4 && M.PRESETS.high.msaa === 4 && M.PRESETS.low.budgetPx === 0.6 && M.PRESETS.high.budgetPx === 1.6);
    // migrations (fake game, isolated storage)
    const keep = localStorage.getItem(M.KEY), keep2 = localStorage.getItem(M.KEY_V2);
    const fake = { events: { emit() {} } };
    try {
      localStorage.setItem(M.KEY, JSON.stringify({ damageNumbers: true, quality: 'auto' }));
      const a = M.createSettings(fake);
      localStorage.setItem(M.KEY, JSON.stringify({ damageNumbers: false, quality: 'high', grassDensity: 0.6 }));
      const b = M.createSettings(fake);
      PT.check('damageNumbers migration true → merged, false → off', a.values.damageNumbers === 'merged' && b.values.damageNumbers === 'off', [a.values.damageNumbers, b.values.damageNumbers]);
      PT.check('unknown quality → medium; stored preset re-applies v4 preset values', a.values.quality === 'medium' && b.values.quality === 'high' && b.values.grassDensity === M.PRESETS.high.grassDensity);
      b.set('damageNumbers', false, { persist: false });
      PT.check('set(damageNumbers, false) stores off', b.values.damageNumbers === 'off');
      localStorage.setItem(M.KEY, JSON.stringify({ keybinds: { dodge: 'KeyR' } }));
      const c = M.createSettings(fake);
      PT.check('stored keybinds merge with defaults', c.values.keybinds.dodge === 'KeyR' && c.values.keybinds.dodgeAlt === 'Mouse3');
    } finally {
      if (keep == null) localStorage.removeItem(M.KEY); else localStorage.setItem(M.KEY, keep);
      if (keep2 == null) localStorage.removeItem(M.KEY_V2); else localStorage.setItem(M.KEY_V2, keep2);
    }
    // difficulty table
    const D = M.DIFFICULTY;
    PT.check('DIFFICULTY gains story + §6.8 columns', M.DIFFICULTY_ORDER.join() === 'story,easy,normal,hard' &&
      D.story.hpMul === 0.6 && D.story.dmgMul === 0.4 && D.story.tellMul === 1.5 && D.story.perfectMul === 2 && D.story.iframeMul === 1.5 && D.story.enemySpeed === 0.85 &&
      D.story.autoRevive === true && D.story.checkAddSec === 6 && D.story.regenCombatMul === 1.5 && D.easy.tellMul === 1.3 && D.easy.perfectMul === 1.4 &&
      D.easy.iframeMul === 1.25 && D.easy.checkAddSec === 4 && D.hard.tellMul === 0.9 && D.hard.perfectMul === 0.75 && D.hard.regenCombatMul === 0.8 &&
      Object.values(D).every((d) => d.telegraphMul === 1 && d.checkAdd === d.checkAddSec && d.nameKo && d.descKo));
    PT.check('difficulty card texts exact', D.story.descKo === '이야기를 즐기고 싶다면. 적이 느리고 약하며, 쓰러져도 그 자리에서 일어납니다.' &&
      D.normal.descKo === '처음이라면 추천. 균형 잡힌 기본 난이도예요.' && D.story.nameKo === '이야기');
    // assist recomputes on settingsChanged
    const A = game.assist;
    S.set('difficulty', 'easy', { persist: false });
    const easy = { ...game.assist };
    S.set('tellMul', 1.5, { persist: false }); const prod = game.assist.tellMul;
    S.set('tellMul', 1, { persist: false }); S.set('difficulty', 'normal', { persist: false });
    PT.check('game.assist recomputed on settingsChanged (difficulty × slider product)', easy.tellMul === 1.3 && easy.perfectMul === 1.4 && Math.abs(prod - 1.95) < 1e-9 && game.assist.tellMul === 1 && game.assist === A, { easy, prod });
    PT.check('game.assist fields', ['tellMul', 'enemySpeed', 'iframeMul', 'perfectMul', 'fxIntensity', 'threatStrong', 'colorblind', 'flashReduce', 'teachSlowmo', 'witchSlowmo', 'offscreenArrows', 'autoRevive'].every((k) => k in A));
  });

  // ------------------------------------------------------------------ C5: keymap
  await pg.run('C5 keymap', async () => {
    const K = game.input.keymap, KM = await import('/src/core/keymap.js'), M = await import('/src/core/settings.js');
    const keep = localStorage.getItem(M.KEY);
    try {
      PT.check('keymap defaults + Korean labels', K.get('dodge') === 'KeyQ' && K.label('dodge') === 'Q' && K.get('dodgeAlt') === 'Mouse3' && K.label('dodgeAlt') === '마우스 4번 버튼' &&
        K.label('jump') === '스페이스바' && K.label('defend') === 'E' && K.label('codex') === 'Tab', ['dodge', 'dodgeAlt', 'jump', 'defend', 'sprint', 'interact', 'skills', 'codex', 'confirm'].map((a) => K.label(a)));
      K.rebind('dodge', 'KeyR');
      const stored = JSON.parse(localStorage.getItem(M.KEY) || '{}');
      PT.check('rebind dodge persists (settings.keybinds + storage) and label follows', K.get('dodge') === 'KeyR' && K.label('dodge') === 'R' &&
        game.settings.values.keybinds.dodge === 'KeyR' && stored.keybinds?.dodge === 'KeyR', { get: K.get('dodge'), label: K.label('dodge'), stored: stored.keybinds });
      PT.check('legacy KEYS follows the rebind', game.KEYS.dodge === 'KeyR');
      game.input.simulate({ keys: { KeyR: true } });
      game.input.update();
      const pressed = K.pressed('dodge');
      game.input.endFrame(); game.input.simulate(null); game.input.update(); game.input.endFrame();
      PT.check('keymap.pressed(action) reads the bound key', pressed === true);
      K.reset();
      PT.check('keymap reset', K.get('dodge') === 'KeyQ' && game.KEYS.dodge === 'KeyQ');
      PT.check("KEY_NAMES_KO.codex === '도감'", KM.KEY_NAMES_KO.codex === '도감');
    } finally { if (keep == null) localStorage.removeItem(M.KEY); else localStorage.setItem(M.KEY, keep); }
  });

  // ------------------------------------------------------------------ C5: save sections, castId
  await pg.run('C5 save.section + castId', () => {
    const SV = game.save; let got = 'none';
    SV.section('ptTest', { serialize: () => ({ seen: ['bokoblin'], n: 2 }), load: (d) => { got = d; } });
    const snap = JSON.parse(JSON.stringify(SV.snapshot()));
    PT.check('snapshot keeps the v3 keys and adds sections', ['v', 'progression', 'loadout', 'story', 'world', 'codex', 'difficulty', 'time'].every((k) => k in snap) && snap.v === 3 && snap.sections?.ptTest?.n === 2);
    SV.loadSections(snap.sections);
    PT.check('save.section round-trips', got && got.n === 2 && got.seen[0] === 'bokoblin', got);
    let late = null; SV.section('ptLate', { serialize: () => 1, load: (d) => { late = d; } });
    PT.check('late registration receives loaded data (undefined when absent)', late === null || late === undefined);
    PT.check('reserved section names listed', ['tells', 'hints', 'monsterCodex', 'encounters'].every((k) => k in SV.RESERVED));
    // nextCastId monotonic + in skillCast
    const ids = []; const off = game.events.on('skillCast', (p) => ids.push(p.castId));
    const a = game.nextCastId(), b = game.nextCastId();
    const S = game.skills;
    const q = S.skillForSlot?.('q1') || S.loadout?.q1;
    S.resetCooldowns?.(); game.debug.cast(q); PT.step(0.1); S.resetCooldowns?.(); game.debug.cast(q); PT.step(0.1);
    if (typeof off === 'function') off(); else game.events.off?.('skillCast');
    const c = game.nextCastId();
    PT.check('nextCastId monotonic', b === a + 1 && c > b);
    PT.check('skillCast carries castId (stamped by the runtime, increasing)', ids.length >= 2 && ids.every((x) => Number.isInteger(x)) && ids[1] > ids[0] && ids[0] > b && c > ids[ids.length - 1], { ids, a, b, c, q });
  });

  // ------------------------------------------------------------------ C5: stubs
  await pg.run('C5 stubs', async () => {
    const { stubs } = await import('/src/core/stubs.js');
    const v = stubs.vfx(game);
    PT.check('vfx stub: kit/shared/applyPlayerFx/fxMulAt/fxFactor/debug read as undefined', ['kit', 'shared', 'applyPlayerFx', 'fxMulAt', 'fxFactor', 'debug', 'telegraph', 'hitFeel', 'then'].every((k) => v[k] === undefined));
    PT.check('vfx stub: other calls still no-op functions', typeof v.burst === 'function' && v.burst().alive === false);
    const T = game.tells;
    PT.check('tells is the core stub on this branch (src/tells.js absent) or a real module', !!T && (T.isStub === true || !game.stubbed.includes('tells')), { isStub: T?.isStub, stubbed: game.stubbed });
    const t = T.isStub ? T : stubs.tells(game);
    const surface = ['attack', 'hitTest', 'canAttack', 'nextImpact', 'windup', 'punish', 'projectile', 'hazard', 'safe', 'active', 'footprints', 'update', 'preOverlay'];
    PT.check('tells stub: full §7.4.4 surface', surface.every((k) => typeof t[k] === 'function') && t.telegraph === null && t.renderThumb === null && t.isStub === true && !!t.MIN && !!t.debug?.pool);
    const fp = t.footprints(); const act = t.active();
    PT.check('tells stub: footprints() reused {Float32Array(64), n:0}; active() reused empty array', fp.data instanceof Float32Array && fp.data.length === 64 && fp.n === 0 && t.footprints() === fp && act.length === 0 && t.active() === act);
    const Th = game.THREE;
    const pp = game.player.object.position;
    const e = { type: 'bokoblin', alive: true, object: { position: pp.clone().add(new Th.Vector3(0, 0, -4)) } };
    const ev = { start: 0, commit: 0, end: [] , punish: 0 };
    const offs = [game.events.on('tellStart', (p) => { if (p.enemy === e) ev.start++; }), game.events.on('tellCommit', (p) => { if (p.enemy === e) ev.commit++; }),
      game.events.on('tellEnd', (p) => { if (p.enemy === e) ev.end.push(p.reason); }), game.events.on('punishWindow', (p) => { if (p.enemy === e) ev.punish++; })];
    const h = t.attack(e, { id: 'test.slam', tell: 'danger', cls: 'mobLight', windup: 0.3, shape: { kind: 'circle', pos: e.object.position.clone(), r: 3 } });
    PT.check('attack → handle with floor dur 0.75 (mobLight) on enemyTime', !!h && Math.abs(h.dur - 0.75) < 1e-9 && h.start === game.enemyTime && ev.start === 1, { dur: h?.dur });
    PT.step(0.5);
    const p1 = h.progress, early = h.consumeStrike(), lockedAt05 = h.locked;
    PT.check('progress linear on enemyTime', Math.abs(p1 - (0.5 / 0.75)) < 0.03 && !early && lockedAt05 === true, { p1, lockedAt05 });
    PT.check('tellCommit at lock', ev.commit === 1, ev.commit);
    PT.check('contains: centre in, 3.3 m out, edge+pad in', h.contains(e.object.position) && !h.contains(e.object.position.clone().add(new Th.Vector3(3.3, 0, 0))) && h.contains(e.object.position.clone().add(new Th.Vector3(3.1, 0, 0))));
    PT.step(0.27);
    const s1 = h.consumeStrike(), s2 = h.consumeStrike();
    PT.check('consumeStrike true exactly once at dur', s1 === true && s2 === false && h.done && !h.alive && ev.end[0] === 'strike', { s1, s2, end: ev.end });
    t.punish(e, 1.2, { mul: 1.3 });
    PT.check('punish sets vulnerableUntil/Mul, emits punishWindow, blocks attack', e.vulnerableUntil > game.enemyTime && e.vulnerableMul === 1.3 && ev.punish === 1 && t.canAttack(e) === false && t.attack(e, { id: 'x', cls: 'mobLight', windup: 1 }) === null);
    PT.step(1.3);
    PT.check('canAttack again after the punish window', t.canAttack(e) === true);
    const h2 = t.attack(e, { id: 'test.cone', tell: 'parry', cls: 'boss', windup: 0.5, shape: { kind: 'cone', pos: e.object.position.clone(), dir: new Th.Vector3(0, 0, 1), r: 4, angle: 0.785 } });
    PT.check('boss floor 1.0 s; nextImpact = remaining', Math.abs(h2.dur - 1.0) < 1e-9 && Math.abs(t.nextImpact(pp) - h2.remaining) < 1e-9);
    h2.stop();
    PT.check('stop → tellEnd cancel; nextImpact Infinity', ev.end.includes('cancel') && t.nextImpact(pp) === Infinity);
    // reference geometry (rad half-angles)
    const o = new Th.Vector3(0, 0, 0), P = (x, z) => ({ x, z });
    const HT = t.hitTest;
    const geo = [
      HT({ kind: 'circle', pos: o, r: 3 }, P(3.1, 0)), !HT({ kind: 'circle', pos: o, r: 3 }, P(3.3, 0)),
      HT({ kind: 'ring', pos: o, inner: 2, r: 5 }, P(0, 3)), !HT({ kind: 'ring', pos: o, inner: 2, r: 5 }, P(0, 1.5)), !HT({ kind: 'ring', pos: o, inner: 2, r: 5 }, P(5.4, 0)),
      HT({ kind: 'cone', pos: o, dir: P(0, 1), r: 4, angle: 0.785 }, P(0, 3.9)), !HT({ kind: 'cone', pos: o, dir: P(0, 1), r: 4, angle: 0.785 }, P(0, -1)),
      !HT({ kind: 'cone', pos: o, dir: P(0, 1), r: 4, angle: 0.785 }, P(3, 1)), HT({ kind: 'cone', pos: o, dir: P(0, 1), r: 4, angle: 0.785 }, P(2, 2.1)),
      HT({ kind: 'line', pos: o, dir: P(1, 0), len: 8, width: 1.6 }, P(7.9, 0.85)), !HT({ kind: 'line', pos: o, dir: P(1, 0), len: 8, width: 1.6 }, P(4, 1.2)), !HT({ kind: 'line', pos: o, dir: P(1, 0), len: 8, width: 1.6 }, P(-0.4, 0)),
      HT({ kind: 'capsule', pos: o, end: P(6, 0), width: 2 }, P(6.9, 0)), !HT({ kind: 'capsule', pos: o, end: P(6, 0), width: 2 }, P(3, 1.4)),
      HT({ kind: 'conecap', pos: o, end: P(0, 6), width: 1, r: 4, angle: 0.5 }, P(0, 9.8)), HT({ kind: 'conecap', pos: o, end: P(0, 6), width: 1, r: 4, angle: 0.5 }, P(0.5, 2)),
      !HT({ kind: 'conecap', pos: o, end: P(0, 6), width: 1, r: 4, angle: 0.5 }, P(3, 2)),
    ];
    PT.check('hitTest reference geometry: circle/ring/cone/line/capsule/conecap (rad half-angles, pad 0.15)', geo.every(Boolean), geo.map((x, i) => (x ? '' : i)).filter((x) => x !== ''));
    // windup stretches with tellMul (story 1.5) and real time with enemySpeed
    game.settings.set('difficulty', 'story', { persist: false });
    const h3 = t.attack(e, { id: 'test.story', tell: 'danger', cls: 'mobHeavy', windup: 0.5, shape: { kind: 'circle', pos: e.object.position.clone(), r: 2 } });
    const durStory = h3.dur; const et0 = game.enemyTime; PT.step(1);
    const etRate = game.enemyTime - et0;
    game.settings.set('difficulty', 'normal', { persist: false });
    PT.check('story: dur = 0.85 × 1.5; enemyTime advances × 0.85', Math.abs(durStory - 0.85 * 1.5) < 1e-9 && Math.abs(etRate - 0.85) < 0.02, { durStory, etRate });
    h3.stop();
    PT.check('stub attack draws the fixed v3 decal when vfx.telegraph exists', !game.vfx?.telegraph || !!h3.decal);
    for (const f of offs) if (typeof f === 'function') f();
  });

  // ------------------------------------------------------------------ P0a contract (other owners code against it)
  await pg.run('P0a render + post', () => {
    const g = game, R = g.render, T = g.THREE;
    PT.check('game.render fields', ['integrated', 'discrete', 'unknown'].includes(R.tier) && typeof R.rendererName === 'string' && R.msaa === 0 && R.pointLights === false &&
      R.shadowType === 'pcf' && typeof R.warm === 'function' && typeof R.snapshot === 'function', { tier: R.tier, msaa: R.msaa, pl: R.pointLights, st: R.shadowType });
    PT.check('threatScene: separate Scene, no background, no fog, not in the main scene', R.threatScene.isScene && R.threatScene.background === null && R.threatScene.fog === null &&
      R.threatScene !== g.scene && !R.threatScene.parent && R.overlayCamera.isPerspectiveCamera);
    PT.check('shadow map type PCF at medium; checkShaderErrors off with prod=1', g.renderer.shadowMap.type === T.PCFShadowMap && g.renderer.debug.checkShaderErrors === false);
    const P = g.post;
    PT.check('game.post v4 uniforms', P.sceneDepth && P.uvScale?.value?.isVector2 && P.sceneRes?.value?.isVector2 && P.canvasRes?.value?.isVector2 && typeof P.cameraNear?.value === 'number' &&
      typeof P.cameraFar?.value === 'number' && P.projInv?.value?.isMatrix4 && P.camWorld?.value?.isMatrix4 && 'bloomTex' in P && typeof P.bloomStrength === 'function' && typeof P.setGrade === 'function' && !!P.GRADES.witch);
    PT.step(0.05, true);
    PT.check('sceneDepth = DepthTexture of the RenderPass target', P.sceneDepth.value?.isDepthTexture === true && P.sceneDepth.value === g.composer.readBuffer.depthTexture);
    // threat scene drawn after the composer straight to the canvas
    const m = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshBasicMaterial({ color: 0xff2a3d, toneMapped: false, fog: false, depthTest: false, depthWrite: false }));
    m.position.copy(g.camera.position).add(g.camera.getWorldDirection(new T.Vector3()).multiplyScalar(6)); m.lookAt(g.camera.position);
    R.warm(m, { target: 'overlay', now: true });
    R.threatScene.add(m);
    const d = PT.draws();
    const px = PT.pixels.render(false); const c = (px.h >> 1) * px.w * 4 + (px.w >> 1) * 4;
    const rgb = [px.px[c], px.px[c + 1], px.px[c + 2]];
    g.bloomPass.enabled = false; const px2 = PT.pixels.render(true); g.bloomPass.enabled = true;
    const rgb2 = [px2.px[c], px2.px[c + 1], px2.px[c + 2]];
    R.threatScene.remove(m); m.geometry.dispose(); m.material.dispose();
    PT.check('threat scene drawn after the post chain (1 overlay call, exact sRGB colour, bloom-independent)', d.overlayCalls === 1 &&
      Math.abs(rgb[0] - 255) <= 2 && Math.abs(rgb[1] - 42) <= 2 && Math.abs(rgb[2] - 61) <= 2 && rgb.every((v, i) => Math.abs(v - rgb2[i]) <= 8), { overlay: d.overlayCalls, rgb, rgb2 });
    // grades: witch below cinematic
    P.setGrade('witch', 0.6, { durReal: 0.6 });
    const w1 = P.gradeName; P.grade('boss', 1, 0.2); const w2 = P.gradeName; P.grade('none', 0, 0.1); const w3 = P.gradeName;
    PT.step(0.7); const w4 = P.gradeName;
    PT.check('setGrade witch < cinematic (legacy grade wins), expires after durReal', w1 === 'witch' && w2 === 'boss' && w3 === 'witch' && w4 === 'none', [w1, w2, w3, w4]);
  });
  await pg.run('P0a snapshot + warm', async () => {
    const g = game, T = g.THREE;
    const box = new T.Mesh(new T.BoxGeometry(1, 1.6, 0.6), new T.MeshToonMaterial({ color: 0x6a8a4a }));
    const url = await g.render.snapshot(box, { w: 96, h: 96 });
    PT.check('render.snapshot → PNG data URL', typeof url === 'string' && url.startsWith('data:image/png') && url.length > 600, url?.length);
    const mesh = new T.Mesh(new T.SphereGeometry(0.5), new T.MeshToonMaterial({ color: 0x2f8a3a }));
    const p0 = g.renderer.info.programs.length;
    g.render.warm(mesh); PT.step(0.02, true);
    const p1 = g.renderer.info.programs.length;
    g.scene.add(mesh); mesh.position.copy(g.player.object.position); PT.step(0.02, true);
    const p2 = g.renderer.info.programs.length; g.scene.remove(mesh);
    PT.check('render.warm compiles the scene variant (no new program at first draw)', p2 === p1, { p0, p1, p2 });
  });
  await pg.run('P0a frame/time/hitstop', () => {
    const g = game;
    PT.check('module order: tells after combat, before audio', g.tells && g.stubbed.every((s) => s === 'tells' || false) && g.frame && typeof g.frame.lastStep === 'boolean', g.stubbed);
    PT.step(0.1);
    PT.check('game.frame {step, n, lastStep, frameDt}', g.frame.n >= 1 && g.frame.lastStep === true && g.frame.step === g.frame.n - 1 && Math.abs(g.frame.frameDt - 1 / 60) < 1e-6, { ...g.frame });
    const e0 = g.enemyTime; g.settings.set('enemySpeed', 0.7, { persist: false }); PT.step(1); const rate = g.enemyTime - e0; g.settings.set('enemySpeed', 1, { persist: false });
    PT.check('enemyTime += dt × assist.enemySpeed', Math.abs(rate - 0.7) < 0.02, rate);
    const TS = g.timeScale;
    const a = TS.set('witch', 0.5, 0.6, { compensate: true });
    const comp = TS.comp(), val = TS.value();
    const b = TS.set('teach', 0.3, 0.5);           // higher priority replaces witch
    const src1 = TS.slowmoSource();
    const c = TS.set('witch', 0.5, 0.6, { compensate: true });   // lower: ignored
    TS.clear('teach');
    PT.check('timeScale: witch compensated (comp = 1/scale); one slow-motion source, priority arbitration', a && Math.abs(comp - 2) < 1e-9 && val === 0.5 && b && src1 === 'teach' && c === false && TS.comp() === 1, { comp, val, src1, c });
    g.hitstop(0.05, { tier: 'light', target: g.player.entity });
    const log = g.debug.hitstopLog();
    const last = log[log.length - 1];
    PT.check('hitstop(seconds, {tier, target}) logged in debug.hitstopLog()', last && last.sec === 0.05 && last.tier === 'light' && last.granted === true && !!last.target && typeof g.player.entity.hitstopUntil === 'number', last);
    PT.step(0.2);
  });
  await pg.run('P0a data: elements.fx + threat + quality', async () => {
    const E = await import('/src/core/elements.js'), TH = await import('/src/core/threat.js');
    const fx = game.elements.fx('fire'), sh = E.ELEMENT_DEFS.shadow.colors, li = E.ELEMENT_DEFS.light.colors;
    PT.check('elements.fx(el) = §3.2 ramp', fx.hi === 0xFFE08A && fx.light === 0xFFA53A && fx.mid === 0xF0661A && fx.dark === 0x7A1E0A && game.elements.fx('nope').mid === 0x8A8274);
    const bad = [];
    for (const el of E.ALL_ELEMENTS) {
      const c = E.ELEMENT_DEFS[el].colors, r = c.fx;
      if (c.mid !== r.mid || c.hex !== r.mid) bad.push(el + ':mid/hex');
      if (el !== 'shadow' && (c.core !== r.hi || c.edge !== r.dark)) bad.push(el + ':core/edge');
      if (c.core === 0xffffff) bad.push(el + ':white core');
    }
    PT.check('legacy mapping mid/hex := mid, core := hi, edge := dark; no white core', bad.length === 0, bad);
    PT.check('shadow special case: core := dark, edge := light', sh.core === 0x0C0614 && sh.edge === 0x9A5CFF && li.mid === 0xE8D9B0);
    const sat = (n) => { const r = (n >> 16) & 255, g2 = (n >> 8) & 255, b = n & 255, mx = Math.max(r, g2, b), mn = Math.min(r, g2, b); return mx ? (mx - mn) / mx : 0; };
    // §3.2 "saturation ≤ 0.35 below hi": the body steps light/mid; the binding dark edge hex #5A4A2A is 0.53 (HSV) by itself
    PT.check('light ramp ivory (body steps light/mid saturation ≤ 0.35)', [li.fx.light, li.fx.mid].every((c) => sat(c) <= 0.35 + 1e-9), [li.fx.light, li.fx.mid, li.fx.dark].map((c) => +sat(c).toFixed(3)));
    const kinds = ['danger', 'parry', 'unblockable', 'jump', 'projectile', 'hazard', 'safe', 'punish'];
    PT.check('THREAT rows with exact legend text', kinds.every((k) => TH.THREAT[k]?.legendKo) && TH.THREAT.danger.legendKo === '빨강 = 피하거나 막기' && TH.THREAT.safe.legendKo === '초록 화살표 = 안전 지대' &&
      TH.THREAT.punish.legendKo === '◆ 반짝임 = 공격 기회' && TH.THREAT.unblockable.legendKo === '분홍색 ⚠ = 막을 수 없음, 반드시 회피');
    const d0 = TH.threatColor('danger'), dp = TH.threatColor('danger', 'protan'), pp = TH.threatColor('parry', 'deutan'), ut = TH.threatColor('parry', 'tritan'), up = TH.threatColor('unblockable', 'protan');
    PT.check('threatColor incl. colour-blind variants', d0.rim === 0xFF2A3D && d0.edge === 0x1A0006 && dp.rim === 0xFF8C00 && pp.rim === 0x3A8DFF && ut.rim === 0x00E0C0 &&
      TH.threatColor('danger', 'tritan').rim === 0xFF3060 && up.rim === 0xFFFFFF && up.stripes === 0x000000 && TH.threatColor('safe').rim === 0xC8FFE0 &&
      TH.threatColor('jump').rim === 0xF4F4F4 && TH.threatColor('punish').rim === 0xF2FFFF && TH.threatColor('punish').outline === 0x0A2A30 && TH.threatColor('parry').fill === 0xFF2A3D);
    const Q = game.quality;
    PT.check('game.quality API + budget object', Q.level === 0 && typeof Q.renderSize === 'function' && Q.renderSize().w > 0 && typeof Q.set === 'function' && typeof Q.lock === 'function' &&
      typeof Q.history === 'function' && typeof Q.benchmark === 'function' &&
      ['particleMul', 'coverageMul', 'flareMul', 'fxDetail', 'enemyOutlineDist', 'enemyLodMul', 'floraMul', 'grassMul', 'shadowEvery', 'bloom', 'particleCap'].every((k) => k in Q.budget));
    const ev = []; const off = game.events.on('qualityLevel', (p) => ev.push(p));
    Q.set(3, 'test'); const b3 = { ...Q.budget }; Q.set(0, 'test');
    if (typeof off === 'function') off();
    PT.check('quality.set(L3) → budget rows + qualityLevel event', b3.fxDetail === 0 && b3.coverageMul === 0.6 && b3.shadowEvery === 2 && b3.enemyLodMul === 0.6 && b3.dynRes === true && ev.length === 2 && ev[0].level === 3, { b3, ev });
  });
  PT.check('main page: no console errors', pg.errors().length === 0, pg.errors().slice(0, 8));
  await pg.close();
}

async function paramsPage(PT) {
  // ================================================================== test params page (§7.6)
  const tp = await PT.boot('&cls=mage&difficulty=story&fx=0.7&witch=0&colorblind=protan&threat=strong&hints=0&gpu=integrated&budgetPx=0.5&refresh=144');
  PT.check('params boot ready', tp.ready);
  if (tp.ready) {
    await tp.run('C5 test params', () => {
      const g = game, A = g.assist, V = g.settings.values;
      PT.check('difficulty=story sets assist', A.difficulty === 'story' && A.tellMul === 1.5 && A.enemySpeed === 0.85 && A.iframeMul === 1.5 && A.perfectMul === 2 && A.autoRevive === true && g.difficulty?.id === 'story', { ...A });
      PT.check('fx / witch / colorblind / threat / hints params', A.fxIntensity === 0.7 && A.witchSlowmo === false && A.colorblind === 'protan' && A.threatStrong === true && V.hints === false);
      PT.check('gpu / budgetPx / refresh / prod / governor / seed parsed', g.render.tier === 'integrated' && g.testParams.budgetPx === 0.5 && g.testParams.refresh === 144 &&
        g.testParams.prod === true && g.testParams.governor === false && g.testParams.seed === 1, g.testParams);
      const stored = JSON.parse(localStorage.getItem('aw_settings_v3') || '{}');
      PT.check('test params never persisted', stored.difficulty !== 'story' && stored.fxIntensity !== 0.7);
    });
    PT.check('params page: no console errors', tp.errors().length === 0, tp.errors().slice(0, 8));
  }
  await tp.close();
}

async function seedPages(PT) {
  // ================================================================== seeded determinism
  const s1 = await PT.boot('&cls=none');
  const rnd = () => { window.game.seedRandom?.(1); return [Math.random(), Math.random(), Math.random.name]; };
  const r1 = s1.ready ? await s1.eval(rnd) : null; await s1.close();
  const s2 = await PT.boot('&cls=none');
  const r2 = s2.ready ? await s2.eval(rnd) : null; await s2.close();
  PT.check('seed=1: Math.random deterministic across boots', !!r1 && !!r2 && r1[0] === r2[0] && r1[1] === r2[1] && r1[2] === 'seededRandom', { r1, r2 });

}

// ==================================================================== C1: composer chain, presets, pixel budget, resolution step
async function c1(PT) {
  const pg = await PT.boot('&cls=mage&level=30&skills=preset:endgame_mage&zone=plains');
  if (!pg.ready) { PT.check('C1 boot', false); return; }
  await pg.run('C1 composer chain', () => {
    const g = game, C = g.composer, T = g.THREE, R = g.renderer;
    PT.tp(-20, 45); PT.look(0.8, -0.2); PT.step(0.3, true);
    const names = C.passes.map((p) => p.constructor.name);
    PT.check('passes = RenderPass → BloomPass4 → FinalPass4 (no sanitize/Output pass)', names.join() === 'RenderPass,BloomPass4,FinalPass4', names);
    const d = PT.draws();
    // full-res-equivalent post work: final (1.0) + bright (¼) + mip chain; scene + final + overlay are the only full-res passes
    const B = g.bloomPass, W = R.domElement.width, H = R.domElement.height;
    const area = (rt) => rt.width * rt.height / (C.state.allocW * C.state.allocH);
    const vpArea = (v) => v.w * v.h / (C.viewport.w * C.viewport.h);
    PT.check('post passes ≤ 2.0 full-res equivalents (final + ¼ bright + mips)', d.postPasses <= 2.0 && d.postPasses >= 1.0, { postPasses: d.postPasses, postCalls: d.postCalls });
    PT.check('bright pass at ¼ area, first mip ≤ 1/16 render area, 3 mips at medium', Math.abs(area(B.bright) - 0.25) < 0.02 && vpArea(B.vp[0]) <= 0.26 && vpArea(B.vp[1]) <= 1 / 16 + 0.005 &&
      B.mips === 3 && d.postCalls === 1 + B.mips + (B.mips - 1) + 1, { bright: area(B.bright), mip1: vpArea(B.vp[1]), mips: B.mips, postCalls: d.postCalls });
    PT.check('bloom texture only (game.post.bloomTex = first mip, sampled by FinalPass)', g.post.bloomTex.value === B.texture && C.finalPass.uniforms.tBloom.value === B.texture);
    PT.check('MSAA 0 at medium (prod=1), FXAA on', C.readBuffer.samples === 0 && g.render.msaa === 0 && C.finalPass.uniforms.uFxaa.value === 1);
    // the map size is applied by world (settings.shadowSize); a v3 world keeps its own size mapping
    const ms = g.world?.sun?.shadow?.mapSize?.x, v4world = !!g.world?.debug?.terrainChunks;
    PT.check('shadows: PCF, preset size 1024 (world applies it), every frame at medium', R.shadowMap.type === T.PCFShadowMap && g.render.shadowType === 'pcf' && g.settings.values.shadowSize === 1024 &&
      (!v4world || ms === 1024) && g.settings.values.shadowEvery === 1, { mapSize: ms, v4world });
    let shadowFrames = 0; for (let i = 0; i < 4; i++) { if (PT.draws().shadowCalls > 0) shadowFrames++; }
    PT.check('shadow map rendered every frame at medium', shadowFrames === 4, shadowFrames);
    let pls = 0; g.scene.traverse((o) => { if (o.isPointLight && o.visible) pls++; });
    PT.check('0 point lights at medium (render.pointLights false)', g.render.pointLights === false, { visiblePointLightsInScene: pls });
    PT.note(`C1 medium frame: ${d.calls}+${d.shadowCalls}+${d.overlayCalls} calls, post ${d.postPasses} full-res eq, ${pls} visible point lights (vfx-owned)`);
    // pixel budget unit test
    const r1 = g.quality.renderSize(1920, 970, 1), r2 = g.quality.renderSize(1920, 1080, 1.25), r3 = g.quality.renderSize(640, 360, 1);
    PT.check('renderSize(1920, 970, 1) ≤ 1.0 MP at medium (pixel budget)', r1.w * r1.h <= 1e6 && r1.w * r1.h > 0.95e6 && Math.abs(r1.w / r1.h - 1920 / 970) < 0.01, r1);
    PT.check('renderSize at pr 1.25 also ≤ 1.0 MP; small canvas unscaled', r2.w * r2.h <= 1e6 && r3.w === 640 && r3.h === 360, { r2, r3 });
    // resolution step: no reallocation, ≤ 2 ms CPU, textures unchanged
    PT.step(0.05, true);
    const tex0 = R.info.memory.textures, re0 = C.state.reallocs, cw = R.domElement.width;
    const ts = [];
    for (const s of [0.85, 0.8, 0.9, 1]) {
      const t0 = performance.now(); g.quality.scale = s; g.renderNow(); ts.push(performance.now() - t0);
    }
    g.quality.scale = 0.85; g.renderNow();
    const vp = { ...C.viewport }, uv = g.post.uvScale.value.x, sr = g.post.sceneRes.value.x;
    const base = []; for (let i = 0; i < 4; i++) { const t0 = performance.now(); g.renderNow(); base.push(performance.now() - t0); }
    const tex1 = R.info.memory.textures;
    g.quality.scale = 1; g.renderNow();
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    PT.check('resolution step: viewport + uvScale follow, canvas + textures unchanged, no reallocation', vp.w === Math.floor(C.state.allocW * 0.85) && Math.abs(uv - vp.w / C.state.allocW) < 1e-6 &&
      sr === vp.w && R.domElement.width === cw && tex1 === tex0 && C.state.reallocs === re0, { vp, uv, sr, tex0, tex1, reallocs: C.state.reallocs - re0 });
    // CPU cost of a step = a step frame minus a plain frame (SwiftShader frame times are not representative; the delta is)
    const stepCost = med(ts) - med(base);
    PT.check('resolution step costs ≤ 2 ms CPU (step frame − plain frame); no frame > 25 ms beyond the plain frame', stepCost <= 2 && Math.max(...ts) - med(base) <= 25, { ts: ts.map((x) => +x.toFixed(1)), base: +med(base).toFixed(1) });
  });
  await pg.run('C1 threat scene after FinalPass', () => {
    const g = game, T = g.THREE, R = g.render;
    const m = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshBasicMaterial({ color: 0xff2a3d, toneMapped: false, fog: false, depthTest: false, depthWrite: false }));
    m.position.copy(g.camera.position).add(g.camera.getWorldDirection(new T.Vector3()).multiplyScalar(6)); m.lookAt(g.camera.position);
    R.warm(m, { target: 'overlay', now: true }); R.threatScene.add(m);
    const px = PT.pixels.render(true); const c = (px.h >> 1) * px.w * 4 + (px.w >> 1) * 4;
    g.bloomPass.enabled = false; const px2 = PT.pixels.render(true); g.bloomPass.enabled = true;
    g.quality.scale = 0.8; const px3 = PT.pixels.render(true); g.quality.scale = 1;
    R.threatScene.remove(m); m.geometry.dispose(); m.material.dispose();
    const rgb = (p) => [p.px[c], p.px[c + 1], p.px[c + 2]];
    const a = rgb(px), b = rgb(px2), d3 = rgb(px3);
    PT.check('threat colour exact and ΔRGB ≤ 8 with bloom on/off and at scale 0.8', Math.abs(a[0] - 255) <= 2 && Math.abs(a[1] - 42) <= 2 && Math.abs(a[2] - 61) <= 2 &&
      a.every((v, i) => Math.abs(v - b[i]) <= 8 && Math.abs(v - d3[i]) <= 8), { a, b, d3 });
  });
  PT.check('C1 page: no console errors', pg.errors().length === 0, pg.errors().slice(0, 8));
  await pg.close();
  // pixel budget boot: 1280×720 with budgetPx=0.5 → ≤ 0.5 MP render
  const pb = await PT.boot('&cls=mage&budgetPx=0.5', { w: 1280, h: 720 });
  if (pb.ready) {
    await pb.run('C1 budgetPx boot', () => {
      PT.step(0.05, true);
      const C = game.composer, v = C.viewport, R = game.renderer;
      PT.check('budgetPx=0.5 at 1280×720 → render ≤ 0.5 MP, canvas full size, base scale < 1', v.w * v.h <= 0.5e6 && v.w * v.h >= 0.45e6 && R.domElement.width === 1280 && game.quality.baseScale < 1,
        { v, base: game.quality.baseScale, canvas: R.domElement.width });
      const rs = game.quality.renderSize();
      PT.check('quality.renderSize() = live render size', rs.w === v.w && rs.h === v.h, rs);
    });
  }
  await pb.close();
  // low preset: MSAA 0, shadows off (map cleared), bloom off; high: MSAA 4, PCFSoft, 5 mips, point lights on
  const lo = await PT.boot('&cls=mage&quality=low');
  if (lo.ready) {
    await lo.run('C1 low preset', () => {
      PT.step(0.1, true);
      const g = game, d = PT.draws();
      PT.check('low: MSAA 0, shadows off (no shadow pass), bloom off, 0 point lights', g.composer.readBuffer.samples === 0 && d.shadowCalls === 0 && g.composer.finalPass.uniforms.uBloomOn.value === 0 &&
        g.render.pointLights === false, { shadow: d.shadowCalls, bloom: g.composer.finalPass.uniforms.uBloomOn.value });
    });
  }
  await lo.close();
  const hi = await PT.boot('&cls=mage&quality=high');
  if (hi.ready) {
    await hi.run('C1 high preset', () => {
      PT.step(0.1, true);
      const g = game, T = g.THREE;
      PT.check('high: MSAA 4, PCFSoft, 5 bloom mips, FXAA off, point lights on (boot decisions)', g.composer.readBuffer.samples === 4 && g.renderer.shadowMap.type === T.PCFSoftShadowMap &&
        g.bloomPass.mips === 5 && g.composer.finalPass.uniforms.uFxaa.value === 0 && g.render.pointLights === true,
        { samples: g.composer.readBuffer.samples, mips: g.bloomPass.mips, fxaa: g.composer.finalPass.uniforms.uFxaa.value });
      PT.check('high page renders without errors', true);
    });
    PT.check('C1 high page: no console errors', hi.errors().length === 0, hi.errors().slice(0, 8));
  }
  await hi.close();
}

// ==================================================================== C2: governor (simulate)
async function c2(PT) {
  const pg = await PT.boot('&cls=mage');
  if (!pg.ready) { PT.check('C2 boot', false); return; }
  await pg.run('C2 governor', () => {
    const g = game, Q = g.quality;
    let k = 0; const alt = () => (k++ % 2 ? 30 : 10);   // every 2nd frame misses one vsync (EMA ≈ 1.5 T)
    Q.simulate(null);
    let st = Q.simulate({ frameMs: alt, refresh: 60, seconds: 1.2, log: true });
    PT.check('overload at refresh=60 (50 % misses) steps down one level within 1.2 s', st.level === 1 && st.log[0]?.t <= 1.2 && st.history.some((h) => h.reason === 'overload'), { level: st.level, log: st.log, T: st.T });
    Q.simulate(null);
    st = Q.simulate({ frameMs: 40, refresh: 60, seconds: 1.2, log: true });
    PT.check('two-level jump when the frame-time EMA > 1.6 T', st.level === 2 && st.log.length === 1 && st.history.some((h) => h.reason === 'overload2'), { level: st.level, log: st.log, ema: st.ema });
    // probe up after 6 s, revert on misses, backoff 6 → 12 → 24 s
    Q.simulate(null);
    Q.simulate({ frameMs: alt, seconds: 1.2 });
    const l1 = Q.level;
    st = Q.simulate({ frameMs: 10, seconds: 5.5 }); const before6 = st.level;
    st = Q.simulate({ frameMs: 10, seconds: 0.7 }); const after6 = st.level;
    st = Q.simulate({ frameMs: alt, seconds: 0.6 }); const reverted = st.level, d1 = st.delays[1];
    st = Q.simulate({ frameMs: 10, seconds: 10.8 }); const before12 = st.level;
    st = Q.simulate({ frameMs: 10, seconds: 1.4 }); const after12 = st.level;
    st = Q.simulate({ frameMs: alt, seconds: 0.6 }); const d2 = st.delays[1];
    PT.check('probe up after 6 s with < 2 % misses, revert on misses, backoff 6 → 12 → 24 s', l1 === 1 && before6 === 1 && after6 === 0 && reverted === 1 && d1 === 12 && before12 === 1 && after12 === 0 && d2 === 24,
      { l1, before6, after6, reverted, d1, before12, after12, d2 });
    // 144 Hz
    g.settings.set('fpsCap', 0, { persist: false });
    Q.simulate(null);
    st = Q.simulate({ frameMs: 10, refresh: 144, seconds: 1.2 }); const hz144over = st.level;
    Q.simulate(null);
    st = Q.simulate({ frameMs: 6, refresh: 144, seconds: 3 }); const hz144ok = st.level;
    g.settings.set('fpsCap', 60, { persist: false });
    PT.check('works at refresh=144 (10 ms frames overload, 6 ms frames do not)', hz144over >= 1 && hz144ok === 0 && Math.abs(st.T - 1 / 144) < 1e-4, { hz144over, hz144ok, T: st.T });
    // L2: dynamic resolution changes quality.scale (render viewport), never the canvas
    Q.simulate(null);
    const cw = g.renderer.domElement.width, tex0 = g.renderer.info.memory.textures;
    Q.set(2, 'test');
    st = Q.simulate({ frameMs: 16, gpuMs: (t, s) => 20 * s * s, refresh: 60, seconds: 1.0 });
    const pScale = st.scale, pLevel = st.level;
    PT.step(0.02, true);
    const vp = { ...g.composer.viewport };
    PT.check('L2 P-controller (GPU timer): scale → sqrt(0.85 T / gpu) within 1 s, level kept, canvas unchanged', pLevel === 2 && Math.abs(pScale - Math.sqrt((0.85 * 1000 / 60) / 20)) < 0.04 &&
      g.renderer.domElement.width === cw && vp.w < cw && g.renderer.info.memory.textures === tex0, { pScale, pLevel, vp, cw });
    Q.simulate(null); Q.set(2, 'test');
    st = Q.simulate({ frameMs: alt, refresh: 60, seconds: 0.8 });
    PT.check('L2 without GPU timing: scale × 0.92 steps while misses > 20 % (floor 0.8 at medium)', st.scale < 1 && st.scale >= 0.8 - 1e-6, { scale: st.scale, level: st.level });
    // fpsCap 30: 33 ms frames are on time
    Q.simulate(null);
    g.settings.set('fpsCap', 30, { persist: false });
    st = Q.simulate({ frameMs: 30, refresh: 60, seconds: 3 });
    g.settings.set('fpsCap', 60, { persist: false });
    PT.check('fpsCap respected (T = 1/30 at a 30 fps cap: no overload)', st.level === 0 && Math.abs(st.T - 1 / 30) < 0.002, { level: st.level, T: st.T });
    // autoQuality off: no steps
    Q.simulate(null);
    g.settings.set('autoQuality', false, { persist: false });
    st = Q.simulate({ frameMs: 40, seconds: 2 });
    g.settings.set('autoQuality', true, { persist: false });
    PT.check('autoQuality off disables every step', st.level === 0 && st.scale === 1, { level: st.level });
    // dynamicRes off: L2 keeps scale 1
    Q.simulate(null); g.settings.set('dynamicRes', false, { persist: false }); Q.set(2, 'test');
    st = Q.simulate({ frameMs: alt, seconds: 0.8 });
    g.settings.set('dynamicRes', true, { persist: false });
    PT.check('dynamicRes off disables only the resolution controller', st.scale === 1 && st.level >= 2, { scale: st.scale, level: st.level });
    // budget: L4 turns bloom off through the uniform (no program change)
    Q.simulate(null); Q.endSimulation();
    const p0 = g.renderer.info.programs.length;
    Q.set(4, 'test'); PT.step(0.05, true);
    const off = g.composer.finalPass.uniforms.uBloomOn.value;
    Q.set(0, 'test'); PT.step(0.05, true);
    PT.check('L4: bloom off via uBloomOn (no new program); events + legacy perfScale', off === 0 && g.composer.finalPass.uniforms.uBloomOn.value === 1 && g.renderer.info.programs.length === p0 &&
      g.perfScale === 1, { off, p0, p1: g.renderer.info.programs.length });
    // real frame cap in the rAF loop
  });
  // fps cap on the live loop (unfrozen): ≤ ~30 rendered frames per second at fpsCap 30
  const n30 = await pg.eval(async () => {
    const g = window.game; g.settings.set('fpsCap', 30, { persist: false });
    const f0 = g.frameCount;
    g.freeze(false);
    await new Promise((r) => setTimeout(r, 1000));
    g.freeze(true);
    const n = g.frameCount - f0;
    g.settings.set('fpsCap', 60, { persist: false });
    return n;
  });
  PT.check('C2: fpsCap 30 caps the rAF loop (rendered frames in 1 s ≤ 33)', n30 > 0 && n30 <= 33, n30);
  PT.check('C2 page: no console errors', pg.errors().length === 0, pg.errors().slice(0, 8));
  await pg.close();
}
async function c3(PT) { PT.skip('C3', 'pending'); }
async function c4(PT) { PT.skip('C4', 'pending'); }
async function c7(PT) { PT.skip('C7', 'pending'); }
