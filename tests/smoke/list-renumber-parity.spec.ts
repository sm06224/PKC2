/**
 * 領域 8 Layer 1 / Layer 2 ── 順序リスト auto-renumber の実キーストローク parity。
 *
 * 単体テスト(`tests/features/markdown/list-renumber.test.ts` /
 * `tests/adapter/editor-key-helpers-pr198.test.ts`)は採番ロジックと
 * `handleEditorEnter` の生成を純粋に検証する。本 spec は CLAUDE.md Phase 8
 * 「state mutation → consumer behavior change の end-to-end」を満たすため、
 * 実ブラウザの body textarea に **実 OS の Enter キー**を送り、action-binder
 * の keydown 配線を経由して採番が起きることを観測する。
 *
 * 観測点は textarea の `value`(= consumer の挙動)。配線が壊れていれば
 * 採番は起きず value は重複番号のまま残る。
 */
import { test, expect, type Page } from '@playwright/test';

async function bootAndCreateText(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  const createText = page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first();
  await expect(createText).toBeVisible();
  await createText.click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
}

/** body textarea に value と caret offset を入れ、focus する。 */
async function seedBody(page: Page, value: string, caret: number): Promise<void> {
  const body = page.locator('textarea[data-pkc-field="body"]').first();
  await expect(body).toBeVisible();
  await body.click();
  await page.evaluate(
    ({ v, c }) => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) throw new Error('body textarea missing');
      ta.value = v;
      ta.selectionStart = ta.selectionEnd = c;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
    },
    { v: value, c: caret },
  );
}

async function readBody(page: Page): Promise<string> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('body textarea missing');
    return ta.value;
  });
}

test.describe('list-renumber — real keystroke parity (領域 8 Layer 1/2)', () => {
  test('mid-list Enter renumbers the items below (連番モード)', async ({ page }) => {
    await bootAndCreateText(page);
    // caret at the end of "1. alpha"(offset 8)── insert in the middle.
    await seedBody(page, '1. alpha\n2. beta\n3. gamma', 8);
    await page.keyboard.press('Enter');
    await page.keyboard.type('inserted');
    // The new item is 2.; beta / gamma slide down to 3. / 4. — no duplicate.
    expect(await readBody(page)).toBe(
      '1. alpha\n2. inserted\n3. beta\n4. gamma',
    );
    await page.screenshot({ path: 'test-results/list-renumber-parity.png' });
  });

  test('frontmatter list-number: uniform unifies every marker to 1.', async ({
    page,
  }) => {
    const fm = '---\nlist-number: uniform\n---\n';
    // caret at the end of "1. a"(after the frontmatter block).
    await seedBody(page, `${fm}1. a\n2. b`, fm.length + 4);
    await page.keyboard.press('Enter');
    await page.keyboard.type('x');
    expect(await readBody(page)).toBe(`${fm}1. a\n1. x\n1. b`);
  });
});
