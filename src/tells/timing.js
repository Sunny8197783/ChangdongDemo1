// tells timing (PLAN v4 §5.7): floors per class, aim lock, duration rule, sound names.
//   dur = max(windup, MIN[cls]) × assist.tellMul × (e.timeMul ?? 1)   (core/tellgeom.tellDuration: tellMul never below 0.9)
// No first-encounter bonus. Timing runs on game.enemyTime (enemySpeed assist scales it).
import { TELL_MIN, TELL_LOCK, DEFAULT_LOCK_AT, tellDuration } from '../core/tellgeom.js';

export const MIN = TELL_MIN;
export const LOCK = TELL_LOCK;
export { DEFAULT_LOCK_AT, tellDuration };

/** Classes whose attacks count as melee for the off-screen rule unless spec.melee says otherwise. */
const MELEE_CLS = { mobLight: true, mobHeavy: true, combo: true, elite: true };
export function isMelee(spec) {
  if (spec.melee != null) return !!spec.melee;
  if (spec.tell === 'projectile') return false;
  return !!MELEE_CLS[spec.cls || 'mobLight'];
}
/** Seconds before the hit at which the aim locks (≥ the class minimum). */
export function lockFor(spec, cls) {
  return Math.max(spec.lockAt ?? DEFAULT_LOCK_AT, TELL_LOCK[cls] ?? 0);
}
const HEAVY = { mobHeavy: true, elite: true, boss: true, bossAoE: true, unblockable: true };
/** Windup-start sound (§5.5): tell_light / tell_heavy / tell_unblockable / tell_jump. */
export function startSound(tell, cls) {
  if (tell === 'unblockable') return 'tell_unblockable';
  if (tell === 'jump') return 'tell_jump';
  return HEAVY[cls] ? 'tell_heavy' : 'tell_light';
}
/** Perfect window (seconds before impact) in which the time front turns near-white: 0.20 s × assist.perfectMul. */
export const PERFECT_WIN = 0.20;
/** Teaching slow motion on the first tell of each kind (§5.7, §6.2): 0.4 × for 0.6 real s, started this long before the hit. */
export const TEACH = { scale: 0.4, durReal: 0.6, priority: 2, before: 0.30 };
/** End animation (§5.2.6): snap to 0.5 fill for 2 frames, then fade over 0.12 s. */
export const END = { snap: 2 / 60, fade: 0.12 };
/** Handles never consumed are cancelled this long after their hit time. */
export const STALE_AFTER = 2.0;
