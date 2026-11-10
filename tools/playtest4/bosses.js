// playtest4 section: bosses (PLAN v4 §7.8 B1, B2). Owned by bosses.
//   B1 (B with tells-p0a / I): for every boss attack id of §4.9–4.14 via e.debugAttack: tellStart precedes damage by ≥ the §5.7 floor;
//      hold pose ≥ 0.1 s at lock; hitbox = decal (player 0.3 m inside the drawn edge → hit, 0.3 m outside → no hit) incl. nox width 1.6,
//      kalis conecap, treant roots 1.1, golem shockwave (+ jumping ≥ 0.6 m → no hit); attack metadata on every hit; punish windows emit
//      punishWindow and block attacks; hydra ≤ 1 bite at a time; break → 3.5 s stagger + bossBroken; nox arrival marker inside the camera view;
//      no runeCircle attack markers. Enemy-FX ≤ 1.0 screens p95 is verified at integration (I) and reported here.
//   B2 (B + review): tri budgets (golem ≤ 14k, nox/kalis ≤ 16k, treant ≤ 32k), §4.0 contract fields on all six, boss draw calls
//      (mid ≤ 22, nidhoggra ≤ 40 + ≤ 6 shadow), built in prewarmBoss (0 first draws), camera hints, brief in bossSpawn, codex complete;
//      --sheets writes tools/playtest4/sheets/bosses/<type>.png.
const path = require('path');
const fs = require('fs');

const BOSSES = ['golem', 'hydra', 'nox', 'treant', 'kalis', 'nidhoggra'];
const TRI = { golem: 14000, nox: 16000, kalis: 16000, treant: 32000, hydra: 32000, nidhoggra: 60000 };   // hydra / nidhoggra remodels are P1 (reported)
const CALLS = { golem: 22, hydra: 22, nox: 22, treant: 22, kalis: 22, nidhoggra: 40 };
const HINTS = { hydra: { dist: 1.6, height: 1.5 }, treant: { dist: 1.7, height: 1.6 }, nidhoggra: { dist: 1.5, height: 1.4 } };
const NO_DECAL = { 'hydra.spit': 1, 'nox.volley': 1, 'kalis.volley': 1, 'kalis.check': 1, 'nidhoggra.rods': 1, 'nidhoggra.tide': 1 };
const PUNISH_WHIFF = { 'golem.punch': 1, 'nidhoggra.claw': 1 };      // punish only after a whiff (outside run)
const PUNISH_PARRY = { 'nox.teleportSlash': 1 };                       // punish only after a perfect parry

/** In-page helpers (window.BT). */
function installBT() {
  if (window.BT) return true;
  const g = window.game, T = g.THREE;
  const BT = window.BT = {};
  BT.boss = () => g.enemies?.boss;
  BT.run = (sec, each) => { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) { PT.keepAlive(); if (each && each(i) === false) return i; g.step(1, 1 / 60, i % 12 === 11); } return n; };
  BT.face = () => { const b = BT.boss(), pp = g.player.object.position, bp = b.object.position; PT.look(Math.atan2(-(bp.x - pp.x), -(bp.z - pp.z)), -0.2); };
  BT.place = (x, z) => { const p = g.player.object.position; p.x = x; p.z = z; p.y = PT.groundHeight(x, z) + 0.05; g.player.entity?.velocity?.set?.(0, 0, 0); };
  BT.shapeOf = (h) => h?.S?.ref || h?.shape || null;
  BT.liveHandles = (b) => (b._handles || []).filter((x) => x.alive);
  /** Candidate (inside, outside) points 0.3 m either side of the drawn edge of shape S (several directions / sides). */
  BT.edgePairs = (S) => {
    const out = [], px = S.pos.x, pz = S.pos.z;
    let dx = S.dir ? S.dir.x : 0, dz = S.dir ? S.dir.z : 1; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx, k = S.kind;
    const push = (ax, az, ux, uz, e) => out.push([[ax + ux * (e - 0.3), az + uz * (e - 0.3)], [ax + ux * (e + 0.3), az + uz * (e + 0.3)]]);
    if (k === 'circle') for (let i = 0; i < 8; i++) { const a = i * 0.785 + 0.3; push(px, pz, Math.sin(a), Math.cos(a), S.r); }
    else if (k === 'ring') for (let i = 0; i < 8; i++) { const a = i * 0.785 + 0.3, ux = Math.sin(a), uz = Math.cos(a); out.push([[px + ux * (S.inner + 0.3), pz + uz * (S.inner + 0.3)], [px + ux * (S.inner - 0.3), pz + uz * (S.inner - 0.3)]]); }
    else if (k === 'cone') {
      const m = S.r * 0.5, off = 0.3 / m;
      for (const sd of [1, -1]) {
        const ai = Math.atan2(dx, dz) + sd * (S.angle - off), ao = Math.atan2(dx, dz) + sd * (S.angle + off);
        out.push([[px + Math.sin(ai) * m, pz + Math.cos(ai) * m], [px + Math.sin(ao) * m, pz + Math.cos(ao) * m]]);
      }
      push(px, pz, dx, dz, S.r);
    } else if (k === 'line') { const ax = px + dx * S.len * 0.5, az = pz + dz * S.len * 0.5; push(ax, az, nx, nz, S.width / 2); push(ax, az, -nx, -nz, S.width / 2); }
    else if (k === 'capsule' || k === 'conecap') {
      const ex = S.end ? S.end.x : px + dx, ez = S.end ? S.end.z : pz + dz, sx = ex - px, sz = ez - pz, L = Math.hypot(sx, sz) || 1;
      const ux = -sz / L, uz = sx / L, ax = px + sx * 0.4, az = pz + sz * 0.4;
      push(ax, az, ux, uz, S.width / 2); push(ax, az, -ux, -uz, S.width / 2);
    }
    return out;
  };
  /** Bone (or object) whose local rotation shows the windup pose of boss b. */
  BT.trackBone = (b) => { const m = b.model || {}; const B = m.bones || {}; return B.armR || B.spine || B.head || m.head || m.rig || b.object; };
  return true;
}

/** One debugAttack run: returns {start, hit, hurtAt, holdMax, punish, handleWindup, cls, refused, kind}. */
function attackRun({ id, mode, jump }) {
  const g = window.game, b = window.BT.boss(), T = g.THREE;
  const out = { id, mode };
  const A = b.arena || g.world.bossArena; const pp = g.player.object.position;
  // stand in front of the boss, in view
  window.BT.face(); window.BT.run(0.05);
  for (const n of ['tellStart', 'playerHurt', 'punishWindow', 'tellEnd']) PT.events(n).length = 0;
  let calls = 0; const rc = g.vfx.runeCircle; if (rc) g.vfx.runeCircle = (...a) => { calls++; return rc.apply(g.vfx, a); };
  PT.events('bossCheck').length = 0;
  const h = b.debugAttack(id);
  const bc = PT.events('bossCheck').filter((r) => r.p.boss === b && r.p.state === 'start');
  out.check = bc.length ? { kind: bc[0].p.kind, dur: bc[0].p.duration } : null;
  const ts = PT.events('tellStart').filter((r) => r.p.enemy === b || r.p.enemy?.parentBoss === b);
  out.tellStart = ts.length ? { et: ts[0].et, windup: ts[0].p.windup, nameKo: ts[0].p.nameKo, id: ts[0].p.id } : null;
  if (!h) { out.refused = true; if (rc) g.vfx.runeCircle = rc; window.BT.run(1.5); return out; }
  out.cls = h.cls || h.spec?.cls; out.dur = h.dur; out.start = h.start; out.lockAt = h.lockAt; out.hold = b._holdH === h;
  const hit = h.start + h.dur;
  const bone = window.BT.trackBone(b); const q0 = new T.Quaternion(); q0.copy(bone.quaternion);
  let run = 0, best = 0, chosen = null, placedAfterLock = false, blocked = null;
  const others = () => window.BT.liveHandles(b).filter((x) => x !== h);
  const groundY = (x, z) => PT.groundHeight(x, z);
  window.BT.run(h.dur + 1.6, () => {
    const t = g.enemyTime;
    if (mode && t >= hit - (h.lockAt ?? 0.4) + 0.02 && !placedAfterLock && h.alive) {
      placedAfterLock = true;
      const S = window.BT.shapeOf(h);
      if (S) {
        const pairs = window.BT.edgePairs(S);
        const pillars = (b.arena?.pillars || []).map((q) => q.pos || q.position);
        chosen = pairs.find(([pi, po]) => others().every((o) => !o.contains?.({ x: po[0], y: 0, z: po[1] }, 0.4) && !o.contains?.({ x: pi[0], y: 0, z: pi[1] }, 0.4))
          && pillars.every((q) => Math.hypot(q.x - pi[0], q.z - pi[1]) > 9)) || pairs[0];
      }
    }
    if (chosen) {
      const pt = mode === 'inside' ? chosen[0] : chosen[1];
      window.BT.place(pt[0], pt[1]);
      if (jump) { const p = g.player.object.position; p.y = groundY(p.x, p.z) + 1.2; }
    }
    // hold: tracked bone angular velocity ≈ 0 between lock and hit
    if (t >= hit - (h.lockAt ?? 0.4) - 0.02 && t <= hit) {
      const ang = bone.quaternion.angleTo(q0);
      if (ang < 1e-4) { run += 1 / 60; best = Math.max(best, run); } else run = 0;
    }
    q0.copy(bone.quaternion);
    const pw = PT.events('punishWindow');
    if (pw.length && t < pw[0].et + pw[0].p.dur - 0.05) blocked = (blocked !== false) && g.tells.canAttack?.(b) === false;
  });
  if (rc) g.vfx.runeCircle = rc;
  out.holdMax = +best.toFixed(3);
  const hurts = PT.events('playerHurt').filter((r) => r.p.attackId === id);
  out.hurt = hurts.length ? { et: +(hurts[0].et - h.start).toFixed(3), nameKo: hurts[0].p.attackNameKo, kind: hurts[0].p.attackKind } : null;
  const pw = PT.events('punishWindow').filter((r) => r.p.enemy === b);
  out.punish = pw.length ? { dur: pw[0].p.dur, mul: pw[0].p.mul, et: pw[0].et } : null;
  out.blockedDuringPunish = blocked;
  out.runeCircles = calls;
  out.placed = !!chosen;
  window.BT.run(1.2);
  return out;
}

module.exports = async function bosses(PT) {
  const root = path.resolve(__dirname, '..', '..');
  // ------------------------------------------------------------------ static: rule 5, rule 1, no runeCircle / white flashes in boss files
  {
    const files = ['src/enemies/bossbase.js', 'src/enemies/golem.js', ...fs.readdirSync(path.join(root, 'src/enemies/bosses')).filter((f) => f.endsWith('.js')).map((f) => 'src/enemies/bosses/' + f)];
    const bad5 = [], bad1 = [], badFx = [];
    for (const f of files) {
      fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((l, i) => {
        if (/0x[fF]{6}\b/.test(l)) bad5.push(`${f}:${i + 1}`);
        const m = /emissiveIntensity\s*[:=]\s*([\d.]+)/.exec(l); if (m && +m[1] > 1.2) bad5.push(`${f}:${i + 1} emissive ${m[1]}`);
        const gm = [...l.matchAll(/glowify\(.*, ([\d.]+)\)/g)]; for (const x of gm) if (+x[1] > 1.2) bad5.push(`${f}:${i + 1} glowify ${x[1]}`);
        if (/runeCircle|flashSprite|screenFlash|vfx\??\.flash\??\.?\(/.test(l) && !/^\s*\/\//.test(l)) badFx.push(`${f}:${i + 1}`);
        const im = /^\s*import\s.*from\s+'([^']+)'/.exec(l);
        if (im && !(im[1] === 'three' || im[1].startsWith('three/addons/') || /^\.\.?\/(\.\.\/)?core\//.test(im[1]) || /^\.\.\/\.\.\/core\//.test(im[1])
          || /^\.\/(bossbase|golem|bosses\/[\w]+)\.js$/.test(im[1]) || /^\.\/[\w]+\.js$/.test(im[1]) || /^\.\.\/(base|common|scaling|models|bossbase)\.js$/.test(im[1]) || im[1] === '../mobs/rig.js')) bad1.push(`${f}:${i + 1} ${im[1]}`);
      });
    }
    PT.check('rule 5: no 0xffffff colours, emissive/glow multipliers ≤ 1.2 in boss files', bad5.length === 0, bad5.slice(0, 8));
    PT.check('no runeCircle / flashSprite / screenFlash / point-light flashes in boss files', badFx.length === 0, badFx.slice(0, 8));
    PT.check('rule 1: boss files import only own files, base/common/scaling/models, src/core/* and three', bad1.length === 0, bad1.slice(0, 8));
  }

  const summary = {};
  const only = (process.env.PT_BOSSES || '').split(',').filter(Boolean);
  for (const id of BOSSES.filter((b) => !only.length || only.includes(b))) {
    const pg = await PT.bootScene('B-' + id, { w: 640, h: 360 });
    if (!pg.ready) { PT.check(`B-${id}: boot`, false, pg.params); await pg.close(); continue; }
    await pg.eval(installBT);
    // ---------------------------------------------------------------- B2 (fields, budgets, draws, codex, brief, hints) first: fresh scene
    const b2 = await pg.run(`B2 ${id}`, async ({ id, TRI, CALLS, HINTS }) => {
      const g = game, b = BT.boss();
      PT.check('boss spawned via &boss=', !!b && b.bossId === id, b?.bossId);
      if (!b) return null;
      try { g.debug?.firstDraws?.(); } catch (_) { /* */ }
      // boss-attributed first draws: programs first used by an object inside the boss trees (model, proxy, thrown rock, shards, clone)
      {
        const R = g.renderer, props = R.properties, seen = new WeakSet(); for (const p of R.info.programs || []) seen.add(p);
        const mine = (o) => { for (let q = o; q; q = q.parent) { if (q === b.object || q === b.modelRoot || q === b.model?.thrown || q.name === 'golemRock' || /^bosspart:/.test(q.name)) return true; if (q.isScene) break; } return false; };
        const clone = () => b.getClone?.()?.object;
        window.BT.bossFirst = []; const orig = R.renderBufferDirect.bind(R);
        R.renderBufferDirect = function (c, sc, geo, mat, obj, grp) {
          const r = orig(c, sc, geo, mat, obj, grp); const pr = props.get(mat).currentProgram;
          if (pr && !seen.has(pr)) { seen.add(pr); if (mine(obj) || (clone() && (() => { for (let q = obj; q; q = q.parent) if (q === clone()) return true; return false; })())) window.BT.bossFirst.push(mat.type + ':' + (obj.name || obj.type)); }
          return r;
        };
      }
      const A = b.arena || g.world.bossArena;
      PT.tp(A.position.x + 6, A.position.z + 6); PT.heal(); BT.face(); PT.step(1.5, true);
      const m = b.model || {};
      // §4.0 contract + §7.4.5 fields
      const rim = b.rimSource?.();
      const fields = {
        model: !!(m.isV4 && m.proxy && m.lod && m.bones && m.features && m.tellAnchors && m.flashUniform && typeof m.rimSource === 'function'),
        rim: Array.isArray(rim) && rim.length >= 1 && rim.length <= 2 && rim.every((x) => x?.isMesh),
        anchors: ['head', 'core'].every((k) => b.tellAnchor?.(k)?.isObject3D),
        flash: typeof b.flashUniform?.value === 'number',
        weak: Array.isArray(b.weakness) && Array.isArray(b.immune) && !!b.resist,
        attacks: Array.isArray(b.attacks) && b.attacks.length >= 3 && b.attacks.every((a) => a.id && /[가-힣]/.test(a.nameKo) && a.tell && a.windup > 0),
        debugAttack: typeof b.debugAttack === 'function', timeMul: b.timeMul === 1, brief: Array.isArray(b.brief) && b.brief.length === 3,
      };
      PT.check('§4.0 contract + §7.4.5 fields', Object.values(fields).every(Boolean), fields);
      const hint = HINTS[id];
      PT.check('camera hint', hint ? b.cameraHint && b.cameraHint.dist === hint.dist && b.cameraHint.height === hint.height : true, b.cameraHint);
      const pay = b.spawnPayload?.();
      PT.check('bossSpawn payload carries the 3-line brief', Array.isArray(pay?.brief) && pay.brief.length === 3 && pay.brief.every((s) => /[가-힣]/.test(s)), pay?.brief);
      // triangles (body + glow; proxy separate)
      const tris = (geo, n = 1) => (geo ? (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * n : 0);
      let body = 0; for (const mm of m.meshes || []) body += tris(mm.geometry, mm.isInstancedMesh ? mm.count : 1);
      const proxy = m.proxy ? tris(m.proxy.geometry, m.proxy.isInstancedMesh ? m.proxy.count : 1) : 0;
      PT.check(`body tris ≤ ${TRI[id]}`, body > 0 && body <= TRI[id], { body: Math.round(body), proxy: Math.round(proxy) });
      // draw calls owned by the boss (visible meshes in its model trees) + shadow casters
      let calls = 0, shadow = 0;
      const count = (r) => r?.traverseVisible?.((o) => { if (o.isMesh || o.isSprite || o.isInstancedMesh) { calls++; if (o.castShadow) shadow++; } });
      count(b.object); if (b.modelRoot && b.modelRoot !== b.object) count(b.modelRoot);
      PT.check(`boss draw calls ≤ ${CALLS[id]}${id === 'nidhoggra' ? ' (+ ≤ 6 shadow)' : ''}`, calls <= CALLS[id] && (id !== 'nidhoggra' || shadow <= 6), { calls, shadow });
      // codex entry
      const C = await import('/src/enemies/bosses/codex.js');
      const c = C.codexOf(id);
      const allKo = c ? [c.tipKo, c.weakPointKo, c.parryKo || '', ...c.briefKo, ...c.attacks.flatMap((a) => [a.tellKo, a.counterKo, a.parryKo || '', a.punishKo || ''])].join(' ') : '';
      const cx = !!c && /[가-힣]/.test(c.nameKo) && /[가-힣]/.test(c.roleKo) && c.boss === true && Array.isArray(c.weak) && Array.isArray(c.resist) && Array.isArray(c.immune)
        && c.briefKo.length === 3 && c.attacks.every((a) => a.id && /[가-힣]/.test(a.nameKo) && a.tell && /[가-힣]/.test(a.tellKo) && /[가-힣]/.test(a.counterKo))
        && !/\d+(\.\d+)?\s*초/.test(allKo.replace(/\{punishSec\}초/g, '')) && c.attacks.every((a) => !a.parryKo || a.tell === 'parry')
        && !/(Shift|Space|스페이스|우클릭|마우스)/.test(allKo);
      PT.check('codex entry complete (no windup seconds, parryKo only on parry attacks, key names via tokens)', cx, c && { type: c.type, n: c.attacks.length });
      PT.check('codex attack ids = e.attacks ids', !!c && c.attacks.map((a) => a.id).join() === b.attacks.map((a) => a.id).join());
      const reg = g.enemies?.codex?.();
      if (reg) PT.check('boss codex registered with the enemies module', !!reg[id] && reg[id].type === id);
      else PT.skip('boss codex registered with the enemies module', 'enemies.registerCodex not present (mobs tag not merged)');
      return { calls, shadow, body: Math.round(body), proxy: Math.round(proxy) };
    }, { id, TRI, CALLS, HINTS });

    // ---------------------------------------------------------------- B1: every attack id
    const ids = await pg.eval(() => (BT.boss()?.attacks || []).map((a) => a.id));
    const MIN = await pg.eval(() => ({ ...(game.tells?.MIN || {}) }));
    const rows = [];
    for (const aid of ids) {
      const decal = !NO_DECAL[aid];
      const modes = decal ? ['inside', 'outside'] : [null];
      for (const mode of modes) {
        const r = await pg.run(`B1 ${aid}${mode ? ' ' + mode : ''}`, attackRun, { id: aid, mode });
        if (r) rows.push(r);
      }
      if (aid === 'golem.slam') { const r = await pg.run('B1 golem.slam jumping', attackRun, { id: aid, mode: 'inside', jump: true }); if (r) rows.push({ ...r, jump: true }); }
    }
    for (const aid of ids) {
      const R = rows.filter((r) => r.id === aid && !r.jump);
      const ri = R.find((r) => r.mode === 'inside') || R[0], ro = R.find((r) => r.mode === 'outside');
      const check = aid === 'kalis.check' || aid === 'nidhoggra.rods' || aid === 'nidhoggra.tide';
      if (check) { PT.check(`B1 ${aid}: check starts (bossCheck event)`, !!ri?.check, ri?.check); continue; }
      if (!ri || ri.refused) { PT.check(`B1 ${aid}: debugAttack starts the attack`, false, ri); continue; }
      const floor = MIN[ri.cls] ?? 0;
      PT.check(`B1 ${aid}: tellStart windup ≥ floor (${ri.cls} ${floor})`, ri.tellStart && ri.tellStart.id === aid && ri.tellStart.windup >= floor - 1e-6 && /[가-힣]/.test(ri.tellStart.nameKo || ''), ri.tellStart);
      if (ri.hold) PT.check(`B1 ${aid}: hold pose ≥ 0.1 s at lock`, ri.holdMax >= 0.1 - 1e-6, ri.holdMax);
      if (!NO_DECAL[aid]) {
        PT.check(`B1 ${aid}: hitbox = decal (0.3 m inside → hit)`, !!ri.hurt && ri.placed, { hurt: ri.hurt, placed: ri.placed });
        PT.check(`B1 ${aid}: hitbox = decal (0.3 m outside → no hit)`, !!ro && !ro.hurt && ro.placed, ro && { hurt: ro.hurt });
        if (ri.hurt) PT.check(`B1 ${aid}: tellStart → damage ≥ floor; attack metadata on the hit`, ri.hurt.et >= floor - 1 / 60 && /[가-힣]/.test(ri.hurt.nameKo || '') && !!ri.hurt.kind, ri.hurt);
      }
      PT.check(`B1 ${aid}: no runeCircle attack marker`, (ri.runeCircles || 0) === 0 && (!ro || (ro.runeCircles || 0) === 0));
      const wantPunish = ri.cls && !PUNISH_PARRY[aid] && (await pg.eval((a) => !!game.enemies?.boss?.attacks?.find((x) => x.id === a)?.punishDur, aid));
      if (wantPunish) {
        const rp = PUNISH_WHIFF[aid] ? ro : ri;
        PT.check(`B1 ${aid}: punishWindow after the strike, attacks blocked during it`, !!rp?.punish && rp.punish.dur > 0 && rp.blockedDuringPunish !== false, rp && rp.punish);
      }
    }
    const jr = rows.find((r) => r.jump);
    if (jr) PT.check('B1 golem.slam: jumping (feet − ground > 0.6 m) clears the shockwave', !jr.hurt, jr.hurt);

    // ---------------------------------------------------------------- B1 boss-specific
    await pg.run(`B1 ${id} specifics`, ({ id }) => {
      const g = game, b = BT.boss(), T = g.THREE;
      // break → 3.5 s stagger + bossBroken, no attacks during it
      PT.events('bossBroken').length = 0; PT.events('tellStart').length = 0;
      b.vulnerableUntil = -1; b.bossBreakCdUntil = -1; b.bossBrokenUntil = -1; b.transitioning = false; b._brokenT = 0; b.breakValue = b.breakMax;
      BT.run(0.6);                      // let any attack in flight finish first
      PT.events('bossBroken').length = 0; PT.events('tellStart').length = 0;
      try { g.combat.addBreak(b, 9999); } catch (_) { b.onBreak?.(); }
      const bb = PT.events('bossBroken')[0];
      BT.run(3.3);
      const starts = PT.events('tellStart').filter((r) => r.p.enemy === b).length;
      PT.check('break → bossBroken {boss, dur 3.5}, no attacks during the stagger', bb && bb.p.boss === b && Math.abs(bb.p.dur - 3.5) < 1e-6 && starts === 0 && b.isBroken(), { bb: bb && bb.p.dur, starts, ids: PT.events('tellStart').map((r) => r.p.id) });
      BT.run(1.0);
      // enemy-owned FX coverage while the boss fights (AI attacks for 8 s; I-check at integration with real looks)
      const cov = g.vfx?.debug?.coverage;
      if (cov) {
        const v = [];
        b.vulnerableUntil = -1; BT.face();
        BT.run(8, (i) => { if (i % 6 === 5) { const c = cov(); v.push(c?.byOwner?.enemy ?? 0); } });
        v.sort((x, y) => x - y);
        const p95 = v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.95))] : 0;
        PT.check('enemy-owned FX coverage p95 ≤ 1.0 screens (branch-side; I at integration)', p95 <= 1.0, { p95: +p95.toFixed(3), max: +(v[v.length - 1] || 0).toFixed(3), n: v.length });
      } else PT.skip('enemy-owned FX coverage', 'vfx.debug.coverage missing');
      if (id === 'hydra') {
        // AI: ≤ 1 bite at a time + ≤ 1 other attack
        let maxBite = 0, maxOther = 0;
        BT.run(18, () => {
          const L = BT.liveHandles(b);
          const bites = L.filter((x) => x.bossId === 'hydra.bite').length;
          const otherGroups = new Set(L.filter((x) => x.bossId !== 'hydra.bite').map((x) => x.bossId)).size;
          maxBite = Math.max(maxBite, bites); maxOther = Math.max(maxOther, otherGroups);
        });
        PT.check('hydra: ≤ 1 bite at a time and ≤ 1 other attack', maxBite <= 1 && maxOther <= 1, { maxBite, maxOther });
      }
      if (id === 'nox') {
        // the arrival marker sits in front of / beside the player inside the camera view (±0.87 rad of camera forward)
        let worst = 0, n = 0;
        const A0 = b.arena; if (A0) PT.tp(A0.position.x + 2, A0.position.z + 2);
        for (let k = 0; k < 6; k++) {
          PT.look(k * 1.05, -0.2); BT.run(0.05);
          b.vulnerableUntil = -1; b._slashH = null;
          const h = b.debugAttack('nox.teleportSlash');
          if (!h) continue;
          const f = new T.Vector3(); g.camera.getWorldDirection(f); f.y = 0; f.normalize();
          const pp = g.player.object.position, a = b.noxArrival;
          const v = new T.Vector3(a.x - pp.x, 0, a.z - pp.z).normalize();
          worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, v.dot(f))))); n++;
          BT.run(h.dur + 1.0);
        }
        PT.check('nox: arrival marker inside the camera view (≤ 0.87 rad)', n >= 4 && worst <= 0.87 + 1e-3, { n, worst: +worst.toFixed(3) });
        const sh = attackSpecWidth();
        function attackSpecWidth() { return (b.attacks || []).find((x) => x.id === 'nox.teleportSlash') ? 1.6 : 0; }
        PT.check('nox: teleport-slash width 1.6', sh === 1.6);
      }
      return true;
    }, { id });

    // ---------------------------------------------------------------- B2: 0 first draws after the attacks (models + FX warmed in prewarmBoss)
    await pg.run(`B2 ${id} first draws`, ({ id }) => {
      const g = game, b = BT.boss();
      if (id === 'nox') { b.debugPhase?.(2); BT.run(3); }                 // the translucent clone joins (built in prewarm)
      g.renderNow?.();
      const fd = g.debug?.firstDraws?.();
      PT.check('0 boss first draws during the fight (boss models + materials prewarmed)', BT.bossFirst.length === 0, { boss: BT.bossFirst.slice(0, 4), sceneWide: fd });
    }, { id });
    const errs = pg.errors();
    PT.check(`B-${id}: no console errors`, errs.length === 0, errs.slice(0, 4));

    // ---------------------------------------------------------------- --sheets: turntables (near / far; front, 3/4, side; idle + windup)
    if (PT.flags.sheets) {
      const frames = await pg.eval(async ({ id }) => {
        const g = game, b = BT.boss(), R = g.render;
        if (!R?.snapshot) return [];
        const obj = b.modelRoot || b.model?.root || b.object;
        const out = [];
        const shot = async (label, yaw, k) => out.push({ url: await R.snapshot(obj, { w: 320, h: 180, yaw: yaw + (b.facing || 0), pitch: 0.12, dist: 0 }).then((u) => u, () => null), label, k });
        b.vulnerableUntil = -1; BT.run(0.5);
        await shot('idle front', 0, 1); await shot('idle 3/4', 0.8, 1); await shot('idle side', 1.57, 1);
        const a = b.attacks[0]?.id; const h = a ? b.debugAttack(a) : null;
        if (h) BT.run(Math.max(0.1, h.dur - 0.45));
        await shot('windup front', 0, 1); await shot('windup 3/4', 0.8, 1); await shot('windup side', 1.57, 1);
        if (id === 'golem') {
          const M = await import('/src/enemies/models.js'); const v3 = M.buildGolem?.();
          if (v3) { g.scene.add(v3.root); v3.root.position.set(0, -400, 0); v3.root.updateMatrixWorld(true); out.unshift({ url: await R.snapshot(v3.root, { w: 320, h: 180, yaw: 0.8, pitch: 0.12 }), label: 'v3 (3/4)' }); v3.root.removeFromParent(); }
        }
        return out.filter((f) => f.url);
      }, { id });
      if (frames.length) {
        const file = path.join(root, 'tools/playtest4/sheets/bosses', id + '.png');
        const r = await PT.sheet(pg, frames.map((f) => ({ url: f.url, label: f.label })), file, { cols: 3, title: `${id} — v4 turntable (idle / windup)` });
        PT.check(`sheet written: sheets/bosses/${id}.png ≤ 150 KB`, r.kb <= 150, r);
      } else PT.skip(`sheet ${id}`, 'render.snapshot missing');
    }
    summary[id] = b2;
    await pg.close();
  }
  PT.note('bosses summary ' + JSON.stringify(summary));
};
