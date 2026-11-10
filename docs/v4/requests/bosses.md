# bosses → other owners (v4 requests)

## mobs (`tools/playtest3/enemies.js`, `src/enemies.js`)
Boss expectations for the boss part of `tools/playtest3/enemies.js` (PLAN §7.9; none of the existing boss checks need to change — they all pass on `v4/bosses`):
- Keep the `&boss=<id>` loop (spawn, prewarm idempotent, Korean name/title, draw-call budget ≤ 20 for mid-bosses / ≤ 40 nidhoggra, debugPhase(2), programs constant, debugDefeat → `bossDefeated` once).
- **New, per boss** (add to the loop):
  - `b.attacks` lists the §4 ids (golem 3, hydra 4, nox 3, treant 4, kalis 6, nidhoggra 5), each `{id, nameKo, tell, windup, punishDur?}`; `b.debugAttack(id)` returns a tells handle for every non-check id (checks return null and emit `bossCheck {state:'start'}`).
  - `tellStart` for each id: `windup ≥ tells.MIN[cls]` (boss 1.0 / bossAoE 1.2 / unblockable 1.0 / check as authored) — do not assert the v3 windups any more.
  - `b.spawnPayload().brief` = 3 Korean strings; `b.cameraHint` = hydra {1.6, 1.5}, treant {1.7, 1.6}, nidhoggra {1.5, 1.4}.
  - `game.combat.addBreak(b, 9999)` → `bossBroken {boss, dur: 3.5}`, `b.isBroken()` true, `tells.canAttack(b)` false for 3.5 s (reset `b._brokenT = 0` first if the boss was broken earlier).
  - golem: `bossDefeated {id:'golem', final:false}` unchanged; `spawnPayload()` now also carries `brief` (the golem.js getter wraps whatever enemies.js assigns).
- `src/enemies.js` golem factory: it still passes `model: prebuiltGolem` (= v3 `buildGolem()`); golem.js ignores a non-v4 model and uses `bosses/golem_model.js`. Please call `GolemMod.prewarmGolem?.(game)` from `prewarmBossSync('golem')` / `buildForWarm('golem')` (as in `mobs-b`) and drop the v3 `buildGolem()` prebuild there, so the v4 model is built inside the prewarm (B2).
- `scanSight` skips `e.isBoss` (as in `mobs-b`): bosses emit their own `enemyEncounter` (bossbase `finishBoss`) — keep that skip so the event is not doubled.
- `ctx.projectiles.orb(…, {homing, attackId})`: bosses pass `homing: 0` (hydra spit, then set `o.vel` toward a predicted point) / `0.5` (nox, kalis volleys) and `attackId`; with the v4 orb this fills `playerHurt.attackId` for boss orbs too (B1 checks it only for decal attacks on the branch).

## tells
- `tells.attack` spec `melee` is honoured as given (bosses pass `melee:false` for `nox.teleportSlash`: he vanishes and strikes from an in-view arrival marker, so the off-screen melee rule must not refuse it).
- Optional: `h.shockwaveR()` is used by golem.slam when present (fallback: 1 + 12 m/s × t from the strike).

## core
- `game.render.warm(obj)` / the boot warm-up do not compile **shadow-depth** programs: a skinned shadow caster first drawn later compiles `MeshDepthMaterial` + skinning on its first shadowed frame. Bosses work around it (`bossbase.warmSkinnedShadow`: compile a skinned `MeshDepthMaterial(RGBADepthPacking)` into a render target with the main scene's lights and no fog). Please warm the shadow variants in `render.warm` / the boot warm-up so every owner gets it.

- **`render.js` `WARM_LAYER = 30` equals `player/model.js` `HIDDEN_LAYER = 30`**: every `realDraw(…, 'layer')` (each flushed or immediate
  `render.warm`) also draws the hero's ~270 hidden rigid parts + outlines (+275 draw calls in that frame). Seen as the narrative "village draw
  calls ≤ 290" failure (513) when a queued warm was flushed in the village. Please move the warm layer to a free layer (e.g. 29) or exclude
  the hidden layer. Bosses now warm immediately and only once per session (golem), so the bosses branch no longer triggers it.

## ux
- `bossBroken {boss, dur}` → the "붕괴!" banner; `bossCheck` kinds `freeze` (hydra), `stagger` (kalis: bar + 3 crystal targets, `BOSS_UI.crystal`), `rods`, `tide` (nidhoggra); labels in `src/enemies/bosses/codex.js` `BOSS_UI.checkLabel`.
- Boss codex: `src/enemies/bosses/codex.js` `BOSS_CODEX` (registered via `enemies.registerCodex`; previews via `enemies.registerPreview`).

## vfx
- none (all boss vfx calls pass `owner:'enemy'`).
