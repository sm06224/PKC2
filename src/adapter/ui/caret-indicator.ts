/**
 * Global caret-row indicator — paints a subtle line marker at the
 * focused `<textarea>`'s current caret row, anywhere in the PKC2 UI.
 *
 * 2026-05-05 hotfix-7 follow-up-2 user direction:
 *   「編集側の caret 位置には caret 位置を目立たせる別の視覚効果を
 *    機能の ON/OFF に関わらず表示して」
 *   「caret位置の視覚効果はPKC全体で入力中部分で適用してください」
 *
 * Independent of the source-preview sync feature: this runs on ALL
 * textareas (split editor body, title input, search field, log row
 * inputs, etc.) regardless of whether sync is enabled. It exists
 * purely to give the user a visible "where is my caret" cue.
 *
 * Implementation:
 *   - one `position: fixed` element parented to <body>
 *   - shown when a textarea is focused, positioned to the caret's
 *     viewport row (via mirror-div measurement)
 *   - hidden when the focused element is not a textarea
 *   - updates on focusin / selectionchange / input / scroll
 *
 * No assertions, no DOM mutations on the textareas themselves.
 * pointer-events: none so it never interferes with clicks.
 */

import { getCaretViewportCoords } from './caret-position';

const INDICATOR_ID = 'pkc-global-caret-indicator';

let indicatorEl: HTMLDivElement | null = null;
let activeTextarea: HTMLTextAreaElement | null = null;

function ensureIndicator(): HTMLDivElement {
  if (indicatorEl && document.body.contains(indicatorEl)) return indicatorEl;
  const el = document.createElement('div');
  el.id = INDICATOR_ID;
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    'z-index:5',
    'display:none',
    'background:color-mix(in srgb, currentColor 6%, transparent)',
    'border-left:2px solid color-mix(in srgb, currentColor 35%, transparent)',
    'transition:top 80ms linear',
  ].join(';');
  document.body.appendChild(el);
  indicatorEl = el;
  return el;
}

function isEligibleTextarea(el: EventTarget | null): el is HTMLTextAreaElement {
  return el instanceof HTMLTextAreaElement;
}

function paint(textarea: HTMLTextAreaElement): void {
  const indicator = ensureIndicator();
  const caret = getCaretViewportCoords(textarea);
  const taRect = textarea.getBoundingClientRect();
  const visibleTop = taRect.top + textarea.clientTop;
  const visibleBottom = visibleTop + textarea.clientHeight;
  if (
    caret.top + caret.height <= visibleTop
    || caret.top >= visibleBottom
  ) {
    indicator.style.display = 'none';
    return;
  }
  indicator.style.display = 'block';
  indicator.style.top = `${caret.top}px`;
  indicator.style.left = `${taRect.left + textarea.clientLeft}px`;
  indicator.style.width = `${textarea.clientWidth}px`;
  indicator.style.height = `${caret.height}px`;
}

function hide(): void {
  if (indicatorEl) indicatorEl.style.display = 'none';
}

/**
 * Install global listeners on `document`. Returns a teardown
 * function for tests / hot reload.
 */
export function installCaretIndicator(): () => void {
  const onFocusIn = (e: FocusEvent): void => {
    const t = e.target;
    if (isEligibleTextarea(t)) {
      activeTextarea = t;
      paint(t);
    } else {
      activeTextarea = null;
      hide();
    }
  };
  const onFocusOut = (): void => {
    // Defer one tick so a focus change between two textareas paints
    // the new one before we hide.
    setTimeout(() => {
      const ae = document.activeElement;
      if (!isEligibleTextarea(ae)) {
        activeTextarea = null;
        hide();
      } else if (ae !== activeTextarea) {
        activeTextarea = ae;
        paint(ae);
      }
    }, 0);
  };
  const onSelectionChange = (): void => {
    if (activeTextarea && document.activeElement === activeTextarea) {
      paint(activeTextarea);
    }
  };
  const onInput = (e: Event): void => {
    const t = e.target;
    if (isEligibleTextarea(t) && t === activeTextarea) paint(t);
  };
  const onScroll = (e: Event): void => {
    const t = e.target;
    if (isEligibleTextarea(t) && t === activeTextarea) paint(t);
    // window-level scroll also moves the textarea's viewport coords.
    if (e.target === document || e.target === window) {
      if (activeTextarea) paint(activeTextarea);
    }
  };
  const onResize = (): void => {
    if (activeTextarea) paint(activeTextarea);
  };

  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('input', onInput, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);

  return () => {
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('selectionchange', onSelectionChange);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    if (indicatorEl) {
      indicatorEl.remove();
      indicatorEl = null;
    }
    activeTextarea = null;
  };
}
