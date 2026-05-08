/**
 * 2026-05-08 user 報告 hotfix の visual parity smoke。
 *
 * 1. `_` 空行マーカーが連続 prefix 行(`|>`/`||`)に挟まれたとき、`<p>` wrapper
 *    が崩れて PUA sentinel char(U+E130 / U+E131)が剥がれず glyph 化する
 *    bug の regression guard。
 * 2. CSV fence 内の cell に書いた inline 書式(`==hl==` / `:text:bold,red:`)が
 *    plain-text として escape されていた bug の regression guard。
 *
 * user input(原文に近い再現):
 *   |> From:...
 *   _
 *   || ...
 *
 *   ```csv
 *   日付, 時刻, 内容
 *   2026/05/08, 09:54:44, ":非常時の措置適用開始:bold,yellow,bg-black:"
 *   ```
 *
 * 期待:
 *   - rendered DOM に PUA char が無い
 *   - blank-line div は正しい count で出現
 *   - CSV cell に `<span class="pkc-inline-mark"` が含まれる(L-6 が有効)
 */
import { test, expect } from '@playwright/test';

test('2026-05-08 hotfix:`_` glyph 漏れ防止 + CSV cell inline markup', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });

  await page.locator('[data-pkc-field="title"]').first().fill('hotfix 2026-05-08 fixture');
  const body = [
    '|> 2026年5月8日 発信',
    '<| To: dest',
    '|> From: src',
    '_',
    '|| 件名',
    '_',
    '|| 記',
    '',
    '### 経緯',
    '```csv',
    '日付, 時刻, 内容',
    '2026/05/08, 09:54:44, ":非常時の措置適用開始:bold,yellow,bg-black:"',
    '2026/05/08, 09:54:50, "==重要== な事項"',
    '```',
  ].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
  await expect(rendered).toBeVisible({ timeout: 10_000 });

  const observed = await rendered.evaluate((root) => {
    const innerHtml = root.innerHTML;
    return {
      hasPuaOpen: innerHtml.includes('\u{E130}'),
      hasPuaSep: innerHtml.includes('\u{E131}'),
      blankCount: root.querySelectorAll('.pkc-blank-line').length,
      csvInlineMarkCount: root.querySelectorAll('table.pkc-md-rendered-csv span.pkc-inline-mark').length,
      csvHighlightCount: root.querySelectorAll('table.pkc-md-rendered-csv mark').length,
    };
  });

  console.log('hotfix 2026-05-08 observed:', JSON.stringify(observed, null, 2));

  expect(observed.hasPuaOpen).toBe(false);
  expect(observed.hasPuaSep).toBe(false);
  expect(observed.blankCount).toBe(2);
  expect(observed.csvInlineMarkCount).toBeGreaterThanOrEqual(1);
  expect(observed.csvHighlightCount).toBeGreaterThanOrEqual(1);

  await rendered.screenshot({
    path: 'test-results/wave-10-2/hotfix-2026-05-08.png',
  });
});
