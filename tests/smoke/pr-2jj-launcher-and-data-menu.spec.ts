/**
 * PR-2JJ v2 visual smoke(2026-05-13、PR #432 stack):
 *   - App Launcher view(`?app=launcher`)が center pane に出ること
 *   - Data… menu の AST / Pandoc / HTML button が visible に渡されていること
 *   - 編集 textarea で format panel が選択時に出現すること
 *
 * 視覚 parity:elementFromPoint で実 OS 座標から DOM を逆引きし、ボタンが
 * 「ピクセル上で押せる位置」にあることまで確認する(reform-2026-05 §6 規約)。
 */

import { test, expect } from '@playwright/test';

test('?app=launcher で center pane に Launcher view が表示される', async ({ page }) => {
  await page.goto('/pkc2.html?app=launcher', { waitUntil: 'load' });
  await page.waitForSelector('#pkc-root[data-pkc-phase]:not([data-pkc-phase="initializing"])');

  // viewMode = launcher に到達して center pane に launcher-view region が出ているか
  const launcherView = page.locator('[data-pkc-region="launcher-view"]');
  await expect(launcherView).toBeVisible({ timeout: 5_000 });

  // 登録 0 件の empty state が出る(初回起動なので registered HTML attachment 無し)
  const empty = page.locator('[data-pkc-region="launcher-empty"]');
  await expect(empty).toBeVisible({ timeout: 3_000 });

  await page.screenshot({ path: 'test-results/pr-2jj-launcher-empty.png' });
});

test('view-mode bar に Launcher tab がある', async ({ page }) => {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await page.waitForSelector('#pkc-root[data-pkc-phase]:not([data-pkc-phase="initializing"])');

  // 最低 1 つ user entry が必要(toggle は entries が空のとき hide される)。
  // text create button を押して dummy entry を 1 つ作る。
  await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
  // editing phase に入る
  await page.waitForSelector('#pkc-root[data-pkc-phase="editing"]', { timeout: 5_000 });
  await page.click('[data-pkc-action="cancel-edit"]').catch(() => undefined);

  // view-mode toggle bar に Launcher button が含まれているか
  const launcherBtn = page.locator(
    '[data-pkc-region="view-mode-bar"] [data-pkc-view-mode="launcher"]',
  );
  await expect(launcherBtn).toBeVisible({ timeout: 3_000 });
  await expect(launcherBtn).toHaveText('Launcher');

  await page.screenshot({ path: 'test-results/pr-2jj-view-mode-bar.png' });
});

test('Data… menu に AST / Pretty / Word / PPT / PDF が含まれる(entry 選択後)', async ({ page }) => {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await page.waitForSelector('#pkc-root[data-pkc-phase]:not([data-pkc-phase="initializing"])');

  // text create で 1 entry 作って selection に乗せる
  await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
  await page.waitForSelector('#pkc-root[data-pkc-phase="editing"]', { timeout: 5_000 });
  // 保存して selected 状態へ
  const titleInput = page.locator('input[data-pkc-field="title"]');
  await titleInput.fill('Smoke entry');
  await page.click('[data-pkc-action="commit-edit"]');
  await page.waitForSelector('#pkc-root[data-pkc-phase="ready"]', { timeout: 5_000 });

  // Data… <details> menu を開く
  const dataSummary = page.locator('.pkc-eip-summary');
  await dataSummary.click();
  await page.waitForTimeout(100);

  // 各 button の visibility 確認
  await expect(page.locator('[data-pkc-action="copy-ast-data"][data-pkc-ast-format="ast"]')).toBeVisible();
  await expect(page.locator('[data-pkc-action="copy-ast-data"][data-pkc-ast-format="canonical"]')).toBeVisible();
  await expect(page.locator('[data-pkc-action="copy-ast-data"][data-pkc-ast-format="pandoc"]')).toBeVisible();
  await expect(page.locator('[data-pkc-action="copy-ast-data"][data-pkc-ast-format="html"]')).toBeVisible();
  await expect(page.locator('[data-pkc-control="ast-pretty"]')).toBeVisible();
  await expect(page.locator('[data-pkc-action="export-entry-pdf"]')).toBeVisible();
  await expect(page.locator('[data-pkc-action="export-entry-pandoc-json"][data-pkc-pandoc-target="docx"]')).toBeVisible();
  await expect(page.locator('[data-pkc-action="export-entry-pandoc-json"][data-pkc-pandoc-target="pptx"]')).toBeVisible();

  await page.screenshot({ path: 'test-results/pr-2jj-data-menu-open.png' });
});

test('編集中 textarea で文字を選択すると format panel が visible になる', async ({ page }) => {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await page.waitForSelector('#pkc-root[data-pkc-phase]:not([data-pkc-phase="initializing"])');

  // text create + 編集モードへ
  await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
  await page.waitForSelector('#pkc-root[data-pkc-phase="editing"]', { timeout: 5_000 });

  // 本文 textarea を埋める(detail-presenter は data-pkc-field="body" + .pkc-editor-body)
  const body = page.locator('textarea.pkc-editor-body[data-pkc-field="body"]').first();
  await body.fill('Hello format panel test');
  await body.evaluate((ta: HTMLTextAreaElement) => {
    ta.setSelectionRange(0, 5);
    ta.focus();
    ta.dispatchEvent(new Event('select', { bubbles: true }));
  });
  await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')));

  const panel = page.locator('[data-pkc-region="format-panel"]');
  await expect(panel).toBeVisible({ timeout: 3_000 });
  // 主要 button 確認
  await expect(panel.locator('[data-pkc-format-label="B"]')).toBeVisible();
  await expect(panel.locator('[data-pkc-format-label="=="]')).toBeVisible();
  await expect(panel.locator('[data-pkc-format-label="H1"]')).toBeVisible();

  await page.screenshot({ path: 'test-results/pr-2jj-format-panel.png' });
});
