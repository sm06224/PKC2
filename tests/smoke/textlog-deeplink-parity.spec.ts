/** PR-V20 user audit: TEXTLOG log-level deep link が機能するか smoke。 */
import { test, expect, type Page } from '@playwright/test';

async function bootReady(page: Page): Promise<void> {
  await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 30_000 });
}

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

test('TEXTLOG log click on copy-link button copies entry:<lid>#... reference', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/pkc2.html');
  await bootReady(page);

  // 3 件 log を持つ textlog を seed
  const now = '2026-05-14T00:00:00.000Z';
  const logs = [
    { id: 'log-aaa', text: 'first', createdAt: now, flags: [] },
    { id: 'log-bbb', text: 'second', createdAt: now, flags: [] },
    { id: 'log-ccc', text: 'third', createdAt: now, flags: [] },
  ];
  await seedContainer(page, {
    meta: { container_id: 'deeplink-test', title: 't', created_at: now, updated_at: now, schema_version: 1 },
    entries: [{ lid: 'tl-1', title: 'TLOG', archetype: 'textlog', body: JSON.stringify({ entries: logs }), created_at: now, updated_at: now }],
    relations: [], revisions: [], assets: {},
  });
  await page.goto('/pkc2.html');
  await bootReady(page);

  // textlog entry を select
  await page.locator('[data-pkc-region="entry-list"]').locator('[data-pkc-action="select-entry"][data-pkc-lid="tl-1"]').first().click();
  await page.waitForTimeout(500);

  // copy-log-line-ref ボタン(🔗 anchor)を log-bbb 上で click
  const linkBtn = page.locator('article[data-pkc-log-id="log-bbb"] [data-pkc-action="copy-log-line-ref"]').first();
  await expect(linkBtn).toBeVisible({ timeout: 5_000 });
  await linkBtn.click();
  await page.waitForTimeout(200);

  // クリップボードに log-bbb 含む URL がコピーされた
  const clipboard = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  expect(clipboard).toContain('log-bbb');
});

test('entry: link to textlog log scrolls the article into view', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  // 1 textlog + 1 text entry が text entry に log link を含む
  const now = '2026-05-14T00:00:00.000Z';
  const logs = Array.from({ length: 20 }, (_, i) => ({
    id: `log-${String(i).padStart(2, '0')}`,
    text: `log entry ${i + 1}`,
    createdAt: now,
    flags: [] as string[],
  }));
  await seedContainer(page, {
    meta: { container_id: 'deeplink-nav', title: 't', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      { lid: 'tl', title: 'TextLog Target', archetype: 'textlog', body: JSON.stringify({ entries: logs }), created_at: now, updated_at: now },
      { lid: 'src', title: 'Source TEXT', archetype: 'text', body: 'See [link to log 15](entry:tl#log/log-15).', created_at: now, updated_at: now },
    ],
    relations: [], revisions: [], assets: {},
  });
  await page.goto('/pkc2.html');
  await bootReady(page);

  // src TEXT を選択
  await page.locator('[data-pkc-region="entry-list"]').locator('[data-pkc-action="select-entry"][data-pkc-lid="src"]').first().click();
  await page.waitForTimeout(500);

  // body の link(entry:tl#log/log-15)を click
  const link = page.locator('a[data-pkc-action="navigate-entry-ref"]').first();
  await expect(link).toBeVisible({ timeout: 5_000 });
  await link.click();
  await page.waitForTimeout(800);

  // textlog entry が selected になり、log-15 の article が view 内
  const article = page.locator('article[data-pkc-log-id="log-15"]');
  await expect(article).toBeVisible({ timeout: 5_000 });
  // viewport 内かを確認
  const inViewport = await article.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top <= window.innerHeight;
  });
  expect(inViewport).toBe(true);
});
