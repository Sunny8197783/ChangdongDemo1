// playtest3 section: skills (CONTRACT §21 check 5 + §7 runtime rules). Owned by skills.
// Runs with the other modules present or stubbed. Archetype casts fall back softly (logged once) until magic/melee land;
// check 5 still requires every cast to have an effect, one skillCast, one spellCast and ≤ 1 elementChanged.
const fs = require('fs'); const path = require('path');

const CLASSES = ['mage', 'sword', 'ranger', 'paladin', 'spiritcaller', 'shadowblade'];
const MY_FILES = ['src/skills.js', 'tools/playtest3/skills.js'];

module.exports = async function skills(PT) {
  // ------------------------------------------------------------ static: rule 8 / rule 9 on skills files
  {
    const dir = path.join(PT.root, 'src/skills');
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((f) => (f.isDirectory() ? walk(path.join(d, f.name)) : [path.join(d, f.name)]));
    const files = [...MY_FILES.map((f) => path.join(PT.root, f)), ...walk(dir)].filter((f) => f.endsWith('.js'));
    const bad = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8').split('\n');
      src.forEach((l, i) => {
        if (/=== ?'(sword|mage)'/.test(l) && !f.endsWith('playtest3/skills.js')) bad.push(`${path.relative(PT.root, f)}:${i + 1}`);
        if (/for \(let \w+ = 0; \w+ < 5;/.test(l)) bad.push(`${path.relative(PT.root, f)}:${i + 1} (i<5)`);
        if (/KeyF/.test(l) && !f.endsWith('playtest3/skills.js')) bad.push(`${path.relative(PT.root, f)}:${i + 1} (reads F)`);
        const m = /^\s*import .* from '([^']+)'/.exec(l);
        if (m && !f.endsWith('playtest3/skills.js')) {
          const spec = m[1];
          const ok = spec === 'three' || spec.startsWith('three/') || (() => {
            const abs = path.relative(PT.root, path.resolve(path.dirname(f), spec)).replace(/\\/g, '/');
            return abs.startsWith('src/skills/') || abs.startsWith('src/core/');
          })();
          if (!ok) bad.push(`${path.relative(PT.root, f)}:${i + 1} (cross-owner import ${spec})`);
        }
      });
    }
    PT.check('rule 7/8/9: no class literals, no i<5 loops, no F, no cross-owner static imports in skills files', bad.length === 0, bad);
  }

  // ------------------------------------------------------------ data + runtime on a mage page
  const pg = await PT.boot('&cls=mage');
  PT.check('boot mage: ready', pg.ready);
  if (!pg.ready) { await pg.close(); return; }
  await pg.run('data', () => {
    const g = game, S = g.skills;
    PT.check('skills is the real module', S && !S.isStub && !g.stubbed.includes('skills'), g.stubbed);
    PT.check('progression has the trees (registered in the factory)', g.progression.hasTrees() && g.progression.node('fire.cap') !== null);
    const els = g.elements.list;
    PT.check('9 trees in ALL_ELEMENTS order', JSON.stringify(Object.keys(S.trees)) === JSON.stringify(els), Object.keys(S.trees));
    let total = 0; const per = {};
    for (const el of els) { per[el] = S.trees[el].nodes.length; total += per[el]; }
    PT.check('175 nodes (19 classic / 20 new)', total === 175 && g.elements.classic.every((e) => per[e] === 19) && els.filter((e) => !g.elements.classic.includes(e)).every((e) => per[e] === 20), per);
    const defs = [...S.defs.values()].filter((d) => !d.tags?.includes('breadth'));
    PT.check('103 castable definitions', defs.length === 103, defs.length);
    PT.check('30 legacy-backed (spell) skills', defs.filter((d) => d.legacy?.spell).length === 30);
    const ROLE = { attune: [1, 1], a2: [1, 1], p1: [1, 1, 3], a3: [2, 1], a4: [2, 1], u: [2, 1], m1a: [2, 1], m1b: [2, 1], ult: [3, 2], rx: [3, 1], m2a: [3, 1], m2b: [3, 1], sig: [3, 1],
      sup: [4, 2], t4: [4, 2], m3a: [4, 1], m3b: [4, 1], key: [4, 1], p2: [4, 1, 2], cap: [5, 2] };
    const badShape = [];
    for (const n of S.nodes.values()) {
      const r = ROLE[n.slotRole];
      if (!r || n.tier !== r[0] || n.cost !== r[1] || (n.maxRank || 1) !== (r[2] || 1)) badShape.push(n.id);
      if (n.tier >= 4 && !n.primaryOnly) badShape.push(n.id + ' primaryOnly');
      if (!/[가-힣]/.test(n.nameKo || '') || !/[가-힣]/.test(n.desc || '')) badShape.push(n.id + ' korean');
      for (const gId of n.grants || []) if (!S.defs.has(gId)) badShape.push(n.id + ' grants ' + gId);
      if (n.exclusive && S.nodes.get(n.exclusive)?.exclusive !== n.id) badShape.push(n.id + ' exclusive');
    }
    PT.check('node shape: tier/cost/maxRank per slotRole, primaryOnly, Korean, grants, exclusive pairs', badShape.length === 0, badShape.slice(0, 10));
    // prerequisite rule (DESIGN §6.1)
    const badReq = [];
    for (const el of els) {
      const t = S.trees[el]; const by = {}; for (const n of t.nodes) by[n.slotRole] = n.id;
      const want = { attune: null, a2: null, p1: null, a3: by.attune, a4: by.attune, u: by.attune, m1a: by.a2, m1b: by.a2, rx: by.p1, m2a: by.a3, m2b: by.a3,
        sup: by.ult, t4: by.ult, m3a: by.t4, m3b: by.t4, key: by.rx, p2: by.rx, cap: by.ult };
      for (const n of t.nodes) {
        if (n.slotRole === 'ult' || n.slotRole === 'sig') { if (JSON.stringify(n.requiresAny) !== JSON.stringify([by.a3, by.a4])) badReq.push(n.id); }
        else if ((n.requires || null) !== want[n.slotRole]) badReq.push(n.id);
      }
    }
    PT.check('prerequisites follow DESIGN §6.1', badReq.length === 0, badReq);
    // exact ids (DESIGN §6.4–6.13) and the v3.1 names
    const ids = ['fire.salamander', 'fire.cyclone', 'fire.rising', 'fire.ember', 'fire.phoenix', 'ice.nova', 'ice.pillar', 'ice.prison', 'ice.slide', 'ice.glacier',
      'lightning.mine', 'lightning.dash', 'lightning.ball', 'lightning.rod', 'lightning.thunderclap', 'wind.vortex', 'wind.gust', 'wind.step', 'wind.updraft', 'wind.skyfall',
      'earth.spikes', 'earth.wall', 'earth.boulder', 'earth.steps', 'earth.colossus', 'water.whirl', 'water.spring', 'water.bubble', 'water.surf', 'water.clone', 'water.whip',
      'nature.roots', 'nature.spore', 'nature.treant', 'nature.grapple', 'nature.podseed', 'nature.thorngrove', 'light.flash', 'light.sanctuary', 'light.aegis', 'light.beacon',
      'light.mirror', 'light.spear', 'shadow.step', 'shadow.hex', 'shadow.reap', 'shadow.shade', 'shadow.raven', 'shadow.chains'];
    const missing = ids.filter((id) => !S.nodes.has(id) || !S.defs.has(id));
    PT.check('49 quick-slot actives with the exact ids', missing.length === 0 && ids.length === 49, missing);
    const names = { 'fire.attune': '화염 각인', 'ice.sup': '서리 반격', 'earth.sup': '도발의 석상', 'water.sup': '정화의 비', 'water.whirl': '물살 감옥', 'shadow.ult': '어둠의 심연',
      'shadow.m2b': '흡혼 저주', 'shadow.key': '그늘의 계약', 'shadow.hex': '그림자 낙인', 'light.rx': '찬란한 지혜' };
    const badName = Object.entries(names).filter(([id, n]) => S.nodes.get(id)?.nameKo !== n);
    PT.check('v3.1 Korean names', badName.length === 0 && S.defs.get('light.basic')?.nameKo === '광휘탄' && els.every((e) => S.nodes.get(e + '.attune').nameKo === g.elements.name(e) + ' 각인'), badName);
    // params: archetypes from the 24, statuses with stacks are objects, twist tags on actives
    const arch = new Set(g.archetypes.NAMES);
    const badDef = [];
    for (const d of defs) {
      if (d.archetype && !arch.has(d.archetype)) badDef.push(d.id + ' archetype ' + d.archetype);
      if (d.slot !== 'finisher' && !d.archetype) badDef.push(d.id + ' no archetype');
      for (const [k, v] of Object.entries(d.params?.status || {})) if (typeof v !== 'object' || (v.stacks != null && typeof v.stacks !== 'number')) badDef.push(d.id + ' status ' + k);
      if ((d.slot === 'quick') && !d.twist) badDef.push(d.id + ' twist');
      if (!/[가-힣]/.test(d.nameKo || '')) badDef.push(d.id + ' korean');
    }
    PT.check('defs: 24-archetype names, {dur,stacks} statuses, twist tags, Korean', badDef.length === 0, badDef.slice(0, 10));
    const P = S.PRESETS;
    const want = ['legacy_all', ...g.elements.classic.map((e) => 'legacy_master_' + e), ...g.classes.ids.flatMap((c) => ['starter_' + c, 'act2_' + c, 'endgame_' + c]), ...els.map((e) => 'showcase_' + e)];
    PT.check('all presets present', want.every((n) => P[n]), want.filter((n) => !P[n]));
    const noB = Object.values(P).every((p) => Object.keys(p.ranks).every((id) => !/\.m\db$/.test(id)));
    PT.check("presets always pick the 'a' modifier", noB);
    PT.check('registries forward to game.archetypes', S.registerImpl === S.registerImpl && (() => { const f = () => {}; S.registerImpl('pt.skill', 'caster', f); return g.archetypes.getImpl('pt.skill', 'caster') === f; })());
  });

  await pg.run('runtime', () => {
    const g = game, S = g.skills, P = g.progression;
    PT.check('ownsInput in v3 keymap', S.ownsInput === true);
    PT.check('unknown preset → false', S.applyPreset('nope') === false);
    PT.check('endgame_mage preset applies (38 points)', S.applyPreset('endgame_mage') && P.spentPoints() === 38, P.spentPoints());
    const h1 = S.getHudState(), h2 = S.getHudState();
    PT.check('HUD v3 shape', h1.v === 3 && h1.slots.length === 9 && h1.slots.map((s) => s.key).join() === 'LMB,RMB,1,2,3,4,X,G,R' && h1.elements.length >= 6 && h1.signature.kind === 'attunement');
    PT.check('HUD state and arrays are reused', h1 === h2 && h1.slots[0] === h2.slots[0] && h1.elements === h2.elements);
    PT.check('X shows the awakened ultimate with the capstone', h1.slots[6].id === 'fire.awakened' && h1.slots[6].awakened);
    // attune: one attuneChanged + one elementChanged
    S.attune('fire');
    PT.resetCounts();
    S.attune('ice');
    PT.check('attune emits attuneChanged + elementChanged once', PT.countEvents('attuneChanged') === 1 && PT.countEvents('elementChanged') === 1, { a: PT.countEvents('attuneChanged'), e: PT.countEvents('elementChanged') });
    PT.check('attune refuses a locked element', S.attune('earth') === false && S.attuned === 'ice');
    // equip rule
    g.player.lastHurtT = -1e9;
    PT.check('canEquip unlearned', S.canEquip('q1', 'earth.wall').reason === 'unlearned');
    PT.check('canEquip slot', S.canEquip('ult', 'fire.cyclone').reason === 'slot' && S.canEquip('q1', 'fire.ult').reason === 'slot');
    PT.check('canEquip ok out of combat', S.canEquip('q1', 'ice.nova').ok, S.canEquip('q1', 'ice.nova'));
    const origIn = g.player.inCombat;
    g.player.inCombat = () => true; g.player.lastHurtT = g.time;
    PT.check('canEquip refuses in combat', S.canEquip('q1', 'ice.nova').reason === 'combat');
    const ui = g.ui || (g.ui = {}); const wasOpen = ui.skillTreeOpen; const st = g.state;
    ui.skillTreeOpen = true; g.state = 'paused'; g.player.lastHurtT = g.time - 6;
    PT.check('canEquip ok paused in the tree, no damage for 5 s', S.canEquip('q1', 'ice.nova').ok);
    g.player.lastHurtT = g.time - 2;
    PT.check('canEquip refuses in the tree after recent damage', S.canEquip('q1', 'ice.nova').reason === 'combat');
    ui.skillTreeOpen = wasOpen; g.state = st; g.player.inCombat = origIn; g.player.lastHurtT = -1e9;
    PT.check('equip moves a skill (one slot per skill)', S.equip('q4', 'fire.cyclone') && S.loadout.q4 === 'fire.cyclone' && S.loadout.q1 !== 'fire.cyclone');
    // cooldowns per id (compensated time)
    S.resetCooldowns();
    S.cast('fire.cyclone', { free: true });
    PT.check('per-id cooldown', S.cooldownLeft('fire.cyclone') > 7 && S.isReady('ice.nova'));
    PT.step(1);
    PT.check('cooldown ticks', S.cooldownLeft('fire.cyclone') < 7.2);
    // charges (lightning.mine: 3 charges)
    S.resetCooldowns();
    for (let i = 0; i < 3; i++) S.cast('lightning.mine', { free: true });
    PT.check('charges: 3 mines then recharge', !S.isReady('lightning.mine') && S.cooldownLeft('lightning.mine') > 0);
    // resonance freeNext consumption + no cost
    S.resetCooldowns();
    g.player.mp = 50;
    g.stats.set('rx:resonance', { freeNext: true, nextMul: 1.3 }, { duration: 8 });
    const ok = S.cast('ice.nova');
    PT.check('freeNext: cost 0 and consumed', ok && g.player.mp === 50 && !g.stats.get('freeNext'), { ok, mp: g.player.mp });
    g.player.mp = 50;
    S.resetCooldowns();
    S.cast('ice.nova');
    PT.check('normal cast spends MP', g.player.mp === 36, g.player.mp);
    // effectiveParams merges learned modifiers, never scaled
    const ep = S.effectiveParams('fire.salamander');
    PT.check('effectiveParams merges fire.m1a (line 7 s, 2 m) unscaled', ep.line?.dur === 7 && ep.line?.width === 2 && ep.dmg === 14, ep);
    // cleanup on respec
    g.stats.set('buff:fire.sup', { atkMul: 1.1 }, { duration: 20 });
    P.setRanks({ 'fire.salamander': 1 }, { ignoreBudget: true, ignoreGates: true });
    PT.check('respec unequips unlearned skills', !['q1', 'q2', 'q3', 'q4', 'ult', 'sup'].some((s) => S.loadout[s] && !P.hasSkill(S.loadout[s])), { ...S.loadout });
    PT.check('respec clears buff:<id> of unlearned skills', !g.stats.has('buff:fire.sup'));
    PT.check('autoEquip fills an empty quick slot', Object.values(S.loadout).includes('fire.salamander'));
    // save round trip
    S.applyPreset('endgame_mage');
    const ser = JSON.parse(JSON.stringify(S.serialize()));
    for (const k of ['q1', 'q2', 'q3', 'q4', 'ult', 'sup']) S.loadout[k] = null;
    S.deserialize(ser);
    PT.check('serialize/deserialize loadout', S.loadout.q1 === ser.q1 && S.loadout.ult === ser.ult);
    // talents / breadth sources
    P.setLevel(25); P.chooseTalent?.('a');
    PT.check('talent sources (talent:<id>)', g.stats.has('talent:mage.t1') && g.stats.has('talent:mage.t10') && g.stats.has('talent:mage.t25a') && g.stats.get('chargeSpeedMul') > 1.2);
    PT.check('breadth source (3 trees ≥ 5 → awakened)', g.stats.has('breadth') && P.breadth().awakened && Math.abs(g.stats.get('rxAll') - (1 + P.breadth().bonus)) < 1e-6);
    // implementation resolution: bespoke impl → legacy → family archetype → caster archetype → generic
    {
      let got = null;
      const fnA = (ctx) => { got = ctx; };
      g.archetypes.registerArchetype('lob', 'caster', fnA);
      S.applyPreset('endgame_mage'); S.resetCooldowns(); PT.resetCounts();
      S.cast('fire.ember', { free: true });
      const h = got && got.hit({ amount: 5 });
      PT.check('registered caster archetype is used with a full ctx', S.lastPath === 'archetype' && got && got.skillId === 'fire.ember' && got.element === 'fire' &&
        got.params.range === 20 && got.family === 'caster' && got.origin?.isVector3 && got.aim && typeof got.after === 'function' && h.skillId === 'fire.ember' && h.slot === 'quick' && h.source && h.element === 'fire', S.lastPath);
      PT.check('archetype path: skills emits spellCast once (kind skill)', PT.countEvents('spellCast') === 1 && PT.countEvents('skillCast') === 1);
      let gotImpl = false; g.archetypes.registerImpl('fire.ember', 'caster', () => { gotImpl = true; });
      S.resetCooldowns(); S.cast('fire.ember', { free: true });
      PT.check('bespoke impl wins over the archetype', gotImpl && S.lastPath === 'impl');
    }
    // tooltip (P1)
    const tt = S.tooltip('fire.p1', { rank: 1 });
    PT.check('tooltip current → next', tt && /→/.test(tt.text) && /화상/.test(tt.text), tt?.text);
  });

  await pg.run('signature: mage 원소 연쇄', () => {
    const g = game, S = g.skills;
    S.applyPreset('endgame_mage'); S.resetCooldowns(); PT.dummyRing(3, 4);
    S.kits.consumeChain(); PT.step(4); PT.heal();
    S.cast('fire.cyclone'); PT.step(0.3); S.cast('ice.nova'); PT.step(0.3); S.cast('lightning.mine'); PT.step(0.3); S.cast('fire.ember');
    const h = S.getHudState();
    PT.check('3 different elements within 3 s → 3 연쇄 stacks', h.signature.value === 3, h.signature.value);
    const mp = g.player.mp;
    S.cast('ice.pillar');
    PT.check('3 stacks: next skill free, stacks reset', g.player.mp === mp && S.getHudState().signature.value === 0, { mp, now: g.player.mp });
  });

  // ------------------------------------------------------------ v3 keymap input; F never casts
  await pg.run('input v3', () => {
    const g = game, S = g.skills, I = g.input;
    S.applyPreset('endgame_mage'); S.resetCooldowns(); PT.resetCounts(); PT.heal();
    PT._fails = []; g.events.on('skillFail', (p) => PT._fails.push(p.id + ':' + p.reason));
    I.simulate({ keys: { KeyF: true } }); PT.step(0.05); I.simulate(null); PT.step(0.05);
    PT.check('F casts nothing (skills never reads F)', PT.countEvents('skillCast') === 0);
    PT.heal(); S.resetCooldowns();   // (a v2 spells module may still treat F as its ultimate until magic lands)
    I.simulate({ keys: { KeyX: true } }); PT.step(0.05); I.simulate(null); PT.step(0.05);
    PT.check('X casts the ultimate (once)', PT.countEvents('skillCast') === 1 && S.lastCast.id === 'fire.awakened', { n: PT.countEvents('skillCast'), id: S.lastCast.id, fails: PT._fails, mp: g.player.mp, slot: S.skillForSlot('ult'), st: g.state, lock: I.gameLocked });
    PT.resetCounts();
    I.simulate({ keys: { Digit1: true } }); PT.step(0.05); I.simulate(null); PT.step(0.05);
    PT.check('1 casts q1', PT.countEvents('skillCast') === 1 && S.lastCast.id === S.loadout.q1);
    const was = S.attuned;
    I.simulate({ keys: { KeyZ: true } }); PT.step(0.05); I.simulate(null); PT.step(0.05);
    PT.check('Z cycles the attuned element', S.attuned !== was);
    S.resetCooldowns(); PT.resetCounts(); PT.heal();
    I.simulate({ mouse: { 2: true } }); PT.step(0.8); I.simulate(null); PT.step(0.05);
    PT.check('RMB hold/release casts the charged skill', PT.countEvents('skillCast') === 1 && /\.charged$/.test(S.lastCast.id || ''), S.lastCast.id);
  });
  PT.check('mage page: no console errors', pg.errors().length === 0, pg.errors().slice(0, 6));
  await pg.close();

  // ------------------------------------------------------------ legacy keymap: skills reads nothing
  {
    const lg = await PT.boot('&cls=mage&path=all');
    if (lg.ready) {
      await lg.run('legacy keymap', () => {
        const g = game, S = g.skills, I = g.input;
        PT.check('ownsInput false in legacy mode', S.ownsInput === false && g.keymapMode === 'legacy');
        PT.check('legacy_all preset applied (5 classic trees to T3)', g.progression.isLearned('earth.ult') && !g.progression.isLearned('earth.cap'));
        PT.resetCounts();
        for (const k of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyX', 'KeyG', 'KeyR', 'KeyZ', 'KeyV']) { I.simulate({ keys: { [k]: true } }); PT.step(0.05); I.simulate(null); PT.step(0.05); }
        I.simulate({ mouse: { 0: true } }); PT.step(0.2); I.simulate(null); PT.step(0.05);
        PT.check('skills reads no keys in the legacy keymap (no skillCast)', PT.countEvents('skillCast') === 0, PT.countEvents('skillCast'));
      });
      PT.check('legacy page: no console errors', lg.errors().length === 0, lg.errors().slice(0, 6));
    } else PT.check('legacy boot', false);
    await lg.close();
  }

  // ------------------------------------------------------------ check 5: every endgame + showcase skill casts, per class
  for (const cls of CLASSES) {
    const cp = await PT.boot(`&cls=${cls}`);
    if (!cp.ready) { PT.check(`check 5 ${cls}: boot`, false); await cp.close(); continue; }
    const res = await cp.run(`check 5 ${cls}`, (c) => {
      const g = game, S = g.skills, P = g.progression;
      const ring = PT.dummyRing(6, 4.5);
      const pp = g.player.object.position;
      const fails = [], evBad = [], paths = {};
      let n = 0;
      const aimAt = (d) => {
        const o = pp.clone(); o.y += 1.5;
        const t = d.object.position.clone(); t.y += 1;
        return { origin: o, dir: t.clone().sub(o).normalize(), point: d.object.position.clone(), target: d };
      };
      let dmg = 0, other = 0;
      const offD = g.events.on('damage', (p) => { if (p?.target && p.target.team !== 'player' && (p.source === 'player' || p.source?.team === 'player') && p.amount > 0) dmg++; });
      const offs = ['heal', 'objectSpawn', 'familiarSpawn', 'zoneSpawn', 'summonSpawn', 'statusApplied'].map((e) => g.events.on(e, () => { other++; }));
      const tryList = (ids, label) => {
        const fin = ids.filter((id) => S.defs.get(id)?.slot === 'finisher');
        const order = ids.filter((id) => !fin.includes(id)).concat(fin);
        for (const id of order) {
          const def = S.defs.get(id); if (!def) { fails.push(id + ' no def'); continue; }
          PT.heal(); g.player.hp = Math.max(1, g.player.maxHp * 0.5); if (g.player.entity) g.player.entity.hp = g.player.hp;
          for (const d of ring) { d.hp = d.maxHp = 1e6; d.alive = true; if (d.statuses) for (const k in d.statuses) delete d.statuses[k]; }
          S.resetCooldowns();
          const zones0 = g.spells?.zones?.length || g.spells?.api?.zones?.list?.length || 0;
          PT.resetCounts('skillCast'); PT.resetCounts('spellCast'); PT.resetCounts('elementChanged');
          dmg = 0; other = 0;
          let ok = false;
          try { ok = S.cast(id, { free: true, aim: aimAt(ring[0]), charge: 1 }); } catch (err) { fails.push(id + ' threw ' + err.message); continue; }
          if (!ok) { fails.push(id + ' returned false'); continue; }
          n++;
          paths[S.lastPath] = (paths[S.lastPath] || 0) + 1;
          const sc = PT.countEvents('skillCast'), spc = PT.countEvents('spellCast'), ec = PT.countEvents('elementChanged');
          if (sc !== 1 || spc !== 1 || ec > 1) evBad.push(`${id} skillCast=${sc} spellCast=${spc} elementChanged=${ec}`);
          const effect = () => dmg > 0 || other > 0 || g.stats.has('buff:' + id) || (g.player.hp > g.player.maxHp * 0.5 + 0.01) ||
            (g.spells?.zones?.length || g.spells?.api?.zones?.list?.length || 0) > zones0;
          let t = 0;
          while (!effect() && t < 3) { PT.step(0.25); t += 0.25; }
          if (!effect()) fails.push(id + ' no effect (' + S.lastPath + ')');
          // finisher cinematics: wait until play resumes
          let w = 0; while (g.state !== 'playing' && w < 20) { PT.step(0.5); w += 0.5; }
          if (g.state !== 'playing') { fails.push(id + ' left state ' + g.state); g.setState('playing'); }
          PT.step(0.1);
        }
      };
      S.applyPreset('endgame_' + c);
      tryList(P.learnedSkills(), 'endgame');
      for (const el of g.elements.list) {
        if (!g.classes.access(c, el)) continue;
        S.applyPreset('showcase_' + el);
        tryList(Object.keys(S.trees[el].skills), 'showcase ' + el);
      }
      offD(); offs.forEach((f) => f && f());
      PT.check('every endgame/showcase skill casts with an effect', fails.length === 0, fails.slice(0, 12));
      PT.check('exactly one skillCast + one spellCast, ≤ 1 elementChanged per cast', evBad.length === 0, evBad.slice(0, 8));
      return { n, paths };
    }, cls);
    if (res) PT.note(`${cls}: ${res.n} casts, paths ${JSON.stringify(res.paths)}`);
    const errs = cp.errors();
    PT.check(`check 5 ${cls}: no console errors`, errs.length === 0, errs.slice(0, 6));
    const dup = cp.warnings().filter((w) => /no implementation for archetype/.test(w));
    PT.check(`check 5 ${cls}: missing archetypes logged once each`, new Set(dup).size === dup.length, dup.length);
    await cp.close();
  }

  // ------------------------------------------------------------ works with spells and sword stubbed
  for (const cls of ['mage', 'paladin']) {
    const sp = await PT.boot(`&cls=${cls}&stub=spells,sword`);
    if (!sp.ready) { PT.check(`stubbed spells/sword ${cls}: boot`, false); await sp.close(); continue; }
    await sp.run(`stubbed spells/sword (${cls})`, (c) => {
      const g = game, S = g.skills;
      PT.check('spells and sword are stubs', g.stubbed.includes('spells') && g.stubbed.includes('sword'));
      S.applyPreset('endgame_' + c);
      const ring = PT.dummyRing(6, 4.5);
      let dmg = 0; const off = g.events.on('damage', (p) => { if (p?.target?.team !== 'player') dmg++; });
      PT.resetCounts();
      let ok = 0, n = 0;
      for (const id of g.progression.learnedSkills()) {
        if (S.defs.get(id)?.slot === 'finisher') continue;
        n++; S.resetCooldowns();
        try { if (S.cast(id, { free: true, aim: { origin: g.player.object.position.clone().setY(1.5), dir: new g.THREE.Vector3(0, 0, 1), point: ring[0].object.position.clone(), target: ring[0] } })) ok++; } catch (err) { PT.check(id + ' no throw', false, err.message); }
        PT.step(0.2);
      }
      off();
      PT.check('every skill casts (generic fallback)', ok === n && n > 10, { ok, n });
      PT.check('casts deal damage', dmg > 0);
      PT.check('one skillCast + one spellCast per cast', PT.countEvents('skillCast') === n && PT.countEvents('spellCast') === n, { sc: PT.countEvents('skillCast'), sp: PT.countEvents('spellCast'), n });
      // the hotbar still renders
      const h = S.getHudState();
      PT.check('HUD v3 with stubs', h.v === 3 && h.slots.length === 9);
    }, cls);
    PT.check(`stubbed ${cls}: no console errors`, sp.errors().length === 0, sp.errors().slice(0, 6));
    await sp.close();
  }

  // ------------------------------------------------------------ spiritcaller familiars (instanced, 1 draw call)
  {
    const fp = await PT.boot('&cls=spiritcaller&skills=preset:endgame_spiritcaller');
    if (fp.ready) {
      await fp.run('familiars', () => {
        const g = game, S = g.skills;
        PT.step(0.2);
        const F = S.familiars;
        PT.check('2 familiars for the 2 most-invested trees (≥ 3 points)', F && F.count === 2, F && F.elements());
        PT.check('familiar mesh is a single InstancedMesh with instance colours', F.mesh.isInstancedMesh && !!F.mesh.instanceColor && F.mesh.parent === g.scene);
        const ring = PT.dummyRing(2, 6);
        let hits = 0; const off = g.events.on('damage', (p) => { if (ring.includes(p?.target)) hits++; });
        PT.step(3.5);
        off();
        PT.check('familiars shoot the nearest enemy', hits >= 2, hits);
        PT.check('HUD signature familiars', S.getHudState().signature.kind === 'familiars' && S.getHudState().signature.value === 2);
        g.progression.setRanks({}, { ignoreBudget: true, ignoreGates: true });
        PT.step(0.1);
        PT.check('respec despawns familiars', F.count === 0);
      });
      PT.check('familiars page: no console errors', fp.errors().length === 0, fp.errors().slice(0, 6));
    }
    await fp.close();
  }
};
