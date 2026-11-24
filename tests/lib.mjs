// Shared helpers for the browser tests: test media, browser launch, ffprobe.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PAGE = pathToFileURL(join(ROOT, 'index.html')).href;
export const MEDIA = join(ROOT, 'tests', '.media');
export const OUT = join(ROOT, 'tests', '.out');

// Test media generated with ffmpeg (nothing binary is committed).
export function makeMedia() {
  mkdirSync(MEDIA, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const ff = (name, args) => {
    const file = join(MEDIA, name);
    if (!existsSync(file)) execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, file]);
    return file;
  };
  return {
    long: ff('long.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=10', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '30', '-c:a', 'aac', '-shortest', '-movflags', '+faststart']),
    short: ff('short.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=2',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart']),
    image: ff('image.jpg', ['-f', 'lavfi', '-i', 'testsrc2=size=800x600', '-frames:v', '1']),
    music: ff('music.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=330:duration=6', '-c:a', 'libmp3lame', '-b:a', '128k'])
  };
}

export function probe(file) {
  const json = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,nb_frames,sample_rate,channels:format=duration',
    '-of', 'json', file]).toString();
  const d = JSON.parse(json);
  const v = d.streams.find(s => s.codec_type === 'video');
  const a = d.streams.find(s => s.codec_type === 'audio');
  return { duration: Number(d.format.duration), video: v || null, audio: a || null };
}

// Browser page opened from disk with every network request blocked; collects console errors.
export async function openPage({ width = 1360, height = 950, lang = 'uk', mobile = false, args = [] } = {}) {
  // loaded lazily (CommonJS require also finds a globally installed Playwright)
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, locale: lang === 'en' ? 'en-US' : 'uk-UA',
    ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.route('**/*', r => /^(file:|blob:|data:)/.test(r.request().url()) ? r.continue() : r.abort());
  await ctx.addInitScript((l) => { try { localStorage.setItem('vlp-save-to-disk', '0'); localStorage.setItem('vlp-lang', l); } catch (e) {} }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  await page.goto(PAGE);
  return { browser, ctx, page, errors };
}

// Waits for the result dialog of a job and saves the auto-download.
export async function captureDownload(page, start, file, timeout = 180000) {
  const dl = page.waitForEvent('download', { timeout });
  await start();
  const d = await dl;
  await d.saveAs(file);
  await page.waitForSelector('#resultModal:not(.hidden)', { timeout: 30000 });
  await page.click('#resultCloseBtn').catch(() => {});
  return file;
}

// Tiny test harness: check(name, ok, detail) and a summary.
export function harness(suite) {
  const results = [];
  return {
    check(name, ok, detail = '') {
      results.push({ name, ok: !!ok });
      console.log(`${ok ? 'PASS' : 'FAIL'} [${suite}] ${name}${detail ? ' — ' + detail : ''}`);
    },
    done() {
      const failed = results.filter(r => !r.ok).length;
      console.log(`[${suite}] ${results.length - failed}/${results.length} passed`);
      if (failed) process.exitCode = 1;
    }
  };
}
