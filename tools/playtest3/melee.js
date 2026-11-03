// playtest3 section: melee (CONTRACT §12, §7.3 melee half, §21 checks 4 + 5 for sword / paladin / shadowblade). Owned by melee.
// Runs with the other modules present or stubbed: melee archetypes fall back to self-contained forms when magic is missing.
const fs = require('fs'); const path = require('path');

const MELEE = ['sword', 'paladin', 'shadowblade'];
const NEW_EL = ['water', 'nature', 'light', 'shadow'];

module.exports = async function melee(PT) {
  // ------------------------------------------------------------ static: rules 7 / 8 / 9, no direct hitstop, no F, no player.mods writes
  {
    const files = ['src/sword.js', ...fs.readdirSync(path.join(PT.root, 'src/sword')).filter((f) => f.endsWith('.js')).map((f) => 'src/sword/' + f)];
    const bad = [];
    for (const rel of files) {
      const f = path.join(PT.root, rel);
      fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        const at = `${rel}:${i + 1}`;
        if (/=== ?'(sword|mage)'|!== ?'(sword|mage)'/.test(l)) bad.push(at + ' class literal');
        if (/for \(let \w+ = 0; \w+ < 5;/.test(l)) bad.push(at + ' i<5');
        if (/game\.hitstop\s*\?*\.?\(/.test(l)) bad.push(at + ' game.hitstop');
        if (/hasPrompt/.test(l)) bad.push(at + ' story.hasPrompt');
        if (/(\bpl|player|P\(\))\.mods\.\w+\s*=/.test(l) || /Object\.assign\(m, def\.mods\)/.test(l) || /const m = P\(\)\.mods/.test(l)) bad.push(at + ' player.mods write');
        if (/pl\.mods\?\.atkMul \|\| 1\) \*/.test(l)) bad.push(at + ' atkMul multiply');
        const m = /^\s*import .* from '([^']+)'/.exec(l);
        if (m) {
          const spec = m[1];
          const abs = spec.startsWith('.') ? path.relative(PT.root, path.resolve(path.dirname(f), spec)).replace(/\\/g, '/') : spec;
          if (!(spec === 'three' || spec.startsWith('three/') || abs === 'src/sword.js' || abs.startsWith('src/sword/') || abs.startsWith('src/core/'))) bad.push(at + ' cross-owner import ' + spec);
        }
      });
    }
    PT.check('rules 7/8/9: no class literals, no i<5, no game.hitstop, no hasPrompt, no player.mods writes, no cross-owner imports', bad.length === 0, bad);
  }

  for (const cls of MELEE) {
    const pg = await PT.boot(`&cls=${cls}`);
    PT.check(`${cls}: boot`, pg.ready);
    if (!pg.ready) { await pg.close(); continue; }

    // ---------------------------------------------------------- registry + weapon profile + API shape
    await pg.run(`${cls} api`, (c) => {
      const g = game, M = g.sword?.api;
      PT.check('sword is the real module with the v3 api', !!M && !g.stubbed.includes('sword') && typeof M.playLegacy === 'function' && typeof M.startAction === 'function' && typeof M.weapon === 'function');
      const list = g.archetypes.list();
      const missing = g.archetypes.NAMES.filter((n) => !list.archetypes.find((a) => a.name === n && a.melee));
      PT.check('all 24 archetypes have a melee implementation', missing.length === 0, missing);
      const impls = ['water.ult', 'nature.ult', 'light.ult', 'shadow.ult', 'water.awakened', 'nature.awakened', 'light.awakened', 'shadow.awakened'];
      PT.check('bespoke melee impls for the 4 new ultimates (+ awakened)', impls.every((id) => !!g.archetypes.getImpl(id, 'melee')));
      const w = M.weapon();
      const want = { sword: ['longsword', 1, 1], paladin: ['hammer', 1.2, 0.85], shadowblade: ['daggers', 0.85, 1.25] }[c];
      PT.check(`weapon profile ${want[0]} (reach ×${want[1]}, speed ×${want[2]})`, w.id === want[0] && Math.abs(w.reachMul - want[1]) < 1e-6 && Math.abs(w.speedMul - want[2]) < 1e-6 && Array.isArray(w.tips) && !!w.smear && w.hitstopMul > 0, w);
      const tplOk = ['hammerSlam', 'shieldBash', 'daggerFlurry', 'daggerCross', 'backstab', 'reverseSlash'].every((k) => M.TPL[k]?.frames?.length);
      PT.check('TPL includes hammerSlam, shieldBash, daggerFlurry, daggerCross, backstab, reverseSlash', tplOk);
      PT.check('sword reads no skill input in v3 (skills owns it)', g.skills?.ownsInput === true);
    }, cls);

    // ---------------------------------------------------------- combo / charged / new-element basics hit a dummy; every hit has tier + hitstopMul
    await pg.run(`${cls} movesets`, (c) => {
      const g = game, S = g.skills, M = g.sword.api;
      const pp = g.player.object.position;
      const W = g.world;
      const y = W.getGroundHeight ? W.getGroundHeight(pp.x, pp.z + 2.2) : W.getHeight(pp.x, pp.z + 2.2);
      const d = g.debug.spawnDummy(new g.THREE.Vector3(pp.x, y, pp.z + 2.2), { hp: 1e6 });
      d.hp = d.maxHp = 1e6; d.xpValue = 0;
      g.player.setFacing(0); g.player.setLook?.(Math.PI, -0.1);
      PT.step(0.2);
      const hits = [];
      const orig = g.combat.dealDamage;
      g.combat.dealDamage = function (t, hit) { if (hit?.tags?.includes('melee')) hits.push({ tier: hit.tier, hsm: hit.hitstopMul, skillId: hit.skillId, el: hit.element, t: t === d }); return orig.call(this, t, hit); };
      const out = {};
      const len = { sword: 4, paladin: 3, shadowblade: 6 }[c];
      const run = (label, fn, secs = 3) => {
        hits.length = 0; PT.resetCounts('spellCast');
        for (const k of Object.keys(d.statuses || {})) delete d.statuses[k];
        const ok = fn();
        PT.step(secs);
        const onDummy = hits.filter((h) => h.t).length;
        out[label] = { ok, hits: onDummy, spellCast: PT.countEvents('spellCast') };
        return onDummy;
      };
      // combo: one press per step via the v3 skills path (LMB basic of the attuned element), each press 0.5 s apart
      const el0 = S.attuned;
      run('combo', () => {
        let ok = true;
        for (let i = 0; i < len; i++) { S.resetCooldowns(); ok = S.cast(el0 + '.basic', { free: true }) && ok; PT.step(c === 'paladin' ? 0.8 : 0.5); }
        return ok;
      }, 1);
      PT.check(`combo (${len} hits) hits the dummy`, out.combo.ok && out.combo.hits >= len, out.combo);
      PT.check('one spellCast per combo press', out.combo.spellCast === len, out.combo.spellCast);
      run('charged', () => { S.resetCooldowns(); return S.cast(el0 + '.charged', { free: true, charge: 1 }); }, 2);
      PT.check('charged hits the dummy', out.charged.ok && out.charged.hits > 0, out.charged);
      for (const el of ['water', 'nature', 'light', 'shadow']) {
        PT.tp(pp.x, pp.z); g.player.setFacing(0); d.object.position.set(pp.x, d.object.position.y, pp.z + 2.2);
        run(el, () => {
          let ok = true;
          for (let i = 0; i < len; i++) { S.resetCooldowns(); ok = S.cast(el + '.basic', { free: true }) && ok; PT.step(c === 'paladin' ? 0.8 : 0.5); }
          return ok;
        }, 1);
        PT.check(`${el} basic combo hits the dummy (element ${el})`, out[el].ok && out[el].hits >= len && hits.some((h) => h.el === el), out[el]);
        run(el + '.charged', () => { S.resetCooldowns(); return S.cast(el + '.charged', { free: true, charge: 1 }); }, 2);
        PT.check(`${el} charged hits the dummy`, out[el + '.charged'].ok && out[el + '.charged'].hits > 0, out[el + '.charged']);
      }
      // per-weapon 반격 flurry variant (P1)
      PT.tp(pp.x, pp.z); g.player.setFacing(0); d.object.position.set(pp.x, d.object.position.y, pp.z + 2.2);
      run('counter', () => g.sword.debugUse('counter'), 2);
      PT.check(`weapon counter flurry hits the dummy (${{ sword: 6, paladin: 3, shadowblade: 8 }[c]}+ hits)`, out.counter.hits >= { sword: 6, paladin: 3, shadowblade: 8 }[c], out.counter);
      g.combat.dealDamage = orig;
      // every melee hit carried a tier and the weapon hitstop multiplier
      PT.resetCounts();
      hits.length = 0;
      g.combat.dealDamage = function (t, hit) { if (hit?.tags?.includes('melee')) hits.push({ tier: hit.tier, hsm: hit.hitstopMul, skillId: hit.skillId }); return orig.call(this, t, hit); };
      S.resetCooldowns(); S.cast(el0 + '.basic', { free: true }); PT.step(0.6);
      g.combat.dealDamage = orig;
      const w = M.weapon();
      PT.check('melee hits set hit.tier, hit.hitstopMul (weapon) and the skill id', hits.length > 0 && hits.every((h) => ['light', 'heavy', 'crit', 'ult'].includes(h.tier) && h.hsm === w.hitstopMul && h.skillId === el0 + '.basic'), hits.slice(0, 4));
      return out;
    }, cls);

    // ---------------------------------------------------------- setters / single emission / class moveset routing
    await pg.run(`${cls} events`, () => {
      const g = game, M = g.sword.api;
      PT.resetCounts();
      M.setElement('water', { silent: true }); M.setElement('fire', { silent: true });
      PT.check('setElement(el, {silent:true}) emits nothing', PT.countEvents('elementChanged') === 0 && PT.countEvents('attuneChanged') === 0);
      PT.resetCounts();
      const ok = M.playLegacy('light', 'heavy', { free: true, charge: 1, skillId: 'light.charged' });
      PT.check('playLegacy returns true and emits spellCast exactly once', ok && PT.countEvents('spellCast') === 1, { ok, n: PT.countEvents('spellCast') });
      PT.step(1.5);
      PT.check('no hard-coded 5-element maps: palette/status for every element', g.elements.list.every((el) => !!M.S.palOf(el)?.a));
    });

    // ---------------------------------------------------------- CONTRACT §21 check 5 (melee classes): endgame + showcase casts
    const res = await pg.run(`check 5 ${cls}`, (c) => {
      const g = game, S = g.skills, P = g.progression;
      PT.tp(g.player.object.position.x + 30, g.player.object.position.z);
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
      const tryList = (ids) => {
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
          let w = 0; while (g.state !== 'playing' && w < 20) { PT.step(0.5); w += 0.5; }
          if (g.state !== 'playing') { fails.push(id + ' left state ' + g.state); g.setState('playing'); }
          PT.step(0.6);
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
      PT.check('every endgame/showcase skill casts with an effect', fails.length === 0, fails.slice(0, 12));
      PT.check('exactly one skillCast + one spellCast, ≤ 1 elementChanged per cast', evBad.length === 0, evBad.slice(0, 8));
      const generic = paths.generic || 0;
      PT.check('no melee skill falls through to the generic fallback', generic === 0, paths);
      return { n, paths };
    }, cls);
    if (res) PT.note(`${cls}: ${res.n} casts, paths ${JSON.stringify(res.paths)}`);

    // ---------------------------------------------------------- shader programs stay stable while fighting
    await pg.run(`${cls} programs`, () => {
      const g = game, S = g.skills;
      const p0 = g.renderer.info.programs?.length ?? 0;
      S.applyPreset('endgame_' + g.progression.cls); S.resetCooldowns();
      PT.dummyRing(4, 4);
      for (const slot of ['basic', 'charged', 'q1', 'q2', 'q3', 'q4', 'ult', 'sup']) { S.resetCooldowns(); S.castSlot(slot, { free: true, charge: 1 }); PT.step(0.6); g.renderNow?.(); }
      PT.step(1); g.renderNow?.();
      const p1 = g.renderer.info.programs?.length ?? 0;
      PT.check('renderer.info.programs does not grow during melee casts', p1 <= p0, { before: p0, after: p1 });
      const fsx = PT.frameStats();
      PT.check('draw calls ≤ 350 during melee fx', fsx.calls <= 350, fsx);
    });
    const errs = pg.errors();
    PT.check(`${cls}: no console errors`, errs.length === 0, errs.slice(0, 6));
    await pg.close();
  }

  // ------------------------------------------------------------ legacy keymap (path=all): v2 input + CONTRACT §21 check 4 buff
  {
    const pg = await PT.boot('&cls=sword&path=all');
    PT.check('legacy sword: boot', pg.ready);
    if (pg.ready) {
      await pg.run('legacy sword', () => {
        const g = game, sw = g.sword, P = g.progression;
        PT.step(0.3);
        PT.check('legacy keymap: skills does not own input', g.skills?.ownsInput === false);
        const pp = g.player.object.position;
        const W = g.world;
        const y = W.getGroundHeight ? W.getGroundHeight(pp.x, pp.z + 2.2) : W.getHeight(pp.x, pp.z + 2.2);
        const d = g.debug.spawnDummy(new g.THREE.Vector3(pp.x, y, pp.z + 2.2), { hp: 1e6 });
        g.player.setFacing(0); PT.step(0.2);
        let dm = 0; const off = g.events.on('damage', (p) => { if (p?.target === d) dm++; });
        for (let i = 0; i < 4; i++) { g.input.simulate({ mouse: { 0: true } }); PT.step(0.05); g.input.simulate(null); PT.step(0.35); }
        PT.step(0.6);
        PT.check('legacy LMB combo (own input) hits', dm >= 4, dm);
        // check 4: legacy fire sword buff → levelUp → buff ends → atkMul back to 1
        sw.setElement('fire'); PT.step(0.2);
        sw.debugUse('support'); PT.step(0.2);
        const during = g.stats.get('atkMul');
        PT.check('legacy fire buff is a stats source (atkMul 1.3)', Math.abs(during - 1.3) < 1e-6 && !!sw.buff, { during, buff: sw.buff });
        g.events.emit('levelUp', { level: P.level, pointsGained: 0 });
        let k = 0; while (sw.buff && k++ < 60) PT.step(1);
        PT.check('check 4: after the buff ends stats atkMul === 1', g.stats.get('atkMul') === 1 && (g.player.mods?.atkMul ?? 1) === 1, g.stats.get('atkMul'));
        // F: ultimate only when nothing is offered
        sw.cooldowns.ultimate = 0; PT.resetCounts('spellCast');
        g.input.simulate({ keys: { KeyF: true } }); PT.step(0.05); g.input.simulate(null); PT.step(0.2);
        PT.check('legacy F ultimate (no interact offer)', PT.countEvents('spellCast') === 1, PT.countEvents('spellCast'));
        off();
      });
      const errs = pg.errors();
      PT.check('legacy sword: no console errors', errs.length === 0, errs.slice(0, 6));
    }
    await pg.close();
  }

  // ------------------------------------------------------------ boots with spells stubbed (melee archetypes self-contained)
  {
    const pg = await PT.boot('&cls=paladin&stub=spells');
    if (pg.ready) {
      await pg.run('paladin, spells stubbed', () => {
        const g = game, S = g.skills;
        S.applyPreset('endgame_paladin');
        PT.tp(g.player.object.position.x + 30, g.player.object.position.z);
        const ring = PT.dummyRing(6, 4.5);
        let dmg = 0; const off = g.events.on('damage', (p) => { if (p?.target?.team !== 'player') dmg++; });
        let ok = 0, n = 0;
        for (const id of g.progression.learnedSkills()) {
          if (S.defs.get(id)?.slot === 'finisher') continue;
          n++; S.resetCooldowns();
          try { if (S.cast(id, { free: true, aim: { origin: g.player.object.position.clone().setY(1.5), dir: new g.THREE.Vector3(0, 0, 1), point: ring[0].object.position.clone(), target: ring[0] } })) ok++; } catch (err) { PT.check(id + ' no throw', false, err.message); }
          PT.step(0.8);
        }
        off();
        PT.check('every paladin skill casts with spells stubbed', ok === n && n > 10, { ok, n });
        PT.check('they deal damage', dmg > 0);
      });
      PT.check('spells stubbed: no console errors', pg.errors().length === 0, pg.errors().slice(0, 6));
    }
    await pg.close();
  }
};
