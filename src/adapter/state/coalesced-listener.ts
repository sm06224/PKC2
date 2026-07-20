/**
 * Render coalescing(#938 R11、refinement-research-2026-07 §3
 * 「render coalescing 不在(dispatch = 即 render)」)。
 *
 * dispatcher は dispatch ごとに state listener を同期実行するため、同一
 * tick 内の連射 dispatch(bulk restore の N 件 RESTORE_ENTRY、multi-select
 * の一括操作、boot 直後の RESTORE_* 連鎖など)は render を N 回重畳させて
 * いた。本 utility は「同一 microtask tick 内の通知を 1 回の実行に集約」
 * する wrapper を提供する。
 *
 * 設計:
 *   - 実行時に最新 state を読み直す前提(呼び出し側が
 *     `dispatcher.getState()` を run 内で読む)。中間 state は描画されず、
 *     最終 state だけが 1 回 render される。render-scope は任意の 2 state
 *     を diff できる(複数 bucket 同時変化は保守的に 'full')ため、
 *     集約された delta も正しく分類される
 *   - flag `perf.render_coalescing`(既定 OFF)。OFF では完全に従来どおり
 *     同期実行 — dispatch 直後に DOM を読む既存コード(action-binder の
 *     一部)の同期前提を壊さない。ON はオプトインで実運用検証してから
 *     昇格を判断する(#940 案 A と同じ導入手順)
 *   - dispatch → 状態通知(reducer / event listener)は従来どおり同期。
 *     遅延するのは「render subscriber の実行」だけ
 */

import { defineFlag } from '../../core/flags';

export const perfRenderCoalescingEnabled = defineFlag<boolean>(
  'perf.render_coalescing',
  false,
  {
    category: 'perf',
    description:
      'render coalescing(同一 tick 内の連射 dispatch を 1 回の render に集約)。OFF で従来どおり dispatch ごと同期 render',
  },
);

/**
 * state listener 用の coalescing wrapper。
 *
 * - `enabled()` が false → `run()` を即時同期実行(従来挙動)
 * - true → 同一 tick 内の複数通知を 1 つの microtask に集約して `run()`
 *
 * `run` は引数を取らない — 最新 state は run 内で読み直すこと(集約時に
 * 中間 state を掴まないための契約)。
 */
export function createCoalescedListener(
  run: () => void,
  enabled: () => boolean = perfRenderCoalescingEnabled,
): () => void {
  let pending = false;
  return () => {
    if (!enabled()) {
      // OFF: 同期実行。pending 中に OFF へ flip していた場合は積み残しの
      // microtask を no-op 化してから走る(二重 render を防ぐ)。
      pending = false;
      run();
      return;
    }
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      if (!pending) return;
      pending = false;
      run();
    });
  };
}
