/**
 * graph 拡張 × pkc-ext チャネルの統合 parity smoke(#791/#796 切替後)。
 *
 * 実物の `PKC2-Extensions/graph/pkc2-graph.html` を pkc_extension attachment
 * として seed し、実ブラウザで:
 *   (1) Tier S sandbox(iframe)起動で pkc-ext handshake が成立し、
 *       ContainerProjection が graph に描画される(接続 status + node 数)
 *   (2) host 側で選択を変えると `selected` が押され、graph 側 focus が当たる
 *   (3) ミニマップが表示され、viewport 矩形を持つ(2026-06-12 修正の回帰網)
 * を確認する。
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootReady } from './_helpers/boot-ready';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function seedContainer(page: Page, container: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (cont) => {
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        const meta = (cont as { meta: { container_id: string } }).meta;
        tx.objectStore('containers').put(cont, meta.container_id);
        tx.objectStore('containers').put(meta.container_id, '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, container);
}

const GRAPH_HTML_PATH = resolve(__dirname, '../../PKC2-Extensions/graph/pkc2-graph.html');

test('parity: graph 拡張が Tier S + pkc-ext で接続・描画・選択追従する', async ({ page }) => {
  const graphHtml = readFileSync(GRAPH_HTML_PATH, 'utf8');
  await page.goto('/pkc2.html');
  await bootReady(page);

  const now = '2026-06-12T00:00:00.000Z';
  await seedContainer(page, {
    meta: { container_id: 'cid-graph-ext', title: 'GraphHost', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'gext', title: 'Graph Ext', archetype: 'attachment', created_at: now, updated_at: now,
        body: JSON.stringify({
          name: 'pkc2-graph.html', mime: 'text/html', size: graphHtml.length,
          asset_key: 'graph-html', pkc_extension: true,
        }),
      },
      { lid: 'a', title: 'Alpha', archetype: 'text', body: 'see [Beta](entry:b)', created_at: now, updated_at: now },
      { lid: 'b', title: 'Beta', archetype: 'text', body: 'b', created_at: now, updated_at: now },
      { lid: 'f', title: 'Box', archetype: 'folder', body: '', created_at: now, updated_at: now },
    ],
    relations: [
      { id: 'r1', from: 'f', to: 'a', kind: 'structural', created_at: now, updated_at: now },
      { id: 'r2', from: 'a', to: 'b', kind: 'semantic', created_at: now, updated_at: now },
    ],
    revisions: [],
    assets: { 'graph-html': Buffer.from(graphHtml, 'utf8').toString('base64') },
  });
  await page.reload();
  await bootReady(page);

  // 拡張 entry を選択して起動(click = user gesture)。
  const entry = page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="gext"]',
  ).first();
  await expect(entry).toBeVisible();
  await entry.click();
  const openBtn = page.locator('[data-pkc-action="open-html-attachment"]').first();
  await expect(openBtn).toBeVisible();
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    openBtn.click(),
  ]);

  // Tier S: popup shell 内の sandboxed iframe で graph が動く。
  const sandboxAttr = await popup.locator('iframe').getAttribute('sandbox');
  expect(sandboxAttr).toContain('allow-scripts');
  expect(sandboxAttr).not.toContain('allow-same-origin');
  const ext = popup.frameLocator('iframe');

  // (1) handshake → projection 描画(status label + node 数)。
  const status = ext.locator('.pkc-graph-source-label');
  await expect(status).toContainText('PKC-Message 接続', { timeout: 15_000 });
  await expect(status).toContainText('GraphHost');
  const view = ext.locator('[data-pkc-region="graph-view"]');
  await expect.poll(async () => Number(await view.getAttribute('data-pkc-node-count')), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(3); // a / b / f(gext 自身も含み得る)
  // 内部リンク(links.internal)も projection で届く。
  await expect.poll(async () => Number(await view.getAttribute('data-pkc-hyperlink-count'))).toBeGreaterThanOrEqual(1);

  // (3) ミニマップ + viewport 矩形(2026-06-12 修正)。
  await expect(ext.locator('[data-pkc-region="graph-minimap"]')).toBeVisible();
  await expect(ext.locator('[data-pkc-region="graph-minimap-viewport"]')).toBeAttached();

  // (2) host 側の選択変更 → `selected` push → graph が focus fit する。
  // cytoscape の .focused は canvas 描画のため DOM では見えない — graph が
  // selected を受けた証跡として、focus アニメーション(fit)による
  // viewport 矩形の変化を観測する。
  const rectBefore = await ext.locator('[data-pkc-region="graph-minimap-viewport"]').getAttribute('style');
  await page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="a"]',
  ).first().click();
  await expect.poll(async () =>
    ext.locator('[data-pkc-region="graph-minimap-viewport"]').getAttribute('style'),
  { timeout: 10_000 }).not.toBe(rectBefore);

  await popup.screenshot({ path: 'test-results/graph-extension-pkc-ext.png' });
});
