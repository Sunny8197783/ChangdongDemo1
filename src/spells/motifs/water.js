// 물 water motifs (PLAN v4 §3.5, magic): normal-blended droplet teardrops with a highlight, a curling wave `sheet` ribbon mesh with a
// crest line (aGrad → `light`/`hi` at the crest), ripple and foam linework, droplet crowns ≤ 12. Never: flat blue planes covering
// the screen. Owner: magic.
import * as THREE from 'three';
import { lathe, sheet, merge, groundAt, nearGround, qFwd, qYawTilt, rng, flatDir, arcPoints, v3, TAU, H } from './common.js';

export const SHAPES = ['water.droplet', 'water.sheet', 'water.bead'];
const UPV = v3(0, 1, 0);

function shapes() {
  // teardrop along +Z (round head at +Z, point trailing to −Z), highlight via aGrad on the upper front
  const drop = lathe([[0.0, -0.55], [0.06, -0.38], [0.13, -0.18], [0.17, 0.0], [0.15, 0.1], [0.08, 0.17], [0.0, 0.19]], 10, { grad: (t, th) => 0.35 + 0.45 * t + (Math.sin(th) > 0.6 && t > 0.6 ? 0.55 : 0) });
  drop.rotateX(Math.PI / 2);
  // curling wave sheet: cross-section rises and curls forward (+Z); crest at the top
  const curve = []; for (let i = 0; i <= 10; i++) { const t = i / 10, a = t * 2.1; curve.push([Math.sin(a) * 0.9 + t * 0.25, (1 - Math.cos(a)) * 0.45 - t * 0.1]); }
  const wave = sheet(curve, 2.4, 10, (u) => 0.2 + 0.7 * u + (u > 0.82 ? 0.6 : 0));
  const bead = (() => { const g = new THREE.IcosahedronGeometry(0.12, 1); g.deleteAttribute('uv'); const p = g.attributes.position, a = new Float32Array(p.count); for (let i = 0; i < p.count; i++) a[i] = 0.5 + p.getY(i) * 4; g.setAttribute('aGrad', new THREE.BufferAttribute(a, 1)); return g; })();
  return { drop, wave: merge([wave]), bead };
}

export function install(kit, game) {
  const S = shapes();
  kit.registerShape('water.droplet', S.drop, { blend: 'alpha', outline: true, max: 128 });
  kit.registerShape('water.sheet', S.wave, { blend: 'alpha', outline: false });
  kit.registerShape('water.bead', S.bead, { blend: 'alpha', outline: false });
  const R = kit.ramp('water');
  const M = {};
  /** Droplet crown: n droplets thrown up/out with gravity (seeded). */
  const crown = (p, n, castId, speed = 4) => {
    // the crown body is accent particles (droplet frames, SP); only the two highest droplets are FM teardrops (each FM instance is a kit handle)
    kit.spark(p, 'water', Math.min(12, n + 2), UPV, { castId, shape: 'droplet', gravity: 12, speed: speed * 1.1 });
    const out = [], rnd = rng((castId || 1) * 29 + 1);
    for (let i = 0; i < Math.min(2, n); i++) {
      const a = (i / n) * TAU + rnd() * 0.3, up = 0.9 + rnd() * 0.5;
      const vel = v3(Math.cos(a) * speed * 0.55, up * speed, Math.sin(a) * speed * 0.55);
      out.push(kit.mesh('water.droplet', { pos: p, dir: vel, scale: 0.5 + rnd() * 0.3, life: 0.55, tIn: 0.04, tOut: 0.2, erode: true, castId, vel, gravity: 14, drag: 0.6 }));
    }
    return out;
  };

  M.cast = (s) => H(
    kit.line({ shape: 'glyph', glyph: 'water', el: 'water', pos: s.pos, follow: s.follow, followOff: s.followOff, plane: 'billboard', r: Math.min(0.6, s.r ?? 0.42), width: 0.04, life: s.life ?? 0.25, tIn: 0.08, tOut: 0.12, spin: 0.7, castId: s.castId, color: R.mid, color2: R.light }),
    kit.line({ shape: 'ring', el: 'water', pos: s.pos, follow: s.follow, followOff: s.followOff, plane: 'billboard', r: Math.min(0.75, (s.r ?? 0.42) * 1.3), width: 0.016, life: s.life ?? 0.25, tIn: 0.05, tOut: 0.15, scaleIn: 'expand', castId: s.castId, alpha: 0.7 }),
  );
  M.trail = (s) => {
    const sc = s.scale ?? 1;
    const out = [kit.mesh('water.droplet', { follow: s.follow, pos: s.pos, dir: s.dir, scale: 1.1 * sc, life: s.life ?? Infinity, tIn: 0.12, tOut: 0.1, erode: true, castId: s.castId })];
    if (s.follow) out.push(kit.ribbon({ follow: s.follow, width: 0.1 * sc, taper: 1, life: 0.18, maxLen: s.len ?? 1.0, el: 'water', castId: s.castId, tailSat: 0.35 }));
    return H(out);
  };
  /** burst: droplet crown (6) + foam ring + ripple decal. */
  M.burst = (s) => {
    const r = Math.max(0.4, Math.min(s.r ?? 1, 7)), gp = nearGround(game, s.pos, 1.8) ? groundAt(game, s.pos) : null, out = [];
    out.push(...crown(s.pos, Math.min(8, s.n ?? 6), s.castId, 3 + r * 0.8));
    out.push(kit.line({ shape: 'ring', el: 'water', pos: gp || s.pos, plane: gp ? 'ground' : 'billboard', r: r * 0.72, width: 0.04, life: 0.45, tIn: 0, tOut: 0.3, scaleIn: 'expand', castId: s.castId, color: R.mid, color2: R.light }));
    out.push(kit.line({ shape: 'ring', el: 'water', pos: gp || s.pos, plane: gp ? 'ground' : 'billboard', r: r * 0.6, width: 0.022, life: 0.55, tIn: 0.08, tOut: 0.3, scaleIn: 'expand', castId: s.castId, color: R.hi, alpha: 0.6 }));
    if (gp && s.decal !== false) out.push(kit.decal('ripple', gp, r * 1.2, s.decalLife ?? 0.9, { el: 'water', castId: s.castId, alpha: 0.3 }));
    return H(out);
  };
  M.spark = (s) => { kit.spark(s.pos, 'water', Math.min(6, s.n ?? 5), s.dir || null, { castId: s.castId, shape: 'droplet', gravity: 10, speed: 4 }); return null; };
  /** zone: slow concentric ripples + a foam rim (0.32 alpha). */
  M.zone = (s) => {
    const r = Math.max(0.6, Math.min(s.r ?? 3, 10)), life = s.life ?? 4, gp = groundAt(game, s.pos);
    return H(
      kit.decal('ripple', gp, r, life, { el: 'water', castId: s.castId, alpha: 0.3 }),
      kit.line({ shape: 'ring', el: 'water', pos: gp, follow: s.follow, plane: 'ground', r, width: 0.035, life, tIn: 0.25, tOut: 0.5, alpha: 0.35, castId: s.castId, color: R.light }),
      kit.line({ shape: 'dots', n: Math.round(10 + r * 5), el: 'water', pos: gp, follow: s.follow, plane: 'ground', r: r * 0.82, width: 0.025, life, tIn: 0.3, tOut: 0.5, spin: 0.3, alpha: 0.3, castId: s.castId }),
    );
  };
  /** pillar: fountain — a vertical ribbon + rising beads + a crown at the top. */
  M.pillar = (s) => {
    const h = Math.min(6, s.h ?? 2.5), gp = groundAt(game, s.pos, 0.05), out = [];
    out.push(kit.ribbon({ points: [gp, v3(gp.x, gp.y + h * 0.5, gp.z), v3(gp.x, gp.y + h, gp.z)], width: Math.min(0.5, (s.r ?? 0.6) * 0.5), life: s.life ?? 0.6, el: 'water', castId: s.castId, alpha: 0.65, taper: 0.6 }));
    out.push(...crown(v3(gp.x, gp.y + h, gp.z), 5, s.castId, 3));
    out.push(kit.line({ shape: 'ring', el: 'water', pos: gp, plane: 'ground', r: Math.min(2.5, s.r ?? 1), width: 0.03, life: 0.5, tIn: 0, tOut: 0.3, scaleIn: 'expand', castId: s.castId }));
    return H(out);
  };
  /** wave: curling wave sheet sweeping along the direction (crest line) + foam arc + ripples. */
  M.wave = (s) => {
    const r = Math.min(s.r ?? 5, 14), d = flatDir(s.dir), a = Math.atan2(d.z, d.x), half = Math.min(1.4, s.arc ?? 0.7), gp = groundAt(game, s.pos, 0), out = [];
    const speed = r / Math.max(0.3, s.dur ?? 0.55);
    const width = Math.max(1.2, Math.min(4, r * Math.tan(half) * 0.6));
    out.push(kit.mesh('water.sheet', { pos: v3(gp.x + d.x * 0.6, gp.y, gp.z + d.z * 0.6), quat: qFwd(d), scale: v3(width, Math.min(1.6, 0.6 + r * 0.12), 1), life: s.dur ?? 0.55, tIn: 0.12, tOut: 0.25, erode: true, castId: s.castId, vel: v3(d.x * speed, 0, d.z * speed), alpha: 0.85, grow: 1.6 }));
    out.push(kit.line({ shape: 'arc', arc: [a - half, a + half], el: 'water', pos: groundAt(game, s.pos), plane: 'ground', r, width: 0.04, life: 0.5, tOut: 0.3, scaleIn: 'expand', castId: s.castId, color: R.light }));
    out.push(kit.ribbon({ points: arcPoints(gp, r * 0.8, a - half * 0.8, a + half * 0.8, 9, 0.15), width: 0.07, life: 0.5, el: 'water', castId: s.castId, alpha: 0.7 }));
    kit.spark(gp, 'water', 6, d, { castId: s.castId, shape: 'droplet', gravity: 10, speed: 6 });
    return H(out);
  };
  M.aura = (s) => {
    const r = Math.min(s.r ?? 0.9, 2), life = s.life ?? 2;
    return H(
      kit.line({ shape: 'ring', el: 'water', pos: s.pos, follow: s.follow, followOff: v3(0, 0.05, 0), plane: 'flat', r, width: 0.03, life, tIn: 0.2, tOut: 0.3, alpha: 0.4, castId: s.castId, color: R.light }),
      kit.line({ shape: 'dots', n: 10, el: 'water', pos: s.pos, follow: s.follow, followOff: v3(0, 0.05, 0), plane: 'flat', r: r * 0.7, width: 0.025, life, tIn: 0.25, tOut: 0.3, spin: 0.8, alpha: 0.35, castId: s.castId }),
    );
  };
  M.summon = (s) => {
    const r = Math.min(s.r ?? 1, 3), gp = groundAt(game, s.pos), out = [];
    out.push(kit.line({ shape: 'glyph', glyph: 'water', el: 'water', pos: gp, plane: 'ground', r, width: 0.035, life: s.life ?? 0.8, tIn: 0.25, tOut: 0.3, spin: 0.6, castId: s.castId, alpha: 0.8 }));
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4; out.push(kit.mesh('water.bead', { pos: v3(gp.x + Math.cos(a) * r * 0.6, gp.y + 0.2, gp.z + Math.sin(a) * r * 0.6), scale: 1.2, life: 0.8, tIn: 0.15, tOut: 0.3, castId: s.castId, vel: v3(0, 1.6, 0), drag: 1 })); }
    return H(out);
  };
  for (const k in M) kit.registerMotif('water', k, M[k]);
  return { M, crown, qYawTilt };
}
