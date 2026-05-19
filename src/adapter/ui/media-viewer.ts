/**
 * Media viewer(2026-05-19 PiP 廃止後の単一窓化):
 *
 * 旧版(PR #203、2026-04-29)では Document Picture-in-Picture を試して
 * 落ちたら modal にフォールバックする 2 段構成だった。が、user 体感で
 * 「PiP は思ったより使いにくい(常時最前面が邪魔 / drag 操作不安定 /
 * cross-browser 不揃い)」(v3 提案 #3、2026-05-18)を受けて **PiP 経路を
 * 廃止**、別窓は `window.open()` に統一する。
 *
 * 2 delivery paths:
 *
 *   1. **`window.open()` 新規 window**(全ブラウザ対応)。
 *      browser native の通常 window として開く、常時最前面ではなく
 *      自由に裏に回せる。host の stylesheet を clone して同 look。
 *      Popup blocker でブロックされた場合のみ次の modal にフォール。
 *
 *   2. **モーダル overlay フォールバック**(popup blocked / 旧ブラウザ)。
 *      v1 の backdrop + dialog card。host viewport 内に拘束されるが
 *      横幅一杯に展開。
 *
 * Pure DOM helpers — no dispatcher / state coupling. The action
 * binder owns event wiring.
 */

/**
 * Render the modal-fallback viewer overlay. Hidden by default; the
 * action binder unhides it when window.open() is blocked or unavailable.
 */
export function renderMediaViewer(): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.className = 'pkc-media-viewer-backdrop';
  backdrop.setAttribute('data-pkc-region', 'media-viewer-backdrop');
  backdrop.hidden = true;

  const card = document.createElement('div');
  card.className = 'pkc-media-viewer-card';
  card.setAttribute('data-pkc-region', 'media-viewer');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'Expanded media view');

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'pkc-media-viewer-close';
  closeBtn.setAttribute('data-pkc-action', 'close-media-viewer');
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  card.appendChild(closeBtn);

  const content = document.createElement('div');
  content.className = 'pkc-media-viewer-content pkc-md-rendered';
  content.setAttribute('data-pkc-region', 'media-viewer-content');
  card.appendChild(content);

  backdrop.appendChild(card);
  return backdrop;
}

function findMediaViewer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pkc-region="media-viewer-backdrop"]');
}

function findContentArea(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-pkc-region="media-viewer-content"]');
}

/**
 * Build a clone of `source` with viewer-specific cleanup applied
 * (strip copy / expand buttons, mark with `pkc-media-viewer-clone`
 * so CSS can lift overflow caps).
 */
function buildViewerClone(source: Element): Element {
  const clone = source.cloneNode(true) as Element;
  for (const sel of ['.pkc-md-copy-btn', '[data-pkc-action="expand-md-block"]']) {
    for (const el of clone.querySelectorAll(sel)) el.remove();
  }
  if (clone instanceof HTMLElement) {
    clone.classList.add('pkc-media-viewer-clone');
  }
  return clone;
}

/**
 * Copy every accessible CSS rule from the host document into a
 * `<style>` tag in the new window, so the cloned content renders
 * identically. Cross-origin sheets are skipped silently (their
 * rules aren't readable; usually they're not relevant to a PKC2
 * single-HTML build anyway).
 */
function cloneStylesheetsInto(target: Document): void {
  const css: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = (sheet as CSSStyleSheet).cssRules;
      for (const rule of Array.from(rules)) {
        css.push(rule.cssText);
      }
    } catch {
      // Cross-origin or otherwise inaccessible — skip.
    }
  }
  const style = target.createElement('style');
  style.textContent = css.join('\n');
  target.head.appendChild(style);
}

/**
 * Track the currently open window so subsequent open calls can
 * close the previous one before spawning a new one (otherwise the
 * user accumulates orphan windows).
 */
let activeWindow: Window | null = null;

function tryOpenInWindow(source: Element): boolean {
  try {
    // Close any previous viewer window from a stale open call.
    if (activeWindow && !activeWindow.closed) {
      activeWindow.close();
    }
    // window.open() で新規 window を起こす。
    // **重要**(2026-05-19 regression hotfix):
    // - `async` を外す:user activation chain を保つ。browser security
    //   policy で popup は click handler 中(microtask 跨ぎ前)に呼ばれ
    //   ないと blocker に弾かれる。旧版は `async function` + 呼び元
    //   `await tryOpenInWindow` で microtask 跨ぎが入り、iOS Safari 等で
    //   popup blocked になっていた。
    // - features arg(`'width=900,height=640'`)を削除:iOS Safari で
    //   features 付き window.open は「popup」扱いで block されるため。
    //   引数を空にすると new tab 同等の挙動で、user gesture 中なら通る。
    //   PC chrome では new tab で開くが、user は popup 経由でも tab 経由
    //   でも別窓表示として体感差なし。
    const popup = window.open('', '_blank');
    if (!popup) {
      // Popup blocker / new tab fallback → modal へ。
      return false;
    }
    activeWindow = popup;

    // popup の document に host の style + theme attribute をコピー。
    cloneStylesheetsInto(popup.document);

    // Mirror the body classes/data attributes that drive theming
    // (`data-pkc-theme`, `data-pkc-scanline`, etc.) so the cloned
    // content uses the user's chosen palette.
    for (const attr of Array.from(document.documentElement.attributes)) {
      popup.document.documentElement.setAttribute(attr.name, attr.value);
    }
    for (const attr of Array.from(document.body.attributes)) {
      popup.document.body.setAttribute(attr.name, attr.value);
    }

    // タイトル(window title bar 用)
    popup.document.title = 'PKC2 Media Viewer';

    // Layout container — `.pkc-md-rendered` で host の prose スタイルを
    // 継承、padding で視認性。`pkc-media-viewer-popup-body` で window 固有
    // CSS(旧 PiP CSS の名残は別 PR で整理予定)。
    const container = popup.document.createElement('div');
    container.className = 'pkc-md-rendered pkc-media-viewer-pip-body';
    container.appendChild(buildViewerClone(source));
    popup.document.body.appendChild(container);

    // popup を user が閉じたら active reference を clear。
    popup.addEventListener('pagehide', () => {
      if (activeWindow === popup) activeWindow = null;
    });
    return true;
  } catch (err) {
    // window.open が何らかの理由で落ちたら modal へ fall through。
    console.warn('[media-viewer] window.open unavailable:', err);
    return false;
  }
}

function openModalFallback(source: Element): void {
  const backdrop = findMediaViewer();
  const content = findContentArea();
  if (!backdrop || !content) return;
  content.innerHTML = '';
  content.appendChild(buildViewerClone(source));
  backdrop.hidden = false;
}

/**
 * Show the viewer for `source`. Try `window.open()` first(全ブラウザ
 * 対応、常時最前面でない通常 window)、popup blocked / 不可なら in-page
 * modal にフォール。
 *
 * **sync 関数**(2026-05-19 regression hotfix):旧版は async で、呼び元の
 * `await openMediaViewer(...)` が microtask 跨ぎを生み、browser の user
 * activation 判定で popup を block していた。sync 化で user gesture 中に
 * `window.open()` まで到達することを保証。
 */
export function openMediaViewer(source: Element): void {
  if (tryOpenInWindow(source)) return;
  openModalFallback(source);
}

/**
 * Close whichever delivery is open: separate window if active, modal
 * otherwise.
 */
export function closeMediaViewer(): void {
  if (activeWindow && !activeWindow.closed) {
    activeWindow.close();
    activeWindow = null;
  }
  const backdrop = findMediaViewer();
  const content = findContentArea();
  if (backdrop) backdrop.hidden = true;
  if (content) content.innerHTML = '';
}

/**
 * Returns whether either delivery is currently open.
 */
export function isMediaViewerOpen(): boolean {
  if (activeWindow && !activeWindow.closed) return true;
  const backdrop = findMediaViewer();
  return !!backdrop && !backdrop.hidden;
}
