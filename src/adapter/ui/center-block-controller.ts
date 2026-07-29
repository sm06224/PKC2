/**
 * center pane のブロック窓化 ── **指揮**(C3-c、2026-07-28)。
 *
 * C3-a(純粋計算)と C3-b(DOM)を繋いで、実際に「一部だけ入れる」を成立させる。
 * サイドバー窓化の `finalizeSidebarWindow`(renderer.ts)と同じ位置づけ。
 *
 * ## なぜ presenter だけでは足りないか
 *
 * `renderBody()` が返す要素は**まだ DOM に繋がっていない**。窓を決めるには
 * scroller の高さと現在の `scrollTop` が要る ── どちらも attach 後にしか
 * 分からない。よって 2 段構えにする:
 *
 *   1. presenter: **控えめな初回窓**(先頭から数画面ぶん)を入れて
 *      `data-pkc-block-window="pending"` を立てる
 *   2. renderer: attach 後に `finalizeCenterBlockWindows(root)` を呼び、
 *      実測 → 窓を確定 → scroll 追従を張る
 *
 * ## 🔴 窓化されないまま放置されたら「本文が切れる」
 *
 * presenter の戻り値は center pane だけでなく **detached panel**
 * (`.pkc-detached-content`)にも入る。もし指揮側が来ない場所に置かれたら、
 * 初回窓のぶんしか表示されない = **静かに本文が消える**。
 * そこで rAF で「まだ pending なら全部入れ直す」保険を張る。
 * 指揮は render() の同期末尾で走るので、正常時は必ず保険より先に claim する。
 *
 * ## 🔴 fold との順序(C3-c で設計変更)
 *
 * `applyHeadingFold` は「見出し以外の top-level 子を直前の `<details>` へ移す」
 * ので、**spacer を先に置くとセクションの内側へ吸い込まれる**。順序は
 * `fillBlocks` → `hydrate`(fold 込み) → `applyBlockSpacers` で固定。
 * 詳細は `center-block-dom.ts` の doc を参照。
 */
import {
  applyBlockMinHeight,
  applyBlockSpacers,
  fillBlocks,
  measureVisibleBlockHeights,
  type BlockPlacement,
} from './center-block-dom';
import {
  computeBlockWindow,
  cumulativeOffsets,
  makeBlockMetrics,
  totalHeight,
  withMeasured,
  CENTER_BLOCK_DEFAULT_ESTIMATE,
  CENTER_BLOCK_OVERSCAN,
  type BlockMetrics,
  type BlockWindowRange,
} from './center-block-window';

/**
 * attach 前に使う viewport の仮値(px)。
 *
 * 大きめに取る ── 小さすぎると「初回窓が足りず、指揮が来るまで白い」に
 * なるが、大きすぎても「少し余分に入れる」だけで壊れない。**安全側は大きい方**。
 */
const INITIAL_VIEWPORT_GUESS = 1200;

interface CenterBlockContext {
  readonly blocks: readonly string[];
  /** 挿入後に走らせる後処理(transclusion / card / mermaid / ✎ / fold)。 */
  readonly hydrate: (host: HTMLElement) => void;
  metrics: BlockMetrics;
  range: BlockWindowRange;
  placement: BlockPlacement;
}

type BlockHost = HTMLElement & { __pkcBlockCtx?: CenterBlockContext };
type BlockScroller = HTMLElement & { __pkcBlockCleanup?: () => void };

/** 窓化中の host に立てる印。`pending` = 指揮待ち、`on` = 指揮済み。 */
const MARK = 'data-pkc-block-window';

/**
 * 窓の内側だけを描く。**順序が命**(fold → spacer)。
 *
 * `min-height` は呼び出し側が先に敷いてある前提 ── `fillBlocks` が中身を
 * 一度空にする瞬間に scroll 範囲が潰れて `scrollTop` がクランプされるのを防ぐ。
 */
function paintWindow(
  host: BlockHost,
  ctx: CenterBlockContext,
  range: BlockWindowRange,
  scroller: HTMLElement | null,
): void {
  const keepScrollTop = scroller?.scrollTop ?? null;
  const offsets = cumulativeOffsets(ctx.metrics);
  const topPx = offsets[range.start] ?? 0;
  const bottomPx = (offsets[ctx.metrics.count] ?? 0) - (offsets[range.end] ?? 0);

  ctx.placement = fillBlocks(host, ctx.blocks.slice(range.start, range.end));
  ctx.hydrate(host);
  applyBlockSpacers(host, topPx, bottomPx);
  ctx.range = range;
  if (scroller && keepScrollTop !== null && scroller.scrollTop !== keepScrollTop) {
    scroller.scrollTop = keepScrollTop;
  }
}

/** 窓化をやめて全ブロックを入れ直す(保険 / 発動条件を満たさない場合)。 */
function paintAll(host: BlockHost, ctx: CenterBlockContext): void {
  fillBlocks(host, ctx.blocks);
  ctx.hydrate(host);
  applyBlockMinHeight(host, null);
  host.removeAttribute(MARK);
  host.__pkcBlockCtx = undefined;
}

/**
 * presenter から呼ぶ。控えめな初回窓を入れて指揮を待つ。
 *
 * @param blocks  トップレベルブロックごとの HTML
 * @param hydrate 挿入後の後処理(**fold を含む**)
 */
export function registerCenterBlockHost(
  host: HTMLElement,
  blocks: readonly string[],
  hydrate: (host: HTMLElement) => void,
): void {
  const metrics = makeBlockMetrics(blocks.length);
  const ctx: CenterBlockContext = {
    blocks,
    hydrate,
    metrics,
    range: { start: 0, end: 0 },
    placement: { elements: [] },
  };
  (host as BlockHost).__pkcBlockCtx = ctx;
  host.setAttribute(MARK, 'pending');
  applyBlockMinHeight(host, totalHeight(metrics));

  // 初回は「先頭から仮 viewport ぶん + overscan」。scroll 位置は指揮側が直す。
  const guess = Math.ceil(INITIAL_VIEWPORT_GUESS / CENTER_BLOCK_DEFAULT_ESTIMATE)
    + CENTER_BLOCK_OVERSCAN;
  paintWindow(host as BlockHost, ctx, { start: 0, end: Math.min(blocks.length, guess) }, null);

  // 🔴 保険:指揮が来ない場所(detached panel など)に置かれたら全部入れ直す。
  const raf = host.ownerDocument?.defaultView?.requestAnimationFrame;
  if (raf) {
    raf(() => {
      if (host.getAttribute(MARK) !== 'pending') return;
      paintAll(host as BlockHost, ctx);
    });
  }
}

/** host の scroll 祖先を探す。見つからなければ null(= 窓化しない)。 */
function findScroller(host: HTMLElement): HTMLElement | null {
  const view = host.ownerDocument?.defaultView;
  let el: HTMLElement | null = host.parentElement;
  while (el) {
    if (el.classList.contains('pkc-center-content')
      || el.classList.contains('pkc-detached-content')) {
      return el.clientHeight > 0 ? el : null;
    }
    if (view) {
      const overflowY = view.getComputedStyle(el).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.clientHeight > 0) return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * attach 後の窓化確定。`render()` の末尾から 1 回だけ呼ぶ。
 *
 * 発動条件(scroller が見つかり、高さが測れる)を満たさなければ**全部入れ直す**
 * ── 中途半端な窓のまま放置しない。happy-dom は clientHeight が 0 なので
 * 構造的にここで全件描画へ落ち、既存 test は旧経路のまま守られる。
 */
export function finalizeCenterBlockWindows(root: HTMLElement): void {
  const hosts = root.querySelectorAll<HTMLElement>(`[${MARK}]`);
  for (const el of Array.from(hosts)) {
    const host = el as BlockHost;
    const ctx = host.__pkcBlockCtx;
    if (!ctx) {
      host.removeAttribute(MARK);
      continue;
    }
    const scroller = findScroller(host) as BlockScroller | null;
    if (!scroller) {
      paintAll(host, ctx);
      continue;
    }
    // scroller は render をまたいで生き残る ── listener は 1 本に保つ。
    scroller.__pkcBlockCleanup?.();
    scroller.__pkcBlockCleanup = undefined;
    host.setAttribute(MARK, 'on');

    const settle = (): void => {
      ctx.metrics = withMeasured(
        ctx.metrics,
        shift(measureVisibleBlockHeights(host, scroller, ctx.placement), ctx.range.start),
      );
      applyBlockMinHeight(host, totalHeight(ctx.metrics));
    };
    settle();

    const next = computeBlockWindow({
      metrics: ctx.metrics,
      scrollTop: scroller.scrollTop,
      viewportHeight: scroller.clientHeight,
    });
    if (next.start !== ctx.range.start || next.end !== ctx.range.end) {
      paintWindow(host, ctx, next, scroller);
      settle();
    }

    const onScroll = (): void => {
      if (!host.isConnected) {
        scroller.__pkcBlockCleanup?.();
        return;
      }
      settle();
      const want = computeBlockWindow({
        metrics: ctx.metrics,
        scrollTop: scroller.scrollTop,
        viewportHeight: scroller.clientHeight,
      });
      if (want.start === ctx.range.start && want.end === ctx.range.end) return;
      paintWindow(host, ctx, want, scroller);
      settle();
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.__pkcBlockCleanup = () => {
      scroller.removeEventListener('scroll', onScroll);
      scroller.__pkcBlockCleanup = undefined;
    };
  }
}

/** 窓ローカルの index を全体の index へ寄せる。 */
function shift(measured: ReadonlyMap<number, number>, offset: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const [index, height] of measured) out.set(index + offset, height);
  return out;
}
