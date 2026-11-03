# enemies — module notes (v3, wave 2)

Files: `src/enemies.js`, `src/enemies/{base,common,models,projectiles,loot,golem,bokoblin,shaman,chuchu,dummy}.js` (changed),
NEW `src/enemies/{scaling,threat,encounters,bossbase,models2,lizard,shroom,wolf,wraith,voidknight}.js`,
`src/enemies/bosses/{index,kit,hydra,nox,treant,kalis,nidhoggra,nidhoggra_model}.js`, `tools/playtest3/enemies.js`.

## Module (`game.enemies`, CONTRACT §14)
- `FACTORIES` += `lizard, shroom, wolf, wraith, voidknight`; `spawn(type, pos, {zoneId, level, element, elite, variant, …})`
  (`element` picks the 말랑이 variant: water / nature / light / shadow, plus the classic fire / ice / lightning).
- Renamed (nameKo only, ids unchanged): 말랑이 (chuchu), 뿔도깨비 (bokoblin), 도깨비 주술사 (shaman).
- `scaling(zoneId)` → `{hpMul, dmgMul, level, zoneMin, row, mobXp}` (`scaling.js`, DESIGN §5.3): act1 1/1 (village 1, plains 2,
  ruins 6), first region 1.9/1.5 (L9), second region 2.8/1.9 (L15; via `story.regionOrder`), ascent 3.4/2.2 (L21), plateau 3.6/2.4 (L25).
  HP × `game.difficulty.hpMul`; `zoneDmgMul` is the row only (combat multiplies `difficulty.dmgMul`). `applyScaling` sets
  `zoneId, zoneLevel, zoneMin, zoneDmgMul, xpValue` once per entity (dummies/props 0 XP, level 1).
- XP (DESIGN §5.1): 말랑이 6 · 뿔도깨비 15 · 주술사 25 · Act 2–4 mobs = row mobXp 35/45/60 · elite 90 · golem 600 · hydra 1500 ·
  nox 1500 · treant 2500 · kalis 3000 · nidhoggra 0 (the finale is not an XP source).
- `encounters` (`encounters.js`): `ENCOUNTERS` table per zone (mirwen 4 groups, elderwood 5, ascent 3, plateau none).
  `load(zoneId)` on `zoneEnter`; groups spawn lazily within 70 m, despawn beyond 120 m (respawn fresh later) and 30 s after
  `zoneExit`; ≤ 18 regular enemies alive in total. Cleared groups emit `encounterCleared {zoneId, groupId, left}` and stay cleared
  (`enemies.serialize()` → cleared ids). Act-1 camps stay in `populate()` (unchanged camp → golem flow).
- Threat (`threat.js`): `setTauntTarget(entity|null, dur, range=22)` (enemies in range retarget; bosses within 2× range),
  `clearTauntTarget()`, `getThreatTarget(e)`, `setPlayerStealth(mul|true|false, dur)` (sight × mul; ≤ 0.05 drops aggro),
  `anyAggroWithin(pos, r)` (aggro or `debugAggro`). **Targeting:** `base.js updateEnemy` calls `ctx.retarget(e)` before think, so
  `ctx.playerPos / playerCenter / target` are the enemy's threat target for its whole update (restored to the player after the loop;
  `ctx.realPlayerPos` is always the player). Decoys / clones without HP absorb one hit (`onDecoyHit`).
- `getRunStats()` → `{kills, time, timeSec, maxCombo, reactions, reactionsFound}` (combo = player hits within 2.5 s, reset on hurt).
- `inCombat` (legacy), `getObjective()` → `{phase:'camps'|'boss'|'zone'|'done', zoneId, campsCleared, campsTotal, boss, groupsLeft, camps}`.
- `prewarm()` returns hidden instances of the 5 new mob models + 4 new 말랑이 variants (shared vc toon materials, no new programs).

## Regular enemies (DESIGN §9 A2–A4)
- `base.js`: poise for `poiseMax` entities (hits drain it without interrupting; at 0 a 0.8–1.2 s 붕괴 stagger + a "붕괴!" sprite
  pop + `enemyPoiseBreak`), sight × stealth, the threat retarget hook, the death dissolve through `vfx.dissolve(e, {dur 0.9,
  void-violet edge})` (fallback: the v2 squash), per-entity dizzy stars only for parried/dizzy when v3 combat draws instanced stun stars.
- `common.js integrate`: `amphibious` (wades 1.1 m under the surface in deep water) and `hover` (floating height) flags.
- Telegraphs: `ctx.tele(o)` → `vfx.telegraph` (× difficulty `telegraphMul`), fallback the v2 ring; decal radius = hitbox radius.
- 수렁도마뱀: spear thrust (line), lunge out of the water (circle), lurks half-submerged; water ×0.5.
- 포자 버섯병: kites, lobs spore sacs → lingering spore clouds (`projectiles.cloud`: seeded every 0.8 s inside), cap jiggle; dies in a cloud.
- 타락 늑대: packs of 3 (`pack`/`packSlot`), wheel around the target at 6 m, dart bites (line), quadruped trot/gallop gait, howl.
- 공허 망령: hovers, blinks away through smoke, void bolt (orb + blight); voidShield 60.
- 공허 기사 (elite): guard stance (frontal light hits ×0.35 via `onBeforeDamage {mul}`), shield bash, 3-hit combo (cones),
  parryable overhead slam (circle, gold rim); voidShield 100, breakMax 60, poise 120, `onBreak` → 2 s stagger.
- `projectiles.js`: every orb / boulder / spore asks `world.projectileBlockAt(p)` while temp colliders exist (`'block'` despawns,
  `'reflect'` flips the team and calls `onReflect`); orbs home on the caster's threat target; `opts.status` overrides the element status.
- Golem: `bossDefeated {boss, id:'golem', name, final:false}` (no `victory`), `timeScale.set('bossDeath', 0.25, 1.2)`,
  `bossPhase {phase:2, name:'붉은 핵'}`, extended `bossSpawn` (title 봉인의 수문장).

## Boss framework (`bossbase.js`) and registry
- `enemies.bosses = {register(id, factory), get, has, list, gift}`; bosses come from
  `import('./enemies/bosses/index.js').then(m => m.registerBosses(api))` in `init` (`enemies.bossesReady` is that Promise).
  A missing bosses folder only logs one warning.
- `prewarmBoss(id)`: idempotent Promise; builds the model once (the factory's `prewarm(ctx, arena)` caches a spare model that the next
  spawn takes) and compiles with `renderer.compileAsync` (sync `compile` in test mode). `isPrewarmed(id)`.
- `spawnBoss(id='golem', opts)`: returns the entity at once when prewarmed (or in test mode), otherwise a Promise (cinematic overlay
  fade → prewarm → spawn). Emits the extended `bossSpawn {boss, id, name, title, sub, phases:[{at,name}], parts:[{id,name}], locks}`;
  calls `world.setBossFightLOD(true/false)` for nidhoggra. `despawnBoss()`, `debugDefeat(id?)`, `debugPhase(n)`.
- `createBoss(ctx, cfg)`: HP pool = base × arena-zone row × difficulty; named phases (`phases[i].at`); crossing a threshold sets HP
  to it, invulnerable transition (`cinematic.playPhase` when present outside tests, else `cfg.transition` s), `bossPhase {boss, id,
  phase (1-based), name}`; `cfg.gate(i)` holds the floor until a boss-owned check passes (hydra heads, treant plates, rods, tide).
  `addPart({id, name, hp, bone|worldPos, offset, radius, height, mul (number | fn(el)), shield:{element, counters}, lock:{element,
  counters}, fwd, invulnerable})` → combat-registered `isBossPart` entities forwarding `damage × fwd` to the pool (the killing blow
  goes through `combat.dealDamage`, so `kill` XP fires). Locks: counter hit −poise×1, reaction −poise×2, `stripLock(part, n, 'gift')`;
  `lockStripped {boss, id, partId, lock, by}`. `respawnPhase()` on `playerDeath` (phase-start HP). `canDie()` / `onZero()` route 0 HP
  to special defeats (purify, revive). `defeat()` emits `bossDefeated {boss, id, name, final}` exactly once (`cfg.finale(done)` can
  delay it; 25 s game-time safety net), then a staggered `vfx.dissolve` (fallback `dissolveFx`). `bossCheck {id, kind, duration, state}` via `e.emitCheck`.
- `e.setBodyMul(n | fn(el))` scales damage on the main body (a resist proxy) — the armoured-boss pattern.

## Bosses (CONTRACT §15, DESIGN §8.5–8.6); mid-bosses ≤ 20 calls, nidhoggra ≈ 28
- **hydra** 삼두 물뱀 레비아탄 (Mirwen): 3 heads (parts with element shields water/ice/lightning, DESIGN counters), 6-bone tapering
  necks with a reach table for bites, bite (line), element spit volleys, tidal sweep (ring; safe on ice or a pillar top);
  `waterFrozen` in the arena or ice on the body → a ring of 8 ice discs for 10 s (`world.surface.freezeWater`); severed heads swap the
  survivors' elements (+20 % speed); phase 2 「심연의 몸통」 (all heads severed): the body rises, water spouts.
- **nox** 녹스 (Elderwood glade): voidShield 100 (re-forms 12 s after it breaks), teleport-slash (raven smoke, violet parryable line;
  a parry staggers 2 s), raven volley, shadow wave; phase 2 at 50 % spawns 녹스의 분신 (teleport-slashes only); 0 HP → 정화 (kneel,
  gold light, a `kill` event for the XP, then `bossDefeated`). `debugDefeat` runs the fast purify.
- **treant** 모르그로스 (hollow): 4 bark plates (fire ×1.6, else ×0.25; the body ×0.4 while any plate stands), explosive spore pods
  (instanced, any hit ignites them → a fire burst scorching plates within 6.5 m), stomp / arm sweep / root lines; phase 2 kneel with
  the heart (×2.5) in 8 s windows; phase 3 root storm (5-line fans, more pods, `spells.api.objects.spawn('pod')` if present).
- **kalis** 칼리스 (ledge): mirrors the class kit (`CLASS_DEFS` family / dodge / defend) and the 2 most-invested elements
  (`progression.pointsIn`): element bolt volleys, element burst, slash (melee kits), a dodge after 3 quick hits, guard windows
  (`counter` kits strike back); 0 HP → revives once at 50 % (「거울은 깨지지 않는다」, `bossPhase 2`), mirror light beams, a 10 s stagger
  check (`bossCheck stagger`) before 「거울 붕괴」 (45 % maxHp, never lethal). The model glow is tinted by the copied elements.
- **nidhoggra** 니드호그라 (plateau; `nidhoggra_model.js`): 24 instanced spine segments on a Catmull-Rom curve (+ instanced outline and
  crack glow), head/jaw/eye ring, 2 forelimbs (2-bone solve), void-mist wings, 5 instanced oath shards, heart, instanced rods.
  All damage goes through parts: phase 1 head plate (5 locks rotating every 20 s, the player's counters first; stripped ×1.5),
  claw slam (parryable; the head sags for a 2.6 s melee window), breath sweep (pillars block it), 3 wraith minions every 30 s,
  the 66 % rods check (3 rods + a player `lightning.rod`, or a parried breath → 6 s stagger → phase 2; failure 40 % maxHp, never lethal).
  Phase 2 coil past the 5 pillars: one shard every 15 s beside a pillar top for 10 s (ranged ×0.7 from below); a shard buff only when its
  lock was stripped by a counter/reaction and no gift (stats sources `boss:nidhoggra_<el>`); 33 % tide check (12 s break; failure =
  25 % knock-down + retry). Phase 3 = **cut line 3**: the heart opens on the plateau (×2.5, 20 s open / 8 s closed), V = 루미엘의 창
  (3 charges, 5 s recharge). The final blow → `cinematic.playFinale(onDone)` (fallback: immediate) → `bossDefeated {final:true}`.
  `NIDHOGGRA_LOCKS`, `SHARD_BUFFS`, `lockCoverage(cls, phase, primaryOnly)`, `lockCoverageTable()` are exported data.
- Gift (`enemies.bosses.gift`): `{ready, charges, element, purpose:'lock'|'spear', use()}`; `giftReady` / `giftUsed {element, purpose}`.

## Tests
`node tools/playtest3.js enemies` — rules 7/8/9 greps, new/renamed mobs (names, HP × row, XP, voidShield/break, variants), scaling rows +
second region + difficulty, taunt retarget, stealth, anyAggroWithin (+ debugAggro), run stats, projectile blocking by a temp collider,
golem (`bossDefeated` final:false, no victory), encounters (lazy spawn, ≤ 18, despawn > 120 m), the lock table (every class ≥ 4/5
per phase, primaries ≥ 2), and per boss `&boss=<id>`: prewarm first + idempotent, Korean names, draw-call budget, `debugPhase(2)`,
programs constant after spawn + phase change, calls/tris caps, `debugDefeat` → exactly one `bossDefeated {id, final}`, removal;
nidhoggra mechanics (plate lock, gift 50 %, counter strip, rods success, the phase-2 shard window, tide success, heart + spear gift).

## Not done (P1 slips, each with a working fallback)
- Nidhoggra phase 3 sky rings / eye clusters / meteors → cut line 3 (the heart opens after the phase-2 check).
- Treant climbable arm ramps (the kneel brings the heart within reach instead); Kalis prism reflection of mirror beams (beams are
  dodge-only; his bolts are parry-reflectable through the existing orb reflect); bespoke boss voice lines (sfx names only).
