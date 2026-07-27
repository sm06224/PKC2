/** @vitest-environment happy-dom */
/**
 * L2(user 指示 2026-07-27「使った後に破棄。連続で使われないなら時間で破棄」)
 * ── idle 破棄レジストリの契約を pin する。
 *
 * ここが壊れると「畳まれない(常駐が減らない)」か「使用中に畳む(体感が
 * 落ちる)」のどちらかになる。計器(getIdleDisposeStats)もベンチが
 * 「本当に畳まれたか」を判定する根拠なので、あわせて pin する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SWEEP_MS,
  __resetIdleDisposables,
  disposeAllIdleNow,
  getIdleDisposeStats,
  registerIdleDisposable,
  unregisterIdleDisposable,
} from '../../src/adapter/platform/idle-dispose';

describe('idle 破棄レジストリ(L2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetIdleDisposables();
  });
  afterEach(() => {
    __resetIdleDisposables();
    vi.useRealTimers();
  });

  it('最後の touch から idleMs 経過で 1 回だけ dispose される', async () => {
    const dispose = vi.fn(() => true);
    const touch = registerIdleDisposable({ name: 'a', idleMs: 10_000, dispose });

    touch();
    await vi.advanceTimersByTimeAsync(9_000);
    expect(dispose).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(6_000);
    expect(dispose).toHaveBeenCalledTimes(1);

    // 再武装されていないので、さらに時間が経っても呼ばれない
    await vi.advanceTimersByTimeAsync(60_000);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('連続使用中は畳まない(touch のたびに idle 時間が延びる)', async () => {
    const dispose = vi.fn(() => true);
    const touch = registerIdleDisposable({ name: 'b', idleMs: 10_000, dispose });

    for (let i = 0; i < 5; i++) {
      touch();
      await vi.advanceTimersByTimeAsync(6_000); // idleMs より短い間隔で使い続ける
    }
    expect(dispose).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(12_000); // 手が止まった
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('畳んだ後に再び使えば、また畳まれる(再武装)', async () => {
    const dispose = vi.fn(() => true);
    const touch = registerIdleDisposable({ name: 'c', idleMs: 5_000, dispose });

    touch();
    await vi.advanceTimersByTimeAsync(11_000);
    expect(dispose).toHaveBeenCalledTimes(1);

    touch();
    await vi.advanceTimersByTimeAsync(11_000);
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('計器が破棄回数と武装状態を返す(ベンチが「畳まれたか」を判定できる)', async () => {
    const touch = registerIdleDisposable({ name: 'd', idleMs: 5_000, dispose: () => true });
    touch();
    expect(getIdleDisposeStats().find((s) => s.name === 'd')).toMatchObject({
      armed: true,
      disposeCount: 0,
    });
    await vi.advanceTimersByTimeAsync(11_000);
    expect(getIdleDisposeStats().find((s) => s.name === 'd')).toMatchObject({
      armed: false,
      disposeCount: 1,
    });
  });

  // ⚠ 破棄の粒度は走査間隔(SWEEP_MS = 5 秒)。idleMs が短くても、実際に
  //   畳まれるのは次の走査時。以下の test は必ず走査を跨ぐまで進める。
  it('dispose が false を返したら「解放していない」として数えない', async () => {
    const touch = registerIdleDisposable({ name: 'e', idleMs: 1_000, dispose: () => false });
    touch();
    await vi.advanceTimersByTimeAsync(SWEEP_MS + 1_000);
    const stat = getIdleDisposeStats().find((s) => s.name === 'e');
    expect(stat?.armed).toBe(false); // 判定は走った
    expect(stat?.disposeCount).toBe(0); // が、解放は無かったので数えない
  });

  it('dispose が throw しても他の登録を巻き添えにしない', async () => {
    const ok = vi.fn(() => true);
    const bad = registerIdleDisposable({
      name: 'bad',
      idleMs: 1_000,
      dispose: () => {
        throw new Error('boom');
      },
    });
    const good = registerIdleDisposable({ name: 'good', idleMs: 1_000, dispose: ok });
    bad();
    good();
    await vi.advanceTimersByTimeAsync(SWEEP_MS + 1_000);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('disposeAllIdleNow は武装中の全登録を即座に畳む(ベンチ計測用)', () => {
    const d1 = vi.fn(() => true);
    const d2 = vi.fn(() => true);
    registerIdleDisposable({ name: 'x', idleMs: 999_999, dispose: d1 })();
    registerIdleDisposable({ name: 'y', idleMs: 999_999, dispose: d2 })();
    disposeAllIdleNow();
    expect(d1).toHaveBeenCalledTimes(1);
    expect(d2).toHaveBeenCalledTimes(1);
  });

  it('同名の再登録は置き換え(二重登録しない)/ unregister で消える', async () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    registerIdleDisposable({ name: 'dup', idleMs: 1_000, dispose: first })();
    const touch2 = registerIdleDisposable({ name: 'dup', idleMs: 1_000, dispose: second });
    touch2();
    await vi.advanceTimersByTimeAsync(SWEEP_MS + 1_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(getIdleDisposeStats().filter((s) => s.name === 'dup')).toHaveLength(1);

    unregisterIdleDisposable('dup');
    expect(getIdleDisposeStats().find((s) => s.name === 'dup')).toBeUndefined();
  });
});
