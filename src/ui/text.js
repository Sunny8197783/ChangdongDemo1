// Korean UI text tables (CONTRACT rule 4: player-facing strings live in data tables, not scattered through code).
// Pure data; imported by src/ui.js and src/ui/* only.

export const TYPE_KO = { active: '액티브', ultimate: '궁극기', support: '보조', modifier: '강화', passive: '패시브', keystone: '핵심 특성', capstone: '각성' };
export const TIER_KO = { 1: '1단계', 2: '2단계', 3: '3단계', 4: '4단계', 5: '각성' };
export const TIER_GATE = { 1: 0, 2: 2, 3: 5, 4: 9, 5: 14 };
export const SLOT_KO = { basic: '기본 공격', charged: '충전 공격', quick: '빠른 슬롯', ultimate: '궁극기', support: '보조', finisher: '필살기' };
export const ACCESS_KO = { primary: '주속성', secondary: '부속성' };
export const MASTERY_KO = { none: '미숙', 입문: '입문', 숙련: '숙련', 전문: '전문', 대가: '대가' };
export const RES_KO = { mp: '마나', resolve: '투지', stamina: '스태미나' };

/** canLearn / canUnlearn / canEquip reasons → Korean. */
export const REASON_KO = {
  class: '이 직업은 사용할 수 없는 속성입니다', tier: '주속성 전용 단계입니다', gate: '이 트리에 포인트가 더 필요합니다',
  prereq: '선행 노드를 먼저 배우세요', exclusive: '짝 강화를 이미 선택했습니다 (둘 중 하나)', points: '스킬 포인트가 부족합니다',
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
  levelUpPre: '레벨 업!', levelUpTitle: (L) => `Lv ${L}`, levelUpSub: (p) => (p > 0 ? `스킬 포인트 +${p} · {skillsKey} 스킬 트리` : '능력치가 올랐습니다'),
  xp: (n) => `+${n} 경험치`, combo: '연격', attuneHint: 'Z · 휠', giftPrompt: '정령의 선물', resolve: '투지', mp: '마나',
  sig: { attunement: '원소 연쇄', enchant: '인챈트', focus: '집중', seal: '수호의 맹세', familiars: '정령 동료', marks: '표식' },
  regen: '회복 중', regenWait: '회복 대기', broken: '붕괴!', voidShield: '공허 장막', weak: '약점',
  check: { stagger: '빈틈 만들기 — 큰 피해를 몰아넣으세요', rods: '피뢰침 — 번개 머리를 먼저 공격', tide: '해일 — 초록 안전 표시 위로 올라가세요', freeze: '빙판 생성 — 지금 머리를 공격하세요', kalis: '결정 깨기 — 빛나는 결정 3개를 부수세요' }, checkOk: '성공!', checkFail: '실패',
  lockStripped: '봉인 해제!', resonance: '교향!', resonanceSub: '다음 스킬 무소모 · 피해 +30%',
  breakSub: '적이 무너졌다 — 지금이 기회!',
};
/** Boss cards (payload-driven; these are only the fallbacks and the frame lines). */
export const BOSS_KO = {
  counters: '이 원소로 공격하면 장막이 벗겨집니다',
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
  planCost: (n) => `계획 포인트 ${n}`, locked: (names) => `${names} 직업만 사용 가능`, secondaryCap: '부속성 — 3단계까지',
  storyGate: (spirit) => `${spirit}의 정령을 해방하면 개방`, sealGate: '봉인을 해제하면 개방', lumielGate: '루미엘의 깃털이 깨어나면 개방',
  tierRow: (t, n) => (n ? `${t} · ${n}포인트` : t), exclusivePair: '둘 중 하나', noData: '스킬 데이터를 불러올 수 없습니다',
  rank: (r, m) => `랭크 ${r}/${m}`, cost: (c, ranks) => `비용 ${c}${ranks ? ' / 랭크' : ''}`, mastery: '숙련',
  casterLook: '원거리 직업: 마법·화살·정령탄으로 펼칩니다', meleeLook: '근접 직업: 무기를 휘둘러 같은 효과를 냅니다',
  feeds: '이어지는 반응', modifies: (n) => `수정 대상: ${n}`, grants: '부여하는 스킬', equipHint: '노드를 고른 뒤 아래 슬롯을 클릭하세요',
  slotEmpty: '비어 있음', equipped: (slot) => `${slot}에 장착됨`, rejected: '장착할 수 없음',
  learned: (n) => `${n} 습득!`, confirmRespec: '모든 스킬 포인트를 되돌릴까요? (각인은 유지됩니다)',
  current: '현재', next: '다음', resLine: (c, res, cd) => `${res} ${c}${cd ? ` · 재사용 ${cd}초` : ''}`,
};
/** First-open tour (DESIGN §5.6). */
export const TOUR_PAGES = [
  { title: '아홉 원소, 여섯 갈래', body: '별자리의 아홉 원소 중 직업마다 여섯 원소만 다룰 수 있습니다. <b class="g">금빛 테두리</b>는 주속성(각성까지), <b class="s">은빛 테두리</b>는 부속성(3단계까지)이며, 사슬에 묶인 원소는 다른 직업의 길입니다.' },
  { title: '별의 단계', body: '트리마다 다섯 단계가 있습니다. 그 트리에 쓴 포인트가 <b>2 · 5 · 9 · 14</b>에 이르면 다음 단계의 룬 고리가 빛나며 열립니다. 포인트는 모든 트리를 채울 만큼 많지 않으니, 무엇에 집중할지 고르세요.' },
  { title: '강화는 둘 중 하나', body: '스킬마다 두 갈래의 <b>강화</b>가 있습니다. 하나를 배우면 다른 하나는 잠깁니다 — 제단이나 정령의 문에서 초기화하면 다시 고를 수 있습니다. 배운 스킬은 1~4 · X · G 칸에 장착하세요.' },
];
export const TOUR_KO = { prev: '이전', next: '다음', done: '시작하기', skip: '건너뛰기', page: (i, n) => `${i} / ${n}` };
/** One-time contextual tips (DESIGN §5.6). */
export const TIPS = {
  storyCap: '각성 노드는 이야기 속에서 그 원소의 정령을 해방해야 열립니다. 그 전까지는 T4까지 성장할 수 있습니다.',
  exclusive: '강화는 둘 중 하나만 고를 수 있습니다. 바꾸려면 제단이나 정령의 문에서 되돌리세요.',
  masteryUp: (el, rk) => `${el} 숙련 등급 상승 — ${rk}! 원소 피해가 늘어납니다.`,
  unspent: '{skillsKey}를 눌러 어디서든 배울 수 있어요 (초기화만 제단에서).',
  firstPoint: '{skillsKey}: 스킬 트리를 열어 첫 포인트를 사용하세요',
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
  title: '도감', rxPage: '원소', monPage: '몬스터', skillPage: '배운 스킬', count: (n, t) => `${n} / ${t}`, unknown: '???', hintSuffix: '…?',
  noSkills: '아직 배운 스킬이 없습니다', close: '닫기', tabHint: '{codexKey} 닫기',
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

/** Defense labels when the player does not provide kit names (by family). */
export const DEF_KO = { dodge: { caster: '회피', melee: '회피' }, defend: { caster: '방벽', melee: '막기' }, parry: { caster: ['완벽 방벽!', '반사'], melee: ['완벽 패링!', '간파'] }, block: { caster: '방벽으로 막음', melee: '막기!' } };

// ==================================================================================================== v4 (PLAN §6)
/**
 * §6.11 templated copy: replaces {token} with ctx[token] (missing tokens stay visible as their name without braces is
 * never wanted, so they resolve to ''). Pure; the ui builds ctx from game.input.keymap / the kit / live values.
 */
export function fmtKo(text, ctx) {
  if (typeof text !== 'string' || text.indexOf('{') < 0) return text == null ? '' : String(text);
  // a duration with no live value never prints as a blank ('… 초 동안'): the phrase is dropped ('세 번째 공격 뒤 반격 기회')
  if (ctx && ctx.punishSec === '') text = text.replace(/\{punishSec\}\s*초\s*동안\s*/g, '').replace(/\{punishSec\}\s*초\s*/g, '');
  return text.replace(/\{(\w+)\}/g, (m, k) => (ctx && ctx[k] != null ? String(ctx[k]) : m));
}
/** Keymap actions behind each key token (§6.11). */
export const KEY_TOKENS = {
  dodgeKey: 'dodge', defendKey: 'defend', jumpKey: 'jump', sprintKey: 'sprint', interactKey: 'interact',
  skillsKey: 'skills', codexKey: 'codex', confirmKey: 'confirm',
};
/** Defend types that can parry (§6.11 can-parry rule; plus perfect window > 0). */
export const PARRY_TYPES = ['barrier', 'guard', 'shield', 'counter'];

/** §6.2 hint catalogue. `b` = variant B (the class's defend cannot parry). Tokens only, never literal key names. */
export const HINTS_KO = {
  move_sprint: '{sprintKey}를 누르고 있으면 달립니다.',
  tell_danger: '빨간 영역이 차오르면 공격이 옵니다. 가득 차기 직전에 {dodgeKey}로 회피!',
  tell_parry: '금빛 = 패링할 수 있는 공격. 그 순간 {defendKey}를 누르면 패링!',
  tell_parry_b: '금빛 = 패링할 수 있는 공격. 이 직업은 {dodgeKey}로 피하세요.',
  tell_unblockable: '⚠ 분홍색 경고는 막을 수 없습니다. 반드시 피하세요!',
  tell_jump: '⤒ 표시: 원이 다 차면 충격파가 퍼져요. 파동이 닿기 직전에 {jumpKey}로 점프!',
  punish: '◆ 반짝임 = 공격 기회! 지금 몰아치세요.',
  projectile: '구슬은 잠깐만 따라옵니다. 옆으로 달리거나 {defendKey} 완벽 방어로 되받아치세요.',
  projectile_b: '구슬은 잠깐만 따라옵니다. 옆으로 달리면 빗나가요.',
  front_guard: '정면 방어 중! 뒤로 돌아가 공격하세요.',
  offscreen: '화면 가장자리의 화살표 = 보이지 않는 곳의 공격.',
  weakness: '적 체력 바의 아이콘 = 약점 원소. 약점으로 공격하면 더 아파요.',
  hazard: '붉은 빗금 구역에서는 계속 피해를 입습니다. 벗어나세요!',
  // basic hits do NOT restore MP in this build (MP regenerates after a short delay; player/resource.js), so variant B is used
  mp_low: '마력이 부족해요. 기본 공격으로 마력을 회복하세요.',
  mp_low_b: '마력이 부족해요. 잠시 기다리면 마력이 차올라요.',
  unspent: '{skillsKey}를 눌러 어디서든 배울 수 있어요 (초기화만 제단에서).',
  equip: '노드를 고른 뒤 아래 슬롯을 클릭하거나 1~4 · X · G로 장착하세요.',
  codex: '{codexKey} → 도감의 몬스터 탭에서 공략을 다시 볼 수 있어요.',
  legend: '위험 표시가 헷갈리면 가이드 → 위험 표시 읽는 법을 보세요.',
  // training lesson (§6.1)
  lesson_danger: '빨간 영역이 가득 차기 직전에 {dodgeKey}로 회피!',
  lesson_parry: '금빛 = 패링할 수 있는 공격. 가득 차기 직전에 {defendKey}!',
  lesson_parry_b: '금빛 공격도 {dodgeKey}로 피할 수 있어요.',
};
/** Hints allowed during boss fights (§6.2 rules). */
export const BOSS_HINTS = ['tell_danger', 'tell_parry', 'tell_unblockable', 'tell_jump', 'punish', 'projectile', 'hazard'];

/** §6.10 perfect callouts. */
export const CALLOUT_KO = { dodge: '완벽 회피!', parry: '완벽 패링!', barrier: '완벽 방벽!', dodgeSub: '반격의 기회', punish: '공격 기회!', broken: '붕괴!', brokenSub: '지금 큰 피해를 몰아넣으세요' };

/** §6.5 몬스터 도감 + encounters + boss brief. */
export const MCODEX_KO = {
  unknown: '???', unknownTip: '아직 만나지 못한 적', role: '역할', weak: '약점', resist: '저항', immune: '면역', tip: '공략', attacks: '공격',
  attackHead: '이름 — 예고 — 대처', kills: (n) => `처치 수 ${n}`, locked: '처치하면 공격 정보가 열립니다', boss: '보스', elite: '정예',
  count: (n, t) => `${n} / ${t}`, strip: (name) => `새로운 적: ${name} — 도감에 기록됨`, cardPre: '새로운 적', cardTitle: (name) => `새로운 적 — ${name}`,
  counterPre: '대처', parryPre: '패링', punishPre: '반격', briefPre: '공략', briefKey: '아무 키나 눌러 닫기', weakPoint: '약점 부위',
};
/** §6.4 가이드. */
export const GUIDE_KO = {
  title: '가이드', tab: '가이드', controls: '핵심 조작', advanced: '고급', legend: '위험 표시 읽는 법', dodge: '회피와 방어', reactions: '원소 반응 기초',
  objective: '현재 목표', noObjective: '지금은 정해진 목표가 없어요', codexLink: '몬스터 도감 열기', close: '닫기',
  timing: '영역이 가득 차기 직전 = 완벽 회피', timingSub: '흰빛으로 바뀐 앞부분이 바깥 테두리에 닿기 직전에 {dodgeKey}',
  parryLine: '금빛 공격은 가득 차기 직전에 {defendKey}로 패링할 수 있어요.', parryLineB: '이 직업은 패링 대신 {dodgeKey}로 피하세요. 금빛 공격도 똑같이 피할 수 있어요.',
  defendLine: '{defendName} ({defendKey}): 정면 공격을 막아 피해를 줄입니다.', dodgeLine: '{dodgeName} ({dodgeKey}): 짧은 무적 시간 동안 공격을 흘려보냅니다.',
  rows: [
    ['move', '이동', 'W A S D'], ['look', '시점', '마우스'], ['jump', '점프', '{jumpKey}'], ['sprint', '달리기', '{sprintKey}'],
    ['dodge', '회피', '{dodgeKey}'], ['defend', '방어', '{defendKey}'], ['attack', '공격', '마우스 왼쪽 · 오른쪽 길게'],
    ['skills', '1~4 스킬', '1 2 3 4'], ['ult', 'X 궁극기', 'X'], ['interact', '상호작용', '{interactKey}'],
  ],
  advRows: [['tree', '스킬 트리', '{skillsKey}'], ['codex', '도감', '{codexKey}'], ['attune', '원소 조율', 'Z · 휠'], ['sup', '보조 · 필살기', 'G · R'], ['pause', '일시정지', 'Esc']],
};
/** §6.4 원소 반응 기초: the 6 most useful reactions per element pair, plain words. Picked by the class's elements. */
export const RX_BASICS_KO = [
  { els: ['fire', 'ice'], t: '용해: 화염 + 빙결 → 큰 피해 1회' },
  { els: ['water', 'lightning'], t: '감전: 물 + 번개 → 주변으로 번지는 전기 피해' },
  { els: ['water', 'ice'], t: '빙결: 물 + 빙결 → 적을 잠시 얼림' },
  { els: ['fire', 'lightning'], t: '과부하: 화염 + 번개 → 폭발과 넉백' },
  { els: ['wind', 'fire'], t: '확산: 바람 + 원소 → 그 원소를 주변 적에게 퍼뜨림' },
  { els: ['earth', 'water'], t: '진흙: 대지 + 물 → 적이 느려짐' },
  { els: ['nature', 'water'], t: '개화: 자연 + 물 → 터지는 씨앗 피해' },
  { els: ['light', 'shadow'], t: '일식: 빛 + 그림자 → 강한 폭발 1회' },
  { els: ['ice', 'earth'], t: '분쇄: 얼어붙은 적 + 대지 → 큰 피해' },
  { els: ['light', 'water'], t: '성수: 빛 + 물 → 아군 회복' },
  { els: ['shadow', 'fire'], t: '흑염: 그림자 + 화염 → 지속 피해' },
  { els: ['nature', 'fire'], t: '들불: 자연 + 화염 → 번지는 불길' },
];
/** §6.6 reaction-family descriptions (tooltips in the tree and codex). */
export const RX_DESC_KO = {
  burst: '두 원소가 부딪혀 한 번에 큰 피해를 줍니다.', control: '적을 묶거나 얼려 잠시 움직이지 못하게 합니다.',
  spread: '원소를 주변 적에게 퍼뜨립니다.', surface: '땅이나 물 위에 오래 남는 지대를 만듭니다.',
  blessing: '아군을 회복하거나 강하게 합니다.', curse: '적을 약하게 만들고 지속 피해를 줍니다.', universal: '어떤 원소로도 일으킬 수 있습니다.',
};
/** §6.7 death recap. */
export const RECAP_KO = {
  title: '쓰러졌다', killed: (src, atk, amt) => `「${src}${atk ? ' · ' + atk : ''}」에 쓰러졌습니다 (${amt} 피해)`, unknown: '알 수 없는 공격',
  hit: (sec, src, atk, amt) => `-${sec}초 · ${src}${atk ? ' · ' + atk : ''} · ${amt}`, group: (name, n, amt) => `${name} ×${n} · ${amt}`,
  tipPre: '공략', respawn: (where) => `부활 위치: ${where}`, respawnDefault: '마을 광장', lastHits: '마지막 피해',
  btnRespawn: '다시 일어서기 ({confirmKey})', btnAssist: '보조 기능 조정', btnCodex: '몬스터 도감 보기', btnLegend: '위험 표시 보기',
  suggestEasy: '쉬움으로 바꿀까요? (언제든 되돌릴 수 있어요)', revived: (src) => `쓰러졌지만 다시 일어섰어요 — 「${src}」`, counting: (n) => `${n}초 후 부활`, reviving: '부활 중...',
};
/** §5.6 hazard edge vignette labels. */
export const HAZARD_KO = { icon: { fire: '🔥', nature: '☁', shadow: '☠', water: '💧', lightning: '⚡', ice: '❄', earth: '⛰', light: '✦', wind: '🌀' }, defaultIcon: '⚠', on: (name) => `${name} 위`, name: '위험 지대' };
/** §6.1 onboarding. */
export const ONBOARD_KO = {
  diffTitle: '난이도', introTitle: '오프닝', introShort: '짧게 (약 25초)', introFull: '전체', start: '모험 시작', back: '돌아가기',
  recommended: '입문 추천', changeLater: '레벨은 유지된 채 제단에서 언제든 바꿀 수 있어요', more: '자세히', stars: '난이도',
  clickToContinue: '클릭하여 계속', skipDialogue: '대화 건너뛰기', skipDialogueQ: '대화를 건너뛸까요?', ffHint: '{confirmKey} / F / 클릭 — 계속 · 길게 누르면 빨리 넘기기 · Esc 건너뛰기',
};
/** §6.1 class one-liners (templated) + stars (keyed by kit dodge type: no class literals in ui files, rule 8). */
export const CLASS_LINE_KO = {
  blink: '멀리서 원소 마법을 쏘고, 위험하면 {dodgeKey} 점멸로 빠지세요.',
  dashstep: '가까이 붙어 연속 베기, 금빛 공격은 {defendKey}로 패링!',
  backflip: '거리를 두고 활을 당기세요. 공중에서 {defendKey}로 시간을 늦출 수 있어요.',
  shieldstep: '방패로 막으며 버티는 수호자. 막기만 잘해도 강해요.',
  spiritswap: '정령과 함께 싸우는 지원형. 소환수가 시선을 끌어 줍니다.',
  shadowroll: '빠르게 구르며 등 뒤를 노리는 고수용 클래스.',
};
export const CLASS_STARS = { blink: 1, shieldstep: 1, backflip: 2, spiritswap: 2, dashstep: 2, shadowroll: 3 };
export const CLASS_BEGINNER = ['blink', 'shieldstep'];
/** §6.8 settings menu extras (core holds the key labels). */
export const SETTINGS_UI_KO = {
  title: '설정', close: '닫기', reset: '기본값 복원', saved: '설정은 자동으로 저장됩니다', difficulty: '난이도', sound: '소리', mouse: '마우스',
  volMaster: '전체 볼륨', volMusic: '음악', volSfx: '효과음', mouseSens: '마우스 감도', invertY: 'Y축 반전', rebind: '바꾸기', rebindWait: '키를 누르세요…',
  benchRun: '측정 중… ({s}초)', benchTitle: '성능 테스트 결과', avg: '평균', low1: '1% 최저', level: '자동 품질', render: '렌더', gpu: 'GPU', copied: '복사했습니다',
  fps: (f, L, w, h) => `${f} fps · 자동 품질 L${L} · 렌더 ${w}×${h}`, offerLowered: '성능을 위해 그래픽 품질을 낮췄어요', advanced: '세부 그래픽',
};
/** §6.6 build help. */
export const BUILD_KO = { recommended: '추천', auto: (names, slot) => `자동 배분: ${names}${slot ? ' · ' + slot : ''}`, slotEquip: (n) => `${n}번 슬롯 장착`, why: '왜 못 배우지?' };
/** §6.9 HUD. */
export const HUD4_KO = { xpTotal: (n) => `+${n} 경험치`, more: (n) => `+${n}` };
