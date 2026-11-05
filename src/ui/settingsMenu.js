// 설정 v4 (PLAN §6.8): tabs 보조 기능 / 접근성 / 게임 / 조작 / 그래픽 built from core SETTING_DEFS (exact Korean labels
// live in core settings, rule 6). Every key writes through game.settings.set (→ settingsChanged). Extras: difficulty
// row, volumes / mouse, key rebinding (dodge, dodgeAlt, defend) via game.input.keymap.rebind, the read-only
// 렌더 해상도 line, '재시작 후 적용' rows (msaa / shadow type / point lights), 성능 테스트 + result card with 복사.
import { SETTING_DEFS, SETTINGS_TEXT_KO, DIFFICULTY, DIFFICULTY_ORDER } from '../core/settings.js';
import { h, esc } from './dom.js';
import { SETTINGS_UI_KO } from './text.js';

const TABS = ['assist', 'access', 'game', 'controls', 'graphics'];
const pct = (v) => Math.round(v * 100) + '%';
const EXTRA = {
  assist: [{ key: 'difficulty', labelKo: SETTINGS_UI_KO.difficulty, values: DIFFICULTY_ORDER.map((id) => ({ v: id, labelKo: DIFFICULTY[id].nameKo })) }],
  game: [
    { key: 'volMaster', labelKo: SETTINGS_UI_KO.volMaster, range: [0, 1, 0.05], fmt: pct },
    { key: 'volMusic', labelKo: SETTINGS_UI_KO.volMusic, range: [0, 1, 0.05], fmt: pct },
    { key: 'volSfx', labelKo: SETTINGS_UI_KO.volSfx, range: [0, 1, 0.05], fmt: pct },
  ],
  controls: [
    { key: 'mouseSens', labelKo: SETTINGS_UI_KO.mouseSens, range: [0.2, 3, 0.05], fmt: (v) => '×' + (+v).toFixed(2) },
    { key: 'invertY', labelKo: SETTINGS_UI_KO.invertY, values: [{ v: false, labelKo: '끔' }, { v: true, labelKo: '켬' }] },
  ],
  graphicsAdv: [
    { key: 'msaa', labelKo: 'MSAA', reload: true, values: [{ v: 0, labelKo: '끔' }, { v: 4, labelKo: '4×' }] },
    { key: 'shadowType', labelKo: '그림자 방식', reload: true, values: [{ v: 'basic', labelKo: '기본' }, { v: 'pcf', labelKo: 'PCF' }, { v: 'pcfsoft', labelKo: '부드럽게' }] },
    { key: 'pointLights', labelKo: '점광원', reload: true, values: [{ v: false, labelKo: '끔' }, { v: true, labelKo: '켬' }] },
    { key: 'effectQuality', labelKo: '효과 품질', values: [{ v: 'low', labelKo: '낮음' }, { v: 'medium', labelKo: '보통' }, { v: 'high', labelKo: '높음' }] },
  ],
};
const REBIND = ['dodge', 'dodgeAlt', 'defend'];
const SHOWN_BINDS = ['jump', 'sprint', 'interact', 'skills', 'codex', 'confirm'];

export function createSettingsMenu(game, parent, { onClose, confirm, toast } = {}) {
  const S = game.settings;
  const T = SETTINGS_TEXT_KO;
  const defs = [];
  const rowHTML = (d) => {
    defs.push(d);
    let ctl;
    if (d.range) ctl = `<input type="range" class="aw-range" data-k="${d.key}" min="${d.range[0]}" max="${d.range[1]}" step="${d.range[2]}"><output class="aw-set-val" data-v="${d.key}"></output>`;
    else ctl = `<div class="aw-seg" data-k="${d.key}">${d.values.map((o, i) => `<button data-k="${d.key}" data-i="${i}" data-seg="${esc(String(o.v))}">${esc(o.labelKo)}</button>`).join('')}</div>`;
    const note = d.reload ? `<small>${T.reloadNote}</small>` : d.key === 'difficulty' ? '<small class="aw-diff-desc"></small>' : '';
    return `<div class="aw-set-row" data-row="${d.key}"><label>${esc(d.labelKo)}${note}</label><div class="aw-set-ctl">${ctl}</div></div>`;
  };
  const tabRows = (tab) => (EXTRA[tab] || []).map(rowHTML).join('') + SETTING_DEFS.filter((d) => d.tab === tab && !d.keymap).map(rowHTML).join('');
  const km = () => game.input?.keymap;
  const nameOf = (a) => km()?.NAMES_KO?.[a] || a;
  const bindRows = () => REBIND.map((a) => `<div class="aw-set-row" data-row="bind:${a}"><label>${esc(nameOf(a))}</label><div class="aw-set-ctl"><kbd class="aw-bind" data-bind="${a}"></kbd><button class="aw-btn aw-btn-small" data-rebind="${a}">${SETTINGS_UI_KO.rebind}</button></div></div>`).join('')
    + SHOWN_BINDS.map((a) => `<div class="aw-set-row ro" data-row="bind:${a}"><label>${esc(nameOf(a))}</label><div class="aw-set-ctl"><kbd class="aw-bind" data-bind="${a}"></kbd></div></div>`).join('');
  const keybindLabel = SETTING_DEFS.find((d) => d.keymap)?.labelKo || '';

  const el = parent.appendChild(h('div', 'aw-screen aw-modal aw-settings', `
    <div class="aw-panel aw-set-panel">
      <div class="aw-panel-title"><span>${SETTINGS_UI_KO.title}</span></div>
      <div class="aw-set-tabs">${TABS.map((t, i) => `<button data-tab="${t}" class="${i ? '' : 'sel'}">${T.tabs[t]}</button>`).join('')}</div>
      <div class="aw-set-pages">
        <section class="aw-set-page on" data-page="assist">${tabRows('assist')}</section>
        <section class="aw-set-page" data-page="access">${tabRows('access')}</section>
        <section class="aw-set-page" data-page="game">${tabRows('game')}</section>
        <section class="aw-set-page" data-page="controls"><h4 data-row="keybinds">${esc(keybindLabel)}</h4>${bindRows()}${tabRows('controls')}</section>
        <section class="aw-set-page" data-page="graphics">${tabRows('graphics')}
          <div class="aw-set-row ro" data-row="renderRes"><label>${T.renderRes}</label><div class="aw-set-ctl"><output class="aw-set-res"></output></div></div>
          <div class="aw-set-row" data-row="benchmark"><label>${T.benchmark}</label><div class="aw-set-ctl"><button class="aw-btn aw-btn-small" data-sact="bench">${T.benchmark}</button></div></div>
          <details class="aw-set-adv"><summary>${SETTINGS_UI_KO.advanced}</summary>${EXTRA.graphicsAdv.map(rowHTML).join('')}</details>
        </section>
      </div>
      <div class="aw-set-note">${SETTINGS_UI_KO.saved}</div>
      <div class="aw-menu aw-menu-row">
        <button class="aw-btn aw-btn-small" data-sact="reset">${SETTINGS_UI_KO.reset}</button>
        <button class="aw-btn aw-btn-primary" data-sact="close">${SETTINGS_UI_KO.close}</button>
      </div>
    </div>`));
  // benchmark result card (outside the modal so it stays visible after the run)
  const bench = parent.appendChild(h('div', 'aw-bench', `<div class="aw-bench-title">${SETTINGS_UI_KO.benchTitle}</div><pre class="aw-bench-txt"></pre><div class="aw-menu aw-menu-row"><button class="aw-btn aw-btn-small" data-b="copy">${T.copy}</button><button class="aw-btn aw-btn-small" data-b="close">${SETTINGS_UI_KO.close}</button></div>`));
  const benchTxt = bench.querySelector('.aw-bench-txt');
  const byKey = Object.fromEntries(defs.map((d) => [d.key, d]));
  const val = (k) => S?.values?.[k];
  const fillPct = (n) => { const f = (n.value - n.min) / (n.max - n.min || 1); n.style.setProperty('--f', (f * 100).toFixed(1) + '%'); };
  const resEl = el.querySelector('.aw-set-res'), diffDesc = el.querySelector('.aw-diff-desc');

  function syncKey(k) {
    const d = byKey[k]; if (!d) return;
    const v = val(k);
    if (d.range) {
      const n = el.querySelector(`input[data-k="${k}"]`);
      if (el.dataset.dragging !== k && v != null) n.value = v;
      fillPct(n); el.querySelector(`output[data-v="${k}"]`).textContent = (d.fmt || pct)(+n.value);
    } else {
      for (const b of el.querySelectorAll(`.aw-seg[data-k="${k}"] button`)) b.classList.toggle('sel', d.values[+b.dataset.i].v === v);
    }
    if (k === 'difficulty' && diffDesc) diffDesc.textContent = DIFFICULTY[v]?.descKo || '';
  }
  function syncBinds() { for (const k of el.querySelectorAll('[data-bind]')) { let l = ''; try { l = km()?.label?.(k.dataset.bind) || ''; } catch (_) { l = ''; } k.textContent = l || '—'; } }
  function syncRes() { try { const r = game.quality?.renderSize?.(); resEl.textContent = r && r.w ? `${r.w}×${r.h}` : '—'; } catch (_) { resEl.textContent = '—'; } }
  function syncAll() { for (const d of defs) syncKey(d.key); syncBinds(); syncRes(); }
  const set = (k, v) => { try { if (k === 'quality' && S?.applyPreset) S.applyPreset(v); else S?.set?.(k, v); } catch (err) { console.warn('[ui] settings.set', k, err); } syncKey(k); };

  el.addEventListener('input', (e) => {
    const n = e.target.closest('input.aw-range'); if (!n) return;
    const d = byKey[n.dataset.k];
    el.dataset.dragging = d.key; fillPct(n);
    el.querySelector(`output[data-v="${d.key}"]`).textContent = (d.fmt || pct)(+n.value);
    set(d.key, +n.value);
  });
  el.addEventListener('change', (e) => { const n = e.target.closest('input.aw-range'); if (n) el.dataset.dragging = ''; });

  let waiting = null;
  function startRebind(action, btn) {
    waiting = action; btn.textContent = SETTINGS_UI_KO.rebindWait;
    const done = (code) => {
      removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onMouse, true);
      waiting = null; btn.textContent = SETTINGS_UI_KO.rebind;
      if (code && code !== 'Escape') { try { km()?.rebind?.(action, code); } catch (err) { console.warn('[ui] rebind', err); } }
      syncBinds();
    };
    const onKey = (ev) => { ev.preventDefault(); ev.stopPropagation(); done(ev.code); };
    const onMouse = (ev) => { if (ev.target === btn) return; ev.preventDefault(); ev.stopPropagation(); done('Mouse' + ev.button); };
    addEventListener('keydown', onKey, true); addEventListener('mousedown', onMouse, true);
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    game.audio?.play?.('ui_click');
    if (b.dataset.tab) { api.tab(b.dataset.tab); return; }
    if (b.dataset.rebind) { if (!waiting) startRebind(b.dataset.rebind, b); return; }
    if (b.dataset.i != null && b.dataset.k) { set(b.dataset.k, byKey[b.dataset.k].values[+b.dataset.i].v); return; }
    if (b.dataset.sact === 'reset') { try { S?.reset?.(); } catch (_) { /* */ } syncAll(); return; }
    if (b.dataset.sact === 'close') { api.close(); return; }
    if (b.dataset.sact === 'bench') (confirm || ((t, y) => y()))(T.benchmarkConfirm, () => api.runBenchmark(20));
  });
  bench.addEventListener('click', (e) => {
    const b = e.target.closest('[data-b]'); if (!b) return;
    if (b.dataset.b === 'close') { bench.classList.remove('show'); return; }
    const txt = benchTxt.textContent;
    const ok = () => toast?.(SETTINGS_UI_KO.copied, { duration: 2 });
    try { navigator.clipboard.writeText(txt).then(ok, () => { fallbackCopy(txt); ok(); }); } catch (_) { fallbackCopy(txt); ok(); }
  });
  function fallbackCopy(txt) { try { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } catch (_) { /* */ } }

  game.events.on('settingsChanged', () => { if (api.isOpen) syncAll(); });

  function benchLine(r) {
    const gpuPart = r.gpuMs != null ? ` · GPU ${(+r.gpuMs).toFixed(1)} ms` : '';
    return T.benchLine.replace('{avg}', Math.round(r.avgFps)).replace('{low}', Math.round(r.low1Fps)).replace('{level}', r.level ?? 0)
      .replace('{w}', r.renderW ?? '?').replace('{h}', r.renderH ?? '?').replace('{cpu}', (+r.cpuMs || 0).toFixed(1)).replace('{gpuPart}', gpuPart)
      .replace('{gpu}', r.gpu || '?').replace('{tier}', r.tier || '?');
  }
  const api = {
    el, bench,
    isOpen: false,
    benchRunning: false,
    lastBench: null,
    /** every key the menu writes (test introspection) */
    keys: () => defs.map((d) => d.key).concat(['keybinds']),
    tab(t) {
      for (const x of el.querySelectorAll('[data-tab]')) x.classList.toggle('sel', x.dataset.tab === t);
      for (const p of el.querySelectorAll('.aw-set-page')) p.classList.toggle('on', p.dataset.page === t);
      if (t === 'graphics') syncRes();
    },
    open(tab) { syncAll(); api.isOpen = true; el.classList.add('show'); if (tab) api.tab(tab); },
    close() { if (!api.isOpen) return; api.isOpen = false; el.classList.remove('show'); onClose?.(); },
    /** 성능 테스트 (§2.8): close the menu, resume, run game.quality.benchmark, show the result card with 복사. */
    async runBenchmark(seconds = 20) {
      const Q = game.quality;
      if (!Q?.benchmark || api.benchRunning) return null;
      api.close();
      if (game.state === 'paused') game.resume?.();
      api.benchRunning = true;
      benchTxt.textContent = SETTINGS_UI_KO.benchRun.replace('{s}', seconds); bench.classList.add('show', 'run');
      let r = null;
      try { r = await Q.benchmark({ seconds }); } catch (err) { console.warn('[ui] benchmark', err); }
      api.benchRunning = false; bench.classList.remove('run');
      if (!r) { bench.classList.remove('show'); return null; }
      api.lastBench = r;
      benchTxt.textContent = benchLine(r);
      return r;
    },
    benchText: () => benchTxt.textContent,
  };
  return api;
}
