/**
 * Asset Autocomplete — minimal inline completion for the `asset:` URL scheme.
 *
 * Scope:
 * - Triggers ONLY when the caret is inside a sequence `(asset:<query>`
 *   where `<query>` is a run of `[A-Za-z0-9_-]` characters. This covers
 *   both the image form `![alt](asset:...)` and the link form
 *   `[text](asset:...)` without matching plain text or URLs.
 * - Suggests image assets from the current container (same candidate
 *   source as the Asset Picker).
 * - Replaces only the typed `<query>` range with the chosen asset key —
 *   never the surrounding parens or brackets.
 *
 * Design rationale:
 * - The Asset Picker is for *explicit selection* (via `/asset` slash
 *   command). This autocomplete is for *free-typing assistance* —
 *   when the user hand-writes `](asset:` because they remember the
 *   syntax. The two share candidate collection but nothing else.
 * - Detection requires `(` immediately before `asset:` to avoid false
 *   positives on plain text, URLs (`https://.../asset:`), and code
 *   fences. Inside markdown link/image parens this is always true.
 * - Candidate list stays tiny and image-only, so a full fuzzy-finder
 *   would be overkill. Simple `includes` substring match is enough.
 *
 * This is adapter-layer: it touches DOM and imports from the picker
 * helper module for the candidate type.
 */

import { type AssetCandidate } from './asset-picker';

// ── Context detection ──

/**
 * Returns { queryStart, query } when the caret is inside a completion
 * context, else null.
 *
 * A context is: `(asset:<query>|`  where `|` is the caret and `<query>`
 * is zero or more characters in `[A-Za-z0-9_-]`.
 */
export function findAssetCompletionContext(
  text: string,
  caretPos: number,
): { queryStart: number; query: string } | null {
  if (caretPos < 7) return null; // Need at least `(asset:` before caret

  // Walk backwards over asset-key characters to find the query's start.
  let start = caretPos;
  while (start > 0) {
    const ch = text[start - 1]!;
    if (!/[A-Za-z0-9_-]/.test(ch)) break;
    start--;
  }

  // Must be preceded by literal "asset:"
  if (start < 7) return null;
  if (text.slice(start - 6, start) !== 'asset:') return null;

  // And "asset:" must be preceded by "(" — guarantees we're inside
  // markdown link/image URL parens, not plain text.
  if (text[start - 7] !== '(') return null;

  return { queryStart: start, query: text.slice(start, caretPos) };
}

// ── Candidate filtering ──

/**
 * Filter candidates by case-insensitive substring match on key or name.
 * Empty query returns the full list unchanged.
 */
export function filterAssetCandidates(
  all: AssetCandidate[],
  query: string,
): AssetCandidate[] {
  if (query === '') return all.slice();
  const q = query.toLowerCase();
  return all.filter(
    (c) => c.key.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
  );
}

// ── Popover state ──

let activePopover: HTMLElement | null = null;
let activeTextarea: HTMLTextAreaElement | null = null;
/** Start of the query range to replace on accept (inclusive). */
let queryRangeStart = -1;
let selectedIndex = 0;
let allCandidates: AssetCandidate[] = [];
let visibleCandidates: AssetCandidate[] = [];

export function isAssetAutocompleteOpen(): boolean {
  return activePopover !== null;
}

/**
 * Open the autocomplete popover near the given textarea.
 *
 * When `candidates` is empty (container has no image assets), this is a
 * no-op — there is nothing to suggest and the popover stays closed.
 *
 * @param textarea  Target textarea whose value will be edited on accept.
 * @param queryStart Start position of the typed query (inclusive).
 * @param query     Current query string (typed after `asset:`).
 * @param candidates Full image asset list from the container.
 * @param root      Render parent (the `#pkc-root` element).
 */
export function openAssetAutocomplete(
  textarea: HTMLTextAreaElement,
  queryStart: number,
  query: string,
  candidates: AssetCandidate[],
  root: HTMLElement,
): void {
  closeAssetAutocomplete();
  if (candidates.length === 0) return;

  activeTextarea = textarea;
  queryRangeStart = queryStart;
  allCandidates = candidates.slice();
  visibleCandidates = filterAssetCandidates(allCandidates, query);
  selectedIndex = 0;

  activePopover = document.createElement('div');
  activePopover.className = 'pkc-asset-autocomplete';
  activePopover.setAttribute('data-pkc-region', 'asset-autocomplete');

  renderItems();

  // Position below the textarea — same strategy as slash-menu / picker.
  const rect = textarea.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  activePopover.style.position = 'absolute';
  activePopover.style.left = `${rect.left - rootRect.left}px`;
  activePopover.style.top = `${rect.bottom - rootRect.top + 4}px`;
  activePopover.style.zIndex = '100';

  root.appendChild(activePopover);
}

/**
 * Re-filter the visible list in response to query changes (typed chars
 * or backspace). Keeps the popover open, resets selection to the top.
 */
export function updateAssetAutocompleteQuery(query: string): void {
  if (!activePopover) return;
  visibleCandidates = filterAssetCandidates(allCandidates, query);
  selectedIndex = 0;
  renderItems();
}

function renderItems(): void {
  if (!activePopover) return;
  activePopover.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'pkc-asset-autocomplete-heading';
  heading.textContent = 'asset: suggestions';
  activePopover.appendChild(heading);

  if (visibleCandidates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pkc-asset-autocomplete-empty';
    empty.textContent = 'No matching image assets.';
    activePopover.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'pkc-asset-autocomplete-list';
  for (let i = 0; i < visibleCandidates.length; i++) {
    const cand = visibleCandidates[i]!;
    const item = document.createElement('div');
    item.className = 'pkc-asset-autocomplete-item';
    if (i === selectedIndex) item.setAttribute('data-pkc-selected', 'true');
    item.setAttribute('data-pkc-asset-key', cand.key);

    const name = document.createElement('span');
    name.className = 'pkc-asset-autocomplete-name';
    name.textContent = cand.name;
    item.appendChild(name);

    const keySpan = document.createElement('span');
    keySpan.className = 'pkc-asset-autocomplete-key';
    keySpan.textContent = cand.key;
    item.appendChild(keySpan);

    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent textarea blur
      insertCandidate(cand);
    });
    item.addEventListener('mouseenter', () => {
      selectedIndex = i;
      updateSelection();
    });
    list.appendChild(item);
  }
  activePopover.appendChild(list);
}

function updateSelection(): void {
  if (!activePopover) return;
  const items = activePopover.querySelectorAll('.pkc-asset-autocomplete-item');
  for (let i = 0; i < items.length; i++) {
    if (i === selectedIndex) {
      items[i]!.setAttribute('data-pkc-selected', 'true');
    } else {
      items[i]!.removeAttribute('data-pkc-selected');
    }
  }
}

/**
 * Keyboard navigation. Returns true iff the event was consumed.
 *
 * Escape always closes (and is consumed). ArrowUp/Down/Enter/Tab are
 * only consumed when the list is non-empty. Other keys are passed
 * through so the user can keep typing to narrow the list.
 */
export function handleAssetAutocompleteKeydown(e: KeyboardEvent): boolean {
  if (!activePopover) return false;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeAssetAutocomplete();
    return true;
  }

  // Mirror of entry-ref autocomplete v1.5 policy: Ctrl/Cmd+Enter is
  // reserved for editor-level shortcuts (notably textlog append). Close
  // the popup and pass the event through so the underlying handler can
  // run. Plain Enter still accepts the selected candidate. Canonical
  // decision + rationale live in
  // docs/development/entry-autocomplete-v1.5-modifier-enter.md.
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    closeAssetAutocomplete();
    return false;
  }

  if (visibleCandidates.length === 0) return false;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % visibleCandidates.length;
      updateSelection();
      return true;
    case 'ArrowUp':
      e.preventDefault();
      selectedIndex =
        (selectedIndex - 1 + visibleCandidates.length) % visibleCandidates.length;
      updateSelection();
      return true;
    case 'Enter':
    case 'Tab':
      e.preventDefault();
      insertCandidate(visibleCandidates[selectedIndex]!);
      return true;
    default:
      return false;
  }
}

function insertCandidate(cand: AssetCandidate): void {
  if (!activeTextarea || queryRangeStart < 0) return;
  const textarea = activeTextarea;
  const value = textarea.value;
  const caretPos = textarea.selectionStart ?? value.length;

  // Replace only the typed query, leaving the surrounding `(asset:` and
  // any trailing `)` intact. Caret lands at the end of the inserted key.
  const before = value.slice(0, queryRangeStart);
  const after = value.slice(caretPos);
  textarea.value = before + cand.key + after;

  const newPos = queryRangeStart + cand.key.length;
  textarea.selectionStart = textarea.selectionEnd = newPos;

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();

  closeAssetAutocomplete();
}

/**
 * Close the autocomplete popover if open. Safe to call when already
 * closed or from cleanup paths.
 */
export function closeAssetAutocomplete(): void {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
  activeTextarea = null;
  queryRangeStart = -1;
  selectedIndex = 0;
  allCandidates = [];
  visibleCandidates = [];
}
