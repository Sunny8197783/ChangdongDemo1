// v3 small stand-on platforms (CONTRACT §13): ice pillar tops, glacier blocks, ice bridges, stepping stones, obsidian.
// Only the player stands on them (getGroundHeight with a yHint). Platforms live in an 8 m grid bucket; getGroundHeight
// checks only the cell of (x, z). ≤ 16 dynamic platforms alive (the oldest is recycled). Static "tops" (the giant
// mushroom cap, ruin pillars) use the same buckets but do not count toward the cap.
//   addPlatform({id, shape:'disc'|'box', center, r?|size?, top, life?, yaw?}) → handle {id, top, velocity, delta, center, moveTo()}
//   removePlatform(handle)
import * as THREE from 'three';

const CELL = 8, OFF = 256, GN = 64, MAX_ALIVE = 16;

export function createPlatforms(game) {
  const buckets = new Map();
  const dynamic = [], statics = [];
  let nextId = 1, frame = 0;
  const key = (i, j) => i * GN + j;
  function range(p, fn) {
    const r = p.rb;
    const i0 = Math.max(0, Math.floor((p.center.x - r + OFF) / CELL)), i1 = Math.min(GN - 1, Math.floor((p.center.x + r + OFF) / CELL));
    const j0 = Math.max(0, Math.floor((p.center.z - r + OFF) / CELL)), j1 = Math.min(GN - 1, Math.floor((p.center.z + r + OFF) / CELL));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) fn(key(i, j));
  }
  const ins = (p) => range(p, (k) => { let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(p); });
  const del = (p) => range(p, (k) => { const a = buckets.get(k); if (!a) return; const i = a.indexOf(p); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } });

  function make(o, isStatic) {
    const c = o.center || o.pos || { x: 0, y: 0, z: 0 };
    const shape = o.shape === 'box' ? 'box' : 'disc';
    let hx = 0, hz = 0, r = o.r ?? 1.5;
    if (shape === 'box') { const s = o.size || { x: 2, z: 2 }; hx = (s.x ?? s[0] ?? 2) / 2; hz = (s.z ?? s[2] ?? s.y ?? 2) / 2; r = Math.hypot(hx, hz); }
    const yaw = o.yaw || 0;
    const p = {
      id: o.id || 'pf' + nextId++, shape, center: new THREE.Vector3(c.x, c.y ?? 0, c.z), r, hx, hz, rb: r,
      cos: Math.cos(yaw), sin: Math.sin(yaw), top: o.top ?? (c.y ?? 0), life: o.life ?? Infinity, t: 0,
      velocity: new THREE.Vector3(), delta: new THREE.Vector3(), alive: true, isStatic, _moved: -1, owner: o.owner || null,
      /** Move the platform (owner-driven). dt (game s) sets velocity; delta accumulates until the next frame's world update. */
      moveTo(x, top, z, dt) {
        if (!p.alive) return;
        del(p);
        const dx = x - p.center.x, dy = top - p.top, dz = z - p.center.z;
        if (p._moved !== frame) p.delta.set(0, 0, 0);
        p.delta.x += dx; p.delta.y += dy; p.delta.z += dz;
        if (dt > 0) p.velocity.set(dx / dt, dy / dt, dz / dt);
        p.center.set(x, p.center.y + dy, z); p.top = top; p._moved = frame;
        ins(p);
      },
    };
    return p;
  }
  function addPlatform(o = {}) {
    if (dynamic.length >= MAX_ALIVE) removePlatform(dynamic[0]);
    const p = make(o, false);
    dynamic.push(p); ins(p);
    return p;
  }
  function addStatic(o) { const p = make(o, true); statics.push(p); ins(p); return p; }
  function removePlatform(p) {
    if (!p || !p.alive) return false;
    p.alive = false; del(p);
    const arr = p.isStatic ? statics : dynamic;
    const i = arr.indexOf(p); if (i >= 0) arr.splice(i, 1);
    return true;
  }
  function contains(p, x, z) {
    const dx = x - p.center.x, dz = z - p.center.z;
    if (p.shape === 'box') {
      const lx = dx * p.cos - dz * p.sin, lz = dx * p.sin + dz * p.cos;
      return Math.abs(lx) <= p.hx && Math.abs(lz) <= p.hz;
    }
    return dx * dx + dz * dz <= p.r * p.r;
  }
  /** Highest platform top at (x, z) with top ≤ yHint + 1.2; null when none. Sets api.last to the winning handle. */
  function topAt(x, z, yHint) {
    api.last = null;
    const i = Math.floor((x + OFF) / CELL), j = Math.floor((z + OFF) / CELL);
    if (i < 0 || j < 0 || i >= GN || j >= GN) return null;
    const a = buckets.get(key(i, j)); if (!a || !a.length) return null;
    let best = null;
    const lim = yHint + 1.2;
    for (let k = 0; k < a.length; k++) {
      const p = a[k];
      if (p.top > lim || (best !== null && p.top <= best)) continue;
      if (!contains(p, x, z)) continue;
      best = p.top; api.last = p;
    }
    return best;
  }
  const api = {
    dynamic, statics, last: null,
    addPlatform, addStatic, removePlatform, topAt, contains,
    get alive() { return dynamic.length; },
    update(dt) {
      frame++;
      for (let i = dynamic.length - 1; i >= 0; i--) {
        const p = dynamic[i];
        if (p._moved < frame - 1 && (p.delta.x || p.delta.y || p.delta.z)) { p.delta.set(0, 0, 0); p.velocity.set(0, 0, 0); }
        if (p.life !== Infinity) { p.t += dt; if (p.t >= p.life) removePlatform(p); }
      }
    },
  };
  return api;
}
