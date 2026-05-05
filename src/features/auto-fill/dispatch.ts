/**
 * Auto-fill dispatcher (領域 10-6 ζ'' Phase 3b).
 *
 * Generic entry point: given a URL string and optional ISBN hint,
 * picks the right provider client and returns the frontmatter delta
 * plus a thumbnail data URL when one was discovered.
 *
 * Privacy: every call hits at most one external endpoint; callers
 * must invoke this only on explicit user gestures.
 */

import { classifyUrl } from '../classification/url-host';
import { fetchOEmbed, oEmbedToFrontmatter, findOEmbedProvider } from './oembed';
import { fetchOpenBd, openBdToFrontmatter, extractIsbn } from './openbd';

export interface AutoFillResult {
  /** Frontmatter delta to merge into the entry body. */
  meta: Record<string, string | number>;
  /** Thumbnail URL discovered (may be remote https URL). */
  thumbnail?: string | null;
  /** Friendly name of the provider that answered. */
  provider: string;
}

export async function autoFillFromUrl(
  url: string,
  fetchImpl?: typeof fetch,
): Promise<AutoFillResult | null> {
  const classification = classifyUrl(url);
  if (!classification) return null;

  // 1. oEmbed video providers (YouTube / Vimeo).
  if (findOEmbedProvider(url)) {
    const res = await fetchOEmbed(url, fetchImpl);
    return {
      meta: oEmbedToFrontmatter(res, url),
      thumbnail: res.thumbnail_url ?? null,
      provider: res.provider_name ?? classification.provider,
    };
  }

  // 2. Book providers — extract ISBN from URL then call OpenBD.
  if (classification.kind === 'book') {
    const isbn = extractIsbn(url);
    if (!isbn) return null;
    const summary = await fetchOpenBd(isbn, fetchImpl);
    if (!summary) return null;
    return {
      meta: openBdToFrontmatter(summary),
      thumbnail: summary.cover ?? null,
      provider: 'OpenBD',
    };
  }

  return null;
}
