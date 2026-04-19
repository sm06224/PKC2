import type { Entry } from '../../core/model/record';
import type { LogArticle } from '../../features/textlog/textlog-doc';

export const INITIAL_RENDER_ARTICLE_COUNT = 8;
export const LOOKAHEAD_ARTICLE_COUNT = 4;

const PLACEHOLDER_MIN_HEIGHT = 160;
const IO_ROOT_MARGIN = '400px 0px';

export interface HydratorContext {
  lid: string;
  log: LogArticle;
  assets: Record<string, string> | undefined;
  mimeByKey: Record<string, string> | undefined;
  nameByKey: Record<string, string> | undefined;
  entries: Entry[] | undefined;
  selecting: boolean;
}

type ArticleRenderer = (
  lid: string,
  log: LogArticle,
  assets?: Record<string, string>,
  mimeByKey?: Record<string, string>,
  nameByKey?: Record<string, string>,
  entries?: Entry[],
  selecting?: boolean,
) => HTMLElement;

export function renderLogArticlePlaceholder(
  lid: string,
  log: LogArticle,
  formatTimestamp: (ts: string) => string,
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

  const header = document.createElement('header');
  header.className = 'pkc-textlog-log-header';

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
  textEl.style.minHeight = `${PLACEHOLDER_MIN_HEIGHT}px`;
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
      ctx.nameByKey, ctx.entries, ctx.selecting,
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

  const observer = new IntersectionObserver(
    (entries) => {
      for (const ioEntry of entries) {
        if (!ioEntry.isIntersecting) continue;
        const el = ioEntry.target as HTMLElement;
        if (el.getAttribute('data-pkc-hydrated') !== 'false') {
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
      const remaining = docEl.querySelectorAll<HTMLElement>(
        '[data-pkc-hydrated="false"]',
      );
      if (i >= LOOKAHEAD_ARTICLE_COUNT || remaining.length === 0) return;
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

  return {
    disconnect() {
      observer.disconnect();
    },
    forceHydrateAll: doForceHydrateAll,
  };
}
