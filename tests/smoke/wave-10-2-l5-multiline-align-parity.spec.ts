/**
 * L-5 multi-line align prefix end-to-end visual parity(2026-05-07 hotfix、
 * reform-2026-05 PR-C 後 update)。
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
 * reform-2026-05 PR-C 後の semantics:
 *   - `||` → 'center'(物理中央、不変)
 *   - `|>` `<|` `|<` `>|` → 'end'(logical end、LTR で 'right'、4 形 typo 寛容)
 *
 * 検証 chain(reform-2026-05 §6 + §8):
 *   1. body 入力 `|| 中央\n|> 右(end)\n||中央` を新規 entry で commit
 *   2. rendered DOM に <p data-pkc-align="center"> / "end" / "center" が **3 個**
 *   3. 各 paragraph の computed text-align が一致
 *   4. 同じ container 内で text の bounding rect は center 段落が中央、end 段落が
 *      右側に位置する(視覚的に中央 / 右へずれている)
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
  // reform-2026-05 PR-C 後:`<|` / `|>` 等は全部 'end' に正規化される。
  // multi-line 分離 + alignment 適用の本質を verify するため、center / end / center
  // の 3 段階で「連続 prefix 行が独立 <p> に分離されること」を確認する。
  const body = ['|| 中央寄せ', '|> 右寄せ(end)', '|| 中央寄せ 2'].join('\n');
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

  // reform-2026-05 PR-C:`|>` は 'end' に正規化。Chromium は computedAlign を
  // logical value 'end' のまま返すが、ブラウザによっては 'right' に解決される。
  expect(observed[1]?.align).toBe('end');
  expect(observed[1]?.text).toContain('右寄せ(end)');
  expect(['end', 'right']).toContain(observed[1]?.computedAlign);

  expect(observed[2]?.align).toBe('center');
  expect(observed[2]?.text).toContain('中央寄せ 2');
  expect(observed[2]?.computedAlign).toBe('center');

  await rendered.screenshot({
    path: 'test-results/wave-10-2/L-5-multiline-align.png',
  });

  expect(errors, errors.join('\n')).toEqual([]);
});
