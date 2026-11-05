// Death dissolve (DESIGN §9 A4, CONTRACT §3.3/§20). vfx.dissolve(entity|mesh, {dur=0.9, color, embers=true, onDone}).
// Clones each toon material ONCE (same program key 'toonRim+dis' → no compile) and animates the clone's uDissolve
// (core-owned chunk; −1 = off). Shared materials are never touched. Outlines hide at 35 %; non-toon meshes hide at 60 %.
// Bosses dissolve part by part (staggered). Embers: 15/s from the body in the edge colour. vfx.undissolve(entity) restores.
import * as THREE from 'three';
import { dissolveUniforms } from '../core/utils.js';

const isToon = (m) => !!m && typeof m.customProgramCacheKey === 'function' && (() => { try { return String(m.customProgramCacheKey()).includes('dis'); } catch (_) { return false; } })();

export function createDissolve(game, vfx) {
  const jobs = [];
  const _v = new THREE.Vector3(), _box = new THREE.Box3();
  const emberOpts = { count: 1, shape: 'ember', color: [0xd6b8ff, 0x9a5cff], speed: 1.2, up: 1.6, drag: 1, size: 0.16, sizeEnd: 0.03, life: 0.8, radius: 0.1, flicker: true };

  function cloneFor(mesh, list) {
    if (!mesh.userData._disOrig) mesh.userData._disOrig = mesh.material;
    const orig = mesh.userData._disOrig;
    if (!mesh.userData._disClone) {
      const one = (m) => {
        if (!isToon(m)) return m;
        const c = m.clone();
        c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;
        return c;
      };
      mesh.userData._disClone = Array.isArray(orig) ? orig.map(one) : one(orig);
    }
    mesh.material = mesh.userData._disClone;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) { if (isToon(m)) list.push(dissolveUniforms(m)); }
  }

  function dissolve(target, o = {}) {
    const obj = target?.object || target;
    if (!obj?.traverse) return null;
    const ent = target?.object ? target : null;
    const existing = jobs.find((j) => j.obj === obj);
    if (existing) return existing.handle;
    const color = new THREE.Color(o.color ?? (ent?.isBoss ? 0xb14bff : 0x9a5cff));
    const parts = [];
    let idx = 0;
    obj.traverse((m) => {
      if (!m.isMesh || !m.material) return;
      if (m.name === 'outline') { parts.push({ kind: 'outline', mesh: m, delay: 0, u: null }); return; }
      const us = [];
      cloneFor(m, us);
      parts.push({ kind: us.length ? 'toon' : 'other', mesh: m, delay: 0, u: us, i: idx++ });
    });
    const dur = Math.max(0.2, o.dur ?? 0.9);
    const stagger = ent?.isBoss || o.stagger ? 0.5 * dur : 0;
    for (const p of parts) { if (p.kind === 'toon' && stagger > 0 && idx > 1) p.delay = (p.i / (idx - 1)) * stagger; }
    for (const p of parts) for (const u of p.u || []) { u.uDissolve.value = 0; u.uDissolveColor.value.copy(color); }
    const job = { obj, ent, parts, t: 0, dur, total: dur + stagger, color, embers: o.embers !== false, emberAcc: 0, onDone: o.onDone || null, handle: null, done: false };
    job.handle = { get progress() { return Math.min(1, job.t / job.total); }, get alive() { return !job.done; } };
    jobs.push(job);
    return job.handle;
  }

  function undissolve(target) {
    const obj = target?.object || target;
    if (!obj?.traverse) return;
    const i = jobs.findIndex((j) => j.obj === obj); if (i >= 0) jobs.splice(i, 1);
    obj.traverse((m) => {
      if (m.name === 'outline') { m.visible = true; return; }
      if (m.isMesh && m.userData._disOrig) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of mats) { if (mm?._dis) mm._dis.uDissolve.value = -1; }
        m.material = m.userData._disOrig; m.visible = true;
      }
    });
  }

  function update(dt) {
    for (let j = jobs.length - 1; j >= 0; j--) {
      const job = jobs[j];
      job.t += dt;
      for (const p of job.parts) {
        const k = Math.max(0, Math.min(1, (job.t - p.delay) / job.dur));
        if (p.kind === 'toon') { const v = k * 1.05; for (const u of p.u) u.uDissolve.value = v; }
        else if (p.kind === 'outline') { if (k > 0.35) p.mesh.visible = false; }
        else if (k > 0.6) p.mesh.visible = false;
      }
      if (job.embers && job.t < job.total) {
        job.emberAcc += dt * 15;
        if (job.emberAcc >= 1) {
          _box.setFromObject(job.obj);
          if (!_box.isEmpty()) {
            emberOpts.color[1] = job.color.getHex();
            while (job.emberAcc >= 1) {
              job.emberAcc -= 1;
              _v.set(THREE.MathUtils.lerp(_box.min.x, _box.max.x, Math.random()), THREE.MathUtils.lerp(_box.min.y, _box.max.y, Math.random()), THREE.MathUtils.lerp(_box.min.z, _box.max.z, Math.random()));
              vfx.burst?.(_v, emberOpts, true);
            }
          } else job.emberAcc = 0;
        }
      }
      if (job.t >= job.total + 0.05) {
        job.done = true; jobs.splice(j, 1);
        const cb = job.onDone; job.onDone = null;
        if (cb) { try { cb(); } catch (err) { console.error('[vfx] dissolve onDone', err); } }
      }
    }
  }
  return { dissolve, undissolve, update, active: () => jobs.length };
}
