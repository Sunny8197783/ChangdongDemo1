// tells zones (PLAN v4 §5.1, §5.2, §7.4.4): hazard (lingering red hatch), safe (mint ring + rising vertical chevrons),
// projectile ground markers (pool 12, following the orb), travelling jump shockwaves (12 m/s, 0.25 m band) and the
// punish sparkles (rotating white-cyan diamonds + '공격 기회!' world text). All in the threat scene.
import * as THREE from 'three';
import { threatColor, THREAT } from '../core/threat.js';
import { setShape, TELL_CODE } from './shapes.js';
import { STYLE } from './decals.js';

const SAFE_CHEVRONS = 6;
const DIAMONDS = 4;

export function createZones(game, decals, sprites) {
  const now = () => game.enemyTime || 0;
  const zones = [];                 // {rec, kind, until, stopped, sprites[], nameKo, phase}
  const markers = [];               // {rec, obj, r, stopped}
  const waves = [];                 // {rec, t0, speed, band, maxR, x, y, z, handle}
  const punishes = [];              // {enemy, until, sprites[], text}
  const _p = { x: 0, y: 0, z: 0 };
  const _sh = { kind: 'circle', pos: _p, r: 1, inner: 0 };
  const cb = () => game.assist?.colorblind || null;

  function colorOf(s, kind) { const c = threatColor(kind, cb()); s.col.setHex(c.rim); s.outl.setHex(c.edge ?? 0x101010); }

  // ---- hazard / safe
  function zone(kind, o = {}) {
    const pos = o.pos || o.shape?.pos;
    if (!pos) return { stop() {}, alive: false };
    const rec = decals.alloc('zone');
    const Z = { rec, kind, until: o.dur > 0 ? now() + o.dur : Infinity, stopped: false, sprites: [], nameKo: o.nameKo || '', hazardKind: o.kind || '', phase: Math.random() * 6.28,
      x: pos.x, z: pos.z, r: o.r ?? o.shape?.r ?? 3, S: null };
    if (rec) {
      if (o.shape && o.shape.kind) setShape(rec.S, { ...o.shape, pos }, pos, o.shape.dir);
      else setShape(rec.S, { kind: 'circle', pos, r: o.r ?? 3 }, pos, null);
      rec.tell = TELL_CODE[kind]; rec.style = STYLE.noFront | STYLE.noChevron; rec.mode = 'zone'; rec.clock = 'enemy';
      rec.start = now(); rec.dur = 1; rec.progOverride = 0; rec.fadeIn = 0.2; rec.lockAt = 0;
      decals.layout(rec);
      Z.S = rec.S;
      rec.owner = Z;
    }
    if (kind === 'safe') {
      for (let i = 0; i < SAFE_CHEVRONS; i++) { const s = sprites.alloc('safe'); if (!s) break; s.cell = 'chevron'; colorOf(s, 'safe'); s.size = 0.55; s.minPx = 14; Z.sprites.push(s); }
    }
    zones.push(Z);
    const api = {
      get alive() { return !Z.stopped; },
      stop() { endZone(Z); },
      setPos(v) { if (Z.rec && v) { Z.rec.S.px = v.x; Z.rec.S.pz = v.z; Z.rec.S.py = v.y || 0; Z.x = v.x; Z.z = v.z; decals.layout(Z.rec); } },
      nameKo: Z.nameKo, kind,
    };
    Z.api = api;
    return api;
  }
  function endZone(Z) {
    if (Z.stopped) return;
    Z.stopped = true;
    if (Z.rec) decals.end(Z.rec, false);
    for (const s of Z.sprites) sprites.free(s);
    Z.sprites.length = 0;
  }

  // ---- projectile markers
  function projectile(obj, { r = 0.6 } = {}) {
    if (!obj) return { stop() {} };
    const rec = decals.alloc('marker');
    const M = { rec, obj, r, stopped: false };
    if (rec) {
      const p = obj.position || obj;
      setShape(rec.S, { kind: 'ring', pos: p, r, inner: Math.max(0.05, r * 0.55) }, p, null);
      rec.S.py = -1e6;                               // conform to the ground below the orb
      rec.tell = TELL_CODE.projectile; rec.style = STYLE.marker | STYLE.noFront; rec.mode = 'marker'; rec.start = now(); rec.dur = 1; rec.progOverride = 0; rec.fadeIn = 0.08;
      decals.layout(rec);
      markers.push(M);
    }
    return { stop() { if (!M.stopped) { M.stopped = true; if (M.rec) decals.end(M.rec, false); } }, get alive() { return !M.stopped; } };
  }

  // ---- travelling shockwave (jump tells)
  function wave(x, y, z, { speed = 12, band = 0.25, maxR = 10 } = {}, handle = null) {
    const rec = decals.alloc('wave');
    const W = { rec, t0: now(), speed, band, maxR, x, y, z, handle, done: false };
    if (rec) {
      _p.x = x; _p.y = y; _p.z = z; _sh.kind = 'ring'; _sh.r = band; _sh.inner = 0;
      setShape(rec.S, _sh, _p, null);
      rec.tell = TELL_CODE.jump; rec.style = STYLE.solid | STYLE.noFront; rec.mode = 'wave'; rec.start = now(); rec.dur = 1; rec.progOverride = 0;
      decals.layout(rec);
    }
    waves.push(W);
    return W;
  }
  function waveR(W) {
    if (!W || W.done) return -1;
    const R = (now() - W.t0) * W.speed;
    return R <= W.maxR ? R : -1;
  }

  // ---- punish sparkles
  function punishFx(e, dur) {
    if (!e) return;
    for (const P of punishes) if (P.enemy === e) { P.until = now() + dur; P.t0 = now(); return; }
    const P = { enemy: e, until: now() + dur, t0: now(), sprites: [], text: null };
    for (let i = 0; i < DIAMONDS; i++) {
      const s = sprites.alloc('punish'); if (!s) break;
      s.cell = 'diamond'; s.col.setHex(THREAT.punish.rim); s.outl.setHex(THREAT.punish.outline); s.size = 0.34; s.minPx = 9; P.sprites.push(s);
    }
    const t = sprites.alloc('punishText');
    if (t) { t.cell = 'text'; t.col.setHex(THREAT.punish.rim); t.outl.setHex(THREAT.punish.outline); t.size = 0.5; t.aspect = 4; t.minPx = 16; P.text = t; }
    punishes.push(P);
  }
  function endPunish(i) {
    const P = punishes[i];
    for (const s of P.sprites) sprites.free(s);
    if (P.text) sprites.free(P.text);
    punishes.splice(i, 1);
  }

  /** Per-frame bookkeeping (once per frame). */
  function frame(tR) {
    const t = now();
    for (let i = zones.length - 1; i >= 0; i--) {
      const Z = zones[i];
      if (!Z.stopped && t >= Z.until) endZone(Z);
      if (Z.stopped) { if (!Z.rec || !Z.rec.active) zones.splice(i, 1); continue; }
      if (Z.kind === 'safe' && Z.sprites.length) {
        const S = Z.rec ? Z.rec.S : null, r = S ? (S.kind === 'ring' ? S.inner + (S.r - S.inner) * 0.5 : S.r * 0.7) : Z.r * 0.7;
        const cx = S ? S.px : Z.x, cz = S ? S.pz : Z.z, gy = Z.rec ? Z.rec.oy : 0;
        for (let k = 0; k < Z.sprites.length; k++) {
          const s = Z.sprites[k];
          const ph = ((tR * 0.8 + k / Z.sprites.length) % 1);          // rising: 0 → 1 over 1.25 s, staggered
          const a = Z.phase + (k / Z.sprites.length) * Math.PI * 2;
          const rr = k % 2 ? r : r * 0.45;
          s.x = cx + Math.sin(a) * rr; s.z = cz + Math.cos(a) * rr; s.y = gy + 0.25 + ph * 1.3;
          s.alpha = Math.min(1, ph * 5) * (1 - ph) * 1.4;
        }
      }
    }
    for (let i = markers.length - 1; i >= 0; i--) {
      const M = markers[i];
      if (!M.stopped && (!M.obj || (M.obj.isObject3D && !M.obj.parent) || M.obj.alive === false)) { M.stopped = true; if (M.rec) decals.end(M.rec, false); }
      if (M.stopped) { if (!M.rec || !M.rec.active) markers.splice(i, 1); continue; }
      const p = M.obj.position || M.obj;
      if (M.rec && (Math.abs(p.x - M.rec.S.px) > 0.02 || Math.abs(p.z - M.rec.S.pz) > 0.02)) { M.rec.S.px = p.x; M.rec.S.pz = p.z; decals.layout(M.rec); }
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const W = waves[i];
      const R = (t - W.t0) * W.speed;
      if (R > W.maxR) { W.done = true; if (W.rec) decals.end(W.rec, false); waves.splice(i, 1); continue; }
      if (W.rec) { const S = W.rec.S; S.r = R + W.band * 0.5; S.inner = Math.max(0, R - W.band * 0.5); decals.layout(W.rec); }
    }
    for (let i = punishes.length - 1; i >= 0; i--) {
      const P = punishes[i], e = P.enemy;
      if (t >= P.until || !e || e.alive === false) { endPunish(i); continue; }
      const o = e.object?.position; if (!o) continue;
      const h = e.height ?? e.model?.headTop ?? 1.8, rad = (e.radius ?? 0.7) + 0.35;
      const left = P.until - t, fade = left < 0.25 ? left / 0.25 : 1, fin = Math.min(1, (t - P.t0) / 0.12);
      for (let k = 0; k < P.sprites.length; k++) {
        const s = P.sprites[k], a = tR * 1.6 + k * (Math.PI * 2 / P.sprites.length);
        s.x = o.x + Math.sin(a) * rad; s.z = o.z + Math.cos(a) * rad; s.y = o.y + h * (0.45 + 0.12 * Math.sin(tR * 2.2 + k));
        s.rot = tR * 2.5 + k; s.alpha = fade * fin;
      }
      if (P.text) { P.text.x = o.x; P.text.z = o.z; P.text.y = o.y + h + 0.75; P.text.alpha = fade * fin; }
    }
  }
  function reset() {
    for (const Z of zones) endZone(Z);
    for (const M of markers) { M.stopped = true; if (M.rec) decals.end(M.rec, false); }
    for (let i = punishes.length - 1; i >= 0; i--) endPunish(i);
  }
  return { zone, projectile, wave, waveR, punishFx, frame, reset, zones, markers, waves, punishes };
}
