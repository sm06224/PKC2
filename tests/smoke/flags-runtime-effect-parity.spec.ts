/**
 * Flags runtime effect parity — end-to-end 順序性テスト.
 *
 * Validates that **changing a flag via the inspector actually
 * affects the consuming feature without a page reload**. This was
 * the gap that caused the 2026-05-04 critical bug report:
 * `defineFlag` returned the import-time value, so consumers that
 * captured `RECENT_ENTRIES_DEFAULT_LIMIT = 10` at module-import
 * never saw the user's edit. Fixed by changing `defineFlag` to
 * return a live getter `() => T`.
 *
 * Spec: docs/spec/flags-protocol-v1-minimum-scope.md §3 (resolution
 * order; default `requiresReload: false`).
 *
 * Two scenarios:
 *   1. URL flag path — `?pkc-flag=recent.default_limit=5` at boot
 *      makes the Recent pane show 5 rows on a 100-entry fixture.
 *   2. Inspector-edit path — change flag via inspector, no reload,
 *      Recent pane updates immediately.
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, '..', '..', 'bench-fixtures', 'c-100.json');

async function bootReady(page: Page): Promise<void> {
  await expect(page.locator('#pkc-root')).toHaveAttribute(
    'data-pkc-phase',
    'ready',
    { timeout: 15_000 },
  );
}

async function seedFixture(page: Page): Promise<void> {
  const containerJson = readFileSync(FIXTURE, 'utf-8');
  await page.evaluate(async (raw: string) => {
    const cont = JSON.parse(raw) as { meta: { container_id: string } };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        // The IDB store is keyed by `__default__` → container_id.
        // Without this pointer, `loadDefault()` returns null and
        // boot falls back to pkc-data / empty.
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = (): void => {
          db.close();
          res();
        };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, containerJson);
}

async function expandRecentPane(page: Page): Promise<void> {
  await page.evaluate(() => {
    const d = document.querySelector(
      '[data-pkc-region="recent-entries"]',
    ) as HTMLDetailsElement | null;
    if (d) d.open = true;
  });
}

test('URL flag `?pkc-flag=recent.default_limit=5` is honored at boot', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=recent.default_limit=5');
  await bootReady(page);
  await seedFixture(page);
  await page.reload();
  await bootReady(page);
  await expandRecentPane(page);

  const rows = page.locator(
    '[data-pkc-region="recent-entries"] [data-pkc-action="select-recent-entry"]',
  );
  await expect(rows).toHaveCount(5, { timeout: 5_000 });
});

test('inspector-edit takes effect immediately — no reload (regression: import-time-capture bug)', async ({
  page,
}) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await seedFixture(page);
  await page.reload();
  await bootReady(page);
  await expandRecentPane(page);

  let rows = page.locator(
    '[data-pkc-region="recent-entries"] [data-pkc-action="select-recent-entry"]',
  );
  await expect(rows).toHaveCount(10);

  // Open inspector via shell-menu link.
  await page.locator('button[data-pkc-action="toggle-shell-menu"]').first().click();
  await page
    .locator('button[data-pkc-action="open-flags-inspector"]')
    .first()
    .click();
  const overlay = page.locator('[data-pkc-region="flags-inspector-overlay"]');
  await expect(overlay).toBeVisible();

  // Change the flag to 3.
  const input = overlay.locator(
    '[data-pkc-action="set-flag-numeric"][data-pkc-key="recent.default_limit"]',
  );
  await input.fill('3');
  await input.dispatchEvent('change');

  // Source flips to container — confirms SET_FLAG dispatched.
  await expect(
    page.locator(
      '[data-pkc-region="flag-row"][data-pkc-key="recent.default_limit"]',
    ),
  ).toHaveAttribute('data-pkc-source', 'container', { timeout: 2_000 });

  await overlay.locator('.pkc-flags-inspector-close').click();
  await expect(overlay).toHaveCount(0);

  // *** Without a reload ***, Recent pane must now show 3 rows.
  // This is the regression test for the 2026-05-04 import-time-capture
  // bug. defineFlag now returns a live getter so consumers see the
  // new value on the next render after SET_FLAG.
  await expandRecentPane(page);
  rows = page.locator(
    '[data-pkc-region="recent-entries"] [data-pkc-action="select-recent-entry"]',
  );
  await expect(rows).toHaveCount(3, { timeout: 3_000 });
});
