// body for r.sh: fight nearest enemies; params via globalThis.FP
const FP = globalThis.FP || {};
let shots = 0, log = [];
await H.ev(() => { if (!window.__hk) { window.__hk = 1; window.__hurt = []; game.events.on('playerHurt', (p) => window.__hurt.push({ t: +game.time.toFixed(2), a: Math.round(p?.amount || p?.damage || 0), k: Object.keys(p || {}).join(',') })); } });
for (let i = 0; i < (FP.iters || 160); i++) {
  const info = await H.ev((R) => {
    const p = game.player.object.position;
    const en = game.entities.filter(e => e.team === 'enemy' && e.alive && e.hp > 0 && !e.isDummy).map(e => ({ e, d: Math.hypot(e.object.position.x - p.x, e.object.position.z - p.z) })).filter(x => x.d < R).sort((a, b) => a.d - b.d);
    const n = en[0]; if (n) { const dx = n.e.object.position.x - p.x, dz = n.e.object.position.z - p.z; game.player.setLook(Math.atan2(-dx, -dz), -0.1); }
    return { near: n ? { name: n.e.name, d: +n.d.toFixed(1), st: n.e.state } : null, winding: en.filter(x => /windup|Prep|cast|lob|leap|aim|charge|tele/.test(x.e.state)).map(x => x.e.name + ':' + x.e.state + '@' + x.d.toFixed(1)), hp: Math.round(game.player.hp), n: en.length, state: game.state };
  }, FP.R || 30);
  if (i % 10 === 0) log.push(JSON.stringify(info));
  if (info.state === 'dead') { log.push('DEAD'); break; }
  if (info.winding.length && shots < (FP.maxShots || 3) && i > 3 && i % 3 === 0) { await H.shot((FP.prefix || 'fight') + '_' + shots); shots++; log.push('SHOT ' + shots + ' ' + info.winding.join(',')); }
  if (!info.near) break;
  if (FP.passive) { await H.step(0.25); continue; }
  const k = i % 8;
  if (info.near.d > (FP.range || 13)) await H.step(0.25, { KeyW: true }, { 0: true });
  else if (k === 3) { await H.step(0.1, { Digit1: true }); }
  else await H.step(0.25, null, { 0: true });
  await H.release();
}
return { log, hurt: await H.ev(() => window.__hurt.splice(0)), hp: await H.ev(() => game.player.hp), st: await H.ev(() => game.state), obj: (await H.state()).obj?.desc };
