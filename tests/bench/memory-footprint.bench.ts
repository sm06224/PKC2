/**
 * メモリ実測(user direction 2026-06-24「自分でプレイライトでやって」)。
 *
 * 憶測でなく実機の JS heap を CDP で測り、working-set 遅延ロード(#868
 * 段階3)の効果を確定する。
 *   1. baseline(空)
 *   2. +200 entries(asset 無し)
 *   3. +大量 base64 assets(どの entry からも参照されない)を IDB に投入し
 *      shallow boot → **常駐しない**ことを確認(段階3 の核心: 全常駐 ≈400MB →
 *      表示中の working-set 数MB)。段階2 時点では全件 reassemble で常駐していた
 *      (≈ 1.0 byte/char、50MB seed で +47MB)が、段階3 では Δ がごく小さい。
 *
 * 計測は CDP Performance.getMetrics(JSHeapUsedSize、forced GC 後)。
 * 注:デコード後画像ビットマップは V8 heap 外なので本値には出ない(別計測)。
 *
 * 第2テストは実機 visual pop-in parity:参照画像を持つ attachment を shallow
 * boot 後に選択 → working-set が IDB から bytes をロードし <img> が data: URI で
 * 描画される(遅延ロードでも画像が静かに壊れない)ことを確認。
 */
import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { bootReady } from '../smoke/_helpers/boot-ready';

const NOW = '1970-01-01T00:00:00.000Z';
const MB = (b: number): string => `${(b / 1024 / 1024).toFixed(1)}MB`;

async function clearIdb(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((res) => {
        const r = indexedDB.deleteDatabase('pkc2');
        r.onsuccess = (): void => res();
        r.onerror = (): void => res();
        r.onblocked = (): void => res();
      }),
  );
}

async function seed(page: Page, nEntries: number, nAssets: number, assetCharLen: number): Promise<void> {
  await page.evaluate(
    async (p) => {
      const entries: unknown[] = [];
      for (let i = 0; i < p.nEntries; i++) {
        entries.push({
          lid: `e${i}`,
          title: `Entry ${i}`,
          body: `# Entry ${i}\n\nbody text `.padEnd(800, 'x '),
          archetype: 'text',
          created_at: p.NOW,
          updated_at: p.NOW,
        });
      }
      const assets: Record<string, string> = {};
      // 各 asset を distinct な文字列に(同一参照だと V8 が共有して residence が
      // 過小評価される)。`${k}-` 前置 + padEnd で k ごとに別 string object。
      for (let k = 0; k < p.nAssets; k++) assets[`a${k}`] = `${k}-`.padEnd(p.assetCharLen, 'A');
      const container = {
        meta: { container_id: 'bench', title: 'bench', created_at: p.NOW, updated_at: p.NOW, schema_version: 1 },
        entries,
        relations: [],
        revisions: [],
        assets,
      };
      await new Promise<void>((res, rej) => {
        const req = indexedDB.open('pkc2');
        req.onerror = (): void => rej(req.error);
        req.onsuccess = (): void => {
          const db = req.result;
          const tx = db.transaction(['containers', 'assets'], 'readwrite');
          tx.objectStore('containers').clear();
          tx.objectStore('assets').clear();
          tx.objectStore('containers').put(container, 'bench');
          tx.objectStore('containers').put('bench', '__default__');
          tx.oncomplete = (): void => { db.close(); res(); };
          tx.onerror = (): void => rej(tx.error);
        };
      });
    },
    { nEntries, nAssets, assetCharLen, NOW },
  );
}

/** 実際にロードされたか診断:DOM の entry 要素数 + IDB に残った entry 数。 */
async function loadedInfo(page: Page): Promise<{ domLids: number; idbEntries: number }> {
  return page.evaluate(
    () =>
      new Promise<{ domLids: number; idbEntries: number }>((res) => {
        const domLids = document.querySelectorAll('[data-pkc-lid]').length;
        const req = indexedDB.open('pkc2');
        req.onsuccess = (): void => {
          const db = req.result;
          try {
            const g = db.transaction(['containers'], 'readonly').objectStore('containers').get('bench');
            g.onsuccess = (): void => {
              const c = g.result as { entries?: unknown[] } | undefined;
              res({ domLids, idbEntries: c?.entries?.length ?? -1 });
              db.close();
            };
            g.onerror = (): void => { res({ domLids, idbEntries: -2 }); db.close(); };
          } catch {
            res({ domLids, idbEntries: -3 });
          }
        };
        req.onerror = (): void => res({ domLids, idbEntries: -4 });
      }),
  );
}

async function jsHeap(client: CDPSession): Promise<number> {
  await client.send('HeapProfiler.collectGarbage');
  const m = (await client.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] };
  return m.metrics.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0;
}

async function uaMemory(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const f = (performance as unknown as { measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }> })
      .measureUserAgentSpecificMemory;
    if (!f) return null;
    try {
      return (await f()).bytes;
    } catch {
      return null;
    }
  });
}

test('memory footprint: asset base64 residence (real JS heap via CDP)', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send('HeapProfiler.enable');
  await client.send('Performance.enable');

  await page.goto('/pkc2.html');
  await clearIdb(page);
  await page.reload();
  await bootReady(page);
  const base = await jsHeap(client);

  await seed(page, 200, 0, 0);
  await page.reload();
  await bootReady(page);
  const e200 = await jsHeap(client);
  const info200 = await loadedInfo(page);

  // 50MB 相当の base64(20 × 2.5M chars)。entries は asset を参照しないので
  // 純粋な「常駐」コスト(render/decode は絡まない)。
  const N_ASSETS = 20;
  const CHARS = 2_500_000;
  const seededChars = N_ASSETS * CHARS;
  await seed(page, 200, N_ASSETS, CHARS);
  await page.reload();
  await bootReady(page);
  const withAssets = await jsHeap(client);
  const infoA = await loadedInfo(page);
  const ua = await uaMemory(page);

  const assetDelta = withAssets - e200;

  /* eslint-disable no-console */
  console.log('\n================= PKC2 MEMORY FOOTPRINT (段階3 working-set) =================');
  console.log(`JS heap baseline (空):            ${MB(base)}`);
  console.log(`[診断] 200-entry load: DOM lids=${info200.domLids}, IDB entries=${info200.idbEntries}`);
  console.log(`[診断] asset load:      DOM lids=${infoA.domLids}, IDB entries=${infoA.idbEntries}`);
  console.log(`JS heap +200 entries (asset 無):  ${MB(e200)}   (Δ ${MB(e200 - base)})`);
  console.log(`JS heap +${MB(seededChars)} 未参照 assets (shallow boot):  ${MB(withAssets)}   (Δ ${MB(assetDelta)})`);
  console.log(`→ 未参照 asset は working-set に載らず常駐しない(段階2 は ≈ +${MB(seededChars)} 常駐していた)`);
  if (ua != null) console.log(`measureUserAgentSpecificMemory (画像 bitmap 等込み 総量): ${MB(ua)}`);
  else console.log('measureUserAgentSpecificMemory: 利用不可(crossOriginIsolated 無し)→ JS heap のみ');
  console.log('============================================================================\n');
  /* eslint-enable no-console */

  // 段階3 の核心: どの entry からも参照されない 50MB の asset を IDB に置いても、
  // shallow boot + working-set では JS heap に常駐しない。段階2 では全件
  // reassemble で ≈ +47MB(≈ 1.0 byte/char)常駐していた。ここでは seed の
  // 半分すら常駐しないこと(= 全常駐していない)を硬く assert する。
  expect(assetDelta).toBeLessThan(seededChars * 0.5);
});

test('visual pop-in parity: lazy-loaded image renders after selection (段階3 #868)', async ({ page }) => {
  await page.goto('/pkc2.html');
  await clearIdb(page);

  // Seed an attachment entry referencing a sizeable image asset, plus the
  // asset bytes — all in the store. Shallow boot will NOT load the bytes.
  await page.evaluate(
    async (NOW) => {
      // Minimal valid 1x1 PNG, repeated to be non-trivial (~0.5MB base64).
      const px =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const big = px.repeat(7000);
      const entry = {
        lid: 'img-1',
        title: 'Lazy image',
        body: JSON.stringify({ name: 'pic.png', mime: 'image/png', size: 1, asset_key: 'a-img' }),
        archetype: 'attachment',
        created_at: NOW,
        updated_at: NOW,
      };
      const container = {
        meta: { container_id: 'bench', title: 'bench', created_at: NOW, updated_at: NOW, schema_version: 1 },
        entries: [entry],
        relations: [],
        revisions: [],
        assets: {},
      };
      await new Promise<void>((res, rej) => {
        const req = indexedDB.open('pkc2');
        req.onerror = (): void => rej(req.error);
        req.onsuccess = (): void => {
          const db = req.result;
          const tx = db.transaction(['containers', 'assets'], 'readwrite');
          tx.objectStore('containers').clear();
          tx.objectStore('assets').clear();
          tx.objectStore('containers').put(container, 'bench');
          tx.objectStore('containers').put('bench', '__default__');
          tx.objectStore('assets').put(big, 'bench:a-img');
          tx.oncomplete = (): void => { db.close(); res(); };
          tx.onerror = (): void => rej(tx.error);
        };
      });
    },
    NOW,
  );
  await page.reload();
  await bootReady(page);

  // Select the entry; the working-set manager loads the image bytes and
  // the detail re-renders with an inline data: image (pop-in). Target a
  // VISIBLE row (the same lid also appears in the hidden "recent" pane).
  await page.locator('[data-pkc-lid="img-1"]:visible').first().click();
  const img = page.locator('img[src^="data:image"]').first();
  await expect(img).toBeVisible({ timeout: 5000 });
});

/**
 * 段階5 最終確認(#868):大きな**参照済み** asset ワークスペース(≈150MB)を
 * shallow boot しても JS heap が全 150MB を常駐させないことを実機で確認する。
 * 段階3 が「全常駐 ≈400MB → 表示中数MB」を達成したことのスケール・エビデンス
 * (段階4 の metadata 索引が入った後の総合計測)。
 *
 * 注:LRU budget による working-set 上限・選択時の pop-in ロードは別テストで
 * 決定的に検証済み(`tests/adapter/asset-working-set.test.ts` の eviction、
 * 本ファイルの visual pop-in parity)。ここは「全件 reassemble しない」の実機証跡。
 */
test('段階5: large referenced workspace does not resident-load the whole store (#868)', async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send('HeapProfiler.enable');
  await client.send('Performance.enable');

  await page.goto('/pkc2.html');
  await clearIdb(page);

  const N = 120;
  const ASSET_CHARS = 1_250_000; // ~1.25MB each → ~150MB total in the store
  const totalChars = N * ASSET_CHARS;
  await page.evaluate(
    async (p) => {
      const entries: unknown[] = [];
      const assets: Record<string, string> = {};
      for (let i = 0; i < p.N; i++) {
        const key = `a${i}`;
        entries.push({
          lid: `e${i}`,
          title: `Image ${i}`,
          body: JSON.stringify({ name: `f${i}.png`, mime: 'image/png', size: 1, asset_key: key }),
          archetype: 'attachment',
          created_at: p.NOW,
          updated_at: p.NOW,
        });
        assets[key] = `${i}-`.padEnd(p.ASSET_CHARS, 'A');
      }
      const container = {
        meta: { container_id: 'bench', title: 'bench', created_at: p.NOW, updated_at: p.NOW, schema_version: 1 },
        entries, relations: [], revisions: [], assets,
      };
      await new Promise<void>((res, rej) => {
        const req = indexedDB.open('pkc2');
        req.onerror = (): void => rej(req.error);
        req.onsuccess = (): void => {
          const db = req.result;
          const tx = db.transaction(['containers', 'assets'], 'readwrite');
          tx.objectStore('containers').clear();
          tx.objectStore('assets').clear();
          const c = { ...container, assets: {} };
          tx.objectStore('containers').put(c, 'bench');
          tx.objectStore('containers').put('bench', '__default__');
          for (const [k, v] of Object.entries(container.assets)) {
            tx.objectStore('assets').put(v, `bench:${k}`);
          }
          tx.oncomplete = (): void => { db.close(); res(); };
          tx.onerror = (): void => rej(tx.error);
        };
      });
    },
    { N, ASSET_CHARS, NOW },
  );

  await page.reload();
  await bootReady(page);
  // Let any post-boot working-set / metadata reconcile settle.
  await page.waitForTimeout(2000);
  const heapBoot = await jsHeap(client);

  /* eslint-disable no-console */
  console.log('\n========== PKC2 段階5: large workspace heap bound (#868) ==========');
  console.log(`seeded referenced assets: ${MB(totalChars)} (${N} × ${MB(ASSET_CHARS)})`);
  console.log(`JS heap after shallow boot:  ${MB(heapBoot)}`);
  console.log(`→ ${MB(totalChars)} のワークスペースでも全件は常駐しない(heap ${MB(heapBoot)})`);
  console.log('===================================================================\n');
  /* eslint-enable no-console */

  // Headline guarantee: a ~150MB asset workspace does NOT pull all bytes into
  // the JS heap at boot. Pre-段階3 this would have been ≈150MB+. The working-
  // set is LRU-bounded (default 48MB) and unviewed assets stay in the store,
  // so the heap is a fraction of the total.
  expect(heapBoot).toBeLessThan(totalChars * 0.5);
});
