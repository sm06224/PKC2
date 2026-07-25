/**
 * CodeEditLite 動作デモ(user 提示用スクショ収集)。
 *
 * これは assertion 中心の parity ではなく、**実操作の見た目を撮る**ための
 * デモ spec(tests/smoke/_demo/ 配下。playwright.config の testDir は
 * tests/smoke なので、通常 smoke には含まれない別ディレクトリに置く)。
 * 実行はデモ用 config(playwright.demo.config.ts)から。
 *
 * 撮るもの:
 *   1. flags の {} JSON 一括編集(検証エラー表示 → 正常 → 適用)
 *   2. コードブロックの ✎ その場編集
 *   3. テキスト添付(.json)の ✎ その場編集
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from '../_helpers/boot-ready';

const SHOT = 'test-results/demo';

async function createTextEntry(page: Page, title: string, body: string): Promise<void> {
  const shell = page.locator('#pkc-root');
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('[data-pkc-field="title"]').first().fill(title);
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
}

test('demo: flags の {} JSON 一括編集(VSCode settings 体験)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html');
  await bootReady(page);

  await page.locator('button[data-pkc-action="toggle-shell-menu"]').first().click();
  await page.locator('[data-pkc-action="open-flags-inspector"]').first().click();
  await page.locator('[data-pkc-action="open-flags-json-editor"]').first().click();
  const dialog = page.locator('[data-pkc-region="flags-json-editor"]');
  await expect(dialog).toBeVisible();
  const ta = dialog.locator('.pkc-code-edit-input');
  await ta.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('{\n  "recent.default_limit": 3,\n  "editor.tab_indent_spaces": 4\n}', { delay: 6 });
  await page.waitForTimeout(200);
  await dialog.screenshot({ path: `${SHOT}/1a-flags-json-valid.png` });

  // わざと不正にして行番号つきエラー表示を撮る
  await page.keyboard.type(' broken');
  await page.waitForTimeout(200);
  await dialog.screenshot({ path: `${SHOT}/1b-flags-json-error.png` });
});

test('demo: コードブロックの ✎ その場編集', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html');
  await bootReady(page);
  await createTextEntry(
    page,
    'コード編集デモ',
    ['# 設定例', '', '```js', 'const config = { retries: 1 };', '```', '', '本文が続きます。'].join('\n'),
  );

  const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
  const block = rendered.locator('.pkc-md-block[data-pkc-md-block-kind="code"]').first();
  const box = await block.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + 16);
  await page.waitForTimeout(150);
  await rendered.screenshot({ path: `${SHOT}/2a-codeblock-hover-edit-btn.png` });

  await block.locator('[data-pkc-action="edit-code-block"]').click();
  const dialog = page.locator('[data-pkc-region="code-block-editor"]');
  await expect(dialog).toBeVisible();
  const ta = dialog.locator('.pkc-code-edit-input');
  await ta.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('const config = {\n  retries: 3,\n  timeout: 5000,\n};', { delay: 6 });
  await page.waitForTimeout(200);
  await dialog.screenshot({ path: `${SHOT}/2b-codeblock-editing.png` });
  await dialog.locator('[data-pkc-action="code-edit-commit"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(rendered.locator('code')).toContainText('timeout: 5000');
  await page.waitForTimeout(150);
  await rendered.screenshot({ path: `${SHOT}/2c-codeblock-saved.png` });
});

test('demo: テキスト添付(.json)の ✎ その場編集', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  const content = '{\n  "name": "sample",\n  "enabled": true\n}\n';
  const b64 = Buffer.from(content, 'utf-8').toString('base64');
  await page.evaluate(async ({ cid, key, data }) => {
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2');
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        const nowIso = '2026-07-25T00:00:00.000Z';
        const cont = {
          meta: { container_id: cid, title: 't', created_at: nowIso, updated_at: nowIso, schema_version: 1 },
          entries: [{
            lid: 'att-json', title: 'settings.json', archetype: 'attachment',
            body: JSON.stringify({ name: 'settings.json', mime: 'application/json', asset_key: key }),
            created_at: nowIso, updated_at: nowIso,
          }],
          relations: [], revisions: [], assets: {},
        };
        tx.objectStore('containers').put(cont, cid);
        tx.objectStore('containers').put(cid, '__default__');
        tx.objectStore('assets').put(data, `${cid}:${key}`);
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
      req.onerror = (): void => rej(req.error);
    });
  }, { cid: 'demo-cid', key: 'k1', data: b64 });
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  await page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="att-json"]',
  ).first().click();
  await expect(page.locator('.pkc-attachment-card')).toBeVisible();
  await page.waitForTimeout(150);
  await page.locator('.pkc-attachment-card').screenshot({ path: `${SHOT}/3a-attachment-edit-btn.png` });

  const editBtn = page.locator('[data-pkc-action="edit-attachment-text"]');
  const dialog = page.locator('[data-pkc-region="attachment-text-editor"]');
  await expect(async () => {
    if (await dialog.count() === 0) await editBtn.click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  const ta = dialog.locator('.pkc-code-edit-input');
  await ta.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('{\n  "name": "sample",\n  "enabled": false,\n  "note": "edited in-app"\n}', { delay: 6 });
  await page.waitForTimeout(200);
  await dialog.screenshot({ path: `${SHOT}/3b-attachment-editing.png` });
});
