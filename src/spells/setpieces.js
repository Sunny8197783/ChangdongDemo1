// Finisher set pieces (mage master path): big hero-side visuals that form during the cinematic buildup
// and then deliver the blow. Animated with REAL time (the cinematic freezes gameplay time), built lazily
// once per element and reused. Materials come from spells/assets (already compiled at boot → no hitch).
import * as THREE from 'three';
import { glint, GLINT, midOf, lightOf } from './palette.js';
import {
  fresnelMat, coreMat, flameGeo, flameMat, crystalGeo, iceMatSolid, outlineBasic, rockGeo, rockMat,
  sigilMat, tornadoGeo, tornadoMat, uTime,
} from './assets.js';

const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeIn = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * t; };
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

/** Sigil material with its own texture instance (map.rotation is animated per sigil). */
function sigil(color) {
  const m = sigilMat(color);
  m.map = m.map.clone(); m.map.center.set(0.5, 0.5);
  return m;
}

function outlined(geo, mat, color, s = 1.06) {
  const m = new THREE.Mesh(geo, mat);
  const o = new THREE.Mesh(geo, outlineBasic(color)); o.scale.setScalar(s); o.name = 'outline';
  m.add(o); m.castShadow = true;
  return m;
}

/** Phoenix feather: flame-tongue shader tuned down (many overlap additively) with a crimson→gold gradient. */
let _feather = null;
function featherMat() {
  if (_feather) return _feather;
  _feather = new THREE.ShaderMaterial({
    uniforms: { time: uTime },
    vertexShader: /* glsl */`
      uniform float time; varying vec2 vUv;
      void main(){
        vUv = uv; vec3 p = position; float w = uv.y * uv.y;
        p.x += sin(time * 7.0 + uv.y * 4.0 + position.y) * 0.12 * w;
        p.z += cos(time * 6.0 + uv.y * 3.0) * 0.1 * w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float time; varying vec2 vUv;
      void main(){
        float y = vUv.y;
        vec3 c = mix(vec3(1.0, 0.78, 0.32), vec3(1.0, 0.36, 0.06), smoothstep(0.0, 0.5, y));
        c = mix(c, vec3(0.75, 0.08, 0.04), smoothstep(0.5, 1.0, y));
        float edge = smoothstep(0.0, 0.35, 1.0 - abs(vUv.x * 2.0 - 1.0));
        float a = (1.0 - smoothstep(0.55, 1.0, y)) * (0.75 + 0.25 * sin(time * 17.0 + y * 9.0));
        gl_FragColor = vec4(c * 0.3 * a, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  return _feather;
}

// ------------------------------------------------------------------ builders
function buildPhoenix() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), coreMat(0xff9a30, 1.2)); core.scale.set(1, 1, 2.2);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.2, 18, 12), fresnelMat(0xff5a10, { power: 1.6, intensity: 1.2, core: 0.02 })); shell.scale.set(1, 1, 2);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), coreMat(0xffc070, 1.2)); head.position.set(0, 0.5, 1.9);
  const crest = new THREE.Mesh(flameGeo(), featherMat()); crest.position.set(0, 0.7, 1.8); crest.scale.set(1.2, 1.6, 1.2); crest.rotation.x = -0.6;
  body.add(core, shell, head, crest);
  const fg = flameGeo(), fm = featherMat();
  const wings = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(side * 0.6, 0.2, 0.2);
    for (let i = 0; i < 9; i++) {
      const f = new THREE.Mesh(fg, fm);
      const t = i / 8;
      f.rotation.z = side * (-Math.PI / 2 + t * 1.25);     // fan from horizontal upward
      f.position.set(side * t * 1.2, t * 0.4, -t * 0.6);
      const L = 3.2 + Math.sin(t * Math.PI) * 3.6;
      f.scale.set(1.6, L, 1.6);
      w.add(f);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), fresnelMat(0xff6a10, { power: 2.2, intensity: 0.7, core: 0.0 }));
    glow.scale.set(4.5, 2.2, 1.2); glow.position.set(side * 3.6, 1.4, -0.4); w.add(glow);
    w.userData.side = side;
    g.add(w); wings.push(w);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0, -1.6); g.add(tail);
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(fg, fm); f.rotation.x = -Math.PI / 2 - 0.25 + i * 0.12; f.rotation.y = (i - 2) * 0.22; f.scale.set(1.3, 5 + (i % 2) * 2, 1.3);
    tail.add(f);
  }
  g.userData = { body, wings, tail };
  return g;
}

function buildIceSky() {
  const g = new THREE.Group();
  const crystals = [];
  const geo = crystalGeo(), mat = iceMatSolid();
  for (let i = 0; i < 9; i++) {
    const c = outlined(geo, mat, 0x1d4a66, 1.08);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), fresnelMat(0x9feaff, { power: 1.4, intensity: 1.2, core: 0.02 }));
    halo.position.y = 0.8; halo.scale.set(1, 2.2, 1); c.add(halo);
    c.userData = { a: (i / 9) * Math.PI * 2, r: 8 + (i % 3) * 1.6, h: 19 + (i % 2) * 4, s: 4 + (i % 3) };
    g.add(c); crystals.push(c);
  }
  const big = outlined(geo, mat, 0x1d4a66, 1.06);
  const bigHalo = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 10), fresnelMat(0xdffaff, { power: 1.2, intensity: 1.2, core: 0.05 }));
  bigHalo.position.y = 0.8; bigHalo.scale.set(1.2, 2.4, 1.2); big.add(bigHalo);
  g.add(big);
  const sig = new THREE.Mesh(new THREE.CircleGeometry(1, 48), sigil(midOf('ice'))); sig.rotation.x = Math.PI / 2; sig.renderOrder = 5; sig.frustumCulled = false;
  g.add(sig);
  g.userData = { crystals, big, sig };
  return g;
}

function buildThunder() {
  const g = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.CircleGeometry(1, 56), sigil(midOf('lightning'))); sky.rotation.x = Math.PI / 2; sky.renderOrder = 5; sky.frustumCulled = false;
  const sky2 = new THREE.Mesh(new THREE.CircleGeometry(1, 48), sigil(lightOf('lightning'))); sky2.rotation.x = Math.PI / 2; sky2.renderOrder = 5; sky2.frustumCulled = false;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 64), fresnelMat(0xd9c2ff, { power: 0.5, intensity: 1.2, core: 0.6 })); halo.rotation.x = Math.PI / 2;
  // hero-side vertical sigil (the god's mark behind the caster)
  const back = new THREE.Mesh(new THREE.CircleGeometry(1, 40), sigil(lightOf('lightning'))); back.renderOrder = 5; back.frustumCulled = false;
  // conduit from hero to sky and the final colossal bolt column
  const conduit = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true), fresnelMat(0xc9a4ff, { power: 0.8, intensity: 1.2, core: 0.3 }));
  const column = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 18, 1, true), coreMat(0xd9c2ff, 1.2));
  const columnGlow = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 18, 1, true), fresnelMat(0xa070ff, { power: 0.9, intensity: 1.2, core: 0.15 }));
  column.visible = columnGlow.visible = false;
  g.add(sky, sky2, halo, back, conduit, column, columnGlow);
  g.userData = { sky, sky2, halo, back, conduit, column, columnGlow };
  return g;
}

function buildEye() {
  const g = new THREE.Group();
  const vortex = new THREE.Mesh(tornadoGeo(), tornadoMat()); vortex.renderOrder = 6;
  vortex.material.uniforms.colA.value.set(0xf4fffa); vortex.material.uniforms.colB.value.set(0x4a8a78); vortex.material.uniforms.speed.value = 0.6;
  const eye = new THREE.Mesh(new THREE.TorusGeometry(1, 0.18, 8, 48), fresnelMat(0xbfffe0, { power: 0.6, intensity: 1.2, core: 0.5 })); eye.rotation.x = Math.PI / 2;
  const eyeCore = new THREE.Mesh(new THREE.CircleGeometry(1, 40), sigil(midOf('wind'))); eyeCore.rotation.x = Math.PI / 2; eyeCore.renderOrder = 5; eyeCore.frustumCulled = false;
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 5, 40), fresnelMat(0x8fffc1, { power: 0.8, intensity: 0.9, core: 0.15 }));
    rings.push(r); g.add(r);
  }
  const column = new THREE.Mesh(tornadoGeo(), tornadoMat()); column.renderOrder = 6; column.visible = false;
  column.material.uniforms.colA.value.set(GLINT); column.material.uniforms.colB.value.set(0x5fc8a0); column.material.uniforms.speed.value = 2.2;
  const columnCore = new THREE.Mesh(tornadoGeo(), tornadoMat()); columnCore.renderOrder = 6; columnCore.visible = false;
  columnCore.material.uniforms.colA.value.set(0xeafff6); columnCore.material.uniforms.colB.value.set(0x8fffc1); columnCore.material.uniforms.speed.value = 3;
  g.add(vortex, eye, eyeCore, column, columnCore);
  g.userData = { vortex, eye, eyeCore, rings, column, columnCore };
  return g;
}

function buildColossus() {
  const g = new THREE.Group();          // root at ground, faces +Z (toward the hero after lookAt)
  const geo = rockGeo(), mat = rockMat(), OC = 0x2a1c10;
  const body = new THREE.Group(); g.add(body);
  const part = (parent, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    const m = outlined(geo, mat, OC, 1.07); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); parent.add(m); return m;
  };
  part(body, 0, 2.5, 0, 3.6, 5, 2.6);                    // hips
  part(body, 0, 7.5, 0, 6.5, 6.5, 4.2, 0.1);              // chest
  part(body, -3.6, 9.6, 0, 3.2, 3, 3, 0, 0, 0.4);         // shoulders
  part(body, 3.6, 9.6, 0, 3.2, 3, 3, 0, 0, -0.4);
  const head = part(body, 0, 12, 0.6, 2.8, 2.6, 2.6, 0.15);
  const eyeMat = coreMat(0xffc050, 1.2);
  const eyes = [];
  for (const sx of [-0.45, 0.45]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), eyeMat); e.position.set(sx, 0.05, 0.42); e.scale.set(1.4, 0.7, 0.5); head.add(e); eyes.push(e); }
  // glowing rune cracks on the chest
  const rune = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), fresnelMat(0xffb040, { power: 1.6, intensity: 1.2, core: 0.05 })); rune.position.set(0, 7.6, 1.2); rune.scale.set(1.6, 1.6, 0.6); body.add(rune);
  // arms: pivot at the shoulder, arm hangs along -Y
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(side * 4.4, 9.8, 0); body.add(pivot);
    part(pivot, 0, -2.6, 0, 2.3, 4.2, 2.3);
    part(pivot, 0, -6.4, 0.3, 2.1, 4.2, 2.1);
    const fist = part(pivot, 0, -9.4, 0.4, 3, 2.8, 3);
    pivot.userData.side = side; pivot.userData.fist = fist;
    arms.push(pivot);
  }
  g.userData = { body, arms, eyes, rune, head };
  return g;
}

const BUILDERS = { fire: buildPhoenix, ice: buildIceSky, lightning: buildThunder, wind: buildEye, earth: buildColossus };

/**
 * createSetPieces(S) → { start(el, ctx), impact(), end(), update(realDt), active }
 * ctx: {hero: Vector3 (feet), center: Vector3 (ground), dir: Vector3 (flat hero→center)}
 */
export function createSetPieces(S) {
  const { game } = S;
  const cache = {};
  let cur = null;                // {el, g, t, phase:'build'|'strike'|'out', ts, ctx, onStrike}
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  const fx = { t: 0 };

  function start(el, ctx) {
    if (cur) hide();
    const g = cache[el] || (cache[el] = BUILDERS[el]());
    g.visible = true;
    game.scene.add(g);
    cur = { el, g, t: 0, phase: 'build', ts: 0, out: 0, ctx, onStrike: null, struck: false };
    layout(0);
  }

  /** Begin the delivering motion; onStrike() fires at the moment of contact (≈0.3 s real later). */
  function strike(onStrike) {
    if (!cur) { onStrike?.(); return; }
    cur.phase = 'strike'; cur.ts = 0; cur.onStrike = onStrike;
  }
  /** Fade the set piece out (after the strike has landed; a pending strike finishes first). */
  function end() {
    if (!cur || cur.phase === 'out') return;
    if (cur.phase === 'strike') { cur.endAfter = true; return; }
    if (!cur.struck && cur.onStrike) fireStrike();
    cur.phase = 'out'; cur.out = 0;
  }
  function hide() { if (!cur) return; game.scene.remove(cur.g); cur.g.visible = false; cur = null; }
  function fireStrike() { if (cur.struck) return; cur.struck = true; const f = cur.onStrike; cur.onStrike = null; try { f?.(); } catch (err) { console.error('[spells] finisher strike', err); } }

  const STRIKE_T = { fire: 0.32, ice: 0.3, lightning: 0.12, wind: 0.22, earth: 0.34 };

  function layout(dt) {
    const c = cur, u = c.g.userData, { hero, center, dir } = c.ctx;
    const k = easeOut(c.t / 2.4);           // buildup progress
    const T = game.realTime;
    const sp = c.phase === 'build' ? 0 : c.phase === 'strike' ? Math.min(1, c.ts / STRIKE_T[c.el]) : 1;
    const out = c.phase === 'out' ? Math.min(1, c.out / 1.1) : 0;
    const yaw = Math.atan2(dir.x, dir.z);
    switch (c.el) {
      case 'fire': {
        // hovering behind/above the hero, wings unfolding; strike = dive onto the center
        v.set(hero.x + dir.x * 5, hero.y + 3.6 + Math.sin(T * 3) * 0.2, hero.z + dir.z * 5);
        if (c.phase !== 'build') {
          v2.set(center.x, center.y + 1.2, center.z);
          const e = easeIn(sp);
          v.lerp(v2, e);
        }
        c.g.position.copy(v);
        c.g.rotation.set(-0.15 - 0.4 * sp, yaw, 0);
        const s = (0.2 + 0.55 * k) * (1 + sp * 0.6 + out * 1.2);
        c.g.scale.setScalar(s);
        for (const w of u.wings) { const side = w.userData.side; w.rotation.set(0, side * (0.9 - 0.9 * k), side * (0.35 - 0.35 * k + Math.sin(T * 5) * 0.08 * k)); }
        u.tail.rotation.y = Math.sin(T * 4) * 0.2;
        c.g.visible = out < 0.95;
        break;
      }
      case 'ice': {
        c.g.position.set(center.x, center.y, center.z);
        c.g.rotation.set(0, 0, 0); c.g.scale.setScalar(1);
        const fall = easeIn(sp);
        for (const cr of u.crystals) {
          const d = cr.userData;
          const a = d.a + T * 0.25 * (1 - fall);
          const hh = (d.h + 18 * (1 - k)) * (1 - fall) + 1 * fall;
          cr.position.set(Math.cos(a) * d.r * (1 - fall * 0.35), hh, Math.sin(a) * d.r * (1 - fall * 0.35));
          cr.rotation.set(Math.PI, a, 0.25);       // point down
          cr.scale.setScalar(d.s * k * (1 - out));
          cr.visible = out < 0.98;
        }
        const bh = (26 + 16 * (1 - k)) * (1 - fall) + 2 * fall;
        u.big.position.set(0, bh, 0); u.big.rotation.set(Math.PI, T * 0.4, 0); u.big.scale.setScalar(10 * k * (1 - out));
        u.big.visible = out < 0.98;
        u.sig.position.set(0, 16, 0); u.sig.scale.setScalar(15 * k * (1 + out)); u.sig.material.opacity = 0.85 * k * (1 - out) * (1 - fall * 0.5);
        u.sig.material.map.rotation = T * 0.6;
        break;
      }
      case 'lightning': {
        c.g.position.set(0, 0, 0); c.g.rotation.set(0, 0, 0); c.g.scale.setScalar(1);
        const H = center.y + 24;
        u.sky.position.set(center.x, H, center.z); u.sky.scale.setScalar(14 * k * (1 + out * 0.4)); u.sky.material.opacity = (0.95 * k) * (1 - out);
        u.sky.material.map.rotation = T * 0.8;
        u.sky2.position.set(center.x, H - 0.5, center.z); u.sky2.scale.setScalar(8 * k); u.sky2.material.opacity = 0.7 * k * (1 - out);
        u.halo.position.set(center.x, H - 0.3, center.z); u.halo.scale.setScalar(16 * k); u.halo.rotation.z = T;
        u.back.position.set(hero.x + dir.x * 1.2, hero.y + 4.6, hero.z + dir.z * 1.2); u.back.rotation.set(-0.35, yaw, 0);
        u.back.scale.setScalar(2.2 * k * (1 - out)); u.back.material.opacity = 0.9 * k * (1 - out); u.back.material.map.rotation = -T * 1.5;
        // conduit from staff to the sky sigil
        const top = v.set(center.x, H, center.z), bot = v2.set(hero.x, hero.y + 2.3, hero.z);
        const L = top.distanceTo(bot);
        u.conduit.position.lerpVectors(bot, top, 0.5);
        u.conduit.quaternion.setFromUnitVectors(UPV, v.sub(bot).normalize());
        const flick = 0.6 + Math.random() * 0.4;
        u.conduit.scale.set(0.12 + 0.25 * k * flick, L, 0.12 + 0.25 * k * flick);
        u.conduit.visible = c.phase === 'build' && k > 0.15;
        const col = c.phase !== 'build';
        u.column.visible = u.columnGlow.visible = col && out < 0.98;
        if (col) {
          const grow = easeOut(sp), w = (c.phase === 'out' ? 1 - out : 1) * (3.2 + Math.random() * 0.6);
          const len = (H - center.y) * grow;
          u.column.position.set(center.x, H - len / 2, center.z); u.column.scale.set(w * 0.55, len, w * 0.55);
          u.columnGlow.position.copy(u.column.position); u.columnGlow.scale.set(w * 1.3, len, w * 1.3);
        }
        break;
      }
      case 'wind': {
        c.g.position.set(0, 0, 0); c.g.rotation.set(0, 0, 0); c.g.scale.setScalar(1);
        const H = center.y + 30;
        // inverted funnel cloud: wide mouth up in the sky, narrowing down toward the eye
        u.vortex.position.set(center.x, H + 6, center.z); u.vortex.rotation.set(Math.PI, T * 1.2, 0);
        u.vortex.scale.set(4.5 * k, 0.9 * k + 0.01, 4.5 * k); u.vortex.material.uniforms.opacity.value = 0.95 * k * (1 - out);
        u.eye.position.set(center.x, H - 3, center.z); u.eye.scale.setScalar(5 * k * (1 + out)); u.eye.rotation.z = T * 2;
        u.eyeCore.position.set(center.x, H - 3.2, center.z); u.eyeCore.scale.setScalar(4.5 * k); u.eyeCore.material.opacity = 0.9 * k * (1 - out);
        u.eyeCore.material.map.rotation = -T * 2;
        for (let i = 0; i < u.rings.length; i++) {
          const r = u.rings[i];
          r.position.set(hero.x, hero.y + 0.6 + i * 1.1 + Math.sin(T * 3 + i) * 0.2, hero.z);
          r.rotation.set(Math.PI / 2 + Math.sin(T * 2 + i) * 0.25, 0, T * (3 + i));
          r.scale.setScalar((1.05 + i * 0.35) * k * (1 - out));
          r.visible = out < 0.98;
        }
        const col = c.phase !== 'build';
        u.column.visible = u.columnCore.visible = col && out < 0.98;
        if (col) {
          const grow = easeOut(sp) * (1 - out);
          u.column.position.set(center.x, center.y, center.z); u.column.rotation.y = T * 5;
          u.column.scale.set(1.7 * grow, 2.7 * grow + 0.01, 1.7 * grow); u.column.material.uniforms.opacity.value = grow;
          u.columnCore.position.copy(u.column.position); u.columnCore.rotation.y = -T * 7;
          u.columnCore.scale.set(0.9 * grow, 2.6 * grow + 0.01, 0.9 * grow); u.columnCore.material.uniforms.opacity.value = grow;
        }
        break;
      }
      case 'earth': {
        // colossus rises on the far side of the target, facing the hero; strike = right fist slams down
        const bx = center.x + dir.x * 8, bz = center.z + dir.z * 8;
        const gy = S.height(bx, bz);
        const sink = c.phase === 'out' ? easeIn(out) * 18 : 0;
        c.g.position.set(bx, gy - 17 * (1 - k) - sink + Math.sin(c.t * 40) * 0.08 * (1 - k), bz);
        c.g.rotation.set(0, yaw + Math.PI, 0);
        c.g.scale.setScalar(1.1);
        u.body.rotation.x = 0.18 * sp * (1 - out);
        const [L, R] = u.arms;
        // raised (arm pointing up/back) → slammed forward-down
        const raise = Math.min(1, Math.max(0, (k - 0.5) / 0.5));
        const slam = easeIn(sp);
        R.rotation.set(-2.7 * raise * (1 - slam) + -1.15 * slam, 0, -0.15);
        L.rotation.set(-0.3 * raise, 0, 0.25 + 0.2 * raise);
        const glow = Math.min(1, Math.max(0, (k - 0.6) / 0.4));
        for (const e of u.eyes) e.scale.set(1.4 * glow + 0.01, 0.7 * glow + 0.01, 0.5);
        u.rune.material.uniforms.intensity.value = 0.3 + 2 * glow + (c.phase === 'strike' ? 1.5 : 0);
        c.g.visible = out < 0.99;
        break;
      }
    }
  }

  const UPV = new THREE.Vector3(0, 1, 0);
  let dustT = 0;
  function update(realDt) {
    if (!cur) return;
    const c = cur;
    if (c.phase === 'build') c.t += realDt;
    else if (c.phase === 'strike') {
      c.ts += realDt; c.t += realDt;
      if (c.ts >= STRIKE_T[c.el]) { fireStrike(); if (!cur) return; c.phase = c.endAfter ? 'out' : 'hold'; c.out = 0; c.hold = 0; }
    } else if (c.phase === 'hold') { c.t += realDt; c.ts = STRIKE_T[c.el]; c.hold += realDt; if (c.hold > 2.5) { c.phase = 'out'; c.out = 0; } }
    else if (c.phase === 'out') { c.out += realDt; if (c.out >= 1.2) { hide(); return; } }
    layout(realDt);
    // ambient buildup particles (spawned in world space; they hang in the frozen frame like sparks in time)
    dustT -= realDt;
    if (dustT <= 0 && c.phase === 'build') {
      dustT = 0.12;
      const { hero, center } = c.ctx;
      switch (c.el) {
        case 'fire': S.vfx('burst', v.set(hero.x, hero.y + 1, hero.z), { count: 6, color: [0xffe080, 0xff4a10], shape: 'ember', speed: 3, dir: UPV, spread: 0.6, size: 0.22, life: 1.2, radius: 1.6 }); break;
        case 'ice': S.vfx('burst', v.set(center.x, center.y + 10, center.z), { count: 10, color: [glint(0xbff4ff), 0xbff4ff], shape: 'snow', speed: 1, spread: 1, size: 0.25, life: 2.5, radius: 9, gravity: -1 }); break;
        case 'lightning': S.vfx('burst', v.set(hero.x, hero.y + 1.2, hero.z), { count: 5, color: [glint(0xc9a4ff), 0xc9a4ff], shape: 'spark', speed: 4, spread: 1, size: 0.12, life: 0.4, radius: 1.2 }); break;
        case 'wind': S.vfx('burst', v.set(hero.x, hero.y + 0.5, hero.z), { count: 6, color: [glint(0x8fffc1), 0x8fffc1], shape: 'leaf', speed: 5, spread: 1, size: 0.16, life: 1, radius: 2, tangential: 6 }); break;
        case 'earth': {
          const bx = center.x + c.ctx.dir.x * 8, bz = center.z + c.ctx.dir.z * 8;
          S.vfx('burst', v.set(bx, S.height(bx, bz) + 0.5, bz), { count: 5, color: [0xd9c09a, 0xa88a68], shape: 'smoke', speed: 4, spread: 0.7, dir: UPV, size: 2, sizeEnd: 4, life: 1.4, additive: false, radius: 4 });
          if (Math.random() < 0.5) S.vfx('debris', v, { count: 2, material: 'rock', color: 0x8a7458, size: 0.5, speed: 7, life: 1.5 });
          break;
        }
      }
    }
    void fx;
  }

  /** Fist / dive / crystal landing points for the strike VFX (world space). */
  function crystalPoints(out) {
    if (!cur || cur.el !== 'ice') return out;
    const { center } = cur.ctx;
    for (const cr of cur.g.userData.crystals) { const d = cr.userData; out.push(new THREE.Vector3(center.x + Math.cos(d.a + game.realTime * 0.25) * d.r * 0.65, 0, center.z + Math.sin(d.a + game.realTime * 0.25) * d.r * 0.65)); }
    return out;
  }

  return {
    start, strike, end, update, hide, crystalPoints,
    get active() { return !!cur; },
    get element() { return cur?.el || null; },
    warm(group) { for (const el in BUILDERS) { const g = cache[el] || (cache[el] = BUILDERS[el]()); group.add(g); } },
    unwarm(group) { for (const el in cache) group.remove(cache[el]); },
    _smooth: smooth,
  };
}
