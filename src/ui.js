// UI module: DOM overlay inside #ui — title, HUD, damage numbers, banners, enemy bars,
// boss bar, compass, grimoire, pause / death / victory screens, toasts.
import * as THREE from 'three';
import { ELEMENTS, ELEMENT_NAMES_KO, clamp } from './core/utils.js';
import {
  ELEMENT_CSS, elementSVG, spellSVG, RETICLE_SVG, STATUS_COLORS, STATUS_NAMES, MARKER_SVG,
} from './ui/icons.js';

const STATUS_KEYS = ['burning', 'frozen', 'wet', 'shocked', 'chilled', 'airborne', 'stunned'];
const KIND_KEYS = { basic: '좌클릭', heavy: '우클릭', ultimate: 'F' };
const KIND_LABEL = { basic: '기본', heavy: '충전', ultimate: '궁극' };
const COMBO_WINDOW = 2.5;
const DMG_POOL = 56, BAR_POOL = 12;

function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function restartAnim(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth; // reflow to restart CSS animation
  node.classList.add(cls);
}
const fmtTime = (s) => {
  s = Math.max(0, Math.round(s || 0));
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}분 ${String(r).padStart(2, '0')}초`;
};

export function createUI(game) {
  const root = document.getElementById('ui') || document.body.appendChild(h('div'));
  root.classList.add('aw-root');
  const camera = game.camera;
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  let W = innerWidth, H = innerHeight;
  addEventListener('resize', () => { W = innerWidth; H = innerHeight; });

  // ------------------------------------------------------------------ layers
  const hurtVig = root.appendChild(h('div', 'aw-vig aw-vig-hurt'));
  const lowVig = root.appendChild(h('div', 'aw-vig aw-vig-low'));
  const worldLayer = root.appendChild(h('div', 'aw-world'));     // enemy bars + damage numbers
  const hud = root.appendChild(h('div', 'aw-hud'));
  const fxLayer = root.appendChild(h('div', 'aw-fx'));           // banners, combo
  const toastBox = root.appendChild(h('div', 'aw-toasts'));
  const screens = root.appendChild(h('div', 'aw-screens'));

  // ------------------------------------------------------------------ HUD: vitals
  const vitals = hud.appendChild(h('div', 'aw-vitals', `
    <div class="aw-vital aw-hp">
      <div class="aw-vital-ico"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 21s-7.5-4.6-9.4-9.6C1.2 7.7 3.6 4 7.2 4c2.1 0 3.6 1.2 4.8 2.8C13.2 5.2 14.7 4 16.8 4c3.6 0 6 3.7 4.6 7.4C19.5 16.4 12 21 12 21z" fill="#ff5d7a" stroke="#ffe0e6" stroke-width="1.2"/><path d="M6.5 8.2c.5-1.2 1.6-1.8 2.6-1.7" stroke="#fff" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".8"/></svg></div>
      <div class="aw-bar"><div class="aw-bar-lag"></div><div class="aw-bar-fill"></div><div class="aw-bar-gloss"></div><div class="aw-bar-ticks"></div></div>
      <div class="aw-vital-num"><b>100</b><span>/100</span></div>
    </div>
    <div class="aw-vital aw-mp">
      <div class="aw-vital-ico"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2 19 12 12 22 5 12z" fill="#4fa0ff" stroke="#dff0ff" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 5.5 9 12h3" stroke="#fff" stroke-width="1.2" fill="none" opacity=".8"/></svg></div>
      <div class="aw-bar"><div class="aw-bar-lag"></div><div class="aw-bar-fill"></div><div class="aw-bar-gloss"></div><div class="aw-bar-ticks"></div></div>
      <div class="aw-vital-num"><b>100</b><span>/100</span></div>
    </div>`));
  const hpEl = vitals.querySelector('.aw-hp'), mpEl = vitals.querySelector('.aw-mp');
  const hpFill = hpEl.querySelector('.aw-bar-fill'), hpLag = hpEl.querySelector('.aw-bar-lag'), hpNum = hpEl.querySelector('b'), hpMax = hpEl.querySelector('span');
  const mpFill = mpEl.querySelector('.aw-bar-fill'), mpLag = mpEl.querySelector('.aw-bar-lag'), mpNum = mpEl.querySelector('b'), mpMax = mpEl.querySelector('span');

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

  // ------------------------------------------------------------------ HUD: hotbar
  const hotbar = hud.appendChild(h('div', 'aw-hotbar'));
  const slotRow = hotbar.appendChild(h('div', 'aw-slots'));
  const gemRow = hotbar.appendChild(h('div', 'aw-gems'));
  const elName = hotbar.appendChild(h('div', 'aw-elname'));
  const gems = ELEMENTS.map((el, i) => {
    const g = gemRow.appendChild(h('div', 'aw-gem', `<div class="aw-gem-face">${elementSVG(el, 26)}</div><div class="aw-gem-key">${i + 1}</div>`));
    g.style.setProperty('--ec', ELEMENT_CSS[el]);
    return g;
  });
  const slots = ['basic', 'heavy', 'ultimate'].map((kind) => {
    const s = slotRow.appendChild(h('div', `aw-slot aw-slot-${kind}`, `
      <div class="aw-slot-ring"><div class="aw-slot-ico"></div><div class="aw-slot-cd"></div><div class="aw-slot-cdnum"></div></div>
      <div class="aw-slot-key">${KIND_KEYS[kind]}</div>
      <div class="aw-slot-name"></div>
      <div class="aw-slot-cost"><i></i><span></span></div>`));
    return {
      root: s, kind, ico: s.querySelector('.aw-slot-ico'), cd: s.querySelector('.aw-slot-cd'), cdnum: s.querySelector('.aw-slot-cdnum'),
      name: s.querySelector('.aw-slot-name'), cost: s.querySelector('.aw-slot-cost span'),
      _el: '', _cd: -1, _ready: null, _low: null, _cdTxt: '',
    };
  });

  // ------------------------------------------------------------------ HUD: objective, compass, boss bar
  const objective = hud.appendChild(h('div', 'aw-objective', `
    <div class="aw-obj-head"><span class="aw-obj-diamond"></span>목표</div>
    <div class="aw-obj-text"></div><div class="aw-obj-sub"></div>`));
  const objText = objective.querySelector('.aw-obj-text'), objSub = objective.querySelector('.aw-obj-sub');

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
  const markers = []; // {el, pos, kind, distEl}

  const bossBar = hud.appendChild(h('div', 'aw-boss', `
    <div class="aw-boss-name"><span class="aw-boss-orn">❖</span><b></b><span class="aw-boss-orn">❖</span></div>
    <div class="aw-boss-bar"><div class="aw-bar-lag"></div><div class="aw-bar-fill"></div><div class="aw-bar-gloss"></div></div>
    <div class="aw-boss-pips"></div>`));
  const bossName = bossBar.querySelector('b'), bossFill = bossBar.querySelector('.aw-bar-fill'), bossLag = bossBar.querySelector('.aw-bar-lag');
  const bossPips = bossBar.querySelector('.aw-boss-pips');

  // small hint under crosshair
  const hint = hud.appendChild(h('div', 'aw-hint'));

  // ------------------------------------------------------------------ banners & combo
  const banner = fxLayer.appendChild(h('div', 'aw-banner', '<div class="aw-banner-glow"></div><div class="aw-banner-text"></div><div class="aw-banner-sub"></div>'));
  const bannerText = banner.querySelector('.aw-banner-text'), bannerSub = banner.querySelector('.aw-banner-sub');
  const bigCard = fxLayer.appendChild(h('div', 'aw-card', '<div class="aw-card-line"></div><div class="aw-card-pre"></div><div class="aw-card-title"></div><div class="aw-card-sub"></div><div class="aw-card-line"></div>'));
  const combo = fxLayer.appendChild(h('div', 'aw-combo', '<div class="aw-combo-num">0</div><div class="aw-combo-lbl">COMBO</div><div class="aw-combo-timer"><i></i></div>'));
  const comboNum = combo.querySelector('.aw-combo-num'), comboTimer = combo.querySelector('.aw-combo-timer i');

  // ------------------------------------------------------------------ damage number pool
  const nums = [];
  for (let i = 0; i < DMG_POOL; i++) {
    const e = worldLayer.appendChild(h('div', 'aw-num'));
    nums.push({ el: e, alive: false, pos: new THREE.Vector3(), age: 0, life: 1, ox: 0, vy: 0, scale: 1, screen: false, sx: 0, sy: 0 });
  }
  let numCursor = 0;
  function spawnNumber(text, point, cls, color, opts = {}) {
    let n = null;
    for (let i = 0; i < DMG_POOL; i++) {
      const c = nums[(numCursor + i) % DMG_POOL];
      if (!c.alive) { n = c; numCursor = (numCursor + i + 1) % DMG_POOL; break; }
    }
    if (!n) { n = nums[numCursor]; numCursor = (numCursor + 1) % DMG_POOL; }
    n.alive = true; n.age = 0; n.life = opts.life ?? 1.0; n.scale = opts.scale ?? 1;
    n.ox = (Math.random() - 0.5) * (opts.spread ?? 40); n.vy = opts.vy ?? 1.4;
    n.screen = !!opts.screen; n.sx = opts.sx || 0; n.sy = opts.sy || 0;
    if (point) n.pos.copy(point);
    n.el.className = 'aw-num ' + (cls || '');
    n.el.style.setProperty('--nc', color || '#fff');
    n.el.textContent = text;
    n.el.style.opacity = '0';
  }

  // ------------------------------------------------------------------ enemy bar pool
  const bars = [];
  for (let i = 0; i < BAR_POOL; i++) {
    const e = worldLayer.appendChild(h('div', 'aw-ebar', `<div class="aw-ebar-name"></div><div class="aw-ebar-track"><div class="aw-bar-lag"></div><div class="aw-bar-fill"></div></div><div class="aw-ebar-pips">${STATUS_KEYS.map((k) => `<i class="aw-pip" style="--pc:${STATUS_COLORS[k]}" title="${STATUS_NAMES[k]}"></i>`).join('')}</div>`));
    bars.push({
      el: e, name: e.querySelector('.aw-ebar-name'), fill: e.querySelector('.aw-bar-fill'), lag: e.querySelector('.aw-bar-lag'),
      pips: [...e.querySelectorAll('.aw-pip')], ent: null, shown: false, lagV: 1, pipState: 0,
    });
  }
  const lastHit = new WeakMap(); // entity -> realTime of last damage
  const barLag = new WeakMap();

  // ------------------------------------------------------------------ toasts
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
  // wraps key names in keycap spans
  function formatKeys(text) {
    const esc = String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    return esc.replace(/\b(WASD|Shift|Space|Tab|Esc|Q|F|1~5)\b/g, '<kbd>$1</kbd>');
  }
  let hintT = 0, hintCd = 0;
  function showHint(text) {
    if (hintCd > 0) return;
    hint.textContent = text; hintT = 1.6; hintCd = 1.2;
    restartAnim(hint, 'show');
  }

  // ------------------------------------------------------------------ banners
  let bannerT = 0, lastBannerId = '', lastBannerTime = -9;
  function reactionGradient(elements) {
    const a = ELEMENT_CSS[elements?.[0]] || '#ffd27a', b = ELEMENT_CSS[elements?.[1]] || a;
    return `linear-gradient(100deg, ${a} 0%, #fffbe8 48%, ${b} 100%)`;
  }
  function showBanner(text, sub, elements) {
    bannerText.textContent = text;
    bannerSub.textContent = sub || '';
    banner.style.setProperty('--bg', reactionGradient(elements));
    banner.style.setProperty('--g1', ELEMENT_CSS[elements?.[0]] || '#ffd27a');
    banner.style.setProperty('--g2', ELEMENT_CSS[elements?.[1]] || ELEMENT_CSS[elements?.[0]] || '#ffd27a');
    restartAnim(banner, 'show');
    bannerT = 1.6;
  }
  let cardT = 0;
  function showCard(pre, title, sub, cls = '', dur = 3.2) {
    bigCard.className = 'aw-card ' + cls;
    bigCard.querySelector('.aw-card-pre').textContent = pre || '';
    bigCard.querySelector('.aw-card-title').textContent = title;
    bigCard.querySelector('.aw-card-sub').textContent = sub || '';
    restartAnim(bigCard, 'show');
    cardT = dur;
  }

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
      <div class="aw-logo-sub"><i></i>ARCANE WILDS — 원소의 마법사<i></i></div>
      <div class="aw-menu">
        <button class="aw-btn aw-btn-primary" data-act="start">모험 시작</button>
        <button class="aw-btn" data-act="controls">조작법</button>
      </div>
      <div class="aw-title-foot">다섯 원소를 엮어 마물에게 빼앗긴 계곡을 되찾으세요</div>
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

  const controlsHTML = `
    <div class="aw-ctl-grid">
      <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><span>이동</span>
      <div><kbd>Shift</kbd></div><span>달리기 (기력 소모)</span>
      <div><kbd>Space</kbd></div><span>점프 · 공중에서 꾹 눌러 활공</span>
      <div><kbd>Q</kbd></div><span>순간이동 (마력 소모)</span>
      <div><kbd>좌클릭</kbd></div><span>기본 마법</span>
      <div><kbd>우클릭</kbd> 길게</div><span>충전 마법 — 놓으면 발사</span>
      <div><kbd>F</kbd></div><span>궁극 마법</span>
      <div><kbd>1</kbd>~<kbd>5</kbd> · <kbd>휠</kbd></div><span>원소 전환 (화염 · 냉기 · 번개 · 바람 · 대지)</span>
      <div><kbd>Tab</kbd></div><span>마법서 (원소 반응 도감)</span>
      <div><kbd>Esc</kbd></div><span>일시정지</span>
    </div>
    <div class="aw-ctl-tip">원소를 겹쳐 맞히면 반응이 일어납니다 — 젖은 적에게 번개, 얼어붙은 적에게 대지!</div>`;
  const controls = screens.appendChild(h('div', 'aw-screen aw-modal aw-controls', `
    <div class="aw-panel aw-panel-wide">
      <div class="aw-panel-title"><span>조작법</span></div>
      ${controlsHTML}
      <div class="aw-menu aw-menu-row"><button class="aw-btn" data-act="closeControls">닫기</button></div>
    </div>`));

  const pause = screens.appendChild(h('div', 'aw-screen aw-modal aw-pause', `
    <div class="aw-panel">
      <div class="aw-panel-title"><span>일시정지</span></div>
      <div class="aw-pause-obj"></div>
      <div class="aw-menu">
        <button class="aw-btn aw-btn-primary" data-act="resume">계속하기</button>
        <button class="aw-btn" data-act="grimoire">마법서</button>
        <button class="aw-btn" data-act="controls">조작법</button>
        <button class="aw-btn aw-btn-danger" data-act="restart">다시 시작</button>
      </div>
    </div>`));

  const death = screens.appendChild(h('div', 'aw-screen aw-death', `
    <div class="aw-death-inner">
      <div class="aw-death-title">쓰러졌다...</div>
      <div class="aw-death-sub">마력의 빛이 당신을 다시 일으켜 세웁니다</div>
      <div class="aw-death-count"></div>
      <div class="aw-menu aw-menu-row"><button class="aw-btn" data-act="respawn">다시 일어서기 <kbd>Space</kbd></button></div>
    </div>`));
  const deathCount = death.querySelector('.aw-death-count');

  const victory = screens.appendChild(h('div', 'aw-screen aw-victory', `
    <div class="aw-victory-rays"></div>
    <div class="aw-panel aw-victory-panel">
      <div class="aw-victory-pre">고대 바위 골렘 격파</div>
      <div class="aw-victory-title">승리</div>
      <div class="aw-victory-sub">계곡에 다시 평화가 찾아왔습니다</div>
      <div class="aw-stats"></div>
      <div class="aw-menu aw-menu-row"><button class="aw-btn aw-btn-primary" data-act="restart">다시 하기</button></div>
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
        <div class="aw-book-title">주문 목록</div>
        <div class="aw-book-count">다섯 원소 · 열다섯 주문</div>
        <div class="aw-spell-list"></div>
      </div>
      <div class="aw-book-foot"><kbd>Tab</kbd> 닫기</div>
    </div>`));

  // button wiring
  screens.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    game.audio?.play?.('ui_click');
    const act = b.dataset.act;
    if (act === 'start') startGame();
    else if (act === 'controls') controls.classList.add('show');
    else if (act === 'closeControls') controls.classList.remove('show');
    else if (act === 'resume') { controls.classList.remove('show'); setGrimoire(false); game.resume(); }
    else if (act === 'restart') game.restart();
    else if (act === 'respawn') doRespawn();
    else if (act === 'grimoire') setGrimoire(!grimOpen);
  });
  screens.addEventListener('mouseover', (e) => {
    const b = e.target.closest('.aw-btn');
    if (b && b !== screens._hov) { screens._hov = b; game.audio?.play?.('ui_select', { volume: 0.4 }); }
  });

  function startGame() {
    if (game.state !== 'title') return;
    controls.classList.remove('show');
    title.classList.add('leaving');
    game.start();
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

    const defs = game.spells?.SPELLS || game.spells?.defs || null;
    let html = '';
    for (const el of ELEMENTS) {
      const sp = defs ? Object.entries(defs).filter(([, d]) => d.element === el) : [];
      const order = { basic: 0, heavy: 1, ultimate: 2 };
      sp.sort((a, b) => (order[a[1].kind] ?? 9) - (order[b[1].kind] ?? 9));
      html += `<div class="aw-sp-el" style="--ec:${ELEMENT_CSS[el]}"><div class="aw-sp-head">${elementSVG(el, 18)}<span>${ELEMENT_NAMES_KO[el]}</span></div><div class="aw-sp-grid">`;
      if (!sp.length) html += `<div class="aw-sp-row"><div class="aw-sp-desc">주문 정보를 불러올 수 없습니다</div></div>`;
      for (const [, d] of sp) {
        html += `<div class="aw-sp-row">${spellSVG(el, d.kind, 30)}<div class="aw-sp-body"><div class="aw-sp-name">${d.name}</div><div class="aw-sp-meta"><em>${KIND_LABEL[d.kind] || ''} · ${KIND_KEYS[d.kind] || ''}</em><span class="aw-sp-mp">${d.mp ?? d.mpCost ?? '-'} MP</span></div><div class="aw-sp-desc">${d.desc || ''}</div></div></div>`;
      }
      html += '</div></div>';
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
    pause.classList.toggle('show', game.state === 'paused' && !on);
    if (!on && grimPaused) { grimPaused = false; if (game.state === 'paused') game.resume(); }
  }

  // ------------------------------------------------------------------ state handling
  function applyState(s) {
    root.dataset.state = s;
    title.classList.toggle('show', s === 'title');
    if (s !== 'title') title.classList.remove('leaving');
    hud.classList.toggle('show', s === 'playing' || s === 'paused' || s === 'dead');
    pause.classList.toggle('show', s === 'paused' && !grimOpen);
    if (s === 'paused') {
      pause.querySelector('.aw-pause-obj').textContent = objText.textContent ? '현재 목표 — ' + objText.textContent : '';
    } else controls.classList.toggle('show', controls.classList.contains('show') && s === 'title');
    if (s === 'dead') { death.classList.add('show', 'final'); deadT = 2.0; }
    if (s === 'playing') death.classList.remove('show', 'final');
    if (s === 'victory') showVictory();
    if (s !== 'playing' && s !== 'paused') setGrimoire(false);
    if (s === 'playing' && !tutStarted) tutStarted = true;
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

  // ------------------------------------------------------------------ objective / markers
  let objKey = '';
  function updateObjective() {
    const o = game.enemies?.getObjective?.();
    if (!o) return;
    let text, sub, key;
    if (o.phase === 'camps') {
      text = `마물 거점 소탕 (${o.campsCleared}/${o.campsTotal})`;
      sub = '나침반의 붉은 표식을 따라가세요';
    } else if (o.phase === 'boss') {
      text = '고대 골렘을 쓰러뜨려라'; sub = '북쪽 고대 투기장';
    } else { text = '계곡에 평화가 찾아왔다'; sub = ''; }
    key = text + sub;
    if (key !== objKey) {
      const changed = objKey !== '';
      objKey = key; objText.textContent = text; objSub.textContent = sub;
      if (changed) restartAnim(objective, 'flash');
    }
    // compass markers
    const camps = o.camps || game.world?.camps || [];
    const want = camps.length + 1;
    while (markers.length < want) {
      const m = markerBox.appendChild(h('div', 'aw-cmark', '<div class="aw-cmark-ico"></div><div class="aw-cmark-d"></div>'));
      markers.push({ el: m, ico: m.querySelector('.aw-cmark-ico'), d: m.querySelector('.aw-cmark-d'), kind: '', pos: new THREE.Vector3(), on: false, _d: -1 });
    }
    for (let i = 0; i < camps.length; i++) {
      const c = camps[i], m = markers[i];
      const kind = c.cleared ? 'done' : 'camp';
      if (m.kind !== kind) { m.kind = kind; m.ico.innerHTML = MARKER_SVG[kind]; m.el.dataset.kind = kind; }
      if (c.position) m.pos.copy(c.position);
      m.on = !!c.position;
    }
    const bm = markers[camps.length];
    const arena = game.world?.bossArena?.position;
    if (bm) {
      if (bm.kind !== 'boss') { bm.kind = 'boss'; bm.ico.innerHTML = MARKER_SVG.boss; bm.el.dataset.kind = 'boss'; }
      const bp = o.boss?.object?.position || arena;
      if (bp) bm.pos.copy(bp);
      bm.on = !!bp && o.phase !== 'done' && (o.phase === 'boss' || o.campsCleared >= o.campsTotal - 1 || true);
      bm.el.classList.toggle('dim', o.phase !== 'boss');
    }
    return o;
  }

  // ------------------------------------------------------------------ events
  const ev = game.events;
  ev.on('stateChange', (p) => applyState(p.state));
  ev.on('skipTitle', () => { if (game.state === 'title') startGame(); });
  ev.on('damage', (p) => {
    if (!p) return;
    const amt = Math.round(p.amount || 0);
    if (p.target) lastHit.set(p.target, game.realTime);
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
    if (!p.dot) {
      bumpCombo();
      hitMarker(p.killed);
    }
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
  ev.on('spellFail', (p) => { if (p?.reason === 'mana') { showHint('마력이 부족합니다'); restartAnim(mpEl, 'shake'); } });
  ev.on('campCleared', (p) => {
    const total = p?.total ?? 3, idx = (p?.index ?? 0) + 1;
    const cleared = game.enemies?.getObjective?.()?.campsCleared ?? idx;
    showCard('마물 거점', '거점 소탕!', `${cleared} / ${total}`, 'aw-card-camp', 3.0);
  });
  ev.on('bossSpawn', (p) => {
    const nm = p?.boss?.name || '고대 바위 골렘';
    setTimeout(() => showCard('태고의 수호자', nm, '대지를 뒤흔드는 거인이 깨어났다', 'aw-card-boss', 4.2), 700);
  });
  ev.on('bossDefeated', () => { showCard('', '수호자 격파', '고대의 바위가 잠들다', 'aw-card-camp', 3.0); });
  ev.on('victory', (p) => { victoryStats = p?.stats || null; if (game.state === 'victory') showVictory(); });
  ev.on('pickup', (p) => {
    const pp = game.player?.object?.position;
    if (!pp) return;
    v2.copy(pp).setY(pp.y + 2);
    if (p?.kind === 'heart') spawnNumber(`+${p.amount ?? ''} 생명력`, v2, 'aw-num-pick', '#ff8aa0', { life: 1.2, scale: 0.85 });
    else if (p?.kind === 'mana') spawnNumber(`+${p.amount ?? ''} MP`, v2, 'aw-num-pick', '#7cc4ff', { life: 1.2, scale: 0.85 });
  });
  ev.on('elementChanged', () => restartAnim(elName, 'pop'));

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
  appEl?.addEventListener('mousedown', () => {
    if (game.state === 'playing' && !game.input.locked && !game.isTest) game.input.requestLock();
    if (game.state === 'title') startGame();
  });

  // ------------------------------------------------------------------ title camera (cinematic drift)
  let titleT = 0;
  function titleCamera(dt) {
    titleT += dt;
    const sp = game.world?.playerSpawn;
    if (!sp) return;
    const t = titleT * 0.05;
    const x = sp.x + Math.sin(t) * 10, z = sp.z + 8 + Math.cos(t * 0.7) * 3;
    let gy = 0;
    try { gy = game.world.getHeight?.(x, z) ?? sp.y; } catch (_) { gy = sp.y || 0; }
    camera.position.set(x, Math.max(gy, sp.y || 0) + 7 + Math.sin(t * 1.3) * 0.8, z);
    let ty = 0;
    try { ty = game.world.getHeight?.(sp.x * 0.5, sp.z - 70) ?? 0; } catch (_) { /* */ }
    camera.lookAt(sp.x * 0.5 + Math.sin(t * 0.8) * 8, ty + 8, sp.z - 70);
  }

  // ------------------------------------------------------------------ tutorial
  let tutStarted = false, tutT = 0, tutIdx = 0, dummyHintDone = false, playTime = 0, maxCombo = 0;
  const TUT = [
    [1.2, 'WASD 이동 · Shift 달리기 · Space 점프(공중에서 꾹 누르면 활공)'],
    [7.6, '좌클릭: 기본 마법 · 우클릭 길게: 충전 마법 · F: 궁극 마법'],
    [14.0, '1~5 / 휠: 원소 전환 · Q: 순간이동'],
    [20.4, '원소를 조합해 반응을 일으키세요! Tab: 마법서'],
  ];

  // ------------------------------------------------------------------ per-frame caches
  let lastHp = -1, lastHpMax = -1, lastMp = -1, lastMpMax = -1, hpLagV = 1, mpLagV = 1;
  let stamVis = 0, stamLast = -1, chargeVis = 0, hurtA = 0, lastEl = '', lastTarget = null, lastChargeColor = '';
  let bossLagV = 1, bossShown = false, bossEnt = null;
  let objTimer = 0;
  const dir = new THREE.Vector3();

  function project(p, out) {
    v.copy(p).project(camera);
    if (v.z > 1 || v.z < -1) return false;
    out.x = (v.x * 0.5 + 0.5) * W; out.y = (-v.y * 0.5 + 0.5) * H;
    return out.x > -80 && out.x < W + 80 && out.y > -80 && out.y < H + 80;
  }
  const scr = { x: 0, y: 0 };

  function updateHUD(dt) {
    const P = game.player;
    if (P) {
      const ent = P.entity;
      const hp = Math.max(0, ent?.hp ?? P.hp ?? 0), maxHp = ent?.maxHp ?? P.maxHp ?? 100;
      const mp = Math.max(0, P.mp ?? 0), maxMp = P.maxMp ?? 100;
      const hf = clamp(hp / maxHp, 0, 1), mf = clamp(mp / maxMp, 0, 1);
      if (hp !== lastHp || maxHp !== lastHpMax) {
        hpFill.style.transform = `scaleX(${hf})`;
        hpNum.textContent = Math.ceil(hp); if (maxHp !== lastHpMax) hpMax.textContent = '/' + maxHp;
        if (hp > lastHp) hpLagV = hf;
        lastHp = hp; lastHpMax = maxHp;
        hpEl.classList.toggle('low', hf < 0.3);
      }
      if (hpLagV > hf) { hpLagV = Math.max(hf, hpLagV - dt * 0.6); hpLag.style.transform = `scaleX(${hpLagV})`; }
      else if (hpLagV !== hf) { hpLagV = hf; hpLag.style.transform = `scaleX(${hf})`; }
      if (Math.abs(mp - lastMp) > 0.05 || maxMp !== lastMpMax) {
        mpFill.style.transform = `scaleX(${mf})`;
        mpNum.textContent = Math.floor(mp); if (maxMp !== lastMpMax) mpMax.textContent = '/' + maxMp;
        if (mp > lastMp) mpLagV = Math.max(mpLagV, mf);
        lastMp = mp; lastMpMax = maxMp;
      }
      if (mpLagV > mf) { mpLagV = Math.max(mf, mpLagV - dt * 0.8); mpLag.style.transform = `scaleX(${mpLagV})`; }
      else if (mpLagV < mf) { mpLagV = mf; mpLag.style.transform = `scaleX(${mf})`; }

      // low hp heartbeat
      lowVig.classList.toggle('on', hf < 0.3 && hf > 0 && game.state === 'playing');

      // stamina ring (BotW: only when not full)
      const st = P.stamina ?? 100, stMax = P.maxStamina ?? 100, sf = clamp(st / stMax, 0, 1);
      const want = sf < 0.995 ? 1 : 0;
      stamVis += (want - stamVis) * Math.min(1, dt * (want ? 10 : 2.5));
      if (Math.abs(sf - stamLast) > 0.002) {
        stamFg.setAttribute('stroke-dashoffset', (ST_C * (1 - sf)).toFixed(2));
        stamSvg.classList.toggle('low', sf < 0.25);
        stamLast = sf;
      }
      stamSvg.style.opacity = stamVis.toFixed(3);

      // aim target
      let target = null;
      try { target = P.getAim?.()?.target || null; } catch (_) { /* */ }
      if (target && target.alive === false) target = null;
      if (target !== lastTarget) { reticle.classList.toggle('lock', !!target); lastTarget = target; }
      if (target) lastHit.set(target, Math.max(lastHit.get(target) || 0, game.realTime - 4));
    }

    // spells
    const S = game.spells;
    let hs = null;
    try { hs = S?.getHudState?.(); } catch (_) { /* */ }
    if (hs) {
      const el = hs.element;
      if (el !== lastEl) {
        lastEl = el;
        const c = ELEMENT_CSS[el] || '#fff';
        hud.style.setProperty('--el', c);
        gems.forEach((g, i) => g.classList.toggle('sel', ELEMENTS[i] === el));
        elName.innerHTML = `<span>${ELEMENT_NAMES_KO[el] || ''}</span>`;
      }
      const mp = game.player?.mp ?? 999;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i], d = hs.slots?.[i];
        if (!d) { s.root.style.visibility = 'hidden'; continue; }
        s.root.style.visibility = '';
        if (s._el !== el + d.name) {
          s._el = el + d.name;
          s.ico.innerHTML = spellSVG(el, s.kind, s.kind === 'ultimate' ? 64 : 56);
          s.name.textContent = d.name;
          s.cost.textContent = d.mpCost;
          s._cd = -1;
          restartAnim(s.root, 'swap');
        }
        const frac = d.cooldown > 0 ? clamp(d.cooldownLeft / d.cooldown, 0, 1) : 0;
        const q = Math.round(frac * 200) / 200;
        if (q !== s._cd) {
          s._cd = q;
          s.cd.style.setProperty('--cd', (q * 360).toFixed(1) + 'deg');
          s.cd.style.opacity = q > 0 ? '1' : '0';
        }
        const txt = d.cooldownLeft > 0.95 ? Math.ceil(d.cooldownLeft).toString() : '';
        if (txt !== s._cdTxt) { s._cdTxt = txt; s.cdnum.textContent = txt; }
        const low = mp < d.mpCost;
        if (low !== s._low) { s._low = low; s.root.classList.toggle('nomp', low); }
        const ready = !!d.ready;
        if (ready !== s._ready) {
          if (ready && s._ready === false && !low) restartAnim(s.root, 'readyflash');
          s._ready = ready;
        }
      }
      slots[1].root.classList.toggle('charging', !!hs.charging);

      // charge ring
      const cf = hs.charging ? clamp(hs.chargeFrac || 0, 0, 1) : 0;
      chargeVis += ((hs.charging ? 1 : 0) - chargeVis) * Math.min(1, dt * 14);
      chargeSvg.style.opacity = chargeVis.toFixed(3);
      if (hs.charging) {
        chargeFg.setAttribute('stroke-dashoffset', (CH_C * (1 - cf)).toFixed(2));
        chargeSvg.classList.toggle('full', cf >= 1);
      }
    }

    // hitmarker
    if (hitT > 0) { hitT -= dt; hitmark.style.opacity = clamp(hitT / 0.12, 0, 1).toFixed(2); }
    else if (hitmark.style.opacity !== '0') hitmark.style.opacity = '0';

    // objective & compass (objective throttled)
    objTimer -= dt;
    if (objTimer <= 0) { objTimer = 0.25; updateObjective(); }
    camera.getWorldDirection(dir);
    const yawDeg = Math.atan2(dir.x, -dir.z) * 180 / Math.PI;
    strip.style.transform = `translateX(${(COMPASS_W / 2 - (yawDeg + 360) * PX_PER_DEG).toFixed(1)}px)`;
    const pp = game.player?.object?.position || camera.position;
    for (const m of markers) {
      if (!m.on) { if (m.el.style.display !== 'none') m.el.style.display = 'none'; continue; }
      const dx = m.pos.x - pp.x, dz = m.pos.z - pp.z;
      let rel = Math.atan2(dx, -dz) * 180 / Math.PI - yawDeg;
      rel = ((rel + 540) % 360) - 180;
      const vis = Math.abs(rel) < 88;
      m.el.style.display = vis ? '' : 'none';
      if (!vis) continue;
      m._x = COMPASS_W / 2 + rel * PX_PER_DEG;
      const d = Math.round(Math.hypot(dx, dz));
      m._dist = d;
      if (d !== m._d) { m._d = d; m.d.textContent = d + 'm'; }
    }
    // de-overlap: sort by screen x; a marker closer than 30px to its left neighbour is nudged right of it
    visMarks.length = 0;
    for (const m of markers) if (m.on && m.el.style.display !== 'none') visMarks.push(m);
    visMarks.sort((a, b) => a._x - b._x);
    for (let i = 0; i < visMarks.length; i++) {
      const m = visMarks[i];
      m._px = i > 0 && m._x - visMarks[i - 1]._px < 38 ? visMarks[i - 1]._px + 38 : m._x;
      m.el.style.transform = `translateX(${m._px.toFixed(1)}px)`;
      m.el.style.zIndex = m.kind === 'boss' ? '3' : '2';
    }

    // boss bar
    const o = game.enemies?.getObjective?.();
    const boss = o?.boss && o.boss.alive !== false ? o.boss : null;
    if (!!boss !== bossShown) {
      bossShown = !!boss; bossBar.classList.toggle('show', bossShown);
      if (boss) {
        bossName.textContent = boss.name || '고대 바위 골렘';
        bossLagV = 1;
        let pips = '';
        for (let i = 1; i < 4; i++) pips += `<i style="left:${i * 25}%"></i>`;
        bossPips.innerHTML = pips;
      }
    }
    if (boss) {
      const bf = clamp(boss.hp / boss.maxHp, 0, 1);
      bossFill.style.transform = `scaleX(${bf})`;
      if (bossLagV > bf) bossLagV = Math.max(bf, bossLagV - dt * 0.25); else bossLagV = bf;
      bossLag.style.transform = `scaleX(${bossLagV})`;
      if (bossEnt !== boss) bossEnt = boss;
    }
  }

  const visMarks = [];
  function updateNumbers(dt) {
    for (let i = 0; i < DMG_POOL; i++) {
      const n = nums[i];
      if (!n.alive) continue;
      n.age += dt;
      const k = n.age / n.life;
      if (k >= 1) { n.alive = false; n.el.style.opacity = '0'; n.el.style.transform = 'translate(-9999px,0)'; continue; }
      n.pos.y += n.vy * dt * (1 - k * 0.6);
      if (!project(n.pos, scr)) { n.el.style.opacity = '0'; continue; }
      // pop: overshoot then settle, fade out at the end
      const pop = k < 0.12 ? 0.4 + (k / 0.12) * 1.0 : k < 0.24 ? 1.4 - ((k - 0.12) / 0.12) * 0.4 : 1;
      const s = n.scale * pop;
      const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      n.el.style.opacity = a.toFixed(2);
      n.el.style.transform = `translate(${(scr.x + n.ox * k).toFixed(1)}px,${scr.y.toFixed(1)}px) translate(-50%,-50%) scale(${s.toFixed(3)})`;
    }
  }

  function updateBars(dt) {
    let bi = 0;
    const now = game.realTime;
    const cam = camera.position;
    const ents = game.entities || [];
    if (game.state === 'playing' || game.state === 'paused') {
      for (let i = 0; i < ents.length && bi < BAR_POOL; i++) {
        const e = ents[i];
        if (e.team !== 'enemy' || e.isBoss || !e.alive || !e.object) continue;
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
        // status pips
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

  // ------------------------------------------------------------------ api
  const api = {
    toast,
    showBanner, showCard,
    setGrimoire, get grimoireOpen() { return grimOpen; },
    init() {
      for (const b of bars) b.el.style.display = 'none';
      applyState(game.state);
    },
    update(dt, realDt) {
      dt = realDt || dt || 0;
      const s = game.state;
      const inp = game.input;

      // keys
      if (inp.pressed('Tab') && (s === 'playing' || s === 'paused')) setGrimoire(!grimOpen);
      if (inp.pressed('Escape')) {
        if (controls.classList.contains('show')) controls.classList.remove('show');
        else if (grimOpen) setGrimoire(false);
        else if (s === 'playing') game.pause();
        else if (s === 'paused' && performance.now() - lockLostAt > 400) game.resume();
      }
      if (s === 'dead' && (inp.pressed('Space') || inp.pressed('Enter'))) doRespawn();
      if (s === 'title' && inp.pressed('Enter')) startGame();

      if (s === 'title') titleCamera(dt);

      if (s === 'playing') {
        playTime += dt;
        // tutorial
        if (tutStarted && tutIdx < TUT.length) {
          tutT += dt;
          if (tutT >= TUT[tutIdx][0]) { toast(TUT[tutIdx][1], { duration: 5.6, kind: 'tut' }); tutIdx++; }
        }
        if (!dummyHintDone && tutT > 4) {
          const pp = game.player?.object?.position;
          if (pp) {
            for (const e of game.entities) {
              if (e.isDummy && e.alive && e.object && e.object.position.distanceToSquared(pp) < 13 * 13) {
                dummyHintDone = true;
                toast('수련용 허수아비 — 마법을 시험해 보세요. 젖게 한 뒤 번개를 맞혀 보세요!', { duration: 5.5, kind: 'tut' });
                break;
              }
            }
          }
        }
        // combo decay
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

      if (hud.classList.contains('show')) updateHUD(dt);
      updateNumbers(dt);
      updateBars(dt);

      // vignettes
      if (hurtA > 0) { hurtA = Math.max(0, hurtA - dt * 1.8); hurtVig.style.opacity = hurtA.toFixed(3); }
      else if (hurtVig.style.opacity !== '0') hurtVig.style.opacity = '0';

      if (hintCd > 0) hintCd -= dt;
      if (hintT > 0) { hintT -= dt; if (hintT <= 0) hint.classList.remove('show'); }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      if (cardT > 0) { cardT -= dt; if (cardT <= 0) bigCard.classList.remove('show'); }

      if (s === 'dead' && deadT > 0) {
        deadT -= dt;
        deathCount.textContent = deadT > 0 ? `${Math.ceil(deadT)}초 후 부활` : '부활 중...';
      }
    },
  };
  return api;
}
