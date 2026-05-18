/**
 * U2 (2026-05-07、wave-10-6 UX evaluation):Graph view 単一 folder の
 * 小 N case で node が中央に固まり viewport が空白だらけになる症状を、
 * fit-to-content 対応の auto-fit zoom-IN で解消した変更の visual
 * parity test。
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠 + CLAUDE.md §5
 * 「視覚機能 PR は visual parity test 最低 1 件」必須化。
 *
 * 検証 chain:
 *   1. State mutation = 4 entries(folder + 3 child text)を作成して
 *      Graph view を開く(小 N case の典型シナリオ)
 *   2. Consumer behavior = `data-pkc-graph-zoom-scale` attr が 1 を超
 *      える(auto-fit が zoom-IN を適用した、U2 修正の本体)
 *   3. Visual record = screenshot を残して将来の regression 比較用に
 */

import { test, expect, type Page } from '@playwright/test';

async function seedSmallFolderGraph(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  // CI flake fix (2026-05-18):`shell.waitFor()` は #pkc-root の存在のみ
  // 確認、phase=ready(IDB read + 初回 render 完了)を待たない。CI 高負荷
  // 時(workers=2 × shard 4 = 8 parallel)に reload 後の renderer 未完成
  // 状態で graph tab.waitFor(5_000) に入り 5s timeout 超過 flake。
  // PR #464 graph-pr-k-visual-check と同 pattern fix。
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Seed 4 nodes(folder + 3 children)= 小 N case の典型 via IndexedDB
  // → reload(他 smoke spec の seedManyEntries と同パターン)。U2 fit-
  // to-content の対象シナリオ。
  await page.evaluate(async () => {
    const now = '2026-05-07T00:00:00Z';
    const cont = {
      meta: {
        container_id: 'u2-small-folder',
        schema_version: 1,
        title: 'U2 Small folder',
        created_at: now,
        updated_at: now,
      },
      entries: [
        { lid: 'fold', archetype: 'folder', title: 'Small folder', body: '', tags: [], created_at: now, updated_at: now },
        { lid: 'c0', archetype: 'text', title: 'Child 0', body: 'first', tags: [], created_at: now, updated_at: now },
        { lid: 'c1', archetype: 'text', title: 'Child 1', body: 'second', tags: [], created_at: now, updated_at: now },
        { lid: 'c2', archetype: 'text', title: 'Child 2', body: 'third', tags: [], created_at: now, updated_at: now },
      ],
      relations: [
        { id: 'r0', from: 'fold', to: 'c0', kind: 'structural' },
        { id: 'r1', from: 'fold', to: 'c1', kind: 'structural' },
        { id: 'r2', from: 'fold', to: 'c2', kind: 'structural' },
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
  // reload 後も seeded entry 込みの phase=ready を待つ。
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
}

test('U2 fit-to-content: 小 N graph で auto-fit が zoom-IN を適用(scale > 1)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedSmallFolderGraph(page);

  // Graph view へ切替。real OS click 経由(reform-2026-05 §6)。
  const tab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="graph"]');
  await tab.waitFor({ timeout: 15_000 });
  const tbox = await tab.boundingBox();
  if (!tbox) throw new Error('graph tab missing');
  await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);

  const canvas = page.locator('[data-pkc-region="graph-canvas"]');
  await canvas.waitFor({ timeout: 15_000 });
  // force layout iteration + auto-fit が走る分の microtask + 1 frame 待機。
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));

  // U2 検証 = consumer behavior:auto-fit が zoom-IN を適用したか?
  const zoomState = await canvas.evaluate((c) => ({
    scale: parseFloat(c.getAttribute('data-pkc-graph-zoom-scale') ?? '0'),
    tx: parseFloat(c.getAttribute('data-pkc-graph-zoom-tx') ?? '0'),
    ty: parseFloat(c.getAttribute('data-pkc-graph-zoom-ty') ?? '0'),
  }));
  console.log('U2 zoom state after auto-fit:', JSON.stringify(zoomState));

  // 4 nodes(folder + 3 children)が force layout で集まる小 bbox に
  // 対し、修正後は scale > 1 で zoom-IN される(旧実装は scale=1 で
  // identity のまま、cluster が中央に固まって viewport が空白だらけ
  // だった)。2.5x で cap される(過剰拡大防止)。
  expect(zoomState.scale).toBeGreaterThan(1.0);
  expect(zoomState.scale).toBeLessThanOrEqual(2.5);

  await page.screenshot({
    path: 'test-results/u-wave/U2-small-graph-fit-content.png',
    fullPage: false,
  });
});
