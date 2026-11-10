// playtest3 section: ui (CONTRACT §21 check 9 + the ui module's own checks). Owned by ui.
// Runs with the other modules present or stubbed: anything that needs a later-wave owner is SKIPped, never faked.
//   node tools/playtest3.js ui
const fs = require('fs'); const path = require('path');

const UI_FILES = (root) => ['src/ui.js', ...fs.readdirSync(path.join(root, 'src/ui')).filter((f) => f.endsWith('.js')).map((f) => 'src/ui/' + f)];

module.exports = async function ui(PT) {
  const treeData = fs.existsSync(path.join(PT.root, 'src/skills/trees/index.js'));
  // without src/skills/ (wave-1 ui worktree) the tree's fallback import 404s by design: that one console line is expected
  const errs = (p) => p.errors().filter((e) => treeData || !/Failed to load resource/.test(e));
  // ------------------------------------------------------------ static: rules 7 / 8 / 9 on the ui files
  {
    const bad8 = [], bad7 = [], bad9 = [];
    for (const f of UI_FILES(PT.root)) {
      const src = fs.readFileSync(path.join(PT.root, f), 'utf8').split('\n');
      src.forEach((l, i) => {
        if (/=== ?'(sword|mage)'/.test(l)) bad8.push(`${f}:${i + 1}`);
        if (/(^|[^_A-Z])ELEMENTS\.length|for \(let \w+ = 0; \w+ < 5;/.test(l)) bad9.push(`${f}:${i + 1}`);
        const m = /^\s*import\s[^'"]*['"]([^'"]+)['"]/.exec(l);
        if (m) {
          const spec = m[1];
          const ok = spec === 'three' || spec.startsWith('three/') || /^\.\/(ui\/|core\/)/.test(spec) || /^\.\.\/core\//.test(spec) || (f.startsWith('src/ui/') && /^\.\/[\w-]+\.js$/.test(spec));
          if (!ok) bad7.push(`${f}:${i + 1} ${spec}`);
        }
      });
    }
    PT.check('rule 7: ui files statically import only ui / core / three', bad7.length === 0, bad7);
    PT.check('rule 8: no class literals in ui files', bad8.length === 0, bad8);
    PT.check('rule 9: no 5-element loops in ui files', bad9.length === 0, bad9);
  }

  // ------------------------------------------------------------ main page: mage, real modules where present
  const pg = await PT.boot('&cls=mage&skills=preset:starter_mage');
  PT.check('boot mage: ready', pg.ready);
  if (pg.ready) {
    const info = await pg.run('env', () => ({ skills: !!(game.skills && !game.skills.isStub), combatV3: !!game.combat?.STATUS_DEFS, gates: Array.isArray(game.world?.gates) && game.world.gates.length > 0, state: game.state }));
    PT.check('state playing', info?.state === 'playing', info);

    // check 9a: openSkillTree / openCharacter / openCodex lock and unlock input (and pause / resume)
    await pg.run('menus lock input', () => {
      const u = game.ui, I = game.input;
      PT.resetCounts('treeClosed');
      for (const [open, close, flag] of [['openSkillTree', 'closeSkillTree', 'skillTreeOpen'], ['openCharacter', 'closeCharacter', 'characterOpen'], ['openCodex', 'closeCodex', 'codexOpen']]) {
        u[open](); PT.step(0.05);
        PT.check(`${open}: open + input locked + paused`, u[flag] === true && I.isLocked('menu') && game.state === 'paused', { open: u[flag], locked: I.isLocked('menu'), state: game.state });
        PT.check(`${open}: gameplay input reports nothing`, I.pressed('KeyW') === false);
        u[close](); PT.step(0.05);
        PT.check(`${close}: closed + unlocked + playing`, u[flag] === false && !I.isLocked('menu') && game.state === 'playing', { open: u[flag], locked: I.isLocked('menu'), state: game.state });
      }
      PT.check('treeClosed emitted once', PT.countEvents('treeClosed') === 1, PT.countEvents('treeClosed'));
      // keys K / C / Tab toggle; Escape closes; switching menus keeps exactly one open
      const tap = (k) => { I.simulate({ keys: { [k]: true } }); PT.step(1 / 60); I.simulate(null); PT.step(1 / 60); };
      tap('KeyK'); PT.check('K opens the tree', u.skillTreeOpen && game.state === 'paused');
      tap('KeyC'); PT.check('C switches to the character sheet', u.characterOpen && !u.skillTreeOpen && game.state === 'paused');
      tap('Tab'); PT.check('Tab switches to the codex', u.codexOpen && !u.characterOpen);
      tap('Escape'); PT.check('Escape closes the codex and resumes', !u.codexOpen && game.state === 'playing' && !I.isLocked('menu'), game.state);
      tap('KeyK'); tap('KeyK'); PT.check('K toggles the tree closed', !u.skillTreeOpen && game.state === 'playing');
      // opened from the pause menu: closing returns to the pause menu (no resume)
      game.pause(); PT.step(0.05); u.openSkillTree(); PT.step(0.05); u.closeSkillTree(); PT.step(0.05);
      PT.check('tree opened from pause stays paused after close', game.state === 'paused' && document.querySelector('.aw-pause').classList.contains('show'));
      game.resume(); PT.step(0.05);
    });

    // check 9b: the hotbar shows 9 slots in v3 mode
    if (info?.skills) {
      await pg.run('hotbar v3', () => {
        PT.step(0.2);
        const hs = game.activeSkills().getHudState();
        PT.check('HudState v3', hs?.v === 3, hs?.v);
        const slots = [...document.querySelectorAll('.aw-hb3.on .aw-slot3')];
        PT.check('9 hotbar slots shown', slots.length === 9, slots.length);
        PT.check('slot keys LMB RMB 1 2 3 4 X G R', slots.map((s) => s.dataset.slot).join(',') === 'basic,charged,q1,q2,q3,q4,ult,sup,fin', slots.map((s) => s.dataset.slot));
        PT.check('v2 hotbar hidden', !document.querySelector('.aw-hotbar.on'));
        const gems = [...document.querySelectorAll('.aw-gem3')].filter((g) => g.style.display !== 'none');
        PT.check('attune arc = class elements (6)', gems.length === (hs.elements?.length || 0) && gems.length === 6, gems.length);
        PT.check('one attuned gem glows', document.querySelectorAll('.aw-gem3.sel').length === 1);
        PT.check('signature widget (mage 원소 연쇄 orbs)', document.querySelector('.aw-hb3-sig.on')?.dataset.mode === 'orbs', document.querySelector('.aw-hb3-sig')?.dataset.mode);
        PT.check('vitals resource = mp', document.querySelector('.aw-vitals').dataset.res === 'mp');
      });
    } else PT.skip('hotbar v3', 'needs skills (HudState v3)');

    // tree: ring, constellations, learn, planner never commits, equip
    await pg.run('skill tree', (hasSkills) => {
      const u = game.ui, P = game.progression, T = u._parts.tree;
      u.openSkillTree(); PT.step(0.05);
      const sig = document.querySelectorAll('.aw-sig');
      PT.check('ring: 9 sigils', sig.length === 9, sig.length);
      PT.check('ring: 2 primary · 4 secondary · 3 locked', document.querySelectorAll('.aw-sig.primary').length === 2 && document.querySelectorAll('.aw-sig.secondary').length === 4 && document.querySelectorAll('.aw-sig.locked').length === 3);
      const lockedTip = document.querySelector('.aw-sig.locked .aw-sig-tip')?.textContent || '';
      PT.check('locked sigil: "◯◯ 직업만 사용 가능"', /직업만 사용 가능$/.test(lockedTip), lockedTip);
      if (!hasSkills) { PT.skip('tree learn/equip', 'needs skills'); u.closeSkillTree(); PT.step(0.05); return; }
      PT.check('every node rendered', T.nodeCount() === game.skills.nodes.size, [T.nodeCount(), game.skills.nodes.size]);
      P.debug.ungate = false;   // presets set ungate; the tree must show the real class / story gates
      P.setLevel(6); PT.step(0.05);
      T.zoomTo('fire'); PT.step(0.05);
      PT.check('constellation zoom', document.querySelector('.aw-tree-stage').classList.contains('zoomed') && document.querySelector('.aw-const.on')?.dataset.el === 'fire');
      PT.check('5 tier rows', document.querySelectorAll('.aw-const.on .aw-trow').length === 5);
      PT.check('capstone shows the story gate (shard)', document.querySelector('.aw-const.on .aw-node[data-id="fire.cap"]')?.classList.contains('story'));
      const avail = [...document.querySelectorAll('.aw-const.on .aw-node.avail')].map((n) => n.dataset.id).filter((id) => !P.isLearned(id));
      PT.check('some nodes available (pulsing)', avail.length > 0, avail);
      const pts0 = P.points;
      const id = avail[0];
      PT.resetCounts('skillLearned');
      T.learn(id); PT.step(0.05);
      PT.check('learn commits through progression', P.isLearned(id) && P.points < pts0 && PT.countEvents('skillLearned') === 1, { id, pts0, pts: P.points });
      PT.check('learned node state', document.querySelector(`.aw-node[data-id="${id}"]`)?.classList.contains('learned') || document.querySelector(`.aw-node[data-id="${id}"]`)?.classList.contains('maxed'));
      // planner mode: never commits learning or equipping
      T.setPlanner(true); PT.step(0.05);
      const next = [...document.querySelectorAll('.aw-const.on .aw-node.avail')].map((n) => n.dataset.id).find((x) => !P.isLearned(x));
      const ranksBefore = JSON.stringify([...P.ranks]);
      const loBefore = JSON.stringify(game.skills.loadout);
      if (next) T.learn(next);
      T.equip('q4', 'fire.salamander');
      PT.step(0.05);
      PT.check('planner: plan recorded', !next || T.plannedRanks().get(next) === 1, next);
      PT.check('planner: progression unchanged', JSON.stringify([...P.ranks]) === ranksBefore);
      PT.check('planner: loadout unchanged', JSON.stringify(game.skills.loadout) === loBefore);
      PT.check('planner banner shown', document.querySelector('.aw-tree').classList.contains('planning'));
      T.setPlanner(false); PT.step(0.05);
      // equip: hovered node + key, through skills.equip (out of combat)
      game.player.lastHurtT = -1e9;
      const quick = [...P.learnedNodes()].map((n) => P.node(n)).find((n) => n && n.type === 'active' && n.slotRole !== 'attune');
      if (quick) {
        const ok = T.equip('q2', quick.id); PT.step(0.05);
        PT.check('equip a learned active to q2', ok && game.skills.loadout.q2 === quick.grants[0], { ok, q2: game.skills.loadout.q2, id: quick.id });
        PT.check('quick-slot bar shows it', document.querySelector('.aw-qslot[data-slot="q2"] .aw-qslot-name')?.textContent === game.skills.defs.get(quick.grants[0])?.nameKo);
        const bad = T.equip('ult', quick.id); PT.step(0.05);
        PT.check('equip into a wrong slot is rejected with a reason', !bad && document.querySelector('.aw-tree-msg').textContent.length > 0, document.querySelector('.aw-tree-msg').textContent);
      } else PT.skip('equip', 'no learned quick active');
      // detail panel
      document.querySelector(`.aw-node[data-id="fire.ult"]`)?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      PT.check('detail panel (name, badges, description)', document.querySelector('.aw-tree-detail.show .aw-dt-name')?.textContent.length > 0 && document.querySelectorAll('.aw-tree-detail .aw-badge').length >= 3);
      PT.check('header: points + respec status', /\d/.test(document.querySelector('.aw-tree-points b').textContent) && document.querySelector('.aw-tree-respec-st').textContent.length > 0);
      u.closeSkillTree(); PT.step(0.05);
    }, !!info?.skills);

    // check 9c: interact prompt at a gate; F does not cast anything
    await pg.run('interact prompt + F', (hasGates) => {
      const I = game.input, u = game.ui;
      let label = '정령의 문', offer = null;
      if (hasGates) {
        const g = game.world.gates[0];
        PT.tp(g.position.x + 1.2, g.position.z + 1.2);
      } else {
        const p = game.player.object.position;
        offer = 'pt:ui-gate';
        game.interact.offer(offer, { pos: p.clone(), r: 3, label, onUse: () => { u.openGateMenu([{ id: 'a', name: '시험의 문', zoneName: '시험', reached: true, current: true }], () => {}); return true; } });
      }
      PT.step(0.3);
      const cur = game.interact.current();
      const el = document.querySelector('.aw-iprompt');
      PT.check('interact offer current at the gate', !!cur, cur);
      PT.check('prompt shows "[F] …"', el.classList.contains('show') && el.querySelector('kbd').textContent === 'F' && el.querySelector('span').textContent === cur?.label, el.querySelector('span').textContent);
      PT.resetCounts('skillCast'); PT.resetCounts('spellCast');
      I.simulate({ keys: { KeyF: true } }); PT.step(1 / 60); I.simulate(null); PT.step(0.1);
      PT.check('F casts nothing (skillCast 0, spellCast 0)', PT.countEvents('skillCast') === 0 && PT.countEvents('spellCast') === 0, { skillCast: PT.countEvents('skillCast'), spellCast: PT.countEvents('spellCast') });
      PT.check('F at the gate opens the gate menu', u.gateMenuOpen === true);
      PT.check('prompt hidden while the menu is open', !el.classList.contains('show'));
      u.closeGateMenu(); PT.step(0.05);
      PT.check('gate menu closes back to play', !u.gateMenuOpen && game.state === 'playing' && !I.isLocked('menu'));
      if (offer) game.interact.withdraw(offer);
    }, !!info?.gates);

    // enemy bars: statuses + stacks, break gauge, void shield pip, next-hit hint
    if (info?.combatV3) {
      await pg.run('enemy bars v3', () => {
        const [d] = PT.dummyRing(1, 5, { aggro: true });
        const fw = new game.THREE.Vector3(); game.camera.getWorldDirection(fw); fw.y = 0; fw.normalize();
        const pp = game.player.object.position; d.object.position.set(pp.x + fw.x * 6, d.object.position.y, pp.z + fw.z * 6);
        const C = game.combat;
        C.applyStatus(d, 'wet', 8, { el: 'water' });
        C.applyStatus(d, 'seeded', 8, { stacks: 3, el: 'nature', source: game.player.entity });
        d.breakMax = 60; d.breakValue = 30; d.voidShield = 40;
        const aim0 = game.player.getAim;
        game.player.getAim = () => ({ target: d });
        game.skills?.attune?.('ice', { silent: true });
        PT.step(0.4);
        const bar = [...document.querySelectorAll('.aw-ebar')].find((b) => b.style.display !== 'none');
        PT.check('bar shown', !!bar);
        const pip = (t) => bar?.querySelector(`.aw-pip[title="${t}"]`);
        PT.check('wet pip on', pip(C.STATUS_DEFS.wet.nameKo)?.classList.contains('on'));
        PT.check('seeded pip shows stack digit 3', pip(C.STATUS_DEFS.seeded.nameKo)?.textContent === '3', pip(C.STATUS_DEFS.seeded.nameKo)?.textContent);
        PT.check('voidShield pseudo-pip on', bar?.querySelector('.aw-pip.void')?.classList.contains('on'));
        PT.check('break gauge shown', bar?.querySelector('.aw-ebar-break')?.classList.contains('on'));
        const prev = C.previewReaction(d, game.skills?.attuned || 'ice');
        const txt = bar?.querySelector('.aw-ebar-next')?.textContent || '';
        PT.check('"다음 타격" = previewReaction', prev ? txt === `다음 타격: ${prev.nameKo}` : txt === '', { prev, txt });
        PT.check('the reacting aura pip is marked', !prev || !!bar?.querySelector('.aw-pip.rx'));
        game.player.getAim = aim0;
        d.alive = false; PT.step(0.1);
      });
    } else PT.skip('enemy bars v3', 'needs combat v3 (STATUS_DEFS)');

    // boss bar from the bossSpawn payload (data-driven; no golem hard-codes)
    await pg.run('boss bar', () => {
      const E = game.enemies; const prevBoss = E.boss;
      PT.step(1);   // let earlier cards / delayed calls finish
      const fake = { id: 'pt_boss', name: '시험의 거인', hp: 800, maxHp: 1000, alive: true, breakMax: 150, breakValue: 150, voidShield: 0, parts: [{ id: 'h1', name: '왼쪽 머리', hp: 50, maxHp: 100, lock: { element: 'fire' } }] };
      try { E.boss = fake; } catch (_) { /* getter: the bar follows the payload entity */ }
      game.events.emit('bossSpawn', { boss: fake, id: 'pt_boss', name: '시험의 거인', title: '시련의 수호자', sub: '시험용 부제', phases: [{ at: 0.66, name: '분노' }, { at: 0.33, name: '절망' }], parts: [{ id: 'h1', name: '왼쪽 머리' }] });
      PT.step(0.2);
      const B = document.querySelector('.aw-boss');
      PT.check('boss bar shown with payload name/title', B.classList.contains('show') && B.querySelector('.aw-boss-name b').textContent === '시험의 거인' && B.querySelector('.aw-boss-title').textContent === '시련의 수호자');
      PT.check('phase pips from phases[]', B.querySelectorAll('.aw-boss-pips i').length === 2);
      PT.check('part sub-bar with lock icon', B.querySelectorAll('.aw-bpart').length >= 1 && [...B.querySelectorAll('.aw-bpart')][0].style.display !== 'none' && B.querySelector('.aw-bpart.locked') !== null);
      PT.check('break gauge on', B.querySelector('.aw-boss-break').classList.contains('on'));
      fake.voidShield = 60; PT.step(0.1);
      PT.check('void shield overlay', B.classList.contains('void'));
      game.events.emit('bossPhase', { boss: fake, id: 'pt_boss', phase: 2, name: '분노' }); PT.step(0.1);
      PT.check('bossPhase name shown', /분노/.test(B.querySelector('.aw-boss-phase').textContent), B.querySelector('.aw-boss-phase').textContent);
      fake.alive = false; try { E.boss = prevBoss; } catch (_) { /* getter */ }
      game.events.emit('bossDefeated', { boss: fake, id: 'pt_boss', name: '시험의 거인', final: false }); PT.step(1.5);
      PT.check('defeat card uses payload.name', game.ui._cardLog.includes('격파|시험의 거인'), game.ui._cardLog.slice(-3));
      PT.check('spawn card uses payload title/name', game.ui._cardLog.includes('시련의 수호자|시험의 거인'), game.ui._cardLog.slice(-4));
      PT.check('boss bar hidden after defeat', !B.classList.contains('show'));
      PT.step(6);   // let the boss / defeat cards finish (the next test expects the level-up card on screen)
      const src = [...document.querySelectorAll('.aw-victory-pre, .aw-card-title')].map((e) => e.textContent).join('|');
      PT.check('no "수문장 정화" hard-code', !/수문장 정화/.test(src));
    });

    // vitals: level badge / XP bar / level-up card / +XP numbers / regen strip
    await pg.run('vitals v3', () => {
      const P = game.progression;
      PT.resetCounts('levelUp');
      P.addXp(P.xpToNext() + 5, { kind: 'quest', id: 'pt' }); PT.step(0.2);
      PT.check('levelUp emitted', PT.countEvents('levelUp') >= 1);
      PT.check('level badge = level', document.querySelector('.aw-lv').textContent === String(P.level), [document.querySelector('.aw-lv').textContent, P.level]);
      PT.check('level-up card "레벨 업! Lv N"', game.ui._cardLog.includes(`레벨 업!|Lv ${P.level}`), game.ui._cardLog.slice(-3));
      PT.check('+XP merged into the corner counter (v4 §6.9)', document.querySelector('.aw-xpc')?.classList.contains('on') && /\+\d+ 경험치/.test(document.querySelector('.aw-xpc').textContent));
      PT.check('unspent points pip "[K] 스킬 포인트"', document.querySelector('.aw-ptpip').classList.contains('on') === (P.points > 0) && /스킬 포인트/.test(document.querySelector('.aw-ptpip span').textContent));
      PT.check('HP max from player.maxHp', document.querySelector('.aw-hp .aw-vital-num span').textContent === '/' + Math.round(game.player.maxHp), document.querySelector('.aw-hp .aw-vital-num span').textContent);
      if (game.player.regen && game.debug?.hurt) {
        game.debug.hurt(25); PT.step(0.5);
        PT.check('regen strip counts the delay', document.querySelector('.aw-regen').classList.contains('on'));
        PT.step(4);
        PT.check('regen shimmer while healing', document.querySelector('.aw-hp').classList.contains('regen') === !!game.player.regen.active, game.player.regen);
      } else PT.skip('regen strip', 'needs player.regen');
    });

    // codex: 6 families + universal, the "N / 49" counter, silhouettes; learned-skill page
    await pg.run('codex', (combatV3) => {
      const u = game.ui;
      u.openCodex(); PT.step(0.05);
      const total = game.combat?.REACTIONS?.length || 0;
      const cnt = document.querySelector('.aw-codex .aw-book-count').textContent;
      PT.check('counter "N / total"', new RegExp(`^\\d+ / ${total}$`).test(cnt), cnt);
      if (combatV3) {
        PT.check('49 reactions in the codex', total === 49 && document.querySelectorAll('.aw-codex .aw-rx').length === 49, total);
        PT.check('grouped into 6 families + universal', document.querySelectorAll('.aw-codex .aw-cx-sec').length === 7, document.querySelectorAll('.aw-codex .aw-cx-sec').length);
      } else PT.skip('codex families', 'needs combat v3');
      PT.check('undiscovered entries are silhouettes with a hint', [...document.querySelectorAll('.aw-codex .aw-rx.unknown .aw-rx-desc')].every((d) => /…\?$|\?\?\?/.test(d.textContent)));
      u._parts.codex.setPage('sk');
      PT.check('learned skills page', document.querySelectorAll('.aw-codex .aw-sp-row').length > 0 || /없습니다/.test(document.querySelector('.aw-spell-list').textContent));
      u.closeCodex(); PT.step(0.05);
    }, !!info?.combatV3);

    // class panel, confirm, gate menu, tips, settings rows, controls
    await pg.run('dialogs', () => {
      const u = game.ui, I = game.input;
      let picked = null;
      u.openClassPanel({ onPick: (c) => { picked = c; } }); PT.step(0.05);
      PT.check('class panel: 6 cards', document.querySelectorAll('.aw-ccard').length === 6);
      PT.check('class panel: element chips gold/silver', document.querySelectorAll('.aw-ccard[data-cls="ranger"] .aw-echip.p').length === 2 && document.querySelectorAll('.aw-ccard[data-cls="ranger"] .aw-echip.s').length === 4);
      PT.check('class panel: stat radar', document.querySelectorAll('.aw-ccard .aw-radar').length === 6);
      PT.check('class panel locks input', I.isLocked('menu') && u.classPanelOpen);
      u._parts.classPanel.pick('ranger'); PT.step(0.05);
      PT.check('pick asks for confirmation', u._parts.confirmBox.isOpen && picked === null);
      u._parts.confirmBox.yes(); PT.step(0.05);
      PT.check('confirm → onPick(cls), panel closed, unlocked', picked === 'ranger' && !u.classPanelOpen && !I.isLocked('menu') && game.state === 'playing', { picked, st: game.state });
      let yes = 0, no = 0;
      u.confirm('시험?', () => { yes++; }, () => { no++; }); PT.step(0.05);
      I.simulate({ keys: { Escape: true } }); PT.step(1 / 60); I.simulate(null); PT.step(0.05);
      PT.check('Escape answers "no"', yes === 0 && no === 1 && !u._parts.confirmBox.isOpen);
      let gate = null;
      u.openGateMenu([{ id: 'g1', name: '첫 번째 문', zoneName: '마을', reached: true, current: true }, { id: 'g2', name: '두 번째 문', zoneName: '물안개 호수', reached: true }, { id: 'g3', name: '세 번째 문', reached: false }], (id) => { gate = id; });
      PT.step(0.05);
      const btns = document.querySelectorAll('.aw-gate');
      PT.check('gate list rows', btns.length === 3 && btns[2].classList.contains('unknown') && btns[0].disabled);
      btns[1].click(); PT.step(0.05);
      PT.check('picking a reached gate calls onPick and closes', gate === 'g2' && !u.gateMenuOpen && game.state === 'playing');
      PT.check('ui.tip is one-time', u.tip('pt_tip', '시험 팁') === true && u.tip('pt_tip', '시험 팁') === false);
      PT.check('tips serialize', u.serializeTips().includes('pt_tip'));
      for (const k of ['difficulty', 'screenShake', 'damageNumbers', 'effectQuality']) PT.check(`settings row ${k}`, !!document.querySelector(`.aw-settings [data-row="${k}"]`));
      PT.check('difficulty names from settings.DIFFICULTY', document.querySelector('.aw-settings [data-seg="hard"]')?.textContent === (game.settings.DIFFICULTY?.hard?.nameKo || '어려움'));
      const ctl = document.querySelector('.aw-controls').textContent;
      PT.check('controls panel: K C Z X V 1~4, F = 상호작용', ['K', 'C', 'Z', 'X', 'V', '1~4'].every((k) => [...document.querySelectorAll('.aw-controls kbd')].some((e) => e.textContent === k)) && /상호작용/.test(ctl));
      u.startTreeTour(); PT.step(0.05);
      PT.check('tree tour: 3 pages', document.querySelector('.aw-tour').classList.contains('show') && document.querySelectorAll('.aw-tour-dots i').length === 3);
      u._parts.tour.next(); u._parts.tour.next(); u._parts.tour.next(); PT.step(0.05);
      PT.check('tree tour closes after page 3', !u._parts.tour.isOpen);
    });

    PT.check('mage page: no console errors', errs(pg).length === 0, errs(pg).slice(0, 6));
  }
  await pg.close();

  // ------------------------------------------------------------ melee class: 투지 resource bar + signature
  {
    const p2 = await PT.boot('&cls=paladin&skills=preset:starter_paladin');
    if (p2.ready) {
      await p2.run('paladin hud', () => {
        PT.step(0.3);
        PT.check('vitals data-res = resolve', document.querySelector('.aw-vitals').dataset.res === 'resolve');
        PT.check('stamina bar shown for melee', document.querySelector('.aw-hud').dataset.fam === 'melee');
        if (game.skills && !game.skills.isStub) {
          PT.check('9 hotbar slots', document.querySelectorAll('.aw-hb3.on .aw-slot3').length === 9);
          PT.check('signature: paladin seal pips', document.querySelector('.aw-hb3-sig')?.dataset.mode === 'pips', document.querySelector('.aw-hb3-sig')?.dataset.mode);
        }
      });
      PT.check('paladin: no console errors', p2.errors().length === 0, p2.errors().slice(0, 6));
    } else PT.check('paladin boot', false);
    await p2.close();
  }

  // ------------------------------------------------------------ check 9d: the tree works with the skills stub (dynamic-import fallback)
  if (!treeData) PT.skip('skills stub (dynamic-import fallback)', 'src/skills/trees/index.js not present in this tree');
  else {
    const p3 = await PT.boot('&cls=mage&stub=skills');
    if (p3.ready) {
      await p3.eval(() => { game.ui.openSkillTree(); PT.step(0.05); });
      await p3.page.waitForFunction(() => game.ui._parts.tree.hasData() || game.ui._parts.tree.loadFailed(), null, { timeout: 30000 }).catch(() => {});
      await p3.run('skills stub', () => {
        PT.step(0.05);
        const T = game.ui._parts.tree;
        PT.check('skills is the stub', game.skills.isStub === true || game.stubbed.includes('skills'));
        PT.check('fallback tree data loaded', T.hasData() && T.nodeCount() > 150, T.nodeCount());
        PT.check('no "cannot load" message', !document.querySelector('.aw-tree').classList.contains('nodata'));
        T.zoomTo('fire'); PT.step(0.05);
        PT.check('constellation renders on the stub', document.querySelectorAll('.aw-const.on .aw-node').length >= 19);
        PT.check('progression got the trees (learning works)', game.progression.hasTrees?.() === true);
        game.progression.setLevel(4); PT.step(0.05);
        const id = [...document.querySelectorAll('.aw-const.on .aw-node.avail')].map((n) => n.dataset.id).find((x) => !game.progression.isLearned(x));
        if (id) { T.learn(id); PT.check('learn on the stub', game.progression.isLearned(id), id); }
        game.ui.closeSkillTree(); PT.step(0.05);
        PT.check('closed + unlocked', !game.ui.skillTreeOpen && !game.input.isLocked('menu'));
        PT.check('v2 hotbar fallback (no v3 HudState)', !document.querySelector('.aw-hb3.on'));
      });
      PT.check('stub page: no console errors', p3.errors().length === 0, p3.errors().slice(0, 6));
    } else PT.check('stub boot', false);
    await p3.close();
  }

  // ------------------------------------------------------------ skills data missing entirely → the Korean "cannot load" message, no crash
  {
    const p4 = await PT.boot('&cls=mage&stub=skills', { init: (page) => page.route(/\/src\/skills\//, (r) => r.abort()) });
    if (p4.ready) {
      await p4.eval(() => { game.ui.openSkillTree(); PT.step(0.05); });
      await p4.page.waitForFunction(() => game.ui._parts.tree.loadFailed(), null, { timeout: 30000 }).catch(() => {});
      await p4.run('no tree data', () => {
        PT.step(0.05);
        PT.check('message "스킬 데이터를 불러올 수 없습니다"', document.querySelector('.aw-tree-nodata').textContent === '스킬 데이터를 불러올 수 없습니다', document.querySelector('.aw-tree-nodata').textContent);
        game.ui.closeSkillTree(); PT.step(0.05);
        PT.check('closes cleanly', !game.ui.skillTreeOpen && game.state === 'playing');
      });
      const pageErrs = p4.errors().filter((e) => e.startsWith('[pageerror]'));
      PT.check('no page errors without tree data', pageErrs.length === 0, pageErrs.slice(0, 4));
    }
    await p4.close();
  }
};
