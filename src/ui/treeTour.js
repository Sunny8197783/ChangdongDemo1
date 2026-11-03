// First-open skill-tree tour (3 pages) + one-time contextual tips (DESIGN §5.6, CONTRACT §18 ui.startTreeTour / ui.tip).
// Seen ids are kept in a Set; story persists them through ui.serializeTips()/deserializeTips() (story.serialize, §17).
import { h } from './dom.js';
import { TOUR_PAGES, TOUR_KO } from './text.js';

export function createTreeTour(game, ui, parent) {
  const root = parent.appendChild(h('div', 'aw-tour', `
    <div class="aw-tour-card">
      <div class="aw-tour-art"></div>
      <div class="aw-tour-page"></div>
      <div class="aw-tour-title"></div>
      <div class="aw-tour-body"></div>
      <div class="aw-tour-dots"></div>
      <div class="aw-tour-acts">
        <button class="aw-btn aw-btn-small" data-tour="skip">${TOUR_KO.skip}</button>
        <button class="aw-btn aw-btn-small" data-tour="prev">${TOUR_KO.prev}</button>
        <button class="aw-btn aw-btn-primary aw-btn-small" data-tour="next">${TOUR_KO.next}</button>
      </div>
    </div>`));
  const art = root.querySelector('.aw-tour-art'), pageEl = root.querySelector('.aw-tour-page');
  const titleEl = root.querySelector('.aw-tour-title'), bodyEl = root.querySelector('.aw-tour-body');
  const dots = root.querySelector('.aw-tour-dots'), prevB = root.querySelector('[data-tour="prev"]'), nextB = root.querySelector('[data-tour="next"]');
  dots.innerHTML = TOUR_PAGES.map(() => '<i></i>').join('');
  // a small illustration per page (pure SVG, no assets)
  const ARTS = [
    '<svg viewBox="0 0 120 60"><circle cx="30" cy="30" r="14" class="g"/><circle cx="60" cy="30" r="14" class="s"/><circle cx="90" cy="30" r="14" class="l"/><path d="M80 22l20 16M100 22 80 38" class="l"/></svg>',
    '<svg viewBox="0 0 120 60"><path d="M10 50h100" class="s"/><circle cx="20" cy="50" r="5" class="g"/><circle cx="45" cy="38" r="5" class="g"/><circle cx="70" cy="26" r="5" class="s"/><circle cx="95" cy="12" r="6" class="l"/><path d="M20 50 45 38 70 26 95 12" class="s"/></svg>',
    '<svg viewBox="0 0 120 60"><circle cx="60" cy="14" r="8" class="g"/><path d="M60 22 38 44M60 22l22 22" class="s"/><path d="M38 36l8 8-8 8-8-8z" class="g"/><path d="M82 36l8 8-8 8-8-8z" class="l"/><text x="60" y="50" text-anchor="middle">택1</text></svg>',
  ];
  let page = 0, onDone = null;
  function render() {
    const p = TOUR_PAGES[page];
    art.innerHTML = ARTS[page] || '';
    pageEl.textContent = TOUR_KO.page(page + 1, TOUR_PAGES.length);
    titleEl.textContent = p.title;
    bodyEl.innerHTML = p.body;
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === page));
    prevB.disabled = page === 0;
    nextB.textContent = page === TOUR_PAGES.length - 1 ? TOUR_KO.done : TOUR_KO.next;
    ui.anim?.(root.firstElementChild, 'turn');
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tour]'); if (!b) return;
    game.audio?.play?.('ui_click');
    const a = b.dataset.tour;
    if (a === 'skip') api.close();
    else if (a === 'prev' && page > 0) { page--; render(); }
    else if (a === 'next') { if (page < TOUR_PAGES.length - 1) { page++; render(); } else api.close(); }
  });

  // ------------------------------------------------------------------ one-time tips
  const seen = new Set();
  function tip(id, text, opts = {}) {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    if (text) ui.toast?.(text, { duration: opts.duration ?? 6, kind: 'tip' });
    return true;
  }

  const api = {
    el: root,
    isOpen: false,
    start(done) {
      seen.add('treeTour');
      page = 0; onDone = done || null;
      api.isOpen = true;
      root.classList.add('show');
      render();
    },
    close() {
      if (!api.isOpen) return;
      api.isOpen = false;
      root.classList.remove('show');
      const f = onDone; onDone = null; try { f?.(); } catch (_) { /* */ }
    },
    next() { if (page < TOUR_PAGES.length - 1) { page++; render(); } else api.close(); },
    get page() { return page; },
    tip,
    hasSeen: (id) => seen.has(id),
    serialize: () => [...seen],
    deserialize(arr) { if (Array.isArray(arr)) for (const id of arr) if (typeof id === 'string') seen.add(id); },
  };
  return api;
}
