// Class & path progression. game.progression.
//   cls:  null | 'mage' | 'sword'
//   path: null | 'all' (원소의 방랑자: all 5 elements, no awakening/finisher/support)
//              | 'master' (원소의 대가: one element only, awakened ultimate + cinematic finisher + support skill)
//   element: master element (null for 'all')
// Awakening gauge (master only): 0..100, filled by dealing damage; full → finisher (KeyR) usable.
import { ELEMENTS } from './utils.js';

export function createProgression(game) {
  const P = {
    cls: null, path: null, element: null,
    awakening: 0,
    chosen: false,

    choose(cls, path, element = null) {
      P.cls = cls; P.path = path; P.element = path === 'master' ? (element || 'fire') : null;
      P.chosen = true; P.awakening = 0;
      game.events.emit('pathChosen', { cls: P.cls, path: P.path, element: P.element });
    },
    reset() { P.cls = null; P.path = null; P.element = null; P.chosen = false; P.awakening = 0; },

    isMaster() { return P.path === 'master'; },
    unlockedElements() {
      if (!P.chosen) return [];
      return P.path === 'master' ? [P.element] : ELEMENTS.slice();
    },
    isElementUnlocked(el) { return P.unlockedElements().includes(el); },
    hasAwakenedUltimate() { return P.path === 'master'; },
    hasFinisher() { return P.path === 'master'; },
    hasSupport() { return P.path === 'master'; },
    /** Damage multiplier for the player's outgoing damage of element el. Masters hit harder with their element. */
    damageMul(el) { return P.path === 'master' && el === P.element ? 1.25 : 1; },

    addAwakening(n) {
      if (!P.hasFinisher() || n <= 0) return;
      const was = P.awakening;
      P.awakening = Math.min(100, P.awakening + n);
      if (P.awakening !== was) game.events.emit('awakeningChanged', { value: P.awakening });
      if (was < 100 && P.awakening >= 100) game.events.emit('awakeningReady', {});
    },
    canFinisher() { return P.hasFinisher() && P.awakening >= 100; },
    consumeAwakening() {
      if (!P.canFinisher()) return false;
      P.awakening = 0; game.events.emit('awakeningChanged', { value: 0 });
      return true;
    },
  };
  return P;
}
