// Class choice "여섯 갈래의 길" (CONTRACT §17, DESIGN §5.6): ui.openClassPanel with a 6-option dialogue fallback,
// the pick itself (progression.setClass → player.setClass → cinematic.playClassRite), and 직업 변경 at the altar.
import { CLASS_DEFS, CLASS_IDS } from '../core/classes.js';
import { elName } from '../core/elements.js';

/** Dialogue `ask` options for the fallback picker (one per class, from CLASS_DEFS). */
export function classAskOptions(onPick, later) {
  const opts = CLASS_IDS.map((cls) => {
    const c = CLASS_DEFS[cls];
    const els = [...c.primary.map((e) => `{${elName(e)}}`), ...c.secondary.map(elName)].join(' · ');
    return {
      t: `${c.nameKo} — ${c.title || ''}`.trim(),
      desc: `${c.fantasyKo || ''} 무기: ${c.weaponKo || c.weapon} · 특징: ${c.signatureKo || c.signature} · 원소: ${els}`,
      go: () => { onPick(cls); },
    };
  });
  if (later) opts.push(later);
  return opts;
}

/**
 * Open the class choice. Uses ui.openClassPanel when ui is present; otherwise returns false so the caller can
 * show the dialogue fallback (classAskOptions).
 */
export function openClassPanel(game, { onPick, onCancel, current } = {}) {
  const ui = game.ui;
  if (!ui || ui.isStub || typeof ui.openClassPanel !== 'function') return false;
  try { return ui.openClassPanel({ onPick, onCancel, current }) !== false; } catch (err) { console.warn('[story] openClassPanel', err); return false; }
}

/** Apply a class pick: progression + player (+ the class rite when `rite`). onDone after the rite. */
export function applyClass(game, cls, onDone, { rite = true } = {}) {
  if (!CLASS_DEFS[cls]) cls = CLASS_IDS[0];
  const P = game.progression;
  try { P?.setClass?.(cls); } catch (err) { console.error('[story] setClass', err); }
  try { if (game.player?.cls !== cls) game.player?.setClass?.(cls); } catch (err) { console.warn('[story] player.setClass', err); }
  const done = () => { try { onDone?.(cls); } catch (err) { console.error('[story] class onDone', err); } };
  const C = game.cinematic;
  if (rite && C?.playClassRite) {
    try { C.playClassRite(cls, done); return; } catch (err) { console.warn('[story] playClassRite', err); }
  }
  done();
}

/** 직업 변경 at the altar (DESIGN §5.5): ui.confirm → progression.changeClass. */
export function changeClassAtAltar(game, to) {
  const P = game.progression;
  if (!P?.changeClass || !CLASS_DEFS[to] || to === P.cls) return false;
  const ok = P.canChangeClass?.();
  if (ok && !ok.ok) { try { game.ui?.toast?.(ok.reason === 'boss' ? '전투 중에는 직업을 바꿀 수 없습니다' : '원소의 제단에서만 직업을 바꿀 수 있습니다'); } catch (_) { /* */ } return false; }
  const go = () => { if (P.changeClass(to)) { try { if (game.player?.cls !== to) game.player?.setClass?.(to); } catch (_) { /* */ } } };
  const text = `${CLASS_DEFS[to].nameKo}(으)로 직업을 바꾸시겠습니까? 레벨과 경험치는 유지되고, 스킬 트리는 초기화됩니다.`;
  if (game.ui?.confirm) { try { game.ui.confirm(text, go); return true; } catch (_) { /* */ } }
  go(); return true;
}

/** The mentor npc id of a class. */
export const mentorOf = (cls) => CLASS_DEFS[cls]?.mentor || 'mageMentor';
/** Class of a mentor npc id (or null). */
export function classOfMentor(id) { for (const c of CLASS_IDS) if (CLASS_DEFS[c].mentor === id) return c; return null; }
export const MENTOR_IDS = CLASS_IDS.map((c) => CLASS_DEFS[c].mentor);
