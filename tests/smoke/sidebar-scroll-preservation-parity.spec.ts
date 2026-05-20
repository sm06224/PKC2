/**
 * Sidebar scroll preservation — parity + 順序性 test (PR-GG).
 *
 * User audit (2026-05-06 修正指示2):
 *   "左ペインエントリの選択時にno-opっぽい動作あり、大量のエントリ
 *    がある状況で、クリックすると左ペインのスクロールが上に戻る"
 *
 * Root cause: the actual scroll container for the left pane is
 * `<ul class="pkc-entry-list">` (`flex:1; overflow-y:auto`), not the
 * outer `<aside class="pkc-sidebar">` wrapper. The pre-PR-GG capture
 * read `sidebar.scrollTop` which was always 0 — restore was therefore
 * a silent no-op. PR-GG marks the entry-list as a `data-pkc-region`
 * scroll target so render-continuity preserves it across re-renders.
 *
 * Phase 8 順序性:
 *   state mutation (SELECT_ENTRY) → consumer behavior change
 *   (entry-list scrollTop unchanged from pre-click value).
 *
 * reform-2026-05 §6 visual-state-parity: assert via real `scrollTop`
 * read AFTER click + rAF, not via `locator.click()` alone.
 */

import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

/**
 * Seed a flat container with N text entries directly into IDB. Flat
 * (no folders) so the sidebar tree renders all rows at top-level
 * without needing folder expansion.
 */
async function seedFlatEntries(page: Page, count: number): Promise<void> {
  await page.evaluate(async (n: number) => {
    const now = '2026-05-06T00:00:00.000Z';
    const entries = Array.from({ length: n }, (_, i) => ({
      lid: `seed-${String(i).padStart(4, '0')}`,
      title: `Seed Entry ${String(i + 1).padStart(4, '0')}`,
      archetype: 'text' as const,
      body: `body-${i}`,
      created_at: now,
      updated_at: now,
    }));
    const cont = {
      meta: {
        container_id: 'sidebar-scroll-test',
        title: 'Sidebar Scroll Test',
        created_at: now,
        updated_at: now,
        schema_version: 1,
      },
      entries,
      relations: [],
      revisions: [],
      assets: {},
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = (): void => {
          db.close();
          res();
        };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, count);
}

test('順序性: large sidebar — clicking a visible entry preserves entry-list scrollTop', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);
  await seedFlatEntries(page, 80);
  await page.reload();
  await bootReady(page);

  const entryList = page.locator('[data-pkc-region="entry-list"]');
  await expect(entryList).toBeVisible();

  // Confirm the seed actually rendered the rows.
  const rowCount = await entryList.locator('li.pkc-entry-item[data-pkc-lid]').count();
  expect(rowCount).toBeGreaterThan(50);

  // Confirm the seeded fixture produced a scrollable entry-list.
  const dimensions = await entryList.evaluate((el) => ({
    scrollHeight: (el as HTMLElement).scrollHeight,
    clientHeight: (el as HTMLElement).clientHeight,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight + 200);

  // Scroll the entry-list partway down so a click target is well below
  // the top.
  await entryList.evaluate((el) => {
    (el as HTMLElement).scrollTop = 600;
  });

  // Wait one rAF for the scroll to settle, then snapshot.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  const beforeScroll = await entryList.evaluate((el) => (el as HTMLElement).scrollTop);
  expect(beforeScroll).toBeGreaterThan(400);

  // Pick an entry within the visible viewport via elementFromPoint
  // so the painted row at this coord is what the user would click.
  const listBox = await entryList.boundingBox();
  if (!listBox) throw new Error('entry-list has no boundingBox');
  const cx = listBox.x + listBox.width / 2;
  const cy = listBox.y + listBox.height / 2;

  const targetLid = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const li = el?.closest<HTMLElement>('li.pkc-entry-item[data-pkc-lid]');
      return li?.getAttribute('data-pkc-lid') ?? null;
    },
    { x: cx, y: cy },
  );
  expect(targetLid).not.toBeNull();

  await page.mouse.click(cx, cy);

  // Wait two rAFs to let the deferred re-apply land before observing.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  // Re-query because the entry-list element is replaced on full
  // re-render (root.innerHTML wipe).
  const afterScroll = await page
    .locator('[data-pkc-region="entry-list"]')
    .evaluate((el) => (el as HTMLElement).scrollTop);

  // Tolerance: allow ±2px to absorb sub-pixel scroll snapping at row
  // boundaries. The bug was "snap to 0" — order-of-magnitude shift.
  expect(Math.abs(afterScroll - beforeScroll)).toBeLessThanOrEqual(2);
});
