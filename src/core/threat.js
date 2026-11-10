// Threat palette and reserved cues (PLAN v4 §5.1). Owned by core; consumed by tells (decals, rims, icons), ux (legend,
// off-screen arrows, codex) and the T4/V4 greps. Reserved = no player effect may use these hues at saturation > 0.6
// within 15 m of an enemy, nor the reserved shapes anywhere (rising chevrons, diamond sparkles, diagonal hatch,
// dashed rims, double rims). Danger hue never depends on the enemy's element.
//
//   import { THREAT, threatColor, THREAT_KINDS, RESERVED_SHAPES } from '../core/threat.js'
//   threatColor(kind, colorblind) → {rim, edge, fill, fillAlpha, rimAlpha, outline?} (numbers; reused frozen objects)

/** One row per tell kind. Colours are 0xRRGGBB numbers; `legendKo` is the exact legend text (codex, hints, 가이드). */
export const THREAT = {
  danger: {
    kind: 'danger', legendKo: '빨강 = 피하거나 막기', rim: 0xFF2A3D, edge: 0x1A0006, fill: 0xFF2A3D,
    shape: 'solid rim + flat ground chevrons toward the hit direction', body: 'red rim', sounds: ['tell_light', 'tell_heavy', 'tell_commit'],
  },
  parry: {
    kind: 'parry', legendKo: '금빛 = 패링할 수 있는 공격', rim: 0xFFD23A, edge: 0x2A1A00, fill: 0xFF2A3D,
    shape: 'dashed rim (12 dashes per circle, 1 m dashes on lines)', body: 'gold glint star on the weapon at lock', sounds: ['tell_parry'],
    dashes: 12, dashLen: 1.0,
  },
  unblockable: {
    kind: 'unblockable', legendKo: '분홍색 ⚠ = 막을 수 없음, 반드시 회피', rim: 0xFF2BD6, edge: 0x22001C, fill: 0xFF2BD6,
    shape: 'double rim + ⚠ icon above the head from windup start', body: 'pink rim', sounds: ['tell_unblockable'], icon: '⚠',
  },
  jump: {
    kind: 'jump', legendKo: '흰색 ⤒ = 퍼지는 충격파를 점프로 넘기', rim: 0xF4F4F4, edge: 0x202020, fill: 0xFF2A3D,
    shape: '⤒ icon + a travelling shockwave ring (12 m/s, 0.25 m band) at the hit', body: 'white rim', sounds: ['tell_jump'], icon: '⤒',
    shockwave: { speed: 12, band: 0.25 },
  },
  projectile: {
    kind: 'projectile', legendKo: '붉은 선 = 조준', rim: 0xFF2A3D, edge: 0x1A0006, fill: null,
    shape: 'solid aim line (6 m) + orb ground ring', body: 'gem/mouth glow', sounds: ['tell_light'], aimLen: 6,
  },
  hazard: {
    kind: 'hazard', legendKo: '붉은 빗금 = 머물면 피해', rim: 0xFF2A3D, rimAlpha: 0.5, edge: 0x1A0006, fill: 0xFF2A3D, fillAlpha: 0.18,
    shape: 'slow diagonal hatch, no fill front', body: null, sounds: [],
  },
  safe: {
    kind: 'safe', legendKo: '초록 화살표 = 안전 지대', rim: 0xC8FFE0, edge: 0x0A3020, fill: 0xC8FFE0, fillAlpha: 0.12,
    shape: 'rising vertical chevrons (billboards drifting up) over a thin ring', body: null, sounds: [],
  },
  punish: {
    kind: 'punish', legendKo: '◆ 반짝임 = 공격 기회', rim: 0xF2FFFF, edge: 0x0A2A30, outline: 0x0A2A30, fill: null,
    shape: 'rotating diamond sparkles around the enemy + 공격 기회! world text', body: 'recovery pose', sounds: ['punish'],
  },
};
/** Tell kinds in legend order. */
export const THREAT_KINDS = ['danger', 'parry', 'unblockable', 'jump', 'projectile', 'hazard', 'safe', 'punish'];
/** Shapes reserved for threats (player effects may not use them anywhere). */
export const RESERVED_SHAPES = ['chevronRising', 'diamondSparkle', 'hatch', 'dashedRim', 'doubleRim'];
/** Reserved hues (rim colours of danger/parry/unblockable) used by the runtime "no reserved hue near an enemy" check. */
export const RESERVED_HUES = [0xFF2A3D, 0xFFD23A, 0xFF2BD6];

/** Time-front colours (§5.1/§5.2): near-white in the last perfect window; lock flash = own hue +35 % value, 0.1 s. */
export const THREAT_FRONT = { perfect: 0xFFF4F0, lockValueGain: 0.35, lockFlashSec: 0.1 };
/** Base alpha / width rules of the decal layers (§5.2); tells reads these instead of re-typing numbers. */
export const THREAT_LAYERS = {
  edge: { widthM: 0.12, minPx: 3, alpha: 0.75 },
  rim: { widthM: 0.18, minPx: 3, strongPx: 5, alpha: 0.95 },
  fill: { alpha: 0.16, strongAlpha: 0.28 },
  front: { behindAlpha: 0.32, widthM: 0.12 },
  lock: { thickMul: 1.5 },
  end: { snapFill: 0.5, snapFrames: 2, fadeSec: 0.12 },
  occludedAlpha: 0.40, occluderMinHeight: 1.0, lift: 0.06, maxBlinkHz: 3,
};

/** Colour-blind overrides (§5.1). Shape signatures never change with the preset. */
export const COLORBLIND = {
  protan: { danger: 0xFF8C00, parry: 0x3A8DFF, unblockable: 0xFFFFFF, unblockableStripes: 0x000000 },
  deutan: { danger: 0xFF8C00, parry: 0x3A8DFF, unblockable: 0xFFFFFF, unblockableStripes: 0x000000 },
  tritan: { danger: 0xFF3060, parry: 0x00E0C0 },
};

const cache = new Map();
/**
 * Colours of one tell kind under a colour-blind preset ('protan' | 'deutan' | 'tritan' | null/'off').
 * Returns a frozen, cached object {kind, rim, edge, fill, fillAlpha, rimAlpha, outline, stripes}; fill may be null.
 * Kinds whose fill is the danger red (parry, jump) follow the danger override.
 */
export function threatColor(kind, colorblind = null) {
  const cb = colorblind && colorblind !== 'off' && COLORBLIND[colorblind] ? colorblind : '';
  const key = kind + '|' + cb;
  let out = cache.get(key);
  if (out) return out;
  const row = THREAT[kind] || THREAT.danger;
  const o = COLORBLIND[cb] || {};
  const danger = o.danger ?? THREAT.danger.rim;
  let rim = row.rim, fill = row.fill;
  if (row.rim === THREAT.danger.rim) rim = danger;                 // danger, projectile, hazard
  if (row.fill === THREAT.danger.fill) fill = danger;              // danger, parry, jump, hazard
  if (kind === 'parry' && o.parry != null) rim = o.parry;
  if (kind === 'unblockable' && o.unblockable != null) { rim = o.unblockable; fill = o.unblockable; }
  out = Object.freeze({
    kind: row.kind, rim, edge: row.edge, fill, fillAlpha: row.fillAlpha ?? THREAT_LAYERS.fill.alpha, rimAlpha: row.rimAlpha ?? THREAT_LAYERS.rim.alpha,
    outline: row.outline ?? null, stripes: kind === 'unblockable' ? (o.unblockableStripes ?? null) : null,
  });
  cache.set(key, out);
  return out;
}
/** CSS string of a colour number (legend / DOM use). */
export function threatCss(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0'); }
