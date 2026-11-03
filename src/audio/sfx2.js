// v2 sound recipes: sword, defense, dialogue/quest, terrain, finisher, spirit/blessing.
// Same recipe signature as sounds.js: (E, out, t, pitch) => dur | {dur, rev}.
// Node budget: frequently played sounds (swings, hits, blips) stay at <= ~6 voices.

const R = (a, b) => a + Math.random() * (b - a);
const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3, 4];
const METAL = [1, 2.32, 2.76, 3.89, 5.4, 6.8];
const CHIME_N = 5;   // bells per spirit chime cluster (not an element count)

/** FM bell (inharmonic ratio) + soft sine fundamental. */
function bell(E, o, t, f, vol, len, ratio = 2.76, a = 0.002) {
  E.fm(o, t, len, { f, ratio, index: f * 0.9, vol, a });
  E.osc(o, t, len * 1.3, { type: 'sine', f: f * 0.5, vol: vol * 0.35, a: a + 0.01 });
}

/** Choir "aah": formant voice on vowel a. */
function choir(E, o, t, f, vol, len, a = 0.4) {
  E.formant(o, t, len, { f, vol, a, hold: Math.max(0, len - a - 0.8), shape: 'lin', q: 9, vib: { rate: 4.8 + Math.random(), depth: f * 0.008 }, formants: [[800, 1], [1150, 0.55], [2900, 0.18]] });
}

function swish(E, o, t, dur, vol, f0, f1, q = 1.2, color = 'pink', peak = 0.35) {
  E.noiseV(o, t, dur, { color, vol, a: dur * peak, filter: { type: 'bandpass', f: f0, f1, ft: dur, q } });
}

function thump(E, o, t, p, f0, f1, dur, vol) {
  E.osc(o, t, dur, { type: 'sine', f: f0 * p, f1: f1 * p, ft: dur * 0.6, vol, a: 0.001 });
}

function ring(E, o, t, base, vol, len, n = 4) {
  for (let i = 0; i < n; i++) {
    E.osc(o, t, len * (1 - i * 0.15), { type: i ? 'sine' : 'triangle', f: base * METAL[i] * R(0.995, 1.005), vol: vol / (1 + i * 0.6), a: 0.0008 });
  }
}

function sparkle(E, o, t, p, n, vol, base = 2093, step = 0.04) {
  for (let i = 0; i < n; i++) {
    E.osc(o, t + i * step * R(0.8, 1.2), 0.6, { type: i % 2 ? 'triangle' : 'sine', f: base * p * PENTA[i % PENTA.length] * (i >= PENTA.length ? 2 : 1), vol: vol * R(0.6, 1), a: 0.002 });
  }
}

function brass(E, o, t, f, len, vol) {
  E.osc(o, t, len, { type: 'sawtooth', f, vol, a: 0.03, hold: len * 0.4, filter: { type: 'lowpass', f: 700, f1: 2800, ft: 0.08, q: 1 } });
  E.osc(o, t, len, { type: 'triangle', f, vol: vol * 1.1, a: 0.012, detune: 6 });
}

export const SFX2 = {
  // ---------------- SWORD ----------------
  sword_swing(E, o, t, p) {
    const v = R(0.85, 1.2) * p; // extra pitch variety on top of the engine jitter
    swish(E, o, t, 0.2, 0.85, 500 * v, 3800 * v, 1.4, 'pink', 0.4);
    E.noiseV(o, t + 0.05, 0.12, { color: 'white', vol: 0.32, a: 0.05, filter: { type: 'highpass', f: 5200 * v, q: 0.7 } });
    E.osc(o, t, 0.14, { type: 'sine', f: 240 * v, f1: 120 * v, vol: 0.12, a: 0.04 });
    return { dur: 0.25, rev: 0.12 };
  },
  sword_swing_heavy(E, o, t, p) {
    const v = R(0.9, 1.1) * p;
    swish(E, o, t, 0.38, 0.95, 260 * v, 2200 * v, 1.1, 'pink', 0.45);
    E.noiseV(o, t + 0.04, 0.3, { color: 'brown', vol: 0.6, a: 0.12, filter: { type: 'lowpass', f: 500 * v } });
    E.noiseV(o, t + 0.12, 0.2, { color: 'white', vol: 0.28, a: 0.06, filter: { type: 'highpass', f: 4200 * v } });
    E.osc(o, t + 0.02, 0.32, { type: 'triangle', f: 2350 * v, f1: 2100 * v, vol: 0.035, a: 0.08 }); // faint blade "shing"
    return { dur: 0.42, rev: 0.25 };
  },
  sword_hit(E, o, t, p) {
    E.noiseV(o, t, 0.014, { color: 'white', vol: 0.9, a: 0.0004, filter: { type: 'highpass', f: 3000 * p } });  // transient click
    thump(E, o, t, p, 170, 48, 0.16, 1.0);                                                                       // low thump
    E.noiseV(o, t, 0.09, { color: 'pink', vol: 0.7, a: 0.0008, filter: { type: 'bandpass', f: 950 * p, f1: 420 * p, q: 0.9 } }); // meat
    E.osc(o, t, 0.05, { type: 'triangle', f: 1600 * p, f1: 500 * p, vol: 0.3, a: 0.0005 });
    E.osc(o, t + 0.004, 0.18, { type: 'sine', f: 1850 * p * R(0.97, 1.03), vol: 0.05, a: 0.001 });              // tiny steel tick
    return { dur: 0.22, rev: 0.14 };
  },
  sword_hit_heavy(E, o, t, p) {
    E.noiseV(o, t, 0.02, { color: 'white', vol: 1.0, a: 0.0004, filter: { type: 'highpass', f: 2500 * p } });
    thump(E, o, t, p, 130, 34, 0.38, 1.15);
    E.noiseV(o, t, 0.2, { color: 'brown', vol: 0.9, a: 0.001, filter: { type: 'lowpass', f: 900, f1: 180 } });
    E.noiseV(o, t + 0.005, 0.14, { color: 'pink', vol: 0.75, a: 0.001, filter: { type: 'bandpass', f: 800 * p, f1: 300 * p, q: 0.8 } });
    E.noiseV(o, t + 0.01, 0.25, { color: 'crackle', vol: 0.45, a: 0.002, filter: { type: 'bandpass', f: 2400, q: 0.7 } });
    ring(E, o, t + 0.003, 1320 * p * R(0.97, 1.03), 0.09, 0.7, 3);                                              // metallic ring
    return { dur: 0.75, rev: 0.32 };
  },
  sword_draw(E, o, t, p) {
    E.noiseV(o, t, 0.34, { color: 'white', vol: 0.3, a: 0.2, filter: { type: 'bandpass', f: 2600 * p, f1: 7500 * p, q: 3.5 } });
    E.osc(o, t + 0.18, 0.6, { type: 'sine', f: 2637 * p, vol: 0.07, a: 0.002 });
    E.osc(o, t + 0.18, 0.45, { type: 'sine', f: 3951 * p, vol: 0.04, a: 0.002 });
    return { dur: 0.8, rev: 0.45 };
  },
  // ---------------- DEFENSE ----------------
  block(E, o, t, p) {
    E.osc(o, t, 0.06, { type: 'triangle', f: 700 * p, f1: 380 * p, vol: 0.3, a: 0.001 });
    E.noiseV(o, t, 0.07, { color: 'pink', vol: 0.4, a: 0.001, filter: { type: 'bandpass', f: 2300 * p, q: 1.1 } });
    E.osc(o, t, 0.4, { type: 'sine', f: 1980 * p, vol: 0.035, a: 0.002 });
    return { dur: 0.45, rev: 0.2 };
  },
  block_hit(E, o, t, p) { // dull thud
    thump(E, o, t, p, 125, 52, 0.2, 0.95);
    E.noiseV(o, t, 0.16, { color: 'brown', vol: 0.75, a: 0.001, filter: { type: 'lowpass', f: 480 } });
    E.noiseV(o, t, 0.05, { color: 'pink', vol: 0.35, a: 0.0008, filter: { type: 'bandpass', f: 1700 * p, q: 2.5 } });
    E.osc(o, t, 0.12, { type: 'triangle', f: 900 * p, f1: 600 * p, vol: 0.06, a: 0.001 });
    return { dur: 0.24, rev: 0.12 };
  },
  guard_break(E, o, t, p) {
    E.noiseV(o, t, 0.12, { color: 'white', vol: 0.65, a: 0.0005, filter: { type: 'highpass', f: 2400 * p } });
    E.noiseV(o, t, 0.4, { color: 'ticks', vol: 0.5, a: 0.001, filter: { type: 'highpass', f: 2800 } });
    E.osc(o, t, 0.45, { type: 'square', f: 320 * p, f1: 70 * p, vol: 0.14, a: 0.002, filter: { type: 'lowpass', f: 1400, f1: 300 } });
    thump(E, o, t, p, 140, 45, 0.25, 0.8);
    return { dur: 0.55, rev: 0.35 };
  },
  parry(E, o, t, p) { // bright metallic CLANG + shimmer + reverb tail
    const b = 1180 * p;
    E.noiseV(o, t, 0.025, { color: 'white', vol: 1.0, a: 0.0003, filter: { type: 'highpass', f: 3500 } });
    thump(E, o, t, p, 220, 90, 0.12, 0.6);
    for (let i = 0; i < 6; i++) {
      E.osc(o, t, 1.5 - i * 0.18, { type: i < 2 ? 'triangle' : 'sine', f: b * METAL[i] * R(0.997, 1.003), vol: 0.2 / (1 + i * 0.45), a: 0.0005, vib: i === 0 ? { rate: 7, depth: 4 } : undefined });
    }
    E.fm(o, t + 0.01, 1.1, { f: b * 2, ratio: 1.41, index: b * 1.2, vol: 0.08, a: 0.001 });
    sparkle(E, o, t + 0.06, p, 5, 0.06, 3136, 0.035);
    E.noiseV(o, t + 0.02, 0.9, { color: 'white', vol: 0.1, a: 0.05, filter: { type: 'highpass', f: 7500 } });
    return { dur: 1.7, rev: 0.95 };
  },
  perfect_dodge(E, o, t, p) { // time-slow whoosh: pitch-down sweep
    E.noiseV(o, t, 1.0, { color: 'pink', vol: 0.75, a: 0.05, filter: { type: 'bandpass', f: 4200 * p, f1: 260 * p, ft: 0.9, q: 2.2 } });
    E.osc(o, t, 1.0, { type: 'sine', f: 1400 * p, f1: 160 * p, ft: 0.95, vol: 0.14, a: 0.02, vib: { rate: 6, depth: 25 } });
    E.osc(o, t, 1.0, { type: 'triangle', f: 700 * p, f1: 80 * p, ft: 0.95, vol: 0.08, a: 0.02 });
    E.osc(o, t + 0.05, 1.2, { type: 'sine', f: 90 * p, f1: 40 * p, vol: 0.5, a: 0.15 });
    E.osc(o, t, 0.5, { type: 'sine', f: 2637 * p, vol: 0.06, a: 0.002 });
    return { dur: 1.3, rev: 0.85 };
  },
  dash(E, o, t, p) {
    const v = R(0.92, 1.1) * p;
    swish(E, o, t, 0.17, 0.7, 700 * v, 2600 * v, 1.2, 'pink', 0.3);
    E.noiseV(o, t, 0.1, { color: 'brown', vol: 0.4, a: 0.01, filter: { type: 'lowpass', f: 600 } });
    E.osc(o, t, 0.09, { type: 'sine', f: 150 * v, f1: 70 * v, vol: 0.3, a: 0.002 });
    return { dur: 0.2, rev: 0.15 };
  },
  barrier_up(E, o, t, p) { // glassy hum
    for (const [m, v] of [[1, 0.1], [1.5, 0.07], [2, 0.06], [3, 0.03]]) {
      E.osc(o, t, 0.75, { type: 'sine', f: 523.25 * p * m, vol: v, a: 0.06, vib: { rate: 9, depth: 3 * m } });
    }
    E.noiseV(o, t, 0.4, { color: 'white', vol: 0.15, a: 0.2, filter: { type: 'bandpass', f: 2500 * p, f1: 8000 * p, q: 3 } });
    E.osc(o, t, 0.2, { type: 'sine', f: 160 * p, f1: 320 * p, vol: 0.2, a: 0.03 });
    return { dur: 0.85, rev: 0.7 };
  },
  barrier_hit(E, o, t, p) {
    E.noiseV(o, t, 0.06, { color: 'white', vol: 0.4, a: 0.0006, filter: { type: 'bandpass', f: 3200 * p, q: 1.5 } });
    for (const m of [1, 2.76, 5.4]) E.osc(o, t, 0.5, { type: 'sine', f: 880 * p * m * R(0.99, 1.01), vol: 0.08, a: 0.001 });
    thump(E, o, t, p, 160, 70, 0.14, 0.5);
    return { dur: 0.55, rev: 0.55 };
  },
  reflect(E, o, t, p) {
    E.osc(o, t, 0.25, { type: 'sine', f: 900 * p, f1: 3200 * p, ft: 0.15, vol: 0.18, a: 0.002 });
    E.noiseV(o, t, 0.2, { color: 'white', vol: 0.35, a: 0.002, filter: { type: 'bandpass', f: 1500 * p, f1: 7000 * p, q: 2 } });
    ring(E, o, t + 0.01, 1568 * p, 0.12, 0.8, 4);
    return { dur: 0.9, rev: 0.75 };
  },
  // ---------------- DIALOGUE / QUEST ----------------
  dialogue_blip(E, o, t, p) { // soft cute tick (pitch = speaker voice)
    E.osc(o, t, 0.05, { type: 'sine', f: 760 * p, f1: 820 * p, vol: 0.32, a: 0.003 });
    E.osc(o, t, 0.025, { type: 'triangle', f: 1520 * p, vol: 0.08, a: 0.001 });
    return { dur: 0.06, rev: 0.05 };
  },
  dialogue_open(E, o, t, p) {
    swish(E, o, t, 0.3, 0.2, 600 * p, 3000 * p, 1.5, 'pink', 0.5);
    E.osc(o, t + 0.08, 0.35, { type: 'triangle', f: 880 * p, vol: 0.12, a: 0.003 });
    E.osc(o, t + 0.16, 0.5, { type: 'sine', f: 1318.5 * p, vol: 0.11, a: 0.003 });
    return { dur: 0.7, rev: 0.5 };
  },
  quest_start(E, o, t, p) {
    const D = 293.66 * p;
    [[0, 1], [0.16, 3 / 2], [0.32, 2], [0.48, 9 / 4]].forEach(([dt, m], i) => {
      E.osc(o, t + dt, 1.6 - i * 0.2, { type: 'triangle', f: D * m * 2, vol: 0.13, a: 0.003 });
      E.osc(o, t + dt, 0.8, { type: 'sine', f: D * m * 4, vol: 0.03, a: 0.002 });
    });
    for (const m of [1, 1.5, 2]) E.osc(o, t, 2.2, { type: 'sine', f: D * m * 0.5, vol: 0.08, a: 0.35, shape: 'lin' });
    E.noiseV(o, t, 1.2, { color: 'white', vol: 0.06, a: 0.6, filter: { type: 'highpass', f: 6000 } });
    return { dur: 2.3, rev: 0.85 };
  },
  quest_complete(E, o, t, p) { // small fanfare
    const C = 523.25 * p;
    brass(E, o, t, C * 3 / 4, 0.14, 0.09);
    brass(E, o, t + 0.13, C, 0.14, 0.09);
    brass(E, o, t + 0.26, C * 5 / 4, 0.14, 0.09);
    for (const m of [1, 5 / 4, 3 / 2, 2]) brass(E, o, t + 0.42, C * m, 1.5, 0.065);
    E.osc(o, t + 0.42, 1.6, { type: 'sine', f: C / 4, vol: 0.3, a: 0.02 });
    E.osc(o, t + 0.42, 0.25, { type: 'sine', f: 110, f1: 50, vol: 0.4, a: 0.002 }); // soft timpani
    sparkle(E, o, t + 0.45, p, 7, 0.09, 2093, 0.05);
    return { dur: 2.3, rev: 0.85 };
  },
  item_get(E, o, t, p) {
    const A = 440 * p;
    [[0, 1], [0.1, 5 / 4], [0.2, 3 / 2], [0.3, 2]].forEach(([dt, m], i) => {
      E.osc(o, t + dt, i === 3 ? 1.4 : 0.3, { type: 'triangle', f: A * m * 2, vol: 0.15, a: 0.003 });
    });
    E.osc(o, t + 0.3, 1.4, { type: 'sine', f: A * 3, vol: 0.06, a: 0.01 });
    sparkle(E, o, t + 0.32, p, 6, 0.07, 2637, 0.04);
    return { dur: 1.6, rev: 0.8 };
  },
  // ---------------- TERRAIN ----------------
  grass_ignite(E, o, t, p) {
    swish(E, o, t, 0.55, 0.7, 260 * p, 1900 * p, 1.0, 'pink', 0.25);
    E.noiseV(o, t + 0.03, 0.7, { color: 'crackle', vol: 0.55, a: 0.04, filter: { type: 'bandpass', f: 2600, q: 0.8 } });
    E.noiseV(o, t, 0.5, { color: 'brown', vol: 0.5, a: 0.05, filter: { type: 'lowpass', f: 450 } });
    return { dur: 0.8, rev: 0.35 };
  },
  freeze_water(E, o, t, p) {
    E.noiseV(o, t, 0.6, { color: 'ticks', vol: 0.55, a: 0.08, filter: { type: 'highpass', f: 2600 * p } });
    E.noiseV(o, t, 0.5, { color: 'white', vol: 0.25, a: 0.25, filter: { type: 'bandpass', f: 2000 * p, f1: 6000 * p, q: 2 } });
    [1, 0.84, 0.75, 0.63].forEach((m, i) => E.osc(o, t + 0.06 + i * 0.07, 0.6, { type: 'sine', f: 2637 * p * m, vol: 0.06, a: 0.002 }));
    E.osc(o, t, 0.5, { type: 'triangle', f: 180 * p, f1: 120 * p, vol: 0.12, a: 0.05, filter: { type: 'lowpass', f: 600 } }); // creak
    return { dur: 0.9, rev: 0.65 };
  },
  // ---------------- AWAKENING / FINISHER ----------------
  awakening_ready(E, o, t, p) {
    const D = 293.66 * p;
    for (const [i, m] of [1, 1.5, 2, 3].entries()) {
      E.osc(o, t, 1.4, { type: 'sawtooth', f: D * m * 0.5, vol: 0.05, a: 0.3, detune: i * 6 - 9, filter: { type: 'lowpass', f: 400, f1: 4500, ft: 0.5, q: 2 } });
    }
    E.noiseV(o, t, 0.6, { color: 'white', vol: 0.22, a: 0.45, filter: { type: 'bandpass', f: 600, f1: 7000, q: 2 } });
    bell(E, o, t + 0.5, D * 4, 0.12, 1.6);
    bell(E, o, t + 0.56, D * 6, 0.08, 1.4);
    E.osc(o, t + 0.5, 0.5, { type: 'sine', f: 90, f1: 40, vol: 0.5, a: 0.003 });
    return { dur: 2.1, rev: 0.9 };
  },
  finisher_charge(E, o, t, p) { // huge power-up riser (~2 s)
    const base = 73.4 * p;
    for (const [i, m] of [1, 1.5, 2, 3, 4].entries()) {
      E.osc(o, t, 2.0, { type: 'sawtooth', f: base * m, f1: base * m * 2, ft: 1.8, vol: 0.06, a: 1.2, detune: (i - 2) * 11, filter: { type: 'lowpass', f: 200, f1: 6000, ft: 1.8, q: 4 } });
    }
    E.noiseV(o, t, 2.0, { color: 'white', vol: 0.45, a: 1.75, filter: { type: 'bandpass', f: 300, f1: 9000, ft: 1.9, q: 2 } });
    E.osc(o, t, 2.0, { type: 'sine', f: 40 * p, f1: 70 * p, vol: 0.55, a: 1.5 });
    choir(E, o, t + 0.2, base * 4, 0.2, 1.9, 1.2);
    choir(E, o, t + 0.2, base * 6, 0.12, 1.9, 1.2);
    sparkle(E, o, t + 1.6, p, 8, 0.08, 1568, 0.03);
    return { dur: 2.4, rev: 0.95 };
  },
  finisher_impact(E, o, t, p) { // huge
    E.noiseV(o, t, 0.04, { color: 'white', vol: 1.0, a: 0.0005, filter: { type: 'highpass', f: 1500 } });
    E.osc(o, t, 2.2, { type: 'sine', f: 70 * p, f1: 22 * p, ft: 1.6, vol: 0.8, a: 0.002 });
    E.osc(o, t, 0.08, { type: 'triangle', f: 400 * p, f1: 70 * p, vol: 0.6, a: 0.001 });
    E.noiseV(o, t, 1.6, { color: 'white', vol: 0.6, a: 0.002, filter: { type: 'lowpass', f: 6000, f1: 220, q: 0.5 } });
    E.noiseV(o, t, 2.6, { color: 'brown', vol: 0.7, a: 0.01, filter: { type: 'lowpass', f: 600, f1: 90 } });
    E.noiseV(o, t + 0.12, 2.0, { color: 'crackle', vol: 0.5, a: 0.15, filter: { type: 'bandpass', f: 2200, q: 0.6 } });
    ring(E, o, t + 0.01, 660 * p, 0.1, 2.2, 4);
    choir(E, o, t + 0.1, 146.8 * p, 0.12, 2.6, 0.08);
    sparkle(E, o, t + 0.25, p, 8, 0.07, 1760, 0.05);
    return { dur: 3.0, rev: 1.0 };
  },
  cinematic_whoosh(E, o, t, p) {
    E.noiseV(o, t, 1.3, { color: 'pink', vol: 0.65, a: 0.6, filter: { type: 'bandpass', f: 220 * p, pts: [[0.6, 1800 * p], [1.3, 400 * p]], q: 1.2 } });
    E.noiseV(o, t + 0.2, 0.9, { color: 'white', vol: 0.12, a: 0.45, filter: { type: 'highpass', f: 6000 } });
    E.osc(o, t, 1.3, { type: 'sine', f: 55 * p, f1: 80 * p, vol: 0.3, a: 0.6, shape: 'lin' });
    return { dur: 1.4, rev: 0.7 };
  },
  // ---------------- SPIRITS ----------------
  spirit_chime(E, o, t, p) { // ethereal bell cluster
    const base = 1046.5 * p;
    for (let i = 0; i < CHIME_N; i++) {
      const m = PENTA[(i * 2 + ((Math.random() * 3) | 0)) % 9];
      bell(E, o, t + i * R(0.05, 0.11), base * m, 0.07 * R(0.7, 1), 2.2, 3.5, 0.004);
    }
    E.noiseV(o, t, 1.4, { color: 'white', vol: 0.06, a: 0.5, filter: { type: 'highpass', f: 8000 } });
    return { dur: 2.8, rev: 1.0 };
  },
  blessing(E, o, t, p) {
    const D = 293.66 * p;
    for (const m of [1, 5 / 4, 3 / 2]) choir(E, o, t, D * m, 0.15, 3.6, 0.9);
    E.osc(o, t, 3.6, { type: 'sine', f: D / 4, vol: 0.3, a: 1.0, shape: 'lin' });
    for (let i = 0; i < 7; i++) bell(E, o, t + 0.5 + i * 0.22 * R(0.8, 1.2), D * 4 * PENTA[(i * 3) % 9], 0.055, 2.4, 3.5, 0.004);
    E.noiseV(o, t, 3.0, { color: 'white', vol: 0.1, a: 1.5, filter: { type: 'bandpass', f: 3000, f1: 9000, q: 1.5 } });
    return { dur: 4.2, rev: 1.0 };
  },
};
