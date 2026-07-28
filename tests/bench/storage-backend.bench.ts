/**
 * #904 — OPFS / FSA / IDB ストレージ backend の大量エントリベンチ
 * (user 要望 2026-07-12「それぞれのモードをテストして大量のエントリに対して
 * ベンチマークをして欲しい。そしてユースケースを分けて欲しい」)。
 *
 * 2 部構成:
 *
 * **Part A: primitive レベル**(各 backend の保存単位を adapter と同じ encode で
 * 直接測る。adapter 実装の実情に合わせる:idb-adapter は structured clone で
 * put/get、opfs/fsa は共有実装 fs-directory-adapter が per-record の JSON 文字列
 * file を createWritable で書く)
 *   - containerPut / containerGet / editResave(1 entry 変更 → 全体再 put)
 *     × 規模 {100, 1000, 5000 entries}(body ~800 chars)
 *   - assets bulkPut / bulkGet(100 × 100KB 文字列)
 *   - FSA は user gesture が要るため OPFS root 上の DirectoryHandle で代替
 *     (fsa-adapter は root handle の出所以外 opfs と同一コード。実 FSA の
 *     絶対値は対象ディスク依存 — doc に明記)。ここでは opfs との parity
 *     確認として 1000 規模のみ測る。
 *
 * **Part B: アプリ実測**(実 adapter コード経路)
 *   - c-5000 相当を IDB に seed → backend pref を切替えて reload →
 *     `window.PKC.bootReady` までの boot 時間(idb / opfs、median of 3)。
 *     opfs は初回 reload で migration が走るため、その回は捨てて計測。
 *
 * 結果は bench-results/storage-backend.json に書き、console にも表を出す。
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootReady } from '../smoke/_helpers/boot-ready';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '..', '..', 'bench-results');

interface PrimitiveResult {
  backend: string;
  scale: number;
  containerPutMs: number;
  containerGetMs: number;
  editResaveMs: number;
}
interface AssetResult {
  backend: string;
  bulkPut100Ms: number;
  bulkGet100Ms: number;
}

/** page 内で全 primitive ベンチを実行(median of 3、warmup 1)。 */
async function runPrimitiveBench(page: Page): Promise<{
  primitives: PrimitiveResult[];
  assets: AssetResult[];
}> {
  return page.evaluate(async () => {
    const median = (xs: number[]): number => {
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)] ?? 0;
    };
    const makeContainer = (n: number): Record<string, unknown> => {
      const entries = [];
      for (let i = 0; i < n; i++) {
        entries.push({
          lid: `e${i}`,
          title: `Entry ${i}`,
          body: `# Entry ${i}\n\nbody text `.padEnd(800, 'x '),
          archetype: 'text',
          created_at: '1970-01-01T00:00:00.000Z',
          updated_at: '1970-01-01T00:00:00.000Z',
        });
      }
      return {
        meta: { container_id: `bench-${n}`, title: `bench ${n}`, created_at: '1970-01-01T00:00:00.000Z', updated_at: '1970-01-01T00:00:00.000Z', schema_version: 1 },
        entries, relations: [], revisions: [], assets: {},
      };
    };

    // ── IDB backend(idb-adapter と同じ structured put/get)──
    const idb = {
      name: 'idb',
      db: null as IDBDatabase | null,
      async setup(): Promise<void> {
        await new Promise<void>((res) => { const r = indexedDB.deleteDatabase('pkc2-bench'); r.onsuccess = r.onerror = r.onblocked = (): void => res(); });
        this.db = await new Promise<IDBDatabase>((res, rej) => {
          const req = indexedDB.open('pkc2-bench', 1);
          req.onupgradeneeded = (): void => { req.result.createObjectStore('containers'); };
          req.onsuccess = (): void => res(req.result);
          req.onerror = (): void => rej(req.error);
        });
      },
      async put(key: string, value: unknown): Promise<void> {
        const db = this.db!;
        await new Promise<void>((res, rej) => {
          const tx = db.transaction('containers', 'readwrite');
          tx.objectStore('containers').put(value, key);
          tx.oncomplete = (): void => res();
          tx.onerror = (): void => rej(tx.error);
        });
      },
      async get(key: string): Promise<unknown> {
        const db = this.db!;
        return new Promise((res, rej) => {
          const tx = db.transaction('containers', 'readonly');
          const rq = tx.objectStore('containers').get(key);
          rq.onsuccess = (): void => res(rq.result);
          rq.onerror = (): void => rej(rq.error);
        });
      },
      async teardown(): Promise<void> { this.db?.close(); },
    };

    // ── OPFS / FSA backend(fs-directory-adapter と同じ JSON 文字列 file)──
    type Dir = FileSystemDirectoryHandle;
    const makeFsBackend = (name: string, rootDir: Dir) => ({
      name,
      dir: null as Dir | null,
      async setup(): Promise<void> {
        try { await rootDir.removeEntry(`bench-${name}`, { recursive: true }); } catch { /* absent */ }
        this.dir = await rootDir.getDirectoryHandle(`bench-${name}`, { create: true });
      },
      async put(key: string, value: unknown): Promise<void> {
        const fh = await this.dir!.getFileHandle(key, { create: true });
        const w = await fh.createWritable();
        await w.write(JSON.stringify(value));
        await w.close();
      },
      async get(key: string): Promise<unknown> {
        const fh = await this.dir!.getFileHandle(key);
        const f = await fh.getFile();
        return JSON.parse(await f.text());
      },
      async teardown(): Promise<void> {
        try { await rootDir.removeEntry(`bench-${name}`, { recursive: true }); } catch { /* ok */ }
      },
    });

    const opfsRoot = await navigator.storage.getDirectory();
    // FSA 相当:実アプリでは user が選んだ DirectoryHandle を使うが、adapter
    // 実装は opfs と共有(fs-directory-adapter)。ここでは OPFS 上の別ディレクトリ
    // handle を「FSA として」使い、コード経路の parity を確認する。
    const backends = [
      { impl: idb as { name: string; setup(): Promise<void>; put(k: string, v: unknown): Promise<void>; get(k: string): Promise<unknown>; teardown(): Promise<void> }, scales: [100, 1000, 5000] },
      { impl: makeFsBackend('opfs', opfsRoot), scales: [100, 1000, 5000] },
      { impl: makeFsBackend('fsa', opfsRoot), scales: [1000] },
    ];

    const primitives: { backend: string; scale: number; containerPutMs: number; containerGetMs: number; editResaveMs: number }[] = [];
    const assets: { backend: string; bulkPut100Ms: number; bulkGet100Ms: number }[] = [];

    for (const { impl, scales } of backends) {
      await impl.setup();
      for (const scale of scales) {
        const container = makeContainer(scale);
        const putTimes: number[] = [];
        const getTimes: number[] = [];
        const editTimes: number[] = [];
        for (let iter = 0; iter < 4; iter++) { // iter0 = warmup
          const t0 = performance.now();
          await impl.put('c', container);
          const t1 = performance.now();
          const loaded = await impl.get('c') as { entries: { body: string }[] };
          const t2 = performance.now();
          const first = loaded.entries[0];
          if (first) first.body = `edited ${iter} ` + first.body;
          const t3 = performance.now();
          await impl.put('c', loaded);
          const t4 = performance.now();
          if (iter > 0) {
            putTimes.push(t1 - t0);
            getTimes.push(t2 - t1);
            editTimes.push(t4 - t3);
          }
        }
        primitives.push({
          backend: impl.name,
          scale,
          containerPutMs: median(putTimes),
          containerGetMs: median(getTimes),
          editResaveMs: median(editTimes),
        });
      }
      // assets: 100 × 100KB 文字列(base64 相当)を per-key で書く/読む
      const assetData = 'A'.repeat(100 * 1024);
      const putTimes: number[] = [];
      const getTimes: number[] = [];
      for (let iter = 0; iter < 3; iter++) { // iter0 = warmup
        const t0 = performance.now();
        for (let i = 0; i < 100; i++) await impl.put(`asset-${i}`, assetData);
        const t1 = performance.now();
        for (let i = 0; i < 100; i++) await impl.get(`asset-${i}`);
        const t2 = performance.now();
        if (iter > 0) { putTimes.push(t1 - t0); getTimes.push(t2 - t1); }
      }
      assets.push({ backend: impl.name, bulkPut100Ms: median(putTimes), bulkGet100Ms: median(getTimes) });
      await impl.teardown();
    }
    return { primitives, assets };
  });
}

/** IDB に n-entry container を seed(アプリの実スキーマ、既定 container に設定)。 */
async function seedAppIdb(page: Page, n: number): Promise<void> {
  await page.evaluate(async (nEntries) => {
    // 注意:deleteDatabase はアプリが保持する接続に blocked されて後続 open が
    // 永久 pending になる(実測 10min timeout の原因)。smoke の
    // seedIdbContainer と同じく open + clear + put で seed する。
    const entries = [];
    for (let i = 0; i < nEntries; i++) {
      entries.push({
        lid: `e${i}`, title: `Entry ${i}`,
        body: `# Entry ${i}\n\nbody text `.padEnd(800, 'x '),
        archetype: 'text',
        created_at: '1970-01-01T00:00:00.000Z', updated_at: '1970-01-01T00:00:00.000Z',
      });
    }
    const cont = {
      meta: { container_id: 'bench-boot', title: 'boot bench', created_at: '1970-01-01T00:00:00.000Z', updated_at: '1970-01-01T00:00:00.000Z', schema_version: 1 },
      entries, relations: [], revisions: [], assets: {},
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2');
      req.onupgradeneeded = (): void => {
        const db = req.result;
        if (!db.objectStoreNames.contains('containers')) db.createObjectStore('containers');
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
      };
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, 'bench-boot');
        tx.objectStore('containers').put('bench-boot', '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, n);
}

async function measureBoot(page: Page): Promise<number> {
  await page.goto('/pkc2.html');
  // goto 直後は window.PKC 未設置の race があるため、canonical helper と同じく
  // 待ってから bootReady を await する。計測値は navigationStart 起点の
  // performance.now()(= ナビゲーション〜boot 完了、poll 粒度 ~50-200ms 込み)。
  await bootReady(page);
  return page.evaluate(() => performance.now());
}

test('storage backend benchmark — primitives + app boot (#904)', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/pkc2.html');
  await bootReady(page);

  // ── Part A: primitives ──
  const { primitives, assets } = await runPrimitiveBench(page);

  console.log('[bench] Part A done');

  // ── Part B: app boot(実 adapter 経路)──
  // 前回実行の残骸(OPFS 側 containers)を掃除して migration を決定的に。
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    for (const name of ['containers', 'assets']) {
      try { await root.removeEntry(name, { recursive: true }); } catch { /* absent */ }
    }
    localStorage.removeItem('pkc2.storageBackend');
  });
  const bootResults: { backend: string; bootMs: number[] }[] = [];
  for (const backend of ['idb', 'opfs'] as const) {
    await page.goto('/pkc2.html');
    await bootReady(page);
    await seedAppIdb(page, 5000);
    console.log(`[bench] Part B: ${backend} seeded`);
    await page.evaluate((b) => { localStorage.setItem('pkc2.storageBackend', b); }, backend);
    // opfs は初回 reload で IDB→OPFS migration が走る:1 回捨てる(idb も同条件で捨てる)
    await measureBoot(page);
    const times: number[] = [];
    for (let i = 0; i < 3; i++) times.push(await measureBoot(page));
    bootResults.push({ backend, bootMs: times });
    await page.evaluate(() => { localStorage.removeItem('pkc2.storageBackend'); });
  }

  // ── 出力 ──
  const summary = { primitives, assets, boot: bootResults, generatedBy: 'tests/bench/storage-backend.bench.ts' };
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, 'storage-backend.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== storage backend bench (#904) ===');
  console.log('primitives (median ms):');
  for (const r of primitives) {
    console.log(`  ${r.backend.padEnd(5)} n=${String(r.scale).padStart(4)}  put=${r.containerPutMs.toFixed(1)}  get=${r.containerGetMs.toFixed(1)}  editResave=${r.editResaveMs.toFixed(1)}`);
  }
  console.log('assets 100×100KB (median ms):');
  for (const a of assets) {
    console.log(`  ${a.backend.padEnd(5)} bulkPut=${a.bulkPut100Ms.toFixed(1)}  bulkGet=${a.bulkGet100Ms.toFixed(1)}`);
  }
  console.log('app boot c-5000 (ms, 3 runs):');
  for (const b of bootResults) {
    console.log(`  ${b.backend.padEnd(5)} ${b.bootMs.map((t) => t.toFixed(0)).join(' / ')}`);
  }

  // sanity assertion(ベンチとしての成立条件のみ、閾値は課さない)
  expect(primitives.length).toBeGreaterThanOrEqual(7);
  expect(assets.length).toBe(3);
  for (const r of primitives) {
    expect(r.containerPutMs).toBeGreaterThan(0);
    expect(r.containerGetMs).toBeGreaterThan(0);
  }
});
