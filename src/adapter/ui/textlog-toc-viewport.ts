/**
 * TEXTLOG TOC viewport highlight tracker
 * (PR-V8、v2.3.x stack、textlog-viewer-and-linkability-redesign.md §8
 * 「TOC の可視範囲 highlight」future enhancement の着地)。
 *
 * 仕様:
 *   - textlog 中央 pane の `<article data-pkc-log-id>` /
 *     `<section id="day-...">` を IntersectionObserver で観測
 *   - viewport に入っている要素のうち最も上にあるものを "current" とし、
 *     右 meta pane の TOC ボタンに `data-pkc-toc-current="true"` を設置
 *   - 他の TOC ボタンの marker を剥がす(常に 1 件)
 *   - CSS は `.pkc-toc-link[data-pkc-toc-current="true"]` で highlight
 *
 * 設計判断:
 *   - 既存 hydrator が docEl 内の `[data-pkc-hydrated="false"]` を観測する
 *     のと別 path(同じ doc element でも観測対象が違う)。`unobserve` ベース
 *     で衝突しない
 *   - TOC ボタンの探索範囲は `document` 全体(toc は meta pane で docEl 外)
 *   - 同 entry 内に TOC が無ければ no-op で disconnect
 *   - happy-dom / SSR では IntersectionObserver 不在 → no-op
 */

export interface TocViewportHandle {
  disconnect(): void;
}

const CURRENT_ATTR = 'data-pkc-toc-current';

/**
 * `docEl` 内の textlog log / day 要素を観測し、最上位可視要素に対応する TOC
 * ボタンを highlight する。
 *
 * @param docEl textlog 中央 pane の root element(`.pkc-textlog-doc` 等)
 * @param options.tocRoot TOC ボタンを探す範囲(default `document`)。
 *   テスト時に root を任意の subtree に絞れる。
 * @returns `disconnect()` で observer 解除 + 既存 marker 剥がし
 */
export function attachTocViewportTracker(
  docEl: HTMLElement,
  options?: { tocRoot?: ParentNode },
): TocViewportHandle {
  if (typeof IntersectionObserver === 'undefined') {
    return { disconnect() {} };
  }
  const tocRoot: ParentNode = options?.tocRoot ?? (typeof document !== 'undefined' ? document : docEl);
  // TOC region 自体が存在しない場合は tracker 不要(observer も attach しない)。
  // detail pane 側に sidebar 用 TOC が出ていない context(transclusion / 子
  // window 等)では highlight 先が無いので skip。
  const hasToc = tocRoot.querySelector('[data-pkc-region="toc"] .pkc-toc-link');
  if (!hasToc) return { disconnect() {} };
  // 観測対象を収集:textlog log article + day section
  const observed = new Set<HTMLElement>();
  const articles = Array.from(docEl.querySelectorAll<HTMLElement>('article[data-pkc-log-id]'));
  const daySections = Array.from(
    docEl.querySelectorAll<HTMLElement>('section[id^="day-"]'),
  );
  for (const el of articles) observed.add(el);
  for (const el of daySections) observed.add(el);
  if (observed.size === 0) return { disconnect() {} };

  // 可視判定:`isIntersecting` のうち、bounding rect の top が最小のものを
  // current とみなす(scroll 下方向に進むと自然と次の article に遷移)。
  const visible = new Map<HTMLElement, DOMRectReadOnly>();
  let currentBtn: HTMLElement | null = null;

  const findTocButton = (el: HTMLElement): HTMLElement | null => {
    // article の場合:log-id を data-pkc-log-id から取って TOC button を検索
    const logId = el.getAttribute('data-pkc-log-id');
    if (logId) {
      return tocRoot.querySelector<HTMLElement>(
        `[data-pkc-region="toc"] .pkc-toc-link[data-pkc-toc-target-id="log-${escapeAttr(logId)}"], ` +
        `[data-pkc-region="toc"] .pkc-toc-link[data-pkc-log-id="${escapeAttr(logId)}"][data-pkc-toc-target-id^="log-"]`,
      );
    }
    // day section の場合:id="day-YYYY-MM-DD"
    if (el.id?.startsWith('day-')) {
      return tocRoot.querySelector<HTMLElement>(
        `[data-pkc-region="toc"] .pkc-toc-link[data-pkc-toc-target-id="${escapeAttr(el.id)}"]`,
      );
    }
    return null;
  };

  const updateCurrent = (): void => {
    if (visible.size === 0) return;
    // 最も上にある(top 値が最小)可視要素を選ぶ
    let topEl: HTMLElement | null = null;
    let topY = Infinity;
    for (const [el, rect] of visible) {
      if (rect.top < topY) {
        topY = rect.top;
        topEl = el;
      }
    }
    if (!topEl) return;
    // article 内 day と log は両方 visible になり得る。log を優先する(より細粒度)
    // ── ただし day section が article を包む構造なので、log article が visible で
    // あれば常に article が選ばれる(rect.top は header offset 分だけ下になる)。
    const btn = findTocButton(topEl);
    if (!btn || btn === currentBtn) return;
    if (currentBtn) currentBtn.removeAttribute(CURRENT_ATTR);
    btn.setAttribute(CURRENT_ATTR, 'true');
    currentBtn = btn;
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) {
          visible.set(el, e.boundingClientRect);
        } else {
          visible.delete(el);
        }
      }
      updateCurrent();
    },
    { root: null, rootMargin: '0px 0px -60% 0px', threshold: 0 },
  );

  for (const el of observed) observer.observe(el);

  return {
    disconnect() {
      observer.disconnect();
      if (currentBtn) {
        currentBtn.removeAttribute(CURRENT_ATTR);
        currentBtn = null;
      }
      visible.clear();
    },
  };
}

function escapeAttr(v: string): string {
  return v.replace(/"/g, '&quot;');
}
