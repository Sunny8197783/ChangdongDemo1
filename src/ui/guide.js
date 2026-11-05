// §6.4 가이드 (pause menu → 가이드; opens automatically at the first pause; linked from the death recap):
// 핵심 조작 (from the keymap) · 위험 표시 읽는 법 (REAL rendered thumbnails from game.tells.renderThumb(kind, 160),
// filled once and cached, with the exact §5.1 legend texts from core/threat.js) · 회피와 방어 · 원소 반응 기초 · 현재 목표.
import { THREAT, THREAT_KINDS, threatColor, threatCss } from '../core/threat.js';
import { h, esc } from './dom.js';
import { GUIDE_KO, RX_BASICS_KO } from './text.js';

export function createGuide(game, { screens, fmt, canParry, objective, openCodex, onClose }) {
  const el = screens.appendChild(h('div', 'aw-screen aw-modal aw-guide', `
    <div class="aw-panel aw-panel-wide aw-guide-panel">
      <div class="aw-panel-title"><span>${GUIDE_KO.title}</span></div>
      <div class="aw-guide-nav">
        <button data-gs="controls">${GUIDE_KO.controls}</button><button data-gs="legend">${GUIDE_KO.legend}</button>
        <button data-gs="dodge">${GUIDE_KO.dodge}</button><button data-gs="reactions">${GUIDE_KO.reactions}</button><button data-gs="objective">${GUIDE_KO.objective}</button>
      </div>
      <div class="aw-guide-body"></div>
      <div class="aw-menu aw-menu-row"><button class="aw-btn" data-ga="codex">${GUIDE_KO.codexLink}</button><button class="aw-btn aw-btn-primary" data-ga="close">${GUIDE_KO.close}</button></div>
    </div>`));
  const body = el.querySelector('.aw-guide-body');
  const thumbs = new Map();   // kind → dataURL | null
  let section = 'controls', isOpen = false, filling = false;

  async function fillThumbs() {
    const T = game.tells;
    if (filling || typeof T?.renderThumb !== 'function') return;
    filling = true;
    for (const k of THREAT_KINDS) {
      if (thumbs.has(k)) continue;
      try { thumbs.set(k, (await T.renderThumb(k, 160)) || null); } catch (err) { thumbs.set(k, null); console.warn('[ui] renderThumb', k, err?.message); }
      if (isOpen && section === 'legend') { const img = body.querySelector(`.aw-leg[data-kind="${k}"] .aw-leg-pic`); if (img && thumbs.get(k)) img.outerHTML = `<img class="aw-leg-pic" alt="" src="${thumbs.get(k)}">`; }
    }
    filling = false;
  }
  const row = ([, name, keys]) => `<div class="aw-gk"><span>${esc(name)}</span><kbd>${esc(fmt(keys))}</kbd></div>`;
  function html(sec) {
    if (sec === 'controls') return `<div class="aw-gk-grid">${GUIDE_KO.rows.map(row).join('')}</div><h4>${GUIDE_KO.advanced}</h4><div class="aw-gk-grid">${GUIDE_KO.advRows.map(row).join('')}</div>`;
    if (sec === 'legend') {
      const cb = game.settings?.values?.colorblind;
      return `<div class="aw-leg-grid">${THREAT_KINDS.map((k) => {
        const u = thumbs.get(k);
        const c = threatCss(threatColor(k, cb).rim);
        return `<div class="aw-leg" data-kind="${k}">${u ? `<img class="aw-leg-pic" alt="" src="${u}">` : `<div class="aw-leg-pic sw" style="--tc:${c}"></div>`}<div class="aw-leg-txt">${esc(THREAT[k].legendKo)}</div></div>`;
      }).join('')}</div>`;
    }
    if (sec === 'dodge') {
      const cp = canParry();
      return `<div class="aw-gtime"><div class="aw-gtime-bar"><i></i><b></b></div><div class="aw-gtime-lbl">${esc(GUIDE_KO.timing)}</div><small>${esc(fmt(GUIDE_KO.timingSub))}</small></div>
        <p>${esc(fmt(GUIDE_KO.dodgeLine))}</p><p>${esc(fmt(GUIDE_KO.defendLine))}</p><p class="aw-gparry">${esc(fmt(cp ? GUIDE_KO.parryLine : GUIDE_KO.parryLineB))}</p>`;
    }
    if (sec === 'reactions') {
      const els = new Set(game.player?.elements || game.progression?.classElements?.() || game.skills?.classElements?.() || []);
      const pick = RX_BASICS_KO.filter((r) => !els.size || r.els.every((e) => els.has(e)));
      const list = (pick.length >= 6 ? pick : pick.concat(RX_BASICS_KO.filter((r) => !pick.includes(r)))).slice(0, 6);
      return `<ul class="aw-grx">${list.map((r) => `<li>${esc(r.t)}</li>`).join('')}</ul>`;
    }
    const o = objective();
    return o?.title ? `<div class="aw-gobj"><b>${esc(o.title)}</b>${o.how ? `<p>${esc(fmt(o.how))}</p>` : ''}</div>` : `<p>${GUIDE_KO.noObjective}</p>`;
  }
  function show(sec) {
    section = sec || section;
    for (const b of el.querySelectorAll('[data-gs]')) b.classList.toggle('sel', b.dataset.gs === section);
    body.innerHTML = html(section);
    if (section === 'legend') fillThumbs();
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    game.audio?.play?.('ui_click');
    if (b.dataset.gs) show(b.dataset.gs);
    else if (b.dataset.ga === 'close') api.close();
    else if (b.dataset.ga === 'codex') { api.close(); openCodex?.(); }
  });
  const api = {
    el,
    get isOpen() { return isOpen; },
    open(sec) { isOpen = true; el.classList.add('show'); show(sec || 'controls'); fillThumbs(); try { game.events.emit('guideOpened', { section }); } catch (_) { /* */ } },
    close() { if (!isOpen) return; isOpen = false; el.classList.remove('show'); onClose?.(); },
    legendThumbs: () => [...thumbs.values()].filter(Boolean).length,
    prefetch: fillThumbs,
  };
  return api;
}
