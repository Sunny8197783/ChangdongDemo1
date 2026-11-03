// 원소 별자리 — the v3 skill tree screen (CONTRACT §18, DESIGN §10 / §5.4–5.6 / §6.1).
// Ring view: 9 element sigils around the class emblem (primary gold, secondary silver, locked grey + chain).
// Selecting a sigil zooms (CSS transform) into that element's constellation: 5 tier rows of star nodes, SVG connector lines,
// a rune ring per tier that lights when the points gate is met. Detail panel, header (points / mastery / respec), planner
// mode (never commits), quick-slot bar (drag a node onto 1–4/X/G, or hover + press the key).
// Data: game.skills.trees / nodes / defs, progression, classes. Fallback when skills is stubbed: await import of the tree
// data (never a static import, rule 7). All DOM is built once per element (lazily on first open); updates run on events.
import { ALL_ELEMENTS, ELEMENT_DEFS, elName } from '../core/elements.js';
import { CLASS_DEFS, classesForElement } from '../core/classes.js';
import { h, esc, fmtNum } from './dom.js';
import { elementSVG, elCss, ARCH_GLYPH, classSVG, CHAIN_SVG, SHARD_SVG, LOCK_SVG } from './icons.js';
import { TYPE_KO, TIER_KO, TIER_GATE, SLOT_KO, ACCESS_KO, MASTERY_KO, REASON_KO, EQUIP_SLOTS, TREE_KO, TIPS } from './text.js';

const ROWS = 5;
const SLOT_ACCEPTS = { q1: ['quick', 'support'], q2: ['quick', 'support'], q3: ['quick', 'support'], q4: ['quick', 'support'], ult: ['ultimate'], sup: ['support'] };
const STORY_SPIRIT = { water: 'water', shadow: 'shadow', nature: 'nature' };

export function createSkillTree(game, ui, parent) {
  const P = () => game.progression;
  const S = () => (game.skills && !game.skills.isStub ? game.skills : null);

  // ------------------------------------------------------------------ data (skills module or the dynamic-import fallback)
  let data = null, loading = false, loadFailed = false;
  function fromTrees(trees, nodes, defs) {
    const haveN = nodes instanceof Map && nodes.size > 0, haveD = defs instanceof Map && defs.size > 0;
    const N = haveN ? nodes : new Map(), D = haveD ? defs : new Map();
    for (const el of Object.keys(trees)) {
      const t = trees[el];
      if (!haveN) for (const n of t.nodes || []) N.set(n.id, n);
      if (!haveD) for (const id of Object.keys(t.skills || {})) D.set(id, t.skills[id]);
    }
    return { trees, nodes: N, defs: D };
  }
  function syncData() {
    if (data) return data;
    const sk = S();
    if (sk && sk.trees && Object.keys(sk.trees).length) { data = fromTrees(sk.trees, sk.nodes, sk.defs); return data; }
    return null;
  }
  async function loadFallback() {
    if (loading || data || loadFailed) return;
    loading = true;
    try {
      const m = await import('../skills/trees/index.js');
      const trees = m.TREES || m.default;
      if (!trees || !Object.keys(trees).length) throw new Error('no TREES export');
      data = fromTrees(trees);
      // skills is stubbed, so progression never got the trees: register them so learning works (registerTrees is re-callable)
      try { if (!P()?.hasTrees?.()) P()?.registerTrees?.(trees); } catch (err) { console.warn('[ui] registerTrees fallback', err); }
    } catch (err) {
      loadFailed = true;
      console.warn('[ui] skill tree data unavailable:', err?.message || err);
    }
    loading = false;
    if (api.isOpen) { build(); refresh(); }
  }

  // ------------------------------------------------------------------ DOM shell
  const root = parent.appendChild(h('div', 'aw-screen aw-modal aw-tree', `
    <div class="aw-tree-sky"></div>
    <div class="aw-tree-head">
      <div class="aw-tree-titles"><div class="aw-tree-title">${TREE_KO.title}</div><div class="aw-tree-sub">${TREE_KO.sub}</div></div>
      <div class="aw-tree-points"><span>${TREE_KO.points}</span><b>0</b><em class="aw-tree-plancost"></em></div>
      <div class="aw-tree-mastery"></div>
      <div class="aw-tree-respec"><span class="aw-tree-respec-st"></span><button class="aw-btn aw-btn-small" data-tact="respec">${TREE_KO.respecAll}</button></div>
      <button class="aw-btn aw-btn-small aw-tree-cls" data-tact="classchange">${TREE_KO.classChange}</button>
      <button class="aw-tree-planner" data-tact="planner"><i></i><span>${TREE_KO.planner}</span></button>
      <button class="aw-btn aw-btn-small aw-tree-planreset" data-tact="planreset">${TREE_KO.planReset}</button>
      <button class="aw-tree-x" data-tact="close" title="${TREE_KO.close}"><kbd>K</kbd></button>
    </div>
    <div class="aw-tree-banner">${TREE_KO.plannerOn}</div>
    <div class="aw-tree-stage">
      <div class="aw-tree-ring"><svg class="aw-ring-lines" viewBox="0 0 100 100" preserveAspectRatio="none"></svg><div class="aw-ring-center"></div></div>
      <div class="aw-tree-consts"></div>
      <button class="aw-btn aw-btn-small aw-tree-back" data-tact="back">◂ ${TREE_KO.back}</button>
      <div class="aw-tree-nodata"></div>
    </div>
    <aside class="aw-tree-detail"></aside>
    <div class="aw-tree-qbar"><div class="aw-qbar-hint">${TREE_KO.equipHint}</div><div class="aw-qbar-slots"></div></div>
    <div class="aw-tree-msg"></div>`));
  const sky = root.querySelector('.aw-tree-sky');
  {
    let s = '';
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * 100, y = Math.random() * 100, d = 3 + Math.random() * 7, dl = -Math.random() * 8, sz = 0.8 + Math.random() * 2.2;
      s += `<i style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px;animation-duration:${d.toFixed(1)}s;animation-delay:${dl.toFixed(1)}s"></i>`;
    }
    sky.innerHTML = s;
  }
  const stage = root.querySelector('.aw-tree-stage'), ring = root.querySelector('.aw-tree-ring');
  const ringLines = root.querySelector('.aw-ring-lines'), ringCenter = root.querySelector('.aw-ring-center');
  const consts = root.querySelector('.aw-tree-consts'), noData = root.querySelector('.aw-tree-nodata');
  const detail = root.querySelector('.aw-tree-detail'), msgEl = root.querySelector('.aw-tree-msg');
  const ptsEl = root.querySelector('.aw-tree-points b'), planCostEl = root.querySelector('.aw-tree-plancost');
  const masteryBox = root.querySelector('.aw-tree-mastery');
  const respecSt = root.querySelector('.aw-tree-respec-st'), respecBtn = root.querySelector('[data-tact="respec"]');
  const plannerBtn = root.querySelector('.aw-tree-planner'), clsBtn = root.querySelector('.aw-tree-cls');
  const qbarSlots = root.querySelector('.aw-qbar-slots');

  // quick-slot bar (bottom)
  const qslots = {};
  for (const e of EQUIP_SLOTS) {
    const s = qbarSlots.appendChild(h('div', 'aw-qslot', `<div class="aw-qslot-ring"><div class="aw-qslot-ico"></div></div><kbd>${e.key}</kbd><div class="aw-qslot-name"></div>`));
    s.dataset.slot = e.slot;
    qslots[e.slot] = { el: s, ico: s.querySelector('.aw-qslot-ico'), name: s.querySelector('.aw-qslot-name'), id: undefined };
  }

  // ring view: 9 sigils (built once)
  const sigils = {};
  {
    let lines = '';
    ALL_ELEMENTS.forEach((el, i) => {
      const a = (i / ALL_ELEMENTS.length) * Math.PI * 2 - Math.PI / 2;
      const x = 50 + Math.cos(a) * 36, y = 50 + Math.sin(a) * 36;
      const b = ring.appendChild(h('button', 'aw-sig', `
        <span class="aw-sig-rim"></span><span class="aw-sig-face">${elementSVG(el, 34)}</span>
        <span class="aw-sig-name">${esc(elName(el))}</span><span class="aw-sig-sub"></span>
        <span class="aw-sig-chain">${CHAIN_SVG}</span><span class="aw-sig-tip"></span>`));
      b.dataset.el = el;
      b.style.left = x.toFixed(2) + '%'; b.style.top = y.toFixed(2) + '%';
      b.style.setProperty('--ec', elCss(el));
      sigils[el] = { el: b, sub: b.querySelector('.aw-sig-sub'), tip: b.querySelector('.aw-sig-tip'), x, y };
      const j = (i + 1) % ALL_ELEMENTS.length, a2 = (j / ALL_ELEMENTS.length) * Math.PI * 2 - Math.PI / 2;
      lines += `<line x1="${x.toFixed(2)}" y1="${y.toFixed(2)}" x2="${(50 + Math.cos(a2) * 36).toFixed(2)}" y2="${(50 + Math.sin(a2) * 36).toFixed(2)}"/>`;
      lines += `<line class="spoke" x1="50" y1="50" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/>`;
    });
    ringLines.innerHTML = lines;
  }

  // ------------------------------------------------------------------ constellations (built lazily per element)
  const C = {};        // el → {root, nodes: {id: {btn, rank, n}}, rows:[rowEl], lines:[{line, from, to}], head}
  let built = false;
  function nodeGlyph(n) {
    if (n.type === 'active' || n.type === 'support' || n.type === 'ultimate') {
      const d = data?.defs.get((n.grants || [])[0]);
      if (n.slotRole === 'attune') return ARCH_GLYPH.basic;
      return ARCH_GLYPH[d?.archetype] || ARCH_GLYPH[n.type] || ARCH_GLYPH.projectile;
    }
    return ARCH_GLYPH[n.type] || ARCH_GLYPH.passive;
  }
  function buildConst(el) {
    const t = data.trees[el]; if (!t) return null;
    const def = ELEMENT_DEFS[el];
    const wrap = consts.appendChild(h('div', 'aw-const', `
      <div class="aw-const-head"><span class="aw-const-ico">${elementSVG(el, 30)}</span>
        <div><div class="aw-const-name">${esc(elName(el))}</div><div class="aw-const-spirit">${esc(def?.spirit?.name || '')} · ${esc(def?.spirit?.title || '')}</div></div>
        <div class="aw-const-stat"></div></div>
      <div class="aw-const-field"><svg class="aw-const-lines" viewBox="0 0 100 100" preserveAspectRatio="none"></svg></div>`));
    wrap.dataset.el = el;
    wrap.style.setProperty('--ec', elCss(el));
    const field = wrap.querySelector('.aw-const-field'), svg = wrap.querySelector('.aw-const-lines');
    const nodes = t.nodes || [];
    const cols = [0, 0, 0, 0, 0];
    for (const n of nodes) { const r = Math.min(ROWS - 1, n.pos?.row ?? (n.tier - 1)); cols[r] = Math.max(cols[r], (n.pos?.col ?? 0) + 1); }
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      const tier = r + 1;
      const row = field.appendChild(h('div', 'aw-trow', `<span class="aw-trow-rune"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg></span><span class="aw-trow-lbl">${TREE_KO.tierRow(TIER_KO[tier], TIER_GATE[tier])}</span>`));
      row.style.top = ((r + 0.5) / ROWS * 100).toFixed(2) + '%';
      rows.push(row);
    }
    const pos = {};
    const NB = {};
    for (const n of nodes) {
      const r = Math.min(ROWS - 1, n.pos?.row ?? (n.tier - 1)), c = n.pos?.col ?? 0;
      const x = 16 + ((c + 0.5) / Math.max(1, cols[r])) * 80, y = (r + 0.5) / ROWS * 100;
      pos[n.id] = { x, y };
      const b = field.appendChild(h('button', `aw-node t-${n.type}${n.slotRole === 'cap' ? ' cap' : ''}`, `
        <span class="aw-node-star"><span class="aw-node-gl">${nodeGlyph(n)}</span></span>
        <span class="aw-node-rank"></span><span class="aw-node-name">${esc(n.nameKo || data.defs.get((n.grants || [])[0])?.nameKo || n.id)}</span>
        <span class="aw-node-shard">${SHARD_SVG}</span><span class="aw-node-x"></span>`));
      b.dataset.id = n.id;
      b.style.left = x.toFixed(2) + '%'; b.style.top = y.toFixed(2) + '%';
      NB[n.id] = { btn: b, n, rk: b.querySelector('.aw-node-rank'), st: '', rkTxt: '' };
    }
    // connector lines (prerequisites) + 택1 marks between exclusive pairs
    let lines = '';
    const L = [];
    for (const n of nodes) {
      const reqs = n.requires ? [n.requires] : n.requiresAny || [];
      for (const q of reqs) {
        if (!pos[q] || !pos[n.id]) continue;
        lines += `<line data-a="${q}" data-b="${n.id}" x1="${pos[q].x.toFixed(2)}" y1="${pos[q].y.toFixed(2)}" x2="${pos[n.id].x.toFixed(2)}" y2="${pos[n.id].y.toFixed(2)}"/>`;
      }
      if (n.exclusive && pos[n.exclusive] && n.id < n.exclusive) {
        const a = pos[n.id], b = pos[n.exclusive];
        const m = field.appendChild(h('span', 'aw-excl-tag', TREE_KO.exclusivePair));
        m.style.left = ((a.x + b.x) / 2).toFixed(2) + '%'; m.style.top = ((a.y + b.y) / 2 + 6.5).toFixed(2) + '%';
      }
    }
    svg.innerHTML = lines;
    for (const ln of svg.querySelectorAll('line')) L.push({ line: ln, a: ln.dataset.a, b: ln.dataset.b, on: null });
    const rec = { root: wrap, nodes: NB, rows, lines: L, stat: wrap.querySelector('.aw-const-stat'), rowMet: [] };
    C[el] = rec;
    return rec;
  }
  function build() {
    const d = syncData();
    if (!d) {
      noData.textContent = loading || !loadFailed ? '' : TREE_KO.noData;
      root.classList.toggle('nodata', loadFailed);
      if (!loadFailed) loadFallback();
      return false;
    }
    root.classList.remove('nodata');
    noData.textContent = '';
    if (!built) {
      built = true;
      for (const el of ALL_ELEMENTS) if (d.trees[el]) buildConst(el);
    }
    return true;
  }

  // ------------------------------------------------------------------ planner model (never commits anything)
  let planner = false;
  const plan = new Map();     // nodeId → planned extra ranks
  const realRank = (id) => P()?.rank?.(id) || 0;
  const rankOf = (id) => realRank(id) + (planner ? plan.get(id) || 0 : 0);
  function planCost() { let c = 0; for (const [id, r] of plan) c += (data?.nodes.get(id)?.cost ?? 1) * r; return c; }
  function pointsLeft() { const pr = P(); const base = pr?.points ?? 0; return planner ? base - planCost() : base; }
  function gatePts(el) {
    let s = 0;
    const pr = P();
    for (const n of data?.trees[el]?.nodes || []) {
      if (pr?.isGranted?.(n.id)) { s += 1; continue; }
      const r = rankOf(n.id); if (r > 0) s += (n.cost ?? 1) * r;
    }
    return s;
  }
  /** canLearn — the real progression check, or the same rules on the planned ranks (DESIGN §5.4, CONTRACT §4). */
  function canLearn(id) {
    const pr = P(); if (!pr) return { ok: false, reason: 'unknown' };
    if (!planner) return pr.canLearn?.(id) || { ok: false, reason: 'unknown' };
    const n = data?.nodes.get(id); if (!n) return { ok: false, reason: 'unknown' };
    const r = rankOf(id);
    if (r >= (n.maxRank || 1)) return { ok: false, reason: 'maxRank' };
    const ung = !!pr.debug?.ungate;
    if (!ung) {
      const a = pr.access?.(n.element);
      if (!a) return { ok: false, reason: 'class' };
      if (a === 'secondary' && (n.tier || 1) >= 4) return { ok: false, reason: 'tier' };
      if (n.type === 'capstone' && !pr.storyGateOpen?.(n.element)) return { ok: false, reason: 'story' };
      if (gatePts(n.element) < (TIER_GATE[n.tier || 1] || 0)) return { ok: false, reason: 'gate' };
    }
    if (r === 0) {
      if (n.requires && rankOf(n.requires) < 1) return { ok: false, reason: 'prereq' };
      if (n.requiresAny?.length && !n.requiresAny.some((q) => rankOf(q) >= 1)) return { ok: false, reason: 'prereq' };
    }
    if (n.exclusive && rankOf(n.exclusive) > 0) return { ok: false, reason: 'exclusive' };
    if (!pr.debug?.infPoints && pointsLeft() < (n.cost ?? 1)) return { ok: false, reason: 'points' };
    return { ok: true };
  }

  // ------------------------------------------------------------------ state refresh
  let activeEl = null, hoverId = null, selId = null, dirty = true;
  function nodeState(n) {
    const pr = P();
    const r = rankOf(n.id), max = n.maxRank || 1;
    const el = n.element, acc = pr?.access?.(el), ung = !!pr?.debug?.ungate;
    if (!acc && !ung) return 'locked';
    if (r >= max) return 'maxed';
    if (n.exclusive && rankOf(n.exclusive) > 0) return 'excl';
    if (!ung && acc === 'secondary' && (n.tier || 1) >= 4) return 'tierlock';
    if (!ung && n.type === 'capstone' && !pr?.storyGateOpen?.(el)) return 'story';
    const c = canLearn(n.id);
    if (r > 0) return c.ok ? 'learned avail' : 'learned';
    return c.ok ? 'avail' : c.reason === 'points' ? 'nopts' : 'locked';
  }
  function refreshConst(el) {
    const rec = C[el]; if (!rec) return;
    const pr = P();
    for (const id in rec.nodes) {
      const o = rec.nodes[id];
      const st = nodeState(o.n);
      const planned = planner && (plan.get(id) || 0) > 0;
      const key = st + (planned ? ' planned' : '');
      if (key !== o.st) { o.st = key; o.btn.className = `aw-node t-${o.n.type}${o.n.slotRole === 'cap' ? ' cap' : ''} ${key}`; o.btn.draggable = st.startsWith('learned') || st === 'maxed'; }
      const r = rankOf(id), max = o.n.maxRank || 1;
      const t = max > 1 || r > 0 ? `${r}/${max}` : '';
      if (t !== o.rkTxt) { o.rkTxt = t; o.rk.textContent = t; }
    }
    for (const L of rec.lines) {
      const on = rankOf(L.a) > 0 && rankOf(L.b) > 0 ? 2 : rankOf(L.a) > 0 ? 1 : 0;
      if (on !== L.on) { L.on = on; L.line.setAttribute('class', on === 2 ? 'lit' : on === 1 ? 'open' : ''); }
    }
    const gp = gatePts(el);
    const cap = pr?.tierCap?.(el);
    for (let r = 0; r < ROWS; r++) {
      const tier = r + 1;
      const capped = !cap || (cap === 'T3' && tier >= 4) || (cap === 'T4' && tier >= 5);
      const met = gp >= TIER_GATE[tier] && !capped;
      const k = (met ? 'met' : '') + (capped ? ' capped' : '');
      if (rec.rowMet[r] !== k) { rec.rowMet[r] = k; rec.rows[r].className = 'aw-trow ' + k; }
    }
    const m = pr?.mastery?.(el);
    const acc = pr?.access?.(el);
    rec.stat.innerHTML = `${acc ? `<em class="acc-${acc}">${ACCESS_KO[acc]}</em>` : ''}<span>${TREE_KO.mastery} <b>${MASTERY_KO[m?.rank] || m?.rank || '-'}</b></span><span>${gp}pt</span>`;
  }
  function refreshRing() {
    const pr = P(); const cls = pr?.cls; const cd = CLASS_DEFS[cls];
    ringCenter.innerHTML = cd ? `<div class="aw-ring-emblem">${classSVG(cd.style)}</div><div class="aw-ring-cls">${esc(cd.nameKo)}</div><div class="aw-ring-title">${esc(cd.title || '')}</div>` : '';
    for (const el of ALL_ELEMENTS) {
      const s = sigils[el]; if (!s) continue;
      const acc = pr?.access?.(el) || null;
      s.el.classList.toggle('primary', acc === 'primary');
      s.el.classList.toggle('secondary', acc === 'secondary');
      s.el.classList.toggle('locked', !acc);
      const pts = pr?.pointsIn?.(el) || 0;
      const m = pr?.mastery?.(el);
      s.sub.textContent = acc ? `${ACCESS_KO[acc]} · ${pts}pt${m && m.rank !== 'none' ? ' · ' + (MASTERY_KO[m.rank] || m.rank) : ''}` : '';
      const names = classesForElement(el).map((c) => CLASS_DEFS[c].nameKo).join('·');
      s.tip.textContent = acc ? (acc === 'secondary' ? TREE_KO.secondaryCap : '') : TREE_KO.locked(names);
      s.el.title = s.tip.textContent || elName(el);
    }
  }
  function refreshHead() {
    const pr = P();
    ptsEl.textContent = String(Math.max(0, pointsLeft()));
    planCostEl.textContent = planner && plan.size ? TREE_KO.planCost(planCost()) : '';
    const here = !!pr?.canRespecHere?.();
    respecSt.textContent = here ? TREE_KO.respecHere : TREE_KO.respecNo;
    respecSt.classList.toggle('ok', here);
    respecBtn.disabled = !here || planner;
    // 직업 변경: only at the altar and outside boss fights (progression.canChangeClass)
    let cc = false; try { cc = !!pr?.canChangeClass?.()?.ok && !!pr?.changeClass && !!ui.openClassPanel; } catch (_) { cc = false; }
    clsBtn.style.display = cc && !planner ? '' : 'none';
    plannerBtn.classList.toggle('on', planner);
    root.classList.toggle('planning', planner);
    // mastery chips for the class's elements
    const cls = pr?.cls; const cd = CLASS_DEFS[cls];
    let html = '';
    if (cd) for (const el of [...cd.primary, ...cd.secondary]) {
      const m = pr?.mastery?.(el);
      html += `<span class="aw-mchip${cd.primary.includes(el) ? ' p' : ''}" style="--ec:${elCss(el)}">${elementSVG(el, 13)}<b>${esc(MASTERY_KO[m?.rank] || '-')}</b></span>`;
    }
    if (masteryBox._h !== html) { masteryBox._h = html; masteryBox.innerHTML = html; }
  }
  function refreshQbar() {
    const sk = S();
    const lo = sk?.loadout || {};
    for (const e of EQUIP_SLOTS) {
      const q = qslots[e.slot];
      const id = lo[e.slot] || null;
      if (id === q.id) continue;
      q.id = id;
      const d = id ? data?.defs.get(id) || sk?.defs?.get?.(id) : null;
      q.el.classList.toggle('empty', !d);
      q.el.style.setProperty('--ec', d ? elCss(d.element) : '#8a8a8a');
      q.ico.innerHTML = d ? `${elementSVG(d.element, 18)}<span class="aw-qslot-gl">${ARCH_GLYPH[d.archetype] || ARCH_GLYPH[e.slot === 'ult' ? 'ultimate' : e.slot === 'sup' ? 'support' : 'projectile']}</span>` : '';
      q.name.textContent = d ? d.nameKo : TREE_KO.slotEmpty;
    }
  }
  function refresh() {
    dirty = false;
    refreshHead(); refreshRing();     // the ring / header need only progression + classes (they work without tree data)
    if (!data) return;
    refreshQbar();
    if (activeEl) refreshConst(activeEl);
    if (selId || hoverId) showDetail(hoverId || selId);
  }

  // ------------------------------------------------------------------ detail panel
  function skillOf(n) {
    if (!n?.grants?.length) return null;
    if (n.type === 'capstone') return null;
    return data.defs.get(n.grants[0]) || null;
  }
  function feedsOf(el, d) {
    const R = game.combat?.REACTIONS || [];
    const st = new Set();
    if (d?.params?.status) for (const k in d.params.status) st.add(k);
    const elSt = ELEMENT_DEFS[el]?.status; if (elSt) st.add(elSt);
    const defs = game.combat?.REACTION_DEFS || [];
    const out = [];
    for (const r of R) {
      if (out.length >= 6) break;
      if (!r.elements?.includes?.(el)) continue;
      out.push(r.name);
    }
    if (!out.length) for (const r of defs) { if (out.length >= 6) break; if ((r.match?.aura || []).some((a) => st.has(a)) && !out.includes(r.nameKo)) out.push(r.nameKo); }
    return out;
  }
  function showDetail(id) {
    const n = data?.nodes.get(id);
    if (!n) { detail.classList.remove('show'); return; }
    const pr = P(), sk = S();
    const d = skillOf(n);
    const r = rankOf(id), max = n.maxRank || 1;
    const st = nodeState(n);
    let tt = null;
    try { tt = sk?.tooltip?.(id, { rank: r }) || null; } catch (_) { tt = null; }
    const fam = CLASS_DEFS[pr?.cls]?.family || 'caster';
    const res = fam === 'melee' ? '투지' : 'MP';
    let html = `<div class="aw-dt-head" style="--ec:${elCss(n.element)}">${elementSVG(n.element, 22)}<div><div class="aw-dt-name">${esc(n.nameKo || d?.nameKo || id)}</div>
      <div class="aw-dt-badges"><span class="aw-badge t-${n.type}">${TYPE_KO[n.type] || n.type}</span><span class="aw-badge">${TIER_KO[n.tier] || ''}</span>
      <span class="aw-badge">${TREE_KO.rank(r, max)}</span><span class="aw-badge">${TREE_KO.cost(n.cost ?? 1, max > 1)}</span></div></div></div>`;
    if (d) {
      const cost = d.cost ? Math.round(d.cost * (fam === 'melee' ? 0.8 : 1)) : 0;
      html += `<div class="aw-dt-skill"><b>${esc(d.nameKo)}</b><span>${SLOT_KO[d.slot] || ''}</span>${cost || d.cd ? `<span>${TREE_KO.resLine(cost, res, d.cd ? fmtNum(d.cd) : 0)}</span>` : ''}</div>`;
    }
    html += `<div class="aw-dt-desc">${esc(n.desc || d?.desc || '')}</div>`;
    if (d?.desc && n.desc && d.desc !== n.desc) html += `<div class="aw-dt-desc sub">${esc(d.desc)}</div>`;
    const cur = tt?.current ?? (n.descRank && r > 0 ? n.descRank(r) : null);
    const nxt = tt?.next ?? (n.descRank && r < max ? n.descRank(r + 1) : null);
    if (cur || nxt) html += `<div class="aw-dt-rank">${cur ? `<span>${TREE_KO.current}: ${esc(cur)}</span>` : ''}${cur && nxt ? '<i>→</i>' : ''}${nxt ? `<span class="nx">${TREE_KO.next}: ${esc(nxt)}</span>` : ''}</div>`;
    if (tt?.lines?.length) {
      const extra = tt.lines.slice(2).filter((l) => !/^(비용|랭크)/.test(l));
      if (extra.length) html += `<ul class="aw-dt-lines">${extra.slice(0, 5).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
    }
    if (n.modifies) {
      const tgt = data.defs.get(n.modifies) || data.nodes.get(n.modifies);
      if (tgt) html += `<div class="aw-dt-mod">${TREE_KO.modifies(esc(tgt.nameKo))} · <em>${TREE_KO.exclusivePair}</em> ${esc(data.nodes.get(n.exclusive)?.nameKo || '')}</div>`;
    }
    if (n.type === 'capstone' && n.grants) html += `<div class="aw-dt-mod">${TREE_KO.grants}: ${n.grants.map((g) => esc(data.defs.get(g)?.nameKo || g)).join(' · ')}</div>`;
    if (d) html += `<div class="aw-dt-look">${fam === 'melee' ? TREE_KO.meleeLook : TREE_KO.casterLook}</div>`;
    const feeds = feedsOf(n.element, d);
    if (feeds.length) html += `<div class="aw-dt-feeds"><span>${TREE_KO.feeds}</span>${feeds.map((f) => `<b>${esc(f)}</b>`).join('')}</div>`;
    // reason / state line
    let why = '';
    if (st === 'story') {
      const el = n.element;
      why = el === 'light' ? TREE_KO.lumielGate : STORY_SPIRIT[el] ? TREE_KO.storyGate(ELEMENT_DEFS[el]?.spirit?.name || elName(el)) : TREE_KO.sealGate;
    } else if (st !== 'maxed' && !st.startsWith('learned')) {
      const c = canLearn(id); if (!c.ok) why = REASON_KO[c.reason] || '';
    }
    if (why) html += `<div class="aw-dt-why">${st === 'story' ? SHARD_SVG : LOCK_SVG}<span>${esc(why)}</span></div>`;
    // actions
    const canL = canLearn(id).ok;
    const unl = planner ? (plan.get(id) || 0) > 0 : (pr?.canUnlearn?.(id)?.ok ?? false);
    html += `<div class="aw-dt-acts"><button class="aw-btn aw-btn-primary aw-btn-small" data-tact="learn"${canL ? '' : ' disabled'}>${planner ? TREE_KO.learnPlan : TREE_KO.learn}</button>`;
    if (r > 0 && !pr?.isGranted?.(id)) html += `<button class="aw-btn aw-btn-small" data-tact="unlearn"${unl ? '' : ' disabled'}>${planner ? TREE_KO.unlearnPlan : TREE_KO.unlearn}</button>`;
    html += '</div>';
    if (d && !planner && realRank(id) > 0) {
      html += '<div class="aw-dt-equip">';
      for (const e of EQUIP_SLOTS) if (SLOT_ACCEPTS[e.slot].includes(d.slot)) html += `<button class="aw-eqbtn" data-equip="${e.slot}"><kbd>${e.key}</kbd></button>`;
      html += '</div>';
    }
    if (!planner && r > 0 && !pr?.isGranted?.(id)) {
      const cu = pr?.canUnlearn?.(id);
      if (cu && !cu.ok && cu.reason !== 'granted') html += `<div class="aw-dt-note">${esc(REASON_KO[cu.reason] || '')}</div>`;
    }
    detail.innerHTML = html;
    detail.dataset.id = id;
    detail.classList.add('show');
  }

  // ------------------------------------------------------------------ actions
  let msgT = 0;
  function message(text, kind = '') {
    msgEl.textContent = text; msgEl.dataset.kind = kind; msgT = 2.4;
    ui.anim?.(msgEl, 'show');
  }
  function flare(id) {
    const o = activeEl && C[activeEl]?.nodes[id]; if (!o) return;
    ui.anim?.(o.btn, 'flare');
    const f = o.btn.parentNode.appendChild(h('span', 'aw-flare'));
    f.style.left = o.btn.style.left; f.style.top = o.btn.style.top;
    setTimeout(() => f.remove(), 1100);
  }
  function learn(id) {
    const n = data?.nodes.get(id); if (!n) return;
    if (planner) {
      if (!canLearn(id).ok) return;
      plan.set(id, (plan.get(id) || 0) + 1);
      game.audio?.play?.('ui_select');
      dirty = true;
      return;
    }
    const pr = P();
    const before = pr?.mastery?.(n.element)?.rank;
    if (!pr?.learn?.(id)) { const c = pr?.canLearn?.(id); message(REASON_KO[c?.reason] || TREE_KO.rejected, 'bad'); game.audio?.play?.('ui_deny'); return; }
    game.audio?.play?.('skill_learn');
    flare(id);
    message(TREE_KO.learned(n.nameKo || id), 'ok');
    if (n.type === 'modifier') ui.tip?.('exclusive', TIPS.exclusive);
    const after = pr?.mastery?.(n.element)?.rank;
    if (before && after && after !== before && after !== 'none') ui.tip?.('masteryUp', TIPS.masteryUp(elName(n.element), MASTERY_KO[after] || after));
    dirty = true;
  }
  function unlearn(id) {
    if (planner) {
      const r = plan.get(id) || 0;
      if (r > 1) plan.set(id, r - 1); else plan.delete(id);
      dirty = true; return;
    }
    const pr = P();
    if (!pr?.unlearn?.(id)) { const c = pr?.canUnlearn?.(id); message(REASON_KO[c?.reason] || TREE_KO.rejected, 'bad'); return; }
    game.audio?.play?.('ui_click');
    dirty = true;
  }
  function equip(slot, nodeOrSkillId) {
    if (planner) { message(REASON_KO.planner, 'bad'); return false; }
    const n = data?.nodes.get(nodeOrSkillId);
    const d = n ? skillOf(n) : data?.defs.get(nodeOrSkillId);
    if (!d) { message(REASON_KO.slot, 'bad'); return false; }
    const sk = S();
    if (!sk) { message(REASON_KO.stub, 'bad'); return false; }
    if (!SLOT_ACCEPTS[slot]?.includes(d.slot)) { message(REASON_KO.slot, 'bad'); return false; }
    let ok = false;
    try { ok = sk.equip(slot, d.id || nodeOrSkillId) !== false; } catch (err) { console.warn('[ui] equip', err); ok = false; }
    if (!ok) {
      let c = null; try { c = sk.canEquip?.(slot, d.id); } catch (_) { c = null; }
      message(REASON_KO[c?.reason] || TREE_KO.rejected, 'bad'); game.audio?.play?.('ui_deny');
      return false;
    }
    game.audio?.play?.('ui_select');
    const lbl = EQUIP_SLOTS.find((e) => e.slot === slot)?.label || slot;
    message(TREE_KO.equipped(lbl), 'ok');
    ui.anim?.(qslots[slot].el, 'pop');
    dirty = true;
    return true;
  }
  function zoomTo(el) {
    if (!build()) return;
    if (!C[el]) return;
    if (activeEl && C[activeEl]) C[activeEl].root.classList.remove('on');
    activeEl = el;
    const s = sigils[el];
    stage.style.setProperty('--zx', s.x.toFixed(1) + '%'); stage.style.setProperty('--zy', s.y.toFixed(1) + '%');
    stage.classList.add('zoomed');
    C[el].root.classList.add('on');
    selId = null; hoverId = null; detail.classList.remove('show');
    refreshConst(el);
    game.audio?.play?.('ui_select');
    const pr = P();
    if (pr?.access?.(el) === 'primary' && !pr?.storyGateOpen?.(el) && !pr?.debug?.ungate) ui.tip?.('storyCap', TIPS.storyCap);
  }
  function backToRing() {
    if (activeEl && C[activeEl]) C[activeEl].root.classList.remove('on');
    activeEl = null; selId = null; hoverId = null;
    stage.classList.remove('zoomed');
    detail.classList.remove('show');
  }

  // ------------------------------------------------------------------ input wiring
  root.addEventListener('click', (e) => {
    const t = e.target;
    const act = t.closest('[data-tact]')?.dataset.tact;
    if (act) {
      game.audio?.play?.('ui_click');
      if (act === 'close') api.close();
      else if (act === 'back') backToRing();
      else if (act === 'planner') { planner = !planner; plan.clear(); dirty = true; }
      else if (act === 'planreset') { plan.clear(); dirty = true; }
      else if (act === 'respec') ui.confirm?.(TREE_KO.confirmRespec, () => { P()?.respecAll?.(); dirty = true; });
      else if (act === 'classchange') ui.openClassPanel?.({ current: P()?.cls, onPick: (cls) => { if (cls !== P()?.cls) P()?.changeClass?.(cls); dirty = true; } });
      else if (act === 'learn' && detail.dataset.id) learn(detail.dataset.id);
      else if (act === 'unlearn' && detail.dataset.id) unlearn(detail.dataset.id);
      return;
    }
    const eq = t.closest('[data-equip]');
    if (eq && detail.dataset.id) { equip(eq.dataset.equip, detail.dataset.id); return; }
    const sig = t.closest('.aw-sig');
    if (sig) { zoomTo(sig.dataset.el); return; }
    const node = t.closest('.aw-node');
    if (node) {
      const id = node.dataset.id;
      if (selId === id) learn(id); else { selId = id; showDetail(id); }
      return;
    }
    const qs = t.closest('.aw-qslot');
    if (qs && selId) equip(qs.dataset.slot, selId);
  });
  root.addEventListener('dblclick', (e) => { const node = e.target.closest('.aw-node'); if (node) learn(node.dataset.id); });
  root.addEventListener('contextmenu', (e) => { const node = e.target.closest('.aw-node'); if (node) { e.preventDefault(); unlearn(node.dataset.id); } });
  root.addEventListener('mouseover', (e) => {
    const node = e.target.closest('.aw-node');
    const id = node?.dataset.id || null;
    if (id && id !== hoverId) { hoverId = id; showDetail(id); }
  });
  root.addEventListener('mouseout', (e) => {
    const node = e.target.closest('.aw-node');
    if (node && !node.contains(e.relatedTarget)) { hoverId = null; if (selId) showDetail(selId); }
  });
  root.addEventListener('dragstart', (e) => {
    const node = e.target.closest?.('.aw-node'); if (!node) return;
    e.dataTransfer?.setData('text/plain', node.dataset.id);
    root.classList.add('dragging');
  });
  root.addEventListener('dragend', () => root.classList.remove('dragging'));
  qbarSlots.addEventListener('dragover', (e) => { if (e.target.closest('.aw-qslot')) e.preventDefault(); });
  qbarSlots.addEventListener('drop', (e) => {
    const qs = e.target.closest('.aw-qslot'); if (!qs) return;
    e.preventDefault(); root.classList.remove('dragging');
    const id = e.dataTransfer?.getData('text/plain'); if (id) equip(qs.dataset.slot, id);
  });

  // events → refresh while open
  const mark = () => { dirty = true; };
  for (const n of ['skillLearned', 'skillUnlearned', 'respec', 'pointsChanged', 'loadoutChanged', 'classChosen', 'levelUp', 'spiritFreed', 'sealsBroken', 'lumielFeather'])
    game.events.on(n, mark);
  game.events.on('classChosen', () => { plan.clear(); });

  // ------------------------------------------------------------------ api
  const api = {
    el: root,
    isOpen: false,
    get activeElement() { return activeEl; },
    get planner() { return planner; },
    setPlanner(on) { planner = !!on; plan.clear(); dirty = true; },
    plannedRanks: () => new Map(plan),
    nodeCount() { let k = 0; for (const el in C) k += Object.keys(C[el].nodes).length; return k; },
    hasData: () => !!data,
    defs: () => data?.defs || null,
    loadFailed: () => loadFailed,
    open(el) {
      api.isOpen = true;
      root.classList.add('show');
      build();
      dirty = true;
      if (el && build() && C[el]) zoomTo(el);
      else if (!el) backToRing();
      refresh();
    },
    close() {
      if (!api.isOpen) return;
      api.isOpen = false;
      root.classList.remove('show');
      planner = false; plan.clear();
      selId = hoverId = null;
    },
    learn, unlearn, equip, zoomTo, back: backToRing,
    /** Keys while open (raw input): hover a node + 1–4/X/G equips it. Escape/K are handled by ui.js. */
    handleKeys(R) {
      const id = hoverId || selId;
      if (!id) return;
      for (const e of EQUIP_SLOTS) if (R.pressed(e.code)) { equip(e.slot, id); break; }
    },
    update(dt) {
      if (!api.isOpen) return;
      if (dirty) refresh();
      if (msgT > 0) { msgT -= dt; if (msgT <= 0) msgEl.classList.remove('show'); }
    },
  };
  return api;
}
