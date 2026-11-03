// All 9 element trees + PRESETS (CONTRACT §7.1, §21). Pure data; may be imported by ui as a fallback (rule 7: dynamic import).
// Presets always pick the 'a' modifier of an exclusive pair, ignore the budget and set ungate (applied by skills.applyPreset).
import { ALL_ELEMENTS, CLASSIC_ELEMENTS } from '../../core/elements.js';
import { CLASS_DEFS, CLASS_IDS } from '../../core/classes.js';
import fire from './fire.js';
import ice from './ice.js';
import lightning from './lightning.js';
import wind from './wind.js';
import earth from './earth.js';
import water from './water.js';
import nature from './nature.js';
import light from './light.js';
import shadow from './shadow.js';

const BY_ID = { fire, ice, lightning, wind, earth, water, nature, light, shadow };
/** {el: TreeData} in ALL_ELEMENTS order. */
export const TREES = {};
for (const el of ALL_ELEMENTS) if (BY_ID[el]) TREES[el] = BY_ID[el];

/**
 * Castable skills that no tree node grants. 원소 교향곡 is the element-generic finisher unlocked by 방랑자의 각성
 * (DESIGN §5.7): it uses the attuned element's colours; element is resolved at cast time.
 */
export const EXTRA_SKILLS = {
  'breadth.finisher': { id: 'breadth.finisher', element: null, slot: 'finisher', nameKo: '원소 교향곡', iconGlyph: '❂', tags: ['finisher', 'breadth'],
    desc: '방랑자의 각성: 조율한 원소의 색으로 아홉 빛깔의 교향곡을 울립니다 (각성 게이지 필요).', params: { dmg: 360, r: 12 }, modifiers: [] },
};

const roleOf = (tree, role) => tree.nodes.find((n) => n.slotRole === role);
const idOf = (el, role) => roleOf(TREES[el], role)?.id;
/** Every node of a tree up to maxTier (inclusive), skipping 'b' modifiers; ranks = maxRank. */
function fullTree(el, maxTier = 5, into = {}) {
  for (const n of TREES[el].nodes) {
    if ((n.tier || 1) > maxTier) continue;
    if (n.type === 'modifier' && n.exclusive && /b$/.test(n.slotRole)) continue;
    into[n.id] = n.maxRank || 1;
  }
  return into;
}
function pick(el, roles, into, p1Rank = 1) {
  for (const r of roles) { const id = idOf(el, r); if (id) into[id] = r === 'p1' ? p1Rank : (roleOf(TREES[el], r).maxRank || 1); }
  return into;
}
const skillOf = (el, role) => {
  const n = roleOf(TREES[el], role); return n?.grants?.[0] || null;
};

export const PRESETS = {};
// legacy configs (tools/playtest.js / playtest2.js): all 5 classic trees to T3, or one classic tree to its capstone
{
  const all = {}; for (const el of CLASSIC_ELEMENTS) fullTree(el, 3, all);
  PRESETS.legacy_all = { ranks: all };
  for (const el of CLASSIC_ELEMENTS) PRESETS['legacy_master_' + el] = { ranks: fullTree(el, 5, {}), attune: el };
}
// showcase_<el>: every node (so every active, the ultimate, support, awakened and finisher) of that tree
for (const el of ALL_ELEMENTS) PRESETS['showcase_' + el] = { ranks: fullTree(el, 5, {}), attune: el };
// per-class builds
for (const cls of CLASS_IDS) {
  const c = CLASS_DEFS[cls];
  const [p1, p2] = c.primary; const s1 = c.secondary[0];
  // starter (≈ L3, 3 points): a2 + p1 + a3 in the first primary
  PRESETS['starter_' + cls] = { cls, ranks: pick(p1, ['a2', 'p1', 'a3'], {}), attune: p1 };
  // act 2 end (≈ 20 points)
  {
    const r = {};
    pick(p1, ['a2', 'a3', 'a4', 'u', 'm1a', 'ult', 'rx', 'm2a'], r); r[idOf(p1, 'p1')] = 3;
    pick(p2, ['a2', 'p1', 'a3', 'a4', 'u'], r);
    pick(s1, ['attune', 'a2', 'a3'], r);
    PRESETS['act2_' + cls] = { cls, ranks: r, attune: p1,
      loadout: { q1: skillOf(p1, 'a3'), q2: skillOf(p2, 'a3'), q3: skillOf(p1, 'a2'), q4: skillOf(s1, 'a2'), ult: skillOf(p1, 'ult'), sup: null } };
  }
  // endgame (38 points, a realistic 대가형 + 2nd primary to T4 + one secondary to its ultimate)
  {
    const r = {};
    pick(p1, ['a2', 'a3', 'a4', 'u', 'm1a', 'ult', 'rx', 'm2a', 't4', 'cap', 'sup'], r); r[idOf(p1, 'p1')] = 3;
    pick(p2, ['a2', 'p1', 'a3', 'a4', 'u', 'ult', 'm1a', 'rx', 'm2a', 't4'], r);
    pick(s1, ['attune', 'a2', 'a3', 'a4', 'u', 'ult', 'p1'], r);
    PRESETS['endgame_' + cls] = { cls, ranks: r, attune: p1,
      loadout: { q1: skillOf(p1, 'a3'), q2: skillOf(p2, 'a3'), q3: skillOf(p1, 't4'), q4: skillOf(s1, 'a2'), ult: skillOf(p1, 'ult'), sup: skillOf(p1, 'sup') } };
  }
}

/** Paid cost of a rank map (granted 각인 nodes of the class excluded). Used by tests and the tree UI. */
export function presetCost(name, cls = null) {
  const p = PRESETS[name]; if (!p) return 0;
  const granted = new Set((CLASS_DEFS[cls || p.cls]?.primary || []).map((el) => el + '.attune'));
  let n = 0;
  for (const el of ALL_ELEMENTS) for (const nd of TREES[el].nodes) if (p.ranks[nd.id] && !granted.has(nd.id)) n += (nd.cost ?? 1) * p.ranks[nd.id];
  return n;
}
export default TREES;
