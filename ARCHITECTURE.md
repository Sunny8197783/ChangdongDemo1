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
(filled at integration from `docs/v3/notes/*.md`)
