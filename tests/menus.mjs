// Context menus: right click on clip / empty row / ruler / track header / bin item / preview, actions, keyboard, phone bottom sheet.
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeMedia, openPage, harness } from './lib.mjs';

const t = harness('menus');
const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.VLC_SHOTS || join(here, '..', 't-menus');
mkdirSync(SHOTS, { recursive: true });
const media = makeMedia();
const ready = (page) => page.waitForFunction(() => window.VLEditor && VLEditor.editor && VLEditor.editor.store && VLEditor.editor.store.project, null, { timeout: 30000 });
const st = (page) => page.evaluate(() => {
  const E = VLEditor, p = E.editor.store.project;
  return { clips: Object.keys(p.clips).length, tracks: p.tracks.length, time: E.editor.preview.time, vol: Object.values(p.clips).map(c => c.volume), det: Object.values(p.clips).map(c => !!c.audioDetached) };
});
const labels = (page) => page.$$eval('.vlm-root:last-of-type .vlm-item .vlm-label, .vlm-root .vlm-item .vlm-label', els => [...new Set(els.map(e => e.textContent))]);
const menuOpen = (page) => page.evaluate(() => !!document.querySelector('.vlm-root'));
const clickItem = async (page, label) => { await page.locator('.vlm-item', { has: page.locator('.vlm-label', { hasText: new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) }).last().click(); await page.waitForTimeout(150); };
// screen point of a clip / row / ruler / header through the timeline's own geometry
const pt = (page, what) => page.evaluate((w) => {
  const tl = VLEditor.editor.timeline, r = tl.canvas.getBoundingClientRect(), p = tl.project;
  const row = (id) => tl.rows.find(q => q.id === id);
  if (w.ruler) return { x: r.left + tl._cx + 40, y: r.top + 10 };
  if (w.header) { const q = row(w.header); const hr = tl._hdrInner.getBoundingClientRect(); return { x: hr.left + 30, y: hr.top + q.y + q.h / 2 }; }
  if (w.clip) {
    const c = Object.values(p.clips).filter(c => (w.media ? p.media[c.mediaId].name === w.media : true))[w.nth || 0];
    const q = row(c.trackId);
    const tm = c.start + (c.out - c.in) * 0.5;
    return { x: r.left + tl._cx + (tm - tl.time) * tl.pps, y: r.top + 24 + q.y + q.h / 2 - tl.scrollY, id: c.id };
  }
  if (w.empty) { const q = row(w.empty); return { x: r.left + r.width - 20, y: r.top + 24 + q.y + q.h / 2 - tl.scrollY }; }
}, what);
const rightClickAt = async (page, p) => { await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y, { button: 'right' }); await page.waitForTimeout(200); };

const { browser, page, errors } = await openPage({ width: 1360, height: 1300 });
try {
  await page.evaluate(() => { window.__ctx = []; window.addEventListener('contextmenu', e => window.__ctx.push(e.defaultPrevented), false); });
  await page.click('[data-tab="edit"]');
  await ready(page);
  await page.setInputFiles('#edFileInput', [media.short, media.music]);
  await page.waitForFunction(() => document.querySelectorAll('#edBinList [data-ed-media]').length >= 2, null, { timeout: 60000 });
  for (const n of ['short.mp4', 'music.mp3']) { await page.click(`#edBinList [data-ed-media]:has-text("${n}") [data-ed-add]`); await page.waitForTimeout(400); }
  await page.waitForFunction(() => Object.keys(VLEditor.editor.store.project.clips).length >= 2);
  await page.evaluate(() => VLEditor.editor.timeline.zoomToFit());
  await page.waitForTimeout(300);

  // ---- clip menu
  let p = await pt(page, { clip: true, media: 'short.mp4' });
  await rightClickAt(page, p);
  t.check('clip: menu opens', await menuOpen(page));
  const need = ['Розрізати тут', 'Копіювати', 'Вставити', 'Дублювати', 'Відокремити звук', 'Вимкнути звук кліпу', 'Гучність', 'Плавна поява', 'Плавне затухання', 'Вписати в кадр', 'Заповнити кадр', 'Поверх основного', 'Перейти до початку кліпу', 'Виділити всі на доріжці', 'Видалити'];
  let ls = await labels(page);
  t.check('clip: all items present', need.every(n => ls.includes(n)), 'missing: ' + need.filter(n => !ls.includes(n)).join(', '));
  t.check('clip: browser menu prevented', (await page.evaluate(() => window.__ctx.at(-1))) === true);
  t.check('clip: right click selects the clip', (await page.evaluate(() => VLEditor.editor.timeline.selection.size)) === 1);
  await page.screenshot({ path: join(SHOTS, 'desktop-clip.png') });
  // volume submenu
  await page.locator('.vlm-item', { hasText: 'Гучність' }).first().hover();
  await page.waitForTimeout(200);
  t.check('clip: volume submenu lists 0/50/100/150/200 %', JSON.stringify((await labels(page)).filter(x => /\d %$/.test(x))) === JSON.stringify(['0 %', '50 %', '100 %', '150 %', '200 %']), JSON.stringify(await labels(page)));
  await page.screenshot({ path: join(SHOTS, 'desktop-submenu.png') });
  await clickItem(page, '50 %');
  t.check('clip: volume 50 % applied, menu closed', !(await menuOpen(page)) && (await st(page)).vol.includes(0.5));
  // split here
  await rightClickAt(page, p);
  const before = (await st(page)).clips;
  await clickItem(page, 'Розрізати тут');
  t.check('clip: split here adds a clip', (await st(page)).clips === before + 1);
  // copy / paste (menu + keyboard)
  p = await pt(page, { clip: true, media: 'short.mp4' });
  await rightClickAt(page, p);
  await clickItem(page, 'Копіювати');
  await page.evaluate(() => VLEditor.editor.preview.seek(0.2));
  let n0 = (await st(page)).clips;
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(200);
  t.check('Ctrl+V pastes the copied clip at the playhead', (await st(page)).clips === n0 + 1);
  await page.keyboard.press('Control+z');
  n0 = (await st(page)).clips;
  p = await pt(page, { clip: true, media: 'short.mp4' });
  await rightClickAt(page, p);
  ls = await labels(page);
  await clickItem(page, 'Вставити');
  t.check('clip menu «Вставити» pastes', (await st(page)).clips === n0 + 1, ls.includes('Вставити') ? '' : 'no item');
  await page.keyboard.press('Control+c');   // (selection is the pasted clip) keyboard copy must not throw
  // detach / reattach
  p = await pt(page, { clip: true, media: 'short.mp4', nth: 0 });
  await rightClickAt(page, p);
  await clickItem(page, 'Відокремити звук');
  t.check('clip: detach sound', (await st(page)).det.some(Boolean));
  await rightClickAt(page, p);
  ls = await labels(page);
  t.check('clip: menu now offers «Повернути звук»', ls.includes('Повернути звук'));
  await page.keyboard.press('Escape');
  t.check('Esc closes the menu', !(await menuOpen(page)));

  // ---- empty row
  const tracks0 = (await st(page)).tracks;
  p = await pt(page, { empty: 'v1' });
  await rightClickAt(page, p);
  ls = await labels(page);
  t.check('empty row: items', ['Вставити', 'Додати доріжку відео', 'Додати доріжку звуку', 'Розрізати все тут', 'Вмістити все'].every(n => ls.includes(n)), ls.join('|'));
  await page.screenshot({ path: join(SHOTS, 'desktop-empty.png') });
  await clickItem(page, 'Додати доріжку звуку');
  t.check('empty row: add audio track', (await st(page)).tracks === tracks0 + 1);

  // ---- ruler
  p = await pt(page, { ruler: true });
  await rightClickAt(page, p);
  ls = await labels(page);
  t.check('ruler: items', ls.includes('Перемістити курсор сюди') && ls.includes('Розрізати все тут'), ls.join('|'));
  await page.evaluate(() => VLEditor.editor.preview.seek(0));
  await clickItem(page, 'Перемістити курсор сюди');
  t.check('ruler: move cursor here', (await st(page)).time > 0.05, String((await st(page)).time));

  // ---- header
  p = await pt(page, { header: 'v1' });
  await rightClickAt(page, p);
  ls = await labels(page);
  t.check('header: items', ['Перейменувати', 'Соло', 'Вимкнути звук', 'Сховати', 'Вище', 'Нижче', 'Видалити доріжку'].every(n => ls.includes(n)), ls.join('|'));
  await page.screenshot({ path: join(SHOTS, 'desktop-header.png') });
  await clickItem(page, 'Соло');
  t.check('header: solo toggles', await page.evaluate(() => VLEditor.editor.store.project.tracks.find(x => x.id === 'v1').solo === true));
  await page.evaluate(() => VLEditor.editor.store.setTrack('v1', { solo: false }));
  const aId = await page.evaluate(() => VLEditor.editor.store.project.tracks.filter(x => x.kind === 'audio').at(-1).id);
  p = await pt(page, { header: aId });
  await rightClickAt(page, p);
  ls = await labels(page);
  t.check('header (audio): voice item, no hide', ls.includes('Голос (приглушувати музику)') && !ls.includes('Сховати'));
  await clickItem(page, 'Перейменувати');
  t.check('header: rename opens the name field', await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-ed-trname')));
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());

  // ---- bin item
  await page.click('[data-ed-bintab="project"]').catch(() => {});
  const item = page.locator('#edBinList [data-ed-media]:has-text("music.mp3")');
  await item.click({ button: 'right' });
  await page.waitForTimeout(200);
  ls = await labels(page);
  t.check('bin item: items', ['Додати в кінець', 'Додати в позицію курсора', 'Додати в медіатеку', 'Відомості'].every(n => ls.includes(n)), ls.join('|'));
  await page.screenshot({ path: join(SHOTS, 'desktop-bin.png') });
  n0 = (await st(page)).clips;
  await clickItem(page, 'Додати в позицію курсора');
  await page.waitForTimeout(400);
  t.check('bin item: add at the playhead', (await st(page)).clips === n0 + 1);
  await item.click({ button: 'right' });
  await clickItem(page, 'Додати в медіатеку');
  await page.waitForTimeout(800);
  t.check('bin item: copy to library', await page.evaluate(async () => (await VLEditor.editor.store.listLibrary()).some(x => x.name === 'music.mp3')));

  // ---- preview
  await page.mouse.click(0, 0).catch(() => {});
  const pb = await page.locator('#edPreview').boundingBox();
  await page.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2, { button: 'right' });
  await page.waitForTimeout(200);
  ls = await labels(page);
  t.check('preview: items', ['Відтворити', 'Зберегти кадр', 'Налаштування проєкту'].every(n => ls.includes(n)), ls.join('|'));
  await page.screenshot({ path: join(SHOTS, 'desktop-preview.png') });
  await clickItem(page, 'Налаштування проєкту');
  t.check('preview: project settings open', await page.evaluate(() => !document.getElementById('edSettingsPop').classList.contains('hidden')));
  await page.keyboard.press('Escape');

  // ---- keyboard: ContextMenu key, arrows, Enter, Esc, letters, focus return
  p = await pt(page, { clip: true, media: 'short.mp4', nth: 0 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(150);
  await page.evaluate(() => { const b = document.getElementById('edPlay'); b.focus(); });
  await page.keyboard.press('ContextMenu');
  await page.waitForTimeout(150);
  t.check('ContextMenu key opens the selection menu', await menuOpen(page) && (await labels(page)).includes('Розрізати тут'));
  await page.keyboard.press('ArrowDown');
  const act = await page.evaluate(() => document.activeElement.textContent.trim());
  t.check('arrow keys move focus', act.startsWith('Копіювати'), act);
  await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'д', bubbles: true, cancelable: true })));
  t.check('letter jumps to «Дублювати»', (await page.evaluate(() => document.activeElement.textContent)).includes('Дублювати'));
  const n1 = (await st(page)).clips;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  t.check('Enter runs the item and closes', !(await menuOpen(page)) && (await st(page)).clips === n1 + 1);
  await page.keyboard.press('Shift+F10');
  await page.waitForTimeout(150);
  t.check('Shift+F10 opens it too', await menuOpen(page));
  await page.keyboard.press('Escape');
  t.check('Esc closes + focus returns', !(await menuOpen(page)) && (await page.evaluate(() => document.activeElement.id)) === 'edPlay');
  await page.keyboard.press('Shift+F10');
  await page.mouse.click(5, 5);
  t.check('outside click closes', !(await menuOpen(page)));
  // delete via menu
  p = await pt(page, { clip: true, media: 'music.mp3', nth: 0 });
  const n2 = (await st(page)).clips;
  await rightClickAt(page, p);
  await clickItem(page, 'Видалити');
  t.check('clip: delete via menu', (await st(page)).clips === n2 - 1);
  t.check('no console errors (desktop)', errors.length === 0, errors.join(' | '));
} catch (e) { t.check('desktop run did not crash', false, String(e && e.stack || e)); }
await browser.close();

// ---------- phone: bottom sheet
{
  const m = await openPage({ width: 390, height: 844, mobile: true });
  const page = m.page;
  try {
    await page.click('[data-tab="edit"]');
    await ready(page);
    await page.setInputFiles('#edFileInput', [media.short]);
    await page.waitForFunction(() => Object.keys(VLEditor.editor.store.project.media).length >= 1, null, { timeout: 60000 });
    await page.evaluate(() => { const s = VLEditor.editor.store; s.addClip({ mediaId: Object.keys(s.project.media)[0] }); });
    await page.waitForTimeout(500);
    await page.locator('[data-track="v1"] button[aria-label="Налаштування доріжки"]').click();
    await page.waitForTimeout(250);
    const sheet = await page.evaluate(() => { const e = document.querySelector('.vlm-root'); if (!e) return null; const r = e.getBoundingClientRect(); return { sheet: e.classList.contains('is-sheet'), bottom: r.bottom, w: r.width, vh: innerHeight, vw: innerWidth, sw: document.documentElement.scrollWidth }; });
    t.check('phone: header «⋯» opens a bottom sheet', sheet && sheet.sheet && Math.abs(sheet.bottom - sheet.vh) < 2 && sheet.w >= sheet.vw - 2, JSON.stringify(sheet));
    t.check('phone: no horizontal overflow', sheet && sheet.sw <= sheet.vw, JSON.stringify(sheet));
    await page.screenshot({ path: join(SHOTS, 'phone-track.png') });
    await page.locator('.vlm-backdrop').click({ position: { x: 150, y: 80 } });
    t.check('phone: tap on the backdrop closes', !(await menuOpen(page)));
    await page.evaluate(() => { const e = VLEditor.editor; e.select([Object.keys(e.store.project.clips)[0]]); });
    await page.waitForTimeout(300);
    await page.click('#edClipMore');
    await page.waitForTimeout(250);
    t.check('phone: clip «⋯» opens the clip menu', (await labels(page)).includes('Розрізати тут'));
    await page.locator('.vlm-item', { hasText: 'Гучність' }).first().click();
    await page.waitForTimeout(200);
    const ls = await labels(page);
    t.check('phone: submenu drills down inside the sheet', ls.includes('50 %'), ls.join('|'));
    await page.screenshot({ path: join(SHOTS, 'phone-volume.png') });
    await clickItem(page, '50 %');
    t.check('phone: volume applied', (await st(page)).vol.includes(0.5));
    await page.click('#edClipMore');
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(SHOTS, 'phone-clip.png') });
    await page.keyboard.press('Escape');
    t.check('no console errors (phone)', m.errors.length === 0, m.errors.join(' | '));
  } catch (e) { t.check('phone run did not crash', false, String(e && e.stack || e)); }
  await m.browser.close();
}
t.done();
