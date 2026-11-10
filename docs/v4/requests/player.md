# player — v4 requests to other owners

Owner: player (`src/player.js`, `src/player/*`). Everything below is feature-detected on the player side with a working
fallback; nothing blocks the player's own checks (PL1 passes on `v4/player` with `core-p0a` + `tells-b.2`).

## core
1. **`timeScale.comp()`** returns `1 / min(all active entries)` while any compensating entry is active. During witch time
   (0.5, compensate) plus a non-compensating `bossDeath` (0.25) the player would run at 4×. Suggest `comp()` = 1 / (product or
   min) of the *compensating* entries only.
2. **Keymap action `lockOn`** (P1 soft lock-on, §5.11: T / middle mouse): the player reads keys only through `game.input.keymap`;
   with a `lockOn` action (default `KeyT`, alt `Mouse1`) the P1 lock-on can land without key literals. Cut on this branch.
3. Done in `core-b` and adopted: per-entity hitstop (`game.playerHitstopUntil` + `entity.hitstopUntil` freeze the player's
   animation, input keeps buffering), sub-steps (`player.substeps = true`; the visual block runs once on `lastStep` with
   `frameDt` and the frame's real dt).
4. Optional: the player's shadow proxy (`player/merge.js`, SkinnedMesh + default depth material) is drawn in the shadow pass from
   the first frame; `render.bootWarm()` draws it once in the main pass — include the shadow pass if first-draw hitches show up.

## ux
1. **Perfect callouts**: every perfect (dodge, parry, barrier, paladin brace, grace refund) now emits
   `perfectDodge {attacker, witch, grace, kind:'dodge'|'parry'|'barrier'|'brace', calloutKo, kit, cls, position}`;
   show `p.calloutKo` (`완벽 회피!` / `완벽 패링!` / `완벽 방벽!`, from `PERFECT_KO` in `src/player/kits.js`). `ui.js:947`
   currently shows `완벽 회피!` for every `perfectDodge`, and `parry` still fires for parries, so a parry shows two banners.
2. `dodgeRejected {action:'dodge'|'defend', reason:'locked'|'stamina'|'cooldown'}` → flash the key + `dodge_rejected` sound;
   `dodgeBuffered {action, waited}` needs no UI. `counterReady {dur: 1.2}` → optional "반격" cue on the basic-attack key.
3. Kit names changed to the §6.10 glossary in `KIT_NAMES` (`질풍보`, `방패 돌진`, `마력 방벽`, `막기`); `getDefenseHud()` returns them.
   `kit.defend.canParry` (barrier/guard/shield/counter with a perfect window) is the §6.11 can-parry flag.
4. Story auto-revive emits `playerRespawn {inPlace:true, autoRevive:true}` (no `dead` state). The death recap should not open for it.

## melee
1. Write `game.player.action.dodgeCancelable` per §5.8 (lock ≤ 0.25 s per swing). Measured on this branch with the v3 sword:
   a dodge pressed 4 frames into **c4 (fire)** is still locked at +0.25 s → the player emits `dodgeRejected {reason:'locked'}`
   (PL1 accepts both outcomes; ML1 owns the ≤ 0.25 s lock).
2. Spell / sword objects that could stand between the camera and the hero: set `userData.noCameraCollide = true` (on the object
   or on the world collider record) — the boom collision skips colliders with `noCameraCollide`, `userData.noCameraCollide` or
   `object.userData.noCameraCollide`.

## magic
1. Write `game.spells.castLock` (seconds of non-cancellable recovery, 0 when free): the player's dodge / defend gate reads it
   every step and buffers presses for 0.25 s.
2. Same `noCameraCollide` note as melee for ice pillars / walls / rods.

## mobs / bosses
1. `game.enemies.orbEta(pos)` (seconds until the nearest orb reaches `pos`) is used for pending-perfect against orbs.
2. Every enemy hit should carry `attack: {id, nameKo, kind}`; post-hit protection ignores only `attack.kind === 'melee'`
   (without `attack`, a hit from an enemy entity is treated as melee, projectile hits need `hit.projectile`).
3. Bosses: `e.cameraHint = {dist, height}` is applied as **multipliers** (boom × dist on top of the 6.6 m combat boom, pivot height
   × (1 + (height − 1)/2)) while the boss is aggroed (`aggro`/`debugAggro`/`active`) within 40 m. Say if you meant metres.
4. Boss tells: the camera adds +10 % boom while any `tells.active()` record has `enemy.isBoss`.

## tells
1. Witch time (`perfectDodge.witch === true`, 0.6 s real): §5.9 says "enemy rim clones lit" — optional, tells-side.
2. The player reads `tells.nextImpact(pos)` and `tells.active()` records (`enemy`, `targetsPlayer`, `handle.remaining`,
   `handle.contains`) at a dodge / defend press; `remaining` is in enemy time and the player compares it in enemy time.

## vfx
none (uses `applyPlayerFx` on the player's private FX materials, `fxFactor('witch', 0.6, 0.6)`, `playerHurt.attack` /
`appliedStatuses`, `combat.clearStatus`, and `entity.flashUniform` for the merged body).

## Resolution (core integration, wave C round 1)
- core 1 `timeScale.comp()`: **done** — integration fix: `comp()` = 1 / (lowest *compensating* scale); a non-compensating `bossDeath` still slows the player.
- core 2 keymap `lockOn`: **rejected for round 1** (P1 lock-on was cut on the player branch; no consumer).
- core 4 shadow proxy first shadow draw: **rejected for round 1** — boot warm draws every object; no first-shadow hitch measured (first draws 0).
- ux 1–4 (perfect callouts, `dodgeRejected`, kit names, auto-revive without recap): **done** on `ux-b` (`ui.js` `dodgeRejected` shake + sound, `ui/recap.js` skips `autoRevive`).
- melee 1–2 (`dodgeCancelable`, `noCameraCollide`): **done** (`sword.js`, `sword/fx.js`).
- magic 1–2 (`castLock`, `noCameraCollide`): **done** (`spells/looks.js`, `spells/projectiles.js`).
- mobs/bosses 1–4 (`orbEta`, `attack` on hits, `cameraHint` as multipliers, boss boom): **done** (`enemies/projectiles.js orbEta`; bosses confirm multipliers in `bosses.md`).
- tells 1 witch-time rims: optional, not done (P1). tells 2: as specified.
