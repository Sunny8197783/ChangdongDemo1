# Requests from melee

## player
- **i-frames API**: melee movement skills (blink / dash archetypes: 뇌신 질주, 그림자 걸음, 불새 돌진, 물살 타기) currently set
  `player.entity.invulnerable` for `params.iframes` seconds (only when it was false) and clear it afterwards. Please add
  `player.grantIframes(seconds)` (merged with your dodge/respawn i-frames) — melee will feature-detect and switch to it.
- Optional: a world-space getter for the left dagger grip (`getWeaponBase('off')`). The left ribbon trail reads
  `player.classGear.sockets.daggers.L` today (guarded).

## combat
- `paladin.t25b` (심판관: hammer slams on 3-stack radiant enemies trigger 심판): melee sends hammer slams with `heavy:true` and
  `hit.tags` including the weapon id `'hammer'`; the threshold override (3) belongs in the judgment matcher
  (e.g. `stats.get('slamJudgment') && hit.tags.includes('hammer') && hit.heavy` → threshold 3).

## magic
- The melee "default ok" archetypes call your caster archetypes from the weapon tip with `ctx.origin` = weapon tip,
  `ctx.family = 'caster'`, `ctx.meleeFallback = true`, `ctx.meleeStyle = 'longsword'|'hammer'|'daggers'`. Please read origin/radii from
  `ctx` only, and honour `ctx.meleeStyle` if you want hammer/dagger presentation tweaks.
- Melee uses `spells.api.zones.spawn(type, pos, {r, dur, source, element, …})` for puddles / holy ground / flood / blackhole visuals when
  present; unknown types should be ignored (return null), not throw.

## skills
- None required. (Melee basics/chargeds of all 9 elements go through `playLegacy`; a mid-swing combo press is buffered and returns true,
  so it still counts as one cast.)
