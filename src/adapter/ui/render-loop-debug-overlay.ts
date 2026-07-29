/**
 * `?pkc-debug=render-loop` — **再描画ループ**の診断 overlay(2026-07-29)。
 *
 * user 報告(2026-07-29)「ランチャーが暴走して使い物になりませんでした /
 * HTML をロードして一部表示して消えて、また表示されてを繰り返します」に対する
 * 観測点。**この症状はこちらの環境で再現できていない** ── 手元で再現しない
 * 報告には推測で直しに行かず観測点を渡す、が本リポジトリの規約
 * (`docs/development/debug-via-url-flag-protocol.md`)。
 *
 * ## 何を出すか
 *
 * 「暴走 = 無操作なのに描き続けている」なので、**入力が無い区間の毎秒回数**を
 * 出す。単なる回数では「重い」と「回っている」が区別できないため、
 * **最後の入力からの経過**を併記する。
 *
 * | 行 | 意味 | 正常 |
 * |---|---|---|
 * | render/s | `render()` の呼び出し | 無操作で 0 |
 * | dispatch/s | action の dispatch | 無操作で 0 |
 * | working-set publish | `SET_WORKING_SET_ASSETS` の発行 | 収束後は増えない |
 * | 常駐 asset 数 | `container.assets` のキー数 | **上下したら thrash** |
 * | ランチャー tile | 画面上のタイル数 | **上下したら再生成ループ** |
 * | 窓の描き替え | `BLOCK_WINDOW_PAINTED` | 無操作で 0 |
 * | 直近 action | 多い順 top 5 | ── |
 *
 * 🔴 **毎秒の値と累計を必ず併記する。** 毎秒だけだと、user が撮った
 * スクリーンショットが「たまたま静かだった 1 秒」を写しているのか
 * 「本当に止まっている」のか区別できない(自作の verify test が実際に
 * これで空振りした ── クリックの 1.2 秒後に読んで 0.0 を見ていた)。
 * 累計は起動からの総数なので、1 枚の画像で全体像が伝わる。
 *
 * 🔴 **狙いは犯人の名指し**である。常駐 asset 数が上下していれば
 * working-set の thrash(読んでは捨てるの往復)、タイル数だけが上下して
 * いれば描画側、どれも動かず render/s だけ高いなら外部からの dispatch。
 *
 * ⚠ 本 overlay 自身は 1 秒間隔の `setInterval` 1 本と DOM 更新だけで、
 *   計測対象を揺らさない(描画は overlay 内の `textContent` 差し替えのみ)。
 */

import type { Dispatcher } from '../state/dispatcher';
import { isDebugEnabled } from '../../runtime/debug-flags';
import { BLOCK_WINDOW_PAINTED } from './center-block-controller';

const REGION = 'render-loop-debug-overlay';

/** 無操作と見なすまでの猶予(ms)。これを超えたら「静止中」と表示する。 */
const IDLE_AFTER_MS = 1500;

interface Counters {
  renders: number;
  dispatches: number;
  publishes: number;
  paints: number;
  lastInputAt: number;
  actionCounts: Map<string, number>;
}

function makeCounters(now: number): Counters {
  return {
    renders: 0,
    dispatches: 0,
    publishes: 0,
    paints: 0,
    lastInputAt: now,
    actionCounts: new Map(),
  };
}

/** 上下しているかを見るための直近 N 秒のリング。 */
class Ring {
  private readonly values: number[] = [];

  constructor(private readonly size: number) {}

  push(v: number): void {
    this.values.push(v);
    if (this.values.length > this.size) this.values.shift();
  }

  /** `min〜max`(変化していなければ単一値)。 */
  describe(): string {
    if (this.values.length === 0) return '-';
    const min = Math.min(...this.values);
    const max = Math.max(...this.values);
    return min === max ? String(min) : `${min}〜${max}`;
  }

  /** 値が変わった回数。**0 でないなら振動している**。 */
  flips(): number {
    let n = 0;
    for (let i = 1; i < this.values.length; i += 1) {
      if (this.values[i] !== this.values[i - 1]) n += 1;
    }
    return n;
  }
}

function buildPanel(doc: Document): HTMLElement {
  const panel = doc.createElement('div');
  panel.setAttribute('data-pkc-debug', 'true');
  panel.setAttribute('data-pkc-region', REGION);
  panel.style.cssText = [
    'position:fixed', 'right:8px', 'bottom:8px', 'z-index:2147483000',
    // 🔴 **不透明にする** ── user はこの panel を撮って送るので、背後の
    //   文字が透けると読めない(半透明で撮ってみて実際に読めなかった)。
    'background:#101014', 'color:#e8e8ea', 'font:11px/1.5 monospace',
    'padding:8px 10px', 'border-radius:6px', 'min-width:280px',
    'box-shadow:0 2px 12px rgba(0,0,0,0.5)', 'white-space:pre',
  ].join(';');
  doc.body.appendChild(panel);
  return panel;
}

/**
 * `?pkc-debug=render-loop` が有効なら診断 overlay を出す。無効なら完全 no-op。
 *
 * @param onRender renderer 側から「描いた」を通知してもらうための登録口。
 *   renderer を書き換えずに済むよう、呼び出し側が hook を渡す。
 */
export function mountRenderLoopDebugOverlay(
  dispatcher: Dispatcher,
  root: HTMLElement,
  registerRenderHook: (hook: () => void) => void,
): void {
  if (!isDebugEnabled('render-loop')) return;
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  if (!view) return;

  const now = view.performance.now();
  const c = makeCounters(now);
  const assetRing = new Ring(8);
  const tileRing = new Ring(8);

  registerRenderHook(() => { c.renders += 1; });
  root.addEventListener(BLOCK_WINDOW_PAINTED, () => { c.paints += 1; }, true);

  // 実入力だけを「操作」と数える ── scroll は**ループの結果としても飛ぶ**ので
  // 入力に数えない(数えると暴走が「操作中」に見えて隠れる)。
  for (const ev of ['pointerdown', 'keydown', 'wheel'] as const) {
    doc.addEventListener(ev, () => { c.lastInputAt = view.performance.now(); }, true);
  }

  dispatcher.onEvent(() => { /* keep the subscription shape symmetric */ });
  const origDispatch = dispatcher.dispatch.bind(dispatcher);
  // dispatch を包む ── action 名の分布が「誰が回しているか」を直接指す。
  (dispatcher as { dispatch: typeof origDispatch }).dispatch = ((action) => {
    c.dispatches += 1;
    const type = (action as { type?: string }).type ?? '(unknown)';
    c.actionCounts.set(type, (c.actionCounts.get(type) ?? 0) + 1);
    if (type === 'SET_WORKING_SET_ASSETS') c.publishes += 1;
    return origDispatch(action);
  }) as typeof origDispatch;

  const panel = buildPanel(doc);
  let prev = makeCounters(now);
  let prevAt = now;

  view.setInterval(() => {
    const t = view.performance.now();
    const dt = Math.max(0.001, (t - prevAt) / 1000);
    const idleMs = t - c.lastInputAt;
    const idle = idleMs > IDLE_AFTER_MS;

    const rps = (c.renders - prev.renders) / dt;
    const dps = (c.dispatches - prev.dispatches) / dt;
    const pps = (c.paints - prev.paints) / dt;

    const state = dispatcher.getState();
    assetRing.push(Object.keys(state.container?.assets ?? {}).length);
    tileRing.push(root.querySelectorAll('[data-pkc-region="launcher-tile-wrap"]').length);

    const top = [...c.actionCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([k, v]) => `      ${k} ×${v}`).join('\n');

    // 🔴 判定は「無操作なのに動いている」でのみ出す。操作中に多いのは正常。
    const runaway = idle && (rps > 2 || dps > 2 || pps > 2);
    const thrash = assetRing.flips() > 2;
    const tileLoop = tileRing.flips() > 2;

    panel.textContent = [
      `pkc-debug=render-loop   ${idle ? `静止中(${Math.round(idleMs / 1000)}s)` : '操作中'}`,
      '                    毎秒 / 累計',
      `  render            ${rps.toFixed(1)} / ${c.renders}`,
      `  dispatch          ${dps.toFixed(1)} / ${c.dispatches}`,
      `  窓の描き替え       ${pps.toFixed(1)} / ${c.paints}`,
      `  working-set 発行   ${c.publishes}`,
      `  常駐 asset 数      ${assetRing.describe()}${thrash ? '  🔴 thrash' : ''}`,
      `  ランチャー tile    ${tileRing.describe()}${tileLoop ? '  🔴 振動' : ''}`,
      `  直近 action(多い順)`,
      top || '      (なし)',
      runaway
        ? '\n  🔴 無操作なのに回っています。この画面ごと共有してください。'
        : '',
    ].join('\n');

    prev = { ...c, actionCounts: c.actionCounts };
    prevAt = t;
  }, 1000);
}
