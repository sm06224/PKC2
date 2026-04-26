/**
 * TEXT archetype — markdown body asset helpers.
 *
 * Pure features-layer helpers used by the `.text.zip` sister bundle
 * export / import (see `docs/development/completed/text-markdown-zip-export.md`).
 * No browser APIs, no IO — everything here is just string → string.
 *
 * The TEXTLOG equivalent lives in `features/textlog/textlog-csv.ts`
 * and operates on a `TextlogBody` of multiple rows. Here the body is
 * a single markdown string, so the shape is simpler — but the regex
 * and stripping rules MUST stay in sync so the two sister formats
 * render broken references identically.
 */

/**
 * Collect the deduplicated, first-occurrence-ordered list of asset
 * keys referenced by a markdown body. Recognises both
 * `![alt](asset:k)` (image embed) and `[label](asset:k)`
 * (non-image chip) forms, plus the optional `(?:\s+"…")?` markdown
 * title between the key and the closing paren.
 *
 * Order is strict **source position order** — the same order a reader
 * scanning the body top-to-bottom would encounter the references.
 * Downstream consumers (manifest asset index, ZIP write order) rely on
 * this for byte-deterministic output across re-runs.
 *
 * Pure: no mutation, no shared state.
 */
export function collectMarkdownAssetKeys(markdown: string): string[] {
  if (!markdown) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  // `(!?)` captures the optional bang so image / link forms fall
  // through the same matcher; `([^\s)"]+)` captures the key; the
  // optional title group consumes `(?:\s+"…")?` without polluting
  // the key capture.
  const re = /(!?)\[[^\]]*\]\(asset:([^\s)"]+)(?:\s+"[^"]*")?\)/g;
  for (const m of markdown.matchAll(re)) {
    const key = m[2];
    if (typeof key === 'string' && key.length > 0 && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

/**
 * Produce a new markdown string with broken asset references stripped
 * — "compact mode" from the text bundle spec §6.
 *
 * A reference is **broken** when its key is NOT in `presentKeys`.
 * Broken references are rewritten as follows:
 *
 *   - `![alt](asset:<missing>)`  → `alt`
 *   - `[label](asset:<missing>)` → `label`
 *
 * References whose key IS in `presentKeys` are left untouched. Any
 * non-`asset:` URL (plain https, etc.) is ignored entirely.
 *
 * Pure — returns a new string. Safe to call on a live entry body
 * because the input is not mutated.
 */
export function compactMarkdownAgainst(
  markdown: string,
  presentKeys: ReadonlySet<string>,
): string {
  if (!markdown) return '';
  const re = /(!?)\[([^\]]*)\]\(asset:([^\s)"]+)(?:\s+"[^"]*")?\)/g;
  return markdown.replace(re, (match, _bang: string, label: string, key: string) => {
    if (presentKeys.has(key)) return match;
    return label;
  });
}
