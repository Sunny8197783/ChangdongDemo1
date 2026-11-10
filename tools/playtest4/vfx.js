// playtest4 section: vfx (PLAN v4 §7.8 V1–V4; owner vfx). Run: node tools/playtest4.js vfx [--full]
//  V4 kit: every primitive renders (> 200 px), rings are annulus strips, linework = 1 program, kit programs ≤ 6, kit materials
//     prewarmed, FM pools ≤ 2 calls per element, no hatch / chevron / diamond kinds, grep rule 5 clean (src/vfx*, src/combat*)
//  V2 ducking: fxMulAt 1.0 default / 0.5 inside true shapes / 1.0 just outside, line ≥ 0.7, near-camera < 0.05, fxFactor composes,
//     enemy particles unaffected, patched materials keep distinct program keys, shared materials refused
//  V3 impacts: impact_<el> ×9 + 6 reaction families newWhite ≤ 1.5 % / 4 %, ≤ 12 sparks per per-target hit, 1 burst per castId,
//     enemy style (no hi, no reserved hue), punish multiplier, playerHurt payload, new materials ≤ 4 (30 s F-sword), flash clones
//  V1 budgets: particle caps per preset, projected-size clamp, byCast accounting, runtime call collapse, F-mage / F-ranger
//     player-FX coverage (counting override) p95 ≤ 1.5 / max ≤ 2.5 and player-FX calls p95 ≤ 40
const fs = require('fs'); const path = require('path');

function grepRule5(root) {
  const files = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  for (const f of ['src/vfx.js', 'src/combat.js']) files.push(path.join(root, f));
  for (const d of ['src/vfx', 'src/combat']) walk(path.join(root, d));
  const hits = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => {
      const rel = path.relative(root, f) + ':' + (i + 1);
      if (/0x[fF]{6}\b/.test(l) || /#[fF]{6}\b/.test(l)) hits.push(rel + ' white');
      const m = l.match(/emissiveIntensity\s*[:=]\s*([0-9.]+)/); if (m && +m[1] > 1.2) hits.push(rel + ' emissive ' + m[1]);
      const b = l.match(/uBoost\s*:\s*\{\s*value:\s*([0-9.]+)/); if (b && +b[1] > 1.0) hits.push(rel + ' uBoost ' + b[1]);
    });
  }
  return { files: files.length, hits };
}

module.exports = async function (PT) {
  const t0 = Date.now();
  const root = PT.root;

  const part = process.env.VFX_PART || 'all';   // dev: 'quick' | 'fsword' | 'f' | 'all'
  if (part === 'all' || part === 'quick') await functional(PT, root);
  if (part === 'all' || part === 'fsword') await fsword(PT);
  if (part === 'all' || part === 'f') await fscenes(PT);
  PT.note(`vfx section ${((Date.now() - t0) / 1000).toFixed(0)} s`);
};

async function functional(PT, root) {
  // ================================================================== V4 + V2 + V3 (functional, shader-checked)
  const pg = await PT.boot('&cls=mage&prod=0&shaderCheck=1', { w: 640, h: 360 });
  PT.check('V: boot (shader check on)', pg.ready, pg.bootMs);
  if (!pg.ready) { await pg.close(); return; }

  await pg.run('V4 kit', () => {
    const g = window.game, V = g.vfx, K = V.kit, T = g.THREE, R = g.renderer;
    PT.check('kit + shared + applyPlayerFx + fxMulAt + fxFactor + debug present', !!(K && V.shared && V.applyPlayerFx && V.fxMulAt && V.fxFactor && V.debug?.byCast));
    const cam = g.camera, f = new T.Vector3(); cam.getWorldDirection(f);
    const at = (d, up = 0) => cam.position.clone().addScaledVector(f, d).add(new T.Vector3(0, up, 0));
    const P0 = at(6);
    const ground = new T.Vector3(P0.x, PT.groundHeight(P0.x, P0.z), P0.z);
    const px = {};
    const render = (spawn) => {
      const d = PT.pixels.diff((on) => { K.clear(); V.clear(); if (on) spawn(); PT.step(0.016); });
      return d;
    };
    const SH = ['ring', 'arc', 'poly', 'star', 'ticks', 'rays', 'spiral', 'crescent', 'glyph', 'dots', 'stipple'];
    for (const s of SH) px['LW.' + s] = render(() => K.line({ shape: s, el: 'ice', pos: P0, plane: 'billboard', r: 1.2, width: 0.05, life: 5, tIn: 0, sides: 5, points: 5, arc: [0, 2.2], n: 12, turns: 1.5, arms: 2, glyph: 'hexagram', density: 0.6 })).changed;
    for (const d of ['crack', 'scorch', 'frost', 'lichtenberg', 'ripple', 'flower', 'rune', 'strata']) px['DC.' + d] = render(() => K.decal(d, ground, 2.2, 5, { el: 'fire', alpha: 0.35, width: 0.05 })).changed;
    px['LW.ground'] = render(() => K.line({ shape: 'ring', el: 'nature', pos: ground, plane: 'ground', r: 2, width: 0.06, life: 5, tIn: 0 })).changed;
    px['FM.shard'] = render(() => K.mesh('physical.shard', { pos: P0, scale: 1.2, life: 5, tIn: 0, el: 'fire' })).changed;
    px['FM.chunk'] = render(() => K.mesh('physical.chunk', { pos: P0, scale: 1.2, life: 5, tIn: 0 })).changed;
    px['RB'] = render(() => K.ribbon({ points: [at(6, -1).add(new T.Vector3(-1.5, 0, 0)), at(6, 0), at(6, 0.6).add(new T.Vector3(1.5, 0, 0))], width: 0.4, life: 5, el: 'wind' })).changed;
    px['BT'] = render(() => K.bolt({ from: at(6, 1.5).add(new T.Vector3(-1.5, 0, 0)), to: at(6, -1.2).add(new T.Vector3(1.2, 0, 0)), forks: 2, el: 'lightning', life: 5, afterglow: 0.1 })).changed;
    px['SP'] = render(() => { for (let i = 0; i < 6; i++) K.spark(P0, 'fire', 12, null, { speed: 0.2, life: 5, size: 0.3 }); }).changed;
    px['motif.burst'] = render(() => K.motif('water', 'burst', { pos: P0, r: 1.2, castId: 0 })).changed;
    const low = Object.entries(px).filter(([, v]) => v <= 200);
    PT.check('every kit primitive renders (> 200 changed px)', low.length === 0, low.length ? low : px);
    // annulus: a ring rasterises only its band — solid override (no discard) ring vs disc fragments
    {
      const P = K._lw.pools.player;
      const solid = P.mesh.material.clone(); solid.fragmentShader = 'void main(){ gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); }'; solid.blending = T.NoBlending; solid.transparent = false; solid.needsUpdate = true;
      const count = (shape) => {
        K.clear(); K.line({ shape, el: 'ice', pos: P0, plane: 'billboard', r: 1.2, width: 0.05, life: 5, tIn: 0 }); PT.step(0.016);
        const m = P.mesh.material; P.mesh.material = solid;
        const d = PT.pixels.diff((on) => { P.mesh.visible = on; });
        P.mesh.material = m; return d.changed;
      };
      const ring = count('ring'), disc = count('crescent');
      PT.check('rings are tight annulus strips (solid raster ring ÷ disc < 0.3)', disc > 500 && ring / disc < 0.3, { ring, disc, ratio: +(ring / Math.max(1, disc)).toFixed(3) });
      K.clear();
    }
    // programs: linework = 1 program for both pools; kit total ≤ 6; every kit material compiled at boot (prewarm)
    K.line({ shape: 'ring', pos: P0, plane: 'billboard', r: 1, life: 5, tIn: 0 }); K.line({ shape: 'ring', pos: P0, plane: 'billboard', r: 1.3, life: 5, tIn: 0, owner: 'enemy' });
    PT.step(0.016); g.renderNow();
    const progOf = (m) => R.properties.get(m)?.currentProgram || null;
    const lwp = K._lw.materials.map(progOf);
    PT.check('linework: player + enemy pools share ONE program', !!lwp[0] && lwp[0] === lwp[1], lwp.map((p) => p?.id));
    const mats = K.materials();
    const compiled = mats.filter((m) => { const pr = R.properties.get(m); return !!(pr?.currentProgram || (pr?.programs && pr.programs.size > 0)); });
    PT.check('all kit materials prewarmed (compiled at boot)', compiled.length === mats.length, { compiled: compiled.length, total: mats.length, missing: mats.filter((m) => !compiled.includes(m)).map((m) => m.name).slice(0, 8) });
    const keys = new Set(); for (const m of mats) { const pr = R.properties.get(m); if (pr?.programs) for (const p of pr.programs.values()) keys.add(p.cacheKey); else if (pr?.currentProgram) keys.add(pr.currentProgram.cacheKey); }
    PT.check('kit programs ≤ 6', keys.size <= 6, keys.size);
    // FM pools ≤ 2 calls per element (body + outline), one family per element
    K.clear();
    for (let i = 0; i < 20; i++) K.mesh(i % 2 ? 'physical.shard' : 'physical.chunk', { pos: at(6 + i * 0.2, (i % 5) * 0.3 - 0.6), scale: 0.4, life: 5, tIn: 0 });
    const d = PT.draws();
    const fmCalls = K._fm.stats().calls;
    PT.check('FM pools ≤ 2 calls per element (20 instances of 2 shapes)', fmCalls <= 2 && K._fm.stats().families >= 1, { fmCalls, sceneCalls: d.calls });
    K.clear();
    // reserved shapes are refused for player FX
    const dead = K.line({ shape: 'hatch', pos: P0 });
    const kinds = [...K.LW_SHAPES, ...K.DECAL_KINDS];
    PT.check('no hatch / chevron / diamond kinds in player LW / DC; a hatch line is refused', !kinds.some((k) => /hatch|chevron|diamond/i.test(k)) && dead.alive === false, kinds);
    PT.check('kit API surface (§7.4.3)', ['line', 'registerShape', 'mesh', 'ribbon', 'bolt', 'spark', 'decal', 'glyph', 'ramp', 'fxMaterial', 'registerMotif', 'motif', 'hasMotif', 'tier'].every((k) => typeof K[k] === 'function') && Array.isArray(K.GLYPHS) && K.GLYPHS.length === 16);
    const gl = K.glyph('fire'); const tex = gl?.tex;
    PT.check('glyph atlas: 1024² single-channel R8 SDF, 4×4 cells', !!tex && tex.image.width === 1024 && tex.format === T.RedFormat && tex.type === T.UnsignedByteType && gl.uv[2] - gl.uv[0] === 0.25);
    const tb = K.tier('B'), tu = K.tier('U');
    PT.check('tier(code) budgets (§1.4)', tb.particles === 16 && tb.coverage === 0.05 && tu.particles === 150 && tu.flashMax === 0.15 && K.tier('Z').coverage === 0.15);
    const r = K.ramp('fire');
    PT.check('ramp(el) = §3.2 THREE.Colors', r.mid.getHex() === 0xf0661a && r.hi.getHex() === 0xffe08a && K.ramp('light').mid.getHex() === 0xe8d9b0);
    // motif registry: generic fallback marks the cast; registered motif used
    // integration: magic / melee register motifs for most element × kind pairs; probe the generic path on an unregistered pair
    const EL9 = ['physical', 'fire', 'ice', 'lightning', 'wind', 'water', 'earth', 'nature', 'light', 'shadow'], KINDS = ['burst', 'spark', 'pillar', 'wave', 'zone', 'cast', 'trail', 'orbit', 'shield'];
    let gp = null; for (const el of EL9) { if (el === 'physical') continue; for (const k of KINDS) if (!K.hasMotif(el, k)) { gp = [el, k]; break; } if (gp) break; }   // physical never marks generic
    gp = gp || ['fire', 'zz-unregistered'];   // every pair registered: an unknown kind still marks the cast generic
    let fp = null; for (const el of EL9) if (el !== 'physical' && !K.hasMotif(el, 'pillar')) { fp = el; break; }
    const cid = g.nextCastId();
    K.motif(gp[0], gp[1], { pos: P0, castId: cid });
    const gen = V.debug.byCast(cid).generic;
    const hadPhysPillar = K.hasMotif('physical', 'pillar');
    let called = 0; K.registerMotif('physical', 'pillar', (spec, kit) => { called++; return kit.line({ shape: 'ring', pos: spec.pos, castId: spec.castId }); });
    const h = K.motif('physical', 'pillar', { pos: P0, castId: g.nextCastId() });
    PT.check('motif(): generic fallback reports generic; registerMotif / hasMotif route', gen === true && called === 1 && !!h?.alive && K.hasMotif('physical', 'pillar') && (fp == null || !K.hasMotif(fp, 'pillar')), { generic: gp, hadPhysPillar, unregisteredPillar: fp });
    K.clear(); V.clear();
  });

  await pg.run('V2 ducking', () => {
    const g = window.game, V = g.vfx, T = g.THREE, D = V.debug.duck;
    const cam = g.camera, f = new T.Vector3(); cam.getWorldDirection(f);
    const side = new T.Vector3().crossVectors(f, new T.Vector3(0, 1, 0)).normalize();
    // test points away from the camera → player segment
    const base = cam.position.clone().addScaledVector(f, 10).addScaledVector(side, 4);
    base.y = PT.groundHeight(base.x, base.z) + 0.5;
    const tells = g.tells, orig = tells.footprints;
    const FOOT = { data: new Float32Array(64), n: 0 };
    const put = (i, x, z, kind, r, dx, dz, param, len) => { const o = i * 8; FOOT.data.set([x, z, kind, r, dx, dz, param, len], o); };
    tells.footprints = () => FOOT;
    try {
      V.update(0.016, 0.016);
      const def = V.fxMulAt(base);
      PT.check('fxMulAt = 1.0 by default (fxIntensity 1.0, no threats)', Math.abs(def - 1) < 1e-6, def);
      const A = base.clone(), B = base.clone().addScaledVector(side, 8), C = base.clone().addScaledVector(side, -8).addScaledVector(f, 4), Dp = base.clone().addScaledVector(f, 10);
      put(0, A.x, A.z, 1, 2, 0, 1, 0, 0);                         // circle r 2
      put(1, B.x, B.z, 3, 4, side.x, side.z, 0.5, 0);             // cone r 4, half-angle 0.5 rad, toward +side
      put(2, C.x, C.z, 5, 0.8, f.x, f.z, 0, 5);                   // capsule half-width 0.8, len 5 along f
      put(3, Dp.x, Dp.z, 1, 3, 0, 1, 0, 0);                       // safe zone (circle)
      FOOT.n = 4;
      V.update(0.016, 0.016);
      const at = (p, dx, dz, y = base.y) => new T.Vector3(p.x + dx, y, p.z + dz);
      const r = {
        circleIn: V.fxMulAt(at(A, 1, 0)), circleOut: V.fxMulAt(at(A, 2.7, 0)),
        coneIn: V.fxMulAt(at(B, side.x * 3, side.z * 3)), coneOut: V.fxMulAt(at(B, -side.x * 1.2 + f.x * 3, -side.z * 1.2 + f.z * 3)),
        capIn: V.fxMulAt(at(C, f.x * 2.5, f.z * 2.5)), capOut: V.fxMulAt(at(C, f.x * 2.5 + side.x * 1.6, f.z * 2.5 + side.z * 1.6)),
        safeIn: V.fxMulAt(at(Dp, 1, 1)), safeOut: V.fxMulAt(at(Dp, 3.8, 0)),
        lineIn: V.fxMulAt(at(A, 1, 0), 'line'),
      };
      const half = (x) => Math.abs(x - 0.5) < 1e-6, one = (x) => Math.abs(x - 1) < 1e-6;
      PT.check('0.5 inside circle / cone / capsule / safe footprints', half(r.circleIn) && half(r.coneIn) && half(r.capIn) && half(r.safeIn), r);
      PT.check('1.0 just outside each true shape (> 0.5 m pad)', one(r.circleOut) && one(r.coneOut) && one(r.capOut) && one(r.safeOut), r);
      PT.check("role 'line' ≥ 0.7 inside a footprint", r.lineIn >= 0.7 - 1e-6, r.lineIn);
      const near = cam.position.clone().addScaledVector(f, 1.0);
      PT.check('near-camera fade < 0.05 at 1 m', V.fxMulAt(near) < 0.05, V.fxMulAt(near));
      const free = at(A, 2.7, 0);
      V.fxFactor('pt_a', 0.6, 5); V.update(0.016, 0.016);
      const fa = V.fxMulAt(free), fin = V.fxMulAt(at(A, 1, 0));
      V.fxFactor('pt_b', 0.5, 5); V.update(0.016, 0.016);
      const fab = V.fxMulAt(free);
      V.fxFactor('pt_a', null, 0); V.fxFactor('pt_b', null, 0); V.update(0.016, 0.016);
      PT.check('fxFactor composes (0.6 → 0.6, inside 0.3, × 0.5 → 0.3) and clears', Math.abs(fa - 0.6) < 1e-6 && Math.abs(fin - 0.3) < 1e-6 && Math.abs(fab - 0.3) < 1e-6 && one(V.fxMulAt(free)), { fa, fin, fab });
      // GPU twin: uniforms mirror the footprints
      PT.check('shared uniforms carry the footprints (uThreatN, uThreat)', V.shared.uThreatN.value === 4 && Math.abs(V.shared.uThreat.value[0].x - A.x) < 1e-4 && V.shared.uThreat.value[3].z === 0.5);
      // enemy-owned particles unaffected; player particles culled where m < 0.05
      const st0 = V.stats();
      V.burst(near, { count: 10, shape: 'spark', color: 0xf0661a, life: 1 });
      V.burst(near, { count: 10, shape: 'spark', color: 0xf0661a, life: 1, owner: 'enemy' });
      const st1 = V.stats();
      PT.check('enemy-owned particles never ducked; player particles with m < 0.05 not emitted', st1.otherParticles - st0.otherParticles >= 8 && st1.playerParticles === st0.playerParticles, { player: st1.playerParticles - st0.playerParticles, enemy: st1.otherParticles - st0.otherParticles });
    } finally { tells.footprints = orig; FOOT.n = 0; V.update(0.016, 0.016); V.clear(); }
    // patched materials: distinct program keys, chained onBeforeCompile, shared refused
    const mA = new T.MeshBasicMaterial({ color: 0x2f8fd6, transparent: true }); mA.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'void main() { /*A*/'); };
    const mB = new T.MeshBasicMaterial({ color: 0x2f8fd6, transparent: true }); mB.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'void main() { /*B*/'); };
    const mC = new T.MeshBasicMaterial({ color: 0x2f8fd6, transparent: true });
    const k0 = mA.customProgramCacheKey();
    V.applyPlayerFx(mA, { role: 'line' }); V.applyPlayerFx(mB, { role: 'line' }); V.applyPlayerFx(mC, { role: 'fill' });
    const mD = new T.MeshBasicMaterial({ color: 0x2f8fd6, transparent: true }); V.applyPlayerFx(mD, { role: 'line', additive: true });
    const ka = mA.customProgramCacheKey(), kb = mB.customProgramCacheKey(), kc = mC.customProgramCacheKey(), kd = mD.customProgramCacheKey();
    const sh = new T.MeshBasicMaterial(); sh.userData.shared = true; V.applyPlayerFx(sh);
    PT.check('applyPlayerFx: keeps the previous key, role / blend are uniforms (no key split), shared materials refused', ka !== kb && ka !== kc && kc === kd && ka.startsWith(k0) && ka.endsWith('|awfx') && !sh.userData.__awFx, { ka: ka.slice(-40), kb: kb.slice(-40), kc, kd });
    const geo = new T.PlaneGeometry(1, 1); const cam2 = g.camera; const ms = [mA, mB, mC].map((m) => { const o = new T.Mesh(geo, m); o.position.copy(cam2.position).addScaledVector(f, 5); g.scene.add(o); return o; });
    g.renderNow();
    const progs = ms.map((o) => g.renderer.properties.get(o.material).currentProgram);
    for (const o of ms) g.scene.remove(o);
    PT.check('patched materials compile to distinct programs (chained onBeforeCompile kept)', progs.every(Boolean) && new Set(progs).size === 3 && progs[0].cacheKey !== progs[1].cacheKey, progs.map((p) => p?.id));
  });

  await pg.run('V3 impacts', () => {
    const g = window.game, V = g.vfx, K = V.kit, T = g.THREE;
    const cam = g.camera, f = new T.Vector3(); cam.getWorldDirection(f);
    const P0 = cam.position.clone().addScaledVector(f, 7);
    P0.y = Math.max(P0.y - 0.6, PT.groundHeight(P0.x, P0.z) + 0.6);
    const peak = (spawn, sec = 0.05) => {
      K.clear(); V.clear(); PT.step(0.02);
      spawn(); PT.step(sec);
      return PT.pixels.diff((on) => V.debug.setVisible('player', on));
    };
    const els = g.elements.list;
    const imp = {};
    for (const el of els) { const d = peak(() => V.preset('impact_' + el, P0, { castId: g.nextCastId() })); imp[el] = { nw: +(d.newWhite * 100).toFixed(2), px: d.changed, sat: +d.sat.toFixed(2) }; }
    const badI = Object.entries(imp).filter(([, v]) => v.nw > 1.5);
    PT.check('impact_<el> ×9: newWhite ≤ 1.5 %', badI.length === 0 && Object.keys(imp).length === 9, imp);
    PT.check('impact_<el> ×9 render (> 200 px each)', Object.values(imp).every((v) => v.px > 200), Object.fromEntries(Object.entries(imp).map(([k, v]) => [k, v.px])));
    const fams = { burst: 'rx_melt', control: 'rx_superconduct', spread: 'rx_swirl', surface: 'rx_evaporate', blessing: 'rx_sanctify', curse: 'rx_necroflame' };
    const rx = {};
    for (const [fam, id] of Object.entries(fams)) { const d = peak(() => V.preset(id, P0)); rx[fam] = { nw: +(d.newWhite * 100).toFixed(2), px: d.changed }; }
    PT.check('6 reaction families: newWhite ≤ 4 %', Object.values(rx).every((v) => v.nw <= 4 && v.px > 200), rx);
    // reaction particle budgets (≤ 60 each) and no domes
    const pc = {};
    for (const [fam, id] of Object.entries(fams)) { K.clear(); V.clear(); const n0 = V.stats().playerParticles; V.preset(id, P0); pc[fam] = V.stats().playerParticles - n0; }
    PT.check('reaction presets ≤ 60 particles, no domes', Object.values(pc).every((n) => n <= 60) && V.stats().domes === 0, pc);
    V.clear(); K.clear(); PT.step(0.3);
    // per-target sparks ≤ 12, 1 burst per castId
    const d0 = g.debug.spawnDummy(new T.Vector3(P0.x, PT.groundHeight(P0.x, P0.z), P0.z), { hp: 1e6 });
    const cid = g.nextCastId();
    V.resetFeelStats();
    const deltas = [];
    for (let i = 0; i < 4; i++) { const n0 = V.stats().playerParticles; V.hitFeel('heavy', P0, f, 'fire', { castId: cid, target: d0 }); deltas.push(V.stats().playerParticles - n0); }
    const fs1 = { ...V.feelStats };
    PT.check('per-target hit: ≤ 12 sparks after the first (burst once per castId)', deltas.slice(1).every((n) => n <= 12) && fs1.bursts === 1, { deltas, bursts: fs1.bursts });
    PT.check('hitstop requested once per castId', fs1.hitstops === 1, fs1.hitstops);
    const cid2 = g.nextCastId(); V.hitFeel('light', P0, f, 'ice', { castId: cid2, target: d0 });
    PT.check('basic (light) hit: spark only, no burst', V.feelStats.bursts === 1, V.feelStats.bursts);
    const hs = g.debug.hitstopLog?.() || [];
    const last = hs[hs.length - 1];
    PT.check('§5.10 durations: light 0.025 s via game.hitstop(sec, {tier, target})', !!last && Math.abs(last.sec - 0.025) < 1e-6 && last.tier === 'light', last);
    // enemy style: no hi, no reserved hue (particles + linework)
    V.clear(); K.clear();
    for (const el of els) V.preset('impact_' + el, P0, { owner: 'enemy' });
    V.flashSprite(P0, 0xff2a3d, 4, 0.1, 1, { owner: 'enemy', el: 'fire' });
    V.burst(P0, { count: 10, shape: 'flare', color: [0xffffff, 0xff2a3d], owner: 'enemy', size: 5 });
    const O = g.scene.children.find((o) => o.name === 'vfx-particles-enemy');
    PT.step(0.016);
    const ca = O.geometry.attributes.iCol, n = O.geometry.instanceCount;
    const hiSet = new Set(els.map((e) => K.ramp(e).hi.getHex()));
    let hiHits = 0, reserved = 0, maxSize = 0;
    const cc = new T.Color();
    const pa = O.geometry.attributes.iPos;
    for (let i = 0; i < O.geometry.instanceCount; i++) {
      cc.setRGB(ca.getX(i), ca.getY(i), ca.getZ(i)); const h = cc.getHex();
      if (hiSet.has(h)) hiHits++; if (V.debug.isReservedHue(h)) reserved++; maxSize = Math.max(maxSize, pa.getW(i));
    }
    const lwE = K._lw.pools.enemy; let lwHi = 0, lwRes = 0;
    for (let i = 0; i < lwE.n; i++) { const r = lwE.recs[i]; if (hiSet.has(r.c.getHex())) lwHi++; if (V.debug.isReservedHue(r.c.getHex())) lwRes++; }
    PT.check('enemy style: no hi glints, no reserved hue, flashes ≤ 1.5 m, never ducked', n > 0 && hiHits === 0 && reserved === 0 && lwHi === 0 && lwRes === 0 && maxSize <= 1.5 + 1e-6 && lwE.n > 0, { particles: O.geometry.instanceCount, hiHits, reserved, lw: lwE.n, maxSize });
    V.clear(); K.clear();
    // punish multiplier (pipeline): e.vulnerableMul while enemyTime < vulnerableUntil
    const C = g.combat;
    const hit = () => ({ amount: 100, element: 'physical', source: 'player', noCrit: true, noReaction: true, point: P0.clone() });
    d0.vulnerableUntil = -1; const a = C.dealDamage(d0, hit()).damage;
    d0.vulnerableUntil = (g.enemyTime || 0) + 5; d0.vulnerableMul = 1.25;
    const b = C.dealDamage(d0, hit()).damage;
    const lf = C.lastFormula.vulnerable;
    d0.vulnerableUntil = -1;
    PT.check('punish window: damage × e.vulnerableMul (after resist)', Math.abs(b / a - 1.25) < 0.02 && lf === 1.25, { a, b, lf });
    // playerHurt payload (§7.5)
    const pl = g.player.entity;
    const evs = []; const off = g.events.on('playerHurt', (p) => evs.push(p));
    const src = { team: 'enemy', alive: true, nameKo: '시험 몹', object: { position: new T.Vector3(pl.object.position.x + 3, pl.object.position.y, pl.object.position.z) } };
    pl.invulnerable = false; g.player.hp = g.player.maxHp;
    C.dealDamage(pl, { amount: 5, element: 'fire', source: src, status: { burning: 2 }, attack: { id: 'pt.bolt', nameKo: '시험 화살', kind: 'projectile' } });
    off?.();
    const e = evs[0] || {};
    PT.check('playerHurt: attackKind / appliedStatuses / names / dir / time / dot', e.attackKind === 'projectile' && Array.isArray(e.appliedStatuses) && e.appliedStatuses.includes('burning') && e.attackNameKo === '시험 화살' &&
      e.sourceName === '시험 몹' && e.attackId === 'pt.bolt' && e.dot === false && Math.abs(e.dir?.x - 1) < 1e-3 && Number.isFinite(e.time), e);
    C.clearStatus(pl, 'burning');
    PT.check('combat.clearStatus(entity, id)', !pl.statuses?.burning);
    g.player.hp = g.player.maxHp;
    // flashEntity: one cached clone set per entity
    const c0 = V.debug.flashClones();
    for (let i = 0; i < 10; i++) { V.flashEntity(d0, 0xffa53a, 0.05); PT.step(0.02); }
    const c1 = V.debug.flashClones();
    for (let i = 0; i < 10; i++) { V.flashEntity(d0, 0x8fdcf5, 0.05); PT.step(0.06); }
    const c2 = V.debug.flashClones();
    PT.check('flashEntity never clones per hit (≤ 1 set per entity)', c2 === c1 && c1 - c0 <= 16, { first: c1 - c0, later: c2 - c1 });
    // repeated-hit cap (fix round 1, user point 6): a sustained combo never holds a mob at solid white
    const fe = { object: new T.Group(), flashUniform: { value: 0 } };
    V.flashEntity(fe, 0xffe0b0, 0.08); PT.step(1 / 60); const fFirst = fe.flashUniform.value;
    let fMax = 0, fHi = 0, fOn = 0, fN = 0;
    for (let i = 0; i < 120; i++) { V.flashEntity(fe, 0xffe0b0, 0.08); V.flashEntity(fe, 0xffd0ff, 0.08); PT.step(1 / 60); if (i >= 30) { const v = fe.flashUniform.value; fN++; fMax = Math.max(fMax, v); if (v > 0.5) fHi++; if (v > 0.05) fOn++; } }
    PT.check('flashEntity: first hit full pulse, sustained 120 hits/s capped (max ≤ 0.6, lit ≤ 60 % of frames)', fFirst >= 0.8 && fMax <= 0.6 && fHi === 0 && fOn / fN <= 0.6,
      { first: +fFirst.toFixed(2), max: +fMax.toFixed(2), litShare: +(fOn / fN).toFixed(2) });
    // screen flash: tinted, ≤ 0.25, ≤ 0.15 s, off with flashReduce
    V.screenFlash(0xffffff, 0.9, 1.0);
    const sf = V.debug.screenFlash();
    g.settings.values.flashReduce = true; const n0 = sf.count; V.screenFlash(0xf0661a, 0.2, 0.1); const n1 = V.debug.screenFlash().count; g.settings.values.flashReduce = false;
    PT.check('screenFlash: tinted (never white), alpha ≤ 0.25, ≤ 0.15 s, off with flashReduce', sf.last.alpha <= 0.25 && sf.last.dur <= 0.15 && sf.last.color !== 0xffffff && n1 === n0, sf.last);
    d0.alive = false; d0.object?.parent?.remove(d0.object);
  });

  await pg.run('V1 caps / clamp / byCast / collapse', () => {
    const g = window.game, V = g.vfx, K = V.kit, T = g.THREE;
    const S = g.settings, PR = S.PRESETS || {};
    const presetOk = PR.low?.particleCap === 500 && PR.low?.additiveCap === 150 && PR.medium?.particleCap === 1000 && PR.medium?.additiveCap === 300 && PR.high?.particleCap === 2000 && PR.high?.additiveCap === 600;
    const cam = g.camera, f = new T.Vector3(); cam.getWorldDirection(f);
    // foreign player FX (spell / sword objects patched through applyPlayerFx): over budget → the largest items shrink (fix round 1)
    {
      V.clear(); K.clear?.();
      const fm = new T.MeshBasicMaterial({ color: 0x2f8fd6, transparent: true, side: T.DoubleSide }); V.applyPlayerFx(fm, { role: 'fill' });
      const big = new T.Mesh(new T.SphereGeometry(5, 16, 12), fm); big.position.copy(cam.position).addScaledVector(f, 6.5); big.userData.owner = 'player'; g.scene.add(big);
      const one = (o) => o === big;
      const fr0 = PT.fragments({ owner: one }).scene;
      for (let i = 0; i < 40; i++) { big.updateMatrixWorld(); PT.step(1 / 60, true); }
      const parts = V.debug.coverage().parts, fr1 = PT.fragments({ owner: one }).scene;
      g.scene.remove(big); big.geometry.dispose(); fm.dispose();
      for (let i = 0; i < 40; i++) PT.step(1 / 60);
      const relax = V.debug.coverage().parts.foreign;
      PT.check('foreign player FX over budget shrink toward their origin (counted fragments drop, estimate ≤ soft budget), released when gone',
        parts.foreignRaw > 1.4 && parts.foreignShrink < 0.9 && fr1 < fr0 * 0.85 && parts.foreign <= 1.5 && relax === 0,
        { raw: +parts.foreignRaw.toFixed(2), shrink: +parts.foreignShrink.toFixed(2), est: +parts.foreign.toFixed(2), fr0: +fr0.toFixed(2), fr1: +fr1.toFixed(2), relax });
    }
    const P0 = cam.position.clone().addScaledVector(f, 8);
    const caps = {};
    const v = S.values, keep = { pc: v.particleCap, ac: v.additiveCap };
    for (const q of ['low', 'medium', 'high']) {
      v.particleCap = PR[q]?.particleCap ?? keep.pc; v.additiveCap = PR[q]?.additiveCap ?? keep.ac;
      V.clear(); V.update(0, 0);
      for (let i = 0; i < 60; i++) { V.burst(P0, { count: 80, shape: 'spark', color: 0xf0661a, life: 5 }); V.burst(P0, { count: 80, shape: 'leaf', color: 0x2f8a3a, life: 5 }); }
      V.update(0.001, 0.001);
      const st = V.stats();
      caps[q] = { total: st.particles, additive: st.additive, cap: v.particleCap, add: v.additiveCap };
    }
    v.particleCap = keep.pc; v.additiveCap = keep.ac; V.clear(); V.update(0, 0);
    PT.check('particle caps per preset (500/150, 1000/300, 2000/600)', presetOk && Object.values(caps).every((c) => c.total <= c.cap && c.additive <= c.add && c.total >= c.cap * 0.8), caps);
    // projected-size clamp: soft ≤ 12 %, others ≤ 20 % of screen height
    const H = g.renderer.getContext().drawingBufferHeight;
    const bbox = (m, w) => { let y0 = 1e9, y1 = -1; for (let i = 0; i < m.length; i++) if (m[i]) { const y = Math.floor(i / w); if (y < y0) y0 = y; if (y > y1) y1 = y; } return y1 >= 0 ? y1 - y0 + 1 : 0; };
    const near = cam.position.clone().addScaledVector(f, 4);
    // area-based (rotation-independent): sqrt(changed px) ÷ screen height ≤ the clamp fraction of a full quad
    const sizeOf = (shape) => { V.clear(); V.burst(near, { count: 1, shape, color: 0xf0661a, size: 40, sizeEnd: 40, life: 5, speed: 0, alpha: 1 }); V.update(0.001, 0.001); const d = PT.pixels.diff((on) => V.debug.setVisible('player', on), { thr: 6 }); void bbox; return Math.sqrt(d.changed) / H; };
    const soft = sizeOf('soft'), spark = sizeOf('dot');
    V.clear();
    PT.check('projected-size clamp: soft ≤ 12 %, other ≤ 20 % of screen height', soft > 0.02 && soft <= 0.125 && spark <= 0.205, { soft: +soft.toFixed(3), other: +spark.toFixed(3) });
    // per-cast accounting
    const id = g.nextCastId();
    V.clear(); V.update(0.001, 0.001); const pn0 = V.stats().playerParticles;
    K.line({ shape: 'ring', pos: P0, plane: 'billboard', r: 1, life: 2, castId: id });
    K.spark(P0, 'fire', 8, null, { castId: id });
    V.burst(P0, { count: 5, shape: 'spark', color: 0xf0661a, life: 1, castId: id });
    const spawned = V.stats().playerParticles - pn0;
    V.update(0.016, 0.016); V.update(0.016, 0.016);
    const bc = V.debug.byCast(id);
    PT.check('byCast(castId) → {particles, handles, calls, coverage}', bc.particles === spawned && spawned >= 8 && bc.handles === 1 && bc.calls >= 2 && bc.coverage > 0, { ...bc, spawned });
    // runtime call cap: oldest persistent visuals collapse to linework only
    V.clear(); K.clear();
    for (let i = 0; i < 6; i++) V.runeCircle(P0.clone().add(new T.Vector3(i, -1, 0)), { element: 'light', r: 1.5, dur: 10 });
    for (let i = 0; i < 3; i++) V.dome(P0.clone().add(new T.Vector3(-i * 2, 0, 0)), { radius: 2, duration: 5 });
    for (let i = 0; i < 3; i++) V.spawnAfterimage(g.player.object, 0x8fdcf5, 5);
    const capKeep = S.values.fxCalls; S.values.fxCalls = 8;
    V.update(0.016, 0.016); V.update(0.016, 0.016);
    const cl = V.debug.calls();
    S.values.fxCalls = capKeep;
    PT.check('player-FX call cap: over budget → oldest persistent visuals collapse (to linework)', cl.player <= 8 + 2 && cl.collapsed > 0, cl);
    V.clear(); K.clear();
  });

  // grep rule 5 (node side)
  const gr = grepRule5(root);
  PT.check('grep rule 5 clean in src/vfx* and src/combat* (no 0xffffff / #ffffff, emissive ≤ 1.2, uBoost ≤ 1)', gr.hits.length === 0, gr.hits.slice(0, 10));
  PT.check('V: no console errors (shader check on)', pg.errors().length === 0, pg.errors().slice(0, 6));
  await pg.close();
}

async function fsword(PT) {
  // ================================================================== V3: new materials in a 30 s F-sword run
  {
    const pf = await PT.bootScene('F-sword', { w: 640, h: 360 });
    if (pf.ready) {
      await pf.run('V3 F-sword 30 s', () => {
        const g = window.game;
        PT.rotate('sword', 2, { measure: false, warm: 0 });
        const T = g.THREE, own = { vfx: 0, other: 0 }, sites = {};
        const tag = () => { const st = new Error().stack || ''; const mine = /\/src\/(vfx|combat)[.\/]/.test(st); own[mine ? 'vfx' : 'other']++; if (mine) { const l = st.split('\n').find((x) => /\/src\/(vfx|combat)/.test(x)) || '?'; const k = 'V ' + l.replace(/^.*\/src\//, 'src/'); sites[k] = (sites[k] || 0) + 1; }
          if (!mine) { const l = st.split('\n').find((x) => /\/src\//.test(x)) || '?'; const k = l.replace(/^.*\/src\//, 'src/').replace(/[)\s]+$/, ''); sites[k] = (sites[k] || 0) + 1; } };
        const sv = T.Material.prototype.setValues, cl = T.Material.prototype.clone;
        let depth = 0;
        T.Material.prototype.setValues = function (v) { if (!depth) tag(); return sv.call(this, v); };
        T.Material.prototype.clone = function () { tag(); depth++; try { return cl.call(this); } finally { depth--; } };
        g.debug.newMaterials();
        try { PT.rotate('sword', 30, { measure: false, warm: 0 }); } finally { T.Material.prototype.setValues = sv; T.Material.prototype.clone = cl; }
        const n = g.debug.newMaterials();
        PT.check('new THREE.Material objects from src/vfx* + src/combat* in 30 s of F-sword ≤ 4', own.vfx <= 4, { vfx: own.vfx, total: n, other: own.other });
        PT.note(`F-sword 30 s: ${n} new materials in total; outside vfx/combat: ${JSON.stringify(Object.entries(sites).sort((x, y) => y[1] - x[1]).slice(0, 4))}`);
        PT.note(`F-sword particles peak ${g.vfx.debug.budget().peak}, live ${g.vfx.stats().particles}`);
      });
    } else PT.check('F-sword boot', false);
    await pf.close();
  }
}

async function fscenes(PT) {
  // ================================================================== V1: F-mage / F-ranger coverage + calls (prod=1, 640×360)
  for (const cls of PT.flags.full ? ['mage', 'ranger', 'sword', 'paladin', 'spiritcaller', 'shadowblade'] : ['mage', 'ranger']) {
    const ps = await PT.bootScene('F-' + cls, { w: 640, h: 360 });
    if (!ps.ready) { PT.check(`F-${cls} boot`, false); await ps.close(); continue; }
    await ps.run(`V1 F-${cls}`, (cls) => {
      const g = window.game, V = g.vfx;
      const cov = [], calls = [], est = [], parts = [];
      V.debug.resetPeaks();
      PT.rotate(cls, 6, {
        sampleEvery: 20,
        onSample: (rec) => {
          const fr = PT.fragments({ owner: 'player' });
          cov.push(fr.scene); calls.push(rec.draws.byGroup?.fx?.calls ?? 0); est.push(V.debug.coverage().screens); parts.push(rec.particles ?? 0);
        },
      });
      const s = (a) => a.slice().sort((x, y) => x - y);
      const p95 = (a) => { const b = s(a); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * 0.95))] : 0; };
      const mx = (a) => (a.length ? Math.max(...a) : 0);
      PT.check(`F-${cls}: player-FX coverage (counting override) p95 ≤ 1.5, max ≤ 2.5`, cov.length > 5 && p95(cov) <= 1.5 && mx(cov) <= 2.5, { p95: +p95(cov).toFixed(3), max: +mx(cov).toFixed(3), samples: cov.length, estP95: +p95(est).toFixed(3) });
      PT.check(`F-${cls}: player-FX draw calls p95 ≤ 40`, p95(calls) <= 40, { p95: p95(calls), max: mx(calls) });
      PT.check(`F-${cls}: live particles ≤ 1,000`, mx(parts) <= 1000 && V.debug.budget().peak <= 1000, { max: mx(parts), peak: V.debug.budget().peak });
      PT.note(`F-${cls} coverage samples ${cov.map((x) => x.toFixed(2)).join(' ')}`);
    }, cls);
    PT.check(`F-${cls}: no console errors`, ps.errors().length === 0, ps.errors().slice(0, 4));
    await ps.close();
  }
}
