// playtest3 section: enemies (CONTRACT §14, §15, §21 check 10). Owned by enemies.
// Regular enemies (new mobs, renamed mobs, scaling, XP, encounters), threat (taunt / stealth / aggro queries), projectile
// blocking, run stats, the golem changes, and every boss (&boss=<id> boot, prewarm first, debugPhase, debugDefeat,
// programs constant, draw-call budget), the nidhoggra lock table and the gift API.
const fs = require('fs'); const path = require('path');

const BOSSES = ['hydra', 'nox', 'treant', 'kalis', 'nidhoggra'];
const BUDGET = { hydra: 20, nox: 20, treant: 20, kalis: 20, nidhoggra: 40 };

module.exports = async function enemies(PT) {
  // ------------------------------------------------------------ static: rules 7 / 8 / 9 on the enemies files
  {
    const files = ['src/enemies.js'];
    const walk = (d) => { for (const f of fs.readdirSync(path.join(PT.root, d))) { const p = d + '/' + f; if (fs.statSync(path.join(PT.root, p)).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p); } };
    walk('src/enemies');
    const bad8 = [], bad9 = [], bad7 = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(PT.root, f), 'utf8').split('\n');
      src.forEach((l, i) => {
        if (/=== ?'(sword|mage)'/.test(l)) bad8.push(`${f}:${i + 1}`);
        if (/for \(let \w+ = 0; \w+ < 5;/.test(l) || /\['fire', 'ice', 'lightning', 'wind', 'earth'\]/.test(l)) bad9.push(`${f}:${i + 1}`);
        const m = /^\s*import\s.*from\s+'([^']+)'/.exec(l);
        if (m) {
          const spec = m[1];
          const resolved = spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(f), spec)) : spec;
          const ok = spec === 'three' || spec.startsWith('three/addons/') || resolved.startsWith('src/core/') || resolved.startsWith('src/enemies/') || resolved === 'src/enemies.js';
          if (!ok) bad7.push(`${f}:${i + 1} ${spec}`);
        }
      });
    }
    PT.check('rule 7: enemies files import only own files, src/core/* and three', bad7.length === 0, bad7);
    PT.check('rule 8: no class literals in enemies files', bad8.length === 0, bad8);
    PT.check('rule 9: no 5-element loops/arrays in enemies files', bad9.length === 0, bad9);
    const enemiesSrc = fs.readFileSync(path.join(PT.root, 'src/enemies.js'), 'utf8');
    PT.check('bosses load only through a dynamic import', /import\('\.\/enemies\/bosses\/index\.js'\)/.test(enemiesSrc) && !/^import .*bosses\//m.test(enemiesSrc));
    PT.check('enemies no longer emit victory', !/emit\('victory'/.test(enemiesSrc));
  }

  const pg = await PT.boot('&cls=mage');
  PT.check('boot: ready', pg.ready);
  if (!pg.ready) { await pg.close(); return; }

  // ------------------------------------------------------------ new mobs, renamed mobs, scaling, XP
  await pg.run('mobs', async () => {
    const g = game, E = g.enemies, T = g.THREE;
    const pp = g.player.object.position.clone();
    const mk = (type, opts, dx = 0) => E.spawn(type, new T.Vector3(pp.x + 30 + dx, 0, pp.z + 30), opts);
    const NAMES = { lizard: '수렁도마뱀', shroom: '포자 버섯병', wolf: '타락 늑대', wraith: '공허 망령', voidknight: '공허 기사' };
    const BASE = { lizard: 160, shroom: 120, wolf: 110, wraith: 140, voidknight: 420 };
    const made = [];
    for (const t in NAMES) {
      const e = mk(t, { zoneId: 'mirwen' }, made.length * 3);
      made.push(e);
      PT.check(`${t}: spawns with Korean name`, e && e.name === NAMES[t], e?.name);
      const s = E.scaling('mirwen');
      PT.check(`${t}: HP = base × zone row`, e && e.maxHp === Math.round(BASE[t] * s.hpMul), [e?.maxHp, BASE[t], s.hpMul]);
      PT.check(`${t}: zoneDmgMul / zoneLevel set`, e && e.zoneDmgMul === s.dmgMul && e.zoneLevel === s.level, [e?.zoneDmgMul, e?.zoneLevel]);
    }
    PT.check('wraith voidShield 60', made[3].voidShield === 60);
    PT.check('voidknight: elite, voidShield 100, breakMax 60, xp 90', made[4].isElite && made[4].voidShield === 100 && made[4].breakMax === 60 && made[4].xpValue === 90, [made[4].voidShield, made[4].breakMax, made[4].xpValue]);
    PT.check('lizard resists water 0.5', made[0].resist?.water === 0.5);
    PT.check('Act-2 mob XP 35 (first region)', made[0].xpValue === 35 && made[1].xpValue === 35, made.map((m) => m.xpValue));
    // renamed mobs (ids unchanged)
    const chu = mk('chuchu', {}, 20), boko = mk('bokoblin', {}, 23), sha = mk('shaman', {}, 26);
    PT.check('renamed: 말랑이 / 뿔도깨비 / 도깨비 주술사', chu.name === '말랑이' && boko.name === '뿔도깨비' && sha.name === '도깨비 주술사', [chu.name, boko.name, sha.name]);
    PT.check('XP: 말랑이 6, 뿔도깨비 15, 주술사 25', chu.xpValue === 6 && boko.xpValue === 15 && sha.xpValue === 25, [chu.xpValue, boko.xpValue, sha.xpValue]);
    PT.check('Act-1 zoneLevel ≥ 1 (default 1)', chu.zoneLevel >= 1 && boko.zoneLevel >= 1);
    const vs = ['water', 'nature', 'light', 'shadow'].map((el, i) => mk('chuchu', { element: el }, 30 + i * 2));
    PT.check('말랑이 variants water/nature/light/shadow', vs.every((v, i) => v.element === ['water', 'nature', 'light', 'shadow'][i] && /말랑이/.test(v.name)), vs.map((v) => v.name));
    const dm = mk('dummy', {}, 40);
    PT.check('dummy xpValue 0', dm.xpValue === 0);
    // scaling rows (DESIGN §5.3) + the second region uses the Act 3 row via story.regionOrder
    const r = (z) => E.scaling(z);
    PT.check('rows: act1 1/1, ascent 3.4/2.2, plateau 3.6/2.4', r('plains').hpMul === 1 && r('plains').dmgMul === 1 && r('ascent').dmgMul === 2.2 && Math.abs(r('ascent').hpMul - 3.4) < 1e-9 && r('plateau').dmgMul === 2.4, [r('plains'), r('ascent'), r('plateau')]);
    const S = g.story; const hadOrder = S ? S.regionOrder : undefined;
    let ok2 = null;
    if (S) {
      try { S.regionOrder = ['elderwood']; } catch (_) { /* getter-only */ }
      if (Array.isArray(S.regionOrder) && S.regionOrder[0] === 'elderwood') {
        ok2 = r('mirwen').dmgMul === 1.9 && r('elderwood').dmgMul === 1.5 && r('mirwen').level === 15;
        PT.check('second region (mirwen after elderwood) uses the Act 3 row', ok2, [r('mirwen'), r('elderwood')]);
      } else PT.skip('second region row', 'story.regionOrder not writable');
      try { S.regionOrder = hadOrder; } catch (_) { /* */ }
    } else PT.skip('second region row', 'no story');
    PT.check('first region defaults to the Act 2 row', r('mirwen').dmgMul === 1.5 || ok2 === null || (S && S.regionOrder?.[0] === 'elderwood'));
    // difficulty multiplies HP on top (DESIGN §16); damage difficulty is left to combat
    const dOld = g.difficulty;
    g.difficulty = { hpMul: 1.3, dmgMul: 1.25, telegraphMul: 1 };
    PT.check('hard: hpMul ×1.3, zoneDmgMul unchanged', Math.abs(r('mirwen').hpMul - (r('mirwen').row === 'act3' ? 2.8 : 1.9) * 1.3) < 1e-9 && r('mirwen').dmgMul !== 1.25 * 1.5, r('mirwen'));
    g.difficulty = dOld;
    PT.step(1.5);
    PT.check('new mobs update without throwing', made.every((m) => !m._errLogged));
    for (const e of [...made, chu, boko, sha, ...vs, dm]) E.remove(e);
    PT.step(0.1);
  });

  // ------------------------------------------------------------ v4 (PLAN §7.9): §4 windups measured tellStart → damage
  await pg.run('v4 windups', () => {
    const g = game, E = g.enemies, T = g.THREE;
    g.debug.tp?.('plains'); PT.step(0.5);
    const pp = g.player.object.position;
    const hurt = [], starts = [];
    const o1 = g.events.on('tellStart', (p) => starts.push({ et: g.enemyTime, p })), o2 = g.events.on('playerHurt', (p) => hurt.push({ et: g.enemyTime, p }));
    const rows = [];
    for (const [type, id, want, dist] of [['bokoblin', 'bokoblin.swing', 0.80, 2.2], ['lizard', 'lizard.thrust', 0.80, 2.2], ['voidknight', 'voidknight.combo1', 0.80, 2.2]]) {
      hurt.length = 0; starts.length = 0;
      const e = E.spawn(type, new T.Vector3(pp.x, 0, pp.z - dist), {});
      e.ptArmor = true; e.aggro = true; e.summoned = true; e.facing = 0;   // summoned: no village give-up
      PT.step(0.05);
      e.debugAttack(id);
      for (let i = 0; i < 120 && !hurt.some((h) => h.p.attackId === id); i++) { g.step(1, 1 / 60); PT.heal(); }
      const s0 = starts.find((r) => r.p.id === id), h0 = hurt.find((r) => r.p.attackId === id);
      rows.push({ id, lead: s0 && h0 ? +(h0.et - s0.et).toFixed(3) : null, want });
      E.remove(e); PT.step(0.6); PT.heal();
    }
    o1(); o2();
    g.debug.tp?.('village'); PT.step(0.5);
    PT.check('§4 windups: tellStart → damage at the v4 numbers (normal difficulty)', rows.every((r) => r.lead !== null && Math.abs(r.lead - r.want) < 0.04), rows);
  });

  // ------------------------------------------------------------ threat: taunt, stealth, aggro queries
  await pg.run('threat', () => {
    const g = game, E = g.enemies, T = g.THREE;
    const pp = g.player.object.position;
    const e = E.spawn('bokoblin', new T.Vector3(pp.x + 5, 0, pp.z + 5), {});
    e.aggro = true; e.setState('chase');
    PT.step(0.3);
    PT.check('without taunt the target is the player', E.getThreatTarget(e) === g.player.entity && e.target === g.player.entity);
    const ally = { id: 'ptAlly', team: 'player', alive: true, hp: 500, maxHp: 500, object: new T.Object3D(), radius: 0.5, height: 1.6, statuses: {}, velocity: new T.Vector3() };
    ally.object.position.set(pp.x + 8, pp.y, pp.z + 9); g.scene.add(ally.object);
    E.setTauntTarget(ally, 5);
    PT.step(0.5);
    PT.check('taunt: getThreatTarget → the taunt entity', E.getThreatTarget(e) === ally);
    PT.check('taunt: the enemy AI retargets (e.target)', e.target === ally);
    const d0 = e.object.position.distanceTo(ally.object.position);
    PT.step(1.0);
    PT.check('taunt: the enemy moves toward the taunt entity', e.object.position.distanceTo(ally.object.position) < d0 + 0.01, [d0, e.object.position.distanceTo(ally.object.position)]);
    ally.alive = false; PT.step(0.2);
    PT.check('dead taunt entity → back to the player', E.getThreatTarget(e) === g.player.entity);
    E.clearTauntTarget(); g.scene.remove(ally.object);
    PT.check('anyAggroWithin sees the aggroed enemy', E.anyAggroWithin(pp, 30) === true);
    E.setPlayerStealth(0, 3); PT.step(0.1);
    PT.check('stealth 0: enemies lose track', e.aggro === false && E.anyAggroWithin(pp, 30) === false);
    E.setPlayerStealth(false);
    E.remove(e);
    const d = g.debug.spawnDummy(new T.Vector3(pp.x + 3, pp.y, pp.z), {}); d.debugAggro = true; d.aggro = true;
    PT.check('anyAggroWithin counts debugAggro dummies', E.anyAggroWithin(pp, 30) === true);
    E.remove?.(d);
    const rs = E.getRunStats();
    PT.check('getRunStats {kills, time, maxCombo, reactions}', ['kills', 'time', 'maxCombo', 'reactions'].every((k) => typeof rs[k] === 'number'), rs);
    PT.check('bosses.gift is inert without the final boss', E.bosses?.gift && E.bosses.gift.ready === false && E.bosses.gift.use() === false);
  });

  // ------------------------------------------------------------ projectiles honour world.projectileBlockAt
  await pg.run('projectile block', () => {
    const g = game, W = g.world, T = g.THREE, E = g.enemies;
    if (!W.addTempCollider || !W.projectileBlockAt) { PT.skip('projectile block', 'world.addTempCollider missing'); return; }
    const pp = g.player.object.position;
    const sh = E.spawn('shaman', new T.Vector3(pp.x, 0, pp.z - 12), { element: 'fire' });
    sh.aggro = true;
    const h = W.addTempCollider({ shape: 'box', pos: new T.Vector3(pp.x, pp.y - 1, pp.z - 5), size: new T.Vector3(10, 12, 1), h: 12, yaw: 0, life: 10, blocksProjectiles: true, blocksMovement: false, onProjectile: () => 'block' });
    PT.resetCounts('playerHurt');
    const hp0 = g.player.hp;
    // force one cast: the orb homes on the player straight through the wall's line
    sh.setState('cast'); PT.step(2.0);
    PT.check('collider blocks the orb (no player hit through the wall)', PT.countEvents('playerHurt') === 0 && g.player.hp >= hp0 - 0.01, { hurt: PT.countEvents('playerHurt'), hp0, hp: g.player.hp });
    W.removeCollider?.(h); E.remove(sh);
  });

  // ------------------------------------------------------------ golem: bossDefeated {id:'golem', final:false}, never victory
  await pg.run('golem', () => {
    const g = game, E = g.enemies;
    PT.resetCounts('victory');
    let spawn = null, def = null;
    const o1 = g.events.on('bossSpawn', (p) => { spawn = p; }), o2 = g.events.on('bossDefeated', (p) => { def = p; });
    const b = E.spawnBoss('golem');
    PT.check('golem spawns (prewarmed at init)', !!b && b.kind === 'golem' && E.isPrewarmed('golem'));
    PT.check('bossSpawn payload extended', spawn?.id === 'golem' && /[가-힣]/.test(spawn?.name || '') && Array.isArray(spawn?.phases) && spawn.boss === b, spawn && { id: spawn.id, name: spawn.name, phases: spawn.phases });
    PT.step(4);
    E.debugDefeat();
    PT.step(2);
    PT.check('bossDefeated {id:golem, final:false}', def?.id === 'golem' && def.final === false && def.name === b.name, def && { id: def.id, final: def.final });
    PT.step(5);
    PT.check('no victory event from enemies', PT.countEvents('victory') === 0);
    o1(); o2();
  });

  // ------------------------------------------------------------ encounters: lazy spawn per zone, ≤ 18 alive, despawn > 120 m
  await pg.run('encounters', () => {
    const g = game, E = g.enemies, W = g.world;
    if (!W.zones?.length) { PT.skip('encounters', 'no world zones'); return; }
    const alive = () => E.all.filter((e) => e.alive && !e.isDummy && !e.isBoss && e.encounter).length;
    E.encounters.load('elderwood');
    g.debug.tp('elderwood'); PT.step(1.5);
    const n = alive();
    PT.check('elderwood encounters spawn when the player is near', n > 0, n);
    PT.check('≤ 18 regular enemies alive', E.all.filter((e) => e.alive && !e.isDummy && !e.isBoss).length <= 18);
    const ew = E.all.filter((e) => e.encounter && e.alive);
    PT.check('encounter enemies carry zone scaling', ew.every((e) => e.zoneId === 'elderwood' && e.zoneDmgMul > 1), ew.map((e) => [e.kind, e.zoneDmgMul]));
    g.debug.tp('village'); PT.step(1.5);
    PT.check('despawned beyond 120 m', alive() === 0, alive());
    const ob = E.getObjective();
    PT.check('getObjective shape', ['phase', 'campsCleared', 'campsTotal', 'groupsLeft'].every((k) => k in ob), Object.keys(ob));
  });

  // ------------------------------------------------------------ nidhoggra lock table (DESIGN §8.6)
  await pg.run('lock table', async () => {
    const m = await import('/src/enemies/bosses/nidhoggra.js');
    const tab = m.lockCoverageTable();
    const ids = Object.keys(tab);
    PT.check('lock table: 5 locks per phase, counters are elements', m.NIDHOGGRA_LOCKS.phase1.length === 5 && m.NIDHOGGRA_LOCKS.phase2.length === 5
      && [...m.NIDHOGGRA_LOCKS.phase1, ...m.NIDHOGGRA_LOCKS.phase2].every((L) => L.counters.every((c) => game.elements.list.includes(c)) && /[가-힣]/.test(L.nameKo)));
    PT.check('every class opens ≥ 4 of 5 locks per phase', ids.length === 6 && ids.every((c) => tab[c].p1 >= 4 && tab[c].p2 >= 4), tab);
    PT.check('with primaries only every class opens ≥ 2 per phase', ids.every((c) => tab[c].p1Primary >= 2 && tab[c].p2Primary >= 2), tab);
  });
  const mainErr = pg.errors();
  PT.check('no console errors (main page)', mainErr.length === 0, mainErr.slice(0, 5));
  await pg.close();

  // ------------------------------------------------------------ check 10: each boss via &boss=<id>
  for (const id of BOSSES) {
    const bp = await PT.boot(`&cls=mage&level=20&boss=${id}`);
    if (!bp.ready) { PT.check(`${id}: boot`, false); await bp.close(); continue; }
    await bp.run(id, async (arg) => {
      const { id, budget } = arg;
      const g = game, E = g.enemies;
      const b = E.boss;
      PT.check('spawned via &boss=', !!b && b.bossId === id, b?.bossId);
      if (!b) return;
      PT.check('prewarmBoss done first', E.isPrewarmed(id));
      const again = await E.prewarmBoss(id);
      PT.check('prewarmBoss idempotent', again === true);
      PT.check('Korean name/title', /[가-힣]/.test(b.name) && /[가-힣]/.test(b.title || ''), [b.name, b.title]);
      PT.check('boss xp / zone fields', b.xpValue >= 0 && b.zoneLevel >= 1 && b.zoneDmgMul >= 1);
      const A = g.world.bossArenas[id];
      PT.tp(A.position.x + 6, A.position.z + 6); PT.heal();
      PT.step(1);
      const s0 = PT.frameStats();
      // draw calls owned by the boss (visible meshes in its model trees)
      let calls = 0;
      const count = (root) => root?.traverseVisible?.((o) => { if (o.isMesh || o.isSprite || o.isInstancedMesh) calls++; });
      count(b.object); if (b.modelRoot && b.modelRoot !== b.object) count(b.modelRoot);
      PT.check(`draw-call budget ≤ ${budget}`, calls <= budget, calls);
      let phaseEv = null; const o1 = g.events.on('bossPhase', (p) => { if (p.id === id) phaseEv = p; });
      const before = b.phase;
      b.debugPhase(2); PT.step(3);
      PT.check('debugPhase(2) works', phaseEv && phaseEv.phase === 2 && /[가-힣]/.test(phaseEv.name || ''), phaseEv && { phase: phaseEv.phase, name: phaseEv.name, before });
      PT.step(2); PT.heal();
      const s1 = PT.frameStats();
      PT.check('programs constant after spawn + phase change', s1.programs === s0.programs, [s0.programs, s1.programs]);
      PT.check('calls ≤ 350, tris ≤ 900k', s1.calls <= 350 && s1.tris <= 900000, s1);
      if (id === 'nidhoggra') {
        PT.check('world boss-fight LOD on', g.world.bossFightLOD !== false);
        const G = E.bosses.gift;
        PT.check('gift API shape', G && typeof G.use === 'function' && 'ready' in G && 'charges' in G && 'element' in G && 'purpose' in G);
      }
      PT.resetCounts('bossDefeated'); PT.resetCounts('victory');
      let def = null; const o2 = g.events.on('bossDefeated', (p) => { def = p; });
      g.debug.killBoss();
      PT.step(6);
      PT.check('debugDefeat → bossDefeated {id, final}', def && def.id === id && def.final === (id === 'nidhoggra') && /[가-힣]/.test(def.name || ''), def && { id: def.id, final: def.final, name: def.name });
      PT.check('bossDefeated exactly once, no victory from enemies', PT.countEvents('bossDefeated') === 1 && PT.countEvents('victory') === 0, [PT.countEvents('bossDefeated'), PT.countEvents('victory')]);
      PT.step(4);
      PT.check('boss removed after the dissolve', !E.boss || E.boss.defeated);
      o1(); o2();
    }, { id, budget: BUDGET[id] });
    const errs = bp.errors();
    PT.check(`${id}: no console errors`, errs.length === 0, errs.slice(0, 4));
    await bp.close();
  }

  // ------------------------------------------------------------ nidhoggra mechanics: locks, gift, rods, shards, tide
  const np = await PT.boot('&cls=mage&level=25&boss=nidhoggra');
  if (np.ready) {
    await np.run('nidhoggra mechanics', () => {
      const g = game, E = g.enemies, b = E.boss;
      if (!b || b.bossId !== 'nidhoggra') { PT.skip('mechanics', 'no boss'); return; }
      const A = g.world.bossArenas.nidhoggra;
      PT.tp(A.position.x, A.position.z + 14); PT.heal(); PT.step(1.5);
      const plate = b.plate;
      PT.check('phase 1: the head plate carries a lock', plate.lock && plate.lock.counters.length > 0 && plate.lock.gauge === 100, plate.lock);
      const G = E.bosses.gift;
      PT.check('gift ready for the plate lock', G.ready && G.purpose === 'lock' && G.charges === 1, { ready: G.ready, purpose: G.purpose, charges: G.charges });
      PT.resetCounts('giftUsed');
      PT.check('V strips 50 %', G.use() === true && Math.abs(plate.lock.gauge - 50) < 0.01 && PT.countEvents('giftUsed') === 1, plate.lock.gauge);
      PT.check('one gift charge per lock', G.use() === false);
      // a counter hit strips the rest; the strip comes from a counter
      let strip = null; const off = g.events.on('lockStripped', (p) => { strip = p; });
      const el = plate.lock.counters[0];
      for (let i = 0; i < 12 && plate.lock.gauge > 0; i++) g.combat.dealDamage(plate, { amount: 60, element: el, source: 'player', noReaction: true, poise: 30 });
      PT.check('counter hits strip the lock → lockStripped', strip && strip.partId === 'headPlate' && plate.lock.gauge === 0, strip && { by: strip.by, gauge: plate.lock.gauge });
      off();
      // the 66 % lightning-rod check
      PT.resetCounts('bossCheck');
      let chk = []; const off2 = g.events.on('bossCheck', (p) => chk.push(p.kind + ':' + p.state));
      b.hp = Math.round(b.maxHp * 0.66); PT.step(0.6);
      PT.check('rods check starts at 66 %', chk.includes('rods:start'), chk);
      for (const r of b.rodsList) g.combat.dealDamage(r, { amount: 5, element: 'fire', source: 'player', noReaction: true });
      PT.step(0.3);
      PT.check('hitting the 3 rods → success', chk.includes('rods:success'), chk);
      PT.step(7.5);
      PT.check('phase 2 after the stagger', b.phase === 1, b.phase);
      // phase 2: shard windows (the first opens 4 s after the transition); break them all → the tide check
      PT.step(8);
      const s = b.shards.find((q) => !q.part.invulnerable);
      PT.check('a shard window opens (vulnerable, beside a pillar top)', !!s && s.pos.y > A.position.y + 8, s && s.pos.y);
      for (const q of b.shards) { q.part.invulnerable = false; g.combat.dealDamage(q.part, { amount: q.part.hp + 10, fixed: true, element: q.L.counters[0], source: 'player', noReaction: true }); }
      PT.step(1);
      PT.check('all shards broken → tide check', b.shards.every((q) => q.broken) && chk.includes('tide:start'), chk);
      g.combat.addBreak?.(b, 999); PT.step(0.5);
      PT.check('tide check broken → success → the heart phase', chk.includes('tide:success') && b.phase === 2, [chk, b.phase]);
      PT.step(4);
      PT.check('heart open, spear gift ready', b.heartPart.invulnerable === false && G.purpose === 'spear' && G.charges === 3, { inv: b.heartPart.invulnerable, purpose: G.purpose, charges: G.charges });
      off2();
    });
    const errs = np.errors();
    PT.check('nidhoggra mechanics: no console errors', errs.length === 0, errs.slice(0, 4));
    await np.close();
  }
};
