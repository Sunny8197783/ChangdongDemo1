// Enemy-owned FX style (PLAN v4 R11, §3.8). Owner: vfx. Every vfx.preset / burst / motif / flashSprite call with
// owner:'enemy' renders as a dark core (fx.dark) + thin element rim (fx.mid): no ramp.hi glints, no rune-circle / glyph-band
// look, never a reserved threat hue, flashes ≤ 1.5 m, never ducked; counted in the enemy-FX coverage budget.
import * as THREE from 'three';
import { FX_RAMPS } from '../core/elements.js';

const _c = new THREE.Color(), _h = {};
const SRGB = THREE.SRGBColorSpace;   // hue tests in display (sRGB) space, not the linear working space
const ELS = Object.keys(FX_RAMPS).filter((k) => k !== 'physical');
const MID_HSL = {};
for (const el of Object.keys(FX_RAMPS)) { _c.setHex(FX_RAMPS[el].mid); const h = {}; _c.getHSL(h, SRGB); MID_HSL[el] = h; }

/** Reserved threat hues (§5.1): danger red, parry gold, unblockable magenta, punish white-cyan, safe mint. */
const RESERVED = [0xFF2A3D, 0xFFD23A, 0xFF2BD6, 0xF2FFFF, 0xC8FFE0];
const RES_HSL = RESERVED.map((c) => { const h = {}; _c.setHex(c); _c.getHSL(h, SRGB); return h; });

/** True when hex is within ~14° hue and saturation > 0.6 of a reserved threat hue (or near-white punish/safe tints). */
export function isReservedHue(hex) {
  _c.setHex(hex); _c.getHSL(_h, SRGB);
  const hsv = hsvSat(hex);
  for (let i = 0; i < RES_HSL.length; i++) {
    const r = RES_HSL[i];
    if (i >= 3) { if (_h.l > 0.85 && Math.abs(_h.h - r.h) < 0.05 && hsv < 0.25 && hsv > 0.12) return true; continue; }
    let dh = Math.abs(_h.h - r.h); dh = Math.min(dh, 1 - dh);
    if (dh < 0.04 && hsv > 0.6) return true;
  }
  return false;
}
export function hsvSat(hex) { const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx > 0 ? (mx - mn) / mx : 0; }

/** Nearest element (by hue) of a legacy colour; low saturation → physical. Shadow-violet / void → shadow. */
export function elementOfColor(hex) {
  if (hex == null) return 'physical';
  _c.setHex(hex); _c.getHSL(_h, SRGB);
  if (_h.s < 0.18) return _h.l < 0.25 ? 'shadow' : 'physical';
  let best = 'physical', bd = 9;
  for (const el of ELS) {
    const m = MID_HSL[el];
    let dh = Math.abs(_h.h - m.h); dh = Math.min(dh, 1 - dh);
    const d = dh + Math.abs(_h.s - m.s) * 0.08 + (el === 'light' ? 0.04 : 0);
    if (d < bd) { bd = d; best = el; }
  }
  return best;
}

export function createEnemyStyle(game, kit) {
  const ramp = (el) => kit.ramp(el);
  /** Rewrites a burst option object in place for owner:'enemy' (dark core + mid rim, normal-blended, ≤ 1.5 m flashes). */
  function burstOpts(o, el) {
    const R = ramp(el || o.el || elementOfColor(Array.isArray(o.color) ? o.color[0] : o.color));
    o.color = [R.mid.getHex(), R.dark.getHex()];
    o.additive = false; o.styled = true;
    if (o.shape === 'flare' || o.shape === 'soft' || o.shape === 'glow') { o.size = Math.min(o.size ?? 0.3, 1.5); o.sizeEnd = Math.min(o.sizeEnd ?? o.size, 1.5); o.alpha = Math.min(o.alpha ?? 1, 0.6); }
    if (o.shape === 'rune' || o.shape === 'star') o.shape = 'spark';
    o.alpha = Math.min(o.alpha ?? 1, 0.9);
    return o;
  }
  /** Generic enemy-style motif for every kind: dark band + thin mid rim ring, styled particles, no glyphs. */
  function motif(el, kind, spec = {}) {
    const R = ramp(el); const pos = spec.pos; if (!pos) return null;
    const r = Math.min(spec.r ?? 1.2, kind === 'zone' ? 6 : 3);
    const out = [];
    const base = { pos, owner: 'enemy', castId: spec.castId, plane: kind === 'burst' || kind === 'zone' || kind === 'summon' ? 'ground' : 'billboard' };
    if (kind !== 'spark' && kind !== 'trail') {
      out.push(kit.line({ ...base, shape: 'ring', r, width: 0.14, color: R.dark, alpha: 0.55, life: kind === 'zone' ? (spec.life ?? 3) : 0.45, tIn: 0.1, tOut: 0.25, scaleIn: kind === 'burst' ? 'expand' : 'backOut' }));
      out.push(kit.line({ ...base, shape: 'ring', r: r + 0.07, width: 0.035, color: R.mid, alpha: 0.85, life: kind === 'zone' ? (spec.life ?? 3) : 0.45, tIn: 0.1, tOut: 0.25, scaleIn: kind === 'burst' ? 'expand' : 'backOut' }));
    }
    if (kind === 'trail' && spec.follow) out.push(kit.ribbon({ follow: spec.follow, width: spec.width ?? 0.22, life: 0.25, el, owner: 'enemy', castId: spec.castId }));
    const n = kind === 'spark' ? Math.min(6, spec.n ?? 6) : Math.min(10, spec.n ?? 8);
    kit.emit(pos, { count: n, shape: 'spark', speed: 5, drag: 3, gravity: 4, size: 0.14, sizeEnd: 0.05, life: 0.35, velocityStretch: 0.05, owner: 'enemy', el, castId: spec.castId, dir: spec.dir, spread: spec.dir ? 0.6 : 1 });
    return out.length ? out : null;
  }
  return { burstOpts, motif, elementOfColor, isReservedHue };
}
