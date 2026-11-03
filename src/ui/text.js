// Korean UI text tables (CONTRACT rule 4: player-facing strings live in data tables, not scattered through code).
// Pure data; imported by src/ui.js and src/ui/* only.

export const TYPE_KO = { active: '액티브', ultimate: '궁극기', support: '보조', modifier: '수정자', passive: '패시브', keystone: '핵심', capstone: '각성' };
export const TIER_KO = { 1: 'T1', 2: 'T2', 3: 'T3', 4: 'T4', 5: '각성' };
export const TIER_GATE = { 1: 0, 2: 2, 3: 5, 4: 9, 5: 14 };
export const SLOT_KO = { basic: '기본 공격', charged: '충전 공격', quick: '빠른 슬롯', ultimate: '궁극기', support: '보조', finisher: '필살기' };
export const ACCESS_KO = { primary: '주속성', secondary: '부속성' };
export const MASTERY_KO = { none: '미숙', 입문: '입문', 숙련: '숙련', 전문: '전문', 대가: '대가' };
export const RES_KO = { mp: 'MP', resolve: '투지', stamina: '스태미나' };

/** canLearn / canUnlearn / canEquip reasons → Korean. */
export const REASON_KO = {
  class: '이 직업은 사용할 수 없는 속성입니다', tier: '주속성 전용 단계입니다', gate: '이 트리에 포인트가 더 필요합니다',
  prereq: '선행 노드를 먼저 배우세요', exclusive: '짝 수정자를 이미 선택했습니다 (택1)', points: '스킬 포인트가 부족합니다',
  maxRank: '이미 최대 랭크입니다', story: '정령을 해방하면 개방됩니다', unknown: '알 수 없는 노드', granted: '각인은 되돌릴 수 없습니다',
  dependent: '이 노드에 의존하는 노드가 있습니다', place: '제단이나 정령의 문에서만 초기화할 수 있습니다',
  unlearned: '아직 배우지 않은 스킬입니다', slot: '이 칸에는 장착할 수 없는 스킬입니다', combat: '전투 중에는 장착할 수 없습니다',
  stub: '스킬 시스템을 사용할 수 없습니다', planner: '계획 모드에서는 장착하지 않습니다',
};

/** Equip-slot rows of the quick-slot bar (tree screen) and the keys that equip a hovered node. */
export const EQUIP_SLOTS = [
  { slot: 'q1', key: '1', code: 'Digit1', label: '빠른 1' }, { slot: 'q2', key: '2', code: 'Digit2', label: '빠른 2' },
  { slot: 'q3', key: '3', code: 'Digit3', label: '빠른 3' }, { slot: 'q4', key: '4', code: 'Digit4', label: '빠른 4' },
  { slot: 'ult', key: 'X', code: 'KeyX', label: '궁극기' }, { slot: 'sup', key: 'G', code: 'KeyG', label: '보조' },
];
/** The v3 hotbar (CONTRACT §7.5 slots): order, key label, kind fallback. */
export const HOTBAR3 = [
  { slot: 'basic', key: 'LMB', label: '좌클릭', kind: 'basic' }, { slot: 'charged', key: 'RMB', label: '우클릭', kind: 'heavy' },
  { slot: 'q1', key: '1', label: '1', kind: 'skill' }, { slot: 'q2', key: '2', label: '2', kind: 'skill' },
  { slot: 'q3', key: '3', label: '3', kind: 'skill' }, { slot: 'q4', key: '4', label: '4', kind: 'skill' },
  { slot: 'ult', key: 'X', label: 'X', kind: 'ultimate' }, { slot: 'sup', key: 'G', label: 'G', kind: 'support' },
  { slot: 'fin', key: 'R', label: 'R', kind: 'finisher' },
];
export const KIND_KO = { basic: '기본', heavy: '충전', skill: '스킬', ultimate: '궁극', support: '보조', finisher: '필살' };

/** Reaction codex families (DESIGN §4.5); used when combat.FAMILIES / reaction.family are missing (v2 combat). */
export const FAMILIES_FALLBACK = {
  burst: { nameKo: '폭발', color: '#ff7a3a', members: ['melt', 'shatter', 'overload', 'magma', 'skyslam', 'steam_burst', 'burgeon', 'hyperbloom', 'radiant_burst', 'eclipse'] },
  control: { nameKo: '제어', color: '#8fd8ff', members: ['electrocute', 'superconduct', 'flashfreeze', 'freeze_water', 'mudslide', 'grounded', 'quicken', 'frostbloom', 'entangle'] },
  spread: { nameKo: '확산', color: '#7fffc8', members: ['swirl', 'pollen', 'aurora', 'void_rift', 'updraft', 'fire_wave', 'infusion', 'wildfire'] },
  surface: { nameKo: '표면', color: '#e0b870', members: ['evaporate', 'electro_water', 'obsidian', 'sandstorm', 'fire_tornado', 'blizzard', 'storm_tornado'] },
  blessing: { nameKo: '축복', color: '#ffe08a', members: ['sanctify', 'holywater', 'photosynthesis', 'purify', 'bloom', 'crystallize', 'prism', 'judgment'] },
  curse: { nameKo: '저주', color: '#b98bff', members: ['necroflame', 'miasma', 'rot', 'voidfrost', 'blackbolt'] },
  universal: { nameKo: '보편', color: '#ffffff', members: ['break', 'resonance'] },
};
export const FAMILY_ORDER = ['burst', 'control', 'spread', 'surface', 'blessing', 'curse', 'universal'];
export const FAMILY_BLURB = {
  burst: '두 원소가 부딪혀 터지는 순간의 위력', control: '적을 묶고 얼리고 멈춰 세우는 반응', spread: '바람과 숲이 원소를 퍼뜨리는 반응',
  surface: '땅과 물, 회오리를 바꾸는 반응', blessing: '빛과 생명이 아군을 돕는 반응', curse: '그림자가 적을 갉아먹는 반응',
  universal: '모든 원소에 통하는 보편 법칙',
};

/** HUD strings. */
export const HUD_KO = {
  points: (n) => `스킬 포인트 ${n}`, level: (n) => `Lv ${n}`, nextHit: (n) => `다음 타격: ${n}`,
  levelUpPre: '레벨 업!', levelUpTitle: (L) => `Lv ${L}`, levelUpSub: (p) => (p > 0 ? `스킬 포인트 +${p} · K 스킬 트리` : '능력치가 올랐습니다'),
  xp: (n) => `+${n} XP`, attuneHint: 'Z · 휠', giftPrompt: '정령의 선물', resolve: '투지', mp: 'MP',
  sig: { attunement: '원소 연쇄', enchant: '인챈트', focus: '집중', seal: '수호의 맹세', familiars: '정령 동료', marks: '표식' },
  regen: '회복 중', regenWait: '회복 대기', broken: '붕괴!', voidShield: '공허 장막', weak: '약점',
  check: { stagger: '경직 체크', rods: '피뢰침 체크', tide: '해일 체크' }, checkOk: '성공!', checkFail: '실패',
  lockStripped: '봉인 해제!', resonance: '교향!', resonanceSub: '다음 스킬 무소모 · 피해 +30%',
  breakSub: '적이 무너졌다 — 지금이 기회!',
};
/** Boss cards (payload-driven; these are only the fallbacks and the frame lines). */
export const BOSS_KO = {
  spawnPre: '강적 출현', fallbackName: '강력한 적', defeatPre: '격파', defeatSub: '봉인의 한 조각이 풀렸다',
  finalSub: '세계수에 새벽이 밝아온다', phase: (n) => `${n}단계`,
};
export const VICTORY_KO = {
  pre: (name) => (name ? `${name} 정화` : '세계수의 새벽'), title: '승리', sub: '에테리아에 다시 평화가 찾아왔습니다',
  level: '레벨', cls: '직업', build: '주력 원소', rx: '발견한 반응', time: '플레이 시간', kills: '처치 수', combo: '최대 콤보',
};

/** Tree screen. */
export const TREE_KO = {
  title: '원소 별자리', sub: '아홉 원소의 하늘', points: '남은 포인트', planner: '계획 모드', plannerOn: '계획 모드 — 아무것도 확정되지 않습니다',
  respecHere: '초기화 가능', classChange: '직업 변경', respecNo: '제단에서만 초기화 가능', respecAll: '전체 초기화', back: '별자리로', close: '닫기',
  learn: '배우기', learnPlan: '계획에 추가', unlearn: '되돌리기', unlearnPlan: '계획에서 빼기', equip: '장착', planReset: '계획 초기화',
  planCost: (n) => `계획 포인트 ${n}`, locked: (names) => `${names} 직업만 사용 가능`, secondaryCap: '부속성 — T3까지',
  storyGate: (spirit) => `${spirit}의 정령을 해방하면 개방`, sealGate: '봉인을 해제하면 개방', lumielGate: '루미엘의 깃털이 깨어나면 개방',
  tierRow: (t, n) => (n ? `${t} · ${n}포인트` : t), exclusivePair: '택1', noData: '스킬 데이터를 불러올 수 없습니다',
  rank: (r, m) => `랭크 ${r}/${m}`, cost: (c, ranks) => `비용 ${c}${ranks ? ' / 랭크' : ''}`, mastery: '숙련',
  casterLook: '원거리 직업: 마법·화살·정령탄으로 펼칩니다', meleeLook: '근접 직업: 무기를 휘둘러 같은 효과를 냅니다',
  feeds: '이어지는 반응', modifies: (n) => `수정 대상: ${n}`, grants: '부여하는 스킬', equipHint: '노드에 마우스를 올리고 1~4 · X · G로 장착',
  slotEmpty: '비어 있음', equipped: (slot) => `${slot}에 장착됨`, rejected: '장착할 수 없음',
  learned: (n) => `${n} 습득!`, confirmRespec: '모든 스킬 포인트를 되돌릴까요? (각인은 유지됩니다)',
  current: '현재', next: '다음', resLine: (c, res, cd) => `${res} ${c}${cd ? ` · 재사용 ${cd}초` : ''}`,
};
/** First-open tour (DESIGN §5.6). */
export const TOUR_PAGES = [
  { title: '아홉 원소, 여섯 갈래', body: '별자리의 아홉 원소 중 직업마다 여섯 원소만 다룰 수 있습니다. <b class="g">금빛 테두리</b>는 주속성(각성까지), <b class="s">은빛 테두리</b>는 부속성(T3까지)이며, 사슬에 묶인 원소는 다른 직업의 길입니다.' },
  { title: '별의 단계', body: '트리마다 다섯 단계가 있습니다. 그 트리에 쓴 포인트가 <b>2 · 5 · 9 · 14</b>에 이르면 다음 단계의 룬 고리가 빛나며 열립니다. 포인트는 모든 트리를 채울 만큼 많지 않으니, 무엇에 집중할지 고르세요.' },
  { title: '수정자 택1', body: '스킬마다 두 갈래의 <b>수정자</b>가 있습니다. 하나를 배우면 다른 하나는 잠깁니다 — 제단이나 정령의 문에서 초기화하면 다시 고를 수 있습니다. 배운 스킬은 1~4 · X · G 칸에 장착하세요.' },
];
export const TOUR_KO = { prev: '이전', next: '다음', done: '시작하기', skip: '건너뛰기', page: (i, n) => `${i} / ${n}` };
/** One-time contextual tips (DESIGN §5.6). */
export const TIPS = {
  storyCap: '각성 노드는 이야기 속에서 그 원소의 정령을 해방해야 열립니다. 그 전까지는 T4까지 성장할 수 있습니다.',
  exclusive: '수정자는 둘 중 하나만 고를 수 있습니다. 바꾸려면 제단이나 정령의 문에서 되돌리세요.',
  masteryUp: (el, rk) => `${el} 숙련 등급 상승 — ${rk}! 원소 피해가 늘어납니다.`,
  unspent: '근처의 제단·정령의 문에서 K를 눌러 남은 스킬 포인트를 쓰세요.',
  firstPoint: 'K: 스킬 트리를 열어 첫 포인트를 사용하세요',
};

/** Class panel / character sheet. */
export const CLASS_KO = {
  panelTitle: '여섯 갈래의 길', panelSub: '스승 곁에서 당신의 길을 고르세요', pick: '이 길로 간다', cancel: '돌아가기',
  weapon: '무기', signature: '고유 능력', elements: '다룰 수 있는 원소', confirm: (n) => `${n}의 길을 걷겠습니까? 이후에는 제단에서만 바꿀 수 있습니다.`,
  radar: { hp: '체력', res: '자원', power: '공격', defense: '방어', crit: '치명', move: '기동' },
  family: { caster: '원거리', melee: '근접' },
};
export const CHAR_KO = {
  title: '캐릭터', level: '레벨', xp: '경험치', stats: '능력치', elements: '원소 피해', keystones: '적용 중인 핵심', talents: '직업 특성',
  spirits: '해방한 정령', none: '없음', choose: '선택', chosen: '선택됨', lvReq: (L) => `Lv ${L}`,
  stat: { maxHp: '최대 체력', maxRes: '최대 자원', maxStamina: '스태미나', power: '공격력', defense: '방어', crit: '치명타', move: '이동 속도',
    regenDelay: '회복 대기 (전투)', regenDelayOOC: '회복 대기 (비전투)', regenRate: '회복량 (전투)', regenRateOOC: '회복량 (비전투)' },
  spiritBound: '봉인됨', spiritFree: '해방됨', masteryLine: (rk, pct) => `${rk} · 피해 +${pct}%`, passiveLine: (pct) => `효과 ${pct >= 0 ? '+' : ''}${pct}%`,
};
export const CODEX_KO = {
  title: '원소 도감', rxPage: '원소 반응', skillPage: '배운 스킬', count: (n, t) => `${n} / ${t}`, unknown: '???', hintSuffix: '…?',
  noSkills: '아직 배운 스킬이 없습니다', close: '닫기', tabHint: 'Tab 닫기',
};
export const GATE_KO = {
  title: '정령의 문', sub: '도달한 문으로 순간 이동합니다', here: '현재 위치', unknown: '미발견', travel: '이동', close: '닫기',
  tree: '스킬 트리 (초기화 가능)', classChange: '직업 변경',
};
export const CONFIRM_KO = { yes: '예', no: '아니오' };

/** Controls panel rows (v3 key map, CONTRACT §6). */
export const CONTROLS = {
  move: [
    ['W A S D', '이동'], ['Shift', '달리기 (스태미나 소모)'], ['Space', '점프 · 공중에서 꾹 눌러 활공'],
    ['Q', '회피 — 직업마다 다름 (순간이동 · 질풍보 · 백덤블링 …)'], ['E 길게', '방어 — 타이밍을 맞추면 간파 · 반사'],
  ],
  combat: [
    ['좌클릭', '기본 공격 (조율된 원소)'], ['우클릭 길게', '충전 공격 — 놓으면 발동'], ['1~4', '빠른 슬롯 스킬'],
    ['X', '궁극기'], ['G', '보조 스킬'], ['R', '필살기 — 각성 게이지가 차면'], ['Z · 휠', '원소 조율 (전환)'], ['V', '정령의 선물 (최종 결전)'],
  ],
  menu: [['F', '상호작용'], ['K', '스킬 트리'], ['C', '캐릭터'], ['Tab', '원소 도감'], ['Esc', '일시정지 · 메뉴'], ['M', '음소거']],
  tip: '원소를 겹쳐 맞히면 반응이 일어납니다 — 젖은 적에게 번개! 스킬을 쓰면 그 원소로 자동 조율되어 좌클릭·우클릭도 따라 바뀝니다.',
};

/** Tutorial toasts (v3 key map), per class family; queued after the class is chosen. */
export const TUT = {
  caster: ['좌클릭: 기본 공격 · 우클릭 길게: 충전 공격 · 1~4: 빠른 슬롯 · X: 궁극기', 'Q: 회피 · E 길게: 방어 — 맞기 직전에 펼치면 반사합니다'],
  melee: ['좌클릭: 연속 베기 · 우클릭 길게: 충전 베기 · 1~4: 빠른 슬롯 · X: 궁극기', 'Q: 회피 · E 길게: 막기 — 타이밍을 맞추면 간파!', '스킬은 투지를 씁니다 — 적을 때리면 투지가 차오릅니다'],
  all: ['Z / 휠: 원소 조율 — 원소를 엮어 반응을 일으키세요! K: 스킬 트리 · C: 캐릭터 · Tab: 원소 도감'],
  awaken: ['G: 보조 스킬 · 적에게 피해를 주어 각성 게이지를 채우면 R: 필살기!'],
  start: ['WASD 이동 · Shift 달리기 · Space 점프 (공중에서 꾹 누르면 활공)', '마을 사람 가까이에서 F 대화하기 · 나침반의 표식을 따라가세요'],
  updraft: '불타는 풀 위에서 Space를 꾹 — 상승 기류를 타고 높이 날아오르세요',
  training: '스승의 지시를 따라 수련하세요 — 진행 상황은 오른쪽 위 임무 창에 표시됩니다',
  dummy: { caster: '수련용 허수아비 — 스킬을 시험해 보세요. 젖게 한 뒤 번개를 맞혀 보세요!', melee: '수련용 허수아비 — 연속 베기와 충전 베기를 시험해 보세요' },
};
/** Defense labels when the player does not provide kit names (by family). */
export const DEF_KO = { dodge: { caster: '회피', melee: '회피' }, defend: { caster: '방벽', melee: '막기' }, parry: { caster: ['반사!', 'PERFECT BARRIER'], melee: ['간파!', 'PERFECT PARRY'] }, block: { caster: '방벽으로 막음', melee: '막기!' } };
