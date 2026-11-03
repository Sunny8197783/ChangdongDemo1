// Tooltip text (P1, Korean). Reads tree data + progression; allocates (UI only, on hover — never per frame).
// formatNodeTooltip → { title, type, tier, cost, rank, maxRank, desc, current, next, lines[], text }
// formatSkillTooltip → { title, slot, cost, resource, cd, desc, lines[], text }
import { TYPE_KO, SLOT_KO } from './trees/_shape.js';
import { elName } from '../core/elements.js';

const TIER_KO = { 1: 'T1', 2: 'T2', 3: 'T3', 4: 'T4', 5: '각성' };

function fmt(n) { return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString(); }

/** Short param summary lines for a (merged) param block. */
export function paramLines(p) {
  const out = [];
  if (!p) return out;
  if (p.dmgMin != null && p.dmgMax != null) out.push(`피해 ${fmt(p.dmgMin)}–${fmt(p.dmgMax)}`);
  else if (p.dmg) out.push(`피해 ${fmt(p.dmg)}${p.n > 1 ? ` × ${p.n}` : ''}${p.lashes > 1 ? ` × ${p.lashes}` : ''}`);
  if (p.r) out.push(`반경 ${fmt(p.r)}m`);
  if (p.dist) out.push(`거리 ${fmt(p.dist)}m`);
  if (p.len) out.push(`길이 ${fmt(p.len)}m`);
  if (p.dur || p.life) out.push(`지속 ${fmt(p.dur || p.life)}초`);
  if (p.status) for (const k in p.status) {
    const v = p.status[k];
    const name = STATUS_KO[k] || k;
    if (typeof v === 'number') out.push(`${name} ${fmt(v)}초`);
    else if (v?.stacks) out.push(`${name} +${v.stacks}`);
    else if (v?.dur) out.push(`${name} ${fmt(v.dur)}초`);
  }
  return out;
}
const STATUS_KO = { burning: '화상', wet: '젖음', chilled: '냉기', frozen: '빙결', shocked: '감전', stunned: '경직', encrusted: '석화',
  seeded: '씨앗', radiant: '성흔', corroded: '침식', dazzled: '눈부심', rooted: '속박', hexed: '저주', marked: '표식', airborne: '공중' };

export function formatNodeTooltip(game, api, id, opts = {}) {
  const n = api.nodes.get(id); if (!n) return null;
  const pr = game.progression;
  const rank = opts.rank ?? (pr?.rank?.(id) || 0);
  const max = n.maxRank || 1;
  const lines = [];
  lines.push(`${elName(n.element)} · ${TIER_KO[n.tier] || ''} · ${TYPE_KO[n.type] || n.type}${n.primaryOnly ? ' · 주속성 전용' : ''}`);
  lines.push(`비용 ${n.cost}${max > 1 ? '/랭크' : ''} · 랭크 ${rank}/${max}`);
  let current = null, next = null;
  if (n.descRank) {
    if (rank > 0) current = n.descRank(rank);
    if (rank < max) next = n.descRank(rank + 1);
    if (current && next) lines.push(`${current} → ${next}`);
    else if (next) lines.push(`다음: ${next}`);
    else if (current) lines.push(`현재: ${current}`);
  }
  if (n.modifies) {
    const target = api.defs.get(n.modifies);
    if (target) lines.push(`수정 대상: ${target.nameKo} (택1: ${api.nodes.get(n.exclusive)?.nameKo || ''})`);
  }
  for (const g of n.grants || []) {
    const d = api.defs.get(g); if (!d) continue;
    const pl = paramLines(d.params);
    lines.push(`${SLOT_KO[d.slot] || ''} ${d.nameKo}${d.cost ? ` · ${d.cost} 자원` : ''}${d.cd ? ` · ${fmt(d.cd)}초` : ''}${pl.length ? ' · ' + pl.slice(0, 3).join(', ') : ''}`);
  }
  if (pr && rank < max) {
    const c = pr.canLearn?.(id);
    if (c && !c.ok) lines.push(REASON_KO[c.reason] || '배울 수 없음');
  }
  const out = { title: n.nameKo, type: n.type, tier: n.tier, cost: n.cost, rank, maxRank: max, desc: n.desc, current, next, lines };
  out.text = [n.nameKo, n.desc, ...lines].filter(Boolean).join('\n');
  return out;
}
const REASON_KO = { class: '이 직업은 사용할 수 없는 속성입니다', tier: '주속성 전용', gate: '이 트리에 포인트가 더 필요합니다', prereq: '선행 노드가 필요합니다',
  exclusive: '다른 수정자를 이미 선택했습니다 (택1)', points: '스킬 포인트가 부족합니다', story: '정령을 해방하면 개방', maxRank: '최대 랭크', unknown: '알 수 없는 노드' };

export function formatSkillTooltip(game, api, id) {
  const d = api.defs.get(id); if (!d) return null;
  const fam = api.family?.() || 'caster';
  const melee = fam === 'melee';
  const p = api.effectiveParams?.(id) || d.params;
  const lines = paramLines(p);
  const mods = (d.modifiers || []).filter((m) => game.progression?.rank?.(m) > 0).map((m) => api.nodes.get(m)?.nameKo).filter(Boolean);
  if (mods.length) lines.push('수정자: ' + mods.join(', '));
  if (d.twist) lines.push('지형 상호작용');
  const cost = d.cost ? Math.round(d.cost * (melee ? 0.8 : 1)) : 0;
  const out = { title: d.nameKo, slot: d.slot, slotKo: SLOT_KO[d.slot] || '', cost, resource: melee ? '투지' : '마나', cd: d.cd || 0, desc: d.desc || '', lines,
    power: game.stats?.derived?.().power ?? 1 };
  out.text = [d.nameKo, `${out.slotKo}${cost ? ` · ${out.resource} ${cost}` : ''}${d.cd ? ` · 재사용 ${fmt(d.cd)}초` : ''}`, d.desc, ...lines].filter(Boolean).join('\n');
  return out;
}
