/**
 * Calendar parity (visual-state-parity-testing.md §6 mandatory).
 *
 * §6 calls out the calendar today marker + archived hide toggle as
 * mandatory parity scenarios. §6 also says **1 scenario per feature
 * is the minimum**. This file ships the today-marker parity (#1)
 * green; the archived-toggle parity (#2) is split into a follow-up
 * because reliably seeding an archived todo via the editor form
 * requires a more deterministic seed path (the `<input type="date">`
 * + checkbox combo doesn't survive `page.fill` / `el.checked = true`
 * + dispatched events through to COMMIT_EDIT consistently).
 *
 * Existing coverage was the pure data layer
 * (`tests/features/calendar/calendar-data.test.ts`) only — nothing
 * verified that the rendered today cell actually paints with the
 * `data-pkc-calendar-today="true"` marker at the visible coordinate
 * the user expects.
 *
 * This file provides parity proof for the today marker:
 *
 *   1. Navigate to calendar view, find the cell with `data-pkc-date`
 *      matching today's local date.
 *   2. Assert `data-pkc-calendar-today="true"`.
 *   3. boundingBox the cell; `elementFromPoint` at center resolves to
 *      that cell — proves the today highlight is actually painted at
 *      the expected coordinate, not occluded.
 *
 * Follow-up: a second scenario will exercise the
 * `[data-pkc-action="toggle-show-archived"]` toggle once a seed path
 * for an archived todo lands (likely via a synthetic
 * SYS_INIT_COMPLETE container injected through `page.evaluate`).
 */

import { test, expect, type Page } from '@playwright/test';

/** Today key in the renderer's local-time format (`YYYY-MM-DD`). */
function todayKeyLocal(): string {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function bootAndSeedOneTodo(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', {
    timeout: 15_000,
  });
  // The view-mode tabs are hidden until at least one user entry
  // exists (renderer.ts:3522), so seed one Todo. The form-fill is
  // intentionally minimal — we only need the calendar to render.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="todo"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', {
    timeout: 5_000,
  });
  await page.locator('[data-pkc-field="title"]').first().fill('Calendar boot probe');
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', {
    timeout: 5_000,
  });
}

test('calendar: today cell carries today marker AND paints at visible coords', async ({
  page,
}) => {
  await bootAndSeedOneTodo(page);

  await page
    .locator('[data-pkc-action="set-view-mode"][data-pkc-view-mode="calendar"]')
    .click();
  await expect(page.locator('[data-pkc-region="calendar-view"]')).toBeVisible();

  const key = todayKeyLocal();
  // Scope strictly to the cell — `[data-pkc-date]` also matches the
  // per-cell "+ Add" button (renderer.ts:3712).
  const todayCell = page.locator(`.pkc-calendar-cell[data-pkc-date="${key}"]`);
  await expect(todayCell).toBeVisible();
  await expect(todayCell).toHaveAttribute('data-pkc-calendar-today', 'true');

  // Parity: the cell paints at coordinates the user can see, and
  // the pixel at the cell's center resolves to that cell — no
  // overlay hiding it.
  const box = await todayCell.boundingBox();
  if (!box) throw new Error('today cell has no bounding box');
  expect(box.width).toBeGreaterThan(20);
  expect(box.height).toBeGreaterThan(20);

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      const cell = el?.closest<HTMLElement>('.pkc-calendar-cell[data-pkc-date]');
      return {
        date: cell?.getAttribute('data-pkc-date') ?? null,
        today: cell?.getAttribute('data-pkc-calendar-today') ?? null,
      };
    },
    { x: cx, y: cy },
  );
  expect(hit.date).toBe(key);
  expect(hit.today).toBe('true');
});
