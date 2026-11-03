// v3 temporary colliders + updraft volumes (CONTRACT §13).
//   addTempCollider({shape:'box'|'cyl', pos, size|r, h, yaw, life, blocksProjectiles, onProjectile?(p) → 'block'|'reflect'})
//   removeCollider(handle) · collidersBlockingProjectiles (live array) · projectileBlockAt(p, out) (8 m bucketed)
//   addUpdraft({pos, r, h, strength, life?, color?}) / removeUpdraft(handle) · updraftAt(pos) (merged into surface.getUpdraft)
// Movement blocking reuses world.colliders (resolveCollision): a temp collider is pushed there with an OBB/circle shape.
import * as THREE from 'three';

const CELL = 8, OFF = 256, GN = 64;   // projectile bucket grid (covers ±256 m)
const MAX_UPDRAFTS = 16;

export function createColliders(game, world, { colliders, onChange }) {
  const live = [];                      // all temp collider handles
  const blocking = [];                  // world.collidersBlockingProjectiles
  const buckets = new Map();            // cell → handles (blocking only)
  let nextId = 1;

  const cellKey = (i, j) => i * GN + j;
  function bucketRange(c, fn) {
    const r = c.r;
    const i0 = Math.max(0, Math.floor((c.x - r + OFF) / CELL)), i1 = Math.min(GN - 1, Math.floor((c.x + r + OFF) / CELL));
    const j0 = Math.max(0, Math.floor((c.z - r + OFF) / CELL)), j1 = Math.min(GN - 1, Math.floor((c.z + r + OFF) / CELL));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) fn(cellKey(i, j));
  }
  function bucketAdd(c) { bucketRange(c, (k) => { let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(c); }); }
  function bucketDel(c) { bucketRange(c, (k) => { const a = buckets.get(k); if (!a) return; const i = a.indexOf(c); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } }); }

  function addTempCollider(o = {}) {
    const pos = o.pos || o.position || { x: 0, y: 0, z: 0 };
    const shape = o.shape === 'box' ? 'box' : 'cyl';
    const yaw = o.yaw || 0;
    let hx = 0.5, hz = 0.5, r;
    if (shape === 'box') {
      const s = o.size || { x: 1, y: o.h ?? 2, z: 1 };
      hx = (s.x ?? s[0] ?? 1) / 2; hz = (s.z ?? s[2] ?? 1) / 2;
      r = Math.hypot(hx, hz);
    } else r = o.r ?? 1;
    const h = o.h ?? (o.size ? (o.size.y ?? o.size[1] ?? 2) : 2);
    const base = Number.isFinite(pos.y) ? pos.y : world.getHeight(pos.x, pos.z);
    const c = {
      id: o.id || 'tc' + nextId++, kind: 'temp', shape, x: pos.x, z: pos.z, r, base, top: base + h, h,
      cos: Math.cos(yaw), sin: Math.sin(yaw), hx, hz, yaw,
      life: o.life ?? Infinity, t: 0, blocksProjectiles: !!o.blocksProjectiles, onProjectile: o.onProjectile || null,
      blocksMovement: o.blocksMovement !== false, owner: o.owner || null, alive: true,
    };
    if (shape === 'box') c.box = true;
    live.push(c);
    if (c.blocksMovement) colliders.push(c);
    if (c.blocksProjectiles) { blocking.push(c); bucketAdd(c); }
    onChange();
    return c;
  }
  function removeCollider(c) {
    if (!c || !c.alive) return false;
    c.alive = false;
    let i = live.indexOf(c); if (i >= 0) live.splice(i, 1);
    i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1);
    i = blocking.indexOf(c); if (i >= 0) { blocking.splice(i, 1); bucketDel(c); }
    onChange();
    return true;
  }
  /** Move a temp collider (re-buckets). */
  function moveCollider(c, x, y, z, yaw) {
    if (!c?.alive) return;
    if (c.blocksProjectiles) bucketDel(c);
    c.x = x; c.z = z; if (Number.isFinite(y)) { c.base = y; c.top = y + c.h; }
    if (Number.isFinite(yaw)) { c.yaw = yaw; c.cos = Math.cos(yaw); c.sin = Math.sin(yaw); }
    if (c.blocksProjectiles) bucketAdd(c);
    onChange();
  }

  /** Point inside test; fills n (outward normal, horizontal) when given. */
  function inside(c, x, y, z, n) {
    if (y < c.base - 0.05 || y > c.top + 0.05) return false;
    const dx = x - c.x, dz = z - c.z;
    if (c.shape === 'box') {
      const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
      if (Math.abs(lx) > c.hx || Math.abs(lz) > c.hz) return false;
      if (n) {
        // face normal of the nearest face, rotated back to world
        let nx = 0, nz = 0;
        if (c.hx - Math.abs(lx) < c.hz - Math.abs(lz)) nx = Math.sign(lx) || 1; else nz = Math.sign(lz) || 1;
        n.set(nx * c.cos + nz * c.sin, 0, -nx * c.sin + nz * c.cos);
      }
      return true;
    }
    const d2 = dx * dx + dz * dz;
    if (d2 > c.r * c.r) return false;
    if (n) { const d = Math.sqrt(d2) || 1; n.set(dx / d, 0, dz / d); }
    return true;
  }

  const _n = new THREE.Vector3();
  /**
   * Is the projectile (or point) inside a projectile-blocking collider? Returns 'block' | 'reflect' | null.
   * out (optional): { collider, normal:Vector3 } is filled.
   */
  function projectileBlockAt(p, out) {
    if (!blocking.length || !p) return null;
    const v = p.isVector3 ? p : (p.position || p.pos || p.object?.position || p.mesh?.position);
    if (!v) return null;
    const i = Math.floor((v.x + OFF) / CELL), j = Math.floor((v.z + OFF) / CELL);
    if (i < 0 || j < 0 || i >= GN || j >= GN) return null;
    const a = buckets.get(cellKey(i, j)); if (!a) return null;
    for (let k = 0; k < a.length; k++) {
      const c = a[k];
      if (!inside(c, v.x, v.y, v.z, _n)) continue;
      let res = 'block';
      if (c.onProjectile) { try { res = c.onProjectile(p) || 'block'; } catch (err) { console.error('[world] onProjectile', err); res = 'block'; } }
      if (res !== 'block' && res !== 'reflect') continue;   // the callback may let it pass ('pass')
      if (out) { out.collider = c; if (out.normal?.copy) out.normal.copy(_n); else out.normal = _n.clone(); out.result = res; }
      return res;
    }
    return null;
  }

  // ---------------------------------------------------------------- updraft volumes
  const drafts = [];   // {id, x, y, z, r, h, strength, life, t, color, alive}
  let draftId = 1;
  function addUpdraft(o = {}) {
    const p = o.pos || o.position || { x: 0, y: undefined, z: 0 };
    if (drafts.length >= MAX_UPDRAFTS) {
      // recycle the oldest temporary one (static ones are never recycled)
      const i = drafts.findIndex((d) => Number.isFinite(d.life));
      if (i < 0) return null;
      drafts[i].alive = false; drafts.splice(i, 1);
    }
    const d = {
      id: o.id || 'ud' + draftId++, x: p.x, z: p.z, y: Number.isFinite(p.y) ? p.y : world.getHeight(p.x, p.z),
      r: o.r ?? 2.5, h: o.h ?? 18, strength: o.strength ?? 22, life: o.life ?? Infinity, t: 0, alive: true,
      color: new THREE.Color(o.color ?? 0xc8ffe9), visual: o.visual !== false, kind: o.kind || 'spirit',
    };
    drafts.push(d);
    return d;
  }
  function removeUpdraft(d) {
    if (!d) return false;
    const i = drafts.indexOf(d); if (i < 0) return false;
    d.alive = false; drafts.splice(i, 1); return true;
  }
  /** Upward acceleration (m/s²) from updraft volumes at pos. */
  function updraftAt(pos) {
    let best = 0;
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const dx = pos.x - d.x, dz = pos.z - d.z; const r2 = dx * dx + dz * dz;
      const rr = d.r * 1.25; if (r2 > rr * rr) continue;
      const hy = pos.y - d.y; if (hy < -1 || hy > d.h) continue;
      const edge = 1 - Math.max(0, (Math.sqrt(r2) - d.r) / (rr - d.r + 1e-3));
      const top = hy > d.h - 4 ? (d.h - hy) / 4 : 1;
      const grow = d.life < Infinity ? Math.min(1, d.t * 3) * Math.min(1, (d.life - d.t) * 2) : 1;
      const s = d.strength * edge * top * grow;
      if (s > best) best = s;
    }
    return best;
  }

  return {
    live, blocking, drafts,
    addTempCollider, removeCollider, moveCollider, projectileBlockAt, inside,
    addUpdraft, removeUpdraft, updraftAt,
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const c = live[i]; if (c.life === Infinity) continue;
        c.t += dt; if (c.t >= c.life) removeCollider(c);
      }
      for (let i = drafts.length - 1; i >= 0; i--) {
        const d = drafts[i]; d.t += dt;
        if (d.t >= d.life) { d.alive = false; drafts.splice(i, 1); }
      }
    },
  };
}
