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

import { test, expect, type Page } from '@playwright/test';

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

test('D-06 popup window block sync activates after toggle click (PR-XX2-fix)', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedManyEntries(page);

  // Pick first text entry, double-click to open popup window.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  // Locate the first text entry in the sidebar.
  const item = page.locator('li.pkc-entry-item[data-pkc-lid="e0"]').first();
  await item.waitFor();
  // Wait for popup to appear after dblclick.
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    item.dblclick(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  await popup.waitForLoadState('load');
  // Popup opens directly in edit mode for text archetype (action-binder.ts handleDblClickAction).
  await popup.waitForSelector('#body-edit', { state: 'visible' });

  // Verify ⇄ button exists.
  const toggle = popup.locator('#btn-toggle-sync');
  await toggle.waitFor();
  // Initial state should be off.
  expect(await toggle.getAttribute('data-pkc-sync-state')).toBe('off');

  // Click the toggle to turn ON.
  await toggle.click();
  expect(await toggle.getAttribute('data-pkc-sync-state')).toBe('on');

  // Set caret on a specific line.
  await popup.evaluate(() => {
    const ta = document.getElementById('body-edit') as HTMLTextAreaElement;
    ta.value = 'Line 0\n## Header on line 1\n\nParagraph line 3.\n\n- item 5\n- item 6\n';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await popup.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  // Move caret to line 1 (on the header).
  await popup.evaluate(() => {
    const ta = document.getElementById('body-edit') as HTMLTextAreaElement;
    ta.focus();
    const offset = ta.value.indexOf('## Header');
    ta.setSelectionRange(offset, offset);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await popup.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  // Inspect the active marker: preview should have an element with
  // data-pkc-active-source="true" matching the header block.
  const result = await popup.evaluate(() => {
    const preview = document.getElementById('body-preview');
    if (!preview) return { hasPreview: false };
    const anchored = preview.querySelectorAll('[data-pkc-source-line]');
    const active = preview.querySelector('[data-pkc-active-source="true"]');
    return {
      hasPreview: true,
      anchorCount: anchored.length,
      activeText: active?.textContent?.slice(0, 80) ?? null,
      activeTagName: active?.tagName ?? null,
    };
  });
  console.log('D-06 popup sync state:', JSON.stringify(result, null, 2));

  await popup.screenshot({
    path: 'test-results/diag-2026-05-07/D-06-popup-sync-after-toggle.png',
    fullPage: false,
  });

  expect(result.anchorCount).toBeGreaterThan(0);
  expect(result.activeText).not.toBeNull();
});

test('D-14 time-proximity graph node overlap audit', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // 実 use case 想定:同じ日に作成された 20 entries を含む clustered timestamps。
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await page.locator('#pkc-root').waitFor();
  await page.evaluate(async () => {
    const archetypes = ['text', 'todo', 'folder', 'textlog', 'attachment'];
    const entries: Array<{
      lid: string; title: string; body: string; archetype: string;
      created_at: string; updated_at: string;
    }> = [];
    // 20 entries on same day (clustered) + 10 spread.
    for (let i = 0; i < 20; i++) {
      entries.push({
        lid: `cluster${i}`,
        title: `Cluster ${i} 同日作成エントリ`,
        body: '',
        archetype: archetypes[i % archetypes.length]!,
        created_at: `2025-06-15T${String(8 + (i % 12)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00Z`,
        updated_at: `2025-06-15T${String(8 + (i % 12)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00Z`,
      });
    }
    for (let i = 0; i < 10; i++) {
      const month = String(((i * 31) % 12) + 1).padStart(2, '0');
      entries.push({
        lid: `spread${i}`,
        title: `Spread ${i}`,
        body: '',
        archetype: archetypes[(i + 2) % archetypes.length]!,
        created_at: `2024-${month}-10T00:00:00Z`,
        updated_at: `2024-${month}-10T00:00:00Z`,
      });
    }
    const cont = {
      meta: {
        container_id: 'diag-time-cluster',
        schema_version: 1,
        title: 'Time cluster',
        created_at: '2026-05-07T00:00:00Z',
        updated_at: '2026-05-07T00:00:00Z',
      },
      entries, relations: [], revisions: [], assets: {},
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = () => rej(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = () => { db.close(); res(); };
        tx.onerror = () => rej(tx.error);
      };
    });
  });
  await page.reload();
  await page.locator('#pkc-root').waitFor();

  const tab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="graph"]').first();
  await tab.waitFor();
  const tbox = await tab.boundingBox();
  if (!tbox) throw new Error('graph tab missing');
  await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
  await page.locator('[data-pkc-region="graph-canvas"]').waitFor();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));

  // Switch to time-proximity mode.
  await page.locator('select.pkc-graph-mode-select').selectOption('time-proximity');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));

  // Pull data-pkc-graph-nodes for full position info.
  const nodeData = await page.evaluate(() => {
    const c = document.querySelector('[data-pkc-region="graph-canvas"]') as HTMLCanvasElement | null;
    if (!c) return null;
    const json = c.getAttribute('data-pkc-graph-nodes');
    if (!json) return null;
    return JSON.parse(json) as Array<{ lid: string; label: string; x: number; y: number }>;
  });
  if (!nodeData) throw new Error('no node data');

  // Detect overlap: pairs with distance < collide threshold.
  const COLLIDE = 70;
  const overlaps: Array<{ a: string; b: string; dist: number }> = [];
  for (let i = 0; i < nodeData.length; i++) {
    for (let j = i + 1; j < nodeData.length; j++) {
      const dx = nodeData[i]!.x - nodeData[j]!.x;
      const dy = nodeData[i]!.y - nodeData[j]!.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < COLLIDE) {
        overlaps.push({ a: nodeData[i]!.lid, b: nodeData[j]!.lid, dist: Math.round(d) });
      }
    }
  }
  console.log('D-14 time-proximity overlap pairs:', overlaps.length, 'of', nodeData.length, 'nodes');
  if (overlaps.length > 0) {
    console.log('D-14 first 5 overlaps:', JSON.stringify(overlaps.slice(0, 5)));
  }

  await page.screenshot({
    path: 'test-results/diag-2026-05-07/D-14-time-proximity.png',
    fullPage: false,
  });
});

test('D-13 popup split sync + caret indicator with REALISTIC long markdown', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  page.on('console', (msg) => {
    if (msg.text().includes('[PKC2-DBG]')) console.log('[BROWSER]', msg.text());
  });

  // Realistic markdown:複数段落 / 見出し階層 / list / code fence / quote /
  // table / 全部入りで 60+ 行。実 use case を想定。
  const realBody = [
    '# プロジェクトメモ',
    '',
    '## 概要',
    '',
    'ここはプロジェクトの**概要**です。複数行にわたる長い文章を含む段落をシミュレートします。実際の利用シーンでは、こういった長い説明文の中にカーソルを配置し、対応する preview 行をハイライトする挙動が求められます。',
    '',
    '## ToDo リスト',
    '',
    '- [ ] 機能 A の実装',
    '  - [ ] サブタスク A-1',
    '  - [x] サブタスク A-2 (完了)',
    '- [ ] 機能 B の実装',
    '  - パラメータ調整',
    '  - テスト作成',
    '- [ ] レビュー対応',
    '',
    '## ベンチマーク結果',
    '',
    '| 項目 | 旧値 | 新値 | 改善 |',
    '|---|---|---|---|',
    '| 起動時間 | 1.2s | 0.8s | 33% |',
    '| メモリ | 120MB | 95MB | 21% |',
    '| 初回 paint | 450ms | 280ms | 38% |',
    '',
    '## コード例',
    '',
    '```typescript',
    'function calculateTotal(items: Item[]): number {',
    '  return items.reduce((sum, item) => sum + item.price * item.qty, 0);',
    '}',
    '',
    'const cart = [',
    '  { name: "Widget", price: 100, qty: 3 },',
    '  { name: "Gadget", price: 250, qty: 1 },',
    '];',
    'console.log(calculateTotal(cart)); // 550',
    '```',
    '',
    '## 引用',
    '',
    '> 設計の本質は、複雑性を制御することにある。',
    '> — F. P. Brooks',
    '',
    '> ネストした引用も',
    '> > 内側の引用',
    '> > も対応すべし',
    '',
    '## 数式計算メモ',
    '',
    'a=1+1=2',
    '  2+3=5',
    '  kokoo 1+2=3',
    '',
    '## 補足',
    '',
    'ここはドキュメントの末尾です。長文の真ん中や末尾に caret を置いたとき、preview の対応 block にハイライトが入り、caret indicator が常に textarea 内の正しい行に重なって表示されることを期待します。',
  ].join('\n');

  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await shell.waitFor();
  await page.evaluate(async (body) => {
    const cont = {
      meta: {
        container_id: 'diag-popup',
        schema_version: 1,
        title: 'Popup test',
        created_at: '2026-05-07T00:00:00Z',
        updated_at: '2026-05-07T00:00:00Z',
      },
      entries: [
        { lid: 'long', title: '長文 Markdown', body, archetype: 'text', created_at: '2026-05-07T00:00:00Z', updated_at: '2026-05-07T00:00:00Z' },
      ],
      relations: [], revisions: [], assets: {},
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = () => rej(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = () => { db.close(); res(); };
        tx.onerror = () => rej(tx.error);
      };
    });
  }, realBody);
  await page.reload();
  await shell.waitFor();

  // Open popup via dblclick.
  const item = page.locator('li.pkc-entry-item[data-pkc-lid="long"]').first();
  await item.waitFor();
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    item.dblclick(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  await popup.waitForLoadState('load');
  await popup.waitForSelector('#body-edit', { state: 'visible' });
  await popup.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  // Turn ON sync.
  await popup.locator('#btn-toggle-sync').click();
  await popup.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  // Test multiple caret positions across various block types.
  const probePositions = [
    { name: 'P1 H1 行', searchFor: '# プロジェクトメモ', expectActive: 'H1' },
    { name: 'P2 H2 行', searchFor: '## ベンチマーク結果', expectActive: 'H2' },
    { name: 'P3 list item', searchFor: '- [ ] 機能 A の実装', expectActive: 'LI' },
    { name: 'P4 nested list', searchFor: '  - [ ] サブタスク A-1', expectActive: 'LI' },
    { name: 'P5 table row', searchFor: '| 起動時間 | 1.2s', expectActive: 'TD' },
    { name: 'P6 code fence inside', searchFor: 'function calculateTotal', expectActive: 'CODE' },
    { name: 'P7 blockquote', searchFor: '> 設計の本質は', expectActive: 'BLOCKQUOTE' },
    { name: 'P8 末尾 paragraph', searchFor: 'ここはドキュメントの末尾', expectActive: 'P' },
  ];

  const results: Array<{ name: string; activeTag: string | null; activeText: string | null; caretIndicatorY: number | null; caretIndicatorVisible: boolean }> = [];
  for (const probe of probePositions) {
    await popup.evaluate((search) => {
      const ta = document.getElementById('body-edit') as HTMLTextAreaElement;
      ta.focus();
      const offset = ta.value.indexOf(search);
      if (offset < 0) return;
      ta.setSelectionRange(offset, offset);
      // Force selectionchange + scroll caret into view.
      document.dispatchEvent(new Event('selectionchange'));
      // Compute scroll: scroll textarea so caret is roughly in the middle.
      const cs = window.getComputedStyle(ta);
      const lineH = parseFloat(cs.lineHeight) || 21;
      const v = ta.value;
      let line = 0;
      for (let i = 0; i < offset; i++) if (v.charCodeAt(i) === 10) line++;
      ta.scrollTop = Math.max(0, line * lineH - ta.clientHeight / 2);
    }, probe.searchFor);
    await popup.evaluate(() => new Promise((r) => setTimeout(r, 250)));

    const r = await popup.evaluate(() => {
      const preview = document.getElementById('body-preview');
      const active = preview?.querySelector('[data-pkc-active-source="true"]');
      const ind = document.getElementById('pkc-popup-caret-indicator');
      return {
        activeTag: active?.tagName ?? null,
        activeText: active?.textContent?.slice(0, 40) ?? null,
        caretIndicatorY: ind && ind.style.display !== 'none' ? ind.getBoundingClientRect().top : null,
        caretIndicatorVisible: !!ind && ind.style.display !== 'none',
      };
    });
    results.push({ name: probe.name, ...r });
  }
  console.log('D-13 results:', JSON.stringify(results, null, 2));
  await popup.screenshot({
    path: 'test-results/diag-2026-05-07/D-13-popup-realistic.png',
    fullPage: false,
  });
});

test('D-12 filer click selects EXACTLY the clicked entry (no ID collision)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Capture browser console logs.
  page.on('console', (msg) => {
    if (msg.text().includes('[PKC2-DBG]')) console.log('[BROWSER]', msg.text());
  });
  await seedManyEntries(page);

  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]').first();
  await filerTab.waitFor();
  const ftbox = await filerTab.boundingBox();
  if (!ftbox) throw new Error('filer tab missing');
  await page.mouse.click(ftbox.x + ftbox.width / 2, ftbox.y + ftbox.height / 2);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));

  // Click each row's checkbox individually and verify ONLY that row gets
  // multi-selected (no ID-shared rows).
  const rowChecks = page.locator('input.pkc-filer-row-check[data-pkc-lid]');
  const count = await rowChecks.count();
  console.log('D-12 row checkbox count:', count);

  // Track every dispatch via console intercept.
  await page.evaluate(() => {
    const logs: string[] = [];
    (window as { __pkcDispatchLog?: string[] }).__pkcDispatchLog = logs;
    // Patch the dispatcher if exposed.
    const w = window as unknown as { pkcDispatcher?: { dispatch: (a: unknown) => void } };
    if (w.pkcDispatcher) {
      const origDispatch = w.pkcDispatcher.dispatch.bind(w.pkcDispatcher);
      w.pkcDispatcher.dispatch = (a: unknown) => {
        logs.push(JSON.stringify(a));
        return origDispatch(a);
      };
    }
  });

  for (let i = 0; i < Math.min(count, 3); i++) {
    const cb = rowChecks.nth(i);
    const box = await cb.boundingBox();
    if (!box) continue;
    const targetLid = await cb.getAttribute('data-pkc-lid');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.click(cx, cy);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 250)));
    const state = await page.evaluate(() => {
      const multi = Array.from(document.querySelectorAll<HTMLTableRowElement>(
        'tr.pkc-filer-row[data-pkc-multi-selected="true"]',
      )).map((r) => r.getAttribute('data-pkc-lid'));
      const dispatches = ((window as { __pkcDispatchLog?: string[] }).__pkcDispatchLog ?? []).slice();
      ((window as { __pkcDispatchLog?: string[] }).__pkcDispatchLog ?? []).length = 0;
      return { multi, dispatches };
    });
    console.log('D-12 step', i, 'targetLid:', targetLid, 'state:', JSON.stringify(state));
  }

  // Final state: selecting individual checkbox should result in only the
  // user-clicked lids being selected. If ID collision exists, additional
  // unrelated lids would appear.
  const final = await page.evaluate(() => {
    const checked = Array.from(document.querySelectorAll<HTMLInputElement>(
      'input.pkc-filer-row-check[data-pkc-lid]:checked',
    )).map((c) => c.getAttribute('data-pkc-lid'));
    const multi = Array.from(document.querySelectorAll<HTMLTableRowElement>(
      'tr.pkc-filer-row[data-pkc-multi-selected="true"]',
    )).map((r) => r.getAttribute('data-pkc-lid'));
    // detect duplicates within multi (should be 0 — each lid unique)
    const dupCount = multi.length - new Set(multi).size;
    return { checked, multi, dupCount };
  });
  console.log('D-12 final state:', JSON.stringify(final));
});

test('D-11 graph Venn / Region toggle reactivity (regression)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedManyEntries(page);

  const tab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="graph"]').first();
  await tab.waitFor();
  const tbox = await tab.boundingBox();
  if (!tbox) throw new Error('graph tab missing');
  await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
  await page.locator('[data-pkc-region="graph-canvas"]').waitFor();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));

  // Venn toggle: button click → text/state flips.
  const vennBefore = await page.locator('[data-pkc-action="toggle-graph-venn-grouping-mode"]').first().textContent();
  await page.locator('[data-pkc-action="toggle-graph-venn-grouping-mode"]').first().click();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const vennAfter = await page.locator('[data-pkc-action="toggle-graph-venn-grouping-mode"]').first().textContent();
  console.log('D-11 Venn before:', JSON.stringify(vennBefore), 'after:', JSON.stringify(vennAfter));

  // Region toggle.
  const regionBefore = await page.locator('[data-pkc-action="toggle-graph-region-select-mode"]').first().getAttribute('data-pkc-active');
  await page.locator('[data-pkc-action="toggle-graph-region-select-mode"]').first().click();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const regionAfter = await page.locator('[data-pkc-action="toggle-graph-region-select-mode"]').first().getAttribute('data-pkc-active');
  console.log('D-11 Region active before:', regionBefore, 'after:', regionAfter);

  await page.screenshot({
    path: 'test-results/diag-2026-05-07/D-11-graph-toggles.png',
    fullPage: false,
  });
});

test('D-10 inline calc real keyboard test (regression)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await shell.waitFor();

  // Seed a single text entry, edit it, and try inline calc in various positions.
  await page.evaluate(async () => {
    const cont = {
      meta: {
        container_id: 'diag-calc',
        schema_version: 1,
        title: 'Calc test',
        created_at: '2026-05-07T00:00:00Z',
        updated_at: '2026-05-07T00:00:00Z',
      },
      entries: [
        { lid: 'calc1', title: 'Calc target', body: 'initial body\n', archetype: 'text', created_at: '2026-05-07T00:00:00Z', updated_at: '2026-05-07T00:00:00Z' },
      ],
      relations: [], revisions: [], assets: {},
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = () => rej(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = () => { db.close(); res(); };
        tx.onerror = () => rej(tx.error);
      };
    });
  });
  await page.reload();
  await shell.waitFor();

  // Click the entry in sidebar to select.
  await page.locator('li.pkc-entry-item[data-pkc-lid="calc1"]').first().click();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  // Enter edit mode by clicking the edit/pencil button.
  await page.locator('button[data-pkc-action="begin-edit"]').first().click();
  await page.waitForSelector('textarea[data-pkc-field="body"]', { state: 'visible', timeout: 8000 });

  const ta = page.locator('textarea[data-pkc-field="body"]').first();

  // Test case A: 行頭で 1+2= → Enter
  await ta.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await ta.type('1+2=');
  await page.keyboard.press('Enter');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const valA = await ta.inputValue();
  console.log('D-10 case A (line head 1+2= + Enter):', JSON.stringify(valA));

  // Test case B: 行途中 "Total: 5*3="
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await ta.type('Total: 5*3=');
  await page.keyboard.press('Enter');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const valB = await ta.inputValue();
  console.log('D-10 case B (mid-line Total: 5*3= + Enter):', JSON.stringify(valB));

  // Test case C: 行途中 で = の後にスペース後続テキスト
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await ta.type('answer = 100/4=');
  // Move caret BEFORE pressing Enter? In context C, just press Enter at end.
  await page.keyboard.press('Enter');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const valC = await ta.inputValue();
  console.log('D-10 case C (answer = 100/4= + Enter):', JSON.stringify(valC));

  // Test case D: ユーザー実報告ケース — indent 行で複数式
  // a=1+1=  → Enter
  //   2+3=  → Enter
  //   kokoo 1+2=  → Enter
  // 全行で計算結果が右辺に挿入されるべき。indent 継続の handleEditorEnter
  // 経路で Enter が consume されると inline-calc が動かない bug を検知。
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await ta.type('a=1+1=');
  await page.keyboard.press('Enter');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
  await ta.type('  2+3=');
  await page.keyboard.press('Enter');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
  await ta.type('  kokoo 1+2=');
  await page.keyboard.press('Enter');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const valD = await ta.inputValue();
  console.log('D-10 case D (multi-line indent calc):', JSON.stringify(valD));

  // Matrix expansion (Δ8 self-discipline):軸ごとに体系的に列挙。
  type Case = { name: string; setup: string; expected: string; expectFire: boolean };
  const matrix: Case[] = [
    // 軸 1: indent 0 / 1tab / 2sp / 4sp / list-marker
    { name: 'M1 indent=0  trailing=none', setup: '7+3=', expected: '7+3=10\n', expectFire: true },
    { name: 'M2 indent=1tab', setup: '\t9-4=', expected: '\t9-4=5\n', expectFire: true },
    { name: 'M3 indent=4sp', setup: '    8/2=', expected: '    8/2=4\n', expectFire: true },
    { name: 'M4 list "- 1+2="', setup: '- 1+2=', expected: '- 1+2=3\n', expectFire: true },
    { name: 'M5 list "1. 5*2="', setup: '1. 5*2=', expected: '1. 5*2=10\n', expectFire: true },
    // 軸 2: prefix textの種類
    { name: 'M6 prefix CJK', setup: '答えは 6+7=', expected: '答えは 6+7=13\n', expectFire: true },
    { name: 'M7 prefix mixed', setup: 'X = 10 / 4=', expected: 'X = 10 / 4=2.5\n', expectFire: true },
    // 軸 3: 無効式は silent no-op(Enter は普通に通って改行)
    { name: 'M8 invalid foo=', setup: 'foo=', expected: 'foo=\n', expectFire: false },
    { name: 'M9 div by zero', setup: '5/0=', expected: '5/0=\n', expectFire: false },
    { name: 'M10 trailing op', setup: '1+=', expected: '1+=\n', expectFire: false },
    // 軸 4: 後続テキスト・行末以外位置
    { name: 'M11 trailing text after =', setup: '2+2=', expected: '2+2=4\n', expectFire: true },
    // 軸 5: 小数 / かっこ / 単項
    { name: 'M12 decimal', setup: '0.1+0.2=', expected: '0.1+0.2=0.3\n', expectFire: true },
    { name: 'M13 paren', setup: '(2+3)*4=', expected: '(2+3)*4=20\n', expectFire: true },
    { name: 'M14 unary minus', setup: '-5+2=', expected: '-5+2=-3\n', expectFire: true },
  ];
  const matrixResults: Array<{ name: string; ok: boolean; got: string; expected: string }> = [];
  for (const c of matrix) {
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await ta.type(c.setup);
    await page.keyboard.press('Enter');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
    const got = await ta.inputValue();
    const ok = got === c.expected;
    matrixResults.push({ name: c.name, ok, got, expected: c.expected });
  }
  console.log('D-10 matrix results:', JSON.stringify(matrixResults, null, 2));
  const failedMatrix = matrixResults.filter((r) => !r.ok);
  console.log('D-10 matrix FAILED count:', failedMatrix.length, 'of', matrix.length);

  await page.screenshot({
    path: 'test-results/diag-2026-05-07/D-10-inline-calc.png',
    fullPage: false,
  });
});

test('D-09 filer row alignment with mixed length names (regression)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await shell.waitFor();

  // Seed entries with mix of very-long names + short names + special chars
  // to expose any row-height inconsistency caused by truncation / fallback
  // font metrics.
  await page.evaluate(async () => {
    const entries: Array<{
      lid: string; title: string; body: string; archetype: string;
      created_at: string; updated_at: string; tags?: string[];
    }> = [
      { lid: 'short', title: 'Short', body: '', archetype: 'text', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
      { lid: 'long', title: '非常に長いエントリ名で50文字を超えてtruncateMiddleの分岐が発火する想定のテストエントリ', body: '', archetype: 'text', created_at: '2025-02-01T00:00:00Z', updated_at: '2025-02-01T00:00:00Z' },
      { lid: 'medium', title: 'Medium length name', body: '', archetype: 'todo', created_at: '2025-03-01T00:00:00Z', updated_at: '2025-03-01T00:00:00Z' },
      { lid: 'longer', title: 'これも長めのタイトルでエントリーの確認用にちょうど48文字くらいです、はい', body: '', archetype: 'text', created_at: '2025-04-01T00:00:00Z', updated_at: '2025-04-01T00:00:00Z' },
      { lid: 'tagged', title: 'Tagged short', body: '', archetype: 'text', created_at: '2025-05-01T00:00:00Z', updated_at: '2025-05-01T00:00:00Z', tags: ['一括テスト', 'foo', 'bar'] },
      { lid: 'emoji', title: '🚀 Emoji prefix entry', body: '', archetype: 'text', created_at: '2025-06-01T00:00:00Z', updated_at: '2025-06-01T00:00:00Z' },
      { lid: 'narrow', title: 'a', body: '', archetype: 'text', created_at: '2025-07-01T00:00:00Z', updated_at: '2025-07-01T00:00:00Z' },
      { lid: 'cjk', title: '日本語のみの短いタイトル', body: '', archetype: 'textlog', created_at: '2025-08-01T00:00:00Z', updated_at: '2025-08-01T00:00:00Z' },
    ];
    const cont = {
      meta: {
        container_id: 'diag-row-align',
        schema_version: 1,
        title: 'Row align test',
        created_at: '2026-05-07T00:00:00Z',
        updated_at: '2026-05-07T00:00:00Z',
      },
      entries, relations: [], revisions: [], assets: {},
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

  // Switch to filer view.
  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]').first();
  await filerTab.waitFor();
  const ftbox = await filerTab.boundingBox();
  if (!ftbox) throw new Error('filer tab missing');
  await page.mouse.click(ftbox.x + ftbox.width / 2, ftbox.y + ftbox.height / 2);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  // Capture per-row Y / height + per-cell heights for alignment audit.
  const audit = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>(
      'tr.pkc-filer-row[data-pkc-lid]',
    ));
    return rows.map((r) => {
      const rect = r.getBoundingClientRect();
      const cells = Array.from(r.querySelectorAll<HTMLTableCellElement>('td')).map((td) => {
        const tdRect = td.getBoundingClientRect();
        // Inner content height (e.g. title span, icon).
        const inner = td.firstElementChild;
        const innerRect = inner instanceof HTMLElement ? inner.getBoundingClientRect() : null;
        return {
          cls: td.className,
          height: tdRect.height,
          y: tdRect.y,
          innerHeight: innerRect?.height ?? 0,
          innerY: innerRect?.y ?? 0,
        };
      });
      return {
        lid: r.getAttribute('data-pkc-lid'),
        y: rect.y,
        height: rect.height,
        cells,
      };
    });
  });
  console.log('D-09 row alignment audit:', JSON.stringify(audit, null, 2));

  await page.screenshot({
    path: 'test-results/diag-2026-05-07/D-09-filer-row-alignment.png',
    fullPage: false,
  });

  // 視覚証拠用 zoom-in:filer table の最初 8 行(全 entry)を crop して
  // 拡大保存。各 row の baseline 揃いを目視確認できるレベル。
  const tableRect = await page.evaluate(() => {
    const t = document.querySelector('.pkc-filer-table');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (tableRect) {
    await page.screenshot({
      path: 'test-results/diag-2026-05-07/D-09-filer-rows-zoom.png',
      clip: { x: tableRect.x, y: tableRect.y, width: Math.min(900, tableRect.w), height: Math.min(260, tableRect.h) },
    });
  }

  // Auto-detect row stride inconsistency.
  const heights = audit.map((r) => r.height);
  const minH = Math.min(...heights);
  const maxH = Math.max(...heights);
  const heightDelta = maxH - minH;
  console.log('D-09 row height min/max/delta:', minH, maxH, heightDelta);

  // PR-Δ7-fix2:icon と title の Y position も揃っているか測る。
  // 行ごとに icon span と title span の getBoundingClientRect().y を取り、
  // 全行の同 element の Y を比較する。
  const iconYAudit = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>(
      'tr.pkc-filer-row[data-pkc-lid]',
    ));
    return rows.map((r) => {
      const icon = r.querySelector('.pkc-filer-row-icon');
      const title = r.querySelector('.pkc-filer-row-title');
      const ir = icon?.getBoundingClientRect();
      const tr = title?.getBoundingClientRect();
      return {
        lid: r.getAttribute('data-pkc-lid'),
        iconY: ir?.y ?? -1,
        iconH: ir?.height ?? -1,
        titleY: tr?.y ?? -1,
        titleH: tr?.height ?? -1,
        // Computed icon CENTER vs row CENTER:差が出れば視覚行ズレの正体。
      };
    });
  });
  void iconYAudit;
  // 行毎の icon Y は (rowY + rowStride * idx) と等しいはずだが、stride
  // で正規化して相対 offset を比較する。
  const rowStride = audit.length > 1 ? audit[1]!.y - audit[0]!.y : 24;
  const iconOffsets = iconYAudit.map((r, i) => r.iconY - audit[i]!.y);
  const titleOffsets = iconYAudit.map((r, i) => r.titleY - audit[i]!.y);
  const minIcon = Math.min(...iconOffsets);
  const maxIcon = Math.max(...iconOffsets);
  const minTitle = Math.min(...titleOffsets);
  const maxTitle = Math.max(...titleOffsets);
  console.log('D-09 icon Y offset (relative to row top): min/max/delta:', minIcon, maxIcon, maxIcon - minIcon);
  console.log('D-09 title Y offset: min/max/delta:', minTitle, maxTitle, maxTitle - minTitle);
  console.log('D-09 row stride:', rowStride);
});

test('D-08 filer bulk tag/color application preserves other fields (PR-Δ5)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedManyEntries(page);

  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]').first();
  await filerTab.waitFor();
  const ftbox = await filerTab.boundingBox();
  if (!ftbox) throw new Error('filer tab missing');
  await page.mouse.click(ftbox.x + ftbox.width / 2, ftbox.y + ftbox.height / 2);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  // Multi-select 2 rows by clicking checkboxes.
  const rowChecks = page.locator('input.pkc-filer-row-check[data-pkc-lid]');
  for (const i of [0, 1]) {
    const box = await rowChecks.nth(i).boundingBox();
    if (!box) continue;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
  }

  // Capture pre-bulk state of those 2 entries (full container snapshot).
  const lids = await page.evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLInputElement>(
      'input.pkc-filer-row-check[data-pkc-lid]:checked',
    )).map((c) => c.getAttribute('data-pkc-lid')!);
  });
  console.log('D-08 selected lids:', JSON.stringify(lids));

  const preState = await page.evaluate((lids) => {
    return new Promise<Array<unknown>>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = () => rej(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['containers'], 'readonly');
        const get = tx.objectStore('containers').get('diag-2026-05-07');
        get.onsuccess = () => {
          const cont = get.result as { entries: Array<{ lid: string; title: string; body: string; archetype: string; tags?: string[]; color_tag?: string }> };
          res(cont.entries.filter((e) => lids.includes(e.lid)));
        };
      };
    });
  }, lids);
  console.log('D-08 pre-bulk:', JSON.stringify(preState));

  // Type tag in the bulk input + Enter.
  const tagInput = page.locator('input.pkc-multi-action-tag-input');
  await tagInput.waitFor();
  await tagInput.click();
  await tagInput.fill('一括テスト');
  await tagInput.press('Enter');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  // Apply color-tag = blue.
  const colorSelect = page.locator('select.pkc-multi-action-color');
  await colorSelect.selectOption('blue');
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  // Capture post-bulk container state for the same 2 lids.
  const postState = await page.evaluate((lids) => {
    return new Promise<Array<unknown>>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = () => rej(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['containers'], 'readonly');
        const get = tx.objectStore('containers').get('diag-2026-05-07');
        get.onsuccess = () => {
          const cont = get.result as { entries: Array<{ lid: string; title: string; body: string; archetype: string; tags?: string[]; color_tag?: string }> };
          res(cont.entries.filter((e) => lids.includes(e.lid)));
        };
      };
    });
  }, lids);
  console.log('D-08 post-bulk:', JSON.stringify(postState, null, 2));

  await page.screenshot({
    path: 'test-results/diag-2026-05-07/D-08-filer-bulk-applied.png',
    fullPage: false,
  });
});

test('D-07 filer single-row click should select EXACTLY one entry (regression)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedManyEntries(page);

  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]').first();
  await filerTab.waitFor();
  const ftbox = await filerTab.boundingBox();
  if (!ftbox) throw new Error('filer tab missing');
  await page.mouse.click(ftbox.x + ftbox.width / 2, ftbox.y + ftbox.height / 2);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  // Click a single row's name area (avoid the checkbox column).
  const rows = page.locator('tr.pkc-filer-row[data-pkc-lid]');
  const r1 = await rows.nth(1).boundingBox();
  if (!r1) throw new Error('row 1 missing');

  // Diagnostic: capture DOM state of row 1 before click.
  const r1Info = await page.evaluate(() => {
    const row = document.querySelectorAll('tr.pkc-filer-row[data-pkc-lid]')[1];
    if (!row) return { found: false };
    const action = row.getAttribute('data-pkc-action');
    const lid = row.getAttribute('data-pkc-lid');
    const cells = Array.from(row.querySelectorAll('td')).map((td) => ({
      cls: td.className,
      width: td.getBoundingClientRect().width,
      x: td.getBoundingClientRect().x,
    }));
    return { found: true, action, lid, cells };
  });
  console.log('D-07 row 1 DOM:', JSON.stringify(r1Info, null, 2));

  // Diagnostic: what element is at the click point?
  const elAtPoint = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return { found: false };
    const closest = el.closest('[data-pkc-action]');
    return {
      tagName: el.tagName,
      cls: el.className,
      action: closest?.getAttribute('data-pkc-action'),
      lid: closest?.getAttribute('data-pkc-lid'),
    };
  }, { x: r1.x + 200, y: r1.y + r1.height / 2 });
  console.log('D-07 element at click point:', JSON.stringify(elAtPoint));

  await page.mouse.click(r1.x + 200, r1.y + r1.height / 2);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));

  const after1 = await page.evaluate(() => {
    const active = document.querySelectorAll('tr.pkc-filer-row[data-pkc-active="true"]');
    const multi = document.querySelectorAll('tr.pkc-filer-row[data-pkc-multi-selected="true"]');
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('tr.pkc-filer-row[data-pkc-lid]'));
    // Look at AppState-like indicators in any view (sidebar's selected lid).
    const sidebarActive = Array.from(document.querySelectorAll<HTMLElement>('[data-pkc-region="sidebar"] [data-pkc-active="true"][data-pkc-lid]'));
    return {
      activeCount: active.length,
      activeLid: active[0]?.getAttribute('data-pkc-lid') ?? null,
      multiCount: multi.length,
      multiLids: Array.from(multi).map((r) => r.getAttribute('data-pkc-lid')),
      sidebarActiveLid: sidebarActive[0]?.getAttribute('data-pkc-lid') ?? null,
      filerRowCount: rows.length,
    };
  });
  console.log('D-07 after first click:', JSON.stringify(after1));

  // Now click a DIFFERENT row.
  const r3 = await rows.nth(3).boundingBox();
  if (!r3) throw new Error('row 3 missing');
  await page.mouse.click(r3.x + 200, r3.y + r3.height / 2);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  const after2 = await page.evaluate(() => {
    const active = document.querySelectorAll('tr.pkc-filer-row[data-pkc-active="true"]');
    const multi = document.querySelectorAll('tr.pkc-filer-row[data-pkc-multi-selected="true"]');
    return {
      activeCount: active.length,
      activeLid: active[0]?.getAttribute('data-pkc-lid') ?? null,
      multiCount: multi.length,
      multiLids: Array.from(multi).map((r) => r.getAttribute('data-pkc-lid')),
    };
  });
  console.log('D-07 after second click:', JSON.stringify(after2));

  await page.screenshot({
    path: 'test-results/diag-2026-05-07/D-07-filer-single-click.png',
    fullPage: false,
  });
});

test('D-05 filer multi-select via checkbox (PR-Δ3)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedManyEntries(page);

  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]').first();
  await filerTab.waitFor();
  const ftbox = await filerTab.boundingBox();
  if (!ftbox) throw new Error('filer view-mode tab missing');
  await page.mouse.click(ftbox.x + ftbox.width / 2, ftbox.y + ftbox.height / 2);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  // Click 3 row checkboxes via real OS event.
  const rowChecks = page.locator('input.pkc-filer-row-check[data-pkc-lid]');
  for (const i of [0, 2, 4]) {
    const box = await rowChecks.nth(i).boundingBox();
    if (!box) throw new Error(`row check ${i} missing`);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
  }

  const result = await page.evaluate(() => {
    const checkedRows = Array.from(document.querySelectorAll<HTMLTableRowElement>(
      'tr.pkc-filer-row[data-pkc-multi-selected="true"]',
    )).map((r) => r.getAttribute('data-pkc-lid'));
    const bar = document.querySelector('[data-pkc-region="multi-action-bar"]');
    const barText = bar?.textContent?.trim() ?? '';
    return { checkedRows, barVisible: !!bar, barText };
  });
  console.log('D-05 multi-select state:', JSON.stringify(result, null, 2));

  await page.screenshot({
    path: 'test-results/diag-2026-05-07/D-05-filer-multi-select.png',
    fullPage: false,
  });
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
