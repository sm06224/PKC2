/**
 * user バグレポ調査 (2026-05-10、続報):
 *   `|| ANA SKY コイン ^^*{{vars.sky_coins_after}}**^^`
 *
 * `^^*X**^^` の構造:
 *   ^^  em-dot 開始
 *   *   emphasis(italic)開始
 *   X   content
 *   **  ?? bold 閉じ(open がない)
 *   ^^  em-dot 閉じ
 *
 * `*X**` は markdown-it の emphasis 規則で `*` 開始 + `**` 閉じだが、`**` は
 * 「2 文字使う」ためのものなので、open `*` (1 文字) と close `**` (2 文字)が
 * mismatch → emphasis 不発、literal `*X**` が残る可能性。
 *
 * 本 test で実機 visual + DOM dump を取って原因確定。
 */
import { test, expect, type Page } from '@playwright/test';

const FIXTURE = `---
title: SKY コイン換算
vars:
  amex_points: "120,000"
  ana_miles_total: "120,000"
  sky_coins_after: "198,853"
---

# 換算ステップ

|| ==[blue]**最終結果**==
_
|| AMEX {{vars.amex_points}} pt
|| ↓(1:1 移行、5営業日以内)
|| ANA マイル累計 {{vars.ana_miles_total}}
|| ↓(SFC/Gold 1.6倍レート、上限120,000)
|| ANA SKY コイン ^^*{{vars.sky_coins_after}}**^^

# 比較対照(正しい記法)

|| ANA SKY コイン ^^**{{vars.sky_coins_after}}**^^

# 比較対照2(em-dot 無し)

|| ANA SKY コイン **{{vars.sky_coins_after}}**
`;

async function bootApp(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1200 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  return shell;
}

async function createTextEntry(page: Page, title: string, body: string) {
  const shell = page.locator('#pkc-root');
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('[data-pkc-field="title"]').first().fill(title);
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
}

test('ANA SKY コイン fixture:^^*X**^^ 描画調査', async ({ page }) => {
  await bootApp(page);
  await createTextEntry(page, 'sky coin asym bold', FIXTURE);

  const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
  await expect(rendered).toBeVisible({ timeout: 10_000 });

  // 全 paragraph の構造を dump
  const observed = await rendered.evaluate((root) => {
    const paragraphs = Array.from(root.querySelectorAll('p'));
    return paragraphs.map((p) => ({
      text: p.textContent ?? '',
      innerHTML: p.innerHTML.length > 200 ? p.innerHTML.substring(0, 200) + '...' : p.innerHTML,
      hasStrong: !!p.querySelector('strong'),
      hasEm: !!p.querySelector('em'),
      hasEmDot: !!p.querySelector('em.pkc-em-dot, .pkc-em-dot'),
      align: p.getAttribute('data-pkc-align') ?? '',
    }));
  });

  console.log('========== ANA SKY fixture observed ==========');
  console.log(JSON.stringify(observed, null, 2));
  console.log('==============================================');

  await rendered.screenshot({
    path: 'test-results/phase2-ana-sky-bold/ana-sky-center.png',
  });

  // 重要観察:`^^*X**^^` ← markdown asymmetric emphasis、failure 確認
  const asymLine = observed.find((p) => p.text.includes('198,853') && p.text.includes('ANA SKY'));
  expect(asymLine, 'ANA SKY コイン line').toBeDefined();
  // 正しい記法 `^^**X**^^` は bold + em-dot 両方
  const correctLines = observed.filter((p) => p.text.includes('198,853'));
  console.log('Lines with 198,853:', correctLines.length);
});
