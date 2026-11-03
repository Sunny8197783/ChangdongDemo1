// Spring-bone chains for secondary motion (CONTRACT §10.4, DESIGN §9 A6): braid, totem charms, quiver feathers,
// paladin tabard, shadowblade scarf tails. The links are ordinary rig groups built before skinMerge (they are bones of the
// merged skinned mesh), so driving their rotations here costs nothing extra to draw.
//
// Each link is a damped angular spring (x = pitch, z = roll) toward the direction of "effective gravity" in its parent
// frame: gravity − anchor acceleration × inertia (+ wind flutter, + leg push for tabards). Children subtract the
// accumulated parent angles so the chain hangs and lags like cloth. Pre-allocated scratch; no per-frame allocation.
import * as THREE from 'three';

const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _p = new THREE.Vector3(), _g = new THREE.Vector3();
const MAXA = 1.35;

export class Springs {
  constructor(chains) {
    this.chains = chains.map((c) => ({
      ...c,
      ax: new Float32Array(c.links.length), az: new Float32Array(c.links.length),
      vx: new Float32Array(c.links.length), vz: new Float32Array(c.links.length),
      prev: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), init: false,
      anchor: c.links[0].parent,
    }));
    this.t = 0;
  }
  /** Debug: {active chains, max |angle|, all finite}. Allocates (tests only). */
  stats() {
    let active = 0, max = 0, finite = true;
    for (const c of this.chains) {
      if (!c.init) continue;
      active++;
      for (let i = 0; i < c.links.length; i++) {
        const a = Math.max(Math.abs(c.ax[i]), Math.abs(c.az[i]));
        if (!Number.isFinite(a)) finite = false; else if (a > max) max = a;
      }
    }
    return { active, max, finite };
  }
  /** Snap every chain to rest (teleports, respawn). */
  reset() {
    for (const c of this.chains) { c.init = false; c.ax.fill(0); c.az.fill(0); c.vx.fill(0); c.vz.fill(0); }
  }
  /**
   * dt: frame time (s). ctx: {legF, legB, wind (0..1.5), gust: Vector3 world wind}. The rig's matrixWorld must be current.
   */
  update(dt, ctx) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    for (const c of this.chains) {
      const anchor = c.anchor;
      if (!anchor) continue;
      // skip hidden chains (outfit not worn)
      let vis = true; for (let o = c.links[0]; o; o = o.parent) if (!o.visible) { vis = false; break; }
      if (!vis) { c.init = false; continue; }
      anchor.getWorldPosition(_p);
      if (!c.init) { c.prev.copy(_p); c.vel.set(0, 0, 0); c.acc.set(0, 0, 0); c.init = true; }
      // anchor velocity / acceleration (smoothed)
      const vx = (_p.x - c.prev.x) / dt, vy = (_p.y - c.prev.y) / dt, vz = (_p.z - c.prev.z) / dt;
      const k = 1 - Math.exp(-18 * dt);
      const ax = (vx - c.vel.x) / dt, ay = (vy - c.vel.y) / dt, az = (vz - c.vel.z) / dt;
      c.acc.x += (Math.max(-60, Math.min(60, ax)) - c.acc.x) * k;
      c.acc.y += (Math.max(-60, Math.min(60, ay)) - c.acc.y) * k;
      c.acc.z += (Math.max(-60, Math.min(60, az)) - c.acc.z) * k;
      c.vel.set(vx, vy, vz); c.prev.copy(_p);
      // effective gravity (world): g − a×inertia − v×drag (air resistance makes tails stream behind)
      const drag = 0.35 * (c.wind || 0.4);
      _g.set(-c.acc.x * 0.06 * c.inertia - vx * drag, -9.8 * c.gravity - c.acc.y * 0.04 * c.inertia, -c.acc.z * 0.06 * c.inertia - vz * drag);
      if (c.wind && ctx?.gust) _g.addScaledVector(ctx.gust, c.wind);
      // into the anchor's local frame
      anchor.getWorldQuaternion(_q); _qi.copy(_q).invert();
      _g.applyQuaternion(_qi);
      const len = Math.hypot(_g.x, _g.y, _g.z) || 1;
      const gx = _g.x / len, gy = _g.y / len, gz = _g.z / len;
      // hanging angles that align local −Y with the gravity direction
      let tx = Math.atan2(-gz, -gy), tz = Math.atan2(gx, -gy);
      if (c.legPush) tx -= (c.legPush > 0 ? (ctx?.legF || 0) : -(ctx?.legB || 0)) * 0.9;
      let accX = 0, accZ = 0;
      const n = c.links.length;
      for (let i = 0; i < n; i++) {
        const r = c.rest[i] || c.rest[0];
        const share = c.parallel ? 1 : (i === 0 ? 0.7 : 0.3);
        const flutter = c.wind ? Math.sin(this.t * (7 + i * 2.3) + i) * 0.06 * (ctx?.wind || 0) * c.wind : 0;
        const targX = tx * share + r.x + flutter;
        const targZ = (tz * share + r.z) + flutter * 0.6;
        // child links relative to the accumulated parent angle
        const ex = (c.parallel ? targX : targX - (i ? accX * 0.25 : 0)) - c.ax[i];
        const ez = (c.parallel ? targZ : targZ - (i ? accZ * 0.25 : 0)) - c.az[i];
        const st = c.stiff * (1 - i * 0.12), dp = c.damp;
        c.vx[i] += (ex * st - c.vx[i] * dp) * dt;
        c.vz[i] += (ez * st - c.vz[i] * dp) * dt;
        c.ax[i] = Math.max(-MAXA, Math.min(MAXA, c.ax[i] + c.vx[i] * dt));
        c.az[i] = Math.max(-MAXA, Math.min(MAXA, c.az[i] + c.vz[i] * dt));
        c.links[i].rotation.set(c.ax[i], 0, c.az[i]);
        accX += c.ax[i]; accZ += c.az[i];
      }
    }
  }
}
