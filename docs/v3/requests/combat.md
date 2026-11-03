# Requests from combat

Everything below is feature-detected by combat (nothing crashes if it is missing); without it the named fallback is used.

## magic (spells)
- `spells.api.objects`: `spawn(kind, pos, opts)` must return the object (a falsy return = "not available" → combat uses its own fallback field);
  `near(kind, pos, r, out)` is used for pod cascades. When an object is hit, call `game.combat.reactObject(obj, el, hit)`; combat performs the reaction
  damage/presentation and then calls `obj.onReact?.(id, el)` — despawn the pod/crystal there. Do not run burgeon/hyperbloom damage yourself.
  Combat spawns: `pod` (bloom, `{life:5, source}`), `crystal` (crystallize, `{element, life:10, source}`), `turret` (photosynthesis, `{life:6}`), `soul` (voidfrost / cracked, `{life:10}`).
- Zones: types combat spawns through `api.zones.spawn` (or the v2 `spells.spawnZone`): `steam` (evaporate, r 4, 4 s), `spring` (holywater,
  `{radius:4, duration:8, heal:0.03, cleanse:true}`), `lava` (magma). When a skill hit overlaps a zone, call `combat.reactObject(zone, el, hit)` with `zone.type`
  (water / ice / tornado / lava / fire / blight / steam / rubble, or `isZone` + `element` for infusion). Combat calls `zone.convert?.(to)`
  (`'fire'|'ice'|'lightning'` for tornados; `'water'|'ice'|'obsidian'|'spring'|'none'`) — implement it to switch the zone.
  The existing v2 fusion code may stay (keep emitting `zoneCombo` + `combat.discover(id)`); `reactObject` does **not** emit `zoneCombo`.
- `api.terrain.ignite(point, r)` is used by overload / magma / wildfire / burgeon.
- Archetypes: pass **unscaled** base amounts and set `hit.tier` (`'light'|'heavy'|'crit'|'ult'`), `hit.skillId`, `hit.charged`, `hit.finisher`, `hit.castMul`
  (resonance `nextMul`) — combat applies power/mastery/stats/crit. `hit.status = {id: seconds}` or `{id: {dur, stacks}}`.
- Never call `vfx.hitFeel`, `game.hitstop` or `vfx.shake` per hit; for presentation use `vfx.preset('impact_<el>' | 'explosion_<el>')`, `telegraph`, `runeCircle`.

## melee (sword)
- Stop calling `game.hitstop` on hits (combat's `hitFeel` is the single source). Set `hit.tier` on every hit, `hit.hitstopMul` from the weapon profile, `tags:['melee']`
  (melee hits are exempt from the 0.12 s volley limit), `hit.hitstop` only for rare overrides. Parries: emit `blocked {parried:true, source}` (combat adds +15 break).
- Smears: `vfx.smear(profile.smear, tipPos, quat, scale, element)` on the strike frame(s).

## player
- Keep returning the block result (`{cancel|mul|parried|perfect|dodged|reflect}`) from `entity.onBeforeDamage(hit)`; snapshot `hpBefore` there (combat calls it once, step 2).
- **Remove the `dmgTakenMul` refund at player.js:204** — combat now applies `× stats.dmgTakenMul` (and `difficulty.dmgMul`) to enemy → player damage (§8.3);
  keeping the refund applies it twice.
- Regen must heal through `combat.healPlayer(amount, 'regen', {hot:true})` (boss HoT cap). Optional `player.addShield(amount, seconds)` lets the crystallize
  fallback grant its 12 % shield.
- combat-owned timed stats sources: `rx:grounded {lightningResist}`, `rx:aurora {atkMul}`, `rx:crystal {<el>Dmg}`, `rx:resonance`.

## skills
- Shadowblade Lv10 "backstab ×1.3": set the stats key `backstabMul: 1.3` (combat multiplies backstabs by `max(1, stats.backstabMul)`).
- light `p2` "any light hit can judge": set the flag key `judgmentAnyLight: true`; `progression.judgmentThreshold()` gives the stack threshold.
- Consume `rx:resonance` on the next cast (`stats.consume('freeNext')`) and pass `hit.castMul = stats.get('nextMul')`.
- Shadowblade marks: combat registers `marked` (max 5, 6 s) — `applyStatus(t, 'marked', 6, {stacks:1, source:'player'})`; combat renders the mark pips.

## enemies
- Bosses/elites: set `breakMax` (combat initialises `breakValue`), optional `onBreak()`, numeric `voidShield`, `isVoid` (purify ×2), `isFinalBoss` (full 4 s break).
  Use `vfx.telegraph(...)` (decal radius = hitbox radius), `vfx.dissolve(entity, {onDone})` on death, and implement `entity.hitPop(dir, tier)` for the S2 hit pose.
- Do **not** fold `difficulty.dmgMul` into `e.zoneDmgMul` — combat multiplies both (§8.3).
- `enemies/base.js` dizzy stars are 4 sprites per entity (4 draw calls each while stunned/dizzy; 12 dizzy dummies = 48 calls). combat already draws instanced
  stun/break stars for every stunned/broken entity (1 call total) — please drop the per-entity sprites (or skip them when `statuses.stunned|broken` is set).
- `kill` now carries `xp: target.xpValue` and `zoneLevel`.

## ui
- Status pips: `combat.STATUS_DEFS[id].{nameKo, color}`, stacks from `statuses[id].stacks`, `voidShield` as a pseudo-pip; break gauge from `breakMax/breakValue`
  and `combat.isBroken(t)`. "다음 타격": `combat.previewReaction(target, skills.attuned)` (≤ 10 Hz) → `{id, nameKo, family}`; family colours in `combat.FAMILIES`.
- `reaction` payloads carry `family` and `variant`; `break` and `resonance` also arrive as `reaction` events with `elements:['physical','physical']` (render a neutral icon).

## narrative (audio)
- `reaction` events carry `family` for the family-based `rx_<id>` fallback; `break`, `breakRecover`, `resonance`, `voidShieldBroken`, `heal` are emitted by combat.
- combat no longer plays the generic `reaction` sfx itself (audio already listens to `reaction`).

## core (integration)
- `tools/playtest.js` "reaction coverage" lists the 30 new ids as never triggered in legacy mode (expected: they need v3 elements/objects; `tools/playtest3.js combat`
  covers them). All 19 legacy reactions and 9 fusions still trigger through the legacy spells.
