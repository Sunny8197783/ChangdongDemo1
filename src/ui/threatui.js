// §5.6 threat UI (information only): off-screen attack arrows from game.tells.active() (ellipse at 42 % of min(w, h),
// tell colour, progress ring, flash at lock, max 4 nearest by remaining time, same frame as tellStart), off-screen enemy
// orb dots on the same ellipse, the directional damage arc (replaces the radial hurt vignette, 0.6 s) and the hazard
// edge vignette with the source name. Fixed DOM pools; transforms written only when the quantised value changes (§2.7).
import * as THREE from 'three';
import { threatColor, threatCss } from '../core/threat.js';
import { h } from './dom.js';
import { HAZARD_KO } from './text.js';

const MAX_ARROWS = 4, MAX_DOTS = 6, RING_C = 2 * Math.PI * 15;
const ARC_LIFE = 0.6, HAZ_HOLD = 0.7;

export function createThreatUI(game, { parent, onFirstArrow }) {
  // the directional damage arc replaces vfx's radial hurt vignette (vfx request; integration fix: both were shown)
  if (game.vfx && !game.vfx.isStub) game.vfx.hurtVignette = false;
  const layer = parent.appendChild(h('div', 'aw-threat'));
  const arrows = [];
  for (let i = 0; i < MAX_ARROWS; i++) {
    const el = layer.appendChild(h('div', 'aw-tarrow', `<svg viewBox="-20 -20 40 40" width="40" height="40">
      <circle class="bg" r="15"/><circle class="fg" r="15" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${RING_C.toFixed(1)}" transform="rotate(-90)"/>
      <path class="chev" d="M0 -11 L8 2 L3 2 L3 9 L-3 9 L-3 2 L-8 2 Z"/></svg>`));
    el.style.display = 'none';
    arrows.push({ el, fg: el.querySelector('.fg'), chev: el.querySelector('.chev'), on: false, x: -1, y: -1, rot: 1e9, prog: -1, col: '', locked: null, rec: null, angle: 0, id: '' });
  }
  const dots = [];
  for (let i = 0; i < MAX_DOTS; i++) { const el = layer.appendChild(h('i', 'aw-tdot')); el.style.display = 'none'; dots.push({ el, on: false, x: -1, y: -1 }); }
  const arc = layer.appendChild(h('div', 'aw-harc'));
  const haz = layer.appendChild(h('div', 'aw-hazvig', '<span></span>'));
  const hazTxt = haz.querySelector('span');

  const v = new THREE.Vector3();
  const pick = new Array(MAX_ARROWS).fill(null);
  let W = innerWidth, H = innerHeight;
  addEventListener('resize', () => { W = innerWidth; H = innerHeight; });
  let warned = false, firstArrow = false;
  let arcT = 0, arcRot = 0, hazT = 0, hazName = '', hazShown = '';
  const seenIds = new Set();

  /** Screen angle (0 = up / ahead, clockwise) of a world point around the PLAYER, in the camera's heading frame
   *  (an attacker behind the player points down even when it is in front of the camera). */
  function angleOf(p) {
    const cam = game.camera, pp = game.player?.object?.position;
    v.copy(p); if (pp) v.sub(pp); else v.sub(cam.position);
    v.transformDirection(cam.matrixWorldInverse);
    return Math.atan2(v.x, -v.z);
  }
  function place(o, a, rx, ry, cx, cy) {
    const x = Math.round(cx + Math.sin(a) * rx), y = Math.round(cy - Math.cos(a) * ry);
    if (x !== o.x || y !== o.y) { o.x = x; o.y = y; return true; }
    return false;
  }

  function update(dt) {
    const T = game.tells;
    const on = game.settings?.values?.offscreenArrows !== false && game.state === 'playing' && !game.cinematic?.active;
    const recs = on && T && typeof T.active === 'function' ? T.active() : null;
    if (on && !recs && !warned) { warned = true; console.warn('[ui] tells.active missing: no off-screen arrows'); }
    const cx = W * 0.5, cy = H * 0.5, R = 0.42 * Math.min(W, H), rx = Math.min(W * 0.46, R * 1.45), ry = R;
    // ---- choose ≤ 4 off-screen / behind records, nearest by remaining time (no allocation)
    let n = 0;
    if (recs) {
      for (let i = 0; i < recs.length; i++) {
        const r = recs[i];
        if (!r || r.targetsPlayer === false || (r.onScreen && !r.behind)) continue;
        if (n < MAX_ARROWS) { pick[n++] = r; continue; }
        let worst = 0;
        for (let k = 1; k < n; k++) if (pick[k].remaining > pick[worst].remaining) worst = k;
        if (r.remaining < pick[worst].remaining) pick[worst] = r;
      }
    }
    const cb = game.settings?.values?.colorblind;
    for (let i = 0; i < MAX_ARROWS; i++) {
      const o = arrows[i];
      const r = i < n ? pick[i] : null;
      o.rec = r;
      if (!r) { if (o.on) { o.on = false; o.el.style.display = 'none'; o.id = ''; } continue; }
      if (!o.on) { o.on = true; o.el.style.display = ''; o.rot = 1e9; o.prog = -1; o.col = ''; o.locked = null; }
      const src = r.enemy?.object?.position || r.pos;
      const a = angleOf(src);
      o.angle = a; o.id = r.id;
      const moved = place(o, a, rx, ry, cx, cy);
      const rot = Math.round(a * 57.2958 / 2) * 2;
      if (moved || rot !== o.rot) { o.rot = rot; o.el.style.transform = `translate(${o.x - 20}px,${o.y - 20}px) rotate(${rot}deg)`; }
      const col = threatCss(threatColor(r.tell || 'danger', cb).rim);
      if (col !== o.col) { o.col = col; o.el.style.setProperty('--tc', col); }
      const pg = Math.round((r.progress || 0) * 50);
      if (pg !== o.prog) { o.prog = pg; o.fg.setAttribute('stroke-dashoffset', (RING_C * (1 - pg / 50)).toFixed(1)); }
      const lk = !!r.locked;
      if (lk !== o.locked) { o.locked = lk; o.el.classList.toggle('lock', lk); }
      const key = r.enemy ? r.id + '|' + (r.enemy.uid ?? r.enemy.id ?? '') : r.id;
      if (!seenIds.has(key)) {
        seenIds.add(key); if (seenIds.size > 64) seenIds.clear();
        try { game.audio?.play?.('offscreen', { volume: 0.6 }); } catch (_) { /* */ }
        if (!firstArrow) { firstArrow = true; onFirstArrow?.(); }
      }
    }
    // ---- orb dots
    let nd = 0;
    const orbs = on ? game.enemies?.projectiles?.orbs : null;
    if (orbs) {
      const cam = game.camera;
      for (let i = 0; i < orbs.length && nd < MAX_DOTS; i++) {
        const ob = orbs[i];
        if (!ob.active || ob.reflected || !ob.g) continue;
        v.copy(ob.g.position).project(cam);
        if (v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) continue;
        const d = dots[nd++];
        if (!d.on) { d.on = true; d.el.style.display = ''; }
        if (place(d, angleOf(ob.g.position), rx + 18, ry + 18, cx, cy)) d.el.style.transform = `translate(${d.x - 5}px,${d.y - 5}px)`;
      }
    }
    for (let i = nd; i < MAX_DOTS; i++) { const d = dots[i]; if (d.on) { d.on = false; d.el.style.display = 'none'; } }
    // ---- damage arc
    if (arcT > 0) { arcT -= dt; arc.style.opacity = Math.max(0, arcT / ARC_LIFE).toFixed(2); if (arcT <= 0) arc.classList.remove('on'); }
    // ---- hazard vignette
    if (hazT > 0) {
      hazT -= dt;
      if (hazShown !== hazName) { hazShown = hazName; hazTxt.textContent = hazName; haz.classList.add('on'); }
      if (hazT <= 0) { haz.classList.remove('on'); hazShown = ''; }
    }
  }

  game.events.on('playerHurt', (p) => {
    if (!p) return;
    const k = p.attackKind;
    if (k === 'hazard' || k === 'surface' || p.surface) {
      const nm = p.attackNameKo || p.surface || HAZARD_KO.name;
      const ico = HAZARD_KO.icon[p.element] || HAZARD_KO.defaultIcon;
      hazName = `${ico} ${k === 'surface' || p.surface ? HAZARD_KO.on(nm) : nm}`;
      hazT = HAZ_HOLD;
      if (p.dot) return;
    }
    if (p.dot) return;
    const d = p.dir, pp = game.player?.object?.position;
    if (!d || !pp || !game.camera) return;
    // dir = direction the hit came FROM (source − player); fall back to the source position
    const sp = p.source?.object?.position;
    let dx = d.x, dz = d.z;
    if (sp) { dx = sp.x - pp.x; dz = sp.z - pp.z; }
    v.set(pp.x + dx, pp.y, pp.z + dz);
    const a = angleOf(v);
    arcRot = Math.round(a * 57.2958);
    arc.style.transform = `rotate(${arcRot}deg)`;
    arc.style.opacity = '1'; arc.classList.add('on');
    arcT = ARC_LIFE;
  });

  return {
    update,
    debugArrows() { const out = []; for (const o of arrows) if (o.on && o.rec) out.push({ id: o.id, angle: o.angle, progress: o.rec.progress, tell: o.rec.tell }); return out; },
    get arcOn() { return arcT > 0; },
    get hazardName() { return hazT > 0 ? hazName : ''; },
  };
}
