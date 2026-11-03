# player — module notes (v3)

Owner: **player**. Files: `src/player.js`, `src/player/*`, `tools/playtest3/player.js`.

## Files

| File | Role |
|---|---|
| `src/player.js` | Controller, camera, aim, combat hooks, kit behaviours (dodge Q / defend E), API. No class literals: everything class-specific comes from `KITS`, `CLASS_OUTFITS`, `familyOf` / `styleOf`. |
| `player/kits.js` | `KITS[cls] = {stance, aim, dodge:{type, dist, iframes, cost, cd or charges, time, perfectWin…}, defend:{type, …}, idleFidget}`. The only player file allowed to name classes. Also `kitOf(cls)`, `KIT_NAMES` (Korean move names) and `NO_KIT` (before the class choice). |
| `player/resource.js` | `Resources`: MP, 투지 (resolve) and stamina. Maxima come from `stats.derived()` and are refreshed on `statsChanged` / `classChosen`, keeping each pool's fill fraction (HP included). 투지: 6/s + `resolveRegenAdd`, +2 per landed player hit (`damage`), +4 per `reaction`. Legacy writers (`player.maxStamina += 20`, the 바람 깃털) become a flat bonus. |
| `player/regen.js` | `Regen`: CONTRACT §10.3 exactly. `player.regen` is its reused `state` object `{active, delay, delayLeft, inCombat, rate, blessed, boss, disabled}`. |
| `player/classes.js` | Builds every class's gear before `skinMerge`: bow (+ string handle, nock, nocked arrow, quiver, bracer, hood), hammer (hand + back), round shield, twin daggers (+ hip sheaths), totem (reuses the staff's element gem), antlers, necklace, sash, tabard, circlet, shadow hood + mask + scarf tails, braid (all). `setClassOutfit(rig, cg, cape, cls)` is the generalized `setOutfit` (visibility + robe/cloth/steel tints + per-class torso/skirt/cape canvas textures). `alignMergeKeys` keeps every new part in an existing (material, shadow) merge group. |
| `player/poses.js` | Data: 9 new cast kinds (`throw, slam, channel, summon, buff, beam, bowDraw, bowRelease, totemRaise`) as `{antic, strike, hold, recover}` + poses; `STYLE_CAST_MAP` (the bow fires everything as arrows, the totem raises for summons); caster stance overrides (ranger bow low, spirit hover); melee stances for paladin (hammer + shield) and shadow (reverse-grip daggers) in the 16-float sword-pose layer; idle fidgets; dodge pose ids. |
| `player/anim.js` | The 13-float upper-body Animator, now with stances, the new kinds (unknown → `basic`), backflip / shadow roll / dash lean / shield brace poses (flips pivot around the hips), a directional hurt spring (`hurtKick`), the hard-landing crouch, fidgets, breathing, head look-at and the bow orientation. |
| `player/springs.js` | Spring-bone chains (braid, totem charms, quiver feathers, tabard front/back with leg push, scarf tails with wind). Links are ordinary rig groups, i.e. bones of the merged skinned mesh, so they cost no draw calls. |
| `player/ik.js` | Two-bone foot IK on `world.getGroundHeight(x, z, footY)`: pelvis drop (≤ 0.3 m) + an analytic sagittal leg solve, stance-weighted, grounded only. |
| `player/swordsman.js`, `swordpose.js`, `model.js`, `cape.js`, `fx.js`, `defense.js` | Existing (v2). `setOutfit` moved to `classes.js`. |

## API (additions, CONTRACT §10)

- `setClass(cls)` (any of the 6 ids; null = villager look). Also driven by `classChosen`, `classChanged` and the legacy `pathChosen`.
- `maxHp / maxMp / maxResolve / maxStamina` (stat-driven), `mp`, `resolve`, `stamina`, `resource` (`'mp'|'resolve'`), `family`, `style`, `kit`.
- `spendMp(n)`, `spendResolve(n)` (casters fall through to MP), `spendStamina(n)` → boolean.
- `getWeaponTip(which = 'main'|'off', out?)`: staff/totem gem · bow nock (off: grip) · longsword tip (off: buckler) · hammer head (off: shield face) · daggers R tip (off: L tip). Sheathed weapons report their sheath. `getSwordTip/Base` return the current melee weapon's sockets; `getStaffTip` falls back to the weapon tip when there is no staff.
- `inCombat()`, `lastHurtT` (get/set), `regen` (read-only state), `timeComp()` (1/timeScale while `focus` is active, and in the perfect-dodge 반격 window), `focusing`, `superArmor`, `debugState()` (tests).
- `player.mods` is a **getter view** over `game.stats` (`doubleJump` → `extraJumps > 0`). Writes from not-yet-converted legacy code are forwarded into the stats source `legacy:mods` instead of throwing.
- `playCast(kind, el)` accepts the 12 kinds; `setCharging(active, el, frac)` drives the bow draw for the bow style.
- `getDefenseHud()` keeps the v2 shape (`block.type` = `barrier|guard`) and adds `dodgeType, defendType, dodgeName, defendName, ward:{frac, broken}, focus, counter`.

## Kits (DESIGN §2.2)

| Class | Q (dodge) | E (defend) |
|---|---|---|
| 마법사 | 점멸 7 m, 0.2 s i-frames, perfect → MP refund | 마법 방벽: 80 % DR, MP drain, perfect 0.2 s → parry/reflect |
| 검사 | 대시 스텝 6 m, 2 charges, afterimages | 가드 70 % DR (stamina), perfect 0.18 s → parry + counter window |
| 궁수 | 백덤블링 6 m back + hop, 0.3 s i-frames, full backflip pose | 집중: E held while airborne / gliding / ≤ 0.6 s after a dodge → `timeScale.set('focus', 0.35, 0.2)` every frame, 25 stamina/s (real time), focusStart/End; on the ground E aims without slow motion |
| 성기사 | 방패 돌격 스텝 4 m, super armor 0.38 s (no flinch, no knockback) | 방패 막기: 85 % frontal block, perfect 0.2 s → parry (reflect with the Lv10 talent), Lv25a −40 % stamina |
| 정령술사 | 정령 교대 5 m blink + a wisp decoy that absorbs one hit (offered to `enemies.setTauntTarget`) | 정령 결계: 60 % DR dome, capacity 35 % maxHp, breaks and recharges over 8 s |
| 암살자 | 그림자 구르기, 2 charges, 0.4 s i-frames, perfect → teleport behind the attacker | 반격 자세: 0.3 s window; a hit inside it is negated, the hero teleports behind the attacker and the next hit crits (stats source `kit:counterCrit`, cleared by the next landed hit) |

Parry windows add `stats.parryWindowAdd` and +0.1 s against a `dazzled` attacker. Talents used here: mage.t20 (blink rune, 30 damage after 1.5 s), ranger.t25b (+15 stamina), paladin.t10 / t25a, shadowblade.t25b (`enemies.setPlayerStealth`).

## HP regen (CONTRACT §10.3)

`onBeforeDamage` snapshots HP first (for every hit, DoT included); `onHit`/`onDeath` compare after the block refunds and after the legacy `dmgTakenMul` refund (only when combat has no `healPlayer`, i.e. v2 combat; v3 combat applies `dmgTakenMul` itself). `inCombat()` = hurt within 3 s or `enemies.anyAggroWithin(pos, 30)` (plus a 10 Hz fallback scan for aggroed / `debugAggro` entities). Delay 5 / 3 s (+`regenDelayAdd`, floor 1, ×0.5 blessed), rate 1.5 % / 8 % (×`regenRateMul` + `regenRateAdd`, +1 %/s blessed, ×0.6 with a boss within 75 m), a 1 s smoothstep ramp, healing through `combat.healPlayer(…, 'regen', {hot:true})`. Disabled by death, `regenDisabled` and `blight`. The first start calls `ui.tip('regen', '피해를 받지 않으면 체력이 자동으로 회복됩니다')`.

## Platforms / bounds

Movement, slope probes and the blink path use `world.getGroundHeight(x, z, yHint)` with the hero's height. When grounded, `world.platformAt(x, z, y)` (feature-detected) returns the platform handle; its `delta` is added each frame. `world.clampToBounds(pos)` replaces both radial clamps (the legacy radial clamp is the fallback). No kill plane.

## Events emitted

Existing: `jump, land{height}, footstep, glideStart/End, updraftEnter/Exit, blink{kit}, dash{kit}, perfectDodge{kit}, parry{kit}, guardBreak, playerDeath, playerRespawn, blocked`.
New: `hpRegenStart {rate}`, `hpRegenStop {reason}`, `focusStart`, `focusEnd`, `dodge {type}`, `counterStance`, `counter`, `decoyPop`, `wardBreak`, `hardLanding {height}`.

## Perf

All class gear merges into the existing skinned draws: the hero rig stays at 51 skinned draw calls, 22.2k → 29.7k triangles (+7.5k, budget 18k), 118 → 246 bones. No new lights and no new rig materials (string/feathers reuse the blade material, dark cloth reuses cloth). Per-frame code uses module scratch objects; the `vfx.burst` options for regen motes are reused. Springs and IK run every frame (player only). `bootcheck`: draw calls, triangles and program counts unchanged per config (234 calls / 121 programs for mage).

## Tests

`node tools/playtest3.js player` covers: the rule 8/9 grep; check 7 (regen, on `debug.regenState()`); per class: identity/family/style/resource, stat-driven maxima keep their %, `mods` getters, weapon prop visible + sockets, drawn weapons, dodge (start, cost, i-frames / super armor, distance, decoy), defend (barrier/guard/shield/ward reduction, perfect parry, counter teleport + crit, focus time scale + timeComp + drain), springs bounded, IK sane, all cast kinds; bounds; platforms (world if present, otherwise a labelled test double); legacy `mods` writers; rig perf.
