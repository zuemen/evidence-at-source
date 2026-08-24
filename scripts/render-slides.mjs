import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = process.argv[2];
const outputDir = process.argv[3];
if (!source || !outputDir) {
  throw new Error('usage: node scripts/render-slides.mjs <slides.html> <output-dir>');
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--allow-file-access-from-files'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(source).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

const count = await page.locator('section').count();
const report = [];
for (let index = 0; index < count; index += 1) {
  await page.evaluate((slideIndex) => window.go(slideIndex), index);
  await page.waitForTimeout(450);
  const metrics = await page.evaluate(() => {
    const slide = document.querySelector('section.active');
    const rect = slide.getBoundingClientRect();
    return {
      scrollWidth: slide.scrollWidth,
      scrollHeight: slide.scrollHeight,
      width: rect.width,
      height: rect.height,
      bodyWidth: document.body.scrollWidth,
      bodyHeight: document.body.scrollHeight,
    };
  });
  await page.screenshot({
    path: join(outputDir, 'slide-' + String(index + 1).padStart(2, '0') + '.png'),
    fullPage: false,
  });
  report.push({ slide: index + 1, ...metrics });
}

await browser.close();
await writeFile(join(outputDir, 'slides.json'), JSON.stringify(report, null, 2), 'utf8');
for (const item of report) {
  const overflow = item.bodyWidth > 1920 || item.bodyHeight > 1080;
  console.log('slide ' + item.slide + ': ' + (overflow ? 'OVERFLOW' : 'ok'));
}
