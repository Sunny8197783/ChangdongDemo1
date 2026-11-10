// playtest4 section: ux (PLAN v4 §7.8 UX1–UX3, B). Owned by ux.
//   UX1: death recap content (killer, attack, last 5 hits, class-correct tip, 4 buttons); codex 몬스터 tab lists every entry
//        (+ a boss fixture while bosses' codex is not merged) with rendered thumbnails; first-sight strip ≤ 0.5 s + card only
//        after combat, once; boss brief on bossSpawn; the 가이드 legend with real tells thumbnails auto-opens at the first pause.
//   UX2: ≤ 1 hint visible; no centre banners while aggroed (queued, shown after combat); ≤ 6 damage numbers (+ merging);
//        bark box rect vs HP / hotbar rects; off-screen arrow within 1 frame of a tell behind the player; ≤ 2 tell sounds;
//        ui.update ≤ 1.5 ms median / ≤ 6 ms p99.
//   UX3: settings menu has every §6.8 key and each emits settingsChanged; 성능 테스트 card + 복사; difficulty cards;
//        dialogue fast-forward + Esc skip; greps (보코블린 / PERFECT, literal keys, windup seconds); HUD_KO.check strings;
//        class-correct hint variants for all 6 classes; short intro ≤ 30 s.
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (_) { return ''; } };

const BOSS_FIXTURE = {
  type: 'golem', nameKo: '고대 바위 골렘', roleKo: '보스', boss: true, elite: false, weak: [{ el: 'water', mul: 1.5 }], resist: [{ el: 'earth', mul: 0.5 }], immune: [],
  tipKo: '내려찍기 직후 빛나는 핵을 노리세요.', briefKo: ['원이 차면 {jumpKey}로 충격파를 넘기', '빛나는 핵이 약점', '붕괴 뒤 몰아치기'],
  attacks: [{ id: 'golem.slam', nameKo: '대지 강타', tell: 'jump', tellKo: '주먹을 높이 든다', counterKo: '충격파가 닿기 직전에 {jumpKey}', punishKo: '{punishSec}초 동안 빈틈', punishDur: 1.5 }],
};

module.exports = async function ux(PT) {
  // =========================================================================== static greps (UX3)
  {
    const files = ['src/ui/text.js', 'src/story/script.js', 'src/story/script3.js', 'src/story/script4.js', 'src/story/quests.js', 'src/enemies/codex.js', 'src/enemies/bosses/codex.js'];
    const bad = files.filter((f) => /보코블린|PERFECT/.test(read(f)));
    PT.check('UX3 grep: no 보코블린 / PERFECT in player-facing data', bad.length === 0, bad);
    const sc = read('src/story/script.js');
    const wake = sc.slice(sc.indexOf('export function elderWake'), sc.indexOf('const ELDER_LORE'));
    PT.check('UX3 Noah wake talk: 6 lines + "옛이야기를 더 듣는다"', (wake.match(/\{ s: '/g) || []).length === 6 && wake.includes('옛이야기를 더 듣는다') && sc.includes('빙결의 {글라시아}'));
    PT.check('UX3 timed TUT queue removed', !/TUT\.|tutQ/.test(read('src/ui.js') + read('src/ui/hints.js')));
  }

  // =========================================================================== mage page: most checks
  const pg = await PT.boot('&cls=mage&skills=preset:starter_mage&guideAuto=1', { w: 960, h: 540 });
  PT.check('boot mage', pg.ready, pg.params);
  if (!pg.ready) { await pg.close(); return; }

  await pg.run('UX3 data + copy', async ({ BOSS }) => {
    const g = window.game, u = g.ui, PT = window.PT;
    window.V3 = (x, y, z) => g.player.object.position.clone().set(x, y, z);
    PT.check('ui v4 API (hint, fmtKo, encounterStrip/Card, bossBrief, debug.*)', ['hint', 'fmtKo', 'encounterStrip', 'encounterCard', 'bossBrief'].every((k) => typeof u[k] === 'function')
      && ['arrows', 'hintVisible', 'recap', 'damageNumbers', 'bannersQueued', 'legendThumbs'].every((k) => typeof u.debug?.[k] === 'function'));
    const C = g.enemies?.codex?.() || {};
    if (!C.golem) u.debug.monsters.addFixture(BOSS);
    window.__codex = () => ({ ...(C.golem ? {} : { golem: BOSS }), ...(g.enemies?.codex?.() || {}) });
    const all = window.__codex();
    PT.note(`codex entries: ${Object.keys(all).length} (${Object.keys(C).length} from game.enemies.codex())`);
    const KEY_RE = /(^|[^A-Za-z{])(Q|E|Space|Tab|Shift|LMB|RMB)(?![A-Za-z}])/, SEC_RE = /\d+(\.\d+)?초 뒤/;
    const strs = [];
    for (const t in all) { const e = all[t]; strs.push(e.tipKo || '', ...(e.briefKo || [])); for (const a of e.attacks || []) strs.push(a.tellKo || '', a.counterKo || '', a.parryKo || '', a.punishKo || ''); }
    const T = await import('/src/ui/text.js');
    for (const k in T.HINTS_KO) strs.push(T.HINTS_KO[k]);
    const badK = strs.filter((s) => KEY_RE.test(s)), badS = strs.filter((s) => SEC_RE.test(s));
    PT.check('UX3 no literal key names in codex/hint data', badK.length === 0, badK.slice(0, 4));
    PT.check('UX3 no windup seconds in codex/hint data', badS.length === 0, badS.slice(0, 4));
    const want = { stagger: '빈틈 만들기 — 큰 피해를 몰아넣으세요', rods: '피뢰침 — 번개 머리를 먼저 공격', tide: '해일 — 초록 안전 표시 위로 올라가세요', freeze: '빙판 생성 — 지금 머리를 공격하세요', kalis: '결정 깨기 — 빛나는 결정 3개를 부수세요' };
    PT.check('UX3 HUD_KO.check exact strings', Object.keys(want).every((k) => T.HUD_KO.check[k] === want[k]), T.HUD_KO.check);
    const KM = await import('/src/core/keymap.js');
    PT.check('UX3 KEY_NAMES_KO.codex = 도감 · codex tabs 원소 / 몬스터', KM.KEY_NAMES_KO.codex === '도감' && T.CODEX_KO.rxPage === '원소' && T.CODEX_KO.monPage === '몬스터');
    PT.check('UX3 perfect callouts 완벽 회피! / 완벽 패링! / 완벽 방벽!', T.CALLOUT_KO.dodge === '완벽 회피!' && T.CALLOUT_KO.parry === '완벽 패링!' && T.CALLOUT_KO.barrier === '완벽 방벽!' && T.DEF_KO.parry.melee[0] === '완벽 패링!' && T.DEF_KO.parry.caster[0] === '완벽 방벽!');
    const S3 = await import('/src/story/script3.js');
    PT.check('UX3 dodge names (§6.10) in story/script3.js', S3.DODGE_KO.blink === '점멸' && S3.DODGE_KO.backflip === '백덤블링' && S3.DODGE_KO.dashstep === '질풍보', S3.DODGE_KO);
    PT.check('UX3 jargon: 강화 · 핵심 특성 · 3단계 · 둘 중 하나', T.TYPE_KO.modifier === '강화' && T.TYPE_KO.keystone === '핵심 특성' && T.TIER_KO[3] === '3단계' && T.TREE_KO.exclusivePair === '둘 중 하나');
    const before = u.fmtKo('{dodgeKey}');
    g.input.keymap.rebind('dodge', 'KeyZ');
    const after = u.fmtKo('{dodgeKey}');
    g.input.keymap.rebind('dodge', 'KeyQ');
    PT.check('UX3 fmtKo follows keymap.rebind', before === g.input.keymap.label('dodge') && after === 'Z', [before, after]);
  }, { BOSS: BOSS_FIXTURE });

  await pg.run('UX3 mp check', () => {
    const g = window.game, PT = window.PT, P = g.player;
    const d = g.entities.find((e) => e.isDummy && e.alive);
    if (!(P?.maxMp > 0) || !d) { PT.skip('UX3 basic-hit MP check', 'no MP / dummy'); return; }
    P.mp = P.maxMp * 0.3; const mp0 = P.mp;
    g.events.emit('damage', { target: d, amount: 5, source: P.entity, kind: 'basic', slot: 'basic', point: d.object.position.clone() });
    PT.step(0.05);
    PT.check('UX3 basic hits do not restore MP (mp_low uses variant B)', P.mp <= mp0 + 0.5, [mp0, P.mp]);
  });

  // --------------------------------------------------------------------------- UX1 recap
  await pg.run('UX1 death recap', () => {
    const g = window.game, PT = window.PT, u = g.ui;
    const all = window.__codex();
    const type = all.bokoblin ? 'bokoblin' : Object.keys(all)[0];
    const en = all[type];
    const a = en.attacks[en.attacks.length - 1];
    const src = { kind: type, codexKey: type, name: en.nameKo, object: { position: g.player.object.position.clone() } };
    const t = g.time;
    for (let i = 0; i < 4; i++) g.events.emit('playerHurt', { amount: 3, element: 'fire', source: null, sourceName: '불길', attackNameKo: '불길', attackKind: 'surface', dot: true, dir: { x: 1, z: 0 }, time: t - 2 + i * 0.1 });
    g.events.emit('playerHurt', { amount: 9, element: 'physical', source: src, sourceName: en.nameKo, attackId: en.attacks[0].id, attackNameKo: en.attacks[0].nameKo, attackKind: 'melee', dot: false, dir: { x: 1, z: 0 }, time: t - 1.2 });
    g.events.emit('playerHurt', { amount: 18, element: 'physical', source: src, sourceName: en.nameKo, attackId: a.id, attackNameKo: a.nameKo, attackKind: 'melee', dot: false, dir: { x: 1, z: 0 }, time: t });
    PT.check('UX2 directional damage arc on playerHurt', u.debug.threatUI.arcOn);
    g.events.emit('playerDeath', {}); g.setState('dead'); PT.step(0.1);
    const r = u.debug.recap();
    PT.check('UX1 recap: killer name + attack name', r && r.killer === en.nameKo && r.attack === a.nameKo && r.amount === 18, r && [r.killer, r.attack, r.amount]);
    PT.check('UX1 recap: killer line', /「.+ · .+」에 쓰러졌습니다 \(18 피해\)/.test(document.querySelector('.aw-death-killer')?.textContent || ''), document.querySelector('.aw-death-killer')?.textContent);
    PT.check('UX1 recap: last hits ≤ 5 with seconds, DoT grouped', r && r.hits.length >= 2 && r.hits.length <= 5 && r.hits.some((x) => x.grouped && x.n === 4) && r.hits.every((x) => x.sec >= 0), r?.hits);
    const wantTip = u.fmtKo(a.counterKo) + (a.parryKo && u.canParry() ? ' · ' + u.parryText(a, null) : '');
    PT.check('UX1 recap: class-correct codex tip', r && r.tip === wantTip, [r?.tip, wantTip]);
    const btns = [...document.querySelectorAll('.aw-death.show [data-rc]')].map((b) => b.textContent);
    PT.check('UX1 recap: buttons 다시 일어서기 / 보조 기능 조정 / 몬스터 도감 보기 / 위험 표시 보기', btns.length === 4 && /^다시 일어서기 \(.+\)$/.test(btns[0]) && btns[1] === '보조 기능 조정' && btns[2] === '몬스터 도감 보기' && btns[3] === '위험 표시 보기', btns);
    PT.check('UX1 recap: respawn line', /^부활 위치: /.test(document.querySelector('.aw-death-where')?.textContent || ''));
    document.querySelector('[data-rc="legend"]').click(); PT.step(0.05);
    PT.check('UX1 recap links the legend (위험 표시 보기 → 가이드)', u.guideOpen && document.querySelector('.aw-guide [data-gs="legend"]')?.classList.contains('sel'));
    u.closeGuide();
    g.player.respawn?.(); PT.step(0.3);
    if (g.state !== 'playing') g.setState('playing');
    PT.step(0.1);
    PT.check('UX1 recap hidden after respawn', !document.querySelector('.aw-death.show'));
  });

  // --------------------------------------------------------------------------- UX1 encounters + brief
  await pg.run('UX1 encounters', () => {
    const g = window.game, PT = window.PT, u = g.ui, M = u.debug.monsters;
    M.reset(); g.enemies?.debugResetEncounters?.(); u.debug.hints.reset();
    let aggro = 1; const realAggro = g.enemies.aggroCount; g.enemies.aggroCount = () => aggro;
    const fake = { kind: 'shaman', codexKey: 'shaman', alive: true, team: 'enemy', object: { position: g.player.object.position.clone() } };
    g.events.emit('enemyEncounter', { type: 'shaman', enemy: fake, first: true, sight: true });
    PT.step(0.4);
    const strip = document.querySelector('.aw-mstrip');
    PT.check('UX1 first sight: one-line strip within 0.5 s', M.stripOn && /^새로운 적: .+ — 도감에 기록됨$/.test(strip.textContent), strip.textContent);
    PT.step(4);
    PT.check('UX1 no 첫 조우 card during combat', !M.cardOn && M.pendingCards() === 1);
    aggro = 0; PT.step(3.3);
    PT.check('UX1 첫 조우 card 3 s after combat', M.cardOn && /^새로운 적 — /.test(document.querySelector('.aw-mcard-title').textContent), document.querySelector('.aw-mcard-title').textContent);
    PT.check('UX1 card: class-correct counter line', document.querySelector('.aw-mcard-counter').textContent.startsWith('대처:'));
    PT.step(7);
    g.events.emit('enemyEncounter', { type: 'shaman', enemy: fake, first: false, sight: true }); PT.step(4);
    PT.check('UX1 card never twice for a type', !M.cardOn && M.pendingCards() === 0);
    PT.check('UX2 codex hint after the first card', u.debug.hints.shows('codex') >= 1);
    const fake2 = { kind: 'wolf', codexKey: 'wolf', alive: true, team: 'enemy', object: { position: g.player.object.position.clone() } };
    aggro = 1;
    g.events.emit('enemyEncounter', { type: 'wolf', enemy: fake2, first: true, sight: true }); PT.step(0.2);
    aggro = 0; g.events.emit('kill', { target: fake2 }); PT.step(0.2);
    PT.check('UX1 card when that enemy dies (out of combat)', M.cardOn && document.querySelector('.aw-mcard').dataset.type === 'wolf');
    PT.check('UX1 kill → defeated + kill count', M.state().defeated.wolf === 1 && M.state().kills.wolf === 1);
    PT.step(7);
    g.events.emit('bossSpawn', { id: 'golem', name: '고대 바위 골렘', boss: { bossId: 'golem', kind: 'golem', weakness: ['water'], resist: { earth: 0.5 } }, brief: ['원이 차면 {jumpKey}로 넘기', '빛나는 핵이 약점', '붕괴 뒤 몰아치기'] });
    PT.step(0.3);
    const lis = [...document.querySelectorAll('.aw-mbrief li')].map((l) => l.textContent);
    PT.check('UX1 boss brief card from bossSpawn.brief (3 bullets, tokens filled)', M.briefOn && lis.length === 3 && !lis[0].includes('{'), lis);
    PT.check('UX1 boss bar: larger weakness icons', document.querySelectorAll('.aw-boss-weak .aw-wk').length >= 1);
    g.enemies.aggroCount = realAggro;
    PT.step(6.5);
  });

  await pg.run('UX1 codex tab', async () => {
    const g = window.game, PT = window.PT, u = g.ui, M = u.debug.monsters;
    const all = window.__codex();
    for (const t in all) { M.unlock(t, 'seen'); M.unlock(t, 'kill'); }
    u.openCodex('mon'); PT.step(0.05);
    const n = Object.keys(all).length;
    const t0 = performance.now();
    while (performance.now() - t0 < 30000) { await new Promise((r) => setTimeout(r, 250)); if (M.thumbs() >= n) break; }
    PT.step(0.05);
    const ents = document.querySelectorAll('.aw-codex .aw-ment');
    const imgs = document.querySelectorAll('.aw-codex .aw-ment img.aw-mthumb');
    const withModel = Object.keys(all).filter((t) => !!g.enemies?.previewModel?.(t)).length;
    PT.check('UX1 codex 몬스터 tab lists every entry', ents.length === n, [ents.length, n]);
    PT.check('UX1 codex: rendered model thumbnails for every type with a preview model', imgs.length >= withModel && imgs.length > 0, { imgs: imgs.length, withModel, n });
    PT.check('UX1 defeated entries list attacks (이름 — 예고 — 대처) + kill count', document.querySelectorAll('.aw-codex .aw-ment.defeated .aw-ment-a').length >= n && !!document.querySelector('.aw-ment-kills'));
    PT.check('UX1 mage sees parryKo lines', !!document.querySelector('.aw-ment-parry') === Object.values(all).some((e) => e.attacks.some((a) => a.parryKo)));
    const ctext = document.querySelector('.aw-codex')?.innerText || '';
    const blank = ctext.match(/.{0,24}(\s초 동안|\{\w+\}).{0,8}/g) || [];
    PT.check('UX3 codex text has no blank duration or raw token (/\\s초 동안|\\{\\w+\\}/)', blank.length === 0 && ctext.length > 200, blank.slice(0, 4));
    const wantP = { 'voidknight.slam': '2.0', 'nox.teleportSlash': '2.0', 'bokoblin.swing': '1.6' };
    const gotP = {}; for (const t in all) for (const a of all[t].attacks) if (a.parryKo && wantP[a.id]) gotP[a.id] = (u.parryText(a, null).match(/([\d.]+)초/) || [])[1];
    PT.check('UX3 parry stun seconds from live values (not the miss-punish window)', Object.keys(gotP).every((k) => gotP[k] === wantP[k]) && Object.keys(gotP).length >= 1, gotP);
    PT.note(`codex page: ${ents.length} entries, ${imgs.length} rendered thumbnails (${withModel} preview models)`);
    PT.check('UX2 codex hint dismissed by opening the codex', u.debug.hintVisible() !== 'codex');
    M.reset(); u.closeCodex(); PT.step(0.05); u.openCodex('mon'); PT.step(0.05);
    PT.check('UX1 locked entries are silhouettes "???"', document.querySelectorAll('.aw-codex .aw-ment.unknown').length === n);
    u.closeCodex(); PT.step(0.05);
  });

  await pg.run('UX1 legend auto-open', async () => {
    const g = window.game, PT = window.PT, u = g.ui;
    u.debug.hints.flag('guideAuto', 0);
    g.pause(); PT.step(0.2);
    PT.check('UX1 가이드 auto-opens at the first pause (위험 표시 읽는 법)', u.guideOpen && document.querySelector('.aw-guide [data-gs="legend"]').classList.contains('sel'));
    const real = typeof g.tells?.renderThumb === 'function' && !g.tells.isStub;
    const t0 = performance.now();
    while (real && performance.now() - t0 < 20000 && u.debug.legendThumbs() < 8) await new Promise((r) => setTimeout(r, 250));
    PT.step(0.05);
    if (real) PT.check('UX1 legend: a rendered thumbnail of every tell kind', u.debug.legendThumbs() === 8 && document.querySelectorAll('.aw-leg img.aw-leg-pic').length === 8, u.debug.legendThumbs());
    else PT.skip('UX1 legend thumbnails', 'tells.renderThumb not present (stub)');
    const txts = [...document.querySelectorAll('.aw-leg-txt')].map((x) => x.textContent);
    PT.check('UX1 legend texts = §5.1', txts.length === 8 && txts.includes('빨강 = 피하거나 막기') && txts.includes('◆ 반짝임 = 공격 기회'), txts);
    u.closeGuide(); PT.step(0.05);
    PT.check('UX1 closing the guide keeps the pause menu', g.state === 'paused' && document.querySelector('.aw-pause').classList.contains('show'));
    g.resume(); PT.step(0.1);
    g.pause(); PT.step(0.2);
    PT.check('UX1 only the first pause opens it', !u.guideOpen);
    g.resume(); PT.step(0.1);
  });

  // --------------------------------------------------------------------------- UX2
  await pg.run('UX2 hud', () => {
    const g = window.game, PT = window.PT, u = g.ui, H = u.debug.hints, V3 = window.V3;
    H.reset();
    u.hint('pt_a', '시험 하나', { dur: 5 }); u.hint('pt_b', '시험 둘', { dur: 5 }); u.hint('pt_c', '시험 셋', { dur: 5 });
    PT.step(0.1);
    PT.check('UX2 ≤ 1 hint visible (others queued)', document.querySelectorAll('.aw-hint4.show').length === 1 && u.debug.hintVisible() === 'pt_a' && H.queued() === 2);
    PT.step(5.8);
    PT.check('UX2 next hint after the first one', u.debug.hintVisible() === 'pt_b');
    u.hint('pt_a', 'x'); u.hint('pt_a', 'x'); u.hint('pt_a', 'x');
    PT.check('UX2 ≤ 2 shows per id per save', H.shows('pt_a') <= 2);
    H.reset();
    g.events.emit('tellFirst', { tell: 'danger' }); PT.step(0.1);
    const txt = document.querySelector('.aw-hint4 span').textContent;
    PT.check('UX2 tell_danger hint with the real dodge key', u.debug.hintVisible() === 'tell_danger' && txt.includes(g.input.keymap.label('dodge')) && !txt.includes('{'), txt);
    g.events.emit('dodge', {}); PT.step(0.1);
    PT.check('UX2 hint dismissed by doing the action', u.debug.hintVisible() === null);
    g.settings.set('hints', false); H.reset();
    PT.check('UX2 도움말 끔 → no hints', u.hint('pt_off', 'x') === false);
    g.settings.set('hints', true);
    // never during dialogue / cinematics
    H.reset(); g.setState('dialogue'); u.hint('pt_dlg', '대화 중', { dur: 3 }); PT.step(0.1);
    PT.check('UX2 no hint during dialogue (queued)', u.debug.hintVisible() === null && H.queued() === 1);
    g.setState('playing'); PT.step(0.8);
    PT.check('UX2 queued hint shown after the dialogue', u.debug.hintVisible() === 'pt_dlg');
    H.reset();
    // banners queued while aggroed
    let aggro = 1; const realAggro = g.enemies.aggroCount; g.enemies.aggroCount = () => aggro;
    const lv = () => u._cardLog.filter((c) => c.startsWith('레벨 업!')).length;
    const n0 = lv();
    g.events.emit('levelUp', { level: 5, pointsGained: 1 }); PT.step(0.2);
    PT.check('UX2 no centre banner while aggroed (queued)', u.debug.bannersQueued() > 0 && lv() === n0, [u.debug.bannersQueued(), lv(), n0]);
    aggro = 0; PT.step(3.6);
    PT.check('UX2 queued banner shown 3 s after combat', u.debug.bannersQueued() === 0 && lv() === n0 + 1);
    g.enemies.aggroCount = realAggro;
    // damage numbers
    const p = g.player.object.position;
    g.settings.set('damageNumbers', 'all');
    for (let i = 0; i < 20; i++) g.events.emit('damage', { target: { team: 'enemy', object: { position: p } }, amount: 10 + i, element: 'fire', point: V3(p.x + (i % 5), p.y + 1, p.z + 2) });
    PT.step(0.05);
    PT.check('UX2 ≤ 6 damage numbers at once', u.debug.damageNumbers() <= 6, u.debug.damageNumbers());
    PT.step(2.5);
    g.settings.set('damageNumbers', 'merged');
    const tgt = { team: 'enemy', object: { position: p } };
    for (let i = 0; i < 5; i++) { g.events.emit('damage', { target: tgt, amount: 10, element: 'fire', point: V3(p.x, p.y + 1, p.z + 2) }); PT.step(0.05); }
    PT.check('UX2 합산: same-target hits within 0.4 s merge into one number', u.debug.damageNumbers() === 1, u.debug.damageNumbers());
    PT.step(2.5);
    g.story?.bark?.('elder', '시험 대사입니다. 바크 상자가 체력 바와 겹치지 않는지 확인합니다.', 3); PT.step(0.6);
    const rb = document.querySelector('.st-bark')?.getBoundingClientRect();
    const rects = ['.aw-vitals', '.aw-hb3.on', '.aw-hotbar'].map((s) => document.querySelector(s)?.getBoundingClientRect()).filter((r) => r && r.width > 0);
    const hit = rb && rects.some((r) => !(rb.right < r.left || rb.left > r.right || rb.bottom < r.top || rb.top > r.bottom));
    PT.check('UX2 bark box rect does not intersect HP / hotbar rects', !!rb && rb.width > 0 && !hit && rects.length >= 1, { bark: rb && [Math.round(rb.top), Math.round(rb.bottom)], n: rects.length });
  });

  await pg.run('UX2 off-screen arrow + tell sounds', () => {
    const g = window.game, PT = window.PT, u = g.ui, T = g.tells, A = g.audio;
    const pp = g.player.object.position;
    if (T?.attack && !T.isStub && g.enemies.spawn) {
      g.camera.updateMatrixWorld();
      const back = pp.clone(); const dir = pp.clone(); g.camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
      back.addScaledVector(dir, -4);
      const e = g.enemies.spawn('bokoblin', back.clone(), {});
      if (e) {
        PT.armor?.(e); PT.step(1 / 60);
        const h = T.attack(e, { id: 'bokoblin.swing', tell: 'danger', cls: 'mobLight', melee: false, windup: 1.2, shape: { kind: 'circle', pos: back.clone(), r: 2 } });
        PT.step(1 / 60);
        const arr = u.debug.arrows();
        PT.check('UX2 off-screen arrow within 1 frame of a tell behind the player', !!h && arr.length >= 1, { h: !!h, arr });
        if (arr[0]) PT.check('UX2 arrow points backwards (|angle| > 90°) with tell progress', Math.abs(arr[0].angle) > Math.PI / 2 && arr[0].progress >= 0, arr[0]);
        g.settings.set('offscreenArrows', false); PT.step(1 / 60);
        PT.check('UX2 화면 밖 공격 표시 끔 hides arrows', u.debug.arrows().length === 0);
        g.settings.set('offscreenArrows', true);
        h?.stop?.(); e.alive = false; e.object.visible = false;
      } else PT.skip('UX2 off-screen arrow', 'no spawn');
    } else PT.skip('UX2 off-screen arrow', 'tells stub');
    A.tellDebug?.().reset?.();
    const cues = () => ['tell_light', 'tell_heavy'].reduce((s, n) => s + (A.cueCount?.(n) || 0), 0);
    const c0 = cues();
    for (let i = 0; i < 4; i++) g.events.emit('tellStart', { enemy: { object: { position: pp } }, id: 'pt.' + i, tell: 'danger', windup: 1 + i * 0.2, pos: pp, targetsPlayer: true });
    const td = A.tellDebug?.();
    PT.check('UX2 ≤ 2 concurrent tell sounds', !!td && td.max <= 2 && cues() - c0 <= 2, { max: td?.max, cues: cues() - c0 });
    PT.check('UX audio: music duck while a tell targets the player', !!td && td.targeting >= 1);
    for (let i = 0; i < 4; i++) g.events.emit('tellEnd', { enemy: null, id: 'pt.' + i, reason: 'cancel' });
    let ok = true; try { A.play('no_such_cue_v4'); } catch (_) { ok = false; }
    PT.check('UX audio: unknown names are silent no-ops', ok);
  });

  // --------------------------------------------------------------------------- UX3 settings / bench / difficulty
  await pg.run('UX3 settings', async () => {
    const g = window.game, PT = window.PT, u = g.ui, SM = u.debug.settingsMenu;
    const S = await import('/src/core/settings.js');
    u.openSettings(); PT.step(0.05);
    const missing = S.SETTING_DEFS.map((d) => d.key).filter((k) => !document.querySelector(`.aw-settings [data-row="${k}"]`));
    PT.check('UX3 settings menu contains every §6.8 key', missing.length === 0, missing);
    PT.check('UX3 tabs 보조 기능 / 접근성 / 게임 / 조작 / 그래픽', [...document.querySelectorAll('.aw-set-tabs button')].map((b) => b.textContent).join() === '보조 기능,접근성,게임,조작,그래픽');
    const evs = [];
    g.events.on('settingsChanged', (p) => evs.push(p?.key));
    const dead = [];
    for (const d of S.SETTING_DEFS) {
      const n0 = evs.length;
      if (d.keymap) { const b = document.querySelector('[data-rebind="dodge"]'); b.click(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', bubbles: true })); g.input.keymap.rebind('dodge', 'KeyQ'); }
      else if (d.range) { const inp = document.querySelector(`.aw-settings input[data-k="${d.key}"]`); inp.value = String(Math.abs(+g.settings.values[d.key] - +inp.max) < 1e-6 ? inp.min : inp.max); inp.dispatchEvent(new Event('input', { bubbles: true })); }
      else {
        const cur = g.settings.values[d.key];
        const b = [...document.querySelectorAll(`.aw-settings .aw-seg[data-k="${d.key}"] button`)].find((x) => d.values[+x.dataset.i].v !== cur);
        b?.click();
      }
      if (!evs.slice(n0).includes(d.key)) dead.push(d.key);
    }
    PT.check('UX3 toggling each key emits settingsChanged for it (incl. the rebind button)', dead.length === 0, dead);
    g.settings.reset?.(); PT.step(0.05);
    PT.check('UX3 재시작 후 적용 rows (msaa / shadowType / pointLights)', ['msaa', 'shadowType', 'pointLights'].every((k) => /재시작 후 적용/.test(document.querySelector(`.aw-settings [data-row="${k}"]`)?.textContent || '')));
    PT.check('UX3 quality values 낮음 / 보통 / 높음', [...document.querySelectorAll('.aw-settings .aw-seg[data-k="quality"] button')].map((b) => b.textContent).join() === '낮음,보통,높음');
    SM.tab('graphics'); PT.step(0.05);
    PT.check('UX3 read-only 렌더 해상도 line', /^\d+×\d+$/.test(document.querySelector('.aw-set-res').textContent), document.querySelector('.aw-set-res').textContent);
    PT.check('UX3 rebind rows for dodge, dodgeAlt, defend', ['dodge', 'dodgeAlt', 'defend'].every((a) => document.querySelector(`[data-rebind="${a}"]`)));
    PT.check('UX3 difficulty row (4 values)', document.querySelectorAll('.aw-settings .aw-seg[data-k="difficulty"] button').length === 4 && document.querySelector('.aw-settings [data-seg="hard"]').textContent === '어려움');
    u.closeSettings(); PT.step(0.05);
    const cards = u.debug.newGame.cards();
    PT.check('UX3 새 게임 difficulty cards 이야기 / 쉬움 / 보통 / 어려움', cards.map((c) => c.id).join() === 'story,easy,normal,hard' && cards[2].text.includes('처음이라면 추천. 균형 잡힌 기본 난이도예요.'), cards.map((c) => c.id));
    g.settings.set('showFps', true); PT.step(0.4);
    PT.check('UX3 FPS overlay "N fps · 자동 품질 LN · 렌더 W×H"', /^\d+ fps · 자동 품질 L\d · 렌더 \d+×\d+$/.test(document.querySelector('.aw-fps').textContent), document.querySelector('.aw-fps').textContent);
    g.settings.set('showFps', false);
    g.settings.set('uiScale', 1.2); PT.step(0.05);
    PT.check('UX3 uiScale → --ui-scale', document.querySelector('.aw-root').style.getPropertyValue('--ui-scale') === '1.20');
    g.settings.set('uiScale', 1.0);
    let offered = false;
    u.qualityOffer({ textKo: g.settings.TEXT_KO?.offerLow || '보통 품질로 낮출까요? (재시작 필요)', yesKo: '바꾸기', noKo: '그대로', accept() {}, decline() { offered = true; } });
    const btn = [...document.querySelectorAll('.aw-toast-btns [data-o="n"]')].pop(); btn?.click();
    PT.check('UX3 quality offer toast with 바꾸기 / 그대로', offered);
  });

  await pg.run('UX3 benchmark', async () => {
    const g = window.game, PT = window.PT, u = g.ui;
    if (!g.quality?.benchmark) { PT.skip('UX3 성능 테스트', 'no quality.benchmark'); return; }
    const r = await u.runBenchmark(3);
    const txt = u.debug.settingsMenu.benchText();
    PT.check('UX3 성능 테스트 result card (avg fps, 1% low, level, render, GPU) + 복사', !!r && !!document.querySelector('.aw-bench.show') && /평균 \d+ fps · 1% 최저 \d+ fps · 자동 품질 L\d · 렌더 \d+×\d+/.test(txt) && !!document.querySelector('.aw-bench [data-b="copy"]'), txt);
    document.querySelector('.aw-bench [data-b="close"]').click();
  });

  await pg.run('UX3 class variants', async () => {
    const g = window.game, PT = window.PT, u = g.ui, H = u.debug.hints;
    const K = await import('/src/player/kits.js');
    const CL = await import('/src/core/classes.js');
    const T = await import('/src/ui/text.js');
    const desc = Object.getOwnPropertyDescriptor(g.player, 'kit');
    const want = { mage: true, sword: true, paladin: true, shadowblade: true, ranger: false, spiritcaller: false };
    const bad = [];
    for (const cls of CL.CLASS_IDS) {
      const kit = K.kitOf ? K.kitOf(cls) : K.KITS[cls];
      Object.defineProperty(g.player, 'kit', { configurable: true, get: () => kit });
      const cp = u.canParry();
      H.reset(); g.events.emit('tellFirst', { tell: 'parry' }); PT.step(0.05);
      const shown = document.querySelector('.aw-hint4 span').textContent;
      const exp = u.fmtKo(cp ? T.HINTS_KO.tell_parry : T.HINTS_KO.tell_parry_b);
      const keyOk = !/[{}]/.test(shown) && shown.includes(cp ? g.input.keymap.label('defend') : g.input.keymap.label('dodge'));
      if (cp !== want[cls] || shown !== exp || !keyOk) bad.push({ cls, cp, shown });
    }
    if (desc) Object.defineProperty(g.player, 'kit', desc);
    H.reset();
    PT.check('UX3 class-correct hint variants for all 6 classes (no parry for ranger / spiritcaller)', bad.length === 0 && CL.CLASS_IDS.length === 6, bad);
  });

  await pg.run('UX2 ui.update cost', () => {
    const g = window.game, PT = window.PT;
    const ms = [];
    for (let i = 0; i < 240; i++) { const t0 = performance.now(); g.ui.update(1 / 60, 1 / 60); ms.push(performance.now() - t0); if (i % 4 === 0) PT.step(1 / 60); }
    ms.sort((a, b) => a - b);
    const med = ms[ms.length >> 1], p99 = ms[Math.floor(ms.length * 0.99)];
    PT.check('UX2 ui.update ≤ 1.5 ms median, ≤ 6 ms p99', med <= 1.5 && p99 <= 6, { med: +med.toFixed(3), p99: +p99.toFixed(3) });
    PT.note(`ui.update median ${med.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms (960×540)`);
  });

  PT.check('mage page: no console errors', pg.errors().length === 0, pg.errors().slice(0, 6));
  await pg.close();

  // =========================================================================== dialogue fast-forward + Esc skip + short intro
  const p2 = await PT.boot('&cls=mage', { w: 640, h: 360 });
  if (p2.ready) {
    await p2.run('UX3 dialogue', () => {
      const g = window.game, PT = window.PT, S = g.story, I = g.input;
      const id = S.npcs?.elder ? 'elder' : Object.keys(S.npcs || {})[0];
      const n = S.npcs?.[id];
      if (n?.pos) { PT.tp(n.pos.x + 1.5, n.pos.z); PT.step(0.2); }
      S.talkTo(id); PT.step(0.3);
      if (!S.dialogueActive) { PT.skip('UX3 dialogue fast-forward', 'no dialogue'); return; }
      // Esc on a plain line → confirm → skip to the next choice (Noah: 6 lines, the 5th asks)
      I.simulate({ keys: { Escape: true } }); PT.step(1 / 60); I.simulate(null); PT.step(0.05);
      PT.check('UX3 Esc → 대화 건너뛰기 confirm', g.ui._parts.confirmBox.isOpen && /대화를 건너뛸까요/.test(document.querySelector('.aw-confirm-text')?.textContent || ''));
      g.ui._parts.confirmBox.yes(); PT.step(0.2);
      const st = S.getDialogueState();
      PT.check('UX3 skip runs to the next choice / the end', !S.dialogueActive || !!st?.choices, st);
      if (st?.choices) S.choose(st.choices.length - 1);
      for (let k = 0; k < 60 && S.dialogueActive; k++) { const d = S.getDialogueState(); if (d?.choices) S.choose(0); else S.advance(); PT.step(0.05); }
      // a long dialogue for the speed test: Noah's wake talk + the 옛이야기 branch
      S.debugTalk?.('elderWake') || S.talkTo(id); PT.step(0.3);
      const typeTime = () => { const len = (S.getDialogueState()?.text || '').length; let t = 0; while (S.getDialogueState()?.typing && t < 8) { PT.step(0.05); t += 0.05; } return len / Math.max(0.05, t); };
      const waitChange = (max) => { const t0 = S.getDialogueState()?.text; let w = 0; while (S.dialogueActive && !S.getDialogueState()?.choices && S.getDialogueState()?.text === t0 && w < max) { PT.step(0.05); w += 0.05; } return w; };
      S.advance(); S.advance(); PT.step(0.05);
      const vN = typeTime();
      I.simulate({ keys: { Space: true } }); PT.step(0.05);
      typeTime();                                  // the line started by the press (speed ramps up)
      const w = waitChange(3);
      PT.check('UX3 hold: auto-advance ≈ 0.4 s after a line ends', w >= 0.3 && w <= 0.6, { w });
      const vF = typeTime();
      I.simulate(null); PT.step(0.05);
      PT.check('UX3 hold F / Space: ≥ 3× text speed', vF >= vN * 3, { normal: +vN.toFixed(1), held: +vF.toFixed(1) });
      for (let i = 0; i < 60 && S.dialogueActive; i++) { const d = S.getDialogueState(); if (d?.choices) S.choose(0); else S.advance(); PT.step(0.05); }
    });
    await p2.run('UX3 short intro', async () => {
      const g = window.game, PT = window.PT, C = g.cinematic;
      if (!C?.playIntro) { PT.skip('UX3 short intro', 'no cinematic'); return; }
      const prev = g.state;
      C.playIntro(() => {}, { short: true }); PT.step(0.1);
      const dShort = C.seqDuration;
      C.stop(); PT.step(0.3);
      C.playIntro(() => {}, { short: false }); PT.step(0.1);
      const dFull = C.seqDuration;
      C.stop(); PT.step(0.3);
      if (g.state !== prev && g.state !== 'playing') g.setState('playing');
      PT.check('UX3 short intro ≤ 30 s (4 key shots)', dShort > 15 && dShort <= 30 && dFull > dShort, { dShort, dFull });
      PT.check('UX3 introShort defaults on', g.settings.DEFAULTS?.introShort === true);
      PT.note(`intro: short ${dShort.toFixed(1)} s, full ${dFull.toFixed(1)} s`);
    });
    PT.check('dialogue page: no console errors', p2.errors().length === 0, p2.errors().slice(0, 6));
  } else PT.check('boot dialogue page', false);
  await p2.close();

  // =========================================================================== ranger: parryKo hidden in recap + codex
  const p3 = await PT.boot('&cls=ranger', { w: 640, h: 360 });
  if (p3.ready) {
    await p3.run('UX1 ranger tip', () => {
      const g = window.game, PT = window.PT, u = g.ui;
      const all = g.enemies?.codex?.() || {};
      const type = Object.keys(all).find((t) => all[t].attacks?.some((a) => a.parryKo));
      if (!type) { PT.skip('UX1 ranger: parryKo hidden', 'no parryKo in codex data'); return; }
      const a = all[type].attacks.find((x) => x.parryKo);
      u.debug.monsters.unlock(type, 'kill');
      u.openCodex('mon'); PT.step(0.05);
      PT.check('UX1 ranger: codex hides parryKo lines', u.canParry() === false && !document.querySelector('.aw-ment-parry'));
      u.closeCodex(); PT.step(0.05);
      g.events.emit('playerHurt', { amount: 20, element: 'physical', source: { kind: type, codexKey: type }, sourceName: all[type].nameKo, attackId: a.id, attackNameKo: a.nameKo, attackKind: 'melee', dot: false, dir: { x: 1, z: 0 }, time: g.time });
      g.events.emit('playerDeath', {}); g.setState('dead'); PT.step(0.1);
      const r = u.debug.recap();
      PT.check('UX1 ranger: class-correct recap tip without parryKo', r && r.tip === u.fmtKo(a.counterKo), r?.tip);
    });
    PT.check('ranger page: no console errors', p3.errors().length === 0, p3.errors().slice(0, 6));
  }
  await p3.close();
};
