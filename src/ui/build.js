// §6.6 build help: the 추천 path per class (union of the preset node lists starter_<cls> → act2_<cls> → endgame_<cls>,
// each ordered by tier then cost), the next learnable 추천 node (glows in the tree) and 자동 배분 (on levelUp, spend
// points along the path through progression.canLearn/learn, auto-equip new actives into empty slots, one toast).
import { BUILD_KO } from './text.js';

const QUICK = ['q1', 'q2', 'q3', 'q4'];
let cache = { cls: null, path: null };

function presets(game) { return game.skills?.PRESETS || game.skills?.presets || null; }

/** Ordered node ids of the 추천 path for the current class ([] without data). */
export function recPath(game) {
  const P = game.progression, cls = P?.cls;
  if (!cls) return [];
  if (cache.cls === cls && cache.path) return cache.path;
  const PR = presets(game), nodes = game.skills?.nodes;
  if (!PR || !nodes?.get) return [];
  const out = [], seen = new Set();
  for (const stage of ['starter_', 'act2_', 'endgame_']) {
    const pr = PR[stage + cls]; if (!pr?.ranks) continue;
    const ids = Object.keys(pr.ranks).filter((id) => !seen.has(id) && nodes.get(id));
    ids.sort((a, b) => ((nodes.get(a).tier || 1) - (nodes.get(b).tier || 1)) || ((nodes.get(a).cost ?? 1) - (nodes.get(b).cost ?? 1)));
    for (const id of ids) { seen.add(id); out.push(id); }
  }
  cache = { cls, path: out };
  return out;
}
/** The next node on the path that can be learned now (null when none). */
export function recNext(game) {
  const P = game.progression; if (!P?.canLearn) return null;
  for (const id of recPath(game)) {
    if ((P.rank?.(id) || 0) > 0) continue;
    try { if (P.canLearn(id)?.ok) return id; } catch (_) { /* */ }
  }
  return null;
}
/** Spend every point along the path; equip new actives into empty slots. Returns {learned:[names], slots:[slot]}. */
export function autoAllocate(game, toast) {
  const P = game.progression, S = game.skills;
  if (!P?.learn || !(P.points > 0)) return null;
  const names = [], slots = [];
  for (let guard = 0; guard < 40 && P.points > 0; guard++) {
    const id = recNext(game); if (!id) break;
    if (!P.learn(id)) break;
    const n = S?.nodes?.get?.(id);
    names.push(n?.nameKo || S?.defs?.get?.((n?.grants || [])[0])?.nameKo || id);
    for (const sid of n?.grants || []) {
      const d = S?.defs?.get?.(sid); if (!d || !S.loadout) continue;
      const free = d.slot === 'quick' ? QUICK.find((q) => !S.loadout[q]) : d.slot === 'ultimate' && !S.loadout.ult ? 'ult' : d.slot === 'support' && !S.loadout.sup ? 'sup' : null;
      if (free) { try { if (S.equip(free, sid)) slots.push(free); } catch (_) { /* */ } }
    }
  }
  if (names.length && toast) {
    const s = slots.find((x) => x.startsWith('q'));
    toast(BUILD_KO.auto(names.join(' · '), s ? BUILD_KO.slotEquip(s.slice(1)) : ''), { duration: 4.5 });
  }
  return { learned: names, slots };
}
