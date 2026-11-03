// Pose data for the hero (CONTRACT §10.4, DESIGN §9 A7/A9). Pure data + tiny samplers; no allocation per frame.
//
// 1) Cast kinds in the 13-float upper-body layer (anim.js):
//    0 aRx, 1 aRz, 2 eR, 3 aLx, 4 aLz, 5 eL, 6 sPitch, 7 sRoll, 8 tRx, 9 tRy, 10 hipY, 11 crouch, 12 headRx
//    Each kind = {antic, strike, hold, recover} seconds + an antic pose A, a strike pose S (and optional hold pose H).
//    Existing kinds basic / heavy / ultimate keep their hand-made frames in anim.js; new kinds are built here.
//    Unknown kinds fall back to 'basic' (castKindOf).
// 2) Caster stance overrides of the idle/sprint upper body (ranger bow low, spirit floaty).
// 3) Melee stances in the 16-float sword-pose layer (swordpose.js SP): sword (existing STANCE), paladin (hammer + shield), shadow (daggers).
// 4) Idle fidgets per stance (additive curves, 1.6–2.2 s), hurt directions, dodge pose ids.
import { SP, STANCE } from './swordpose.js';

export const UF = 13;
const P = (...a) => Float32Array.from(a);
const kf = (t, p) => ({ t, p });

// rest pose the casts recover into (≈ the mage IDLE, slightly forward)
const REST = P(-0.35, -0.1, -0.8, 0.05, 0.13, -0.35, 0.3, 0, 0.04, 0, 0, 0.02, 0);

/** Build {dur, frames, phases} from phase timings and poses. */
function cast({ antic, strike, hold, recover, A, S, H = null, start = null }) {
  const dur = antic + strike + hold + recover;
  const a = antic / dur, s = (antic + strike) / dur, h = (antic + strike + hold) / dur;
  return {
    dur, phases: { antic, strike, hold, recover }, strikeAt: s,
    frames: [kf(0, start || A), kf(a, A), kf(s, S), kf(h, H || S), kf(1, REST)],
  };
}

export const CAST_KINDS = {
  throw: cast({ antic: 0.16, strike: 0.07, hold: 0.08, recover: 0.26,
    A: P(-2.5, -0.15, -1.7, -0.9, 0.35, -0.4, -0.6, 0.2, -0.12, 0.38, 0, 0.12, -0.12),
    S: P(-1.15, 0.12, -0.08, -0.35, 0.2, -0.3, 1.5, 0, 0.3, -0.42, 0, 0.22, 0.05) }),
  slam: cast({ antic: 0.24, strike: 0.07, hold: 0.12, recover: 0.36,
    A: P(-2.95, -0.1, -0.35, -2.8, 0.12, -0.35, -0.2, 0, -0.22, 0, 0.04, 0, -0.35),
    S: P(-0.75, 0.1, -0.2, -0.7, -0.12, -0.25, 2.3, 0, 0.62, 0, 0, 0.42, 0.3),
    H: P(-0.8, 0.1, -0.2, -0.72, -0.12, -0.25, 2.25, 0, 0.58, 0, 0, 0.4, 0.28) }),
  channel: cast({ antic: 0.14, strike: 0.06, hold: 0.7, recover: 0.3,
    A: P(-1.2, 0.1, -0.5, -1.0, -0.2, -0.5, 1.0, 0, 0.05, 0.1, 0, 0.1, 0),
    S: P(-1.48, 0.16, -0.12, -1.38, -0.28, -0.2, 1.42, 0, 0.12, -0.05, 0, 0.18, 0.02),
    H: P(-1.5, 0.18, -0.1, -1.4, -0.3, -0.18, 1.45, 0, 0.14, -0.05, 0, 0.2, 0.02) }),
  summon: cast({ antic: 0.22, strike: 0.08, hold: 0.25, recover: 0.4,
    A: P(-0.35, 0.25, -1.1, -0.35, -0.25, -1.1, 0.6, 0, 0.25, 0, 0, 0.34, 0.2),
    S: P(-2.65, -0.55, -0.15, -2.45, 0.6, -0.15, 0.0, 0, -0.22, 0, 0.05, 0, -0.42),
    H: P(-2.6, -0.5, -0.15, -2.4, 0.58, -0.15, 0.05, 0, -0.2, 0, 0.05, 0, -0.4) }),
  buff: cast({ antic: 0.18, strike: 0.08, hold: 0.2, recover: 0.34,
    A: P(-0.95, 0.65, -1.85, -0.95, -0.65, -1.85, 0.4, 0, 0.18, 0, 0, 0.25, 0.18),
    S: P(-0.45, -1.15, -0.2, -0.45, 1.15, -0.2, 0.2, -0.3, -0.18, 0, 0.03, 0, -0.28) }),
  beam: cast({ antic: 0.16, strike: 0.06, hold: 0.8, recover: 0.32,
    A: P(-1.0, -0.2, -0.9, -0.9, -0.5, -0.8, 0.6, 0, -0.05, 0.25, 0, 0.12, 0),
    S: P(-1.56, 0.05, -0.05, -1.42, -0.48, -0.42, 1.52, 0, 0.14, -0.08, 0, 0.24, 0.03),
    H: P(-1.58, 0.06, -0.04, -1.44, -0.5, -0.4, 1.55, 0, 0.16, -0.08, 0, 0.26, 0.03) }),
  // bow (ranger): the left arm holds the bow out, the right hand draws to the cheek
  bowDraw: cast({ antic: 0.12, strike: 0.2, hold: 0.5, recover: 0.2,
    A: P(-1.2, 0.2, -1.6, -1.45, -0.05, -0.1, 0, 0, 0.02, 0.4, 0, 0.06, 0),
    S: P(-1.52, 0.42, -2.35, -1.56, -0.02, -0.04, 0, 0, 0.04, 0.55, 0, 0.1, 0.02) }),
  bowRelease: cast({ antic: 0.1, strike: 0.04, hold: 0.1, recover: 0.2,
    A: P(-1.52, 0.42, -2.35, -1.56, -0.02, -0.04, 0, 0, 0.04, 0.55, 0, 0.1, 0.02),
    S: P(-1.25, 0.85, -1.05, -1.6, -0.02, -0.02, 0, 0, -0.02, 0.5, 0, 0.08, -0.04),
    start: P(-1.3, 0.25, -1.9, -1.5, -0.05, -0.08, 0, 0, 0.02, 0.45, 0, 0.06, 0) }),
  // totem (spiritcaller): raise the totem high, then plant it
  totemRaise: cast({ antic: 0.2, strike: 0.07, hold: 0.18, recover: 0.36,
    A: P(-2.75, 0.05, -0.25, -0.5, 0.35, -0.6, -0.15, 0, -0.18, 0.1, 0.04, 0, -0.35),
    S: P(-1.1, 0.15, -0.3, -0.9, 0.35, -0.6, 0.15, 0, 0.32, -0.05, 0, 0.36, 0.2) }),
};
export const CAST_KIND_IDS = ['basic', 'heavy', 'ultimate', ...Object.keys(CAST_KINDS)];

/** Style-specific presentation remaps (data): a bow fires everything as arrows, a totem raises for summons. */
export const STYLE_CAST_MAP = {
  bow: { basic: 'bowRelease', heavy: 'bowRelease', throw: 'bowRelease', beam: 'bowDraw', channel: 'bowDraw', bowDraw: 'bowDraw' },
  totem: { heavy: 'totemRaise', summon: 'totemRaise', slam: 'totemRaise' },
};
/** Resolve the kind actually played (unknown → 'basic'). */
export function castKindOf(kind, style, known) {
  const m = STYLE_CAST_MAP[style];
  let k = (m && m[kind]) || kind;
  if (!known(k)) k = (m && m.basic && known(m.basic)) ? m.basic : 'basic';
  return k;
}

// ------------------------------------------------------------------ caster stance overrides (13-float)
export const CASTER_STANCES = {
  mage: null,   // anim.js IDLE / SPRINT
  ranger: {
    idle: P(0.02, -0.12, -0.3, 0.1, 0.12, -0.35, 0, 0, 0.05, 0.05, 0, 0.04, 0),
    sprint: P(0.5, -0.2, -0.4, 0.35, 0.1, -0.55, 0, 0, 0.32, 0, 0, 0.06, 0),
    charge: P(-1.52, 0.42, -2.35, -1.56, -0.02, -0.04, 0, 0, 0.04, 0.55, 0, 0.1, 0.02),
    aim: P(-1.2, 0.25, -1.9, -1.5, -0.05, -0.08, 0, 0, 0.02, 0.45, 0, 0.06, 0),
    bounce: 0.012,
  },
  spirit: {
    idle: P(-0.3, -0.16, -0.95, -0.12, 0.3, -0.7, 0.04, 0.05, 0.0, 0, 0.015, 0, -0.04),
    sprint: P(0.45, -0.22, -0.35, 0.25, 0.16, -0.55, -0.95, 0, 0.3, 0, 0, 0.05, 0),
    hover: 0.022,
  },
};

// ------------------------------------------------------------------ melee stances (16-float sword-pose layer)
export const MELEE_STANCES = {
  sword: STANCE,
  paladin: {
    idle: SP({ g: [-0.27, -0.1, 0.16], b: [0.15, 0.55, 0.12], tw: 0.18, cr: 0.14, l: [-1.05, 0.35, -1.35], hd: 0.04 }),
    run: SP({ g: [-0.3, 0.02, -0.06], b: [-0.2, -0.55, 0.1], tw: -0.05, tl: 0.14, l: [-0.75, 0.3, -1.25] }),
    air: SP({ g: [-0.34, 0.16, 0.08], b: [-0.3, 0.6, 0], tw: -0.1, l: [-0.8, 0.6, -1.2] }),
    glide: SP({ g: [-0.4, 0.28, -0.05], b: [-0.2, -2.4, 0], l: [-0.3, 1.2, -0.4] }),
    guard: SP({ g: [-0.22, 0.06, 0.06], b: [0.1, 0.25, 0.2], tw: -0.25, tl: 0.12, cr: 0.36, l: [-1.48, 0.05, -1.05], hd: 0.1 }),
    charge: SP({ g: [-0.32, 0.22, -0.2], b: [-0.3, -0.9, 0.2], tw: -0.5, tl: 0.1, cr: 0.4, l: [-1.25, 0.1, -1.2] }),
  },
  shadow: {
    idle: SP({ g: [-0.25, -0.06, 0.24], b: [0.25, 1.95, 0.4], tw: 0.22, tl: 0.16, cr: 0.3, l: [-0.85, 0.5, -1.7], hd: -0.04 }),
    run: SP({ g: [-0.3, -0.06, -0.16], b: [-0.2, -2.3, 0], tw: -0.12, tl: 0.32, cr: 0.1, l: [0.55, 0.35, -0.8] }),
    air: SP({ g: [-0.32, 0.12, 0.1], b: [-0.4, 1.2, 0], tw: -0.1, l: [-0.7, 0.8, -0.9] }),
    glide: SP({ g: [-0.4, 0.3, -0.05], b: [-0.2, -2.6, 0], l: [-0.15, 1.3, -0.15] }),
    guard: SP({ g: [-0.18, 0.16, 0.26], b: [0.6, 1.2, 1.3], tw: 0.3, tl: 0.2, cr: 0.42, l: [-1.25, -0.25, -1.7], hd: 0.05 }),
    charge: SP({ g: [-0.34, 0.0, -0.22], b: [-2.2, 1.6, 0.3], tw: -0.6, tl: 0.3, cr: 0.5, l: [0.4, 0.4, -1.0] }),
  },
};
export function meleeStance(stance) { return MELEE_STANCES[stance] || STANCE; }

// ------------------------------------------------------------------ idle fidgets (additive on the 13-float layer)
// Each: dur + a list of {t, d:[i, v, …]} deltas, sampled with smoothstep and added on top of the idle pose.
const FD = (t, ...pairs) => ({ t, d: pairs });
export const FIDGETS = {
  staffTwirl: { dur: 1.9, keys: [FD(0), FD(0.25, 0, -0.5, 2, -1.2, 6, 0.8), FD(0.5, 0, -0.55, 2, -1.25, 6, 1.7, 7, 0.5, 12, -0.15), FD(0.75, 0, -0.5, 2, -1.2, 6, 0.8), FD(1)] },
  bladeCheck: { dur: 2.0, keys: [FD(0), FD(0.3, 8, 0.1, 12, 0.35, 9, 0.2), FD(0.7, 8, 0.12, 12, 0.32, 9, -0.2), FD(1)] },
  stringCheck: { dur: 1.8, keys: [FD(0), FD(0.3, 3, -0.9, 5, -0.6, 0, -0.9, 2, -1.4, 12, 0.3), FD(0.65, 3, -0.95, 5, -0.6, 0, -1.0, 2, -1.5, 1, 0.2, 12, 0.32), FD(1)] },
  hammerRest: { dur: 2.2, keys: [FD(0), FD(0.35, 8, -0.06, 11, -0.08, 12, -0.2), FD(0.75, 8, -0.05, 11, -0.06, 12, -0.15), FD(1)] },
  charmSpin: { dur: 2.0, keys: [FD(0), FD(0.3, 3, -0.8, 4, -0.3, 5, -1.3, 12, 0.25, 9, 0.25), FD(0.7, 3, -0.85, 4, -0.25, 5, -1.25, 12, 0.3, 9, 0.2), FD(1)] },
  daggerSpin: { dur: 1.6, keys: [FD(0), FD(0.3, 3, -1.0, 5, -1.1, 4, -0.2, 12, 0.3), FD(0.7, 3, -1.05, 5, -1.0, 4, -0.25, 12, 0.32), FD(1)] },
};
/** Add a fidget at time u∈[0,1] into the 13-float pose (weight w). */
export function addFidget(out, f, u, w) {
  const K = f.keys;
  let a = K[0], b = K[K.length - 1];
  for (let i = 1; i < K.length; i++) if (u <= K[i].t) { a = K[i - 1]; b = K[i]; break; }
  const span = b.t - a.t, x = span > 1e-6 ? Math.min(1, Math.max(0, (u - a.t) / span)) : 1;
  const s = x * x * (3 - 2 * x);
  // deltas: a's value → b's value per index (missing = 0)
  for (let i = 0; i < a.d.length; i += 2) out[a.d[i]] += a.d[i + 1] * (1 - s) * w;
  for (let i = 0; i < b.d.length; i += 2) out[b.d[i]] += b.d[i + 1] * s * w;
}

// ------------------------------------------------------------------ dodge pose ids (animated procedurally in anim.js)
export const DODGE_POSES = { blink: 'none', spiritswap: 'none', dashstep: 'lean', shieldstep: 'brace', backflip: 'flip', shadowroll: 'roll', none: 'none' };
