# Requests from world

All of these are feature-detected on the world side; nothing crashes if they are missing.

## player
- Call `world.getGroundHeight(x, z, footY)` with the feet height as `yHint` (platforms and mushroom caps are only used with a yHint).
  When standing on one, `world.groundPlatform` is its handle: add `handle.delta` each frame.
- Replace the radial clamps (player.js L409, L839) with `world.clampToBounds(pos, radius)`. Until then `world.bounds` is 222 so
  the legacy clamp is harmless (the real clamp already runs inside `resolveCollision`).
- Updrafts: keep reading `world.surface.getUpdraft(pos)` while gliding — static/temporary updraft volumes are merged into it.
- Optional `player.placeAt(pos, yaw)` is used by gate travel (falls back to `teleport` + `setFacing`).

## narrative (story / cinematic / audio)
- Call `world.setActVisible(act)` on stage changes (until then world maps `story.stage` through `STAGE_ACT` at 1 Hz).
- Elderwood quest: listen to `rotWallCleared {id, how:'burned'|'purified'|'smashed', cleared, total}` (3 walls, `world.rotWalls`).
- New world events: `gateReached {id, name}`, `gateTravel {from, to}`, `shrineFound {id, kind}`, `shrineUse {id, element}` (F at a
  spirit shrine), `mirrorDoorOpen {id}`, `zoneEnter/zoneExit {zoneId, name, level}` (zone music: `world.zoneById[zoneId].music`).
- NPC spots: `world.village.npcSpots.{rangerMentor, paladinMentor, spiritMentor, shadowMentor, sage, trainer}`,
  `world.village.reactionDummy`, `world.zoneById.mirwen.npcSpots.lakeKeeper`, `world.zoneById.elderwood.npcSpots.forestChild`.
- Audio cue names world plays (all optional): `gate_awaken`, `gate_travel`, `shrine_seed`, `shrine_found`, `holy_chime`, `rock_smash`, `vine_hit`
  (plus the existing `explode_fire`).

## ui
- `ui.openGateMenu(list, onPick)`: `list = [{id, name, zoneId, zoneName, reached, current}]`; call `onPick(id)` for a reached gate.
- world uses `ui.toast(text)` and `ui.tip(id, text)` when present (gate found, rot wall / mirror door hints, shrine names).

## enemies
- `world.setBossFightLOD(true/false)` on the nidhoggra spawn/despawn (world also toggles it on `bossSpawn` / `bossDefeated`).
- Arena extras: `bossArenas.hydra.pillars[6]{pos, top}` + `surfaceY`, `bossArenas.kalis.mirrors[{position, yaw, normal}]`,
  `bossArenas.nidhoggra.pillars[5]{pos, top}` (terrain spires — `getHeight` returns their tops).
- Projectiles: `world.projectileBlockAt(p)` → `'block' | 'reflect' | null`.
- Rot walls and the mirror door are `team:'prop'`, `isProp`, `xpValue 0` entities in `game.entities`; targeting should ignore props.

## combat
- Props need `onHit(result, hit)` called with the original `hit` (world reads `hit.element`, `hit.heavy`, `hit.tier`, `hit.tags`, `hit.skillId`).

## magic / melee
- Projectiles should query `world.projectileBlockAt(p)` (temp ice walls, shields). A prism/light beam can carry `tags:['prism']`
  (light element already opens the mirror door). `earth.colossus` hits should set `heavy:true` or tag `colossus` (rot wall smash).
- `world.addPlatform` / `addTempCollider` / `addUpdraft` are ready for ice pillars, glacier blocks, ice bridges, stepping stones, wind columns.

## core
- Please add `dusk` and `golden` to `game.post.GRADES` (world registers `EXTRA_GRADES` at runtime only when missing).
