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
