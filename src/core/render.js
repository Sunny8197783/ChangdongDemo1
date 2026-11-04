// game.render (PLAN v4 §2.4, §5.3, §7.4.1). Owned by core.
//   { tier, rendererName, msaa, pointLights, shadowType, threatScene, overlayCamera, warm(obj, {target}), snapshot(obj, opts) }
// threatScene: a separate THREE.Scene (no background, no fog) drawn by core AFTER the composer, straight to the canvas,
// never part of the main or shadow passes. Its materials are toneMapped:false, fog:false and write sRGB output
// (#include <colorspace_fragment>); warm them with warm(obj, {target:'overlay'}).
import * as THREE from 'three';

export function createRender(game, { renderer, scene, camera, rawCompile, sceneTarget, gpu, msaa, pointLights, shadowType }) {
  const threatScene = new THREE.Scene();
  threatScene.name = 'threatScene';
  threatScene.background = null; threatScene.fog = null;
  threatScene.matrixWorldAutoUpdate = true;
  const overlayCamera = new THREE.PerspectiveCamera();
  overlayCamera.name = 'overlayCamera';

  // ---- warm (P0a: compile against the right target and light set; P0b adds the real first draw) ----
  const warmed = new WeakSet();
  const queue = [];
  function needsWarm(obj) {
    let any = false;
    obj.traverse?.((o) => {
      const m = o.material; if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) if (mm && !warmed.has(mm)) any = true;
    });
    return any;
  }
  function markWarm(obj) {
    obj.traverse?.((o) => { const m = o.material; if (!m) return; for (const mm of Array.isArray(m) ? m : [m]) if (mm) warmed.add(mm); });
  }
  function warmNow(obj, target) {
    if (!obj || !needsWarm(obj)) return;
    const prevRT = renderer.getRenderTarget();
    try {
      if (target === 'overlay') {
        renderer.setRenderTarget(null);                  // canvas variant: sRGB output, no tone mapping (toneMapped:false)
        rawCompile(obj, overlayCamera, threatScene);
      } else {
        renderer.setRenderTarget(sceneTarget());         // the composer's linear HalfFloat target variant
        rawCompile(obj, camera, scene);                  // the main scene's light set → the program actually drawn
      }
      markWarm(obj);
    } catch (err) { console.warn('[render.warm]', err?.message || err); }
    finally { renderer.setRenderTarget(prevRT); }
  }

  // ---- snapshot: one object rendered alone into a small sRGB target → PNG data URL (codex thumbnails, legend) ----
  let snap = null;
  function snapKit() {
    if (snap) return snap;
    const s = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xdfeaff, 0x4a4a52, 1.4);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.0); sun.position.set(3, 6, 4);
    s.add(hemi, sun);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
    const canvas = document.createElement('canvas');
    snap = { scene: s, cam, canvas, ctx: canvas.getContext('2d'), rt: null, w: 0, h: 0, box: new THREE.Box3(), sphere: new THREE.Sphere() };
    return snap;
  }
  async function snapshot(obj, { w = 128, h = 128, yaw = 0.6, pitch = 0.15, dist = 0, scene: which = 'scene' } = {}) {
    if (!obj) return null;
    const K = snapKit();
    w = Math.max(8, Math.min(1024, Math.round(w))); h = Math.max(8, Math.min(1024, Math.round(h)));
    if (!K.rt || K.w !== w || K.h !== h) {
      K.rt?.dispose();
      K.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
      K.rt.texture.colorSpace = THREE.SRGBColorSpace;
      K.w = w; K.h = h; K.canvas.width = w; K.canvas.height = h;
    }
    const parent = obj.parent, host = which === 'threat' ? new THREE.Scene() : K.scene;
    host.add(obj);
    obj.updateMatrixWorld(true);
    K.box.setFromObject(obj); K.box.getBoundingSphere(K.sphere);
    const r = Math.max(0.05, K.sphere.radius), c = K.sphere.center;
    const d = dist > 0 ? dist : r / Math.sin((K.cam.fov * Math.PI / 180) / 2) * 1.08;
    K.cam.aspect = w / h; K.cam.near = Math.max(0.01, d - r * 3); K.cam.far = d + r * 3; K.cam.updateProjectionMatrix();
    K.cam.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * Math.cos(pitch) * d);
    K.cam.lookAt(c);
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevAlpha = renderer.getClearAlpha();
    const prevColor = renderer.getClearColor(new THREE.Color());
    const info = renderer.info, prevReset = info.autoReset;
    const px = new Uint8Array(w * h * 4);
    try {
      info.autoReset = false;
      renderer.setRenderTarget(K.rt); renderer.setClearColor(0x000000, 0); renderer.autoClear = true;
      renderer.clear(); renderer.render(host, K.cam);
      renderer.readRenderTargetPixels(K.rt, 0, 0, w, h, px);
    } finally {
      renderer.setRenderTarget(prevRT); renderer.setClearColor(prevColor, prevAlpha); renderer.autoClear = prevAuto; info.autoReset = prevReset;
      host.remove(obj); if (parent) parent.add(obj);
    }
    const img = K.ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);   // flip Y
    K.ctx.putImageData(img, 0, 0);
    return K.canvas.toDataURL('image/png');
  }

  const api = {
    tier: gpu.tier, rendererName: gpu.rendererName, msaa, pointLights, shadowType,
    threatScene, overlayCamera,
    /** Compile obj's materials for its pass (idempotent per material). target 'scene' (default) | 'overlay'. */
    warm(obj, { target = 'scene', now = false } = {}) {
      if (!obj) return;
      if (now) warmNow(obj, target); else queue.push(obj, target);
    },
    snapshot,
    /** core: process queued warm requests (called once per frame before render). */
    flushWarm(max = 8) {
      let n = 0;
      while (queue.length && n < max) { const obj = queue.shift(), target = queue.shift(); warmNow(obj, target); n++; }
      return n;
    },
    get warmQueue() { return queue.length / 2; },
    /** core: draw the threat scene over the finished canvas frame (§2.4). Returns the draw-call count of the pass. */
    drawOverlay() {
      game.tells?.preOverlay?.();
      if (!threatScene.children.length) return 0;
      overlayCamera.copy(camera, false);
      overlayCamera.projectionMatrix.copy(camera.projectionMatrix);
      overlayCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      const c0 = renderer.info.render.calls;
      renderer.setRenderTarget(null);
      const prev = renderer.autoClear;
      renderer.autoClear = false;
      try { renderer.render(threatScene, overlayCamera); } finally { renderer.autoClear = prev; }
      return renderer.info.render.calls - c0;
    },
  };
  return api;
}
