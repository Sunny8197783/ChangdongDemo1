// Boss registry entry point (CONTRACT §15). Loaded ONLY dynamically by enemies.init:
//   import('./enemies/bosses/index.js').then(m => m.registerBosses(api)).catch(warnOnce)
// so a broken or missing boss file never breaks the enemies module. Each factory is (ctx, arena, opts) → entity built on
// bossbase.js and carries factory.prewarm(ctx, arena) → Object3D (idempotent model build for enemies.prewarmBoss).
import { createHydra } from './hydra.js';
import { createNox } from './nox.js';
import { createTreant } from './treant.js';
import { createKalis } from './kalis.js';
import { createNidhoggra } from './nidhoggra.js';

export const BOSS_IDS = ['hydra', 'nox', 'treant', 'kalis', 'nidhoggra'];

export function registerBosses(api) {
  const reg = (id, f) => { try { api.bosses.register(id, f); } catch (err) { console.error('[bosses] register', id, err); } };
  reg('hydra', createHydra);
  reg('nox', createNox);
  reg('treant', createTreant);
  reg('kalis', createKalis);
  reg('nidhoggra', createNidhoggra);
  return BOSS_IDS.slice();
}
