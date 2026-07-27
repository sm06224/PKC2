/**
 * sqlite worker client(P2)── main thread 側の薄い呼び口。
 *
 * worker は `?worker&inline` で bundle.js に焼き込まれ、Blob URL から起動する
 * (実行時 fetch なし ── 単一 HTML 哲学と両立)。glue + wasm は worker chunk に
 * だけ存在し、main 側は本ファイルの数十行だけを負担する。
 *
 * 破棄(user 指示 2026-07-27「生成とライフサイクル後の速やかな破棄」):
 * `dispose()` は worker を terminate する。probe 系は使い捨て worker を
 * 起動し、結果を得たら必ず terminate する。
 */
import SqliteWorkerFactory from './sqlite-worker?worker&inline';
import type {
  SqliteInitResult,
  SqlitePersistenceProbeResult,
  SqliteProbeResult,
  SqliteRequestBody,
  SqliteResponse,
  SqliteRpc,
} from './sqlite-rpc';

export function createSqliteRpc(): SqliteRpc {
  const worker = new SqliteWorkerFactory();
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let disposed = false;

  worker.onmessage = (ev: MessageEvent) => {
    const res = ev.data as SqliteResponse;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    if (res.ok) p.resolve(res.result);
    else p.reject(new Error(res.error));
  };
  worker.onerror = (ev: ErrorEvent) => {
    // worker 自体の死(script error / OOM)。in-flight を全部 reject して
    // caller(store / boot fallback)に判断させる。
    const err = new Error(`sqlite worker error: ${ev.message || 'unknown'}`);
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  return {
    call<T = unknown>(req: SqliteRequestBody): Promise<T> {
      if (disposed) return Promise.reject(new Error('sqlite rpc: disposed'));
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
        worker.postMessage({ ...req, id });
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      const err = new Error('sqlite rpc: disposed');
      for (const p of pending.values()) p.reject(err);
      pending.clear();
      worker.terminate(); // 速やかな破棄
    },
  };
}

/** worker を起動して常駐 DB を open する。persistent=false は SAHPool 不成立。 */
export function initSqlite(rpc: SqliteRpc, dbName: string): Promise<SqliteInitResult> {
  return rpc.call<SqliteInitResult>({ op: 'init', dbName });
}

/**
 * 動作実証(P2 spike): worker 内 :memory: CRUD 往復。
 * `window.__pkc2SqliteProbe()` から実ブラウザで叩く(tests/bench/sqlite-spike.mjs)。
 * 使い捨て worker を起動し、必ず terminate する。
 */
export async function probeSqliteWasm(): Promise<SqliteProbeResult> {
  const rpc = createSqliteRpc();
  try {
    return await rpc.call<SqliteProbeResult>({ op: 'probe' });
  } catch (err) {
    return { ok: false, version: '', ms: 0, context: 'worker', error: String(err) };
  } finally {
    rpc.dispose();
  }
}

/**
 * §8-1 実機確認の worker 版: SAHPool の install + roundtrip を worker 内で
 * 実行する(main thread では "Missing required OPFS APIs" で不成立 ── 実測済み。
 * worker で成立することが P2 の成立条件そのもの)。
 */
export async function probeSqlitePersistence(): Promise<SqlitePersistenceProbeResult> {
  const rpc = createSqliteRpc();
  try {
    return await rpc.call<SqlitePersistenceProbeResult>({ op: 'probePersistence' });
  } catch (err) {
    return {
      coi: false,
      opfsVfsRegistered: false,
      sahpool: { ok: false, ms: 0, error: String(err) },
      context: 'worker',
    };
  } finally {
    rpc.dispose();
  }
}
