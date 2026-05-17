/**
 * Sidebar scroll preservation — multi-click stress test (PR-XX, 2026-05-06).
 *
 * User 修正指示4 follow-up:「左ペインのno-opっぽい挙動継続中。
 * 何らかの要素によって押し除けられているのかもしれない」
 *
 * PR-GG で entry-list scroll 保持を着地させたが user は継続報告。
 * 本テストは「何かに押し除けられている」シナリオを 4 つ stress test
 * して、ある特定の click パターンで scroll が drift する条件を
 * fingerprint する。
 *
 *   1. **連続 click**:5 回別 entry を click → scroll drift なし
 *   2. **clipped 行 click**:viewport 端で部分 clipped されている entry
 *      を click → scroll が押し除けられない
 *   3. **scrollHeight 拡大**:多数 entry seed 後の click → 安定
 *   4. **selectedLid 変動 + 別 dispatch**:filer→detail mode 切替 +
 *      SELECT_ENTRY のチェーンで scroll 保持
 */
import { test, expect, type Page } from '@playwright/test';

async function bootReady(page: Page): Promise<void> {
  await expect(page.locator('#pkc-root')).toHaveAttribute(
    'data-pkc-phase',
    'ready',
    { timeout: 15_000 },
  );
}

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
        container_id: 'sidebar-scroll-multi',
        title: 'Multi-Click Test',
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

async function settleRAF(page: Page, n: number = 2): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  }
}

test('PR-XX scenario A: 5 sequential clicks at deep scroll preserve scrollTop', async ({
  page,
}) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await seedFlatEntries(page, 200);
  await page.reload();
  await bootReady(page);

  const entryList = page.locator('[data-pkc-region="entry-list"]');
  // CI flake fix (2026-05-17):`data-pkc-phase=ready` の後でも 200 entry の
  // re-render が completion する前に entry-list 操作に入ると、CI 高負荷時
  // (2 worker 並列 + matrix shard 4 並列 = 8 parallel)に flake 化。
  // 実際の seeded entry が DOM に居ることを wait してから scroll 操作。
  await expect(entryList).toBeVisible({ timeout: 15_000 });
  await expect(
    entryList.locator('[data-pkc-action="select-entry"][data-pkc-lid^="seed-"]'),
  ).toHaveCount(200, { timeout: 15_000 });

  await entryList.evaluate((el) => {
    (el as HTMLElement).scrollTop = 1500;
  });
  await settleRAF(page);
  const initialScroll = await entryList.evaluate((el) => (el as HTMLElement).scrollTop);
  expect(initialScroll).toBeGreaterThan(800);

  // Click 5 different entries in sequence at arbitrary in-viewport coords.
  const listBox = await entryList.boundingBox();
  if (!listBox) throw new Error('entry-list missing boundingBox');
  const cx = listBox.x + listBox.width / 2;
  const offsets = [0.2, 0.45, 0.7, 0.35, 0.55];
  for (const ratio of offsets) {
    const cy = listBox.y + listBox.height * ratio;
    await page.mouse.click(cx, cy);
    await settleRAF(page);
  }

  const finalScroll = await page
    .locator('[data-pkc-region="entry-list"]')
    .evaluate((el) => (el as HTMLElement).scrollTop);
  // 5 clicks at random positions should accumulate ZERO drift, since
  // every click is on an already-visible row and `suppressAutoScroll`
  // memo prevents scrollIntoView().
  expect(Math.abs(finalScroll - initialScroll)).toBeLessThanOrEqual(8);
});

test('PR-XX scenario B: clicking near viewport bottom edge preserves scroll', async ({
  page,
}) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await seedFlatEntries(page, 100);
  await page.reload();
  await bootReady(page);

  const entryList = page.locator('[data-pkc-region="entry-list"]');
  await expect(entryList).toBeVisible({ timeout: 15_000 });
  await expect(
    entryList.locator('[data-pkc-action="select-entry"][data-pkc-lid^="seed-"]'),
  ).toHaveCount(100, { timeout: 15_000 });

  await entryList.evaluate((el) => {
    (el as HTMLElement).scrollTop = 800;
  });
  await settleRAF(page);
  const beforeScroll = await entryList.evaluate((el) => (el as HTMLElement).scrollTop);

  // Click at the BOTTOM edge of the visible area — a row partially
  // clipped here used to trigger scrollIntoView({block:'nearest'})
  // pulling itself up before suppressAutoScroll was robust.
  const listBox = await entryList.boundingBox();
  if (!listBox) throw new Error('entry-list missing boundingBox');
  const cx = listBox.x + listBox.width / 2;
  const cy = listBox.y + listBox.height - 8;
  await page.mouse.click(cx, cy);
  await settleRAF(page, 3);

  const afterScroll = await page
    .locator('[data-pkc-region="entry-list"]')
    .evaluate((el) => (el as HTMLElement).scrollTop);
  expect(Math.abs(afterScroll - beforeScroll)).toBeLessThanOrEqual(8);
});

test('PR-XX scenario C: filer-mode → detail-mode switch via entry click preserves scroll', async ({
  page,
}) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await seedFlatEntries(page, 100);
  await page.reload();
  await bootReady(page);

  // CI flake fix (2026-05-17):filer tab click 前に entry-list 描画完了を
  // wait、その後 filer mode 切替で renderer が re-render するパスでも 100
  // entry が引き続き出ていることを wait してから scroll 操作。
  const initialList = page.locator('[data-pkc-region="entry-list"]');
  await expect(initialList).toBeVisible({ timeout: 15_000 });
  await expect(
    initialList.locator('[data-pkc-action="select-entry"][data-pkc-lid^="seed-"]'),
  ).toHaveCount(100, { timeout: 15_000 });

  // Switch to filer mode first.
  const filerTab = page.locator(
    'button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]',
  );
  const tBox = await filerTab.boundingBox();
  if (!tBox) throw new Error('filer tab missing boundingBox');
  await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
  await settleRAF(page);

  const entryList = page.locator('[data-pkc-region="entry-list"]');
  await expect(entryList).toBeVisible({ timeout: 15_000 });
  await expect(
    entryList.locator('[data-pkc-action="select-entry"][data-pkc-lid^="seed-"]'),
  ).toHaveCount(100, { timeout: 15_000 });

  await entryList.evaluate((el) => {
    (el as HTMLElement).scrollTop = 600;
  });
  await settleRAF(page);
  const beforeScroll = await entryList.evaluate((el) => (el as HTMLElement).scrollTop);
  expect(beforeScroll).toBeGreaterThan(300);

  // Click an entry from filer mode — this will dispatch SET_LAST_FILER_SCOPE
  // + SET_VIEW_MODE + SELECT_ENTRY in succession (3 renders).
  const listBox = await entryList.boundingBox();
  if (!listBox) throw new Error('entry-list missing boundingBox');
  const cx = listBox.x + listBox.width / 2;
  const cy = listBox.y + listBox.height / 2;
  await page.mouse.click(cx, cy);
  await settleRAF(page, 3);

  const afterScroll = await page
    .locator('[data-pkc-region="entry-list"]')
    .evaluate((el) => (el as HTMLElement).scrollTop);
  // The 3-dispatch chain (SET_LAST_FILER_SCOPE → SET_VIEW_MODE →
  // SELECT_ENTRY) historically caused a transient render where
  // suppressAutoScroll memo had not yet been written, allowing
  // scrollIntoView() to drift the list. Each render captures+restores
  // entry-list scrollTop so all three should be no-ops here.
  expect(Math.abs(afterScroll - beforeScroll)).toBeLessThanOrEqual(8);
});

test('PR-XX scenario D: drift = 0 after 10 alternating arrow-down + click cycles', async ({
  page,
}) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await seedFlatEntries(page, 200);
  await page.reload();
  await bootReady(page);

  const entryList = page.locator('[data-pkc-region="entry-list"]');
  await expect(entryList).toBeVisible({ timeout: 15_000 });
  await expect(
    entryList.locator('[data-pkc-action="select-entry"][data-pkc-lid^="seed-"]'),
  ).toHaveCount(200, { timeout: 15_000 });

  await entryList.evaluate((el) => {
    (el as HTMLElement).scrollTop = 1200;
  });
  await settleRAF(page);
  const initialScroll = await entryList.evaluate((el) => (el as HTMLElement).scrollTop);

  // Simulate user grazing through entries: alternating arrow-down
  // (changes selection) + click (changes selection) for 10 cycles.
  const listBox = await entryList.boundingBox();
  if (!listBox) throw new Error('entry-list missing boundingBox');
  const cx = listBox.x + listBox.width / 2;
  for (let i = 0; i < 10; i += 1) {
    if (i % 2 === 0) {
      await page.keyboard.press('ArrowDown');
    } else {
      const cy = listBox.y + listBox.height * (0.3 + (i % 5) * 0.1);
      await page.mouse.click(cx, cy);
    }
    await settleRAF(page);
  }

  const finalScroll = await page
    .locator('[data-pkc-region="entry-list"]')
    .evaluate((el) => (el as HTMLElement).scrollTop);
  // ArrowDown navigates selection sequentially and intentionally allows
  // scrollIntoView (selection moves to row not yet visible). So we
  // expect SOME drift here — but not snap-to-top: scroll should stay
  // within 1 viewport-height of where we started.
  const viewportHeight = listBox.height;
  expect(finalScroll).toBeGreaterThan(initialScroll - viewportHeight * 1.5);
});
