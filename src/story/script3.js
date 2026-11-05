// Story v3 Korean script (DESIGN §5.6, §8.1, §8.3–8.4, §14). Same node format as story/script.js:
//   { s: speakerId, t: 'text' } · { s, t, ask:[{t, desc?, go}] } · (S) => nodes | void
// All player-facing text of the v3 story lives here (data); story.js only wires it.
// Tone rules (DESIGN §14): no blood/gore words; 공허 only for the wyrm and its servants.

/** New speakers (merged into SPEAKERS by story.js). */
export const SPEAKERS3 = {
  rangerMentor: { name: '아리엔', title: '바람의 사수', voice: 1.4, color: '#9dffcb' },
  paladinMentor: { name: '오르벤', title: '늙은 방패지기', voice: 0.72, color: '#ffe08a' },
  spiritMentor: { name: '세리아', title: '숲의 목소리', voice: 1.26, color: '#9be86a' },
  shadowMentor: { name: '카이렌', title: '그림자 칼날', voice: 0.86, color: '#b98bff' },
  sage: { name: '이솔데', title: '마을 기록관', voice: 1.12, color: '#e6d2ff' },
  lakeKeeper: { name: '나엘', title: '미르웬 호수지기', voice: 0.76, color: '#6fc8ff' },
  forestChild: { name: '모모', title: '숲정령 아이', voice: 1.7, color: '#c8f06a' },
  trainer: { name: '하람', title: '반응 수련장 관리인', voice: 0.95, color: '#ffb86a' },
  undina: { name: '운디나', title: '물의 정령', voice: 1.18, color: '#6fc8ff' },
  sylvania: { name: '실바니아', title: '자연의 정령', voice: 1.05, color: '#9be86a' },
  nox: { name: '녹스', title: '그림자의 정령', voice: 0.6, color: '#b98bff' },
  lumiel: { name: '루미엘', title: '빛의 정령', voice: 1.36, color: '#ffe08a' },
  terragon: { name: '테라곤', title: '대지의 정령 · 기억', voice: 0.55, color: '#f0bd6e' },
};

// ------------------------------------------------------------------------------------------------ 각 스승 소개 (choose)
/** Per mentor: the pitch before the class panel opens. Keys are mentor ids (CLASS_DEFS[cls].mentor). */
export const MENTOR_PITCH = {
  mageMentor: [
    { s: 'mageMentor', t: '어머, 드디어 왔네! 나는 {엘리시아}. 에테리아에서 제일가는 천재 대마도사지. 겸손은 내 장점이 아니야.' },
    { s: 'mageMentor', t: '마법사는 원소를 {엮는} 사람이야. 불을 붙이고, 얼리고, 그 둘을 부딪쳐 {반응}을 터뜨리지. 화려하고, 무엇보다 아름답지!' },
  ],
  swordMentor: [
    { s: 'swordMentor', t: '나는 {바르칸}. 검 한 자루로 서른 해를 버텼다. 말은 짧게 하지.' },
    { s: 'swordMentor', t: '검사는 칼날에 원소를 입힌다. 막고, {간파}하고, 되받아친다. 한 합 한 합이 무겁다.' },
  ],
  rangerMentor: [
    { s: 'rangerMentor', t: '안녕! 나는 {아리엔}. 바람이 부는 곳이면 어디든 내 화살이 닿지. 헤헤.' },
    { s: 'rangerMentor', t: '궁수는 멀리서, 높이서 싸워. 공중에서 {집중}하면 세상이 느려지거든. 그때 한 발, 정확하게!' },
  ],
  paladinMentor: [
    { s: 'paladinMentor', t: '…오르벤이라 하네. 이 방패로 마을 문을 마흔 해 지켰지.' },
    { s: 'paladinMentor', t: '성기사는 앞에 선다. 방패로 막고, 망치로 {봉인}을 새기고, 빛으로 동료를 지키지. 쓰러지지 않는 것도 힘이라네.' },
  ],
  spiritMentor: [
    { s: 'spiritMentor', t: '쉿… 방금 저 참새가 네 이야기를 했어. 나는 {세리아}. 숲의 목소리를 듣는 사람이야.' },
    { s: 'spiritMentor', t: '정령술사는 혼자 싸우지 않아. {정령 동료}를 불러 함께 춤추고, 물과 숲으로 상처를 감싸 주지.' },
  ],
  shadowMentor: [
    { s: 'shadowMentor', t: '카이렌이다. 한때는 남의 주머니를 털었지. 지금은… 마물의 목숨을 턴다고 해 두지.' },
    { s: 'shadowMentor', t: '암살자는 그림자 속에서 움직인다. {표식}을 새기고, 한순간에 터뜨린다. 맞기 전에 사라지는 게 요령이지.' },
  ],
};
/** Shown on the first talk at the altar, before the pitch. */
export const ALTAR_FIRST = [
  { s: 'narr', t: '원소의 제단 둘레에 여섯 스승이 서 있다. 저마다 다른 무기, 다른 원소의 빛.' },
];
export const MENTOR_ASK = { s: 'narr', t: '어느 길을 걸을지 정했습니까?' };
/** Mentor's line after the player picked their class (keyed by mentor id). */
export const MENTOR_ACCEPT = {
  mageMentor: '역시! 안목이 있구나! 제단 한가운데 서 봐. 정령들이 네 이름을 부를 거야.',
  swordMentor: '좋다. 각오는 됐겠지. 제단에 서라. 정령의 목소리를 들어라.',
  rangerMentor: '좋았어! 바람이 벌써 네 편이야. 제단으로 가자, 정령들이 기다려!',
  paladinMentor: '…잘 골랐네. 방패는 무겁지만, 지키는 이의 마음은 가볍지. 제단으로 가세.',
  spiritMentor: '숲이 웃고 있어. 들리니? 제단에 서면 정령들이 너를 안아 줄 거야.',
  shadowMentor: '흥, 재밌군. 제단에 서라. 그림자는 생각보다 따뜻하다.',
};
export const CHOICE_LATER = { t: '조금 더 생각해 볼게요', desc: '대화를 마칩니다. 언제든 다시 말을 걸 수 있습니다.' };

// ------------------------------------------------------------------------------------------------ 첫 수련 (training)
/** Per-class kit names (data keyed by the kit types of CLASS_DEFS). */
export const DODGE_KO = { blink: '점멸', dashstep: '질풍보', backflip: '백덤블링', shieldstep: '방패 돌진', spiritswap: '정령 교대', shadowroll: '그림자 구르기' };
export const DEFEND_KO = {
  barrier: '{defendKey}를 누르고 있으면 {마력 방벽}', guard: '{defendKey}를 누르고 있으면 {막기}', focus: '공중이나 회피 직후 {defendKey}를 누르고 있으면 {집중}',
  shield: '{defendKey}를 누르고 있으면 {방패 막기}', ward: '{defendKey}로 {정령 결계}', counter: '{defendKey}로 {반격 자세}',
};
export const DEFEND_OBJ = {
  barrier: '마력 방벽으로 공격 막기 ({defendKey} 길게)', guard: '막기로 공격 막기 ({defendKey} 길게)', focus: '공중에서 집중 쓰기 (점프 후 {defendKey} 길게)',
  shield: '방패 막기로 공격 막기 ({defendKey} 길게)', ward: '정령 결계로 공격 받아내기 ({defendKey})', counter: '반격 자세로 공격 받아치기 ({defendKey})',
};
export function trainingStepText(cls, step, kit) {
  switch (step) {
    case 'go': return '수련장으로 가기';
    case 'basic': return '허수아비에게 기본 공격 5번 (좌클릭)';
    case 'charged': return '충전 공격 사용하기 (우클릭 길게)';
    case 'quick': return '빠른 슬롯 스킬 사용하기 (1)';
    case 'defend': return DEFEND_OBJ[kit?.defend] || '방어로 공격 막기 ({defendKey})';
    case 'dodge': return `${DODGE_KO[kit?.dodge] || '회피'}로 몸 날리기 ({dodgeKey})`;
    case 'learn': return '스킬 트리({skillsKey})에서 노드 하나를 배우고 슬롯에 장착하기';
    case 'done': return '스승에게 돌아가기';
    default: return '';
  }
}
/** Mentor voice per step. `kit` = {dodge, defend}. */
const VOICE = {
  mageMentor: { go: '수련장으로 와! 마을 동쪽, 허수아비들 있는 곳이야.', basic: '좌클릭으로 {기본 마법}! 허수아비에게 다섯 번 맞혀 봐.', charged: '좋아! 우클릭을 꾹 눌렀다 떼서 {충전 마법}! 오래 모을수록 강해져.', quick: '이번엔 {1}번! 빠른 슬롯에 넣어 둔 주문이야.', defend: '방어 연습! {D}. 맞기 직전에 펼치면 {완벽 방어}야!', dodge: '마지막 몸풀기! {dodgeKey}로 {X}! 무적 시간도 있어.', learn: '이제 진짜 공부! {skillsKey}를 눌러 스킬 트리를 열고, 하나 배워서 슬롯에 끼워 봐.', done: '훌륭해! 이리 와서 얘기 좀 하자!' },
  swordMentor: { go: '수련장으로 와라. 마을 동쪽이다.', basic: '좌클릭, {베기}. 다섯 번 베어라.', charged: '우클릭을 꾹 눌렀다 떼라. {충전 일격}이다.', quick: '{1}번. 몸에 새긴 기술을 써 봐라.', defend: '{D}다. 맞기 직전에 막으면 {간파}다.', dodge: '{dodgeKey}, {X}. 공격 직전에 피하면 {완벽 회피}다.', learn: '{skillsKey}. 스킬 트리를 열어 기술 하나를 익히고 손에 쥐어라.', done: '…됐다. 이리 와라.' },
  rangerMentor: { go: '수련장으로 고고! 마을 동쪽이야!', basic: '좌클릭으로 {화살}! 허수아비한테 다섯 발!', charged: '우클릭을 꾹— 시위를 끝까지 당겼다가 놔! {충전 사격}!', quick: '{1}번! 내가 제일 좋아하는 기술이 거기 있다구.', defend: '점프하고 공중에서 {D}! 세상이 느려지는 거 느껴져?', dodge: '{dodgeKey}로 {X}! 뒤로 휙— 멋지게!', learn: '{skillsKey}를 눌러 봐! 별자리에서 하나 골라 배우고 슬롯에 쏙!', done: '완벽했어! 이리 와 봐, 할 얘기 있어!' },
  paladinMentor: { go: '수련장으로 오게. 마을 동쪽일세.', basic: '좌클릭으로 {망치}를 휘두르게. 다섯 번이면 충분하네.', charged: '우클릭을 길게. 힘을 모아 {내려찍기}일세.', quick: '{1}번. 맹세의 기술을 써 보게.', defend: '{D}. 맞기 직전에 들면 공격을 {되받아친다}네.', dodge: '{dodgeKey}, {X}. 방패를 앞세워 밀고 나가게.', learn: '{skillsKey}로 스킬 트리를 열게. 하나를 배우고 손에 쥐는 것까지가 수련이네.', done: '잘했네. 이리 오게.' },
  spiritMentor: { go: '수련장으로 와. 허수아비들이 기다리고 있어. 걔들도 외로우니까.', basic: '좌클릭으로 {정령탄}. 다섯 번 톡톡.', charged: '우클릭을 꾹. 정령들이 모여드는 소리가 들려?', quick: '{1}번. 친구를 불러 보자.', defend: '{D}. 맞는 순간에 결계가 너를 감싸 줄 거야.', dodge: '{dodgeKey}, {X}. 정령과 자리를 바꾸는 거야.', learn: '{skillsKey}를 눌러 봐. 별들 중 하나가 너를 부를 거야. 배우고, 슬롯에 담아.', done: '잘했어. 새들이 박수 치고 있어. 이리 와.' },
  shadowMentor: { go: '수련장. 마을 동쪽. 늦지 마라.', basic: '좌클릭, {쌍검}. 다섯 번 긋는다.', charged: '우클릭을 길게. 숨을 죽였다가 {찌른다}.', quick: '{1}번. 표식을 새겨 봐라.', defend: '{D}다. 맞는 순간 사라져서 등 뒤로.', dodge: '{dodgeKey}, {X}. 그림자 속으로 굴러라.', learn: '{skillsKey}. 기술 하나 훔쳐… 아니, 배워서 손에 쥐어라.', done: '나쁘지 않군. 이리 와.' },
};
export function trainingBark(mentorId, step, kit) {
  const v = VOICE[mentorId] || VOICE.mageMentor;
  return (v[step] || '').replace('{D}', DEFEND_KO[kit?.defend] || '{defendKey}로 {방어}').replace('{X}', `{${DODGE_KO[kit?.dodge] || '회피'}}`);
}
const PRAISE = {
  mageMentor: ['좋아!', '멋져!', '바로 그거야!', '완벽해!'], swordMentor: ['좋다.', '그거다.', '나쁘지 않군.', '됐다.'],
  rangerMentor: ['나이스!', '명중!', '최고야!', '헤헤, 좋아!'], paladinMentor: ['훌륭하네.', '좋아.', '그렇지.', '든든하군.'],
  spiritMentor: ['예쁘다!', '좋아, 좋아.', '정령들이 기뻐해.', '그거야.'], shadowMentor: ['좋아.', '빠르군.', '깔끔하다.', '흥, 제법.'],
};
export function praise(mentorId, i) { const a = PRAISE[mentorId] || PRAISE.mageMentor; return a[i % a.length]; }
/** Talking to the mentor when every step is done → Timo / updraft. */
export function mentorTrainingDone(S, M) {
  const lines = {
    mageMentor: ['와, 생각보다 훨씬 잘하는데? 역시 내 제자야!', '그런데 진짜 수호자라면 하늘도 좀 날 줄 알아야지. 꼬마 {티모}가 보여 줄 게 있대.'],
    swordMentor: ['…나쁘지 않다. 기본은 됐군.', '티모 녀석이 널 찾더군. 서쪽 바위 기둥 아래 들판이다. 하늘을 나는 법이라나.'],
    rangerMentor: ['봤지? 너 재능 있어! 내가 그랬잖아!', '아, 티모가 너한테 하늘 나는 비밀을 알려 준대. 서쪽 바위 기둥 아래 들판이야!'],
    paladinMentor: ['훌륭하네. 자네의 방패는 벌써 누군가를 지킬 준비가 되었어.', '티모라는 꼬마가 자네를 찾더군. 서쪽 바위 기둥 아래 들판일세.'],
    spiritMentor: ['정령들이 너를 좋아해. 처음부터 그랬어.', '바람이 그러는데, {티모}가 서쪽 바위 기둥 아래에서 너를 기다린대.'],
    shadowMentor: ['합격이다. 목숨은 건지겠군.', '티모라는 꼬마가 기다린다. 서쪽 바위 기둥 아래. …불장난하기 전에 가 봐라.'],
  }[M] || ['잘했어!', '티모가 서쪽 들판에서 기다린대.'];
  return [...lines.map((t) => ({ s: M, t })), () => { S.completeTraining(); }];
}
export const TIMO_WAITS = { s: 'child', t: '티모는 서쪽 바위 기둥 아래 들판에서 기다리고 있어요!' };
export const TREE_TIP = 'K: 스킬 트리를 열어 첫 포인트를 사용하세요';

// ------------------------------------------------------------------------------------------------ 갈라진 봉인 (reveal)
/** Subtitles of the reveal cinematic (cinematic/reveal.js reads these). */
export const REVEAL_LINES = {
  core: '골렘의 핵이 갈라지고, 그 안에서 봉인의 룬이 떠오른다.',
  terragon1: '봉인은 하나가 아니었다. 다섯 개의 서약이 공허를 묶었고, 나는 그중 하나였다.',
  terragon2: '그런데 그 서약들이… 놈에게 먹히고 있다.',
  channel: '보랏빛 안개가 빛나는 뿌리의 물길을 따라 흘러간다 — 북동쪽, 세계수의 뿌리로.',
  wyrm: '세계수 뿌리 고원. 거대한 뱀이 뿌리를 휘감은 채 잠들어 있다. 세계수의 우듬지가 잿빛으로 물들어 간다.',
  title: '갈라진 봉인', sub: '공허룡 니드호그라',
};
export function sageReveal(S) {
  return [
    { s: 'sage', t: '돌아왔군요. 유적에서 보랏빛 안개가 쏟아지는 걸 봤어요. …그리고 당신이 본 것도, 나는 알 것 같아요.' },
    { s: 'sage', t: '나는 {이솔데}. 이 마을의 기록을 지키는 사람이에요. 그리고 기록에서 {지워진 것}을 찾아 온 사람이기도 하죠.' },
    { s: 'sage', t: '아주 오래전, 세계수 아스트라에게는 다섯이 아니라 {아홉} 아이가 있었어요.' },
    { s: 'sage', t: '뿌리 아래 어둠에서 {공허룡 니드호그라}가 깨어났을 때, 정령들은 {다섯 개의 봉인}으로 놈을 묶었어요.' },
    { s: 'sage', t: '이그니스, 글라시아, 볼타, 실피아, 테라곤 — 다섯 정령은 자기 힘의 조각, {서약}을 떼어 봉인의 열쇠로 삼았죠. 골렘은 테라곤의 서약을 지키는 간수였고요.' },
    { s: 'sage', t: '나머지 넷은 더 큰 대가를 치렀어요. {녹스}는 홀로 놈을 막으려다 타락했고… 사람들은 정령이 변할 수 있다는 사실이 두려웠어요.' },
    { s: 'sage', t: '그래서 그 넷 — {운디나}, {실바니아}, {녹스}, {루미엘} — 의 이름을 이야기에서 지워 버렸어요.' },
    { s: 'elder', t: '…다섯이라 배웠지만… 사실은 {아홉}이었구나.' },
    { s: 'elder', t: '평생 아이들에게 들려준 옛이야기가 반쪽이었다니. 허허… 늙은이가 부끄럽구나.' },
    { s: 'sage', t: '천 년 동안 놈은 세계수의 뿌리를 갉아먹으며, 뿌리의 물길로 다섯 서약을 제 몸에 빨아들였어요. 유적의 안개는 저주가 아니라… 놈의 {숨결}이에요.' },
    { s: 'sage', t: '놈을 막으려면 잊힌 정령들의 힘이 필요해요. 서쪽 {안개호수 미르웬}에는 운디나가, 동쪽 {잿빛 수림 엘더우드}에는 녹스와 실바니아가 잠들어 있어요.' },
    { s: 'sage', t: '두 곳 모두 {정령의 문}으로 갈 수 있어요. 어느 쪽부터 갈지는 당신이 정해요.', ask: [
      { t: '안개호수 미르웬부터', desc: '물의 정령 운디나 — 삼두 물뱀 레비아탄이 호수를 지키고 있다.', go: (S2) => { S2.flags.prefer = 'mirwen'; return [{ s: 'sage', t: '호숫가에 {나엘}이라는 호수지기가 있어요. 그분이 길을 알려 줄 거예요.' }]; } },
      { t: '잿빛 수림 엘더우드부터', desc: '그림자의 정령 녹스, 자연의 정령 실바니아 — 썩은 덩굴이 숲을 막고 있다.', go: (S2) => { S2.flags.prefer = 'elderwood'; return [{ s: 'sage', t: '숲 어귀에 {모모}라는 숲정령 아이가 있어요. 겁이 많지만 길은 잘 알아요.' }]; } },
    ] },
    { s: 'sage', t: '하나 더. 다섯 정령의 봉인이 깨진 지금, 그들의 {깊은 힘}도 깨어났어요. 스킬 트리의 마지막 별들이 당신을 부를 거예요.' },
    () => { S.sageTalked(); },
  ];
}

// ------------------------------------------------------------------------------------------------ 미르웬
export function naelTalk(S) {
  return [
    { s: 'lakeKeeper', t: '허허, 물안개를 헤치고 손님이 오다니. 나는 {나엘}, 이 호수를 육십 년 지켜 온 늙은 어부일세.' },
    { s: 'lakeKeeper', t: '호수 한가운데 섬에 {운디나}님의 성소가 있다네. 어릴 적 할머니가 몰래 들려주시던 이름이지. 다들 잊었지만, 물은 기억하지.' },
    { s: 'lakeKeeper', t: '그런데 요즘 호수 밑에서 {머리 셋 달린 물뱀}이 올라온다네. 레비아탄이라 부르지.' },
    { s: 'lakeKeeper', t: '섬까지 가려면 물을 {얼려 다리}를 놓거나, 물살을 타야 하네. 얼음 원소가 없다면… 섬과 섬 사이를 활공하게.', ask: [
      { t: '레비아탄은 어떻게 상대하죠?', go: [
        { s: 'lakeKeeper', t: '머리마다 원소의 {장막}이 있다네. 물의 머리엔 번개나 얼음, 얼음의 머리엔 불, 번개의 머리엔 대지나 물이 통하지.' },
        { s: 'lakeKeeper', t: '호수를 얼리면 놈의 머리까지 닿는 얼음 고리가 생기네. 큰 물결이 오면 얼음 위나 기둥 위로 피하게.' },
      ] },
      { t: '알겠습니다. 다녀올게요.', go: [{ s: 'lakeKeeper', t: '물이 그대를 품어 주길.' }] },
    ] },
    () => { S.flags.naelTalked = true; S.markDirty(); },
  ];
}
export const UNDINA_CALL = '…누구… 내 이름을 부르는 이가… 아직 남아 있었나요…?';

// ------------------------------------------------------------------------------------------------ 엘더우드
export function momoTalk(S) {
  return [
    { s: 'forestChild', t: '히익! …사, 사람이다. 마물인 줄 알았잖아요! 저는 {모모}예요. 숲정령이에요. 아직 어린.' },
    { s: 'forestChild', t: '숲이 아파요. 보랏빛 {썩은 덩굴}이 길을 다 막아 버렸어요. 실바니아님의 숲까지 못 가요…' },
    { s: 'forestChild', t: '덩굴은 {불}에 타고, {빛}에 녹고, 아주 세게 치면 {부서져요}. 세 군데를 열어 주시면… 제가 길을 안내할게요!' },
    { s: 'forestChild', t: '그리고 저, 저기 어두운 빈터엔 가지 마세요. {녹스}님이… 무서워졌어요.', ask: [
      { t: '같이 가자, 모모.', go: [{ s: 'forestChild', t: '정말요? 히히, 꼭 붙어 다닐게요! 놓고 가면 울 거예요!' }] },
      { t: '녹스는 원래 어떤 정령이었어?', go: [
        { s: 'forestChild', t: '할머니 나무가 그랬어요. 녹스님은 숲의 밤을 지키는 기사였대요. 다들 무서워했지만… 사실은 다정했대요.' },
      ] },
    ] },
    () => { S.startEscort(); },
  ];
}
export const MOMO_BARKS = {
  follow: '기다려요! 같이 가요!', wall: '덩굴이 하나 사라졌어요! 숲이 숨을 쉬어요!', allWalls: '길이 열렸어요! 실바니아님의 숲은 이쪽이에요!',
  arrive: '여기예요! 실바니아님의 숲! …근데 빈터 쪽에서 까마귀 소리가 나요.', scared: '으앙, 너무 멀어요! 기다려 주세요!',
};
export const NOX_TAUNT = '빛도 없는 숲에 무슨 볼일이지, 각인의 아이여. …칼을 뽑아라. 정화든 뭐든, 해 보든가.';
export const TREANT_CALL = '숲의 심장이 썩어 간다… 모르그로스, 우리의 오랜 수호수가 공허에 삼켜졌다.';

// ------------------------------------------------------------------------------------------------ 정령 해방 (cinematic subtitles + NPC lines)
export const SPIRIT_FREED = {
  water: { title: '운디나 해방', sub: '물의 정령이 돌아왔다', line: '고마워요. 천 년 동안 물은 내 이름을 잊지 않았어요. 이제 당신의 물결이 될게요.' },
  shadow: { title: '녹스 정화', sub: '그림자의 정령이 돌아왔다', line: '…흥. 구해 달라고 한 적은 없다만. 빚은 갚지. 내 그림자를 빌려주마.' },
  nature: { title: '실바니아 해방', sub: '자연의 정령이 돌아왔다', line: '숲이 다시 노래해요. 당신의 발자국마다 꽃이 피어날 거예요.' },
  light: { title: '루미엘 해방', sub: '빛의 정령이 돌아왔다', line: '나는 세계수의 빛. 핵은 아직 놈의 가슴속에 갇혀 있어요. 내 {창}을 받아요. 그것만이 심장에 닿을 수 있어요.' },
};
export const SPIRIT_TALK = {
  undina: [[{ s: 'undina', t: '물은 흐르고, 기억해요. 지워진 이름도, 흘린 눈물도. 당신의 이름도 기억할게요.' }], [{ s: 'undina', t: '젖은 적에게 번개를, 얼어붙은 적에게 강한 일격을. 물은 모든 반응의 시작이에요.' }]],
  nox: [[{ s: 'nox', t: '사람들이 날 지웠다지. …탓하진 않는다. 나도 내가 무서웠으니까.' }], [{ s: 'nox', t: '그림자는 빛을 먹지 않는다. 빛이 있어야 그림자도 있는 법이지. 루미엘에게 전해라.' }]],
  sylvania: [[{ s: 'sylvania', t: '모모가 당신 이야기를 쉬지 않고 해요. 숲의 아이들은 수다쟁이랍니다.' }], [{ s: 'sylvania', t: '씨앗은 기다릴 줄 알아요. 천 년이든, 하루든. 그리고 때가 오면 피어나죠.' }]],
  lumiel: [[{ s: 'lumiel', t: '아홉 빛이 다시 모였어요. 이제 뿌리 고원으로. 세계수가 당신을 기다려요.' }], [{ s: 'lumiel', t: '놈의 심장을 열면, 내 창을 던지세요. {V}. 빛은 반드시 닿아요.' }]],
};

// ------------------------------------------------------------------------------------------------ 하늘로 가는 뿌리 / 칼리스 / 최종
export const ASCENT_START = { s: 'sage', t: '세 정령이 모두 돌아왔어요! 이제 {거울의 정원}으로. 유적 북쪽, 상승기류와 뿌리 길을 따라 하늘로 올라가요.' };
export const ASCENT_STEP_BARK = ['유적 북문이에요. 골짜기를 따라 뿌리 쪽으로!', '첫 번째 상승기류! 꾹 눌러 활공해요!', '두 번째 상승기류! 거울의 정원이 보여요!', '거울의 정원 가장자리… 프리즘 거울이 빛나요.', '여기가 거울의 정원… 누군가 있어요.'];
export const KALIS_TAUNT = '거울은 보는 이를 닮는다. 네가 쌓아 온 힘, 고스란히 돌려주마. …나는 칼리스. 루미엘의 간수다.';
export const FINAL_CALL = '뿌리 고원으로! 놈이 깨어났어요 — 공허룡 니드호그라!';
export const FINAL_ARRIVE = '세계수 뿌리 고원. 다섯 뿌리 기둥 사이로, 거대한 그림자가 몸을 일으킨다.';

// ------------------------------------------------------------------------------------------------ 엔딩 (cinematic/finale.js)
export const ENDING_LINES = [
  '공허룡의 가슴에서 세계수의 핵이 풀려나자, 보랏빛 안개는 금빛 꽃가루가 되어 에테리아에 내려앉았다.',
  '잿빛으로 물들던 아스트라의 우듬지가, 천 년 만에 다시 꽃을 피웠다.',
  '미르웬의 물안개가 걷히고, 엘더우드에 꽃이 피고, 뿌리 고원이 푸르게 물들었다.',
  '바람결 마을에는 오랜만에 축제의 등불이 밝혀졌다.',
  '사람들은 아홉 정령의 이름을, 그리고 새로운 수호자의 이름을 오래도록 노래했다.',
];
export const ENDING_TITLE = { text: '세계수의 새벽', sub: '아홉 빛이 다시 하나로' };
export const CREDITS = [
  ['새로운 원소의 수호자', '바람결 마을의 젊은이'],
  ['스승들', '엘리시아 · 바르칸 · 아리엔 · 오르벤 · 세리아 · 카이렌'],
  ['함께한 이들', '촌장 노아 · 기록관 이솔데 · 경비대장 로웬 · 상인 미라'],
  ['', '꼬마 티모 · 호수지기 나엘 · 숲정령 모모 · 수련장 관리인 하람'],
  ['다섯 정령', '이그니스 · 글라시아 · 볼타 · 실피아 · 테라곤'],
  ['잊혔던 넷', '운디나 · 실바니아 · 녹스 · 루미엘'],
];
export const FIN = { text: '끝', sub: '— 그리고 새로운 모험은 계속된다 —' };
export const FINALE_PROMPT = '좌클릭 · R · X — 일격';
export const FINALE_LINE = '아홉 정령의 빛이 하나로 —';

// ------------------------------------------------------------------------------------------------ 수련장 관리인 (reaction trainer)
export const TRAINER_TALK = [
  [
    { s: 'trainer', t: '반응 수련장에 온 걸 환영하네. 나는 {하람}. 저 허수아비는 원소의 기운을 번갈아 두르지.' },
    { s: 'trainer', t: '허수아비가 두른 원소를 보고, 맞는 원소로 치면 {반응}이 터진다네. 화면의 {다음 타격} 표시를 잘 보게.' },
    { s: 'trainer', t: '젖은 놈에게 번개, 언 놈에게 강한 일격, 불에 바람… 조합은 마흔아홉 가지. 다 찾으면 도감이 꽉 차지.' },
  ],
  [{ s: 'trainer', t: '반응 도감은 Tab으로 열 수 있네. 처음 발견한 반응마다 경험치도 준다네.' }],
];

// ------------------------------------------------------------------------------------------------ ambient (P1: per-act phase keys)
/** Ambient conversations for the new NPCs and act-2+ lines for existing ones. Phases: early, training, updraft, camps, boss, act2, act3, act4, final, done. */
export const AMBIENT3 = {
  rangerMentor: {
    early: [[{ s: 'rangerMentor', t: '궁수가 되면 제일 좋은 점? 남들 싸우는 거 위에서 구경할 수 있다는 거!' }]],
    training: [[{ s: 'rangerMentor', t: '바람을 읽어. 바람은 거짓말 안 하거든.' }]],
    act2: [[{ s: 'rangerMentor', t: '미르웬이나 엘더우드에 간다며? 높은 데를 찾아. 위에서 보면 길이 보여.' }]],
    act4: [[{ s: 'rangerMentor', t: '하늘로 가는 뿌리라니! 나도 데려가 주면 안 돼? …안 되겠지.' }]],
    done: [[{ s: 'rangerMentor', t: '봤어? 우듬지에 꽃이 폈어! 활 쏘기 딱 좋은 날씨다!' }]],
  },
  paladinMentor: {
    early: [[{ s: 'paladinMentor', t: '서두르지 말게. 길은 도망가지 않네.' }]],
    training: [[{ s: 'paladinMentor', t: '방패는 자네를 위한 게 아니야. 뒤에 선 사람들을 위한 거지.' }]],
    act2: [[{ s: 'paladinMentor', t: '잊힌 정령이라… 우리 성기사단의 옛 문장에 날개 여섯 달린 새가 있었지. 이제야 알겠군.' }]],
    act4: [[{ s: 'paladinMentor', t: '빛의 정령 루미엘… 살아서 그 이름을 다시 부르게 될 줄이야.' }]],
    done: [[{ s: 'paladinMentor', t: '오늘만큼은 방패를 내려놓아도 되겠군. 허허.' }]],
  },
  spiritMentor: {
    early: [[{ s: 'spiritMentor', t: '저 구름, 토끼 닮지 않았어? …아니라고? 정령들은 닮았다는데.' }]],
    training: [[{ s: 'spiritMentor', t: '정령 동료한테 이름을 지어 줘 봐. 더 잘 따라와.' }]],
    act2: [[{ s: 'spiritMentor', t: '실바니아님… 숲이 꿈속에서 계속 그 이름을 불렀어. 이제야 알아들었네.' }]],
    act4: [[{ s: 'spiritMentor', t: '새들이 북쪽 하늘로 날아가지 않아. 거기 뭔가 커다란 게 있대.' }]],
    done: [[{ s: 'spiritMentor', t: '들려? 숲이 웃고 있어. 천 년 만에.' }]],
  },
  shadowMentor: {
    early: [[{ s: 'shadowMentor', t: '내 지갑 보지 마라. 습관이다.' }]],
    training: [[{ s: 'shadowMentor', t: '맞기 전에 사라져라. 그게 전부다.' }]],
    act2: [[{ s: 'shadowMentor', t: '녹스라… 그림자의 정령이 타락했다고? 남 얘기 같지 않군.' }]],
    act4: [[{ s: 'shadowMentor', t: '거울 속 자신과 싸운다고? 제일 더러운 상대지. 네 버릇을 다 아니까.' }]],
    done: [[{ s: 'shadowMentor', t: '…잘했다. 진심이다. 이번엔 훔친 말 아니야.' }]],
  },
  sage: {
    early: [[{ s: 'sage', t: '기록관의 일은 기억하는 거예요. 사람들이 잊고 싶어 하는 것까지도.' }]],
    camps: [[{ s: 'sage', t: '유적의 안개… 옛 기록과 맞지 않는 게 있어요. 다녀오면 이야기해 줘요.' }]],
    act2: [[{ s: 'sage', t: '운디나, 실바니아, 녹스, 루미엘. 이 이름들을 다시 쓰는 것만으로도 손이 떨려요.' }]],
    act3: [[{ s: 'sage', t: '녹스를 정화했다고요? 기록이 틀렸던 거예요. 정령은 변해도… 돌아올 수 있었어요.' }]],
    act4: [[{ s: 'sage', t: '칼리스는 거울의 사도. 상대를 비춰 그대로 따라 해요. 당신의 가장 강한 원소가 당신을 겨눌 거예요.' }]],
    done: [[{ s: 'sage', t: '새 기록을 쓰고 있어요. 첫 줄은 이미 정했어요. "아홉이 있었다."' }]],
  },
  lakeKeeper: {
    act2: [[{ s: 'lakeKeeper', t: '얼음 위를 걸을 땐 발끝에 힘을 빼게. 물고기처럼.' }]],
    act3: [[{ s: 'lakeKeeper', t: '운디나님이 돌아오신 뒤로 물고기가 춤을 춘다네. 허허.' }]],
    done: [[{ s: 'lakeKeeper', t: '물안개가 걷히니 호수 바닥까지 보이는구먼. 육십 년 만이야.' }]],
  },
  forestChild: {
    act2: [[{ s: 'forestChild', t: '놓고 가면 울 거예요! 진짜예요!' }]],
    act3: [[{ s: 'forestChild', t: '실바니아님이 저 보고 착하대요! 헤헤.' }]],
    done: [[{ s: 'forestChild', t: '숲에 꽃이 피었어요! 수호자님 발자국마다요!' }]],
  },
  trainer: {
    early: [[{ s: 'trainer', t: '각인이 뜬 아이로군. 직업을 정하고 오게. 그다음이 반응 수련이지.' }]],
  },
};
/** Act-2+ lines for the v2 NPCs (merged over their AMBIENT entries). */
export const AMBIENT3_OLD = {
  elder: {
    act2: [[{ s: 'elder', t: '다섯이라 배웠지만… 사실은 아홉이었구나. 이 나이에 새로 배울 게 있다니, 허허.' }]],
    act3: [[{ s: 'elder', t: '녹스… 우리가 두려워 지운 이름이 우리를 구하는구나.' }]],
    act4: [[{ s: 'elder', t: '북쪽 하늘에 빛나는 뿌리가 보이는구나. 조심하거라, 얘야.' }]],
    done: [[{ s: 'elder', t: '아홉 정령의 이야기를 새로 들려줘야겠구나. 이번엔 끝까지.' }]],
  },
  captain: {
    act2: [[{ s: 'captain', t: '유적 너머에서 큰 놈이 꿈틀댄다고? 마을은 우리가 지킨다. 넌 앞만 봐라.' }]],
    act4: [[{ s: 'captain', t: '경비대가 정령의 문을 지키고 있다. 돌아올 곳은 여기다.' }]],
    done: [[{ s: 'captain', t: '경비대 전원이 네게 경례를 보낸다. …고맙다, 수호자.' }]],
  },
  merchant: {
    act2: [[{ s: 'merchant', t: '미르웬의 물고기는 비싸게 팔려요! 하나만 잡아다 줄래요? 농담이에요!' }]],
    act4: [[{ s: 'merchant', t: '하늘까지 간다고요? 단골손님 잃는 건 질색이라니까요. 꼭 돌아와요.' }]],
    done: [[{ s: 'merchant', t: '오늘은 전부 공짜! 마을의 영웅한테 돈을 받을 순 없죠!' }]],
  },
  child: {
    act2: [[{ s: 'child', t: '아홉 정령! 저 이름 다 외웠어요! 운디나, 실바니아, 녹스, 루미엘!' }]],
    done: [[{ s: 'child', t: '우와아아! 진짜 해냈어! 나중에 저도 제자로 받아 주세요!' }]],
  },
};
