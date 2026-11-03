// Spirit-gate destination list (CONTRACT §18 ui.openGateMenu(gates, onPick)) and the generic confirm modal (ui.confirm).
// list = [{id, name, zoneId, zoneName, reached, current}] (world/gates.js). onPick(id) is called for a reached, non-current gate.
import { h, esc } from './dom.js';
import { GATE_KO, CONFIRM_KO } from './text.js';

export function createGateMenu(game, ui, parent) {
  const root = parent.appendChild(h('div', 'aw-screen aw-modal aw-gates', `
    <div class="aw-panel aw-gate-panel">
      <div class="aw-panel-title"><span>${GATE_KO.title}</span></div>
      <div class="aw-gate-sub">${GATE_KO.sub}</div>
      <div class="aw-gate-list"></div>
      <div class="aw-menu aw-menu-row">
        <button class="aw-btn aw-btn-small" data-gact="tree">${GATE_KO.tree}</button>
        <button class="aw-btn" data-gact="close">${GATE_KO.close}</button>
      </div>
    </div>`));
  const list = root.querySelector('.aw-gate-list');
  let onPick = null, items = [];
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-gate],[data-gact]'); if (!b) return;
    game.audio?.play?.('ui_click');
    if (b.dataset.gact === 'close') { api.close(); return; }
    if (b.dataset.gact === 'tree') { api.close(); ui.openSkillTree?.(); return; }
    const it = items.find((x) => x.id === b.dataset.gate);
    if (!it || !it.reached || it.current) return;
    const f = onPick; api.close();
    try { f?.(it.id); } catch (err) { console.error('[ui] gate pick', err); }
  });
  const api = {
    el: root,
    isOpen: false,
    open(gates, pick) {
      items = Array.isArray(gates) ? gates : [];
      onPick = typeof pick === 'function' ? pick : null;
      list.innerHTML = items.map((g) => `<button class="aw-gate${g.reached ? '' : ' unknown'}${g.current ? ' current' : ''}" data-gate="${esc(g.id)}"${g.reached && !g.current ? '' : ' disabled'}>
        <span class="aw-gate-rune"></span><span class="aw-gate-name">${esc(g.reached ? g.name : GATE_KO.unknown)}</span>
        <span class="aw-gate-zone">${esc(g.reached ? g.zoneName || '' : '')}</span>
        <span class="aw-gate-st">${g.current ? GATE_KO.here : g.reached ? GATE_KO.travel : ''}</span></button>`).join('');
      api.isOpen = true;
      root.classList.add('show');
    },
    close() { if (!api.isOpen) return; api.isOpen = false; root.classList.remove('show'); onPick = null; ui.modalClosed?.('gate'); },
  };
  return api;
}

export function createConfirm(game, ui, parent) {
  const root = parent.appendChild(h('div', 'aw-screen aw-modal aw-confirm', `
    <div class="aw-panel aw-confirm-panel"><div class="aw-confirm-text"></div>
      <div class="aw-menu aw-menu-row"><button class="aw-btn" data-cact="no">${CONFIRM_KO.no}</button><button class="aw-btn aw-btn-primary" data-cact="yes">${CONFIRM_KO.yes}</button></div></div>`));
  const textEl = root.querySelector('.aw-confirm-text');
  let yes = null, no = null;
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cact]'); if (!b) return;
    game.audio?.play?.('ui_click');
    const f = b.dataset.cact === 'yes' ? yes : no;
    api.close(true);
    try { f?.(); } catch (err) { console.error('[ui] confirm', err); }
  });
  const api = {
    el: root,
    isOpen: false,
    open(text, onYes, onNo) { textEl.textContent = text || ''; yes = onYes || null; no = onNo || null; api.isOpen = true; root.classList.add('show'); },
    /** Close without answering (Escape) counts as "no". */
    close(answered = false) {
      if (!api.isOpen) return;
      api.isOpen = false; root.classList.remove('show');
      const f = no; yes = no = null;
      if (!answered) { try { f?.(); } catch (_) { /* */ } }
      ui.modalClosed?.('confirm');
    },
    yes() { if (!api.isOpen) return; const f = yes; api.close(true); try { f?.(); } catch (_) { /* */ } },
  };
  return api;
}
