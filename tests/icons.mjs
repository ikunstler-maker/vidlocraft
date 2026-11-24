// Icons: no emoji / pictographic symbols left in the UI (any tab, popover, panel, modal), every <use href="#i-…"> resolves,
// every icon-only button has an accessible name, phone width has no horizontal scroll. Screenshots go to t-icons/.
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeMedia, openPage, harness } from './lib.mjs';

const t = harness('icons');
const media = makeMedia();
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), '..', 't-icons');
mkdirSync(SHOTS, { recursive: true });

// Scans the whole DOM (also hidden modals): text nodes, attributes, document.title. Returns offending strings.
const scan = (page) => page.evaluate(() => {
  const PICT = /\p{Extended_Pictographic}/u;
  const EXTRA = /[↶↷⧉☰⇤⇥✕▣◐⌖❚⇆↺▾◀▶⏮⏭⏸⏹✓✔]/u; // glyph "icons" that are not (all) pictographic
  const bad = (s) => { const x = s.replace(/[©®™️]/g, ''); return PICT.test(x) || EXTRA.test(x); };
  const out = new Set();
  const walk = (n) => {
    if (n.nodeType === 3) { if (bad(n.nodeValue) && !n.parentNode.closest('script,style')) out.add('text: ' + n.nodeValue.trim().slice(0, 60)); return; }
    if (n.nodeType !== 1 || ['SCRIPT', 'STYLE'].includes(n.nodeName)) return;
    for (const a of n.getAttributeNames()) { const v = n.getAttribute(a); if (a !== 'd' && a !== 'style' && bad(v)) out.add('@' + a + ': ' + v.slice(0, 60)); }
    n.childNodes.forEach(walk);
  };
  walk(document.documentElement);
  if (bad(document.title)) out.add('title: ' + document.title);
  return [...out];
});
const dangling = (page) => page.evaluate(() => {
  const miss = new Set();
  document.querySelectorAll('use').forEach(u => {
    const h = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
    if (h.startsWith('#') && !document.getElementById(h.slice(1))) miss.add(h);
  });
  return [...miss];
});
const unnamed = (page) => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('button, [role=button]').forEach(b => {
    if ((b.textContent || '').replace(/\s+/g, '')) return;
    if (!b.getAttribute('aria-label')) out.push((b.id ? '#' + b.id : b.className.toString().slice(0, 40)));
  });
  return out;
});

for (const [label, opts] of [['desktop', { width: 1360, height: 950 }], ['phone', { width: 390, height: 844, mobile: true }]]) {
  const { browser, page, errors } = await openPage(opts);
  const shot = (name) => page.screenshot({ path: join(SHOTS, `${label}-${name}.png`), fullPage: false });
  const sweep = async (where) => {
    const e = await scan(page); t.check(`${label}: no emoji — ${where}`, e.length === 0, e.slice(0, 6).join(' | '));
    const d = await dangling(page); t.check(`${label}: all icons resolve — ${where}`, d.length === 0, d.join(','));
    const u = await unnamed(page); t.check(`${label}: icon-only buttons have aria-label — ${where}`, u.length === 0, u.slice(0, 8).join(' | '));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    t.check(`${label}: no horizontal scroll — ${where}`, sw <= 1, `${sw}px`);
  };
  try {
    t.check(`${label}: VLIcon helper present`, await page.evaluate(() => !!window.VLIcon && typeof VLIcon.svg === 'function' && typeof VLIcon.el === 'function' && typeof VLIcon.path === 'function' && typeof VLIcon.draw === 'function'));
    t.check(`${label}: sprite has >= 120 symbols`, (await page.evaluate(() => document.querySelectorAll('#vl-icons symbol').length)) >= 120);
    t.check(`${label}: VLIcon.path/draw work`, await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d');
      const ps = VLIcon.path('scissors'); VLIcon.draw(x, 'scissors', 4, 4, 40, '#fff');
      const d = x.getImageData(0, 0, 48, 48).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
      return ps.length >= 3 && ps.every(p => p instanceof Path2D) && n > 100 && !!VLIcon.el('play').querySelector('use');
    }));
    await sweep('loops (upload view)');
    await shot('loops-upload');
    await page.setInputFiles('#videoFileInput', media.long);
    await page.waitForSelector('#editorSection:not(.hidden)', { timeout: 30000 });
    await page.waitForTimeout(800);
    await sweep('loops (editor view)');
    await shot('loops-editor');
    for (const d of await page.$$('#editorSection details.vl-section')) await d.evaluate(el => { el.open = true; });
    await page.waitForTimeout(200);
    await sweep('loops (all sections open)');
    await shot('loops-sections');

    await page.click('[data-tab="media"]');
    await page.setInputFiles('#mediaFileInput', media.long);
    await page.waitForTimeout(1500);
    await sweep('converter');
    await shot('converter');
    for (const st of ['frames', 'merge']) {
      await page.click(`[data-subtab="${st}"]`); await page.waitForTimeout(400);
      await sweep('converter / ' + st); await shot('converter-' + st);
    }
    await page.click('[data-subtab="convert"]');
    for (const d of await page.$$('#tab-media details.vl-section')) await d.evaluate(el => { el.open = true; });
    await page.waitForTimeout(200);
    await sweep('converter (all sections open)');

    await page.click('[data-tab="edit"]');
    await page.waitForTimeout(1200);
    await page.setInputFiles('#edFileInput', [media.short, media.music]);
    await page.waitForFunction(() => Object.keys(VLEditor.editor.store.project.clips).length > 0, null, { timeout: 30000 });
    await page.waitForTimeout(1000);
    await sweep('editor');
    await shot('editor');
    for (const [btn, name] of [['#edProjectsBtn', 'projects'], ['#edSettingsBtn', 'settings']]) {
      await page.click(btn); await page.waitForTimeout(300);
      await sweep('editor ' + name + ' popover'); await shot('editor-' + name);
      await page.keyboard.press('Escape'); await page.mouse.click(5, 5).catch(() => {});
    }
    await page.click('#edExportBtn');
    await page.waitForSelector('.edx-panel');
    await page.waitForTimeout(500);
    await sweep('editor export panel'); await shot('editor-export');
    for (const k of ['audio', 'gif', 'sheet']) {
      await page.click(`.edx-kinds [data-v="${k}"]`); await page.waitForTimeout(250);
      await sweep('export panel ' + k);
    }
    await page.click('.edx-kinds [data-v="video"]');
    await shot('editor-export-video');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => { const e = VLEditor.editor; const id = Object.keys(e.store.project.clips)[0]; e.timeline.select([id]); });
    await page.waitForTimeout(500);
    await sweep('editor clip selected'); await shot('editor-selected');
    if (label === 'phone') {
      for (const b of ['#edBinOpen', '#edInspectorOpen']) {
        const el = await page.$(b);
        if (el && await el.isVisible()) { await el.click(); await page.waitForTimeout(400); await sweep('editor sheet ' + b); await shot('editor-sheet-' + b.slice(1)); await page.keyboard.press('Escape'); await page.mouse.click(195, 60).catch(() => {}); }
      }
    } else {
      await page.click('[data-ed-bintab="library"]').catch(() => {});
      await page.waitForTimeout(300); await sweep('editor library tab'); await shot('editor-library');
    }

    await page.click('[data-tab="create"]');
    await page.setInputFiles('#createImageInput', media.image);
    await page.waitForTimeout(800);
    await sweep('create video'); await shot('create');
    await sweep('whole DOM incl. hidden modals');
    t.check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    t.check(`${label}: scenario ran`, false, e.message);
  } finally {
    await browser.close();
  }
}
t.done();
