// Per-entity status visuals (burning flames, wet drips, chill frost, frozen ice block,
// shocked arcs, stun stars, tint shell). Pooled; driven by combat.update.
import * as THREE from 'three';
import { ELEMENT_COLORS } from '../core/utils.js';
import {
  fresnelMat, flameGeo, flameMat, crystalGeo, iceMat, starGeo, toonMat, addOutline,
} from '../spells/assets.js';

const COL_BURN = new THREE.Color(0xff5a10);
const COL_SHOCK = new THREE.Color(0xc9a4ff);
const COL_CHILL = new THREE.Color(0x9feaff);
const COL_WET = new THREE.Color(0x3d8cff);
const COL_EXPOSED = new THREE.Color(0xd070ff);

export function createStatusFX(game) {
  const scene = game.scene;
  const recs = new Map();
  const pool = { shell: [], flames: [], ice: [], stars: [] };
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
  const vfx = () => game.vfx;

  function make(kind) {
    if (kind === 'shell') {
      const m = new THREE.Mesh(sphere, fresnelMat(0xff6a1f, { power: 1.8, intensity: 1.2, core: 0.05 }));
      m.renderOrder = 5; m.frustumCulled = true; return m;
    }
    if (kind === 'flames') {
      const g = new THREE.Group();
      const geo = flameGeo(), mat = flameMat();
      for (let i = 0; i < 7; i++) {
        const f = new THREE.Mesh(geo, mat);
        const a = (i / 6) * Math.PI * 2;
        const center = i === 6;
        f.userData = { a, h: center ? 0.35 : [0.0, 0.4, 0.2, 0.5, 0.05, 0.3][i], s: center ? 1.5 : [1.2, 0.9, 1.05, 0.8, 1.25, 0.95][i], ph: Math.random() * 10 };
        f.position.set(center ? 0 : Math.cos(a) * 0.8, f.userData.h, center ? 0 : Math.sin(a) * 0.8);
        f.renderOrder = 7;
        g.add(f);
      }
      return g;
    }
    if (kind === 'ice') {
      const g = new THREE.Group();
      const mat = iceMat();
      const block = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), mat);
      block.scale.set(1.3, 0.62, 1.3); block.position.y = 0.52; block.rotation.y = 0.4;
      addOutline(block, 0.04, 0x1d4a66);
      g.add(block);
      const cg = crystalGeo();
      const spikes = [[0.9, 0.15, 0.2, 0.5, 0.6], [-0.8, 0.1, -0.3, -0.55, 0.7], [0.2, 0.2, -0.95, 0.15, 0.55],
        [-0.3, 0.3, 0.9, -0.2, 0.5], [0.0, 0.85, 0.0, 0.05, 0.6], [0.6, 0.55, -0.5, 0.4, 0.4]];
      for (const [x, y, z, tilt, s] of spikes) {
        const c = new THREE.Mesh(cg, mat);
        c.position.set(x, y, z); c.scale.setScalar(s);
        c.rotation.set(z * 0.6, Math.atan2(x, z), tilt + x * 0.5);
        addOutline(c, 0.05, 0x1d4a66);
        g.add(c);
      }
      g.traverse((o) => { if (o.isMesh) o.renderOrder = 3; });
      return g;
    }
    if (kind === 'stars') {
      const g = new THREE.Group();
      const mat = toonMat(0xffe45c, { emissive: 0xffb000, emissiveIntensity: 0.7 });
      for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(starGeo(), mat); addOutline(s, 0.012); g.add(s); }
      return g;
    }
  }
  function take(kind) { const o = pool[kind].pop() || make(kind); scene.add(o); o.visible = true; return o; }
  function give(kind, o) { if (!o) return null; scene.remove(o); pool[kind].push(o); return null; }

  function rec(e) {
    let r = recs.get(e);
    if (!r) { r = { shell: null, flames: null, ice: null, stars: null, emBurn: null, emWet: null, emChill: null, arcT: 0, iceT: 0 }; recs.set(e, r); }
    return r;
  }
  function stopEm(h) { try { h?.stop?.(); } catch (_) { /* */ } return null; }
  function emitter(opts) { try { const h = vfx()?.emitter?.(opts); return h && h.stop ? h : null; } catch (_) { return null; } }

  function release(e) {
    const r = recs.get(e); if (!r) return;
    r.shell = give('shell', r.shell); r.flames = give('flames', r.flames);
    r.ice = give('ice', r.ice); r.stars = give('stars', r.stars);
    r.emBurn = stopEm(r.emBurn); r.emWet = stopEm(r.emWet); r.emChill = stopEm(r.emChill);
    recs.delete(e);
  }

  function center(e, out) {
    if (e.getCenter) { try { return e.getCenter(out); } catch (_) { /* */ } }
    return out.copy(e.object.position).setY(e.object.position.y + (e.height || 1.6) * 0.5);
  }

  function update(dt) {
    const t = game.time;
    for (const [e, r] of recs) if (!e.alive || !game.entities.includes(e)) {
      if (r.ice) { try { center(e, v); vfx()?.debris?.(v, { count: 10, material: 'ice', color: 0xbff4ff, size: 0.25, speed: 6 }); } catch (_) { /* */ } }
      release(e);
    }
    for (const e of game.entities) {
      if (!e.alive || !e.object) continue;
      const s = e.statuses; if (!s) continue;
      const burning = !!s.burning, wet = !!s.wet, chilled = !!s.chilled, frozen = !!s.frozen;
      const shocked = !!s.shocked, stunned = !!s.stunned, exposed = !!s.exposed;
      const any = burning || wet || chilled || frozen || shocked || stunned || exposed;
      if (!any && !recs.has(e)) continue;
      const r = rec(e);
      const R = e.radius || 0.5, H = e.height || 1.6;
      const pos = e.object.position;
      center(e, v);
      const isPlayer = e.team === 'player';

      // ---- tint shell ----
      let col = null, inten = 0;
      if (burning) { col = COL_BURN; inten = 1.3 + Math.sin(t * 17) * 0.25; }
      else if (shocked) { col = COL_SHOCK; inten = Math.random() < 0.5 ? 1.8 : 0.6; }
      else if (chilled && !frozen) { col = COL_CHILL; inten = 1.0; }
      else if (exposed) { col = COL_EXPOSED; inten = 0.8 + Math.sin(t * 6) * 0.2; }
      else if (wet) { col = COL_WET; inten = 0.7; }
      if (col && !isPlayer) {
        if (!r.shell) r.shell = take('shell');
        r.shell.material.uniforms.color.value.copy(col);
        r.shell.material.uniforms.intensity.value = inten;
        r.shell.position.copy(v);
        r.shell.scale.set(R * 1.35, H * 0.62, R * 1.35);
      } else if (r.shell) r.shell = give('shell', r.shell);

      // ---- flames ----
      if (burning) {
        if (!r.flames) {
          r.flames = take('flames');
          r.emBurn = emitter({ follow: e.object, offset: new THREE.Vector3(0, H * 0.55, 0), rate: 22, color: [0xffb347, 0xff4a10], shape: 'ember', speed: 2.2, speedVar: 0.8, dir: new THREE.Vector3(0, 1, 0), spread: 0.45, size: 0.12, sizeEnd: 0.02, life: 0.7, lifeVar: 0.3, gravity: 2.5, drag: 1 });
        }
        const g = r.flames; g.position.copy(pos); g.scale.set(R * 1.25, H * 0.85, R * 1.25);
        g.rotation.y = t * 0.8;
        for (const f of g.children) {
          const k = 0.75 + 0.3 * Math.sin(t * 14 + f.userData.ph) + 0.1 * Math.sin(t * 31 + f.userData.ph * 2);
          f.scale.set(f.userData.s * 1.1, f.userData.s * k, f.userData.s * 1.1);
        }
      } else if (r.flames) { r.flames = give('flames', r.flames); r.emBurn = stopEm(r.emBurn); }

      // ---- wet drips ----
      if (wet && !frozen) {
        if (!r.emWet) r.emWet = emitter({ follow: e.object, offset: new THREE.Vector3(0, H * 0.7, 0), rate: 12, color: [0x6fb8ff, 0xcfe9ff], shape: 'soft', speed: 0.6, spread: 1, size: 0.09, sizeEnd: 0.05, life: 0.55, lifeVar: 0.2, gravity: -14, drag: 0.5 });
      } else r.emWet = stopEm(r.emWet);

      // ---- chill frost ----
      if (chilled && !frozen) {
        if (!r.emChill) r.emChill = emitter({ follow: e.object, offset: new THREE.Vector3(0, H * 0.5, 0), rate: 10, color: [0xffffff, 0x9feaff], shape: 'snow', speed: 0.8, spread: 1, size: 0.1, sizeEnd: 0.0, life: 0.9, gravity: -1, drag: 1.5 });
      } else r.emChill = stopEm(r.emChill);

      // ---- frozen ice block ----
      if (frozen) {
        if (!r.ice) { r.ice = take('ice'); r.iceT = 0; }
        r.iceT += dt;
        const grow = Math.min(1, r.iceT / 0.12);
        const ice = r.ice; ice.position.copy(pos);
        ice.scale.set(R * 1.15 * grow, H * 1.08 * (0.3 + 0.7 * grow), R * 1.15 * grow);
        const left = s.frozen.time;
        ice.rotation.z = left < 0.6 ? Math.sin(t * 50) * 0.03 : 0; // tremble before breaking free
      } else if (r.ice) {
        try { vfx()?.debris?.(v, { count: 12, material: 'ice', color: 0xbff4ff, size: 0.22 * Math.max(1, R), speed: 5, life: 1.2 }); vfx()?.burst?.(v, { count: 18, color: [0xffffff, 0x9feaff], shape: 'snow', speed: 4, spread: 1, size: 0.14, life: 0.8, gravity: -3 }); } catch (_) { /* */ }
        r.ice = give('ice', r.ice);
      }

      // ---- shocked arcs ----
      if (shocked) {
        r.arcT -= dt;
        if (r.arcT <= 0) {
          r.arcT = 0.07 + Math.random() * 0.08;
          const a1 = Math.random() * Math.PI * 2, a2 = a1 + 1.2 + Math.random() * 2;
          v2.set(pos.x + Math.cos(a1) * R * 1.1, pos.y + H * (0.15 + Math.random() * 0.8), pos.z + Math.sin(a1) * R * 1.1);
          v3.set(pos.x + Math.cos(a2) * R * 1.1, pos.y + H * (0.15 + Math.random() * 0.8), pos.z + Math.sin(a2) * R * 1.1);
          try { vfx()?.beam?.(v2, v3, { color: ELEMENT_COLORS.lightning, width: 0.05, duration: 0.09, jagged: 0.25, segments: 6 }); } catch (_) { /* */ }
        }
      }

      // ---- stun stars ----
      if (stunned || (shocked && s.shocked.stunT > 0)) {
        if (!r.stars) r.stars = take('stars');
        const g = r.stars; g.position.set(pos.x, pos.y + H + 0.25, pos.z);
        const rr = Math.max(0.35, R * 0.8);
        for (let i = 0; i < 3; i++) {
          const a = t * 4 + (i / 3) * Math.PI * 2;
          const st = g.children[i];
          st.position.set(Math.cos(a) * rr, Math.sin(a * 2) * 0.06, Math.sin(a) * rr);
          st.rotation.set(0, -a, t * 6);
          st.scale.setScalar(Math.max(1, R * 1.2));
        }
      } else if (r.stars) r.stars = give('stars', r.stars);

      if (!any) release(e);
    }
  }

  function warm(group) { for (const k of ['shell', 'flames', 'ice', 'stars']) { const o = make(k); group.add(o); pool[k].push(o); } }
  return { update, release, warm };
}
