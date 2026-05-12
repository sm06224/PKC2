/**
 * user バグレポ精密確認 (2026-05-10):`^^**ホゲ**^^` で末尾 `*` が残るか
 *
 * 私の renderMarkdown 直接呼び出しでは leftover なし。実機 visual で念のため確認。
 */
import { test, expect, type Page } from '@playwright/test';

const FIXTURE = `# em-dot + bold 精密確認

^^**ホゲ**^^

|| ^^**ホゲ**^^

ASCII case: ^^**hoge**^^

前後あり:before ^^**ホゲ**^^ after

連続:^^**A**^^ ^^**B**^^
`;

async function bootApp(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
  return shell;
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

test('^^**ホゲ**^^ で leftover `*` が残らない', async ({ page }) => {
  await bootApp(page);
  await createTextEntry(page, 'hoge emdot bold', FIXTURE);

  const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
  await expect(rendered).toBeVisible({ timeout: 10_000 });

  const observed = await rendered.evaluate((root) => {
    const text = root.textContent ?? '';
    const html = root.innerHTML;
    const emdots = Array.from(root.querySelectorAll('em.pkc-em-dot')).map((e) => ({
      innerHTML: e.innerHTML,
      text: e.textContent,
    }));
    // text 中の literal `*` が paragraph に残っているか
    const paragraphs = Array.from(root.querySelectorAll('p')).map((p) => ({
      text: p.textContent ?? '',
      hasLiteralAsterisk: (p.textContent ?? '').includes('*'),
      innerHTML: p.innerHTML,
    }));
    return { text, html, emdots, paragraphs };
  });

  console.log('========== HOGE em-dot bold observed ==========');
  console.log(JSON.stringify(observed, null, 2));
  console.log('================================================');

  await rendered.screenshot({
    path: 'test-results/phase2-hoge-emdot/hoge-emdot-center.png',
  });

  // 全 em-dot 内が <strong>X</strong>
  for (const e of observed.emdots) {
    expect(e.innerHTML).toMatch(/^<strong>[^<]+<\/strong>$/);
    expect(e.text).not.toContain('*');
  }
  // 全 paragraph に literal `*` 無し
  for (const p of observed.paragraphs) {
    expect(p.hasLiteralAsterisk, `paragraph text "${p.text}" has literal *`).toBe(false);
  }
});
