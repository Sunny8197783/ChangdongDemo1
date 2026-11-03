// 원소 교향 (resonance) — CONTRACT §8.5, DESIGN §4.3 E. Owner: combat.
// Tracks reaction ids per target over a 6 s window; 3 distinct ids → `resonance {target, ids}` + the stats source
// 'rx:resonance' {freeNext:true, nextMul:1.3} for 8 s (skills consumes it on the next cast). Internal cooldown 10 s.
// Only player-caused reactions count. The mage 원소 연쇄 signature is a separate mechanic (skills/classkits).

export const RESONANCE = { window: 6, distinct: 3, icd: 10, duration: 8, mods: { freeNext: true, nextMul: 1.3 } };

export function createResonance(game, C) {
  const hist = new WeakMap();   // target → [{id, t}] (small ring, ≤ 6)
  let readyAt = -1e9;
  const ids = [];

  function track(t, id) {
    if (!t || !id || id === 'break' || id === 'resonance') return false;
    const now = game.time;
    let h = hist.get(t);
    if (!h) { h = []; hist.set(t, h); }
    // drop old entries
    for (let i = h.length - 1; i >= 0; i--) if (now - h[i].t > RESONANCE.window) h.splice(i, 1);
    const ex = h.find((x) => x.id === id);
    if (ex) ex.t = now; else { h.push({ id, t: now }); if (h.length > 6) h.shift(); }
    if (h.length >= RESONANCE.distinct && now >= readyAt) {
      ids.length = 0; for (const x of h) ids.push(x.id);
      h.length = 0;
      return fire(t, ids.slice());
    }
    return false;
  }
  function fire(t, list) {
    readyAt = game.time + RESONANCE.icd;
    try { game.stats?.set?.('rx:resonance', RESONANCE.mods, { duration: RESONANCE.duration }); } catch (_) { /* */ }
    const p = C.getCenter(t, C._tv(6)).clone();
    game.events.emit('resonance', { target: t, ids: list });
    C.discover?.('resonance');
    game.events.emit('reaction', { id: 'resonance', name: '교향!', point: p, target: t, elements: ['physical', 'physical'], variant: null, family: 'universal' });
    try { game.vfx?.preset?.('rx_resonance', p, { family: 'universal' }); } catch (_) { /* */ }
    try { game.post?.pulse?.(0.35, 0.3); } catch (_) { /* */ }
    return true;
  }
  return {
    track,
    force(t) { if (!t) return false; readyAt = -1e9; return fire(t, ['debug']); },
    readyIn: () => Math.max(0, readyAt - game.time),
    reset() { readyAt = -1e9; },
  };
}
