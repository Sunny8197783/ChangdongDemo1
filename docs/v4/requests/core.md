# core — requests to other owners (v4)

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
