/**
 * C11 §4.5 ④-3 — 「ブラウザストレージが死んでいる環境」の実機 E2E(doc DoD)。
 *
 * 実ブラウザで IndexedDB / localStorage を無効化(undefined 化)して起動し、
 * 次の一周が本当に成立することを証明する:
 *
 *   boot 完走(④-1 の資力化)→ フォールバック掲示 → フォルダを選んで続行
 *   → sink 初回書き込み(完全な Backup ZIP)→ 編集 → debounce 再書き込み
 *
 * フォルダは showDirectoryPicker を OPFS ディレクトリに stub して実 FSA
 * ハンドル(createWritable の staging 込み)で書かせる — sink の書き込み
 * 経路はモックなしの本物を通る。IDB が死んでいるため handle の永続化は
 * 失敗し、セッション内 sink 経路(④-2)に入るのが期待動作。
 */
import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

test('e2e: ストレージ全滅環境で boot → 掲示 → フォルダ sink 自動保存が一周する', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.addInitScript(() => {
    // ブラウザストレージ死亡のシミュレーション: undefined 化。
    // (throw する getter は `typeof indexedDB` 自体を throw させて
    // 検知コードを踏み抜くので、実環境に多い「存在しない」形に揃える)
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: false });
    Object.defineProperty(window, 'localStorage', { value: undefined, configurable: false });
    // フォルダ選択を OPFS ディレクトリに stub(実 FSA ハンドル —
    // createWritable / staging / close 反映は本物の経路)。
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
      async () => {
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle('sink-e2e', { create: true });
      };
  });

  // force param: automation(webdriver)ゲートの明示解除(掲示自体の
  // 表示条件は probe 不能で満たされている)。
  await page.goto('/pkc2.html?pkc-storage-fallback-force=1');
  await bootReady(page); // ④-1: 保存不能でも boot 完走

  const overlay = page.locator('[data-pkc-region="storage-fallback-notice"]');
  await expect(overlay).toBeVisible({ timeout: 10_000 });

  // ① フォルダを選んで続行(推奨)を実マウスで click
  const folderBtn = page.locator('[data-pkc-action="storage-fallback-pick-folder"]');
  await expect(folderBtn).toBeVisible();
  const box = await folderBtn.boundingBox();
  if (!box) throw new Error('folder button has no bounding box');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // ダイアログが閉じ、セッション内 sink の案内 toast が出る
  await expect(overlay).toHaveCount(0);
  await expect(page.locator('.pkc-toast').first()).toContainText('自動保存', { timeout: 10_000 });

  // C11 ④-3 ゲート(2026-07-24): フォルダ選択の直後・切替の前に、移行前
  // バックアップ ZIP が移行先フォルダへ置かれている(IDB 全滅分岐でも走る)。
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          try {
            const root = await navigator.storage.getDirectory();
            const dir = await root.getDirectoryHandle('sink-e2e');
            const fh = await dir.getFileHandle('pkc2-pre-migration-backup.pkc2.zip');
            return (await fh.getFile()).size;
          } catch {
            return -1;
          }
        }),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  // 初回書き込み: OPFS の sink-e2e/ に完全な Backup ZIP が置かれる
  const readSinkFile = (): Promise<number> =>
    page.evaluate(async () => {
      try {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle('sink-e2e');
        const fh = await dir.getFileHandle('pkc2-autosave.pkc2.zip');
        const f = await fh.getFile();
        return f.size;
      } catch {
        return -1;
      }
    });
  await expect.poll(readSinkFile, { timeout: 15_000 }).toBeGreaterThan(0);
  const firstSize = await readSinkFile();

  // 編集(entry 作成)→ debounce(5s)後に sink が再書き込みされる
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('[data-pkc-field="title"]').first().fill('Storage-dead survivor');
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'ready');

  await expect
    .poll(readSinkFile, { timeout: 20_000, intervals: [1_000] })
    .toBeGreaterThan(firstSize);

  // ZIP の中身が完全な復元可能物(container.json + manifest.json)である
  const zipNames = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('sink-e2e');
    const fh = await dir.getFileHandle('pkc2-autosave.pkc2.zip');
    const f = await fh.getFile();
    const bytes = new Uint8Array(await f.arrayBuffer());
    // central directory から entry 名を素朴に拾う(EOCD → CD 走査)。
    const names: string[] = [];
    for (let i = bytes.length - 22; i >= 0; i--) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
        const cdOffset = bytes[i + 16]! | (bytes[i + 17]! << 8) | (bytes[i + 18]! << 16) | (bytes[i + 19]! << 24);
        let p = cdOffset;
        while (p + 46 <= bytes.length && bytes[p] === 0x50 && bytes[p + 1] === 0x4b && bytes[p + 2] === 0x01 && bytes[p + 3] === 0x02) {
          const nameLen = bytes[p + 28]! | (bytes[p + 29]! << 8);
          const extraLen = bytes[p + 30]! | (bytes[p + 31]! << 8);
          const commentLen = bytes[p + 32]! | (bytes[p + 33]! << 8);
          names.push(new TextDecoder().decode(bytes.slice(p + 46, p + 46 + nameLen)));
          p += 46 + nameLen + extraLen + commentLen;
        }
        break;
      }
    }
    return names;
  });
  expect(zipNames).toContain('manifest.json');
  expect(zipNames).toContain('container.json');

  await page.screenshot({ path: 'test-results/storage-dead-e2e-parity.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
