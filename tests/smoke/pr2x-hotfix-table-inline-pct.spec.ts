/**
 * PR-2X hotfix(2026-05-12):table cell の inline `%%%` で表が崩れない
 * visual parity test。実 chromium で entry を作成 → 表が全行 render される
 * + screenshot で証拠保存。
 */
import { test, expect, type Page } from '@playwright/test';

async function bootApp(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
}

async function createTextEntry(page: Page, title: string, body: string) {
  const shell = page.locator('#pkc-root');
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill(title);
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });
}

test.describe('PR-2X hotfix:inline `%%%` in table cell — visual evidence', () => {
  test('user fixture 19 row table 全行 render + 行 7 (`%%%`) 後の行が残る', async ({ page }) => {
    await bootApp(page);
    const fullTable = `# 表 inline pct test

| # | PR | scope |
|---|----|-------|
| 1 | PR-2R | doc 先行 |
| 2 | PR-2S | theme |
| 3 | PR-2T | WCAG |
| 4 | PR-2U | bold-in-if |
| 5 | PR-2V | \`:::toc{depth=N}\` |
| 6 | PR-2W | \`:::frontmatter\` / \`:::body\` |
| 7 | PR-2X | \`%%%\` block comment LineMap thread |
| 8 | PR-2Y | AST parse |
| 9 | PR-2Z | AST render |
| 10 | PR-2AA | migration |
| 11 | PR-2BB | canonicalize |

paragraph after table`;
    await createTextEntry(page, 'inline-pct-table', fullTable);

    const view = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(view).toBeVisible({ timeout: 10_000 });

    // tr count visible(content-visibility や lazy load の影響を考慮し DOM クエリで取得)
    const trCount = await view.evaluate((el) => el.querySelectorAll('table tr').length);
    expect(trCount).toBeGreaterThanOrEqual(12); // header + 11 data rows

    // PR-2Y / PR-2Z / PR-2AA / PR-2BB(行 7 以降)が DOM に存在
    const text = await view.evaluate((el) => el.textContent ?? '');
    expect(text).toContain('PR-2X');
    expect(text).toContain('PR-2Y');
    expect(text).toContain('PR-2Z');
    expect(text).toContain('PR-2AA');
    expect(text).toContain('PR-2BB');
    expect(text).toContain('paragraph after table');

    // screenshot evidence
    await view.screenshot({ path: 'test-results/pr2x-hotfix-inline-pct-table.png' });
  });
});
