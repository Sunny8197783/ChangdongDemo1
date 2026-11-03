# combat — module notes (v3)

Owner: **combat** (combat + all VFX). Files: `src/combat.js`, `src/combat/{statuses,reactions,pipeline,break,resonance,statusfx,fxassets}.js`,
`src/vfx.js`, `src/vfx/{feel,presets2,telegraph,dissolve,runes}.js` (+ the existing `particles, ground, beam, trail, debris, presets, textures`),
`tools/playtest3/combat.js`. (Smears and wind lines live in `vfx/runes.js`.)

## Combat (`game.combat`)
- `combat.js` assembles the parts and keeps the v2 surface: `register/unregister`, `dealDamage`, `applyStatus/hasStatus/clearStatus`,
  `canAct/speedMul`, `queryRadius/raycastEntities/getCenter`, `discover`, `REACTIONS` (codex: 49 unique ids, the old 19 first in order), `FOES`, `isFoe`, `isPlayerSource`, `_warm(group)`.
- New: `REACTION_DEFS`, `STATUS_DEFS`, `FAMILIES`, `BY_TRIGGER`, `BY_OBJECT`, `P0_IDS`/`P1_IDS`, `statusInfo(id)`, `stacksOf(t, id)`, `canMove(e)`, `isAura(t, id)`,
  `previewReaction(t, el)` (no side effects; returns a reused `{id, nameKo, family}`), `reactObject(obj, el, hit)`, `debugReact(id, t)`,
  `addBreak(t, n)`, `isBroken(t)`, `drainShield(t, n)`, `healPlayer(amount, source, {hot})`, `registerAlly/unregisterAlly`, `allies`,
  `registerObject/unregisterObject` (combat-side reactive objects when `spells.api.objects` is absent — tests and fallbacks), `resonance`, `lastFormula` (debug), `prewarm()`.
- `init()` listens to `blocked {parried}` (+15 break on the parried attacker) and `stateChange` (title → reset queues).

### statuses.js
- `STATUS_DEFS` = CONTRACT §8.1 table (Korean names) + reaction-owned `necroflame`, `broken`, `cursedMist`. `shocked` carries `element:'lightning'` (needed for the matrix).
- `applyStatus(t, name, seconds, extra={stacks, source, power, el})` (signature kept). Stacks via `extra.stacks` (default 1 per hit = buildup), capped by
  `stack.max` + `stats.get(maxStat)` for player sources. `chilled` → `frozen` at 6 stacks − `stats.chillToFreezeAdd`. `st.el` tags the element (defaults to the
  def's element); `st.power` = power snapshot (DoT ticks use it as `hit.powerSnap`). Boss rules: `bossMul` duration, `bossImmune` (rooted → +40 break).
  `burnImmune` / `blightImmune` flags on the player. v2 DR immunity windows kept.
- Aura = def with `element` (or `aura:true` for `airborne`, `auraAs:'chilled'` for `frozen`) and an element-tagged `st.el`. `stunned` is `aura:false`.
- `t.auraOrder` ring (≤ 8, newest first) is updated on apply/refresh and on removal.
- Per-frame tick: DoTs (`burning` 6/0.5 s, holy ×1.5; `seeded` 2×stacks/1 s nature; `necroflame` 10/0.5 s, 30 % heals the player; `shocked` 3/0.9 s + micro-stun),
  burning contact spread, dummy refill. `takenMul(t, el)` = exposed ×1.3, hexed ×1.2, broken ×1.5, corroded +5 %/stack, radiant +3 %/stack (light).

### reactions.js
- `REACTION_DEFS`: all 49 ids of DESIGN §4.3 (variants share an id; every entry has `family`, `p`, Korean `nameKo`/`desc`, `match`, `mult`, `consume`, `apply`, `opposite`).
  P0 = 35, P1 = 14. `BY_TRIGGER[el][auraKey]` and `BY_OBJECT[kind][el]` are built at load (no per-hit scans). Judgment is not indexed (own fallback rule).
- `react(t, el, hit, point)`: `hit.object` → `reactObject`; else walk `auraOrder` newest first (frozen counts as chilled; the frozen cell wins), first entry not on
  the 1 s per-target cd (`t._rxT`); then the judgment fallback (radiant ≥ `progression.judgmentThreshold()` clamped 3..5, heavy/charged/finisher tag, or any light
  hit with `stats.judgmentAnyLight`; own cd 6 s / boss 12 s; consumes all stacks; 8 % maxHp / boss 3 % capped at 400 × power; +40 break / boss +20; dazzled 2 s).
- On fire: consume (상극 always removes the aura incl. stacks) → apply statuses → `HANDLERS[id](ctx)` → emit `reaction {id, name, point, target, elements, variant, family}`
  → `vfx.preset('rx_<id>')` (never `hitFeel`; the hit's tier becomes `'reaction'`) → resonance tracking.
- Objects/zones: `reactObject(obj, el, hit)` with `obj.kind|type` ∈ pod, crystal, pillar, water, ice, tornado, lava, fire, blight, steam, rubble, or any `isZone` with
  `element` (→ infusion). Calls `obj.onReact?.(id, el)` (pods/crystals) and `obj.convert?.(to)` (zone conversions) — the zone owner keeps the zone logic.
  Does **not** emit `zoneCombo` (spells keeps emitting it for its own fusions).
- Cascade queue: pooled records, stagger 0.08–0.12 s, ≤ 3 cascade items per frame (pod → pod, electrocute/blackbolt chains, hyperbloom bolts, eclipse burst, judgment pillar).
- Fallbacks when magic's objects/zones are missing: timed **fields** (pool 16) implement fallback seed pods, sunflower turret, healing spring, sanctify HoT,
  frost flower, thorn ring, sandstorm, cursed mist, void rift. Crystal fallback = 6 s `rx:crystal {<el>Dmg:1.2}` (+ `player.addShield?.()`).
  Reaction-spawned zones are merged (same type within its radius in 3 s → skipped; ≤ 3 alive per type).

### pipeline.js (`dealDamage`) — the canonical formula (CONTRACT §8.3), the ONLY place player damage is scaled
`final = base × power (DoT: hit.powerSnap) × progression.damageMul(el) × stats.atkMul × stats.elementDmg(el) × hit.castMul × takenMul(target) [× stats.backstabMul
when hit.backstab] + quickened flat 25×power (lightning/nature) × reaction (mult × stats.reactionDmg(id, family); secondary reaction hits use hit.rxId) × resist × crit`.
Crit chance = `derived().crit + stats.critChance`, mul = `derived().critMul`; never for DoT/zone ticks, props or `hit.noCrit`. `hit.fixed` skips scaling (judgment %HP).
Enemy sources: `× source.zoneDmgMul × attacker dealtMul (blight/cursed mist)`, on the player also `× difficulty.dmgMul × stats.dmgTakenMul × (1 − lightningResist)`.
Order: invulnerable → `onBeforeDamage` (also the block hook: `{cancel|mul|parried|reflect}`) → react → voidShield (×0.3) → formula → asleep wake ×1.5 → HP →
lifesteal (`hit.lifesteal + stats.lifesteal + corroded 1 %/stack`) → break → awakening → statuses (`hit.status` = seconds or `{dur, stacks}`) → knockback →
**hitFeel** (single caller; tier = max(hit.tier | inferred, reaction, crit); DoT/zone ticks only flash) → `damage` event (+`tier`, `skillId`) → onHit/onDeath
(boss kill → `timeScale.set('bossDeath', 0.25, 0.8)`; `kill` gains `xp`, `zoneLevel`).
`healPlayer(amount, source, {hot})`: × `stats.healMul`; in boss fights (boss alive within 75 m) HoT goes through a 5 % maxHp/s token bucket; burst heals uncapped;
emits `heal {target, amount, source}` (HoT reuses one payload object).

### break.js / resonance.js
- Break: `breakMax`/`breakValue`; hit drain `poise (default dmg×0.5) × (earth/lightning 1.5) × (reaction 3) × (encrusted 1.2) × stats.poiseMul`, parry +15, rooted-on-boss +40.
  At 0: `broken` 4 s (mid-boss 3 s), `onBreak()`, `timeScale.set('break', 0.05, 0.25)`, hitFeel('break'), `break {target}` + `reaction {id:'break'}`; refill after 6 s → `breakRecover`.
- Void shield: numeric `entity.voidShield`; ×0.3 while > 0; drain poise × (light 4 | reaction 2 | 1); break empties it; `voidShieldBroken {target}`; a light hit on a
  shielded target fires 정화 (variant `shield`).
- Resonance: 3 distinct reaction ids on one target within 6 s → `resonance {target, ids}`, `reaction {id:'resonance'}`, `stats.set('rx:resonance', {freeNext, nextMul:1.3}, {duration:8})`; ICD 10 s.

### statusfx.js (status visuals)
Global InstancedMesh batches (≈ 1 draw call per kind regardless of enemy count): tint shell (per-instance colour, `setColorAt` at construction), flames
(normal/holy/necro), frozen ice block + spikes (+ instanced outlines), stun/break stars, encrusted rock chips, rooted vine ring. Particles: drips, mud, frost,
seed spores, corrosion smoke (normal-blended), dazzle sparkles, sleep bubbles, and **stack pips** (orbiting motes, count = stacks, for radiant/corroded/seeded/
marked/chilled). Shocked arcs share a 14/s budget. `fxassets.js` holds combat's own copies of the shared shaders (no static import of `spells/*`, rule 7).

## VFX (`game.vfx`)
- `hitFeel(tier, pos, dir, el, opts)` (`vfx/feel.js`): the DESIGN §9 S1 table (hitstop / trauma / FOV / screen flash / particle scale / entity flash), kill +0.04 s,
  0.12 s volley rate limit (melee, kills and player hurt always freeze), `game.hitstop` keeps the 3–4 frame minimum, trauma max-per-frame × `settings.screenShake`,
  ult/break → `game.post.pulse`, player hurt → red vignette (no shake), `target.hitPop?.(dir, tier)` hook for the S2 hit-pose pop. `feelStats` / `resetFeelStats()` for tests.
- `preset(id, pos, {reduced, dir, scale, elements, colorEl, family})` (`vfx/presets2.js`): `impact_<el>` / `explosion_<el>` for 9 elements + void (water arcs &
  droplets, nature petals & thorns, light pillars & rune, shadow inward pull + dark core + ravens), `rx_<id>` for all 49 = one parametric recipe per family
  (burst, control, spread, surface, blessing, curse, universal) × the two element ramps + the trigger's signature shape, plus bespoke S6 signatures
  (evaporate, superconduct, wildfire, sanctify, necroflame, prism, judgment, shatter, magma, eclipse, resonance, break). ≤ 4 full presets per frame, the rest reduced
  (¼ particles, no decal). `presetStats()` / `resetPresetStats()`.
- `telegraph({shape:'circle'|'ring'|'cone'|'line', pos, dir, r|len|width|angle|inner, dur, color:'damage'|'void'|'grab'|hex, parryable, onDone})` → `{alive, progress,
  timeLeft, stop, setPos, setDir}`; pool 8; terrain-conforming; decal radius = hitbox radius; fill grows centre → edge; gold rim + golden glint 0.15 s before the end.
- `dissolve(entity|mesh, {dur=0.9, color, embers, stagger, onDone})` clones toon materials once (same `'toonRim+dis'` program) and animates the clones' `uDissolve`;
  outlines hide at 35 %, other meshes at 60 %; bosses dissolve part by part; 15 embers/s. `undissolve(entity)` restores.
- `runeCircle(pos, {element, r, dur, rotSpeed})` pool 6; `smear('arc'|'wide'|'twin', origin, quat, scale, element)` pool 4; `groundDecal(kind, pos, r, life)` with
  kinds crack, scorch, frost, lichtenberg, ripple, flowers, rune, violet; `windLines(on, intensity)`.
- Atlas: 8×8 at 128 px (1024²), `FRAMES` name map only (new: rune, petal, droplet, feather, bubble, wisp, thorn, raven; `dust` aliases puff). `burst({inward:true})`
  spawns on a shell and travels to the centre.
- **No new lights:** `flash()` = emissive flare sprite (`flashSprite`); the 3 pooled point lights stay in the scene and only pulse on `effectQuality:'high'`.
- Shake: 3-octave value noise on pitch/yaw (≤ 2°) and roll (≤ 2.5°), trauma², plus the directional kick.
- Quality gating: rings/domes/decals/beams use an effective pool of 100 % (high) / 60 % (medium) / 30 % (low) of their caps (oldest recycled).
- `prewarm()` / `warmup()` return hidden instances of the lazily used materials; telegraph/rune/smear/status meshes live hidden in the scene from boot (programs +7 vs v2, all at boot).
- `stats()` adds `particles`, `telegraphs`, `runes`, `dissolves`.

## Tests
`node tools/playtest3.js combat` — registry shape (49 / 35 / 14), Korean data, rule 7/8/9 greps, DESIGN §15 balance sim, `debug.react` for all 49 ids, natural
triggers for the 35 P0 ids, the §4.5 priority worked example, the judgment cooldown, the 16-pod chain (≤ 3 cascades/frame, ≤ 4 full presets/frame), the formula
(L1 = 100, stats crit, DoT power snapshot), hitFeel single caller, break/voidShield/resonance, stack schema/caps/상극/boss rules, healPlayer + the boss HoT cap,
VFX (atlas, presets for 9 elements without new lights, telegraph radius, dissolve without compiles, runes/smears/decals/wind), the reaction stress spot
(camp-0 meadow, 12 enemies, pods, puddle, tornado: calls ≤ 350, tris ≤ 900k, programs constant) and the legacy `applyStatus` signature in `path=all` mode.
