// Objective beacon (PLAN v4 §6.3): world.setBeacon(pos | null, {kind:'quest'|'camp'|'boss'}).
// A thin unlit light pillar (40 m, soft vertical fade + view-angle edge fade) and a ground ring: 2 draw calls, both
// materials created and warmed at build (game.render.warm, now). The pillar's alpha fades out within 15 m of the
// player and when the objective is reached (≤ REACH m); hidden (0 calls) when no beacon is set or fully faded.
// Colours avoid the reserved threat hues (red / yellow / magenta; core/threat.js).
import * as THREE from 'three';

export const BEACON_KINDS = { quest: 0x8fe8ff, camp: 0xffa860, boss: 0xb994ff };
const HEIGHT = 40, RADIUS = 0.32, FADE_NEAR = 15, REACH = 4;

export function buildBeacon(game, world) {
  const group = new THREE.Group(); group.name = 'beacon'; group.userData.dynamic = true;   // moves on set(): keep matrixAutoUpdate
  const uColor = { value: new THREE.Color(BEACON_KINDS.quest) };
  const uAlpha = { value: 0 }, uTime = { value: 0 };
  const pillarGeo = new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, 10, 1, true);
  pillarGeo.translate(0, HEIGHT / 2, 0);
  const pillar = new THREE.Mesh(pillarGeo, new THREE.ShaderMaterial({
    uniforms: { uColor, uAlpha, uTime },
    vertexShader: /* glsl */`
      varying float vH; varying float vEdge;
      void main(){
        vH = position.y / ${HEIGHT.toFixed(1)};
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vEdge = abs(dot(n, normalize(cameraPosition - wp.xyz)));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying float vH; varying float vEdge;
      void main(){
        float a = smoothstep(0.0, 0.04, vH) * (1.0 - smoothstep(0.35, 1.0, vH)) * smoothstep(0.05, 0.6, vEdge);
        a *= 0.55 + 0.1 * sin(uTime * 2.0 - vH * 9.0);
        gl_FragColor = vec4(uColor, a * uAlpha);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  pillar.name = 'beaconPillar'; pillar.renderOrder = 8; pillar.frustumCulled = false;
  const ringGeo = new THREE.RingGeometry(1.7, 2.2, 48, 1); ringGeo.rotateX(-Math.PI / 2);
  const uRingA = { value: 0 };
  const ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
    uniforms: { uColor, uAlpha: uRingA, uTime },
    vertexShader: /* glsl */`varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying vec2 vP;
      void main(){
        float r = length(vP); float band = 1.0 - abs(r - 1.95) / 0.25;
        gl_FragColor = vec4(uColor, smoothstep(0.0, 0.6, band) * (0.6 + 0.2 * sin(uTime * 3.0)) * uAlpha);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false,
  }));
  ring.name = 'beaconRing'; ring.renderOrder = 8;
  group.add(pillar, ring);
  game.scene.add(group);
  // warm both programs now (objects are hidden right after)
  try { game.render?.warm?.(group, { target: 'scene', now: true }); } catch (_) { /* */ }
  group.visible = false;

  const target = new THREE.Vector3();
  let active = false, kind = 'quest', reached = false, fade = 0;
  const api = {
    group, pillar, ring,
    get active() { return active; }, get kind() { return kind; }, get reached() { return reached; },
    get position() { return active ? target : null; },
    /** Alpha the pillar drew with on the last frame (0..1). */
    get alpha() { return group.visible ? uAlpha.value : 0; },
    set(pos, opts = {}) {
      if (!pos) { active = false; group.visible = false; return; }
      kind = BEACON_KINDS[opts.kind] ? opts.kind : 'quest';
      uColor.value.setHex(BEACON_KINDS[kind]);
      const y = world.getGroundHeight ? world.getGroundHeight(pos.x, pos.z) : world.getHeight(pos.x, pos.z);
      target.set(pos.x, Number.isFinite(pos.y) ? Math.max(pos.y, y) : y, pos.z);
      group.position.copy(target); group.updateMatrix(); group.updateMatrixWorld(true);
      active = true; reached = false; fade = 0;
    },
    update(realDt, t) {
      if (!active) return;
      uTime.value = t;
      const pp = game.player?.object?.position;
      const d = pp ? Math.hypot(pp.x - target.x, pp.z - target.z) : 1e9;
      if (d < REACH) reached = true;
      const goal = reached ? 0 : Math.min(1, Math.max(0, (d - 3) / (FADE_NEAR - 3)));
      fade += (goal - fade) * Math.min(1, realDt * 4);
      if (Math.abs(goal - fade) < 0.002) fade = goal;
      uAlpha.value = fade;
      uRingA.value = reached ? 0 : Math.max(0.35, fade);
      group.visible = !reached || fade > 0.003;
    },
  };
  return api;
}
