// Damage pipeline + the canonical damage formula (CONTRACT §8.3). Owner: combat.
// THE ONLY PLACE outgoing player damage is scaled:
//   final = base × power(level | powerSnap for DoT) × progression.damageMul(el) [mastery only] × stats.atkMul × stats.elementDmg(el)
//         × (hit.castMul || 1) × conditional(target) [+ quickened flat] × reaction (mult × stats.reactionDmg(id)) × resist × crit
// Enemy → player: × source.zoneDmgMul × difficulty.dmgMul × stats.dmgTakenMul.
// Order: invulnerable → onBeforeDamage (snapshot + block hook) → block → voidShield → react → formula → HP → lifesteal → break
//        → awakening → statuses → knockback → hitFeel (single caller) → onHit / onDeath.
import * as THREE from 'three';
import { STATUS_DEFS } from './statuses.js';

const EMPTY = Object.freeze([]);
const TIER_RANK = { light: 0, heavy: 1, crit: 2, reaction: 3, ult: 4, break: 5 };
const RANK_TIER = ['light', 'heavy', 'crit', 'reaction', 'ult', 'break'];

const NATURE_HEAL = new Set(['regen', 'bloom', 'photosynthesis', 'pod', 'nature', 'treant']);
export function createPipeline(game, C) {
  const NONE = Object.freeze({ damage: 0, reaction: null, crit: false, killed: false });
  const tvA = new THREE.Vector3(), tvB = new THREE.Vector3(), tvF = new THREE.Vector3(), tvS = new THREE.Vector3();
  const isPlayerSource = (hit) => hit.source === 'player' || hit.source?.team === 'player';
  const stats = () => game.stats;
  const prog = () => game.progression;
  const warned = new Set();
  const warnOnce = (k, e) => { if (!warned.has(k)) { warned.add(k); console.error('[combat]', k, e); } };
  const statusSpec = { stacks: 0, source: null, power: 1, el: null };
  const healEv = { target: null, amount: 0, source: '' };   // reused payload for HoT heals (fires per frame during regen)
  let hotTokens = 0;
  let lethalSaveReadyT = -1e9;   // light.cap 여명 cooldown (game time)
  const lastFormula = { base: 0, power: 1, mastery: 1, atkMul: 1, elementDmg: 1, castMul: 1, conditional: 1, flat: 0, reaction: 1, resist: 1, crit: 1, vulnerable: 1, final: 0 };

  function sget(k, d) { try { const v = stats()?.get?.(k); return v === undefined || v === null ? d : v; } catch (_) { return d; } }
  function derived() { try { return stats()?.derived?.() || null; } catch (_) { return null; } }

  function backstab(t, hit) {
    if (hit.backstab != null) return !!hit.backstab;
    const src = hit.source === 'player' ? game.player?.entity : (typeof hit.source === 'object' ? hit.source : null);
    if (!src?.object || !t.object?.getWorldDirection) return false;
    t.object.getWorldDirection(tvB); tvB.y = 0;
    tvA.subVectors(src.object.position, t.object.position); tvA.y = 0;
    const la = tvA.length(), lb = tvB.length();
    if (la < 1e-3 || lb < 1e-3) return false;
    return tvA.dot(tvB) / (la * lb) < -0.5;   // source behind the target (±60° of its back)
  }

  function inferTier(hit, tags, dmg) {
    if (hit.tier && TIER_RANK[hit.tier] != null) return hit.tier;
    if (tags.includes('ultimate') || tags.includes('finisher')) return 'ult';
    if (hit.heavy || hit.charged || tags.includes('heavy') || tags.includes('charged') || dmg >= 45) return 'heavy';
    return 'light';
  }

  function dealDamage(t, hit = {}) {
    if (!t || !t.alive || t.invulnerable) return NONE;
    if (!t.statuses) t.statuses = {};
    if (!t.velocity) t.velocity = new THREE.Vector3();
    const el = hit.element || 'physical';
    const tags = hit.tags || EMPTY;
    const isDot = !!hit.isDot || tags.includes('dot');
    const isTick = isDot || tags.includes('zone') || tags.includes('tick');
    const isMelee = tags.includes('melee');
    const fromPlayer = isPlayerSource(hit);
    const isProp = !!t.isProp;
    const isPlayerT = t === game.player?.entity || (t.team === 'player' && t.id === 'player');
    const vsFoe = fromPlayer && t.team !== 'player';

    // ally heal hits (team player targets only)
    if (hit.heal && t.team === 'player') {
      const amt = Math.max(0, hit.heal);
      if (isPlayerT) healPlayer(amt, hit.healSource || 'ally', { hot: !!hit.hot });
      else { t.hp = Math.min(t.maxHp || t.hp + amt, (t.hp || 0) + amt); }
      return NONE;
    }

    // 2–3. onBeforeDamage (player HP snapshot) doubles as the block hook (player barrier / guard / dodge / shields)
    let blockMul = 1;
    if (t.onBeforeDamage) {
      let r = null;
      try { r = t.onBeforeDamage(hit); } catch (err) { warnOnce('onBeforeDamage', err); }
      if (r) {
        const bp = hit.point || C.getCenter(t, tvA);
        if (r.parried && hit.source && typeof hit.source === 'object') {
          try { hit.source.onParried?.(t); } catch (err) { warnOnce('onParried', err); }   // +15 break: combat.init 'blocked' listener
        }
        if (r.reflect && hit.projectile?.reflect) { try { hit.projectile.reflect(t); } catch (err) { warnOnce('reflect', err); } }
        if (r.cancel) {
          game.events.emit('blocked', { target: t, parried: !!r.parried, perfect: !!r.perfect, dodged: !!r.dodged, point: bp.clone ? bp.clone() : bp, source: hit.source });
          return { damage: 0, reaction: null, crit: false, killed: false, blocked: true, parried: !!r.parried };
        }
        if (r.mul != null) {
          blockMul = Math.max(0, r.mul);
          game.events.emit('blocked', { target: t, parried: false, perfect: false, point: bp.clone ? bp.clone() : bp, source: hit.source, mul: blockMul });
        }
      }
    }

    const point = hit.point ? new THREE.Vector3().copy(hit.point) : C.getCenter(t, new THREE.Vector3());
    // 5. react (enemy attacks never react on the player; props never react; DoT ticks never react)
    let rx = null;
    if (!hit.noReaction && !isDot && t.team !== 'player' && !isProp) {
      try { rx = C.rx.react(t, el, hit, point); } catch (err) { warnOnce('reaction', err); }
    }
    if (!t.alive) return NONE;
    // 4. void shield (×0.3 while > 0; depletion by poise × factor)
    const shieldK = C.breakFx.shieldMul(t, hit, el, !!rx, hit.amount || 0);

    // 6. formula
    let amount = hit.amount || 0;
    let crit = false;
    const F = lastFormula;
    F.base = amount; F.power = 1; F.mastery = 1; F.atkMul = 1; F.elementDmg = 1; F.castMul = 1; F.conditional = 1; F.flat = 0; F.reaction = 1; F.resist = 1; F.crit = 1; F.vulnerable = 1;
    if (hit.fixed) {
      // fixed-amount hits (judgment %HP, self damage): no scaling except block / shield
    } else if (fromPlayer && !isPlayerT) {
      const der = derived();
      const power = isDot ? (hit.powerSnap ?? der?.power ?? 1) : (der?.power ?? 1);
      let mastery = 1; try { mastery = prog()?.damageMul?.(el) ?? 1; } catch (_) { /* */ }
      const atk = sget('atkMul', 1);
      let edmg = 1; try { edmg = stats()?.elementDmg?.(el) ?? 1; } catch (_) { /* */ }
      const cast = hit.castMul || 1;
      let cond = C.st.takenMul(t, el);
      const bs = !isDot && vsFoe && backstab(t, hit);
      if (bs) { cond *= Math.max(1, sget('backstabMul', 1)); hit.backstab = true; }
      // tree / talent conditionals (feature keys; 1 when unset)
      if (el === 'ice' && !t.statuses.frozen) cond *= sget('iceUnfrozenMul', 1);                        // ice.key 영구동토
      if (t.statuses.airborne || (vsFoe && game.player && game.player.grounded === false)) cond *= sget('airDmgMul', 1);   // wind.p2 공중전
      if (hit.headshot == null && !isTick && hit.point && t.object && game.player?.style === 'bow' && !tags.includes('melee')) {
        hit.headshot = hit.point.y - t.object.position.y > (t.height || 1.6) * 0.78;    // arrows striking the head
      }
      if (hit.headshot) cond *= sget('headshotMul', 1);                                                  // ranger Lv10
      F.power = power; F.mastery = mastery; F.atkMul = atk; F.elementDmg = edmg; F.castMul = cast; F.conditional = cond;
      amount = amount * power * mastery * atk * edmg * cast * cond;
      const flat = C.st.flatBonus(t, el);
      if (flat) { amount += flat * power; F.flat = flat * power; }
      if (rx) { let rd = 1; try { rd = stats()?.reactionDmg?.(rx.id, rx.family) ?? 1; } catch (_) { /* */ } F.reaction = (rx.mult ?? 1) * rd; amount *= F.reaction; }
      else if (hit.rxId) { let rd = 1; try { rd = stats()?.reactionDmg?.(hit.rxId) ?? 1; } catch (_) { /* */ } F.reaction = rd; amount *= rd; }
      const res = t.resist && t.resist[el] != null ? t.resist[el] : 1;
      F.resist = res; amount *= res;
      // v4 punish window (tells.punish → e.vulnerableUntil in game.enemyTime seconds): × e.vulnerableMul after weakness / resist
      F.vulnerable = 1;
      if (t.vulnerableUntil > (game.enemyTime ?? 0) && t.vulnerableMul > 0) { F.vulnerable = t.vulnerableMul; amount *= t.vulnerableMul; }
      if (vsFoe && !isProp && !isTick && !hit.noCrit) {
        const chance = (der?.crit ?? 0.1) + sget('critChance', 0);
        if (hit.crit || Math.random() < chance) { crit = true; F.crit = der?.critMul ?? (1.5 + sget('critMul', 0)); amount *= F.crit; }
      } else if (vsFoe && hit.crit && !isProp) { crit = true; F.crit = der?.critMul ?? 1.5; amount *= F.crit; }
    } else {
      // non-player sources (enemies, env, debug) and player-on-player
      if (rx) amount *= rx.mult ?? 1;
      amount *= C.st.takenMul(t, el);
      if (t.resist && t.resist[el] != null) amount *= t.resist[el];
      const src = hit.source;
      if (src && typeof src === 'object') {
        amount *= (src.zoneDmgMul ?? 1) * C.st.dealtMul(src);
        if (isPlayerT) amount *= game.difficulty?.dmgMul ?? 1;
      }
      if (isPlayerT) {
        amount *= sget('dmgTakenMul', 1);
        if (el === 'lightning') amount *= Math.max(0, 1 - sget('lightningResist', 0));
      }
    }
    // asleep: the first hit wakes ×1.5
    if (t.statuses.asleep && !isDot) { amount *= STATUS_DEFS.asleep.firstHitMul; C.st.removeStatus(t, 'asleep', 'wake'); }
    amount *= blockMul * shieldK;
    let dmg = Math.max(0, Math.round(amount));
    F.final = dmg;
    if (dmg <= 0 && !rx) return NONE;
    dmg = Math.max(1, dmg);

    // 6b. player absorb shield (player.addShield: crystal pickups, aegis, crystallize)
    if (isPlayerT && t.shieldHp > 0) {
      const a = Math.min(t.shieldHp, dmg); t.shieldHp -= a; dmg -= a;
      if (dmg <= 0) { dmg = 0; F.final = 0; }
    }
    // 7. HP
    let killed = false;
    if (t.isDummy) { t.hp = Math.max(1, t.hp - dmg); t._dummyRefill = 3; }
    else { t.hp -= dmg; if (t.hp <= 0) { t.hp = 0; killed = true; } }
    // light.cap 여명: once per lethalSaveCd (120 s) a lethal hit leaves the player at 1 HP with 3 s of invulnerability
    if (killed && isPlayerT && sget('lethalSave', false) && game.time >= lethalSaveReadyT) {
      lethalSaveReadyT = game.time + (sget('lethalSaveCd', 0) || 120);
      killed = false; t.hp = 1;
      try { if (game.player?.grantIframes) game.player.grantIframes(3); else t.invulnerable = true; } catch (_) { /* */ }
      try { game.vfx?.preset?.('impact_light', t.object?.position); } catch (_) { /* */ }
      game.events.emit('lethalSave', { target: t, cd: sget('lethalSaveCd', 0) || 120 });
    }

    // 8. lifesteal (player hits on foes)
    if (vsFoe && !isProp) {
      let ls = (hit.lifesteal || 0) + sget('lifesteal', 0);
      const cr = t.statuses.corroded; if (cr) ls += STATUS_DEFS.corroded.lifestealPerStack * (cr.stacks || 1);
      if (ls > 0) healPlayer(dmg * ls, 'lifesteal');
    }
    // 9. break gauge
    if (vsFoe) { try { C.breakFx.onHit(t, hit, el, !!rx, dmg); } catch (err) { warnOnce('break', err); } }
    // 10. awakening (player damage on real foes; finishers don't refill it)
    if (vsFoe && !isProp && !tags.includes('finisher')) {
      try { prog()?.addAwakening?.(dmg * 0.12 + (rx ? 4 : 0)); } catch (_) { /* */ }
    }
    // 11. statuses from the hit (v4: hit.appliedStatuses = ids actually applied)
    hit.appliedStatuses = EMPTY;
    if (!killed && hit.status && !(rx && rx.skipStatus)) {
      let pw = 1; if (fromPlayer) { const der = derived(); pw = isDot ? (hit.powerSnap ?? 1) : (der?.power ?? 1); }
      for (const k in hit.status) {
        const v = hit.status[k];
        let dur = null, stacks = 0;
        if (typeof v === 'number') dur = v;
        else if (v && typeof v === 'object') { dur = v.dur ?? null; stacks = v.stacks || 0; }
        statusSpec.stacks = stacks; statusSpec.source = hit.source ?? null; statusSpec.power = pw; statusSpec.el = el === 'physical' ? (STATUS_DEFS[k]?.element || null) : el;
        if (C.applyStatus(t, k, dur ?? STATUS_DEFS[k]?.dur ?? 3, statusSpec)) {
          if (hit.appliedStatuses === EMPTY) hit.appliedStatuses = [];
          hit.appliedStatuses.push(k);
        }
      }
    }
    // 12. knockback
    const mass = t.mass || 1;
    let kb = (hit.knockback || 0) * (blockMul < 1 ? 0.35 : 1), launch = rx?.noLaunch ? 0 : (hit.launch || 0) * (blockMul < 1 ? 0 : 1);
    if (rx?.knock) kb = Math.max(kb, rx.knock);
    if (rx?.launch) launch = Math.max(launch, rx.launch);
    if (t.statuses.frozen) { kb *= 0.2; launch *= 0.2; }
    if (isPlayerT && sget('noKnockback', false)) { kb = 0; launch = 0; }
    if ((kb > 0 || launch > 0) && !rx?.slam) {
      const d = tvB;
      if (hit.direction) d.copy(hit.direction).setY(0);
      else d.subVectors(t.object.position, point).setY(0);
      if (d.lengthSq() < 1e-6) d.set(0, 0, 0); else d.normalize();
      const kbMass = Math.max(mass, 1);
      t.velocity.addScaledVector(d, kb / kbMass);
      const hv = Math.hypot(t.velocity.x, t.velocity.z);
      if (hv > 12) { t.velocity.x *= 12 / hv; t.velocity.z *= 12 / hv; }
      if (launch > 0) {
        t.velocity.y = Math.min(Math.max(t.velocity.y, 0) + launch / kbMass, 14);
        t.grounded = false;
        if (launch / mass > 4) C.applyStatus(t, 'airborne', 3);
      }
    }

    // 13. hitFeel — the single caller (CONTRACT §8.3). DoT / zone ticks only flash (unless they kill or react).
    let tier = 'light';
    if (!isTick || rx || killed) {
      let rank = TIER_RANK[inferTier(hit, tags, dmg)];
      if (rx) rank = Math.max(rank, TIER_RANK.reaction);
      if (crit) rank = Math.max(rank, TIER_RANK.crit);
      if (hit.rxSecondary) rank = Math.min(rank, TIER_RANK.heavy);
      tier = RANK_TIER[rank];
      try {
        const dir = hit.direction || (fromPlayer && game.camera ? tvF.subVectors(point, game.camera.position).normalize() : null);
        game.vfx?.hitFeel?.(tier, point, dir, el, FEEL(t, hit, killed, dmg, isMelee, isPlayerT, isProp, isTick, crit));
      } catch (err) { warnOnce('hitFeel', err); }
      if (!isPlayerT && !isProp) C.sfx(killed ? 'enemy_death' : 'enemy_hurt', { position: point, volume: isTick ? 0.35 : 0.6 });
    } else {
      try { game.vfx?.flashEntity?.(t, el === 'fire' ? 0xffa060 : 0xffd0ff, 0.08); } catch (_) { /* */ }
    }

    const result = { damage: dmg, reaction: rx?.id || null, crit, killed, blocked: blockMul < 1, tier, backstab: !!hit.backstab };
    game.events.emit('damage', { target: t, amount: dmg, element: el, point, crit, reaction: result.reaction, killed, isPlayer: isPlayerT || t.team === 'player', isProp, source: hit.source, dot: isTick && !rx && !killed, melee: isMelee, tier, skillId: hit.skillId || null,
      backstab: !!hit.backstab, charged: !!(hit.charged || hit.heavy), slot: hit.slot || null, headshot: !!hit.headshot });
    if (isPlayerT) game.events.emit('playerHurt', hurtPayload(t, hit, dmg, el, isTick && !rx));

    // 14. onHit / onDeath
    if (killed) {
      t.alive = false;
      C.clearStatus(t);
      if (t.isBoss) { try { game.timeScale?.set?.('bossDeath', 0.25, 0.8); } catch (_) { /* */ } }
      try { t.onDeath?.(result, hit); } catch (err) { warnOnce('onDeath', err); }
      game.events.emit('kill', { target: t, source: hit.source, point: point.clone(), xp: t.xpValue || 0, zoneLevel: t.zoneLevel || 1 });
    } else {
      try { t.onHit?.(result, hit); } catch (err) { warnOnce('onHit', err); }
    }
    return result;
  }

  const feelOpts = { target: null, killed: false, dmg: 0, melee: false, playerHurt: false, prop: false, tick: false, dot: false, crit: false, hitstop: null, hitstopMul: 1, noImpactFx: false, boss: false, castId: 0 };
  function FEEL(t, hit, killed, dmg, melee, playerHurt, prop, tick, crit) {
    const o = feelOpts;
    o.target = t; o.killed = killed; o.dmg = dmg; o.melee = melee; o.playerHurt = playerHurt; o.prop = prop; o.tick = tick; o.crit = crit;
    o.hitstop = hit.hitstop ?? null; o.hitstopMul = hit.hitstopMul ?? 1; o.noImpactFx = !!hit.noImpactFx; o.boss = !!t.isBoss;
    o.shake = hit.shake ?? null;
    o.castId = hit.castId || 0; o.dot = !!(hit.isDot || tick);
    return o;
  }

  // ---------------- playerHurt payload (PLAN §7.5) ----------------
  const ATTACK_KINDS = { melee: 1, projectile: 1, hazard: 1, surface: 1 };
  function sourceNameOf(src, hit) {
    if (hit.sourceName) return hit.sourceName;
    if (!src || typeof src !== 'object') return '';
    if (src.nameKo) return src.nameKo;
    try { const c = game.enemies?.codex?.()?.[src.type || src.kind]; if (c?.nameKo) return c.nameKo; } catch (_) { /* */ }
    return src.displayName || src.name || '';
  }
  function hurtPayload(t, hit, dmg, el, dot) {
    const src = hit.sourceEntity || hit.source;
    const so = src && typeof src === 'object' ? src : null;
    const attack = hit.attack || so?.attack || null;
    let kind = attack?.kind;
    if (!ATTACK_KINDS[kind]) kind = hit.projectile ? 'projectile' : dot ? (so?.isSurface ? 'surface' : 'hazard') : 'melee';
    const surface = attack?.surface || hit.surface || (kind === 'surface' && attack?.id ? String(attack.id).replace(/^surface\./, '') : (so?.surface || undefined));
    // dir: unit xz vector from the player toward the attacker (the screen-edge damage arc points there)
    let dx = 0, dz = 0;
    const sp = so?.object?.position || so?.position || null, tp = t.object?.position;
    if (sp && tp && sp !== tp) { dx = sp.x - tp.x; dz = sp.z - tp.z; }
    else if (hit.direction) { dx = -hit.direction.x; dz = -hit.direction.z; }
    const L = Math.hypot(dx, dz); if (L > 1e-5) { dx /= L; dz /= L; } else { dx = 0; dz = 0; }
    return {
      amount: dmg, element: el, source: hit.source ?? null, sourceName: sourceNameOf(so, hit),
      attackId: attack?.id ?? (dot && hit.statusId ? 'status.' + hit.statusId : null), attackNameKo: attack?.nameKo ?? '', attackKind: kind,
      appliedStatuses: hit.appliedStatuses || EMPTY, dot: !!dot, surface, dir: { x: dx, z: dz }, time: game.time, attack: attack || null,
    };
  }

  // ---------------- healing ----------------
  function bossFight() {
    const b = game.enemies?.boss;
    const pe = game.player?.entity;
    if (!b || !b.alive || !b.isBoss || !pe) return false;
    const bp = b.object?.position; if (!bp) return true;
    return bp.distanceToSquared(pe.object.position) < 75 * 75;
  }
  /** healPlayer(amount, source, {hot}) — healMul applies; in boss fights HoT (+ regen) is clamped to 5% maxHp/s. Returns healed HP. */
  function healPlayer(amount, source = 'heal', opts) {
    const pl = game.player, pe = pl?.entity;
    if (!pe || !pe.alive || !(amount > 0)) return 0;
    let amt = amount * sget('healMul', 1);
    if (!NATURE_HEAL.has(source)) amt *= sget('nonNatureHealMul', 1);   // nature.key: non-nature heals −50% (regen exempt)
    if (opts?.hot && bossFight()) { amt = Math.min(amt, Math.max(0, hotTokens)); hotTokens -= amt; }
    const max = pl.maxHp ?? pe.maxHp ?? 100;
    const cur = pl.hp ?? pe.hp;
    const nv = Math.min(max, cur + amt);
    const healed = nv - cur;
    if (healed <= 0) return 0;
    if ('hp' in pl) pl.hp = nv; else pe.hp = nv;
    if (opts?.hot) { healEv.target = pe; healEv.amount = healed; healEv.source = source; game.events.emit('heal', healEv); }
    else game.events.emit('heal', { target: pe, amount: healed, source });
    return healed;
  }
  function update(dt) {
    const pl = game.player;
    const max = pl?.maxHp ?? 100;
    const cap = max * 0.05 * 0.1;
    hotTokens = Math.min(cap, hotTokens + max * 0.05 * dt);
  }

  return { dealDamage, healPlayer, isPlayerSource, update, lastFormula, bossFight, TIER_RANK };
}
