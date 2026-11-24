#!/usr/bin/env node
// Rebuilds the inline SVG sprite in an index.html from the icon sources.
// Usage: node tools/build-icons.mjs [index.html] [icons-dir]   (defaults: ./index.html, tools/icons)
// Source of truth: one file per icon, <icons-dir>/NAME.svg (24x24, stroke style). The sprite lives between
// <!-- icons:start --> and <!-- icons:end --> (inserted right after <body …> if the markers are missing).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] || path.join(here, '..', 'index.html');
const dir = process.argv[3] || (fs.existsSync(path.join(here, 'icons')) ? path.join(here, 'icons') : path.join(here, 'icons'));
const START = '<!-- icons:start -->';
const END = '<!-- icons:end -->';

const names = fs.readdirSync(dir).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)).sort();
if (!names.length) { console.error('no icons in ' + dir); process.exit(1); }
const symbols = names.map(n => {
  const src = fs.readFileSync(path.join(dir, n + '.svg'), 'utf8');
  const m = src.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
  if (!m) throw new Error(n + ': no <svg> element');
  const inner = m[1].trim().replace(/\s*\n\s*/g, '');
  if (/<script|on\w+=|href=/i.test(inner)) throw new Error(n + ': unsafe content');
  return `<symbol id="i-${n}" viewBox="0 0 24 24">${inner}</symbol>`;
});
const block = `${START}\n<svg id="vl-icons" style="display:none" aria-hidden="true" focusable="false">\n${symbols.join('\n')}\n</svg>\n${END}`;

let html = fs.readFileSync(target, 'utf8');
const a = html.indexOf(START), b = html.indexOf(END);
if (a >= 0 && b > a) html = html.slice(0, a) + block + html.slice(b + END.length);
else {
  const m = html.match(/<body[^>]*>/);
  if (!m) throw new Error('no <body> in ' + target);
  const at = m.index + m[0].length;
  html = html.slice(0, at) + '\n' + block + html.slice(at);
}
fs.writeFileSync(target, html);
console.log(`icons: ${names.length} symbols -> ${target}`);
