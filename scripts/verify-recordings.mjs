import { chromium } from 'playwright';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceDir = process.argv[2];
const outputDir = process.argv[3];

if (!sourceDir || !outputDir) {
  throw new Error('usage: node scripts/verify-recordings.mjs <source-dir> <output-dir>');
}

await mkdir(outputDir, { recursive: true });
const files = (await readdir(sourceDir))
  .filter((name) => name.endsWith('.webm'))
  .sort((a, b) => a.localeCompare(b, 'zh-Hant'));

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--allow-file-access-from-files'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const report = [];

for (const file of files) {
  console.log(`checking ${file}`);
  const url = pathToFileURL(join(sourceDir, file)).href;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: 'html,body{margin:0;background:#080b0a}video{width:100vw!important;height:100vh!important;object-fit:contain}' });

  const metadata = await page.evaluate(async () => {
    const video = document.querySelector('video');
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('metadata timeout')), 15_000);
      if (video.readyState >= 1) {
        clearTimeout(timer);
        resolve({
          duration: Number.isFinite(video.duration) ? video.duration : null,
          width: video.videoWidth,
          height: video.videoHeight,
        });
        return;
      }
      video.addEventListener('loadedmetadata', () => {
        clearTimeout(timer);
        resolve({
          duration: Number.isFinite(video.duration) ? video.duration : null,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }, { once: true });
      video.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error(`media decode failed: code=${video.error?.code} message=${video.error?.message}`));
      }, { once: true });
    });
  });

  const duration = metadata.duration ?? 20;
  const points = duration > 60
    ? [2, 31, 47, 63, duration - 1.5]
    : [2, Math.min(10, duration / 2), Math.max(2, duration - 1.5)];
  for (const [index, time] of points.entries()) {
    await page.evaluate(async (target) => {
      const video = document.querySelector('video');
      video.pause();
      await new Promise((resolve) => {
        video.addEventListener('seeked', resolve, { once: true });
        video.currentTime = target;
      });
    }, time);
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(outputDir, `${basename(file, '.webm')}_${String(index + 1).padStart(2, '0')}.png`),
    });
  }

  report.push({ file, ...metadata });
}

await browser.close();
await writeFile(join(outputDir, 'recordings.json'), JSON.stringify(report, null, 2), 'utf8');
for (const item of report) {
  console.log(`${item.file}: ${item.width}x${item.height}, ${item.duration ?? 'unknown'}s`);
}
