import { test, expect, chromium } from '@playwright/test';
import { createServer as createHttpServer } from 'node:http';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../server/index.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
let context, profile, service, site, url, extensionId;

test.beforeAll(async () => {
  service = createServer();
  await new Promise((resolve, reject) => { service.once('error', reject); service.listen(43123, '127.0.0.1', resolve); });
  const html = await readFile(path.join(root, 'examples/demo.html'));
  site = createHttpServer((_req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${site.address().port}`;
  profile = await mkdtemp(path.join(os.tmpdir(), 'java-runner-chrome-'));
  const extension = path.join(root, 'extension');
  context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium',
    ignoreDefaultArgs: ['--disable-extensions'],
    executablePath: process.env.CHROME_BIN || undefined, viewport: { width: 1180, height: 960 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 })
    .catch(() => { throw new Error('Chrome 未載入擴充套件。請使用允許未封裝擴充套件的 Chromium；受管理的瀏覽器可能封鎖載入。'); });
  extensionId = new URL(worker.url()).host;
});
test.afterAll(async () => {
  await context?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
  for (const server of [service, site]) {
    if (!server) continue;
    server.stopRuns?.();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

async function openSample(page) {
  await page.goto(url);
  await page.locator('[data-java-selection-runner]').waitFor({ state: 'attached' });
  await page.locator('#sample').evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByRole('button', { name: '執行選取的 Java 程式碼', exact: true }).click();
  await expect(page.locator('.status-text')).toHaveText('執行成功');
}

test('selected user example runs through the real extension and Docker service', async () => {
  const page = await context.newPage();
  await openSample(page);
  const dialog = page.getByRole('dialog', { name: 'Java 執行結果' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.stdout')).toHaveText('Third Exception\n');
  const bounds = await dialog.boundingBox();
  expect(bounds.width).toBe(360);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(960);
  await page.getByRole('button', { name: '複製結果' }).click();
  await expect(page.getByRole('button', { name: '已複製' })).toBeVisible();
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'docs/preview.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.close();
});

test('editing code, stdin, runtime errors and compile errors update the same float', async () => {
  const page = await context.newPage();
  await openSample(page);
  await page.getByRole('tab', { name: '程式碼', exact: true }).click();
  await page.getByRole('textbox', { name: 'Java 程式碼', exact: true }).fill('import java.util.Scanner; System.out.println(new Scanner(System.in).nextInt() * 2);');
  await page.locator('summary').click();
  await page.getByRole('textbox', { name: '標準輸入資料' }).fill('21\n');
  await page.getByRole('button', { name: '▶ 重新執行', exact: true }).click();
  await expect(page.locator('.status-text')).toHaveText('執行成功');
  await expect(page.locator('.stdout')).toHaveText('42\n');
  await page.getByRole('tab', { name: '程式碼', exact: true }).click();
  await page.getByRole('textbox', { name: 'Java 程式碼', exact: true }).fill('System.out.println(noSuchVariable);');
  await page.getByRole('button', { name: '▶ 重新執行', exact: true }).click();
  await expect(page.locator('.status-text')).toHaveText('編譯失敗');
  await expect(page.locator('.compiler')).toContainText('cannot find symbol');
  await page.getByRole('tab', { name: '程式碼', exact: true }).click();
  await page.getByRole('textbox', { name: 'Java 程式碼', exact: true }).fill('throw new IllegalArgumentException("boom");');
  await page.getByRole('button', { name: '▶ 重新執行', exact: true }).click();
  await expect(page.locator('.status-text')).toHaveText('執行時發生例外');
  await expect(page.locator('.stderr')).toContainText('IllegalArgumentException: boom');
  await page.close();
});

test('popup checks the real service, and the context-menu message opens results', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator('#status')).toHaveText('● Java 21 本機沙箱已就緒');
  const worker = context.serviceWorkers()[0];
  // The context-menu path invokes the same OPEN_JAVA message as the browser
  // menu callback; native browser context-menu UI is outside the page DOM.
  const tab = await context.newPage();
  await tab.goto(url);
  await tab.locator('[data-java-selection-runner]').waitFor({ state: 'attached' });
  const result = await worker.evaluate(async targetUrl => {
    const tabs = await chrome.tabs.query({});
    const selected = tabs.find(tab => tab.url?.startsWith(targetUrl));
    return chrome.tabs.sendMessage(selected.id, { type: 'OPEN_JAVA', code: 'System.out.println("context-menu-path");' }, { frameId: 0 });
  }, url);
  expect(result.ok).toBe(true);
  await expect(tab.locator('.stdout')).toHaveText('context-menu-path\n');
  await tab.close();
  await page.close();
});

test('narrow viewports keep the float inside the viewport', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 340, height: 620 });
  await openSample(page);
  const box = await page.getByRole('dialog').boundingBox();
  expect(box.width).toBeLessThanOrEqual(316);
  expect(box.x).toBeGreaterThanOrEqual(12);
  expect(box.x + box.width).toBeLessThanOrEqual(328);
  expect(box.y + box.height).toBeLessThanOrEqual(608);
  await page.close();
});
