// Cinematic DOM overlay (inside #ui): letterbox, colour grade wash, film vignette + grain, fade, lore title,
// subtitles, calligraphic skill-name splash, projected world labels, skip ring. All classes are `cin-` prefixed.
// Opacities are driven from JS each frame (deterministic under game.step), written only when they change.

const CSS = `
.aw-root.cin-hud-off .aw-hud { opacity: 0 !important; }
.cin-root { position: absolute; inset: 0; pointer-events: none; z-index: 60; overflow: hidden;
  --cin-gold: var(--aw-gold, #e9c46a); --cin-cream: var(--aw-cream, #f6ecd2); --cin-ink: var(--aw-ink, #14110d);
  --cin-serif: var(--aw-font-title, "Noto Serif KR", "Nanum Myeongjo", "AppleMyungjo", "Batang", "Cinzel", "Times New Roman", serif);
  --cin-body: var(--aw-font-body, "Noto Serif KR", "Nanum Myeongjo", "AppleMyungjo", "Batang", serif);
  font-family: var(--cin-body); color: var(--cin-cream); }
.cin-root > * { position: absolute; }
.cin-grade { inset: 0; opacity: 0; will-change: opacity; }
.cin-film { inset: 0; opacity: 0; will-change: opacity;
  background: radial-gradient(ellipse 75% 70% at 50% 48%, rgba(0,0,0,0) 55%, rgba(4,2,10,.38) 82%, rgba(2,1,6,.78) 100%); }
.cin-grain { inset: -50%; opacity: 0; will-change: transform, opacity; mix-blend-mode: overlay; background-size: 192px 192px; }
.cin-bar { left: 0; right: 0; height: 11.5vh; background: #000; will-change: transform; }
.cin-bar.top { top: 0; transform: translateY(-100%); }
.cin-bar.bot { bottom: 0; transform: translateY(100%); }
.cin-labels { inset: 0; }
.cin-label { position: absolute; left: 0; top: 0; white-space: nowrap; text-align: center; opacity: 0; will-change: transform, opacity; }
.cin-label b { display: block; font: 700 30px/1 var(--cin-serif); letter-spacing: .32em; padding-left: .32em; color: #fff;
  text-shadow: 0 0 3px rgba(0,0,0,.9), 0 0 12px var(--c), 0 0 28px var(--c), 0 2px 6px rgba(0,0,0,.9); }
.cin-label i { display: block; font: 500 13px/1 var(--cin-body); font-style: normal; letter-spacing: .5em; padding-left: .5em; margin-top: 9px;
  color: var(--c); text-shadow: 0 0 8px rgba(0,0,0,.9), 0 1px 2px #000; }
.cin-fade { inset: 0; background: #000; opacity: 0; will-change: opacity; }
.cin-stars { inset: -6%; opacity: 0; will-change: transform, opacity; background-repeat: no-repeat; background-size: cover; }
.cin-title { left: 6%; right: 6%; top: 50%; transform: translateY(-50%); text-align: center; opacity: 0; will-change: opacity; }
.cin-title .l { display: block; font: 500 clamp(26px, 3.3vw, 46px)/1.45 var(--cin-serif); letter-spacing: .16em; color: var(--cin-cream);
  text-shadow: 0 0 18px rgba(255,220,160,.35), 0 0 2px rgba(0,0,0,.9), 0 2px 10px rgba(0,0,0,.65); }
.cin-title .l span { display: inline-block; opacity: 0; will-change: opacity, transform; }
.cin-title .s { display: block; margin-top: 18px; font: 400 clamp(14px, 1.35vw, 19px)/1.7 var(--cin-body); letter-spacing: .24em;
  color: rgba(246,236,210,.82); text-shadow: 0 1px 6px rgba(0,0,0,.9); opacity: 0; }
.cin-title .orn { display: block; margin: 0 auto 16px; width: min(420px, 60vw); height: 14px; opacity: .85;
  background: linear-gradient(90deg, transparent, var(--cin-gold) 30%, var(--cin-gold) 70%, transparent) center/100% 1px no-repeat; position: relative; }
.cin-title .orn::after { content: "✦"; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -52%); color: var(--cin-gold); font-size: 13px;
  text-shadow: 0 0 10px var(--cin-gold); }
.cin-title.low { top: auto; bottom: 18vh; transform: none; }
.cin-title.side { left: 6%; right: auto; width: min(40vw, 560px); top: 34%; transform: none; text-align: left; }
.cin-title.side .l { font-size: clamp(22px, 2.5vw, 36px); letter-spacing: .1em; }
.cin-title.side .s { letter-spacing: .16em; }
.cin-title.low .l { font-size: clamp(22px, 2.5vw, 34px); }
.cin-title.card .l { font: 700 clamp(54px, 8.4vw, 118px)/1.15 var(--cin-serif); letter-spacing: .22em; padding-left: .22em; white-space: nowrap; text-shadow: none; }
.cin-title.card .l span { background: linear-gradient(180deg, #fff8e2 0%, #f3d995 42%, #c8933f 70%, #f7e2a8 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 16px rgba(255,200,110,.5)) drop-shadow(0 3px 2px rgba(20,10,0,.85)); }
.cin-title.card .s { font: 600 clamp(15px, 1.6vw, 22px)/1 "Cinzel", "Trajan Pro", "Times New Roman", serif; letter-spacing: .9em; padding-left: .9em; color: var(--cin-gold); margin-top: 26px; }
.cin-title.card .orn { width: min(560px, 70vw); margin-bottom: 26px; }
.cin-title.card .orn.b { margin: 24px auto 0; }
.cin-sub { left: 50%; bottom: 13.8vh; transform: translateX(-50%); width: max-content; max-width: min(1180px, 90vw); text-align: center; opacity: 0; will-change: opacity; }
.cin-sub .who { display: block; font: 700 14px/1 var(--cin-body); letter-spacing: .35em; color: var(--cin-gold); margin-bottom: 8px; text-shadow: 0 1px 4px #000; }
.cin-sub .txt { font: 500 clamp(17px, 1.55vw, 23px)/1.6 var(--cin-body); letter-spacing: .06em; color: #fff;
  text-shadow: 0 0 3px rgba(0,0,0,.95), 0 2px 8px rgba(0,0,0,.85); }
/* ---- 필살기 calligraphic splash ---- */
.cin-splash { inset: 0; opacity: 0; display: flex; align-items: center; justify-content: center; }
.cin-splash.side { transform: translateY(27vh) scale(.7); }   /* lower third, keeps the hero's body clear */
.cin-splash .ink { position: absolute; left: 50%; top: 50%; width: 92vw; height: 34vh; transform: translate(-50%, -50%) scaleX(0); transform-origin: 8% 50%;
  background: radial-gradient(ellipse 52% 44% at 50% 50%, rgba(8,4,12,.95) 40%, rgba(8,4,12,.7) 60%, rgba(8,4,12,0) 74%),
    radial-gradient(ellipse 18% 30% at 22% 44%, rgba(8,4,12,.75), rgba(8,4,12,0) 70%), radial-gradient(ellipse 20% 26% at 78% 58%, rgba(8,4,12,.75), rgba(8,4,12,0) 70%),
    linear-gradient(176deg, rgba(8,4,12,0) 40%, rgba(8,4,12,.55) 47%, rgba(8,4,12,.55) 55%, rgba(8,4,12,0) 62%); }
.cin-splash.go .ink { animation: cin-ink .42s cubic-bezier(.2,.9,.2,1) forwards; }
.cin-splash .drops { position: absolute; inset: 0; }
.cin-splash .drop { position: absolute; border-radius: 50%; background: rgba(8,4,12,.9); transform: scale(0); }
.cin-splash.go .drop { animation: cin-drop .5s cubic-bezier(.2,1.4,.4,1) forwards; }
.cin-splash .stroke { position: absolute; left: 50%; top: 50%; width: 78vw; height: 3px; transform: translate(-50%, 7.5vh) scaleX(0); transform-origin: 0 50%;
  background: linear-gradient(90deg, transparent, var(--g2) 15%, #fff 50%, var(--g2) 85%, transparent); box-shadow: 0 0 16px var(--g2), 0 0 40px var(--g1); }
.cin-splash.go .stroke { animation: cin-stroke .5s .18s cubic-bezier(.3,.9,.2,1) forwards; }
.cin-splash .name { position: relative; font: 900 clamp(64px, 10vw, 150px)/1 var(--cin-serif); letter-spacing: .08em; white-space: nowrap;
  transform: skewX(-9deg) scale(1.6); opacity: 0;
  background: linear-gradient(100deg, #fff 0%, var(--g0) 18%, var(--g1) 40%, #fff 50%, var(--g1) 60%, var(--g0) 82%, #fff 100%); background-size: 200% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-stroke: 1.5px rgba(255,255,255,.55);
  filter: drop-shadow(0 0 10px var(--g1)) drop-shadow(0 0 26px var(--g2)) drop-shadow(0 5px 0 rgba(0,0,0,.85)); }
.cin-splash.go .name { animation: cin-name .55s .1s cubic-bezier(.15,1.3,.3,1) forwards, cin-sheen 1.6s .3s linear infinite; }
.cin-splash .tag { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -11.5vh); font: 700 15px/1 var(--cin-body); letter-spacing: .8em; padding-left: .8em;
  color: var(--g0); text-shadow: 0 0 10px var(--g1), 0 1px 3px #000; opacity: 0; }
.cin-splash.go .tag { animation: cin-fadein .4s .35s forwards; }
.cin-splash .kanji { position: absolute; right: 9vw; top: 50%; transform: translateY(-50%) rotate(8deg); font: 900 clamp(90px, 15vw, 230px)/1 var(--cin-serif);
  color: transparent; -webkit-text-stroke: 2px var(--g1); opacity: 0; filter: drop-shadow(0 0 12px var(--g2)); }
.cin-splash.go .kanji { animation: cin-kanji 1.2s .05s ease-out forwards; }
@keyframes cin-ink { 0% { transform: translate(-50%, -50%) scaleX(0) scaleY(.4); } 60% { transform: translate(-50%, -50%) scaleX(1.06) scaleY(1.05); } 100% { transform: translate(-50%, -50%) scaleX(1) scaleY(1); } }
@keyframes cin-drop { to { transform: scale(1); } }
@keyframes cin-stroke { to { transform: translate(-50%, 7.5vh) scaleX(1); } }
@keyframes cin-name { 0% { opacity: 0; transform: skewX(-9deg) scale(1.9); letter-spacing: .3em; } 100% { opacity: 1; transform: skewX(-9deg) scale(1); letter-spacing: .08em; } }
@keyframes cin-sheen { from { background-position: 100% 0; } to { background-position: -120% 0; } }
@keyframes cin-fadein { to { opacity: 1; } }
@keyframes cin-kanji { 0% { opacity: 0; transform: translateY(-50%) rotate(8deg) scale(1.4); } 30% { opacity: .55; } 100% { opacity: .22; transform: translateY(-50%) rotate(8deg) scale(1); } }
/* ---- skip ring ---- */
.cin-skip { right: 34px; bottom: calc(11.5vh + 16px); display: flex; align-items: center; gap: 10px; opacity: 0; transition: opacity .4s;
  font: 600 13px/1 var(--cin-body); letter-spacing: .12em; color: rgba(246,236,210,.85); text-shadow: 0 1px 3px #000; }
.cin-skip.show { opacity: 1; }
.cin-skip svg { width: 30px; height: 30px; transform: rotate(-90deg); }
.cin-skip circle { fill: none; stroke-width: 3; }
.cin-skip .bg { stroke: rgba(255,255,255,.18); }
.cin-skip .fg { stroke: var(--cin-gold); stroke-linecap: round; filter: drop-shadow(0 0 4px var(--cin-gold)); }
.cin-root .cin-skip kbd { font: 700 11px/1 var(--cin-body); padding: 3px 6px; border: 1px solid rgba(233,196,106,.6); border-radius: 4px; color: var(--cin-gold); background: rgba(10,8,16,.6); box-shadow: none; text-shadow: none; }
/* ---- credits ---- */
.cin-credits { left: 0; right: 0; top: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; text-align: center; }
.cin-credits::before { content: ''; position: absolute; left: 50%; top: 50%; width: min(900px, 90vw); height: 80vh; transform: translate(-50%, -50%);
  background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(4,2,10,.55), rgba(4,2,10,0) 75%); pointer-events: none; z-index: -1; }
.cin-credits .r { position: relative; font: 600 15px/1.2 var(--cin-body); letter-spacing: .25em; padding-left: .25em; color: var(--cin-gold); margin-top: 28px;
  text-shadow: 0 1px 3px #000, 0 0 10px rgba(0,0,0,.6); }
.cin-credits .n { position: relative; }
.cin-credits .n { font: 600 clamp(20px, 2vw, 28px)/1.3 var(--cin-serif); letter-spacing: .2em; color: #fff; margin-top: 10px; text-shadow: 0 0 12px rgba(255,220,160,.4), 0 2px 6px #000; }
`;

const ELEMENT_GRAD = {
  fire: ['#fff1a8', '#ff8a2a', '#e0200c'], ice: ['#f2feff', '#8feaff', '#2f8cff'], lightning: ['#fffbe8', '#d6b8ff', '#7a4dff'],
  wind: ['#f4fff6', '#9dffcb', '#22c08a'], earth: ['#fff2cc', '#f0bd6e', '#a5642a'],
  water: ['#f0fbff', '#6fc8ff', '#1f6fb8'], nature: ['#f4ffd0', '#9be86a', '#2f7d3a'], light: ['#ffffff', '#ffe08a', '#ffb02a'],
  shadow: ['#efe2ff', '#b98bff', '#4a1f7a'], physical: ['#ffffff', '#f6ecd2', '#e9c46a'],
  symphony: ['#fff6d8', '#ffb8e8', '#7a8cff'], void: ['#e8d8ff', '#9a6bff', '#2a0d4a'],
};
const ELEMENT_GLYPH = {
  fire: '炎', ice: '氷', lightning: '雷', wind: '風', earth: '地', water: '水', nature: '森', light: '光', shadow: '影',
  physical: '剣', symphony: '響', void: '虛',
};

function grainURL() {
  const c = document.createElement('canvas'); c.width = c.height = 192;
  const g = c.getContext('2d'); const d = g.createImageData(192, 192);
  for (let i = 0; i < d.data.length; i += 4) { const v = 110 + Math.random() * 145; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  return c.toDataURL();
}
function starsURL(w = 1600, h = 900) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const bg = g.createRadialGradient(w * 0.62, h * 0.85, 0, w * 0.62, h * 0.85, w * 0.8);
  bg.addColorStop(0, '#1a1236'); bg.addColorStop(0.45, '#0a0a1c'); bg.addColorStop(1, '#020208');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  // milky band
  g.save(); g.translate(w / 2, h / 2); g.rotate(-0.42);
  for (let i = 0; i < 70; i++) {
    const x = (Math.random() - 0.5) * w * 1.3, y = (Math.random() - 0.5) * h * 0.18, r = 40 + Math.random() * 120;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${150 + Math.random() * 60},${120 + Math.random() * 60},255,.05)`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.restore();
  for (let i = 0; i < 1300; i++) {
    const x = Math.random() * w, y = Math.random() * h, m = Math.random();
    const r = m < 0.97 ? Math.random() * 0.9 + 0.3 : 1.2 + Math.random() * 1.4;
    const tint = Math.random(); g.fillStyle = tint < 0.15 ? 'rgba(190,210,255,' : tint < 0.25 ? 'rgba(255,225,190,' : 'rgba(255,255,255,';
    g.fillStyle += (0.35 + Math.random() * 0.65) + ')';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (r > 1.6) { const rg = g.createRadialGradient(x, y, 0, x, y, r * 6); rg.addColorStop(0, 'rgba(220,230,255,.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r * 6, y - r * 6, r * 12, r * 12); }
  }
  return c.toDataURL('image/jpeg', 0.9);
}

export function createOverlay(game) {
  const host = document.getElementById('ui') || document.body;
  if (!document.getElementById('cin-style')) {
    const st = document.createElement('style'); st.id = 'cin-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  const root = document.createElement('div'); root.className = 'cin-root';
  root.innerHTML = `
    <div class="cin-grade"></div>
    <div class="cin-stars"></div>
    <div class="cin-film"></div>
    <div class="cin-grain"></div>
    <div class="cin-labels"></div>
    <div class="cin-bar top"></div><div class="cin-bar bot"></div>
    <div class="cin-fade"></div>
    <div class="cin-credits"></div>
    <div class="cin-title"></div>
    <div class="cin-sub"><span class="who"></span><span class="txt"></span></div>
    <div class="cin-splash"></div>
    <div class="cin-skip"><svg viewBox="0 0 36 36"><circle class="bg" cx="18" cy="18" r="15"/><circle class="fg" cx="18" cy="18" r="15" stroke-dasharray="94.25" stroke-dashoffset="94.25"/></svg><span><kbd>Space</kbd> 길게 눌러 건너뛰기</span></div>`;
  host.appendChild(root);
  const q = (s) => root.querySelector(s);
  const el = {
    grade: q('.cin-grade'), stars: q('.cin-stars'), film: q('.cin-film'), grain: q('.cin-grain'), labels: q('.cin-labels'),
    top: q('.cin-bar.top'), bot: q('.cin-bar.bot'), fade: q('.cin-fade'), credits: q('.cin-credits'), title: q('.cin-title'),
    sub: q('.cin-sub'), who: q('.cin-sub .who'), txt: q('.cin-sub .txt'), splash: q('.cin-splash'), skip: q('.cin-skip'), ring: q('.cin-skip .fg'),
  };
  let grainReady = false, starsReady = false;
  const cache = new Map();
  const setO = (node, v) => { v = Math.round(v * 1000) / 1000; if (cache.get(node) !== v) { cache.set(node, v); node.style.opacity = String(v); } };
  const tcache = new Map();
  const setT = (node, s) => { if (tcache.get(node) !== s) { tcache.set(node, s); node.style.transform = s; } };

  // state targets
  const S = { bars: 0, barsT: 0, fade: 0, fadeFrom: 0, fadeTo: 0, fadeDur: 0, fadeT: 1, film: 0, filmT: 0, grade: 0, gradeT: 0, gradeFrom: 0, gradeDur: 0, gradeTT: 1, stars: 0 };
  let title = null, sub = null, credits = null, splashT = -1, splashDur = 0, grainFrame = 0;
  const labels = [];

  function damp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }

  const api = {
    root, el,
    letterbox(on) { S.barsT = on ? 1 : 0; },
    film(on) {
      S.filmT = on ? 1 : 0;
      if (on && !grainReady) { grainReady = true; el.grain.style.backgroundImage = `url(${grainURL()})`; }
    },
    /** Fade black: to (0..1) over dur seconds. */
    fade(to, dur = 1) { S.fadeFrom = S.fade; S.fadeTo = to; S.fadeDur = Math.max(0.0001, dur); S.fadeT = 0; },
    /** Lift remaining black via a CSS transition (keeps running when the cinematic stops updating). */
    fadeOutCSS(dur = 1) {
      S.fadeTo = 0; S.fadeT = 1;
      if (S.fade <= 0.001) { S.fade = 0; setO(el.fade, 0); return; }
      S.fade = 0; cache.set(el.fade, 0);
      el.fade.style.transition = `opacity ${dur}s ease`; el.fade.style.opacity = '0';
      clearTimeout(api._ft); api._ft = setTimeout(() => { el.fade.style.transition = ''; }, dur * 1000 + 60);
    },
    setFade(v) { el.fade.style.transition = ''; S.fade = S.fadeTo = v; S.fadeT = 1; setO(el.fade, v); },
    /** Colour wash (CSS background) at alpha `a` over dur seconds. */
    grade(css, a = 1, dur = 1.5) { if (css) el.grade.style.background = css; S.gradeFrom = S.grade; S.gradeT = a; S.gradeDur = Math.max(0.0001, dur); S.gradeTT = 0; },
    stars(a) {
      if (a > 0 && !starsReady) { starsReady = true; el.stars.style.backgroundImage = `url(${starsURL()})`; }
      S.stars = a;
    },
    /** Lore title: per-character reveal. style: 'lore' (center) | 'low' | 'card'. */
    title(text, { sub: subText = '', style = 'lore', dur = 5, fadeIn = 1.4, fadeOut = 1.2, stagger = 0.06 } = {}) {
      el.title.className = 'cin-title' + (style !== 'lore' ? ' ' + style : '');
      const chars = [...text].map((c) => (c === ' ' ? '<span>&nbsp;</span>' : `<span>${c}</span>`)).join('');
      const orn = style === 'card' ? '<i class="orn"></i>' : style === 'lore' ? '<i class="orn"></i>' : '';
      el.title.innerHTML = `${orn}<span class="l">${chars}</span>${subText ? `<span class="s">${subText}</span>` : ''}${style === 'card' ? '<i class="orn b"></i>' : ''}`;
      title = { t: 0, dur, fadeIn, fadeOut, stagger, spans: [...el.title.querySelectorAll('.l span')], s: el.title.querySelector('.s'), last: [] };
      setO(el.title, 1);
    },
    clearTitle(fadeOut = 0.8) { if (title) { title.dur = Math.min(title.dur, title.t + fadeOut); title.fadeOut = fadeOut; } },
    subtitle(text, { speaker = '', dur = 4, fadeIn = 0.5, fadeOut = 0.6 } = {}) {
      el.who.textContent = speaker; el.who.style.display = speaker ? '' : 'none'; el.txt.textContent = text;
      sub = { t: 0, dur, fadeIn, fadeOut };
    },
    clearSubtitle() { if (sub) sub.dur = Math.min(sub.dur, sub.t + 0.4); },
    credits(lines, { dur = 6, fadeIn = 1.2, fadeOut = 1.2 } = {}) {
      el.credits.innerHTML = lines.map(([r, n]) => `${r ? `<div class="r">${r}</div>` : ''}<div class="n">${n}</div>`).join('');
      credits = { t: 0, dur, fadeIn, fadeOut };
    },
    /** 필살기 name splash (calligraphic, element gradient, ink splash). */
    splash(name, { element = 'physical', tag = '필살기', dur = 2.2, style = '' } = {}) {
      el.splash.classList.toggle('side', style === 'side');
      const g = ELEMENT_GRAD[element] || ELEMENT_GRAD.physical;
      el.splash.style.setProperty('--g0', g[0]); el.splash.style.setProperty('--g1', g[1]); el.splash.style.setProperty('--g2', g[2]);
      let drops = '';
      for (let i = 0; i < 14; i++) {
        const x = 50 + (Math.random() - 0.5) * 86, y = 50 + (Math.random() - 0.5) * 40 * (0.5 + Math.random());
        const s = 3 + Math.random() * 16, sy = s * (0.5 + Math.random() * 0.6), rot = Math.round(Math.random() * 180);
        drops += `<i class="drop" style="left:${x}%;top:${y}%;width:${s}px;height:${sy.toFixed(1)}px;rotate:${rot}deg;animation-delay:${(0.08 + Math.random() * 0.25).toFixed(2)}s"></i>`;
      }
      el.splash.innerHTML = `<div class="ink"></div><div class="drops">${drops}</div><div class="kanji">${ELEMENT_GLYPH[element] || '斬'}</div>
        <div class="tag">${tag}</div><div class="name">${name}</div><div class="stroke"></div>`;
      el.splash.classList.remove('go'); void el.splash.offsetWidth; el.splash.classList.add('go');
      splashT = 0; splashDur = dur; setO(el.splash, 1);
    },
    /** Label following a world point. Returns handle {set(pos), show(a), remove()}. */
    label(name, small, cssColor) {
      const d = document.createElement('div'); d.className = 'cin-label'; d.style.setProperty('--c', cssColor || '#fff');
      d.innerHTML = `<b>${name}</b>${small ? `<i>${small}</i>` : ''}`; el.labels.appendChild(d);
      const h = { d, x: 0, y: 0, a: 0, aT: 0, on: true,
        place(x, y) { h.x = x; h.y = y; }, show(a) { h.aT = a; }, remove() { d.remove(); const i = labels.indexOf(h); if (i >= 0) labels.splice(i, 1); } };
      labels.push(h); return h;
    },
    skip(show, frac) {
      el.skip.classList.toggle('show', !!show);
      const off = 94.25 * (1 - Math.max(0, Math.min(1, frac)));
      const v = off.toFixed(1); if (el.ring.dataset.v !== v) { el.ring.dataset.v = v; el.ring.setAttribute('stroke-dashoffset', v); }
    },
    update(dt) {
      // fades
      if (S.fadeT < 1) { S.fadeT = Math.min(1, S.fadeT + dt / S.fadeDur); const k = S.fadeT * S.fadeT * (3 - 2 * S.fadeT); S.fade = S.fadeFrom + (S.fadeTo - S.fadeFrom) * k; }
      setO(el.fade, S.fade);
      if (S.gradeTT < 1) { S.gradeTT = Math.min(1, S.gradeTT + dt / S.gradeDur); const k = S.gradeTT * S.gradeTT * (3 - 2 * S.gradeTT); S.grade = S.gradeFrom + (S.gradeT - S.gradeFrom) * k; }
      setO(el.grade, S.grade);
      S.bars = damp(S.bars, S.barsT, 3.2, dt); if (Math.abs(S.bars - S.barsT) < 0.002) S.bars = S.barsT;
      const bp = ((1 - S.bars) * 100).toFixed(1);
      setT(el.top, `translateY(-${bp}%)`); setT(el.bot, `translateY(${bp}%)`);
      S.film = damp(S.film, S.filmT, 2.5, dt); if (Math.abs(S.film - S.filmT) < 0.002) S.film = S.filmT;
      setO(el.film, S.film); setO(el.grain, S.film * 0.07);
      if (S.film > 0.01) { grainFrame = (grainFrame + 1) % 6; if (grainFrame % 2 === 0) setT(el.grain, `translate(${((grainFrame * 37) % 23) - 11}%, ${((grainFrame * 53) % 19) - 9}%)`); }
      setO(el.stars, S.stars);
      if (S.stars > 0.01) setT(el.stars, `scale(${(1 + S.starsZoom * 0.08).toFixed(4)})`);
      // title
      if (title) {
        title.t += dt; const T = title;
        for (let i = 0; i < T.spans.length; i++) {
          const k = Math.max(0, Math.min(1, (T.t - i * T.stagger) / T.fadeIn));
          const q2 = Math.round(k * 50) / 50;
          if (T.last[i] !== q2) { T.last[i] = q2; T.spans[i].style.opacity = String(q2); T.spans[i].style.transform = `translateY(${((1 - q2) * 10).toFixed(1)}px)`; }
        }
        if (T.s) setO(T.s, Math.max(0, Math.min(1, (T.t - T.spans.length * T.stagger * 0.6 - 0.4) / 1.2)));
        const out = Math.max(0, Math.min(1, (T.dur - T.t) / T.fadeOut));
        setO(el.title, out);
        if (T.t >= T.dur) { title = null; setO(el.title, 0); }
      }
      if (sub) {
        sub.t += dt;
        const a = Math.min(1, sub.t / sub.fadeIn, Math.max(0, (sub.dur - sub.t) / sub.fadeOut));
        setO(el.sub, a); if (sub.t >= sub.dur) { sub = null; setO(el.sub, 0); }
      }
      if (credits) {
        credits.t += dt;
        const a = Math.min(1, credits.t / credits.fadeIn, Math.max(0, (credits.dur - credits.t) / credits.fadeOut));
        setO(el.credits, a); if (credits.t >= credits.dur) { credits = null; setO(el.credits, 0); }
      }
      if (splashT >= 0) {
        splashT += dt;
        setO(el.splash, Math.max(0, Math.min(1, (splashDur - splashT) / 0.35)));
        if (splashT >= splashDur) { splashT = -1; setO(el.splash, 0); el.splash.classList.remove('go'); el.splash.innerHTML = ''; }
      }
      for (const h of labels) {
        h.a = damp(h.a, h.aT, 4, dt);
        setO(h.d, h.a);
        if (h.a > 0.01) setT(h.d, `translate(${h.x.toFixed(0)}px, ${h.y.toFixed(0)}px) translate(-50%, -50%)`);
      }
    },
    /** Clear everything (end of a cinematic). */
    reset(keepFade = false) {
      title = null; sub = null; credits = null; splashT = -1;
      setO(el.title, 0); setO(el.sub, 0); setO(el.credits, 0); setO(el.splash, 0); el.splash.innerHTML = '';
      S.barsT = 0; S.filmT = 0; S.gradeT = 0; S.gradeTT = 0; S.gradeFrom = S.grade; S.gradeDur = 0.8; S.stars = 0; S.starsZoom = 0;
      if (!keepFade) api.fade(0, 0.6);
      for (const h of [...labels]) h.remove();
      api.skip(false, 0);
    },
  };
  S.starsZoom = 0;
  api.starsZoom = (z) => { S.starsZoom = z; };
  return api;
}
