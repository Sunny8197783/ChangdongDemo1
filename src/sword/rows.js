// Bespoke melee looks (PLAN §3.7 "melee delta" column; owner melee).
// A row decorates the cast's archetype look (sword/looks.js gate + slash crescent) with its SIGNATURE: the first key shape of
// the §3.7 row, unique inside its element, played at the row's hook points:
//   start(L, cc, act, ctx)   the cast's first action starts (anticipation: glyph flash at the weapon)
//   strike(L, cc, act, ctx)  the first hit window / event / archetype strike frame (before the legacy fx of that frame)
// Every handle goes through L.h (kit + per-cast handle / particle budgets + castId + owner 'player'); rows run once per cast
// (no per-frame work). Gameplay (damage, hitboxes) is untouched.
import * as THREE from 'three';

export const STARRED = ['fire.charged', 'ice.nova', 'lightning.ult', 'wind.charged', 'wind.gust', 'water.ult', 'earth.charged', 'earth.ult', 'light.flash', 'light.sanctuary', 'light.ult', 'nature.roots'];

const _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0);
// cast frame (reused; rows read it synchronously)
const F = { px: 0, py: 0, pz: 0, yaw: 0, fx: 0, fz: 1, ang: 0, ix: 0, iy: 0, iz: 0, dist: 3, tgt: null };

function frame(L, a, dflt = 3, ctx = null) {
  const h = L.h, p = h.pos();
  F.px = p?.x ?? 0; F.py = p?.y ?? 0; F.pz = p?.z ?? 0;
  F.yaw = a?.yaw0 ?? h.yaw();
  F.fx = Math.sin(F.yaw); F.fz = Math.cos(F.yaw); F.ang = Math.atan2(F.fz, F.fx);
  const t = ctx?.aim?.target?.alive ? ctx.aim.target : a?.target?.alive ? a.target : null;
  F.tgt = t;
  if (t?.object) { const q = t.object.position; F.ix = q.x; F.iz = q.z; F.dist = Math.hypot(q.x - F.px, q.z - F.pz); }
  else { F.ix = F.px + F.fx * dflt; F.iz = F.pz + F.fz * dflt; F.dist = dflt; }
  F.iy = h.gy(F.ix, F.iz);
  return F;
}
/** ground point d metres ahead (+ side metres to the right) of the player */
const ahead = (L, d, side = 0) => { const x = F.px + F.fx * d - F.fz * side, z = F.pz + F.fz * d + F.fx * side; return L.h.v3(x, L.h.gy(x, z), z); };
const imp = (L, y = 0) => L.h.v3(F.ix, F.iy + y, F.iz);
const chest = (L, y = 1.1) => L.h.v3(F.px, F.py + y, F.pz);
const feet = (L) => { const p = L.h.pos(); return L.h.v3(p.x, L.h.gy(p.x, p.z), p.z); };
/** point on the slash: local swing angle th (rad, 0 = forward), radius r, height y above the player */
const onArc = (L, th, r, y = 1.1) => { const s = F.yaw + th; return L.h.v3(F.px + Math.sin(s) * r, F.py + y, F.pz + Math.cos(s) * r); };
/** ground-plane linework angle (atan2(z, x)) of local swing angle th */
const gAng = (th) => Math.PI * 0.5 - F.yaw - th;
const tip = (L) => { const o = L.h.v3(F.px + F.fx * 0.9, F.py + 1.3, F.pz + F.fz * 0.9); try { L.h.tip?.(o); } catch (_) { /* */ } return o; };
/** 2-frame weapon glyph flash (§3.6 melee anticipation; the charge line itself is the engine's blade ribbon) */
function anticip(L, cc, el, r = 0.32) {
  const p = L.h.pos(); F.px = p?.x ?? 0; F.py = p?.y ?? 0; F.pz = p?.z ?? 0; F.yaw = L.h.yaw(); F.fx = Math.sin(F.yaw); F.fz = Math.cos(F.yaw);
  L.h.line(cc, { shape: 'glyph', glyph: el, el, pos: tip(L), plane: 'billboard', r, life: 0.14, tIn: 0.04, tOut: 0.06, spin: 1.4 });
}

export const ROWS = {
  // ======================================================================== fire 화염
  'fire.basic': { sig: 'twin flame tongues on the slash leading edge + 4 embers',
    strike(L, cc, a) { frame(L, a);
      for (let i = 0; i < 2; i++) L.h.line(cc, { shape: 'crescent', el: 'fire', pos: onArc(L, (i ? 0.45 : -0.35), 2.1, 1.15 + i * 0.12), plane: 'billboard', r: 0.26 - i * 0.05, width: 0.06, life: 0.22, tIn: 0.03, tOut: 0.12, erode: true, rot: i * 2.4 + F.yaw, spin: 2.2 });
      L.h.spark(cc, onArc(L, 0.1, 1.9), 'fire', 4, _UP, { shape: 'ember', gravity: -2.5, speed: 3 });
    } },
  'fire.charged': { sig: 'fan of flame petals laid on the ground ahead of the overhead slash',
    strike(L, cc, a) { frame(L, a, 4);
      for (let i = 0; i < 7; i += 2) { const th = (i - 3) * 0.17, d = 2.2 + (3 - Math.abs(i - 3)) * 0.45, s = F.yaw + th;
        const x = F.px + Math.sin(s) * d, z = F.pz + Math.cos(s) * d;
        L.h.line(cc, { shape: 'crescent', el: 'fire', pos: L.h.v3(x, L.h.gy(x, z), z), plane: 'ground', r: 0.55, width: 0.07, life: 0.7, tIn: 0.05 + Math.abs(i - 3) * 0.03, tOut: 0.35, erode: true, rot: gAng(th) }); }
      L.h.line(cc, { shape: 'arc', arc: [gAng(0.62), gAng(-0.62)], el: 'fire', pos: feet(L), plane: 'ground', r: 4.2, width: 0.04, life: 0.5, tIn: 0, tOut: 0.3, scaleIn: 'expand', alpha: 0.7 });
      L.h.decal(cc, 'scorch', ahead(L, 3), 1.6, 1.6, { el: 'fire', alpha: 0.3 });
      L.h.spark(cc, ahead(L, 3), 'fire', 12, _UP, { shape: 'ember', gravity: -2.5, speed: 4 });
    } },
  'fire.ult': { sig: '16-ray flare ring r 7 + crater cracks glowing at the bottom',
    start(L, cc) { anticip(L, cc, 'fire', 0.5); },
    strike(L, cc, a) { frame(L, a, 5); const c = imp(L, 0); const R = L.h.rampOf('fire');
      L.h.line(cc, { shape: 'rays', n: 16, r2: 0.45, el: 'fire', pos: c, plane: 'ground', r: 7, width: 0.08, life: 0.7, tIn: 0.08, tOut: 0.35, scaleIn: 'expand', erode: true, color: R.mid, color2: R.light });
      L.h.line(cc, { shape: 'ring', el: 'fire', pos: c, plane: 'ground', r: 7, width: 0.05, life: 0.45, tIn: 0, tOut: 0.25, scaleIn: 'expand' });
      L.h.decal(cc, 'crack', c, 4.5, 6, { el: 'fire', alpha: 0.3 });
      L.h.decal(cc, 'scorch', c, 3, 4, { el: 'fire', alpha: 0.28 });
      L.h.spark(cc, imp(L, 0.4), 'fire', 24, _UP, { shape: 'ember', gravity: -2, speed: 7 });
    } },
  // ======================================================================== ice 빙결
  'ice.basic': { sig: 'frost-teeth: two 6-spoke stars along the slash edge + 4 shards',
    strike(L, cc, a) { frame(L, a);
      for (let i = 0; i < 2; i++) L.h.line(cc, { shape: 'star', points: 6, r2: 0.35, el: 'ice', pos: onArc(L, i ? 0.5 : -0.25, 2.15, 1.1), plane: 'billboard', r: 0.24 - i * 0.04, width: 0.03, life: 0.24, tIn: 0.04, tOut: 0.12, erode: true, rot: i * 0.5 });
      L.h.spark(cc, onArc(L, 0.15, 2), 'ice', 4, null, { shape: 'shard', gravity: 7, speed: 3 });
    } },
  'ice.charged': { sig: 'frost lance extending from the blade + crown of crystal spikes',
    start(L, cc) { anticip(L, cc, 'ice'); },
    strike(L, cc, a) { frame(L, a, 4); const t0 = chest(L, 1.15), end = L.h.v3(F.px + F.fx * 4.6, F.py + 1.05, F.pz + F.fz * 4.6);
      L.h.ribbon(cc, { points: [t0, end], width: 0.22, taper: 0.95, life: 0.45, el: 'ice', alpha: 0.75 });
      L.h.line(cc, { shape: 'star', points: 6, r2: 0.3, el: 'ice', pos: end, plane: 'billboard', r: 0.7, width: 0.035, life: 0.35, tIn: 0.05, tOut: 0.2 });
      const g = ahead(L, 4.6);
      L.h.line(cc, { shape: 'poly', sides: 6, el: 'ice', pos: g, plane: 'ground', r: 1.2, width: 0.035, life: 0.6, tIn: 0.08, tOut: 0.3, scaleIn: 'backOut', rot: F.ang });
      L.h.spikes(cc, 'iceSpikes', g, 6, 1.1, 0.9);
      L.h.decal(cc, 'frost', g, 1.2, 1.4, { el: 'ice', alpha: 0.3 });
      L.h.spark(cc, end, 'ice', 8, null, { shape: 'shard', gravity: 7, speed: 4 });
    } },
  'ice.nova': { sig: 'hexagonal frost ring + crystal fan radiating from the overhead impact',
    start(L, cc) { anticip(L, cc, 'ice'); },
    strike(L, cc, a) { frame(L, a, 2.2); const g = ahead(L, 2.2);
      L.h.line(cc, { shape: 'poly', sides: 6, el: 'ice', pos: g, plane: 'ground', r: 4, width: 0.045, life: 0.55, tIn: 0, tOut: 0.3, scaleIn: 'expand', rot: F.ang });
      L.h.line(cc, { shape: 'star', points: 6, r2: 0.25, el: 'ice', pos: g, plane: 'ground', r: 1.6, width: 0.04, life: 0.6, tIn: 0.06, tOut: 0.3, rot: F.ang });
      for (let i = 0; i <= 4; i++) { const s = F.yaw + (i - 2) * 0.5, d = 1.4 + (i % 2) * 0.8; const x = g.x + Math.sin(s) * d, z = g.z + Math.cos(s) * d;
        L.h.spikes(cc, 'iceSpikes', L.h.v3(x, L.h.gy(x, z), z), 1, 0.8 + (i % 2) * 0.4, 0.35); }
      L.h.decal(cc, 'frost', g, 2.4, 1.6, { el: 'ice', alpha: 0.3 });
      L.h.spark(cc, L.h.v3(g.x, g.y + 0.5, g.z), 'ice', 10, _UP, { shape: 'shard', gravity: 7, speed: 5 });
    } },
  'ice.ult': { sig: 'prism wave front erupting in sequence along the path + frost line',
    start(L, cc) { anticip(L, cc, 'ice', 0.5); },
    strike(L, cc, a) { frame(L, a, 6); const yaw = F.yaw;
      for (let k = 0; k < 4; k++) { const g = ahead(L, 2 + k * 2.4);
        L.h.after(k * 0.09, () => { L.h.line(cc, { shape: 'poly', sides: 6, el: 'ice', pos: g, plane: 'ground', r: 1.2 + k * 0.35, width: 0.04, life: 0.7, tIn: 0.05, tOut: 0.3, scaleIn: 'backOut', rot: yaw + k });
          L.h.spikes(cc, 'iceSpikes', g, 3, 1.5 + k * 0.5, 0.7); L.h.spark(cc, L.h.v3(g.x, g.y + 0.6, g.z), 'ice', 6, _UP, { shape: 'shard', gravity: 7, speed: 4 }); }); }
      L.h.line(cc, { shape: 'arc', arc: [gAng(0.12), gAng(-0.12)], el: 'ice', pos: feet(L), plane: 'ground', r: 11, width: 0.04, life: 1.2, tIn: 0.2, tOut: 0.5, alpha: 0.6 });
      L.h.decal(cc, 'frost', ahead(L, 5), 4, 4, { el: 'ice', alpha: 0.3 });
    } },
  // ======================================================================== lightning 번개
  'lightning.basic': { sig: 'arc-crawl bolt along the thrust edge + 4 crawl sparks',
    strike(L, cc, a) { frame(L, a);
      L.h.bolt(cc, { from: onArc(L, -0.5, 1.9, 1.05), to: onArc(L, 0.55, 2.2, 1.2), forks: 0, width: 0.04, halo: 0.18, life: 0.05, afterglow: 0.18, el: 'lightning', seed: cc.castId });
      L.h.spark(cc, onArc(L, 0.2, 2), 'lightning', 4, null, { shape: 'spark', gravity: 4, speed: 4 });
    } },
  'lightning.charged': { sig: 'three forked bolts thrust forward + lichtenberg under the target',
    start(L, cc) { anticip(L, cc, 'lightning'); },
    strike(L, cc, a) { frame(L, a, 5); const t0 = chest(L, 1.2);
      for (let i = 0; i < 3; i++) L.h.bolt(cc, { from: t0, to: L.h.v3(F.ix + (i - 1) * 0.9 * F.fz, F.iy + 1 + i * 0.2, F.iz - (i - 1) * 0.9 * F.fx), forks: 2, width: 0.1, halo: 0.3, life: 0.06, afterglow: 0.25, el: 'lightning', seed: cc.castId * 3 + i });
      L.h.decal(cc, 'lichtenberg', imp(L), 1.8, 1.0, { el: 'lightning', alpha: 0.32 });
      L.h.line(cc, { shape: 'star', points: 4, r2: 0.16, el: 'lightning', pos: imp(L, 1.1), plane: 'billboard', r: 0.6, width: 0.03, life: 0.1, tIn: 0, tOut: 0.06 });
      L.h.spark(cc, imp(L, 1), 'lightning', 8, null, { shape: 'spark', gravity: 4, speed: 5 });
    } },
  'lightning.mine': { sig: 'rotating dotted triangle on the ground where the thrust plants the mine',
    start(L, cc) { anticip(L, cc, 'lightning'); },
    strike(L, cc, a) { frame(L, a, 1.6); const g = ahead(L, 1.6);
      L.h.line(cc, { shape: 'poly', sides: 3, el: 'lightning', pos: g, plane: 'ground', r: 0.9, width: 0.035, life: 1.6, tIn: 0.15, tOut: 0.4, spin: 1.1, alpha: 0.45 });
      L.h.line(cc, { shape: 'dots', n: 12, el: 'lightning', pos: g, plane: 'ground', r: 1.25, width: 0.05, life: 1.6, tIn: 0.2, tOut: 0.4, spin: -0.7, alpha: 0.4 });
      L.h.bolt(cc, { from: chest(L, 1.2), to: L.h.v3(g.x, g.y + 0.1, g.z), forks: 1, width: 0.06, halo: 0.2, life: 0.05, afterglow: 0.2, el: 'lightning', seed: cc.castId });
      L.h.spark(cc, L.h.v3(g.x, g.y + 0.2, g.z), 'lightning', 6, _UP, { shape: 'spark', gravity: 4, speed: 4 });
    } },
  'lightning.dash': { sig: 'one straight bolt along the iaido line + 4-point star at its end',
    start(L, cc) { const p = L.h.pos(); cc.data.from = L.h.v3(p.x, p.y + 1.05, p.z); },
    strike(L, cc, a) { frame(L, a, 8);
      const from = cc.data.from || chest(L, 1.05), to = L.h.v3(F.px + F.fx * 9, F.py + 1.05, F.pz + F.fz * 9);
      L.h.bolt(cc, { from, to, forks: 1, width: 0.08, halo: 0.28, life: 0.06, afterglow: 0.3, el: 'lightning', seed: cc.castId });
      L.h.line(cc, { shape: 'star', points: 4, r2: 0.15, el: 'lightning', pos: to, plane: 'billboard', r: 0.6, width: 0.03, life: 0.16, tIn: 0.08, tOut: 0.08 });
      L.h.spark(cc, to, 'lightning', 8, null, { shape: 'spark', gravity: 4, speed: 4 });
    } },
  'lightning.ult': { sig: 'dark cloud-glyph ring overhead + paced vertical strikes (≤ 2 per 0.3 s)',
    start(L, cc) { anticip(L, cc, 'lightning', 0.5); },
    strike(L, cc, a) { frame(L, a, 5); const c = imp(L, 0); const R = L.h.rampOf('lightning');
      L.h.line(cc, { shape: 'glyph', glyph: 'lightning', el: 'lightning', pos: L.h.v3(c.x, c.y + 9, c.z), plane: 'flat', r: 3.2, life: 2.2, tIn: 0.3, tOut: 0.6, spin: 0.25, alpha: 0.75, color: R.mid, color2: R.dark });
      L.h.line(cc, { shape: 'dots', n: 28, el: 'lightning', pos: L.h.v3(c.x, c.y + 8.8, c.z), plane: 'flat', r: 4.4, width: 0.08, life: 2.2, tIn: 0.3, tOut: 0.6, spin: -0.4, alpha: 0.5 });
      for (let k = 0; k < 3; k++) { const s = k * 2.2 + cc.castId, x = c.x + Math.cos(s) * 1.6 * k, z = c.z + Math.sin(s) * 1.6 * k, q = L.h.v3(x, L.h.gy(x, z), z);
        L.h.after(k * 0.3, () => { L.h.bolt(cc, { from: L.h.v3(q.x, q.y + 8.6, q.z), to: q, forks: 2, width: 0.1, halo: 0.3, life: 0.05, afterglow: 0.25, el: 'lightning', seed: cc.castId + k * 13 });
          L.h.decal(cc, 'lichtenberg', q, 1.6, 1.2, { el: 'lightning', alpha: 0.3 }); }); }
    } },
  // ======================================================================== wind 바람
  'wind.basic': { sig: 'thin air-blade crescent thrown off the slash + 3 leaf flecks',
    strike(L, cc, a) { frame(L, a);
      L.h.line(cc, { shape: 'crescent', el: 'wind', pos: onArc(L, 0.05, 2.4, 1.15), plane: 'billboard', r: 0.55, width: 0.04, life: 0.24, tIn: 0.02, tOut: 0.14, rot: F.yaw + 1.2, spin: 4, alpha: 0.7 });
      L.h.spark(cc, onArc(L, 0.2, 2), 'wind', 3, null, { shape: 'leaf', gravity: 1, speed: 3 });
    } },
  'wind.charged': { sig: '3 curved streamlines sweeping the cone + an expanding arc front (no fog)',
    start(L, cc) { anticip(L, cc, 'wind'); },
    strike(L, cc, a) { frame(L, a, 5);
      for (let i = 0; i < 3; i++) { const side = (i - 1) * 0.9, pts = [];
        for (let k = 0; k <= 4; k++) { const d = 0.8 + k * 1.3, bend = Math.sin(k * 0.9 + i) * 0.5 + side * (0.4 + k * 0.25); pts.push(L.h.v3(F.px + F.fx * d - F.fz * bend, F.py + 0.9 + i * 0.25, F.pz + F.fz * d + F.fx * bend)); }
        L.h.ribbon(cc, { points: pts, width: 0.16, taper: 0.9, life: 0.4, el: 'wind', alpha: 0.6, tailSat: 0.3 }); }
      L.h.line(cc, { shape: 'arc', arc: [gAng(0.7), gAng(-0.7)], el: 'wind', pos: feet(L), plane: 'ground', r: 6, width: 0.05, life: 0.42, tIn: 0, tOut: 0.25, scaleIn: 'expand', alpha: 0.7 });
      L.h.spark(cc, ahead(L, 3), 'wind', 8, null, { shape: 'leaf', gravity: 1, speed: 5 });
    } },
  'wind.gust': { sig: 'short crescent wave (ground arc + 2 streamlines) off the slashR',
    strike(L, cc, a) { frame(L, a, 3);
      L.h.line(cc, { shape: 'arc', arc: [gAng(1.0), gAng(-1.0)], el: 'wind', pos: feet(L), plane: 'ground', r: 3.4, width: 0.06, life: 0.38, tIn: 0, tOut: 0.22, scaleIn: 'expand', alpha: 0.75 });
      for (let i = 0; i < 2; i++) { const s = i ? 1 : -1, pts = [];
        for (let k = 0; k < 4; k++) pts.push(onArc(L, s * (0.2 + k * 0.22), 1 + k * 0.8, 1 + k * 0.08));
        L.h.ribbon(cc, { points: pts, width: 0.12, taper: 0.9, life: 0.32, el: 'wind', alpha: 0.6 }); }
      L.h.spark(cc, ahead(L, 2), 'wind', 6, null, { shape: 'leaf', gravity: 1, speed: 4 });
    } },
  'wind.ult': { sig: 'ground spiral band + 3 helical streamlines of the tornado',
    start(L, cc) { anticip(L, cc, 'wind', 0.5); },
    strike(L, cc, a) { frame(L, a, 5); const c = imp(L, 0);
      L.h.line(cc, { shape: 'spiral', turns: 1.4, arms: 3, r2: 0.15, el: 'wind', pos: c, plane: 'ground', r: 4.2, width: 0.06, life: 2.4, tIn: 0.2, tOut: 0.6, spin: 1.6, alpha: 0.5 });
      for (let i = 0; i < 3; i++) { const pts = [];
        for (let k = 0; k < 7; k++) { const t = k / 6, s = i * 2.094 + t * 5, r = 1 + t * 2.6; pts.push(L.h.v3(c.x + Math.cos(s) * r, c.y + 0.3 + t * 8, c.z + Math.sin(s) * r)); }
        L.h.ribbon(cc, { points: pts, width: 0.22, taper: 0.8, life: 1.2, el: 'wind', alpha: 0.4 }); }
      L.h.spark(cc, imp(L, 1), 'wind', 24, _UP, { shape: 'leaf', gravity: -1, speed: 5 });
    } },
  // ======================================================================== water 물
  'water.basic': { sig: 'crest line riding the slashR edge + 4 droplets',
    strike(L, cc, a) { frame(L, a);
      L.h.line(cc, { shape: 'arc', arc: [gAng(0.7), gAng(-0.7)], el: 'water', pos: chest(L, 1.15), plane: 'flat', r: 2.35, width: 0.04, life: 0.24, tIn: 0.02, tOut: 0.14, alpha: 0.85 });
      L.h.spark(cc, onArc(L, 0.2, 2.1), 'water', 4, null, { shape: 'droplet', gravity: 12, speed: 3 });
    } },
  'water.charged': { sig: 'wave sheet launched from the blade: two crest arcs rolling forward + foam ripples',
    start(L, cc) { anticip(L, cc, 'water'); },
    strike(L, cc, a) { frame(L, a, 5); const o = feet(L), a0 = gAng(0.55), a1 = gAng(-0.55), R = L.h.rampOf('water');
      for (let i = 0; i < 2; i++) L.h.after(i * 0.1, () => L.h.line(cc, { shape: 'arc', arc: [a0, a1], el: 'water', pos: o, plane: 'ground', r: 5.5 - i * 1.2, width: 0.07 - i * 0.02, life: 0.55, tIn: 0, tOut: 0.3, scaleIn: 'expand', color: R.mid, color2: R.light, alpha: 0.8 }));
      L.h.line(cc, { shape: 'ripple', el: 'water', pos: ahead(L, 4), plane: 'ground', r: 1.8, width: 0.03, life: 1.0, tOut: 0.4, alpha: 0.35 });
      L.h.decal(cc, 'ripple', ahead(L, 4), 1.6, 1.2, { el: 'water', alpha: 0.3 });
      L.h.spark(cc, ahead(L, 4), 'water', 12, _UP, { shape: 'droplet', gravity: 12, speed: 5 });
    } },
  'water.ult': { sig: 'three concentric outward wave rings with foam lines (never > 25 % of the screen)',
    start(L, cc) { anticip(L, cc, 'water', 0.5); },
    strike(L, cc) { const c = feet(L); c.y += 0.05; const R = L.h.rampOf('water');
      for (let k = 0; k < 3; k++) L.h.after(k * 0.35, () => { L.h.line(cc, { shape: 'ring', el: 'water', pos: c, plane: 'ground', r: 6 + k * 2.5, width: 0.07, life: 1.1, tIn: 0, tOut: 0.5, scaleIn: 'expand', color: R.mid, alpha: 0.8 });
        L.h.line(cc, { shape: 'ring', el: 'water', pos: c, plane: 'ground', r: 5.4 + k * 2.5, width: 0.03, life: 1.0, tIn: 0.05, tOut: 0.5, scaleIn: 'expand', color: R.dark, color2: R.mid, alpha: 0.6 }); });
      L.h.decal(cc, 'ripple', c, 5, 4, { el: 'water', alpha: 0.25 });
      L.h.spark(cc, L.h.v3(c.x, c.y + 0.5, c.z), 'water', 12, _UP, { shape: 'droplet', gravity: 12, speed: 6 });
    } },
  // ======================================================================== earth 대지
  'earth.basic': { sig: 'two strata chips flung off the chipped slash edge',
    strike(L, cc, a) { frame(L, a);
      for (let i = 0; i < 2; i++) { const s = F.yaw + 0.3;
        L.h.mesh(cc, 'earth.chip', { pos: onArc(L, i ? 0.4 : -0.2, 2, 1.05), scale: 0.9 - i * 0.2, vel: L.h.v3(Math.sin(s) * 3, 2.5, Math.cos(s) * 3), gravity: 14, spin: 6, spinAxis: L.h.v3(1, 0.4, 0.2).normalize(), life: 0.36, tIn: 0.02, tOut: 0.12 }); }
      L.h.spark(cc, onArc(L, 0.1, 1.9), 'earth', 4, null, { shape: 'rock', gravity: 16, speed: 4 });
    } },
  'earth.charged': { sig: 'angled strata spikes erupting from the overhead impact point forward + crack line',
    start(L, cc) { anticip(L, cc, 'earth'); },
    strike(L, cc, a) { frame(L, a, 3); const g = ahead(L, 1.8);
      L.h.motif(cc, 'earth', 'wave', { pos: g, dir: L.h.v3(F.fx, 0, F.fz), r: 4.2 });
      L.h.decal(cc, 'crack', g, 1.6, 1.6, { el: 'earth', alpha: 0.32 });
    } },
  'earth.ult': { sig: 'radial crack decal glowing at the bottom + 3 concentric uplift rings of rock + low dust ring',
    start(L, cc) { anticip(L, cc, 'earth', 0.5); },
    strike(L, cc) { const c = feet(L);
      L.h.decal(cc, 'crack', c, 7, 6, { el: 'earth', alpha: 0.32 });
      for (let k = 0; k < 3; k++) L.h.after(k * 0.22, () => {
        L.h.line(cc, { shape: 'poly', sides: 4, el: 'earth', pos: c, plane: 'ground', r: 3 + k * 2.6, width: 0.06, life: 0.6, tIn: 0, tOut: 0.3, scaleIn: 'expand', rot: k * 0.4 });
        for (let i = 0; i < 2; i++) { const s = i * Math.PI + k * 0.9, r = 3 + k * 2.6; L.h.mesh(cc, 'earth.rock', { pos: L.h.v3(c.x + Math.cos(s) * r, c.y + 0.15, c.z + Math.sin(s) * r), scale: 0.45, vel: L.h.v3(0, 3.5, 0), gravity: 12, spin: 3, life: 0.7, tIn: 0.04, tOut: 0.25 }); } });
      L.h.spark(cc, L.h.v3(c.x, c.y + 0.3, c.z), 'earth', 12, _UP, { shape: 'rock', gravity: 16, speed: 6 });
    } },
  // ======================================================================== nature 자연
  'nature.basic': { sig: 'thorns bristling outward from the slashL edge + petal flecks',
    strike(L, cc, a) { frame(L, a);
      for (let i = 0; i < 2; i++) { const th = i ? 0.45 : -0.3; _a.set(Math.sin(F.yaw + th), 0.25, Math.cos(F.yaw + th)); _q.setFromUnitVectors(_UP, _a.normalize());
        L.h.mesh(cc, 'nature.thorn', { pos: onArc(L, th, 2.05, 1.1), quat: _q, scale: 0.9, life: 0.28, tIn: 0.04, tOut: 0.12 }); }
      L.h.spark(cc, onArc(L, 0.1, 1.9), 'nature', 4, null, { shape: 'petal', gravity: 1.5, speed: 2.5 });
    } },
  'nature.charged': { sig: 'seed pod thrust into a 5-petal flower + petal drift',
    start(L, cc) { anticip(L, cc, 'nature'); },
    strike(L, cc, a) { frame(L, a, 3.2); const g = imp(L, 0.02);
      L.h.mesh(cc, 'nature.pod', { pos: L.h.v3(g.x, g.y + 0.3, g.z), scale: 1.1, life: 0.35, tIn: 0.05, tOut: 0.15 });
      for (let i = 0; i <= 4; i++) { const s = i * 1.2566 + F.ang; _a.set(Math.cos(s), 1.2, Math.sin(s)); const q = new THREE.Quaternion().setFromUnitVectors(_UP, _a.normalize());
        const p = L.h.v3(g.x + Math.cos(s) * 0.35, g.y + 0.08, g.z + Math.sin(s) * 0.35);
        L.h.after(0.12, () => L.h.mesh(cc, 'nature.petal', { pos: p, quat: q, scale: 1.2, life: 0.9, tIn: 0.12, tOut: 0.3 })); }
      L.h.decal(cc, 'flower', g, 1.4, 1.6, { el: 'nature', alpha: 0.32 });
      L.h.spark(cc, L.h.v3(g.x, g.y + 0.6, g.z), 'nature', 14, _UP, { shape: 'petal', gravity: 1, speed: 3 });
    } },
  'nature.roots': { sig: 'vine tubes growing around the target with thorn tips + leaf-glyph decal',
    start(L, cc) { anticip(L, cc, 'nature'); },
    strike(L, cc, a, ctx) { frame(L, a, 6, ctx); const g = imp(L, 0);
      L.h.decal(cc, 'flower', g, 2.2, 3, { el: 'nature', alpha: 0.3 });
      L.h.motif(cc, 'nature', 'pillar', { pos: g, r: 0.9, h: 1.7 });
    } },
  'nature.ult': { sig: 'seed pods blooming into flowers in a ring + root zone',
    start(L, cc) { anticip(L, cc, 'nature', 0.5); },
    strike(L, cc) { const p = feet(L);
      for (let k = 0; k < 3; k++) { const s = k * 2.094 + cc.castId * 0.4, r = 3 + k * 1.5, x = p.x + Math.cos(s) * r, z = p.z + Math.sin(s) * r, g = L.h.v3(x, L.h.gy(x, z), z);
        L.h.after(0.15 + k * 0.2, () => { L.h.motif(cc, 'nature', 'burst', { pos: g, r: 1.4, tier: 'U' }); L.h.decal(cc, 'flower', g, 1.6, 3, { el: 'nature', alpha: 0.3 }); }); }
      L.h.motif(cc, 'nature', 'zone', { pos: p, r: 6, life: 3 });
    } },
  // ======================================================================== light 빛
  'light.basic': { sig: 'halo-tick ring on the slashR tip + 4-point glint + 4 motes',
    strike(L, cc, a) { frame(L, a); const p = onArc(L, 0.35, 2.15, 1.2);
      L.h.line(cc, { shape: 'ticks', n: 12, r2: 0.75, el: 'light', pos: p, plane: 'billboard', r: 0.32, width: 0.025, life: 0.24, tIn: 0.04, tOut: 0.12, spin: 2 });
      L.h.line(cc, { shape: 'star', points: 4, r2: 0.15, el: 'light', pos: p, plane: 'billboard', r: 0.42, width: 0.025, life: 0.08, tIn: 0, tOut: 0.04 });
      L.h.spark(cc, p, 'light', 4, null, { shape: 'mote', gravity: -0.5, speed: 1.5 });
    } },
  'light.charged': { sig: 'halo ring with ticks above the target + thin ray pillar + ground halo',
    start(L, cc) { anticip(L, cc, 'light'); },
    strike(L, cc, a) { frame(L, a, 3.5); const g = imp(L, 0);
      L.h.line(cc, { shape: 'ticks', n: 24, r2: 0.82, el: 'light', pos: L.h.v3(g.x, g.y + 3.4, g.z), plane: 'flat', r: 1.1, width: 0.03, life: 0.7, tIn: 0.1, tOut: 0.3, spin: 0.8 });
      L.h.line(cc, { shape: 'ring', el: 'light', pos: L.h.v3(g.x, g.y + 3.4, g.z), plane: 'flat', r: 1.25, width: 0.03, life: 0.7, tIn: 0.1, tOut: 0.3 });
      L.h.motif(cc, 'light', 'pillar', { pos: g, r: 0.5, h: 3.2 });
      L.h.spark(cc, L.h.v3(g.x, g.y + 2, g.z), 'light', 10, null, { shape: 'mote', gravity: 0.6, speed: 1.2 });
    } },
  'light.flash': { sig: '8 thin radial rays + expanding halo ring with ticks + one star glint (no dome)',
    strike(L, cc) { const g = feet(L), c = L.h.v3(g.x, L.h.pos().y + 1.1, g.z);
      L.h.line(cc, { shape: 'rays', n: 8, r2: 0.25, el: 'light', pos: c, plane: 'billboard', r: 2.6, width: 0.035, life: 0.32, tIn: 0, tOut: 0.2, scaleIn: 'expand' });
      L.h.line(cc, { shape: 'ticks', n: 24, r2: 0.85, el: 'light', pos: g, plane: 'ground', r: 6, width: 0.04, life: 0.5, tIn: 0, tOut: 0.3, scaleIn: 'expand' });
      L.h.line(cc, { shape: 'ring', el: 'light', pos: g, plane: 'ground', r: 6.1, width: 0.03, life: 0.45, tIn: 0, tOut: 0.25, scaleIn: 'expand', alpha: 0.7 });
      L.h.line(cc, { shape: 'star', points: 4, r2: 0.12, el: 'light', pos: c, plane: 'billboard', r: 0.8, width: 0.03, life: 0.07, tIn: 0, tOut: 0.04 });
      L.h.spark(cc, c, 'light', 8, null, { shape: 'mote', gravity: -0.4, speed: 3 });
    } },
  'light.sanctuary': { sig: 'ground hexagram + ivory halo linework (lines only) + descending motes',
    strike(L, cc) { const g = feet(L);
      L.h.line(cc, { shape: 'glyph', glyph: 'hexagram', el: 'light', pos: g, plane: 'ground', r: 4.6, life: 8, tIn: 0.3, tOut: 0.5, spin: 0.12, alpha: 0.35 });
      L.h.line(cc, { shape: 'ticks', n: 36, r2: 0.9, el: 'light', pos: g, plane: 'ground', r: 5, width: 0.035, life: 8, tIn: 0.3, tOut: 0.5, spin: -0.15, alpha: 0.35 });
      L.h.spark(cc, L.h.v3(g.x, g.y + 2.6, g.z), 'light', 12, null, { shape: 'mote', gravity: 0.5, speed: 0.6 });
    } },
  'light.ult': { sig: 'central ray beam + 2 orbiting thin rays + halo rings descending (no white column)',
    start(L, cc) { anticip(L, cc, 'light', 0.5); },
    strike(L, cc, a) { frame(L, a, 6); const g = imp(L, 0);
      L.h.mesh(cc, 'light.ray', { pos: g, scale: L.h.v3(0.8, 5, 0.8), life: 1.6, tIn: 0.15, tOut: 0.4 });
      for (let i = 0; i < 2; i++) { const s = i * Math.PI + cc.castId; L.h.mesh(cc, 'light.ray', { pos: L.h.v3(g.x + Math.cos(s) * 1.4, g.y, g.z + Math.sin(s) * 1.4), scale: L.h.v3(0.3, 4, 0.3), life: 1.4, tIn: 0.25, tOut: 0.4 }); }
      for (let k = 0; k < 3; k++) L.h.line(cc, { shape: 'ticks', n: 24, r2: 0.84, el: 'light', pos: L.h.v3(g.x, g.y + 6 - k * 1.8, g.z), plane: 'flat', r: 1.8 + k * 0.4, width: 0.035, life: 1.6, tIn: 0.15 + k * 0.12, tOut: 0.4, spin: (k % 2 ? -1 : 1) * 0.7 });
      L.h.line(cc, { shape: 'ring', el: 'light', pos: g, plane: 'ground', r: 3, width: 0.04, life: 1.6, tIn: 0.15, tOut: 0.4, alpha: 0.6 });
      L.h.spark(cc, L.h.v3(g.x, g.y + 3, g.z), 'light', 12, null, { shape: 'mote', gravity: 0.6, speed: 1 });
    } },
  // ======================================================================== shadow 그림자
  'shadow.basic': { sig: 'ink crescent bite at the slashR tip + 4 soul wisps',
    strike(L, cc, a) { frame(L, a); const p = onArc(L, 0.3, 2.1, 1.1);
      L.h.mesh(cc, 'shadow.crescent', { pos: p, quat: _q.setFromAxisAngle(_UP, F.yaw), scale: 0.8, life: 0.26, tIn: 0.03, tOut: 0.12 });
      L.h.spark(cc, p, 'shadow', 4, null, { shape: 'wisp', gravity: -0.5, speed: 1.5 });
    } },
  'shadow.charged': { sig: 'ink tendril drawn from the target to the hand + inward soul wisps',
    start(L, cc) { anticip(L, cc, 'shadow'); },
    strike(L, cc, a) { frame(L, a, 4); const from = imp(L, 1.0), to = chest(L, 1.2);
      const mid = L.h.v3((from.x + to.x) * 0.5 - F.fz * 0.7, (from.y + to.y) * 0.5 + 0.5, (from.z + to.z) * 0.5 + F.fx * 0.7);
      L.h.ribbon(cc, { points: [from, mid, to], width: 0.2, taper: 0.9, life: 0.6, el: 'shadow', alpha: 0.85 });
      L.h.line(cc, { shape: 'glyph', glyph: 'shadow', el: 'shadow', pos: L.h.v3(from.x, from.y + 0.9, from.z), plane: 'billboard', r: 0.45, life: 0.5, tIn: 0.08, tOut: 0.2 });
      L.h.spark(cc, from, 'shadow', 12, L.h.v3(to.x - from.x, 0.3, to.z - from.z).normalize(), { shape: 'wisp', gravity: 0, speed: 4 });
    } },
  'shadow.step': { sig: 'ink splash at departure and arrival + one crescent bite',
    start(L, cc) { const g = feet(L), R = L.h.rampOf('shadow');
      L.h.line(cc, { shape: 'stipple', el: 'shadow', pos: g, plane: 'ground', r: 1.1, width: 0.05, life: 0.9, tIn: 0, tOut: 0.4, alpha: 0.35, color: R.mid });
      L.h.spark(cc, L.h.v3(g.x, g.y + 0.6, g.z), 'shadow', 6, null, { shape: 'wisp', gravity: -0.5, speed: 2 }); },
    strike(L, cc, a) { frame(L, a); const g = feet(L), R = L.h.rampOf('shadow');
      L.h.line(cc, { shape: 'stipple', el: 'shadow', pos: g, plane: 'ground', r: 1.3, width: 0.05, life: 0.9, tIn: 0, tOut: 0.4, alpha: 0.35, color: R.mid });
      L.h.mesh(cc, 'shadow.crescent', { pos: onArc(L, 0, 1.4, 1.1), quat: _q.setFromAxisAngle(_UP, F.yaw), scale: 1.3, life: 0.32, tIn: 0.03, tOut: 0.14 });
    } },
  'shadow.hex': { sig: 'small crescent-eye glyph over the target (kept readable)',
    strike(L, cc, a, ctx) { frame(L, a, 6, ctx); const g = imp(L, 0);
      L.h.line(cc, { shape: 'glyph', glyph: 'shadow', el: 'shadow', pos: L.h.v3(g.x, g.y + 2.4, g.z), plane: 'billboard', r: 0.5, life: 1.4, tIn: 0.12, tOut: 0.3, spin: 0.4 });
      L.h.line(cc, { shape: 'dots', n: 16, el: 'shadow', pos: g, plane: 'ground', r: 4, width: 0.05, life: 1.2, tIn: 0.12, tOut: 0.4, spin: 0.6, alpha: 0.35, color: L.h.rampOf('shadow').light });
      L.h.spark(cc, L.h.v3(g.x, g.y + 1, g.z), 'shadow', 8, null, { shape: 'wisp', gravity: -0.4, speed: 1.5 });
    } },
  'shadow.ult': { sig: 'dark core with a crisp violet ring + 5 ink tendrils',
    start(L, cc) { anticip(L, cc, 'shadow', 0.5); },
    strike(L, cc, a, ctx) { frame(L, a, 6, ctx); const g = imp(L, 0), R = L.h.rampOf('shadow');
      L.h.line(cc, { shape: 'ring', el: 'shadow', pos: g, plane: 'ground', r: 5, width: 0.06, life: 3, tIn: 0.2, tOut: 0.5, color: R.light, alpha: 0.8 });
      L.h.line(cc, { shape: 'glyph', glyph: 'shadow', el: 'shadow', pos: g, plane: 'ground', r: 2.6, life: 3, tIn: 0.2, tOut: 0.5, spin: -0.5, alpha: 0.5, color: R.mid });
      for (let i = 0; i <= 4; i++) { const s = i * 1.2566 + cc.castId; _a.set(Math.cos(s) * 0.6, 1, Math.sin(s) * 0.6); _q.setFromUnitVectors(_UP, _a.normalize());
        L.h.mesh(cc, 'shadow.tendril', { pos: L.h.v3(g.x + Math.cos(s) * 4.6, g.y, g.z + Math.sin(s) * 4.6), quat: _q, scale: 1.4, life: 2.4, tIn: 0.2 + i * 0.05, tOut: 0.4 }); }
      L.h.spark(cc, L.h.v3(g.x, g.y + 1, g.z), 'shadow', 12, null, { shape: 'wisp', gravity: 0, speed: 3 });
    } },
};

// ============================================================================ archetype-level v4 looks (§3.7: "a registry skill without a row
// inherits its archetype look — the archetype's v4 implementation with the element's motifs"). One element motif at the strike, placed
// by the melee rules of §3.6: ground motifs start at the weapon's impact point and run forward; the full burst once per cast.
const burstAt = (L, cc, el, p, r) => { if (cc.bursts >= 1) return null; cc.bursts++; return L.h.motif(cc, el, 'burst', { pos: p, r, n: 8, tier: cc.tier }); };
const fwd = (L) => L.h.v3(F.fx, 0, F.fz);
const ARCH = {
  hit: (r) => ({ strike(L, cc, a, ctx) { frame(L, a, 5, ctx); burstAt(L, cc, cc.el, imp(L, 1.0), r); } }),
  ground: (len) => ({ strike(L, cc, a, ctx) { frame(L, a, 2, ctx); L.h.motif(cc, cc.el, 'wave', { pos: ahead(L, 1.2), dir: fwd(L), r: len, arc: 0.5 }); } }),
  nova: (r) => ({ strike(L, cc, a, ctx) { frame(L, a, 2, ctx); const g = ahead(L, 1.6); burstAt(L, cc, cc.el, g, r);
    L.h.line(cc, { shape: 'ring', el: cc.el, pos: g, plane: 'ground', r: r * 2, width: 0.045, life: 0.45, tIn: 0, tOut: 0.25, scaleIn: 'expand', alpha: 0.75 }); } }),
  pillar: () => ({ strike(L, cc, a, ctx) { frame(L, a, 4, ctx); L.h.motif(cc, cc.el, 'pillar', { pos: imp(L, 0), r: 0.7, h: 3 }); } }),
  zone: (r, life) => ({ strike(L, cc, a, ctx) { frame(L, a, 3, ctx); L.h.motif(cc, cc.el, 'zone', { pos: imp(L, 0), r, life }); } }),
  aura: () => ({ strike(L, cc) { L.h.motif(cc, cc.el, 'aura', { pos: feet(L), follow: L.h.playerObj?.(), r: 0.9, life: 1.6 }); } }),
  summon: () => ({ strike(L, cc, a, ctx) { frame(L, a, 2.5, ctx); L.h.motif(cc, cc.el, 'summon', { pos: imp(L, 0), r: 1 }); } }),
  cone: () => ({ strike(L, cc, a, ctx) { frame(L, a, 3, ctx); L.h.motif(cc, cc.el, 'wave', { pos: ahead(L, 0.8), dir: fwd(L), r: 5, arc: 0.8 }); } }),
};
const cast = { start(L, cc) { anticip(L, cc, cc.el); } };
const withCast = (o) => Object.assign({}, cast, o);
export const ARCH_LOOKS = {
  projectile: withCast(ARCH.hit(1.0)), volley: withCast(ARCH.hit(1.0)), lob: withCast(ARCH.hit(1.4)), chain: withCast(ARCH.hit(0.9)),
  mark: withCast(ARCH.hit(0.8)), bubble: withCast(ARCH.hit(1.0)), tether: withCast(ARCH.hit(0.9)), grapple: withCast(ARCH.hit(0.9)), chainbind: withCast(ARCH.hit(1.0)),
  crawler: withCast(ARCH.ground(6)), lane: withCast(ARCH.ground(6)), dash: withCast(ARCH.ground(5)), blink: withCast(ARCH.ground(4)), beam: withCast(ARCH.ground(8)),
  nova: withCast(ARCH.nova(1.6)), leapslam: withCast(ARCH.nova(1.8)), rain: withCast(ARCH.nova(2.2)),
  pillar: withCast(ARCH.pillar()), cone: withCast(ARCH.cone()),
  zone: withCast(ARCH.zone(3, 3)), wall: withCast(ARCH.zone(2.5, 3)), mine: withCast(ARCH.zone(1.2, 2)),
  summon: withCast(ARCH.summon()), buff: withCast(ARCH.aura()),
};
