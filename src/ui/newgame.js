// §6.1 / §6.8 새 게임: difficulty cards (이야기 / 쉬움 / 보통 / 어려움 with the core DIFFICULTY descriptions) and the
// opening choice 짧게 (약 25초) / 전체 (default 짧게 on the first run = settings.introShort default true).
import { DIFFICULTY, DIFFICULTY_ORDER } from '../core/settings.js';
import { h, esc } from './dom.js';
import { ONBOARD_KO } from './text.js';

export function createNewGame(game, { screens, onStart, onClose }) {
  const el = screens.appendChild(h('div', 'aw-screen aw-modal aw-newgame', `
    <div class="aw-panel aw-panel-wide">
      <div class="aw-panel-title"><span>${ONBOARD_KO.diffTitle}</span></div>
      <div class="aw-diff-cards">${DIFFICULTY_ORDER.map((id) => `<button class="aw-diff" data-diff="${id}"><b>${esc(DIFFICULTY[id].nameKo)}</b><span>${esc(DIFFICULTY[id].descKo)}</span></button>`).join('')}</div>
      <div class="aw-intro-row"><span>${ONBOARD_KO.introTitle}</span>
        <div class="aw-seg"><button data-intro="1">${ONBOARD_KO.introShort}</button><button data-intro="0">${ONBOARD_KO.introFull}</button></div></div>
      <div class="aw-menu aw-menu-row"><button class="aw-btn" data-ng="back">${ONBOARD_KO.back}</button><button class="aw-btn aw-btn-primary" data-ng="start">${ONBOARD_KO.start}</button></div>
    </div>`));
  let diff = 'normal', intro = true, isOpen = false;
  function sync() {
    for (const b of el.querySelectorAll('[data-diff]')) b.classList.toggle('sel', b.dataset.diff === diff);
    for (const b of el.querySelectorAll('[data-intro]')) b.classList.toggle('sel', (b.dataset.intro === '1') === intro);
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    game.audio?.play?.('ui_click');
    if (b.dataset.diff) { diff = b.dataset.diff; sync(); }
    else if (b.dataset.intro) { intro = b.dataset.intro === '1'; sync(); }
    else if (b.dataset.ng === 'back') api.close();
    else if (b.dataset.ng === 'start') { api.close(); onStart?.({ difficulty: diff, introShort: intro }); }
  });
  addEventListener('keydown', (e) => { if (isOpen && e.code === 'Enter') { e.preventDefault(); api.close(); onStart?.({ difficulty: diff, introShort: intro }); } });
  const api = {
    el,
    get isOpen() { return isOpen; },
    open() {
      const S = game.settings?.values || {};
      diff = DIFFICULTY[S.difficulty] ? S.difficulty : 'normal';
      intro = S.introShort !== false;
      sync(); isOpen = true; el.classList.add('show');
    },
    close() { if (!isOpen) return; isOpen = false; el.classList.remove('show'); onClose?.(); },
    cards: () => [...el.querySelectorAll('[data-diff]')].map((b) => ({ id: b.dataset.diff, text: b.textContent })),
  };
  return api;
}
