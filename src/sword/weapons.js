// Melee weapon profiles (CONTRACT §12) + the melee element palette (ELEMENT_DEFS-driven, melee-only extras keyed by element).
// WeaponProfile: {id, reachMul, arcMul, speedMul, hitstopMul, trail:{width, color, life, noise}, smear:'arc'|'wide'|'twin',
//                 tips:['tip']|['tipL','tipR'], twoHanded}
// reachMul / speedMul follow DESIGN §6.1: hammer radius ×1.2 / speed ×0.85, daggers radius ×0.85 / speed ×1.25.
import { ELEMENT_DEFS, ALL_ELEMENTS, PSEUDO_ELEMENTS } from '../core/elements.js';

export const WEAPONS = {
  longsword: { id: 'longsword', nameKo: '장검', reachMul: 1, arcMul: 1, speedMul: 1, hitstopMul: 1.5, poiseMul: 1,
    trail: { width: 1, color: null, life: 0.16, noise: 0.55, edge: 1 }, smear: 'arc', tips: ['tip'], twoHanded: false },
  hammer: { id: 'hammer', nameKo: '전투 망치', reachMul: 1.2, arcMul: 1.1, speedMul: 0.85, hitstopMul: 1.9, poiseMul: 1.5,
    trail: { width: 1.45, color: null, life: 0.22, noise: 0.35, edge: 0.75 }, smear: 'wide', tips: ['tip'], twoHanded: false },
  daggers: { id: 'daggers', nameKo: '쌍단검', reachMul: 0.85, arcMul: 0.95, speedMul: 1.25, hitstopMul: 1.3, poiseMul: 0.7,
    trail: { width: 0.6, color: null, life: 0.11, noise: 0.75, edge: 1.2 }, smear: 'twin', tips: ['tipL', 'tipR'], twoHanded: false },
};
/** The profile for a player style (unknown styles → longsword, so a caster class never crashes the engine). */
export function weaponFor(style) { return WEAPONS[style] || WEAPONS.longsword; }

// ---------------------------------------------------------------- palette
// a: saturated slash colour, b: hot core / highlight, noise: slash-shader noise amount.
// The classic five keep their v2 values (legacy look). Everything else comes from ELEMENT_DEFS; unknown → physical.
const EXTRA = {
  fire: { a: 0xff4a10, b: 0xffe08a, noise: 0.7 },
  ice: { a: 0x3fb8ff, b: 0xeaffff, noise: 0.35 },
  lightning: { a: 0x9a6bff, b: 0xf6eeff, noise: 0.8 },
  wind: { a: 0x2fe39a, b: 0xeafff4, noise: 0.6 },
  earth: { a: 0xd0802a, b: 0xfff0c0, noise: 0.55 },
  water: { noise: 0.45 }, nature: { noise: 0.6 }, light: { noise: 0.3 }, shadow: { a: 0x8a3cff, b: 0xe2c8ff, noise: 0.85 },
};
function build() {
  const out = {};
  for (const id of ALL_ELEMENTS) {
    const c = ELEMENT_DEFS[id].colors || {};
    const x = EXTRA[id] || {};
    out[id] = { a: x.a ?? c.mid ?? c.hex ?? 0xffffff, b: x.b ?? c.core ?? 0xffffff, edge: c.edge ?? c.hex ?? 0xffffff, noise: x.noise ?? 0.5 };
  }
  out.physical = { a: 0xd8dde6, b: 0xffffff, edge: 0x9aa4b4, noise: 0.4 };
  out.void = { a: PSEUDO_ELEMENTS.void?.hex ?? 0x7a3cff, b: 0xe8d8ff, edge: 0x3a1a6a, noise: 0.8 };
  return out;
}
export const PAL = build();
/** Palette entry for any element id (never undefined). */
export const palOf = (el) => PAL[el] || PAL.physical;

/** The element's aura status (ELEMENT_DEFS[el].status) or null. */
export const statusOf = (el) => ELEMENT_DEFS[el]?.status || null;

// blade ambience particles per element (melee-only extra; unknown → a soft mote)
export const AMB = {
  fire: { shape: 'ember', speed: 0.8, size: 0.07, life: 0.5, gravity: -3 },
  ice: { shape: 'snow', speed: 0.3, size: 0.06, life: 0.7, gravity: 1 },
  lightning: { shape: 'spark', speed: 2.5, size: 0.05, life: 0.14, gravity: 0 },
  wind: { shape: 'soft', speed: 0.9, size: 0.12, life: 0.4, gravity: -0.5 },
  earth: { shape: 'shard', speed: 0.5, size: 0.05, life: 0.5, gravity: 4, additive: false },
  water: { shape: 'droplet', speed: 0.6, size: 0.07, life: 0.55, gravity: 3 },
  nature: { shape: 'leaf', speed: 0.5, size: 0.08, life: 0.8, gravity: 0.6, additive: false },
  light: { shape: 'mote', speed: 0.7, size: 0.06, life: 0.6, gravity: -1.2 },
  shadow: { shape: 'wisp', speed: 0.5, size: 0.12, life: 0.5, gravity: -0.8 },
};
const AMB_DEF = { shape: 'soft', speed: 0.6, size: 0.08, life: 0.4, gravity: -0.5 };
export const ambOf = (el) => AMB[el] || AMB_DEF;

/** spellCast kind for a legacy sword kind (CONTRACT §7.2 step 4: basic/heavy/ultimate, everything else 'skill'). */
export const CAST_KIND = { combo: 'basic', heavy: 'heavy', ultimate: 'ultimate', ultimateAwakened: 'ultimate', support: 'skill', finisher: 'skill' };
