/**
 * Entry-ref fragment completion — pure helpers for v1.4.
 *
 * When the user types `(entry:<lid>#<query>` inside a slash-eligible
 * textarea, we surface a popup of valid fragments for the target
 * entry. v1 supports textlog `log/<id>` and `day/<key>` fragments
 * only. See docs/development/entry-autocomplete-v1.4-fragment.md.
 */

import type { Entry } from '../../core/model/record';
import { parseTextlogBody } from '../textlog/textlog-body';
import { toLocalDateKey } from '../textlog/textlog-doc';
import { makeLogLabel } from '../markdown/markdown-toc';

export interface FragmentCompletionContext {
  /** lid already typed after `entry:`, before `#`. */
  lid: string;
  /** Position just after `#` (start of the fragment query). */
  queryStart: number;
  /** Text typed after `#` up to caret. */
  query: string;
}

export type FragmentKind = 'log' | 'day';

export interface FragmentCandidate {
  kind: FragmentKind;
  /**
   * Identifier inserted after `#`, e.g. `log/01HXYZ...` or
   * `day/2026-04-20`. Never starts with `#`.
   */
  fragment: string;
  /** Primary human-readable label shown in the popup row. */
  label: string;
  /** Optional secondary label (currently unused but reserved). */
  sub?: string;
}

/**
 * Detects a `(entry:<lid>#<query>|` fragment-completion context. Returns
 * the lid already in the URL, the position right after `#`, and the
 * fragment query typed so far.
 *
 * The `#` and preceding `entry:<lid>` must be literal text in the
 * buffer; we do not guess or rewrite the URL prefix. `(` must precede
 * `entry:` exactly as in the other triggers — guarantees we are inside
 * a markdown link URL part.
 *
 * Query charset: `[A-Za-z0-9_\-/]` — enough for `log/<id>` and
 * `day/<key>` forms. Whitespace or `)` end the run.
 */
export function findFragmentCompletionContext(
  text: string,
  caretPos: number,
): FragmentCompletionContext | null {
  // 1. Walk backward over fragment-valid chars to find queryStart.
  let queryStart = caretPos;
  while (queryStart > 0) {
    const ch = text[queryStart - 1]!;
    if (!/[A-Za-z0-9_\-/]/.test(ch)) break;
    queryStart--;
  }

  // 2. The char at queryStart-1 must be `#`.
  if (queryStart === 0 || text[queryStart - 1] !== '#') return null;

  // 3. Walk back over the lid preceding `#`.
  const hashPos = queryStart - 1;
  let lidStart = hashPos;
  while (lidStart > 0 && /[A-Za-z0-9_-]/.test(text[lidStart - 1]!)) {
    lidStart--;
  }
  // Empty lid ⇒ not a real context.
  if (lidStart === hashPos) return null;

  // 4. The 6 chars before the lid must be `entry:`.
  if (lidStart < 6) return null;
  if (text.slice(lidStart - 6, lidStart) !== 'entry:') return null;

  // 5. The char before `entry:` must be `(`.
  if (lidStart < 7) return null;
  if (text[lidStart - 7] !== '(') return null;

  const lid = text.slice(lidStart, hashPos);
  const query = text.slice(queryStart, caretPos);
  return { lid, queryStart, query };
}

/**
 * Collect fragment candidates for an entry. Order: logs newest first,
 * then days newest first. v1 supports only textlog archetype; other
 * archetypes return `[]` (popup will show empty state).
 */
export function collectFragmentCandidates(entry: Entry): FragmentCandidate[] {
  if (entry.archetype !== 'textlog') return [];

  const body = parseTextlogBody(entry.body);
  if (body.entries.length === 0) return [];

  const candidates: FragmentCandidate[] = [];
  const seenDays = new Set<string>();

  // Logs: newest first.
  for (let i = body.entries.length - 1; i >= 0; i--) {
    const log = body.entries[i]!;
    candidates.push({
      kind: 'log',
      fragment: `log/${log.id}`,
      label: makeLogLabel(log.createdAt, log.text),
    });
    const dayKey = toLocalDateKey(log.createdAt);
    if (dayKey) seenDays.add(dayKey);
  }

  // Days: newest first (dateKey sorts lexicographically).
  const days = Array.from(seenDays).sort().reverse();
  for (const dateKey of days) {
    candidates.push({
      kind: 'day',
      fragment: `day/${dateKey}`,
      label: dateKey,
    });
  }

  return candidates;
}

/**
 * Case-insensitive substring filter against `fragment` and `label`.
 * Empty query returns the full list unchanged.
 */
export function filterFragmentCandidates(
  all: readonly FragmentCandidate[],
  query: string,
): FragmentCandidate[] {
  if (query === '') return all.slice();
  const q = query.toLowerCase();
  return all.filter(
    (c) => c.fragment.toLowerCase().includes(q) || c.label.toLowerCase().includes(q),
  );
}
