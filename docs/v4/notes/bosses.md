# bosses — v4 notes (owner: bosses; branch `v4/bosses`, from `core-p0a`; merged read-only: `core-b`, `tells-b.2`, `mobmodels-b`, `vfx-b`)

## What was built
- **`src/enemies/bosses/codex.js`** (NEW, Korean data table): `BOSS_ATTACKS` (every §4.9–4.14 attack id → tell, cls, windup, windup2, shape in rad
  half-angles, lockAt, punishDur/Mul, kind), `BOSS_CODEX` (complete `CodexEntry` for golem, hydra, nox, treant, kalis, nidhoggra with the exact §4
  texts and briefs; no windup seconds, `parryKo` only on parry attacks, `{dodgeKey}/{defendKey}/{jumpKey}/{punishSec}` tokens), `BOSS_BRIEF`,
  `BOSS_UI` (check labels, crystal name), `attackSpec(id)`, `attacksOf(type)`, `codexOf(type)`, `registerBossCodex(game)` (idempotent;
  also called on module load when `window.game` exists, from `bosses/index.js` via `api.registerCodex`, and from `prewarmGolem`).
- **`bossbase.js` v4 contract** (exports, used by every boss incl. golem):
  - `bossAttack(ctx, e, id, over)` → `game.tells.attack` with the table numbers + `nameKo`; emits extended `enemyAttack {id, nameKo, tell, windup}`;
    refuses during a break; records handles (`e._handles`) and holds (`e._holds`).
  - `bossHit(ctx, e, handle|shape|null, hit, {jumpAvoid, pad})` — the ONE boss hit path (`h.contains` / `tells.hitTest`, fallback
    `core/tellgeom`); `attack:{id, nameKo, kind}` + `sourceName` on every hit; decoys absorb; `jumpAvoid` = feet − ground > 0.6 m clears.
  - `rhythm(game, h)` → `wind | hold | strike | done` (hold 0.15 s at the top after lock, strike = last 0.12 s); `cancelled(h)`, `stopAttacks(e)`,
    `bossPunish(ctx, e, dur, mul)` (tells.punish or stub-equivalent), `attackMeta(id)` (frozen, reused), `BOSS_BREAK`, `RHYTHM`.
  - `finishBoss(ctx, e, o)` (last line of every factory): `weakness/immune/attacks/debugAttack/timeMul/cameraHint/codexKey/brief/flashUniform/
    tellAnchor/rimSource`; `bossSpawn` payload gains `brief`; **break → 3.5 s stagger** (`bossBroken {boss, dur}`, punish ×1.5, attacks stopped
    and refused, gauge refill after the 12 s cd); boss logic on **`game.enemyTime`** deltas; **per-entity hitstop** (`e.hitstopUntil` skips the
    update; tells extends the handle); pose once per frame on `game.frame.lastStep`, frozen during every live hold, half rate > 30 m and paused
    > 60 m (not for the arena-sized bosses); flash uniform decay; first sight (≤ 30 m, in view) / first aggro → `enemies.noteEncounter?.()` +
    `enemyEncounter`; `enemies.registerPreview?.()`; `warmSkinnedShadow` (see requests/core).
- **Attacks reworked per §4** (all through tells, one strike latch `h.consumeStrike()`, aim tracking until lock via `setPos/setDir/setEnd`):
  - golem: slam = jump tell + `spec.shockwave` (front 1 + 12 m/s, hit once when it passes the player with feet − ground ≤ 0.6 m), recover 1.3 s ×1.25;
    throw = landing circle from windup start (windup + flight, lock 0.35 s before release), own ballistic rock mesh; punch = parry cone 8.5 / 1.05,
    whiff → fist planted 1.2 s + cage opens (×2), parry → 1.6 s stagger (×2); poise 280 → 2.4 s stagger (×2); breakMax 100.
  - hydra: ≤ 1 bite + ≤ 1 other; bite line ≤ 17 × 3.2 → head low 2.0 s ×1.5; spit = 3 non-homing orbs at predicted points + static landing
    markers r 1.2 (`tells.projectile`); tide ring 5.5–19 with `tells.safe` pillar tops (+ ice discs while frozen), hit only in the water;
    spouts 3 circles at 1.2 / 1.55 / 1.9; freeze check `bossCheck freeze`.
  - nox: teleport-slash = raven-smoke marker at an arrival point in front of / beside the player inside the camera view (sampled ±0.75 rad,
    inside the arena) + line 7 × 1.6, arrival 0.3 s, dash in the last 0.12 s; perfect parry → 2 s stagger ×1.5; ≤ 1 per Nox incl. the clone
    (`melee:false`: he strikes from the in-view marker); volley 3 (p2 4) homing 0.5; wave cone 7 / 0.61; void-shield break → 3 s kneel ×1.5.
  - treant: stomp r 6.5, sweep cone 12 / 1.05 → arm stuck 1.5 s, arm plates ×2 + punish; roots 3 (p3 5) lines 18 × 2.2 (half-width 1.1);
    pods glow/tell 1.0 s and self-burst 9 s after landing (still burst at once when hit — fire source).
  - kalis: slash = one conecap decal (5.5 m dash capsule w 1.8 + end cone 3.2 / 1.0) → mirror armour cracks 1.0 s ×1.5; visible 반격 자세
    (shield glows) → a hit starts the 0.5 s counter cone 3 / 0.44; volley 3 (p2 4) homing 0.5; burst r 3.4 (no rune circle); beams from the
    ledge mirrors; check = bar (`bossCheck stagger`, `checkAddSec ?? checkAdd`) + 3 crystal targets (his detached shards) → 4 s stagger.
  - nidhoggra: claw parry r 5 → head sags 2.6 s after a parry / 1.2 s after a whiff; breath unblockable cone 26 / 0.61, 1.8 s, root-pillar
    shadow wedges via `tells.safe`; rain 4 circles 1.4 + 0.2 k; rods / tide checks unchanged.
- **Enemy-owned FX**: every boss vfx call passes `owner:'enemy'`; no `0xffffff`, no flashSprite / screenFlash / point-light flash / runeCircle;
  glow multipliers ≤ 1.15; big spell presets scaled ×0.6, bursts halved.
- **Models** (§4.0 contract on all six: `proxy` (outline + rim source + the only shadow caster), `lod`, `bones`, `features`, `tellAnchors`,
  `flashUniform`, `rimSource()`, `update()` springs on lastStep):
  - golem: NEW `bosses/golem_model.js` (`buildGolemModel`, `previewGolem`; golem.js `prewarmGolem(game)`): detail-2 rocks, rune strips + crack
    seams in a per-instance glow material (phase colour = uniform), crystal core in a 4-arc rock cage that opens (stagger / planted fist),
    rock-cluster fists with knuckle shards, 6 moss strands on springs, thrown-rock mesh.
  - nox: beak helm (3 layered plates + bone beak), feather pauldrons, 6 feather-cloak spring strips, talon gauntlets + toe talons, barbed
    feather blade with twin glow edges; palette charcoal / violet trim / bone. Clone = translucent material (built in prewarm).
  - treant: cracked bevelled bark plates with per-plate ember glow (shown while burning), rib-roots around the heart, root fingers, shoulder
    mushroom clusters, face (eye hollows + glow, mouth knot), 10 vine strips on springs, lifted palette.
  - kalis: white→glass-blue plate gradient, facet crown, tassets, 4-strip cape on springs, mirror shield (glows in the stance), mirror spear,
    6 instanced orbiting shards (1 draw, tilt/shrink while cracked = the P1 crack cue, 3 detach as the check crystals).
  - hydra / nidhoggra (P0: v3 meshes): contract fields, silhouette proxy (hydra) / instanced outline (nidhoggra), lifted palettes,
    slit-pupil eyes + tooth glints (hydra), 3-per-side eye rows (nidhoggra), shadow casters reduced (nidhoggra 4).
- **`bosses/rig.js`** (NEW): `proxyParts`, `strips` / `updateStrips` (Spring chains), `contract`.
- **`tools/playtest4/bosses.js`**: B1 + B2 (+ `--sheets`); `PT_BOSSES=a,b` env filter for quick runs.

## APIs (for others)
`e.attacks`, `e.debugAttack(id)` (clears punish/break first; checks return null and emit `bossCheck start`), `e.isBroken()`, `e.cameraHint`,
`e.brief`, `e.tellAnchor(kind)`, `e.rimSource()`, `e.flashUniform`, `e.codexKey`; events `bossBroken {boss, dur}`, `enemyEncounter`,
`enemyAttack {enemy, kind, id, nameKo, tell, windup}`; `bossCheck` kinds `freeze | stagger | rods | tide`.
golem.js exports `createGolem`, `prewarmGolem(game)`.

## Measured (branch; 640×360, SwiftShader, prod=1 governor=0 seed=1)
`node tools/playtest4.js bosses`: **207 passed, 0 failed, 6 skipped** (557 s; skips = `enemies.registerCodex` absent until `mobs-b`).

| boss | body tris (budget) | proxy tris | boss draw calls (budget) | shadow calls |
|---|---|---|---|---|
| golem | 5 096 (≤ 14k) | 892 | 3 (≤ 22) | 1 |
| hydra | 12 144 (P1 ≤ 32k) | 1 214 | 7 (≤ 22) | 1 |
| nox | 5 592 (≤ 16k) | 444 | 4 (≤ 22) | 1 |
| treant | 7 375 (≤ 32k) | 432 | 4 (≤ 22) | 1 |
| kalis | 4 486 (≤ 16k) | 444 | 5 (≤ 22) | 1 |
| nidhoggra | 12 028 (P1 ≤ 60k) | 11 016 | 27 (≤ 40) | 4 (≤ 6) |

All §4.9–4.14 attack ids: tellStart windup ≥ §5.7 floor, hold ≥ 0.1 s at lock (0.367 s measured), decal = hitbox (±0.3 m), metadata on every
hit, punish windows block attacks, break → `bossBroken {dur 3.5}` with 0 attack starts; 0 boss first draws during the fights; enemy-owned FX
coverage p95 ≤ 0.004 screens branch-side (budget ≤ 1.0); no console errors in any B-* scene.

## Legacy tests
- `tools/bootcheck.js`: all configs `playing`, no console errors.
- `tools/playtest.js --quick`: all PASS (exit 0).
- `tools/playtest2.js`: story / settings / perf all PASS; sword logs one FAIL "wind combo hitstop on the first hit of each castId" — it comes
  from the merged `vfx-b` (§5.10 light-tier 0.025 s hits; vfx notes hand it to core per §7.9), passes on `core-b`, not boss code.
- `tools/playtest3.js` (all sections): **1265 passed, 1 failed, 1 skipped** before the fix below; the failure (narrative "village draw calls
  ≤ 290": 513) was caused by golem warms queued at spawn and flushed in a later rendered frame outside the fight (see requests/core: the warm
  layer = the hero's hidden layer 30). Fixed (golem materials shared, warm immediate and only when not yet warm): `playtest3.js narrative`
  154 / 0, `playtest3.js enemies` 138 / 0 / 1 skipped, `playtest4.js bosses` (golem) 36 / 0 re-run after the fix.
No playtest3 section is owned by bosses; the boss expectations for `tools/playtest3/enemies.js` (mobs) are filed in `docs/v4/requests/bosses.md`.

## P1 status
- Done (cheap): kalis shard "crack" cue during the punish window (shards tilt and shrink); extra secondary motion (moss, vines, capes, cloak).
- Cut (fallback = the P0 v3 meshes with the contract): hydra ≤ 32k and nidhoggra ≤ 60k remodels, nidhoggra wing veins, boss voice barks at
  tellStart. Turntable sheets have the v3 row only for golem (the v3 boss builders were replaced in place).

## Known issues
- On this branch `ctx.projectiles.orb` is the v3 orb (homes 3.2 s, no `attackId` in `playerHurt`); boss orbs get homing caps and attack
  metadata from the `mobs-b` orb at integration (bosses already pass `homing`/`attackId`).
- The golem is still pre-built as the v3 model by the v3 `enemies.js`; golem.js builds the v4 model at spawn (0 new programs measured) until
  mobs' `prewarmGolem` call lands (in `mobs-b`).
- Enemy-FX coverage is measured branch-side with `vfx-b` + legacy particles; the hard number is the integration I-check.
