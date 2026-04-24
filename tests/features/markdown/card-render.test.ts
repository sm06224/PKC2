import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

/**
 * Card presentation renderer hook — Slice 2.
 *
 * Spec: docs/spec/card-embed-presentation-v0.md §5.
 *
 * Slice 2 scope: the renderer must recognise `@[card](<target>)` and
 * `@[card:<variant>](<target>)` and emit a minify-safe placeholder
 * that a future widget renderer can pick up. No thumbnail, no
 * excerpt, no click wiring — the placeholder is an inert span with
 * `data-pkc-card-*` attributes.
 *
 * Fallback contract: any input that is NOT a well-formed card
 * notation (missing `@`, unknown variant, ordinary URL, image embed,
 * clickable-image, plain link, etc.) must keep its existing
 * markdown-it rendering. The only observable change for non-card
 * input is that nothing happens.
 */

function extractCardPlaceholders(html: string): RegExpMatchArray[] {
  return Array.from(
    html.matchAll(/<span class="pkc-card-placeholder"[^>]*>[^<]*<\/span>/g),
  );
}

describe('card renderer hook — happy path', () => {
  it('emits a placeholder for default-variant entry card', () => {
    const html = renderMarkdown('@[card](entry:e1)');
    expect(html).toContain('class="pkc-card-placeholder"');
    expect(html).toContain('data-pkc-card-target="entry:e1"');
    expect(html).toContain('data-pkc-card-variant="default"');
    expect(html).toContain('data-pkc-card-raw="@[card](entry:e1)"');
    expect(html).toContain('>@card</span>');
  });

  it('preserves compact variant in data-pkc-card-variant', () => {
    const html = renderMarkdown('@[card:compact](entry:e1)');
    expect(html).toContain('data-pkc-card-variant="compact"');
    expect(html).toContain('data-pkc-card-raw="@[card:compact](entry:e1)"');
    expect(html).toContain('>@card:compact</span>');
  });

  it('accepts wide variant with Portable PKC Reference target', () => {
    // `pkc://` is a renderer-level allowed scheme, so `@[card:wide]`
    // wrapping a portable reference tokenises cleanly and the hook
    // matches. Asset target is handled at the asset-resolver
    // coordination layer in a later slice — see the
    // "asset target (documented Slice-2 boundary)" describe block.
    const html = renderMarkdown('@[card:wide](pkc://cid/entry/e1)');
    expect(html).toContain('data-pkc-card-variant="wide"');
    expect(html).toContain('data-pkc-card-target="pkc://cid/entry/e1"');
    expect(html).toContain(
      'data-pkc-card-raw="@[card:wide](pkc://cid/entry/e1)"',
    );
  });

  it('accepts timeline variant with Portable PKC Reference target', () => {
    const html = renderMarkdown('@[card:timeline](pkc://cid/entry/e1)');
    expect(html).toContain('data-pkc-card-variant="timeline"');
    expect(html).toContain('data-pkc-card-target="pkc://cid/entry/e1"');
  });

  it('preserves entry fragments inside the target attribute', () => {
    const html = renderMarkdown('@[card](entry:e1#log/log-1)');
    expect(html).toContain('data-pkc-card-target="entry:e1#log/log-1"');
    // Raw round-trips byte-for-byte.
    expect(html).toContain('data-pkc-card-raw="@[card](entry:e1#log/log-1)"');
  });

  it('emits exactly one placeholder per card notation', () => {
    const html = renderMarkdown('@[card](entry:e1)');
    expect(extractCardPlaceholders(html)).toHaveLength(1);
  });

  it('recognises two adjacent cards in the same paragraph', () => {
    const html = renderMarkdown(
      '@[card](entry:e1) and @[card:compact](pkc://cid/entry/e2)',
    );
    const placeholders = extractCardPlaceholders(html);
    expect(placeholders).toHaveLength(2);
    expect(html).toContain('data-pkc-card-target="entry:e1"');
    expect(html).toContain('data-pkc-card-target="pkc://cid/entry/e2"');
    expect(html).toContain('data-pkc-card-variant="compact"');
    // The literal " and " text between them must survive.
    expect(html).toContain('</span> and <span');
  });

  it('preserves text surrounding the card', () => {
    const html = renderMarkdown('see @[card](entry:e1) trailing');
    expect(html).toContain('see ');
    expect(html).toContain(' trailing');
    expect(html).toContain('class="pkc-card-placeholder"');
    // The `@` in front of the card must be consumed — the only
    // remaining `@` (if any) should live inside the placeholder's
    // data-pkc-card-raw attribute.
    const stripped = html.replace(
      /<span class="pkc-card-placeholder"[^>]*>[^<]*<\/span>/g,
      '',
    );
    expect(stripped).not.toContain('@');
  });
});

describe('card renderer hook — fallback cases', () => {
  it('does NOT treat plain markdown link as a card', () => {
    const html = renderMarkdown('[card](entry:e1)');
    expect(html).not.toContain('pkc-card-placeholder');
    // Existing entry: link rendering must survive untouched.
    expect(html).toContain('href="entry:e1"');
    expect(html).toContain('data-pkc-action="navigate-entry-ref"');
  });

  it('does NOT treat unknown variant as a card', () => {
    const html = renderMarkdown('@[card:unknown](entry:e1)');
    expect(html).not.toContain('pkc-card-placeholder');
    // Rendered as literal `@` + ordinary entry link. The `@` must
    // stay visible outside any anchor.
    expect(html).toMatch(/@<a[^>]*href="entry:e1"/);
  });

  it('does NOT treat ordinary URL target as a card', () => {
    const html = renderMarkdown('@[card](https://example.com)');
    expect(html).not.toContain('pkc-card-placeholder');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
  });

  it('does NOT treat javascript: target as a card', () => {
    const html = renderMarkdown('@[card](javascript:alert(1))');
    expect(html).not.toContain('pkc-card-placeholder');
    // validateLink rejects the javascript: scheme, so markdown-it
    // falls back to rendering the entire notation as literal text.
    // The critical invariant: no `<a>` with an executable href.
    expect(html).not.toMatch(/<a[^>]*href="javascript:/i);
  });

  it('does NOT treat image-embed as a card', () => {
    const html = renderMarkdown('![alt](entry:e1)');
    expect(html).not.toContain('pkc-card-placeholder');
    // The existing transclusion placeholder is preserved.
    expect(html).toContain('pkc-transclusion-placeholder');
  });

  it('does NOT treat clickable-image as a card', () => {
    // Use an entry: inner src so the image rule is exercised (the
    // inner src must be an allowlisted scheme, otherwise markdown-it
    // silently fails to build the image and degrades to literal
    // text — which is not what this test wants to assert).
    const html = renderMarkdown('[![x](entry:inner)](entry:e1)');
    expect(html).not.toContain('pkc-card-placeholder');
    // The entry anchor survives; no card promotion.
    expect(html).toContain('href="entry:e1"');
  });

  it('does NOT treat case-mismatched label as a card', () => {
    const html = renderMarkdown('@[Card](entry:e1)');
    expect(html).not.toContain('pkc-card-placeholder');
  });

  it('does NOT treat empty-target `@[card]()` as a card', () => {
    const html = renderMarkdown('@[card]()');
    expect(html).not.toContain('pkc-card-placeholder');
    // Empty-url link may or may not render; the invariant is that
    // nothing becomes a card placeholder.
  });

  it('leaves existing entry-link rendering unchanged', () => {
    const html = renderMarkdown('[go](entry:lid-1#log/abc)');
    expect(html).toContain('href="entry:lid-1#log/abc"');
    expect(html).toContain('data-pkc-action="navigate-entry-ref"');
    expect(html).toContain('data-pkc-entry-ref="entry:lid-1#log/abc"');
    expect(html).not.toContain('pkc-card-placeholder');
  });

  it('leaves existing entry-embed transclusion unchanged', () => {
    const html = renderMarkdown('![entry preview](entry:lid-1#log/abc)');
    expect(html).toContain('pkc-transclusion-placeholder');
    expect(html).toContain('data-pkc-embed-ref="entry:lid-1#log/abc"');
    expect(html).toContain('data-pkc-embed-alt="entry preview"');
    expect(html).not.toContain('pkc-card-placeholder');
  });

  it('leaves cross-container pkc:// placeholder unchanged for non-card uses', () => {
    const html = renderMarkdown('[ref](pkc://other/entry/e1)');
    // The existing cross-container placeholder badge renders as an
    // anchor with `pkc-portable-reference-placeholder` class.
    expect(html).toContain('pkc-portable-reference-placeholder');
    expect(html).not.toContain('pkc-card-placeholder');
  });
});

describe('card renderer hook — escaping / safety', () => {
  it('never emits raw < or > inside card attributes', () => {
    const html = renderMarkdown('@[card](entry:e1)');
    // All `<` in the HTML are tag-openers, not content. Inside the
    // placeholder span, only `@card` appears as text.
    const spans = extractCardPlaceholders(html);
    expect(spans).toHaveLength(1);
    expect(spans[0]![0]).not.toMatch(/<(?!\/?span)/);
  });

  it('rejects card notation wrapping a javascript: URL', () => {
    // Slice-1 parser rejects javascript: as a target. validateLink
    // independently rejects the scheme. Either way the output must
    // never carry a `javascript:` URL with card styling.
    const html = renderMarkdown('@[card](javascript:alert(1))');
    expect(html).not.toContain('pkc-card-placeholder');
    expect(html).not.toMatch(/data-pkc-card-[^=]+="javascript:/);
  });

  it('does not leak a stray `@` when stripping the card prefix', () => {
    // Single card at start of paragraph — the leading `@` must be
    // consumed, not left behind as literal text.
    const html = renderMarkdown('@[card](entry:e1)');
    const stripped = html.replace(
      /<span class="pkc-card-placeholder"[^>]*>[^<]*<\/span>/g,
      '',
    );
    // What remains is `<p></p>` (plus newlines). Must not contain `@`.
    expect(stripped).not.toContain('@');
  });
});

// ── Asset target boundary ──────────────────────────────────────
//
// `asset:` is NOT on the markdown-it `validateLink` allowlist, so
// when an asset-target card reaches `renderMarkdown()` directly
// (without running `asset-resolver.ts` first) the link tokens are
// rejected before the card hook sees them. As of Slice-3.5 the
// Slice-1 parser (`parseCardPresentation`) also rejects asset /
// `pkc://<cid>/asset/<key>` targets, matching the spec §5.4 ❌ 非対応
// and audit Option C. This is the safe default: unresolved asset
// refs survive as literal characters instead of becoming
// `<a href="asset:…">` anchors pointing nowhere. Asset-target cards
// in the real pipeline are handled at the asset-resolver
// coordination layer (a future slice) — not at this renderer hook.
// These tests pin the current boundary so a later change to the
// allowlist is noticed immediately.

describe('card renderer hook — asset target (Slice-2 boundary)', () => {
  it('does NOT turn @[card](asset:key) into a card placeholder at the renderer layer', () => {
    const html = renderMarkdown('@[card](asset:a1)');
    expect(html).not.toContain('pkc-card-placeholder');
  });

  it('does NOT emit a live <a href="asset:…"> for a bare asset link', () => {
    // Pre-PR behaviour: `validateLink` rejects the asset: scheme,
    // so the notation survives as plain text. This is what the
    // downstream asset-resolver relies on when a reference slips
    // past its preprocessor — it must not suddenly become a broken
    // external anchor.
    const html = renderMarkdown('[label](asset:a1)');
    expect(html).not.toMatch(/<a[^>]*href="asset:/i);
  });

  it('does NOT emit a live <a href="asset:…"> for the image-empty form', () => {
    const html = renderMarkdown('[](asset:a1)');
    expect(html).not.toMatch(/<a[^>]*href="asset:/i);
  });

  it('does NOT emit a live <a href="asset:…"> inside a clickable-image', () => {
    // Clickable-image with both inner image and outer link pointing
    // at assets: the outer link href is `asset:…` which must stay
    // rejected.
    const html = renderMarkdown('[![alt](asset:a1)](asset:b2)');
    expect(html).not.toMatch(/<a[^>]*href="asset:/i);
  });

  it('does NOT emit a live <img src="asset:…"> for a bare image embed', () => {
    // markdown-it's image rule also runs through `validateLink` for
    // the `src`. With `asset:` off the allowlist, a raw asset image
    // embed that bypasses `asset-resolver.ts` stays as literal text
    // instead of becoming a broken `<img>`. The full pipeline runs
    // the resolver upstream and never reaches this fallback.
    const html = renderMarkdown('![alt](asset:a1)');
    expect(html).not.toMatch(/<img[^>]*src="asset:/i);
  });
});

describe('card renderer hook — unchanged rendering for non-card inputs', () => {
  it('renders bold text identically to before', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
  });

  it('renders ordinary links identically to before', () => {
    const html = renderMarkdown('[Home](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
  });

  it('renders task lists identically to before', () => {
    const html = renderMarkdown('- [ ] todo\n- [x] done');
    expect(html).toContain('pkc-task-item');
    expect(html).toContain('type="checkbox"');
  });
});
