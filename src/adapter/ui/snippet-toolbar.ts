/**
 * iPhone / iPad snippet sheet (PR #201, 2026-04-29).
 *
 * Touch devices have no convenient way to enter many markdown
 * primitives that desktop users get for free:
 *   - Backtick (`` ` ``) is buried under Number → Symbol on iOS
 *   - Triple-backtick fence is even worse(three taps + return)
 *   - Bracket auto-pair from PR #198 doesn't work on iOS Safari
 *     (`((` duplication, see roadmap 領域 4 iOS limitation note)
 *
 * Original v1/v2 implementation used a `position: fixed; bottom: 0`
 * input-accessory-style toolbar above the keyboard. That approach
 * lost the iOS chrome fight in portrait (URL bar overlap, accessory
 * bar, predictive text bar — vary by iOS version / orientation).
 * Plan B (this revision) replaces it with a "+" trigger in the
 * mobile editing header that opens a **bottom sheet** drawer with
 * a snippet button grid. iOS-native pattern (Notes, Mail compose),
 * and iOS chrome doesn't compete with our overlay.
 *
 * Pure DOM helpers — no dispatcher / state coupling. The action
 * binder owns event wiring; this file only knows how to render the
 * sheet and apply each snippet kind.
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
  | 'heading';

interface SnippetSpec {
  /** Visible button label */
  label: string;
  /** Hover / a11y title */
  title: string;
}

/**
 * Display order + label for each snippet button. Order matters —
 * the most touch-painful entries(backtick, fence) come first
 * because they're the original motivation for the sheet.
 */
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
];

const SNIPPETS: Readonly<Record<SnippetKind, SnippetSpec>> = {
  backtick: { label: '`', title: 'Inline code' },
  fence:    { label: '```', title: 'Code block' },
  paren:    { label: '( )', title: 'Parentheses' },
  bracket:  { label: '[ ]', title: 'Brackets' },
  brace:    { label: '{ }', title: 'Braces' },
  angle:    { label: '< >', title: 'Angle brackets' },
  dash:     { label: '-', title: 'List item' },
  quote:    { label: '>', title: 'Quote' },
  heading:  { label: '#', title: 'Heading' },
};

/**
 * Render the snippet sheet overlay (backdrop + sheet card). Hidden
 * by default; the action binder unhides it when the user taps the
 * "+" trigger in the mobile header during edit mode.
 *
 * The backdrop captures outside-clicks for dismissal; the sheet
 * itself is a flex card pinned to the viewport bottom on touch
 * tier (`@media (pointer: coarse)`). On desktop the entire overlay
 * stays `display: none` since desktop users have a hardware
 * keyboard and don't need this.
 */
export function renderSnippetSheet(): HTMLElement {
  const backdrop = document.createElement('div');
  backdrop.className = 'pkc-snippet-sheet-backdrop';
  backdrop.setAttribute('data-pkc-region', 'snippet-sheet-backdrop');
  backdrop.hidden = true;

  const sheet = document.createElement('div');
  sheet.className = 'pkc-snippet-sheet';
  sheet.setAttribute('data-pkc-region', 'snippet-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Insert markdown snippet');
  sheet.setAttribute('aria-modal', 'true');

  const header = document.createElement('div');
  header.className = 'pkc-snippet-sheet-header';

  const title = document.createElement('span');
  title.className = 'pkc-snippet-sheet-title';
  title.textContent = 'Insert';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'pkc-snippet-sheet-close';
  closeBtn.setAttribute('data-pkc-action', 'close-snippet-sheet');
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  header.appendChild(closeBtn);

  sheet.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'pkc-snippet-sheet-grid';
  for (const kind of SNIPPET_ORDER) {
    const spec = SNIPPETS[kind];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pkc-snippet-sheet-btn';
    btn.setAttribute('data-pkc-snippet', kind);
    btn.setAttribute('title', spec.title);
    btn.setAttribute('aria-label', spec.title);
    btn.textContent = spec.label;
    grid.appendChild(btn);
  }
  sheet.appendChild(grid);
  backdrop.appendChild(sheet);
  return backdrop;
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
    case 'heading': {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const beforeOnLine = value.slice(lineStart, start);
      const atLineStart = /^\s*$/.test(beforeOnLine);
      const marker = kind === 'dash' ? '-' : kind === 'quote' ? '>' : '#';
      if (atLineStart) {
        const insert = marker + ' ';
        replaceRange(ta, start, end, insert, start + insert.length);
      } else {
        replaceRange(ta, start, end, marker, start + 1);
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
