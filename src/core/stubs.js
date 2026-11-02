// Minimal fallbacks used by main.js when a module file is missing or fails to load.
// They let each module be developed and tested in isolation. Not used in the final game.
import * as THREE from 'three';
import { toonMat } from './utils.js';

const noop = () => {};

export const stubs = {
  world(game) {
    const g = new THREE.PlaneGeometry(400, 400); g.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(g, toonMat(0x7fbf5a)); ground.receiveShadow = true;
    game.scene.add(ground);
    game.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x6a8a4a, 1.2));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2); sun.position.set(30, 60, 20); game.scene.add(sun);
    game.scene.background = new THREE.Color(0x9fd3ff);
    game.scene.fog = new THREE.Fog(0x9fd3ff, 60, 300);
    return {
      update: noop,
      getHeight: () => 0,
      getNormal: (x, z, out = new THREE.Vector3()) => out.set(0, 1, 0),
      raycast(origin, dir, maxDist = 200) {
        if (dir.y >= -1e-4) return null;
        const t = -origin.y / dir.y; if (t > maxDist) return null;
        return origin.clone().addScaledVector(dir, t);
      },
      resolveCollision: noop,
      isInWater: () => false, waterLevel: -10,
      colliders: [],
      playerSpawn: new THREE.Vector3(0, 0, 20),
      trainingArea: new THREE.Vector3(0, 0, 5),
      camps: [
        { id: 'camp0', position: new THREE.Vector3(-30, 0, -10), radius: 12 },
        { id: 'camp1', position: new THREE.Vector3(30, 0, -20), radius: 12 },
        { id: 'camp2', position: new THREE.Vector3(0, 0, -45), radius: 12 },
      ],
      bossArena: { position: new THREE.Vector3(0, 0, -80), radius: 20 },
      bounds: 190,
    };
  },
  vfx(game) {
    const api = new Proxy({ update: noop, textures: {} }, {
      get(t, k) { if (k in t) return t[k]; return () => ({ stop: noop, setPosition: noop, alive: false }); },
    });
    return api;
  },
  combat(game) {
    return {
      update: noop, REACTIONS: [], discovered: new Set(),
      register(e) { game.entities.push(e); },
      unregister(e) { const i = game.entities.indexOf(e); if (i >= 0) game.entities.splice(i, 1); },
      dealDamage(t, hit) {
        if (!t.alive) return { damage: 0 };
        t.hp -= hit.amount; const killed = t.hp <= 0;
        if (hit.direction) t.velocity?.addScaledVector(hit.direction, (hit.knockback || 0) / (t.mass || 1));
        game.events.emit('damage', { target: t, amount: hit.amount, element: hit.element, point: hit.point, killed, isPlayer: t.team === 'player' });
        if (killed) { t.alive = false; t.onDeath?.({ killed }, hit); game.events.emit('kill', { target: t }); }
        else t.onHit?.({ damage: hit.amount }, hit);
        return { damage: hit.amount, killed };
      },
      applyStatus: noop, hasStatus: () => false, clearStatus: noop,
      canAct: () => true, speedMul: () => 1,
      queryRadius(p, r, team) {
        return game.entities.filter((e) => e.alive && (!team || e.team === team) &&
          e.object.position.distanceTo(p) < r + (e.radius || 0.5));
      },
      raycastEntities: () => null,
    };
  },
  audio() { return { update: noop, play: noop, loop: () => ({ stop: noop, setVolume: noop }), resume: noop }; },
  player(game) {
    const object = new THREE.Object3D(); object.position.copy(game.world.playerSpawn); game.scene.add(object);
    const entity = { id: 'player', team: 'player', alive: true, object, radius: 0.4, height: 1.8, hp: 100, maxHp: 100, mass: 1, velocity: new THREE.Vector3(), grounded: true, statuses: {} };
    game.combat.register(entity);
    const tip = new THREE.Vector3();
    return {
      entity, object, hp: 100, maxHp: 100, mp: 100, maxMp: 100, stamina: 100, maxStamina: 100,
      update() {
        game.camera.position.set(object.position.x, object.position.y + 4, object.position.z + 8);
        game.camera.lookAt(object.position.x, object.position.y + 1.5, object.position.z - 10);
      },
      spendMp: () => true,
      getStaffTip: (out = new THREE.Vector3()) => out.copy(object.position).add(tip.set(0.5, 1.6, -0.3)),
      getAim() {
        const origin = object.position.clone().add(new THREE.Vector3(0.5, 1.6, -0.3));
        const dir = new THREE.Vector3(); game.camera.getWorldDirection(dir);
        const point = origin.clone().addScaledVector(dir, 60);
        return { origin, dir, point, target: null };
      },
      playCast: noop, setCharging: noop, setStaffElement: noop,
    };
  },
  spells() {
    return { update: noop, elements: [], index: 0, element: 'fire',
      getHudState: () => ({ element: 'fire', index: 0, elements: [], slots: [], charging: false, chargeFrac: 0 }) };
  },
  enemies() { return { update: noop, list: [], getObjective: () => ({ phase: 'camps', campsCleared: 0, campsTotal: 3, boss: null }) }; },
  ui(game) { return { update: noop, toast: noop, init() { if (game.isTest) game.start(); else document.addEventListener('click', () => game.state === 'title' && game.start(), { once: true }); } }; },
};
