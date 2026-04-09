/**
 * Asset Reference Resolution — foundation + non-image extension.
 *
 * Features layer — pure function, no browser APIs.
 *
 * Supports two reference forms:
 *
 *   Image embed (existing):
 *     ![alt](asset:asset_key)
 *     ![alt](asset:asset_key "title")
 *
 *   Non-image chip / link (new):
 *     [label](asset:asset_key)
 *     [label](asset:asset_key "title")
 *
 * Before markdown-it renders the text, `resolveAssetReferences()` scans
 * the markdown source for `asset:` references and substitutes them with
 * safe output:
 *
 *   - Image form + image MIME in the allowlist  → inline `data:` URI
 *     (unchanged from the original resolver).
 *   - Link form + supported non-image category  → a markdown link to a
 *     fragment URL `#asset-<key>`, rendered with a category icon +
 *     human-readable label. The adapter layer intercepts clicks on
 *     `a[href^="#asset-"]` to trigger download.
 *   - Unknown key                                → `*[missing asset: key]*`
 *   - Unsupported MIME for the chosen form       → `*[unsupported asset: key]*`
 *
 * Resolution is a pre-processing pass done by the presenter, not a
 * custom renderer rule. The markdown renderer itself stays stateless
 * and retains its `html: false` hardening — all output is plain
 * CommonMark.
 *
 * Scope (foundation):
 *   - Non-image handling is an inert chip: it shows the category icon
 *     and label, and clicking it downloads the raw asset. No inline
 *     PDF viewer, no media player, no preview card.
 *   - SVG is still excluded (executable document).
 *   - Non-image asset MIMEs that fall outside the known categories are
 *     rendered as a generic file chip (`other`) rather than an
 *     unsupported marker — any asset that exists in the container is
 *     downloadable even if its category is unrecognised.
 */

/**
 * Context passed to the resolver. Built by the adapter layer at render
 * time from the current container's attachment entries.
 */
export interface AssetResolutionContext {
  /** Map from asset_key → base64 data (mirrors `container.assets`). */
  assets: Record<string, string>;
  /** Map from asset_key → MIME type (derived from attachment entries). */
  mimeByKey: Record<string, string>;
  /**
   * Optional map from asset_key → display name (from the attachment
   * entry's `name`). Used as a fallback label for `[](asset:key)`
   * references with empty label text. Omitting this is safe — the
   * sanitized key is used instead.
   */
  nameByKey?: Record<string, string>;
}

/** MIME allowlist for inline image embedding. */
const SUPPORTED_IMAGE_MIMES = /^image\/(png|jpeg|gif|webp)$/i;

/**
 * Matches `![alt](asset:key)` or `![alt](asset:key "title")`.
 * Alt text cannot contain `]`, key cannot contain whitespace or `)`.
 */
const ASSET_IMAGE_RE = /!\[([^\]]*)\]\(asset:([^\s)"]+)(?:\s+"([^"]*)")?\)/g;

/**
 * Matches `[label](asset:key)` or `[label](asset:key "title")`, but NOT
 * when preceded by `!` (which would be the image form handled above).
 *
 * We capture the preceding character in group 1 so that non-image
 * matches can re-emit it unchanged. JavaScript's RegExp does not
 * support negative lookbehind in every target — a leading group is
 * portable and equally safe.
 */
const ASSET_LINK_RE = /(^|[^!\\])\[([^\]]*)\]\(asset:([^\s)"]+)(?:\s+"([^"]*)")?\)/g;

/** Asset keys are `ast-{ts}-{rand}` — alphanumerics, dashes, underscores. */
const SAFE_KEY_RE = /^[A-Za-z0-9_-]+$/;

/** Cheap presence check for either form, used as a skip gate. */
const ANY_ASSET_REF_RE = /!?\[[^\]]*\]\(asset:[^\s)"]+/;

/**
 * Coarse categories for non-image assets. Each category maps to an
 * icon and a small amount of chrome when rendered as a chip. Anything
 * not recognised falls through to `other` — the asset is still
 * downloadable.
 */
export type AssetMimeCategory =
  | 'image'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'archive'
  | 'other';

/**
 * Classify a MIME string into a coarse category used by the non-image
 * resolver. Pure function — no regex state, no allocation beyond the
 * return value.
 */
export function classifyAssetMimeCategory(mime: string): AssetMimeCategory {
  if (!mime) return 'other';
  const m = mime.toLowerCase();
  if (SUPPORTED_IMAGE_MIMES.test(m)) return 'image';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (
    m === 'application/zip' ||
    m === 'application/x-zip-compressed' ||
    m === 'application/x-tar' ||
    m === 'application/gzip' ||
    m === 'application/x-gzip' ||
    m === 'application/x-7z-compressed' ||
    m === 'application/x-rar-compressed' ||
    m === 'application/vnd.rar'
  ) {
    return 'archive';
  }
  return 'other';
}

/** Unicode glyph used in the rendered chip label for each category. */
const CATEGORY_ICON: Record<Exclude<AssetMimeCategory, 'image'>, string> = {
  pdf: '📄',
  audio: '🎵',
  video: '🎬',
  archive: '🗜',
  other: '📎',
};

/**
 * Replace all `asset:` references in the given markdown source with
 * resolved output.
 *
 * Order matters: the image pass runs first so that `![…](asset:…)`
 * tokens are either substituted with a `data:` URI or with a fallback
 * marker before the link pass ever sees them. That makes the link-form
 * regex safe to use without lookbehind — by the time it runs, no
 * unresolved `![…]` prefix can mask a link target.
 *
 * The returned string is still markdown — it should be passed to
 * `renderMarkdown()` afterwards.
 */
export function resolveAssetReferences(
  markdown: string,
  ctx: AssetResolutionContext
): string {
  if (!markdown) return '';

  // Pass 1 — image embeds (unchanged behavior).
  let out = markdown.replace(ASSET_IMAGE_RE, (_match, altRaw: string, keyRaw: string, titleRaw?: string) => {
    const alt = altRaw;
    const key = keyRaw;
    const title = titleRaw ?? '';

    const safeKey = sanitizeKeyForDisplay(key);

    const data = ctx.assets[key];
    const mime = ctx.mimeByKey[key];

    if (!data || !mime) {
      return `*[missing asset: ${safeKey}]*`;
    }
    if (!SUPPORTED_IMAGE_MIMES.test(mime)) {
      return `*[unsupported asset: ${safeKey}]*`;
    }

    // Build the data URI. Base64 alphabet is `[A-Za-z0-9+/=]` — none of
    // these characters terminate the markdown image URL, so no escaping
    // of parentheses is needed.
    const dataUri = `data:${mime};base64,${data}`;
    const titleSuffix = title ? ` "${escapeTitle(title)}"` : '';
    return `![${alt}](${dataUri}${titleSuffix})`;
  });

  // Pass 2 — non-image link chips.
  //
  // The leading character (group 1) is re-emitted unchanged so we do
  // not consume whatever preceded the `[`. The image pass has already
  // rewritten `![…](asset:…)` tokens, so any `[label](asset:…)` that
  // survives here is unambiguously a link-form reference.
  out = out.replace(ASSET_LINK_RE, (_match, prefix: string, labelRaw: string, keyRaw: string, _titleRaw?: string) => {
    const key = keyRaw;
    const safeKey = sanitizeKeyForDisplay(key);

    const data = ctx.assets[key];
    const mime = ctx.mimeByKey[key];

    if (!data || !mime) {
      return `${prefix}*[missing asset: ${safeKey}]*`;
    }

    const category = classifyAssetMimeCategory(mime);

    // Images use the `![…](asset:…)` form; a link-form reference to an
    // image MIME is considered a user mistake — fall back to the
    // unsupported marker so it is visible and fixable. (SVG also lands
    // here because it is not in the image allowlist either.)
    if (category === 'image' || mime.toLowerCase() === 'image/svg+xml') {
      return `${prefix}*[unsupported asset: ${safeKey}]*`;
    }

    const icon = CATEGORY_ICON[category];
    const label = chooseLabel(labelRaw, key, safeKey, ctx.nameByKey);
    const safeLabel = escapeMarkdownLabel(label);
    const href = `#asset-${safeKey}`;
    return `${prefix}[${icon} ${safeLabel}](${href})`;
  });

  return out;
}

/**
 * Detect whether a markdown source contains any `asset:` references
 * (image or link form). Used as a cheap gate — if false, resolution
 * can be skipped entirely.
 */
export function hasAssetReferences(markdown: string): boolean {
  if (!markdown) return false;
  return ANY_ASSET_REF_RE.test(markdown);
}

/**
 * Pick the label to show inside a non-image chip. Preference order:
 *
 *   1. The markdown link's own label text (user-authored).
 *   2. The attachment's `name` from `ctx.nameByKey`, if the caller
 *      provided one for this key.
 *   3. The sanitized asset key as a last resort.
 */
function chooseLabel(
  labelRaw: string,
  key: string,
  safeKey: string,
  nameByKey?: Record<string, string>,
): string {
  const trimmed = labelRaw.trim();
  if (trimmed.length > 0) return labelRaw;
  const name = nameByKey?.[key];
  if (name && name.trim().length > 0) return name;
  return safeKey;
}

/**
 * Escape markdown metacharacters inside a chip label so they cannot
 * terminate the surrounding `[…](…)` structure or introduce inline
 * formatting. We only need to worry about characters that have
 * meaning inside a link text: `\`, `[`, `]`. Backticks and asterisks
 * are allowed because they round-trip through markdown-it safely
 * inside link text.
 */
function escapeMarkdownLabel(label: string): string {
  return label.replace(/([\\[\]])/g, '\\$1');
}

/**
 * Sanitize an asset key for display in markdown output. Keeps the
 * key-character class `[A-Za-z0-9_-]` and drops everything else, so
 * that an attacker-controlled key cannot inject markdown metacharacters
 * into the rendered text.
 */
function sanitizeKeyForDisplay(key: string): string {
  if (SAFE_KEY_RE.test(key)) return key;
  return key.replace(/[^A-Za-z0-9_-]/g, '');
}

/** Escape double-quotes inside a markdown image title. */
function escapeTitle(title: string): string {
  return title.replace(/"/g, '&quot;');
}
