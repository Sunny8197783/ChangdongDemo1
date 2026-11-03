// Archetype & implementation registry (CONTRACT §3.3). game.archetypes.
// magic registers the caster implementations, melee the melee ones; bespoke ultimates/capstones/finishers via registerImpl.
// game.skills.registerImpl / registerArchetype forward here, so registration works even while skills is stubbed.
export const ARCHETYPE_NAMES = ['projectile', 'volley', 'lob', 'crawler', 'beam', 'cone', 'nova', 'zone', 'wall', 'pillar',
  'chain', 'rain', 'summon', 'blink', 'dash', 'leapslam', 'grapple', 'buff', 'mark', 'chainbind', 'tether', 'lane', 'mine', 'bubble'];
const FAMILIES = ['caster', 'melee'];

export function createArchetypes(game) {
  const arch = { caster: new Map(), melee: new Map() };
  const impls = { caster: new Map(), melee: new Map() };
  const warned = new Set();
  const famOk = (f) => {
    if (FAMILIES.includes(f)) return true;
    if (!warned.has('fam:' + f)) { warned.add('fam:' + f); console.warn('[archetypes] unknown family', f); }
    return false;
  };
  return {
    NAMES: ARCHETYPE_NAMES,
    registerArchetype(name, family, impl) {
      if (!name || typeof impl !== 'function' || !famOk(family)) return;
      arch[family].set(name, impl);
    },
    getArchetype(name, family) { return (FAMILIES.includes(family) && arch[family].get(name)) || null; },
    registerImpl(skillId, family, fn) {
      if (!skillId || typeof fn !== 'function' || !famOk(family)) return;
      impls[family].set(skillId, fn);
    },
    getImpl(skillId, family) { return (FAMILIES.includes(family) && impls[family].get(skillId)) || null; },
    /** Coverage listing for playtests. */
    list() {
      const names = new Set([...ARCHETYPE_NAMES, ...arch.caster.keys(), ...arch.melee.keys()]);
      return {
        archetypes: [...names].map((name) => ({ name, caster: arch.caster.has(name), melee: arch.melee.has(name) })),
        impls: [...new Set([...impls.caster.keys(), ...impls.melee.keys()])].map((id) => ({ id, caster: impls.caster.has(id), melee: impls.melee.has(id) })),
      };
    },
  };
}
