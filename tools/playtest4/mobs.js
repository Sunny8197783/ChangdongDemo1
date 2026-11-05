// playtest4 section: mobs (PLAN v4 §7.8 M1 + M3, B). Owned by mobs.
//   M1: for every mob attack id of §4.1–4.8 via e.debugAttack(id): tellStart precedes damage by ≥ the §5.7 floor; the pose holds
//       still ≥ 0.1 s before the strike (tracked bones, |Δ| < 1e-5 rad per frame); hitbox = decal (player 0.3 m inside the locked
//       decal edge → hit, 0.3 m outside → no hit; the shape is read from the live TellHandle); punish windows emit punishWindow and
//       tells.canAttack is false during them; orbs home ≤ 0.5 s at ≤ 120°/s, ≤ 6 alive, orbEta matches the arrival; walking sideways
//       at 5.5 m/s from 10 m dodges a shaman orb; an off-screen melee attacker > 3 m away cannot start a windup.
//   M3: codex complete for every type + variant (no windup seconds, parryKo separated, key tokens only); enemyEncounter once per
//       type on first sight (persisted in save section 'encounters'); weakness fields on every entity; playerHurt carries
//       attackNameKo / attackKind for each mob attack; aggroCount; every vfx call from the enemies module passes an owner.
//   Static: rule 5 (no 0xffffff effect colours / emissive > 1.2) and rule 6 (Korean text only in codex.js) on the mobs files.
// 640×360, prod=1&governor=0&seed=1 (harness defaults). Render off while stepping (counts / timing only).
const fs = require('fs'); const path = require('path');

const MOB_FILES = ['src/enemies.js', 'src/enemies/base.js', 'src/enemies/common.js', 'src/enemies/bokoblin.js', 'src/enemies/shaman.js', 'src/enemies/chuchu.js',
  'src/enemies/lizard.js', 'src/enemies/shroom.js', 'src/enemies/wolf.js', 'src/enemies/wraith.js', 'src/enemies/voidknight.js', 'src/enemies/dummy.js',
  'src/enemies/projectiles.js', 'src/enemies/loot.js', 'src/enemies/scaling.js', 'src/enemies/threat.js', 'src/enemies/encounters.js', 'src/enemies/codex.js'];

module.exports = async function mobs(PT) {
  // ================================================================== static: rules 5 / 6
  {
    const white = [], emissive = [], korean = [];
    for (const f of MOB_FILES) {
      const src = fs.readFileSync(path.join(PT.root, f), 'utf8').split('\n');
      src.forEach((l, i) => {
        const code = l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        if (/^\s*\*/.test(l)) return;
        // vertex-colour material bases (toonMat(0xffffff, {vertexColors})) are not effect colours
        if (/0xffffff\b|#ffffff\b/i.test(code) && !/toonMat\(0xffffff, \{ vertexColors/.test(code)) white.push(`${f}:${i + 1}`);
        const m = code.match(/emissive(?:Intensity|Mul)?\s*[:=]\s*([\d.]+)/gi) || [];
        for (const x of m) if (parseFloat(x.split(/[:=]/)[1]) > 1.2) emissive.push(`${f}:${i + 1}`);
        if (f !== 'src/enemies/codex.js' && /[가-힣]/.test(code.replace(/'[^']*'\s*\)\s*;?\s*$/, (s) => s))) {
          // legacy canvas word textures (common.js '붕괴!') and the golem boss info belong to v3 data kept for bosses
          if (!/word\('붕괴!'|GOLEM_INFO/.test(code)) korean.push(`${f}:${i + 1}`);
        }
      });
    }
    PT.check('rule 5: no 0xffffff effect colours / emissive > 1.2 in the mobs files', white.length === 0 && emissive.length === 0, { white, emissive });
    PT.check('rule 6: Korean player text only in src/enemies/codex.js', korean.length === 0, korean.slice(0, 10));
    const ens = fs.readFileSync(path.join(PT.root, 'src/enemies.js'), 'utf8');
    PT.check('enemies.js: import * as GolemMod (prewarmGolem?.) and no static model builds for warm-up', /import \* as GolemMod from '\.\/enemies\/golem\.js'/.test(ens) && /GolemMod\.prewarmGolem\?\.\(game\)/.test(ens) && !/buildLizard|buildChuchu\(/.test(ens));
    const bad = MOB_FILES.filter((f) => /telegraphMul\s*\*|\*=\s*D\.telegraphMul/.test(fs.readFileSync(path.join(PT.root, f), 'utf8')));
    PT.check('telegraphMul is never multiplied (alias 1)', bad.length === 0, bad);
  }

  const pg = await PT.boot('&cls=mage&level=12', { w: 640, h: 360 });
  PT.check('boot: ready', pg.ready, pg.params);
  if (!pg.ready) { await pg.close(); return; }

  // ================================================================== M1
  const m1 = await pg.run('M1', async () => {
    const g = window.game, PT = window.PT, E = g.enemies, T = g.THREE;
    const C = await import('/src/enemies/codex.js');
    const MIN = g.tells?.MIN || { mobLight: 0.75, mobHeavy: 0.85, combo: 0.55, mobRanged: 0.9, elite: 0.8, check: 0 };
    PT.note(`tells: ${g.tells?.isStub ? 'core stub' : 'real module'}`);
    const SPOT = { x: -20, z: 45 };
    // enemy-owned FX check: every vfx call made while the enemies module updates must pass an owner
    const noOwner = {};
    let inEnemies = false;
    const V = g.vfx;
    for (const k of ['burst', 'emitter', 'shockwave', 'trail', 'impact', 'explosion', 'preset', 'debris', 'flash', 'decal', 'dome']) {
      const f = V[k]; if (typeof f !== 'function') continue;
      V[k] = function (...a) { if (inEnemies) { const o = a.find((x) => x && typeof x === 'object' && !x.isVector3 && !x.isObject3D); if (!o || !o.owner) noOwner[k] = (noOwner[k] || 0) + 1; } return f.apply(this, a); };
    }
    const eu = E.update.bind(E);
    E.update = (...a) => { inEnemies = true; try { return eu(...a); } finally { inEnemies = false; } };

    const clear = () => { for (const e of E.all.slice()) if (!e.isBoss) E.remove(e); E.projectiles?.clear?.(); PT.step(0.05); };
    const pl = () => g.player.object.position;
    const _tp = new T.Vector3();
    const place = (x, z) => { if (g.player.teleport) g.player.teleport(_tp.set(x, 0, z), true); else { const p = pl(); p.set(x, PT.groundHeight(x, z) + 0.02, z); } g.player.entity?.velocity?.set?.(0, 0, 0); };
    const hurtLog = PT.events('playerHurt'), startLog = PT.events('tellStart'), endLog = PT.events('tellEnd'), punLog = PT.events('punishWindow');
    const BONES = ['rig', 'spine', 'neck', 'armR', 'armL', 'foreR', 'foreL', 'legR', 'legL', 'kneeR', 'kneeL', 'jaw'];
    const sig = (e) => {
      const m = e.model, out = [];
      for (const b of BONES) { const o = m[b]; if (o && o.rotation) out.push(o.rotation.x, o.rotation.y, o.rotation.z); }
      if (m.legs) for (const L of m.legs) out.push(L.up.rotation.x, L.low.rotation.x);
      if (m.rig) out.push(m.rig.scale.x, m.rig.scale.y, m.rig.position.y);
      return out;
    };
    // attack id → {type, opts, dist}
    const SETUP = {
      'bokoblin.swing': ['bokoblin', {}, 2.4], 'bokoblin.leap': ['bokoblin', {}, 7],
      'shaman.orb': ['shaman', { element: 'fire' }, 9],
      'chuchu.lunge': ['chuchu', { variant: 'normal' }, 2.6], 'chuchu.aura': ['chuchu', { variant: 'fire' }, 1.2],
      'lizard.thrust': ['lizard', {}, 2.4], 'lizard.lunge': ['lizard', {}, 7],
      'shroom.lob': ['shroom', {}, 8], 'wolf.bite': ['wolf', {}, 5], 'wraith.bolt': ['wraith', {}, 9],
      'voidknight.combo1': ['voidknight', {}, 2.4], 'voidknight.combo2': ['voidknight', {}, 2.4], 'voidknight.combo3': ['voidknight', {}, 2.4],
      'voidknight.slam': ['voidknight', {}, 3.4], 'voidknight.bash': ['voidknight', {}, 1.8],
    };
    /** Point 0.3 m inside / outside the locked decal edge (ground XZ). */
    function edgePoint(S, mode, side = 1) {
      const s = mode === 'inside' ? -0.3 : 0.3, P = S.pos, D = S.dir || { x: 0, z: 1 };
      const dl = Math.hypot(D.x, D.z) || 1, dx = D.x / dl, dz = D.z / dl;
      if (S.kind === 'cone') return [P.x + dx * (S.r + s), P.z + dz * (S.r + s)];
      if (S.kind === 'circle') { const p = pl(); let ux = p.x - P.x, uz = p.z - P.z; const l = Math.hypot(ux, uz); if (l < 0.2) { ux = 1; uz = 0; } else { ux /= l; uz /= l; } return [P.x + ux * (S.r + s), P.z + uz * (S.r + s)]; }
      if (S.kind === 'line') { const mx = P.x + dx * S.len * 0.5, mz = P.z + dz * S.len * 0.5, o = (S.width / 2 + s) * side; return [mx - dz * o, mz + dx * o]; }
      if (S.kind === 'capsule') { const Ee = S.end; let ux = Ee.x - P.x, uz = Ee.z - P.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; const mx = (P.x + Ee.x) / 2, mz = (P.z + Ee.z) / 2, o = (S.width / 2 + s) * side; return [mx - uz * o, mz + ux * o]; }
      return null;
    }
    const refOf = (h) => h?.S?.ref || h?.S || null;
    const results = {};
    function run(id, mode) {
      const [type, opts, dist] = SETUP[id];
      const spec = C.ATTACK_SPECS[id];
      clear(); PT.heal();
      place(SPOT.x, SPOT.z); PT.look(0, -0.2); PT.step(0.6);    // let any knockback from the previous run settle
      const p0 = pl().clone();
      const e = PT.spawnAt(type, p0.x, p0.z - dist, opts);
      if (!e) return { err: 'spawn' };
      PT.armor(e); e.facing = 0; e.object.rotation.y = 0;   // facing the player (+z) e.setState(e.chaseState || 'chase');
      if (id === 'chuchu.aura') e.noPhysics = true;
      PT.step(0.1);
      const n0 = { s: startLog.length, h: hurtLog.length, e: endLog.length, p: punLog.length };
      const ok = e.debugAttack(id);
      if (!ok) { E.remove(e); return { err: 'debugAttack false' }; }
      const ts = startLog.slice(n0.s).find((r) => r.p.enemy === e && r.p.id === id);
      const h = e.curAttack && e.curAttack.id === id ? e.curAttack : null;
      const rec = { id, mode, cls: spec.cls, t0: ts ? ts.et : null, dur: h?.dur ?? null, sigs: [], placed: false, canDuringPunish: null };
      let strikeET = null, prev = null, maxD = [];
      const frames = Math.round(((h?.dur ?? 1.5) + 2.2) * 60);
      for (let i = 0; i < frames; i++) {
        if (h && !rec.placed && (mode === 'inside' || mode === 'outside') && (h.locked || (id === 'chuchu.aura' && i === 1))) {
          const S = refOf(h);
          const pt = S && spec.tell !== 'projectile' || (S && id === 'shroom.lob') ? edgePoint(S, mode) : null;
          if (pt) {
            place(pt[0], pt[1]);
            // a world collider (rock, tree) may push the player off the test point: use the mirrored side then
            if (Math.hypot(pl().x - pt[0], pl().z - pt[1]) > 0.05) { const q = edgePoint(S, mode, -1); if (q) { pt[0] = q[0]; pt[1] = q[1]; place(pt[0], pt[1]); } }
            rec.offPt = +Math.hypot(pl().x - pt[0], pl().z - pt[1]).toFixed(3);
            rec.pt = pt; rec.placed = rec.offPt <= 0.05; rec.shape = S.kind; rec.S0 = { pos: [S.pos.x, S.pos.z], dir: S.dir && [S.dir.x, S.dir.z], len: S.len, w: S.width, et: g.enemyTime, st: h.start, dur: h.dur, e: [e.object.position.x, e.object.position.z], state: e.state }; }
        }
        if (rec.placed) place(rec.pt[0], rec.pt[1]);
        g.step(1, 1 / 60, false);
        PT.keepAlive();
        const s = sig(e);
        if (prev) { let d = 0; for (let k = 0; k < s.length; k++) d = Math.max(d, Math.abs(s[k] - prev[k])); maxD.push([g.enemyTime, d]); }
        prev = s;
        if (!rec.dbg && hurtLog.length > n0.h && hurtLog[hurtLog.length - 1].p.attackId === id) { const p = pl(), S = refOf(h); rec.dbg = { S0: rec.S0, pl: [+p.x.toFixed(2), +p.z.toFixed(2)], pt: rec.pt, e: [+e.object.position.x.toFixed(2), +e.object.position.z.toFixed(2)], st: e.state, S: S && { pos: [S.pos.x, S.pos.z], dir: S.dir && [S.dir.x, S.dir.z], len: S.len, w: S.width } }; }
        if (strikeET === null) { const te = endLog.slice(n0.e).find((r) => r.p.enemy === e && r.p.id === id && r.p.reason === 'strike'); if (te) strikeET = te.et; }
        const pw = punLog.slice(n0.p).find((r) => r.p.enemy === e);
        if (pw && rec.canDuringPunish === null && g.enemyTime < pw.et + pw.p.dur - 0.05) rec.canDuringPunish = g.tells?.canAttack ? g.tells.canAttack(e, { melee: true }) : null;
      }
      rec.strikeET = strikeET;
      const hurts = hurtLog.slice(n0.h).filter((r) => r.p.attackId === id);
      rec.hits = hurts.length;
      if (hurts.length) { rec.hurtET = hurts[0].et; rec.nameKo = hurts[0].p.attackNameKo; rec.kind = hurts[0].p.attackKind; }
      const pw = punLog.slice(n0.p).find((r) => r.p.enemy === e);
      rec.punish = pw ? { dur: +pw.p.dur.toFixed(2), mul: pw.p.mul } : null;
      // longest still run before the strike
      let run = 0, best = 0;
      for (const [et, d] of maxD) { if (rec.t0 === null || et <= rec.t0 || (strikeET !== null && et > strikeET + 1e-6)) { run = 0; continue; } if (d < 1e-5) { run++; best = Math.max(best, run); } else run = 0; }
      rec.holdSec = +(best / 60).toFixed(3);
      rec.floor = MIN[spec.cls] ?? 0;
      E.remove(e);
      return rec;
    }
    for (const id in SETUP) {
      const a = run(id, 'inside');
      const spec = C.ATTACK_SPECS[id];
      results[id] = { inside: a };
      if (a.err) { PT.check(`${id}: debugAttack starts the attack`, false, a.err); continue; }
      PT.check(`${id}: tellStart emitted`, a.t0 !== null);
      const lead = a.hurtET != null ? a.hurtET - a.t0 : null;
      PT.check(`${id}: damage ≥ ${a.floor} s after tellStart (${spec.cls})`, lead !== null && lead >= a.floor - 1e-3, { lead: lead && +lead.toFixed(3), dur: a.dur && +a.dur.toFixed(3), hits: a.hits });
      PT.check(`${id}: hold pose ≥ 0.1 s before the strike`, a.holdSec >= 0.099, a.holdSec);
      if (spec.tell !== 'projectile' || id === 'shroom.lob') {
        PT.check(`${id}: 0.3 m inside the drawn ${a.shape || '?'} → hit`, a.placed && a.hits > 0, { placed: a.placed, hits: a.hits });
        const b = run(id, 'outside');
        results[id].outside = b;
        PT.check(`${id}: 0.3 m outside the drawn ${b.shape || '?'} → no hit`, b.placed && b.hits === 0, { placed: b.placed, hits: b.hits, dbg: b.dbg });
      }
      if (spec.punishDur > 0) {
        PT.check(`${id}: punishWindow {dur ${spec.punishDur}, mul ${spec.punishMul}}`, a.punish && Math.abs(a.punish.dur - spec.punishDur) < 0.02 && a.punish.mul === spec.punishMul, a.punish);
        PT.check(`${id}: tells.canAttack false during the punish window`, a.canDuringPunish === false, a.canDuringPunish);
      }
    }
    // ---- projectiles: homing ≤ 0.5 s at ≤ 120°/s; sideways walk dodges; orbEta; ≤ 6 alive
    {
      clear(); place(SPOT.x, SPOT.z); PT.look(0, -0.2); PT.step(0.1);
      const p0 = pl().clone();
      const sh = PT.armor(PT.spawnAt('shaman', p0.x, p0.z - 10, { element: 'ice' })); sh.facing = Math.PI; sh.setState('kite');
      const P = E.projectiles;
      const n0 = hurtLog.length;
      sh.debugAttack('shaman.orb');
      let orb = null, launchT = null, prevDir = null, maxRate = 0, lastTurn = 0;
      for (let i = 0; i < 60 * 4.5; i++) {
        if (orb || (sh.curAttack && sh.curAttack.locked)) { const p = pl(); p.x += 5.5 / 60; p.y = PT.groundHeight(p.x, p.z) + 0.02; }
        g.step(1, 1 / 60, false); PT.keepAlive();
        if (!orb) { orb = P.orbs.find((o) => o.active && o.source === sh) || null; if (orb) launchT = orb.t; }
        if (orb && orb.active) {
          const v = orb.vel.clone().normalize();
          if (prevDir) { const a = Math.acos(Math.min(1, Math.max(-1, v.dot(prevDir)))); maxRate = Math.max(maxRate, a * 60); if (a > 1e-4) lastTurn = orb.t; }
          prevDir = v;
        }
      }
      const dodged = hurtLog.slice(n0).filter((r) => r.p.attackId === 'shaman.orb').length === 0;
      PT.check('orb homing ≤ 0.5 s at ≤ 120°/s, then straight', orb && lastTurn <= 0.5 + 1 / 30 && maxRate <= 120 * Math.PI / 180 * 1.02, { lastTurn: +lastTurn.toFixed(3), maxRateDeg: +(maxRate * 180 / Math.PI).toFixed(1), speed: orb && +orb.speed.toFixed(2) });
      PT.check('mob orb speed ≤ 8 m/s (shaman 7.5)', orb && orb.speed <= 7.5 + 1e-6, orb?.speed);
      PT.check('walking sideways at 5.5 m/s from 10 m dodges a shaman orb', dodged);
      // orbEta vs the real arrival (stationary player)
      clear(); place(SPOT.x, SPOT.z); PT.step(0.1);
      const p1 = pl().clone();
      const sh2 = PT.armor(PT.spawnAt('shaman', p1.x, p1.z - 10, { element: 'fire' })); sh2.facing = Math.PI; sh2.setState('kite');
      const n1 = hurtLog.length;
      sh2.debugAttack('shaman.orb');
      let eta = null, etaAt = null;
      for (let i = 0; i < 60 * 4; i++) {
        g.step(1, 1 / 60, false); PT.keepAlive();
        if (eta === null && P.orbCount() > 0) { const o = P.orbs.find((x) => x.active && x.source === sh2); if (o && o.t > 0.55) { eta = E.orbEta(pl()); etaAt = g.enemyTime; } }
        if (hurtLog.length > n1) break;
      }
      const hit = hurtLog.slice(n1).find((r) => r.p.attackId === 'shaman.orb');
      const real = hit && etaAt !== null ? hit.et - etaAt : null;
      PT.check('enemies.orbEta(pos) ≈ the real arrival (±0.15 s)', real !== null && Number.isFinite(eta) && Math.abs(eta - real) <= 0.15, { eta: eta && +eta.toFixed(3), real: real && +real.toFixed(3) });
      PT.check('orbEta → Infinity with no orb', (P.clear(), E.orbEta(pl()) === Infinity));
      for (let i = 0; i < 10; i++) P.orb(new T.Vector3(p1.x + i * 0.3, p1.y + 1.5, p1.z - 12), 'fire', sh2, { speed: 2 });
      PT.check('≤ 6 enemy orbs alive (oldest fizzles)', E.orbCount() === 6, E.orbCount());
      P.clear();
      E.remove(sh2); if (sh.alive) E.remove(sh);
    }
    // ---- off-screen melee rule
    {
      clear(); place(SPOT.x, SPOT.z); PT.look(0, -0.2); PT.step(0.1);
      const p0 = pl().clone();
      const b1 = PT.armor(PT.spawnAt('bokoblin', p0.x, p0.z + 5));   // behind the camera
      PT.step(0.05);
      const okBehind = b1.debugAttack('bokoblin.swing');
      E.remove(b1);
      const b2 = PT.armor(PT.spawnAt('bokoblin', p0.x, p0.z - 4));
      PT.step(0.05);
      const okFront = b2.debugAttack('bokoblin.swing');
      E.remove(b2);
      PT.check('off-screen melee > 3 m cannot start a windup; on-screen can', g.tells?.isStub ? null : okBehind === false && okFront === true, { okBehind, okFront, stub: !!g.tells?.isStub });
    }
    // ---- death cloud: tell first, hazard ticks only after it
    {
      clear(); place(SPOT.x, SPOT.z); PT.step(0.1);
      const p0 = pl().clone();
      const s = PT.spawnAt('shroom', p0.x + 0.5, p0.z - 1.2);
      const n0 = startLog.length, h0 = hurtLog.length;
      g.combat.dealDamage(s, { amount: 99999, fixed: true, source: 'player', noReaction: true });
      PT.step(0.4); PT.keepAlive();
      const early = hurtLog.slice(h0).filter((r) => r.p.attackId === 'shroom.deathCloud').length;
      PT.step(2.0); PT.keepAlive();
      const tsd = startLog.slice(n0).find((r) => r.p.id === 'shroom.deathCloud');
      const late = hurtLog.slice(h0).filter((r) => r.p.attackId === 'shroom.deathCloud');
      PT.check('shroom.deathCloud: 0.6 s swelling tell, then hazard ticks (none before)', !!tsd && early === 0 && late.length > 0 && late[0].et - tsd.et >= 0.6 - 1e-3, { tell: !!tsd, early, late: late.length, lead: late[0] && tsd ? +(late[0].et - tsd.et).toFixed(2) : null });
    }
    E.update = eu;
    PT.check('enemy FX: every vfx call from the enemies module passes owner', Object.keys(noOwner).length === 0, noOwner);
    const brief = {};
    for (const id in results) { const a = results[id].inside; brief[id] = a.err ? a.err : { lead: a.hurtET != null ? +(a.hurtET - a.t0).toFixed(2) : null, hold: a.holdSec, nameKo: a.nameKo, kind: a.kind }; }
    return brief;
  });
  if (m1) PT.note('M1 per attack: ' + JSON.stringify(m1));

  // ================================================================== M3
  await pg.run('M3', async (m1) => {
    const g = window.game, PT = window.PT, E = g.enemies;
    const C = await import('/src/enemies/codex.js');
    const book = E.codex?.() || {};
    const TYPES = ['bokoblin', 'shaman', 'chuchu', 'lizard', 'shroom', 'wolf', 'wraith', 'voidknight', ...C.CHU_TYPES.filter((v) => v !== 'normal').map((v) => 'chuchu:' + v)];
    const missing = [], badText = [];
    const SECONDS = /\d+(?:\.\d+)?\s*초/;
    const KEYS = /\b(Q|E|F|R|Space|Shift|Ctrl|LMB|RMB|Mouse\d)\b|스페이스|시프트|마우스/;
    for (const t of TYPES) {
      const c = book[t];
      if (!c) { missing.push(t + ': none'); continue; }
      for (const k of ['type', 'nameKo', 'roleKo', 'tipKo']) if (typeof c[k] !== 'string' || !c[k]) missing.push(`${t}.${k}`);
      for (const k of ['weak', 'resist', 'immune', 'attacks']) if (!Array.isArray(c[k])) missing.push(`${t}.${k}`);
      if (typeof c.boss !== 'boolean' || typeof c.elite !== 'boolean') missing.push(`${t}.boss/elite`);
      for (const a of c.attacks || []) for (const k of ['id', 'nameKo', 'tell', 'tellKo', 'counterKo']) if (!a[k]) missing.push(`${t}.${a.id}.${k}`);
      const texts = [c.tipKo, c.weakPointKo, c.parryKo, ...(c.attacks || []).flatMap((a) => [a.nameKo, a.tellKo, a.counterKo, a.parryKo, a.punishKo])].filter(Boolean);
      for (const s of texts) {
        const stripped = s.replace(/\{punishSec\}초/g, '');
        if (SECONDS.test(stripped)) badText.push(`${t}: seconds in "${s}"`);
        if (KEYS.test(s)) badText.push(`${t}: literal key in "${s}"`);
      }
      if (/\{defendKey\}|패링|완벽하게 막|완벽 방어/.test(c.tipKo)) badText.push(`${t}: parry advice in tipKo`);
      for (const a of c.attacks || []) if (/\{defendKey\}|패링|완벽 방어|완벽하게 막/.test((a.tellKo || '') + (a.counterKo || ''))) badText.push(`${t}.${a.id}: parry advice outside parryKo`);
    }
    PT.check('codex: every mob type + 8 말랑이 variants complete', missing.length === 0 && TYPES.length === 16, missing.slice(0, 10));
    PT.check('codex copy: no windup seconds, key names only via tokens, parry advice only in parryKo', badText.length === 0, badText.slice(0, 6));
    PT.check('codex: parryKo present for bokoblin / shaman / voidknight', ['bokoblin', 'shaman', 'voidknight'].every((t) => (book[t]?.attacks || []).some((a) => /\{defendKey\}/.test(a.parryKo || ''))));
    // ---- weakness fields on every entity
    for (const e of E.all.slice()) if (!e.isBoss) E.remove(e);
    const pp = g.player.object.position;
    const spawned = [];
    const mk = (t, o = {}) => { const e = PT.spawnAt(t, pp.x + 40 + spawned.length * 2, pp.z + 40, o); if (e) spawned.push(e); return e; };
    for (const t of ['bokoblin', 'shaman', 'lizard', 'shroom', 'wolf', 'wraith', 'voidknight', 'dummy']) mk(t);
    for (const v of C.CHU_TYPES) mk('chuchu', { variant: v });
    const badW = spawned.filter((e) => !Array.isArray(e.weakness) || !e.resist || typeof e.resist !== 'object' || !Array.isArray(e.immune) || !Array.isArray(e.attacks) || typeof e.debugAttack !== 'function' || typeof e.timeMul !== 'number' || !e.flashUniform || typeof e.rimSource !== 'function' || typeof e.tellAnchor !== 'function').map((e) => e.kind);
    PT.check('weakness / resist / immune / attacks / contract forwards on every entity', badW.length === 0 && spawned.length === 17, badW);
    const by = (k, v) => spawned.find((e) => e.kind === k && (v == null || e.variant === v));
    const W = {
      bokoblin: by('bokoblin').resist.fire === 1.3 && by('bokoblin').weakness.includes('fire'),
      shaman: by('shaman').resist.lightning === 1.3 && Object.values(by('shaman').resist).includes(0.5),
      wolf: by('wolf').resist.light === 1.5 && by('wolf').resist.shadow === 0.6,
      shroom: by('shroom').resist.fire === 1.5 && by('shroom').resist.nature === 0.5,
      lizardWater: by('lizard').resist.water === 0.5,
      chuFire: by('chuchu', 'fire').immune.includes('fire') && by('chuchu', 'fire').resist.water === 2 && by('chuchu', 'fire').resist.fire === 0,
      chuWind: by('chuchu', 'wind').resist.earth === 1.5 && /바람/.test(by('chuchu', 'wind').name),
      chuNormal: by('chuchu', 'normal').weakness.length === 0,
    };
    PT.check('§4 weakness values (incl. CHU_WEAK)', Object.values(W).every(Boolean), W);
    for (const e of spawned) E.remove(e);
    // ---- playerHurt metadata per attack (from M1)
    const meta = Object.entries(m1 || {}).filter(([, r]) => r && typeof r === 'object');
    const badM = meta.filter(([id, r]) => r.nameKo !== C.nameOf(id) || r.kind !== C.ATTACK_SPECS[id].kind).map(([id, r]) => `${id}: ${r.nameKo}/${r.kind}`);
    PT.check('playerHurt carries attackNameKo / attackKind for each mob attack', meta.length >= 14 && badM.length === 0, badM);
    // ---- encounters: first sight once per type, persisted
    E.debugResetEncounters?.();
    const L = PT.events('enemyEncounter'); const n0 = L.length;
    PT.look(0, -0.2);
    const w1 = PT.spawnAt('wolf', pp.x, pp.z - 12);
    PT.step(0.6);
    const w2 = PT.spawnAt('wolf', pp.x + 2, pp.z - 12);
    PT.step(0.6);
    const ev = L.slice(n0).filter((r) => r.p.type === 'wolf' && r.p.sight);
    PT.check('enemyEncounter {type, enemy, first, sight} once on first sight (≤ 30 m, in view)', ev.length === 1 && ev[0].p.first === true && ev[0].p.enemy === w1, ev.map((r) => ({ first: r.p.first, sight: r.p.sight })));
    const again = E.noteEncounter('wolf', { sight: true });
    const names = g.save?.sectionNames?.() || [];
    PT.check('encounters persisted (save section "encounters"; noteEncounter → first:false after sight)', again.first === false && names.includes('encounters'), { again, names });
    w1.aggro = true; w2.aggro = true;
    PT.check('aggroCount()', E.aggroCount() >= 2, E.aggroCount());
    E.remove(w1); E.remove(w2);
    PT.check('previewModel(type) returns an Object3D', !!E.previewModel?.('bokoblin')?.isObject3D);
    const bench = E.spawnBench?.(4) || [];
    PT.check('spawnBench(n) → n bench mobs (no damage / loot / XP)', bench.length === 4 && bench.every((e) => e.bench && e.noDamage && e.xpValue === 0));
    E.despawnBench?.(bench);
  }, m1);
  // ================================================================== perf (§2.6 mobs row; numbers for the notes)
  await pg.run('perf', () => {
    const g = window.game, PT = window.PT, E = g.enemies;
    for (const e of E.all.slice()) if (!e.isBoss) E.remove(e);
    PT.tp(-20, 45, 0.2); PT.look(0, -0.2);
    const cp = g.camera.position;
    const near = PT.spawnAt('bokoblin', cp.x, cp.z - 12), mid = PT.spawnAt('bokoblin', cp.x + 40, cp.z - 25), far = PT.spawnAt('bokoblin', cp.x + 70, cp.z - 30);
    const cnt = new Map();
    for (const e of [near, mid, far]) { const f = e.pose; e.pose = (...a) => { cnt.set(e, (cnt.get(e) || 0) + 1); return f(...a); }; }
    PT.step(1.0);
    const n = [near, mid, far].map((e) => cnt.get(e) || 0);
    PT.check('skinned animation: full rate < 30 m, half rate 30–60 m, paused > 60 m (camera distance)', n[0] >= 55 && n[1] >= 25 && n[1] <= 35 && n[2] === 0, n);
    for (const e of [near, mid, far]) E.remove(e);
    // 12-mob F roster: enemies.update CPU (render off), median of 120 frames
    const R = [['bokoblin'], ['bokoblin'], ['wolf'], ['wolf'], ['lizard'], ['shaman'], ['voidknight'], ['shroom'], ['wraith'], ['chuchu', { variant: 'normal' }], ['chuchu', { variant: 'fire' }], ['chuchu', { variant: 'ice' }]];
    const pp = g.player.object.position;
    const foes = R.map(([t, o], i) => { const a = i / R.length * Math.PI * 2; return PT.armor(PT.spawnAt(t, pp.x + Math.sin(a) * 8, pp.z + Math.cos(a) * 8, o || {})); });
    PT.step(1.0);
    const eu = E.update.bind(E), ts = [];
    E.update = (...a) => { const t = performance.now(); try { return eu(...a); } finally { ts.push(performance.now() - t); } };
    for (let i = 0; i < 120; i++) { g.step(1, 1 / 60, false); PT.keepAlive(); }
    E.update = eu;
    ts.sort((x, y) => x - y);
    PT.note(`enemies.update with 12 armoured attacking mobs (SwiftShader host CPU): median ${ts[60].toFixed(3)} ms, p95 ${ts[114].toFixed(3)} ms; orbs alive ${E.orbCount()}; tells active ${g.tells?.active?.().length ?? '-'}`);
    for (const e of foes) E.remove(e);
  });
  const errs = pg.errors();
  PT.check('no console errors', errs.length === 0, errs.slice(0, 5));
  await pg.close();
};
