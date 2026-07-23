/**
 * C11 §4.5 ④-1 — ブラウザ保存フォールバック掲示の visual parity。
 * `?pkc-storage-fallback-force=1` で実ブラウザに掲示し、ダイアログが
 * 実座標で最前面に見えて実マウスで操作できること、「都度保存で続行」で
 * 閉じて案内 toast が出ることを証明する。
 */
import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

test('parity: フォールバック掲示が見えて実マウスで閉じられる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/pkc2.html?pkc-storage-fallback-force=1');
  await bootReady(page);

  // 掲示ダイアログの出現(probe は非同期なので待つ)
  const overlay = page.locator('[data-pkc-region="storage-fallback-notice"]');
  await expect(overlay).toBeVisible({ timeout: 10_000 });

  // doc §4.5 の必須記載が実際に画面に載っている
  await expect(page.locator('[data-pkc-region="storage-fallback-diagram"]')).toBeVisible();
  await expect(page.locator('[data-pkc-region="storage-fallback-compat"]')).toContainText('互換保証');

  // 「都度保存で続行」ボタンが指定座標で最前面に見えている
  const manualBtn = page.locator('[data-pkc-action="storage-fallback-manual-save"]');
  await expect(manualBtn).toBeVisible();
  const box = await manualBtn.boundingBox();
  if (!box) throw new Error('manual-save button has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document
        .elementFromPoint(x, y)
        ?.closest('[data-pkc-action="storage-fallback-manual-save"]') !== null,
    { x: cx, y: cy },
  );
  expect(hit).toBe(true);

  await page.screenshot({ path: 'test-results/storage-fallback-notice-parity.png' });

  // 実マウスで click → ダイアログが閉じ、案内 toast が出る
  await page.mouse.click(cx, cy);
  await expect(overlay).toHaveCount(0);
  await expect(page.locator('.pkc-toast')).toContainText('Backup ZIP');

  expect(errors, errors.join('\n')).toEqual([]);
});
