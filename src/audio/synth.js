// Low-level WebAudio synthesis engine: buses, noise buffers, reverb, and voice primitives.
// Parametrized by an AudioContext (or OfflineAudioContext, for tests).

const SR_NOISE_SEC = 2.5;

function makeNoiseBuffers(ctx) {
  const sr = ctx.sampleRate, n = Math.floor(sr * SR_NOISE_SEC);
  const mk = () => ctx.createBuffer(1, n, sr);
  const white = mk(), pink = mk(), brown = mk(), crackle = mk(), ticks = mk();
  const w = white.getChannelData(0), p = pink.getChannelData(0), b = brown.getChannelData(0);
  const c = crackle.getChannelData(0), t = ticks.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.random() * 2 - 1;
    w[i] = r;
    // Paul Kellet pink filter
    b0 = 0.99886 * b0 + r * 0.0555179; b1 = 0.99332 * b1 + r * 0.0750759;
    b2 = 0.969 * b2 + r * 0.153852; b3 = 0.8665 * b3 + r * 0.3104856;
    b4 = 0.55 * b4 + r * 0.5329522; b5 = -0.7616 * b5 - r * 0.016898;
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + r * 0.5362) * 0.11; b6 = r * 0.115926;
    last = (last + 0.02 * r) / 1.02; b[i] = last * 3.5;
  }
  // crackle: sparse decaying impulses (fire / gravel), ticks: denser bright glass ticks
  const fill = (arr, rate, decay) => {
    let env = 0, sign = 1;
    for (let i = 0; i < n; i++) {
      if (Math.random() < rate) { env = 0.3 + Math.random() * 0.7; sign = Math.random() < 0.5 ? -1 : 1; }
      arr[i] = env * sign * (Math.random() * 0.6 + 0.4) * (Math.random() < 0.5 ? -1 : 1);
      env *= decay;
    }
  };
  fill(c, 90 / sr, 0.86);
  fill(t, 600 / sr, 0.7);
  return { white, pink, brown, crackle, ticks };
}

function makeImpulse(ctx, seconds = 2.6, decay = 2.8) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      // smoothed noise (gentle high damping over time) for a warm hall
      const r = Math.random() * 2 - 1;
      const damp = 0.15 + 0.8 * k;
      lp += (r - lp) * (1 - damp);
      const early = i < sr * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.6 : 0;
      d[i] = (lp * 1.2 + early) * Math.pow(1 - k, decay) * (k < 0.003 ? k / 0.003 : 1);
    }
  }
  return buf;
}

export class Engine {
  constructor(ctx, dest = ctx.destination) {
    this.ctx = ctx;
    this.noise = makeNoiseBuffers(ctx);

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 10; this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003; this.comp.release.value = 0.22;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.comp.connect(this.master); this.master.connect(dest);

    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.95; this.sfx.connect(this.comp);
    this.music = ctx.createGain(); this.music.gain.value = 0.26; this.music.connect(this.comp);
    this.ambience = ctx.createGain(); this.ambience.gain.value = 0.4; this.ambience.connect(this.comp);

    this.reverb = ctx.createConvolver(); this.reverb.buffer = makeImpulse(ctx);
    this.reverbOut = ctx.createGain(); this.reverbOut.gain.value = 0.55;
    const revHp = ctx.createBiquadFilter(); revHp.type = 'highpass'; revHp.frequency.value = 160;
    this.reverb.connect(revHp); revHp.connect(this.reverbOut); this.reverbOut.connect(this.comp);
    // separate send inputs so music reverb is affected by music volume
    this.sfxSend = ctx.createGain(); this.sfxSend.connect(this.reverb);
    this.musicSend = ctx.createGain(); this.musicSend.gain.value = 0.26; this.musicSend.connect(this.reverb);
  }

  now() { return this.ctx.currentTime; }

  // ---------- primitives ----------
  _env(g, t, dur, vol, a, hold, shape) {
    const gp = g.gain;
    gp.setValueAtTime(0.0001, t);
    if (a > 0) gp.linearRampToValueAtTime(vol, t + a); else gp.setValueAtTime(vol, t);
    const ht = t + a + (hold || 0);
    if (hold) gp.setValueAtTime(vol, ht);
    if (shape === 'lin') gp.linearRampToValueAtTime(0.0001, t + dur);
    else gp.exponentialRampToValueAtTime(0.0001, Math.max(ht + 0.005, t + dur));
  }

  _filter(src, o, t, dur) {
    if (!o) return src;
    const f = this.ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.Q.value = o.q ?? 0.8;
    const f0 = Math.max(20, Math.min(20000, o.f || 1000));
    f.frequency.setValueAtTime(f0, t);
    if (o.pts) { // [[timeOffset, freq], ...] exponential path
      for (const [dt, fr] of o.pts) f.frequency.exponentialRampToValueAtTime(Math.max(20, Math.min(20000, fr)), t + dt);
    } else if (o.f1) {
      f.frequency.exponentialRampToValueAtTime(Math.max(20, Math.min(20000, o.f1)), t + (o.ft ?? dur));
    }
    if (o.gain != null) f.gain.value = o.gain;
    src.connect(f);
    return f;
  }

  /** Oscillator voice. opts: type, f, f1, ft (glide time), vol, a, hold, shape, detune, vib:{rate,depth,type}, filter */
  osc(dest, t, dur, o) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    const f = Math.max(1, o.f || 440);
    osc.frequency.setValueAtTime(f, t);
    if (o.f1) {
      const tt = t + (o.ft ?? dur);
      if (o.glide === 'lin') osc.frequency.linearRampToValueAtTime(o.f1, tt);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), tt);
    }
    if (o.detune) osc.detune.value = o.detune;
    let lfo = null, lfoG = null;
    if (o.vib) {
      lfo = ctx.createOscillator(); lfo.type = o.vib.type || 'sine'; lfo.frequency.value = o.vib.rate;
      lfoG = ctx.createGain(); lfoG.gain.value = o.vib.depth;
      lfo.connect(lfoG); lfoG.connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    this._env(g, t, dur, o.vol ?? 0.5, o.a ?? 0.004, o.hold, o.shape);
    const out = this._filter(osc, o.filter, t, dur);
    out.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.05);
    osc.onended = () => { osc.disconnect(); g.disconnect(); if (out !== osc) out.disconnect(); lfo?.disconnect(); lfoG?.disconnect(); };
    return osc;
  }

  /** Noise voice. opts: color (white|pink|brown|crackle|ticks), vol, a, hold, shape, rate, filter, filter2 */
  noiseV(dest, t, dur, o) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise[o.color || 'white'];
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    const g = ctx.createGain();
    this._env(g, t, dur, o.vol ?? 0.5, o.a ?? 0.003, o.hold, o.shape);
    let out = this._filter(src, o.filter, t, dur);
    const f1 = out;
    if (o.filter2) out = this._filter(out, o.filter2, t, dur);
    out.connect(g); g.connect(dest);
    src.start(t, Math.random() * (SR_NOISE_SEC - 0.1));
    src.stop(t + dur + 0.05);
    src.onended = () => { src.disconnect(); g.disconnect(); if (f1 !== src) f1.disconnect(); if (out !== f1) out.disconnect(); };
    return src;
  }

  /** Vocal-ish formant voice: saw source through parallel bandpasses. */
  formant(dest, t, dur, o) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.ft ?? dur));
    let lfo = null, lfoG = null;
    if (o.vib) {
      lfo = ctx.createOscillator(); lfo.frequency.value = o.vib.rate; lfo.type = o.vib.type || 'sine';
      lfoG = ctx.createGain(); lfoG.gain.value = o.vib.depth;
      lfo.connect(lfoG); lfoG.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    this._env(g, t, dur, o.vol ?? 0.5, o.a ?? 0.01, o.hold, o.shape);
    const filters = [];
    for (const [fq, amp, f1q] of o.formants) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = o.q ?? 6;
      bp.frequency.setValueAtTime(fq, t);
      if (f1q) bp.frequency.exponentialRampToValueAtTime(f1q, t + dur);
      const fg = ctx.createGain(); fg.gain.value = amp;
      osc.connect(bp); bp.connect(fg); fg.connect(g);
      filters.push(bp, fg);
    }
    g.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.05);
    osc.onended = () => { osc.disconnect(); g.disconnect(); for (const f of filters) f.disconnect(); lfo?.disconnect(); lfoG?.disconnect(); };
    return osc;
  }

  /** Simple 2-op FM blip (birds, sparkles). */
  fm(dest, t, dur, o) {
    const ctx = this.ctx;
    const car = ctx.createOscillator(); car.type = 'sine';
    const mod = ctx.createOscillator(); mod.type = 'sine';
    const mg = ctx.createGain();
    car.frequency.setValueAtTime(o.f, t);
    if (o.f1) car.frequency.exponentialRampToValueAtTime(o.f1, t + (o.ft ?? dur));
    mod.frequency.setValueAtTime(o.f * (o.ratio ?? 2), t);
    if (o.f1) mod.frequency.exponentialRampToValueAtTime(o.f1 * (o.ratio ?? 2), t + (o.ft ?? dur));
    mg.gain.setValueAtTime(o.index ?? o.f, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, (o.index ?? o.f) * 0.1), t + dur);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain();
    this._env(g, t, dur, o.vol ?? 0.3, o.a ?? 0.005, o.hold, o.shape);
    car.connect(g); g.connect(dest);
    car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
    car.onended = () => { car.disconnect(); mod.disconnect(); mg.disconnect(); g.disconnect(); };
    return car;
  }

  /** Soft piano/bell-ish note for music. */
  piano(dest, t, freq, vol, len = 1.6) {
    this.osc(dest, t, len, { type: 'triangle', f: freq, vol: vol * 0.55, a: 0.006 });
    this.osc(dest, t, len * 0.8, { type: 'sine', f: freq * 2, vol: vol * 0.22, a: 0.004 });
    this.osc(dest, t, len * 1.3, { type: 'sine', f: freq, vol: vol * 0.5, a: 0.01, detune: 4 });
    this.osc(dest, t, 0.12, { type: 'sine', f: freq * 4, vol: vol * 0.06, a: 0.002 });
  }
}
