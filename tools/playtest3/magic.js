// playtest3 section: magic (CONTRACT §11, §7.3 caster half, §21 check 5 for the caster classes). Owned by magic.
// Run: node tools/playtest3.js magic
const fs = require('fs'); const path = require('path');

const CASTERS = ['mage', 'ranger', 'spiritcaller'];
const REQUIRED_IMPLS = ['water.ult', 'water.awakened', 'nature.ult', 'nature.awakened', 'light.ult', 'light.awakened', 'shadow.ult', 'shadow.awakened',
  'nature.treant', 'water.finisher', 'nature.finisher', 'light.finisher', 'shadow.finisher'];

module.exports = async function magic(PT) {
  // ------------------------------------------------------------ static: no class literals in magic files (rule 8)
  {
    const root = PT.root;
    const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);   // v4: src/spells/motifs/
    const files = ['src/spells.js', ...walk('src/spells')];
    const bad = [];
    for (const f of files) {
      const txt = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
      txt.forEach((l, i) => { if (/=== ?'(sword|mage)'|!== ?'(sword|mage)'/.test(l)) bad.push(`${f}:${i + 1}`); });
    }
    PT.check('no class literals in src/spells*', bad.length === 0, bad);
  }

  // ------------------------------------------------------------ v3 API, registration, zones, objects, buffs, prism
  const pg = await PT.boot('&cls=mage');
  if (!pg.ready) { PT.check('magic boot', false); await pg.close(); return; }
  await pg.run('api', (req) => {
    const g = game, Sp = g.spells, A = g.archetypes;
    PT.check('spells is the v3 module (castById, api)', typeof Sp.castById === 'function' && !!Sp.api);
    const list = A.list();
    const caster = list.archetypes.filter((a) => a.caster).map((a) => a.name);
    PT.check('24 caster archetypes registered (in the factory)', caster.length >= 24 && Sp.registered.archetypes === 24, caster.length);
    const missing = req.filter((id) => !A.getImpl(id, 'caster'));
    PT.check('bespoke caster impls registered', missing.length === 0, missing);
    PT.check('STATUS_OF covers 9 elements', g.elements.list.every((el) => el in Sp.api.STATUS_OF) && Sp.api.STATUS_OF.water === 'wet' && Sp.api.STATUS_OF.shadow === 'corroded');
    PT.check('isActive() false in the v3 keymap', Sp.isActive() === false && g.skills.ownsInput === true);
    PT.check('v3 elements list = 9', Sp.elements.length === 9);
    // silent setter emits nothing; castById emits spellCast once
    PT.resetCounts();
    Sp.setElement(Sp.elements.indexOf('water'), { silent: true });
    PT.check('setElement(i,{silent}) emits nothing', PT.countEvents('elementChanged') === 0 && Sp.element === 'water');
    const ring = PT.dummyRing(4, 5);
    const pp = g.player.object.position;
    const aim = { origin: pp.clone().setY(pp.y + 1.5), dir: ring[0].object.position.clone().sub(pp).setY(0).normalize(), point: ring[0].object.position.clone(), target: ring[0] };
    PT.resetCounts();
    const ok = Sp.castById('fire_basic', { aim, free: true });
    PT.check('castById(fire_basic) emits spellCast once', ok && PT.countEvents('spellCast') === 1, PT.countEvents('spellCast'));
    PT.check('castById of a new-element id is refused (no SPELLS[water_basic])', Sp.castById('water_basic', { free: true }) === false);
    PT.resetCounts();
    Sp.castById('ice_support', { free: true });
    PT.check('legacy support buff is a stats source (no player.mods writes)', g.stats.has('buff:ice.sup') && PT.countEvents('spellCast') === 1);
    PT.step(13);
    PT.check('legacy support buff expires', !g.stats.has('buff:ice.sup') && g.stats.get('dmgTakenMul') === 1, g.stats.get('dmgTakenMul'));
    // v3 input: LMB in v3 mode must not make spells cast on its own
    PT.resetCounts();
    const I = g.input;
    if (I?.simulate) {
      g.skills.applyPreset?.('starter_mage');
      I.simulate({ mouse: { 0: true } }); PT.step(0.3); I.simulate(null); PT.step(0.1);
      PT.check('v3: one LMB press → spellCast count equals skillCast (spells reads no input)', PT.countEvents('spellCast') === PT.countEvents('skillCast'), { sp: PT.countEvents('spellCast'), sk: PT.countEvents('skillCast') });
      I.simulate({ keys: { KeyF: true } }); PT.step(0.05); I.simulate(null); PT.step(0.1);
      PT.check('v3: F casts nothing', PT.countEvents('spellCast') === PT.countEvents('skillCast'));
    } else PT.skip('v3 input gating', 'input.simulate missing');

    // zones: every type spawns and expires
    const Z = Sp.api.zones;
    const at = pp.clone(); at.x += 3;
    const bad = [];
    for (const d of ring) { d.alive = false; try { g.combat.unregister?.(d); } catch (_) { /* */ } }
    for (const type of Z.TYPES) {
      Z.v2.clear(); Z.v3.clear();
      const before = Z.list.length;
      let z = null;
      try { z = Z.spawn(type, at, { r: 3, radius: 3, dur: 1.2, duration: 1.2, dir: new g.THREE.Vector3(1, 0, 0), len: 6, width: 2 }); } catch (err) { bad.push(type + ' threw ' + err.message); continue; }
      if (!z) { bad.push(type + ' null'); continue; }
      if (!(Z.list.length > before) && !z.merged) bad.push(type + ' not listed');
      PT.step(1.6);
      if (Z.list.includes(z)) bad.push(type + ' did not expire');
    }
    PT.check(`every zone type spawns and expires (${Z.TYPES.length})`, bad.length === 0, bad);
    PT.check('isInside(holy)', (() => { const z = Z.spawn('holy', pp.clone(), { r: 4, dur: 2 }); const r = Z.isInside('holy', pp); PT.step(2.5); return !!z && r && !Z.isInside('holy', pp); })());

    // objects: every kind spawns and expires (pool caps hold)
    const O = Sp.api.objects;
    const obad = [];
    for (const kind of O.KINDS) {
      const o = O.spawn(kind, at, { life: 0.8, element: 'light' });
      if (!o || !o.alive) { obad.push(kind + ' spawn'); continue; }
      if (!O.meshes[kind].isInstancedMesh || !O.meshes[kind].instanceColor) obad.push(kind + ' not instanced/coloured');
      PT.step(1.2);
      if (o.alive) obad.push(kind + ' did not expire');
    }
    PT.check('every object kind spawns, is instanced with instance colours, and expires', obad.length === 0, obad);
    let over = 0; for (let i = 0; i < 30; i++) O.spawn('pod', at.clone().setX(at.x + (i % 6)), { life: 30 });
    over = O.count('pod');
    PT.check('pod pool cap ≤ 16', over <= 16 && over > 0, over);
    O.despawnAll();
    // pod + fire → combat reaction (burgeon) through reactObject
    PT.resetCounts('reaction');
    const pod = O.spawn('pod', at.clone(), { life: 20 });
    Sp.api.aoe(at.clone().setY(pod.position.y + 0.5), 2, { amount: 10, element: 'fire', source: g.player.entity, tier: 'light' });
    PT.step(0.4);
    PT.check('fire on a seed pod reacts via combat.reactObject (pod consumed)', !pod.alive && PT.countEvents('reaction') >= 1, { alive: pod.alive, rx: PT.countEvents('reaction') });

    // prism beam: a crystal relay refracts (≥ 2 segments)
    const cr = O.spawn('crystal', pp.clone().add(new g.THREE.Vector3(0, 0, 6)), { element: 'light', life: 10 });
    const h = Sp.api.beam({ origin: pp.clone().setY(cr.position.y), dir: new g.THREE.Vector3(0, 0, 1), len: 26, width: 1.2, dur: 0.5, tick: 0.1, hitSpec: { amount: 1, element: 'light', tier: 'light' }, prism: true });
    PT.step(0.05);
    const segs = h.beam.segs.filter((s) => s.on).length;
    PT.check('prism beam refracts at a crystal (2–3 segments)', segs >= 2 && segs <= 3, segs);
    PT.step(0.6);
    O.despawnAll();
    return true;
  }, REQUIRED_IMPLS);
  PT.check('api page: no console errors', pg.errors().length === 0, pg.errors().slice(0, 6));
  await pg.close();

  // ------------------------------------------------------------ CONTRACT §21 check 5 (caster classes)
  for (const cls of CASTERS) {
    const cp = await PT.boot(`&cls=${cls}`);
    if (!cp.ready) { PT.check(`check 5 ${cls}: boot`, false); await cp.close(); continue; }
    const res = await cp.run(`check 5 ${cls}`, (c) => {
      const g = game, S = g.skills, P = g.progression;
      const ring = PT.dummyRing(6, 4.5);
      const pp = g.player.object.position;
      const home = pp.clone();
      const fails = [], evBad = [], paths = {};
      let n = 0;
      const aimAt = (d) => { const o = pp.clone(); o.y += 1.5; const t = d.object.position.clone(); t.y += 1; return { origin: o, dir: t.clone().sub(o).normalize(), point: d.object.position.clone(), target: d }; };
      let dmg = 0, other = 0;
      const offD = g.events.on('damage', (p) => { if (p?.target && p.target.team !== 'player' && (p.source === 'player' || p.source?.team === 'player') && p.amount > 0) dmg++; });
      const offs = ['heal', 'objectSpawn', 'familiarSpawn', 'zoneSpawn', 'summonSpawn', 'statusApplied', 'buffStart'].map((e) => g.events.on(e, () => { other++; }));
      const progs0 = g.renderer.info.programs?.length || 0;
      const tryList = (ids) => {
        const fin = ids.filter((id) => S.defs.get(id)?.slot === 'finisher');
        const order = ids.filter((id) => !fin.includes(id)).concat(fin);
        for (const id of order) {
          const def = S.defs.get(id); if (!def) { fails.push(id + ' no def'); continue; }
          PT.heal(); g.player.hp = Math.max(1, g.player.maxHp * 0.5); if (g.player.entity) g.player.entity.hp = g.player.hp;
          for (const d of ring) { d.hp = d.maxHp = 1e6; d.alive = true; if (d.statuses) for (const k in d.statuses) delete d.statuses[k]; }
          S.resetCooldowns();
          const zones0 = g.spells.api.zones.list.length;
          PT.resetCounts('skillCast'); PT.resetCounts('spellCast'); PT.resetCounts('elementChanged');
          dmg = 0; other = 0;
          let ok = false;
          try { ok = S.cast(id, { free: true, aim: aimAt(ring[0]), charge: 1 }); } catch (err) { fails.push(id + ' threw ' + err.message); continue; }
          if (!ok) { fails.push(id + ' returned false'); continue; }
          n++;
          paths[S.lastPath] = (paths[S.lastPath] || 0) + 1;
          const sc = PT.countEvents('skillCast'), spc = PT.countEvents('spellCast'), ec = PT.countEvents('elementChanged');
          if (sc !== 1 || spc !== 1 || ec > 1) evBad.push(`${id} skillCast=${sc} spellCast=${spc} elementChanged=${ec}`);
          const effect = () => dmg > 0 || other > 0 || g.stats.has('buff:' + id) || (g.player.hp > g.player.maxHp * 0.5 + 0.01) || g.spells.api.zones.list.length > zones0;
          let t = 0;
          while (!effect() && t < 3) { PT.step(0.25); t += 0.25; }
          if (!effect()) fails.push(id + ' no effect (' + S.lastPath + ')');
          let w = 0; while (g.state !== 'playing' && w < 20) { PT.step(0.5); w += 0.5; }
          if (g.state !== 'playing') { fails.push(id + ' left state ' + g.state); g.setState('playing'); }
          PT.step(0.1);
          if (pp.distanceTo(home) > 1.5) PT.tp(home.x, home.z);
        }
      };
      S.applyPreset('endgame_' + c);
      tryList(P.learnedSkills());
      for (const el of g.elements.list) {
        if (!g.classes.access(c, el)) continue;
        S.applyPreset('showcase_' + el);
        tryList(Object.keys(S.trees[el].skills));
      }
      offD(); offs.forEach((f) => f && f());
      PT.step(4);
      const progs1 = g.renderer.info.programs?.length || 0;
      PT.check('every endgame/showcase skill casts with an effect', fails.length === 0, fails.slice(0, 12));
      PT.check('exactly one skillCast + one spellCast, ≤ 1 elementChanged per cast', evBad.length === 0, evBad.slice(0, 8));
      PT.check('no generic fallback used (caster archetypes / impls / legacy only)', !paths.generic, paths);
      PT.note(`programs before/after the cast sweep: ${progs0} → ${progs1}`);
      return { n, paths, progs0, progs1 };
    }, cls);
    if (res) PT.note(`${cls}: ${res.n} casts, paths ${JSON.stringify(res.paths)}`);
    const errs = cp.errors();
    PT.check(`check 5 ${cls}: no console errors`, errs.length === 0, errs.slice(0, 6));
    const warn = cp.warnings().filter((w) => /\[spells/.test(w));
    PT.check(`check 5 ${cls}: no spells warnings`, warn.length === 0, warn.slice(0, 6));
    await cp.close();
  }

  // ------------------------------------------------------------ legacy keymap: spells reads its own input, 5 elements
  {
    const lg = await PT.boot('&path=master&el=ice');
    if (lg.ready) {
      await lg.run('legacy', () => {
        const g = game, Sp = g.spells;
        PT.check('legacy keymap: 5 classic elements, spells active', Sp.elements.length === 5 && Sp.isActive() === true, { n: Sp.elements.length, act: Sp.isActive() });
        const ring = PT.dummyRing(3, 5);
        let dmg = 0; const off = g.events.on('damage', (p) => { if (ring.includes(p?.target)) dmg++; });
        PT.resetCounts();
        const I = g.input;
        const aim = { origin: g.player.object.position.clone().setY(g.player.object.position.y + 1.5), dir: ring[0].object.position.clone().sub(g.player.object.position).setY(0).normalize(), point: ring[0].object.position.clone(), target: ring[0] };
        Sp.cast('fire', 'basic', { aim, free: true });
        if (I?.simulate) { I.simulate({ keys: { Digit2: true } }); PT.step(0.05); I.simulate(null); }
        PT.step(1);
        off();
        PT.check('legacy cast hits', dmg > 0);
        PT.check('legacy Digit2 selects ice', !I?.simulate || Sp.element === 'ice', Sp.element);
        PT.check('legacy HUD v2 shape', Array.isArray(Sp.getHudState().slots) && Sp.getHudState().elements.length === 5);
      });
      PT.check('legacy page: no console errors', lg.errors().length === 0, lg.errors().slice(0, 6));
    } else PT.check('legacy boot', false);
    await lg.close();
  }
};
