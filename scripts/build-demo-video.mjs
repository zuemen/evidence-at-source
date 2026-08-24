import { chromium } from 'playwright';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = process.argv[2];
const outputDir = process.argv[3];
if (!sourceDir || !outputDir) {
  throw new Error('usage: node scripts/build-demo-video.mjs <source-dir> <output-dir>');
}

const segments = [
  {
    file: '段1_工時被改寫_配對當場斷掉.webm',
    stopAt: 24.2,
    number: '01',
    quote: '「工時表可以事後重製」',
    promise: '簽章是真的，配對是死的',
    code: 'ATTESTATION_HASH_MISMATCH',
  },
  {
    file: '段2_問不到是哪幾個人_函式不存在.webm',
    stopAt: 15.0,
    number: '02',
    quote: '「移工訪談可能有串證之虞」',
    promise: '指向個人的查詢，一律拒絕',
    code: 'INDIVIDUAL_QUERY_REJECTED',
  },
  {
    file: '段3_剪掉稽核尾巴_被檢查點反證.webm',
    stopAt: 23.6,
    number: '03',
    quote: '「合規證明能否持續可驗證」',
    promise: '鏈驗證抓不到，外部檢查點抓得到',
    code: 'TAIL_TRUNCATED',
  },
];

const media = new Map(segments.map((segment, index) => ['/media/' + index, join(sourceDir, segment.file)]));
const scriptDir = dirname(fileURLToPath(import.meta.url));
const compositor = await readFile(join(scriptDir, 'demo-compositor.html'), 'utf8');

const server = createServer(async (request, response) => {
  if (request.url === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(compositor);
    return;
  }

  const file = media.get(request.url);
  if (!file) {
    response.writeHead(404);
    response.end();
    return;
  }

  const fileStat = await stat(file);
  const range = request.headers.range;
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = Number(match?.[1] ?? 0);
    const end = match?.[2] ? Number(match[2]) : fileStat.size - 1;
    response.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Type': 'video/webm',
      'Content-Length': end - start + 1,
      'Content-Range': 'bytes ' + start + '-' + end + '/' + fileStat.size,
    });
    createReadStream(file, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'video/webm',
    'Content-Length': fileStat.size,
    'Accept-Ranges': 'bytes',
  });
  createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await mkdir(outputDir, { recursive: true });
const captureDir = join(outputDir, '_capture');
await mkdir(captureDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: captureDir, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'load' });

for (const [index, segment] of segments.entries()) {
  await page.evaluate(
    ({ item, mediaUrl }) => window.playSegment(item, mediaUrl),
    { item: segment, mediaUrl: 'http://127.0.0.1:' + port + '/media/' + index },
  );
}
await page.evaluate(() => window.showEnd());

const recorded = await page.video().path();
await context.close();
await browser.close();
server.close();

const finalPath = join(outputDir, 'Demo_75秒_三幕_1080p.webm');
try {
  await rename(recorded, finalPath);
} catch {
  await copyFile(recorded, finalPath);
}
console.log(finalPath);
