// Korean dialogue script. Node format (interpreted by story/dialogue.js):
//   { s: speakerId, t: 'text' }                     — a line ({…} = gold emphasis)
//   { s, t, ask: [{ t, desc?, go?: nodes|fn }] }    — line + choices (go nodes are spliced in front of the queue)
//   (S) => nodes | void                              — action / dynamic branch (runs immediately)
// Speakers: npc ids (see SPEAKERS) or 'narr' (no nameplate).

export const SPEAKERS = {
  elder: { name: '노아', title: '바람결 마을 촌장', voice: 0.78, color: '#9fd98a' },
  mageMentor: { name: '엘리시아', title: '대마도사', voice: 1.32, color: '#c9a4ff' },
  swordMentor: { name: '바르칸', title: '검성', voice: 0.68, color: '#ff9a6a' },
  captain: { name: '로웬', title: '경비대장', voice: 0.9, color: '#8fb8ff' },
  merchant: { name: '미라', title: '떠돌이 상인', voice: 1.18, color: '#ffc86a' },
  child: { name: '티모', title: '호기심 많은 꼬마', voice: 1.55, color: '#8fffc1' },
  villagerA: { name: '리나', title: '세탁부', voice: 1.22, color: '#ffa8b8' },
  villagerB: { name: '도란', title: '방앗간 주인', voice: 0.82, color: '#e0c07a' },
  villagerC: { name: '보리 할아버지', title: '낚시꾼', voice: 0.72, color: '#8fe0d8' },
  narr: { name: '', title: '', voice: 1.0, color: '#f6ecd2' },
};

export const SPIRITS = {
  fire: { name: '이그니스', el: '화염', desc: '화염의 정령 {이그니스} — 뜨겁고 성급한 불꽃. 폭발과 화상으로 모든 것을 불사른다. 풀을 태워 상승기류를 만들 수도 있다.' },
  ice: { name: '글라시아', el: '냉기', desc: '냉기의 정령 {글라시아} — 고요하고 차가운 여왕. 적을 둔화시키고 얼려 산산조각 낸다. 물을 얼려 길을 만든다.' },
  lightning: { name: '볼타', el: '번개', desc: '번개의 정령 {볼타} — 장난기 많은 섬광. 가장 빠르고 적 사이를 연쇄로 튄다. 젖은 적에게 치명적이다.' },
  wind: { name: '실피아', el: '바람', desc: '바람의 정령 {실피아} — 자유로운 방랑자. 적을 띄우고 밀쳐 내며, 하늘을 나는 듯한 기동력을 준다.' },
  earth: { name: '테라곤', el: '대지', desc: '대지의 정령 {테라곤} — 묵직한 수호자. 느리지만 압도적인 파괴력과 단단한 방어를 준다.' },
};
const EL_ORDER = ['fire', 'ice', 'lightning', 'wind', 'earth'];

const PATH_DESC = {
  all: '다섯 원소를 모두 다루는 {원소의 방랑자} — 원소를 자유롭게 바꾸며 반응을 일으킨다. 대신 {각성 궁극기와 필살기는 쓸 수 없다}.',
  master: '하나의 원소를 극한까지 — {각성 궁극기}, {컷신 필살기}, {보조 스킬} 해금. 그 원소의 피해 ×1.25. 다른 원소는 쓸 수 없다.',
};

// ------------------------------------------------------------------------------------------------ 촌장 노아: wake
export function elderWake(S) {
  return [
    { s: 'elder', t: '오, 일어났구나. 간밤에 바람이 유난히 울더니… 얘야, 손등을 좀 보여 주겠니?' },
    { s: 'narr', t: '손등에 다섯 갈래의 빛이 어린 문양이 은은하게 떠올라 있다.' },
    { s: 'elder', t: '…역시. 그건 {원소의 각인}이란다. 천 년 만에 다시 나타난, {수호자}의 증표지.' },
    { s: 'elder', t: '옛이야기를 들려주마. 이 대륙 {에테리아}의 한가운데에는 세계수 {아스트라}가 자라고 있단다.' },
    { s: 'elder', t: '저 북동쪽 산 너머로 빛나는 커다란 나무가 보이지? 그래, 바로 저것이야.' },
    { s: 'elder', t: '아스트라에게서 다섯 정령이 태어났지. 화염의 {이그니스}, 냉기의 {글라시아}, 번개의 {볼타}, 바람의 {실피아}, 대지의 {테라곤}.' },
    { s: 'elder', t: '천 년 전, 별의 틈에서 {공허의 안개}가 쏟아져 내려 대륙을 집어삼켰단다.' },
    { s: 'elder', t: '최초의 {원소 수호자}들이 정령과 계약해 그 안개를 북쪽 {봉인의 유적}에 가두었고…' },
    { s: 'elder', t: '유적의 수문장, {고대 바위 골렘}이 천 년 동안 그 봉인을 지켜 왔지.' },
    { s: 'elder', t: '그런데 요즘 봉인이 약해졌어. 새어 나온 안개에 물든 마물들이 {솔레아 평원}에 거점을 세웠단다.' },
    { s: 'elder', t: '…게다가 수문장 골렘마저 안개에 잠식되었다는 소식이 들려오는구나.', ask: [
      { t: '제가… 수호자라고요?', go: [
        { s: 'elder', t: '허허, 믿기 어렵겠지. 나도 네가 아장아장 걷던 시절을 기억하는걸.' },
        { s: 'elder', t: '하지만 정령은 아무나 고르지 않는단다. 네 안에서 무언가를 본 게지.' },
      ] },
      { t: '제가 무엇을 하면 되나요?', go: [
        { s: 'elder', t: '서두르는 그 눈빛, 네 아버지를 꼭 닮았구나. 허허.' },
      ] },
    ] },
    { s: 'elder', t: '마을 서쪽의 {원소의 제단}으로 가 보거라. 대마도사 {엘리시아}와 검성 {바르칸}이 너를 기다리고 있다.' },
    { s: 'elder', t: '누구의 가르침을 받을지, 어떤 길을 걸을지… 그건 네가 정하는 거란다.' },
    { s: 'elder', t: '바람이 너를 인도하길.' },
  ];
}

// ------------------------------------------------------------------------------------------------ 두 스승: choose
export function mentorsMeet(S) {
  const first = !S.flags.metMentors;
  S.flags.metMentors = true;
  const intro = first ? [
    { s: 'mageMentor', t: '어머, 드디어 왔네! 각인이 떠오른 아이라길래 얼마나 대단한가 했는데… 음, 귀엽잖아?' },
    { s: 'swordMentor', t: '…흥. 엘리시아, 수다는 그쯤 해 둬라. 녀석, 눈빛은 나쁘지 않군.' },
    { s: 'mageMentor', t: '나는 {엘리시아}. 에테리아에서 제일가는 천재 대마도사지. 겸손은 내 장점이 아니야.' },
    { s: 'mageMentor', t: '마법의 길을 걸으면 멀리서 원소를 부려 적을 휩쓸 수 있어. 불덩이, 얼음 창, 낙뢰… 화려하고, 무엇보다 {아름답지}!' },
    { s: 'mageMentor', t: '{마나}로 주문을 외고, 위험하면 {마력 방벽}으로 막고, {블링크}로 순간이동! 영리한 사람에게 어울리는 길이란다.' },
    { s: 'swordMentor', t: '나는 {바르칸}. 검 한 자루로 서른 해를 버텼다. 말은 짧게 하지.' },
    { s: 'swordMentor', t: '검의 길은 정직하다. 적의 숨결이 닿는 거리에서 베고, 막고, 피한다. 한 합 한 합이 {무겁다}.' },
    { s: 'swordMentor', t: '칼날에 원소를 입혀 휘두르고, {간파}로 공격을 흘려 되받아친다. {질풍보}로 파고들어라. 겁쟁이에겐 안 맞는 길이지.' },
    { s: 'mageMentor', t: '자, 골라 봐! 물론 날 고르겠지만?' },
    { s: 'swordMentor', t: '강요하지 마라. …네 마음이 가는 쪽으로 해.' },
  ] : [
    { s: 'mageMentor', t: '돌아왔구나! 마음은 정했어?' },
  ];
  return [
    ...intro,
    { s: 'narr', t: '누구의 가르침을 받겠습니까?', ask: [
      { t: '엘리시아에게 {마법}을 배운다', desc: '원거리 원소 마법 · 마나 소모 · {마력 방벽}(E) · {블링크}(Q) · 화려한 광역 주문', go: () => classPicked(S, 'mage') },
      { t: '바르칸에게 {검술}을 배운다', desc: '근접 원소 검술 · 묵직한 연격 · {검 막기/간파}(E) · {질풍보}(Q) · 완벽 회피 후 반격', go: () => classPicked(S, 'sword') },
      { t: '조금만 더 생각해 볼게요', desc: '대화를 마칩니다. 언제든 다시 말을 걸 수 있습니다.', go: [
        { s: 'swordMentor', t: '서두를 것 없다. 우린 어디 안 간다.' },
        { s: 'mageMentor', t: '그래도 너무 오래 기다리게 하면 삐질 거야!' },
      ] },
    ] },
  ];
}

function classPicked(S, cls) {
  S.temp.cls = cls;
  const M = cls === 'mage' ? 'mageMentor' : 'swordMentor';
  const react = cls === 'mage' ? [
    { s: 'mageMentor', t: '역시! 안목이 있구나! 후회하지 않게 해 줄게.' },
    { s: 'swordMentor', t: '…흥. 마음이 바뀌면 언제든 찾아와라.' },
  ] : [
    { s: 'swordMentor', t: '좋다. 각오는 됐겠지.' },
    { s: 'mageMentor', t: '에에? 저 무뚝뚝한 아저씨를? …뭐, 응원할게. 다치지 마!' },
  ];
  return [...react, ...pathExplain(S, M)];
}

function pathExplain(S, M) {
  const mage = M === 'mageMentor';
  const lines = mage ? [
    { s: M, t: '이제 더 중요한 걸 정해야 해. 정령과 {어떻게 계약할지} 말이야.' },
    { s: M, t: '첫째, {원소의 방랑자}. 다섯 정령 모두와 얕게 계약해서 {다섯 원소를 전부} 다룰 수 있어.' },
    { s: M, t: '상황에 맞게 원소를 바꾸고, 섞어서 반응을 일으키는 재미가 있지. 대신 계약이 얕아서 {각성 궁극기}와 {필살기}는 못 써.' },
    { s: M, t: '둘째, {원소의 대가}. 단 하나의 정령과 깊이 계약해서 그 원소를 {극한까지} 끌어올리는 길이야.' },
    { s: M, t: '그 원소밖에 못 쓰지만 위력이 훨씬 강해지고, {각성 궁극기}, {컷신 필살기}, {보조 스킬}이 열려. 한 우물만 파는 천재의 길이지!' },
  ] : [
    { s: M, t: '다음이다. 정령과 {어떻게 계약할지} 정해라.' },
    { s: M, t: '하나, {원소의 방랑자}. 다섯 정령 모두와 얕게 맺는다. {다섯 원소}를 바꿔 가며 칼날에 입힐 수 있지.' },
    { s: M, t: '원소를 섞어 반응을 일으키는 건 강력한 무기다. 다만 계약이 얕아 {각성 궁극기}와 {필살기}는 쓸 수 없다.' },
    { s: M, t: '둘, {원소의 대가}. 단 하나의 정령과 깊이 맺는다. 그 원소만 쓰지만, 그걸 {극한까지} 벼린다.' },
    { s: M, t: '{각성 궁극기}, 일격필살의 {필살기}, {보조 스킬}이 열린다. 한 길만 파는 자의 칼은 무섭지.' },
  ];
  return [
    ...lines,
    { s: M, t: mage ? '자, 어느 쪽이 마음에 들어?' : '고르라.', ask: [
      { t: '원소의 방랑자', desc: PATH_DESC.all, go: () => { S.temp.path = 'all'; S.temp.element = null; return confirm(S, M); } },
      { t: '원소의 대가', desc: PATH_DESC.master, go: () => { S.temp.path = 'master'; return elementPick(S, M); } },
      { t: '다시 설명해 주세요', desc: '두 길의 차이를 한 번 더 듣습니다.', go: () => pathExplain(S, M) },
    ] },
  ];
}

function elementPick(S, M) {
  const mage = M === 'mageMentor';
  return [
    { s: M, t: mage ? '좋아, 어느 정령과 계약할래? 정령마다 성격이 꽤 다르거든. 하나하나 살펴봐.' : '어느 정령과 맺겠나. 신중히 골라라. 평생 함께할 칼이다.', ask: EL_ORDER.map((el) => ({
      t: `${SPIRITS[el].el} — ${SPIRITS[el].name}`, desc: SPIRITS[el].desc, element: el,
      go: () => { S.temp.element = el; return confirm(S, M); },
    })) },
  ];
}

function confirm(S, M) {
  const mage = M === 'mageMentor';
  const t = S.temp;
  const nm = t.path === 'all' ? '' : SPIRITS[t.element].name;
  const fc = nm ? nm.charCodeAt(nm.length - 1) - 0xAC00 : -1;
  const wa = fc >= 0 && fc < 11172 && fc % 28 ? '과' : '와';   // 받침 → 과 (테라곤과), else 와 (이그니스와)
  const what = t.path === 'all' ? '{원소의 방랑자}의 길' : `{${nm}}${wa} 계약하는 {원소의 대가}의 길`;
  return [
    { s: M, t: mage ? `${what}… 정말 이걸로 할 거야? 계약은 되돌릴 수 없어.` : `${what}이라. …후회는 없겠지. 계약은 되돌릴 수 없다.`, ask: [
      { t: '네, 이 길로 하겠습니다', desc: t.path === 'all' ? PATH_DESC.all : SPIRITS[t.element].desc, go: [
        { s: M, t: mage ? '좋아! 제단 한가운데에 서서 눈을 감아 봐. 정령이 응답할 거야.' : '좋다. 제단에 서라. 눈을 감고, 정령의 목소리를 들어라.' },
        () => { S.finishChoice(); },
      ] },
      { t: '다시 고를래요', desc: '길 선택으로 돌아갑니다.', go: () => pathExplain(S, M) },
    ] },
  ];
}

// ------------------------------------------------------------------------------------------------ training
const KEYS = {
  mage: { basic: '좌클릭으로 {기본 마법}', heavy: '우클릭을 꾹 눌렀다 떼면 {충전 마법}', dash: 'Q로 {블링크}', block: 'E를 누르고 있으면 {마력 방벽}' },
  sword: { basic: '좌클릭으로 {베기} — 연달아 누르면 연격', heavy: '우클릭을 꾹 눌렀다 떼면 {충전 일격}', dash: 'Q로 {질풍보}', block: 'E를 누르고 있으면 {검 막기}' },
};
export function trainingStepText(cls, step, master) {
  const k = KEYS[cls] || KEYS.mage;
  switch (step) {
    case 'go': return '수련장으로 가기';
    case 'basic': return '허수아비 공격하기';
    case 'heavy': return '충전 공격 사용하기 (우클릭 길게)';
    case 'ultimate': return `${master ? '각성 궁극기' : '궁극기'} 사용하기 (F)`;
    case 'block': return `${cls === 'sword' ? '검 막기로' : '마력 방벽으로'} 공격 막기 (E 길게)`;
    case 'dash': return `${cls === 'sword' ? '질풍보' : '블링크'}로 몸 날리기 (Q)`;
    default: return '';
  }
}
/** Bark (non-blocking line) when a training step begins. */
export function trainingBark(cls, step, master) {
  const k = KEYS[cls] || KEYS.mage;
  const mage = cls !== 'sword';
  switch (step) {
    case 'go': return mage ? '수련장으로 와! 마을 동쪽, 허수아비들 있는 곳이야.' : '수련장으로 와라. 마을 동쪽이다.';
    case 'basic': return mage ? `${k.basic}! 허수아비에게 다섯 번 맞혀 봐.` : `${k.basic}이 이어진다. 다섯 번 베어라.`;
    case 'heavy': return mage ? '좋아! 이번엔 우클릭을 꾹 눌렀다 떼서 {충전 마법}을 써 봐. 오래 모을수록 강해져!' : '됐다. 이번엔 우클릭을 꾹 눌렀다 떼서 {충전 일격}을 날려라. 힘을 끝까지 모아라.';
    case 'ultimate': return mage ? `F로 ${master ? '{각성 궁극기}' : '{궁극기}'}! 아끼지 말고 크게 한 방!` : `F, ${master ? '{각성 궁극기}' : '{궁극기}'}. 전부 쏟아부어라.`;
    case 'block': return mage ? `이제 방어! ${k.block}이야. 허수아비가 공격할 테니, 맞기 직전에 펼치면 {완벽 방어}!` : `${k.block}다. 허수아비가 칠 거다. 맞기 직전에 막으면 {간파}다.`;
    case 'dash': return mage ? '마지막! Q를 눌러 {블링크}로 순간이동해 봐. 무적 시간도 있어!' : '마지막이다. Q를 눌러 {질풍보}로 몸을 날려라. 공격 직전에 피하면 {완벽 회피}다.';
    case 'done': return mage ? '훌륭해! 이리 와서 얘기 좀 하자!' : '…됐다. 이리 와라.';
    default: return '';
  }
}
export function mentorTrainingTalk(S, M, step) {
  const mage = M === 'mageMentor';
  if (step === 'done') {
    return mage ? [
      { s: M, t: '와, 생각보다 훨씬 잘하는데? 역시 내 제자야!' },
      { s: M, t: '정령의 힘이 네 몸에 잘 스며들고 있어. 쓰면 쓸수록 더 강해질 거야.' },
      { s: M, t: '그런데 진짜 수호자라면 하늘도 좀 날 줄 알아야지. 꼬마 {티모}가 네게 보여 줄 게 있대.' },
      { s: M, t: '마을 서쪽, 커다란 바위 기둥 아래 들판에 있을 거야. 다녀와!' },
      () => { S.completeTraining(); },
    ] : [
      { s: M, t: '…나쁘지 않다. 기본은 됐군.' },
      { s: M, t: '칼은 몸이 기억하는 거다. 매일 휘둘러라.' },
      { s: M, t: '티모 녀석이 널 찾더군. 서쪽 바위 기둥 아래 들판이다. 하늘을 나는 법이라나.' },
      { s: M, t: '…가 봐라. 녀석, 기다리다 지치면 혼자 불장난을 할 놈이다.' },
      () => { S.completeTraining(); },
    ];
  }
  return [{ s: M, t: trainingBark(S.cls(), step, S.master()) }];
}

// ------------------------------------------------------------------------------------------------ 티모: updraft
export function timoUpdraft(S) {
  return [
    { s: 'child', t: '앗, 왔다! 진짜 수호자님이다! 손등 보여 주세요! …우와, 반짝반짝해!' },
    { s: 'child', t: '저기 높은 바위 보여요? 꼭대기에 {바람 깃털}이 있어요! 바람의 정령 실피아님의 깃털이래요.' },
    { s: 'child', t: '근데 너무 높아서 아무도 못 올라가요. 그런데… 제가 비밀을 알아냈어요!' },
    { s: 'child', t: '뜨거운 불 위에는 {상승기류}가 생겨요. 모닥불 연기가 막 위로 솟구치잖아요!' },
    { s: 'child', t: '여기 {불씨 항아리}를 터뜨리거나 풀을 태운 다음, 불 위에서 점프하고 {스페이스를 꾹} 눌러 활공하면…' },
    { s: 'child', t: '슈우우웅! 하늘로 올라가요!', ask: [
      { t: '위험하지 않을까?', go: [
        { s: 'child', t: '에이, 수호자님이잖아요! …그래도 불 속에 오래 서 있진 마세요. 엄청 뜨거워요.' },
      ] },
      { t: '좋아, 해 볼게!', go: [
        { s: 'child', t: '우와아! 역시 수호자님!' },
      ] },
    ] },
    { s: 'child', t: '깃털을 가져오면 분명 더 오래 달리고 날 수 있을 거예요! 화이팅!' },
    () => { S.startFeather(); },
  ];
}

// ------------------------------------------------------------------------------------------------ 로웬: camps
export function rowenCamps(S) {
  return [
    { s: 'captain', t: '네가 노아 촌장님이 말씀하신 수호자로군. 바람결 마을 경비대장 {로웬}이다.' },
    { s: 'captain', t: '상황이 좋지 않다. 북쪽 {솔레아 평원}에 마물들이 거점을 {세 군데}나 세웠어.' },
    { s: 'captain', t: '안개에 물든 보코블린, 츄츄, 그리고 주술사들이다. 밤마다 마을 근처까지 내려오고 있지.' },
    { s: 'captain', t: '우리 경비대로는 마을을 지키는 것만으로도 벅차. …부탁한다. {거점 세 곳}을 소탕해 줘.' },
    { s: 'captain', t: '거점을 모두 무너뜨리면 안개가 유적으로 몰려들 거다. 그때 {봉인의 유적}으로 가는 길이 열리겠지.', ask: [
      { t: '맡겨 주세요.', go: [
        { s: 'captain', t: '든든하군. 무리하지 마라. 쓰러지면 마지막으로 정리한 거점 근처에서 정신을 차리게 될 거다.' },
      ] },
      { t: '마물은 어떻게 상대하면 되죠?', go: [
        { s: 'captain', t: '{주술사}부터 노려라. 멀리서 성가시게 굴지. 츄츄는 원소에 약하다.' },
        { s: 'captain', t: '젖은 놈에게 번개, 언 놈에게 강한 일격… 원소끼리 부딪히면 {반응}이 일어난다. 직접 보면 알 거다.' },
        { s: 'captain', t: '거점 근처엔 {불씨 항아리}도 있다. 잘 이용해 봐라.' },
      ] },
    ] },
    { s: 'captain', t: '평원의 바람이 너와 함께하길. 북문을 나서면 바로 평원이다.' },
    () => { S.startCampHunt(); },
  ];
}

// ------------------------------------------------------------------------------------------------ ambient / reactions
// Per NPC, per story phase: list of short conversations (cycled on each talk).
// phases: early (wake/choose), training, updraft, camps, boss, done
export const AMBIENT = {
  elder: {
    early: [[{ s: 'elder', t: '제단은 마을 서쪽에 있단다. 두 스승이 기다리고 있을 게다.' }]],
    training: [[{ s: 'elder', t: '정령의 축복을 받았구나. 네 눈빛이 달라졌어. 허허.' }, { s: 'elder', t: '수련을 게을리하지 말거라. 힘은 다루는 법을 알 때 비로소 힘이 되는 법이지.' }]],
    updraft: [[{ s: 'elder', t: '티모 녀석이 또 무슨 일을 꾸미는 모양이더구나. 그래도 그 아이 말은 들어 볼 만하단다.' }]],
    camps: [[{ s: 'elder', t: '평원의 거점이라… 조심하거라. 안개에 물든 마물은 겁을 모른단다.' }, { s: 'elder', t: '하지만 너는 혼자가 아니야. 정령이, 그리고 이 마을이 너와 함께하지.' }]],
    boss: [[{ s: 'elder', t: '북쪽 하늘이 어두워졌구나. 유적의 수문장이 깨어난 게야.' }, { s: 'elder', t: '골렘은 본래 선한 수호자였다. 쓰러뜨리는 것이 곧 그를 안개에서 {해방}하는 길이란다.' }]],
    done: [[{ s: 'elder', t: '해냈구나… 천 년 전 수호자들도 오늘의 너를 자랑스러워할 게다.' }]],
  },
  mageMentor: {
    early: [[{ s: 'mageMentor', t: '빨리 골라 줘! 난 기다리는 거 진짜 못 하거든.' }]],
    training: [[{ s: 'mageMentor', t: '바르칸 아저씨랑 수련은 잘 되고 있어? 그 사람, 웃는 걸 본 적이 없다니까.' }], [{ s: 'mageMentor', t: '마법은 영감이야. 너무 진지하면 불꽃도 시무룩해진다고.' }]],
    updraft: [[{ s: 'mageMentor', t: '상승기류를 타는 법? 바람의 원리를 알면 간단해. 뜨거운 공기는 위로, 너도 위로!' }]],
    camps: [[{ s: 'mageMentor', t: '원소 반응을 노려 봐. 적을 적시고 번개를 꽂으면… 후후, 장관이지.' }], [(S) => (S.cls?.() === 'sword'
      ? [{ s: 'mageMentor', t: '주술사의 구체는 검으로 막기보다 {질풍보}로 피하는 게 나아. 바르칸 아저씨도 그렇게 말할걸?' }]
      : [{ s: 'mageMentor', t: '주술사가 쏘는 구체는 {마력 방벽}으로 {되받아칠} 수도 있어. 타이밍만 맞으면!' }])]],
    boss: [[{ s: 'mageMentor', t: '골렘은 단단해. 하지만 빈틈은 있어. 크게 휘두른 뒤가 기회야!' }]],
    done: [[{ s: 'mageMentor', t: '거봐, 내 말이 맞았지? 넌 해낼 줄 알았어. …조금은 감동했어. 조금!' }]],
  },
  swordMentor: {
    early: [[{ s: 'swordMentor', t: '고민은 길게, 결정은 짧게.' }]],
    training: [[{ s: 'swordMentor', t: '엘리시아의 수다에 휘말리지 마라. 수련이나 해.' }], [{ s: 'swordMentor', t: '…마법도 나쁘진 않다. 칼이 닿지 않는 곳엔 쓸모가 있지.' }]],
    updraft: [[{ s: 'swordMentor', t: '바위에 오르겠다고? 난 걸어서 올라간다. …농담이다.' }]],
    camps: [[{ s: 'swordMentor', t: '무리 지은 적은 바깥부터 깎아라. 등을 내주지 마라.' }], [(S) => (S.cls?.() === 'sword'
      ? [{ s: 'swordMentor', t: '{완벽 회피} 뒤의 일격은 반드시 급소를 꿰뚫는다. 두려워 말고 파고들어라.' }]
      : [{ s: 'swordMentor', t: '마법사라도 거리를 잃으면 끝이다. 붙으면 {블링크}로 빠져라.' }])]],
    boss: [[{ s: 'swordMentor', t: '거인은 발부터 무너진다. 겁먹지 마라.' }]],
    done: [[{ s: 'swordMentor', t: '…잘했다.' }, { s: 'swordMentor', t: '오늘은 술 한잔 사지.' }]],
  },
  captain: {
    early: [[{ s: 'captain', t: '수호자의 각인이라… 촌장님께 먼저 인사드려라. 이야기는 그다음이다.' }]],
    training: [[{ s: 'captain', t: '수련장 허수아비, 너무 세게 치진 마라. 새로 만드는 데 사흘 걸린다.' }]],
    updraft: [[{ s: 'captain', t: '티모가 또 불장난을? …네가 있다니 다행이군.' }]],
    camps: [[{ s: 'captain', t: '거점은 평원 곳곳에 흩어져 있다. 붉은 깃발과 망루를 찾아라.' }], [{ s: 'captain', t: '쓰러지더라도 포기하지 마라. 우린 널 믿는다.' }]],
    boss: [[{ s: 'captain', t: '거점이 모두 무너졌다! 이제 북쪽, {봉인의 유적}이다.' }, { s: 'captain', t: '수문장을 정화해 줘. 에테리아의 운명이 네 손에 달렸다.' }]],
    done: [[{ s: 'captain', t: '경비대 전원이 네게 경례를 보낸다. …고맙다, 수호자.' }]],
  },
  merchant: {
    early: [[{ s: 'merchant', t: '어서 와요! 떠돌이 상인 {미라}예요. 동쪽 바다부터 서쪽 사막까지, 안 가 본 데가 없죠.' }, { s: 'merchant', t: '어머, 그 손등… 소문이 벌써 시장까지 퍼졌다니까요?' }]],
    training: [[{ s: 'merchant', t: '수련하느라 지쳤죠? 미라 특제 {허브차} 한 잔 하고 가요. 서비스예요!' }]],
    updraft: [[{ s: 'merchant', t: '바람 깃털이요? 그거 하나면 전 재산이랑 바꿀 사람도 있을걸요? …파실 생각 없어요?' }]],
    camps: [[{ s: 'merchant', t: '평원으로 나가요? 그럼 이거 마셔요. 기운이 펄펄 날 거예요!' }], [{ s: 'merchant', t: '마물 거점에서 반짝이는 거 주우면 저한테 먼저 보여 줘요. 약속!' }]],
    boss: [[{ s: 'merchant', t: '유적까지 간다니… 무사히 돌아와야 해요. 단골손님 잃는 건 질색이거든요.' }]],
    done: [[{ s: 'merchant', t: '오늘은 전부 공짜! 마을의 영웅한테 돈을 받을 순 없죠!' }]],
  },
  child: {
    early: [[{ s: 'child', t: '수호자님! 수호자님이다! 이따가 꼭 놀러 와요! 보여 줄 게 있어요!' }]],
    training: [[{ s: 'child', t: '수련 끝나면 서쪽 바위로 와요! 엄청난 비밀이 있어요!' }]],
    updraft: [[{ s: 'child', t: '불씨 항아리를 터뜨리고, 불 위에서 점프! 그리고 스페이스를 꾹! 슈우웅!' }]],
    camps: [[{ s: 'child', t: '저도 크면 수호자님처럼 될 거예요! 바람 깃털, 소중히 해 주세요!' }], [{ s: 'child', t: '불 위로 날아오를 때 기분 최고죠? 그쵸?!' }]],
    boss: [[{ s: 'child', t: '골렘이요? 무서워요… 그래도 수호자님은 이길 거예요. 그쵸?' }]],
    done: [[{ s: 'child', t: '우와아아! 진짜 해냈어! 나중에 저도 제자로 받아 주세요!' }]],
  },
  villagerA: {
    early: [[{ s: 'villagerA', t: '오늘따라 바람이 좋네. 빨래가 금방 마르겠어.' }]],
    training: [[{ s: 'villagerA', t: '아까 제단 쪽에서 빛이 번쩍하던데, 그게 너였니? 세상에!' }]],
    updraft: [[{ s: 'villagerA', t: '서쪽에서 연기가 나던데… 설마 또 티모니?' }]],
    camps: [[{ s: 'villagerA', t: '평원에 나가는 거니? 조심하렴. 다녀오면 따뜻한 수프 끓여 놓을게.' }]],
    boss: [[{ s: 'villagerA', t: '북쪽 하늘이 무섭게 변했어… 모두 너를 믿고 있단다.' }]],
    done: [[{ s: 'villagerA', t: '축제다, 축제! 오늘 밤엔 다 같이 춤추자!' }]],
  },
  villagerB: {
    early: [[{ s: 'villagerB', t: '풍차가 쌩쌩 도는 걸 보니 올해 밀 농사도 걱정 없겠구먼.' }]],
    training: [[{ s: 'villagerB', t: '허허, 수련장에서 쿵쾅대는 소리가 여기까지 들리더구먼. 힘이 넘치는구먼!' }]],
    updraft: [[{ s: 'villagerB', t: '바위 꼭대기라… 내 젊었을 적엔 거기 올라가 보는 게 소원이었지.' }]],
    camps: [[{ s: 'villagerB', t: '마물들이 밀밭까지 내려와서 큰일이야. 자네만 믿겠네.' }], [{ s: 'villagerB', t: '거점 하나 무너질 때마다 바람이 조금씩 맑아지는 것 같구먼.' }]],
    boss: [[{ s: 'villagerB', t: '풍차가 멈췄어… 바람마저 숨을 죽인 게야.' }]],
    done: [[{ s: 'villagerB', t: '봐라, 풍차가 다시 돈다! 바람이 돌아왔어!' }]],
  },
  villagerC: {
    early: [[{ s: 'villagerC', t: '쉿… 물고기가 놀란다네. …그래, 각인이 떠올랐다고? 허어, 오래 살고 볼 일이구먼.' }]],
    training: [[{ s: 'villagerC', t: '냉기의 힘이라면 이 연못도 얼릴 수 있겠지. 얼음 위를 걷는 기분, 꽤 괜찮다네.' }]],
    updraft: [[{ s: 'villagerC', t: '나도 왕년엔 상승기류 좀 탔지. …물론 거짓말이네. 허허.' }]],
    camps: [[{ s: 'villagerC', t: '물에 젖은 마물에게 번개를 쓰면 짜릿하다던데. 낚시엔 쓰지 말게나.' }]],
    boss: [[{ s: 'villagerC', t: '물고기들이 숨어 버렸어. 큰 게 오고 있는 게야.' }]],
    done: [[{ s: 'villagerC', t: '오늘은 물고기도 기분이 좋은지 잘 무는구먼. 허허허.' }]],
  },
};
