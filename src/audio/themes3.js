// v3 music themes (DESIGN §11, §8.6) on the Music 16th-note grid (108 BPM):
//   mirwen     — misty harp + flute, a 6/8 lilt (dotted-8th grid), A dorian
//   elderwood  — marimba + low strings, mysterious (E aeolian, a tritone colour)
//   sky        — bright strings + choir pads (ascent and plateau), D lydian
//   final_boss — 3 layers by M.bossPhase: 1 percussion + low brass · 2 + choir + the broken shards' leitmotifs ·
//                3 the title theme, full strings and choir
//   ending_v3  — a soft harp version of the village theme
// Each fn: (M, s16, bar, t, out). M.bossPhase (1..3) and M.motifs (element ids of broken shards) are set by audio.js.
import { pad, strings, harp, flute, choir, horn, timpani, cymbalSwell, bass, tri, STEP } from './themes.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const R = (a, b) => a + Math.random() * (b - a);

function marimba(E, out, t, m, vol) {
  const f = mtof(m);
  E.osc(out, t, 0.5, { type: 'sine', f, vol, a: 0.002 });
  E.osc(out, t, 0.12, { type: 'sine', f: f * 4, vol: vol * 0.25, a: 0.001 });
  E.osc(out, t, 0.06, { type: 'triangle', f: f * 10, vol: vol * 0.08, a: 0.001 });
}
function drum(E, out, t, vol, f0 = 140, f1 = 42) {
  E.osc(out, t, 0.4, { type: 'sine', f: f0, f1, ft: 0.15, vol, a: 0.001 });
  E.noiseV(out, t, 0.14, { color: 'brown', vol: vol * 0.7, a: 0.001, filter: { type: 'lowpass', f: 800 } });
}
function snareRoll(E, out, t, vol) { E.noiseV(out, t, 0.07, { color: 'white', vol, a: 0.001, filter: { type: 'bandpass', f: 2600, q: 1 } }); }
function lowBrass(E, out, t, m, len, vol) {
  const f = mtof(m);
  E.osc(out, t, len, { type: 'sawtooth', f, vol, a: 0.05, hold: len * 0.5, filter: { type: 'lowpass', f: 500, f1: 1300, ft: 0.25, q: 0.9 } });
  E.osc(out, t, len, { type: 'sawtooth', f: f * 0.5, vol: vol * 0.6, a: 0.06, hold: len * 0.5, detune: 6, filter: { type: 'lowpass', f: 400 } });
}

// ---------- MIRWEN: A dorian, 6/8 lilt ----------
const MIR_CH = [[57, 1], [55, 0], [53, 0], [52, 1]];            // Am G F Em (2 bars each)
const MIR_MEL = [[76, 0, 6], [74, 6, 3], [72, 9, 3], [71, 12, 4], [69, 0, 9], [72, 9, 3], [74, 12, 4], [76, 0, 12]];
export function mirwenStep(M, s16, bar, t, out) {
  const E = M.E;
  const [r, minor] = MIR_CH[(bar >> 1) % 4];
  const ch = tri(r, minor);
  if (s16 === 0 && (bar & 1) === 0) {
    pad(E, out, t, [r - 12, ch[1], ch[2], ch[0] + 14], STEP * 32 + 1.4, 0.035, 900);   // the added 9th = mist
    bass(E, out, t, r - 24, STEP * 12, 0.1);
  }
  // harp on the dotted-8th grid (0 3 6 9 12) — the 6/8 lilt
  if (s16 % 3 === 0 && s16 < 15) {
    const arp = [ch[0], ch[2], ch[1] + 12, ch[2] + 12, ch[0] + 24];
    harp(E, out, t + R(0, 0.01), arp[(s16 / 3) | 0] + ((bar & 1) ? 0 : 12), 0.045, 1.5);
  }
  // flute melody every other 8 bars
  if (((bar >> 3) & 1) === 0) { const [m, at, len] = MIR_MEL[bar % 8]; if (s16 === at) flute(E, out, t, m, STEP * len, 0.065); }
  else if (s16 === 6 && Math.random() < 0.3) flute(E, out, t, ch[2] + 24, STEP * 5, 0.035);
  // water drops
  if (s16 === 11 && Math.random() < 0.25) E.osc(out, t, 0.25, { type: 'sine', f: mtof(ch[0] + 36), f1: mtof(ch[0] + 43), ft: 0.05, vol: 0.03, a: 0.002 });
}

// ---------- ELDERWOOD: E aeolian, marimba ostinato + low strings ----------
const ELD_CH = [[52, 1], [48, 0], [50, 0], [47, 1]];             // Em C D Bm
export function elderwoodStep(M, s16, bar, t, out) {
  const E = M.E;
  const [r, minor] = ELD_CH[(bar >> 1) % 4];
  const ch = tri(r, minor);
  if (s16 === 0 && (bar & 1) === 0) {
    strings(E, out, t, [r - 24, r - 12, ch[2] - 12], STEP * 32 + 1, 0.022, 700);
    if (bar % 8 === 6) strings(E, out, t + STEP * 16, [r - 6], STEP * 16, 0.012, 900);   // tritone shadow
  }
  // marimba ostinato (16ths, accented every 3 → a lopsided, searching rhythm)
  const pat = [ch[0], ch[2], ch[1] + 12, ch[2], ch[0] + 12, ch[2]];
  if (s16 % 2 === 0) marimba(E, out, t, pat[(s16 / 2) % pat.length] + 12, s16 % 6 === 0 ? 0.08 : 0.05);
  // low pizzicato pulse
  if (s16 === 0 || s16 === 10) bass(E, out, t, r - 12, STEP * 4, 0.09);
  // sparse wood knock + a high bell call
  if (s16 === 7 && Math.random() < 0.4) E.osc(out, t, 0.06, { type: 'triangle', f: 480, f1: 380, vol: 0.05, a: 0.001, filter: { type: 'bandpass', f: 900, q: 3 } });
  if (s16 === 12 && bar % 4 === 3) harp(E, out, t, ch[2] + 24, 0.04, 2);
}

// ---------- SKY: D lydian, bright strings + choir pads ----------
const SKY_CH = [[50, 0], [52, 0], [47, 1], [55, 0]];             // D E Bm G (E major = the lydian #4)
const SKY_MEL = [[78, 0, 8], [80, 8, 8], [81, 0, 12], [78, 12, 4], [76, 0, 8], [74, 8, 8], [76, 0, 16], [73, 0, 16]];
export function skyStep(M, s16, bar, t, out) {
  const E = M.E;
  const [r, minor] = SKY_CH[(bar >> 1) % 4];
  const ch = tri(r + 12, minor);
  if (s16 === 0 && (bar & 1) === 0) {
    strings(E, out, t, [ch[0], ch[1], ch[2], ch[0] + 12], STEP * 32 + 1, 0.016, 2400);
    choir(E, out, t + 0.1, ch[1], STEP * 30, 0.04);
    bass(E, out, t, r - 12, STEP * 16, 0.08);
  }
  if (s16 % 4 === 2) harp(E, out, t, ch[(s16 >> 2) % 3] + 12, 0.035, 1.2);
  if (bar % 16 >= 4) { const [m, at, len] = SKY_MEL[bar % 8]; if (s16 === at) { flute(E, out, t, m, STEP * len, 0.055); horn(E, out, t, m - 12, STEP * len, 0.03); } }
  if (bar % 8 === 7 && s16 === 0) cymbalSwell(E, out, t, STEP * 16, 0.04);
}

// ---------- FINAL BOSS: D minor, layered by phase ----------
const FB_CH = [[50, 1], [46, 0], [48, 0], [45, 0]];              // Dm Bb C A
const MOTIF = {                                                   // the five oaths' leitmotifs (relative semitones)
  fire: [0, 3, 7, 10], ice: [12, 7, 3, 0], lightning: [0, 7, 12, 7], wind: [0, 2, 4, 7], earth: [0, -5, 0, -2],
  water: [0, 2, 3, 7], nature: [0, 4, 7, 9], light: [0, 4, 7, 12], shadow: [0, 1, 0, -2],
};
const TITLE_MEL = [[69, 66], [71, 74], [74, 71], [73, 76]];
export function finalBossStep(M, s16, bar, t, out) {
  const E = M.E;
  const ph = M.bossPhase || 1;
  const [r, minor] = FB_CH[(bar >> 1) % 4];
  const ch = tri(r, minor);
  // phase 1+: war drums + low brass
  if (s16 === 0 || s16 === 6 || s16 === 10 || (s16 === 14 && bar & 1)) drum(E, out, t, s16 === 0 ? 0.5 : 0.32);
  if (s16 === 4 || s16 === 12) snareRoll(E, out, t, 0.1);
  if (s16 % 2 === 1 && Math.random() < 0.3) snareRoll(E, out, t, 0.03);
  if (s16 === 0 && (bar & 1) === 0) { lowBrass(E, out, t, r - 12, STEP * 12, 0.05); lowBrass(E, out, t, ch[2] - 12, STEP * 12, 0.035); timpani(E, out, t, 0.32, mtof(r - 24)); }
  if (s16 === 8 && (bar & 1) === 1) lowBrass(E, out, t, r - 10, STEP * 6, 0.04);
  // phase 2+: choir + the broken shards' leitmotifs
  if (ph >= 2) {
    if (s16 === 0 && (bar & 1) === 0) { choir(E, out, t, ch[0] + 12, STEP * 30, 0.045); choir(E, out, t + 0.05, ch[2] + 12, STEP * 30, 0.035); }
    const motifs = M.motifs || [];
    if (motifs.length && s16 % 4 === 0 && (bar % 4) >= 2) {
      const el = motifs[(bar >> 2) % motifs.length]; const mo = MOTIF[el] || MOTIF.light;
      horn(E, out, t, r + 12 + mo[(s16 >> 2) % mo.length], STEP * 3.5, 0.045);
    }
  }
  // phase 3: the title theme, orchestral
  if (ph >= 3) {
    if (s16 === 0 && (bar & 1) === 0) strings(E, out, t, [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24], STEP * 32 + 0.6, 0.016, 2600);
    if (s16 === 0) { const mel = TITLE_MEL[(bar >> 1) % 4][bar & 1]; horn(E, out, t, mel - 3, STEP * 15, 0.06); flute(E, out, t, mel + 9, STEP * 15, 0.045); }
    if (bar % 8 === 7 && s16 === 0) cymbalSwell(E, out, t, STEP * 16, 0.06);
  }
}

// ---------- ENDING v3: the village theme on a soft harp ----------
const VIL_CH = [[55, 0], [48, 0], [52, 1], [50, 0], [55, 0], [48, 0], [50, 0], [55, 0]];
const VIL_MEL = [
  [[0, 74, 4], [4, 71, 2], [6, 69, 2], [8, 71, 6], [14, 74, 2]], [[0, 76, 6], [6, 74, 2], [8, 71, 8]],
  [[0, 69, 4], [4, 71, 2], [6, 74, 2], [8, 79, 4], [12, 78, 4]], [[0, 76, 8], [8, 69, 8]],
  [[0, 74, 4], [4, 71, 2], [6, 69, 2], [8, 71, 4], [12, 74, 4]], [[0, 79, 6], [6, 78, 2], [8, 76, 8]],
  [[0, 76, 4], [4, 74, 4], [8, 71, 4], [12, 69, 4]], [[0, 67, 14]],
];
export function endingV3Step(M, s16, bar, t, out) {
  const E = M.E;
  const b8 = bar % 8;
  const [r, minor] = VIL_CH[b8];
  const ch = tri(r, minor);
  if (s16 === 0) { pad(E, out, t, [ch[0] - 12, ch[1], ch[2]], STEP * 16 + 0.8, 0.028, 800); bass(E, out, t, r - 12, STEP * 8, 0.07); }
  if (s16 % 2 === 0) harp(E, out, t, [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1] + 12, ch[2] + 12, ch[1]][s16 >> 1] + 12, 0.032, 1.6);
  for (const [at, m, len] of VIL_MEL[b8]) if (at === s16) { harp(E, out, t, m + 12, 0.07, Math.max(1.2, STEP * len * 1.5)); if ((bar >> 3) & 1) flute(E, out, t, m, STEP * len, 0.045); }
  if (b8 === 7 && s16 === 8 && (bar >> 3) % 2) choir(E, out, t, ch[1] + 12, STEP * 8, 0.03);
}

export const THEMES3 = { mirwen: mirwenStep, elderwood: elderwoodStep, sky: skyStep, final_boss: finalBossStep, ending_v3: endingV3Step };
/** Layer gains for audio/music.js MIX. */
export const MIX3 = { mirwen: { mirwen: 1.5 }, elderwood: { elderwood: 1.45 }, sky: { sky: 1.5 }, final_boss: { final_boss: 1.35 }, ending_v3: { ending_v3: 1.5 } };
