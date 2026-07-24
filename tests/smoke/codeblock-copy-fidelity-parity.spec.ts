/**
 * コピー ⧉ の忠実度 parity(2026-07-24 回帰修正)。
 *
 * #996 でレンダリング可能 fence の DOM が `.pkc-render-slot` + 隠し
 * `pre.pkc-render-source` の 2 面構成になった結果、csv ブロックのコピーが
 * 描画 table ではなく隠しソースを拾い、**スプレッドシート貼付が表 → 生 CSV
 * テキストへ静かに劣化**していた。unit(md-block-copy-source.test.ts)は
 * 選択子だけを見るので、ここでは実ブラウザで ⧉ を実マウスクリックし、
 * **clipboard に実際に載った中身**(consumer 観測点)まで検証する。
 */
import { test, expect } from '@playwright/test';

const FIXTURE = [
  '# copy fidelity',
  '',
  '```csv',
  'name,qty',
  'apple,3',
  '```',
].join('\n');

test('csv ブロックの ⧉ は TSV + rich <table> を clipboard に載せる', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('[data-pkc-field="title"]').first().fill('copy fidelity fixture');
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, FIXTURE);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  const block = page.locator('[data-pkc-render-lang="csv"]').first();
  await expect(block).toBeVisible({ timeout: 10_000 });

  // ⧉ は hover で opacity 0→1。実マウスで hover → 到達可能性を確認 → 実クリック。
  const blockBox = await block.boundingBox();
  if (!blockBox) throw new Error('csv block has no bounding box');
  await page.mouse.move(blockBox.x + blockBox.width / 2, blockBox.y + blockBox.height / 2);
  const btn = block.locator('button[data-pkc-action="copy-md-block"]');
  await expect(btn).toBeVisible();
  const btnBox = await btn.boundingBox();
  if (!btnBox) throw new Error('copy button has no bounding box');
  const cx = btnBox.x + btnBox.width / 2;
  const cy = btnBox.y + btnBox.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document.elementFromPoint(x, y)?.closest('[data-pkc-action="copy-md-block"]') !== null,
    { x: cx, y: cy },
  );
  expect(hit, 'copy button reachable at its center point').toBe(true);
  await page.mouse.click(cx, cy);

  // clipboard の両 MIME を読む(consumer 観測点)。
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          try {
            return await navigator.clipboard.readText();
          } catch {
            return '';
          }
        }),
      { timeout: 8000 },
    )
    .toContain('apple');

  const plain = await page.evaluate(() => navigator.clipboard.readText());
  // 表として貼れること = タブ区切り。生 CSV(カンマ)に劣化していないこと。
  expect(plain).toContain('name\tqty');
  expect(plain).toContain('apple\t3');
  expect(plain).not.toContain('apple,3');

  const clipHtml = await page.evaluate(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes('text/html')) {
          return await (await item.getType('text/html')).text();
        }
      }
    } catch {
      /* fallback 経路では text/html が無い */
    }
    return null;
  });
  if (clipHtml !== null) {
    // Word / ONLYOFFICE 側が表として受け取れること。
    expect(clipHtml).toContain('<table');
    expect(clipHtml).not.toContain('pkc-render-source');
  }

  await page.screenshot({ path: 'test-results/codeblock-copy-fidelity.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
