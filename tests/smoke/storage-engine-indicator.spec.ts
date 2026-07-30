/**
 * 保存先エンジンの表示(2026-07-28)。
 *
 * > 「wasm-sqlite で稼働してるかどうかわからんのやが?」(user 指摘)
 *
 * flag で backend が切り替わるのに、確認手段が devtools の
 * `__pkc2StorageInfo` しか無かった。**確認できない = 入っていないのと同じ**
 * なので、Storage Profile ダイアログに出すようにした。
 *
 * ここで pin するのは「表示が出ること」ではなく **「表示が実態と一致すること」**:
 *   - flag OFF → IndexedDB と出る
 *   - flag ON  → wasm-sqlite と出て、**sqlite のライブラリ版が入っている**
 * 版まで見るのは、「sqlite で動いている」と**自称するだけの表示**と、
 * 実際に init が返した値を出している表示を区別するため。
 */
import { test, expect, type Page } from '@playwright/test';

async function openStorageProfile(page: Page): Promise<void> {
  await page.waitForSelector('[data-pkc-region="sidebar"]', { timeout: 15_000 });
  // シェルメニュー → データ管理 → Storage Profile
  const menu = page.locator('[data-pkc-action="toggle-shell-menu"]').first();
  if (await menu.count() > 0) await menu.click();
  await page.locator('[data-pkc-action="show-storage-profile"]').first().click();
  await page.waitForSelector('[data-pkc-region="storage-profile"]', { timeout: 10_000 });
}

async function engineRow(page: Page): Promise<{ kind: string | null; text: string }> {
  const el = page.locator('[data-pkc-region="storage-engine"]').first();
  await el.waitFor({ timeout: 10_000 });
  return {
    kind: await el.getAttribute('data-pkc-storage-engine'),
    text: (await el.textContent()) ?? '',
  };
}

test.describe('保存先エンジンの表示', () => {
  test('既定(flag OFF)では IndexedDB と表示される', async ({ page }) => {
    await page.goto('/');
    await openStorageProfile(page);
    const row = await engineRow(page);
    expect(row.kind).toBe('idb');
    expect(row.text).toContain('IndexedDB');
    // 実態と一致していること(表示だけ先に用意して中身が無い、を防ぐ)
    const info = await page.evaluate('window.__pkc2StorageInfo');
    expect((info as { sqlite: boolean }).sqlite).toBe(false);
  });

  test('flag ON では wasm-sqlite と表示され、ライブラリ版が入っている', async ({ page }) => {
    await page.goto('/?pkc-flag=storage.sqlite_backend%3Dtrue');
    await openStorageProfile(page);
    const row = await engineRow(page);
    expect(row.kind, `表示が sqlite になっていない: ${row.text}`).toBe('wasm-sqlite');
    expect(row.text).toContain('wasm-sqlite');
    // 🔑 **自称ではなく実測値**: init が返した version が出ていること
    expect(row.text, `sqlite の版が出ていない: ${row.text}`).toMatch(/3\.\d+\.\d+/);
    expect(row.text).toContain('永続');
    // 揮発警告は出ていない(= 永続化が成立している)
    expect(row.text).not.toContain('揮発');

    const engine = await page.evaluate('window.__pkc2StorageEngine');
    expect(engine).toMatchObject({ kind: 'wasm-sqlite', persistent: true, vfs: 'sahpool' });
  });
});
