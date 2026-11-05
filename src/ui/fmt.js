// §6.11 templated, class-aware copy: ui.fmtKo(text, ctx). Tokens come from game.input.keymap.label (rebinding-safe),
// the current kit names (player.getDefenseHud) and live values ({punishSec}). The can-parry rule lives here.
import { fmtKo, KEY_TOKENS, PARRY_TYPES } from './text.js';

export function createFmt(game) {
  const ctx = {};
  let warned = false;
  function fill() {
    const km = game.input?.keymap;
    for (const tok in KEY_TOKENS) {
      let v = '';
      try { v = km?.label?.(KEY_TOKENS[tok]) || ''; } catch (_) { v = ''; }
      if (!v && !warned) { warned = true; console.warn('[ui] keymap.label missing; key tokens fall back'); }
      ctx[tok] = v || FALLBACK[tok];
    }
    let d = null;
    try { d = game.player?.getDefenseHud?.() || null; } catch (_) { d = null; }
    ctx.dodgeName = d?.dodgeName || '회피';
    ctx.defendName = d?.defendName || '방어';
    ctx.punishSec = '';
    return ctx;
  }
  const FALLBACK = { dodgeKey: 'Q', defendKey: 'E', jumpKey: '스페이스바', sprintKey: 'Shift', interactKey: 'F', skillsKey: 'K', codexKey: 'Tab', confirmKey: 'Enter' };
  /** punish seconds from live values: attack.punishDur × e.timeMul ÷ assist.enemySpeed (§6.11). */
  function punishSec(attack, e) {
    const d = +attack?.punishDur || 0; if (!(d > 0)) return '';
    const sp = +game.assist?.enemySpeed || 1;
    return (d * (+e?.timeMul || 1) / sp).toFixed(1);
  }
  function canParry() {
    const def = game.player?.kit?.defend;
    if (!def) return true;
    if (!PARRY_TYPES.includes(def.type)) return false;
    const win = def.type === 'counter' ? +def.window || 0 : +def.perfect || 0;
    return win > 0;
  }
  function fmt(text, extra) {
    fill();
    if (extra) for (const k in extra) ctx[k] = extra[k];
    return fmtKo(text, ctx);
  }
  return { fmt, canParry, punishSec, ctx: fill };
}
