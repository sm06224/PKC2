/**
 * フォールバック掲示「📁 フォルダを選んで続行」の移行前 ZIP ゲート
 * (2026-07-24)— **成功パス**の実機検証。
 *
 * storage-dead E2E は IDB 全滅分岐(セッション内 sink)を通るため、
 * こちらは IDB が生きた通常環境 + `?pkc-storage-fallback-force=1` で掲示を
 * 出し、フォルダ選択(OPFS stub)→ ゲートが移行前バックアップ ZIP を
 * 移行先フォルダへ実際に書くことを証明する。この分岐(切替 → reload →
 * boot 移行)こそ従来ゲートが無かった経路。
 */
import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

test('parity: 成功パスでも切替前に移行前バックアップ ZIP がフォルダへ置かれる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.addInitScript(() => {
    // フォルダ選択を OPFS ディレクトリに stub(書き込みは実 FSA 経路)。
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
      async () => {
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle('gate-parity', { create: true });
      };
  });

  await page.goto('/pkc2.html?pkc-storage-fallback-force=1');
  await bootReady(page);

  const overlay = page.locator('[data-pkc-region="storage-fallback-notice"]');
  await expect(overlay).toBeVisible({ timeout: 10_000 });

  // 到達可能性 + 実マウス click
  const folderBtn = page.locator('[data-pkc-action="storage-fallback-pick-folder"]');
  await expect(folderBtn).toBeVisible();
  const box = await folderBtn.boundingBox();
  if (!box) throw new Error('folder button has no bounding box');
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document.elementFromPoint(x, y)?.closest('[data-pkc-action="storage-fallback-pick-folder"]') !== null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe(true);
  await page.screenshot({ path: 'test-results/storage-fallback-gate-before.png' });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // ゲートの成果物: 移行前バックアップ ZIP が移行先フォルダに実在する。
  // (この後 saveFsaHandle 成功 → reload が走るが、OPFS は navigation を
  //  跨いで永続するため、評価は reload 前後どちらのタイミングでも成立する。)
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          try {
            const root = await navigator.storage.getDirectory();
            const dir = await root.getDirectoryHandle('gate-parity');
            const fh = await dir.getFileHandle('pkc2-pre-migration-backup.pkc2.zip');
            return (await fh.getFile()).size;
          } catch {
            return -1;
          }
        }).catch(() => -1 /* reload 中の context 破棄は再 poll */),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  expect(errors, errors.join('\n')).toEqual([]);
});
