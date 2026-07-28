/**
 * #932(user 指摘 2026-07-17)tab strip の visual parity。
 *
 * 1. 「エントリを開いた瞬間に(次の操作を待たず)タブが出る」── 実ブラウザで
 *    sidebar entry を click した直後の tab 数を assert(1 テンポ遅れ fix)。
 * 2. tab strip 右クリック → タブ一覧 menu が出て、click で選択が移る。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedEntries(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = '2026-07-17T00:00:00.000Z';
    const mk = (lid: string, title: string): Record<string, unknown> => ({
      lid, title, archetype: 'text', body: `# ${title}\n`, created_at: now, updated_at: now,
    });
    const cont = {
      meta: { container_id: 'tab-parity', title: 'tab parity', created_at: now, updated_at: now, schema_version: 1 },
      entries: [mk('t1', 'Tab One'), mk('t2', 'Tab Two'), mk('t3', 'Tab Three')],
      relations: [], revisions: [], assets: {},
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
}

test('parity: タブは開いた瞬間に増え、右クリックで一覧 menu が使える', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=shell.tabs_enabled=1');
  await bootReady(page);
  // boot 直後の debounced save が seed を上書きしないよう settle を待つ。
  await page.waitForTimeout(800);
  await seedEntries(page);
  await page.goto('/pkc2.html?pkc-flag=shell.tabs_enabled=1');
  await bootReady(page);

  const strip = page.locator('[data-pkc-region="tab-strip"]');
  await expect(strip).toBeVisible();

  const rows = page.locator('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"]');
  const first = rows.nth(0);
  const second = rows.nth(1);
  const firstLid = (await first.getAttribute('data-pkc-lid'))!;
  const secondLid = (await second.getAttribute('data-pkc-lid'))!;

  // click 直後 ── 追加操作なしで tab が出ること(1 テンポ遅れなら 0 個のまま)
  await first.click();
  await expect(strip.locator(`.pkc-tab[data-pkc-lid="${firstLid}"]`)).toBeVisible();
  await second.click();
  await expect(strip.locator('.pkc-tab')).toHaveCount(2);

  // 右クリック → タブ一覧 menu
  await strip.locator(`.pkc-tab[data-pkc-lid="${secondLid}"]`).click({ button: 'right' });
  const menu = page.locator('[data-pkc-region="context-menu"]');
  await expect(menu).toBeVisible();
  const items = menu.locator('[data-pkc-action="select-entry"]');
  await expect(items).toHaveCount(2);

  // menu から最初の tab を選択 → 選択が移り menu は閉じる
  await items.first().click();
  await expect(menu).toHaveCount(0);
  await expect(
    page.locator(`[data-pkc-region="entry-list"] [data-pkc-lid="${firstLid}"][data-pkc-selected="true"]`),
  ).toBeVisible();

  // tab を × で閉じる → 右クリック menu に「最近閉じたタブ」が出て復元できる
  await strip.locator(`.pkc-tab[data-pkc-lid="${secondLid}"] [data-pkc-action="close-tab"]`).click();
  await expect(strip.locator('.pkc-tab')).toHaveCount(1);
  await strip.click({ button: 'right' });
  const reopen = page.locator(`[data-pkc-region="context-menu"] [data-pkc-action="reopen-closed-tab"][data-pkc-lid="${secondLid}"]`);
  await expect(reopen).toBeVisible();
  await reopen.click();
  await expect(strip.locator('.pkc-tab')).toHaveCount(2);

  await page.screenshot({ path: 'test-results/tab-strip-immediate-and-menu-parity.png' });
});
