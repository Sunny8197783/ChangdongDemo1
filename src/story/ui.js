// Story DOM: dialogue box (typewriter, nameplate, choices + description), interaction prompt, floating NPC tags,
// non-blocking "barks", area banner and item-get card. All inside #ui, classes prefixed st-, styled with --aw-* tokens.
const CSS = `
.st-root { position:absolute; inset:0; pointer-events:none; z-index:20;
  --st-gold: var(--aw-gold, #e9c46a); --st-gold-dim: var(--aw-gold-dim, #a8844a); --st-cream: var(--aw-cream, #f6ecd2);
  --st-ink: var(--aw-ink, #14110d); --st-panel: var(--aw-panel, rgba(14,16,24,.78)); --st-border: var(--aw-panel-border, rgba(233,196,106,.55));
  --st-title: var(--aw-font-title, "Cinzel", "Noto Serif KR", "Nanum Myeongjo", serif);
  --st-body: var(--aw-font-body, "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif);
  font-family: var(--st-body); color: var(--st-cream); user-select:none; -webkit-user-select:none; }
.st-root em { font-style:normal; color: var(--st-gold); text-shadow: 0 0 10px rgba(233,196,106,.35); }
.st-root kbd { display:inline-block; min-width:1.7em; padding:.06em .45em; border-radius:5px; font: 700 .9em/1.4 var(--st-body);
  text-align:center; color: var(--st-ink); text-shadow:none; background: linear-gradient(#fff8e6, #e6d3a6);
  border:1px solid #b89a5a; box-shadow: 0 2px 0 #7d6635, 0 3px 6px rgba(0,0,0,.35); }

/* floating tags */
.st-tag { position:absolute; left:0; top:0; display:flex; flex-direction:column; align-items:center; gap:2px;
  transform: translate(-50%, -100%); will-change: transform, opacity; transition: opacity .25s; white-space:nowrap; }
.st-tag-mark { font: 900 30px/1 var(--st-title); color: #ffd75e; -webkit-text-stroke: 1.5px #5a3a10;
  text-shadow: 0 0 12px rgba(255,200,80,.9), 0 2px 0 #5a3a10; animation: st-bob 1.6s ease-in-out infinite; display:none; }
.st-tag-mark.q { color:#9fe7ff; text-shadow: 0 0 12px rgba(120,220,255,.9), 0 2px 0 #10405a; -webkit-text-stroke-color:#10405a; }
.st-tag-mark.on { display:block; }
.st-tag-name { font: 700 13px/1.2 var(--st-body); padding: 3px 10px 3px; border-radius: 10px;
  background: rgba(10,12,20,.55); border: 1px solid rgba(233,196,106,.35); text-shadow: 0 1px 2px #000; transition: opacity .25s; }
.st-tag-name small { display:block; font-size:10px; font-weight:500; opacity:.72; text-align:center; letter-spacing:.04em; }
@keyframes st-bob { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-6px) scale(1.06); } }

/* interaction prompt */
.st-prompt { position:absolute; left:50%; bottom:calc(15% + 74px); transform: translate(-50%, 8px); opacity:0; transition: opacity .2s, transform .2s;
  display:flex; align-items:center; gap:10px; padding: 8px 18px 8px 10px; border-radius: 22px;
  background: var(--st-panel); border:1px solid var(--st-border); box-shadow: 0 6px 22px rgba(0,0,0,.35); font-size:16px; }
.st-prompt.on { opacity:1; transform: translate(-50%, 0); }
.st-prompt b { color: var(--st-gold); font-weight:700; }
.st-prompt-sep { width:4px; height:4px; border-radius:50%; background: var(--st-gold-dim); }

/* bark (non-blocking speech line) */
.st-bark { position:absolute; left:50%; bottom:15%; transform: translate(-50%, 10px); opacity:0; transition: opacity .35s, transform .35s;
  max-width: min(760px, 88vw); padding: 10px 20px; border-radius: 14px; text-align:center; font-size:17px; line-height:1.5;
  background: linear-gradient(180deg, rgba(14,16,24,.72), rgba(14,16,24,.55)); border:1px solid rgba(233,196,106,.3); text-shadow:0 1px 2px #000; }
.st-bark.on { opacity:1; transform: translate(-50%, 0); }
.st-bark-name { font-weight:800; margin-right:10px; }

/* area banner */
.st-banner { position:absolute; left:0; right:0; top:22%; text-align:center; opacity:0; pointer-events:none; }
.st-banner.on { animation: st-banner 5s ease forwards; }
.st-banner-t { font: 700 54px/1.1 var(--st-title); letter-spacing:.12em; color: var(--st-cream);
  text-shadow: 0 0 24px rgba(233,196,106,.55), 0 3px 8px rgba(0,0,0,.7); }
.st-banner-line { width: 380px; max-width:70vw; height:2px; margin: 14px auto; background: linear-gradient(90deg, transparent, var(--st-gold), transparent); }
.st-banner-s { font-size:18px; letter-spacing:.2em; color: var(--st-gold); }
@keyframes st-banner { 0% { opacity:0; transform: scale(1.06); filter: blur(6px); } 12% { opacity:1; transform: scale(1); filter:none; }
  78% { opacity:1; } 100% { opacity:0; transform: scale(.98); } }

/* item get */
.st-item { position:absolute; left:50%; top:30%; transform: translate(-50%, 0); opacity:0; display:flex; flex-direction:column; align-items:center; gap:8px; }
.st-item.on { animation: st-item 4.2s ease forwards; }
.st-item-ico { width:86px; height:86px; border-radius:50%; display:grid; place-items:center; font-size:42px;
  background: radial-gradient(circle, rgba(160,255,210,.55), rgba(20,60,50,.0) 70%); box-shadow: 0 0 40px rgba(143,255,193,.5); }
.st-item-t { font: 800 30px/1.2 var(--st-title); color: var(--st-cream); text-shadow: 0 0 18px rgba(143,255,193,.6), 0 2px 6px #000; }
.st-item-s { font-size:17px; color: #bfffdc; padding: 4px 14px; border-radius: 10px; background: rgba(10,30,24,.55); border:1px solid rgba(143,255,193,.4); }
@keyframes st-item { 0% { opacity:0; transform: translate(-50%, 18px) scale(.9); } 10% { opacity:1; transform: translate(-50%,0) scale(1.04); }
  16% { transform: translate(-50%,0) scale(1); } 82% { opacity:1; } 100% { opacity:0; transform: translate(-50%, -12px); } }

/* dialogue */
.st-dlg { position:absolute; inset:0; opacity:0; transition: opacity .3s; }
.st-dlg.on { opacity:1; }
.st-dlg::before { content:''; position:absolute; left:0; right:0; bottom:0; height:42%;
  background: linear-gradient(0deg, rgba(6,6,12,.62), rgba(6,6,12,0)); }
.st-dlg::after { content:''; position:absolute; left:0; right:0; top:0; height:7vh; background: linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,0)); }
.st-box { position:absolute; left:50%; bottom:5.5vh; width:min(900px, 92vw); transform: translate(-50%, 12px); transition: transform .3s;
  min-height: 132px; padding: 30px 34px 24px; border-radius: 18px;
  background: linear-gradient(180deg, rgba(18,20,32,.9), rgba(12,13,22,.88));
  border:1px solid var(--st-border); box-shadow: 0 0 0 4px rgba(10,10,18,.35), 0 18px 50px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,240,200,.08); }
.st-dlg.on .st-box { transform: translate(-50%, 0); }
.st-box::before, .st-box::after { content:''; position:absolute; top:10px; bottom:10px; width:2px; border-radius:2px;
  background: linear-gradient(180deg, transparent, var(--st-gold-dim), transparent); }
.st-box::before { left:10px; } .st-box::after { right:10px; }
.st-name { position:absolute; left:28px; top:-19px; display:flex; align-items:baseline; gap:10px; padding: 6px 18px 7px; border-radius: 12px;
  background: linear-gradient(180deg, #2a2338, #1a1626); border:1px solid var(--st-gold); box-shadow: 0 4px 14px rgba(0,0,0,.45); }
.st-name.hide { display:none; }
.st-name-n { font: 800 19px/1 var(--st-body); letter-spacing:.04em; }
.st-name-t { font-size:12px; color: var(--st-gold); opacity:.9; letter-spacing:.06em; }
.st-text { font-size: 21px; line-height: 1.62; letter-spacing: .01em; word-break: keep-all; min-height: 2.6em; text-shadow: 0 1px 2px rgba(0,0,0,.6); }
.st-text.narr { font-style: italic; color: #e8dcc0; text-align:center; }
.st-text span { opacity:0; transition: opacity .06s; }
.st-text span.on { opacity:1; }
.st-next { position:absolute; right:26px; bottom:14px; width:0; height:0; border-left:8px solid transparent; border-right:8px solid transparent;
  border-top:10px solid var(--st-gold); opacity:0; filter: drop-shadow(0 0 6px rgba(233,196,106,.8)); }
.st-next.on { opacity:1; animation: st-next .9s ease-in-out infinite; }
@keyframes st-next { 0%,100% { transform: translateY(0); } 50% { transform: translateY(5px); } }
.st-hint { position:absolute; right:30px; bottom:-26px; font-size:12px; opacity:.6; letter-spacing:.05em; }
.st-choices { position:absolute; right: max(4vw, calc(50% - 450px)); bottom: calc(5.5vh + 150px); display:flex; flex-direction:column; gap:8px;
  align-items:stretch; min-width: 330px; max-width: min(520px, 88vw); pointer-events:auto; }
.st-choice { all:unset; cursor:pointer; display:flex; align-items:center; gap:12px; padding: 11px 20px 11px 12px; border-radius: 12px;
  font: 600 17px/1.35 var(--st-body); color: var(--st-cream); background: rgba(14,16,26,.86); border:1px solid rgba(233,196,106,.28);
  box-shadow: 0 6px 18px rgba(0,0,0,.35); transform: translateX(10px); opacity:0; animation: st-ch .28s ease forwards;
  transition: background .15s, border-color .15s, transform .15s; }
.st-choice .st-num { flex:none; width:26px; height:26px; border-radius:50%; display:grid; place-items:center; font-size:13px; font-weight:800;
  color: var(--st-ink); background: linear-gradient(#fff2cf, #d9b871); box-shadow: 0 2px 0 #7d6635; }
.st-choice.sel { background: linear-gradient(90deg, rgba(233,196,106,.28), rgba(40,32,24,.9)); border-color: var(--st-gold); transform: translateX(-6px); }
.st-choice.sel::after { content:'◆'; margin-left:auto; color: var(--st-gold); font-size:12px; padding-left:12px; }
.st-choice .st-sw { flex:none; width:12px; height:12px; border-radius:50%; box-shadow: 0 0 8px currentColor; background: currentColor; }
@keyframes st-ch { to { transform: translateX(0); opacity:1; } }
.st-desc { position:absolute; left: max(4vw, calc(50% - 450px)); bottom: calc(5.5vh + 150px); width: min(380px, 40vw);
  padding: 14px 18px; border-radius: 14px; font-size:15px; line-height:1.6; word-break: keep-all;
  background: rgba(14,16,26,.82); border: 1px solid rgba(233,196,106,.3); opacity:0; transition: opacity .2s; }
.st-desc.on { opacity:1; }
.st-desc::before { content:'◇ 설명'; display:block; font-size:11px; letter-spacing:.2em; color: var(--st-gold); margin-bottom:6px; }
@media (max-width: 760px) { .st-desc { display:none; } .st-text { font-size:18px; } .st-choices { right: 4vw; left: 4vw; min-width:0; } }
`;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);
/** '{x}' → <em>x</em> (HTML-escaped). */
export const markup = (t) => esc(t).replace(/\{([^}]*)\}/g, '<em>$1</em>');

/** Split text into chars, tracking emphasis → [{ch, em}] */
function segments(t) {
  const out = []; let em = false;
  for (const ch of String(t)) {
    if (ch === '{') { em = true; continue; }
    if (ch === '}') { em = false; continue; }
    out.push({ ch, em });
  }
  return out;
}

export function createStoryUI(game) {
  if (!document.getElementById('st-style')) {
    const st = document.createElement('style'); st.id = 'st-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  const host = document.getElementById('ui') || document.body;
  const root = document.createElement('div'); root.className = 'st-root';
  root.innerHTML = `
    <div class="st-tags"></div>
    <div class="st-prompt"><kbd>F</kbd><b class="st-prompt-n"></b><span class="st-prompt-sep"></span><span>대화하기</span></div>
    <div class="st-bark"><span class="st-bark-name"></span><span class="st-bark-text"></span></div>
    <div class="st-banner"><div class="st-banner-t"></div><div class="st-banner-line"></div><div class="st-banner-s"></div></div>
    <div class="st-item"><div class="st-item-ico"><svg width="54" height="54" viewBox="0 0 64 64" fill="none"><path d="M50 8C30 10 16 26 14 46l-4 10" stroke="#eafff4" stroke-width="3" stroke-linecap="round"/><path d="M50 8c2 14-6 30-22 38l-12 2c2-20 14-36 34-40z" fill="#8fffc1" fill-opacity=".85" stroke="#eafff4" stroke-width="2"/><path d="M24 40l10-6M27 32l12-6M31 24l12-7" stroke="#2f8a64" stroke-width="2" stroke-linecap="round"/></svg></div><div class="st-item-t"></div><div class="st-item-s"></div></div>
    <div class="st-dlg">
      <div class="st-desc"></div>
      <div class="st-choices"></div>
      <div class="st-box">
        <div class="st-name"><span class="st-name-n"></span><span class="st-name-t"></span></div>
        <div class="st-text"></div>
        <div class="st-next"></div>
        <div class="st-hint">Space / F / 클릭 — 계속</div>
      </div>
    </div>`;
  host.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const el = {
    tags: $('.st-tags'), prompt: $('.st-prompt'), promptN: $('.st-prompt-n'),
    bark: $('.st-bark'), barkName: $('.st-bark-name'), barkText: $('.st-bark-text'),
    banner: $('.st-banner'), bannerT: $('.st-banner-t'), bannerS: $('.st-banner-s'),
    item: $('.st-item'), itemT: $('.st-item-t'), itemS: $('.st-item-s'), itemIco: $('.st-item-ico'),
    dlg: $('.st-dlg'), desc: $('.st-desc'), choices: $('.st-choices'), name: $('.st-name'), nameN: $('.st-name-n'), nameT: $('.st-name-t'),
    text: $('.st-text'), next: $('.st-next'), hint: $('.st-hint'),
  };
  const restart = (node, cls) => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); };

  let promptOn = false, barkT = 0;
  const ui = {
    root, el,
    // ---------------- tags
    makeTag(name, title) {
      const t = document.createElement('div'); t.className = 'st-tag';
      t.innerHTML = `<div class="st-tag-mark"></div><div class="st-tag-name">${esc(name)}${title ? `<small>${esc(title)}</small>` : ''}</div>`;
      t.style.opacity = '0'; el.tags.appendChild(t);
      return { node: t, mark: t.firstChild, name: t.lastChild, shown: false, markKind: '', x: -1, y: -1, op: -1, nameOp: -1 };
    },
    setTagMark(tag, kind) { // '' | '!' | '?'
      if (tag.markKind === kind) return;
      tag.markKind = kind;
      tag.mark.textContent = kind;
      tag.mark.className = 'st-tag-mark' + (kind ? ' on' : '') + (kind === '?' ? ' q' : '');
    },
    placeTag(tag, x, y, op, nameOp) {
      if (!tag.shown) { tag.node.style.display = ''; tag.shown = true; }
      if (Math.abs(tag.x - x) > 0.4 || Math.abs(tag.y - y) > 0.4) { tag.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`; tag.x = x; tag.y = y; }
      if (Math.abs(tag.op - op) > 0.02) { tag.node.style.opacity = op.toFixed(2); tag.op = op; }
      if (Math.abs(tag.nameOp - nameOp) > 0.02) { tag.name.style.opacity = nameOp.toFixed(2); tag.nameOp = nameOp; }
    },
    hideTag(tag) { if (tag.shown) { tag.node.style.display = 'none'; tag.shown = false; tag.op = -1; } },
    // ---------------- prompt
    setPrompt(name) {
      const on = !!name;
      if (on && el.promptN.textContent !== name) el.promptN.textContent = name;
      if (on !== promptOn) { el.prompt.classList.toggle('on', on); promptOn = on; }
    },
    // ---------------- bark
    bark(speaker, text, seconds = 4.5) {
      el.barkName.textContent = speaker?.name || '';
      el.barkName.style.color = speaker?.color || '';
      el.barkName.style.display = speaker?.name ? '' : 'none';
      el.barkText.innerHTML = markup(text);
      el.bark.classList.add('on'); barkT = seconds;
    },
    hideBark() { barkT = 0; el.bark.classList.remove('on'); },
    banner(title, sub) {
      el.bannerT.textContent = title; el.bannerS.textContent = sub || '';
      restart(el.banner, 'on');
    },
    itemGet(title, sub) {
      el.itemT.textContent = title; el.itemS.textContent = sub || '';
      restart(el.item, 'on');
    },
    update(realDt) {
      if (barkT > 0) { barkT -= realDt; if (barkT <= 0) el.bark.classList.remove('on'); }
    },
    // ---------------- dialogue box
    showDialogue(on) { el.dlg.classList.toggle('on', on); if (!on) { ui.clearChoices(); } },
    setSpeaker(sp) {
      const named = !!sp?.name;
      el.name.classList.toggle('hide', !named);
      if (named) { el.nameN.textContent = sp.name; el.nameN.style.color = sp.color || ''; el.nameT.textContent = sp.title || ''; }
      el.text.classList.toggle('narr', !named);
    },
    /** Render all chars hidden; returns span list for the typewriter. */
    setText(t) {
      const segs = segments(t);
      el.text.innerHTML = segs.map((s) => (s.em ? `<span><em>${esc(s.ch)}</em></span>` : `<span>${esc(s.ch)}</span>`)).join('');
      el.next.classList.remove('on');
      return { spans: el.text.children, chars: segs.map((s) => s.ch) };
    },
    reveal(spans, from, to) { for (let i = from; i < to && i < spans.length; i++) spans[i].classList.add('on'); },
    setNext(on) { el.next.classList.toggle('on', on); },
    setHint(text) { el.hint.textContent = text; },
    // ---------------- choices
    showChoices(opts, onHover, onPick) {
      el.choices.innerHTML = '';
      opts.forEach((o, i) => {
        const b = document.createElement('button'); b.className = 'st-choice'; b.style.animationDelay = (i * 0.05) + 's';
        const sw = o.color ? `<span class="st-sw" style="color:${o.color}"></span>` : '';
        b.innerHTML = `<span class="st-num">${i + 1}</span>${sw}<span>${markup(o.t)}</span>`;
        b.addEventListener('mouseenter', () => onHover(i));
        b.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
        b.addEventListener('click', (e) => { e.stopPropagation(); onPick(i); });
        el.choices.appendChild(b);
      });
    },
    selectChoice(i, desc) {
      [...el.choices.children].forEach((b, k) => b.classList.toggle('sel', k === i));
      if (desc) { el.desc.innerHTML = markup(desc); el.desc.classList.add('on'); } else el.desc.classList.remove('on');
    },
    clearChoices() { el.choices.innerHTML = ''; el.desc.classList.remove('on'); },
    setVisible(on) { root.style.display = on ? '' : 'none'; },
  };
  return ui;
}
