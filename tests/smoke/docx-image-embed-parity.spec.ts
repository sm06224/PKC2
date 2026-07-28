/**
 * PR-V22: docx export 経由で実際 container.assets から image が埋め込まれる.
 *
 * pgc-52(A1-4):`sidebar.mode` の default が 'filer' へ切替わったため、
 * tree sidebar の `[data-pkc-region="entry-list"]` で entry を選択する
 * 本 spec は `?pkc-flag=sidebar.mode=tree` で tree に pin する。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedContainer(page: Page, container: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (cont) => {
    await new Promise<void>((res, rej) => {
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
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, container);
}

test('Data > Word click で生成された .docx に image が embed されてる(media/ folder + <w:drawing>)', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const now = '2026-05-14T00:00:00.000Z';
  await seedContainer(page, {
    meta: { container_id: 'my-cid', title: 't', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      { lid: 'src', title: '画像入り 文書', archetype: 'text',
        body: '# 章 1\n\n本文の前に画像を入れる。\n\n![テスト画像](asset:k1)\n\n後ろの本文。',
        created_at: now, updated_at: now },
      { lid: 'att', title: 'pic.png', archetype: 'attachment',
        body: JSON.stringify({ name: 'pic.png', mime: 'image/png', asset_key: 'k1' }),
        created_at: now, updated_at: now },
    ],
    relations: [], revisions: [], assets: { k1: PNG },
  });
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  // src TEXT を選択
  // CI flake fix v2 (2026-05-18):chained `.locator().locator().first().click()`
  // は click が element appear を待つが、暗黙の per-action 待ち時間しかない。
  // direct descendant + explicit `toBeVisible` wait に分離して、CI 高負荷時の
  // 段階 5 完了直後の rendering tail で element が見つからない race を回避。
  const srcEntry = page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="src"]',
  ).first();
  await expect(srcEntry).toBeVisible();
  await srcEntry.click();
  await page.waitForTimeout(500);

  // Data... menu open
  const dataSummary = page.locator('.pkc-eip-summary').first();
  await dataSummary.click();
  await page.waitForTimeout(100);

  // docx download を発火 → blob を window 経由で取得
  // browser-side: addEventListener('click', e) で a.download をインターセプト
  await page.evaluate(() => {
    (window as unknown as { __pkcDocxCapture?: string }).__pkcDocxCapture = '';
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = async function(this: HTMLAnchorElement) {
      if (this.download && this.download.endsWith('.docx') && this.href.startsWith('blob:')) {
        const res = await fetch(this.href);
        const buf = await res.arrayBuffer();
        const b64 = btoa(new Uint8Array(buf).reduce((acc, byte) => acc + String.fromCharCode(byte), ''));
        (window as unknown as { __pkcDocxCapture?: string }).__pkcDocxCapture = b64;
      }
      orig.call(this);
    };
  });

  await page.locator('[data-pkc-action="export-entry-pandoc-json"][data-pkc-pandoc-target="docx"]').click();
  // wait for capture
  await page.waitForFunction(
    () => Boolean((window as unknown as { __pkcDocxCapture?: string }).__pkcDocxCapture),
    { timeout: 10_000 },
  );
  const base64 = await page.evaluate(
    () => (window as unknown as { __pkcDocxCapture: string }).__pkcDocxCapture,
  );
  expect(base64).toBeTruthy();
  expect(base64.length).toBeGreaterThan(2000);

  // ファイル名にも日本語が含まれるか:capture で download attribute も保存できると better、
  // ここでは bin に書き出して unzip で確認(node fs)
  const fs = await import('node:fs');
  const path = await import('node:path');
  const cp = await import('node:child_process');
  const dir = '/tmp/docx-image-embed-smoke';
  fs.mkdirSync(dir, { recursive: true });
  const docxPath = path.join(dir, 'out.docx');
  fs.writeFileSync(docxPath, Buffer.from(base64, 'base64'));
  cp.execSync(`cd ${dir} && rm -rf u && unzip -q out.docx -d u`);
  const docXml = fs.readFileSync(`${dir}/u/word/document.xml`, 'utf-8');
  expect(docXml).toContain('<w:drawing>');
  const mediaFiles = cp.execSync(`ls ${dir}/u/word/media/ 2>/dev/null || echo none`, { encoding: 'utf-8' });
  expect(mediaFiles).toMatch(/\.(png|jpg|gif|bmp)/);
});
