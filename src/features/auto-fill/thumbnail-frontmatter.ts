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
 * PR-YY (2026-05-06): user 修正指示4「TEXTエントリのサムネイル
 * 指定が既存の PKC embed 方式と記法が異なる」への対応。frontmatter
 * `thumbnail:` value を PKC embed 互換形式から抽出する。
 *
 * 受理する記法(PKC embed と一致):
 *   1. `https://...` / `http://...` — bare URL
 *   2. `data:image/...` — data URI
 *   3. `asset:KEY` — local asset reference
 *   4. `![](asset:KEY)` / `![alt](asset:KEY)` — PKC embed image syntax
 *   5. `![](https://...)` / `![alt](https://...)` — markdown image
 *   6. `"!(asset:KEY)"` 等の quoted variants
 *
 * Returns the unwrapped scheme + value(`asset:KEY` / `<url>` /
 * `data:...`)or null if no recognised form. caller(`pickImageAssetForEntry`
 * など)で scheme prefix で分岐する。
 */
const MD_IMAGE_RE = /^!\[[^\]]*\]\(([^)\s"]+(?:\s+"[^"]*")?)\)$/;

export function extractThumbnailRef(rawValue: string): string | null {
  let v = rawValue.trim();
  // Strip surrounding double / single quotes (YAML scalar style).
  if ((v.startsWith('"') && v.endsWith('"'))
      || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  // Markdown image syntax `![alt](TARGET)` / `![alt](TARGET "title")`
  // — extract the TARGET part.
  const md = v.match(MD_IMAGE_RE);
  if (md) {
    let inner = md[1]!.trim();
    // Trim trailing `"title"` after whitespace.
    inner = inner.replace(/\s+"[^"]*"$/, '').trim();
    if (HTTP_URL_RE.test(inner)) return inner;
    if (inner.startsWith('asset:')) return inner;
    if (inner.startsWith('data:')) return inner;
    return null;
  }
  // Bare scheme.
  if (HTTP_URL_RE.test(v)) return v;
  if (v.startsWith('asset:')) return v;
  if (v.startsWith('data:')) return v;
  return null;
}

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
  // PR-YY: 受理する thumbnail 記法を PKC embed と統一。bare URL /
  // markdown `![...](url)` 両方の form を試す。最後に http(s) のみ
  // 返却(materializer は asset: / data: は既に local なので NOP)。
  const m = fmBlock.match(/^thumbnail:\s*(.+)$/m);
  if (!m) return null;
  const ref = extractThumbnailRef(m[1]!);
  if (!ref) return null;
  if (!HTTP_URL_RE.test(ref)) return null;
  return ref;
}

/**
 * Extract the local asset KEY (without the `asset:` prefix) that a
 * `text` entry's frontmatter `thumbnail:` points at, or null when
 * there is no frontmatter, no `thumbnail:` line, or the value is not
 * an `asset:KEY` reference (a bare http(s) URL or `data:` URI carries
 * no container-asset dependency).
 *
 * This is the dependency-scan counterpart to `findThumbnailHttpUrl`:
 * `pickImageAssetForEntry` resolves `thumbnail: asset:K` by reading
 * `container.assets[K]` synchronously at render time, so both the
 * working-set preload (#7 lazy asset loading) and the referenced-key
 * scan that drives orphan purge must count this key. Without it, a
 * thumbnail-only asset would be treated as an orphan and a lazy boot
 * would render a broken cover image.
 */
export function findThumbnailAssetKey(body: string): string | null {
  if (!body) return null;
  const trimmed = body.trimStart();
  if (!trimmed.startsWith(FRONTMATTER_PREFIX)) return null;
  const startIdx = body.indexOf(FRONTMATTER_PREFIX);
  if (startIdx < 0) return null;
  const afterStart = startIdx + FRONTMATTER_PREFIX.length;
  const closeIdx = body.indexOf(FRONTMATTER_PREFIX, afterStart);
  if (closeIdx < 0) return null;
  const fmBlock = body.slice(afterStart, closeIdx);
  const m = fmBlock.match(/^thumbnail:\s*(.+)$/m);
  if (!m) return null;
  const ref = extractThumbnailRef(m[1]!);
  if (!ref || !ref.startsWith('asset:')) return null;
  const key = ref.slice('asset:'.length);
  return key.length > 0 ? key : null;
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
