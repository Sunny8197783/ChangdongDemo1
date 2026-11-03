// v3 play-test runner (CONTRACT §21). Owned by core.
// Usage: node tools/playtest3.js [owner …] [--list]
//   Loads tools/playtest3/<owner>.js sections (each owned by its owner) and runs them against a shared PT harness.
//   With no owner arguments, every section file present is run (core first). Exit code 1 when any check fails.
// A section exports: module.exports = async function (PT) { const pg = await PT.boot('&cls=mage'); await pg.run(...); … }
const fs = require('fs'); const path = require('path');
const { createHarness } = require('./playtest3/harness.js');

const ORDER = ['core', 'skills', 'combat', 'player', 'world', 'ui', 'magic', 'melee', 'enemies', 'narrative'];
const args = process.argv.slice(2);
const dir = path.join(__dirname, 'playtest3');
const available = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'harness.js').map((f) => f.slice(0, -3));
if (args.includes('--list')) { console.log(available.join('\n')); process.exit(0); }
const wanted = args.filter((a) => !a.startsWith('--'));
const sections = (wanted.length ? wanted : ORDER.filter((o) => available.includes(o)).concat(available.filter((a) => !ORDER.includes(a))))
  .filter((s) => { if (!available.includes(s)) { console.log(`(no section tools/playtest3/${s}.js)`); return false; } return true; });

(async () => {
  const PT = createHarness();
  const t0 = Date.now();
  if (PT.missing.length) console.log(`module files not present yet (stubbed): ${PT.missing.join(', ')}`);
  for (const s of sections) {
    console.log(`\n=== ${s} ===`);
    PT.setSection(s);
    try {
      const fn = require(path.join(dir, s + '.js'));
      await (typeof fn === 'function' ? fn : fn.run)(PT);
    } catch (err) {
      PT.check(`section ${s} crashed`, false, String(err && err.stack || err).slice(0, 800));
    }
  }
  await PT.stop();
  const sum = PT.summary();
  console.log(`\n=== playtest3: ${sum.pass} passed, ${sum.fail} failed, ${sum.skip} skipped (${((Date.now() - t0) / 1000).toFixed(0)} s) ===`);
  if (sum.failures.length) console.log('FAILURES:\n  ' + sum.failures.join('\n  '));
  process.exit(sum.fail ? 1 : 0);
})();
