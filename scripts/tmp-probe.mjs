import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport:{width:1440,height:900} })).newPage();
await page.goto('https://evidence-at-source-web.vercel.app/', { waitUntil:'networkidle', timeout:60000 });
await page.waitForTimeout(2000);
for (const [i, tab] of ['錢包','稽核台','攻防'].entries()) {
  await page.locator('nav.tabs button').nth(i).click();
  await page.waitForTimeout(1000);
  const btns = await page.locator('button').evaluateAll(els =>
    els.map(e => (e.textContent||'').trim()).filter(t => t && t.length < 40));
  console.log(`\n--- ${tab} ---`);
  console.log([...new Set(btns)].join(' | '));
}
await browser.close();
