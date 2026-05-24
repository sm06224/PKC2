/**
 * Textlog log entry search(pgc-155 wave-δ #22、handoff §3.3)。
 *
 * pure features 層。textlog の log entries を keyword 部分一致
 * (case-insensitive)で絞り込む helper。space で分割した複数 token
 * の AND 条件、空 query は全件返却。Inspector / footer に hit
 * count を表示するため `{ matches, totalHits, totalEntries }` を返す。
 */

import type { TextlogEntry } from './textlog-body';

export interface TextlogSearchResult {
  /** Filtered entries (preserving original order). Same reference as input when query is empty. */
  matches: readonly TextlogEntry[];
  /** Number of entries matching all tokens. */
  totalHits: number;
  /** Total entries before filtering(used to render `M / N` count). */
  totalEntries: number;
  /** Whether the query was effectively empty (whitespace only). */
  isEmpty: boolean;
}

/**
 * Filter log entries by `query`. Tokens are split on whitespace
 * and combined with AND semantics; each token is matched
 * case-insensitively against the entry text. Empty query returns
 * everything.
 *
 * Stable across calls(no clock / network / DOM dependency), safe
 * to memoize at UI layer.
 */
export function searchTextlogEntries(
  entries: readonly TextlogEntry[],
  query: string,
): TextlogSearchResult {
  const trimmed = (query ?? '').trim();
  if (trimmed === '') {
    return {
      matches: entries,
      totalHits: entries.length,
      totalEntries: entries.length,
      isEmpty: true,
    };
  }
  const tokens = trimmed.toLowerCase().split(/\s+/);
  const matches: TextlogEntry[] = [];
  for (const e of entries) {
    const haystack = e.text.toLowerCase();
    let ok = true;
    for (const tok of tokens) {
      if (!haystack.includes(tok)) {
        ok = false;
        break;
      }
    }
    if (ok) matches.push(e);
  }
  return {
    matches,
    totalHits: matches.length,
    totalEntries: entries.length,
    isEmpty: false,
  };
}
