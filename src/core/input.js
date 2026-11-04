import { KEYS } from './keymap.js';

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
    this._locks = new Set();
    const self = this;
    this.raw = {
      down: (c) => self.keys.has(c), pressed: (c) => self.keysPressed.has(c), released: (c) => self.keysReleased.has(c),
      mouseDown: (b) => self.buttons.has(b), mousePressed: (b) => self.btnPressed.has(b), mouseReleased: (b) => self.btnReleased.has(b),
      get mouseDX() { return self._rdx; }, get mouseDY() { return self._rdy; }, get wheel() { return self._rwheel; },
    };
    this._rdx = 0; this._rdy = 0; this._rwheel = 0;

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
      if (e.button >= 3) e.preventDefault();   // Mouse3/Mouse4 (back/forward) are bindable (dodgeAlt): never navigate
      if (!this.buttons.has(e.button)) this.btnPressed.add(e.button);
      this.buttons.add(e.button);
    });
    addEventListener('mouseup', (e) => {
      if (e.button >= 3) e.preventDefault();
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
    this._rdx = this._dx; this._rdy = this._dy; this._rwheel = this._wheel;
    const L = this.gameLocked;
    this.mouseDX = L ? 0 : this._dx; this.mouseDY = L ? 0 : this._dy; this.wheel = L ? 0 : this._wheel;
    this._dx = 0; this._dy = 0; this._wheel = 0;
  }
  endFrame() {
    this.keysPressed.clear(); this.keysReleased.clear();
    this.btnPressed.clear(); this.btnReleased.clear();
  }
  // Gameplay queries. While gameplay input is locked (cutscenes, dialogue, menus) they all report nothing.
  // UI / cinematic / story code that must still read keys uses input.raw.* instead.
  down(c) { return !this.gameLocked && this.keys.has(c); }
  pressed(c) { return !this.gameLocked && this.keysPressed.has(c); }
  released(c) { return !this.gameLocked && this.keysReleased.has(c); }
  mouseDown(b) { return !this.gameLocked && this.buttons.has(b); }
  mousePressed(b) { return !this.gameLocked && this.btnPressed.has(b); }
  mouseReleased(b) { return !this.gameLocked && this.btnReleased.has(b); }

  // Key-map actions (CONTRACT §6): name from KEYS (e.g. 'ult' → KeyX, 'basic' → Mouse0). Gameplay-locked like the raw queries.
  _act(name, keyFn, btnFn) {
    const code = KEYS[name] || name;
    if (code.startsWith('Mouse')) return btnFn.call(this, +code.slice(5));
    return keyFn.call(this, code);
  }
  actionDown(name) { return this._act(name, this.down, this.mouseDown); }
  actionPressed(name) { return this._act(name, this.pressed, this.mousePressed); }
  actionReleased(name) { return this._act(name, this.released, this.mouseReleased); }

  /** Lock gameplay input under a reason key (e.g. 'cinematic', 'dialogue'); unlock with the same key. */
  lock(reason = 'default') { this._locks.add(reason); }
  unlock(reason = 'default') { this._locks.delete(reason); }
  isLocked(reason) { return reason ? this._locks.has(reason) : this._locks.size > 0; }
  get gameLocked() { return this._locks.size > 0; }
}
