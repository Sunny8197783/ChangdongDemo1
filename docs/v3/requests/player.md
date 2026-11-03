# Requests from player

All of these are feature-detected in player code; nothing crashes when they are missing.

## world
- **`world.platformAt(x, z, yHint) → handle|null`**: the stand-on platform whose top the hero is standing on (same rule as `getGroundHeight`: top ≤ yHint + 1.2, within its shape). The player adds `handle.delta` every frame while grounded on it (CONTRACT §10.5). Without it, moving platforms do not carry the hero (static platforms still work through `getGroundHeight`).
- `getGroundHeight(x, z)` **without** `yHint` is used for the camera boom and the cape ground collision — please treat a missing yHint as "terrain + frozen water only" (or document what it returns).
- `world.clampToBounds(pos)` is called on every movement step and teleport; keep it allocation-free.

## enemies
- `enemies.anyAggroWithin(pos, r)` must also count entities with `debugAggro` (training dummies marked by `debug.hurt(…, {combat:true})`), so CONTRACT §21 check 7 sees `inCombat()`. (The player also scans for them at 10 Hz as a fallback.)
- Optional: `enemies.setTauntTarget(entity, durationSec)` / `enemies.clearTauntTarget()` — the spirit-swap decoy offers itself as `{object:{position}, team:'player', alive:true, isDecoy:true}` for 4 s.
- Optional: `enemies.setPlayerStealth(on, durationSec)` (shadowblade Lv25b perfect dodge).
- Attackers should expose `entity.facing` (radians, same convention as the player): the counter stance and the perfect shadow roll teleport *behind* the attacker; without it the hero lands on the far side relative to the player.

## combat
- Keep calling `target.onBeforeDamage(hit)` for **every** hit, DoT ticks included (the player snapshots HP there), and `onHit` / `onDeath` after HP is applied (regen compares the net loss there).
- Mark DoT ticks with `hit.isDot = true` (or the `'dot'` tag); dodges and blocks ignore them.
- The player detects v3 combat by `combat.healPlayer` and then stops refunding `stats.dmgTakenMul` itself (v3 applies it in the formula). Please keep `healPlayer` as the marker or tell player if that changes.
- Counter stance: the next hit is a crit through the stats source `kit:counterCrit {critChance: 1}`; the player clears it on the next landed player `damage` event.

## ui
- `ui.tip(id, text)`: one-time contextual tip. The player calls `ui.tip('regen', '피해를 받지 않으면 체력이 자동으로 회복됩니다')` the first time regen starts.
- Melee classes have `player.maxMp === 0` and use `player.resolve / player.maxResolve` (`player.resource === 'resolve'`); please never divide by `maxMp` for them.
- `player.getDefenseHud()` adds `dodgeType, defendType, dodgeName, defendName` (Korean), `ward:{frac, broken}`, `focus`, `counter` for the v3 HUD; `block.type` stays `barrier|guard` for the v2 HUD.

## skills
- `player.playCast(kind, el)` accepts `basic, heavy, ultimate, throw, slam, channel, summon, buff, beam, bowDraw, bowRelease, totemRaise` (unknown → basic; the bow style maps basic/heavy/throw to `bowRelease`). For bow charged shots please keep calling `setCharging(true, el, frac)` while drawing: the string and the nocked arrow follow the draw hand.
- `player.lastHurtT` is settable (tests) and `player.inCombat()` is the canonical rule.

## melee
- Hammer and the right dagger copy `gear.sword.quaternion` every frame after `applySwordArms`, so melee pose templates (`TPL.hammerSlam`, `daggerFlurry`, …) drive them exactly like the longsword. The left dagger is FK (reverse grip). Use `player.getWeaponTip('main'|'off')` (daggers: off = left tip; paladin: off = shield face).
- Player melee stances for paladin and shadowblade live in `player/poses.js` (`MELEE_STANCES`); `action.superArmor` is honoured (no flinch).

## narrative (audio)
- New player events you may want cues for: `hpRegenStart {rate}` / `hpRegenStop {reason}`, `focusStart` / `focusEnd`, `dodge {type}`, `counter`, `counterStance`, `decoyPop`, `wardBreak`, `hardLanding {height}`. `blink`, `dash`, `perfectDodge`, `parry` now carry `kit`.
