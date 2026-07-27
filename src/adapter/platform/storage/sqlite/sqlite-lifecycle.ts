/**
 * sqlite worker の**破棄 lifecycle**(L1、user 指示 2026-07-27)。
 *
 * > 「ゼロコピー、生成とライフサイクル後の速やかな破棄を徹底してください」
 * > 「使った後に破棄するようにできないか。連続で使われないなら、時間で破棄みたいな」
 *
 * worker の**生成手段を注入**にして、この制御ロジックだけを wasm 抜きで
 * test できるようにしてある(`sqlite-client.ts` が実 worker factory を渡す)。
 * ここが壊れると「保存の途中で worker を殺す」「畳んだまま復帰しない」
 * といった**データに触る事故**になるため、単体で pin する
 * (`tests/adapter/sqlite-rpc-lifecycle.test.ts`)。
 */
import type { SqliteInitResult, SqliteRequestBody, SqliteRpc } from './sqlite-rpc';

/** 注入される worker ハンドル(実体は postMessage RPC、test では fake)。 */
export interface WorkerLike {
  call<T = unknown>(req: SqliteRequestBody): Promise<T>;
  dispose(): void;
}

/**
 * 無操作がこの時間続いたら worker ごと畳む。
 *
 * 値の根拠: 再起動コストは SAHPool install + DDL + PRAGMA で実測 ~80-100ms。
 * 編集セッション中は 1 編集ごとに最低 1 回 RPC が走る(保存)ので、30 秒
 * 無操作は「手が止まっている」状態であり、次の操作に 100ms 乗っても体感に
 * 出ない。短すぎると連続編集の合間で畳んでしまい、再起動コストだけ払う。
 */
export const DEFAULT_IDLE_MS = 30_000;

/**
 * storage を変更する op。永続 VFS が無いときに**通してはいけない**もの。
 * 読みは(空を返すだけなので)通してよい ── 呼び元が「データが無い」と
 * 誤認するリスクはあるが、書込を通すと**実データが揮発 DB に流れて失われる**。
 */
const WRITE_OPS: ReadonlySet<string> = new Set([
  'saveFull', 'applyOps', 'setDefaultCid', 'deleteContainer', 'clearAll',
  'kvSet', 'kvDelete', 'assetMetaSet',
]);

export interface ManagedSqliteRpc extends SqliteRpc {
  /** 実行中でなければ即座に畳む(test / 明示要求用)。 */
  collapseNow(): Promise<void>;
  /** 計器: worker を起動した回数(初回 1 + 再生成)。 */
  restarts(): number;
  /** 計器: いま worker が生きているか。 */
  alive(): boolean;
}

export interface ManagedRpcOptions {
  idleMs?: number;
  factory: () => WorkerLike;
}

/**
 * 破棄 lifecycle 付き RPC。
 *
 * - 呼び出しのたびに worker の生存を保証し(無ければ生成 + init)、idle timer を張り直す
 * - idle が続いたら **close(shrink_memory → DB close → removeVfs)→ terminate**。
 *   wasm リニアメモリ・SQLite page cache・SAH handle が丸ごと OS へ返る
 * - **in-flight がある間は畳まない**(保存の途中で worker を殺さない)
 * - 再開は透過的:次の call が worker を作り直して init し、そのまま実行する。
 *   DB ファイルは OPFS 上に残るので状態は連続する(main 側の baseline は別管理)
 *
 * ⚠ `persistent=false`(SAHPool 不成立 = :memory: に落ちた)を観測したら
 * **二度と畳まない**。揮発 DB を閉じるとデータが消えるため。
 * (そもそも caller は不成立時に本 RPC を使わず IDB を継続するが、二重の防壁)
 */
export function createManagedRpc(dbName: string, options: ManagedRpcOptions): ManagedSqliteRpc {
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const factory = options.factory;
  let raw: WorkerLike | null = null;
  let ready: Promise<SqliteInitResult> | null = null;
  let inFlight = 0;
  let restartCount = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let collapsible = true;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function armTimer(): void {
    clearTimer();
    if (disposed || !collapsible || idleMs <= 0) return;
    timer = setTimeout(() => {
      void collapse();
    }, idleMs);
  }

  async function collapse(): Promise<void> {
    clearTimer();
    if (disposed || !raw || inFlight > 0 || !collapsible) return;
    const worker = raw;
    // 先に参照を落とす ── collapse 中に来た call が新しい worker を作れるように。
    // (この worker に後から乗ると、close 済みの DB を触ることになる)
    raw = null;
    ready = null;
    try {
      await worker.call({ op: 'close' });
    } catch {
      /* close 失敗でも terminate する(handle は worker 終了で解放される) */
    }
    worker.dispose();
  }

  function ensure(): Promise<SqliteInitResult> {
    if (!raw) {
      const worker = factory();
      raw = worker;
      restartCount++;
      // 🔴 **再起動では永続 VFS を必須にする**(2026-07-27、敵対的検証が検出)。
      //
      // 初回 boot は caller(createSqliteBackend)が `persistent === false` を
      // 見て IDB へ落ちるので安全だが、**畳んだ後の再起動にはその判定が
      // 無かった**。SAHPool を取れないまま :memory: が開くと、main 側に残った
      // baseline から**差分 op だけが空 DB へ飛び**、読みは null になる
      // ── 30 秒放置して再編集するだけで踏む。多重 tab でも同じ
      //(collapse は SAH lock を手放すので、畳んだ隙に他 tab が取りうる)。
      const isRestart = restartCount > 1;
      ready = worker
        .call<SqliteInitResult>({ op: 'init', dbName, requirePersistent: isRestart })
        .then((info) => {
          if (info && info.persistent === false) {
            // 初回のみ到達しうる。畳まない(揮発 DB を閉じるとデータが消える)。
            collapsible = false;
          }
          return info;
        })
        .catch((err: unknown) => {
          // ⚠ **失敗した worker と rejected promise を握ったままにしない**
          // (同じ検証が検出): `raw` が非 null のままだと以後の ensure() が
          // 同じ rejected promise を返し続け、call() は inFlight にも
          // armTimer にも到達しないので **二度と回復しない**。worker も
          // terminate されず wasm ごと居座る。参照を落として次回に賭ける。
          if (raw === worker) {
            raw = null;
            ready = null;
          }
          try {
            worker.dispose();
          } catch {
            /* 既に死んでいる */
          }
          throw err;
        });
    }
    return ready as Promise<SqliteInitResult>;
  }

  return {
    async call<T = unknown>(req: SqliteRequestBody): Promise<T> {
      if (disposed) throw new Error('sqlite rpc: disposed');
      clearTimer(); // 実行中は idle timer を止める
      // init は ensure が投げる ── 呼び出し側が init を明示指定してきた場合は
      // ensure の結果をそのまま返す(二重 init を worker へ送らない)。
      const info = await ensure();
      if (req.op === 'init') return info as unknown as T;
      // 🔴 揮発 DB(:memory:)へ書き込ませない。初回 boot で persistent=false を
      // 観測した場合、caller はこの RPC を捨てて IDB を継続する契約だが、
      // その前に走った呼び出しや、契約を知らない将来の caller を二重に守る。
      if (info && info.persistent === false && WRITE_OPS.has(req.op)) {
        throw new Error('sqlite rpc: 永続 VFS が無いので書込を拒否した(IDB を使うこと)');
      }
      const worker = raw;
      if (!worker) throw new Error('sqlite rpc: worker が失われた');
      inFlight++;
      try {
        return await worker.call<T>(req);
      } finally {
        inFlight--;
        if (inFlight === 0) armTimer();
      }
    },
    dispose(): void {
      disposed = true;
      clearTimer();
      raw?.dispose();
      raw = null;
      ready = null;
    },
    async collapseNow(): Promise<void> {
      await collapse();
    },
    restarts(): number {
      return restartCount;
    },
    alive(): boolean {
      return raw !== null;
    },
  };
}

/** test 専用の別名(実 worker を使わずロジックだけを検証する)。 */
export const __createManagedRpcForTest = createManagedRpc;
