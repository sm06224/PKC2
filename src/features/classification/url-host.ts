/**
 * URL classification (領域 10-6 ζ'' Phase 3a-r1).
 *
 * Maps a URL string to a coarse "kind" so the filer view can group
 * entries that link to the same provider family. Used by:
 *   - book-base subset (Amazon / 楽天ブックス / honto / OpenBD)
 *   - video-base subset (YouTube / niconico / Vimeo / Twitch)
 *   - novel-base subset (小説家になろう / カクヨム / pixiv 小説)
 *   - generic url-base catch-all
 *
 * Pure TS, dep-zero. The host → kind map is intentionally additive
 * (callers can override with their own table) so the user can extend
 * to any future provider via runtime configuration.
 */

export type UrlKind =
  | 'book'
  | 'video'
  | 'novel'
  | 'music'
  | 'podcast'
  | 'social'
  | 'shop'
  | 'paper'
  | 'unknown';

export interface UrlClassification {
  url: string;
  host: string;
  kind: UrlKind;
  /** Provider name (display label), e.g., 'YouTube', 'niconico'. */
  provider: string;
}

const HOST_RULES: { match: RegExp; kind: UrlKind; provider: string }[] = [
  // Books / shops
  { match: /^(www\.)?amazon\.(co\.jp|com|de|co\.uk|fr|es|it)$/i, kind: 'book', provider: 'Amazon' },
  { match: /^(books|item|www)\.rakuten\.co\.jp$/i, kind: 'book', provider: '楽天ブックス' },
  { match: /^(www\.)?honto\.jp$/i, kind: 'book', provider: 'honto' },
  { match: /^(www\.)?kinokuniya\.co\.jp$/i, kind: 'book', provider: '紀伊國屋' },
  { match: /^(www\.)?openbd\.jp$/i, kind: 'book', provider: 'OpenBD' },
  { match: /^books\.google\./i, kind: 'book', provider: 'Google Books' },
  { match: /^(www\.)?bookmeter\.com$/i, kind: 'book', provider: '読書メーター' },

  // Video
  { match: /^(www\.|m\.)?youtube\.com$/i, kind: 'video', provider: 'YouTube' },
  { match: /^youtu\.be$/i, kind: 'video', provider: 'YouTube' },
  { match: /^(www\.|sp\.)?nicovideo\.jp$/i, kind: 'video', provider: 'ニコニコ動画' },
  { match: /^(www\.)?vimeo\.com$/i, kind: 'video', provider: 'Vimeo' },
  { match: /^(www\.)?twitch\.tv$/i, kind: 'video', provider: 'Twitch' },
  { match: /^(www\.)?bilibili\.com$/i, kind: 'video', provider: 'bilibili' },

  // Novels / web fiction
  { match: /^(www\.|ncode\.|novel18\.|mypage\.)syosetu\.com$/i, kind: 'novel', provider: '小説家になろう' },
  { match: /^kakuyomu\.jp$/i, kind: 'novel', provider: 'カクヨム' },
  { match: /^novel\.pixiv\.net$/i, kind: 'novel', provider: 'pixiv 小説' },
  { match: /^(www\.)?aozora\.gr\.jp$/i, kind: 'novel', provider: '青空文庫' },
  { match: /^(www\.)?wattpad\.com$/i, kind: 'novel', provider: 'Wattpad' },

  // Music
  { match: /^(open|play)\.spotify\.com$/i, kind: 'music', provider: 'Spotify' },
  { match: /^music\.apple\.com$/i, kind: 'music', provider: 'Apple Music' },
  { match: /^(www\.)?soundcloud\.com$/i, kind: 'music', provider: 'SoundCloud' },
  { match: /^(www\.)?bandcamp\.com$/i, kind: 'music', provider: 'Bandcamp' },

  // Podcasts
  { match: /^podcasts\.apple\.com$/i, kind: 'podcast', provider: 'Apple Podcasts' },
  { match: /^(www\.)?listen\.style$/i, kind: 'podcast', provider: 'LISTEN' },

  // Social
  { match: /^(www\.|mobile\.)?(twitter|x)\.com$/i, kind: 'social', provider: 'X / Twitter' },
  { match: /^(www\.)?instagram\.com$/i, kind: 'social', provider: 'Instagram' },
  { match: /^(www\.|threads\.)?net$/i, kind: 'social', provider: 'Threads' },
  { match: /^(www\.)?reddit\.com$/i, kind: 'social', provider: 'Reddit' },
  { match: /^(www\.|jp\.)?bsky\.app$/i, kind: 'social', provider: 'Bluesky' },
  { match: /^(www\.)?mastodon\.social$/i, kind: 'social', provider: 'Mastodon' },

  // Academic
  { match: /^(www\.)?(arxiv|biorxiv|medrxiv)\.org$/i, kind: 'paper', provider: 'arXiv 系' },
  { match: /^doi\.org$/i, kind: 'paper', provider: 'DOI' },
  { match: /^(scholar|books)\.google\.com$/i, kind: 'paper', provider: 'Google Scholar' },
  { match: /^(www\.)?semanticscholar\.org$/i, kind: 'paper', provider: 'Semantic Scholar' },

  // Shops (generic)
  { match: /^(www\.)?mercari\.com$/i, kind: 'shop', provider: 'メルカリ' },
  { match: /^(item|shopping)\.yahoo\.co\.jp$/i, kind: 'shop', provider: 'Yahoo!ショッピング' },
];

export function classifyUrl(input: string): UrlClassification | null {
  if (!input) return null;
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }
  const host = parsed.host.toLowerCase();
  for (const rule of HOST_RULES) {
    if (rule.match.test(host)) {
      return { url: input, host, kind: rule.kind, provider: rule.provider };
    }
  }
  return { url: input, host, kind: 'unknown', provider: host };
}

/**
 * Find the first URL inside a body (markdown or plain text) and
 * classify it. Returns null when no URL is present or the URL doesn't
 * resolve to a recognized kind.
 */
export function classifyFirstUrlInBody(body: string): UrlClassification | null {
  if (!body) return null;
  const m = body.match(/https?:\/\/[^\s)]+/i);
  if (!m) return null;
  return classifyUrl(m[0]);
}

/**
 * Classify by `url:` field in frontmatter. Returns null if the
 * frontmatter has no url or it doesn't parse.
 */
export function classifyFrontmatterUrl(meta: Record<string, unknown>): UrlClassification | null {
  const v = meta['url'];
  if (typeof v !== 'string') return null;
  return classifyUrl(v);
}
