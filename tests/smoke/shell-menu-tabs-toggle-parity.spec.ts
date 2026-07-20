/**
 * #938 R10 — タブ機能の設定メニュー昇格の visual parity。
 * 実マウスで ⚙ Settings → Tabs「◉ On」click → タブストリップが出現し、
 * エントリを開くとタブが並ぶこと(flag 裏で発見不能だった機能が
 * メニューから 2 click で到達できる、が本 PR の主張)。
 */
import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

test('parity: ⚙ Settings → Tabs On → タブストリップ出現', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  const shell = page.locator('#pkc-root');

  // エントリを 1 件作成(タブに乗せる対象)
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('[data-pkc-field="title"]').first().fill('Tab probe');
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // 既定ではタブストリップは無い
  await expect(page.locator('[data-pkc-region="tab-strip"]')).toHaveCount(0);

  // ⚙ Settings を開き、Tabs の「◉ On」を実マウスで click
  await page.locator('[data-pkc-action="toggle-shell-menu"]').first().click();
  const onBtn = page.locator(
    '[data-pkc-action="set-bool-flag"][data-pkc-flag-key="shell.tabs_enabled"][data-pkc-flag-value="true"]',
  );
  await expect(onBtn).toBeVisible();
  const box = await onBtn.boundingBox();
  if (!box) throw new Error('Tabs On button has no bounding box');
  // elementFromPoint で到達可能(メニュー内で他要素に隠れていない)
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document
        .elementFromPoint(x, y)
        ?.closest('[data-pkc-action="set-bool-flag"]')
        ?.getAttribute('data-pkc-flag-value') ?? null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe('true');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // active 表示が On に移り、タブストリップ region が出現
  await expect(
    page.locator(
      '[data-pkc-action="set-bool-flag"][data-pkc-flag-key="shell.tabs_enabled"][data-pkc-flag-value="true"][data-pkc-active="true"]',
    ),
  ).toHaveCount(1);
  await expect(page.locator('[data-pkc-region="tab-strip"]')).toHaveCount(1);

  // メニューを閉じ、エントリを開くとタブが並ぶ
  await page.keyboard.press('Escape');
  await page.locator('[data-pkc-region="entry-list"] li[data-pkc-lid]').first().click();
  await expect(
    page.locator('[data-pkc-region="tab-strip"] .pkc-tab', { hasText: 'Tab probe' }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/shell-menu-tabs-toggle-parity.png' });
});
