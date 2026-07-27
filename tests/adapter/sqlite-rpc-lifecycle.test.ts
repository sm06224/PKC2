/** @vitest-environment happy-dom */
/**
 * L1(user 指示 2026-07-27「使った後に破棄するようにできないか。連続で
 * 使われないなら、時間で破棄みたいな」)── sqlite worker の破棄 lifecycle。
 *
 * `createManagedSqliteRpc` は worker を **?worker&inline** で生成するため
 * happy-dom では動かない。ここでは同じ制御ロジックを、注入した fake worker
 * factory で検証する(worker 生成だけを差し替え、idle 判定・in-flight ガード・
 * 透過再生成・close 順序といった**壊れると危険な部分**を pin する)。
 *
 * pin する不変条件:
 *  1. idle が続いたら close → terminate(順序が逆だと SAH handle が残る)
 *  2. **in-flight がある間は畳まない**(保存の途中で worker を殺さない)
 *  3. 畳んだ後の呼び出しは透過的に再生成 + init される
 *  4. persistent=false(揮発 DB)は**二度と畳まない**
 *  5. dispose 後の呼び出しは reject(生きた worker を作り直さない)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __createManagedRpcForTest,
  type WorkerLike,
} from '../../src/adapter/platform/storage/sqlite/sqlite-lifecycle';
import type { SqliteRequestBody } from '../../src/adapter/platform/storage/sqlite/sqlite-rpc';

interface FakeWorker extends WorkerLike {
  readonly log: Array<SqliteRequestBody['op']>;
  terminated: boolean;
}

function makeFactory(
  opts: {
    persistent?: boolean;
    holdOp?: string;
    /**
     * n 番目(1 始まり)の worker の init 応答を差し替える。
     * 「1 個目は永続 / 2 個目(= 再起動)は不成立」を作るために要る
     * ── これが無いと再起動時のデータ消失経路を test で再現できない
     * (2026-07-27、敵対的検証の指摘)。
     */
    initByIndex?: (n: number) => { persistent: boolean } | 'reject';
  } = {},
) {
  const workers: FakeWorker[] = [];
  let releaseHeld: (() => void) | null = null;
  const factory = (): FakeWorker => {
    const log: Array<SqliteRequestBody['op']> = [];
    const index = workers.length + 1;
    const w: FakeWorker = {
      log,
      terminated: false,
      call<T>(req: SqliteRequestBody): Promise<T> {
        log.push(req.op);
        if (opts.holdOp && req.op === opts.holdOp) {
          return new Promise<T>((resolve) => {
            releaseHeld = () => resolve(undefined as T);
          });
        }
        if (req.op === 'init') {
          const override = opts.initByIndex?.(index);
          if (override === 'reject') {
            return Promise.reject(new Error('永続 VFS を再取得できない'));
          }
          // 本番の worker は requirePersistent が true のとき :memory: へ
          // 落とさず throw する。fake もその契約を模す。
          const persistent = override
            ? override.persistent
            : opts.persistent !== false;
          if (!persistent && req.requirePersistent === true) {
            return Promise.reject(new Error('永続 VFS を再取得できない'));
          }
          return Promise.resolve({
            persistent,
            vfs: persistent ? 'sahpool' : 'memory',
            version: 'fake',
            ms: 1,
          } as unknown as T);
        }
        return Promise.resolve(undefined as T);
      },
      dispose(): void {
        w.terminated = true;
      },
    };
    workers.push(w);
    return w;
  };
  return { factory, workers, release: () => releaseHeld?.() };
}

describe('sqlite worker の破棄 lifecycle(L1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('idle が続いたら close → terminate の順で畳む', async () => {
    const { factory, workers } = makeFactory();
    const rpc = __createManagedRpcForTest('db', { idleMs: 1000, factory });

    await rpc.call({ op: 'getDefaultCid' });
    expect(rpc.alive()).toBe(true);
    expect(workers).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1100);
    expect(workers[0]!.log).toEqual(['init', 'getDefaultCid', 'close']);
    expect(workers[0]!.terminated).toBe(true);
    expect(rpc.alive()).toBe(false);
  });

  it('in-flight がある間は畳まない(保存の途中で worker を殺さない)', async () => {
    const { factory, workers, release } = makeFactory({ holdOp: 'applyOps' });
    const rpc = __createManagedRpcForTest('db', { idleMs: 500, factory });

    const pending = rpc.call({ op: 'applyOps', cid: 'c1', ops: [], setDefault: false });
    await vi.advanceTimersByTimeAsync(2000); // idle 時間を大きく超えて進める
    expect(workers[0]!.terminated).toBe(false);
    expect(workers[0]!.log).not.toContain('close');

    release();
    await pending;
    // 完了後は idle timer が張り直され、時間経過で畳まれる
    await vi.advanceTimersByTimeAsync(600);
    expect(workers[0]!.terminated).toBe(true);
  });

  it('畳んだ後の呼び出しは透過的に再生成 + init される', async () => {
    const { factory, workers } = makeFactory();
    const rpc = __createManagedRpcForTest('db', { idleMs: 100, factory });

    await rpc.call({ op: 'getDefaultCid' });
    await vi.advanceTimersByTimeAsync(200);
    expect(rpc.alive()).toBe(false);
    expect(rpc.restarts()).toBe(1);

    await rpc.call({ op: 'getDefaultCid' });
    expect(rpc.alive()).toBe(true);
    expect(rpc.restarts()).toBe(2);
    expect(workers).toHaveLength(2);
    expect(workers[1]!.log).toEqual(['init', 'getDefaultCid']); // init が先
  });

  it('揮発 DB(persistent=false)は二度と畳まない', async () => {
    const { factory, workers } = makeFactory({ persistent: false });
    const rpc = __createManagedRpcForTest('db', { idleMs: 100, factory });

    await rpc.call({ op: 'getDefaultCid' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(workers[0]!.terminated).toBe(false);
    expect(rpc.alive()).toBe(true);
  });

  // ── 🔴 データ消失経路の pin(2026-07-27、常駐棚卸しの敵対的検証が検出)──

  it('再起動で永続 VFS を取れないとき、書込を揮発 DB へ通さず reject する', async () => {
    // 1 個目は永続、2 個目(再起動)は不成立 ── 実環境では多重 tab に
    // SAH lock を取られた場合などに起きる。
    const { factory, workers } = makeFactory({
      initByIndex: (n) => (n === 1 ? { persistent: true } : { persistent: false }),
    });
    const rpc = __createManagedRpcForTest('db', { idleMs: 100, factory });

    await rpc.call({ op: 'applyOps', cid: 'c1', ops: [], setDefault: false });
    await vi.advanceTimersByTimeAsync(300);
    expect(rpc.alive()).toBe(false); // 畳まれた

    // 再起動 ── 永続 VFS が取れないので **書込は通らない**
    await expect(
      rpc.call({ op: 'applyOps', cid: 'c1', ops: [], setDefault: false }),
    ).rejects.toThrow(/永続 VFS/);
    // 2 個目の worker には applyOps が 1 度も届いていない
    expect(workers[1]!.log).not.toContain('applyOps');
  });

  it('init が reject しても詰まらない ── 次の呼び出しで作り直し、落ちた worker は terminate する', async () => {
    let failNext = true;
    const { factory, workers } = makeFactory({
      initByIndex: () => (failNext ? 'reject' : { persistent: true }),
    });
    const rpc = __createManagedRpcForTest('db', { idleMs: 1_000, factory });

    await expect(rpc.call({ op: 'getDefaultCid' })).rejects.toThrow();
    // 落ちた worker は握らずに terminate されている(wasm ごと居座らせない)
    expect(workers[0]!.terminated).toBe(true);
    expect(rpc.alive()).toBe(false);

    // 次の呼び出しは**新しい worker**を作る(rejected promise を返し続けない)
    failNext = false;
    await expect(rpc.call({ op: 'getDefaultCid' })).resolves.toBeUndefined();
    expect(workers).toHaveLength(2);
    expect(rpc.restarts()).toBe(2);
  });

  it('初回から永続でないときも書込は拒否する(caller の IDB fallback の二重防壁)', async () => {
    const { factory, workers } = makeFactory({ persistent: false });
    const rpc = __createManagedRpcForTest('db', { idleMs: 1_000, factory });
    await expect(
      rpc.call({ op: 'saveFull', cid: 'c1', rows: {} as never, setDefault: true }),
    ).rejects.toThrow(/永続 VFS/);
    // 読みは通す(空を返すだけで、データは失われない)
    await expect(rpc.call({ op: 'getDefaultCid' })).resolves.toBeUndefined();
    expect(workers[0]!.log).toContain('getDefaultCid');
    expect(workers[0]!.log).not.toContain('saveFull');
  });

  it('dispose 後の呼び出しは reject し、worker を作り直さない', async () => {
    const { factory, workers } = makeFactory();
    const rpc = __createManagedRpcForTest('db', { idleMs: 1000, factory });
    await rpc.call({ op: 'getDefaultCid' });
    rpc.dispose();
    expect(workers[0]!.terminated).toBe(true);
    await expect(rpc.call({ op: 'getDefaultCid' })).rejects.toThrow(/disposed/);
    expect(workers).toHaveLength(1);
  });
});
