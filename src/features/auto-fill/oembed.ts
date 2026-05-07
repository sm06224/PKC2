/**
 * oEmbed client for filer auto-fill (領域 10-6 ζ'' Phase 3b).
 *
 * Privacy:
 *   - **No automatic fetch**. Callers must wire this to an explicit
 *     user gesture (button click, command palette item).
 *   - debug-privacy-philosophy.md "Local-only / Privacy by default"
 *     compliance: each provider endpoint is hit at most once per
 *     user-initiated request.
 *
 * Browser CORS:
 *   YouTube and Vimeo oEmbed allow CORS, so direct browser fetch
 *   works. niconico does NOT allow CORS — that provider is omitted
 *   from this initial wave and tracked in roadmap §10-6 Phase 3b.
 *
 * Spec: docs/development/filer-view-and-folder-display-profile-audit-2026-05.md §2.5.
 */

export interface OEmbedResponse {
  type?: string;
  version?: string;
  title?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
  provider_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  duration?: number;
  width?: number;
  height?: number;
  html?: string;
}

export interface OEmbedProviderConfig {
  /** Friendly identifier (e.g., 'YouTube'). */
  provider: string;
  /** URL host pattern that this provider answers. */
  hostMatch: RegExp;
  /** oEmbed endpoint that takes ?url=… */
  endpoint: string;
}

const PROVIDERS: OEmbedProviderConfig[] = [
  {
    provider: 'YouTube',
    hostMatch: /^(www\.|m\.)?youtube\.com$|^youtu\.be$/i,
    endpoint: 'https://www.youtube.com/oembed',
  },
  {
    provider: 'Vimeo',
    hostMatch: /^(www\.)?vimeo\.com$/i,
    endpoint: 'https://vimeo.com/api/oembed.json',
  },
];

export function findOEmbedProvider(url: string): OEmbedProviderConfig | null {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  for (const p of PROVIDERS) {
    if (p.hostMatch.test(host)) return p;
  }
  return null;
}

/**
 * Fetch oEmbed metadata for a supported URL. Throws on network /
 * provider errors so the caller can surface them to the user.
 *
 * `fetchImpl` is injected to keep the function unit-testable; default
 * is the global `fetch`.
 */
export async function fetchOEmbed(
  url: string,
  fetchImpl: typeof fetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || fetch,
): Promise<OEmbedResponse> {
  const provider = findOEmbedProvider(url);
  if (!provider) throw new Error(`No oEmbed provider for URL: ${url}`);
  const endpoint = `${provider.endpoint}?url=${encodeURIComponent(url)}&format=json`;
  const res = await fetchImpl(endpoint, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`oEmbed fetch failed (${res.status}): ${endpoint}`);
  }
  const json = (await res.json()) as OEmbedResponse;
  return json;
}

/**
 * Map an oEmbed response to a flat frontmatter delta. Only sets
 * fields the response actually carried, so callers can spread it
 * over an existing meta object without clobbering user edits.
 */
export function oEmbedToFrontmatter(res: OEmbedResponse, url: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  out.url = url;
  if (res.title) out.title = res.title;
  if (res.author_name) out.channel = res.author_name;
  if (res.provider_name) out.provider = res.provider_name;
  if (res.thumbnail_url) out.thumbnail = res.thumbnail_url;
  if (typeof res.duration === 'number' && Number.isFinite(res.duration)) {
    // ISO-8601 duration is preferred for serialization; YouTube oEmbed
    // doesn't return duration today (only embed html), so this is a
    // best-effort hint that future providers can populate.
    out.duration_sec = res.duration;
  }
  out.kind = 'video';
  return out;
}
