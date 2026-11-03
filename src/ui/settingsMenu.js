// 설정 menu: graphics / controls / sound, wired to game.settings (set / applyPreset / reset).
// Built once; values re-synced when opened and on settingsChanged while open (cheap, no per-frame work).

const PRESET_LABEL = { low: '낮음', medium: '중간', high: '높음', custom: '사용자 정의' };
const SQ_LABEL = { low: '낮음', medium: '중간', high: '높음' };

// type: 'range' {min,max,step,fmt,commit:'input'|'change'} | 'toggle' | 'seg' {opts}
const pct = (v) => Math.round(v * 100) + '%';
const GRAPHICS = [
  { k: 'grassDensity', label: '풀 밀도', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct, commit: 'change', desc: '낮출수록 성능 향상' },
  { k: 'shadows', label: '그림자', type: 'toggle' },
  { k: 'shadowQuality', label: '그림자 품질', type: 'seg', opts: ['low', 'medium', 'high'], names: SQ_LABEL },
  { k: 'renderScale', label: '해상도 배율', type: 'range', min: 0.5, max: 1, step: 0.05, fmt: pct, commit: 'change' },
  { k: 'bloom', label: '블룸 (빛 번짐)', type: 'toggle' },
  { k: 'drawDistance', label: '시야 거리', type: 'range', min: 0.3, max: 1, step: 0.05, fmt: pct, commit: 'change' },
  { k: 'particleScale', label: '파티클 양', type: 'range', min: 0.2, max: 1, step: 0.05, fmt: pct, commit: 'input' },
  { k: 'effectQuality', label: '효과 품질', type: 'seg', opts: ['low', 'medium', 'high'], names: SQ_LABEL, desc: '원소 효과·반응 연출의 양' },
];
// v3 (CONTRACT §18/§19): difficulty names come from game.settings.DIFFICULTY[id].nameKo when present
const DIFF_FALLBACK = { easy: '쉬움', normal: '보통', hard: '어려움' };
const GAMEPLAY = [
  { k: 'difficulty', label: '난이도', type: 'seg', opts: ['easy', 'normal', 'hard'], names: DIFF_FALLBACK, desc: '적의 체력·피해량과 예고 시간' },
  { k: 'screenShake', label: '화면 흔들림', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct, commit: 'input' },
  { k: 'damageNumbers', label: '피해 숫자 표시', type: 'toggle' },
];
const CONTROLS = [
  { k: 'mouseSens', label: '마우스 감도', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: (v) => '×' + v.toFixed(2), commit: 'input' },
  { k: 'invertY', label: 'Y축 반전', type: 'toggle' },
  { k: 'showFps', label: 'FPS 표시', type: 'toggle' },
];
const SOUND = [
  { k: 'volMaster', label: '전체 볼륨', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct, commit: 'input' },
  { k: 'volMusic', label: '음악', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct, commit: 'input' },
  { k: 'volSfx', label: '효과음', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct, commit: 'input' },
];

function rowHTML(o) {
  let ctl = '';
  if (o.type === 'range') {
    ctl = `<input type="range" class="aw-range" data-k="${o.k}" min="${o.min}" max="${o.max}" step="${o.step}"><output class="aw-set-val" data-v="${o.k}"></output>`;
  } else if (o.type === 'toggle') {
    ctl = `<button class="aw-toggle" data-k="${o.k}" data-t="toggle"><i></i><span class="on">켜짐</span><span class="off">꺼짐</span></button>`;
  } else if (o.type === 'seg') {
    ctl = `<div class="aw-seg" data-k="${o.k}">${o.opts.map((x) => `<button data-k="${o.k}" data-seg="${x}">${o.names[x]}</button>`).join('')}</div>`;
  }
  return `<div class="aw-set-row" data-row="${o.k}"><label>${o.label}${o.desc ? `<small>${o.desc}</small>` : ''}</label><div class="aw-set-ctl">${ctl}</div></div>`;
}

export function createSettingsMenu(game, parent, { onClose } = {}) {
  const S = game.settings;
  const DF = S?.DIFFICULTY;
  if (DF) for (const id of Object.keys(DIFF_FALLBACK)) if (DF[id]?.nameKo) DIFF_FALLBACK[id] = DF[id].nameKo;
  const el = document.createElement('div');
  el.className = 'aw-screen aw-modal aw-settings';
  el.innerHTML = `
    <div class="aw-panel aw-set-panel">
      <div class="aw-panel-title"><span>설정</span></div>
      <div class="aw-set-cols">
        <section class="aw-set-col">
          <h3>그래픽</h3>
          <div class="aw-set-row aw-set-preset"><label>품질 프리셋</label><div class="aw-set-ctl">
            <div class="aw-seg aw-seg-preset">
              <button data-preset="low">낮음</button><button data-preset="medium">중간</button><button data-preset="high">높음</button>
              <span class="aw-seg-custom">사용자 정의</span>
            </div></div></div>
          ${GRAPHICS.map(rowHTML).join('')}
        </section>
        <section class="aw-set-col">
          <h3>게임플레이</h3>
          ${GAMEPLAY.map(rowHTML).join('')}
          <h3>조작 · 표시</h3>
          ${CONTROLS.map(rowHTML).join('')}
          <h3>소리</h3>
          ${SOUND.map(rowHTML).join('')}
          <div class="aw-set-note">설정은 자동으로 저장됩니다</div>
        </section>
      </div>
      <div class="aw-menu aw-menu-row">
        <button class="aw-btn aw-btn-small" data-sact="reset">기본값 복원</button>
        <button class="aw-btn aw-btn-primary" data-sact="close">닫기</button>
      </div>
    </div>`;
  parent.appendChild(el);

  const ALL = [...GRAPHICS, ...GAMEPLAY, ...CONTROLS, ...SOUND];
  const byKey = Object.fromEntries(ALL.map((o) => [o.k, o]));
  const ranges = {}, outs = {}, toggles = {}, segs = {};
  el.querySelectorAll('input.aw-range').forEach((n) => { ranges[n.dataset.k] = n; });
  el.querySelectorAll('output[data-v]').forEach((n) => { outs[n.dataset.v] = n; });
  el.querySelectorAll('.aw-toggle').forEach((n) => { toggles[n.dataset.k] = n; });
  el.querySelectorAll('.aw-seg[data-k]').forEach((n) => { segs[n.dataset.k] = [...n.querySelectorAll('button')]; });
  const presetBtns = [...el.querySelectorAll('[data-preset]')];
  const presetBox = el.querySelector('.aw-seg-preset');

  const val = (k) => S?.values?.[k];
  const fillPct = (n) => { const f = (n.value - n.min) / (n.max - n.min || 1); n.style.setProperty('--f', (f * 100).toFixed(1) + '%'); };

  function syncPreset() {
    const q = val('quality') || 'custom';
    for (const b of presetBtns) b.classList.toggle('sel', b.dataset.preset === q);
    presetBox.classList.toggle('custom', !PRESET_LABEL[q] || q === 'custom');
  }
  function syncKey(k) {
    const o = byKey[k]; if (!o) return;
    const v = val(k);
    if (o.type === 'range') {
      const n = ranges[k];
      if (el.dataset.dragging !== k && v != null) n.value = v;
      fillPct(n); outs[k].textContent = o.fmt(+n.value);
    } else if (o.type === 'toggle') toggles[k].classList.toggle('on', !!v);
    else if (o.type === 'seg') for (const b of segs[k]) b.classList.toggle('sel', b.dataset.seg === v);
  }
  function syncAll() { syncPreset(); for (const o of ALL) syncKey(o.k); }

  const set = (k, v) => { try { S?.set?.(k, v); } catch (err) { console.warn('[ui] settings.set', err); } syncPreset(); };

  el.addEventListener('input', (e) => {
    const n = e.target.closest('input.aw-range'); if (!n) return;
    const o = byKey[n.dataset.k];
    el.dataset.dragging = o.k;
    fillPct(n); outs[o.k].textContent = o.fmt(+n.value);
    if (o.commit === 'input') set(o.k, +n.value);
    else if (val('quality') !== 'custom' && S?.values) presetBox.classList.add('custom'); // preview: will switch to custom
  });
  el.addEventListener('change', (e) => {
    const n = e.target.closest('input.aw-range'); if (!n) return;
    el.dataset.dragging = '';
    set(n.dataset.k, +n.value);
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    game.audio?.play?.('ui_click');
    if (b.dataset.preset) { try { S?.applyPreset?.(b.dataset.preset); } catch (err) { console.warn('[ui] preset', err); } syncAll(); return; }
    if (b.dataset.t === 'toggle') { set(b.dataset.k, !val(b.dataset.k)); syncKey(b.dataset.k); return; }
    if (b.dataset.seg) { set(b.dataset.k, b.dataset.seg); syncKey(b.dataset.k); return; }
    if (b.dataset.sact === 'reset') { try { S?.reset?.(); } catch (_) { /* */ } syncAll(); return; }
    if (b.dataset.sact === 'close') api.close();
  });

  game.events.on('settingsChanged', () => { if (api.isOpen) syncAll(); });

  const api = {
    el,
    isOpen: false,
    open() { syncAll(); api.isOpen = true; el.classList.add('show'); },
    close() { if (!api.isOpen) return; api.isOpen = false; el.classList.remove('show'); onClose?.(); },
  };
  return api;
}
