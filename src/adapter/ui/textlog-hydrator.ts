import type { Entry } from '../../core/model/record';
import type { LogArticle } from '../../features/textlog/textlog-doc';
import { isLogSelected } from './textlog-selection';
import { defineFlag } from '../flags';

/**
 * Live getter — number of log articles rendered eagerly on initial
 * mount before the IntersectionObserver kicks in. 8 is the
 * historical default (FI-03 textlog-image-perf v1). Tunable via
 * Flags; called fresh each time the renderer assembles a textlog
 * doc so SET_FLAG / URL override take effect without a reload.
 */
export const initialRenderArticleCount = defineFlag<number>(
  'textlog.staged_render.initial_count',
  8,
  {
    range: [1, 64],
    category: 'perf',
    description:
      'TEXTLOG initial-render の eager article 数。大きいほど初期 paint コストが上がるが scroll-trigger の遅延が減る',
    tier: 0,
  },
);

/**
 * Live getter — number of articles to keep "ready" beyond the
 * visible window so a fast scroll lands on already-hydrated
 * content. 4 is the historical default.
 */
export const lookaheadArticleCount = defineFlag<number>(
  'textlog.staged_render.lookahead',
  4,
  {
    range: [0, 32],
    category: 'perf',
    description:
      'TEXTLOG staged render の先読み件数。viewport 外で hydrate を進める数',
    tier: 0,
  },
);

/** @deprecated 2026-05-04: use `initialRenderArticleCount()` for runtime mutability. */
export const INITIAL_RENDER_ARTICLE_COUNT = 8;
/** @deprecated 2026-05-04: use `lookaheadArticleCount()` for runtime mutability. */
export const LOOKAHEAD_ARTICLE_COUNT = 4;

/**
 * Live getter — TEXTLOG placeholder min-height (CSS px). Sets a
 * conservative space reserve for unhydrated articles so the page
 * keeps its scroll height while staged hydration progresses.
 */
const placeholderMinHeightPx = defineFlag<number>(
  'textlog.placeholder.min_height_px',
  160,
  {
    range: [16, 1024],
    category: 'perf',
    description: 'TEXTLOG placeholder の最小高さ (CSS px)',
    tier: 0,
  },
);
const IO_ROOT_MARGIN = '400px 0px';
// user 報告 2026-06-13「センターペインのスクロールが空回りする(スクロール
// バーは動くのに実際のスクロールがしない)」: hydration の `replaceWith` は
// placeholder(min-height 160px)と実体の高さ差を生む。これが**アクティブ
// スクロール中**に起きると、ブラウザの scroll anchoring が高さ差分を
// scrollTop 補正で打ち消し続ける = つまみだけ動いて視界が進まない。
// 対策: スクロール中は hydrate をキューに退避し、静定後に flush する
// (静止中の差し替えなら anchoring はむしろ読書位置を守る側に働く)。
const SCROLL_SETTLE_MS = 160;

export interface HydratorContext {
  lid: string;
  log: LogArticle;
  assets: Record<string, string> | undefined;
  mimeByKey: Record<string, string> | undefined;
  nameByKey: Record<string, string> | undefined;
  entries: Entry[] | undefined;
  selecting: boolean;
  /**
   * Current host container id — propagated to the markdown renderer
   * and to the Slice 5.0 card hydrator so cross-container detection
   * works for cards that lazy-hydrate from a textlog placeholder.
   * Optional for back-compat with callers that have not been wired
   * yet; treated as `''` (every recognised pkc:// becomes external).
   */
  currentContainerId?: string;
}

type ArticleRenderer = (
  lid: string,
  log: LogArticle,
  assets?: Record<string, string>,
  mimeByKey?: Record<string, string>,
  nameByKey?: Record<string, string>,
  entries?: Entry[],
  selecting?: boolean,
  currentContainerId?: string,
) => HTMLElement;

export function renderLogArticlePlaceholder(
  lid: string,
  log: LogArticle,
  formatTimestamp: (ts: string) => string,
  selecting = false,
): HTMLElement {
  const article = document.createElement('article');
  article.className = 'pkc-textlog-log pkc-textlog-log-pending';
  article.id = `log-${log.id}`;
  article.setAttribute('data-pkc-log-id', log.id);
  article.setAttribute('data-pkc-lid', lid);
  article.setAttribute('data-pkc-hydrated', 'false');
  if (log.flags.includes('important')) {
    article.setAttribute('data-pkc-log-important', 'true');
  }
  if (selecting && isLogSelected(log.id)) {
    article.setAttribute('data-pkc-log-selected', 'true');
  }

  const header = document.createElement('header');
  header.className = 'pkc-textlog-log-header';

  // user bug 2026-05-27 perf hotfix:選択モード toggle 時の center pane
  // 全体 re-render を避けるため、placeholder + article に checkbox markup
  // を **常に** 含める(visibility は CSS の `[data-pkc-textlog-selecting]`
  // attribute selector で制御)。これで BEGIN_TEXTLOG_SELECTION dispatch は
  // 数千件 placeholder の再構築を triggers せず、container 1 attribute toggle
  // で済む。`selecting` 引数は initial render 時点の `data-pkc-log-selected`
  // 整合のためのみ使用、checkbox markup 自体は always 出力。
  const selectLabel = document.createElement('label');
  selectLabel.className = 'pkc-textlog-select-label';
  selectLabel.setAttribute('title', 'Include this log in the TEXT extract');
  const selectCheck = document.createElement('input');
  selectCheck.type = 'checkbox';
  selectCheck.className = 'pkc-textlog-select-check';
  selectCheck.setAttribute('data-pkc-field', 'textlog-select');
  selectCheck.setAttribute('data-pkc-lid', lid);
  selectCheck.setAttribute('data-pkc-log-id', log.id);
  if (selecting) {
    selectCheck.checked = isLogSelected(log.id);
  }
  selectLabel.appendChild(selectCheck);
  header.appendChild(selectLabel);

  const flagBtn = document.createElement('button');
  flagBtn.className = 'pkc-textlog-flag-btn';
  flagBtn.setAttribute('data-pkc-action', 'toggle-log-flag');
  flagBtn.setAttribute('data-pkc-lid', lid);
  flagBtn.setAttribute('data-pkc-log-id', log.id);
  flagBtn.setAttribute('title', 'Toggle important');
  flagBtn.textContent = log.flags.includes('important') ? '★' : '☆';
  header.appendChild(flagBtn);

  const tsEl = document.createElement('span');
  tsEl.className = 'pkc-textlog-timestamp';
  tsEl.textContent = formatTimestamp(log.createdAt);
  tsEl.setAttribute('title', log.createdAt);
  header.appendChild(tsEl);

  const anchorBtn = document.createElement('button');
  anchorBtn.className = 'pkc-textlog-anchor-btn';
  anchorBtn.setAttribute('data-pkc-action', 'copy-log-line-ref');
  anchorBtn.setAttribute('data-pkc-lid', lid);
  anchorBtn.setAttribute('data-pkc-log-id', log.id);
  anchorBtn.setAttribute('title', 'Copy log line reference');
  anchorBtn.textContent = '🔗';
  header.appendChild(anchorBtn);

  article.appendChild(header);

  const textEl = document.createElement('div');
  textEl.className = 'pkc-textlog-text pkc-textlog-text-pending';
  textEl.style.minHeight = `${placeholderMinHeightPx()}px`;
  article.appendChild(textEl);

  return article;
}

function hydrateArticle(
  placeholder: HTMLElement,
  ctx: HydratorContext,
  renderFn: ArticleRenderer,
): void {
  if (placeholder.getAttribute('data-pkc-hydrated') !== 'false') return;
  try {
    const real = renderFn(
      ctx.lid, ctx.log, ctx.assets, ctx.mimeByKey,
      ctx.nameByKey, ctx.entries, ctx.selecting, ctx.currentContainerId,
    );
    real.setAttribute('data-pkc-hydrated', 'true');
    placeholder.replaceWith(real);
  } catch (e) {
    console.warn('[PKC2] textlog hydrate failed for log', ctx.log.id, e);
  }
}

export interface HydratorHandle {
  disconnect(): void;
  forceHydrateAll(): void;
}

export function attachHydrator(
  docEl: HTMLElement,
  ctxMap: Map<string, HydratorContext>,
  renderFn: ArticleRenderer,
): HydratorHandle {
  const placeholders = Array.from(
    docEl.querySelectorAll<HTMLElement>('[data-pkc-hydrated="false"]'),
  );

  if (placeholders.length === 0) {
    return { disconnect() {}, forceHydrateAll() {} };
  }

  const beforePrintHandler = (): void => {
    doForceHydrateAll();
  };

  function doForceHydrateAll(): void {
    const remaining = docEl.querySelectorAll<HTMLElement>(
      '[data-pkc-hydrated="false"]',
    );
    for (const ph of remaining) {
      const logId = ph.getAttribute('data-pkc-log-id');
      const ctx = logId ? ctxMap.get(logId) : undefined;
      if (ctx) hydrateArticle(ph, ctx, renderFn);
    }
  }

  if (typeof IntersectionObserver === 'undefined') {
    doForceHydrateAll();
    return { disconnect() {}, forceHydrateAll: doForceHydrateAll };
  }

  // ── scroll-settle gating(冒頭 SCROLL_SETTLE_MS 注記)──
  let scrolling = false;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingDuringScroll = new Set<HTMLElement>();
  let scrollHost: EventTarget | null = null;

  function flushPendingHydrations(): void {
    for (const el of [...pendingDuringScroll]) {
      pendingDuringScroll.delete(el);
      if (el.getAttribute('data-pkc-hydrated') !== 'false') continue;
      const logId = el.getAttribute('data-pkc-log-id');
      const ctx = logId ? ctxMap.get(logId) : undefined;
      if (ctx) hydrateArticle(el, ctx, renderFn);
    }
  }

  const onScroll = (ev: Event): void => {
    // docEl の祖先以外のスクロール(sidebar 等)はこの doc の hydration と
    // 無関係なので無視する。document / window スクロールは受ける。
    const t = ev.target;
    if (t instanceof Element && !t.contains(docEl)) return;
    scrolling = true;
    if (settleTimer !== null) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      scrolling = false;
      settleTimer = null;
      flushPendingHydrations();
    }, SCROLL_SETTLE_MS);
  };

  // scroll イベントは bubble しないが capture では document に届く。
  // renderBody 時点で docEl が未接続でも ownerDocument は確定しているため、
  // scroll container(`.pkc-center-content`)の解決待ちが不要になる。
  scrollHost = docEl.ownerDocument ?? null;
  scrollHost?.addEventListener('scroll', onScroll, { capture: true, passive: true });

  const observer = new IntersectionObserver(
    (entries) => {
      for (const ioEntry of entries) {
        if (!ioEntry.isIntersecting) continue;
        const el = ioEntry.target as HTMLElement;
        if (el.getAttribute('data-pkc-hydrated') !== 'false') {
          observer.unobserve(el);
          continue;
        }
        if (scrolling) {
          // スクロール中の差し替えは空回りの原因 — 静定後に flush する。
          pendingDuringScroll.add(el);
          observer.unobserve(el);
          continue;
        }
        const logId = el.getAttribute('data-pkc-log-id');
        const ctx = logId ? ctxMap.get(logId) : undefined;
        if (ctx) {
          hydrateArticle(el, ctx, renderFn);
          observer.unobserve(el);
        }
      }
    },
    { root: null, rootMargin: IO_ROOT_MARGIN, threshold: 0 },
  );

  for (const ph of placeholders) {
    observer.observe(ph);
  }

  let lookaheadDone = false;
  function scheduleLookahead(): void {
    if (lookaheadDone) return;
    lookaheadDone = true;
    let i = 0;
    function tick(): void {
      if (scrolling) {
        // 先読みの差し替えもスクロール中は止める(同じ空回り源)。
        setTimeout(tick, SCROLL_SETTLE_MS);
        return;
      }
      const remaining = docEl.querySelectorAll<HTMLElement>(
        '[data-pkc-hydrated="false"]',
      );
      if (i >= lookaheadArticleCount() || remaining.length === 0) return;
      const ph = remaining[0]!;
      const logId = ph.getAttribute('data-pkc-log-id');
      const ctx = logId ? ctxMap.get(logId) : undefined;
      if (ctx) {
        hydrateArticle(ph, ctx, renderFn);
        observer.unobserve(ph);
      }
      i++;
      const cb = (window as unknown as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback;
      (cb ?? requestAnimationFrame)(tick);
    }
    const cb = (window as unknown as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback;
    (cb ?? requestAnimationFrame)(tick);
  }

  scheduleLookahead();

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeprint', beforePrintHandler);
  }

  return {
    disconnect() {
      observer.disconnect();
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      pendingDuringScroll.clear();
      scrollHost?.removeEventListener('scroll', onScroll, { capture: true });
      scrollHost = null;
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('beforeprint', beforePrintHandler);
      }
    },
    forceHydrateAll: doForceHydrateAll,
  };
}
