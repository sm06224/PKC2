/**
 * Asset Reference Resolution — foundation.
 *
 * Features layer — pure function, no browser APIs.
 *
 * Supports the minimal reference syntax:
 *
 *     ![alt](asset:asset_key)
 *     ![alt](asset:asset_key "title")
 *
 * Before markdown-it renders the text, `resolveAssetReferences()` scans
 * the markdown source for `asset:xxx` image references and substitutes
 * them with safe `data:` URIs built from the container's asset store.
 *
 * This keeps the markdown renderer itself stateless: resolution is a
 * pre-processing pass done by the presenter, not a custom renderer rule.
 *
 * Resolution rules:
 *   - Asset key must exist in `ctx.assets` and have a known MIME in
 *     `ctx.mimeByKey` (both are built from the container at render time).
 *   - MIME must be in the supported image allowlist (png/jpeg/gif/webp).
 *     SVG is deliberately excluded here because the existing attachment
 *     pipeline treats SVG as sandboxed HTML — embedding it inline would
 *     bypass that isolation.
 *   - Unresolved or unsupported references fall back to an italic text
 *     marker (`*[missing asset: key]*` / `*[unsupported asset: key]*`)
 *     so the breakage is visible without producing a broken <img>.
 *
 * Scope (foundation):
 *   - Image references only; link references `[text](asset:key)` are
 *     intentionally not resolved in this phase.
 *   - No asset picker, no editor autocomplete, no cross-container
 *     federation, no BLOB URL caching.
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
}

/** MIME allowlist for inline image embedding. */
const SUPPORTED_IMAGE_MIMES = /^image\/(png|jpeg|gif|webp)$/i;

/**
 * Matches `![alt](asset:key)` or `![alt](asset:key "title")`.
 * Alt text cannot contain `]`, key cannot contain whitespace or `)`.
 */
const ASSET_IMAGE_RE = /!\[([^\]]*)\]\(asset:([^\s)"]+)(?:\s+"([^"]*)")?\)/g;

/** Asset keys are `ast-{ts}-{rand}` — alphanumerics, dashes, underscores. */
const SAFE_KEY_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Replace all `asset:` image references in the given markdown source
 * with safe data URIs (resolved) or fallback markers (unresolved).
 *
 * The returned string is still markdown — it should be passed to
 * `renderMarkdown()` afterwards.
 */
export function resolveAssetReferences(
  markdown: string,
  ctx: AssetResolutionContext
): string {
  if (!markdown) return '';
  return markdown.replace(ASSET_IMAGE_RE, (_match, altRaw: string, keyRaw: string, titleRaw?: string) => {
    const alt = altRaw;
    const key = keyRaw;
    const title = titleRaw ?? '';

    // Sanitize the key for display in fallback messages so that an
    // attacker-controlled key cannot inject markdown metacharacters.
    const safeKey = SAFE_KEY_RE.test(key) ? key : key.replace(/[^A-Za-z0-9_-]/g, '');

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
}

/**
 * Detect whether a markdown source contains any `asset:` references.
 * Used as a cheap gate — if false, resolution can be skipped entirely.
 */
export function hasAssetReferences(markdown: string): boolean {
  if (!markdown) return false;
  // Reset regex state in case it was used previously.
  ASSET_IMAGE_RE.lastIndex = 0;
  return ASSET_IMAGE_RE.test(markdown);
}

/** Escape double-quotes inside a markdown image title. */
function escapeTitle(title: string): string {
  return title.replace(/"/g, '&quot;');
}
