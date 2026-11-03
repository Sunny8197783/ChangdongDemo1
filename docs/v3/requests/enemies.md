# Requests from enemies

## narrative (story / cinematic / audio)
- Story: call `await enemies.prewarmBoss(id)` behind your boss-intro fade, then `enemies.spawnBoss(id)` (returns the entity when
  prewarmed; otherwise a Promise of it). Filter `bossSpawn` / `bossDefeated` by `id`. Nox's purify and Kalis's revive are inside the
  boss; `bossDefeated` arrives only once, at the true end. Nidhoggra emits `bossDefeated {final:true}` from the `playFinale(onDone)`
  callback (25 s game-time safety net if `onDone` never fires).
- `story.regionOrder` should be a readable array (`['mirwen'|'elderwood', …]`) — `enemies.scaling` uses it for the Act 2 / Act 3 rows.
- Cinematic: `playPhase(id, phase, onDone)` is called on every boss phase change outside test mode (the boss stays invulnerable until
  `onDone`, or its own transition timer if you never call back). Optional `cinematic.subtitle(text, seconds)` is used for
  Nox's 정화 line and Kalis's 「거울은 깨지지 않는다」 — please expose it (or tell us the right call).
- Audio (all optional, silently skipped when missing): `wolf_howl`, `splash`, `throw`, `swing`, `boss_roar`, `shatter`,
  `explode_fire`, `impact_lightning`, `cast_shadow`, `charge`, `blink`, `steam`, `parry`; listen to `bossCheck`, `lockStripped`,
  `giftUsed`, `bossSummon`, `encounterCleared`, `enemyPoiseBreak`, `shardBuff` for cues.

## ui
- Boss bar: `bossSpawn.parts` lists the hydra heads, treant plates + heart, nidhoggra shards + heart; part entities are
  `boss.getPart(id)` (`hp`, `maxHp`, `alive`, `lock:{element, gauge}`, `shield:{element}`). The nidhoggra head plate (`headPlate`)
  is not in `parts` (its lock is shown best as the current lock icon: `boss.plate.lock.element` / `gauge` 0–100).
- Optional HUD for `enemies.bosses.gift` (`ready`, `charges`, `element`, `purpose` 'lock' | 'spear') on V, and `shardBuff {element, nameKo}`.
- Elites set `isElite` and `weakness` (element ids).

## skills
- V → `enemies.bosses.gift.use()` (returns false when not ready). Taunts: `enemies.setTauntTarget(entity, seconds, range?)`;
  stealth: `enemies.setPlayerStealth(mul | true | false, seconds)`.

## combat
- None blocking. Bosses use `onBeforeDamage → {mul}` for guard stances (voidknight, Kalis): this emits `blocked` with the enemy as
  `target`; please keep player-only reactions to `blocked` filtered on `target === player.entity`.

## world
- None blocking (uses `bossArenas.*`, `surface.freezeWater`, `waterFrozen`, `projectileBlockAt`, `setBossFightLOD`).
