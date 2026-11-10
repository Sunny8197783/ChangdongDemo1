// Story v4 copy (PLAN §6.1, §6.3): dialogue skip / fast-forward hint, objective "how" lines and the training telegraph
// lesson. Templated with the §6.11 tokens (resolved by game.ui.fmtKo); no literal key names.
export const SKIP_Q = '대화를 건너뛸까요?';
export const FF_HINT = '{confirmKey} / F / 클릭 — 계속 · 길게 누르면 빨리 넘기기 · Esc 건너뛰기';
/** Second "how" line of the objective panel per stage (S → string). */
export const HOW = {
  wake: () => '{interactKey}로 대화하기',
  choose: () => '스승에게 다가가 {interactKey}로 대화',
  training: () => '스승의 지시를 따라 하나씩 해 보세요',
  updraft: (S) => (!S.timoTalked ? '나침반의 표식을 따라가세요' : '불씨 항아리를 깨거나 풀에 불을 붙이고 → 불 위에서 점프 → {jumpKey} 길게'),
  camps: (S) => (S.rowenTalked ? '입구는 나침반의 깃발 방향' : '나침반의 표식을 따라 북문으로'),
  boss: () => '빛 기둥을 따라 유적으로',
  reveal: (S) => (!S.flags.sageTalked ? '{interactKey}로 대화하기' : '정령의 문에서 {interactKey}'),
  mirwen: (S) => (!S.flags.naelTalked ? '{interactKey}로 대화하기' : '성소에서 {interactKey}로 조사'),
  elderwood: () => '덩굴은 화염·빛·대지 공격에 약해요',
  ascent: () => '상승기류 위에서 {jumpKey} 길게',
  hydra: () => '빛 기둥을 따라 보스에게', nox: () => '빛 기둥을 따라 보스에게', treant: () => '빛 기둥을 따라 보스에게',
  kalis: () => '빛 기둥을 따라 보스에게', final: () => '빛 기둥을 따라 보스에게',
};
/** Training telegraph lesson (§6.1): the dummy's slow danger swing ×2, then one parry swing. B = class cannot parry. */
export const LESSON = {
  title: '위험 표시 읽기',
  danger: '빨간 영역이 가득 차기 직전에 {dodgeKey}로 회피!',
  parry: '금빛 = 패링할 수 있는 공격. 가득 차기 직전에 {defendKey}!',
  parryB: '금빛 공격도 {dodgeKey}로 피할 수 있어요.',
  done: '좋아요! 실전에서도 이렇게 피하면 됩니다.',
};
