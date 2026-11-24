// Every Ukrainian UI string has an English translation, and the inlined dictionary is up to date.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, harness } from './lib.mjs';

const t = harness('i18n');
const out = execFileSync(process.execPath, [join(ROOT, 'tools', 'i18n.mjs')], { cwd: ROOT }).toString();
const m = out.match(/(\d+) without English/);
t.check('all UI strings translated', m && m[1] === '0', out.split('\n').slice(0, 6).join(' | '));
const dict = JSON.parse(readFileSync(join(ROOT, 'tools', 'i18n-en.json'), 'utf8'));
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const block = html.match(/<script id="i18n-en" type="application\/json">([\s\S]*?)<\/script>/);
let inlined = {};
try { inlined = JSON.parse(block[1]); } catch (e) { /* reported below */ }
const same = block && JSON.stringify(inlined) === JSON.stringify(dict);
t.check('dictionary inlined in index.html is up to date', same, same ? '' : 'run: node tools/i18n.mjs --inline');
t.done();
