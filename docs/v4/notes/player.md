# player — v4 notes

Owner: player (`src/player.js`, `src/player/*`, `tools/playtest3/player.js`, `tools/playtest4/player.js`, these notes, `docs/v4/requests/player.md`).
Branch `v4/player` (from `core-p0a`), worktree `/home/user/wt4/player`. Merged read-only: **`tells-b.2`** (which carries `world-b`, `kit-p0a`
and `vfx-b`) and **`core-b`** (post4 render path, governor, sub-steps, per-entity hitstop). `mobs`/`bosses`/`magic`/`melee`/`ux` tags did not exist:
`enemies.orbEta`, `spells.castLock`, `action.dodgeCancelable` (v3 sword), `cameraHint` are feature-detected.

## Status

| Item (task) | State |
|---|---|
| P0 1 kits (§5.8 numbers, §6.10 names, `defend.canParry`) | done |
| P0 2 pending-perfect (tells.nextImpact / enemies.orbEta) + after-impact grace refund | done |
| P0 3 keymap-only input, 0.25 s buffer, dodgeBuffered / dodgeRejected, dodge along the held input | done |
| P0 4 post-hit protection (melee only, 0.35 s after a non-DoT hit ≥ 12) | done |
| P0 5 witch time (§5.9 conditions), perfectDodge payload, counterReady 1.2 s | done |
| P0 6 per-entity hitstop: animation freeze, input keeps buffering | done (`game.playerHitstopUntil`, `entity.hitstopUntil`, `player.hitstopUntil`) |
| P0 7 story auto-revive in place, 50 % HP after 2 s | done |
| P0 8 combat camera (6.6 m / FOV +4 / shoulder 0.9, boss tell +10 %, cameraHint, cameraDist, noCameraCollide) | done |
| P0 9 model: ≤ 8 + 4 calls, ≤ 30k / 6k tris every class; FX through applyPlayerFx + ramps; no per-frame allocation; visual work on lastStep | done |
| P1 aim assist (`settings.aimAssist` 약 / 강: 8° / 12° pick cone, v3 4.5° when 끔) | done |
| P1 directional hurt poses | already in v3 (`anim.hurtKick` from the hit direction); unchanged |
| P1 soft lock-on (T / middle mouse, middle-third framing, ring pulse on tellStart) | **cut**: core's keymap has no `lockOn` action and §5.8 forbids key literals; fallback = no lock-on (the combat camera framing works without it). Request: core adds `lockOn` to the keymap. |

## What was built

### Kits (`src/player/kits.js`)
- `KITS[cls].dodge = {type, dist, iframes, perfectWin, grace: 0.05, …}`: mage blink 0.30 / 0.20, sword dashstep 0.30 / 0.20, ranger backflip 0.42 (= the
  whole flip) / 0.20, paladin shieldstep 0.20 + `superArmor` 0.38 / **perfect brace 0.15** (`brace: true`), spiritcaller spiritswap 0.30 / 0.20,
  shadowblade shadowroll 0.40 / 0.22. Defend perfect windows 0.22 (barrier, guard, shield, counter nominal); ward 0; focus none.
- `kit.defend.canParry` = type ∈ {barrier, guard, shield, counter} and perfect > 0 (mage, sword, paladin, shadowblade).
- `KIT_NAMES` = the §6.10 glossary (점멸 · 질풍보 · 백덤블링 · 방패 돌진 · 정령 교대 · 그림자 구르기 / 마력 방벽 · 막기 · 방패 막기 · 정령 결계 · 반격 자세 · 집중);
  `PERFECT_KO = {dodge:'완벽 회피!', parry:'완벽 패링!', barrier:'완벽 방벽!'}`; `GRACE = 0.05`.

### Dodge / defence (`src/player.js`)
- **Input**: only `game.input.keymap` actions (`dodge`, `dodgeAlt` = Mouse3, `defend`, `jump`, `sprint`; legacy `game.KEYS` twin when the keymap
  is missing). WASD stays as the movement axes (no keymap actions exist for them).
- **Gate**: `(!action.active || action.cancelable || action.dodgeCancelable) && !(game.spells.castLock > 0)`. A press while the gate is closed (or the
  dodge is on cooldown / mid-dodge / stunned) is queued (`player.inputBuffer = {action, t}`); the first allowed frame within 0.25 s executes it and emits
  `dodgeBuffered {action, waited}`; on expiry `dodgeRejected {action, reason:'locked'|'cooldown'}`; no stamina → `dodgeRejected {reason:'stamina'}` at once.
  A buffered defend starts the block only if the key is still held (a released tap has nothing to hold).
- **Direction**: every dodge follows the held movement input (camera-relative, read before action / stun scaling). Without input: blink / swap forward,
  rolls / dashes away from the camera view, ranger backflip backward; with input the ranger faces away from the travel direction (a real backflip toward it).
- **Pending-perfect**: at the dodge (or defend) press `t = min(tells.nextImpact(pos), enemies.orbEta(pos))`; the matching `tells.active()` record gives
  the attacker and `targetsPlayer`. `t ≤ window × assist.perfectMul` → pending until `enemyTime + t + 0.06`; a hit absorbed by the i-frames (or the
  block) inside it is perfect. Without any prediction source (`Infinity`) the v3 rule applies on game time (a hit within the window after the press).
- **Clocks**: the prediction compares in **enemy time**; i-frames, super armour, counter stance and the block timer run on **game time** (uncompensated):
  under a compensated slow motion (witch, the tells teaching slow motion) the player moves at full speed while the protection keeps pace with the slowed
  enemies (found by PL1: with compensated i-frames the teaching slow motion made perfect dodges land as hits). Dodge travel stays compensated.
- **Grace**: `playerHurt` (non-DoT) records `player.lastEnemyHit = {t (realTime), amount, attacker, attack, appliedStatuses}`; a dodge / block / counter
  that *starts* with its press ≤ 0.05 s real after that hit refunds the HP, clears those statuses (`combat.clearStatus`) and counts as perfect `{grace:true}`.
- **Perfect reward** (one path for dodge / parry / barrier / brace, ≤ 1 per 0.25 s): `perfectDodge {source, attacker, witch, grace, kind, calloutKo, kit, cls, position}`,
  `counterReady {dur: 1.2}`, `player.counterReady` 1.2 s (the sword / skills counter hooks consume it). Parries also keep the v3 `parry` event; their
  hitstop is `game.hitstop(0.08, {tier:'parry', target: attacker})`. The v3 per-perfect `slow('parry', …)` and full-screen flashes are gone.
- **Witch time** only if `assist.witchSlowmo`, the dodged attack's tell targeted the player (recent `tellStart` ring or the pending record), no other
  player-targeted tell has ≤ 0.3 s left, and ≥ 4 s since the last one ended: `timeScale.set('witch', 0.5, 0.6, {compensate:true})`,
  `post.setGrade('witch', 0.6, {durReal: 0.6})`, `vfx.fxFactor('witch', 0.6, 0.6)`. Arbitration (teach / cinematic win) is core's.
- **Paladin brace**: a pending-perfect hit during the shield step → `{cancel, parried, perfect}` (the attacker's `onParried` stagger), shield-parry effects, `kind:'brace'`.
- **Post-hit protection**: after a non-DoT hit ≥ 12 (`playerHurt.amount`), hits with `attackKind === 'melee'` (`hit.attack.kind`, else an enemy-entity
  source without `projectile` / dot tags) are cancelled for 0.35 s game time; projectiles, hazards, surfaces and debug hits still apply.
- **Per-entity hitstop**: while `max(player.hitstopUntil, entity.hitstopUntil, game.playerHitstopUntil) > game.realTime` the visual block (pose, springs,
  cape, FX) is skipped; timers, movement and the input buffer keep running (`debugState().animFrozen`).
- **Sub-steps** (`core-b`): `player.substeps = true`; gameplay (input, buffer, timers, movement, collisions) runs every sub-step; the visual block
  (fidgets, animation weights, `anim.update`, IK, springs, bow string, gem, charge circle, sigil, ghosts, cape, rig merge update, camera) runs once on
  `game.frame.lastStep` with `frameDt × timeComp()` and the frame's real dt (PL1: a 1/15 s frame → 2 player steps, 1 visual pass).
- **Auto-revive** (`assist.autoRevive`, 이야기): 2 s after death, in place, 50 % HP, 2 s i-frames, statuses cleared, `playerRespawn {inPlace, autoRevive}`;
  the `dead` state / respawn timer are never entered.

### Camera (`updateCamera`)
- `wCombat` eases (≈ 95 % in 0.6 s) to 1 while any enemy entity with `aggro`/`debugAggro` is within 15 m (or the boss hint applies): boom 5.5 → 6.6 m,
  FOV +4°, shoulder 1.2 → 0.9. +10 % boom while a `tells.active()` record belongs to a boss. Boss `cameraHint {dist, height}` within 40 m as multipliers.
  `settings.cameraDist` near / normal / far = ×0.9 / ×1 / ×1.15. Aim zoom keeps its ratio to the current boom. Colliders flagged `noCameraCollide`
  (record, `userData` or `object.userData`) are ignored by the boom. `player.camera = {hint, dist, fov, combat, bossTell, shoulder}` (read only).

### Model (`src/player/merge.js`, `model.js`, `cape.js`, `swordsman.js`)
- `mergeRig(root, {cape, skirt, slots, exclude})` replaces the v3 per-material `skinMerge` (kept as the fallback): the ~244 parts (every class's gear)
  are the bones of one skeleton (+ an identity bone for the world-space cape) and draw as **one body SkinnedMesh** (one toon material: vertex colours,
  per-vertex emissive vec4 whose w selects a uniform colour slot for the staff gem / gem motes / weapon gems, one 912×144 canvas atlas for torso,
  skirt, capelet and cape at half resolution with wrapped gutters; double-sided parts get a flipped copy), **one outline** (shares the body's vertex buffers,
  own index, per-vertex thickness) and **one decimated shadow proxy** (vertex clustering at 4.5 cm per part; its main-pass draw is collapsed outside the
  clip volume, so it costs a call but no fragments). The draw index holds only the triangles of parts visible since the last outfit change (index rebuild
  on growth / on `refresh()` at class change), so hidden class gear costs no triangles.
- Skirt (`Skirt.bindSink`) and cape (`Cape.detach`, `writeCape`) write live ranges into the merged buffers (`addUpdateRange`).
- Flash: `entity.flashUniform = rig.skin.flash` → `vfx.flashEntity` tints the body through a uniform (no material clones).
- Sword edge glow: both blade faces merged into one mesh. The gem core (hidden inside the gem) is not drawn.
- Player FX (`fx.js` RuneCircle + Afterimages, `defense.js` Barrier, the gem halo): private materials patched once through `game.vfx.applyPlayerFx`
  (`role:'line'` for the rune circles, `'fill'` otherwise); tints from `game.elements.fx(el)` (mid / light), never white; ghost fresnel ≤ 1.2×.
  Burst colours in `player.js` are ramp pairs `[mid, light]` (cached) or fixed non-white pairs; per-frame emitters reuse their option objects.
- Allocation fixes: cape constraint loop (typed rest lengths, no boxed doubles), `writeCape` / ghost bake without `subarray` views, `for…of` loops removed,
  ghost uploads limited to the visible range.

## APIs (PLAN §7.4.8)
`player.kit.dodge.{iframes, perfectWin, grace}`, `player.kit.defend.{perfect, canParry}` · `player.counterReady` (seconds left, truthy) ·
`player.camera.{hint, dist, fov, combat, bossTell, shoulder}` · `player.inputBuffer` `{action, t} | null` · `player.lastEnemyHit` `{t, amount, attacker, attack, appliedStatuses} | null` ·
`player.hitstopUntil` (get / set, realTime) · `player.debugState()` (+ `pending, buffer, protect, witchReadyIn, dodgeDir, animFrozen, revive`) ·
`player.rig.skin` = `{skeleton, meshes:[body, outline, proxy], body, outline, proxy, flash, stats, refresh(), recolor(), update()}`.
Events emitted: `dodgeBuffered`, `dodgeRejected`, `perfectDodge` (+ `attacker, witch, grace, kind, calloutKo`), `counterReady`, `playerRespawn {inPlace, autoRevive}`;
consumed: `playerHurt`, `tellStart`.

## Measured (branch, SwiftShader 640×360, `prod=1&governor=0&seed=1`, medium)

| Metric | v3 | v4 (this branch) | Budget |
|---|---|---|---|
| Player model scene calls (worst state per class: weapon drawn / charging) | 25–34 | mage 4 · sword 4 · ranger 3 · paladin 3 · spiritcaller 4 · shadowblade 3 | ≤ 8 |
| Player shadow calls | 15–16 | 1 (every class) | ≤ 4 |
| Player scene triangles (body + outline + proxy + cape) | 24.6k / 27.3k (mage / sword, cape not counted) | 18.3k–23.9k | ≤ 30k |
| Player shadow triangles | 8.2k / 12.6k | 2.7k–3.7k | ≤ 6k |
| Merged rig | 42 skinned meshes | 3 (body 21.4k tris capacity, outline 12.5k, proxy 6.3k; drawn: visible outfit only) | — |
| Player-file allocation while moving (CDP sampling, 4 s) | — | 2.9–3.8 KB / game-second (writeCape, deform remnants) | ≤ 32 KB/s (section check; F-* scene ≤ 1 MB/s) |
| Buffer uploads per frame, whole scene, player idle / moving (S-plains spot, no enemies) | — | 7.3 KB / 13.2 KB in 13–14 calls (skirt 5.9 KB + cape 2.1 KB when moving) | F-* ≤ 150 KB |

PL1 timings (enemy time): perfect press at −0.177 s → pending, the absorbed hit → `perfectDodge`; grace press at +0.04 s real → full refund; witch time
lasts 0.60 s real (timeScale 0.5, comp 2); combat boom 6.600 m / FOV 66.0 (base 62); boss hint 1.5 → 9.90 m; story revive 2.0 s → 137.5 / 274 HP.
Real v3 sword combo: a dodge pressed 4 frames into **c4 (fire)** is still locked at +0.25 s → `dodgeRejected {locked}` at +0.28 s (melee's ML1 lock ≤ 0.25 s fixes it).

## Tests (final run, `tells-b.2` + `core-b` merged)
- `node tools/playtest4.js player`: **59 passed, 0 failed** (≈ 52 s; 3 boots: mage main page, sword combo page, story + `witch=0` page).
- `node tools/playtest3.js player`: **226 passed, 0 failed** (section updated per §7.9: §5.8 kit numbers per class; the rig perf check counts drawn
  triangles of the v4 merge, ≤ 3 skinned draws, ≤ 30k tris, proxy ≤ 6k — v3 asserted ≤ 51 draws / ≤ 40.2k capacity triangles).
- `node tools/playtest3.js` (all sections): **1273 passed, 0 failed, 1 skipped**.
- `node tools/bootcheck.js`: every config `playing`, exit 0 (404s only for the configs that rename modules away).
- `node tools/playtest.js --quick`: all legacy checks PASS, exit 0.
- `node tools/playtest2.js`: exit 0; one logged FAIL `sword: wind combo hitstop on the first hit of each castId` (a legacy non-melee hit without a castId gets
  no hitstop under vfx-b's volley rule; the same FAIL is in `docs/v4/notes/vfx.md` before any player change — vfx / core, not player).
- `node tools/playtest4.js core` (core's section, for information): 130 / 2 — `C5 stubs: tellCommit at lock` and the 1-overlay-call threat check fail
  because the real tells (`tells-b.2`) are merged here; core's.

## Integration notes (I checks)
- C6: the player group is now `byGroup.player` 3–4 + 1 calls; the rune circles, barrier and ghosts live in the main scene with `userData.owner = 'player'`
  (the harness counts them under `fx`).
- The shadow proxy is a SkinnedMesh with the default depth material; core's warm-up may want to include the shadow pass (requests/core 4).
