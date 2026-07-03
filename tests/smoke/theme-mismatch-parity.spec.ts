/**
 * Theme-mismatch visual parity(2026-07-03 user 報告)。
 *
 * 「システムのライト/ダークテーマと反対のテーマを選択すると右ペインの
 * TOC や mermaid が視認不能」— 原因は @media (prefers-color-scheme)
 * scope のハードコード色に data-pkc-theme ガードが無かったこと(TOC /
 * search mark)と、mermaid が OS scheme しか見ないこと(unit test 側で
 * 検証)。本 spec は実 Chromium の `page.emulateMedia({colorScheme})` で
 * OS scheme を偽装し、アプリ明示テーマとの全 4 組合せで **TOC 文字色の
 * 実測コントラスト比 ≥ 4.5(WCAG AA)** を検証する。
 */

/* eslint-disable no-irregular-whitespace -- generic fixture */
import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

const BODY = ['# Alpha', 'a', '## Beta', 'b', '## Gamma', 'c', '# Delta', 'd'].join('\n\n');

async function bootWithTocEntry(page: Page): Promise<void> {
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
  await expect(page.locator('.pkc-toc-link').first()).toBeVisible();
}

/** TOC link の実測 fg と実効 bg(祖先を遡って最初の不透明背景)の
 *  WCAG コントラスト比を page 内で計算する。 */
async function tocContrast(page: Page): Promise<{ ratio: number; fg: string; bg: string }> {
  return page.evaluate(() => {
    function parseRgb(s: string): [number, number, number] | null {
      const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
      if (a === 0) return null; // transparent
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    }
    function lum([r, g, b]: [number, number, number]): number {
      const f = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }
    const link = document.querySelector<HTMLElement>('.pkc-toc-link');
    if (!link) throw new Error('TOC link missing');
    const fgStr = getComputedStyle(link).color;
    const fg = parseRgb(fgStr);
    if (!fg) throw new Error(`unparseable fg: ${fgStr}`);
    let el: HTMLElement | null = link;
    let bg: [number, number, number] | null = null;
    let bgStr = '';
    while (el) {
      const s = getComputedStyle(el).backgroundColor;
      const parsed = parseRgb(s);
      if (parsed) { bg = parsed; bgStr = s; break; }
      el = el.parentElement;
    }
    if (!bg) { bg = [13, 15, 10]; bgStr = '(fallback dark)'; }
    const l1 = Math.max(lum(fg), lum(bg));
    const l2 = Math.min(lum(fg), lum(bg));
    return { ratio: (l1 + 0.05) / (l2 + 0.05), fg: fgStr, bg: bgStr };
  });
}

async function setAppTheme(page: Page, theme: 'dark' | 'light' | null): Promise<void> {
  await page.evaluate((t) => {
    const root = document.getElementById('pkc-root')!;
    if (t) root.setAttribute('data-pkc-theme', t);
    else root.removeAttribute('data-pkc-theme');
  }, theme);
  await page.waitForTimeout(80);
}

for (const os of ['light', 'dark'] as const) {
  for (const app of ['dark', 'light', null] as const) {
    const label = `OS=${os} / app=${app ?? 'auto'}`;
    const isMismatch = app !== null && app !== os;
    test(`TOC 可読性: ${label}${isMismatch ? '(mismatch — 報告症状)' : ''}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: os });
      await bootWithTocEntry(page);
      await setAppTheme(page, app);
      const c = await tocContrast(page);
      // eslint-disable-next-line no-console
      console.log(`${label}: fg=${c.fg} bg=${c.bg} ratio=${c.ratio.toFixed(2)}`);
      expect(
        c.ratio,
        `${label}: TOC link contrast must meet WCAG AA (fg=${c.fg}, bg=${c.bg})`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
}
