/** @vitest-environment happy-dom */
/**
 * 補助 worker の idle terminate(B8、2026-07-27)。
 *
 * 添付処理 worker と画像最適化 worker は、**初回の操作で作られたあと
 * 二度と terminate されなかった**(terminate は test 専用 reset の中にしか
 * 無かった)。worker は独立した JS realm なので 1 個で数 MB を持つのに、
 * 添付も画像貼付も断続的な操作で、セッション中ずっと持ち続ける理由が無い。
 *
 * pin する不変条件:
 *  1. 使い終わって idle が続いたら terminate される
 *  2. **処理中は畳まない**(in-flight を殺すとファイルが消える)
 *  3. 畳んだ後の呼び出しは透過的に worker を作り直す
 *
 * 3 が無いと「畳んだら二度と動かない」= 機能停止に気付けない。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SWEEP_MS,
  __resetIdleDisposables,
  getIdleDisposeStats,
} from '../../src/adapter/platform/idle-dispose';

interface Sent {
  id: number;
  file?: File;
  kind?: string;
}

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  readonly sent: Sent[] = [];

  constructor(_url: string) {
    FakeWorker.instances.push(this);
  }

  postMessage(msg: Sent): void {
    this.sent.push(msg);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** worker からの完了応答を模す。 */
  reply(payload: Record<string, unknown>): void {
    this.onmessage?.({ data: payload } as MessageEvent);
  }
}

function installWorkerStub(): void {
  FakeWorker.instances.length = 0;
  vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker);
  // ⚠ URL を丸ごと差し替えない(コンストラクタを壊すと happy-dom の
  //    ナビゲーション経路が落ちる ── 2026-07-26 に踏んだ罠)。
  //    必要な静的メソッドだけ spy する。
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stub');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
}

describe('補助 worker の idle terminate(B8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetIdleDisposables();
    installWorkerStub();
  });
  afterEach(() => {
    __resetIdleDisposables();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('添付 worker: 完了 → idle 継続で terminate、次の呼び出しで作り直す', async () => {
    const mod = await import('../../src/adapter/ui/attach-worker-client');
    mod.__resetAttachWorkerForTest();
    FakeWorker.instances.length = 0;

    const file = new File(['x'], 'a.bin', { type: 'application/octet-stream' });
    const p = mod.processFileViaWorker(file);
    const w1 = FakeWorker.instances[0]!;
    expect(w1).toBeDefined();

    // ── 2. 処理中は畳まない ──
    // ⚠ 「畳まれなかった」だけでは弱い ── **武装していないから畳まれない**
    //    のと区別が付かない(実際、要求時 touch を外しても terminated は
    //    false のままで test が素通りした)。要求した時点で armed であること、
    //    そのうえで sweep が来ても dispose が**拒否**される(disposeCount が
    //    増えない)ことまで見る。
    const armedNow = getIdleDisposeStats().find((s) => s.name === 'attach-worker');
    expect(armedNow?.armed, '要求時に武装していない(idle 計測が始まらない)').toBe(true);
    await vi.advanceTimersByTimeAsync(60_000 + SWEEP_MS);
    expect(w1.terminated).toBe(false);
    expect(
      getIdleDisposeStats().find((s) => s.name === 'attach-worker')?.disposeCount,
    ).toBe(0);

    w1.reply({ id: w1.sent[0]!.id, ok: true, base64: 'eA==', hash: 'h', mime: 'application/octet-stream', size: 1 });
    await expect(p).resolves.toMatchObject({ hash: 'h' });

    // ── 1. 完了後、idle が続いたら畳む ──
    await vi.advanceTimersByTimeAsync(30_000 + SWEEP_MS * 2);
    expect(w1.terminated).toBe(true);

    // ── 3. 次の呼び出しで作り直す ──
    const p2 = mod.processFileViaWorker(file);
    const w2 = FakeWorker.instances[1]!;
    expect(w2).toBeDefined();
    expect(w2).not.toBe(w1);
    w2.reply({ id: w2.sent[0]!.id, ok: true, base64: 'eA==', hash: 'h2', mime: 'x', size: 1 });
    await expect(p2).resolves.toMatchObject({ hash: 'h2' });
  });

  it('画像最適化 worker: 完了 → idle 継続で terminate、次の呼び出しで作り直す', async () => {
    const mod = await import('../../src/adapter/ui/image-optimize/optimize-worker-client');
    mod.__resetImageOptimizeWorkerForTest();
    FakeWorker.instances.length = 0;

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const p = mod.hasAlphaChannelInWorker(file);
    const w1 = FakeWorker.instances[0]!;
    expect(w1).toBeDefined();

    expect(
      getIdleDisposeStats().find((s) => s.name === 'image-optimize-worker')?.armed,
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000 + SWEEP_MS);
    expect(w1.terminated).toBe(false); // 変換中は殺さない
    expect(
      getIdleDisposeStats().find((s) => s.name === 'image-optimize-worker')?.disposeCount,
    ).toBe(0);

    w1.reply({ id: w1.sent[0]!.id, ok: true, hasAlpha: true });
    await expect(p).resolves.toBe(true);

    await vi.advanceTimersByTimeAsync(30_000 + SWEEP_MS * 2);
    expect(w1.terminated).toBe(true);

    const p2 = mod.hasAlphaChannelInWorker(file);
    const w2 = FakeWorker.instances[1]!;
    expect(w2).toBeDefined();
    w2.reply({ id: w2.sent[0]!.id, ok: true, hasAlpha: false });
    await expect(p2).resolves.toBe(false);
  });
});
