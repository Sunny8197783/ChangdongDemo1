// Interaction registry (CONTRACT §3.3). game.interact.
//   offer(id, {pos: Vector3 | () => Vector3, r, label, onUse, priority = 0, enabled?: () => boolean})
//   withdraw(id) / current(): {id, label} | null / use(): boolean
// The nearest enabled offer within r of the player (highest priority first) is re-evaluated at 10 Hz in update().
// F is interact only: core input calls use() on KeyF. Emits interactChanged {id, label} | null when the current offer changes.
export function createInteract(game) {
  const offers = new Map();
  let cur = null, acc = 0;
  const curView = { id: '', label: '' };
  const posOf = (o) => { try { return typeof o.pos === 'function' ? o.pos() : o.pos; } catch (_) { return null; } };
  function evaluate() {
    const pp = game.player?.object?.position;
    let best = null, bestPri = -Infinity, bestD = Infinity;
    if (pp) {
      for (const o of offers.values()) {
        if (o.enabled) { let ok = false; try { ok = !!o.enabled(); } catch (_) { ok = false; } if (!ok) continue; }
        const p = posOf(o); if (!p) continue;
        const dx = p.x - pp.x, dz = p.z - pp.z, dy = (p.y ?? pp.y) - pp.y;
        const d2 = dx * dx + dz * dz + dy * dy * 0.25;
        const r = o.r ?? 2.5;
        if (d2 > r * r) continue;
        const pri = o.priority || 0;
        if (pri > bestPri || (pri === bestPri && d2 < bestD)) { best = o; bestPri = pri; bestD = d2; }
      }
    }
    if (best !== cur || (best && curView.label !== best.label)) {
      cur = best;
      if (cur) { curView.id = cur.id; curView.label = cur.label; }
      game.events.emit('interactChanged', cur ? { id: cur.id, label: cur.label } : null);
    }
  }
  const api = {
    offer(id, o) {
      if (!id || !o) return;
      offers.set(id, { id, pos: o.pos, r: o.r ?? 2.5, label: o.label || '상호작용', onUse: o.onUse, priority: o.priority || 0, enabled: o.enabled || null });
      acc = 1;   // re-evaluate next update
    },
    withdraw(id) {
      if (!offers.delete(id)) return;
      if (cur?.id === id) { cur = null; game.events.emit('interactChanged', null); }
    },
    has(id) { return offers.has(id); },
    current() { return cur ? curView : null; },
    /** Use the current offer. Returns true when something handled F. */
    use() {
      evaluate();
      if (!cur) return false;
      try { const r = cur.onUse?.(cur.id); return r !== false; }
      catch (err) { console.error('[interact] onUse', cur.id, err); return false; }
    },
    update(realDt) {
      acc += realDt;
      if (acc >= 0.1) { acc = 0; evaluate(); }
    },
    list() { return [...offers.keys()]; },
    clear() { offers.clear(); if (cur) { cur = null; game.events.emit('interactChanged', null); } },
  };
  return api;
}
