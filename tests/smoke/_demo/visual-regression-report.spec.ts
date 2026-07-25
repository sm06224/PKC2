/**
 * Visual regression レポート デモ(Full HD、user 提示用)。
 *
 * 比較基準 / 比較対象 / 比較結果(canvas absdiff)/ 説明 / 判定 の表を
 * base64 埋め込みの自己完結 HTML で出す(_lib/visual-report.ts)。
 * PASS(再現性)と FAIL(意図した差分)の両方を 1 レポートに載せ、
 * 「差分箇所が赤で可視化される」ことを見せる。
 *
 * 実行: eval "$(node scripts/resolve-pw-chromium.cjs --export)"
 *       npx playwright test --config=tests/smoke/playwright.demo.config.ts visual-regression-report
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from '../_helpers/boot-ready';
import { diffImagesInBrowser, writeVisualReport, type VisualRow } from './_lib/visual-report';

const FULL_HD = { width: 1920, height: 1080 };

/** flags の {} JSON ダイアログを開いて、任意の JSON を打った状態にする。 */
async function openFlagsJson(page: Page, text: string): Promise<void> {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.locator('button[data-pkc-action="toggle-shell-menu"]').first().click();
  await page.locator('[data-pkc-action="open-flags-inspector"]').first().click();
  await page.locator('[data-pkc-action="open-flags-json-editor"]').first().click();
  const ta = page.locator('[data-pkc-region="flags-json-editor"] .pkc-code-edit-input');
  await ta.click();
  await page.keyboard.press('Control+a');
  if (text) await page.keyboard.type(text, { delay: 4 });
  await page.waitForTimeout(200);
}

async function shot(page: Page, selector: string): Promise<string> {
  return (await page.locator(selector).first().screenshot()).toString('base64');
}

test('demo: visual regression レポート（Full HD, base64 HTML 表）', async ({ page }) => {
  await page.setViewportSize(FULL_HD);
  const dialogSel = '[data-pkc-region="flags-json-editor"] .pkc-flags-json-card';
  const rows: VisualRow[] = [];

  // ── Row 1: 再現性(同じ入力 → 同じ描画)= PASS 期待 ──
  const validJson = '{\n  "recent.default_limit": 3\n}';
  await openFlagsJson(page, validJson);
  const baseValid = await shot(page, dialogSel);
  await openFlagsJson(page, validJson);
  const candValid = await shot(page, dialogSel);
  rows.push({
    label: 'flags JSON\n再現性',
    description: '同じ JSON を 2 回入力して描画が一致するか(回帰の基準線)。差分ゼロなら PASS。',
    baselineB64: baseValid,
    candidateB64: candValid,
    diff: await diffImagesInBrowser(page, baseValid, candValid),
    tolerance: 0.001, // 0.1%
  });

  // ── Row 2: エラー表示の可視化(正常 → 不正 JSON)= FAIL 期待 ──
  // baseline=エラーなし / candidate=不正 JSON でエラー行が出る。diff が
  // 「エラーバーの赤帯 + 適用ボタンの無効化」の変化ピクセルを検出する。
  // これはまさに今回の視覚デモで見つけた「不可視エラー bug」の逆検証。
  await openFlagsJson(page, validJson);
  const baseNoErr = await shot(page, dialogSel);
  await openFlagsJson(page, validJson + ' broken');
  const candErr = await shot(page, dialogSel);
  rows.push({
    label: 'flags JSON\nエラー表示',
    description: '不正 JSON にするとエラー行(行番号つき)が現れ、適用ボタンが無効化される。diff がその変化領域を赤で示す。',
    baselineB64: baseNoErr,
    candidateB64: candErr,
    diff: await diffImagesInBrowser(page, baseNoErr, candErr),
    tolerance: 0.001,
  });

  const out = 'test-results/demo/visual-regression-report.html';
  const summary = writeVisualReport(rows, out, {
    title: 'PKC2 Visual Regression — CodeEditLite（デモ）',
    viewport: `${FULL_HD.width}×${FULL_HD.height}`,
  });

  // レポート自体の健全性を assert(生成が壊れていないこと)。
  expect(rows[0]!.diff.mismatchRatio).toBeLessThanOrEqual(0.001); // 再現性=一致
  expect(rows[1]!.diff.mismatchRatio).toBeGreaterThan(0.001); // エラー表示=差分あり
  expect(summary.pass).toBe(1);
  expect(summary.fail).toBe(1);
});
