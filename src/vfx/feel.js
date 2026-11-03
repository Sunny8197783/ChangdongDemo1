// Hit-feel tier table (DESIGN §9 S1, CONTRACT §8.3/§20). vfx.hitFeel(tier, pos, dir, element, opts) — ONLY
// combat.dealDamage calls it, once per non-DoT hit. One table drives hitstop, trauma, FOV kick, screen flash,
// particle scale, entity flash, the emissive flash sprite and the post chroma pulse.
//   - spell volleys are rate-limited to one hitstop per 0.12 s (melee always freezes; kills always freeze)
//   - game.hitstop enforces the 3–4 frame minimum
//   - mob kill +0.04 s; player hurt: no shake, a red vignette
//   - trauma is capped at 1 and scaled by settings.screenShake (accessibility)

export const FEEL = {
  light:    { hitstop: 0.03, trauma: 0.08, fov: 0, fovDur: 0,    flash: 0,    particles: 0.55, ent: 0.08, ring: false, sprite: false, kick: 0.05 },
  heavy:    { hitstop: 0.07, trauma: 0.25, fov: 2, fovDur: 0.15, flash: 0,    particles: 1.0,  ent: 0.12, ring: true,  sprite: true,  kick: 0.09 },
  crit:     { hitstop: 0.10, trauma: 0.40, fov: 4, fovDur: 0.2,  flash: 0.12, particles: 1.25, ent: 0.12, ring: true,  sprite: true,  kick: 0.11 },
  reaction: { hitstop: 0.08, trauma: 0.30, fov: 3, fovDur: 0.2,  flash: 0,    particles: 1.2,  ent: 0.12, ring: true,  sprite: true,  kick: 0.1 },
  ult:      { hitstop: 0.16, trauma: 0.70, fov: 6, fovDur: 0.3,  flash: 0,    particles: 1.8,  ent: 0,    ring: true,  sprite: true,  kick: 0.15, pulse: 0.6, pulseDur: 0.2 },
  break:    { hitstop: 0,    trauma: 0.60, fov: 5, fovDur: 0.3,  flash: 0.15, particles: 1.6,  ent: 0,    ring: true,  sprite: true,  kick: 0.15, pulse: 0.8, pulseDur: 0.3, white: true },
};
const KILL_BONUS = 0.04;
const VOLLEY_GAP = 0.12;

export function createFeel(game, vfx) {
  let lastHsAt = -9, lastHsAmt = 0, lastRingAt = -9;
  let pendingTrauma = 0;
  const stats = { calls: 0, byTier: { light: 0, heavy: 0, crit: 0, reaction: 0, ult: 0, break: 0 }, hitstops: 0, maxTraumaAdd: 0 };
  const shakeScale = () => { const v = game.settings?.values?.screenShake; return Number.isFinite(v) ? Math.max(0, Math.min(1.5, v)) : 1; };
  const ELC = (el) => game.elements?.color?.(el) ?? 0xffffff;

  // red vignette for player hurt (DOM, written only on hit / decay)
  const vig = document.createElement('div');
  vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:5;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(190,20,20,0.85) 100%);';
  (document.getElementById('ui')?.parentNode || document.body).appendChild(vig);
  const vs = { a: 0, t: 1, dur: 0.45 };

  function hitFeel(tier, pos, dir, element = 'physical', opts = null) {
    const T = FEEL[tier] || FEEL.light;
    stats.calls++; stats.byTier[tier in FEEL ? tier : 'light']++;
    const o = opts || {};
    const rt = game.realTime || 0;
    // ---- hitstop ----
    let hs = o.hitstop != null ? o.hitstop : T.hitstop * (o.hitstopMul || 1);
    if (o.killed && !o.playerHurt) hs += o.boss ? 0.1 : KILL_BONUS;
    if (o.prop) hs = Math.min(hs, 0.05);
    if (o.tick) hs = o.killed ? 0.07 : Math.min(hs, 0.05);
    if (o.playerHurt) hs = Math.min(Math.max(hs, 0.06), 0.1);
    if (hs > 0) {
      if (o.melee || o.killed || o.playerHurt || rt - lastHsAt > VOLLEY_GAP || hs > lastHsAmt + 0.02) {
        game.hitstop?.(hs); lastHsAt = rt; lastHsAmt = hs; stats.hitstops++;
      }
    }
    if (o.playerHurt) {
      // no shake: a red vignette + light entity flash
      vs.a = Math.min(0.85, Math.max(vs.a * (1 - vs.t / vs.dur), 0) + 0.35 + Math.min(0.4, (o.dmg || 0) / 60)); vs.t = 0;
      vfx.flashEntity?.(o.target, 0xff6060, 0.12);
      return;
    }
    // ---- trauma (max per frame, scaled, capped) ----
    let tr = o.shake != null ? o.shake : T.trauma;
    if (o.killed) tr += 0.08;
    if (o.prop) tr = Math.min(tr, 0.15);
    if (o.tick) tr = Math.min(tr, 0.12);
    tr *= shakeScale();
    if (tr > pendingTrauma) pendingTrauma = tr;
    if (tr > stats.maxTraumaAdd) stats.maxTraumaAdd = tr;
    // ---- directional kick spring ----
    if (dir && T.kick) vfx.kick?.(dir, T.kick * shakeScale());
    // ---- fov / flashes / pulse ----
    if (T.fov) vfx.fovKick?.(T.fov, T.fovDur);
    if (T.flash) vfx.screenFlash?.(T.white ? 0xffffff : 0xfff2d0, T.flash, 0.12);
    if (T.pulse) { try { game.post?.pulse?.(T.pulse, T.pulseDur); } catch (_) { /* */ } }
    // ---- particles (5-layer element impact recipe at the tier's scale) ----
    if (!o.noImpactFx && pos) {
      const sc = T.particles * (o.prop ? 0.6 : 1) * Math.max(0.7, Math.min(1.6, (o.dmg || 30) / 30));
      vfx.impact?.(pos, { element: element || 'physical', scale: sc, normal: null });
      if (T.ring && rt - lastRingAt > 0.06) { lastRingAt = rt; vfx.shockwave?.(pos, { color: ELC(element), radius: 1.2 + T.particles, duration: 0.22, thickness: 0.18, opacity: 0.85, vertical: true }); }
      if (T.sprite) vfx.flashSprite?.(pos, ELC(element), 1.2 + T.particles * 1.3, 0.09);
    }
    // ---- entity flash + hit-pose pop (S2) ----
    if (o.target && T.ent) {
      vfx.flashEntity?.(o.target, o.crit ? 0xfff2a0 : 0xffffff, T.ent);
      try { o.target.hitPop?.(dir, tier); } catch (_) { /* */ }
    }
  }

  return {
    hitFeel,
    /** trauma gathered this frame (consumed by vfx.update) */
    takeTrauma() { const t = pendingTrauma; pendingTrauma = 0; return t; },
    update(realDt) {
      if (vs.t < vs.dur) {
        vs.t += realDt;
        const p = Math.min(1, vs.t / vs.dur);
        vig.style.opacity = String(vs.a * (1 - p) * (1 - p));
      } else if (vig.style.opacity !== '0') vig.style.opacity = '0';
    },
    stats,
    resetStats() { stats.calls = 0; stats.hitstops = 0; stats.maxTraumaAdd = 0; for (const k in stats.byTier) stats.byTier[k] = 0; },
  };
}
