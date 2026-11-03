// v3 sound recipes (DESIGN §11): the four new elements (cast / impact / explode), class weapon sfx, UI cues, reaction
// family cues + resonance / break, boss voices, and the misc cues other owners call (world, enemies, magic).
// Same recipe signature as sounds.js: (E, out, t, pitch) => dur | {dur, rev}. Node budget: frequent sounds ≤ ~6 voices.

const R = (a, b) => a + Math.random() * (b - a);
const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3];

function bell(E, o, t, f, vol, len, ratio = 2.76) {
  E.fm(o, t, len, { f, ratio, index: f * 0.9, vol, a: 0.002 });
  E.osc(o, t, len * 1.2, { type: 'sine', f: f * 0.5, vol: vol * 0.3, a: 0.01 });
}
function choirAh(E, o, t, f, vol, len, a = 0.25) {
  E.formant(o, t, len, { f, vol, a, hold: Math.max(0, len - a - 0.5), shape: 'lin', q: 9, vib: { rate: 5, depth: f * 0.008 }, formants: [[800, 1], [1150, 0.55], [2900, 0.18]] });
}
function swish(E, o, t, dur, vol, f0, f1, q = 1.2, color = 'pink', peak = 0.35) {
  E.noiseV(o, t, dur, { color, vol, a: dur * peak, filter: { type: 'bandpass', f: f0, f1, ft: dur, q } });
}
function thud(E, o, t, p, f0, f1, dur, vol) {
  E.osc(o, t, dur, { type: 'sine', f: f0 * p, f1: f1 * p, ft: dur * 0.6, vol, a: 0.001 });
  E.noiseV(o, t, Math.min(0.12, dur), { color: 'brown', vol: vol * 0.6, a: 0.001, filter: { type: 'lowpass', f: 700 } });
}
function chimes(E, o, t, p, base, n, step, vol, len = 0.6) {
  for (let i = 0; i < n; i++) E.osc(o, t + i * step * R(0.8, 1.2), len, { type: i % 2 ? 'triangle' : 'sine', f: base * p * PENTA[(i * 2 + ((Math.random() * 3) | 0)) % PENTA.length], vol: vol * R(0.6, 1), a: 0.002 });
}
function bubbles(E, o, t, p, n, vol) {
  for (let i = 0; i < n; i++) { const f = R(500, 1300) * p; E.osc(o, t + i * R(0.02, 0.05), 0.06, { type: 'sine', f, f1: f * R(1.8, 2.6), ft: 0.05, vol: vol * R(0.5, 1), a: 0.002 }); }
}
function brassStab(E, o, t, f, len, vol) {
  E.osc(o, t, len, { type: 'sawtooth', f, vol, a: 0.02, hold: len * 0.3, filter: { type: 'lowpass', f: 600, f1: 2600, ft: 0.06, q: 1 } });
  E.osc(o, t, len, { type: 'triangle', f, vol: vol * 1.1, a: 0.01, detune: 7 });
}

export const SFX3 = {
  // ---------------- WATER: bubble pops + pitched splash / wet slap + droplet chimes / wave crash ----------------
  cast_water(E, o, t, p) {
    bubbles(E, o, t, p, 5, 0.18);
    E.noiseV(o, t + 0.04, 0.32, { color: 'white', vol: 0.32, a: 0.02, filter: { type: 'bandpass', f: 2600 * p, f1: 900 * p, q: 1.4 } });
    E.osc(o, t, 0.25, { type: 'sine', f: 520 * p, f1: 260 * p, vol: 0.12, a: 0.01 });
    return { dur: 0.45, rev: 0.4 };
  },
  impact_water(E, o, t, p) {
    E.noiseV(o, t, 0.16, { color: 'pink', vol: 0.55, a: 0.001, filter: { type: 'lowpass', f: 2400 * p, f1: 600, q: 0.8 } });
    thud(E, o, t, p, 180, 70, 0.14, 0.3);
    chimes(E, o, t + 0.05, p, 1568, 3, 0.05, 0.06, 0.4);
    return { dur: 0.5, rev: 0.35 };
  },
  explode_water(E, o, t, p) {
    E.noiseV(o, t, 1.3, { color: 'pink', vol: 0.75, a: 0.35, shape: 'lin', filter: { type: 'lowpass', f: 500 * p, pts: [[0.4, 3200 * p], [1.3, 400 * p]], q: 0.7 } });
    E.osc(o, t, 0.9, { type: 'sine', f: 90 * p, f1: 40 * p, vol: 0.4, a: 0.05 });
    bubbles(E, o, t + 0.35, p * 0.8, 6, 0.1);
    return { dur: 1.5, rev: 0.7 };
  },
  // ---------------- NATURE: wooden knock + leaf rustle / thorny pluck / bloom (harp gliss + pop) ----------------
  cast_nature(E, o, t, p) {
    E.osc(o, t, 0.08, { type: 'triangle', f: 380 * p, f1: 300 * p, vol: 0.35, a: 0.001, filter: { type: 'bandpass', f: 900, q: 3 } });
    E.osc(o, t + 0.07, 0.07, { type: 'triangle', f: 460 * p, f1: 360 * p, vol: 0.25, a: 0.001, filter: { type: 'bandpass', f: 1100, q: 3 } });
    E.noiseV(o, t + 0.02, 0.35, { color: 'crackle', vol: 0.18, a: 0.08, rate: 1.6, filter: { type: 'highpass', f: 2500 } });
    return { dur: 0.45, rev: 0.3 };
  },
  impact_nature(E, o, t, p) {
    E.osc(o, t, 0.22, { type: 'sawtooth', f: 660 * p, f1: 520 * p, vol: 0.14, a: 0.001, filter: { type: 'lowpass', f: 3200, f1: 900, q: 2 } });
    E.osc(o, t, 0.3, { type: 'triangle', f: 330 * p, vol: 0.18, a: 0.001 });
    E.noiseV(o, t, 0.05, { color: 'white', vol: 0.18, a: 0.001, filter: { type: 'highpass', f: 4000 } });
    return { dur: 0.35, rev: 0.3 };
  },
  explode_nature(E, o, t, p) {
    for (let i = 0; i < 8; i++) E.osc(o, t + i * 0.035, 0.7, { type: 'triangle', f: 392 * p * PENTA[i], vol: 0.07, a: 0.002 });
    E.osc(o, t + 0.32, 0.12, { type: 'sine', f: 220 * p, f1: 880 * p, ft: 0.08, vol: 0.25, a: 0.001 });
    E.noiseV(o, t + 0.3, 0.5, { color: 'pink', vol: 0.22, a: 0.01, filter: { type: 'bandpass', f: 1800, q: 0.8 } });
    return { dur: 1.1, rev: 0.6 };
  },
  // ---------------- LIGHT: bell + choir "ah" / crystalline ring / pillar (brass stab + shimmer) ----------------
  cast_light(E, o, t, p) {
    bell(E, o, t, 1046.5 * p, 0.09, 1.0);
    choirAh(E, o, t, 523.25 * p, 0.06, 0.7, 0.08);
    return { dur: 1.1, rev: 0.7 };
  },
  impact_light(E, o, t, p) {
    for (const [m, v] of [[1, 0.12], [2.01, 0.06], [3.02, 0.04], [4.2, 0.025]]) E.osc(o, t, 0.6 / m + 0.15, { type: 'sine', f: 1318 * p * m, vol: v, a: 0.001 });
    E.noiseV(o, t, 0.05, { color: 'white', vol: 0.12, a: 0.001, filter: { type: 'highpass', f: 6000 } });
    return { dur: 0.7, rev: 0.6 };
  },
  explode_light(E, o, t, p) {
    brassStab(E, o, t, 261.6 * p, 0.6, 0.14); brassStab(E, o, t, 392 * p, 0.6, 0.1);
    chimes(E, o, t + 0.1, p, 2093, 7, 0.04, 0.05, 0.8);
    E.noiseV(o, t, 1.2, { color: 'white', vol: 0.08, a: 0.4, filter: { type: 'bandpass', f: 4000, f1: 9000, q: 1.5 } });
    return { dur: 1.4, rev: 0.8 };
  },
  // ---------------- SHADOW: reverse whoosh + low formant / muted thud + raven caw / implosion ----------------
  cast_shadow(E, o, t, p) {
    E.noiseV(o, t, 0.45, { color: 'pink', vol: 0.5, a: 0.4, shape: 'lin', filter: { type: 'bandpass', f: 300 * p, f1: 1400 * p, q: 1.5 } });
    E.formant(o, t + 0.05, 0.4, { f: 98 * p, vol: 0.12, a: 0.15, formants: [[400, 1], [800, 0.5]], q: 7 });
    return { dur: 0.55, rev: 0.5 };
  },
  impact_shadow(E, o, t, p) {
    thud(E, o, t, p, 140, 50, 0.16, 0.38);
    E.fm(o, t + 0.03, 0.18, { f: 820 * p, f1: 560 * p, ratio: 1.41, index: 900, vol: 0.06, a: 0.005 });   // caw-ish
    return { dur: 0.35, rev: 0.4 };
  },
  explode_shadow(E, o, t, p) {
    E.noiseV(o, t, 0.6, { color: 'pink', vol: 0.55, a: 0.55, shape: 'lin', filter: { type: 'lowpass', f: 300 * p, f1: 2600 * p, q: 1 } });   // reversed swell
    E.osc(o, t + 0.55, 0.9, { type: 'sine', f: 110 * p, f1: 28 * p, ft: 0.6, vol: 0.55, a: 0.002 });                                       // sub drop
    E.noiseV(o, t + 0.55, 0.15, { color: 'brown', vol: 0.4, a: 0.001, filter: { type: 'lowpass', f: 500 } });
    return { dur: 1.5, rev: 0.6 };
  },
  // ---------------- class weapons ----------------
  bow_draw(E, o, t, p) {
    E.noiseV(o, t, 0.45, { color: 'crackle', vol: 0.16, a: 0.3, rate: 0.5, filter: { type: 'bandpass', f: 900 * p, f1: 1600 * p, q: 2 } });
    E.osc(o, t, 0.45, { type: 'triangle', f: 120 * p, f1: 160 * p, vol: 0.05, a: 0.3 });
    return 0.5;
  },
  bow_release(E, o, t, p) {
    E.osc(o, t, 0.12, { type: 'triangle', f: 210 * p, f1: 120 * p, vol: 0.32, a: 0.001 });
    swish(E, o, t + 0.01, 0.12, 0.4, 2400 * p, 5200 * p, 1.6, 'white', 0.2);
    return { dur: 0.25, rev: 0.15 };
  },
  arrow_whizz(E, o, t, p) { swish(E, o, t, 0.35, 0.3, 3000 * p, 1400 * p, 4, 'white', 0.5); return { dur: 0.4, rev: 0.2 }; },
  hammer_swing(E, o, t, p) { swish(E, o, t, 0.42, 0.9, 180 * p, 900 * p, 1.0, 'pink', 0.5); E.osc(o, t, 0.4, { type: 'sine', f: 70 * p, f1: 50 * p, vol: 0.18, a: 0.15 }); return { dur: 0.45, rev: 0.15 }; },
  hammer_hit(E, o, t, p) {
    thud(E, o, t, p, 120, 38, 0.4, 0.75);
    E.noiseV(o, t, 0.25, { color: 'crackle', vol: 0.35, a: 0.002, filter: { type: 'bandpass', f: 1200, q: 0.8 } });
    for (const m of [1, 2.4, 3.9]) E.osc(o, t, 0.3, { type: 'triangle', f: 330 * p * m, vol: 0.05, a: 0.001 });
    return { dur: 0.55, rev: 0.3 };
  },
  shield_block(E, o, t, p) {
    for (const [m, v] of [[1, 0.2], [2.32, 0.12], [2.76, 0.1], [3.89, 0.06]]) E.osc(o, t, 0.5, { type: m === 1 ? 'triangle' : 'sine', f: 520 * p * m, vol: v, a: 0.0008 });
    thud(E, o, t, p, 160, 80, 0.12, 0.35);
    return { dur: 0.6, rev: 0.35 };
  },
  dagger_swish(E, o, t, p) {
    swish(E, o, t, 0.11, 0.55, 1800 * p, 6000 * p, 1.8, 'white', 0.3);
    swish(E, o, t + 0.08, 0.1, 0.45, 2200 * p, 6800 * p, 1.8, 'white', 0.3);
    return { dur: 0.22, rev: 0.1 };
  },
  totem_rattle(E, o, t, p) {
    for (let i = 0; i < 6; i++) E.osc(o, t + i * 0.035, 0.05, { type: 'triangle', f: R(700, 1100) * p, vol: 0.12, a: 0.001, filter: { type: 'bandpass', f: 1500, q: 4 } });
    bell(E, o, t + 0.12, 1568 * p, 0.05, 0.8);
    return { dur: 0.9, rev: 0.5 };
  },
  // ---------------- UI ----------------
  level_up(E, o, t, p) {
    const D = 293.66 * p;
    brassStab(E, o, t, D, 0.35, 0.09); brassStab(E, o, t + 0.16, D * 4 / 3, 0.35, 0.09); brassStab(E, o, t + 0.32, D * 1.5, 0.9, 0.11);
    for (let i = 0; i < 8; i++) E.osc(o, t + 0.3 + i * 0.045, 0.9, { type: 'triangle', f: D * 2 * PENTA[i], vol: 0.05, a: 0.002 });
    return { dur: 1.5, rev: 0.7 };
  },
  skill_learn(E, o, t, p) { chimes(E, o, t, p, 1318, 5, 0.04, 0.09, 0.8); bell(E, o, t + 0.18, 2637 * p, 0.05, 0.9); return { dur: 1.1, rev: 0.7 }; },
  skill_unlearn(E, o, t, p) { for (let i = 0; i < 4; i++) E.osc(o, t + i * 0.05, 0.4, { type: 'triangle', f: 1046 * p * PENTA[4 - i], vol: 0.07, a: 0.002 }); return { dur: 0.6, rev: 0.4 }; },
  tree_open(E, o, t, p) {
    swish(E, o, t, 0.6, 0.35, 300 * p, 1800 * p, 0.9, 'pink', 0.5);
    for (const m of [1, 1.5, 2]) E.osc(o, t + 0.1, 1.4, { type: 'triangle', f: 261.6 * p * m, vol: 0.04, a: 0.4, shape: 'lin', filter: { type: 'lowpass', f: 1600 } });
    return { dur: 1.6, rev: 0.8 };
  },
  slot_equip(E, o, t, p) { E.osc(o, t, 0.08, { type: 'square', f: 880 * p, f1: 1320 * p, vol: 0.06, a: 0.001, filter: { type: 'lowpass', f: 4000 } }); E.osc(o, t + 0.06, 0.2, { type: 'sine', f: 1760 * p, vol: 0.08, a: 0.001 }); return 0.3; },
  xp_tick(E, o, t, p) { E.osc(o, t, 0.06, { type: 'sine', f: 1975 * p, vol: 0.05, a: 0.001 }); return 0.1; },
  codex_new(E, o, t, p) { chimes(E, o, t, p, 880, 4, 0.06, 0.08, 0.9); swish(E, o, t, 0.4, 0.15, 2000, 6000, 1, 'white', 0.4); return { dur: 1, rev: 0.6 }; },
  regen_start(E, o, t, p) { for (let i = 0; i < 3; i++) E.osc(o, t + i * 0.08, 0.5, { type: 'sine', f: 784 * p * PENTA[i * 2], vol: 0.045, a: 0.02 }); return { dur: 0.7, rev: 0.6 }; },
  gate_travel(E, o, t, p) {
    E.noiseV(o, t, 1.2, { color: 'pink', vol: 0.4, a: 0.6, shape: 'lin', filter: { type: 'bandpass', f: 300 * p, f1: 3000 * p, q: 1.2 } });
    chimes(E, o, t + 0.4, p, 1046, 6, 0.06, 0.06, 0.9);
    return { dur: 1.4, rev: 0.9 };
  },
  gate_awaken(E, o, t, p) { bell(E, o, t, 523 * p, 0.12, 2); choirAh(E, o, t + 0.1, 261.6 * p, 0.06, 1.6, 0.4); return { dur: 2.2, rev: 1 }; },
  ui_deny(E, o, t, p) { E.osc(o, t, 0.14, { type: 'square', f: 220 * p, f1: 160 * p, vol: 0.06, a: 0.001, filter: { type: 'lowpass', f: 1500 } }); E.osc(o, t + 0.09, 0.14, { type: 'square', f: 180 * p, f1: 130 * p, vol: 0.06, a: 0.001, filter: { type: 'lowpass', f: 1500 } }); return 0.3; },
  shrine_seed(E, o, t, p) { chimes(E, o, t, p, 1046, 8, 0.05, 0.08, 1.2); bell(E, o, t + 0.4, 523 * p, 0.08, 1.6); return { dur: 2, rev: 1 }; },
  shrine_found(E, o, t, p) { choirAh(E, o, t, 392 * p, 0.07, 1.4, 0.3); chimes(E, o, t + 0.2, p, 1568, 4, 0.07, 0.05); return { dur: 1.6, rev: 1 }; },
  holy_chime(E, o, t, p) { bell(E, o, t, 1318 * p, 0.09, 1.4); bell(E, o, t + 0.12, 1975 * p, 0.05, 1.2); return { dur: 1.6, rev: 0.9 }; },
  crystal(E, o, t, p) { for (const m of [1, 1.5, 2.01]) E.osc(o, t, 0.8, { type: 'sine', f: 1568 * p * m, vol: 0.05, a: 0.001 }); return { dur: 0.9, rev: 0.7 }; },
  // ---------------- reactions (family cues; rx_<id> resolves to these with a per-id pitch) ----------------
  rx_burst(E, o, t, p) { thud(E, o, t, p, 160, 45, 0.45, 0.55); E.noiseV(o, t, 0.4, { color: 'pink', vol: 0.4, a: 0.002, filter: { type: 'lowpass', f: 3000 * p, f1: 500 } }); chimes(E, o, t + 0.04, p, 1046, 3, 0.04, 0.06); return { dur: 0.7, rev: 0.5 }; },
  rx_control(E, o, t, p) { E.osc(o, t, 0.5, { type: 'square', f: 330 * p, vol: 0.05, a: 0.002, vib: { rate: 22, depth: 40 }, filter: { type: 'lowpass', f: 2200, f1: 700, q: 3 } }); chimes(E, o, t, p, 1318, 3, 0.05, 0.06); return { dur: 0.7, rev: 0.5 }; },
  rx_spread(E, o, t, p) { swish(E, o, t, 0.6, 0.5, 400 * p, 2600 * p, 1, 'pink', 0.3); chimes(E, o, t + 0.1, p, 880, 4, 0.06, 0.05); return { dur: 0.8, rev: 0.6 }; },
  rx_surface(E, o, t, p) { E.noiseV(o, t, 0.8, { color: 'pink', vol: 0.4, a: 0.1, filter: { type: 'bandpass', f: 600 * p, f1: 1500 * p, q: 1 } }); E.osc(o, t, 0.6, { type: 'sine', f: 110 * p, vol: 0.2, a: 0.05 }); return { dur: 0.9, rev: 0.6 }; },
  rx_blessing(E, o, t, p) { bell(E, o, t, 784 * p, 0.08, 1.2); choirAh(E, o, t, 392 * p, 0.05, 0.9, 0.1); return { dur: 1.3, rev: 0.9 }; },
  rx_curse(E, o, t, p) { E.formant(o, t, 0.7, { f: 82 * p, f1: 70 * p, vol: 0.14, a: 0.05, formants: [[350, 1], [700, 0.6], [2400, 0.1]], q: 8 }); E.osc(o, t, 0.6, { type: 'sine', f: 233 * p, f1: 220 * p, vol: 0.05, a: 0.05, detune: 30 }); return { dur: 0.9, rev: 0.6 }; },
  resonance(E, o, t, p) { const b = 523.25 * p; for (const [i, m] of [[0, 1], [1, 5 / 4], [2, 3 / 2]]) { bell(E, o, t + i * 0.09, b * m, 0.08, 1.2); } bell(E, o, t + 0.3, b * 2, 0.06, 1.4); return { dur: 1.6, rev: 0.9 }; },
  break_gong(E, o, t, p) {
    for (const [m, v] of [[1, 0.3], [1.48, 0.16], [2.1, 0.1], [2.76, 0.08]]) E.osc(o, t, 2.2 / m, { type: 'sine', f: 82 * p * m, vol: v, a: 0.002, vib: { rate: 4.5, depth: 1.2 } });
    E.noiseV(o, t, 0.4, { color: 'white', vol: 0.18, a: 0.001, filter: { type: 'highpass', f: 5000 } });   // glass
    for (let i = 0; i < 6; i++) E.osc(o, t + 0.02 + i * 0.03, 0.4, { type: 'sine', f: R(3000, 6000) * p, vol: 0.03, a: 0.001 });
    return { dur: 2.4, rev: 0.8 };
  },
  lock_strip(E, o, t, p) { E.noiseV(o, t, 0.3, { color: 'white', vol: 0.25, a: 0.001, filter: { type: 'bandpass', f: 3500 * p, q: 1 } }); chimes(E, o, t, p, 1568, 4, 0.03, 0.07); return { dur: 0.6, rev: 0.6 }; },
  gift_use(E, o, t, p) { choirAh(E, o, t, 523 * p, 0.08, 0.8, 0.05); swish(E, o, t, 0.5, 0.4, 600, 4000, 1, 'pink', 0.3); bell(E, o, t + 0.2, 1046 * p, 0.08, 1); return { dur: 1.1, rev: 0.9 }; },
  check_start(E, o, t, p) { thud(E, o, t, p, 90, 40, 0.6, 0.5); E.osc(o, t, 1.2, { type: 'sawtooth', f: 110 * p, f1: 220 * p, vol: 0.05, a: 0.4, filter: { type: 'lowpass', f: 900 } }); return { dur: 1.3, rev: 0.6 }; },
  // ---------------- boss voices (P1) ----------------
  hydra_roar(E, o, t, p) {
    for (const [i, f] of [[0, 92], [1, 118], [2, 74]]) E.formant(o, t + i * 0.22, 1.1, { f: f * p, f1: f * p * 0.7, vol: 0.18, a: 0.08, formants: [[500, 1], [900, 0.6], [2200, 0.2]], q: 5, vib: { rate: 9, depth: 6 } });
    E.noiseV(o, t, 1.4, { color: 'pink', vol: 0.3, a: 0.2, filter: { type: 'lowpass', f: 900 } });
    return { dur: 1.8, rev: 0.8 };
  },
  treant_groan(E, o, t, p) {
    E.osc(o, t, 1.8, { type: 'sawtooth', f: 55 * p, f1: 42 * p, vol: 0.12, a: 0.4, filter: { type: 'lowpass', f: 400, q: 6 }, vib: { rate: 3, depth: 3 } });
    E.noiseV(o, t + 0.2, 1.4, { color: 'crackle', vol: 0.3, a: 0.3, rate: 0.35, filter: { type: 'bandpass', f: 500, q: 1.5 } });
    return { dur: 2, rev: 0.7 };
  },
  nox_voice(E, o, t, p) { E.formant(o, t, 1.0, { f: 73 * p, f1: 65 * p, vol: 0.16, a: 0.1, formants: [[420, 1, 380], [1100, 0.5, 800], [2500, 0.12]], q: 8 }); E.fm(o, t + 0.5, 0.25, { f: 700 * p, f1: 480 * p, ratio: 1.41, index: 700, vol: 0.05 }); return { dur: 1.2, rev: 0.7 }; },
  kalis_voice(E, o, t, p) { E.formant(o, t, 0.9, { f: 160 * p, f1: 240 * p, vol: 0.12, a: 0.7, shape: 'lin', formants: [[700, 1], [1200, 0.6], [2600, 0.2]], q: 9 }); for (const m of [1, 1.5]) E.osc(o, t, 1, { type: 'sine', f: 1046 * p * m, vol: 0.03, a: 0.8, shape: 'lin' }); return { dur: 1.1, rev: 0.9 }; },
  wyrm_roar(E, o, t, p) {
    E.osc(o, t, 2.4, { type: 'sawtooth', f: 46 * p, f1: 30 * p, vol: 0.2, a: 0.25, filter: { type: 'lowpass', f: 300, q: 4 }, vib: { rate: 11, depth: 4 } });
    E.osc(o, t, 2.4, { type: 'sine', f: 32 * p, f1: 24 * p, vol: 0.4, a: 0.2 });
    for (const f of [220, 233, 311]) choirAh(E, o, t + 0.3, f * p, 0.04, 2.0, 0.5);   // dissonant choir
    E.noiseV(o, t, 2, { color: 'brown', vol: 0.4, a: 0.3, filter: { type: 'lowpass', f: 600 } });
    return { dur: 2.6, rev: 0.9 };
  },
  // ---------------- misc cues used by world / enemies / story ----------------
  wolf_howl(E, o, t, p) { E.formant(o, t, 1.5, { f: 420 * p, f1: 560 * p, ft: 0.5, vol: 0.12, a: 0.2, shape: 'lin', formants: [[700, 1], [1100, 0.4]], q: 9, vib: { rate: 5, depth: 8 } }); return { dur: 1.6, rev: 0.9 }; },
  splash(E, o, t, p) { E.noiseV(o, t, 0.45, { color: 'white', vol: 0.4, a: 0.005, filter: { type: 'bandpass', f: 1800 * p, f1: 500 * p, q: 0.9 } }); bubbles(E, o, t + 0.1, p, 4, 0.08); return { dur: 0.6, rev: 0.4 }; },
  throw(E, o, t, p) { swish(E, o, t, 0.25, 0.5, 500 * p, 2400 * p, 1.2, 'pink', 0.4); return { dur: 0.3, rev: 0.15 }; },
  swing(E, o, t, p) { swish(E, o, t, 0.3, 0.7, 300 * p, 1800 * p, 1.2, 'pink', 0.45); return { dur: 0.32, rev: 0.12 }; },
  rock_smash(E, o, t, p) { thud(E, o, t, p, 110, 40, 0.5, 0.6); E.noiseV(o, t, 0.6, { color: 'crackle', vol: 0.45, a: 0.003, rate: 0.7, filter: { type: 'bandpass', f: 1000, q: 0.7 } }); return { dur: 0.8, rev: 0.4 }; },
  vine_hit(E, o, t, p) { E.noiseV(o, t, 0.2, { color: 'crackle', vol: 0.3, a: 0.002, rate: 1.4, filter: { type: 'bandpass', f: 2200, q: 1 } }); E.osc(o, t, 0.15, { type: 'triangle', f: 240 * p, f1: 170 * p, vol: 0.15, a: 0.001 }); return 0.3; },
  firework(E, o, t, p) { E.noiseV(o, t, 0.6, { color: 'pink', vol: 0.4, a: 0.002, filter: { type: 'lowpass', f: 1600 * p, f1: 300 } }); E.noiseV(o, t + 0.05, 0.9, { color: 'crackle', vol: 0.18, a: 0.05, rate: 1.8, filter: { type: 'highpass', f: 3000 } }); return { dur: 1.1, rev: 0.9 }; },
};

/** Per-reaction cue table: [recipe, pitch]. Classic ids keep their v2 sounds; every other id gets a distinct pitch on its
 *  family recipe; an id not listed falls back to rx_<family> (combat payload `family`) → 'reaction'. */
export const RX_CUES = {
  shatter: ['shatter', 1], melt: ['steam', 1], evaporate: ['steam', 0.9], steam_burst: ['steam', 0.8],
  electrocute: ['thunder', 1.1], overload: ['thunder', 0.8], superconduct: ['thunder', 1.4],
  magma: ['explode_earth', 0.9], skyslam: ['explode_earth', 0.7], swirl: ['explode_wind', 1], updraft: ['explode_wind', 1.2],
  flashfreeze: ['impact_ice', 1], freeze_water: ['freeze_water', 1], electro_water: ['rx_surface', 1.3],
  fire_tornado: ['rx_surface', 0.9], blizzard: ['rx_surface', 1.15], storm_tornado: ['rx_surface', 1.25], fire_wave: ['rx_spread', 0.9],
  infusion: ['rx_spread', 1.1], mudslide: ['rx_control', 0.7], crystallize: ['crystal', 1], grounded: ['rx_control', 0.8],
  sandstorm: ['rx_surface', 0.8], obsidian: ['rx_surface', 0.7],
  bloom: ['explode_nature', 1], wildfire: ['rx_spread', 0.85], burgeon: ['rx_burst', 1.15], hyperbloom: ['explode_nature', 1.3],
  quicken: ['rx_control', 1.3], frostbloom: ['rx_control', 1.15], entangle: ['impact_nature', 0.8], pollen: ['rx_spread', 1.3],
  photosynthesis: ['rx_blessing', 0.9], rot: ['rx_curse', 1.2], sanctify: ['rx_blessing', 1.1], holywater: ['rx_blessing', 1.25],
  prism: ['explode_light', 1.2], radiant_burst: ['explode_light', 1], judgment: ['explode_light', 0.75], aurora: ['rx_spread', 1.45],
  purify: ['holy_chime', 1], eclipse: ['explode_shadow', 0.9], necroflame: ['rx_curse', 0.9], miasma: ['rx_curse', 0.8],
  voidfrost: ['rx_curse', 1.35], void_rift: ['explode_shadow', 1.2], blackbolt: ['rx_curse', 1.5], break: ['break_gong', 1], resonance: ['resonance', 1],
};
export const RX_FAMILY = { burst: 'rx_burst', control: 'rx_control', spread: 'rx_spread', surface: 'rx_surface', blessing: 'rx_blessing', curse: 'rx_curse', universal: 'resonance' };
