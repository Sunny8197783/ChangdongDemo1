const { open } = require('/tmp/v4diag-ux/h.js');
(async () => {
  const H = await open('', { wait: true });
  await H.ev(() => game.freeze(true));
  await H.p.waitForTimeout(500);
  await H.p.screenshot({ path: '/tmp/v4diag-ux/00_title.png', timeout: 120000 });
  console.log(await H.uiText());
  console.log(await H.ev(() => ({ state: game.state, fps: game.fps, perfScale: game.perfScale, q: game.settings?.get?.('effectQuality') })));
  console.log(H.logs.slice(0, 10).join('\n'));
  await H.close();
})();
