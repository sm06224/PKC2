/**
 * reform-2026-05 Phase 3 PR-2S(2026-05-12、user バグレポ対応):
 * Rendered viewer popup を opener / system theme に追従させる
 *
 * user 報告(2026-05-10):「PIP popup の theme が固定で、system 切替に追従しない」
 *
 * 検証(visual parity):
 *   1. `data-pkc-popup-theme="dark"` を popup root に set → dark variant computed
 *   2. `data-pkc-popup-theme="light"` → light variant computed
 *   3. toolbar / header / body が popup theme variable を参照
 *
 * Note:Playwright で popup 内 `@media (prefers-color-scheme)` を emulate
 * するのは不安定(`window.open` + `document.write` 経由の synthetic popup には
 * init script が伝播しない)。本 test は `data-pkc-popup-theme` 明示 override の
 * 経路を検証、CSS variable cascade が正しく組まれていることを保証する。
 * system theme media query は CSS の正しさが確認できれば runtime で機能する。
 */
import { test, expect, type Page } from '@playwright/test';

async function bootApp(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
  return shell;
}

async function createTextEntry(page: Page, title: string, body: string) {
  const shell = page.locator('#pkc-root');
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill(title);
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });
}

const FIXTURE = `# theme parity test

普通の段落。

| col1 | col2 |
|------|------|
| A | B |
`;

async function openPopup(page: Page, context: import('@playwright/test').BrowserContext) {
  await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
  const popupPromise = context.waitForEvent('page');
  await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState('load');
  return popup;
}

async function setPopupTheme(popup: Page, theme: 'light' | 'dark') {
  await popup.evaluate((t) => {
    document.documentElement.setAttribute('data-pkc-popup-theme', t);
  }, theme);
  await popup.waitForTimeout(50); // CSS variable propagation
}

function rgbToLuminance(rgb: string): number {
  const m = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return NaN;
  const [r, g, b] = m.slice(1, 4).map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

test('PR-2S:popup `data-pkc-popup-theme="dark"` で dark variant 適用', async ({ page, context }) => {
  await bootApp(page);
  await createTextEntry(page, 'theme dark', FIXTURE);
  const popup = await openPopup(page, context);
  await setPopupTheme(popup, 'dark');

  const computed = await popup.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { bg: cs.backgroundColor, fg: cs.color };
  });
  console.log('dark theme computed:', computed);

  // dark theme:bg luminance < 100、fg luminance > 150
  expect(rgbToLuminance(computed.bg), `bg ${computed.bg} → luminance < 100`).toBeLessThan(100);
  expect(rgbToLuminance(computed.fg), `fg ${computed.fg} → luminance > 150`).toBeGreaterThan(150);

  await popup.screenshot({ path: 'test-results/phase3-2s-theme/popup-dark-explicit.png' });
});

test('PR-2S:popup `data-pkc-popup-theme="light"` で light variant 適用', async ({ page, context }) => {
  await bootApp(page);
  await createTextEntry(page, 'theme light', FIXTURE);
  const popup = await openPopup(page, context);
  await setPopupTheme(popup, 'light');

  const computed = await popup.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { bg: cs.backgroundColor, fg: cs.color };
  });
  console.log('light theme computed:', computed);

  // light theme:bg luminance > 200、fg luminance < 100
  expect(rgbToLuminance(computed.bg), `bg ${computed.bg} → luminance > 200`).toBeGreaterThan(200);
  expect(rgbToLuminance(computed.fg), `fg ${computed.fg} → luminance < 100`).toBeLessThan(100);

  await popup.screenshot({ path: 'test-results/phase3-2s-theme/popup-light-explicit.png' });
});

test('PR-2S:popup toolbar / header が theme variable cascade で切替', async ({ page, context }) => {
  await bootApp(page);
  await createTextEntry(page, 'theme cascade', FIXTURE);
  const popup = await openPopup(page, context);

  // dark theme set → toolbar button bg が dark variant
  await setPopupTheme(popup, 'dark');
  const darkButton = await popup.evaluate(() => {
    const btn = document.querySelector('.pkc-viewer-toolbar button') as HTMLElement;
    if (!btn) return null;
    return getComputedStyle(btn).backgroundColor;
  });
  console.log('dark toolbar button bg:', darkButton);
  expect(darkButton, 'dark toolbar button exists').not.toBeNull();
  expect(rgbToLuminance(darkButton!), `dark toolbar button bg ${darkButton} luminance < 100`).toBeLessThan(100);

  // light theme set → toolbar button bg が light variant
  await setPopupTheme(popup, 'light');
  const lightButton = await popup.evaluate(() => {
    const btn = document.querySelector('.pkc-viewer-toolbar button') as HTMLElement;
    return getComputedStyle(btn).backgroundColor;
  });
  console.log('light toolbar button bg:', lightButton);
  expect(rgbToLuminance(lightButton!), `light toolbar button bg ${lightButton} luminance > 200`).toBeGreaterThan(200);

  // header border-bottom も切替
  const headerBorder = await popup.evaluate(() => {
    const h = document.querySelector('header.pkc-viewer-header') as HTMLElement;
    return getComputedStyle(h).borderBottomColor;
  });
  console.log('light header border:', headerBorder);
  // light の border は #ddd ≈ rgb(221, 221, 221)、luminance ~221
  expect(rgbToLuminance(headerBorder), `light header border luminance > 150`).toBeGreaterThan(150);
});
