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

import { test, expect, type Page } from '@playwright/test';

async function bootReady(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
}

test('CREATE_ENTRY while in filer mode keeps viewMode=filer (PR-J fix)', async ({ page }) => {
  await bootReady(page);
  const shell = page.locator('#pkc-root');

  // Create a folder + commit (initial setup; this puts user in detail view).
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="folder"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('input[data-pkc-field="title"]').first().fill('Outer');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // Switch to filer.
  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  const tbox = await filerTab.boundingBox();
  if (!tbox) throw new Error('No filer tab');
  await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible();

  // Create another folder via global "+ Folder". Without the PR-J fix,
  // CREATE_ENTRY sets viewMode='detail' and after commit the filer-view
  // disappears.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="folder"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });

  // Verify: even during editing, the underlying viewMode stays 'filer'.
  // (The active surface is the editor due to phase=editing, but the
  // tab "Filer" should still be marked active.)
  await expect(
    page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]'),
  ).toHaveAttribute('data-pkc-active', 'true');
});
