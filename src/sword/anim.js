// Procedural sword animation templates: anticipation → fast strike → follow-through → recovery.
// Poses are torso-space SP() poses (see player/swordpose.js). Each frame's `e` is the easing INTO that frame:
// 'io' smooth, 'out' explosive start (strikes), 'in' slow start, 'lin' linear.
import { SP, PF, STANCE } from '../player/swordpose.js';
import { smoothstep } from '../core/utils.js';

const K = (t, p, e = 'io') => ({ t, p, e });
const IDLE = STANCE.idle;
const R_END = SP({ g: [-0.18, 0.0, 0.26], b: [0.7, 2.0, 0.1], tw: 0.25, cr: 0.12 });
const L_END = SP({ g: [-0.3, 0.2, 0.2], b: [-0.6, 1.6, 0.3], tw: -0.3, cr: 0.12 });
const OVER_UP = SP({ g: [-0.1, 0.66, -0.02], b: [0.0, -0.55, 1.57], tl: -0.22, cr: 0.05, two: 1, hd: -0.15, hy: 0.03 });
const OVER_DN = SP({ g: [-0.06, 0.08, 0.44], b: [0.05, 2.05, 1.57], tl: 0.38, cr: 0.5, two: 1, hd: 0.1 });
const OVER_FT = SP({ g: [-0.06, -0.02, 0.4], b: [0.05, 2.4, 1.57], tl: 0.44, cr: 0.55, two: 1 });
const R_WIND = SP({ g: [-0.42, 0.34, -0.04], b: [-2.0, 1.4, 0.2], tw: -0.62, tl: -0.04, cr: 0.12, l: [-0.55, 0.55, -0.9], hd: 0.05 });
const R_STRIKE = SP({ g: [0.1, 0.24, 0.4], b: [1.35, 1.62, 0], tw: 0.5, tl: 0.16, cr: 0.3, l: [0.35, 0.7, -0.4], bk: -0.04 });
const R_FOLLOW = SP({ g: [0.16, 0.12, 0.3], b: [2.05, 1.9, 0], tw: 0.68, tl: 0.18, cr: 0.28, l: [0.4, 0.6, -0.5] });
const L_WIND = SP({ g: [0.16, 0.02, 0.3], b: [2.2, 2.2, 3.14], tw: 0.62, tl: 0.08, cr: 0.32, l: [0.3, 0.9, -0.4] });
const L_STRIKE = SP({ g: [-0.4, 0.42, 0.28], b: [-1.4, 1.25, 3.14], tw: -0.55, tl: -0.05, cr: 0.18, l: [-0.2, 0.4, -0.7], bk: 0.05 });
const L_FOLLOW = SP({ g: [-0.44, 0.48, 0.08], b: [-2.1, 1.05, 3.14], tw: -0.7, cr: 0.15 });
const SPIN_EXT = SP({ g: [-0.46, 0.24, 0.12], b: [-1.57, 1.6, 3.14], tw: -0.3, cr: 0.28, l: [0.1, 1.2, -0.2] });
const RAISE = SP({ g: [-0.12, 0.72, 0.08], b: [0.1, -0.12, 1.57], two: 1, hd: -0.35, tl: -0.25, hy: 0.05 });
const PLUNGE = SP({ g: [-0.06, 0.12, 0.28], b: [0.0, 3.0, 1.57], two: 1, tl: 0.35, cr: 0.45 });
const THRUST_W = SP({ g: [-0.36, 0.26, -0.22], b: [-0.05, 1.5, 1.57], tw: -0.5, tl: -0.05, cr: 0.35, l: [-0.9, -0.1, -0.4] });
const THRUST_S = SP({ g: [-0.14, 0.24, 0.5], b: [0.0, 1.55, 1.57], tw: 0.25, tl: 0.3, cr: 0.45, l: [0.5, 0.5, -0.3] });

export const TPL = {
  slashR: { frames: [K(0, L_END), K(0.3, R_WIND), K(0.5, R_STRIKE, 'out'), K(0.68, R_FOLLOW, 'out'), K(1, R_END)] },
  slashL: { frames: [K(0, R_END), K(0.3, L_WIND), K(0.5, L_STRIKE, 'out'), K(0.68, L_FOLLOW, 'out'), K(1, L_END)] },
  overhead: { frames: [K(0, L_END), K(0.34, OVER_UP), K(0.52, OVER_DN, 'out'), K(0.7, OVER_FT, 'out'), K(1, IDLE)] },
  spin: { frames: [K(0, L_END), K(0.25, SP({ g: [0.15, 0.3, 0.25], b: [1.6, 1.5, 0], tw: 0.7, cr: 0.35, l: [0.2, 1.0, -0.3] })), K(0.38, SPIN_EXT, 'out'), K(0.82, SPIN_EXT, 'lin'), K(1, IDLE)] },
  spinLoop: { frames: [K(0, SPIN_EXT), K(1, SPIN_EXT, 'lin')] },
  thrust: { frames: [K(0, L_END), K(0.35, THRUST_W), K(0.5, THRUST_S, 'out'), K(0.74, THRUST_S, 'lin'), K(1, IDLE)] },
  upper: {
    frames: [K(0, L_END), K(0.32, SP({ g: [-0.22, -0.18, 0.32], b: [0.15, 2.7, 1.57], tw: 0.1, tl: 0.3, cr: 0.6, two: 1 })),
      K(0.5, SP({ g: [-0.14, 0.72, 0.12], b: [0.05, -0.35, 1.57], tl: -0.28, cr: -0.05, hy: 0.08, two: 1, hd: -0.25 }), 'out'),
      K(0.75, SP({ g: [-0.14, 0.76, 0.02], b: [0.05, -0.6, 1.57], tl: -0.3, hy: 0.06, two: 1, hd: -0.3 }), 'out'), K(1, IDLE)],
  },
  leapSlam: { frames: [K(0, L_END), K(0.22, OVER_UP), K(0.56, SP({ g: [-0.1, 0.7, -0.08], b: [0.0, -0.8, 1.57], tl: -0.3, two: 1, hd: -0.2 }), 'in'), K(0.66, OVER_DN, 'out'), K(0.84, OVER_FT, 'lin'), K(1, IDLE)] },
  iaido: { frames: [K(0, STANCE.charge), K(0.18, R_STRIKE, 'out'), K(0.55, R_FOLLOW, 'out'), K(1, R_END)] },
  chargeThrust: { frames: [K(0, STANCE.charge), K(0.12, THRUST_W), K(0.3, THRUST_S, 'out'), K(0.7, THRUST_S, 'lin'), K(1, IDLE)] },
  chargeOver: { frames: [K(0, STANCE.charge), K(0.25, OVER_UP), K(0.42, OVER_DN, 'out'), K(0.75, OVER_FT, 'lin'), K(1, IDLE)] },
  chargeSlash: { frames: [K(0, STANCE.charge), K(0.15, R_WIND), K(0.32, R_STRIKE, 'out'), K(0.6, R_FOLLOW, 'out'), K(1, R_END)] },
  raise: { frames: [K(0, L_END), K(0.3, RAISE), K(1, RAISE, 'lin')] },
  raiseSlam: { frames: [K(0, RAISE), K(0.25, OVER_UP), K(0.45, OVER_DN, 'out'), K(0.8, OVER_FT, 'lin'), K(1, IDLE)] },
  plunge: { frames: [K(0, RAISE), K(0.3, PLUNGE, 'out'), K(1, PLUNGE, 'lin')] },
  plungeLand: { frames: [K(0, PLUNGE), K(0.2, OVER_FT, 'out'), K(1, IDLE)] },
  hold: { frames: [K(0, IDLE), K(1, IDLE)] },
};

const EASE = {
  io: (u) => smoothstep(0, 1, u),
  out: (u) => 1 - Math.pow(1 - u, 3.2),
  in: (u) => u * u,
  lin: (u) => u,
};

/** Sample template tpl at normalized time t01 into out (Float32Array(PF)). */
export function sampleTpl(tpl, t01, out) {
  const fr = tpl.frames;
  if (t01 <= fr[0].t) { out.set(fr[0].p); return out; }
  for (let i = 1; i < fr.length; i++) {
    const b = fr[i];
    if (t01 <= b.t) {
      const a = fr[i - 1];
      const u = (EASE[b.e] || EASE.io)((t01 - a.t) / Math.max(1e-5, b.t - a.t));
      for (let k = 0; k < PF; k++) out[k] = a.p[k] + (b.p[k] - a.p[k]) * u;
      return out;
    }
  }
  out.set(fr[fr.length - 1].p);
  return out;
}
