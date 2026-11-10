// Audio module v3: every sound is synthesized with WebAudio (no files).
// play(name, {position, volume, pitch, exactPitch, force}), loop(name, opts) -> {stop, setVolume, setPitch, setPosition, alive},
// resume(), setMusic(theme|null), setVolume('master'|'music'|'sfx', v), setMuted(m), toggleMute(), duck(v, s), silence(s).
// v3 (CONTRACT §20): 9-element recipes (audio/sfx3.js), rx_<id> map lookup with a family fallback, class weapon sfx, UI cues,
// boss voices; zone music via world.getZoneAt().music, the final_boss layer by bossPhase, the fanfare on bossDefeated{final}.
import { Engine } from './audio/synth.js';
import { SOUNDS as BASE_SOUNDS } from './audio/sounds.js';
import { SFX2 } from './audio/sfx2.js';
import { SFX3, RX_CUES, RX_FAMILY } from './audio/sfx3.js';
import { THEMES3 } from './audio/themes3.js';
import { SFX4, tellCue } from './audio/tells.js';
import { Music, Ambience } from './audio/music.js';
import { ELEMENT_DEFS, ALL_ELEMENTS } from './core/elements.js';
import { CLASS_DEFS, familyOf, styleOf } from './core/classes.js';

const SOUNDS = Object.assign(BASE_SOUNDS, SFX2, SFX3, SFX4);
const CHARGE_K = 0.5;           // charge loop base = ELEMENT_DEFS[el].sfxBase × CHARGE_K (rises ×2 while charging)
const WEAPON_SFX = { bow: 'bow_release', hammer: 'hammer_swing', daggers: 'dagger_swish', totem: 'totem_rattle' };
const CUE_LOG_N = 64;
const DEDUPE = 0.045;         // same sound name within this window is skipped (events + direct calls overlap)
const DEDUPE_BY = { dialogue_blip: 0.028, footstep: 0.06 };
const MAX_VOICES = 44;
// Per-name concurrent voice caps (CPU: big multi-oscillator recipes never pile up).
const PER_NAME_DEFAULT = 6;
const PER_NAME = {
  footstep: 3, dialogue_blip: 3, sword_swing: 4, sword_swing_heavy: 3, sword_hit: 5, sword_hit_heavy: 3, hit: 5,
  parry: 2, perfect_dodge: 1, finisher_charge: 1, finisher_impact: 2, blessing: 2, spirit_chime: 4, quest_complete: 1,
  quest_start: 1, awakening_ready: 1, cinematic_whoosh: 3, grass_ignite: 3, enemy_hurt: 3, ui_select: 3, ui_click: 3,
  victory: 1, level_up: 1, break_gong: 2, resonance: 2, wyrm_roar: 1, hydra_roar: 1, treant_groan: 1, xp_tick: 2, firework: 4,
};
const MUSIC_BASE = 0.26, SFX_BASE = 0.95, AMB_BASE = 0.4;
const THEMES = ['title', 'intro', 'village', 'field', 'battle', 'boss', 'ending', ...Object.keys(THEMES3)];
const REF_DIST = 6, ROLLOFF = 14, CULL_GAIN = 0.05;

export function createAudio(game) {
  try { if (new URLSearchParams(location.search).has('noaudio')) return null; } catch (_) { /* */ }
  let ctx = null, E = null, music = null, amb = null, failed = false;
  let muted = false;
  try { muted = localStorage.getItem('aw_muted') === '1'; } catch (_) { /* */ }
  const last = new Map();       // name -> ctx time last played
  let voices = 0;
  const impactWin = { t: 0, n: 0 };
  let hurtT = 0, stepAlt = 0;
  let modeTimer = 0, victoryUntil = 0, musicDuck = -1, duckTarget = 1;
  let forcedTheme = null, inVillage = false, inDialogue = false, tempDuck = 1, tempDuckUntil = 0;
  const nameVoices = new Map();   // name -> active voice count
  const vol = { master: 0.9, music: 0.6, sfx: 1 };
  try {
    const sv = game.settings?.values;
    if (sv) { vol.master = sv.volMaster ?? vol.master; vol.music = sv.volMusic ?? vol.music; vol.sfx = sv.volSfx ?? vol.sfx; }
  } catch (_) { /* */ }
  const loops = new Set();
  const noopHandle = { stop() {}, setVolume() {}, setPitch() {}, alive: false };

  // ---------- context ----------
  function ensure() {
    if (E || failed) return !!E;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { failed = true; return false; }
      const o = { latencyHint: 'interactive' };
      if (game.isTest) o.sinkId = { type: 'none' }; // headless: render without an output device
      try { ctx = new AC(o); } catch (_) { ctx = new AC(); }
      E = new Engine(ctx);
      music = new Music(E);
      applyVolumes(true);
      return true;
    } catch (err) {
      console.warn('[audio] WebAudio unavailable:', err?.message);
      failed = true; ctx = null; E = null;
      return false;
    }
  }

  function startBeds() {
    if (!E || ctx.state !== 'running') return;
    music.start(pickMode());
    if (!amb) { try { amb = new Ambience(E); } catch (err) { console.warn('[audio] ambience', err); } }
  }

  // Headless test runs (?test=1) stay silent unless '&audio' is in the URL: a live audio graph
  // adds enough CPU in SwiftShader headless runs to push screenshots past their timeout.
  const testSilent = game.isTest && !/[?&]audio(=|&|$)/.test(location.search);

  function resume() {
    if (testSilent) return Promise.resolve();
    if (!ensure()) return Promise.resolve();
    let p;
    try { p = ctx.state === 'running' ? Promise.resolve() : ctx.resume(); } catch (_) { p = Promise.resolve(); }
    return Promise.resolve(p).then(startBeds, () => {}).catch(() => {});
  }

  // unlock on first gesture (title screen hover/click sounds + music)
  const unlock = () => { resume(); if (ctx?.state === 'running') { removeEventListener('pointerdown', unlock); removeEventListener('keydown', unlock); } };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);

  // ---------- spatial ----------
  const sp = { gain: 1, pan: 0, dist: 0 };
  function spatial(pos) {
    sp.gain = 1; sp.pan = 0; sp.dist = 0;
    const cam = game.camera;
    if (!pos || !cam || pos.x === undefined) return sp;
    const m = cam.matrixWorld.elements;
    const dx = pos.x - m[12], dy = pos.y - m[13], dz = pos.z - m[14];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    sp.dist = d;
    sp.gain = 1 / (1 + Math.max(0, d - REF_DIST) / ROLLOFF);
    if (d > 0.5) {
      const rx = m[0], ry = m[1], rz = m[2];
      const rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
      sp.pan = Math.max(-1, Math.min(1, (dx * rx + dy * ry + dz * rz) / (rl * Math.max(d, 2)))) * 0.75;
    }
    return sp;
  }

  // ---------- play ----------
  // every requested cue is logged (even when silent / headless) so tests can assert which cues fired
  const cueLog = []; const cueCount = Object.create(null);
  const tellSlots = [{ key: null, id: '', end: 0, tell: '' }, { key: null, id: '', end: 0, tell: '' }];
  const targeting = new Map(); let tellMaxConc = 0;
  let pruneNow = 0; const pruneTarget = (t, k) => { if (t < pruneNow) targeting.delete(k); };
  function logCue(name) { cueCount[name] = (cueCount[name] || 0) + 1; if (cueLog.length >= CUE_LOG_N) cueLog.shift(); cueLog.push(name); }
  function play(name, opts) {
    try {
      logCue(name);
      if (!E || ctx.state !== 'running' || muted) return;
      const recipe = SOUNDS[name];
      if (!recipe) return;
      const now = ctx.currentTime;
      const o = opts || {};
      if (!o.force) {
        const lt = last.get(name);
        if (lt !== undefined && now - lt < (DEDUPE_BY[name] ?? DEDUPE)) return;
      }
      const nv = nameVoices.get(name) || 0;
      if (nv >= (PER_NAME[name] ?? PER_NAME_DEFAULT)) return;
      let v = o.volume ?? 1;
      const s = spatial(o.position);
      v *= s.gain;
      if (v < CULL_GAIN) return;
      if (voices >= MAX_VOICES && (v < 0.6 || name === 'footstep')) return;
      last.set(name, now);
      const pitch = (o.pitch ?? 1) * (o.exactPitch ? 1 : 0.95 + Math.random() * 0.1);

      const g = ctx.createGain(); g.gain.value = Math.min(v, 2.5);
      const pan = ctx.createStereoPanner(); pan.pan.value = s.pan;
      let head = g, lp = null;
      if (s.dist > 30) {
        lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.value = Math.max(1200, 18000 * Math.pow(30 / s.dist, 1.3));
        g.connect(lp); head = lp;
      }
      head.connect(pan); pan.connect(E.sfx);
      const send = ctx.createGain();
      pan.connect(send); send.connect(E.sfxSend);

      const t = now + 0.005;
      const res = recipe(E, g, t, pitch);
      const dur = typeof res === 'number' ? res : (res?.dur ?? 1);
      const rev = typeof res === 'object' && res?.rev != null ? res.rev : 0.35;
      send.gain.value = rev * (0.7 + Math.min(0.6, s.dist / 60));

      voices++;
      nameVoices.set(name, nv + 1);
      setTimeout(() => {
        voices--;
        nameVoices.set(name, Math.max(0, (nameVoices.get(name) || 1) - 1));
        try { g.disconnect(); pan.disconnect(); send.disconnect(); lp?.disconnect(); } catch (_) { /* */ }
      }, (dur + 0.4) * 1000);
    } catch (err) {
      if (!play._warned) { play._warned = true; console.warn('[audio] play failed', name, err); }
    }
  }

  // ---------- loops ----------
  function makeCharge(o) {
    const now = ctx.currentTime;
    const base = (ELEMENT_DEFS[o.element]?.sfxBase || 220) * CHARGE_K;
    const out = ctx.createGain(); out.gain.value = 0;
    const vol = o.volume ?? 0.55;
    out.gain.setTargetAtTime(vol, now, 0.06);
    const trem = ctx.createGain(); trem.gain.value = 0.8;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 9; lp.frequency.value = 350;
    lp.connect(trem); trem.connect(out);
    const pan = ctx.createStereoPanner(); out.connect(pan); pan.connect(E.sfx);
    const send = ctx.createGain(); send.gain.value = 0.5; out.connect(send); send.connect(E.sfxSend);
    const oscs = [];
    const mk = (type, mul, v, det = 0) => {
      const os = ctx.createOscillator(); os.type = type; os.frequency.value = base * mul; os.detune.value = det;
      const og = ctx.createGain(); og.gain.value = v; os.connect(og); og.connect(lp); os.start(now);
      oscs.push({ os, og, mul });
    };
    mk('sawtooth', 1, 0.22, -7); mk('sawtooth', 1, 0.22, 7); mk('sine', 2, 0.25); mk('triangle', 3.01, 0.12); mk('sine', 4.5, 0.05);
    // resonant noise swirl
    const nz = ctx.createBufferSource(); nz.buffer = E.noise.white; nz.loop = true;
    const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.Q.value = 5; nbp.frequency.value = 800;
    const ng = ctx.createGain(); ng.gain.value = 0.18;
    nz.connect(nbp); nbp.connect(ng); ng.connect(out); nz.start(now);
    // tremolo LFO
    const lfo = ctx.createOscillator(); lfo.frequency.value = 6;
    const lg = ctx.createGain(); lg.gain.value = 0.2; lfo.connect(lg); lg.connect(trem.gain); lfo.start(now);
    const setPitch = (p, ramp = 0.05) => {
      const t = ctx.currentTime;
      for (const { os, mul } of oscs) { os.frequency.cancelScheduledValues(t); os.frequency.setTargetAtTime(base * mul * p, t, ramp); }
      lp.frequency.cancelScheduledValues(t); lp.frequency.setTargetAtTime(350 * p * p * 1.6, t, ramp);
      nbp.frequency.cancelScheduledValues(t); nbp.frequency.setTargetAtTime(900 * p * p, t, ramp);
      lfo.frequency.cancelScheduledValues(t); lfo.frequency.setTargetAtTime(5 + 10 * (p - 1), t, ramp);
    };
    // automatic rise over ~1.4 s (charge fills), pitch 1 -> 2
    const RISE = o.rise ?? 1.4;
    for (const { os, mul } of oscs) { os.frequency.setValueAtTime(base * mul, now); os.frequency.exponentialRampToValueAtTime(base * mul * 2, now + RISE); }
    lp.frequency.setValueAtTime(350, now); lp.frequency.exponentialRampToValueAtTime(2600, now + RISE);
    nbp.frequency.setValueAtTime(700, now); nbp.frequency.exponentialRampToValueAtTime(4200, now + RISE);
    lfo.frequency.setValueAtTime(5, now); lfo.frequency.linearRampToValueAtTime(15, now + RISE);
    const sources = [...oscs.map((x) => x.os), nz, lfo];
    const nodes = [out, trem, lp, pan, send, nbp, ng, lg, ...oscs.map((x) => x.og)];
    return { out, vol, sources, nodes, setPitch, pan };
  }

  function makeGlide(o) {
    const now = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0;
    const vol = o.volume ?? 0.4;
    out.gain.setTargetAtTime(vol, now, 0.25);
    out.connect(E.sfx);
    const nz = ctx.createBufferSource(); nz.buffer = E.noise.pink; nz.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.9;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.6;
    const lg = ctx.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(bp.frequency);
    nz.connect(bp); bp.connect(out); nz.start(now); lfo.start(now);
    const setPitch = (p) => { bp.frequency.setTargetAtTime(700 * p, ctx.currentTime, 0.2); };
    return { out, vol, sources: [nz, lfo], nodes: [out, bp, lg], setPitch };
  }

  // sword charge: same rising engine as the mage charge, an octave brighter, plus a steel ring that rises with it
  function makeSwordCharge(o) {
    const el = o.element || game.sword?.element || game.progression?.element || 'fire';
    const L = makeCharge({ ...o, element: el, rise: o.rise ?? 1.2, volume: (o.volume ?? 0.6) * 0.8 });
    const now = ctx.currentTime;
    const ring = ctx.createOscillator(); ring.type = 'triangle'; ring.frequency.setValueAtTime(1320, now);
    ring.frequency.exponentialRampToValueAtTime(2640, now + (o.rise ?? 1.2));
    const rg = ctx.createGain(); rg.gain.value = 0.035; ring.connect(rg); rg.connect(L.out); ring.start(now);
    L.sources.push(ring); L.nodes.push(rg);
    return L;
  }

  // burning grass near the camera: crackles + pops + low roar. World drives setVolume(0..1).
  function makeCrackle(o) {
    const now = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0;
    const v = (o.volume ?? 1) * 0.6;
    out.gain.setTargetAtTime(v, now, 0.3);
    out.connect(E.sfx);
    const send = ctx.createGain(); send.gain.value = 0.25; out.connect(send); send.connect(E.sfxSend);
    const c1 = ctx.createBufferSource(); c1.buffer = E.noise.crackle; c1.loop = true;
    const b1 = ctx.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = 2400; b1.Q.value = 0.7;
    const g1 = ctx.createGain(); g1.gain.value = 0.8;
    c1.connect(b1); b1.connect(g1); g1.connect(out);
    const c2 = ctx.createBufferSource(); c2.buffer = E.noise.crackle; c2.loop = true; c2.playbackRate.value = 0.55;
    const b2 = ctx.createBiquadFilter(); b2.type = 'lowpass'; b2.frequency.value = 1100;
    const g2 = ctx.createGain(); g2.gain.value = 0.6;
    c2.connect(b2); b2.connect(g2); g2.connect(out);
    const rn = ctx.createBufferSource(); rn.buffer = E.noise.brown; rn.loop = true;
    const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 320;
    const rg = ctx.createGain(); rg.gain.value = 0.45;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.37;
    const lg = ctx.createGain(); lg.gain.value = 0.18; lfo.connect(lg); lg.connect(rg.gain);
    rn.connect(rl); rl.connect(rg); rg.connect(out);
    c1.start(now, Math.random() * 2); c2.start(now, Math.random() * 2); rn.start(now, Math.random() * 2); lfo.start(now);
    const setPitch = (p) => { c1.playbackRate.setTargetAtTime(p, ctx.currentTime, 0.2); };
    return { out, vol: v, sources: [c1, c2, rn, lfo], nodes: [out, send, b1, g1, b2, g2, rl, rg, lg], setPitch };
  }

  // rising-heat updraft: wind roar + whistle
  function makeUpdraft(o) {
    const now = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0;
    const v = (o.volume ?? 1) * 0.55;
    out.gain.setTargetAtTime(v, now, 0.35);
    out.connect(E.sfx);
    const nz = ctx.createBufferSource(); nz.buffer = E.noise.pink; nz.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const ng = ctx.createGain(); ng.gain.value = 0.9;
    nz.connect(bp); bp.connect(ng); ng.connect(out);
    const br = ctx.createBufferSource(); br.buffer = E.noise.brown; br.loop = true;
    const bl = ctx.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 220;
    const bg = ctx.createGain(); bg.gain.value = 0.7;
    br.connect(bl); bl.connect(bg); bg.connect(out);
    const wh = ctx.createBufferSource(); wh.buffer = E.noise.white; wh.loop = true;
    const wb = ctx.createBiquadFilter(); wb.type = 'bandpass'; wb.frequency.value = 1500; wb.Q.value = 9;
    const wg = ctx.createGain(); wg.gain.value = 0.16;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.45;
    const lfg = ctx.createGain(); lfg.gain.value = 500; lfo.connect(lfg); lfg.connect(wb.frequency); lfg.connect(bp.frequency);
    wh.connect(wb); wb.connect(wg); wg.connect(out);
    nz.start(now, Math.random() * 2); br.start(now, Math.random() * 2); wh.start(now, Math.random() * 2); lfo.start(now);
    // whoosh in
    bp.frequency.setValueAtTime(260, now); bp.frequency.exponentialRampToValueAtTime(420, now + 0.8);
    const setPitch = (p) => { const t = ctx.currentTime; bp.frequency.setTargetAtTime(420 * p, t, 0.3); wb.frequency.setTargetAtTime(1500 * p, t, 0.3); };
    return { out, vol: v, sources: [nz, br, wh, lfo], nodes: [out, bp, ng, bl, bg, wb, wg, lfg], setPitch };
  }

  // sustained arcane barrier: glassy hum (optional; player may hold this while blocking)
  function makeBarrier(o) {
    const now = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0;
    const v = (o.volume ?? 1) * 0.12;
    out.gain.setTargetAtTime(v, now, 0.08);
    const pan = ctx.createStereoPanner(); out.connect(pan); pan.connect(E.sfx);
    const send = ctx.createGain(); send.gain.value = 0.5; out.connect(send); send.connect(E.sfxSend);
    const oscs = [], gains = [];
    for (const [m, a] of [[1, 0.5], [1.5, 0.3], [2.01, 0.25], [3, 0.12]]) {
      const os = ctx.createOscillator(); os.type = 'sine'; os.frequency.value = 523.25 * m;
      const og = ctx.createGain(); og.gain.value = a; os.connect(og); og.connect(out); os.start(now);
      oscs.push(os); gains.push(og);
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7;
    const lg = ctx.createGain(); lg.gain.value = 4; lfo.connect(lg); for (const os of oscs) lg.connect(os.frequency); lfo.start(now);
    const setPitch = (p) => { const t = ctx.currentTime; [1, 1.5, 2.01, 3].forEach((m, i) => oscs[i].frequency.setTargetAtTime(523.25 * m * p, t, 0.1)); };
    return { out, vol: v, sources: [...oscs, lfo], nodes: [out, pan, send, lg, ...gains], setPitch, pan };
  }

  const LOOPS = {
    charge: makeCharge, glide: makeGlide, wind: makeGlide, sword_charge: makeSwordCharge,
    fire_crackle: makeCrackle, updraft: makeUpdraft, barrier: makeBarrier,
  };

  function loop(name, opts) {
    try {
      if (!E || ctx.state !== 'running' || muted) return { ...noopHandle };
      const make = LOOPS[name];
      if (!make) return { ...noopHandle };
      const o = opts || {};
      const L = make(o);
      let alive = true;
      const handle = {
        get alive() { return alive; },
        stop(fade = 0.08) {
          if (!alive) return; alive = false; loops.delete(handle);
          try {
            const t = ctx.currentTime;
            L.out.gain.cancelScheduledValues(t); L.out.gain.setValueAtTime(L.out.gain.value, t);
            L.out.gain.linearRampToValueAtTime(0, t + fade);
            for (const s of L.sources) s.stop(t + fade + 0.05);
            setTimeout(() => { for (const s of L.sources) { try { s.disconnect(); } catch (_) { /* */ } } for (const n of L.nodes) { try { n.disconnect(); } catch (_) { /* */ } } }, (fade + 0.3) * 1000);
          } catch (_) { /* */ }
        },
        setVolume(v) { if (alive) try { L.out.gain.setTargetAtTime(L.vol * v, ctx.currentTime, 0.05); } catch (_) { /* */ } },
        setPitch(p) { if (alive) try { L.setPitch(p); } catch (_) { /* */ } },
        setPosition(pos) { if (alive && L.pan) try { L.pan.pan.value = spatial(pos).pan; } catch (_) { /* */ } },
      };
      loops.add(handle);
      return handle;
    } catch (err) {
      return { ...noopHandle };
    }
  }

  // ---------- mute ----------
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('aw_muted', muted ? '1' : '0'); } catch (_) { /* */ }
    if (muted) for (const h of [...loops]) h.stop();
    applyVolumes();
    try { game.ui?.toast?.(muted ? '소리 꺼짐 (M)' : '소리 켜짐 (M)', { duration: 1.6 }); } catch (_) { /* */ }
  }

  // ---------- buses / volumes ----------
  function applyVolumes(instant = false) {
    if (!E) return;
    const t = ctx.currentTime, tc = instant ? 0.001 : 0.05;
    const set = (param, v) => { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, tc); };
    set(E.master.gain, muted ? 0 : vol.master);
    set(E.sfx.gain, SFX_BASE * vol.sfx);
    set(E.sfxSend.gain, vol.sfx);
    set(E.ambience.gain, AMB_BASE * vol.sfx);
    musicDuck = -1; // force music bus refresh in update()
    if (instant) { E.music.gain.value = MUSIC_BASE * vol.music; E.musicSend.gain.value = MUSIC_BASE * vol.music; }
  }
  function setVolume(bus, v) {
    if (!(bus in vol)) return;
    v = Math.max(0, Math.min(1, +v || 0));
    vol[bus] = v;
    const key = { master: 'volMaster', music: 'volMusic', sfx: 'volSfx' }[bus];
    try { if (game.settings && game.settings.values[key] !== v) game.settings.set(key, v, { silent: true }); } catch (_) { /* */ }
    applyVolumes();
  }
  function duck(v, seconds) {
    const now = ctx ? ctx.currentTime : 0;
    if (now >= tempDuckUntil) { tempDuck = v; tempDuckUntil = now + seconds; }
    else { tempDuck = Math.min(tempDuck, v); tempDuckUntil = Math.max(tempDuckUntil, now + seconds); }
  }
  /** Time-slow feel: sweep the music low-pass down and back. */
  function musicFilterDip(depth = 650, seconds = 1.2) {
    if (!E) return;
    const t = ctx.currentTime, f = E.musicLP.frequency;
    f.cancelScheduledValues(t); f.setValueAtTime(Math.max(depth, f.value), t);
    f.exponentialRampToValueAtTime(depth, t + 0.12);
    f.setValueAtTime(depth, t + seconds * 0.7);
    f.exponentialRampToValueAtTime(E.musicLPOpen, t + seconds + 0.5);
  }

  // ---------- music selection ----------
  function pickMode() {
    const now = ctx ? ctx.currentTime : 0;
    if (forcedTheme) return forcedTheme;
    const st = game.state;
    if (now < victoryUntil) return 'victory';
    if (st === 'title') return 'title';
    if (st === 'victory') return 'ending_v3';
    const boss = game.enemies?.boss;
    const pp = game.player?.object?.position;
    if (boss && boss.alive !== false && !boss.defeated && (!pp || !boss.object || boss.object.position.distanceTo(pp) < (boss.isFinalBoss ? 140 : 75))) {
      const bid = boss.bossId || boss.id;
      return bid === 'nidhoggra' || boss.isFinalBoss || boss.music === 'final_boss' ? 'final_boss' : 'boss';
    }
    if (st === 'playing' || st === 'paused' || st === 'dead') { if (game.enemies?.inCombat) return 'battle'; }
    // zone music (world v3): village / field / mirwen / elderwood / sky; the plateau is 'sky' until the wyrm is up
    const W = game.world;
    if (pp && W?.getZoneAt) {
      let z = null; try { z = W.getZoneAt(pp.x, pp.z); } catch (_) { z = null; }
      let m = z?.music;
      if (m === 'final_boss') m = 'sky';
      if (m === 'village') { inVillage = true; return 'village'; }
      if (m && m !== 'field' && THEMES.includes(m)) return m;
      if (m === 'field') { inVillage = false; return 'field'; }
    }
    const vil = W?.village;
    if (vil?.center && pp) {
      const dx = pp.x - vil.center.x, dz = pp.z - vil.center.z, r = vil.radius || 40;
      const d2 = dx * dx + dz * dz;
      if (inVillage) { if (d2 > (r + 10) * (r + 10)) inVillage = false; } else if (d2 < r * r) inVillage = true;
      return inVillage ? 'village' : 'field';
    }
    return 'field';
  }
  /** Cut the music bus for `seconds` (ultimate hitstop, the finale's 0.4 s of silence). */
  let silenceUntil = 0;
  function silence(seconds = 0.4) {
    if (!E) return;
    const now = ctx.currentTime; silenceUntil = now + seconds;
    for (const b of [E.music.gain, E.musicSend.gain]) { b.cancelScheduledValues(now); b.setTargetAtTime(0.0001, now, 0.015); }
    musicDuck = -1;
  }
  function setMusic(theme) {
    if (theme === 'explore') theme = 'field';
    forcedTheme = theme && (THEMES.includes(theme) || theme === 'silent' || theme === 'victory') ? theme : null;
    modeTimer = 0;
    if (music?.started) { const m = pickMode(); if (m !== music.mode) music.setMode(m); }
  }

  // ---------- helpers ----------
  const posOf = (p) => p?.point || p?.position || p?.origin || p?.target?.object?.position || null;
  let chargeLoop = null, glideLoop = null, updraftLoop = null, barrierLoop = null;
  const stopUpdraft = (f = 0.6) => { updraftLoop?.stop(f); updraftLoop = null; };

  const api = {
    get ctx() { return ctx; },
    get muted() { return muted; },
    get voices() { return voices; },
    get musicMode() { return music?.mode || null; },
    get musicStep() { return music?.step || 0; },
    get musicTheme() { return forcedTheme; },
    get volumes() { return { ...vol }; },
    sounds: Object.keys(SOUNDS),
    loops: Object.keys(LOOPS),
    themes: THEMES.slice(),
    resume, play, loop, setMuted, setMusic, setVolume, silence,
    duck(v = 0.5, seconds = 1) { duck(v, seconds); },
    unsilence() { silenceUntil = 0; musicDuck = -1; },
    /** Test hooks: how often a cue was requested (logged even when silent), the last cues, the fanfare count. */
    cueCount(name) { return cueCount[name] || 0; },
    /** v4 debug: tell channels in use now, the max seen, and how many tells target the player. */
    tellDebug() { const t = game.realTime || 0; let n = 0; for (const x of tellSlots) if (x.key && x.end >= t) n++; return { active: n, max: tellMaxConc, targeting: targeting.size, reset() { tellMaxConc = 0; } }; },
    get lastCues() { return cueLog.slice(); },
    fanfareCount: 0,
    get musicLayer() { return music?.bossPhase || 1; },
    /** The mode pickMode() would choose now (works headless). */
    wantedMode() { try { return pickMode(); } catch (_) { return null; } },
    toggleMute() { setMuted(!muted); },

    init() {
      const ev = game.events;
      ev.on('spellCast', (p) => {
        const pos = p.origin;
        play('cast_' + p.element, { position: pos, volume: p.kind === 'basic' ? 0.7 : 1 });
        if (p.kind === 'heavy') play('cast_heavy', { position: pos, volume: 0.8 });
        if (p.kind === 'ultimate') {
          play('ultimate', { position: pos, volume: 1 });
          duck(0.63, 0.3); silence(0.04);
          if (p.element === 'fire' || p.element === 'earth') play('meteor_fall', { position: pos, volume: 0.6 });
          if (p.element === 'lightning') setTimeout(() => play('thunder', { volume: 0.8 }), 400);
        }
      });
      ev.on('damage', (p) => {
        const now = ctx ? ctx.currentTime : 0;
        const pos = p.point || p.target?.object?.position;
        if (p.isPlayer || p.target?.team === 'player') { play('player_hurt', { position: pos, volume: 0.9 }); return; }
        if (now - impactWin.t > 0.05) { impactWin.t = now; impactWin.n = 0; }
        if (++impactWin.n > 3) return;
        const big = (p.crit ? 1.25 : 1) * (p.reaction ? 1.25 : 1);
        const amt = Math.min(1.3, 0.6 + (p.amount || 10) / 60);
        play('hit', { position: pos, volume: 0.75 * amt * big, pitch: p.crit ? 0.85 : 1 });
        if (p.element && p.element !== 'physical') play('impact_' + p.element, { position: pos, volume: 0.7 * big });
        if (p.crit) { play('crit', { position: pos, volume: 0.9 }); duck(0.63, 0.3); }
        if (!p.killed && !p.target?.isDummy && now - hurtT > 0.12 && Math.random() < 0.6) {
          hurtT = now;
          play(p.target?.isBoss ? 'boss_hurt' : 'enemy_hurt', { position: pos, volume: 0.6, pitch: p.target?.mass > 2 ? 0.55 : 1 });
        }
      });
      ev.on('reaction', (p) => {
        const pos = p.point;
        const cue = RX_CUES[p.id];
        const fam = p.family || game.combat?.REACTION_DEFS?.[p.id]?.family || null;
        play('reaction', { position: pos, volume: 0.7 });
        if (cue && SOUNDS[cue[0]]) play(cue[0], { position: pos, volume: 1, pitch: cue[1] });
        else if (fam && RX_FAMILY[fam]) play(RX_FAMILY[fam], { position: pos, volume: 1 });
      });
      ev.on('zoneCombo', (p) => {
        play('combo', { position: p.point, volume: 1 });
        if (/tornado|blizzard/.test(p.id || '')) play('explode_wind', { position: p.point, volume: 0.8 });
        if (p.id === 'electro_water') play('thunder', { position: p.point, volume: 0.6 });
      });
      ev.on('kill', (p) => {
        const pos = p.point || p.target?.object?.position;
        if (p.target?.team === 'player') return;
        play('enemy_death', { position: pos, volume: p.target?.isBoss ? 1.4 : 0.9, pitch: p.target?.isBoss ? 0.5 : (p.target?.mass > 2 ? 0.7 : 1) });
      });
      ev.on('blink', (p) => play('blink', { position: p.position, volume: 0.9 }));
      ev.on('jump', (p) => play('jump', { position: p.position, volume: 0.8 }));
      ev.on('land', (p) => play('land', { position: p.position, volume: 0.8 }));
      ev.on('footstep', (p) => { stepAlt ^= 1; play('footstep', { position: p.position, volume: 0.55, pitch: stepAlt ? 1.06 : 0.92 }); });
      ev.on('glideStart', (p) => { play('glide', { position: p.position, volume: 0.8 }); glideLoop?.stop(); glideLoop = loop('glide', { volume: 0.35 }); });
      ev.on('glideEnd', () => { glideLoop?.stop(0.3); glideLoop = null; });
      ev.on('chargeStart', (p) => {
        chargeLoop?.stop(); chargeLoop = loop('charge', { element: p.element, volume: 0.45 });
        if (styleOf(game.progression?.cls) === 'bow') play('bow_draw', { volume: 0.8 });
      });
      ev.on('chargeEnd', () => { chargeLoop?.stop(); chargeLoop = null; });
      ev.on('elementChanged', () => play('ui_select', { volume: 0.7 }));
      ev.on('spellFail', (p) => play(p.reason === 'mana' ? 'mana_empty' : 'cooldown', { volume: 0.8 }));
      ev.on('bossSpawn', (p) => { play('boss_roar', { position: p.boss?.object?.position, volume: 1.3 }); if (music) { music.bossPhase = 1; music.motifs.length = 0; } modeTimer = 0; });
      ev.on('bossDefeated', (p) => {
        play('explode_earth', { position: p.boss?.object?.position, volume: 1.2, pitch: 0.6 });
        if (p?.final) {   // the victory fanfare plays at the final kill (DESIGN §11); `victory` itself plays nothing new
          play('victory', { volume: 1 }); duck(0.2, 6);
          if (ctx) victoryUntil = ctx.currentTime + 9;
          music?.setMode('victory');
          api.fanfareCount++;
        }
        modeTimer = 0;
      });
      ev.on('bossPhase', (p) => {
        if (music && (p?.id === 'nidhoggra' || p?.boss?.isFinalBoss)) music.bossPhase = Math.max(1, Math.min(3, p.phase || 1));
        play('cinematic_whoosh', { volume: 0.6, pitch: 0.7 });
      });
      ev.on('shardBuff', (p) => { const el = p?.element; if (music && el && !music.motifs.includes(el)) music.motifs.push(el); play('lock_strip', { volume: 0.9, pitch: 0.8 }); });
      ev.on('lockStripped', (p) => {
        play('lock_strip', { volume: 0.9 });
        const el = p?.lock?.element || p?.element;
        if (music && p?.by !== 'gift' && el && ALL_ELEMENTS.includes(el) && /shard/.test(p?.partId || '') && !music.motifs.includes(el)) music.motifs.push(el);
      });
      ev.on('giftUsed', () => play('gift_use', { volume: 1 }));
      ev.on('giftReady', () => play('spirit_chime', { volume: 0.6, pitch: 1.3 }));
      ev.on('bossCheck', (p) => {
        if (p?.state === 'start') play('check_start', { volume: 1 });
        else if (p?.state === 'success') { play('break_gong', { volume: 1, pitch: 1.2 }); play('spirit_chime', { volume: 0.7 }); }
        else if (p?.state === 'fail') play('player_hurt', { volume: 1, pitch: 0.7 });
      });
      ev.on('break', () => play('break_gong', { volume: 1 }));
      ev.on('resonance', (p) => play('resonance', { position: p?.target?.object?.position, volume: 1 }));
      ev.on('voidShieldBroken', (p) => play('shatter', { position: p?.target?.object?.position, volume: 0.9, pitch: 0.8 }));
      ev.on('levelUp', () => { play('level_up', { volume: 1 }); duck(0.5, 1.6); });
      ev.on('skillLearned', () => play('skill_learn', { volume: 0.9 }));
      ev.on('skillUnlearned', () => play('skill_unlearn', { volume: 0.8 }));
      ev.on('respec', () => play('skill_unlearn', { volume: 0.9, pitch: 0.8 }));
      ev.on('loadoutChanged', (p) => { if (p?.id) play('slot_equip', { volume: 0.8 }); });
      ev.on('xpGained', (p) => { if ((p?.amount || 0) >= 5) play('xp_tick', { volume: 0.6 }); });
      ev.on('reactionDiscovered', () => play('codex_new', { volume: 0.9 }));
      ev.on('hpRegenStart', () => play('regen_start', { volume: 0.7 }));
      ev.on('gateTravel', () => play('gate_travel', { volume: 1 }));
      ev.on('gateReached', () => play('gate_awaken', { volume: 0.9 }));
      ev.on('shrineFound', (p) => play(p?.kind === 'seed' ? 'shrine_seed' : 'shrine_found', { volume: 1 }));
      ev.on('spiritFreed', () => { play('blessing', { volume: 0.8 }); play('spirit_chime', { volume: 0.8 }); });
      ev.on('treeClosed', () => play('cinematic_whoosh', { volume: 0.3, pitch: 1.6 }));
      ev.on('encounterCleared', () => play('camp_cleared', { volume: 0.7, pitch: 1.15 }));
      ev.on('enemyPoiseBreak', (p) => play('guard_break', { position: p?.target?.object?.position || p?.enemy?.object?.position, volume: 0.8 }));
      ev.on('bossSummon', () => play('wolf_howl', { volume: 0.5, pitch: 0.7 }));
      ev.on('focusStart', () => { duck(0.6, 0.6); musicFilterDip(900, 0.8); });
      ev.on('hardLanding', (p) => play('land', { position: p?.position, volume: 1, pitch: 0.7 }));
      ev.on('wardBreak', () => play('shatter', { volume: 0.7, pitch: 1.3 }));
      ev.on('decoyPop', (p) => play('blink', { position: p?.position, volume: 0.6, pitch: 1.3 }));
      ev.on('campCleared', () => play('camp_cleared', { volume: 1 }));
      ev.on('victory', () => { modeTimer = 0; });   // the fanfare already played on bossDefeated {final:true}
      ev.on('playerHurt', () => play('player_hurt', { volume: 0.9 }));
      ev.on('playerDeath', () => { play('player_death', { volume: 1 }); chargeLoop?.stop(); glideLoop?.stop(); stopUpdraft(0.2); });
      ev.on('playerRespawn', () => play('ui_select', { volume: 0.8, pitch: 0.7 }));
      ev.on('enemyAlert', (p) => play('alert', { position: p.enemy?.object?.position, volume: 0.6 }));
      ev.on('stateChange', ({ state }) => {
        duckTarget = state === 'paused' ? 0.35 : state === 'dead' ? 0.3 : 1;
        if (state !== 'playing') { chargeLoop?.stop(); chargeLoop = null; glideLoop?.stop(); glideLoop = null; stopUpdraft(0.3); }
        if (state !== 'dialogue') inDialogue = false;
        modeTimer = 0;
      });

      // ---- v2 events ----
      // Most of these sounds are also played directly by their owners; the same name within the dedupe
      // window collapses into one voice, so subscribing here only fills gaps (e.g. enemy-side blocks).
      ev.on('blocked', (p) => {
        if (p.target?.team === 'player' || p.target === game.player?.entity) { // player.js plays its own; add the shield clang
          if (CLASS_DEFS[game.progression?.cls]?.defend === 'shield') play('shield_block', { position: p.point, volume: 0.9 });
          return;
        }
        play(p.parried ? 'parry' : 'block_hit', { position: p.point, volume: 0.8 });
      });
      ev.on('parry', (p) => {
        const caster = familyOf(p.cls || game.progression?.cls) === 'caster';
        play(styleOf(p.cls || game.progression?.cls) === 'hammer' ? 'shield_block' : 'parry', { position: p.point, volume: caster ? 0.75 : 1, pitch: caster ? 1.25 : 1 });
        duck(0.45, 0.7);
      });
      // ---- v4 tell cues (§5.5): spatialised, ≤ 2 concurrent tell channels (nearest impact wins), music −3 dB while a
      // tell targets the player; commit tick / parry "ting" at lock; punish chime.
      ev.on('tellStart', (p) => {
        if (!p || p.sound === false) return;
        const e = p.enemy, wind = +p.windup || 0;
        const tnow = game.realTime || 0, end = tnow + Math.max(0.3, wind);
        if (p.targetsPlayer !== false) targeting.set(p.enemy || p.id, end + 0.3);
        let slot = -1, latest = -1;
        for (let i = 0; i < 2; i++) {
          const s = tellSlots[i];
          if (!s.key || s.end < tnow) { slot = i; break; }
          if (latest < 0 || s.end > tellSlots[latest].end) latest = i;
        }
        if (slot < 0) { if (end < tellSlots[latest].end) slot = latest; else return; }
        const S = tellSlots[slot]; S.key = e || p.id; S.id = p.id; S.end = end; S.tell = p.tell;
        const heavy = e && (e.isBoss || e.isElite || e.breakMax > 0) || wind >= 1;
        play(tellCue(p.tell, heavy ? 'boss' : 'mobLight'), { position: p.pos || e?.object?.position, volume: 0.9, force: true });
        let n = 0; for (const x of tellSlots) if (x.key && x.end >= tnow) n++;
        if (n > tellMaxConc) tellMaxConc = n;
      });
      ev.on('tellCommit', (p) => {
        const S = tellSlots.find((x) => x.key && (x.key === p?.enemy || x.key === p?.id) && x.id === p?.id);
        if (!S) return;
        const e = p.enemy;
        play(S.tell === 'parry' ? 'tell_parry' : 'tell_commit', { position: e?.object?.position, volume: 0.8, force: true });
      });
      ev.on('tellEnd', (p) => {
        targeting.delete(p?.enemy || p?.id);
        for (const S of tellSlots) if (S.key && (S.key === p?.enemy || S.key === p?.id) && S.id === p?.id) S.key = null;
      });
      ev.on('punishWindow', (p) => play('punish', { position: p?.enemy?.object?.position, volume: 0.9 }));
      ev.on('perfectDodge', (p) => {
        play('perfect_dodge', { position: p.position });
        duck(0.5, 1.2); musicFilterDip(600, 1.2);
      });
      ev.on('guardBreak', (p) => play('guard_break', { position: p.position }));
      ev.on('dash', (p) => play('dash', { position: p.position, volume: 0.9 }));
      ev.on('swordSwing', (p) => {
        if (p.step === 'counter') play('cinematic_whoosh', { volume: 0.4, pitch: 1.7 });
      });
      ev.on('questStart', () => { play('quest_start', { volume: 0.9 }); duck(0.55, 2); });
      ev.on('questComplete', () => { play('quest_complete', { volume: 1 }); duck(0.3, 2.4); });
      ev.on('dialogueStart', () => { play('dialogue_open', { volume: 0.7 }); inDialogue = true; });
      ev.on('dialogueEnd', () => { inDialogue = false; });
      ev.on('awakeningReady', () => { play('awakening_ready', { volume: 0.9 }); duck(0.5, 1.6); });
      ev.on('updraftEnter', () => { if (!updraftLoop?.alive) updraftLoop = loop('updraft', { volume: 1 }); });
      ev.on('updraftExit', () => stopUpdraft(0.8));
      ev.on('glideEnd', () => stopUpdraft(0.5));
      ev.on('classChosen', (p) => { if (!p?.loaded) play('spirit_chime', { volume: 0.45 }); modeTimer = 0; });
      // class weapon sfx: one per cast (skillCast fires exactly once), by weapon style
      ev.on('skillCast', (p) => {
        const st = styleOf(p?.cls || game.progression?.cls);
        const w = WEAPON_SFX[st];
        if (!w) return;
        const slot = game.skills?.defs?.get?.(p.id)?.slot || p.slot;
        if (slot === 'basic' || slot === 'charged' || slot === 'lmb' || slot === 'rmb') play(w, { position: p.origin, volume: slot === 'charged' || slot === 'rmb' ? 1 : 0.75 });
        if (st === 'bow' && (slot === 'charged' || slot === 'rmb')) play('arrow_whizz', { position: p.origin, volume: 0.6 });
      });
      ev.on('finisherStart', () => duck(0.35, 4));
      ev.on('finisher', () => duck(0.35, 4));
      ev.on('settingsChanged', ({ key, settings }) => {
        const sv = settings || game.settings?.values; if (!sv) return;
        if (key === 'volMaster' || key === '*') vol.master = sv.volMaster ?? vol.master;
        if (key === 'volMusic' || key === '*') vol.music = sv.volMusic ?? vol.music;
        if (key === 'volSfx' || key === '*') vol.sfx = sv.volSfx ?? vol.sfx;
        if (key === 'volMaster' || key === 'volMusic' || key === 'volSfx' || key === '*') applyVolumes();
      });
    },

    update(dt, realDt) {
      const inp = game.input;
      if (inp?.raw ? inp.raw.pressed('KeyM') : inp?.pressed?.('KeyM')) setMuted(!muted);
      if (!E || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      try {
        // music state (checked a few times per second; inCombat iterates enemies)
        modeTimer -= realDt;
        if (modeTimer <= 0) {
          modeTimer = 0.5;
          const mode = pickMode();
          if (mode !== music.mode) music.setMode(mode);
        }
        if (now >= tempDuckUntil) tempDuck = 1;
        if (targeting.size) { pruneNow = game.realTime || 0; targeting.forEach(pruneTarget); }
        if (targeting.size) { tempDuck = Math.min(tempDuck, 0.708); if (tempDuckUntil < now + 0.1) tempDuckUntil = now + 0.1; }  // −3 dB while a tell targets the player
        const d = now < silenceUntil ? 0.0001 : duckTarget * tempDuck * (inDialogue ? 0.7 : 1);
        if (Math.abs(d - musicDuck) > 0.001) {
          const fast = d < musicDuck;
          musicDuck = d;
          const g = MUSIC_BASE * vol.music * d;
          E.music.gain.cancelScheduledValues(now); E.music.gain.setTargetAtTime(g, now, fast ? 0.08 : 0.5);
          E.musicSend.gain.cancelScheduledValues(now); E.musicSend.gain.setTargetAtTime(g, now, fast ? 0.08 : 0.5);
        }
        music.update(realDt);
        // mage barrier hum while blocking (player exposes `blocking`; no block start/stop events)
        const P = game.player;
        const dk = CLASS_DEFS[P?.cls || game.progression?.cls]?.defend;
        const wantBarrier = !!(P?.blocking && (dk === 'barrier' || dk === 'ward') && game.state === 'playing');
        if (wantBarrier && !barrierLoop?.alive) barrierLoop = loop('barrier', { volume: 0.5 });
        else if (!wantBarrier && barrierLoop) { barrierLoop.stop(0.25); barrierLoop = null; }
        if (amb) {
          const playing = game.state === 'playing' || game.state === 'title';
          const calm = music.mode === 'field' || music.mode === 'village' || music.mode === 'title';
          const camY = game.camera?.matrixWorld?.elements?.[13] || 0;
          amb.update(realDt, { level: playing ? (calm ? 1 : 0.6) : 0.4, birds: calm && playing, windMul: 1 + Math.min(1, Math.max(0, camY - 20) / 40) });
        }
      } catch (err) {
        if (!api._warned) { api._warned = true; console.warn('[audio] update', err); }
      }
    },

    /** Test helper: render a sound offline through a fresh engine. raw=true bypasses buses/compressor.
     *  Returns {name, peak, rms}. */
    async analyze(name, seconds = 2, raw = false) {
      const sr = 22050;
      const off = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
      const OE = new Engine(off);
      const g = off.createGain();
      if (raw) g.connect(off.destination);
      else { g.connect(OE.sfx); const sg = off.createGain(); sg.gain.value = 0.35; g.connect(sg); sg.connect(OE.sfxSend); }
      SOUNDS[name](OE, g, 0.01, 1);
      return measure(name, await off.startRendering());
    },
    /** Test helper: render `seconds` of a music theme offline (default music bus level). */
    async analyzeMusic(theme, seconds = 8, startBar = 0) {
      const sr = 22050;
      const off = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
      const OE = new Engine(off);
      const M = new Music(OE);
      M.start(theme);
      if (startBar && M.layers[theme]) M.layers[theme].step0 = -startBar * 16;
      // schedule the whole window up front (offline: currentTime stays 0 until rendering)
      let n = 0;
      while (M.nextTime < seconds && n++ < 4000) { M.schedule(M.step, M.nextTime); M.nextTime += 60 / 108 / 4; M.step++; }
      const r = measure(theme, await off.startRendering());
      r.steps = n;
      return r;
    },
  };
  function measure(name, buf) {
    let peak = 0, sum = 0; const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; }
    return { name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
  }
  return api;
}
