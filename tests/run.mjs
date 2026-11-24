// Runs every test file one by one; exit code 1 if any failed.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const only = process.argv.slice(2);
const suites = (only.length ? only : ['syntax', 'i18n', 'converter', 'editor', 'projectfile', 'proxy', 'ui']);
let failed = [];
for (const s of suites) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync(process.execPath, [join(ROOT, 'tests', s + '.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(s);
}
console.log(failed.length ? `\nFAILED: ${failed.join(', ')}` : '\nAll suites passed');
process.exit(failed.length ? 1 : 0);
