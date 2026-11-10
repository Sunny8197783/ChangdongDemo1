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
  tree: '스킬 트리', character: '캐릭터', codex: '도감', interact: '상호작용', pause: '일시정지', mute: '음소거',
};
/** 'legacy' for test URLs with path= (Digit1-5 element select, F legacy ultimate), else 'v3'. */
export function keymapMode(game) {
  try { return game?.isTest && new URLSearchParams(location.search).has('path') ? 'legacy' : 'v3'; }
  catch (_) { return 'v3'; }
}

/**
 * v4 keymap actions (PLAN §6.8, §7.4.1) → the legacy KEYS name each one keeps in sync (rebinding an action also updates
 * KEYS so v3 code reading game.KEYS / input.actionPressed(name) follows it). Actions without a KEYS twin are v4-only.
 */
export const ACTION_KEYS = { dodge: 'dodge', defend: 'defend', interact: 'interact', codex: 'codex', skills: 'tree' };
/** Korean names of the v4 actions (settings → 조작). */
export const ACTION_NAMES_KO = {
  dodge: '회피', dodgeAlt: '회피 (보조)', defend: '방어', jump: '점프', sprint: '달리기', interact: '상호작용',
  skills: '스킬 트리', codex: '도감', confirm: '확인',
};
/** Korean key labels (player-facing; §6.11 tokens resolve through keymap.label). */
const MOUSE_KO = ['마우스 왼쪽', '마우스 휠 버튼', '마우스 오른쪽', '마우스 4번 버튼', '마우스 5번 버튼'];
const NAMED_KO = {
  Space: '스페이스바', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: 'Backspace',
  ShiftLeft: 'Shift', ShiftRight: '오른쪽 Shift', ControlLeft: 'Ctrl', ControlRight: '오른쪽 Ctrl', AltLeft: 'Alt', AltRight: '오른쪽 Alt',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', CapsLock: 'Caps Lock', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
};
/** Korean label of a KeyboardEvent.code or 'Mouse<n>'. */
export function keyLabelKo(code) {
  if (!code) return '';
  if (code.startsWith('Mouse')) { const n = +code.slice(5); return MOUSE_KO[n] || `마우스 ${n + 1}번 버튼`; }
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return '숫자패드 ' + code.slice(6);
  if (/^F\d+$/.test(code)) return code;
  return NAMED_KO[code] || code;
}

/**
 * game.input.keymap (PLAN §7.4.1): get(action) → code, rebind(action, code), label(action) → Korean key label,
 * plus gameplay queries pressed/down/released(action) (gameplay-locked like input.pressed). Bindings persist in
 * settings.keybinds; unknown actions fall back to the legacy KEYS table.
 */
export function createKeymap(game, defaults) {
  const binds = () => game.settings?.values?.keybinds || defaults;
  const syncLegacy = () => { const b = binds(); for (const [a, k] of Object.entries(ACTION_KEYS)) if (b[a]) KEYS[k] = b[a]; };
  const q = (action, keyFn, btnFn) => {
    const code = api.get(action); if (!code) return false;
    const inp = game.input;
    if (code.startsWith('Mouse')) return inp[btnFn](+code.slice(5));
    return inp[keyFn](code);
  };
  const api = {
    actions: Object.keys(defaults),
    NAMES_KO: ACTION_NAMES_KO,
    get(action) { return binds()[action] || defaults[action] || KEYS[action] || KEYS[ACTION_KEYS[action]] || null; },
    rebind(action, code) {
      if (!action || typeof code !== 'string' || !code) return false;
      const next = { ...binds(), [action]: code };
      game.settings?.set?.('keybinds', next);
      syncLegacy();
      return true;
    },
    label(action) { return keyLabelKo(api.get(action)); },
    /** action bound to this code, or null. */
    actionOf(code) { const b = binds(); for (const a of Object.keys(b)) if (b[a] === code) return a; return null; },
    reset() { game.settings?.set?.('keybinds', { ...defaults }); syncLegacy(); },
    pressed(action) { return q(action, 'pressed', 'mousePressed'); },
    down(action) { return q(action, 'down', 'mouseDown'); },
    released(action) { return q(action, 'released', 'mouseReleased'); },
    syncLegacy,
  };
  syncLegacy();
  return api;
}
