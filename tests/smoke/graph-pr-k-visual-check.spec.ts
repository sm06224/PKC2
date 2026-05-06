/**
 * PR-K visual verification — graph view edge contrast / no ghosting /
 * node click → detail.
 *
 * No assertions; this is an eyes-on harness that captures screenshots
 * for user review.
 */

import { test, type Page } from '@playwright/test';

async function setup(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await shell.waitFor();

  // Seed 5 entries with relations so edges actually appear.
  await page.evaluate(async () => {
    const cont = {
      meta: {
        container_id: 'pr-k-fixture',
        schema_version: 1,
        title: 'PR-K visual',
        created_at: '2026-05-06T00:00:00Z',
        updated_at: '2026-05-06T00:00:00Z',
      },
      entries: [
        { lid: 'a', title: 'Alpha',   body: '', archetype: 'text',   created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
        { lid: 'b', title: 'Beta',    body: '', archetype: 'todo',   created_at: '2024-06-01T00:00:00Z', updated_at: '2024-06-01T00:00:00Z' },
        { lid: 'c', title: 'Gamma',   body: '', archetype: 'folder', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
        { lid: 'd', title: 'Delta',   body: '', archetype: 'textlog',created_at: '2025-09-01T00:00:00Z', updated_at: '2025-09-01T00:00:00Z' },
        { lid: 'e', title: 'Epsilon', body: '', archetype: 'text',   created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z' },
      ],
      relations: [
        { id: 'r1', kind: 'structural', from: 'c', to: 'a' },
        { id: 'r2', kind: 'structural', from: 'c', to: 'b' },
        { id: 'r3', kind: 'semantic',   from: 'a', to: 'd' },
        { id: 'r4', kind: 'semantic',   from: 'b', to: 'e' },
        { id: 'r5', kind: 'semantic',   from: 'd', to: 'e' },
      ],
      revisions: [],
      assets: {},
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
  await page.reload();
  await shell.waitFor();

  // Switch to graph.
  const tab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="graph"]');
  await tab.waitFor();
  const tbox = await tab.boundingBox();
  if (!tbox) throw new Error('No graph tab');
  await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
  await page.locator('[data-pkc-region="graph-canvas"]').waitFor();
  // Allow layout + initial draw.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
}

test('K-V1 — initial canvas paint (edges should be visible at 5+:1 contrast)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await setup(page);
  await page.screenshot({
    path: 'test-results/pr-k-visual/K-V1-initial.png',
    fullPage: false,
  });
});

test('K-V2 — after wheel zoom + pan, no ghost trails', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await setup(page);

  const canvas = page.locator('[data-pkc-region="graph-canvas"]');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('No canvas');
  // Zoom in twice.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -250);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
  await page.mouse.wheel(0, -250);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
  // Pan diagonally.
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 150, { steps: 10 });
  await page.mouse.up();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
  await page.screenshot({
    path: 'test-results/pr-k-visual/K-V2-after-zoom-pan.png',
    fullPage: false,
  });
});

test('K-V3 — node click → detail view (consumer = data-pkc-view-mode flips)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await setup(page);

  // Find the position of node "a" via the canvas's data-pkc-graph-nodes
  // JSON, click that screen coord.
  // PR-Δ1 (2026-05-07):aspect fix で canvas 描画は uniform scale +
  // letterbox 化されたため、旧 non-uniform sx/sy 計算は無効。logical
  // → client は scale = min(rw/960, rh/600) + center offset で計算。
  const nodeAClient = await page.evaluate(() => {
    const c = document.querySelector('[data-pkc-region="graph-canvas"]') as HTMLCanvasElement | null;
    if (!c) return null;
    const json = c.getAttribute('data-pkc-graph-nodes');
    if (!json) return null;
    const nodes = JSON.parse(json) as Array<{ lid: string; x: number; y: number }>;
    const a = nodes.find((n) => n.lid === 'a');
    if (!a) return null;
    const rect = c.getBoundingClientRect();
    const PAYLOAD_W = 960, PAYLOAD_H = 600;
    const scale = Math.min(rect.width / PAYLOAD_W, rect.height / PAYLOAD_H);
    const offsetX = (rect.width - PAYLOAD_W * scale) / 2;
    const offsetY = (rect.height - PAYLOAD_H * scale) / 2;
    return { x: rect.left + offsetX + a.x * scale, y: rect.top + offsetY + a.y * scale };
  });
  if (!nodeAClient) throw new Error('node a not found in canvas attrs');
  await page.mouse.click(nodeAClient.x, nodeAClient.y);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  await page.screenshot({
    path: 'test-results/pr-k-visual/K-V3-after-node-click.png',
    fullPage: false,
  });
  // Capture the active view-mode tab.
  const activeMode = await page.locator('button[data-pkc-action="set-view-mode"][data-pkc-active="true"]').first().getAttribute('data-pkc-view-mode');
  console.log('K-V3 active view mode after node click:', activeMode);
});
