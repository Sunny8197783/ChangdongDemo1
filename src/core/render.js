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

  // ---- warm (§2.5): compile against the right target and light set, then ONE real draw of the object itself so the
  //      driver's per-state pipeline and the geometry upload are paid before first sight:
  //      scene objects → 64×64 HalfFloat target with the main scene's lights (only the object's layer is drawn);
  //      threat-scene objects → a 1×1 scissored draw on the canvas (the sRGB canvas variant).
  const WARM_LAYER = 29;   // 30 = player HIDDEN_LAYER, 31 = CLEAR_LAYER, 1 = world shadow-only
  const warmRT = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType, depthBuffer: true });
  warmRT.texture.name = 'warm64';
  const warmCam = new THREE.PerspectiveCamera(60, 1, 0.05, 2000);
  const stats = { draws: 0, objects: 0, ms: 0, boot: null };
  /**
   * Draw `root` (and everything under it, hidden objects included) once. mode 'layer': only root's subtree via the warm
   * layer (lights of `host` get the layer temporarily); mode 'all': the whole host scene.
   */
  function realDraw(root, host, target, mode = 'layer') {
    const t0 = performance.now();
    const forced = [], culled = [], layered = [];
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevSU = renderer.shadowMap.needsUpdate;
    const prevAutoSU = renderer.shadowMap.autoUpdate;
    const vp = new THREE.Vector4(), sc = new THREE.Vector4(); renderer.getViewport(vp); renderer.getScissor(sc); const scT = renderer.getScissorTest();
    let n = 0;
    try {
      root.traverse((o) => {
        if (!o.visible) { forced.push(o); o.visible = true; }
        if (o.material || o.isLight) {
          if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
          if (mode === 'layer') { layered.push(o, o.layers.mask); o.layers.enable(WARM_LAYER); }
          if (o.material) n++;
        }
      });
      // ancestors of root must be visible for the draw to reach it
      for (let p = root.parent; p; p = p.parent) if (!p.visible) { forced.push(p); p.visible = true; }
      if (mode === 'layer' && host !== root) host.traverse((o) => { if (o.isLight) { layered.push(o, o.layers.mask); o.layers.enable(WARM_LAYER); } });
      warmCam.position.copy(camera.position); warmCam.quaternion.copy(camera.quaternion); warmCam.updateMatrixWorld(true);
      warmCam.layers.mask = mode === 'layer' ? (1 << WARM_LAYER) : 0xffffffff;
      renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
      renderer.autoClear = true;
      if (target === 'overlay') {
        renderer.setRenderTarget(null);
        renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1); renderer.setViewport(0, 0, 1, 1);
        renderer.autoClear = false;
      } else renderer.setRenderTarget(warmRT);
      const c0 = renderer.info.render.calls;
      renderer.render(host === root && !root.isScene ? root : host, warmCam);
      stats.draws += renderer.info.render.calls - c0;
      stats.objects += n;
    } catch (err) { console.warn('[render.warm] draw', err?.message || err); }
    finally {
      for (const o of forced) o.visible = false;
      for (const o of culled) o.frustumCulled = true;
      for (let i = 0; i < layered.length; i += 2) layered[i].layers.mask = layered[i + 1];
      renderer.setRenderTarget(prevRT); renderer.autoClear = prevAuto;
      renderer.setViewport(vp); renderer.setScissor(sc); renderer.setScissorTest(scT);
      renderer.shadowMap.needsUpdate = prevSU; renderer.shadowMap.autoUpdate = prevAutoSU;
      stats.ms += performance.now() - t0;
    }
  }
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
      renderer.setRenderTarget(prevRT);
      // real first draw with the right light set: an object not yet in a scene is parented temporarily
      const host = target === 'overlay' ? threatScene : scene;
      const parent = obj.parent;
      if (!parent && obj !== host) host.add(obj);
      try { realDraw(obj, host, target, 'layer'); } finally { if (!parent && obj.parent === host) host.remove(obj); }
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
    /**
     * Boot warm-up (§2.5, after compile/compileAsync): one real draw of EVERY object of the main scene (hidden ones
     * included, culling off) into the 64×64 target, and of the threat scene as a 1×1 scissored canvas draw.
     */
    bootWarm() {
      const t0 = performance.now(), d0 = stats.draws;
      realDraw(scene, scene, 'scene', 'all');
      if (threatScene.children.length) realDraw(threatScene, threatScene, 'overlay', 'all');
      scene.traverse((o) => { const m = o.material; if (m) for (const mm of Array.isArray(m) ? m : [m]) if (mm) warmed.add(mm); });
      stats.boot = { ms: +(performance.now() - t0).toFixed(1), draws: stats.draws - d0 };
      return stats.boot;
    },
    warmStats() { return { ...stats }; },
    /** true when every material under obj was warmed (compiled + drawn) */
    isWarm(obj) { return !needsWarm(obj); },
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
