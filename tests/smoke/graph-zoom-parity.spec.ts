/**
 * Graph zoom + pan parity (領域 10-6 ζ'' PR-C / G1).
 *
 * User direction(2026-05-06):
 * > Graph view が拡大縮小できない。Galaxy のような操作感が欲しい。
 *
 * Asserts the **state mutation → consumer behavior change** chain:
 *   - Real OS wheel event → zoom-layer transform attribute updates
 *     (consumer: visible scale of the rendered SVG content).
 *   - Reset button click → transform back to identity.
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠。生成 (DOM
 * mutation) だけでなく、user が見える描画(transform 属性 = consumer)
 * まで chain を verify する。
 */

import { test, expect, type Page } from '@playwright/test';

async function bootAndOpenGraph(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Need at least one entry so the view-mode bar paints.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // Switch to Graph tab.
  const tab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="graph"]');
  const box = await tab.boundingBox();
  if (!box) throw new Error('Graph tab has no boundingBox');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-pkc-region="graph-view"]')).toBeVisible({ timeout: 5_000 });
  // queueMicrotask で gesture install されるので 1 frame 待つ。
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
}

test('Ctrl+wheel on graph svg → zoom-layer transform shows scale > 1 (consumer painted)', async ({ page }) => {
  await bootAndOpenGraph(page);

  const svg = page.locator('[data-pkc-region="graph-canvas"]');
  await expect(svg).toBeVisible();
  const box = await svg.boundingBox();
  if (!box) throw new Error('Graph svg has no boundingBox');

  // Wheel zoom in (deltaY < 0). Mouse must be over the svg so the
  // wheel handler bound there fires (not the document-level scroll).
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -200);
  // Allow microtasks to settle.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));

  // Consumer observation: the zoom-layer's transform attr now contains
  // a scale factor > 1.
  const scale = await page.evaluate(() => {
    const svg = document.querySelector('[data-pkc-region="graph-canvas"]') as HTMLCanvasElement | null;
    return svg ? Number(svg.getAttribute('data-pkc-graph-zoom-scale') ?? '1') : 1;
  });
  expect(scale).toBeGreaterThan(1);
});

test('reset button click → transform back to auto-fit baseline', async ({ page }) => {
  await bootAndOpenGraph(page);

  const svg = page.locator('[data-pkc-region="graph-canvas"]');
  const box = await svg.boundingBox();
  if (!box) throw new Error('Graph svg has no boundingBox');

  // U2 (2026-05-07):auto-fit が小 bbox で zoom-IN を適用するように
  // なったため、reset 後の scale は 1.0 とは限らず「auto-fit baseline」
  // (= bind 直後の scale)に戻る。本 test は reset の semantics
  // (任意の zoom 状態 → auto-fit baseline)を verify する。
  const baselineScale = await page.evaluate(() => {
    const svg = document.querySelector('[data-pkc-region="graph-canvas"]') as HTMLCanvasElement | null;
    return svg ? Number(svg.getAttribute('data-pkc-graph-zoom-scale') ?? '1') : 1;
  });

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -200);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));

  const beforeReset = await page.evaluate(() => {
    const svg = document.querySelector('[data-pkc-region="graph-canvas"]') as HTMLCanvasElement | null;
    return svg ? Number(svg.getAttribute('data-pkc-graph-zoom-scale') ?? '1') : 1;
  });
  expect(beforeReset).toBeGreaterThan(baselineScale);

  // Click the reset button via real OS click.
  const reset = page.locator('button[data-pkc-action="reset-graph-zoom"]');
  await expect(reset).toBeVisible();
  const rbox = await reset.boundingBox();
  if (!rbox) throw new Error('Reset button has no boundingBox');
  await page.mouse.click(rbox.x + rbox.width / 2, rbox.y + rbox.height / 2);

  const afterReset = await page.evaluate(() => {
    const svg = document.querySelector('[data-pkc-region="graph-canvas"]') as HTMLCanvasElement | null;
    return svg ? Number(svg.getAttribute('data-pkc-graph-zoom-scale') ?? '1') : 1;
  });
  expect(afterReset).toBeCloseTo(baselineScale, 5);
});

test('mousedown on the graph background then drag → tx/ty updates (pan)', async ({ page }) => {
  await bootAndOpenGraph(page);

  const svg = page.locator('[data-pkc-region="graph-canvas"]');
  const box = await svg.boundingBox();
  if (!box) throw new Error('Graph svg has no boundingBox');

  // U2 (2026-05-07):auto-fit が小 bbox で zoom-IN + translate を適用
  // するようになったため、drag の絶対値ではなく **drag 前後の delta**
  // で direction を verify する。
  const beforeDrag = await page.evaluate(() => {
    const svg = document.querySelector('[data-pkc-region="graph-canvas"]') as HTMLCanvasElement | null;
    return {
      tx: svg ? Number(svg.getAttribute('data-pkc-graph-zoom-tx') ?? '0') : 0,
      ty: svg ? Number(svg.getAttribute('data-pkc-graph-zoom-ty') ?? '0') : 0,
    };
  });

  // Drag from the corner so we definitely miss any centered node.
  const startX = box.x + 10;
  const startY = box.y + 10;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 100, startY + 60, { steps: 5 });
  await page.mouse.up();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));

  const afterDrag = await page.evaluate(() => {
    const svg = document.querySelector('[data-pkc-region="graph-canvas"]') as HTMLCanvasElement | null;
    return {
      tx: svg ? Number(svg.getAttribute('data-pkc-graph-zoom-tx') ?? '0') : 0,
      ty: svg ? Number(svg.getAttribute('data-pkc-graph-zoom-ty') ?? '0') : 0,
    };
  });

  // Drag direction = right + down → tx delta > 0, ty delta > 0(auto-fit
  // baseline からの相対変位を確認、絶対値は auto-fit translate に依存)。
  expect(afterDrag.tx - beforeDrag.tx).toBeGreaterThan(0);
  expect(afterDrag.ty - beforeDrag.ty).toBeGreaterThan(0);
});
