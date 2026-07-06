/**
 * mermaid WCAG 同系色 shift — visual parity(実 Chromium・実 mermaid render)。
 *
 * 2026-07-04 user 要望:「mermaid レンダリングにも WCAG 改善レンダリングを
 * 導入できますか？元の指定表現色に近い色から、視認性の高い組み合わせにしたい」
 *
 * fixture は user が `style` 指示で**わざと低コントラスト**(dark fill ×
 * dark 文字、ratio ≈ 1.3)を指定した flowchart。resolver が色相・彩度を
 * 保ったまま fill / 文字色ペアを WCAG AA(4.5)以上へ shift することを、
 * 実 render 後の computed style で実測検証する。
 */

/* eslint-disable no-irregular-whitespace -- generic fixture */
import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

const BODY = [
  '# Mermaid WCAG',
  '',
  '```mermaid',
  'flowchart TD',
  '  A[Alpha] --> B[Beta]',
  '  style A fill:#222233,color:#334455',
  '```',
].join('\n');

async function bootWithMermaid(page: Page): Promise<void> {
  // editor.mermaid_render_enabled は既定 OFF — URL flag で有効化
  // (debug-via-url-flag-protocol の pkc-flag 経路)。
  await page.goto('/pkc2.html?pkc-flag=editor.mermaid_render_enabled=1', { waitUntil: 'load' });
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
  // 実 mermaid render(lazy import → SVG 置換)を待つ。
  await page.locator('.pkc-mermaid-rendered svg').first().waitFor({ timeout: 20_000 });
}

test('user 指定の低コントラスト node が同系色のまま WCAG AA 以上へ shift される', async ({ page }) => {
  await bootWithMermaid(page);

  const m = await page.evaluate(() => {
    function parseRgb(s: string): [number, number, number] | null {
      const mm = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return mm ? [Number(mm[1]), Number(mm[2]), Number(mm[3])] : null;
    }
    function lum([r, g, b]: [number, number, number]): number {
      const f = (c: number) => {
        const sc = c / 255;
        return sc <= 0.03928 ? sc / 12.92 : Math.pow((sc + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }
    function ratio(a: [number, number, number], b: [number, number, number]): number {
      const l1 = Math.max(lum(a), lum(b));
      const l2 = Math.min(lum(a), lum(b));
      return (l1 + 0.05) / (l2 + 0.05);
    }
    function hue([r, g, b]: [number, number, number]): number {
      const nr = r / 255, ng = g / 255, nb = b / 255;
      const max = Math.max(nr, ng, nb), min = Math.min(nr, ng, nb);
      if (max === min) return 0;
      const d = max - min;
      let h = 0;
      if (max === nr) h = ((ng - nb) / d) + (ng < nb ? 6 : 0);
      else if (max === ng) h = (nb - nr) / d + 2;
      else h = (nr - ng) / d + 4;
      return h * 60;
    }
    // style A を指定した node A の shape + label を実測。
    const shifted = document.querySelector('.pkc-mermaid-rendered g[data-pkc-wcag-shifted="true"]');
    if (!shifted) {
      const nodes = Array.from(document.querySelectorAll('.pkc-mermaid-rendered g.node'));
      const a = nodes.find((n) => (n.textContent ?? '').includes('Alpha'));
      return {
        found: false as const,
        debug: a ? a.outerHTML.slice(0, 1500) : '(node A missing)',
      };
    }
    const shape = shifted.querySelector('rect, polygon, circle, path');
    // resolver は「最内の text 担体」(<p> があれば <p>)に色を書く —
    // 実際に描画へ効くのもその要素の computed color。計測点を合わせる。
    const label = shifted.querySelector('foreignObject p')
      ?? shifted.querySelector('.nodeLabel, foreignObject span, text');
    if (!shape || !label) return { found: false as const };
    const bg = parseRgb(getComputedStyle(shape as Element).fill);
    const tag = (label as Element).tagName.toLowerCase();
    const cs = getComputedStyle(label as Element);
    const fg = parseRgb(tag === 'text' ? cs.fill : cs.color);
    if (!bg || !fg) return { found: false as const };
    return {
      found: true as const,
      ratio: ratio(fg, bg),
      fgHue: hue(fg),
      bgHue: hue(bg),
      fgRaw: tag === 'text' ? cs.fill : cs.color,
      bgRaw: getComputedStyle(shape as Element).fill,
      labelTag: tag,
      domAfter: (shifted as HTMLElement).outerHTML.slice(0, 900),
    };
  });

  if (!m.found) {
    // eslint-disable-next-line no-console
    console.log('DEBUG node A DOM:', (m as { debug?: string }).debug);
  }
  expect(m.found, 'shifted node (style A) must exist in the rendered SVG').toBe(true);
  if (!m.found) return;
  // eslint-disable-next-line no-console
  console.log(`mermaid WCAG: ratio=${m.ratio.toFixed(2)} fgHue=${m.fgHue.toFixed(0)} fg=${(m as { fgRaw?: string }).fgRaw} bg=${(m as { bgRaw?: string }).bgRaw}`);
  // 視認性:実測ペアが WCAG AA 以上(元は ≈1.3)。
  expect(m.ratio).toBeGreaterThanOrEqual(4.5);
  // 「元の指定表現色に近い」:文字色 #334455 の hue は 210°(青系)。
  // L 軸 shift のみなので hue は保たれる(丸めで数度の余裕)。bg 側は
  // 純粋な darken の極値(黒)に達すると無彩色になり hue が消えるため
  // fg 側で同系色性を assert する。
  expect(Math.abs(m.fgHue - 210)).toBeLessThanOrEqual(15);
});

test('指定なしの node(mermaid 既定 palette)は元の見た目のまま可読', async ({ page }) => {
  await bootWithMermaid(page);
  const m = await page.evaluate(() => {
    // node B(style 指定なし)は shift marker が付かないか、付いても
    // ratio が確保されている — ここでは「読める」ことだけを実測。
    const nodes = Array.from(
      document.querySelectorAll('.pkc-mermaid-rendered g.node'),
    );
    const b = nodes.find((n) => (n.textContent ?? '').includes('Beta'));
    if (!b) return null;
    const shape = b.querySelector('rect, polygon, circle, path');
    const label = b.querySelector('.nodeLabel, foreignObject span, foreignObject p, text');
    if (!shape || !label) return null;
    function parseRgb(s: string): [number, number, number] | null {
      const mm = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return mm ? [Number(mm[1]), Number(mm[2]), Number(mm[3])] : null;
    }
    function lum([r, g, bb]: [number, number, number]): number {
      const f = (c: number) => {
        const sc = c / 255;
        return sc <= 0.03928 ? sc / 12.92 : Math.pow((sc + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bb);
    }
    const bg = parseRgb(getComputedStyle(shape).fill);
    const tag = label.tagName.toLowerCase();
    const cs = getComputedStyle(label);
    const fg = parseRgb(tag === 'text' ? cs.fill : cs.color);
    if (!bg || !fg) return null;
    const l1 = Math.max(lum(fg), lum(bg));
    const l2 = Math.min(lum(fg), lum(bg));
    return { ratio: (l1 + 0.05) / (l2 + 0.05) };
  });
  expect(m, 'node B must be measurable').not.toBeNull();
  expect(m!.ratio).toBeGreaterThanOrEqual(4.5);
});
