// Class select panel "여섯 갈래의 길" (CONTRACT §17/§18 ui.openClassPanel({onPick}), DESIGN §5.6): 6 cards with a
// portrait silhouette, fantasy line, weapon, signature, element access chips (primary gold, secondary silver) and a stat
// radar. "이 길로 간다" confirms (through ui.confirm) and calls onPick(cls). Every value comes from CLASS_DEFS.
import { CLASS_DEFS, CLASS_IDS, TALENTS } from '../core/classes.js';
import { elName } from '../core/elements.js';
import { h, esc } from './dom.js';
import { elementSVG, elCss, classSVG } from './icons.js';
import { CLASS_KO, CLASS_LINE_KO, CLASS_STARS, CLASS_BEGINNER, ONBOARD_KO } from './text.js';

const AXES = ['hp', 'res', 'power', 'defense', 'crit', 'move'];
function axisVal(b, k) {
  switch (k) {
    case 'hp': return b.hp / 160;
    case 'res': return Math.max(b.mp || 0, b.resolve || 0, 60) / 120;
    case 'power': return (b.power || 1) / 1.0 - 0.1;
    case 'defense': return 0.25 + (b.defense || 0) / 0.24;
    case 'crit': return 0.2 + (b.crit || 0) / 0.25;
    case 'move': return (b.move || 1) / 1.1;
    default: return 0.5;
  }
}
function radarSVG(base) {
  const R = 36, cx = 50, cy = 50;
  let grid = '', axes = '', labels = '', pts = '';
  for (let ring = 1; ring <= 3; ring++) {
    let p = '';
    AXES.forEach((_, i) => { const a = (i / AXES.length) * Math.PI * 2 - Math.PI / 2; p += `${(cx + Math.cos(a) * R * ring / 3).toFixed(1)},${(cy + Math.sin(a) * R * ring / 3).toFixed(1)} `; });
    grid += `<polygon points="${p}" class="g"/>`;
  }
  AXES.forEach((k, i) => {
    const a = (i / AXES.length) * Math.PI * 2 - Math.PI / 2;
    const v = Math.max(0.15, Math.min(1, axisVal(base, k)));
    axes += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * R).toFixed(1)}" y2="${(cy + Math.sin(a) * R).toFixed(1)}" class="g"/>`;
    pts += `${(cx + Math.cos(a) * R * v).toFixed(1)},${(cy + Math.sin(a) * R * v).toFixed(1)} `;
    labels += `<text x="${(cx + Math.cos(a) * (R + 9)).toFixed(1)}" y="${(cy + Math.sin(a) * (R + 9) + 2.5).toFixed(1)}">${CLASS_KO.radar[k]}</text>`;
  });
  return `<svg viewBox="0 0 100 100" class="aw-radar">${grid}${axes}<polygon points="${pts}" class="v"/>${labels}</svg>`;
}

export function createClassPanel(game, ui, parent) {
  const root = parent.appendChild(h('div', 'aw-screen aw-modal aw-classes', `
    <div class="aw-classes-inner">
      <div class="aw-classes-head"><div class="aw-classes-title">${CLASS_KO.panelTitle}</div><div class="aw-classes-sub">${CLASS_KO.panelSub}</div><div class="aw-classes-later">${ONBOARD_KO.changeLater}</div><button class="aw-btn aw-btn-small aw-classes-more" data-kact="more">${ONBOARD_KO.more}</button></div>
      <div class="aw-classes-grid"></div>
      <div class="aw-menu aw-menu-row"><button class="aw-btn" data-kact="cancel">${CLASS_KO.cancel}</button><button class="aw-btn aw-btn-primary" data-kact="pick" disabled>${CLASS_KO.pick}</button></div>
    </div>`));
  const grid = root.querySelector('.aw-classes-grid'), pickBtn = root.querySelector('[data-kact="pick"]');
  grid.innerHTML = CLASS_IDS.map((id) => {
    const c = CLASS_DEFS[id];
    const t1 = TALENTS[c.talents?.[1]];
    const chips = c.primary.map((el) => `<span class="aw-echip p" style="--ec:${elCss(el)}">${elementSVG(el, 14)}${esc(elName(el))}</span>`).join('')
      + c.secondary.map((el) => `<span class="aw-echip s" style="--ec:${elCss(el)}">${elementSVG(el, 14)}${esc(elName(el))}</span>`).join('');
    return `<button class="aw-ccard f-${c.family}" data-cls="${id}" style="--cc:${elCss(c.primary[0])};--cc2:${elCss(c.primary[1] || c.primary[0])}">
      <div class="aw-ccard-top"><div class="aw-ccard-art">${classSVG(c.style)}</div>
        <div class="aw-ccard-id"><div class="aw-ccard-name">${esc(c.nameKo)}<small>${esc(c.title || '')}</small></div><div class="aw-ccard-fam">${CLASS_KO.family[c.family] || ''}</div></div>
        ${radarSVG(c.base || {})}</div>
      <div class="aw-ccard-badges">${CLASS_BEGINNER.includes(c.dodge) ? `<i class="aw-badge-new">${ONBOARD_KO.recommended}</i>` : ''}<i class="aw-stars" title="${ONBOARD_KO.stars}">${'★'.repeat(CLASS_STARS[c.dodge] || 2)}${'☆'.repeat(3 - (CLASS_STARS[c.dodge] || 2))}</i></div>
      <div class="aw-ccard-how" data-dodge="${esc(c.dodge || '')}"></div>
      <div class="aw-ccard-line">${esc(c.fantasyKo || '')}</div>
      <div class="aw-ccard-more">
      <div class="aw-ccard-row"><b>${CLASS_KO.weapon}</b><span>${esc(c.weaponKo || c.weapon)}</span></div>
      <div class="aw-ccard-row"><b>${CLASS_KO.signature}</b><span>${esc(c.signatureKo || t1?.nameKo || '')}</span></div>
      <div class="aw-ccard-sigdesc">${esc(t1?.desc || '')}</div>
      </div>
      <div class="aw-ccard-els"><b>${CLASS_KO.elements}</b><div>${chips}</div></div>
    </button>`;
  }).join('');
  let sel = null, onPick = null, onCancel = null;
  function select(id) {
    sel = CLASS_DEFS[id] ? id : null;
    for (const c of grid.children) c.classList.toggle('sel', c.dataset.cls === sel);
    pickBtn.disabled = !sel;
  }
  root.addEventListener('click', (e) => {
    const card = e.target.closest('.aw-ccard');
    if (card) { game.audio?.play?.('ui_select'); select(card.dataset.cls); return; }
    const b = e.target.closest('[data-kact]'); if (!b) return;
    game.audio?.play?.('ui_click');
    if (b.dataset.kact === 'cancel') { api.close(); return; }
    if (b.dataset.kact === 'pick' && sel) api.pick(sel);
    if (b.dataset.kact === 'more') { root.classList.toggle('detail'); return; }
  });
  root.addEventListener('dblclick', (e) => { const card = e.target.closest('.aw-ccard'); if (card) { select(card.dataset.cls); api.pick(sel); } });

  const api = {
    el: root,
    isOpen: false,
    open({ onPick: pick, onCancel: cancel, current } = {}) {
      onPick = typeof pick === 'function' ? pick : null;
      onCancel = typeof cancel === 'function' ? cancel : null;
      select(current || null);
      for (const n of root.querySelectorAll('.aw-ccard-how')) n.textContent = ui.fmt ? ui.fmt(CLASS_LINE_KO[n.dataset.dodge] || '') : (CLASS_LINE_KO[n.dataset.dodge] || '');
      api.isOpen = true;
      root.classList.add('show');
    },
    /** Confirm a class (asks through ui.confirm unless opts.noConfirm). */
    pick(cls, { noConfirm = false } = {}) {
      if (!CLASS_DEFS[cls]) return false;
      const go = () => {
        const f = onPick; onPick = null; onCancel = null;
        api.close(true);
        try { f?.(cls); } catch (err) { console.error('[ui] class pick', err); }
      };
      if (noConfirm || !ui.confirm) go(); else ui.confirm(CLASS_KO.confirm(CLASS_DEFS[cls].nameKo), go);
      return true;
    },
    close(picked = false) {
      if (!api.isOpen) return;
      api.isOpen = false; root.classList.remove('show');
      const c = onCancel; onPick = null; onCancel = null;
      if (!picked) { try { c?.(); } catch (_) { /* */ } }
      ui.modalClosed?.('class');
    },
    get selected() { return sel; },
  };
  return api;
}
