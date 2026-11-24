// Editor proxies: a 1080p source gets a quiet 540p preview copy; preview switches to it and back; export keeps the original.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeMedia, openPage, captureDownload, probe, MEDIA, OUT, harness } from './lib.mjs';

const t = harness('proxy');
makeMedia();
const hd = join(MEDIA, 'hd1080.mp4');
if (!existsSync(hd)) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=10', '-f', 'lavfi', '-i', 'sine=frequency=523:duration=10',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '250', '-b:v', '12M', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', hd]);
}
const origSize = execFileSync('stat', ['-c', '%s', hd]).toString().trim();
const { browser, page, errors } = await openPage({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ready = () => page.waitForFunction(() => window.VLEditor && VLEditor.editor && VLEditor.editor.store && VLEditor.editor.store.project, null, { timeout: 30000 });
const entry = () => page.evaluate(() => {
  const pv = VLEditor.editor.preview;
  const en = [...pv._entries.values()].find(e => e.kind === 'video');
  return en ? { proxied: !!en.proxied, w: en.el.videoWidth, h: en.el.videoHeight, t: en.el.currentTime, paused: en.el.paused, src: en.el.src.slice(0, 5) } : null;
});
try {
  await page.click('[data-tab="edit"]');
  await ready();
  // init is normally called by the app; calling it again is harmless
  await page.evaluate(() => { const e = VLEditor.editor; return VLEditor.Proxy.init({ store: e.store, preview: e.preview, timeline: e.timeline }); });
  await page.evaluate(() => localStorage.removeItem('vlp-editor-proxy'));
  t.check('default mode is auto', (await page.evaluate(() => VLEditor.Proxy.mode())) === 'auto');

  // a small clip is NOT proxied in auto mode; the 1080p clip is
  await page.setInputFiles('#edFileInput', [hd, makeMedia().short]);
  await page.waitForFunction(() => document.querySelectorAll('#edBinList [data-ed-media]').length >= 2, null, { timeout: 60000 });
  const ids = await page.evaluate(() => Object.values(VLEditor.editor.store.project.media).map(m => ({ id: m.id, name: m.name })));
  const hdId = ids.find(m => m.name === 'hd1080.mp4').id;
  const smallId = ids.find(m => m.name === 'short.mp4').id;
  await page.click(`#edBinList [data-ed-media="${hdId}"] [data-ed-add]`);
  await page.waitForFunction(() => Object.keys(VLEditor.editor.store.project.clips).length >= 1);
  await page.evaluate(() => VLEditor.editor.store.updateSettings({ aspect: '16:9', height: 1080 }));

  const t0 = Date.now();
  await page.waitForFunction((id) => VLEditor.Proxy.status(id) === 'working' || VLEditor.Proxy.status(id) === 'queued' || VLEditor.Proxy.status(id) === 'ready', hdId, { timeout: 15000 });
  t.check('no job modal during proxy work', await page.evaluate(() => document.getElementById('jobModal').classList.contains('hidden')));
  const badgeSeen = await page.waitForSelector(`#edBinList [data-ed-media="${hdId}"] [data-ed-proxy-badge]`, { timeout: 10000 }).then(() => true, () => false);
  t.check('«проксі» badge on the media item', badgeSeen);
  await page.waitForFunction((id) => VLEditor.Proxy.status(id) === 'ready', hdId, { timeout: 60000 });
  const secs = (Date.now() - t0) / 1000;
  t.check('proxy ready within 60 s', secs <= 60, `${secs.toFixed(1)} s for a 10 s 1080p clip`);
  t.check('small clip has no proxy (auto)', (await page.evaluate((id) => VLEditor.Proxy.status(id), smallId)) === 'none');

  // proxy file: 540p short side, H.264, keyframes every 0.5 s, audio kept
  const b64 = await page.evaluate(async (id) => {
    const blob = VLEditor.Proxy.blobFor(id);
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, hdId);
  const pfile = join(OUT, 'proxy-test.mp4');
  writeFileSync(pfile, Buffer.from(b64, 'base64'));
  const pr = probe(pfile);
  t.check('proxy short side ≤ 540', pr.video && Math.min(pr.video.width, pr.video.height) <= 540, `${pr.video.width}×${pr.video.height}`);
  t.check('proxy is H.264 with audio', pr.video.codec_name === 'h264' && !!pr.audio, `${pr.video.codec_name}/${pr.audio && pr.audio.codec_name}`);
  t.check('proxy duration ≈ 10 s', Math.abs(pr.duration - 10) < 0.3, String(pr.duration));
  const pk = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', pfile]).toString().trim().split('\n')
    .map(l => l.split(',')).filter(a => a[1] && a[1].includes('K')).map(a => Number(a[0])).sort((a, b) => a - b);
  const gaps = pk.slice(1).map((v, i) => v - pk[i]);
  t.check('keyframe every ≤ 0.6 s', gaps.length > 10 && Math.max(...gaps) <= 0.6, `${pk.length} keyframes, max gap ${Math.max(...gaps).toFixed(2)} s`);
  const psize = execFileSync('stat', ['-c', '%s', pfile]).toString().trim();
  console.log(`INFO proxy ${psize} bytes vs original ${origSize} bytes; ${secs.toFixed(1)} s for 10 s of 1080p`);
  t.check('proxy much smaller than the original', Number(psize) < Number(origSize) / 3, `${psize} vs ${origSize}`);

  // preview source switched to the proxy; geometry uses original size
  await page.waitForFunction(() => { const en = [...VLEditor.editor.preview._entries.values()].find(e => e.kind === 'video'); return en && en.proxied && en.el.readyState >= 2; }, null, { timeout: 20000 });
  let en = await entry();
  t.check('preview element uses the proxy (blob, ≤ 960 px wide)', en && en.proxied && en.src === 'blob:' && en.w <= 960, JSON.stringify(en));
  const layer = await page.evaluate(() => { const L = VLEditor.editor.preview._layers(0).layers[0]; return L && { w: L.srcW, h: L.srcH }; });
  t.check('overlay geometry uses the original 1920×1080', layer && layer.w === 1920 && layer.h === 1080, JSON.stringify(layer));

  // switching keeps time and play state
  await page.evaluate(() => VLEditor.editor.preview.seek(3));
  await page.evaluate(() => VLEditor.editor.preview.play());
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => VLEditor.editor.preview.time);
  await page.evaluate(() => VLEditor.Proxy.setMode('off'));
  await page.waitForTimeout(1500);
  en = await entry();
  const after = await page.evaluate(() => ({ time: VLEditor.editor.preview.time, playing: VLEditor.editor.preview.playing }));
  t.check("mode 'off' → original used", en && !en.proxied && en.w === 1920 && (await page.evaluate((id) => VLEditor.Proxy.urlFor(id), hdId)) === null, JSON.stringify(en));
  t.check('source switch keeps time and play state', after.playing && after.time > before + 1 && en && !en.paused && Math.abs(en.t - (3 + (after.time - 3))) < 1, `${before.toFixed(2)} → ${after.time.toFixed(2)}, el ${en && en.t.toFixed(2)}`);
  await page.evaluate(() => VLEditor.editor.preview.pause());
  await page.evaluate(() => VLEditor.Proxy.setMode('auto'));
  await page.waitForFunction(() => { const en = [...VLEditor.editor.preview._entries.values()].find(e => e.kind === 'video'); return en && en.proxied; }, null, { timeout: 20000 });
  t.check("mode 'auto' → proxy used again (stored, no re-encode)", true);

  // settings UI
  await page.click('#edSettingsBtn');
  const chips = await page.$$eval('#edSettingsPop [data-ed-proxy-mode]', (b) => b.map(x => x.textContent.trim() + (x.classList.contains('is-active') ? '*' : '')));
  t.check('settings: «Плавний перегляд» chips', chips.join('|') === 'Авто*|Завжди|Вимкнено', chips.join('|'));
  await page.click('#edSettingsPop [data-ed-proxy-mode="on"]');
  t.check("chip «Завжди» sets mode 'on'", (await page.evaluate(() => localStorage.getItem('vlp-editor-proxy'))) === 'on');
  await page.waitForFunction((id) => ['queued', 'working', 'ready'].includes(VLEditor.Proxy.status(id)), smallId, { timeout: 10000 });
  t.check("mode 'on' proxies the small clip too", true);
  await page.click('#edSettingsPop [data-ed-proxy-mode="auto"]');
  await page.keyboard.press('Escape');

  // export uses the original file
  const files = await page.evaluate(async (id) => {
    const job = await VLEditor.buildExportJob(VLEditor.editor.store, { kind: 'video', format: 'mp4', vcodec: 'auto', quality: 'medium', audio: { mode: 'keep', codec: 'auto', bitrate: 128, sampleRate: 48000, channels: 2, normalize: false } });
    return { size: job.files[id] && job.files[id].size, n: Object.keys(job.files).length };
  }, hdId);
  t.check('export job carries the original blob', String(files.size) === origSize, `${files.size} vs ${origSize}`);
  await page.click('#edExportBtn');
  await page.waitForSelector('.edx-panel');
  const out = probe(await captureDownload(page, () => page.click('.edx-go'), join(OUT, 'proxy-export.mp4')));
  t.check('export output is 1920×1080', out.video && out.video.width === 1920 && out.video.height === 1080, `${out.video && out.video.width}×${out.video && out.video.height}`);

  // queue pauses while a job modal (export) is open, then continues
  await page.evaluate(async (id) => {
    VLEditor.Proxy.setMode('auto');
    document.getElementById('jobModal').classList.remove('hidden');
    await VLEditor.Proxy._delete(id);
    VLEditor.Proxy._scan();
  }, hdId);
  await page.waitForTimeout(2500);
  const paused = await page.evaluate((id) => VLEditor.Proxy.status(id), hdId);
  t.check('proxy queue waits while an export runs', paused === 'queued', paused);
  await page.evaluate(() => document.getElementById('jobModal').classList.add('hidden'));
  await page.waitForFunction((id) => VLEditor.Proxy.status(id) === 'ready', hdId, { timeout: 60000 });
  t.check('proxy queue continues after the export', true);

  // GC removes proxies of unused media
  const gc = await page.evaluate(async () => {
    await VLEditor.Proxy._put('m-ghost', { blob: new Blob(['x']), width: 2, height: 2, createdAt: 1, sourceSize: 1 });
    const had = VLEditor.Proxy.status('m-ghost');
    const n = await VLEditor.Proxy.gc();
    return { had, n, after: VLEditor.Proxy.status('m-ghost') };
  });
  t.check('GC drops proxies of unknown media', gc.had === 'ready' && gc.n >= 1 && gc.after === 'none', JSON.stringify(gc));

  // stored proxy survives a reload (no re-encode) and 'off' keeps the original on a fresh load
  await page.reload();
  await page.click('[data-tab="edit"]');
  await ready();
  await page.evaluate(() => { const e = VLEditor.editor; return VLEditor.Proxy.init({ store: e.store, preview: e.preview, timeline: e.timeline }); });
  const afterReload = await page.evaluate((id) => VLEditor.Proxy.status(id), hdId);
  t.check('proxy persists after reload', afterReload === 'ready', afterReload);
  await page.evaluate(() => VLEditor.Proxy.setMode('off'));
  await page.evaluate(() => VLEditor.editor.preview.seek(1));
  await page.waitForTimeout(1500);
  en = await entry();
  t.check("after reload with 'off' the original is used", en && !en.proxied && en.w === 1920, JSON.stringify(en));
  await page.evaluate(() => localStorage.removeItem('vlp-editor-proxy'));
  t.check('no console errors', errors.length === 0, errors.join(' | ').slice(0, 300));
} catch (e) {
  t.check('test ran without exceptions', false, String(e && e.stack || e).slice(0, 600));
} finally {
  await browser.close();
  t.done();
}
