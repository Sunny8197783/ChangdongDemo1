// playtest3 section: combat (CONTRACT §21 check 6 + the reaction-heavy part of check 11, §8, §20; DESIGN §15 balance sim).
// Owned by combat. Runs with the other modules present or stubbed (skills/magic may be missing: everything here goes
// through combat / vfx APIs directly, like the scripted pairs in tools/playtest.js).
const fs = require('fs'); const path = require('path');

const OWN = ['src/combat.js', 'src/vfx.js'];
function ownFiles(root) {
  const out = [...OWN];
  for (const d of ['src/combat', 'src/vfx']) for (const f of fs.readdirSync(path.join(root, d))) if (f.endsWith('.js')) out.push(`${d}/${f}`);
  return out;
}

// DESIGN §15 balance sim (L25, 보통, single target, sustained) as a data check.
const SIM = {
  kalisHp: 7000 * 3.6, finaleHp: 20200 * 3.6, uptime: 0.8, finaleBuff: 1.12, power25: 1.96,
  builds: [
    { name: '대가형 화염 마법사', dps: 218, judg: 0, kalis: 1.9, finale: 6.2 },
    { name: '쌍대가 검사', dps: 189, judg: 0, kalis: 2.2, finale: 7.2 },
    { name: '방랑자 마법사', dps: 188, judg: 0, kalis: 2.2, finale: 7.2 },
    { name: '빛 성기사', dps: 154, judg: 63, kalis: 1.9, finale: 8.3 },
    { name: '암살자', dps: 195, judg: 0, kalis: 2.2, finale: 6.9 },
    { name: '정령술사', dps: 168, judg: 0, kalis: 2.5, finale: 8.0 },
  ],
};

module.exports = async function combat(PT) {
  // ------------------------------------------------------------ static checks on combat-owned files
  {
    const files = ownFiles(PT.root);
    const bad = [], imports = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(PT.root, f), 'utf8').split('\n');
      src.forEach((l, i) => {
        if (/=== ?'(sword|mage)'/.test(l)) bad.push(`${f}:${i + 1}`);
        if (/for \(let \w+ = 0; \w+ < 5;/.test(l)) bad.push(`${f}:${i + 1} (i<5)`);
        const m = /^\s*import\s[^'"]*['"]([^'"]+)['"]/.exec(l);
        if (m) {
          const spec = m[1];
          const top = !f.includes('/combat/') && !f.includes('/vfx/');
          const ok = spec === 'three' || spec.startsWith('three/')
            || (top ? /^\.\/(core|combat|vfx)\//.test(spec) : (/^\.\/[\w-]+\.js$/.test(spec) || /^\.\.\/core\//.test(spec)));
          if (!ok) imports.push(`${f}:${i + 1} ${spec}`);
        }
      });
    }
    PT.check('rule 8/9: no class literals or i<5 loops in combat/vfx files', bad.length === 0, bad);
    PT.check('rule 7: combat/vfx statically import only own files, src/core/* and three', imports.length === 0, imports);
  }

  // ------------------------------------------------------------ DESIGN §15 balance sim (data check)
  {
    const S = SIM;
    const mins = (hp, dps) => hp / dps / 60;
    const rows = S.builds.map((b) => {
      const tot = b.dps + b.judg;
      return { name: b.name, kalis: mins(S.kalisHp, tot), finale: mins(S.finaleHp, tot * S.uptime * S.finaleBuff), want: [b.kalis, b.finale] };
    });
    // builds with judgment: the finale value lies between "judgment fully up" and "judgment locked out" (DESIGN rounds it)
    const okRows = rows.every((r, i) => {
      const b = S.builds[i];
      if (Math.abs(r.kalis - r.want[0]) > 0.15) return false;
      if (!b.judg) return Math.abs(r.finale - r.want[1]) <= 0.25;
      const lo = mins(S.finaleHp, (b.dps + b.judg) * S.uptime * S.finaleBuff), hi = mins(S.finaleHp, b.dps * S.uptime * S.finaleBuff);
      return r.want[1] >= lo - 0.25 && r.want[1] <= hi + 0.25;
    });
    PT.check('balance sim: Kalis / finale minutes reproduce the DESIGN §15 table', okRows, rows.map((r) => `${r.name} ${r.kalis.toFixed(2)}/${r.finale.toFixed(2)} vs ${r.want}`));
    const dps = S.builds.map((b) => b.dps + b.judg);
    PT.check('balance sim: no build is more than ×1.4 faster than another', Math.max(...dps) / Math.min(...dps) <= 1.4, (Math.max(...dps) / Math.min(...dps)).toFixed(3));
    S.judgCapDps = (400 * S.power25) / 12;
    PT.check('balance sim: capped judgment (400×power / 12 s boss cd) ≈ 63 DPS (±5)', Math.abs(S.judgCapDps - 63) <= 5, S.judgCapDps.toFixed(1));
  }

  const pg = await PT.boot('&cls=mage');
  PT.check('boot ready', pg.ready);
  if (!pg.ready) { await pg.close(); return; }
  PT.check('boot: no console errors', pg.errors().length === 0, pg.errors().slice(0, 6));

  // the balance sim judgment numbers must match the live reaction table
  await pg.run('balance sim vs REACTION_DEFS', () => {
    const J = game.combat.REACTION_DEFS.find((r) => r.id === 'judgment');
    PT.check('judgment: boss cd 12 s, target cd 6 s, boss break +20, consumes all stacks', J && J.cdBoss === 12 && J.cdTarget === 6 && J.bossBreak === 20 && J.consumeAllStacks === true, J);
  });

  // ------------------------------------------------------------ data: registry shape
  await pg.run('registry', () => {
    const C = game.combat;
    const ids = [...new Set(C.REACTION_DEFS.map((r) => r.id))];
    PT.check('49 unique reaction ids', ids.length === 49, ids.length);
    PT.check('35 P0 + 14 P1', C.P0_IDS.length === 35 && C.P1_IDS.length === 14, [C.P0_IDS.length, C.P1_IDS.length]);
    PT.check('every entry has family and p', C.REACTION_DEFS.every((r) => r.family && (r.p === 0 || r.p === 1)), C.REACTION_DEFS.filter((r) => !r.family).map((r) => r.id));
    const old19 = ['melt', 'shatter', 'electrocute', 'superconduct', 'overload', 'swirl', 'magma', 'flashfreeze', 'evaporate', 'skyslam', 'updraft', 'fire_tornado', 'blizzard', 'storm_tornado', 'steam_burst', 'electro_water', 'freeze_water', 'fire_wave', 'infusion'];
    PT.check('codex REACTIONS keeps the old 19 first, in order', old19.every((id, i) => C.REACTIONS[i]?.id === id) && C.REACTIONS.length === 49);
    PT.check('BY_TRIGGER indexed for all 9 elements + physical', game.elements.list.every((el) => C.BY_TRIGGER[el]) && !!C.BY_TRIGGER.physical, Object.keys(C.BY_TRIGGER));
    const S = C.STATUS_DEFS;
    PT.check('statuses: encrusted is the earth aura, stunned is CC (aura:false)', S.encrusted?.element === 'earth' && S.stunned?.aura === false && S.stunned?.preventsAct);
    PT.check('status table has Korean names', Object.values(S).every((d) => /[가-힣]/.test(d.nameKo)));
    PT.check('reaction names are Korean', C.REACTION_DEFS.every((r) => /[가-힣]/.test(r.nameKo) && /[가-힣]/.test(r.desc || '')));
    PT.check('statusInfo(id) returns the def', C.statusInfo('seeded') === S.seeded && C.statusInfo('nope') === null);
    PT.check('voidShield is not a status', !('voidShield' in S));
  });

  // ------------------------------------------------------------ check 6a: debug.react for all 49 ids emits reaction {id}
  await pg.run('debugReact all 49', () => {
    const g = game, C = g.combat, T = g.THREE;
    const pp = g.player.object.position;
    const seen = new Set();
    const off = g.events.on('reaction', (p) => seen.add(p.id));
    const ids = [...new Set(C.REACTION_DEFS.map((r) => r.id))];
    const fails = [];
    for (const id of ids) {
      const d = g.debug.spawnDummy(new T.Vector3(pp.x + 3, pp.y, pp.z - 6), { hp: 1e6 });
      C.clearStatus(d); d._rxT = {};
      let ok = false;
      try { ok = g.debug.react(id, d) !== false; } catch (e) { fails.push(id + ': ' + e.message); }
      PT.step(0.05);
      if (!seen.has(id)) fails.push(id + (ok ? '' : ' (returned false)'));
    }
    PT.step(1.5);
    off();
    PT.check('all 49 ids emit reaction{id} via debug.react', fails.length === 0, fails);
  });

  // ------------------------------------------------------------ check 6b: natural triggers for the 35 P0 ids
  await pg.run('natural P0 triggers', () => {
    const g = game, C = g.combat, T = g.THREE, E = g.elements.DEFS;
    const pp = g.player.object.position;
    let n = 0;
    const fresh = (mass) => {
      const a = (n++ % 12) / 12 * Math.PI * 2;
      const d = g.debug.spawnDummy(new T.Vector3(pp.x + Math.sin(a) * 9, pp.y, pp.z + Math.cos(a) * 9), { hp: 1e6 });
      C.clearStatus(d); d._rxT = {}; if (d.auraOrder) d.auraOrder.length = 0;
      if (mass) d.mass = mass;
      return d;
    };
    const hit = (d, el, extra = {}) => {
      const st = E[el]?.status;
      const status = st ? { [st]: st === 'seeded' || st === 'radiant' || st === 'corroded' ? { stacks: 1 } : C.STATUS_DEFS[st].dur } : undefined;
      return C.dealDamage(d, { amount: 10, element: el, source: 'player', point: C.getCenter(d, new T.Vector3()), status, ...extra });
    };
    const got = [];
    const off = g.events.on('reaction', (p) => got.push(p.id));
    const tryPair = (id, fn) => { const before = got.length; fn(); PT.step(0.25); return got.slice(before).includes(id); };
    const results = {};
    const pair = (a, b, extraB) => () => { const d = fresh(); hit(d, a); PT.step(0.05); hit(d, b, extraB); };
    const PAIRS = {
      melt: pair('ice', 'fire'), electrocute: pair('water', 'lightning'), superconduct: pair('ice', 'lightning'), overload: pair('fire', 'lightning'),
      swirl: pair('fire', 'wind'), magma: pair('fire', 'earth'), flashfreeze: pair('water', 'ice'), evaporate: pair('water', 'fire'),
      mudslide: pair('water', 'earth'), crystallize: pair('ice', 'earth'), bloom: pair('nature', 'water'), wildfire: pair('nature', 'fire'),
      entangle: pair('nature', 'earth'), sanctify: pair('fire', 'light'), holywater: pair('water', 'light'), prism: pair('ice', 'light'),
      radiant_burst: pair('light', 'lightning'), purify: pair('shadow', 'light'), necroflame: pair('fire', 'shadow'),
      shatter: () => { const d = fresh(); hit(d, 'water'); PT.step(0.05); hit(d, 'ice'); PT.step(0.05); d._rxT = {}; hit(d, 'earth'); },
      skyslam: () => { const d = fresh(1); hit(d, 'physical', { launch: 9 }); PT.step(0.05); hit(d, 'earth'); },
      updraft: () => { const d = fresh(1); hit(d, 'physical', { launch: 9 }); PT.step(0.05); hit(d, 'wind'); },
      judgment: () => { const d = fresh(); for (let i = 0; i < 5; i++) { hit(d, 'light'); PT.step(0.02); } hit(d, 'physical', { heavy: true, amount: 40 }); },
      burgeon: () => { const pod = C.registerObject({ kind: 'pod', position: C.getCenter(fresh(), new T.Vector3()) }); C.reactObject(pod, 'fire', { amount: 10, source: 'player', element: 'fire' }); },
      hyperbloom: () => { const pod = C.registerObject({ kind: 'pod', position: C.getCenter(fresh(), new T.Vector3()) }); C.reactObject(pod, 'lightning', { amount: 10, source: 'player', element: 'lightning' }); },
      fire_tornado: () => C.reactObject({ kind: 'tornado', isZone: true, position: pp.clone(), radius: 3 }, 'fire', { source: 'player' }),
      blizzard: () => C.reactObject({ kind: 'tornado', isZone: true, position: pp.clone(), radius: 3 }, 'ice', { source: 'player' }),
      storm_tornado: () => C.reactObject({ kind: 'tornado', isZone: true, position: pp.clone(), radius: 3 }, 'lightning', { source: 'player' }),
      steam_burst: () => C.reactObject({ kind: 'ice', isZone: true, position: pp.clone().add(new T.Vector3(0, 0, -9)), radius: 3 }, 'fire', { source: 'player' }),
      electro_water: () => C.reactObject({ kind: 'water', isZone: true, position: pp.clone().add(new T.Vector3(0, 0, -9)), radius: 3 }, 'lightning', { source: 'player' }),
      freeze_water: () => C.reactObject({ kind: 'water', isZone: true, position: pp.clone().add(new T.Vector3(0, 0, -9)), radius: 3 }, 'ice', { source: 'player' }),
      fire_wave: () => C.reactObject({ kind: 'fire', isZone: true, position: pp.clone().add(new T.Vector3(0, 0, -9)), radius: 3 }, 'wind', { source: 'player' }),
      infusion: () => C.reactObject({ kind: 'storm', isZone: true, element: 'lightning', position: pp.clone().add(new T.Vector3(0, 0, -9)), radius: 3 }, 'earth', { source: 'player' }),
      break: () => { const d = fresh(); d.breakMax = 60; d.breakValue = 60; hit(d, 'earth', { amount: 100 }); },
      resonance: () => {
        C.resonance.reset(); const d = fresh();
        hit(d, 'water'); PT.step(0.05); hit(d, 'lightning'); PT.step(0.05);   // electrocute
        hit(d, 'fire'); PT.step(0.05); d._rxT = {}; hit(d, 'lightning'); PT.step(0.05); // overload
        hit(d, 'ice'); PT.step(0.05); d._rxT = {}; hit(d, 'fire');             // melt
      },
    };
    const missing = [];
    for (const id of C.P0_IDS) {
      const fn = PAIRS[id];
      if (!fn) { missing.push(id + ' (no script)'); continue; }
      results[id] = tryPair(id, fn);
      if (!results[id]) missing.push(id);
      PT.step(0.1);
    }
    off();
    PT.check('all 35 P0 reactions trigger naturally (scripted element pairs / object & zone hits)', missing.length === 0, missing);
    PT.step(2);
  });

  // ------------------------------------------------------------ check 6c: the DESIGN §4.5 priority worked example
  await pg.run('priority worked example', () => {
    const g = game, C = g.combat, T = g.THREE;
    // integration: the natural-trigger sweep leaves live zones/fields (electrified water, steam, thorns…) around the start
    // point once magic's zones exist; run the worked example on clean ground 40 m away so nothing else touches the dummy
    const home = g.player.object.position.clone();
    PT.tp(home.x, home.z - 40); PT.step(0.3);
    const pp = g.player.object.position;
    const d = g.debug.spawnDummy(new T.Vector3(pp.x - 5, pp.y, pp.z - 5), { hp: 1e6 });
    C.clearStatus(d); d._rxT = {};
    const at = () => C.getCenter(d, new T.Vector3());
    // the example's enemy simply *is* wet, then seeded, then radiant (applied without reacting)
    C.applyStatus(d, 'wet', 8, { el: 'water', source: 'player' }); PT.step(0.05);
    C.applyStatus(d, 'seeded', 8, { el: 'nature', source: 'player', stacks: 1 }); PT.step(0.05);
    C.applyStatus(d, 'radiant', 10, { el: 'light', source: 'player', stacks: 1 }); PT.step(0.05);
    PT.check('aura ring newest first: radiant, seeded, wet', JSON.stringify(d.auraOrder.slice(0, 3)) === '["radiant","seeded","wet"]', d.auraOrder);
    const pv = C.previewReaction(d, 'lightning');
    PT.check('preview: lightning → 광휘 폭발', pv?.id === 'radiant_burst', pv);
    const pv2 = C.previewReaction(d, 'lightning');
    PT.check('previewReaction reuses its result object (no allocation)', pv === pv2);
    const r1 = C.dealDamage(d, { amount: 10, element: 'lightning', source: 'player', point: at() });
    PT.check('hit 1 fires 광휘 폭발', r1.reaction === 'radiant_burst', r1.reaction);
    C.applyStatus(d, 'radiant', 10, { el: 'light', source: 'player', stacks: 1 }); PT.step(0.05);
    const pv3 = C.previewReaction(d, 'lightning');
    PT.check('while 광휘 폭발 is on cooldown the preview falls to seeded → 촉진', pv3?.id === 'quicken', pv3);
    const r2 = C.dealDamage(d, { amount: 10, element: 'lightning', source: 'player', point: at() });
    PT.check('hit 2 fires 촉진', r2.reaction === 'quicken', r2.reaction);
    PT.check('previewReaction has no side effects', !!d.statuses.wet);
    PT.tp(home.x, home.z); PT.step(0.3);   // back to the start point for the following checks
  });

  // ------------------------------------------------------------ check 6d: judgment cooldown + consumption
  await pg.run('judgment cooldown', () => {
    const g = game, C = g.combat, T = g.THREE;
    const pp = g.player.object.position;
    const d = g.debug.spawnDummy(new T.Vector3(pp.x + 5, pp.y, pp.z - 5), { hp: 1e6 });
    C.clearStatus(d); d._rxT = {};
    const at = () => C.getCenter(d, new T.Vector3());
    let j = 0; const off = g.events.on('reaction', (p) => { if (p.id === 'judgment' && p.target === d) j++; });
    const stack5 = () => { for (let i = 0; i < 5; i++) C.dealDamage(d, { amount: 2, element: 'light', source: 'player', point: at(), status: { radiant: { stacks: 1 } } }); };
    stack5();
    PT.check('5 radiant stacks', C.stacksOf(d, 'radiant') === 5, C.stacksOf(d, 'radiant'));
    C.dealDamage(d, { amount: 20, element: 'physical', source: 'player', point: at(), heavy: true });
    PT.check('judgment consumes all radiant stacks', !d.statuses.radiant);
    PT.step(1.2); stack5();
    C.dealDamage(d, { amount: 20, element: 'physical', source: 'player', point: at(), heavy: true });
    PT.step(0.3);
    PT.check('two triggers within 6 s → one judgment', j === 1, j);
    PT.step(5.0); d._rxT.judgment = 0; stack5();
    C.dealDamage(d, { amount: 20, element: 'physical', source: 'player', point: at(), heavy: true });
    PT.step(0.3);
    PT.check('after 6 s it can fire again', j === 2, j);
    off();
  });

  // ------------------------------------------------------------ check 6e: 16-pod chain within the depth cap, ≤ 4 full presets / frame
  await pg.run('16-pod chain', () => {
    const g = game, C = g.combat, T = g.THREE, V = g.vfx;
    const pp = g.player.object.position;
    for (const e of g.entities) if (e.isDummy) C.clearStatus(e);
    PT.step(0.5);
    V.resetPresetStats?.();
    const pods = [];
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39996, r = 1.2 + Math.sqrt(i) * 1.1;
      const pos = new T.Vector3(pp.x + Math.cos(a) * r, pp.y + 0.4, pp.z - 14 + Math.sin(a) * r);
      pods.push(C.registerObject({ kind: 'pod', position: pos }));
    }
    let bursts = 0; const off = g.events.on('reaction', (p) => { if (p.id === 'burgeon') bursts++; });
    const qs = C._debug.rx.queueStats();
    qs.maxPerFrame = 0;
    C.reactObject(pods[0], 'fire', { amount: 10, source: 'player', element: 'fire' });
    let framesWithCascade = 0, maxPerFrame = 0;
    for (let f = 0; f < 240; f++) {
      const before = qs.executed;
      g.step(1, 1 / 60);
      const ran = qs.executed - before;
      if (ran) framesWithCascade++;
      maxPerFrame = Math.max(maxPerFrame, ran);
    }
    off();
    PT.check('the chain reaches all 16 pods (staggered)', bursts === 16, bursts);
    PT.check('cascade depth ≤ 3 per frame', maxPerFrame <= 3 && qs.maxPerFrame <= 3, { maxPerFrame, q: qs.maxPerFrame });
    PT.check('cascade is spread over frames (stagger 0.08–0.12 s)', framesWithCascade >= 4, framesWithCascade);
    const ps = V.presetStats?.();
    PT.check('≤ 4 full reaction presets per frame (the rest reduced)', ps && ps.maxFullPerFrame <= 4, ps);
    for (const p of pods) C.unregisterObject(p);
  });

  // ------------------------------------------------------------ §8.3 formula, crit from stats, DoT power snapshot, hitFeel single caller
  await pg.run('formula + hitFeel', () => {
    const g = game, C = g.combat, T = g.THREE, P = g.progression, S = g.stats, V = g.vfx;
    const pp = g.player.object.position;
    const d = g.debug.spawnDummy(new T.Vector3(pp.x, pp.y, pp.z - 7), { hp: 1e6 });
    C.clearStatus(d); d._rxT = {};
    P.setLevel(1);
    S.set('test:nocrit', { critChance: -10 });
    const at = () => C.getCenter(d, new T.Vector3());
    const a = C.dealDamage(d, { amount: 100, element: 'fire', source: 'player', point: at(), noReaction: true }).damage;
    PT.check('100 base fire at L1 → 100', a === 100, a);
    S.set('test:nocrit', { critChance: 10 });
    const b = C.dealDamage(d, { amount: 100, element: 'physical', source: 'player', point: at(), noReaction: true });
    PT.check('crit comes from stats (chance) and critMul (1.5 + critMul)', b.crit && b.damage === Math.round(100 * S.derived().critMul), b);
    S.set('test:nocrit', { critChance: -10 });
    const enemyHit = C.dealDamage(d, { amount: 40, element: 'physical', source: { team: 'enemy', zoneDmgMul: 2, statuses: {} }, point: at(), noReaction: true }).damage;
    PT.check('non-player sources are not scaled by player stats (zoneDmgMul only on the player)', enemyHit === 80 || enemyHit === 40, enemyHit);
    // DoT power snapshot: burning applied at L1, ticking at L10 keeps the L1 power
    C.clearStatus(d);
    C.dealDamage(d, { amount: 1, element: 'fire', source: 'player', point: at(), noReaction: true, status: { burning: 4 } });
    const snap = d.statuses.burning?.power;
    P.setLevel(10);
    let tick = null; const off = g.events.on('damage', (p) => { if (p.target === d && p.dot && tick == null) tick = p.amount; });
    PT.step(1.0); off();
    PT.check('DoT ticks use the power snapshot from application', snap === 1 && tick === Math.round(6 * 1 * P.damageMul('fire') * S.get('atkMul') * S.elementDmg('fire')), { snap, tick });
    P.setLevel(1);
    // hitFeel: once per non-DoT hit, never for DoT ticks
    C.clearStatus(d);
    V.resetFeelStats?.();
    for (let i = 0; i < 3; i++) C.dealDamage(d, { amount: 10, element: 'ice', source: 'player', point: at(), noReaction: true });
    const c3 = V.feelStats?.calls;
    C.dealDamage(d, { amount: 10, element: 'fire', source: 'player', point: at(), noReaction: true, status: { burning: 4 } });
    V.resetFeelStats?.();
    PT.step(1.2);
    PT.check('hitFeel: exactly one call per non-DoT hit', c3 === 3, c3);
    PT.check('hitFeel: DoT ticks never call it', V.feelStats?.calls === 0, V.feelStats?.calls);
    PT.check('hitFeel tier table has the 6 tiers', ['light', 'heavy', 'crit', 'reaction', 'ult', 'break'].every((t) => V.feelStats.byTier[t] !== undefined));
    S.clear('test:nocrit');
  });

  // ------------------------------------------------------------ break gauge, void shield, resonance, statuses
  await pg.run('break / voidShield / resonance', () => {
    const g = game, C = g.combat, T = g.THREE, S = g.stats;
    const pp = g.player.object.position;
    const mk = (dx) => { const d = g.debug.spawnDummy(new T.Vector3(pp.x + dx, pp.y, pp.z - 8), { hp: 1e6 }); C.clearStatus(d); d._rxT = {}; return d; };
    const d = mk(-3);
    d.breakMax = 60; d.breakValue = 60;
    const at = () => C.getCenter(d, new T.Vector3());
    let br = 0, rec = 0;
    const o1 = g.events.on('break', (p) => { if (p.target === d) br++; }), o2 = g.events.on('breakRecover', (p) => { if (p.target === d) rec++; });
    C.dealDamage(d, { amount: 20, element: 'fire', source: 'player', point: at(), noReaction: true, noCrit: true });
    PT.check('break gauge drains by poise (amount × 0.5)', d.breakValue === 50, d.breakValue);
    C.dealDamage(d, { amount: 80, element: 'earth', source: 'player', point: at(), noReaction: true, noCrit: true });
    PT.check('earth ×1.5 breaks the gauge → break event + broken', br === 1 && C.isBroken(d) && !!d.statuses.broken, { br, v: d.breakValue });
    PT.check('break near-freeze via timeScale "break" (0.05 for 0.25 s)', g.timeScale.has('break') && Math.abs(g.timeScale.value() - 0.05) < 1e-6);
    const brokenDmg = C.dealDamage(d, { amount: 10, element: 'physical', source: 'player', point: at(), noReaction: true, noCrit: true }).damage;
    PT.check('broken: +50% damage taken', brokenDmg === 15, brokenDmg);
    for (let i = 0; i < 40; i++) PT.step(0.2);
    PT.check('gauge refills after 6 s → breakRecover', rec === 1 && d.breakValue === 60 && !C.isBroken(d), { rec, v: d.breakValue });
    o1(); o2();
    // void shield
    const v = mk(3);
    v.voidShield = 100;
    let vb = 0; const o3 = g.events.on('voidShieldBroken', (p) => { if (p.target === v) vb++; });
    const sd = C.dealDamage(v, { amount: 100, element: 'physical', source: 'player', point: C.getCenter(v, new T.Vector3()), noReaction: true, noCrit: true }).damage;
    PT.check('voidShield: damage ×0.3 while > 0', sd === 30, sd);
    PT.check('voidShield: poise × 1 depletion for a plain hit', v.voidShield === 50, v.voidShield);
    C.dealDamage(v, { amount: 30, element: 'light', source: 'player', point: C.getCenter(v, new T.Vector3()), noReaction: true, noCrit: true });
    PT.check('voidShield: light depletes ×4 → voidShieldBroken', v.voidShield === 0 && vb === 1, { s: v.voidShield, vb });
    o3();
    // resonance
    C.resonance.reset(); S.clear('rx:resonance');
    const r = mk(0);
    let res = 0; const o4 = g.events.on('resonance', (p) => { if (p.target === r) res++; });
    const at2 = () => C.getCenter(r, new T.Vector3());
    const hit = (el, st) => C.dealDamage(r, { amount: 5, element: el, source: 'player', point: at2(), status: st });
    hit('water', { wet: 5 }); hit('lightning'); PT.step(0.1);
    hit('ice', { chilled: 3 }); r._rxT = {}; hit('lightning'); PT.step(0.1);
    hit('nature', { seeded: { stacks: 1 } }); r._rxT = {}; hit('fire'); PT.step(0.1);
    PT.check('3 distinct reactions in 6 s → resonance', res === 1, res);
    PT.check('resonance sets stats rx:resonance {freeNext, nextMul 1.3} for 8 s', S.has('rx:resonance') && S.get('freeNext') === true && Math.abs(S.get('nextMul') - 1.3) < 1e-9 && Math.abs(S.timeLeft('rx:resonance') - 8) < 0.5);
    o4(); S.clear('rx:resonance');
    // statuses: stacks schema, maxStat, 상극 full removal, boss rules
    const s = mk(6);
    C.dealDamage(s, { amount: 1, element: 'shadow', source: 'player', point: C.getCenter(s, new T.Vector3()), status: { corroded: { stacks: 4 } } });
    PT.check('hit.status {stacks} schema', C.stacksOf(s, 'corroded') === 4, C.stacksOf(s, 'corroded'));
    S.set('test:max', { corrodedMaxAdd: 2 });
    C.applyStatus(s, 'corroded', 8, { stacks: 5, source: 'player' });
    PT.check('stack cap = max + maxStat (player sources)', C.stacksOf(s, 'corroded') === 7, C.stacksOf(s, 'corroded'));
    S.clear('test:max');
    PT.check('st.el tags the element', s.statuses.corroded.el === 'shadow');
    C.dealDamage(s, { amount: 1, element: 'light', source: 'player', point: C.getCenter(s, new T.Vector3()) });
    PT.check('상극 (purify) removes the aura completely, stacks included', !s.statuses.corroded);
    C.applyStatus(s, 'stunned', 1, { source: 'player', el: 'earth' });
    PT.check('stunned is never an aura', !C.isAura(s, 'stunned') && !(s.auraOrder || []).includes('stunned'));
    const boss = mk(9); boss.isBoss = true; boss.breakMax = 100; boss.breakValue = 100;
    C.applyStatus(boss, 'rooted', 2, { source: 'player' });
    PT.check('rooted on a boss → +40 break instead', !boss.statuses.rooted && boss.breakValue === 60, boss.breakValue);
    C.applyStatus(boss, 'frozen', 2.5, { source: 'player' });
    PT.check('boss freeze ×0.4 duration', Math.abs((boss.statuses.frozen?.time || 0) - 1.0) < 1e-6, boss.statuses.frozen?.time);
    boss.isBoss = false; C.clearStatus(boss);
  });

  // ------------------------------------------------------------ healPlayer: healMul, heal event, boss HoT cap 5 %/s
  await pg.run('healPlayer + boss HoT cap', () => {
    const g = game, C = g.combat, T = g.THREE;
    const pl = g.player;
    const max = pl.maxHp;
    pl.hp = max * 0.3;
    let ev = 0; const off = g.events.on('heal', () => ev++);
    const h = C.healPlayer(10, 'test');
    PT.check('burst heal applies and emits heal', h === 10 && ev === 1, { h, ev });
    // fake a boss fight (enemies.boss alive within 75 m)
    const E = g.enemies;
    const fake = { isBoss: true, alive: true, object: { position: pl.object.position.clone().add(new T.Vector3(0, 0, -10)) } };
    const desc = Object.getOwnPropertyDescriptor(E, 'boss');
    let ok = true;
    try { Object.defineProperty(E, 'boss', { get: () => fake, configurable: true }); } catch (_) { ok = false; }
    if (!ok || E.boss !== fake) { PT.skip('boss HoT cap', 'enemies.boss could not be faked'); off(); return; }
    pl.hp = max * 0.3;
    const hp0 = pl.hp;
    for (let i = 0; i < 120; i++) { C.healPlayer(max * 0.2 / 60, 'spring', { hot: true }); g.step(1, 1 / 60); }
    const rate = (pl.hp - hp0) / max / 2;   // per second over 2 s (regen from player may add, also capped)
    PT.check('boss fight: HoT total ≤ 5% maxHp/s', rate <= 0.0505 + 0.006, rate.toFixed(4));
    pl.hp = max * 0.3;
    const b0 = pl.hp; C.healPlayer(max * 0.2, 'judgment');
    PT.check('burst heals are not capped in boss fights', Math.abs(pl.hp - b0 - max * 0.2) < 1e-6);
    if (desc) Object.defineProperty(E, 'boss', desc); else delete E.boss;
    pl.hp = max;
    off();
  });

  // ------------------------------------------------------------ VFX: atlas, presets, telegraph, dissolve, runes, flash = sprite
  await pg.run('vfx v3', () => {
    const g = game, V = g.vfx, T = g.THREE;
    const pp = g.player.object.position;
    const img = V.textures.atlas.image;
    PT.check('atlas is 8×8 at 128 px (1024²)', img.width === 1024 && img.height === 1024, [img.width, img.height]);
    PT.check('FRAMES has the new names', ['rune', 'petal', 'droplet', 'feather', 'bubble', 'wisp', 'thorn', 'raven'].every((k) => Number.isInteger(V.FRAMES[k]) && V.FRAMES[k] < 64));
    const lights0 = []; g.scene.traverse((o) => { if (o.isLight) lights0.push(o); });
    for (const el of g.elements.list) { V.preset('impact_' + el, pp.clone().add(new T.Vector3(0, 1, -5))); V.preset('explosion_' + el, pp.clone().add(new T.Vector3(0, 1, -5))); PT.step(0.02); }
    V.preset('rx_judgment', pp.clone().add(new T.Vector3(0, 0, -5)));
    PT.step(0.3);
    const lights1 = []; g.scene.traverse((o) => { if (o.isLight) lights1.push(o); });
    PT.check('impact_/explosion_ presets for all 9 elements run, no new lights', lights1.length === lights0.length, [lights0.length, lights1.length]);
    // telegraph: decal radius = hitbox radius
    const h = V.telegraph({ shape: 'circle', pos: pp.clone().add(new T.Vector3(0, 0, -6)), r: 3.5, dur: 0.6, color: 'damage', parryable: true });
    PT.check('telegraph returns a handle', !!h && h.alive);
    const tm = g.scene.children.filter((o) => o.name === 'vfx-telegraph');
    PT.check('telegraph pool of 8 meshes', tm.length === 8, tm.length);
    const vis = tm.find((m) => m.visible);
    let maxR = 0;
    if (vis) { const a = vis.geometry.attributes.position.array, c = pp.clone().add(new T.Vector3(0, 0, -6)); for (let i = 0; i < a.length; i += 3) maxR = Math.max(maxR, Math.hypot(a[i] - c.x, a[i + 2] - c.z) / Math.SQRT2); }
    PT.check('telegraph decal radius equals the hitbox radius', Math.abs(maxR - 3.5) < 0.01, maxR);
    PT.step(0.4); const midP = h.progress;
    PT.step(0.4);
    PT.check('telegraph fills and ends on time', midP > 0.4 && midP < 1 && !h.alive, midP);
    const line = V.telegraph({ shape: 'line', pos: pp.clone(), dir: new T.Vector3(1, 0, 0), len: 10, width: 2, dur: 0.5 });
    const cone = V.telegraph({ shape: 'cone', pos: pp.clone(), dir: new T.Vector3(0, 0, -1), r: 6, angle: 70, dur: 0.5, color: 'void' });
    const ring = V.telegraph({ shape: 'ring', pos: pp.clone(), r: 5, inner: 3, dur: 0.5, color: 'grab' });
    PT.check('line / cone / ring telegraphs', !!line && !!cone && !!ring);
    PT.step(0.6);
    // dissolve a dummy: clones once, same program, animates uDissolve, never touches shared materials
    const d = g.debug.spawnDummy(new T.Vector3(pp.x + 2, pp.y, pp.z - 4), { hp: 1e6 });
    const meshes = []; d.object.traverse((m) => { if (m.isMesh && m.name !== 'outline') meshes.push({ m, orig: m.material }); });
    const progs0 = g.renderer.info.programs.length;
    const dh = V.dissolve(d, { dur: 0.5 });
    PT.step(0.3);
    g.renderNow();
    const cloned = meshes.filter((x) => x.m.material !== x.orig).length;
    const u = meshes.map((x) => x.m.material?._dis?.uDissolve?.value).filter((x) => x != null);
    PT.check('dissolve clones the toon materials', !!dh && cloned > 0, { cloned, n: meshes.length });
    PT.check('dissolve animates uDissolve on the clones only', u.length > 0 && u.every((x) => x > 0) && meshes.every((x) => !x.orig._dis || x.orig._dis.uDissolve.value === -1), u.slice(0, 4));
    PT.step(0.5);
    g.renderNow();
    PT.check('dissolve compiles no new program', g.renderer.info.programs.length === progs0, [progs0, g.renderer.info.programs.length]);
    V.undissolve(d);
    PT.check('undissolve restores the original materials', meshes.every((x) => x.m.material === x.orig));
    // runes / smear / decals / wind lines
    const rc = V.runeCircle(pp.clone().add(new T.Vector3(0, 0, -4)), { element: 'light', r: 2, dur: 0.6 });
    V.smear('arc', pp.clone().add(new T.Vector3(0, 1.2, -1)), null, 1.2, 'fire');
    V.smear('twin', pp.clone().add(new T.Vector3(0, 1.2, -1)), null, 1, 'shadow');
    for (const k of ['crack', 'scorch', 'frost', 'lichtenberg', 'ripple', 'flowers', 'rune', 'violet']) V.groundDecal(k, pp.clone().add(new T.Vector3(Math.random() * 6 - 3, 0, -6)), 1.5, 1);
    V.windLines(true, 1); PT.step(0.2); const wl = V.stats().additive; V.windLines(false);
    PT.check('rune circle / smear / ground decal kinds / wind lines run', !!rc && wl > 0);
    PT.check('3-octave trauma shake runs (trauma decays)', (() => { V.shake(0.8); PT.step(0.1); const a = V.trauma; PT.step(1.0); return a > 0 && V.trauma < a; })());
  });

  PT.check('no console errors after all combat checks', pg.errors().length === 0, pg.errors().slice(0, 8));
  await pg.close();

  // fresh page for the perf spot (earlier blocks leave many dummies around)
  const pgs = await PT.boot('&cls=mage');
  if (pgs.ready) {
  // ------------------------------------------------------------ check 11 (reaction-heavy stress spot) + programs-count
  await pgs.run('reaction stress perf', () => {
    const g = game, C = g.combat, T = g.THREE;
    const pp = g.player.object.position;
    // a fight spot (the camp-0 meadow, as in playtest2's perf spot), not the village plaza
    const cp = g.world?.camps?.[0]?.position;
    if (cp) PT.tp(cp.x + 10, cp.z + 10);
    PT.step(5);   // past the first 5 s of boot
    const progs0 = g.renderer.info.programs.length;
    const ring = PT.dummyRing(12, 7, { hp: 1e6 });
    const pods = [];
    for (let i = 0; i < 6; i++) pods.push(C.registerObject({ kind: 'pod', position: pp.clone().add(new T.Vector3(Math.cos(i) * 5, 0.4, Math.sin(i) * 5)) }));
    const zones = [{ kind: 'water', isZone: true, position: pp.clone().add(new T.Vector3(4, 0, 4)), radius: 3.5 }, { kind: 'tornado', isZone: true, position: pp.clone().add(new T.Vector3(-4, 0, 4)), radius: 3 }];
    const seq = ['water', 'lightning', 'fire', 'nature', 'ice', 'light', 'shadow', 'earth', 'wind'];
    const E = g.elements.DEFS;
    let worst = { calls: 0, tris: 0 };
    let rx = 0; const off = g.events.on('reaction', () => rx++);
    for (let k = 0; k < 8; k++) {   // 8 "skills" in 2 s on 12 enemies
      const el = seq[k % seq.length], st = E[el]?.status;
      for (const d of ring) C.dealDamage(d, { amount: 25, element: el, source: 'player', point: C.getCenter(d, new T.Vector3()), status: st ? { [st]: st === 'seeded' || st === 'radiant' || st === 'corroded' ? { stacks: 2 } : 4 } : undefined });
      if (k === 2) C.reactObject(pods[0], 'fire', { amount: 10, source: 'player', element: 'fire' });
      if (k === 3) C.reactObject(zones[0], 'lightning', { source: 'player' });
      if (k === 5) C.reactObject(zones[1], 'fire', { source: 'player' });
      for (let f = 0; f < 15; f++) {
        if (f === 7) { const fs = PT.frameStats(); if (fs.calls > worst.calls) worst = fs; }
        else g.step(1, 1 / 60);
      }
    }
    off();
    for (let i = 0; i < 30; i++) { const fs = PT.frameStats(); if (fs.calls > worst.calls) worst = fs; if (i % 10 === 0) g.step(5, 1 / 60); }
    PT.note(`stress: ${rx} reactions, worst frame ${worst.calls} calls / ${worst.tris} tris, particles ${g.vfx.stats().particles}`);
    PT.check('stress: draw calls ≤ 350', worst.calls <= 350, worst.calls);
    PT.check('stress: triangles ≤ 900k', worst.tris <= 900000, worst.tris);
    PT.check('stress: many reactions fired', rx >= 20, rx);
    const progs1 = g.renderer.info.programs.length;
    PT.check('programs count does not grow during the reaction stress fight', progs1 === progs0, [progs0, progs1]);
    for (const p of pods) C.unregisterObject(p);
  });

    PT.check('stress page: no console errors', pgs.errors().length === 0, pgs.errors().slice(0, 6));
  }
  await pgs.close();

  // ------------------------------------------------------------ check 11 with REAL casts (CONTRACT §21 / DESIGN §12):
  // the endgame loadout cast through skills.cast (projectiles, zones, summons, beams, decals, domes) on 12 enemies,
  // 8 skills in 2 s, in the village and on the plains; the worst frame must stay under the hard ceiling
  const pgc = await PT.boot('&cls=mage&skills=preset:endgame_mage&level=30');
  if (pgc.ready) {
    await pgc.run('real-cast stress perf', () => {
      const g = game, S = g.skills;
      const spots = { village: [[-6, 128], 290], plains: [[-6, 20], 300] };
      for (const k in spots) {
        const [[x, z], target] = spots[k];
        g.debug.tp({ x, z }); PT.step(1);
        const ring = PT.dummyRing(12, 7, { aggro: true, hp: 1e6 });
        const ids = g.progression.learnedSkills().filter((i) => !['finisher', 'basic'].includes(S.defs.get(i)?.slot)).slice(0, 8);
        let worst = { calls: 0, tris: 0 }, n = 0;
        for (const id of ids) {
          S.resetCooldowns(); PT.heal();
          const pp = g.player.object.position, o = pp.clone(); o.y += 1.5;
          const d = ring[n++ % ring.length], t = d.object.position.clone();
          try { S.cast(id, { free: true, aim: { origin: o, dir: t.clone().sub(o).normalize(), point: t, target: d } }); } catch (_) { /* */ }
          PT.step(0.25);
          const st = PT.frameStats(); if (st.calls > worst.calls) worst = { ...st, after: id };
          if (st.tris > (worst.trisMax || 0)) worst.trisMax = st.tris;
        }
        PT.note(`${k} real-cast stress: worst ${worst.calls} calls (after ${worst.after}; scene target ${target}), max ${worst.trisMax} tris`);
        PT.check(`${k} real-cast stress: draw calls ≤ 350`, worst.calls <= 350, worst);
        PT.check(`${k} real-cast stress: triangles ≤ 900k`, (worst.trisMax || 0) <= 900000, worst.trisMax);
        for (const d of ring) { d.alive = false; try { g.combat.unregister(d); } catch (_) { /* */ } d.object?.removeFromParent?.(); }
        PT.step(3);
      }
    });
    PT.check('real-cast stress page: no console errors', pgc.errors().length === 0, pgc.errors().slice(0, 6));
  }
  await pgc.close();


  // ------------------------------------------------------------ boot with skills stubbed / legacy path (combat must not care)
  const pg2 = await PT.boot('&cls=sword&path=all');
  PT.check('legacy boot (path=all) ready', pg2.ready);
  if (pg2.ready) {
    await pg2.run('legacy applyStatus signature', () => {
      const g = game, C = g.combat, T = g.THREE;
      const pp = g.player.object.position;
      const d = g.debug.spawnDummy(new T.Vector3(pp.x, pp.y, pp.z - 6), { hp: 1e6 });
      C.clearStatus(d);
      C.applyStatus(d, 'chilled', 3);
      const r = C.dealDamage(d, { amount: 10, element: 'fire', source: 'player', point: C.getCenter(d, new T.Vector3()) });
      PT.check('legacy applyStatus(t, name, seconds) still makes an aura → melt', r.reaction === 'melt', r.reaction);
      PT.step(0.5);
    });
    PT.check('legacy boot: no console errors', pg2.errors().length === 0, pg2.errors().slice(0, 6));
  }
  await pg2.close();
};
