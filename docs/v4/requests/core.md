# core — requests to other owners (v4)

## Since core-p0a (still open)

- **ux**: `settings.damageNumbers` is now `'all' | 'merged' | 'off'` (v3 booleans migrate; `set(k, false)` stores `'off'`). `src/ui.js:301` `numbersOn = () => … !== false` must become
  `!== 'off'` (and `'merged'` merges per §6.9). Build the settings menu from `game.settings.SETTING_DEFS` / `TEXT_KO` (Korean labels live there) and the difficulty cards from `DIFFICULTY_ORDER` + `nameKo`/`descKo`.
  Key labels for §6.11 tokens: `game.input.keymap.label(action)`.
- **mobs**: `PT.armor(e)` sets `e.ptArmor = true` (+ huge HP, no stagger/poise); please treat `e.ptArmor` as test-only super armour (no flinch/knockdown/despawn) so F-*/R-* keep attacking.
  `enemies/scaling.js` difficulty table: add the `story` row from `core/settings.js DIFFICULTY` (or read `game.difficulty`, which now has every §6.8 column; `telegraphMul` is fixed at 1).
- **bosses**: `kalis.js:207` may read `game.difficulty.checkAddSec ?? checkAdd` (both exist now; story = 6, easy = 4).
- **tells / mobs / bosses**: the core tells stub draws the fixed v3 decal through `vfx.telegraph` for every `attack()` with a `shape` (opt out with `spec.legacyDecal:false`); do not add a second fallback decal.
  `e.vulnerableUntil` and handle times are in `game.enemyTime` seconds; `e.hitstopUntil` is in `game.realTime` seconds.
- **world**: honour `game.render.pointLights` (false at low/medium) and the v4 preset keys in `game.settings.values` (`grassDensity 0.4`, `grassNearFade`, `grassReceiveShadow`, `treeDist`, `floraOutlineDist`, `shadowSize`)
  plus `game.quality.budget.{grassMul, floraMul, floraOutlineDist}`.
- **vfx**: caps/coverage come from `game.settings.values.{particleCap, additiveCap, coverageSoft, coverageHard, fxCalls, fxDetail}` × `game.quality.budget.{particleMul, coverageMul, flareMul, fxDetail, particleCap}`.

## New in wave B (core-b)

- **every playing module (player, magic `spells`, melee `sword`, mobs `enemies`, vfx `combat`, ux `story`/`cinematic`)** — sub-steps (§2.5): set `substeps: true` on
  your module object once your visual-only work (mixers, skinning poses, springs, cape, model `update`, VFX bookkeeping) runs only when `game.frame.lastStep` is true.
  A module **without** the flag is called once per frame on the last step with the whole frame dt (≤ 0.1 s; v3-compatible fallback: no slow motion, no doubled visual work).
  With the flag it is called `game.frame.n` (≤ 2) times with dt ≤ 1/20 (`realDt` argument = realDt / n). C3's CPU check (a 1/15 s frame ≤ 1.6 × a 1/60 step) holds only if flagged modules gate their visuals.
- **mobs, bosses** — per-entity hitstop (§2.5): skip an enemy's update (AI, animation, movement) while `game.isHitstopped(e)` (`e.hitstopUntil > game.realTime`). core no longer freezes the clock
  for ordinary hits; only tiers `ult` / `kill` and legacy calls without options freeze globally. (tells already extends the frozen enemy's TellHandles.)
- **player** — pause the player's animation while `game.realTime < game.playerHitstopUntil` (set by every granted per-entity hitstop whose target is not the player); input buffering keeps running.
- **vfx** (`feel.js`; `vfx-b` already does this): call `game.hitstop(sec, {tier, target})`. A call **without options** counts as a legacy v3 global freeze and is not budgeted.
  The 80 ms rolling budget is **per target**. Over-budget requests are dropped and logged with `reason:'budget'` in `game.debug.hitstopLog()`; records also carry a monotonic `seq`.
- **world** — `src/world.js:46` writes `game.bloomPass.threshold/strength/radius` (v3 values 0.9 / 0.45 / 0.55). core re-applies the §2.2 preset (threshold 1.0, strength 0.40, 3 mips) after every
  module `init()`, so please drop that line (it no longer has any effect). The shadows-off path no longer uses `sun.shadow.camera.layers` (your note): core renders one shadow pass with no casters
  (view camera on layer 31) and then stops updating the map. The view camera's layer 1 is untouched.
- **world** — boot warm-up (item 13, your request): after `compileAsync`, core now does one real draw of **every** object in the main scene (hidden ones included, culling off) into a 64×64 target,
  so hidden zone dressing uploads its geometry during the title. Later objects: `game.render.warm(obj, {target})` compiles *and* draws them once (hidden ones too).
- **mobmodels / tells** — `game.post.sceneRes` is now the **live render size** (the scene pass viewport, px), `game.post.uvScale` = viewport ÷ allocated target, `canvasRes` = drawing buffer.
  Screen-space shaders over the canvas sample the scene depth at `gl_FragCoord.xy / canvasRes × uvScale`; outline pixel widths should use `sceneRes`.
- **tells** — the canvas keeps its depth buffer. FinalPass4 draws with `depthTest:false, depthWrite:false` after `autoClear`, so the canvas depth is 1.0 when `preOverlay()` runs
  (your extra `clearDepth()` is harmless and can stay).
- **mobs** — benchmark (§2.8): `game.enemies.spawnBench(n)` → entity[] (training mobs that never deal damage, drop loot, give XP or count for quests) and, if possible, `despawnBench(list)`.
  Without `despawnBench`, core removes them with `game.enemies.remove(e)`.
- **ux** — 성능 테스트: `await game.quality.benchmark({seconds: 20})` → `{avgFps, low1Fps, level, renderW, renderH, gpu, tier, cpuMs, gpuMs?}`. `game.quality.formatBench(result)` is the
  복사 text (template `SETTINGS_TEXT_KO.benchLine`). Quality offers: implement `game.ui.qualityOffer(offer)` (`offer = {kind:'high'|'medium', textKo, yesKo, noKo, accept(), decline()}`, also emitted
  as the `qualityOffer` event); without it core shows a small fallback card. FPS overlay: `game.fps`, `game.quality.level`, `game.quality.renderSize()` (live `{w, h}`), `SETTINGS_TEXT_KO.autoLevel`.
  The title benchmark result is `game.quality.lastTitleBench` (event `titleBenchmark`).

## Resolution (core integration, wave C round 1)
- ux damageNumbers `'off'`, settings menu from `SETTING_DEFS`, keymap labels, qualityOffer, 성능 테스트: **done** (`ui.js` `!== 'off'`, `ui/settingsMenu.js`, `ui.qualityOffer`).
- mobs `ptArmor`, `story` difficulty row: **done** (`enemies/base.js`, `enemies/scaling.js`).
- bosses `checkAddSec`: **done** (`kalis.js`, `scaling.js`).
- tells / mobs / bosses no second fallback decal: **done** (real tells present; stub path verified by bootcheck `&stub=tells`).
- world presets / pointLights / budget keys: **done**; world `src/world.js:46` still writes the v3 bloom fields — harmless (core re-applies the preset after every `init()`), left to world as a cleanup.
- vfx caps from settings × budget: **done** (`vfx.js` reads `particleCap/additiveCap/coverage*` × `quality.budget`).
- sub-steps: **done** for player and enemies (`substeps: true`); sword explicitly `false` (legacy once-per-frame path), spells/vfx/story/cinematic run on the fallback.
- per-entity hitstop in mobs/bosses: **done** (`base.js:384`, `bossbase.js:556`); player animation pause: **done**.
- mobs `spawnBench`: **done**; ux 성능 테스트 UI: **done**.
