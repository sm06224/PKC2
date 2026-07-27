/**
 * sqlite worker RPC の型語彙(P2)── worker / client / store / test が共有。
 *
 * 永続化 sqlite は worker 常駐が確定(設計 doc §8-1: `createSyncAccessHandle`
 * は worker 専用、2026-07-27 実機確認)。main thread 側は postMessage の
 * 薄い facade になるため、この protocol が層の境界そのもの。
 *
 * wasm を import しない型専用モジュール(vitest で fake RPC を書くときも
 * ここだけ import すればよい)。
 */
import type { ContainerRows, RowOp } from './sqlite-schema';

/** リクエスト本体(id は client が付ける)。 */
export type SqliteRequestBody =
  | {
      op: 'init';
      dbName: string;
      /**
       * 🔴 true のとき、SAHPool が取れなければ **:memory: へ落とさず throw する**。
       *
       * idle terminate からの**再起動**では必ず true を渡す(2026-07-27、
       * 常駐棚卸しの敵対的検証が検出したデータ消失経路)。初回 boot は
       * `createSqliteBackend` が `persistent === false` を見て IDB へ落とすので
       * 安全だが、**再起動経路にはその判定が無かった** ── 揮発 DB が開き、
       * main 側に残った baseline から差分 op だけが空 DB へ飛び、読みは null に
       * なる。多重 tab で SAH lock を取られた場合にも同じ経路を踏む
       * (collapse は lock を手放すので、畳んだ隙に他 tab が取りうる)。
       */
      requirePersistent?: boolean;
    }
  // 破棄 lifecycle(user 指示 2026-07-27「生成とライフサイクル後の速やかな破棄」):
  // close = DB と VFS を閉じ terminate 可能にする / shrinkMemory = 開いたまま解放
  | { op: 'close' }
  | { op: 'shrinkMemory' }
  | { op: 'probe' }
  | { op: 'probePersistence' }
  | { op: 'saveFull'; cid: string; rows: ContainerRows; setDefault: boolean }
  | { op: 'applyOps'; cid: string; ops: RowOp[]; setDefault: boolean }
  | { op: 'loadContainer'; cid: string; skipRevisions?: boolean }
  | { op: 'loadBodies'; cid: string; lids?: string[] }
  // P4a: revisions の COUNT / 部分読み(boot は行を運ばない)。
  | { op: 'revCounts'; cid: string }
  | { op: 'revsFor'; cid: string; entryLid: string }
  | { op: 'revsAll'; cid: string }
  // ゴミ箱 subset: 「active でない entry_lid の最新 revision」だけ。
  // getRestoreCandidates(常時 render 経路)を全量常駐なしで成立させる。
  | { op: 'revsTrashLatest'; cid: string }
  | { op: 'listContainers' }
  | { op: 'deleteContainer'; cid: string }
  | { op: 'clearAll' }
  | { op: 'getDefaultCid' }
  | { op: 'setDefaultCid'; cid: string }
  | { op: 'kvGet'; k: string }
  | { op: 'kvSet'; k: string; v: string }
  | { op: 'kvDelete'; k: string }
  | { op: 'kvList'; prefix: string }
  // P3: asset meta 索引を assets 表の行として読み書き(bytes は持たない)。
  | { op: 'assetMetaGet'; cid: string }
  | { op: 'assetMetaSet'; cid: string; rows: AssetMetaRow[] };

/** assets 表の 1 行(P3)。bytes は Blob storage 側 ── ここは meta のみ。 */
export interface AssetMetaRow {
  key: string;
  size: number;
  hash: string;
}

export type SqliteRequest = SqliteRequestBody & { id: number };

export type SqliteResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

/** init の結果。persistent=false は SAHPool 不成立(= :memory: fallback)。 */
export interface SqliteInitResult {
  persistent: boolean;
  vfs: 'sahpool' | 'memory';
  version: string;
  ms: number;
  /** SAHPool が失敗して memory に落ちたときの理由。 */
  error?: string;
}

export interface SqliteProbeResult {
  ok: boolean;
  version: string;
  ms: number;
  /** 実行コンテキスト(worker 常駐化後は 'worker' 固定)。 */
  context: 'worker';
  error?: string;
}

export interface SqlitePersistenceProbeResult {
  /** crossOriginIsolated(worker スコープの値)。 */
  coi: boolean;
  /** 'opfs' VFS(SAB 方式)が登録されたか。COI 必須なので通常 false。 */
  opfsVfsRegistered: boolean;
  /** SAHPool VFS の install + roundtrip(§8-1 の本命、worker で実行)。 */
  sahpool: { ok: boolean; ms: number; error?: string; roundTrip?: boolean };
  context: 'worker';
}

/**
 * client が store へ渡す呼び口。実体は worker への postMessage(production)
 * か、in-memory fake(vitest)。
 */
export interface SqliteRpc {
  call<T = unknown>(req: SqliteRequestBody): Promise<T>;
  /** worker を terminate する(速やかな破棄 ── user 指示 2026-07-27)。 */
  dispose(): void;
}
