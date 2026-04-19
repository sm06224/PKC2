/**
 * Entry-ref Autocomplete — inline popup for the `entry:` URL completion.
 *
 * See `docs/development/entry-autocomplete-v1.md` and `-v1.1.md` for
 * scope and terminology. Structurally mirrors `asset-autocomplete.ts`:
 * detection lives in a pure helper
 * (`features/entry-ref/entry-ref-autocomplete.ts`); this module handles
 * DOM lifecycle, keyboard routing, and textarea editing for two trigger
 * kinds:
 *
 *   - `entry-url`: caret inside `(entry:<query>`. Insert `<lid>` only.
 *   - `bracket`:   caret inside `[[<query>`. Replace `[[<query>` with
 *                  `[<label>](entry:<lid>)` (v1.1 wiki-style trigger).
 */

import type { Entry } from '../../core/model/record';
import { filterEntryCandidates } from '../../features/entry-ref/entry-ref-autocomplete';

export type EntryRefAutocompleteKind = 'entry-url' | 'bracket';

let activePopover: HTMLElement | null = null;
let activeTextarea: HTMLTextAreaElement | null = null;
/**
 * Start of the range to replace on accept (inclusive). For `entry-url`
 * this is the position right after `entry:` (replaces the query only).
 * For `bracket` this is the position of the first `[` (replaces
 * `[[<query>` wholesale).
 */
let replaceRangeStart = -1;
let activeKind: EntryRefAutocompleteKind = 'entry-url';
let selectedIndex = 0;
let allCandidates: Entry[] = [];
let visibleCandidates: Entry[] = [];

export function isEntryRefAutocompleteOpen(): boolean {
  return activePopover !== null;
}

/**
 * Open the autocomplete popover near the given textarea.
 *
 * When `candidates` is empty (no user entries other than the current one),
 * this is a no-op — there is nothing to suggest and the popover stays closed.
 *
 * @param replaceStart Start of the replacement range. Semantics depend on
 * `kind` — see {@link replaceRangeStart}.
 * @param kind         Trigger kind. Defaults to `entry-url` for backward
 * compatibility with v1 callers.
 */
export function openEntryRefAutocomplete(
  textarea: HTMLTextAreaElement,
  replaceStart: number,
  query: string,
  candidates: Entry[],
  root: HTMLElement,
  kind: EntryRefAutocompleteKind = 'entry-url',
): void {
  closeEntryRefAutocomplete();
  if (candidates.length === 0) return;

  activeTextarea = textarea;
  replaceRangeStart = replaceStart;
  activeKind = kind;
  allCandidates = candidates.slice();
  visibleCandidates = filterEntryCandidates(allCandidates, query);
  selectedIndex = 0;

  activePopover = document.createElement('div');
  activePopover.className = 'pkc-entry-ref-autocomplete';
  activePopover.setAttribute('data-pkc-region', 'entry-ref-autocomplete');

  renderItems();

  const rect = textarea.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  activePopover.style.position = 'absolute';
  activePopover.style.left = `${rect.left - rootRect.left}px`;
  activePopover.style.top = `${rect.bottom - rootRect.top + 4}px`;
  activePopover.style.zIndex = '100';

  root.appendChild(activePopover);
}

export function updateEntryRefAutocompleteQuery(query: string): void {
  if (!activePopover) return;
  visibleCandidates = filterEntryCandidates(allCandidates, query);
  selectedIndex = 0;
  renderItems();
}

function renderItems(): void {
  if (!activePopover) return;
  activePopover.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'pkc-entry-ref-autocomplete-heading';
  heading.textContent = 'entry: suggestions';
  activePopover.appendChild(heading);

  if (visibleCandidates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pkc-entry-ref-autocomplete-empty';
    empty.textContent = 'No matching entries.';
    activePopover.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'pkc-entry-ref-autocomplete-list';
  for (let i = 0; i < visibleCandidates.length; i++) {
    const cand = visibleCandidates[i]!;
    const item = document.createElement('div');
    item.className = 'pkc-entry-ref-autocomplete-item';
    if (i === selectedIndex) item.setAttribute('data-pkc-selected', 'true');
    item.setAttribute('data-pkc-lid', cand.lid);

    const title = document.createElement('span');
    title.className = 'pkc-entry-ref-autocomplete-title';
    title.textContent = cand.title || '(untitled)';
    item.appendChild(title);

    const lidSpan = document.createElement('span');
    lidSpan.className = 'pkc-entry-ref-autocomplete-lid';
    lidSpan.textContent = cand.lid;
    item.appendChild(lidSpan);

    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
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
  const items = activePopover.querySelectorAll('.pkc-entry-ref-autocomplete-item');
  for (let i = 0; i < items.length; i++) {
    if (i === selectedIndex) {
      items[i]!.setAttribute('data-pkc-selected', 'true');
    } else {
      items[i]!.removeAttribute('data-pkc-selected');
    }
  }
}

/**
 * Returns true iff the event was consumed. Escape always closes (and is
 * consumed). ArrowUp/Down/Enter/Tab are only consumed when the list is
 * non-empty.
 */
export function handleEntryRefAutocompleteKeydown(e: KeyboardEvent): boolean {
  if (!activePopover) return false;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeEntryRefAutocomplete();
    return true;
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

function insertCandidate(cand: Entry): void {
  if (!activeTextarea || replaceRangeStart < 0) return;
  const textarea = activeTextarea;
  const value = textarea.value;
  const caretPos = textarea.selectionStart ?? value.length;

  const before = value.slice(0, replaceRangeStart);
  const after = value.slice(caretPos);

  // Per v1.1: `bracket` replaces `[[<query>` wholesale with the canonical
  // markdown form, while `entry-url` only replaces the <query> run.
  const insertion =
    activeKind === 'bracket'
      ? `[${cand.title || cand.lid}](entry:${cand.lid})`
      : cand.lid;

  textarea.value = before + insertion + after;
  const newPos = replaceRangeStart + insertion.length;
  textarea.selectionStart = textarea.selectionEnd = newPos;

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();

  closeEntryRefAutocomplete();
}

export function closeEntryRefAutocomplete(): void {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
  activeTextarea = null;
  replaceRangeStart = -1;
  activeKind = 'entry-url';
  selectedIndex = 0;
  allCandidates = [];
  visibleCandidates = [];
}
