// Keeps the English UI dictionary in sync with index.html.
//   node tools/i18n.mjs            — list Ukrainian UI strings that have no English translation yet
//   node tools/i18n.mjs --json     — print them as a JSON array (for translating)
//   node tools/i18n.mjs --inline   — inline tools/i18n-en.json into index.html (<script id="i18n-en">)
// Ukrainian text in the markup and code is the source; strings with ${...} become patterns with {0}, {1}...
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const pagePath = join(dir, '..', 'index.html');
const dictPath = join(dir, 'i18n-en.json');
const page = readFileSync(pagePath, 'utf8');
const CYR = /[А-ЯҐЄІЇа-яґєії]/;
const norm = (s) => s.replace(/\s+/g, ' ').trim();

export function extract(html) {
  const found = new Set();
  const add = (s) => { s = norm(s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')); if (CYR.test(s)) found.add(s); };
  // app and worker scripts (not the inlined libraries or the dictionary itself)
  const scripts = [];
  let markup = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (m, attrs, body) => {
    if (!/id="(lib-|i18n-)/.test(attrs)) scripts.push(body);
    return '';
  }).replace(/<style\b[\s\S]*?<\/style>/g, '');
  for (const m of markup.matchAll(/>([^<>]+)</g)) add(m[1]);
  for (const m of markup.matchAll(/\b(?:title|placeholder|aria-label|alt)="([^"]*)"/g)) add(m[1]);
  for (const code of scripts) {
    // quoted strings anywhere, including inside ${...} of template literals
    for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
      const q = (m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"');
      if (!CYR.test(q)) continue;
      if (!q.includes('${')) { for (const part of q.split(/<[^>]+>/)) add(part); continue; }
      for (const inner of q.matchAll(/'((?:[^'\\]|\\.)*)'/g)) for (const part of inner[1].split(/<[^>]+>/)) add(part);
    }
    for (const m of code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
      let s = m[1] ?? m[2] ?? m[3];
      if (!CYR.test(s)) continue;
      s = s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
      if (m[3] !== undefined) {
        // template literal: split out markup, turn ${...} into numbered placeholders
        let n = 0;
        s = s.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, () => `{${n++}}`);
        for (const part of s.split(/<[^>]+>/)) if (CYR.test(part)) add(part.replace(/^[^\S\n]*\{\d+\}[^\S\n]*$/, ''));
      } else {
        for (const part of s.split(/<[^>]+>/)) add(part);
      }
    }
  }
  return [...found];
}

const dict = existsSync(dictPath) ? JSON.parse(readFileSync(dictPath, 'utf8')) : {};
const strings = extract(page);
const missing = strings.filter(s => !(s in dict));

if (process.argv.includes('--inline')) {
  const json = JSON.stringify(dict).replace(/</g, '\\u003c');
  const block = /(<script id="i18n-en" type="application\/json">)[\s\S]*?(<\/script>)/;
  if (!block.test(page)) throw new Error('<script id="i18n-en"> not found in index.html');
  writeFileSync(pagePath, page.replace(block, (_, a, b) => `${a}${json}${b}`));
  console.log(`Inlined ${Object.keys(dict).length} translations; ${missing.length} strings still untranslated`);
} else if (process.argv.includes('--json')) {
  console.log(JSON.stringify(missing, null, 1));
} else {
  console.log(`${strings.length} Ukrainian strings, ${missing.length} without English:`);
  for (const s of missing) console.log('  ' + s);
}
