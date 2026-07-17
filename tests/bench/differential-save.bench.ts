/**
 * 差分保存(`persistence.differential_save`、改善バッチ④ PR #912)の実測。
 * 既定 ON 判断の材料として、inline 形式(現行既定)と split 形式(差分保存)
 * の「編集 1 件あたりの保存コスト」と「load(boot)コスト」を規模別に比べる。
 *
 * storage-backend.bench.ts Part A と同じ方針:実 Chromium の実 IndexedDB 上で、
 * adapter / idb-store と同じ record 形状・同じ tx 構成を直接測る
 * (idb-adapter: 単一 readwrite tx に puts、prefix scan は
 * IDBKeyRange.bound(prefix, prefix+'￿') の getAllKeys+getAll 並行)。
 *
 * 測定項目 × 規模 {100, 1000, 5000 entries}(body ~800 chars、revisions =
 * entries/10):
 *   - inlineEditSave : 1 entry 変更 → container 全体を 1 record put(現行の save())
 *   - splitInitial   : OFF→ON 直後の全件書込み(per-entry/rev record + marker core)
 *   - splitEditSave  : 定常状態の差分保存(変更 1 entry + marker core + default key)
 *   - inlineLoad     : container record 1 get
 *   - splitLoad      : per-entry/rev prefix scan + marker 順序で再組立(boot 相当)
 *
 * 結果は bench-results/differential-save.json + console 表。閾値 assert はしない
 * (ベンチ成立条件のみ)。
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootReady } from '../smoke/_helpers/boot-ready';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, '..', '..', 'bench-results');

interface ScaleResult {
  scale: number;
  inlineEditSaveMs: number;
  splitInitialMs: number;
  splitEditSaveMs: number;
  inlineLoadMs: number;
  splitLoadMs: number;
}

async function runBench(page: Page): Promise<ScaleResult[]> {
  return page.evaluate(async () => {
    const median = (xs: number[]): number => {
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)] ?? 0;
    };

    interface BenchEntry {
      lid: string; title: string; body: string; archetype: string;
      created_at: string; updated_at: string;
    }
    interface BenchRev {
      id: string; entry_lid: string; title: string; body: string; saved_at: string;
    }
    const T = '1970-01-01T00:00:00.000Z';
    const makeData = (n: number): { entries: BenchEntry[]; revisions: BenchRev[] } => {
      const entries: BenchEntry[] = [];
      for (let i = 0; i < n; i++) {
        entries.push({
          lid: `e${i}`, title: `Entry ${i}`,
          body: `# Entry ${i}\n\nbody text `.padEnd(800, 'x '),
          archetype: 'text', created_at: T, updated_at: T,
        });
      }
      const revisions: BenchRev[] = [];
      for (let i = 0; i < Math.floor(n / 10); i++) {
        revisions.push({
          id: `r${i}`, entry_lid: `e${i}`, title: `Entry ${i}`,
          body: `old body `.padEnd(800, 'y '), saved_at: T,
        });
      }
      return { entries, revisions };
    };

    // idb-adapter と同じ DB 構成(store 名だけ bench 専用)
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('pkc2-diffbench');
      r.onsuccess = r.onerror = r.onblocked = (): void => res();
    });
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const req = indexedDB.open('pkc2-diffbench', 1);
      req.onupgradeneeded = (): void => { req.result.createObjectStore('containers'); };
      req.onsuccess = (): void => res(req.result);
      req.onerror = (): void => rej(req.error);
    });
    type Op = { kind: 'put'; key: string; value: unknown } | { kind: 'delete'; key: string };
    const applyBatch = (ops: Op[]): Promise<void> => new Promise((res, rej) => {
      const tx = db.transaction('containers', 'readwrite');
      const store = tx.objectStore('containers');
      for (const op of ops) {
        if (op.kind === 'put') store.put(op.value, op.key);
        else store.delete(op.key);
      }
      tx.oncomplete = (): void => res();
      tx.onerror = (): void => rej(tx.error);
    });
    const get = (key: string): Promise<unknown> => new Promise((res, rej) => {
      const rq = db.transaction('containers', 'readonly').objectStore('containers').get(key);
      rq.onsuccess = (): void => res(rq.result);
      rq.onerror = (): void => rej(rq.error);
    });
    const getAllByPrefix = (prefix: string): Promise<{ keys: string[]; values: unknown[] }> =>
      new Promise((res, rej) => {
        const tx = db.transaction('containers', 'readonly');
        const store = tx.objectStore('containers');
        const range = IDBKeyRange.bound(prefix, prefix + '￿', false, false);
        const kq = store.getAllKeys(range);
        const vq = store.getAll(range);
        tx.oncomplete = (): void => res({ keys: (kq.result as string[]).map(String), values: vq.result });
        tx.onerror = (): void => rej(tx.error);
      });
    const clear = (): Promise<void> => new Promise((res, rej) => {
      const tx = db.transaction('containers', 'readwrite');
      tx.objectStore('containers').clear();
      tx.oncomplete = (): void => res();
      tx.onerror = (): void => rej(tx.error);
    });

    // idb-store.ts と同じ key 規約 / record 形状
    const cid = 'diffbench';
    const ENTRY_P = `__entry__:${cid}:`;
    const REV_P = `__rev__:${cid}:`;
    const meta = { container_id: cid, title: 'diff bench', created_at: T, updated_at: T, schema_version: 1 };

    const results: {
      scale: number; inlineEditSaveMs: number; splitInitialMs: number;
      splitEditSaveMs: number; inlineLoadMs: number; splitLoadMs: number;
    }[] = [];

    for (const scale of [100, 1000, 5000]) {
      const { entries, revisions } = makeData(scale);

      const inlineEdit: number[] = [];
      const splitInit: number[] = [];
      const splitEdit: number[] = [];
      const inlineLoad: number[] = [];
      const splitLoad: number[] = [];

      for (let iter = 0; iter < 4; iter++) { // iter0 = warmup
        await clear();

        // ── inline 形式(現行 save()):編集 1 件 → 全体 1 record put ──
        // 編集保存は 5 連続測って median(直前の大量書込みの compaction
        // 影響を均す)。実アプリでも編集は debounce 越しに連続発生する。
        let t0 = 0; let t1 = 0;
        const inlineReps: number[] = [];
        for (let rep = 0; rep < 5; rep++) {
          const f: BenchEntry = entries[0]!;
          entries[0] = { ...f, body: `edited ${iter}-${rep} ${f.body.slice(0, 800)}` };
          const rec = { meta, entries, relations: [], revisions, assets: {} };
          t0 = performance.now();
          await applyBatch([
            { kind: 'put', key: cid, value: rec },
            { kind: 'put', key: '__default__', value: cid },
          ]);
          t1 = performance.now();
          inlineReps.push(t1 - t0);
        }
        if (iter > 0) inlineEdit.push(median(inlineReps));

        // inline load(boot 相当:record 1 get)
        t0 = performance.now();
        await get(cid);
        t1 = performance.now();
        if (iter > 0) inlineLoad.push(t1 - t0);

        // ── split 初回(OFF→ON の全件書込み。saveDiff fallback 経路)──
        const marker = {
          entryOrder: entries.map((e) => e.lid),
          revOrder: revisions.map((r) => r.id),
        };
        const core = { meta, entries: [], relations: [], revisions: [], assets: {}, __pkc_split__: marker };
        const fullOps: Op[] = [
          ...entries.map((e): Op => ({ kind: 'put', key: `${ENTRY_P}${e.lid}`, value: e })),
          ...revisions.map((r): Op => ({ kind: 'put', key: `${REV_P}${r.id}`, value: r })),
          { kind: 'put', key: cid, value: core },
          { kind: 'put', key: '__default__', value: cid },
        ];
        t0 = performance.now();
        await applyBatch(fullOps);
        t1 = performance.now();
        if (iter > 0) splitInit.push(t1 - t0);

        // 直前の大量書込み(LevelDB compaction)が定常測定へ漏れないよう
        // 少し settle させる。
        await new Promise((r) => setTimeout(r, 150));

        // ── split 定常(差分保存):変更 1 entry + marker core + default ──
        const splitReps: number[] = [];
        for (let rep = 0; rep < 5; rep++) {
          const e0: BenchEntry = entries[0]!;
          entries[0] = { ...e0, body: `edited-split ${iter}-${rep} ${e0.body.slice(0, 800)}` };
          t0 = performance.now();
          await applyBatch([
            { kind: 'put', key: `${ENTRY_P}${entries[0]!.lid}`, value: entries[0] },
            { kind: 'put', key: cid, value: core },
            { kind: 'put', key: '__default__', value: cid },
          ]);
          t1 = performance.now();
          splitReps.push(t1 - t0);
        }
        if (iter > 0) splitEdit.push(median(splitReps));

        // ── split load(boot 相当:core get → prefix scan 並行 → 順序復元)──
        t0 = performance.now();
        const rec = await get(cid) as { __pkc_split__: { entryOrder: string[]; revOrder: string[] } };
        const [ep, rp] = await Promise.all([getAllByPrefix(ENTRY_P), getAllByPrefix(REV_P)]);
        const byLid = new Map<string, unknown>();
        for (let i = 0; i < ep.keys.length; i++) byLid.set(ep.keys[i]!.slice(ENTRY_P.length), ep.values[i]);
        const loadedEntries: unknown[] = [];
        for (const lid of rec.__pkc_split__.entryOrder) {
          const e = byLid.get(lid);
          if (e) loadedEntries.push(e);
        }
        const byId = new Map<string, unknown>();
        for (let i = 0; i < rp.keys.length; i++) byId.set(rp.keys[i]!.slice(REV_P.length), rp.values[i]);
        const loadedRevs: unknown[] = [];
        for (const id of rec.__pkc_split__.revOrder) {
          const r = byId.get(id);
          if (r) loadedRevs.push(r);
        }
        t1 = performance.now();
        if (loadedEntries.length !== scale) throw new Error(`split load mismatch: ${loadedEntries.length}`);
        if (iter > 0) splitLoad.push(t1 - t0);
      }

      results.push({
        scale,
        inlineEditSaveMs: median(inlineEdit),
        splitInitialMs: median(splitInit),
        splitEditSaveMs: median(splitEdit),
        inlineLoadMs: median(inlineLoad),
        splitLoadMs: median(splitLoad),
      });
    }
    db.close();
    return results;
  });
}

test('differential save benchmark — inline vs split (#912 follow-up)', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/pkc2.html');
  await bootReady(page);

  const results = await runBench(page);

  const summary = { results, generatedBy: 'tests/bench/differential-save.bench.ts' };
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, 'differential-save.json'), JSON.stringify(summary, null, 2));

  console.log('\n=== differential save bench (#912 follow-up, median ms) ===');
  console.log('scale  inlineEditSave  splitEditSave  splitInitial  inlineLoad  splitLoad');
  for (const r of results) {
    console.log(
      `${String(r.scale).padStart(5)}  ${r.inlineEditSaveMs.toFixed(1).padStart(14)}  ${r.splitEditSaveMs.toFixed(1).padStart(13)}  ${r.splitInitialMs.toFixed(1).padStart(12)}  ${r.inlineLoadMs.toFixed(1).padStart(10)}  ${r.splitLoadMs.toFixed(1).padStart(9)}`,
    );
  }

  expect(results.length).toBe(3);
  for (const r of results) {
    expect(r.inlineEditSaveMs).toBeGreaterThan(0);
    expect(r.splitEditSaveMs).toBeGreaterThan(0);
    expect(r.splitLoadMs).toBeGreaterThan(0);
  }
});
