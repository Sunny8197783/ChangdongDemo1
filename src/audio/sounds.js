// Sound recipes. Each recipe: (E: Engine, out: AudioNode, t: start time, p: pitch multiplier) => duration (s).
// Recipes may return {dur, rev} to override the reverb send amount.

const R = (a, b) => a + Math.random() * (b - a);
const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3, 4];

function chimes(E, out, t, p, base, n, spread, vol, len = 0.7, inharm = false) {
  for (let i = 0; i < n; i++) {
    const ratio = inharm ? [1, 1.5, 2.76, 3.2, 4.1, 5.4][i % 6] : PENTA[(i * 2 + (Math.random() * 3 | 0)) % PENTA.length];
    const f = base * p * ratio * R(0.99, 1.01);
    const tt = t + i * spread * R(0.7, 1.3);
    E.osc(out, tt, len * R(0.7, 1.2), { type: i % 2 ? 'triangle' : 'sine', f, vol: vol * R(0.6, 1), a: 0.002 });
  }
}

function boom(E, out, t, p, f0, f1, dur, vol) {
  E.osc(out, t, dur, { type: 'sine', f: f0 * p, f1: f1 * p, ft: dur * 0.7, vol, a: 0.002 });
  E.osc(out, t, 0.04, { type: 'triangle', f: f0 * 4 * p, f1: f0 * p, vol: vol * 0.5, a: 0.001 }); // click transient
}

function crack(E, out, t, p, vol) {
  E.noiseV(out, t, 0.09, { color: 'white', vol, a: 0.001, filter: { type: 'highpass', f: 2200 * p, q: 0.7 } });
  E.noiseV(out, t, 0.03, { color: 'white', vol: vol * 0.8, a: 0.0005, filter: { type: 'bandpass', f: 5000, q: 0.6 } });
}

function zaps(E, out, t, p, n, vol) {
  for (let i = 0; i < n; i++) {
    const f = R(900, 2600) * p, tt = t + i * R(0.025, 0.06);
    E.osc(out, tt, R(0.04, 0.08), { type: 'square', f, f1: f * R(0.15, 0.35), vol: vol * R(0.5, 1), a: 0.001, filter: { type: 'lowpass', f: 5000 } });
  }
}

function buzz(E, out, t, p, dur, vol) {
  E.osc(out, t, dur, { type: 'sawtooth', f: 110 * p, vol, a: 0.005, vib: { rate: 38, depth: 70, type: 'square' }, filter: { type: 'lowpass', f: 3000, f1: 600, q: 2 } });
  E.osc(out, t, dur * 0.8, { type: 'square', f: 55 * p, vol: vol * 0.5, a: 0.005, vib: { rate: 47, depth: 20 }, filter: { type: 'lowpass', f: 900 } });
}

function gravel(E, out, t, dur, vol, f = 1200) {
  E.noiseV(out, t, dur, { color: 'crackle', vol, a: 0.01, rate: R(0.6, 0.9), filter: { type: 'bandpass', f, q: 0.7 } });
}

function whoosh(E, out, t, dur, vol, f0, f1, q = 1.5, color = 'pink', peak = 0.4) {
  E.noiseV(out, t, dur, { color, vol, a: dur * peak, filter: { type: 'bandpass', f: f0, f1, ft: dur, q } });
}

function sparkle(E, out, t, p, n, vol, base = 2093, step = 0.035, rising = true) {
  for (let i = 0; i < n; i++) {
    const idx = rising ? i : n - 1 - i;
    const f = base * p * PENTA[idx % PENTA.length] * (idx >= PENTA.length ? 2 : 1);
    E.osc(out, t + i * step, 0.55, { type: i % 2 ? 'triangle' : 'sine', f, vol: vol * (0.7 + 0.3 * Math.random()), a: 0.002 });
  }
  E.noiseV(out, t, 0.6, { color: 'white', vol: vol * 0.25, a: 0.05, filter: { type: 'highpass', f: 7000 } });
}

export const SOUNDS = {
  // ---------------- FIRE ----------------
  cast_fire(E, o, t, p) {
    whoosh(E, o, t, 0.42, 0.7, 350 * p, 2600 * p, 1.2, 'pink', 0.35);
    E.noiseV(o, t + 0.04, 0.5, { color: 'crackle', vol: 0.55, a: 0.02, filter: { type: 'bandpass', f: 2800, q: 0.8 } });
    E.osc(o, t, 0.28, { type: 'sine', f: 110 * p, f1: 55 * p, vol: 0.45, a: 0.01 });
    E.noiseV(o, t, 0.25, { color: 'brown', vol: 0.5, a: 0.03, filter: { type: 'lowpass', f: 700 } });
    return 0.6;
  },
  impact_fire(E, o, t, p) {
    boom(E, o, t, p, 140, 50, 0.32, 0.8);
    E.noiseV(o, t, 0.35, { color: 'white', vol: 0.6, a: 0.001, filter: { type: 'lowpass', f: 3500, f1: 400, q: 0.5 } });
    E.noiseV(o, t + 0.03, 0.6, { color: 'crackle', vol: 0.45, a: 0.02, filter: { type: 'bandpass', f: 2600, q: 0.8 } });
    return 0.7;
  },
  explode_fire(E, o, t, p) {
    boom(E, o, t, p, 120, 38, 0.8, 1.0);
    E.noiseV(o, t, 0.9, { color: 'white', vol: 0.75, a: 0.001, filter: { type: 'lowpass', f: 3200, f1: 250, q: 0.4 } });
    E.noiseV(o, t, 1.5, { color: 'brown', vol: 0.8, a: 0.005, filter: { type: 'lowpass', f: 500, f1: 120 } });
    E.noiseV(o, t + 0.06, 1.6, { color: 'crackle', vol: 0.45, a: 0.12, filter: { type: 'bandpass', f: 2400, q: 0.7 } });
    return { dur: 1.7, rev: 0.6 };
  },
  // ---------------- ICE ----------------
  cast_ice(E, o, t, p) {
    chimes(E, o, t + 0.02, p, 1568, 4, 0.035, 0.28, 0.8);
    whoosh(E, o, t, 0.35, 0.35, 2500 * p, 7000 * p, 2, 'white', 0.3);
    E.noiseV(o, t, 0.5, { color: 'white', vol: 0.12, a: 0.08, filter: { type: 'highpass', f: 8000 } });
    E.osc(o, t, 0.18, { type: 'sine', f: 600 * p, f1: 1800 * p, vol: 0.12, a: 0.01 });
    return { dur: 1.0, rev: 0.7 };
  },
  impact_ice(E, o, t, p) {
    E.noiseV(o, t, 0.12, { color: 'white', vol: 0.6, a: 0.001, filter: { type: 'bandpass', f: 1900 * p, q: 1.1 } });
    E.noiseV(o, t, 0.22, { color: 'ticks', vol: 0.5, a: 0.001, filter: { type: 'highpass', f: 2200 } });
    chimes(E, o, t + 0.01, p, 2349, 3, 0.02, 0.2, 0.55, true);
    E.osc(o, t, 0.14, { type: 'sine', f: 220 * p, f1: 80 * p, vol: 0.45, a: 0.001 });
    return { dur: 0.7, rev: 0.6 };
  },
  explode_ice(E, o, t, p) {
    SOUNDS.impact_ice(E, o, t, p);
    SOUNDS.shatter(E, o, t + 0.02, p * 0.9);
    boom(E, o, t, p, 100, 40, 0.6, 0.7);
    whoosh(E, o, t, 0.9, 0.3, 6000, 1500, 1.5, 'white', 0.05);
    return { dur: 1.3, rev: 0.7 };
  },
  shatter(E, o, t, p) {
    E.noiseV(o, t, 0.1, { color: 'white', vol: 0.75, a: 0.0005, filter: { type: 'highpass', f: 3500 * p } });
    E.noiseV(o, t, 0.55, { color: 'ticks', vol: 0.8, a: 0.001, rate: 1.2, filter: { type: 'highpass', f: 3000 * p, q: 0.8 } });
    E.noiseV(o, t + 0.05, 0.4, { color: 'crackle', vol: 0.45, a: 0.002, filter: { type: 'highpass', f: 4500 } });
    for (let i = 0; i < 7; i++) {
      const f = R(2000, 6500) * p;
      E.osc(o, t + R(0, 0.18), R(0.15, 0.55), { type: Math.random() < 0.5 ? 'sine' : 'triangle', f, vol: R(0.08, 0.18), a: 0.001 });
    }
    E.osc(o, t, 0.18, { type: 'sine', f: 160 * p, f1: 60 * p, vol: 0.5, a: 0.001 });
    return { dur: 0.8, rev: 0.6 };
  },
  // ---------------- LIGHTNING ----------------
  cast_lightning(E, o, t, p) {
    crack(E, o, t, p, 0.75);
    zaps(E, o, t, p, 3, 0.22);
    buzz(E, o, t + 0.01, p, 0.32, 0.2);
    return 0.45;
  },
  impact_lightning(E, o, t, p) {
    crack(E, o, t, p, 0.9);
    zaps(E, o, t + 0.01, p, 4, 0.2);
    buzz(E, o, t, p * 1.1, 0.25, 0.22);
    E.osc(o, t, 0.12, { type: 'sine', f: 180 * p, f1: 60 * p, vol: 0.4, a: 0.001 });
    return 0.5;
  },
  explode_lightning(E, o, t, p) {
    crack(E, o, t, p, 1.0);
    zaps(E, o, t, p, 6, 0.22);
    buzz(E, o, t, p, 0.6, 0.25);
    SOUNDS.thunder(E, o, t + 0.05, p * 1.15, 0.6);
    return { dur: 2.2, rev: 0.7 };
  },
  thunder(E, o, t, p, s = 1) {
    crack(E, o, t, p, 0.9 * s);
    E.noiseV(o, t, 0.4, { color: 'white', vol: 0.5 * s, a: 0.002, filter: { type: 'lowpass', f: 4000, f1: 500 } });
    const rolls = [[0, 1], [0.25, 0.7], [0.7, 0.85], [1.3, 0.55], [1.9, 0.35]];
    for (const [dt, v] of rolls) {
      const d = R(0.8, 1.4);
      E.noiseV(o, t + dt * R(0.8, 1.2), d, { color: 'brown', vol: v * s, a: R(0.03, 0.15), filter: { type: 'lowpass', f: 700 * p, f1: 140, q: 0.6 } });
    }
    E.osc(o, t, 1.6, { type: 'sine', f: 55 * p, f1: 32 * p, vol: 0.45 * s, a: 0.01 });
    return { dur: 3.4, rev: 0.8 };
  },
  // ---------------- WIND ----------------
  cast_wind(E, o, t, p) {
    whoosh(E, o, t, 0.55, 0.7, 300 * p, 2200 * p, 2.5, 'pink', 0.45);
    whoosh(E, o, t + 0.05, 0.5, 0.35, 900 * p, 4200 * p, 4, 'white', 0.4);
    E.osc(o, t, 0.4, { type: 'sine', f: 380 * p, f1: 900 * p, vol: 0.06, a: 0.15 });
    return { dur: 0.7, rev: 0.5 };
  },
  impact_wind(E, o, t, p) {
    whoosh(E, o, t, 0.3, 0.6, 2400 * p, 500 * p, 1.6, 'pink', 0.1);
    E.osc(o, t, 0.2, { type: 'sine', f: 120 * p, f1: 55 * p, vol: 0.45, a: 0.003 });
    return 0.4;
  },
  explode_wind(E, o, t, p) {
    E.noiseV(o, t, 1.3, { color: 'pink', vol: 0.75, a: 0.25, filter: { type: 'bandpass', f: 300 * p, q: 3, pts: [[0.45, 1800 * p], [0.9, 600 * p], [1.3, 2400 * p]] } });
    E.noiseV(o, t + 0.1, 1.1, { color: 'white', vol: 0.3, a: 0.3, filter: { type: 'bandpass', f: 1200 * p, q: 6, pts: [[0.4, 4500 * p], [0.8, 1500 * p], [1.1, 5000 * p]] } });
    boom(E, o, t, p, 90, 40, 0.45, 0.55);
    return { dur: 1.4, rev: 0.6 };
  },
  // ---------------- EARTH ----------------
  cast_earth(E, o, t, p) {
    boom(E, o, t, p, 85, 38, 0.35, 0.85);
    E.noiseV(o, t, 0.35, { color: 'brown', vol: 0.75, a: 0.003, filter: { type: 'lowpass', f: 380 } });
    gravel(E, o, t + 0.02, 0.45, 0.55, 1300 * p);
    return 0.55;
  },
  impact_earth(E, o, t, p) {
    boom(E, o, t, p, 115, 45, 0.3, 0.9);
    E.noiseV(o, t, 0.3, { color: 'white', vol: 0.45, a: 0.001, filter: { type: 'lowpass', f: 1400, f1: 200 } });
    gravel(E, o, t + 0.01, 0.55, 0.6, 1100 * p);
    return 0.6;
  },
  explode_earth(E, o, t, p) {
    boom(E, o, t, p, 70, 28, 0.9, 1.0);
    E.noiseV(o, t, 1.0, { color: 'brown', vol: 0.9, a: 0.003, filter: { type: 'lowpass', f: 600, f1: 120 } });
    E.noiseV(o, t, 0.25, { color: 'white', vol: 0.4, a: 0.001, filter: { type: 'lowpass', f: 2000, f1: 300 } });
    gravel(E, o, t + 0.03, 1.3, 0.6, 900 * p);
    gravel(E, o, t + 0.2, 1.0, 0.35, 2200 * p);
    return { dur: 1.5, rev: 0.5 };
  },
  golem_step(E, o, t, p) {
    boom(E, o, t, p, 62, 28, 0.45, 1.0);
    E.noiseV(o, t, 0.5, { color: 'brown', vol: 0.8, a: 0.003, filter: { type: 'lowpass', f: 260 } });
    gravel(E, o, t + 0.02, 0.45, 0.32, 800);
    return { dur: 0.6, rev: 0.4 };
  },
  // ---------------- REACTIONS ----------------
  steam(E, o, t, p) {
    E.noiseV(o, t, 1.0, { color: 'white', vol: 0.5, a: 0.02, filter: { type: 'highpass', f: 2500 * p }, filter2: { type: 'bandpass', f: 6000 * p, f1: 2800 * p, q: 0.7 } });
    E.noiseV(o, t, 0.7, { color: 'pink', vol: 0.3, a: 0.05, filter: { type: 'bandpass', f: 1500 * p, q: 1.2 } });
    E.osc(o, t, 0.25, { type: 'sine', f: 140 * p, f1: 70 * p, vol: 0.25, a: 0.005 });
    return { dur: 1.1, rev: 0.5 };
  },
  reaction(E, o, t, p) {
    sparkle(E, o, t, p, 6, 0.24, 1046, 0.032);
    boom(E, o, t, p, 90, 32, 0.65, 0.85);
    whoosh(E, o, t, 0.5, 0.3, 800, 5000, 2, 'white', 0.6);
    return { dur: 1.1, rev: 0.9 };
  },
  combo(E, o, t, p) {
    const base = 523 * p;
    for (const [i, m] of [1, 1.5, 2, 3].entries()) {
      E.osc(o, t, 1.4, { type: 'sawtooth', f: base * m * 0.5, vol: 0.08, a: 0.35, detune: i * 7 - 10, filter: { type: 'lowpass', f: 400, f1: 4000, ft: 0.6, q: 2 } });
    }
    sparkle(E, o, t + 0.25, p, 7, 0.18, 1568, 0.04);
    boom(E, o, t + 0.3, p, 80, 30, 0.8, 0.9);
    return { dur: 1.6, rev: 0.9 };
  },
  crit(E, o, t, p) {
    E.osc(o, t, 0.3, { type: 'triangle', f: 2637 * p, vol: 0.18, a: 0.001 });
    E.osc(o, t + 0.03, 0.35, { type: 'sine', f: 3951 * p, vol: 0.12, a: 0.001 });
    return { dur: 0.4, rev: 0.4 };
  },
  // ---------------- BODY ----------------
  hit(E, o, t, p) {
    E.noiseV(o, t, 0.08, { color: 'white', vol: 0.75, a: 0.0008, filter: { type: 'bandpass', f: 1300 * p, q: 0.9 } });
    E.osc(o, t, 0.13, { type: 'sine', f: 190 * p, f1: 60 * p, vol: 0.85, a: 0.001 });
    E.osc(o, t, 0.03, { type: 'triangle', f: 1000 * p, f1: 220 * p, vol: 0.4, a: 0.0005 });
    return { dur: 0.2, rev: 0.15 };
  },
  enemy_hurt(E, o, t, p) {
    const f = R(170, 230) * p;
    E.formant(o, t, 0.2, { f, f1: f * 0.7, vol: 1.1, a: 0.01, q: 5, formants: [[750 * p, 1, 600 * p], [1250 * p, 0.6, 1000 * p], [2600 * p, 0.25]] });
    return { dur: 0.25, rev: 0.2 };
  },
  enemy_death(E, o, t, p) {
    const f = R(150, 190) * p;
    E.formant(o, t, 0.45, { f, f1: f * 0.5, vol: 0.5, a: 0.01, q: 5, vib: { rate: 9, depth: 8 }, formants: [[650 * p, 1, 450 * p], [1100 * p, 0.6, 800 * p]] });
    // magical smoke poof
    whoosh(E, o, t + 0.25, 0.5, 0.5, 1800, 400, 1.2, 'pink', 0.15);
    E.osc(o, t + 0.25, 0.3, { type: 'sine', f: 130 * p, f1: 55 * p, vol: 0.45, a: 0.003 });
    sparkle(E, o, t + 0.32, p, 3, 0.1, 1568, 0.05, false);
    return { dur: 1.0, rev: 0.5 };
  },
  boss_hurt(E, o, t, p) {
    E.formant(o, t, 0.45, { f: 80 * p, f1: 60 * p, vol: 0.6, a: 0.02, q: 4, vib: { rate: 22, depth: 6 }, formants: [[450, 1, 350], [900, 0.6]] });
    gravel(E, o, t, 0.35, 0.3, 900);
    return { dur: 0.5, rev: 0.5 };
  },
  alert(E, o, t, p) {
    E.osc(o, t, 0.1, { type: 'triangle', f: 740 * p, vol: 0.16, a: 0.002 });
    E.osc(o, t + 0.07, 0.25, { type: 'triangle', f: 1109 * p, vol: 0.16, a: 0.002 });
    E.formant(o, t, 0.16, { f: 240 * p, f1: 320 * p, vol: 0.3, a: 0.01, q: 5, formants: [[800, 1], [1300, 0.5]] });
    return { dur: 0.35, rev: 0.4 };
  },
  player_hurt(E, o, t, p) {
    E.formant(o, t, 0.22, { f: 260 * p, f1: 180 * p, vol: 0.45, a: 0.008, q: 5, formants: [[620, 1], [1050, 0.6], [2500, 0.2]] });
    E.osc(o, t, 0.2, { type: 'sine', f: 150 * p, f1: 50 * p, vol: 0.8, a: 0.001 });
    E.noiseV(o, t, 0.15, { color: 'white', vol: 0.5, a: 0.001, filter: { type: 'lowpass', f: 2500, f1: 300 } });
    return { dur: 0.3, rev: 0.2 };
  },
  // ---------------- MOVEMENT ----------------
  blink(E, o, t, p) {
    E.noiseV(o, t, 0.24, { color: 'white', vol: 0.55, a: 0.18, filter: { type: 'bandpass', f: 500 * p, f1: 7000 * p, q: 2.5 } });
    E.osc(o, t + 0.02, 0.22, { type: 'sine', f: 300 * p, f1: 2600 * p, ft: 0.2, vol: 0.14, a: 0.17 });
    E.osc(o, t + 0.2, 0.12, { type: 'triangle', f: 2600 * p, f1: 1400 * p, vol: 0.1, a: 0.002 });
    E.noiseV(o, t + 0.2, 0.4, { color: 'white', vol: 0.1, a: 0.01, filter: { type: 'highpass', f: 6000 } });
    return { dur: 0.6, rev: 0.6 };
  },
  jump(E, o, t, p) {
    E.noiseV(o, t, 0.14, { color: 'pink', vol: 0.6, a: 0.01, filter: { type: 'bandpass', f: 900 * p, f1: 2200 * p, q: 1 } });
    E.osc(o, t, 0.1, { type: 'sine', f: 220 * p, f1: 360 * p, vol: 0.2, a: 0.005 });
    return 0.2;
  },
  land(E, o, t, p) {
    E.osc(o, t, 0.16, { type: 'sine', f: 110 * p, f1: 48 * p, vol: 0.6, a: 0.002 });
    E.noiseV(o, t, 0.16, { color: 'brown', vol: 0.55, a: 0.002, filter: { type: 'lowpass', f: 600 } });
    E.noiseV(o, t, 0.12, { color: 'pink', vol: 0.25, a: 0.002, filter: { type: 'bandpass', f: 2000, q: 0.8 } });
    return { dur: 0.22, rev: 0.1 };
  },
  footstep(E, o, t, p) {
    E.noiseV(o, t, 0.08, { color: 'pink', vol: 0.32, a: 0.008, filter: { type: 'bandpass', f: 2300 * p, q: 0.7 } });
    E.noiseV(o, t + 0.01, 0.06, { color: 'crackle', vol: 0.18, a: 0.004, filter: { type: 'highpass', f: 3000 * p } });
    E.osc(o, t, 0.05, { type: 'sine', f: 90 * p, f1: 60, vol: 0.15, a: 0.003 });
    return { dur: 0.1, rev: 0.03 };
  },
  glide(E, o, t, p) {
    whoosh(E, o, t, 0.6, 0.35, 400 * p, 1600 * p, 1.5, 'pink', 0.5);
    E.noiseV(o, t + 0.05, 0.3, { color: 'white', vol: 0.15, a: 0.002, filter: { type: 'bandpass', f: 1800, q: 3 } }); // cloth flap
    return 0.7;
  },
  // ---------------- UI ----------------
  ui_select(E, o, t, p) {
    E.osc(o, t, 0.12, { type: 'triangle', f: 1318 * p, vol: 0.2, a: 0.002 });
    E.osc(o, t + 0.05, 0.22, { type: 'sine', f: 1976 * p, vol: 0.16, a: 0.002 });
    return { dur: 0.3, rev: 0.4 };
  },
  ui_click(E, o, t, p) {
    E.osc(o, t, 0.06, { type: 'triangle', f: 880 * p, f1: 660 * p, vol: 0.25, a: 0.001 });
    E.noiseV(o, t, 0.02, { color: 'white', vol: 0.15, a: 0.0005, filter: { type: 'highpass', f: 4000 } });
    return { dur: 0.1, rev: 0.2 };
  },
  mana_empty(E, o, t, p) {
    E.osc(o, t, 0.28, { type: 'square', f: 170 * p, f1: 85 * p, vol: 0.22, a: 0.004, filter: { type: 'lowpass', f: 700, f1: 200 } });
    E.noiseV(o, t, 0.32, { color: 'crackle', vol: 0.3, a: 0.004, filter: { type: 'bandpass', f: 1600, f1: 500, q: 1 } });
    return { dur: 0.35, rev: 0.1 };
  },
  cooldown(E, o, t, p) {
    E.osc(o, t, 0.07, { type: 'triangle', f: 330 * p, vol: 0.12, a: 0.002, filter: { type: 'lowpass', f: 1200 } });
    return 0.1;
  },
  charge(E, o, t, p) {
    E.osc(o, t, 0.45, { type: 'sine', f: 280 * p, f1: 840 * p, vol: 0.18, a: 0.12 });
    E.noiseV(o, t, 0.45, { color: 'white', vol: 0.25, a: 0.3, filter: { type: 'bandpass', f: 600 * p, f1: 3000 * p, q: 6 } });
    return { dur: 0.5, rev: 0.6 };
  },
  // ---------------- BIG MOMENTS ----------------
  ultimate(E, o, t, p) {
    const base = 146.8 * p;
    for (const [i, m] of [1, 1.5, 2, 2.5, 3].entries()) {
      E.osc(o, t, 1.6, { type: 'sawtooth', f: base * m, vol: 0.07, a: 0.5, detune: (i - 2) * 9, filter: { type: 'lowpass', f: 300, f1: 5000, ft: 0.7, q: 3 } });
    }
    E.noiseV(o, t, 1.0, { color: 'white', vol: 0.35, a: 0.6, filter: { type: 'bandpass', f: 400, f1: 6000, q: 2 } });
    boom(E, o, t + 0.65, p, 75, 28, 1.0, 1.0);
    sparkle(E, o, t + 0.6, p, 6, 0.18, 1174, 0.04);
    return { dur: 2.0, rev: 0.9 };
  },
  cast_heavy(E, o, t, p) {
    boom(E, o, t, p, 100, 40, 0.35, 0.6);
    whoosh(E, o, t, 0.4, 0.4, 250, 1500, 1.5, 'pink', 0.2);
    return 0.5;
  },
  meteor_fall(E, o, t, p) {
    E.osc(o, t, 1.6, { type: 'sine', f: 2400 * p, f1: 260 * p, vol: 0.18, a: 0.15, vib: { rate: 7, depth: 30 } });
    E.noiseV(o, t, 1.6, { color: 'pink', vol: 0.5, a: 1.3, filter: { type: 'bandpass', f: 3000, f1: 300, q: 1.5 } });
    E.noiseV(o, t + 0.3, 1.3, { color: 'brown', vol: 0.6, a: 1.0, filter: { type: 'lowpass', f: 300 } });
    return { dur: 1.7, rev: 0.6 };
  },
  boss_roar(E, o, t, p) {
    E.formant(o, t, 1.9, { f: 72 * p, f1: 52 * p, vol: 0.75, a: 0.15, q: 4, vib: { rate: 24, depth: 9 }, formants: [[420, 1, 300], [820, 0.7, 600], [1600, 0.25]] });
    E.formant(o, t + 0.05, 1.7, { f: 108 * p, f1: 70 * p, vol: 0.35, a: 0.2, q: 3, vib: { rate: 31, depth: 14 }, formants: [[500, 1], [1100, 0.5]] });
    E.noiseV(o, t, 2.0, { color: 'brown', vol: 0.8, a: 0.2, filter: { type: 'lowpass', f: 700, f1: 200 } });
    E.osc(o, t, 2.0, { type: 'sine', f: 46 * p, f1: 34 * p, vol: 0.6, a: 0.2 });
    gravel(E, o, t + 0.3, 1.5, 0.3, 700);
    return { dur: 2.4, rev: 0.8 };
  },
  victory(E, o, t, p) {
    const C = 523.25 * p;
    const notes = [[0, 1], [0.14, 5 / 4], [0.28, 3 / 2], [0.42, 2]];
    const brass = (tt, f, len, v) => {
      E.osc(o, tt, len, { type: 'sawtooth', f, vol: v, a: 0.03, hold: len * 0.4, filter: { type: 'lowpass', f: 900, f1: 3000, ft: 0.08, q: 1 } });
      E.osc(o, tt, len, { type: 'triangle', f, vol: v * 1.2, a: 0.01, detune: 6 });
    };
    for (const [dt, m] of notes) brass(t + dt, C * m, dt === 0.42 ? 0.6 : 0.2, 0.12);
    const tc = t + 0.75;
    // short IV chord pickup, then the tonic chord rings out
    for (const m of [2 / 3, 4 / 3, 5 / 3]) brass(t + 0.58, C * m, 0.16, 0.06);
    for (const m of [0.5, 1, 5 / 4, 3 / 2, 2]) brass(tc, C * m, 2.0, 0.08);
    sparkle(E, o, tc, p, 8, 0.12, 2093, 0.06);
    E.osc(o, tc, 2.0, { type: 'sine', f: C / 4, vol: 0.35, a: 0.02 });
    return { dur: 3.2, rev: 0.8 };
  },
  camp_cleared(E, o, t, p) {
    const D = 587.33 * p;
    [1, 5 / 4, 3 / 2, 2, 5 / 2].forEach((m, i) => E.osc(o, t + i * 0.09, 0.9 - i * 0.05, { type: 'triangle', f: D * m, vol: 0.18, a: 0.004 }));
    E.osc(o, t + 0.45, 1.4, { type: 'sine', f: D * 2, vol: 0.12, a: 0.02 });
    E.osc(o, t + 0.45, 1.4, { type: 'sine', f: D * 3, vol: 0.06, a: 0.02 });
    sparkle(E, o, t + 0.4, p, 5, 0.08, 2349, 0.05);
    return { dur: 2.0, rev: 0.9 };
  },
  player_death(E, o, t, p) {
    const A = 440 * p;
    [2, 5 / 3, 3 / 2, 6 / 5, 1].forEach((m, i) => E.osc(o, t + i * 0.16, 1.2, { type: 'triangle', f: A * m, vol: 0.14, a: 0.01 }));
    E.osc(o, t, 2.5, { type: 'sine', f: 110 * p, f1: 55 * p, vol: 0.35, a: 0.05 });
    whoosh(E, o, t, 1.4, 0.3, 3000, 300, 1.2, 'pink', 0.1);
    return { dur: 2.6, rev: 0.9 };
  },
  pickup(E, o, t, p) {
    E.osc(o, t, 0.15, { type: 'sine', f: 1568 * p, vol: 0.15, a: 0.002 });
    E.osc(o, t + 0.06, 0.25, { type: 'sine', f: 2349 * p, vol: 0.12, a: 0.002 });
    return { dur: 0.35, rev: 0.4 };
  },
};

// Aliases
SOUNDS.campCleared = SOUNDS.camp_cleared;
SOUNDS.explode_physical = SOUNDS.explode_earth;
SOUNDS.impact_physical = SOUNDS.hit;
SOUNDS.cast_physical = SOUNDS.cast_wind;
SOUNDS.impact_water = SOUNDS.steam;
