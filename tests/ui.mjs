// UI: English version has no Ukrainian leftovers in any tab; phone width has no horizontal scroll; no console errors.
import { makeMedia, openPage, harness } from './lib.mjs';

const t = harness('ui');
const media = makeMedia();
const leftovers = (page) => page.evaluate(() => {
  const CYR = /[А-ЯҐЄІЇа-яґєії]/; const out = new Set();
  const walk = (n) => {
    if (n.nodeType === 3) { if (CYR.test(n.nodeValue) && !n.parentNode.closest('[translate="no"],script,style,textarea')) out.add(n.nodeValue.trim().slice(0, 60)); return; }
    if (n.nodeType !== 1 || ['SCRIPT', 'STYLE'].includes(n.nodeName)) return;
    if (n.closest && n.closest('[translate="no"]')) return;
    for (const a of ['title', 'placeholder', 'aria-label', 'alt']) { const v = n.getAttribute(a); if (v && CYR.test(v)) out.add('@' + a + ': ' + v.slice(0, 40)); }
    n.childNodes.forEach(walk);
  };
  walk(document.documentElement);
  return [...out];
});
for (const [label, opts] of [['desktop', {}], ['phone', { width: 390, height: 844, mobile: true }]]) {
  const { browser, page, errors } = await openPage({ lang: 'en', ...opts });
  try {
    for (const tab of ['loops', 'media', 'edit', 'create']) {
      const btn = await page.$(`[data-tab="${tab}"]`);
      if (!btn) continue;
      await btn.click();
      await page.waitForTimeout(tab === 'edit' ? 1500 : 300);
      const left = await leftovers(page);
      t.check(`${label}: "${tab}" tab fully English`, left.length === 0, left.slice(0, 5).join(' | '));
      const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      t.check(`${label}: "${tab}" tab no horizontal scroll`, sw <= 1, `${sw}px`);
    }
    // editor export panel and popovers
    await page.click('[data-tab="edit"]');
    await page.setInputFiles('#edFileInput', media.short);
    await page.waitForFunction(() => Object.keys(VLEditor.editor.store.project.clips).length > 0, null, { timeout: 30000 });
    await page.click('#edExportBtn');
    await page.waitForSelector('.edx-panel');
    const left = await leftovers(page);
    t.check(`${label}: export panel fully English`, left.length === 0, left.slice(0, 5).join(' | '));
    t.check(`${label}: no console errors`, errors.length === 0, errors.join(' | '));
  } catch (e) {
    t.check(`${label}: scenario ran`, false, e.message);
  } finally {
    await browser.close();
  }
}
t.done();
