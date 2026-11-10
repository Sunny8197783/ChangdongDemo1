// Boss data tables (PLAN v4 §4.9–4.15, §7.4.5). Owned by bosses.
//   BOSS_ATTACKS   attack id → numbers for game.tells.attack (normal difficulty; tells applies floors / tellMul / timeMul).
//                  windup2 = phase-2 windup; punishDur / punishMul → game.tells.punish after the strike; kind = hit metadata kind.
//   BOSS_CODEX     CodexEntry per boss (몬스터 도감; final Korean copy, no windup seconds, parry advice only in parryKo,
//                  key names only through {dodgeKey} {defendKey} {jumpKey}, punish durations only through {punishSec}).
//   BOSS_BRIEF     type → the 3 boss-brief bullets (bossSpawn payload `brief`).
//   BOSS_UI        other boss-owned Korean strings (attack banner / check labels).
// Korean player-facing text lives only here (PLAN §7.2 rule 6); behaviour files read names through attackSpec(id).nameKo.

/** Attack numbers. Angles are radians, HALF-angle. */
export const BOSS_ATTACKS = {
  // 고대 바위 골렘
  'golem.slam': { tell: 'jump', cls: 'bossAoE', windup: 1.2, windup2: 1.0, punishDur: 1.3, punishMul: 1.25, kind: 'melee', anchor: 'hand', shape: { kind: 'circle', r: 7.5 }, shockwave: { speed: 12, band: 0.6, maxR: 7.5 } },
  'golem.throw': { tell: 'danger', cls: 'boss', windup: 1.0, windup2: 0.9, kind: 'projectile', anchor: 'hand', melee: false, shape: { kind: 'circle', r: 3.4 } },
  'golem.punch': { tell: 'parry', cls: 'boss', windup: 1.0, windup2: 0.85, punishDur: 1.2, punishMul: 2.0, kind: 'melee', anchor: 'hand', shape: { kind: 'cone', r: 8.5, angle: 1.05 } },
  // 삼두 물뱀 레비아탄
  'hydra.bite': { tell: 'danger', cls: 'boss', windup: 1.2, punishDur: 2.0, punishMul: 1.5, kind: 'melee', anchor: 'mouth', shape: { kind: 'line', len: 17, width: 3.2 } },
  'hydra.spit': { tell: 'projectile', cls: 'boss', windup: 1.0, kind: 'projectile', anchor: 'mouth', melee: false, orbs: 3, markerR: 1.2 },
  'hydra.tide': { tell: 'danger', cls: 'bossAoE', windup: 2.0, kind: 'melee', anchor: 'core', melee: false, shape: { kind: 'ring', inner: 5.5, r: 19 } },
  'hydra.spouts': { tell: 'danger', cls: 'boss', windup: 1.2, kind: 'hazard', anchor: 'core', melee: false, shape: { kind: 'circle', r: 2.6 }, stagger: [1.2, 1.55, 1.9] },
  // 녹스
  'nox.teleportSlash': { tell: 'parry', cls: 'boss', windup: 1.1, marker: 0.3, melee: false,     // he strikes from the in-view arrival marker
    punishDur: 2.0, punishMul: 1.5, kind: 'melee', anchor: 'weapon', shape: { kind: 'line', len: 7, width: 1.6 } },
  'nox.volley': { tell: 'projectile', cls: 'boss', windup: 1.0, kind: 'projectile', anchor: 'weapon', melee: false, orbs: 3, orbs2: 4, homing: 0.5 },
  'nox.wave': { tell: 'danger', cls: 'bossAoE', windup: 1.1, kind: 'melee', anchor: 'weapon', shape: { kind: 'cone', r: 7, angle: 0.61 } },
  // 모르그로스
  'treant.stomp': { tell: 'danger', cls: 'bossAoE', windup: 1.4, kind: 'melee', anchor: 'hand', shape: { kind: 'circle', r: 6.5 } },
  'treant.sweep': { tell: 'danger', cls: 'bossAoE', windup: 1.4, punishDur: 1.5, punishMul: 1.25, kind: 'melee', anchor: 'hand', shape: { kind: 'cone', r: 12, angle: 1.05 } },
  'treant.roots': { tell: 'danger', cls: 'bossAoE', windup: 1.3, kind: 'melee', anchor: 'core', melee: false, shape: { kind: 'line', len: 18, width: 2.2 }, fan: 3, fan3: 5 },
  'treant.pods': { tell: 'danger', cls: 'boss', windup: 1.0, kind: 'hazard', anchor: 'core', melee: false, targetsPlayer: false, shape: { kind: 'circle', r: 3 } },
  // 칼리스
  'kalis.slash': { tell: 'danger', cls: 'boss', windup: 1.0, punishDur: 1.0, punishMul: 1.5, kind: 'melee', anchor: 'weapon', dash: 5.5, shape: { kind: 'conecap', width: 1.8, r: 3.2, angle: 1.0 } },
  'kalis.counter': { tell: 'danger', cls: 'check', windup: 0.5, kind: 'melee', anchor: 'weapon', stance: 1.2, shape: { kind: 'cone', r: 3, angle: 0.44 } },
  'kalis.volley': { tell: 'projectile', cls: 'boss', windup: 1.0, kind: 'projectile', anchor: 'weapon', melee: false, orbs: 3, orbs2: 4, homing: 0.5 },
  'kalis.burst': { tell: 'danger', cls: 'boss', windup: 1.1, kind: 'melee', anchor: 'weapon', melee: false, shape: { kind: 'circle', r: 3.4 } },
  'kalis.beams': { tell: 'danger', cls: 'boss', windup: 1.2, kind: 'melee', anchor: 'weapon', melee: false, shape: { kind: 'line', width: 1.6 } },
  'kalis.check': { tell: 'danger', cls: 'check', windup: 10, kind: 'check', stagger: 4 },
  // 니드호그라
  'nidhoggra.claw': { tell: 'parry', cls: 'boss', windup: 1.3, punishDur: 1.2, punishParry: 2.6, punishMul: 1.5, kind: 'melee', anchor: 'hand', shape: { kind: 'circle', r: 5 } },
  'nidhoggra.breath': { tell: 'unblockable', cls: 'unblockable', windup: 1.8, kind: 'melee', anchor: 'mouth', melee: false, shape: { kind: 'cone', r: 26, angle: 0.61 } },
  'nidhoggra.rain': { tell: 'danger', cls: 'boss', windup: 1.4, kind: 'hazard', anchor: 'head', melee: false, shape: { kind: 'circle', r: 3 }, n: 4 },
  'nidhoggra.rods': { tell: 'danger', cls: 'check', windup: 4, kind: 'check' },
  'nidhoggra.tide': { tell: 'danger', cls: 'check', windup: 12, kind: 'check' },
};

const atk = (id, nameKo, tellKo, counterKo, extra) => ({ id, nameKo, tell: BOSS_ATTACKS[id].tell, tellKo, counterKo, ...(BOSS_ATTACKS[id].punishDur ? { punishDur: BOSS_ATTACKS[id].punishDur } : {}), ...(extra || {}) });

/** CodexEntry per boss (§7.4.5). */
export const BOSS_CODEX = [
  {
    type: 'golem', nameKo: '고대 바위 골렘', roleKo: '봉인의 수호자', boss: true, elite: false,
    weak: [], resist: [{ el: 'earth', mul: 0.5 }], immune: [], weakPointKo: '수정 핵 (경직·주먹 회복 중 ×2)',
    tipKo: '흰 ⤒ 표시와 함께 땅을 내려치면 충격파가 바깥으로 퍼집니다. 파동이 닿기 직전에 {jumpKey}로 점프해 넘으세요. 금빛 주먹 휩쓸기를 피하면 주먹이 땅에 박혀 수정 핵이 드러납니다. 바위 투척은 착지 원이 미리 보입니다.',
    parryKo: '금빛 주먹을 {defendKey}로 패링해도 수정 핵이 드러나요.',
    briefKo: ['⤒ 표시 = 퍼지는 충격파를 점프로 넘기', '금빛 주먹을 피하거나 패링 → 수정 핵 노출', '바위 투척: 착지 원 밖으로'],
    attacks: [
      atk('golem.slam', '대지 강타', '두 팔을 높이 들고 흰 ⤒ 원이 차오릅니다', '원이 가득 차면 퍼지는 충격파의 띠가 닿기 직전에 {jumpKey}로 점프하세요', { punishKo: '내려친 뒤 잠시 숨을 고릅니다' }),
      atk('golem.throw', '바위 던지기', '바위를 들어 올리는 순간 착지 원이 나타납니다', '착지 원 밖으로 이동하세요'),
      atk('golem.punch', '휩쓸기 주먹', '주먹이 금빛으로 빛나며 넓은 부채꼴이 차오릅니다', '부채꼴 밖으로 피하면 주먹이 땅에 박힙니다', { parryKo: '금빛 주먹을 {defendKey}로 패링하면 수정 핵이 드러나요.', punishKo: '주먹이 박힌 동안 수정 핵 피해 ×2 ({punishSec}초)' }),
    ],
  },
  {
    type: 'hydra', nameKo: '삼두 물뱀 레비아탄', roleKo: '호수의 군주', boss: true, elite: false,
    weak: [{ el: 'lightning', mul: 1.25 }, { el: 'fire', mul: 1.25 }, { el: 'earth', mul: 1.25 }], resist: [{ el: 'water', mul: 0.5 }], immune: [],
    weakPointKo: '머리마다 다름 (상극 원소)',
    tipKo: '머리를 뒤로 젖히면 직선 물어뜯기. 피하면 머리가 땅에 엎드리고 ◆ 공격 기회! 표시가 뜹니다. 해일이 오면 초록 안전 표시가 있는 얼음 원판이나 기둥 위로 올라가세요.',
    briefKo: ['머리 볏의 색 = 그 머리의 속성 → 상극 원소로 공격', '물어뜯기를 피하면 머리가 엎드림 → 공격 기회', '해일: 초록 안전 표시 위로'],
    attacks: [
      atk('hydra.bite', '물어뜯기', '머리를 뒤로 젖히고 긴 직선이 차오릅니다', '직선 옆으로 피한 뒤 엎드린 머리를 공격하세요', { punishKo: '머리가 엎드린 동안 공격 기회 ({punishSec}초)' }),
      atk('hydra.spit', '독침 연사', '입이 빛나고 발밑에 착지 표식 3개가 생깁니다', '구슬은 따라오지 않으니 표식 밖으로 걸어 나가세요'),
      atk('hydra.tide', '해일', '호수 전체에 넓은 고리가 차오릅니다', '초록 안전 표시가 있는 얼음 원판이나 기둥 위로 올라가세요'),
      atk('hydra.spouts', '물기둥', '발밑에 작은 원이 차례로 생깁니다', '원이 차오르는 순서대로 밖으로 피하세요'),
    ],
  },
  {
    type: 'nox', nameKo: '녹스', roleKo: '그림자의 기사', boss: true, elite: false,
    weak: [{ el: 'light', mul: 1.3 }], resist: [{ el: 'shadow', mul: 0.5 }], immune: [], weakPointKo: '빛 (보호막)',
    tipKo: '까마귀 연기와 함께 사라지면 당신 앞쪽에 연기 표식이 생기고 곧 직선 베기가 옵니다. 선 밖으로 피하세요. 빛으로 보호막을 깨면 한동안 무릎을 꿇습니다.',
    parryKo: '금빛 섬광에 맞춰 {defendKey}로 패링하면 {punishSec}초 동안 기절시킬 수 있어요!',
    briefKo: ['사라진 뒤 연기 표식 → 직선 베기 (금빛 = 패링 가능)', '빛으로 보호막 파괴 → 무릎 꿇음', '까마귀 화살은 옆으로 달려 회피'],
    attacks: [
      atk('nox.teleportSlash', '순간 베기', '까마귀 연기로 사라진 뒤 당신 앞쪽에 연기 표식과 금빛 직선이 나타납니다', '직선 옆으로 피하세요', { parryKo: '금빛 섬광에 맞춰 {defendKey}로 패링하면 {punishSec}초 동안 기절시킬 수 있어요!', punishKo: '패링하면 기절 ({punishSec}초)' }),
      atk('nox.volley', '까마귀 화살', '깃털 부채가 빛나고 조준선이 나타납니다', '잠깐만 따라오니 옆으로 달려 피하세요'),
      atk('nox.wave', '그림자 파도', '검을 높이 들고 앞쪽 부채꼴이 차오릅니다', '부채꼴 옆이나 뒤로 돌아가세요'),
    ],
  },
  {
    type: 'treant', nameKo: '모르그로스', roleKo: '썩은 숲의 거목', boss: true, elite: false,
    weak: [{ el: 'fire', mul: 1.6 }], resist: [{ el: 'nature', mul: 0.5 }, { el: 'water', mul: 0.7 }], immune: [], weakPointKo: '화염 (껍질 판) · 심장 ×2.5',
    tipKo: '팔을 높이 들면 넓은 부채꼴 휩쓸기. 피한 뒤 땅에 박힌 팔을 치면 판 피해가 2배. 껍질 판 4개를 모두 태우면 무릎을 꿇고 심장이 드러납니다. 불이 없다면 포자 꼬투리를 터뜨려 불을 붙이세요.',
    briefKo: ['껍질 판을 불로 태우기 (꼬투리로 점화 가능)', '판 4개 → 무릎 꿇음 → 심장 공격', '팔 휩쓸기 후 박힌 팔이 공격 기회'],
    attacks: [
      atk('treant.stomp', '짓밟기', '한쪽 발을 들어 올리고 앞쪽 원이 차오릅니다', '원 밖으로 피하세요'),
      atk('treant.sweep', '팔 휩쓸기', '팔을 높이 들고 아주 넓은 부채꼴이 차오릅니다', '부채꼴 밖으로 피한 뒤 박힌 팔을 공격하세요', { punishKo: '팔이 박힌 동안 판 피해 ×2 ({punishSec}초)' }),
      atk('treant.roots', '뿌리 가시', '두 팔을 들고 땅에 긴 직선 여러 개가 차오릅니다', '직선 사이의 빈 틈으로 피하세요'),
      atk('treant.pods', '포자 꼬투리', '꼬투리가 주황빛으로 빛나며 작은 원이 차오릅니다', '원 밖으로 피하거나 먼저 터뜨려 껍질 판에 불을 붙이세요'),
    ],
  },
  {
    type: 'kalis', nameKo: '칼리스', roleKo: '거울의 기사', boss: true, elite: false,
    weak: [], resist: [], immune: [], weakPointKo: '따라 한 원소의 상극',
    tipKo: '돌진 베기는 돌진 경로와 끝의 부채꼴이 함께 표시됩니다. 돌진 직후 거울 갑옷에 금이 가 무방비가 됩니다. 거울 방패가 빛나는 \'반격 자세\'일 때 때리면 반격하니 공격을 멈추고 피하세요.',
    briefKo: ['그가 따라 한 원소의 상극으로 공격', '방패가 빛나면 공격 중지', '돌진 후 갑옷에 금 → 공격 기회'],
    attacks: [
      atk('kalis.slash', '돌진 베기', '돌진 경로와 끝의 부채꼴이 함께 차오릅니다', '경로 옆으로 피한 뒤 금이 간 갑옷을 공격하세요', { punishKo: '갑옷에 금이 간 동안 공격 기회 ({punishSec}초)' }),
      atk('kalis.counter', '반격', '거울 방패가 빛나는 반격 자세를 잡습니다', '자세가 풀릴 때까지 공격을 멈추고 거리를 두세요'),
      atk('kalis.volley', '거울 화살', '창끝이 빛나고 조준선이 나타납니다', '잠깐만 따라오니 옆으로 달려 피하세요'),
      atk('kalis.burst', '거울 폭발', '발밑에 원이 차오릅니다', '원 밖으로 피하세요'),
      atk('kalis.beams', '반사 광선', '거울에서 당신 쪽으로 직선이 차오릅니다', '직선 옆으로 비켜서세요'),
      atk('kalis.check', '결정 깨기', '경직 막대와 빛나는 결정 3개가 나타납니다', '막대가 끝나기 전에 결정 3개를 모두 깨거나 붕괴시키세요'),
    ],
  },
  {
    type: 'nidhoggra', nameKo: '니드호그라', roleKo: '공허룡', boss: true, elite: false,
    weak: [], resist: [], immune: [], weakPointKo: '부위마다 잠금 (상극 원소로 해제)',
    tipKo: '금빛 발톱 내려찍기를 피하면 머리가 잠시 늘어집니다. 분홍색 ⚠ 숨결은 막을 수 없으니 초록 안전 표시가 있는 뿌리 기둥 뒤로 숨으세요. 하늘에서 떨어지는 공허는 원 4개 밖으로 피하세요.',
    parryKo: '금빛 발톱을 {defendKey}로 패링하면 머리가 {punishSec}초 동안 늘어집니다.',
    briefKo: ['부위의 잠금 색 = 그 부위를 여는 상극 원소', '⚠ 숨결: 초록 안전 표시가 있는 기둥 뒤로', '금빛 발톱을 피하면 → 머리 공격 기회'],
    attacks: [
      atk('nidhoggra.claw', '발톱 내려찍기', '발톱이 금빛으로 빛나며 원이 차오릅니다', '원 밖으로 피하면 머리가 늘어집니다', { parryKo: '금빛 발톱을 {defendKey}로 패링하면 머리가 {punishSec}초 동안 늘어집니다.', punishKo: '머리가 늘어진 동안 공격 기회 ({punishSec}초)' }),
      atk('nidhoggra.breath', '공허 숨결', '분홍색 ⚠ 표시와 함께 거대한 부채꼴이 차오릅니다', '막을 수 없으니 초록 안전 표시가 있는 기둥 뒤로 숨으세요'),
      atk('nidhoggra.rain', '공허 낙하', '주변에 원 4개가 차례로 생깁니다', '원 밖으로 피하세요'),
      atk('nidhoggra.rods', '피뢰침', '번개 막대 3개가 솟아오르고 경직 막대가 나타납니다', '막대가 끝나기 전에 피뢰침 3개를 모두 치세요'),
      atk('nidhoggra.tide', '공허 해일', '고원 전체에 고리가 차오릅니다', '붕괴 게이지를 채워 해일을 끊으세요'),
    ],
  },
];

export const BOSS_BRIEF = Object.fromEntries(BOSS_CODEX.map((c) => [c.type, c.briefKo]));
const BY_TYPE = Object.fromEntries(BOSS_CODEX.map((c) => [c.type, c]));
const NAMES = {};
for (const c of BOSS_CODEX) for (const a of c.attacks) NAMES[a.id] = a.nameKo;

/** Other boss-owned Korean strings (attack/check labels; §6.10 freeze label). */
export const BOSS_UI = {
  checkLabel: { freeze: '호수 얼리기', stagger: '결정 깨기', rods: '피뢰침', tide: '공허 해일' },
  crystal: '거울 결정',
};

/** Merged attack record: numbers + nameKo (never inline Korean in behaviour files). */
const SPEC_CACHE = {};
export function attackSpec(id) {
  if (SPEC_CACHE[id]) return SPEC_CACHE[id];
  const s = BOSS_ATTACKS[id]; if (!s) return null;
  return (SPEC_CACHE[id] = { id, nameKo: NAMES[id] || '', ...s });
}
export function codexOf(type) { return BY_TYPE[type] || null; }
/** e.attacks rows for an entity of `type` (§7.4.5). */
export function attacksOf(type) {
  const c = BY_TYPE[type]; if (!c) return [];
  return c.attacks.map((a) => ({ id: a.id, nameKo: a.nameKo, tell: a.tell, windup: BOSS_ATTACKS[a.id].windup, ...(BOSS_ATTACKS[a.id].punishDur ? { punishDur: BOSS_ATTACKS[a.id].punishDur } : {}) }));
}

/** Register the boss codex with the enemies module (idempotent per game). */
const registered = new WeakSet();
export function registerBossCodex(game) {
  const E = game?.enemies;
  if (!E || registered.has(E)) return false;
  if (typeof E.registerCodex !== 'function') return false;
  try { E.registerCodex(BOSS_CODEX); registered.add(E); return true; } catch (err) { console.warn('[bosses] registerCodex', err?.message || err); return false; }
}
// module load: when the game object already exists (the dynamic bosses import runs after enemies.init), register now
try { if (typeof window !== 'undefined' && window.game) registerBossCodex(window.game); } catch (_) { /* */ }
