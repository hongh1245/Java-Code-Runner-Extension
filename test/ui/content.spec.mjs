import { test, expect, chromium } from '@playwright/test';
import { createServer as httpServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { createServer } from '../../server/index.mjs';

// This harness tests the real content UI and background code, substituting only
// Chrome's extension APIs. It does NOT prove extension installation/permissions.
const root = fileURLToPath(new URL('../../', import.meta.url));
let browser, context, service, site, siteUrl, backgroundMessage, menuClick;
const pageIds = new WeakMap();
let nextPageId = 1;
let activePage;
const sample = await readFile(path.join(root, 'examples/Test.java'), 'utf8');

test.beforeAll(async () => {
  service = createServer();
  await new Promise((resolve, reject) => { service.once('error', reject); service.listen(43123, '127.0.0.1', resolve); });
  const routes = new Map([
    ['/', ['examples/demo.html', 'text/html; charset=utf-8']],
    ['/popup.html', ['extension/popup.html', 'text/html; charset=utf-8']],
    ['/popup.js', ['extension/popup.js', 'text/javascript']],
    ['/popup.css', ['extension/popup.css', 'text/css']]
  ]);
  site = httpServer(async (req, res) => {
    const route = routes.get(req.url);
    if (!route) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', route[1]);
    res.end(await readFile(path.join(root, route[0])));
  });
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  siteUrl = `http://127.0.0.1:${site.address().port}`;

  const chromeApi = {
    runtime: {
      onMessage: { addListener: listener => { backgroundMessage = listener; } },
      onInstalled: { addListener: listener => listener() }
    },
    contextMenus: {
      removeAll: callback => callback(), create: () => {},
      onClicked: { addListener: listener => { menuClick = listener; } }
    },
    scripting: { executeScript: async () => [] },
    tabs: {
      query: async () => [{ id: 1 }],
      sendMessage: async (_id, message) => activePage.evaluate(message => window.__javaHarnessMessage(message), message)
    }
  };
  vm.runInNewContext(await readFile(path.join(root, 'extension/background.js'), 'utf8'), {
    chrome: chromeApi, AbortController, setTimeout, clearTimeout, fetch, console
  });
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined });
  context = await browser.newContext({ viewport: { width: 1180, height: 960 } });
  await context.exposeBinding('__javaHarnessTransport', ({ page }, message) => {
    if (!pageIds.has(page)) pageIds.set(page, nextPageId++);
    return new Promise(resolve => backgroundMessage(message, { tab: { id: pageIds.get(page) }, frameId: 0 }, resolve));
  });
  await context.addInitScript(() => {
    window.chrome = { runtime: {
      sendMessage: message => window.__javaHarnessTransport(message),
      onMessage: { addListener: listener => {
        window.__javaHarnessMessage = message => new Promise(resolve => listener(message, {}, resolve));
      } }
    } };
  });
});
test.afterAll(async () => {
  await browser?.close();
  for (const server of [service, site]) {
    if (!server?.listening) continue;
    server.stopRuns?.();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

async function openSample(page) {
  await page.goto(siteUrl);
  await page.addScriptTag({ path: path.join(root, 'extension/content.js') });
  await page.locator('#sample').evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByRole('button', { name: '執行選取的 Java 程式碼', exact: true }).click();
}

test('selection float shows the real Java result, copies it, and closes', async () => {
  const page = await context.newPage();
  await openSample(page);
  await expect(page.locator('.status-text')).toHaveText('執行成功');
  await expect(page.locator('.stdout')).toHaveText('Third Exception\n');
  const dialog = page.getByRole('dialog', { name: 'Java 執行結果' });
  const box = await dialog.boundingBox();
  expect(box.width).toBe(360);
  expect(box.x + box.width).toBeLessThanOrEqual(1168);
  await page.getByRole('button', { name: '複製結果' }).click();
  await expect(page.getByRole('button', { name: '已複製' })).toBeVisible();
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'docs/preview.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.close();
});

test('edited source and stdin execute; compile and runtime errors remain distinct', async () => {
  const page = await context.newPage();
  await openSample(page);
  await expect(page.locator('.status-text')).toHaveText('執行成功');
  await page.getByRole('tab', { name: '程式碼', exact: true }).click();
  await page.getByRole('textbox', { name: 'Java 程式碼', exact: true }).fill('import java.util.Scanner; System.out.println(new Scanner(System.in).nextInt() * 2);');
  await page.locator('summary').click();
  await page.getByRole('textbox', { name: '標準輸入資料' }).fill('21\n');
  await page.getByRole('button', { name: '▶ 重新執行', exact: true }).click();
  await expect(page.locator('.status-text')).toHaveText('執行成功');
  await expect(page.locator('.stdout')).toHaveText('42\n');
  for (const [code, status, selector, text] of [
    ['System.out.println(noSuchVariable);', '編譯失敗', '.compiler', 'cannot find symbol'],
    ['throw new IllegalStateException("boom");', '執行時發生例外', '.stderr', 'IllegalStateException: boom']
  ]) {
    await page.getByRole('tab', { name: '程式碼', exact: true }).click();
    await page.getByRole('textbox', { name: 'Java 程式碼', exact: true }).fill(code);
    await page.getByRole('button', { name: '▶ 重新執行', exact: true }).click();
    await expect(page.locator('.status-text')).toHaveText(status);
    await expect(page.locator(selector)).toContainText(text);
  }
  await page.close();
});

test('popup health and background context-menu handler use the real local service', async () => {
  const popup = await context.newPage();
  await popup.goto(`${siteUrl}/popup.html`);
  await expect(popup.locator('#status')).toHaveText('● Java 21 本機沙箱已就緒');
  const page = await context.newPage();
  await page.goto(siteUrl);
  await page.addScriptTag({ path: path.join(root, 'extension/content.js') });
  activePage = page;
  menuClick({ menuItemId: 'run-java', selectionText: sample, frameId: 0 }, { id: 1 });
  await expect(page.locator('.stdout')).toHaveText('Third Exception\n');
  await popup.close();
  await page.close();
});

test('float fits a narrow viewport and ignores page styles', async () => {
  const page = await context.newPage();
  // Ordinary HTTP pages may not expose the secure-context randomUUID API.
  await page.addInitScript(() => Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined }));
  await page.setViewportSize({ width: 340, height: 620 });
  await openSample(page);
  await page.addStyleTag({ content: 'pre, button { display:none!important } section { width:2000px!important }' });
  await expect(page.locator('.status-text')).toHaveText('執行成功');
  await expect(page.locator('.stdout')).toBeVisible();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box.width).toBeLessThanOrEqual(316);
  expect(box.x).toBeGreaterThanOrEqual(12);
  expect(box.x + box.width).toBeLessThanOrEqual(328);
  expect(box.y + box.height).toBeLessThanOrEqual(608);
  await page.close();
});

test('synthetic page clicks cannot start or rerun local Java', async () => {
  const page = await context.newPage();
  await page.goto(siteUrl);
  await page.addScriptTag({ path: path.join(root, 'extension/content.js') });
  await page.locator('#sample').evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  const chip = page.getByRole('button', { name: '執行選取的 Java 程式碼', exact: true });
  await expect(chip).toBeVisible();
  await chip.evaluate(element => element.click());
  await expect(page.getByRole('dialog')).toBeHidden();
  await chip.click();
  await expect(page.locator('.status-text')).toHaveText('執行成功');
  await page.locator('.run').evaluate(element => element.click());
  await expect(page.locator('.status-text')).toHaveText('執行成功');
  await expect(page.locator('.stdout')).toHaveText('Third Exception\n');
  await page.close();
});

test('stopped service gives an actionable error instead of fake execution output', async () => {
  service.stopRuns();
  service.closeAllConnections();
  await new Promise(resolve => service.close(resolve));
  const page = await context.newPage();
  await openSample(page);
  await expect(page.locator('.status-text')).toHaveText('無法執行');
  await expect(page.locator('.stderr')).toContainText('npm start');
  await expect(page.locator('.stdout')).toBeEmpty();
  await page.close();
});
