/**
 * デスクトップ host 経由の SqliteRpc(L4、2026-07-27)。
 *
 * > 「Bun による webview を使用した単一 exe 版も併せてリリースしたい」
 * > (user 指示 2026-07-27)
 *
 * ## 何をしているか
 *
 * `SqliteContainerStore` は **`SqliteRpc` を注入で受ける**設計になっている
 * (worker への postMessage は実装の 1 つにすぎない)。exe 版ではその実装を
 * **host プロセスへの HTTP POST** に差し替えるだけでよい ── schema
 * (`sqlite-schema.ts` の DDL / 行マッパ / 参照 diff)も op 語彙
 * (`sqlite-rpc.ts`)も**一切 fork しない**。
 *
 * 🔴 fork しないことは Invariant 5(後方互換は双方向)の要請でもある。正本が
 * 2 つになると「ブラウザ版で書いたものを exe 版が読めない」が静かに起きる。
 *
 * ## ブラウザ版との違い(意図的に無いもの)
 *
 * - **idle terminate が要らない**: wasm リニアメモリを畳むための重い手段
 *   (worker terminate)は host には不要で、`db.close()` が即座に OS へ返す
 *   (実測 RSS 308.1 → 97.5MB)。`dispose()` は接続を捨てるだけ
 *
 * ## 安全側の設計
 *
 * - **host が居ないときは静かに null**。誤って通常のブラウザで有効化されても、
 *   検出に失敗して従来経路(IDB / OPFS)のまま動く
 * - **同一 origin からのみ**: host 側が `Origin` を検査する。ここでは
 *   `credentials: 'omit'` と相対 URL を使い、他 origin への漏れ道を作らない
 * - **短い timeout**: host が居ない環境で boot を待たせない
 */
import type { SqliteRpc, SqliteRequestBody } from './sqlite-rpc';

/** host が自分を名乗る endpoint(exe 側と対で決めた固定パス)。 */
export const HOST_PROBE_PATH = '/__pkc/host';
/** RPC の endpoint。 */
export const HOST_RPC_PATH = '/__pkc/storage';

export interface HostInfo {
  /** 常に 'pkc2-desktop'(他人の localhost サーバを誤検出しないための印)。 */
  product: string;
  /** host の実装版。将来 op 語彙が増えたときの互換判定に使う。 */
  version: string;
  /** DB の実ファイル位置(診断表示用)。 */
  dbPath?: string;
}

/** 検出の待ち時間。host が居ない環境で boot を止めないための上限。 */
const PROBE_TIMEOUT_MS = 400;

/**
 * 同一 origin に PKC2 デスクトップ host が居るか調べる。
 * 居なければ null(= 通常のブラウザとして振る舞う)。
 */
export async function detectDesktopHost(): Promise<HostInfo | null> {
  if (typeof fetch !== 'function' || typeof AbortController !== 'function') return null;
  // 🔴 http(s) 以外では**探しに行かない**。`file://` で probe すると
  //    `file:///__pkc/host` への fetch が CORS エラーとして console に出て、
  //    「何か壊れている」ように見える(2026-07-28 実測)。host は HTTP で
  //    しか名乗らないので、そもそも行く意味が無い。
  const proto = typeof location !== 'undefined' ? location.protocol : '';
  if (proto !== 'http:' && proto !== 'https:') return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(HOST_PROBE_PATH, {
      method: 'GET',
      credentials: 'omit',
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const info = (await res.json()) as HostInfo;
    // 🔴 他人の localhost サーバを掴まない(名乗りが一致したときだけ採用)。
    return info?.product === 'pkc2-desktop' ? info : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * host 経由の `SqliteRpc`。worker 版と**同じ op を同じ形で**投げる。
 *
 * 失敗は throw する(呼び元の `createSqliteBackend` が握って IDB へ落ちる)。
 * ここで握って undefined を返すと、**書けていないのに成功に見える**という
 * 最悪の形になる ── storage の失敗は必ず上へ伝える。
 */
export function createHostSqliteRpc(): SqliteRpc {
  let disposed = false;
  return {
    async call<T = unknown>(req: SqliteRequestBody): Promise<T> {
      if (disposed) throw new Error('host rpc is disposed');
      const res = await fetch(HOST_RPC_PATH, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        throw new Error(`host storage HTTP ${res.status}`);
      }
      const body = (await res.json()) as { ok: boolean; result?: unknown; error?: string };
      if (!body.ok) throw new Error(body.error ?? 'host storage failed');
      return body.result as T;
    },
    dispose(): void {
      // host は別プロセスで生き続ける(このページが閉じても DB は無事)。
      // ここでやることは「以後この client を使わせない」だけ。
      disposed = true;
    },
  };
}
