// Syntax check of every inline <script> in index.html (worker sources included) with `node --check`.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, harness } from './lib.mjs';

const t = harness('syntax');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'vlc-syntax-'));
let n = 0;
for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const attrs = m[1];
  if (/application\/(ld\+)?json/.test(attrs) || /\ssrc=/.test(attrs)) continue;
  n++;
  const id = (attrs.match(/id="([^"]+)"/) || [])[1] || `#${n}`;
  const file = join(dir, `s${n}.js`);
  writeFileSync(file, m[2]);
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); t.check(`script ${id}`, true); }
  catch (e) { t.check(`script ${id}`, false, String(e.stderr).split('\n').slice(0, 5).join(' | ')); }
}
for (const f of ['sw.js']) {
  try { execFileSync(process.execPath, ['--check', join(ROOT, f)], { stdio: 'pipe' }); t.check(f, true); }
  catch (e) { t.check(f, false, String(e.stderr).slice(0, 300)); }
}
t.check('found scripts', n >= 5, `${n} scripts`);
JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
t.check('manifest is valid JSON', true);
rmSync(dir, { recursive: true, force: true });
t.done();
