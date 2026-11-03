// Cinematic module v3 (CONTRACT §16): shot sequencer (world & gameplay modes), DOM overlays (letterbox, titles,
// subtitles, fades, film look, calligraphic skill splash, skip ring), camera helpers, and the set pieces:
// playIntro (lore), playClassRite (각인 의식), playReveal (갈라진 봉인), playSpiritFreed, playBossIntro, playPhase,
// playFinale (the dive strike), playEnding (v3), finisher(o) (필살기 template for all 9 elements + 'symphony').
// Every cinematic is skippable (hold Space/Esc; the finale strike asks for one input) and restores state on end.
import * as THREE from 'three';
import { clamp, lerp } from './core/utils.js';
import { CLASS_IDS } from './core/classes.js';
import { elColor } from './core/elements.js';
import { createOverlay } from './cinematic/overlay.js';
import { createGrade } from './cinematic/grade.js';
import { Stage, makeRune, makePillar, makeMist, makeMotes, makeColossus, makeWyrm, glowTex, starTex, SPIRITS, LOST_SPIRITS, SPIRITS_ALL } from './cinematic/assets.js';
import { buildIntro } from './cinematic/intro.js';
import { buildFinisher } from './cinematic/finisher.js';
import { buildClassRite } from './cinematic/ceremony.js';
import { buildReveal } from './cinematic/reveal.js';
import { buildBossIntro, buildSpiritFreed, buildPhase, BOSS_CAM } from './cinematic/acts.js';
import { buildFinale, buildEnding } from './cinematic/finale.js';

const EASE = {
  linear: (t) => t,
  in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => t * t * (3 - 2 * t),
  inCubic: (t) => t * t * t, outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
  outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
};

export function createCinematic(game) {
  const { camera } = game;
  const ov = createOverlay(game);
  const grade = createGrade(game);

  const _pos = new THREE.Vector3(), _look = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const _gamePos = new THREE.Vector3(), _gameQuat = new THREE.Quaternion(), _q = new THREE.Quaternion();
  const startPos = new THREE.Vector3(), startLook = new THREE.Vector3(), lastPos = new THREE.Vector3(), lastLook = new THREE.Vector3();
  let seq = null;
  let baseFov = camera.fov;
  let hintT = 0, holdT = 0;

  // ---------------------------------------------------------------- helpers
  const hudOff = (on) => { try { document.getElementById('ui')?.classList.toggle('cin-hud-off', !!on); } catch (_) { /* */ } };
  const vec = (v, e, s, tt, out) => {
    if (typeof v === 'function') { const r = v(e, s, tt); return r ? out.copy(r) : null; }
    return v ? out.copy(v) : null;
  };
  const ease = (s) => (typeof s.ease === 'function' ? s.ease : EASE[s.ease || 'inOut'] || EASE.inOut);
  const groundY = (x, z) => { try { return game.world?.getGroundHeight?.(x, z) ?? game.world?.getHeight?.(x, z) ?? -1e9; } catch (_) { return -1e9; } };

  /** Camera orbit around `target` (Vector3 or fn): angles in radians, from→to. Returns a position fn. */
  function orbit(target, { radius = 8, height = 2, from = 0, to = Math.PI / 2, radiusTo, heightTo } = {}) {
    const out = new THREE.Vector3(), tv = new THREE.Vector3();
    return (e) => {
      const t = typeof target === 'function' ? target(e) : target; tv.copy(t);
      const a = lerp(from, to, e), r = lerp(radius, radiusTo ?? radius, e), h = lerp(height, heightTo ?? height, e);
      return out.set(tv.x + Math.sin(a) * r, tv.y + h, tv.z + Math.cos(a) * r);
    };
  }
  /** Straight dolly shot from→to looking at lookAt (Vector3 or fn). Spread into a shot: {...dolly(a,b,c), duration}. */
  function dolly(from, to, lookAt) { return { from, to, lookFrom: lookAt, lookTo: lookAt }; }

  function captureCamera() {
    startPos.copy(camera.position);
    camera.getWorldDirection(_a); startLook.copy(camera.position).addScaledVector(_a, 20);
  }

  // ---------------------------------------------------------------- sequencing
  function startShot(i) {
    const s = seq.shots[i];
    seq.i = i; seq.t = 0; seq.fadeOutDone = false; seq.cueI = 0;
    if (!s) return;
    if (!s.keepStart) { startPos.copy(lastPos); startLook.copy(lastLook); }
    s._fov0 = camera.fov;
    if (s.fadeIn) { ov.setFade(1); ov.fade(0, s.fadeIn); }
    if (s.letterbox != null) ov.letterbox(!!s.letterbox);
    if (s.title) ov.title(s.title.text, { ...s.title, dur: s.title.dur ?? s.duration });
    if (s.subtitle) ov.subtitle(s.subtitle.text, { speaker: s.subtitle.speaker, dur: s.subtitle.dur ?? s.duration });
    if (s.shake) game.vfx?.shake?.(s.shake);
    if (s.grade) grade.set(s.grade, s.gradeDur ?? 2);
    if (s.cues) s.cues.sort((a, b) => a.at - b.at);
    try { s.onStart?.(s); } catch (err) { console.error('[cinematic] onStart', err); }
  }
  function endShot(s) {
    if (!s || s._ended) return; s._ended = true;
    try { s.onEnd?.(s); } catch (err) { console.error('[cinematic] onEnd', err); }
  }
  function runCue(c) {
    try {
      if (c.title) ov.title(c.title.text, c.title);
      if (c.subtitle) ov.subtitle(c.subtitle.text, c.subtitle);
      if (c.fade) ov.fade(c.fade[0], c.fade[1]);
      if (c.grade) grade.set(c.grade, c.gradeDur ?? 2);
      c.call?.();
    } catch (err) { console.error('[cinematic] cue', err); }
  }

  /**
   * Play a shot list. opts: {mode:'gameplay'|'world', letterbox=true, skippable=true, film, onEnd, onSkip,
   * hidePlayer, endFade (s), clampGround (m above terrain, world mode default 1.2)}.
   */
  function play(shots, opts = {}) {
    if (seq) finish(true);
    const mode = opts.mode === 'gameplay' ? 'gameplay' : 'world';
    seq = { shots: shots.filter(Boolean), opts, mode, i: -1, t: 0, total: 0, prevState: game.state, ending: false, skipped: false };
    baseFov = camera.fov;
    api.active = true; api.timeScale = 1;
    game.input?.lock?.('cinematic');
    if (mode === 'world' && game.state !== 'cutscene') game.setState?.('cutscene');
    ov.letterbox(opts.letterbox !== false);
    ov.film(opts.film ?? mode === 'world');
    hudOff(mode === 'gameplay' || opts.hideHud);
    hintT = opts.skippable === false ? 0 : (opts.hintTime ?? 4); holdT = 0;
    if (opts.hidePlayer && game.player?.object) { seq.playerVis = game.player.object.visible; game.player.object.visible = false; }
    captureCamera(); lastPos.copy(startPos); lastLook.copy(startLook);
    startShot(0);
    return { stop: () => seq && finish(true), get t() { return seq?.total ?? 0; } };
  }

  function finish(skipped = false) {
    if (!seq) return;
    const S = seq; seq = null;
    S.skipped = skipped;
    endShot(S.shots[S.i]);
    if (skipped) { try { S.opts.onSkip?.(); } catch (err) { console.error('[cinematic] onSkip', err); } }
    api.active = false; api.timeScale = 1;
    game.input?.unlock?.('cinematic');
    grade.restore();
    if (S.mode === 'world') { camera.fov = baseFov; camera.updateProjectionMatrix(); }
    if (S.opts.hidePlayer && game.player?.object) game.player.object.visible = S.playerVis ?? true;
    ov.reset(true);
    hudOff(false);
    if (S.mode === 'world' && game.state === 'cutscene') {
      const back = S.prevState === 'cutscene' || S.prevState === 'title' ? (S.opts.endState || 'cutscene') : S.prevState;
      game.setState?.(back);
    }
    try { S.opts.onEnd?.({ skipped }); } catch (err) { console.error('[cinematic] onEnd', err); }
    // after onEnd (which usually switches state), lift the black with a CSS transition (runs even when we stop updating)
    ov.fadeOutCSS(S.opts.endFade ?? (S.mode === 'world' ? 1.1 : 0.35));
  }

  function skip() {
    if (!seq || seq.ending) return;
    seq.ending = true; seq.endT = 0.4; ov.fade(1, 0.35);
  }

  function update(dt, realDt) {
    const rdt = Math.min(realDt ?? dt, 0.1);
    grade.update(rdt);
    ov.update(rdt);
    if (!seq) return;
    const S = seq;
    // the game camera (set by player this frame in gameplay mode)
    _gamePos.copy(camera.position); _gameQuat.copy(camera.quaternion);

    // skip handling (hold Space / Esc 0.8 s)
    const raw = game.input?.raw;
    if (S.opts.skippable !== false && raw && !S.ending) {
      const any = raw.pressed('Space') || raw.pressed('Escape') || raw.pressed('Enter') || raw.mousePressed?.(0);
      if (any) hintT = Math.max(hintT, 3);
      const held = raw.down('Space') || raw.down('Escape');
      holdT = held ? holdT + rdt : Math.max(0, holdT - rdt * 3);
      if (holdT >= 0.8) skip();
      hintT -= rdt;
      ov.skip(hintT > 0 || holdT > 0, holdT / 0.8);
    } else ov.skip(false, 0);
    if (S.ending) {
      S.endT -= rdt;
      if (S.endT <= 0) { finish(true); return; }
    }

    // advance
    let s = S.shots[S.i];
    S.t += rdt; S.total += rdt;
    while (s && S.t >= s.duration) {
      const over = S.t - s.duration;
      applyShot(s, 1, s.duration);
      endShot(s);
      if (S.i + 1 >= S.shots.length) { finish(false); return; }
      startShot(S.i + 1); S.t = over; s = S.shots[S.i];
      if (seq !== S) return;
    }
    if (!s) { finish(false); return; }
    // cues
    if (s.cues) while (S.cueI < s.cues.length && s.cues[S.cueI].at <= S.t) runCue(s.cues[S.cueI++]);
    // fade out
    if (s.fadeOut && !S.fadeOutDone && s.duration - S.t <= s.fadeOut) { S.fadeOutDone = true; ov.fade(1, Math.max(0.05, s.duration - S.t)); }
    applyShot(s, S.t / s.duration, S.t, rdt);
  }

  function applyShot(s, u, tt, rdt = 0) {
    u = clamp(u, 0, 1);
    const e = ease(s)(u);
    api.timeScale = typeof s.timeScale === 'function' ? s.timeScale(u) : s.timeScale ?? (seq?.mode === 'gameplay' ? 1 : 1);
    // position
    let p;
    {
      const a = (s.from && vec(s.from, e, s, tt, _a)) || _a.copy(startPos);
      const b = s.to ? vec(s.to, e, s, tt, _b) : null;
      p = b ? _pos.lerpVectors(a, b, e) : _pos.copy(a);
    }
    // look target
    let l;
    if (typeof s.look === 'function') l = vec(s.look, e, s, tt, _look);
    else {
      const a = (s.lookFrom && vec(s.lookFrom, e, s, tt, _a)) || _a.copy(startLook);
      const b = s.lookTo ? vec(s.lookTo, e, s, tt, _b) : null;
      l = b ? _look.lerpVectors(a, b, e) : _look.copy(a);
    }
    // keep above ground
    const cg = s.clampGround ?? seq?.opts.clampGround ?? (seq?.mode === 'world' ? 1.2 : null);
    const av = s.avoid ?? seq?.opts.avoid ?? (seq?.mode === 'gameplay' ? 0.5 : null);
    if (av) { try { game.world?.resolveCollision?.(p, av); } catch (_) { /* */ } }
    if (cg != null) { const gy = groundY(p.x, p.z) + cg; if (p.y < gy) p.y = gy; }
    camera.position.copy(p);
    camera.up.set(0, 1, 0);
    camera.lookAt(l);
    if (s.roll) camera.rotateZ(typeof s.roll === 'function' ? s.roll(e) : s.roll);
    lastPos.copy(p); lastLook.copy(l);
    // blend back into the gameplay camera (gameplay mode return shot)
    if (s.blendToGame) {
      const k = EASE.inOutCubic(u);
      camera.position.lerp(_gamePos, k);
      _q.copy(camera.quaternion).slerp(_gameQuat, k); camera.quaternion.copy(_q);
    }
    // fov
    let fov = null;
    if (Array.isArray(s.fov)) fov = lerp(s.fov[0], s.fov[1], e);
    else if (typeof s.fov === 'function') fov = s.fov(e);
    else if (typeof s.fov === 'number') fov = s.fov;
    if (fov != null && s.blendToGame) fov = lerp(fov, baseFov, EASE.inOutCubic(u));
    if (fov != null && Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    try { s.onUpdate?.(u, rdt, e, tt); } catch (err) { if (!s._err) { s._err = true; console.error('[cinematic] onUpdate', err); } }
  }

  // ---------------------------------------------------------------- set pieces
  const ctx = {
    game, ov, grade, EASE, orbit, dolly, play: (...a) => play(...a),
    stage: () => new Stage(game),
    V: (x, y, z) => new THREE.Vector3(x, y, z),
    groundY,
    active: () => !!seq,
    /** End the current shot now (input-driven shots, e.g. the finale strike). */
    next: () => { if (seq) { const s = seq.shots[seq.i]; if (s) seq.t = Math.max(seq.t, s.duration); } },
  };
  const guard = (name, fn, onDone) => {
    try { return fn(); } catch (err) { console.error(`[cinematic] ${name}`, err); finish(true); try { onDone?.(); } catch (_) { /* */ } return null; }
  };
  const _burst = new THREE.Vector3();

  const api = {
    active: false, timeScale: 1, overlay: ov, grade, EASE,
    play, orbit, dolly, skip, stop: () => finish(true),
    get shotIndex() { return seq?.i ?? -1; },
    get elapsed() { return seq?.total ?? 0; },
    /** The lore intro (~75 s, world mode). onDone runs after it ends or is skipped. */
    playIntro(onDone) {
      try { return buildIntro(ctx, onDone); } catch (err) { console.error('[cinematic] intro', err); finish(true); onDone?.(); return null; }
    },
    /** Sword & magic 필살기 cinematic template (gameplay mode, ≈4 s). */
    finisher(o = {}) {
      try { return buildFinisher(ctx, o); } catch (err) { console.error('[cinematic] finisher', err); try { o.onImpact?.(); } catch (_) { /* */ } try { o.onEnd?.(); } catch (_) { /* */ } return null; }
    },
    /** 각인 의식: the spirits of CLASS_DEFS[cls] (primaries big in front, secondaries small behind) descend into the hero. */
    playClassRite(cls, onDone) {
      const c = CLASS_IDS.includes(cls) ? cls : (game.progression?.cls || CLASS_IDS[0]);
      return guard('class rite', () => buildClassRite(ctx, c, onDone), onDone);
    },
    /** v2 shim → playClassRite(progression.cls). */
    playBlessing(element = 'all', onDone) { return api.playClassRite(game.progression?.cls, onDone); },
    /** 갈라진 봉인: golem core rune, 테라곤's memory, mist down a root channel to the plateau, the wyrm on the roots. */
    playReveal(onDone) { return guard('reveal', () => buildReveal(ctx, onDone), onDone); },
    /** One parametric template for 운디나 / 녹스 / 실바니아 / 루미엘 (and any element). */
    playSpiritFreed(element, onDone) { return guard('spirit freed', () => buildSpiritFreed(ctx, element, onDone), onDone); },
    /** Boss intro: fade → await enemies.prewarmBoss(id) → opts.spawn() → per-boss camera path + title card. */
    playBossIntro(id, onDone, opts = {}) { return guard('boss intro', () => buildBossIntro(ctx, id, onDone, opts), onDone); },
    /** Gameplay-mode boss phase transition (≤ 4 s, skippable). */
    playPhase(id, phase, onDone) { return guard('phase', () => buildPhase(ctx, id, phase, onDone), onDone); },
    /** The finale dive strike (gameplay mode, one input: LMB / R / X). onDone at the impact. */
    playFinale(onDone) { return guard('finale', () => buildFinale(ctx, onDone), onDone); },
    /** Ending v3: golden pollen, the crown blooms, the time-lapse, the festival, credits with nine spirits, 끝. */
    playEnding(onDone) { return guard('ending', () => buildEnding(ctx, onDone), onDone); },
    /** A subtitle line outside a cinematic (boss voice lines: Nox's purify, Kalis's revive). */
    subtitle(text, sec = 3, speaker = '') { try { ov.subtitle(String(text || ''), { dur: sec, speaker }); } catch (_) { /* */ } },
    /** Finisher impact hook (magic): an element ring burst at `point`. */
    burstAt(point, element = 'physical') {
      if (!point) return;
      const col = element === 'symphony' ? 0xfff0f8 : elColor(element, 'hex');
      _burst.copy(point);
      try {
        game.vfx?.shockwave?.(_burst, { color: col, radius: 9, duration: 0.7 });
        game.vfx?.burst?.(_burst, { count: 50, color: [col, 0xffffff], speed: 10, spread: 1, size: 0.4, sizeEnd: 0, life: 0.9, shape: 'spark', drag: 1.5 });
      } catch (_) { /* */ }
    },
    SPIRITS, LOST_SPIRITS, SPIRITS_ALL, BOSS_CAM,
    get mode() { return seq?.mode || null; },
    init() {
      // pre-warm our shader programs (sprite/rune/pillar/mist/motes/silhouette) so set pieces never compile mid-game;
      // the warm stage stays alive but hidden so the programs are never released
      try {
        const st = new Stage(game);
        const cam = game.camera; cam.updateMatrixWorld();
        const p = new THREE.Vector3(0, 0, -6).applyMatrix4(cam.matrixWorld);
        const objs = [st.sprite(0xffffff, 1, glowTex()), st.sprite(0xffffff, 1, starTex()), makeRune(st, 0xffffff, 1), makePillar(st, 0xffffff, 1, 1), makeMist(st, p, { count: 2 }), makeMotes(st, p, { count: 2 }), makeColossus(st, 0.05), makeWyrm(st, p, { scale: 0.02, segs: 3 }).root];
        for (const o of objs) { if (!o.parent) st.add(o); o.position.copy(p); }
        game.renderer.compile(game.scene, cam);
        st.group.visible = false;
        api._warm = st;
      } catch (err) { console.warn('[cinematic] prewarm', err); }
    },
    update,
  };
  return api;
}
