// Key map v3 (CONTRACT §6). F is interact only; the ultimate moves to X.
export const KEYS = {
  basic: 'Mouse0', charged: 'Mouse2', q1: 'Digit1', q2: 'Digit2', q3: 'Digit3', q4: 'Digit4',
  ult: 'KeyX', sup: 'KeyG', fin: 'KeyR', attuneNext: 'KeyZ', dodge: 'KeyQ', defend: 'KeyE', gift: 'KeyV',
  tree: 'KeyK', character: 'KeyC', codex: 'Tab', interact: 'KeyF', pause: 'Escape', mute: 'KeyM',
};
/** Display labels (Korean UI) for each binding. */
export const KEY_LABELS = {
  basic: 'LMB', charged: 'RMB', q1: '1', q2: '2', q3: '3', q4: '4', ult: 'X', sup: 'G', fin: 'R', attuneNext: 'Z',
  dodge: 'Q', defend: 'E', gift: 'V', tree: 'K', character: 'C', codex: 'Tab', interact: 'F', pause: 'Esc', mute: 'M',
};
export const KEY_NAMES_KO = {
  basic: '기본 공격', charged: '충전 공격', q1: '빠른 슬롯 1', q2: '빠른 슬롯 2', q3: '빠른 슬롯 3', q4: '빠른 슬롯 4',
  ult: '궁극기', sup: '보조', fin: '필살기', attuneNext: '원소 조율', dodge: '회피', defend: '방어', gift: '정령의 선물',
  tree: '스킬 트리', character: '캐릭터', codex: '원소 도감', interact: '상호작용', pause: '일시정지', mute: '음소거',
};
/** 'legacy' for test URLs with path= (Digit1-5 element select, F legacy ultimate), else 'v3'. */
export function keymapMode(game) {
  try { return game?.isTest && new URLSearchParams(location.search).has('path') ? 'legacy' : 'v3'; }
  catch (_) { return 'v3'; }
}
