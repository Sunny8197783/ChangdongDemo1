// v4 readability cues (PLAN §5.5, §7.4.9): short, distinct, readable under music. Same recipe signature as sounds.js:
// (E, out, t, pitch) => dur | {dur, rev}. Each ≤ 4 voices. 'perfect_dodge' already exists in sfx2.js.
// Distinct by timbre AND contour: light = one dry tick-up, heavy = low double thump, parry = high bell "ting",
// unblockable = low horn swell, jump = rising whistle, commit = short click, punish = bright two-note chime.

export const SFX4 = {
  tell_light(E, o, t, p) {
    E.osc(o, t, 0.11, { type: 'triangle', f: 740 * p, f1: 1100 * p, ft: 0.08, vol: 0.32, a: 0.002 });
    E.noiseV(o, t, 0.05, { color: 'white', vol: 0.12, a: 0.001, filter: { type: 'highpass', f: 3800 } });
    return 0.14;
  },
  tell_heavy(E, o, t, p) {
    E.osc(o, t, 0.16, { type: 'sine', f: 120 * p, f1: 70 * p, ft: 0.14, vol: 0.7, a: 0.003 });
    E.osc(o, t + 0.13, 0.2, { type: 'sine', f: 100 * p, f1: 55 * p, ft: 0.18, vol: 0.75, a: 0.003 });
    E.noiseV(o, t, 0.1, { color: 'brown', vol: 0.3, a: 0.002, filter: { type: 'lowpass', f: 500 } });
    return 0.36;
  },
  tell_parry(E, o, t, p) {
    E.fm(o, t, 0.5, { f: 2093 * p, ratio: 3.01, index: 900 * p, vol: 0.24, a: 0.001 });
    E.osc(o, t, 0.45, { type: 'sine', f: 4186 * p, vol: 0.06, a: 0.001 });
    return { dur: 0.5, rev: 0.5 };
  },
  tell_unblockable(E, o, t, p) {
    E.osc(o, t, 0.55, { type: 'sawtooth', f: 98 * p, vol: 0.28, a: 0.12, hold: 0.25, filter: { type: 'lowpass', f: 380, f1: 1200, ft: 0.3, q: 2 } });
    E.osc(o, t, 0.55, { type: 'square', f: 147 * p, vol: 0.1, a: 0.12, hold: 0.25, filter: { type: 'lowpass', f: 700 } });
    return { dur: 0.6, rev: 0.4 };
  },
  tell_jump(E, o, t, p) {
    E.osc(o, t, 0.32, { type: 'sine', f: 520 * p, f1: 1560 * p, ft: 0.28, vol: 0.28, a: 0.01 });
    E.osc(o, t + 0.02, 0.3, { type: 'triangle', f: 260 * p, f1: 780 * p, ft: 0.26, vol: 0.12, a: 0.01 });
    return 0.34;
  },
  tell_commit(E, o, t, p) {
    E.osc(o, t, 0.045, { type: 'square', f: 1800 * p, vol: 0.12, a: 0.001, filter: { type: 'bandpass', f: 2200, q: 3 } });
    return 0.05;
  },
  punish(E, o, t, p) {
    E.osc(o, t, 0.3, { type: 'sine', f: 1319 * p, vol: 0.2, a: 0.003 });
    E.osc(o, t + 0.08, 0.4, { type: 'sine', f: 1976 * p, vol: 0.2, a: 0.003 });
    E.osc(o, t + 0.08, 0.4, { type: 'triangle', f: 988 * p, vol: 0.07, a: 0.003 });
    return { dur: 0.5, rev: 0.6 };
  },
  offscreen(E, o, t, p) {
    E.osc(o, t, 0.08, { type: 'triangle', f: 880 * p, vol: 0.16, a: 0.002 });
    E.osc(o, t + 0.07, 0.08, { type: 'triangle', f: 660 * p, vol: 0.16, a: 0.002 });
    return 0.16;
  },
  dodge_rejected(E, o, t, p) {
    E.osc(o, t, 0.12, { type: 'square', f: 180 * p, f1: 140 * p, ft: 0.1, vol: 0.1, a: 0.002, filter: { type: 'lowpass', f: 900 } });
    return 0.13;
  },
  break_boss(E, o, t, p) {
    E.noiseV(o, t, 0.5, { color: 'pink', vol: 0.5, a: 0.002, filter: { type: 'lowpass', f: 3000, f1: 300, ft: 0.45 } });
    E.osc(o, t, 0.6, { type: 'sine', f: 90 * p, f1: 40 * p, ft: 0.5, vol: 0.8, a: 0.002 });
    E.fm(o, t + 0.05, 0.7, { f: 660 * p, ratio: 1.41, index: 500, vol: 0.14, a: 0.002 });
    return { dur: 0.8, rev: 0.8 };
  },
  codex_unlock(E, o, t, p) {
    E.osc(o, t, 0.25, { type: 'sine', f: 784 * p, vol: 0.12, a: 0.005 });
    E.osc(o, t + 0.09, 0.3, { type: 'sine', f: 1175 * p, vol: 0.12, a: 0.005 });
    E.noiseV(o, t, 0.25, { color: 'white', vol: 0.03, a: 0.05, filter: { type: 'highpass', f: 6000 } });
    return { dur: 0.42, rev: 0.6 };
  },
};
/** Tell kind (+ attack class) → start cue. */
export function tellCue(tell, cls) {
  if (tell === 'parry') return 'tell_light';       // the "ting" plays at the glint (tellCommit)
  if (tell === 'unblockable') return 'tell_unblockable';
  if (tell === 'jump') return 'tell_jump';
  if (tell === 'projectile') return 'tell_light';
  return cls === 'mobHeavy' || cls === 'boss' || cls === 'bossAoE' || cls === 'elite' || cls === 'check' ? 'tell_heavy' : 'tell_light';
}
export const TELL_CUES = ['tell_light', 'tell_heavy', 'tell_parry', 'tell_unblockable', 'tell_jump'];
