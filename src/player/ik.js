// Two-bone foot IK for the hero (CONTRACT §10.4, DESIGN §9 A8). Player only (enemies are the enemies owner's).
//
// After the procedural FK pose is written (anim.js) and the rig's world matrices are current, each ankle is projected onto
// world.getGroundHeight(x, z, footY). The pelvis lowers by the lower foot's error (≤ 0.3 m), then each leg is re-solved
// analytically in its sagittal plane (thigh 0.44, shin 0.38) so the foot reaches its ground point; the ankle keeps the
// foot flat. Weight follows the stance phase (a swinging foot with a bent knee gets little IK) and fades out in the air.
import * as THREE from 'three';

const A = 0.44, B = 0.38, SOLE = 0.088;
const _w = new THREE.Vector3();

export class FootIK {
  constructor(rig) {
    this.rig = rig;
    this.drop = 0;            // current pelvis offset (smoothed)
    this.eL = 0; this.eR = 0; // smoothed per-foot errors
    this.weight = 0;
    this.enabled = true;
  }
  /**
   * groundAt(x, z, yHint) → height. w: 0..1 overall weight (grounded, not acting airborne). dt for smoothing.
   * Returns the pelvis drop applied (m).
   */
  update(groundAt, w, dt) {
    const r = this.rig;
    const k = 1 - Math.exp(-16 * Math.min(dt, 0.05));
    this.weight += ((this.enabled ? w : 0) - this.weight) * k;
    if (this.weight < 0.01) { this.drop += (0 - this.drop) * k; this._applyDrop(); return this.drop; }
    // foot errors (positive = ground above the sole → foot must rise)
    const eL = this._footError(r.ankleL, groundAt), eR = this._footError(r.ankleR, groundAt);
    this.eL += (eL - this.eL) * k; this.eR += (eR - this.eR) * k;
    // stance weight per foot: a bent (swinging) knee gets less IK
    const sL = 1 - smooth(0.35, 0.85, r.kneeL.rotation.x), sR = 1 - smooth(0.35, 0.85, r.kneeR.rotation.x);
    // pelvis lowers by the lower foot (never rises), so both feet can reach
    const want = Math.max(-0.3, Math.min(0, Math.min(this.eL * sL, this.eR * sR))) * this.weight;
    this.drop += (want - this.drop) * k;
    this._applyDrop();
    this._solveLeg(r.legL, r.kneeL, r.ankleL, (this.eL - this.drop) * sL * this.weight);
    this._solveLeg(r.legR, r.kneeR, r.ankleR, (this.eR - this.drop) * sR * this.weight);
    return this.drop;
  }
  _applyDrop() { this.rig.hips.position.y += this.drop; }
  _footError(ankle, groundAt) {
    ankle.getWorldPosition(_w);
    const sole = _w.y - SOLE;
    const g = groundAt(_w.x, _w.z, sole + 0.6);
    const e = g - sole;
    return Math.max(-0.35, Math.min(0.35, e));
  }
  /** Move the ankle vertically by dy (hips space ≈ world up) while keeping its horizontal offset. */
  _solveLeg(leg, knee, ankle, dy) {
    if (Math.abs(dy) < 1e-4) return;
    const a = leg.rotation.x, kk = knee.rotation.x;
    // current ankle in hip-joint space (sagittal plane y/z), rotation about X maps (0,-1,0) → (0,-cos,-sin)
    const ky = -A * Math.cos(a) - B * Math.cos(a + kk), kz = -A * Math.sin(a) - B * Math.sin(a + kk);
    const ty = ky + dy, tz = kz;
    let d = Math.hypot(ty, tz);
    d = Math.min(A + B - 0.005, Math.max(0.25, d));
    const cosPhi = (A * A + B * B - d * d) / (2 * A * B);
    const phi = Math.acos(Math.max(-1, Math.min(1, cosPhi)));
    const k2 = Math.PI - phi;                         // knee bends backward (positive)
    const beta = Math.atan2(-tz, -ty);                // direction of the target from the hip
    const gamma = Math.atan2(B * Math.sin(k2), A + B * Math.cos(k2));
    const a2 = beta - gamma;
    const da = a2 - a, dk = k2 - kk;
    leg.rotation.x = a2; knee.rotation.x = k2;
    ankle.rotation.x -= (da + dk);                    // keep the foot's world pitch
  }
}
function smooth(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
