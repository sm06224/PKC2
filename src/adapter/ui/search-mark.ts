/**
 * Search match highlighter — Tier 3+ A-4 Slice α (USER_REQUEST_LEDGER
 * S-15, 2026-04-14).
 *
 * adapter/ui helper (lives here because it mutates DOM — features/
 * is reserved for pure algorithmic helpers per CLAUDE.md). Walks an
 * HTMLElement subtree and wraps every occurrence of `query`
 * (case-insensitive substring) inside text nodes with
 * `<mark class="pkc-search-mark">…</mark>`. Designed to run AFTER
 * the renderer has materialised the entry body, so it doesn't have
 * to know anything about markdown / presenters / archetype.
 *
 * Why post-DOM rather than pre-source: walking text nodes is the
 * only way to wrap matches without breaking arbitrary markup
 * (markdown-it output, presenter HTML, asset chips, embed
 * placeholders, B-2 token spans). String replacement on rendered
 * HTML would corrupt attribute values and tag boundaries.
 *
 * Skipped subtrees:
 *   - `<script>` / `<style>` / `<noscript>` (text is not visible)
 *   - `<pre>` (preserves B-2 syntax highlight token markup intact;
 *     also avoids the multi-text-node match loss caused by B-2's
 *     per-token `<span>` splits — `function foo` straddles two
 *     spans so a substring search would miss it. The tradeoff is
 *     accepted for MVP; finding code names via search is a future
 *     extension under A-4 Slice γ if the pain emerges).
 *   - `<mark class="pkc-search-mark">` (idempotent — re-applying
 *     the highlighter on an already-marked tree is a no-op).
 *
 * Safety:
 *   - Only text nodes are mutated; no innerHTML reads / writes.
 *   - The wrapping `<mark>` is constructed via createElement, so
 *     the matched substring is never re-parsed as HTML.
 *   - Returns silently when `query.trim()` is empty.
 */

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'PRE']);

/**
 * Wrap occurrences of `query` (case-insensitive substring) in text
 * nodes under `root` with `<mark class="pkc-search-mark">`. Mutates
 * `root` in place. Returns the number of matches wrapped (useful for
 * tests / UI badges).
 */
export function highlightMatchesIn(root: HTMLElement, query: string): number {
  const trimmed = query.trim();
  if (trimmed === '') return 0;
  const lower = trimmed.toLowerCase();
  const queryLen = trimmed.length;
  const doc = root.ownerDocument ?? document;

  // Collect text nodes first so the live walker isn't disturbed by
  // the in-place replaceChild calls below.
  const textNodes = collectMatchingTextNodes(root, lower);

  let total = 0;
  for (const textNode of textNodes) {
    const original = textNode.nodeValue ?? '';
    const lowerOriginal = original.toLowerCase();
    // Slice the original into [text, mark, text, mark, …] fragments.
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    let next = lowerOriginal.indexOf(lower, cursor);
    if (next < 0) continue;
    while (next >= 0) {
      if (next > cursor) {
        fragment.appendChild(doc.createTextNode(original.slice(cursor, next)));
      }
      const mark = doc.createElement('mark');
      mark.className = 'pkc-search-mark';
      mark.textContent = original.slice(next, next + queryLen);
      fragment.appendChild(mark);
      cursor = next + queryLen;
      total++;
      next = lowerOriginal.indexOf(lower, cursor);
    }
    if (cursor < original.length) {
      fragment.appendChild(doc.createTextNode(original.slice(cursor)));
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }
  return total;
}

/**
 * Walk `root`'s text descendants and return the ones containing at
 * least one case-insensitive `lowerQuery` occurrence. Skips nodes
 * inside SKIP_TAGS or already inside an existing `.pkc-search-mark`
 * (idempotency).
 */
function collectMatchingTextNodes(root: HTMLElement, lowerQuery: string): Text[] {
  const matches: Text[] = [];
  const walker = (root.ownerDocument ?? document).createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node): number {
        const value = node.nodeValue;
        if (value === null || value === '') return NodeFilter.FILTER_REJECT;
        // Reject if any ancestor is in SKIP_TAGS or is an existing mark.
        let parent: Node | null = node.parentNode;
        while (parent && parent !== root) {
          if (parent.nodeType === 1 /* ELEMENT_NODE */) {
            const el = parent as Element;
            if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
            if (
              el.tagName === 'MARK'
              && el.classList.contains('pkc-search-mark')
            ) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          parent = parent.parentNode;
        }
        return value.toLowerCase().includes(lowerQuery)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    },
  );
  let current = walker.nextNode();
  while (current) {
    matches.push(current as Text);
    current = walker.nextNode();
  }
  return matches;
}
