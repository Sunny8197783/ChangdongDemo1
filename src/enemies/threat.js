// AI targeting (CONTRACT §14): taunt targets (treant ally, stone totem, water clone, spirit decoy), player stealth,
// threat resolution for every enemy and boss, and the aggro queries used by player.inCombat().
// No per-frame allocation: everything below works on module scratch objects.

const TAUNT_RANGE = 22;   // enemies within this distance of a taunt entity retarget to it

export function createThreat(game, all) {
  const taunt = { entity: null, t: 0, range: TAUNT_RANGE };
  const stealth = { mul: 1, t: 0 };

  function entityPos(t) { return t?.object?.position || t?.position || null; }
  function tauntAlive() {
    const t = taunt.entity;
    if (!t || taunt.t <= 0) return false;
    if (t.alive === false || t.dying || t.removed) return false;
    if (typeof t.hp === 'number' && t.hp <= 0) return false;
    return !!entityPos(t);
  }

  const api = {
    /** Ally taunt: enemies in range retarget to `entity` for `dur` s (null clears). */
    setTauntTarget(entity, dur = 6, range = TAUNT_RANGE) {
      if (!entity) { taunt.entity = null; taunt.t = 0; return; }
      taunt.entity = entity; taunt.t = Math.max(0.1, +dur || 6); taunt.range = range || TAUNT_RANGE;
      // the taunt pulls aggro from enemies already near it
      const tp = entityPos(entity);
      if (tp) for (const e of all) {
        if (!e.alive || e.dying || e.isDummy || e.isBoss) continue;
        const p = e.object.position;
        if (Math.hypot(p.x - tp.x, p.z - tp.z) < taunt.range) { e.aggro = true; e._tauntT = taunt.t; }
      }
    },
    clearTauntTarget() { taunt.entity = null; taunt.t = 0; },
    get tauntTarget() { return tauntAlive() ? taunt.entity : null; },
    /**
     * The AI target for enemy e: the taunt entity when alive and in range (bosses too), else the player entity.
     * Never returns null while a player exists.
     */
    getThreatTarget(e) {
      const pe = game.player?.entity || null;
      if (tauntAlive() && e && !e.isDummy) {
        const tp = entityPos(taunt.entity), p = e.object?.position;
        if (p && Math.hypot(p.x - tp.x, p.z - tp.z) < taunt.range * (e.isBoss ? 2 : 1)) return taunt.entity;
      }
      return pe;
    },
    /**
     * Sight range ×mul for `dur` s (shadow.sup, 은신, 유령, raven swarm). mul 0 = enemies lose track.
     * Also accepts (true|false, dur) from older callers: true → ×0.3, false → clear.
     */
    setPlayerStealth(mul, dur = 4) {
      if (mul === false || mul == null) { stealth.mul = 1; stealth.t = 0; return; }
      if (mul === true) mul = 0.3;
      stealth.mul = Math.max(0, Math.min(1, +mul)); stealth.t = Math.max(0.05, +dur || 4);
      if (stealth.mul <= 0.05) {
        for (const e of all) {
          if (!e.alive || e.dying || e.isDummy || e.isBoss || !e.aggro) continue;
          e.aggro = false; e.giveUpT = Math.min(stealth.t, 3); e._lostTrack = true;
          e.setState?.('return');
        }
      }
    },
    get stealthMul() { return stealth.t > 0 ? stealth.mul : 1; },
    /** Any aggroed foe (or a debug-aggroed dummy) within r of pos. */
    anyAggroWithin(pos, r = 30) {
      if (!pos) return false;
      const r2 = r * r;
      for (let i = 0; i < all.length; i++) {
        const e = all[i];
        if (!e.alive || e.dying) continue;
        if (!(e.aggro || e.debugAggro)) continue;
        if (e.isDummy && !e.debugAggro) continue;
        const p = e.object.position, dx = p.x - pos.x, dz = p.z - pos.z;
        if (dx * dx + dz * dz < r2) return true;
      }
      return false;
    },
    update(dt) {
      if (taunt.t > 0) { taunt.t -= dt; if (taunt.t <= 0) taunt.entity = null; }
      if (stealth.t > 0) { stealth.t -= dt; if (stealth.t <= 0) stealth.mul = 1; }
    },
    reset() { taunt.entity = null; taunt.t = 0; stealth.mul = 1; stealth.t = 0; },
  };
  return api;
}
