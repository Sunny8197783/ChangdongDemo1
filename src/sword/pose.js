// Melee pose format (melee-owned copy of the 16-float torso-space layout the player rig consumes; CONTRACT rule 7:
// sword files never statically import player files). Layout (see player/swordpose.js, which applies it):
//  0-2 grip position (right hand), 3-5 blade yaw/pitch/roll ('YXZ'), 6 torso twist, 7 torso lean, 8 crouch, 9 hip lift,
//  10-12 left arm FK (x, z, elbow), 13 two-handed weight, 14 head pitch, 15 body roll.
export const PF = 16;
/** Build a pose from named parts. */
export function SP({ g = [-0.2, 0, 0.2], b = [0, 1.6, 0], tw = 0, tl = 0, cr = 0, hy = 0, l = [0.1, 0.25, -0.5], two = 0, hd = 0, bk = 0 } = {}) {
  return Float32Array.of(g[0], g[1], g[2], b[0], b[1], b[2], tw, tl, cr, hy, l[0], l[1], l[2], two, hd, bk);
}

/** Drawn-weapon stances used by the melee engine (idle / charge per weapon style). */
export const STANCE = {
  idle: SP({ g: [-0.24, -0.02, 0.24], b: [0.35, 2.05, 0.2], tw: 0.12, cr: 0.08, l: [0.05, 0.35, -0.55] }),
  charge: SP({ g: [-0.36, 0.06, -0.18], b: [-2.35, 1.72, 0.2], tw: -0.62, tl: 0.15, cr: 0.42, l: [-1.25, -0.25, -0.15] }),
  // paladin: hammer low behind, shield forward
  hammerIdle: SP({ g: [-0.27, -0.1, 0.16], b: [0.15, 0.55, 0.12], tw: 0.18, cr: 0.14, l: [-1.05, 0.35, -1.35], hd: 0.04 }),
  hammerCharge: SP({ g: [-0.32, 0.22, -0.2], b: [-0.3, -0.9, 0.2], tw: -0.5, tl: 0.1, cr: 0.4, l: [-1.35, 0.1, -1.2] }),
  // shadowblade: crouched, reverse grip
  daggerIdle: SP({ g: [-0.25, -0.06, 0.24], b: [0.25, 1.95, 0.4], tw: 0.22, tl: 0.16, cr: 0.3, l: [-0.85, 0.5, -1.7], hd: -0.04 }),
  daggerCharge: SP({ g: [-0.3, -0.02, -0.12], b: [-0.6, 2.4, 0.4], tw: -0.55, tl: 0.38, cr: 0.55, l: [-0.3, 0.9, -1.6], hd: 0.05 }),
};
