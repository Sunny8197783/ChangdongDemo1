// persistent driver: node drv.js "<query>" ; then POST js to http://127.0.0.1:9101 (async body with H in scope)
const { open } = require('/tmp/v4diag-ux/h.js'); const http = require('http');
(async () => {
  const H = await open(process.argv[2] || '', { wait: true });
  await H.ev(() => game.freeze(true));
  http.createServer((req, res) => { let body = ''; req.on('data', d => body += d); req.on('end', async () => {
    try { const fn = eval(`(async (H) => { ${body} })`); const r = await fn(H); res.end(JSON.stringify(r, null, 1) + '\n--logs:' + H.logs.splice(0).slice(0, 15).join('\n')); }
    catch (e) { res.end('ERR ' + e.stack); }
  }); }).listen(+process.argv[3] || 9101, '127.0.0.1');
  console.log('READY');
})();
