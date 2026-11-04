// Class signature mechanics (CONTRACT §7.6, DESIGN §2.2). Owned by skills. No class literals: the kit is chosen by
// CLASS_DEFS[cls].signature ('attunement' | 'enchant' | 'focus' | 'seal' | 'familiars' | 'marks').
// Listens to damage / reaction / blocked / perfectDodge / skillCast and exposes its state through getHudState().signature.
// Movement kits (dodge / defend / the focus time slow) belong to player (§10.2).
import * as THREE from 'three';
import { CLASS_DEFS, classElements } from '../core/classes.js';
import { ELEMENT_DEFS, elColor } from '../core/elements.js';

const SIG_MAX = { attunement: 3, enchant: 100, focus: 100, seal: 8, familiars: 2, marks: 5 };

export function createClassKits(game, K) {
  const E = game.events;
  const P = () => game.progression;
  const pl = () => game.player;
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), fwd = new THREE.Vector3();
  const near = [];
  const now = () => game.time || 0;
  const isPlayerSrc = (s) => s === 'player' || (s && typeof s === 'object' && s.team === 'player');
  const playerHit = (p) => p && !p.isPlayer && p.target && p.target.team !== 'player' && isPlayerSrc(p.source);
  const kind = () => CLASS_DEFS[P()?.cls]?.signature || null;
  const statOn = (k) => { try { return game.stats?.get?.(k) || 0; } catch (_) { return 0; } };
  const procBusy = () => !!K.procs?.inProc;

  // ---------------- state
  const st = {
    chain: 0, chainEl: null, chainT: -1e9,                     // mage 원소 연쇄
    enchant: 0,                                                 // sword 인챈트 블레이드
    sealHits: 0, sealBlocks: 0, sealPos: new THREE.Vector3(), sealLeft: 0, sealR: 4,   // paladin 수호의 맹세
    markTarget: null,                                           // shadowblade 그림자 표식 (HUD target)
    stealthByGrass: false, stealthT: 0,
  };
  const marksFallback = new WeakMap();   // target → {n, until} (when combat has no stack statuses yet)

  function deal(t, amount, el, extra) {
    if (!t?.alive || !(amount > 0) || !game.combat?.dealDamage) return;
    const hit = { amount, element: el, source: pl()?.entity || 'player', point: v2.copy(t.object.position).setY(t.object.position.y + 1).clone(), noReaction: true, tags: ['signature'], tier: 'heavy', castId: 0 };
    if (extra) Object.assign(hit, extra);
    if (!hit.castId && game.nextCastId) hit.castId = game.nextCastId();
    try { game.combat.dealDamage(t, hit); } catch (_) { /* */ }
  }

  // ---------------- mage: 원소 연쇄 (kind 'attunement')
  function onCastMage(p) {
    if (p.slot === 'basic' || !p.element) return;
    const t = now();
    if (st.chainEl && p.element !== st.chainEl && t - st.chainT <= 3 && st.chain < 3) {
      st.chain++;
      const refund = statOn('chainRefundMp');
      if (refund > 0) { const pp = pl(); if (pp && pp.mp != null) pp.mp = Math.min(pp.maxMp || 100, pp.mp + refund); }
      E.emit('signatureChanged', { kind: 'attunement', value: st.chain, max: 3 });
      if (st.chain === 3) { try { game.audio?.play?.('ui_select', { pitch: 1.6, volume: 0.6 }); } catch (_) { /* */ } }
    }
    st.chainEl = p.element; st.chainT = t;
  }
  /** Runtime hook: at 3 stacks the next (non-basic) skill costs 0 and deals +30%. */
  function chainFreeMul(def) {
    if (kind() !== 'attunement' || st.chain < 3 || def.slot === 'basic' || def.slot === 'finisher') return 0;
    return 1.3;
  }
  function consumeChain() { if (st.chain) { st.chain = 0; E.emit('signatureChanged', { kind: 'attunement', value: 0, max: 3 }); } }

  // ---------------- sword: 인챈트 블레이드
  function onHitEnchant(p) {
    const add = p.reaction ? 8 : 4;
    const was = st.enchant;
    st.enchant = Math.min(100, st.enchant + add);
    if (was < 100 && st.enchant >= 100) { E.emit('signatureChanged', { kind: 'enchant', value: 100, max: 100 }); try { game.audio?.play?.('charge', { pitch: 1.8, volume: 0.4 }); } catch (_) { /* */ } }
  }
  function enchantWave(attacker) {
    const pp = pl(); const pos = pp?.object?.position; if (!pos) return;
    const el = K.api.attuned || CLASS_DEFS[P()?.cls]?.primary?.[0] || 'lightning';
    fwd.set(0, 0, -1);
    if (attacker?.object) { fwd.subVectors(attacker.object.position, pos); fwd.y = 0; if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1); }
    else if (pp.object?.getWorldDirection) { pp.object.getWorldDirection(fwd); fwd.y = 0; }
    fwd.normalize();
    v1.copy(pos).addScaledVector(fwd, 4); v1.y += 1;
    const cid = game.nextCastId ? game.nextCastId() : 0;
    near.length = 0;
    try { game.combat?.queryRadius?.(v1, 5, 'enemy', near); } catch (_) { near.length = 0; }
    const status = ELEMENT_DEFS[el]?.status;
    for (const e of near) {
      v2.subVectors(e.object.position, pos); v2.y = 0;
      const d = v2.length(); if (d > 8.5 || (d > 0.5 && v2.dot(fwd) / d < 0.5)) continue;
      deal(e, 80, el, { noReaction: false, status: status && game.combat?.STATUS_DEFS ? { [status]: { dur: 4 } } : undefined, direction: fwd.clone(), knockback: 6, castId: cid });
      if (status && !game.combat?.STATUS_DEFS) { try { game.combat?.applyStatus?.(e, status, 4); } catch (_) { /* */ } }
    }
    // v4 (§3.6): one cast → one castId; the kit's element motifs (wave along the swing + one burst) when present,
    // else the legacy smear/shockwave/explosion carrying the castId; colours from the element ramp (never white)
    try {
      const kit = game.vfx?.kit;
      if (kit?.motif) {
        kit.motif(el, 'wave', { pos, dir: fwd, r: 8, arc: 0.7, castId: cid, owner: 'player' });
        kit.motif(el, 'burst', { pos: v1, r: 1.6, n: 10, castId: cid, owner: 'player' });
      } else {
        game.vfx?.smear?.('wide', pos, pp.object.quaternion, 2.2, el, { castId: cid, owner: 'player' });
        game.vfx?.shockwave?.(v1, { color: elColor(el, 'mid'), radius: 8, duration: 0.4, castId: cid, owner: 'player' });
        game.vfx?.explosion?.(v1, { element: el, scale: 1.2, castId: cid, owner: 'player' });
      }
    } catch (_) { /* */ }
    try { game.audio?.play?.('explode_' + el, { position: v1 }); } catch (_) { /* */ }
    st.enchant = 0;
    E.emit('signatureChanged', { kind: 'enchant', value: 0, max: 100 });
    E.emit('enchantWave', { element: el });
  }

  // ---------------- paladin: 수호의 맹세 (holy seal)
  function plantSeal() {
    const pp = pl(); const pos = pp?.object?.position; if (!pos) return;
    const r = 4 + statOn('sealRadiusAdd');
    st.sealPos.copy(pos); st.sealLeft = 6; st.sealR = r;
    let spawned = false;
    try {
      const Z = game.spells?.api?.zones;
      if (Z?.spawn) { Z.spawn('holy', st.sealPos.clone(), { r, dur: 6, source: 'seal', owner: 'player', radiantPerSec: statOn('sealRadiant') ? 1 : 0, regenDelayMul: 0.5, regenRateAdd: 0.01, dmgTakenMul: 0.9 }); spawned = true; }
    } catch (_) { spawned = false; }
    st.sealZone = spawned;
    try { game.vfx?.runeCircle?.(st.sealPos, { element: 'light', r, dur: 6, rotSpeed: 0.6 }) || game.vfx?.groundDecal?.('rune', st.sealPos, r, 6); } catch (_) { /* */ }
    try { game.audio?.play?.('blessing', { position: st.sealPos, volume: 0.6 }); } catch (_) { /* */ }
    E.emit('sealPlanted', { point: st.sealPos.clone(), r });
  }
  function sealTick(dt) {
    if (st.sealLeft <= 0) { if (game.stats?.has?.('proc:seal')) game.stats.clear('proc:seal'); return; }
    st.sealLeft -= dt;
    const pos = pl()?.object?.position; if (!pos) return;
    const inside = pos.distanceToSquared(st.sealPos) <= st.sealR * st.sealR && st.sealLeft > 0;
    // the zone (magic) handles regen/DR when present; this source is the fallback so the seal always works (rule 11)
    if (!st.sealZone) {
      if (inside && !game.stats?.has?.('proc:seal')) game.stats?.set?.('proc:seal', { dmgTakenMul: 0.9, regenDelayAdd: -2, regenRateAdd: 0.01 });
      else if (!inside && game.stats?.has?.('proc:seal')) game.stats.clear('proc:seal');
    }
  }

  // ---------------- spiritcaller: 정령 동료
  function refreshFamiliars() {
    const F = K.familiars; if (!F) return;
    if (kind() !== 'familiars') { if (F.count) F.setElements([]); return; }
    const pr = P();
    const slots = 2 + (statOn('familiarSlotsAdd') | 0);
    const list = classElements(pr.cls).concat(pr.unlockedElements?.() || [])
      .filter((el, i, a) => a.indexOf(el) === i && (pr.pointsIn?.(el) || 0) >= 3)
      .sort((a, b) => (pr.pointsIn(b) - pr.pointsIn(a)));
    F.setElements(list.slice(0, Math.min(slots, F.MAX)));
  }

  // ---------------- shadowblade: 그림자 표식
  function marksOf(t) {
    if (!t) return 0;
    const s = t.statuses?.marked;
    if (game.combat?.STATUS_DEFS && s) return s.stacks || 1;
    const m = marksFallback.get(t); if (!m || m.until < now()) return 0;
    return m.n;
  }
  function addMark(t) {
    if (!t?.alive) return;
    if (game.combat?.STATUS_DEFS) { try { game.combat.applyStatus(t, 'marked', 6, { stacks: 1, source: pl()?.entity || 'player' }); } catch (_) { /* */ } }
    else {
      let m = marksFallback.get(t); if (!m) { m = { n: 0, until: 0 }; marksFallback.set(t, m); }
      if (m.until < now()) m.n = 0;
      m.n = Math.min(5, m.n + 1); m.until = now() + 6;
    }
    st.markTarget = t;
  }
  function clearMarks(t) {
    try { game.combat?.clearStatus?.(t, 'marked'); } catch (_) { /* */ }
    marksFallback.delete(t);
  }
  function onHitMarks(p) {
    const t = p.target;
    const lc = K.api.lastCast;
    const charged = !!p.charged || (lc?.slot === 'charged' && now() - lc.t < 0.6);
    const n = marksOf(t);
    if (n > 0 && (p.backstab || charged)) {
      const bonus = (p.amount || 0) * 0.12 * n;
      clearMarks(t);
      const cid = game.nextCastId ? game.nextCastId() : 0;
      deal(t, bonus, 'shadow', { castId: cid });
      try {
        v1.copy(t.object.position).setY(t.object.position.y + 1);
        const kit = game.vfx?.kit;
        if (kit?.motif) kit.motif('shadow', 'burst', { pos: v1, r: 1.1 + n * 0.2, n: 8, castId: cid, owner: 'player' });
        else game.vfx?.preset?.('impact_shadow', v1, { scale: 1 + n * 0.2, castId: cid, owner: 'player' });
      } catch (_) { /* */ }
      E.emit('marksDetonated', { target: t, marks: n });
      if (n >= 5 && statOn('detonateRefund')) { const id = (K.api.attuned || 'shadow') + '.charged'; K.api._resetOne?.(id); }
      const ex = statOn('markExecute');
      if (ex > 0 && t.alive && !t.isBoss && (t.hp || 0) < (t.maxHp || 1) * ex) deal(t, (t.hp || 0) + 1, 'shadow');
      return;
    }
    addMark(t);
  }
  function stealthTick(dt) {
    const pp = pl(); const pos = pp?.object?.position; if (!pos) return;
    st.stealthT -= dt; if (st.stealthT > 0) return; st.stealthT = 0.25;
    let want = false;
    try {
      const inCombat = typeof pp.inCombat === 'function' ? pp.inCombat() : false;
      const grass = game.world?.isTallGrass?.(pos.x, pos.z) || game.world?.surface?.isTallGrass?.(pos);
      want = !inCombat && !!grass && !pp.sprinting;
    } catch (_) { want = false; }
    if (want !== st.stealthByGrass) { st.stealthByGrass = want; try { game.enemies?.setPlayerStealth?.(want); } catch (_) { /* */ } }
  }

  // ---------------- listeners
  E.on('skillCast', (p) => { if (kind() === 'attunement') onCastMage(p); });
  E.on('damage', (p) => {
    if (!playerHit(p) || p.dot || procBusy()) return;
    const k = kind();
    if (k === 'enchant') onHitEnchant(p);
    else if (k === 'seal') { if (++st.sealHits >= 8) { st.sealHits = 0; st.sealBlocks = 0; plantSeal(); } }
    else if (k === 'marks') onHitMarks(p);
  });
  E.on('blocked', (p) => {
    if (p?.target !== pl()?.entity) return;
    const k = kind();
    if (k === 'seal') { if (++st.sealBlocks >= 4) { st.sealBlocks = 0; st.sealHits = 0; plantSeal(); } }
    else if (k === 'enchant' && st.enchant >= 100 && (p.parried || p.perfect)) enchantWave(p.source && typeof p.source === 'object' ? p.source : null);
  });
  E.on('parry', (p) => { if (kind() === 'enchant' && st.enchant >= 100) enchantWave(p?.source || p?.attacker || null); });
  const reset = () => {
    st.chain = 0; st.chainEl = null; st.enchant = 0; st.sealHits = 0; st.sealBlocks = 0; st.sealLeft = 0;
    if (st.stealthByGrass) { st.stealthByGrass = false; try { game.enemies?.setPlayerStealth?.(false); } catch (_) { /* */ } }
    refreshFamiliars();
  };
  E.on('classChosen', reset);
  for (const ev of ['skillLearned', 'skillUnlearned', 'respec', 'levelUp', 'treesRegistered']) E.on(ev, () => refreshFamiliars());

  let glowT = 0;
  function update(dt) {
    const k = kind();
    if (k === 'seal') sealTick(dt);
    if (k === 'marks') stealthTick(dt);
    if (k === 'enchant') { glowT -= dt; if (glowT <= 0) { glowT = 0.1; try { pl()?.setEnchantGlow?.(st.enchant / 100); } catch (_) { /* */ } } }
    if (k === 'attunement' && st.chain > 0 && now() - st.chainT > 8) consumeChain();
    try { K.familiars?.update?.(dt); } catch (_) { /* */ }
  }
  /** Fill the reused HUD signature object (no allocation). */
  function fillSignature(sig) {
    const k = kind() || 'attunement';
    sig.kind = k; sig.max = SIG_MAX[k] || 1; sig.extra = null;
    if (k === 'attunement') sig.value = st.chain;
    else if (k === 'enchant') sig.value = st.enchant;
    else if (k === 'focus') { const pp = pl(); sig.value = pp?.stamina ?? 0; sig.max = pp?.maxStamina ?? 100; sig.extra = !!game.timeScale?.has?.('focus'); }
    else if (k === 'seal') { sig.value = Math.max(st.sealHits, st.sealBlocks * 2); sig.extra = st.sealLeft > 0 ? st.sealLeft : null; }
    else if (k === 'familiars') { sig.value = K.familiars?.count || 0; sig.max = 2 + (statOn('familiarSlotsAdd') | 0); }
    else if (k === 'marks') { sig.value = st.markTarget?.alive ? marksOf(st.markTarget) : 0; }
    return sig;
  }
  return { update, fillSignature, chainFreeMul, consumeChain, refresh: refreshFamiliars, state: st, marksOf, plantSeal, enchantWave, kind };
}
