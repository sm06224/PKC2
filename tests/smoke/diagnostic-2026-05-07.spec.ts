/**
 * Diagnostic visual capture — 修正指示9 への対応のため、現状の以下を
 * 視覚的に確認する spec(assert なし、screenshot 保存のみ):
 *   - Graph view aspect ratio + node size + 過密度
 *   - Filer explorer view 列幅調整可否
 *   - Graph hover preview tooltip 動作
 *
 * Run: npx playwright test --config tests/smoke/playwright.config.ts \
 *        tests/smoke/diagnostic-2026-05-07.spec.ts --project chromium
 */

import { test, type Page } from '@playwright/test';

async function seedManyEntries(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await shell.waitFor();

  // Seed 30 entries(realistic graph density)で過密度 / aspect 比を確認できる
  // multiple relations / archetypes も用意。
  await page.evaluate(async () => {
    const archetypes = ['text', 'todo', 'folder', 'textlog', 'attachment'];
    const entries: Array<{
      lid: string; title: string; body: string; archetype: string;
      created_at: string; updated_at: string;
    }> = [];
    for (let i = 0; i < 30; i++) {
      const month = String((i % 12) + 1).padStart(2, '0');
      entries.push({
        lid: `e${i}`,
        title: `Entry ${i} - サンプルタイトル長め`,
        body: `これは entry ${i} の本文です。プレビュー用に冒頭テキストが入ります。\n\n## 見出し\n\n本文の続き。`,
        archetype: archetypes[i % archetypes.length]!,
        created_at: `2025-${month}-15T00:00:00Z`,
        updated_at: `2025-${month}-15T00:00:00Z`,
      });
    }
    const relations: Array<{ id: string; kind: string; from: string; to: string }> = [];
    // ランダム的に 50 本の relation を貼る(node 平均 degree ≈ 3.3)。
    const kinds = ['structural', 'semantic', 'categorical', 'temporal'];
    for (let i = 0; i < 50; i++) {
      const from = entries[Math.floor((i * 7) % 30)]!.lid;
      const to = entries[Math.floor((i * 13 + 5) % 30)]!.lid;
      if (from === to) continue;
      relations.push({
        id: `r${i}`,
        kind: kinds[i % kinds.length]!,
        from, to,
      });
    }
    const cont = {
      meta: {
        container_id: 'diag-2026-05-07',
        schema_version: 1,
        title: 'Diagnostic 2026-05-07',
        created_at: '2026-05-07T00:00:00Z',
        updated_at: '2026-05-07T00:00:00Z',
      },
      entries,
      relations,
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
}

test('D-01 graph view 30 nodes / 50 edges - aspect + density', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedManyEntries(page);

  const tab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="graph"]');
  await tab.waitFor();
  const tbox = await tab.boundingBox();
  if (!tbox) throw new Error('graph tab missing');
  await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
  await page.locator('[data-pkc-region="graph-canvas"]').waitFor();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));

  // Capture canvas + parent rect to inspect aspect.
  const info = await page.evaluate(() => {
    const c = document.querySelector('[data-pkc-region="graph-canvas"]') as HTMLCanvasElement | null;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return {
      cssWidth: r.width,
      cssHeight: r.height,
      aspectRatio: r.width / r.height,
      canvasWidth: c.width,
      canvasHeight: c.height,
    };
  });
  console.log('D-01 graph canvas dims:', JSON.stringify(info, null, 2));

  await page.screenshot({
    path: 'test-results/diag-2026-05-07/D-01-graph-overview.png',
    fullPage: false,
  });
});

test('D-02 graph node hover preview tooltip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedManyEntries(page);

  const tab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="graph"]');
  await tab.waitFor();
  const tbox = await tab.boundingBox();
  if (!tbox) throw new Error('graph tab missing');
  await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
  await page.locator('[data-pkc-region="graph-canvas"]').waitFor();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));

  // PR-Δ1:aspect fix の uniform scale + letterbox transform に合わせる。
  const nodePos = await page.evaluate(() => {
    const c = document.querySelector('[data-pkc-region="graph-canvas"]') as HTMLCanvasElement | null;
    if (!c) return null;
    const json = c.getAttribute('data-pkc-graph-nodes');
    if (!json) return null;
    const nodes = JSON.parse(json) as Array<{ lid: string; x: number; y: number }>;
    const n = nodes[0];
    if (!n) return null;
    const rect = c.getBoundingClientRect();
    const PAYLOAD_W = 960, PAYLOAD_H = 600;
    const scale = Math.min(rect.width / PAYLOAD_W, rect.height / PAYLOAD_H);
    const offsetX = (rect.width - PAYLOAD_W * scale) / 2;
    const offsetY = (rect.height - PAYLOAD_H * scale) / 2;
    return { x: rect.left + offsetX + n.x * scale, y: rect.top + offsetY + n.y * scale };
  });
  if (!nodePos) throw new Error('no nodes found');
  await page.mouse.move(nodePos.x, nodePos.y);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  await page.screenshot({
    path: 'test-results/diag-2026-05-07/D-02-graph-hover-tooltip.png',
    fullPage: false,
  });
  const tipVisible = await page.evaluate(() => {
    const t = document.querySelector('.pkc-graph-hover-tooltip') as HTMLElement | null;
    if (!t) return { exists: false };
    return {
      exists: true,
      display: t.style.display,
      text: t.textContent ?? '',
      rect: t.getBoundingClientRect(),
    };
  });
  console.log('D-02 hover tooltip:', JSON.stringify(tipVisible, null, 2));
});

test('D-04 filer column resize handle drag (PR-Δ2)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedManyEntries(page);

  // Switch to filer view mode explicitly. Detail mode is the default.
  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]').first();
  await filerTab.waitFor();
  const ftbox = await filerTab.boundingBox();
  if (!ftbox) throw new Error('filer view-mode tab missing');
  await page.mouse.click(ftbox.x + ftbox.width / 2, ftbox.y + ftbox.height / 2);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  // Find the first resize handle (between name and archetype columns).
  const handle = page.locator('[data-pkc-action="filer-col-resize-start"][data-pkc-col="name"]').first();
  await handle.waitFor({ state: 'attached', timeout: 5000 });
  const hbox = await handle.boundingBox();
  if (!hbox) throw new Error('resize handle missing');

  // Capture initial width.
  const initialWidth = await page.evaluate(() => {
    const th = document.querySelector('th.pkc-filer-th-name') as HTMLElement | null;
    return th?.getBoundingClientRect().width ?? -1;
  });

  // Drag handle 80px to the right via real OS events.
  await page.mouse.move(hbox.x + hbox.width / 2, hbox.y + hbox.height / 2);
  await page.mouse.down();
  await page.mouse.move(hbox.x + hbox.width / 2 + 80, hbox.y + hbox.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));

  const afterWidth = await page.evaluate(() => {
    const th = document.querySelector('th.pkc-filer-th-name') as HTMLElement | null;
    return th?.getBoundingClientRect().width ?? -1;
  });

  // localStorage に永続化されているか確認。
  const persisted = await page.evaluate(() => {
    return localStorage.getItem('pkc2.filer.column-widths');
  });

  console.log('D-04 column resize:', JSON.stringify({ initialWidth, afterWidth, delta: afterWidth - initialWidth, persisted }, null, 2));

  await page.screenshot({
    path: 'test-results/diag-2026-05-07/D-04-filer-after-resize.png',
    fullPage: false,
  });
});

test('D-03 filer explorer column width state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedManyEntries(page);

  // Switch to filer view.
  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  if (await filerTab.count() === 0) {
    // Filer might not be a separate tab — try sidebar mode toggle.
    console.log('filer tab not found, viewing default state');
  } else {
    const fbox = await filerTab.boundingBox();
    if (fbox) {
      await page.mouse.click(fbox.x + fbox.width / 2, fbox.y + fbox.height / 2);
      await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
    }
  }

  // Force the explorer subset profile so the table renders.
  await page.evaluate(() => {
    // Scroll center pane into view if needed.
    const center = document.querySelector('[data-pkc-region="filer-table-wrapper"]');
    if (center) (center as HTMLElement).scrollIntoView();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));

  await page.screenshot({
    path: 'test-results/diag-2026-05-07/D-03-filer-explorer.png',
    fullPage: false,
  });

  const tableInfo = await page.evaluate(() => {
    const table = document.querySelector('.pkc-filer-table') as HTMLTableElement | null;
    if (!table) return { found: false };
    const ths = Array.from(table.querySelectorAll('th'));
    const widths = ths.map((th) => ({
      label: th.textContent?.trim() ?? '',
      width: th.getBoundingClientRect().width,
      hasResizeHandle: !!th.querySelector('[data-pkc-resize-handle]'),
    }));
    const tableLayout = window.getComputedStyle(table).tableLayout;
    return { found: true, tableLayout, widths };
  });
  console.log('D-03 filer table:', JSON.stringify(tableInfo, null, 2));
});
