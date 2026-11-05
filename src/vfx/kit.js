// game.vfx.kit — the shared VFX kit every v4 skill look is built from (PLAN v4 §3.4, §3.5, §7.4.3). Owner: vfx.
//   line(spec) LW · registerShape / mesh(name, spec) FM · ribbon(spec) RB · bolt(spec) BT · spark() SP · decal() DC ·
//   glyph(name) GL · ramp(el) · fxMaterial(opts) · registerMotif / motif / hasMotif · tier(code)
// Every spec carries castId (accounted in vfx.debug.byCast) and owner ('player' default | 'enemy' | 'world' → enemy style, R11).
// No hatch and no chevron shapes exist for player FX (reserved threat vocabulary, §5.1).
import * as THREE from 'three';
import { FX_RAMPS } from '../core/elements.js';
import { createGlyphAtlas, GLYPHS, GLYPH_INDEX } from './glyphs.js';
import { createLinework, LW_SHAPES, PLANE } from './linework.js';
import { createFxMesh } from './fxmesh.js';
import { createRibbons } from './ribbon.js';
import { createBolts } from './bolt.js';
import { installGenericMotifs, MOTIF_KINDS } from './motifs_generic.js';
import { createEnemyStyle, elementOfColor } from './enemystyle.js';
import { DUCK_PARS } from './duck.js';

export const TIERS = Object.freeze({
  B: Object.freeze({ particles: 16, handles: 4, coverage: 0.05, flashMax: 0, flashAlpha: 0 }),
  C: Object.freeze({ particles: 80, handles: 8, coverage: 0.30, flashMax: 0, flashAlpha: 0 }),
  A: Object.freeze({ particles: 80, handles: 8, coverage: 0.30, flashMax: 0, flashAlpha: 0 }),
  Z: Object.freeze({ particles: 30, handles: 6, coverage: 0.15, flashMax: 0, flashAlpha: 0 }),
  U: Object.freeze({ particles: 150, handles: 12, coverage: 1.0, flashMax: 0.15, flashAlpha: 0.25 }),
  F: Object.freeze({ particles: 250, handles: 16, coverage: 1.5, flashMax: 0.15, flashAlpha: 0.25 }),
});
export const DECAL_KINDS = { crack: ['crack'], scorch: ['scorch'], frost: ['frost'], lichtenberg: ['glyph', 'lichtenberg'], ripple: ['ripple'],
  flower: ['glyph', 'flower5'], flowers: ['glyph', 'flower5'], rune: ['glyph', 'futhark'], strata: ['strata'], violet: ['scorch'], soft: ['ripple'] };
export const BIT = { lw: 1, fm: 2, rb: 4, bt: 8, sp: 16, legacy: 32 };
const R_DEF = { star: 0.45, ticks: 0.8, rays: 0.3, spiral: 0.15 };
const _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _n = new THREE.Vector3(), _c = new THREE.Color();

class Handle {
  constructor(sys, rec) { this._s = sys; this._r = rec; }
  get alive() { return !!(this._r && this._r.alive); }
  stop(fade = true) { if (this.alive) this._s.stop(this._r, fade); return this; }
  setPos(v) { if (this.alive && v) this._r.pos.set(v.x, v.y, v.z); return this; }
  setDir(v) { if (this.alive && v && this._s.setDir) this._s.setDir(this._r, v); return this; }
  setScale(s) { if (this.alive && Number.isFinite(s)) this._r.userScale = s; return this; }
  setAlpha(a) { if (this.alive && Number.isFinite(a)) this._r.userAlpha = Math.max(0, a); return this; }
}
class RibbonHandle extends Handle { push(p) { if (this.alive && p) this._s.push(this._r, p); return this; } }
class BoltHandle extends Handle {
  setEnds(f, t) { if (this.alive) { if (f) this._r.from.copy(f); if (t) this._r.to.copy(t); this._r.ends = true; } return this; }
  setPos(v) { if (this.alive && v) { this._r.from.copy(v); this._r.ends = true; } return this; }
}
const DEAD = Object.freeze({ alive: false, stop() { return this; }, setPos() { return this; }, setDir() { return this; }, setScale() { return this; }, setAlpha() { return this; }, push() { return this; }, setEnds() { return this; } });

export function createKit(game, deps) {
  const { shared, cast, emit, screenH, time, proj } = deps;
  const warned = new Set();
  const warnOnce = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn('[kit]', k, ...a); } };

  // ---- ramps (cached Colors; game.elements.fx when present)
  const ramps = new Map();
  function ramp(el = 'physical') {
    let r = ramps.get(el);
    if (r) return r;
    let src = null;
    try { src = game.elements?.fx?.(el) || null; } catch (_) { src = null; }
    if (!src || src.mid == null) src = FX_RAMPS[el] || FX_RAMPS.physical;
    r = Object.freeze({ hi: new THREE.Color(src.hi), light: new THREE.Color(src.light), mid: new THREE.Color(src.mid), dark: new THREE.Color(src.dark) });
    ramps.set(el, r);
    return r;
  }
  const toColor = (out, c, fb) => { if (c == null) return out.copy(fb); if (c.isColor) return out.copy(c); return out.setHex(c); };

  const glyphs = createGlyphAtlas();
  const hooks = { shared, ramp, screenH, time, proj, onOtherCover: deps.onOtherCover || null, outlinesOn: () => (game.quality?.budget?.fxDetail ?? 1) >= 1, onKill: null };
  const lw = createLinework(game, glyphs, hooks);
  const fm = createFxMesh(game, hooks);
  const rb = createRibbons(game, hooks);
  const bt = createBolts(game, hooks);
  const handles = { lw: 0, fm: 0, rb: 0, bt: 0 };

  const gy = (p) => { try { return game.world?.getHeight?.(p.x, p.z) ?? 0; } catch (_) { return 0; } };
  const isEnemy = (o) => o === 'enemy' || o === 'world';

  // ---------------------------------------------------------------- LW
  const lwSys = {
    stop: (r, f) => lw.stop(r, f),
    setDir: (r, v) => { if (r.plane === PLANE.oriented) { _n.set(v.x, v.y, v.z).normalize(); r.quat.setFromUnitVectors(_z, _n); lw.restatic(r); } else r.rot = Math.atan2(v.z, v.x); },
  };
  function line(spec = {}) {
    let shape = spec.shape || 'ring';
    if (shape === 'hatch' || shape === 'chevron' || shape === 'chevrons' || shape === 'diamond') { warnOnce('reserved:' + shape, 'reserved threat shape refused for FX', shape); return DEAD; }
    const owner = isEnemy(spec.owner) ? 'enemy' : 'player';
    if (owner === 'enemy' && shape === 'glyph') shape = 'ring';             // R11: never the rune-circle / glyph-band look
    const sid = LW_SHAPES[shape];
    if (sid == null) { warnOnce('shape:' + shape, 'unknown linework shape', shape); return DEAD; }
    const p = spec.pos || spec.follow?.position;
    if (!p) return DEAD;
    const el = spec.el || (spec.color != null ? 'physical' : 'physical');
    const R = ramp(el);
    const r = Math.max(0.01, spec.r ?? 1);
    const rec = {
      pos: new THREE.Vector3(p.x, p.y, p.z), quat: new THREE.Quaternion(), c: new THREE.Color(), c2: new THREE.Color(),
      shapeId: sid, r, r2: Math.max(0, Math.min(0.98, spec.r2 ?? R_DEF[shape] ?? 0)) * r,   // r2 is a fraction of r
      width: Math.max(0.002, spec.width ?? 0.04), minPx: spec.minPx ?? 1.5,
      a0: 0, a1: Math.PI * 2, p1: 0, p2: 0, plane: 0, rot: spec.rot ?? 0, spin: spec.spin ?? 0,
      life: spec.life ?? 1, tIn: spec.tIn ?? 0.12, tOut: spec.tOut ?? 0.3, scaleIn: spec.scaleIn === 'linear' ? 1 : spec.scaleIn === 'expand' ? 2 : spec.scaleIn === 'contract' ? 3 : 0,
      erode: !!spec.erode, core: Math.min(1, spec.additiveCore ?? 0), role: spec.role === 'fill' ? 0 : 1,
      alpha: Math.min(owner === 'enemy' ? 0.85 : 1, spec.alpha ?? 0.85), userAlpha: 1, userScale: 1, mul: 1,
      follow: spec.follow || null, followOff: spec.followOff || null, owner, castId: spec.castId || 0, t: 0, cov: 0,
      persistent: spec.life === Infinity, kind: 'lw',
    };
    if (rec.persistent) rec.life = 1e9;
    toColor(rec.c, spec.color, owner === 'enemy' ? R.mid : R.light);
    toColor(rec.c2, spec.color2, owner === 'enemy' ? R.dark : R.mid);
    if (shape === 'arc') { const a = spec.arc || [0, Math.PI]; rec.a0 = a[0]; rec.a1 = a[1] > a[0] ? a[1] : a[0] + Math.PI; }
    if (shape === 'poly') rec.p1 = spec.sides ?? 6;
    else if (shape === 'star') rec.p1 = spec.points ?? 5;
    else if (shape === 'ticks' || shape === 'rays' || shape === 'dots') rec.p1 = spec.n ?? spec.points ?? (shape === 'ticks' ? 12 : shape === 'rays' ? 8 : 16);
    else if (shape === 'spiral') { rec.p1 = spec.turns ?? 1.25; rec.p2 = Math.min(4, spec.arms ?? 1); }
    else if (shape === 'stipple') { rec.p2 = spec.density ?? 0.45; rec.a0 = (spec.seed ?? rec.castId ?? 0) % 97; }
    else if (shape === 'glyph') { const gi = GLYPH_INDEX[spec.glyph ?? el]; rec.p1 = gi != null ? gi : GLYPH_INDEX.hexagram; rec.p2 = spec.bias ?? 0; }
    else if (sid >= 11) { rec.a0 = (spec.seed ?? rec.castId ?? 1) % 89; rec.a1 = spec.phase ?? 0; }
    // plane
    const pl = spec.plane || 'ground';
    if (pl === 'billboard') rec.plane = PLANE.billboard;
    else if (pl === 'oriented') {
      rec.plane = PLANE.oriented;
      if (spec.quat) rec.quat.copy(spec.quat); else if (spec.normal) { _n.set(spec.normal.x, spec.normal.y, spec.normal.z).normalize(); rec.quat.setFromUnitVectors(_z, _n); }
    } else if (pl === 'flat') rec.plane = PLANE.flat;
    else {
      const h = gy(rec.pos);
      rec.plane = lw.hfOk && Math.abs(rec.pos.y - h) < 2.5 ? PLANE.ground : PLANE.flat;
      if (rec.plane === PLANE.flat && Math.abs(rec.pos.y - h) < 2.5) rec.pos.y = h + 0.05;
      if (spec.dir && spec.rot == null) rec.rot = Math.atan2(spec.dir.z, spec.dir.x);
    }
    lw.add(rec);
    handles.lw++;
    if (rec.castId) { cast.handle(rec.castId); cast.touch(rec.castId, BIT.lw); }
    return new Handle(lwSys, rec);
  }

  // ---------------------------------------------------------------- FM
  const fmSys = { stop: (r, f) => fm.stop(r, f), setDir: (r, v) => { _n.set(v.x, v.y, v.z).normalize(); r.quat.setFromUnitVectors(_z, _n); } };
  function registerShape(name, geometry, opts) { return fm.registerShape(name, geometry, opts); }
  function mesh(name, spec = {}) {
    let shape = fm.shapeOf(name);
    if (!shape) {
      const dot = name.indexOf('.');
      shape = fm.shapeOf('physical.' + (dot > 0 ? name.slice(dot + 1) : name)) || fm.shapeOf('physical.shard');
      if (spec.castId) cast.generic(spec.castId);
      warnOnce('fm:' + name, 'FM shape not registered (fallback physical):', name);
      if (!shape) return DEAD;
    }
    const p = spec.pos || spec.follow?.position; if (!p) return DEAD;
    const fam = fm.family(shape.name.slice(0, shape.name.indexOf('.')));
    const sc = spec.scale;
    const rec = {
      fam, shape, pos: new THREE.Vector3(p.x, p.y, p.z), quat: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1),
      vel: spec.vel ? new THREE.Vector3(spec.vel.x, spec.vel.y, spec.vel.z) : null, gravity: spec.gravity || 0, drag: spec.drag || 0,
      spin: spec.spin || 0, spinAxis: spec.spinAxis || null, grow: spec.grow ?? 1,
      life: spec.life ?? 0.6, tIn: spec.tIn ?? 0.12, tOut: spec.tOut ?? 0.3, erode: spec.erode !== false,
      tint: new THREE.Color(), tintAmt: 0, alpha: Math.min(1, spec.alpha ?? 1), mul: 1, userAlpha: 1, userScale: 1,
      follow: spec.follow || null, followOff: spec.followOff || null, enemy: isEnemy(spec.owner), castId: spec.castId || 0, t: 0, cov: 0,
      persistent: spec.life === Infinity, kind: 'fm',
    };
    if (rec.persistent) rec.life = 1e9;
    if (spec.quat) rec.quat.copy(spec.quat); else if (spec.dir) { _n.set(spec.dir.x, spec.dir.y, spec.dir.z).normalize(); rec.quat.setFromUnitVectors(_z, _n); }
    if (typeof sc === 'number') rec.scale.setScalar(sc); else if (sc) rec.scale.set(sc.x, sc.y, sc.z);
    if (spec.colors?.mid != null || spec.color != null) { toColor(rec.tint, spec.colors?.mid ?? spec.color, rec.tint); rec.tintAmt = spec.tintAmt ?? 0.6; }
    else if (spec.el && spec.el !== fam.el) { rec.tint.copy(ramp(spec.el).mid); rec.tintAmt = 0.6; }
    fm.add(rec);
    handles.fm++;
    if (rec.castId) { cast.handle(rec.castId); cast.touch(rec.castId, BIT.fm); }
    return new Handle(fmSys, rec);
  }

  // ---------------------------------------------------------------- RB
  const rbSys = { stop: (r, fade) => { if (!fade) rb.release(r); else { r.stopped = true; if (r.static) r.life = Math.min(r.life, r.t + 0.15); } }, push: (r, p) => rb.push(r, p) };
  function ribbon(spec = {}) {
    if (!spec.follow && !spec.points) return DEAD;
    const el = spec.el || 'physical', R = ramp(el), enemy = isEnemy(spec.owner);
    const rec = {
      follow: spec.follow || null, points: spec.points || null, static: !spec.follow, width: Math.max(0.01, spec.width ?? 0.25), taper: Math.min(1, spec.taper ?? 0.85),
      life: spec.life ?? 0.3, maxLen: spec.maxLen ?? spec.length ?? 4, alpha: Math.min(enemy ? 0.75 : 1, spec.alpha ?? 0.85), edge: spec.edge ?? 0.8,
      c1: new THREE.Color(), c2: new THREE.Color(), ce: new THREE.Color(), enemy, castId: spec.castId || 0, userAlpha: 1, userScale: 1, cov: 0, kind: 'rb',
    };
    const cs = spec.colors || {};
    if (enemy) { rec.c1.copy(R.dark); rec.c2.copy(R.dark); rec.ce.copy(R.mid); }
    else {
      toColor(rec.c1, cs.head ?? cs.mid ?? spec.color, R.mid);
      toColor(rec.c2, cs.tail, R.mid);
      const sat = Math.max(0, Math.min(1, spec.tailSat ?? 0.3));
      const l = rec.c2.r * 0.3 + rec.c2.g * 0.59 + rec.c2.b * 0.11; _c.setRGB(l, l, l); rec.c2.lerp(_c, 1 - sat);
      toColor(rec.ce, cs.edge, R.light);
    }
    const out = rb.add(rec);
    if (!out) return DEAD;
    handles.rb++;
    if (rec.castId) { cast.handle(rec.castId); cast.touch(rec.castId, BIT.rb); }
    return new RibbonHandle(rbSys, rec);
  }

  // ---------------------------------------------------------------- BT
  const btSys = { stop: (r, fade) => { if (!fade) bt.release(r); else r.life = Math.min(r.life, r.t); } };
  function bolt(spec = {}) {
    if (!spec.from || !spec.to) return DEAD;
    const el = spec.el || 'lightning', R = ramp(el), enemy = isEnemy(spec.owner);
    const rec = {
      from: new THREE.Vector3().copy(spec.from), to: new THREE.Vector3().copy(spec.to), forks: Math.max(0, Math.min(3, spec.forks ?? 2)),
      width: Math.min(0.14, spec.width ?? 0.08), halo: Math.min(0.6, spec.halo ?? 0.3), life: spec.life ?? 0.05, afterglow: spec.afterglow ?? 0.25,
      jagged: spec.jagged ?? 1, seed: spec.seed ?? spec.castId ?? 0, cHi: new THREE.Color(), cLight: new THREE.Color(), cMid: new THREE.Color(),
      followFrom: spec.followFrom || null, followTo: spec.followTo || null, enemy, castId: spec.castId || 0, userAlpha: 1, userScale: 1, cov: 0, kind: 'bt',
    };
    if (enemy) { rec.cHi.copy(R.dark); rec.cLight.copy(R.mid); rec.cMid.copy(R.dark); }
    else { rec.cHi.copy(spec.core ?? R.hi); rec.cLight.copy(R.light); rec.cMid.copy(R.mid); }
    if (!bt.add(rec)) return DEAD;
    handles.bt++;
    if (rec.castId) { cast.handle(rec.castId); cast.touch(rec.castId, BIT.bt); }
    return new BoltHandle(btSys, rec);
  }

  // ---------------------------------------------------------------- SP / DC
  const SPARK_SHAPE = { fire: 'ember', ice: 'shard', lightning: 'spark', wind: 'streak', water: 'droplet', earth: 'rock', nature: 'petal', light: 'mote', shadow: 'wisp', physical: 'spark' };
  const NORMAL_SHAPES = { rock: 1, leaf: 1, petal: 1, feather: 1, droplet: 1, wisp: 0 };
  const sparkOpts = { count: 8, shape: 'spark', color: null, speed: 6, speedVar: 3, drag: 3.5, gravity: 4, size: 0.12, sizeEnd: 0.03, life: 0.3, lifeVar: 0.1, velocityStretch: 0.05, dir: null, spread: 1, alpha: 1, owner: 'player', castId: 0, additive: undefined };
  const sparkCol = [0, 0];
  function spark(pos, el = 'physical', n = 8, dir = null, opts = {}) {
    if (!pos) return;
    const R = ramp(el);
    const o = sparkOpts;
    o.count = Math.max(0, Math.min(12, Math.round(n))); o.shape = opts.shape || SPARK_SHAPE[el] || 'spark';
    sparkCol[0] = R.light.getHex(); sparkCol[1] = R.mid.getHex(); o.color = sparkCol;
    o.speed = opts.speed ?? 6; o.speedVar = o.speed * 0.5; o.gravity = opts.gravity ?? 4; o.dir = dir; o.spread = dir ? 0.55 : 1;
    o.size = opts.size ?? (o.shape === 'spark' || o.shape === 'streak' ? 0.12 : 0.16); o.sizeEnd = o.size * 0.35;
    o.velocityStretch = o.shape === 'spark' || o.shape === 'streak' || o.shape === 'ember' ? 0.05 : 0;
    o.life = opts.life ?? 0.32; o.owner = opts.owner || 'player'; o.castId = opts.castId || 0; o.el = el;
    o.additive = NORMAL_SHAPES[o.shape] ? false : undefined;
    emit(pos, o);
  }
  function decal(kind, pos, r = 1.5, life = 3, opts = {}) {
    const m = DECAL_KINDS[kind];
    if (!m || !pos) { if (kind === 'hatch') warnOnce('hatch', 'hatch decals are reserved'); return DEAD; }
    const el = opts.el || (kind === 'violet' ? 'shadow' : kind === 'frost' ? 'ice' : kind === 'lichtenberg' ? 'lightning' : kind === 'flower' || kind === 'flowers' ? 'nature' : 'physical');
    const R = ramp(el);
    return line({ shape: m[0], glyph: m[1], el, pos, r, plane: 'ground', width: opts.width ?? (m[0] === 'glyph' ? 0.03 : 0.028), life, tIn: 0.1, tOut: Math.min(1.2, life * 0.4),
      alpha: Math.min(0.35, opts.alpha ?? 0.3), color: opts.color ?? (kind === 'scorch' || kind === 'crack' ? R.mid : R.light), color2: R.dark, erode: kind === 'crack' || kind === 'scorch' || kind === 'frost',
      rot: opts.rot ?? ((opts.castId || 0) * 1.7) % 6.283, castId: opts.castId, owner: opts.owner, role: 'fill', seed: opts.seed });
  }

  // ---------------------------------------------------------------- materials
  const matCache = new Map();
  const FXMAT_VERT = /* glsl */`
    varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vO; varying float vM;
    uniform float uDuck;
    ${DUCK_PARS}
    void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vec4 mv = viewMatrix * wp; gl_Position = projectionMatrix * mv;
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y; vO = position; vM = uDuck > 0.5 ? awFxMul(wp.xyz, -mv.z, 0.0) : 1.0; }`;
  const FXMAT_FRAG = /* glsl */`
    uniform vec3 uLight, uMid, uDark; uniform float uAlpha, uErode, uRimOnly;
    varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vO; varying float vM;
    float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    void main() {
      if (uErode > 0.0 && h31(floor(vO * 9.0)) < uErode) discard;
      float ndv = abs(dot(normalize(vN), normalize(vV)));
      float rim = pow(1.0 - ndv, 2.5);
      float band = smoothstep(0.35, 0.65, ndv);
      vec3 col = uRimOnly > 0.5 ? mix(uMid, uLight, rim) : mix(uMid, uDark, 1.0 - band) + uLight * rim * 0.5;
      float a = (uRimOnly > 0.5 ? rim * 0.9 : 1.0) * uAlpha * vM;
      if (a < 0.004) discard;
      gl_FragColor = vec4(col * a, a);
    }`;
  /** fxMaterial({el, rimOnly, side, owner}) → cached private toon / rim-shell material (premultiplied, depthWrite false, ducked). */
  function fxMaterial(opts = {}) {
    const el = opts.el || 'physical', rimOnly = !!opts.rimOnly, enemy = isEnemy(opts.owner);
    const key = `${el}|${rimOnly ? 1 : 0}|${opts.side ?? 0}|${enemy ? 1 : 0}`;
    let m = opts.private ? null : matCache.get(key);
    if (m) return m;
    const R = ramp(el);
    m = new THREE.ShaderMaterial({
      uniforms: { uLight: { value: enemy ? R.mid : R.light }, uMid: { value: enemy ? R.dark : R.mid }, uDark: { value: R.dark }, uAlpha: { value: rimOnly ? 0.35 : 1 }, uErode: { value: 0 }, uRimOnly: { value: rimOnly ? 1 : 0 },
        uDuck: { value: enemy ? 0 : 1 }, uPlayerFxMul: shared.uPlayerFxMul, uThreat: shared.uThreat, uThreatN: shared.uThreatN, uCamPos: shared.uCamPos, uPlayerPos: shared.uPlayerPos },
      vertexShader: FXMAT_VERT, fragmentShader: FXMAT_FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      side: opts.side === 2 ? THREE.DoubleSide : opts.side === 1 ? THREE.BackSide : THREE.FrontSide,
    });
    m.name = 'kit-fxmat-' + key;
    if (!opts.private) { m.userData.shared = true; matCache.set(key, m); }
    return m;
  }

  // ---------------------------------------------------------------- motifs
  const motifs = new Map();
  let G = null, ES = null;
  function registerMotif(el, kind, fn) { if (!el || !kind || typeof fn !== 'function') return false; motifs.set(el + ':' + kind, fn); return true; }
  const hasMotif = (el, kind) => motifs.has(el + ':' + kind);
  function motif(el = 'physical', kind = 'burst', spec = {}) {
    if (!spec || !spec.pos && !spec.follow) return null;
    if (!spec.pos && spec.follow) spec.pos = spec.follow.position;
    if (isEnemy(spec.owner)) return ES.motif(el, kind, spec);
    const fn = motifs.get(el + ':' + kind);
    if (fn) {
      try { const r = fn(spec, kit); if (r !== undefined) return r; return null; } catch (err) { warnOnce('motif:' + el + ':' + kind, err); }
    }
    if (spec.castId && el !== 'physical') cast.generic(spec.castId);
    const g = G[kind]; if (!g) return null;
    return g(el, spec);
  }
  const motifSource = (el, kind) => (motifs.has(el + ':' + kind) ? 'registered' : 'generic');

  const tier = (code) => TIERS[code] || TIERS.A;
  const glyph = (name) => { const uv = glyphs.uv(name); return uv ? { tex: glyphs.tex, uv } : null; };
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // physical / generic FM shapes (vfx-owned): bipyramid shard + faceted chunk
  { const g = new THREE.OctahedronGeometry(0.5, 0); g.scale(0.4, 1.2, 0.4); g.computeVertexNormals(); registerShape('physical.shard', g, { blend: 'solid', outline: true }); }
  { const g = new THREE.DodecahedronGeometry(0.5, 0); g.computeVertexNormals(); registerShape('physical.chunk', g, { blend: 'solid', outline: true }); }

  // per frame
  const res = { cover: 0, calls: 0, lwCover: 0 };
  const castCover = (r) => { if (r.castId && r.cov) cast.cover(r.castId, r.cov); };
  function update(dt) {
    const lc = lw.update(dt);
    const f = fm.update(dt), r = rb.update(dt), b = bt.update(dt);
    for (const k in lw.pools) { const P = lw.pools[k]; for (let i = 0; i < P.n; i++) castCover(P.recs[i]); }
    for (const fam of fm.families().values()) for (let i = 0; i < fam.n; i++) castCover(fam.recs[i]);
    for (const x of rb.recs) castCover(x);
    for (const x of bt.recs) castCover(x);
    const ls = lw.stats();
    res.lwCover = lc; res.cover = lc + f.cover + r.cover + b.cover;
    res.calls = (lw.pools.player.n > 0 ? 1 : 0) + f.calls + r.calls + b.calls;
    res.otherCalls = lw.pools.enemy.n > 0 ? 1 : 0; void ls;
    return res;
  }
  function materials() { return [...lw.materials, ...fm.materials(), ...rb.materials, ...bt.materials, ...matCache.values()]; }
  /** Visible stand-ins of every kit program for the core warm pass (renderer.compile skips hidden objects). */
  function prewarm() {
    const g = new THREE.Group(); g.name = 'kit-prewarm';
    for (const k in lw.pools) { const P = lw.pools[k]; g.add(new THREE.Mesh(P.geometry, P.mesh.material)); }
    for (const fam of fm.families().values()) { if (!fam.mesh) continue; const a = new THREE.InstancedMesh(fam.geometry, fam.matBody, 1); a.count = 0; const b = new THREE.InstancedMesh(fam.geometry, fam.matOutline, 1); b.count = 0; g.add(a, b); }
    for (const x of [...rb.batches]) g.add(new THREE.Mesh(x.mesh.geometry, x.mesh.material));
    for (const m of [...bt.materials]) g.add(new THREE.Mesh(rb.batches[0].mesh.geometry, m));
    const sph = new THREE.SphereGeometry(0.1, 6, 4);
    for (const m of matCache.values()) g.add(new THREE.Mesh(sph, m));
    g.traverse((o) => { o.frustumCulled = false; });
    return g;
  }
  function stats() {
    const l = lw.stats(), f = fm.stats();
    return { linework: l.player + l.enemy, lwPlayer: l.player, lwEnemy: l.enemy, fm: f.instances, fmFamilies: f.families, ribbons: rb.count(), bolts: bt.count(),
      handles: { ...handles }, calls: res.calls, programs: 1 + (fm.families().size ? 1 : 0) + 1 + 1 + (matCache.size ? 1 : 0) };
  }
  function clear() { lw.clear(); fm.clear(); rb.clear(); bt.clear(); }

  const kit = {
    line, registerShape, mesh, ribbon, bolt, spark, decal, glyph, GLYPHS, ramp, fxMaterial,
    registerMotif, motif, hasMotif, motifSource, tier, TIERS, MOTIF_KINDS, LW_SHAPES: Object.keys(LW_SHAPES), DECAL_KINDS: Object.keys(DECAL_KINDS),
    emit, v3, elementOfColor,
    update, materials, prewarm, stats, clear,
    _lw: lw, _fm: fm, _rb: rb, _bt: bt, _glyphs: glyphs, DEAD,
  };
  G = installGenericMotifs(kit, game);
  ES = createEnemyStyle(game, kit);
  kit.enemyStyle = ES;
  return kit;
}
