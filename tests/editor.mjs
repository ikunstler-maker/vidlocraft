// Editor: library → timeline → split/undo → detach sound + fade → export via the panel (MP4 9:16 1080p, MP3, GIF) → reload.
import { join } from 'node:path';
import { makeMedia, openPage, captureDownload, probe, OUT, harness } from './lib.mjs';

const t = harness('editor');
const media = makeMedia();
const { browser, page, errors } = await openPage();
const state = () => page.evaluate(() => {
  const pr = VLEditor.editor.store.project;
  return { clips: Object.values(pr.clips).length, tracks: pr.tracks.length, dur: VLEditor.projectDuration(pr), aspect: pr.settings.aspect, height: pr.settings.height };
});
const ready = () => page.waitForFunction(() => window.VLEditor && VLEditor.editor && VLEditor.editor.store && VLEditor.editor.store.project, null, { timeout: 30000 });
try {
  await page.click('[data-tab="edit"]');
  await ready();
  // library: import, survives reload
  await page.click('[data-ed-bintab="library"]');
  await page.setInputFiles('#edLibFileInput', [media.long, media.short, media.image, media.music]);
  await page.waitForFunction(() => document.querySelectorAll('#edLibList [data-ed-drag]').length >= 4, null, { timeout: 60000 });
  t.check('library import', true);
  await page.reload();
  await page.click('[data-tab="edit"]');
  await ready();
  await page.click('[data-ed-bintab="library"]');
  await page.waitForFunction(() => document.querySelectorAll('#edLibList [data-ed-drag]').length >= 4, null, { timeout: 30000 });
  t.check('library persists after reload', true);
  // add all four with the "+" buttons
  for (const name of ['long.mp4', 'short.mp4', 'image.jpg', 'music.mp3']) {
    await page.click(`#edLibList [data-ed-drag]:has-text("${name}") button:has-text("+")`);
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => Object.keys(VLEditor.editor.store.project.clips).length >= 4, null, { timeout: 30000 });
  let s = await state();
  t.check('4 clips on the timeline, 15 s', s.clips === 4 && Math.abs(s.dur - 15) < 0.1, JSON.stringify(s));
  // split at 5 s, undo
  await page.evaluate(() => VLEditor.editor.preview.seek(5));
  await page.keyboard.press('s');
  const afterSplit = (await state()).clips;
  await page.keyboard.press('Control+z');
  const afterUndo = (await state()).clips;
  t.check('split adds clips, undo restores', afterSplit > 4 && afterUndo === 4, `${afterSplit} → ${afterUndo}`);
  // unlimited tracks
  await page.evaluate(() => { const st = VLEditor.editor.store; for (let i = 0; i < 4; i++) st.addTrack(i % 2 ? 'audio' : 'video'); });
  t.check('tracks added', (await state()).tracks === 9);
  // detach the long clip's sound, fade it in
  const twin = await page.evaluate(() => {
    const st = VLEditor.editor.store, pr = st.project;
    const v = Object.values(pr.clips).find(c => pr.media[c.mediaId].name === 'long.mp4');
    const id = st.detachAudio(v.id);
    st.updateClip(id, { fadeIn: 1 });
    return st.project.clips[id] && { track: st.project.clips[id].trackId, fadeIn: st.project.clips[id].fadeIn, detached: st.project.clips[v.id].audioDetached };
  });
  t.check('detach audio + fade', twin && twin.track[0] === 'a' && twin.fadeIn === 1 && twin.detached, JSON.stringify(twin));
  // export: default video (project is 9:16 1080p)
  const exportVia = async (setup, name) => {
    await page.click('#edExportBtn');
    await page.waitForSelector('.edx-panel');
    if (setup) await setup();
    return captureDownload(page, () => page.click('.edx-go'), join(OUT, name));
  };
  const t0 = Date.now();
  const v = probe(await exportVia(null, 'editor.mp4'));
  const secs = (Date.now() - t0) / 1000;
  t.check('MP4 is 1080×1920', v.video && v.video.width === 1080 && v.video.height === 1920, `${v.video && v.video.width}×${v.video && v.video.height}`);
  t.check('MP4 duration 15 s', Math.abs(v.duration - 15) < 0.2, String(v.duration));
  t.check('MP4 has audio', !!v.audio);
  t.check('MP4 export under 2 minutes', secs < 120, `${secs.toFixed(1)} s`);
  const a = probe(await exportVia(async () => {
    await page.click('.edx-root [data-set="kind"][data-v="audio"]');
    await page.click('.edx-root [data-set="aformat"][data-v="mp3"]');
  }, 'editor.mp3'));
  t.check('MP3 audio only, 15 s', !a.video && a.audio && a.audio.codec_name === 'mp3' && Math.abs(a.duration - 15) < 0.3, JSON.stringify(a.audio));
  const g = probe(await exportVia(async () => { await page.click('.edx-root [data-set="kind"][data-v="gif"]'); }, 'editor.gif'));
  t.check('GIF has frames', g.video && g.video.codec_name === 'gif' && Number(g.video.nb_frames) > 20, JSON.stringify(g.video));
  // reload: project restored
  const before = await state();
  await page.reload();
  await page.click('[data-tab="edit"]');
  await ready();
  await page.waitForFunction(() => Object.keys(VLEditor.editor.store.project.clips).length > 0, null, { timeout: 30000 });
  const after = await state();
  t.check('project survives reload', after.clips === before.clips && after.tracks === before.tracks, `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
  t.check('no missing media', (await page.evaluate(() => VLEditor.editor.store.missingMedia().length)) === 0);
  t.check('no console errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  t.check('scenario ran', false, e.stack || e.message);
} finally {
  await browser.close();
  t.done();
}
