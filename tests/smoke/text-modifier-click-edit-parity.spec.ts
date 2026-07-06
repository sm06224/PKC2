/**
 * TEXT エントリの modifier+click 編集開始 — visual parity(real OS event)。
 *
 * 2026-07-03 user request:「text エントリも textlog と同じく ctrl と
 * クリックもしくは alt とクリックで編集モードに入りたい。可能なら突いた
 * 要素の直下から編集開始したい」
 *
 * 検証(doctrine: real keyboard modifier + real mouse click):
 *   M1. Ctrl+click on deep heading → editing phase + caret がその source
 *       line + クリック行が editor viewport 内に scroll 済み
 *   M2. plain click は編集に入らない(既存挙動の regression 弁)
 */

/* eslint-disable no-irregular-whitespace -- generic fixture */
import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

const BODY = (() => {
  const lines: string[] = [];
  for (let i = 0; i < 40; i++) {
    lines.push(`# Chapter ${i.toString().padStart(2, '0')}`);
    lines.push(`Paragraph of chapter ${i}.`);
    lines.push('');
  }
  return lines.join('\n');
})();

async function bootWithEntry(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, BODY);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
}

test('M1. Ctrl+click on deep heading → editing, caret at clicked line, line in view', async ({ page }) => {
  await bootWithEntry(page);

  // Chapter 25 の見出し(source line 75)を center 内で可視化して実クリック。
  const targetLine = 25 * 3;
  const center = await page.evaluate((line: number) => {
    const el = document.querySelector<HTMLElement>(
      `[data-pkc-region="center"] [data-pkc-source-line="${line}"]`,
    );
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(r.width, 200) / 2, y: r.top + r.height / 2 };
  }, targetLine);
  expect(center, 'anchored heading must exist in view render').not.toBeNull();

  await page.keyboard.down('Control');
  await page.mouse.click(center!.x, center!.y);
  await page.keyboard.up('Control');

  await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'editing');

  const state = await page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
    const pos = ta.selectionStart ?? 0;
    let line = 0;
    for (let i = 0; i < pos; i++) if (ta.value.charCodeAt(i) === 10) line++;
    // 編集モードの textarea は auto-grow し、scroll は親ペイン
    // (.pkc-center-content 等の scrollable ancestor)が担う。実際に
    // scroll した container を特定して量を読む。
    let sc: HTMLElement | null = ta.parentElement;
    while (
      sc
      && !(sc.scrollHeight > sc.clientHeight + 1
        && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))
    ) {
      sc = sc.parentElement;
    }
    return {
      caretLine: line,
      focused: document.activeElement === ta,
      paneScroll: sc ? sc.scrollTop : ta.scrollTop,
      taInternalScroll: ta.scrollTop,
    };
  });
  expect(state.caretLine, 'caret must land on the clicked source line').toBe(targetLine);
  expect(state.focused, 'textarea must be focused').toBe(true);
  // クリック行(深い行)が見える位置まで、実際の scroll container が
  // 下がっている。厳密整列は line-metrics unit / W3 で担保済。
  expect(
    Math.max(state.paneScroll, state.taInternalScroll),
    'the editing scroller must have moved toward the clicked line',
  ).toBeGreaterThan(0);
});

test('M2. plain click stays in ready (no hijack)', async ({ page }) => {
  await bootWithEntry(page);
  const center = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(
      '[data-pkc-region="center"] [data-pkc-source-line="0"]',
    );
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(r.width, 200) / 2, y: r.top + r.height / 2 };
  });
  expect(center).not.toBeNull();
  await page.mouse.click(center!.x, center!.y);
  await page.waitForTimeout(150);
  await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'ready');
});
