// Reaction registry + engine (CONTRACT §8.2, DESIGN §4.2–4.5). Owner: combat.
// REACTION_DEFS: 49 named reactions (variants share an id). Every entry has `family` and `p` (0 = P0, 1 = P1).
// Index at load: BY_TRIGGER[el][auraKey] → entries; BY_OBJECT[kind][el] → entry (objects + zones). No linear scans per hit.
// Priority (DESIGN §4.5): object > zone fusion (reactObject, never consumes the target's reaction) > newest aura > judgment.
// Gameplay effects live in HANDLERS[id](ctx); visuals are vfx.preset('rx_<id>') (parametric family recipes, presets2.js).
// Cascades (pod → pod, chains, eclipse) go through a staggered queue (0.08–0.12 s, ≤ 3 cascade items per frame).
import * as THREE from 'three';
import { elColor, elName } from '../core/elements.js';

// ---------------------------------------------------------------- data
// match: { trigger: el | [el], aura: [statusKeys] | object/zone: kind, heavy?: true }
// consume: statuses removed on fire (whole status, stacks included). opposite (상극): aura always fully removed.
const D = (o) => o;
export const REACTION_DEFS = [
  // ---- A. existing 19 (ids / names / behaviour kept; order kept for the codex) ----
  D({ id: 'melt', nameKo: '융해', family: 'burst', p: 0, elements: ['fire', 'ice'], opposite: true,
    desc: '냉기·빙결 상태의 적에게 화염 — 2배 피해, 얼음이 녹아 적이 젖음 (빙결 → 화상은 1.6배)',
    match: { trigger: 'fire', aura: ['frozen', 'chilled'] }, mult: 2.0, consume: ['frozen', 'chilled'], apply: { wet: 5 }, skipStatus: true, surface: 'meltIce' }),
  D({ id: 'melt', variant: 'ice', family: 'burst', p: 0, elements: ['ice', 'fire'], opposite: true,
    match: { trigger: 'ice', aura: ['burning'] }, mult: 1.6, consume: ['burning'], apply: { wet: 4 }, skipStatus: true }),
  D({ id: 'shatter', nameKo: '파쇄', family: 'burst', p: 0, elements: ['earth', 'ice'],
    desc: '빙결된 적에게 대지/강한 일격 — 3배 피해, 얼음 파편이 튀어 주변에 피해, 붕괴 +30',
    match: { trigger: 'earth', aura: ['frozen'] }, mult: 3.0, consume: ['frozen', 'chilled'], skipStatus: true }),
  D({ id: 'shatter', variant: 'heavy', family: 'burst', p: 0, elements: ['physical', 'ice'],
    match: { trigger: ['physical', 'wind'], aura: ['frozen'], heavy: true }, mult: 3.0, consume: ['frozen', 'chilled'], skipStatus: true }),
  D({ id: 'electrocute', nameKo: '감전', family: 'control', p: 0, elements: ['lightning', 'water'],
    desc: '젖은 적에게 번개 — 1.5배 피해와 기절, 9m 안의 젖은 적 최대 4명에게 전이',
    match: { trigger: 'lightning', aura: ['wet'] }, mult: 1.5, consume: ['wet'], apply: { stunned: 1.5 } }),
  D({ id: 'electrocute', variant: 'water', family: 'control', p: 0, elements: ['water', 'lightning'],
    match: { trigger: 'water', aura: ['shocked'] }, mult: 1.5, consume: ['shocked'], apply: { stunned: 1.5 } }),
  D({ id: 'superconduct', nameKo: '초전도', family: 'control', p: 0, elements: ['lightning', 'ice'],
    desc: '냉기 상태의 적에게 번개 — 서리 번개 폭발, 받는 피해 30% 증가 (노출)',
    match: { trigger: 'lightning', aura: ['chilled', 'frozen'] }, mult: 1.25, consume: ['chilled'], apply: { exposed: 6 } }),
  D({ id: 'superconduct', variant: 'ice', family: 'control', p: 0, elements: ['ice', 'lightning'],
    match: { trigger: 'ice', aura: ['shocked'] }, mult: 1.25, consume: ['shocked'], apply: { exposed: 6 } }),
  D({ id: 'overload', nameKo: '과부하', family: 'burst', p: 0, elements: ['lightning', 'fire'],
    desc: '화염과 번개의 충돌 — 거대한 폭발과 강한 넉백, 주변 풀에 불이 붙음',
    match: { trigger: 'lightning', aura: ['burning'] }, mult: 1.6, consume: ['burning', 'shocked'] }),
  D({ id: 'overload', variant: 'fire', family: 'burst', p: 0, elements: ['fire', 'lightning'],
    match: { trigger: 'fire', aura: ['shocked'] }, mult: 1.6, consume: ['burning', 'shocked'] }),
  D({ id: 'swirl', nameKo: '확산', family: 'spread', p: 0, elements: ['wind', 'fire'], swirl: true,
    desc: '바람이 원소 상태를 휘감아 7m 안의 적에게 퍼뜨림',
    match: { trigger: 'wind', aura: ['burning', 'chilled', 'frozen', 'shocked', 'wet'] }, mult: 1.2 }),
  D({ id: 'magma', nameKo: '용암 분출', family: 'burst', p: 0, elements: ['earth', 'fire'],
    desc: '불타는 적에게 대지 (또는 석화된 적에게 화염) — 용암이 솟구쳐 띄우고 용암 지대를 남김',
    match: { trigger: 'earth', aura: ['burning'] }, mult: 1.3, consume: ['burning'] }),
  D({ id: 'magma', variant: 'fire', family: 'burst', p: 0, elements: ['fire', 'earth'],
    match: { trigger: 'fire', aura: ['encrusted'] }, mult: 1.3, consume: ['encrusted'] }),
  D({ id: 'flashfreeze', nameKo: '순간 빙결', family: 'control', p: 0, elements: ['ice', 'water'],
    desc: '젖은 적에게 냉기 (또는 냉기 상태에 물) — 즉시 얼어붙음',
    match: { trigger: 'ice', aura: ['wet'] }, mult: 1.2, consume: ['wet'], apply: { frozen: 2.5 }, skipStatus: true }),
  D({ id: 'flashfreeze', variant: 'water', family: 'control', p: 0, elements: ['water', 'ice'],
    match: { trigger: 'water', aura: ['chilled'] }, mult: 1.2, consume: ['chilled'], apply: { frozen: 2.5 }, skipStatus: true }),
  D({ id: 'evaporate', nameKo: '증발', family: 'surface', p: 0, elements: ['fire', 'water'], opposite: true,
    desc: '젖은 적에게 화염 — 1.3배 피해와 시야를 가리는 증기 구름 (불타는 적에게 물은 불을 끄며 1.2배)',
    match: { trigger: 'fire', aura: ['wet'] }, mult: 1.3, consume: ['wet'], skipStatus: true }),
  D({ id: 'evaporate', variant: 'water', family: 'surface', p: 0, elements: ['water', 'fire'], opposite: true,
    match: { trigger: 'water', aura: ['burning'] }, mult: 1.2, consume: ['burning'], skipStatus: true }),
  D({ id: 'skyslam', nameKo: '공중 강타', family: 'burst', p: 0, elements: ['earth', 'wind'],
    desc: '공중에 뜬 적에게 대지 — 땅으로 내리꽂는 1.8배 피해와 충격파',
    match: { trigger: 'earth', aura: ['airborne'] }, mult: 1.8, consume: ['airborne'] }),
  D({ id: 'updraft', nameKo: '상승 돌풍', family: 'spread', p: 0, elements: ['wind', 'wind'],
    desc: '공중에 뜬 적에게 바람 — 더 높이 띄워 올림',
    match: { trigger: 'wind', aura: ['airborne'] }, mult: 1.3 }),
  D({ id: 'fire_tornado', nameKo: '화염 회오리', family: 'surface', p: 0, elements: ['wind', 'fire'], fusion: true,
    desc: '회오리에 화염을 더하면 불타는 회오리로 변신', match: { trigger: 'fire', zone: 'tornado' } }),
  D({ id: 'blizzard', nameKo: '눈보라', family: 'surface', p: 0, elements: ['wind', 'ice'], fusion: true,
    desc: '회오리에 냉기를 더하면 모든 것을 얼리는 눈보라', match: { trigger: 'ice', zone: 'tornado' } }),
  D({ id: 'storm_tornado', nameKo: '뇌전 회오리', family: 'surface', p: 0, elements: ['wind', 'lightning'], fusion: true,
    desc: '회오리에 번개를 더하면 번개를 뿜는 폭풍', match: { trigger: 'lightning', zone: 'tornado' } }),
  D({ id: 'steam_burst', nameKo: '증기 폭발', family: 'burst', p: 0, elements: ['fire', 'ice'], fusion: true,
    desc: '얼음 지대에 화염 (또는 용암에 냉기) — 증기 폭발 후 물웅덩이가 됨', match: { trigger: 'fire', zone: 'ice' } }),
  D({ id: 'steam_burst', variant: 'lava', family: 'burst', p: 0, elements: ['ice', 'fire'], fusion: true, match: { trigger: 'ice', zone: 'lava' } }),
  D({ id: 'electro_water', nameKo: '전기 수면', family: 'surface', p: 0, elements: ['lightning', 'water'], fusion: true,
    desc: '물웅덩이·비구름에 번개 — 물 속의 모든 적을 감전', match: { trigger: 'lightning', zone: 'water' } }),
  D({ id: 'freeze_water', nameKo: '수면 빙결', family: 'control', p: 0, elements: ['ice', 'water'], fusion: true,
    desc: '물웅덩이에 냉기 — 얼음 지대로 얼려 안의 적을 빙결', match: { trigger: 'ice', zone: 'water' } }),
  D({ id: 'fire_wave', nameKo: '화염 파도', family: 'spread', p: 0, elements: ['wind', 'fire'], fusion: true,
    desc: '바람 마법이 화염 지대를 지나면 불길이 앞으로 번짐', match: { trigger: 'wind', zone: 'fire' } }),
  D({ id: 'infusion', nameKo: '원소 부여', family: 'spread', p: 0, elements: ['fire', 'earth'], fusion: true,
    desc: '투사체가 원소 지대를 통과하면 그 원소를 머금음 (9속성 모두)', match: { trigger: '*', zone: 'element' } }),

  // ---- B. water / earth ----
  D({ id: 'mudslide', nameKo: '진흙 늪', family: 'control', p: 0, elements: ['earth', 'water'],
    desc: '젖은 적에게 대지 (석화에 물, 웅덩이에 대지) — 진흙 늪: 이동 −45%, 회피·도약 불가, 무거운 적은 1초 속박',
    match: { trigger: 'earth', aura: ['wet'] }, mult: 1.2, consume: ['wet'] }),
  D({ id: 'mudslide', variant: 'water', family: 'control', p: 0, elements: ['water', 'earth'],
    match: { trigger: 'water', aura: ['encrusted'] }, mult: 1.2, consume: ['encrusted'] }),
  D({ id: 'mudslide', variant: 'puddle', family: 'control', p: 0, elements: ['earth', 'water'], match: { trigger: 'earth', zone: 'water' } }),
  D({ id: 'crystallize', nameKo: '결정화', family: 'blessing', p: 0, elements: ['earth', 'ice'],
    desc: '냉기·성흔·침식 상태의 적에게 대지 — 그 속성의 결정 조각을 떨어뜨림 (보호막 + 다음 스킬 +20%)',
    match: { trigger: 'earth', aura: ['chilled', 'radiant', 'corroded'] }, mult: 1.0 }),
  D({ id: 'grounded', nameKo: '접지', family: 'control', p: 1, elements: ['earth', 'lightning'], opposite: true,
    desc: '감전에 대지 / 석화에 번개 (상극) — 상태 제거, 1.2배, 붕괴 +25, 3초간 번개 저항 50%',
    match: { trigger: 'earth', aura: ['shocked'] }, mult: 1.2, consume: ['shocked'] }),
  D({ id: 'grounded', variant: 'lightning', family: 'control', p: 1, elements: ['lightning', 'earth'], opposite: true,
    match: { trigger: 'lightning', aura: ['encrusted'] }, mult: 1.2, consume: ['encrusted'] }),
  D({ id: 'sandstorm', nameKo: '모래폭풍', family: 'surface', p: 1, elements: ['wind', 'earth'],
    desc: '석화된 적에게 바람 — 4초간 떠도는 모래 소용돌이: 눈부심, 0.5초마다 피해',
    match: { trigger: 'wind', aura: ['encrusted'] }, mult: 1.0, consume: ['encrusted'] }),
  D({ id: 'sandstorm', variant: 'rubble', family: 'surface', p: 1, elements: ['wind', 'earth'], fusion: true, match: { trigger: 'wind', zone: 'rubble' } }),
  D({ id: 'obsidian', nameKo: '흑요석', family: 'surface', p: 1, elements: ['water', 'fire'], fusion: true,
    desc: '용암에 물 — 6초간 걸을 수 있는 흑요석 발판과 증기', match: { trigger: 'water', zone: 'lava' } }),

  // ---- C. nature (the seed family) ----
  D({ id: 'bloom', nameKo: '개화', family: 'blessing', p: 0, elements: ['water', 'nature'],
    desc: '씨앗에 물 (젖은 적에게 자연) — 씨앗 꼬투리 생성: 5초 뒤 터지며 피해, 근처의 나를 치유',
    match: { trigger: 'water', aura: ['seeded'] }, mult: 1.1, consume: ['seeded'] }),
  D({ id: 'bloom', variant: 'nature', family: 'blessing', p: 0, elements: ['nature', 'water'],
    match: { trigger: 'nature', aura: ['wet'] }, mult: 1.1, consume: ['wet'] }),
  D({ id: 'wildfire', nameKo: '들불', family: 'spread', p: 0, elements: ['fire', 'nature'],
    desc: '씨앗에 화염 (불타는 적에게 자연) — 1.6배, 5m 안의 씨앗 상태 적 모두에게 화상이 번짐',
    match: { trigger: 'fire', aura: ['seeded'] }, mult: 1.6, consume: ['seeded'], apply: { burning: 4 } }),
  D({ id: 'wildfire', variant: 'nature', family: 'spread', p: 0, elements: ['nature', 'fire'],
    match: { trigger: 'nature', aura: ['burning'] }, mult: 1.6 }),
  D({ id: 'burgeon', nameKo: '화염 개화', family: 'burst', p: 0, elements: ['fire', 'nature'],
    desc: '씨앗 꼬투리에 화염 — 반경 5m 대폭발, 근처 꼬투리가 연쇄로 터짐', match: { trigger: 'fire', object: 'pod' } }),
  D({ id: 'hyperbloom', nameKo: '가시 번개', family: 'burst', p: 0, elements: ['lightning', 'nature'],
    desc: '씨앗 꼬투리에 번개 — 적을 추적하는 가시 번개 3발', match: { trigger: 'lightning', object: 'pod' } }),
  D({ id: 'quicken', nameKo: '촉진', family: 'control', p: 1, elements: ['lightning', 'nature'],
    desc: '씨앗에 번개 (감전에 자연) — 6초간 번개·자연 타격마다 고정 피해 +25',
    match: { trigger: 'lightning', aura: ['seeded'] }, mult: 1.0, consume: ['seeded'], apply: { quickened: 6 } }),
  D({ id: 'quicken', variant: 'nature', family: 'control', p: 1, elements: ['nature', 'lightning'],
    match: { trigger: 'nature', aura: ['shocked'] }, mult: 1.0, consume: ['shocked'], apply: { quickened: 6 } }),
  D({ id: 'frostbloom', nameKo: '서리꽃', family: 'control', p: 1, elements: ['ice', 'nature'],
    desc: '씨앗에 냉기 (냉기에 자연, 꼬투리에 냉기) — 4초간 냉기를 뿜는 얼음꽃',
    match: { trigger: 'ice', aura: ['seeded'] }, mult: 1.0, consume: ['seeded'] }),
  D({ id: 'frostbloom', variant: 'nature', family: 'control', p: 1, elements: ['nature', 'ice'],
    match: { trigger: 'nature', aura: ['chilled'] }, mult: 1.0, consume: ['chilled'] }),
  D({ id: 'frostbloom', variant: 'pod', family: 'control', p: 1, elements: ['ice', 'nature'], match: { trigger: 'ice', object: 'pod' } }),
  D({ id: 'entangle', nameKo: '속박 덩굴', family: 'control', p: 0, elements: ['earth', 'nature'],
    desc: '씨앗에 대지 (석화에 자연) — 2초 속박과 가시 고리 (보스: 붕괴 +40)',
    match: { trigger: 'earth', aura: ['seeded'] }, mult: 1.0, consume: ['seeded'], apply: { rooted: 2 } }),
  D({ id: 'entangle', variant: 'nature', family: 'control', p: 0, elements: ['nature', 'earth'],
    match: { trigger: 'nature', aura: ['encrusted'] }, mult: 1.0, consume: ['encrusted'], apply: { rooted: 2 } }),
  D({ id: 'pollen', nameKo: '확산·꽃가루', family: 'spread', p: 1, elements: ['wind', 'nature'], swirl: true, swirlVariant: true,
    desc: '씨앗에 바람 — 주변 적에게 씨앗 2중첩을 퍼뜨리고 수면을 쌓음', match: { trigger: 'wind', aura: ['seeded'] }, mult: 1.0 }),
  D({ id: 'photosynthesis', nameKo: '광합성', family: 'blessing', p: 1, elements: ['light', 'nature'],
    desc: '씨앗에 빛 (성흔에 자연, 꼬투리에 빛) — 중첩마다 2% 치유, 해바라기 포탑 소환',
    match: { trigger: 'light', aura: ['seeded'] }, mult: 1.0, consume: ['seeded'] }),
  D({ id: 'photosynthesis', variant: 'nature', family: 'blessing', p: 1, elements: ['nature', 'light'],
    match: { trigger: 'nature', aura: ['radiant'] }, mult: 1.0, consume: ['radiant'] }),
  D({ id: 'photosynthesis', variant: 'pod', family: 'blessing', p: 1, elements: ['light', 'nature'], match: { trigger: 'light', object: 'pod' } }),
  D({ id: 'rot', nameKo: '부패', family: 'curse', p: 1, elements: ['shadow', 'nature'],
    desc: '씨앗에 그림자 (침식에 자연) — 씨앗이 하나씩 터지며 침식으로 변함',
    match: { trigger: 'shadow', aura: ['seeded'] }, mult: 1.0, consume: ['seeded'] }),
  D({ id: 'rot', variant: 'nature', family: 'curse', p: 1, elements: ['nature', 'shadow'],
    match: { trigger: 'nature', aura: ['corroded'] }, mult: 1.0, consume: ['corroded'] }),

  // ---- D. light / shadow ----
  D({ id: 'sanctify', nameKo: '성화', family: 'blessing', p: 0, elements: ['light', 'fire'],
    desc: '불타는 적에게 빛 (성흔에 화염) — 성스러운 불꽃: 화상 피해 1.5배, 5m 안의 나를 4초간 치유',
    match: { trigger: 'light', aura: ['burning'] }, mult: 1.0 }),
  D({ id: 'sanctify', variant: 'fire', family: 'blessing', p: 0, elements: ['fire', 'light'],
    match: { trigger: 'fire', aura: ['radiant'] }, mult: 1.0, consume: ['radiant'] }),
  D({ id: 'holywater', nameKo: '성수', family: 'blessing', p: 0, elements: ['light', 'water'],
    desc: '젖은 적에게 빛 (성흔에 물, 웅덩이에 빛) — 8초간 치유의 샘: 회복 대기 −50%, 침식·공허 침식 정화',
    match: { trigger: 'light', aura: ['wet'] }, mult: 1.0, consume: ['wet'] }),
  D({ id: 'holywater', variant: 'water', family: 'blessing', p: 0, elements: ['water', 'light'],
    match: { trigger: 'water', aura: ['radiant'] }, mult: 1.0, consume: ['radiant'] }),
  D({ id: 'holywater', variant: 'puddle', family: 'blessing', p: 0, elements: ['light', 'water'], match: { trigger: 'light', zone: 'water' } }),
  D({ id: 'prism', nameKo: '프리즘 굴절', family: 'blessing', p: 0, elements: ['light', 'ice'],
    desc: '냉기·빙결 상태의 적에게 빛 (빛줄기가 얼음 기둥·결정에 닿음) — 가까운 적 3명에게 60% 광선 굴절',
    match: { trigger: 'light', aura: ['chilled', 'frozen'] }, mult: 1.0, consume: ['chilled'] }),
  D({ id: 'prism', variant: 'object', family: 'blessing', p: 0, elements: ['light', 'ice'], match: { trigger: 'light', object: 'crystal' } }),
  D({ id: 'prism', variant: 'pillar', family: 'blessing', p: 0, elements: ['light', 'ice'], match: { trigger: 'light', object: 'pillar' } }),
  D({ id: 'radiant_burst', nameKo: '광휘 폭발', family: 'burst', p: 0, elements: ['lightning', 'light'],
    desc: '성흔에 번개 (감전에 빛) — 반경 5m 섬광: 모두 눈부심, 소모한 성흔마다 피해 +10%',
    match: { trigger: 'lightning', aura: ['radiant'] }, mult: 1.4, consume: ['radiant'] }),
  D({ id: 'radiant_burst', variant: 'light', family: 'burst', p: 0, elements: ['light', 'lightning'],
    match: { trigger: 'light', aura: ['shocked'] }, mult: 1.4, consume: ['shocked'] }),
  D({ id: 'judgment', nameKo: '심판', family: 'blessing', p: 0, elements: ['light', 'physical'], custom: 'judgment',
    desc: '성흔이 임계치 이상인 적에게 강공격·충전·마무리 — 하늘의 빛기둥: 최대 체력 8% (보스 3%, 상한), 성흔 전부 소모',
    match: { trigger: ['physical', 'light', '*fallback'], aura: ['radiant'], minStacks: 'threshold', requireTag: ['heavy', 'charged', 'finisher'], orStat: 'judgmentAnyLight' },
    cdTarget: 6, cdBoss: 12, consumeAllStacks: true, bossBreak: 20, mult: 1.0 }),
  D({ id: 'aurora', nameKo: '확산·오로라', family: 'spread', p: 1, elements: ['wind', 'light'], swirl: true, swirlVariant: true,
    desc: '성흔에 바람 — 주변 적에게 성흔 2중첩 확산, 6초간 내 피해 +15%', match: { trigger: 'wind', aura: ['radiant'] }, mult: 1.0 }),
  D({ id: 'purify', nameKo: '정화', family: 'blessing', p: 0, elements: ['light', 'shadow'], opposite: true,
    desc: '침식에 빛 (공허 장막·공허 침식에 빛) — 침식 제거, 1.5배 (공허 적 2배), 나를 5% 치유',
    match: { trigger: 'light', aura: ['corroded'] }, mult: 1.5, consume: ['corroded'] }),
  D({ id: 'purify', variant: 'shield', family: 'blessing', p: 0, elements: ['light', 'void'], match: { trigger: 'light', aura: ['voidShield'] }, mult: 1.5 }),
  D({ id: 'purify', variant: 'blight', family: 'blessing', p: 0, elements: ['light', 'void'], fusion: true, match: { trigger: 'light', zone: 'blight' } }),
  D({ id: 'eclipse', nameKo: '일식', family: 'burst', p: 1, elements: ['shadow', 'light'], opposite: true,
    desc: '성흔에 그림자 (상극) — 7m 안의 적을 끌어당긴 뒤 폭발 (2m 안의 나도 피해)',
    match: { trigger: 'shadow', aura: ['radiant'] }, mult: 1.0, consume: ['radiant'] }),
  D({ id: 'necroflame', nameKo: '흑염', family: 'curse', p: 0, elements: ['shadow', 'fire'],
    desc: '불타는 적에게 그림자 (침식에 화염) — 6초간 꺼지지 않는 흑염: 피해의 30%를 흡수 (물로 못 끔)',
    match: { trigger: 'shadow', aura: ['burning'] }, mult: 1.0, consume: ['burning'], apply: { necroflame: 6 } }),
  D({ id: 'necroflame', variant: 'fire', family: 'curse', p: 0, elements: ['fire', 'shadow'],
    match: { trigger: 'fire', aura: ['corroded'] }, mult: 1.0, consume: ['corroded'], apply: { necroflame: 6 }, skipStatus: true }),
  D({ id: 'miasma', nameKo: '독무', family: 'curse', p: 1, elements: ['shadow', 'water'],
    desc: '젖은 적에게 그림자 (침식에 물) — 6초간 저주의 안개: 적 공격력 −30%, 매초 침식 +1',
    match: { trigger: 'shadow', aura: ['wet'] }, mult: 1.0, consume: ['wet'] }),
  D({ id: 'miasma', variant: 'water', family: 'curse', p: 1, elements: ['water', 'shadow'],
    match: { trigger: 'water', aura: ['corroded'] }, mult: 1.0, consume: ['corroded'] }),
  D({ id: 'miasma', variant: 'steam', family: 'curse', p: 1, elements: ['shadow', 'water'], fusion: true, match: { trigger: 'shadow', zone: 'steam' } }),
  D({ id: 'voidfrost', nameKo: '명빙', family: 'curse', p: 1, elements: ['shadow', 'ice'],
    desc: '냉기·빙결에 그림자 (침식에 냉기) — 균열: 빙결이 풀리거나 파쇄되면 영혼 구슬을 떨어뜨림',
    match: { trigger: 'shadow', aura: ['chilled', 'frozen'] }, mult: 1.0, apply: { cracked: 6 } }),
  D({ id: 'voidfrost', variant: 'ice', family: 'curse', p: 1, elements: ['ice', 'shadow'],
    match: { trigger: 'ice', aura: ['corroded'] }, mult: 1.0, consume: ['corroded'], apply: { cracked: 6 } }),
  D({ id: 'void_rift', nameKo: '확산·그림자 와류', family: 'spread', p: 1, elements: ['wind', 'shadow'], swirl: true, swirlVariant: true,
    desc: '침식에 바람 — 2초간 끌어당기는 그림자 소용돌이, 0.5초마다 침식 +1', match: { trigger: 'wind', aura: ['corroded'] }, mult: 1.0, consume: ['corroded'] }),
  D({ id: 'blackbolt', nameKo: '흑뢰', family: 'curse', p: 1, elements: ['lightning', 'shadow'],
    desc: '침식에 번개 (감전에 그림자) — 10m 안의 침식 상태 적 최대 5명에게 40% 연쇄, 침식 갱신',
    match: { trigger: 'lightning', aura: ['corroded'] }, mult: 1.0 }),
  D({ id: 'blackbolt', variant: 'shadow', family: 'curse', p: 1, elements: ['shadow', 'lightning'],
    match: { trigger: 'shadow', aura: ['shocked'] }, mult: 1.0, consume: ['shocked'] }),

  // ---- E. universal ----
  D({ id: 'break', nameKo: '붕괴', family: 'universal', p: 0, elements: ['physical', 'physical'], universal: true,
    desc: '정예·보스의 붕괴 게이지가 0 — 4초 경직, 받는 피해 +50%, 마무리 일격 가능', match: {} }),
  D({ id: 'resonance', nameKo: '원소 교향', family: 'universal', p: 0, elements: ['physical', 'physical'], universal: true,
    desc: '같은 적에게 6초 안에 서로 다른 반응 3개 — 다음 스킬 소모 0, 피해 +30%', match: {} }),
];

export const FAMILIES = {
  burst: { nameKo: '폭발', color: '#ff7a3a' }, control: { nameKo: '제어', color: '#8fd8ff' }, spread: { nameKo: '확산', color: '#7fffc8' },
  surface: { nameKo: '표면', color: '#e0b870' }, blessing: { nameKo: '축복', color: '#ffe08a' }, curse: { nameKo: '저주', color: '#b98bff' },
  universal: { nameKo: '보편', color: '#ffffff' },
};

// fill defaults (name / desc / fx carried to variants) and index
const FIRST = {};
for (const r of REACTION_DEFS) {
  if (!FIRST[r.id]) FIRST[r.id] = r;
  const f = FIRST[r.id];
  if (!r.nameKo) r.nameKo = f.nameKo;
  if (!r.desc) r.desc = f.desc;
  if (!r.fx) r.fx = 'rx_' + r.id;
  if (r.mult == null) r.mult = 1;
}
export const REACTION_IDS = Object.keys(FIRST);
export const P0_IDS = REACTION_IDS.filter((id) => FIRST[id].p === 0);
export const P1_IDS = REACTION_IDS.filter((id) => FIRST[id].p === 1);
export function reactionDef(id) { return FIRST[id] || null; }

/** BY_TRIGGER[el][auraKey] = [entries]  (frozen and chilled are separate keys; lookup checks frozen first). */
export const BY_TRIGGER = {};
/** BY_OBJECT[kind][el] = entry  (objects: pod/crystal/pillar; zones: water/ice/tornado/lava/fire/element/blight/steam/rubble). */
export const BY_OBJECT = {};
{
  const trig = (el) => (BY_TRIGGER[el] || (BY_TRIGGER[el] = {}));
  for (const r of REACTION_DEFS) {
    const m = r.match || {};
    const trs = [].concat(m.trigger || []);
    if (m.object || m.zone) {
      const kind = m.object || m.zone;
      const tbl = BY_OBJECT[kind] || (BY_OBJECT[kind] = {});
      for (const t of trs) tbl[t] = r;
      continue;
    }
    if (!m.aura || m.minStacks) continue;   // judgment is evaluated by its own fallback rule (threshold + hit tags)
    for (const t of trs) {
      if (t === '*fallback') continue;
      for (const a of m.aura) { const T = trig(t); (T[a] || (T[a] = [])).push(r); }
    }
  }
}

// ---------------------------------------------------------------- engine
const RX_CD = 1.0;
const MAX_CASCADE_PER_FRAME = 3;

export function createReactions(game, C) {
  const discovered = C.discovered;
  const tv = Array.from({ length: 8 }, () => new THREE.Vector3());
  const near = [], near2 = [], objs = [];
  const vfx = () => game.vfx;
  const fx = (name, ...a) => { try { return game.vfx?.[name]?.(...a); } catch (_) { return null; } };
  const isPl = (src) => src === 'player' || src?.team === 'player';
  const stats = () => game.stats;
  const playerEnt = () => game.player?.entity || null;
  const S = () => game.spells?.api || null;

  // ---- cooldowns (game time) ----
  const onCd = (t, id) => !!(t?._rxT && t._rxT[id] > game.time);
  const setCd = (t, id, sec) => { if (!t) return; (t._rxT || (t._rxT = {}))[id] = game.time + sec; };

  // ---- cascade queue (pooled records) ----
  const queue = [];
  const qpool = [];
  let cascadeThisFrame = 0;
  const qstats = { maxPerFrame: 0, executed: 0, dropped: 0, maxDepth: 0 };
  function enqueue(delay, fn, depth = 1) {
    if (depth > 12) { qstats.dropped++; return; }
    const q = qpool.pop() || { t: 0, fn: null, depth: 0 };
    q.t = delay; q.fn = fn; q.depth = depth;
    queue.push(q);
  }
  const stagger = () => 0.08 + Math.random() * 0.04;

  // ---- objects (pods/crystals…): spells.api.objects when present, else combat's own registry ----
  const ownObjects = [];
  function findObjects(kind, point, r, out) {
    out.length = 0;
    const O = S()?.objects;
    if (O?.near) { try { O.near(kind, point, r, out); } catch (_) { out.length = 0; } }
    for (const o of ownObjects) {
      if (!o.alive || (o.kind || o.type) !== kind || out.includes(o)) continue;
      const p = objPos(o); if (!p) continue;
      const dx = p.x - point.x, dz = p.z - point.z;
      if (dx * dx + dz * dz <= r * r) out.push(o);
    }
    return out;
  }
  const objPos = (o) => o?.position || o?.pos || o?.object?.position || o?.mesh?.position || null;

  // ---- hit helpers ----
  function rxHit(amount, element, source, point, extra) {
    const h = { amount, element, source, point, noReaction: true, tags: ['reaction'], tier: 'light', rxSecondary: true };
    if (extra) for (const k in extra) h[k] = extra[k];
    return h;
  }
  function aoe(point, r, team, except, fn) {
    C.queryRadius(point, r, team, near2);
    const list = near2.slice();   // reaction events only (not per frame)
    for (const e of list) if (e !== except && e.alive && !e.isProp) fn(e);
  }
  const foesOf = (t) => t?.team || 'enemy';
  const ground = (p, out) => { out.copy(p); try { const h = game.world?.getHeight?.(p.x, p.z); if (Number.isFinite(h)) out.y = h; } catch (_) { /* */ } return out; };
  const maxHp = () => game.player?.maxHp || playerEnt()?.maxHp || 100;

  // ---- timed area fields (pooled; sandstorm, flowers, thorn rings, springs, mist, rifts, fallback pods/turrets) ----
  const fields = [];
  const fpool = [];
  const MAX_FIELDS = 16;
  function field(kind, point, r, dur, every, data) {
    let f;
    if (fields.length >= MAX_FIELDS) { f = fields.shift(); }
    else f = fpool.pop() || { pos: new THREE.Vector3(), kind: '', r: 0, t: 0, dur: 0, every: 0, acc: 0, data: null, src: null, team: 'enemy' };
    f.kind = kind; f.pos.copy(point); f.r = r; f.t = 0; f.dur = dur; f.every = every; f.acc = 0; f.data = data || null;
    f.src = data?.source ?? 'player'; f.team = data?.team || 'enemy';
    fields.push(f);
    return f;
  }
  const FIELD = {
    sandstorm(f) {
      fx('burst', f.pos, { count: 10, shape: 'puff', color: [0xe8cf9a, 0xb8925a], alpha: 0.4, disc: true, radius: f.r * 0.6, tangential: 6, up: 1.2, curl: 4, speed: 1, size: 0.8, sizeEnd: 1.8, life: 0.7 });
      aoe(f.pos, f.r, f.team, null, (e) => { C.applyStatus(e, 'dazzled', 3, { source: f.src }); C.dealDamage(e, rxHit(5, 'earth', f.src, null, { rxId: 'sandstorm' })); });
      f.pos.x += Math.sin(f.t * 1.3) * 0.6; f.pos.z += Math.cos(f.t * 1.1) * 0.6;
    },
    frostflower(f) {
      fx('burst', f.pos, { count: 8, shape: 'snow', color: [0xffffff, 0x9fe8ff], disc: true, radius: 0.4, speed: f.r * 1.3, drag: 2, size: 0.18, life: 0.7 });
      fx('shockwave', f.pos, { color: 0x9fe8ff, radius: f.r, duration: 0.5, thickness: 0.12, opacity: 0.6 });
      aoe(f.pos, f.r, f.team, null, (e) => C.applyStatus(e, 'chilled', 3, { source: f.src, el: 'ice' }));
    },
    thorns(f) {
      fx('burst', f.pos, { count: 8, shape: 'thorn', color: [0xb8f070, 0x2f7d3a], disc: true, radius: f.r * 0.8, speed: 0.5, up: 3, size: 0.4, sizeEnd: 0.2, life: 0.4, gravity: 6 });
      aoe(f.pos, f.r, f.team, null, (e) => C.dealDamage(e, rxHit(8, 'nature', f.src, null, { rxId: 'entangle' })));
    },
    pod(f) { /* fallback seed pod: bursts at the end (see end handler) */
      fx('burst', f.pos, { count: 2, shape: 'petal', color: [0xf4ffd0, 0x8fe05a], speed: 0.8, up: 0.6, size: 0.25, life: 0.8 });
    },
    heal(f) {   // sanctify / holywater fallback spring: HoT for the player inside
      const pe = playerEnt(); if (!pe?.alive) return;
      const p = pe.object.position, dx = p.x - f.pos.x, dz = p.z - f.pos.z;
      if (dx * dx + dz * dz > f.r * f.r) return;
      C.healPlayer(maxHp() * (f.data?.pct || 0.015) * f.every, f.data?.id || 'spring', { hot: true });
      if (f.data?.cleanse) { C.clearStatus(pe, 'corroded'); C.clearStatus(pe, 'blight'); }
      fx('burst', p, { count: 2, shape: 'mote', color: [0xfff4c0, 0x9be86a], radius: 0.5, speed: 0.6, up: 1.5, size: 0.2, life: 0.8 });
    },
    turret(f) {
      C.queryRadius(f.pos, 12, f.team, near2);
      let best = null, bd = 1e9;
      for (const e of near2) { if (!e.alive || e.isProp) continue; const d = e.object.position.distanceToSquared(f.pos); if (d < bd) { bd = d; best = e; } }
      if (!best) return;
      const c = C.getCenter(best, tv[6]);
      tv[7].copy(f.pos).y += 1.2;
      fx('beam', tv[7], c, { color: 0xffe08a, width: 0.12, duration: 0.15, jagged: 0.05, segments: 4 });
      C.dealDamage(best, rxHit(12, 'light', f.src, c.clone(), { rxId: 'photosynthesis', status: { radiant: { stacks: 1 } } }));
    },
    mist(f) {
      fx('burst', f.pos, { count: 6, shape: 'smoke', color: [0x5b2a8a, 0x1a0b2e], alpha: 0.4, additive: false, radius: f.r * 0.7, speed: 0.4, up: 0.3, size: 1.4, sizeEnd: 2.6, life: 1.2 });
      aoe(f.pos, f.r, f.team, null, (e) => { C.applyStatus(e, 'cursedMist', 1.2, { source: f.src }); C.applyStatus(e, 'corroded', 8, { source: f.src, el: 'shadow' }); });
    },
    rift(f) {
      fx('burst', f.pos, { count: 10, shape: 'wisp', color: [0xb14bff, 0x2a0b4e], radius: f.r, inward: true, speed: f.r * 1.6, size: 0.4, sizeEnd: 0.1, life: 0.5 });
      aoe(f.pos, f.r, f.team, null, (e) => {
        if (!e.isBoss && e.velocity) { tv[5].subVectors(f.pos, e.object.position).setY(0); const L = tv[5].length(); if (L > 0.3) e.velocity.addScaledVector(tv[5].multiplyScalar(1 / L), 3); }
        C.applyStatus(e, 'corroded', 8, { source: f.src, el: 'shadow' });
      });
    },
  };
  const FIELD_END = {
    pod(f) { podBurst(f.pos, f.src, f.team); },
  };
  function podBurst(point, src, team) {
    fx('preset', 'rx_bloom', point, { scale: 0.8 });
    aoe(point, 3, team, null, (e) => C.dealDamage(e, rxHit(30, 'nature', src, null, { rxId: 'bloom' })));
    const pe = playerEnt();
    if (pe?.alive && pe.object.position.distanceTo(point) < 6) C.healPlayer(maxHp() * 0.03, 'bloom');
  }
  function updateFields(dt) {
    for (let i = fields.length - 1; i >= 0; i--) {
      const f = fields[i];
      f.t += dt; f.acc += dt;
      if (f.every > 0 && f.acc >= f.every) { f.acc -= f.every; try { FIELD[f.kind]?.(f); } catch (err) { warnOnce('field:' + f.kind, err); } }
      if (f.t >= f.dur) { try { FIELD_END[f.kind]?.(f); } catch (err) { warnOnce('fieldEnd:' + f.kind, err); } fields.splice(i, 1); f.data = null; fpool.push(f); }
    }
  }
  const warned = new Set();
  function warnOnce(k, err) { if (warned.has(k)) return; warned.add(k); console.warn('[combat:reactions]', k, err?.message || err); }

  // ---- surface/world ops (all guarded) ----
  const W = () => game.world;
  // reaction-spawned zones are merged: same type within its radius in the last 3 s → skip; ≤ 3 alive per type
  const zoneLog = [];
  function zoneAllowed(type, point, r) {
    const now = game.time; let alive = 0;
    for (let i = zoneLog.length - 1; i >= 0; i--) {
      const z = zoneLog[i];
      if (now > z.until) { zoneLog.splice(i, 1); continue; }
      if (z.type !== type) continue;
      alive++;
      const dx = z.x - point.x, dz = z.z - point.z;
      if (now - z.t < 3 && dx * dx + dz * dz < r * r * 1.4) return false;
    }
    return alive < 3;
  }
  function spawnZone(type, point, opts) {
    const r = opts?.radius || 3;
    if (!zoneAllowed(type, point, r)) return { merged: true };
    let z = null;
    try { if (S()?.zones?.spawn) z = S().zones.spawn(type, point, opts); } catch (_) { z = null; }
    if (!z) { try { if (game.spells?.spawnZone) z = game.spells.spawnZone(type, point, opts); } catch (_) { z = null; } }
    if (z) zoneLog.push({ type, x: point.x, z: point.z, t: game.time, until: game.time + (opts?.duration || 4) });
    return z || null;
  }
  function spawnObject(kind, point, opts) {
    try { if (S()?.objects?.spawn) return S().objects.spawn(kind, point, opts) || null; } catch (_) { /* */ }
    return null;
  }
  function ignite(point, r) { try { S()?.terrain?.ignite?.(point, r); } catch (_) { /* */ } }

  // ---------------------------------------------------------------- handlers
  // ctx: {t, el, hit, point, entry, stacks, auraKey, source, team, amount, obj, depth}. Return extra result fields.
  const HANDLERS = {
    melt(c) {
      if (c.entry.variant !== 'ice') { try { W()?.surface?.meltIce?.(c.point, 3); } catch (_) { /* */ } }
    },
    shatter(c) {
      const t = c.t; if (!t) return null;
      C.addBreak?.(t, 30, { kind: 'reaction' });
      C.queryRadius(c.point, 3, c.team, near2);
      let n = 0;
      const list = near2.filter((e) => e !== t && e.alive && !e.isProp);
      for (let i = 0; i < 6 && list.length; i++) { const e = list[i % list.length]; C.dealDamage(e, rxHit(8, 'ice', c.source, null, { rxId: 'shatter' })); n++; }
      if (t.statuses?.cracked) soulOrb(c.point);
      return { shards: n };
    },
    electrocute(c) {
      const isFusion = c.hit.tags && c.hit.tags.includes('fusion');
      if (isFusion || !c.t) return null;
      C.queryRadius(c.point, 9, c.team, near2);
      const others = near2.filter((e) => e !== c.t && e.statuses?.wet && !onCd(e, 'electrocute')).slice(0, 4);
      let depth = 1;
      const from = c.point.clone();
      for (const e of others) {
        const prev = from.clone();
        enqueue(0.06 * depth, () => {
          if (!e.alive) return;
          const p = C.getCenter(e, new THREE.Vector3());
          fx('beam', prev, p, { color: elColor('lightning'), width: 0.18, duration: 0.35, jagged: 0.6, segments: 12, branches: 2 });
          C.removeStatus(e, 'wet'); setCd(e, 'electrocute', RX_CD);
          C.applyStatus(e, 'stunned', 1.5, { source: c.source });
          C.dealDamage(e, rxHit(c.amount * 0.5 + 5, 'lightning', c.source, p, { rxId: 'electrocute', status: { shocked: 3 } }));
        }, depth);
        from.copy(e.object.position).y += (e.height || 1.6) * 0.5;
        depth++;
      }
      try { W()?.surface?.charge?.(c.point, 3, 3); } catch (_) { /* */ }
      return null;
    },
    superconduct(c) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        tv[5].set(c.point.x + Math.cos(a) * 4, c.point.y + (Math.random() - 0.3), c.point.z + Math.sin(a) * 4);
        fx('beam', c.point, tv[5], { color: 0xb9e6ff, width: 0.1, duration: 0.25, jagged: 0.5, segments: 8 });
      }
      aoe(c.point, 4, c.team, c.t, (e) => {
        C.applyStatus(e, 'exposed', 6, { source: c.source });
        C.dealDamage(e, rxHit(22, 'ice', c.source, null, { rxId: 'superconduct', status: { chilled: 2 } }));
      });
      return null;
    },
    overload(c) {
      aoe(c.point, 4, c.team, c.t, (e) => {
        const d = tv[4].subVectors(e.object.position, c.point).setY(0); if (d.lengthSq() > 1e-6) d.normalize();
        C.dealDamage(e, rxHit(30, 'fire', c.source, null, { rxId: 'overload', direction: d.clone(), knockback: 14, launch: 6 }));
      });
      ignite(c.point, 4);
      return { knock: 14, launch: 6 };
    },
    swirl(c) {
      // spread the touched aura (frozen spreads as chilled)
      const key = c.auraKey === 'frozen' ? 'chilled' : c.auraKey;
      if (c.t) C.removeStatus(c.t, key);
      const sel = { burning: 'fire', chilled: 'ice', shocked: 'lightning', wet: 'water', seeded: 'nature', radiant: 'light', corroded: 'shadow' }[key] || 'wind';
      const col = elColor(sel);
      const dmgEl = sel === 'water' ? 'wind' : sel;
      aoe(c.point, 7, c.team, c.t, (e) => {
        const p = C.getCenter(e, tv[3]);
        fx('beam', c.point, p, { color: col, width: 0.08, duration: 0.3, jagged: 0.15, segments: 6 });
        const st = {}; st[key] = key === 'seeded' || key === 'radiant' ? { stacks: 2 } : 3;
        C.dealDamage(e, rxHit(c.amount * 0.5 + 4, dmgEl, c.source, p.clone(), { rxId: c.entry.id, status: st }));
      });
      c.nameOverride = c.entry.swirlVariant ? null : elName(sel) + ' 확산';
      c.colorEl = sel;
      return null;
    },
    pollen(c) {
      HANDLERS.swirl(c);
      aoe(c.point, 7, c.team, null, (e) => C.addSleep?.(e, 40));
      return null;
    },
    aurora(c) {
      HANDLERS.swirl(c);
      try { stats()?.set?.('rx:aurora', { atkMul: 1.15 }, { duration: 6 }); } catch (_) { /* */ }
      return null;
    },
    void_rift(c) {
      field('rift', c.point, 6, 2, 0.5, { source: c.source, team: c.team });
      return null;
    },
    magma(c) {
      const gp = ground(c.t ? c.t.object.position : c.point, tv[3]);
      spawnZone('lava', gp, { radius: 3.5, duration: 4 });
      aoe(gp, 3.5, c.team, c.t, (e) => C.dealDamage(e, rxHit(18, 'fire', c.source, null, { rxId: 'magma', launch: 7, status: { burning: 4 } })));
      ignite(gp, 3);
      return { launch: 8 };
    },
    flashfreeze(c) { try { W()?.surface?.freeze?.(c.point, 3); } catch (_) { /* */ } return null; },
    evaporate(c) {
      if (!spawnZone('steam', c.point, { radius: 4, duration: 4 })) {
        fx('burst', c.point, { count: 18, shape: 'smoke', color: [0xffffff, 0xdfe8f0], alpha: 0.5, additive: false, speed: 2.2, radius: 1.5, size: 1.4, sizeEnd: 3.4, life: 3, drag: 1.5, gravity: -0.5 });
      }
      return null;
    },
    skyslam(c) {
      const t = c.t; if (!t) return null;
      if (t.velocity) t.velocity.y = -32;
      const gp = ground(t.object.position, tv[6]);
      fx('groundDecal', 'crack', gp, 3, 8);
      aoe(gp, 3, c.team, t, (e) => C.dealDamage(e, rxHit(c.amount * 0.6, 'earth', c.source, null, { rxId: 'skyslam', launch: 5 })));
      return { slam: true };
    },
    updraft(c) {
      const t = c.t; if (!t) return null;
      const s = t.statuses.airborne;
      if (s) { s.updrafted = true; s.time = 3; }
      if (t.velocity) t.velocity.y = Math.min(Math.max(t.velocity.y, 0) + 9, 12);
      return { noLaunch: true };
    },
    mudslide(c) {
      const gp = ground(c.point, tv[3]);
      let ok = false;
      try { if (W()?.surface2?.mud) { W().surface2.mud(gp, 4, 6); ok = true; } } catch (_) { /* */ }
      aoe(gp, 4, c.team, null, (e) => {
        if (!ok) C.applyStatus(e, 'muddy', 3, { source: c.source });
        if ((e.mass || 1) >= 3 && !e.isBoss) C.applyStatus(e, 'rooted', 1, { source: c.source });
      });
      fx('groundDecal', 'ripple', gp, 4, 6);
      return null;
    },
    crystallize(c) {
      const auraEl = { chilled: 'ice', frozen: 'ice', radiant: 'light', corroded: 'shadow' }[c.auraKey] || 'earth';
      if (c.t && c.auraKey) C.removeStatus(c.t, c.auraKey === 'frozen' ? 'chilled' : c.auraKey);
      const o = spawnObject('crystal', c.point, { element: auraEl, life: 10, source: c.source });
      if (!o && isPl(c.source)) {
        // fallback (no crystal objects yet): grant the pickup reward directly
        try { stats()?.set?.('rx:crystal', { [auraEl + 'Dmg']: 1.2 }, { duration: 6 }); } catch (_) { /* */ }
        try { game.player?.addShield?.(maxHp() * 0.12, 6); } catch (_) { /* */ }
      }
      c.colorEl = auraEl;
      return null;
    },
    grounded(c) {
      if (c.t) C.addBreak?.(c.t, 25, { kind: 'reaction' });
      if (isPl(c.source)) { try { stats()?.set?.('rx:grounded', { lightningResist: 0.5 }, { duration: 3 }); } catch (_) { /* */ } }
      return null;
    },
    sandstorm(c) { field('sandstorm', c.point, 4, 4, 0.5, { source: c.source, team: c.team }); return null; },
    obsidian(c) {
      try { c.obj?.convert?.('obsidian'); } catch (_) { /* */ }
      let ok = false;
      try { if (W()?.addPlatform) { W().addPlatform({ id: 'obsidian', shape: 'disc', center: c.point.clone(), r: c.obj?.radius || 3, top: (W().getHeight?.(c.point.x, c.point.z) ?? c.point.y) + 0.3, life: 6 }); ok = true; } } catch (_) { /* */ }
      fx('burst', c.point, { count: 14, shape: 'smoke', color: [0xffffff, 0xcfd8e0], alpha: 0.5, additive: false, speed: 2, up: 2, size: 1, sizeEnd: 2.6, life: 1.6 });
      return { platform: ok };
    },
    bloom(c) {
      const n = Math.min(4, 1 + Math.floor((c.stacks || 0) / 2));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, rr = i ? 1 + Math.random() : 0.6;
        const p = ground(tv[2].set(c.point.x + Math.cos(a) * rr, c.point.y, c.point.z + Math.sin(a) * rr), tv[2]).clone();
        if (!spawnObject('pod', p, { life: 5, source: c.source })) field('pod', p, 0.6, 5, 0.5, { source: c.source, team: c.team });
      }
      return { pods: n };
    },
    wildfire(c) {
      if (c.t && c.entry.variant === 'nature') C.applyStatus(c.t, 'burning', 4, { source: c.source, el: 'fire' });
      aoe(c.point, 5, c.team, c.t, (e) => { if (e.statuses?.seeded) C.applyStatus(e, 'burning', 4, { source: c.source, el: 'fire', power: c.power }); });
      ignite(c.point, 4);
      return null;
    },
    burgeon(c) {
      aoe(c.point, 5, c.team, null, (e) => C.dealDamage(e, rxHit(80, 'fire', c.source, null, { rxId: 'burgeon', status: { burning: 2 } })));
      ignite(c.point, 3);
      cascadePods(c, 5, 'fire');
      return null;
    },
    hyperbloom(c) {
      C.queryRadius(c.point, 12, c.team, near2);
      const list = near2.filter((e) => e.alive && !e.isProp).sort((a, b) => a.object.position.distanceToSquared(c.point) - b.object.position.distanceToSquared(c.point)).slice(0, 3);
      const from = c.point.clone(); from.y += 0.8;
      for (let i = 0; i < 3 && list.length; i++) {
        const e = list[i % list.length];
        enqueue(0.08 + i * 0.07, () => {
          if (!e.alive) return;
          const p = C.getCenter(e, new THREE.Vector3());
          fx('beam', from, p, { color: 0xb8ff6a, width: 0.14, duration: 0.25, jagged: 0.35, segments: 8, branches: 1 });
          fx('burst', p, { count: 10, shape: 'thorn', color: [0xe9d8ff, 0x8fe05a], speed: 5, size: 0.3, life: 0.4, velocityStretch: 0.05 });
          C.dealDamage(e, rxHit(35, 'lightning', c.source, p, { rxId: 'hyperbloom', status: { shocked: 3 } }));
        }, (c.depth || 0) + 1);
      }
      return null;
    },
    frostbloom(c) { field('frostflower', ground(c.point, tv[3]), 4, 4, 1, { source: c.source, team: c.team }); return null; },
    entangle(c) { field('thorns', ground(c.point, tv[3]), 2.5, 2, 0.5, { source: c.source, team: c.team }); return null; },
    photosynthesis(c) {
      const n = Math.max(1, c.stacks || 1);
      if (isPl(c.source)) C.healPlayer(maxHp() * 0.02 * n, 'photosynthesis');
      const p = ground(c.point, tv[3]).clone();
      if (!spawnObject('turret', p, { life: 6, source: c.source })) field('turret', p, 12, 6, 0.6, { source: c.source, team: c.team });
      return null;
    },
    rot(c) {
      const n = Math.max(1, c.stacks || 1);
      if (c.t) {
        C.dealDamage(c.t, rxHit(15 * n, 'shadow', c.source, c.point, { rxId: 'rot' }));
        if (c.entry.variant !== 'nature') C.applyStatus(c.t, 'corroded', 8, { stacks: n, source: c.source, el: 'shadow' });
      }
      return null;
    },
    sanctify(c) {
      const t = c.t;
      if (t) {
        if (c.entry.variant === 'fire') C.applyStatus(t, 'burning', 4, { source: c.source, el: 'fire', holy: true });
        else if (t.statuses?.burning) t.statuses.burning.holy = true;
      }
      if (isPl(c.source)) field('heal', c.point, 5, 4, 0.5, { pct: 0.015, id: 'sanctify', source: c.source });
      return null;
    },
    holywater(c) {
      const gp = ground(c.point, tv[3]).clone();
      try { c.obj?.convert?.('spring'); } catch (_) { /* */ }
      const z = spawnZone('spring', gp, { radius: 4, duration: 8, heal: 0.03, cleanse: true });
      try { W()?.surface2?.bless?.(gp, 4, 8); } catch (_) { /* */ }
      if (!z) field('heal', gp, 4, 8, 0.5, { pct: 0.03, id: 'holywater', cleanse: true, source: c.source });
      return null;
    },
    prism(c) {
      C.queryRadius(c.point, 12, c.team, near2);
      const list = near2.filter((e) => e !== c.t && e.alive && !e.isProp).sort((a, b) => a.object.position.distanceToSquared(c.point) - b.object.position.distanceToSquared(c.point)).slice(0, 3);
      const cols = [0xffe08a, 0x9fe8ff, 0xffb0e0];
      list.forEach((e, i) => {
        const p = C.getCenter(e, new THREE.Vector3());
        fx('beam', c.point, p, { color: cols[i % 3], width: 0.16, duration: 0.3, jagged: 0.02, segments: 3 });
        C.dealDamage(e, rxHit(Math.max(6, c.amount * 0.6), 'light', c.source, p, { rxId: 'prism', status: { radiant: { stacks: 1 } } }));
      });
      return null;
    },
    radiant_burst(c) {
      aoe(c.point, 5, c.team, null, (e) => C.applyStatus(e, 'dazzled', 3, { source: c.source }));
      return { mult: c.entry.mult + 0.1 * (c.auraKey === 'radiant' ? (c.stacks || 0) : 0) };
    },
    judgment(c) {
      const t = c.t; if (!t) return null;
      const pw = (() => { try { return stats()?.derived?.().power || 1; } catch (_) { return 1; } })();
      let amt = (t.maxHp || 100) * (t.isBoss ? 0.03 : 0.08);
      if (t.isBoss) amt = Math.min(amt, 400 * pw);
      C.addBreak?.(t, t.isBoss ? c.entry.bossBreak : 40, { kind: 'reaction' });
      C.applyStatus(t, 'dazzled', 2, { source: c.source });
      setCd(t, 'judgment!', t.isBoss ? c.entry.cdBoss : c.entry.cdTarget);
      enqueue(0.12, () => { if (t.alive) C.dealDamage(t, rxHit(Math.round(amt), 'light', c.source, c.point, { rxId: 'judgment', fixed: true, tier: 'heavy' })); }, 1);
      fx('runeCircle', ground(c.point, tv[3]), { element: 'light', r: 2.4, dur: 1.2, rotSpeed: 1.5 });
      return { judgmentDmg: amt };
    },
    purify(c) {
      const t = c.t;
      if (t && c.entry.variant === 'shield') C.drainShield?.(t, 25, 'light');
      const vs = t && (t.isVoid || t.element === 'void' || t.voidType);
      if (isPl(c.source)) C.healPlayer(maxHp() * 0.05, 'purify');
      try { if (c.entry.variant === 'blight') { c.obj?.convert?.('none'); W()?.surface2?.bless?.(c.point, 4, 4); } } catch (_) { /* */ }
      return vs ? { mult: 2.0 } : null;
    },
    eclipse(c) {
      const center = c.point.clone(), src = c.source, team = c.team;
      aoe(center, 7, team, null, (e) => {
        if (e.isBoss || !e.velocity) return;
        tv[5].subVectors(center, e.object.position).setY(0); const L = tv[5].length();
        if (L > 0.3) e.velocity.addScaledVector(tv[5].multiplyScalar(1 / L), Math.min(12, L * 2.5));
      });
      enqueue(0.6, () => {
        fx('preset', 'explosion_shadow', center, { scale: 1.4 });
        aoe(center, 5, team, null, (e) => C.dealDamage(e, rxHit(120, 'shadow', src, null, { rxId: 'eclipse', tier: 'heavy' })));
        const pe = playerEnt();
        if (pe?.alive && pe.object.position.distanceTo(center) < 2) C.dealDamage(pe, { amount: maxHp() * 0.1, element: 'shadow', source: 'env', noReaction: true, fixed: true, tags: ['reaction'] });
      }, (c.depth || 0) + 1);
      return null;
    },
    necroflame() { return null; },
    miasma(c) { field('mist', ground(c.point, tv[3]), 5, 6, 1, { source: c.source, team: c.team }); return null; },
    voidfrost() { return null; },
    blackbolt(c) {
      C.queryRadius(c.point, 10, c.team, near2);
      const list = near2.filter((e) => e !== c.t && e.alive && e.statuses?.corroded).slice(0, 5);
      let prev = c.point.clone();
      list.forEach((e, i) => {
        const from = prev.clone();
        enqueue(stagger() * (i + 1), () => {
          if (!e.alive) return;
          const p = C.getCenter(e, new THREE.Vector3());
          fx('beam', from, p, { color: 0x9a5cff, width: 0.16, duration: 0.3, jagged: 0.7, segments: 10, branches: 1 });
          if (e.statuses?.corroded) e.statuses.corroded.time = 8;
          C.dealDamage(e, rxHit(c.amount * 0.4 + 4, 'lightning', c.source, p, { rxId: 'blackbolt' }));
        }, (c.depth || 0) + 1);
        prev = e.object.position.clone(); prev.y += 1;
      });
      return null;
    },
    // zone fusions: the zone owner (spells/zones.js) converts the zone itself; combat adds the hit part + presentation
    fire_tornado(c) { try { c.obj?.convert?.('fire'); } catch (_) { /* */ } return null; },
    blizzard(c) { try { c.obj?.convert?.('ice'); } catch (_) { /* */ } return null; },
    storm_tornado(c) { try { c.obj?.convert?.('lightning'); } catch (_) { /* */ } return null; },
    steam_burst(c) {
      aoe(c.point, 5, c.team, null, (e) => C.dealDamage(e, rxHit(50, 'fire', c.source, null, { rxId: 'steam_burst' })));
      try { c.obj?.convert?.('water'); } catch (_) { /* */ }
      return null;
    },
    electro_water(c) {
      const r = c.obj?.radius || 3.5;
      aoe(c.point, r, c.team, null, (e) => { C.applyStatus(e, 'stunned', 1, { source: c.source }); C.dealDamage(e, rxHit(30, 'lightning', c.source, null, { rxId: 'electro_water', status: { shocked: 3 } })); });
      return null;
    },
    freeze_water(c) {
      const r = c.obj?.radius || 3.5;
      aoe(c.point, r, c.team, null, (e) => C.applyStatus(e, 'frozen', 2.5, { source: c.source, el: 'ice' }));
      try { c.obj?.convert?.('ice'); } catch (_) { /* */ }
      return null;
    },
    fire_wave() { return null; },
    infusion() { return null; },
  };

  function cascadePods(c, r, el) {
    findObjects('pod', c.point, r, objs);
    const list = objs.filter((o) => o !== c.obj && o.alive !== false && !o._rxBusy);
    const depth = (c.depth || 0) + 1;
    for (const o of list) {
      o._rxBusy = true;
      enqueue(stagger() * depth, () => { o._rxBusy = false; reactObject(o, el, { amount: 0, source: c.source, element: el, _depth: depth, tags: ['cascade'] }); }, depth);
    }
  }
  function soulOrb(point) {
    if (spawnObject('soul', point, { life: 10 })) return;
    const pl = game.player; if (!pl) return;
    try { if (pl.mp != null && pl.maxMp) pl.mp = Math.min(pl.maxMp, pl.mp + 15); } catch (_) { /* */ }
    try { if (pl.stamina != null && pl.maxStamina) pl.stamina = Math.min(pl.maxStamina, pl.stamina + 15); } catch (_) { /* */ }
    C.healPlayer(maxHp() * 0.05, 'soul');
    fx('burst', point, { count: 16, shape: 'wisp', color: [0xe0c8ff, 0x9a5cff], speed: 3, up: 2, size: 0.35, life: 0.9 });
  }

  // ---------------------------------------------------------------- matching
  const isHeavy = (hit) => !!(hit.heavy || hit.charged || hit.finisher || hit.tier === 'heavy' || hit.tier === 'ult' || hit.tier === 'crit'
    || (hit.tags && (hit.tags.includes('heavy') || hit.tags.includes('charged') || hit.tags.includes('finisher') || hit.tags.includes('ultimate'))));
  function threshold() {
    let th = 5;
    try { const v = game.progression?.judgmentThreshold?.(); if (Number.isFinite(v)) th = v; } catch (_) { /* */ }
    return Math.max(3, Math.min(5, th));
  }
  function entryOk(r, t, hit) {
    if (onCd(t, r.id)) return false;
    if (r.match.heavy && !isHeavy(hit)) return false;
    if (r.id === 'updraft') {
      const s = t.statuses.airborne; if (!s || s.updrafted) return false;
      let gy = t.object.position.y; try { gy = game.world.getHeight(t.object.position.x, t.object.position.z); } catch (_) { /* */ }
      if (t.object.position.y - gy >= 6) return false;
    }
    if (r.id === 'superconduct' && r.match.trigger === 'lightning' && t.statuses.frozen && !t.statuses.chilled) return true;
    return true;
  }
  /** First matching entry for (target, element) by the published priority; never mutates. */
  function find(t, el, hit, outInfo) {
    const s = t.statuses; if (!s) return null;
    const T = BY_TRIGGER[el];
    const ring = t.auraOrder;
    if (T) {
      if (el === 'light' && (t.voidShield || 0) > 0 && T.voidShield) {
        const r = T.voidShield[0]; if (r && !onCd(t, r.id)) { if (outInfo) outInfo.key = 'voidShield'; return r; }
      }
      if (ring) {
        for (let i = 0; i < ring.length; i++) {
          const key = ring[i];
          if (!s[key] && !(key === 'chilled' && s.frozen)) continue;
          // frozen counts as chilled; the frozen-specific cell wins
          if (key === 'chilled' && s.frozen && T.frozen) {
            for (const r of T.frozen) if (entryOk(r, t, hit)) { if (outInfo) outInfo.key = 'frozen'; return r; }
          }
          const list = T[key];
          if (list && (s[key] || key !== 'chilled' || s.frozen)) {
            for (const r of list) if (entryOk(r, t, hit)) { if (outInfo) outInfo.key = s[key] ? key : 'frozen'; return r; }
          }
        }
      }
    }
    // judgment (physical/light triggers, or the fallback for any element)
    const st = s.radiant;
    if (st && (st.stacks || 0) >= threshold() && !onCd(t, 'judgment') && !onCd(t, 'judgment!')) {
      let anyLight = false; try { anyLight = el === 'light' && !!stats()?.get?.('judgmentAnyLight'); } catch (_) { /* */ }
      if (isHeavy(hit) || anyLight) { if (outInfo) outInfo.key = 'radiant'; return JUDGMENT; }
    }
    return null;
  }
  const JUDGMENT = REACTION_DEFS.find((r) => r.id === 'judgment');

  // ---------------------------------------------------------------- firing
  const ctx = { t: null, el: '', hit: null, point: null, entry: null, stacks: 0, auraKey: null, source: null, team: 'enemy', amount: 0, power: 1, obj: null, depth: 0, nameOverride: null, colorEl: null };
  function fire(r, t, el, hit, point, auraKey, obj) {
    const s = t?.statuses;
    ctx.t = t; ctx.el = el; ctx.hit = hit; ctx.point = point; ctx.entry = r; ctx.auraKey = auraKey; ctx.obj = obj || null;
    ctx.source = hit.source ?? 'player'; ctx.team = t ? foesOf(t) : (isPl(ctx.source) ? 'enemy' : 'player');
    ctx.amount = hit.amount || 0; ctx.depth = hit._depth || 0; ctx.nameOverride = null; ctx.colorEl = null;
    ctx.power = 1; try { if (isPl(ctx.source)) ctx.power = stats()?.derived?.().power || 1; } catch (_) { /* */ }
    // consumed stacks of the aura that fired (bloom / rot / radiant_burst / photosynthesis use it)
    ctx.stacks = 0;
    if (t && auraKey && s?.[auraKey]) ctx.stacks = s[auraKey].stacks || 1;
    if (t && r.consume) for (const k of r.consume) if (s[k]) C.removeStatus(t, k, 'consume');
    if (t && r.consumeAllStacks && s.radiant) C.removeStatus(t, 'radiant', 'consume');
    if (t && r.opposite && auraKey && s[auraKey]) C.removeStatus(t, auraKey, 'consume');
    if (t && r.apply) for (const k in r.apply) C.applyStatus(t, k, r.apply[k], { source: ctx.source, power: ctx.power, el });
    let extra = null;
    const h = HANDLERS[r.custom || r.id];
    if (h) { try { extra = h(ctx); } catch (err) { warnOnce('rx:' + r.id, err); } }
    if (t) setCd(t, r.id, RX_CD);
    else if (obj) obj._rxT = game.time + 0.25;
    emit(r, point, t, ctx.nameOverride, ctx.colorEl);
    return extra;
  }
  // per-frame full-preset budget is enforced by vfx.preset (≤ 4 full per frame, the rest reduced)
  function emit(r, point, t, nameOverride, colorEl) {
    discover(r.id);
    const p = point.clone();
    game.events.emit('reaction', { id: r.id, name: nameOverride || r.nameKo, point: p, target: t, elements: r.elements, variant: r.variant || null, family: r.family });
    fx('preset', r.fx, p, { elements: r.elements, colorEl, family: r.family });
    if (t && !r.universal) { try { C.resonanceTrack?.(t, r.id); } catch (_) { /* */ } }
  }
  function discover(id) {
    if (!discovered.has(id)) { discovered.add(id); game.events.emit('reactionDiscovered', { id }); }
  }

  /** CONTRACT §8.2: react(target, el, hit, point) → {id, mult, …} | null. At most one reaction per target per hit. */
  const info = { key: null };
  function react(t, el, hit, point) {
    if (!t || !t.statuses || t.team === 'player' || t.isProp) return null;
    if (hit.object) { reactObject(hit.object, el, hit); return null; }
    info.key = null;
    const r = find(t, el, hit, info);
    if (!r) return null;
    const extra = fire(r, t, el, hit, point, info.key, null);
    const out = { id: r.id, mult: r.mult, skipStatus: !!r.skipStatus, family: r.family, variant: r.variant || null };
    if (extra) for (const k in extra) out[k] = extra[k];
    return out;
  }
  /** Objects (pods, crystals, ice pillars) and zones (water, ice, tornado, lava, fire, element, blight, steam, rubble). */
  function reactObject(obj, el, hit = {}) {
    if (!obj) return null;
    const kind = obj.kind || obj.type;
    const tbl = BY_OBJECT[kind] || (obj.isZone && obj.element && BY_OBJECT.element);
    if (!tbl) return null;
    const r = tbl[el] || (tbl === BY_OBJECT.element ? tbl['*'] : null);
    if (!r) return null;
    if ((obj._rxT || 0) > game.time) return null;
    const p = objPos(obj);
    const point = p ? tv[1].copy(p) : (hit.point ? tv[1].copy(hit.point) : null);
    if (!point) return null;
    const extra = fire(r, null, el, hit, point.clone(), null, obj);
    if (kind === 'pod' || kind === 'crystal') {
      if (ownObjects.includes(obj)) obj.alive = false;
      try { obj.onReact?.(r.id, el); } catch (_) { /* */ }
    }
    return { id: r.id, mult: r.mult, family: r.family, ...(extra || {}) };
  }

  const prev = { id: null, nameKo: null, family: null };
  /** Same evaluation as react() with no side effects (for the "다음 타격" hint; ≤ 10 Hz). Returns a reused object. */
  function previewReaction(t, el, hitLike) {
    if (!t?.alive || !t.statuses || !el) return null;
    const r = find(t, el, hitLike || PREVIEW_HIT, null);
    if (!r) return null;
    prev.id = r.id; prev.nameKo = r.nameKo; prev.family = r.family;
    return prev;
  }
  const PREVIEW_HIT = { heavy: false, tags: [] };

  /** Force a reaction on target (debug/test): runs the entry's effect regardless of auras/cooldowns. */
  function debugReact(id, t) {
    const r = REACTION_DEFS.find((x) => x.id === id);
    if (!r) return false;
    if (id === 'break') return !!C.forceBreak?.(t);
    if (id === 'resonance') return !!C.forceResonance?.(t);
    const el = [].concat(r.match.trigger || ['physical']).find((x) => x !== '*fallback' && x !== '*') || 'physical';
    const point = t ? C.getCenter(t, new THREE.Vector3()) : (game.player?.object?.position?.clone() || new THREE.Vector3());
    const hit = { amount: 20, element: el, source: 'player', point, tags: ['debug'], heavy: true };
    if (r.match.object || r.match.zone) {
      const obj = { kind: r.match.object || r.match.zone, isZone: !!r.match.zone, position: ground(point, new THREE.Vector3()), radius: 3.5, alive: true, element: 'fire', debug: true };
      return !!reactObject(obj, el, hit);
    }
    if (!t) return false;
    const aura = r.match.aura?.[0] || null;
    if (aura && aura !== 'voidShield' && t.statuses && !t.statuses[aura]) C.applyStatus(t, aura, 3, { source: 'player', stacks: 5 });
    if (aura === 'voidShield' && !(t.voidShield > 0)) t.voidShield = 30;
    const extra = fire(r, t, el, hit, point, aura, null);
    if (t.alive) C.dealDamage(t, rxHit(20 * ((extra && extra.mult) || r.mult || 1), el === 'physical' ? 'physical' : el, 'player', point, { rxId: id }));
    return true;
  }

  function update(dt) {
    cascadeThisFrame = 0;
    for (let i = 0; i < queue.length; i++) queue[i].t -= dt;
    for (let i = 0; i < queue.length && cascadeThisFrame < MAX_CASCADE_PER_FRAME;) {
      const q = queue[i];
      if (q.t > 0) { i++; continue; }
      queue.splice(i, 1);
      cascadeThisFrame++; qstats.executed++;
      if (q.depth > qstats.maxDepth) qstats.maxDepth = q.depth;
      const fn = q.fn; q.fn = null; qpool.push(q);
      try { fn(); } catch (err) { warnOnce('queue', err); }
    }
    if (cascadeThisFrame > qstats.maxPerFrame) qstats.maxPerFrame = cascadeThisFrame;
    updateFields(dt);
  }

  return {
    react, reactObject, previewReaction, debugReact, discover, update, HANDLERS, onCd, setCd, enqueue,
    registerObject(o) { if (o && !ownObjects.includes(o)) { if (o.alive === undefined) o.alive = true; ownObjects.push(o); } return o; },
    unregisterObject(o) { const i = ownObjects.indexOf(o); if (i >= 0) ownObjects.splice(i, 1); },
    queueStats: () => qstats, queueLength: () => queue.length, fields: () => fields.length,
    reset() { queue.length = 0; fields.length = 0; ownObjects.length = 0; },
  };
}
