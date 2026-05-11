/**
 * dist/pkc2.html(branch 最新版)で ^^**ホゲ**^^ の leftover * 残らないか確認。
 */
import { test, expect } from '@playwright/test';

test('dist/pkc2.html branch 最新版で leftover * 残らない', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('dist verify');
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = '^^**ホゲ**^^';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
  await expect(rendered).toBeVisible({ timeout: 5_000 });

  const html = await rendered.innerHTML();
  const text = (await rendered.textContent()) ?? '';
  console.log('rendered innerHTML:', html);
  console.log('text content:', JSON.stringify(text));
  console.log('Has literal *?', text.includes('*'));

  expect(text).not.toContain('*');
  expect(html).toContain('<em class="pkc-em-dot"><strong>ホゲ</strong></em>');

  await rendered.screenshot({ path: 'test-results/dist-verify/dist-hoge.png' });
});
