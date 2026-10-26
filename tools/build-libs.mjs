// Rebuilds the JavaScript libraries inlined into index.html, so the page works offline.
// Versions are pinned below. Run: node tools/build-libs.mjs (needs Node.js and access to the npm registry)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGES = [
  'mediabunny@1.61.4', // MPL-2.0
  '@mediabunny/mp3-encoder@1.61.4', // MPL-2.0, LAME (LGPL) inside
  'gifenc@1.0.3', // MIT
  'mp4box@0.5.2', // BSD-3-Clause
  'esbuild@0.24.2'
];

const dir = dirname(fileURLToPath(import.meta.url));
const pagePath = join(dir, '..', 'index.html');
const work = mkdtempSync(join(tmpdir(), 'vlp-libs-'));

try {
  execFileSync('npm', ['init', '-y'], { cwd: work, stdio: 'ignore' });
  execFileSync('npm', ['install', '--no-audit', '--no-fund', ...PACKAGES], { cwd: work, stdio: 'inherit' });

  // One IIFE bundle exposing globals for both the page and the workers
  writeFileSync(join(work, 'entry.mjs'), [
    "import * as Mediabunny from 'mediabunny';",
    "import { registerMp3Encoder } from '@mediabunny/mp3-encoder';",
    "import { GIFEncoder, quantize, applyPalette } from 'gifenc';",
    'globalThis.Mediabunny = Mediabunny;',
    'globalThis.registerMp3Encoder = registerMp3Encoder;',
    'globalThis.gifenc = { GIFEncoder, quantize, applyPalette };'
  ].join('\n'));
  execFileSync(join(work, 'node_modules', '.bin', 'esbuild'), [
    'entry.mjs', '--bundle', '--format=iife', '--minify', '--legal-comments=none', '--target=chrome110', '--outfile=media.min.js'
  ], { cwd: work, stdio: 'inherit' });

  const libs = {
    'lib-media': readFileSync(join(work, 'media.min.js'), 'utf8').trim(),
    'lib-mp4box': readFileSync(join(work, 'node_modules', 'mp4box', 'dist', 'mp4box.all.min.js'), 'utf8').trim()
  };

  let page = readFileSync(pagePath, 'utf8');
  for (const [id, code] of Object.entries(libs)) {
    if (/<\/script/i.test(code)) throw new Error(`${id} contains "</script" and can't be inlined`);
    const block = new RegExp(`(<script id="${id}">)[\\s\\S]*?(<\\/script>)`);
    if (!block.test(page)) throw new Error(`<script id="${id}"> not found in index.html`);
    page = page.replace(block, (_, open, close) => `${open}\n${code}\n  ${close}`);
    console.log(`Inlined ${id}: ${code.length} bytes`);
  }
  writeFileSync(pagePath, page);
} finally {
  rmSync(work, { recursive: true, force: true });
}
