// Boss registry entry point (CONTRACT §15). Loaded ONLY dynamically by enemies.init:
//   import('./enemies/bosses/index.js').then(m => m.registerBosses(api)).catch(warnOnce)
// so a broken or missing boss file never breaks the enemies module. Each factory is (ctx, arena, opts) → entity built on
// bossbase.js and carries factory.prewarm(ctx, arena) → Object3D (idempotent model build for enemies.prewarmBoss).
import { createHydra } from './hydra.js';
import { createNox } from './nox.js';
import { createTreant } from './treant.js';
import { createKalis } from './kalis.js';
import { createNidhoggra } from './nidhoggra.js';
import { BOSS_CODEX } from './codex.js';
import { buildHydra } from './hydra.js';
import { buildNox } from './nox.js';
import { buildTreant } from './treant.js';
import { buildKalis } from './kalis.js';
import { buildNidhoggra } from './nidhoggra_model.js';

export const BOSS_IDS = ['hydra', 'nox', 'treant', 'kalis', 'nidhoggra'];

export function registerBosses(api) {
  const reg = (id, f) => { try { api.bosses.register(id, f); } catch (err) { console.error('[bosses] register', id, err); } };
  reg('hydra', createHydra);
  reg('nox', createNox);
  reg('treant', createTreant);
  reg('kalis', createKalis);
  reg('nidhoggra', createNidhoggra);
  // v4: the boss codex + codex previews (enemies API, feature-detected)
  try { api.registerCodex?.(BOSS_CODEX); } catch (err) { console.warn('[bosses] registerCodex', err?.message || err); }
  const prev = { hydra: () => buildHydra().root, nox: () => buildNox().root, treant: () => buildTreant().root, kalis: () => buildKalis().root, nidhoggra: () => buildNidhoggra().root };
  for (const k of Object.keys(prev)) { try { api.registerPreview?.(k, prev[k]); } catch (_) { /* */ } }
  return BOSS_IDS.slice();
}
