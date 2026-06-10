/**
 * Pane 展開 visual parity spec(issue #792 ①再発、user 実機報告 2026-06-10):
 * 「サイドペーンを両方とも Hide 時にセンタータブ Filer でひらいた
 * エントリ、隠れたサイドペーンを開くと再現」
 *
 * 機構:collapsed pane は full render のたび lazy placeholder(空)に
 * 置き換わる(pgc-224/225)。展開側の各経路は SYS_SYNC_CHILD_WINDOWS を
 * dispatch して full render を強制し placeholder を実コンテンツに差し替える
 * 契約。focus-mode chord(Ctrl+Alt+\ / Alt+Space)の keydown 経路だけ
 * dispatcher を渡しておらず、展開後も placeholder が残って「ペーンが
 * 描画されない」symptom を起こしていた(action-binder.ts の
 * toggleFocusMode 呼び出し)。
 *
 * Filer 手順が再現条件に入るのは「collapsed 中に full render を走らせて
 * placeholder を DOM に仕込む」ステップだから(view 切替なら何でもよい)。
 *
 * 展開 3 経路(tray click / tabs-ON tray click / focus-mode chord)すべてで
 * 「展開後の pane に実コンテンツが描画される」end-to-end parity を assert。
 */

import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function bootWithEntryOpenedFromFiler(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await bootReady(page);
  const shell = page.locator('#pkc-root');

  // 1. text entry を作成。
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('input[data-pkc-field="title"]').first().fill('Repro Entry');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // 2. 両ペーンを Hide(header の ◧ / ◨ toggle)。
  await page.locator('button[data-pkc-action="toggle-sidebar"]').first().click();
  await expect(page.locator('[data-pkc-region="sidebar"]')).toHaveAttribute(
    'data-pkc-collapsed',
    'true',
  );
  await page.locator('button[data-pkc-action="toggle-meta"]').first().click();
  await expect(page.locator('[data-pkc-region="meta"]')).toHaveAttribute(
    'data-pkc-collapsed',
    'true',
  );

  // 3. Filer view へ(センタータブ Filer)。
  const filerTab = page.locator(
    'button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]',
  );
  const tBox = await filerTab.boundingBox();
  if (!tBox) throw new Error('Filer tab has no boundingBox');
  await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible();

  // 4. Filer の行(Repro Entry)を single click → detail で開く。
  const row = page.locator('tr.pkc-filer-row', { hasText: 'Repro Entry' }).first();
  await expect(row).toBeVisible();
  const rBox = await row.boundingBox();
  if (!rBox) throw new Error('Filer row has no boundingBox');
  await page.mouse.click(rBox.x + rBox.width / 2, rBox.y + rBox.height / 2);
  // detail に遷移し、center にエントリが出る。
  await expect(page.locator('[data-pkc-region="center"]')).toContainText('Repro Entry');
}

test('耳たぶで展開した sidebar に entry rows が描画されている', async ({ page }) => {
  await bootWithEntryOpenedFromFiler(page);

  // 5. 耳たぶ(tray-left)で sidebar を展開。
  const trayLeft = page.locator('[data-pkc-region="tray-left"]');
  await expect(trayLeft).toBeVisible();
  const lBox = await trayLeft.boundingBox();
  if (!lBox) throw new Error('tray-left has no boundingBox');
  await page.mouse.click(lBox.x + lBox.width / 2, lBox.y + lBox.height / 2);

  // 6. assert: sidebar は展開され、entry rows が見えている。
  const sidebar = page.locator('[data-pkc-region="sidebar"]');
  await expect(sidebar).not.toHaveAttribute('data-pkc-collapsed', 'true');
  // lazy placeholder のままではない(中身が build されている)。
  const lazy = await sidebar.getAttribute('data-pkc-lazy-sidebar');
  const rowCount = await sidebar.locator('li[data-pkc-lid]').count();
  console.log(`[diag] sidebar lazy=${lazy} rowCount=${rowCount}`);
  expect(lazy).toBeNull();
  expect(rowCount).toBeGreaterThan(0);

  // 視覚 parity:sidebar 領域の中央点で elementFromPoint → sidebar 内の
  // 要素に当たる(空白 placeholder ではなく実コンテンツが視認できる)。
  const sBox = await sidebar.boundingBox();
  if (!sBox) throw new Error('sidebar has no boundingBox');
  const hit = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x!, y!);
      const sb = document.querySelector('[data-pkc-region="sidebar"]');
      return {
        tag: el?.tagName ?? null,
        insideSidebar: !!(el && sb && sb.contains(el)),
      };
    },
    [sBox.x + sBox.width / 2, sBox.y + Math.min(sBox.height / 2, 200)],
  );
  console.log(`[diag] elementFromPoint hit=${JSON.stringify(hit)}`);
  expect(hit.insideSidebar).toBe(true);
});

test('tabs ON: センタータブ Filer 経由で開いた entry 後の耳たぶ展開', async ({ page }) => {
  await page.goto(
    '/pkc2.html?pkc-flag=shell.tabs_enabled=1&pkc-flag=shell.command_palette_enabled=1',
    { waitUntil: 'load' },
  );
  await bootReady(page);
  const shell = page.locator('#pkc-root');

  // entry を作成。
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('input[data-pkc-field="title"]').first().fill('Repro Entry');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // 両ペーン Hide。
  await page.locator('button[data-pkc-action="toggle-sidebar"]').first().click();
  await page.locator('button[data-pkc-action="toggle-meta"]').first().click();
  await expect(page.locator('[data-pkc-region="sidebar"]')).toHaveAttribute(
    'data-pkc-collapsed',
    'true',
  );

  // Filer を view tab として open(command palette 経由)。
  await page.keyboard.press('Control+Shift+P');
  await page.locator('[data-pkc-field="cmd-query"]').fill('ファイラ');
  await page.locator('[data-pkc-cmd-id="view-tab.open.filer"]').first().click();
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible();

  // Filer の行を click → detail で開く。
  const row = page.locator('tr.pkc-filer-row', { hasText: 'Repro Entry' }).first();
  await expect(row).toBeVisible();
  const rBox = await row.boundingBox();
  if (!rBox) throw new Error('Filer row has no boundingBox');
  await page.mouse.click(rBox.x + rBox.width / 2, rBox.y + rBox.height / 2);
  await expect(page.locator('[data-pkc-region="center"]')).toContainText('Repro Entry');

  // 耳たぶ(tray-left)で sidebar を展開。
  const trayLeft = page.locator('[data-pkc-region="tray-left"]');
  await expect(trayLeft).toBeVisible();
  const lBox = await trayLeft.boundingBox();
  if (!lBox) throw new Error('tray-left has no boundingBox');
  await page.mouse.click(lBox.x + lBox.width / 2, lBox.y + lBox.height / 2);

  const sidebar = page.locator('[data-pkc-region="sidebar"]');
  await expect(sidebar).not.toHaveAttribute('data-pkc-collapsed', 'true');
  const lazy = await sidebar.getAttribute('data-pkc-lazy-sidebar');
  const rowCount = await sidebar.locator('li[data-pkc-lid]').count();
  console.log(`[diag tabsON] sidebar lazy=${lazy} rowCount=${rowCount}`);
  expect(lazy).toBeNull();
  expect(rowCount).toBeGreaterThan(0);

  // tray-right も展開して meta を確認。
  const trayRight = page.locator('[data-pkc-region="tray-right"]');
  await expect(trayRight).toBeVisible();
  const rB = await trayRight.boundingBox();
  if (!rB) throw new Error('tray-right has no boundingBox');
  await page.mouse.click(rB.x + rB.width / 2, rB.y + rB.height / 2);
  const meta = page.locator('[data-pkc-region="meta"]');
  await expect(meta).not.toHaveAttribute('data-pkc-collapsed', 'true');
  const metaLazy = await meta.getAttribute('data-pkc-lazy-meta');
  const metaChildren = await meta.evaluate((el) => el.children.length);
  console.log(`[diag tabsON] meta lazy=${metaLazy} childCount=${metaChildren}`);
  expect(metaLazy).toBeNull();
  expect(metaChildren).toBeGreaterThan(0);
});

test('focus-mode chord(Ctrl+Alt+\\)で展開した両ペーンに中身が描画されている', async ({ page }) => {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await bootReady(page);
  const shell = page.locator('#pkc-root');

  // entry を作成。
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('input[data-pkc-field="title"]').first().fill('Repro Entry');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // 両ペーンを focus-mode chord で Hide。
  await page.keyboard.press('Control+Alt+\\');
  await expect(page.locator('[data-pkc-region="sidebar"]')).toHaveAttribute(
    'data-pkc-collapsed',
    'true',
  );

  // Filer view へ → collapsed pane は lazy placeholder に置き換わる。
  const filerTab = page.locator(
    'button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]',
  );
  const tBox = await filerTab.boundingBox();
  if (!tBox) throw new Error('Filer tab has no boundingBox');
  await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible();

  // Filer の行を click → detail で開く(collapsed のまま再 full render)。
  const row = page.locator('tr.pkc-filer-row', { hasText: 'Repro Entry' }).first();
  await expect(row).toBeVisible();
  const rBox = await row.boundingBox();
  if (!rBox) throw new Error('Filer row has no boundingBox');
  await page.mouse.click(rBox.x + rBox.width / 2, rBox.y + rBox.height / 2);
  await expect(page.locator('[data-pkc-region="center"]')).toContainText('Repro Entry');

  // focus-mode chord で両ペーンを展開。
  await page.keyboard.press('Control+Alt+\\');
  const sidebar = page.locator('[data-pkc-region="sidebar"]');
  await expect(sidebar).not.toHaveAttribute('data-pkc-collapsed', 'true');

  // assert: 展開後の sidebar / meta に中身が描画されている。
  const lazy = await sidebar.getAttribute('data-pkc-lazy-sidebar');
  const rowCount = await sidebar.locator('li[data-pkc-lid]').count();
  console.log(`[diag chord] sidebar lazy=${lazy} rowCount=${rowCount}`);
  expect(lazy).toBeNull();
  expect(rowCount).toBeGreaterThan(0);

  const meta = page.locator('[data-pkc-region="meta"]');
  await expect(meta).not.toHaveAttribute('data-pkc-collapsed', 'true');
  const metaLazy = await meta.getAttribute('data-pkc-lazy-meta');
  const metaChildren = await meta.evaluate((el) => el.children.length);
  console.log(`[diag chord] meta lazy=${metaLazy} childCount=${metaChildren}`);
  expect(metaLazy).toBeNull();
  expect(metaChildren).toBeGreaterThan(0);
});

test('耳たぶで展開した meta pane に中身が描画されている', async ({ page }) => {
  await bootWithEntryOpenedFromFiler(page);

  // 5. 耳たぶ(tray-right)で meta を展開。
  const trayRight = page.locator('[data-pkc-region="tray-right"]');
  await expect(trayRight).toBeVisible();
  const rBox = await trayRight.boundingBox();
  if (!rBox) throw new Error('tray-right has no boundingBox');
  await page.mouse.click(rBox.x + rBox.width / 2, rBox.y + rBox.height / 2);

  const meta = page.locator('[data-pkc-region="meta"]');
  await expect(meta).not.toHaveAttribute('data-pkc-collapsed', 'true');
  const lazy = await meta.getAttribute('data-pkc-lazy-meta');
  const childCount = await meta.evaluate((el) => el.children.length);
  console.log(`[diag] meta lazy=${lazy} childCount=${childCount}`);
  expect(lazy).toBeNull();
  expect(childCount).toBeGreaterThan(0);
});
