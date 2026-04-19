/**
 * Entry-ref Autocomplete — pure helpers for the `entry:` URL completion.
 *
 * Mirrors the shape of `adapter/ui/asset-autocomplete.ts` context detector
 * but for `entry:` instead of `asset:`. See
 * `docs/development/entry-autocomplete-v1.md` and `-v1.1.md` for
 * terminology and scope.
 */

import type { Entry } from '../../core/model/record';

export interface EntryCompletionContext {
  queryStart: number;
  query: string;
}

export interface BracketCompletionContext {
  /** Position of the first `[` of the `[[` trigger. */
  bracketStart: number;
  /** Text typed after `[[` up to caret. Excludes newline and `]`. */
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
 * Returns `{ bracketStart, query }` when the caret sits inside a `[[<query>|`
 * wiki-style trigger context. `|` is the caret; `<query>` is any run of
 * characters that does not contain `]` or newline.
 *
 * Walks backward from caret, bailing on `]` or newline. A context exists
 * when we find `[[` before either the string start or a bail character.
 * Nested `[[` are handled by taking the *innermost* (closest to caret)
 * `[[` pair.
 */
export function findBracketCompletionContext(
  text: string,
  caretPos: number,
): BracketCompletionContext | null {
  if (caretPos < 2) return null;

  for (let i = caretPos; i >= 2; i--) {
    const ch = text[i - 1];
    if (ch === '\n' || ch === ']') return null;
    if (ch === '[' && text[i - 2] === '[') {
      const bracketStart = i - 2;
      return { bracketStart, query: text.slice(i, caretPos) };
    }
  }
  return null;
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
