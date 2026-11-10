# Arcane Wilds — Architecture & Module Contract

A 3D third-person wizard action game in the style of *Zelda: Breath of the Wild*
(cel-shaded, painterly sky, wind-swept grass, soft saturated colors). Plain ES modules,
no build step. Three.js r160 is vendored at `vendor/three/` and resolved through the
import map in `index.html`:

```js
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
```

Run locally: `python3 -m http.server 8080` in the project root, open
`http://localhost:8080/`. Add `?test=1` to auto-start without pointer lock (for automated tests).

**UI language is Korean.** All player-facing text (spell names, HUD, menus, reaction
names) is Korean. Code/comments in English.

## Files and ownership

| File | Owner | Exports |
|---|---|---|
| `index.html` | core | import map, `#app` canvas container, `#ui` overlay root |
| `src/main.js` | core | bootstraps `game`, loop, renderer, composer |
| `src/core/events.js` | core | `class Emitter` |
| `src/core/input.js` | core | `class Input` |
| `src/core/utils.js` | core | toon materials, outlines, math helpers |
| `src/world.js` | world | `createWorld(game)` |
| `src/player.js` | player | `createPlayer(game)` |
| `src/vfx.js` | vfx | `createVFX(game)` |
| `src/combat.js` | spells | `createCombat(game)` |
| `src/spells.js` | spells | `createSpells(game)` |
| `src/enemies.js` | enemies | `createEnemies(game)` |
| `src/ui.js` + `src/ui.css` | ui | `createUI(game)` |
| `src/audio.js` | audio | `createAudio(game)` |

A module may split its code into helper files under `src/<module>/…`, but must keep
the factory export in the file listed above. **Never edit another owner's file**; if
you need something from another module, use only the contract below.

## The `game` object (created in main.js)

```js
game = {
  THREE, renderer, scene, camera, composer, bloomPass,
  events,          // Emitter
  input,           // Input
  state,           // 'title' | 'playing' | 'paused' | 'dead' | 'victory'
  time,            // scaled gameplay seconds since start (affected by hitstop/slowmo)
  realTime,        // unscaled seconds
  entities,        // array of all combat entities (managed by combat.register/unregister)
  world, player, vfx, combat, spells, enemies, ui, audio,   // module instances
  hitstop(seconds),          // freeze gameplay briefly (max of pending requests is kept)
  slowmo(scale, seconds),    // temporary time scale, e.g. slowmo(0.25, 0.6) on boss kill
  start(), pause(), resume(), restart(),
  isTest,          // true when ?test=1
}
```

### Creation order (main.js)
`world → vfx → combat → audio → player → spells → enemies → ui`.
Factories may store `game` and read other modules lazily at update time; at creation
time only modules earlier in the order are guaranteed to exist. After all are created,
main calls `module.init?.()` on every module in the same order — do cross-module wiring
(event subscriptions to other modules, reading `game.world.camps`, etc.) there.

### Frame order
```
input.update()
if state === 'playing':           dt = gameplay dt (0 during hitstop, scaled by slowmo), capped 1/20
  player.update(dt, realDt)       // movement, sets camera transform from scratch each frame
  spells.update(dt, realDt)       // casting input, projectiles, zones
  enemies.update(dt, realDt)
  combat.update(dt, realDt)       // statuses, DoT
world.update(dt, realDt)          // always (wind, water, sky); dt may be 0
vfx.update(dt, realDt)            // particles; applies camera shake ON TOP of player's camera
ui.update(dt, realDt)
audio.update(dt, realDt)
composer.render()
input.endFrame()
```
Every module object returned by a factory must have `update(dt, realDt)` (may be a no-op).
In non-playing states only world/vfx/ui/audio are updated (dt = 0 for world/vfx when
paused; ui/audio get realDt).

## Coordinates & world
Y up, meters. Playable valley ≈ 320 × 320 m centered at origin, ringed by mountains.
Player spawns in the south (+Z is south, i.e. spawn ≈ (0, h, 120)), boss arena in the
north (≈ (0, h, -120)).

## Core helpers (`src/core/utils.js`)
- `getGradientMap(steps=3)` → shared `THREE.DataTexture` toon ramp.
- `toonMat(color, opts={})` → `MeshToonMaterial` (gradientMap set). opts: `emissive`,
  `emissiveIntensity`, `transparent`, `opacity`, `side`, `vertexColors`, `map`.
- `addOutline(mesh, thickness=0.03, color=0x1a1410)` → inverted-hull outline child
  (BackSide, scaled normals in shader). Returns outline mesh. Skinned meshes not supported.
- `clamp, lerp, invLerp, smoothstep, damp(a,b,lambda,dt), dampAngle, rand(min,max),
  randInt, pick(arr), angleDiff(a,b)`.
- `tmpV(i)` scratch Vector3 pool (avoid allocations in hot loops).

## Input (`game.input`)
- `down(code)`, `pressed(code)`, `released(code)` — `KeyboardEvent.code` strings
  (`'KeyW'`, `'Space'`, `'ShiftLeft'`, `'Digit1'`, `'Tab'`, `'Escape'`…).
- `mouseDown(btn)`, `mousePressed(btn)`, `mouseReleased(btn)` — 0 left, 2 right.
- `mouseDX, mouseDY` (pixels this frame, pointer-locked or not), `wheel` (deltaY this frame).
- `locked` (pointer lock active), `requestLock()`.
- In test mode, `input.simulate({keys:{KeyW:true}, mouse:{0:true}, dx, dy})` holds inputs.

## Events (`game.events`) — canonical names & payloads
| Event | Payload | Emitted by |
|---|---|---|
| `damage` | `{target, amount, element, point, crit, reaction, killed, isPlayer}` | combat |
| `reaction` | `{id, name, point, target, elements}` | combat |
| `kill` | `{target, source, point}` | combat |
| `statusApplied` | `{target, status}` | combat |
| `spellCast` | `{element, kind ('basic'|'heavy'|'ultimate'), spellId, origin}` | spells |
| `spellFail` | `{reason ('mana'|'cooldown')}` | spells |
| `elementChanged` | `{element, index}` | spells |
| `chargeStart` / `chargeEnd` | `{element}` | spells |
| `zoneCombo` | `{id, name, point}` (spell/zone fusion, e.g. fire tornado) | spells |
| `playerHurt` | `{amount, element}` | combat (when target is player) |
| `playerDeath` / `playerRespawn` | `{}` | player |
| `blink` / `jump` / `land` / `glideStart` / `glideEnd` / `footstep` | `{position}` | player |
| `enemyAlert` | `{enemy}` | enemies |
| `enemyAttack` | `{enemy, kind}` | enemies |
| `campCleared` | `{campId, index, total}` | enemies |
| `bossSpawn` / `bossDefeated` | `{boss}` | enemies |
| `victory` | `{stats}` | enemies (after boss death) |
| `stateChange` | `{state, prev}` | main |

## Elements
`'fire' | 'ice' | 'lightning' | 'wind' | 'earth'` (+ `'physical'` for enemy melee).
Canonical colors (use these everywhere):
```js
ELEMENT_COLORS = { fire:0xff6a1f, ice:0x7fe3ff, lightning:0xc9a4ff, wind:0x8fffc1, earth:0xe0a85a, physical:0xffffff }
```
Exported from `src/core/utils.js` as `ELEMENT_COLORS` and `ELEMENT_NAMES_KO`
(`화염, 냉기, 번개, 바람, 대지`).

## Combat entity interface
Anything damageable (player, enemies, training dummies) is an *entity*:
```js
entity = {
  id, team: 'player' | 'enemy',
  alive: true,
  object,              // THREE.Object3D root; object.position = feet position
  radius, height,      // collision capsule (approx cylinder)
  hp, maxHp,
  mass,                // knockback divisor (1 normal, 4 golem)
  velocity,            // THREE.Vector3 external/knockback velocity. OWNER integrates it
                       // (pos += v*dt, gravity when airborne, friction when grounded)
  grounded,            // owner keeps updated
  resist,              // optional {fire:0.5, ...} damage multipliers (default 1)
  statuses: {},        // OWNED BY COMBAT: { burning:{time,...}, wet, chilled, frozen,
                       //   shocked, airborne, stunned }
  isBoss, isDummy,     // optional flags
  name,                // Korean display name (for HP bars)
  onHit(result, hit),  // optional: owner reacts (flash, stagger anim, aggro)
  onDeath(result, hit),// optional: owner plays death; combat already set alive=false
  getCenter(out),      // optional: world center for VFX; default position + height/2
}
```
Owners must honor `game.combat.canAct(entity)` (false while frozen/stunned → no moving,
no attacking, freeze animations) and `combat.speedMul(entity)` (chilled slows).

## Combat (`game.combat`, file `src/combat.js`, owned by spells agent)
- `register(entity)`, `unregister(entity)` — maintains `game.entities`.
- `dealDamage(target, hit)` → `result {damage, reaction, crit, killed}` where
  ```js
  hit = { amount, element, source /* entity or 'player' */, point /* Vector3 */,
          direction /* knockback dir Vector3 */, knockback /* m/s */, launch /* up m/s */,
          status /* {wet:3, chilled:4, ...} seconds to apply */, heavy /* bool */,
          noReaction /* bool */, tags /* string[] */ }
  ```
  Handles elemental reactions, crits, knockback (adds to `target.velocity / mass`),
  hit VFX + hitstop + shake scaling with damage, emits events, kills.
- `applyStatus(target, name, seconds)`, `hasStatus(target, name)`, `clearStatus`.
- `canAct(entity)`, `speedMul(entity)`.
- `queryRadius(point, r, team?)` → alive entities within r (horizontal + vertical check).
- `raycastEntities(origin, dir, maxDist, team?)` → `{entity, point, dist}` or null.
- `REACTIONS` — array `{id, name, desc, elements:[a,b]}` (Korean name/desc), used by the
  UI grimoire. `discovered` — Set of reaction ids discovered this run.
- Status visuals (flames on burning enemies, ice block for frozen, sparks for shocked,
  drips for wet) are rendered by combat.

## VFX (`game.vfx`)
All positions are `THREE.Vector3` (copied, never retained). Colors hex numbers.
- `burst(pos, opts)` — particle burst. opts: `count, color (hex | [hexA,hexB]), speed,
  speedVar, dir (Vector3, optional), spread (0=beam,1=sphere), size, sizeEnd, life,
  lifeVar, gravity, drag, shape ('soft'|'spark'|'smoke'|'shard'|'ember'|'snow'|'leaf'|'ring'),
  additive (default true), velocityStretch`.
- `emitter(opts)` → handle `{stop(), setPosition(v), alive}`; `opts = burst opts + rate,
  follow (Object3D), offset, duration (s, Infinity default)`.
- `trail(object3D, {color, width, length, fade})` → `{stop()}` ribbon trail following obj.
- `shockwave(pos, {color, radius, duration, thickness, vertical, opacity})`.
- `flash(pos, {color, intensity, distance, duration})` — pooled point light.
- `beam(from, to, {color, width, duration, jagged, segments, branches})` — lightning/beam.
- `decal(pos, {color, radius, duration, opacity})` — ground mark aligned to terrain.
- `debris(pos, {color, count, size, speed, life, material:'rock'|'ice'|'crystal'})`.
- `impact(pos, {element, scale, normal})` — preset small hit per element.
- `explosion(pos, {element, scale})` — preset large blast per element (combines all).
- `shake(trauma)` — 0..1 add trauma (decays); `hitstop(s)` → `game.hitstop`.
- `flashEntity(entity, color=0xffffff, duration=0.12)` — emissive flash on hit.
- `screenFlash(color, alpha, duration)` — fullscreen overlay tint.
- `fovKick(deg, duration)` — temporary FOV punch.
- `glowMaterial(color)`, `textures` — helpers for projectile cores.
- `update(dt, realDt)` — also applies shake/FOV kick to `game.camera` after player set it.

## Player (`game.player`)
- `entity` (registered with combat; team 'player'), `object`, `hp/maxHp, mp/maxMp,
  stamina/maxStamina`.
- `spendMp(n)` → bool. `getStaffTip(out)` → world position of staff gem.
- `getAim()` → `{origin /* staff tip */, dir /* normalized from origin to point */,
  point /* crosshair world hit point, max 120m */, target /* entity near crosshair or null */}`
  (soft aim assist: target = enemy within ~4° of crosshair).
- `playCast(kind, element)` — 'basic'|'heavy'|'ultimate' cast animation.
- `setCharging(active, element, frac)` — charging pose + staff glow.
- `setStaffElement(element)` — gem color/particles.
- Movement: WASD camera-relative, Shift sprint (stamina), Space jump, hold Space in air =
  magical glide (slow fall), `KeyQ` = Blink (short teleport dash, i-frames), regen.
- Controls camera (third-person over-shoulder, mouse orbit, terrain collision).

## Spells (`game.spells`)
Owns casting input: `Digit1–5` / wheel select element, LMB basic, hold+release RMB heavy
(charged), `KeyF` ultimate. 3 spells × 5 elements = 15 spells, plus zone fusions.
- `elements` (array), `index`, `element`.
- `getHudState()` → `{element, index, elements:[{id,name,color}],
  slots:[{kind,name,desc,mpCost,cooldown,cooldownLeft,ready}], charging, chargeFrac}`.
- Projectiles & zones collide with terrain via `world.getHeight` and with entities via
  `combat.queryRadius`.

## Enemies (`game.enemies`)
- `list` — alive enemy entities. `getObjective()` →
  `{phase:'camps'|'boss'|'done', campsCleared, campsTotal, boss /* entity|null */}`.
- Types: Chuchu slime, Bokoblin-like goblin (melee), Goblin shaman (ranged), Stone golem
  (boss), plus training dummies near spawn.

## UI (`game.ui`) — DOM overlay in `#ui`
Title screen, HUD (HP/MP/stamina, element & spell hotbar w/ cooldowns, crosshair, charge
ring), damage numbers, reaction banners, enemy HP bars, boss bar, objective tracker,
grimoire (Tab) listing `combat.REACTIONS` (discovered ones lit), pause, death, victory.
`toast(text, opts)` for tutorial hints. Calls `game.start()` from the title screen.

## Audio (`game.audio`) — WebAudio, all sounds synthesized (no asset files)
- `play(name, {position, volume=1, pitch=1})`, `loop(name, opts)` → `{stop(), setVolume(v)}`.
- `resume()` (called by game.start on user gesture).
- Subscribes to events in `init()` for most sounds; other modules may call `play` directly
  with names from: `cast_<element>, impact_<element>, explode_<element>, charge,
  shatter, steam, reaction, hit, enemy_hurt, enemy_death, player_hurt, blink, jump, land,
  footstep, ui_select, ui_click, mana_empty, boss_roar, victory, golem_step`.
  Unknown names must be ignored silently.
- Ambient music + battle layer (when `enemies` report aggro near player).

---

# v2 Expansion contract (binding; overrides v1 where they conflict)

Goals: swordsman class with element-enchanted blade and heavy hitstop melee; real terrain interaction (grass
burns, fire updrafts lift gliders, ice freezes water…); block & dash per class; class + path choice (all elements
vs. one-element mastery with awakened ultimate, cinematic finisher and support skill); village, NPCs, quests,
story; a beautiful lore intro cutscene; graphics options (grass density) and **performance first**.

## New / changed files and owners
| File | Owner |
|---|---|
| `src/main.js`, `src/core/*` (settings.js, progression.js, input.js gating) | core (done) |
| `src/world.js`, `src/world/*` (+ new `src/world/surface.js`, `src/world/village.js`) | **world** |
| `src/player.js`, `src/player/*`, NEW `src/sword.js`, `src/sword/*` | **melee** |
| `src/spells.js`, `src/spells/*`, `src/combat.js`, `src/combat/*` | **magic** |
| `src/enemies.js`, `src/enemies/*` | **enemies** |
| NEW `src/story.js`, `src/story/*` | **story** |
| NEW `src/cinematic.js`, `src/cinematic/*` | **cinematic** |
| `src/ui.js`, `src/ui.css`, `src/ui/*` | **ui** |
| `src/audio.js`, `src/audio/*` | **audio** |
| `src/vfx.js`, `src/vfx/*` | shared: **magic** may add presets (slash arcs etc. may also live in src/sword/*) — keep the API backward compatible |

## Module order & states (main.js — already implemented)
Order: `world → vfx → combat → audio → player → spells → sword → enemies → story → cinematic → ui`.
`game.settings`, `game.progression` exist before any module factory runs.
States: `'title' | 'cutscene' | 'playing' | 'dialogue' | 'paused' | 'dead' | 'victory'`.
- `playing`: player, spells, sword, enemies, combat, story, **cinematic** (after combat → may override camera),
  then world, vfx, ui, audio. dt is scaled by hitstop, slowmo and `cinematic.timeScale` while `cinematic.active`.
- `dialogue` / `cutscene`: only story(0, realDt), cinematic(dt, realDt), world, vfx (ambient dt), ui, audio.
  The story module positions the camera itself during dialogue; cinematic during cutscenes.
- `game.newGame({skipIntro})`: progression.reset → state 'cutscene' → `cinematic.playIntro(begin)` → begin():
  `player.placeInVillage()`, state 'playing', `story.begin()`. Title's 모험 시작 button calls `game.newGame()`.
- `game.activeSkills()` → `game.sword` if `progression.cls === 'sword'` else `game.spells`.
- Test mode `?test=1`: skips intro, `progression.choose(cls||'mage', path||'all', el||'fire')`, then
  `story.debugSkip(quest||'camps')`. `&cls=none` leaves the choice unmade (story starts at the beginning).
  `&intro=1` plays the intro. Keep tools/playtest.js working (it assumes mage/all).

## Input (core/input.js)
Gameplay queries (`down/pressed/mouse*/mouseDX/wheel`) return nothing while `input.gameLocked`
(`input.lock(reason)` / `unlock(reason)`; reasons: 'cinematic', 'dialogue', 'menu'). UI/story/cinematic read
ungated keys through `input.raw.pressed(code)` etc.
**Key map (both classes):** WASD move · Shift sprint · Space jump / hold in air = glide · **Q dash** ·
**E (hold) block** · LMB basic (sword: combo chain) · RMB hold+release charged skill · **F ultimate** (also
**interact** when `game.story.hasPrompt()` is true — then F talks and must NOT cast) · **R finisher** (master,
gauge full) · **G support skill** (master) · 1–5 / wheel element (only unlocked ones) · Tab grimoire ·
Esc pause/menu · M mute.

## Progression (`game.progression`, core/progression.js — done)
`cls ('mage'|'sword'|null)`, `path ('all'|'master'|null)`, `element` (master element), `chosen`,
`choose(cls, path, element)` → emits `pathChosen {cls,path,element}`; `unlockedElements()`,
`isElementUnlocked(el)`, `isMaster()`, `hasAwakenedUltimate()`, `hasFinisher()`, `hasSupport()`,
`damageMul(el)` (master element ×1.25 — combat applies it to player-sourced hits), `awakening` 0..100,
`addAwakening(n)` (combat adds ≈ damage×0.12 for player-sourced hits; reactions +4), `canFinisher()`,
`consumeAwakening()`; events `awakeningChanged {value}`, `awakeningReady`.
- Path 'all' (원소의 방랑자): all 5 elements; normal ultimates; no finisher/support/awakened.
- Path 'master' (원소의 대가): only `element`; its F ultimate is the **awakened** version (bigger, new name with
  "· 각성"); R = **finisher with cinematic**; G = **support skill**; ×1.25 damage.
- Before a choice: no combat skills (skills modules do nothing; HUD hides hotbar).

## Settings (`game.settings`, core/settings.js — done)
`values {quality, grassDensity 0..1, shadows, shadowQuality 'low'|'medium'|'high', renderScale 0.5..1, bloom,
drawDistance 0..1, particleScale 0..1, showFps, mouseSens, invertY, volMaster, volMusic, volSfx}`,
`set(k,v)`, `applyPreset('low'|'medium'|'high')`, emits `settingsChanged {key, value, settings}` (key '*' = all).
main applies renderScale/shadows/bloom. **world** must apply grassDensity (live, no reload — e.g. change
InstancedMesh.count per chunk / rebuild), drawDistance (flora/grass culling distance), shadowQuality (shadow map
size 1024/2048/2048 + shadow camera extent). **vfx** applies particleScale (multiply burst counts/emitter rates).
**player** applies mouseSens/invertY. **audio** applies volumes. **ui** builds the menu and showFps.

## Combat changes (magic agent implements in combat.js)
- `hit.hitstop` (seconds) / `hit.shake` (0..1) explicit overrides. Hits tagged `'melee'` ALWAYS apply their
  hitstop (no rate limiting) — melee 타격감 depends on every hit freezing the frame.
- Player-sourced hits: multiply by `progression.damageMul(hit.element)`; add awakening gauge.
- Block hook: before damage, `const r = target.onBeforeDamage?.(hit)`; if `r?.cancel` → no damage, emit
  `blocked {target, parried:!!r.parried, perfect:!!r.perfect, point, source}` and return `{damage:0, blocked:true}`;
  if `r?.mul != null` → scale damage (partial block, still emits `blocked`). If `r?.parried` and `hit.source` is an
  entity → call `hit.source.onParried?.(target)`. If `hit.projectile?.reflect` and `r.reflect` → call
  `hit.projectile.reflect(target)`.
- Player attacks (spells AND sword) target every entity whose `team !== 'player'` (enemies **and** `team:'prop'`
  objects such as explosive fire barrels). UI hides HP bars for `isProp`.
- Statuses on the player are allowed (burning from grass fire etc.).

## Terrain interaction (`game.world.surface`, world agent, src/world/surface.js)
A coarse simulation grid over the playable area (≈1.5–2 m cells), updated at ~10 Hz over an ACTIVE CELL LIST only.
- `ignite(pos, radius, intensity=1)` → grass cells start burning; fire spreads to neighbouring grass cells
  (wind-biased, faster downwind), burns ~4–7 s per cell, leaves scorched ground (grass shader reads a burn/
  density DataTexture → blades shrink/blacken; regrow after ~60–90 s). Flames rendered with a pooled instanced
  flame-sprite system + smoke, capped (e.g. ≤ 400 flame quads), merge distant cells.
- `extinguish(pos, radius)` (water, ice, rain), `wet(pos, radius, seconds)` (rain → grass can't ignite).
- `isBurning(x, z)`, `burningNear(pos, r)` → count; entities (incl. player) standing in burning cells get
  `combat.applyStatus(e,'burning',2)` (world checks every 0.5 s through `game.entities`).
- `getUpdraft(pos)` → upward acceleration m/s² at a world point: above burning cells up to ~30 m height
  (strongest 4–20 m), 0 elsewhere. **player**: while gliding, `vy += updraft*dt` with vy cap ≈ +9 m/s → rising
  heat lets the glider soar (BotW). Also emits `updraftEnter/updraftExit` (player emits) for audio/UI hint.
- `freezeWater(pos, radius, seconds=25)` → walkable ice discs on the lake/stream; `world.getGroundHeight(x,z)` =
  max(terrain, frozen water surface) — **player and enemies use getGroundHeight for feet**; `isInWater` false on ice.
- `wind(pos, dir, strength, radius)` → strong grass bend impulse + fire spread push (wind spells/slashes).
- Explosive fire barrels (불씨 항아리): world places ~10 (near village tutorial spot, camps). Each is a combat
  entity `{team:'prop', isProp:true, hp:1}` registered via combat; on death → fire explosion (vfx.explosion),
  `ignite` radius 5, damage entities within 4 m (via combat.dealDamage, element fire, source 'player'), removed;
  respawn after 60 s at the tutorial spot.
- Spells/sword call these: fire impacts/zones → ignite (fire basic: radius 1.5, heavy 3–5, meteor 8, fire sword
  slashes on grass 1); ice/storm rain → extinguish + freezeWater if over water; wind → wind(); lightning on
  water → existing electrified water; earth spikes → `surface.scorch?` not required.

## Village & world additions (world agent)
- `world.village = { center, radius, playerHome (spawn point, Vector3), npcSpots: {elder, mageMentor,
  swordMentor, captain, merchant, child, villagerA, villagerB, villagerC}, altar (원소의 제단 position),
  trainingGround (Vector3), tutorialHill (high rock top Vector3 reachable only by updraft gliding), barrels:[Vector3] }`
  — spots are `{position: Vector3, yaw}`.
  Village 「바람결 마을」 sits in the south (around z ≈ 115–160), around the old spawn. Cozy BotW-Hateno/Kakariko
  vibe: 8–12 houses (timber + plaster walls, thatched/red-tiled roofs, chimneys with smoke), a windmill with
  turning blades, a well, market stalls with awnings and crates, lanterns (emissive at dusk), fences, flower beds,
  laundry lines, a stone path network, a pond. The 원소의 제단: circular stone dais with 5 element pillars topped
  by floating glowing crystals (element colors). Training ground with the dummies at `trainingGround`.
  `world.trainingArea` = trainingGround (enemies use it). `world.playerSpawn` = playerHome.
- A giant glowing **세계수 아스트라 (World Tree)** landmark far away on the northeast mountains, visible from
  everywhere (used by the intro). `world.worldTree = {position, height}`.
- Draw-call budget (medium): whole frame ≤ ~350 draw calls & ≤ ~900k triangles. Merge static village geometry
  (BufferGeometryUtils.mergeGeometries by material, vertex colors), instanced repeats.

## Player (melee agent): class & defense
- `player.cls` mirrors progression; `player.setClass('mage'|'sword')` swaps weapon/outfit (mage: staff + wizard
  hat; sword: elegant longsword + light armor/hood/scarf variant — clearly different silhouette). Listen to
  `pathChosen`. `player.placeInVillage()` puts the player at `world.village.playerHome`.
- Dash (Q): mage = **Blink** (existing; 1.2 s cd) ; sword = **질풍보** quick dash-step (≈6 m, 0.18 s, i-frames
  0.25 s, 2 charges, 0.9 s recharge each, stamina 12). Dodging an incoming hit within its last ~0.2 s before
  impact = **완벽 회피** → `game.slowmo(0.3, 1.2)`, blue screen tint, next sword attack within 1.5 s is a
  guaranteed crit "반격" (BotW flurry-rush feel). Emit `perfectDodge`.
- Block (hold E): mage = **마력 방벽** arcane barrier (translucent hex-pattern dome/front shield, element
  tinted): ×0.2 damage, drains MP 6/s + 0.5 MP per damage blocked, first 0.2 s after press = perfect → full cancel,
  reflects projectiles (`reflect`), emits `parry`. sword = **검 막기** guard stance: ×0.3 damage (stamina cost
  per hit, guard break when stamina 0 → stagger 0.8 s), first 0.18 s = **간파 (perfect parry)**: cancel, spark burst,
  hitstop 0.12, slowmo(0.4,0.5), attacker `onParried` (staggered 1.6 s), emits `parry {perfect:true}`.
  Implemented through `player.entity.onBeforeDamage(hit)`. Expose `player.blocking`, `player.dashing`,
  `player.getDefenseHud()` → `{block:{active, perfect, type}, dash:{charges, maxCharges, cooldownFrac}}`.
- Updraft gliding per surface contract; `getGroundHeight` for feet.
- Sword animation API (internal to melee agent; spells/mage keep using playCast/setCharging).

## Sword (`game.sword`, melee agent, src/sword.js + src/sword/*)
Active only when `progression.cls === 'sword'` (spells module is inactive then, and vice versa).
- **Element enchant**: current element (1–5/wheel among unlocked) tints the blade (emissive edge + element
  particles + trail color). Every hit uses `combat.dealDamage` with `element`, tags `['melee', ...]`, explicit
  `hitstop` and `shake`, `point` at blade contact, `direction` from player. Reactions therefore work with melee.
- **Hit feel is the #1 priority**: every connecting hit → hitstop (light 0.06–0.08 s, finisher-of-combo 0.12,
  charged 0.14–0.18, ultimate 0.2), camera punch (vfx.fovKick small + shake), blade trail ribbon (vfx.trail on
  tip), crescent **slash arc mesh** (element-textured, additive, 0.12 s), impact sparks + element impact, enemy
  flash + flinch + knockback, layered sound (`sword_swing` + `sword_hit` + `impact_<el>`), damage numbers.
  Hitboxes: swept arc test per active frame (not just a sphere at the end), each enemy hit once per swing.
  Attack buffering & cancel windows (dash/block cancel recovery), slight lunge toward soft-locked target.
- Per element: LMB 4-hit combo (4th hit special), RMB charged skill (hold ≥0.35 s, scales to 1.2 s),
  F ultimate (stamina/cooldown based; swordsman has no MP use — uses stamina for dash/guard and a separate
  cooldown for skills), master: F = awakened ultimate, R = finisher (cinematic), G = support buff.
  Names (Korean):
  - 화염 — 콤보 4타 화염 폭발 / 충전 **염화 발도** (dash-slash leaving a fire line) / 궁극 **홍련 난무** (flaming
    whirlwind) / 각성 **홍련 난무 · 각성** / 필살 **종말의 화룡검** (flame dragon) / 보조 **불꽃 갑주** (attack buff + burn aura)
  - 냉기 — 4타 빙결 파동 / **빙결 일섬** (piercing freezing thrust) / **절대영도 검무** / 각성판 / 필살
    **영겁의 빙화** / 보조 **서리 방벽** (ice armor)
  - 번개 — 4타 낙뢰 / **뇌광 섬격** (teleport multi-slash between up to 5 enemies) / **천뢰 낙인** (leap + thunder
    plunge) / 각성판 / 필살 **신뇌일도** / 보조 **신속** (move & attack speed)
  - 바람 — 4타 띄우기(launcher) / **진공참** (giant crescent wind wave) / **폭풍 검진** (orbiting wind blades) /
    각성판 / 필살 **천공의 대선풍** / 보조 **순풍** (double jump + extra dash)
  - 대지 — 4타 지면 강타 / **대지 가르기** (fissure line eruption) / **대지의 심판** (giant stone sword falls) /
    각성판 / 필살 **거신의 일격** / 보조 **바위 피부** (damage reduction + stagger immunity)
- `getHudState()` same shape as spells (below). Emits `swordSwing {element, step}`, `spellCast` too (kind
  'basic'|'heavy'|'ultimate'|'finisher'|'support', so audio/ui reuse it), `chargeStart/End`.
- Terrain: fire slashes on grass ignite (radius 1), wind slashes `surface.wind`, ice slashes over water freeze.

## Mage additions (magic agent, spells)
- Gating: only unlocked elements selectable; no casting before a choice; inactive when cls === 'sword'.
- 5 **awakened ultimates** (master): evolved bigger versions, e.g. 메테오 → **천체 낙하 · 각성** (meteor shower),
  빙하 송곳 → **빙하기 · 각성**, 천벌의 뇌우 → **뇌신의 심판 · 각성**, 대회오리 → **천공의 폭풍 · 각성**,
  대지진 → **대륙 붕괴 · 각성** (names may be refined).
- 5 **finishers** (R, cinematic via `cinematic.finisher`): e.g. 화염 **불사조 강림**, 냉기 **영원의 겨울**,
  번개 **천뢰 강림**, 바람 **천공의 눈**, 대지 **거신 소환**. Each: 300–600 damage AoE + full VFX spectacle.
- 5 **support skills** (G): 화염 **불꽃 정령 소환** (orbiting fire familiar that shoots), 냉기 **얼음 갑옷**,
  번개 **번개 축복** (cast speed + chain bonus), 바람 **바람의 날개** (flight boost / long glide), 대지 **대지의 수호**
  (stone golem ally or barrier ring).
- Mage block/dash live in player (melee agent) — magic agent only exposes MP costs via player.spendMp.
- `getHudState()` (spells & sword): `{element, index, elements:[{id,name,color,locked}], slots:[{kind:
  'basic'|'heavy'|'ultimate'|'support'|'finisher', key:'LMB'|'RMB'|'F'|'G'|'R', name, desc, mpCost, staminaCost,
  cooldown, cooldownLeft, ready, awakened}], charging, chargeFrac, awakening:{enabled, value, ready}}`.

## Cinematic (`game.cinematic`, cinematic agent)
- `active`, `timeScale`, `play(shots, {mode:'gameplay'|'world', letterbox=true, skippable=true, onEnd})`.
  'world' mode sets state 'cutscene' for its duration (restores previous state at end) — gameplay frozen;
  'gameplay' mode keeps state 'playing', locks input ('cinematic'), sets `timeScale` per shot (e.g. 0.05 freeze,
  0.3 slowmo, 1) and overrides the camera after combat each frame.
- shot: `{duration, from:Vector3|fn, to, lookFrom, lookTo, fov, ease, timeScale, shake, title:{text, sub, style},
  subtitle:{speaker, text}, fadeIn, fadeOut, onStart(), onUpdate(t,dt), onEnd()}`; helpers
  `orbit(target, {radius, height, from, to})`, `dolly(from,to,lookAt)`.
- DOM overlays (inside #ui, own classes prefixed `cin-`): letterbox bars, big title splash (calligraphic style
  for skill names), subtitles with speaker name, fade-to-black, skip hint "Space 길게 눌러 건너뛰기" (hold 0.8 s).
- `playIntro(onDone)` — the lore intro (see Story/Lore). Gorgeous, ~60–80 s, skippable, uses real world
  flyovers + special temporary set pieces (5 spirit lights orbiting the World Tree, void mist creeping, golem
  silhouette with red eyes, sunrise over the village). Ends with title card 「아케인 와일즈」.
- `finisher({cls, element, name, target (entity|null), center (Vector3), onBuildup(t), onImpact(), onEnd})` —
  standard ≈4 s cinematic template used by sword & magic finishers: freeze-frame + letterbox in → close shot of
  the hero with element aura & name splash → orbit/rise power-up → wide shot of the attack hitting `center` →
  `onImpact` (caller deals damage + VFX) → camera returns. Enemies are frozen by timeScale.
- `playBlessing(element|'all', onDone)` — short (~8 s) altar ceremony when the path is chosen (spirit(s) descend
  into the hero). `playEnding(onDone)` — after the boss: corruption cleansed, spirits return to the World Tree,
  village celebrates, "끝 — 그리고 새로운 모험은 계속된다", then victory screen.

## Story (`game.story`, story agent)
**Lore** (use consistently; cinematic narrates the same):
- World: 원소의 대륙 **에테리아**. At its heart grows 세계수 **아스트라**, from which five elemental spirits were
  born: 화염의 **이그니스**, 냉기의 **글라시아**, 번개의 **볼타**, 바람의 **실피아**, 대지의 **테라곤**.
- 천 년 전, 별의 틈에서 쏟아진 **공허의 안개** 가 대륙을 집어삼켰고, 최초의 **원소 수호자**들이 정령과 계약해
  안개를 북쪽의 **봉인의 유적** 에 가두었다. 유적의 수문장인 **고대 바위 골렘** 이 봉인을 지켜 왔다.
- 지금, 봉인이 약해져 안개가 새어 나오고, 오염된 마물(보코블린, 츄츄, 주술사)이 **솔레아 평원** 에 거점을
  세웠다. 수문장 골렘마저 안개에 잠식되었다.
- 평원 남쪽 끝 **바람결 마을** 의 젊은이인 주인공의 손등에 원소의 각인이 떠올랐다 — 새로운 수호자의 증표.
- NPCs: 촌장 **노아** (elder, wise, warm), 대마도사 **엘리시아** (mage mentor, playful genius), 검성 **바르칸**
  (sword mentor, gruff veteran), 경비대장 **로웬** (captain), 상인 **미라**, 꼬마 **티모** (curious kid; teaches
  the updraft trick), villagers.
**Quest chain** (stage ids): `wake` (talk to 노아) → `choose` (meet both mentors at the altar; pick class, then
path (+element if master) with a clear explanation of the trade-off; `progression.choose`; then
`cinematic.playBlessing`) → `training` (at training ground: basic ×5 hits, charged ×1, ultimate ×1, block ×1
(mentor throws a harmless practice orb at you / dummy swings), dash ×1) → `updraft` (티모: explode a fire
barrel or burn the grass, glide over the fire to rise onto `tutorialHill` and grab the 바람 깃털 — reward:
+stamina) → `camps` (로웬: clear 3 camps, tracks campCleared) → `boss` (enter ruins, defeat golem) → `ending`
(`cinematic.playEnding` → victory). `debugSkip(stage)` jumps (auto-completing earlier stages silently).
- NPC models: procedural, BotW-cute proportions, distinct silhouettes & outfits, idle animations, look-at
  player, name label + "!" / "?" quest markers above heads.
- Interaction: within 3 m of an NPC → prompt "[F] 대화하기" (own DOM, styled with UI tokens); `hasPrompt()`.
- Dialogue: state 'dialogue', input.lock('dialogue'), camera framing both speakers (story sets camera), bottom
  dialogue box with speaker nameplate, typewriter text (click/Space/F to advance, skip typing), choices
  (1–3 options, keyboard/mouse), `audio.play('dialogue_blip')` while typing.
- `getObjective()` → `{title, desc, progress?:{cur,max}, marker?:Vector3}`; `getMarkers()` →
  `[{position, kind:'quest'|'npc'|'camp'|'boss', label}]` (UI compass/tracker use these; fallback to enemies).
- Events: `questStart {id, title}`, `questComplete {id, title}`, `dialogueStart/End {npc}`.

## UI tokens (ui.css defines; story & cinematic reuse)
`--aw-gold:#e9c46a; --aw-gold-dim:#a8844a; --aw-cream:#f6ecd2; --aw-ink:#14110d; --aw-panel:rgba(14,16,24,.78);
--aw-panel-border:rgba(233,196,106,.55); --aw-font-title: "Cinzel", serif-ish fallback; --aw-font-body: system
Korean stack`. Story/cinematic must use `var(--aw-*, fallback)`.

## UI (ui agent)
Settings menu (설정; from title and pause): 품질 프리셋 낮음/중간/높음, **풀 밀도** slider 0–100 %, 그림자 on/off,
그림자 품질, 해상도 배율 50–100 %, 블룸, 시야 거리, 파티클 양, FPS 표시, 마우스 감도, Y축 반전, 볼륨(전체/음악/효과).
HUD per class from `game.activeSkills().getHudState()` + `player.getDefenseHud()` + progression awakening gauge
(ornate ring that glows & pulses when ready + "[R] 필살기" prompt), locked elements shown with a lock icon /
hidden, hotbar hidden before choice, quest tracker from `story.getObjective()`, compass from `story.getMarkers()`,
parry/perfect dodge flashes ("간파!", "완벽 회피!"), quest start/complete banners, title screen: 모험 시작
(`game.newGame()`), 설정, 조작법 (updated key map).

## Audio additions (audio agent)
New sfx names: `sword_swing, sword_swing_heavy, sword_hit, sword_hit_heavy, sword_charge (loop), sword_draw,
block, block_hit, guard_break, parry, perfect_dodge, dash, barrier_up, barrier_hit, reflect, dialogue_blip,
dialogue_open, quest_start, quest_complete, item_get, fire_crackle (loop, volume by burning cells near the
camera — world calls loop handle setVolume), grass_ignite, updraft (loop), freeze_water, awakening_ready,
finisher_charge, finisher_impact, cinematic_whoosh, spirit_chime, blessing`.
Music themes: `audio.setMusic(theme | null)` with themes `'title','intro','village','field','battle','boss',
'ending'` (null = automatic: village when inside `world.village.radius`, field outside, battle/boss when
enemies inCombat / boss alive). `audio.setVolume('master'|'music'|'sfx', v)`. Apply settings volumes.

## Performance rules (everyone)
No per-frame allocations in hot paths; pool everything; InstancedMesh for repeats; merge static meshes;
distance-based LOD/culling (honor `settings.drawDistance`); outlines only within ~40–60 m; no new realtime
lights beyond pooled ones (village lanterns are emissive, not lights; ≤ 4 extra PointLights total); fire grid
updates only active cells at ~10 Hz; avoid shader recompiles mid-game (pre-warm materials at boot via
`renderer.compile(scene, camera)` after building); target 60 fps on a mid laptop at 'medium'.

---

## v3 RPG Expansion contract (binding)

The v3 expansion (classes, 9 elements, skill trees, the extended story to 공허룡 니드호그라) is specified in two files.
**This file stays the single entry point.** The v1 and v2 sections above remain valid unless the v3 contract overrides them.

- **`docs/v3/CONTRACT.md` (binding, revision v3.1)**: owners, load order, APIs, events, tests and the build-task JSON (§24).
  On APIs, CONTRACT wins.
- **`docs/v3/DESIGN.md`**: game design and every number. On numbers, DESIGN wins.

**Owners (10, disjoint files; CONTRACT §1):**

| Owner | Owns |
|---|---|
| core | `src/main.js`, `src/core/*`, `tools/*` harnesses, this file |
| skills | `src/skills.js`, `src/skills/*` (trees, runtime, adapters, class kits) |
| combat | `src/combat*`, plus all VFX (`src/vfx*`) |
| magic | `src/spells*` (caster archetypes) |
| melee | `src/sword*` (melee archetypes) |
| player | `src/player*` |
| world | `src/world*` |
| enemies | `src/enemies*`, including `src/enemies/bosses/*` |
| narrative | `src/story*`, `src/cinematic*`, plus all audio (`src/audio*`) |
| ui | `src/ui*` |

**Hard rules (CONTRACT, top):**
- A file statically imports only its own owner's files, `src/core/*` and three. Everything else is reached through `game.*` or a guarded `await import()`.
- No class literals; use `familyOf`/`styleOf`.
- `ELEMENTS` stays the 5 classic elements; v3 code uses `ALL_ELEMENTS`.
- No new lights.
- Per-owner notes in `docs/v3/notes/<owner>.md`, and requests in `docs/v3/requests/<owner>.md`.

**Load order:** `world → vfx → combat → audio → player → spells → sword → skills → enemies → story → cinematic → ui`.
- Before any factory, main.js creates `game.progression`, `settings`, `stats`, `elements`, `classes`, `save`, `archetypes`, `interact`, `timeScale` and `post`.
- **Frame:** `timeScale.update` → `player` → `stats.update` → `spells` → `sword` → `skills` → `enemies` → `combat` → `story` → `cinematic`, then world, vfx, ui and audio.

**Key APIs:**
- `game.elements` — `ELEMENT_DEFS`, `ALL_ELEMENTS`, `elColor`, `elName`.
- `game.classes` — `CLASS_DEFS` (6 classes, each with 2 primary + 4 secondary elements), `access`, `familyOf`.
- `game.progression` — `registerTrees`, `canLearn`/`learn`/`canUnlearn`, `tierCap`, derived `points`, `damageMul` (mastery only), `setRanks`, `breadth`.
- `game.stats` — `set`/`clear`/`get`/`update`/`derived`. `player.mods` is a read-only getter view of it.
- `game.skills` — `cast`, `castSlot`, `equip`/`canEquip`, `attune`, `applyPreset`, `getHudState` (v3).
- `game.archetypes` — `registerArchetype(name, 'caster'|'melee', fn)`, `registerImpl`.
- `game.interact` — `offer`, `current`, `use`. **F is interact only; the ultimate is X.**
- `game.timeScale` — `set(id, scale, dur)`. `game.slowmo` is a shim.
- `game.post.pulse`.
- `combat` — `dealDamage`, the single place for damage scaling and for `vfx.hitFeel`; `applyStatus(t, name, seconds, {stacks, source, power, el})`; `previewReaction`; `reactObject`.
- `enemies` — `spawnBoss`, `prewarmBoss` (idempotent), `setTauntTarget`, `getThreatTarget`, `setPlayerStealth`, `getRunStats`, `bosses.gift`.
- `world` — `getZoneAt`, `bossArenas` (all on terrain; the finale is on the 세계수 뿌리 고원), `addPlatform`, `addTempCollider`, `addUpdraft`, `surface2`, `gates`, `serialize`.
- **Events** (full list in CONTRACT §9) — `skillCast` (exactly once per cast), `bossDefeated {id, name, final}`, and `victory`, emitted once by story only after the ending.

**Build:** wave 0 core, then skills/combat/player/world/ui, then magic/melee/enemies, then narrative, then integration
(CONTRACT §24). The integration step appends the owners' module notes below.

### v3 module notes
Concatenated at integration from `docs/v3/notes/<owner>.md` (those files stay the per-owner source; headings are nested one level below this one).

#### core — module notes (v3, wave 0) — `docs/v3/notes/core.md`

Files: `src/main.js`, `src/core/{elements,classes,stats,progression,archetypes,interact,timescale,keymap,save,debug,settings,stubs,utils,input,events}.js`,
`tools/{bootcheck,playtest3,playtest,playtest2}.js`, `tools/playtest3/{harness,core}.js`, `tools/playtest3/fixtures/tree_fire.js`.

##### Boot
- main.js creates, **before any module factory**: `game.KEYS`, `game.keymapMode` (`'v3'` | `'legacy'` when the test URL has `path=`),
  `game.elements`, `game.classes`, `game.timeScale`, `game.settings`, `game.stats`, `game.progression`, `game.archetypes`,
  `game.interact`, `game.save`, `game.debug`, `game.post`, `game.difficulty`.
- `ORDER = world → vfx → combat → audio → player → spells → sword → skills → enemies → story → cinematic → ui`; `FILES.skills = ['./skills.js','createSkills']`.
  A missing/broken file or a throwing factory is replaced by its stub from `core/stubs.js` (the skills stub is the full CONTRACT §2 shape, `isStub:true`).
- Frame: `timeScale.update(realDt)` (every state) → input → [playing: F → `interact.use()` → player → `stats.update(dt)` → spells → sword → skills → enemies → combat → story → cinematic]
  → `stats.flush()` when not playing → `interact.update` (10 Hz) → `save.update` (debounce) → `post.update` → world, vfx, ui, audio.
- Game dt = `min(realDt, 1/20) × timeScale.value() × hitstop × cinematic.timeScale`. `game.slowmo(s, t)` is a shim to `timeScale.set('legacy', …)`;
  `game._slowScale` / `game._slowTime` are read-only getters over the stack (v2 `player.timeComp` keeps working).
- `game.activeSkills()` = `game.skills` unless it is the stub, else the v2 switch via `familyOf(cls)`.
- `game.continueGame()` = 이어하기 (save.load, spawn at gate/village, full HP). `game.newGame({skipIntro, clearSave})` (`clearSave` for 새 게임).

##### Registries
- `elements.js`: `ELEMENT_DEFS` (9; earth status `encrusted`), `ALL_ELEMENTS`, `CLASSIC_ELEMENTS`, `PSEUDO_ELEMENTS` (physical, void), `elDef`, `elColor(id, part)`, `elName(id)` — never undefined.
  `utils.js` keeps `ELEMENTS` = 5 classic; `ELEMENT_COLORS` / `ELEMENT_NAMES_KO` are Proxies (unknown key → physical) with explicit new keys; `ELEMENT_NAMES_KO.ice` stays `'냉기'`.
- `classes.js`: `CLASS_DEFS` (6; access table of DESIGN §2.1, 4 classes per element), `access`, `familyOf` (unknown → caster, warns once), `styleOf`,
  `classElements`, `classesForElement`, `TALENTS` (Korean, DESIGN §2.2), `talentsFor(cls, level, choice)`. Extra Korean fields: `weaponKo`, `signatureKo`, `fantasyKo`.
- `archetypes.js`: `registerArchetype(name, 'caster'|'melee', fn)`, `getArchetype`, `registerImpl(skillId, family, fn)`, `getImpl`, `list()`, `NAMES` (the 24).

##### Stats (`game.stats`)
- Pooled source records; `set(id, mods, {duration})` copies into the record (no allocation); `get(key)` lazily recomputes; `update(dt)` (game time) expires
  timed sources and emits **at most one** `statsChanged` per frame; `flush()` does the same without expiry (used outside `playing`).
- Key kinds: the CONTRACT §5 lists, plus the convention for unknown keys: `*Mul` / `*Dmg` / `rx_*` / `rxFamily_*` multiply, booleans OR, the rest add.
  `reactionDmg(id, family?)` = `rx_<id> × rxAll × rxFamily_<family>` (`rxAll` is a multiplicative key, e.g. breadth `1 + 0.04 × trees`) (family looked up in `combat.REACTION_DEFS` when omitted).
- `consume(key)` clears every source contributing that key; `clearPrefix('buff:')`; `registerProc(sourceId, event, fn)` (removed by `clear(sourceId)`); `dump()` for tests.
- `derived()` (reused object): class base × level growth (DESIGN §5.3) × `maxHpMul`/`maxResMul`/`moveMul`; `critMul = 1.5 + critMul`; regen 5 s/3 s, 1.5 %/8 % (hard: in-combat ×0.8).
- **progression owns the `node:<id>` sources** (`node.mods(rank)`), refreshed on learn/unlearn/setRanks/respec/class change/load. Skills must not set them.

##### Progression (`game.progression`)
- Everything of CONTRACT §4. Points are derived: `levelPoints(L)` (+1 class, L2–20, even 22–30) + act bosses (`bossesDefeated` ∩ golem/hydra/nox/treant/kalis) +
  seed shrines + `bonusPoints` − spent (granted nodes cost 0). 38 at cap with everything found.
- `canLearn` order: unknown → maxRank → class → tier (secondary T4+) → story (capstones only) → gate (pointsIn ≥ 0/2/5/9/14) → prereq → exclusive → points.
  `debug.ungate` skips class/tier/story/gate; `debug.infPoints` skips points; `debug.strictPlace` disables the test-mode respec-anywhere bypass.
- `canUnlearn` 'gate' is strict: after the refund, every learned node of tier t still needs ≥ gate(t) points in the tiers **below** t.
- `canRespecHere()`: within 8 m of `world.respecSpots` / the altar (`world.altar || world.village.altar`), or test mode. `canChangeClass()` / `changeClass(to)`: altar only, never with a live boss.
- XP listeners: `kill` (only `xpValue > 0`; `zoneLevel` default 1; falloff ×0.5 at ≥ zoneLevel+6, catch-up ×1.5 at ≤ zoneMin−3), `reactionDiscovered` (+60),
  `shrineFound` (seed: +1 point, +300; landmark: +80), `bossDefeated` (records act bosses). `addPoints(n, bossId)` is idempotent with that listener.
- Note: DESIGN §5.1's example column (L5 → 454, …) does not match its own formula; the formula `round(40·L^1.4+60)` is implemented (L5 → 441).
- `mastery(el)` / `breadth()` return reused objects. `unlockedElements()` returns a cached array (do not mutate).
- v2 shims: `choose(cls, path, el)` = setClass + `skills.applyPreset('legacy_all'|'legacy_master_<el>')` + ungate + `pathChosen`.
  While **no trees are registered** (skills stubbed) the v2 behaviour is kept as a fallback (`_legacy`: 5 classic elements, master ×1.25, master awakening/support).
- Extra events: `treesRegistered {count}`, `sealsBroken {}`, `talentChosen {cls, choice}`; `classChosen` gets `{loaded:true}` after a save load.

##### Core services
- `game.input.actionDown/actionPressed/actionReleased(name)` read a KEYS binding (keys or MouseN).
- `game.timeScale`: `set(id, scale, durReal)`, `clear`, `has`, `timeLeft`, `value()` (min), `comp()` (= 1/value while `focus`), `active()`.
- `game.interact`: `offer(id, {pos|()=>pos, r=2.5, label, onUse, priority, enabled})`, `withdraw`, `current()` (10 Hz, reused view), `use()`. Emits `interactChanged`.
  Core calls `use()` on KeyF while playing (v3 keymap always; legacy keymap only when an offer is current).
- `game.post`: `pulse(amount, durReal, {radial})` (chromatic split + radial blur, scaled down when `screenShake` is 0), `grade(name, blend, dur)` with
  `GRADES` none/void/memory/holy/cold/boss/finale/dawn/break. Uniforms live in the existing sanitize pass (uniform branches; no extra pass).
- Toon dissolve: every `toonMat` (rim on) has `uDissolve` (−1 = off) and `uDissolveColor`, key `'toonRim+dis'` (chained before prefab occlusion).
  `dissolveUniforms(mat)` (utils.js) returns the per-material uniforms; clone the material once (copy `onBeforeCompile` + `customProgramCacheKey`), then animate the clone's uniforms — no new program.
- `game.save`: `has/save/load/clear/request/update`; key `aw_save_v3`; autosave on `questComplete`, `treeClosed`, `altarLeave`, `classChanged` (2 s debounce, never with a live boss or a cinematic, test mode only with `&save=1`).
  Optional hooks it calls: `skills.serialize/deserialize`, `story.serialize/deserialize/currentBossId`, `world.serialize/deserialize/lastGateSpawn`, `player.placeAt`, `enemies.prewarmBoss`.
- `game.settings`: v3 keys `difficulty`, `screenShake`, `damageNumbers`, `effectQuality`, `holdToCast`; `aw_settings_v3` with a copy-once v2 migration; presets set `effectQuality`;
  `effectMul()`; `set(k, v, {persist:false})`. `game.difficulty` = DESIGN §16 row (`hpMul`, `dmgMul`, `telegraphMul`, `checkAddSec`, `regenCombatMul`).
- `game.debug`: every CONTRACT §21 function (feature-detected, never throws) + `spawnDummy(pos, {aggro, hp})`, `nearestEnemy`, `stats()`; `events.count(name)` (enabled in test mode).
  `hurt(n, {combat:true})` marks a dummy within 30 m with `aggro = debugAggro = true`.

##### Test URL params (main.js `applyTestParams`)
`cls` (default mage; `none`), `level`, `skills=all|primary|<ids>|preset:<name>`, `equip`, `difficulty`, `attune`, `unlock=all`, `points=inf`, `quest` (default camps),
`zone`, `boss`, `phase`, `save=1`, legacy `path`/`el`, plus `stub=all|<modules>` (force core stubs) and `intro=1`.
The deprecated `pathChosen` bridge emit after `setClass` was removed at integration (every listener also handles `classChosen`); the v2 `progression.choose` shim still emits it.

##### Tools
- `node tools/playtest3.js [owner…]` — runs `tools/playtest3/<owner>.js` sections through `tools/playtest3/harness.js` (`PT.boot`, `pg.run`, in-page `PT.check/skip/step/dummyRing/frameStats/countEvents/fixture`).
  Checks that need a later-wave module are SKIPped. 404s for module files that do not exist yet are not counted as console errors.
- `node tools/bootcheck.js` — 15 configs incl. one per class with `starter_<cls>`, the final boss, legacy configs, and the two boot-safety configs (`@noSkills`, `@noBosses`).
- `tools/playtest.js` / `playtest2.js` add `&path=all` (legacy keymap) unless the URL already has `path=` or `cls=none`; viewport 640×360.
  `playtest.js --quick` skips screenshots and exits 1 on a LEGACY CHECKS failure (19 classic reactions/fusions, golem → `reveal`, no victory).
  `playtest2.js` story: `&cls=none&cine=1`, class panel pick (`ui._parts.classPanel.pick('sword', {noConfirm:true})`), the v3 training steps,
  the `legacy_master_lightning` preset before the R finisher, golem → `reveal` (not victory).
- `tools/playtest3/core.js` check 11: village / plains / Mirwen / Elderwood and the plateau with nidhoggra phase 1 and 2 — calls, tris, programs,
  and frame time (`updateMs` = simulation step without rendering, `frameMs` = step + SwiftShader render).

##### Integration (wave 4) — resolved requests
- core: `stats` add key `maxStaminaAdd` (+ `maxStaminaMul`) in `derived().maxStamina`; `game.post.GRADES` has `dusk` / `golden`; `pathChosen` bridge dropped;
  playtest3 core clears the skills `breadth` source before the "rx keys default 1" assertion.
- player: `grantIframes(s)`, `addShield(amount, s, {element})` (combat subtracts `entity.shieldHp` before HP), `refundDash(n)`, `startGlide()`, `addResolve(n)`,
  `restoreMp(n)`, `refreshStats()`, `getWeaponBase('main'|'off', out)`; reads `dodgeCdMul`, `freeSprintOOC`, `noRegenPause` / `noRegenPauseInWater`.
- combat: `combat.enqueue(delay, fn, depth)`; `damage` carries `backstab`, `charged`, `slot`, `headshot`; reads `burnDurAdd`, `burnTickMul`, `wetDurAdd`,
  `frozenDurAdd`, `frozenDurMul`, `chillSlowAdd`, `shockedTakenAdd`, `seededDotMul`, `iceUnfrozenMul`, `airDmgMul`, `headshotMul` (bow hits above 78 % height),
  `nonNatureHealMul` (regen / nature heals exempt), `selfElectroImmune`, `corrodeNoFadeInCurse`, `swirlTwoAuras`, `swirlRadiusAdd`, `chainThroughWater` +
  `chainWaterRange`, `judgmentSplash`, `crystalShieldMul`, `podHealAdd`, `slamJudgment` (hammer heavy → judgment at 3), `lethalSave` + `lethalSaveCd`;
  `ice.prison`'s `shatterMul` is honoured by the shatter handler.
- world: `world.platformAt(x, z, yHint)`, `world.isTallGrass(x, z)`, `surface.isGrass/isTallGrass/meltIce/regrow`, `surface2.isOvergrowth` alias.
- enemies: `setSightMul(e, mul, dur)` + per-enemy `sightMul`/`sightMulUntil` in the sight check; `reflectProjectiles(origin, dir, len, deg)`.
- magic: light beams refract with `lightRefract`. melee: i-frames through `player.grantIframes`; the left dagger trail uses `getWeaponBase('off')`.
- ui: victory screen "에필로그 계속" → `story.continueEpilogue()`; `tree_open` cue on opening the tree.
- story: the 바람 깃털 bonus is the `story:feather {maxStaminaAdd: 20}` source (cleared on a new game); training defers `quick` until something is slotted
  (a fresh class has no quick skill before the `learn` step).
- Not done (optional / no consumer yet): enemy lightning bolts striking lightning rods first; `revealedUntil` (no stealthed enemy type exists);
  a skills recast hook (`opts.recast`); a dedicated water-walk flag (magic keeps its platform discs).

#### skills — module notes (v3, wave 1) — `docs/v3/notes/skills.md`

Files: `src/skills.js` (factory), `src/skills/{runtime,adapters,fallback,classkits,talents,procs,familiars,tooltip}.js`,
`src/skills/trees/{_shape,index,fire,ice,lightning,wind,earth,water,nature,light,shadow}.js`, `tools/playtest3/skills.js`.
Static imports: own files, `src/core/*`, `three` only (rule 7). Renaming `src/skills/` away boots on the core stub (bootcheck `@noSkills`).

##### Data (`src/skills/trees/*`)
- `_shape.js` `buildTree(el, spec)` materialises every node from the DESIGN §6.1 shape: `slotRole` → tier / cost / maxRank / type / `pos`,
  the prerequisite rule (a3/a4/u → attune, m1 → a2, m2 → a3, m3 → t4, ult/sig → `requiresAny [a3,a4]`, rx → p1, key/p2 → rx, sup/t4/cap → ult),
  `modifies` + `exclusive` pairs, `grants` (attune → basic+charged, actives → own id, ult/sup, cap → awakened+finisher), `primaryOnly` (tier ≥ 4).
  Skill defs get `id`, `element`, `node`, `slotRole`, `modifiers` stamped. `RX_BY_ELEMENT` + `rxBonus(el)` turn "<el> reactions +15%" into `rx_<id>` mods.
- 9 tree files: 175 nodes (19 classic / 20 new), 103 castable defs (30 legacy-backed via `legacy.spell`; the 4 new elements' basic/charged
  carry `legacy.sword` so melee's `playLegacy` can present them). Params are unscaled base numbers; statuses use `{dur}` / `{stacks}` objects;
  every quick active has a `twist` tag (DESIGN §13.1); Korean `nameKo`/`desc` everywhere; passives with ranks have `descRank(r)` for tooltips.
  `custom` marks bespoke ultimates (water/nature/light/shadow `.ult` / `.awakened`) — magic/melee `registerImpl` under the skill id.
- `index.js`: `TREES` (ALL_ELEMENTS order), `EXTRA_SKILLS` (`breadth.finisher` 원소 교향곡, DESIGN §5.7), `PRESETS`
  (`legacy_all`, `legacy_master_<classic>`, `showcase_<el>`, `starter_<cls>` = 3 pts, `act2_<cls>` = 20, `endgame_<cls>` = 38 with loadouts; always the `a` modifier),
  `presetCost(name)`. The ui fallback may `await import('./skills/trees/index.js')`.

##### Factory (`src/skills.js`)
Builds `defs` (Map, 104 incl. the breadth finisher), `nodes` (Map, 175), `trees`; calls `progression.registerTrees(TREES)` and forwards
`registerImpl/registerArchetype` to `game.archetypes` — all inside the factory (CONTRACT §2). `init()` refreshes talents/procs/kits/attune.
`update(dt, realDt)` = runtime → procs → class kits/familiars. `warmup()`/`prewarm()` return the familiar InstancedMesh.
Extra API: `def(id)`, `node(id)`, `tooltip(nodeOrSkillId, {rank})` (P1: `{title, lines, current, next, text}` with "현재 → 다음"), `kits`, `procs`,
`talents`, `familiars`, `adapters`, `lastPath` (`impl|legacy|archetype|casterArchetype|cinematic|generic`), `skillForSlot(slot)`, `lastCast`.

##### Runtime (`runtime.js`) — CONTRACT §7.2
- **Cast pipeline:** gate (hasSkill unless free/test, cooldown/charges, `combat.canAct`, finisher needs `canFinisher`) → resource
  (`spendMp` caster / `spendResolve` melee = cost × 0.8; free via resonance `freeNext` (`nextMul` → `hit.castMul`, then `stats.consume`),
  mage 원소 연쇄 3 stacks (+30%), ranger `focusFreeCast` during focus; lightning keystone `castHpCost`) → auto-attune (once; setters silent) →
  resolve: `getImpl(id|custom)` → legacy adapters → finisher cinematic (`cinematic.finisher({element, cls, onImpact})`) → family archetype →
  caster archetype from the weapon tip (melee "검기") → **generic fallback** (`fallback.js`, logged once per archetype/family).
- **Events:** exactly one `skillCast {id, element, slot, cls, family, origin, path}`; `spellCast` is counted by a listener — if the performing
  (legacy) code did not emit it, skills emits `{element, kind, spellId}` once (kind basic/heavy/ultimate/skill). `skillFail` + legacy `spellFail`.
- **Cooldowns:** per id, `cd × cdrMul`, ticked in compensated time (`timeScale.comp()`); `charges`/`recharge` (lightning.mine; `lightning.m2b` gives 2).
- **ctx** (§7.3): `{game, skillId, def, element, params (effectiveParams), family, style, cls, origin, aim, charge, slot, awakened, castMul, S, M,
  hit(base) (adds skillId, slot, element, source = player entity, tier, castMul, charged/finisher flags, +1 stack when awakened), after(t, fn),
  powerForDisplay, baseDamage()}`. Breadth awakening (방랑자의 각성) makes X cast the equipped ult with `awakened` (+30%, +1 stack).
- **effectiveParams:** def params deep-merged with learned modifiers' params; cached per progression `rev`; never scaled.
- **attune(el, {silent})**: only `unlockedElements()`; emits `attuneChanged` + legacy `elementChanged` once; v3 setters get `{silent:true}`,
  v2 setters (which emit) run muted. `cycleAttune` on Z / wheel (0.15 s debounce).
- **Loadout:** `equip/unequip/canEquip` (the ONE rule: out of combat, or `ui.skillTreeOpen` + paused + no damage for 5 s; reasons
  `unlearned|slot|combat`), `autoEquip` on `skillLearned`; `skillUnlearned`/`respec`: unequip unlearned, clear `buff:<id>`, despawn summons
  (`spells.api.despawnSummon(id)` if present), refresh familiars. X → `<el>.awakened` when its capstone is learned; R → attuned finisher
  (or any learned, or `breadth.finisher`).
- **Input** only when `game.keymapMode === 'v3'` (`ownsInput`): LMB (hold-to-cast), RMB hold/release (charge, `chargeSpeedMul`), 1–4, X, G, R, Z, wheel, V
  (`useGift` → `enemies.bosses.gift.use()`). Never F. Legacy keymap reads nothing.
- **HUD** (§7.5): one reused object; reused `elements` (pooled entries) / `slots` (9 entries) arrays; v2 `element`/`index` mirrors.
  Slot entries add `charges`. `signature` filled by class kits.
- `serialize()` = `{q1..q4, ult, sup, attuned}`; `deserialize` drops unlearned/mis-slotted ids. `applyPreset(name)` → `setRanks(…, {ignoreGates})`
  + preset loadout + autoEquip + preset attune; `false` for unknown names.

##### Class kits (`classkits.js`) — by `CLASS_DEFS[cls].signature`
- `attunement` (mage 원소 연쇄): a non-basic cast of a different element within 3 s → +1 stack (max 3; `chainRefundMp` talent); at 3 the next skill is free, +30%.
- `enchant` (sword): +4 per landed hit (+8 on reaction); full + perfect parry (`blocked{parried|perfect}` or `parry`) → 8 m cone wave, 80 + element status;
  `player.setEnchantGlow?.(0..1)` at 10 Hz.
- `focus` (ranger): signature = stamina/maxStamina, `extra` = focus active (player owns the slow-mo).
- `seal` (paladin): every 4 blocks or 8 hits → `spells.api.zones.spawn('holy', …)`; fallback = `proc:seal` stats source while inside (rule 11). Emits `sealPlanted`.
- `familiars` (spiritcaller): up to 2 (+1 `familiarSlotsAdd`) wisps for the most-invested trees with ≥ 3 points; they shoot the element's basic at 50 % every 1.6 s
  (≤ 18 m). `familiars.js`: ONE InstancedMesh (cores + halos + 10 pooled bolts + glows), instance colours set at construction, hidden when idle,
  sparkle trails through pooled `vfx.burst`. Emits `familiarSpawn/End`.
- `marks` (shadowblade): every hit +1 `marked` (combat status; WeakMap fallback while combat is v2); backstab or charged hit detonates +12 %/mark as shadow
  damage (`detonateRefund`, `markExecute` talents); tall-grass stealth via `enemies.setPlayerStealth` at 4 Hz.

##### Talents / breadth / procs
- `talents.js`: `talent:<id>` sources from `classes.talentsFor(cls, level, choice)` (numbers in `TALENT_MODS`), refreshed on classChosen/levelUp/talentChosen.
  `breadth` source `{rxAll: 1 + 0.04 × trees≥5 (max 4), breadthAwakened}` refreshed on learn/unlearn/respec.
- `procs.js`: node `procs:[{event, fn}]` dispatched by one listener per event to the learned nodes' procs; `tick` procs at 4 Hz; re-entry guarded
  (proc hits never proc). Dynamic sources use `proc:<id>` (earth.cap, water.cap, nature.cap, shadow.cap, seal). Buff riders: `params.hits`
  (서리 반격: 3 hits taken, freezes attackers) and next-hit riders (`nextCrit/nextHit/firstHit`) act on the `buff:<id>` source.
- Node passive `mods(rank)` are applied by **progression** (`node:<id>`); skills never sets `node:` sources.

##### Tests
`node tools/playtest3.js skills` (≈ 85 s): static rule 7/8/9 + F grep; data shape (175 nodes, 103 defs, 30 legacy, tiers/costs/prereqs/exclusives,
exact ids, v3.1 names, archetype names, status schema, twists, Korean); presets; runtime (HUD reuse, attune event counts, equip rule, cooldowns,
charges, freeNext, effectiveParams, respec cleanup, save round trip, talents, breadth, tooltip, archetype/impl resolution); mage 원소 연쇄; v3 input
(F casts nothing, X, 1, Z, RMB charge); legacy keymap reads nothing; **check 5** for all 6 classes (endgame + showcase: every skill has an effect,
exactly one skillCast/spellCast, ≤ 1 elementChanged); spells+sword stubbed; spiritcaller familiars. Dummies are ringed at 4.5 m (not 6) so the
smallest novas (r 5) reach them before the real archetypes land.

#### combat — module notes (v3) — `docs/v3/notes/combat.md`

Owner: **combat** (combat + all VFX). Files: `src/combat.js`, `src/combat/{statuses,reactions,pipeline,break,resonance,statusfx,fxassets}.js`,
`src/vfx.js`, `src/vfx/{feel,presets2,telegraph,dissolve,runes}.js` (+ the existing `particles, ground, beam, trail, debris, presets, textures`),
`tools/playtest3/combat.js`. (Smears and wind lines live in `vfx/runes.js`.)

##### Combat (`game.combat`)
- `combat.js` assembles the parts and keeps the v2 surface: `register/unregister`, `dealDamage`, `applyStatus/hasStatus/clearStatus`,
  `canAct/speedMul`, `queryRadius/raycastEntities/getCenter`, `discover`, `REACTIONS` (codex: 49 unique ids, the old 19 first in order), `FOES`, `isFoe`, `isPlayerSource`, `_warm(group)`.
- New: `REACTION_DEFS`, `STATUS_DEFS`, `FAMILIES`, `BY_TRIGGER`, `BY_OBJECT`, `P0_IDS`/`P1_IDS`, `statusInfo(id)`, `stacksOf(t, id)`, `canMove(e)`, `isAura(t, id)`,
  `previewReaction(t, el)` (no side effects; returns a reused `{id, nameKo, family}`), `reactObject(obj, el, hit)`, `debugReact(id, t)`,
  `addBreak(t, n)`, `isBroken(t)`, `drainShield(t, n)`, `healPlayer(amount, source, {hot})`, `registerAlly/unregisterAlly`, `allies`,
  `registerObject/unregisterObject` (combat-side reactive objects when `spells.api.objects` is absent — tests and fallbacks), `resonance`, `lastFormula` (debug), `prewarm()`.
- `init()` listens to `blocked {parried}` (+15 break on the parried attacker) and `stateChange` (title → reset queues).

###### statuses.js
- `STATUS_DEFS` = CONTRACT §8.1 table (Korean names) + reaction-owned `necroflame`, `broken`, `cursedMist`. `shocked` carries `element:'lightning'` (needed for the matrix).
- `applyStatus(t, name, seconds, extra={stacks, source, power, el})` (signature kept). Stacks via `extra.stacks` (default 1 per hit = buildup), capped by
  `stack.max` + `stats.get(maxStat)` for player sources. `chilled` → `frozen` at 6 stacks − `stats.chillToFreezeAdd`. `st.el` tags the element (defaults to the
  def's element); `st.power` = power snapshot (DoT ticks use it as `hit.powerSnap`). Boss rules: `bossMul` duration, `bossImmune` (rooted → +40 break).
  `burnImmune` / `blightImmune` flags on the player. v2 DR immunity windows kept.
- Aura = def with `element` (or `aura:true` for `airborne`, `auraAs:'chilled'` for `frozen`) and an element-tagged `st.el`. `stunned` is `aura:false`.
- `t.auraOrder` ring (≤ 8, newest first) is updated on apply/refresh and on removal.
- Per-frame tick: DoTs (`burning` 6/0.5 s, holy ×1.5; `seeded` 2×stacks/1 s nature; `necroflame` 10/0.5 s, 30 % heals the player; `shocked` 3/0.9 s + micro-stun),
  burning contact spread, dummy refill. `takenMul(t, el)` = exposed ×1.3, hexed ×1.2, broken ×1.5, corroded +5 %/stack, radiant +3 %/stack (light).

###### reactions.js
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

###### pipeline.js (`dealDamage`) — the canonical formula (CONTRACT §8.3), the ONLY place player damage is scaled
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

###### break.js / resonance.js
- Break: `breakMax`/`breakValue`; hit drain `poise (default dmg×0.5) × (earth/lightning 1.5) × (reaction 3) × (encrusted 1.2) × stats.poiseMul`, parry +15, rooted-on-boss +40.
  At 0: `broken` 4 s (mid-boss 3 s), `onBreak()`, `timeScale.set('break', 0.05, 0.25)`, hitFeel('break'), `break {target}` + `reaction {id:'break'}`; refill after 6 s → `breakRecover`.
- Void shield: numeric `entity.voidShield`; ×0.3 while > 0; drain poise × (light 4 | reaction 2 | 1); break empties it; `voidShieldBroken {target}`; a light hit on a
  shielded target fires 정화 (variant `shield`).
- Resonance: 3 distinct reaction ids on one target within 6 s → `resonance {target, ids}`, `reaction {id:'resonance'}`, `stats.set('rx:resonance', {freeNext, nextMul:1.3}, {duration:8})`; ICD 10 s.

###### statusfx.js (status visuals)
Global InstancedMesh batches (≈ 1 draw call per kind regardless of enemy count): tint shell (per-instance colour, `setColorAt` at construction), flames
(normal/holy/necro), frozen ice block + spikes (+ instanced outlines), stun/break stars, encrusted rock chips, rooted vine ring. Particles: drips, mud, frost,
seed spores, corrosion smoke (normal-blended), dazzle sparkles, sleep bubbles, and **stack pips** (orbiting motes, count = stacks, for radiant/corroded/seeded/
marked/chilled). Shocked arcs share a 14/s budget. `fxassets.js` holds combat's own copies of the shared shaders (no static import of `spells/*`, rule 7).

##### VFX (`game.vfx`)
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

##### Tests
`node tools/playtest3.js combat` — registry shape (49 / 35 / 14), Korean data, rule 7/8/9 greps, DESIGN §15 balance sim, `debug.react` for all 49 ids, natural
triggers for the 35 P0 ids, the §4.5 priority worked example, the judgment cooldown, the 16-pod chain (≤ 3 cascades/frame, ≤ 4 full presets/frame), the formula
(L1 = 100, stats crit, DoT power snapshot), hitFeel single caller, break/voidShield/resonance, stack schema/caps/상극/boss rules, healPlayer + the boss HoT cap,
VFX (atlas, presets for 9 elements without new lights, telegraph radius, dissolve without compiles, runes/smears/decals/wind), the reaction stress spot
(camp-0 meadow, 12 enemies, pods, puddle, tornado: calls ≤ 350, tris ≤ 900k, programs constant) and the legacy `applyStatus` signature in `path=all` mode.

#### player — module notes (v3) — `docs/v3/notes/player.md`

Owner: **player**. Files: `src/player.js`, `src/player/*`, `tools/playtest3/player.js`.

##### Files

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

##### API (additions, CONTRACT §10)

- `setClass(cls)` (any of the 6 ids; null = villager look). Also driven by `classChosen`, `classChanged` and the legacy `pathChosen`.
- `maxHp / maxMp / maxResolve / maxStamina` (stat-driven), `mp`, `resolve`, `stamina`, `resource` (`'mp'|'resolve'`), `family`, `style`, `kit`.
- `spendMp(n)`, `spendResolve(n)` (casters fall through to MP), `spendStamina(n)` → boolean.
- `getWeaponTip(which = 'main'|'off', out?)`: staff/totem gem · bow nock (off: grip) · longsword tip (off: buckler) · hammer head (off: shield face) · daggers R tip (off: L tip). Sheathed weapons report their sheath. `getSwordTip/Base` return the current melee weapon's sockets; `getStaffTip` falls back to the weapon tip when there is no staff.
- `inCombat()`, `lastHurtT` (get/set), `regen` (read-only state), `timeComp()` (1/timeScale while `focus` is active, and in the perfect-dodge 반격 window), `focusing`, `superArmor`, `debugState()` (tests).
- `player.mods` is a **getter view** over `game.stats` (`doubleJump` → `extraJumps > 0`). Writes from not-yet-converted legacy code are forwarded into the stats source `legacy:mods` instead of throwing.
- `playCast(kind, el)` accepts the 12 kinds; `setCharging(active, el, frac)` drives the bow draw for the bow style.
- `getDefenseHud()` keeps the v2 shape (`block.type` = `barrier|guard`) and adds `dodgeType, defendType, dodgeName, defendName, ward:{frac, broken}, focus, counter`.

##### Kits (DESIGN §2.2)

| Class | Q (dodge) | E (defend) |
|---|---|---|
| 마법사 | 점멸 7 m, 0.2 s i-frames, perfect → MP refund | 마법 방벽: 80 % DR, MP drain, perfect 0.2 s → parry/reflect |
| 검사 | 대시 스텝 6 m, 2 charges, afterimages | 가드 70 % DR (stamina), perfect 0.18 s → parry + counter window |
| 궁수 | 백덤블링 6 m back + hop, 0.3 s i-frames, full backflip pose | 집중: E held while airborne / gliding / ≤ 0.6 s after a dodge → `timeScale.set('focus', 0.35, 0.2)` every frame, 25 stamina/s (real time), focusStart/End; on the ground E aims without slow motion |
| 성기사 | 방패 돌격 스텝 4 m, super armor 0.38 s (no flinch, no knockback) | 방패 막기: 85 % frontal block, perfect 0.2 s → parry (reflect with the Lv10 talent), Lv25a −40 % stamina |
| 정령술사 | 정령 교대 5 m blink + a wisp decoy that absorbs one hit (offered to `enemies.setTauntTarget`) | 정령 결계: 60 % DR dome, capacity 35 % maxHp, breaks and recharges over 8 s |
| 암살자 | 그림자 구르기, 2 charges, 0.4 s i-frames, perfect → teleport behind the attacker | 반격 자세: 0.3 s window; a hit inside it is negated, the hero teleports behind the attacker and the next hit crits (stats source `kit:counterCrit`, cleared by the next landed hit) |

Parry windows add `stats.parryWindowAdd` and +0.1 s against a `dazzled` attacker. Talents used here: mage.t20 (blink rune, 30 damage after 1.5 s), ranger.t25b (+15 stamina), paladin.t10 / t25a, shadowblade.t25b (`enemies.setPlayerStealth`).

##### HP regen (CONTRACT §10.3)

`onBeforeDamage` snapshots HP first (for every hit, DoT included); `onHit`/`onDeath` compare after the block refunds and after the legacy `dmgTakenMul` refund (only when combat has no `healPlayer`, i.e. v2 combat; v3 combat applies `dmgTakenMul` itself). `inCombat()` = hurt within 3 s or `enemies.anyAggroWithin(pos, 30)` (plus a 10 Hz fallback scan for aggroed / `debugAggro` entities). Delay 5 / 3 s (+`regenDelayAdd`, floor 1, ×0.5 blessed), rate 1.5 % / 8 % (×`regenRateMul` + `regenRateAdd`, +1 %/s blessed, ×0.6 with a boss within 75 m), a 1 s smoothstep ramp, healing through `combat.healPlayer(…, 'regen', {hot:true})`. Disabled by death, `regenDisabled` and `blight`. The first start calls `ui.tip('regen', '피해를 받지 않으면 체력이 자동으로 회복됩니다')`.

##### Platforms / bounds

Movement, slope probes and the blink path use `world.getGroundHeight(x, z, yHint)` with the hero's height. When grounded, `world.platformAt(x, z, y)` (feature-detected) returns the platform handle; its `delta` is added each frame. `world.clampToBounds(pos)` replaces both radial clamps (the legacy radial clamp is the fallback). No kill plane.

##### Events emitted

Existing: `jump, land{height}, footstep, glideStart/End, updraftEnter/Exit, blink{kit}, dash{kit}, perfectDodge{kit}, parry{kit}, guardBreak, playerDeath, playerRespawn, blocked`.
New: `hpRegenStart {rate}`, `hpRegenStop {reason}`, `focusStart`, `focusEnd`, `dodge {type}`, `counterStance`, `counter`, `decoyPop`, `wardBreak`, `hardLanding {height}`.

##### Perf

All class gear merges into the existing skinned draws: the hero rig stays at 51 skinned draw calls, 22.2k → 29.7k triangles (+7.5k, budget 18k), 118 → 246 bones. No new lights and no new rig materials (string/feathers reuse the blade material, dark cloth reuses cloth). Per-frame code uses module scratch objects; the `vfx.burst` options for regen motes are reused. Springs and IK run every frame (player only). `bootcheck`: draw calls, triangles and program counts unchanged per config (234 calls / 121 programs for mage).

##### Tests

`node tools/playtest3.js player` covers: the rule 8/9 grep; check 7 (regen, on `debug.regenState()`); per class: identity/family/style/resource, stat-driven maxima keep their %, `mods` getters, weapon prop visible + sockets, drawn weapons, dodge (start, cost, i-frames / super armor, distance, decoy), defend (barrier/guard/shield/ward reduction, perfect parry, counter teleport + crit, focus time scale + timeComp + drain), springs bounded, IK sane, all cast kinds; bounds; platforms (world if present, otherwise a labelled test double); legacy `mods` writers; rig perf.

#### world — module notes (v3, wave 1) — `docs/v3/notes/world.md`

Files: `src/world.js`, `src/world/{zones,terraform,mirwen,elderwood,plateau,gates,platforms,colliders,surface2}.js` (new),
`src/world/{terrain,flora,structures,village}.js` (changed), `tools/playtest3/world.js`.

##### Layout data — `world/zones.js` (pure data, Korean names)
- `TF` terraform parameters (Mirwen ellipse + 8 islands + west waterfall cliff + cave slot + shore pad; Elderwood glade, hollow,
  root ridges + gaps, giant mushroom, spore vent; ledge (60,−150) r18 top 38; plateau (108,−132) r34 top 52; 5 pillars r22 h+12;
  ascent valley polyline; 2 root ramps; mirror alcove). `ARENA_DEFS`, `ZONE_DEFS` (getZoneAt priority order), `GATE_DEFS`,
  `SHRINE_DEFS` (8 seeds, 4 spirit, 8 landmarks), `ZONE_SIGNS`, `ZONE_NPCS`, `STAGE_ACT`, `EXTRA_GRADES` (dusk, golden), `WATER` (= WATER_LEVEL 1.5).

##### Terraform — `world/terraform.js`
- `terraform(x, z, h, T, arenaW)` runs at the end of `terrain.fullHeight`, so the baked grid (no resize) and every
  `getHeight` call site include it. Order: ascent valley carve (never inside the golem arena) → Mirwen basin (`smin`, floor
  WATER−2.5) + islands + hydra ruin-pillar spikes + waterfall cliff + cave slot + shore pad → Elderwood glade/hollow flatten
  (targets `T.glade`, `T.hollow` from `avgRaw`) + additive root ridges → plateau mesa (terraced cliff) → ledge mesa (inside its
  rim the ledge wins; outside it only raises — the two rims touch) → alcove ring → plateau pillar spires → root ramps (max).
- `terraformColor(...)` recolours the vertex colours (teal moss Mirwen, ash + violet rot Elderwood, bark ridges, lavender
  ledge stone with moss, bark/moss plateau, bark ramps) and returns the grass density multiplier.
- `floraBlocked(x, z, margin)` is called from `flora.allowed()` (arenas, plateau/ledge, ramps, gate pads, rot-wall gaps, cave, mushroom).
  Elderwood trees are denser and ash-tinted (`elderwoodWeight`).
- Exports `PILLARS` (5 root pillars), `HYDRA_PILLARS` (6), `RIDGE_GAPS` (= the 3 rot wall spots), `ridgeAdd`.

##### Runtime API (CONTRACT §13) on `game.world`
- `zones` (array; `{id, name, center, radius, level, grade, music, fuel, arena:{id, position, radius}, npcSpots}`), `getZoneAt(x,z)`,
  `zoneById`. The player's zone is checked at 4 Hz (real time, every state) → `zoneEnter` / `zoneExit {zoneId, name, level}`.
  On zoneEnter world blends `game.post.grade(zone.grade, GRADE_BLEND)` (skipped while a boss is alive) and lerps the scene fog
  toward twilight (Mirwen) / ash (Elderwood) — never during a cutscene. `dusk`/`golden` are added to `game.post.GRADES` at runtime if core lacks them.
- `bossArenas.{golem, hydra, nox, treant, kalis, nidhoggra}`: `{id, position (y = getHeight), radius}`; `hydra.pillars[6]`,
  `hydra.surfaceY/waterLevel`; `kalis.mirrors[{position, yaw, normal}]`; `nidhoggra.pillars[5]{pos, top}`. `bossArena` = golem.
- `getGroundHeight(x, z, yHint)`: max(terrain, spire top, ice discs, and **only with a yHint** the platforms/static tops with
  `top ≤ yHint + 1.2`). `world.groundPlatform` = the handle that won the last call (read `.delta` to ride it).
- `addPlatform({id, shape:'disc'|'box', center, r|size, top, life, yaw})` → handle `{id, top, center, velocity, delta, moveTo(x, top, z, dt), alive}`;
  `removePlatform(h)`; `platforms` (live). 8 m buckets, ≤ 16 dynamic (oldest recycled). `addStaticTop([{id,x,z,r,top}])` for
  permanent stand-on tops (giant mushroom caps). `delta` holds the movement of the frame it moved in and clears a frame later.
- `addTempCollider({shape:'box'|'cyl', pos, size|r, h, yaw, life, blocksProjectiles, onProjectile, blocksMovement=true})` → handle
  (also pushed into `world.colliders`; boxes are OBBs in `resolveCollision`); `removeCollider(h)`, `moveCollider(h, x, y, z, yaw)`;
  `collidersBlockingProjectiles` (live); `projectileBlockAt(projOrVec3, out?)` → `'block' | 'reflect' | null` (8 m buckets;
  `out.collider`, `out.normal`; an `onProjectile` returning `'pass'` lets it through).
- `addUpdraft({pos, r, h, strength, life, color, visual})` / `removeUpdraft(h)` / `updraftAt(pos)`; merged into
  `surface.getUpdraft(pos)` (max of fire and volumes). ≤ 16 volumes; one instanced additive column draws all of them.
  Static: `ascent1..3` (valley → ledge → plateau) and `pillar0..4` (one per root pillar).
- `clampToBounds(pos, radius)`: circle r 170 plus the plateau / ledge AABBs; `resolveCollision` uses it. `world.bounds` is now
  222 so legacy radial clamps never cut the plateau off (`world.boundsRadius` = 170).
- `gates` `[{id, zoneId, name, zoneName, position, exit, yaw, reached}]`, `travelTo(id, {force, instant})` (1.2 s fade, real
  time, input lock `'gate'`, emits `gateTravel {from, to}`), `openGateMenu(id)`. Walking within 14 m reaches a gate (`gateReached {id, name}`).
  Interact offers `gate:<id>` (label 정령의 문) → `ui.openGateMenu(list, onPick)` with `list = [{id, name, zoneId, zoneName, reached, current}]`;
  without it F cycles to the next reached gate. `respecSpots` = altar + 5 gates. `lastGateSpawn()`.
- `shrines` `[{id, kind, name, element, position, found}]`, `markShrine(id)`; proximity 3 m (|dy| < 2.6) at 4 Hz → `shrineFound {id, kind}`.
  Spirit shrines also offer `shrine:<id>` (F → `shrineUse {id, element}`). `setShrineGlow(id, on)` ('altar' → altar crystals).
- `setActVisible(act)` (explicit calls win; fallback = `STAGE_ACT[story.stage]` at 1 Hz and `bossSpawn` kalis/nidhoggra → act 4).
  Scenery islands I1–I5 are visible from act 4.
- Rot walls: `rotWalls [{id:'rot1'..'rot3', position, state:'intact'|'burned'|'purified'|'smashed'}]`, `setRotWalls(state|{id:state})`,
  `burnRotWall/purifyRotWall/smashRotWall(id)`, `rotWallsCleared()`. Each wall is a combat prop (`isProp`, `xpValue 0`,
  registered in `world.init`): a fire hit burns it, light purifies it, and earth heavy / tier ≥ 2 / tag `colossus|smash` smashes it. A grass
  fire touching it burns it. Emits `rotWallCleared {id, how, cleared, total}`. Offers `rotwall:<id>` (a hint).
  Walls rot1/rot2 seal the deep wood (forest heart, 실바니아's grove, the treant hollow); rot3 seals the seed pocket.
- Mirror door on the ledge (seed shrine behind it): `mirrorDoor`, `openMirrorDoor()`; a light hit (or tag `prism`) opens it → `mirrorDoorOpen`.
- `setBossFightLOD(on)` (grass ≤ 0.25, flora draw distance ≤ 0.3, smaller flora shadow radius); also auto-toggled on
  `bossSpawn`/`bossDefeated` for nidhoggra. `bossFightLOD` getter.
- `surface2`: `mud/bless/curse/overgrow/rubble(pos, r, seconds)`, `isBlessed/isCursed/isMud/isOvergrown/isRubble(pos)`,
  `surfaceAt(pos)`, `timeLeft(name, pos)`, `clear(pos, r)`, `activeCount()`. 172² × 2 m grid, active lists, 10 Hz game time.
  Terrain tint: burn texture B = blessed (gold sheen), A = cursed (violet veins) in the terrain shader.
- `serialize()` → `{v, gates:{reached, found, last}, rotWalls, act, actExplicit, camps, mirrorDoor}`; `deserialize(o)` restores
  without re-emitting `shrineFound`/`rotWallCleared`.
- Village (`world.village`): the altar has one pillar per `ALL_ELEMENTS` entry (merged) and `InstancedMesh(crystals, ALL_ELEMENTS.length)`;
  the four lost spirits' crystals are dim until `spiritFreed` (instance colour only). New `npcSpots`: `rangerMentor`, `paladinMentor`,
  `spiritMentor`, `shadowMentor`, `sage`, `trainer`; `village.reactionDummy` spot. Zone NPC spots: `zones[mirwen].npcSpots.lakeKeeper`,
  `zones[elderwood].npcSpots.forestChild`.

##### Draw calls (playtest3 world perf, worst of 4 yaws, skills stubbed, no enemies)
village 256 · plains 222 · Mirwen 233 · Elderwood 231 · plateau 213 (targets 290/300/310/310/330). Zone groups cull at
`(150 + 250·drawDistance) × 0.6` and never cast shadows. Draw calls per zone: Mirwen 6, Elderwood 10, plateau + ledge 10, islands 3,
gates + shrines 6 (global), updraft columns 1. No new lights. Every new material is in the scene at boot, so the boot prewarm compiles it (the islands are
hidden, but compile still visits hidden objects). The program count does not grow when visiting every zone.

##### Tests
`node tools/playtest3.js world` runs 100 checks:
- zones, arenas and terraform; zone events; bounds
- platforms; colliders and projectile blocking
- updrafts and ascent glide reachability; ramp slopes
- the Mirwen freeze bridge; surface2
- rot walls via real combat hits
- gates: the interact prompt, F opens the menu and casts nothing, the 1.2 s travel, `gateTravel` emitted once
- seeds (+1 point); act visibility; the altar and NPC spots
- serialize, then deserialize in a fresh boot
- per-zone perf and the programs check
- walkability: a slope-limited BFS from the village reaches every zone

The void root channel (arena → plateau foot) is shown from act 2, for the reveal.

#### ui — module notes (v3, wave 1) — `docs/v3/notes/ui.md`

Files: `src/ui.js` (factory `createUI(game)`), `src/ui.css`, `src/ui/*`:
`dom.js` (h/esc/formatKeys/anim queue), `text.js` (**all Korean UI strings**: tree, tour, tips, codex families, HUD, boss/victory cards,
controls panel rows, class/character labels), `icons.js` (9-element glyphs + void/physical, archetype glyphs `ARCH_GLYPH`, class silhouettes
`CLASS_SIL` by style, chain/shard icons; `ELEMENT_CSS` built from `elColor`), `skillTree.js`, `treeTour.js`, `hotbar3.js`, `bossbar.js`,
`prompt.js`, `gateMenu.js` (gate list + `createConfirm`), `classPanel.js`, `character.js`, `codex.js`, `settingsMenu.js`.
Static imports: own files, `src/core/*`, `three` only (rule 7). The tree's data fallback is `await import('../skills/trees/index.js')` in try/catch.
Checks: `node tools/playtest3.js ui` (≈ 35 s, 121 checks with the wave-1 modules merged; skills/combat/player-dependent checks SKIP when absent).

##### Public API (`game.ui`, CONTRACT §18)
- `openSkillTree(el?)` / `closeSkillTree()` / `skillTreeOpen` · `openCharacter()` / `closeCharacter()` / `characterOpen` ·
  `openCodex(page?)` / `closeCodex()` / `codexOpen` (v2 `setGrimoire(on)` / `grimoireOpen` are aliases) ·
  `openClassPanel({onPick, onCancel?, current?})` / `closeClassPanel()` / `classPanelOpen` ·
  `openGateMenu(gates, onPick)` / `closeGateMenu()` / `gateMenuOpen` (`gates = [{id, name, zoneId, zoneName, reached, current}]`; onPick only for reached, non-current gates) ·
  `confirm(text, onYes, onNo?)` (Enter = yes, Escape = no) · `startTreeTour()` · `tip(id, text) → boolean` (one time per id) ·
  `serializeTips()` / `deserializeTips(arr)` (for `story.serialize`) · `anyModalOpen` · plus the v2 `toast`, `showBanner`, `showCard`,
  `flash`, `hint`, `queueTutorial`, `openSettings`.
- Emits `treeClosed {}` when the tree closes and `altarLeave {from:'class'|'gate'}` when the class panel / gate list closes (save.js autosave triggers).
- Test-only introspection: `_parts` (tree, tour, charSheet, codex, classPanel, gateMenu, confirmBox, prompt, hb3, bossBar) and `_cardLog`.

##### Modals
One registry (`MODALS` in ui.js, Escape priority: confirm → tour → settings → controls → gate → class → tree → character → codex).
`syncModalLock()` = `input.lock('menu')` while any modal is open, plus the pause panel. The pausing menus (`gate`, `class`, `tree`, `character`,
`codex`) call `game.pause()` when opened from `playing` and `game.resume()` when the last one closes. Opened from the pause menu, they return to it.
K / C / Tab toggle (and switch between) the three menus, read through `input.raw`. `applyState` closes the menus when the state leaves
playing/paused. The class panel survives `dialogue`/`cutscene`, because story opens it from a talk.

##### HUD
- **Hotbar:** `activeSkills().getHudState()`. When `hs.v === 3`, `hotbar3.js` draws 9 slots (LMB RMB 1–4 X G R): archetype glyph on an element
  frame, cooldown sweep, cost in MP/투지, low-resource tint, charges, the empty-slot state, the awakening ring on R and the V gift prompt from `hs.gift`.
  It also draws the attune gem arc from `hs.elements` (the attuned gem is big and glowing; 0-point elements are dimmed with a lock; points
  under each gem) and the signature widget from `hs.signature.kind` (attunement = 3 연쇄 orbs, enchant/focus = bar, seal = pips, familiars = icons,
  marks = count). Otherwise the v2 renderer runs, with the 5 classic gems.
- **Vitals:** HP / resource / stamina from `player.maxHp/maxMp/maxResolve/maxStamina`. `data-res="mp|resolve"` and `data-fam` sit on
  `.aw-vitals`/`.aw-hud` (no class ids). A regen strip under HP shows the delay progress from `player.regen.delayLeft/delay`, and the HP bar
  shimmers while `regen.active`. Level badge on the heart, a thin XP bar, the "[K] 스킬 포인트 N" pip, the level-up card with a gold ring burst
  and the `level_up` sfx, and "+N XP" numbers at the kill position (from `kill`/`damage`).
- **Enemy bars:** `STATUS_KEYS` come from `combat.STATUS_DEFS` (minus `playerOnly`; fallback: the old 7), plus the `voidShield` pseudo-pip.
  Stack statuses show digits. The break gauge shows when `breakMax` is set, the broken state comes from `combat.isBroken`, and weakness icons come
  from `entity.weakness` (string or array, optional). "다음 타격" runs at 10 Hz from `combat.previewReaction(aimTarget, skills.attuned)`; the
  reacting aura pip is highlighted in the family colour. Pips, break and hint DOM are written at the 20 Hz tick; position and hp per frame.
- **Boss bar** (`bossbar.js`): name, title, sub, phase pips and parts come from the `bossSpawn` payload. It follows `payload.boss`, else
  `enemies.boss`. It shows the `bossPhase` name, the break gauge, the void overlay, part sub-bars with lock element icons (`boss.getPart(id)` or
  `boss.parts[]`) and a `lockStripped` flash. No boss names in code; fallback text is in `text.js` (`BOSS_KO`). Boss cards: spawn = `title|name|sub`,
  defeat = `격파|payload.name`.
- **Prompt** (`prompt.js`): one "[F] label" from `interactChanged` / `interact.current()`, hidden in menus and cinematics. ui never reads F.
- Flashes for `break`, `resonance` (교향!), `bossCheck` start/success/fail and `bossPhase`. Reaction banners carry the family colour.
- Delayed cards use a UI-clock queue (`later()`, realDt) instead of `setTimeout`, so stepped tests stay deterministic.

##### Menus
- **Skill tree** (`skillTree.js`): a ring of 9 sigils around the class emblem (primary gold, secondary silver, locked grey with a chain and the
  tooltip "◯◯·◯◯ 직업만 사용 가능" from `classesForElement`). A click zooms (CSS) into the constellation: 5 tier rows (the rune ring lights when the
  gate is met; struck through above `tierCap`), nodes at `pos.col/row`, SVG prerequisite lines (lit/open), "택1" tags between exclusive pairs.
  Node states: locked / avail (pulse) / nopts / learned / maxed / excl (crossed) / story (shard) / tierlock / planned.
  The detail panel shows name, type/tier/rank/cost badges, skill slot + MP·투지/cooldown, description, current → next (`skills.tooltip` or
  `descRank`), the modifier target, a caster/melee look note, the reactions it feeds, the gate reason, learn/unlearn and equip buttons.
  The header shows points (+ planned cost), mastery chips, respec status + 전체 초기화 (through `ui.confirm`), 직업 변경 at the altar
  (`canChangeClass` → class panel → `progression.changeClass`) and the planner toggle. The planner keeps a local rank map and evaluates the
  same rules as `progression.canLearn`; it never learns or equips. Quick-slot bar: drag a node onto 1–4/X/G, click a slot with a selected node,
  or hover + press 1–4/X/G → `skills.equip`; a rejection shows the `canEquip` reason. Learning plays a star flare + `skill_learn`.
  With skills stubbed it imports the tree data and calls `progression.registerTrees` (only if progression has none), so learning still works;
  if that import fails too it shows "스킬 데이터를 불러올 수 없습니다".
- **Tour/tips** (`treeTour.js`): 3 pages on the first tree open (not automatic in `?test` unless `&tour=1`). Tips: story-gated capstone, first
  exclusive pick, first mastery rank-up, unspent points within 30 m of a respec spot, first point after the class pick; skills' `emptySlot` tip.
- **Character** (C), **codex** (Tab: 6 families + 보편, "N / 49", family jump chips, animated mini icons per family, silhouettes "물 + 번개 …?",
  page 2 = learned skills by element), **class panel** (6 cards: silhouette, fantasy line, weapon, signature, gold/silver element chips, stat
  radar; "이 길로 간다" → confirm → `onPick(cls)`), **gate list**, **confirm**.
- **Settings:** new rows 난이도 (names from `settings.DIFFICULTY`), 화면 흔들림, 피해 숫자 표시 (`damageNumbers` off hides damage numbers), 효과 품질.
- **Controls panel** rebuilt from `CONTROLS` (K, C, Z, X, V, 1~4; F = 상호작용); `formatKeys` wraps the new keys. Title: 이어하기 when `save.has()`;
  모험 시작 / 새 게임 → `newGame({clearSave:true})`; the title shows all 9 element gems.

##### Perf
All DOM is built once (tree constellations lazily on the first open, ~180 nodes). Per frame: vitals, charge ring, numbers, bar positions.
20 Hz: hotbar, defense, statuses/break/hint DOM. 10 Hz: `previewReaction`. 4 Hz: objective/markers. No layout reads in the loop (the codex
family jump reads `offsetTop` on click only). No draw calls, no materials.

#### magic — module notes (v3, wave 2) — `docs/v3/notes/magic.md`

Files: `src/spells.js` (factory), `src/spells/{api,archetypes,bespoke,objects,zones2,summons,meshes2}.js` (new), and the v2 files
`src/spells/{assets,defs,master,projectiles,props,setpieces,zones}.js` (kept; `master.js` and `projectiles.js` edited). `tools/playtest3/magic.js`.
Static imports: own files, `src/core/*`, `three` / `three/addons/*` only (rule 7). No class literals (`familyOf`), no 5-element
assumptions in v3 code (`ALL_ELEMENTS`); `AWAKENED/SUPPORTS/FINISHERS` and `SPELLS` stay CLASSIC-only, nothing indexes `SPELLS['water_basic']`.

##### spells.js (CONTRACT §11)
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

##### game.spells.api (`spells/api.js`)
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

##### Archetypes (`spells/archetypes.js`, CONTRACT §7.3 caster half)
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

##### Bespoke (`spells/bespoke.js`, `registerImpl(id, 'caster', fn)`)
`water.ult` 대홍수 (flood zone + waves), `water.awakened` 대해일 (3 rolling tsunami lines, 30 s puddles), `nature.ult` 세계수의 분노 (ring of roots),
`nature.awakened` 세계수 강림 (sapling + overgrowth zone that roots/seeds/heals), `light.ult` 새벽의 심판 (sweeping prism beam), `light.awakened`
아스트라의 빛 (3 beams + sky lances), `shadow.ult` 어둠의 심연 / `shadow.awakened` 영겁의 밤 (black holes), `nature.treant` (summon), the redesigned
`ice.sup` 서리 반격 (buff; skills' rider freezes attackers) and `earth.sup` 도발의 석상 (taunt totem), and the finishers `water|nature|light|shadow.finisher`
through `game.cinematic.finisher({element, cls, name, target, center, onImpact, onEnd})` with a non-cinematic slow-mo fallback and safety nets.
All ultimates share `ultIntro` (timeScale 'ult', FOV kick, post pulse, sigils).

##### Summons & structures (`spells/summons.js`)
Pooled models built once (treant 1, totem 1, clone 2, beacon 2, mirror 2, light pillar 2), ≤ 4 alive, no shadows. Allies register with
`combat.registerAlly` (team 'player') and taunt via `enemies.setTauntTarget` (feature-detected). The treant walks to the nearest enemy and slams
after a wind-up; the totem's collider blocks projectiles and it erupts on death/expiry; the clone wets its attackers and bursts; the mirror reflects
3 enemy projectiles; the beacon reveals stealth/void, drains void shields and purifies blight; the light pillar is a relay + holy ground.
Structures: rock/ice eruptor pillars (S.props, instanced), glacier (2) and colossus fist (2) meshes, `world.addPlatform` / `addTempCollider`
handles cleaned up on expiry.

##### Perf
No new lights; every new material is compiled at boot (`prewarm` + the v2 warmup; programs stay at 140 through the full cast sweeps);
per-element tints are uniforms / instance colours; a zone is 1 draw call (+ pooled particles); objects are 1 call per kind; all pools are hard
caps. Area queries reuse arrays; hit objects are allocated per hit (event time), not per frame.

##### Tests (`tools/playtest3/magic.js`)
Class-literal grep; registration (24 archetypes + 13 impls); STATUS_OF; v3 input gating (LMB/F); silent setter; castById single emission;
stats buff conversion; every zone type and object kind spawns and expires; pod cap; pod + fire → combat reaction; prism refraction; CONTRACT §21
check 5 for mage/ranger/spiritcaller (endgame + showcase, one skillCast/spellCast, no generic fallback, no console errors); legacy keymap.

#### melee — module notes (v3) — `docs/v3/notes/melee.md`

Owner files: `src/sword.js`, `src/sword/*`, `tools/playtest3/melee.js`.

##### Map

| File | Role |
|---|---|
| `src/sword.js` | The melee engine (`game.sword`) for every class with `familyOf(cls) === 'melee'` (검사, 성기사, 암살자). Action timeline (pose templates + timed events + swept hit windows), buffering, cancel windows, soft-lock lunge (clamped to target − 0.8 m), blade sparks, smear, ribbon trails, charge presentation. Legacy keymap input (v2), v3 entry points (`api.playLegacy`, archetypes). |
| `src/sword/pose.js` | Melee-owned copy of the 16-float torso-space pose layout (`PF`, `SP`, `STANCE` incl. hammer/dagger idle + charge). Replaces the old static import of `player/swordpose.js` (rule 7). |
| `src/sword/anim.js` | Pose templates `TPL` (+ `hammerR/L`, `hammerSlam`, `shieldBash`, `hammerCharge`, `daggerR/L`, `daggerFlurry`, `daggerCross`, `backstab`, `daggerDash`, `reverseSlash`) and `tplFor(id, style)`: generic template ids map to the hammer / dagger poses. |
| `src/sword/weapons.js` | `WEAPONS` profiles `longsword / hammer / daggers` (`reachMul`, `arcMul`, `speedMul`, `hitstopMul`, `poiseMul`, `trail{width, life, noise, edge}`, `smear`, `tips`, `twoHanded`), `weaponFor(style)`. Element palette `PAL`/`palOf(el)` built from `ELEMENT_DEFS` (classic five keep their v2 colours; unknown → physical), `statusOf`, blade ambience `AMB`/`ambOf`, `CAST_KIND`. |
| `src/sword/moves.js` | Longsword movesets: 4-hit combo (4th hit per element), charged, ultimates (+awakened), supports, finishers, the 반격 flurry with per-weapon variants. Statuses via `ELEMENT_DEFS[el].status`. |
| `src/sword/elmoves2.js` | New elements for the longsword (water/nature/light/shadow 4th hit + charged: 물결/덩굴/성광/그림자 검술, 수류 일섬, 가시 돌진, 광휘 내려치기, 그림자 일격) and the shared **element payload** `payload(el, p, {r, dmg, kb, launch, big, tier, spec})` used by every melee moveset/archetype (9 elements + safe default). Also `vineLash`, `dashThrough`, `FX[el]` (visual only). |
| `src/sword/classmoves.js` | Paladin (3-hit hammer combo, hitstop 0.09/0.10/0.16, 3rd = ground slam r 3 + payload; RMB 방패 돌진 강타 6 m bash → slam) and shadowblade (6-hit dagger combo, 0.04 / 6th 0.10 + payload; nature 6th = vine lash; RMB 관통 일격 9 m dash-through). |
| `src/sword/archetypes.js` | Melee implementations of all 24 archetypes, registered in the sword **factory** (`game.archetypes.registerArchetype(name, 'melee', fn)`). |
| `src/sword/bespoke.js` | Melee forms of `water/nature/light/shadow .ult` and `.awakened` via `registerImpl(id, 'melee', fn)`. |
| `src/sword/fx.js` | Pooled fx: slash arcs, blade ribbon (16 samples → 31 Catmull-Rom points, two-layer scrolling noise mask, gradient ramp, per-weapon width/life/noise), ice/rock spikes, **crystal spikes** (one InstancedMesh with instance colours set at construction: thorns, light crystals, shadow spikes, mines), stone swords, orbit blades, dragon. |

##### API (`game.sword.api`, CONTRACT §12)
`startAction(spec)`, `hitCircle(c, r, spec, set, yRange, el)`, `hitLine(from, dir, len, width, spec, set, el)`, `applyHit(e, spec, point, dir, el)`,
`findTarget`, `after`, `every`, `weapon()`, `playLegacy(el, kind, {charge, skillId, awakened})`, `setElement(el, {silent})`,
`playClassCombo(el)`, `playClassCharged(el, frac)`, `TPL`, plus `arc`, `smear`, `foesNear`, `payload`, `S` (toolkit), `act`, `mines`.

- `playLegacy` kinds: `combo | heavy | ultimate | ultimateAwakened | support | finisher`. Gating is done by skills (always free here).
  It emits **one** `spellCast` per call that returns true (kind basic/heavy/ultimate, else `'skill'`). A combo press that arrives
  mid-swing is buffered (0.42 s) and still returns true. With `counterReady` the press becomes the 반격 flurry.
  Paladin / shadowblade `combo`/`heavy` route to their class movesets with the element payload; all 9 elements work.
- `setElement(el, {silent:true})` (what skills.attune uses) emits nothing and skips the unlock check. Any other v3 caller is forwarded
  to `skills.attune` (§22). Legacy: `setElement(el)` / `setElement(el, true)` behave as v2 (`elementChanged`).
- The v2 HUD (`getHudState`) stays for the legacy keymap and lists only the classic five.
- Test hook: `game.sword.debugUse('combo'|'heavy'|'ultimate'|'finisher'|'support'|'counter', {step, charge})`.

##### Hit rules
- Every melee hit: `tags:['melee', weaponId]`, `hit.tier` (`light | heavy | crit | ult`; counter hits are `crit`), `hit.hitstopMul`
  = weapon profile (longsword 1.5, hammer 1.9, daggers 1.3). `hit.hitstop` only as the rare override (`spec.hsOverride`: the DESIGN
  §2.2 paladin / shadowblade combo values). The engine never calls `game.hitstop`, `fovKick` or `kick` per hit — combat's hitFeel does.
- Base damage is unscaled. `pl.mods.atkMul` is gone; the counter ×2 is a moveset base value. The 검성 talent (`comboDmgMul`) goes
  through `hit.castMul`, so the canonical formula applies it; 이중 각인 (`comboStatusTwice`) adds a stack to the 4th/3rd/6th-hit status;
  반격의 대가 (`counterExtraHits`, `counterHealPct`) extends the flurry and heals on completion. Skill hits carry `skillId`, `slot`
  (via `ctx.hit` for archetypes, via the action tag for legacy movesets), `charged` for heavy actions, `finisher` for finishers.
  Hammer hits add `poise = amount × 0.5 × 1.5`.
- Awakening: added by combat v3; the engine only adds the old melee contribution when combat is v2/stubbed.
- Buffs (legacy supports): `game.stats.set('buff:<skillId>' | 'buff:sword_<el>_support', mods, {duration})`; the buff ends when the source
  expires (game time). `doubleJump` became `extraJumps`. Nothing writes `player.mods`.
- v3 input: when `game.skills.ownsInput` the engine reads no LMB/RMB/F/G/R/digits/wheel; it shows the weapon charge pose while
  `game.skills.charging`. Legacy keymap: Digit1-5 (classic elements), wheel, LMB/RMB, F (only while `interact.current()` is null), G, R.

##### Archetypes (melee forms)
Melee-native: projectile = travelling slash wave (lightning.ball = slow spark orb), crawler = ground wave (element spikes / fire line /
rubble), cone = wide sweep, nova = weapon-plant ring + payload, blink = dash-slash (behind target for shadow.step, next-crit rider),
dash = lunge with path hits (ignite / puddles / next-hit rider), leapslam = plunge with telegraph, grapple = vine whip (pulls small foes,
or the hero to the point), tether = whip channel (lashes, pull last/all, extinguish).
"Default ok": volley, lob, beam, zone, wall, pillar, chain, rain, summon, buff, mark, chainbind, lane, mine, bubble — the strike frame
runs magic's **caster** archetype from the weapon tip when it is registered (`ctx.origin` = weapon tip, `ctx.meleeFallback`), otherwise a
self-contained melee form: zones through `spells.api.zones` when present (else surface `wet`/`bless`/`ignite`), `world.addTempCollider`
(earth wall), `world.addPlatform` (ice pillar, glacier, stone steps), `world.addUpdraft`, `enemies.setTauntTarget` (totem / clone /
treant decoy), pooled mines (≤ 6), tick damage tagged `zone` (no hitFeel). Radii × `weapon.reachMul`; speed via the engine (× `speedMul`).

##### Perf
No new lights, no per-frame allocation in the engine update (scratch vectors, reused HUD), one new InstancedMesh (`crystal`, colours
set at construction), one extra ribbon (left dagger, only drawn while active). All meshes live hidden in the scene from boot and are
compiled by `warmup()`; the playtest asserts `renderer.info.programs` does not grow during melee casts.

##### Tests
`node tools/playtest3.js melee`: static rule checks (7/8/9, no `game.hitstop`, no `hasPrompt`, no `player.mods` writes); per melee class:
API + 24 archetypes + 8 impls registered, weapon profile, combo / charged / each new-element basic + charged hit a dummy with one
`spellCast` per press, per-weapon counter flurry, `hit.tier` + `hitstopMul` + `skillId` on every hit, silent setter, §21 check 5
(endgame + showcase casts, no generic fallback), programs stable, ≤ 350 calls; legacy keymap combo + §21 check 4 buff + F ultimate;
paladin with `stub=spells`. `node tools/playtest2.js --only sword` (legacy) passes.

#### enemies — module notes (v3, wave 2) — `docs/v3/notes/enemies.md`

Files: `src/enemies.js`, `src/enemies/{base,common,models,projectiles,loot,golem,bokoblin,shaman,chuchu,dummy}.js` (changed),
NEW `src/enemies/{scaling,threat,encounters,bossbase,models2,lizard,shroom,wolf,wraith,voidknight}.js`,
`src/enemies/bosses/{index,kit,hydra,nox,treant,kalis,nidhoggra,nidhoggra_model}.js`, `tools/playtest3/enemies.js`.

##### Module (`game.enemies`, CONTRACT §14)
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

##### Regular enemies (DESIGN §9 A2–A4)
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

##### Boss framework (`bossbase.js`) and registry
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

##### Bosses (CONTRACT §15, DESIGN §8.5–8.6); mid-bosses ≤ 20 calls, nidhoggra ≈ 28
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

##### Tests
`node tools/playtest3.js enemies` — rules 7/8/9 greps, new/renamed mobs (names, HP × row, XP, voidShield/break, variants), scaling rows +
second region + difficulty, taunt retarget, stealth, anyAggroWithin (+ debugAggro), run stats, projectile blocking by a temp collider,
golem (`bossDefeated` final:false, no victory), encounters (lazy spawn, ≤ 18, despawn > 120 m), the lock table (every class ≥ 4/5
per phase, primaries ≥ 2), and per boss `&boss=<id>`: prewarm first + idempotent, Korean names, draw-call budget, `debugPhase(2)`,
programs constant after spawn + phase change, calls/tris caps, `debugDefeat` → exactly one `bossDefeated {id, final}`, removal;
nidhoggra mechanics (plate lock, gift 50 %, counter strip, rods success, the phase-2 shard window, tide success, heart + spear gift).

##### Not done (P1 slips, each with a working fallback)
- Nidhoggra phase 3 sky rings / eye clusters / meteors → cut line 3 (the heart opens after the phase-2 check).
- Treant climbable arm ramps (the kneel brings the heart within reach instead); Kalis prism reflection of mirror beams (beams are
  dodge-only; his bolts are parry-reflectable through the existing orb reflect); bespoke boss voice lines (sfx names only).

#### narrative — module notes (v3, wave 3) — `docs/v3/notes/narrative.md`

Files: `src/story.js`, `src/story/{quests,script3,classSelect}.js` (new), `src/story/{script,npcs,ui}.js` (changed),
`src/cinematic.js`, `src/cinematic/{reveal,acts,finale,spirits9}.js` (new), `src/cinematic/{assets,ceremony,finisher,intro,overlay}.js` (changed),
`src/audio.js`, `src/audio/{sfx3,themes3}.js` (new), `src/audio/{music,themes,sfx2}.js` (changed), `tools/playtest3/narrative.js`.
Static imports: own files, `src/core/*` and `three` only (rule 7). Everything else is reached through `game.*` and feature-detected.

##### Story (`game.story`, CONTRACT §17)
- **Stage table** (`story/quests.js`):
  - `QUESTS`: 17 stages with Korean titles, `objective(S, game, H)`, `markers(S, game, H)`, `kind`, `boss` and `xp`. `xp` is a number, or a
    function for region quests, which pay act-2 or act-3 XP depending on the play order.
  - Also exported: `STAGES`, `TITLES`, `REGIONS`, `REGION_OF`, `BOSS_OF_STAGE`, `SPIRIT_OF_BOSS`, `MIN_LEVEL`, `ACT_OF`, `TRAIN_STEPS`,
    `ASCENT_STEPS` (5 points: ruins gate → 2 updrafts → ledge rim → ledge), `nextStage(id, S)` (branch-aware) and
    `stagesBefore(stage, order)`.
  - story.js never hard-codes the stage order.
- **Branches:**
  - After `reveal` (talk to 이솔데), entering Mirwen or Elderwood starts that region. Entry is detected through `zoneEnter`, `gateTravel`
    or a 4 Hz zone check.
  - `story.regionOrder` (a readable array) records the order.
  - After a region's last boss, the other region starts. After both, `ascent` starts.
- **Bosses:**
  - `bossSpawn` and `bossDefeated` are filtered by id. Only the current stage's boss advances the stage.
  - A boss stage starts its fight when the player walks into `world.bossArenas[id]` (radius + 8, and not far below a raised arena).
    `cinematic.playBossIntro(id, onDone, {spawn, valid})` fades out, awaits `enemies.prewarmBoss(id)`, then calls story's spawn.
    No intro starts for a boss that `enemies.bosses.has()` does not know, so a missing bosses folder never loops the intro.
  - Act bosses: `addPoints(1, id)`, `freeSpirit(el)`, full HP/MP/stamina and the quest XP. Then `playSpiritFreed(el)` plays and the spirit
    NPC appears at its shrine.
  - Golem: `breakSeals()`, the stage becomes `reveal` at once, then `playReveal` plays.
  - Nidhoggra (`final:true`): stage `ending` → `playEnding` → `victory {stats: enemies.getRunStats()}`, emitted **once** (`S.victoryEmitted`)
    → `setState('victory')`. `story.continueEpilogue()`, or a victory → playing state change, moves to stage `done`.
  - Story no longer listens to `victory`.
- **Class choice** (`story/classSelect.js`):
  - In the `choose` stage, talking to any of the 6 mentors at the altar plays that mentor's pitch, then opens
    `ui.openClassPanel({current, onPick})`.
  - Without ui (stubbed or missing), a 6-option dialogue `ask` appears instead, plus a "later" option.
  - The pick runs `progression.setClass` → `player.setClass` → `cinematic.playClassRite(cls)` → `training`. It also shows the
    `firstPoint` tip ("K: 스킬 트리…").
  - After training, a mentor of another class offers **직업 변경** (`ui.confirm` → `progression.changeClass`, altar only).
- **Training** steps: `basic ×5 → charged → quick → defend → dodge → learn`.
  - Steps count from `skillCast` only; the slot comes from `skills.defs`. `spellCast` is the fallback, used only while skills is stubbed.
  - defend: `blocked`, `parry`, `counterStance`, `counter`, `focusStart`, `wardBreak`, or holding defend.
  - dodge: `dodge`, `blink`, `dash`, `perfectDodge`.
  - learn: `skillLearned` followed by `loadoutChanged`. Without skills, `skillLearned` alone counts.
- **NPCs** (21):
  - The 9 v2 villagers, the 4 new mentors, 이솔데 (sage), 하람 (trainer), 나엘 (lakeKeeper) and 모모 (forestChild).
  - The spirits 운디나, 실바니아, 녹스 and 루미엘 stay hidden until freed, then appear at their shrines.
  - Spots come from `world.village.npcSpots`, `world.zones[].npcSpots` and `world.shrines`, else the DESIGN §8.3 coordinates.
  - New NPCs use a **merged** model: body + head in 1 mesh, 1 outline and an optional glow.
  - Talk goes through `game.interact.offer('npc:'+id, …)` (label "이름과 대화하기"). Without `game.interact`, the v2 F prompt is used.
    `story.hasPrompt()` is the shim `!!interact.current()`.
- **Elderwood escort:** talking to 모모 makes her follow the player (simple steering; she catches up after gate travel). The stage moves
  to `nox` once the 3 rot walls are cleared (`world.rotWalls`, `rotWallCleared`) and 모모 is at 실바니아's grove.
- **Mirwen:** the 나엘 talk is optional. Reaching 운디나's shrine (within 5 m, or `shrineFound`/`shrineUse spirit_undina`) starts `hydra`.
- **Ascent:** each step pays 900 XP. The last step starts `kalis`.
- **Reaction trainer (P1):**
  - The 반응 수련 허수아비 spawns lazily at `village.reactionDummy` (0 XP) and cycles element auras every 5 s.
  - It never spawns in `?test` unless `story.spawnReactionTrainer()` is called.
- **Ambient lines (P1):** per-phase keys `early/training/updraft/camps/boss/act2/act3/act4/done`, with fallbacks. The epilogue lines
  are the `done` phase.
- **API:**
  - Read-only: `stage`, `regionOrder`, `ascentStep`.
  - `debugSkip(stage, {silent, order, second})` covers every stage:
    - It sets the default class, seals, spirits, points and level (≥ 9 / 15 / 21 / 25).
    - It teleports to the zone and prewarms the act boss behind a fade (instant in tests).
    - It stops a running cinematic and despawns a boss that belongs to another stage.
  - `debugComplete()` finishes the current non-boss objective; on a boss stage it spawns the boss.
  - Flow: `startBossFight()`, `pickRegion(r)`, `continueEpilogue()`, `currentBossId()`.
  - Save: `serialize()` / `deserialize(o)` cover the stage, branch order, flags, training, ascent step, feather and
    `tips: ui.serializeTips()`.
  - Dialogue and test helpers: `talkTo`, `advance`, `choose`, `getDialogueState`, `bark`, `banner`.
- Story calls `world.setActVisible(ACT_OF[stage])` on every stage start.
- **Test isolation:** story cinematics (rite, reveal, spirit freed, boss intro, ending) play by themselves in normal play. In `?test`
  runs they play only with `&cine=1` or `story.autoCinematics = true`; otherwise the stages still advance, with no cutscene. This keeps
  other owners' playtests (which emit `bossDefeated` or kill the golem) from stalling. The narrative section opts in.

##### Cinematic (`game.cinematic`, CONTRACT §16)
- `playClassRite(cls, onDone)` (ceremony.js) shows only the spirits of `CLASS_DEFS[cls]`: primaries big in front, secondaries small
  behind. `playBlessing` is the shim.
- `playReveal` (reveal.js, ≈ 28 s): the core rune, 테라곤's memory, then a wisp along a root-channel spline to the plateau. There, an
  instanced wyrm silhouette (`assets.makeWyrm`, 1 draw call) carries the 5 oath shards under a greying crown.
- acts.js holds `playSpiritFreed(el)`, `playBossIntro(id, onDone, {spawn, valid})` and `playPhase(id, phase)`:
  - All three are parametric. `BOSS_CAM` holds the per-boss camera data: focus height, radius, sweep, fov, voice and grade.
  - The intro freezes the game (`cutscene`) behind the fade while prewarming, then returns the camera to where it was.
  - `playPhase` runs in gameplay mode: a slow-motion orbit with the phase name, ≤ 3.3 s.
- `playFinale(onDone)` (finale.js) runs in gameplay mode:
  - Time slows and the 9 colours gather into the weapon.
  - **One input** (LMB, R, X or Space; automatic after 0.5 s in tests) lands the strike.
  - 0.4 s of music silence, then a white flash and a light burst.
  - `onDone` fires at the impact, so `bossDefeated` and the dissolve run under the burst.
- `playEnding` v3: golden pollen over the plateau, the crown blooms, a time-lapse (Mirwen, Elderwood, the plateau), the festival,
  credits (6 mentors, the new NPCs, 9 spirits), 끝. Music: `ending_v3`.
- `finisher(o)` keeps its signature:
  - `o.element` is any of the 9 or `'symphony'`. `o.cls` sets the tag (from `CLASS_DEFS`).
  - The new elements and `'symphony'` get bespoke set pieces from `spirits9.js`: water leviathan, eternal forest, dawn wings, raven lord
    and the symphony ring.
- New API: `subtitle(text, sec, speaker)`, `burstAt(point, element)`, a `mode` getter (`'gameplay'|'world'|null`), and
  `SPIRITS` (5) / `LOST_SPIRITS` (4) / `SPIRITS_ALL` (9). In `overlay`, `ELEMENT_GRAD` and `ELEMENT_GLYPH` cover the 9 elements plus
  physical, symphony and void.
- Perf:
  - Every set piece lives in a per-cinematic Stage, disposed on end.
  - It is built from sprite, rune, pillar, mist, motes and instanced-silhouette programs that `init()` warms (+1 program at boot).
  - No lights.
  - The test asserts that reveal, the intro and the ending compile no new programs.

##### Audio (`game.audio`, CONTRACT §20)
- `audio/sfx3.js`:
  - `cast_`, `impact_` and `explode_` recipes for water, nature, light and shadow.
  - Weapon sfx: `bow_draw`, `bow_release`, `arrow_whizz`, `hammer_swing`, `hammer_hit`, `shield_block`, `dagger_swish`,
    `totem_rattle`. They play once per `skillCast`, chosen by `styleOf(cls)`.
  - UI cues: `level_up`, `skill_learn`, `skill_unlearn`, `tree_open`, `slot_equip`, `xp_tick`, `codex_new`, `regen_start`,
    `gate_travel`, `ui_deny`.
  - Reaction cues: the family recipes `rx_burst`, `rx_control`, `rx_spread`, `rx_surface`, `rx_blessing`, `rx_curse`, plus
    `resonance` (an arpeggio) and `break_gong`.
  - Boss voices (P1): `hydra_roar`, `treant_groan`, `nox_voice`, `kalis_voice`, `wyrm_roar`.
  - The misc cues other owners call: `wolf_howl`, `splash`, `throw`, `swing`, `rock_smash`, `vine_hit`, `holy_chime`, `gate_awaken`,
    `shrine_seed`, `shrine_found`, `crystal`, `firework`.
- `reaction` lookup order: `RX_CUES[id]` (a [recipe, pitch] pair, distinct per id) → `RX_FAMILY[payload.family]` → the generic
  `reaction` cue. All 49 ids resolve.
- The charge loop base is `ELEMENT_DEFS[el].sfxBase × 0.5`. Music ducks on crits and ultimates. `silence(s)` cuts the music bus.
- **Music** (`audio/themes3.js`):
  - New themes: `mirwen`, `elderwood`, `sky`, `final_boss` and `ending_v3`.
  - `final_boss` layers by `music.bossPhase`. Broken shards add their leitmotifs, read from `lockStripped` and `shardBuff`.
  - `pickMode` order:
    1. the forced theme;
    2. the victory sting;
    3. a boss (`final_boss` for nidhoggra);
    4. battle;
    5. `world.getZoneAt(player).music` (the plateau plays `sky` until the wyrm rises);
    6. the v2 village/field rule.
- **Victory:** the fanfare plays on `bossDefeated {final:true}`. The `victory` event plays nothing new.
- Test hooks: every requested cue is logged, even while silent. Hooks: `audio.cueCount(name)`, `audio.lastCues`, `audio.fanfareCount`,
  `audio.wantedMode()`, `audio.musicLayer`.

##### Measurements
bootcheck (640×360, medium):
- Default config: 271 calls / 830k tris / 142 programs. Before narrative v3: 257 / 775k / 141.
- Village with all 15 village NPCs: ≤ 290 calls, asserted in playtest3.

##### Tests
`node tools/playtest3.js narrative` takes ≈ 40 s: 3 boots, 153 checks. It covers:
- static checks: rules 7/8/9, the removed path dialogue and the removed victory listener;
- golem → reveal, and the reveal talk with the elder line;
- both branch orders reaching ascent;
- the escort, the shrine, and the proximity boss intro;
- the ascent steps;
- debugSkip + killBoss for every boss stage (spirits, points);
- final → finale → ending → exactly one victory, after bossDefeated{final}, with the fanfare;
- serialize / deserialize;
- every cinematic: skippable, state restored, no new programs;
- the finisher for all 9 elements + symphony;
- audio: recipes, rx coverage, cues, zone music, offline renders;
- village draw calls and the reaction trainer;
- the class pick, with the ui panel and with the dialogue fallback (`&stub=ui`);
- training counted per `skillCast`.

##### Not done / fallbacks
- Bespoke per-boss intro shots (P1): every boss uses the parametric intro with its `BOSS_CAM` row.
- The 2 sage / lake-keeper side requests in the act-4 XP budget are not built. The ascent pays its 5 × 900 XP.
- The feather's +20 stamina is the `story:feather {maxStaminaAdd: 20}` stats source (core reads `maxStaminaAdd` since integration);
  the direct `player.maxStamina += 20` remains only as the no-stats fallback.

#### v3 review fixes (integration)
- Perf: `src/vfx/budget.js` (`FXB`) caps the SUM of active ground / beam / trail pool entries per quality (high 64 /
  medium 38 / low 24, × `game.perfScale`); pools recycle their own oldest entry past it. Ring / decal pools are
  frustum-culled (their grid keeps a bounding sphere). `game.perfScale` (main.js governor: frame-time EMA > 18 ms for 2 s
  → 0.7, back to 1 after 4 s < 14 ms) also scales particle counts; runtime only, never persisted.
- Player rig (`skinMerge`): one mesh per material (shadow + non-shadow parts merged); merged meshes whose bones are all
  hidden (other classes' gear) are not drawn. Afterimages pack only the visible parts' triangles.
- Enemies: `removeEnemy` disposes per-instance `THREE.Skeleton`s (bone textures). Elderwood arena fights (Nox, treant)
  use `world.setBossFightLOD` like the finale.
- Skills: the legacy v2 paths run only where they match the v3 tree text — caster legacy spells only for the staff
  style; melee ultimates / supports always use the archetype (meteor, fire spirit, …).
- Boss framework: a forwarding part takes no HP while its pool ignores damage (transition / invulnerable).
  Nidhoggra's heart opens on `onPhaseStart`, and emits `bossParts {id, phase, parts}` per phase (the boss bar listens).
- Story: post-game 정령 시련 (`src/story/trials.js`, `game.story.trials`): F at a freed spirit's arena rim in stage
  'done' re-fights that mid-boss at +30 % HP (`game.bossTrialHpMul`) for quest XP (first clear full, repeats 35 %).

## v4 polish contract (binding)

The binding v4 contract is `docs/v4/PLAN.md` (revision v4.1); it wins over docs/v3/* and the sections above where they differ.
Integration (wave C) results: `docs/v4/notes/core.md` (final §1 numbers), review gate `docs/v4/review.md`, requests and their resolutions `docs/v4/requests/*.md`.

### v4 module notes

#### v4 notes — core (`docs/v4/notes/core.md`)

##### core — v4 notes

Owner: core (`index.html`, `src/main.js`, `src/core/*`, `src/skills*` (frozen except the §9 P0b items), the test tools, docs listed in PLAN §7.1).
Branch `v4/core`, worktree `/home/user/wt4/core`.

###### Status

| Wave | Items | State |
|---|---|---|
| A — P0a (tag `core-p0a`) | (1)–(8) of the core task | **done** (C5 + boot green) |
| B — P0b (tag `core-b`) | (9) post4 render path, (10) pixel budget, (11) governor, (12) sub-steps + per-entity hitstop, (13) warm-up draws, (14) skills presentation, (15) bench.js, (16) debug hooks, (17) bootcheck config 3 / playtest2 / C1–C4, C7 | **done** (C1–C5, C7 green; legacy tests green) |
| P1 | uiScale CSS helper (if ux asks), half-res soft-smoke pass (if vfx asks) | **cut** for wave B (ux has not asked; vfx marked its ask "not needed for P0"); fallbacks: `uiScale` is a stored setting ux applies itself, smoke stays in the scene pass |
| C — integration round 1 | §7.10 | **done** (merged, requests resolved, tests run, review written; fix items handed back — see below) |

###### What exists at `core-p0a` (the contract every owner codes against; wave B changes are listed in the next section)

###### Settings, difficulty, assist (`src/core/settings.js`)
- Every PLAN §6.8 key with its default in `DEFAULTS` (and persisted in `aw_settings_v3`): `fxIntensity 1.0`, `threatEmphasis 'normal'|'strong'`, `tellMul 1|1.25|1.5`,
  `enemySpeed 1.0|0.9|0.8|0.7`, `iframeMul`, `perfectMul`, `witchSlowmo true`, `offscreenArrows true`, `teachSlowmo true`, `hints true`, `aimAssist 'off'|'weak'|'strong'` (P1),
  `colorblind 'off'|'protan'|'tritan'` (`'deutan'` is stored as `'protan'`: same palette), `flashReduce false`, `screenShake 0.6`, `uiScale 1.0`,
  `damageNumbers 'all'|'merged'|'off'` (default `'merged'`; v3 `true → 'merged'`, `false → 'off'`, also on `set()`), `cameraDist 'near'|'normal'|'far'`, `autoAllocate false`,
  `introShort true`, `keybinds {dodge:'KeyQ', dodgeAlt:'Mouse3', defend:'KeyE', jump:'Space', sprint:'ShiftLeft', interact:'KeyF', skills:'KeyK', codex:'Tab', confirm:'Enter'}`,
  `quality 'low'|'medium'|'high'|'custom'` (unknown → medium), `autoQuality true`, `dynamicRes true`, `fpsCap 60|30|0`, `showFps false`, plus `gpuTier`.
- `SETTING_DEFS` = menu metadata for ux (key, tab, Korean label, values with Korean labels / slider range). `SETTINGS_TEXT_KO` = tab names, `재시작 후 적용`, 성능 테스트 texts, the two quality offers.
- `PRESETS` v4 (§2.2): v3 keys kept + `budgetPx, dynResMin, msaa, fxaa, shadowType, shadowSize, shadowEvery, shadowCalls, shadowTris, bloomMips, bloomStrength, pointLights,
  grassNearFade, grassReceiveShadow, treeDist, floraOutlineDist, enemyOutlineDist, enemyLodDist, particleCap, additiveCap, coverageSoft, coverageHard, fxCalls, fxDetail`.
  Medium: 1.0 MP, MSAA 0, PCF 1024, bloom 3 mips 0.40, 0 point lights, grass 0.4, caps 1000/300, coverage 1.5/2.5, 40 FX calls. A stored non-custom quality re-applies the v4 preset on load.
  `msaa`, `shadowType`, `pointLights` apply at boot only (`RELOAD_KEYS`).
- `DIFFICULTY` = story/easy/normal/hard with `hpMul, dmgMul, tellMul, perfectMul, iframeMul, enemySpeed, autoRevive, checkAddSec, regenCombatMul, autoAllocate, nameKo, descKo`;
  `telegraphMul` alias fixed at 1, `checkAdd` alias = `checkAddSec`. `DIFFICULTY_ORDER = ['story','easy','normal','hard']`.
- `game.assist` (getter, one reused object, recomputed on every `settingsChanged`): `{difficulty, tellMul, enemySpeed, iframeMul, perfectMul, fxIntensity, threatStrong, colorblind (null|'protan'|'tritan'),
  flashReduce, teachSlowmo, witchSlowmo, offscreenArrows, autoRevive}`; multipliers = difficulty × slider. `enemySpeed` clamped to [0.5, 1].

###### Palettes
- `src/core/elements.js`: `FX_RAMPS` (§3.2, incl. physical and a `void` ramp), `ELEMENT_DEFS[el].colors.fx`, legacy fields derived (`mid = hex = fx.mid`, `core = fx.hi`, `edge = fx.dark`; shadow `core = fx.dark`, `edge = fx.light`);
  `css` unchanged (UI). `game.elements.fx(el)` → `{hi, light, mid, dark}` numbers (unknown → physical). Physical pseudo-element `hex` = `0x8A8274` (no white). `utils.ELEMENT_COLORS` follows the ramps.
  Note: §3.2's "saturation ≤ 0.35 below hi" holds for light's body steps (light 0.15, mid 0.24); its binding dark edge `#5A4A2A` is 0.53 (HSV) — kept as written.
- `src/core/threat.js`: `THREAT` (8 rows, exact legend texts, rim/edge/fill, shape/body/sound notes), `THREAT_KINDS`, `RESERVED_SHAPES`, `RESERVED_HUES`, `THREAT_FRONT`, `THREAT_LAYERS` (§5.2 numbers),
  `COLORBLIND`, `threatColor(kind, colorblind)` → frozen cached `{kind, rim, edge, fill, fillAlpha, rimAlpha, outline, stripes}`, `threatCss(n)`.

###### Tells stub + reference geometry
- `src/core/tellgeom.js`: `hitTest(shape, p, pad = 0.15)`, `shapeDistance(shape, p)` (exact distance to circle / ring / cone / line / capsule / conecap; rad half-angles; XZ),
  `TELL_MIN`, `TELL_LOCK` (§5.7), `tellDuration(base, cls, tellMul, timeMul)`. The real tells may import it (T3 compares against it).
- `stubs.tells` (`isStub: true`): `attack(e, spec)` → handle `{id, enemy, start, dur, progress, remaining, locked, done, alive, consumeStrike(), contains(pos, pad), setPos, setDir, setEnd, extend, stop}`
  timed on `game.enemyTime` with floors × `assist.tellMul` × `e.timeMul`; emits `tellStart`, `tellCommit` (at lock, from `update()`), `tellEnd {reason}`; handles never consumed are cancelled 2 s after their hit.
  When `vfx.telegraph` exists the stub **also draws the fixed v3 decal** for the attack's shape (pass `spec.legacyDecal:false` to opt out), so callers that use `tells.attack` need no fallback decal.
  `canAttack` (punish window only), `nextImpact(pos)`, `windup(e, base, cls)`, `punish(e, dur, {mul})` (sets `e.vulnerableUntil` in enemyTime seconds + `vulnerableMul`, emits `punishWindow`),
  `projectile/hazard/safe → {stop}`, `active()` (reused empty array), `footprints()` (`{data: Float32Array(64), n: 0}` reused), `telegraph: null`, `renderThumb: null`, `MIN`, `LOCK`, `debug.pool()`.
- `NOT_FX` gains `kit, shared, applyPlayerFx, fxMulAt, fxFactor, debug` (read as `undefined` on the vfx stub).

###### Render (`src/core/render.js`, `src/main.js`)
- `game.render = {tier, rendererName, msaa, pointLights, shadowType, threatScene, overlayCamera, warm(obj, {target:'scene'|'overlay', now}), snapshot(obj, {w, h, yaw, pitch, dist, scene}), flushWarm, drawOverlay}`.
  `threatScene` has no background/fog and is drawn after `composer.render()` (`tells.preOverlay()` → `setRenderTarget(null)` → `autoClear=false` → `overlayCamera.copy(camera)` incl. projection → render → `autoClear=true`); skipped when empty.
  `warm` (P0a) compiles against the right target and light set (scene: composer HalfFloat target + main-scene lights; overlay: canvas variant), idempotent per material, queued and flushed before the next render
  (`now:true` compiles immediately). The real first draw (64×64 / 1×1 scissor) is P0b item 13. `snapshot` renders the object alone (private hemi + sun) into an sRGB RGBA8 target → PNG data URL.
- Composer targets: both carry their own `DepthTexture`. `game.post` adds `sceneDepth {value: DepthTexture of the target the RenderPass wrote}`, `uvScale {value: Vector2(1,1)}` (dynamic resolution in P0b),
  `sceneRes`, `canvasRes` (drawing-buffer px), `cameraNear`, `cameraFar`, `projInv {value: camera.projectionMatrixInverse}`, `camWorld {value: camera.matrixWorld}` (live references), `bloomTex {value:null}` (P0b),
  `bloomStrength(v)`, `setGrade(id, strength, {priority, durReal, fade})` (layers by priority; the legacy `post.grade(...)` always wins = cinematic priority 10; `GRADES.witch` priority 1).
- Boot render state per preset: MSAA (`prod=1` or production: preset; plain test: 0), shadow type (PCF at medium), `pointLights` (false below high) — applies on reload only.
  `renderer.debug.checkShaderErrors = (test && !prod) || &shaderCheck` (off in production and with `prod=1`).

###### Frame, time, plumbing (`src/main.js`, `src/core/timescale.js`, `save.js`, `keymap.js`, `input.js`)
- `ORDER = ['world','vfx','combat','tells','audio','player','spells','sword','skills','enemies','story','cinematic','ui']`, `FILES.tells = ['./tells.js','createTells']` (missing → core stub).
- Frame: per step `game.enemyTime += dt × assist.enemySpeed` (not during the global freeze), `game.frame = {step, n, lastStep, frameDt}` (reused object; **P0a: n = 1**, sub-steps in P0b),
  step group `player → stats → spells → sword → skills → enemies → combat → story → cinematic`, once per frame `world → tells → vfx → ui → audio`, render `composer → preOverlay → threat scene`.
- `game.timeScale.set(id, scale, durReal, {compensate, priority}) → granted`; arbitrated sources `witch 1 < teach 2 < cinematic 3` (or any `priority`): one at a time, a lower/equal request while one is active returns false;
  `comp()` = 1/value while any compensating entry (`focus` or `compensate:true`) is active; `slowmoSource()`.
- `game.hitstop(seconds, {tier, target})`: **P0a keeps the v3 global freeze** (playtest2 still expects it) but stamps `target.hitstopUntil` (`game.realTime` seconds) and logs every request;
  `game.debug.hitstopLog()` → last 64 `{t, sec, tier, granted, target}`. Per-entity semantics + budget = P0b item 12.
- `game.save.section(name, {serialize, load})`: stored under the new snapshot key `sections` (v3 keys unchanged); `load(data)` on save load, `load(null)` on `clear()`, immediate `load` for late registrations;
  `RESERVED = {tells, hints, monsterCodex, encounters}`; test helpers `snapshot()`, `sectionsSnapshot()`, `loadSections(obj)`.
- `game.nextCastId()`; the skills runtime stamps `ctx.castId` (or `opts.castId`) before `perform` and adds `castId` to `skillCast` (`skills.lastCastId`).
- `game.input.keymap = {get, rebind, label, actionOf, reset, pressed, down, released, actions, NAMES_KO}`; persisted in `settings.keybinds`; rebinding dodge/defend/interact/codex/skills also updates the legacy `KEYS`.
  Korean labels: `Q`, `마우스 4번 버튼` (Mouse3), `마우스 왼쪽/오른쪽/휠 버튼`, `스페이스바`, `Shift`, `Tab`, `Enter` … `KEY_NAMES_KO.codex = '도감'`. Mouse buttons 3/4 no longer navigate back/forward.
- `game.quality` (P0a shell, `src/core/quality.js`): `{level, preset, scale, baseScale, budget, renderSize(), set(level, reason), lock(on), history(), headroom(sec), benchmark({seconds})}`;
  `budgetFor(level, preset)` implements the cumulative L0–L5 rows of §2.3 (`particleMul, coverageMul, flareMul, fxDetail, enemyOutlineDist, enemyLodMul, floraMul, grassMul, floraOutlineDist,
  shadowEvery, shadowFrozen, bloom, particleCap, dynRes, dynResFloor`); `qualityLevel {level, scale, reason}` event; budget-only L1 headroom for 4 s on `bossSpawn` and ultimate/finisher `skillCast`;
  `game.perfScale` = `budget.particleMul` (legacy view). The governor controller, pixel budget and title benchmark are P0b (the v3 EMA governor still runs outside tests / with `governor=1`).
- Frame cap: rAF callbacks earlier than `1/fpsCap − 2 ms` are skipped (`fpsCap` 0 = unlimited).
- `gpu.js`: `detectGpu` (WEBGL_debug_renderer_info → tier regexes of §2.2), `baseScale(w, h, pr, budgetPx, renderScale)`, `renderSizeFor` (P0b wires them).
- Debug (§7.7): `hitstopLog`, `governor`, `perf` (null until P0b), `overdraw`, `coverage`, `tells`, `forceAttack(type|entity, id)`, `lookOf(id, family)`, `newMaterials()`, `firstDraws()`, `fragments()`.

###### Test params (§7.6)
`prod=1`, `governor=0|1` (test default off), `budgetPx`, `refresh`, `seed=N` (mulberry32 replaces `Math.random`), `gpu=`, `quality=` (transient preset), `fx`, `difficulty` (incl. story), `witch=0`,
`colorblind=`, `threat=strong`, `hints=0`, `stub=<module>[,…]` (incl. `tells`). Setting params are applied with `persist:false`. `game.testParams` holds the parsed values.

###### playtest4 (`tools/playtest4.js`, `tools/playtest4/harness.js`)
Runner: `node tools/playtest4.js [owner…] [--perf] [--full] [--sheets] [--list]`, ORDER of §7.8, exit 1 on failure, `PT.flags`.
Harness: `PT.boot(params, {w, h})` (adds `prod=1&governor=0&seed=1` unless given), `PT.bootScene(id)` + in-page `PT.scene(id)` for S-*/F-*/B-*/R-*/P-bench, `PT.sweep`, `PT.draws()`
(scene/shadow/overlay/post calls + tris, transparent, additive, upload bytes/calls, programs, `byGroup` world/player/enemies/fx/enemyFx/tells/ui), `PT.measure(fn)`, `PT.fragments({owner})` (counting override,
first call recompiles patched variants: ~18 s on SwiftShader, cached after), `PT.rotate`, `PT.simMs`, `PT.cpuFrame`, `PT.longFrames`, `PT.alloc` (CDP), `PT.pixels.{render, diff, luma, mask, sobel, iou, dataURL}`,
`PT.armor` (sets `e.ptArmor`), `PT.keepAlive`, `PT.clearEnemies`, `PT.waitEvent`, `PT.events`, `PT.gpuSync`, `PT.gpuMs`, `PT.gpuRatio` (same page), `PT.gpuRatioPages` (two pages),
`PT.baseline()` (v3 build `de5d823` via `git archive` into `tools/playtest4/out/v3base`), `PT.sheet` (contact sheet ≤ 150 KB).
Fixtures (`tools/playtest4/fixtures/`): the evidence scripts `fight.js, lib.js, common.js, percast.js, measure.js, inject.js, synctest.js` with repo-relative paths, output in `tools/playtest4/out/<name>/` (git-ignored).
`.gitignore` keeps `*.png` ignored except `tools/playtest4/sheets/**`.

###### Wave B (P0b) — what was built, APIs

###### (9) Render path v4 — `src/core/post4.js` + `src/main.js`
- `createComposer4(renderer, scene, camera, {msaa, bloomMips})` replaces EffectComposer + RenderPass + sanitize ShaderPass + UnrealBloomPass + OutputPass. EffectComposer-shaped:
  `passes = [RenderPass, BloomPass4, FinalPass4]`, `readBuffer`/`renderTarget1`/`renderTarget2` (= the single scene target), `render(dt)`, `setSize(cw, ch, maxScale)`, `setScale(s)`, `viewport {w, h}`,
  `uvScale`, `state {allocW, allocH, vw, vh, reallocs}`, `bloomActive`, `bloomMul`, `setBloomMips(n)`, `materials()`. `game.composer` / `game.bloomPass` point at it (`bloomPass.enabled/strength/threshold/radius/mips`).
- Scene target: HalfFloat, samples = boot MSAA (0 at low/medium, 4 at high), own `DepthTexture`; allocated once at **drawing buffer × renderScale**; re-allocated only on a canvas resize or a
  renderScale change. Dynamic resolution = `rt.viewport/scissor` = floor(alloc × scale) (no dispose, no program change). One scene target instead of two ping-pong targets (nothing ping-pongs any more).
- BloomPass4: bright pass (4 Karis-weighted taps, NaN/Inf scrub, clamp 16, threshold 1.0, hue-preserving knee) into a ¼-area target; down chain of 3 mips (5 at high) from 1/16 area;
  additive 3×3-tent up chain back to the first mip; output = `bloomPass.texture` = `game.post.bloomTex` (never blended into the scene target). Every tap is clamped to the live viewport.
- FinalPass4 (to the canvas): scene × uvScale; FXAA 3.11-lite whose every tap is graded + ACES-tone-mapped (exposure 1.05) before the luma/edge tests; bloom added as
  `TM(c + bloom·strength) − TM(c)` (HDR before the curve, identical to v3 off edges); grade (`uGrade*`), pulse (`uChroma`/`uRadial`, HDR radial + chroma path), CAS-lite sharpen while the render
  is smaller than the canvas (`uSharpen`), ±0.5 LSB dither, NaN guard, linear → sRGB. All switches are uniforms (`uBloomOn`, `uFxaa`, `uSharpen`); `game.post.uniforms` = FinalPass uniforms (v3 names kept).
- Bloom strength = preset (`0.40` medium, `0.45` high) × 0.75 while `enemies.aggroCount?.() ≥ 3` (checked every 0.25 s) → 0.30; L4 → `uBloomOn = 0` and the bloom pass is skipped.
  Presets are re-applied after module `init()` (world v3 overwrote the bloom pass fields).
- `game.post.sceneRes` = live scene viewport (px), `uvScale` = viewport ÷ allocation, `canvasRes` = drawing buffer, `sceneDepth` = the scene target's DepthTexture.
- Shadows: `autoUpdate` off; the map is rendered every frame at medium, every 2nd at low / L3 (`budget.shadowEvery`), frozen at L5; **shadows off** = one shadow pass with no casters (view camera
  on layer 31 for that single render) and then no updates. Texel snapping stays in world.
- `renderer.setPixelRatio(min(dpr, 1.0 medium / 1.5 high))`; renderScale is no longer multiplied into the pixel ratio.
###### (10) Pixel budget — `src/core/gpu.js`
- `budgetSize(w, h, pr, budgetPx, renderScale, dyn)` (floor → never above the budget), `baseScale` (P0a), tier regexes (P0a; medium for every tier on first run — the settings default).
- main: `base = baseScale(drawingBuffer, budgetPx (test param or preset), renderScale)`, total = base × `game.quality.scale` → `composer.setScale(total / renderScale)`; `game.quality.baseScale` holds base.
- `game.quality.renderSize()` → live `{w, h}`; `renderSize(w, h, pr)` → what the current preset picks (C1 unit test: 1920×970 → 1406×710 = 0.998 MP).
- Offers: `showOffer(game, 'high'|'medium')`, `maybeOfferHigh(game, titleBench)` (discrete tier, headroom ≥ 1.6, `settings.highOffered` once); `game.ui.qualityOffer(offer)` or event
  `qualityOffer`, fallback DOM card outside tests (texts from `SETTINGS_TEXT_KO`). Drop-back offer: high + governor ≥ L2 for 30 s, once per session.
###### (11) Governor — `src/core/quality.js`
- `game.quality.frame(dtMs, cpuMs, gpuMs)` is called by the rAF loop once per rendered frame (production; tests only with `governor=1`). T = p10 rAF delta of the last 2 s, snapped to common
  refresh rates, minimum of the last 30 s of estimates, `max(T, 1/fpsCap − 0.5 ms)`; `refresh=` quantises deltas and fixes T.
- Overload (> 20 % misses / GPU > 0.9 T / CPU EMA > 0.8 T, 1 s) → +1 level (+2 when EMA > 1.6 T); at L2+ a GPU/miss overload is first absorbed by the resolution controller until it reaches its floor.
  Probe up after `delays[level]` (6 s) with < 2 % misses; > 5 % misses within 2 s → revert, `delays[level] ×= 2` (6 → 12 → 24 → 48). Dynamic resolution at L2+ (`dynamicRes`): GPU timer →
  `scale ×= sqrt(0.85 T / gpu)` every 0.25 s; otherwise ×0.92 / 0.25 s while misses > 20 %, ×1.03 / 2 s while < 2 %; floor = preset `dynResMin` (L5: 0.6); changes ≥ 0.02.
- `gpuTimer` (EXT_disjoint_timer_query_webgl2, pool of 4, disjoint-safe), `governor()` state, `simulate({frameMs, gpuMs, cpuMs, refresh, seconds, log})` (fast synthetic frames, C2), `endSimulation()`,
  `titleBenchmark({seconds:2})` (production boot, state `title`: real rAF frames + a few 1-px-synchronised renders → start level 0/1/2, headroom → high offer; `lastTitleBench`, event `titleBenchmark`).
  `autoQuality` off → L0 and scale 1; `dynamicRes` off → scale 1. The v3 EMA governor in main.js is gone (`game.perfScale` = `budget.particleMul`).
###### (12) Timing — `src/main.js`
- Sub-steps: realDt ≤ 0.1, `n = min(2, ceil(realDt·30))`, step dt = realDt·scale / n (≤ 1/20), `n = 1` when the previous frame's simulation took > 8 ms. `game.frame = {step, n, lastStep, frameDt}`.
  **Opt-in:** a playing module with `substeps: true` runs every sub-step; others run once on the last step with the whole frame dt (v3-compatible; see requests). stats runs every step.
  `game.step(n, dt)` unchanged (1/60 → one step per frame). Game-time/real-time = 1.00 at 1/15 and 1/10 s.
- Hitstop: per-entity (`target.hitstopUntil`, `game.playerHitstopUntil`, `game.isHitstopped(e)`), global only for `ult`/`kill` and option-less legacy calls; caps 0.10 (0.12 break/parry,
  0.16 legacy); 3–4 frame floor only when the frame delta is below 50 fps; per-target 80 ms rolling budget (exempt: ult/break/parry/kill/legacy); log records `{t, sec, tier, granted, target, seq, reason}`.
- Per-module CPU ring (`game.debug.perf()`): median ms per module over 120 frames + `render`.
###### (13) Warm-up — `src/core/render.js` + main `prewarm()`
- Boot: module `prewarm()` objects → `compileAsync` (production) / `compile` (tests) for the scene (composer-target variant) and the threat scene (canvas variant) → `render.bootWarm()`:
  one real draw of every object (hidden included, culling off, all layers) into a 64×64 HalfFloat target, and the threat scene as a 1×1 scissored canvas draw. `game.bootWarm = {compileMs, ms, draws}`.
- `render.warm(obj, {target, now})`: compile + one real draw of obj alone (warm layer 30, the host scene's lights enabled on that layer for the call), idempotent per material; `warmStats()`, `isWarm(obj)`.
###### (14) Skills presentation — `src/skills/*`
- familiars: instance colours from the element ramp (core light→mid, halo dark, bolt light, glow mid; base material colour default), spawn/impact via `kit.motif(el,'burst'|'spark')` when the kit exists
  (else a pooled burst in ramp colours), one `castId` per bolt in the hit and the FX. procs: every proc firing = one `castId` shared by its hits + its burst (`kit.motif` burst/spark or legacy
  preset with `castId`/`owner`). classkits: enchant wave (`kit.motif` wave + burst, else smear/shockwave/explosion with castId, ramp `mid` instead of `hex`) and shadow-mark detonation (`kit.motif('shadow','burst')`
  else `impact_shadow`) with the cast's castId. `grep 0xffffff src/skills*` = 0.
###### (15) 성능 테스트 — `src/core/bench.js`
- `game.quality.benchmark({seconds = 20, rotate, mobs = 8})` → `{avgFps, low1Fps, level, renderW, renderH, gpu, tier, cpuMs, gpuMs, seconds, frames, cast, mobs, mode}`; live mode measures real rAF frames
  (CPU = `game.lastFrameCpuMs`), driven mode (game frozen, tests) steps the game itself. Input locked (`bench`), governor locked, player invulnerable + refilled, plains spot, `enemies.spawnBench?(8)`,
  rotation (loadout skill / 0.5 s, ult / 7 s), slow orbit. Restores state, position, look, HP/MP/stamina/resolve, invulnerability, velocity, cooldowns + charges (`skills.cooldownSnapshot/Restore`),
  governor lock, input, bench mobs. `game.quality.formatBench(r)` = 복사 text (template `SETTINGS_TEXT_KO.benchLine`).
###### (16) Debug hooks (§7.7)
- `debug.governor()` (full governor state + `simulate`; also `debug.governor.simulate`), `perf()`, `firstDraws()` (programs drawn for the first time; lazy `renderBufferDirect` hook),
  `programs()`, `newMaterials()`, `fragments()`, `overdraw`, `coverage`, `tells`, `forceAttack`, `lookOf`, `hitstopLog`.
###### (17) Tests
- `tools/bootcheck.js`: third safety config `@noTells` (renames `src/tells.js` away) and `&stub=tells`: boots on the stub, spawned mobs attack (`enemyAttack`/`tellStart`), and `tells.attack` with a
  shape shows the fixed v3 `vfx.telegraph` decal; no uncaught errors.
- `tools/playtest2.js` (§7.9): hitstop probe reads `game.debug.hitstopLog()` (by `seq`) and the hit's `castId` (captured at `combat.dealDamage`): the first hit of each castId logs a hitstop ≥ 0.025 s
  (granted, or dropped by the 80 ms per-target budget); with the v4 kit, later hits of the same castId log none; DoT ticks none. Legacy hits without a castId keep the v3 volley rule.
  Settings: "renderScale lowers the render size" (was: pixel ratio) and "shadows off" = map no longer updated (was: shadow-camera layer mask).
- `tools/playtest4/core.js`: C1, C2, C3, C4, C5, C7 + debug hooks; `PT4_CORE_ONLY=c1,c2,…` runs single blocks (blocks: c5 params seed c1 c2 c3 c4 c7).
- `seed=1` determinism check uses `game.seedRandom(1)` (the rAF loop consumes a boot-dependent number of draws before the harness freezes).

###### Measured at core-b (SwiftShader, 640×360, prod=1, governor=0, seed=1, medium; this branch: v3 world/vfx/enemies/player, tells on the stub)

Counts are representative; SwiftShader wall-clock ms are not (the 4 shared CPUs made 1-px `readPixels` syncs take 1–16 s during these runs).

| Metric | Measured (branch) | Budget | Owner of the gap |
|---|---|---|---|
| Post passes, full-res equivalents (C1) | **1.41** (final 1.0 + bright 0.25 + 3 down / 2 up mips 0.16), 7 post calls | ≤ 2.0 | — |
| Bright target / first mip / mips (C1) | 0.25 / 0.0625 of the render area / 3 (high 5) | ¼ / ≤ 1/16 / 3 | — |
| MSAA at low / medium / high | 0 / 0 / 4 (FXAA off at high) | 0 / 0 / 4 | — |
| Render size at a 1920×970 window, medium | 1406 × 710 = 0.998 MP (`renderSize(1920, 970, 1)`) | ≤ 1.0 MP | — |
| Resolution step | viewport + uvScale follow, textures 38 → 38, 0 reallocations, ≈ 0 ms extra CPU | no realloc, ≤ 2 ms | — |
| Threat-scene colour, bloom on/off/scale 0.8 | (255, 42, 61) in all three | ΔRGB ≤ 8 | — |
| F-mage rotation p95 calls scene + shadow + overlay | 221 + 40 + 0 = **261** | ≤ 250 | vfx (player FX calls), world/mobmodels (shadow ≤ 30) |
| F-mage triangles scene / shadow p95 | 636k / 92k | ≤ 700k / 50k | world, mobmodels, player (shadow casters) |
| F-mage transparents in the scene pass p95 | 74 | ≤ 55 | vfx |
| F-mage uploads p95 | 1443 KB in 120 calls | ≤ 150 KB / 30 calls | vfx (v3 particle pools upload full capacity), world |
| F-mage simulation ms median (`PT.simMs`) | 1.4 | ≤ 3.5 | — |
| Programs after boot | 136 | ≤ 130 | vfx/tells (kit + tells ≤ 10) at integration; post4 itself uses 4 |
| First draws after boot (4-zone sweep) | 0 | 0 | — |
| Boot warm-up (compile + one real draw of every object) | ≈ 2.0 s, 1072 draws (SwiftShader) | — | first-view hitch at Mirwen 8.4 → 6.1 s, Elderwood 1.1 → 0.74 s, plains 1.3 → 0.70 s (sync'd SwiftShader frames) |
| Game-time / real-time at realDt 1/15 and 1/10 (C3) | 1.000 / 1.000 | ≥ 0.99 | — |
| CPU of a 1/15 s frame vs a 1/60 frame (C3) | ≈ 1.0× (no module declares `substeps` yet → legacy modules run once per frame) | ≤ 1.6× | each playing owner when it sets `substeps:true` |
| Hitstop: 30 light requests / s on one target (C4) | 0.075 s granted, rest dropped; other targets 0, no global freeze | ≤ 80 ms | — |
| 성능 테스트 3 s (C7, driven mode) | 10–11 fps avg, 1 % low 10, L0, 640×360, CPU 12–14 ms | fields + exact restore | — |
| Title benchmark (C7) | picks L2 on SwiftShader (misses 0.67–0.75, headroom ≈ 0) | picks a level | — |
| Boot to ready (harness) | 5.8–7.2 s (P0a: 3.7–4.7 s; +≈ 2 s warm draws on SwiftShader) | recorded | — |

Integration-only rows (C6, C8: GPU ratios, long frames, allocation, soak) are measured in wave C with every owner merged.

###### Test results at core-b (this branch, tells on the stub, no other tags merged)
- `node tools/playtest4.js core`: **132 passed, 0 failed, 0 skipped** (C1, C2, C3, C4, C5, C7 + debug hooks; 239 s).
- `node tools/bootcheck.js`: all **17** configs OK (15 v3 configs + `@noTells` + `&stub=tells`: stub true, mobs attack, the stub's shaped attack shows the fixed v3 decal), exit 0.
- `node tools/playtest.js --quick`: all checks PASS, exit 0.
- `node tools/playtest2.js`: 75 PASS, 0 FAIL, exit 0 (hitstop and settings expectations updated per §7.9, see (17)).
- `node tools/playtest3.js` (all sections): **1260 passed, 0 failed, 1 skipped** (1270 s). No playtest3 expectation changed in wave B (core section unchanged since core-p0a).
- After the last governor fix (lock keeps the level): `PT4_CORE_ONLY=c2,c7` re-run 22/0.

###### Measured at core-p0a (SwiftShader, 640×360, prod=1, governor=0, seed=1, medium; v3 render path still in place)

| Metric | F-mage (static frame after set-up) | Budget (§1.2) |
|---|---|---|
| Draw calls scene + shadow + overlay | 170 + 40 + 0 = 210 (rotation samples 249–261) | ≤ 250 (C6, integration) |
| Triangles scene + shadow | 600k + 90k | ≤ 700k |
| Shadow pass | 40 calls / 90k tris | ≤ 30 / 50k (world, mobmodels, player own the casters; P0b core shadow camera) |
| Post passes (full-res equivalents) | 4.17 (v3 chain: sanitize + bloom + output) | ≤ 2.0 (P0b post4) |
| Programs after boot | 142–144 | ≤ 130 |
| Allocation (2 s rotation) | 11.4 MB / game-s | ≤ 1.0 (owners' per-frame rules) |
| Sim ms median / frame CPU median | 2.2 / 9.9 ms (submit 6.2 ms) | ≤ 3.5 / — (submit ≤ 4) |

###### Test results at core-p0a (this branch, tells/vfx-kit on their stubs)
- `node tools/playtest4.js` (core section): **73 passed, 0 failed, 5 skipped** (C1–C4, C7 = P0b) — C5 green; boot ≈ 3.7–4.7 s to ready (SwiftShader).
- `node tools/bootcheck.js`: all 15 default configs `playing` (tells stubbed), exit 0. The third config (`src/tells.js` renamed away) is P0b item 17 (today `src/tells.js` does not exist, so every config already boots on the tells stub).
- `node tools/playtest.js --quick`: all 4 legacy checks PASS (expected 404 of a missing module file is now ignored, like the playtest3 harness).
- `node tools/playtest2.js`: story / sword / settings / perf all PASS (hitstop still global in P0a).
- `node tools/playtest3.js` (all sections): 1259 passed, 1 failed (core `stub=all` count 12 → 13, fixed and re-run: core 198/0), 1 skipped.
- Harness smoke: `PT.longFrames`, `PT.gpuRatio`, `PT.pixels.mask/sobel/iou`, `PT.baseline()` (v3 build boots in 4.7 s), `PT.gpuRatioPages`, `PT.alloc`, `PT.sheet` (144 KB) all return data.

###### Legacy test updates (rule 9 / §7.9)
- `tools/playtest3/core.js`: element colours per §3.2 incl. the shadow special case and the physical ramp; `screenShake` default 0.6; `damageNumbers` default `'merged'`.
- `tools/playtest3/harness.js`: `tells` added to the module list (its 404 is an expected stub).
- `tools/playtest3/core.js`: `stub=all` boots 13 stubs (ORDER gains tells).
- `tools/playtest.js`: a 404 of a module file missing on disk is not a page error.

###### Wave C round 1 — integration (branch `v4-polish`)

Merged with `--no-ff`, one by one, no conflicts: `v4/core, world, mobmodels, tells, vfx, player, magic, melee, mobs, bosses, ux`
(every branch had new commits). Requests: every `docs/v4/requests/*.md` carries a "Resolution" section.

###### Integration fixes (seams, committed as "integration fix: …")
- legacy skill adapter forwards `castId` / `skillId` (`skills/runtime.js`, `skills/adapters.js`); render warm layer 29 (30 = player `HIDDEN_LAYER`).
- `timeScale.comp()` = 1 / lowest *compensating* scale (witch + bossDeath no longer runs the player at 4×).
- reaction hits carry the trigger's `castId` (`combat/reactions.js`): one hitstop / burst per cast (playtest2 sword hitstop line passes).
- ux damage arc switches the vfx radial hurt vignette off (`ui/threatui.js`).
- `progression.mastery()` allocation-free (per-hit path).
- tells rim clones of a mob's hidden LOD view follow the body's visibility (`tells/body.js` + `mobs/rig.js lod.userData.rimVisibleWith`): rims were never drawn beyond the LOD distance.
- tests: C5 stub probe / overlay-call probe with the real tells; world beacon starts unset (ux sets objective beacons); vfx motif probe picks an unregistered pair;
  MG1.g waits for an earlier finisher; PL1 shadows magic's read-only `castLock` getter; T4 refreshes the v4 LOD state; harness attributes non-world objects
  (`world.debug.owns`) to `other`; C6 / C8 implemented in `tools/playtest4/core.js` (`--perf`, or `PT4_CORE_ONLY=c6,c8`; 9 ABAB pairs, `PT4_PAIRS`).

###### Final §1 numbers (merged build, SwiftShader, 640×360, prod=1, governor=0, seed=1, medium)

GPU ratios were measured with the machine otherwise idle; an earlier run with playtest3 in parallel gave F-mage 0.553 (pairs 0.14–2.2): the ratio is only
meaningful on a quiet machine.

| Metric | Measured | Budget | Result |
|---|---|---|---|
| **GPU ratio v4 ÷ v3 (MSAA 4), ABAB 9 pairs median — F-mage** | **0.251** (pairs 0.21–0.57) | ≤ 0.45 | pass |
| **GPU ratio — F-ranger** | **0.335** (0.28–0.37) | ≤ 0.45 | pass |
| **GPU ratio — S-plains** | **0.338** (0.32–0.46) | ≤ 0.65 | pass |
| Draw calls max over sweep S-village / plains / mirwen / elderwood | 164 / 127 / 141 / 156 | ≤ 175 / 140 / 160 / 160 | pass |
| Draw calls p95 F-mage / F-ranger / B-nidhoggra (scene + shadow + overlay) | 176 (154+22+0) / 169 (147+22+0) / 104 (94+11+4) | ≤ 250 | pass |
| F-mage group shares p95 (scene / shadow) | world 112/7, enemies 23/12, fx 18/2, player 4/1, other 12/0 | §1.2 rows | pass |
| Shadow pass F-mage / F-ranger p95 | 22 calls / 26.5k tris; 22 / 26.1k | ≤ 30 / 50k | pass |
| Triangles max S-* / F-mage / F-ranger | ≤ 503k / 476k / 460k | ≤ 600k / 700k | pass |
| Transparent draws p95 F-mage / F-ranger | 40 / 30 | ≤ 55 | pass |
| Fragments ÷ screen S-plains scene / post / world transparents | 1.64 / 1.41 / 0.009 | ≤ 2.2 / 2.0 / 0.5 | pass |
| Fragments F-mage / F-ranger / B-nidhoggra scene+transparent | 1.54 / 1.62 / 1.23 | ≤ 3.5 | pass |
| Player-FX coverage p95 / max F-mage, F-ranger | 1.13 / 1.15; 0.39 / 0.46 | ≤ 1.5 / 2.5 | pass |
| Enemy-FX coverage p95 B-nidhoggra | 0 | ≤ 1.0 | pass |
| Live particles max F-mage / F-ranger | 257 / 452 | ≤ 1000 | pass |
| Uploads S-* median | 7.8–14.1 KB in 14–16 calls | ≤ 60 KB / 30 | pass |
| **Uploads p95 F-mage / F-ranger** | **513 KB in 119 calls / 216 KB in 96 calls** | ≤ 150 KB / 30 | **fail** (fix item) |
| Simulation ms median F-mage / F-ranger / B-nidhoggra | 1.4 / 1.3 / 1.2 | ≤ 3.5 / 4.5 | pass |
| Render submit F-mage median / p95 | 3.2 / 4.2 ms | ≤ 4 / 6 ms | pass (SwiftShader, includes rasterisation) |
| **New materials during the F-mage / F-ranger rotation** | **31 / 12** | ≤ 4 | **fail** (fix item) |
| **Programs after boot** | **161** (growth during rotations 0, first draws 0) | ≤ 130 | **fail** (fix item) |
| Long frames F-mage, 30 s simulation after warm | 0 > 50 ms, 0 > 33 ms (worst 15.9 ms) | 0 / ≤ 2 | pass (one earlier run under load: one 91 ms frame) |
| **JS allocation F-mage / S-plains** | **4.70 / 4.00 MB per game-second** (v3: 9.0–11.5) | ≤ 1.0 / 0.3 | **fail** (fix items: mobs, player, world) |
| 5-min soak (sim-fast) geometries / textures / objects | 664→664 / 76→76 / 2432→2228 | flat ≤ +2 % | pass |
| **Zone transition, worst simulation frame after a teleport** | plateau 2.8, ascent 5.1, **mirwen 75**, elderwood 3.2 ms | ≤ 50 ms | **fail** (world) |
| Render size at a 1920×970 window, medium (C1) | 1406 × 710 = 0.998 MP | ≤ 1.0 MP | pass |
| Post passes (C1) | 1.41 full-res equivalents, 7 calls, bright ¼, mip 1/16, 3 mips | ≤ 2.0 | pass |
| Point lights at medium | 0 | 0 | pass |
| Game-time / real-time at 1/15, 1/10 s (C3) | 1.000 / 1.000; CPU 1/15 frame 1.44 × a 1/60 step | ≥ 0.99; ≤ 1.6 × | pass |
| Hitstop 30 light requests / s (C4) | 0.075 s granted, no global freeze | ≤ 80 ms | pass |
| 성능 테스트 3 s (C7, driven mode) | 10 fps avg / 10 1 % low, L0, 640×360, CPU 14.6 ms, exact restore | fields + restore | pass |
| Title benchmark (C7) | L2 on SwiftShader (misses 0.5, headroom 0), applied | picks a level | pass |

###### Integrated-laptop default (step 5)
- Default quality **medium** (`DEFAULTS.quality = 'medium'`, unknown → medium, C5); medium preset = 1.0 MP pixel budget, MSAA 0 + FXAA, PCF 1024, 3 bloom mips, 0 point lights,
  grass 0.4, particle caps 1000 / 300 (C5, C1).
- Pixel budget: `renderSize(1920, 970, 1)` = 1406 × 710 (0.998 MP), `budgetPx=0.5` at 1280×720 → 942 × 530 (C1).
- Governor (`debug.governor().simulate`, C2): 50 % misses at 60 Hz → L1 within 1.02 s; EMA > 1.6 T → L2 in one step; probe back up after 6 s with < 2 % misses
  (revert + backoff 6 → 12 → 24 s); works at 144 Hz; L2 resolution controller (GPU-timer P-control and the miss-driven ×0.92 path, floor 0.8); fpsCap 30 respected;
  `autoQuality` off and `dynamicRes` off honoured; L4 drops bloom without a new program.
- 성능 테스트 (`game.quality.benchmark`) returns every field, restores the game exactly and formats the 복사 line; the ux settings menu calls it (ux section green).

###### Test results (merged build)
- `node tools/bootcheck.js`: all 17 configs `playing`, exit 0. Note: `@noBosses` boots with `stubbed:["enemies"]` (bossbase.js / golem.js import `./bosses/*` statically) — fix item bosses.
- `node tools/playtest.js --quick`: all PASS, exit 0.
- `node tools/playtest2.js`: 79 PASS, 0 FAIL, exit 0 (the "wind combo hitstop" line passes with the reaction castId fix).
- `node tools/playtest3.js` (all): 1273 passed, **1 failed** (core check 11: programs 161 → 162 after reaching nidhoggra: the boss's instanced `nid-body` with
  `instanceColor` compiles a toon variant that was not warmed — fix item bosses), 1 skipped.
- `node tools/playtest4.js --full` (7000 s cap; melee cut off near its end, player and ux re-run separately): 849 + 145 passed, 28 + 3 failed before the
  integration test fixes; after them the remaining failures are owner items (see the integration result / fix items): vfx V1 clamp + F-shadowblade
  coverage (counting override 1.86), tells T4 rim interior 20 % (≤ 15 %), bosses B1 treant.pods, magic MG1.c detail floors (36/36 bespoke; the v4 combat camera
  shrinks every look: v4/magic + v4/player alone gives fire.basic detail 417 vs 3,077 on the magic branch), MG1.d 33 new materials (--full), MG1.f IoU,
  melee ML1.c detail floors, ML1.g dodge lock (fire c1 0.317 s) and cancel windows (wind.vortex, lightning.ult), ML1.f IoU.
- Per section after the integration test fixes (latest run of each): core 130+ / 0 (C1–C5, C7), world all pass except noTerrain 0.799 vs ≥ 0.80
  (borderline, passed in the --full run), vfx 53 / 0, tells 100 / 1 (T4 rim interior 20 %), mobs 116 / 0, mobmodels 128 / 0, bosses 218 / 1 (B1 treant.pods),
  magic (default + sheets) 24 / 3 (MG1.c), melee (default + sheets) 30 / 4 (ML1.c, ML1.f), player 59 / 0, ux 89 / 0.
- `--sheets`: caster, melee, mobs, bosses sheets regenerated from the merged build and committed; review in `docs/v4/review.md`.
- `--perf`: C6 / C8 as in the table above (GPU gates pass; uploads, new materials, programs, allocation and the Mirwen transition fail).

#### v4 notes — world (`docs/v4/notes/world.md`)

##### world — v4 notes

Owner: world (`src/world.js`, `src/world/*`, `tools/playtest3/world.js`, `tools/playtest4/world.js`, these notes, `docs/v4/requests/world.md`).
Branch `v4/world` (worktree `/home/user/wt4/world`) from tag `core-p0a`. Tags: **`world-p0a`** (heightField + static matrices), **`world-b`** (final).
No newer core tag than `core-p0a` existed at the final run (`git tag -l`: core-p0a, models-p0a, world-p0a), so nothing else was merged.

###### What was built (P0, all items of the §9 world task)

| # | Item | Where | Result |
|---|---|---|---|
| p0a | `world.heightField` | `world.js`, `terrain.js HEIGHTFIELD_GLSL` | R32F `DataTexture` 241×241, NearestFilter, **vertex-centred** (texel (i, j) = getHeight(origin + i·texel)), origin (−180, −180), size 360 m, texel 1.5 m, `glsl` = `float awHeightField(sampler2D tex, vec2 xz)` (4 texelFetch, the getHeight triangle split). GPU error vs getHeight **0.00024 m** (4096 random points). Bilinear taps are NOT exact on cliffs (up to 1.9 m) — use the helper |
| p0a | static matrices | `world.js freezeStaticMatrices()` | every object under a world-created scene root gets `matrixAutoUpdate = false` + one `updateMatrix()` (205 static, 23 dynamic: lights, sky dome, windmill sails, arena crystals, mirror door, prop Object3Ds, beacon) |
| 1 | Terrain chunks + LODs + shader | `terrain.js` | 8×8 chunks (30×30 cells). LOD0 = one Mesh per chunk (exact grid, three.js frustum-culls its bounding sphere), drawn only within **120 m** (AABB distance). LOD1 = every 3rd grid line of all 64 chunks merged into **one** far mesh whose vertex shader collapses the chunks LOD0 draws (`uTerrNear` vec4[16] mask) → far terrain = 1 draw call. Skirts (both windings, 1.2 m / 3 m) on every chunk edge. getHeight / getGroundHeight / raycasts unchanged (CPU height array). New `ShaderMaterial` (`lights:true`, same look as the v3 4-step toon: gradient levels 0.42…1.0, hemisphere + sun + shadows + fog): lighting terms per vertex (sun N·L varying stepped per fragment = crisp bands), **one grain fetch where slope < 0.25** (cross-fade to biplanar 0.25–0.35, biplanar + strata above), 5-tap PCF terrain shadow, **one overlay-mask fetch only inside `uOverlayCircle`** (bounding circle of live burn / bless / curse texels, recomputed when the burn texture changes; r = 0 → no fetch anywhere), grain texture anisotropy 1 (aniso 4 alone was ~15 % of the Elderwood frame). Terrain never casts. Draw order: terrain after the renderOrder-0 opaques (early-z), sky + far mountains last |
| 2 | Point lights | `fire.js`, `surface.js` | created only when `game.render.pointLights === true` (boot); stand-in object otherwise. 0 world point lights at medium |
| 3 | Grass | `grass.js`, `world.js applySettings/applyBudget` | density `settings.grassDensity` (0.25/0.4/0.85) × `budget.grassMul` (live), fade distances × `grassNearFade` (0.6/0.7/1.0), `receiveShadow` per preset (off at low/medium, uniform only), chunks whose nearest point is beyond the fade end skipped on the CPU, far layer = 1-segment blades |
| 4 | Flora | `flora.js` | tree range `settings.treeDist` (120/200/350 m) × `budget.floraMul`, small props at ½, outlines `min(settings.floraOutlineDist, budget.floraOutlineDist)` (20/35/55, L4 20). **Texture-indexed instancing**: each set keeps all instance matrices + colours in a static RGBA32F texture (5 texels/instance); a re-cull uploads only a Float32 index list (4 B per drawn instance, live range, skipped when unchanged). Re-cull at most every 4th frame and only when the camera moved > 2° / 1 m (or the player > 2 m), against a frustum padded by +16° FOV. Shadows: scene meshes never cast; one shadow-only InstancedMesh per family (deciduous / pine / rock, far-LOD geometry, `customDepthMaterial` reading the family texture) on layer 1 within 48 m (rocks 22 m) of the player |
| 5 | Always-drawn village meshes | `world.js applyDistCull` | chimney smoke, altar glow + crystals, pond, world-tree halo + motes hidden outside the village radius (+15 m); sign labels only within 45 m of a sign; camp fires within 90 m; Mirwen mist within its radius + 25 m; Elderwood spores within 25 m of the wood; rot walls frustum-culled by one bounding sphere |
| 6 | World transparents | `water.js`, `mirwen.js`, `elderwood.js`, culls above | water + village pond are **opaque** now (the old see-through look is a mix toward the terrain colour map with the old alpha curve; one opaque layer also early-z rejects the lakebed); Mirwen mist 90 → 48 sprites, ~55 % size, round-discarded |
| 7 | Shadows | `world.js applyShadowQuality` | map size `settings.shadowSize` (1024 low/medium, 2048 high), extent ±32 m, sun 60 m up its direction (caster distance 60 m, camera far 110 m), texel-snapped; layer 1 (shadow-only casters) OR-ed into the shadow camera mask while shadows are on. Village: one position-only shadow proxy of the parts ≥ 1.6 m (layer 1); the detailed village mesh no longer casts |
| 8 | Draw-call share | all of the above | see numbers below |
| 9 | `world.setBeacon(pos|null, {kind})` | `beacon.js` | 40 m unlit pillar (vertical + view-angle fade) + ground ring = **2 calls**, prewarmed via `game.render.warm(…, {now:true})` (0 new programs on first draw); alpha fades from 15 m to 3 m and hides on reach (4 m); kinds quest 0x8fe8ff / camp 0xffa860 / boss 0xb994ff (no reserved threat hue) |
| 10 | Surface damage descriptors | `names.js`, `surface.js` | `SURFACE_ATTACKS[kind] = {id:'surface.<kind>', nameKo, kind:'surface'}` for burning 불길, mud 진흙, cursed 저주받은 땅, blight 오염, void 공허 (+ barrel 불씨 항아리 폭발). Burning grass applies `burning` to the PLAYER with `source = SURFACE_SOURCES.burning` (enemies keep the legacy player-credited source); barrel explosions pass `attack` + `owner:'world'`; every world vfx call passes `owner:'world'`, no `0xffffff` effect colours |
| 11 | Camp names | `terrain.js LAYOUT.camps` | 서쪽/동쪽/북쪽 뿔도깨비 야영지 |
| 12 | Debug | `world.debug` | `setGrassVisible(on)`, `terrainChunks() → {total, visible, near, far, farInView, inView, calls}`, `transparents() → number`, `owns(obj)`, `roots()`, `flora()` |

###### APIs (§7.4.2)
```ts
world.heightField: { tex, origin:{x,z}, size:{x,z}, texel, res:{x,z}, format:'R32F', filter:'nearest', glsl }   // world-p0a
world.setBeacon(pos: Vector3 | null, { kind?: 'quest'|'camp'|'boss' }): void ; world.beacon {active, kind, reached, alpha, position}
world.camps[i].entrance: Vector3          // P1 (delivered)
world.routeTo(from, to, { step = 4, out = [] }): Vector3[]   // P1 coarse breadcrumbs (path network + straight segments, reused out)
world.surfaceAttack(kind) / world.surfaceAttacks / world.surfaceSources / world.surfaceNamesKo
world.debug.setGrassVisible(on), terrainChunks(), transparents(), owns(obj), roots(), flora()
```
`terrainChunks().visible` = LOD0 chunk meshes in view (one draw each); `farInView` = LOD1 chunks in view, all inside the single far draw.

###### Measured (branch, SwiftShader, 640×360, prod=1&governor=0&seed=1, medium; tells/vfx-kit on core stubs)

World-owned counts use `world.debug.owns()` (NPCs = ux, training dummies = mobs are not world; the harness `byGroup.world` includes them).

| Metric | S-plains | S-village | S-mirwen | S-elderwood | Budget |
|---|---|---|---|---|---|
| World scene + shadow calls, max yaw | **105 + 7** | 94 + 6 | 98 + 6 | 92 + 7 | S-plains ≤ 110 + 14; others: total − player 12 − ui 4 (159 / 144 / 144) |
| World shadow tris | 13k | 14k (village proxy 9k; was 35k with the full village mesh) | 12k | 17k | ≤ 20k |
| All owners scene + shadow (v3 player 34 + 15 still in) | 147 + 25 | 171 + 37 | 158 + 39 | 156 + 42 | C6 at integration |
| LOD0 terrain chunk draws (max) | 14 | 16 | 13 | 14 | ≤ 24 and < 64 |
| World uploads per frame while turning 60°/s (max) | 21.6 KB | 18.8 KB | 19.3 KB | 17.1 KB | ≤ 60 KB |
| All-owner GL uploads while turning (max / p95) | 171 / 11 KB | 171 / 12 KB | 175 / 16 KB | 20 / 17 KB | ≤ 60 KB (the max frames are other owners' full-capacity vfx particle uploads, see requests) |
| World transparents ÷ screen (max yaw) | 0.01 | 0.02 | **0.04** (was 1.37: water 0.52 + mist 0.60) | 0.005 | ≤ 0.5 |
| World scene fragments ÷ screen (max yaw) | 1.62 (v3 3.61) | 1.47 | 1.50 | 1.63 | S-* scene ≤ 2.2 all owners |

- **noTerrain, S-elderwood, 960×540, ABAB median**: v3 0.60 → **0.86–0.92** with the terrain shading removed and its depth kept
  (gate; three runs 0.864 / 0.918 / final in the report). Plain hide 0.78–0.86 (since the sky now draws last, hiding the terrain makes the sky shade the hole — v3's ablation
  never paid that); MeshBasic vertex-colour terrain 0.96 (the remaining terrain cost is the grain fetch + shadow).
  Three non-world point lights (vfx, v3) are hidden for this measurement (§2.2 medium = 0); with them visible the ratio is ~0.70.
  SwiftShader pair spread is ±20 % on the shared 4-CPU machine (other agents), so single runs can land ±0.05.
- S-plains draw-call breakdown at 0° (world only): terrain 14 chunks + 1 far, flora 33 (12 sets × near/far/outline), grass 3,
  village 8 (from 100 m), gates 6, structures 3, ambience 3, fire barrels 3, sky 1, far mountains 1, water 1, world tree 2, beacon 0.
  Shadow pass (world): flora families 3 (deciduous / pine / rock far-LOD casters), fire barrels 1, structures 1, windmill sails 1,
  the layer hook 1 (degenerate, 0 px); the village proxy 1 when the village is in the shadow box.
- Shadow-only casters: three r160 tests shadow casters against the VIEW camera's layers (WebGLShadowMap.renderObject), so the
  shadow camera's layer mask (core `applyShadowMode`) has no effect; world uses a degenerate hook caster whose `onBeforeShadow`
  enables layer 1 on the view camera for the shadow pass and the sky's `onBeforeRender` disables it before the next list build.
- Programs: beacon adds 2 (prewarmed); terrain v4 replaces the toon terrain program 1:1; flora sets keep their v3 program keys + `|awinst`
  (+1 depth program for the family casters). `world.init()` warms every world root with `game.render.warm(…, {now:true})` while the
  culled sets are still visible (renderer.compile skips invisible objects), and a degenerate instanced+colour caster drawn in the
  shadow pass for the first 8 frames compiles the default instanced+colour depth variant that flora no longer compiles (other
  owners' coloured instanced casters used it first at the final boss: playtest3 core "programs do not grow" 147 → 148 without it).
- heightField: 0.00024 m GPU, 0 CPU texel error.
- Flora re-culls: 0 while still, 10 per 40 turning frames (every 4th frame).

###### Tests (this branch, final code)
- `node tools/playtest4.js world` (W1, B): **58 passed, 0 failed, 0 skipped** (304 s; ≈ 5 min on the shared machine: 4 S-* boots,
  1 at 960×540 for the ABAB, 1 for presets/heightField/beacon/statics — above the 4-min guideline because of the 4-yaw fragment sweeps).
  Final numbers: S-plains world 106 + 8 calls; S-village / mirwen / elderwood world totals 102 / 104 / 101 (≤ 159 / 144 / 144);
  noTerrain gate 0.90 (plain hide 0.84, trivial material 0.92); world uploads ≤ 21.6 KB/frame; transparents ≤ 0.11 screens.
- `tools/playtest3.js` all sections: 1258 passed, 2 failed (core "programs do not grow after the final boss" → fixed by the depth
  warm-up above; combat "natural P0 triggers: magma" → flaky, passes on re-run). Re-run `playtest3.js core combat world`:
  **388 passed, 0 failed**. `tools/playtest3/world.js` is unchanged (its v3 expectations still hold; rule 9: no update needed).
- Final re-run after the last world commits: `tools/bootcheck.js` 15 / 15 configs `playing`, 0 NOT OK, exit 0 (one earlier run
  died in core's bootcheck file server — a request raced the `@noBosses` rename, ENOENT on `bosses/hydra.js`; re-run clean);
  `tools/playtest.js --quick` all PASS (exit 0); `tools/playtest2.js` story / sword / settings / perf all PASS (exit 0).

###### Integration notes (checks marked I)
- C6: world share holds in S-*; the S-village total (≤ 175) needs the player at 8 + 4 and the ux NPCs trimmed (requests).
- The sky / far mountains draw last (renderOrder 100 / 99) and the terrain at renderOrder 1: an opaque object of another owner
  with renderOrder > 1 would draw after the terrain (fine) and one > 100 after the sky (also fine: depth-tested).
- Water is opaque: submerged parts of swimmers / the hydra are hidden below the surface instead of showing through faintly.

###### P1
- Delivered: `world.camps[i].entrance`, `world.routeTo` (coarse breadcrumbs helper).
- Cut (fallbacks in place): grass crush inside `tells.footprints()` (footprint encoding not published by a tells tag yet; grass
  still bends around the player); camp entrance banners (would cost draw calls; the beacon/compass point at the entrance);
  see-through prefab variant only within 30 m (the OCC screen-door test is a few ALU ops on every prop; unchanged).

#### v4 notes — vfx (`docs/v4/notes/vfx.md`)

##### vfx — v4 notes

Owner: vfx (`src/vfx.js`, `src/vfx/*`, `src/combat.js`, `src/combat/*`, `tools/playtest3/combat.js`, `tools/playtest4/vfx.js`, these notes, `docs/v4/requests/vfx.md`).
Branch `v4/vfx`, worktree `/home/user/wt4/vfx`, from `core-p0a`; merged read-only: `world-b` (heightField). Tags: **`kit-p0a`** (kit + ducking + enemy style), **`vfx-b`** (final).

###### What was built

###### P0-A — the kit (`game.vfx.kit`, tag `kit-p0a`)
| File | What |
|---|---|
| `vfx/kit.js` | assembly + API of §7.4.3: `line, registerShape, mesh, ribbon, bolt, spark, decal, glyph, GLYPHS, ramp, fxMaterial, registerMotif, motif, hasMotif, motifSource, tier, TIERS`. Handles `{alive, stop(fade), setPos, setDir, setScale, setAlpha}` (+ `push` for ribbons, `setEnds` for bolts). castId on every spec → `vfx.debug.byCast(id)`. Reserved shapes (`hatch`, `chevron`, `diamond`) are refused |
| `vfx/linework.js` | ONE instanced premultiplied SDF program for ring / arc / poly / star / ticks / rays / spiral / crescent / glyph / dots / stipple and the decal kinds crack (Voronoi edges) / scorch (broken rings + ember stipple) / frost (hex grid) / ripple / strata (+ lichtenberg / flower / rune as glyph cells). Each instance is an annulus strip (48 × 3, tight to the line band + AA; discs only for filled shapes); planes ground (terrain-conforming through `world.heightField.glsl` in the vertex shader), flat, billboard, oriented; screen-space minimum width (px) via fwidth; back-out / linear / expand / contract scale-in, spin, erosion with a rim band. Two meshes (player = ducked, enemy/world = never ducked) share the program → ≤ 2 calls. Static attributes upload one coalesced range on spawn, dynamic ones the live range |
| `vfx/glyphs.js` | 1024² R8 SDF atlas, 4×4 cells of 256 px, canvas-drawn + Felzenszwalb distance transform at boot (spread 16 px): 9 element sigils, hexagram, futhark band, 12-tick ring, lichtenberg, frost-hex, flower-5, feather |
| `vfx/fxmesh.js` | FM: `registerShape('<el>.<shape>', geo, {blend, outline, max, emissiveBand})` merges into the element's shape atlas; ONE InstancedMesh per element (vertex shader collapses the non-selected shapes) + an inverted-hull outline InstancedMesh sharing the instance buffers → ≤ 2 calls per element. Toon ramp uniforms per element (4-step ramp, gradient attribute `aGrad`), emissive ≤ 1.2, erosion discard with a 0.04 `light` rim band, depthWrite false, back-to-front instance sort ≤ 64, live-range uploads. vfx registers `physical.shard`, `physical.chunk` |
| `vfx/ribbon.js` | RB: camera-facing strips batched 8 per mesh, arc-length resampling (24 pts), taper, head-saturated / tail-desaturated colour, body alpha shorter than the edge, fast → slow streak scroll, premultiplied. Legacy `vfx.trail()` routes here |
| `vfx/bolt.js` | BT: seeded recursive midpoint displacement (17 pts), 0–3 forks, thin `hi` core + `light` halo, regenerated every 2–3 frames, `mid` afterglow line. Legacy `vfx.beam()` routes here (straight beams = jagged 0) |
| `vfx/motifs_generic.js` | the generic fallback for all 9 motif kinds × every element + physical, built from LW / SP / RB / BT with a distinct primary silhouette per element. A look relying on it marks its castId `generic` |
| `vfx/duck.js` | `vfx.shared` (`uPlayerFxMul`, `uThreat` Vector4[16], `uThreatN`, `uCamPos`, `uPlayerPos`), `applyPlayerFx(material, {additive, role})` (side effect only; refuses `userData.shared` and raw shaders; chains `onBeforeCompile`; `customProgramCacheKey` = previous key — or the previous onBeforeCompile source — + `|awfx:<role>`), the factor per vertex from `gl_Position` (projInv / camWorld), `fxMulAt(pos, role)` CPU twin, `fxFactor(id, mul, durReal)`. Footprints from `tells.footprints()` every frame (kinds of `tells/shapes.js`; +0.5 m pad); near-camera smoothstep(1.5, 4); ×0.3 within 1 m of the camera→player segment (segment clamped at 90 % so effects at the player's body are not dimmed); line role ≥ 0.7 × base |
| `vfx/enemystyle.js` | R11: `owner:'enemy'` → particles normal-blended "dark core + `fx.mid` rim" (shader flag), flashes ≤ 1.5 m, linework rings in dark / mid, no glyph circles (`runeCircle` with owner enemy → plain ring), never ducked; `isReservedHue`, `elementOfColor` (sRGB hue) |

###### P0-B
1. **Particles** (`vfx/particles.js`): one premultiplied mesh per owner group (player 2,000 capacity / other 400): additive + normal in ONE call (additive particles write alpha 0). Projected-size clamp in the vertex shader (12 % of screen height for soft / glow / smoke / puff / flare / dust, 20 % otherwise, stretch clamped too). Per-particle duck factor (`fxMulAt`, once per frame), no emission where m < 0.05. `uBoost` 1.0, no push toward white; near-white legacy colours → the element's `hi` / `light`. Live caps from `settings.particleCap / additiveCap` × `quality.budget.particleMul` (L5 emergency cap honoured): 500/150 low, 1,000/300 medium, 2,000/600 high (enemy+world ≤ 30 % of the total). Emitters go through the budget (scaled, thinned past 85 %, ducked). castId per particle. P1 done: soft sprites draw an octagon (≈ 17 % fewer fragments).
2. **Coverage** (`vfx/coverage.js`): cast table (ring of 128, no allocation), a screen-space projector, a runtime estimator per item (particles, LW, FM, RB, BT, rune circles) driving soft / hard budgets (`coverageSoft/Hard × budget.coverageMul`): over soft the soft sprites shrink first, then other particles (only for their own share of the overshoot); over hard soft sprites stop emitting. Player-FX call cap (`settings.fxCalls`, 40 at medium): over it the oldest ghosts / shells / rune circles collapse (circles to a linework ring). `vfx.debug.coverage()` → `{screens, byOwner:{player, enemy, world}, parts, peak, calls}`; the counting override (`PT.fragments({owner:'player'})`) is the truth in tests.
3. **Restraint**: `flashSprite` ≤ 1.5 m (× `budget.flareMul`); `dome()` = LW ring + rim-only shell ≤ 2 m (never near the camera); `screenFlash` tinted (white → ivory), alpha ≤ 0.25, ≤ 0.15 s, off with `flashReduce`; `fovKick` ≤ 4°, used by hitFeel only for `ult`; `shake(t)` × `settings.screenShake` (default 0.6); hitstop durations of §5.10 once per castId through `game.hitstop(sec, {tier, target})`; per target one motif spark (≤ 12), one burst per castId within 0.3 s (tier ≥ heavy); DoT ticks = 1 particle. `impact_<el>` / `explosion_<el>` = `kit.motif(el, 'burst')` + sparks (SZ / LF multipliers gone); the 6 reaction families + universal rebuilt from kit (≤ 60 particles, no domes, ≤ 1 ring, tinted flash only for burst / judgment). `flashEntity`: one flash clone per **source material** (shared by every entity using it), built when an entity registers (`combat.register` → `vfx.prepareFlash`), or `e.flashUniform` when offered. Point lights only when `game.render.pointLights`. Debris / ribbons / bolts / linework upload live ranges; debris is depthWrite false. 0 `0xffffff` in `src/vfx*` / `src/combat*`; fresnel / flame / shell intensities ≤ 1.2.
4. **Combat**: burning re-ramp (`fxassets.flameMat`: base `fire.light` → `mid` → tip `fire.dark` at alpha 0.6, ×1.0); `statusfx.update` without per-frame iterator entries; `queryRadius` without per-call arrays (ring of 32 reused results when no `out`); `pipeline.js`: `× e.vulnerableMul` while `game.enemyTime < e.vulnerableUntil` (after resist; `lastFormula.vulnerable`), `hit.appliedStatuses`, `playerHurt {amount, element, source, sourceName, attackId, attackNameKo, attackKind, appliedStatuses, dot, surface, dir, time, attack}` (`dir` = unit xz toward the attacker), castId + dot passed to hitFeel; `combat.clearStatus(entity, id)`.
5. **Telegraph fallback** (`vfx/telegraph.js`): winding fixed (no mirrored grid: normals up) AND DoubleSide, renderOrder 30, depthTest false, toneMapped false, threat palette (`core/threat.js`), LINEAR time front, pool 16 that never recycles an active decal (timing-only handle when full), `halfAngle` (rad) or legacy degrees; forwards to `game.tells.telegraph` when the real tells exists; `vfx.debug.telegraphs()`.

###### APIs (in addition to v3)
`vfx.kit.*` (above) · `vfx.shared` · `vfx.applyPlayerFx` · `vfx.fxMulAt` · `vfx.fxFactor` · `vfx.prepareFlash(entity)` · `vfx.hurtVignette = false` (ux opt-out) ·
`vfx.debug = {coverage(), byCast(id), calls(), budget(), resetPeaks(), overdraw(on), setVisible(owner, on), telegraphs(), flashClones(), screenFlash(), isReservedHue, duck, cast}` ·
every legacy call accepts `owner:'player'|'enemy'|'world'` and `castId`.

###### Measured (SwiftShader, 640×360, medium, fxIntensity 1.0, legacy spell / sword looks on this branch)
| Metric | Measured | Budget |
|---|---|---|
| F-mage player-FX coverage (counting override) p95 / max | 0.41 / 0.41 screens (estimator p95 0.73) | ≤ 1.5 / 2.5 |
| F-ranger player-FX coverage p95 / max | 0.27 / 0.27 | ≤ 1.5 / 2.5 |
| F-mage / F-ranger player-FX draw calls p95 | 8 / 11 | ≤ 40 |
| F-mage / F-ranger live particles max | 354 / 411 | ≤ 1,000 |
| Kit programs | 5 (linework 1 shared by both pools) | ≤ 6 (kit + tells ≤ 10) |
| FM calls, 20 instances of 2 shapes | 2 | ≤ 2 per element |
| Ring solid raster ÷ disc (annulus check) | 0.15 | < 0.3 |
| impact_<el> ×9 newWhite peak | 0.00 % | ≤ 1.5 % |
| reaction families newWhite | ≤ 0.02 % | ≤ 4 % |
| reaction presets particles | 5–33 | ≤ 60 |
| new materials from vfx/combat in 30 s F-sword | 1 (total 25: 24 from `enemies/base.js showIcon`, mobs) | ≤ 4 |
| projected size soft / other | 0.07 / 0.16 of screen height | ≤ 0.12 / 0.20 |

(Every number above is reported by `node tools/playtest4.js vfx`. Integration (`I`) checks — retention, C6 sums — depend on the real looks of magic / melee.)

###### Tests
- `node tools/playtest4.js vfx` — V1–V4 (functional page with shaderCheck, F-sword 30 s, F-mage + F-ranger; `--full` adds the other classes). Dev split: `VFX_PART=quick|fsword|f`.
- `tools/playtest3/combat.js` updated per §7.9 (rule 9): the telegraph block runs on a `&stub=tells` page and asserts the fallback pool 16, DoubleSide / renderOrder 30 / depthTest off, triangle normals up, linear fill, > 500 changed px for circle / ring / cone / line; on the main page with the real tells it asserts forwarding through `tells.debug.pool()`.
- Final run on this branch: `node tools/playtest4.js vfx` **53 passed, 0 failed** (231 s). Legacy: bootcheck all configs `playing` (exit 0), `playtest.js --quick` all PASS, `playtest3.js` (all sections) **1265 passed, 0 failed, 1 skipped**, `playtest3.js combat` 95 / 0. `playtest2.js` (exit 0) logs one FAIL "wind combo hitstop on every hit": two spell-tier light hits log 0.025 s — §5.10 sets light = 0.025 s and §7.9 hands that assertion to core (requests).

###### P1
- Done: octagon quads for soft sprites; small signature layers for 13 reactions.
- Cut / open: half-resolution soft-smoke target at governor L1+ (needs core; requested); ribbon segments ÷ 2 at L1 (`fxDetail` currently only drops FM outlines); bespoke signatures for every reaction (families + 13 signatures only).

###### Known issues
- The runtime coverage estimator over-estimates by ≈ 1.5–2× (conservative; rune circles / items near the camera are bounded by their on-screen box); the counting override is authoritative. With the L1 pre-emptive headroom on ultimates (coverage × 0.6) soft sprites may shrink for ~4 s in busy fights.
- Spell objects created by magic / melee that are not named `spells*`/`sword*` nor tagged `userData.owner = 'player'` are invisible to the harness's player group.
- Legacy callers of `screenFlash` / `fovKick` outside hitFeel are clamped (alpha ≤ 0.25, ≤ 0.15 s, ≤ 4°) but not tier-gated; magic / melee should stop calling them except for U / F tiers.

#### v4 notes — tells (`docs/v4/notes/tells.md`)

##### tells — v4 notes

Owner: tells (`src/tells.js`, `src/tells/*`, `tools/playtest4/tells.js`, `docs/v4/notes/tells.md`, `docs/v4/requests/tells.md`).
Branch `v4/tells` (from `core-p0a`), worktree `/home/user/wt4/tells`. Merged read-only: `world-p0a`, `world-b`, `kit-p0a`, then `vfx-b` (vfx). `core-b` did not exist at the final run, so the core
render path is the `core-p0a` version (v3 composer chain, global hitstop).

Tags: **`tells-p0a`** (attack / handle / hitTest / canAttack / punish / events + the instanced decal), `tells-b` (before `kit-p0a`
appeared), **`tells-b.2`** (this state: `kit-p0a` + `vfx-b` merged, T2 re-run with kit linework over the decals, P1 element glyph).

###### What exists

`game.tells` (factory `createTells(game)` in `src/tells.js`; returns null → core stub when `game.render.threatScene` is missing). Every visual lives in
`game.render.threatScene` (drawn by core after the post chain: never bloomed, fogged, tone-mapped or dimmed by player FX).

| File | Content |
|---|---|
| `src/tells.js` | TellHandle timing, events, persistence (`tells` save section), canAttack / punish / nextImpact, active() / footprints(), rim assignment, legacy `telegraph(o)` adapter, `hazardAt`, debug |
| `src/tells/shapes.js` | shape records, decal quads, footprint packing (`FOOT_KIND`), `hitTest`/`shapeDistance` = core `tellgeom.js` reference |
| `src/tells/timing.js` | §5.7 floors (`MIN`, `LOCK` from core), melee classification, sounds, perfect window, teaching slow-mo, end animation |
| `src/tells/decals.js` | ONE ShaderMaterial for every decal shape; instanced families `radial` (circle/ring/cone, 16 shared with `linear`), `linear` (line/capsule/conecap), `zone` (hazard/safe, 8), `wave` (jump shockwaves, 4), `marker` (projectile rings, 12), `ribbon` (P1, 6) |
| `src/tells/icons.js` | ONE instanced sprite batch (64) over a canvas mask atlas: glint star, ⚠, ⤒, !, diamond sparkle, rising chevron, ring, `공격 기회!` |
| `src/tells/body.js` | rim clones (4 slots; skinned + static material per slot), `rimSources(e)` fallback chain |
| `src/tells/zones.js` | hazard / safe zones, projectile markers, shockwaves, punish sparkles |
| `src/tells/thumbs.js` | `renderThumb(kind, size)` via `game.render.snapshot` (same materials) |
| `src/tells/text.js` | Korean world text (`공격 기회!`) |

###### Timing (one source)
- `attack(e, spec)` → `TellHandle | null` (null while `canAttack(e, {melee})` is false). `dur = tellDuration(windup, cls, assist.tellMul, e.timeMul)` (core reference:
  `max(windup, MIN[cls]) × max(0.9, tellMul) × timeMul`), on `game.enemyTime`; lock at `max(spec.lockAt ?? 0.35, LOCK[cls])` before the hit. No first-encounter bonus.
- `consumeStrike()` is the only strike latch: true exactly once on the first sub-step with `enemyTime ≥ start + dur` (emits `tellEnd {reason:'strike'}`); `stop(reason)` →
  `tellEnd {reason}`. Handles never consumed are cancelled 2 s after their hit; handles of dead/dying/removed enemies are cancelled.
- `tellCommit` at the lock (from `update`, once per frame) + `tell_commit` / `tell_parry` sound + glint; `tellFirst {tell}` once per kind per save (save section `tells`
  = `{seen}`); teaching slow motion `timeScale.set('teach', 0.4, 0.6, {compensate, priority: 2})` ~0.3 s before the hit of that first tell when `assist.teachSlowmo`.
- Per-entity hitstop: `update` extends un-struck handles by the frame's `enemyTime` delta while `e.hitstopUntil > realTime` (see requests/core).
- `spec.shape.follow`: origin follows the enemy until the lock; `setPos/setDir/setEnd` are ignored after the lock (aim frozen).
- Jump tells: travelling ring from the hit (12 m/s, 0.25 m band, `maxR`), `h.shockwaveR()`, `h.shockwaveHits(pos, pad)`.
- `canAttack(e, {melee})`: false during the punish window; with `melee` also false when the enemy is outside the camera frustum and > 3 m from the player.
  `attack()` classifies melee from `spec.melee` or `cls ∈ {mobLight, mobHeavy, combo, elite}` (projectile tells are never melee).
- `punish(e, dur, {mul = 1.25})` → `e.vulnerableUntil` (enemyTime) / `e.vulnerableMul`, `punishWindow`, `punish` sound, 4 rotating diamonds + `공격 기회!`.

###### Decal shader (§5.2, §5.3)
Local shape SDF per fragment (circle, ring, cone = pie SDF, line = box, capsule = segment, conecap = segment ∪ rotated pie), metres-per-pixel from `fwidth`:
dark outer band `max(0.12 m, 3 px)` α 0.75 outside the true edge · rim `max(0.18 m, 3 px | strong 5 px)` α 0.95 inside the edge (parry: 12 dashes per circle / 1 m dashes on
straight edges; unblockable: double rim), ×1.5 after the lock, lock flash = own hue × (1 + 0.35) clamped (never toward white) for 0.1 s · fill 0.16 (strong 0.28, hazard hatch
0.18, safe 0.12) · region behind the linear front 0.32 · front line 0.12 m (≥ 1 px) in a lighter rim tint, `#FFF4F0` once `remaining ≤ 0.20 s × assist.perfectMul` · 3 flat
chevrons scrolling 0.6 Hz toward the hit on directional shapes · P1 faint element glyph (below) · end: 0.5 fill for 2 frames, fade 0.12 s. Colours are uniform arrays indexed by tell kind, refreshed from
`threatColor(kind, assist.colorblind)` when the preset changes (shapes unchanged). Placement: grid quads mapped in the vertex shader (orientation-preserving, normals +y,
DoubleSide), height from `world.heightField` (same triangle interpolation as `getHeight`, texelFetch), lift 0.06 m; flat at `pos.y` when the shape stands > 1 m above the terrain.
Fallback without `heightField`: per-decal 24×24 CPU height grid rows in one R32F texture, rebuilt only when the decal moves > 0.1 m (same program, same families).
P1 element glyph: `attack()` reads `spec.el ?? spec.element ?? e.element ?? e.el` (`fire, ice, lightning, wind, water, earth, nature, light, shadow`;
aliases holy→light, void/dark→shadow, thunder/electric→lightning, frost→ice, poison→nature; `spec.glyph:false` opts out; physical/unknown → none) and stores
`(atlas index + 1) × 64` in the style bits (no new attribute, no extra upload). The fragment samples the vfx kit glyph SDF atlas (`game.vfx.kit.glyph(el).tex`,
bound once on first use; a 1×1 blank R8 texture is bound before, so the program is the same with or without the kit) with `textureGrad` (gradients taken
before any branch) and analytic SDF AA; drawn under the chevrons/front/rim at α 0.20 in the rim hue 45 % toward `#FFF4F0`: circle (centre, r ≤ 0.45 R, ≤ 2 m),
cone (0.55 R along the axis), line/capsule (mid-length); not on rings, conecaps, hazards, safe zones, markers, waves. Measured (T4, r 3 circle at 6 m, 960×540):
1,195 px changed, mean ΔRGB 13, max 34; decal footprint vs no glyph 14,270 / 14,230 px (+0.3 %); still 4 tells programs.
Soft occlusion: scene point from `post.sceneDepth` (`projInv`, `camWorld`), occluder only when nearer by > 0.3 m **and** > 1.0 m above the decal plane → α × 0.40.

###### Body tells
Rim clones of `e.rimSource()` (≤ 2 meshes; fallback `e.model.skin.meshes`, then the two largest opaque meshes): SkinnedMesh bound to the source skeleton/bindMatrix (or Mesh),
`matrixAutoUpdate = false`, matrices copied in `preOverlay()`; BackSide hull expanded 2–3 px in clip space (+1 px after the lock, +1 px strong), alpha 0.35 → 1 over the windup,
flash at lock; fragment hard depth compare `hullDepth ≤ sceneDepth + 0.05 m`. ≤ 4 rim draw calls (nearest by remaining time, one mesh per enemy first, then second meshes).
`preOverlay` clears the canvas depth when rims are active (the hull self-occludes with depthTest).

###### Other APIs
`projectile(obj, {r = 0.6})` · `hazard({pos, r|shape, dur, kind, nameKo})` · `safe({pos, r|shape, dur})` (safe zones are in `footprints()`) · `hazardAt(pos, pad)` ·
`telegraph(o)` (v3 adapter: full degrees → rad half-angle, or `halfAngle` in rad; `tell` / `unblockable` / grab → unblockable, parryable → parry, else danger;
times on `game.time` like v3; v3 handle + `setPosition` alias + `onDone`; `owner:'player'` → timed handle without a decal, since the threat scene is enemy-only) ·
`active()` (reused records + `locked`, `handle`) · `footprints()` (`{data: Float32Array(64), n}`, 8 nearest to the player: true shapes, conecap = capsule + cone, safe zones,
hazards, winding-up bodies r + 1 m) · `renderThumb(kind, size)` (`danger, parry, unblockable, jump, projectile, hazard, safe, punish, perfect`) · `MIN`, `LOCK` ·
`debug.{setVisible, pixelsOf, pool, rims, sprites, occlusion, heightAt, reset, resetSeen, handles, …}`.

###### Measured (branch, SwiftShader, `prod=1&governor=0&seed=1`, medium)

| Metric | Measured | Budget |
|---|---|---|
| Overlay draw calls with every cue live (decals, zones, wave, marker, sprites, punish) | 6 (12,950 tris); + rims ≤ 4 | ≤ 12 (decals ≤ 6, rims ≤ 4, sprites 1, markers 1) |
| Decal draw calls (families visible) | ≤ 5 (radial, linear, zone, wave, ribbon) | ≤ 6 |
| tells programs | 4 (`tells-decal`, `tells-sprite`, `tells-rim` skinned + static) | ≤ 4 (kit + tells ≤ 10) |
| Uploads with 16 decals live | 1,536 B/frame (one interleaved bufferSubData per visible family) | ≤ 16 KB |
| Allocation in `tells.update` + `preOverlay` (10 tells + zones + marker + punish, CDP sampling 1 KB) | ≈ 6 B/frame | ~0 (§2.7) |
| `tells.update` CPU (same load) | median < 0.1 ms, p95 0.1 ms | — |
| T1 changed px at 8 m, 960×540, grass on | circle 61.8k, ring 166.8k, cone 32.7k, line 39.3k, capsule 34.7k, conecap 35.2k | ≥ 600 (v3: 0) |
| heightField conformance (6 m decal, 5 spots, vertices + cell midpoints) | max 0.008 m | ≤ 0.1 m |
| T2 telegraph px with player VFX over the decals ÷ hidden (vfx-b linework + ~710 legacy particles) | 1.027 / 1.012 / 1.001 / 1.001 (before kit-p0a: 1.06–1.07) | ≥ 0.95 |
| T2 grass on ÷ off | 0.997–0.998 | ≥ 0.95 |
| T2 behind a 2.6 m wall (median per-pixel contribution ratio) | 0.418 (mean 0.437: the wall's lowest metre is not an occluder by rule) | 0.40 ± 0.05 |
| T2 rim colour bloom on vs off | ΔRGB max 1 | ≤ 8 |
| T4 rim clone (bokoblin, v3 model): interior changed / perimeter outlined | 8.1–12.6 % / 90–96 % (pose varies between runs) | ≤ 15 % / ≥ 60 % |
| Progress linearity / strike latch | error 0 / exactly once, on the due sub-step | ≤ 0.02 / ≤ 1 sub-step |
| hitTest vs core reference | 0 mismatches / 10,000 points (+ 1,000 handle `contains`) | 0 |
| Flash rate (rim region luminance, 20 Hz sampling) | 0 peaks | ≤ 3 Hz |
| Boot programs (bootcheck, all configs) | 146 (core-p0a baseline 142 + the 4 tells programs) | ≤ 130 overall (core/C6, integration) |

Integration-only (I) checks to verify at wave C: T2 with real looks (R-mage, R-sword, R-boss) — the branch form shows the threat scene is independent of anything drawn in the
main scene (ratios > 1 because particles behind the decal raise the per-pixel diff); enemy-body-visible rows depend on mobs adopting `tells.attack` + rim sources.

###### Tests on this branch
- `node tools/playtest4.js tells`: **101 passed, 0 failed, 0 skipped** (83 s; T1–T4, P1 glyph, the no-heightField fallback page, rule 5/6 greps), with world-b + kit-p0a + vfx-b merged. `TELLS_ONLY=<regex>` runs a subset (development only).
- `node tools/bootcheck.js` (15/15 configs reach their state; only the expected 404s of the two renamed-directory configs), `tools/playtest.js --quick`: pass.
- `tools/playtest2.js`: pass (79 checks; the kit-p0a hitstop failure is gone with vfx-b).
- `tools/playtest3.js` (all sections, vfx-b merged): **1266 passed, 0 failed, 1 skipped** (937 s).
- No playtest3 section is owned by tells (§7.1), so no legacy expectations changed (rule 9).

###### P1
- **Done**: 0.35 m vertical rising-edge ribbon on circle/ring AoE rims > 6 m (same program, `ribbon` family, height grows with the progress; 1 call).
- **Done**: faint element glyph in the fill (vfx kit glyph atlas; see the decal section). Fallback without the kit: no glyph (retried at most once per second), same program.
- **Cut**: nothing.

###### Known issues / notes
- `kit-p0a`'s `vfx.telegraph` forwards **every** call to `tells.telegraph`, including the player-cast `fx('telegraph')` AoE previews of spells/sword archetypes, which
  therefore show as red danger decals in the threat scene until magic/melee pass `owner:'player'` (the adapter then skips the decal) or stop calling it (requests/vfx).
- Mobs/bosses still use `ctx.tele` (→ the adapter, timed on `game.time`) and `ctx.telegraphs.show` rings (main scene) until they adopt `tells.attack` (requests).
- `tools/playtest3.js combat` "natural P0 triggers … magma" (vfx-owned section) was flaky after the `kit-p0a` merge; it passed in the final run with `vfx-b`.
- The glyph atlas (1024² R8, owned by vfx) is bound to the decal material on the first elemental tell; if vfx has not drawn a glyph yet that first frame
  uploads it once (≈ 1 MB + mips). Mobs/bosses must pass `spec.el` (or set `e.element`) to get glyphs.
- `canAttack`'s off-screen test uses the camera frustum with the enemy's upper-body sphere; it recomputes the frustum per call (cheap, allocation-free).
- Thumbnails and the `공격 기회!` text use the system Korean font of the canvas; on machines without one the text cell falls back to the browser's default sans-serif.

#### v4 notes — mobs (`docs/v4/notes/mobs.md`)

##### mobs — v4 notes (branch `v4/mobs`, from `core-p0a`; merged read-only: `core-b`, `tells-b.2`, `mobmodels-b`, vfx via core-b)

###### What was built (all P0 items of the §9 task)
1. **Model contract** (§4.0): `base.modelFor(ctx, type, opts, legacy)` = `MobModels.createModel?.(type, opts) ?? MobModels.wrapLegacy?.(legacy()) ?? legacy()`;
   every behaviour file uses it (wolf alpha = pack slot 0 → `{variant:'alpha'}`, shaman `{element}`, chuchu `{variant}` incl. `wind`).
   `makeEnemy` forwards `e.rimSource()`, `e.tellAnchor(kind)`, `e.flashUniform`; `model.update(dt)` runs once per visual frame for v4 models;
   the v3 outline/shadow distance loop runs only for wrapped v3 models. `enemies.previewModel(type, opts)` → registered preview or `MobModels.preview`;
   `enemies.registerPreview(type, fn)` for bosses. `enemies.prewarm()` returns `MobModels.warmObject()` (+ `GolemMod.prewarmGolem?.(game)`).
2. **Attacks on one TellHandle**: `base.beginAttack(ctx, e, id, shape)` builds the `tells.attack` spec from `codex.ATTACK_SPECS` (exact §4 ids, tells,
   windups, rad half-angle shapes, lockAt) with `nameKo` from the codex, emits the extended `enemyAttack`; `null` → the AI repositions (strafe / cooldown).
   Strikes resolve only through `h.consumeStrike()`. Rhythm: anticipation (`windupK`) → **hold 0.13 s** (pose frozen, no damping) → strike ≤ 0.12 s
   (`RHYTHM`, `attackPhase`) → slump/recovery pose for the punish duration. Lobs use the release point (`attackPhase(h, h.lockAt)`).
3. **Hitbox = decal**: hits test `h.contains(playerPos)` (locked decal, pad 0.15); `ctx.meleeCheck` = cone through `tells.hitTest` (no +radius 0.4, no
   d < 1 m shortcut); `ctx.slam(center, r, {handle?, shape?, attack})` tests the handle/shape; jump avoid = feet − ground > 0.6 m. Travelling attacks
   (chuchu lunge capsule + landing circle, lizard lunge capsule w 1.6, wolf dart line ≤ 9 × 1.3) hit on body contact **inside the drawn shape** only.
   Every hit carries `attack:{id, nameKo, kind}` + `sourceName`; every enemy vfx call passes `owner:'enemy'` (loot / camp celebration `owner:'world'`).
4. **Punish**: `base.punishAfter(ctx, e, id)` → `tells.punish(e, dur × timeMul, {mul})` with the §4 table; recovery state lasts the window; `tells.canAttack`
   blocks attacks (verified). Shaman cast interrupted by a hit → `dazed` 1.5 s + punish ×1.5. Voidknight slam parry → `e.parryDur = 2.0` stagger.
5. **Projectiles** (`projectiles.js`, also bosses): homing ≤ 0.5 s at ≤ 120°/s (slerp-limited), then straight; speed capped 8 (mob) / 10 (`source.isBoss`);
   shaman 7.5, wraith 8; ≤ 6 enemy orbs (oldest fizzles); enemy style (dark core `fx.dark`, `fx.mid` rim, no white); `tells.projectile(orb)` marker;
   `enemies.orbCount()`, `enemies.orbEta(pos)`; casters take the single ranged token (`ctx.takeRangedToken`). Spore clouds are `tells.hazard`s and tick only
   while the hazard lives; the cloud sits on the drawn landing circle; fire hits inside a cloud burn it away; golem boulders telegraph via `ctx.tele`.
6. **Behaviour fixes**: voidknight bash = 0.55 s visible shield raise, only after 2 consecutive guarded hits, knockback only; combo decals one by one
   (0.80/0.55/0.65, cones 3.2/3.2/3.6, half-angles 1.0/0.70/1.0, rune slot per step via `model.setComboStep?.`); back hits ×1.5; wolf circle 4.5 m,
   one wolf attacks at a time (`ctx._wolfAttacker`), slide 0.8 s punish; shaman/wraith blink cd ≥ 8 s with a 0.4 s shimmer at the destination first,
   no cast for 1 s after a blink; wraith stays visible 1.2 s after firing (punish); chuchu aura every 2.0 s = 0.5 s glow + circle r 1.6 (`check` class);
   weak-element hits pop a 말랑이 at ≤ 40 % HP; lizard lightning ×1.5 while wet, ice in water → frozen 2 s, −30 % speed out of water; no wraith mask weak point.
7. **Data**: NEW `src/enemies/codex.js` — `CODEX` (16 entries: 8 types + 8 `chuchu:<variant>`), `ATTACK_SPECS`, `WEAK`, `CHU_WEAK`, `CHU_NAMES`, `TYPE_NAMES`,
   `nameOf`, `attackMeta`, `attacksOf`, `applyWeakness`. Every entity: `weakness/resist/immune`, `attacks`, `debugAttack(id)`, `timeMul`, `type`, `codexKey`.
   `enemies.registerCodex/codex()`, `noteEncounter(type)` (save section `encounters`), `enemyEncounter {type, enemy, first, sight}` on first sight
   (≤ 30 m, in the frustum, scanned every 0.25 s) and on first aggro per session, `aggroCount()`, `spawnBench(n)` / `despawnBench(list)` (no damage /
   loot / XP / kill count), `debugResetEncounters()` (test hook). `dummy.practice('danger'|'parry')` = slow ×1.5 tells swing; the v3
   `enemies.practiceAttack(entity)` keeps v3 timing (legacy decal through the tells adapter) so story/playtest2 stay unchanged.
8. **Time**: enemy logic dt = step dt × `assist.enemySpeed` (tells times the windups on `game.enemyTime`); per-entity hitstop skips the whole update while
   `e.hitstopUntil > game.realTime` (tells extends the frozen handle); `scaling.js` DIFFICULTY_FALLBACK gains `story`, `telegraphMul` = 1 everywhere,
   `checkAddSec` (+ `checkAdd` alias); `ctx.tele` no longer multiplies anything.
9. **Perf**: `enemies.substeps = true`; poses / springs / `model.update` / icons only on `game.frame.lastStep`; animation half rate 30–60 m, paused > 60 m
   (camera distance); `game.render.warm(e.object)` on the first spawn of each type+variant for wrapped v3 models only (v4 mob materials are shared
   and warmed at boot by `MobModels.prewarm`; bosses warm in `prewarmBoss`) — warming every first spawn put a one-frame warm burst (≈ 1150 calls)
   into playtest3's village draw-call sample; wander allocations removed; tell shapes are per-entity reusable
   objects; `separate()` unchanged (no `new`; the sampled "allocation" there is V8 heap-number churn).
10. `enemies.js`: `import * as GolemMod from './enemies/golem.js'` (`GolemMod.createGolem`, `GolemMod.prewarmGolem?.(game)`).

Korean player text lives only in `codex.js` (entity names via `typeName`); remaining Korean in mobs files: the v3 `'붕괴!'` canvas word texture
(`common.js`) and `GOLEM_INFO` (bosses data kept in `enemies.js` for the golem) — both exempted in the rule-6 check and listed here.

###### Measured (branch, SwiftShader, 640×360, prod=1&governor=0&seed=1)
- `node tools/playtest4.js mobs`: **116 passed, 0 failed** (≈ 28 s). M1 per attack (tellStart → damage, hold before the strike):
  boko swing 0.80 s / hold 0.32 s* · boko leap 1.25 / 0.12 · shaman orb (cast 1.0) · chuchu lunge 0.78 / 0.12 · chuchu aura 0.50 (check class) / 0.12 ·
  lizard thrust 0.80 / 0.12 · lizard lunge 0.93 / 0.12 · shroom lob 1.90 (+ cloud tick) / 0.12 · wolf bite 0.90 / 0.12 · wraith bolt (cast 1.0) / 0.12 ·
  voidknight combo 0.80 / 0.55 / 0.65 · slam 1.10 · bash 0.55 — every id ≥ its §5.7 floor; hitbox ±0.3 m correct for every non-projectile shape.
  (*longest still run; includes the converged anticipation.)
- Orbs: last homing turn at 0.50 s, max turn rate 36°/s (limit 120°/s), shaman 7.5 m/s; sideways walk at 5.5 m/s from 10 m dodges; `orbEta` within
  0.11 s of the real arrival; 10 orbs requested → 6 alive.
- Animation rate: 60 / 30 / 0 pose updates per second at < 30 m / 30–60 m / > 60 m.
- `enemies.update` with the 12-mob F roster (armoured, attacking): median **0.30 ms**, p95 0.90 ms per frame (host CPU, render off).
- Enemy-owned FX ≤ 1.0 screens p95 in B-* and the C6 draw-call rows are integration (I) checks — not measured here; enemy FX now go through
  `owner:'enemy'` (enemy style) and orb visuals shrank (halo 1.3→1.1, 2.6→1.9 m, trails 0.42→0.3 m wide, emitter 32→18/s).

###### Legacy tests (this branch)
- Full `tools/playtest3.js` (before the warm fix): 1264 passed, 3 failed (core zones elderwood calls 314/310, perf elderwood 314/310, narrative village
  1440/290 — all the first-spawn warm burst). After the fix: `playtest3.js narrative core` 0 failed (village + elderwood within budget).
- `tools/bootcheck.js` exit 0 (all configs playing, no console errors). `tools/playtest.js --quick` all PASS. `tools/playtest2.js --only sword` 0 FAIL
  (full run earlier: story/settings/perf unchanged). `tools/playtest3.js enemies`: **139 passed, 0 failed, 1 skipped**.
- §7.9: `tools/playtest3/enemies.js` gained "§4 windups: tellStart → damage" (bokoblin.swing, lizard.thrust, voidknight.combo1 = 0.80 s). The boss
  checks are unchanged: `docs/v4/requests/bosses.md` did not exist when this branch was built, so no new boss expectations were applied.

###### P1
- Cut: alpha-wolf hesitation after the alpha dies (codex does not mention it), shroom "hit the cap during the windup pops the sac", wolf crack pulse
  driven from behaviour (mobmodels' `pose('windup')` offers it; the behaviour pose code drives the v3 pivots). Fallbacks: v3 behaviour.

#### v4 notes — mobmodels (`docs/v4/notes/mobmodels.md`)

##### mobmodels — v4 notes

Owner: mobmodels (`src/enemies/models.js`, `src/enemies/models2.js`, `src/enemies/mobs/*`, `tools/playtest4/mobmodels.js`, `tools/playtest4/sheets/mobs/*`).
Branch `v4/mobmodels` (from `core-p0a`), worktree `/home/user/wt4/mobmodels`. Tags: `models-p0a` (registry + wrapLegacy), `mobmodels-b` (final).
`models.js` / `models2.js` are unchanged (append-only rule kept; the v3 builders stay for wrapLegacy and the "v3 row" of the sheets).

###### What was built

###### Registry — `src/enemies/mobs/index.js` (PLAN §7.4.6)
- `createModel(type, {variant?, element?, scale?, seed?, game?}) → EnemyModel | null` for `bokoblin, shaman, chuchu, lizard, shroom, wolf, wraith, voidknight, dummy`
  (`TYPES`). Variant keys: `shaman:<element>` (any element; fire/ice pre-built), `chuchu:<normal|fire|ice|lightning|wind|water|nature|light|shadow>`, `wolf` / `wolf:alpha`.
- `wrapLegacy(v3Model | Object3D) → EnemyModel` (models-p0a): augments the v3 object in place (all v3 fields stay): `meshes`, `proxy` (= v3 outline mesh), `lod` (= body),
  `bones`, `features` (all false, `legacy:true`), `tellAnchors` (bones, else a head anchor at `headTop`), `flashUniform` (setter; lazily clones the body materials once per
  entity with the same program keys and drives their emissive), `rimSource()`, `pose(name, t)` adapter (humanoid / quad / blob), `update()` no-op, `dispose()`.
- `preview(type, opts)` → fresh idle-posed root (v3 fallback); `prewarm(game)` → every mob material (body, shell, glow, outline), warms them as skinned meshes via
  `game.render.warm(warmObject())` and builds all types/variants in `requestIdleCallback`; also `buildAll()`, `stats()`, `defFor(type, opts)`, `legacyModel(type)`, `warmObject()`.

###### Kit — `src/enemies/mobs/rig.js`
- **One build per type**: parts are primitive *specs* rebuilt at 3 detail levels → ONE indexed skinned geometry holding `[body | LOD]` index ranges (Uint8 colours,
  Int8 normals, Uint8 skin indices/weights), a glow geometry (unlit, colours ≤ 1.2), a silhouette-only proxy (big parts only; no cards, trims, thin or small parts).
  Shared `boneInverses`; an instance builds only Bones + Skeleton + 4 SkinnedMesh wrappers.
- **Draws**: body + glow + outline proxy (3; bokoblin/lizard/dummy have no glow → 2). Beyond the LOD distance the body draws its LOD range and the proxy hides (≤ 2).
  **Shadow**: `onBeforeShadow` switches the body to its LOD range, so the only caster is the LOD (≤ 2k tris; accessories, springs, glow, eyes never cast).
- **Per-instance hit flash with shared materials**: bone 0 is a dummy; `flashUniform.value` is written into its matrix element `[0].w` in `onBeforeRender`
  (bone texture) and read by the shared body/shell shader (key `toonRim+dis+mob4` = `toonMat` rim + dissolve chunk + flash). 0 new materials, no program flips.
- **Outline material** (`outlineMat`): skinned inverted hull pushed along the projected normal by a constant **1.6 px** (`uRes` = `game.post.sceneRes`) + a 3 cm pull
  toward the camera (lines survive where feet/hems meet the floor). One program; colour per species = uniform. (The v3 world-space hull falls below 1 px at gameplay range.)
- **humanoid2** (v3 13 bones, v3 rest layout and hip heights, + `jaw`, `lidL/lidR` (blink = scale-y), `thumb`/`fingers` per hand, spring bones), **reptile** variant
  (`digitigrade` knee → ankle, counter-rotated in `update()`; `tail1..4`), **quadruped** (wolf: `rig, neck, jaw, leg/low/paw ×4, tail1..3, ears, lids`).
  Smooth 2-bone weights (0.5/0.5 at the joint, 6 cm band) at shoulders, elbows, hips, knees, waist, neck, jaw and tail segments.
- **Vertex colours**: crevice AO baked from part ellipsoids (−25 %), ground-contact darkening (−15 % in the lowest 12 cm), belly/underside gradients, darker extremities,
  species painters (war paint, glyph trim, moss/lichen, scale-ridge bands, back stripe, plate-bevel trim); the toon material adds the fresnel rim band.
- **Faces**: `eye()` = sclera + iris + pupil (round or slit) + highlight; lids with a seeded 3–6 s blink; brows/brow ridges; jaws with teeth/tusks/fangs.
- **Poses** `pose(name, t)`: idle, walk, windup (anticipation squash ×1.15), hold (identical for every t), strike, recover (slump), stagger, die; `poseTarget()` for damping.
- **update(frameDt)** (no-op unless `game.frame.lastStep`; allocation-free): springs (lag behind the parent's model-local velocity + sway), blink, LOD/outline switch from
  `game.quality.budget` (preset `enemyLodDist` × `enemyLodMul`; outlines ≤ `enemyOutlineDist`; 1 m hysteresis), digitigrade ankles / level paws, chuchu blink bone.

###### Species (`src/enemies/mobs/<type>.js`) — every §4.1–4.8 Model item
| Type | Body+glow / LOD = shadow tris (budget) | Items |
|---|---|---|
| bokoblin | 7998 / 1495 (≤ 8k, proxy ≤ 2.5k) | tusked under-bite jaw, heavy brow ridge, 2 distinct curved horns × 2 ring bands, 4-finger fist around a knotted club (3 bone spikes, leather wrap), loincloth front/back springs, shoulder strap, belt pouch, bone necklace, ear springs, war paint, belly gradient |
| shaman | ≈5.5k / 1143 (≤ 7k) | hooked nose, mouth line + fangs, painted brow, slit glowing eyes + lids, long-fingered hands, robe lathe + glyph-trim band, 2 hem spring strips, hood + feather crest (spring), staff skull + feathers (spring), element gem in an orbiting ring (`halo`, grows in windup) |
| chuchu ×9 | ≈1.3–1.6k / 186 (≤ 4k) | 20×14 translucent shell, glyph-shaped core per element, squash-ring band, smile / `O` / `x x` states, pseudopods, crown springs; crowns: flame tongues, hex prisms, antenna sparks, leaf swirl, droplet, sprout, halo, shadow horns |
| lizard | ≈5.1k / 956 (≤ 8.5k) | digitigrade legs, long snout + teeth rows + jaw, slit pupils + lids, 4-bone tail (tail3/4 springs), dorsal frill flaring on windup (spring + pose), ridge bands, wet-skin gradient, bone-tipped spear + cloth wrap (spring), shell pauldron |
| shroom | ≈4.9k / 826 (≤ 7k) | cap on spring bones, pleated gill fan, 7 spore pores (glow, swell in windup), spots, moss/lichen, sleepy lids, stub arms with 3 fingers, 3 root toes per foot, spore sac |
| wolf (+alpha) | ≈3.9k / 794–857 (≤ 8k) | lighter slate palette, pale muzzle + chest blaze, back stripe, fur tufts (neck ruff spring, shoulders, haunches, tail), 3-bone tail, ear springs, fangs, glowing amber slit eyes, flank void cracks (swell in the crouch); alpha: bigger mane + white scar |
| wraith | ≈3.7k / 503 (≤ 6k) | hood with bone mask (eye holes, crack, jaw + teeth, eye glow), skeletal clawed hands, 16-link chain, 3 hem spring strips + ragged skirt, hood-tip spring, lifted dusty-violet palette |
| voidknight | ≈4.6k / 1070 (≤ 9k) | 3-plate bevelled pauldrons + trim, breastplate + ab plates + gorget, 19 rivets, tabard springs, sword + shield with 6 rune slots (`setComboStep(n)`), visor glow |
| dummy | 1548 / 410 | stitched sack face (button eyes, brows, mouth), rope bindings, target, cross-bar `swing` bone, straw-tuft + tag springs |

###### Measured (branch, SwiftShader 640×360, prod=1&governor=0&seed=1, medium; `node tools/playtest4.js mobmodels`)
- **MM1**: contract green for every type + variant and for `wrapLegacy` of all 9 v3 builders; instances share geometry/materials (skeleton cloned only).
  Spawn median 0.1–0.5 ms (≤ 1). First sight (create + `render.warm` + upload + first draw minus the same frame once warm; best of 5 fresh builds per type,
  `gpuSync` before every sample): worst ≈ 4.7 ms (≤ 8); medians 1–17 ms are dominated by stalls of the shared 4-CPU machine.
  Draws at 8 m: 2–3 scene + 1 shadow per mob; at 34 m: 1–2, outline hidden, `rimSource()` → LOD.
  **12-mob F roster** (2 bokoblin, 2 wolf, lizard, shaman, voidknight, shroom, wraith, chuchu ×3): **26 scene calls / 41.6k tris + 12 shadow calls / 9.6k tris**
  (budget 36 + 12, 140k + 24k); 12 × (pose + update) ≈ 0.17 ms/frame. Geometry GPU size 55–280 KB per type; build 2–107 ms per type (boot / idle time).
- **MM2**: features checklist incl. blink and moving springs green for all keys; eye group at 8 m / 1280×720 (fov 62°): 15–46 px (≥ 6);
  outline visible on 4 sides on the Elderwood floor (grass hidden, model at 5.5 m, camera pitch −0.4; ≥ 50 % of each side's extreme scanlines outlined);
  body mean linear luma on the Elderwood floor: wolf 0.184, wolf alpha 0.20, voidknight 0.205, wraith 0.209 (≥ 0.18), lowest body (shaman) 0.154 (≥ 0.12).
- **Sheets** (`--sheets`): `tools/playtest4/sheets/mobs/<type>.png` (v3 row above v4; front / ¾ / side at 3 m, ¾ windup 3 m, front 8 m, ¾ windup 8 m; tall models are
  framed at the distance that fits, labelled) + `wolf_alpha.png` + `chuchu_variants.png`, each ≤ 150 KB.

###### Palette deviations (documented)
- wolf flank fur `#6A6682` instead of `#5E5A72` (with `#5E5A72` the body measured 0.168–0.177 < 0.18 on the Elderwood floor); muzzle/chest `#B9B3C8` as specified.
- voidknight: `#3B3550` only in recesses; plate faces `#7A72A0`/`#9890BC`, trim `#8C93B8` (`#3B3550`-dominant plates measured 0.129).

###### Legacy tests
- No `tools/playtest3/` section belongs to mobmodels (nothing to update per §7.9). `models.js`/`models2.js` are unchanged, so bootcheck / playtest / playtest2 / playtest3
  see the v3 models exactly as before until mobs switches to the registry.

###### P1 (cut, working fallbacks)
- LOD cross-fade (hard switch with 1 m hysteresis), extra accessories, variant idle FX, wraith trailing smoke ribbon (needs `vfx.kit.ribbon`, enemy-owned).

###### Integration notes (I checks)
- The F-* aggregate / C6 numbers apply once mobs uses `createModel` (docs/v4/requests/mobmodels.md); until then the game still draws the v3 models.
- `enemies.js`' v3 LOD loop (outlines 45 m, shadows 70 m) must skip `e.model.v4` models (their `update()` owns LOD and outline distance).

###### Test results at `mobmodels-b` (this branch; tells/vfx kit on their core stubs; only `core-p0a` merged — no newer dependency tag existed)
- `node tools/playtest4.js mobmodels --sheets`: **126 passed, 0 failed** (sheets written); `node tools/playtest4.js mobmodels`: **117 passed, 0 failed, 1 skipped** (sheets).
  Includes static rule 5 (no `0xffffff`, glow/emissive ≤ 1.2) and rule 1 (imports) greps over `src/enemies/mobs/*`.
- `node tools/bootcheck.js`: exit 0 (all configs `playing`). `node tools/playtest.js --quick`: all legacy checks PASS. `node tools/playtest2.js`: exit 0.
  `node tools/playtest3.js enemies`: 138 passed, 0 failed, 1 skipped (its rule-9 grep also scans `src/enemies/mobs/*`: loops written as `i <= 4`).

#### v4 notes — bosses (`docs/v4/notes/bosses.md`)

##### bosses — v4 notes (owner: bosses; branch `v4/bosses`, from `core-p0a`; merged read-only: `core-b`, `tells-b.2`, `mobmodels-b`, `vfx-b`)

###### What was built
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

###### APIs (for others)
`e.attacks`, `e.debugAttack(id)` (clears punish/break first; checks return null and emit `bossCheck start`), `e.isBroken()`, `e.cameraHint`,
`e.brief`, `e.tellAnchor(kind)`, `e.rimSource()`, `e.flashUniform`, `e.codexKey`; events `bossBroken {boss, dur}`, `enemyEncounter`,
`enemyAttack {enemy, kind, id, nameKo, tell, windup}`; `bossCheck` kinds `freeze | stagger | rods | tide`.
golem.js exports `createGolem`, `prewarmGolem(game)`.

###### Measured (branch; 640×360, SwiftShader, prod=1 governor=0 seed=1)
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

###### Legacy tests
- `tools/bootcheck.js`: all configs `playing`, no console errors.
- `tools/playtest.js --quick`: all PASS (exit 0).
- `tools/playtest2.js`: story / settings / perf all PASS; sword logs one FAIL "wind combo hitstop on the first hit of each castId" — it comes
  from the merged `vfx-b` (§5.10 light-tier 0.025 s hits; vfx notes hand it to core per §7.9), passes on `core-b`, not boss code.
- `tools/playtest3.js` (all sections): **1265 passed, 1 failed, 1 skipped** before the fix below; the failure (narrative "village draw calls
  ≤ 290": 513) was caused by golem warms queued at spawn and flushed in a later rendered frame outside the fight (see requests/core: the warm
  layer = the hero's hidden layer 30). Fixed (golem materials shared, warm immediate and only when not yet warm): `playtest3.js narrative`
  154 / 0, `playtest3.js enemies` 138 / 0 / 1 skipped, `playtest4.js bosses` (golem) 36 / 0 re-run after the fix.
No playtest3 section is owned by bosses; the boss expectations for `tools/playtest3/enemies.js` (mobs) are filed in `docs/v4/requests/bosses.md`.

###### P1 status
- Done (cheap): kalis shard "crack" cue during the punish window (shards tilt and shrink); extra secondary motion (moss, vines, capes, cloak).
- Cut (fallback = the P0 v3 meshes with the contract): hydra ≤ 32k and nidhoggra ≤ 60k remodels, nidhoggra wing veins, boss voice barks at
  tellStart. Turntable sheets have the v3 row only for golem (the v3 boss builders were replaced in place).

###### Known issues
- On this branch `ctx.projectiles.orb` is the v3 orb (homes 3.2 s, no `attackId` in `playerHurt`); boss orbs get homing caps and attack
  metadata from the `mobs-b` orb at integration (bosses already pass `homing`/`attackId`).
- The golem is still pre-built as the v3 model by the v3 `enemies.js`; golem.js builds the v4 model at spawn (0 new programs measured) until
  mobs' `prewarmGolem` call lands (in `mobs-b`).
- Enemy-FX coverage is measured branch-side with `vfx-b` + legacy particles; the hard number is the integration I-check.

#### v4 notes — magic (`docs/v4/notes/magic.md`)

##### magic — v4 notes

Owner: magic (`src/spells.js`, `src/spells/*`, `src/spells/motifs/*`, `tools/playtest3/magic.js`, `tools/playtest4/magic.js`,
`tools/playtest4/sheets/caster/*`, these notes, `docs/v4/requests/magic.md`).
Branch `v4/magic`, worktree `/home/user/wt4/magic`, from `core-p0a`; merged read-only: `vfx-b` (kit), `tells-b.2`, `core-b`
(via the tells / vfx merges). Final tag: see the end of this file.

###### What was built

###### Look engine (`src/spells/looks.js`, `src/spells/looks_rows.js`)
- **Cast context.** Every cast (archetype, bespoke impl, legacy def, finisher, support) runs inside `begin()/end()`; deferred work
  (timers, projectiles, zones, objects, movers) captures the context and restores it, so every visual **and every hit** carries the
  cast's `castId` (`ctx.castId ?? game.nextCastId()`; legacy staff casts adopt the id the runtime issued, see requests (core 1)).
- **Legacy vfx gate.** Every `game.vfx.*` call of `src/spells*` goes through `looks.fx(name, args)`: no point-light flashes, no domes
  / glow sprites / flare / soft puffs, `screenFlash` / `fovKick` only for U/F tiers (tinted `mid`, alpha ≤ 0.25, ≤ 0.15 s, off with
  `flashReduce`), bursts → element accents within the tier particle cap, shockwaves → LW rings, beams → BT bolts or tapered ribbons,
  decals → DC linework, player "telegraphs" → dotted rotating target rings in the element `light` step (R5), **ground rune circles →
  the spells sigil** (normal-blended `mid`, alpha-tested; sky circles stay on the vfx pool).
- **Hooks** `castFx / body / impact / target / zone / crawl / nova / wave / strike / blink / aura / spike` resolve bespoke row →
  archetype default → element motif. 36 bespoke rows (`BESPOKE_IDS`): the 12 ★ skills, every `*.basic / *.charged / *.ult` of the
  registry and the starter loadouts of mage, ranger and spiritcaller (MG1.b derives this set from the registry + `PRESETS` and fails
  if a row is missing).
- **Budget facade** over `game.vfx.kit`: per-tier handle and particle ceilings of §1.4 are enforced per cast (excess refused).
  Impacts never starve the primary shape: a `burst` may use ≤ ½ and a per-target `spark` ≤ ¼ of the tier's handles; the burst that
  `vfx.hitFeel` plays on the first hit **is** the row's bespoke impact, once per `castId`. Cone / nova build their primary before the
  hits. Palette discipline in the facade: line bodies in `mid`, `light` for rims / cores, 2 px screen-space line floor (1.8 on the
  ground; 2.6 + opaque for the violet elements), bolts as a crisp `mid` core with a narrow halo, pale-ramp FM bodies (ice, lightning,
  wind) tinted toward `mid`.
- `spells.lookOf(id)` / `game.debug.lookOf(id, 'caster')` → `'bespoke' | 'archetype' | 'generic' | 'legacy'` (declared; MG1 measures it).
- `game.spells.castLock` → seconds of non-cancellable cast recovery: > 0 only during the ultimate anticipation (0.14 s, awakened
  0.2 s) and while a finisher plays; 0 otherwise.
- **Warm-up**: at boot every motif × element, every gate path and every row runs once off-screen (y = −400) and is drawn by the core
  warm pass; sigil pool 10, materials cached by key.

###### Motifs (`src/spells/motifs/*.js`, §3.5)
- `fire.js` (flame lathe tongues in 3 sizes with a thin `hi` core, comet, crescent petals, meteor rock), `ice.js` (hex prisms in 2
  sizes + stubs, bipyramid shards, lance), `lightning.js` (soft plasma orb, rod spike, rune disc; BT bolts), `wind.js` (crescent
  blades, leaves; RB streamlines), `water.js` (teardrop droplets, curling wave sheet with crest band, beads): all 9 kinds each
  (`cast, trail, burst, spark, zone, pillar, wave, aura, summon`) via `kit.registerMotif`, shapes via `kit.registerShape`.
- `others.js`: caster stand-ins for earth / nature / light / shadow, registered only while the kit has none (melee overwrites them),
  plus the ranger arrow heads `<el>.arrow` with element fletching.
- Impacts: one LW `rays` handle for the 8-petal fire opening, SP particle crowns (water) and shard debris (ice) instead of one FM
  instance per droplet / shard, so a burst fits its handle share.

###### Restraint (P0-A)
0 `0xffffff` / `#ffffff` in `src/spells*` (grep, MG static), every emissive / intensity multiplier ≤ 1.2, element ramps only
(`palette.js`), no domes, flashes per the gate, sigils normal-blended (additive violet / blue over grass washed out to grey),
every private spell material through `vfx.applyPlayerFx?.(m, {role})`, spell objects `depthWrite:false` in the transparent pass and
`userData.noCameraCollide = true`.

###### Measured (branch, `node tools/playtest4.js magic`, 640×360, prod=1 governor=0 seed=1, fx 1.0)

Measurement (`MG.measure`): plains meadow (−30, 30), yaw 0, dummy at 7 m, same spot / camera / dummy for every cast, meadow soaked
(no grass fire between casts); per frame the player-FX coverage estimator, a regular grid of diffs plus adaptive diffs whenever the
estimator rises (impact frames), coverage truth from `PT.fragments` at every new estimator maximum above the ceiling (others scaled by
the measured fragments / estimate ratio); detail / crisp at the peak frame, saturation pixel-weighted over the window.

Final run (`magic-b`, 48 casts = 36 bespoke + 12 archetype representatives; 565 s): **23 passed, 4 failed, 1 skipped**.

| Check | Budget | Measured |
|---|---|---|
| MG static (rule 5, reserved shapes, 5 motif files) | 0 white literals, multipliers ≤ 1.2 | pass (25 files) |
| MG1.b registration / lookOf | 104 registry ids ≥ archetype, 36 bespoke | pass |
| MG1.a first cast CPU | ≤ 8 ms | max 8.9 ms (`lightning.dash`, 7.5 ms "extra" = shared-CPU noise; 5.8 ms in the previous run), median 0.7 — **flaps** |
| MG1.a first draws after warm-up | 0 | 0 |
| MG1.g castLock | 0 free / ≤ 0.25 s in ult anticipation | 0 / 0.14 s / 0 |
| MG1.c white peak | B ≤ 1.5 %, C/A ≤ 4 %, U ≤ 12 % | max 0.85 % |
| MG1.c coverage | B ≤ 0.05 … U ≤ 1.0 | max 0.211, median 0.026 (all within tier) |
| MG1.c detail / crisp | §1.4 floors | median 3,077 px / 0.714; misses: `nature.grapple` 1,724 (< 2,000), `nature.roots` 1,150 (< 1,200), `light.basic` 497 (< 500), `shadow.charged` crisp 0.231 (< 0.25) |
| MG1.c saturation | ≥ 0.40 (B/C/A), ≥ 0.35 (Z/U); per-element min(floor, 0.85 × swatch) | median 0.512; misses (violet elements only): `lightning.basic` 0.354, `shadow.basic` 0.387, `shadow.ult` 0.337, `lightning.thunderclap` 0.397 |
| MG1.d new materials per cast | 0 | 0 |
| MG1.e stacked 7-cast rotation near-white | ≤ 12 % (v3 94–97 %) | 0 % |
| MG1.f element silhouette IoU | < 0.5 | projectile 0.36, nova 0.30, cone 0.13, zone 0.46 |
| page errors | 0 | 0 |
| retention (R-mage / R-boss) | ≥ 95 % | SKIP (I, integration) |

Run-to-run spread: the borderline rows move by ±0.03 sat / ±10 % detail between full runs and differ again in `MG_IDS` subset
runs (e.g. `lightning.charged` 0.40+ in the full order, 0.36–0.37 alone), so the 4 to 6 misses above flap.
Root cause of the violet misses: an opaque lightning / shadow `mid` swatch reads sat ≈ 0.49 through the post chain on the meadow,
so thin AA linework lands at 0.35–0.40 (requests core (4)).

Other suites in this worktree: `tools/bootcheck.js` exit 0 (all configs, no console errors); `tools/playtest3.js magic` 41/41
(the rule-8 static scan now recurses into `src/spells/motifs/`, §7.9); `tools/playtest.js` exit 0; `tools/playtest2.js` exit 0,
one sword-section line `FAIL wind combo hitstop on the first hit of each castId` (melee / core, not a magic file).

###### P1 cut / open
- P1 bespoke rows for awakened skills, the remaining actives and finisher polish were not started (they use the archetype looks,
  which meet the tier budgets); seeded glyph variations not done.
- `breadth.finisher` is declared `'archetype'` through the attuned element (core's `skills/fallback.js` draws it; requests core 2).
- earth / nature / light / shadow use magic's stand-in motifs on this branch; once melee's motifs merge, the caster casts of those
  elements use them (their handle use is then melee's).
- **Open B misses (MG1.c / MG1.a, see Measured)**: violet saturation for 4 rows, detail for `nature.grapple` / `nature.roots` /
  `light.basic`, crisp for `shadow.charged`, first-cast 8.9 ms once. Next steps: dark-step outlines for lightning / shadow lines
  (more chroma at lower luma), a larger grapple anchor glyph in screen space, and a measurement that averages 2 casts per row.

Final tag: `magic-b`.

#### v4 notes — melee (`docs/v4/notes/melee.md`)

##### melee — v4 notes

Owner: melee (`src/sword.js`, `src/sword/*`, `src/sword/motifs/*`, `tools/playtest3/melee.js`, `tools/playtest4/melee.js`,
`tools/playtest4/sheets/melee/*`, these notes, `docs/v4/requests/melee.md`).
Branch `v4/melee` (from `core-p0a`), worktree `/home/user/wt4/melee`. Merged read-only: `core-b`, `vfx-b` (includes `kit-p0a`),
`tells-b.2` (includes `tells-p0a`). No magic tag existed, so the five caster-owned elements use melee-local recipes (below).

###### What was built

###### Look engine (`src/sword/looks.js`)
Every melee move runs inside a **cast context** `cc = {castId, tier, el, skillId, kind, row | arch, budgets…}` opened by the engine
(combo press, charged release, skill, ultimate, finisher, support, counter) and carried by the action and by every task it schedules
(`S.after` / `S.every` keep the cast they were scheduled in).
- **castId** = `ctx.castId ?? game.nextCastId()` per move; on every hit (`hit.castId`) and every kit / particle spec.
- **The gate** (`L.call`): every legacy `vfx.*` call of the sword files is restyled to the v4 language: element 4-step ramps (mid step
  for bodies and lines, no white), no glow / flare / puff sprites (→ element accent shapes), normal-blended sparks (no white-out),
  per-tier particle and handle budgets (§1.4), `explosion` / `impact` → one element `burst` per cast (none on tier B: §3.6 basic =
  smear + ≤ 6 sparks per hit, nothing persists), `shockwave` → linework ring, `beam` → bolt or tapered ribbon, `flash*` → 2-frame
  4-point star glint, `runeCircle` → **rune circle in kit linework** (outer ring → tick band → element sigil, opposed spins, back-out
  scale-in; C / U / F only), `screenFlash` / `fovKick` only for U / F (tinted, ≤ 0.2 alpha / 0.15 s, off with 섬광 줄이기), shake ×0.6.
- **Handle budget** = handles actually spawned for the castId (`vfx.debug.byCast`) + slash crescents; motif handle costs are learned
  per `el:kind:tier` so later casts budget them exactly.
- `sword.lookOf(id)` → `'bespoke'` for rows of `sword/rows.js`, else `'archetype'` (every registry id has an archetype look).
- Without `vfx.kit` everything degrades to the restrained legacy calls (feature detection; logged once).

###### Primary shape: the slash crescent (`src/sword/fx.js`)
Vertex-built crescent band (inner 40 % empty, saturated `mid` body ≤ 0.7 alpha, thin `dark` inner line, rim mixing `mid`→`light`,
1–2-frame `hi` line only at the head), leading edge carrying the element motif (fire tongues, ice frost teeth, lightning arc-crawl,
wind streamlines, water crest, earth chipped edge, nature thorns, light halo ticks, shadow inverted value). Dissipation by erosion
(no alpha haze; fragments below 0.12 alpha discarded). The plane leans 0.3 rad toward the chase camera so a swing reads as a shape.
Blade trail: same ramp rules. The legacy `vfx.smear` duplicate is skipped when the kit exists. Per-element crescent profiles
(band, span, height, life) give distinct silhouettes; daggers' basic cuts live ≤ 0.14 s.

###### Motifs (`src/sword/motifs/{earth,nature,light,shadow}.js`, shared helpers in `common.js`)
FM shapes registered with `kit.registerShape`: `earth.rock` (faceted, strata vertex bands), `earth.spike`, `earth.slab`, `earth.chip`,
`nature.vine` (S-curve tapered tube, growth), `nature.thorn`, `nature.petal` (5-petal flower), `nature.leaf`, `nature.pod`,
`light.ray`, `light.halo`, `light.feather`, `shadow.tendril`, `shadow.crescent`, `shadow.raven` + `shadow.raven2` (2-frame flap).
All 9 motif kinds per element via `kit.registerMotif` (cast, trail, burst, spark, zone, pillar, wave, aura, summon), following the
§3.5 never-lists (light ivory, never saturated gold; shadow never magenta; no hatch / chevrons / diamonds; earth never additive).
Fire / ice / lightning / wind / water: magic's motifs are used automatically once registered; until then melee plays its own
melee-local recipes from kit primitives (never the generic fallback).

###### Looks per skill (`src/sword/rows.js`)
- **Archetype looks** (`ARCH_LOOKS`, all 24 melee archetypes): weapon glyph flash at the start (2 frames) + one element motif at the
  strike placed by the §3.6 rules (hit → burst at the target once per cast; crawler / lane / dash / blink / beam → ground `wave`
  from the impact point forward; nova / leapslam / rain → burst + ring; pillar → `pillar`; zone / wall / mine → `zone`; summon;
  buff → `aura`; cone → `wave` arc).
- **Bespoke rows** (36 = the melee bespoke set enumerated from the registry: 12 ★ + every `*.basic`, `*.charged`, `*.ult` +
  `starter_sword` / `starter_paladin` / `starter_shadowblade` skills): each row's first key shape is its signature (unique inside its
  element), from the §3.7 melee delta column (e.g. fire.charged = fan of flame petals on the ground ahead of the overhead slash,
  ice.nova = hexagonal frost ring + crystal fan from the impact point, earth.charged = strata spikes from the impact point forward,
  light.ult = halo rings with ticks along the prism beam, water.ult = three outward wave rings with foam lines, shadow.step = ink
  splash at departure and arrival + crescent bite …). Hooks: `start` (first action), `strike` (first hit window / event / archetype
  strike, before the legacy fx of that frame); skills without an engine action run both at once.

###### Dodge-cancel windows (§5.8) — `game.player.action.dodgeCancelable`
Written every frame an action runs (true when idle): combo swings cancellable before `t0` and from `min(t1, t0 + 0.25 s)`;
charged attacks while charging and from 0.10 s after release; actives from 0.10 s after their first damage frame (planned strike
frame until then, 0.35 s without damage); ultimates from the first damage frame; finishers never, and fully invulnerable
(`player.grantIframes(0.15)` every frame + super armour). No `game.hitstop` in melee files (feel through `vfx.hitFeel` tiers).

###### Rules
0 `0xffffff` / `#ffffff` and no intensity multiplier > 1.2 in `src/sword*`; no program-key flips (colours via uniforms /
instance attributes); every private material through `vfx.applyPlayerFx(m, {role})` and returned from `warmup()`; all player FX
`depthWrite:false`; pooled meshes, 0 new materials per cast; rows and motifs allocate only per cast, never per frame.

###### Tests — `node tools/playtest4.js melee [--full] [--sheets]`
Dev split: `MELEE_PART=first|dodge|measure|iou|probe`, `MELEE_IDS=a,b`, `MELEE_EVERY=6`, `MELEE_VERBOSE=1`.
Static (rule 5, reserved shapes, no hitstop, files) · ML1.a first casts · ML1.b registration + declared looks · ML1.c per-cast
measurement (ceilings + floors) · ML1.d materials · ML1.e stacked rotation · ML1.f element IoU · ML1.g dodge windows · sheets.

###### Measured (branch `v4/melee`, 640×360 SwiftShader, run by parts: `MELEE_PART=first|dodge|measure|iou`)
| Check | Result | Numbers vs budget |
|---|---|---|
| static (rule 5, reserved shapes, no `game.hitstop`, files) | PASS 8/8 | 17 files scanned, 0 hits |
| ML1.a first casts | PASS | max 2.1 ms CPU (≤ 8 ms) over 57 casts; 0 first draws of never-drawn programs |
| ML1.b registration / lookOf | PASS | 4 el × 9 motif kinds, 14 FM shapes; 104 ids ≥ archetype; 36 bespoke |
| ML1.g dodge windows | PASS | longsword worst 0.25 s (c4_fire), hammer 0.15 s, daggers 0.083 s (≤ 0.25); charged 0 s after release (≤ 0.10); actives ≤ 0.10 s after first damage; ults from first damage; fire.finisher 293 frames, 0 cancellable, 0 vulnerable |
| ML1.c ceilings (white, luma, cov, particles, handles) | PASS for all 57 | white max 0.02 % (≤ 1.5–15 %), cov max 0.465 (U ≤ 1.0; C ≤ 0.30 all pass), particles max 132 (U ≤ 150), handles ≤ tier cap (hard cap now) |
| ML1.c floors | **FAIL 16/57** | sat below the swatch floor for cool elements (ice.basic 0.357 / 0.387, ice.nova 0.362, ice.ult 0.321, lightning.basic 0.31 / 0.40, lightning.charged 0.251, lightning.ult 0.282, wind.basic 0.346 / 0.382, wind.ult 0.332, water.ult 0.346 / 0.35, water.charged 0.346, shadow.basic 0.312, shadow.charged 0.348, lightning.mine 0.333); detail lightning.ult 5855 and fire.ult 7619 (U ≥ 8000; 7417 / 7350 alone) |
| ML1.d materials | PASS | 0 new materials per cast after the first (57) |
| ML1.e stacked 7-cast rotation | PASS | 0.0 % near-white (≤ 12 %) |
| ML1.f element IoU | **FAIL 2/5 forms** | basic 0.35, nova 0.21, cone 0.48 pass; projectile 0.61 (water/light), zone 0.61 (wind/water) (< 0.5) |
| retention (I) | SKIP | integration |

Swatch saturation on the test ground (opaque `mid` ring + tinted solid, MG1 method): fire 0.748, ice 0.454, lightning 0.5,
wind 0.447, water 0.545, earth 0.665, nature 0.637, light 0.252, shadow 0.567. ML1.c judges sat against `min(§1.4, 0.85 × swatch)`
(MG1's rule, window-weighted), so the two families are measured alike.

Legacy (worktree): `tools/bootcheck.js` exit 0 (all configs playing, no uncaught errors); `tools/playtest3.js melee` 98/0;
`tools/playtest.js` exit 0; `tools/playtest2.js` exit 0 with one FAIL line "wind combo hitstop on the first hit of each castId:
repeat" — a reaction hit without `castId` (request 4a; flaky across owners' runs).

###### Late fixes (this pass)
- Hard per-cast handle cap: every kit spawn of a motif (also the once-per-cast burst `vfx.hitFeel` plays through `kit.motif`, spark
  motifs and decals) runs under the cast's §1.4 cap; spawns past it return an inert handle.
- FX solids (FM meshes) stop when the chase camera reaches them (depth < 2.5 m or distance < 3 m): a lunge through the target carried
  the camera into the impact flower (nature.charged peak coverage 1.47 → 0.04).
- `light.ray` built at pillar width (uniform scale keeps the kit's coverage estimate honest: light.charged 0.60 → 0.15).
- Rows: lightning.ult owns its beams / impacts (paced strikes no longer starved by the legacy beam + burst), fire.ult inner ring,
  smaller roots / sanctuary footprints, Z decals ≤ 2.2 m, crescent and blade-trail rims lean to `mid` (less `light` / `hi` mix).
- ML1 harness isolation: spells zones cleared between casts (sanctuary kept ticking into later casts), meadow soaked / regrown,
  legacy leftovers waited out; these were the cause of most earlier sat / cov failures in the full sequence.


###### Known issues / P1
- Open B floors (above): cool-element saturation (request 3) and two U detail floors; two IoU pairs (projectile water/light,
  zone wind/water) — the zone / projectile forms of those elements need more distinct primary shapes (P1 polish).
- ML1.c with all 57 casts takes ≈ 8–13 min on the shared machine; run it by parts.

Cut: bespoke looks for the remaining (non-bespoke-set) rows — they use their archetype look; finisher polish (the finishers run the
v3 cinematics through the gate: one tinted flash ≤ 0.15 s, budgets F); per-weapon smear textures.

#### v4 notes — player (`docs/v4/notes/player.md`)

##### player — v4 notes

Owner: player (`src/player.js`, `src/player/*`, `tools/playtest3/player.js`, `tools/playtest4/player.js`, these notes, `docs/v4/requests/player.md`).
Branch `v4/player` (from `core-p0a`), worktree `/home/user/wt4/player`. Merged read-only: **`tells-b.2`** (which carries `world-b`, `kit-p0a`
and `vfx-b`) and **`core-b`** (post4 render path, governor, sub-steps, per-entity hitstop). `mobs`/`bosses`/`magic`/`melee`/`ux` tags did not exist:
`enemies.orbEta`, `spells.castLock`, `action.dodgeCancelable` (v3 sword), `cameraHint` are feature-detected.

###### Status

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

###### What was built

###### Kits (`src/player/kits.js`)
- `KITS[cls].dodge = {type, dist, iframes, perfectWin, grace: 0.05, …}`: mage blink 0.30 / 0.20, sword dashstep 0.30 / 0.20, ranger backflip 0.42 (= the
  whole flip) / 0.20, paladin shieldstep 0.20 + `superArmor` 0.38 / **perfect brace 0.15** (`brace: true`), spiritcaller spiritswap 0.30 / 0.20,
  shadowblade shadowroll 0.40 / 0.22. Defend perfect windows 0.22 (barrier, guard, shield, counter nominal); ward 0; focus none.
- `kit.defend.canParry` = type ∈ {barrier, guard, shield, counter} and perfect > 0 (mage, sword, paladin, shadowblade).
- `KIT_NAMES` = the §6.10 glossary (점멸 · 질풍보 · 백덤블링 · 방패 돌진 · 정령 교대 · 그림자 구르기 / 마력 방벽 · 막기 · 방패 막기 · 정령 결계 · 반격 자세 · 집중);
  `PERFECT_KO = {dodge:'완벽 회피!', parry:'완벽 패링!', barrier:'완벽 방벽!'}`; `GRACE = 0.05`.

###### Dodge / defence (`src/player.js`)
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

###### Camera (`updateCamera`)
- `wCombat` eases (≈ 95 % in 0.6 s) to 1 while any enemy entity with `aggro`/`debugAggro` is within 15 m (or the boss hint applies): boom 5.5 → 6.6 m,
  FOV +4°, shoulder 1.2 → 0.9. +10 % boom while a `tells.active()` record belongs to a boss. Boss `cameraHint {dist, height}` within 40 m as multipliers.
  `settings.cameraDist` near / normal / far = ×0.9 / ×1 / ×1.15. Aim zoom keeps its ratio to the current boom. Colliders flagged `noCameraCollide`
  (record, `userData` or `object.userData`) are ignored by the boom. `player.camera = {hint, dist, fov, combat, bossTell, shoulder}` (read only).

###### Model (`src/player/merge.js`, `model.js`, `cape.js`, `swordsman.js`)
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

###### APIs (PLAN §7.4.8)
`player.kit.dodge.{iframes, perfectWin, grace}`, `player.kit.defend.{perfect, canParry}` · `player.counterReady` (seconds left, truthy) ·
`player.camera.{hint, dist, fov, combat, bossTell, shoulder}` · `player.inputBuffer` `{action, t} | null` · `player.lastEnemyHit` `{t, amount, attacker, attack, appliedStatuses} | null` ·
`player.hitstopUntil` (get / set, realTime) · `player.debugState()` (+ `pending, buffer, protect, witchReadyIn, dodgeDir, animFrozen, revive`) ·
`player.rig.skin` = `{skeleton, meshes:[body, outline, proxy], body, outline, proxy, flash, stats, refresh(), recolor(), update()}`.
Events emitted: `dodgeBuffered`, `dodgeRejected`, `perfectDodge` (+ `attacker, witch, grace, kind, calloutKo`), `counterReady`, `playerRespawn {inPlace, autoRevive}`;
consumed: `playerHurt`, `tellStart`.

###### Measured (branch, SwiftShader 640×360, `prod=1&governor=0&seed=1`, medium)

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

###### Tests (final run, `tells-b.2` + `core-b` merged)
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

###### Integration notes (I checks)
- C6: the player group is now `byGroup.player` 3–4 + 1 calls; the rune circles, barrier and ghosts live in the main scene with `userData.owner = 'player'`
  (the harness counts them under `fx`).
- The shadow proxy is a SkinnedMesh with the default depth material; core's warm-up may want to include the shadow pass (requests/core 4).

#### v4 notes — ux (`docs/v4/notes/ux.md`)

##### ux v4 notes

Branch v4/ux from core-p0a; merged (read-only) core-b, tells-b.2, mobs-b. No bosses tag exists yet: boss codex /
bossSpawn.brief are feature-detected (playtest uses a fixture entry).

###### Built (P0, all 12 items)
1. `ui.fmtKo(text, ctx)` (src/ui/fmt.js): tokens {dodgeKey} {defendKey} {jumpKey} {sprintKey} {interactKey} {skillsKey}
   {codexKey} {confirmKey} from `game.input.keymap.label`, {dodgeName} {defendName} from the kit, {punishSec} live;
   can-parry rule (mage/sword/paladin/shadowblade yes; ranger/spiritcaller no -> parryKo hidden, hint variant B).
2. `game.ui.hint(id, textKo, opts)` (src/ui/hints.js): one slot under the compass, action-gated dismissal, <= 2 shows per
   id persisted in `game.save.section('hints')`, full §6.2 catalogue; timed TUT queue removed; queued during
   cinematics/dialogue; boss fights only tell/punish/projectile/hazard hints; MP hint variant picked from a live check.
3. Monster codex (src/ui/monsters.js, codex tab '몬스터'): unknown/seen/defeated, role, weak/resist icons, tip, attacks
   이름 — 예고 — 대처 (+parryKo when allowed), kill count, thumbnails via `game.render.snapshot(game.enemies.previewModel(t))`
   at unlock (glyph fallback); `game.save.section('monsterCodex')` (fallback localStorage 'aw_monster_codex_v4').
   First-sight strip on enemyEncounter{sight}, 첫 조우 card after the kill / 3 s after combat, boss brief card, weak/resist
   icons on HP bars after the first hit, boss attack name for tells >= 1 s, '붕괴!' on bossBroken.
4. 가이드 tab (src/ui/guide.js): controls from the keymap, legend with real `tells.renderThumb(kind)` thumbnails and exact
   §5.1 texts, 회피와 방어, 원소 반응 기초, 현재 목표; auto-opens at the first pause; linked from the recap.
5. Death recap (src/ui/recap.js): playerHurt ring buffer, killer + attack, last 5 hits, grouped DoT/hazards, class-correct
   tip, 4 buttons, respawn line, 3-deaths easy suggestion; story difficulty = auto-revive strip only.
6. Threat UI (src/ui/threatui.js): off-screen arrows from `tells.active()` (42 % ellipse, tell colour, progress ring, max 4,
   pooled DOM), orb dots, directional damage arc (replaces the radial vignette), hazard edge vignette with source name.
7. Settings (src/ui/settingsMenu.js): 5 tabs, every §6.8 key, 재시작 후 적용 rows, 낮음/보통/높음 + separate 자동 품질 조절,
   렌더 해상도 line, 성능 테스트 + result card + 복사, FPS overlay, §2.2 offer/drop-back toasts, rebinding of
   dodge/dodgeAlt/defend via `keymap.rebind`, difficulty cards on 새 게임 (src/ui/newgame.js), --ui-scale with 12 px floor.
8. HUD declutter: pooled nodes, damage numbers <= 6 with 0.4 s same-target merge, XP merged into the corner counter,
   centre banners queued while aggroed.
9. Onboarding: short intro (4 key shots), Noah 6 lines + '옛이야기를 더 듣는다', hold F/Space fast-forward + auto-advance
   0.4 s, Esc -> '대화 건너뛰기', class panel badges/stars/one-liners/자세히, training telegraph lesson, objective how lines
   (story/script4.js HOW) and `world.setBeacon` on every objective step.
10. Build help (src/ui/build.js): 추천 node glow, 자동 배분 (on for 이야기) through canLearn/learn + auto-equip + toast,
    reaction chip tooltips, inline lock reasons, equip hint.
11. Copy fixes per §6.10 (callouts, HUD_KO.check, jargon, dodge/defend names, '빙결의 글라시아').
12. Audio (src/audio.js, src/audio/tells.js): the 12 recipes, spatialised tell sounds (<= 2 concurrent, nearest by remaining
    time), music duck -3 dB while a tell targets the player, unknown names no-op; cinematic flashes <= 0.15 s, not white,
    off with flashReduce (src/cinematic/flash.js).

###### P1 cut
Dialogue backlog, 화력/생존 build paths, breadcrumb trail — not built; fallbacks: plain dialogue, single 추천 path, beacon.

###### Measured (branch, SwiftShader)
- `node tools/playtest4.js ux`: 89 passed, 0 failed (98 s).
- ui.update median 0.000 ms / p99 2.7 ms at 960×540 (budget 1.5 / 6 ms).
- Damage numbers max 6; hints visible max 1; concurrent tell sounds max 2; off-screen arrow within 1 frame of tellStart.
- Short intro 28.2 s (budget <= 30 s), full intro 89.7 s.
- Legacy: bootcheck exit 0 (all configs playing); playtest.js --quick exit 0 all PASS; playtest3 ui+narrative 275/0;
  playtest2 exit 0 with one non-ux FAIL "wind combo hitstop on the first hit of each castId" (reaction hit without castId,
  already filed by melee as request 4a; reproduces on other owners' branches).
- playtest3 ui.js §7.9 change: '+XP number spawned' now checks the merged corner counter (§6.9).
