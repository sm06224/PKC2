/**
 * 視覚監査 2026-07-25 B3 / B4 の visual parity。
 *
 * どちらも **CSS と描画** の話なので happy-dom では検証できない
 * (`white-space` / `text-overflow` の実効値も、行が実際に何 px になるかも
 *  実ブラウザでないと出ない)。
 *
 * - B3:長文セルが **1 行に収まる**(行高が爆発しない)。クリックすると
 *   そのセルだけ全文が見える
 * - B4:text 系添付の中身が **実際に画面に出ている**
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

/** 単語境界の無い長文(日本語)── これが 1 文字ずつ折り返して行高を爆発させていた。 */
const LONG_CELL = 'あ'.repeat(120);
/** "hello world\nsecond line" を UTF-8 base64 で。 */
const TEXT_B64 = 'aGVsbG8gd29ybGQKc2Vjb25kIGxpbmU=';

async function seed(page: Page): Promise<void> {
  await page.evaluate(async ({ longCell, textB64 }: { longCell: string; textB64: string }) => {
    const now = '2026-07-25T00:00:00.000Z';
    const sheet = JSON.stringify({
      rows: [
        ['見出し', '長文', '数値'],
        ['行1', longCell, '1'],
        ['行2', 'ふつう', '2'],
      ],
    });
    const cont = {
      meta: { container_id: 'cellclip', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries: [
        {
          lid: '__flags__', title: 'Flags', archetype: 'system-flags',
          body: JSON.stringify({ format: 'pkc2-system-flags', version: 1, values: { 'sidebar.mode': 'tree' } }),
          created_at: now, updated_at: now,
        },
        { lid: 'sheet', title: '長文シート', archetype: 'spreadsheet', body: sheet, created_at: now, updated_at: now },
        {
          lid: 'txt', title: 'notes.txt', archetype: 'attachment',
          body: JSON.stringify({ name: 'notes.txt', mime: 'text/plain', data: textB64, size: 24 }),
          created_at: now, updated_at: now,
        },
      ],
      relations: [], revisions: [], assets: {},
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, { longCell: LONG_CELL, textB64: TEXT_B64 });
}

async function boot(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(500);
  await seed(page);
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(500);
}

test('parity: B3 長文セルが 1 行に収まり、行高が爆発しない', async ({ page }) => {
  await boot(page);
  await page.locator('[data-pkc-region="entry-list"] li[data-pkc-lid="sheet"]').click();
  await page.waitForTimeout(600);

  const table = page.locator('[data-pkc-region="spreadsheet-table"]');
  await expect(table).toBeVisible();

  const metrics = await table.evaluate((el) => {
    const rows = [...el.querySelectorAll('tbody tr')] as HTMLElement[];
    const longRow = rows[0]!;              // 長文セルを含む行
    const normalRow = rows[1]!;            // ふつうの行
    const longCell = longRow.querySelectorAll('td')[1] as HTMLElement;
    const cs = getComputedStyle(longCell);
    return {
      longRowHeight: Math.round(longRow.getBoundingClientRect().height),
      normalRowHeight: Math.round(normalRow.getBoundingClientRect().height),
      whiteSpace: cs.whiteSpace,
      textOverflow: cs.textOverflow,
      overflow: cs.overflow,
      // 内容が実際に溢れている(= 省略されている)こと
      scrollWidth: longCell.scrollWidth,
      clientWidth: longCell.clientWidth,
      title: longCell.getAttribute('title') ?? '',
    };
  });

  // ellipsis が効く条件が揃っている
  expect(metrics.whiteSpace, 'pre-wrap のままだと 1 文字ずつ折り返す').toBe('nowrap');
  expect(metrics.textOverflow).toBe('ellipsis');
  expect(metrics.overflow).toBe('hidden');
  // 長文行がふつうの行と同じ高さに収まっている(修正前は数十倍だった)
  expect(
    metrics.longRowHeight,
    `長文行 ${metrics.longRowHeight}px がふつうの行 ${metrics.normalRowHeight}px より大幅に高い`,
  ).toBeLessThanOrEqual(metrics.normalRowHeight + 2);
  // 実際に省略されている
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  // 全文への導線(tooltip)
  expect(metrics.title.length, '省略された全文が tooltip から読めない').toBeGreaterThan(100);

  await page.screenshot({ path: 'test-results/spreadsheet-cell-clip-parity.png' });
});

test('parity: B3 編集中はクリックしたセルだけ全文が見える', async ({ page }) => {
  await boot(page);
  await page.locator('[data-pkc-region="entry-list"] li[data-pkc-lid="sheet"]').click();
  await page.waitForTimeout(500);
  await page.locator('[data-pkc-action="begin-edit"], [data-pkc-action="edit-entry"]').first().click();
  await page.waitForTimeout(700);

  const grid = page.locator('[data-pkc-region="spreadsheet-grid"]');
  await expect(grid).toBeVisible();
  // 行 1(0-indexed の見出し行の次)の長文セル
  const cell = grid.locator('td[data-row="1"][data-col="1"]').first();
  await expect(cell).toBeVisible();

  const before = await cell.evaluate((el) => getComputedStyle(el).whiteSpace);
  expect(before, '編集グリッドでも既定は 1 行').toBe('nowrap');

  // 実 OS click で focus
  const box = (await cell.boundingBox())!;
  await page.mouse.click(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
  await page.waitForTimeout(300);

  const after = await cell.evaluate((el) => ({
    whiteSpace: getComputedStyle(el).whiteSpace,
    focused: document.activeElement === el,
    height: Math.round(el.getBoundingClientRect().height),
  }));
  expect(after.focused, 'セルに focus が入っていない').toBe(true);
  expect(after.whiteSpace, 'クリックしても全文が見えない(省略のまま)').toBe('pre-wrap');
  expect(after.height, 'focus 中のセルが広がっていない').toBeGreaterThan(box.height);

  await page.screenshot({ path: 'test-results/spreadsheet-cell-focus-parity.png' });
});

test('parity: B4 text 添付の中身が実際に画面に出る', async ({ page }) => {
  await boot(page);
  await page.locator('[data-pkc-region="entry-list"] li[data-pkc-lid="txt"]').click();
  await page.waitForTimeout(800);

  const preview = page.locator('[data-pkc-region="attachment-text-preview"]');
  await expect(preview, 'text 添付にプレビューが出ていない').toBeVisible();
  await expect(preview).toContainText('hello world');
  await expect(preview).toContainText('second line');

  // 「プレビューできません」は出ない
  await expect(page.locator('[data-pkc-region="no-preview"]')).toHaveCount(0);
  // バッジも「テキスト」
  await expect(page.locator('[data-pkc-region="preview-mode"]').first()).toHaveText('テキスト');

  // 到達可能性:プレビューが他要素に覆われていない
  const box = (await preview.boundingBox())!;
  const reachable = await page.evaluate(([x, y]: number[]) => {
    const el = document.elementFromPoint(x!, y!);
    return !!el?.closest('[data-pkc-region="attachment-text-preview"]');
  }, [Math.round(box.x + box.width / 2), Math.round(box.y + 10)]);
  expect(reachable, 'プレビューが別要素に覆われている').toBe(true);

  await page.screenshot({ path: 'test-results/attachment-text-preview-parity.png' });
});
