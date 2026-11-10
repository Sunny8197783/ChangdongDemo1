// v4 caster look engine (PLAN v4 §3, §1.4, §7.4.7). Owner: magic.
//   • cast context: every cast (archetype, bespoke impl, legacy def, finisher, support) runs inside begin()/end(); deferred work
//     (timers, projectiles, zones, objects, movers) captures `cur` and restores it, so every visual and every hit carries the cast's castId.
//   • gate: every legacy `game.vfx.*` call of src/spells* goes through fx(name, args): v4 restraint (no point-light flashes, no domes or
//     glow sprites, screenFlash / fovKick only for U/F tiers, bursts → element accents within the tier particle cap, shockwaves → LW rings,
//     beams → BT bolts, decals → DC linework, player "telegraphs" → dotted rotating target rings in the element `light` step) + castId / owner.
//   • hooks: castFx / body (projectile body + trail) / impact (one burst per castId, then per-target sparks) / zone / target, resolved
//     bespoke row (looks_rows.js) → archetype default → element motif (motifs/*.js for fire/ice/lightning/wind/water, melee's registered
//     motifs or motifs/others.js stand-ins for earth/nature/light/shadow).
//   • budgets: a kit facade enforces the per-tier handle and particle ceilings of §1.4 for every cast (refuses the excess).
//   • lookOf(id) → declared level; castLock; first-cast warm.
import * as THREE from 'three';
import { EL9, elementOfHex, rampOf } from './palette.js';
import * as Fire from './motifs/fire.js';
import * as Ice from './motifs/ice.js';
import * as Lightning from './motifs/lightning.js';
import * as Wind from './motifs/wind.js';
import * as Water from './motifs/water.js';
import { installArrows, createFallbacks } from './motifs/others.js';
import { createRows, BESPOKE_IDS } from './looks_rows.js';

export const MAGIC_ELEMENTS = ['fire', 'ice', 'lightning', 'wind', 'water'];
/** Per-cast ceilings (§1.4): kit handles and particles; our own particles keep 25 % headroom for vfx's per-target sparks. */
export const CAPS = {
  B: { handles: 4, particles: 12 }, C: { handles: 8, particles: 60 }, A: { handles: 8, particles: 60 },
  Z: { handles: 6, particles: 22, perSec: true }, U: { handles: 12, particles: 110 }, F: { handles: 16, particles: 190 },
};
const Z_ARCH = new Set(['zone', 'summon', 'buff', 'lane', 'mine']);
/** Tier of a registry skill (§3.3). */
export function tierOfDef(def, id = '') {
  if (!def) return 'A';
  if (def.slot === 'basic') return 'B';
  if (def.slot === 'charged') return 'C';
  if (def.slot === 'ultimate' || /\.awakened$/.test(id)) return 'U';
  if (def.slot === 'finisher') return 'F';
  if (def.slot === 'support') return 'Z';
  return Z_ARCH.has(def.archetype) ? 'Z' : 'A';
}
const LEGACY_SKILL = { basic: 'basic', heavy: 'charged', ultimate: 'ult', awakened: 'awakened', support: 'sup', finisher: 'finisher' };
/** 'fire_heavy' → 'fire.charged' (legacy v2 def id → registry skill id). */
export const skillOfSpell = (spellId) => { const k = String(spellId).lastIndexOf('_'); return k > 0 ? spellId.slice(0, k) + '.' + (LEGACY_SKILL[spellId.slice(k + 1)] || spellId.slice(k + 1)) : spellId; };
const ARCH_V4 = new Set(['projectile', 'volley', 'lob', 'crawler', 'beam', 'cone', 'nova', 'zone', 'wall', 'pillar', 'chain', 'rain',
  'summon', 'blink', 'dash', 'leapslam', 'grapple', 'buff', 'mark', 'chainbind', 'tether', 'lane', 'mine', 'bubble']);
const SMOKE = { smoke: 1, puff: 1, dust: 1, steam: 1, cloud: 1 };
const DROP_SHAPES = { ring: 1, flare: 1, glow: 1, soft: 1, halo: 1 };
const SPARK_SHAPES = { fire: 'ember', ice: 'shard', lightning: 'spark', wind: 'leaf', water: 'droplet', earth: 'rock', nature: 'petal', light: 'mote', shadow: 'wisp', physical: 'spark' };
const DECAL_OF = { fire: 'scorch', ice: 'frost', lightning: 'lichtenberg', water: 'ripple', earth: 'crack', nature: 'flower', light: 'rune', shadow: 'scorch', wind: 'ripple', physical: 'crack' };
const DECAL_KIND = { scorch: 'scorch', frost: 'frost', ice: 'frost', crack: 'crack', cracks: 'crack', lichtenberg: 'lichtenberg', ripple: 'ripple', flowers: 'flower', flower: 'flower', rune: 'rune', strata: 'strata', violet: 'scorch', soft: 'ripple' };
const DEAD = Object.freeze({ alive: false, stop() { return this; }, setPos() { return this; }, setDir() { return this; }, setScale() { return this; }, setAlpha() { return this; }, setEnds() { return this; }, push() { return this; }, update() { return this; } });

export function createLooks(S) {
  const game = S.game;
  let cur = null, kitReal = null, K = null, installed = false;
  const MY = {};                 // el → motif table (magic's 5 elements)
  const standins = new Set();    // 'el:kind' registered by magic as stand-ins (melee may overwrite)
  let FB = null;                 // caster stand-ins for the melee elements
  let ROWS = {};
  const issued = { id: 0, used: 0 };
  let lockUntil = 0;
  const warnedK = new Set();
  const warnOnce = (k, ...a) => { if (!warnedK.has(k)) { warnedK.add(k); console.warn('[spells.looks]', k, ...a); } };
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const now = () => game.time || 0;

  // ------------------------------------------------------------------ install (factory)
  function install() {
    if (installed) return true;
    const k = game.vfx?.kit;
    if (!k || typeof k.registerShape !== 'function' || typeof k.line !== 'function') return false;
    kitReal = k; K = facade(k);
    try {
      MY.fire = Fire.install(K, game).M; MY.ice = Ice.install(K, game).M; MY.lightning = Lightning.install(K, game).M;
      MY.wind = Wind.install(K, game).M; MY.water = Water.install(K, game).M;
      for (const el of MAGIC_ELEMENTS) for (const kind of ['burst', 'spark']) if (MY[el][kind]) MY[el][kind] = K.sub(kind, MY[el][kind]);
      installArrows(K); FB = createFallbacks(K, game);
      for (const el in FB) for (const kind of ['burst', 'spark']) if (FB[el][kind]) FB[el][kind] = K.sub(kind, FB[el][kind]);
      // caster stand-ins become the kit's motifs for earth / nature / light / shadow only while melee has not registered its own
      // (sword runs after spells in ORDER and overwrites them; hitFeel / impact presets then never fall to the generic fallback)
      for (const el of ['earth', 'nature', 'light', 'shadow']) for (const kind in FB[el]) if (!k.hasMotif(el, kind)) { const fn = FB[el][kind]; K.registerMotif(el, kind, (spec) => fn(spec)); standins.add(el + ':' + kind); }
      ROWS = createRows(api);
      installed = true;
    } catch (err) { warnOnce('install', err); installed = false; }
    // castId bookkeeping: the skills runtime stamps ctx.castId with game.nextCastId() just before perform(); the legacy adapter
    // (castById) does not forward it, so remember the last issued id and let castById adopt it once.
    const nc = game.nextCastId;
    if (typeof nc === 'function' && !nc.__magic) {
      const wrapped = function () { const id = nc.apply(this, arguments); issued.id = id; return id; };
      wrapped.__magic = true; game.nextCastId = wrapped;
    }
    return installed;
  }
  const on = () => installed && !!game.vfx?.kit && game.vfx.kit === kitReal;

  // ------------------------------------------------------------------ budget facade over the kit
  // casts by castId (ring of 64): deferred visuals that run outside a context (objects, summons, vfx hit feel) still meet the cast budget
  const byId = new Map();
  const ctxOf = (s) => cur || (s && s.castId ? byId.get(s.castId) : null) || null;
  function facade(k) {
    const can = (s) => {
      const c = ctxOf(s); if (!c) return true;
      if (c.sub != null) { if (c.sub <= 0) { c.refused++; return false; } c.sub--; }
      if (c.h >= c.cap.handles) { c.refused++; if (c.trace) c.trace.push('REFUSED ' + (s?._tk || s?.shape || '?')); return false; }
      c.h++; if (c.trace) c.trace.push(s?._tk || s?.shape || '?'); return true;
    };
    // line weight: a 2 px screen-space floor (1.8 px on the ground) so the thin precise lines keep a saturated core instead of an AA fringe
    const VIOLET = { lightning: 1, shadow: 1 };
    const mid = (s) => {
      const el = s.el || 'physical'; if (s.color == null) s.color = k.ramp(el).mid; if (s.color2 == null) s.color2 = el === 'lightning' ? k.ramp(el).mid : k.ramp(el).light;   // lightning's `light` step is pastel (sat 0.39)
      // (2.4 / 2.8 px since the v4 combat camera sits farther back: the same precise lines, one legible weight at gameplay distance)
      if (s.minPx == null) s.minPx = !s.plane || s.plane === 'ground' ? 2.4 : 2.8;
      // violet bodies (lightning, shadow) mix to grey with the green ground at partial coverage: a fuller line core, opaque off the ground
      if (VIOLET[el] && !s.owner) { s.minPx = Math.max(s.minPx, 2.6); if (s.role !== 'fill') s.alpha = Math.max(s.alpha ?? 0.85, s.plane && s.plane !== 'ground' ? 1 : 0.8); }
      return s;
    };
    const F = Object.create(k);
    // v4 palette discipline: linework bodies in the element `mid` step (saturated), `light` for the secondary / rims, `hi` only where a row asks for a glint
    F.line = (s) => (can(s) ? stampCast(s) && k.line(mid(s)) : DEAD);
    // FM bodies of the pale-ramp elements lean toward their `mid` step (the toon ramp's light / hi bands read grey-white on grass)
    const PALE_FM = { ice: 0.55, lightning: 0.45, wind: 0.3 };
    F.mesh = (n, s) => {
      if (!can(traceKind(s, n))) return DEAD;
      stampCast(s);
      const el = s.el || n.slice(0, n.indexOf('.'));
      if (PALE_FM[el] && s.color == null && s.colors == null && !s.owner) { s.color = k.ramp(el).mid; if (s.tintAmt == null) s.tintAmt = PALE_FM[el]; }
      return k.mesh(n, s);
    };
    F.ribbon = (s) => { if (!can(traceKind(s, 'ribbon'))) return DEAD; stampCast(s); s.tailSat = Math.max(0.75, s.tailSat ?? 0.85); return k.ribbon(s); };
    // bolts: `light` core inside a `mid` halo (the kit's halo is always the `light` step, saturation ≈ 0.39 for lightning — requests/magic.md vfx (2));
    // the halo colour lives on the bolt record and is read on every write, so it is retinted once here (feature-detected, no-op if the kit changes)
    F.bolt = (s) => {
      if (!can(traceKind(s, 'bolt'))) return DEAD; stampCast(s);
      const R = k.ramp(s.el || 'lightning');
      // the kit halo is a soft premultiplied falloff (adds colour over the ground without covering it): keep it narrow, so the bolt reads
      // as a crisp saturated `mid` zig-zag; the 2–3-frame strike itself is the bright moment
      if (s.core == null && !s.owner) s.core = s.el === 'shadow' ? R.light : R.mid;   // shadow: violet rim colour (its mid is near-black)
      if (!s.owner) { if ((s.el || 'lightning') === 'lightning') s.width = Math.max(0.1, s.width ?? 0.08); s.halo = Math.min(s.halo ?? 0.3, s.width * 1.2); }
      const h = k.bolt(s);
      if (!s.owner && s.halo !== 0 && h?._r?.cLight?.isColor) h._r.cLight.copy(R.mid);
      return h;
    };
    F.decal = (kind, p, r, life, o = {}) => { if (!can(traceKind(o, 'decal:' + kind))) return DEAD; if (o.castId == null && cur) o.castId = cur.castId; if (o.color == null && o.el) o.color = k.ramp(o.el).mid; return k.decal(kind, p, r, life, o); };
    F.spark = (p, el, n, dir, o = {}) => {
      const c = ctxOf(o);
      if (c) { tickWindow(c); const left = c.cap.particles - c.p; n = Math.min(n, left); if (n <= 0) return; c.p += n; if (o.castId == null) o.castId = c.castId; }
      k.spark(p, el, n, dir, o);
    };
    // impacts never starve the cast's primary shape: a burst (one per cast, also when vfx.hitFeel plays it on the first hit, which can run
    // before the primary is built) may use at most half of the tier's handles, a per-target spark a quarter; parts are authored most-important-first
    F.sub = (kind, fn) => {
      if (kind !== 'burst' && kind !== 'spark') return fn;
      const share = kind === 'burst' ? 0.5 : 0.25;
      return (spec, kit) => {
        const c = ctxOf(spec); if (!c) return fn(spec, kit);
        if (kind === 'burst' && !spec._own) {
          // vfx.hitFeel plays the burst on the cast's first hit: the full impact plays once per castId, and it is the row's bespoke impact
          if (c.burst > 0) return null;
          c.burst++;
        }
        const prev = c.sub; c.sub = Math.max(1, Math.floor(c.cap.handles * share));
        if (prev != null) c.sub = Math.min(c.sub, prev);
        const pc = cur; cur = c;
        try {
          if (kind === 'burst' && !spec._own && c.row?.impact) { const res = c.row.impact(spec.pos, spec.r ?? 1, spec); if (res !== undefined) return res; }
          return fn(spec, kit);
        } finally { c.sub = prev ?? null; cur = pc; }
      };
    };
    F.registerMotif = (el, kind, fn) => k.registerMotif(el, kind, F.sub(kind, fn));
    F.DEAD = DEAD;
    return F;
  }
  // debug trace of handle use (tests: spells.looks.trace(castId) after setting spells.looks.tracing = true)
  const traceKind = (s, kind) => { if (s && cur?.trace) s._tk = kind; return s; };
  function stampCast(s) { if (s && s.castId == null && cur) s.castId = cur.castId; return true; }
  function tickWindow(c) { if (c.cap.perSec && now() - c.win > 1) { c.win = now(); c.p = 0; } }

  // ------------------------------------------------------------------ cast context
  /** begin({castId, skillId, el, tier, style, arch, family}) → previous context (pass to end()). */
  function begin(o = {}) {
    const def = o.skillId ? game.skills?.def?.(o.skillId) : null;
    const tier = o.tier || tierOfDef(def, o.skillId || '');
    const castId = o.castId || takeIssued() || (game.nextCastId?.() ?? 0);
    const c = {
      castId, skillId: o.skillId || null, el: o.el || def?.element || 'physical', tier, cap: CAPS[tier] || CAPS.A, style: o.style || styleNow(),
      arch: o.arch || def?.archetype || null, row: ROWS[o.skillId] || null, h: 0, p: 0, win: now(), burst: 0, refused: 0, flashed: false, smoke: 0,
      t0: now(), data: {}, trace: api.tracing ? [] : null,
    };
    issued.used = Math.max(issued.used, castId);
    if (castId) { byId.set(castId, c); if (byId.size > 64) byId.delete(byId.keys().next().value); }
    const prev = cur; cur = c;
    return prev;
  }
  function end(prev) { cur = prev ?? null; }
  /** Run fn inside context c (deferred work). */
  function within(c, fn, ...a) { const p = cur; cur = c; try { return fn(...a); } finally { cur = p; } }
  function swap(c) { const p = cur; cur = c; return p; }
  /** Wrap a deferred callback so it runs in the current cast context. */
  function bind(fn) { const c = cur; if (!c) return fn; return (...a) => within(c, fn, ...a); }
  function takeIssued() { if (issued.id > issued.used) { issued.used = issued.id; return issued.id; } return 0; }
  function styleNow() { try { return game.skills?.style?.() || game.player?.weaponStyle || 'staff'; } catch (_) { return 'staff'; } }
  /** Stamp a hit with the cast's castId (never overwrites). */
  function stamp(h) { if (h && h.castId == null && cur) h.castId = cur.castId; return h; }

  // ------------------------------------------------------------------ motif dispatch
  function motif(el, kind, spec = {}) {
    if (!on()) return null;
    const c = cur;
    if (spec.castId == null && c) spec.castId = c.castId;
    if (spec.tier == null && c) spec.tier = c.tier;
    if (spec.lean == null) spec.lean = spec.tier === 'B';
    if (!spec.pos && spec.follow) spec.pos = spec.follow.position;
    if (!spec.pos) return null;
    try {
      const mine = MY[el]?.[kind];
      if (mine) return mine(spec);
      if (kitReal.hasMotif?.(el, kind)) return kitReal.motif(el, kind, spec);   // melee's earth / nature / light / shadow (or magic's stand-in until melee registers)
      const f = FB?.[el]?.[kind];
      if (f) return f(spec);
      return kitReal.motif(el, kind, spec);                                           // vfx generic (marks the cast 'generic')
    } catch (err) { warnOnce('motif:' + el + ':' + kind, err); return null; }
  }
  /** Element motif source for lookOf: 'magic' | 'melee' | 'standin' | 'generic' ('standin' = magic registered it; melee overwrites it when present). */
  function motifSource(el) {
    if (MY[el]) return 'magic';
    if (kitReal?.hasMotif?.(el, 'burst') && !standins.has(el + ':burst')) return 'melee';
    if (kitReal?.hasMotif?.(el, 'burst') && game.sword?.lookOf) return 'melee';
    if (FB?.[el]) return 'standin';
    return 'generic';
  }

  // ------------------------------------------------------------------ semantic hooks
  /** Anticipation at the weapon tip (staff glyph / bow string glyph / totem spirit echo). */
  function castFx(origin, o = {}) {
    if (!on() || !origin) return false;
    const c = cur, el = o.el || c?.el || 'physical';
    if (c?.row?.cast && c.row.cast(origin, o) !== undefined) return true;
    const r = (o.r ?? (c?.tier === 'U' ? 0.6 : c?.tier === 'B' ? 0.34 : 0.45)) * (c?.style === 'bow' ? 0.85 : 1);
    motif(el, 'cast', { pos: origin.clone ? origin.clone() : origin, r, life: o.life });
    if (c && !c.echoed && (c.style === 'totem' || o.echo)) { c.echoed = true; echo(el, r); }
    return true;
  }
  /** Spiritcaller: cast echo on the familiars at 50 % scale (positions read from the familiar instanced mesh). */
  const _m4 = new THREE.Matrix4();
  function echo(el, r) {
    const fm = game.skills?.familiars?.mesh;
    if (!fm || !fm.visible || !(fm.count > 0)) return;
    for (let i = 0; i < Math.min(3, fm.count); i++) {
      fm.getMatrixAt(i, _m4); v1.setFromMatrixPosition(_m4); if (v1.lengthSq() < 1e-6) continue;
      const p = v1.clone(); p.applyMatrix4(fm.matrixWorld);
      K.line({ shape: 'glyph', glyph: el, el, pos: p, plane: 'billboard', r: r * 0.5, width: 0.03, life: 0.22, tIn: 0.08, tOut: 0.1, spin: 1.2, alpha: 0.7 });
    }
  }
  /** Projectile body + trail on a follow proxy. Returns handles (array) or null (caller keeps the legacy mesh). */
  function body(p, o = {}) {
    if (!on()) return null;
    const c = cur, el = p.element || c?.el || 'physical', key = o.mesh || p.meshKey;
    if (c?.row?.body) { const r = c.row.body(p, o); if (r) return r; }
    const sc = o.scale || 1;
    if (key === 'arrow') {
      const R = rampOf(el);
      return [K.mesh(el + '.arrow', { follow: p.proxy, pos: p.pos, dir: p.vel, scale: 1.05 * sc, life: Infinity, tIn: 0.12, tOut: 0.08, erode: false }),
        K.ribbon({ follow: p.proxy, width: 0.07 * sc, taper: 1, life: 0.3, maxLen: 3.2, el, colors: { head: R.light, edge: R.light }, tailSat: 0.3 })].filter(Boolean);
    }
    if (key === 'meteor') return null;   // rows handle the meteor
    const shape = key === 'lance' || key === 'spear' || key === 'glance' ? 'lance' : null;
    const big = key === 'inferno' ? 1.35 : 1;
    return toArr(motif(el, 'trail', { follow: p.proxy, pos: p.pos, dir: p.vel, scale: sc * big * (c?.tier === 'B' ? 0.9 : 1), shape, len: o.len }));
  }
  /** Metres spanning `frac` of the screen height at pos (§1.4 detail floor at the shipped combat camera: the primary shape of every
   *  cast is sized in screen terms, so it stays one legible glyph / ring / arc however far the boom sits; widths too). */
  const _cp = new THREE.Vector3();
  function px(pos, frac) {
    const cam = game.camera; if (!cam || !pos) return 0;
    cam.getWorldPosition(_cp);
    const d = Math.max(3, Math.min(40, _cp.distanceTo(pos)));
    return frac * 2 * d * Math.tan(((cam.fov || 60) * Math.PI / 180) / 2);
  }
  const INK = { light: 1, nature: 1, wind: 1 };
  const PXR = { B: 0.07, C: 0.1, A: 0.1, Z: 0.09, U: 0.14, F: 0.14 };
  /** Impact at the epicentre: the full burst once per castId, per-target sparks after that. */
  function impact(pos, o = {}) {
    if (!pos) return null;
    if (!on()) return null;
    const c = cur, el = o.el || c?.el || 'physical';
    let r = Math.max(0.5, Math.min(7, o.r ?? (o.big ? 1.6 : 1.0) * (o.scale ?? 1)));
    if (c && c.burst === 0) r = Math.max(r, Math.min(4, px(pos, PXR[c.tier] || 0.1)));
    if (!c) return motif(el, 'spark', { pos: pos.clone ? pos.clone() : pos, n: 4 });
    if (c.burst > 0 && !o.force) return motif(el, 'spark', { pos: pos.clone ? pos.clone() : pos, n: 4, dir: o.dir });
    c.burst++;
    if (c.row?.impact) { const res = c.row.impact(pos, r, o); if (res !== undefined) return res; }
    return motif(el, 'burst', { pos: pos.clone ? pos.clone() : pos, r, dir: o.dir, decal: o.decal, _own: true });
  }
  /** Player target marker (replaces player-side telegraphs): dotted rotating ring in the element `light` step (R5). */
  function target(o = {}) {
    if (!on()) return null;
    const c = cur, el = o.el || c?.el || 'physical';
    if (c?.row?.target) { const res = c.row.target(o); if (res !== undefined) return res; }
    const p = o.pos; if (!p) return DEAD;
    const r = Math.max(0.6, Math.min(12, o.r ?? o.radius ?? 2)), life = Math.max(0.2, Math.min(4, (o.dur ?? 0.6) + 0.12));
    return K.line({ shape: 'dots', n: Math.round(10 + r * 5), el, pos: v2.set(p.x, S.height(p.x, p.z) + 0.05, p.z).clone(), plane: 'ground', r, width: 0.05, life, tIn: 0.12, tOut: 0.12, spin: 1.1, alpha: 0.75, color: rampOf(el).light });
  }
  /** Persistent zone linework (replaces filled ground discs). Returns handles; stop them at the zone's end. */
  function zone(kind, pos, r, life, o = {}) {
    if (!on()) return null;
    const c = cur, el = o.el || c?.el || 'physical';
    if (c?.row?.zone) { const res = c.row.zone(kind, pos, r, life, o); if (res !== undefined) return toArr(res); }
    if (kind === 'lane' && o.dir) return lane(el, pos, o, life);
    return toArr(motif(el, 'zone', { pos, r, life: life ?? 4, follow: o.follow }));
  }
  // ---- archetype-level hooks (archetypes.js calls them; rows may override each by name)
  const rowHook = (name, ...a) => { const f = cur?.row?.[name]; return f ? f(...a) : undefined; };
  /** crawler head: motif body travelling on c.proxy (fire.salamander / earth.spikes rows override). */
  function crawl(c) {
    if (!on()) return null;
    const r = rowHook('crawl', c); if (r !== undefined) return toArr(r);
    return toArr(motif(c.el, 'trail', { follow: c.proxy, pos: c.proxy.position, dir: c.dir, scale: 1.25 }));
  }
  function crawlTick(c, dt) {
    const f = cur?.row?.crawlTick; if (f) return f(c, dt);
    c.lookT = (c.lookT ?? 0.25) - dt;
    if (c.lookT <= 0) { c.lookT = 0.45; motif(c.el, 'spark', { pos: c.proxy.position.clone(), n: 3, dir: UP }); }
    return undefined;
  }
  /** nova ring around the caster: one burst (once per cast) + a crisp ground ring at R. */
  function nova(el, c, R) {
    if (!on()) return null;
    const r = rowHook('nova', el, c, R); if (r !== undefined) return r;
    const g = v1.set(c.x, S.height(c.x, c.z) + 0.05, c.z).clone();
    const first = !cur || cur.burst === 0;
    if (first) impact(c, { el, r: Math.min(5, R * 0.55) });
    return K.line({ shape: 'ring', el, pos: g, plane: 'ground', r: R, width: 0.05, life: 0.42, tIn: 0, tOut: 0.25, scaleIn: 'expand', color: rampOf(el).light });
  }
  /** cone sweep (gust / wave / scythe): the element `wave` motif across the cone. */
  function wave(o, dir, len, angDeg) {
    if (!on()) return null;
    const r = rowHook('wave', o, dir, len, angDeg); if (r !== undefined) return r;
    const el = cur?.el || 'physical';
    return motif(el, 'wave', { pos: o.clone ? o.clone() : o, dir, r: len, arc: Math.min(1.4, (angDeg || 60) * Math.PI / 360) });
  }
  /** one rain strike (meteor shower, storm bolts, light lances …): pillar motif, lean. */
  function strike(el, q, R, p) {
    if (!on()) return null;
    const r = rowHook('strike', el, q, R, p); if (r !== undefined) return r;
    return motif(el, 'pillar', { pos: q, r: Math.min(1.2, R * 0.35), h: el === 'lightning' || el === 'light' ? 10 : 2.6, lean: true, life: 0.5, decal: false });
  }
  /** blink: a line from → to (bolt for lightning, tapered ribbon otherwise) + cast glyph at the start + spark at the end. */
  function blink(el, a, b) {
    if (!on()) return null;
    const r = rowHook('blink', el, a, b); if (r !== undefined) return r;
    const out = [];
    if (el === 'lightning') { out.push(K.bolt({ from: a, to: b, forks: 1, width: 0.1, halo: 0.3, life: 0.06, afterglow: 0.2, el })); out.push(K.mesh('lightning.orb', { pos: b.clone(), scale: 0.6, life: 0.2, tIn: 0.02, tOut: 0.12, erode: true, grow: 1.3 })); }
    else out.push(K.ribbon({ points: [a, a.clone().lerp(b, 0.5).setY(Math.max(a.y, b.y) + 0.15), b], width: 0.16, taper: 0.9, life: 0.3, el, alpha: 0.75 }));
    motif(el, 'spark', { pos: b.clone(), n: 5 });
    return out;
  }
  /** Rune circles: U / F casts keep the v3 sigils the user likes; everything else gets the element's own glyph circle
   *  (crisp LW, distinct per element: the shared rune texture made every element's zone / summon / buff silhouette identical). */
  function sigil(pos, o, raw) {
    const c = cur;
    if (!on() || !c || c.tier === 'U' || c.tier === 'F' || c.row?.keepSigil) return raw(pos, o);
    const el = c.el || 'physical', r = Math.max(0.6, Math.min(4, (o.radius ?? 2) * 0.85));
    // ground ink: elements whose `mid` is pale or grass-coloured (light ivory, nature / wind green) draw the circle in their `dark` step,
    // the others in `mid`; the weight is held at gameplay distance (§1.4 detail floor)
    const gpos = v1.set(pos.x, S.height(pos.x, pos.z) + 0.05, pos.z).clone();
    return K.line({ shape: 'glyph', glyph: EL9.includes(el) ? el : 'hexagram', el, pos: gpos, plane: 'ground', r, width: Math.max(0.04, px(gpos, 0.006)),
      life: Math.min(1.2, o.duration ?? 0.8), tIn: 0.28, tOut: 0.3, spin: Math.sign(o.spin ?? 1) * 0.9, alpha: INK[el] ? 0.95 : 0.85, color: INK[el] ? rampOf(el).dark : undefined });
  }
  /** props.spikes / props.pillars eruption: rows decide (ice.ult wave front); default = one FM shape within the cast budget — an ice prism,
   *  or (earth) a strata shard in the earth `light` step with its dark outline edge (no near-black opaque slabs). Every eruption is an
   *  occluder: it fades while it stands between the camera and the player or an enemy (§5.4 readability; returns false when refused,
   *  so the caller's instanced prop keeps platforms and walls visible). */
  const occl = [];
  let zig = 0; const _qz = new THREE.Quaternion(), _zAx = new THREE.Vector3(0, 0, 1);
  const COLUMN = { fire: 'fire.flame', lightning: 'lightning.spike', wind: 'wind.crescent', water: 'water.droplet', nature: 'nature.leaf', light: 'light.feather', shadow: 'shadow.tendril' };
  function spike(x, y, z, o = {}) {
    if (!on()) return false;
    const r = rowHook('spike', x, y, z, o); if (r !== undefined) return r;
    // a wall / pillar eruption of a non-earth cast takes the element's own column shape (fire tongue, lightning spike, water droplet …):
    // every element used to raise the same rock row (MG1.f wall silhouettes 0.8+ between elements)
    const ce = o.el === 'earth' ? cur?.el : null, colName = ce && COLUMN[ce] && kitReal?._fm?.hasShape?.(COLUMN[ce]) ? COLUMN[ce] : null;
    if (colName) {
      const H = Math.max(0.6, o.height || 1.6), rad = kitReal._fm.shapeOf(colName)?.radius || 0.5;
      const life = (o.rise ?? 0.14) + (o.hold ?? 1.5) + (o.sink ?? 0.45);
      const hc = K.mesh(colName, { pos: new THREE.Vector3(x, y + H * 0.45, z), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(o.tiltX || 0, o.yaw || 0, o.tiltZ || 0)),
        scale: H / (2 * rad), life, tIn: Math.max(0.08, o.rise ?? 0.14), tOut: Math.min(0.5, o.sink ?? 0.45), erode: true, el: ce, alpha: 0.85 });
      if (!hc || hc === DEAD || hc.alive === false) return !o.keep;
      if (H >= 1.2 && occl.length < 48) occl.push({ h: hc, x, z, y, top: y + H, r: Math.max(0.5, (o.width || 1) * 0.6), a: 1 });
      return true;
    }
    const earth = o.el === 'earth';
    const life = (o.rise ?? 0.14) + (o.hold ?? 1.5) + (o.sink ?? 0.45), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.tiltX || 0, o.yaw || 0, o.tiltZ || 0));
    let h, top;
    if (earth) {
      const H = Math.max(0.6, o.height || 1.6), W = Math.max(0.4, o.width || 1);
      // upright rows (walls, steps) lean alternately along the row: a zig-zag of strata, never the ice row's upright prisms
      if (!o.tiltX && !o.tiltZ) { const lean = (zig++ % 2 ? 0.5 : -0.5); q.multiply(_qz.setFromAxisAngle(_zAx, lean)); }
      const sc = new THREE.Vector3(W * 1.7, H * 0.78, W * 1.7);   // physical.shard: 0.4 × 1.2 octahedron → ≈ 0.94 H tall, 0.7 W wide
      h = K.mesh('physical.shard', { pos: new THREE.Vector3(x, y + H * 0.25, z), quat: q, scale: sc, life, tIn: Math.max(0.08, o.rise ?? 0.14), tOut: Math.min(0.5, o.sink ?? 0.45), erode: true,
        el: 'earth', color: rampOf('earth').light, tintAmt: 0.85, alpha: 0.9 });
      top = y + H * 0.95;
    } else {
      const s = Math.max(0.6, o.height || 1.6) * 0.62;
      h = K.mesh('ice.prism', { pos: new THREE.Vector3(x, y, z), quat: q, scale: s, life, tIn: Math.max(0.08, o.rise ?? 0.14), tOut: Math.min(0.5, o.sink ?? 0.45), erode: true });
      top = y + (o.height || 1.6);
    }
    if (!h || h === DEAD || h.alive === false) return !o.keep;   // refused: dropped (v4 budget), except walls / steps / pillars that carry a collider (o.keep: the instanced prop stays)
    if ((o.height || 1.6) >= 1.2 && occl.length < 48) occl.push({ h, x, z, y, top, r: Math.max(0.5, (o.width || 1) * 0.6), a: 1 });
    return true;
  }
  /** Once per frame: eruptions between the camera and the player / a nearby enemy fade to 0.25 (§5.4 near-camera / camera-segment fade
   *  for spell objects; crystals and strata no longer hide what is attacking). */
  const _oc = new THREE.Vector3(), _near = [];
  function occlusion(dt) {
    if (!occl.length) return;
    const cam = game.camera; if (!cam) return;
    cam.getWorldPosition(_oc);
    const pp = game.player?.object?.position;
    _near.length = 0;
    try { if (pp) game.combat?.queryRadius?.(pp, 30, '!player', _near); } catch (_) { _near.length = 0; }
    const k = Math.min(1, dt * 10);
    for (let i = occl.length - 1; i >= 0; i--) {
      const O = occl[i];
      if (!O.h.alive) { occl.splice(i, 1); continue; }
      let hide = pp ? blocks(O, pp.x, pp.y + 1, pp.z) : false;
      for (let j = 0; !hide && j < _near.length && j < 12; j++) { const e = _near[j], ep = e?.object?.position; if (e?.alive && ep && !e.isProp) hide = blocks(O, ep.x, ep.y + (e.height || 1.6) * 0.5, ep.z); }
      O.a += ((hide ? 0.25 : 1) - O.a) * k;
      O.h.setAlpha?.(O.a);
    }
  }
  /** Does the vertical occluder O cut the camera → (tx, ty, tz) segment (in front of the target, within its radius + 0.6 m, below its top)? */
  function blocks(O, tx, ty, tz) {
    const dx = tx - _oc.x, dz = tz - _oc.z, L2 = dx * dx + dz * dz; if (L2 < 1e-4) return false;
    const t = ((O.x - _oc.x) * dx + (O.z - _oc.z) * dz) / L2;
    if (t <= 0 || t >= 0.97) return false;
    const qx = _oc.x + dx * t - O.x, qz = _oc.z + dz * t - O.z, rr = O.r + 0.6;
    if (qx * qx + qz * qz > rr * rr) return false;
    const yAt = _oc.y + (ty - _oc.y) * t;
    return yAt < O.top + 0.3 && yAt > O.y - 0.5;
  }
  /** buff aura following the caster for dur. */
  function aura(el, obj, dur) {
    if (!on()) return null;
    const r = rowHook('aura', el, obj, dur); if (r !== undefined) return toArr(r);
    return toArr(motif(el, 'aura', { follow: obj, pos: obj.position, life: dur }));
  }
  /** Lane surfaces (ice road / tailwind / frost ground): linework stations along the strip + tiny prisms (ice). */
  function lane(el, pos, o, life) {
    const d = v1.set(o.dir.x, 0, o.dir.z).normalize().clone(), len = o.len || 12, w = o.width || 3, out = [];
    const n = Math.max(2, Math.min(el === 'ice' ? 3 : 4, Math.round(len / 3.2)));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, p = new THREE.Vector3(pos.x + d.x * len * t, 0, pos.z + d.z * len * t); p.y = S.height(p.x, p.z) + 0.05;
      if (el === 'ice') out.push(K.line({ shape: 'poly', sides: 6, el: 'ice', pos: p, plane: 'ground', r: w * 0.42, width: 0.04, life, tIn: 0.15 + i * 0.06, tOut: 0.4, alpha: 0.4, rot: Math.atan2(d.z, d.x) }));
      else out.push(K.line({ shape: el === 'wind' ? 'spiral' : 'dots', turns: 0.7, arms: 2, n: 14, el, pos: p, plane: 'ground', r: w * 0.42, width: 0.035, life, tIn: 0.15 + i * 0.06, tOut: 0.4, spin: el === 'wind' ? 2 : 0.5, alpha: 0.32 }));
    }
    // ice: small prisms every few metres along both lane edges (they stand above the grass; the hex linework lies in it)
    if (el === 'ice') for (let i = 0; i < 3; i++) { const t = (i + 0.6) / 3.2, sd = i % 2 ? -0.5 : 0.5, p = new THREE.Vector3(pos.x + d.x * len * t + d.z * w * sd, 0, pos.z + d.z * len * t - d.x * w * sd); p.y = S.height(p.x, p.z);
      out.push(K.mesh(i === 1 ? 'ice.prism' : 'ice.stub', { pos: p, scale: i === 1 ? 0.75 : 1.0, life, tIn: 0.2 + i * 0.1, tOut: 0.4, erode: true })); }
    return out.filter(Boolean);
  }
  const toArr = (x) => (x == null ? null : Array.isArray(x) ? x.filter(Boolean) : [x]);
  const stopAll = (list, fade = true) => { if (!list) return; for (const h of list) { try { h?.stop?.(fade); } catch (_) { /* */ } } };

  // ------------------------------------------------------------------ the legacy gate
  const V = () => game.vfx;
  function call(name, a) { const f = V()?.[name]; if (typeof f !== 'function') return null; try { return f.apply(V(), a); } catch (err) { warnOnce('vfx.' + name, err); return null; } }
  function optsOf(a) { for (let i = a.length - 1; i >= 0; i--) { const x = a[i]; if (x && typeof x === 'object' && !x.isVector3 && !Array.isArray(x) && !x.isColor) return x; } return null; }
  function stampOpts(a) { const o = optsOf(a); if (o && cur) { if (o.castId == null) o.castId = cur.castId; if (o.owner == null) o.owner = 'player'; } return a; }
  const colEl = (col) => elementOfHex(Array.isArray(col) ? col[col.length > 1 ? 1 : 0] : col);

  function fx(name, a) {
    if (!V()) return null;
    const c = cur;
    if (c?.row && on()) {
      const g = c.row.gate?.[name];
      if (g) { const r = g(a); if (r !== undefined) return r; }
      if (c.row.quiet?.[name]) return null;
    }
    const ultLike = c && (c.tier === 'U' || c.tier === 'F') && !c.row?.noFlash;
    if (name === 'screenFlash' || name === 'fovKick') {
      if (!ultLike || c.flashed === name) return null;
      if (name === 'screenFlash') {
        if (game.settings?.values?.flashReduce) return null;
        c.flashed = name;
        return call(name, [rampOf(c.el).mid, Math.min(0.25, a[1] ?? 0.2), Math.min(0.15, a[2] ?? 0.15)]);
      }
      return call(name, [Math.max(-4, Math.min(4, a[0] ?? 0)), Math.min(0.3, a[1] ?? 0.3)]);
    }
    if (!on()) {
      if (name === 'flash' || name === 'dome') return null;
      return call(name, stampOpts(a));
    }
    switch (name) {
      case 'flash': case 'dome': case 'flashSprite': case 'charge': return null;
      case 'telegraph': return target(a[0] || {});
      case 'burst': return accent(a[0], a[1] || {});
      case 'emitter': return emitter(a[0] || {});
      case 'shockwave': return ring(a[0], a[1] || {});
      case 'groundDecal': return gdecal(a[0], a[1], a[2], a[3]);
      case 'decal': return ldecal(a[0], a[1] || {});
      case 'debris': return debris(a[0], a[1] || {});
      case 'explosion': return impact(a[0], { el: a[1]?.element, scale: (a[1]?.scale ?? 1) * 0.8, big: true });
      case 'impact': return impact(a[0], { el: a[1]?.element, scale: a[1]?.scale ?? 0.8 });
      case 'shatter': return impact(a[0], { el: 'ice', scale: a[1]?.scale ?? 1 });
      case 'preset': {
        const n = String(a[0] || '');
        const m = /^(impact|explosion)_(\w+)$/.exec(n);
        if (m) return impact(a[1], { el: m[2], scale: a[2]?.scale ?? 1, big: m[1] === 'explosion' });
        return call(name, stampOpts(a));
      }
      case 'runeCircle': {
        // ground rune circles → the spells sigil (normal-blended, element `mid`; the vfx rune pool is additive and reads grey on grass);
        // sky circles (rain / storm overhead) stay on the vfx pool
        const p = a[0], o = a[1] || {};
        if (p && S.props?.sigil && Math.abs(p.y - S.height(p.x, p.z)) < 2.5) {
          S.props.sigil(p, { color: (o.element || c?.el) === 'shadow' ? rampOf('shadow').light : rampOf(o.element || c?.el || 'light').mid, radius: Math.min(8, o.r ?? 2), duration: o.dur ?? 1.2, spin: o.rotSpeed ?? 1.2 });
          return null;
        }
        return call(name, stampOpts(a));
      }
      case 'beam': return beam(a[0], a[1], a[2] || {});
      case 'steam': return accent(a[0], { count: 6, shape: 'smoke', color: 0xdde6ee, life: 0.7 });
      case 'reaction': case 'blessing': case 'crystal': case 'smear': return call(name, stampOpts(a));
      default: return call(name, stampOpts(a));
    }
  }
  function accent(pos, o) {
    if (!pos) return null;
    const c = cur, el = c?.el && !o.color ? c.el : (o.element || colEl(o.color) || c?.el || 'physical');
    const shape = o.shape || 'spark';
    if (DROP_SHAPES[shape]) return null;
    if (SMOKE[shape]) {
      if (c && c.smoke >= 12) return null;
      const n = Math.min(4, o.count ?? 3); if (c) c.smoke += n;
      const R = rampOf(el === 'physical' || el === 'wind' || el === 'light' ? 'earth' : el);
      return call('burst', [pos, { count: n, shape: 'smoke', color: [R.light, R.mid], alpha: Math.min(0.3, o.alpha ?? 0.3), additive: false, speed: Math.min(2, o.speed ?? 1.5), spread: 1,
        size: Math.min(0.8, o.size ?? 0.6), sizeEnd: Math.min(1.1, o.sizeEnd ?? 1), life: Math.min(0.8, o.life ?? 0.7), drag: 2, castId: c?.castId, owner: 'player' }]);
    }
    const n = Math.min(12, Math.max(2, Math.round((o.count ?? 8) * 0.3)));
    const sh = shape === 'spark' || shape === 'star' ? (SPARK_SHAPES[el] || 'spark') : shape === 'snow' ? 'shard' : shape === 'bubble' ? 'droplet' : shape;
    K.spark(pos, el, n, o.dir || null, { shape: sh, speed: Math.min(9, o.speed ?? 5), gravity: o.gravity ?? undefined, life: Math.min(0.6, o.life ?? 0.4), size: Math.min(0.2, o.size ?? 0.14) });
    return null;
  }
  function emitter(o) {
    const h = { alive: true, stop() { this.alive = false; if (this.rb) this.rb.stop(true); } };
    const c = cur;
    if (o.follow && c && !c.trail) {
      c.trail = true;
      h.rb = K.ribbon({ follow: o.follow, followOff: o.offset, width: Math.min(0.12, (o.size ?? 0.2) * 0.6), taper: 1, life: 0.22, maxLen: 1.6, el: c.el, alpha: 0.55 });
    }
    return h;
  }
  function ring(pos, o) {
    if (!pos) return null;
    const c = cur, el = c?.el || colEl(o.color) || 'physical', R = rampOf(el);
    const life = Math.max(0.15, Math.min(c?.tier === 'U' ? 0.8 : 0.5, o.duration ?? 0.4));
    const nearG = !o.vertical && pos.y - S.height(pos.x, pos.z) < 1.2;
    return K.line({ shape: 'ring', el, pos: nearG ? v1.set(pos.x, S.height(pos.x, pos.z) + 0.05, pos.z).clone() : pos, plane: o.vertical ? 'billboard' : nearG ? 'ground' : 'flat',
      r: Math.max(0.3, Math.min(16, o.radius ?? 2)), width: Math.max(0.025, Math.min(0.07, (o.thickness ?? 0.5) * 0.05)), life, tIn: 0, tOut: life * 0.6, scaleIn: 'expand',
      alpha: Math.min(0.8, o.opacity ?? 0.8), color: R.light });
  }
  function gdecal(kind, pos, r, life) {
    if (!pos) return null;
    const c = cur, el = c?.el || 'physical', k = DECAL_KIND[kind] || DECAL_OF[el];
    return K.decal(k, pos, Math.max(0.5, Math.min(10, r ?? 2)), Math.min(c?.tier === 'U' ? 6 : 2.5, life ?? 2), { el, alpha: 0.3 });
  }
  function ldecal(pos, o) {
    if (!pos) return null;
    const c = cur, el = c?.el || colEl(o.color) || 'physical';
    return K.decal(DECAL_OF[el] || 'crack', pos, Math.max(0.5, Math.min(10, o.radius ?? 2)), Math.min(c?.tier === 'U' ? 6 : 2, o.duration ?? 2), { el, alpha: Math.min(0.3, o.opacity ?? 0.3) });
  }
  function debris(pos, o) {
    if (!pos) return null;
    const el = cur?.el || (o.material === 'rock' ? 'earth' : colEl(o.color));
    K.spark(pos, el, Math.min(8, Math.max(2, Math.round((o.count ?? 8) * 0.3))), UP, { shape: el === 'earth' || o.material === 'rock' ? 'rock' : 'shard', gravity: 14, speed: Math.min(9, o.speed ?? 6), life: 0.6 });
    return null;
  }
  function beam(from, to, o) {
    if (!from || !to) return null;
    const c = cur, el = c?.el || colEl(o.color) || 'physical';
    const jag = o.jagged ?? 0.3, w = o.width ?? 0.12;
    // hand → target lines start 1.2 m out from the caster's hand (nothing drawn right in front of the camera)
    const pp = game.player?.object?.position;
    if (pp && Math.hypot(from.x - pp.x, from.z - pp.z) < 1.5) { const L2 = from.distanceTo(to); if (L2 > 3) from = from.clone().lerp(to, Math.min(0.3, 1.2 / L2)); }
    if (el === 'lightning' || jag > 0.2) {
      return K.bolt({ from, to, forks: Math.min(2, o.branches ?? (c?.tier === 'B' ? 1 : 2)), width: Math.min(0.12, Math.max(0.05, w * 0.6)), halo: Math.min(0.35, w + 0.12),
        life: Math.min(0.1, o.duration ?? 0.08), afterglow: 0.25, el, seed: (c?.castId || 1) * 7 + (c ? c.h : 0) });
    }
    const dur = o.duration ?? 0.3;
    if (dur <= 0.6 && el !== 'light') {   // short vines / ink lines / water ropes: a tapered ribbon (body in mid, crisp light edge)
      return K.ribbon({ points: [from, from.clone().lerp(to, 0.5).setY((from.y + to.y) / 2 + 0.12), to], width: Math.min(0.32, Math.max(0.12, w * 1.25)), taper: 0.6, life: Math.max(0.2, dur), el, alpha: 0.85 });
    }
    return K.bolt({ from, to, forks: 0, jagged: 0, width: Math.min(0.12, Math.max(el === 'shadow' ? 0.1 : 0.05, w * 0.25)), halo: Math.min(0.6, w * 0.55 + 0.1), life: Math.max(0.1, dur), afterglow: 0.15, el });
  }

  // ------------------------------------------------------------------ boot warm-up (first cast ≤ 8 ms: the JS paths of every look run once at boot)
  function warmup() {
    if (!on()) return 0;
    const far = new THREE.Vector3(0, -400, 0), dir = new THREE.Vector3(0, 0, 1), proxy = new THREE.Object3D();
    proxy.position.copy(far); game.scene.add(proxy);
    const t0 = performance.now(); let n = 0;
    const prev = cur;
    try {
      for (const el of EL9) for (const kind of ['cast', 'trail', 'burst', 'spark', 'zone', 'pillar', 'wave', 'aura', 'summon']) {
        cur = null; motif(el, kind, { pos: far.clone(), follow: kind === 'trail' || kind === 'aura' ? proxy : undefined, dir, r: 2, h: 3, life: 0.05, castId: 0 }); n++;
      }
      begin({ skillId: 'fire.rising', castId: -1 });
      const far2 = far.clone().setX(4);
      for (const el of EL9) {
        cur.el = el; cur.h = 0; cur.p = 0; cur.burst = 0;
        fx('burst', [far.clone(), { count: 10, shape: 'spark', color: 0x8899aa }]); fx('shockwave', [far.clone(), { radius: 2, duration: 0.05 }]);
        fx('beam', [far.clone(), far2.clone(), { duration: 0.05, jagged: 0.5 }]); fx('beam', [far.clone(), far2.clone(), { duration: 0.05, jagged: 0.02 }]); fx('beam', [far.clone(), far2.clone(), { duration: 1, jagged: 0.02 }]);
        fx('groundDecal', ['scorch', far.clone(), 2, 0.05]); fx('decal', [far.clone(), { radius: 2, duration: 0.05 }]); fx('debris', [far.clone(), { count: 6 }]);
        fx('telegraph', [{ pos: far.clone(), r: 2, dur: 0.05 }]); fx('emitter', [{ follow: proxy, size: 0.2 }]).stop();
        impact(far.clone(), { el, r: 1 }); nova(el, far.clone(), 3); wave(far.clone(), dir, 4, 60); strike(el, far.clone(), 2, {}); blink(el, far.clone(), far2.clone());
        n++;
      }
      for (const id in ROWS) {
        const row = ROWS[id];
        begin({ skillId: id, castId: -1 });
        const fake = { element: cur.el, pos: far.clone(), vel: dir.clone(), proxy, meshKey: 'orb' };
        for (const k of ['cast', 'impact', 'target']) { try { row[k]?.(k === 'target' ? { pos: far.clone(), r: 2, dur: 0.1 } : far.clone(), 2, {}); } catch (_) { /* */ } }
        try { row.body?.(fake, { mesh: 'orb', scale: 1 }); } catch (_) { /* */ }
        try { row.zone?.('fire', far.clone(), 3, 0.05, { follow: proxy }); } catch (_) { /* */ }
        try { row.nova?.(cur.el, far.clone(), 4); row.wave?.(far.clone(), dir, 5, 60); row.strike?.(cur.el, far.clone(), 2, {}); } catch (_) { /* */ }
        n++;
      }
    } finally { cur = prev; }
    try { kitReal.clear?.(); } catch (_) { /* */ }
    game.scene.remove(proxy);
    byId.delete(-1);
    return { n, ms: +(performance.now() - t0).toFixed(1) };
  }

  // ------------------------------------------------------------------ cast lock (player dodge buffer, §5.8)
  function lock(sec) { lockUntil = Math.max(lockUntil, (game.realTime ?? now()) + Math.max(0, sec)); }
  function castLock() { const t = game.realTime ?? now(); return Math.max(0, lockUntil - t); }

  // ------------------------------------------------------------------ declared look level (§1.4; MG1 verifies it by measurement)
  function lookOf(id) {
    const def = game.skills?.def?.(id);
    if (!def) return null;
    if (!on()) return 'legacy';
    const el = def.element || S.game.spells?.element || 'fire';   // breadth.finisher: the attuned element
    if (motifSource(el) === 'generic') return 'generic';
    if (ROWS[id]) return 'bespoke';
    if (def.slot === 'finisher') return 'archetype';
    if (!def.archetype || !ARCH_V4.has(def.archetype)) return 'legacy';
    return 'archetype';
  }

  // ------------------------------------------------------------------ spell objects (R8, R10, §7.4.7)
  const adopted = new WeakSet();
  /** Spell objects: userData.noCameraCollide / owner, private materials through vfx.applyPlayerFx (side effect only),
   *  depthWrite false in the transparent pass (entities — treant, totem, clone — keep depth: they are bodies). */
  function adopt(root, { role = 'fill', entity = false } = {}) {
    if (!root?.traverse) return root;
    const apf = game.vfx?.applyPlayerFx;
    root.traverse((o) => {
      o.userData.noCameraCollide = true; if (!o.userData.owner) o.userData.owner = 'player';
      if (!o.isMesh && !o.isPoints && !o.isSprite) return;
      for (const m of [].concat(o.material)) {
        if (!m || adopted.has(m) || m.userData?.shared) continue;
        adopted.add(m);
        if (!entity) { m.depthWrite = false; if (!m.transparent) m.transparent = true; }
        try { if (typeof apf === 'function') apf(m, { role, additive: m.blending === THREE.AdditiveBlending }); } catch (_) { /* */ }
      }
    });
    return root;
  }

  const api = {
    adopt, install, on, begin, end, within, swap, bind, stamp, motif, motifSource, castFx, body, impact, target, zone, fx, stopAll, toArr,
    crawl, crawlTick, nova, wave, strike, blink, aura, rowHook, spike, occlusion, sigil, warmup, px, PXR, INK,
    tracing: false, trace: (id) => { const c = byId.get(id); return c ? { h: c.h, refused: c.refused, list: c.trace } : null; },
    lock, castLock, lookOf, tierOf: tierOfDef, skillOfSpell, takeIssued, CAPS, BESPOKE_IDS, MAGIC_ELEMENTS,
    get cur() { return cur; }, get kit() { return K; }, get rows() { return ROWS; }, get installed() { return installed; },
    S, game, DEAD, UP,
  };
  return api;
}
