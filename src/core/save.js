// Save system (CONTRACT §4 Save). game.save = { has, save, load, clear, request }.
// localStorage 'aw_save_v3': {v:3, progression, loadout, story, world, codex, difficulty, time}.
// No position and no HP are saved: a load spawns at the last reached spirit gate (or the village) with full HP.
// Autosave only at stage boundaries (questComplete) and when leaving the altar / tree; never while a boss is alive or
// during a cinematic; debounced 2 s; everything in try/catch; never in test mode unless &save=1.
export const SAVE_KEY = 'aw_save_v3';

export function createSave(game) {
  const params = (() => { try { return new URLSearchParams(location.search); } catch (_) { return new URLSearchParams(); } })();
  const allowed = () => !game.isTest || params.get('save') === '1';
  let pendingT = -1, lastErr = null;

  function blocked() {
    if (game.enemies?.boss?.alive) return 'boss';
    if (game.cinematic?.active || game.state === 'cutscene') return 'cinematic';
    if (!game.progression?.chosen) return 'noClass';
    return null;
  }
  function snapshot() {
    const codex = game.combat?.discovered ? [...game.combat.discovered] : [];
    return {
      v: 3,
      progression: game.progression.serialize(),
      loadout: game.skills?.serialize?.() ?? (game.skills?.loadout ? { ...game.skills.loadout } : null),
      story: game.story?.serialize?.() ?? null,
      world: game.world?.serialize?.() ?? null,
      codex,
      difficulty: game.settings?.values?.difficulty || 'normal',
      time: Date.now(),
    };
  }

  const api = {
    key: SAVE_KEY,
    has() {
      if (!allowed()) return false;
      try { const s = localStorage.getItem(SAVE_KEY); if (!s) return false; const o = JSON.parse(s); return o?.v === 3; } catch (_) { return false; }
    },
    peek() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (_) { return null; } },
    /** Save now. force skips the boss/cinematic guard (never used by autosave). */
    save({ force = false } = {}) {
      if (!allowed()) return false;
      const b = blocked(); if (b && !force) return false;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot()));
        game.events.emit('saved', {});
        return true;
      } catch (err) { lastErr = err; console.warn('[save] failed', err); return false; }
    },
    /** Debounced autosave request (2 s, real time). */
    request(reason = 'auto') {
      if (!allowed()) return false;
      pendingT = 2; api._reason = reason;
      return true;
    },
    /** Load order: progression → skills → story → world, then prewarm the act boss behind the load fade. */
    load() {
      if (!allowed()) return false;
      let o = null;
      try { o = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (_) { o = null; }
      if (!o || o.v !== 3) return false;
      const step = (name, fn) => { try { fn(); } catch (err) { console.warn(`[save] load ${name} failed`, err); } };
      step('difficulty', () => { if (o.difficulty) game.settings?.set?.('difficulty', o.difficulty); });
      step('progression', () => game.progression.deserialize(o.progression));
      step('skills', () => { if (game.skills?.deserialize) game.skills.deserialize(o.loadout); });
      step('story', () => game.story?.deserialize?.(o.story));
      step('world', () => game.world?.deserialize?.(o.world));
      step('codex', () => { const d = game.combat?.discovered; if (d?.add && Array.isArray(o.codex)) for (const id of o.codex) d.add(id); });
      step('player', () => {
        const pl = game.player;
        const spot = game.world?.lastGateSpawn?.() || game.world?.playerSpawn;
        if (pl?.placeAt && spot) pl.placeAt(spot); else pl?.placeInVillage?.();
        if (pl) { if (pl.maxHp) pl.hp = pl.maxHp; if (pl.entity && pl.maxHp) pl.entity.hp = pl.maxHp; }
      });
      step('prewarm', () => {
        const id = game.story?.currentBossId?.();
        if (id) game.enemies?.prewarmBoss?.(id)?.catch?.(() => {});
      });
      game.events.emit('loaded', {});
      return true;
    },
    clear() { try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* */ } },
    update(realDt) {
      if (pendingT < 0) return;
      pendingT -= realDt;
      if (pendingT > 0) return;
      if (blocked()) { pendingT = 2; return; }   // retry later (boss / cinematic)
      pendingT = -1;
      api.save();
    },
    get lastError() { return lastErr; },
  };

  // autosave triggers: stage boundaries and leaving the altar / tree / character menus
  game.events.on('questComplete', () => api.request('quest'));
  game.events.on('treeClosed', () => api.request('tree'));
  game.events.on('altarLeave', () => api.request('altar'));
  game.events.on('classChanged', () => api.request('class'));
  return api;
}
