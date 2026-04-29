/**
 * iPhone / iPad floating snippet helper (PR #201, 2026-04-29).
 *
 * Touch devices have no convenient way to enter many markdown
 * primitives that desktop users get for free:
 *   - Backtick (`` ` ``) is buried under Number → Symbol on iOS
 *   - Triple-backtick fence is even worse
 *   - Bracket auto-pair from PR #198 doesn't work on iOS Safari
 *     (`((` duplication, see roadmap 領域 4 iOS limitation note)
 *
 * **Design history:**
 *   - v1/v2 (input accessory): `position: fixed; bottom: 0` toolbar
 *     above the keyboard. iOS chrome (URL bar / accessory bar /
 *     predictive bar) competed for the same screen real estate;
 *     portrait mode covered the toolbar.
 *   - v3 (modal sheet): bottom-sheet drawer, then header-anchored
 *     drop-down. Both were rejected as "ugly + bad usability" —
 *     too much screen taken, 3×3 grid felt heavyweight.
 *   - v4 (this file, floating cursor-following): a small "+" trigger
 *     hovers near the caret as the user types. Tapping it spawns a
 *     compact horizontal popup (single row, ~28 px buttons) right
 *     next to the cursor. WCAG min-target deliberately relaxed
 *     (per user's «philosophy first, ignore WCAG when the spec
 *     hurts UX») because the popup is transient and the buttons
 *     carry distinct symbolic glyphs that aid disambiguation.
 *
 * Pure DOM helpers — no dispatcher / state coupling. The action
 * binder owns event wiring; this file knows how to render the
 * trigger / popup, position them given a caret coordinate, and
 * apply each snippet kind to a textarea.
 */

export type SnippetKind =
  | 'backtick'
  | 'fence'
  | 'paren'
  | 'bracket'
  | 'brace'
  | 'angle'
  | 'dash'
  | 'quote'
  | 'heading'
  | 'heading2'
  | 'heading3';

const SNIPPET_ORDER: readonly SnippetKind[] = [
  'backtick',
  'fence',
  'paren',
  'bracket',
  'brace',
  'angle',
  'dash',
  'quote',
  'heading',
  'heading2',
  'heading3',
];

interface SnippetSpec {
  /** Visible button label (compact glyph) */
  label: string;
  /** a11y title */
  title: string;
}

const SNIPPETS: Readonly<Record<SnippetKind, SnippetSpec>> = {
  backtick: { label: '`', title: 'Inline code' },
  fence:    { label: '```', title: 'Code block' },
  paren:    { label: '()', title: 'Parentheses' },
  bracket:  { label: '[]', title: 'Brackets' },
  brace:    { label: '{}', title: 'Braces' },
  angle:    { label: '<>', title: 'Angle brackets' },
  dash:     { label: '-', title: 'List item' },
  quote:    { label: '>', title: 'Quote' },
  heading:  { label: '#', title: 'Heading 1' },
  heading2: { label: '##', title: 'Heading 2' },
  heading3: { label: '###', title: 'Heading 3' },
};

/**
 * Render the floating "+" trigger element (small circular button).
 * Hidden by default; positioned by `placeFloatingTrigger`.
 */
export function renderFloatingTrigger(): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pkc-snippet-trigger';
  btn.setAttribute('data-pkc-region', 'snippet-trigger');
  btn.setAttribute('data-pkc-action', 'open-snippet-popup');
  btn.setAttribute('aria-label', 'Insert markdown snippet');
  btn.setAttribute('title', 'マークダウン補助');
  btn.hidden = true;
  btn.textContent = '✚';
  return btn;
}

/**
 * Render the snippet popup (horizontal row of compact buttons).
 * Hidden by default; positioned by `placeFloatingPopup`.
 */
export function renderFloatingPopup(): HTMLElement {
  const popup = document.createElement('div');
  popup.className = 'pkc-snippet-popup';
  popup.setAttribute('data-pkc-region', 'snippet-popup');
  popup.setAttribute('role', 'menu');
  popup.setAttribute('aria-label', 'Markdown snippet menu');
  popup.hidden = true;

  for (const kind of SNIPPET_ORDER) {
    const spec = SNIPPETS[kind];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pkc-snippet-popup-btn';
    btn.setAttribute('data-pkc-snippet', kind);
    btn.setAttribute('aria-label', spec.title);
    btn.setAttribute('title', spec.title);
    btn.textContent = spec.label;
    popup.appendChild(btn);
  }
  return popup;
}

/**
 * Place the trigger near a caret coordinate.
 *
 * Strategy: trigger sits **immediately to the right of the caret line**
 * (so it doesn't visually cover the line itself). Falls back to
 * placing below the line if there's not enough horizontal room.
 *
 * Coordinate system: `coords` come from `getBoundingClientRect`-
 * based caret math (visual-viewport-relative on iOS 16+). On iOS
 * with the URL bar / toolbar offsetting the visual viewport from
 * the layout viewport, we need to ADD `visualViewport.offsetTop`
 * to convert into `position: fixed`'s coordinate system, which is
 * layout-viewport-relative when iOS anchors fixed to the layout
 * viewport. (v5 went the wrong way and pushed the trigger further
 * up; v6 flips the sign.)
 */
export function placeFloatingTrigger(
  trigger: HTMLElement,
  coords: { top: number; left: number; height: number },
): void {
  trigger.style.position = 'fixed';
  const triggerSize = 28; // matches CSS
  const margin = 4;

  const vv = window.visualViewport;
  const offsetTop = vv?.offsetTop ?? 0;
  const offsetLeft = vv?.offsetLeft ?? 0;

  const caretTop = coords.top + offsetTop;
  const caretLeft = coords.left + offsetLeft;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Default placement: just to the right of the caret, vertically
  // centred on the caret line.
  let left = caretLeft + margin;
  let top = caretTop + (coords.height - triggerSize) / 2;

  // If the right-side placement would clip the viewport, flip to
  // the left side of the caret.
  if (left + triggerSize > vw - margin) {
    left = caretLeft - triggerSize - margin;
  }
  // Final clamp so the trigger is always fully on-screen.
  if (left + triggerSize > vw - margin) left = vw - triggerSize - margin;
  if (left < margin) left = margin;
  if (top + triggerSize > vh - margin) top = vh - triggerSize - margin;
  if (top < margin) top = margin;

  trigger.style.left = `${left}px`;
  trigger.style.top = `${top}px`;
}

/**
 * Place the popup near a caret coordinate. Prefers BELOW the caret
 * line; flips ABOVE when below would clip viewport bottom.
 *
 * Same coordinate-system conversion as `placeFloatingTrigger`.
 */
export function placeFloatingPopup(
  popup: HTMLElement,
  coords: { top: number; left: number; height: number },
): void {
  popup.style.position = 'fixed';
  // Make sure popup is laid out before we measure its width.
  const prevVisibility = popup.style.visibility;
  popup.style.visibility = 'hidden';
  popup.hidden = false;
  const popupRect = popup.getBoundingClientRect();
  popup.hidden = true;
  popup.style.visibility = prevVisibility;
  popup.hidden = false;

  const popupW = popupRect.width || 280;
  const popupH = popupRect.height || 36;
  const vv = window.visualViewport;
  const offsetTop = vv?.offsetTop ?? 0;
  const offsetLeft = vv?.offsetLeft ?? 0;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 4;

  const caretTop = coords.top + offsetTop;
  const caretLeft = coords.left + offsetLeft;

  // Horizontal: prefer popup-left = caret-left, clamp to viewport.
  let left = caretLeft;
  if (left + popupW > vw - margin) left = vw - popupW - margin;
  if (left < margin) left = margin;

  // Vertical: prefer below; flip above when no room.
  let top = caretTop + coords.height + margin;
  if (top + popupH > vh - margin) {
    const flipped = caretTop - popupH - margin;
    if (flipped >= margin) top = flipped;
    else top = Math.max(margin, vh - popupH - margin);
  }

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

/**
 * Insert the snippet at the textarea's cursor position. Each kind
 * has its own placement / cursor convention:
 *
 *   - `backtick` / `dash` / `quote` / `heading` — single-character
 *     insertion. dash / quote / heading add a trailing space if
 *     they're the line's first token (so `# `, not just `#`).
 *   - `paren` / `bracket` / `brace` / `angle` — open + close pair,
 *     cursor placed inside.
 *   - `fence` — multi-line scaffold:
 *       at start of line → ` ```\n│\n``` ` (cursor on middle empty line)
 *       mid-line          → `\n```\n│\n```\n`
 *
 * Selection ranges are wrapped: pair / fence wrap the selection
 * with cursor placed after the closer.
 *
 * Dispatches an `input` event so preview / dirty-state subscribers
 * pick up the change.
 */
export function applySnippet(ta: HTMLTextAreaElement, kind: SnippetKind): void {
  const value = ta.value;
  const start = ta.selectionStart ?? 0;
  const end = ta.selectionEnd ?? start;
  const hasSelection = start !== end;
  const selected = hasSelection ? value.slice(start, end) : '';

  switch (kind) {
    case 'backtick':
      if (hasSelection) {
        replaceRange(ta, start, end, '`' + selected + '`', start + selected.length + 2);
      } else {
        replaceRange(ta, start, end, '`', start + 1);
      }
      break;

    case 'paren':
      insertPair(ta, start, end, '(', ')', selected);
      break;
    case 'bracket':
      insertPair(ta, start, end, '[', ']', selected);
      break;
    case 'brace':
      insertPair(ta, start, end, '{', '}', selected);
      break;
    case 'angle':
      insertPair(ta, start, end, '<', '>', selected);
      break;

    case 'fence': {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const beforeOnLine = value.slice(lineStart, start);
      const atLineStart = beforeOnLine.length === 0;
      if (hasSelection) {
        const prefix = atLineStart ? '' : '\n';
        const open = prefix + '```\n';
        const close = '\n```\n';
        const text = open + selected + close;
        replaceRange(ta, start, end, text, start + prefix.length + 3);
      } else {
        const prefix = atLineStart ? '' : '\n';
        const open = prefix + '```\n';
        const middleStart = start + open.length;
        const text = open + '\n```\n';
        replaceRange(ta, start, end, text, middleStart);
      }
      break;
    }

    case 'dash':
    case 'quote':
    case 'heading':
    case 'heading2':
    case 'heading3': {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const beforeOnLine = value.slice(lineStart, start);
      const atLineStart = /^\s*$/.test(beforeOnLine);
      const marker =
        kind === 'dash' ? '-'
        : kind === 'quote' ? '>'
        : kind === 'heading' ? '#'
        : kind === 'heading2' ? '##'
        : '###';
      if (atLineStart) {
        const insert = marker + ' ';
        replaceRange(ta, start, end, insert, start + insert.length);
      } else {
        replaceRange(ta, start, end, marker, start + marker.length);
      }
      break;
    }
  }
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertPair(
  ta: HTMLTextAreaElement,
  start: number,
  end: number,
  open: string,
  close: string,
  selected: string,
): void {
  if (selected.length > 0) {
    const text = open + selected + close;
    replaceRange(ta, start, end, text, start + text.length);
  } else {
    const text = open + close;
    replaceRange(ta, start, end, text, start + open.length);
  }
}

function replaceRange(
  ta: HTMLTextAreaElement,
  start: number,
  end: number,
  text: string,
  caret: number,
): void {
  if (typeof ta.setRangeText === 'function') {
    ta.setRangeText(text, start, end, 'preserve');
  } else {
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  }
  ta.selectionStart = ta.selectionEnd = caret;
}
