/** PR-V20 user audit: TEXTLOG log-level deep link が機能するか smoke。 */
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

  // CI flake fix v2 (2026-05-17):前回(PR #455)の「entry-list region 待ち
  // → 特定 entry 待ち」の 2 段階方式は CI 高負荷時に entry-list の re-render
  // tail で 15s 超過する pattern を残していた。entry-list が render される
  // のは IDB から container が loaded + entries.length > 0 の状態のみで、
  // boot phase=ready が先行する race がある。direct descendant locator で
  // 「entry-list 内の target entry」を 1 段階で polling、render が完了した
  // 瞬間に hit するため region 待ち race を回避。timeout 30s。
  await expect(
    page.locator('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="tl-1"]'),
  ).toBeVisible({ timeout: 30_000 });

  // textlog entry を select
  await page.locator('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="tl-1"]').first().click();
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

  // CI flake fix v2 (2026-05-17):同上 — direct descendant locator + 30s
  // で entry-list region 待ち race を回避。
  await expect(
    page.locator('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="src"]'),
  ).toBeVisible({ timeout: 30_000 });

  // src TEXT を選択
  await page.locator('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="src"]').first().click();
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
