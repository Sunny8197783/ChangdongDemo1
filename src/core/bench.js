// 성능 테스트 (PLAN v4 §2.8): game.quality.benchmark({seconds}) → Promise<BenchResult>. Owned by core.
//   Freezes input, teleports to the plains spot (−20, 45), spawns 8 training mobs when game.enemies.spawnBench? exists
//   (mobs provides it; else none), plays a scripted mage-like rotation through game.skills when present, orbits the
//   camera, then restores the game exactly (state, position, look, HP/MP/stamina, cooldowns, governor lock, bench mobs).
//   BenchResult = {avgFps, low1Fps, level, renderW, renderH, gpu, tier, cpuMs, gpuMs?, seconds, frames, cast, mobs}
//   Live mode (the rAF loop runs): measures real frames. Frozen mode (tests, game.freeze(true)): the benchmark drives
//   game.step(1, dt, true) itself from rAF, so it works under the harness too.
const SPOT = { x: -20, z: 45 };

export function installBench(game) {
  let running = null;
  const Q = game.quality;

  function snapshot() {
    const p = game.player, o = p?.object, e = p?.entity;
    return {
      state: game.state, frozen: !!game.frozen,
      pos: o ? o.position.clone() : null, rotY: o ? o.rotation.y : 0,
      yaw: p?.yaw ?? null, pitch: p?.pitch ?? null,
      hp: p?.hp, mp: p?.mp, stamina: p?.stamina, resolve: p?.resolve, ehp: e?.hp, inv: e?.invulnerable,
      vel: e?.velocity?.clone?.() || null,
      cd: game.skills?.cooldownSnapshot?.() || null,
      locked: Q.locked,
    };
  }
  function restore(S, mobs) {
    const p = game.player, o = p?.object, e = p?.entity;
    for (const m of mobs) {
      try {
        if (game.enemies?.despawnBench) continue;
        if (game.enemies?.remove) game.enemies.remove(m);
        else { m.alive = false; if (m.object) m.object.visible = false; game.combat?.unregister?.(m); }
      } catch (_) { /* */ }
    }
    try { game.enemies?.despawnBench?.(mobs); } catch (_) { /* */ }
    if (o && S.pos) { o.position.copy(S.pos); o.rotation.y = S.rotY; o.updateMatrixWorld?.(true); }
    if (p?.setLook && S.yaw != null) p.setLook(S.yaw, S.pitch);
    if (p) { p.hp = S.hp; p.mp = S.mp; p.stamina = S.stamina; if (S.resolve != null) p.resolve = S.resolve; }
    if (e) { e.hp = S.ehp; e.invulnerable = S.inv; if (S.vel && e.velocity) e.velocity.copy(S.vel); }
    try { game.skills?.cooldownRestore?.(S.cd); } catch (_) { /* */ }
    Q.lock(S.locked);
    game.input?.unlock?.('bench');
    if (game.state !== S.state) game.setState(S.state);
  }

  async function benchmark({ seconds = 20, rotate = true, mobs: nMobs = 8 } = {}) {
    if (running) return running;
    running = (async () => {
      const S = snapshot();
      const p = game.player, e = p?.entity, o = p?.object;
      const mobs = [];
      try {
        game.input?.lock?.('bench');
        Q.lock(true);                               // the governor keeps its level while measuring
        if (game.state !== 'playing') game.setState('playing');
        // teleport + invulnerable player
        if (o) {
          const W = game.world; const y = W?.getGroundHeight ? W.getGroundHeight(SPOT.x, SPOT.z) : (W?.getHeight ? W.getHeight(SPOT.x, SPOT.z) : 0);
          o.position.set(SPOT.x, (y || 0) + 0.05, SPOT.z); e?.velocity?.set?.(0, 0, 0);
        }
        if (e) e.invulnerable = true;
        try { const list = game.enemies?.spawnBench?.(nMobs); if (Array.isArray(list)) mobs.push(...list); } catch (_) { /* */ }
        // scripted rotation (mage-like cadence: a loadout skill every 0.5 s, the ultimate every 7 s)
        const SK = game.skills;
        const ids = SK ? ['q1', 'q2', 'q3', 'q4', 'charged'].map((s) => SK.skillForSlot?.(s) || SK.loadout?.[s]).filter(Boolean) : [];
        const ult = SK ? (SK.skillForSlot?.('ult') || SK.loadout?.ult) : null;
        let castT = 0.2, ultT = 3, k = 0, casts = 0;
        const dts = [], cpus = []; let gpuSum = 0, gpuN = 0;
        const yaw0 = p?.yaw ?? 0;
        const live = !game.frozen;
        const warm = 0.5;
        let t = 0, last = performance.now();
        await new Promise((resolve) => {
          const tick = () => {
            const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
            t += dt;
            // script
            if (rotate) {
              castT -= dt; ultT -= dt;
              if (castT <= 0 && ids.length) { castT += 0.5; try { SK.resetCooldowns?.(); game.debug?.cast?.(ids[k++ % ids.length], { charge: 1 }); casts++; } catch (_) { /* */ } }
              if (ultT <= 0 && ult) { ultT += 7; try { SK.resetCooldowns?.(); game.debug?.cast?.(ult); casts++; } catch (_) { /* */ } }
              if (p) { p.hp = p.maxHp ?? p.hp; p.mp = p.maxMp ?? p.mp; }
            }
            if (p?.setLook) p.setLook(yaw0 + t * 0.35, -0.18);   // slow orbit
            let cpu;
            if (!live) { const c0 = performance.now(); game.step(1, Math.max(1 / 240, dt), true); cpu = performance.now() - c0; }
            else cpu = game.lastFrameCpuMs ?? 0;
            if (t > warm) {
              dts.push(dt); cpus.push(cpu);
              const gms = Q.gpuTimer?.available ? Q.gpuTimer.poll() : -1;
              if (gms > 0) { gpuSum += gms; gpuN++; }
            }
            if (t < seconds + warm) requestAnimationFrame(tick); else resolve();
          };
          requestAnimationFrame(tick);
        });
        dts.sort((a, b) => a - b); cpus.sort((a, b) => a - b);
        const n = dts.length || 1;
        const avg = dts.reduce((a, b) => a + b, 0) / n;
        const p99 = dts[Math.min(dts.length - 1, Math.floor(dts.length * 0.99))] || avg;
        const rs = Q.renderSize();
        return {
          avgFps: +(1 / Math.max(1e-4, avg)).toFixed(1), low1Fps: +(1 / Math.max(1e-4, p99)).toFixed(1), level: Q.level,
          renderW: rs.w, renderH: rs.h, gpu: game.render?.rendererName || '', tier: game.render?.tier || 'unknown',
          cpuMs: +(cpus[cpus.length >> 1] || 0).toFixed(2), gpuMs: gpuN ? +(gpuSum / gpuN).toFixed(2) : null,
          seconds, frames: dts.length, cast: casts, mobs: mobs.length, mode: live ? 'live' : 'driven',
        };
      } finally {
        restore(S, mobs);
        running = null;
      }
    })();
    return running;
  }
  /** Plain-text result for the 복사 button (ux); the template lives in settings SETTINGS_TEXT_KO.benchLine (rule 6). */
  function format(r) {
    if (!r) return '';
    const T = game.settings?.TEXT_KO || {};
    const tpl = T.benchLine || '{avg} fps / {low} fps / L{level} / {w}x{h} / CPU {cpu} ms{gpuPart} / {gpu} ({tier})';
    return tpl.replace('{avg}', r.avgFps).replace('{low}', r.low1Fps).replace('{level}', r.level).replace('{w}', r.renderW).replace('{h}', r.renderH)
      .replace('{cpu}', r.cpuMs).replace('{gpuPart}', r.gpuMs != null ? ` · GPU ${r.gpuMs} ms` : '').replace('{gpu}', r.gpu).replace('{tier}', r.tier);
  }
  Q.benchmark = benchmark;
  Q.formatBench = format;
  return { benchmark, format };
}
