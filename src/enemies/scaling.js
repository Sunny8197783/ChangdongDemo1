// Enemy zone scaling + XP values (CONTRACT §14, DESIGN §5.1 / §5.3 / §16).
// Pure data + small helpers. The ONLY place enemy HP / damage multipliers and kill XP are decided.
// - zone rows: Act 1 (village/plains/ruins) · first region (Act 2 row) · second region (Act 3 row, via story.regionOrder)
//   · ascent (Act 4) · plateau (finale).
// - difficulty multiplies HP here (game.difficulty.hpMul). Damage difficulty is applied by combat (never folded into zoneDmgMul).

/** DESIGN §5.3 rows. level = [min, max]; the entity's zoneLevel is the row minimum unless a spawn passes opts.level. */
export const SCALING_ROWS = {
  act1: { hpMul: 1.0, dmgMul: 1.0, level: [1, 8], mobXp: 0 },
  act2: { hpMul: 1.9, dmgMul: 1.5, level: [9, 14], mobXp: 35 },
  act3: { hpMul: 2.8, dmgMul: 1.9, level: [15, 21], mobXp: 45 },
  act4: { hpMul: 3.4, dmgMul: 2.2, level: [21, 25], mobXp: 60 },
  finale: { hpMul: 3.6, dmgMul: 2.4, level: [25, 25], mobXp: 60 },
};
/** Act-1 zones keep their own level band (world.zones[].level) but the act1 multipliers. */
const ACT1_LEVEL = { village: 1, plains: 2, ruins: 6 };
/** The two non-linear regions (DESIGN §8.4). */
export const REGIONS = ['mirwen', 'elderwood'];

/** DESIGN §5.1 kill XP. Act 2–4 mobs take the zone row's mobXp. Props / dummies are 0. */
export const XP_VALUES = {
  chuchu: 6, bokoblin: 15, shaman: 25, dummy: 0,
  golem: 600, hydra: 1500, nox: 1500, treant: 2500, kalis: 3000, nidhoggra: 0,
  elite: 90,
};
/** Mob types whose XP follows the zone row (Act 2–4 mobs). */
const ZONE_XP_MOBS = { lizard: 1, shroom: 1, wolf: 1, wraith: 1 };

/** DESIGN §16 fallback when core has no game.difficulty. */
// v4 (§5.7, §6.8): 'story' row; telegraphMul is a legacy alias fixed at 1 (tells applies assist.tellMul to the real windup,
// nothing multiplies telegraphMul any more); the check key is checkAddSec (checkAdd kept as its alias).
export const DIFFICULTY_FALLBACK = {
  story: { hpMul: 0.6, dmgMul: 0.4, telegraphMul: 1, tellMul: 1.5, enemySpeed: 0.85, checkAddSec: 6, checkAdd: 6 },
  easy: { hpMul: 0.7, dmgMul: 0.6, telegraphMul: 1, tellMul: 1.3, enemySpeed: 1, checkAddSec: 4, checkAdd: 4 },
  normal: { hpMul: 1, dmgMul: 1, telegraphMul: 1, tellMul: 1, enemySpeed: 1, checkAddSec: 0, checkAdd: 0 },
  hard: { hpMul: 1.3, dmgMul: 1.25, telegraphMul: 1, tellMul: 0.9, enemySpeed: 1, checkAddSec: 0, checkAdd: 0 },
};

export function difficultyOf(game) {
  const d = game.difficulty;
  if (d && typeof d.hpMul === 'number') return d;
  const k = game.settings?.values?.difficulty;
  return DIFFICULTY_FALLBACK[k] || DIFFICULTY_FALLBACK.normal;
}

/** Which row a zone uses. The second region visited uses the Act 3 row (story.regionOrder). */
export function rowIdOf(game, zoneId) {
  if (zoneId === 'plateau') return 'finale';
  if (zoneId === 'ascent') return 'act4';
  if (REGIONS.includes(zoneId)) {
    let order = null;
    try { order = game.story?.regionOrder; } catch (_) { order = null; }
    if (Array.isArray(order) && order.length) {
      const i = order.indexOf(zoneId);
      if (i === 0) return 'act2';
      if (i >= 1) return 'act3';
      // not visited yet: if the other region is already in the order, this one is the second
      return order.some((z) => REGIONS.includes(z) && z !== zoneId) ? 'act3' : 'act2';
    }
    return 'act2';
  }
  return 'act1';
}

const _out = { hpMul: 1, dmgMul: 1, level: 1, zoneMin: 1, row: 'act1', mobXp: 0, difficulty: 'normal' };
/**
 * enemies.scaling(zoneId) → {hpMul, dmgMul, level, zoneMin, row, mobXp}. hpMul includes difficulty; dmgMul is the zone row
 * only (combat applies difficulty.dmgMul to enemy → player hits). Returns a fresh object unless `reuse` is true.
 */
export function scaling(game, zoneId, reuse = false) {
  const rowId = rowIdOf(game, zoneId);
  const R = SCALING_ROWS[rowId];
  const D = difficultyOf(game);
  const o = reuse ? _out : {};
  o.row = rowId;
  o.hpMul = R.hpMul * (D.hpMul ?? 1);
  o.dmgMul = R.dmgMul;
  o.zoneMin = rowId === 'act1' ? (ACT1_LEVEL[zoneId] ?? 1) : R.level[0];
  o.level = o.zoneMin;
  o.mobXp = R.mobXp;
  return o;
}

/** Zone id at a position (world.getZoneAt), or a sensible default. */
export function zoneIdAt(game, pos) {
  try { const z = game.world?.getZoneAt?.(pos.x, pos.z); if (z?.id) return z.id; } catch (_) { /* */ }
  return 'plains';
}

/**
 * Apply zone scaling + XP to a freshly built entity. opts: {zoneId, level, elite, xpValue}.
 * Sets e.zoneId, e.zoneLevel, e.zoneMin, e.zoneDmgMul, e.xpValue; multiplies hp/maxHp once (idempotent via e._scaled).
 */
export function applyScaling(game, e, type, opts = {}) {
  if (!e || e._scaled) return e;
  e._scaled = true;
  if (e.isDummy || e.isProp || type === 'dummy') { e.xpValue = 0; e.zoneLevel = 1; e.zoneDmgMul = 1; return e; }
  const zoneId = opts.zoneId || zoneIdAt(game, e.object.position);
  const s = scaling(game, zoneId);
  e.zoneId = zoneId;
  e.zoneLevel = opts.level || s.level;
  e.zoneMin = s.zoneMin;
  e.zoneDmgMul = s.dmgMul;
  if (!e.isBoss && s.hpMul !== 1) { e.maxHp = Math.round(e.maxHp * s.hpMul); e.hp = e.maxHp; }
  if (opts.xpValue != null) e.xpValue = opts.xpValue;
  else if (e.isElite || opts.elite) e.xpValue = XP_VALUES.elite;
  else if (ZONE_XP_MOBS[type]) e.xpValue = s.mobXp || 35;
  else e.xpValue = XP_VALUES[type] ?? 0;
  return e;
}

/** Boss scaling: arena zone row × difficulty for HP (the DESIGN totals are base values × the row). */
export function bossScaling(game, zoneId) {
  return scaling(game, zoneId);
}
