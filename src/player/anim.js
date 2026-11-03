// Procedural animation for the hero rig: locomotion blend + upper-body action poses (13-float layer).
// v3 additions (DESIGN §9 A6–A9): per-stance idle/sprint sets (ranger bow low, spirit floaty), the new cast kinds from
// poses.js (throw, slam, channel, summon, buff, beam, bowDraw, bowRelease, totemRaise; unknown → basic), dodge poses
// (backflip / shadow roll / dash lean / shield brace), directional hurt, hard-landing recovery, idle fidgets, breathing,
// head look-at and turn lean. All scratch is pre-allocated.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/utils.js';
import { CAST_KINDS, CASTER_STANCES, FIDGETS, addFidget } from './poses.js';

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
const LAND = P(-0.55, -0.6, -0.9, -0.55, 0.6, -0.9, 0.6, 0, 0.42, 0, 0, 0.55, 0.25);   // hard-landing crouch
const FOCUS_AIR = P(-1.25, 0.25, -1.9, -1.5, -0.05, -0.08, 0, 0, 0.02, 0.45, 0, 0.06, 0);

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
for (const k of Object.keys(CAST_KINDS)) CASTS[k] = CAST_KINDS[k];
/** Duration per cast kind (existing + v3 kinds). */
export const CAST_DUR = {};
for (const k of Object.keys(CASTS)) CAST_DUR[k] = CASTS[k].dur;

function lerpInto(out, b, w) { if (w <= 0) return; for (let i = 0; i < F; i++) out[i] += (b[i] - out[i]) * w; }
function sampleCast(kind, t01, out) {
  const fr = (CASTS[kind] || CASTS.basic).frames;
  if (t01 <= fr[0].t) { out.set(fr[0].p); return; }
  for (let i = 1; i < fr.length; i++) {
    if (t01 <= fr[i].t) {
      const a = fr[i - 1], b = fr[i];
      const u = smoothstep(0, 1, (t01 - a.t) / Math.max(1e-6, b.t - a.t));
      for (let k = 0; k < F; k++) out[k] = a.p[k] + (b.p[k] - a.p[k]) * u;
      return;
    }
  }
  out.set(fr[fr.length - 1].p);
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _eb = new THREE.Euler(0, 0, 0, 'YXZ');
const HIP_PIVOT = 0.9;

export class Animator {
  constructor(rig) {
    this.rig = rig;
    this.up = new Float32Array(F);
    this.act = new Float32Array(F);
    this.hatSway = 0; this.hatVel = 0; this.hatSide = 0; this.hatSideVel = 0;
    // directional hurt springs (torso pitch / roll), look-at
    this.hx = 0; this.hxv = 0; this.hz = 0; this.hzv = 0;
    this.lookY = 0; this.lookP = 0;
    this.legL = 0; this.legR = 0;   // last leg angles (springs / tabard push)
  }
  /** Kick the directional hurt spring. lx/lz: direction the hit travels, in model space (x left, z forward). */
  hurtKick(lx, lz, strength = 1) {
    this.hxv += lz * 9 * strength;    // pushed from the front (travelling −z) → lean back (negative pitch)
    this.hzv += -lx * 7 * strength;
  }
  /**
   * s: {t, dt, phase, amp, speedFrac, wSprint, wAir, wGlide, wAction, castKind, castT01, chargeFrac, hurt, squash, dead, bank,
   *     vy, localVx, localVz, aimPitch, flare, flutter, accel, stance, dodgePose, dodgeT01, landW, fidget, fidgetT01,
   *     lookYaw, lookPitch, lookW, bowAim, focusW}
   */
  update(s) {
    const r = this.rig, up = this.up;
    const ph = s.phase, amp = s.amp, sinp = Math.sin(ph);
    const ground = 1 - Math.max(s.wAir, s.wGlide);
    const CS = CASTER_STANCES[s.stance] || null;
    const dt = Math.min(s.dt, 1 / 30);
    // ---------- upper body ----------
    up.set(CS?.idle || IDLE);
    lerpInto(up, CS?.sprint || SPRINT, s.wSprint * ground);
    lerpInto(up, AIR, s.wAir);
    lerpInto(up, GLIDE, s.wGlide);
    if (CS?.aim && s.bowAim > 0.001) lerpInto(up, CS.aim, s.bowAim * (1 - s.wGlide * 0.3));
    if (s.focusW > 0.001) lerpInto(up, FOCUS_AIR, s.focusW);
    // locomotion swing (additive)
    const sw = amp * ground * (1 - (s.bowAim || 0) * 0.7);
    up[3] += sinp * sw * 0.75;
    up[0] += -sinp * sw * 0.25;
    up[8] += 0.07 * s.speedFrac * ground;
    // breathing (DESIGN A6: chest 1 + 0.015·sin(1.6t)), faster after sprinting
    const breath = Math.sin(s.t * (1.6 + s.wSprint * 1.4));
    up[4] += breath * 0.02; up[1] -= breath * 0.015;
    if (s.fidget && s.fidgetT01 > 0 && s.fidgetT01 < 1) { const f = FIDGETS[s.fidget]; if (f) addFidget(up, f, s.fidgetT01, ground * (1 - s.wAction)); }
    if (s.wAction > 0.001) {
      if (s.castKind) sampleCast(s.castKind, s.castT01, this.act);
      else if (CS?.charge) { this.act.set(CS.charge); this.act[0] += Math.sin(s.t * 23) * 0.012 * s.chargeFrac; }
      else { this.act.set(CHARGE); this.act[6] += Math.sin(s.t * 18) * 0.02 * s.chargeFrac; this.act[11] += s.chargeFrac * 0.15; }
      lerpInto(up, this.act, s.wAction);
    }
    // hurt flinch (additive) + directional spring (ω ≈ 13, ζ ≈ 0.7)
    if (s.hurt > 0) { up[8] -= 0.25 * s.hurt; up[12] -= 0.2 * s.hurt; up[3] += 0.4 * s.hurt; up[4] += 0.25 * s.hurt; up[1] -= 0.25 * s.hurt; }
    this.hxv += (-this.hx * 180 - this.hxv * 18.5) * dt; this.hx = clamp(this.hx + this.hxv * dt, -0.6, 0.6);
    this.hzv += (-this.hz * 180 - this.hzv * 18.5) * dt; this.hz = clamp(this.hz + this.hzv * dt, -0.5, 0.5);
    up[8] += this.hx; up[12] += this.hx * 0.5;
    if (s.landW > 0.001) lerpInto(up, LAND, s.landW);
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
    // ---------- dodge poses ----------
    let bodyPitch = 0;
    const dp = s.dodgePose, du = s.dodgeT01 || 0;
    if (dp && dp !== 'none' && du > 0 && du < 1) {
      const env = Math.sin(Math.PI * du);
      if (dp === 'flip') {          // backflip: full backward rotation around the hips with a tuck
        bodyPitch = -smoothstep(0.05, 0.92, du) * Math.PI * 2;
        lL = lerp(lL, -1.5, env); lR = lerp(lR, -1.35, env); kL = lerp(kL, 2.0, env); kR = lerp(kR, 1.9, env);
        up[3] = lerp(up[3], -2.4, env); r.armL.rotation.x = up[3];
      } else if (dp === 'roll') {   // shadow roll: forward roll, low tuck
        bodyPitch = smoothstep(0.08, 0.88, du) * Math.PI * 2;
        lL = lerp(lL, -1.7, env); lR = lerp(lR, -1.6, env); kL = lerp(kL, 2.2, env); kR = lerp(kR, 2.2, env);
      } else if (dp === 'lean') {   // dash step: low forward lean
        bodyPitch = env * 0.35; lL = lerp(lL, -0.6, env); kR = lerp(kR, 0.9, env);
      } else if (dp === 'brace') {  // shield step: shoulder charge, braced
        bodyPitch = env * 0.22; lL = lerp(lL, -0.7, env); kL = lerp(kL, 0.6, env); kR = lerp(kR, 0.5, env); lR = lerp(lR, 0.3, env);
      }
    }
    r.legL.rotation.set(lL, 0, 0.03 + s.wGlide * 0.05);
    r.legR.rotation.set(lR, 0, -0.03 - s.wGlide * 0.05);
    r.kneeL.rotation.set(kL, 0, 0);
    r.kneeR.rotation.set(kR, 0, 0);
    this.legL = lL; this.legR = lR;
    // keep feet roughly flat
    r.ankleL.rotation.x = -(lL + kL) * 0.6 * (1 - s.wAir * 0.5);
    r.ankleR.rotation.x = -(lR + kR) * 0.6 * (1 - s.wAir * 0.5);

    const hover = (CS?.hover || 0) * (0.6 + 0.4 * Math.sin(s.t * 1.7)) * ground * (1 - Math.min(1, s.speedFrac) * 0.5);
    const bounce = (CS?.bounce || 0) * Math.abs(Math.sin(s.t * 3.1)) * ground * Math.max(0, 1 - s.speedFrac);
    const bob = Math.cos(ph * 2) * 0.028 * amp * ground + Math.abs(breath) * 0.004;
    r.hips.position.y = 0.92 + bob + up[10] - crouch * 0.13 - s.squash * 0.05 + (s.swHy || 0) + hover + bounce;
    r.hips.rotation.y = sinp * 0.13 * amp * ground;
    // head look-at toward the aim (60 %, clamped), smoothed
    const lk = 1 - Math.exp(-10 * dt), lw = s.lookW ?? 1;
    this.lookY += (clamp((s.lookYaw || 0) * 0.6, -0.85, 0.85) * lw - this.lookY) * lk;
    this.lookP += (clamp((s.lookPitch || 0) * 0.6, -0.5, 0.45) * lw - this.lookP) * lk;
    r.torso.rotation.set(up[8] + (s.swTl || 0), -r.hips.rotation.y * 0.85 + up[9] + (s.swTw || 0) + this.lookY * 0.25, -s.bank * 0.3 + this.hz);
    r.torso.scale.set(1 + breath * 0.012, 1 + breath * 0.008, 1 + breath * 0.015);
    r.head.rotation.set(up[12] - up[8] * 0.6 + s.aimPitch * 0.35 * s.wAction + (s.swHd || 0) - (s.swTl || 0) * 0.5 + this.lookP * (1 - s.wAction),
      -up[9] * 0.5 - (s.swTw || 0) * 0.45 + this.lookY * 0.75, 0);

    // whole-body lean / bank / squash / death fall / dodge rotation (flips pivot around the hips, not the feet)
    const pitch = s.dead * -1.42 + s.accel * 0.04 + bodyPitch;
    r.body.rotation.set(pitch, 0, s.bank + (s.swBk || 0));
    r.body.position.set(0, s.dead * 0.1, 0);
    if (bodyPitch !== 0 && (dp === 'flip' || dp === 'roll')) {
      const piv = dp === 'roll' ? 0.5 : HIP_PIVOT;
      r.body.position.y += piv * (1 - Math.cos(bodyPitch));
      r.body.position.z += -piv * Math.sin(bodyPitch);
    }
    const sq = s.squash;
    const tuck = dp === 'roll' && du > 0 && du < 1 ? Math.sin(Math.PI * du) : 0;   // compact ball during the roll
    r.body.scale.set(1 + sq * 0.07 + tuck * 0.06, 1 - sq * 0.12 - tuck * 0.22, 1 + sq * 0.07 + tuck * 0.06);

    // ---------- staff / totem: orientation expressed in body space ----------
    if (r.staff && r.staff.visible) {
      _q.copy(r.hips.quaternion).multiply(r.torso.quaternion).multiply(r.armR.quaternion).multiply(r.elbowR.quaternion);
      _e.set(up[6], 0, up[7]);
      _q2.setFromEuler(_e);
      r.staff.quaternion.copy(_q.invert()).multiply(_q2);
    }
    // ---------- bow (left hand): low along the leg at rest, vertical (slight cant) when aiming / drawing ----------
    if (r.bow && r.bow.visible) {
      _q.copy(r.hips.quaternion).multiply(r.torso.quaternion).multiply(r.armL.quaternion).multiply(r.elbowL.quaternion);
      const aim = clamp(Math.max(s.bowAim || 0, s.wAction, s.focusW || 0), 0, 1);
      _eb.set(lerp(0.55, -0.06, aim), lerp(0.3, -0.12, aim), lerp(0.3, 0.16, aim));
      _q2.setFromEuler(_eb);
      r.bow.quaternion.copy(_q.invert()).multiply(_q2);
    }

    // ---------- hat spring ----------
    if (r.hat && r.hat.visible) {
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
    }

    // ---------- robe ----------
    r.skirt.deform(lL, lR, s.localVx, s.localVz, s.vy, s.flare, s.t, s.flutter);
  }
}
