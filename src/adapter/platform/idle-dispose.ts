/**
 * idle 破棄レジストリ(L2)── 「使った後に、連続で使われないなら時間で破棄」。
 *
 * > 「使った後に破棄するようにできないか?というのもあればいい、連続で
 * >  使われないなら、時間で破棄みたいな」(user 指示 2026-07-27)
 * > 「ゼロコピー、生成とライフサイクル後の速やかな破棄を徹底してください」
 * >  (user 指示 2026-07-27、不可侵)
 *
 * 使い方: 使うたびに `touch()` を呼ぶ。最後の touch から `idleMs` 経過したら
 * `dispose()` が 1 回だけ走る。次に touch されたら再び武装する
 * (= 連続使用中は生かし、手が止まったら畳む)。
 *
 * 設計の要点:
 * - **タイマーは 1 本**(登録ごとに setTimeout を張らない ── リスナ/タイマーの
 *   増殖自体が常駐コストになる。stale-listener-prevention.md の規律)
 * - dispose は**冪等**であること(呼ばれても壊れない・二度呼ばれても安全)を
 *   登録側の責務とする。ここでは「disposed なら次の touch まで呼ばない」だけ保証
 * - **計器つき**: `getIdleDisposeStats()` が破棄回数と現在の状態を返す。
 *   ベンチ harness が「本当に畳まれたか」を実行時に確認できる
 *   (畳まれていない状態を「畳んだ後」として測る事故を防ぐ)
 */

export interface IdleDisposable {
  /** 識別子(計器の表示 / 重複登録の検出用)。 */
  name: string;
  /** 最後の使用からこの時間で破棄。 */
  idleMs: number;
  /**
   * 破棄本体。**冪等**であること。戻り値は「実際に何か解放したか」
   * (false なら計器上は no-op として数える)。
   */
  dispose: () => boolean | void;
}

interface Entry extends IdleDisposable {
  lastTouch: number;
  armed: boolean;
  disposeCount: number;
}

const entries = new Map<string, Entry>();
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * 走査間隔。個別 setTimeout を張らず、この 1 本で全登録を見る。
 *
 * ⚠ **これが破棄タイミングの粒度になる**: `idleMs` が 5 秒未満でも、実際に
 * 畳まれるのは次の走査時(最大 +5 秒)。実運用の idleMs は 30〜60 秒なので
 * 問題にならないが、test で短い idleMs を使うときは**走査を跨ぐまで時間を
 * 進める**必要がある(2026-07-27、この前提を外して test が落ちた)。
 */
export const SWEEP_MS = 5_000;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function sweep(): void {
  const t = now();
  let anyArmed = false;
  for (const e of entries.values()) {
    if (!e.armed) continue;
    if (t - e.lastTouch >= e.idleMs) {
      e.armed = false;
      try {
        const freed = e.dispose();
        if (freed !== false) e.disposeCount++;
      } catch (err) {
        console.warn(`[PKC2] idle dispose "${e.name}" が失敗:`, err);
      }
    } else {
      anyArmed = true;
    }
  }
  // 誰も武装していなければタイマーを止める(空回りを常駐させない)。
  if (!anyArmed && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function ensureTimer(): void {
  if (timer !== null) return;
  timer = setInterval(sweep, SWEEP_MS);
  // Node/test 環境で process を掴んだままにしない(vitest のハング防止)。
  (timer as unknown as { unref?: () => void }).unref?.();
}

/**
 * idle 破棄を登録し、「使った」を伝える `touch` を返す。
 * 同名の再登録は**置き換え**(HMR / 再 mount で二重登録しない)。
 */
export function registerIdleDisposable(spec: IdleDisposable): () => void {
  const prev = entries.get(spec.name);
  const entry: Entry = {
    ...spec,
    lastTouch: now(),
    armed: false,
    disposeCount: prev?.disposeCount ?? 0,
  };
  entries.set(spec.name, entry);
  return function touch(): void {
    entry.lastTouch = now();
    entry.armed = true;
    ensureTimer();
  };
}

/** 登録解除(feature の teardown 用)。 */
export function unregisterIdleDisposable(name: string): void {
  entries.delete(name);
}

/** 全登録を即座に破棄する(test / 明示要求 / ベンチ計測用)。 */
export function disposeAllIdleNow(): void {
  for (const e of entries.values()) {
    if (!e.armed) continue;
    e.armed = false;
    try {
      const freed = e.dispose();
      if (freed !== false) e.disposeCount++;
    } catch (err) {
      console.warn(`[PKC2] idle dispose "${e.name}" が失敗:`, err);
    }
  }
}

export interface IdleDisposeStat {
  name: string;
  idleMs: number;
  armed: boolean;
  disposeCount: number;
  idleForMs: number;
}

/** 計器: ベンチ harness / デバッグが「畳まれたか」を確認する窓口。 */
export function getIdleDisposeStats(): IdleDisposeStat[] {
  const t = now();
  return [...entries.values()].map((e) => ({
    name: e.name,
    idleMs: e.idleMs,
    armed: e.armed,
    disposeCount: e.disposeCount,
    idleForMs: Math.round(t - e.lastTouch),
  }));
}

/** test 専用: レジストリを空にする。 */
export function __resetIdleDisposables(): void {
  entries.clear();
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}
