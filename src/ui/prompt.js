// Interact prompt (CONTRACT §3.3 / §18): renders game.interact.current() on interactChanged — one prompt at a time,
// "[F] 정령의 문", "[F] 대화". Hidden outside free gameplay (menus, dialogue, cinematics).
import { h, esc } from './dom.js';

export function createPrompt(game, ui, parent) {
  const root = parent.appendChild(h('div', 'aw-iprompt', '<kbd>F</kbd><span></span>'));
  const label = root.querySelector('span');
  let cur = null, shown = null, text = '';
  function set(p) {
    cur = p && p.label ? p : null;
    const t = cur ? cur.label : '';
    if (t !== text) { text = t; label.innerHTML = esc(t); if (t) ui.anim?.(root, 'pop'); }
  }
  game.events.on('interactChanged', (p) => set(p));
  try { set(game.interact?.current?.() || null); } catch (_) { /* */ }
  return {
    el: root,
    get label() { return text; },
    get visible() { return !!shown; },
    update() {
      const ok = !!cur && game.state === 'playing' && !game.cinematic?.active && !ui.anyModalOpen?.();
      if (ok !== shown) { shown = ok; root.classList.toggle('show', ok); }
    },
    refresh() { try { set(game.interact?.current?.() || null); } catch (_) { /* */ } },
  };
}
