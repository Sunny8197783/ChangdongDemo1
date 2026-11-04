// Spell palette helpers (PLAN v4 §3.2): every effect colour comes from the 4-step element ramps (core FX_RAMPS);
// no pure white. glint(hex) maps a legacy colour to the `hi` step of the element whose ramp it is closest to (used where
// v3 code paired a white core with an element colour). Owner: magic.
import * as THREE from 'three';
import { FX_RAMPS } from '../core/elements.js';

export const FX = FX_RAMPS;
export const EL9 = ['fire', 'ice', 'lightning', 'wind', 'water', 'earth', 'nature', 'light', 'shadow'];
export const rampOf = (el) => FX[el] || FX.physical;
export const hiOf = (el) => rampOf(el).hi;
export const lightOf = (el) => rampOf(el).light;
export const midOf = (el) => rampOf(el).mid;
export const darkOf = (el) => rampOf(el).dark;

const _c = new THREE.Color(), _h = { h: 0, s: 0, l: 0 };
const HSL = {};
for (const el of EL9) { _c.setHex(FX[el].mid); const o = { h: 0, s: 0, l: 0 }; _c.getHSL(o); HSL[el] = o; }
const memo = new Map();
/** Element whose `mid` hue is nearest to hex (low saturation → physical / light). */
export function elementOfHex(hex) {
  if (hex == null || typeof hex !== 'number') return 'physical';
  let r = memo.get(hex);
  if (r) return r;
  _c.setHex(hex); _c.getHSL(_h);
  if (_h.s < 0.15) r = _h.l < 0.22 ? 'shadow' : 'physical';
  else {
    let bd = 9; r = 'physical';
    for (const el of EL9) {
      const m = HSL[el];
      let dh = Math.abs(_h.h - m.h); dh = Math.min(dh, 1 - dh);
      const d = dh + Math.abs(_h.s - m.s) * 0.1;
      if (d < bd) { bd = d; r = el; }
    }
  }
  if (memo.size < 512) memo.set(hex, r);
  return r;
}
/** The `hi` glint of the element a colour belongs to (replaces the v3 pure-white cores). */
export const glint = (hex) => hiOf(elementOfHex(typeof hex === 'number' ? hex : 0x8A8274));
/** Physical `hi` (the only neutral highlight in the ramps). */
export const GLINT = FX.physical.hi;
