/**
 * 編集モード picker + window-mode — visual parity(Group A、Phase γ-A2)。
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠。実 OS event
 * (page.mouse.click / boundingBox / waitForEvent('popup'))で、生成だけ
 * でなく user が操作する描画要素まで chain を verify する。
 *
 * 検証:
 *   1. action bar の picker を実 OS click で inline ↔ window 切替
 *      (active class が遷移)。
 *   2. window mode で ✏️ Edit を実 OS click すると別ウィンドウ(popup)が
 *      開き、main は inline 編集に入らず ready のまま。
 */

import { test, expect, type Page } from '@playwright/test';

async function bootWithEntry(page: Page): Promise<void> {
  await page.goto('/pkc2.html?pkc-flag=shell.edit_mode_enabled=true', {
    waitUntil: 'load',
  });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  await page
    .locator(
      'button[data-pkc-action="create-entry"][data-pkc-archetype="text"]',
    )
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // 作成した entry の detail view + action bar が出ていること。
  await expect(page.locator('[data-pkc-region="action-bar"]')).toBeVisible();
}

test('parity: 編集モード picker を実 OS click で inline↔window 切替', async ({
  page,
}) => {
  await bootWithEntry(page);

  const picker = page.locator('[data-pkc-region="edit-mode-picker"]');
  await expect(picker).toBeVisible();

  const inlineBtn = picker.locator('[data-pkc-edit-mode="inline"]');
  const windowBtn = picker.locator('[data-pkc-edit-mode="window"]');

  // default は inline active。
  await expect(inlineBtn).toHaveClass(/pkc-edit-mode-active/);
  await expect(windowBtn).not.toHaveClass(/pkc-edit-mode-active/);

  // 実 OS click で window へ。
  const wb = await windowBtn.boundingBox();
  if (!wb) throw new Error('window button has no boundingBox');
  await page.mouse.click(wb.x + wb.width / 2, wb.y + wb.height / 2);
  await expect(windowBtn).toHaveClass(/pkc-edit-mode-active/);
  await expect(inlineBtn).not.toHaveClass(/pkc-edit-mode-active/);

  // 実 OS click で inline へ戻す。
  const ib = await inlineBtn.boundingBox();
  if (!ib) throw new Error('inline button has no boundingBox');
  await page.mouse.click(ib.x + ib.width / 2, ib.y + ib.height / 2);
  await expect(inlineBtn).toHaveClass(/pkc-edit-mode-active/);
  await expect(windowBtn).not.toHaveClass(/pkc-edit-mode-active/);

  await page.screenshot({
    path: 'test-results/edit-mode-picker-parity.png',
  });
});

test('parity: window mode で ✏️ Edit が別ウィンドウを開き main は ready のまま', async ({
  page,
}) => {
  await bootWithEntry(page);

  // window mode を実 OS click で選択。
  const windowBtn = page.locator(
    '[data-pkc-region="edit-mode-picker"] [data-pkc-edit-mode="window"]',
  );
  const wb = await windowBtn.boundingBox();
  if (!wb) throw new Error('window button has no boundingBox');
  await page.mouse.click(wb.x + wb.width / 2, wb.y + wb.height / 2);
  await expect(windowBtn).toHaveClass(/pkc-edit-mode-active/);

  // ✏️ Edit を実 OS click → popup が開く。
  const editBtn = page.locator(
    '[data-pkc-region="action-bar"] [data-pkc-action="begin-edit"]',
  );
  const eb = await editBtn.boundingBox();
  if (!eb) throw new Error('edit button has no boundingBox');
  const popupPromise = page.waitForEvent('popup');
  await page.mouse.click(eb.x + eb.width / 2, eb.y + eb.height / 2);
  const popup = await popupPromise;
  expect(popup).toBeTruthy();

  // main は inline 編集に入らず ready のまま。
  await expect(page.locator('#pkc-root')).toHaveAttribute(
    'data-pkc-phase',
    'ready',
  );

  await page.screenshot({
    path: 'test-results/edit-mode-window-popup-parity.png',
  });
  await popup.close();
});
