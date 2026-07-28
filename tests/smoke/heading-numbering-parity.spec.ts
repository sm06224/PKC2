/**
 * 領域 8 Layer 3 — 見出しアウトライン番号の parity(visual-state-parity §6)。
 *
 * 「renderMarkdown が番号を生成する」(vitest)と「frontmatter opt-in →
 * presenter 抽出 → render → detail に番号が表示される」end-to-end は別物。
 * 本 spec は frontmatter `heading-number: true` を持つ entry を IndexedDB
 * へ seed し、実ブラウザの detail pane に `1.` / `1.1` が描画されることを
 * 確認する(frontmatter → caller plumbing → render の鎖)。
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

const BODY = [
  '---',
  'heading-number: true',
  '---',
  '# 序章',
  '',
  '章の本文。',
  '',
  '## 詳細節',
  '',
  '節の本文。',
].join('\n');

test('parity: frontmatter heading-number opt-in で見出しに番号が描画される', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  const now = '2026-05-21T00:00:00.000Z';
  await seedContainer(page, {
    meta: { container_id: 'cid-65', title: 't', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'hn-entry', title: 'numbering テスト', archetype: 'text',
        body: BODY, created_at: now, updated_at: now,
      },
    ],
    relations: [], revisions: [], assets: {},
  });
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  const entry = page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="hn-entry"]',
  ).first();
  await expect(entry).toBeVisible();
  await entry.click();

  // render 済み body 内の見出しに番号が前置される。
  const h1 = page.locator('.pkc-md-rendered h1');
  const h2 = page.locator('.pkc-md-rendered h2');
  await expect(h1).toContainText('1. 序章');
  await expect(h2).toContainText('1.1 詳細節');

  await page.screenshot({ path: 'test-results/heading-numbering-parity.png' });
});
