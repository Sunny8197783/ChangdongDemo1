// Procedural generative music (exploration / battle / boss layers) and ambience (wind bed, birds).

const R = (a, b) => a + Math.random() * (b - a);
const pickR = (arr) => arr[(Math.random() * arr.length) | 0];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const BPM = 108;
const STEP = 60 / BPM / 4;        // 16th note
const LOOKAHEAD = 0.25;

// Exploration: major pentatonic, gentle progression (semitone offsets from tonic)
const PENTA = [0, 2, 4, 7, 9];
const EXPLORE_PROG = [0, 5, 9, 7, 0, 9, 5, 2];
// Battle: aeolian, i - VI - III - VII
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const BATTLE_PROG = [0, 8, 3, 10];

export class Music {
  constructor(E) {
    this.E = E;
    const ctx = E.ctx;
    this.layers = {};
    for (const name of ['explore', 'battle', 'boss']) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(E.music);
      const s = ctx.createGain(); s.gain.value = name === 'explore' ? 0.9 : 0.45; g.connect(s); s.connect(E.musicSend);
      this.layers[name] = { gain: g, level: 0, target: 0 };
    }
    this.step = 0;
    this.nextTime = 0;
    this.started = false;
    this.mode = 'explore';
    this.tonic = 62;               // D4
    this.phraseDeg = 5;            // index into extended pentatonic
    this.phraseNotes = null;
    this.padVoices = [];
    this.silenceUntil = 0;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.nextTime = this.E.now() + 0.15;
    this.setMode('explore', true);
  }

  setMode(mode, instant = false) {
    this.mode = mode;
    const tg = { explore: [1, 0, 0], battle: [0.12, 1.25, 0], boss: [0, 1.25, 1], victory: [0, 0, 0], silent: [0, 0, 0] }[mode] || [1, 0, 0];
    const names = ['explore', 'battle', 'boss'];
    const now = this.E.now();
    names.forEach((n, i) => {
      const L = this.layers[n];
      L.target = tg[i];
      L.gain.gain.cancelScheduledValues(now);
      L.gain.gain.setValueAtTime(L.gain.gain.value, now);
      // battle comes in fast; exploration returns slowly
      const tc = instant ? 0.05 : (tg[i] > L.level ? (n === 'explore' ? 2.5 : 0.6) : (n === 'explore' ? 0.6 : 1.8));
      L.gain.gain.setTargetAtTime(tg[i], now, tc);
    });
  }

  update(realDt) {
    if (!this.started) return;
    const E = this.E, now = E.now();
    // approximate tracked levels (used to skip scheduling inaudible layers)
    for (const n in this.layers) { const L = this.layers[n]; L.level = L.gain.gain.value; }
    if (this.nextTime < now - 0.5) this.nextTime = now + 0.05; // tab was hidden / context suspended
    let guard = 0;
    while (this.nextTime < now + LOOKAHEAD && guard++ < 16) {
      this.schedule(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step++;
    }
  }

  audible(n) { const L = this.layers[n]; return L.target > 0.01 || L.level > 0.01; }

  schedule(step, t) {
    const s16 = step % 16, bar = (step / 16) | 0;
    if (this.audible('explore')) this.exploreStep(s16, bar, t);
    if (this.audible('battle')) this.battleStep(s16, bar, t, step);
    if (this.audible('boss')) this.bossStep(s16, bar, t, step);
  }

  // ---------------- exploration ----------------
  noteFromDeg(deg, base) {
    const oct = Math.floor(deg / 5), i = ((deg % 5) + 5) % 5;
    return base + oct * 12 + PENTA[i];
  }

  exploreStep(s16, bar, t) {
    const E = this.E, out = this.layers.explore.gain;
    // key drift every 16 bars: D -> G -> A -> D (gentle modal feeling)
    if (s16 === 0 && bar % 16 === 0) this.tonic = [62, 67, 64, 62][(bar / 16 | 0) % 4];
    const root = this.tonic + EXPLORE_PROG[(bar >> 1) % EXPLORE_PROG.length];
    // pad: every 2 bars, soft, slow attack
    if (s16 === 0 && bar % 2 === 0) {
      const len = STEP * 32 + 1.2;
      for (const [m, v] of [[root - 24, 0.07], [root - 17, 0.05], [root - 12, 0.035], [root - 10, 0.02]]) {
        E.osc(out, t, len, { type: 'triangle', f: mtof(m), vol: v, a: 2.2, hold: len - 4.5, shape: 'lin', detune: R(-6, 6), filter: { type: 'lowpass', f: 900, q: 0.4 } });
      }
    }
    // bass note on some bar starts
    if (s16 === 0 && Math.random() < 0.45) E.piano(out, t, mtof(root - 24), 0.28, 2.6);
    // piano phrase
    if (s16 === 0 && !this.phraseNotes && t > this.silenceUntil && Math.random() < 0.6) {
      const n = 2 + ((Math.random() * 5) | 0);
      const notes = [];
      let pos = Math.random() < 0.5 ? 0 : 2;
      for (let i = 0; i < n && pos < 16; i++) {
        notes.push(pos);
        pos += pickR([2, 2, 4, 4, 6, 3]);
      }
      this.phraseNotes = notes;
      this.phraseBar = bar;
    }
    if (this.phraseNotes && bar === this.phraseBar && this.phraseNotes.includes(s16)) {
      this.phraseDeg += pickR([-2, -1, -1, 1, 1, 2, 0, 3, -3]);
      if (this.phraseDeg < 3) this.phraseDeg += 3; if (this.phraseDeg > 11) this.phraseDeg -= 3;
      const m = this.noteFromDeg(this.phraseDeg, this.tonic - 12);
      const last = s16 === this.phraseNotes[this.phraseNotes.length - 1];
      E.piano(out, t, mtof(m), R(0.22, 0.32), last ? 2.4 : 1.5);
      if (Math.random() < 0.18) E.piano(out, t, mtof(m - 12 + (Math.random() < 0.5 ? 7 : 4)), 0.12, 1.4);
      if (last) { this.phraseNotes = null; if (Math.random() < 0.35) this.silenceUntil = t + STEP * 16 * R(1, 2.5); }
    }
    if (this.phraseNotes && bar > this.phraseBar) this.phraseNotes = null;
    // occasional high sparkle answer
    if (s16 === 10 && Math.random() < 0.08) {
      const m = this.noteFromDeg(10 + ((Math.random() * 4) | 0), this.tonic - 12);
      E.osc(out, t, 1.8, { type: 'sine', f: mtof(m), vol: 0.06, a: 0.01 });
    }
  }

  // ---------------- battle ----------------
  battleStep(s16, bar, t, step) {
    const E = this.E, out = this.layers.battle.gain;
    const tonic = 50; // D3
    const root = tonic + BATTLE_PROG[(bar >> 1) % BATTLE_PROG.length];
    const third = root + (BATTLE_PROG[(bar >> 1) % 4] === 0 ? 3 : 4);
    // pulsing low strings on 8ths
    if (s16 % 2 === 0) {
      const acc = s16 % 4 === 0 ? 1 : 0.7;
      for (const d of [-8, 8]) E.osc(out, t, STEP * 1.8, { type: 'sawtooth', f: mtof(root - 12), vol: 0.07 * acc, a: 0.01, detune: d, filter: { type: 'lowpass', f: 700, f1: 320, q: 1.5 } });
      if (s16 % 8 === 0) E.osc(out, t, STEP * 7.5, { type: 'sawtooth', f: mtof(root + 7 - 12), vol: 0.035, a: 0.05, filter: { type: 'lowpass', f: 1100, q: 0.7 } });
    }
    // taiko-ish drums
    const kickPat = [0, 3, 6, 8, 11, 14];
    if (kickPat.includes(s16)) {
      const v = s16 === 0 || s16 === 8 ? 0.6 : 0.35;
      E.osc(out, t, 0.32, { type: 'sine', f: 150, f1: 45, ft: 0.12, vol: v, a: 0.001 });
      E.noiseV(out, t, 0.12, { color: 'brown', vol: v * 0.8, a: 0.001, filter: { type: 'lowpass', f: 900 } });
    }
    if (s16 === 4 || s16 === 12) {
      E.noiseV(out, t, 0.1, { color: 'white', vol: 0.12, a: 0.001, filter: { type: 'bandpass', f: 2200, q: 1.2 } });
      E.osc(out, t, 0.08, { type: 'triangle', f: 420, f1: 260, vol: 0.12, a: 0.001 });
    }
    if (s16 % 2 === 1 && Math.random() < 0.35) E.noiseV(out, t, 0.04, { color: 'white', vol: 0.035, a: 0.001, filter: { type: 'highpass', f: 7000 } });
    // fast arpeggio (16ths) in the second bar of every pair
    if ((bar & 1) === 1 || step % 64 >= 48) {
      const arp = [root, third, root + 7, root + 12, root + 7, third];
      const m = arp[s16 % arp.length] + 12;
      E.osc(out, t, STEP * 1.6, { type: 'triangle', f: mtof(m), vol: 0.07, a: 0.003 });
    }
    // heroic melody hint on bar start of every 4 bars
    if (s16 === 0 && bar % 4 === 0) {
      const m = root + 24 + pickR([0, 7, 3]);
      E.osc(out, t, STEP * 6, { type: 'sawtooth', f: mtof(m), vol: 0.03, a: 0.04, hold: STEP * 3, filter: { type: 'lowpass', f: 2000, q: 0.5 } });
      E.osc(out, t, STEP * 6, { type: 'triangle', f: mtof(m), vol: 0.06, a: 0.03, hold: STEP * 3 });
    }
  }

  // ---------------- boss extras ----------------
  bossStep(s16, bar, t, step) {
    const E = this.E, out = this.layers.boss.gain;
    const root = 50 + BATTLE_PROG[(bar >> 1) % BATTLE_PROG.length];
    // relentless low tremolo strings
    E.osc(out, t, STEP * 0.9, { type: 'sawtooth', f: mtof(root - 24), vol: 0.06, a: 0.005, filter: { type: 'lowpass', f: 500, q: 2 } });
    // extra heavy drum hits
    if (s16 % 4 === 2 || s16 === 15) {
      E.osc(out, t, 0.45, { type: 'sine', f: 110, f1: 35, ft: 0.18, vol: 0.45, a: 0.001 });
      E.noiseV(out, t, 0.18, { color: 'brown', vol: 0.4, a: 0.001, filter: { type: 'lowpass', f: 600 } });
    }
    // brass stabs
    if (s16 === 0 || (s16 === 10 && bar % 2 === 1)) {
      for (const m of [root, root + 7, root + 12]) {
        E.osc(out, t, 0.5, { type: 'sawtooth', f: mtof(m - 12), vol: 0.05, a: 0.02, filter: { type: 'lowpass', f: 600, f1: 1800, ft: 0.06, q: 1 } });
      }
    }
    // dissonant high shimmer
    if (s16 === 8 && Math.random() < 0.4) E.osc(out, t, 2, { type: 'sine', f: mtof(root + 37), vol: 0.025, a: 0.6, vib: { rate: 5, depth: 6 } });
  }
}

export class Ambience {
  constructor(E) {
    this.E = E;
    const ctx = E.ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(E.ambience);
    // wind bed
    const src = ctx.createBufferSource(); src.buffer = E.noise.pink; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 0.8;
    const wg = ctx.createGain(); wg.gain.value = 0.55;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoF = ctx.createGain(); lfoF.gain.value = 240;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.113;
    const lfoA = ctx.createGain(); lfoA.gain.value = 0.25;
    lfo.connect(lfoF); lfoF.connect(bp.frequency);
    lfo2.connect(lfoA); lfoA.connect(wg.gain);
    src.connect(bp); bp.connect(wg); wg.connect(this.out);
    // airy high layer
    const src2 = ctx.createBufferSource(); src2.buffer = E.noise.white; src2.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3200; hp.Q.value = 0.5;
    const ag = ctx.createGain(); ag.gain.value = 0.05;
    const lfo3 = ctx.createOscillator(); lfo3.frequency.value = 0.05;
    const lfoH = ctx.createGain(); lfoH.gain.value = 900;
    lfo3.connect(lfoH); lfoH.connect(hp.frequency);
    src2.connect(hp); hp.connect(ag); ag.connect(this.out);
    const t = ctx.currentTime;
    for (const n of [src, src2, lfo, lfo2, lfo3]) n.start(t);
    this.windGain = wg;
    this.gustT = 3;
    this.birdT = R(2, 6);
    this.level = 0;
    this.out.gain.setTargetAtTime(1, t, 1.5);
  }

  update(realDt, opts) {
    const E = this.E, ctx = E.ctx, now = ctx.currentTime;
    const target = opts.level;
    if (Math.abs(target - this.level) > 0.01) {
      this.level = target;
      this.out.gain.setTargetAtTime(target, now, 1.2);
    }
    // gusts
    this.gustT -= realDt;
    if (this.gustT <= 0) {
      this.gustT = R(3, 9);
      const g = R(0.35, 0.85) * (opts.windMul || 1);
      this.windGain.gain.setTargetAtTime(g, now, R(0.8, 2));
    }
    // birds
    if (opts.birds) {
      this.birdT -= realDt;
      if (this.birdT <= 0) { this.birdT = R(3, 10); this.bird(now + 0.05); }
    }
  }

  bird(t) {
    const E = this.E, ctx = E.ctx;
    const pan = ctx.createStereoPanner(); pan.pan.value = R(-0.9, 0.9);
    const g = ctx.createGain(); g.gain.value = R(0.05, 0.12);
    g.connect(pan); pan.connect(E.ambience);
    const send = ctx.createGain(); send.gain.value = 0.6; g.connect(send); send.connect(E.sfxSend);
    const species = (Math.random() * 3) | 0;
    const n = species === 2 ? 2 : 2 + ((Math.random() * 5) | 0);
    const base = R(2400, 4200);
    let tt = t;
    for (let i = 0; i < n; i++) {
      if (species === 0) { // quick up-chirps
        const d = R(0.05, 0.09);
        E.fm(g, tt, d, { f: base * R(0.9, 1.1), f1: base * R(1.2, 1.5), ratio: 1.5, index: 300, vol: 1, a: 0.008 });
        tt += d + R(0.04, 0.1);
      } else if (species === 1) { // descending trill
        const d = 0.045;
        E.fm(g, tt, d, { f: base * (1 - i * 0.04), f1: base * (0.85 - i * 0.04), ratio: 2, index: 150, vol: 0.9, a: 0.005 });
        tt += 0.06;
      } else { // two-note song (dove-ish/cuckoo)
        const d = 0.22;
        E.fm(g, tt, d, { f: base * 0.4 * (i ? 0.84 : 1), f1: base * 0.4 * (i ? 0.8 : 0.98), ratio: 1, index: 40, vol: 0.9, a: 0.03 });
        tt += 0.3;
      }
    }
    setTimeout(() => { try { g.disconnect(); pan.disconnect(); send.disconnect(); } catch (_) { /* */ } }, (tt - t + 1) * 1000);
  }
}
