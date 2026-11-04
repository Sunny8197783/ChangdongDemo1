// v4 play-test runner (PLAN v4 §7.8). Owned by core.
// Usage: node tools/playtest4.js [owner …] [--perf] [--full] [--sheets] [--list]
//   Loads tools/playtest4/<owner>.js sections (each owned by its owner) and runs them against the shared PT harness
//   (tools/playtest4/harness.js). With no owner arguments every section present runs in ORDER. Exit code 1 on any failure.
//   --full   every class / boss scene (default: F-mage, F-ranger, B-nidhoggra, R-mage, R-sword, R-boss, all S-*)
//   --perf   the C8 hard gates (GPU ratios vs v3, long frames, allocation, transitions, soak)
//   --sheets the §1.8 contact sheets (magic, melee, mobmodels, bosses)
// A section exports: module.exports = async function (PT) { const pg = await PT.boot('&cls=mage'); await pg.run(…); … }
// PT.flags = {perf, full, sheets} tells a section which optional parts to run.
const fs = require('fs'); const path = require('path');
const { createHarness } = require('./playtest4/harness.js');

const ORDER = ['core', 'world', 'vfx', 'tells', 'mobs', 'mobmodels', 'bosses', 'magic', 'melee', 'player', 'ux'];
const args = process.argv.slice(2);
const dir = path.join(__dirname, 'playtest4');
const available = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'harness.js').map((f) => f.slice(0, -3));
if (args.includes('--list')) { console.log(ORDER.filter((o) => available.includes(o)).concat(available.filter((a) => !ORDER.includes(a))).join('\n')); process.exit(0); }
const flags = { perf: args.includes('--perf'), full: args.includes('--full'), sheets: args.includes('--sheets') };
const wanted = args.filter((a) => !a.startsWith('--'));
const sections = (wanted.length ? wanted : ORDER.filter((o) => available.includes(o)).concat(available.filter((a) => !ORDER.includes(a))))
  .filter((s) => { if (!available.includes(s)) { console.log(`(no section tools/playtest4/${s}.js)`); return false; } return true; });

let PT = null;
async function shutdown(code) { try { await PT?.stop(); } catch (_) { /* */ } process.exit(code); }
process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

(async () => {
  PT = createHarness({ flags });
  const t0 = Date.now();
  if (PT.missing.length) console.log(`module files not present (core stubs): ${PT.missing.join(', ')}`);
  console.log(`flags: ${JSON.stringify(flags)}`);
  for (const s of sections) {
    console.log(`\n=== ${s} ===`);
    PT.setSection(s);
    const ts = Date.now();
    try {
      const fn = require(path.join(dir, s + '.js'));
      await (typeof fn === 'function' ? fn : fn.run)(PT);
    } catch (err) {
      PT.check(`section ${s} crashed`, false, String(err && err.stack || err).slice(0, 800));
    }
    console.log(`  (${s}: ${((Date.now() - ts) / 1000).toFixed(0)} s)`);
  }
  await PT.stop();
  const sum = PT.summary();
  console.log(`\n=== playtest4: ${sum.pass} passed, ${sum.fail} failed, ${sum.skip} skipped (${((Date.now() - t0) / 1000).toFixed(0)} s) ===`);
  if (sum.failures.length) console.log('FAILURES:\n  ' + sum.failures.join('\n  '));
  process.exit(sum.fail ? 1 : 0);
})().catch(async (err) => { console.error(err); await shutdown(1); });
