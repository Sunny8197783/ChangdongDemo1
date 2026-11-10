// §6.5 몬스터 도감 state + first-sight strip + 첫 조우 card + boss brief + the codex '몬스터' page.
// Data: game.enemies.codex() (feature-detected; empty → the page says so). Unlock state persists with
// game.save.section('monsterCodex') (fallback localStorage 'aw_monster_codex_v4'). Thumbnails: game.render.snapshot(
// game.enemies.previewModel(type)) once per type, rendered lazily while the game is paused / the codex is open (never a
// mid-fight program compile), cached as data URLs in memory; fallback = coloured glyph.
import { elName } from '../core/elements.js';
import { h, esc } from './dom.js';
import { elementSVG, elCss } from './icons.js';
import { MCODEX_KO } from './text.js';

const LS_KEY = 'aw_monster_codex_v4';
const CARD_SEC = 6, STRIP_SEC = 4, AFTER_COMBAT = 3;

export function createMonsters(game, { hud, fx, fmt, canParry, punishSec, parryText, onCardShown, anim }) {
  const ev = game.events;
  let st = { seen: {}, defeated: {}, kills: {}, cards: {} };
  const norm = (d) => ({ seen: { ...(d?.seen || {}) }, defeated: { ...(d?.defeated || {}) }, kills: { ...(d?.kills || {}) }, cards: { ...(d?.cards || {}) } });
  let hasSection = false;
  try {
    if (game.save?.section) { game.save.section('monsterCodex', { serialize: () => norm(st), load: (d) => { st = norm(d); } }); hasSection = true; }
  } catch (err) { console.warn('[ui] save.section(monsterCodex)', err?.message); }
  if (!hasSection) { try { st = norm(JSON.parse(localStorage.getItem(LS_KEY) || 'null')); } catch (_) { /* */ } }
  const persist = () => { if (!hasSection) { try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch (_) { /* */ } } };

  const fixtures = {};
  const codex = () => { let c = null; try { c = game.enemies?.codex?.() || null; } catch (_) { c = null; } return c ? { ...fixtures, ...c } : fixtures; };
  const entryOf = (type) => codex()[type] || null;
  const typeOf = (e) => e?.codexKey || e?.bossId || e?.kind || e?.type || null;

  // ------------------------------------------------------------------ DOM: strip (under the objective), card, boss brief
  const strip = hud.appendChild(h('div', 'aw-mstrip'));
  const card = fx.appendChild(h('div', 'aw-mcard', '<div class="aw-mcard-pre"></div><div class="aw-mcard-title"></div><div class="aw-mcard-icons"></div><div class="aw-mcard-tip"></div><div class="aw-mcard-counter"></div>'));
  const brief = fx.appendChild(h('div', 'aw-mbrief', '<div class="aw-mbrief-pre"></div><div class="aw-mbrief-title"></div><ul></ul><div class="aw-mbrief-icons"></div><div class="aw-mbrief-foot"></div>'));
  let stripT = 0, cardT = 0, briefT = 0;
  const pending = [];        // {type, enemy, dead}
  let calmT = 0, briefQ = null;

  function iconsHTML(en, size = 16) {
    if (!en) return '';
    const w = (en.weak || []).map((x) => `<span class="aw-mi weak" title="${esc(MCODEX_KO.weak)} ${esc(elName(x.el))}" style="--ec:${elCss(x.el)}">${elementSVG(x.el, size)}</span>`).join('');
    const r = (en.resist || []).map((x) => `<span class="aw-mi res" title="${esc(MCODEX_KO.resist)} ${esc(elName(x.el))}" style="--ec:${elCss(x.el)}">${elementSVG(x.el, size)}</span>`).join('');
    const im = (en.immune || []).map((x) => `<span class="aw-mi imm" title="${esc(MCODEX_KO.immune)} ${esc(elName(x))}" style="--ec:${elCss(x)}">${elementSVG(x, size)}</span>`).join('');
    return (w ? `<b>${MCODEX_KO.weak}</b>${w}` : '') + (r ? `<b>${MCODEX_KO.resist}</b>${r}` : '') + (im ? `<b>${MCODEX_KO.immune}</b>${im}` : '');
  }
  function counterLine(en) {
    const a = en?.attacks?.[0];
    if (!a) return '';
    let s = `${MCODEX_KO.counterPre}: ${fmt(a.counterKo || '')}`;
    if (a.parryKo && canParry()) s += ` · ${MCODEX_KO.parryPre}: ${parryText(a, null)}`;
    return s;
  }

  function unlock(type, how) {
    if (!type) return false;
    let isNew = false;
    if (!st.seen[type]) { st.seen[type] = 1; isNew = true; queueThumb(type); }
    if (how === 'kill') { if (!st.defeated[type]) { st.defeated[type] = 1; isNew = true; } st.kills[type] = (st.kills[type] || 0) + 1; }
    persist();
    if (isNew) try { game.audio?.play?.('codex_unlock', { volume: 0.6 }); } catch (_) { /* */ }
    return isNew;
  }

  function showStrip(type) {
    const en = entryOf(type);
    strip.textContent = MCODEX_KO.strip(en?.nameKo || type);
    anim(strip, 'show'); stripT = STRIP_SEC;
  }
  function showCard(type) {
    const en = entryOf(type);
    if (!en || st.cards[type]) return false;
    st.cards[type] = 1; persist();
    card.querySelector('.aw-mcard-pre').textContent = MCODEX_KO.cardPre;
    card.querySelector('.aw-mcard-title').textContent = MCODEX_KO.cardTitle(en.nameKo);
    card.querySelector('.aw-mcard-icons').innerHTML = iconsHTML(en, 18);
    card.querySelector('.aw-mcard-tip').textContent = fmt(en.tipKo || '');
    card.querySelector('.aw-mcard-counter').textContent = counterLine(en);
    card.dataset.type = type;
    anim(card, 'show'); cardT = CARD_SEC;
    onCardShown?.(type);
    return true;
  }
  function showBrief(p) {
    const en = entryOf(typeOf(p?.boss) || p?.id) || null;
    const lines = p?.brief || en?.briefKo;
    if (!lines?.length) return false;
    brief.querySelector('.aw-mbrief-pre').textContent = MCODEX_KO.briefPre;
    brief.querySelector('.aw-mbrief-title').textContent = p?.name || en?.nameKo || '';
    brief.querySelector('ul').innerHTML = lines.slice(0, 3).map((l) => `<li>${esc(fmt(l))}</li>`).join('');
    brief.querySelector('.aw-mbrief-icons').innerHTML = iconsHTML(en, 20);
    brief.querySelector('.aw-mbrief-foot').textContent = MCODEX_KO.briefKey;
    anim(brief, 'show'); briefT = CARD_SEC;
    return true;
  }
  addEventListener('keydown', () => { if (briefT > 0 && briefT < CARD_SEC - 0.5) { briefT = 0; brief.classList.remove('show'); } });

  // ------------------------------------------------------------------ events
  ev.on('enemyEncounter', (p) => {
    const type = p?.type || typeOf(p?.enemy);
    if (!type) return;
    const isNew = !st.seen[type];
    unlock(type, 'seen');
    if (isNew && p.sight !== false) showStrip(type);
    if (isNew && !st.cards[type] && !pending.some((q) => q.type === type)) pending.push({ type, enemy: p.enemy || null, dead: false });
  });
  ev.on('kill', (p) => {
    const e = p?.target; if (!e || e.team === 'player' || e.isDummy || e.isProp) return;
    const type = typeOf(e);
    unlock(type, 'kill');
    for (const q of pending) if (q.enemy === e || (!q.enemy && q.type === type)) q.dead = true;
  });
  ev.on('bossSpawn', (p) => { const t = typeOf(p?.boss) || p?.id; if (t) unlock(t, 'seen'); if (p?.brief || entryOf(t)?.briefKo) briefQ = p; });
  ev.on('bossDefeated', (p) => { const t = typeOf(p?.boss) || p?.id; if (t && !st.defeated[t]) { st.defeated[t] = 1; st.kills[t] = (st.kills[t] || 0) + 1; persist(); } });

  function update(dt) {
    if (stripT > 0 && (stripT -= dt) <= 0) strip.classList.remove('show');
    if (cardT > 0 && (cardT -= dt) <= 0) card.classList.remove('show');
    if (briefT > 0 && (briefT -= dt) <= 0) brief.classList.remove('show');
    const busy = !!game.cinematic?.active || game.state !== 'playing';
    if (briefQ && !busy) { const p = briefQ; briefQ = null; showBrief(p); }
    const inCombat = (game.enemies?.aggroCount?.() || 0) > 0;
    calmT = inCombat ? 0 : calmT + dt;
    if (pending.length && !busy && cardT <= 0) {
      for (let i = 0; i < pending.length; i++) {
        const q = pending[i];
        if ((q.dead && !inCombat) || calmT >= AFTER_COMBAT) { pending.splice(i, 1); showCard(q.type); break; }
      }
    }
    if (thumbQ.length && !thumbBusy && (game.state === 'paused' || pageOpen)) nextThumb();
  }

  // ------------------------------------------------------------------ thumbnails
  const thumbs = new Map(); const thumbQ = []; let thumbBusy = false, pageOpen = false, onThumb = null;
  function queueThumb(type) { if (!thumbs.has(type) && !thumbQ.includes(type)) thumbQ.push(type); }
  async function nextThumb() {
    const type = thumbQ.shift(); if (!type) return;
    thumbBusy = true;
    try {
      const obj = game.enemies?.previewModel?.(type);
      const url = obj && game.render?.snapshot ? await game.render.snapshot(obj, { w: 160, h: 160, yaw: 0.6 }) : null;
      thumbs.set(type, url || null);
      if (url) onThumb?.(type, url);
    } catch (err) { thumbs.set(type, null); console.warn('[ui] codex thumbnail', type, err?.message); }
    thumbBusy = false;
  }
  /** Render every missing unlocked thumbnail now (codex page open). */
  async function fillThumbs() { for (const t in st.seen) queueThumb(t); while (thumbQ.length) await nextThumb(); }

  // ------------------------------------------------------------------ the codex page
  function glyph(en) {
    const el = en?.weak?.[0]?.el;
    return `<div class="aw-mglyph" style="--ec:${el ? elCss(el) : '#8a8fa8'}">${esc((en?.nameKo || '?').slice(0, 1))}</div>`;
  }
  function entryHTML(type, en) {
    const seen = !!st.seen[type], dead = !!st.defeated[type];
    const th = thumbs.get(type);
    const pic = seen && th ? `<img class="aw-mthumb" alt="" src="${th}">` : `<div class="aw-mthumb sil">${seen ? glyph(en) : '?'}</div>`;
    if (!seen) return `<div class="aw-ment unknown" data-type="${esc(type)}">${pic}<div class="aw-ment-body"><div class="aw-ment-name">${MCODEX_KO.unknown}</div><div class="aw-ment-tip">${MCODEX_KO.unknownTip}</div></div></div>`;
    const tag = en.boss ? `<i class="aw-mtag boss">${MCODEX_KO.boss}</i>` : en.elite ? `<i class="aw-mtag elite">${MCODEX_KO.elite}</i>` : '';
    let atk = '';
    if (dead) {
      const cp = canParry();
      atk = `<div class="aw-ment-atk"><div class="aw-ment-ah">${MCODEX_KO.attackHead}</div>${(en.attacks || []).map((a) => {
        const ps = punishSec(a, null);
        const pun = a.punishKo ? ` · ${MCODEX_KO.punishPre}: ${esc(fmt(a.punishKo, { punishSec: ps }))}` : '';
        return `<div class="aw-ment-a" data-tell="${esc(a.tell || '')}"><b>${esc(a.nameKo || a.id)}</b> — ${esc(fmt(a.tellKo || ''))} — ${esc(fmt(a.counterKo || ''))}${a.parryKo && cp ? `<span class="aw-ment-parry"> · ${MCODEX_KO.parryPre}: ${esc(parryText(a, null))}</span>` : ''}${pun}</div>`;
      }).join('')}</div><div class="aw-ment-kills">${MCODEX_KO.kills(st.kills[type] || 0)}</div>`;
    } else atk = `<div class="aw-ment-locked">${MCODEX_KO.locked}</div>`;
    return `<div class="aw-ment${dead ? ' defeated' : ' seen'}" data-type="${esc(type)}">${pic}<div class="aw-ment-body">
      <div class="aw-ment-name">${esc(en.nameKo || type)}${tag}</div><div class="aw-ment-role">${MCODEX_KO.role}: ${esc(en.roleKo || '')}</div>
      <div class="aw-ment-icons">${iconsHTML(en)}</div>${en.weakPointKo ? `<div class="aw-ment-wp">${MCODEX_KO.weakPoint}: ${esc(fmt(en.weakPointKo))}</div>` : ''}
      <div class="aw-ment-tip">${MCODEX_KO.tip}: ${esc(fmt(en.tipKo || ''))}</div>${atk}</div></div>`;
  }
  function renderPage(listEl, countEl) {
    const C = codex();
    const types = Object.keys(C).sort((a, b) => (C[a].boss ? 1 : 0) - (C[b].boss ? 1 : 0));
    const n = types.filter((t) => st.seen[t]).length;
    if (countEl) countEl.textContent = types.length ? MCODEX_KO.count(n, types.length) : '';
    listEl.innerHTML = types.map((t) => entryHTML(t, C[t])).join('');
    pageOpen = true;
    onThumb = (type, url) => { const img = listEl.querySelector(`.aw-ment[data-type="${CSS.escape(type)}"] .aw-mthumb`); if (img && st.seen[type]) img.outerHTML = `<img class="aw-mthumb" alt="" src="${url}">`; };
    fillThumbs();
  }

  return {
    update, renderPage, pageClosed() { pageOpen = false; onThumb = null; },
    encounterStrip: showStrip, encounterCard: showCard, bossBrief: showBrief, unlock,
    /** test fixture (playtest4 ux): register a codex entry while mobs/bosses data is absent. */
    addFixture(en) { if (en?.type) fixtures[en.type] = en; },
    state: () => st, thumbs: () => thumbs.size, thumbCount: () => [...thumbs.values()].filter(Boolean).length, pendingCards: () => pending.length,
    get cardOn() { return cardT > 0; }, get stripOn() { return stripT > 0; }, get briefOn() { return briefT > 0; },
    entryOf, reset() { st = norm(null); pending.length = 0; persist(); },
  };
}
