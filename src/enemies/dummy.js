// 수련용 허수아비 — straw training dummy on a post. Never dies (combat clamps hp for isDummy), wobbles on hit.
import * as THREE from 'three';
import { buildDummy } from './models.js';
import { Spring } from './common.js';
import { makeEnemy } from './base.js';

export function createDummy(ctx, pos, opts = {}) {
  const model = buildDummy();
  const e = makeEnemy(ctx, {
    kind: 'dummy', model, name: '수련용 허수아비', hp: 300, radius: 0.45, height: 2.3, mass: 6, isDummy: true,
    facing: opts.facing ?? 0, noTumble: true,
  }, pos);
  const wx = new Spring(90, 3.2), wz = new Spring(90, 3.2), spin = new Spring(40, 2.5);
  e.react = (result, hit, lx, lz) => {
    const a = 1.2 + Math.min(4, (result?.damage || 0) / 12) * (hit?.heavy ? 1.6 : 1);
    wx.kick(lz * a); wz.kick(-lx * a);
    spin.kick((Math.random() - 0.5) * a * 2);
    e.flX.reset(); e.flZ.reset();
  };
  e.think = () => {};
  e.pose = (dt) => {
    const r = model.rig;
    r.rotation.set(wx.update(dt) * 0.25, spin.update(dt) * 0.3, wz.update(dt) * 0.25);
    e.flX.reset(); e.flZ.reset();
  };
  e.object.position.y = ctx.game.world.getHeight(pos.x, pos.z);
  return e;
}
