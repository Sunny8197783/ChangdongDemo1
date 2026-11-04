// playtest3 section: core (CONTRACT §21 checks 1-4 + core services). Owned by core.
// Runs with the other modules present or stubbed: anything that needs a later-wave owner is SKIPped, never faked.
const fs = require('fs'); const path = require('path');

const CLASSES = ['mage', 'sword', 'ranger', 'paladin', 'spiritcaller', 'shadowblade'];

module.exports = async function core(PT) {
  // ------------------------------------------------------------ static: rule 8 / rule 9 grep on core files
  {
    const files = ['src/main.js', ...fs.readdirSync(path.join(PT.root, 'src/core')).map((f) => 'src/core/' + f)]
      .filter((f) => f !== 'src/core/classes.js');
    const bad = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(PT.root, f), 'utf8').split('\n');
      src.forEach((l, i) => { if (/=== ?'(sword|mage)'/.test(l)) bad.push(`${f}:${i + 1}`); if (/for \(let \w+ = 0; \w+ < 5;/.test(l)) bad.push(`${f}:${i + 1} (i<5)`); });
    }
    PT.check('rule 8/9: no class literals or i<5 loops in core files', bad.length === 0, bad);
  }

  // ------------------------------------------------------------ check 1: each class boots (no stubs beyond missing files, no errors)
  let magePage = null;
  for (const cls of CLASSES) {
    const pg = await PT.boot(`&cls=${cls}`);
    PT.check(`boot ${cls}: ready`, pg.ready);
    if (!pg.ready) { await pg.close(); continue; }
    const info = await pg.run(`boot ${cls}`, (c) => {
      const g = game;
      PT.step(1.0);
      const P = g.progression;
      PT.check('class set', P.cls === c && P.chosen, P.cls);
      PT.check('primary 각인 granted', g.classes.DEFS[c].primary.every((el) => P.isGranted(el + '.attune')));
      PT.check('family/style from classes', g.classes.familyOf(c) === g.classes.DEFS[c].family);
      PT.check('derived maxHp = class base', g.stats.derived().maxHp === g.classes.DEFS[c].base.hp, g.stats.derived().maxHp);
      PT.check('keymap v3', g.keymapMode === 'v3');
      return { state: g.state, stubbed: g.stubbed.slice(), skillsStub: !!g.skills?.isStub, hasPresets: !!(g.skills && !g.skills.isStub && g.skills.applyPreset) };
    }, cls);
    PT.check(`boot ${cls}: playing`, info?.state === 'playing', info?.state);
    const extra = (info?.stubbed || []).filter((m) => !PT.missing.includes(m));
    PT.check(`boot ${cls}: no stubbed modules (except files not yet present: ${PT.missing.join(',') || 'none'})`, extra.length === 0, info?.stubbed);
    PT.check(`boot ${cls}: no console errors`, pg.errors().length === 0, pg.errors().slice(0, 6));

    // check 2 (part): at level 8 each class can learn + equip an ultimate from a primary tree (starter_<cls> + L8)
    if (info?.hasPresets) {
      await pg.run(`L8 ultimate ${cls}`, (c) => {
        const g = game, P = g.progression, S = g.skills;
        const okPreset = S.applyPreset('starter_' + c);
        PT.check('starter preset applies', okPreset !== false);
        P.debug.ungate = false; P.debug.infPoints = false;
        P.setLevel(8);
        let found = null;
        for (const el of g.classes.DEFS[c].primary) {
          const ult = P.nodesOf(el).find((n) => n.type === 'ultimate');
          if (!ult) continue;
          if (P.isLearned(ult.id) || P.learn(ult.id)) { found = ult; break; }
          // try the cheapest prerequisites, then the ultimate
          for (const n of P.nodesOf(el)) if ((n.tier || 1) <= 2 && n.type !== 'modifier' && !P.isLearned(n.id)) P.learn(n.id);
          if (P.learn(ult.id)) { found = ult; break; }
        }
        PT.check('an ultimate is learnable at L8', !!found, P.points);
        if (found) {
          const skillId = (found.grants || [])[0];
          g.player.lastHurtT = -1e9;
          PT.check('ultimate equips', S.equip('ult', skillId) !== false, { skillId, why: S.canEquip?.('ult', skillId) });
        }
      }, cls);
    } else PT.skip(`L8 ultimate ${cls}`, 'needs skills (starter presets)');

    if (cls === 'mage') magePage = pg; else await pg.close();
  }

  // ------------------------------------------------------------ boots with every module stubbed except core
  {
    const pg = await PT.boot('&stub=all');
    PT.check('stub=all: ready', pg.ready);
    if (pg.ready) {
      const r = await pg.run('stub=all', () => { PT.step(1); return { state: game.state, n: game.stubbed.length }; });
      PT.check('stub=all: playing with 12 stubs', r?.state === 'playing' && r?.n === 12, r);
      PT.check('stub=all: no console errors', pg.errors().length === 0, pg.errors().slice(0, 6));
    }
    await pg.close();
  }

  // ------------------------------------------------------------ legacy config (path=all) + check 4 legacy sword buff
  {
    const pg = await PT.boot('&cls=sword&path=all');
    PT.check('legacy path=all: ready', pg.ready);
    if (pg.ready) {
      await pg.run('legacy', () => {
        const g = game, P = g.progression;
        PT.step(0.5);
        PT.check('keymap legacy', g.keymapMode === 'legacy');
        PT.check('legacy implies unlock=all', P.debug.ungate === true);
        const un = P.unlockedElements();
        PT.check('5 classic elements unlocked', ['fire', 'ice', 'lightning', 'wind', 'earth'].every((e) => un.includes(e)), un.slice());
        PT.check('legacy path getter', P.path === 'all', P.path);
        // check 4: legacy fire sword buff → levelUp → buff ends → atkMul back to 1
        const sw = g.sword;
        if (sw?.debugUse && sw.setElement) {
          sw.setElement('fire'); PT.step(0.3);
          sw.debugUse('support'); PT.step(0.2);
          const during = { stats: g.stats.get('atkMul'), mods: g.player.mods?.atkMul, buff: sw.buff };
          g.events.emit('levelUp', { level: P.level, pointsGained: 0 });
          let k = 0; while (sw.buff && k++ < 60) PT.step(1);
          PT.check('legacy fire sword buff started', !!during.buff, during);
          PT.check('after buff end: stats atkMul === 1', g.stats.get('atkMul') === 1, g.stats.get('atkMul'));
          PT.check('after buff end: player.mods.atkMul === 1', (g.player.mods?.atkMul ?? 1) === 1, g.player.mods?.atkMul);
        } else PT.skip('legacy sword buff', 'sword.debugUse missing');
      });
      PT.check('legacy: no console errors', pg.errors().length === 0, pg.errors().slice(0, 6));
    }
    await pg.close();
  }

  if (!magePage) { PT.check('mage page available for core service checks', false); return; }
  const pg = magePage;

  // ------------------------------------------------------------ registries / data
  await pg.run('elements', async () => {
    const E = await import('/src/core/elements.js'), U = await import('/src/core/utils.js');
    PT.check('ALL_ELEMENTS = 9', E.ALL_ELEMENTS.length === 9, E.ALL_ELEMENTS);
    PT.check('legacy ELEMENTS stays the 5 classic', U.ELEMENTS.length === 5 && U.ELEMENTS.join() === E.CLASSIC_ELEMENTS.join());
    PT.check('earth status encrusted', E.ELEMENT_DEFS.earth.status === 'encrusted');
    // v4 (PLAN §3.2, §7.9): colours come from the element ramps; physical = its ramp mid (no white effect colour)
    PT.check('ELEMENT_COLORS proxy fallback → physical', U.ELEMENT_COLORS.nope === 0x8A8274 && U.ELEMENT_COLORS.water === E.elColor('water') && U.ELEMENT_COLORS.fire === E.ELEMENT_DEFS.fire.colors.fx.mid);
    PT.check('ELEMENT_NAMES_KO legacy ice 냉기 / elName 빙결', U.ELEMENT_NAMES_KO.ice === '냉기' && E.elName('ice') === '빙결' && U.ELEMENT_NAMES_KO.zzz === '물리');
    PT.check('elColor/elName fallbacks never undefined', E.elColor('void', 'css') === '#9a6bff' && E.elColor(undefined) === 0x8A8274 && E.elName('x') === '물리');
    const D = E.ELEMENT_DEFS;
    PT.check('v4 ramps: core := hi, edge := dark, mid/hex := mid; shadow core := dark, edge := light', E.ALL_ELEMENTS.every((el) => {
      const c = D[el].colors, r = c.fx; return c.mid === r.mid && c.hex === r.mid && (el === 'shadow' ? c.core === r.dark && c.edge === r.light : c.core === r.hi && c.edge === r.dark);
    }) && D.fire.colors.mid === 0xF0661A && D.shadow.colors.core === 0x0C0614 && D.shadow.colors.edge === 0x9A5CFF && D.light.colors.mid === 0xE8D9B0);
    PT.check('game.elements shape', game.elements.list === E.ALL_ELEMENTS && typeof game.elements.color === 'function');
  });
  await pg.run('classes', () => {
    const C = game.classes, bad = [];
    for (const el of game.elements.list) { const n = C.ids.filter((c) => C.access(c, el)).length; if (n !== 4) bad.push(`${el}:${n}`); }
    for (const c of C.ids) {
      const d = C.DEFS[c];
      if (C.classElements(c).length !== 6 || d.primary.length !== 2) bad.push(`${c}:${C.classElements(c).length}`);
      if ((d.family === 'melee') !== (d.resource === 'resolve')) bad.push(`${c}:resource`);
      for (const L of [1, 10, 20]) if (!C.TALENTS[d.talents[L]]?.nameKo) bad.push(`${c}:talent${L}`);
      for (const t of d.talents[25]) if (!C.TALENTS[t]?.nameKo) bad.push(`${c}:${t}`);
    }
    PT.check('access table: 4 classes per element, 6 elements per class, talents', bad.length === 0, bad);
    PT.check('6 classes', C.ids.length === 6);
    PT.check('familyOf unknown → caster', C.familyOf('nobody') === 'caster');
  });

  // ------------------------------------------------------------ settings v2 → v3 migration (check 1)
  await pg.run('settings', async () => {
    const M = await import('/src/core/settings.js');
    const keep3 = localStorage.getItem(M.KEY), keep2 = localStorage.getItem(M.KEY_V2);
    try {
      localStorage.removeItem(M.KEY);
      localStorage.setItem(M.KEY_V2, JSON.stringify({ volMusic: 0.123, quality: 'low', grassDensity: 0.3 }));
      const fake = { events: { emit() {} } };
      const s1 = M.createSettings(fake);
      PT.check('migration copies v2 values', s1.migrated && s1.values.volMusic === 0.123 && s1.values.quality === 'low');
      PT.check('v3 key written once', !!localStorage.getItem(M.KEY));
      PT.check('v2 key untouched', JSON.parse(localStorage.getItem(M.KEY_V2)).volMusic === 0.123);
      s1.set('volMusic', 0.5);
      const s2 = M.createSettings(fake);
      PT.check('second load reads v3 (no re-copy)', !s2.migrated && s2.values.volMusic === 0.5);
      // v4 (§6.8): screenShake default 0.6, damageNumbers enum ('merged' default; v3 booleans migrate)
      PT.check('v3 defaults present', s2.values.difficulty === 'normal' && s2.values.screenShake === 0.6 && s2.values.damageNumbers === 'merged' && s2.values.holdToCast === true);
      s2.applyPreset('low');
      PT.check('preset sets effectQuality', s2.values.effectQuality === 'low');
      PT.check('game.difficulty applied', game.difficulty?.id === 'normal' && game.difficulty.dmgMul === 1);
    } finally {
      if (keep3 == null) localStorage.removeItem(M.KEY); else localStorage.setItem(M.KEY, keep3);
      if (keep2 == null) localStorage.removeItem(M.KEY_V2); else localStorage.setItem(M.KEY_V2, keep2);
    }
  });

  // ------------------------------------------------------------ check 2: progression with the fixture tree
  await pg.run('progression', async () => {
    const g = game, P = g.progression;
    const tree = await PT.fixture('tree_fire');
    PT.check('fixture has 19 nodes', tree.nodes.length === 19);
    P.registerTrees({ fire: tree });
    P.debug.ungate = false; P.debug.infPoints = false; P.debug.strictPlace = false;
    const R = (id) => P.canLearn(id).reason;

    // check 2 (fixture form, works without skills): at level 8 a fire-primary class learns its ultimate
    for (const c of ['mage', 'paladin']) {
      P.setClass(c); P.setLevel(8);
      const path = ['fire.salamander', 'fire.p1', 'fire.cyclone', 'fire.rising', 'fire.ult'].map((id) => P.learn(id));
      PT.check(`L8 ${c}: fire ultimate learnable (fixture)`, path.every(Boolean) && P.isLearned('fire.ult'), { path, points: P.points });
    }
    P.setLevel(1);
    P.setClass('shadowblade'); P.setLevel(20);
    PT.check('locked tree → class', R('fire.salamander') === 'class', R('fire.salamander'));
    PT.check('tierCap none', P.tierCap('fire') === null);
    P.setClass('sword'); P.setLevel(20);
    PT.check('secondary T4 → tier', R('fire.phoenix') === 'tier', R('fire.phoenix'));
    PT.check('secondary tierCap T3', P.tierCap('fire') === 'T3');
    P.sealsBroken = false; P.setClass('mage'); P.setLevel(20);
    PT.check('capstone before story gate → story', R('fire.cap') === 'story', R('fire.cap'));
    PT.check('primary tierCap T4 before seals', P.tierCap('fire') === 'T4');
    PT.check('T2 before 2 points → gate', R('fire.m1a') === 'gate', R('fire.m1a'));
    P.learn('fire.p1');
    PT.check('prereq', R('fire.m1a') === 'prereq', R('fire.m1a'));
    P.learn('fire.salamander'); P.learn('fire.m1a');
    PT.check('exclusive pair', R('fire.m1b') === 'exclusive', R('fire.m1b'));
    P.learn('fire.cyclone'); P.learn('fire.rising');
    PT.check('pointsIn counts granted for gates', P.pointsIn('fire') === 6 && P.pointsIn('fire', { forGates: false }) === 5, [P.pointsIn('fire'), P.pointsIn('fire', { forGates: false })]);
    PT.check('learn ultimate at gate 5', P.learn('fire.ult'));
    PT.check('damageMul = mastery only (7 paid → 1.14)', Math.abs(P.damageMul('fire') - 1.14) < 1e-9, P.damageMul('fire'));
    PT.check('canUnlearn granted', P.canUnlearn('fire.attune').reason === 'granted');
    PT.check('canUnlearn dependent', P.canUnlearn('fire.salamander').reason === 'dependent');
    PT.check('canUnlearn leaf ok', P.canUnlearn('fire.ult').ok);
    PT.check('unlearn rising (requiresAny still met)', P.unlearn('fire.rising'));
    PT.check('canUnlearn gate (refund would hollow T3)', P.canUnlearn('fire.p1').reason === 'gate', P.canUnlearn('fire.p1'));
    PT.check('mastery rank 숙련', P.mastery('fire').rank === '숙련' && P.mastery('fire').milestones.join() === '5');
    PT.check('hasSkill via grants', P.hasSkill('fire.ult') && P.hasSkill('fire.basic') && !P.hasSkill('fire.phoenix'));
    PT.check('unlockedElements = class elements with points', P.unlockedElements().join() === 'fire,ice', P.unlockedElements().slice());
    // points derived / save round trip
    const ser = JSON.parse(JSON.stringify(P.serialize()));
    const pts = P.points, ranks = JSON.stringify(ser.ranks);
    PT.check('serialize has no points field', !('points' in ser), Object.keys(ser));
    PT.check('points = earned − spent', pts === P.earnedPoints() - P.spentPoints() && P.earnedPoints() === 20, [pts, P.earnedPoints(), P.spentPoints()]);
    P.reset(); P.registerTrees({ fire: tree });
    P.deserialize(ser);
    PT.check('round trip keeps points + ranks', P.points === pts && JSON.stringify(P.serialize().ranks) === ranks, [P.points, pts]);
    PT.check('node stat source applied (fire.p1)', g.stats.has('node:fire.p1') && g.stats.get('burnDurAdd') === 0.5, g.stats.get('burnDurAdd'));
    // story gates
    P.breakSeals();
    PT.check('seals → classic capstone open', P.tierCap('fire') === 'CAP');
    P.freeSpirit('water'); PT.check('one spirit → no feather', !P.lumielFeather && !P.storyGateOpen('light'));
    P.freeSpirit('nature'); PT.check('two of water/shadow/nature → 루미엘의 깃털', P.lumielFeather && P.storyGateOpen('light') && P.storyGateOpen('nature') && !P.storyGateOpen('shadow'));
    // respec only at the altar
    P.debug.strictPlace = true;
    const pp = g.player.object.position, keep = pp.clone();
    pp.set(keep.x + 400, keep.y, keep.z + 400);
    PT.check('respec refused away from altar', P.respecAll() === false && P.canUnlearn('fire.ult').reason === 'place');
    PT.check('class change refused away from altar', P.canChangeClass().reason === 'place');
    const altar = g.world?.altar || g.world?.village?.altar || g.world?.respecSpots?.[0];
    if (altar) {
      pp.set(altar.x + 2, pp.y, altar.z + 1);
      PT.check('respec works at the altar', P.respecAll() === true && P.spentPoints() === 0 && P.rank('fire.attune') === 1);
      PT.check('class change ok at the altar', P.canChangeClass().ok);
    } else PT.skip('respec at altar', 'world has no altar');
    pp.copy(keep);
    P.debug.strictPlace = false;
    // XP curve + sources
    P.setLevel(1);
    // formula round(40·L^1.4 + 60) (DESIGN §5.1 / CONTRACT §4). DESIGN's example column is approximate (it lists 454 for L5).
    PT.check('xpToNext formula', [1, 5, 10, 20, 29].every((L) => P.xpToNext(L) === Math.round(40 * Math.pow(L, 1.4) + 60)) && P.xpToNext(1) === 100, [1, 5, 10, 20, 29].map((L) => P.xpToNext(L)));
    const lu0 = PT.countEvents('levelUp');
    P.addXp(100, { kind: 'quest' });
    PT.check('100 XP → level 2, one levelUp', P.level === 2 && PT.countEvents('levelUp') === lu0 + 1);
    const xp0 = P.totalXp;
    g.events.emit('kill', { target: { xpValue: 0, team: 'enemy' } });
    PT.check('kill with xpValue 0 gives no XP', P.totalXp === xp0);
    g.events.emit('kill', { target: { xpValue: 15, team: 'enemy' } });
    PT.check('kill with xpValue gives XP', P.totalXp === xp0 + 15, P.totalXp - xp0);
    P.setLevel(10); const xp1 = P.totalXp;
    g.events.emit('kill', { target: { xpValue: 20, team: 'enemy', zoneLevel: 1 } });
    PT.check('falloff ×0.5 at ≥ zoneLevel+6', P.totalXp === xp1 + 10, P.totalXp - xp1);
    const xp2 = P.totalXp;
    g.events.emit('kill', { target: { xpValue: 20, team: 'enemy', zoneLevel: 15 } });
    PT.check('catch-up ×1.5 at ≤ zoneMin−3', P.totalXp === xp2 + 30, P.totalXp - xp2);
    const pts0 = P.points;
    g.events.emit('shrineFound', { id: 'seedTest', kind: 'seed' });
    g.events.emit('shrineFound', { id: 'seedTest', kind: 'seed' });
    PT.check('seed shrine +1 point once', P.points === pts0 + 1);
    g.events.emit('bossDefeated', { id: 'golem', name: 'x', final: false });
    PT.check('act boss +1 point', P.points === pts0 + 2);
    P.setLevel(30);
    P.bossesDefeated = new Set(['golem', 'hydra', 'nox', 'treant', 'kalis']);
    P.shrinesFound = new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']);
    P.setLevel(29); P.setLevel(30);
    PT.check('38 points at cap', P.earnedPoints() === 38, P.earnedPoints());
    PT.check('judgment threshold default 5', P.judgmentThreshold() === 5);
    PT.check('breadth 0 trees', P.breadth().trees5 === 0 && !P.breadth().awakened);
    // v2 shims
    PT.check('v2 shims present', typeof P.choose === 'function' && P.path === 'all' && P.element === null && P.isMaster() === false && P.hasFinisher() === false);
    P.setRanks({ 'fire.ult': 1, 'fire.cap': 1 }, { ignoreBudget: true, ignoreGates: true });
    PT.check('capstone → path master / element fire / awakening enabled', P.path === 'master' && P.element === 'fire' && P.hasAwakenedUltimate('fire') && P.awakeningEnabled());
    P.debug.ungate = false;
  });

  // ------------------------------------------------------------ check 3: canonical damage formula
  await pg.run('damage formula', () => {
    const g = game, P = g.progression, S = g.stats;
    const v3 = !!(g.combat?.STATUS_DEFS || g.combat?.REACTION_DEFS);
    P.debug.ungate = false; P.setClass('mage'); P.setLevel(1);
    S.set('test:nocrit', { critChance: -10 });
    const pp = g.player.object.position;
    const d = g.debug.spawnDummy(new g.THREE.Vector3(pp.x, pp.y, pp.z - 5), { hp: 1e6 });
    const hit = () => {
      g.combat.clearStatus?.(d, 'exposed');
      for (const k of Object.keys(d.statuses || {})) g.combat.clearStatus?.(d, k);
      return g.combat.dealDamage(d, { amount: 100, element: 'fire', source: 'player', noReaction: true, noCrit: true, point: d.object.position.clone() })?.damage;
    };
    const a = hit();
    PT.check('100 base at L1, no nodes → 100', a === 100, a);
    P.setLevel(10);
    P.setRanks({ 'fire.p1': 1, 'fire.rx': 1, 'fire.key': 1, 'fire.salamander': 1, 'fire.cyclone': 1 }, { ignoreBudget: true, ignoreGates: true });
    PT.check('inputs: power 1.36, mastery 1.10, fireDmg 1.35', Math.abs(S.derived().power - 1.36) < 1e-9 && Math.abs(P.damageMul('fire') - 1.1) < 1e-9 && Math.abs(S.elementDmg('fire') - 1.35) < 1e-9,
      [S.derived().power, P.damageMul('fire'), S.elementDmg('fire')]);
    if (v3) {
      const b = hit(), want = 100 * 1.36 * 1.10 * 1.35;
      PT.check('L10 + fire.key + 5 points → 100×1.36×1.10×1.35 (±0.5)', Math.abs(b - want) <= 0.5, { got: b, want });
    } else PT.skip('L10 formula through combat.dealDamage', 'needs combat v3 (§8.3 formula)');
    if (g.skills && !g.skills.isStub && g.skills.defs?.has?.('fire.basic') && g.spells?.castById) PT.note('debug.cast / castById formula path: covered by combat/skills sections');
    else PT.skip('formula via debug.cast and castById', 'needs skills + magic');
    S.clear('test:nocrit');
  });

  // ------------------------------------------------------------ check 4: stats buffs + one statsChanged per frame
  await pg.run('stats', () => {
    const g = game, S = g.stats;
    S.set('buff:test', { atkMul: 1.3, moveMul: 1.1 }, { duration: 1.5 });
    PT.check('buff applies', Math.abs(S.get('atkMul') - 1.3) < 1e-9);
    g.events.emit('levelUp', { level: g.progression.level, pointsGained: 0 });
    PT.step(1.7);
    PT.check('buff expired in game time → atkMul 1', S.get('atkMul') === 1 && !S.has('buff:test'));
    for (let i = 0; i < 10; i++) S.set('buff:t' + i, { atkMul: 1.05, extraJumps: 1 }, { duration: 1.0 });
    PT.step(0.5);
    const c0 = PT.countEvents('statsChanged');
    PT.step(0.7);
    PT.check('10 buffs expiring in one frame → one statsChanged', PT.countEvents('statsChanged') - c0 === 1, PT.countEvents('statsChanged') - c0);
    PT.check('all expired', S.get('atkMul') === 1 && S.get('extraJumps') === 0);
    S.set('x:a', { critChance: 0.1, freeNext: true });
    S.set('x:b', { critChance: 0.05, cdrMul: 0.9 });
    PT.check('add / flag / mul aggregation', Math.abs(S.get('critChance') - 0.15) < 1e-9 && S.get('freeNext') === true && Math.abs(S.get('cdrMul') - 0.9) < 1e-9);
    PT.check('consume(freeNext) clears its source', S.consume('freeNext') && !S.has('x:a') && S.get('freeNext') === false && S.has('x:b'));
    S.clear('x:b');
    let procHits = 0; S.registerProc('buff:proc', 'testProc', () => procHits++);
    g.events.emit('testProc', {}); S.clear('buff:proc'); g.events.emit('testProc', {});
    PT.check('registerProc removed on clear', procHits === 1);
    // the skills breadth source (DESIGN §5.7: rxAll 1.04 per tree with ≥ 5 points) is legitimately present once a preset is learned
    const hadBreadth = S.has('breadth'); if (hadBreadth) S.clear('breadth');
    PT.check('rx keys default 1', S.reactionDmg('melt', 'blessing') === 1 && S.elementDmg('shadow') === 1, { melt: S.reactionDmg('melt', 'blessing'), shadow: S.elementDmg('shadow'), hadBreadth });
  });

  // ------------------------------------------------------------ core services: timeScale, interact, post, dissolve, archetypes, save
  await pg.run('services', async () => {
    const g = game, TS = g.timeScale;
    TS.set('t1', 0.5, 1.0); TS.set('t2', 0.3, 0.5);
    PT.check('timeScale = min of active', Math.abs(TS.value() - 0.3) < 1e-9);
    TS.update(0.6); PT.check('shorter entry expires', Math.abs(TS.value() - 0.5) < 1e-9);
    TS.update(0.5); PT.check('all expired → 1', TS.value() === 1);
    g.slowmo(0.4, 0.3); PT.check('slowmo shim → legacy id', TS.has('legacy') && TS.value() <= 0.4 && g._slowScale <= 0.4);
    TS.set('focus', 0.35, 0.2); PT.check('comp() = 1/value while focus', Math.abs(TS.comp() - 1 / 0.35) < 1e-6);
    TS.clear('focus'); TS.clear('legacy');
    // interact: F is interact only
    let used = 0;
    const pp = g.player.object.position.clone();
    const c0 = PT.countEvents('interactChanged');
    g.interact.offer('test:spot', { pos: () => pp, r: 3, label: '테스트', onUse: () => { used++; } });
    PT.step(0.2);
    PT.check('interact.current() finds the offer', g.interact.current()?.id === 'test:spot' && PT.countEvents('interactChanged') > c0);
    g.input.simulate({ keys: { KeyF: true } }); g.step(1, 1 / 60); g.input.simulate(null); g.step(1, 1 / 60);
    PT.check('KeyF → interact.use()', used === 1, used);
    g.interact.withdraw('test:spot'); PT.step(0.15);
    PT.check('withdraw clears current', g.interact.current() === null);
    // post pulse + grade
    g.post.pulse(1, 0.2);
    PT.check('pulse sets uChroma/uRadial', g.post.uniforms.uChroma.value > 0 && g.post.uniforms.uRadial.value > 0);
    PT.step(0.3);
    PT.check('pulse decays to 0', g.post.uniforms.uChroma.value === 0 && g.post.uniforms.uRadial.value === 0);
    g.post.grade('void', 1, 0.1); PT.step(0.6);
    PT.check('grade blends in', g.post.uniforms.uGradeMix.value > 0.95, g.post.uniforms.uGradeMix.value);
    g.post.grade('none', 0, 0.1); PT.step(0.6);
    PT.check('grade none blends out', g.post.uniforms.uGradeMix.value < 0.01);
    // toon dissolve chunk: uniform from boot, clone dissolves without a new program
    const U = await import('/src/core/utils.js');
    const T = g.THREE;
    const m = U.toonMat(0x88aaff);
    const mesh = new T.Mesh(new T.BoxGeometry(1, 1, 1), m);
    mesh.position.copy(pp).add(new T.Vector3(0, 1.2, -2));
    g.scene.add(mesh);
    const s1 = PT.frameStats();
    PT.check('toon program key toonRim+dis', m.customProgramCacheKey() === 'toonRim+dis' && U.dissolveUniforms(m).uDissolve.value === -1);
    const clone = m.clone(); clone.onBeforeCompile = m.onBeforeCompile; clone.customProgramCacheKey = m.customProgramCacheKey;
    U.dissolveUniforms(clone).uDissolve.value = 0.5;
    mesh.material = clone;
    const s2 = PT.frameStats();
    PT.check('dissolving clone compiles no new program', s2.programs === s1.programs, [s1.programs, s2.programs]);
    PT.check('shared material untouched', U.dissolveUniforms(m).uDissolve.value === -1);
    g.scene.remove(mesh);
    PT.check('drawStats shape', ['calls', 'tris', 'programs', 'particles', 'decals', 'lights'].every((k) => typeof s2[k] === 'number'), s2);
    // archetype registry + skills forwarding (works while skills is stubbed)
    const fn = () => 1;
    g.skills.registerArchetype('testArch', 'caster', fn);
    g.skills.registerImpl('test.skill', 'melee', fn);
    PT.check('archetypes registry via skills forwarders', g.archetypes.getArchetype('testArch', 'caster') === fn && g.archetypes.getImpl('test.skill', 'melee') === fn && g.archetypes.getArchetype('testArch', 'melee') === null);
    PT.check('archetypes list covers the 24 names', g.archetypes.list().archetypes.length >= 24);
    // save: disabled in test mode without &save=1
    PT.check('save disabled in test mode', g.save.has() === false && g.save.save() === false);
    // debug helpers
    PT.check('debug.events.count works', g.debug.events.count('levelUp') >= 1);
    PT.check('debug functions exist', ['level', 'xp', 'learn', 'learnAll', 'respec', 'equip', 'cast', 'preset', 'freeSpirits', 'breakSeals', 'tp', 'spawn', 'boss', 'bossPhase', 'killBoss', 'hurt', 'regenState', 'react', 'drawStats'].every((k) => typeof g.debug[k] === 'function'));
    const hp0 = g.player.entity?.hp ?? g.player.hp;
    g.debug.hurt(5);
    PT.check('debug.hurt damages the player', (g.player.entity?.hp ?? g.player.hp) < hp0, [hp0, g.player.entity?.hp]);
    PT.heal();
  });
  PT.check('mage page: no console errors', pg.errors().length === 0, pg.errors().slice(0, 6));
  await pg.close();

  // ------------------------------------------------------------ check 11 [core + all]: per-scene perf + frame-time stats
  // Draw calls / triangles / programs per scene (DESIGN §12 caps) and CPU frame time: `updateMs` = game.step without
  // rendering (the simulation cost), `frameMs` = one full step + render (SwiftShader: the render part is CPU-emulated
  // and only comparable between runs on the same machine). Final scene: nidhoggra phase 1 and phase 2 on the plateau.
  const pf = await PT.boot('&cls=paladin&skills=preset:endgame_paladin&level=30');
  if (pf.ready) {
    await pf.eval(() => {
      const g = game;
      const time = (fn, n) => { const t = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - t) / n; };
      window.PF = { out: {}, prog0: 0 };
      PF.measure = (label, cap) => {
        let worst = { calls: 0, tris: 0, programs: 0 };
        for (let a = 0; a < 4; a++) { g.player.setLook?.(a * Math.PI / 2, -0.15); PT.step(0.1); const st = PT.frameStats(); if (st.calls > worst.calls) worst = st; }
        const updateMs = time(() => g.step(1, 1 / 60), 60);
        const frames = []; for (let i = 0; i < 8; i++) { const t = performance.now(); g.step(1, 1 / 60, true); frames.push(performance.now() - t); }
        frames.sort((a, b) => a - b);
        const r = { calls: worst.calls, tris: worst.tris, programs: worst.programs, updateMs: +updateMs.toFixed(2), frameMsMedian: +frames[4].toFixed(1), frameMsMax: +frames[7].toFixed(1) };
        PT.check(`${label}: calls ≤ ${cap}, tris ≤ 900k`, r.calls <= cap && r.tris <= 900000, r);
        PT.check(`${label}: simulation update ≤ 8 ms/frame`, r.updateMs <= 8, r.updateMs);
        return r;
      };
      PF.skipCine = () => { for (let i = 0; i < 20 && g.cinematic?.active; i++) { g.cinematic.skip?.(); PT.step(0.5); } };
    });
    await pf.run('perf (check 11) zones', () => {
      const g = game;
      PT.step(5);   // the "first 5 s of boot" window of check 11
      PF.prog0 = PT.frameStats().programs;
      const views = { village: [[-6, 128], 290], plains: [[-6, 20], 300], mirwen: [[-56, -60], 310], elderwood: [[70, -50], 310] };
      for (const k in views) { const [[x, z], cap] = views[k]; g.debug.tp({ x, z }); PT.step(0.5); PF.out[k] = PF.measure(k, cap); }
      g.story?.debugSkip?.('final'); PT.step(0.5); PF.skipCine();
    });
    // the bosses folder is a dynamic import: give it real time to resolve before the boss scene
    for (let i = 0; i < 20 && !(await pf.eval(() => !!game.enemies?.boss)); i++) {
      await new Promise((r) => setTimeout(r, 300));
      await pf.eval(() => { if (!game.enemies?.boss) { game.story?.debugComplete?.(); PT.step(0.3); } });
    }
    const stats = await pf.run('perf (check 11) final boss', () => {
      const g = game, nb = g.enemies?.boss;
      if (!nb) { PT.check('final boss spawned for the plateau perf scene', false); return PF.out; }
      const bp = nb.object.position; g.debug.tp({ x: bp.x + 4, z: bp.z + 18 }); PT.step(1);
      PF.out.plateau_nidhoggra_p1 = PF.measure('plateau + nidhoggra phase 1', 330);
      g.debug.bossPhase(2); PT.step(1); PF.skipCine(); PT.step(2);
      PF.out.plateau_nidhoggra_p2 = PF.measure('plateau + nidhoggra phase 2', 330);
      const prog1 = PT.frameStats().programs;
      PT.check('programs do not grow after the boss spawn + phase change', prog1 <= PF.prog0, [PF.prog0, prog1]);
      PT.note('frame stats ' + JSON.stringify(PF.out));
      return PF.out;
    });
    PT.check('perf page: no console errors', pf.errors().length === 0, pf.errors().slice(0, 6));
    void stats;
  } else PT.check('perf page boots', false);
  await pf.close();
};
