/**
 * Graph relation wire editor — visual parity(Group B、Phase γ-B2)。
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠。実 OS event
 * (page.mouse.click / boundingBox)で、生成だけでなく user が操作する
 * 描画要素まで chain を verify する。
 *
 * 検証:
 *   1. graph edit mode toggle を実 OS click で切替(active class が遷移)。
 *   2. wire-drop → kind selector popup が出て、実 OS click で kind を選ぶと
 *      popup が閉じる。
 *
 * 注:graph canvas の node 座標は force layout で非決定的なため、canvas
 * pixel drag の gesture math は vitest(graph-canvas-gestures.test.ts、
 * 固定 node 位置)で決定的に検証済。本 smoke は DOM で locate 可能な視覚
 * 要素(toggle / popup)の実 OS event parity を担う。
 */

import { test, expect, type Page } from '@playwright/test';

async function bootGraph(page: Page, entryCount: number): Promise<void> {
  await page.goto('/pkc2.html?pkc-flag=graph.edit_mode_enabled=true', {
    waitUntil: 'load',
  });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  for (let i = 0; i < entryCount; i++) {
    await page
      .locator(
        'button[data-pkc-action="create-entry"][data-pkc-archetype="text"]',
      )
      .first()
      .click();
    await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
    await page.locator('button[data-pkc-action="commit-edit"]').first().click();
    await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  }

  const tab = page.locator(
    'button[data-pkc-action="set-view-mode"][data-pkc-view-mode="graph"]',
  );
  const box = await tab.boundingBox();
  if (!box) throw new Error('graph tab has no boundingBox');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-pkc-region="graph-view"]')).toBeVisible();
}

test('parity: graph edit mode toggle を実 OS click で View↔Edit 切替', async ({
  page,
}) => {
  await bootGraph(page, 1);

  const toggle = page.locator('[data-pkc-region="graph-edit-toggle"]');
  await expect(toggle).toBeVisible();

  const editBtn = toggle.locator('[data-pkc-graph-edit-mode="edit"]');
  const viewBtn = toggle.locator('[data-pkc-graph-edit-mode="view"]');

  // 実 OS click で Edit へ。
  const eb = await editBtn.boundingBox();
  if (!eb) throw new Error('edit toggle has no boundingBox');
  await page.mouse.click(eb.x + eb.width / 2, eb.y + eb.height / 2);
  await expect(editBtn).toHaveClass(/pkc-graph-edit-toggle-active/);
  await expect(viewBtn).not.toHaveClass(/pkc-graph-edit-toggle-active/);

  // 実 OS click で View へ戻す。
  const vb = await viewBtn.boundingBox();
  if (!vb) throw new Error('view toggle has no boundingBox');
  await page.mouse.click(vb.x + vb.width / 2, vb.y + vb.height / 2);
  await expect(viewBtn).toHaveClass(/pkc-graph-edit-toggle-active/);
  await expect(editBtn).not.toHaveClass(/pkc-graph-edit-toggle-active/);

  await page.screenshot({
    path: 'test-results/graph-edit-toggle-parity.png',
  });
});

test('parity: wire-drop → kind selector popup を実 OS click で選ぶと閉じる', async ({
  page,
}) => {
  await bootGraph(page, 2);

  // 2 entry の lid を DOM から取得。
  const lids = await page.evaluate(() => {
    const set = new Set<string>();
    document.querySelectorAll('[data-pkc-lid]').forEach((el) => {
      const l = el.getAttribute('data-pkc-lid');
      if (l) set.add(l);
    });
    return Array.from(set);
  });
  expect(lids.length).toBeGreaterThanOrEqual(2);

  // canvas node 座標は force layout で非決定的なため、wire-drop event は
  // evaluate で発火(gesture math は vitest で決定済)。popup の出現と
  // kind 選択は実 OS event で parity 検証する。
  await page.evaluate(
    ({ from, to }) => {
      document.getElementById('pkc-root')?.dispatchEvent(
        new CustomEvent('pkc-graph-wire-drop', {
          detail: { source: from, target: to, clientX: 240, clientY: 220 },
          bubbles: true,
        }),
      );
    },
    { from: lids[0], to: lids[1] },
  );

  const popup = page.locator('[data-pkc-region="relation-kind-popup"]');
  await expect(popup).toBeVisible();
  await expect(popup.locator('[data-pkc-relation-kind]')).toHaveCount(5);

  // structural を実 OS click。
  const kindBtn = popup.locator('[data-pkc-relation-kind="structural"]');
  const kb = await kindBtn.boundingBox();
  if (!kb) throw new Error('kind button has no boundingBox');
  await page.mouse.click(kb.x + kb.width / 2, kb.y + kb.height / 2);

  await expect(popup).not.toBeVisible();

  await page.screenshot({
    path: 'test-results/graph-wire-kind-popup-parity.png',
  });
});
