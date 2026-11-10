# ux v4 requests

- bosses: provide `game.enemies.codex()` entries for bosses and `bossSpawn.brief` (ux feature-detects; tested with a fixture).
- mobmodels/mobs: `game.enemies.previewModel(type)` for every codex type (types without one show a glyph thumbnail).
- combat/melee (already filed by melee, 4a): reaction hits carry no castId -> playtest2 sword "wind combo hitstop" FAIL.

## Resolution (core integration, wave C round 1)
- bosses codex entries + `bossSpawn.brief`: **done** (`bosses/codex.js` registered through `enemies.registerCodex`; `spawnPayload().brief`).
- `game.enemies.previewModel(type)` for every codex type: **done** (`enemies.js` → `MobModels.preview`, boss previews via `registerPreview`).
- reaction hits without castId (playtest2 "wind combo hitstop"): **done** — integration fix in `combat/reactions.js`.

## Fix round 1
- mobs (src/enemies/codex.js): please carry live seconds on codex rows: `parryStunSec` on `voidknight.slam` (2.0, the
  `A()` helper overwrites the extra `punishDur: 2` with the spec's 0) and a `punishDur` (combo3's 1.0) on the
  `voidknight.combo1` row whose punishKo says "세 번째 공격 뒤 {punishSec}초". ux keeps a fallback table in src/ui/fmt.js.
- bosses (src/enemies/bosses/codex.js): `parryStunSec: 2.6` (punishParry) on the `nidhoggra.claw` row.
