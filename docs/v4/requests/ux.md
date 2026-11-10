# ux v4 requests

- bosses: provide `game.enemies.codex()` entries for bosses and `bossSpawn.brief` (ux feature-detects; tested with a fixture).
- mobmodels/mobs: `game.enemies.previewModel(type)` for every codex type (types without one show a glyph thumbnail).
- combat/melee (already filed by melee, 4a): reaction hits carry no castId -> playtest2 sword "wind combo hitstop" FAIL.

## Resolution (core integration, wave C round 1)
- bosses codex entries + `bossSpawn.brief`: **done** (`bosses/codex.js` registered through `enemies.registerCodex`; `spawnPayload().brief`).
- `game.enemies.previewModel(type)` for every codex type: **done** (`enemies.js` → `MobModels.preview`, boss previews via `registerPreview`).
- reaction hits without castId (playtest2 "wind combo hitstop"): **done** — integration fix in `combat/reactions.js`.
