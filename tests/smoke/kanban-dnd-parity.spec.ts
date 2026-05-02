/**
 * Kanban DnD parity (visual-state-parity-testing.md §6 mandatory).
 *
 * Existing coverage: `tests/features/kanban/kanban-data.test.ts`
 * exercises the pure data-grouping helper; nothing checks that an
 * actual drag-and-drop gesture in the rendered view moves an entry
 * across columns. §6 calls this out explicitly:
 *
 *   | kanban DnD | drag 中の hover ターゲット = 期待 status 列 /
 *                  drop → state 反映 |
 *
 * This file is the parity proof:
 *
 *   1. boundingBox of the source card and the target column drop
 *      area, asserting the user can actually see them at the
 *      coordinates we drag from / to.
 *   2. `document.elementFromPoint(cx, cy)` resolves to the expected
 *      `data-pkc-kanban-draggable` / `data-pkc-kanban-drop-target`
 *      anchor — proves nothing else is occluding.
 *   3. Real OS-style drag via `page.mouse.move/down/up` — Playwright
 *      synthesizes the HTML5 DnD event tree (`dragstart` →
 *      `dragenter` / `dragover` → `drop` → `dragend`) when a mouse-
 *      down on a `draggable="true"` element is followed by movement
 *      and a mouse-up over a drop zone.
 *   4. State assertion: the dragged entry is in the destination
 *      column after release (BULK_SET_STATUS reduced to the new
 *      status). Verified via DOM count in source / dest columns.
 */

import { test, expect, type Page } from '@playwright/test';

async function bootAndOpenKanbanWithOneTodo(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', {
    timeout: 15_000,
  });

  // Create a Todo entry from the header (defaults to status='open').
  const createTodo = page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="todo"]')
    .first();
  await expect(createTodo).toBeVisible();
  await createTodo.click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', {
    timeout: 5_000,
  });
  await page.locator('[data-pkc-field="title"]').first().fill('Kanban DnD probe');
  // Commit via the action bar's Save (action-binder routes to COMMIT_EDIT).
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', {
    timeout: 5_000,
  });

  // Switch to kanban view.
  await page
    .locator('[data-pkc-action="set-view-mode"][data-pkc-view-mode="kanban"]')
    .click();
  await expect(page.locator('[data-pkc-region="kanban-view"]')).toBeVisible();
}

async function regionAtCenter(
  page: Page,
  cx: number,
  cy: number,
): Promise<{
  draggable: string | null;
  dropTarget: string | null;
}> {
  return page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return { draggable: null, dropTarget: null };
      const draggableEl = el.closest<HTMLElement>(
        '[data-pkc-kanban-draggable="true"]',
      );
      const dropEl = el.closest<HTMLElement>(
        '[data-pkc-kanban-drop-target]',
      );
      return {
        draggable: draggableEl?.getAttribute('data-pkc-lid') ?? null,
        dropTarget:
          dropEl?.getAttribute('data-pkc-kanban-drop-target') ?? null,
      };
    },
    { x: cx, y: cy },
  );
}

test('kanban DnD: drag a card from open → done updates state', async ({
  page,
}) => {
  await bootAndOpenKanbanWithOneTodo(page);

  // The Todo we just created lives in the open column. Locate it
  // via the data-pkc-kanban-draggable contract.
  const card = page
    .locator(
      '[data-pkc-region="kanban-view"] [data-pkc-kanban-draggable="true"]',
    )
    .first();
  await expect(card).toBeVisible();

  // The "done" column drop target is identified by its
  // data-pkc-kanban-drop-target attribute. We resolve via the column
  // wrapper to make the boundingBox reliable.
  const doneColumn = page.locator(
    '[data-pkc-region="kanban-view"] .pkc-kanban-column[data-pkc-kanban-status="done"] [data-pkc-kanban-drop-target="done"]',
  );
  await expect(doneColumn).toBeVisible();

  const cardBox = await card.boundingBox();
  const doneBox = await doneColumn.boundingBox();
  if (!cardBox || !doneBox) {
    throw new Error('boundingBox unavailable for card / done column');
  }

  // Parity assertion 1: card is at the coordinates the user sees,
  // and elementFromPoint at the card's center resolves to the
  // draggable card with the matching lid.
  const cardCx = cardBox.x + cardBox.width / 2;
  const cardCy = cardBox.y + cardBox.height / 2;
  const expectedLid = await card.getAttribute('data-pkc-lid');
  const cardHit = await regionAtCenter(page, cardCx, cardCy);
  expect(cardHit.draggable).toBe(expectedLid);

  // Parity assertion 2: done column drop area is genuinely visible
  // at its boundingBox center, no overlay occluding.
  const doneCx = doneBox.x + doneBox.width / 2;
  const doneCy = doneBox.y + doneBox.height / 2;
  const doneHit = await regionAtCenter(page, doneCx, doneCy);
  expect(doneHit.dropTarget).toBe('done');

  // Real OS drag. Playwright synthesizes HTML5 DnD events
  // (dragstart / dragenter / dragover / drop / dragend) when a
  // mousedown on a draggable="true" element is followed by movement
  // — same path the user's mouse would trigger.
  await page.mouse.move(cardCx, cardCy);
  await page.mouse.down();
  // Multi-step move so dragover fires on intermediate columns and
  // the renderer's data-pkc-drag-over highlight has a chance to
  // settle on the destination.
  await page.mouse.move(doneCx, doneCy, { steps: 10 });
  // Pause briefly so dragover events are flushed before drop.
  await page.waitForTimeout(50);
  await page.mouse.up();

  // State assertion: card now lives in the done column. Use locator
  // counts because the kanban renderer rebuilds columns on state
  // change; the original `card` Locator may stale.
  const openCardsRemaining = page.locator(
    '[data-pkc-region="kanban-view"] .pkc-kanban-column[data-pkc-kanban-status="open"] [data-pkc-kanban-draggable="true"]',
  );
  const doneCards = page.locator(
    '[data-pkc-region="kanban-view"] .pkc-kanban-column[data-pkc-kanban-status="done"] [data-pkc-kanban-draggable="true"]',
  );
  await expect(doneCards).toHaveCount(1, { timeout: 5_000 });
  await expect(openCardsRemaining).toHaveCount(0);

  // Confirm via lid: the card with our expected lid is the one in done.
  const doneLid = await doneCards.first().getAttribute('data-pkc-lid');
  expect(doneLid).toBe(expectedLid);
});
