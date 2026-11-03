// Time-scale stack (CONTRACT §3.3). game.timeScale.
//   set(id, scale, durReal) / clear(id) / update(realDt) / value(): effective = min over active entries.
// Ids in use: focus (ranger), break, parry, bossDeath, ult, hitfeel, legacy (game.slowmo shim).
// Compensated time (player movement, skills runtime, sword actions) = dt * comp() while 'focus' is active.
export function createTimeScale(game) {
  const entries = new Map();    // id → {scale, left}
  let val = 1;
  function recompute() {
    let v = 1;
    for (const e of entries.values()) if (e.left > 0 && e.scale < v) v = e.scale;
    val = Math.max(0.001, v);
  }
  return {
    set(id, scale, durReal = 0.2) {
      if (!id) return;
      let e = entries.get(id);
      if (!e) { e = { scale: 1, left: 0 }; entries.set(id, e); }
      e.scale = Math.max(0.001, Math.min(1, +scale || 1));
      e.left = Math.max(0, +durReal || 0);
      recompute();
    },
    clear(id) { const e = entries.get(id); if (e) { e.left = 0; recompute(); } },
    has(id) { const e = entries.get(id); return !!e && e.left > 0; },
    timeLeft(id) { return entries.get(id)?.left || 0; },
    update(realDt) {
      let any = false;
      for (const e of entries.values()) if (e.left > 0) { e.left -= realDt; if (e.left <= 0) e.left = 0; any = true; }
      if (any) recompute();
    },
    value() { return val; },
    /** Factor for compensated time: 1 / value() while 'focus' is active, else 1. */
    comp() { const f = entries.get('focus'); return f && f.left > 0 ? 1 / val : 1; },
    active() { const out = []; for (const [id, e] of entries) if (e.left > 0) out.push({ id, scale: e.scale, left: e.left }); return out; },
    reset() { for (const e of entries.values()) e.left = 0; val = 1; },
  };
}
