// 캐릭터 (C) sheet (CONTRACT §18, DESIGN §10): class emblem / name, level + XP, signature description, derived stats,
// element damage bonuses (mastery + passives), keystones in effect, class talents (Lv1/10/20/25 with the choice at 25),
// and the nine spirits (freed / bound). Rebuilt on open and on relevant events while open (never per frame).
import { ALL_ELEMENTS, ELEMENT_DEFS, CLASSIC_ELEMENTS, elName } from '../core/elements.js';
import { CLASS_DEFS, TALENTS } from '../core/classes.js';
import { h, esc, fmtNum, pct } from './dom.js';
import { elementSVG, elCss, classSVG } from './icons.js';
import { CHAR_KO, MASTERY_KO, RES_KO } from './text.js';

export function createCharacter(game, ui, parent) {
  const root = parent.appendChild(h('div', 'aw-screen aw-modal aw-char', `
    <div class="aw-panel aw-panel-wide aw-char-panel">
      <div class="aw-panel-title"><span>${CHAR_KO.title}</span></div>
      <div class="aw-char-body"></div>
      <div class="aw-menu aw-menu-row"><button class="aw-btn" data-chact="close"><kbd>C</kbd> 닫기</button></div>
    </div>`));
  const body = root.querySelector('.aw-char-body');
  let dirty = true;

  function render() {
    dirty = false;
    const P = game.progression, St = game.stats;
    const cls = P?.cls, c = CLASS_DEFS[cls];
    if (!c) { body.innerHTML = `<div class="aw-char-empty">${CHAR_KO.none}</div>`; return; }
    let d = {};
    try { d = St?.derived?.() || {}; } catch (_) { d = {}; }
    const pl = game.player || {};
    const res = pl.resource || c.resource;
    const xp = P.xp || 0, need = P.xpToNext?.() || 1;
    const t1 = TALENTS[c.talents?.[1]];
    // derived stats
    const stat = (k, v) => `<div class="aw-cstat"><span>${CHAR_KO.stat[k]}</span><b>${v}</b></div>`;
    const maxRes = res === 'resolve' ? (pl.maxResolve ?? d.maxResolve) : (pl.maxMp ?? d.maxMp);
    let stats = stat('maxHp', Math.round(pl.maxHp ?? d.maxHp ?? 0))
      + `<div class="aw-cstat"><span>${RES_KO[res] || ''}</span><b>${Math.round(maxRes ?? 0)}</b></div>`
      + stat('maxStamina', Math.round(pl.maxStamina ?? d.maxStamina ?? 0))
      + stat('power', '×' + (d.power ?? 1).toFixed(2))
      + stat('defense', pct(d.defense ?? 0) + '%')
      + stat('crit', pct((d.crit ?? 0) + (St?.get?.('critChance') || 0)) + '%')
      + stat('move', pct(d.move ?? 1) + '%')
      + stat('regenDelay', fmtNum(d.regenDelay ?? 5) + '초') + stat('regenDelayOOC', fmtNum(d.regenDelayOOC ?? 3) + '초')
      + stat('regenRate', fmtNum(Math.round((d.regenRate ?? 0.015) * 1000) / 10) + '%/초') + stat('regenRateOOC', fmtNum(Math.round((d.regenRateOOC ?? 0.08) * 1000) / 10) + '%/초');
    // element bonuses
    let els = '';
    for (const el of [...c.primary, ...c.secondary]) {
      const m = P.mastery?.(el);
      let pas = 1; try { pas = St?.elementDmg?.(el) ?? 1; } catch (_) { pas = 1; }
      const mb = Math.round((m?.dmgBonus || 0) * 100);
      const pb = Math.round((pas - 1) * 100);
      els += `<div class="aw-cel${c.primary.includes(el) ? ' p' : ''}" style="--ec:${elCss(el)}">${elementSVG(el, 16)}<span>${esc(elName(el))}</span>
        <em>${CHAR_KO.masteryLine(MASTERY_KO[m?.rank] || '-', mb)}</em>${pb ? `<em>${CHAR_KO.passiveLine(pb)}</em>` : ''}<b>${m?.points || 0}pt</b></div>`;
    }
    // keystones
    const keys = [];
    for (const id of P.learnedNodes?.() || []) { const n = P.node?.(id); if (n?.type === 'keystone') keys.push(n); }
    const keyHtml = keys.length ? keys.map((n) => `<div class="aw-ckey" style="--ec:${elCss(n.element)}"><b>${esc(n.nameKo)}</b><span>${esc(n.desc || '')}</span></div>`).join('') : `<div class="aw-cnone">${CHAR_KO.none}</div>`;
    // talents
    let tal = '';
    const L = P.level || 1;
    for (const lv of [1, 10, 20]) {
      const t = TALENTS[c.talents?.[lv]]; if (!t) continue;
      tal += `<div class="aw-ctal${L >= lv ? ' on' : ''}"><i>${CHAR_KO.lvReq(lv)}</i><b>${esc(t.nameKo)}</b><span>${esc(t.desc)}</span></div>`;
    }
    const pair = c.talents?.[25] || [];
    if (pair.length) {
      tal += `<div class="aw-ctal-pair${L >= 25 ? ' on' : ''}"><i>${CHAR_KO.lvReq(25)}</i>`;
      pair.forEach((tid, i) => {
        const t = TALENTS[tid]; if (!t) return;
        const ch = i === 0 ? 'a' : 'b';
        const chosen = P.talentChoice === ch;
        tal += `<button class="aw-ctal-opt${chosen ? ' chosen' : ''}" data-talent="${ch}"${L >= 25 ? '' : ' disabled'}><b>${esc(t.nameKo)}</b><span>${esc(t.desc)}</span><em>${chosen ? CHAR_KO.chosen : CHAR_KO.choose}</em></button>`;
      });
      tal += '</div>';
    }
    // spirits
    let sp = '';
    for (const el of ALL_ELEMENTS) {
      const def = ELEMENT_DEFS[el];
      // classic spirits are sealed until the golem's seal breaks; the four lost spirits until they are freed
      const sealed = CLASSIC_ELEMENTS.includes(el) ? !P.sealsBroken : !(P.spiritsFreed?.has?.(el) || (el === 'light' && P.lumielFeather));
      sp += `<div class="aw-cspirit${sealed ? ' bound' : ''}" style="--ec:${elCss(el)}" title="${esc(def?.spirit?.title || '')}">${elementSVG(el, 22)}<span>${esc(def?.spirit?.name || elName(el))}</span><em>${sealed ? CHAR_KO.spiritBound : CHAR_KO.spiritFree}</em></div>`;
    }
    body.innerHTML = `
      <section class="aw-char-id" style="--cc:${elCss(c.primary[0])}">
        <div class="aw-char-emblem">${classSVG(c.style)}</div>
        <div class="aw-char-name">${esc(c.nameKo)}<small>${esc(c.title || '')}</small></div>
        <div class="aw-char-lv">${CHAR_KO.level} <b>${L}</b></div>
        <div class="aw-char-xp"><i style="transform:scaleX(${Math.min(1, xp / need).toFixed(3)})"></i><span>${Math.floor(xp)} / ${need}</span></div>
        <div class="aw-char-sig"><b>${esc(c.signatureKo || t1?.nameKo || '')}</b><span>${esc(t1?.desc || '')}</span></div>
      </section>
      <section class="aw-char-col"><h3>${CHAR_KO.stats}</h3><div class="aw-cstats">${stats}</div>
        <h3>${CHAR_KO.elements}</h3><div class="aw-cels">${els}</div></section>
      <section class="aw-char-col"><h3>${CHAR_KO.talents}</h3><div class="aw-ctals">${tal}</div>
        <h3>${CHAR_KO.keystones}</h3><div class="aw-ckeys">${keyHtml}</div>
        <h3>${CHAR_KO.spirits}</h3><div class="aw-cspirits">${sp}</div></section>`;
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-talent],[data-chact]'); if (!b) return;
    game.audio?.play?.('ui_click');
    if (b.dataset.chact === 'close') { api.close(); return; }
    if (b.dataset.talent) { try { game.progression?.chooseTalent?.(b.dataset.talent); } catch (err) { console.warn('[ui] chooseTalent', err); } dirty = true; }
  });
  const mark = () => { dirty = true; };
  for (const n of ['levelUp', 'xpGained', 'skillLearned', 'skillUnlearned', 'respec', 'statsChanged', 'talentChosen', 'spiritFreed', 'classChosen', 'sealsBroken'])
    game.events.on(n, mark);

  const api = {
    el: root,
    isOpen: false,
    open() { api.isOpen = true; root.classList.add('show'); render(); },
    close() { if (!api.isOpen) return; api.isOpen = false; root.classList.remove('show'); ui.modalClosed?.('character'); },
    update() { if (api.isOpen && dirty) render(); },
  };
  return api;
}
