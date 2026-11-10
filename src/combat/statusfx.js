// Per-entity status visuals (v3), drawn with GLOBAL instanced batches so the cost is ~1 draw call per visual kind,
// independent of how many enemies are burning / frozen / stunned (reaction-heavy fights stay inside DESIGN §12):
//   tint shell (instanced fresnel, per-instance colour) · flames (normal / holy / necro) · frozen ice block + spikes
//   (+ instanced outlines) · stun / break stars · encrusted rock chips · rooted vine ring.
// Emitters (drips, frost, spores, corrosion smoke, dazzle sparkles, sleep bubbles) and stack pips (orbiting motes =
// stack count) use the shared particle system (0 extra draw calls). Assets come from combat/fxassets.js (rule 7).
import * as THREE from 'three';
import { elColor } from '../core/elements.js';
import {
  shellMat, flameGeo, flameMat, tintFlameMat, crystalGeo, iceMat, starGeo, toonMat, chipGeo, rockMat, vineGeo, uTime, instOutlineMat,
} from './fxassets.js';

const CAP = 24;   // simultaneously decorated entities per kind (≥ the 18 enemies alive cap)
const COL = {
  burn: new THREE.Color(0xff5a10), holy: new THREE.Color(0xffe6a0), necro: new THREE.Color(0x8a3cff), shock: new THREE.Color(0xc9a4ff),
  chill: new THREE.Color(0x9feaff), wet: new THREE.Color(0x3d8cff), exposed: new THREE.Color(0xd070ff), corroded: new THREE.Color(0x7a2ad0),
  radiant: new THREE.Color(0xffd36a), seeded: new THREE.Color(0x7fd84a), encrusted: new THREE.Color(0xc8955a), hexed: new THREE.Color(0x6a2acf),
  quick: new THREE.Color(0xc8ff6a), broken: new THREE.Color(0xf4f1ea),
};
const PIPS = [
  { key: 'radiant', color: [0xfff8e6, 0xe8d9b0], shape: 'star', r: 1.0, y: 0.95, speed: 2.2 },
  { key: 'corroded', color: [0xd8b0ff, 0x7a2ad0], shape: 'wisp', r: 0.9, y: 0.6, speed: -1.8 },
  { key: 'seeded', color: [0xf4ffd0, 0x6fcf3a], shape: 'petal', r: 0.85, y: 0.35, speed: 1.5 },
  { key: 'marked', color: [0xd6b8ff, 0x9a5cff], shape: 'rune', r: 0.7, y: 1.25, speed: 3.0 },
  { key: 'chilled', color: [0xe8fbff, 0x8fdcf5], shape: 'snow', r: 0.8, y: 0.2, speed: 1.2, minStacks: 2 },
];
// flame layout (same as v2): 6 around + 1 centre
const FLAMES = [0, 1, 2, 3, 4, 5, 6].map((i) => {
  const center = i === 6, a = (i / 6) * Math.PI * 2;
  return { a, x: center ? 0 : Math.cos(a) * 0.8, z: center ? 0 : Math.sin(a) * 0.8, h: center ? 0.35 : [0.0, 0.4, 0.2, 0.5, 0.05, 0.3][i], s: center ? 1.5 : [1.2, 0.9, 1.05, 0.8, 1.25, 0.95][i], ph: i * 1.7 };
});
const SPIKES = [[0.9, 0.15, 0.2, 0.5, 0.6], [-0.8, 0.1, -0.3, -0.55, 0.7], [0.2, 0.2, -0.95, 0.15, 0.55], [-0.3, 0.3, 0.9, -0.2, 0.5], [0.0, 0.85, 0.0, 0.05, 0.6], [0.6, 0.55, -0.5, 0.4, 0.4]];

export function createStatusFX(game) {
  const scene = game.scene;
  const recs = new Map();
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const M = new THREE.Matrix4(), G = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
  const C3 = new THREE.Color();
  const vfx = () => game.vfx;
  const pipOpts = { count: 1, shape: 'mote', color: null, speed: 0, size: 0.16, sizeEnd: 0.05, life: 0.09, lifeVar: 0, alpha: 1.3 };

  // ---------------- batches ----------------
  const batches = [];
  function batch(name, geo, mat, cap, { outline = null, tinted = false, order = 0 } = {}) {
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (tinted) { mesh.setColorAt(0, C3.set(0xf4f1ea)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage); mesh.instanceColor.needsUpdate = true; }
    mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.castShadow = false; mesh.renderOrder = order; mesh.name = 'status-' + name;
    scene.add(mesh);
    let om = null;
    if (outline) {
      om = new THREE.InstancedMesh(geo, outline, cap);
      om.instanceMatrix = mesh.instanceMatrix;
      om.count = 0; om.visible = false; om.frustumCulled = false; om.name = 'outline';
      scene.add(om);
    }
    const b = { name, mesh, outline: om, cap, n: 0 };
    batches.push(b);
    return b;
  }
  const B = {
    shell: batch('shell', new THREE.SphereGeometry(1, 16, 12), shellMat(), CAP, { tinted: true, order: 5 }),
    flame: batch('flame', flameGeo(), flameMat(), CAP * 7, { order: 7 }),
    holy: batch('holy', flameGeo(), tintFlameMat(0xfff8e6, 0xe8d9b0), CAP * 7, { order: 7 }),
    necro: batch('necro', flameGeo(), tintFlameMat(0xe0b0ff, 0x4a0b8a), CAP * 7, { order: 7 }),
    ice: batch('ice', new THREE.DodecahedronGeometry(1, 0), iceMat(), CAP, { outline: instOutlineMat(0x1d4a66, 0.04), order: 3 }),
    spike: batch('spike', crystalGeo(), iceMat(), CAP * 6, { outline: instOutlineMat(0x1d4a66, 0.05), order: 3 }),
    star: batch('star', starGeo(), toonMat(0xffe45c, { emissive: 0xffb000, emissiveIntensity: 0.7 }), CAP * 3, { outline: instOutlineMat(0x1a1410, 0.012) }),
    chip: batch('chip', chipGeo(), rockMat(), CAP * 8),
    vine: batch('vine', vineGeo(), toonMat(0x4f9a32, { emissive: 0x1c4a10, emissiveIntensity: 0.4 }), CAP, { outline: instOutlineMat(0x14260c, 0.02) }),
  };
  function put(b, m) {
    if (b.n >= b.cap) return;
    b.mesh.setMatrixAt(b.n, m);
    b.n++;
  }
  function putColor(b, c) { if (b.n > 0 && b.n <= b.cap) b.mesh.setColorAt(b.n - 1, c); }
  function flush() {
    for (const b of batches) {
      b.mesh.count = b.n; b.mesh.visible = b.n > 0;
      if (b.n) {   // live-range uploads only (fix round 1: was the whole capacity every frame)
        const im = b.mesh.instanceMatrix; im.clearUpdateRanges(); im.addUpdateRange(0, b.n * 16); im.needsUpdate = true;
        const ic = b.mesh.instanceColor; if (ic) { ic.clearUpdateRanges(); ic.addUpdateRange(0, b.n * 3); ic.needsUpdate = true; }
      }
      if (b.outline) { b.outline.count = b.n; b.outline.visible = b.n > 0; }
      b.n = 0;
    }
  }
  // precomputed local matrices
  const iceBlockL = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.52, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, 0)), new THREE.Vector3(1.3, 0.62, 1.3));
  const spikeL = SPIKES.map(([x, y, z, tilt, s]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(z * 0.6, Math.atan2(x, z), tilt + x * 0.5)), new THREE.Vector3(s, s, s)));
  const chipL = [];
  { let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 8; i++) {
      const a = i * 2.39996, y = 0.15 + (i / 8) * 0.75;
      chipL.push(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 0.92, y, Math.sin(a) * 0.92), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), new THREE.Vector3().setScalar(0.7 + r() * 0.6)));
    } }

  function rec(e) {
    let r = recs.get(e);
    if (!r) {
      r = { emBurn: null, burnKind: null, emWet: null, emChill: null, emSeed: null, emCorr: null, emDaz: null, emSleep: null, emMud: null,
        arcT: 0, iceT: 0, chipT: 0, vineT: 0, wasFrozen: false, wasChips: false, pipA: Math.random() * 6 };
      recs.set(e, r);
    }
    return r;
  }
  function stopEm(h) { try { h?.stop?.(); } catch (_) { /* */ } return null; }
  function emitter(opts) { try { const h = vfx()?.emitter?.(opts); return h && h.stop ? h : null; } catch (_) { return null; } }
  function release(e) {
    const r = recs.get(e); if (!r) return;
    r.emBurn = stopEm(r.emBurn); r.emWet = stopEm(r.emWet); r.emChill = stopEm(r.emChill); r.emSeed = stopEm(r.emSeed);
    r.emCorr = stopEm(r.emCorr); r.emDaz = stopEm(r.emDaz); r.emSleep = stopEm(r.emSleep); r.emMud = stopEm(r.emMud);
    recs.delete(e);
  }
  function center(e, out) {
    if (e.getCenter) { try { return e.getCenter(out); } catch (_) { /* */ } }
    return out.copy(e.object.position).setY(e.object.position.y + (e.height || 1.6) * 0.5);
  }

  const dead = [];
  const collectDead = (r, e) => { if (!e.alive || !game.entities.includes(e)) dead.push(e); };
  let arcTokens = 3;   // shocked arcs share a budget (≤ 14 beams/s across all entities)
  function update(dt, realDt) {
    uTime.value += realDt || dt;
    arcTokens = Math.min(3, arcTokens + dt * 14);
    const t = game.time;
    dead.length = 0; recs.forEach(collectDead);     // v4 §2.7: no per-frame iterator entries
    for (let di = 0; di < dead.length; di++) {
      const e = dead[di], r = recs.get(e);
      if (r?.wasFrozen) { try { center(e, v); vfx()?.debris?.(v, { count: 10, material: 'ice', color: 0x8fdcf5, size: 0.25, speed: 6 }); } catch (_) { /* */ } }
      release(e);
    }
    const ents = game.entities;
    for (let ei = 0; ei < ents.length; ei++) {
      const e = ents[ei];
      if (!e.alive || !e.object) continue;
      const s = e.statuses; if (!s) continue;
      let any = false;
      for (const k in s) { any = true; break; }
      if (!any && !recs.has(e)) continue;
      const burning = !!s.burning, necro = !!s.necroflame, wet = !!s.wet, chilled = !!s.chilled, frozen = !!s.frozen;
      const shocked = !!s.shocked, stunned = !!s.stunned;
      const r = rec(e);
      const R = e.radius || 0.5, H = e.height || 1.6;
      const pos = e.object.position;
      center(e, v);
      const isPlayer = e.team === 'player';

      // ---- tint shell (most important status wins) ----
      let col = null, inten = 0;
      if (s.broken) { col = COL.broken; inten = 0.9 + Math.sin(t * 20) * 0.3; }
      else if (necro) { col = COL.necro; inten = 1.0 + Math.sin(t * 13) * 0.2; }
      else if (burning) { col = s.burning.holy ? COL.holy : COL.burn; inten = 0.95 + Math.sin(t * 17) * 0.2; }
      else if (shocked) { col = COL.shock; inten = Math.random() < 0.5 ? 1.15 : 0.55; }
      else if (chilled && !frozen) { col = COL.chill; inten = 1.0; }
      else if (s.radiant) { col = COL.radiant; inten = 0.5 + 0.18 * (s.radiant.stacks || 1) + Math.sin(t * 5) * 0.12; }
      else if (s.corroded) { col = COL.corroded; inten = 0.6 + 0.15 * (s.corroded.stacks || 1); }
      else if (s.exposed) { col = COL.exposed; inten = 0.8 + Math.sin(t * 6) * 0.2; }
      else if (s.hexed) { col = COL.hexed; inten = 0.9; }
      else if (s.quickened) { col = COL.quick; inten = 0.9 + Math.sin(t * 12) * 0.3; }
      else if (s.seeded) { col = COL.seeded; inten = 0.5 + 0.1 * (s.seeded.stacks || 1); }
      else if (s.encrusted) { col = COL.encrusted; inten = 0.6; }
      else if (wet) { col = COL.wet; inten = 0.7; }
      if (col && !isPlayer) {
        M.compose(v, Q.identity(), S.set(R * 1.35, H * 0.62, R * 1.35));
        put(B.shell, M); putColor(B.shell, C3.copy(col).multiplyScalar(inten));
      }

      // ---- flames: burning (normal / holy) or necroflame ----
      const fk = necro ? 'necro' : burning ? (s.burning.holy ? 'holy' : 'flame') : null;
      if (r.emBurn && fk !== r.burnKind) r.emBurn = stopEm(r.emBurn);
      if (fk) {
        if (!r.emBurn) {
          r.burnKind = fk;
          const ec = fk === 'necro' ? [0xd6b8ff, 0x4a1a7a] : fk === 'holy' ? [0xfff8e6, 0xe8d9b0] : [0xffa53a, 0xf0661a];
          r.emBurn = emitter({ follow: e.object, offset: new THREE.Vector3(0, H * 0.55, 0), rate: 22, color: ec, shape: fk === 'necro' ? 'wisp' : 'ember', speed: 2.2, speedVar: 0.8, dir: UP, spread: 0.45, size: 0.12, sizeEnd: 0.02, life: 0.7, lifeVar: 0.3, gravity: 2.5, drag: 1 });
        }
        const b = B[fk], rot = t * 0.8, sx = R * 1.25, sy = H * 0.85;
        for (let i = 0; i < 7; i++) {
          const F = FLAMES[i];
          const k = 0.75 + 0.3 * Math.sin(t * 14 + F.ph + ei) + 0.1 * Math.sin(t * 31 + F.ph * 2);
          const ca = Math.cos(rot), sa = Math.sin(rot);
          P.set(pos.x + (F.x * ca - F.z * sa) * sx, pos.y + F.h * sy, pos.z + (F.x * sa + F.z * ca) * sx);
          M.compose(P, Q.identity(), S.set(F.s * 1.1 * sx, F.s * k * sy, F.s * 1.1 * sx));
          put(b, M);
        }
      }

      // ---- emitters: wet / mud / chill / seeds / corrosion / dazzle / sleep ----
      if (wet && !frozen) {
        if (!r.emWet) r.emWet = emitter({ follow: e.object, offset: new THREE.Vector3(0, H * 0.7, 0), rate: 12, color: [0x6fb8ff, 0xcfe9ff], shape: 'droplet', speed: 0.6, spread: 1, size: 0.12, sizeEnd: 0.06, life: 0.55, lifeVar: 0.2, gravity: -14, drag: 0.5 });
      } else r.emWet = stopEm(r.emWet);
      if (s.muddy) {
        if (!r.emMud) r.emMud = emitter({ follow: e.object, offset: new THREE.Vector3(0, H * 0.25, 0), rate: 8, color: [0x8a6a3a, 0x5a4024], shape: 'puff', additive: false, speed: 0.4, spread: 1, size: 0.16, sizeEnd: 0.1, life: 0.6, gravity: -9, alpha: 0.8 });
      } else r.emMud = stopEm(r.emMud);
      if (chilled && !frozen) {
        if (!r.emChill) r.emChill = emitter({ follow: e.object, offset: new THREE.Vector3(0, H * 0.5, 0), rate: 10, color: [0xe8fbff, 0x8fdcf5], shape: 'snow', speed: 0.8, spread: 1, size: 0.1, sizeEnd: 0.0, life: 0.9, gravity: -1, drag: 1.5 });
      } else r.emChill = stopEm(r.emChill);
      if (s.seeded) {
        if (!r.emSeed) r.emSeed = emitter({ follow: e.object, offset: new THREE.Vector3(0, H * 0.4, 0), rate: 4, color: [0xf4ffd0, 0x8fe05a], shape: 'petal', speed: 0.6, spread: 1, up: 0.6, size: 0.16, sizeEnd: 0.08, life: 1.1, gravity: 0.4, drag: 1.2, alpha: 0.9 });
        r.emSeed?.setRate?.(3 + 3 * (s.seeded.stacks || 1));
      } else r.emSeed = stopEm(r.emSeed);
      if (s.corroded) {
        if (!r.emCorr) r.emCorr = emitter({ follow: e.object, offset: new THREE.Vector3(0, H * 0.5, 0), rate: 6, color: [0x5b2a8a, 0x1a0b2e], shape: 'smoke', additive: false, speed: 0.4, spread: 1, up: 0.5, size: 0.35, sizeEnd: 0.8, life: 1.0, alpha: 0.55, radius: R * 0.8 });
        r.emCorr?.setRate?.(3 + 2 * (s.corroded.stacks || 1));
      } else r.emCorr = stopEm(r.emCorr);
      if (s.dazzled) {
        if (!r.emDaz) r.emDaz = emitter({ follow: e.object, offset: new THREE.Vector3(0, H * 0.95, 0), rate: 9, color: [0xfff8e6, 0xf4ead0], shape: 'mote', speed: 0.5, spread: 1, size: 0.22, sizeEnd: 0.05, life: 0.4, radius: R * 0.6 });
      } else r.emDaz = stopEm(r.emDaz);
      if (s.asleep) {
        if (!r.emSleep) r.emSleep = emitter({ follow: e.object, offset: new THREE.Vector3(0.2, H + 0.1, 0), rate: 2.5, color: [0xd6b8ff, 0x9a5cff], shape: 'bubble', speed: 0.4, dir: UP, spread: 0.3, up: 0.7, size: 0.18, sizeEnd: 0.32, life: 1.6, curl: 1.5 });
      } else r.emSleep = stopEm(r.emSleep);

      // ---- stack pips: orbiting motes (count = stacks) ----
      if (!isPlayer) {
        r.pipA += (realDt || dt);
        for (let pi = 0; pi < PIPS.length; pi++) {
          const Pp = PIPS[pi], st = s[Pp.key];
          if (!st) continue;
          const n = Math.min(8, st.stacks || 1);
          if (Pp.minStacks && n < Pp.minStacks) continue;
          pipOpts.shape = Pp.shape; pipOpts.color = Pp.color;
          for (let i = 0; i < n; i++) {
            const a = r.pipA * Pp.speed + (i / n) * Math.PI * 2;
            v2.set(pos.x + Math.cos(a) * R * Pp.r * 1.6, pos.y + H * Pp.y + Math.sin(a * 2 + i) * 0.05, pos.z + Math.sin(a) * R * Pp.r * 1.6);
            try { vfx()?.burst?.(v2, pipOpts, true); } catch (_) { /* */ }
          }
        }
      }

      // ---- frozen ice block (+ spikes) ----
      if (frozen) {
        if (!r.wasFrozen) { r.wasFrozen = true; r.iceT = 0; }
        r.iceT += dt;
        const grow = Math.min(1, r.iceT / 0.12);
        E.set(0, 0, s.frozen.time < 0.6 ? Math.sin(t * 50) * 0.03 : 0); Q.setFromEuler(E);
        G.compose(pos, Q, S.set(R * 1.15 * grow, H * 1.08 * (0.3 + 0.7 * grow), R * 1.15 * grow));
        put(B.ice, M.multiplyMatrices(G, iceBlockL));
        for (let i = 0; i < spikeL.length; i++) put(B.spike, M.multiplyMatrices(G, spikeL[i]));
      } else if (r.wasFrozen) {
        r.wasFrozen = false;
        try { vfx()?.debris?.(v, { count: 12, material: 'ice', color: 0xbff4ff, size: 0.22 * Math.max(1, R), speed: 5, life: 1.2 }); vfx()?.burst?.(v, { count: 10, color: [0xe8fbff, 0x8fdcf5], shape: 'snow', speed: 4, spread: 1, size: 0.14, life: 0.8, gravity: -3 }); } catch (_) { /* */ }
      }

      // ---- encrusted rock chips (grow in, crumble out) ----
      if (s.encrusted && !isPlayer) {
        if (!r.wasChips) { r.wasChips = true; r.chipT = 0; }
        r.chipT += dt;
        const g = Math.min(1, r.chipT / 0.15);
        G.compose(pos, Q.identity(), S.set(R * g, H * g, R * g));
        for (let i = 0; i < 8; i++) put(B.chip, M.multiplyMatrices(G, chipL[i]));
      } else if (r.wasChips) {
        r.wasChips = false;
        try { vfx()?.debris?.(v, { count: 6, material: 'rock', color: 0xb08a5e, size: 0.16, speed: 3, life: 1 }); } catch (_) { /* */ }
      }
      // ---- rooted vine ring ----
      if (s.rooted) {
        r.vineT += dt;
        const g = Math.min(1, r.vineT / 0.2);
        E.set(0, r.vineT * 0.6, 0); Q.setFromEuler(E);
        M.compose(P.set(pos.x, pos.y + 0.15, pos.z), Q, S.set(R * 1.4 * g, 1 + g, R * 1.4 * g));
        put(B.vine, M);
      } else r.vineT = 0;

      // ---- shocked arcs ----
      if (shocked) {
        r.arcT -= dt;
        if (r.arcT <= 0 && arcTokens >= 1) {
          arcTokens -= 1;
          r.arcT = 0.07 + Math.random() * 0.08;
          const a1 = Math.random() * Math.PI * 2, a2 = a1 + 1.2 + Math.random() * 2;
          v2.set(pos.x + Math.cos(a1) * R * 1.1, pos.y + H * (0.15 + Math.random() * 0.8), pos.z + Math.sin(a1) * R * 1.1);
          v3.set(pos.x + Math.cos(a2) * R * 1.1, pos.y + H * (0.15 + Math.random() * 0.8), pos.z + Math.sin(a2) * R * 1.1);
          try { vfx()?.beam?.(v2, v3, { color: elColor('lightning'), width: 0.05, duration: 0.09, jagged: 0.25, segments: 6 }); } catch (_) { /* */ }
        }
      }

      // ---- stun / break stars ----
      if (stunned || s.broken || (shocked && s.shocked.stunT > 0)) {
        const rr = Math.max(0.35, R * 0.8), sc = Math.max(1, R * 1.2);
        for (let i = 0; i < 3; i++) {
          const a = t * 4 + (i / 3) * Math.PI * 2;
          E.set(0, -a, t * 6); Q.setFromEuler(E);
          M.compose(P.set(pos.x + Math.cos(a) * rr, pos.y + H + 0.25 + Math.sin(a * 2) * 0.06, pos.z + Math.sin(a) * rr), Q, S.set(sc, sc, sc));
          put(B.star, M);
        }
      }

      let still = false;
      for (const k in s) { still = true; break; }
      if (!still) release(e);
    }
    flush();
  }

  /** Pre-warm: the batches live in the scene (hidden); make one instance visible for the compile pass. */
  function warm(group) {
    void group;
    for (const b of batches) { b.mesh.count = 1; b.mesh.visible = true; if (b.outline) { b.outline.count = 1; b.outline.visible = true; } b.mesh.setMatrixAt(0, M.makeTranslation(0, -999, 0)); }
  }
  return { update, release, warm, batches: () => batches.map((b) => ({ name: b.name, count: b.mesh.count, visible: b.mesh.visible })) };
}
