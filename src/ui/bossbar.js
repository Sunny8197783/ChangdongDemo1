// Data-driven boss bar (CONTRACT §18, DESIGN §10): name / title / subtitle / phase pips from the bossSpawn payload,
// bossPhase name, break gauge, voidShield overlay, multi-part sub-bars (hydra heads, shards, eyes) with lock icons.
// Nothing here names a boss: every string comes from the payload or the entity (fallback text in text.js).
import { clamp } from '../core/utils.js';
import { h, esc } from './dom.js';
import { elementSVG } from './icons.js';
import { BOSS_KO, HUD_KO } from './text.js';

const PART_POOL = 6;

export function createBossBar(game, ui, parent) {
  const root = parent.appendChild(h('div', 'aw-boss', `
    <div class="aw-boss-title"></div>
    <div class="aw-boss-name"><span class="aw-boss-orn">❖</span><b></b><span class="aw-boss-orn">❖</span><span class="aw-boss-weak"></span></div>
    <div class="aw-boss-bar"><div class="aw-bar-lag"></div><div class="aw-bar-fill"></div><div class="aw-boss-void"></div><div class="aw-bar-gloss"></div><div class="aw-boss-pips"></div></div>
    <div class="aw-boss-meta"><span class="aw-boss-phase"></span><span class="aw-boss-sub"></span><span class="aw-boss-state"></span></div>
    <div class="aw-boss-break"><i></i></div>
    <div class="aw-boss-parts"></div>`));
  const titleEl = root.querySelector('.aw-boss-title'), nameEl = root.querySelector('.aw-boss-name b');
  const fill = root.querySelector('.aw-bar-fill'), lag = root.querySelector('.aw-bar-lag'), voidEl = root.querySelector('.aw-boss-void');
  const pipBox = root.querySelector('.aw-boss-pips'), phaseEl = root.querySelector('.aw-boss-phase'), subEl = root.querySelector('.aw-boss-sub');
  const stateEl = root.querySelector('.aw-boss-state'), breakBox = root.querySelector('.aw-boss-break'), breakFill = breakBox.firstElementChild;
  const partBox = root.querySelector('.aw-boss-parts');
  const parts = [];
  for (let i = 0; i < PART_POOL; i++) {
    const p = partBox.appendChild(h('div', 'aw-bpart', '<span class="aw-bpart-lock"></span><span class="aw-bpart-name"></span><span class="aw-bpart-bar"><i></i></span>'));
    p.style.display = 'none';
    parts.push({ el: p, lock: p.firstChild, name: p.querySelector('.aw-bpart-name'), fill: p.querySelector('i'), id: null, f: -1, lockEl: '', shown: false });
  }

  const rect = { l: 0, t: 0, r: 0, b: 0 }, scrP = { x: 0, y: 0 };
  let rectT = 0, dim = false;
  let info = null;          // the last bossSpawn payload
  let boss = null, shown = false, lagV = 1, lastF = -1, lastVoid = -1, lastBreak = -1, broken = null, phaseIdx = -1;

  function partOf(b, id) {
    if (!b) return null;
    if (typeof b.getPart === 'function') { try { return b.getPart(id); } catch (_) { return null; } }
    const arr = b.parts;
    if (Array.isArray(arr)) { for (const p of arr) if (p && (p.id === id || p.partId === id)) return p; }
    else if (arr && typeof arr === 'object') return arr[id] || null;
    return null;
  }

  function setup(p) {
    info = p || null;
    const b = p?.boss || null;
    titleEl.textContent = p?.title || b?.title || '';
    nameEl.textContent = p?.name || b?.name || BOSS_KO.fallbackName;
    subEl.textContent = p?.sub || '';
    // larger weakness / resist icons on the boss bar (§6.5)
    let wk = '';
    for (const w of [].concat(b?.weakness || [])) wk += `<i class="aw-wk weak">${elementSVG(w, 20)}</i>`;
    for (const k in (b?.resist || {})) if (b.resist[k] < 1) wk += `<i class="aw-wk res">${elementSVG(k, 20)}</i>`;
    root.querySelector('.aw-boss-weak').innerHTML = wk;
    const ph = p?.phases || [];
    pipBox.innerHTML = ph.map((x) => `<i style="left:${(clamp(x.at ?? 0.5, 0, 1) * 100).toFixed(1)}%" title="${esc(x.name || '')}"></i>`).join('');
    phaseIdx = -1; setPhase(0, '');
    setParts(p?.parts || []);
    lastF = lastVoid = lastBreak = -1; broken = null; lagV = 1;
  }
  /** Part sub-bars. An entry may carry gauge:'lock' (the bar shows the lock gauge, not HP) and counters:[el…]. */
  function setParts(list) {
    for (let i = 0; i < PART_POOL; i++) {
      const o = parts[i];
      const d = list[i];
      o.id = d ? d.id : null; o.f = -1; o.lockEl = ''; o.gauge = d?.gauge || null;
      o.shown = !!d; o.el.style.display = d ? '' : 'none';
      if (d) {
        o.name.innerHTML = esc(d.name || '') + (d.counters?.length ? ` <span class="aw-bpart-ctr" title="${esc(BOSS_KO.counters || '')}">${d.counters.map((c) => elementSVG(c, 12)).join('')}</span>` : '');
        o.lock.innerHTML = ''; o.el.className = 'aw-bpart';
      }
    }
    root.classList.toggle('has-parts', !!list.length);
  }
  function setPhase(i, name) {
    if (i === phaseIdx && !name) return;
    phaseIdx = i;
    phaseEl.textContent = name ? `${BOSS_KO.phase(i + 1)} · ${name}` : (info?.phases?.length ? BOSS_KO.phase(i + 1) : '');
    const c = pipBox.children;
    for (let k = 0; k < c.length; k++) c[k].classList.toggle('past', k < i);
    if (i > 0) ui.anim?.(root, 'phase');
  }

  const ev = game.events;
  ev.on('bossSpawn', (p) => { setup(p); });
  ev.on('bossPhase', (p) => {
    if (info && p?.id && info.id && p.id !== info.id) return;
    const n = Math.max(0, (p?.phase ?? 1) - 1);
    setPhase(n, p?.name || info?.phases?.[n - 1]?.name || '');
  });
  // per-phase part lists (a boss re-sends them when its targets change: lock rotation, new phase)
  ev.on('bossParts', (p) => {
    if (info && p?.id && info.id && p.id !== info.id) return;
    if (info) info.parts = p?.parts || [];
    setParts(p?.parts || []);
  });
  ev.on('lockStripped', (p) => {
    for (const o of parts) if (o.id && o.id === p?.partId) { ui.anim?.(o.el, 'strip'); o.lockEl = ''; }
  });
  ev.on('bossDefeated', (p) => { if (!info || !p?.id || !info.id || p.id === info.id) { if (info) info.boss = null; } boss = null; });

  return {
    el: root,
    get info() { return info; },
    get shown() { return shown; },
    /** Per frame: hp/lag, void overlay, break gauge; parts at the caller's 20 Hz `full` tick. */
    update(dt, full) {
      let b = null;
      // the entity from the bossSpawn payload first (bosses that never set enemies.boss), then the enemies module
      const pb = info?.boss;
      if (pb && pb.alive !== false && !(pb.hp <= 0)) b = pb;
      else { try { b = game.enemies?.boss || game.enemies?.getObjective?.()?.boss || null; } catch (_) { b = null; } }
      if (b && b.alive === false) b = null;
      if (b !== boss) {
        boss = b;
        if (b && (!info || (info.boss && info.boss !== b))) setup(info && info.boss === b ? info : { boss: b, name: b.name, title: b.title, sub: b.sub, phases: b.phases, parts: b.partList || null });
      }
      const on = !!b;
      if (on !== shown) { shown = on; root.classList.toggle('show', on); }
      if (!b) return;
      const f = clamp((b.hp ?? 0) / (b.maxHp || 1), 0, 1);
      if (Math.abs(f - lastF) > 0.0005) { lastF = f; fill.style.transform = `scaleX(${f.toFixed(4)})`; }
      if (lagV > f) { lagV = Math.max(f, lagV - dt * 0.25); lag.style.transform = `scaleX(${lagV.toFixed(4)})`; }
      else if (lagV < f) { lagV = f; lag.style.transform = `scaleX(${f.toFixed(4)})`; }
      if (!full) return;
      const vs = clamp((b.voidShield || 0) / 100, 0, 1);
      const qv = Math.round(vs * 100) / 100;
      if (qv !== lastVoid) { lastVoid = qv; voidEl.style.transform = `scaleX(${qv})`; root.classList.toggle('void', qv > 0); }
      const bm = b.breakMax || 0;
      if (bm > 0) {
        const bf = Math.round(clamp((b.breakValue ?? bm) / bm, 0, 1) * 100) / 100;
        if (bf !== lastBreak) { lastBreak = bf; breakFill.style.transform = `scaleX(${bf})`; }
      }
      breakBox.classList.toggle('on', bm > 0);
      let br = false; try { br = !!(game.combat?.isBroken?.(b) || b.statuses?.broken); } catch (_) { br = false; }
      if (br !== broken) { broken = br; root.classList.toggle('broken', br); stateEl.textContent = br ? HUD_KO.broken : qv > 0 ? HUD_KO.voidShield : ''; }
      else if (!br) { const t = qv > 0 ? HUD_KO.voidShield : ''; if (stateEl.textContent !== t) stateEl.textContent = t; }
      // a tall boss rearing its head behind the panel: fade the panel so the face stays readable
      if ((rectT -= dt * 20) <= 0) { rectT = 10; try { const r = root.getBoundingClientRect(); rect.l = r.left; rect.t = r.top; rect.r = r.right; rect.b = r.bottom; } catch (_) { /* */ } }
      let behind = false;
      try {
        const hp = b.st?.headPos || b.getAimPoint?.() || null;
        if (hp && ui.project?.(hp, scrP)) behind = scrP.x > rect.l - 20 && scrP.x < rect.r + 20 && scrP.y > rect.t - 10 && scrP.y < rect.b + 30;
      } catch (_) { behind = false; }
      if (behind !== dim) { dim = behind; root.classList.toggle('dim', behind); }
      // part sub-bars
      for (const o of parts) {
        if (!o.shown) continue;
        const p = partOf(b, o.id);
        const pf = !p ? 1 : o.gauge === 'lock' ? clamp((p.lock?.gauge ?? 0) / 100, 0, 1) : clamp((p.hp ?? p.value ?? 1) / (p.maxHp || p.max || 1), 0, 1);
        const q = Math.round(pf * 100) / 100;
        if (q !== o.f) { o.f = q; o.fill.style.transform = `scaleX(${q})`; o.el.classList.toggle('dead', o.gauge !== 'lock' && (q <= 0 || p?.alive === false)); }
        const lk = p?.lock?.element || '';
        if (lk !== o.lockEl) { o.lockEl = lk; o.lock.innerHTML = lk ? elementSVG(lk, 13) : ''; o.el.classList.toggle('locked', !!lk); }
      }
    },
  };
}
