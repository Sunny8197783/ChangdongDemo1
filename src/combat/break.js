// Break gauge (붕괴) & void shield (공허 장막) — CONTRACT §8.4, DESIGN §4.3 E / §9. Owner: combat.
// entity.breakMax (elites 60, mid-bosses 100–150, final phases 150–200) + entity.breakValue.
// Hits subtract poise × mod (earth/lightning ×1.5, reaction ×3, encrusted ×1.2, parry +15 flat, rooted-on-boss +40).
// At 0: `break {target}`, status broken 4 s (mid-boss 3 s; +50% taken), target.onBreak?.(), timeScale 'break' 0.05 for 0.25 s,
// post pulse; refill after 6 s (no drain while broken) → `breakRecover {target}`.
// voidShield: numeric entity.voidShield (0–100). While > 0 damage ×0.3. Depletion poise × (light ×4 | reaction ×2 | other ×1);
// a break empties it. Emits `voidShieldBroken {target}`.

export const BREAK_RULES = {
  elMul: { earth: 1.5, lightning: 1.5 }, reactionMul: 3, encrustedMul: 1.2, parryFlat: 15, rootedBossFlat: 40,
  brokenDur: 4, brokenDurMid: 3, refillAfter: 6, slowScale: 0.05, slowDur: 0.25,
  shieldMul: 0.3, shieldFactor: { light: 4, reaction: 2, other: 1 },
};

export function createBreak(game, C) {
  const broken = [];   // entities currently broken (refill timers)

  function isBroken(t) { return !!(t && t._brokenT > 0); }
  function ensure(t) {
    if (!t || !(t.breakMax > 0)) return false;
    if (t.breakValue == null || !Number.isFinite(t.breakValue)) t.breakValue = t.breakMax;
    return true;
  }
  /** Raw gauge damage (already multiplied). Returns true if this broke the target. */
  function addBreak(t, n, opts) {
    if (!t?.alive || !ensure(t) || isBroken(t) || !(n > 0)) return false;
    let v = n;
    if (opts?.kind !== 'raw' && t.statuses?.encrusted && opts?.kind !== 'status') v *= BREAK_RULES.encrustedMul;
    t.breakValue = Math.max(0, t.breakValue - v);
    if (t.breakValue <= 0) { doBreak(t); return true; }
    return false;
  }
  /** Per-hit gauge damage from the pipeline (step 9). */
  function onHit(t, hit, el, reacted, dmg) {
    if (!t?.alive || !(t.breakMax > 0) || isBroken(t)) return;
    const poise = hit.poise ?? dmg * 0.5;
    if (!(poise > 0)) return;
    let mul = BREAK_RULES.elMul[el] || 1;
    if (reacted) mul *= BREAK_RULES.reactionMul;
    try { mul *= game.stats?.get?.('poiseMul') ?? 1; } catch (_) { /* */ }
    addBreak(t, poise * mul);
  }
  function doBreak(t) {
    t.breakValue = 0;
    const mid = t.isBoss && !t.isFinalBoss && (t.breakMax || 0) <= 150;
    const dur = mid ? BREAK_RULES.brokenDurMid : BREAK_RULES.brokenDur;
    t._brokenT = BREAK_RULES.refillAfter;
    if (!broken.includes(t)) broken.push(t);
    C.applyStatus(t, 'broken', dur, { source: 'player' });
    if ((t.voidShield || 0) > 0) { t.voidShield = 0; game.events.emit('voidShieldBroken', { target: t }); }
    try { t.onBreak?.(); } catch (err) { console.error('[combat] onBreak', err); }
    try { game.timeScale?.set?.('break', BREAK_RULES.slowScale, BREAK_RULES.slowDur); } catch (_) { /* */ }
    const p = C.getCenter(t, C._tv(7));
    try { game.vfx?.hitFeel?.('break', p, null, 'physical', { target: t }); } catch (_) { /* */ }
    try { game.vfx?.preset?.('rx_break', p, { family: 'universal', scale: Math.max(1, (t.radius || 1)) }); } catch (_) { /* */ }
    game.events.emit('break', { target: t });
    C.discover?.('break');
    game.events.emit('reaction', { id: 'break', name: '붕괴', point: p.clone(), target: t, elements: ['physical', 'physical'], variant: null, family: 'universal' });
  }
  function update(dt) {
    for (let i = broken.length - 1; i >= 0; i--) {
      const t = broken[i];
      t._brokenT -= dt;
      if (!t.alive) { broken.splice(i, 1); t._brokenT = 0; continue; }
      if (t._brokenT <= 0) {
        t._brokenT = 0; t.breakValue = t.breakMax;
        broken.splice(i, 1);
        game.events.emit('breakRecover', { target: t });
      }
    }
  }

  // ---------------- void shield ----------------
  /** Damage multiplier while shielded, and depletion (pipeline step 4). */
  function shieldMul(t, hit, el, reacted, amount) {
    if (!t || !((t.voidShield || 0) > 0) || hit.ignoreShield) return 1;
    const poise = hit.poise ?? amount * 0.5;
    const f = el === 'light' ? BREAK_RULES.shieldFactor.light : reacted ? BREAK_RULES.shieldFactor.reaction : BREAK_RULES.shieldFactor.other;
    drainShield(t, poise * f);
    return BREAK_RULES.shieldMul;
  }
  function drainShield(t, n) {
    if (!t || !((t.voidShield || 0) > 0)) return false;
    t.voidShield = Math.max(0, t.voidShield - n);
    if (t.voidShield <= 0) { t.voidShield = 0; game.events.emit('voidShieldBroken', { target: t }); try { t.onShieldBroken?.(); } catch (_) { /* */ } return true; }
    return false;
  }

  /** debug: break the target now (gives a temporary 60 gauge to entities without one). */
  function forceBreak(t) {
    if (!t?.alive) return false;
    if (!(t.breakMax > 0)) { t.breakMax = 60; t.breakValue = 60; }
    if (isBroken(t)) { t._brokenT = 0; t.breakValue = t.breakMax; const i = broken.indexOf(t); if (i >= 0) broken.splice(i, 1); }
    return addBreak(t, t.breakMax * 10, { kind: 'raw' });
  }

  return { addBreak, onHit, isBroken, update, shieldMul, drainShield, forceBreak, onParry(t) { addBreak(t, BREAK_RULES.parryFlat, { kind: 'raw' }); }, reset() { broken.length = 0; } };
}
