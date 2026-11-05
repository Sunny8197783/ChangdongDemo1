// Regular-enemy data tables (PLAN v4 §4.1–4.8, §7.4.5). Owned by mobs.
//   CODEX           type → CodexEntry (몬스터 도감; final Korean copy, no windup seconds, parry advice only in parryKo,
//                   key names only through {dodgeKey} {defendKey} {jumpKey}, punish durations only through {punishSec})
//   ATTACK_SPECS    attack id → numbers for game.tells.attack (normal difficulty; tells applies floors / tellMul / timeMul)
//   WEAK            type → {weakness, resist, immune} written onto every entity (CHU_WEAK for the 말랑이 variants)
// Korean player-facing text lives only here (PLAN §7.2 rule 6); behaviour files read names through nameOf()/codexAttack().

/** 말랑이 variants: immune to their own element, weak to one counter (§4.3). */
export const CHU_WEAK = {
  fire: { el: 'water', mul: 2 }, ice: { el: 'fire', mul: 2 }, lightning: { el: 'earth', mul: 2 }, water: { el: 'lightning', mul: 2 },
  light: { el: 'shadow', mul: 2 }, shadow: { el: 'light', mul: 2 }, wind: { el: 'earth', mul: 1.5 }, nature: { el: 'fire', mul: 1.5 },
};
export const CHU_NAMES = {
  normal: '말랑이', fire: '불꽃 말랑이', ice: '얼음 말랑이', lightning: '전기 말랑이', wind: '바람 말랑이',
  water: '물방울 말랑이', nature: '새싹 말랑이', light: '햇살 말랑이', shadow: '그늘 말랑이',
};
export const CHU_TYPES = Object.keys(CHU_NAMES);
const EL_KO = { fire: '화염', ice: '얼음', lightning: '번개', wind: '바람', water: '물', earth: '대지', nature: '자연', light: '빛', shadow: '그림자' };

/**
 * Attack numbers (§4.1–4.8). windup = tell start → damage (normal difficulty); lockAt = seconds before the hit at which the aim
 * freezes; punishDur / punishMul → game.tells.punish after the strike; kind = hit metadata kind; v3 = legacy enemyAttack kind.
 */
export const ATTACK_SPECS = {
  'bokoblin.swing': { tell: 'danger', cls: 'mobLight', windup: 0.80, lockAt: 0.40, punishDur: 0.70, punishMul: 1.25, kind: 'melee', anchor: 'weapon', v3: 'windup' },
  'bokoblin.leap': { tell: 'danger', cls: 'mobHeavy', windup: 1.25, lockAt: 0.75, punishDur: 1.20, punishMul: 1.25, kind: 'melee', anchor: 'weapon', v3: 'leap' },
  'shaman.orb': { tell: 'projectile', cls: 'mobRanged', windup: 1.00, lockAt: 0.35, punishDur: 0, kind: 'projectile', anchor: 'weapon', melee: false, v3: 'cast' },
  'chuchu.lunge': { tell: 'danger', cls: 'mobLight', windup: 0.75, lockAt: 0.35, punishDur: 0.80, punishMul: 1.5, kind: 'melee', anchor: 'core', v3: 'lunge' },
  'chuchu.aura': { tell: 'danger', cls: 'check', windup: 0.50, lockAt: 0, punishDur: 0, kind: 'hazard', anchor: 'core', melee: false, v3: 'aura' },
  'lizard.thrust': { tell: 'danger', cls: 'mobLight', windup: 0.80, lockAt: 0.40, punishDur: 0.70, punishMul: 1.25, kind: 'melee', anchor: 'weapon', v3: 'thrust' },
  'lizard.lunge': { tell: 'danger', cls: 'mobLight', windup: 0.80, lockAt: 0.35, punishDur: 0.60, punishMul: 1.25, kind: 'melee', anchor: 'head', v3: 'lunge' },
  'shroom.lob': { tell: 'projectile', cls: 'mobRanged', windup: 1.90, lockAt: 1.00, punishDur: 1.00, punishMul: 1.25, kind: 'hazard', anchor: 'head', melee: false, flight: 1.0, v3: 'lob' },
  'shroom.deathCloud': { tell: 'danger', cls: 'check', windup: 0.60, lockAt: 0, punishDur: 0, kind: 'hazard', anchor: 'head', melee: false, v3: 'deathCloud' },
  'wolf.bite': { tell: 'danger', cls: 'mobLight', windup: 0.75, lockAt: 0.40, punishDur: 0.80, punishMul: 1.25, kind: 'melee', anchor: 'mouth', v3: 'bite' },
  'wraith.bolt': { tell: 'projectile', cls: 'mobRanged', windup: 1.00, lockAt: 0.35, punishDur: 1.20, punishMul: 1.25, kind: 'projectile', anchor: 'hand', melee: false, v3: 'cast' },
  'voidknight.combo1': { tell: 'danger', cls: 'elite', windup: 0.80, lockAt: 0.35, punishDur: 0, kind: 'melee', anchor: 'weapon', v3: 'combo' },
  'voidknight.combo2': { tell: 'danger', cls: 'combo', windup: 0.55, lockAt: 0.30, punishDur: 0, kind: 'melee', anchor: 'weapon', v3: 'combo' },
  'voidknight.combo3': { tell: 'danger', cls: 'combo', windup: 0.65, lockAt: 0.35, punishDur: 1.00, punishMul: 1.25, kind: 'melee', anchor: 'weapon', v3: 'combo' },
  'voidknight.slam': { tell: 'parry', cls: 'elite', windup: 1.10, lockAt: 0.35, punishDur: 0, kind: 'melee', anchor: 'weapon', v3: 'slam' },
  'voidknight.bash': { tell: 'danger', cls: 'check', windup: 0.55, lockAt: 0.25, punishDur: 0, kind: 'melee', anchor: 'hand', v3: 'bash' },
  'dummy.practice': { tell: 'danger', cls: 'mobLight', windup: 1.20, lockAt: 0.40, punishDur: 0, kind: 'melee', anchor: 'core', v3: 'practice' },
  'dummy.parry': { tell: 'parry', cls: 'mobLight', windup: 1.20, lockAt: 0.40, punishDur: 0, kind: 'melee', anchor: 'core', v3: 'practice' },
};

/** Weakness / resist / immune per type (combat multiplies by e.resist[el]; weaknesses are written into resist as > 1). */
export const WEAK = {
  bokoblin: { weakness: ['fire'], resist: { fire: 1.3 }, immune: [] },
  shaman: { weakness: ['lightning'], resist: { lightning: 1.3 }, immune: [] },          // + own element ×0.5 (per instance)
  chuchu: { weakness: [], resist: {}, immune: [] },                                     // variants: CHU_WEAK
  lizard: { weakness: ['lightning'], resist: { water: 0.5, lightning: 1 }, immune: [] },  // lightning ×1.5 while wet (live)
  shroom: { weakness: ['fire'], resist: { fire: 1.5, nature: 0.5 }, immune: [] },
  wolf: { weakness: ['light'], resist: { light: 1.5, shadow: 0.6 }, immune: [] },
  wraith: { weakness: ['light'], resist: { light: 1.3, shadow: 0.5 }, immune: [] },
  voidknight: { weakness: ['light'], resist: { light: 1.3, shadow: 0.5 }, immune: [] },
  dummy: { weakness: [], resist: {}, immune: [] },
};

const A = (id, tell, tellKo, counterKo, extra) => ({ id, nameKo: NAMES[id], tell, tellKo, counterKo, ...(extra || {}), punishDur: ATTACK_SPECS[id]?.punishDur || undefined });
const NAMES = {
  'bokoblin.swing': '몽둥이 휘두르기', 'bokoblin.leap': '도약 내려찍기',
  'shaman.orb': '저주 구슬', 'shaman.blink': '순간이동',
  'chuchu.lunge': '몸통 박치기', 'chuchu.aura': '원소 오라',
  'lizard.thrust': '창 찌르기', 'lizard.lunge': '물살 돌진',
  'shroom.lob': '포자 투척', 'shroom.deathCloud': '죽음의 포자',
  'wolf.bite': '돌진 물기',
  'wraith.bolt': '공허 화살', 'wraith.blink': '순간이동',
  'voidknight.combo1': '3연격', 'voidknight.combo2': '3연격', 'voidknight.combo3': '3연격', 'voidknight.slam': '내려찍기', 'voidknight.bash': '방패 밀치기',
  'dummy.practice': '연습 공격', 'dummy.parry': '연습 공격',
};

const CHU_TIP = '몸을 부르르 떨면 몸통 박치기가 옵니다. 착지해 납작해진 동안 받는 피해가 1.5배예요. 원소 말랑이의 몸이 빛나면 주변에 오라가 터지니 잠시 떨어지세요.';
const chuEntry = (v) => {
  const w = CHU_WEAK[v];
  const attacks = [A('chuchu.lunge', 'danger', '몸을 부르르 떪 · 빨간 선과 착지 원', '선 밖으로 비켜서기', { punishKo: '착지 후 {punishSec}초 동안 납작해져 피해 1.5배' })];
  if (v !== 'normal') attacks.push(A('chuchu.aura', 'danger', '몸이 빛남 · 몸 주변의 작은 원', '잠시 떨어지기'));
  return {
    type: v === 'normal' ? 'chuchu' : 'chuchu:' + v, variant: v, nameKo: CHU_NAMES[v], roleKo: '약한 점액 생물', boss: false, elite: false,
    weak: w ? [{ el: w.el, mul: w.mul }] : [], resist: [], immune: v === 'normal' ? [] : [v],
    weakKo: w ? `상극 원소 ×${w.mul} (${EL_KO[w.el]})` : '없음',
    weakPointKo: w ? `체력이 40% 이하일 때 ${EL_KO[w.el]} 공격을 맞으면 바로 터집니다.` : undefined,
    tipKo: CHU_TIP, attacks,
  };
};

/** CodexEntry per type (§7.4.5). Variant entries are keyed 'chuchu:<variant>'. */
export const CODEX = {
  bokoblin: {
    type: 'bokoblin', nameKo: '뿔도깨비', roleKo: '근접 돌격병', boss: false, elite: false,
    weak: [{ el: 'fire', mul: 1.3 }], resist: [], immune: [], weakKo: '화염',
    tipKo: '몽둥이를 머리 위로 치켜들면 앞쪽 부채꼴 범위를 내려칩니다. 빨간 영역이 가득 차기 직전에 옆으로 피하고, 헛친 직후 몰아치세요.',
    parryKo: '몽둥이 휘두르기를 {defendKey}로 완벽하게 막으면 {punishSec}초 동안 기절시킬 수 있어요.',
    attacks: [
      A('bokoblin.swing', 'danger', '몽둥이를 치켜듦 · 빨간 부채꼴', '가득 차기 직전에 옆으로 {dodgeKey} 회피',
        { parryKo: '몽둥이 휘두르기를 {defendKey}로 완벽하게 막으면 {punishSec}초 동안 기절시킬 수 있어요.', punishKo: '헛친 뒤 {punishSec}초 동안 반격 기회' }),
      A('bokoblin.leap', 'danger', '웅크린 뒤 도약 · 착지 원', '원 밖으로', { punishKo: '착지 후 {punishSec}초 동안 무방비' }),
    ],
  },
  shaman: {
    type: 'shaman', nameKo: '도깨비 주술사', roleKo: '원거리 술사', boss: false, elite: false,
    weak: [{ el: 'lightning', mul: 1.3 }], resist: [], immune: [], weakKo: '번개',
    tipKo: '지팡이 보석의 고리가 다 자라면 저주 구슬을 쏩니다. 구슬은 잠깐만 따라오니 옆으로 달리면 빗나가요. 시전 중에 맞히면 잠시 멍해집니다.',
    parryKo: '{defendKey} 완벽 방어로 구슬을 되받아칠 수 있어요.',
    attacks: [
      A('shaman.orb', 'projectile', '보석 고리 · 붉은 조준선', '옆으로 달리기', { parryKo: '{defendKey} 완벽 방어로 구슬을 되받아칠 수 있어요.' }),
      { id: 'shaman.blink', nameKo: NAMES['shaman.blink'], tell: 'none', tellKo: '도착 지점이 먼저 일렁임', counterKo: '일렁이는 곳으로 원거리 공격' },
    ],
  },
  chuchu: chuEntry('normal'),
  lizard: {
    type: 'lizard', nameKo: '수렁도마뱀', roleKo: '수중 매복병', boss: false, elite: false,
    weak: [{ el: 'lightning', mul: 1.5 }], resist: [{ el: 'water', mul: 0.5 }], immune: [], weakKo: '번개 (젖었을 때)',
    tipKo: '등지느러미가 펼쳐지면 창 찌르기가 직선으로 옵니다. 선 밖으로 비켜서고, 창이 땅에 꽂힌 동안 반격하세요. 물속에 있을 땐 얼음으로 얼리거나 번개를 쓰세요.',
    attacks: [
      A('lizard.thrust', 'danger', '등지느러미가 펼쳐짐 · 빨간 직선', '선 밖으로 비켜서기', { punishKo: '창이 꽂힌 {punishSec}초 동안 반격 기회' }),
      A('lizard.lunge', 'danger', '몸을 낮춤 · 착지까지 이어진 빨간 띠', '띠 밖으로 피하기', { punishKo: '착지 후 {punishSec}초 동안 엎드림' }),
    ],
  },
  shroom: {
    type: 'shroom', nameKo: '포자 버섯병', roleKo: '포자 투척병', boss: false, elite: false,
    weak: [{ el: 'fire', mul: 1.5 }], resist: [{ el: 'nature', mul: 0.5 }], immune: [], weakKo: '화염',
    tipKo: '갓의 구멍이 빛나면 포자 덩어리를 던집니다. 착지 원을 피하고, 붉은 빗금 구역(포자 구름)에는 들어가지 마세요. 불로 태우면 구름이 사라집니다.',
    attacks: [
      A('shroom.lob', 'projectile', '갓의 구멍이 빛남 · 착지 원', '착지 원 밖으로', { punishKo: '던진 뒤 {punishSec}초 동안 갓이 처짐' }),
      A('shroom.deathCloud', 'hazard', '쓰러질 때 부풀어 오름', '붉은 빗금 구역에서 벗어나기'),
    ],
  },
  wolf: {
    type: 'wolf', nameKo: '타락 늑대', roleKo: '무리 사냥꾼', boss: false, elite: false,
    weak: [{ el: 'light', mul: 1.5 }], resist: [{ el: 'shadow', mul: 0.6 }], immune: [], weakKo: '빛',
    tipKo: '몸을 낮추면 직선으로 돌진해 뭅니다. 화면 가장자리의 붉은 화살표를 보고 돌아서 옆으로 피하세요. 물고 난 뒤 미끄러지는 동안이 공격 기회예요.',
    attacks: [A('wolf.bite', 'danger', '몸을 낮춤 · 빨간 직선', '옆으로 {dodgeKey} 회피', { punishKo: '문 뒤 {punishSec}초 동안 미끄러짐' })],
  },
  wraith: {
    type: 'wraith', nameKo: '공허 망령', roleKo: '공허의 술사', boss: false, elite: false,
    weak: [{ el: 'light', mul: 1.3 }], resist: [{ el: 'shadow', mul: 0.5 }], immune: [], weakKo: '빛 (보호막 파괴)',
    tipKo: '보랏빛 구슬을 다 모으면 발사합니다. 쏜 직후에는 잠시 도망가지 못하니 그때 공격하세요. 순간이동 전에는 도착 지점이 먼저 일렁입니다.',
    attacks: [
      A('wraith.bolt', 'projectile', '보랏빛 구슬을 모음 · 붉은 조준선', '옆으로 달리기', { punishKo: '쏜 뒤 {punishSec}초 동안 도망가지 못함' }),
      { id: 'wraith.blink', nameKo: NAMES['wraith.blink'], tell: 'none', tellKo: '도착 지점이 먼저 일렁임', counterKo: '일렁이는 곳으로 원거리 공격' },
    ],
  },
  voidknight: {
    type: 'voidknight', nameKo: '공허 기사', roleKo: '정예 · 방패 기사', boss: false, elite: true,
    weak: [{ el: 'light', mul: 1.3 }], resist: [{ el: 'shadow', mul: 0.5 }], immune: [], weakKo: '빛 · 등 뒤',
    weakPointKo: '등 뒤에서 때리면 피해 1.5배, 정면의 약한 공격은 방패에 막힙니다.',
    tipKo: '3연격은 부채꼴이 하나씩 차례로 표시됩니다. 금빛 점선으로 번쩍이는 내려찍기는 가득 차기 직전에 피하세요. 연달아 막히면 방패를 들어 밀쳐내니, 정면을 고집하지 말고 뒤로 돌아가세요.',
    parryKo: '금빛 내려찍기를 {defendKey}로 패링하면 {punishSec}초 동안 기절시킬 수 있어요!',
    attacks: [
      A('voidknight.combo1', 'danger', '부채꼴이 하나씩 차례로', '부채꼴마다 옆으로 {dodgeKey} 회피', { punishKo: '세 번째 공격 뒤 {punishSec}초 동안 반격 기회' }),
      A('voidknight.slam', 'parry', '칼날에 금빛 번쩍임 · 금빛 점선 원', '가득 차기 직전에 피하기', { parryKo: '금빛 내려찍기를 {defendKey}로 패링하면 {punishSec}초 동안 기절시킬 수 있어요!', punishDur: 2 }),
      A('voidknight.bash', 'danger', '방패를 들어 올림 · 작은 부채꼴', '정면에서 벗어나 뒤로 돌아가기'),
    ],
  },
};
for (const v of CHU_TYPES) if (v !== 'normal') CODEX['chuchu:' + v] = chuEntry(v);

/** Korean entity names per type (data table; behaviour files read them through typeName). */
export const TYPE_NAMES = { bokoblin: '뿔도깨비', shaman: '도깨비 주술사', chuchu: '말랑이', lizard: '수렁도마뱀', shroom: '포자 버섯병', wolf: '타락 늑대',
  wraith: '공허 망령', voidknight: '공허 기사', dummy: '수련용 허수아비' };
export const typeName = (t) => TYPE_NAMES[t] || '';
/** Korean attack name for an id (codex data). */
export function nameOf(id) { return NAMES[id] || ''; }
/** Hit metadata for an attack id (cached; never mutated by callers). */
const META = {};
export function attackMeta(id) {
  let m = META[id];
  if (!m) { const S = ATTACK_SPECS[id]; m = META[id] = Object.freeze({ id, nameKo: NAMES[id] || '', kind: S?.kind || 'melee' }); }
  return m;
}
/** e.attacks rows for a type: [{id, nameKo, tell, windup, punishDur?}]. */
export function attacksOf(prefix) {
  const out = [];
  for (const id in ATTACK_SPECS) {
    if (!id.startsWith(prefix + '.')) continue;
    const S = ATTACK_SPECS[id];
    out.push({ id, nameKo: NAMES[id], tell: S.tell, windup: S.windup, punishDur: S.punishDur || undefined });
  }
  return out;
}
/** Write weakness / resist / immune onto an entity (§4.0). chuchu variants use CHU_WEAK + immunity to their element. */
export function applyWeakness(e, type, variant = null) {
  const W = WEAK[type] || { weakness: [], resist: {}, immune: [] };
  const resist = Object.assign({}, W.resist, e.resist || null);
  for (const k in W.resist) resist[k] = W.resist[k];
  const weakness = W.weakness.slice(), immune = W.immune.slice();
  if (type === 'chuchu' && variant && variant !== 'normal') {
    const w = CHU_WEAK[variant];
    if (w) { weakness.push(w.el); resist[w.el] = w.mul; }
    immune.push(variant); resist[variant] = 0;
  }
  e.weakness = weakness; e.resist = resist; e.immune = immune;
  return e;
}
