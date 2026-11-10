// Small DOM helpers shared by src/ui.js and src/ui/* (built-once DOM, no per-frame layout reads).

export function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
export const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Wraps key names in keycap spans (v3 key map: K, C, Z, X, V, 1~4 …; F = 상호작용). */
export function formatKeys(text) {
  return esc(text)
    .replace(/\b(WASD|Shift|Space|Tab|Esc|LMB|RMB|Q|E|F|R|G|M|K|C|Z|X|V|1~4|1~5)\b/g, '<kbd>$1</kbd>')
    .replace(/(좌클릭|우클릭|휠)/g, '<kbd>$1</kbd>');
}

export const fmtNum = (n) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());
export const pct = (f) => Math.round(f * 100);

/** Animation restart queue: remove the class now, re-add it ≥ 2 frames later (no forced reflow). */
export function createAnimQueue() {
  const aqNode = [], aqCls = [], aqF = [];
  let frameNo = 0;
  return {
    restart(node, cls) {
      if (!node) return;
      node.classList.remove(cls);
      for (let i = 0; i < aqNode.length; i++) if (aqNode[i] === node && aqCls[i] === cls) { aqF[i] = frameNo; return; }
      aqNode.push(node); aqCls.push(cls); aqF.push(frameNo);
    },
    /** Drop a pending re-add and remove the class now (a node hidden within 2 frames of restart() stays hidden). */
    cancel(node, cls) {
      if (!node) return;
      node.classList.remove(cls);
      for (let i = aqNode.length - 1; i >= 0; i--) if (aqNode[i] === node && aqCls[i] === cls) { aqNode.splice(i, 1); aqCls.splice(i, 1); aqF.splice(i, 1); }
    },
    tick() {
      frameNo++;
      for (let i = aqNode.length - 1; i >= 0; i--) {
        if (frameNo - aqF[i] < 2) continue;
        aqNode[i].classList.add(aqCls[i]);
        aqNode.splice(i, 1); aqCls.splice(i, 1); aqF.splice(i, 1);
      }
    },
    get pending() { return aqNode.length; },
  };
}
