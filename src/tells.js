// tells — threat readability (PLAN v4 §5, §7.4.4): ONE timing source for every enemy attack (telegraph = state machine),
// hit geometry identical to the drawn decal, and the threat-scene content (decals, body rims, icons, glints, punish
// sparkles, hazard/safe zones, projectile markers, jump shockwaves) drawn by core after the post chain.
//
//   const h = game.tells.attack(e, spec)            → TellHandle | null (null while !canAttack)
//   if (h && h.consumeStrike()) resolveHit()        // true exactly once, on the first sub-step with enemyTime ≥ start + dur
//   h.contains(pos, pad = 0.15) · tells.hitTest(shape, pos, pad) (= core/tellgeom reference, rad half-angles)
//   dur = max(windup, MIN[cls]) × assist.tellMul × (e.timeMul ?? 1) on game.enemyTime (no first-encounter bonus)
// Events: tellStart, tellCommit (lock), tellEnd {reason}, tellFirst {tell} (save section 'tells'), punishWindow.
// Per-frame APIs return reused objects: active() (records with reused Vector3s), footprints() ({data: Float32Array(64), n}).
import * as THREE from 'three';
import { THREAT, threatColor } from './core/threat.js';
import { hitTest, shapeDistance, makeShape, setShape, setDir, syncRef, centroid, writeFootprint, TELL_CODE, SHAPE_FAMILY, FOOT_KIND, TELL_KINDS } from './tells/shapes.js';
import { MIN, LOCK, tellDuration, isMelee, lockFor, startSound, PERFECT_WIN, TEACH, STALE_AFTER } from './tells/timing.js';
import { createDecals, STYLE, RIBBON } from './tells/decals.js';
import { createSprites } from './tells/icons.js';
import { createRims, rimSources, RIM_SLOTS } from './tells/body.js';
import { createZones } from './tells/zones.js';
import { createThumbs } from './tells/thumbs.js';

const MAX_ACTIVE = 32;
const LEGACY_SHAPES = { circle: 'circle', ring: 'ring', cone: 'cone', line: 'line', capsule: 'capsule', conecap: 'conecap' };

export function createTells(game) {
  const R = game.render;
  if (!R?.threatScene) { console.warn('[tells] game.render.threatScene missing → core stub'); return null; }
  const root = new THREE.Group(); root.name = 'tells'; root.matrixAutoUpdate = false;
  const decals = createDecals(game);
  const sprites = createSprites(game);
  const rims = createRims(game);
  const zones = createZones(game, decals, sprites);
  root.add(decals.root, rims.root, sprites.mesh);
  root.updateMatrixWorld(true);
  R.threatScene.add(root);

  const now = () => game.enemyTime || 0;
  const emit = (n, p) => { try { game.events?.emit?.(n, p); } catch (err) { console.error('[tells] event', n, err); } };
  const assist = () => game.assist || { tellMul: 1, perfectMul: 1, colorblind: null, threatStrong: false, teachSlowmo: true };
  const playerPos = () => game.player?.object?.position || game.player?.entity?.object?.position || null;
  const posOf = (e) => e?.object?.position || e?.position || null;
  const warned = {};
  const warnOnce = (k, ...a) => { if (!warned[k]) { warned[k] = true; console.warn('[tells]', ...a); } };
  const sound = (name, pos) => { try { game.audio?.play?.(name, pos ? { pos } : undefined); } catch (_) { /* */ } };

  // ---- persistence: first time each tell kind is shown in a save (tellFirst)
  let seen = {};
  try { game.save?.section?.('tells', { serialize: () => ({ seen: { ...seen } }), load: (d) => { seen = d && d.seen && typeof d.seen === 'object' ? { ...d.seen } : {}; } }); }
  catch (err) { warnOnce('save', 'save.section unavailable', err?.message); }

  // ---- camera frustum (off-screen rule, arrows)
  const _m = new THREE.Matrix4(), frustum = new THREE.Frustum(), _sph = new THREE.Sphere(), _v = new THREE.Vector3(), _c = { x: 0, y: 0, z: 0 };
  const _fwd = new THREE.Vector3();
  function refreshFrustum() {
    const cam = game.camera; if (!cam) return false;
    cam.updateMatrixWorld();
    _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(_m);
    return true;
  }
  function enemyOnScreen(e) {
    const p = posOf(e); if (!p) return true;
    _sph.center.set(p.x, p.y + Math.min(1.2, (e.height ?? 1.6) * 0.5), p.z); _sph.radius = Math.max(0.4, e.radius ?? 0.6);
    return frustum.intersectsSphere(_sph);
  }

  // ---- handles
  const live = [];
  class TellHandle {
    constructor(e, spec, t0, dur, lockAt) {
      this.id = spec.id || 'attack'; this.enemy = e || null; this.spec = spec;
      this.tell = THREAT[spec.tell] && spec.tell !== 'hazard' && spec.tell !== 'safe' && spec.tell !== 'punish' ? spec.tell : 'danger';
      this.cls = spec.cls || 'mobLight';
      this.start = t0; this.dur = dur; this.lockAt = lockAt;
      this.done = false; this.alive = true; this.struck = false; this.committed = false; this.teach = false; this.teachDone = false;
      this.targetsPlayer = spec.targetsPlayer !== false;
      this.melee = isMelee(spec);
      this.nameKo = '';
      this.S = null; this.decal = null; this.ribbon = null; this.icon = null; this.glint = null; this.glintT = -1; this.wave = null;
      this.follow = !!spec.shape?.follow;
      this.rec = null;                 // active() record
    }
    get progress() { return this.dur > 0 ? Math.max(0, Math.min(1, (now() - this.start) / this.dur)) : 1; }
    get remaining() { return Math.max(0, this.start + this.dur - now()); }
    get locked() { return now() >= this.start + this.dur - this.lockAt; }
    consumeStrike() {
      if (this.struck || !this.alive) return false;
      if (now() < this.start + this.dur - 1e-9) return false;
      this.struck = true; this.done = true; this.alive = false;
      onHit(this);
      drop(this);
      emit('tellEnd', { enemy: this.enemy, id: this.id, reason: 'strike' });
      return true;
    }
    contains(pos, pad = 0.15) {
      if (!this.S || !pos) return false;
      if (this.follow && !this.locked) followEnemy(this);
      return hitTest(this.S.ref, pos, pad);
    }
    setPos(v) { if (this.S && v && !this.locked) { this.S.px = v.x; this.S.py = v.y || 0; this.S.pz = v.z; reshape(this); } return this; }
    setDir(v) { if (this.S && v && !this.locked) { setDir(this.S, v.x, v.z); this.S.dirExplicit = true; reshape(this); } return this; }
    setEnd(v) { if (this.S && v && !this.locked) { this.S.ex = v.x; this.S.ez = v.z; this.S.hasEnd = true; reshape(this); } return this; }
    extend(sec) { if (this.alive && sec > 0) { this.dur += sec; if (this.decal) this.decal.dur = this.dur; if (this.ribbon) this.ribbon.dur = this.dur; } return this; }
    stop(reason = 'cancel') {
      if (!this.alive) return;
      this.alive = false; this.done = true;
      if (this.decal) decals.end(this.decal, false);
      if (this.ribbon) decals.end(this.ribbon, false);
      drop(this);
      emit('tellEnd', { enemy: this.enemy, id: this.id, reason });
    }
    /** Jump tells: radius (m) of the travelling shockwave ring, or −1 when none is travelling. */
    shockwaveR() { return this.wave ? zones.waveR(this.wave) : -1; }
    /** Jump tells: true when the travelling ring's band (± band/2 + pad) covers pos (ground XZ). */
    shockwaveHits(pos, pad = 0.15) {
      const R = this.shockwaveR(); if (R < 0 || !pos || !this.wave) return false;
      const d = Math.hypot(pos.x - this.wave.x, pos.z - this.wave.z);
      return Math.abs(d - R) <= this.wave.band * 0.5 + pad;
    }
  }
  function reshape(h) {
    syncRef(h.S);
    if (h.decal) { copyShape(h.decal.S, h.S); decals.layout(h.decal); }
    if (h.ribbon) { copyShape(h.ribbon.S, h.S); decals.layout(h.ribbon); }
  }
  function copyShape(D, S) {
    D.kind = S.kind; D.px = S.px; D.py = S.py; D.pz = S.pz; D.dx = S.dx; D.dz = S.dz; D.r = S.r; D.inner = S.inner; D.angle = S.angle;
    D.len = S.len; D.width = S.width; D.ex = S.ex; D.ez = S.ez; D.hasEnd = S.hasEnd; D.dirExplicit = S.dirExplicit; syncRef(D);
  }
  function followEnemy(h) {
    const p = posOf(h.enemy); if (!p || !h.S) return;
    if (Math.abs(p.x - h.S.px) < 1e-4 && Math.abs(p.z - h.S.pz) < 1e-4) return;
    const dx = p.x - h.S.px, dz = p.z - h.S.pz;
    h.S.px = p.x; h.S.pz = p.z; h.S.py = p.y;
    if (h.S.hasEnd && (h.S.kind === 'capsule' || h.S.kind === 'conecap')) { h.S.ex += dx; h.S.ez += dz; }
    reshape(h);
  }
  function drop(h) {
    const i = live.indexOf(h); if (i >= 0) live.splice(i, 1);
    if (h.icon) { sprites.free(h.icon); h.icon = null; }
  }
  function nameOf(e, spec) {
    if (spec.nameKo) return spec.nameKo;
    try {
      const c = game.enemies?.codex?.()?.[e?.type || e?.kind];
      const a = c?.attacks?.find?.((x) => x.id === spec.id);
      if (a?.nameKo) return a.nameKo;
    } catch (_) { /* */ }
    return '';
  }

  function canAttack(e, opts) {
    if (!e) return true;
    if (e.vulnerableUntil > now()) return false;
    const melee = opts ? (opts.melee != null ? !!opts.melee : (opts.cls || opts.tell ? isMelee(opts) : false)) : false;
    if (melee) {
      const pp = playerPos(), p = posOf(e);
      if (pp && p && refreshFrustum() && !enemyOnScreen(e)) {
        const dx = p.x - pp.x, dz = p.z - pp.z;
        if (dx * dx + dz * dz > 9) return false;
      }
    }
    return true;
  }
  function windup(e, base, cls) { return tellDuration(base, cls, assist().tellMul, e?.timeMul ?? 1); }

  function attack(e, spec = {}) {
    if (!canAttack(e, { melee: isMelee(spec) })) return null;
    const cls = spec.cls || 'mobLight';
    const t0 = now();
    const dur = windup(e, spec.windup ?? 0, cls);
    const h = new TellHandle(e, spec, t0, dur, lockFor(spec, cls));
    h.nameKo = nameOf(e, spec);
    const ep = posOf(e);
    // shape: given, or the default 6 m aim line of a projectile tell
    let sh = spec.shape || null;
    if (!sh && h.tell === 'projectile' && ep) sh = { kind: 'line', len: THREAT.projectile.aimLen || 6, width: 0.35 };
    if (sh) {
      h.S = makeShape();
      const fd = sh.dir || facingDir(e);
      setShape(h.S, sh, ep || _c, fd);
      if (!sh.dir && h.S.kind === 'conecap') h.S.dirExplicit = false;
      const fam = SHAPE_FAMILY[h.S.kind] || 'radial';
      const rec = decals.alloc(fam);
      if (rec) {
        copyShape(rec.S, h.S);
        rec.tell = TELL_CODE[h.tell]; rec.mode = 'tell'; rec.clock = 'enemy'; rec.start = t0; rec.dur = dur; rec.lockAt = h.lockAt;
        rec.style = h.tell === 'projectile' ? STYLE.noChevron : 0;
        rec.perfectFrac = dur > 0 ? 1 - (PERFECT_WIN * (assist().perfectMul || 1)) / dur : 0;
        rec.owner = h; rec.visible = true;
        decals.layout(rec);
        h.decal = rec;
        rec.onFree = (r) => { if (h.decal === r) h.decal = null; };
        // P1: vertical rising-edge ribbon on large AoE rims (readable at grazing camera angles)
        if ((h.S.kind === 'circle' || h.S.kind === 'ring') && h.S.r > RIBBON.minR) {
          const rb = decals.alloc('ribbon');
          if (rb) {
            copyShape(rb.S, h.S);
            rb.tell = rec.tell; rb.mode = 'tell'; rb.clock = 'enemy'; rb.start = t0; rb.dur = dur; rb.lockAt = h.lockAt; rb.owner = h;
            decals.layout(rb); h.ribbon = rb;
            rb.onFree = (r) => { if (h.ribbon === r) h.ribbon = null; };
          }
        }
      }
    }
    // icons from windup start: ⚠ unblockable, ⤒ jump; '!' on every tell with strong emphasis
    const strong = !!assist().threatStrong;
    if (spec.icon !== false && (h.tell === 'unblockable' || h.tell === 'jump' || strong || spec.icon === true)) {
      const s = sprites.alloc('icon');
      if (s) {
        s.cell = h.tell === 'unblockable' ? 'warn' : h.tell === 'jump' ? 'jump' : 'bang';
        const c = threatColor(h.tell, assist().colorblind);
        s.col.setHex(c.rim); s.outl.setHex(c.edge); s.size = 0.6; s.minPx = 26; s.alpha = 1;
        h.icon = s; placeIcon(h);
      }
    }
    live.push(h);
    // first time this kind is shown in this save
    if (!seen[h.tell]) {
      seen[h.tell] = true;
      h.teach = h.targetsPlayer;
      emit('tellFirst', { tell: h.tell });
    }
    if (spec.sound !== false) sound(startSound(h.tell, cls), ep);
    emit('tellStart', { enemy: e, id: h.id, nameKo: h.nameKo, tell: h.tell, windup: dur, pos: h.S ? h.S.ref.pos : ep, targetsPlayer: h.targetsPlayer });
    return h;
  }
  const _fdir = { x: 0, y: 0, z: 1 };
  function facingDir(e) {
    if (e && typeof e.facing === 'number') { _fdir.x = Math.sin(e.facing); _fdir.z = Math.cos(e.facing); return _fdir; }
    const pp = playerPos(), p = posOf(e);
    if (pp && p) { _fdir.x = pp.x - p.x; _fdir.z = pp.z - p.z; return _fdir; }
    _fdir.x = 0; _fdir.z = 1; return _fdir;
  }
  function headPos(e, out) {
    const p = posOf(e); if (!p) return null;
    const hh = e.model?.headTop ?? e.height ?? 1.8;
    out.set(p.x, p.y + hh + 0.6, p.z);
    return out;
  }
  const _hp = new THREE.Vector3();
  function placeIcon(h) {
    const s = h.icon; if (!s) return;
    if (!headPos(h.enemy, _hp)) { if (h.S) _hp.set(h.S.px, h.S.py + 2.2, h.S.pz); else return; }
    s.x = _hp.x; s.y = _hp.y + Math.sin((game.realTime || 0) * 3) * 0.05; s.z = _hp.z;
  }
  const _ap = new THREE.Vector3();
  function anchorPos(h, out) {
    const e = h.enemy, a = h.spec.anchor;
    let o = null;
    try { o = a && a.isObject3D ? a : (e?.tellAnchor?.(a || 'weapon') || e?.model?.tellAnchors?.[a || 'weapon'] || null); } catch (_) { o = null; }
    if (o && o.getWorldPosition) { o.getWorldPosition(out); return out; }
    const p = posOf(e); if (!p) return null;
    out.set(p.x, p.y + (e.height ?? 1.6) * 0.75, p.z);
    return out;
  }
  function onLock(h) {
    h.committed = true;
    emit('tellCommit', { enemy: h.enemy, id: h.id });
    if (h.spec.sound !== false) { sound(h.tell === 'parry' ? 'tell_parry' : 'tell_commit', posOf(h.enemy)); }
    // glint star at the anchor (gold for parry)
    if (anchorPos(h, _ap)) {
      const s = sprites.alloc('glint');
      if (s) {
        const c = threatColor(h.tell === 'parry' ? 'parry' : h.tell, assist().colorblind);
        s.cell = 'star'; s.col.setHex(c.rim); s.outl.setHex(c.edge); s.size = 0.9; s.minPx = 18; s.x = _ap.x; s.y = _ap.y; s.z = _ap.z; s.alpha = 1;
        h.glint = s; h.glintT = 0;
        glints.push(h);
      }
    }
  }
  const glints = [];
  function onHit(h) {
    if (h.decal && !h.decal.fading) decals.end(h.decal, true);
    if (h.ribbon && !h.ribbon.fading) decals.end(h.ribbon, true);
    if (h.tell === 'jump' && !h.wave) startWave(h);
  }
  function startWave(h) {
    const sw = h.spec.shockwave || THREAT.jump.shockwave || {};
    const p = h.S ? h.S.ref.pos : posOf(h.enemy); if (!p) return;
    h.wave = zones.wave(p.x, p.y || 0, p.z, { speed: sw.speed ?? 12, band: sw.band ?? 0.25, maxR: sw.maxR ?? (h.S ? Math.max(h.S.r, 6) + 4 : 10) }, h);
  }

  // ---- punish
  function punish(e, dur, { mul = 1.25 } = {}) {
    if (!e || !(dur > 0)) return;
    e.vulnerableUntil = now() + dur; e.vulnerableMul = mul;
    zones.punishFx(e, dur);
    sound('punish', posOf(e));
    emit('punishWindow', { enemy: e, dur, mul });
  }

  // ---- queries
  function nextImpact(pos) {
    let best = Infinity;
    for (let i = 0; i < live.length; i++) {
      const h = live[i]; if (!h.alive) continue;
      if (h.targetsPlayer || (pos && h.contains(pos))) { const r = h.remaining; if (r < best) best = r; }
    }
    return best;
  }
  // active() records (reused)
  const ACTIVE = [];
  const RECS = [];
  for (let i = 0; i < MAX_ACTIVE; i++) RECS.push({ enemy: null, id: '', nameKo: '', tell: 'danger', pos: new THREE.Vector3(), dur: 0, progress: 0, remaining: 0, onScreen: true, behind: false, targetsPlayer: true, locked: false, handle: null });
  // footprints (reused): 8 × (x, z, kind, r, dirX, dirZ, param, len)
  const FOOT = { data: new Float32Array(64), n: 0 };
  const CAND_MAX = 48;
  const cand = { d: new Float32Array(CAND_MAX), type: new Uint8Array(CAND_MAX), ref: new Array(CAND_MAX).fill(null), n: 0 };
  const _order = new Int32Array(CAND_MAX);
  const _rs = [];

  // ---- per-frame update (once per frame, after the step group)
  let lastE = 0;
  const rimCand = []; const rimEnemies = [];
  function update(dt, realDt) {
    const t = now(), tR = game.realTime || 0, dE = Math.max(0, t - lastE); lastE = t;
    const A = assist();
    decals.setPalette(A.colorblind || null);
    decals.uniforms.uStrong.value = A.threatStrong ? 1 : 0;
    const haveFr = refreshFrustum();
    const pp = playerPos(), cam = game.camera;
    if (cam) cam.getWorldDirection(_fwd);
    // handles
    for (let i = live.length - 1; i >= 0; i--) {
      const h = live[i];
      const e = h.enemy;
      if (e && (e.alive === false || e.dying || e.removed)) { h.stop('cancel'); continue; }
      if (!h.struck && e && e.hitstopUntil > tR && dE > 0) h.extend(dE);       // per-entity hitstop pauses the windup
      if (h.follow && !h.locked) followEnemy(h);
      if (!h.committed && h.locked) onLock(h);
      if (h.teach && !h.teachDone && h.remaining <= TEACH.before) {
        h.teachDone = true;
        if (A.teachSlowmo) { try { game.timeScale?.set?.('teach', TEACH.scale, TEACH.durReal, { compensate: true, priority: TEACH.priority }); } catch (_) { /* */ } }
      }
      if (h.tell === 'jump' && !h.wave && t >= h.start + h.dur) startWave(h);
      if (h.icon) placeIcon(h);
      if (!h.struck && t > h.start + h.dur + STALE_AFTER) h.stop('cancel');
    }
    // glints: scale in/out over 0.3 s real
    for (let i = glints.length - 1; i >= 0; i--) {
      const h = glints[i], s = h.glint;
      if (!s) { glints.splice(i, 1); continue; }
      h.glintT += realDt || 1 / 60;
      const k = h.glintT / 0.3;
      if (k >= 1) { sprites.free(s); h.glint = null; glints.splice(i, 1); continue; }
      s.size = 0.9 * (k < 0.25 ? 0.5 + k * 2 : 1 - (k - 0.25) * 0.6); s.alpha = k < 0.7 ? 1 : (1 - k) / 0.3; s.rot = k * 0.8;
      if (anchorPos(h, _ap)) { s.x = _ap.x; s.y = _ap.y; s.z = _ap.z; }
    }
    // active() records
    let n = 0;
    for (let i = 0; i < live.length && n < MAX_ACTIVE; i++) {
      const h = live[i]; if (!h.alive) continue;
      const r = RECS[n++];
      r.enemy = h.enemy; r.id = h.id; r.nameKo = h.nameKo; r.tell = h.tell; r.dur = h.dur; r.progress = h.progress; r.remaining = h.remaining;
      r.targetsPlayer = h.targetsPlayer; r.locked = h.locked; r.handle = h;
      const ep = posOf(h.enemy);
      if (h.S) { centroid(h.S, _c); r.pos.set(_c.x, _c.y, _c.z); } else if (ep) r.pos.copy(ep); else r.pos.set(0, 0, 0);
      let on = true;
      if (haveFr) {
        if (h.enemy && !enemyOnScreen(h.enemy)) on = false;
        _v.set(r.pos.x, r.pos.y + 0.3, r.pos.z); if (!frustum.containsPoint(_v)) on = false;
      }
      r.onScreen = on;
      let behind = false;
      if (pp && ep) {
        const dx = ep.x - pp.x, dz = ep.z - pp.z;
        behind = dx * dx + dz * dz < 36 && (dx * _fwd.x + dz * _fwd.z) < 0;
      }
      r.behind = behind;
      h.rec = r;
    }
    for (let i = 0; i < n; i++) ACTIVE[i] = RECS[i];
    if (ACTIVE.length !== n) ACTIVE.length = n;
    // rims: ≤ 4 calls, nearest enemies by remaining time
    rimCand.length = 0;
    for (let i = 0; i < live.length; i++) { const h = live[i]; if (h.alive && h.enemy && h.spec.body !== false && h.enemy.object) rimCand.push(h); }
    sortByRemaining(rimCand);
    rimEnemies.length = 0;
    for (let i = 0; i < rimCand.length && rimEnemies.length < RIM_SLOTS; i++) if (rimEnemies.indexOf(rimCand[i].enemy) < 0) rimEnemies.push(rimCand[i].enemy);
    let slot = 0;
    for (let pass = 0; pass < 2 && slot < RIM_SLOTS; pass++) {
      for (let k = 0; k < rimEnemies.length && slot < RIM_SLOTS; k++) {
        const e = rimEnemies[k];
        rimSources(e, _rs);
        const src = _rs[pass]; if (!src) continue;
        const h = firstHandleOf(e);
        const s = rims.slots[slot++];
        rims.assign(s, e, src);
        const c = threatColor(h.tell, A.colorblind);
        s.u.uColor.value.setHex(c.rim);
        const lockT = h.start + h.dur - h.lockAt, flash = t >= lockT ? Math.max(0, 1 - (t - lockT) / 0.1) : 0;
        if (flash > 0) s.u.uColor.value.multiplyScalar(1 + 0.35 * flash);
        s.u.uAlpha.value = Math.min(1, 0.35 + 0.65 * h.progress + flash);
        s.u.uPx.value = (A.threatStrong ? 3 : 2) + (h.locked ? 1 : 0);
      }
    }
    for (; slot < RIM_SLOTS; slot++) rims.release(rims.slots[slot]);
    zones.frame(tR);
    decals.frame(t, game.time || 0, tR, realDt || dt || 1 / 60, A.perfectMul || 1);
    sprites.frame();
    buildFootprints(pp);
    legacyTick();
  }
  function sortByRemaining(a) {          // insertion sort (small arrays, no allocation)
    for (let i = 1; i < a.length; i++) { const x = a[i], r = x.remaining; let j = i - 1; while (j >= 0 && a[j].remaining > r) { a[j + 1] = a[j]; j--; } a[j + 1] = x; }
  }
  function firstHandleOf(e) { let best = null; for (let i = 0; i < live.length; i++) { const h = live[i]; if (h.alive && h.enemy === e && (!best || h.remaining < best.remaining)) best = h; } return best; }

  function buildFootprints(pp) {
    const D = FOOT.data;
    cand.n = 0;
    const px = pp ? pp.x : 0, pz = pp ? pp.z : 0;
    const _pp = pp || _c;
    for (let i = 0; i < live.length && cand.n < CAND_MAX; i++) {
      const h = live[i]; if (!h.alive) continue;
      if (h.S) { cand.d[cand.n] = shapeDistance(h.S.ref, _pp); cand.type[cand.n] = 1; cand.ref[cand.n] = h; cand.n++; }
      if (h.enemy && h.spec.body !== false && cand.n < CAND_MAX) {
        const p = posOf(h.enemy);
        if (p) { cand.d[cand.n] = Math.max(0, Math.hypot(p.x - px, p.z - pz) - ((h.enemy.radius ?? 0.6) + 1)); cand.type[cand.n] = 2; cand.ref[cand.n] = h; cand.n++; }
      }
    }
    const ZL = zones.zones;
    for (let zi = 0; zi < ZL.length; zi++) {
      const Z = ZL[zi];
      if (Z.stopped || !Z.S || cand.n >= CAND_MAX) continue;
      cand.d[cand.n] = shapeDistance(Z.S.ref, _pp); cand.type[cand.n] = 3; cand.ref[cand.n] = Z; cand.n++;
    }
    for (let i = 0; i < cand.n; i++) _order[i] = i;
    // partial selection sort of the 8 nearest
    let out = 0, k = 0;
    while (out < 8 && k < cand.n) {
      let bi = k;
      for (let j = k + 1; j < cand.n; j++) if (cand.d[_order[j]] < cand.d[_order[bi]]) bi = j;
      const tmp = _order[k]; _order[k] = _order[bi]; _order[bi] = tmp;
      const c = _order[k++], ty = cand.type[c], ref = cand.ref[c];
      if (ty === 1 || ty === 3) out += writeFootprint(ref.S, D, out * 8, 8 - out);
      else {
        const p = posOf(ref.enemy), b = out * 8;
        D[b] = p.x; D[b + 1] = p.z; D[b + 2] = FOOT_KIND.circle; D[b + 3] = (ref.enemy.radius ?? 0.6) + 1; D[b + 4] = 0; D[b + 5] = 1; D[b + 6] = 0; D[b + 7] = 0;
        out++;
      }
    }
    for (let i = 0; i < cand.n; i++) cand.ref[i] = null;
    for (let i = out * 8; i < 64; i++) D[i] = 0;
    FOOT.n = out;
  }

  // ---- legacy adapter: v3 vfx.telegraph({shape, pos, dir, r|len|width|angle(deg, full), inner, dur, color, parryable, onDone})
  const legacy = [];
  function telegraph(o = {}) {
    if (!o || !o.pos) return null;
    const kind = LEGACY_SHAPES[o.shape] || 'circle';
    const tell = o.color === 'grab' ? 'unblockable' : o.parryable ? 'parry' : 'danger';
    const fam = SHAPE_FAMILY[kind] || 'radial';
    const rec = decals.alloc(fam);
    const t0 = game.time || 0, dur = Math.max(0.1, o.dur ?? 1);
    const L = { rec, t0, dur, onDone: o.onDone || null, done: false };
    if (rec) {
      const sh = { kind, pos: o.pos, dir: o.dir, r: o.r ?? o.len ?? 3, inner: o.inner, len: o.len ?? 8, width: o.width ?? 2,
        angle: Math.max(0.02, Math.min(Math.PI, (o.angle ?? 60) * Math.PI / 180 * 0.5)) };
      setShape(rec.S, sh, o.pos, o.dir || null);
      rec.tell = TELL_CODE[tell]; rec.mode = 'tell'; rec.clock = 'game'; rec.start = t0; rec.dur = dur; rec.lockAt = Math.min(0.35, dur * 0.4);
      rec.perfectFrac = 1 - (PERFECT_WIN * (assist().perfectMul || 1)) / dur; rec.alpha = Math.min(1, o.alpha ?? 1);
      decals.layout(rec);
      rec.onFree = () => { L.rec = null; };
    }
    legacy.push(L);
    const handle = {
      get alive() { return !L.done; },
      get progress() { return L.done ? 1 : Math.min(1, Math.max(0, ((game.time || 0) - L.t0) / L.dur)); },
      get timeLeft() { return L.done ? 0 : Math.max(0, L.dur - ((game.time || 0) - L.t0)); },
      stop() { if (!L.done) { L.done = true; L.onDone = null; if (L.rec) decals.end(L.rec, false); } },
      setPos(p) { if (!L.done && p && L.rec) { L.rec.S.px = p.x; L.rec.S.pz = p.z; L.rec.S.py = p.y || 0; syncRef(L.rec.S); decals.layout(L.rec); } },
      setDir(d) { if (!L.done && d && L.rec) { setDir(L.rec.S, d.x, d.z); syncRef(L.rec.S); decals.layout(L.rec); } },
    };
    return handle;
  }
  function legacyTick() {
    const t = game.time || 0;
    for (let i = legacy.length - 1; i >= 0; i--) {
      const L = legacy[i];
      if (!L.done && t >= L.t0 + L.dur) {
        L.done = true;
        const cb = L.onDone; L.onDone = null;
        if (cb) { try { cb(); } catch (err) { console.error('[tells] telegraph onDone', err); } }
      }
      if (L.done) legacy.splice(i, 1);
    }
  }

  // ---- overlay hook: copy rim matrices after the main render; clear the canvas depth for the hull depth test
  function preOverlay() {
    rims.sync();
    if (rims.count() > 0 && root.visible) {
      const r = game.renderer;
      try { r.setRenderTarget(null); r.clearDepth(); } catch (_) { /* */ }
    }
  }

  // ---- thumbnails (ux legend): real rendered decals via game.render.snapshot
  const thumbs = createThumbs(game, decals, sprites);

  // ---- warm every material against the canvas (threat-scene variant)
  try { R.warm?.(root, { target: 'overlay' }); } catch (err) { warnOnce('warm', err?.message); }

  // ---- debug
  function pixelsOf(h) {
    const rec = h?.decal || h?.rec?.handle?.decal || null; if (!rec || !game.renderNow) return 0;
    const gl = game.renderer.getContext(), w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight;
    const read = () => { game.renderNow(); const px = new Uint8Array(w * hh * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    const t = now();
    const a = read(); rec.visible = false; decals.frame(t, game.time || 0, game.realTime || 0, 0, 1); const b = read(); rec.visible = true; decals.frame(t, game.time || 0, game.realTime || 0, 0, 1);
    let c = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 25) c++;
    return c;
  }
  const api = {
    isStub: false,
    MIN, LOCK, TELL_KINDS,
    attack, hitTest, canAttack, windup, nextImpact, punish,
    projectile: (obj, opts) => zones.projectile(obj, opts),
    hazard: (o) => zones.zone('hazard', o),
    safe: (o) => zones.zone('safe', o),
    telegraph,
    /** The hazard zone holding pos (ground XZ), or null → {kind, nameKo, tell:'hazard'} for ux's "standing in a hazard" cue. */
    hazardAt(pos, pad = 0) {
      if (!pos) return null;
      const ZL = zones.zones;
      for (let i = 0; i < ZL.length; i++) { const Z = ZL[i]; if (!Z.stopped && Z.kind === 'hazard' && Z.S && hitTest(Z.S.ref, pos, pad)) return Z.info || (Z.info = { kind: Z.hazardKind, nameKo: Z.nameKo, tell: 'hazard' }); }
      return null;
    },
    active() { return ACTIVE; },
    footprints() { return FOOT; },
    update, preOverlay,
    renderThumb: (kind, size) => thumbs.render(kind, size),
    prewarm() { return null; },
    debug: {
      setVisible(on) { root.visible = !!on; },
      pixelsOf,
      pool() { return { ribbons: decals.count(['ribbon']), active: decals.count(['radial', 'linear']), max: 16, zones: decals.count(['zone']), markers: decals.count(['marker']), waves: decals.count(['wave']), sprites: sprites.count() }; },
      rims() { return rims.count(); },
      sprites: (kind) => sprites.count(kind),
      live: () => live.length,
      handles: () => live,
      seen: () => ({ ...seen }),
      resetSeen() { seen = {}; },
      occlusion(on) { decals.uniforms.uOccOn.value = on ? 1 : 0; },
      decals, spritesApi: sprites, rimsApi: rims, zones, root,
      heightAt: (x, z) => decals.heightAt(x, z),
      reset() {
        for (let i = live.length - 1; i >= 0; i--) live[i].stop('cancel');
        zones.reset();
        for (const L of legacy) { L.done = true; if (L.rec) decals.end(L.rec, false); }
        for (const f of Object.values(decals.fams)) for (const r of f.recs) if (r.active) decals.free(r);
        for (const s of sprites.recs) sprites.free(s);
        glints.length = 0;
      },
    },
  };
  return api;
}
