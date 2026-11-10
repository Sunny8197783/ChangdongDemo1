// §6.2 action-gated hints: ONE slot (top-left under the compass), a queue, ≤ maxShows (2) per id per save (save section
// 'hints'), dismissed by doing the action (`until` events / `done` predicate) or after `dur` seconds. Never during
// cinematics/dialogue; during boss fights only the combat-teaching ids (BOSS_HINTS). Off with settings.hints = false.
import { h } from './dom.js';
import { HINTS_KO, BOSS_HINTS } from './text.js';

const GAP = 0.6, POLL = 0.25;

// Menu/progression hints never sit on screen during a fight: while any enemy is aggroed they wait in the queue
// (a visible one is put back, its show not counted) and come back once the fight is over.
const CALM = ['unspent', 'equip', 'codex', 'legend', 'move_sprint'];

export function createHints(game, { parent, fmt, canParry, anim, treeOpen = () => false }) {
  const ev = game.events;
  const el = parent.appendChild(h('div', 'aw-hint4', '<i class="aw-hint4-ico">?</i><span></span>'));
  const txt = el.querySelector('span');
  let shows = {}, flags = {};
  try { game.save?.section?.('hints', { serialize: () => ({ shows: { ...shows }, flags: { ...flags } }), load: (d) => { shows = { ...(d?.shows || {}) }; flags = { ...(d?.flags || {}) }; } }); }
  catch (err) { console.warn('[ui] save.section(hints) unavailable', err?.message); }

  const queue = [];
  let cur = null, curT = 0, gap = 0, pollT = 0;
  const listened = new Set();

  const enabled = () => game.settings?.values?.hints !== false;
  const blockedNow = () => !!game.cinematic?.active || game.state === 'dialogue' || game.state === 'cutscene' || game.state === 'title';
  const bossFight = () => { const b = game.enemies?.boss; return !!(b && b.alive !== false && !b.defeated && !b.dying); };
  const aggroed = () => (game.enemies?.aggroCount?.() || 0) > 0;
  const allowed = (q) => !(bossFight() && !q.opts.boss && !BOSS_HINTS.includes(q.id)) && !(CALM.includes(q.id) && aggroed());

  function listen(name) {
    if (listened.has(name)) return;
    listened.add(name);
    ev.on(name, (p) => {
      if (cur && cur.until && cur.until.includes(name) && (!cur.opts.match || safe(cur.opts.match, p))) dismiss();
      // a queued hint whose action already happened is dropped
      for (let i = queue.length - 1; i >= 0; i--) { const q = queue[i]; if (q.until && q.until.includes(name) && q.opts.dropOnDone && (!q.opts.match || safe(q.opts.match, p))) queue.splice(i, 1); }
    });
  }
  const safe = (f, p) => { try { return !!f(p); } catch (_) { return false; } };

  function hint(id, textKo, opts = {}) {
    if (!id) return false;
    if (!enabled()) return false;
    const max = opts.maxShows ?? 2;
    if ((shows[id] || 0) >= max) return false;
    if ((cur && cur.id === id) || queue.some((q) => q.id === id)) return false;
    const until = opts.until == null ? null : [].concat(opts.until);
    if (until) for (const n of until) listen(n);
    if (queue.length >= 6) queue.shift();
    queue.push({ id, text: textKo ?? HINTS_KO[id] ?? '', opts, until, t: 0 });
    pump();
    return true;
  }
  function pump() {
    if (cur || gap > 0 || !queue.length || blockedNow()) return;
    for (let i = 0; i < queue.length; i++) {
      const q = queue[i];
      if (!allowed(q)) continue;
      queue.splice(i, 1);
      show(q); return;
    }
  }
  function show(q) {
    cur = q; curT = q.opts.dur ?? 14;
    shows[q.id] = (shows[q.id] || 0) + 1;
    txt.textContent = fmt(q.text);
    el.dataset.id = q.id;
    anim(el, 'show');
    try { ev.emit('hintShown', { id: q.id }); } catch (_) { /* */ }
  }
  function dismiss() {
    if (!cur) return;
    cur = null; gap = GAP;
    el.classList.remove('show'); el.dataset.id = '';
  }
  /** Mark an action done (dismisses that hint if visible and drops it from the queue). */
  function done(id) {
    if (cur && cur.id === id) dismiss();
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].id === id) queue.splice(i, 1);
  }

  function update(dt) {
    if (gap > 0) gap -= dt;
    if (cur) {
      curT -= dt;
      if (CALM.includes(cur.id) && aggroed() && curT > 2) { const q = cur; shows[q.id] = Math.max(0, (shows[q.id] || 1) - 1); dismiss(); q.t = 0; queue.unshift(q); }
      else if (curT <= 0 || !enabled() || blockedNow() || (!allowed(cur) && !cur.opts.boss)) dismiss();
      else if ((pollT -= dt) <= 0) { pollT = POLL; if (cur.opts.done && safe(cur.opts.done)) dismiss(); }
    }
    if (!cur) pump();
  }

  // ------------------------------------------------------------------ catalogue triggers (§6.2)
  const H = HINTS_KO;
  const DODGE_EVS = ['dodge', 'dash', 'blink', 'perfectDodge', 'playerHurt', 'tellEnd'];
  ev.on('tellFirst', (p) => {
    const k = p?.tell;
    if (k === 'danger') hint('tell_danger', H.tell_danger, { until: DODGE_EVS, boss: true });
    else if (k === 'parry') hint('tell_parry', canParry() ? H.tell_parry : H.tell_parry_b, { until: ['parry', 'blocked', ...DODGE_EVS], boss: true });
    else if (k === 'unblockable') hint('tell_unblockable', H.tell_unblockable, { until: 'tellEnd', boss: true });
    else if (k === 'jump') hint('tell_jump', H.tell_jump, { until: 'tellEnd', boss: true });
    else if (k === 'projectile') hint('projectile', canParry() ? H.projectile : H.projectile_b, { until: 'tellEnd', dur: 7, boss: true });
  });
  let punished = false;
  ev.on('punishWindow', (p) => {
    if (punished) return; punished = true;
    const en = p?.enemy;
    hint('punish', H.punish, { until: 'damage', match: (d) => !en || d?.target === en, dur: 6, boss: true });
  });
  let weakDone = false, guardDone = false;
  ev.on('damage', (p) => {
    if (!p || p.isPlayer || p.target?.team === 'player') return;
    const t = p.target;
    if (!weakDone && t && !t.isDummy && t.weakness?.length) { weakDone = true; hint('weakness', H.weakness, { dur: 8 }); }
    if (!guardDone && (p.guarded || p.deflected || p.frontGuard)) {
      guardDone = true;
      hint('front_guard', H.front_guard, { until: 'damage', match: (d) => d?.target === t && (d.back || d.backstab || (d.mul ?? 1) > 1), dur: 8 });
    }
  });
  let hazardDone = false;
  ev.on('playerHurt', (p) => {
    if (hazardDone || !(p?.attackKind === 'hazard' || p?.attackKind === 'surface')) return;
    hazardDone = true;
    hint('hazard', H.hazard, { dur: 6, boss: true, done: () => game.realTime - (lastHazardT || 0) > 1.5 });
  });
  let lastHazardT = 0;
  ev.on('playerHurt', (p) => { if (p?.attackKind === 'hazard' || p?.attackKind === 'surface') lastHazardT = game.realTime || 0; });
  ev.on('levelUp', () => { if ((game.progression?.points || 0) > 0) hint('unspent', H.unspent, { until: 'skillLearned' }); });
  let equipDone = false;
  // the equip hint is about the skill screen's slot bar: only shown while that screen is open, gone when it closes
  // (skills learned elsewhere, e.g. 자동 배분, are auto-equipped and need no hint)
  ev.on('skillLearned', () => {
    if (equipDone || !treeOpen()) return;
    equipDone = true; hint('equip', H.equip, { until: 'loadoutChanged', dropOnDone: true, done: () => !treeOpen() });
  });
  let legendDone = false;
  const legend = () => { if (legendDone) return; legendDone = true; hint('legend', H.legend, { until: 'guideOpened', dur: 10 }); };
  ev.on('playerDeath', legend);
  ev.on('stateChange', (p) => { if (p?.state === 'paused') legend(); });

  // polled triggers: move_sprint (20 m without sprint) and mp_low (MP < 15 % in combat)
  let walked = 0, sprintSeen = false, mpShown = false, lpx = NaN, lpz = 0, triggerT = 0;
  function poll(dt) {
    if ((triggerT -= dt) > 0) return;
    triggerT = POLL;
    if (game.state !== 'playing') return;
    const P = game.player, pp = P?.object?.position;
    if (!pp) return;
    const sprinting = !!(game.input?.keymap?.down?.('sprint') || P.sprinting);
    if (sprinting) { if (!sprintSeen) { sprintSeen = true; done('move_sprint'); } }
    else if (!sprintSeen && game.progression?.chosen !== false) {
      if (lpx === lpx) walked += Math.hypot(pp.x - lpx, pp.z - lpz);
      if (walked >= 20) { walked = -1e9; hint('move_sprint', H.move_sprint, { done: () => sprintSeen }); }
    }
    lpx = pp.x; lpz = pp.z;
    const mx = +P.maxMp || 0;
    if (!mpShown && mx > 0 && (P.resource ?? 'mp') === 'mp' && P.mp / mx < 0.15 && (game.enemies?.aggroCount?.() || 0) > 0) {
      mpShown = true;
      hint('mp_low', H.mp_low_b, { done: () => (+game.player?.mp || 0) / mx > 0.4 });
    }
  }

  return {
    hint, done, update(dt) { poll(dt); update(dt); },
    visible: () => (cur ? cur.id : null),
    shows: (id) => shows[id] || 0,
    flag(k, v) { if (v !== undefined) flags[k] = v; return flags[k]; },
    queued: () => queue.length,
    reset() { shows = {}; flags = {}; queue.length = 0; dismiss(); gap = 0; punished = weakDone = guardDone = hazardDone = equipDone = legendDone = mpShown = sprintSeen = false; walked = 0; },
    el,
  };
}
