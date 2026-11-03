# magic — module notes (v3, wave 2)

Files: `src/spells.js` (factory), `src/spells/{api,archetypes,bespoke,objects,zones2,summons,meshes2}.js` (new), and the v2 files
`src/spells/{assets,defs,master,projectiles,props,setpieces,zones}.js` (kept; `master.js` and `projectiles.js` edited). `tools/playtest3/magic.js`.
Static imports: own files, `src/core/*`, `three` / `three/addons/*` only (rule 7). No class literals (`familyOf`), no 5-element
assumptions in v3 code (`ALL_ELEMENTS`); `AWAKENED/SUPPORTS/FINISHERS` and `SPELLS` stay CLASSIC-only, nothing indexes `SPELLS['water_basic']`.

## spells.js (CONTRACT §11)
- `castById(spellId, {free, charge, aim, awakened})`: runs a legacy def (`<classic el>_basic|heavy|ultimate|awakened|support|finisher`)
  with gating bypassed (skills gated it) and the exact id (no master remap); emits `spellCast` exactly once. Unknown ids (new elements) → `false`.
- `setElement(i | elementId, {silent, force} | true)`: `silent` (skills.attune) = no event, no sfx, no gating. In the v3 keymap a
  non-silent call forwards to `skills.attune` (single `elementChanged` emitter). `elements` = CLASSIC in the legacy keymap, all 9 in v3.
- Input is read only when `legacyInput()` = legacy keymap (`path=`) **or** skills missing/stubbed (rule-11 fallback), and never when
  `game.skills.ownsInput === true`. `isActive()` = that && caster-family class. F casts the legacy ultimate only in the legacy keymap and only
  when `game.interact.current()` is null (the `story.hasPrompt` check is gone).
- Time scale: ultimates and the finisher fallback use `game.timeScale.set('ult', …)` (the slowmo shim only if timeScale is missing).
- `classChosen` (and deprecated `pathChosen`) reset the legacy element silently in v3; `respec` despawns summons; `title` clears all v3 objects.
- `getHudState()` keeps the v2 shape (legacy); slots without a legacy def render blank.
- Buffs (`master.js`): legacy supports write `game.stats.set('buff:<el>.sup', mods, {duration})` (doubleJump → `extraJumps`; lightning adds
  `castSpeed 1.6` / `chainBonus 2`) and `stats.clear` on stop; the `player.mods` save/restore is deleted.
- `prewarm()` (main.js boot compile) makes every pooled v3 mesh visible for the compile; the first `update` hides idle ones (0 draw calls idle).
- Extra API: `api`, `despawnSummon(skillId)`, `registered {archetypes, impls}`, `isActive()`.

## game.spells.api (`spells/api.js`)
- `projectiles.spawn(opts)`: v2 opts + `mesh` `'arrow'|'wisp'|'thorn'|'bubble'|'shadowbolt'|'raven'|'orb'|'glance'|'spear'|'lance'` (+ v2 meshes),
  `hit` (ctx.hit template: skillId/slot/tier/castMul), `tier`, `bounce`, `tint`, `onExpire`, `objects:false`, `blockable:false`. Element tints are
  uniform/material colours only (`meshes2.js` `userData.tints`). Infusion is generic over `ELEMENT_DEFS` (`STATUS_OF`, `elColor`, `shapes`).
  Projectiles query `world.projectileBlockAt` (block / reflect) and collide with pods / crystals / ice flowers (→ `objects.burst`).
- `zones.spawn(type, pos, opts)`: `fire|ice|lava|water|storm|tornado` (+ `vortex` alias) go to the v2 `zones.js` (adopted as reaction objects:
  `isZone/kind/position/convert`); the v3 types live in `zones2.js`: `mud, holy, miasma, spore, overgrowth, flood, spring, sand, steam, whirl,
  rain (follows), roots (instant entangle), blackhole, updraft (world.addUpdraft), lane (ice road / tailwind / frost; strip mesh), grove (thorn grove)`.
  `isInside(type, pos)`, `list` (v2+v3, one reused array), `elementAt(point, r, el, hit)` = `touch`, `chargeWater(pos, r)`, `TYPES`.
  Opts: `{r|radius, dur|duration, hit, params (skill params), follow, dir, len, width, laneKind, source}`.
  Twists: fire turns spore/grove/overgrowth into a wildfire (+ a v2 fire zone, grass ignite); lightning electrifies flood/spring water; water-kind
  zones (flood/spring/whirl) and v2 water/lava call `combat.reactObject` for ice/light/earth/water; shadow on steam → miasma (combat); holy
  heals/dispels and is read by player regen through `isInside('holy')`; flood sets `zone:flood` rx_ multipliers (+40% lightning/ice reactions).
- `objects` (`objects.js`): `spawn(kind, pos, opts)`, `near(kind|'*', pos, r, out)`, `burst(obj, el, hit)`, `despawnAll`, `count`, `meshes`.
  Pools (hard caps, recycle oldest): pod 16 (cap 10 + `podCapAdd`), crystal 8, mine 6, droplet 12, soul 8, flower 4, turret 2, rod 4 — one
  InstancedMesh per kind with instance colours set at construction. Pods: combat reactions via `reactObject` → `onReact` despawns
  (nature.rx re-seeds a mini pod); expiry pops (30 nature r 3, heal 3%). Crystals: pickup = shield 12% maxHp 6 s (+50% with earth.rx) and
  `buff:crystal` `<el>Dmg ×1.2`; prism relay. Souls: +15 MP/stamina/resolve, +5% HP. Droplets: ground pickup or `orbit` (water.p2, max 3).
  Mines: arm 0.5 s, trigger r, `chainTrigger` (m1a) through combat's stagger queue, `pull` (m1b), charge puddles. Flowers: chill pulse,
  earth/heavy hit shatters. Turrets: light bolts 12 / 0.6 s. Rods: charge water within r every 1.2 s, extend chains (+1 hop).
- `aoe(c, r, hitSpec, opts)`, `cone(o, dir, len, angleDeg, hitSpec)`, `line(a, b, width, hitSpec, {seen})`, `chain(from, n, range, hitSpec, {wetRange})`
  (routes through rods), `beam({origin, dir, len, width, dur, tick, hitSpec, prism, follow, onTick})` — prism refracts at registered relays
  (ice pillars, glacier, mirror, beacon, light pillar), crystals (combat `prism` reaction) and frozen enemies, ≤ 3 segments, toward the nearest enemy.
  `hitSpec` is a template (cloned per target) or `fn(e, d)`. Every area helper also `touch`es objects/zones with its element.
- `terrain`: v2 `ignite/extinguish/chill/soak/wind` + `bless/curse/overgrow/rubble/mud/meltIce/regrow/apply(el, pos, r)` (world.surface2, guarded).
- `nearestEnemy, aim, blockAt, shield(amount, dur, el)` (uses `player.addShield` if present, else an absorb refund on `damage`), `addRelay/removeRelay`,
  `summons`, `structures`, `archetypes`, `despawnSummon`.

## Archetypes (`spells/archetypes.js`, CONTRACT §7.3 caster half)
All 24 are registered with `game.archetypes.registerArchetype(name, 'caster', fn)` in the spells factory. Each reads `ctx.params` only, builds hits
with `ctx.hit()` (unscaled base; `hit.tier` from skills) and performs its DESIGN §13.1 twist. Style: bow → arrows from the nock, totem → wisps,
melee fallback (hammer r×1.2 v×0.85, daggers r×0.85 v×1.25). Highlights:
projectile (orb zaps, spear → light pillar relay + blessed ground, `split`, `firstRadiant`) · volley (bouncing bubbles, ravens: sight loss + carried
miasma) · lob (ballistic; ember ignites grass/rot walls/props; seed bomb plants pods) · crawler (fire line zones, spike eruptions + rubble, rolling
boulder, fan/ring modifiers, end burst) · beam (follows the aim = sweepable, prism, multi-beam) · cone (gust reflects enemy projectiles, wave puddles,
tailwind lane, reaper execute) · nova (multi-ring, second ring, heal per hit, frost ground, frost coat) · zone (self/aim placement, vortex +
updraft, whirl, roots) · wall (rock wall collider + reflect / collapse, thorn grove colliders) · pillar (ice pillar platform + relay + bridge /
shards, glacier drop platform, stepping stones, colossus fist (break, rot walls, fissure, second fist), smite, geyser) · chain · rain (ring,
waves, scatter, sky strikes) · summon (treant/totem/clone/beacon/mirror/rod) · blink (path damage, behind-target, afterimages, shade copies,
return knot) · dash (phoenix ignite/melt + end burst + return pass, wind step rider, water surf puddles + water platforms) · leapslam
(electrify water, follow bolts, static field, tornado landing, stamina refund) · grapple (pull a small target / pull yourself) · buff (stats
source + aura emitter + riders, aegis shield + dome collider, lifebloom HoT + bloom, shade/stealth) · mark (prison spikes, hex jump/heal) ·
chainbind (tethers, yank, life chains) · tether (soul drain lifesteal + MP/s, water whip lashes/pull/freeze, extinguish) · lane · mine · bubble.
I-frames: `player.grantIframes(t)` if present, else `entity.invulnerable` with a self-owned timer.

## Bespoke (`spells/bespoke.js`, `registerImpl(id, 'caster', fn)`)
`water.ult` 대홍수 (flood zone + waves), `water.awakened` 대해일 (3 rolling tsunami lines, 30 s puddles), `nature.ult` 세계수의 분노 (ring of roots),
`nature.awakened` 세계수 강림 (sapling + overgrowth zone that roots/seeds/heals), `light.ult` 새벽의 심판 (sweeping prism beam), `light.awakened`
아스트라의 빛 (3 beams + sky lances), `shadow.ult` 어둠의 심연 / `shadow.awakened` 영겁의 밤 (black holes), `nature.treant` (summon), the redesigned
`ice.sup` 서리 반격 (buff; skills' rider freezes attackers) and `earth.sup` 도발의 석상 (taunt totem), and the finishers `water|nature|light|shadow.finisher`
through `game.cinematic.finisher({element, cls, name, target, center, onImpact, onEnd})` with a non-cinematic slow-mo fallback and safety nets.
All ultimates share `ultIntro` (timeScale 'ult', FOV kick, post pulse, sigils).

## Summons & structures (`spells/summons.js`)
Pooled models built once (treant 1, totem 1, clone 2, beacon 2, mirror 2, light pillar 2), ≤ 4 alive, no shadows. Allies register with
`combat.registerAlly` (team 'player') and taunt via `enemies.setTauntTarget` (feature-detected). The treant walks to the nearest enemy and slams
after a wind-up; the totem's collider blocks projectiles and it erupts on death/expiry; the clone wets its attackers and bursts; the mirror reflects
3 enemy projectiles; the beacon reveals stealth/void, drains void shields and purifies blight; the light pillar is a relay + holy ground.
Structures: rock/ice eruptor pillars (S.props, instanced), glacier (2) and colossus fist (2) meshes, `world.addPlatform` / `addTempCollider`
handles cleaned up on expiry.

## Perf
No new lights; every new material is compiled at boot (`prewarm` + the v2 warmup; programs stay at 140 through the full cast sweeps);
per-element tints are uniforms / instance colours; a zone is 1 draw call (+ pooled particles); objects are 1 call per kind; all pools are hard
caps. Area queries reuse arrays; hit objects are allocated per hit (event time), not per frame.

## Tests (`tools/playtest3/magic.js`)
Class-literal grep; registration (24 archetypes + 13 impls); STATUS_OF; v3 input gating (LMB/F); silent setter; castById single emission;
stats buff conversion; every zone type and object kind spawns and expires; pod cap; pod + fire → combat reaction; prism refraction; CONTRACT §21
check 5 for mage/ranger/spiritcaller (endgame + showcase, one skillCast/spellCast, no generic fallback, no console errors); legacy keymap.
