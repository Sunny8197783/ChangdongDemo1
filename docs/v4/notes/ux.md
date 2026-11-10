# ux v4 notes

Branch v4/ux from core-p0a; merged (read-only) core-b, tells-b.2, mobs-b. No bosses tag exists yet: boss codex /
bossSpawn.brief are feature-detected (playtest uses a fixture entry).

## Built (P0, all 12 items)
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

## P1 cut
Dialogue backlog, 화력/생존 build paths, breadcrumb trail — not built; fallbacks: plain dialogue, single 추천 path, beacon.

## Measured (branch, SwiftShader)
- `node tools/playtest4.js ux`: 89 passed, 0 failed (98 s).
- ui.update median 0.000 ms / p99 2.7 ms at 960×540 (budget 1.5 / 6 ms).
- Damage numbers max 6; hints visible max 1; concurrent tell sounds max 2; off-screen arrow within 1 frame of tellStart.
- Short intro 28.2 s (budget <= 30 s), full intro 89.7 s.
- Legacy: bootcheck exit 0 (all configs playing); playtest.js --quick exit 0 all PASS; playtest3 ui+narrative 275/0;
  playtest2 exit 0 with one non-ux FAIL "wind combo hitstop on the first hit of each castId" (reaction hit without castId,
  already filed by melee as request 4a; reproduces on other owners' branches).
- playtest3 ui.js §7.9 change: '+XP number spawned' now checks the merged corner counter (§6.9).

## Fix round 1 (review: combat readability + codex parry copy)

- Hint slot: root cause of the hint that "stays through fights" was the anim queue: a hint shown and dismissed within
  2 frames left a pending `show` re-add, so the slot stayed lit with no hint behind it. `AnimQueue.cancel()` now runs
  on dismiss. Menu/progression hints (`unspent`, `equip`, `codex`, `legend`, `move_sprint`) wait out fights (put back
  in the queue, show not counted). The equip hint only exists while the skill screen is open. Boss fight = enemies.boss
  or the boss bar up (Kalis is announced only through bossSpawn).
- Damage numbers: reaction hits show the number only (the name is the one small `aw-num-rxname`); sizes 20/24/22 px,
  pop peak 1.15 (was 1.4), non-crit scale ≤ 1.05 (was ≤ 1.95 → 43 px).
- Boss fight top centre: quest cards and area banners wait (`deferBanner`) while the boss bar is up; the bark and the
  hint slot move below the boss block (CSS `body:has(.aw-boss.show)`).
- NPCs cast shadows only within 28 m of the player (hysteresis 3 m; sun shadow box is ±32 m).
- Codex: `parrySec(attack)` gives parry lines their own stun seconds (parryStunSec/punishParry, 'parry'-tell punishDur,
  else e.parryDur ?? 1.6); a `{punishSec}` with no live value drops the "N초 동안" phrase instead of printing a blank.
  UX3 asserts no rendered codex string matches /\s초 동안|\{\w+\}/.
- `node tools/playtest4.js ux`: 98 passed, 0 failed; bootcheck: no console errors.
