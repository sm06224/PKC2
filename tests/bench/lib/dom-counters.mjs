/* eslint-disable */
/**
 * DOM 常駐の計器(B1、2026-07-27)。
 *
 * ## なぜ要るか
 *
 * 既存のハーネスは **`JSHeapUsedSize` しか読んでいなかった**。ところが DOM の
 * 常駐は JS heap にほとんど現れない ── Node / LayoutObject / ComputedStyle は
 * Blink 側(partition_alloc / blink_gc)に載り、JS heap には**参照だけ**が
 * 数十バイト積まれる。実測でも「partition_alloc 7.3MB の常駐が JS heap では
 * 1.1MB にしか見えない」ということが起きる。
 *
 * つまり **JS heap だけを見て「DOM は増えていない」と言うことはできない**。
 * 同じ形の誤りを 2026-07-27 に一度やっている(mermaid の常駐を JS heap だけで
 * 「増えない」と読み、allocator 内訳では +6.9MB だった)。
 * → メモリの主張は**最低 2 系統**。この module はその 2 系統目のうち、
 *   「何が何個残っているか」を数える側を担う。
 *
 * ## 読み方
 *
 * - `nodes`            : renderer が抱えている Node 総数。**画面から外れても
 *                        JS が掴んでいれば減らない** ── detached DOM の直接の指標
 * - `listeners`        : 生きている event listener 数。剥がし忘れはここに出る
 * - `documents`        : Document 数。子 window / iframe の解放漏れはここ
 * - `layoutObjects`    : LayoutObject 数(描画木の規模。仮想化の賞金はここに出る)
 * - `workers`          : 生きている worker(WorkerGlobalScopes)。idle terminate
 *                        (L1 / B8)が効いているかはここで直接わかる
 * - `jsHeapUsed`       : 従来の指標(比較用に残す ── **単独では結論にしない**)
 *
 * ## 使い方
 *
 *   import { attachDomCounters } from './lib/dom-counters.mjs';
 *   const counters = await attachDomCounters(ctx, page);
 *   const before = await counters.read();          // GC なし(そのままの水位)
 *   const after  = await counters.read({ gc: true }); // 強制 GC 後(回収可能分を除いた常駐)
 *   console.log(counters.format(before, after));
 *
 * ⚠ `gc: true` は **collectGarbage を 2 回**呼ぶ。1 回では detached 木の回収が
 *    間に合わないことがある(row-memo-heap.mjs で確認済)。
 * ⚠ 走行をまたいだ絶対値は比較しない。**同じハーネス内の前後**で見る。
 */

const METRIC_MAP = {
  Nodes: 'nodes',
  JSEventListeners: 'listeners',
  Documents: 'documents',
  LayoutObjects: 'layoutObjects',
  Frames: 'frames',
  WorkerGlobalScopes: 'workers',
  JSHeapUsedSize: 'jsHeapUsed',
};

export async function attachDomCounters(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.enable');

  async function read({ gc = false } = {}) {
    if (gc) {
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.collectGarbage');
      await page.waitForTimeout(250);
    }
    const { metrics } = await cdp.send('Performance.getMetrics');
    const out = { gc };
    for (const m of metrics) {
      const key = METRIC_MAP[m.name];
      if (key) out[key] = m.value;
    }
    return out;
  }

  return { cdp, read, format, formatOne };
}

const num = (n) => (n === undefined ? '—' : Math.round(n).toLocaleString('en-US'));
const mb = (n) => (n === undefined ? '—' : (n / 1048576).toFixed(1) + ' MB');

/** 1 点をそのまま出す。 */
export function formatOne(s, label = '') {
  return [
    `${label}nodes ${num(s.nodes)}`,
    `listeners ${num(s.listeners)}`,
    `documents ${num(s.documents)}`,
    `layout ${num(s.layoutObjects)}`,
    `workers ${num(s.workers)}`,
    `jsHeap ${mb(s.jsHeapUsed)}`,
  ].join(' / ');
}

/**
 * 2 点の差分。**向きと数**だけを出す(倍率は出さない ── 差し引きで出た値の
 * 倍率は信用しない、という規律)。
 */
export function format(before, after) {
  const line = (label, key, fmt = num) => {
    const b = before[key];
    const a = after[key];
    if (b === undefined || a === undefined) return `   ${label.padEnd(12)} —`;
    const d = a - b;
    const sign = d > 0 ? '+' : d < 0 ? '-' : '±';
    return `   ${label.padEnd(12)} ${fmt(b)} → ${fmt(a)}  (${sign}${fmt(Math.abs(d))})`;
  };
  return [
    line('nodes', 'nodes'),
    line('listeners', 'listeners'),
    line('documents', 'documents'),
    line('layoutObjects', 'layoutObjects'),
    line('workers', 'workers'),
    line('jsHeapUsed', 'jsHeapUsed', mb),
  ].join('\n');
}
