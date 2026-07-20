/**
 * #938 R11 — render coalescing(flag ON)の visual parity。
 * `perf.render_coalescing=1` で render が microtask 集約されても、実マウス /
 * 実キーボードの操作に対して画面が従来どおり正しく追従することを証明する
 * (選択 → center 反映、検索連射入力 → 絞り込み反映)。flag OFF が既定の
 * ため、本 spec が ON 経路の唯一の実ブラウザ検証になる。
 */
import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

test('parity: coalescing ON でも選択・検索が画面に正しく追従する', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/pkc2.html?pkc-flag=perf.render_coalescing=1&pkc-flag=sidebar.mode=tree');
  await bootReady(page);
  const shell = page.locator('#pkc-root');

  // entry を 2 件作成(UI 経由)
  for (const title of ['CoalesceAlpha', 'CoalesceBeta']) {
    await page
      .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
      .first()
      .click();
    await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
    await page.locator('[data-pkc-field="title"]').first().fill(title);
    await page.locator('[data-pkc-action="commit-edit"]').first().click();
    await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  }

  // 実マウスで 1 件目を選択 → center に反映される(deferred render の追従)
  const row = page.locator(
    '[data-pkc-region="entry-list"] li.pkc-entry-item[data-pkc-lid]',
    { hasText: 'CoalesceAlpha' },
  );
  const box = await row.boundingBox();
  if (!box) throw new Error('row has no bounding box');
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document.elementFromPoint(x, y)?.closest('li[data-pkc-lid]') !== null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe(true);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(
    page.locator('[data-pkc-region="entry-list"] li.pkc-entry-item[data-pkc-selected="true"]'),
  ).toContainText('CoalesceAlpha');
  await expect(page.locator('[data-pkc-region="center"]')).toContainText('CoalesceAlpha');

  // 実キーボードで検索を連射入力 → 最終的に Beta 1 件へ絞り込まれる
  // (キーストロークごとの dispatch が集約されても最終描画が正しい)
  const search = page.locator('[data-pkc-field="search"]').first();
  await search.click();
  await page.keyboard.type('CoalesceBeta');
  await expect(
    page.locator('[data-pkc-region="entry-list"] li.pkc-entry-item'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-pkc-region="entry-list"] li.pkc-entry-item'),
  ).toContainText('CoalesceBeta');

  await page.screenshot({ path: 'test-results/render-coalescing-parity.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
