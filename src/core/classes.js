// Class registry (v3, DESIGN §2). The ONLY file (with player/kits.js) allowed to name class ids in code.
// Everyone else uses familyOf / styleOf / CLASS_DEFS[cls].* (CONTRACT rule 8).
// game.classes = { DEFS, ids, get, access, familyOf, styleOf, classElements, TALENTS }

const talentIds = (cls) => ({ 1: `${cls}.t1`, 10: `${cls}.t10`, 20: `${cls}.t20`, 25: [`${cls}.t25a`, `${cls}.t25b`] });

export const CLASS_DEFS = {
  mage: {
    id: 'mage', nameKo: '마법사', title: '원소 학자', family: 'caster', style: 'staff', weapon: 'staff',
    weaponKo: '지팡이', resource: 'mp', primary: ['fire', 'ice'], secondary: ['lightning', 'wind', 'water', 'shadow'],
    base: { hp: 100, mp: 100, resolve: 0, stamina: 100, power: 1.0, defense: 0, crit: 0.10, move: 1.0 },
    dodge: 'blink', defend: 'barrier', signature: 'attunement', signatureKo: '원소 연쇄', mentor: 'mageMentor',
    fantasyKo: '원소를 엮어 반응을 일으키는 원소의 학자.', talents: talentIds('mage'),
  },
  sword: {
    id: 'sword', nameKo: '검사', title: '원소검', family: 'melee', style: 'longsword', weapon: 'longsword',
    weaponKo: '장검', resource: 'resolve', primary: ['lightning', 'earth'], secondary: ['fire', 'wind', 'ice', 'light'],
    base: { hp: 130, mp: 0, resolve: 100, stamina: 110, power: 1.0, defense: 0.10, crit: 0.10, move: 1.0 },
    dodge: 'dashstep', defend: 'guard', signature: 'enchant', signatureKo: '인챈트 블레이드', mentor: 'swordMentor',
    fantasyKo: '검에 원소를 깃들여 리듬과 패리로 승리하는 기사.', talents: talentIds('sword'),
  },
  ranger: {
    id: 'ranger', nameKo: '궁수', title: '바람의 사수', family: 'caster', style: 'bow', weapon: 'bow',
    weaponKo: '장궁', resource: 'mp', primary: ['wind', 'light'], secondary: ['lightning', 'nature', 'ice', 'fire'],
    base: { hp: 110, mp: 100, resolve: 0, stamina: 110, power: 1.0, defense: 0.05, crit: 0.12, move: 1.04 },
    dodge: 'backflip', defend: 'focus', signature: 'focus', signatureKo: '집중', mentor: 'rangerMentor',
    fantasyKo: '느려진 시간 속에서 조준하고 하늘을 춤추는 사수.', talents: talentIds('ranger'),
  },
  paladin: {
    id: 'paladin', nameKo: '성기사', title: '빛의 방패', family: 'melee', style: 'hammer', weapon: 'hammer', offhand: 'shield',
    weaponKo: '전투 망치 + 방패', resource: 'resolve', primary: ['light', 'fire'], secondary: ['earth', 'water', 'nature', 'shadow'],
    base: { hp: 160, mp: 0, resolve: 100, stamina: 110, power: 0.95, defense: 0.18, crit: 0.08, move: 0.94 },
    dodge: 'shieldstep', defend: 'shield', signature: 'seal', signatureKo: '수호의 맹세', mentor: 'paladinMentor',
    fantasyKo: '빛의 영역으로 스스로를 지키는 단단한 성스러운 기사.', talents: talentIds('paladin'),
  },
  spiritcaller: {
    id: 'spiritcaller', nameKo: '정령술사', title: '숲의 목소리', family: 'caster', style: 'totem', weapon: 'totem',
    weaponKo: '토템 지팡이', resource: 'mp', primary: ['nature', 'water'], secondary: ['earth', 'wind', 'light', 'shadow'],
    base: { hp: 105, mp: 120, resolve: 0, stamina: 100, power: 0.95, defense: 0.05, crit: 0.10, move: 1.0 },
    dodge: 'spiritswap', defend: 'ward', signature: 'familiars', signatureKo: '정령 동료', mentor: 'spiritMentor',
    fantasyKo: '작은 원소 정령들과 함께 싸우는 드루이드.', talents: talentIds('spiritcaller'),
  },
  shadowblade: {
    id: 'shadowblade', nameKo: '암살자', title: '그림자 칼날', family: 'melee', style: 'daggers', weapon: 'daggers',
    weaponKo: '쌍단검', resource: 'resolve', primary: ['shadow', 'nature'], secondary: ['ice', 'lightning', 'earth', 'water'],
    base: { hp: 105, mp: 0, resolve: 100, stamina: 120, power: 1.0, defense: 0, crit: 0.20, move: 1.08 },
    dodge: 'shadowroll', defend: 'counter', signature: 'marks', signatureKo: '그림자 표식', mentor: 'shadowMentor',
    fantasyKo: '표식을 쌓고 등 뒤에서 터뜨리는 빠른 결투가.', talents: talentIds('shadowblade'),
  },
};
export const CLASS_IDS = Object.keys(CLASS_DEFS);

const warned = new Set();
function warnUnknown(cls) {
  if (cls == null || warned.has(cls)) return;
  warned.add(cls); console.warn('[classes] unknown class id:', cls);
}

export function access(cls, el) {
  const c = CLASS_DEFS[cls];
  return !c ? null : c.primary.includes(el) ? 'primary' : c.secondary.includes(el) ? 'secondary' : null;
}
export function familyOf(cls) { const c = CLASS_DEFS[cls]; if (!c) warnUnknown(cls); return c?.family || 'caster'; }
export function styleOf(cls) { return CLASS_DEFS[cls]?.style || 'staff'; }
export function classElements(cls) { const c = CLASS_DEFS[cls]; return c ? [...c.primary, ...c.secondary] : []; }
export function classesForElement(el) { return CLASS_IDS.filter((c) => access(c, el)); }

/** 직업 특성 (automatic by level; Lv25 is a choice a|b). Texts from DESIGN §2.2. */
export const TALENTS = {
  'mage.t1': { nameKo: '원소 연쇄', desc: '3초 안에 이전과 다른 속성의 스킬을 쓰면 연쇄 1스택(최대 3). 3스택이면 다음 스킬이 MP 0, 피해 +30%.' },
  'mage.t10': { nameKo: '연쇄 순환', desc: '연쇄 스택마다 MP를 5 돌려받습니다.' },
  'mage.t20': { nameKo: '잔상의 룬', desc: '점멸 자리에 1.5초 뒤 폭발하는 룬을 남깁니다 (조율 속성 30 피해).' },
  'mage.t25a': { nameKo: '대마도사', desc: '충전 주문의 충전 속도 +30%.' },
  'mage.t25b': { nameKo: '원소 폭주', desc: '내가 일으킨 반응마다 15% 확률로 그 스킬의 재사용 대기시간 초기화.' },

  'sword.t1': { nameKo: '인챈트 블레이드', desc: '타격마다 인챈트 게이지 +4 (반응 시 +8). 가득 차면 다음 완벽 패리가 8m 원소 파동(80 피해 + 상태이상)을 방출합니다.' },
  'sword.t10': { nameKo: '찰나의 검', desc: '패리 판정 시간 +0.05초.' },
  'sword.t20': { nameKo: '이중 각인', desc: '콤보 4타가 조율 속성의 상태이상을 두 번 부여합니다.' },
  'sword.t25a': { nameKo: '검성', desc: '콤보 타격 피해 +15%.' },
  'sword.t25b': { nameKo: '반격의 대가', desc: '반격 연타 +2회, 체력 3% 회복.' },

  'ranger.t1': { nameKo: '집중', desc: '공중·활공 중 또는 회피 직후 E를 누르고 있으면 시간이 ×0.35로 느려집니다 (기력 25/초).' },
  'ranger.t10': { nameKo: '급소 사격', desc: '적의 머리(상단 25%) 명중 시 피해 ×1.5.' },
  'ranger.t20': { nameKo: '고요한 시위', desc: '집중 중에 쏜 사격은 MP를 소모하지 않습니다.' },
  'ranger.t25a': { nameKo: '매의 눈', desc: '완전히 당긴 사격이 화살 2발을 부채꼴로 추가 발사합니다.' },
  'ranger.t25b': { nameKo: '바람의 춤', desc: '백덤블링 시 기력 15 회복, 완전 당기기 즉시 장전.' },

  'paladin.t1': { nameKo: '수호의 맹세', desc: '막기·패리 4회 또는 적중 8회마다 발밑에 성인(반경 4m, 6초)을 새깁니다. 성인 안: 회복 대기 −50%, 회복 +1%/초, 받는 피해 −10%.' },
  'paladin.t10': { nameKo: '반사의 방패', desc: '완벽 막기가 투사체를 반사합니다.' },
  'paladin.t20': { nameKo: '넓은 성역', desc: '성인 반경 +1.5m, 안의 적에게 초당 성흔 1.' },
  'paladin.t25a': { nameKo: '수호자', desc: '막기 기력 소모 −40%.' },
  'paladin.t25b': { nameKo: '심판관', desc: '성흔 3스택 적에게 망치 내려찍기 시 심판 발동 (심판 대기시간 적용).' },

  'spiritcaller.t1': { nameKo: '정령 동료', desc: '3포인트 이상 투자한 속성마다 정령 동료(최대 2)가 1.6초마다 50% 피해의 기본 탄을 쏩니다.' },
  'spiritcaller.t10': { nameKo: '정령의 숨결', desc: '정령 동료가 사격마다 상태이상을 부여합니다.' },
  'spiritcaller.t20': { nameKo: '세 번째 정령', desc: '정령 동료 슬롯 +1.' },
  'spiritcaller.t25a': { nameKo: '교감의 숲', desc: '정령 동료의 사격이 온전한 위력으로 반응을 일으킵니다.' },
  'spiritcaller.t25b': { nameKo: '수호 정령', desc: '정령 동료가 10초마다 공격 1회를 대신 막습니다.' },

  'shadowblade.t1': { nameKo: '그림자 표식', desc: '타격마다 표식 1(최대 5, 6초). 등 뒤 공격과 충전 공격이 표식당 +12% 그림자 피해로 터뜨립니다. 풀숲을 걸으면 자동 은신.' },
  'shadowblade.t10': { nameKo: '배후 일격', desc: '등 뒤 공격 피해 ×1.3.' },
  'shadowblade.t20': { nameKo: '그림자 순환', desc: '표식 5개를 터뜨리면 충전 공격 대기시간이 초기화됩니다.' },
  'shadowblade.t25a': { nameKo: '처형자', desc: '표식이 체력 12% 미만의 일반 적을 처형합니다.' },
  'shadowblade.t25b': { nameKo: '유령', desc: '완벽 회피 시 2초간 은신.' },
};

/** Talent ids active for a class at a level (+ the Lv25 choice 'a'|'b'). Allocation-light helper for menus. */
export function talentsFor(cls, level, choice = null) {
  const c = CLASS_DEFS[cls]; if (!c) return [];
  const out = [];
  for (const L of [1, 10, 20]) if (level >= L) out.push(c.talents[L]);
  if (level >= 25 && choice) out.push(c.talents[25][choice === 'b' ? 1 : 0]);
  return out;
}

export const CLASSES_API = {
  DEFS: CLASS_DEFS, ids: CLASS_IDS, get: (id) => CLASS_DEFS[id] || null,
  access, familyOf, styleOf, classElements, classesForElement, talentsFor, TALENTS,
};
