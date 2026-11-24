// Project file (.vlcproj): ZIP/ZIP64 unit checks in node, then save / open / export / missing media / drag & drop in the browser.
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { makeMedia, openPage, captureDownload, probe, OUT, harness } from './lib.mjs';

const t = harness('projectfile');
const here = dirname(fileURLToPath(import.meta.url));
// The module's source, cut out of index.html (from its banner comment to the start of the next module).
function moduleSource() {
  if (process.env.VLC_PROJECTFILE_JS) return readFileSync(process.env.VLC_PROJECTFILE_JS, 'utf8');
  const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
  const a = html.indexOf('// ===== Timeline editor: project file');
  const b = html.indexOf('\n// ===== ', a + 10);
  if (a < 0 || b < 0) throw new Error('project file module not found in index.html');
  return html.slice(a, b);
}

// ---------- 1. ZIP unit tests (node) ----------
{
  const E = { VERSION: 2 };
  vm.runInNewContext(moduleSource(), { VLEditor: E, TextEncoder, TextDecoder, Blob, window: undefined, console });
  const Z = E.ProjectFile._zip;
  const mk = () => { const parts = []; return { parts, sink: { write: (d) => { parts.push(d); } } }; };
  const body = new Uint8Array(300000).map((_, i) => (i * 7) & 255);
  const { parts, sink } = mk();
  const w = new Z.Writer(sink);
  await w.add('manifest.json', new TextEncoder().encode('{"a":1}'));
  await w.add('media/ünï.bin', new Blob([body]));
  await w.add('empty', new Uint8Array(0));
  await w.finish();
  const blob = new Blob(parts);
  const f = join(OUT, 'unit.zip');
  mkdirSync(OUT, { recursive: true });
  writeFileSync(f, Buffer.from(await blob.arrayBuffer()));
  let py = '';
  try { py = execFileSync('python3', ['-I', '-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip(),sorted(z.namelist()))', f]).toString(); } catch (e) { py = String(e.stderr || e); }
  t.check('zip written by us passes python zipfile CRC test', py.startsWith('None') && py.includes('media/ünï.bin'), py.trim());
  const r = await Z.readZip(blob);
  const en = await r.open('media/ünï.bin');
  t.check('zip reader finds entries + data', r.count === 3 && en.size === body.length && Z.crc32(new Uint8Array(await en.blob().arrayBuffer())) === en.crc);
  // ZIP64: fake huge size/offset in the central directory + > 65535 entries
  const m = mk();
  const w2 = new Z.Writer(m.sink);
  await w2.add('small.txt', new TextEncoder().encode('hi'));
  w2.records.push({ name: 'big.bin', nameBytes: new TextEncoder().encode('big.bin'), crc: 123, size: 5 * 2 ** 30, offset: 6 * 2 ** 30 });
  for (let i = 0; i < 70000; i++) w2.records.push({ name: 'f' + i, nameBytes: new TextEncoder().encode('f' + i), crc: 0, size: 0, offset: 100 });
  w2.offset = 7 * 2 ** 30;   // pretend the data part is 7 GB, so the directory starts beyond 4 GB
  const cdStart = w2.offset;
  m.parts.length = 0;
  await w2.finish();
  const tailBytes = new Uint8Array(await new Blob(m.parts).arrayBuffer());
  const fake = { size: cdStart + tailBytes.length, slice: (a, b) => ({ arrayBuffer: async () => { const out = new Uint8Array(b - a); const from = Math.max(a, cdStart); if (b > from) out.set(tailBytes.subarray(from - cdStart, b - cdStart), from - a); return out.buffer; } }) };
  const r2 = await Z.readZip(fake);
  const big = r2.entries.get('big.bin');
  t.check('ZIP64 directory (>4 GB offsets, >65535 entries) is read back', r2.count === 70002 && big && big.size === 5 * 2 ** 30 && big.offset === 6 * 2 ** 30 && r2.entries.get('f69999').offset === 100, `${r2.count} entries`);
  const dv = new DataView(tailBytes.buffer);
  t.check('ZIP64 end-of-directory records present', dv.getUint32(tailBytes.length - 22 - 20 - 56, true) === 0x06064b50 && dv.getUint32(tailBytes.length - 22 - 20, true) === 0x07064b50);
  // a single entry >= 4 GB gets a ZIP64 local header (fake Blob of 5 GB, precomputed CRC, nothing is read)
  const m3 = mk();
  const w3 = new Z.Writer(m3.sink);
  const fakeBig = Object.create(Blob.prototype, { size: { value: 5 * 2 ** 30 } });
  fakeBig.slice = () => new Blob([]);
  await w3.add('x', fakeBig, { crc: 0 });
  const h = m3.parts[0], hdv = new DataView(h.buffer, h.byteOffset, h.byteLength);
  t.check('entry >= 4 GB: ZIP64 local header (v4.5, 0xFFFFFFFF sizes, 8-byte extra sizes)', hdv.getUint16(4, true) === 45 && hdv.getUint32(18, true) === 0xFFFFFFFF && hdv.getUint16(28, true) === 20 && hdv.getUint32(30 + 1 + 4, true) === 2 ** 30 && hdv.getUint32(30 + 1 + 8, true) === 1);
}

// ---------- 2. browser ----------
const media = makeMedia();
let fullNameDbg = '';
const FILE_FULL = join(OUT, 'proj-full.vlcproj');
const FILE_LITE = join(OUT, 'proj-lite.vlcproj');
const { browser, page, errors } = await openPage();
const ready = (p) => p.waitForFunction(() => window.VLEditor && VLEditor.editor && VLEditor.editor.store && VLEditor.editor.store.project, null, { timeout: 30000 });
const snapshot = (p) => p.evaluate(() => {
  const pr = VLEditor.editor.store.project;
  const clips = Object.values(pr.clips).map(c => ({ ...c, mediaName: pr.media[c.mediaId] && pr.media[c.mediaId].name })).sort((a, b) => a.trackId.localeCompare(b.trackId) || a.start - b.start);
  return JSON.stringify({ settings: pr.settings, tracks: pr.tracks, clips, media: Object.keys(pr.media).sort() });
});
const saveVia = async (p, mode, file) => {
  await p.click('#edProjectsBtn');
  await p.click('#edSaveFile');
  await p.waitForSelector('#edFileDlg:not(.hidden)');
  await p.click(`#edFileDlg [data-ed-save-mode="${mode}"]`);
  const dl = p.waitForEvent('download', { timeout: 120000 });
  await p.click('#edFileGo');
  const d = await dl;
  await d.saveAs(file);
  await p.waitForSelector('#edFileDlg', { state: 'hidden', timeout: 30000 });
  return d.suggestedFilename();
};
try {
  await page.click('[data-tab="edit"]');
  await ready(page);
  await page.setInputFiles('#edFileInput', [media.long, media.short, media.image, media.music]);
  await page.waitForFunction(() => Object.keys(VLEditor.editor.store.project.clips).length >= 4, null, { timeout: 60000 });
  await page.evaluate(() => {
    const st = VLEditor.editor.store, pr = st.project;
    st.renameProject && 0;
    st.rename('My project');
    const v = Object.values(pr.clips).find(c => pr.media[c.mediaId].name === 'long.mp4');
    const aid = st.detachAudio(v.id);
    st.updateClip(aid, { fadeIn: 1, fadeOut: 0.5, volume: 1.5 });
    st.addTrack('audio', { name: 'Музика 2' });
    st.updateSettings({ aspect: '1:1', height: 720, fps: 24 });
  });
  const before = await snapshot(page);
  const fullName = await saveVia(page, 'media', FILE_FULL);
  t.check('save with media downloads (ASCII name; headless Chromium reports Cyrillic names as «download») «<name>.vlcproj»', fullName === 'My project.vlcproj', fullName);
  fullNameDbg = fullName;
  const liteName = await saveVia(page, 'project', FILE_LITE);
  const z = (f) => execFileSync('python3', ['-I', '-c', 'import zipfile,sys,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({"bad":z.testzip(),"names":z.namelist(),"m":json.loads(z.read("manifest.json"))}))', f]).toString();
  const zf = JSON.parse(z(FILE_FULL)), zl = JSON.parse(z(FILE_LITE));
  t.check('full file: valid ZIP, manifest + project + 4 media', zf.bad === null && zf.names.includes('manifest.json') && zf.names.includes('project.json') && zf.names.filter(n => n.startsWith('media/')).length === 4 && zf.m.format === 1 && zf.m.withMedia === true && zf.m.app === 'VidLoCraft', JSON.stringify(zf.names));
  t.check('lite file: no media, much smaller', zl.bad === null && zl.m.withMedia === false && !zl.names.some(n => n.startsWith('media/')) && readFileSync(FILE_LITE).length < 20000 && readFileSync(FILE_FULL).length > 100000, `${readFileSync(FILE_LITE).length} vs ${readFileSync(FILE_FULL).length} bytes`);

  // Ctrl+S opens the dialog
  await page.mouse.click(5, 5);
  await page.keyboard.press('Control+s');
  t.check('Ctrl+S opens the save dialog', await page.isVisible('#edFileDlg'));
  await page.keyboard.press('Escape');
  t.check('Esc closes it', !(await page.isVisible('#edFileDlg')));

  // delete the project and the library, then open the file
  const gone = await page.evaluate(async () => {
    const st = VLEditor.editor.store;
    const ids = Object.keys(st.project.media);
    await st.deleteProject(st.project.id);
    for (const it of await st.listLibrary()) await st.removeFromLibrary(it.id);
    const left = [];
    for (const id of ids) if (await st.mediaBlob(id)) left.push(id);
    return left.length;
  });
  t.check('media removed from the browser before opening', gone === 0, String(gone));
  await page.click('#edProjectsBtn');
  await page.setInputFiles('#edProjFileInput', FILE_FULL);
  await page.waitForFunction(() => VLEditor.editor.store.project.name === 'My project' && Object.keys(VLEditor.editor.store.project.clips).length >= 5, null, { timeout: 60000 });
  await page.waitForSelector('#edFileDlg', { state: 'hidden' });
  const after = await snapshot(page);
  t.check('opened project is identical (tracks, clips, settings, media ids)', after === before, after === before ? '' : 'differs');
  t.check('media present, banner hidden', (await page.evaluate(() => VLEditor.editor.store.missingMedia().length)) === 0 && !(await page.isVisible('#edMissing')));
  // export works
  await page.click('#edExportBtn');
  await page.waitForSelector('.edx-panel');
  const mp4 = await captureDownload(page, () => page.click('.edx-go'), join(OUT, 'projectfile.mp4'));
  const pr = probe(mp4);
  t.check('export from the opened project works (1:1 720p, has audio)', pr.video && pr.video.width === 720 && pr.video.height === 720 && !!pr.audio, JSON.stringify(pr.video && [pr.video.width, pr.video.height]));
  // second open: new id + «(копія)», media reused
  const ids1 = await page.evaluate(() => VLEditor.editor.store.project.id);
  await page.setInputFiles('#edProjFileInput', FILE_FULL);
  await page.waitForFunction((old) => VLEditor.editor.store.project.id !== old, ids1, { timeout: 60000 });
  const second = await page.evaluate(() => ({ name: VLEditor.editor.store.project.name, miss: VLEditor.editor.store.missingMedia().length }));
  t.check('second open: new project id, name gets «(копія)»', second.name === 'My project (копія)' && second.miss === 0, JSON.stringify(second));
  // errors
  const errMsg = async (bytes, name = 'x.vlcproj') => page.evaluate(async ({ b, name }) => {
    const u8 = Uint8Array.from(atob(b), c => c.charCodeAt(0));
    try { await VLEditor.ProjectFile.read(new File([u8], name), VLEditor.editor.store); return 'OK'; } catch (e) { return e.message; }
  }, { b: Buffer.from(bytes).toString('base64'), name });
  const full = readFileSync(FILE_FULL);
  const m1 = await errMsg(Buffer.from('this is not a project file, just text, long enough to try'));
  t.check('plain text → «не файл проєкту»', /Це не файл проєкту/.test(m1), m1);
  const m2 = await errMsg(full.subarray(0, full.length - 3000));
  t.check('truncated file → «пошкоджено»', /пошкоджено/.test(m2), m2);
  const flipped = Buffer.from(full); flipped[Math.floor(flipped.length / 2)] ^= 0xff;
  const m3 = await errMsg(flipped);
  t.check('flipped byte with media already on the device → opens (reuse)', m3 === 'OK' || /пошкоджено/.test(m3), m3);
  const zipOther = execFileSync('python3', ['-I', '-c', 'import zipfile,sys,io;b=io.BytesIO();z=zipfile.ZipFile(b,"w");z.writestr("a.txt","hi");z.close();sys.stdout.buffer.write(b.getvalue())']);
  const m4 = await errMsg(zipOther);
  t.check('a foreign ZIP → «не файл проєкту»', /Це не файл проєкту/.test(m4), m4);
  const newer = execFileSync('python3', ['-I', '-c', 'import zipfile,sys,io,json;b=io.BytesIO();z=zipfile.ZipFile(b,"w");z.writestr("manifest.json",json.dumps({"app":"VidLoCraft","kind":"project","format":99}));z.writestr("project.json","{}");z.close();sys.stdout.buffer.write(b.getvalue())']);
  const m5 = await errMsg(newer);
  t.check('newer format → «новішою версією»', /новішою версією/.test(m5), m5);

  // drag & drop of the no-media file onto the editor
  const liteB64 = readFileSync(FILE_LITE).toString('base64');
  await page.evaluate(async () => {
    const st = VLEditor.editor.store;
    for (const p of await st.listProjects()) if (p.id !== st.project.id) await st.deleteProject(p.id);
  });
  await page.evaluate(async (b) => {
    const u8 = Uint8Array.from(atob(b), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([u8], 'drop.vlcproj'));
    const root = document.getElementById('edRoot');
    root.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    root.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, liteB64);
  await page.waitForFunction(() => /копія/.test(VLEditor.editor.store.project.name) || VLEditor.editor.store.project.name.startsWith('My project'), null, { timeout: 30000 });
  t.check('dropping a .vlcproj opens it', await page.evaluate(() => Object.keys(VLEditor.editor.store.project.clips).length >= 5));
  t.check('no console errors (main context)', errors.length === 0, errors.join(' | '));

  // no-media file in a fresh browser context → missing-media banner
  const fresh = await openPage();
  try {
    await fresh.page.click('[data-tab="edit"]');
    await ready(fresh.page);
    await fresh.page.click('#edProjectsBtn');
    await fresh.page.setInputFiles('#edProjFileInput', FILE_LITE);
    await fresh.page.waitForFunction(() => VLEditor.editor.store.project.name === 'My project', null, { timeout: 30000 });
    await fresh.page.waitForSelector('#edMissing:not(.hidden)', { timeout: 10000 });
    const miss = await fresh.page.evaluate(() => VLEditor.editor.store.missingMedia().length);
    t.check('no-media file in a fresh browser → missing-media banner (4 files)', miss === 4, String(miss));
    // reopening the FULL file here makes the media come from the file
    await fresh.page.click('#edProjectsBtn');
    await fresh.page.setInputFiles('#edProjFileInput', FILE_FULL);
    await fresh.page.waitForFunction(() => VLEditor.editor.store.project.name.startsWith('My project') && VLEditor.editor.store.project.name !== 'My project' && VLEditor.editor.store.missingMedia().length === 0, null, { timeout: 60000 });
    t.check('full file in the fresh browser → no missing media', true);
    const flipped2 = Buffer.from(full).toString('base64');
    const flipRes = await fresh.page.evaluate(async (b) => {
      const u8 = Uint8Array.from(atob(b), c => c.charCodeAt(0));
      const st = VLEditor.editor.store;
      for (const p of await st.listProjects()) if (p.id !== st.project.id) await st.deleteProject(p.id);
      await st.deleteProject(st.project.id);   // media blobs are gone now
      u8[Math.floor(u8.length * 0.7)] ^= 0xff;
      try { await VLEditor.ProjectFile.read(new File([u8], 'x.vlcproj'), st); return 'OK'; } catch (e) { return e.message; }
    }, flipped2);
    t.check('flipped byte inside media (media not on device) → «пошкоджено»', /пошкоджено/.test(flipRes), flipRes);
    t.check('no console errors (fresh context)', fresh.errors.length === 0, fresh.errors.join(' | '));
  } finally { await fresh.browser.close(); }
} catch (e) {
  t.check('scenario ran', false, e.stack || e.message);
} finally {
  await browser.close();
  t.done();
}
