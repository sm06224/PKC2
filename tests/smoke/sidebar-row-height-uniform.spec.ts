/**
 * L3-S3(2026-07-27):サイドバー行高の一様性 ── 実 browser の pixel で見る。
 *
 * 🔴 見つけたバグ: manual sort の**選択行**に出る `.pkc-entry-move-btn`(↑↓)は
 * **CSS 規則が 1 つも無く**、UA 既定の button ボックスがそのまま効いていた。
 * その結果、選択行だけ 24.91px → 26px に伸び、**選択するたびに行が 1px ずれる**
 * (下の行が押し下がる)。仮想化は「単位行高が一様」を前提に窓の index を
 * 計算するので前工事として必須だが、**単体でも見た目のバグ修正**である。
 *
 * happy-dom は高さを全部 0 で返すので、この性質は **実 browser でしか
 * 検出できない**(vitest では緑のまま通る型のバグ)。
 */
import { test, expect, type Page } from '@playwright/test';

async function createEntry(page: Page, title: string): Promise<void> {
  const newBtn = page.locator('[data-pkc-action="toggle-new-picker"]').first();
  if (await newBtn.count() > 0) {
    await newBtn.click();
    await page.locator('.pkc-new-picker-row[data-pkc-archetype="text"]').first().click();
  } else {
    await page.locator('.pkc-btn-create[data-pkc-archetype="text"]').first().click();
  }
  await page.waitForFunction(
    `document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'editing'`,
    null,
    { timeout: 20_000 },
  );
  await page.locator('[data-pkc-field="title"]').first().fill(title);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await page.waitForFunction(
    `document.querySelector('#pkc-root')?.getAttribute('data-pkc-phase') === 'ready'`,
    null,
    { timeout: 20_000 },
  );
}

/** 各行の実測高さ(px)。 */
async function rowHeights(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll('[data-pkc-region="entry-list"] li.pkc-entry-item'),
    ).map((el) => Math.round(el.getBoundingClientRect().height * 100) / 100),
  );
}

test('manual sort で行を選択しても行高が変わらない(↑↓ button が行を押し広げない)', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-pkc-region="sidebar"]', { timeout: 10_000 });

  for (const t of ['row A', 'row B', 'row C']) await createEntry(page, t);

  // manual sort にする(↑↓ button が出る条件)
  await page.locator('[data-pkc-field="sort-key"]').first().selectOption('manual');
  await page.waitForFunction(
    `document.querySelector('[data-pkc-region="sort-controls"]')?.getAttribute('data-pkc-sort-key') === 'manual'`,
    null,
    { timeout: 10_000 },
  );

  const before = await rowHeights(page);
  expect(before.length).toBeGreaterThanOrEqual(3);

  // 1 行選択 → その行にだけ ↑↓ button が付く
  await page.locator('[data-pkc-region="entry-list"] li.pkc-entry-item').first().click();
  await page.waitForFunction(
    `document.querySelectorAll('.pkc-entry-move-btn').length > 0`,
    null,
    { timeout: 10_000 },
  );
  const after = await rowHeights(page);

  // ① 選択行が他の行と同じ高さであること
  const spread = Math.max(...after) - Math.min(...after);
  expect(spread, `行高がばらついている: ${JSON.stringify(after)}`).toBeLessThan(0.5);

  // ② 選択の前後で行高が変わらないこと(選択のたびに 1px ずれない)
  expect(Math.abs(after[0]! - before[0]!), `選択で行高が変わった ${before[0]} → ${after[0]}`)
    .toBeLessThan(0.5);

  // ③ button 自体は見えている(高さを潰して消したのではない)
  const btnBox = await page.locator('.pkc-entry-move-btn').first().boundingBox();
  expect(btnBox!.width).toBeGreaterThan(4);
  expect(btnBox!.height).toBeGreaterThan(4);
});
