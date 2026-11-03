// Post-game 정령 시련 (DESIGN §5.1 / stage 'done'): replay the mid-bosses (hydra, Nox, the treant, Kalis) at +30 % HP
// for quest XP, so the finale + post-game reach level 30 as designed. Each freed spirit's arena offers its trial
// (F at the arena rim). First clear pays the full reward, repeats 35 %. Owned by story; state lives in S.flags.trials.
import * as THREE from 'three';

export const TRIALS = {
  hydra: { nameKo: '물의 시련', bossKo: '삼두 물뱀 레비아탄', spirit: 'water', xp: 3200 },
  nox: { nameKo: '그림자의 시련', bossKo: '녹스', spirit: 'shadow', xp: 3600 },
  treant: { nameKo: '자연의 시련', bossKo: '모르그로스', spirit: 'nature', xp: 4200 },
  kalis: { nameKo: '빛의 시련', bossKo: '칼리스', spirit: 'light', xp: 5200 },
};
export const TRIAL_KO = {
  label: (T) => `정령 시련 — ${T.nameKo}: ${T.bossKo} (강화)`,
  start: (T) => `${T.nameKo} 시작! 정령의 힘으로 되살아난 ${T.bossKo}를 쓰러뜨리세요.`,
  clear: (T, xp) => `${T.nameKo} 완료! +${xp} 경험치`,
  busy: '다른 수호자가 이미 깨어 있습니다.',
  tip: '정령 시련이 열렸습니다 — 해방한 정령의 결투장에서 F를 눌러 강화된 수호자에게 다시 도전하세요.',
};
const HP_MUL = 1.3, REPEAT = 0.35;

export function createTrials(game, { S, P, toast, isDone }) {
  const active = { id: null };
  const _v = new THREE.Vector3();
  const store = () => (S.flags.trials && typeof S.flags.trials === 'object' ? S.flags.trials : (S.flags.trials = {}));
  const arenaOf = (id) => game.world?.bossArenas?.[id] || null;
  function rimPos(id) {
    const A = arenaOf(id); if (!A?.position) return null;
    // the rim point facing the map centre (the side players walk in from)
    let dx = -A.position.x, dz = -A.position.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const r = (A.radius || 16) + 3;
    _v.set(A.position.x + dx * r, 0, A.position.z + dz * r);
    _v.y = game.world?.getHeight?.(_v.x, _v.z) ?? A.position.y;
    return _v;
  }
  function liveBoss() { const b = game.enemies?.boss; return b && b.alive !== false && !b.defeated ? b : null; }
  function start(id) {
    const T = TRIALS[id]; if (!T) return false;
    if (liveBoss()) { toast?.(TRIAL_KO.busy); return true; }
    active.id = id;
    game.bossTrialHpMul = HP_MUL;
    let r = null;
    try { r = game.enemies?.spawnBoss?.(id); } catch (err) { console.warn('[trials] spawnBoss', id, err); }
    const clear = () => { game.bossTrialHpMul = 1; };
    if (r && typeof r.then === 'function') r.then(clear, clear); else clear();
    toast?.(TRIAL_KO.start(T));
    try { game.events.emit('trialStart', { id, nameKo: T.nameKo }); } catch (_) { /* */ }
    return true;
  }
  /** Returns true when the defeat was a trial boss (the story stage machine must then ignore it). */
  function onBossDefeated(id) {
    if (!id || active.id !== id) return false;
    const T = TRIALS[id]; active.id = null;
    const st = store(); const n = (st[id] || 0);
    const xp = Math.round(T.xp * (n === 0 ? 1 : REPEAT));
    st[id] = n + 1; S.markDirty?.();
    try { P()?.addXp?.(xp, { kind: 'quest', id: 'trial:' + id }); } catch (_) { /* */ }
    toast?.(TRIAL_KO.clear(T, xp));
    try { game.events.emit('trialComplete', { id, xp, count: n + 1 }); } catch (_) { /* */ }
    return true;
  }
  let registered = false, tipped = false;
  function register() {
    const I = game.interact; if (!I?.offer || registered) return registered;
    for (const id in TRIALS) {
      const T = TRIALS[id];
      I.offer('trial:' + id, {
        pos: () => rimPos(id), r: 5, label: TRIAL_KO.label(T), priority: 1,
        enabled: () => isDone() && !liveBoss() && game.state === 'playing',
        onUse: () => start(id),
      });
    }
    registered = true;
    return true;
  }
  return {
    TRIALS, register, start, onBossDefeated, get active() { return active.id; },
    /** Once, when the post-game opens. */
    announce() { if (tipped) return; tipped = true; toast?.(TRIAL_KO.tip); },
    cleared: () => ({ ...store() }),
  };
}
