// Shared tree shape (DESIGN §6.1 v3.1, CONTRACT §7.1). Pure data helpers used by the 9 tree files.
// buildTree(element, spec) materialises the full node list (ids, tiers, costs, prerequisites, slotRole, layout) from the
// per-element spec so every tree follows the single prerequisite rule of DESIGN §6.1 exactly.
//
// shape slots → tier: attune/a2/p1 = 1; a3/a4/u/m1 = 2; ult/rx/m2/sig = 3; sup/t4/m3/key/p2 = 4; cap = 5

/** slotRole → {tier, cost, type, maxRank, row, col}. Order = node order in the tree. */
export const ROLES = {
  attune: { tier: 1, cost: 1, type: 'active', row: 0, col: 0 },
  a2:     { tier: 1, cost: 1, type: 'active', row: 0, col: 1 },
  p1:     { tier: 1, cost: 1, type: 'passive', maxRank: 3, row: 0, col: 2 },
  a3:     { tier: 2, cost: 1, type: 'active', row: 1, col: 0 },
  a4:     { tier: 2, cost: 1, type: 'active', row: 1, col: 1 },
  u:      { tier: 2, cost: 1, type: 'active', row: 1, col: 2 },
  m1a:    { tier: 2, cost: 1, type: 'modifier', row: 1, col: 3 },
  m1b:    { tier: 2, cost: 1, type: 'modifier', row: 1, col: 4 },
  ult:    { tier: 3, cost: 2, type: 'ultimate', row: 2, col: 0 },
  rx:     { tier: 3, cost: 1, type: 'passive', row: 2, col: 1 },
  m2a:    { tier: 3, cost: 1, type: 'modifier', row: 2, col: 2 },
  m2b:    { tier: 3, cost: 1, type: 'modifier', row: 2, col: 3 },
  sig:    { tier: 3, cost: 1, type: 'active', row: 2, col: 4 },
  sup:    { tier: 4, cost: 2, type: 'support', row: 3, col: 0 },
  t4:     { tier: 4, cost: 2, type: 'active', row: 3, col: 1 },
  m3a:    { tier: 4, cost: 1, type: 'modifier', row: 3, col: 2 },
  m3b:    { tier: 4, cost: 1, type: 'modifier', row: 3, col: 3 },
  key:    { tier: 4, cost: 1, type: 'keystone', row: 3, col: 4 },
  p2:     { tier: 4, cost: 1, type: 'passive', maxRank: 2, row: 3, col: 5 },
  cap:    { tier: 5, cost: 2, type: 'capstone', row: 4, col: 0 },
};
export const ROLE_ORDER = Object.keys(ROLES);
/** Fixed-id roles (the others take the active's own id from the spec). */
const FIXED_ID = { attune: 'attune', p1: 'p1', m1a: 'm1a', m1b: 'm1b', ult: 'ult', rx: 'rx', m2a: 'm2a', m2b: 'm2b',
  sup: 'sup', m3a: 'm3a', m3b: 'm3b', key: 'key', p2: 'p2', cap: 'cap' };
/** Modifier pairs: role → [modified role, exclusive partner]. */
const MOD_OF = { m1a: ['a2', 'm1b'], m1b: ['a2', 'm1a'], m2a: ['a3', 'm2b'], m2b: ['a3', 'm2a'], m3a: ['t4', 'm3b'], m3b: ['t4', 'm3a'] };

/** Korean labels for node types (tooltips / tree UI). */
export const TYPE_KO = { active: '액티브', ultimate: '궁극기', support: '보조', modifier: '수정자', passive: '패시브', keystone: '핵심', capstone: '각성' };
export const SLOT_KO = { basic: '기본 공격', charged: '충전 공격', quick: '빠른 슬롯', ultimate: '궁극기', support: '보조', finisher: '필살기' };

/**
 * spec = { nodes: { <role>: { id? (actives), nameKo, desc, mods?, procs?, params?, descRank?, tags? } }, skills: { <skillId>: def } }
 * Returns { element, nodes: NodeDef[], skills } following CONTRACT §7.1.
 */
export function buildTree(element, spec) {
  const ids = {};
  for (const role of ROLE_ORDER) {
    const n = spec.nodes[role]; if (!n) continue;
    ids[role] = FIXED_ID[role] ? `${element}.${FIXED_ID[role]}` : n.id;
  }
  const nodes = [];
  for (const role of ROLE_ORDER) {
    const n = spec.nodes[role]; if (!n) continue;
    const R = ROLES[role];
    const node = {
      id: ids[role], element, nameKo: n.nameKo, type: R.type, slotRole: role, tier: R.tier, cost: R.cost, maxRank: R.maxRank || 1,
      requires: null, pos: { col: R.col, row: R.row }, desc: n.desc || '', tags: n.tags || [],
    };
    if (R.tier >= 4) node.primaryOnly = true;
    switch (role) {
      case 'a3': case 'a4': case 'u': node.requires = ids.attune; break;
      case 'sig': case 'ult': node.requiresAny = [ids.a3, ids.a4]; break;
      case 'rx': node.requires = ids.p1; break;
      case 'sup': case 't4': case 'cap': node.requires = ids.ult; break;
      case 'key': case 'p2': node.requires = ids.rx; break;
      default: break;
    }
    if (MOD_OF[role]) {
      const [target, partner] = MOD_OF[role];
      node.requires = ids[target]; node.modifies = ids[target]; node.exclusive = ids[partner];
      node.params = n.params || {};
    }
    if (role === 'attune') node.grants = [`${element}.basic`, `${element}.charged`];
    else if (role === 'ult') node.grants = [`${element}.ult`];
    else if (role === 'sup') node.grants = [`${element}.sup`];
    else if (role === 'cap') node.grants = [`${element}.awakened`, `${element}.finisher`];
    else if (R.type === 'active') node.grants = [ids[role]];
    if (n.mods) node.mods = n.mods;
    if (n.procs) node.procs = n.procs;
    if (n.descRank) node.descRank = n.descRank;
    if (n.twist) node.twist = n.twist;
    nodes.push(node);
  }
  // skills: stamp element + the granting node; quick actives default to slot 'quick'
  const skills = spec.skills || {};
  for (const id of Object.keys(skills)) {
    const d = skills[id];
    d.id = id; d.element = element;
    if (!d.slot) d.slot = 'quick';
    if (!d.params) d.params = {};
    if (!d.tags) d.tags = [];
    const g = nodes.find((x) => x.grants && x.grants.includes(id));
    d.node = g ? g.id : null;
    if (g && g.slotRole) d.slotRole = g.slotRole;
    d.modifiers = nodes.filter((x) => x.modifies === id).map((x) => x.id);
  }
  return { element, nodes, skills };
}

/**
 * Reactions that involve an element (DESIGN §4.3), for the "<element> reactions +15%" rx passives.
 * Data only: the rx nodes turn this into rx_<id> multipliers.
 */
export const RX_BY_ELEMENT = {
  fire: ['melt', 'overload', 'magma', 'evaporate', 'fire_tornado', 'steam_burst', 'fire_wave', 'wildfire', 'burgeon', 'sanctify', 'necroflame'],
  ice: ['melt', 'shatter', 'superconduct', 'flashfreeze', 'blizzard', 'freeze_water', 'steam_burst', 'frostbloom', 'prism', 'voidfrost'],
  lightning: ['electrocute', 'superconduct', 'overload', 'storm_tornado', 'electro_water', 'hyperbloom', 'quicken', 'radiant_burst', 'blackbolt', 'grounded'],
  earth: ['shatter', 'magma', 'skyslam', 'mudslide', 'crystallize', 'grounded', 'sandstorm', 'entangle'],
  water: ['electrocute', 'flashfreeze', 'evaporate', 'electro_water', 'freeze_water', 'mudslide', 'bloom', 'holywater', 'miasma', 'obsidian'],
  nature: ['bloom', 'wildfire', 'burgeon', 'hyperbloom', 'quicken', 'frostbloom', 'entangle', 'pollen', 'photosynthesis', 'rot'],
  light: ['sanctify', 'holywater', 'prism', 'radiant_burst', 'judgment', 'aurora', 'purify', 'eclipse', 'photosynthesis'],
};
/** {rx_<id>: mul} for every reaction of an element (allocated once per call; mods() is called only on learn/respec). */
export function rxBonus(el, mul = 1.15, extra = null) {
  const o = {};
  for (const id of RX_BY_ELEMENT[el] || []) o['rx_' + id] = mul;
  if (extra) Object.assign(o, extra);
  return o;
}
