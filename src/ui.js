// UI module: DOM overlay inside #ui — title, settings, HUD (class-aware hotbar, awakening gauge, defense),
// quest tracker, compass, damage numbers, banners, enemy bars, boss bar, grimoire, pause / death / victory, toasts.
// Performance: no layout reads in the loop; DOM writes only on change; skill/defense panels at 20 Hz,
// objective/markers at 4 Hz; animations restarted through a frame-delayed class queue (no forced reflow).
import * as THREE from 'three';
import { ELEMENTS, ELEMENT_NAMES_KO, clamp } from './core/utils.js';
import {
  ELEMENT_CSS, elementSVG, spellSVG, RETICLE_SVG, STATUS_COLORS, STATUS_NAMES, MARKER_SVG,
  LOCK_SVG, SHIELD_SVG, DASH_SVG, STAMINA_SVG,
} from './ui/icons.js';
import { createSettingsMenu } from './ui/settingsMenu.js';

const STATUS_KEYS = ['burning', 'frozen', 'wet', 'shocked', 'chilled', 'airborne', 'stunned'];
const KIND_ORDER = ['basic', 'heavy', 'support', 'ultimate', 'finisher'];
const KIND_KEY = { basic: 'LMB', heavy: 'RMB', ultimate: 'F', support: 'G', finisher: 'R' };
const KEY_LABEL = { LMB: '좌클릭', RMB: '우클릭', F: 'F', G: 'G', R: 'R' };
const KIND_LABEL = { basic: '기본', heavy: '충전', ultimate: '궁극', support: '보조', finisher: '필살' };
const COMBO_WINDOW = 2.5;
const DMG_POOL = 56, BAR_POOL = 12, MARK_POOL = 10, PIP_POOL = 4;
const SKILL_HZ = 1 / 20, OBJ_HZ = 1 / 4;
const AWK_R = 44, AWK_C = 2 * Math.PI * AWK_R;

function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const fmtTime = (s) => {
  s = Math.max(0, Math.round(s || 0));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}분 ${String(r).padStart(2, '0')}초`;
};
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// wraps key names in keycap spans
function formatKeys(text) {
  return esc(text)
    .replace(/\b(WASD|Shift|Space|Tab|Esc|Q|E|F|R|G|M|1~5)\b/g, '<kbd>$1</kbd>')
    .replace(/(좌클릭|우클릭|휠)/g, '<kbd>$1</kbd>');
}

// --------------------------------------------------------------- controls (key map) panel
const CONTROLS_HTML = `
  <div class="aw-ctl-cols">
    <div class="aw-ctl-grid">
      <div class="aw-ctl-h">이동</div>
      <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><span>이동</span>
      <div><kbd>Shift</kbd></div><span>달리기 (기력 소모)</span>
      <div><kbd>Space</kbd></div><span>점프 · 공중에서 꾹 눌러 활공</span>
      <div><kbd>Q</kbd></div><span>대시 — 마법사: 순간이동 · 검사: 질풍보</span>
      <div><kbd>E</kbd> 길게</div><span>방어 — 타이밍 맞춰 누르면 간파 · 반사</span>
      <div class="aw-ctl-h">메뉴</div>
      <div><kbd>Tab</kbd></div><span>마법서 (원소 반응 도감)</span>
      <div><kbd>Esc</kbd></div><span>일시정지 · 메뉴</span>
      <div><kbd>M</kbd></div><span>음소거</span>
    </div>
    <div class="aw-ctl-grid">
      <div class="aw-ctl-h">전투</div>
      <div><kbd>좌클릭</kbd></div><span>기본 공격 (검사: 4연속 베기)</span>
      <div><kbd>우클릭</kbd> 길게</div><span>충전 기술 — 놓으면 발동</span>
      <div><kbd>F</kbd></div><span>궁극기 · NPC 곁에서는 대화</span>
      <div><kbd>R</kbd></div><span>필살기 — 각성 게이지 충전 시 <em>(대가)</em></span>
      <div><kbd>G</kbd></div><span>보조 스킬 <em>(대가)</em></span>
      <div><kbd>1</kbd>~<kbd>5</kbd> · <kbd>휠</kbd></div><span>원소 전환 (해금된 원소만)</span>
      <div class="aw-ctl-h">비법</div>
      <div><kbd>Q</kbd> 직전</div><span>공격 직전 회피 → 완벽 회피 · 반격</span>
      <div><kbd>E</kbd> 직전</div><span>공격 직전 방어 → 간파 (적 경직)</span>
    </div>
  </div>
  <div class="aw-ctl-tip">원소를 겹쳐 맞히면 반응이 일어납니다 — 젖은 적에게 번개! 불타는 풀 위에서 활공하면 상승 기류를 타고 날아오릅니다.</div>`;

// tutorial toasts per class (shown after the path is chosen, once gameplay resumes)
const CLASS_TUT = {
  mage: [
    '좌클릭: 기본 마법 · 우클릭 길게: 충전 마법 · F: 궁극 마법',
    'Q: 순간이동 · E 길게: 마력 방벽 — 맞기 직전에 펼치면 투사체를 반사합니다',
  ],
  sword: [
    '좌클릭: 4연속 베기 · 우클릭 길게: 충전 베기 · F: 궁극기',
    'Q: 질풍보 (2회 충전) · E 길게: 검 막기 — 타이밍을 맞추면 간파!',
    '공격이 닿기 직전에 Q로 피하면 완벽 회피 — 이어지는 공격은 반격이 됩니다',
  ],
  all: ['1~5 / 휠: 원소 전환 — 원소를 엮어 반응을 일으키세요! Tab: 마법서'],
  master: ['G: 보조 스킬 · 적에게 피해를 주어 각성 게이지를 채우면 R: 필살기!'],
};

export function createUI(game) {
  const root = document.getElementById('ui') || document.body.appendChild(h('div'));
  root.classList.add('aw-root');
  const camera = game.camera;
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  let W = innerWidth, H = innerHeight;
  addEventListener('resize', () => { W = innerWidth; H = innerHeight; });
  const prog = () => game.progression;
  const raw = () => game.input?.raw || game.input;

  // ------------------------------------------------------------------ animation restart queue
  // remove the class now, re-add it ≥ 2 frames later (after a style pass) → no forced reflow.
  const aqNode = [], aqCls = [], aqF = [];
  let frameNo = 0;
  function restartAnim(node, cls) {
    node.classList.remove(cls);
    for (let i = 0; i < aqNode.length; i++) if (aqNode[i] === node && aqCls[i] === cls) { aqF[i] = frameNo; return; }
    aqNode.push(node); aqCls.push(cls); aqF.push(frameNo);
  }
  function flushAnims() {
    for (let i = aqNode.length - 1; i >= 0; i--) {
      if (frameNo - aqF[i] < 2) continue;
      aqNode[i].classList.add(aqCls[i]);
      aqNode.splice(i, 1); aqCls.splice(i, 1); aqF.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ layers
  const hurtVig = root.appendChild(h('div', 'aw-vig aw-vig-hurt'));
  const lowVig = root.appendChild(h('div', 'aw-vig aw-vig-low'));
  const worldLayer = root.appendChild(h('div', 'aw-world'));     // enemy bars + damage numbers
  const hud = root.appendChild(h('div', 'aw-hud'));
  const fxLayer = root.appendChild(h('div', 'aw-fx'));           // banners, combo
  const toastBox = root.appendChild(h('div', 'aw-toasts'));
  const screens = root.appendChild(h('div', 'aw-screens'));
  const fpsEl = root.appendChild(h('div', 'aw-fps'));

  // ------------------------------------------------------------------ HUD: vitals + defense
  const barHTML = '<div class="aw-bar"><div class="aw-bar-lag"></div><div class="aw-bar-fill"></div><div class="aw-bar-gloss"></div><div class="aw-bar-ticks"></div></div>';
  const vitals = hud.appendChild(h('div', 'aw-vitals', `
    <div class="aw-vital aw-hp">
      <div class="aw-vital-ico"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 21s-7.5-4.6-9.4-9.6C1.2 7.7 3.6 4 7.2 4c2.1 0 3.6 1.2 4.8 2.8C13.2 5.2 14.7 4 16.8 4c3.6 0 6 3.7 4.6 7.4C19.5 16.4 12 21 12 21z" fill="#ff5d7a" stroke="#ffe0e6" stroke-width="1.2"/><path d="M6.5 8.2c.5-1.2 1.6-1.8 2.6-1.7" stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".8"/></svg></div>
      ${barHTML}<div class="aw-vital-num"><b>100</b><span>/100</span></div>
    </div>
    <div class="aw-vital aw-mp">
      <div class="aw-vital-ico"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2 19 12 12 22 5 12z" fill="#4fa0ff" stroke="#dff0ff" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 5.5 9 12h3" stroke="#fff" stroke-width="1.2" fill="none" opacity=".8"/></svg></div>
      ${barHTML}<div class="aw-vital-num"><b>100</b><span>/100</span></div>
    </div>
    <div class="aw-vital aw-st">
      <div class="aw-vital-ico">${STAMINA_SVG}</div>
      ${barHTML}<div class="aw-vital-num"><b>100</b><span>/100</span></div>
    </div>
    <div class="aw-def">
      <div class="aw-def-item aw-def-dash"><span class="aw-def-ico">${DASH_SVG}</span><kbd>Q</kbd><span class="aw-def-lbl">대시</span><span class="aw-def-pips"></span></div>
      <div class="aw-def-item aw-def-block"><span class="aw-def-ico">${SHIELD_SVG}</span><kbd>E</kbd><span class="aw-def-lbl">방어</span><span class="aw-def-state"></span></div>
    </div>`));
  function mkVital(sel) {
    const el = vitals.querySelector(sel);
    return { el, fill: el.querySelector('.aw-bar-fill'), lag: el.querySelector('.aw-bar-lag'), num: el.querySelector('b'), max: el.querySelector('span'), last: -1, lastMax: -1, lagV: 1 };
  }
  const vHp = mkVital('.aw-hp'), vMp = mkVital('.aw-mp'), vSt = mkVital('.aw-st');
  const defDash = vitals.querySelector('.aw-def-dash'), defBlock = vitals.querySelector('.aw-def-block');
  const defDashLbl = defDash.querySelector('.aw-def-lbl'), defBlockLbl = defBlock.querySelector('.aw-def-lbl');
  const defPipBox = defDash.querySelector('.aw-def-pips'), defBlockState = defBlock.querySelector('.aw-def-state');
  const pips = [];
  for (let i = 0; i < PIP_POOL; i++) {
    const p = defPipBox.appendChild(h('i', 'aw-dpip', '<b></b>'));
    pips.push({ el: p, fill: p.firstChild, on: null, shown: null, f: -1 });
  }

  // ------------------------------------------------------------------ HUD: crosshair, charge & stamina rings
  const CH_R = 23, CH_C = 2 * Math.PI * CH_R, ST_R = 15, ST_C = 2 * Math.PI * ST_R;
  const cross = hud.appendChild(h('div', 'aw-cross', `
    <div class="aw-reticle">${RETICLE_SVG}</div>
    <svg class="aw-charge" viewBox="0 0 64 64" width="64" height="64">
      <circle cx="32" cy="32" r="${CH_R}" class="aw-charge-bg"/>
      <circle cx="32" cy="32" r="${CH_R}" class="aw-charge-fg" stroke-dasharray="${CH_C}" stroke-dashoffset="${CH_C}"/>
    </svg>
    <div class="aw-hitmark"><svg viewBox="0 0 40 40" width="40" height="40"><path d="M10 10l6 6M30 10l-6 6M10 30l6-6M30 30l-6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></div>
    <svg class="aw-stam" viewBox="0 0 40 40" width="40" height="40">
      <circle cx="20" cy="20" r="${ST_R}" class="aw-stam-bg"/>
      <circle cx="20" cy="20" r="${ST_R}" class="aw-stam-fg" stroke-dasharray="${ST_C}" stroke-dashoffset="0"/>
    </svg>`));
  const reticle = cross.querySelector('.aw-reticle');
  const chargeSvg = cross.querySelector('.aw-charge'), chargeFg = cross.querySelector('.aw-charge-fg');
  const hitmark = cross.querySelector('.aw-hitmark');
  const stamSvg = cross.querySelector('.aw-stam'), stamFg = cross.querySelector('.aw-stam-fg');

  // ------------------------------------------------------------------ HUD: hotbar (class-aware)
  const hotbar = hud.appendChild(h('div', 'aw-hotbar'));
  const finPrompt = hotbar.appendChild(h('div', 'aw-fin-prompt', '<kbd>R</kbd><span>필살기</span>'));
  const slotRow = hotbar.appendChild(h('div', 'aw-slots'));
  const gemRow = hotbar.appendChild(h('div', 'aw-gems'));
  const elName = hotbar.appendChild(h('div', 'aw-elname'));
  const gems = ELEMENTS.map((el, i) => {
    const g = gemRow.appendChild(h('div', 'aw-gem', `<div class="aw-gem-face">${elementSVG(el, 26)}</div><div class="aw-gem-key">${i + 1}</div><div class="aw-gem-lock">${LOCK_SVG}</div>`));
    g.style.setProperty('--ec', ELEMENT_CSS[el]);
    return g;
  });
  let awkOrn = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2, x = 50 + Math.cos(a) * 49, y = 50 + Math.sin(a) * 49;
    awkOrn += i % 3 === 0 ? `<path d="M${x.toFixed(1)} ${(y - 3).toFixed(1)}l2.4 3-2.4 3-2.4-3z"/>` : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".9"/>`;
  }
  const slots = {};
  for (const kind of KIND_ORDER) {
    const awk = kind === 'finisher' ? `
        <svg class="aw-awk" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="${AWK_R}" class="aw-awk-bg"/>
          <circle cx="50" cy="50" r="${AWK_R}" class="aw-awk-fg" stroke-dasharray="${AWK_C.toFixed(2)}" stroke-dashoffset="${AWK_C.toFixed(2)}"/>
          <g class="aw-awk-orn">${awkOrn}</g>
        </svg>` : '';
    const s = slotRow.appendChild(h('div', `aw-slot aw-slot-${kind}`, `
      <div class="aw-slot-ring">${awk}<div class="aw-slot-ico"></div><div class="aw-slot-cd"></div><div class="aw-slot-cdnum"></div></div>
      <div class="aw-slot-key">${KEY_LABEL[KIND_KEY[kind]]}</div>
      <div class="aw-slot-name"></div>
      <div class="aw-slot-cost"><i></i><span></span></div>`));
    s.style.display = 'none';
    slots[kind] = {
      root: s, kind, ico: s.querySelector('.aw-slot-ico'), cd: s.querySelector('.aw-slot-cd'), cdnum: s.querySelector('.aw-slot-cdnum'),
      name: s.querySelector('.aw-slot-name'), costBox: s.querySelector('.aw-slot-cost'), cost: s.querySelector('.aw-slot-cost span'),
      key: s.querySelector('.aw-slot-key'), awkFg: s.querySelector('.aw-awk-fg'),
      shown: false, _sig: '', _cd: -1, _ready: null, _low: null, _cdTxt: '', _cost: null, _act: null,
    };
  }

  // ------------------------------------------------------------------ HUD: objective, compass, boss bar
  const objective = hud.appendChild(h('div', 'aw-objective', `
    <div class="aw-obj-head"><span class="aw-obj-diamond"></span><span class="aw-obj-title">목표</span></div>
    <div class="aw-obj-text"></div>
    <div class="aw-obj-prog"><div class="aw-obj-bar"><i></i></div><span></span></div>
    <div class="aw-obj-dist"></div>`));
  const objTitle = objective.querySelector('.aw-obj-title'), objText = objective.querySelector('.aw-obj-text');
  const objDist = objective.querySelector('.aw-obj-dist');
  let objDistTxt = '';
  const objProg = objective.querySelector('.aw-obj-prog'), objProgBar = objProg.querySelector('i'), objProgTxt = objProg.querySelector('span');

  const COMPASS_W = 520, PX_PER_DEG = COMPASS_W / 180;
  const compass = hud.appendChild(h('div', 'aw-compass', '<div class="aw-compass-strip"></div><div class="aw-compass-markers"></div><div class="aw-compass-needle"></div>'));
  const strip = compass.querySelector('.aw-compass-strip'), markerBox = compass.querySelector('.aw-compass-markers');
  {
    const CARD = { 0: '북', 90: '동', 180: '남', 270: '서', 45: '북동', 135: '남동', 225: '남서', 315: '북서' };
    let s = '';
    for (let d = -360; d <= 720; d += 15) {
      const n = ((d % 360) + 360) % 360, x = (d + 360) * PX_PER_DEG;
      if (CARD[n] && n % 90 === 0) s += `<span class="aw-cp-card${n === 0 ? ' north' : ''}" style="left:${x}px">${CARD[n]}</span>`;
      else if (CARD[n]) s += `<span class="aw-cp-mid" style="left:${x}px">${CARD[n]}</span>`;
      else s += `<i class="aw-cp-tick" style="left:${x}px"></i>`;
    }
    strip.innerHTML = s;
  }
  const markers = [];
  for (let i = 0; i < MARK_POOL; i++) {
    const m = markerBox.appendChild(h('div', 'aw-cmark', '<div class="aw-cmark-ico"></div><div class="aw-cmark-d"></div>'));
    m.style.display = 'none';
    markers.push({ el: m, ico: m.querySelector('.aw-cmark-ico'), d: m.querySelector('.aw-cmark-d'), kind: '', ref: null, pos: new THREE.Vector3(), label: '',
      on: false, vis: false, target: null, dim: null, _d: -1, _x: 0, _px: 0 });
  }
  const visMarks = [];

  const bossBar = hud.appendChild(h('div', 'aw-boss', `
    <div class="aw-boss-name"><span class="aw-boss-orn">❖</span><b></b><span class="aw-boss-orn">❖</span></div>
    <div class="aw-boss-bar"><div class="aw-bar-lag"></div><div class="aw-bar-fill"></div><div class="aw-bar-gloss"></div></div>
    <div class="aw-boss-pips"><i style="left:25%"></i><i style="left:50%"></i><i style="left:75%"></i></div>`));
  const bossName = bossBar.querySelector('b'), bossFill = bossBar.querySelector('.aw-bar-fill'), bossLag = bossBar.querySelector('.aw-bar-lag');

  // small hint under crosshair
  const hint = hud.appendChild(h('div', 'aw-hint'));

  // ------------------------------------------------------------------ banners, flashes & combo
  const banner = fxLayer.appendChild(h('div', 'aw-banner', '<div class="aw-banner-glow"></div><div class="aw-banner-text"></div><div class="aw-banner-sub"></div>'));
  const bannerText = banner.querySelector('.aw-banner-text'), bannerSub = banner.querySelector('.aw-banner-sub');
  const bigCard = fxLayer.appendChild(h('div', 'aw-card', '<div class="aw-card-line"></div><div class="aw-card-pre"></div><div class="aw-card-title"></div><div class="aw-card-sub"></div><div class="aw-card-line"></div>'));
  const cardPre = bigCard.querySelector('.aw-card-pre'), cardTitle = bigCard.querySelector('.aw-card-title'), cardSub = bigCard.querySelector('.aw-card-sub');
  const flashEl = fxLayer.appendChild(h('div', 'aw-flash', '<div class="aw-flash-rays"></div><div class="aw-flash-text"></div><div class="aw-flash-sub"></div>'));
  const flashText = flashEl.querySelector('.aw-flash-text'), flashSub = flashEl.querySelector('.aw-flash-sub');
  const edgeFlash = fxLayer.appendChild(h('div', 'aw-edge'));
  const combo = fxLayer.appendChild(h('div', 'aw-combo', '<div class="aw-combo-num">0</div><div class="aw-combo-lbl">COMBO</div><div class="aw-combo-timer"><i></i></div>'));
  const comboNum = combo.querySelector('.aw-combo-num'), comboTimer = combo.querySelector('.aw-combo-timer i');

  // small per-kind glyphs drawn over the element icon so the five slots read differently
  const KIND_GLYPH = {
    basic: '<svg viewBox="0 0 20 20"><path d="M3 15 Q9 3 17 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    heavy: '<svg viewBox="0 0 20 20"><path d="M4 12 L10 6 L16 12 M4 17 L10 11 L16 17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
    support: '<svg viewBox="0 0 20 20"><path d="M10 2 L17 5 V10 C17 14 14 17 10 18 C6 17 3 14 3 10 V5 Z" fill="currentColor"/></svg>',
    ultimate: '<svg viewBox="0 0 20 20"><path d="M10 1 L12.2 7.5 L19 7.6 L13.6 11.8 L15.6 18.5 L10 14.5 L4.4 18.5 L6.4 11.8 L1 7.6 L7.8 7.5 Z" fill="currentColor"/></svg>',
    finisher: '<svg viewBox="0 0 20 20"><path d="M2 16 L4 6 L8 10 L10 3 L12 10 L16 6 L18 16 Z" fill="currentColor"/></svg>',
  };
  // ------------------------------------------------------------------ damage number pool
  const nums = [];
  for (let i = 0; i < DMG_POOL; i++) {
    const e = worldLayer.appendChild(h('div', 'aw-num'));
    nums.push({ el: e, alive: false, pos: new THREE.Vector3(), age: 0, life: 1, ox: 0, sx: 0, oy: 0, spx: -1e4, spy: -1e4, vy: 0, scale: 1, hidden: true });
  }
  let numCursor = 0;
  const numScr = { x: 0, y: 0 };
  function spawnNumber(text, point, cls, color, opts = {}) {
    let n = null;
    for (let i = 0; i < DMG_POOL; i++) {
      const c = nums[(numCursor + i) % DMG_POOL];
      if (!c.alive) { n = c; numCursor = (numCursor + i + 1) % DMG_POOL; break; }
    }
    if (!n) { n = nums[numCursor]; numCursor = (numCursor + 1) % DMG_POOL; }
    n.alive = true; n.age = 0; n.life = opts.life ?? 1.0; n.scale = opts.scale ?? 1;
    n.ox = (Math.random() - 0.5) * (opts.spread ?? 40); n.vy = opts.vy ?? 1.4;
    n.sx = 0; n.oy = 0; n.spx = n.spy = -1e4;
    if (point) n.pos.copy(point);
    // de-clutter: numbers spawned close together on screen within 0.25 s stack upward & alternate sides
    if (point && project(point, numScr)) {
      let stack = 0;
      for (let i = 0; i < DMG_POOL; i++) {
        const o = nums[i];
        if (o === n || !o.alive || o.age > 0.25) continue;
        if (Math.abs(o.spx - numScr.x) < 48 && Math.abs(o.spy - numScr.y) < 48) stack++;
      }
      n.spx = numScr.x; n.spy = numScr.y;
      if (stack > 0) { n.oy = -26 * Math.min(stack, 6); n.sx = (stack % 2 ? 30 : -30); n.ox *= 0.3; }
    }
    n.el.className = 'aw-num ' + (cls || '');
    n.el.style.setProperty('--nc', color || '#fff');
    n.el.textContent = text;
  }

  // ------------------------------------------------------------------ enemy bar pool
  const bars = [];
  for (let i = 0; i < BAR_POOL; i++) {
    const e = worldLayer.appendChild(h('div', 'aw-ebar', `<div class="aw-ebar-name"></div><div class="aw-ebar-track"><div class="aw-bar-lag"></div><div class="aw-bar-fill"></div></div><div class="aw-ebar-pips">${STATUS_KEYS.map((k) => `<i class="aw-pip" style="--pc:${STATUS_COLORS[k]}" title="${STATUS_NAMES[k]}"></i>`).join('')}</div>`));
    e.style.display = 'none';
    bars.push({
      el: e, name: e.querySelector('.aw-ebar-name'), fill: e.querySelector('.aw-bar-fill'), lag: e.querySelector('.aw-bar-lag'),
      pips: [...e.querySelectorAll('.aw-pip')], ent: null, shown: false, lagV: 1, pipState: 0,
    });
  }
  const lastHit = new WeakMap(); // entity -> realTime of last damage
  const barLag = new WeakMap();

  // ------------------------------------------------------------------ toasts (+ queued tutorial toasts)
  function toast(text, opts = {}) {
    const dur = opts.duration ?? 4.5;
    const t = h('div', 'aw-toast ' + (opts.kind ? 'aw-toast-' + opts.kind : ''), `<span class="aw-toast-orn"></span><span class="aw-toast-text"></span>`);
    t.querySelector('.aw-toast-text').innerHTML = formatKeys(text);
    toastBox.appendChild(t);
    while (toastBox.children.length > 3) toastBox.firstChild.remove();
    setTimeout(() => t.classList.add('out'), dur * 1000);
    setTimeout(() => t.remove(), dur * 1000 + 600);
    return t;
  }
  const tutQ = []; let tutGap = 0;
  const tutSeen = new Set();
  function queueTut(text, delay = 0) {
    if (tutSeen.has(text)) return;
    tutSeen.add(text); tutQ.push({ text, delay });
  }

  let hintT = 0, hintCd = 0;
  function showHint(text, kind = '') {
    if (hintCd > 0) return;
    hint.textContent = text; hint.dataset.kind = kind; hintT = 1.6; hintCd = 0.9;
    restartAnim(hint, 'show');
  }

  // ------------------------------------------------------------------ banners / cards / flashes
  let bannerT = 0, lastBannerId = '', lastBannerTime = -9;
  function showBanner(text, sub, elements) {
    if (cardT > 0) return false; // the card owns the upper-centre slot
    const a = ELEMENT_CSS[elements?.[0]] || '#ffd27a', b = ELEMENT_CSS[elements?.[1]] || a;
    bannerText.textContent = text;
    bannerSub.textContent = sub || '';
    banner.style.setProperty('--bg', `linear-gradient(100deg, ${a} 0%, #fffbe8 48%, ${b} 100%)`);
    banner.style.setProperty('--g1', a);
    banner.style.setProperty('--g2', b);
    restartAnim(banner, 'show');
    bannerT = 1.6;
    return true;
  }
  let cardT = 0;
  const cardQ = [];
  function showCard(pre, title, sub, cls = '', dur = 3.2) {
    const busy = !!game.cinematic?.active || game.state === 'cutscene';
    if (cardT > 0.35 || busy) { if (cardQ.length < 4) cardQ.push([pre, title, sub, cls, dur]); return; }
    bigCard.className = 'aw-card ' + cls;
    bigCard.style.setProperty('--dur', dur + 's');
    cardPre.textContent = pre || '';
    cardTitle.textContent = title;
    cardSub.innerHTML = formatKeys(sub || '');
    banner.classList.remove('show'); bannerT = 0;
    restartAnim(bigCard, 'show');
    cardT = dur;
  }
  let flashT = 0, flashPrio = 0;
  function showFlash(text, sub, kind = '', dur = 1.0, prio = 1) {
    if (flashT > 0 && prio < flashPrio) return;
    flashPrio = prio;
    flashEl.className = 'aw-flash aw-flash-' + kind;
    flashText.textContent = text;
    flashSub.textContent = sub || '';
    restartAnim(flashEl, 'show');
    flashT = dur;
  }
  function edge(kind) { edgeFlash.className = 'aw-edge aw-edge-' + kind; restartAnim(edgeFlash, 'show'); }

  // ------------------------------------------------------------------ reactions
  const reactions = () => game.combat?.REACTIONS || [];
  const rxById = (id) => reactions().find((r) => r.id === id);
  const seenReactions = new Set();
  function onReaction(p, isCombo) {
    if (p.isPlayer || p.target?.team === 'player') return;
    const def = rxById(p.id);
    const name = p.name || def?.name || p.id;
    const els = p.elements?.length ? p.elements : def?.elements;
    const now = game.realTime;
    if (p.id === lastBannerId && now - lastBannerTime < 2.0) return;
    lastBannerId = p.id; lastBannerTime = now;
    showBanner(name + '!', isCombo ? '원소 융합' : '원소 반응', els);
    if (p.id && !seenReactions.has(p.id)) {
      seenReactions.add(p.id);
      const t = toast(`새로운 원소 반응 발견! — ${name}`, { duration: 4.2, kind: 'discover' });
      if (els) t.querySelector('.aw-toast-orn').innerHTML = els.map((e) => elementSVG(e, 16)).join('');
    }
  }

  // ------------------------------------------------------------------ combo
  let comboCount = 0, comboT = 0;
  function bumpCombo() {
    comboT = COMBO_WINDOW;
    comboCount++;
    if (comboCount >= 2) {
      comboNum.textContent = comboCount;
      combo.classList.add('on');
      combo.classList.toggle('hot', comboCount >= 10);
      combo.classList.toggle('blaze', comboCount >= 25);
      restartAnim(comboNum, 'pop');
    }
  }

  // ------------------------------------------------------------------ hitmarker
  let hitT = 0;
  function hitMarker(kill) {
    hitmark.classList.toggle('kill', !!kill);
    hitT = kill ? 0.32 : 0.16;
  }

  // ------------------------------------------------------------------ screens
  const title = screens.appendChild(h('div', 'aw-screen aw-title', `
    <div class="aw-title-vig"></div>
    <div class="aw-stars"></div>
    <div class="aw-title-center">
      <div class="aw-title-rune">
        <svg viewBox="0 0 200 200" width="520" height="520">
          <g fill="none" stroke="#f3d79a">
            <circle cx="100" cy="100" r="96" stroke-width=".5" opacity=".5"/>
            <circle cx="100" cy="100" r="90" stroke-width=".35" stroke-dasharray="1 2.4" opacity=".7"/>
            <circle cx="100" cy="100" r="70" stroke-width=".4" opacity=".35"/>
            <path d="M100 4 183 148H17z" stroke-width=".4" opacity=".35"/>
            <path d="M100 196 17 52h166z" stroke-width=".4" opacity=".35"/>
          </g>
          <g class="aw-rune-glyphs" fill="#f3d79a" opacity=".55" font-size="7" font-family="serif" text-anchor="middle">
            ${'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'.split('').map((c, i, a) => {
              const ang = (i / a.length) * Math.PI * 2;
              return `<text x="${(100 + Math.cos(ang) * 80).toFixed(1)}" y="${(102 + Math.sin(ang) * 80).toFixed(1)}" transform="rotate(${(ang * 180 / Math.PI + 90).toFixed(1)} ${(100 + Math.cos(ang) * 80).toFixed(1)} ${(100 + Math.sin(ang) * 80).toFixed(1)})">${c}</text>`;
            }).join('')}
          </g>
        </svg>
      </div>
      <div class="aw-title-gems">${ELEMENTS.map((e) => `<span style="--ec:${ELEMENT_CSS[e]}">${elementSVG(e, 22)}</span>`).join('')}</div>
      <h1 class="aw-logo"><span class="aw-logo-text" data-text="아케인 와일즈">아케인 와일즈</span></h1>
      <div class="aw-logo-sub"><i></i>ARCANE WILDS — 원소의 수호자<i></i></div>
      <div class="aw-menu">
        <button class="aw-btn aw-btn-primary" data-act="start">모험 시작</button>
        <button class="aw-btn" data-act="settings">설정</button>
        <button class="aw-btn" data-act="controls">조작법</button>
      </div>
      <div class="aw-title-foot">원소의 대륙 에테리아 — 손등에 떠오른 각인이 새로운 수호자를 부른다</div>
    </div>`));
  {
    const stars = title.querySelector('.aw-stars');
    let s = '';
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * 100, y = Math.random() * 100, d = 4 + Math.random() * 8, dl = -Math.random() * 10;
      const sz = 1 + Math.random() * 2.6, c = ['#fff3c8', '#bfe9ff', '#d9c4ff', '#c8ffe0'][i % 4];
      s += `<i style="left:${x}%;top:${y}%;width:${sz}px;height:${sz}px;background:${c};animation-duration:${d}s;animation-delay:${dl}s"></i>`;
    }
    stars.innerHTML = s;
  }

  const controls = screens.appendChild(h('div', 'aw-screen aw-modal aw-controls', `
    <div class="aw-panel aw-panel-wide">
      <div class="aw-panel-title"><span>조작법</span></div>
      ${CONTROLS_HTML}
      <div class="aw-menu aw-menu-row"><button class="aw-btn" data-act="closeControls">닫기</button></div>
    </div>`));

  const pause = screens.appendChild(h('div', 'aw-screen aw-modal aw-pause', `
    <div class="aw-panel">
      <div class="aw-panel-title"><span>일시정지</span></div>
      <div class="aw-pause-obj"></div>
      <div class="aw-menu">
        <button class="aw-btn aw-btn-primary" data-act="resume">계속하기</button>
        <button class="aw-btn" data-act="grimoire">마법서</button>
        <button class="aw-btn" data-act="settings">설정</button>
        <button class="aw-btn" data-act="controls">조작법</button>
        <button class="aw-btn aw-btn-danger" data-act="restart">처음부터 다시</button>
      </div>
    </div>`));

  const settingsMenu = createSettingsMenu(game, screens, { onClose: () => syncModalLock() });

  const death = screens.appendChild(h('div', 'aw-screen aw-death', `
    <div class="aw-death-inner">
      <div class="aw-death-title">쓰러졌다...</div>
      <div class="aw-death-sub">원소의 빛이 당신을 다시 일으켜 세웁니다</div>
      <div class="aw-death-count"></div>
      <div class="aw-menu aw-menu-row"><button class="aw-btn" data-act="respawn">다시 일어서기 <kbd>Space</kbd></button></div>
    </div>`));
  const deathCount = death.querySelector('.aw-death-count');

  const victory = screens.appendChild(h('div', 'aw-screen aw-victory', `
    <div class="aw-victory-rays"></div>
    <div class="aw-panel aw-victory-panel">
      <div class="aw-victory-pre">봉인의 수문장 정화</div>
      <div class="aw-victory-title">승리</div>
      <div class="aw-victory-sub">에테리아에 다시 평화가 찾아왔습니다</div>
      <div class="aw-stats"></div>
      <div class="aw-menu aw-menu-row"><button class="aw-btn aw-btn-primary" data-act="restart">새로운 모험</button></div>
    </div>`));
  const statsBox = victory.querySelector('.aw-stats');

  const grim = screens.appendChild(h('div', 'aw-screen aw-grimoire', `
    <div class="aw-book">
      <div class="aw-book-page aw-book-left">
        <div class="aw-book-title">원소 반응</div>
        <div class="aw-book-count"></div>
        <div class="aw-rx-list"></div>
      </div>
      <div class="aw-book-spine"></div>
      <div class="aw-book-page aw-book-right">
        <div class="aw-book-title aw-sp-title">주문 목록</div>
        <div class="aw-book-count aw-sp-count"></div>
        <div class="aw-spell-list"></div>
      </div>
      <div class="aw-book-foot"><kbd>Tab</kbd> 닫기</div>
    </div>`));

  function syncModalLock() {
    const sub = settingsMenu.isOpen || controls.classList.contains('show');
    const open = sub || grimOpen;
    // the pause panel steps aside while a sub-menu is open over it
    pause.classList.toggle('show', game.state === 'paused' && !grimOpen && !sub);
    try { if (open) game.input?.lock?.('menu'); else game.input?.unlock?.('menu'); } catch (_) { /* */ }
  }
  function openControls() { controls.classList.add('show'); syncModalLock(); }
  function closeControls() { controls.classList.remove('show'); syncModalLock(); }

  // button wiring
  screens.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    game.audio?.play?.('ui_click');
    const act = b.dataset.act;
    if (act === 'start') startGame();
    else if (act === 'controls') openControls();
    else if (act === 'closeControls') closeControls();
    else if (act === 'settings') { settingsMenu.open(); syncModalLock(); }
    else if (act === 'resume') { closeControls(); settingsMenu.close(); setGrimoire(false); game.resume(); }
    else if (act === 'restart') game.restart();
    else if (act === 'respawn') doRespawn();
    else if (act === 'grimoire') setGrimoire(!grimOpen);
  });
  screens.addEventListener('mouseover', (e) => {
    const b = e.target.closest('.aw-btn');
    if (b && b !== screens._hov) { screens._hov = b; game.audio?.play?.('ui_select', { volume: 0.4 }); }
  });

  function startGame(opts) {
    if (game.state !== 'title') return;
    closeControls(); settingsMenu.close();
    title.classList.add('leaving');
    try {
      if (game.newGame) game.newGame(opts); else game.start();
    } catch (err) { console.error('[ui] newGame', err); }
  }
  function doRespawn() {
    if (game.state !== 'dead' && game.player?.entity?.alive !== false) return;
    try { game.player?.respawn?.(); } catch (err) { console.warn('[ui] respawn', err); }
  }

  // ------------------------------------------------------------------ grimoire
  let grimOpen = false;
  function buildGrimoire() {
    const list = reactions(), disc = game.combat?.discovered || new Set();
    const known = (id) => disc.has?.(id) || seenReactions.has(id);
    const n = list.filter((r) => known(r.id)).length;
    grim.querySelector('.aw-book-left .aw-book-count').textContent = list.length ? `발견 ${n} / ${list.length}` : '아직 기록된 반응이 없습니다';
    const row = (r) => {
      const k = known(r.id);
      const icons = (r.elements || []).map((e) => elementSVG(e, 18)).join('<b class="aw-plus">+</b>');
      return `<div class="aw-rx ${k ? 'known' : 'unknown'}" style="--g1:${ELEMENT_CSS[r.elements?.[0]] || '#ccc'};--g2:${ELEMENT_CSS[r.elements?.[1]] || '#ccc'}">
        <div class="aw-rx-icons">${icons}</div>
        <div class="aw-rx-body"><div class="aw-rx-name">${k ? r.name : '???'}</div>
        <div class="aw-rx-desc">${k ? r.desc : (r.elements || []).map((e) => ELEMENT_NAMES_KO[e] || (e === 'water' ? '물' : e)).join(' + ') + ' — 미발견'}</div></div></div>`;
    };
    const basic = list.filter((r) => !r.fusion), fus = list.filter((r) => r.fusion);
    grim.querySelector('.aw-rx-list').innerHTML =
      basic.map(row).join('') + (fus.length ? `<div class="aw-rx-sec">마법 융합</div>${fus.map(row).join('')}` : '');

    const pr = prog();
    const isSword = pr?.cls === 'sword', master = !!pr?.isMaster?.();
    const unlocked = (el) => (pr?.chosen ? pr.isElementUnlocked?.(el) !== false : true);
    const order = { basic: 0, heavy: 1, ultimate: 2, support: 3, finisher: 4 };
    const spRow = (el, kind, name, desc, meta) => `<div class="aw-sp-row">${spellSVG(el, kind === 'finisher' || kind === 'support' ? 'ultimate' : kind, 30)}<div class="aw-sp-body"><div class="aw-sp-name">${esc(name)}</div><div class="aw-sp-meta"><em>${KIND_LABEL[kind] || ''} · ${KEY_LABEL[KIND_KEY[kind]] || ''}</em>${meta}</div><div class="aw-sp-desc">${esc(desc || '')}</div></div></div>`;
    let html = '';
    if (isSword) {
      grim.querySelector('.aw-sp-title').textContent = '검술 목록';
      let hs = null; try { hs = game.sword?.getHudState?.(); } catch (_) { /* */ }
      const el = hs?.element || pr?.element || 'fire';
      grim.querySelector('.aw-sp-count').textContent = master ? `${ELEMENT_NAMES_KO[el]}의 대가` : '원소를 바꾸면 검술도 바뀝니다';
      html += `<div class="aw-sp-el" style="--ec:${ELEMENT_CSS[el]}"><div class="aw-sp-head">${elementSVG(el, 18)}<span>${ELEMENT_NAMES_KO[el]} 검술</span></div><div class="aw-sp-grid">`;
      for (const s of hs?.slots || []) {
        const meta = s.staminaCost > 0 ? `<span class="aw-sp-st">기력 ${s.staminaCost}</span>` : s.cooldown > 0 ? `<span class="aw-sp-mp">${Math.round(s.cooldown)}초</span>` : '';
        html += spRow(el, s.kind, s.name, s.desc, meta);
      }
      html += '</div></div>';
    } else {
      grim.querySelector('.aw-sp-title').textContent = '주문 목록';
      grim.querySelector('.aw-sp-count').textContent = master ? `${ELEMENT_NAMES_KO[pr.element] || ''}의 대가 — 각성한 주문` : '다섯 원소 · 열다섯 주문';
      const defs = game.spells?.SPELLS || game.spells?.defs || null;
      for (const el of ELEMENTS) {
        const lock = !unlocked(el);
        if (lock && master) continue;
        let sp = defs ? Object.values(defs).filter((d) => d.element === el) : [];
        sp = sp.filter((d) => (master ? d.kind !== 'ultimate' || d.awakened : !d.awakened && order[d.kind] <= 2));
        sp.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
        html += `<div class="aw-sp-el${lock ? ' locked' : ''}" style="--ec:${ELEMENT_CSS[el]}"><div class="aw-sp-head">${elementSVG(el, 18)}<span>${ELEMENT_NAMES_KO[el]}</span>${lock ? LOCK_SVG : ''}</div><div class="aw-sp-grid">`;
        if (!sp.length) html += `<div class="aw-sp-row"><div class="aw-sp-desc">주문 정보를 불러올 수 없습니다</div></div>`;
        for (const d of sp) html += spRow(el, d.kind, d.name, d.desc, d.mp ? `<span class="aw-sp-mp">${d.mp} MP</span>` : '');
        html += '</div></div>';
      }
    }
    grim.querySelector('.aw-spell-list').innerHTML = html;
  }
  let grimPaused = false;
  function setGrimoire(on) {
    if (on === grimOpen) return;
    grimOpen = on;
    if (on) {
      buildGrimoire(); game.audio?.play?.('ui_select');
      // opening the book from gameplay pauses the world (and frees the cursor for scrolling)
      if (game.state === 'playing') { grimPaused = true; game.pause(); }
    }
    grim.classList.toggle('show', on);
    if (!on && grimPaused) { grimPaused = false; if (game.state === 'paused') game.resume(); }
    syncModalLock();
  }

  // ------------------------------------------------------------------ state handling
  let hudOn = null;
  function applyState(s) {
    root.dataset.state = s;
    title.classList.toggle('show', s === 'title');
    if (s !== 'title') title.classList.remove('leaving');
    syncModalLock();
    if (s === 'paused') {
      const t = objText.textContent;
      pause.querySelector('.aw-pause-obj').textContent = t ? '현재 목표 — ' + t : '';
    }
    if (s !== 'title' && s !== 'paused') { closeControls(); settingsMenu.close(); }
    if (s === 'dead') { death.classList.add('show', 'final'); deadT = 2.0; }
    if (s === 'playing') death.classList.remove('show', 'final');
    if (s === 'victory') showVictory();
    if (s !== 'playing' && s !== 'paused') setGrimoire(false);
    if (s === 'playing' && !tutStarted) {
      tutStarted = true;
      if (!prog()?.chosen) {
        queueTut('WASD 이동 · Shift 달리기 · Space 점프 (공중에서 꾹 누르면 활공)', 1.5);
        queueTut('마을 사람 가까이에서 F 대화하기 · 나침반의 표식을 따라가세요', 6);
      }
    }
  }
  let deadT = 0;
  let victoryStats = null;
  function showVictory() {
    const st = victoryStats || {};
    const total = reactions().length;
    const kills = st.kills ?? game.enemies?.kills ?? 0;
    const rx = st.reactions ?? game.combat?.discovered?.size ?? seenReactions.size;
    const time = st.timeSec ?? playTime;
    statsBox.innerHTML = `
      <div class="aw-stat"><div class="aw-stat-v">${kills}</div><div class="aw-stat-k">처치 수</div></div>
      <div class="aw-stat"><div class="aw-stat-v">${rx}<small> / ${total || '-'}</small></div><div class="aw-stat-k">발견한 반응</div></div>
      <div class="aw-stat"><div class="aw-stat-v">${fmtTime(time)}</div><div class="aw-stat-k">플레이 시간</div></div>
      <div class="aw-stat"><div class="aw-stat-v">${maxCombo}</div><div class="aw-stat-k">최대 콤보</div></div>`;
    victory.classList.add('show');
    try { game.input.exitLock?.(); } catch (_) { /* */ }
  }

  // ------------------------------------------------------------------ objective / markers (4 Hz)
  let objKey = '', objTargetRef = null;
  const objTarget = new THREE.Vector3();
  function fallbackObjective() {
    const o = game.enemies?.getObjective?.();
    if (!o) return null;
    if (o.phase === 'camps') return { title: '마물 토벌', desc: '솔레아 평원의 마물 거점 소탕', progress: { cur: o.campsCleared, max: o.campsTotal }, _o: o };
    if (o.phase === 'boss') return { title: '봉인의 유적', desc: '고대 바위 골렘을 쓰러뜨려라', _o: o };
    return { title: '에테리아의 수호자', desc: '평원에 평화가 찾아왔다', _o: o };
  }
  function setMarker(i, pos, kind, label) {
    const m = markers[i];
    if (m.kind !== kind) { m.kind = kind; m.ico.innerHTML = MARKER_SVG[kind] || MARKER_SVG.quest; m.el.dataset.kind = kind; }
    m.ref = pos; m.on = true;
    if (m.label !== (label || '')) { m.label = label || ''; m.el.title = m.label; }
  }
  function updateObjective() {
    let o = null;
    try { o = game.story?.getObjective?.() || null; } catch (_) { o = null; }
    const fromStory = !!o;
    if (!o) o = fallbackObjective();
    if (!o) { objective.classList.add('off'); return; }
    objective.classList.remove('off');
    const pr = o.progress && o.progress.max > 0 ? o.progress : null;
    const key = (o.title || '') + '|' + (o.desc || '') + '|' + (pr ? pr.cur + '/' + pr.max : '');
    if (key !== objKey) {
      const changed = objKey !== '' && objKey.split('|')[1] !== (o.desc || '');
      objKey = key;
      objTitle.textContent = o.title || '목표';
      objText.textContent = o.desc || '';
      objProg.style.display = pr ? '' : 'none';
      if (pr) { objProgBar.style.transform = `scaleX(${clamp(pr.cur / pr.max, 0, 1).toFixed(3)})`; objProgTxt.textContent = `${pr.cur} / ${pr.max}`; }
      if (changed) restartAnim(objective, 'flash');
    }
    objTargetRef = o.marker || null;
    if (objTargetRef) objTarget.copy(objTargetRef);

    // compass markers
    let n = 0;
    let list = null;
    if (fromStory) { try { list = game.story.getMarkers?.() || null; } catch (_) { list = null; } }
    if (list) {
      for (let i = 0; i < list.length && n < MARK_POOL; i++) {
        const mk = list[i];
        if (mk?.position) setMarker(n++, mk.position, mk.kind || 'quest', mk.label);
      }
    } else {
      const eo = o._o || game.enemies?.getObjective?.();
      const camps = eo?.camps || game.world?.camps || [];
      for (let i = 0; i < camps.length && n < MARK_POOL - 1; i++) if (camps[i].position) setMarker(n++, camps[i].position, camps[i].cleared ? 'done' : 'camp', camps[i].name || '마물 거점');
      const bp = eo?.boss?.object?.position || game.world?.bossArena?.position;
      if (bp && eo?.phase !== 'done') setMarker(n++, bp, 'boss', '봉인의 유적');
    }
    let dtxt = '';
    for (let i = 0; i < MARK_POOL; i++) {
      const m = markers[i];
      if (i >= n) { m.on = false; m.ref = null; }
      const tgt = !!m.on && !!objTargetRef && (m.ref === objTargetRef || (m.ref && m.ref.distanceToSquared?.(objTarget) < 1));
      if (tgt !== m.target) { m.target = tgt; m.el.classList.toggle('target', tgt); }
      if (tgt && !dtxt) {
        const pp = game.player?.object?.position;
        const d = pp ? Math.round(Math.hypot(m.ref.x - pp.x, m.ref.z - pp.z)) : 0;
        dtxt = d > 3 ? `${m.label ? m.label + ' · ' : ''}${d}m` : '';
      }
      const dim = !!m.on && !!objTargetRef && !tgt;
      if (dim !== m.dim) { m.dim = dim; m.el.classList.toggle('dim', dim); }
    }
    if (dtxt !== objDistTxt) { objDistTxt = dtxt; objDist.textContent = dtxt; }
  }

  // ------------------------------------------------------------------ events
  const ev = game.events;
  ev.on('stateChange', (p) => applyState(p.state));
  ev.on('skipTitle', () => { if (game.state === 'title') startGame({ skipIntro: true }); });
  ev.on('damage', (p) => {
    if (!p) return;
    const amt = Math.round(p.amount || 0);
    if (p.target) lastHit.set(p.target, game.realTime);
    if (p.target?.isProp) return;
    if (amt <= 0 && !p.reaction) return;
    const point = p.point || p.target?.object?.position;
    if (!point) return;
    if (p.isPlayer) {
      spawnNumber('-' + amt, v2.copy(point).setY(point.y + 0.3), 'aw-num-player', '#ff5d6a', { life: 1.0, vy: 0.9, spread: 30 });
      return;
    }
    const color = ELEMENT_CSS[p.element] || '#ffffff';
    if (p.reaction) {
      const rn = rxById(p.reaction)?.name || '';
      spawnNumber(`${amt}${rn ? ' ' + rn : ''}`, point, 'aw-num-rx', '#ffd65a', { life: 1.4, scale: 1.25, vy: 1.6 });
    } else if (p.crit) {
      spawnNumber(amt + '!', point, 'aw-num-crit', color, { life: 1.2, scale: 1.45, vy: 1.5 });
    } else if (p.dot) {
      spawnNumber(String(amt), point, 'aw-num-dot', color, { life: 0.8, scale: 0.75, vy: 1.0, spread: 60 });
    } else {
      spawnNumber(String(amt), point, amt >= 80 ? 'aw-num-big' : '', color, { life: 0.9 + Math.min(0.6, amt / 150), scale: 0.85 + Math.min(1.1, amt / 90) });
    }
    if (!p.dot) { bumpCombo(); hitMarker(p.killed); }
  });
  ev.on('reaction', (p) => onReaction(p || {}, false));
  ev.on('zoneCombo', (p) => onReaction(p || {}, true));
  ev.on('playerHurt', (p) => { hurtA = Math.min(1, hurtA + 0.45 + Math.min(0.4, (p?.amount || 0) / 40)); });
  ev.on('playerDeath', () => {
    death.classList.remove('final');
    restartAnim(death, 'show');
    comboCount = 0; combo.classList.remove('on');
  });
  ev.on('playerRespawn', () => { death.classList.remove('show', 'final'); hurtA = 0; });
  ev.on('spellFail', (p) => {
    if (p?.reason === 'mana') { showHint('마력이 부족합니다'); restartAnim(vMp.el, 'shake'); }
    else if (p?.reason === 'gauge') showHint('각성 게이지가 부족합니다');
    else if (p?.reason === 'stamina') { showHint('기력이 부족합니다'); restartAnim(vSt.el, 'shake'); }
  });
  ev.on('campCleared', (p) => {
    const total = p?.total ?? 3, idx = (p?.index ?? 0) + 1;
    const cleared = game.enemies?.getObjective?.()?.campsCleared ?? idx;
    showCard('마물 거점', '거점 소탕!', `${cleared} / ${total}`, 'aw-card-camp', 3.0);
  });
  ev.on('bossSpawn', (p) => {
    const nm = p?.boss?.name || '고대 바위 골렘';
    setTimeout(() => showCard('봉인의 수문장', nm, '안개에 잠식된 거인이 깨어났다', 'aw-card-boss', 4.2), 700);
  });
  ev.on('bossDefeated', () => { showCard('', '수문장 정화', '봉인의 유적에 고요가 돌아오다', 'aw-card-camp', 3.0); });
  ev.on('victory', (p) => { victoryStats = p?.stats || null; if (game.state === 'victory') showVictory(); });
  ev.on('pickup', (p) => {
    const pp = game.player?.object?.position;
    if (!pp) return;
    v2.copy(pp).setY(pp.y + 2);
    if (p?.kind === 'heart') spawnNumber(`+${p.amount ?? ''} 생명력`, v2, 'aw-num-pick', '#ff8aa0', { life: 1.2, scale: 0.85 });
    else if (p?.kind === 'mana') spawnNumber(`+${p.amount ?? ''} MP`, v2, 'aw-num-pick', '#7cc4ff', { life: 1.2, scale: 0.85 });
  });
  ev.on('elementChanged', () => restartAnim(elName, 'pop'));

  // quests
  ev.on('questStart', (p) => {
    if (!p?.title) return;
    // shown a beat later and only if still the current quest (debug skips / chained stages)
    setTimeout(() => {
      let cur = null; try { cur = game.story?.getObjective?.()?.title; } catch (_) { /* */ }
      if (cur == null || cur === p.title) showCard('새로운 임무', p.title, '', 'aw-card-quest', 3.4);
    }, 300);
    if (p.id === 'updraft') queueTut('불타는 풀 위에서 Space를 꾹 — 상승 기류를 타고 높이 날아오르세요', 4);
    if (p.id === 'training') queueTut('스승의 지시를 따라 수련하세요 — 진행 상황은 오른쪽 위 임무 창에 표시됩니다', 3);
  });
  ev.on('questComplete', (p) => { if (p?.title) showCard('임무 완료', p.title, '', 'aw-card-done', 3.0); });
  ev.on('pathChosen', (p) => {
    skillSig = ''; // rebuild hotbar
    const cls = p?.cls === 'sword' ? 'sword' : 'mage';
    const master = p?.path === 'master';
    CLASS_TUT[cls].forEach((t, i) => queueTut(t, i === 0 ? 2.5 : 1));
    (master ? CLASS_TUT.master : CLASS_TUT.all).forEach((t) => queueTut(t, 1));
  });
  // defense & feel
  ev.on('parry', (p) => {
    const sword = p?.cls === 'sword' || prog()?.cls === 'sword';
    showFlash(sword ? '간파!' : '반사!', sword ? 'PERFECT PARRY' : 'PERFECT BARRIER', 'parry', 0.95, 3);
    edge('parry');
    restartAnim(defBlock, 'pulse');
  });
  ev.on('perfectDodge', () => { showFlash('완벽 회피!', '반격의 기회', 'dodge', 1.1, 3); edge('dodge'); });
  ev.on('blocked', (p) => {
    if (p?.target?.team !== 'player' || p.parried || p.perfect || p.dodged) return;
    showHint(prog()?.cls === 'sword' ? '막기!' : '방벽으로 막음', 'block');
    restartAnim(defBlock, 'pulse');
  });
  ev.on('guardBreak', () => { showFlash('가드 붕괴!', '', 'break', 0.8, 2); restartAnim(vSt.el, 'shake'); });
  let updraftHintAt = -99;
  ev.on('updraftEnter', () => {
    if (game.realTime - updraftHintAt < 5) return;
    updraftHintAt = game.realTime;
    showFlash('상승 기류!', 'Space를 꾹 눌러 활공', 'updraft', 1.2, 1);
  });
  ev.on('awakeningReady', () => {
    showCard('각성', '원소의 힘이 깨어났다', 'R 필살기 발동 가능', 'aw-card-awaken', 2.6);
    edge('awaken');
    game.audio?.play?.('awakening_ready');
  });
  ev.on('finisherStart', () => { finPrompt.classList.remove('on'); });

  // pause on Escape / lock loss, relock on canvas click
  let lockLostAt = -9, wasLocked = false;
  document.addEventListener('pointerlockchange', () => {
    const locked = !!document.pointerLockElement;
    if (!locked && wasLocked && game.state === 'playing' && !game.isTest) {
      lockLostAt = performance.now();
      if (grimOpen) setGrimoire(false);
      game.pause();
    }
    wasLocked = locked;
  });
  const appEl = document.getElementById('app');
  appEl?.addEventListener('mousedown', (e) => {
    if (game.state === 'playing' && !game.input.locked && !game.isTest) {
      game.input.requestLock();
      e.stopPropagation();   // the relock click must not also swing / cast (input listens on window)
    }
  });
  // back to gameplay after a dialogue / cutscene without pointer lock (Esc pressed meanwhile, or no gesture to
  // relock): pause instead of leaving a dead mouse camera
  ev.on('stateChange', (p) => {
    if (game.isTest || p?.state !== 'playing' || (p.prev !== 'dialogue' && p.prev !== 'cutscene')) return;
    setTimeout(() => { if (game.state === 'playing' && !game.input.locked && !game.cinematic?.active) game.pause(); }, 450);
  });

  // ------------------------------------------------------------------ title camera (cinematic drift)
  let titleT = 0;
  const camLook = new THREE.Vector3();
  function titleCamera(dt) {
    titleT += dt;
    const sp = game.world?.village?.center || game.world?.playerSpawn;
    if (!sp) return;
    const t = titleT * 0.04;
    const x = sp.x + Math.sin(t) * 22, z = sp.z + 26 + Math.cos(t * 0.7) * 6;
    let gy = 0;
    try { gy = game.world.getHeight?.(x, z) ?? sp.y; } catch (_) { gy = sp.y || 0; }
    camera.position.set(x, Math.max(gy, sp.y || 0) + 15 + Math.sin(t * 1.3) * 1.2, z);
    const tree = game.world?.worldTree;
    if (tree?.position) camLook.copy(tree.position).setY(tree.position.y + (tree.height || 60) * 0.45);
    else {
      let ty = 0;
      try { ty = game.world.getHeight?.(sp.x, sp.z - 120) ?? 0; } catch (_) { /* */ }
      camLook.set(sp.x, ty + 10, sp.z - 120);
    }
    camLook.x += Math.sin(t * 0.8) * 10;
    camera.lookAt(camLook);
  }

  // ------------------------------------------------------------------ tutorial state
  let tutStarted = false, dummyHintDone = false, dummyT = 0, playTime = 0, maxCombo = 0;

  // ------------------------------------------------------------------ per-frame caches
  let stamVis = 0, stamLast = -1, chargeVis = 0, hurtA = 0, lastEl = '', lastTarget = null;
  let bossLagV = 1, bossShown = false;
  let objTimer = 0, skillTimer = 0, fpsTimer = 0, fpsShown = null;
  let skillSig = '', hotbarShown = null, defShown = null, defSig = '', lockSig = '', finReady = null;
  let lastAwk = -1;
  const dir = new THREE.Vector3();

  function project(p, out) {
    v.copy(p).project(camera);
    if (v.z > 1 || v.z < -1) return false;
    out.x = (v.x * 0.5 + 0.5) * W; out.y = (-v.y * 0.5 + 0.5) * H;
    return out.x > -80 && out.x < W + 80 && out.y > -80 && out.y < H + 80;
  }
  const scr = { x: 0, y: 0 };

  function updateVital(V, cur, max, dt, lagSpeed, step) {
    const f = clamp(cur / (max || 1), 0, 1);
    if (Math.abs(cur - V.last) > step || max !== V.lastMax) {
      V.fill.style.transform = `scaleX(${f.toFixed(4)})`;
      V.num.textContent = Math.floor(cur + 0.0001);
      if (max !== V.lastMax) V.max.textContent = '/' + Math.round(max);
      if (cur > V.last) V.lagV = Math.max(V.lagV, f);
      V.last = cur; V.lastMax = max;
    }
    if (V.lagV > f) { V.lagV = Math.max(f, V.lagV - dt * lagSpeed); V.lag.style.transform = `scaleX(${V.lagV.toFixed(4)})`; }
    else if (V.lagV < f) { V.lagV = f; V.lag.style.transform = `scaleX(${f.toFixed(4)})`; }
    return f;
  }

  function updateVitals(dt) {
    const P = game.player;
    if (!P) return;
    const ent = P.entity;
    const hp = Math.max(0, ent?.hp ?? P.hp ?? 0), maxHp = ent?.maxHp ?? P.maxHp ?? 100;
    const hf = updateVital(vHp, hp, maxHp, dt, 0.6, 0.01);
    vHp.el.classList.toggle('low', hf < 0.3);
    const sword = prog()?.cls === 'sword';
    if (!sword) updateVital(vMp, Math.max(0, P.mp ?? 0), P.maxMp ?? 100, dt, 0.8, 0.05);
    const st = P.stamina ?? 100, stMax = P.maxStamina ?? 100, sf = clamp(st / stMax, 0, 1);
    if (sword) {
      updateVital(vSt, Math.max(0, st), stMax, dt, 0.9, 0.05);
      vSt.el.classList.toggle('low', sf < 0.25);
    }
    // low hp heartbeat
    lowVig.classList.toggle('on', hf < 0.3 && hf > 0 && game.state === 'playing');

    // stamina ring next to the crosshair (BotW: only when not full; mage only — sword shows the bar)
    const want = !sword && sf < 0.995 ? 1 : 0;
    const nv = stamVis + (want - stamVis) * Math.min(1, dt * (want ? 10 : 2.5));
    if (Math.abs(sf - stamLast) > 0.002) {
      stamFg.setAttribute('stroke-dashoffset', (ST_C * (1 - sf)).toFixed(2));
      stamSvg.classList.toggle('low', sf < 0.25);
      stamLast = sf;
    }
    if (Math.abs(nv - stamVis) > 0.003 || (nv === 0) !== (stamVis === 0)) { stamVis = nv < 0.003 ? 0 : nv; stamSvg.style.opacity = stamVis.toFixed(3); }

    // aim target
    let target = null;
    try { target = P.getAim?.()?.target || null; } catch (_) { /* */ }
    if (target && (target.alive === false || target.isProp)) target = null;
    if (target !== lastTarget) { reticle.classList.toggle('lock', !!target); lastTarget = target; }
    if (target) lastHit.set(target, Math.max(lastHit.get(target) || 0, game.realTime - 4));
  }

  function updateDefense() {
    const P = game.player;
    let d = null;
    try { d = P?.getDefenseHud?.() || null; } catch (_) { d = null; }
    const show = !!d && !!prog()?.chosen;
    if (show !== defShown) { defShown = show; vitals.classList.toggle('def-on', show); }
    if (!show) return;
    const sword = d.block?.type === 'guard' || prog()?.cls === 'sword';
    const sig = sword ? 's' : 'm';
    if (sig !== defSig) {
      defSig = sig;
      defDashLbl.textContent = sword ? '질풍보' : '순간이동';
      defBlockLbl.textContent = sword ? '검 막기' : '마력 방벽';
    }
    const dash = d.dash || {};
    const maxC = Math.min(PIP_POOL, dash.maxCharges || 1), ch = dash.charges ?? 0;
    for (let i = 0; i < PIP_POOL; i++) {
      const p = pips[i];
      const shown = i < maxC;
      if (shown !== p.shown) { p.shown = shown; p.el.style.display = shown ? '' : 'none'; }
      if (!shown) continue;
      const on = i < ch;
      if (on !== p.on) {
        if (on && p.on === false) restartAnim(p.el, 'ready');
        p.on = on; p.el.classList.toggle('on', on);
      }
      // the pip being recharged fills up
      const f = on ? 1 : i === ch ? clamp(1 - (dash.cooldownFrac ?? 0), 0, 1) : 0;
      const q = Math.round(f * 40) / 40;
      if (q !== p.f) { p.f = q; p.fill.style.transform = `scaleY(${q})`; }
    }
    const act = !!d.block?.active, perf = !!d.block?.perfect;
    const bs = act ? (perf ? 'p' : 'a') : '';
    if (bs !== defBlock._bs) {
      defBlock._bs = bs;
      defBlock.classList.toggle('active', act);
      defBlock.classList.toggle('perfect', perf);
      defBlockState.textContent = act ? (perf ? '간파 타이밍' : '방어 중') : '';
    }
  }

  function updateSkills(dt, full) {
    const pr = prog();
    let S = null;
    try { S = game.activeSkills ? game.activeSkills() : game.spells; } catch (_) { S = game.spells; }
    let hs = null;
    try { hs = S?.getHudState?.(); } catch (_) { hs = null; }
    const chosen = pr ? !!pr.chosen : true;
    const show = !!hs && chosen && (hs.slots?.length || 0) > 0;
    if (show !== hotbarShown) { hotbarShown = show; hotbar.classList.toggle('on', show); }
    if (!show) { chargeSvg.style.opacity = '0'; chargeVis = 0; return; }

    // charge ring: per frame (direct feedback)
    const cf = hs.charging ? clamp(hs.chargeFrac || 0, 0, 1) : 0;
    const nv = chargeVis + ((hs.charging ? 1 : 0) - chargeVis) * Math.min(1, dt * 14);
    if (Math.abs(nv - chargeVis) > 0.003) { chargeVis = nv < 0.003 ? 0 : nv; chargeSvg.style.opacity = chargeVis.toFixed(3); }
    if (hs.charging) {
      chargeFg.setAttribute('stroke-dashoffset', (CH_C * (1 - cf)).toFixed(2));
      chargeSvg.classList.toggle('full', cf >= 1);
    }
    if (!full) return;

    const cls = pr?.cls || 'mage', el = hs.element;
    const sword = cls === 'sword';
    // layout signature: which slots exist
    let kinds = '';
    for (const s of hs.slots) kinds += s.kind[0];
    const sig = cls + '|' + (pr?.path || '') + '|' + kinds;
    if (sig !== skillSig) {
      skillSig = sig;
      hud.dataset.cls = cls;
      hud.dataset.master = pr?.isMaster?.() ? '1' : '0';
      for (const k of KIND_ORDER) {
        const s = slots[k];
        const has = hs.slots.some((x) => x.kind === k);
        if (has !== s.shown) { s.shown = has; s.root.style.display = has ? '' : 'none'; }
        s._sig = '';
      }
      lockSig = '';
    }
    if (el !== lastEl) {
      lastEl = el;
      hud.style.setProperty('--el', ELEMENT_CSS[el] || '#fff');
      gems.forEach((g, i) => g.classList.toggle('sel', ELEMENTS[i] === el));
      elName.innerHTML = `<span>${ELEMENT_NAMES_KO[el] || ''}${pr?.isMaster?.() ? '의 대가' : ''}</span>`;
    }
    // locked elements
    let ls = '';
    const els = hs.elements || [];
    for (let i = 0; i < ELEMENTS.length; i++) {
      const e = els.find ? els.find((x) => x.id === ELEMENTS[i]) : null;
      ls += e && !e.locked ? '1' : '0';
    }
    if (ls !== lockSig) {
      lockSig = ls;
      const n = ls.split('').filter((c) => c === '1').length;
      gems.forEach((g, i) => { g.classList.toggle('locked', ls[i] === '0'); g.querySelector('.aw-gem-key').textContent = n > 1 ? String(i + 1) : ''; });
      gemRow.classList.toggle('single', n <= 1);
    }

    const mp = game.player?.mp ?? 999, st = game.player?.stamina ?? 999;
    const buffOn = !!(hs.support?.active || (sword && game.sword?.buff));
    for (let i = 0; i < hs.slots.length; i++) {
      const d = hs.slots[i];
      const s = slots[d.kind];
      if (!s) continue;
      const nsig = el + '|' + d.name + '|' + (d.awakened ? 1 : 0);
      if (s._sig !== nsig) {
        s._sig = nsig;
        s.ico.innerHTML = spellSVG(el, d.kind === 'support' ? 'heavy' : d.kind === 'finisher' ? 'ultimate' : d.kind, d.kind === 'ultimate' || d.kind === 'finisher' ? 58 : 50)
          + `<span class="aw-slot-kind">${KIND_GLYPH[d.kind] || ''}</span>`;
        // ' · 각성' suffix → small gold badge instead of wrapping into the cost line
        const nm = d.name || KIND_LABEL[d.kind];
        const aw = /\s*·\s*각성$/.test(nm);
        s.name.innerHTML = esc(aw ? nm.replace(/\s*·\s*각성$/, '') : nm) + (aw ? '<b class="aw-slot-awk">각성</b>' : '');
        s.key.textContent = KEY_LABEL[d.key] || d.key || KEY_LABEL[KIND_KEY[d.kind]];
        s.root.classList.toggle('awakened', !!d.awakened);
        s._cd = -1; s._cost = null;
        restartAnim(s.root, 'swap');
      }
      // cost line
      let cost = '', costKind = '';
      if (d.kind === 'finisher') { cost = `각성 ${Math.floor(hs.awakening?.value ?? 0)}%`; costKind = 'awk'; }
      else if (!sword && d.mpCost > 0) { cost = String(d.mpCost); costKind = 'mp'; }
      else if (d.staminaCost > 0) { cost = String(d.staminaCost); costKind = 'st'; }
      else if (d.cooldown > 0) { cost = `${Math.round(d.cooldown)}초`; costKind = 'cd'; }
      const ck = costKind + cost;
      if (ck !== s._cost) { s._cost = ck; s.cost.textContent = cost; s.costBox.dataset.k = costKind; }

      const frac = d.cooldown > 0 ? clamp(d.cooldownLeft / d.cooldown, 0, 1) : 0;
      const q = Math.round(frac * 120) / 120;
      if (q !== s._cd) {
        s._cd = q;
        s.cd.style.setProperty('--cd', (q * 360).toFixed(1) + 'deg');
        s.cd.style.opacity = q > 0 ? '1' : '0';
      }
      let txt = d.cooldownLeft > 0.95 ? Math.ceil(d.cooldownLeft).toString() : '';
      const active = d.kind === 'support' && buffOn;
      if (active && hs.support?.timeLeft > 0 && !txt) txt = Math.ceil(hs.support.timeLeft).toString();
      if (txt !== s._cdTxt) { s._cdTxt = txt; s.cdnum.textContent = txt; }
      if (active !== s._act) { s._act = active; s.root.classList.toggle('active', active); }
      const low = d.kind === 'finisher' ? false : sword ? d.staminaCost > 0 && st < d.staminaCost : mp < (d.mpCost || 0);
      if (low !== s._low) { s._low = low; s.root.classList.toggle('nomp', low); }
      const ready = !!d.ready;
      if (ready !== s._ready) {
        if (ready && s._ready === false && !low) restartAnim(s.root, 'readyflash');
        s._ready = ready;
      }
    }
    slots.heavy.root.classList.toggle('charging', !!hs.charging);

    // awakening gauge (ornate ring around the R slot)
    const aw = hs.awakening;
    if (aw?.enabled && slots.finisher.shown) {
      const val = clamp(aw.value || 0, 0, 100);
      const q = Math.round(val * 2) / 2;
      if (q !== lastAwk) {
        lastAwk = q;
        slots.finisher.awkFg?.setAttribute('stroke-dashoffset', (AWK_C * (1 - q / 100)).toFixed(2));
      }
      const r = !!aw.ready && !game.spells?.finisherActive;
      if (r !== finReady) {
        finReady = r;
        slots.finisher.root.classList.toggle('full', r);
        finPrompt.classList.toggle('on', r);
      }
    } else if (finReady) { finReady = false; slots.finisher.root.classList.remove('full'); finPrompt.classList.remove('on'); }
  }

  function updateCompass() {
    camera.getWorldDirection(dir);
    const yawDeg = Math.atan2(dir.x, -dir.z) * 180 / Math.PI;
    strip.style.transform = `translateX(${(COMPASS_W / 2 - (yawDeg + 360) * PX_PER_DEG).toFixed(1)}px)`;
    const pp = game.player?.object?.position || camera.position;
    visMarks.length = 0;
    for (let i = 0; i < MARK_POOL; i++) {
      const m = markers[i];
      let vis = false;
      if (m.on && m.ref) {
        const dx = m.ref.x - pp.x, dz = m.ref.z - pp.z;
        let rel = Math.atan2(dx, -dz) * 180 / Math.PI - yawDeg;
        rel = ((rel + 540) % 360) - 180;
        vis = Math.abs(rel) < 88;
        if (vis) {
          m._x = COMPASS_W / 2 + rel * PX_PER_DEG;
          const d = Math.round(Math.hypot(dx, dz));
          if (d !== m._d) {
            m._d = d;
            m.d.textContent = d + 'm';
          }
          visMarks.push(m);
        }
      }
      if (vis !== m.vis) { m.vis = vis; m.el.style.display = vis ? '' : 'none'; }
    }
    // de-overlap: sort by screen x; a marker closer than 38px to its left neighbour is nudged right of it
    visMarks.sort((a, b) => a._x - b._x);
    for (let i = 0; i < visMarks.length; i++) {
      const m = visMarks[i];
      const px = i > 0 && m._x - visMarks[i - 1]._px < 38 ? visMarks[i - 1]._px + 38 : m._x;
      if (Math.abs(px - m._px) > 0.25) { m._px = px; m.el.style.transform = `translateX(${px.toFixed(1)}px)`; }
    }
  }

  function updateBoss(dt) {
    let boss = null;
    try { const o = game.enemies?.getObjective?.(); boss = o?.boss || game.enemies?.boss || null; } catch (_) { boss = null; }
    if (boss && boss.alive === false) boss = null;
    if (!!boss !== bossShown) {
      bossShown = !!boss; bossBar.classList.toggle('show', bossShown);
      if (boss) { bossName.textContent = boss.name || '고대 바위 골렘'; bossLagV = 1; }
    }
    if (boss) {
      const bf = clamp(boss.hp / boss.maxHp, 0, 1);
      bossFill.style.transform = `scaleX(${bf.toFixed(4)})`;
      if (bossLagV > bf) bossLagV = Math.max(bf, bossLagV - dt * 0.25); else bossLagV = bf;
      bossLag.style.transform = `scaleX(${bossLagV.toFixed(4)})`;
    }
  }

  function updateHUD(dt) {
    updateVitals(dt);
    skillTimer -= dt;
    const full = skillTimer <= 0;
    if (full) { skillTimer = SKILL_HZ; updateDefense(); }
    updateSkills(dt, full);

    // hitmarker
    if (hitT > 0) { hitT -= dt; hitmark.style.opacity = clamp(hitT / 0.12, 0, 1).toFixed(2); }
    else if (hitmark.style.opacity !== '0') hitmark.style.opacity = '0';

    objTimer -= dt;
    if (objTimer <= 0) { objTimer = OBJ_HZ; updateObjective(); }
    updateCompass();
    updateBoss(dt);
  }

  function updateNumbers(dt) {
    for (let i = 0; i < DMG_POOL; i++) {
      const n = nums[i];
      if (!n.alive) continue;
      n.age += dt;
      const k = n.age / n.life;
      if (k >= 1) { n.alive = false; n.hidden = true; n.el.style.opacity = '0'; n.el.style.transform = 'translate(-9999px,0)'; continue; }
      n.pos.y += n.vy * dt * (1 - k * 0.6);
      if (!project(n.pos, scr)) { if (!n.hidden) { n.hidden = true; n.el.style.opacity = '0'; } continue; }
      n.hidden = false;
      // pop: overshoot then settle, fade out at the end
      const pop = k < 0.12 ? 0.4 + (k / 0.12) * 1.0 : k < 0.24 ? 1.4 - ((k - 0.12) / 0.12) * 0.4 : 1;
      const s = n.scale * pop;
      const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      n.el.style.opacity = a.toFixed(2);
      n.el.style.transform = `translate(${(scr.x + n.sx + n.ox * k).toFixed(1)}px,${(scr.y + n.oy).toFixed(1)}px) translate(-50%,-50%) scale(${s.toFixed(3)})`;
    }
  }

  function updateBars(dt) {
    let bi = 0;
    const now = game.realTime;
    const cam = camera.position;
    const ents = game.entities || [];
    if ((game.state === 'playing' || game.state === 'paused') && !game.cinematic?.active) {
      for (let i = 0; i < ents.length && bi < BAR_POOL; i++) {
        const e = ents[i];
        if (e.team !== 'enemy' || e.isProp || e.isBoss || !e.alive || !e.object) continue;
        const p = e.object.position;
        const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 35 * 35) continue;
        const lh = lastHit.get(e);
        const recent = lh !== undefined && now - lh < 6;
        const damaged = e.hp < e.maxHp;
        if (!recent && !(e.aggro && damaged) && !(e.aggro && d2 < 18 * 18)) continue;
        v2.copy(p); v2.y += (e.height || 1.6) + 0.55;
        if (!project(v2, scr)) continue;
        const b = bars[bi++];
        if (b.ent !== e) {
          b.ent = e; b.name.textContent = e.name || '마물';
          b.lagV = barLag.get(e) ?? clamp(e.hp / e.maxHp, 0, 1);
          b.el.classList.toggle('dummy', !!e.isDummy);
        }
        const f = clamp(e.hp / e.maxHp, 0, 1);
        if (b.lagV > f) b.lagV = Math.max(f, b.lagV - dt * 0.7); else b.lagV = f;
        barLag.set(e, b.lagV);
        b.fill.style.transform = `scaleX(${f.toFixed(3)})`;
        b.lag.style.transform = `scaleX(${b.lagV.toFixed(3)})`;
        let mask = 0;
        const st = e.statuses;
        if (st) for (let k = 0; k < STATUS_KEYS.length; k++) if (st[STATUS_KEYS[k]]) mask |= 1 << k;
        if (mask !== b.pipState) {
          b.pipState = mask;
          for (let k = 0; k < STATUS_KEYS.length; k++) b.pips[k].classList.toggle('on', !!(mask & (1 << k)));
        }
        const dist = Math.sqrt(d2);
        const sc = clamp(1.25 - dist / 45, 0.62, 1.1);
        const fade = recent ? 1 : 0.85;
        b.el.style.opacity = (fade * clamp((35 - dist) / 5, 0, 1)).toFixed(2);
        b.el.style.transform = `translate(${scr.x.toFixed(1)}px,${scr.y.toFixed(1)}px) translate(-50%,-100%) scale(${sc.toFixed(3)})`;
        if (!b.shown) { b.shown = true; b.el.style.display = ''; }
      }
    }
    for (; bi < BAR_POOL; bi++) {
      const b = bars[bi];
      if (b.shown) { b.shown = false; b.el.style.display = 'none'; b.ent = null; }
    }
  }

  function updateTutorial(dt) {
    // queued tutorial toasts: one at a time, only during free gameplay
    if (tutGap > 0) tutGap -= dt;
    if (tutQ.length && tutGap <= 0) {
      const t = tutQ[0];
      t.delay -= dt;
      if (t.delay <= 0) { tutQ.shift(); toast(t.text, { duration: 5.6, kind: 'tut' }); tutGap = 5.2; }
    }
    if (!dummyHintDone && prog()?.chosen) {
      dummyT -= dt;
      if (dummyT <= 0) {
        dummyT = 0.5;
        const pp = game.player?.object?.position;
        if (pp) {
          for (const e of game.entities) {
            if (e.isDummy && e.alive && e.object && e.object.position.distanceToSquared(pp) < 13 * 13) {
              dummyHintDone = true;
              queueTut(prog()?.cls === 'sword'
                ? '수련용 허수아비 — 연속 베기와 충전 베기를 시험해 보세요'
                : '수련용 허수아비 — 마법을 시험해 보세요. 젖게 한 뒤 번개를 맞혀 보세요!', 0);
              break;
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ api
  const api = {
    toast,
    showBanner, showCard,
    flash: (text, sub, kind, dur) => showFlash(text, sub, kind, dur, 2),
    hint: (text) => showHint(text),
    queueTutorial: (text, delay) => queueTut(text, delay),
    openSettings() { settingsMenu.open(); syncModalLock(); },
    closeSettings() { settingsMenu.close(); },
    get settingsOpen() { return settingsMenu.isOpen; },
    setGrimoire, get grimoireOpen() { return grimOpen; },
    init() {
      applyState(game.state);
    },
    update(dt, realDt) {
      dt = realDt || dt || 0;
      frameNo++;
      if (aqNode.length) flushAnims();
      const s = game.state;
      const R = raw();
      const cine = !!game.cinematic?.active;

      // keys (ungated: UI reads raw input)
      if (R) {
        if (R.pressed('Tab') && (s === 'playing' || s === 'paused') && !cine && !settingsMenu.isOpen) setGrimoire(!grimOpen);
        if (R.pressed('Escape')) {
          if (settingsMenu.isOpen) settingsMenu.close();
          else if (controls.classList.contains('show')) closeControls();
          else if (grimOpen) setGrimoire(false);
          else if (s === 'playing' && !cine) game.pause();
          else if (s === 'paused' && performance.now() - lockLostAt > 400) game.resume();
        }
        if (s === 'dead' && (R.pressed('Space') || R.pressed('Enter'))) doRespawn();
        if (s === 'title' && R.pressed('Enter') && !settingsMenu.isOpen && !controls.classList.contains('show')) startGame();
      }

      if (s === 'title') titleCamera(dt);

      // HUD visibility: hidden during cutscenes, dialogue and gameplay cinematics
      const on = (s === 'playing' || s === 'paused' || s === 'dead') && !cine;
      if (on !== hudOn) { hudOn = on; hud.classList.toggle('show', on); root.classList.toggle('aw-hide-hud', !on); }

      if (s === 'playing') {
        playTime += dt;
        if (!cine) updateTutorial(dt);
        if (comboT > 0) {
          comboT -= dt;
          if (comboCount >= 2) comboTimer.style.transform = `scaleX(${clamp(comboT / COMBO_WINDOW, 0, 1).toFixed(3)})`;
          if (comboT <= 0) {
            if (comboCount > maxCombo) maxCombo = comboCount;
            comboCount = 0; combo.classList.remove('on');
          }
        }
        if (comboCount > maxCombo) maxCombo = comboCount;
      }

      if (on) updateHUD(dt);
      updateNumbers(dt);
      updateBars(dt);

      // vignettes
      if (hurtA > 0) { hurtA = Math.max(0, hurtA - dt * 1.8); hurtVig.style.opacity = hurtA.toFixed(3); }
      else if (hurtVig.style.opacity !== '0') hurtVig.style.opacity = '0';

      if (hintCd > 0) hintCd -= dt;
      if (hintT > 0) { hintT -= dt; if (hintT <= 0) hint.classList.remove('show'); }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) { flashEl.classList.remove('show'); flashPrio = 0; } }
      if (cardT > 0) {
        cardT -= dt;
        if (cardT <= 0) { bigCard.classList.remove('show'); }
      }
      if (cardT <= 0.35 && cardQ.length && !cine && s !== 'cutscene') { const c = cardQ.shift(); cardT = 0; showCard(...c); }

      if (s === 'dead' && deadT > 0) {
        deadT -= dt;
        deathCount.textContent = deadT > 0 ? `${Math.ceil(deadT)}초 후 부활` : '부활 중...';
      }

      // FPS counter (4 Hz)
      const showFps = !!game.settings?.values?.showFps;
      if (showFps !== fpsShown) { fpsShown = showFps; fpsEl.classList.toggle('on', showFps); fpsTimer = 0; }
      if (showFps) {
        fpsTimer -= dt;
        if (fpsTimer <= 0) {
          fpsTimer = 0.25;
          const f = game.fps || 0;
          fpsEl.textContent = `${Math.round(f)} FPS · ${f > 0 ? (1000 / f).toFixed(1) : '-'} ms`;
          fpsEl.dataset.q = f >= 50 ? 'good' : f >= 30 ? 'ok' : 'bad';
        }
      }
    },
  };
  return api;
}
