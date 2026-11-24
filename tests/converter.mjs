// Converter: convert a video, check the output with ffprobe.
import { join } from 'node:path';
import { makeMedia, openPage, captureDownload, probe, OUT, harness } from './lib.mjs';

const t = harness('converter');
const media = makeMedia();
const { browser, page, errors } = await openPage();
try {
  await page.click('[data-tab="media"]');
  await page.setInputFiles('#mediaFileInput', media.long);
  await page.waitForFunction(() => document.querySelectorAll('#mediaList li').length === 1, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.uncheck('#mediaDiskCheck').catch(() => {});
  const file = await captureDownload(page, () => page.click('#convertBtn'), join(OUT, 'converter.mp4'));
  const p = probe(file);
  t.check('output has video', !!p.video, JSON.stringify(p.video));
  t.check('duration ≈ 10 s', Math.abs(p.duration - 10) < 0.3, String(p.duration));
  t.check('output has audio', !!p.audio);
  t.check('no console errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  t.check('scenario ran', false, e.message);
} finally {
  await browser.close();
  t.done();
}
