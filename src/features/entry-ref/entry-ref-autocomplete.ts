/**
 * Entry-ref Autocomplete — pure helpers for the `entry:` URL completion.
 *
 * Mirrors the shape of `adapter/ui/asset-autocomplete.ts` context detector
 * but for `entry:` instead of `asset:`. See
 * `docs/development/entry-autocomplete-v1.md` for terminology and scope.
 */

import type { Entry } from '../../core/model/record';

export interface EntryCompletionContext {
  queryStart: number;
  query: string;
}

/**
 * Returns `{ queryStart, query }` when the caret sits inside a
 * `(entry:<query>|` completion context. `|` is the caret; `<query>` is a
 * (possibly empty) run of `[A-Za-z0-9_-]`.
 *
 * Requires the literal `(` immediately before `entry:` so that plain-text
 * occurrences (e.g. inside a URL, code block, or prose) never trigger —
 * the `(` is the markdown link URL opener.
 */
export function findEntryCompletionContext(
  text: string,
  caretPos: number,
): EntryCompletionContext | null {
  if (caretPos < 7) return null;

  let start = caretPos;
  while (start > 0) {
    const ch = text[start - 1]!;
    if (!/[A-Za-z0-9_-]/.test(ch)) break;
    start--;
  }

  if (start < 7) return null;
  if (text.slice(start - 6, start) !== 'entry:') return null;
  if (text[start - 7] !== '(') return null;

  return { queryStart: start, query: text.slice(start, caretPos) };
}

/**
 * Case-insensitive substring match against both `title` and `lid`. Empty
 * query returns the full list unchanged (callers are expected to have
 * already filtered out system entries, the current entry, etc.).
 */
export function filterEntryCandidates(
  all: readonly Entry[],
  query: string,
): Entry[] {
  if (query === '') return all.slice();
  const q = query.toLowerCase();
  return all.filter(
    (e) => e.lid.toLowerCase().includes(q) || e.title.toLowerCase().includes(q),
  );
}
