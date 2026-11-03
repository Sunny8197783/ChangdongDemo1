// 직업 특성 (DESIGN §2.2) as game.stats sources `talent:<id>`, refreshed on classChosen / levelUp / talentChosen,
// plus the 방랑자 breadth source `breadth` (DESIGN §5.7), refreshed on skillLearned / skillUnlearned / respec.
// Texts live in core/classes.js TALENTS; the numbers live here (data). Consumers read the keys through game.stats
// (feature keys: modules that do not know a key simply ignore it).
import { talentsFor } from '../core/classes.js';

/** talent id → Mods. Signature talents (t1) are implemented by classkits.js; their entry is {} (a marker source). */
export const TALENT_MODS = {
  'mage.t1': {}, 'mage.t10': { chainRefundMp: 5 }, 'mage.t20': { blinkDecoyRune: 30 },
  'mage.t25a': { chargeSpeedMul: 1.3 }, 'mage.t25b': { reactionCdResetChance: 0.15 },
  'sword.t1': {}, 'sword.t10': { parryWindowAdd: 0.05 }, 'sword.t20': { comboStatusTwice: true },
  'sword.t25a': { comboDmgMul: 1.15 }, 'sword.t25b': { counterExtraHits: 2, counterHealPct: 0.03 },
  'ranger.t1': {}, 'ranger.t10': { headshotMul: 1.5 }, 'ranger.t20': { focusFreeCast: true },
  'ranger.t25a': { fullDrawExtraArrows: 2 }, 'ranger.t25b': { backflipStamRefund: 15, backflipReload: true },
  'paladin.t1': {}, 'paladin.t10': { perfectBlockReflect: true }, 'paladin.t20': { sealRadiusAdd: 1.5, sealRadiant: true },
  'paladin.t25a': { blockStamMul: 0.6 }, 'paladin.t25b': { slamJudgment: true },
  'spiritcaller.t1': {}, 'spiritcaller.t10': { familiarStatus: true }, 'spiritcaller.t20': { familiarSlotsAdd: 1 },
  'spiritcaller.t25a': { familiarFullReactions: true }, 'spiritcaller.t25b': { familiarAbsorb: true },
  'shadowblade.t1': {}, 'shadowblade.t10': { backstabMul: 1.3 }, 'shadowblade.t20': { detonateRefund: true },
  'shadowblade.t25a': { markExecute: 0.12 }, 'shadowblade.t25b': { perfectDodgeStealth: 2 },
};

export function createTalents(game) {
  const active = new Set();
  const breadthMods = { rxAll: 1, breadthAwakened: false };
  const T = {
    active,
    refresh() {
      const S = game.stats, P = game.progression; if (!S || !P) return;
      const want = P.cls ? talentsFor(P.cls, P.level || 1, P.talentChoice) : [];
      for (const id of [...active]) if (!want.includes(id)) { S.clear('talent:' + id); active.delete(id); }
      for (const id of want) { if (!active.has(id)) { S.set('talent:' + id, TALENT_MODS[id] || {}); active.add(id); } }
    },
    has(id) { return active.has(id); },
    refreshBreadth() {
      const S = game.stats, P = game.progression; if (!S || !P?.breadth) return;
      const b = P.breadth();
      breadthMods.rxAll = 1 + (b.bonus || 0); breadthMods.breadthAwakened = !!b.awakened;
      if (b.trees5 > 0) S.set('breadth', breadthMods); else S.clear('breadth');
    },
  };
  const E = game.events;
  const all = () => { T.refresh(); T.refreshBreadth(); };
  for (const ev of ['classChosen', 'levelUp', 'talentChosen', 'treesRegistered']) E.on(ev, () => T.refresh());
  for (const ev of ['skillLearned', 'skillUnlearned', 'respec', 'classChosen', 'treesRegistered']) E.on(ev, () => T.refreshBreadth());
  T.all = all;
  return T;
}
