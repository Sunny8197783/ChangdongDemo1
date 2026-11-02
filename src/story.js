// Story module: NPCs of 바람결 마을, dialogue system, quest chain (wake → choose → training → updraft → camps → boss →
// ending), objective & compass markers. game.story. Helper files in src/story/*.
import * as THREE from 'three';
import { buildNpcModel } from './story/npcs.js';
import { createStoryUI } from './story/ui.js';
import * as SC from './story/script.js';
import { clamp, damp, dampAngle, angleDiff, smoothstep, ELEMENT_COLORS } from './core/utils.js';

const STAGES = ['wake', 'choose', 'training', 'updraft', 'camps', 'boss', 'ending'];
const TITLES = { wake: '깨어난 각인', choose: '두 스승', training: '첫 수련', updraft: '바람의 깃털', camps: '평원의 그림자', boss: '봉인의 유적', ending: '에테리아의 수호자' };
const NPC_IDS = ['elder', 'mageMentor', 'swordMentor', 'captain', 'merchant', 'child', 'villagerA', 'villagerB', 'villagerC'];
const TRAIN_STEPS = ['basic', 'heavy', 'ultimate', 'block', 'dash'];
const PHASE_OF = { wake: 'early', choose: 'early', training: 'training', updraft: 'updraft', camps: 'camps', boss: 'boss', ending: 'done', done: 'done' };
const TALK_R = 3.0;
const PRAISE = { mage: ['좋아!', '멋져!', '바로 그거야!', '완벽해!'], sword: ['좋다.', '그거다.', '나쁘지 않군.', '됐다.'] };
const CPS_DELAY = 1 / 46;   // typewriter seconds per char

export function createStory(game) {
  const { events } = game;
  const W = () => game.world;
  const groundAt = (x, z) => { const w = W(); return (w?.getGroundHeight || w?.getHeight)?.call(w, x, z) ?? 0; };
  const ui = createStoryUI(game);
  const audio = (n, o) => { try { game.audio?.play?.(n, o); } catch (_) { /* */ } };

  // ------------------------------------------------------------------------------------------- NPCs
  const npcs = {};
  const npcList = [];
  function buildNpcs() {
    const V = W()?.village;
    const spots = V?.npcSpots || {};
    const base = W()?.playerSpawn || new THREE.Vector3(0, 0, 120);
    NPC_IDS.forEach((id, i) => {
      const m = buildNpcModel(id);
      const sp = SC.SPEAKERS[id];
      const s = spots[id];
      const pos = s?.position ? s.position.clone() : new THREE.Vector3(base.x + Math.cos(i * 0.7) * (6 + i), 0, base.z - 4 + Math.sin(i * 0.7) * (6 + i));
      const yaw = Number.isFinite(s?.yaw) ? s.yaw : 0;
      pos.y = groundAt(pos.x, pos.z);
      m.root.position.copy(pos); m.root.rotation.y = yaw;
      game.scene.add(m.root);
      m.headMesh.geometry.computeBoundingBox();
      m.body.geometry.computeBoundingBox();
      const headTop = m.neckY + m.headMesh.geometry.boundingBox.max.y;
      const n = {
        id, sp, model: m, root: m.root, pos: m.root.position, yaw, baseYaw: yaw,
        homePos: pos.clone(), homeYaw: yaw,
        eyeH: m.neckY + 0.22, tagH: Math.min(headTop, m.neckY + 0.75) + 0.1,
        headYaw: 0, headPitch: 0, phase: Math.random() * 10, talks: {}, dist: 99, camDist: 99,
        tag: ui.makeTag(sp.name, sp.title), mark: '', collider: null, visible: true, outlinesOn: true,
        speaking: false, hop: 0,
      };
      addCollider(n);
      npcs[id] = n; npcList.push(n);
    });
  }
  function addCollider(n) {
    const cols = W()?.colliders;
    if (!Array.isArray(cols)) return;
    if (n.collider) n.collider.x = 1e5; // retire in place (world's spatial grid only rebuilds when the count changes)
    n.collider = { x: n.pos.x, z: n.pos.z, r: n.id === 'child' ? 0.3 : 0.42, npc: n.id };
    cols.push(n.collider);
  }
  function moveNpc(n, pos, yaw) {
    n.pos.set(pos.x, groundAt(pos.x, pos.z), pos.z);
    n.yaw = n.baseYaw = yaw; n.root.rotation.y = yaw;
    addCollider(n);
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
    stage: null, flags: {}, temp: {}, trainStep: null, trainDone: {}, hits: 0,
    timoTalked: false, featherActive: false, featherGot: false, rowenTalked: false, arenaBanner: false,
    mentorId: null, pendingChoice: null, healedPhase: {},
    cls: () => game.progression?.cls || 'mage',
    master: () => !!game.progression?.isMaster?.(),
    finishChoice() { S.pendingChoice = { ...S.temp }; },
    completeTraining() { if (S.stage === 'training') { completeQuest('training'); startUpdraft(); } },
    startFeather() { S.timoTalked = true; activateFeather(); dirty = true; },
    startCampHunt() { S.rowenTalked = true; dirty = true; checkCamps(); },
  };
  let dirty = true, silent = false;
  const timers = [];
  const after = (t, fn) => timers.push({ t, fn });

  function startQuest(id) {
    S.stage = id; dirty = true;
    if (!silent) { events.emit('questStart', { id, title: TITLES[id] }); audio('quest_start'); }
  }
  function completeQuest(id) {
    dirty = true;
    if (!silent) { events.emit('questComplete', { id, title: TITLES[id] }); audio('quest_complete'); }
  }
  let heldBark = null; // barks raised during a dialogue / cinematic wait until it is over (latest wins)
  function bark(id, text, sec) {
    if (silent || !text) return;
    if (D.active || game.cinematic?.active || game.state === 'cutscene') { heldBark = [id, text, sec]; return; }
    ui.bark(SC.SPEAKERS[id] || null, text, sec || Math.min(7, 2.6 + text.length * 0.055));
  }

  // --- choose → blessing → training
  function applyChoice(c) {
    const P = game.progression;
    P?.choose?.(c.cls, c.path, c.path === 'master' ? c.element : null);
    S.mentorId = c.cls === 'sword' ? 'swordMentor' : 'mageMentor';
    completeQuest('choose');
    const done = () => {
      relocateMentor();
      startTraining();
    };
    const el = c.path === 'master' ? c.element : 'all';
    if (game.cinematic?.playBlessing) {
      try { game.cinematic.playBlessing(el, done); } catch (err) { console.warn('[story] playBlessing failed', err); done(); }
    } else {
      // fallback ceremony: light pillar of the chosen element(s) into the hero
      const p = game.player?.object?.position;
      const col = el === 'all' ? [0xff6a1f, 0x7fe3ff, 0xc9a4ff, 0x8fffc1, 0xe0a85a] : [ELEMENT_COLORS[el]];
      if (p) {
        const c0 = p.clone(); c0.y += 1;
        col.forEach((cc, i) => game.vfx?.burst?.(c0, { count: 40, color: [cc, 0xffffff], speed: 6, spread: 1, size: 0.35, life: 1.2, gravity: -2 }));
        game.vfx?.shockwave?.(p, { color: col[0], radius: 7, duration: 0.9 });
        game.vfx?.screenFlash?.(col[0], 0.35, 0.6);
      }
      audio('blessing');
      after(1.4, done);
    }
  }
  function relocateMentor() {
    const n = npcs[S.mentorId]; const sp = mentorTrainingSpot();
    if (n && sp && n.pos.distanceTo(sp.pos) > 2) moveNpc(n, sp.pos, sp.yaw);
  }
  function startTraining() {
    if (!S.mentorId) S.mentorId = S.cls() === 'sword' ? 'swordMentor' : 'mageMentor';
    S.trainStep = 'go'; S.trainDone = {}; S.hits = 0; practiceT = 1.5;
    startQuest('training');
    after(0.6, () => bark(S.mentorId, SC.trainingBark(S.cls(), 'go', S.master())));
  }
  function setTrainStep(step, praise = true) {
    S.trainStep = step; dirty = true;
    const cls = S.cls();
    const pre = praise ? PRAISE[cls === 'sword' ? 'sword' : 'mage'][Math.floor(Math.random() * 4)] + ' ' : '';
    bark(S.mentorId, pre + SC.trainingBark(cls, step, S.master()), 6.5);
    if (step === 'block') practiceT = 2.2;
    if (step !== 'go' && praise) audio('ui_select', { volume: 0.8, pitch: 1.2 });
  }
  function advanceTraining() {
    if (S.stage !== 'training' || S.trainStep === 'go' || S.trainStep === 'done') return;
    if (!S.trainDone[S.trainStep]) return;
    const next = TRAIN_STEPS.find((s) => !S.trainDone[s]);
    setTrainStep(next || 'done');
  }
  function markTrain(step) {
    if (S.stage !== 'training' || S.trainDone[step]) return;
    S.trainDone[step] = true; dirty = true;
    advanceTraining();
  }

  // --- updraft
  function startUpdraft() { S.timoTalked = false; startQuest('updraft'); after(1.2, () => bark(S.mentorId || 'elder', S.cls() === 'sword' ? '티모가 서쪽 바위 기둥 아래서 기다린다.' : '티모는 서쪽 바위 기둥 아래 들판에 있어!')); }
  function collectFeather(quiet = false) {
    S.featherActive = false; S.featherGot = true; feather.group.visible = false;
    featherFx?.stop?.(); featherFx = null;
    const P = game.player;
    if (P && typeof P.maxStamina === 'number') { P.maxStamina += 20; try { P.stamina = P.maxStamina; } catch (_) { /* */ } }
    if (quiet) return;
    const fp = feather.group.position;
    game.vfx?.burst?.(fp, { count: 60, color: [0x8fffc1, 0xffffff], speed: 7, spread: 1, size: 0.3, life: 1.1, shape: 'leaf', gravity: -1 });
    game.vfx?.shockwave?.(fp, { color: 0x8fffc1, radius: 5, duration: 0.8 });
    game.vfx?.screenFlash?.(0x8fffc1, 0.25, 0.5);
    audio('item_get');
    ui.itemGet('바람 깃털', '실피아의 깃털 — 최대 기력 +20');
    completeQuest('updraft');
    after(2.6, () => bark('child', '우와아아! 진짜 해냈다!! 수호자님 최고!'));
    after(7.5, () => { startCamps(); bark('child', '아, 맞다! {로웬} 대장님이 북문에서 수호자님을 찾으셨어요!'); });
  }

  /** Camps cleared before training/updraft were finished: wrap those up so the feather reward isn't lost. */
  function finishEarlyStages() {
    const wasSilent = silent; silent = true;
    try {
      if (S.stage === 'training') { for (const st of TRAIN_STEPS) S.trainDone[st] = true; S.trainStep = 'done'; relocateMentor?.(); }
      S.timoTalked = true;
      const gotNow = !S.featherGot;
      if (gotNow) collectFeather(true);
      S.rowenTalked = true;
      S.stage = 'camps'; dirty = true;
      silent = wasSilent;
      if (gotNow) { try { ui.itemGet?.('바람 깃털', '티모의 선물 — 최대 기력 +20'); } catch (_) { /* */ } }
    } finally { silent = wasSilent; }
  }
  // --- camps & boss
  function startCamps() { if (S.stage === 'updraft' || S.stage === 'training') startQuest('camps'); }
  function campProgress() {
    const o = game.enemies?.getObjective?.();
    return { cur: o?.campsCleared ?? 0, max: o?.campsTotal ?? (W()?.camps?.length || 3), phase: o?.phase, camps: o?.camps };
  }
  function checkCamps() {
    if (S.stage !== 'camps') return;
    const p = campProgress();
    if (p.cur >= p.max && p.max > 0 || p.phase === 'boss' || p.phase === 'done') startBoss();
  }
  function startBoss() {
    if (S.stage === 'boss' || S.stage === 'ending') return;
    if (S.stage === 'camps') completeQuest('camps');
    startQuest('boss');
  }
  function startEnding() {
    if (S.stage === 'ending') return;
    if (S.stage === 'boss') completeQuest('boss');
    startQuest('ending');
    const toVictory = () => game.setState('victory');
    if (game.cinematic?.playEnding) {
      try { game.cinematic.playEnding(toVictory); } catch (err) { console.warn('[story] playEnding failed', err); toVictory(); }
    } else after(2.5, toVictory);
  }

  // ------------------------------------------------------------------------------------------- dialogue
  const D = {
    active: false, npc: null, focus: null, queue: [], node: null, spans: null, chars: null, idx: 0, charT: 0,
    typing: false, choices: null, sel: 0, inputDelay: 0, side: 1, unlockT: 0, onEnd: [],
    cam: new THREE.Vector3(), look: new THREE.Vector3(), started: false,
  };
  function dialogueFor(n) {
    const st = S.stage;
    const ph = PHASE_OF[st] || 'early';
    if (n.id === 'elder' && st === 'wake') return [...SC.elderWake(S), () => { completeQuest('wake'); startQuest('choose'); }];
    if ((n.id === 'mageMentor' || n.id === 'swordMentor') && st === 'choose') return SC.mentorsMeet(S);
    if (n.id === S.mentorId && st === 'training') {
      if (S.trainStep === 'done') return SC.mentorTrainingTalk(S, n.id, 'done');
      return SC.mentorTrainingTalk(S, n.id, S.trainStep);
    }
    if (n.id === 'child' && st === 'updraft' && !S.timoTalked) return SC.timoUpdraft(S);
    if (n.id === 'child' && st === 'updraft' && S.featherActive) return [{ s: 'child', t: '불씨 항아리를 터뜨리고, 불 위에서 점프! 그리고 {스페이스를 꾹}! 바위 꼭대기에서 깃털이 빛나고 있어요!' }];
    if (n.id === 'captain' && st === 'camps' && !S.rowenTalked) return SC.rowenCamps(S);
    if (n.id === 'captain' && st === 'camps') {
      const p = campProgress();
      return [{ s: 'captain', t: `지금까지 거점 {${p.cur}}곳을 무너뜨렸다. 남은 곳은 {${Math.max(0, p.max - p.cur)}}곳. 힘내라.` }];
    }
    const list = SC.AMBIENT[n.id]?.[ph] || SC.AMBIENT[n.id]?.early || [[{ s: n.id, t: '…' }]];
    const k = (n.talks[ph] = (n.talks[ph] || 0) + 1) - 1;
    const nodes = list[k % list.length].slice();
    if (n.id === 'merchant' && ph !== 'early' && !S.healedPhase[ph]) {
      S.healedPhase[ph] = true;
      nodes.push(() => {
        const P = game.player;
        if (P) { if (P.entity) P.entity.hp = P.entity.maxHp ?? P.entity.hp; try { P.hp = P.maxHp; } catch (_) { /* */ } try { P.mp = P.maxMp; } catch (_) { /* */ } try { P.stamina = P.maxStamina; } catch (_) { /* */ } }
        audio('item_get', { volume: 0.6, pitch: 1.2 });
      }, { s: 'narr', t: '향긋한 허브차의 온기가 온몸에 퍼진다. {생명력 · 마나 · 기력}이 모두 회복되었다.' });
    }
    return nodes;
  }
  function talk(n) {
    if (D.active || !n) return;
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
    // camera side: the side of the player→npc line where the camera currently is
    const P = game.player?.object?.position;
    if (P) {
      const dx = n.pos.x - P.x, dz = n.pos.z - P.z;
      const cx = game.camera.position.x - P.x, cz = game.camera.position.z - P.z;
      D.side = (dx * cz - dz * cx) > 0 ? -1 : 1;
    }
    ui.hideBark?.();
    events.emit('dialogueStart', { npc: n.id });
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
    const sp = SC.SPEAKERS[node.s] || SC.SPEAKERS.narr;
    if (npcs[node.s]) {
      D.focus = npcs[node.s];
      // path choice: both mentors are part of the scene — frame their midpoint
      const a = npcs.mageMentor, b = npcs.swordMentor;
      if (S.stage === 'choose' && a && b && (node.s === 'mageMentor' || node.s === 'swordMentor') && a.pos.distanceTo(b.pos) < 9) {
        _mid.pos.lerpVectors(a.pos, b.pos, 0.5); _mid.eyeH = (a.eyeH + b.eyeH) * 0.5; D.focus = _mid;
      }
    }
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
    ui.showChoices(opts.map((o) => ({ t: o.t, color: o.element ? '#' + ELEMENT_COLORS[o.element].toString(16).padStart(6, '0') : null })),
      (i) => { if (D.choices && D.sel !== i) { D.sel = i; ui.selectChoice(i, D.choices[i].desc); audio('ui_select', { volume: 0.4 }); } },
      (i) => pickChoice(i));
    ui.selectChoice(0, opts[0].desc);
    ui.setHint(opts.length > 1 ? `1–${opts.length} / ↑↓ + Enter / 클릭 — 선택` : 'Enter — 선택');
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
    if (S.pendingChoice) { const c = S.pendingChoice; S.pendingChoice = null; applyChoice(c); }
  }
  const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
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
        const sp = SC.SPEAKERS[D.node?.s] || SC.SPEAKERS.narr;
        if (D.node?.s !== 'narr') audio('dialogue_blip', { volume: 0.32, pitch: sp.voice * (0.94 + Math.random() * 0.12) });
      }
      if (D.idx >= D.chars.length) finishTyping();
    }
    const adv = ok && (raw.pressed('Space') || raw.pressed('KeyF') || raw.pressed('Enter') || raw.pressed('NumpadEnter') || raw.mousePressed(0));
    if (D.choices) {
      if (!ok) return;
      const n = D.choices.length;
      for (let i = 0; i < n && i < 5; i++) if (raw.pressed(DIGITS[i]) || raw.pressed('Numpad' + (i + 1))) { pickChoice(i); return; }
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
  const _mid = { pos: new THREE.Vector3(), eyeH: 1.6 };
  const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _T = new THREE.Vector3(), _L = new THREE.Vector3(), _fw = new THREE.Vector3();
  function updateDialogueCamera(realDt) {
    const cam = game.camera, P = game.player?.object?.position, F = D.focus || D.npc;
    if (!P || !F) return;
    if (!D.started) {
      D.started = true; D.cam.copy(cam.position);
      cam.getWorldDirection(_fw); D.look.copy(cam.position).addScaledVector(_fw, 6);
    }
    _A.set(P.x, P.y + 1.45, P.z);
    _B.set(F.pos.x, F.pos.y + F.eyeH, F.pos.z);
    let dx = _B.x - _A.x, dz = _B.z - _A.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const px = -dz * D.side, pz = dx * D.side;
    // higher, wider over-the-shoulder so the NPC's face sits upper-centre above the dialogue box
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
    // light pillar (visible from afar)
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
  const mk = Array.from({ length: 8 }, () => ({ position: null, kind: 'npc', label: '' }));
  let markT = 0;
  function nearestCamp() {
    const p = campProgress(); const P = game.player?.object?.position;
    let best = null, bd = Infinity;
    const list = p.camps || (W()?.camps || []).map((c) => ({ ...c, cleared: false }));
    for (const c of list) {
      if (c.cleared || !c.position) continue;
      const d = P ? c.position.distanceToSquared(P) : 0;
      if (d < bd) { bd = d; best = c; }
    }
    return { best, list };
  }
  function refresh() {
    dirty = false;
    const st = S.stage;
    for (const n of npcList) n.mark = '';
    markers.length = 0;
    let mi = 0;
    const addM = (position, kind, label) => { if (!position || mi >= mk.length) return; const m = mk[mi++]; m.position = position; m.kind = kind; m.label = label; markers.push(m); };
    objective.progress = null; objective.marker = null;
    objective.title = TITLES[st] || '';
    const npcM = (id, q = '!') => { const n = npcs[id]; if (!n) return null; n.mark = q; addM(n.pos, 'npc', n.sp.name); return n.pos; };
    switch (st) {
      case 'wake': objective.desc = '촌장 노아와 이야기하기'; objective.marker = npcM('elder'); break;
      case 'choose': objective.desc = '원소의 제단에서 엘리시아와 바르칸 만나기'; npcM('mageMentor'); objective.marker = npcM('swordMentor'); break;
      case 'training': {
        const s = S.trainStep, mn = npcs[S.mentorId];
        if (s === 'done') { objective.desc = `${mn?.sp.name || '스승'}에게 돌아가기`; objective.marker = npcM(S.mentorId, '?'); }
        else {
          objective.desc = SC.trainingStepText(S.cls(), s, S.master());
          const T = W()?.village?.trainingGround || W()?.trainingArea;
          if (T) { addM(T, 'quest', '수련장'); objective.marker = T; }
          if (s === 'basic') { prog.cur = Math.min(5, S.hits); prog.max = 5; objective.progress = prog; }
          else if (s !== 'go') { const k = TRAIN_STEPS.filter((x) => S.trainDone[x]).length; prog.cur = k; prog.max = TRAIN_STEPS.length; objective.progress = prog; }
        }
        break;
      }
      case 'updraft':
        if (!S.timoTalked) { objective.desc = '서쪽 들판의 티모와 이야기하기'; objective.marker = npcM('child'); }
        else if (S.featherActive) { objective.desc = '상승기류를 타고 바위 꼭대기의 바람 깃털 얻기'; objective.marker = feather.group.position; addM(feather.group.position, 'quest', '바람 깃털'); }
        else objective.desc = '바람 깃털을 손에 넣었다!';
        break;
      case 'camps': {
        if (!S.rowenTalked) { objective.desc = '북문의 경비대장 로웬과 이야기하기'; objective.marker = npcM('captain'); }
        else objective.desc = '솔레아 평원의 마물 거점 소탕';
        const p = campProgress(); prog.cur = p.cur; prog.max = p.max;
        if (S.rowenTalked) objective.progress = prog;
        const { best, list } = nearestCamp();
        for (const c of list) if (!c.cleared) addM(c.position, 'camp', c.name || (W()?.camps || []).find((w) => w.id === c.id)?.name || '마물 거점');
        if (S.rowenTalked && best) objective.marker = best.position;
        break;
      }
      case 'boss': {
        objective.desc = '봉인의 유적에서 고대 바위 골렘 정화하기';
        const A = W()?.bossArena?.position; if (A) { addM(A, 'boss', '봉인의 유적'); objective.marker = A; }
        break;
      }
      case 'ending': objective.desc = '모험은 계속된다'; break;
      default: objective.desc = '';
    }
    for (const n of npcList) ui.setTagMark(n.tag, n.mark);
  }

  // ------------------------------------------------------------------------------------------- per-frame NPC animation & tags
  const _v = new THREE.Vector3(), _proj = new THREE.Vector3();
  let t = 0, promptNpc = null, proxT = 0, proxCd = 0;
  const proxBarked = {};
  function updateNpcs(realDt) {
    const cam = game.camera, P = game.player?.object?.position;
    const dd = game.settings?.values?.drawDistance ?? 0.8;
    const visR = 55 + 60 * dd;
    const playing = game.state === 'playing';
    const showTags = playing && !game.cinematic?.active;
    const hw = innerWidth * 0.5, hh = innerHeight * 0.5;
    let best = null, bd = TALK_R;
    for (const n of npcList) {
      const p = n.pos;
      n.camDist = cam.position.distanceTo(p);
      const dx = P ? P.x - p.x : 99, dz = P ? P.z - p.z : 99;
      n.dist = Math.hypot(dx, dz);
      const vis = n.camDist < visR;
      if (vis !== n.visible) { n.root.visible = vis; n.visible = vis; }
      if (!vis) { ui.hideTag(n.tag); continue; }
      const ol = n.camDist < 34;
      if (ol !== n.outlinesOn) { for (const o of n.model.outlines) o.visible = ol; n.outlinesOn = ol; }
      const inDlg = D.active && (D.npc === n || D.focus === n || (D.npc && n.dist < 7 && SC.SPEAKERS[D.node?.s] === n.sp));
      // body yaw: face the hero while talking / when very close
      const toP = Math.atan2(dx, dz);
      let targetYaw = n.baseYaw;
      if (inDlg || (n.dist < 3.4 && P)) targetYaw = toP;
      else if (n.dist < 6) targetYaw = n.yaw; // hold
      n.yaw = dampAngle(n.yaw, targetYaw, inDlg ? 6 : 2.5, realDt);
      n.root.rotation.y = n.yaw;
      if (n.camDist < 60) {
        // head look-at
        let hy = 0, hp = 0;
        if (P && (n.dist < 9 || inDlg)) {
          hy = clamp(angleDiff(n.yaw, toP), -1.1, 1.1);
          hp = clamp(-Math.atan2(P.y + 1.5 - (p.y + n.eyeH), Math.max(0.5, n.dist)) * 0.7, -0.45, 0.35);
        } else {
          hy = Math.sin(t * 0.37 + n.phase) * 0.35; hp = Math.sin(t * 0.23 + n.phase * 2) * 0.06;
        }
        n.headYaw = damp(n.headYaw, hy, 5, realDt); n.headPitch = damp(n.headPitch, hp, 5, realDt);
        const speaking = D.active && D.typing && SC.SPEAKERS[D.node?.s] === n.sp;
        const m = n.model;
        m.headPivot.rotation.set(n.headPitch + (speaking ? Math.sin(t * 13) * 0.045 : 0), n.headYaw, Math.sin(t * 0.9 + n.phase) * 0.04);
        const br = Math.sin(t * 2.1 + n.phase);
        m.bodyPivot.scale.set(1 + br * 0.008, 1 + br * 0.014, 1 + br * 0.008);
        m.bodyPivot.rotation.z = Math.sin(t * 0.8 + n.phase) * 0.018 + (speaking ? Math.sin(t * 5) * 0.012 : 0);
        if (n.id === 'child') { // excited hops
          const excite = n.mark || (n.dist < 6 && S.stage !== 'boss');
          n.hop = excite ? Math.max(0, Math.sin(t * 6.5)) * 0.07 : damp(n.hop, 0, 8, realDt);
          m.bodyPivot.position.y = n.hop;
        }
        if (m.glow && m.info.orb) m.glow.position.set(Math.cos(t * 1.3) * 0.55, 1.35 + Math.sin(t * 2.2) * 0.08, Math.sin(t * 1.3) * 0.55 + 0.05);
      }
      // interaction candidate
      if (playing && P && n.dist < bd && Math.abs(P.y - p.y) < 2.2) { bd = n.dist; best = n; }
      // floating tag
      if (!showTags || n.camDist > 120) { ui.hideTag(n.tag); continue; }
      const nameOp = 1 - smoothstep(10, 17, n.camDist);
      const op = Math.max(nameOp, n.mark ? 1 - smoothstep(90, 115, n.camDist) : 0);
      if (op < 0.02) { ui.hideTag(n.tag); continue; }
      _proj.set(p.x, p.y + n.tagH + (n.hop || 0), p.z).project(cam);
      if (_proj.z > 1 || _proj.x < -1.15 || _proj.x > 1.15 || _proj.y < -1.2 || _proj.y > 1.2) { ui.hideTag(n.tag); continue; }
      ui.placeTag(n.tag, (_proj.x + 1) * hw, (1 - _proj.y) * hh, op, nameOp);
    }
    const fighting = !!game.enemies?.inCombat;
    const canTalk = playing && !fighting && !game.cinematic?.active && !(game.input.isLocked?.('menu')) && !D.active && D.unlockT <= 0;
    promptNpc = canTalk ? best : null;
    if (fighting && best && best.dist < 3 && playing && t - (S._fightBarkT || -99) > 8) { S._fightBarkT = t; bark(best.id, '지금은 싸움 중이야! 먼저 마물부터!', 2.6); }
    ui.setPrompt(promptNpc ? promptNpc.sp.name : null);
  }

  // ------------------------------------------------------------------------------------------- update
  let practiceT = 0, campT = 0, arenaT = 0;
  function update(dt, realDt) {
    realDt = Math.min(realDt || 0, 0.1);
    t += realDt;
    for (let i = timers.length - 1; i >= 0; i--) { const j = timers[i]; j.t -= realDt; if (j.t <= 0) { timers.splice(i, 1); try { j.fn(); } catch (err) { console.error('[story] timer', err); } } }
    if (D.unlockT > 0) { D.unlockT -= realDt; if (D.unlockT <= 0) game.input.unlock('dialogue'); }
    if (game.state === 'dialogue' && D.active) { updateDialogue(realDt); if (D.active) updateDialogueCamera(realDt); }
    else if (D.active && game.state !== 'dialogue') { /* state was changed externally (e.g. death) */ endDialogue(); }
    updateNpcs(realDt);
    ui.update(realDt);

    // feather
    if (feather.group.visible) {
      feather.spin.rotation.y += realDt * 1.6; feather.group.children[1].rotation.y = feather.spin.rotation.y;
      feather.spin.position.y = Math.sin(t * 2) * 0.15; feather.group.children[1].position.y = 0.05 + feather.spin.position.y;
      feather.pm.uniforms.uTime.value = t;
      const P = game.player?.object?.position;
      const near = P && P.distanceTo(feather.group.position) < 60;
      if (near && !featherFx && game.vfx?.emitter) {
        try { featherFx = game.vfx.emitter({ follow: feather.spin, rate: 10, count: 1, color: [0x8fffc1, 0xffffff], speed: 0.6, spread: 1, size: 0.18, life: 1.4, gravity: -0.6, shape: 'soft' }); } catch (_) { featherFx = null; }
      } else if (!near && featherFx) { featherFx.stop?.(); featherFx = null; }
      if (game.state === 'playing' && S.featherActive && P) {
        const fp = feather.group.position;
        const dx = P.x - fp.x, dz = P.z - fp.z, dy = P.y + 0.9 - fp.y;
        if (dx * dx + dz * dz < 1.8 * 1.8 && Math.abs(dy) < 2.0) collectFeather();
      }
    }

    if (game.state !== 'playing') { if (dirty) refresh(); return; }
    if (heldBark && !D.active && !game.cinematic?.active) { const b = heldBark; heldBark = null; bark(...b); }
    const P = game.player?.object?.position;

    // interact
    if (promptNpc && game.input.raw.pressed('KeyF')) talk(promptNpc);

    // training: arrive / practice attacks for the block step
    if (S.stage === 'training' && P) {
      const T = W()?.village?.trainingGround || W()?.trainingArea;
      if (S.trainStep === 'go') {
        if (!T || Math.hypot(P.x - T.x, P.z - T.z) < (W()?.trainingRadius || 8.5) + 5) {
          const next = TRAIN_STEPS.find((s) => !S.trainDone[s]);
          setTrainStep(next || 'done', false);
        }
      } else if (S.trainStep === 'block' && !S.trainDone.block) {
        practiceT -= realDt;
        if (practiceT <= 0) {
          let r = null;
          if (!T || Math.hypot(P.x - T.x, P.z - T.z) < 22) { try { r = game.enemies?.practiceAttack?.(game.player.entity); } catch (_) { r = null; } }
          practiceT = r ? (r.eta || 1.2) + 2.4 : 1.2;
        }
      }
    }
    // camps: keep marker on the nearest camp; detect completion even without events
    if (S.stage === 'camps') {
      campT -= realDt;
      if (campT <= 0) { campT = 1; checkCamps(); dirty = true; }
    }
    // boss arena banner
    if ((S.stage === 'boss' || S.stage === 'camps') && !S.arenaBanner && P) {
      arenaT -= realDt;
      if (arenaT <= 0) {
        arenaT = 0.25;
        const A = W()?.bossArena;
        if (A?.position && Math.hypot(P.x - A.position.x, P.z - A.position.z) < (A.radius || 20) + 6) {
          S.arenaBanner = true;
          ui.banner('봉인의 유적', S.stage === 'boss' ? '안개에 잠식된 수문장 — 고대 바위 골렘' : '천 년의 봉인이 잠든 곳');
          audio('cinematic_whoosh');
        }
      }
    }
    // villagers greet when passing by (once per phase)
    proxT -= realDt; if (proxCd > 0) proxCd -= realDt;
    if (proxT <= 0 && proxCd <= 0 && P) {
      proxT = 0.5;
      const ph = PHASE_OF[S.stage] || 'early';
      for (const id of ['villagerA', 'villagerB', 'villagerC', 'merchant']) {
        const n = npcs[id]; if (!n || n.dist > 5 || proxBarked[id + ph]) continue;
        proxBarked[id + ph] = true; proxCd = 25;
        const line = SC.AMBIENT[id]?.[ph]?.[0]?.[0]?.t;
        if (line) bark(id, line);
        break;
      }
    }
    if (dirty) refresh();
  }

  // ------------------------------------------------------------------------------------------- events
  let lastHitT = -1;
  function init() {
    events.on('damage', (p) => {
      if (S.stage !== 'training' || !p?.target?.isDummy || p.isPlayer) return;
      if (p.dot || p.tick || p.tags?.includes?.('dot') || p.tags?.includes?.('tick')) return;   // burn ticks don't count
      if (S.trainStep === 'basic' || !S.trainDone.basic) {
        if (game.realTime - lastHitT < 0.07) return;
        lastHitT = game.realTime;
        S.hits++; dirty = true;
        if (S.hits >= 5) markTrain('basic');
      }
    });
    events.on('spellCast', (p) => {
      if (S.stage !== 'training') return;
      if (p?.kind === 'heavy') markTrain('heavy');
      else if (p?.kind === 'ultimate') markTrain('ultimate');
    });
    const onBlock = (p) => {
      const pe = game.player?.entity;
      if (p?.target && pe && p.target !== pe && p.target.team !== 'player') return;
      markTrain('block');
    };
    events.on('blocked', onBlock);
    events.on('parry', onBlock);
    for (const ev of ['blink', 'dash', 'perfectDodge']) events.on(ev, () => markTrain('dash'));
    events.on('updraftEnter', () => {
      if (S.stage === 'updraft' && S.featherActive && !S.flags.updraftBark) { S.flags.updraftBark = true; bark('child', '지금이에요! {스페이스를 꾹} 눌러서 활공해요! 슈우웅!'); }
    });
    events.on('campCleared', (p) => {
      dirty = true;
      const idx = (p?.index ?? 0), total = p?.total ?? 3;
      const cleared = campProgress().cur;
      if (S.stage === 'updraft' || S.stage === 'training') {
        const early = ['벌써 거점 하나를 무너뜨렸다고? 수련도 끝나기 전에…! 대단하군.', '두 번째 거점까지! 수련은 나중에 마저 해도 되겠어.', '세 곳 모두…! 북쪽을 봐라, 안개가 유적으로 몰려들고 있다. {봉인의 유적}이 깨어난다!'];
        const k = cleared >= total ? 2 : Math.min(1, Math.max(0, cleared - 1));
        bark('captain', early[k], 6);
      } else if (S.stage === 'camps') {
        const lines = ['첫 번째 거점이 무너졌다는 소식이다! 좋아, 그 기세다!', '두 번째 거점도! 마을 사람들이 환호하고 있다.', '세 곳 모두…! 북쪽을 봐라, 안개가 유적으로 몰려들고 있다. {봉인의 유적}이 깨어난다!'];
        const k = cleared >= total ? 2 : Math.min(1, Math.max(0, cleared - 1));
        bark('captain', lines[k] ?? lines[Math.min(2, idx)], 6);
      }
      if (S.stage === 'camps') checkCamps();
    });
    events.on('bossSpawn', () => {
      if (S.stage === 'updraft' || S.stage === 'training') finishEarlyStages();
      if (S.stage === 'camps') startBoss();
    });
    events.on('victory', () => startEnding());
    events.on('pathChosen', () => { dirty = true; });
    events.on('stateChange', (p) => {
      if (p?.state !== 'dialogue' && D.active && p?.prev === 'dialogue') endDialogue();
      if (p?.state !== 'playing' && p?.state !== 'dialogue') ui.setPrompt(null);
      ui.setVisible(p?.state === 'playing' || p?.state === 'dialogue' || p?.state === 'cutscene');
    });
  }

  // ------------------------------------------------------------------------------------------- public API
  function resetAll() {
    for (const k of Object.keys(S.flags)) delete S.flags[k];
    S.temp = {}; S.trainStep = null; S.trainDone = {}; S.hits = 0; S.timoTalked = false; S.featherGot = false;
    heldBark = null;
    S.rowenTalked = false; S.arenaBanner = false; S.mentorId = null; S.pendingChoice = null; S.healedPhase = {};
    if (S.featherActive) { S.featherActive = false; feather.group.visible = false; featherFx?.stop?.(); featherFx = null; }
    for (const n of npcList) { if (n.pos.distanceToSquared(n.homePos) > 0.01) moveNpc(n, n.homePos, n.homeYaw); n.talks = {}; }
    for (const k of Object.keys(proxBarked)) delete proxBarked[k];
    timers.length = 0;
  }

  buildNpcs();
  ui.setVisible(game.state === 'playing' || game.state === 'dialogue');
  const api = {
    get stage() { return S.stage; },
    get trainStep() { return S.trainStep; },
    get dialogueActive() { return D.active; },
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
    /** Jump to a stage, silently completing earlier ones. */
    debugSkip(stage) {
      const idx = STAGES.indexOf(stage); if (idx < 0) return;
      if (D.active) endDialogue();
      silent = true;
      try {
        resetAll();
        const P = game.progression;
        if (idx >= 2 && !P?.chosen) P?.choose?.('mage', 'all', 'fire');
        if (idx >= 1) S.flags.metMentors = idx >= 2;
        if (idx >= 2) S.mentorId = (P?.cls === 'sword') ? 'swordMentor' : 'mageMentor';
        if (idx >= 3) relocateMentor();
        if (idx >= 4) { S.timoTalked = true; collectFeather(true); }
        if (idx >= 5) S.rowenTalked = true;
        switch (stage) {
          case 'wake': case 'choose': startQuest(stage); break;
          case 'training': relocateMentor(); startTraining(); break;
          case 'updraft': S.stage = 'updraft'; S.timoTalked = false; break;
          case 'camps': S.rowenTalked = true; S.stage = 'camps'; break;
          case 'boss': S.stage = 'boss'; try { if (!game.enemies?.boss) game.enemies?.spawnBoss?.(); } catch (_) { /* */ } break;
          case 'ending': S.stage = 'boss'; break;
        }
      } finally { silent = false; }
      timers.length = 0;
      dirty = true; refresh();
      if (stage === 'ending') startEnding();
    },
    getObjective() {
      if (!S.stage) return null;
      if (dirty) refresh();
      return objective;
    },
    getMarkers() { if (dirty) refresh(); return markers; },
    hasPrompt() { return !!promptNpc && game.state === 'playing'; },
    /** Start talking to an NPC by id (tests / scripted). */
    talkTo(id) { const n = npcs[id]; if (n && game.state === 'playing') talk(n); return !!n; },
    /** Test helpers: advance the current dialogue (finish typing / next line) or pick a choice. */
    advance() { if (!D.active) return false; if (D.typing) finishTyping(); else if (!D.choices) nextNode(); return true; },
    choose(i) { if (D.choices) { pickChoice(i); return true; } return false; },
    getDialogueState() {
      return D.active ? { npc: D.npc?.id, speaker: D.node?.s, text: D.node?.t, typing: D.typing, choices: D.choices?.map((c) => c.t) || null } : null;
    },
    /** Show a non-blocking speech line. */
    bark(id, text, sec) { bark(id, text, sec); },
    banner(title, sub) { ui.banner(title, sub); },
  };
  return api;
}
