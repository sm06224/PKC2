/**
 * filer モード ⚙ Filters disclosure parity(visual-state-parity-testing.md
 * §6 mandatory、pgc-49)。
 *
 * pgc-49 で filer sidebar が tree 同等の検索オプション(showArchived /
 * treeHideBuckets / searchHideBuckets / unreferenced)を獲得した。toggle
 * は `<details>` disclosure 内の checkbox であり、視覚を持つ feature ──
 * happy-dom 単体 test は filter ロジックの正しさは証明できても、ユーザーの
 * タップが実際に checkbox へ届き list が変化することは保証しない。本 spec
 * は `elementFromPoint` で checkbox が paint-visible / 非遮蔽であることを
 * 確認した上で `page.mouse.click(x, y)` の実 OS event で toggle し、filer
 * list の表示要素数変化(state mutation → consumer)を assert する。
 *
 * シナリオ:
 *   1. filer モードで起動、todo を 1 件作成。auto-placement で TODOS
 *      bucket folder が生成され、filer scope は TODOS 内へ移動する。
 *   2. filer nav-up(..)を実 click して root scope へ戻る。
 *   3. treeHideBuckets default-ON のため TODOS folder は filer root から
 *      hide されている(folder item 0 件)。
 *   4. ⚙ Filters disclosure を実 click で開き、tree-hide-buckets toggle の
 *      checkbox を boundingBox → elementFromPoint で非遮蔽確認。
 *   5. `page.mouse.click` の実 OS event で checkbox を ON。TODOS folder が
 *      filer list へ出現する(folder item 1 件)。
 *   6. 同座標を再 click で OFF。TODOS folder が再び hide される。
 */

import { test, expect, type Page } from '@playwright/test';

async function bootFilerWithTodoAtRoot(page: Page): Promise<void> {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=filer', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // todo を 1 件作成 → auto-placement で TODOS bucket folder が生まれ、
  // filer scope は新 todo の親(TODOS)へ移動する。
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="todo"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // filer nav-up(..)で root scope へ戻る。root では nav-up が消える。
  const sidebar = page.locator(
    '[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"]',
  );
  const navUp = sidebar.locator('.pkc-sidebar-filer-nav-up');
  await expect(navUp).toBeVisible();
  await navUp.click();
  await expect(navUp).toHaveCount(0);
}

test('parity: filer の tree-hide-buckets toggle を実 OS click で切替', async ({
  page,
}) => {
  await bootFilerWithTodoAtRoot(page);

  const sidebar = page.locator(
    '[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"]',
  );
  await expect(sidebar).toBeVisible();

  // treeHideBuckets default-ON:TODOS bucket folder は root list から hide。
  const folderItems = sidebar.locator(
    '.pkc-sidebar-filer-item[data-pkc-draggable][data-pkc-archetype="folder"]',
  );
  await expect(folderItems).toHaveCount(0);

  // ⚙ Filters disclosure を実 click で開く(閉じた `<details>` は子を
  // clip するため boundingBox / elementFromPoint が失敗する)。
  const filtersSummary = sidebar.locator(
    '[data-pkc-region="advanced-filters"] > summary[data-pkc-action="toggle-advanced-filters"]',
  );
  await expect(filtersSummary).toBeVisible();
  await filtersSummary.click();

  const checkbox = sidebar.locator(
    '[data-pkc-region="tree-hide-buckets-toggle"] input[data-pkc-action="toggle-tree-hide-buckets"]',
  );
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked();

  // Parity gate:checkbox が見えている座標でユーザーの click が checkbox
  // 自身に届く(他要素に遮蔽されていない)ことを elementFromPoint で確認。
  const box = await checkbox.boundingBox();
  if (!box) throw new Error('tree-hide-buckets checkbox has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      const input = el?.closest<HTMLElement>(
        'input[data-pkc-action="toggle-tree-hide-buckets"]',
      );
      return !!input;
    },
    { x: cx, y: cy },
  );
  expect(hit).toBe(true);

  // 実 OS click — treeHideBuckets を OFF にし bucket folder を surface。
  await page.mouse.click(cx, cy);
  await expect(checkbox).toBeChecked();
  await expect(folderItems).toHaveCount(1);
  await expect(folderItems.first()).toContainText('TODOS');

  // 同座標を再 click — treeHideBuckets を再び ON にし bucket folder を hide。
  await page.mouse.click(cx, cy);
  await expect(checkbox).not.toBeChecked();
  await expect(folderItems).toHaveCount(0);

  await page.screenshot({
    path: 'test-results/filer-toggle-filters-parity.png',
  });
});
