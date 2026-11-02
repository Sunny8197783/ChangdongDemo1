// Audio module: every sound is synthesized with WebAudio (no files).
// play(name, {position, volume, pitch}), loop(name, opts) -> {stop, setVolume, setPitch}, resume().
import { Engine } from './audio/synth.js';
import { SOUNDS } from './audio/sounds.js';
import { Music, Ambience } from './audio/music.js';

const DEDUPE = 0.045;         // same sound name within this window is skipped (events + direct calls overlap)
const MAX_VOICES = 44;
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
  let modeTimer = 0, victoryUntil = 0, musicDuck = 1, duckTarget = 1;
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
      E.master.gain.value = muted ? 0 : 0.9;
      music = new Music(E);
      return true;
    } catch (err) {
      console.warn('[audio] WebAudio unavailable:', err?.message);
      failed = true; ctx = null; E = null;
      return false;
    }
  }

  function startBeds() {
    if (!E || ctx.state !== 'running') return;
    music.start();
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
  function play(name, opts) {
    try {
      if (!E || ctx.state !== 'running' || muted) return;
      const recipe = SOUNDS[name];
      if (!recipe) return;
      const now = ctx.currentTime;
      const o = opts || {};
      if (!o.force) {
        const lt = last.get(name);
        if (lt !== undefined && now - lt < DEDUPE) return;
      }
      let vol = o.volume ?? 1;
      const s = spatial(o.position);
      vol *= s.gain;
      if (vol < CULL_GAIN) return;
      if (voices >= MAX_VOICES && (vol < 0.6 || name === 'footstep')) return;
      last.set(name, now);
      const pitch = (o.pitch ?? 1) * (o.exactPitch ? 1 : 0.95 + Math.random() * 0.1);

      const g = ctx.createGain(); g.gain.value = Math.min(vol, 2.5);
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
      setTimeout(() => {
        voices--;
        try { g.disconnect(); pan.disconnect(); send.disconnect(); lp?.disconnect(); } catch (_) { /* */ }
      }, (dur + 0.4) * 1000);
    } catch (err) {
      if (!play._warned) { play._warned = true; console.warn('[audio] play failed', name, err); }
    }
  }

  // ---------- loops ----------
  function makeCharge(o) {
    const now = ctx.currentTime;
    const base = { fire: 98, ice: 130.8, lightning: 116.5, wind: 110, earth: 82.4 }[o.element] || 110;
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

  const LOOPS = { charge: makeCharge, glide: makeGlide, wind: makeGlide };

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
    if (E) { const t = ctx.currentTime; E.master.gain.cancelScheduledValues(t); E.master.gain.setTargetAtTime(muted ? 0 : 0.9, t, 0.05); }
    try { game.ui?.toast?.(muted ? '소리 꺼짐 (M)' : '소리 켜짐 (M)', { duration: 1.6 }); } catch (_) { /* */ }
  }

  // ---------- helpers ----------
  const posOf = (p) => p?.point || p?.position || p?.origin || p?.target?.object?.position || null;
  let chargeLoop = null, glideLoop = null;

  const api = {
    get ctx() { return ctx; },
    get muted() { return muted; },
    get voices() { return voices; },
    get musicMode() { return music?.mode || null; },
    get musicStep() { return music?.step || 0; },
    sounds: Object.keys(SOUNDS),
    resume, play, loop, setMuted,
    toggleMute() { setMuted(!muted); },

    init() {
      const ev = game.events;
      ev.on('spellCast', (p) => {
        const pos = p.origin;
        play('cast_' + p.element, { position: pos, volume: p.kind === 'basic' ? 0.7 : 1 });
        if (p.kind === 'heavy') play('cast_heavy', { position: pos, volume: 0.8 });
        if (p.kind === 'ultimate') {
          play('ultimate', { position: pos, volume: 1 });
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
        if (p.crit) play('crit', { position: pos, volume: 0.9 });
        if (!p.killed && !p.target?.isDummy && now - hurtT > 0.12 && Math.random() < 0.6) {
          hurtT = now;
          play(p.target?.isBoss ? 'boss_hurt' : 'enemy_hurt', { position: pos, volume: 0.6, pitch: p.target?.mass > 2 ? 0.55 : 1 });
        }
      });
      ev.on('reaction', (p) => {
        const pos = p.point;
        play('reaction', { position: pos, volume: 1 });
        switch (p.id) {
          case 'shatter': play('shatter', { position: pos, volume: 1.1 }); break;
          case 'melt': case 'evaporate': case 'steam_burst': play('steam', { position: pos }); break;
          case 'electrocute': case 'overload': case 'superconduct': play('thunder', { position: pos, volume: p.id === 'overload' ? 0.8 : 0.5 }); break;
          case 'magma': case 'skyslam': play('explode_earth', { position: pos, volume: 0.8 }); break;
          case 'swirl': case 'updraft': play('explode_wind', { position: pos, volume: 0.7 }); break;
          case 'flashfreeze': play('impact_ice', { position: pos }); break;
          default: break;
        }
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
      ev.on('chargeStart', (p) => { chargeLoop?.stop(); chargeLoop = loop('charge', { element: p.element, volume: 0.45 }); });
      ev.on('chargeEnd', () => { chargeLoop?.stop(); chargeLoop = null; });
      ev.on('elementChanged', () => play('ui_select', { volume: 0.7 }));
      ev.on('spellFail', (p) => play(p.reason === 'mana' ? 'mana_empty' : 'cooldown', { volume: 0.8 }));
      ev.on('bossSpawn', (p) => { play('boss_roar', { position: p.boss?.object?.position, volume: 1.3 }); modeTimer = 0; });
      ev.on('bossDefeated', (p) => { play('explode_earth', { position: p.boss?.object?.position, volume: 1.2, pitch: 0.6 }); });
      ev.on('campCleared', () => play('camp_cleared', { volume: 1 }));
      ev.on('victory', () => { play('victory', { volume: 1 }); victoryUntil = (ctx?.currentTime || 0) + 9; music?.setMode('victory'); });
      ev.on('playerHurt', () => play('player_hurt', { volume: 0.9 }));
      ev.on('playerDeath', () => { play('player_death', { volume: 1 }); chargeLoop?.stop(); glideLoop?.stop(); });
      ev.on('playerRespawn', () => play('ui_select', { volume: 0.8, pitch: 0.7 }));
      ev.on('enemyAlert', (p) => play('alert', { position: p.enemy?.object?.position, volume: 0.6 }));
      ev.on('stateChange', ({ state }) => {
        duckTarget = state === 'paused' ? 0.35 : state === 'dead' ? 0.3 : 1;
        if (state !== 'playing') { chargeLoop?.stop(); chargeLoop = null; glideLoop?.stop(); glideLoop = null; }
      });
    },

    update(dt, realDt) {
      if (game.input?.pressed?.('KeyM')) setMuted(!muted);
      if (!E || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      try {
        // music state (checked a few times per second; inCombat iterates enemies)
        modeTimer -= realDt;
        if (modeTimer <= 0) {
          modeTimer = 0.5;
          let mode = 'explore';
          if (now < victoryUntil) mode = 'victory';
          else if (game.state === 'playing' || game.state === 'paused') {
            const boss = game.enemies?.boss;
            const pp = game.player?.object?.position;
            const bossNear = boss && boss.alive && (!pp || boss.object.position.distanceTo(pp) < 75);
            if (bossNear) mode = 'boss';
            else if (game.enemies?.inCombat) mode = 'battle';
          }
          if (mode !== music.mode) music.setMode(mode);
        }
        if (Math.abs(duckTarget - musicDuck) > 0.001) {
          musicDuck = duckTarget;
          E.music.gain.setTargetAtTime(0.26 * musicDuck, now, 0.3);
          E.musicSend.gain.setTargetAtTime(0.26 * musicDuck, now, 0.3);
        }
        music.update(realDt);
        if (amb) {
          const playing = game.state === 'playing' || game.state === 'title';
          const calm = music.mode === 'explore';
          const camY = game.camera?.matrixWorld?.elements?.[13] || 0;
          amb.update(realDt, { level: playing ? (calm ? 1 : 0.6) : 0.4, birds: calm && playing, windMul: 1 + Math.min(1, Math.max(0, camY - 20) / 40) });
        }
      } catch (err) {
        if (!api._warned) { api._warned = true; console.warn('[audio] update', err); }
      }
    },

    /** Test helper: render a sound offline, returns {peak, rms, dur}. */
    async analyze(name, seconds = 2) {
      const sr = 22050;
      const off = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
      const OE = new Engine(off);
      const g = off.createGain(); g.connect(OE.sfx);
      const sg = off.createGain(); sg.gain.value = 0.35; g.connect(sg); sg.connect(OE.sfxSend);
      SOUNDS[name](OE, g, 0.01, 1);
      const buf = await off.startRendering();
      let peak = 0, sum = 0; const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; }
      return { name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
    },
  };
  return api;
}
