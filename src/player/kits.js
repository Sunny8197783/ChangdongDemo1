// Movement-level class kits (CONTRACT §10.2, DESIGN §2.2, PLAN v4 §5.8): dodge and defend per class (keymap actions), aiming and stance.
// This is the ONLY player file allowed to name classes (rule 8): everything else asks kitOf(cls) / familyOf(cls).
// Numbers are data; behaviours live in player.js keyed by `type`.
//
// dodge  { type, dist, iframes, cost (stamina), cd, time, charges?, recharge?, superArmor?, perfectWin, grace, brace?, decoyLife? }
// defend { type, canParry, … }  barrier: reduce/drain(MP/s)/perfect · guard/shield: mul/perfect/stamina/arc · ward: reduce/capacity/recharge
//                     counter: window/cd/critDur · focus: scale/drain/afterDodge
// v4 (PLAN §5.8): i-frames ≥ 0.30 s (paladin 0.20 + super armour 0.38), perfect windows 0.20 s (shadowblade 0.22, paladin
// "perfect brace" 0.15 with perfect-block effects), +0.05 s after-impact grace for every class, guard/parry perfect 0.22 s.
// Windows scale with game.assist.perfectMul, i-frames with game.assist.iframeMul (player.js reads them lazily).
export const GRACE = 0.05;
export const KITS = {
  mage: {
    stance: 'mage', aim: true,
    dodge: { type: 'blink', dist: 7, iframes: 0.30, cost: 12, cd: 1.2, time: 0.12, perfectWin: 0.20, grace: GRACE, mpRefund: 8 },
    defend: { type: 'barrier', mul: 0.2, drain: 6, perfect: 0.22, mpPerDmg: 0.5, minMp: 3 },
    idleFidget: 'staffTwirl',
  },
  sword: {
    stance: 'sword', aim: false,
    dodge: { type: 'dashstep', dist: 6, iframes: 0.30, cost: 12, charges: 2, recharge: 0.9, time: 0.18, perfectWin: 0.20, grace: GRACE },
    defend: { type: 'guard', mul: 0.3, perfect: 0.22, stamBase: 6, stamPer: 0.6, arc: -0.25, minStam: 5, moveMul: 0.45 },
    idleFidget: 'bladeCheck',
  },
  ranger: {
    stance: 'ranger', aim: true,
    // the whole flip is invulnerable; it flips toward the held movement direction (backward when none)
    dodge: { type: 'backflip', dist: 6, iframes: 0.42, cost: 14, cd: 0.55, time: 0.42, perfectWin: 0.20, grace: GRACE, hop: 5.2 },
    defend: { type: 'focus', scale: 0.35, drain: 25, afterDodge: 0.6, refresh: 0.2, minStam: 4 },
    idleFidget: 'stringCheck',
  },
  paladin: {
    stance: 'paladin', aim: false,
    // perfect brace: a hit inside the window gets the perfect-block effects (no damage, attacker staggered, counter ready)
    dodge: { type: 'shieldstep', dist: 4, iframes: 0.20, superArmor: 0.38, cost: 12, cd: 0.55, time: 0.22, charges: 1, recharge: 0.55, perfectWin: 0.15, grace: GRACE, brace: true },
    defend: { type: 'shield', mul: 0.15, perfect: 0.22, stamBase: 5, stamPer: 0.45, arc: -0.15, minStam: 5, moveMul: 0.5 },
    idleFidget: 'hammerRest',
  },
  spiritcaller: {
    stance: 'spirit', aim: true,
    dodge: { type: 'spiritswap', dist: 5, iframes: 0.30, cost: 12, cd: 1.3, time: 0.14, perfectWin: 0.20, grace: GRACE, decoyLife: 4 },
    defend: { type: 'ward', mul: 0.4, capacity: 0.35, recharge: 8, perfect: 0, minFrac: 0.15, moveMul: 0.6 },
    idleFidget: 'charmSpin',
  },
  shadowblade: {
    stance: 'shadow', aim: false,
    dodge: { type: 'shadowroll', dist: 5.5, iframes: 0.40, cost: 12, charges: 2, recharge: 0.8, time: 0.34, perfectWin: 0.22, grace: GRACE },
    // the whole stance window is a parry; `perfect` is its nominal perfect window (can-parry rule, §6.11)
    defend: { type: 'counter', window: 0.3, perfect: 0.22, cd: 1.0, critDur: 3, minStam: 6, cost: 6 },
    idleFidget: 'daggerSpin',
  },
};

/** §6.11 can-parry rule: barrier / guard / shield / counter with a perfect window > 0 (not focus, not ward). */
const PARRY_TYPES = { barrier: 1, guard: 1, shield: 1, counter: 1 };
for (const k of Object.values(KITS)) k.defend.canParry = !!PARRY_TYPES[k.defend.type] && (k.defend.perfect || 0) > 0;

/** Before the class choice: a neutral kit (no Q/E skills). */
export const NO_KIT = {
  stance: 'mage', aim: false, none: true,
  dodge: { type: 'none', dist: 0, iframes: 0, cost: 0, cd: 0, time: 0, perfectWin: 0, grace: 0 },
  defend: { type: 'none', canParry: false },
  idleFidget: null,
};

/** Kit for a class id; unknown ids fall back to the mage kit (logged once), null → NO_KIT. */
const _warned = new Set();
export function kitOf(cls) {
  if (!cls) return NO_KIT;
  const k = KITS[cls];
  if (k) return k;
  if (!_warned.has(cls)) { _warned.add(cls); console.warn('[player] unknown class for kit:', cls); }
  return KITS.mage;
}

/** Display names of the kit moves (Korean, PLAN §6.10 glossary: the only dodge / defend name per kit). */
export const KIT_NAMES = {
  blink: '점멸', dashstep: '질풍보', backflip: '백덤블링', shieldstep: '방패 돌진', spiritswap: '정령 교대', shadowroll: '그림자 구르기',
  barrier: '마력 방벽', guard: '막기', shield: '방패 막기', ward: '정령 결계', counter: '반격 자세', focus: '집중',
  none: '',
};

/** Perfect callouts (PLAN §5.9, §6.10; shown by ux near the crosshair, carried in perfectDodge.calloutKo). */
export const PERFECT_KO = { dodge: '완벽 회피!', parry: '완벽 패링!', barrier: '완벽 방벽!' };

/** Legacy HUD block type for v2 ui (barrier | guard); v3 ui reads defendType. */
export function legacyBlockType(defType) { return defType === 'barrier' || defType === 'ward' ? 'barrier' : 'guard'; }
