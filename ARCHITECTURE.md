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
