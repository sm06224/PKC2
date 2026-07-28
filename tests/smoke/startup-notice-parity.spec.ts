/**
 * #954 — 起動後スタートアップお知らせの visual parity。
 * 実ブラウザで: boot 後にお知らせカードが視認可能座標に出る → 実マウスで
 * 「閉じる」→ 消える → reload しても再表示されない(既読管理が実
 * localStorage で機能)。flag OFF(オフスイッチ)では最初から出ない。
 */
import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

test('parity: boot 後にお知らせが出て、閉じると reload 後も再表示されない', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/pkc2.html?pkc-startup-notice-force=1');
  await bootReady(page);

  const card = page.locator('[data-pkc-region="startup-notice"]');
  await expect(card).toBeVisible();
  // ⚠ **特定リリースの文言に依存しない**(2026-07-28)。ここは
  //   `toContainText('お知らせ')` / `toContainText('差分保存')` と、当時
  //   先頭だった entry の文面を直に書いていた。お知らせは**毎リリース
  //   先頭に足す**運用なので、次のリリースで必ず落ちる ── 実際、title に
  //   「お知らせ」を含まない entry が先頭になった時点から赤いままだった。
  //   見るべきは「カードが構造として出ているか」であって文面ではない。
  await expect(card.locator('.pkc-startup-notice-heading')).toContainText('📢');
  expect(await card.locator('.pkc-startup-notice-list li').count()).toBeGreaterThan(0);

  // 「閉じる」が elementFromPoint で到達可能(隠れていない)→ 実クリック
  const closeBtn = card.locator('[data-pkc-action="startup-notice-close"]');
  const box = await closeBtn.boundingBox();
  if (!box) throw new Error('close button has no bounding box');
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document
        .elementFromPoint(x, y)
        ?.closest('[data-pkc-action="startup-notice-close"]') !== null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe(true);
  await page.screenshot({ path: 'test-results/startup-notice-parity.png' });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(card).toHaveCount(0);

  // reload → 既読なので再表示されない
  await page.goto('/pkc2.html?pkc-startup-notice-force=1');
  await bootReady(page);
  await page.waitForTimeout(1200); // 表示遅延(600ms)を確実に越える
  await expect(page.locator('[data-pkc-region="startup-notice"]')).toHaveCount(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('parity: flag OFF(オフスイッチ)では表示されない', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-startup-notice-force=1&pkc-flag=shell.startup_notice_enabled=0');
  await bootReady(page);
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-pkc-region="startup-notice"]')).toHaveCount(0);
});
