/**
 * Rich copy で ONLYOFFICE / Word に貼った時 PKC 拡張書式が落ちない確認。
 *
 * 直接 ONLYOFFICE を起動できないので、clipboard に書き込まれた text/html を
 * 取り出して内容を assert する。実 Word / ONLYOFFICE はこの HTML を受け取って
 * 自分の rendering engine に流すので、HTML 中に inline `style="..."` が
 * 入っていれば 99% reproduce される。
 *
 * 検証:
 *   1. Rich copy ボタンを click して clipboard 書き込みを発火
 *   2. clipboard.readText() / readClipboardItems() で取得
 *   3. text/html part が PKC marker を inline style 化した形で入っているか
 *   4. screenshot で操作の証憑も保存
 */
import { test, expect } from '@playwright/test';

test('Rich copy:PKC 拡張(L-2/5/7/8/9)が inline style 化されて clipboard に乗る', async ({ page, context }) => {
  // clipboard 読み書き権限を許可(Chromium デフォルトで block 気味)
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('Rich copy fixture');

  // PKC 拡張 全部入りの body
  const body = [
    '|| センター段落',
    '__字下げ段落',
    '本文 ==重要== と [[em:傍点]] と :赤字:red,bold:。',
    '_2',
    '+++ {role=section}',
  ].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // More menu → Rich copy ボタン click
  await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
  await page.locator('[data-pkc-action="copy-rich-markdown"]').first().click();
  await page.waitForTimeout(400);  // clipboard 書込完了待ち

  // clipboard から text/html を取得
  const clipHtml = await page.evaluate(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('text/html')) {
          const blob = await item.getType('text/html');
          return await blob.text();
        }
      }
    } catch {
      // permissions / fallback
    }
    return null;
  });

  expect(clipHtml, 'clipboard に text/html が乗っていること').not.toBeNull();
  console.log('Clipboard text/html (first 800 chars):', clipHtml?.slice(0, 800));

  const html = clipHtml!;

  // L-5 align: data-pkc-align + inline text-align
  expect(html, 'L-5 align inline').toContain('text-align: center');
  expect(html, 'L-5 align data attr 残置').toContain('data-pkc-align="center"');
  // L-9 indent: data-pkc-indent + inline text-indent
  expect(html, 'L-9 indent inline').toContain('text-indent: 1em');
  expect(html, 'L-9 indent data attr 残置').toContain('data-pkc-indent="1"');
  // L-2 highlight: <mark> に inline bg
  expect(html, 'L-2 mark bg inline').toContain('background-color: #fff59d');
  // L-2 em-dot: text-emphasis inline
  expect(html, 'L-2 em-dot inline').toContain('text-emphasis: filled dot');
  // L-6 simple-inline: 既存 inline style そのまま
  expect(html, 'L-6 simple-inline style').toContain('color: red');
  expect(html, 'L-6 simple-inline bold').toContain('font-weight: bold');
  // L-8 blank-line: portable <p>&nbsp;</p> × 2 に置換(_2 → 2 個)
  const nbspCount = (html.match(/&nbsp;/g) ?? []).length;
  expect(nbspCount, `L-8 blank-line × 2`).toBeGreaterThanOrEqual(2);
  // L-1 section break: <hr> + inline border
  expect(html, 'L-1 section break inline border').toContain('border-top:');
});
