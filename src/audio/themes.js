// v2 music themes scheduled on the Music 16th-note grid (108 BPM): title, intro, village, ending.
// Each theme fn: (M: Music, s16, bar, t, out) where bar/s16 are relative to when the theme started.
// Voices are cheap (1–2 oscillators per note); long pads carry most of the warmth.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const R = (a, b) => a + Math.random() * (b - a);
export const STEP = 60 / 108 / 4;

// ---------- instruments ----------
function pad(E, out, t, notes, len, vol, cut = 1100) {
  for (const m of notes) {
    E.osc(out, t, len, { type: 'triangle', f: mtof(m), vol, a: Math.min(2.2, len * 0.35), hold: len * 0.3, shape: 'lin', detune: R(-7, 7), filter: { type: 'lowpass', f: cut, q: 0.4 } });
  }
}
function strings(E, out, t, notes, len, vol, cut = 1500) {
  for (const m of notes) {
    E.osc(out, t, len, { type: 'sawtooth', f: mtof(m), vol, a: Math.min(1.5, len * 0.3), hold: len * 0.35, shape: 'lin', detune: R(-9, 9), filter: { type: 'lowpass', f: cut, q: 0.5 } });
  }
}
function harp(E, out, t, m, vol, len = 1.4) {
  const f = mtof(m);
  E.osc(out, t, len, { type: 'triangle', f, vol, a: 0.002 });
  E.osc(out, t, len * 0.35, { type: 'sine', f: f * 2, vol: vol * 0.3, a: 0.002 });
}
function flute(E, out, t, m, len, vol) {
  const f = mtof(m);
  E.osc(out, t, len, { type: 'triangle', f, vol, a: 0.07, hold: len * 0.5, vib: { rate: 5.2, depth: f * 0.006 }, filter: { type: 'lowpass', f: 2600, q: 0.6 } });
  E.osc(out, t, len, { type: 'sine', f: f * 2, vol: vol * 0.18, a: 0.09, hold: len * 0.4 });
  if (len > 0.35) E.noiseV(out, t, Math.min(len, 0.5), { color: 'white', vol: vol * 0.35, a: 0.03, filter: { type: 'bandpass', f: f * 2, q: 6 } }); // breath
}
function choir(E, out, t, m, len, vol) {
  const f = mtof(m);
  E.formant(out, t, len, { f, vol, a: Math.min(1.6, len * 0.35), hold: len * 0.3, shape: 'lin', q: 9, vib: { rate: R(4.5, 5.5), depth: f * 0.007 }, formants: [[800, 1], [1150, 0.5], [2900, 0.15]] });
}
function horn(E, out, t, m, len, vol) {
  const f = mtof(m);
  E.osc(out, t, len, { type: 'sawtooth', f, vol: vol * 0.5, a: 0.08, hold: len * 0.5, filter: { type: 'lowpass', f: 900, f1: 1600, ft: 0.3, q: 0.7 } });
  E.osc(out, t, len, { type: 'triangle', f, vol, a: 0.06, hold: len * 0.5, detune: 5 });
}
function timpani(E, out, t, vol, f = 82) {
  E.osc(out, t, 0.7, { type: 'sine', f: f * 1.2, f1: f, ft: 0.1, vol, a: 0.002 });
  E.noiseV(out, t, 0.25, { color: 'brown', vol: vol * 0.6, a: 0.002, filter: { type: 'lowpass', f: 500 } });
}
function cymbalSwell(E, out, t, len, vol) {
  E.noiseV(out, t, len, { color: 'white', vol, a: len * 0.9, shape: 'lin', filter: { type: 'highpass', f: 5000 } });
}
function bass(E, out, t, m, len, vol) {
  E.osc(out, t, len, { type: 'triangle', f: mtof(m), vol, a: 0.01 });
  E.osc(out, t, len * 0.7, { type: 'sine', f: mtof(m), vol: vol * 0.8, a: 0.02 });
}

// triad from root + quality
const tri = (r, minor) => [r, r + (minor ? 3 : 4), r + 7];

// ---------- TITLE: calm majestic D major, harp arpeggios, pad, horn melody ----------
const TITLE_CH = [[62, 0], [59, 1], [55, 0], [57, 0]];          // D Bm G A (2 bars each)
const TITLE_MEL = [[69, 66], [71, 74], [74, 71], [73, 76]];       // two half-notes per chord
export function titleStep(M, s16, bar, t, out) {
  const E = M.E;
  const [root, minor] = TITLE_CH[(bar >> 1) % 4];
  const ch = tri(root, minor);
  if (s16 === 0 && (bar & 1) === 0) {
    pad(E, out, t, [root - 24, ch[0] - 12, ch[1] - 12, ch[2] - 12], STEP * 32 + 1, 0.045);
    if (bar >= 4) choir(E, out, t + STEP * 2, ch[1], STEP * 30, 0.05);
  }
  // harp: ascending 8ths over two octaves
  if (s16 % 2 === 0) {
    const i = ((bar & 1) * 8 + (s16 >> 1));
    const arp = [ch[0], ch[1], ch[2], ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24, ch[2] + 12];
    const m = (bar & 1) ? arp[7 - (i % 8)] : arp[i % 8];
    harp(E, out, t, m, 0.07 * (s16 === 0 ? 1.3 : 1), 1.3);
  }
  // horn melody during the second half of each 16-bar cycle
  if (bar % 16 >= 8 && s16 === 0) {
    const mel = TITLE_MEL[(bar >> 1) % 4][bar & 1];
    horn(E, out, t, mel, STEP * 15, 0.07);
  }
}

// ---------- INTRO: epic, warm, builds. Dm Bb F C … then sunrise D A Bm G ----------
const INTRO_A = [[50, 1], [46, 0], [53, 0], [48, 0]];
const INTRO_B = [[50, 0], [45, 0], [47, 1], [43, 0]];
const INTRO_MEL_A = [[74, 0, 8], [72, 8, 8], [77, 0, 12], [76, 12, 4], [72, 0, 16], [74, 0, 8], [76, 8, 8], [74, 0, 16]];
const INTRO_MEL_B = [[78, 0, 12], [81, 12, 4], [76, 0, 16], [78, 0, 8], [74, 8, 8], [83, 0, 12], [81, 12, 4], [79, 0, 16]];
export function introStep(M, s16, bar, t, out) {
  const E = M.E;
  const sunrise = bar >= 16;
  const prog = sunrise ? INTRO_B : INTRO_A;
  const [r0, minor] = prog[(bar >> 1) % 4];
  const root = r0 + 12;
  const ch = tri(root, minor);
  const lvl = Math.min(1, 0.45 + bar * 0.035);            // slow crescendo
  if (s16 === 0 && (bar & 1) === 0) {
    const len = STEP * 32 + 1.2;
    pad(E, out, t, [r0 - 12, r0, ch[1], ch[2]], len, 0.05 * lvl, sunrise ? 1500 : 1000);
    choir(E, out, t, ch[0], len, 0.045 * lvl);
    if (bar >= 6) choir(E, out, t + 0.2, ch[2], len, 0.035 * lvl);
    if (bar >= 10) strings(E, out, t, [ch[0] + 12, ch[1] + 12], len, 0.018 * lvl, sunrise ? 2200 : 1500);
    if (bar >= 8) timpani(E, out, t, 0.32 * lvl, mtof(r0 - 12));
    if (bar >= 12 && bar % 4 === 2) cymbalSwell(E, out, t + STEP * 16, STEP * 16, 0.05);
  }
  // harp arpeggios from bar 4 (8ths), 16ths after sunrise
  if (bar >= 4 && (sunrise || s16 % 2 === 0)) {
    const arp = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[2], ch[1]];
    const k = sunrise ? s16 : s16 >> 1;
    harp(E, out, t, arp[k % 8] + 12, (sunrise ? 0.05 : 0.065) * lvl, 1.2);
  }
  if (bar >= 12 && (s16 === 0 || s16 === 10)) bass(E, out, t, r0 - 12, STEP * 8, 0.12 * lvl);
  // melody from bar 8 (horn before sunrise, flute + horn after)
  if (bar >= 8) {
    const mel = sunrise ? INTRO_MEL_B : INTRO_MEL_A;
    const [m, at, len] = mel[bar % 8];
    if (s16 === at) {
      horn(E, out, t, m - 12, STEP * len, 0.06 * lvl);
      if (sunrise) flute(E, out, t, m, STEP * len, 0.08);
    }
  }
}

// ---------- VILLAGE: gentle, cozy G major, flute lead, plucks ----------
const VIL_CH = [[55, 0], [48, 0], [52, 1], [50, 0], [55, 0], [48, 0], [50, 0], [55, 0]]; // G C Em D G C D G
const VIL_MEL = [ // per bar: [s16, midi, lenSteps]
  [[0, 74, 4], [4, 71, 2], [6, 69, 2], [8, 71, 6], [14, 74, 2]],
  [[0, 76, 6], [6, 74, 2], [8, 71, 8]],
  [[0, 69, 4], [4, 71, 2], [6, 74, 2], [8, 79, 4], [12, 78, 4]],
  [[0, 76, 8], [8, 69, 8]],
  [[0, 74, 4], [4, 71, 2], [6, 69, 2], [8, 71, 4], [12, 74, 4]],
  [[0, 79, 6], [6, 78, 2], [8, 76, 8]],
  [[0, 76, 4], [4, 74, 4], [8, 71, 4], [12, 69, 4]],
  [[0, 67, 14]],
];
export function villageStep(M, s16, bar, t, out) {
  const E = M.E;
  const b8 = bar % 8, cyc = (bar >> 3) % 4;
  const [r, minor] = VIL_CH[b8];
  const ch = tri(r, minor);
  if (s16 === 0) pad(E, out, t, [ch[0], ch[1], ch[2]], STEP * 16 + 0.6, 0.026, 900);
  // walking pizzicato-ish bass on 1 and 3
  if (s16 === 0) bass(E, out, t, r - 12, STEP * 5, 0.14);
  if (s16 === 8) bass(E, out, t, r - 5, STEP * 4, 0.09);
  // guitar-ish plucks on the off-beats
  if (s16 === 4 || s16 === 12) for (const m of ch) harp(E, out, t + R(0, 0.012), m + 12, 0.035, 0.5);
  if (s16 === 6 || s16 === 14) harp(E, out, t, ch[2] + 12, 0.025, 0.35);
  // flute melody on cycles 0 and 2, an octave-up harp echo on cycle 1, rest on cycle 3
  const notes = VIL_MEL[b8];
  for (const [at, m, len] of notes) {
    if (at !== s16) continue;
    if (cyc === 0 || cyc === 2) flute(E, out, t, m, STEP * len, cyc === 2 ? 0.085 : 0.075);
    else if (cyc === 1) harp(E, out, t, m + 12, 0.05, 1.0);
  }
  if (cyc === 3 && s16 === 10 && Math.random() < 0.4) flute(E, out, t, ch[2] + 24, STEP * 3, 0.04);
}

// ---------- ENDING: triumphant (8 bars), then serene forever ----------
const END_T_CH = [[50, 0], [55, 0], [57, 0], [50, 0], [47, 1], [55, 0], [57, 0], [50, 0]];  // D G A D Bm G A D
const END_T_MEL = [[[0, 74, 6], [6, 69, 2], [8, 74, 4], [12, 78, 4]], [[0, 79, 8], [8, 78, 4], [12, 76, 4]],
  [[0, 76, 4], [4, 78, 4], [8, 79, 4], [12, 81, 4]], [[0, 86, 16]],
  [[0, 83, 6], [6, 81, 2], [8, 78, 8]], [[0, 79, 4], [4, 81, 4], [8, 83, 8]], [[0, 81, 8], [8, 85, 8]], [[0, 86, 16]]];
const END_S_CH = [[62, 0], [59, 1], [55, 0], [57, 0]];
const END_S_MEL = [[78, 0, 12], [76, 12, 4], [74, 0, 16], [71, 0, 8], [74, 8, 8], [73, 0, 16], [74, 0, 12], [78, 12, 4], [79, 0, 16], [76, 0, 8], [73, 8, 8], [74, 0, 16]];
export function endingStep(M, s16, bar, t, out) {
  const E = M.E;
  if (bar < 8) {
    const [r, minor] = END_T_CH[bar];
    const ch = tri(r, minor);
    if (s16 === 0) {
      strings(E, out, t, [ch[0], ch[1] + 12, ch[2]], STEP * 16 + 0.5, 0.022, 2000);
      choir(E, out, t, ch[0] + 12, STEP * 16 + 0.5, 0.04);
      bass(E, out, t, r - 12, STEP * 8, 0.16);
      timpani(E, out, t, 0.4, mtof(r - 12));
    }
    if (s16 === 8 || s16 === 14) timpani(E, out, t, s16 === 8 ? 0.25 : 0.18, mtof(r - 12));
    if (s16 === 0 || s16 === 10) for (const m of ch) horn(E, out, t, m, STEP * (s16 ? 6 : 9), 0.035);
    for (const [at, m, len] of END_T_MEL[bar]) if (at === s16) { horn(E, out, t, m - 12, STEP * len, 0.07); flute(E, out, t, m, STEP * len, 0.06); }
    if (bar === 7 && s16 === 0) cymbalSwell(E, out, t, STEP * 16, 0.07);
    return;
  }
  // serene
  const sb = bar - 8;
  const [r, minor] = END_S_CH[(sb >> 1) % 4];
  const ch = tri(r, minor);
  if (s16 === 0 && (sb & 1) === 0) {
    pad(E, out, t, [r - 24, ch[0] - 12, ch[1] - 12, ch[2] - 12], STEP * 32 + 1.2, 0.04);
    choir(E, out, t + 0.3, ch[1], STEP * 30, 0.03);
  }
  if (s16 % 4 === 0) {
    const arp = [ch[0], ch[1], ch[2], ch[0] + 12];
    harp(E, out, t, arp[(s16 >> 2) % 4] + ((sb & 1) ? 12 : 0), 0.055, 1.6);
  }
  const [m, at, len] = END_S_MEL[sb % END_S_MEL.length];
  if (s16 === at && sb % 24 < 12) flute(E, out, t, m, STEP * len, 0.07);
}

export const THEMES = { title: titleStep, intro: introStep, village: villageStep, ending: endingStep };
