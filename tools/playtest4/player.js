// playtest4 section: player (PLAN v4 §7.8 PL1, B). Owned by player.
//   PL1: kit numbers (§5.8) per class · pending-perfect from an injected tell impact at −0.18 s → perfectDodge ·
//        after-impact grace (hit, dodge at +0.04 s → HP refunded, statuses cleared, grace:true) · 0.25 s input buffer
//        (castLock / combo lock → dodgeBuffered or dodgeRejected) · keymap-only input · witch time (0.5 × for 0.6 s real,
//        §5.9 conditions, ≤ once per 4 s, off with witch=0) · paladin perfect brace · post-hit protection (melee only) ·
//        dodge follows the held input · combat camera 6.6 m · story auto-revive · ≤ 8 scene + 4 shadow calls,
//        ≤ 30k tris, ≤ 6k shadow tris for every class · no per-frame allocation from player files · rule 5 grep.
const fs = require('fs'); const path = require('path');

const CLASSES = ['mage', 'sword', 'ranger', 'paladin', 'spiritcaller', 'shadowblade'];

module.exports = async function player(PT) {
  // ------------------------------------------------------------ static: keymap-only input, rule 5 in player files
  {
    const src = fs.readFileSync(path.join(PT.root, 'src/player.js'), 'utf8');
    const lit = (src.match(/'Key[QE]'|'Space'|'ShiftLeft'|'Mouse3'/g) || []);
    PT.check('PL1 keymap-only: no KeyQ / KeyE / Space / ShiftLeft literals in player.js (actions dodge, dodgeAlt, defend, jump, sprint)', lit.length === 0, lit);
    const bad = [];
    for (const f of ['src/player.js', 'src/player/fx.js', 'src/player/defense.js', 'src/player/kits.js', 'src/player/merge.js']) {
      fs.readFileSync(path.join(PT.root, f), 'utf8').split('\n').forEach((l, i) => {
        // (toonMat(0xffffff, …) is a material base multiplier for vertex colours / texture, not an effect colour)
        if (/0xffffff|0xFFFFFF|vec3\(1\.0\)/.test(l) && !/^\s*\/\//.test(l) && !/toonMat\(0xffffff/.test(l)) bad.push(`${f}:${i + 1}`);
        if (/emissiveIntensity:\s*([2-9]|1\.[3-9])/.test(l)) bad.push(`${f}:${i + 1} (emissive)`);
      });
    }
    PT.check('rule 5: no white effect colours / emissive > 1.2 in player effect files', bad.length === 0, bad);
  }

  // ============================================================ main page (mage)
  const pg = await PT.boot('&cls=mage&level=30&skills=preset:endgame_mage');
  PT.check('PL1 boot: ready', pg.ready, pg.params);
  if (!pg.ready) { await pg.close(); return; }

  // shared in-page helpers
  await pg.eval(() => {
    const g = window.game, P = window.PT;
    P.pl = {
      press(code, dt = 1 / 60) { g.input.simulate({ keys: { [code]: true } }); g.step(1, dt); g.input.simulate(null); g.step(1, 1 / 60); },
      hold(keys) { g.input.simulate({ keys }); },
      release() { g.input.simulate(null); },
      fresh() { P.keepAlive(); const p = g.player; p.stamina = p.maxStamina; p.refundDash?.(9); P.step(1.6); P.keepAlive(); },
      dummy(dx = 0, dz = -2) {
        const pp = g.player.object.position;
        const d = g.debug.spawnDummy(new g.THREE.Vector3(pp.x + dx, pp.y, pp.z + dz), {});
        return d;
      },
      tell(e, windup = 0.75, opts = {}) {
        const pp = g.player.object.position;
        if (!opts.keepPos) e.object.position.set(pp.x + (opts.dx || 0), pp.y, pp.z - 2.2);   // in view, within 3 m (off-screen melee rule)
        return g.tells.attack(e, { id: opts.id || 'pt.slam', tell: opts.tell || 'danger', cls: opts.cls || 'mobLight', windup, sound: false, targetsPlayer: opts.targetsPlayer,
          shape: { kind: 'circle', pos: pp.clone(), r: 3 } });
      },
      /** step until the handle's remaining ≤ t (one 1/60 step at a time) */
      until(h, t) { for (let i = 0; i < 400 && h.remaining > t; i++) g.step(1, 1 / 60); return h.remaining; },
      /** step until the strike latch, then deal the hit through combat (the mob side) */
      strike(h, e, hit = {}) {
        for (let i = 0; i < 200; i++) { if (h.consumeStrike()) break; g.step(1, 1 / 60); }
        const pe = g.player.entity;
        const hp0 = pe.hp;
        const r = g.combat.dealDamage(pe, { amount: 24, element: 'physical', source: e, point: e.object.position.clone(), attack: { id: h.id, nameKo: '시험 공격', kind: 'melee' }, ...hit });
        return { hp0, hp1: pe.hp, r };
      },
    };
    P.tp(-20, 45); P.clearEnemies(); P.look(0, -0.2); P.step(0.3);
    // the first tell of each kind would start the tells-owned teaching slow motion; it is tested separately below
    g.settings.set('teachSlowmo', false, { persist: false });
  });

  // ------------------------------------------------------------ kit numbers (§5.8, §6.10, §6.11)
  await pg.run('PL1 kits', async () => {
    const K = await import('/src/player/kits.js');
    const want = {
      mage: { type: 'blink', i: 0.30, p: 0.20, def: 'barrier', dp: 0.22, parry: true, dn: '점멸', fn: '마력 방벽' },
      sword: { type: 'dashstep', i: 0.30, p: 0.20, def: 'guard', dp: 0.22, parry: true, dn: '질풍보', fn: '막기' },
      ranger: { type: 'backflip', i: 0.42, p: 0.20, def: 'focus', dp: undefined, parry: false, dn: '백덤블링', fn: '집중' },
      paladin: { type: 'shieldstep', i: 0.20, p: 0.15, def: 'shield', dp: 0.22, parry: true, sa: 0.38, dn: '방패 돌진', fn: '방패 막기' },
      spiritcaller: { type: 'spiritswap', i: 0.30, p: 0.20, def: 'ward', dp: 0, parry: false, dn: '정령 교대', fn: '정령 결계' },
      shadowblade: { type: 'shadowroll', i: 0.40, p: 0.22, def: 'counter', dp: 0.22, parry: true, dn: '그림자 구르기', fn: '반격 자세' },
    };
    const bad = [];
    for (const [c, w] of Object.entries(want)) {
      const k = K.KITS[c], d = k.dodge, f = k.defend;
      if (d.type !== w.type || Math.abs(d.iframes - w.i) > 1e-9 || Math.abs(d.perfectWin - w.p) > 1e-9 || d.grace !== 0.05) bad.push(`${c} dodge ${JSON.stringify(d)}`);
      if (w.sa && d.superArmor !== w.sa) bad.push(`${c} superArmor`);
      if (f.type !== w.def || (w.dp !== undefined && f.perfect !== w.dp)) bad.push(`${c} defend ${JSON.stringify(f)}`);
      if (f.canParry !== w.parry) bad.push(`${c} canParry ${f.canParry}`);
      if (K.KIT_NAMES[d.type] !== w.dn || K.KIT_NAMES[f.type] !== w.fn) bad.push(`${c} names ${K.KIT_NAMES[d.type]}/${K.KIT_NAMES[f.type]}`);
    }
    PT.check('kits: i-frames / perfect windows / grace / super armour / defend perfect 0.22 / canParry / §6.10 names per class', bad.length === 0, bad);
    PT.check('kits: perfect callouts', K.PERFECT_KO.dodge === '완벽 회피!' && K.PERFECT_KO.parry === '완벽 패링!' && K.PERFECT_KO.barrier === '완벽 방벽!');
    PT.check('kits: player.kit is the mage kit with canParry', game.player.kit.dodge.iframes === 0.30 && game.player.kit.defend.canParry === true);
    const hud = game.player.getDefenseHud();
    PT.check('getDefenseHud names = glossary', hud.dodgeName === '점멸' && hud.defendName === '마력 방벽', [hud.dodgeName, hud.defendName]);
  });

  // ------------------------------------------------------------ pending-perfect + witch time
  await pg.run('PL1 perfect + witch', () => {
    const g = game, P = PT, L = P.pl, pl = g.player;
    PT.check('tells present (real tells merged or stub)', !!g.tells?.attack, { isStub: g.tells?.isStub });
    const evs = P.events('perfectDodge'), cre = P.events('counterReady');
    L.fresh();
    const e = L.dummy(0, -2.2);
    const h = L.tell(e, 0.75);
    PT.check('tells.attack returned a handle', !!h, null);
    if (!h) return;
    const rem = L.until(h, 0.18);
    const n0 = evs.length;
    L.press('KeyQ');
    const ds = pl.debugState();
    PT.check('dodge press at −0.18 s → pending-perfect (predicted from tells.nextImpact)', !!ds.pending && ds.pending.kind === 'dodge' && ds.pending.noInfo === false, { rem, pending: ds.pending });
    const s = L.strike(h, e);
    const pd = evs[n0];
    PT.check('the absorbed hit → perfectDodge {attacker, witch, grace:false}, no damage', !!pd && pd.p.attacker === e && pd.p.grace === false && s.hp1 === s.hp0 && s.r?.blocked, { got: pd && { ...pd.p, attacker: !!pd.p.attacker, source: undefined, position: undefined }, s: { hp0: s.hp0, hp1: s.hp1 } });
    PT.check('perfectDodge carries calloutKo 완벽 회피!', pd?.p?.calloutKo === '완벽 회피!');
    PT.check('counterReady {dur: 1.2} and player.counterReady', cre.length > 0 && cre[cre.length - 1].p.dur === 1.2 && pl.counterReady > 0);
    const T = g.timeScale;
    PT.check('witch time: 0.5 × for 0.6 s real (compensated), post grade + fxFactor requested', pd?.p?.witch === true && T.has('witch') && Math.abs(T.value() - 0.5) < 1e-6 && T.timeLeft('witch') > 0.5 && T.timeLeft('witch') <= 0.6 && Math.abs(T.comp() - 2) < 1e-6,
      { witch: pd?.p?.witch, v: T.value(), left: T.timeLeft('witch'), comp: T.comp() });
    const rt0 = g.realTime; let ended = null;
    for (let i = 0; i < 60 && ended == null; i++) { g.step(1, 1 / 60); if (!T.has('witch')) ended = g.realTime - rt0; }
    PT.check('witch time ends after ≈ 0.6 s real', ended != null && ended > 0.5 && ended <= 0.62, ended);
    // second perfect inside 4 s → no witch
    L.fresh();
    const h2 = L.tell(e, 0.75); L.until(h2, 0.15); const n1 = evs.length; L.press('KeyQ'); L.strike(h2, e);
    PT.check('a second perfect within 4 s: perfectDodge without witch time', evs.length > n1 && evs[evs.length - 1].p.witch === false && !T.has('witch'), evs.length > n1 ? evs[evs.length - 1].p.witch : 'none');
    // after the cooldown, another player-targeted tell landing 0.2 s after the dodged one → no witch
    P.step(3.2); L.fresh();
    const e2 = L.dummy(1.5, -2);
    const h3 = L.tell(e, 0.75); g.step(12, 1 / 60); const h4 = L.tell(e2, 0.75, { dx: 1.5 });
    L.until(h3, 0.15); const n2 = evs.length; L.press('KeyQ'); L.strike(h3, e);
    PT.check('another tell completing within 0.3 s → no witch time', evs.length > n2 && evs[evs.length - 1].p.witch === false && !T.has('witch'), { witch: evs[evs.length - 1]?.p?.witch, other: h4?.remaining });
    for (let i = 0; i < 90 && h4 && !h4.done; i++) { if (h4.consumeStrike()) break; g.step(1, 1 / 60); }
    // a tell that does not target the player → no witch
    P.step(4.5); L.fresh();
    const h5 = L.tell(e, 0.75, { targetsPlayer: false }); L.until(h5, 0.15); const n3 = evs.length; L.press('KeyQ'); L.strike(h5, e);
    PT.check('a tell that did not target the player → perfect (inside its shape) but no witch time', evs.length > n3 && evs[evs.length - 1].p.witch === false, evs[evs.length - 1]?.p?.witch);
    // and again with a lone player-targeted tell → witch (cooldown respected, not permanently off)
    P.step(4.5); L.fresh();
    const h6 = L.tell(e, 0.75); L.until(h6, 0.15); const n4 = evs.length; L.press('KeyQ'); L.strike(h6, e);
    PT.check('≥ 4 s later a lone player-targeted tell → witch time again', evs.length > n4 && evs[evs.length - 1].p.witch === true, evs[evs.length - 1]?.p?.witch);
    P.step(1);
    // a press well before the window (0.6 s) → not perfect
    L.fresh();
    const h7 = L.tell(e, 0.95); L.until(h7, 0.62); const n5 = evs.length; L.press('KeyQ');
    PT.check('press 0.6 s before the impact → no pending-perfect', !pl.debugState().pending, pl.debugState().pending);
    L.strike(h7, e);
    PT.check('…and no perfectDodge for that hit', evs.length === n5);
    // perfectMul assist widens the window: ×2 → a press at −0.36 s is perfect
    P.step(1.5); L.fresh();
    g.settings.set('perfectMul', 2, { persist: false });
    const h8 = L.tell(e, 0.95); L.until(h8, 0.36); L.press('KeyQ');
    const pend = pl.debugState().pending;
    g.settings.set('perfectMul', 1, { persist: false });
    L.strike(h8, e);
    PT.check('assist.perfectMul ×2 → pending at −0.36 s', !!pend, pend);
    // iframeMul ×2 → 0.60 s of i-frames
    P.step(1.5); L.fresh();
    g.settings.set('iframeMul', 2, { persist: false });
    L.press('KeyQ'); const ifr = pl.debugState().dodgeIframeT;
    g.settings.set('iframeMul', 1, { persist: false });
    PT.check('assist.iframeMul ×2 → i-frames 0.60 s', Math.abs(ifr + 2 / 60 - 0.6) < 0.02, ifr);
    P.clearEnemies(); P.step(0.5);
  });

  // ------------------------------------------------------------ teaching slow motion (tells) keeps perfect dodges working
  await pg.run('PL1 teach slow motion', () => {
    const g = game, P = PT, L = P.pl, pl = g.player;
    P.step(4.5); L.fresh();
    g.settings.set('teachSlowmo', true, { persist: false });
    try { g.tells?.debug?.resetSeen?.(); } catch (_) { /* */ }
    const e = L.dummy(0, -2.2);
    const evs = P.events('perfectDodge');
    const h = L.tell(e, 0.75, { tell: 'parry', id: 'pt.teach' });
    if (!h) { PT.check('teach tell started', false); return; }
    let slow = false;
    for (let i = 0; i < 400 && h.remaining > 0.12; i++) { g.step(1, 1 / 60); if (g.timeScale.value() < 0.99) slow = true; }
    const n0 = evs.length;
    L.press('KeyQ');
    const s = L.strike(h, e);
    g.settings.set('teachSlowmo', false, { persist: false });
    PT.check('under the teaching slow motion (enemy time slowed, player compensated) a perfect dodge still absorbs the hit', s.hp1 === s.hp0 && evs.length > n0,
      { slow, src: g.timeScale.slowmoSource?.(), hp: [s.hp0, s.hp1], perfect: evs.length > n0 });
    P.step(1.5);
  });

  // ------------------------------------------------------------ after-impact grace
  await pg.run('PL1 grace', () => {
    const g = game, P = PT, L = P.pl, pl = g.player, pe = pl.entity;
    const evs = P.events('perfectDodge');
    P.step(4.5); L.fresh();
    const e = L.dummy(0, -2);
    const hp0 = pe.hp;
    g.combat.dealDamage(pe, { amount: 25, element: 'physical', source: e, point: e.object.position.clone(), status: { wet: 6 }, attack: { id: 'pt.hit', nameKo: '시험', kind: 'melee' } });
    const hit = pl.lastEnemyHit;
    const hpHit = pe.hp, wet = !!pe.statuses.wet;
    PT.check('lastEnemyHit recorded from playerHurt {t, amount, attacker, attack, appliedStatuses}', !!hit && hit.amount === hp0 - hpHit && hit.attacker === e && hit.attack?.id === 'pt.hit' && hit.appliedStatuses.includes('wet'), hit && { ...hit, attacker: !!hit.attacker });
    const n0 = evs.length;
    L.press('KeyQ', 0.04);       // the press frame lands 0.04 s after the hit
    const pd = evs[n0];
    PT.check('dodge at +0.04 s → HP refunded, statuses cleared, perfectDodge {grace:true}', hpHit < hp0 && wet && pe.hp === hp0 && !pe.statuses.wet && pd?.p?.grace === true,
      { hp0, hpHit, hp: pe.hp, wet, wetAfter: !!pe.statuses.wet, grace: pd?.p?.grace });
    // too late (+0.12 s): no refund
    P.step(4.5); L.fresh();
    pe.hp = pe.maxHp; const hpA = pe.hp;
    P.step(0.4);
    g.combat.dealDamage(pe, { amount: 25, element: 'physical', source: e, point: e.object.position.clone(), attack: { id: 'pt.hit', nameKo: '시험', kind: 'melee' } });
    const hpB = pe.hp; const n1 = evs.length;
    g.step(6, 1 / 60); L.press('KeyQ');
    PT.check('dodge at +0.12 s → no refund, no perfect', pe.hp <= hpB + 1e-6 && evs.length === n1 && hpB < hpA, { hpA, hpB, hp: pe.hp });
    P.clearEnemies(); P.step(0.5);
  });

  // ------------------------------------------------------------ input buffer (castLock gate)
  await pg.run('PL1 buffer', () => {
    const g = game, P = PT, L = P.pl, pl = g.player;
    const buf = P.events('dodgeBuffered'), rej = P.events('dodgeRejected'), dg = P.events('dodge');
    L.fresh();
    const S = g.spells; const had = Object.prototype.hasOwnProperty.call(S, 'castLock'), prev = S.castLock;
    try {
      S.castLock = 0.15;
      const n0 = buf.length, d0 = dg.length;
      L.press('KeyQ');
      PT.check('press during castLock → queued (player.inputBuffer), no dodge yet', pl.inputBuffer?.action === 'dodge' && dg.length === d0, { buf: pl.inputBuffer, dodges: dg.length - d0 });
      let waited = null;
      for (let i = 0; i < 30 && buf.length === n0; i++) { S.castLock = Math.max(0, S.castLock - 1 / 60); g.step(1, 1 / 60); }
      if (buf.length > n0) waited = buf[n0].p.waited;
      PT.check('castLock ends → dodgeBuffered {action:dodge, waited ≤ 0.25} and the dodge executes', waited != null && waited <= 0.25 && buf[n0].p.action === 'dodge' && dg.length === d0 + 1, { waited, dodges: dg.length - d0 });
      L.fresh();
      S.castLock = 5;
      const r0 = rej.length, d1 = dg.length;
      L.press('KeyQ');
      g.step(16, 1 / 60);
      PT.check('still locked at +0.25 s → dodgeRejected {action, reason:locked}, nothing executed', rej.length === r0 + 1 && rej[r0].p.action === 'dodge' && rej[r0].p.reason === 'locked' && dg.length === d1 && !pl.inputBuffer,
        { rejected: rej.slice(r0).map((x) => x.p), dodges: dg.length - d1 });
      S.castLock = 0;
      // dodgeAlt (마우스 4번 버튼 = Mouse3) is the same action
      L.fresh();
      const d2 = dg.length;
      g.input.simulate({ mouse: { 3: true } }); g.step(1, 1 / 60); g.input.simulate(null); g.step(1, 1 / 60);
      PT.check('dodgeAlt (Mouse3) dodges', dg.length === d2 + 1, dg.length - d2);
      // rebinding moves the dodge: U (unbound elsewhere) dodges, Q no longer does
      L.fresh();
      const K = g.input.keymap; K.rebind('dodge', 'KeyU');
      const d3 = dg.length; L.press('KeyQ'); const afterQ = dg.length - d3;
      L.fresh();
      const d4 = dg.length; L.press('KeyU'); const afterR = dg.length - d4;
      K.reset();
      PT.check('keymap rebind: dodge follows the binding (U dodges, Q does not)', afterQ === 0 && afterR === 1, { afterQ, afterR });
    } finally { if (had) S.castLock = prev; else delete S.castLock; }
  });

  // ------------------------------------------------------------ post-hit protection
  await pg.run('PL1 post-hit protection', () => {
    const g = game, P = PT, L = P.pl, pl = g.player, pe = pl.entity;
    P.step(1); L.fresh();
    const e = L.dummy(0, -2);
    const hit = (kind, amount = 20, extra = {}) => { const h0 = pe.hp; g.combat.dealDamage(pe, { amount, element: 'physical', source: e, point: e.object.position.clone(), attack: { id: 'pt.' + kind, nameKo: '시험', kind }, ...extra }); return h0 - pe.hp; };
    pe.hp = pe.maxHp;
    const waitGame = (sec) => { const t0 = g.time; for (let i = 0; i < 600 && g.time - t0 < sec; i++) g.step(1, 1 / 60); };
    const a = hit('melee');
    waitGame(0.1);
    const b = hit('melee');
    const c = hit('projectile', 10, { projectile: {} });
    waitGame(0.3);
    const d = hit('melee');
    PT.check('after a hit ≥ 12: melee ignored for 0.35 s, projectiles still land, melee lands again after', a > 0 && b === 0 && c > 0 && d > 0, { a, b, c, d });
    pe.hp = pe.maxHp; P.step(0.5);
    const s1 = hit('melee', 5); g.step(3, 1 / 60); const s2 = hit('melee', 5);
    PT.check('a small hit (< 12) does not start protection', s1 > 0 && s2 > 0, { s1, s2 });
    P.clearEnemies(); P.step(0.3);
  });

  // ------------------------------------------------------------ dodge direction + paladin brace (every class on this page)
  await pg.run('PL1 dodge follows input', () => {
    const g = game, P = PT, L = P.pl, pl = g.player;
    const out = {}, bad = [];
    for (const c of ['mage', 'sword', 'ranger', 'paladin', 'spiritcaller', 'shadowblade']) {
      pl.setClass(c); L.fresh();
      P.look(0.4, -0.2); g.step(2, 1 / 60);
      const yaw = pl.yaw, right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      L.hold({ KeyD: true }); g.step(2, 1 / 60); L.hold({ KeyD: true, KeyQ: true }); g.step(1, 1 / 60); L.release(); g.step(1, 1 / 60);
      const dd = pl.debugState().dodgeDir;
      const dot = dd.x * right.x + dd.z * right.z;
      out[c] = +dot.toFixed(3);
      if (!(dot > 0.95)) bad.push(c);
      P.step(1.0);
    }
    PT.check('every class dodges along the held input (camera-relative right)', bad.length === 0, out);
    // ranger without input: backward (away from facing)
    pl.setClass('ranger'); L.fresh();
    const f = pl.facing;
    L.press('KeyQ');
    const dd = pl.debugState().dodgeDir;
    PT.check('ranger backflip without input → backward', dd.x * -Math.sin(f) + dd.z * -Math.cos(f) > 0.95, { dd, f });
    P.step(1.5);
    // ranger: whole flip invulnerable (0.42 s)
    PT.check('ranger: i-frames 0.42 = the whole flip', Math.abs(pl.kit.dodge.iframes - pl.kit.dodge.time) < 1e-9);
  });

  await pg.run('PL1 paladin brace', () => {
    const g = game, P = PT, L = P.pl, pl = g.player;
    pl.setClass('paladin'); L.fresh(); P.step(4.5); L.fresh();
    const e = L.dummy(0, -2.2);
    const par = P.events('parry'), evs = P.events('perfectDodge');
    const h = L.tell(e, 0.75); L.until(h, 0.12);
    const n0 = evs.length, p0 = par.length;
    L.press('KeyQ');
    const ds = pl.debugState();
    PT.check('shield step: i-frames 0.20 + super armour 0.38', Math.abs(ds.dodgeIframeT - (0.2 - 1 / 60)) < 0.02 && Math.abs(ds.superArmorT - (0.38 - 1 / 60)) < 0.02, { ifr: ds.dodgeIframeT, sa: ds.superArmorT });
    const s = L.strike(h, e);
    PT.check('perfect brace at −0.12 s: no damage, parried (perfect-block effects), perfectDodge kind brace', s.hp1 === s.hp0 && s.r?.parried === true && par.length > p0 && evs.length > n0 && evs[n0].p.kind === 'brace' && evs[n0].p.calloutKo === '완벽 패링!',
      { hp: [s.hp0, s.hp1], parried: s.r?.parried, kind: evs[n0]?.p?.kind });
    P.clearEnemies(); pl.setClass('mage'); P.step(0.5);
  });

  // ------------------------------------------------------------ combat camera
  await pg.run('PL1 camera', () => {
    const g = game, P = PT, L = P.pl, pl = g.player;
    P.clearEnemies(); P.step(1.5);
    const c0 = { ...pl.camera };
    const e = L.dummy(3, -8); e.aggro = true; e.debugAggro = true;
    P.step(1.5);
    const c1 = { ...pl.camera };
    PT.check('out of combat: boom 5.5 m, shoulder 1.2', Math.abs(c0.dist - 5.5) < 0.05 && Math.abs(c0.shoulder - 1.2) < 0.02, c0);
    PT.check('enemy aggroed within 15 m: boom 6.6 m, FOV +4°, shoulder 0.9 (eased)', Math.abs(c1.dist - 6.6) < 0.05 && Math.abs(c1.fov - c0.fov - 4) < 0.1 && Math.abs(c1.shoulder - 0.9) < 0.02, c1);
    // eased over ≈ 0.6 s (not a snap)
    e.aggro = false; e.debugAggro = false; g.step(6, 1 / 60);
    const mid = pl.camera.dist;
    P.step(1.5);
    PT.check('easing back (≈ 0.6 s), then 5.5 m', mid < 6.55 && mid > 5.6 && Math.abs(pl.camera.dist - 5.5) < 0.05, { mid, end: pl.camera.dist });
    g.settings.set('cameraDist', 'far', { persist: false }); P.step(0.3);
    const far = pl.camera.dist;
    g.settings.set('cameraDist', 'near', { persist: false }); P.step(0.3);
    const near = pl.camera.dist;
    g.settings.set('cameraDist', 'normal', { persist: false }); P.step(0.3);
    PT.check('settings.cameraDist ×1.15 / ×0.9', Math.abs(far - 5.5 * 1.15) < 0.05 && Math.abs(near - 5.5 * 0.9) < 0.05, { far, near });
    // boss camera hint (multipliers) while a boss is aggroed within 40 m
    e.isBoss = true; e.cameraHint = { dist: 1.5, height: 1.4 }; e.aggro = true;
    P.step(1.5);
    const hb = { ...pl.camera };
    e.isBoss = false; e.cameraHint = null; e.aggro = false;
    PT.check('boss cameraHint applied (boom × 1.5 on the combat boom)', Math.abs(hb.dist - 6.6 * 1.5) < 0.1 && hb.hint?.dist === 1.5, hb);
    P.clearEnemies(); P.step(1.5);
  });

  // ------------------------------------------------------------ per-entity hitstop freezes the animation, not the input buffer
  await pg.run('PL1 hitstop', () => {
    const g = game, P = PT, L = P.pl, pl = g.player;
    pl.setClass('mage'); L.fresh();
    pl.hitstopUntil = g.realTime + 0.1;
    g.step(1, 1 / 60);
    const fz = pl.debugState().animFrozen;
    L.press('KeyQ');
    PT.check('player.hitstopUntil in the future → animation frozen; a dodge press still executes', fz === true && pl.debugState().dodgeIframeT > 0, { fz, ds: pl.debugState().dodgeIframeT });
    pl.hitstopUntil = 0; P.step(1.5);
  });

  // ------------------------------------------------------------ draw calls / triangles per class
  await pg.run('PL1 draws', () => {
    const g = game, P = PT, pl = g.player;
    P.clearEnemies(); P.step(0.2);
    const res = {}, bad = [];
    for (const c of ['mage', 'sword', 'ranger', 'paladin', 'spiritcaller', 'shadowblade']) {
      pl.setClass(c); P.step(0.2);
      let worst = null;
      for (const drawn of [false, true]) {
        if (pl.family === 'melee') pl.setSwordDrawn(drawn); else if (drawn) pl.setCharging(true, 'fire', 0.8);
        P.step(0.1);
        const d = P.draws();
        const G = d.byGroup.player || { calls: 0, tris: 0, shadowCalls: 0, shadowTris: 0 };
        if (!worst || G.calls > worst.calls || G.tris > worst.tris) worst = { calls: G.calls, tris: G.tris, shadowCalls: G.shadowCalls, shadowTris: G.shadowTris };
        if (pl.family !== 'melee' && drawn) pl.setCharging(false);
      }
      if (pl.family === 'melee') pl.setSwordDrawn(false);
      res[c] = worst;
      if (worst.calls > 8 || worst.shadowCalls > 4 || worst.tris > 30000 || worst.shadowTris > 6000) bad.push(c);
    }
    PT.note('player model per class (scene calls / tris · shadow calls / tris): ' + Object.entries(res).map(([c, w]) => `${c} ${w.calls}/${w.tris} · ${w.shadowCalls}/${w.shadowTris}`).join(', '));
    PT.check('every class: ≤ 8 scene + ≤ 4 shadow calls, ≤ 30k tris, ≤ 6k shadow tris (cape and weapon included)', bad.length === 0, res);
    const sk = pl.rig.skin;
    PT.check('rig merge active: body + outline + shadow proxy, cape merged', !!sk?.body && !!sk.outline && !!sk.proxy && sk.meshes.length === 3 && g.scene.children.includes(pl.object), sk?.stats);
    pl.setClass('mage'); P.step(0.2);
  });

  // ------------------------------------------------------------ no per-frame allocation from player files (CDP sampling)
  {
    const cdp = await pg.cdp();
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096 });
    const secs = await pg.eval(() => {
      const g = window.game, P = window.PT;
      P.keepAlive(); const t0 = g.time;
      for (let i = 0; i < 240; i++) {
        const k = (i % 60) < 40 ? { KeyW: true, KeyD: i % 120 < 60 } : {};
        g.input.simulate({ keys: k }); g.step(1, 1 / 60);
      }
      g.input.simulate(null); P.step(0.2);
      return g.time - t0;
    });
    const prof = (await cdp.send('HeapProfiler.stopSampling')).profile;
    let tot = 0; const sites = {};
    const walk = (n) => {
      const u = n.callFrame.url || '';
      if (n.selfSize && /\/src\/player(\.js|\/)/.test(u)) { tot += n.selfSize; const k = `${n.callFrame.functionName || '(anon)'} ${u.replace(/^.*\/src\//, 'src/')}:${n.callFrame.lineNumber + 1}`; sites[k] = (sites[k] || 0) + n.selfSize; }
      for (const c of n.children || []) walk(c);
    };
    walk(prof.head);
    const mb = tot / 1048576 / Math.max(0.1, secs);
    PT.note(`player-file allocation while moving: ${(mb * 1024).toFixed(1)} KB per game-second; top: ${JSON.stringify(Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => [k, Math.round(v / 1024)]))}`);
    PT.check('per-frame player update: ≤ 32 KB allocated per game-second from player files (§2.7; F-* scene budget 1 MB/s)', mb * 1024 <= 32, +(mb * 1024).toFixed(1));
  }
  PT.check('PL1 main page: no console errors', pg.errors().length === 0, pg.errors().slice(0, 6));
  await pg.close();

  // ============================================================ sword: real combo lock (c4) → buffered or rejected within 0.25 s
  {
    const sp = await PT.boot('&cls=sword&level=30&skills=preset:endgame_sword');
    if (sp.ready) {
      await sp.run('PL1 sword combo lock', () => {
        const g = game, P = PT, pl = g.player;
        P.tp(-20, 45); P.clearEnemies(); P.step(0.3);
        try { g.skills?.attune?.('fire'); } catch (_) { /* */ }
        P.step(0.2); P.keepAlive();
        const sw = P.events('swordSwing'), buf = P.events('dodgeBuffered'), rej = P.events('dodgeRejected'), dg = P.events('dodge');
        let c4 = null;
        for (let i = 0; i < 240 && !c4; i++) {
          g.input.simulate({ mouse: { 0: i % 8 < 3 } }); g.step(1, 1 / 60);
          const last = sw[sw.length - 1]; if (last && last.p.step === 3) c4 = last;
        }
        g.input.simulate(null);
        PT.check('combo reached c4 (step 3)', !!c4, sw.map((x) => x.p.step));
        if (!c4) return;
        g.step(4, 1 / 60);
        const lockedAtPress = !(pl.action.dodgeCancelable || pl.action.cancelable || !pl.action.active);
        const b0 = buf.length, r0 = rej.length, d0 = dg.length, rt = g.realTime;
        g.input.simulate({ keys: { KeyQ: true } }); g.step(1, 1 / 60); g.input.simulate(null);
        let outcome = null;
        for (let i = 0; i < 18 && !outcome; i++) {
          if (buf.length > b0) outcome = { kind: 'buffered', waited: buf[b0].p.waited };
          else if (rej.length > r0) outcome = { kind: 'rejected', reason: rej[r0].p.reason, after: g.realTime - rt };
          else if (dg.length > d0 && !lockedAtPress) outcome = { kind: 'direct' };
          if (!outcome) g.step(1, 1 / 60);
        }
        PT.note(`c4 (${c4.p.element}) lock at press: ${lockedAtPress}; outcome ${JSON.stringify(outcome)}`);
        PT.check('dodge during the c4 lock executes ≤ 0.25 s later (dodgeBuffered) or emits dodgeRejected — never dropped silently', !!outcome && (outcome.kind !== 'buffered' || outcome.waited <= 0.25) && (outcome.kind !== 'rejected' || outcome.after <= 0.3), outcome);
      });
      PT.check('sword page: no console errors', sp.errors().length === 0, sp.errors().slice(0, 6));
    } else PT.check('sword page boot', false);
    await sp.close();
  }

  // ============================================================ story difficulty + witch=0: auto-revive, witch off
  {
    const st = await PT.boot('&cls=mage&level=30&skills=preset:endgame_mage&difficulty=story&witch=0');
    if (st.ready) {
      await st.run('PL1 story', () => {
        const g = game, P = PT, pl = g.player, pe = pl.entity;
        P.tp(-20, 45); P.clearEnemies(); P.step(0.3);
        g.settings.set('teachSlowmo', false, { persist: false });   // isolate witch=0 from the teaching slow motion arbitration
        PT.check('story: assist.autoRevive, witchSlowmo off (witch=0)', g.assist.autoRevive === true && g.assist.witchSlowmo === false, { autoRevive: g.assist.autoRevive, witch: g.assist.witchSlowmo });
        // witch off: a perfect dodge gives no witch time
        const pp = pl.object.position;
        const e = g.debug.spawnDummy(new g.THREE.Vector3(pp.x, pp.y, pp.z - 2.2), {});
        const evs = P.events('perfectDodge');
        const h = g.tells.attack(e, { id: 'pt.slam', tell: 'danger', cls: 'mobLight', windup: 0.75, sound: false, shape: { kind: 'circle', pos: pp.clone(), r: 3 } });
        for (let i = 0; i < 400 && h && h.remaining > 0.2; i++) g.step(1, 1 / 60);
        const n0 = evs.length;
        g.input.simulate({ keys: { KeyQ: true } }); g.step(1, 1 / 60); g.input.simulate(null);
        for (let i = 0; i < 200 && h; i++) { if (h.consumeStrike()) break; g.step(1, 1 / 60); }
        g.combat.dealDamage(pe, { amount: 20, source: e, point: e.object.position.clone(), attack: { id: 'pt.slam', kind: 'melee', nameKo: '시험' } });
        PT.check('witch=0: perfect dodge without witch time', evs.length > n0 && evs[n0].p.witch === false && !g.timeScale.has('witch'), evs[n0]?.p?.witch);
        P.clearEnemies(); P.step(1.0);
        // auto-revive in place with 50 % HP after 2 s
        const at = pl.object.position.clone();
        const states = new Set();
        g.combat.dealDamage(pe, { amount: 1e6, fixed: true, source: 'debug', noReaction: true });
        PT.check('lethal hit → dying', pe.alive === false || pe.hp <= 0, { alive: pe.alive, hp: pe.hp });
        for (let i = 0; i < 110; i++) { g.step(1, 1 / 60); states.add(g.state); }
        const midAlive = pe.alive;
        for (let i = 0; i < 30; i++) { g.step(1, 1 / 60); states.add(g.state); }
        PT.check('story: revived in place with 50 % HP after 2 s, never the death screen', midAlive === false && pe.alive && Math.abs(pe.hp - pe.maxHp * 0.5) <= 1 && pl.object.position.distanceTo(at) < 0.6 && !states.has('dead'),
          { midAlive, alive: pe.alive, hp: pe.hp, max: pe.maxHp, moved: pl.object.position.distanceTo(at), states: [...states] });
      });
      PT.check('story page: no console errors', st.errors().length === 0, st.errors().slice(0, 6));
    } else PT.check('story page boot', false);
    await st.close();
  }
};
