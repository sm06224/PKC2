/**
 * Entry-ref Autocomplete — inline popup for entry-ref authoring.
 *
 * See `docs/development/entry-autocomplete-v1.md` / `-v1.1.md` /
 * `-v1.2-textlog.md` / `-v1.3-recent-first.md` / `-v1.4-fragment.md`
 * for scope and terminology. Structurally mirrors `asset-autocomplete.ts`:
 * detection lives in pure helpers; this module handles DOM lifecycle,
 * keyboard routing, and textarea editing for three modes:
 *
 *   - `entry-url` (v1): caret inside `(entry:<query>`. Insert lid.
 *   - `bracket`   (v1.1): caret inside `[[<query>`. Replace wholesale
 *                 with `[<label>](entry:<lid>)`.
 *   - `fragment`  (v1.4): caret inside `(entry:<lid>#<query>`. Insert
 *                 the fragment identifier (e.g. `log/<id>`).
 */

import type { Entry } from '../../core/model/record';
import { filterEntryCandidates } from '../../features/entry-ref/entry-ref-autocomplete';
import {
  filterFragmentCandidates,
  type FragmentCandidate,
} from '../../features/entry-ref/fragment-completion';

export type EntryRefAutocompleteKind = 'entry-url' | 'bracket';
type PopupMode = 'entry' | 'fragment';

/**
 * v1.3: callback invoked when the user accepts an ENTRY candidate.
 * Only fires for `entry-url` / `bracket` modes — fragment acceptance
 * does not feed the recent-first LRU (LRU keys are lids, not
 * fragments). The action-binder registers a handler that dispatches
 * `RECORD_ENTRY_REF_SELECTION`.
 */
let insertCallback: ((lid: string) => void) | null = null;

export function registerEntryRefInsertCallback(
  cb: ((lid: string) => void) | null,
): void {
  insertCallback = cb;
}

let activePopover: HTMLElement | null = null;
let activeTextarea: HTMLTextAreaElement | null = null;
/**
 * Start of the range to replace on accept (inclusive). Semantics depend
 * on mode + kind:
 *   - `entry-url`: position right after `entry:` (replace <query> only)
 *   - `bracket`:   position of the first `[` (replace `[[<query>` wholesale)
 *   - `fragment`:  position right after `#` (replace <query> only)
 */
let replaceRangeStart = -1;
let activeMode: PopupMode = 'entry';
let activeKind: EntryRefAutocompleteKind = 'entry-url';
let selectedIndex = 0;
let allEntries: Entry[] = [];
let visibleEntries: Entry[] = [];
let allFragments: FragmentCandidate[] = [];
let visibleFragments: FragmentCandidate[] = [];

export function isEntryRefAutocompleteOpen(): boolean {
  return activePopover !== null;
}

/**
 * Visible candidate count (mode-aware). Used by the keyboard handler
 * for wraparound + empty-list checks.
 */
function visibleCount(): number {
  return activeMode === 'entry' ? visibleEntries.length : visibleFragments.length;
}

/**
 * Open the autocomplete popover near the given textarea for an ENTRY
 * candidate list (`entry-url` or `bracket` kind). No-op when candidates
 * is empty.
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

  activeMode = 'entry';
  activeKind = kind;
  activeTextarea = textarea;
  replaceRangeStart = replaceStart;
  allEntries = candidates.slice();
  visibleEntries = filterEntryCandidates(allEntries, query);
  selectedIndex = 0;

  mountPopover(textarea, root);
}

/**
 * v1.4: open the autocomplete popover in fragment mode. Unlike the
 * entry entry point, fragment mode opens even when `candidates` is
 * empty — the empty state communicates "this entry has no fragments"
 * explicitly (e.g. a text archetype or an empty textlog).
 */
export function openFragmentAutocomplete(
  textarea: HTMLTextAreaElement,
  replaceStart: number,
  query: string,
  candidates: FragmentCandidate[],
  root: HTMLElement,
): void {
  closeEntryRefAutocomplete();

  activeMode = 'fragment';
  activeKind = 'entry-url'; // unused in fragment mode, kept for reset symmetry
  activeTextarea = textarea;
  replaceRangeStart = replaceStart;
  allFragments = candidates.slice();
  visibleFragments = filterFragmentCandidates(allFragments, query);
  selectedIndex = 0;

  mountPopover(textarea, root);
}

function mountPopover(textarea: HTMLTextAreaElement, root: HTMLElement): void {
  activePopover = document.createElement('div');
  activePopover.className = 'pkc-entry-ref-autocomplete';
  activePopover.setAttribute('data-pkc-region', 'entry-ref-autocomplete');
  activePopover.setAttribute('data-pkc-mode', activeMode);

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
  if (!activePopover || activeMode !== 'entry') return;
  visibleEntries = filterEntryCandidates(allEntries, query);
  selectedIndex = 0;
  renderItems();
}

export function updateFragmentAutocompleteQuery(query: string): void {
  if (!activePopover || activeMode !== 'fragment') return;
  visibleFragments = filterFragmentCandidates(allFragments, query);
  selectedIndex = 0;
  renderItems();
}

function renderItems(): void {
  if (!activePopover) return;
  activePopover.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'pkc-entry-ref-autocomplete-heading';
  heading.textContent =
    activeMode === 'fragment' ? 'fragment: suggestions' : 'entry: suggestions';
  activePopover.appendChild(heading);

  const visible = activeMode === 'entry' ? visibleEntries : visibleFragments;
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pkc-entry-ref-autocomplete-empty';
    empty.textContent =
      activeMode === 'fragment' ? 'No fragments.' : 'No matching entries.';
    activePopover.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'pkc-entry-ref-autocomplete-list';
  for (let i = 0; i < visible.length; i++) {
    const item =
      activeMode === 'entry'
        ? renderEntryItem(visibleEntries[i]!, i)
        : renderFragmentItem(visibleFragments[i]!, i);
    list.appendChild(item);
  }
  activePopover.appendChild(list);
}

function renderEntryItem(cand: Entry, i: number): HTMLElement {
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
    insertEntryCandidate(cand);
  });
  item.addEventListener('mouseenter', () => {
    selectedIndex = i;
    updateSelection();
  });
  return item;
}

function renderFragmentItem(cand: FragmentCandidate, i: number): HTMLElement {
  const item = document.createElement('div');
  item.className = 'pkc-entry-ref-autocomplete-item';
  if (i === selectedIndex) item.setAttribute('data-pkc-selected', 'true');
  item.setAttribute('data-pkc-fragment-kind', cand.kind);
  item.setAttribute('data-pkc-fragment', cand.fragment);

  const kindBadge = document.createElement('span');
  kindBadge.className = 'pkc-entry-ref-autocomplete-fragment-kind';
  kindBadge.textContent = cand.kind;
  item.appendChild(kindBadge);

  const label = document.createElement('span');
  label.className = 'pkc-entry-ref-autocomplete-title';
  label.textContent = cand.label;
  item.appendChild(label);

  const fragSpan = document.createElement('span');
  fragSpan.className = 'pkc-entry-ref-autocomplete-lid';
  fragSpan.textContent = cand.fragment;
  item.appendChild(fragSpan);

  item.addEventListener('mousedown', (e) => {
    e.preventDefault();
    insertFragmentCandidate(cand);
  });
  item.addEventListener('mouseenter', () => {
    selectedIndex = i;
    updateSelection();
  });
  return item;
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

  // v1.5: Ctrl/Cmd+Enter is reserved for editor-level shortcuts
  // (notably textlog append via action-binder). Always close the popup
  // and pass the event through so the underlying handler can run. Plain
  // Enter still accepts the selected candidate. See
  // docs/development/entry-autocomplete-v1.5-modifier-enter.md.
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    closeEntryRefAutocomplete();
    return false;
  }

  const count = visibleCount();
  if (count === 0) return false;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % count;
      updateSelection();
      return true;
    case 'ArrowUp':
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + count) % count;
      updateSelection();
      return true;
    case 'Enter':
    case 'Tab':
      e.preventDefault();
      if (activeMode === 'entry') {
        insertEntryCandidate(visibleEntries[selectedIndex]!);
      } else {
        insertFragmentCandidate(visibleFragments[selectedIndex]!);
      }
      return true;
    default:
      return false;
  }
}

function insertEntryCandidate(cand: Entry): void {
  if (!activeTextarea || replaceRangeStart < 0) return;
  const textarea = activeTextarea;
  const value = textarea.value;
  const caretPos = textarea.selectionStart ?? value.length;

  const before = value.slice(0, replaceRangeStart);
  const after = value.slice(caretPos);

  const insertion =
    activeKind === 'bracket'
      ? `[${cand.title || cand.lid}](entry:${cand.lid})`
      : cand.lid;

  textarea.value = before + insertion + after;
  const newPos = replaceRangeStart + insertion.length;
  textarea.selectionStart = textarea.selectionEnd = newPos;

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();

  insertCallback?.(cand.lid);

  closeEntryRefAutocomplete();
}

function insertFragmentCandidate(cand: FragmentCandidate): void {
  if (!activeTextarea || replaceRangeStart < 0) return;
  const textarea = activeTextarea;
  const value = textarea.value;
  const caretPos = textarea.selectionStart ?? value.length;

  const before = value.slice(0, replaceRangeStart);
  const after = value.slice(caretPos);

  // Fragment mode replaces only the <query> after `#`.
  textarea.value = before + cand.fragment + after;
  const newPos = replaceRangeStart + cand.fragment.length;
  textarea.selectionStart = textarea.selectionEnd = newPos;

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();

  // Fragment acceptance does NOT drive the recent-first LRU (v1.3 keys
  // are lids). If fragment-level recency becomes valuable, introduce a
  // separate slice in v1.5+.

  closeEntryRefAutocomplete();
}

export function closeEntryRefAutocomplete(): void {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
  activeTextarea = null;
  replaceRangeStart = -1;
  activeMode = 'entry';
  activeKind = 'entry-url';
  selectedIndex = 0;
  allEntries = [];
  visibleEntries = [];
  allFragments = [];
  visibleFragments = [];
}
