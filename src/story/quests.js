// Story v3 stage table (CONTRACT §17, DESIGN §8.4). Pure data + small objective/marker functions.
// The stage machine in story.js reads this table; nothing else in the story hard-codes a stage order.
//
// objective(S, game, H) → description string (H.prog(cur, max) sets the progress bar, H.mark(pos) the compass target)
// markers(S, game, H)   → calls H.add(position, kind, label) / H.npc(id, mark) for every marker it wants
// kind: 'talk' | 'reach' | 'boss' | 'ending' | 'free'   boss: enemies boss id for 'boss' stages
// Region stages (acts 2/3) are played in either order; story.regionOrder records it.

export const REGIONS = { mirwen: ['mirwen', 'hydra'], elderwood: ['elderwood', 'nox', 'treant'] };
export const REGION_IDS = Object.keys(REGIONS);
export const REGION_OF = { mirwen: 'mirwen', hydra: 'mirwen', elderwood: 'elderwood', nox: 'elderwood', treant: 'elderwood' };
/** Stage → enemies boss id, and back. */
export const BOSS_OF_STAGE = { boss: 'golem', hydra: 'hydra', nox: 'nox', treant: 'treant', kalis: 'kalis', final: 'nidhoggra' };
export const STAGE_OF_BOSS = Object.fromEntries(Object.entries(BOSS_OF_STAGE).map(([s, b]) => [b, s]));
/** The lost spirit each act boss frees (DESIGN §8.4). */
export const SPIRIT_OF_BOSS = { hydra: 'water', nox: 'shadow', treant: 'nature', kalis: 'light' };
/** Minimum level per story segment for debugSkip (CONTRACT §17). */
export const MIN_LEVEL = { first: 9, second: 15, ascent: 21, final: 25 };
/** Act per stage (world.setActVisible). */
export const ACT_OF = {
  wake: 1, choose: 1, training: 1, updraft: 1, camps: 1, boss: 1,
  reveal: 2, mirwen: 2, hydra: 2, elderwood: 2, nox: 3, treant: 3,
  ascent: 4, kalis: 4, final: 5, ending: 5, done: 5,
};
/** Training steps (DESIGN §5.6). 'learn' completes on skillLearned followed by loadoutChanged. */
export const TRAIN_STEPS = ['basic', 'charged', 'quick', 'defend', 'dodge', 'learn'];
export const TRAIN_BASIC_N = 5;

/** The 5 ascent steps (DESIGN §8.4 #13): golem arena top → updrafts → the 거울의 정원 ledge. y = minimum height (or null). */
export const ASCENT_STEPS = [
  { id: 'gate', name: '유적 북문', x: 0, z: -110, r: 9, y: null },
  { id: 'draft1', name: '첫 번째 상승기류', x: 27, z: -129, r: 7, y: null },
  { id: 'draft2', name: '두 번째 상승기류', x: 33, z: -147, r: 7, y: null },
  { id: 'rim', name: '거울의 정원 가장자리', x: 60, z: -150, r: 22, y: 30 },
  { id: 'ledge', name: '거울의 정원', x: 60, z: -150, r: 11, y: 31 },
];
/** Elderwood: the forest child's grove (escort target) and the rot walls. */
export const GROVE = { x: 100, z: -66, r: 7 };
/** Fallback NPC coordinates (DESIGN §8.3) when world has no spot. */
export const NPC_FALLBACK = {
  lakeKeeper: { x: -59, z: -61.5, face: [-80, -72] },
  forestChild: { x: 63, z: -44, face: [82, -62] },
  undina: { x: -96, z: -88, face: [-82, -80] },
  nox: { x: 64, z: -48, face: [60, -40] },
  sylvania: { x: 100, z: -66, face: [84, -62] },
  lumiel: { x: 66, z: -154, face: [60, -150] },
};
/** Spirit shrine ids per element (world.shrines). */
export const SHRINE_OF = { water: 'spirit_undina', shadow: 'spirit_nox', nature: 'spirit_sylvania', light: 'spirit_lumiel' };
/** Spirit NPC of each lost element. */
export const SPIRIT_NPC = { water: 'undina', shadow: 'nox', nature: 'sylvania', light: 'lumiel' };

const firstRegion = (S) => S.regionOrder.length <= 1;
/** Region quest XP depends on whether it is played first (act 2) or second (act 3) (DESIGN §5.1 budget). */
const rxp = (first, second) => (S) => (firstRegion(S) ? first : second);

export const QUESTS = [
  { id: 'wake', title: '깨어난 각인', act: 1, kind: 'talk', giver: 'elder', xp: 50, next: 'choose',
    objective: () => '촌장 노아와 이야기하기',
    markers: (S, g, H) => { H.mark(H.npc('elder')); } },
  { id: 'choose', title: '여섯 갈래의 길', act: 1, kind: 'talk', xp: 50, next: 'training',
    objective: () => '원소의 제단에서 여섯 스승 중 한 명과 이야기하기',
    markers: (S, g, H) => { for (const id of H.mentorIds()) H.npc(id); H.mark(H.altar()); } },
  { id: 'training', title: '첫 수련', act: 1, kind: 'train', xp: 200, next: 'updraft',
    objective: (S, g, H) => H.trainObjective(),
    markers: (S, g, H) => H.trainMarkers() },
  { id: 'updraft', title: '바람의 깃털', act: 1, kind: 'talk', giver: 'child', xp: 150, next: 'camps',
    objective: (S) => (!S.timoTalked ? '서쪽 들판의 티모와 이야기하기' : S.featherActive ? '상승기류를 타고 바위 꼭대기의 바람 깃털 얻기' : '바람 깃털을 손에 넣었다!'),
    markers: (S, g, H) => { if (!S.timoTalked) H.mark(H.npc('child')); else if (S.featherActive) H.mark(H.add(H.feather(), 'quest', '바람 깃털')); } },
  { id: 'camps', title: '평원의 그림자', act: 1, kind: 'camps', giver: 'captain', xp: 250, next: 'boss',
    objective: (S, g, H) => { const p = H.camps(); if (S.rowenTalked) H.prog(p.cur, p.max); return S.rowenTalked ? '솔레아 평원의 마물 거점 소탕' : '북문의 경비대장 로웬과 이야기하기'; },
    markers: (S, g, H) => H.campMarkers() },
  { id: 'boss', title: '봉인의 유적', act: 1, kind: 'boss', boss: 'golem', xp: 0, next: 'reveal',
    objective: () => '봉인의 유적에서 고대 바위 골렘 정화하기',
    markers: (S, g, H) => { H.mark(H.add(H.arena('golem'), 'boss', '봉인의 유적')); } },
  { id: 'reveal', title: '갈라진 봉인', act: 2, kind: 'talk', giver: 'sage', xp: 300, next: null,
    objective: (S) => (!S.flags.sageTalked ? '마을의 기록관 이솔데와 이야기하기' : '정령의 문으로 미르웬 또는 엘더우드로 향하기'),
    markers: (S, g, H) => {
      if (!S.flags.sageTalked) { H.mark(H.npc('sage')); return; }
      H.add(H.gate('gate_mirwen') || H.zone('mirwen'), 'quest', '안개호수 미르웬');
      H.mark(H.add(H.gate('gate_elderwood') || H.zone('elderwood'), 'quest', '잿빛 수림 엘더우드'));
    } },
  { id: 'mirwen', title: '물안개 너머', act: 2, kind: 'reach', region: 'mirwen', giver: 'lakeKeeper', xp: rxp(1000, 3000), next: 'hydra',
    objective: (S) => (!S.flags.naelTalked ? '미르웬 호숫가의 호수지기 나엘과 이야기하기' : '얼음다리를 건너 운디나의 성소에 닿기'),
    markers: (S, g, H) => { if (!S.flags.naelTalked) H.mark(H.npc('lakeKeeper')); else H.mark(H.add(H.shrine('spirit_undina'), 'quest', '운디나의 성소')); } },
  { id: 'hydra', title: '세 개의 머리', act: 2, kind: 'boss', boss: 'hydra', region: 'mirwen', xp: rxp(1200, 4100), next: null,
    objective: () => '삼두 물뱀 레비아탄을 쓰러뜨리고 운디나 해방하기',
    markers: (S, g, H) => { H.mark(H.add(H.arena('hydra'), 'boss', '레비아탄')); } },
  { id: 'elderwood', title: '잿빛 숲의 속삭임', act: 2, kind: 'escort', region: 'elderwood', giver: 'forestChild', xp: rxp(600, 2600), next: 'nox',
    objective: (S, g, H) => {
      if (!S.flags.momoTalked) return '엘더우드 숲 어귀의 숲정령 아이 모모와 이야기하기';
      const w = H.walls(); H.prog(w.cur + (S.flags.escortDone ? 1 : 0), w.max + 1);
      return w.cur < w.max ? `썩은 덩굴 벽 걷어내기 (${w.cur}/${w.max}) — 불로 태우거나 빛으로 정화하거나 부수기` : '모모를 실바니아의 숲까지 데려가기';
    },
    markers: (S, g, H) => {
      if (!S.flags.momoTalked) { H.mark(H.npc('forestChild')); return; }
      const w = H.walls();
      if (w.cur < w.max) { for (const p of H.wallPositions()) H.add(p, 'quest', '썩은 덩굴'); H.mark(H.nearestWall()); }
      else { H.npc('forestChild', ''); H.mark(H.add(H.grove(), 'quest', '실바니아의 숲')); }
    } },
  { id: 'nox', title: '타락한 정령', act: 3, kind: 'boss', boss: 'nox', region: 'elderwood', xp: rxp(300, 2000), next: 'treant',
    objective: () => '어둠의 숲 빈터에서 녹스와 겨루어 정화하기',
    markers: (S, g, H) => { H.mark(H.add(H.arena('nox'), 'boss', '녹스')); } },
  { id: 'treant', title: '수호수의 심장', act: 3, kind: 'boss', boss: 'treant', region: 'elderwood', xp: rxp(300, 2500), next: null,
    objective: () => '썩은 수호수 모르그로스를 쓰러뜨리고 실바니아 해방하기',
    markers: (S, g, H) => { H.mark(H.add(H.arena('treant'), 'boss', '모르그로스')); } },
  { id: 'ascent', title: '하늘로 가는 뿌리', act: 4, kind: 'ascent', xp: 0, next: 'kalis',
    objective: (S, g, H) => { H.prog(S.ascentStep, ASCENT_STEPS.length); const s = ASCENT_STEPS[Math.min(S.ascentStep, ASCENT_STEPS.length - 1)]; return `상승기류와 뿌리 길을 따라 거울의 정원으로 — ${s.name}`; },
    markers: (S, g, H) => { const s = ASCENT_STEPS[Math.min(S.ascentStep, ASCENT_STEPS.length - 1)]; H.mark(H.add(H.point(s.x, s.z), 'quest', s.name)); } },
  { id: 'kalis', title: '거울의 사도', act: 4, kind: 'boss', boss: 'kalis', xp: 1500, next: 'final',
    objective: () => '거울의 사도 칼리스를 쓰러뜨리고 루미엘 해방하기',
    markers: (S, g, H) => { H.mark(H.add(H.arena('kalis'), 'boss', '칼리스')); } },
  { id: 'final', title: '세계수의 새벽', act: 5, kind: 'boss', boss: 'nidhoggra', xp: 0, next: 'ending',
    objective: () => '세계수 뿌리 고원에서 공허룡 니드호그라를 쓰러뜨리기',
    markers: (S, g, H) => { H.mark(H.add(H.arena('nidhoggra'), 'boss', '니드호그라')); } },
  { id: 'ending', title: '세계수의 새벽', act: 5, kind: 'ending', xp: 0, next: 'done',
    objective: () => '에테리아에 새벽이 밝아 온다',
    markers: () => {} },
  { id: 'done', title: '에필로그', act: 5, kind: 'free', xp: 0, next: null,
    objective: () => '자유롭게 에테리아를 누비며 사람들과 이야기하기',
    markers: () => {} },
];
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
export const STAGES = QUESTS.map((q) => q.id);
export const TITLES = Object.fromEntries(QUESTS.map((q) => [q.id, q.title]));

/** Quest XP for completing stage `id` (number). */
export function questXp(id, S) {
  const q = QUEST_BY_ID[id]; if (!q) return 0;
  return typeof q.xp === 'function' ? q.xp(S) : (q.xp || 0);
}

/** The next stage after `id` is complete (branch-aware). S.regionOrder lists the regions started so far. */
export function nextStage(id, S) {
  const q = QUEST_BY_ID[id]; if (!q) return null;
  const reg = REGION_OF[id];
  if (reg) {
    const stages = REGIONS[reg];
    const i = stages.indexOf(id);
    if (i < stages.length - 1) return stages[i + 1];
    // region finished: the other region (not started yet) or the ascent
    const other = REGION_IDS.find((r) => !S.regionOrder.includes(r));
    return other ? REGIONS[other][0] : 'ascent';
  }
  return q.next;
}

/** Which stages (in order) are complete before `stage`, for a given region order (used by debugSkip / save). */
export function stagesBefore(stage, order) {
  const linear = ['wake', 'choose', 'training', 'updraft', 'camps', 'boss', 'reveal'];
  if (linear.includes(stage)) return linear.slice(0, linear.indexOf(stage));
  const out = linear.slice();
  const reg = REGION_OF[stage];
  if (reg) {
    const first = order[0] || reg;
    if (first !== reg) out.push(...REGIONS[first]);
    const st = REGIONS[reg]; out.push(...st.slice(0, st.indexOf(stage)));
    return out;
  }
  for (const r of REGION_IDS) out.push(...REGIONS[r]);
  const tail = ['ascent', 'kalis', 'final', 'ending', 'done'];
  out.push(...tail.slice(0, tail.indexOf(stage)));
  return out;
}
