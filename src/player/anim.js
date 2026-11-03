// Procedural animation for the wizard rig: locomotion blend + upper-body action poses.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/utils.js';

// Upper-body pose fields
// 0 aRx, 1 aRz, 2 eR, 3 aLx, 4 aLz, 5 eL, 6 sPitch, 7 sRoll, 8 tRx, 9 tRy, 10 hipY, 11 crouch, 12 headRx
const F = 13;
const P = (...a) => Float32Array.from(a);
const IDLE = P(-0.22, -0.12, -0.95, 0.06, 0.13, -0.3, 0.06, 0, 0.03, 0, 0, 0, 0);
const SPRINT = P(0.45, -0.22, -0.35, 0.25, 0.16, -0.55, -0.95, 0, 0.3, 0, 0, 0.05, 0);
const AIR = P(-0.65, -0.4, -0.7, -0.55, 0.55, -0.75, 0.3, 0, -0.05, 0, 0, 0, -0.1);
const GLIDE = P(-0.15, -1.3, -0.12, -0.15, 1.32, -0.15, 0.0, -0.4, 0.38, 0, 0, 0, -0.25);
const CHARGE = P(-1.3, 0.12, -0.15, -1.15, -0.55, -0.55, 1.05, 0, 0.08, -0.2, 0, 0.25, 0);
const DEAD = P(-0.4, -1.0, -0.3, -0.3, 1.0, -0.4, -0.4, -0.6, 0.2, 0, 0, 0.3, 0.3);

const kf = (t, ...a) => ({ t, p: Float32Array.from(a) });
const CASTS = {
  basic: {
    dur: 0.34, frames: [
      kf(0.0, -0.9, 0.05, -0.6, -0.4, 0.2, -0.5, 0.55, 0, 0.0, 0.15, 0, 0.1, 0),
      kf(0.32, -1.58, 0.14, -0.02, -0.55, 0.3, -0.4, 1.45, 0, 0.18, -0.22, 0, 0.22, 0),
      kf(0.6, -1.52, 0.12, -0.05, -0.5, 0.3, -0.4, 1.4, 0, 0.16, -0.2, 0, 0.2, 0),
      kf(1.0, -1.05, 0.05, -0.55, -0.3, 0.2, -0.4, 0.75, 0, 0.06, 0, 0, 0.1, 0),
    ],
  },
  heavy: {
    dur: 0.62, frames: [
      kf(0.0, -0.55, -0.7, -0.4, -0.6, 0.1, -0.6, -0.3, 0.3, -0.05, 0.45, 0, 0.25, 0),
      kf(0.28, -0.7, -0.85, -0.3, -0.95, 0.0, -0.5, -0.5, 0.4, -0.12, 0.6, 0, 0.32, 0),
      kf(0.48, -1.62, 0.22, 0.0, -1.48, -0.48, -0.1, 1.52, 0, 0.32, -0.38, 0, 0.5, 0),
      kf(0.74, -1.55, 0.2, 0.0, -1.42, -0.45, -0.1, 1.45, 0, 0.28, -0.3, 0, 0.42, 0),
      kf(1.0, -1.0, 0.0, -0.5, -0.6, 0.1, -0.5, 0.6, 0, 0.08, 0, 0, 0.15, 0),
    ],
  },
  ultimate: {
    dur: 1.2, frames: [
      kf(0.0, -1.2, 0.0, -0.3, -1.0, -0.2, -0.5, 0.5, 0, 0.0, 0, 0, 0.2, 0),
      kf(0.3, -2.95, 0.15, -0.1, -2.75, -0.22, -0.2, 0.0, 0, -0.2, 0, 0.07, 0, -0.45),
      kf(0.5, -3.02, 0.15, -0.08, -2.8, -0.22, -0.2, -0.05, 0, -0.24, 0, 0.09, 0, -0.5),
      kf(0.6, -1.0, 0.2, -0.1, -0.9, -0.32, -0.2, 2.3, 0, 0.52, 0, 0, 0.95, 0.3),
      kf(0.8, -1.0, 0.2, -0.1, -0.9, -0.32, -0.2, 2.25, 0, 0.5, 0, 0, 0.9, 0.3),
      kf(1.0, -0.9, 0.0, -0.5, -0.4, 0.1, -0.4, 0.6, 0, 0.1, 0, 0, 0.2, 0),
    ],
  },
};
export const CAST_DUR = { basic: CASTS.basic.dur, heavy: CASTS.heavy.dur, ultimate: CASTS.ultimate.dur };

function lerpInto(out, b, w) { if (w <= 0) return; for (let i = 0; i < F; i++) out[i] += (b[i] - out[i]) * w; }
function sampleCast(kind, t01, out) {
  const fr = CASTS[kind].frames;
  if (t01 <= fr[0].t) { out.set(fr[0].p); return; }
  for (let i = 1; i < fr.length; i++) {
    if (t01 <= fr[i].t) {
      const a = fr[i - 1], b = fr[i];
      const u = smoothstep(0, 1, (t01 - a.t) / (b.t - a.t));
      for (let k = 0; k < F; k++) out[k] = a.p[k] + (b.p[k] - a.p[k]) * u;
      return;
    }
  }
  out.set(fr[fr.length - 1].p);
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();

export class Animator {
  constructor(rig) {
    this.rig = rig;
    this.up = new Float32Array(F);
    this.act = new Float32Array(F);
    this.hatSway = 0; this.hatVel = 0; this.hatSide = 0; this.hatSideVel = 0;
  }
  /**
   * s: {t, dt, phase, amp, speedFrac, wSprint, wAir, wGlide, wAction, castKind, castT01, charging,
   *     chargeFrac, hurt, squash, dead, bank, vy, localVx, localVz, aimPitch, flare, flutter, accel}
   */
  update(s) {
    const r = this.rig, up = this.up;
    const ph = s.phase, amp = s.amp, sinp = Math.sin(ph);
    const ground = 1 - Math.max(s.wAir, s.wGlide);
    // ---------- upper body ----------
    up.set(IDLE);
    lerpInto(up, SPRINT, s.wSprint * ground);
    lerpInto(up, AIR, s.wAir);
    lerpInto(up, GLIDE, s.wGlide);
    // locomotion swing (additive)
    const sw = amp * ground;
    up[3] += sinp * sw * 0.75;
    up[0] += -sinp * sw * 0.25;
    up[8] += 0.07 * s.speedFrac * ground;
    const breath = Math.sin(s.t * 2.1);
    up[4] += breath * 0.02; up[1] -= breath * 0.015;
    if (s.wAction > 0.001) {
      if (s.castKind) sampleCast(s.castKind, s.castT01, this.act);
      else { this.act.set(CHARGE); this.act[6] += Math.sin(s.t * 18) * 0.02 * s.chargeFrac; this.act[11] += s.chargeFrac * 0.15; }
      lerpInto(up, this.act, s.wAction);
    }
    // hurt flinch
    if (s.hurt > 0) { up[8] -= 0.4 * s.hurt; up[12] -= 0.3 * s.hurt; up[3] += 0.5 * s.hurt; up[4] += 0.3 * s.hurt; up[1] -= 0.3 * s.hurt; }
    if (s.dead > 0) lerpInto(up, DEAD, s.dead);

    r.armR.rotation.set(up[0], 0, up[1]);
    r.elbowR.rotation.set(up[2], 0, 0);
    r.armL.rotation.set(up[3], 0, up[4]);
    r.elbowL.rotation.set(up[5], 0, 0);

    // ---------- lower body ----------
    const crouch = up[11] + s.squash * 0.7 + (s.swCr || 0);
    let lL = -sinp * amp * ground, lR = sinp * amp * ground;
    let kL = Math.max(0, Math.sin(ph + Math.PI * 0.5)) * amp * 1.25 * ground + 0.05;
    let kR = Math.max(0, Math.sin(ph - Math.PI * 0.5)) * amp * 1.25 * ground + 0.05;
    // airborne tuck
    const rising = clamp(s.vy / 8, -1, 1);
    lL = lerp(lL, -0.55 + rising * 0.15, s.wAir); kL = lerp(kL, 0.95, s.wAir);
    lR = lerp(lR, 0.18, s.wAir); kR = lerp(kR, 0.45 - rising * 0.15, s.wAir);
    lL = lerp(lL, 0.2, s.wGlide); kL = lerp(kL, 0.35, s.wGlide);
    lR = lerp(lR, 0.32, s.wGlide); kR = lerp(kR, 0.55, s.wGlide);
    // crouch (bend knees, push hips back)
    lL -= crouch * 0.55; lR -= crouch * 0.55; kL += crouch * 1.1; kR += crouch * 1.1;
    r.legL.rotation.set(lL, 0, 0.03 + s.wGlide * 0.05);
    r.legR.rotation.set(lR, 0, -0.03 - s.wGlide * 0.05);
    r.kneeL.rotation.set(kL, 0, 0);
    r.kneeR.rotation.set(kR, 0, 0);
    // keep feet roughly flat
    r.ankleL.rotation.x = -(lL + kL) * 0.6 * (1 - s.wAir * 0.5);
    r.ankleR.rotation.x = -(lR + kR) * 0.6 * (1 - s.wAir * 0.5);

    const bob = Math.cos(ph * 2) * 0.028 * amp * ground + Math.abs(breath) * 0.004;
    r.hips.position.y = 0.92 + bob + up[10] - crouch * 0.13 - s.squash * 0.05 + (s.swHy || 0);
    r.hips.rotation.y = sinp * 0.13 * amp * ground;
    r.torso.rotation.set(up[8] + (s.swTl || 0), -r.hips.rotation.y * 0.85 + up[9] + (s.swTw || 0), -s.bank * 0.3);
    r.torso.scale.set(1 + breath * 0.008, 1 + breath * 0.006, 1 + breath * 0.008);
    r.head.rotation.set(up[12] - up[8] * 0.6 + s.aimPitch * 0.35 * s.wAction + (s.swHd || 0) - (s.swTl || 0) * 0.5, -up[9] * 0.5 - (s.swTw || 0) * 0.45, 0);

    // whole-body lean / bank / squash / death fall
    r.body.rotation.set(s.dead * -1.42 + s.accel * 0.04, 0, s.bank + (s.swBk || 0));
    r.body.position.y = s.dead * 0.1;
    const sq = s.squash;
    r.body.scale.set(1 + sq * 0.07, 1 - sq * 0.12, 1 + sq * 0.07);

    // ---------- staff: orientation expressed in body space ----------
    _q.copy(r.hips.quaternion).multiply(r.torso.quaternion).multiply(r.armR.quaternion).multiply(r.elbowR.quaternion);
    _e.set(up[6], 0, up[7]);
    _q2.setFromEuler(_e);
    r.staff.quaternion.copy(_q.invert()).multiply(_q2);

    // ---------- hat spring ----------
    const kS = 60, dS = 9;
    const tgt = clamp(-s.vy * 0.03 + s.speedFrac * 0.25 + s.wGlide * 0.35 + s.accel * 0.02, -0.4, 0.6);
    this.hatVel += ((tgt - this.hatSway) * kS - this.hatVel * dS) * s.dt;
    this.hatSway += this.hatVel * s.dt;
    const tgtS = clamp(s.bank * 1.5 + s.localVx * -0.02, -0.4, 0.4);
    this.hatSideVel += ((tgtS - this.hatSide) * kS - this.hatSideVel * dS) * s.dt;
    this.hatSide += this.hatSideVel * s.dt;
    for (let i = 0; i < r.hatSegs.length; i++) {
      const w = i + 1;
      r.hatSegs[i].rotation.set(-(0.1 + i * 0.07) - this.hatSway * 0.13 * w + Math.sin(s.t * 2.4 + i) * 0.015, 0, this.hatSide * 0.08 * w);
    }

    // ---------- robe ----------
    r.skirt.deform(lL, lR, s.localVx, s.localVz, s.vy, s.flare, s.t, s.flutter);
  }
}
