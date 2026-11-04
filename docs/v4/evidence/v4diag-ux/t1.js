const { open } = require('/tmp/v4diag-ux/h.js');
(async () => {
  const H = await open('', { wait: true });
  await H.ev(() => game.freeze(true));
  await H.ev(() => { document.querySelector('[data-act="start"]').click(); });
  const t0 = Date.now();
  for (let i = 0; i < 12; i++) {
    await H.step(4);
    const s = await H.state(); console.log(i, JSON.stringify(s));
    if (i % 2 === 0 || s.state === 'playing') await H.p.screenshot({ path: `/tmp/v4diag-ux/02_intro_${i}.png`, timeout: 120000 });
    if (s.state === 'playing') break;
  }
  console.log('ms', Date.now() - t0);
  console.log(H.logs.slice(0, 10).join('\n'));
  await H.close();
})();
