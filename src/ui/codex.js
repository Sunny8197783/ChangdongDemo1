// 원소 도감 (Tab) — the interactive, scrollable grimoire (CONTRACT §18, DESIGN §10 / §4.5).
// Page 1: the reaction codex grouped into the 6 families (+ universal), family colours, discovered entries with element
// chips, effect and an animated mini icon; undiscovered ones are silhouettes with a hint ("물 + 번개 …?"); counter "N / 49".
// Page 2: the learned skills, grouped by element (v2 fallback: the legacy spell list).
import { ALL_ELEMENTS, elName } from '../core/elements.js';
import { CLASS_DEFS } from '../core/classes.js';
import { h, esc, fmtNum } from './dom.js';
import { elementSVG, spellSVG, elCss, ARCH_GLYPH } from './icons.js';
import { FAMILIES_FALLBACK, FAMILY_ORDER, FAMILY_BLURB, CODEX_KO, SLOT_KO, RES_KO, RX_DESC_KO } from './text.js';

export function createCodex(game, ui, parent) {
  const root = parent.appendChild(h('div', 'aw-screen aw-grimoire aw-codex', `
    <div class="aw-book">
      <div class="aw-book-tabs"><button class="on" data-cpage="rx">${CODEX_KO.rxPage}</button><button data-cpage="sk">${CODEX_KO.skillPage}</button><button data-cpage="mon">${CODEX_KO.monPage}</button></div>
      <div class="aw-book-page aw-book-mon"><div class="aw-book-title">${CODEX_KO.monPage}</div><div class="aw-book-count aw-mon-count"></div><div class="aw-cx-scroll aw-mon-list"></div></div>
      <div class="aw-book-page aw-book-left">
        <div class="aw-book-title">${CODEX_KO.title}</div>
        <div class="aw-book-count"></div>
        <div class="aw-cx-fams"></div>
        <div class="aw-cx-scroll aw-rx-list"></div>
      </div>
      <div class="aw-book-spine"></div>
      <div class="aw-book-page aw-book-right">
        <div class="aw-book-title aw-sp-title">${CODEX_KO.skillPage}</div>
        <div class="aw-book-count aw-sp-count"></div>
        <div class="aw-cx-scroll aw-spell-list"></div>
      </div>
      <div class="aw-book-foot"><kbd class="aw-codex-key">Tab</kbd> ${CODEX_KO.close}</div>
    </div>`));
  const book = root.querySelector('.aw-book');
  const countEl = root.querySelector('.aw-book-left .aw-book-count'), famBar = root.querySelector('.aw-cx-fams');
  const rxList = root.querySelector('.aw-rx-list'), spList = root.querySelector('.aw-spell-list'), spCount = root.querySelector('.aw-sp-count');
  let page = 'rx';

  function families() {
    const F = game.combat?.FAMILIES;
    const out = {};
    for (const k of FAMILY_ORDER) out[k] = { nameKo: F?.[k]?.nameKo || FAMILIES_FALLBACK[k].nameKo, color: F?.[k]?.color || FAMILIES_FALLBACK[k].color };
    return out;
  }
  function familyOfRx(r) {
    if (r.family && FAMILIES_FALLBACK[r.family]) return r.family;
    for (const k of FAMILY_ORDER) if (FAMILIES_FALLBACK[k].members.includes(r.id)) return k;
    return 'universal';
  }
  const chip = (e) => (e && e !== 'physical' ? `<span class="aw-cx-chip" style="--ec:${elCss(e)}">${elementSVG(e, 14)}<b>${esc(elName(e))}</b></span>` : '');

  function buildRx() {
    const list = game.combat?.REACTIONS || [];
    const disc = game.combat?.discovered;
    const seen = ui.seenReactions?.() || null;
    const known = (id) => !!(disc?.has?.(id) || seen?.has?.(id));
    const fams = families();
    const groups = {};
    for (const k of FAMILY_ORDER) groups[k] = [];
    for (const r of list) groups[familyOfRx(r)].push(r);
    const n = list.filter((r) => known(r.id)).length;
    countEl.textContent = list.length ? CODEX_KO.count(n, list.length) : '';
    let bar = '', html = '';
    for (const k of FAMILY_ORDER) {
      const g = groups[k]; if (!g.length) continue;
      const kn = g.filter((r) => known(r.id)).length;
      bar += `<button class="aw-cx-fam" data-fam="${k}" style="--fc:${fams[k].color}">${esc(fams[k].nameKo)}<i>${kn}/${g.length}</i></button>`;
      html += `<div class="aw-rx-sec aw-cx-sec" data-sec="${k}" style="--fc:${fams[k].color}"><b>${esc(fams[k].nameKo)}</b><span>${esc(FAMILY_BLURB[k] || '')}</span><i>${kn} / ${g.length}</i></div>`;
      for (const r of g) {
        const k2 = known(r.id);
        const els = (r.elements || []).filter((e) => e && e !== 'physical');
        const chips = els.length ? els.map(chip).join('<b class="aw-plus">+</b>') : `<span class="aw-cx-chip neutral">${elementSVG('physical', 14)}</span>`;
        const hint = els.length ? els.map((e) => elName(e)).join(' + ') + ' ' + CODEX_KO.hintSuffix : CODEX_KO.unknown;
        html += `<div class="aw-rx ${k2 ? 'known' : 'unknown'}" title="${esc(RX_DESC_KO[k] || '')}" style="--fc:${fams[k].color};--g1:${elCss(els[0])};--g2:${elCss(els[1] || els[0])}">
          <div class="aw-cx-mini fam-${k}"><i></i><i></i><i></i></div>
          <div class="aw-rx-body"><div class="aw-rx-name">${k2 ? esc(r.name) : CODEX_KO.unknown}</div>
            <div class="aw-rx-icons">${chips}</div>
            <div class="aw-rx-desc">${k2 ? esc(r.desc || '') : esc(hint)}</div></div></div>`;
      }
    }
    famBar.innerHTML = bar;
    rxList.innerHTML = html || `<div class="aw-cnone">${CODEX_KO.unknown}</div>`;
  }

  function buildSkills() {
    const P = game.progression;
    const defs = ui.skillDefs?.() || null;
    const cd = CLASS_DEFS[P?.cls];
    const melee = cd?.family === 'melee';
    const res = melee ? 'resolve' : 'mp';
    let html = '', count = 0;
    const ids = (defs && P?.learnedSkills?.()) || [];
    if (defs && ids.length) {
      const byEl = {};
      for (const id of ids) { const d = defs.get(id); if (!d) continue; (byEl[d.element] ||= []).push(d); }
      const order = { basic: 0, charged: 1, quick: 2, support: 3, ultimate: 4, finisher: 5 };
      for (const el of ALL_ELEMENTS) {
        const arr = byEl[el]; if (!arr?.length) continue;
        arr.sort((a, b) => (order[a.slot] ?? 9) - (order[b.slot] ?? 9));
        html += `<div class="aw-sp-el" style="--ec:${elCss(el)}"><div class="aw-sp-head">${elementSVG(el, 18)}<span>${esc(elName(el))}</span></div><div class="aw-sp-grid">`;
        for (const d of arr) {
          count++;
          const cost = d.cost ? Math.round(d.cost * (melee ? 0.8 : 1)) : 0;
          const kind = d.slot === 'basic' ? 'basic' : d.slot === 'charged' ? 'heavy' : 'ultimate';
          html += `<div class="aw-sp-row">${spellSVG(el, kind, 30)}<span class="aw-sp-gl">${ARCH_GLYPH[d.archetype] || ''}</span><div class="aw-sp-body"><div class="aw-sp-name">${esc(d.nameKo)}</div>
            <div class="aw-sp-meta"><em>${SLOT_KO[d.slot] || ''}</em>${cost ? `<span class="aw-sp-mp">${RES_KO[res]} ${cost}</span>` : ''}${d.cd ? `<span class="aw-sp-cd">${fmtNum(d.cd)}초</span>` : ''}</div>
            <div class="aw-sp-desc">${esc(d.desc || '')}</div></div></div>`;
        }
        html += '</div></div>';
      }
    } else {
      // v2 fallback: legacy spell defs (classic elements)
      const SP = game.spells?.SPELLS || null;
      if (SP) for (const d of Object.values(SP)) {
        if (!d || d.awakened) continue;
        count++;
        html += `<div class="aw-sp-row">${spellSVG(d.element, d.kind === 'heavy' ? 'heavy' : d.kind === 'basic' ? 'basic' : 'ultimate', 30)}<div class="aw-sp-body"><div class="aw-sp-name">${esc(d.name)}</div><div class="aw-sp-desc">${esc(d.desc || '')}</div></div></div>`;
      }
    }
    spCount.textContent = count ? String(count) : '';
    spList.innerHTML = html || `<div class="aw-cnone">${CODEX_KO.noSkills}</div>`;
  }

  let monsters = null;
  const monList = root.querySelector('.aw-mon-list'), monCount = root.querySelector('.aw-mon-count');
  function setPage(p) {
    page = p === 'sk' || p === 'mon' ? p : 'rx';
    book.dataset.page = page;
    for (const b of root.querySelectorAll('[data-cpage]')) b.classList.toggle('on', b.dataset.cpage === page);
    if (page === 'mon' && api.isOpen) monsters?.renderPage(monList, monCount);
    else monsters?.pageClosed?.();
  }
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cpage],[data-fam]'); if (!t) return;
    game.audio?.play?.('ui_click');
    if (t.dataset.cpage) { setPage(t.dataset.cpage); return; }
    const sec = rxList.querySelector(`[data-sec="${t.dataset.fam}"]`);
    if (sec) rxList.scrollTop = sec.offsetTop - rxList.offsetTop;   // click handler only (not per frame)
  });
  // the wheel scrolls the page under the cursor (the canvas would otherwise eat it)
  root.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: true });

  const api = {
    el: root,
    isOpen: false,
    open(p) {
      buildRx(); buildSkills(); api.isOpen = true; setPage(p || page); root.classList.add('show');
      try { root.querySelector('.aw-codex-key').textContent = game.input?.keymap?.label?.('codex') || 'Tab'; } catch (_) { /* */ }
    },
    close() { if (!api.isOpen) return; api.isOpen = false; monsters?.pageClosed?.(); root.classList.remove('show'); ui.modalClosed?.('codex'); },
    setMonsters(m) { monsters = m; },
    refresh() { if (api.isOpen) { buildRx(); buildSkills(); } },
    setPage,
    get page() { return page; },
  };
  return api;
}
