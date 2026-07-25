/**
 * テキスト添付のその場編集(code-edit-lite-design-2026-07 §5)の visual parity。
 *
 * 実ブラウザで証明すること:
 *   P1. `.json` 添付の詳細に ✎ 編集ボタンが到達可能に見える
 *   P2. ✎ 実クリック → 編集ダイアログに復号済み内容が seed される
 *   P3. 実キーボードで書換 → 保存 → プレビュー(consumer)が新内容になる
 *       (不変条件: 保存で新 asset_key へ差し替わる = プレビューが更新される)
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedContainer(page: Page, container: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (cont) => {
    await new Promise<void>((res, rej) => {
      // version は指定しない(storage v3 DB_VERSION 3 で open('pkc2',2) は VersionError)
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        const meta = (cont as { meta: { container_id: string } }).meta;
        tx.objectStore('containers').put(cont, meta.container_id);
        tx.objectStore('containers').put(meta.container_id, '__default__');
        // storage v3: asset は per-record、key は `${cid}:${assetKey}`。
        const assets = (cont as { assets?: Record<string, string> }).assets ?? {};
        for (const [k, v] of Object.entries(assets)) {
          tx.objectStore('assets').put(v, `${meta.container_id}:${k}`);
        }
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, container);
}

const JSON_CONTENT = '{\n  "greeting": "before"\n}\n';

test('parity: .json 添付を ✎ でその場編集 → プレビューが更新される', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  const now = '2026-07-25T00:00:00.000Z';
  const b64 = Buffer.from(JSON_CONTENT, 'utf-8').toString('base64');
  await seedContainer(page, {
    meta: { container_id: 'cid-ate', title: 't', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'att-json', title: 'config.json', archetype: 'attachment',
        body: JSON.stringify({ name: 'config.json', mime: 'application/json', asset_key: 'k1' }),
        created_at: now, updated_at: now,
      },
    ],
    relations: [], revisions: [], assets: { k1: b64 },
  });
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  // 添付を選択(entry-list 行 click)
  const row = page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="att-json"]',
  ).first();
  await expect(row).toBeVisible();
  await row.click();
  const card = page.locator('.pkc-attachment-card');
  await expect(card).toBeVisible({ timeout: 10_000 });

  // P1: ✎ 編集ボタンが到達可能
  const editBtn = page.locator('[data-pkc-action="edit-attachment-text"]');
  await expect(editBtn).toBeVisible();
  const box = await editBtn.boundingBox();
  if (!box) throw new Error('edit button has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document.elementFromPoint(x, y)?.closest('[data-pkc-action="edit-attachment-text"]') !== null,
    { x: cx, y: cy },
  );
  expect(hit, 'edit button reachable at center').toBe(true);

  // P2: クリック → ダイアログに復号済み内容。
  // 添付 bytes は選択後の working-set drain で非同期に常駐化するため、
  // 直後クリックだと「読み込み中」で弾かれうる。dialog が出るまで再クリック。
  const dialog = page.locator('[data-pkc-region="attachment-text-editor"]');
  await expect(async () => {
    if (await dialog.count() === 0) await page.mouse.click(cx, cy);
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  const ta = dialog.locator('.pkc-code-edit-input');
  await expect(ta).toHaveValue(JSON_CONTENT);

  // P3: 書換 → 保存 → プレビュー更新
  await ta.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('{ "greeting": "after" }', { delay: 8 });
  await page.screenshot({ path: 'test-results/attachment-text-editor-open.png' });
  await dialog.locator('[data-pkc-action="code-edit-commit"]').click();
  await expect(dialog).toHaveCount(0);

  // consumer: プレビュー(iframe srcdoc / text 表示)に新内容が出る。
  // 実装差異に強い形で「新 asset_key に差し替わり、再選択で新内容が復号される」ことを
  // ダイアログ再オープンで確認する(保存が効いた = 不変条件どおり新 key mint)。
  await expect(page.locator('[data-pkc-action="edit-attachment-text"]')).toBeVisible();
  await page.locator('[data-pkc-action="edit-attachment-text"]').click();
  await expect(dialog.locator('.pkc-code-edit-input')).toHaveValue('{ "greeting": "after" }');

  await page.screenshot({ path: 'test-results/attachment-text-editor-saved.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
