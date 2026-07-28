/**
 * 「今どの storage エンジンで動いているか」の一次情報(2026-07-28)。
 *
 * > 「wasm-sqlite で稼働してるかどうかわからんのやが?」(user 指摘 2026-07-28)
 *
 * flag で切り替わる storage backend は、**devtools で `__pkc2StorageInfo` を
 * 見ないと確認できなかった**。それは user から見れば「動いているかわからない」
 * であり、機能が入っていないのと大差ない ── だから UI に出す。ここはその
 * 表示に必要な事実を 1 か所に集める場所である。
 *
 * 置き場所が adapter/platform なのは、**決めるのが storage 層だから**
 * (renderer が backend を推測して表示すると、実態とズレたときに嘘をつく)。
 * 決めた側が事実を書き、UI はそれを読むだけにする。
 */

export type StorageEngineKind = 'idb' | 'wasm-sqlite' | 'desktop-host';

export interface StorageEngineInfo {
  kind: StorageEngineKind;
  /** sqlite の VFS。wasm は 'sahpool'(永続)/ 'memory'(揮発)、exe は 'native'。 */
  vfs?: string;
  /** sqlite のライブラリ版(例 '3.53.0')。**実際に動いた証拠**として出す。 */
  version?: string;
  /** 永続化が成立しているか(false = 揮発 = データが残らない)。 */
  persistent?: boolean;
  /** init にかかった時間(ms)。 */
  initMs?: number;
  /** 補足(exe なら DB の実ファイルパスなど)。 */
  detail?: string;
}

/** 既定は IDB(sqlite backend が成立しなかったときはここに落ちる)。 */
let current: StorageEngineInfo = { kind: 'idb' };

/** storage 層が「このエンジンで動いている」と確定したときに呼ぶ。 */
export function setStorageEngineInfo(info: StorageEngineInfo): void {
  current = info;
  // 計器(bench / roundtrip harness)からも読めるようにしておく。
  (globalThis as unknown as Record<string, unknown>).__pkc2StorageEngine = info;
}

/** UI / 診断が読む。 */
export function getStorageEngineInfo(): StorageEngineInfo {
  return current;
}

/** test 用リセット。 */
export function __resetStorageEngineInfoForTest(): void {
  current = { kind: 'idb' };
  delete (globalThis as unknown as Record<string, unknown>).__pkc2StorageEngine;
}

/**
 * 表示用の 1 行(日本語)。UI とデバッグレポートで同じ文言を使う
 * ── 2 か所で別々に組み立てると、片方だけ古くなる。
 */
export function describeStorageEngine(info: StorageEngineInfo = current): string {
  switch (info.kind) {
    case 'wasm-sqlite':
      return info.persistent
        ? `wasm-sqlite ${info.version ?? ''}(OPFS ${info.vfs ?? 'sahpool'}・永続)`.trim()
        : `wasm-sqlite ${info.version ?? ''}(${info.vfs ?? 'memory'}・**揮発**)`.trim();
    case 'desktop-host':
      return `デスクトップ host の native sqlite ${info.version ?? ''}`.trim();
    case 'idb':
    default:
      return 'IndexedDB(従来の保存先)';
  }
}
