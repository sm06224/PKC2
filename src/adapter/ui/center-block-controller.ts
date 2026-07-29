/**
 * center pane のブロック窓化 ── **指揮**(C3-c/C3-d、2026-07-28)。
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
 *
 * ## 🔴 畳んだ見出しは窓化と**同時に**扱わなければならない(C3-d)
 *
 * `applyHeadingFold` は毎回 `details.open = true` で作り直すので、窓を
 * 描き替えるたびに「畳んだのに開く」。窓化はスクロールで再描画を増やすので、
 * この既存の性質が**目に見える退行**になる。
 *
 * そして畳み状態を保つと、今度は**累積オフセットが嘘になる** ── 畳んだ
 * セクションは画面上 0px なのに、metrics は全ブロックぶんの高さを持ったまま。
 * 窓の index と画面が食い違い、例外も test failure も出ない。
 * よって「畳み状態の保存」と「隠れたブロックを高さ 0 として扱う」は
 * **必ずセットで**入れる。片方だけ入れるほうが壊れる。
 */
import {
  applyBlockMinHeight,
  applyBlockSpacers,
  elementsOfBlock,
  fillBlocks,
  measureVisibleBlockHeights,
  type BlockPlacement,
} from './center-block-dom';
import {
  computeBlockOutline,
  computeBlockWindow,
  cumulativeOffsets,
  hiddenBlocks,
  makeBlockMetrics,
  totalHeight,
  withHidden,
  withMeasured,
  CENTER_BLOCK_DEFAULT_ESTIMATE,
  CENTER_BLOCK_OVERSCAN,
  type BlockMetrics,
  type BlockOutline,
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
  /** ブロック配列の見出し構造(畳み範囲の算出に使う)。 */
  readonly outline: BlockOutline;
  /** 畳まれている見出しの block index。 */
  readonly collapsed: Set<number>;
  metrics: BlockMetrics;
  range: BlockWindowRange;
  placement: BlockPlacement;
  /** 描いた見出し要素 → block index(toggle からの逆引き)。 */
  headingIndex: Map<HTMLElement, number>;
}

type BlockHost = HTMLElement & { __pkcBlockCtx?: CenterBlockContext };
type BlockScroller = HTMLElement & { __pkcBlockCleanup?: () => void };

/** 窓化中の host に立てる印。`pending` = 指揮待ち、`on` = 指揮済み。 */
const MARK = 'data-pkc-block-window';

/**
 * 窓の内側だけを描く。**順序が命**(fold → 畳み状態の復元 → spacer)。
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

  // 畳まれたセクションの中身は**入れない**。見えないものに DOM を払う理由が無い
  // ── 開いたときに `onToggle` が描き直す。
  const slice = ctx.blocks
    .slice(range.start, range.end)
    .map((html, i) => (ctx.metrics.hidden.has(range.start + i) ? '' : html));

  ctx.placement = fillBlocks(host, slice);
  ctx.hydrate(host);
  restoreCollapsed(host, ctx, range);
  applyBlockSpacers(host, topPx, bottomPx);
  ctx.range = range;
  if (scroller && keepScrollTop !== null && scroller.scrollTop !== keepScrollTop) {
    scroller.scrollTop = keepScrollTop;
  }
}

/**
 * `applyHeadingFold` が作り直した `<details>` に畳み状態を戻す。
 *
 * ⚠ `open` を書き換えると `toggle` が**非同期に**飛ぶ。`onToggle` 側は
 *   「今の open と記録が同じなら何もしない」ので、往復しても収束する。
 */
function restoreCollapsed(
  host: BlockHost,
  ctx: CenterBlockContext,
  range: BlockWindowRange,
): void {
  ctx.headingIndex = new Map();
  for (let i = range.start; i < range.end; i += 1) {
    if ((ctx.outline.levels[i] ?? 0) === 0) continue;
    const el = elementsOfBlock(host, ctx.placement, i - range.start)[0];
    if (!el) continue;
    ctx.headingIndex.set(el, i);
    const details = el.closest('details.pkc-heading-fold') as HTMLDetailsElement | null;
    if (details) details.open = !ctx.collapsed.has(i);
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
    outline: computeBlockOutline(blocks),
    collapsed: new Set<number>(),
    metrics,
    range: { start: 0, end: 0 },
    placement: { elements: [] },
    headingIndex: new Map(),
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

    /** 見えているぶんの実測を取り込み、床を引き直す。 */
    const settle = (): void => {
      ctx.metrics = withMeasured(
        ctx.metrics,
        shift(measureVisibleBlockHeights(host, scroller, ctx.placement), ctx.range.start),
      );
      applyBlockMinHeight(host, totalHeight(ctx.metrics));
    };
    /** いまの scroll 位置に合う窓へ寄せる(同じなら何もしない)。 */
    const sync = (force: boolean): void => {
      settle();
      const want = computeBlockWindow({
        metrics: ctx.metrics,
        scrollTop: scroller.scrollTop,
        viewportHeight: scroller.clientHeight,
      });
      if (!force && want.start === ctx.range.start && want.end === ctx.range.end) return;
      paintWindow(host, ctx, want, scroller);
      settle();
    };
    sync(false);

    const onScroll = (): void => {
      if (!host.isConnected) {
        scroller.__pkcBlockCleanup?.();
        return;
      }
      sync(false);
    };
    // `toggle` は**バブルしない** ── capture で拾う。
    const onToggle = (ev: Event): void => {
      if (!host.isConnected) return;
      const details = ev.target as HTMLElement | null;
      if (!(details instanceof HTMLDetailsElement)) return;
      if (!details.classList.contains('pkc-heading-fold')) return;
      const heading = details.querySelector<HTMLElement>(':scope > summary > *');
      const index = heading ? ctx.headingIndex.get(heading) : undefined;
      if (index === undefined) return;
      const wantCollapsed = !details.open;
      if (wantCollapsed === ctx.collapsed.has(index)) return; // 変化なし(復元の往復)
      if (wantCollapsed) ctx.collapsed.add(index);
      else ctx.collapsed.delete(index);
      ctx.metrics = withHidden(ctx.metrics, hiddenBlocks(ctx.outline, ctx.collapsed));
      sync(true); // 高さが変わったので窓を必ず引き直す
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    host.addEventListener('toggle', onToggle, true);
    scroller.__pkcBlockCleanup = () => {
      scroller.removeEventListener('scroll', onScroll);
      host.removeEventListener('toggle', onToggle, true);
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
