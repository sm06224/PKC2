/**
 * Thumbnail frontmatter helpers (PR-HH, 2026-05-06).
 *
 * Pure helpers for `text` archetype bodies whose YAML frontmatter
 * carries a `thumbnail:` field (PR-U v1.1 capture profile). PR-HH
 * adds the materialization step: fetch the URL once, store the
 * decoded bytes as a container asset, and rewrite the frontmatter
 * to reference the local asset key. This eliminates runtime CORS
 * dependency on the original host and preserves the thumbnail
 * across container exports.
 *
 * Scope:
 *   - parse the leading `---` ... `---` block (only when present)
 *   - find a `thumbnail:` line whose value is a http(s) URL
 *   - rewrite that single line, preserving everything else byte-
 *     for-byte (line breaks, surrounding fields, body content)
 *
 * Out of scope (callers handle):
 *   - actually fetching the URL (browser API; lives in adapter)
 *   - dispatching the asset-add action
 */

const FRONTMATTER_PREFIX = '---';
const HTTP_URL_RE = /^https?:\/\//i;

/**
 * Extract a http(s) thumbnail URL from the leading YAML
 * frontmatter, if any. Returns null when:
 *   - no frontmatter present
 *   - frontmatter has no `thumbnail:` line
 *   - the value is already an `asset:KEY` / `data:` reference
 *   - the value is not a http(s) URL
 *
 * The value is unquoted before scheme inspection so both
 * `thumbnail: https://...` and `thumbnail: "https://..."` match.
 */
export function findThumbnailHttpUrl(body: string): string | null {
  if (!body) return null;
  const trimmed = body.trimStart();
  if (!trimmed.startsWith(FRONTMATTER_PREFIX)) return null;
  // Find the closing `---` after the opening one.
  const startIdx = body.indexOf(FRONTMATTER_PREFIX);
  if (startIdx < 0) return null;
  const afterStart = startIdx + FRONTMATTER_PREFIX.length;
  const closeIdx = body.indexOf(FRONTMATTER_PREFIX, afterStart);
  if (closeIdx < 0) return null;
  const fmBlock = body.slice(afterStart, closeIdx);
  const m = fmBlock.match(/^thumbnail:\s*"?([^"\n]+)"?/m);
  if (!m) return null;
  const val = m[1]!.trim();
  if (!HTTP_URL_RE.test(val)) return null;
  return val;
}

/**
 * Replace the `thumbnail: <URL>` line in the leading YAML
 * frontmatter with `thumbnail: asset:<key>`. Returns the new body
 * string. When no frontmatter or no http URL is present, returns
 * the body unchanged so the helper is safe to call eagerly.
 *
 * Preserves indentation, surrounding fields, and any quote style
 * the writer used (drops quotes since `asset:KEY` is always
 * unambiguous YAML).
 */
export function rewriteThumbnailToAssetKey(body: string, assetKey: string): string {
  if (!body) return body;
  const trimmed = body.trimStart();
  if (!trimmed.startsWith(FRONTMATTER_PREFIX)) return body;
  const startIdx = body.indexOf(FRONTMATTER_PREFIX);
  if (startIdx < 0) return body;
  const afterStart = startIdx + FRONTMATTER_PREFIX.length;
  const closeIdx = body.indexOf(FRONTMATTER_PREFIX, afterStart);
  if (closeIdx < 0) return body;
  const fmBlock = body.slice(afterStart, closeIdx);
  // Only rewrite when the existing value is a http(s) URL — leaves
  // already-materialized `asset:` and `data:` references alone.
  const newFm = fmBlock.replace(
    /^(thumbnail:\s*)"?(https?:\/\/[^"\n]+)"?(\s*)$/m,
    (_full, prefix: string, _url: string, suffix: string) =>
      `${prefix}asset:${assetKey}${suffix}`,
  );
  if (newFm === fmBlock) return body;
  return body.slice(0, afterStart) + newFm + body.slice(closeIdx);
}
