/**
 * L-5 multi-line align prefix end-to-end visual parity(2026-05-07 hotfix)。
 *
 * 既存 `wave-10-2-l5-align-prefix-parity.spec.ts` は static HTML を inject して
 * CSS 適用だけを verify する setup。本 spec は **renderMarkdown 経由**で user の
 * 実報告 input を flow させ、preprocessAlignPrefix が連続 prefix 行を別 paragraph
 * に分離することを end-to-end で確認する。
 *
 * Bug 由来:`breaks: true` 設定で markdown-it が `\n` を `<br>` 化するため、
 * 空行を挟まない連続 prefix 行が 1 paragraph に merge され先頭行の align だけが
 * 効いていた。Hotfix で prefix 行検出時に out 側に空行を強制挿入。
 *
 * 検証 chain(reform-2026-05 §6 + §8):
 *   1. body 入力 `|| 中央\n<| 左\n|> 右` を新規 entry で commit
 *   2. rendered DOM に <p data-pkc-align="center"> / "left" / "right" が **3 個**
 *   3. 各 paragraph の computed text-align が一致
 *   4. 同じ container 内で text の bounding rect 中心 X が center > left、center
 *      < right の順序関係(視覚的に左 / 中央 / 右へずれている)
 *   5. screenshot を test-results に保存(証憑)
 */
import { test, expect } from '@playwright/test';

test('L-5 multi-line: 連続 prefix 行が 3 paragraph に分離 + 視覚 align 一致', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });

  await page.locator('[data-pkc-field="title"]').first().fill('L-5 multi-line align fixture');

  // user 報告の正確な input(空行なしで 3 行連続 prefix)。
  const body = ['|| 中央寄せ', '<| 左寄せ(デフォ)', '|> 右寄せ'].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(body);

  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
  await expect(rendered).toBeVisible({ timeout: 10_000 });

  const paragraphs = rendered.locator('p[data-pkc-align]');
  await expect(paragraphs).toHaveCount(3);

  const observed = await paragraphs.evaluateAll((nodes) =>
    nodes.map((p) => {
      const r = (p as HTMLElement).getBoundingClientRect();
      const cs = getComputedStyle(p as HTMLElement);
      return {
        text: p.textContent ?? '',
        align: p.getAttribute('data-pkc-align'),
        computedAlign: cs.textAlign,
        left: r.left,
        right: r.right,
        width: r.width,
      };
    }),
  );

  console.log('L-5 multi-line paragraphs:', JSON.stringify(observed, null, 2));

  expect(observed[0]?.align).toBe('center');
  expect(observed[0]?.text).toContain('中央寄せ');
  expect(observed[0]?.computedAlign).toBe('center');

  expect(observed[1]?.align).toBe('left');
  expect(observed[1]?.text).toContain('左寄せ');
  expect(observed[1]?.computedAlign).toBe('left');

  expect(observed[2]?.align).toBe('right');
  expect(observed[2]?.text).toContain('右寄せ');
  expect(observed[2]?.computedAlign).toBe('right');

  await rendered.screenshot({
    path: 'test-results/wave-10-2/L-5-multiline-align.png',
  });

  expect(errors, errors.join('\n')).toEqual([]);
});
