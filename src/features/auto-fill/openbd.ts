/**
 * OpenBD ISBN auto-fill client (領域 10-6 ζ'' Phase 3b).
 *
 * https://openbd.jp — Japanese book bibliography API. CORS open.
 * Used to fill `kind: book` frontmatter (title / author /
 * publisher / pubdate / cover URL) from an ISBN.
 *
 * Privacy:
 *   - No automatic fetch. Callers gate on an explicit user gesture.
 *   - Single endpoint hit per call, no telemetry.
 */

export interface OpenBdSummary {
  isbn?: string;
  title?: string;
  volume?: string;
  series?: string;
  publisher?: string;
  pubdate?: string;
  cover?: string;
  author?: string;
}

interface RawSummary {
  summary?: OpenBdSummary;
}

const ISBN_RE = /(?:[\dX]-?){9,14}/i;

/**
 * Extract an ISBN-10 / ISBN-13 candidate from a string. Returns the
 * digits-only normalization (no hyphens) or null when nothing
 * resembles an ISBN.
 */
export function extractIsbn(input: string): string | null {
  if (!input) return null;
  // Amazon URLs commonly carry the 10-digit ASIN at /dp/<asin>;
  // when the ASIN is a valid 10-character ISBN that's enough to pass
  // to OpenBD verbatim.
  const m = input.match(/\/dp\/([0-9A-Z]{10})/i) ?? input.match(ISBN_RE);
  if (!m) return null;
  const cleaned = m[1] ? m[1] : (m[0] ?? '').replace(/[^0-9X]/gi, '');
  if (cleaned.length === 10 || cleaned.length === 13) return cleaned;
  return null;
}

/**
 * Fetch OpenBD bibliography for a given ISBN. Returns null when the
 * ISBN is unknown to OpenBD (404 / empty body / no summary). Throws
 * on network / 5xx so the caller can surface the error.
 */
export async function fetchOpenBd(
  isbn: string,
  fetchImpl: typeof fetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || fetch,
): Promise<OpenBdSummary | null> {
  if (!isbn) return null;
  const url = `https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`;
  const res = await fetchImpl(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`OpenBD fetch failed (${res.status}) for ${isbn}`);
  }
  const json = (await res.json()) as Array<RawSummary | null>;
  if (!Array.isArray(json) || json.length === 0) return null;
  const first = json[0];
  if (!first || !first.summary) return null;
  return first.summary;
}

/**
 * Convert an OpenBD summary into a flat frontmatter delta for a
 * `kind: book` entry. Spreads cleanly over existing frontmatter.
 */
export function openBdToFrontmatter(s: OpenBdSummary): Record<string, string> {
  const out: Record<string, string> = { kind: 'book' };
  if (s.isbn) out.isbn = s.isbn;
  if (s.title) out.title = s.title;
  if (s.author) out.author = s.author;
  if (s.publisher) out.publisher = s.publisher;
  if (s.pubdate) out.year = s.pubdate.slice(0, 4);
  if (s.cover) out.cover = s.cover;
  return out;
}
