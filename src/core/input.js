export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.keysPressed = new Set();
    this.keysReleased = new Set();
    this.buttons = new Set();
    this.btnPressed = new Set();
    this.btnReleased = new Set();
    this.mouseDX = 0; this.mouseDY = 0; this.wheel = 0;
    this._dx = 0; this._dy = 0; this._wheel = 0;
    this.locked = false;
    this.sim = null;

    addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (!this.keys.has(e.code)) this.keysPressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.keysReleased.add(e.code);
    });
    addEventListener('blur', () => {
      for (const k of this.keys) this.keysReleased.add(k);
      for (const b of this.buttons) this.btnReleased.add(b);
      this.keys.clear(); this.buttons.clear();
    });
    addEventListener('mousedown', (e) => {
      if (!this.buttons.has(e.button)) this.btnPressed.add(e.button);
      this.buttons.add(e.button);
    });
    addEventListener('mouseup', (e) => {
      this.buttons.delete(e.button);
      this.btnReleased.add(e.button);
    });
    addEventListener('mousemove', (e) => {
      if (this.locked || this.sim) { this._dx += e.movementX || 0; this._dy += e.movementY || 0; }
    });
    addEventListener('wheel', (e) => { this._wheel += e.deltaY; }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* ignore */ }
  }
  exitLock() { try { document.exitPointerLock?.(); } catch (_) {} }

  /** Test hook: hold simulated inputs. {keys:{KeyW:true}, mouse:{0:true}, dx, dy, wheel} */
  simulate(s) {
    const prevKeys = this.sim?.keys || {}, prevMouse = this.sim?.mouse || {};
    const keys = s?.keys || {}, mouse = s?.mouse || {};
    for (const k of Object.keys(keys)) if (keys[k] && !prevKeys[k]) { this.keysPressed.add(k); this.keys.add(k); }
    for (const k of Object.keys(prevKeys)) if (prevKeys[k] && !keys[k]) { this.keys.delete(k); this.keysReleased.add(k); }
    for (const b of Object.keys(mouse)) if (mouse[b] && !prevMouse[b]) { this.btnPressed.add(+b); this.buttons.add(+b); }
    for (const b of Object.keys(prevMouse)) if (prevMouse[b] && !mouse[b]) { this.buttons.delete(+b); this.btnReleased.add(+b); }
    this._dx += s?.dx || 0; this._dy += s?.dy || 0; this._wheel += s?.wheel || 0;
    this.sim = s ? { keys: { ...keys }, mouse: { ...mouse } } : null;
  }

  update() {
    this.mouseDX = this._dx; this.mouseDY = this._dy; this.wheel = this._wheel;
    this._dx = 0; this._dy = 0; this._wheel = 0;
  }
  endFrame() {
    this.keysPressed.clear(); this.keysReleased.clear();
    this.btnPressed.clear(); this.btnReleased.clear();
  }
  down(c) { return this.keys.has(c); }
  pressed(c) { return this.keysPressed.has(c); }
  released(c) { return this.keysReleased.has(c); }
  mouseDown(b) { return this.buttons.has(b); }
  mousePressed(b) { return this.btnPressed.has(b); }
  mouseReleased(b) { return this.btnReleased.has(b); }
}
