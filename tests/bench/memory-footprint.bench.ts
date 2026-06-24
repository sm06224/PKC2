/**
 * メモリ実測(user direction 2026-06-24「自分でプレイライトでやって」)。
 *
 * 憶測でなく実機の JS heap を CDP で測り、「全 asset を base64 で常駐」の
 * RAM 実コストを段階差分で確定する。
 *   1. baseline(空)
 *   2. +200 entries(asset 無し)
 *   3. +大量 base64 assets(参照しない=純粋な常駐コスト)
 * 差分から「base64 1 文字あたり何バイト RAM か」を実測(V8 文字列表現の真値)。
 *
 * 計測は CDP Performance.getMetrics(JSHeapUsedSize、forced GC 後)。
 * 注:デコード後画像ビットマップは V8 heap 外なので本値には出ない(別計測)。
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
        const req = indexedDB.open('pkc2', 2);
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
        const req = indexedDB.open('pkc2', 2);
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
  const bytesPerChar = assetDelta / seededChars;

  /* eslint-disable no-console */
  console.log('\n================= PKC2 MEMORY FOOTPRINT (実測) =================');
  console.log(`JS heap baseline (空):            ${MB(base)}`);
  console.log(`[診断] 200-entry load: DOM lids=${info200.domLids}, IDB entries=${info200.idbEntries}`);
  console.log(`[診断] asset load:      DOM lids=${infoA.domLids}, IDB entries=${infoA.idbEntries}`);
  console.log(`JS heap +200 entries (asset 無):  ${MB(e200)}   (Δ ${MB(e200 - base)})`);
  console.log(`JS heap +${MB(seededChars)} base64 assets:  ${MB(withAssets)}   (Δ ${MB(assetDelta)})`);
  console.log(`→ asset RAM 実コスト: ${bytesPerChar.toFixed(2)} bytes / base64 char`);
  console.log(`→ 400MB の base64 を全常駐すると JS heap ≈ ${MB(bytesPerChar * 400 * 1024 * 1024)}`);
  if (ua != null) console.log(`measureUserAgentSpecificMemory (画像 bitmap 等込み 総量): ${MB(ua)}`);
  else console.log('measureUserAgentSpecificMemory: 利用不可(crossOriginIsolated 無し)→ JS heap のみ');
  console.log('================================================================\n');
  /* eslint-enable no-console */

  expect(withAssets).toBeGreaterThan(e200); // assets が実際に常駐していること
});
