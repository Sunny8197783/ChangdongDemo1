// UI module (v3): DOM overlay inside #ui — title, settings, HUD (v3 9-slot hotbar + attune arc + signature, v2 fallback),
// vitals (HP / MP·투지 / stamina, level badge, XP bar, regen strip), quest tracker, compass, damage & XP numbers, banners,
// enemy bars (all statuses + stacks, break gauge, void shield, "다음 타격" hint), data-driven boss bar, interact prompt,
// and the menus: 원소 별자리 skill tree (K), 캐릭터 (C), 원소 도감 (Tab), class panel, spirit-gate list, confirm dialog,
// tree tour + one-time tips, pause / death / victory, toasts.
// Performance: no layout reads in the loop; DOM writes only on change; skill/defense panels at 20 Hz, the next-hit preview
// at 10 Hz, objective/markers at 4 Hz; animations restarted through a frame-delayed class queue (no forced reflow).
// Rule 7: only own files, src/core/* and three are imported statically; every other module is reached through game.*.
import * as THREE from 'three';
import { clamp } from './core/utils.js';
import { ALL_ELEMENTS, CLASSIC_ELEMENTS, elName } from './core/elements.js';
import { CLASS_DEFS, familyOf } from './core/classes.js';
import {
  ELEMENT_CSS, elCss, elementSVG, spellSVG, RETICLE_SVG, STATUS_COLORS, STATUS_NAMES, MARKER_SVG,
  LOCK_SVG, SHIELD_SVG, DASH_SVG, STAMINA_SVG,
} from './ui/icons.js';
import { h, esc, formatKeys, createAnimQueue } from './ui/dom.js';
import { createSettingsMenu } from './ui/settingsMenu.js';
import { createSkillTree } from './ui/skillTree.js';
import { createTreeTour } from './ui/treeTour.js';
import { createHotbar3 } from './ui/hotbar3.js';
import { createBossBar } from './ui/bossbar.js';
import { createPrompt } from './ui/prompt.js';
import { createGateMenu, createConfirm } from './ui/gateMenu.js';
import { createClassPanel } from './ui/classPanel.js';
import { createCharacter } from './ui/character.js';
import { createCodex } from './ui/codex.js';
import { createFmt } from './ui/fmt.js';
import { createHints } from './ui/hints.js';
import { createThreatUI } from './ui/threatui.js';
import { createMonsters } from './ui/monsters.js';
import { createRecap } from './ui/recap.js';
import { createGuide } from './ui/guide.js';
import { createNewGame } from './ui/newgame.js';
import { autoAllocate } from './ui/build.js';
import {
  HUD_KO, BOSS_KO, VICTORY_KO, CONTROLS, DEF_KO, TIPS, RES_KO, FAMILIES_FALLBACK, MASTERY_KO,
  CALLOUT_KO, HINTS_KO, SETTINGS_UI_KO, HUD4_KO, ONBOARD_KO, fmtKo,
} from './ui/text.js';

const STATUS_FALLBACK = ['burning', 'frozen', 'wet', 'shocked', 'chilled', 'airborne', 'stunned'];
const KIND_ORDER = ['basic', 'heavy', 'support', 'ultimate', 'finisher'];
const KIND_KEY = { basic: 'LMB', heavy: 'RMB', ultimate: 'F', support: 'G', finisher: 'R' };
const KEY_LABEL = { LMB: '좌클릭', RMB: '우클릭', F: 'F', G: 'G', R: 'R', X: 'X' };
const KIND_LABEL = { basic: '기본', heavy: '충전', ultimate: '궁극', support: '보조', finisher: '필살' };
const COMBO_WINDOW = 2.5;
const DMG_POOL = 56, BAR_POOL = 12, MARK_POOL = 10, PIP_POOL = 4;
const SKILL_HZ = 1 / 20, OBJ_HZ = 1 / 4, HINT_HZ = 1 / 10;
const AWK_R = 44, AWK_C = 2 * Math.PI * AWK_R;

const fmtTime = (s) => {
  s = Math.max(0, Math.round(s || 0));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}분 ${String(r).padStart(2, '0')}초`;
};
const kbdRow = ([k, v]) => `<div>${k.split(' ').map((x) => (/^(길게|직전)$/.test(x) ? ` ${x}` : `<kbd>${esc(x)}</kbd>`)).join('')}</div><span>${esc(v)}</span>`;

// --------------------------------------------------------------- controls (key map) panel (v3, CONTRACT §6)
const CONTROLS_HTML = `
  <div class="aw-ctl-cols">
    <div class="aw-ctl-grid">
      <div class="aw-ctl-h">이동</div>${CONTROLS.move.map(kbdRow).join('')}
      <div class="aw-ctl-h">메뉴</div>${CONTROLS.menu.map(kbdRow).join('')}
    </div>
    <div class="aw-ctl-grid">
      <div class="aw-ctl-h">전투</div>${CONTROLS.combat.map(kbdRow).join('')}
    </div>
  </div>
  <div class="aw-ctl-tip">${esc(CONTROLS.tip)}</div>`;

export function createUI(game) {
  const root = document.getElementById('ui') || document.body.appendChild(h('div'));
  root.classList.add('aw-root');
  const camera = game.camera;
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  let W = innerWidth, H = innerHeight;
  addEventListener('resize', () => { W = innerWidth; H = innerHeight; });
  const prog = () => game.progression;
  const raw = () => game.input?.raw || game.input;
  const fam = () => game.player?.family || familyOf(prog()?.cls);
  const AQ = createAnimQueue();
  // deterministic delayed calls on the UI clock (realDt; frozen/stepped tests stay in order — no wall-clock setTimeout)
  const laterT = [], laterF = [];
  const later = (sec, fn) => { laterT.push(sec); laterF.push(fn); };
  function tickLater(dt) {
    for (let i = laterT.length - 1; i >= 0; i--) {
      laterT[i] -= dt;
      if (laterT[i] > 0) continue;
      const f = laterF[i]; laterT.splice(i, 1); laterF.splice(i, 1);
      try { f(); } catch (err) { console.warn('[ui] later', err); }
    }
  }
  const restartAnim = (node, cls) => AQ.restart(node, cls);
  /** settings.uiScale → the --ui-scale CSS variable (0.9–1.3; base sizes keep a 12 px floor at 1.0). */
  function applyUiScale() { const v = clamp(+(game.settings?.values?.uiScale ?? 1) || 1, 0.9, 1.3); root.style.setProperty('--ui-scale', v.toFixed(2)); }

  // ------------------------------------------------------------------ layers
  const F = createFmt(game);
  const fmt = F.fmt;
  const lowVig = root.appendChild(h('div', 'aw-vig aw-vig-low'));
  const worldLayer = root.appendChild(h('div', 'aw-world'));     // enemy bars + damage numbers
  const hud = root.appendChild(h('div', 'aw-hud'));
  const fxLayer = root.appendChild(h('div', 'aw-fx'));           // banners, combo
  const toastBox = root.appendChild(h('div', 'aw-toasts'));
  const screens = root.appendChild(h('div', 'aw-screens'));
  const fpsEl = root.appendChild(h('div', 'aw-fps'));
  const threatUI = createThreatUI(game, { parent: root, onFirstArrow: () => hints.hint('offscreen', HINTS_KO.offscreen, { until: 'tellEnd', boss: true }) });
  const xpCorner = root.appendChild(h('div', 'aw-xpc'));
  const relock = root.appendChild(h('div', 'aw-relock', ''));
  relock.textContent = ONBOARD_KO.clickToContinue;

  // ------------------------------------------------------------------ HUD: vitals + level / XP / regen + defense
  const barHTML = '<div class="aw-bar"><div class="aw-bar-lag"></div><div class="aw-bar-fill"></div><div class="aw-bar-gloss"></div><div class="aw-bar-ticks"></div></div>';
  const vitals = hud.appendChild(h('div', 'aw-vitals', `
    <div class="aw-ptpip"><kbd>K</kbd><span></span></div>
    <div class="aw-vital aw-hp">
      <div class="aw-vital-ico"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 21s-7.5-4.6-9.4-9.6C1.2 7.7 3.6 4 7.2 4c2.1 0 3.6 1.2 4.8 2.8C13.2 5.2 14.7 4 16.8 4c3.6 0 6 3.7 4.6 7.4C19.5 16.4 12 21 12 21z" fill="#ff5d7a" stroke="#ffe0e6" stroke-width="1.2"/><path d="M6.5 8.2c.5-1.2 1.6-1.8 2.6-1.7" stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".8"/></svg><i class="aw-lv">1</i></div>
      ${barHTML}<div class="aw-vital-num"><b>100</b><span>/100</span></div>
      <div class="aw-regen"><i></i></div>
    </div>
    <div class="aw-vital aw-mp">
      <div class="aw-vital-ico aw-res-ico"><svg class="ico-mp" viewBox="0 0 24 24" width="20" height="20"><path d="M12 2 19 12 12 22 5 12z" fill="#4fa0ff" stroke="#dff0ff" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 5.5 9 12h3" stroke="#fff" stroke-width="1.2" fill="none" opacity=".8"/></svg><svg class="ico-res" viewBox="0 0 24 24" width="20" height="20"><path d="M12 2c2 4 6 5.6 6 10.4A6 6 0 0 1 6 12.4C6 9 8 7.6 9 5.6c.5 2 1.3 2.8 2.2 3.2C11 6.4 11.2 4.2 12 2z" fill="#ffb347" stroke="#fff0d6" stroke-width="1.1" stroke-linejoin="round"/></svg></div>
      ${barHTML}<div class="aw-vital-num"><b>100</b><span>/100</span></div><em class="aw-res-lbl"></em>
    </div>
    <div class="aw-vital aw-st">
      <div class="aw-vital-ico">${STAMINA_SVG}</div>
      ${barHTML}<div class="aw-vital-num"><b>100</b><span>/100</span></div>
    </div>
    <div class="aw-xp"><i></i><span></span></div>
    <div class="aw-def">
      <div class="aw-def-item aw-def-dash"><span class="aw-def-ico">${DASH_SVG}</span><kbd>Q</kbd><span class="aw-def-lbl">회피</span><span class="aw-def-pips"></span></div>
      <div class="aw-def-item aw-def-block"><span class="aw-def-ico">${SHIELD_SVG}</span><kbd>E</kbd><span class="aw-def-lbl">방어</span><span class="aw-def-state"></span></div>
    </div>`));
  function mkVital(sel) {
    const el = vitals.querySelector(sel);
    return { el, fill: el.querySelector('.aw-bar-fill'), lag: el.querySelector('.aw-bar-lag'), num: el.querySelector('b'), max: el.querySelector('.aw-vital-num span'), last: -1, lastMax: -1, lagV: 1 };
  }
  const vHp = mkVital('.aw-hp'), vMp = mkVital('.aw-mp'), vSt = mkVital('.aw-st');
  const lvBadge = vitals.querySelector('.aw-lv'), resLbl = vitals.querySelector('.aw-res-lbl');
  const regenEl = vitals.querySelector('.aw-regen'), regenFill = regenEl.firstElementChild;
  const xpEl = vitals.querySelector('.aw-xp'), xpFill = xpEl.firstElementChild, xpTxt = xpEl.querySelector('span');
  const ptPip = vitals.querySelector('.aw-ptpip'), ptPipTxt = ptPip.querySelector('span');
  const defDash = vitals.querySelector('.aw-def-dash'), defBlock = vitals.querySelector('.aw-def-block');
  const defDashLbl = defDash.querySelector('.aw-def-lbl'), defBlockLbl = defBlock.querySelector('.aw-def-lbl');
  const defKbdD = defDash.querySelector('kbd'), defKbdE = defBlock.querySelector('kbd');
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

  // ------------------------------------------------------------------ HUD: hotbar — v2 renderer (fallback for the v2 HudState shape)
  const hotbar = hud.appendChild(h('div', 'aw-hotbar'));
  const finPrompt = hotbar.appendChild(h('div', 'aw-fin-prompt', '<kbd>R</kbd><span>필살기</span>'));
  const slotRow = hotbar.appendChild(h('div', 'aw-slots'));
  const gemRow = hotbar.appendChild(h('div', 'aw-gems'));
  const elNameEl = hotbar.appendChild(h('div', 'aw-elname'));
  const gems = CLASSIC_ELEMENTS.map((el, i) => {
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
  // v3 hotbar (9 slots)
  const hb3 = createHotbar3(game, { anim: restartAnim }, hud);

  // ------------------------------------------------------------------ HUD: objective, compass, boss bar, prompt
  const objective = hud.appendChild(h('div', 'aw-objective', `
    <div class="aw-obj-head"><span class="aw-obj-diamond"></span><span class="aw-obj-title">목표</span></div>
    <div class="aw-obj-text"></div>
    <div class="aw-obj-prog"><div class="aw-obj-bar"><i></i></div><span></span></div>
    <div class="aw-obj-dist"></div>`));
  const objTitle = objective.querySelector('.aw-obj-title'), objText = objective.querySelector('.aw-obj-text');
  const objHow = objText.insertAdjacentElement('afterend', h('div', 'aw-obj-how'));
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
  const bossBar = createBossBar(game, { anim: restartAnim, project: (pt, out) => project(pt, out) }, hud);
  const hint = hud.appendChild(h('div', 'aw-hint'));
  const hints = createHints(game, { parent: hud, fmt, canParry: F.canParry, anim: (n, c) => AQ.restart(n, c), unanim: (n, c) => AQ.cancel(n, c), treeOpen: () => { try { return !!tree.isOpen; } catch (_) { return false; } }, bossShown: () => !!bossBar?.shown });
  const bossAtk = hud.appendChild(h('div', 'aw-bossatk'));

  // ------------------------------------------------------------------ banners, flashes & combo
  const banner = fxLayer.appendChild(h('div', 'aw-banner', '<div class="aw-banner-glow"></div><div class="aw-banner-text"></div><div class="aw-banner-sub"></div>'));
  const bannerText = banner.querySelector('.aw-banner-text'), bannerSub = banner.querySelector('.aw-banner-sub');
  const bigCard = fxLayer.appendChild(h('div', 'aw-card', '<div class="aw-card-line"></div><div class="aw-card-pre"></div><div class="aw-card-title"></div><div class="aw-card-sub"></div><div class="aw-card-line"></div>'));
  const cardPre = bigCard.querySelector('.aw-card-pre'), cardTitle = bigCard.querySelector('.aw-card-title'), cardSub = bigCard.querySelector('.aw-card-sub');
  const flashEl = fxLayer.appendChild(h('div', 'aw-flash', '<div class="aw-flash-rays"></div><div class="aw-flash-text"></div><div class="aw-flash-sub"></div>'));
  const flashText = flashEl.querySelector('.aw-flash-text'), flashSub = flashEl.querySelector('.aw-flash-sub');
  const edgeFlash = fxLayer.appendChild(h('div', 'aw-edge'));
  const combo = fxLayer.appendChild(h('div', 'aw-combo', '<div class="aw-combo-num">0</div><div class="aw-combo-lbl">' + (HUD_KO.combo || '연격') + '</div><div class="aw-combo-timer"><i></i></div>'));
  const comboNum = combo.querySelector('.aw-combo-num'), comboTimer = combo.querySelector('.aw-combo-timer i');
  const lvBurst = fxLayer.appendChild(h('div', 'aw-lvburst', '<i></i><i></i><i></i>'));

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
    nums.push({ el: e, alive: false, pos: new THREE.Vector3(), age: 0, life: 1, ox: 0, sx: 0, oy: 0, spx: -1e4, spy: -1e4, vy: 0, scale: 1, hidden: true, lx: null, ly: 0, w: 40, hh: 24, big: false, tgt: null, sum: 0, cls: '' });
  }
  let numCursor = 0;
  const numScr = { x: 0, y: 0 };
  const NUM_VISIBLE = 6, MERGE_SEC = 0.4;
  function liveNumbers() { let c = 0; for (let i = 0; i < DMG_POOL; i++) if (nums[i].alive) c++; return c; }
  function retireOldest() {
    let o = null;
    for (let i = 0; i < DMG_POOL; i++) { const c = nums[i]; if (c.alive && (!o || c.age / c.life > o.age / o.life)) o = c; }
    if (o) { o.alive = false; o.hidden = true; o.el.style.opacity = '0'; o.el.style.transform = 'translate(-9999px,0)'; }
  }
  /** 'merged' mode: a hit on the same target within 0.4 s adds into its live number (fixed pool, no allocation). */
  function mergeNumber(target, amt, cls) {
    if (!target) return false;
    for (let i = 0; i < DMG_POOL; i++) {
      const n = nums[i];
      if (!n.alive || n.tgt !== target || n.age > MERGE_SEC || n.cls !== cls) continue;
      n.sum += amt; n.age = 0; n.el.textContent = cls === 'aw-num-crit' ? n.sum + '!' : String(n.sum);
      return true;
    }
    return false;
  }
  function spawnNumber(text, point, cls, color, opts = {}) {
    if (liveNumbers() >= NUM_VISIBLE) retireOldest();
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
    // big numbers are capped: with 4+ big / crit / reaction numbers on screen, further ones are drawn normal size
    if (cls && /aw-num-(big|crit|rx)/.test(cls)) {
      let big = 0;
      for (let i = 0; i < DMG_POOL; i++) { const o = nums[i]; if (o !== n && o.alive && o.big) big++; }
      if (big >= 4) { cls = cls.replace(/aw-num-big/, '').trim(); n.scale *= big >= 6 ? 0.8 : 0.9; }
    }
    n.big = !!(cls && /aw-num-(big|crit|rx)/.test(cls));
    // estimated box (no reflow): ~0.6 em per glyph
    const fpx = !cls ? 20 : /aw-num-(big|crit)/.test(cls) ? 24 : /aw-num-(rx|player)/.test(cls) ? 22 : /aw-num-dot/.test(cls) ? 16 : 22;
    n.w = Math.max(fpx, String(text).length * fpx * 0.6) * n.scale + 6; n.hh = fpx * n.scale + 4;
    if (point && project(point, numScr)) {
      n.spx = numScr.x; n.spy = numScr.y;
      // collision against the live numbers' real boxes: try the spot, then rows above, alternating sides
      n.ox *= 0.4;
      let placed = false;
      for (let t = 0; t < 10 && !placed; t++) {
        const row = (t + 1) >> 1, side = t === 0 ? 0 : (t % 2 ? 1 : -1);
        const cx = numScr.x + side * n.w * 0.55, cy = numScr.y - row * n.hh * 0.9;
        let hit = false;
        for (let i = 0; i < DMG_POOL && !hit; i++) {
          const o = nums[i];
          if (o === n || !o.alive || o.hidden || o.age > 0.7 || o.lx == null) continue;
          if (Math.abs(o.lx - cx) < (o.w + n.w) * 0.5 && Math.abs(o.ly - cy) < (o.hh + n.hh) * 0.5) hit = true;
        }
        if (!hit) { n.sx = cx - numScr.x; n.oy = cy - numScr.y; placed = true; }
      }
      if (!placed) { n.oy = -n.hh * 3; n.sx = 0; }
      n.lx = numScr.x + n.sx; n.ly = numScr.y + n.oy; n.hidden = false;
    } else { n.lx = null; }
    n.el.className = 'aw-num ' + (cls || '');
    n.el.style.setProperty('--nc', color || '#fff');
    n.el.textContent = text;
    n.tgt = opts.target || null; n.sum = opts.sum || 0; n.cls = cls || '';
    return n;
  }
  const numMode = () => { const v = game.settings?.values?.damageNumbers; return v === false || v === 'off' ? 'off' : v === 'all' || v === true ? 'all' : 'merged'; };
  const numbersOn = () => numMode() !== 'off';

  // ------------------------------------------------------------------ enemy bar pool (v3 statuses from combat.STATUS_DEFS)
  const SD = game.combat?.STATUS_DEFS || null;
  const STATUS_KEYS = SD ? Object.keys(SD).filter((k) => !SD[k]?.playerOnly).slice(0, 29) : STATUS_FALLBACK.slice();
  STATUS_KEYS.push('voidShield');                    // pseudo pip (numeric entity.voidShield, CONTRACT §8.1)
  const VOID_BIT = STATUS_KEYS.length - 1;
  const stColor = (k) => (k === 'voidShield' ? '#7a3cff' : SD?.[k]?.color || STATUS_COLORS[k] || '#ccc');
  const stName = (k) => (k === 'voidShield' ? HUD_KO.voidShield : SD?.[k]?.nameKo || STATUS_NAMES[k] || k);
  const stStacks = (k) => !!SD?.[k]?.stack;
  const pipHTML = STATUS_KEYS.map((k) => `<i class="aw-pip${stStacks(k) ? ' stk' : ''}${k === 'voidShield' ? ' void' : ''}" style="--pc:${stColor(k)}" title="${esc(stName(k))}"><b></b></i>`).join('');
  const bars = [];
  for (let i = 0; i < BAR_POOL; i++) {
    const e = worldLayer.appendChild(h('div', 'aw-ebar', `<div class="aw-ebar-next"></div><div class="aw-ebar-name"><span class="aw-ebar-weak"></span><span class="aw-ebar-nm"></span></div><div class="aw-ebar-track"><div class="aw-bar-lag"></div><div class="aw-bar-fill"></div><div class="aw-ebar-void"></div></div><div class="aw-ebar-break"><i></i></div><div class="aw-ebar-pips">${pipHTML}<em class="aw-pip-more"></em></div>`));
    e.style.display = 'none';
    const pp = [...e.querySelectorAll('.aw-pip')];
    bars.push({
      el: e, name: e.querySelector('.aw-ebar-nm'), weak: e.querySelector('.aw-ebar-weak'), fill: e.querySelector('.aw-bar-fill'), lag: e.querySelector('.aw-bar-lag'),
      voidEl: e.querySelector('.aw-ebar-void'), brk: e.querySelector('.aw-ebar-break'), brkFill: e.querySelector('.aw-ebar-break i'), next: e.querySelector('.aw-ebar-next'),
      pips: pp, digits: pp.map((p) => p.firstChild), stk: new Array(pp.length).fill(-1), more: e.querySelector('.aw-pip-more'), moreN: 0, weakOn: false, fq: -1, lq: -1, op: '',
      ent: null, shown: false, lagV: 1, pipState: 0, brkV: -1, voidV: -1, hasBrk: null, broken: null, nextTxt: '', rxPip: -1,
    });
  }
  const lastHit = new WeakMap(); // entity -> realTime of last damage
  /** weak (e.weakness), resist (e.resist mul < 1) and immune icons for enemy / boss bars. */
  function weakIcons(e, size) {
    let s = '';
    const wk = e.weakness ? [].concat(e.weakness) : [];
    for (let i = 0; i < wk.length && i < 3; i++) s += `<i class="aw-wk weak">${elementSVG(wk[i], size)}</i>`;
    const rs = e.resist || {};
    let n = 0;
    for (const k in rs) if (rs[k] < 1 && n < 2) { n++; s += `<i class="aw-wk res">${elementSVG(k, size)}</i>`; }
    const im = e.immune || [];
    for (let i = 0; i < im.length && i < 2; i++) s += `<i class="aw-wk imm">${elementSVG(im[i], size)}</i>`;
    return s;
  }
  const barLag = new WeakMap();
  // "다음 타격" preview (10 Hz): the locked target + attuned element → combat.previewReaction
  const nextHit = { target: null, id: '', name: '', color: '', pip: -1 };
  function auraPipFor(rxId, target) {
    const defs = game.combat?.REACTION_DEFS; const st = target?.statuses;
    if (!defs || !st) return -1;
    for (const r of defs) {
      if (r.id !== rxId) continue;
      const aura = r.match?.aura; if (!aura) continue;
      for (const a of aura) if (st[a]) { const k = STATUS_KEYS.indexOf(a); if (k >= 0) return k; }
    }
    return -1;
  }
  function updateNextHit(target) {
    const C = game.combat;
    let att = null;
    try { att = game.skills?.attuned || game.activeSkills?.()?.getHudState?.()?.attuned || null; } catch (_) { att = null; }
    let r = null;
    if (target && att && C?.previewReaction) { try { r = C.previewReaction(target, att); } catch (_) { r = null; } }
    nextHit.target = r ? target : null;
    nextHit.id = r?.id || ''; nextHit.name = r?.nameKo || r?.name || '';
    const famC = C?.FAMILIES?.[r?.family]?.color || FAMILIES_FALLBACK[r?.family]?.color || '#ffd65a';
    nextHit.color = famC;
    nextHit.pip = r ? auraPipFor(r.id, target) : -1;
  }

  // ------------------------------------------------------------------ toasts (+ queued tutorial toasts)
  // anchored just above the real vitals panel (3-bar resolve classes, the XP row and the large-screen scale make it
  // taller than the fixed CSS offset assumed), re-measured when a toast appears and twice a second
  let toastPlaceT = 0;
  let toastPlaced = false;
  addEventListener('resize', () => { toastPlaced = false; });
  function placeToasts() {
    if (toastPlaced) return;
    try {
      const rr = root.getBoundingClientRect(), vr = vitals.getBoundingClientRect();
      if (!(vr.height > 0) || !(rr.height > 0)) return;
      toastBox.style.bottom = Math.round(rr.bottom - vr.top + 14) + 'px';
      toastBox.style.left = Math.max(12, Math.round(vr.left - rr.left - 4)) + 'px';
      toastPlaced = true;
    } catch (_) { /* */ }
  }
  function toast(text, opts = {}) {
    const dur = opts.duration ?? 4.5;
    const t = h('div', 'aw-toast ' + (opts.kind ? 'aw-toast-' + opts.kind : ''), `<span class="aw-toast-orn"></span><span class="aw-toast-text"></span>`);
    t.querySelector('.aw-toast-text').innerHTML = formatKeys(fmt(text));
    toastBox.appendChild(t);
    if (opts.kind === 'discover') {   // at most 2 reaction-discovery toasts at once
      const ds = toastBox.querySelectorAll('.aw-toast-discover');
      for (let i = 0; i < ds.length - 2; i++) ds[i].remove();
    }
    while (toastBox.children.length > 3) toastBox.firstChild.remove();
    placeToasts();
    setTimeout(() => t.classList.add('out'), dur * 1000);
    setTimeout(() => t.remove(), dur * 1000 + 600);
    return t;
  }
  /** v3 queueTutorial callers → one-slot hints (no timed toast queue, §6.2). */
  function queueTut(text) { if (text) hints.hint('tut:' + text.slice(0, 24), text, { dur: 8, maxShows: 1 }); }
  // ---- §6.9 centre banners / cards queued while any enemy is aggroed (shown 3 s after combat; boss banners excepted)
  const deferQ = [];
  let calmT = 9;
  const aggroed = () => (game.enemies?.aggroCount?.() || 0) > 0;
  const bossShown = () => !!bossBar?.shown;   // the boss block owns the top centre while it is on screen
  function deferBanner(fn) { if (aggroed() || calmT < 3 || bossShown()) { if (deferQ.length < 8) deferQ.push(fn); return false; } fn(); return true; }
  function updateDefer(dt) {
    calmT = aggroed() || bossShown() ? 0 : calmT + dt;
    if (deferQ.length && calmT >= 3 && cardT <= 0.35 && game.state === 'playing' && !game.cinematic?.active) { const f = deferQ.shift(); try { f(); } catch (err) { console.warn('[ui] deferred', err); } }
  }

  let hintT = 0, hintCd = 0;
  function showHint(text, kind = '') {
    if (hintCd > 0) return;
    hint.textContent = text; hint.dataset.kind = kind; hintT = 1.6; hintCd = 0.9;
    restartAnim(hint, 'show');
  }

  // ------------------------------------------------------------------ banners / cards / flashes
  let bannerT = 0, lastBannerId = '', lastBannerTime = -9;
  function showBanner(text, sub, elements, famColor) {
    if (cardT > 0) return false;
    const e0 = elements?.[0], e1 = elements?.[1];
    const a = e0 && e0 !== 'physical' && ELEMENT_CSS[e0] ? ELEMENT_CSS[e0] : famColor || '#ffd27a';
    const b = e1 && e1 !== 'physical' && ELEMENT_CSS[e1] ? ELEMENT_CSS[e1] : a;
    bannerText.textContent = text;
    bannerSub.textContent = sub || '';
    banner.style.setProperty('--bg', `linear-gradient(100deg, ${a} 0%, #fffbe8 48%, ${b} 100%)`);
    banner.style.setProperty('--g1', a);
    banner.style.setProperty('--g2', b);
    banner.style.setProperty('--fc', famColor || a);
    restartAnim(banner, 'show');
    bannerT = 1.6;
    return true;
  }
  let cardT = 0;
  const cardQ = [];
  const cardLog = [];   // last requested cards (shown or queued), for tests / introspection
  function showCard(pre, title, sub, cls = '', dur = 3.2) {
    cardLog.push(pre + '|' + title); if (cardLog.length > 12) cardLog.shift();
    playCard(pre, title, sub, cls, dur);
  }
  function playCard(pre, title, sub, cls, dur) {
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
  let rxNum = null;
  function onReaction(p, isCombo) {
    if (p.isPlayer || p.target?.team === 'player') return;
    const def = rxById(p.id);
    const name = p.name || def?.name || p.id;
    const els = p.elements?.length ? p.elements : def?.elements;
    const fm = p.family || def?.family;
    const famColor = game.combat?.FAMILIES?.[fm]?.color || FAMILIES_FALLBACK[fm]?.color || null;
    const now = game.realTime;
    if (p.id === lastBannerId && now - lastBannerTime < 2.0) return;
    lastBannerId = p.id; lastBannerTime = now;
    const famName = game.combat?.FAMILIES?.[fm]?.nameKo || FAMILIES_FALLBACK[fm]?.nameKo;
    if (aggroed()) {
      // one reaction name at a time, small, at the hit point, ≤ 0.6 s (§6.9)
      const pt = p.point || p.target?.object?.position;
      if (pt && numbersOn()) { if (rxNum && rxNum.alive) rxNum.age = rxNum.life; rxNum = spawnNumber(name, v2.copy(pt).setY(pt.y + 1.2), 'aw-num-rxname', famColor || '#ffd65a', { life: 0.6, scale: 0.8, vy: 0.6, spread: 0 }); }
    } else showBanner(name + '!', isCombo ? '원소 융합' : famName ? `원소 반응 · ${famName}` : '원소 반응', els, famColor);
    if (p.id && !seenReactions.has(p.id)) {
      seenReactions.add(p.id);
      deferBanner(() => {
        const t = toast(`새로운 원소 반응 발견! — ${name}`, { duration: 4.2, kind: 'discover' });
        if (els) t.querySelector('.aw-toast-orn').innerHTML = els.filter((e) => e !== 'physical').map((e) => elementSVG(e, 16)).join('');
      });
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
  let hitT = 0;
  function hitMarker(kill) { hitmark.classList.toggle('kill', !!kill); hitT = kill ? 0.32 : 0.16; }

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
      <div class="aw-title-gems">${ALL_ELEMENTS.map((e) => `<span style="--ec:${ELEMENT_CSS[e]}">${elementSVG(e, 20)}</span>`).join('')}</div>
      <h1 class="aw-logo"><span class="aw-logo-text" data-text="아케인 와일즈">아케인 와일즈</span></h1>
      <div class="aw-logo-sub"><i></i>ARCANE WILDS — 원소의 수호자<i></i></div>
      <div class="aw-menu">
        <button class="aw-btn aw-btn-primary aw-btn-continue" data-act="continue">이어하기</button>
        <button class="aw-btn aw-btn-primary aw-btn-start" data-act="start">모험 시작</button>
        <button class="aw-btn" data-act="settings">설정</button>
        <button class="aw-btn" data-act="controls">조작법</button>
      </div>
      <div class="aw-title-foot">원소의 대륙 에테리아 — 다섯이라 배웠던 원소는, 사실 아홉이었다</div>
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
  const btnContinue = title.querySelector('.aw-btn-continue'), btnStart = title.querySelector('.aw-btn-start');
  function syncTitleButtons() {
    let has = false; try { has = !!game.save?.has?.(); } catch (_) { has = false; }
    btnContinue.style.display = has ? '' : 'none';
    btnStart.textContent = has ? '새 게임' : '모험 시작';
    btnStart.classList.toggle('aw-btn-primary', !has);
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
        <button class="aw-btn" data-act="tree">스킬 트리 <kbd>K</kbd></button>
        <button class="aw-btn" data-act="character">캐릭터 <kbd>C</kbd></button>
        <button class="aw-btn" data-act="guide">가이드</button>
        <button class="aw-btn" data-act="grimoire">도감 <kbd>Tab</kbd></button>
        <button class="aw-btn" data-act="settings">설정</button>
        <button class="aw-btn" data-act="controls">조작법</button>
        <button class="aw-btn aw-btn-danger" data-act="restart">처음부터 다시</button>
      </div>
    </div>`));

  const settingsMenu = createSettingsMenu(game, screens, { onClose: () => syncModalLock(), confirm: (t, y, n) => openConfirm(t, y, n), toast });

  const victory = screens.appendChild(h('div', 'aw-screen aw-victory', `
    <div class="aw-victory-rays"></div>
    <div class="aw-panel aw-victory-panel">
      <div class="aw-victory-pre"></div>
      <div class="aw-victory-title">${VICTORY_KO.title}</div>
      <div class="aw-victory-sub">${VICTORY_KO.sub}</div>
      <div class="aw-victory-build"></div>
      <div class="aw-stats"></div>
      <div class="aw-menu aw-menu-row"><button class="aw-btn aw-btn-primary" data-act="epilogue">에필로그 계속</button><button class="aw-btn" data-act="restart">새로운 모험</button></div>
    </div>`));
  const statsBox = victory.querySelector('.aw-stats'), victoryPre = victory.querySelector('.aw-victory-pre'), victoryBuild = victory.querySelector('.aw-victory-build');

  // ------------------------------------------------------------------ v3 menus (modules)
  const sub = {
    anim: restartAnim, toast, fmt: (t, c) => fmt(t, c),
    tip: (id, text, o) => tour.tip(id, text, o),
    confirm: (text, onYes, onNo) => openConfirm(text, onYes, onNo),
    openSkillTree: (el) => api.openSkillTree(el),
    openClassPanel: (o) => api.openClassPanel(o),
    modalClosed: (id) => onModalClosed(id),
    anyModalOpen: () => anyModalOpen(),
    seenReactions: () => seenReactions,
    skillDefs: () => (game.skills && !game.skills.isStub && game.skills.defs?.size ? game.skills.defs : tree.defs()),
  };
  const tree = createSkillTree(game, sub, screens);
  const tour = createTreeTour(game, sub, screens);
  const charSheet = createCharacter(game, sub, screens);
  const codex = createCodex(game, sub, screens);
  const classPanel = createClassPanel(game, sub, screens);
  const gateMenu = createGateMenu(game, sub, screens);
  const confirmBox = createConfirm(game, sub, screens);
  const prompt = createPrompt(game, sub, hud);
  // ------------------------------------------------------------------ v4 friendliness modules (§6)
  const monsters = createMonsters(game, { hud, fx: fxLayer, fmt, canParry: F.canParry, punishSec: F.punishSec, parryText: F.parryText, anim: restartAnim,
    onCardShown: () => hints.hint('codex', HINTS_KO.codex, { until: 'codexOpened', dur: 10 }) });
  codex.setMonsters?.(monsters);
  const guide = createGuide(game, { screens, fmt, canParry: F.canParry, objective: () => currentObjective(), openCodex: () => api.openCodex('mon'), onClose: () => onModalClosed('guide') });
  const recap = createRecap(game, { screens, hud, fmt, canParry: F.canParry, parryText: F.parryText, entryOf: (t) => monsters.entryOf(t), confirm: (t, y, n) => openConfirm(t, y, n), anim: restartAnim,
    actions: {
      respawn: () => doRespawn(),
      assist: () => { settingsMenu.open('assist'); syncModalLock(); },
      codex: () => { codex.open('mon'); syncModalLock(); },
      legend: () => { guide.open('legend'); syncModalLock(); },
    } });
  const newGame = createNewGame(game, { screens, fmt, onStart: (o) => startGame({ clearSave: true, ...o }), onClose: () => syncModalLock() });
  function currentObjective() {
    let o = null; try { o = game.story?.getObjective?.() || null; } catch (_) { o = null; }
    return o ? { title: o.title || o.desc || '', how: o.how || o.howKo || '' } : null;
  }

  // ------------------------------------------------------------------ modal registry: lock, pause, Escape cascade
  // order = Escape priority (topmost first)
  const MODALS = [
    { id: 'confirm', isOpen: () => confirmBox.isOpen, close: () => confirmBox.close() },
    { id: 'tour', isOpen: () => tour.isOpen, close: () => tour.close() },
    { id: 'settings', isOpen: () => settingsMenu.isOpen, close: () => settingsMenu.close() },
    { id: 'newgame', isOpen: () => newGame.isOpen, close: () => newGame.close() },
    { id: 'guide', isOpen: () => guide.isOpen, close: () => guide.close(), pauses: true, menu: true },
    { id: 'controls', isOpen: () => controls.classList.contains('show'), close: () => closeControls() },
    { id: 'gate', isOpen: () => gateMenu.isOpen, close: () => gateMenu.close(), pauses: true },
    { id: 'class', isOpen: () => classPanel.isOpen, close: () => classPanel.close(), pauses: true, keep: true },
    { id: 'tree', isOpen: () => tree.isOpen, close: () => closeTree(), pauses: true, menu: true },
    { id: 'character', isOpen: () => charSheet.isOpen, close: () => charSheet.close(), pauses: true, menu: true },
    { id: 'codex', isOpen: () => codex.isOpen, close: () => codex.close(), pauses: true, menu: true },
  ];
  const anyModalOpen = () => MODALS.some((m) => m.isOpen());
  let pausedByMenu = false, treeOpenOverride = false;
  function syncModalLock() {
    const open = anyModalOpen();
    const subOpen = MODALS.some((m) => m.isOpen() && m.id !== 'confirm');
    pause.classList.toggle('show', game.state === 'paused' && !subOpen && !confirmBox.isOpen);
    try { if (open) game.input?.lock?.('menu'); else game.input?.unlock?.('menu'); } catch (_) { /* */ }
    root.classList.toggle('aw-menu-open', open);
  }
  /** Open a pausing menu: closes the other K/C/Tab menus, pauses gameplay (resumed when the last menu closes). */
  function openMenu(id, fn) {
    for (const m of MODALS) if (m.menu && m.id !== id && m.isOpen()) m.close();
    if (game.state === 'playing') { pausedByMenu = true; game.pause(); }
    fn();
    game.audio?.play?.('ui_select');
    syncModalLock();
  }
  function onModalClosed(id) {
    if (id === 'class' || id === 'gate') { try { game.events.emit('altarLeave', { from: id }); } catch (_) { /* */ } }
    syncModalLock();
    if (pausedByMenu && !MODALS.some((m) => m.pauses && m.isOpen())) {
      pausedByMenu = false;
      if (game.state === 'paused') game.resume();
    }
  }
  function closeTree() {
    if (!tree.isOpen) return;
    tree.close(); tour.close();
    try { game.events.emit('treeClosed', {}); } catch (_) { /* */ }
    onModalClosed('tree');
  }
  function openConfirm(text, onYes, onNo) { confirmBox.open(text, onYes, onNo); syncModalLock(); }
  function openControls() { controls.classList.add('show'); syncModalLock(); }
  function closeControls() { controls.classList.remove('show'); syncModalLock(); }
  const canOpenMenus = () => (game.state === 'playing' || game.state === 'paused') && !game.cinematic?.active;

  // button wiring
  screens.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    game.audio?.play?.('ui_click');
    const act = b.dataset.act;
    if (act === 'start') { newGame.open(); syncModalLock(); }
    else if (act === 'guide') { guide.open(); syncModalLock(); }
    else if (act === 'continue') continueGame();
    else if (act === 'controls') openControls();
    else if (act === 'closeControls') closeControls();
    else if (act === 'settings') { settingsMenu.open(); syncModalLock(); }
    else if (act === 'resume') { closeControls(); settingsMenu.close(); game.resume(); }
    else if (act === 'restart') game.restart();
    else if (act === 'epilogue') { victory.classList.remove('show'); if (!game.story?.continueEpilogue?.()) game.setState?.('playing'); }
    else if (act === 'respawn') doRespawn();
    else if (act === 'grimoire') api.openCodex();
    else if (act === 'tree') api.openSkillTree();
    else if (act === 'character') api.openCharacter();
  });
  screens.addEventListener('mouseover', (e) => {
    const b = e.target.closest('.aw-btn');
    if (b && b !== screens._hov) { screens._hov = b; game.audio?.play?.('ui_select', { volume: 0.4 }); }
  });

  function startGame(opts = {}) {
    if (game.state !== 'title') return;
    closeControls(); settingsMenu.close(); newGame.close();
    try {
      if (opts.difficulty) game.settings?.set?.('difficulty', opts.difficulty);
      if (opts.introShort != null) game.settings?.set?.('introShort', !!opts.introShort);
      if (opts.difficulty === 'story') game.settings?.set?.('autoAllocate', true);
    } catch (_) { /* */ }
    title.classList.add('leaving');
    try { if (game.newGame) game.newGame(opts); else game.start(); } catch (err) { console.error('[ui] newGame', err); }
  }
  function continueGame() {
    if (game.state !== 'title' || !game.continueGame) return;
    closeControls(); settingsMenu.close();
    title.classList.add('leaving');
    try { game.continueGame(); } catch (err) { console.error('[ui] continueGame', err); }
  }
  function doRespawn() {
    if (game.state !== 'dead' && game.player?.entity?.alive !== false) return;
    try { game.player?.respawn?.(); } catch (err) { console.warn('[ui] respawn', err); }
  }

  // ------------------------------------------------------------------ state handling
  let hudOn = null;
  function applyState(s) {
    root.dataset.state = s;
    title.classList.toggle('show', s === 'title');
    if (s === 'title') syncTitleButtons(); else title.classList.remove('leaving');
    if (s === 'paused') {
      const t = objText.textContent;
      pause.querySelector('.aw-pause-obj').textContent = t ? '현재 목표 — ' + t : '';
    }
    if (s !== 'title' && s !== 'paused') { closeControls(); settingsMenu.close(); }
    // menus close when gameplay leaves playing/paused (the class panel survives dialogue: story opens it from a talk)
    if (s !== 'playing' && s !== 'paused') {
      pausedByMenu = false;
      for (const m of MODALS) if (m.pauses && m.isOpen() && !(m.keep && (s === 'dialogue' || s === 'cutscene'))) m.close();
      if (s !== 'dialogue' && s !== 'cutscene' && confirmBox.isOpen) confirmBox.close();
    }
    syncModalLock();
    if (s === 'dead') recap.show();
    if (s === 'playing') { recap.hide(); victory.classList.remove('show'); relock.classList.remove('on'); }
    if (s === 'victory') showVictory();
    // the 가이드 opens automatically at the first pause of a save (§6.4)
    if (s === 'paused' && !hints.flag('guideAuto') && !anyModalOpen() && (!game.isTest || /[?&]guideAuto=1/.test(location.search))) { hints.flag('guideAuto', 1); later(0.05, () => { if (game.state === 'paused' && !anyModalOpen()) { guide.open('legend'); syncModalLock(); } }); }
  }
  let victoryStats = null, finalName = '';
  function showVictory() {
    const st = victoryStats || {};
    const total = reactions().length;
    const kills = st.kills ?? game.enemies?.kills ?? 0;
    const rx = st.reactions ?? game.combat?.discovered?.size ?? seenReactions.size;
    const time = st.timeSec ?? playTime;
    const P = prog();
    const cd = CLASS_DEFS[P?.cls];
    // build summary: top 3 trees by points
    const top = ALL_ELEMENTS.map((el) => [el, P?.pointsIn?.(el, { forGates: false }) || 0]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    victoryPre.textContent = VICTORY_KO.pre(finalName);
    victoryBuild.innerHTML = top.map(([el, pts]) => `<span class="aw-vb" style="--ec:${elCss(el)}">${elementSVG(el, 16)}${esc(elName(el))} <b>${pts}</b> <em>${esc(MASTERY_KO[P?.mastery?.(el)?.rank] || '')}</em></span>`).join('');
    statsBox.innerHTML = `
      <div class="aw-stat"><div class="aw-stat-v">${P?.level ?? 1}</div><div class="aw-stat-k">${VICTORY_KO.level}</div></div>
      <div class="aw-stat"><div class="aw-stat-v aw-stat-s">${esc(cd?.nameKo || '-')}</div><div class="aw-stat-k">${VICTORY_KO.cls}</div></div>
      <div class="aw-stat"><div class="aw-stat-v">${rx}<small> / ${total || '-'}</small></div><div class="aw-stat-k">${VICTORY_KO.rx}</div></div>
      <div class="aw-stat"><div class="aw-stat-v">${kills}</div><div class="aw-stat-k">${VICTORY_KO.kills}</div></div>
      <div class="aw-stat"><div class="aw-stat-v aw-stat-s">${fmtTime(time)}</div><div class="aw-stat-k">${VICTORY_KO.time}</div></div>
      <div class="aw-stat"><div class="aw-stat-v">${Math.max(maxCombo, st.maxCombo || 0)}</div><div class="aw-stat-k">${VICTORY_KO.combo}</div></div>`;
    victory.classList.add('show');
    try { game.input.exitLock?.(); } catch (_) { /* */ }
  }

  // ------------------------------------------------------------------ objective / markers (4 Hz)
  let objKey = '', objTargetRef = null;
  const objTarget = new THREE.Vector3();
  function bossLabel(o) { return o?.bossName || o?.boss?.name || bossBar.info?.name || BOSS_KO.fallbackName; }
  function fallbackObjective() {
    const o = game.enemies?.getObjective?.();
    if (!o) return null;
    if (o.title || o.desc) return { title: o.title, desc: o.desc, progress: o.progress, _o: o };
    if (o.phase === 'camps') return { title: '마물 토벌', desc: '평원의 마물 거점 소탕', progress: { cur: o.campsCleared, max: o.campsTotal }, _o: o };
    if (o.phase === 'boss') return { title: bossLabel(o), desc: `${bossLabel(o)}을(를) 쓰러뜨려라`, _o: o };
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
    const key = (o.title || '') + '|' + (o.desc || '') + '|' + (pr ? pr.cur + '/' + pr.max : '') + '|' + (o.how || '');
    if (key !== objKey) {
      const changed = objKey !== '' && objKey.split('|')[1] !== (o.desc || '');
      objKey = key;
      objTitle.textContent = o.title || '목표';
      objText.textContent = fmt(o.desc || '');
      const hw = o.how ? fmt(o.how) : '';
      objHow.textContent = hw; objHow.style.display = hw ? '' : 'none';
      objProg.style.display = pr ? '' : 'none';
      if (pr) { objProgBar.style.transform = `scaleX(${clamp(pr.cur / pr.max, 0, 1).toFixed(3)})`; objProgTxt.textContent = `${pr.cur} / ${pr.max}`; }
      if (changed) restartAnim(objective, 'flash');
    }
    objTargetRef = o.marker || null;
    if (objTargetRef) objTarget.copy(objTargetRef);

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
      if (bp && eo?.phase !== 'done') setMarker(n++, bp, 'boss', bossLabel(eo));
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
  let killPos = null;
  const killV = new THREE.Vector3();
  ev.on('damage', (p) => {
    if (!p) return;
    const amt = Math.round(p.amount || 0);
    if (p.target) lastHit.set(p.target, game.realTime);
    if (p.target?.isProp) return;
    if (amt <= 0 && !p.reaction) return;
    const point = p.point || p.target?.object?.position;
    if (!point) return;
    if (p.isPlayer) {
      if (numbersOn()) spawnNumber('-' + amt, v2.copy(point).setY(point.y + 0.3), 'aw-num-player', '#ff5d6a', { life: 1.0, vy: 0.9, spread: 30 });
      return;
    }
    if (p.killed) { killV.copy(point); killPos = killV; }
    if (numbersOn()) {
      const color = ELEMENT_CSS[p.element] || '#ffffff';
      const merged = numMode() === 'merged';
      const isDot = !!(p.dot || p.isDot);
      if (merged && !p.reaction && mergeNumber(p.target, amt, p.crit ? 'aw-num-crit' : isDot ? 'aw-num-dot' : amt >= 80 ? 'aw-num-big' : '')) { /* merged */ }
      else if (p.reaction) {
        // the reaction NAME is the one small aw-num-rxname label (reaction handler, §6.9); the hit only shows its number,
        // never a 40 px "57 확산·오로라" banner across the enemies at screen centre
        spawnNumber(String(amt), point, 'aw-num-rx', '#ffd65a', { life: 0.8, scale: 0.85, vy: 1.2, target: p.target, sum: amt });
      } else if (p.crit) {
        spawnNumber(amt + '!', point, 'aw-num-crit', color, { life: 0.9, scale: 0.9, vy: 1.3, target: p.target, sum: amt });
      } else if (isDot) {
        spawnNumber(String(amt), point, 'aw-num-dot', '#b8bcc8', { life: 0.8, scale: 0.7, vy: 1.0, spread: 60, target: p.target, sum: amt });
      } else {
        spawnNumber(String(amt), point, amt >= 80 ? 'aw-num-big' : '', color, { life: 0.8 + Math.min(0.3, amt / 300), scale: 0.8 + Math.min(0.25, amt / 400), target: p.target, sum: amt });
      }
    }
    if (!p.dot && !p.isDot) { bumpCombo(); hitMarker(p.killed); }
  });
  ev.on('kill', (p) => { const pt = p?.target?.object?.position || p?.point; if (pt) { killV.copy(pt); killPos = killV; } });
  let xpSum = 0, xpT = 0;
  ev.on('xpGained', (p) => {
    const n = Math.round(p?.amount || 0); if (n <= 0) return;
    xpSum = (xpT > 0 ? xpSum : 0) + n; xpT = 2.2;
    xpCorner.textContent = HUD4_KO.xpTotal(xpSum); xpCorner.classList.add('on');
    killPos = null;
    xpDirty = true;
  });
  ev.on('levelUp', (p) => {
    const L = p?.level ?? prog()?.level ?? 1;
    // 자동 배분 (§6.6): settings.autoAllocate (on by default for 이야기)
    if (game.settings?.values?.autoAllocate || game.settings?.values?.difficulty === 'story') later(0.2, () => { try { autoAllocate(game, toast); } catch (err) { console.warn('[ui] autoAllocate', err); } });
    deferBanner(() => showCard(HUD_KO.levelUpPre, HUD_KO.levelUpTitle(L), HUD_KO.levelUpSub(p?.pointsGained ?? 1), 'aw-card-level', 3.0));
    game.audio?.play?.('level_up');
    edge('awaken');
    const pp = game.player?.object?.position;
    if (pp && project(v2.copy(pp).setY(pp.y + 1), scr)) { lvBurst.style.left = scr.x.toFixed(0) + 'px'; lvBurst.style.top = scr.y.toFixed(0) + 'px'; }
    else { lvBurst.style.left = '50%'; lvBurst.style.top = '60%'; }
    restartAnim(lvBurst, 'show');
    restartAnim(lvBadge, 'pop');
    xpDirty = true;
  });
  for (const n of ['pointsChanged', 'skillLearned', 'skillUnlearned', 'respec', 'classChosen']) ev.on(n, () => { xpDirty = true; });
  ev.on('reaction', (p) => onReaction(p || {}, false));
  ev.on('zoneCombo', (p) => onReaction(p || {}, true));
  ev.on('playerDeath', () => { comboCount = 0; combo.classList.remove('on'); });
  ev.on('playerRespawn', () => { recap.hide(); });
  const FAIL = { mana: ['마력이 부족합니다', vMp], resource: [null, vMp], gauge: ['각성 게이지가 부족합니다', null], stamina: ['스태미나가 부족합니다', vSt] };
  const failAt = {};
  function onFail(p) {
    const f = FAIL[p?.reason]; if (!f) return;
    const txt = f[0] || (fam() === 'melee' ? '투지가 부족합니다' : '마력이 부족합니다');
    if (f[1]) restartAnim(f[1].el, 'shake');
    // the text at most once per 10 s; the bar pulse every time (§6.9)
    const now = game.realTime || 0;
    if (now - (failAt[p.reason] ?? -99) < 10) return;
    failAt[p.reason] = now;
    showHint(txt);
  }
  ev.on('spellFail', onFail);
  ev.on('skillFail', onFail);
  ev.on('campCleared', (p) => {
    const total = p?.total ?? 3, idx = (p?.index ?? 0) + 1;
    const cleared = game.enemies?.getObjective?.()?.campsCleared ?? idx;
    deferBanner(() => showCard('마물 거점', '거점 소탕!', `${cleared} / ${total}`, 'aw-card-camp', 3.0));
  });
  ev.on('bossSpawn', (p) => {
    const nm = p?.name || p?.boss?.name || BOSS_KO.fallbackName;
    later(0.7, () => showCard(p?.title || BOSS_KO.spawnPre, nm, p?.sub || '', 'aw-card-boss', 4.2));
  });
  ev.on('bossDefeated', (p) => {
    const nm = p?.name || p?.boss?.name || BOSS_KO.fallbackName;
    if (p?.final) finalName = nm;
    showCard(BOSS_KO.defeatPre, nm, p?.final ? BOSS_KO.finalSub : BOSS_KO.defeatSub, 'aw-card-camp', 3.0);
  });
  ev.on('bossPhase', (p) => { if (p?.name) showFlash(p.name, BOSS_KO.phase(p.phase ?? 2), 'phase', 1.4, 2); });
  ev.on('bossCheck', (p) => {
    const nm = HUD_KO.check[p?.kind] || '';
    if (p?.state === 'start') showFlash(nm, p.duration ? `${Math.round(p.duration)}초` : '', 'check', 1.3, 2);
    else if (p?.state === 'success') showFlash(nm + ' ' + HUD_KO.checkOk, '', 'check', 1.1, 2);
    else if (p?.state === 'fail') showFlash(nm + ' ' + HUD_KO.checkFail, '', 'break', 1.1, 2);
  });
  ev.on('lockStripped', (p) => showHint(HUD_KO.lockStripped + (p?.lock?.element || p?.lock ? ` — ${elName(p.lock?.element || p.lock)}` : '')));
  ev.on('break', (p) => { if (p?.target?.team !== 'player') { showFlash(HUD_KO.broken, HUD_KO.breakSub, 'break', 1.0, 2); } });
  ev.on('bossBroken', () => { showFlash(CALLOUT_KO.broken, CALLOUT_KO.brokenSub, 'break', 1.4, 3); edge('awaken'); try { game.audio?.play?.('break_boss'); } catch (_) { /* */ } });
  // boss attack name under the boss bar for tells ≥ 1 s (§5.5 UI channel)
  let bossAtkFor = null;
  ev.on('tellStart', (p) => {
    const e = p?.enemy;
    if (!e || !(e.isBoss || e === game.enemies?.boss) || !p.nameKo || !((+p.windup || 0) >= 1)) return;
    bossAtkFor = e; bossAtk.textContent = p.nameKo; bossAtk.dataset.tell = p.tell || 'danger'; restartAnim(bossAtk, 'show');
  });
  ev.on('tellEnd', (p) => { if (p?.enemy && p.enemy === bossAtkFor) { bossAtkFor = null; bossAtk.classList.remove('show'); } });
  ev.on('resonance', () => { showFlash(HUD_KO.resonance, HUD_KO.resonanceSub, 'awaken', 1.3, 3); edge('awaken'); });
  // the hotbar's gift gem is the persistent prompt; the toast only introduces the key once (no duplicate prompt)
  let giftToasted = false;
  ev.on('giftReady', () => { if (giftToasted || document.querySelector('.aw-hb3-gift')) { giftToasted = true; return; } giftToasted = true; toast(`V: ${HUD_KO.giftPrompt}`, { duration: 4, kind: 'tut' }); });
  ev.on('victory', (p) => { victoryStats = p?.stats || null; if (game.state === 'victory') showVictory(); });
  ev.on('pickup', (p) => {
    const pp = game.player?.object?.position;
    if (!pp) return;
    v2.copy(pp).setY(pp.y + 2);
    if (p?.kind === 'heart') spawnNumber(`+${p.amount ?? ''} 생명력`, v2, 'aw-num-pick', '#ff8aa0', { life: 1.2, scale: 0.85 });
    else if (p?.kind === 'mana') spawnNumber(`+${p.amount ?? ''} 마나`, v2, 'aw-num-pick', '#7cc4ff', { life: 1.2, scale: 0.85 });
  });
  ev.on('elementChanged', () => restartAnim(elNameEl, 'pop'));
  ev.on('hpRegenStart', () => restartAnim(vHp.el, 'regenstart'));

  // quests
  ev.on('questStart', (p) => {
    if (!p?.title) return;
    later(0.3, () => {
      let cur = null; try { cur = game.story?.getObjective?.()?.title; } catch (_) { /* */ }
      // never on top of the boss bar / boss intro: a quest card raised during a boss fight waits for the end (§6.9)
      if (cur == null || cur === p.title) { const f = () => showCard('새로운 임무', p.title, '', 'aw-card-quest', 3.4); if (bossShown()) deferBanner(f); else f(); }
    });
  });
  ev.on('questComplete', (p) => { if (p?.title) showCard('임무 완료', p.title, '', 'aw-card-done', 3.0); });
  ev.on('classChosen', () => { skillSig = ''; defSig = ''; });
  // defense & feel (no class literals: family / player kit names)
  ev.on('parry', (p) => {
    const f = p?.cls ? familyOf(p.cls) : fam();
    const [a, b] = p?.kit === 'barrier' ? [CALLOUT_KO.barrier, ''] : (DEF_KO.parry[f] || DEF_KO.parry.caster);
    showFlash(a, b, 'parry', 0.95, 3);
    edge('parry');
    restartAnim(defBlock, 'pulse');
  });
  ev.on('perfectDodge', () => { showFlash(CALLOUT_KO.dodge, CALLOUT_KO.dodgeSub, 'dodge', 1.1, 3); edge('dodge'); });
  ev.on('dodgeRejected', () => { try { game.audio?.play?.('dodge_rejected', { volume: 0.7 }); } catch (_) { /* */ } restartAnim(defDash, 'shake'); });
  ev.on('blocked', (p) => {
    if (p?.target?.team !== 'player' || p.parried || p.perfect || p.dodged) return;
    showHint(DEF_KO.block[fam()] || DEF_KO.block.caster, 'block');
    restartAnim(defBlock, 'pulse');
  });
  ev.on('guardBreak', () => { showFlash('가드 붕괴!', '', 'break', 0.8, 2); restartAnim(vSt.el, 'shake'); });
  let updraftHintAt = -99;
  ev.on('updraftEnter', () => {
    if (game.realTime - updraftHintAt < 5) return;
    updraftHintAt = game.realTime;
    showFlash('상승 기류!', fmt('{jumpKey}를 꾹 눌러 활공'), 'updraft', 1.2, 1);
  });
  ev.on('awakeningReady', () => {
    deferBanner(() => showCard('각성', '원소의 힘이 깨어났다', 'R 필살기 발동 가능', 'aw-card-awaken', 2.6));
    edge('awaken');
    game.audio?.play?.('awakening_ready');
  });
  ev.on('finisherStart', () => { finPrompt.classList.remove('on'); hb3.finisherStarted(); });
  ev.on('gateTravel', () => { if (gateMenu.isOpen) gateMenu.close(); });

  // pause on Escape / lock loss, relock on canvas click
  let lockLostAt = -9, wasLocked = false;
  document.addEventListener('pointerlockchange', () => {
    const locked = !!document.pointerLockElement;
    if (!locked && wasLocked && game.state === 'playing' && !game.isTest && !anyModalOpen()) {
      lockLostAt = performance.now();
      game.pause();
    }
    wasLocked = locked;
  });
  const appEl = document.getElementById('app');
  appEl?.addEventListener('mousedown', (e) => {
    relock.classList.remove('on');
    if (game.state === 'playing' && !game.input.locked && !game.isTest && !anyModalOpen()) {
      game.input.requestLock();
      e.stopPropagation();
    }
  });
  ev.on('stateChange', (p) => {
    if (game.isTest || p?.state !== 'playing' || (p.prev !== 'dialogue' && p.prev !== 'cutscene')) return;
    setTimeout(() => { if (game.state === 'playing' && !game.input.locked && !game.cinematic?.active && !anyModalOpen()) relock.classList.add('on'); }, 450);
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
    const treeObj = game.world?.worldTree;
    if (treeObj?.position) camLook.copy(treeObj.position).setY(treeObj.position.y + (treeObj.height || 60) * 0.45);
    else {
      let ty = 0;
      try { ty = game.world.getHeight?.(sp.x, sp.z - 120) ?? 0; } catch (_) { /* */ }
      camLook.set(sp.x, ty + 10, sp.z - 120);
    }
    camLook.x += Math.sin(t * 0.8) * 10;
    camera.lookAt(camLook);
  }

  // ------------------------------------------------------------------ tutorial state
  let tutStarted = false, dummyHintDone = false, dummyT = 0, playTime = 0, maxCombo = 0, unspentT = 0;

  // ------------------------------------------------------------------ per-frame caches
  let stamVis = 0, stamLast = -1, chargeVis = 0, hurtA = 0, lastEl = '', lastTarget = null;
  let objTimer = 0, skillTimer = 0, hintTimer = 0, fpsTimer = 0, fpsShown = null, fullTick = true;
  let skillSig = '', hotbarShown = null, hb3Shown = null, defShown = null, defSig = '', lockSig = '', finReady = null;
  let lastAwk = -1, resShown = '', famShown = '', xpDirty = true, lvShown = -1, xpQ = -1, ptsShown = -1, regenQ = -1, regenOn = null;
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

  function updateProgressHud(full) {
    if (!full && !xpDirty) return;
    const P = prog(); if (!P) return;
    const L = P.level || 1;
    if (L !== lvShown) { lvShown = L; lvBadge.textContent = String(L); }
    const need = P.xpToNext?.() || 0;
    const q = need > 0 ? Math.round(clamp((P.xp || 0) / need, 0, 1) * 200) / 200 : 0;
    if (q !== xpQ) { xpQ = q; xpFill.style.transform = `scaleX(${q})`; xpTxt.textContent = need ? `${Math.floor(P.xp || 0)} / ${need}` : ''; }
    const pts = P.chosen ? (P.points ?? 0) : 0;
    if (pts !== ptsShown) { ptsShown = pts; ptPipTxt.textContent = HUD_KO.points(pts); ptPip.classList.toggle('on', pts > 0); if (pts > 0) restartAnim(ptPip, 'pop'); }
    xpDirty = false;
  }

  function updateVitals(dt, full) {
    const Pl = game.player;
    if (!Pl) return;
    const ent = Pl.entity;
    const hp = Math.max(0, ent?.hp ?? Pl.hp ?? 0), maxHp = Pl.maxHp ?? ent?.maxHp ?? 100;
    const hf = updateVital(vHp, hp, maxHp, dt, 0.6, 0.01);
    vHp.el.classList.toggle('low', hf < 0.3);
    const f = fam();
    if (f !== famShown) { famShown = f; vitals.dataset.fam = f; hud.dataset.fam = f; }
    const res = Pl.resource || (f === 'melee' ? 'resolve' : 'mp');
    if (res !== resShown) { resShown = res; vitals.dataset.res = res; hud.dataset.res = res; resLbl.textContent = RES_KO[res] || ''; vMp.lastMax = -1; }
    if (res === 'resolve') updateVital(vMp, Math.max(0, Pl.resolve ?? 0), Pl.maxResolve ?? 100, dt, 0.8, 0.05);
    else updateVital(vMp, Math.max(0, Pl.mp ?? 0), Pl.maxMp ?? 100, dt, 0.8, 0.05);
    const st = Pl.stamina ?? 100, stMax = Pl.maxStamina ?? 100, sf = clamp(st / stMax, 0, 1);
    const melee = f === 'melee';
    if (melee) { updateVital(vSt, Math.max(0, st), stMax, dt, 0.9, 0.05); vSt.el.classList.toggle('low', sf < 0.25); }
    lowVig.classList.toggle('on', hf < 0.3 && hf > 0 && game.state === 'playing');
    // regen strip + shimmer (player.regen: {active, delay, delayLeft, inCombat, rate})
    if (full) {
      const R = Pl.regen;
      const on = !!R?.active;
      if (on !== regenOn) { regenOn = on; vHp.el.classList.toggle('regen', on); }
      const wait = !!R && !on && hp < maxHp && !R.disabled && R.delay > 0;
      const rq = wait ? Math.round(clamp(1 - (R.delayLeft || 0) / R.delay, 0, 1) * 50) / 50 : on ? 1 : 0;
      if (rq !== regenQ) { regenQ = rq; regenFill.style.transform = `scaleX(${rq})`; regenEl.classList.toggle('on', wait || on); regenEl.classList.toggle('full', on); }
    }
    // stamina ring next to the crosshair (casters; melee shows the bar)
    const want = !melee && sf < 0.995 ? 1 : 0;
    const nv = stamVis + (want - stamVis) * Math.min(1, dt * (want ? 10 : 2.5));
    if (Math.abs(sf - stamLast) > 0.002) {
      stamFg.setAttribute('stroke-dashoffset', (ST_C * (1 - sf)).toFixed(2));
      stamSvg.classList.toggle('low', sf < 0.25);
      stamLast = sf;
    }
    if (Math.abs(nv - stamVis) > 0.003 || (nv === 0) !== (stamVis === 0)) { stamVis = nv < 0.003 ? 0 : nv; stamSvg.style.opacity = stamVis.toFixed(3); }

    let target = null;
    try { target = Pl.getAim?.()?.target || null; } catch (_) { /* */ }
    if (target && (target.alive === false || target.isProp)) target = null;
    if (target !== lastTarget) { reticle.classList.toggle('lock', !!target); lastTarget = target; }
    if (target) lastHit.set(target, Math.max(lastHit.get(target) || 0, game.realTime - 4));
  }

  function updateDefense() {
    const Pl = game.player;
    let d = null;
    try { d = Pl?.getDefenseHud?.() || null; } catch (_) { d = null; }
    const show = !!d && !!prog()?.chosen;
    if (show !== defShown) { defShown = show; vitals.classList.toggle('def-on', show); }
    if (!show) return;
    const f = fam();
    const km = game.input?.keymap;
    const kd = km?.label?.('dodge') || 'Q', ke = km?.label?.('defend') || 'E';
    const sig = (d.dodgeName || '') + '|' + (d.defendName || '') + '|' + f + '|' + kd + '|' + ke;
    if (sig !== defSig) {
      defSig = sig;
      defKbdD.textContent = kd; defKbdE.textContent = ke;
      defDashLbl.textContent = d.dodgeName || DEF_KO.dodge[f] || '회피';
      defBlockLbl.textContent = d.defendName || DEF_KO.defend[f] || '방어';
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
      const fr = on ? 1 : i === ch ? clamp(1 - (dash.cooldownFrac ?? 0), 0, 1) : 0;
      const q = Math.round(fr * 40) / 40;
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

  function getHud() {
    let S = null;
    try { S = game.activeSkills ? game.activeSkills() : game.spells; } catch (_) { S = game.spells; }
    try { return S?.getHudState?.() || null; } catch (_) { return null; }
  }

  function updateSkills(dt, full) {
    const pr = prog();
    const hs = getHud();
    const chosen = pr ? !!pr.chosen : true;
    const v3 = hs?.v === 3;
    const show = !!hs && chosen && (hs.slots?.length || 0) > 0;
    const s3 = show && v3, s2 = show && !v3;
    if (s3 !== hb3Shown) { hb3Shown = s3; hb3.el.classList.toggle('on', s3); }
    if (s2 !== hotbarShown) { hotbarShown = s2; hotbar.classList.toggle('on', s2); }
    if (!show) { chargeSvg.style.opacity = '0'; chargeVis = 0; return; }

    // charge ring: per frame (direct feedback)
    const cf = hs.charging ? clamp(hs.chargeFrac || 0, 0, 1) : 0;
    const nv = chargeVis + ((hs.charging ? 1 : 0) - chargeVis) * Math.min(1, dt * 14);
    if (Math.abs(nv - chargeVis) > 0.003) { chargeVis = nv < 0.003 ? 0 : nv; chargeSvg.style.opacity = chargeVis.toFixed(3); }
    if (hs.charging) {
      chargeFg.setAttribute('stroke-dashoffset', (CH_C * (1 - cf)).toFixed(2));
      chargeSvg.classList.toggle('full', cf >= 1);
    }
    if (v3) {
      const el = hs.attuned || hs.element;
      if (el !== lastEl) { lastEl = el; hud.style.setProperty('--el', elCss(el)); }
      hb3.update(hs, dt, full);
      return;
    }
    if (!full) return;
    updateSkillsV2(hs, pr);
  }

  /** v2 HudState renderer (spells/sword getHudState while skills is stubbed). Gems: the 5 classic elements. */
  function updateSkillsV2(hs, pr) {
    const el = hs.element;
    const melee = (hs.family || fam()) === 'melee';
    let kinds = '';
    for (const s of hs.slots) kinds += s.kind[0];
    const sig = (pr?.cls || '') + '|' + (pr?.path || '') + '|' + kinds;
    if (sig !== skillSig) {
      skillSig = sig;
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
      hud.style.setProperty('--el', elCss(el));
      gems.forEach((g, i) => g.classList.toggle('sel', CLASSIC_ELEMENTS[i] === el));
      elNameEl.innerHTML = `<span>${esc(elName(el) || '')}${pr?.isMaster?.() ? '의 대가' : ''}</span>`;
    }
    let ls = '';
    const els = hs.elements || [];
    for (let i = 0; i < CLASSIC_ELEMENTS.length; i++) {
      const e = els.find ? els.find((x) => x.id === CLASSIC_ELEMENTS[i]) : null;
      ls += e && !e.locked ? '1' : '0';
    }
    if (ls !== lockSig) {
      lockSig = ls;
      const n = ls.split('').filter((c) => c === '1').length;
      gems.forEach((g, i) => { g.classList.toggle('locked', ls[i] === '0'); g.querySelector('.aw-gem-key').textContent = n > 1 ? String(i + 1) : ''; });
      gemRow.classList.toggle('single', n <= 1);
    }
    const mp = game.player?.mp ?? 999, st = game.player?.stamina ?? 999;
    const buffOn = !!(hs.support?.active || (melee && game.sword?.buff));
    for (let i = 0; i < hs.slots.length; i++) {
      const d = hs.slots[i];
      const s = slots[d.kind];
      if (!s) continue;
      const nsig = el + '|' + d.name + '|' + (d.awakened ? 1 : 0);
      if (s._sig !== nsig) {
        s._sig = nsig;
        s.ico.innerHTML = spellSVG(el, d.kind === 'support' ? 'heavy' : d.kind === 'finisher' ? 'ultimate' : d.kind, d.kind === 'ultimate' || d.kind === 'finisher' ? 58 : 50)
          + `<span class="aw-slot-kind">${KIND_GLYPH[d.kind] || ''}</span>`;
        const nm = d.name || KIND_LABEL[d.kind];
        const aw = /\s*·\s*각성$/.test(nm);
        s.name.innerHTML = esc(aw ? nm.replace(/\s*·\s*각성$/, '') : nm) + (aw ? '<b class="aw-slot-awk">각성</b>' : '');
        s.key.textContent = KEY_LABEL[d.key] || d.key || KEY_LABEL[KIND_KEY[d.kind]];
        s.root.classList.toggle('awakened', !!d.awakened);
        s._cd = -1; s._cost = null;
        restartAnim(s.root, 'swap');
      }
      let cost = '', costKind = '';
      if (d.kind === 'finisher') { cost = `각성 ${Math.floor(hs.awakening?.value ?? 0)}%`; costKind = 'awk'; }
      else if (!melee && d.mpCost > 0) { cost = String(d.mpCost); costKind = 'mp'; }
      else if (d.staminaCost > 0) { cost = String(d.staminaCost); costKind = 'st'; }
      else if (d.cooldown > 0) { cost = `${Math.round(d.cooldown)}초`; costKind = 'cd'; }
      const ck = costKind + cost;
      if (ck !== s._cost) { s._cost = ck; s.cost.textContent = cost; s.costBox.dataset.k = costKind; }
      const frac = d.cooldown > 0 ? clamp(d.cooldownLeft / d.cooldown, 0, 1) : 0;
      const q = Math.round(frac * 120) / 120;
      if (q !== s._cd) { s._cd = q; s.cd.style.setProperty('--cd', (q * 360).toFixed(1) + 'deg'); s.cd.style.opacity = q > 0 ? '1' : '0'; }
      let txt = d.cooldownLeft > 0.95 ? Math.ceil(d.cooldownLeft).toString() : '';
      const active = d.kind === 'support' && buffOn;
      if (active && hs.support?.timeLeft > 0 && !txt) txt = Math.ceil(hs.support.timeLeft).toString();
      if (txt !== s._cdTxt) { s._cdTxt = txt; s.cdnum.textContent = txt; }
      if (active !== s._act) { s._act = active; s.root.classList.toggle('active', active); }
      const low = d.kind === 'finisher' ? false : melee ? d.staminaCost > 0 && st < d.staminaCost : mp < (d.mpCost || 0);
      if (low !== s._low) { s._low = low; s.root.classList.toggle('nomp', low); }
      const ready = !!d.ready;
      if (ready !== s._ready) { if (ready && s._ready === false && !low) restartAnim(s.root, 'readyflash'); s._ready = ready; }
    }
    slots.heavy.root.classList.toggle('charging', !!hs.charging);
    const aw = hs.awakening;
    if (aw?.enabled && slots.finisher.shown) {
      const val = clamp(aw.value || 0, 0, 100);
      const q = Math.round(val * 2) / 2;
      if (q !== lastAwk) { lastAwk = q; slots.finisher.awkFg?.setAttribute('stroke-dashoffset', (AWK_C * (1 - q / 100)).toFixed(2)); }
      const r = !!aw.ready && !game.spells?.finisherActive;
      if (r !== finReady) { finReady = r; slots.finisher.root.classList.toggle('full', r); finPrompt.classList.toggle('on', r); }
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
          if (d !== m._d) { m._d = d; m.d.textContent = d + 'm'; }
          visMarks.push(m);
        }
      }
      if (vis !== m.vis) { m.vis = vis; m.el.style.display = vis ? '' : 'none'; }
    }
    visMarks.sort((a, b) => a._x - b._x);
    for (let i = 0; i < visMarks.length; i++) {
      const m = visMarks[i];
      const px = i > 0 && m._x - visMarks[i - 1]._px < 38 ? visMarks[i - 1]._px + 38 : m._x;
      if (Math.abs(px - m._px) > 0.25) { m._px = px; m.el.style.transform = `translateX(${px.toFixed(1)}px)`; }
    }
  }

  function updateHUD(dt) {
    skillTimer -= dt;
    const full = skillTimer <= 0;
    fullTick = full;
    if (full) { skillTimer = SKILL_HZ; updateDefense(); }
    updateVitals(dt, full);
    updateProgressHud(full);
    updateSkills(dt, full);
    if (hitT > 0) { hitT -= dt; hitmark.style.opacity = clamp(hitT / 0.12, 0, 1).toFixed(2); }
    else if (hitmark.style.opacity !== '0') hitmark.style.opacity = '0';
    objTimer -= dt;
    if (objTimer <= 0) { objTimer = OBJ_HZ; updateObjective(); }
    hintTimer -= dt;
    if (hintTimer <= 0) { hintTimer = HINT_HZ; updateNextHit(lastTarget); }
    updateCompass();
    bossBar.update(dt, full);
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
      const pop = k < 0.1 ? 0.6 + (k / 0.1) * 0.55 : k < 0.2 ? 1.15 - ((k - 0.1) / 0.1) * 0.15 : 1;
      const s = n.scale * pop;
      const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      n.el.style.opacity = a.toFixed(2);
      n.lx = scr.x + n.sx + n.ox * k; n.ly = scr.y + n.oy;
      n.el.style.transform = `translate(${n.lx.toFixed(1)}px,${n.ly.toFixed(1)}px) translate(-50%,-50%) scale(${s.toFixed(3)})`;
    }
  }

  /** Declutter (no allocation): nearest / focused plates keep their spot, the others are nudged up in 14 px steps;
   *  a plate that still overlaps, or sits beside another plate while not focused, drops its name row. */
  const barOrder = [];
  function declutterBars(n) {
    barOrder.length = 0;
    for (let i = 0; i < n; i++) {
      const b = bars[i]; b.prio = (b.focus ? -1000 : 0) + b.dist;
      let k = barOrder.length; barOrder.push(b);
      while (k > 0 && barOrder[k - 1].prio > b.prio) { barOrder[k] = barOrder[k - 1]; k--; }
      barOrder[k] = b;
    }
    for (let i = 0; i < barOrder.length; i++) {
      const b = barOrder[i];
      const w = 110 * b.sc, hh = 34 * b.sc;
      let y = b.py, crowd = false, ok = false;
      for (let step = 0; step <= 4 && !ok; step++) {
        ok = true;
        for (let j = 0; j < i; j++) {
          const o = barOrder[j];
          const ow = 110 * o.sc, oh = 34 * o.sc;
          const dx = Math.abs(o.px - b.px);
          if (dx < (w + ow) * 0.5 + 8 && Math.abs(o.py - y) < (hh + oh) * 0.5 + 24) crowd = true;
          if (dx < (w + ow) * 0.5 && Math.abs(o.py - y) < (hh + oh) * 0.5) { ok = false; break; }
        }
        if (!ok) y -= 14;
      }
      b.py = y;
      const hideName = !b.focus && (crowd || !ok);
      if (hideName !== b.noName) { b.noName = hideName; b.el.classList.toggle('noname', hideName); }
      b.el.style.transform = `translate(${b.px.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%) scale(${b.sc.toFixed(3)})`;
    }
  }
  function updateBars(dt, full) {
    let bi = 0;
    const now = game.realTime;
    const cam = camera.position;
    const ents = game.entities || [];
    const C = game.combat;
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
        if (!recent && !(e.aggro && damaged) && !(e.aggro && d2 < 18 * 18) && e !== nextHit.target) continue;
        v2.copy(p); v2.y += (e.height || 1.6) + 0.55;
        if (!project(v2, scr)) continue;
        const b = bars[bi++];
        if (b.ent !== e) {
          b.ent = e; b.name.textContent = e.name || '마물';
          b.lagV = barLag.get(e) ?? clamp(e.hp / e.maxHp, 0, 1);
          b.el.classList.toggle('dummy', !!e.isDummy);
          b.el.classList.toggle('elite', !!(e.isElite || e.breakMax));
          b.weak.innerHTML = ''; b.weakOn = false;
          b.brkV = b.voidV = -1; b.hasBrk = null; b.broken = null; b.pipState = -1;
        }
        // weakness / resist icons after the first hit (§6.5)
        if (!b.weakOn && lh !== undefined) { b.weakOn = true; b.weak.innerHTML = weakIcons(e, 12); }
        const f = clamp(e.hp / e.maxHp, 0, 1);
        if (b.lagV > f) b.lagV = Math.max(f, b.lagV - dt * 0.7); else b.lagV = f;
        barLag.set(e, b.lagV);
        const fq = Math.round(f * 400), lq = Math.round(b.lagV * 400);
        if (fq !== b.fq) { b.fq = fq; b.fill.style.transform = `scaleX(${(fq / 400).toFixed(4)})`; }
        if (lq !== b.lq) { b.lq = lq; b.lag.style.transform = `scaleX(${(lq / 400).toFixed(4)})`; }
        if (full || b.pipState < 0) {
          let mask = 0;
          const st = e.statuses;
          if (st) for (let k = 0; k < VOID_BIT; k++) if (st[STATUS_KEYS[k]]) mask |= 1 << k;
          if ((e.voidShield || 0) > 0) mask |= 1 << VOID_BIT;
          if (mask !== b.pipState) {
            b.pipState = mask;
            // top 4 pips + "+N" (§6.9)
            let shownN = 0, extra = 0;
            for (let k = 0; k < STATUS_KEYS.length; k++) {
              const on = !!(mask & (1 << k));
              const vis = on && shownN < 4;
              if (on) { if (vis) shownN++; else extra++; }
              b.pips[k].classList.toggle('on', vis);
            }
            if (extra !== b.moreN) { b.moreN = extra; b.more.textContent = extra ? HUD4_KO.more(extra) : ''; }
          }
          // stack digits (seeded, radiant, corroded, chilled, marked …)
          if (st) for (let k = 0; k < VOID_BIT; k++) {
            if (!(mask & (1 << k)) || !stStacks(STATUS_KEYS[k])) continue;
            const n = st[STATUS_KEYS[k]]?.stacks || 0;
            if (n !== b.stk[k]) { b.stk[k] = n; b.digits[k].textContent = n > 1 ? String(n) : ''; }
          }
          // break gauge / broken / void shield
          const bm = e.breakMax || 0;
          if ((bm > 0) !== b.hasBrk) { b.hasBrk = bm > 0; b.brk.classList.toggle('on', b.hasBrk); }
          if (bm > 0) {
            const q = Math.round(clamp((e.breakValue ?? bm) / bm, 0, 1) * 50) / 50;
            if (q !== b.brkV) { b.brkV = q; b.brkFill.style.transform = `scaleX(${q})`; }
          }
          let br = false; try { br = !!(C?.isBroken?.(e) || e.statuses?.broken); } catch (_) { br = false; }
          if (br !== b.broken) { b.broken = br; b.el.classList.toggle('broken', br); }
          const vq = Math.round(clamp((e.voidShield || 0) / 100, 0, 1) * 50) / 50;
          if (vq !== b.voidV) { b.voidV = vq; b.voidEl.style.transform = `scaleX(${vq})`; }
          // next-hit hint on the locked target
          const isT = e === nextHit.target;
          const txt = isT ? HUD_KO.nextHit(nextHit.name) : '';
          if (txt !== b.nextTxt) { b.nextTxt = txt; b.next.textContent = txt; b.el.classList.toggle('hint', isT); if (isT) b.el.style.setProperty('--hc', nextHit.color); }
          const rp = isT ? nextHit.pip : -1;
          if (rp !== b.rxPip) { if (b.rxPip >= 0) b.pips[b.rxPip].classList.remove('rx'); if (rp >= 0) b.pips[rp].classList.add('rx'); b.rxPip = rp; }
        }
        const dist = Math.sqrt(d2);
        const sc = clamp(1.25 - dist / 45, 0.62, 1.1);
        const fade = recent ? 1 : 0.85;
        const op = (fade * clamp((35 - dist) / 5, 0, 1)).toFixed(2);
        if (op !== b.op) { b.op = op; b.el.style.opacity = op; }
        b.px = scr.x; b.py = scr.y; b.sc = sc; b.dist = dist;
        b.focus = e === nextHit.target || (lh !== undefined && now - lh < 1.5);
        if (!b.shown) { b.shown = true; b.el.style.display = ''; }
      }
    }
    declutterBars(bi);
    for (; bi < BAR_POOL; bi++) {
      const b = bars[bi];
      if (b.shown) { b.shown = false; b.el.style.display = 'none'; b.ent = null; }
    }
  }

  function nearRespec(r) {
    const pp = game.player?.object?.position; const spots = game.world?.respecSpots;
    if (!pp || !Array.isArray(spots)) return false;
    for (const s of spots) { const dx = s.x - pp.x, dz = s.z - pp.z; if (dx * dx + dz * dz < r * r) return true; }
    return false;
  }
  function updateTutorial(dt) {
    if (!prog()?.chosen) return;
    dummyT -= dt;
    if (dummyT > 0) return;
    dummyT = 0.5;
    // unspent points: the action-gated hint (§6.2) — 'unspent' also fires on levelUp
    unspentT -= 0.5;
    if (unspentT <= 0) { unspentT = 2; if ((prog()?.points || 0) > 0 && !game.ui?.skillTreeOpen && nearRespec(30)) hints.hint('unspent', HINTS_KO.unspent, { until: 'skillLearned' }); }
  }

  // ------------------------------------------------------------------ api
  const api = {
    toast,
    showBanner, showCard,
    flash: (text, sub, kind, dur) => showFlash(text, sub, kind, dur, 2),
    /** v4 §6.2: hint(id, textKo, opts) → the one-slot action-gated hint; v3 hint(text) → the short centre hint line. */
    hint(id, textKo, opts) { if (textKo === undefined && opts === undefined) { showHint(id); return true; } return hints.hint(id, textKo, opts); },
    queueTutorial: (text) => queueTut(text),
    fmtKo: (text, ctx) => fmt(text, ctx),
    canParry: () => F.canParry(),
    parryText: (attack, e) => F.parryText(attack, e),
    encounterStrip: (type) => monsters.encounterStrip(type),
    encounterCard: (type) => monsters.encounterCard(type),
    bossBrief: (p) => monsters.bossBrief(p),
    deferBanner: (fn) => deferBanner(fn),
    openGuide(sec) { guide.open(sec); syncModalLock(); return true; },
    closeGuide() { guide.close(); },
    get guideOpen() { return guide.isOpen; },
    /** core gpu.js offers (§2.2): the high-quality offer and the drop-back offer, as a toast with two buttons. */
    qualityOffer(o) {
      const t = toast(o.textKo, { duration: 14, kind: 'offer' });
      const box = t.appendChild(h('span', 'aw-toast-btns', `<button class="aw-btn aw-btn-small" data-o="y">${esc(o.yesKo)}</button><button class="aw-btn aw-btn-small" data-o="n">${esc(o.noKo)}</button>`));
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-o]'); if (!b) return; t.remove(); try { (b.dataset.o === 'y' ? o.accept : o.decline)(); } catch (_) { /* */ } });
      return true;
    },
    runBenchmark: (sec) => settingsMenu.runBenchmark(sec),
    debug: {
      arrows: () => threatUI.debugArrows(),
      hintVisible: () => hints.visible(),
      recap: () => recap.recap(),
      damageNumbers: () => liveNumbers(),
      bannersQueued: () => deferQ.length,
      legendThumbs: () => guide.legendThumbs(),
      hints, monsters, threatUI, settingsMenu, newGame, guide,
    },
    openSettings() { settingsMenu.open(); syncModalLock(); },
    closeSettings() { settingsMenu.close(); },
    get settingsOpen() { return settingsMenu.isOpen; },
    // v2 grimoire names → the codex
    setGrimoire(on) { if (on) api.openCodex(); else codex.close(); },
    get grimoireOpen() { return codex.isOpen; },
    // --- v3 (CONTRACT §18)
    openSkillTree(el) {
      if (!canOpenMenus()) return false;
      openMenu('tree', () => tree.open(el));
      try { game.audio?.play?.('tree_open', { volume: 0.7 }); } catch (_) { /* */ }
      if (!tour.hasSeen('treeTour') && (!game.isTest || /[?&]tour=1/.test(location.search))) { tour.start(); syncModalLock(); }
      return true;
    },
    closeSkillTree() { closeTree(); },
    get skillTreeOpen() { return tree.isOpen || treeOpenOverride; },
    /** Test override only (tools/playtest3/skills.js sets it to exercise the equip rule); never set by game code. */
    set skillTreeOpen(v) { treeOpenOverride = !!v; },
    openCharacter() { if (!canOpenMenus()) return false; openMenu('character', () => charSheet.open()); return true; },
    closeCharacter() { charSheet.close(); },
    get characterOpen() { return charSheet.isOpen; },
    openCodex(page) { if (!canOpenMenus()) return false; openMenu('codex', () => codex.open(page)); hints.done('codex'); try { ev.emit('codexOpened', { page }); } catch (_) { /* */ } return true; },
    closeCodex() { codex.close(); },
    get codexOpen() { return codex.isOpen; },
    openClassPanel(opts = {}) {
      if (game.state === 'playing') { pausedByMenu = true; game.pause(); }
      classPanel.open(opts); syncModalLock(); return true;
    },
    closeClassPanel() { classPanel.close(); },
    get classPanelOpen() { return classPanel.isOpen; },
    openGateMenu(gates, onPick) {
      if (game.state === 'playing') { pausedByMenu = true; game.pause(); }
      gateMenu.open(gates, onPick); syncModalLock(); return true;
    },
    closeGateMenu() { gateMenu.close(); },
    get gateMenuOpen() { return gateMenu.isOpen; },
    confirm(text, onYes, onNo) { openConfirm(text, onYes, onNo); },
    startTreeTour() { tour.start(); syncModalLock(); },
    tip(id, text, opts) { return tour.tip(id, text, opts); },
    serializeTips: () => tour.serialize(),
    deserializeTips: (arr) => tour.deserialize(arr),
    get anyModalOpen() { return anyModalOpen(); },
    // test/introspection helpers (read-only)
    _cardLog: cardLog,
    _parts: { tree, tour, charSheet, codex, classPanel, gateMenu, confirmBox, prompt, hb3, bossBar, hints, monsters, recap, guide, threatUI, newGame },
    init() {
      applyUiScale();
      ev.on('settingsChanged', (p) => { if (!p || p.key === 'uiScale' || p.key === '*') applyUiScale(); });
      applyState(game.state);
    },
    update(dt, realDt) {
      dt = realDt || dt || 0;
      AQ.tick();
      if ((toastPlaceT -= dt) <= 0) { toastPlaceT = 0.5; if (toastBox.children.length) placeToasts(); }
      if (laterT.length) tickLater(dt);
      const s = game.state;
      const R = raw();
      const cine = !!game.cinematic?.active;

      // keys (ungated: UI reads raw input). UI owns K, C, Tab and Esc (CONTRACT §6).
      if (R) {
        const menuOk = (s === 'playing' || s === 'paused') && !cine && !settingsMenu.isOpen && !confirmBox.isOpen && !classPanel.isOpen && !gateMenu.isOpen;
        if (menuOk && !tour.isOpen) {
          if (R.pressed('KeyK')) { if (tree.isOpen) closeTree(); else api.openSkillTree(); }
          else if (R.pressed('KeyC')) { if (charSheet.isOpen) charSheet.close(); else api.openCharacter(); }
          else if (R.pressed('Tab')) { if (codex.isOpen) codex.close(); else api.openCodex(); }
        }
        if (tree.isOpen && !confirmBox.isOpen && !tour.isOpen) tree.handleKeys(R);
        if (confirmBox.isOpen && R.pressed('Enter')) confirmBox.yes();
        if (R.pressed('Escape')) {
          const top = MODALS.find((m) => m.isOpen());
          if (top) top.close();
          else if (s === 'playing' && !cine) game.pause();
          else if (s === 'paused' && performance.now() - lockLostAt > 400) game.resume();
        }
        if (s === 'dead' && !anyModalOpen() && (R.pressed('Space') || R.pressed(game.input?.keymap?.get?.('confirm') || 'Enter'))) doRespawn();
        if (s === 'title' && R.pressed('Enter') && !settingsMenu.isOpen && !newGame.isOpen && !controls.classList.contains('show')) { newGame.open(); syncModalLock(); }
      }

      if (s === 'title') titleCamera(dt);

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
      updateBars(dt, fullTick || !on);
      prompt.update();
      tree.update(dt);
      charSheet.update();

      threatUI.update(dt);
      hints.update(dt);
      monsters.update(dt);
      recap.update(dt);
      updateDefer(dt);
      if (xpT > 0 && (xpT -= dt) <= 0) xpCorner.classList.remove('on');

      if (hintCd > 0) hintCd -= dt;
      if (hintT > 0) { hintT -= dt; if (hintT <= 0) hint.classList.remove('show'); }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) { flashEl.classList.remove('show'); flashPrio = 0; } }
      if (cardT > 0) { cardT -= dt; if (cardT <= 0) bigCard.classList.remove('show'); }
      if (cardT <= 0.35 && cardQ.length && !cine && s !== 'cutscene') { const c = cardQ.shift(); cardT = 0; playCard(...c); }


      const showFps = !!game.settings?.values?.showFps;
      if (showFps !== fpsShown) { fpsShown = showFps; fpsEl.classList.toggle('on', showFps); fpsTimer = 0; }
      if (showFps) {
        fpsTimer -= dt;
        if (fpsTimer <= 0) {
          fpsTimer = 0.25;
          const f = game.fps || 0;
          let rs = null; try { rs = game.quality?.renderSize?.(); } catch (_) { rs = null; }
          fpsEl.textContent = SETTINGS_UI_KO.fps(Math.round(f), game.quality?.level ?? 0, rs?.w || 0, rs?.h || 0);
          fpsEl.dataset.q = f >= 50 ? 'good' : f >= 30 ? 'ok' : 'bad';
        }
      }
    },
  };
  return api;
}
