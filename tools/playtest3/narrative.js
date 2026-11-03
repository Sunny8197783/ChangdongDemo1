// playtest3 section: narrative (story, cinematics, audio). Owned by narrative. CONTRACT §16, §17, §20 (audio), §21 check 8.
//  - static: rules 7 / 8 / 9 on the narrative files, the removed v2 path dialogue and victory listener, the stage table
//  - golem → reveal (not victory); both branch orders reach ascent; debugSkip + killBoss through every boss stage
//  - final → finale → ending → exactly one `victory`, none before bossDefeated{final:true}; the fanfare on bossDefeated{final}
//  - class pick with the ui panel and with the 6-option dialogue fallback (ui stubbed); training counts skillCast once per cast
//  - NPC talk through game.interact; serialize / deserialize (incl. tips); every cinematic skippable and restoring state
//  - audio: 9-element recipes, rx_<id> for all 49 ids (map or family fallback), UI / weapon cues, zone + final_boss music
const fs = require('fs'); const path = require('path');

const FILES_RE = /^(src\/story\.js|src\/story\/|src\/cinematic\.js|src\/cinematic\/|src\/audio\.js|src\/audio\/)/;

module.exports = async function narrative(PT) {
  // ------------------------------------------------------------ static checks
  {
    const files = ['src/story.js', 'src/cinematic.js', 'src/audio.js'];
    for (const d of ['src/story', 'src/cinematic', 'src/audio']) for (const f of fs.readdirSync(path.join(PT.root, d))) if (f.endsWith('.js')) files.push(d + '/' + f);
    const bad7 = [], bad8 = [], bad9 = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(PT.root, f), 'utf8').split('\n');
      src.forEach((l, i) => {
        if (/=== ?'(sword|mage)'/.test(l)) bad8.push(`${f}:${i + 1}`);
        if (/for \(let \w+ = 0; \w+ < 5;/.test(l) || /\['fire', 'ice', 'lightning', 'wind', 'earth'\]/.test(l)) bad9.push(`${f}:${i + 1}`);
        const m = /^\s*import\s.*from\s+'([^']+)'/.exec(l);
        if (m) {
          const spec = m[1];
          const resolved = spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(f), spec)) : spec;
          const ok = spec === 'three' || spec.startsWith('three/addons/') || resolved.startsWith('src/core/') || FILES_RE.test(resolved);
          if (!ok) bad7.push(`${f}:${i + 1} ${spec}`);
        }
      });
    }
    PT.check('rule 7: narrative files import only own files, src/core/* and three', bad7.length === 0, bad7);
    PT.check('rule 8: no class literals in narrative files', bad8.length === 0, bad8);
    PT.check('rule 9: no 5-element loops/arrays in narrative files', bad9.length === 0, bad9);
    const story = fs.readFileSync(path.join(PT.root, 'src/story.js'), 'utf8');
    const script = fs.readFileSync(path.join(PT.root, 'src/story/script.js'), 'utf8');
    PT.check('story no longer listens to victory', !/events\.on\('victory'/.test(story));
    PT.check('path dialogue removed (PATH_DESC / pathExplain / elementPick / Digit1-5)', !/PATH_DESC|pathExplain|elementPick/.test(script + story) && !/Digit1', 'Digit2'/.test(story));
    PT.check('story emits victory exactly in one place', (story.match(/emit\('victory'/g) || []).length === 1);
    const audio = fs.readFileSync(path.join(PT.root, 'src/audio.js'), 'utf8');
    PT.check('charge pitch from ELEMENT_DEFS.sfxBase', /ELEMENT_DEFS\[o\.element\]\?\.sfxBase/.test(audio));
    PT.check('fanfare moved off the victory event', !/on\('victory', \(\) => \{ play\('victory'/.test(audio) && /p\?\.final[\s\S]{0,200}play\('victory'/.test(audio));
    const intro = fs.readFileSync(path.join(PT.root, 'src/cinematic/intro.js'), 'utf8');
    PT.check('intro loops use SPIRITS.length', !/i < 5|\/ 5\)/.test(intro));
  }

  // ------------------------------------------------------------ boot 1: the stage machine
  const pg = await PT.boot('&cls=mage&cine=1');
  PT.check('boot: ready', pg.ready);
  if (!pg.ready) { await pg.close(); return; }
  PT.check('boot: no console errors', pg.errors().length === 0, pg.errors().slice(0, 5));

  // shared in-page helpers
  await pg.eval(() => {
    const g = game;
    window.NT = {
      seq: [],
      skipCine(max = 12) { for (let i = 0; i < max && g.cinematic?.active; i++) { g.cinematic.skip(); PT.step(0.6); } return !g.cinematic?.active; },
      settle(sec = 3) { const n = Math.ceil(sec / 0.5); for (let i = 0; i < n; i++) { PT.step(0.5); if (g.cinematic?.active) NT.skipCine(); } },
      bossId() { const b = g.enemies?.boss; return b && b.alive !== false && !b.defeated ? (b.bossId || b.id) : null; },
      kill() { const r = g.debug.killBoss(); PT.step(0.2); return r; },
      killAndWait(sec = 8) { NT.kill(); for (let i = 0; i < sec * 4 && NT.bossId(); i++) { PT.step(0.25); if (g.cinematic?.active && g.cinematic.mode === 'world') NT.skipCine(); } NT.settle(3.5); },
    };
    g.events.on('bossDefeated', (p) => NT.seq.push('bd:' + p.id + ':' + (p.final ? 1 : 0)));
    g.events.on('victory', () => NT.seq.push('victory'));
    g.events.on('questStart', (p) => NT.seq.push('q:' + p.id));
  });

  await pg.run('stage table', () => {
    const S = game.story;
    const ids = ['wake', 'choose', 'training', 'updraft', 'camps', 'boss', 'reveal', 'mirwen', 'hydra', 'elderwood', 'nox', 'treant', 'ascent', 'kalis', 'final', 'ending', 'done'];
    PT.check('QUESTS lists all 17 stages in order', JSON.stringify(S.STAGES) === JSON.stringify(ids), S.STAGES);
    PT.check('every stage has a Korean title (except none)', S.QUESTS.every((q) => typeof q.title === 'string' && /[가-힣]/.test(q.title)));
    PT.check('regionOrder is a readable array', Array.isArray(S.regionOrder));
    PT.check('hasPrompt shim works', typeof S.hasPrompt() === 'boolean');
  });

  await pg.run('test isolation: no auto cinematics without &cine=1', () => {
    const g = game, S = g.story;
    S.autoCinematics = false;
    S.debugSkip('boss'); PT.step(0.3);
    NT.kill(); PT.step(3.5);
    PT.check('golem kill → reveal without a cutscene (other owners\' tests never stall)', S.stage === 'reveal' && g.state === 'playing' && !g.cinematic.active, [S.stage, g.state]);
    S.autoCinematics = true;
  });

  await pg.run('golem → reveal', () => {
    const g = game, S = g.story;
    S.debugSkip('boss');
    PT.step(0.3);
    PT.check('golem spawned on the boss stage', NT.bossId() === 'golem', NT.bossId());
    const v0 = PT.countEvents('victory');
    NT.kill();
    PT.check('stage becomes reveal (not victory)', S.stage === 'reveal', S.stage);
    PT.check('no victory from the golem', PT.countEvents('victory') === v0);
    PT.check('seals broken', !!g.progression.sealsBroken);
    PT.step(3.2);
    PT.check('reveal cinematic plays', !!g.cinematic.active, g.cinematic.shotIndex);
    const prog0 = g.renderer.info.programs?.length || 0;
    PT.step(2);
    PT.check('reveal: no new programs mid-cinematic', (g.renderer.info.programs?.length || 0) <= prog0 + 0, [prog0, g.renderer.info.programs?.length]);
    NT.skipCine();
    PT.check('reveal skippable → playing, input unlocked', !g.cinematic.active && g.state === 'playing' && !g.input.isLocked?.('cinematic'), [g.state, g.cinematic.active]);
    PT.check('the reveal objective points at the sage', /이솔데/.test(S.getObjective()?.desc || ''), S.getObjective()?.desc);
  });

  await pg.run('sage talk + elder line', () => {
    const g = game, S = g.story;
    const n = S.npcs.sage; const pp = g.player.object.position;
    PT.tp(n.pos.x + 1.5, n.pos.z + 0.5);
    PT.step(0.3);
    const cur = g.interact?.current?.();
    PT.check('interact offers the sage talk', cur && cur.id === 'npc:sage', cur);
    PT.check('interact label is Korean', cur && /대화/.test(cur.label || ''), cur?.label);
    S.talkTo('sage');
    const lines = [];
    for (let i = 0; i < 80 && S.dialogueActive; i++) {
      const d = S.getDialogueState(); if (d?.text) lines.push(d.text);
      if (d?.choices) S.choose(1); else S.advance();
      PT.step(0.05);
    }
    PT.check('the elder line of the reveal', lines.some((t) => t.includes('다섯이라 배웠지만') && t.includes('아홉')), lines.length);
    PT.check('sage reveals the erased four', lines.some((t) => t.includes('운디나') && t.includes('루미엘')));
    PT.step(0.5);
    void pp;
  });

  await pg.run('branch order A: mirwen first → ascent', () => {
    const g = game, S = g.story;
    S.debugSkip('hydra'); PT.step(0.3);
    PT.check('A: hydra spawns on its stage', NT.bossId() === 'hydra', NT.bossId());
    PT.check('A: first region level ≥ 9', g.progression.level >= 9, g.progression.level);
    PT.check('A: regionOrder [mirwen]', S.regionOrder.join() === 'mirwen', S.regionOrder);
    NT.killAndWait();
    PT.check('A: water freed', g.progression.spiritsFreed.has('water'));
    PT.check('A: next is the other region (elderwood)', S.stage === 'elderwood', S.stage);
    PT.check('A: regionOrder [mirwen, elderwood]', S.regionOrder.join() === 'mirwen,elderwood', S.regionOrder);
    PT.check('A: undina NPC appears', S.npcs.undina && !S.npcs.undina.hidden);
    S.debugComplete(); PT.step(0.3);
    PT.check('A: elderwood → nox', S.stage === 'nox', S.stage);
    S.debugComplete(); PT.step(0.3);
    PT.check('A: nox spawns', NT.bossId() === 'nox', NT.bossId());
    NT.killAndWait(10);
    PT.check('A: nox → treant (shadow freed)', S.stage === 'treant' && g.progression.spiritsFreed.has('shadow'), [S.stage]);
    S.debugComplete(); PT.step(0.3);
    PT.check('A: treant spawns', NT.bossId() === 'treant', NT.bossId());
    NT.killAndWait();
    PT.check('A: treant → ascent', S.stage === 'ascent', S.stage);
    PT.check('A: nature freed + lumiel feather', g.progression.spiritsFreed.has('nature') && !!g.progression.lumielFeather);
  });

  await pg.run('branch order B: elderwood first → ascent', () => {
    const g = game, S = g.story;
    S.debugSkip('nox'); PT.step(0.3);
    PT.check('B: nox spawns; regionOrder [elderwood]', NT.bossId() === 'nox' && S.regionOrder.join() === 'elderwood', [NT.bossId(), S.regionOrder]);
    NT.killAndWait(10);
    PT.check('B: nox → treant', S.stage === 'treant', S.stage);
    S.debugComplete(); PT.step(0.3);
    NT.killAndWait();
    PT.check('B: treant → mirwen (second region)', S.stage === 'mirwen' && S.regionOrder.join() === 'elderwood,mirwen', [S.stage, S.regionOrder]);
    S.debugComplete(); PT.step(0.3);
    PT.check('B: mirwen → hydra', S.stage === 'hydra', S.stage);
    S.debugComplete(); PT.step(0.3);
    PT.check('B: hydra spawns', NT.bossId() === 'hydra', NT.bossId());
    NT.killAndWait();
    PT.check('B: hydra → ascent', S.stage === 'ascent', S.stage);
    // second-region skip uses the act-3 level row
    S.debugSkip('treant', { second: true }); PT.step(0.2);
    PT.check('B: second-region skip → level ≥ 15', g.progression.level >= 15 && S.regionOrder.join() === 'mirwen,elderwood', [g.progression.level, S.regionOrder]);
    try { g.enemies.despawnBoss?.(); } catch (_) { /* */ }
  });

  await pg.run('natural flow: escort, shrine, proximity boss intro', async () => {
    const g = game, S = g.story;
    S.debugSkip('elderwood'); PT.step(0.3);
    const m = S.npcs.forestChild;
    PT.tp(m.pos.x + 1.2, m.pos.z + 1.2); PT.step(0.3);
    S.talkTo('forestChild');
    for (let i = 0; i < 80 && S.dialogueActive; i++) { const d = S.getDialogueState(); if (d?.choices) S.choose(0); else S.advance(); PT.step(0.05); }
    PT.step(0.3);
    PT.check('momo talk starts the escort', !!S.getObjective() && /덩굴|모모/.test(S.getObjective().desc), S.getObjective()?.desc);
    try { g.world.setRotWalls?.('burned'); } catch (_) { /* */ }
    PT.tp(100, -60); PT.step(0.4);
    for (let i = 0; i < 30 && S.stage === 'elderwood'; i++) PT.step(0.25);
    PT.check('momo follows to the grove → nox stage', S.stage === 'nox', [S.stage, m.pos.x.toFixed(1), m.pos.z.toFixed(1)]);
    // proximity boss trigger at the glade → intro (prewarm behind the fade) → spawn
    const A = g.world.bossArenas.nox.position;
    PT.tp(A.x + 6, A.z + 6);
    for (let i = 0; i < 30 && NT.bossId() !== 'nox'; i++) { PT.step(0.1); await new Promise((r) => setTimeout(r, 10)); }
    PT.check('walking into the arena spawns nox through the boss intro', NT.bossId() === 'nox', NT.bossId());
    PT.check('boss intro cinematic is playing (world mode)', g.cinematic.active && g.cinematic.mode === 'world');
    NT.skipCine(); PT.step(0.3);
    PT.check('after the intro: playing', g.state === 'playing' && !g.cinematic.active, g.state);
    try { g.enemies.despawnBoss?.(); } catch (_) { /* */ }
    // Mirwen: reaching Undina's shrine starts the hydra stage
    S.debugSkip('mirwen'); PT.step(0.2);
    const sh = (g.world.shrines || []).find((x) => x.id === 'spirit_undina');
    if (sh) { PT.tp(sh.position.x + 1, sh.position.z + 1); PT.step(0.6); }
    PT.check('reaching the shrine → hydra', S.stage === 'hydra', S.stage);
    NT.settle(2);
    try { g.enemies.despawnBoss?.(); } catch (_) { /* */ }
  });

  await pg.run('ascent steps → kalis', () => {
    const g = game, S = g.story;
    S.debugSkip('ascent'); PT.step(0.2);
    PT.check('ascent: level ≥ 21', g.progression.level >= 21, g.progression.level);
    PT.tp(0, -110); PT.step(0.4);
    PT.check('ascent: step 1 reached at the ruins gate', S.ascentStep >= 1, [S.ascentStep, S.stage, g.state, g.cinematic.active, NT.bossId(), g.player.object.position.toArray().map((v) => v.toFixed(1))]);
    const xp0 = g.progression.totalXp;
    PT.tp(27, -129); PT.step(0.4);
    PT.check('ascent: step 2 at the first updraft (+XP)', S.ascentStep >= 2 && g.progression.totalXp > xp0, [S.ascentStep, xp0, g.progression.totalXp]);
    S.debugComplete(); PT.step(0.3);
    PT.check('ascent → kalis', S.stage === 'kalis', S.stage);
  });

  await pg.run('debugSkip through every boss stage', () => {
    const g = game, S = g.story;
    const NEXT = { hydra: ['elderwood', 'water'], nox: ['treant', 'shadow'], treant: ['mirwen', 'nature'], kalis: ['final', 'light'] };
    for (const st of Object.keys(NEXT)) {
      S.debugSkip(st); PT.step(0.3);
      const id = { hydra: 'hydra', nox: 'nox', treant: 'treant', kalis: 'kalis' }[st];
      PT.check(`${st}: boss ${id} spawns`, NT.bossId() === id, NT.bossId());
      const pts0 = g.progression.points ?? null;
      NT.killAndWait(10);
      PT.check(`${st}: killBoss advances to ${NEXT[st][0]}`, S.stage === NEXT[st][0], S.stage);
      PT.check(`${st}: frees ${NEXT[st][1]}`, g.progression.spiritsFreed.has(NEXT[st][1]));
      PT.check(`${st}: act boss recorded (+1 point)`, g.progression.bossesDefeated?.has?.(id), [pts0, g.progression.points]);
    }
    S.debugSkip('kalis'); PT.step(0.2);
    PT.check('kalis skip: level ≥ 21, three spirits freed', g.progression.level >= 21 && ['water', 'shadow', 'nature'].every((e) => g.progression.spiritsFreed.has(e)));
    try { g.enemies.despawnBoss?.(); } catch (_) { /* */ }
  });

  await pg.run('final → ending → exactly one victory', () => {
    const g = game, S = g.story;
    NT.seq.length = 0;
    S.debugSkip('final'); PT.step(0.3);
    PT.check('final: nidhoggra spawns', NT.bossId() === 'nidhoggra', NT.bossId());
    PT.check('final: level ≥ 25 and all four spirits freed', g.progression.level >= 25 && ['water', 'shadow', 'nature', 'light'].every((e) => g.progression.spiritsFreed.has(e)));
    PT.check('final_boss music while the wyrm is up', g.audio?.wantedMode?.() === 'final_boss', g.audio?.wantedMode?.());
    g.events.emit('bossPhase', { boss: g.enemies.boss, id: 'nidhoggra', phase: 2, name: 'x' });
    PT.check('bossPhase sets the final_boss layer', !g.audio?.musicLayer || g.audio.musicLayer === 2 || !g.audio.ctx, g.audio?.musicLayer);
    const v0 = PT.countEvents('victory'), fan0 = g.audio?.cueCount?.('victory') || 0;
    g.debug.killBoss();
    let sawFinale = false;
    for (let i = 0; i < 80 && !NT.seq.includes('bd:nidhoggra:1'); i++) { PT.step(0.1); if (g.cinematic.active && g.cinematic.mode === 'gameplay') sawFinale = true; }
    PT.check('the finale strike cinematic ran (gameplay mode, one input)', sawFinale);
    PT.check('bossDefeated {final:true} emitted', NT.seq.includes('bd:nidhoggra:1'), NT.seq);
    PT.check('no victory before the ending', PT.countEvents('victory') === v0);
    PT.check('fanfare plays on bossDefeated{final}', (g.audio?.cueCount?.('victory') || 0) === fan0 + 1, [fan0, g.audio?.cueCount?.('victory')]);
    PT.check('stage → ending', S.stage === 'ending', S.stage);
    for (let i = 0; i < 40 && !(g.cinematic.active && g.cinematic.mode === 'world'); i++) PT.step(0.25);
    PT.check('ending cinematic plays', g.cinematic.active && g.cinematic.mode === 'world');
    PT.step(4);
    NT.skipCine();
    PT.step(0.5);
    PT.check('exactly one victory event', PT.countEvents('victory') === v0 + 1, PT.countEvents('victory') - v0);
    const iB = NT.seq.indexOf('bd:nidhoggra:1'), iV = NT.seq.indexOf('victory');
    PT.check('victory comes after bossDefeated{final:true}', iB >= 0 && iV > iB, NT.seq);
    PT.check('state → victory', g.state === 'victory', g.state);
    PT.check('the victory event plays no second fanfare', (g.audio?.cueCount?.('victory') || 0) === fan0 + 1);
    PT.step(1);
    PT.check('still one victory after more frames', PT.countEvents('victory') === v0 + 1);
    S.continueEpilogue(); PT.step(0.3);
    PT.check('continue → epilogue stage done, playing', S.stage === 'done' && g.state === 'playing', [S.stage, g.state]);
  });

  await pg.run('serialize / deserialize', () => {
    const g = game, S = g.story;
    S.debugSkip('treant', { order: ['elderwood'] }); PT.step(0.2);
    try { g.enemies.despawnBoss?.(); } catch (_) { /* */ }
    const o = JSON.parse(JSON.stringify(S.serialize()));
    PT.check('serialize: stage, regionOrder, tips key', o.stage === 'treant' && o.regionOrder.join() === 'elderwood' && 'tips' in o, o);
    S.debugSkip('camps'); PT.step(0.1);
    const ok = S.deserialize(o);
    PT.check('deserialize restores the stage and branch order', ok && S.stage === 'treant' && S.regionOrder.join() === 'elderwood', [S.stage, S.regionOrder]);
    PT.check('currentBossId for the save prewarm', S.currentBossId() === 'treant', S.currentBossId());
    S.debugSkip('camps'); PT.step(0.1);
  });

  await pg.run('cinematics: skippable, restore state, no new programs', async () => {
    const g = game, C = g.cinematic;
    const progs = () => g.renderer.info.programs?.length || 0;
    const p0 = progs();
    const run = (name, fn) => {
      let done = false;
      try { fn(() => { done = true; }); } catch (e) { PT.check(`${name}: no throw`, false, String(e)); return; }
      PT.step(1.2);
      const was = C.active;
      NT.skipCine();
      PT.step(0.6);
      PT.check(`${name}: played and skipped → onDone, playing, unlocked`, done && !C.active && g.state === 'playing' && !g.input.isLocked?.('cinematic'), [was, done, C.active, g.state]);
    };
    run('class rite', (d) => C.playClassRite('spiritcaller', d));
    run('blessing shim', (d) => C.playBlessing('all', d));
    for (const el of ['water', 'shadow', 'nature', 'light']) run(`spirit freed ${el}`, (d) => C.playSpiritFreed(el, d));
    run('reveal', (d) => C.playReveal(d));
    // boss intro: prewarm (promise) → spawn → shots
    let introDone = false;
    C.playBossIntro('hydra', () => { introDone = true; }, { spawn: () => g.enemies.spawnBoss('hydra') });
    for (let i = 0; i < 20 && !C.active; i++) { await new Promise((r) => setTimeout(r, 20)); PT.step(0.1); }
    PT.check('boss intro: prewarm then spawn', NT.bossId() === 'hydra', NT.bossId());
    PT.step(1.5);
    NT.skipCine(); PT.step(0.6);
    PT.check('boss intro: skippable → playing', introDone && !C.active && g.state === 'playing', [introDone, C.active, g.state]);
    let phDone = false;
    C.playPhase('hydra', 2, () => { phDone = true; });
    PT.step(4);
    PT.check('phase transition: gameplay mode, ends by itself', phDone && !C.active, [phDone, C.active]);
    try { g.enemies.despawnBoss?.(); } catch (_) { /* */ }
    run('ending', (d) => C.playEnding(d));
    PT.check('cinematics compiled no new programs', progs() <= p0, [p0, progs()]);
    PT.check('SPIRITS stays 5; LOST_SPIRITS 4; SPIRITS_ALL 9', C.SPIRITS.length === 5 && C.LOST_SPIRITS.length === 4 && C.SPIRITS_ALL.length === 9);
    C.subtitle('시험 자막', 0.5); PT.step(0.6);
    PT.check('cinematic.subtitle exists', typeof C.subtitle === 'function' && typeof C.burstAt === 'function');
  });

  await pg.run('finisher: all 9 elements + symphony', () => {
    const g = game, C = g.cinematic;
    const els = [...g.elements.list, 'symphony'];
    let ends = 0, impacts = 0;
    for (const el of els) {
      C.finisher({ element: el, cls: g.progression.cls, name: '시험', center: g.player.object.position.clone().add(new g.THREE.Vector3(0, 0, -6)), onImpact: () => impacts++, onEnd: () => ends++ });
      PT.step(5);
    }
    PT.check('every finisher impacts and ends', ends === els.length && impacts === els.length, [ends, impacts]);
    PT.check('no cinematic left running', !C.active && g.state === 'playing');
  });

  await pg.run('audio: recipes, rx map, cues, music', async () => {
    const g = game, A = g.audio;
    if (!A) { PT.skip('audio', 'audio module absent'); return; }
    const names = new Set(A.sounds);
    const miss = [];
    for (const el of g.elements.list) for (const k of ['cast_', 'impact_', 'explode_']) if (!names.has(k + el)) miss.push(k + el);
    PT.check('cast_/impact_/explode_ for all 9 elements', miss.length === 0, miss);
    const ui = ['level_up', 'skill_learn', 'skill_unlearn', 'tree_open', 'slot_equip', 'xp_tick', 'codex_new', 'regen_start', 'gate_travel', 'ui_deny'];
    PT.check('UI cues exist', ui.every((n) => names.has(n)), ui.filter((n) => !names.has(n)));
    const wpn = ['bow_draw', 'bow_release', 'arrow_whizz', 'hammer_swing', 'hammer_hit', 'shield_block', 'dagger_swish', 'totem_rattle'];
    PT.check('class weapon sfx exist', wpn.every((n) => names.has(n)), wpn.filter((n) => !names.has(n)));
    const voices = ['hydra_roar', 'treant_groan', 'nox_voice', 'kalis_voice', 'wyrm_roar'];
    PT.check('boss voices exist (P1)', voices.every((n) => names.has(n)));
    // rx_<id>: every reaction id resolves to a cue
    const ids = [...new Set(Object.keys(g.combat?.REACTION_DEFS || {}))];
    PT.check('combat lists 49 reaction ids', ids.length >= 49, ids.length);
    const before = A.lastCues.length;
    const unresolved = [];
    for (const id of ids) {
      const fam = g.combat.REACTION_DEFS[id]?.family;
      const n0 = A.lastCues.length ? A.lastCues.join('|') : '';
      g.events.emit('reaction', { id, name: id, point: g.player.object.position, elements: [], family: fam });
      const cues = A.lastCues.slice(-2);
      if (!(cues.length === 2 && cues[0] === 'reaction' && names.has(cues[1]))) unresolved.push(id);
      void n0;
    }
    PT.check('rx cue for every reaction id (map or family fallback)', unresolved.length === 0, unresolved);
    void before;
    const c0 = A.cueCount('level_up');
    g.events.emit('levelUp', { level: 2, pointsGained: 1 });
    PT.check('levelUp → level_up cue', A.cueCount('level_up') >= c0 + 1);
    const r0 = A.cueCount('resonance'), b0 = A.cueCount('break_gong');
    g.events.emit('resonance', { target: null, ids: [] }); g.events.emit('break', { target: null });
    PT.check('resonance + break cues', A.cueCount('resonance') === r0 + 1 && A.cueCount('break_gong') === b0 + 1);
    // zone music
    const modes = {};
    for (const z of ['mirwen', 'elderwood', 'plateau', 'village']) { g.debug.tp(z); PT.step(0.3); const m = A.wantedMode(); modes[z] = m === 'battle' && g.enemies?.inCombat ? z.replace('plateau', 'sky') : m; }
    PT.check('zone music: mirwen / elderwood / sky (plateau, no wyrm) / village', modes.mirwen === 'mirwen' && modes.elderwood === 'elderwood' && modes.plateau === 'sky' && modes.village === 'village', modes);
    PT.check('new themes registered', ['mirwen', 'elderwood', 'sky', 'final_boss', 'ending_v3'].every((t) => A.themes.includes(t)), A.themes);
    // offline renders (audible, finite)
    const out = {};
    for (const n of ['cast_water', 'explode_nature', 'impact_light', 'explode_shadow', 'level_up', 'rx_curse', 'wyrm_roar']) { const r = await A.analyze(n, 1.5); out[n] = r.peak; }
    PT.check('new recipes render audibly', Object.values(out).every((p) => p > 0.005 && p < 4), out);
    const m = {};
    for (const t of ['mirwen', 'elderwood', 'sky', 'final_boss', 'ending_v3']) { const r = await A.analyzeMusic(t, 4); m[t] = r.rms; }
    PT.check('new music themes render audibly', Object.values(m).every((v) => v > 0.0005), m);
  });
  await pg.run('village: reaction trainer + draw calls', () => {
    const g = game, S = g.story;
    S.debugSkip('camps'); g.debug.tp('village'); PT.step(0.5);
    const fs0 = PT.frameStats();
    PT.check('village draw calls within the DESIGN §12 target (≤ 290) with 15 village NPCs', fs0.calls <= 290, fs0);
    PT.check('village tris ≤ 900k', fs0.tris <= 900000, fs0.tris);
    const d = S.spawnReactionTrainer();
    PT.check('reaction trainer dummy spawns (0 XP, Korean name)', d && d.xpValue === 0 && /허수아비/.test(d.name || ''), d && [d.xpValue, d.name]);
    PT.step(1.5);
    const sts = g.elements.list.map((e) => g.elements.DEFS[e].status).filter(Boolean);
    PT.check('the trainer wears an element aura', d && sts.some((st) => g.combat?.hasStatus?.(d, st)), sts);
    const fs1 = PT.frameStats();
    PT.check('no new programs from village NPCs / trainer', fs1.programs <= fs0.programs, [fs0.programs, fs1.programs]);
  });
  PT.check('boot 1: no console errors after the run', pg.errors().length === 0, pg.errors().slice(0, 6));
  await pg.close();

  // ------------------------------------------------------------ boot 2: class pick with the ui panel + training
  const pc = await PT.boot('&cls=none&cine=1');
  PT.check('boot cls=none: ready', pc.ready);
  if (pc.ready) {
    await pc.eval(() => { window.NT2 = { skip() { for (let i = 0; i < 12 && game.cinematic?.active; i++) { game.cinematic.skip(); PT.step(0.6); } } }; });
    await pc.run('class pick via ui.openClassPanel', () => {
      const g = game, S = g.story;
      PT.check('starts at wake', S.stage === 'wake', S.stage);
      const talkThrough = (id, pick = 0) => { S.talkTo(id); for (let i = 0; i < 120 && S.dialogueActive; i++) { const d = S.getDialogueState(); if (d?.choices) S.choose(pick); else S.advance(); PT.step(0.05); } PT.step(0.3); };
      talkThrough('elder');
      PT.check('wake → choose', S.stage === 'choose', S.stage);
      PT.check('six mentors stand at the altar', ['mageMentor', 'swordMentor', 'rangerMentor', 'paladinMentor', 'spiritMentor', 'shadowMentor'].every((id) => S.npcs[id] && !S.npcs[id].hidden));
      talkThrough('rangerMentor');
      PT.check('the class panel opens after the mentor talk', !!g.ui.classPanelOpen);
      const pick = g.ui._parts?.classPanel?.pick;
      PT.check('ui class panel exposes pick', typeof pick === 'function');
      g.ui._parts.classPanel.pick('ranger', { noConfirm: true });
      PT.step(0.2);
      PT.check('progression + player class set', g.progression.cls === 'ranger' && (g.player.cls === 'ranger' || g.player.cls == null), [g.progression.cls, g.player.cls]);
      PT.check('the class rite (각인 의식) plays', !!g.cinematic.active);
      PT.step(2);
      NT2.skip();
      PT.step(0.5);
      PT.check('rite → training', S.stage === 'training', S.stage);
    });
    await pc.run('training steps (skillCast once per cast)', () => {
      const g = game, S = g.story;
      const T = g.world.village?.trainingGround || g.world.trainingArea;
      if (T) PT.tp(T.x + 1, T.z + 1);
      PT.step(0.5);
      PT.check('training: arrived → basic', S.trainStep === 'basic', S.trainStep);
      const cast = (slot) => g.events.emit('skillCast', { id: 'x_' + slot, element: 'wind', slot, cls: 'ranger', family: 'caster', origin: g.player.object.position });
      for (let i = 0; i < 4; i++) cast('basic');
      PT.check('4 casts → not yet', S.trainStep === 'basic');
      cast('basic');
      PT.check('5th cast → charged', S.trainStep === 'charged', S.trainStep);
      // integration: with nothing slotted yet (a fresh class), 'quick' is deferred until after 'learn'
      const L = g.skills?.loadout || {}, slotted = !!(L.q1 || L.q2 || L.q3 || L.q4 || L.sup || L.ult);
      cast('charged'); PT.check(slotted ? '→ quick' : '→ quick deferred (nothing slotted) → defend', S.trainStep === (slotted ? 'quick' : 'defend'), S.trainStep);
      cast('q1'); PT.check('→ defend', S.trainStep === 'defend', S.trainStep);
      g.events.emit('focusStart', {}); PT.check('ranger focus counts as defend → dodge', S.trainStep === 'dodge', S.trainStep);
      g.events.emit('dodge', { type: 'backflip' }); PT.check('→ learn', S.trainStep === 'learn', S.trainStep);
      g.events.emit('loadoutChanged', { slot: 'q2', id: 'y' });
      PT.check('equip without learning does not count', S.trainStep === 'learn');
      g.events.emit('skillLearned', { id: 'wind.a', rank: 1, element: 'wind' });
      g.events.emit('loadoutChanged', { slot: 'q2', id: 'wind.a' });
      PT.check('learn + equip → done', S.trainStep === 'done', S.trainStep);
      S.talkTo(g.classes.DEFS.ranger.mentor);
      for (let i = 0; i < 60 && S.dialogueActive; i++) { S.advance(); PT.step(0.05); }
      PT.step(0.3);
      PT.check('mentor talk → updraft', S.stage === 'updraft', S.stage);
    });
    PT.check('boot 2: no console errors', pc.errors().length === 0, pc.errors().slice(0, 5));
  }
  await pc.close();

  // ------------------------------------------------------------ boot 3: class pick fallback (ui stubbed)
  const pf = await PT.boot('&cls=none&stub=ui&cine=1');
  PT.check('boot cls=none, ui stubbed: ready', pf.ready);
  if (pf.ready) {
    await pf.eval(() => { window.NT2 = { skip() { for (let i = 0; i < 12 && game.cinematic?.active; i++) { game.cinematic.skip(); PT.step(0.6); } } }; });
    await pf.run('class pick via the 6-option dialogue', () => {
      const g = game, S = g.story;
      PT.check('ui is stubbed', (g.stubbed || []).includes('ui'), g.stubbed);
      S.debugSkip('choose', { silent: true });
      S.talkTo('paladinMentor');
      let opts = null;
      for (let i = 0; i < 80 && S.dialogueActive; i++) {
        const d = S.getDialogueState();
        if (d?.choices) { opts = d.choices; const k = d.choices.findIndex((c) => c.includes(g.classes.DEFS.paladin.nameKo)); S.choose(k < 0 ? 0 : k); }
        else S.advance();
        PT.step(0.05);
      }
      PT.check('6 classes + "later" offered', opts && opts.length === 7, opts);
      PT.step(0.3);
      PT.check('class set to paladin without ui', g.progression.cls === 'paladin', g.progression.cls);
      NT2.skip(); PT.step(0.5);
      PT.check('→ training', S.stage === 'training', S.stage);
    });
    PT.check('boot 3: no console errors', pf.errors().length === 0, pf.errors().slice(0, 5));
  }
  await pf.close();
};
