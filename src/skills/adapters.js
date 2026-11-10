// Legacy spells/sword bridge (CONTRACT §7.4). Owned by skills.
// caster: legacy.spell → game.spells.castById(spellId, opts) (v3 magic API; emits spellCast itself)
//         fallback while magic is still v2: game.spells.cast(el, kind, {free:true, …}) (also emits spellCast itself)
// melee:  legacy.sword → game.sword.api.playLegacy(element, kind, opts) (v3 melee API; emits spellCast itself)
//         fallback while melee is still v2: the caster legacy spell fired from the weapon tip ("검기", DESIGN §2)
// Every call is guarded: a missing API or a throw returns false so the runtime falls through to the archetypes.

const SPELL_KIND = { basic: 'basic', heavy: 'heavy', ultimate: 'ultimate', awakened: 'awakened', support: 'support', finisher: 'finisher' };

export function createAdapters(game, log) {
  /** 'fire_heavy' → ['fire', 'heavy'] */
  function splitSpell(id) {
    const i = id.lastIndexOf('_');
    return i > 0 ? [id.slice(0, i), id.slice(i + 1)] : [id, 'basic'];
  }
  const spells = () => game.spells;
  const swordApi = () => game.sword?.api;

  const A = {
    /** v3 magic present (castById + silent setter). */
    magicV3() { return typeof spells()?.castById === 'function'; },
    /** v3 melee present (sword.api.playLegacy). */
    meleeV3() { return typeof swordApi()?.playLegacy === 'function'; },

    castSpell(spellId, opts) {
      const sp = spells(); if (!sp || sp.isStub) return false;
      try {
        if (typeof sp.castById === 'function') return sp.castById(spellId, { free: true, charge: opts.charge, aim: opts.aim, awakened: opts.awakened, castId: opts.castId, skillId: opts.skillId }) !== false;
        if (typeof sp.cast === 'function') {
          const [el, kind] = splitSpell(spellId);
          if (!SPELL_KIND[kind]) return false;
          return sp.cast(el, kind, { free: true, charge: opts.charge, aim: opts.aim, castId: opts.castId, skillId: opts.skillId }) !== false;
        }
      } catch (err) { log('legacySpell:' + spellId, '[skills] legacy spell failed', spellId, err); }
      return false;
    },
    playSword(element, kind, opts) {
      const M = swordApi(); if (!M || typeof M.playLegacy !== 'function') return false;
      try { return M.playLegacy(element, kind, { free: true, charge: opts.charge, aim: opts.aim, skillId: opts.skillId, awakened: opts.awakened, castId: opts.castId }) !== false; }
      catch (err) { log('legacySword:' + element + kind, '[skills] legacy sword failed', element, kind, err); }
      return false;
    },
    /**
     * Try the legacy path for a def. Returns true if a legacy implementation performed the cast.
     * (The legacy code emits spellCast itself.)
     */
    tryLegacy(def, family, element, opts) {
      const L = def.legacy; if (!L) return false;
      if (family === 'melee') {
        if (L.sword && A.playSword(element, L.sword, opts)) return true;
        // v2 sword has no element-payload API: fall back to the caster legacy spell from the weapon tip (검기)
        if (L.spell && !A.meleeV3()) return A.castSpell(L.spell, opts);
        return false;
      }
      if (L.spell) return A.castSpell(L.spell, opts);
      return false;
    },
    /** Silent element setters on spells/sword (CONTRACT §7.2 step 2). v2 setters emit elementChanged: muted. */
    setElementSilent(el, index, mute) {
      const sp = spells();
      if (sp && !sp.isStub && typeof sp.setElement === 'function') {
        try {
          if (A.magicV3()) {
            const list = Array.isArray(sp.elements) ? sp.elements : null;
            let i = index;
            if (list) { i = -1; for (let k = 0; k < list.length; k++) if ((typeof list[k] === 'string' ? list[k] : list[k]?.id) === el) { i = k; break; } }
            if (i >= 0) sp.setElement(i, { silent: true });
          } else if (Array.isArray(sp.elements) && sp.elements.includes(el)) mute(() => sp.setElement(sp.elements.indexOf(el), true));
        } catch (err) { log('setSpellEl', '[skills] spells.setElement failed', err); }
      }
      const sw = game.sword;
      if (sw && !sw.isStub && typeof sw.setElement === 'function') {
        try {
          if (A.meleeV3()) sw.setElement(el, { silent: true });
          else mute(() => sw.setElement(el, true));
        } catch (err) { log('setSwordEl', '[skills] sword.setElement failed', err); }
      }
    },
  };
  return A;
}
