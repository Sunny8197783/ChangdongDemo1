# Requests from core (wave 0)

Core-provided APIs these requests rely on are documented in `docs/v3/notes/core.md`. Everything below is feature-detected by core,
so nothing crashes if it is missing; but without it the named check stays SKIPped or the named feature falls back.

## skills
- Do **not** set `node:<id>` stats sources: progression applies `node.mods(rank)` itself on every learn/unlearn/setRanks/respec/load.
  Talents (`talent:<id>`), `breadth`, `buff:<skillId>` and `rx:resonance` consumption stay yours.
- Mark the real module as not-stub (just don't set `isStub`); `game.activeSkills()` returns `game.skills` whenever `!game.skills.isStub`.
- `applyPreset(name)` must return `false` for an unknown preset (main.js warns on `skills=preset:<x>` failures) and should call `autoEquip`/apply the preset loadout itself.
- Implement `serialize()` / `deserialize(o)` (save.js calls them; `deserialize` drops unlearned skills from slots).
- `canEquip` reads `player.lastHurtT` / `player.inCombat()`; tools/playtest3/core.js sets `player.lastHurtT = -1e9` before equipping the L8 ultimate.
- Emit `treeClosed` when the skill tree closes **(ui)** — save.js autosaves on it.

## combat
- Expose `STATUS_DEFS` and/or `REACTION_DEFS` on `game.combat`: core's check 3 (damage formula) detects "combat v3" that way.
- `dealDamage` on the player with `source: 'debug'` (from `game.debug.hurt`): treat a non-object source as `zoneDmgMul = 1`.
- `hit.noCrit` must still force crit off (check 3 also sets a `test:nocrit` source with `critChance: -10`).
- `debugReact(id, target)` is called by `game.debug.react(id)`.
- vfx: optional `vfx.stats()` → `{particles, decals}` for `game.debug.drawStats()`.
- vfx.dissolve: use `dissolveUniforms(clone)` from `src/core/utils.js` after cloning (copy `onBeforeCompile` + `customProgramCacheKey` onto the clone, like vfx.js:252 does).

## player
- `player.regen` (reused object) for `debug.regenState()`; `player.lastHurtT`; `player.placeAt(pos)` (save load spawn) — save falls back to `placeInVillage()`.
- `player.timeComp()` may now read `game.timeScale.comp()` directly (the `_slowScale/_slowTime` getters remain for v2 code).
- Switch from `pathChosen` to `classChosen` (main.js still emits a deprecated `pathChosen` in v3 test mode as a bridge).

## enemies
- `anyAggroWithin(pos, r)` should count dummies with `debugAggro === true` (set by `game.debug.hurt(n, {combat:true})` and `PT.dummyRing(..., {aggro:true})`).
- `spawnBoss(id)` may return a Promise; main.js awaits it before `&phase=` is applied.
- `debugDefeat()` and `boss.debugPhase(n)` (or `enemies.debugPhase(n)`) are called by `game.debug.killBoss()` / `bossPhase(n)`.
- Set `xpValue` (0 for props/dummies) and `zoneLevel` (+ optional `zoneMin`) on entities; progression awards XP from `kill`.

## world
- `world.respecSpots` (altar first, then gates) and/or `world.altar`; progression uses them for `canRespecHere()` / `canChangeClass()` (8 m).
- `world.zones` (array or map with `center`/`position`) and `world.gates` for `game.debug.tp(id)`; optional `world.lastGateSpawn()` for save loads.
- `world.serialize()/deserialize()`.

## narrative (story / cinematic / audio)
- `story.serialize()/deserialize()` and optional `story.currentBossId()` (save load prewarm); the `questComplete` event triggers autosave.
- Award act-boss points through the `bossDefeated` event (progression listens) or `progression.addPoints(1, bossId)` — both are idempotent; do not mutate progression fields.
- Emit `shrineFound {id, kind}` from world/story; progression awards the point/XP.
- Remove the `pathChosen` dependency; listen to `classChosen`.

## ui
- Title: 이어하기 button when `game.save.has()` → `game.continueGame()`; 새 게임 → `game.newGame({ clearSave: true })`.
- Emit `treeClosed` when the tree closes and `altarLeave` when the altar/class menu closes (autosave triggers).
- The prompt widget listens to `interactChanged` / `game.interact.current()`.
- Settings rows: `difficulty` uses `game.settings.DIFFICULTY[id].nameKo`; `effectQuality` low/medium/high.

## integration (core, later)
- After all owners merge: drop the deprecated `pathChosen` bridge emit in `applyTestParams` once no listener needs it; apply the
  playtest2 `&cls=none` class-panel pick and the golem → reveal step (CONTRACT §21).
