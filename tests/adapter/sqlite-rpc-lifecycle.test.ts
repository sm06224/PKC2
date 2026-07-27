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

function makeFactory(opts: { persistent?: boolean; holdOp?: string } = {}) {
  const workers: FakeWorker[] = [];
  let releaseHeld: (() => void) | null = null;
  const factory = (): FakeWorker => {
    const log: Array<SqliteRequestBody['op']> = [];
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
          return Promise.resolve({
            persistent: opts.persistent !== false,
            vfs: opts.persistent === false ? 'memory' : 'sahpool',
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
