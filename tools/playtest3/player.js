// playtest3 section: player (CONTRACT §21 check 7 + §10 acceptance). Owned by player.
// Runs with the other modules present or stubbed: checks that need a later-wave owner are SKIPped, never faked.
//   • static: rule 8/9 grep on player files (class literals only in player/kits.js, no i<5 loops)
//   • check 7 (regen, asserted on debug.regenState()): combat delay 5 → no rise at 4.5 s, rise at 5.5 s; out of combat 3.5 s;
//     a hit in between resets, a fully blocked / dodged hit does not, a DoT tick does; blessed (light.sanctuary) delay 2.5;
//     boss HoT cap ≤ 5 %/s
//   • per class: weapon prop shown, dodge (Q) and defend (E) behave per kit, resources (MP / 투지 / stamina) stat-driven
//   • player.mods getter view, stat-driven max keeps the percentage, platforms / clampToBounds, cast kinds, perf of the rig
const fs = require('fs'); const path = require('path');

const CLASSES = ['mage', 'sword', 'ranger', 'paladin', 'spiritcaller', 'shadowblade'];

module.exports = async function player(PT) {
  // ------------------------------------------------------------ static: rule 8 / rule 9
  {
    const files = ['src/player.js', ...fs.readdirSync(path.join(PT.root, 'src/player')).map((f) => 'src/player/' + f)];
    const bad = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(PT.root, f), 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (f !== 'src/player/kits.js' && /=== ?'(sword|mage)'/.test(l)) bad.push(`${f}:${i + 1}`);
        if (/for \(let \w+ = 0; \w+ < 5;/.test(l)) bad.push(`${f}:${i + 1} (i<5)`);
        if (/ELEMENT_COLORS|ELEMENTS\b/.test(l) && !/ALL_ELEMENTS/.test(l)) bad.push(`${f}:${i + 1} (legacy element map)`);
      });
    }
    PT.check('rule 8/9: no class literals outside kits.js, no 5-element maps in player files', bad.length === 0, bad);
  }

  // ------------------------------------------------------------ check 7: HP regen (mage)
  {
    const pg = await PT.boot('&cls=mage');
    PT.check('regen boot: ready', pg.ready);
    if (pg.ready) {
      await pg.run('regen', () => {
        const g = game, pl = g.player, D = g.debug;
        // advance GAME time by sec (hitstop / time scale make real steps uneven)
        const stepGame = (sec) => { const t0 = g.time; let n = 0; while (g.time - t0 < sec - 1e-6 && n++ < 4000) g.step(1, 1 / 60); };
        const full = () => { pl.hp = pl.maxHp; };
        const unaggro = () => { for (const e of g.entities) if (e && e.isDummy) { e.aggro = false; e.debugAggro = false; e.alert = false; } };
        PT.check('player.regen is the reused state object', D.regenState() === pl.regen && D.regenState() === pl.regen);
        // --- in combat: delay 5
        full(); stepGame(0.2);
        D.hurt(30, { combat: true });
        const h0 = pl.hp;
        stepGame(0.1);
        let s = D.regenState();
        PT.check('hurt + aggro dummy → inCombat', s.inCombat === true, { ...s });
        PT.check('in-combat delay = 5', Math.abs(s.delay - 5) < 1e-6, s.delay);
        stepGame(4.35);
        PT.check('in combat: HP does not rise at 4.5 s', pl.hp <= h0 + 1e-6, { hp: pl.hp, h0, s: { ...D.regenState() } });
        stepGame(1.0);
        PT.check('in combat: HP rises at 5.5 s', pl.hp > h0, { hp: pl.hp, h0 });
        PT.check('in-combat rate 1.5 %/s', Math.abs(D.regenState().rate - 0.015 * (g.difficulty?.id === 'hard' ? 0.8 : 1)) < 1e-6, D.regenState().rate);
        // --- out of combat: delay 3
        unaggro(); full(); stepGame(3.2);
        D.hurt(30, { combat: false });
        const h1 = pl.hp;
        stepGame(0.1);
        PT.check('no aggro → inCombat right after the hit (hurt < 3 s)', D.regenState().inCombat === true);
        stepGame(2.3);
        PT.check('out of combat: no rise at 2.4 s', pl.hp <= h1 + 1e-6, { hp: pl.hp, h1, s: { ...D.regenState() } });
        stepGame(1.1);
        PT.check('out of combat: HP rises at 3.5 s', pl.hp > h1, { hp: pl.hp, h1, s: { ...D.regenState() } });
        PT.check('out-of-combat rate 8 %/s', Math.abs(D.regenState().rate - 0.08) < 1e-6 && D.regenState().inCombat === false, { ...D.regenState() });
        // --- a hit in between resets the timer
        full(); stepGame(3.2);
        D.hurt(20); stepGame(2.0);
        D.hurt(20); const h2 = pl.hp;
        stepGame(2.0);
        PT.check('a second hit resets the timer (no rise 2 s after it, 4 s after the first)', pl.hp <= h2 + 1e-6, { hp: pl.hp, h2 });
        stepGame(1.6);
        PT.check('…and regen starts 3.5 s after the second hit', pl.hp > h2, { hp: pl.hp, h2 });
        // --- a fully dodged (i-frame) hit does not reset
        full(); stepGame(3.2);
        D.hurt(20); const h3 = pl.hp; const lh = pl.lastHurtT;
        stepGame(1.5);
        g.input.simulate({ keys: { KeyQ: true } }); g.step(1, 1 / 60); g.input.simulate(null);
        const ifr = pl.debugState().dodgeIframeT;
        const hpBeforeDodged = pl.hp;
        D.hurt(20);
        PT.check('blink i-frames active', ifr > 0, pl.debugState());
        PT.check('a dodged hit deals no damage', pl.hp === hpBeforeDodged, { hp: pl.hp, hpBeforeDodged });
        PT.check('a dodged hit does not move lastHurtT', pl.lastHurtT === lh, { lastHurtT: pl.lastHurtT, lh });
        stepGame(1.7);
        PT.check('regen still starts 3.2 s after the first hit', pl.hp > h3, { hp: pl.hp, h3 });
        // --- a DoT tick resets
        full(); stepGame(3.2);
        D.hurt(20); stepGame(2.5);
        const lh2 = pl.lastHurtT;
        D.hurt(3, { dot: true });
        PT.check('a DoT tick resets the timer', pl.lastHurtT > lh2, { lastHurtT: pl.lastHurtT, lh2 });
        // --- blight / regenDisabled
        full(); stepGame(3.2); D.hurt(20); g.stats.set('pt:noregen', { regenDisabled: true });
        const h4 = pl.hp; stepGame(4);
        PT.check('stats.regenDisabled stops regen', pl.hp <= h4 + 1e-6 && D.regenState().active === false);
        g.stats.clear('pt:noregen'); stepGame(0.5);
        PT.check('regen resumes when the flag clears', pl.hp > h4);
        // --- events
        PT.check('hpRegenStart / hpRegenStop emitted', PT.countEvents('hpRegenStart') > 0 && PT.countEvents('hpRegenStop') > 0,
          { start: PT.countEvents('hpRegenStart'), stop: PT.countEvents('hpRegenStop') });
      });
      // blessed zone: light.sanctuary (skills/magic) or the world blessed surface → in-combat delay 2.5
      await pg.run('regen blessed', () => {
        const g = game, pl = g.player, D = g.debug;
        const stepGame = (sec) => { const t0 = g.time; let n = 0; while (g.time - t0 < sec - 1e-6 && n++ < 4000) g.step(1, 1 / 60); };
        pl.hp = pl.maxHp;
        D.hurt(20, { combat: true });
        let how = null;
        if (g.skills && !g.skills.isStub && g.skills.defs?.has?.('light.sanctuary')) {
          g.progression.debug.ungate = true;
          D.cast('light.sanctuary', { noAttune: false }); stepGame(0.3);
          if (g.spells?.api?.zones?.isInside?.('holy', pl.object.position)) how = 'light.sanctuary';
        }
        if (!how && g.world?.surface2?.bless) { g.world.surface2.bless(pl.object.position, 6, 1); stepGame(0.2); if (g.world.surface2.isBlessed(pl.object.position)) how = 'surface2.bless'; }
        if (!how) {
          PT.skip('blessed delay 2.5 (light.sanctuary)', 'no holy zone (skills/magic) and no world.surface2 yet');
          // player-side logic only, with a labelled test double for world.surface2.isBlessed
          const W = g.world, had = Object.prototype.hasOwnProperty.call(W, 'surface2'), prev = W.surface2;
          W.surface2 = { isBlessed: () => true };
          stepGame(0.15);
          const s2 = { ...D.regenState() };
          if (had) W.surface2 = prev; else delete W.surface2;
          PT.check('blessed logic (test double): in-combat delay 5 × 0.5 = 2.5, rate +1 %/s', s2.inCombat && Math.abs(s2.delay - 2.5) < 1e-6 && Math.abs(s2.rate - 0.025) < 1e-4, s2);
          return;
        }
        stepGame(0.1);
        const s = D.regenState();
        PT.check(`blessed (${how}): in-combat delay = 2.5`, s.inCombat && Math.abs(s.delay - 2.5) < 1e-6, { ...s });
        PT.check(`blessed (${how}): rate +1 %/s`, Math.abs(s.rate - (0.015 + 0.01)) < 1e-4 || s.boss, { ...s });
      });
      // boss HoT cap ≤ 5 %/s (regen + HoT through combat.healPlayer)
      await pg.run('regen boss cap', () => {
        const g = game, pl = g.player;
        if (!g.combat?.healPlayer) { PT.skip('boss HoT cap', 'combat.healPlayer (v3 combat) missing'); return; }
        const stepGame = (sec) => { const t0 = g.time; let n = 0; while (g.time - t0 < sec - 1e-6 && n++ < 4000) g.step(1, 1 / 60); };
        let boss = g.enemies?.boss;
        if (!boss?.alive) { try { g.debug.boss?.('golem'); } catch (_) { /* */ } boss = g.enemies?.boss; }
        if (!boss?.alive || !boss.isBoss) { PT.skip('boss HoT cap', 'no boss could be spawned'); return; }
        const bp = boss.object.position;
        PT.tp(bp.x + 30, bp.z);
        boss.aggro = false;
        pl.hp = pl.maxHp * 0.3;
        stepGame(6);   // past any delay
        // drain the HoT bucket first (combat keeps a small token reserve), then measure 2 s of sustained healing
        for (let i = 0; i < 60; i++) { g.combat.healPlayer(pl.maxHp * 0.02, 'pt_spring', { hot: true }); g.step(1, 1 / 60); }
        const h0 = pl.hp, t0 = g.time;
        for (let i = 0; i < 120; i++) { g.combat.healPlayer(pl.maxHp * 0.02, 'pt_spring', { hot: true }); g.step(1, 1 / 60); }
        const rate = (pl.hp - h0) / pl.maxHp / Math.max(1e-6, g.time - t0);
        PT.check('boss fight: regen + HoT ≤ 5 %/s', rate <= 0.0505, { rate, boss: boss.id || boss.type, s: { ...g.player.regen } });
        PT.check('boss fight: regen rate ×0.6', g.player.regen.boss === true, { ...g.player.regen });
      });
      PT.check('regen: no console errors', pg.errors().length === 0, pg.errors().slice(0, 6));
    }
    await pg.close();
  }

  // ------------------------------------------------------------ per class: weapon, dodge, defend, resources
  for (const cls of CLASSES) {
    const pg = await PT.boot(`&cls=${cls}`);
    PT.check(`${cls}: ready`, pg.ready);
    if (!pg.ready) { await pg.close(); continue; }
    await pg.run(cls, (c) => {
      const g = game, pl = g.player, C = g.classes, def = C.DEFS[c];
      const stepGame = (sec) => { const t0 = g.time; let n = 0; while (g.time - t0 < sec - 1e-6 && n++ < 4000) g.step(1, 1 / 60); };
      const press = (k, holdSec = 0) => { g.input.simulate({ keys: { [k]: true } }); g.step(1, 1 / 60); if (holdSec) stepGame(holdSec); };
      const release = () => { g.input.simulate(null); g.step(1, 1 / 60); };
      const isVisible = (o) => { for (let p = o; p; p = p.parent) { if (!p.visible) return false; if (p === pl.object) return true; } return false; };
      stepGame(0.3);
      // identity, family, style, resource
      PT.check('setClass applied', pl.cls === c && pl.entity.name === def.nameKo, { cls: pl.cls, name: pl.entity.name });
      PT.check('family/style from core classes', pl.family === def.family && pl.style === def.style, { family: pl.family, style: pl.style });
      PT.check('resource', pl.resource === def.resource, pl.resource);
      const D = g.stats.derived();
      PT.check('maxHp from stats.derived()', pl.maxHp === D.maxHp && pl.hp === pl.maxHp, { maxHp: pl.maxHp, D: D.maxHp, hp: pl.hp });
      if (def.resource === 'resolve') {
        PT.check('melee: 투지 100, MP 0', pl.maxResolve === D.maxResolve && pl.maxResolve > 0 && pl.maxMp === 0, { res: pl.maxResolve, mp: pl.maxMp });
        const r0 = pl.resolve;
        PT.check('spendResolve(30)', pl.spendResolve(30) === true && Math.abs(pl.resolve - (r0 - 30)) < 1e-6);
        PT.check('spendResolve over max fails', pl.spendResolve(1e4) === false);
        stepGame(1.0);
        PT.check('투지 regenerates ~6/s', pl.resolve > r0 - 30 + 4.5 && pl.resolve < r0 - 30 + 7.5, pl.resolve);
      } else {
        PT.check('caster: MP from stats (no hard-coded 100)', pl.maxMp === D.maxMp && pl.maxMp === def.base.mp, { mp: pl.maxMp, D: D.maxMp });
        PT.check('spendMp', pl.spendMp(10) === true && pl.spendMp(1e4) === false);
      }
      PT.check('spendStamina', pl.spendStamina(10) === true && pl.spendStamina(1e4) === false);
      // stat-driven max keeps the percentage
      pl.hp = pl.maxHp * 0.5;
      g.stats.set('pt:hp', { maxHpMul: 2 }); stepGame(0.05);
      PT.check('statsChanged: maxHp ×2 keeps 50 %', Math.abs(pl.hp / pl.maxHp - 0.5) < 0.01 && pl.maxHp === Math.round(def.base.hp * 2), { hp: pl.hp, max: pl.maxHp });
      g.stats.clear('pt:hp'); stepGame(0.05); pl.hp = pl.maxHp;
      // player.mods getter view
      g.stats.set('pt:j', { extraJumps: 1, moveMul: 1.2 }); stepGame(0.02);
      PT.check('mods.doubleJump ← stats.extraJumps', pl.mods.doubleJump === true && Math.abs(pl.mods.moveMul - 1.2) < 1e-9);
      g.stats.clear('pt:j'); stepGame(0.02);
      PT.check('mods getters back to defaults', pl.mods.doubleJump === false && pl.mods.moveMul === 1 && pl.mods.atkMul === 1);
      // weapon prop
      const S = pl.classGear.sockets;
      const weaponObj = { staff: pl.rig.staffParts?.[0], bow: S.bow?.grip, hammer: S.hammerBack, daggers: S.daggerSheathed?.[0], totem: pl.rig.totem, longsword: pl.gear.sheathed }[def.style];
      PT.check(`weapon prop (${def.weapon}) visible`, !!weaponObj && isVisible(weaponObj), def.style);
      if (def.offhand === 'shield') PT.check('shield visible', isVisible(S.shield));
      const tip = pl.getWeaponTip('main'), tipOff = pl.getWeaponTip('off');
      const dTip = tip.distanceTo(pl.object.position);
      PT.check('getWeaponTip(main) near the hero', Number.isFinite(dTip) && dTip < 2.6, dTip);
      PT.check('getWeaponTip(off) finite', Number.isFinite(tipOff.x + tipOff.y + tipOff.z));
      if (def.family === 'melee') {
        pl.setSwordDrawn(true); stepGame(0.1);
        const hand = { hammer: S.hammerHand, daggers: S.daggers?.R, longsword: pl.gear.sword }[def.style];
        PT.check('drawn weapon in hand', !!hand && isVisible(hand), def.style);
        if (def.style === 'daggers') PT.check('both daggers drawn', isVisible(S.daggers.L));
        const t2 = pl.getWeaponTip('main');
        PT.check('drawn weapon tip near the hand', t2.distanceTo(pl.object.position) < 2.4, t2.distanceTo(pl.object.position));
        pl.setSwordDrawn(false); stepGame(0.05);
      }
      // dodge (Q)
      const kit = pl.kit;
      PT.check('kit types from kits.js', kit.dodge.type === def.dodge && kit.defend.type === def.defend, { dodge: kit.dodge.type, defend: kit.defend.type, want: [def.dodge, def.defend] });
      stepGame(1.5);
      const p0 = pl.object.position.clone(), st0 = pl.stamina;
      press('KeyQ'); release();
      const ds = pl.debugState();
      PT.check(`dodge ${kit.dodge.type} started`, ds.dodgeT > 0 || ds.dodgeIframeT > 0 || ds.superArmorT > 0, ds);
      PT.check('dodge costs stamina', pl.stamina < st0, { st0, st: pl.stamina });
      if (kit.dodge.type === 'spiritswap') PT.check('spirit swap leaves a decoy', ds.decoyT > 0, ds);
      if (kit.dodge.iframes > 0) {
        const h = pl.hp; g.debug.hurt(15);
        PT.check(`${kit.dodge.type}: i-frames negate a hit`, pl.hp === h, { h, hp: pl.hp });
        if (kit.dodge.type === 'spiritswap') PT.check('the decoy absorbed that hit (one hit only)', pl.debugState().decoyT <= 0, pl.debugState());
      } else if (kit.dodge.superArmor) {
        PT.check('shield step: super armor', pl.superArmor === true);
      }
      stepGame(0.7);
      const moved = pl.object.position.distanceTo(p0);
      PT.check(`dodge moves the hero (≈${kit.dodge.dist} m)`, moved > kit.dodge.dist * 0.45, moved);
      if (kit.dodge.type === 'spiritswap') {
        const h = pl.hp; g.debug.hurt(15);
        PT.check('after the decoy is gone, hits land again', pl.hp < h, { h, hp: pl.hp });
      }
      stepGame(1.2);
      pl.hp = pl.maxHp;
      // defend (E)
      const T = kit.defend.type;
      if (T === 'focus') {
        // ground: aim only (no slow motion); airborne: time ×0.35, compensated movement
        press('KeyE', 0.2);
        PT.check('focus on the ground: no slow motion', !pl.focusing && g.timeScale.value() === 1);
        release();
        press('Space'); g.input.simulate({ keys: { Space: false } }); stepGame(0.15);
        g.input.simulate({ keys: { KeyE: true } }); g.step(3, 1 / 60);
        PT.check('focus airborne: time ×0.35', pl.focusing && Math.abs(g.timeScale.value() - 0.35) < 1e-6, { focusing: pl.focusing, v: g.timeScale.value() });
        PT.check('timeComp = 1/0.35 while focusing', Math.abs(pl.timeComp() - 1 / 0.35) < 1e-3, pl.timeComp());
        const sf = pl.stamina; g.step(30, 1 / 60);
        PT.check('focus drains ~25 stamina/s (real time)', sf - pl.stamina > 9 && sf - pl.stamina < 16, sf - pl.stamina);
        release(); g.step(2, 1 / 60);
        PT.check('focus clears on release', !pl.focusing && g.timeScale.value() === 1, g.timeScale.value());
        PT.check('focusStart / focusEnd events', PT.countEvents('focusStart') >= 1 && PT.countEvents('focusEnd') >= 1);
      } else if (T === 'counter') {
        stepGame(1.2);
        press('KeyE'); release();
        PT.check('counter stance window open', pl.debugState().counterT > 0, pl.debugState());
        // an attacker in front: the hit is negated, the hero ends up behind it with a guaranteed crit
        const pp = pl.object.position;
        const foe = g.debug.spawnDummy(new g.THREE.Vector3(pp.x + Math.sin(pl.facing) * 2.5, pp.y, pp.z + Math.cos(pl.facing) * 2.5), { facing: pl.facing + Math.PI });
        foe.facing = pl.facing + Math.PI;
        const h = pl.hp, before = pp.clone();
        g.combat.dealDamage(pl.entity, { amount: 20, element: 'physical', source: foe, point: foe.object.position.clone() });
        PT.check('counter negates the hit', pl.hp === h, { h, hp: pl.hp });
        PT.check('counter teleports behind the attacker', pl.object.position.distanceTo(before) > 1.5, pl.object.position.distanceTo(before));
        PT.check('counter → next hit crits (stats critChance)', g.stats.get('critChance') >= 1, g.stats.get('critChance'));
      } else {
        press('KeyE', 0.3);
        PT.check(`${T}: blocking while E is held`, pl.blocking === true, pl.debugState());
        const pp = pl.object.position;
        const front = g.debug.spawnDummy(new g.THREE.Vector3(pp.x + Math.sin(pl.facing) * 3, pp.y, pp.z + Math.cos(pl.facing) * 3), {});
        const h = pl.hp;
        g.combat.dealDamage(pl.entity, { amount: 40, element: 'physical', source: front, point: front.object.position.clone() });
        const taken = h - pl.hp;
        const expect = { barrier: 0.2, guard: 0.3, shield: 0.15, ward: 0.4 }[T];
        PT.check(`${T}: frontal hit reduced to ≈${Math.round(expect * 100)} %`, taken > 0 && taken <= 40 * expect + 1.5, { taken });
        if (T === 'ward') {
          const w0 = pl.debugState().wardHp;
          PT.check('ward capacity drains (35 % maxHp)', w0 < pl.maxHp * 0.35 && w0 > 0, { w0, cap: pl.maxHp * 0.35 });
        }
        release(); stepGame(0.6);
        // perfect block (sword guard / paladin shield / mage barrier): pressed just before the hit → no damage
        if (kit.defend.perfect > 0) {
          press('KeyE'); const h2 = pl.hp;
          g.combat.dealDamage(pl.entity, { amount: 40, element: 'physical', source: front, point: front.object.position.clone() });
          PT.check(`${T}: perfect window → parry (no damage)`, pl.hp === h2, { h2, hp: pl.hp });
          release();
        }
      }
      PT.check('getDefenseHud has kit names (Korean)', /[가-힣]/.test(pl.getDefenseHud().dodgeName) && /[가-힣]/.test(pl.getDefenseHud().defendName), pl.getDefenseHud());
      // secondary motion: spring chains animate and stay bounded while sprinting; foot IK stays sane
      g.input.simulate({ keys: { KeyW: true, ShiftLeft: true } }); stepGame(1.0);
      const sp = pl.debugState().springs, ik = pl.debugState().ikDrop;
      g.input.simulate(null); stepGame(0.3);
      PT.check('spring chains active, finite, bounded', sp.active >= 1 && sp.finite && sp.max <= 1.36 && sp.max > 0.01, sp);
      PT.check('foot IK pelvis drop finite (≤ 0.3 m)', Number.isFinite(ik) && ik <= 0 && ik >= -0.3, ik);
      // cast kinds (all + unknown → basic) never throw
      let threw = null;
      for (const k of ['basic', 'heavy', 'ultimate', 'throw', 'slam', 'channel', 'summon', 'buff', 'beam', 'bowDraw', 'bowRelease', 'totemRaise', 'nope']) {
        try { pl.playCast(k, 'water'); g.step(6, 1 / 60); } catch (e) { threw = k + ': ' + e.message; break; }
      }
      PT.check('playCast: every kind (unknown → basic)', !threw, threw);
      stepGame(1.5);
    }, cls);
    PT.check(`${cls}: no console errors`, pg.errors().length === 0, pg.errors().slice(0, 6));
    await pg.close();
  }

  // ------------------------------------------------------------ bounds, platforms, legacy mods writers, rig perf
  {
    const pg = await PT.boot('&cls=paladin');
    if (pg.ready) {
      await pg.run('world/platforms', () => {
        const g = game, pl = g.player, W = g.world, T = g.THREE;
        const stepGame = (sec) => { const t0 = g.time; let n = 0; while (g.time - t0 < sec - 1e-6 && n++ < 4000) g.step(1, 1 / 60); };
        // bounds: a teleport far outside is clamped
        pl.teleport(new T.Vector3(5000, 0, 5000));
        const r = Math.hypot(pl.object.position.x, pl.object.position.z);
        PT.check('clampToBounds keeps the hero inside', r < 400, r);
        PT.tp(0, 110); stepGame(0.3);
        if (typeof W.addPlatform !== 'function') {
          PT.skip('stand-on platform (world)', 'world.addPlatform missing (world wave 1)');
          // player-side logic with a labelled test double: getGroundHeight(x, z, yHint) + platformAt(x, z, y) → {delta}
          const p = pl.object.position, cx = p.x, cz = p.z, top = W.getHeight(cx, cz) + 2;
          const h = { top, delta: new T.Vector3() };
          const origG = W.getGroundHeight, hadPA = 'platformAt' in W, origPA = W.platformAt;
          const on = (x, z) => (x - cx) ** 2 + (z - cz) ** 2 < 4 + (h._dx || 0);
          W.getGroundHeight = function (x, z, y) { const g0 = origG ? origG.call(W, x, z, y) : W.getHeight(x, z); return y !== undefined && y >= top - 1.2 && on(x - (h._ox || 0), z) ? Math.max(g0, top) : g0; };
          W.platformAt = (x, z, y) => (Math.abs(y - top) < 0.05 && on(x - (h._ox || 0), z) ? h : null);
          try {
            pl.teleport(new T.Vector3(cx, top + 1.5, cz), false);
            stepGame(1.0);
            PT.check('platform (test double): lands on top via yHint', Math.abs(pl.object.position.y - top) < 0.05 && pl.grounded, { y: pl.object.position.y, top });
            const x0 = pl.object.position.x;
            for (let i = 0; i < 30; i++) { h.delta.set(0.04, 0, 0); h._ox = (h._ox || 0) + 0.04; g.step(1, 1 / 60); }
            h.delta.set(0, 0, 0);
            PT.check('platform (test double): handle.delta carries the hero', pl.object.position.x - x0 > 0.9, pl.object.position.x - x0);
          } finally {
            W.getGroundHeight = origG; if (hadPA) W.platformAt = origPA; else delete W.platformAt;
          }
          return;
        }
        const p = pl.object.position;
        const top = W.getHeight(p.x, p.z) + 2.0;
        const h = W.addPlatform({ id: 'pt', shape: 'disc', center: new T.Vector3(p.x, top, p.z), r: 2, top, life: 30 });
        pl.teleport(new T.Vector3(p.x, top + 1.5, p.z), false);
        stepGame(1.0);
        PT.check('player lands on a platform (getGroundHeight with yHint)', Math.abs(pl.object.position.y - top) < 0.1 && pl.grounded, { y: pl.object.position.y, top });
        if (typeof W.platformAt === 'function' && h?.delta) {
          const x0 = pl.object.position.x;
          for (let i = 0; i < 30; i++) { h.delta.set(0.05, 0, 0); h.center?.x !== undefined && (h.center.x += 0.05); g.step(1, 1 / 60); }
          h.delta.set(0, 0, 0);
          PT.check('platform delta carries the hero', pl.object.position.x - x0 > 1.0, pl.object.position.x - x0);
        } else PT.skip('platform delta', 'world.platformAt(x, z, y) missing');
        W.removePlatform?.(h);
      });
      await pg.run('legacy mods writers', () => {
        const g = game, pl = g.player;
        const saved = pl.mods.atkMul;
        pl.mods.atkMul = 1.3;
        PT.check('legacy write player.mods.atkMul → stats', Math.abs(g.stats.get('atkMul') - 1.3) < 1e-9);
        pl.mods.atkMul = saved; pl.mods.doubleJump = true;
        PT.check('legacy doubleJump → extraJumps', g.stats.get('extraJumps') === 1 && pl.mods.doubleJump === true);
        pl.mods.doubleJump = false;
        PT.check('legacy restore → defaults', g.stats.get('atkMul') === 1 && g.stats.get('extraJumps') === 0);
      });
      await pg.run('rig perf', () => {
        const pl = game.player, sk = pl.rig.skin;
        let tris = 0; for (const m of sk.meshes) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
        PT.note(`hero rig: ${sk.meshes.length} skinned draw calls, ${Math.round(tris)} tris, ${sk.skeleton.bones.length} bones`);
        PT.check('hero rig: all class gear merged into ≤ 51 skinned draws (+0 vs v2)', sk.meshes.length <= 51, sk.meshes.length);
        PT.check('hero rig: ≤ 22.2k + 18k triangles', tris <= 22196 + 18000, tris);
      });
      PT.check('paladin misc: no console errors', pg.errors().length === 0, pg.errors().slice(0, 6));
    }
    await pg.close();
  }
};
