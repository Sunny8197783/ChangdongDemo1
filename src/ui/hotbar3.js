// v3 hotbar (CONTRACT §7.5 / §18, DESIGN §10): LMB · RMB · 1 · 2 · 3 · 4 · X · G · R from HudState v3 (hs.slots),
// the attune gem arc from hs.elements, and the class signature widget from hs.signature (mage 연쇄 orbs, sword 인챈트 bar,
// ranger 집중 meter, paladin 수호의 맹세 pips, spiritcaller 정령 동료 icons, shadowblade 표식 count), the V gift prompt.
// Built once; update() writes the DOM only when a cached value changes (no layout reads, no per-frame allocation
// beyond the 20 Hz signature strings).
import { clamp } from '../core/utils.js';
import { h, esc } from './dom.js';
import { elementSVG, spellSVG, elCss, ARCH_GLYPH, LOCK_SVG } from './icons.js';
import { HOTBAR3, KIND_KO, HUD_KO, RES_KO } from './text.js';

const AWK_R = 44, AWK_C = 2 * Math.PI * AWK_R;
const GEM_POOL = 9;
const SIG_MODE = { attunement: 'orbs', enchant: 'bar', focus: 'bar', seal: 'pips', familiars: 'icons', marks: 'count' };

export function createHotbar3(game, ui, parent) {
  const root = parent.appendChild(h('div', 'aw-hb3'));
  const gift = root.appendChild(h('div', 'aw-hb3-gift', `<kbd>V</kbd><span>${HUD_KO.giftPrompt}</span><i></i>`));
  const finPrompt = root.appendChild(h('div', 'aw-fin-prompt', '<kbd>R</kbd><span>필살기</span>'));
  const top = root.appendChild(h('div', 'aw-hb3-top'));
  const arc = top.appendChild(h('div', 'aw-hb3-arc'));
  const attName = top.appendChild(h('div', 'aw-hb3-att', '<b></b><kbd>Z</kbd><span class="aw-hb3-hint"></span>'));
  const attNameB = attName.querySelector('b'), attHint = attName.querySelector('.aw-hb3-hint');
  attHint.textContent = HUD_KO.attuneHint.replace(/^Z\s*·\s*/, '');
  const sig = top.appendChild(h('div', 'aw-hb3-sig', `<span class="aw-sig-lbl"></span>
    <span class="aw-sig-orbs"><i></i><i></i><i></i></span>
    <span class="aw-sig-bar"><i></i></span>
    <span class="aw-sig-pips"></span>
    <span class="aw-sig-icons"></span>
    <b class="aw-sig-count"></b>`));
  const sigLbl = sig.querySelector('.aw-sig-lbl'), sigOrbs = [...sig.querySelectorAll('.aw-sig-orbs i')];
  const sigBar = sig.querySelector('.aw-sig-bar i'), sigPips = sig.querySelector('.aw-sig-pips'), sigIcons = sig.querySelector('.aw-sig-icons');
  const sigCount = sig.querySelector('.aw-sig-count');
  const row = root.appendChild(h('div', 'aw-hb3-row'));

  // gems (pool of 9, assigned to hs.elements in order)
  const gems = [];
  for (let i = 0; i < GEM_POOL; i++) {
    const g = arc.appendChild(h('div', 'aw-gem3', '<div class="aw-gem3-face"></div><div class="aw-gem3-lock">' + LOCK_SVG + '</div><div class="aw-gem3-pts"></div>'));
    g.style.display = 'none';
    gems.push({ el: g, face: g.firstChild, pts: g.querySelector('.aw-gem3-pts'), id: null, k: '' });
  }
  let awkOrn = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2, x = 50 + Math.cos(a) * 49, y = 50 + Math.sin(a) * 49;
    awkOrn += i % 3 === 0 ? `<path d="M${x.toFixed(1)} ${(y - 3).toFixed(1)}l2.4 3-2.4 3-2.4-3z"/>` : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".9"/>`;
  }
  const slots = {};
  const slotList = [];
  for (const def of HOTBAR3) {
    const awk = def.slot === 'fin' ? `<svg class="aw-awk" viewBox="0 0 100 100"><circle cx="50" cy="50" r="${AWK_R}" class="aw-awk-bg"/>
      <circle cx="50" cy="50" r="${AWK_R}" class="aw-awk-fg" stroke-dasharray="${AWK_C.toFixed(2)}" stroke-dashoffset="${AWK_C.toFixed(2)}"/><g class="aw-awk-orn">${awkOrn}</g></svg>` : '';
    const s = row.appendChild(h('div', `aw-slot3 s-${def.slot} k-${def.kind}`, `
      <div class="aw-slot3-ring">${awk}<div class="aw-slot3-ico"></div><div class="aw-slot3-cd"></div><div class="aw-slot3-cdnum"></div><b class="aw-slot3-ch"></b></div>
      <div class="aw-slot3-key">${esc(def.label)}</div>
      <div class="aw-slot3-name"></div>
      <div class="aw-slot3-cost"><i></i><span></span></div>`));
    s.dataset.slot = def.slot;
    const o = {
      def, root: s, ico: s.querySelector('.aw-slot3-ico'), cd: s.querySelector('.aw-slot3-cd'), cdnum: s.querySelector('.aw-slot3-cdnum'),
      ch: s.querySelector('.aw-slot3-ch'), name: s.querySelector('.aw-slot3-name'), costBox: s.querySelector('.aw-slot3-cost'),
      cost: s.querySelector('.aw-slot3-cost span'), awkFg: s.querySelector('.aw-awk-fg'),
      _sig: '', _cd: -1, _cdTxt: '', _cost: '', _low: null, _ready: null, _empty: null, _ch: -1,
    };
    slots[def.slot] = o; slotList.push(o);
  }

  let lastAtt = '', gemSig = '', sigKind = '', sigMax = -1, sigVal = -1, sigExtra = null, lastAwk = -1, finReady = null, giftOn = null, resKind = '';

  function iconFor(d, el) {
    const kind = d.kind === 'support' ? 'heavy' : d.kind === 'finisher' || d.kind === 'ultimate' ? 'ultimate' : d.kind === 'heavy' ? 'heavy' : 'basic';
    const size = d.slot === 'ult' || d.slot === 'fin' ? 56 : 46;
    const gl = ARCH_GLYPH[d.archetype] || ARCH_GLYPH[d.kind] || ARCH_GLYPH.basic;
    return spellSVG(el || 'physical', kind, size) + `<span class="aw-slot3-gl">${gl}</span>`;
  }

  function updateGems(hs) {
    const els = hs.elements || [];
    let k = '';
    for (let i = 0; i < els.length && i < GEM_POOL; i++) { const e = els[i]; k += e.id + (e.unlocked ? 1 : 0) + (e.attuned ? 1 : 0) + e.points + ','; }
    if (k === gemSig) return;
    gemSig = k;
    const n = Math.min(els.length, GEM_POOL);
    for (let i = 0; i < GEM_POOL; i++) {
      const g = gems[i];
      if (i >= n) { if (g.id !== null) { g.id = null; g.el.style.display = 'none'; } continue; }
      const e = els[i];
      if (g.id !== e.id) {
        g.id = e.id; g.el.style.display = '';
        g.face.innerHTML = elementSVG(e.id, 22);
        g.el.style.setProperty('--ec', e.css || elCss(e.id));
      }
      // arc placement: spread over ±(n-1)*11°, lifted at the ends
      const a = n > 1 ? (i / (n - 1) - 0.5) * (n - 1) * 0.16 : 0;
      g.el.style.transform = `translate(${(Math.sin(a) * 290).toFixed(1)}px, ${((1 - Math.cos(a)) * 290).toFixed(1)}px)`;
      g.el.classList.toggle('sel', !!e.attuned);
      g.el.classList.toggle('locked', !e.unlocked);
      g.el.classList.toggle('primary', e.access === 'primary');
      g.pts.textContent = e.points > 0 ? String(e.points) : '';
    }
  }

  function updateSignature(hs) {
    const s = hs.signature;
    const kind = s?.kind || '';
    if (kind !== sigKind) {
      sigKind = kind; sigMax = -1; sigVal = -1;
      sig.dataset.mode = SIG_MODE[kind] || '';
      sig.dataset.kind = kind;
      sigLbl.textContent = HUD_KO.sig[kind] || '';
      sig.classList.toggle('on', !!SIG_MODE[kind]);
    }
    if (!s || !SIG_MODE[kind]) return;
    const max = Math.max(1, Math.round(s.max || 1)), val = s.value || 0;
    const mode = SIG_MODE[kind];
    const extra = !!s.extra;
    if (extra !== sigExtra) { sigExtra = extra; sig.classList.toggle('extra', extra); }
    if (mode === 'bar') {
      const q = Math.round(clamp(val / max, 0, 1) * 100) / 100;
      if (q !== sigVal) { sigVal = q; sigBar.style.transform = `scaleX(${q})`; sig.classList.toggle('full', q >= 1); }
      return;
    }
    const v = Math.round(val);
    if (max !== sigMax && (mode === 'pips' || mode === 'icons')) {
      sigMax = max;
      const n = Math.min(8, max);
      if (mode === 'pips') sigPips.innerHTML = '<i></i>'.repeat(n);
      else sigIcons.innerHTML = '<i><svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.2"/><path d="M6 1v2M6 9v2M1 6h2M9 6h2"/></svg></i>'.repeat(n);
      sigVal = -1;
    }
    if (v === sigVal) return;
    sigVal = v;
    if (mode === 'orbs') { for (let i = 0; i < sigOrbs.length; i++) sigOrbs[i].classList.toggle('on', i < v); sig.classList.toggle('full', v >= sigOrbs.length); }
    else if (mode === 'pips') { const c = sigPips.children; for (let i = 0; i < c.length; i++) c[i].classList.toggle('on', i < v); sig.classList.toggle('full', v >= max); }
    else if (mode === 'icons') { const c = sigIcons.children; for (let i = 0; i < c.length; i++) c[i].classList.toggle('on', i < v); }
    else if (mode === 'count') { sigCount.textContent = v > 0 ? `×${v}` : '—'; sig.classList.toggle('full', v >= max); }
    ui.anim?.(sig, 'tick');
  }

  const api = {
    el: root,
    slots,
    /** Number of rendered slot elements (9 in v3). */
    slotCount: () => slotList.length,
    update(hs, dt, full) {
      if (!full) return;
      const att = hs.attuned || hs.element || '';
      if (att !== lastAtt) {
        lastAtt = att;
        root.style.setProperty('--el', elCss(att));
        const e = (hs.elements || []).find((x) => x.id === att);
        attNameB.textContent = e?.name || '';
        ui.anim?.(attName, 'pop');
      }
      updateGems(hs);
      updateSignature(hs);
      const res = hs.resource || 'mp';
      if (res !== resKind) { resKind = res; root.dataset.res = res; }
      const rv = hs.resourceValue ?? 999;
      const arr = hs.slots || [];
      for (let i = 0; i < arr.length; i++) {
        const d = arr[i];
        const s = slots[d.slot]; if (!s) continue;
        const empty = !d.id;
        if (empty !== s._empty) { s._empty = empty; s.root.classList.toggle('empty', empty); }
        const el = d.element || att;
        const nsig = (d.id || '') + '|' + el + '|' + (d.awakened ? 1 : 0) + (d.locked ? 1 : 0);
        if (s._sig !== nsig) {
          s._sig = nsig;
          s.ico.innerHTML = empty ? (d.slot === 'basic' || d.slot === 'charged' ? iconFor(d, el) : '') : iconFor(d, el);
          s.root.style.setProperty('--sc', elCss(el));
          s.name.textContent = d.name || (empty ? '' : KIND_KO[d.kind] || '');
          s.root.classList.toggle('awakened', !!d.awakened);
          s.root.classList.toggle('locked', !!d.locked && !empty);
          s._cd = -1; s._cost = '';
          if (!empty) ui.anim?.(s.root, 'swap');
        }
        let cost = '', ck = '';
        if (d.slot === 'fin') { cost = `${Math.floor(hs.awakening?.value ?? 0)}%`; ck = 'awk'; }
        else if (d.cost > 0) { cost = String(d.cost); ck = res; }
        else if (d.cooldown > 0) { cost = `${Math.round(d.cooldown)}초`; ck = 'cd'; }
        const kk = ck + cost;
        if (kk !== s._cost) { s._cost = kk; s.cost.textContent = cost; s.costBox.dataset.k = ck; s.costBox.title = ck === res ? RES_KO[res] || '' : ''; }
        const frac = d.cooldown > 0 ? clamp(d.cooldownLeft / d.cooldown, 0, 1) : 0;
        const q = Math.round(frac * 120) / 120;
        if (q !== s._cd) { s._cd = q; s.cd.style.setProperty('--cd', (q * 360).toFixed(1) + 'deg'); s.cd.style.opacity = q > 0 ? '1' : '0'; }
        const txt = d.cooldownLeft > 0.95 ? String(Math.ceil(d.cooldownLeft)) : '';
        if (txt !== s._cdTxt) { s._cdTxt = txt; s.cdnum.textContent = txt; }
        const ch = d.charges || 0;
        if (ch !== s._ch) { s._ch = ch; s.ch.textContent = ch > 1 ? String(ch) : ''; }
        const low = d.slot !== 'fin' && !empty && d.cost > 0 && rv < d.cost;
        if (low !== s._low) { s._low = low; s.root.classList.toggle('nomp', low); }
        const ready = !!d.ready;
        if (ready !== s._ready) { if (ready && s._ready === false && !low) ui.anim?.(s.root, 'readyflash'); s._ready = ready; }
      }
      slots.charged?.root.classList.toggle('charging', !!hs.charging);
      // awakening gauge around R
      const aw = hs.awakening;
      const fin = slots.fin;
      if (fin) {
        const en = !!aw?.enabled;
        fin.root.classList.toggle('dormant', !en);
        if (en) {
          const qv = Math.round(clamp(aw.value || 0, 0, 100) * 2) / 2;
          if (qv !== lastAwk) { lastAwk = qv; fin.awkFg?.setAttribute('stroke-dashoffset', (AWK_C * (1 - qv / 100)).toFixed(2)); }
        }
        const r = en && !!aw.ready && !game.spells?.finisherActive;
        if (r !== finReady) { finReady = r; fin.root.classList.toggle('full', r); finPrompt.classList.toggle('on', r); }
      }
      const g = !!hs.gift?.ready;
      if (g !== giftOn) { giftOn = g; gift.classList.toggle('on', g); if (g) { gift.style.setProperty('--ec', elCss(hs.gift.element || 'light')); ui.anim?.(gift, 'pop'); } }
    },
    finisherStarted() { finPrompt.classList.remove('on'); },
  };
  return api;
}
