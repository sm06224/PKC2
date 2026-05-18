/**
 * PR-J fix: CREATE_ENTRY while in filer keeps viewMode=filer.
 *
 * User report (2026-05-06):
 * > FOLDER の Detail を Filer にしたとき、パスから Root に戻ると
 * > Filer じゃなくなる、この動作は正直 no-op
 *
 * Root cause: CREATE_ENTRY reducer は無条件で `viewMode: 'detail'` に
 * 切り替えていたため、filer 中に entry を作成 → 編集確定すると detail
 * に着地していた。Path の Root を click しても DESELECT_ENTRY は走る
 * が viewMode は detail のまま「filer に居る感覚」が壊れていた。
 *
 * Fix:
 *   - CREATE_ENTRY が filer 中は filer のまま保持する
 *   - filer-scope-root が SET_VIEW_MODE 'filer' を併発(belt-and-suspenders)
 */

import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

test('CREATE_ENTRY while in filer mode switches viewMode to detail (Δ19 supersedes PR-J)', async ({ page }) => {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await bootReady(page);
  const shell = page.locator('#pkc-root');

  // Create a folder + commit (initial setup; this puts user in detail view).
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="folder"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('input[data-pkc-field="title"]').first().fill('Outer');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // Switch to filer.
  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  const tbox = await filerTab.boundingBox();
  if (!tbox) throw new Error('No filer tab');
  await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible();

  // Wave 10-9 Δ19 (2026-05-07、user 報告「Filer で create-entry 押下時に
  // 画面ロック」)で **CREATE_ENTRY 時は viewMode 'detail' に切り替える**
  // 仕様に変更。PR-J の「viewMode='filer' を維持」契約は Δ19 で撤回。
  // 本 test は新契約(detail に切り替わる)を guard する。
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="folder"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');

  // Δ19 後の期待:detail tab が active、filer tab は inactive。
  await expect(
    page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="detail"]'),
  ).toHaveAttribute('data-pkc-active', 'true');
});
