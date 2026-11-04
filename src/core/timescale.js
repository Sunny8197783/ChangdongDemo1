// Time-scale stack (CONTRACT §3.3 + PLAN v4 §2.5). game.timeScale.
//   set(id, scale, durReal, {compensate?, priority?}) → boolean (granted) / clear(id) / update(realDt) / value() / comp()
// effective value = min over active entries.
// Ids in use: focus (ranger), break, parry, bossDeath, ult, hitfeel, legacy (game.slowmo shim); v4: witch (perfect-dodge
// witch time), teach (first-tell teaching slow motion), cinematic.
// v4 slow-motion arbitration: at most ONE arbitrated slow-motion entry is active at a time. Arbitrated = the ids of
// SLOWMO_PRIORITY or any request that passes opts.priority. A new arbitrated request while another one is active is
// ignored (returns false) unless its priority is higher (cinematic 3 > teach 2 > witch 1); then the old one is cleared.
// Compensated time (player movement, skills runtime, sword actions) = dt * comp(): comp() = 1 / value() while any
// compensating entry is active ('focus' always compensates; others when set with {compensate:true}).
export const SLOWMO_PRIORITY = { witch: 1, teach: 2, cinematic: 3 };

export function createTimeScale(game) {
  const entries = new Map();    // id → {scale, left, compensate, priority}
  let val = 1, compOn = false;
  function recompute() {
    let v = 1, c = false;
    for (const [id, e] of entries) {
      if (!(e.left > 0)) continue;
      if (e.scale < v) v = e.scale;
      if (e.compensate || id === 'focus') c = true;
    }
    val = Math.max(0.001, v); compOn = c;
  }
  function activeArbitrated(exceptId) {
    for (const [id, e] of entries) if (id !== exceptId && e.left > 0 && e.priority > 0) return [id, e];
    return null;
  }
  const api = {
    SLOWMO_PRIORITY,
    set(id, scale, durReal = 0.2, opts = {}) {
      if (!id) return false;
      const prio = opts.priority ?? SLOWMO_PRIORITY[id] ?? 0;
      if (prio > 0 && (+durReal || 0) > 0) {
        const cur = activeArbitrated(id);
        if (cur) {
          if (prio <= cur[1].priority) return false;    // one slow-motion source at a time
          cur[1].left = 0;
        }
      }
      let e = entries.get(id);
      if (!e) { e = { scale: 1, left: 0, compensate: false, priority: 0 }; entries.set(id, e); }
      e.scale = Math.max(0.001, Math.min(1, +scale || 1));
      e.left = Math.max(0, +durReal || 0);
      e.compensate = !!opts.compensate;
      e.priority = prio;
      recompute();
      return true;
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
    /** Factor for compensated time: 1 / value() while a compensating entry ('focus', or compensate:true) is active, else 1. */
    comp() { return compOn ? 1 / val : 1; },
    /** The active arbitrated slow-motion source id, or null. */
    slowmoSource() { const a = activeArbitrated(null); return a ? a[0] : null; },
    active() { const out = []; for (const [id, e] of entries) if (e.left > 0) out.push({ id, scale: e.scale, left: e.left, compensate: e.compensate, priority: e.priority }); return out; },
    reset() { for (const e of entries.values()) e.left = 0; val = 1; compOn = false; },
  };
  return api;
}
