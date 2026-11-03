// game.skills (CONTRACT §7, DESIGN §5.5–5.7, §6). Owned by skills.
// The FACTORY builds defs / nodes / trees, registers the trees with progression and forwards the archetype registries,
// so they exist before spells.init / sword.init run (CONTRACT §2). Everything else (runtime, adapters, class kits,
// talents, procs, familiars) lives in src/skills/*. Statically imports only its own files, src/core/* and three (rule 7).
import { TREES, PRESETS, EXTRA_SKILLS } from './skills/trees/index.js';
import { installRuntime } from './skills/runtime.js';
import { createAdapters } from './skills/adapters.js';
import { createClassKits } from './skills/classkits.js';
import { createTalents } from './skills/talents.js';
import { createProcs } from './skills/procs.js';
import { createFamiliars } from './skills/familiars.js';
import { ROLES, TYPE_KO, SLOT_KO } from './skills/trees/_shape.js';
import { formatNodeTooltip, formatSkillTooltip } from './skills/tooltip.js';

export function createSkills(game) {
  const warned = new Set();
  const log = (k, ...a) => { if (!warned.has(k)) { warned.add(k); console.warn(...a); } };

  // ---- data: defs (skillId → SkillDef), nodes (nodeId → NodeDef), trees ({el: TreeData})
  const defs = new Map();
  const nodes = new Map();
  for (const el of Object.keys(TREES)) {
    const t = TREES[el];
    for (const n of t.nodes) nodes.set(n.id, n);
    for (const id of Object.keys(t.skills)) defs.set(id, t.skills[id]);
  }
  for (const id of Object.keys(EXTRA_SKILLS)) defs.set(id, EXTRA_SKILLS[id]);

  const api = {
    defs, nodes, trees: TREES, PRESETS, ROLES, TYPE_KO, SLOT_KO,
    registerImpl: (...a) => game.archetypes?.registerImpl?.(...a),
    registerArchetype: (...a) => game.archetypes?.registerArchetype?.(...a),
    def: (id) => defs.get(id) || null,
    node: (id) => nodes.get(id) || null,
  };
  const K = { api, defs, nodes, trees: TREES, PRESETS };
  K.adapters = createAdapters(game, log);
  installRuntime(game, K);
  K.talents = createTalents(game);
  try { K.familiars = createFamiliars(game); } catch (err) { log('familiars', '[skills] familiars unavailable', err); K.familiars = null; }
  K.procs = createProcs(game, K);
  K.kits = createClassKits(game, K);

  // trees reach progression here, inside the factory (CONTRACT §2, rule 7)
  try { game.progression?.registerTrees?.(TREES); } catch (err) { console.error('[skills] registerTrees failed', err); }

  Object.assign(api, {
    kits: K.kits, procs: K.procs, talents: K.talents, familiars: K.familiars, adapters: K.adapters,
    tooltip: (id, opts) => (nodes.has(id) ? formatNodeTooltip(game, api, id, opts) : formatSkillTooltip(game, api, id, opts)),
    init() {
      try { K.talents.all(); K.procs.sync(); K.kits.refresh(); api._ensureAttune?.(); } catch (err) { console.error('[skills] init', err); }
    },
    update(dt, realDt) {
      api._update(dt, realDt);
      try { K.procs.update(dt); } catch (err) { log('procsUpd', '[skills] procs.update', err); }
      try { K.kits.update(dt); } catch (err) { log('kitsUpd', '[skills] kits.update', err); }
    },
    /** Hidden instances of every visual this module owns (boot program pre-warm). */
    warmup() { return K.familiars ? K.familiars.warmup() : []; },
    prewarm() { return api.warmup(); },
  });
  return api;
}
