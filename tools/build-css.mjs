// Rebuilds the Tailwind CSS inlined into index.html, so the page works offline.
// Run after changing classes in index.html: node tools/build-css.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const pagePath = join(dir, '..', 'index.html');

const css = execFileSync('npx', ['-y', 'tailwindcss@3.4.17',
  '-c', join(dir, 'tailwind.config.js'),
  '-i', join(dir, 'tailwind.css'),
  '--minify'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const page = readFileSync(pagePath, 'utf8');
const block = /(<style id="inline-tailwind">)[\s\S]*?(<\/style>)/;
if (!block.test(page)) throw new Error('<style id="inline-tailwind"> not found in index.html');
writeFileSync(pagePath, page.replace(block, (_, open, close) => `${open}\n${css.trim()}\n  ${close}`));
console.log(`Inlined ${css.length} bytes of CSS into index.html`);
