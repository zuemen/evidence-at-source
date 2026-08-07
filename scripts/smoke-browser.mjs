/**
 * Loads the built site in a real browser and fails the build if it is broken.
 *
 * Every other check in this repository runs in Node. That is why a bundler
 * resolving circomlibjs to its Node entry — which references Buffer — shipped
 * and stayed live: the tests passed, typecheck passed, the build passed, and
 * the page nevertheless stopped at its loading state because the demo world is
 * constructed at module load and the import rejected.
 *
 * So this gate asks the only questions Node cannot answer. Does the page reach
 * a rendered state? Does the console stay clean? Are the panels there on every
 * tab? And on a touch viewport, is every target actually reachable?
 *
 * Run: `npm run smoke:web` (after a build). Exit code 0 means all of it holds.
 */

import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 4188;
const URL = `http://localhost:${PORT}/`;

/** The minimum touch target, in CSS pixels, on a coarse pointer. */
const MIN_TOUCH = 44;

const failures = [];
const note = (message) => failures.push(message);

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(URL);
      if (response.ok) return true;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return false;
}

/**
 * Measures the reachable area, not the painted one: several controls here
 * deliberately keep a small visual dot and extend their hit area with ::after.
 *
 * Passed as a function rather than a string — page.evaluate treats a string as
 * an expression, so a stringified arrow just evaluates to a function object and
 * every check silently passes.
 */
function findSmallTargets(minimum) {
  const tooSmall = [];
  for (const el of document.querySelectorAll('button, a[href], input, select')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const after = getComputedStyle(el, '::after');
    let grow = 0;
    if (after && after.content !== 'none' && after.inset) {
      const first = after.inset.match(/-?[\d.]+/);
      if (first) grow = Math.max(0, -parseFloat(first[0])) * 2;
    }

    const width = rect.width + grow;
    const height = rect.height + grow;
    if (width < minimum || height < minimum) {
      tooSmall.push(
        `${el.className || el.tagName} ${Math.round(width)}x${Math.round(height)}`,
      );
    }
  }

  return [...new Set(tooSmall)];
}

function measureOverflow() {
  return document.documentElement.scrollWidth - window.innerWidth;
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
  cwd: 'packages/web',
  shell: true,
  stdio: 'ignore',
});

try {
  if (!(await waitForServer())) {
    console.error('preview server never became reachable');
    process.exit(1);
  }

  const browser = await chromium.launch();

  for (const [label, viewport, hasTouch] of [
    ['phone', { width: 375, height: 812 }, true],
    ['desktop', { width: 1440, height: 900 }, false],
  ]) {
    const context = await browser.newContext({ viewport, hasTouch });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(URL, { waitUntil: 'networkidle' });

    // The wallet's credential cards only exist once the world has been built.
    // Waiting on them is what distinguishes "rendered" from "still loading".
    try {
      await page.waitForSelector('.cred-card, .claim-row', { timeout: 25_000 });
    } catch {
      note(`${label}: the page never got past its loading state`);
    }

    for (const [index, name] of [
      [0, 'wallet'],
      [1, 'console'],
      [2, 'attack'],
    ]) {
      await page.locator('.tabs button').nth(index).click();
      await page.waitForTimeout(700);

      const rendered = await page.locator('section').count();
      if (rendered === 0) note(`${label}/${name}: tab rendered nothing`);

      const overflow = await page.evaluate(measureOverflow);
      if (overflow > 1) note(`${label}/${name}: ${overflow}px of horizontal overflow`);
    }

    // Director mode adds the beat bar, whose dots are the tightest targets.
    await page.locator('button[data-tour="true"]').click();
    await page.waitForTimeout(900);
    if ((await page.locator('.director-dot').count()) === 0) {
      note(`${label}: director mode opened without any beats`);
    }

    if (hasTouch) {
      const small = await page.evaluate(findSmallTargets, MIN_TOUCH);
      for (const target of small) note(`${label}: touch target below ${MIN_TOUCH}px — ${target}`);
    }

    for (const error of [...new Set(errors)]) note(`${label}: console error — ${error}`);
    await context.close();
  }

  await browser.close();
} finally {
  server.kill();
}

if (failures.length > 0) {
  console.error('瀏覽器煙霧測試失敗：\n');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

console.log('瀏覽器煙霧測試通過：頁面渲染、主控台無錯誤、無水平溢出、觸控目標達 44px。');
