// Story module v3 (CONTRACT §17): NPCs, dialogue system, the data-driven quest chain of story/quests.js
// (wake → choose → training → updraft → camps → boss → reveal → {mirwen → hydra | elderwood → nox → treant} ×2 →
// ascent → kalis → final → ending → done), objective & compass markers, save (serialize/deserialize). game.story.
// NPC talk goes through game.interact (F); the class choice through ui.openClassPanel (story/classSelect.js).
import * as THREE from 'three';
import { buildNpcModel } from './story/npcs.js';
import { createTrials } from './story/trials.js';
import { createStoryUI } from './story/ui.js';
import * as SC from './story/script.js';
import * as S3 from './story/script3.js';
import {
  QUESTS, QUEST_BY_ID, STAGES, TITLES, REGIONS, REGION_OF, BOSS_OF_STAGE, STAGE_OF_BOSS, SPIRIT_OF_BOSS, MIN_LEVEL, ACT_OF,
  TRAIN_STEPS, TRAIN_BASIC_N, ASCENT_STEPS, GROVE, NPC_FALLBACK, SHRINE_OF, SPIRIT_NPC, questXp, nextStage, stagesBefore,
} from './story/quests.js';
import { classAskOptions, openClassPanel, applyClass, changeClassAtAltar, mentorOf, classOfMentor, MENTOR_IDS } from './story/classSelect.js';
import { clamp, damp, dampAngle, angleDiff, smoothstep } from './core/utils.js';
import { CLASS_DEFS } from './core/classes.js';
import { elColor, ELEMENT_DEFS, ALL_ELEMENTS } from './core/elements.js';

const ALL_ELEMENTS_WITH_STATUS = () => ALL_ELEMENTS.filter((el) => ELEMENT_DEFS[el]?.status);

const SPEAKERS = { ...SC.SPEAKERS, ...S3.SPEAKERS3 };
const VILLAGE_NPCS = ['elder', 'mageMentor', 'swordMentor', 'captain', 'merchant', 'child', 'villagerA', 'villagerB', 'villagerC',
  'rangerMentor', 'paladinMentor', 'spiritMentor', 'shadowMentor', 'sage', 'trainer'];
const ZONE_NPCS = ['lakeKeeper', 'forestChild'];
const SPIRIT_NPCS = ['undina', 'sylvania', 'nox', 'lumiel'];
const NPC_IDS = [...VILLAGE_NPCS, ...ZONE_NPCS, ...SPIRIT_NPCS];
const PHASE_OF = {
  wake: 'early', choose: 'early', training: 'training', updraft: 'updraft', camps: 'camps', boss: 'boss',
  reveal: 'act2', mirwen: 'act2', hydra: 'act2', elderwood: 'act2', nox: 'act3', treant: 'act3',
  ascent: 'act4', kalis: 'act4', final: 'act4', ending: 'done', done: 'done',
};
const PHASE_FALLBACK = { act2: ['boss', 'camps'], act3: ['act2', 'boss', 'camps'], act4: ['act3', 'act2', 'boss'], done: ['act4', 'act3', 'act2'] };
const TALK_R = 3.0;
const CPS_DELAY = 1 / 46;   // typewriter seconds per char
const SLOT_KIND = { lmb: 'basic', basic: 'basic', rmb: 'charged', charged: 'charged', q1: 'quick', q2: 'quick', q3: 'quick', q4: 'quick', quick: 'quick', support: 'quick', sup: 'quick' };
/** 와/과 after a Korean name. */
const wa = (name) => { const c = (name || '').charCodeAt((name || '').length - 1) - 0xAC00; return c >= 0 && c < 11172 && c % 28 ? '과' : '와'; };

export function createStory(game) {
  const { events } = game;
  const W = () => game.world;
  const groundAt = (x, z) => { const w = W(); return (w?.getGroundHeight || w?.getHeight)?.call(w, x, z) ?? 0; };
  const ui = createStoryUI(game);
  const audio = (n, o) => { try { game.audio?.play?.(n, o); } catch (_) { /* */ } };
  const P = () => game.progression;
  const warned = new Set();
  const warnOnce = (k, ...a) => { if (warned.has(k)) return; warned.add(k); console.warn(...a); };

  // ------------------------------------------------------------------------------------------- NPCs
  const npcs = {};
  const npcList = [];
  function npcSpot(id, i) {
    const w = W(), V = w?.village;
    const s = V?.npcSpots?.[id];
    if (s?.position) return { pos: s.position.clone(), yaw: Number.isFinite(s.yaw) ? s.yaw : 0 };
    const zs = w?.zones && (Array.isArray(w.zones) ? w.zones : Object.values(w.zones));
    if (zs) for (const z of zs) { const q = z?.npcSpots?.[id]; if (q?.position) return { pos: q.position.clone(), yaw: q.yaw || 0 }; }
    const el = Object.keys(SPIRIT_NPC).find((e) => SPIRIT_NPC[e] === id);
    if (el) {
      const sh = (w?.shrines || []).find((x) => x.id === SHRINE_OF[el]);
      if (sh?.position) { const f = NPC_FALLBACK[id]; return { pos: new THREE.Vector3(sh.position.x + 1.6, 0, sh.position.z + 1.6), yaw: f ? Math.atan2(f.face[0] - sh.position.x, f.face[1] - sh.position.z) : 0 }; }
    }
    const f = NPC_FALLBACK[id];
    if (f) return { pos: new THREE.Vector3(f.x, 0, f.z), yaw: Math.atan2(f.face[0] - f.x, f.face[1] - f.z) };
    const base = w?.playerSpawn || new THREE.Vector3(0, 0, 120);
    return { pos: new THREE.Vector3(base.x + Math.cos(i * 0.7) * (6 + i), 0, base.z - 4 + Math.sin(i * 0.7) * (6 + i)), yaw: 0 };
  }
  function buildNpcs() {
    NPC_IDS.forEach((id, i) => {
      let m;
      try { m = buildNpcModel(id); } catch (err) { warnOnce('npc:' + id, '[story] npc model', id, err); return; }
      const sp = SPEAKERS[id] || SPEAKERS.narr;
      const { pos, yaw } = npcSpot(id, i);
      pos.y = groundAt(pos.x, pos.z);
      m.root.position.copy(pos); m.root.rotation.y = yaw;
      game.scene.add(m.root);
      let headTop;
      if (m.info.merged) headTop = m.info.top * (m.info.scale || 1);
      else { m.headMesh.geometry.computeBoundingBox(); headTop = m.neckY + m.headMesh.geometry.boundingBox.max.y; }
      const sc = m.info.scale || 1;
      const n = {
        id, sp, model: m, root: m.root, pos: m.root.position, yaw, baseYaw: yaw,
        homePos: pos.clone(), homeYaw: yaw,
        eyeH: (m.neckY + 0.22) * sc, tagH: m.info.merged ? headTop + 0.12 : Math.min(headTop, m.neckY + 0.75) + 0.1,
        headYaw: 0, headPitch: 0, phase: Math.random() * 10, talks: {}, dist: 99, camDist: 99,
        tag: ui.makeTag(sp.name, sp.title), mark: '', collider: null, visible: true, outlinesOn: true,
        speaking: false, hop: 0, hidden: SPIRIT_NPCS.includes(id), spirit: !!m.info.spirit,
      };
      if (n.hidden) { n.root.visible = false; n.visible = false; }
      else addCollider(n);
      npcs[id] = n; npcList.push(n);
    });
  }
  function addCollider(n) {
    const cols = W()?.colliders;
    if (!Array.isArray(cols)) return;
    if (n.collider) n.collider.x = 1e5; // retire in place (world's spatial grid only rebuilds when the count changes)
    n.collider = { x: n.pos.x, z: n.pos.z, r: n.id === 'child' || n.id === 'forestChild' ? 0.3 : n.id === 'sylvania' ? 0.7 : 0.42, npc: n.id };
    cols.push(n.collider);
  }
  function retireCollider(n) { if (n.collider) { n.collider.x = 1e5; n.collider = null; } }
  function moveNpc(n, pos, yaw) {
    n.pos.set(pos.x, groundAt(pos.x, pos.z), pos.z);
    n.yaw = n.baseYaw = yaw; n.root.rotation.y = yaw;
    if (!n.hidden) addCollider(n);
  }
  function setNpcHidden(id, hidden) {
    const n = npcs[id]; if (!n || n.hidden === hidden) return;
    n.hidden = hidden;
    if (hidden) { n.root.visible = false; n.visible = false; retireCollider(n); ui.hideTag(n.tag); }
    else addCollider(n);
  }
  function mentorTrainingSpot() {
    const T = W()?.village?.trainingGround || W()?.trainingArea;
    const C = W()?.village?.center || W()?.playerSpawn;
    if (!T) return null;
    const dx = (C?.x ?? T.x) - T.x, dz = (C?.z ?? T.z + 10) - T.z, l = Math.hypot(dx, dz) || 1;
    const r = (W()?.trainingRadius || 8.5) * 0.85;
    const p = new THREE.Vector3(T.x + (dx / l) * r + (-dz / l) * 2.2, 0, T.z + (dz / l) * r + (dx / l) * 2.2);
    return { pos: p, yaw: Math.atan2(T.x - p.x, T.z - p.z) };
  }

  // ------------------------------------------------------------------------------------------- quest state
  const S = {
    stage: null, flags: {}, temp: {}, trainStep: null, trainDone: {}, hits: 0, regionOrder: [], ascentStep: 0,
    timoTalked: false, featherActive: false, featherGot: false, rowenTalked: false, arenaBanner: false,
    mentorId: null, pendingAction: null, healedPhase: {}, escort: false, bossStarting: null, victoryEmitted: false, noBoss: {},
    cls: () => game.progression?.cls || 'mage',
    kit: () => CLASS_DEFS[game.progression?.cls] || CLASS_DEFS.mage,
    master: () => !!game.progression?.isMaster?.(),
    markDirty() { dirty = true; },
    completeTraining() { if (S.stage === 'training') advance('training'); },
    startFeather() { S.timoTalked = true; activateFeather(); dirty = true; },
    startCampHunt() { S.rowenTalked = true; dirty = true; checkCamps(); },
    sageTalked() { S.flags.sageTalked = true; dirty = true; after(1.2, () => bark('sage', '정령의 문은 마을 서쪽 광장에 있어요. 다녀오세요.')); },
    startEscort() { S.flags.momoTalked = true; S.escort = true; retireCollider(npcs.forestChild || {}); dirty = true; },
  };
  let dirty = true, silent = false;
  const trials = createTrials(game, { S, P, toast: (t) => { try { game.ui?.toast?.(t); } catch (_) { /* */ } }, isDone: () => S.stage === 'done' });
  // story cinematics (rite, reveal, spirit freed, boss intro, ending) play by themselves in normal play; in ?test runs only when
  // a test opts in (story.autoCinematics = true, or &cine=1), so other owners' playtests never stall in a cutscene
  let autoCine = !game.isTest;
  try { if (game.isTest && new URLSearchParams(location.search).get('cine') === '1') autoCine = true; } catch (_) { /* */ }
  const timers = [];
  const after = (t, fn) => timers.push({ t, fn });

  function startQuest(id) {
    S.stage = id; dirty = true;
    try { W()?.setActVisible?.(ACT_OF[id] || 1); } catch (_) { /* */ }
    if (!silent) { events.emit('questStart', { id, title: TITLES[id] }); audio('quest_start'); }
  }
  function completeQuest(id) {
    dirty = true;
    if (silent) return;
    events.emit('questComplete', { id, title: TITLES[id] });
    audio('quest_complete');
    const xp = questXp(id, S);
    if (xp > 0) { try { P()?.addXp?.(xp, { kind: 'quest', id }); } catch (_) { /* */ } }
  }
  /** Finish stage `id` and enter the next one (branch-aware). */
  function advance(id) {
    if (S.stage !== id) return;
    completeQuest(id);
    const nx = nextStage(id, S);
    if (nx) enterStage(nx);
  }
  function enterStage(id) {
    const reg = REGION_OF[id];
    if (reg && !S.regionOrder.includes(reg)) S.regionOrder.push(reg);
    startQuest(id);
    onStageStart(id);
  }
  function onStageStart(id) {
    switch (id) {
      case 'training': startTraining(); break;
      case 'updraft': if (!silent) startUpdraft(); break;
      case 'reveal': gatherRevealNpcs(); break;
      case 'mirwen': if (!silent) after(2, () => bark('sage', '미르웬 호숫가의 {나엘}을 찾아가요. 정령의 문을 쓰면 금방이에요.')); break;
      case 'elderwood': if (!silent) after(2, () => bark('sage', '엘더우드 숲 어귀의 {모모}를 찾아가요. 썩은 덩굴을 조심하고요.')); break;
      case 'ascent': S.ascentStep = 0; if (!silent) after(2.5, () => bark('sage', S3.ASCENT_START.t)); break;
      case 'final': if (!silent) after(1, () => bark('lumiel', S3.FINAL_CALL)); break;
      default: break;
    }
  }
  let heldBark = null; // barks raised during a dialogue / cinematic wait until it is over (latest wins)
  function bark(id, text, sec) {
    if (silent || !text) return;
    if (D.active || game.cinematic?.active || game.state === 'cutscene') { heldBark = [id, text, sec]; return; }
    ui.bark(SPEAKERS[id] || null, text, sec || Math.min(7, 2.6 + text.length * 0.055));
  }

  // --- choose → 각인 의식 → training
  function classPicked(cls) {
    if (S.stage !== 'choose') return;
    S.mentorId = mentorOf(cls);
    completeQuest('choose');
    S.stage = 'rite'; // transient: blocks re-entry while the rite plays
    const m = S.mentorId;
    applyClass(game, cls, () => {
      S.stage = 'choose';
      relocateMentor();
      enterStage('training');
      after(0.4, () => {
        try { (game.ui?.tip?.('firstPoint', S3.TREE_TIP)) || game.ui?.hint?.(S3.TREE_TIP); } catch (_) { /* */ }
      });
      after(1.0, () => bark(m, S3.MENTOR_ACCEPT[m]));
    }, { rite: autoCine });
  }
  function relocateMentor() {
    const n = npcs[S.mentorId]; const sp = mentorTrainingSpot();
    if (n && sp && n.pos.distanceTo(sp.pos) > 2) moveNpc(n, sp.pos, sp.yaw);
  }
  function startTraining() {
    if (!S.mentorId) S.mentorId = mentorOf(S.cls());
    S.trainStep = 'go'; S.trainDone = {}; S.hits = 0; practiceT = 1.5; S.flags.learnedNode = false;
    after(0.6, () => bark(S.mentorId, S3.trainingBark(S.mentorId, 'go', S.kit())));
  }
  function setTrainStep(step, praise = true) {
    S.trainStep = step; dirty = true;
    const pre = praise ? S3.praise(S.mentorId, (Math.random() * 4) | 0) + ' ' : '';
    bark(S.mentorId, pre + S3.trainingBark(S.mentorId, step, S.kit()), 6.5);
    if (step === 'defend') { practiceT = 2.2; defendHold = 0; }
    if (step === 'learn' && noTrees()) markTrain('learn');
    if (step !== 'go' && praise) audio('ui_select', { volume: 0.8, pitch: 1.2 });
  }
  const noTrees = () => !(P()?.hasTrees?.());
  function advanceTraining() {
    if (S.stage !== 'training' || S.trainStep === 'go' || S.trainStep === 'done') return;
    if (!S.trainDone[S.trainStep]) return;
    setTrainStep(nextTrainStep() || 'done');
  }
  /** Something to press on 1~4 / X / G? A fresh class has no quick skill until the 'learn' step, so 'quick' waits for it. */
  function quickReady() {
    const sk = game.skills; if (!sk || sk.isStub || !sk.loadout) return true;
    const L = sk.loadout; return !!(L.q1 || L.q2 || L.q3 || L.q4 || L.sup || L.ult);
  }
  function nextTrainStep() {
    const rest = TRAIN_STEPS.filter((st) => !S.trainDone[st]);
    if (!rest.length) return null;
    if (rest[0] === 'quick' && rest.length > 1 && !quickReady()) return rest[1];
    return rest[0];
  }
  function markTrain(step) {
    if (S.stage !== 'training' || S.trainDone[step]) return;
    S.trainDone[step] = true; dirty = true;
    advanceTraining();
  }
  function onTrainCast(kind) {
    if (S.stage !== 'training') return;
    if (kind === 'basic') { S.hits++; dirty = true; if (S.hits >= TRAIN_BASIC_N) markTrain('basic'); }
    else if (kind === 'charged') markTrain('charged');
    else if (kind === 'quick') markTrain('quick');
  }

  // --- updraft
  function startUpdraft() { S.timoTalked = false; after(1.2, () => bark(S.mentorId || 'elder', S3.TIMO_WAITS.t)); }
  function collectFeather(quiet = false) {
    S.featherActive = false; S.featherGot = true; feather.group.visible = false;
    featherFx?.stop?.(); featherFx = null;
    const Pl = game.player;
    // +20 max stamina: a stats source (survives statsChanged refreshes); the direct write is only the no-stats fallback
    let viaStats = false;
    try { if (game.stats?.set) { game.stats.set('story:feather', { maxStaminaAdd: 20 }); viaStats = true; } } catch (_) { viaStats = false; }
    if (viaStats) { try { game.player?.refreshStats?.(); } catch (_) { /* */ } }
    else if (Pl && typeof Pl.maxStamina === 'number') { try { Pl.maxStamina += 20; } catch (_) { /* */ } }
    if (Pl && typeof Pl.maxStamina === 'number') { try { Pl.stamina = Pl.maxStamina; } catch (_) { /* */ } }
    if (quiet) return;
    const fp = feather.group.position;
    game.vfx?.burst?.(fp, { count: 60, color: [0x8fffc1, 0xffffff], speed: 7, spread: 1, size: 0.3, life: 1.1, shape: 'leaf', gravity: -1 });
    game.vfx?.shockwave?.(fp, { color: 0x8fffc1, radius: 5, duration: 0.8 });
    game.vfx?.screenFlash?.(0x8fffc1, 0.25, 0.5);
    audio('item_get');
    ui.itemGet('바람 깃털', '실피아의 깃털 — 최대 스태미나 +20');
    after(2.6, () => bark('child', '우와아아! 진짜 해냈다!! 수호자님 최고!'));
    after(5.5, () => { if (S.stage === 'updraft') { advance('updraft'); bark('child', '아, 맞다! {로웬} 대장님이 북문에서 수호자님을 찾으셨어요!'); } });
  }

  /** Camps cleared before training/updraft were finished: wrap those up so the feather reward isn't lost. */
  function finishEarlyStages() {
    const wasSilent = silent; silent = true;
    try {
      if (S.stage === 'training') { for (const st of TRAIN_STEPS) S.trainDone[st] = true; S.trainStep = 'done'; relocateMentor(); }
      S.timoTalked = true;
      const gotNow = !S.featherGot;
      if (gotNow) collectFeather(true);
      S.rowenTalked = true;
      S.stage = 'camps'; dirty = true;
      silent = wasSilent;
      if (gotNow) { try { ui.itemGet?.('바람 깃털', '티모의 선물 — 최대 스태미나 +20'); } catch (_) { /* */ } }
    } finally { silent = wasSilent; }
  }
  // --- camps & golem
  function campProgress() {
    const o = game.enemies?.getObjective?.();
    return { cur: o?.campsCleared ?? 0, max: o?.campsTotal ?? (W()?.camps?.length || 3), phase: o?.phase, camps: o?.camps };
  }
  function checkCamps() {
    if (S.stage !== 'camps') return;
    const p = campProgress();
    if ((p.cur >= p.max && p.max > 0) || p.phase === 'boss' || p.phase === 'done') advance('camps');
  }

  // --- act bosses: proximity trigger → boss intro (prewarm behind the fade) → spawn
  function arenaOf(id) { const w = W(); return w?.bossArenas?.[id] || (id === 'golem' ? w?.bossArena : null) || null; }
  function liveBoss(id) { const b = game.enemies?.boss; return b && b.alive !== false && !b.defeated && (b.bossId === id || b.id === id || b.type === id) ? b : null; }
  function spawnAct(id) {
    try { return game.enemies?.spawnBoss?.(id) || null; } catch (err) { console.warn('[story] spawnBoss', id, err); return null; }
  }
  function startBossFight(id, { intro = true } = {}) {
    if (S.bossStarting || liveBoss(id)) return;
    S.bossStarting = id;
    const done = () => { S.bossStarting = null; dirty = true; if (!liveBoss(id) && BOSS_OF_STAGE[S.stage] === id) S.noBoss[id] = true; };
    const C = game.cinematic;
    if (intro && autoCine && C?.playBossIntro && !silent) {
      try {
        const h = C.playBossIntro(id, () => { S.introHandle = null; done(); }, { spawn: () => spawnAct(id), valid: () => S.bossStarting === id && BOSS_OF_STAGE[S.stage] === id });
        S.introHandle = h?.pending ? h : null;
        return;
      } catch (err) { console.warn('[story] playBossIntro', err); }
    }
    const r = spawnAct(id);
    if (r && typeof r.then === 'function') r.then(done, done); else done();
  }
  function bossTriggerCheck() {
    const q = QUEST_BY_ID[S.stage];
    if (!q || q.kind !== 'boss' || q.boss === 'golem' || S.bossStarting) return;
    if (liveBoss(q.boss) || S.noBoss[q.boss]) return;
    const reg = game.enemies?.bosses;
    if (reg?.has && !reg.has(q.boss)) return;   // bosses folder missing / still loading: never loop the intro
    const A = arenaOf(q.boss), pp = game.player?.object?.position;
    if (!A?.position || !pp) return;
    const dx = pp.x - A.position.x, dz = pp.z - A.position.z, r = (A.radius || 20) + 8;
    if (dx * dx + dz * dz > r * r) return;
    if (pp.y < A.position.y - 8) return;   // ledge / plateau: must actually be up there
    startBossFight(q.boss);
  }
  function healFull() {
    const Pl = game.player; if (!Pl) return;
    try { Pl.hp = Pl.maxHp; if (Pl.entity) Pl.entity.hp = Pl.maxHp; } catch (_) { /* */ }
    try { Pl.mp = Pl.maxMp; } catch (_) { /* */ }
    try { Pl.stamina = Pl.maxStamina; } catch (_) { /* */ }
    try { if (Pl.resolve != null) Pl.resolve = Pl.maxResolve; } catch (_) { /* */ }
  }
  function onBossDefeated(p) {
    const id = p?.id || p?.boss?.bossId;
    if (!id) return;
    if (trials.onBossDefeated(id)) return;   // a post-game 정령 시련 re-fight: XP only, the story is already done
    // only the current stage's boss advances the story (debug spawns of other bosses never corrupt it). A real golem
    // always moves the story to 'boss' first through bossSpawn {id:'golem'}.
    if (BOSS_OF_STAGE[S.stage] !== id) return;
    const stage = S.stage;
    try { P()?.addPoints?.(1, id); } catch (_) { /* */ }
    if (id === 'golem') {
      try { P()?.breakSeals?.(); } catch (_) { /* */ }
      advance(stage);   // → reveal (the stage changes now; the cinematic follows)
      if (!silent && autoCine) after(2.6, () => playCine('playReveal', () => bark('elder', '얘야, 무사하구나! 이솔데가 너를 찾고 있단다. 마을로 돌아오너라.')));
      return;
    }
    if (id === 'nidhoggra') { completeQuest(stage); enterStage('ending'); after(silent ? 0 : 2.2, startEnding); return; }
    const el = SPIRIT_OF_BOSS[id];
    if (el) { try { P()?.freeSpirit?.(el); } catch (_) { /* */ } }
    healFull();
    advance(stage);
    if (el && !silent && autoCine) after(2.4, () => playCine('playSpiritFreed', () => { revealSpirit(el); bark(SPIRIT_NPC[el], S3.SPIRIT_FREED[el]?.line); }, el));
    else if (el) revealSpirit(el);
  }
  function revealSpirit(el) {
    const id = SPIRIT_NPC[el]; if (!id) return;
    setNpcHidden(id, false);
  }
  function playCine(fn, done, arg) {
    const C = game.cinematic;
    if (!C?.[fn]) { done?.(); return; }
    try { if (arg !== undefined) C[fn](arg, done); else C[fn](done); } catch (err) { console.warn('[story]', fn, err); done?.(); }
  }
  function emitVictoryOnce() {
    if (S.victoryEmitted) return;
    S.victoryEmitted = true;
    let stats = null; try { stats = game.enemies?.getRunStats?.() || null; } catch (_) { /* */ }
    events.emit('victory', { stats });
  }
  function startEnding() {
    if (S.stage !== 'ending' || S.flags.endingPlaying) return;
    S.flags.endingPlaying = true;
    const toVictory = () => {
      S.flags.endingPlaying = false;
      emitVictoryOnce();
      game.setState('victory');
    };
    if (game.cinematic?.playEnding && autoCine) {
      try { game.cinematic.playEnding(toVictory); } catch (err) { console.warn('[story] playEnding failed', err); toVictory(); }
    } else after(2.5, toVictory);
  }
  /** After the victory screen: free roam epilogue (stage done). */
  function continueEpilogue() {
    if (S.stage === 'ending') { completeQuest('ending'); enterStage('done'); if (!silent) after(6, () => trials.announce()); }
    if (game.state === 'victory') game.setState('playing');
    return S.stage === 'done';
  }

  // --- reveal / regions / ascent
  function gatherRevealNpcs() {
    // the elder joins the sage for the reveal talk
    const sg = npcs.sage, el = npcs.elder;
    if (sg && el && el.pos.distanceTo(sg.pos) > 4) {
      const a = sg.homeYaw;
      moveNpc(el, new THREE.Vector3(sg.pos.x + Math.cos(a) * 1.6, 0, sg.pos.z - Math.sin(a) * 1.6), sg.homeYaw);
    }
  }
  function pickRegion(reg) {
    if (S.stage !== 'reveal' || !S.flags.sageTalked || !REGIONS[reg]) return;
    completeQuest('reveal');
    enterStage(REGIONS[reg][0]);
  }
  function walls() {
    const rw = W()?.rotWalls;
    if (!Array.isArray(rw) || !rw.length) return { cur: 0, max: 0 };
    let c = 0; for (const w of rw) if (w.state && w.state !== 'intact') c++;
    return { cur: c, max: rw.length };
  }
  const _grove = new THREE.Vector3(GROVE.x, 0, GROVE.z);
  function grovePos() { const sh = (W()?.shrines || []).find((x) => x.id === SHRINE_OF.nature); if (sh?.position) _grove.copy(sh.position); else _grove.y = groundAt(GROVE.x, GROVE.z); return _grove; }
  function escortCheck() {
    if (S.stage !== 'elderwood' || !S.flags.momoTalked || S.flags.escortDone) return;
    const w = walls();
    if (w.cur < w.max) return;
    const m = npcs.forestChild, g = grovePos(), pp = game.player?.object?.position;
    if (!m || !pp) return;
    const dm = Math.hypot(m.pos.x - g.x, m.pos.z - g.z), dp = Math.hypot(pp.x - g.x, pp.z - g.z);
    if (dm < GROVE.r + 2 && dp < GROVE.r + 10) {
      S.flags.escortDone = true; S.escort = false;
      m.homePos.copy(m.pos); m.homeYaw = m.yaw; addCollider(m);
      bark('forestChild', S3.MOMO_BARKS.arrive);
      advance('elderwood');
    }
  }
  const _mv = new THREE.Vector3();
  function updateEscort(realDt) {
    const m = npcs.forestChild, pp = game.player?.object?.position;
    if (!S.escort || !m || !pp || game.state !== 'playing') return;
    const dx = pp.x - m.pos.x, dz = pp.z - m.pos.z, d = Math.hypot(dx, dz);
    if (d > 40) { // the player travelled (gate): Momo catches up behind them
      m.pos.set(pp.x - 2, 0, pp.z - 2); m.pos.y = groundAt(m.pos.x, m.pos.z); return;
    }
    if (d > 3.2) {
      const sp = Math.min(d - 3, (d > 12 ? 9 : 5.5) * realDt);
      m.pos.x += (dx / d) * sp; m.pos.z += (dz / d) * sp; m.pos.y = damp(m.pos.y, groundAt(m.pos.x, m.pos.z), 14, realDt);
      m.baseYaw = Math.atan2(dx, dz); m.walking = true;
    } else m.walking = false;
  }
  function ascentCheck() {
    if (S.stage !== 'ascent') return;
    const pp = game.player?.object?.position; if (!pp) return;
    for (let k = ASCENT_STEPS.length - 1; k >= S.ascentStep; k--) {
      const s = ASCENT_STEPS[k];
      if (Math.hypot(pp.x - s.x, pp.z - s.z) > s.r) continue;
      if (s.y != null && pp.y < s.y) continue;
      // reached step k (and every one before it)
      for (let j = S.ascentStep; j <= k; j++) { try { P()?.addXp?.(900, { kind: 'quest', id: 'ascent:' + ASCENT_STEPS[j].id }); } catch (_) { /* */ } }
      S.ascentStep = k + 1; dirty = true;
      bark('sage', S3.ASCENT_STEP_BARK[k] || '', 3.2);
      audio('quest_start', { volume: 0.6, pitch: 1.2 });
      if (S.ascentStep >= ASCENT_STEPS.length) advance('ascent');
      break;
    }
  }
  function regionCheck() {
    if (S.stage !== 'reveal' || !S.flags.sageTalked) return;
    const pp = game.player?.object?.position; if (!pp) return;
    const z = W()?.getZoneAt?.(pp.x, pp.z);
    if (z && REGIONS[z.id]) pickRegion(z.id);
  }
  function mirwenCheck() {
    if (S.stage !== 'mirwen') return;
    const sh = (W()?.shrines || []).find((x) => x.id === SHRINE_OF.water);
    const pp = game.player?.object?.position;
    const tx = sh?.position?.x ?? NPC_FALLBACK.undina.x, tz = sh?.position?.z ?? NPC_FALLBACK.undina.z;
    if (pp && Math.hypot(pp.x - tx, pp.z - tz) < 5) reachUndina();
  }
  function reachUndina() {
    if (S.stage !== 'mirwen') return;
    bark('undina', S3.UNDINA_CALL, 4);
    advance('mirwen');
  }

  // ------------------------------------------------------------------------------------------- dialogue
  const D = {
    active: false, npc: null, focus: null, queue: [], node: null, spans: null, chars: null, idx: 0, charT: 0,
    typing: false, choices: null, sel: 0, inputDelay: 0, side: 1, unlockT: 0,
    cam: new THREE.Vector3(), look: new THREE.Vector3(), started: false,
  };
  const later = () => ({ ...S3.CHOICE_LATER, go: [{ s: 'narr', t: '언제든 다시 말을 걸어 주세요.' }] });
  function mentorChoose(n) {
    const first = !S.flags.metMentors; S.flags.metMentors = true;
    const pitch = S3.MENTOR_PITCH[n.id] || [];
    const nodes = [...(first ? S3.ALTAR_FIRST : []), ...pitch];
    const cls = classOfMentor(n.id);
    nodes.push(() => {
      // with ui: the class panel opens right after the talk; without: a 6-option dialogue ask
      if (game.ui && !game.stubbed?.includes?.('ui') && typeof game.ui.openClassPanel === 'function') { S.pendingAction = () => openPanel(cls); return null; }
      return [{ ...S3.MENTOR_ASK, ask: classAskOptions((c) => { S.pendingAction = () => classPicked(c); }, later()) }];
    });
    return nodes;
  }
  function openPanel(current) {
    if (S.stage !== 'choose') return;
    const ok = openClassPanel(game, { current, onPick: (c) => classPicked(c), onCancel: () => {} });
    if (!ok) startDialogue([{ ...S3.MENTOR_ASK, ask: classAskOptions((c) => { S.pendingAction = () => classPicked(c); }, later()) }], npcs[mentorOf(current)] || npcList[0]);
  }
  function ambientFor(n, ph) {
    const tables = [S3.AMBIENT3[n.id], S3.AMBIENT3_OLD[n.id], SC.AMBIENT[n.id]];
    for (const key of [ph, ...(PHASE_FALLBACK[ph] || []), 'early']) for (const t of tables) if (t?.[key]) return t[key];
    if (S3.SPIRIT_TALK[n.id]) return S3.SPIRIT_TALK[n.id];
    return [[{ s: n.id, t: '…' }]];
  }
  function dialogueFor(n) {
    const st = S.stage;
    const ph = PHASE_OF[st] || 'early';
    if (n.id === 'elder' && st === 'wake') return [...SC.elderWake(S), () => { advance('wake'); }];
    if (st === 'choose' && MENTOR_IDS.includes(n.id)) return mentorChoose(n);
    if (n.id === S.mentorId && st === 'training') {
      if (S.trainStep === 'done') return S3.mentorTrainingDone(S, n.id);
      return [{ s: n.id, t: S3.trainingBark(n.id, S.trainStep || 'go', S.kit()) }];
    }
    if (n.id === 'child' && st === 'updraft' && !S.timoTalked) return SC.timoUpdraft(S);
    if (n.id === 'child' && st === 'updraft' && S.featherActive) return [{ s: 'child', t: '불씨 항아리를 터뜨리고, 불 위에서 점프! 그리고 {스페이스를 꾹}! 바위 꼭대기에서 깃털이 빛나고 있어요!' }];
    if (n.id === 'captain' && st === 'camps' && !S.rowenTalked) return SC.rowenCamps(S);
    if (n.id === 'captain' && st === 'camps') {
      const p = campProgress();
      return [{ s: 'captain', t: `지금까지 거점 {${p.cur}}곳을 무너뜨렸다. 남은 곳은 {${Math.max(0, p.max - p.cur)}}곳. 힘내라.` }];
    }
    if (n.id === 'sage' && st === 'reveal' && !S.flags.sageTalked) return S3.sageReveal(S);
    if (n.id === 'lakeKeeper' && st === 'mirwen' && !S.flags.naelTalked) return S3.naelTalk(S);
    if (n.id === 'forestChild' && st === 'elderwood' && !S.flags.momoTalked) return S3.momoTalk(S);
    if (n.id === 'trainer') { const k = (n.talks.t = (n.talks.t || 0) + 1) - 1; return S3.TRAINER_TALK[Math.min(k, S3.TRAINER_TALK.length - 1)].slice(); }
    // class change at the altar: a mentor of another class (after the choice)
    const mc = classOfMentor(n.id);
    if (mc && P()?.chosen && mc !== P()?.cls && STAGES.indexOf(st) > STAGES.indexOf('training') && P()?.changeClass) {
      const list = ambientFor(n, ph);
      const nodes = list[((n.talks[ph] = (n.talks[ph] || 0) + 1) - 1) % list.length].slice();
      nodes.push({ s: n.id, t: `${CLASS_DEFS[mc].nameKo}의 길이 궁금한가?`, ask: [
        { t: `${CLASS_DEFS[mc].nameKo}(으)로 직업 변경`, desc: '레벨과 경험치는 유지되고, 스킬 트리는 초기화됩니다. 원소의 제단에서만 가능합니다.', go: () => { S.pendingAction = () => changeClassAtAltar(game, mc); } },
        { t: '아니요, 지금의 길로 충분해요', go: [] },
      ] });
      return nodes;
    }
    const list = ambientFor(n, ph);
    const k = (n.talks[ph] = (n.talks[ph] || 0) + 1) - 1;
    const nodes = list[k % list.length].slice();
    if (n.id === 'merchant' && ph !== 'early' && !S.healedPhase[ph]) {
      S.healedPhase[ph] = true;
      nodes.push(() => { healFull(); audio('item_get', { volume: 0.6, pitch: 1.2 }); }, { s: 'narr', t: '향긋한 허브차의 온기가 온몸에 퍼진다. {생명력 · 마나 · 스태미나}가 모두 회복되었다.' });
    }
    return nodes;
  }
  function canTalk(n) {
    return !n.hidden && game.state === 'playing' && !game.enemies?.inCombat && !game.cinematic?.active && !D.active && D.unlockT <= 0 && !(game.input.isLocked?.('menu'));
  }
  function talk(n) {
    if (D.active || !n || n.hidden) return;
    startDialogue(dialogueFor(n), n);
  }
  function startDialogue(nodes, n) {
    D.active = true; D.npc = n; D.focus = n; D.queue = nodes.slice(); D.node = null; D.choices = null;
    D.inputDelay = 0.25; D.started = false; D.unlockT = 0;
    game.input.lock('dialogue');
    game.setState('dialogue');
    ui.setPrompt(null);
    ui.showDialogue(true);
    audio('dialogue_open');
    const Pp = game.player?.object?.position;
    if (Pp && n) {
      const dx = n.pos.x - Pp.x, dz = n.pos.z - Pp.z;
      const cx = game.camera.position.x - Pp.x, cz = game.camera.position.z - Pp.z;
      D.side = (dx * cz - dz * cx) > 0 ? -1 : 1;
    }
    ui.hideBark?.();
    events.emit('dialogueStart', { npc: n?.id });
    nextNode();
  }
  function nextNode() {
    for (let guard = 0; guard < 200; guard++) {
      const node = D.queue.shift();
      if (!node) { endDialogue(); return; }
      if (typeof node === 'function') {
        const r = node(S);
        if (Array.isArray(r)) D.queue.unshift(...r);
        continue;
      }
      showLine(node); return;
    }
    endDialogue();
  }
  function showLine(node) {
    D.node = node;
    const sp = SPEAKERS[node.s] || SPEAKERS.narr;
    const f = npcs[node.s];
    const pp = game.player?.object?.position;
    if (f && !f.hidden && (!pp || f.pos.distanceTo(pp) < 14)) D.focus = f;
    ui.setSpeaker(sp);
    const r = ui.setText(node.t || '');
    D.spans = r.spans; D.chars = r.chars; D.idx = 0; D.charT = 0.05; D.typing = true; D.choices = null;
    ui.clearChoices();
    ui.setHint('Space / F / 클릭 — 계속');
  }
  function finishTyping() {
    ui.reveal(D.spans, D.idx, D.chars.length); D.idx = D.chars.length; D.typing = false;
    if (D.node?.ask) openChoices(D.node.ask);
    else ui.setNext(true);
  }
  function openChoices(opts) {
    D.choices = opts; D.sel = 0;
    ui.showChoices(opts.map((o) => ({ t: o.t, color: o.element ? elColor(o.element, 'css') : null })),
      (i) => { if (D.choices && D.sel !== i) { D.sel = i; ui.selectChoice(i, D.choices[i].desc); audio('ui_select', { volume: 0.4 }); } },
      (i) => pickChoice(i));
    ui.selectChoice(0, opts[0].desc);
    ui.setHint(opts.length > 1 ? '↑↓ + Enter / 클릭 — 선택' : 'Enter — 선택');
    try { game.input.exitLock?.(); } catch (_) { /* */ }
  }
  function pickChoice(i) {
    if (!D.choices || i < 0 || i >= D.choices.length) return;
    const o = D.choices[i];
    D.choices = null; ui.clearChoices();
    audio('ui_click');
    if (!game.isTest) { try { game.input.requestLock?.(); } catch (_) { /* */ } }
    const go = typeof o.go === 'function' ? o.go(S) : o.go;
    if (Array.isArray(go)) D.queue.unshift(...go);
    D.inputDelay = 0.12;
    nextNode();
  }
  function endDialogue() {
    if (!D.active) return;
    const n = D.npc;
    D.active = false; D.node = null; D.choices = null; D.npc = null; D.focus = null;
    ui.showDialogue(false);
    if (game.state === 'dialogue') game.setState('playing');
    D.unlockT = 0.2;   // keep gameplay input locked a moment so the closing key doesn't jump / attack
    events.emit('dialogueEnd', { npc: n?.id });
    if (S.pendingAction) { const f = S.pendingAction; S.pendingAction = null; try { f(); } catch (err) { console.error('[story] action', err); } }
  }
  function updateDialogue(realDt) {
    const raw = game.input.raw;
    if (D.inputDelay > 0) D.inputDelay -= realDt;
    const ok = D.inputDelay <= 0;
    if (D.typing) {
      D.charT -= realDt;
      let blips = 0;
      while (D.charT <= 0 && D.idx < D.chars.length) {
        const ch = D.chars[D.idx];
        D.spans[D.idx].classList.add('on'); D.idx++;
        D.charT += CPS_DELAY * ('.!?…'.includes(ch) ? 7 : ch === ',' ? 4 : 1);
        if (ch !== ' ' && (D.idx & 1)) blips++;
      }
      if (blips) {
        const sp = SPEAKERS[D.node?.s] || SPEAKERS.narr;
        if (D.node?.s !== 'narr') audio('dialogue_blip', { volume: 0.32, pitch: sp.voice * (0.94 + Math.random() * 0.12) });
      }
      if (D.idx >= D.chars.length) finishTyping();
    }
    const adv = ok && (raw.pressed('Space') || raw.pressed('KeyF') || raw.pressed('Enter') || raw.pressed('NumpadEnter') || raw.mousePressed(0));
    if (D.choices) {
      if (!ok) return;
      const n = D.choices.length;
      let mv = 0;
      if (raw.pressed('ArrowUp') || raw.pressed('KeyW')) mv = -1;
      if (raw.pressed('ArrowDown') || raw.pressed('KeyS')) mv = 1;
      if (mv) { D.sel = (D.sel + mv + n) % n; ui.selectChoice(D.sel, D.choices[D.sel].desc); audio('ui_select', { volume: 0.4 }); }
      if (raw.pressed('Enter') || raw.pressed('NumpadEnter') || raw.pressed('Space') || raw.pressed('KeyF')) pickChoice(D.sel);
      return;
    }
    if (adv) {
      if (D.typing) finishTyping();
      else { audio('ui_click', { volume: 0.35, pitch: 1.4 }); nextNode(); }
    }
  }

  // dialogue camera: over-the-shoulder of the hero toward the current speaker
  const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _T = new THREE.Vector3(), _L = new THREE.Vector3(), _fw = new THREE.Vector3();
  function updateDialogueCamera(realDt) {
    const cam = game.camera, Pp = game.player?.object?.position, F = D.focus || D.npc;
    if (!Pp || !F) return;
    if (!D.started) {
      D.started = true; D.cam.copy(cam.position);
      cam.getWorldDirection(_fw); D.look.copy(cam.position).addScaledVector(_fw, 6);
    }
    _A.set(Pp.x, Pp.y + 1.45, Pp.z);
    _B.set(F.pos.x, F.pos.y + F.eyeH, F.pos.z);
    let dx = _B.x - _A.x, dz = _B.z - _A.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const px = -dz * D.side, pz = dx * D.side;
    const back = 2.4 + Math.min(1.2, l * 0.25);
    _T.set(_A.x - dx * back + px * 2.4, _A.y + 0.55 + Math.max(0, (_B.y - _A.y) * 0.3), _A.z - dz * back + pz * 2.4);
    try { W()?.resolveCollision?.(_T, 0.25); } catch (_) { /* */ }
    const gy = groundAt(_T.x, _T.z) + 0.45; if (_T.y < gy) _T.y = gy;
    _L.lerpVectors(_A, _B, 0.8); _L.y = _B.y - 0.15;
    const k = 1 - Math.exp(-4.2 * realDt), kl = 1 - Math.exp(-5.5 * realDt);
    D.cam.lerp(_T, k); D.look.lerp(_L, kl);
    cam.position.copy(D.cam); cam.lookAt(D.look);
    const fov = damp(cam.fov, 46, 4, realDt);
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  // ------------------------------------------------------------------------------------------- feather pickup
  const feather = (() => {
    const group = new THREE.Group(); group.name = 'windFeather'; group.visible = false;
    const vane = new THREE.SphereGeometry(1, 12, 8); vane.scale(0.16, 0.55, 0.035);
    vane.translate(0, 0.15, 0);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8fffc1).multiplyScalar(1.6), toneMapped: false });
    const m1 = new THREE.Mesh(vane, mat); m1.rotation.z = 0.35; group.add(m1);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.0, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    shaft.rotation.z = 0.35; shaft.position.y = 0.05; group.add(shaft);
    const pg = new THREE.CylinderGeometry(0.55, 0.9, 46, 16, 1, true); pg.translate(0, 23 - 1, 0);
    const pm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x8fffc1) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime; uniform vec3 uColor; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 1.6) * (0.55 + 0.25*sin(vUv.y*30.0 - uTime*3.0)); a *= smoothstep(0.0, 0.06, vUv.y); gl_FragColor = vec4(uColor * 1.4, a * 0.55); }',
    });
    const pillar = new THREE.Mesh(pg, pm); pillar.renderOrder = 5; pillar.frustumCulled = false;
    group.add(pillar);
    game.scene.add(group);
    return { group, spin: group.children[0], pillar, pm };
  })();
  let featherFx = null;
  function featherSpot() {
    const h = W()?.village?.tutorialHill;
    if (h) return new THREE.Vector3(h.x, h.y + 1.3, h.z);
    const p = W()?.playerSpawn || new THREE.Vector3();
    return new THREE.Vector3(p.x - 20, groundAt(p.x - 20, p.z) + 1.3, p.z);
  }
  function activateFeather() {
    S.featherActive = true;
    feather.group.position.copy(featherSpot());
    feather.group.visible = true;
  }

  // ------------------------------------------------------------------------------------------- objective & markers
  const objective = { title: '', desc: '', progress: null, marker: null };
  const prog = { cur: 0, max: 0 };
  const markers = [];
  const mk = Array.from({ length: 10 }, () => ({ position: null, kind: 'npc', label: '' }));
  let mi = 0;
  const _pt = Array.from({ length: 4 }, () => new THREE.Vector3());
  let pti = 0;
  const H = {
    add(position, kind, label) { if (!position || mi >= mk.length) return position || null; const m = mk[mi++]; m.position = position; m.kind = kind; m.label = label; markers.push(m); return position; },
    npc(id, q = '!') { const n = npcs[id]; if (!n || n.hidden) return null; n.mark = q; H.add(n.pos, 'npc', n.sp.name); return n.pos; },
    mark(pos) { if (pos) objective.marker = pos; return pos; },
    prog(cur, max) { prog.cur = cur; prog.max = max; objective.progress = prog; },
    point(x, z) { const v = _pt[pti++ % _pt.length]; return v.set(x, groundAt(x, z), z); },
    arena(id) { return arenaOf(id)?.position || null; },
    zone(id) { const zs = W()?.zones; const z = zs && (Array.isArray(zs) ? zs.find((q) => q.id === id) : zs[id]); return z?.center || null; },
    gate(id) { return (W()?.gates || []).find((g) => g.id === id)?.position || null; },
    shrine(id) { const sh = (W()?.shrines || []).find((x) => x.id === id); if (sh?.position) return sh.position; const f = NPC_FALLBACK.undina; return id === SHRINE_OF.water ? H.point(f.x, f.z) : null; },
    altar() { return W()?.village?.altar || null; },
    feather() { return feather.group.position; },
    mentorIds() { return MENTOR_IDS; },
    grove() { return grovePos(); },
    walls,
    wallPositions() { return (W()?.rotWalls || []).filter((w) => w.state === 'intact' && w.position).map((w) => w.position); },
    nearestWall() {
      const pp = game.player?.object?.position; let best = null, bd = Infinity;
      for (const w of W()?.rotWalls || []) { if (w.state !== 'intact' || !w.position) continue; const d = pp ? w.position.distanceToSquared(pp) : 0; if (d < bd) { bd = d; best = w.position; } }
      return best;
    },
    camps() { return campProgress(); },
    campMarkers() {
      if (!S.rowenTalked) { H.mark(H.npc('captain')); return; }
      const p = campProgress(); const pp = game.player?.object?.position;
      const list = p.camps || (W()?.camps || []).map((c) => ({ ...c, cleared: false }));
      let best = null, bd = Infinity;
      for (const c of list) {
        if (c.cleared || !c.position) continue;
        H.add(c.position, 'camp', c.name || (W()?.camps || []).find((w) => w.id === c.id)?.name || '마물 거점');
        const d = pp ? c.position.distanceToSquared(pp) : 0; if (d < bd) { bd = d; best = c; }
      }
      if (best) H.mark(best.position);
    },
    trainObjective() {
      const s = S.trainStep, mn = npcs[S.mentorId];
      if (s === 'done') return `${mn?.sp.name || '스승'}에게 돌아가기`;
      if (s === 'basic') H.prog(Math.min(TRAIN_BASIC_N, S.hits), TRAIN_BASIC_N);
      else if (s !== 'go') H.prog(TRAIN_STEPS.filter((x) => S.trainDone[x]).length, TRAIN_STEPS.length);
      return S3.trainingStepText(S.cls(), s, S.kit());
    },
    trainMarkers() {
      if (S.trainStep === 'done') { H.mark(H.npc(S.mentorId, '?')); return; }
      const T = W()?.village?.trainingGround || W()?.trainingArea;
      if (T) H.mark(H.add(T, 'quest', '수련장'));
    },
  };
  function refresh() {
    dirty = false;
    for (const n of npcList) n.mark = '';
    markers.length = 0; mi = 0;
    objective.progress = null; objective.marker = null;
    const q = QUEST_BY_ID[S.stage === 'rite' ? 'choose' : S.stage];
    objective.title = q?.title || '';
    objective.desc = '';
    if (q) {
      try { objective.desc = q.objective(S, game, H) || ''; } catch (err) { warnOnce('obj:' + q.id, '[story] objective', q.id, err); }
      try { q.markers(S, game, H); } catch (err) { warnOnce('mk:' + q.id, '[story] markers', q.id, err); }
    }
    for (const n of npcList) ui.setTagMark(n.tag, n.mark);
  }

  // ------------------------------------------------------------------------------------------- interact offers (F)
  function josaLabel(n) { return `${n.sp.name}${wa(n.sp.name)} 대화하기`; }
  function registerOffers() {
    const I = game.interact;
    if (!I?.offer) return false;
    for (const n of npcList) {
      try {
        I.offer('npc:' + n.id, { pos: n.pos, r: TALK_R, label: josaLabel(n), priority: 0, enabled: () => canTalk(n) && n.dist < TALK_R && Math.abs((game.player?.object?.position?.y ?? n.pos.y) - n.pos.y) < 2.2, onUse: () => talk(n) });
      } catch (err) { warnOnce('offer', '[story] interact.offer', err); return false; }
    }
    return true;
  }
  let offersOk = false;
  const ownPrompt = () => !offersOk || !game.ui || game.stubbed?.includes?.('ui');

  // ------------------------------------------------------------------------------------------- per-frame NPC animation & tags
  const _proj = new THREE.Vector3();
  let t = 0, promptNpc = null, proxT = 0, proxCd = 0;
  const proxBarked = {};
  function updateNpcs(realDt) {
    const cam = game.camera, Pp = game.player?.object?.position;
    const dd = game.settings?.values?.drawDistance ?? 0.8;
    const visR = 55 + 60 * dd;
    const playing = game.state === 'playing';
    const showTags = playing && !game.cinematic?.active;
    const hw = innerWidth * 0.5, hh = innerHeight * 0.5;
    let best = null, bd = TALK_R;
    for (const n of npcList) {
      if (n.hidden) continue;
      const p = n.pos;
      n.camDist = cam.position.distanceTo(p);
      const dx = Pp ? Pp.x - p.x : 99, dz = Pp ? Pp.z - p.z : 99;
      n.dist = Math.hypot(dx, dz);
      const vis = n.camDist < visR;
      if (vis !== n.visible) { n.root.visible = vis; n.visible = vis; }
      if (!vis) { ui.hideTag(n.tag); continue; }
      const ol = n.camDist < 34;
      if (ol !== n.outlinesOn) { for (const o of n.model.outlines) o.visible = ol; n.outlinesOn = ol; }
      const inDlg = D.active && (D.npc === n || D.focus === n || (D.npc && n.dist < 7 && SPEAKERS[D.node?.s] === n.sp));
      const toP = Math.atan2(dx, dz);
      let targetYaw = n.baseYaw;
      if (inDlg || (n.dist < 3.4 && Pp && !n.walking)) targetYaw = toP;
      else if (n.dist < 6 && !n.walking) targetYaw = n.yaw;
      n.yaw = dampAngle(n.yaw, targetYaw, inDlg ? 6 : n.walking ? 8 : 2.5, realDt);
      n.root.rotation.y = n.yaw;
      if (n.camDist < 60) {
        let hy = 0, hp = 0;
        if (Pp && (n.dist < 9 || inDlg)) {
          hy = clamp(angleDiff(n.yaw, toP), -1.1, 1.1);
          hp = clamp(-Math.atan2(Pp.y + 1.5 - (p.y + n.eyeH), Math.max(0.5, n.dist)) * 0.7, -0.45, 0.35);
        } else {
          hy = Math.sin(t * 0.37 + n.phase) * 0.35; hp = Math.sin(t * 0.23 + n.phase * 2) * 0.06;
        }
        n.headYaw = damp(n.headYaw, hy, 5, realDt); n.headPitch = damp(n.headPitch, hp, 5, realDt);
        const speaking = D.active && D.typing && SPEAKERS[D.node?.s] === n.sp;
        const m = n.model;
        m.headPivot.rotation.set(n.headPitch + (speaking ? Math.sin(t * 13) * 0.045 : 0), n.headYaw, Math.sin(t * 0.9 + n.phase) * 0.04);
        const br = Math.sin(t * 2.1 + n.phase);
        m.bodyPivot.scale.set(1 + br * 0.008, 1 + br * 0.014, 1 + br * 0.008);
        // merged NPCs turn the whole body a little toward the speaker instead of the head
        m.bodyPivot.rotation.y = m.info.merged ? n.headYaw * 0.35 : 0;
        m.bodyPivot.rotation.z = Math.sin(t * 0.8 + n.phase) * 0.018 + (speaking ? Math.sin(t * 5) * 0.012 : 0);
        if (m.info.hop) {
          const excite = n.walking || n.mark || (n.dist < 6 && S.stage !== 'boss');
          n.hop = excite ? Math.max(0, Math.sin(t * (n.walking ? 11 : 6.5))) * (n.walking ? 0.1 : 0.07) : damp(n.hop, 0, 8, realDt);
          m.bodyPivot.position.y = n.hop;
        } else if (n.spirit) {
          m.bodyPivot.position.y = 0.25 + Math.sin(t * 1.6 + n.phase) * 0.12;   // spirits hover
        }
        if (m.glow && m.info.orb) m.glow.position.set(Math.cos(t * 1.3) * 0.55, 1.35 + Math.sin(t * 2.2) * 0.08, Math.sin(t * 1.3) * 0.55 + 0.05);
      }
      if (playing && Pp && n.dist < bd && Math.abs(Pp.y - p.y) < 2.2) { bd = n.dist; best = n; }
      if (!showTags || n.camDist > 120) { ui.hideTag(n.tag); continue; }
      const nameOp = 1 - smoothstep(10, 17, n.camDist);
      const op = Math.max(nameOp, n.mark ? 1 - smoothstep(90, 115, n.camDist) : 0);
      if (op < 0.02) { ui.hideTag(n.tag); continue; }
      _proj.set(p.x, p.y + n.tagH + (n.hop || 0), p.z).project(cam);
      if (_proj.z > 1 || _proj.x < -1.15 || _proj.x > 1.15 || _proj.y < -1.2 || _proj.y > 1.2) { ui.hideTag(n.tag); continue; }
      ui.placeTag(n.tag, (_proj.x + 1) * hw, (1 - _proj.y) * hh, op, nameOp);
    }
    const fighting = !!game.enemies?.inCombat;
    promptNpc = best && canTalk(best) ? best : null;
    if (fighting && best && best.dist < 3 && playing && t - (S._fightBarkT || -99) > 8) { S._fightBarkT = t; bark(best.id, '지금은 싸움 중이야! 먼저 마물부터!', 2.6); }
    ui.setPrompt(promptNpc && ownPrompt() ? promptNpc.sp.name : null);
  }

  // ------------------------------------------------------------------------------------------- reaction trainer (P1)
  // The 반응 수련 허수아비 in the village (DESIGN §5.6): a training dummy that cycles element auras every few seconds,
  // so the ui's "다음 타격" hint has something to show. Spawned lazily near the spot (never in tests unless forced).
  const RT = { d: null, t: 0, i: 0, chk: 0, forced: false };
  const RT_ELS = ALL_ELEMENTS_WITH_STATUS();
  function updateReactionTrainer(realDt) {
    if (game.isTest && !RT.forced) return;
    RT.chk -= realDt;
    if (RT.chk > 0) return;
    RT.chk = 1;
    const spot = W()?.village?.reactionDummy, pp = game.player?.object?.position;
    const sp = spot?.position || spot;
    if (!sp?.isVector3 || !pp) return;
    if (!RT.d || RT.d.alive === false) {
      if (Math.hypot(pp.x - sp.x, pp.z - sp.z) > 40) return;
      let d = null;
      try { d = game.debug?.spawnDummy?.(sp.clone(), { hp: 1e6 }) || game.enemies?.spawn?.('dummy', sp.clone(), {}) || null; } catch (_) { d = null; }
      if (!d) return;
      d.xpValue = 0; d.isReactionTrainer = true; d.name = '반응 수련 허수아비';
      RT.d = d; RT.t = 0;
    }
    RT.t -= 1;
    if (RT.t <= 0 && RT_ELS.length) {
      RT.t = 5;
      const el = RT_ELS[RT.i++ % RT_ELS.length];
      try { game.combat?.applyStatus?.(RT.d, ELEMENT_DEFS[el].status, 5.5, { source: 'trainer' }); } catch (_) { /* */ }
    }
  }

  // ------------------------------------------------------------------------------------------- update
  let practiceT = 0, slowT = 0, arenaT = 0, defendHold = 0;
  function update(dt, realDt) {
    realDt = Math.min(realDt || 0, 0.1);
    t += realDt;
    for (let i = timers.length - 1; i >= 0; i--) { const j = timers[i]; j.t -= realDt; if (j.t <= 0) { timers.splice(i, 1); try { j.fn(); } catch (err) { console.error('[story] timer', err); } } }
    if (D.unlockT > 0) { D.unlockT -= realDt; if (D.unlockT <= 0) game.input.unlock('dialogue'); }
    if (game.state === 'dialogue' && D.active) { updateDialogue(realDt); if (D.active) updateDialogueCamera(realDt); }
    else if (D.active && game.state !== 'dialogue') endDialogue();
    updateEscort(realDt);
    updateNpcs(realDt);
    ui.update(realDt);

    if (feather.group.visible) {
      feather.spin.rotation.y += realDt * 1.6; feather.group.children[1].rotation.y = feather.spin.rotation.y;
      feather.spin.position.y = Math.sin(t * 2) * 0.15; feather.group.children[1].position.y = 0.05 + feather.spin.position.y;
      feather.pm.uniforms.uTime.value = t;
      const Pp = game.player?.object?.position;
      const near = Pp && Pp.distanceTo(feather.group.position) < 60;
      if (near && !featherFx && game.vfx?.emitter) {
        try { featherFx = game.vfx.emitter({ follow: feather.spin, rate: 10, count: 1, color: [0x8fffc1, 0xffffff], speed: 0.6, spread: 1, size: 0.18, life: 1.4, gravity: -0.6, shape: 'soft' }); } catch (_) { featherFx = null; }
      } else if (!near && featherFx) { featherFx.stop?.(); featherFx = null; }
      if (game.state === 'playing' && S.featherActive && Pp) {
        const fp = feather.group.position;
        const dx = Pp.x - fp.x, dz = Pp.z - fp.z, dy = Pp.y + 0.9 - fp.y;
        if (dx * dx + dz * dz < 1.8 * 1.8 && Math.abs(dy) < 2.0) collectFeather();
      }
    }

    if (game.state !== 'playing') { if (dirty) refresh(); return; }
    if (heldBark && !D.active && !game.cinematic?.active) { const b = heldBark; heldBark = null; bark(...b); }
    const Pp = game.player?.object?.position;
    updateReactionTrainer(realDt);

    // interact fallback (no game.interact): F talks to the nearest NPC
    if (!offersOk && promptNpc && game.input.raw.pressed('KeyF')) talk(promptNpc);

    // training: arrive / practice attacks for the defend step
    if (S.stage === 'training' && Pp) {
      const T = W()?.village?.trainingGround || W()?.trainingArea;
      if (S.trainStep === 'go') {
        if (!T || Math.hypot(Pp.x - T.x, Pp.z - T.z) < (W()?.trainingRadius || 8.5) + 5) {
          setTrainStep(nextTrainStep() || 'done', false);
        }
      } else if (S.trainStep === 'defend' && !S.trainDone.defend) {
        const Pl = game.player;
        if (Pl?.blocking || Pl?.defending || Pl?.guarding) { defendHold += realDt; if (defendHold > 1.2) markTrain('defend'); }
        practiceT -= realDt;
        if (practiceT <= 0) {
          let r = null;
          if (!T || Math.hypot(Pp.x - T.x, Pp.z - T.z) < 22) { try { r = game.enemies?.practiceAttack?.(game.player.entity); } catch (_) { r = null; } }
          practiceT = r ? (r.eta || 1.2) + 2.4 : 1.2;
        }
      }
    }
    // 4 Hz checks: camps, region choice, the Mirwen shrine, the escort, the ascent, boss triggers
    slowT -= realDt;
    if (slowT <= 0) {
      slowT = 0.25;
      if (S.stage === 'camps') { checkCamps(); dirty = true; }
      regionCheck(); mirwenCheck(); escortCheck(); ascentCheck(); bossTriggerCheck();
      if (S.stage === 'elderwood' || S.stage === 'ascent') dirty = true;
    }
    // golem arena banner
    if ((S.stage === 'boss' || S.stage === 'camps') && !S.arenaBanner && Pp) {
      arenaT -= realDt;
      if (arenaT <= 0) {
        arenaT = 0.25;
        const A = W()?.bossArena;
        if (A?.position && Math.hypot(Pp.x - A.position.x, Pp.z - A.position.z) < (A.radius || 20) + 6) {
          S.arenaBanner = true;
          ui.banner('봉인의 유적', S.stage === 'boss' ? '안개에 잠식된 수문장 — 고대 바위 골렘' : '천 년의 봉인이 잠든 곳');
          audio('cinematic_whoosh');
        }
      }
    }
    // villagers greet when passing by (once per phase)
    proxT -= realDt; if (proxCd > 0) proxCd -= realDt;
    if (proxT <= 0 && proxCd <= 0 && Pp) {
      proxT = 0.5;
      const ph = PHASE_OF[S.stage] || 'early';
      for (const id of ['villagerA', 'villagerB', 'villagerC', 'merchant']) {
        const n = npcs[id]; if (!n || n.dist > 5 || proxBarked[id + ph]) continue;
        proxBarked[id + ph] = true; proxCd = 25;
        const line = ambientFor(n, ph)?.[0]?.[0]?.t;
        if (line) bark(id, line);
        break;
      }
    }
    if (dirty) refresh();
  }

  // ------------------------------------------------------------------------------------------- events
  function init() {
    offersOk = registerOffers();
    try { trials.register(); } catch (err) { warnOnce('trials', '[story] trials', err); }
    // training: one skillCast per cast (spellCast only while skills is stubbed)
    events.on('skillCast', (p) => {
      if (S.stage !== 'training') return;
      S.sawSkillCast = true;
      const def = game.skills?.defs?.get?.(p?.id);
      onTrainCast(SLOT_KIND[def?.slot] || SLOT_KIND[p?.slot] || null);
    });
    events.on('spellCast', (p) => {
      if (S.stage !== 'training' || (game.skills && !game.skills.isStub)) return;
      onTrainCast(p?.kind === 'heavy' ? 'charged' : p?.kind === 'basic' ? 'basic' : (p?.kind === 'ultimate' || p?.kind === 'skill') ? 'quick' : null);
    });
    // legacy melee swings that never reach the skills runtime still count as basic hits
    let lastHitT = -1;
    events.on('damage', (p) => {
      if (S.stage !== 'training' || S.sawSkillCast || !p?.target?.isDummy || p.isPlayer) return;
      if (p.dot || p.tick || p.tags?.includes?.('dot')) return;
      if (game.realTime - lastHitT < 0.07) return;
      lastHitT = game.realTime; onTrainCast('basic');
    });
    const onDefend = (p) => {
      const pe = game.player?.entity;
      if (p?.target && pe && p.target !== pe && p.target.team !== 'player') return;
      markTrain('defend');
    };
    for (const ev of ['blocked', 'parry', 'counterStance', 'counter', 'focusStart', 'wardBreak', 'wardHit']) events.on(ev, onDefend);
    for (const ev of ['dodge', 'blink', 'dash', 'perfectDodge']) events.on(ev, () => markTrain('dodge'));
    // learn + slot: skills auto-equips a fresh active into an empty slot (often before this listener runs), so a learned
    // node whose skill is already in the loadout completes the step too
    const slotted = (nodeId) => {
      const L = game.skills?.loadout; if (!L) return false;
      const g = P()?.node?.(nodeId)?.grants || [];
      for (const k in L) if (L[k] && g.includes(L[k])) return true;
      return false;
    };
    events.on('skillLearned', (p) => {
      if (S.stage !== 'training') return;
      S.flags.learnedNode = true;
      if (!game.skills || game.skills.isStub) { markTrain('learn'); return; }
      if (slotted(p?.id)) markTrain('learn');
      else after(0.05, () => { if (slotted(p?.id)) markTrain('learn'); });
    });
    events.on('loadoutChanged', (p) => { if (S.stage === 'training' && S.flags.learnedNode && p?.id) markTrain('learn'); });
    events.on('updraftEnter', () => {
      if (S.stage === 'updraft' && S.featherActive && !S.flags.updraftBark) { S.flags.updraftBark = true; bark('child', '지금이에요! {스페이스를 꾹} 눌러서 활공해요! 슈우웅!'); }
    });
    events.on('campCleared', (p) => {
      dirty = true;
      const idx = (p?.index ?? 0), total = p?.total ?? 3;
      const cleared = campProgress().cur;
      const lines = S.stage === 'camps'
        ? ['첫 번째 거점이 무너졌다는 소식이다! 좋아, 그 기세다!', '두 번째 거점도! 마을 사람들이 환호하고 있다.', '세 곳 모두…! 북쪽을 봐라, 안개가 유적으로 몰려들고 있다. {봉인의 유적}이 깨어난다!']
        : ['벌써 거점 하나를 무너뜨렸다고? 수련도 끝나기 전에…! 대단하군.', '두 번째 거점까지! 수련은 나중에 마저 해도 되겠어.', '세 곳 모두…! 북쪽을 봐라, 안개가 유적으로 몰려들고 있다. {봉인의 유적}이 깨어난다!'];
      if (S.stage === 'camps' || S.stage === 'updraft' || S.stage === 'training') {
        const k = cleared >= total ? 2 : Math.min(1, Math.max(0, cleared - 1));
        bark('captain', lines[k] ?? lines[Math.min(2, idx)], 6);
      }
      if (S.stage === 'camps') checkCamps();
    });
    // bosses: filtered by id (CONTRACT §17)
    events.on('bossSpawn', (p) => {
      if (p?.id !== 'golem' && p?.boss?.bossId !== 'golem') return;
      if (S.stage === 'updraft' || S.stage === 'training') finishEarlyStages();
      if (S.stage === 'camps') advance('camps');
    });
    events.on('bossDefeated', (p) => onBossDefeated(p));
    events.on('classChosen', () => { dirty = true; });
    events.on('rotWallCleared', (p) => {
      if (S.stage !== 'elderwood') return;
      dirty = true;
      const w = walls();
      bark('forestChild', w.cur >= w.max ? S3.MOMO_BARKS.allWalls : S3.MOMO_BARKS.wall, 3.2);
    });
    const onShrine = (p) => { if (p?.id === SHRINE_OF.water) reachUndina(); };
    events.on('shrineFound', onShrine);
    events.on('shrineUse', onShrine);
    events.on('zoneEnter', (p) => { if (S.stage === 'reveal' && S.flags.sageTalked && REGIONS[p?.zoneId]) pickRegion(p.zoneId); });
    events.on('gateTravel', (p) => {
      if (S.stage !== 'reveal' || !S.flags.sageTalked) return;
      const g = (W()?.gates || []).find((x) => x.id === p?.to);
      if (g && REGIONS[g.zoneId]) pickRegion(g.zoneId);
    });
    events.on('stateChange', (p) => {
      if (p?.state !== 'dialogue' && D.active && p?.prev === 'dialogue') endDialogue();
      if (p?.state !== 'playing' && p?.state !== 'dialogue') ui.setPrompt(null);
      ui.setVisible(p?.state === 'playing' || p?.state === 'dialogue' || p?.state === 'cutscene');
      if (p?.prev === 'victory' && p?.state === 'playing' && S.stage === 'ending') continueEpilogue();
    });
  }

  // ------------------------------------------------------------------------------------------- public API
  function resetAll() {
    for (const k of Object.keys(S.flags)) delete S.flags[k];
    S.temp = {}; S.trainStep = null; S.trainDone = {}; S.hits = 0; S.timoTalked = false; S.featherGot = false;
    try { game.stats?.clear?.('story:feather'); } catch (_) { /* */ }
    if (S.introHandle) { const h = S.introHandle; S.introHandle = null; try { h.stop(); } catch (_) { /* */ } }
    S.noBoss = {};
    S.regionOrder.length = 0; S.ascentStep = 0; S.escort = false; S.bossStarting = null; S.victoryEmitted = false; S.sawSkillCast = false;
    heldBark = null;
    S.rowenTalked = false; S.arenaBanner = false; S.mentorId = null; S.pendingAction = null; S.healedPhase = {};
    if (S.featherActive) { S.featherActive = false; feather.group.visible = false; featherFx?.stop?.(); featherFx = null; }
    for (const n of npcList) {
      n.walking = false;
      if (SPIRIT_NPCS.includes(n.id)) setNpcHidden(n.id, true);
      if (n.pos.distanceToSquared(n.homePos) > 0.01) moveNpc(n, n.homePos, n.homeYaw);
      n.talks = {};
    }
    for (const k of Object.keys(proxBarked)) delete proxBarked[k];
    timers.length = 0;
  }
  /** Apply the world/progression state that every stage before `stage` would have produced (debugSkip, deserialize). */
  function applyPriorState(stage, { progression = true } = {}) {
    const idx = STAGES.indexOf(stage);
    const Pr = P();
    const done = new Set(stagesBefore(stage, S.regionOrder));
    if (idx >= 2) {
      if (!Pr?.chosen) { try { Pr?.setClass?.('mage'); } catch (_) { /* */ } }
      S.mentorId = mentorOf(Pr?.cls);
      S.flags.metMentors = true;
    }
    if (idx >= 3) { for (const st of TRAIN_STEPS) S.trainDone[st] = true; S.trainStep = 'done'; relocateMentor(); }
    if (idx >= 4) { S.timoTalked = true; if (!S.featherGot) collectFeather(true); }
    if (idx >= 5) S.rowenTalked = true;
    if (done.has('reveal')) S.flags.sageTalked = true;
    if (idx >= STAGES.indexOf('reveal')) gatherRevealNpcs();
    if (done.has('mirwen') || stage === 'hydra') S.flags.naelTalked = true;
    if (done.has('elderwood') || stage === 'nox' || stage === 'treant') {
      S.flags.momoTalked = true; S.flags.escortDone = true;
      const m = npcs.forestChild; if (m) { const g = grovePos(); moveNpc(m, new THREE.Vector3(g.x + 1.5, 0, g.z + 1.5), m.homeYaw); }
      try { if (W()?.setRotWalls && walls().cur < walls().max) W().setRotWalls('burned'); } catch (_) { /* */ }
    }
    if (done.has('ascent')) S.ascentStep = ASCENT_STEPS.length;
    for (const st of done) {
      const b = BOSS_OF_STAGE[st];
      if (!b) continue;
      const el = SPIRIT_OF_BOSS[b];
      if (progression) {
        try { Pr?.addPoints?.(1, b); } catch (_) { /* */ }
        if (b === 'golem') { try { Pr?.breakSeals?.(); } catch (_) { /* */ } }
        if (el) { try { Pr?.freeSpirit?.(el); } catch (_) { /* */ } }
      }
      if (el) revealSpirit(el);
    }
    if (progression && Pr?.setLevel) {
      const reg = REGION_OF[stage];
      let min = 0;
      if (reg) min = S.regionOrder.indexOf(reg) > 0 ? MIN_LEVEL.second : MIN_LEVEL.first;
      else if (stage === 'ascent' || stage === 'kalis') min = MIN_LEVEL.ascent;
      else if (stage === 'final' || stage === 'ending' || stage === 'done') min = MIN_LEVEL.final;
      if (min && (Pr.level || 1) < min) Pr.setLevel(min);
    }
  }
  /** Teleport the player for a skipped stage (zone entrance / arena edge). */
  function stageTeleport(stage) {
    const D2 = game.debug, w = W();
    const tpArena = (id, k = 0.55) => {
      const A = arenaOf(id); if (!A?.position) return;
      const vx = A.position.x, vz = A.position.z, r = (A.radius || 18) * k;
      const pp = game.player?.object?.position; if (!pp) return;
      const ang = Math.atan2(-(vx), -(vz)) || 0;   // toward the world origin side
      const x = vx + Math.sin(ang) * r, z = vz + Math.cos(ang) * r;
      pp.set(x, groundAt(x, z) + 0.05, z);
      game.player?.entity?.velocity?.set?.(0, 0, 0);
    };
    try {
      switch (stage) {
        case 'mirwen': D2?.tp?.('gate_mirwen') || D2?.tp?.('mirwen'); break;
        case 'elderwood': D2?.tp?.('gate_elderwood') || D2?.tp?.('elderwood'); break;
        case 'ascent': D2?.tp?.('gate_ruins'); break;
        case 'hydra': case 'nox': case 'treant': case 'kalis': case 'final': tpArena(BOSS_OF_STAGE[stage]); break;
        default: break;
      }
    } catch (err) { warnOnce('tp', '[story] stage teleport', err); }
    void w;
  }
  /** Spawn the act boss of a skipped boss stage: prewarm behind a fade (instant in test mode). */
  function debugSpawnBoss(id) {
    const E = game.enemies;
    if (!E?.spawnBoss || liveBoss(id)) return null;
    if (game.isTest || E.isPrewarmed?.(id)) return spawnAct(id);
    const ov = game.cinematic?.overlay;
    try { ov?.fade?.(1, 0.25); } catch (_) { /* */ }
    return Promise.resolve(E.prewarmBoss?.(id)).catch(() => {}).then(() => { const e = spawnAct(id); try { ov?.fade?.(0, 0.6); } catch (_) { /* */ } return e; });
  }

  buildNpcs();
  ui.setVisible(game.state === 'playing' || game.state === 'dialogue');
  const api = {
    get stage() { return S.stage; },
    get trainStep() { return S.trainStep; },
    get dialogueActive() { return D.active; },
    get regionOrder() { return S.regionOrder; },
    get ascentStep() { return S.ascentStep; },
    get victoryEmitted() { return S.victoryEmitted; },
    /** Story cinematics on/off (default: on in play, off in ?test unless &cine=1). */
    get autoCinematics() { return autoCine; }, set autoCinematics(v) { autoCine = !!v; },
    QUESTS, STAGES,
    npcs,
    init,
    update,
    /** New game: story starts at the beginning (wake). */
    begin() {
      if (D.active) endDialogue();
      resetAll();
      startQuest('wake');
      after(1.6, () => { if (S.stage === 'wake') bark('elder', '얘야, 일어났니? 우물가로 좀 와 보거라.'); });
    },
    /**
     * Jump to any stage, silently completing the earlier ones (CONTRACT §17): class default, breakSeals / freeSpirit /
     * points / level per stage, the zone teleport, and the act boss (prewarmed behind a fade) for boss stages.
     * opts: {silent=true, order:['elderwood','mirwen'] (region order), second:true (the stage's region is played second)}.
     */
    debugSkip(stage, opts = {}) {
      const idx = STAGES.indexOf(stage); if (idx < 0) return false;
      if (D.active) endDialogue();
      if (game.cinematic?.active) { try { game.cinematic.stop(); } catch (_) { /* */ } }
      { const b = game.enemies?.boss, want = BOSS_OF_STAGE[stage]; if (b && b.alive !== false && !b.defeated && (b.bossId || b.id) !== want) { try { game.enemies.despawnBoss?.(); } catch (_) { /* */ } } }
      const wasSilent = silent;
      silent = opts.silent !== false;
      let ret = true;
      try {
        resetAll();
        const reg = REGION_OF[stage];
        if (Array.isArray(opts.order) && opts.order.length) S.regionOrder.push(...opts.order.filter((r) => REGIONS[r]));
        else if (reg) S.regionOrder.push(...(opts.second ? [REGIONS.mirwen === REGIONS[reg] ? 'elderwood' : 'mirwen', reg] : [reg]));
        else if (idx > STAGES.indexOf('treant')) S.regionOrder.push('mirwen', 'elderwood');
        applyPriorState(stage);
        S.stage = stage; dirty = true;
        try { W()?.setActVisible?.(ACT_OF[stage] || 1); } catch (_) { /* */ }
        if (stage === 'training') startTraining();
        if (stage === 'updraft') S.timoTalked = false;
        if (stage === 'camps') S.rowenTalked = true;
        stageTeleport(stage);
        const boss = BOSS_OF_STAGE[stage];
        if (boss && boss !== 'golem') ret = debugSpawnBoss(boss) || true;
        else if (stage === 'boss') { try { if (!liveBoss('golem')) game.enemies?.spawnBoss?.('golem'); } catch (_) { /* */ } }
        if (stage === 'ending') { S.stage = 'ending'; }
      } finally { silent = wasSilent; }
      timers.length = 0;
      dirty = true; refresh();
      if (stage === 'ending') startEnding();
      return ret;
    },
    /** Test / tool helper: complete the current stage's non-boss objective (reach / talk / escort / ascent steps). */
    debugComplete() {
      const st = S.stage, q = QUEST_BY_ID[st]; if (!q) return false;
      switch (st) {
        case 'wake': advance('wake'); break;
        case 'choose': classPicked(P()?.cls || 'mage'); break;
        case 'training': for (const s of TRAIN_STEPS) S.trainDone[s] = true; S.trainStep = 'done'; advance('training'); break;
        case 'updraft': S.timoTalked = true; if (!S.featherGot) collectFeather(true); advance('updraft'); break;
        case 'camps': S.rowenTalked = true; advance('camps'); break;
        case 'reveal': S.flags.sageTalked = true; pickRegion(opts0(S.flags.prefer)); break;
        case 'mirwen': S.flags.naelTalked = true; reachUndina(); break;
        case 'elderwood': S.flags.momoTalked = true; S.flags.escortDone = true; S.escort = false; advance('elderwood'); break;
        case 'ascent': S.ascentStep = ASCENT_STEPS.length; advance('ascent'); break;
        default: if (q.kind === 'boss') { const b = q.boss; if (!liveBoss(b)) { const r = debugSpawnBoss(b); return r || false; } return true; } return false;
      }
      return true;
    },
    /** Start the current boss stage's fight now (intro + spawn), as when walking into the arena. */
    startBossFight(o) { const q = QUEST_BY_ID[S.stage]; if (q?.kind === 'boss') { startBossFight(q.boss, o); return true; } return false; },
    pickRegion,
    continueEpilogue,
    currentBossId() { const q = QUEST_BY_ID[S.stage]; return q?.kind === 'boss' ? q.boss : null; },
    /** Post-game 정령 시련 (story/trials.js): start(id), cleared(), active. */
    trials,
    serialize() {
      const flags = {};
      for (const k in S.flags) if (typeof S.flags[k] !== 'function' && k !== 'endingPlaying') flags[k] = S.flags[k];
      let tips = null; try { tips = game.ui?.serializeTips?.() ?? null; } catch (_) { /* */ }
      return {
        v: 3, stage: S.stage === 'rite' ? 'choose' : S.stage, regionOrder: S.regionOrder.slice(), flags,
        trainDone: { ...S.trainDone }, trainStep: S.trainStep, hits: S.hits, ascentStep: S.ascentStep,
        timoTalked: S.timoTalked, featherGot: S.featherGot, rowenTalked: S.rowenTalked, mentorId: S.mentorId,
        victoryEmitted: S.victoryEmitted, tips,
      };
    },
    deserialize(o) {
      if (!o || !STAGES.includes(o.stage)) return false;
      if (D.active) endDialogue();
      const wasSilent = silent; silent = true;
      try {
        resetAll();
        S.regionOrder.push(...(o.regionOrder || []).filter((r) => REGIONS[r]));
        applyPriorState(o.stage, { progression: false });
        Object.assign(S.flags, o.flags || {});
        Object.assign(S.trainDone, o.trainDone || {});
        S.hits = o.hits || 0; S.ascentStep = o.ascentStep || 0;
        S.timoTalked = !!o.timoTalked; S.rowenTalked = !!o.rowenTalked; S.victoryEmitted = !!o.victoryEmitted;
        if (o.featherGot && !S.featherGot) collectFeather(true);
        if (o.mentorId) S.mentorId = o.mentorId;
        S.stage = o.stage;
        if (S.stage === 'training') { S.trainStep = o.trainStep || 'go'; if (S.trainStep !== 'go') relocateMentor(); }
        if (S.stage === 'updraft' && S.timoTalked && !S.featherGot) activateFeather();
        if (S.stage === 'elderwood' && S.flags.momoTalked && !S.flags.escortDone) { S.escort = true; retireCollider(npcs.forestChild || {}); }
        try { W()?.setActVisible?.(ACT_OF[S.stage] || 1); } catch (_) { /* */ }
      } finally { silent = wasSilent; }
      try { if (o.tips) game.ui?.deserializeTips?.(o.tips); } catch (_) { /* */ }
      timers.length = 0; dirty = true; refresh();
      return true;
    },
    getObjective() {
      if (!S.stage) return null;
      if (dirty) refresh();
      return objective;
    },
    getMarkers() { if (dirty) refresh(); return markers; },
    /** Shim (CONTRACT §3.3): any interact offer is current. */
    hasPrompt() { return game.interact?.current ? !!game.interact.current() : (!!promptNpc && game.state === 'playing'); },
    /** Start talking to an NPC by id (tests / scripted). */
    talkTo(id) { const n = npcs[id]; if (n && !n.hidden && game.state === 'playing') talk(n); return !!n && !n.hidden; },
    advance() { if (!D.active) return false; if (D.typing) finishTyping(); else if (!D.choices) nextNode(); return true; },
    choose(i) { if (D.choices) { pickChoice(i); return true; } return false; },
    getDialogueState() {
      return D.active ? { npc: D.npc?.id, speaker: D.node?.s, text: D.node?.t, typing: D.typing, choices: D.choices?.map((c) => c.t) || null } : null;
    },
    bark(id, text, sec) { bark(id, text, sec); },
    banner(title, sub) { ui.banner(title, sub); },
    /** Spawn the village reaction trainer now (tests; it spawns by itself near the spot in normal play). */
    spawnReactionTrainer() { RT.forced = true; RT.chk = 0; updateReactionTrainer(1); return RT.d; },
    get reactionTrainer() { return RT.d; },
    /** Stage title table (Korean). */
    titles: TITLES,
  };
  function opts0(pref) { return REGIONS[pref] ? pref : 'mirwen'; }
  return api;
}
