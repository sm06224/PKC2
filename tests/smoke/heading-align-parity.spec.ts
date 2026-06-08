/**
 * 領域 6 — 見出し align prefix の parity(visual-state-parity §6)。
 *
 * 「`<h2 data-pkc-align="center">` を生成する」(vitest)と「見出しが実際に
 * 中央寄せで描画される」(CSS 適用)は別物。本 spec は align CSS 規則を
 * `p[data-pkc-align]` → `[data-pkc-align]` へ要素非依存化した変更が実
 * ブラウザで見出しに効くことを computed `text-align` で検証する。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedContainer(page: Page, container: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (cont) => {
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
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

test('parity: 見出しへの ||/|> align prefix が computed text-align に効く', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  const now = '2026-05-21T00:00:00.000Z';
  await seedContainer(page, {
    meta: { container_id: 'cid-62', title: 't', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'ha-entry', title: 'align テスト', archetype: 'text',
        body: '||## 中央見出し\n\n|>## 末尾見出し\n\n## 素の見出し',
        created_at: now, updated_at: now,
      },
    ],
    relations: [], revisions: [], assets: {},
  });
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  const entry = page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="ha-entry"]',
  ).first();
  await expect(entry).toBeVisible();
  await entry.click();

  // render された markdown body(.pkc-md-rendered)内の 3 見出しを待つ。
  // `center-content h2` だと entry タイトルの <h2> も拾うため scope する。
  const headings = page.locator('.pkc-md-rendered h2');
  await expect(headings).toHaveCount(3);

  // computed text-align ── 生成された data-pkc-align が CSS で実際に効く。
  const aligns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.pkc-md-rendered h2'))
      .map((h) => getComputedStyle(h as HTMLElement).textAlign),
  );
  // `||` → center、`|>` → end(LTR で end は right に解決されうる)、素 → 非 center。
  expect(aligns[0]).toBe('center');
  expect(['end', 'right']).toContain(aligns[1]);
  expect(aligns[2]).not.toBe('center');

  await page.screenshot({ path: 'test-results/heading-align-parity.png' });
});
