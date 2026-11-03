// v3 surface channels (CONTRACT §13 world.surface2): mud, blessed, cursed, overgrowth, rubble.
// Reuses the surface.js grid (172², 2 m) with one Float32 timer array per channel + an active list per channel, ticked at
// 10 Hz (game time). Only active cells are visited. Terrain tint goes through the burn texture's spare channels:
// B = blessed (gold sheen), A = cursed (violet miasma); mud / overgrowth / rubble are query-only (their look comes from
// the spell zone that made them).
//   mud(pos, r, s) · bless(pos, r, s) · curse(pos, r, s) · overgrow(pos, r, s) · rubble(pos, r, s)   (s = seconds)
//   isBlessed(pos) · isCursed(pos) · isMud(pos) · surfaceAt(pos) → 'none'|'mud'|'blessed'|'cursed'|'overgrowth'|'rubble'
import { GRID } from './surface.js';

export const CHANNELS = ['mud', 'blessed', 'cursed', 'overgrowth', 'rubble'];
// surfaceAt priority when several overlap (cursed beats blessed only if stronger — see below)
const PRIORITY = ['cursed', 'blessed', 'mud', 'overgrowth', 'rubble'];
const MAX_ACTIVE = 4000;   // per channel (≈ 16 000 m²), oldest painting wins over new beyond this

export function createSurface2(game, field) {
  const { n, x0, z0, cs } = GRID;
  const N = n * n;
  const ch = {};
  for (const c of CHANNELS) ch[c] = { t: new Float32Array(N), max: new Float32Array(N), list: [], on: new Uint8Array(N) };
  const data = field?.data || null;
  let dirty = false, acc = 0;
  const cellOf = (x, z) => {
    const i = Math.floor((x - x0) / cs), j = Math.floor((z - z0) / cs);
    if (i < 0 || j < 0 || i >= n || j >= n) return -1;
    return j * n + i;
  };
  function paint(name, pos, r = 3, s = 8) {
    const C = ch[name]; if (!C || !pos) return 0;
    const rr = Math.max(0.5, r), sec = Math.max(0.1, s);
    const i0 = Math.max(0, Math.floor((pos.x - rr - x0) / cs)), i1 = Math.min(n - 1, Math.floor((pos.x + rr - x0) / cs));
    const j0 = Math.max(0, Math.floor((pos.z - rr - z0) / cs)), j1 = Math.min(n - 1, Math.floor((pos.z + rr - z0) / cs));
    let cnt = 0; const r2 = (rr + cs * 0.5) ** 2;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = x0 + (i + 0.5) * cs, cz = z0 + (j + 0.5) * cs;
      if ((cx - pos.x) ** 2 + (cz - pos.z) ** 2 > r2) continue;
      const k = j * n + i;
      if (!C.on[k]) { if (C.list.length >= MAX_ACTIVE) continue; C.on[k] = 1; C.list.push(k); }
      if (sec > C.t[k]) { C.t[k] = sec; C.max[k] = Math.max(C.max[k], sec); }
      cnt++;
      // blessing cleanses curse and vice versa (the stronger one wins)
      if (name === 'blessed' && ch.cursed.on[k]) ch.cursed.t[k] = Math.max(0, ch.cursed.t[k] - sec);
      if (name === 'cursed' && ch.blessed.on[k]) ch.blessed.t[k] = Math.max(0, ch.blessed.t[k] - sec);
      writeTint(k);
    }
    return cnt;
  }
  function writeTint(k) {
    if (!data) return;
    const b = ch.blessed, c = ch.cursed;
    const vb = b.on[k] ? Math.min(1, b.t[k] / Math.min(1.5, b.max[k] || 1)) : 0;
    const vc = c.on[k] ? Math.min(1, c.t[k] / Math.min(1.5, c.max[k] || 1)) : 0;
    const nb = (vb * 255) | 0, nc = (vc * 255) | 0;
    if (data[k * 4 + 2] !== nb || data[k * 4 + 3] !== nc) { data[k * 4 + 2] = nb; data[k * 4 + 3] = nc; dirty = true; }
  }
  function tick(dt) {
    for (const name of CHANNELS) {
      const C = ch[name]; const L = C.list;
      for (let q = L.length - 1; q >= 0; q--) {
        const k = L[q];
        C.t[k] -= dt;
        if (C.t[k] <= 0) { C.t[k] = 0; C.max[k] = 0; C.on[k] = 0; L[q] = L[L.length - 1]; L.pop(); }
        if (name === 'blessed' || name === 'cursed') writeTint(k);
      }
    }
  }
  const val = (name, pos) => { if (!pos) return 0; const k = cellOf(pos.x, pos.z); return k >= 0 && ch[name].on[k] ? ch[name].t[k] : 0; };
  const api = {
    channels: CHANNELS,
    mud: (pos, r, s) => paint('mud', pos, r, s),
    bless: (pos, r, s) => paint('blessed', pos, r, s),
    curse: (pos, r, s) => paint('cursed', pos, r, s),
    overgrow: (pos, r, s) => paint('overgrowth', pos, r, s),
    rubble: (pos, r, s) => paint('rubble', pos, r, s),
    isBlessed: (pos) => val('blessed', pos) > 0,
    isCursed: (pos) => val('cursed', pos) > 0,
    isMud: (pos) => val('mud', pos) > 0,
    isOvergrown: (pos) => val('overgrowth', pos) > 0,
    isRubble: (pos) => val('rubble', pos) > 0,
    /** Remaining seconds of a channel at pos (0 when inactive). */
    timeLeft: (name, pos) => (ch[name] ? val(name, pos) : 0),
    surfaceAt(pos) {
      if (!pos) return 'none';
      const k = cellOf(pos.x, pos.z); if (k < 0) return 'none';
      for (let i = 0; i < PRIORITY.length; i++) { const C = ch[PRIORITY[i]]; if (C.on[k] && C.t[k] > 0) return PRIORITY[i]; }
      return 'none';
    },
    /** Clear every channel in a radius (or everything when pos is null). */
    clear(pos = null, r = 4) {
      for (const name of CHANNELS) {
        const C = ch[name];
        for (let q = C.list.length - 1; q >= 0; q--) {
          const k = C.list[q];
          if (pos) { const cx = x0 + ((k % n) + 0.5) * cs, cz = z0 + (Math.floor(k / n) + 0.5) * cs; if ((cx - pos.x) ** 2 + (cz - pos.z) ** 2 > r * r) continue; }
          C.t[k] = 0;
        }
      }
      tick(0);
    },
    activeCount(name) { return name ? ch[name]?.list.length || 0 : CHANNELS.reduce((s, c) => s + ch[c].list.length, 0); },
    update(dt) {
      if (dt > 0) {
        acc += dt;
        if (acc >= 0.1) { const st = acc; acc = 0; tick(st); }
      }
      if (dirty && field?.tex) { field.tex.needsUpdate = true; dirty = false; }
    },
  };
  return api;
}
