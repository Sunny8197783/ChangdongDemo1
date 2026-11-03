// Sword poses for the hero rig. A pose is a Float32Array(PF) in TORSO space (+Z forward, -X = hero's right):
//  0-2 grip position (right hand), 3-5 blade yaw/pitch/roll ('YXZ': yaw around up, pitch tilts +Y blade toward +Z,
//  so pitch=PI/2 points the blade forward horizontally), 6 torso twist, 7 torso lean, 8 crouch, 9 hip lift,
//  10-12 left arm FK (x, z, elbow), 13 two-handed weight, 14 head pitch, 15 body roll.
// The right arm (and the left arm when two-handed) is solved with analytic 2-bone IK.
import * as THREE from 'three';
import { clamp } from '../core/utils.js';

export const PF = 16;
/** Build a pose from named parts. */
export function SP({ g = [-0.2, 0, 0.2], b = [0, 1.6, 0], tw = 0, tl = 0, cr = 0, hy = 0, l = [0.1, 0.25, -0.5], two = 0, hd = 0, bk = 0 } = {}) {
  return Float32Array.of(g[0], g[1], g[2], b[0], b[1], b[2], tw, tl, cr, hy, l[0], l[1], l[2], two, hd, bk);
}
export function lerpPose(out, a, b, w) { for (let i = 0; i < PF; i++) out[i] = a[i] + (b[i] - a[i]) * w; return out; }

// ---- stances (sword drawn) ----
export const STANCE = {
  idle: SP({ g: [-0.24, -0.02, 0.24], b: [0.35, 2.05, 0.2], tw: 0.12, cr: 0.08, l: [0.05, 0.35, -0.55] }),
  run: SP({ g: [-0.3, 0.02, -0.02], b: [-0.25, -2.25, 0], tw: -0.1, tl: 0.12, l: [0.4, 0.25, -0.9] }),
  air: SP({ g: [-0.32, 0.18, 0.12], b: [-0.4, 1.0, 0], tw: -0.1, l: [-0.6, 0.7, -0.6] }),
  glide: SP({ g: [-0.4, 0.3, -0.05], b: [-0.2, -2.6, 0], l: [-0.15, 1.3, -0.15] }),
  guard: SP({ g: [-0.14, 0.32, 0.3], b: [0.95, 0.6, 1.45], tw: 0.3, tl: 0.1, cr: 0.34, l: [-1.2, 0.2, -1.4], hd: 0.05 }),
  charge: SP({ g: [-0.36, 0.06, -0.18], b: [-2.35, 1.72, 0.2], tw: -0.62, tl: 0.15, cr: 0.42, l: [-1.25, -0.25, -0.15] }),
};

const SHOULDER_R = new THREE.Vector3(-0.235, 0.42, 0), SHOULDER_L = new THREE.Vector3(0.235, 0.42, 0);
const POLE_R = new THREE.Vector3(-0.7, -0.55, -0.45).normalize(), POLE_L = new THREE.Vector3(0.7, -0.55, -0.45).normalize();
const A = 0.27, B = 0.27;
const _t = new THREE.Vector3(), _u = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _n = new THREE.Vector3(), _mat = new THREE.Matrix4(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qs = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _bd = new THREE.Vector3(), _g = new THREE.Vector3(), _lt = new THREE.Vector3();
const _armQ = new THREE.Quaternion();

/** Solve shoulder quaternion + elbow bend so the hand reaches target (torso space). Returns elbow angle. */
function solveArm(shoulder, target, pole, outQ) {
  _t.subVectors(target, shoulder);
  let d = _t.length();
  d = clamp(d, 0.08, A + B - 0.002);
  _t.normalize();
  const cosA = clamp((A * A + d * d - B * B) / (2 * A * d), -1, 1);
  const alpha = Math.acos(cosA);
  const cosB = clamp((A * A + B * B - d * d) / (2 * A * B), -1, 1);
  const beta = Math.acos(cosB);
  // bend plane: perpendicular component of the pole
  _n.copy(pole).addScaledVector(_t, -pole.dot(_t));
  if (_n.lengthSq() < 1e-6) _n.set(0, -1, 0).addScaledVector(_t, _t.y);
  _n.normalize();
  // upper arm direction: rotate t toward pole by alpha
  _u.copy(_t).multiplyScalar(Math.cos(alpha)).addScaledVector(_n, Math.sin(alpha)).normalize();
  // arm local frame: -Y along upper arm, +Z toward the target side (forearm bends toward local +Z)
  _y.copy(_u).negate();
  _z.copy(_t).addScaledVector(_u, -_t.dot(_u));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _mat.makeBasis(_x, _y, _z);
  outQ.setFromRotationMatrix(_mat);
  return -(Math.PI - beta);
}

/**
 * Apply arms + blade orientation. pose in torso space. armW: 0..1 blend of IK over the existing FK arms
 * (the Animator already wrote FK). twoW: two-handed weight for the left arm.
 */
export function applySwordArms(rig, gear, pose, armW = 1) {
  if (armW <= 0.001) return;
  _g.set(pose[0], pose[1], pose[2]);
  _e.order = 'YXZ';
  // right arm
  const eR = solveArm(SHOULDER_R, _g, POLE_R, _armQ);
  rig.armR.quaternion.slerp(_armQ, armW);
  rig.elbowR.rotation.set(rig.elbowR.rotation.x + (eR - rig.elbowR.rotation.x) * armW, 0, 0);
  // blade orientation (torso space) → sword local
  _e.set(pose[4], pose[3], pose[5], 'YXZ');
  _qb.setFromEuler(_e);
  _bd.set(0, 1, 0).applyQuaternion(_qb);
  _qa.copy(rig.armR.quaternion).multiply(rig.elbowR.quaternion).multiply(rig.handR.quaternion);
  _qs.copy(_qa).invert().multiply(_qb);
  gear.sword.quaternion.copy(_qs);
  // left arm: FK fields blended with two-handed IK onto the pommel side of the grip
  const two = pose[13] * armW;
  _e.set(pose[10], 0, pose[11], 'XYZ');
  _armQ.setFromEuler(_e);
  rig.armL.quaternion.slerp(_armQ, armW);
  rig.elbowL.rotation.set(rig.elbowL.rotation.x + (pose[12] - rig.elbowL.rotation.x) * armW, 0, 0);
  if (two > 0.01) {
    _lt.copy(_g).addScaledVector(_bd, -0.13);
    _lt.x += 0.02;
    const eL = solveArm(SHOULDER_L, _lt, POLE_L, _armQ);
    rig.armL.quaternion.slerp(_armQ, two);
    rig.elbowL.rotation.x += (eL - rig.elbowL.rotation.x) * two;
  }
}
