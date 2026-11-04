// Hit feel v4 (PLAN §3.8, §5.10, R4). vfx.hitFeel(tier, pos, dir, element, opts) — ONLY combat.dealDamage calls it.
//  - per target: one motif spark (≤ 12 particles, no flare); the full burst plays once per castId within 0.3 s (tier ≥ heavy)
//  - hitstop once per castId through game.hitstop(sec, {tier, target}) with the §5.10 durations (legacy hits without a castId:
//    melee every hit, spell volleys ≥ 0.12 s apart); DoT ticks: a 1-particle tick, no hitstop, no shake
//  - screenFlash only for ult / break (tinted, ≤ 0.25 alpha, ≤ 0.15 s, off with flashReduce); fovKick only ult; trauma × screenShake
export const FEEL = {
  light:    { hitstop: 0.025, trauma: 0.07, fov: 0, fovDur: 0,    flash: 0,    sparks: 5,  ent: 0.08, burst: false, kick: 0.04 },
  heavy:    { hitstop: 0.05,  trauma: 0.2,  fov: 0, fovDur: 0,    flash: 0,    sparks: 8,  ent: 0.1,  burst: true,  kick: 0.07 },
  crit:     { hitstop: 0.06,  trauma: 0.28, fov: 0, fovDur: 0,    flash: 0,    sparks: 10, ent: 0.1,  burst: true,  kick: 0.08 },
  reaction: { hitstop: 0.06,  trauma: 0.25, fov: 0, fovDur: 0,    flash: 0,    sparks: 10, ent: 0.1,  burst: true,  kick: 0.08 },
  ult:      { hitstop: 0.10,  trauma: 0.5,  fov: 3, fovDur: 0.25, flash: 0.18, sparks: 12, ent: 0.08, burst: true,  kick: 0.1, pulse: 0.4, pulseDur: 0.18 },
  break:    { hitstop: 0.10,  trauma: 0.45, fov: 0, fovDur: 0,    flash: 0.16, sparks: 12, ent: 0.08, burst: true,  kick: 0.1, pulse: 0.5, pulseDur: 0.25 },
  parry:    { hitstop: 0.08,  trauma: 0.2,  fov: 0, fovDur: 0,    flash: 0,    sparks: 10, ent: 0.08, burst: true,  kick: 0.08 },
  kill:     { hitstop: 0.10,  trauma: 0.4,  fov: 0, fovDur: 0,    flash: 0,    sparks: 12, ent: 0.08, burst: true,  kick: 0.1 },
};
const VOLLEY_GAP = 0.12;
const RING = 64;

export function createFeel(game, vfx) {
  let lastHsAt = -9, lastHsAmt = 0, lastBurstAt = -9;
  let pendingTrauma = 0;
  const stats = { calls: 0, byTier: { light: 0, heavy: 0, crit: 0, reaction: 0, ult: 0, break: 0, parry: 0, kill: 0 }, hitstops: 0, bursts: 0, sparks: 0, maxTraumaAdd: 0 };
  // per castId: first hit time, hitstop granted, burst played (ring buffer, no allocation)
  const castIds = new Float64Array(RING).fill(-1), castT = new Float64Array(RING), castHs = new Uint8Array(RING), castBurst = new Uint8Array(RING);
  const slot = (id) => { const i = id & (RING - 1); if (castIds[i] !== id) { castIds[i] = id; castT[i] = game.realTime || 0; castHs[i] = 0; castBurst[i] = 0; } return i; };
  const kit = () => vfx.kit;

  // hurt vignette (DOM, written only on hit / decay); ux's directional arc may replace it (vfx.hurtVignette = false)
  const vig = document.createElement('div');
  vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:5;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(150,20,28,0.7) 100%);';
  (document.getElementById('ui')?.parentNode || document.body).appendChild(vig);
  const vs = { a: 0, t: 1, dur: 0.4 };

  function hitFeel(tier, pos, dir, element = 'physical', opts = null) {
    const o = opts || {};
    let T = FEEL[tier] || FEEL.light;
    const t0 = tier in FEEL ? tier : 'light';
    stats.calls++; stats.byTier[t0]++;
    const rt = game.realTime || 0;
    const el = element || 'physical';
    const castId = o.castId || 0;
    const tick = !!(o.tick || o.dot);
    if (o.killed && o.boss && !o.playerHurt) T = FEEL.kill;
    // ---- player hurt: no shake, a light vignette + entity flash
    if (o.playerHurt) {
      if (!tick && o.hitstop !== 0) { game.hitstop?.(Math.min(0.06, o.hitstop ?? 0.04), { tier: 'light', target: o.target }); stats.hitstops++; }
      if (vfx.hurtVignette !== false && !tick) { vs.a = Math.min(0.5, Math.max(vs.a * (1 - vs.t / vs.dur), 0) + 0.22 + Math.min(0.25, (o.dmg || 0) / 80)); vs.t = 0; }
      vfx.flashEntity?.(o.target, 0xff8a7a, 0.1);
      return;
    }
    // ---- DoT / zone ticks: 1-particle tick, no hitstop, no shake (unless it kills)
    if (tick && !o.killed) {
      if (pos) { kit()?.spark?.(pos, el, 1, dir, { castId }); stats.sparks++; }
      vfx.flashEntity?.(o.target, kit()?.ramp?.(el)?.light?.getHex?.(), 0.05);
      return;
    }
    const ci = castId ? slot(castId) : -1;
    // ---- hitstop: once per castId (§5.10); legacy hits without a castId keep the v3 volley rule
    let hs = o.hitstop != null ? o.hitstop : T.hitstop * (o.hitstopMul || 1);
    if (o.prop) hs = Math.min(hs, 0.03);
    if (hs > 0) {
      let go;
      if (ci >= 0) go = !castHs[ci];
      else go = !!(o.melee || o.killed || rt - lastHsAt > VOLLEY_GAP || hs > lastHsAmt + 0.02);
      if (go) {
        const ht = o.killed && o.boss ? 'kill' : (t0 === 'reaction' ? 'heavy' : t0);
        game.hitstop?.(Math.min(hs, 0.12), { tier: ht, target: o.target });
        if (ci >= 0) castHs[ci] = 1;
        lastHsAt = rt; lastHsAmt = hs; stats.hitstops++;
      }
    }
    // ---- trauma (max per frame; vfx.shake scales by settings.screenShake)
    let tr = o.shake != null ? o.shake : T.trauma;
    if (o.killed) tr += 0.05;
    if (o.prop) tr = Math.min(tr, 0.1);
    if (ci >= 0 && castHs[ci] && rt - castT[ci] > 0.05) tr *= 0.5;    // multi-hits of one cast shake less
    if (tr > pendingTrauma) pendingTrauma = tr;
    if (tr > stats.maxTraumaAdd) stats.maxTraumaAdd = tr;
    if (dir && T.kick) vfx.kick?.(dir, T.kick);
    // ---- fov / flashes / pulse: ultimate & break tiers only
    if (T.fov) vfx.fovKick?.(T.fov, T.fovDur);
    if (T.flash) vfx.screenFlash?.(kit()?.ramp?.(el)?.mid?.getHex?.(), Math.min(0.25, T.flash), 0.12);
    if (T.pulse) { try { game.post?.pulse?.(T.pulse, T.pulseDur); } catch (_) { /* */ } }
    // ---- per-target spark + one burst per cast
    if (!o.noImpactFx && pos && kit()) {
      kit().motif(el, 'spark', { pos, dir: dir || null, castId, n: Math.min(12, T.sparks), r: 1, owner: 'player' }); stats.sparks++;
      let doBurst = T.burst;
      if (doBurst) {
        if (ci >= 0) { doBurst = !castBurst[ci] && rt - castT[ci] <= 0.3; if (doBurst) castBurst[ci] = 1; }
        else { doBurst = rt - lastBurstAt > 0.12; }
      }
      if (doBurst) {
        lastBurstAt = rt;
        const r = t0 === 'ult' || t0 === 'break' || t0 === 'kill' ? 1.8 : t0 === 'crit' || t0 === 'reaction' ? 1.2 : 1.0;
        kit().motif(el, 'burst', { pos, dir: dir || null, castId, n: 10, r, owner: 'player', tier: t0 }); stats.bursts++;
        const e = castId ? vfx.debug?.cast?.entry?.(castId) : null; if (e) e.bursts++;
      }
    }
    // ---- entity flash (ramp light, never white) + hit-pose pop
    if (o.target && T.ent) {
      vfx.flashEntity?.(o.target, o.crit ? kit()?.ramp?.(el)?.hi?.getHex?.() : kit()?.ramp?.(el)?.light?.getHex?.(), T.ent);
      try { o.target.hitPop?.(dir, tier); } catch (_) { /* */ }
    }
  }

  return {
    hitFeel,
    takeTrauma() { const t = pendingTrauma; pendingTrauma = 0; return t; },
    update(realDt) {
      if (vs.t < vs.dur) { vs.t += realDt; const p = Math.min(1, vs.t / vs.dur); vig.style.opacity = String(vs.a * (1 - p) * (1 - p)); }
      else if (vig.style.opacity !== '0') vig.style.opacity = '0';
    },
    stats,
    resetStats() { stats.calls = 0; stats.hitstops = 0; stats.bursts = 0; stats.sparks = 0; stats.maxTraumaAdd = 0; for (const k in stats.byTier) stats.byTier[k] = 0; },
  };
}
