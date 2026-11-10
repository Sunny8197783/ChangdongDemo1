// §6.7 death recap (replaces "쓰러졌다…"): ring buffer of the last 8 playerHurt events → killer + attack line, the last 5
// hits (DoT / hazards grouped), one class-correct codex tip, 4 buttons and the respawn line; after 3 deaths to the same
// boss one 쉬움 suggestion; story difficulty (assist.autoRevive) shows only a small strip.
import { h, esc } from './dom.js';
import { RECAP_KO } from './text.js';

const RING = 8;

export function createRecap(game, { screens, hud, fmt, canParry, parryText, entryOf, actions, confirm, anim }) {
  const ev = game.events;
  const ring = [];
  for (let i = 0; i < RING; i++) ring.push({ used: false, amount: 0, element: '', src: '', atk: '', atkId: '', type: '', dot: false, kind: '', time: 0 });
  let head = 0, count = 0;
  const typeOf = (e) => e?.codexKey || e?.bossId || e?.kind || e?.type || '';
  const now = () => (Number.isFinite(game.time) ? game.time : (game.realTime || 0));

  ev.on('playerHurt', (p) => {
    if (!p) return;
    const r = ring[head]; head = (head + 1) % RING; if (count < RING) count++;
    r.used = true; r.amount = Math.round(+p.amount || 0); r.element = p.element || '';
    r.src = p.sourceName || p.source?.name || (p.surface ? p.surface : '') || RECAP_KO.unknown;
    r.atk = p.attackNameKo || p.attack?.nameKo || ''; r.atkId = p.attackId || p.attack?.id || '';
    r.type = typeOf(p.source); r.dot = !!p.dot; r.kind = p.attackKind || (p.dot ? 'dot' : 'melee');
    r.time = Number.isFinite(p.time) ? p.time : now();
  });
  ev.on('playerRespawn', () => { count = 0; for (const r of ring) r.used = false; });

  const el = screens.appendChild(h('div', 'aw-screen aw-death', `
    <div class="aw-death-inner">
      <div class="aw-death-title">${RECAP_KO.title}</div>
      <div class="aw-death-killer"></div>
      <div class="aw-death-hits"><div class="aw-death-hh">${RECAP_KO.lastHits}</div><ol></ol></div>
      <div class="aw-death-tip"></div>
      <div class="aw-death-count"></div>
      <div class="aw-death-where"></div>
      <div class="aw-menu aw-menu-row aw-death-btns">
        <button class="aw-btn aw-btn-primary" data-rc="respawn"></button>
        <button class="aw-btn" data-rc="assist">${RECAP_KO.btnAssist}</button>
        <button class="aw-btn" data-rc="codex">${RECAP_KO.btnCodex}</button>
        <button class="aw-btn" data-rc="legend">${RECAP_KO.btnLegend}</button>
      </div>
    </div>`));
  const strip = hud.appendChild(h('div', 'aw-revive-strip'));
  let stripT = 0;
  const killerEl = el.querySelector('.aw-death-killer'), hitsEl = el.querySelector('ol'), tipEl = el.querySelector('.aw-death-tip');
  const countEl = el.querySelector('.aw-death-count'), whereEl = el.querySelector('.aw-death-where'), respBtn = el.querySelector('[data-rc="respawn"]');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rc]'); if (!b) return;
    game.audio?.play?.('ui_click');
    actions[b.dataset.rc]?.();
  });

  let last = null;
  function build() {
    const tD = now();
    const list = [];
    for (let i = 0; i < count; i++) { const r = ring[(head - 1 - i + RING * 2) % RING]; if (r.used) list.push(r); }
    // killer = most recent non-DoT hit (else the most recent hit)
    const k = list.find((r) => !r.dot) || list[0] || null;
    // group DoT / hazard ticks by name
    const rows = [];
    for (const r of list) {
      const grp = r.dot || r.kind === 'hazard' || r.kind === 'surface';
      const name = r.atk || r.src;
      const prev = rows[rows.length - 1];
      if (grp && prev && prev.grp && prev.name === name) { prev.n++; prev.amount += r.amount; continue; }
      if (rows.length >= 5) break;
      rows.push({ grp, name, n: 1, amount: r.amount, src: r.src, atk: r.atk, el: r.element, sec: Math.max(0, tD - r.time).toFixed(1) });
    }
    let tip = '';
    const en = k ? entryOf(k.type) : null;
    if (en) {
      const a = (en.attacks || []).find((x) => x.id === k.atkId) || (en.attacks || []).find((x) => x.nameKo === k.atk) || null;
      if (a) { tip = fmt(a.counterKo || ''); if (a.parryKo && canParry()) tip += ' · ' + parryText(a, null); }
      else tip = fmt(en.tipKo || '');
    }
    last = {
      killer: k ? k.src : '', attack: k ? k.atk : '', amount: k ? k.amount : 0,
      hits: rows.map((r) => ({ source: r.src, attack: r.atk, amount: r.amount, element: r.el, sec: +r.sec, n: r.n, grouped: r.grp })),
      tip, buttons: [RECAP_KO.btnRespawn, RECAP_KO.btnAssist, RECAP_KO.btnCodex, RECAP_KO.btnLegend].map((s) => fmt(s)),
    };
    killerEl.textContent = k ? RECAP_KO.killed(k.src, k.atk, k.amount) : '';
    hitsEl.innerHTML = rows.map((r) => `<li data-el="${esc(r.el)}">${esc(r.grp && r.n > 1 ? RECAP_KO.group(r.name, r.n, r.amount) : RECAP_KO.hit(r.sec, r.src, r.atk, r.amount))}</li>`).join('');
    tipEl.textContent = tip ? `${RECAP_KO.tipPre}: ${tip}` : '';
    tipEl.style.display = tip ? '' : 'none';
    respBtn.textContent = fmt(RECAP_KO.btnRespawn);
    let where = '';
    try { where = game.player?.respawnName?.() || game.story?.respawnName?.() || ''; } catch (_) { where = ''; }
    whereEl.textContent = RECAP_KO.respawn(where || RECAP_KO.respawnDefault);
    return last;
  }

  // 3 deaths to the same boss → suggest 쉬움 once (normal / hard only)
  const bossDeaths = {}; let suggested = false;
  ev.on('playerDeath', () => {
    const A = game.assist;
    if (A?.autoRevive) { build(); strip.textContent = RECAP_KO.revived(last?.attack ? `${last.killer} · ${last.attack}` : last?.killer || RECAP_KO.unknown); anim(strip, 'show'); stripT = 4; return; }
    const b = game.enemies?.boss;
    if (b && b.alive !== false && !b.defeated) {
      const id = b.bossId || b.kind || 'boss';
      bossDeaths[id] = (bossDeaths[id] || 0) + 1;
      const d = game.settings?.values?.difficulty;
      if (!suggested && bossDeaths[id] >= 3 && (d === 'normal' || d === 'hard')) {
        suggested = true;
        setTimeout(() => confirm(RECAP_KO.suggestEasy, () => { try { game.settings.set('difficulty', 'easy'); } catch (_) { /* */ } }), 900);
      }
    }
  });

  let deadT = 0, shown = false;
  return {
    show() {
      if (game.assist?.autoRevive) return false;
      build(); shown = true; deadT = 2.0;
      el.classList.add('show', 'final');
      return true;
    },
    hide() { shown = false; el.classList.remove('show', 'final'); },
    update(dt) {
      if (stripT > 0 && (stripT -= dt) <= 0) strip.classList.remove('show');
      if (!shown) return;
      if (deadT > 0) { deadT -= dt; const t = deadT > 0 ? RECAP_KO.counting(Math.ceil(deadT)) : RECAP_KO.reviving; if (countEl.textContent !== t) countEl.textContent = t; }
    },
    recap: () => (shown ? last : null),
    get isOpen() { return shown; },
    el,
  };
}
