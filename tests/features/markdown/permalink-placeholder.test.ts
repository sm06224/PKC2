import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

/**
 * Cross-container PKC permalink placeholder rendering.
 *
 * Spec: docs/spec/pkc-link-unification-v0.md §8.3.
 *
 * Behaviour pinned here:
 *   - `[](pkc://<other>/entry/<lid>)` → `<a>` with class
 *     `pkc-portable-reference-placeholder` and `data-pkc-portable-*`
 *     attributes so the CSS badge (base.css) can show it as
 *     an external reference.
 *   - Same-container permalink → ordinary anchor, no placeholder
 *     (paste conversion normally demotes these to `entry:`).
 *   - Malformed `pkc://...` → treated as an ordinary external
 *     URL (target="_blank") so the body isn't silently dropped.
 *   - Normal `https://` URLs keep their existing treatment.
 *   - The raw `href` survives on the anchor so a future resolver
 *     can round-trip the reference without re-parsing.
 */

const SELF = 'self-cid';

describe('renderMarkdown — cross-container PKC permalink placeholder', () => {
  it('tags a cross-container entry permalink as external', () => {
    const html = renderMarkdown('[link](pkc://other-cid/entry/e123)', {
      currentContainerId: SELF,
    });
    expect(html).toContain('class="pkc-portable-reference-placeholder"');
    expect(html).toContain('data-pkc-portable-container="other-cid"');
    expect(html).toContain('data-pkc-portable-kind="entry"');
    expect(html).toContain('data-pkc-portable-target="e123"');
    // href is preserved verbatim for downstream resolvers.
    expect(html).toContain('href="pkc://other-cid/entry/e123"');
  });

  it('tags a cross-container asset permalink as external', () => {
    const html = renderMarkdown('[file](pkc://other-cid/asset/a456)', {
      currentContainerId: SELF,
    });
    expect(html).toContain('class="pkc-portable-reference-placeholder"');
    expect(html).toContain('data-pkc-portable-container="other-cid"');
    expect(html).toContain('data-pkc-portable-kind="asset"');
    expect(html).toContain('data-pkc-portable-target="a456"');
  });

  it('preserves the fragment on an entry permalink', () => {
    const html = renderMarkdown(
      '[anchor](pkc://other-cid/entry/e123#log/abc)',
      { currentContainerId: SELF },
    );
    expect(html).toContain('data-pkc-portable-fragment="#log/abc"');
    expect(html).toContain('href="pkc://other-cid/entry/e123#log/abc"');
  });
});

describe('renderMarkdown — same-container permalink', () => {
  it('does NOT tag a same-container permalink as external', () => {
    const html = renderMarkdown(`[link](pkc://${SELF}/entry/e1)`, {
      currentContainerId: SELF,
    });
    expect(html).not.toContain('pkc-portable-reference-placeholder');
    expect(html).not.toContain('data-pkc-portable-container');
    // The anchor still renders (href preserved).
    expect(html).toContain(`href="pkc://${SELF}/entry/e1"`);
  });

  it('same-container entry permalink routes through navigate-entry-ref (like entry:<lid>)', () => {
    // Post-§5.5 fallback: when paste conversion hasn't demoted the
    // Portable Reference to `entry:` (hand-typed body, import from
    // older PKC, etc.), the anchor should still click-navigate the
    // same way as its `entry:` equivalent.
    const html = renderMarkdown(`[link](pkc://${SELF}/entry/e1)`, {
      currentContainerId: SELF,
    });
    expect(html).toContain('data-pkc-action="navigate-entry-ref"');
    expect(html).toContain('data-pkc-entry-ref="entry:e1"');
    // href stays untouched for downstream resolvers / copy actions.
    expect(html).toContain(`href="pkc://${SELF}/entry/e1"`);
  });

  it('same-container entry permalink preserves the fragment in the navigate-entry-ref data attr', () => {
    const html = renderMarkdown(
      `[link](pkc://${SELF}/entry/e1#log/xyz)`,
      { currentContainerId: SELF },
    );
    expect(html).toContain('data-pkc-action="navigate-entry-ref"');
    expect(html).toContain('data-pkc-entry-ref="entry:e1#log/xyz"');
  });

  it('same-container ASSET permalink does NOT get navigate-entry-ref (entry-only fallback)', () => {
    // Asset navigation belongs to a separate action handler; for
    // now the anchor renders without the routing data attr so
    // nothing tries to parse `asset:<key>` as an entry ref.
    const html = renderMarkdown(`[file](pkc://${SELF}/asset/a1)`, {
      currentContainerId: SELF,
    });
    expect(html).not.toContain('data-pkc-action="navigate-entry-ref"');
    expect(html).not.toContain('data-pkc-entry-ref');
    expect(html).not.toContain('pkc-portable-reference-placeholder');
    expect(html).toContain(`href="pkc://${SELF}/asset/a1"`);
  });

  it('treats missing currentContainerId as "every permalink is external" (safe default)', () => {
    // Matches the renderer contract: bootstrap windows that haven't
    // loaded a container yet should render conservatively so no one's
    // lid namespace leaks into another's.
    const html = renderMarkdown('[x](pkc://any/entry/e1)');
    expect(html).toContain('pkc-portable-reference-placeholder');
    expect(html).toContain('data-pkc-portable-container="any"');
    // Safe default must NOT emit navigate-entry-ref either, since the
    // target container_id is unknown — we don't want to navigate to
    // whatever lid happens to collide in the local namespace.
    expect(html).not.toContain('data-pkc-action="navigate-entry-ref"');
  });
});

describe('renderMarkdown — malformed pkc:// falls through', () => {
  it('renders a malformed permalink as an ordinary external link', () => {
    const html = renderMarkdown('[x](pkc://bad-form)', {
      currentContainerId: SELF,
    });
    // Not a placeholder — the parser rejected the shape.
    expect(html).not.toContain('pkc-portable-reference-placeholder');
    // Still an anchor (we added `pkc:` to the safe allowlist so
    // users don't see their body silently drop). Ordinary external
    // link treatment applies.
    expect(html).toContain('href="pkc://bad-form"');
    expect(html).toContain('target="_blank"');
  });

  it('unknown kind (not entry/asset) is malformed', () => {
    const html = renderMarkdown('[x](pkc://other-cid/folder/f1)', {
      currentContainerId: SELF,
    });
    expect(html).not.toContain('pkc-portable-reference-placeholder');
    expect(html).toContain('target="_blank"');
  });
});

describe('renderMarkdown — unchanged behaviour for non-PKC URLs', () => {
  it('keeps https links with target="_blank" rel="noopener noreferrer"', () => {
    const html = renderMarkdown('[x](https://example.com)', {
      currentContainerId: SELF,
    });
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('pkc-portable-reference-placeholder');
  });

  it('keeps entry: internal links routed to navigate-entry-ref', () => {
    const html = renderMarkdown('[jump](entry:lid_a)', {
      currentContainerId: SELF,
    });
    expect(html).toContain('data-pkc-action="navigate-entry-ref"');
    expect(html).toContain('data-pkc-entry-ref="entry:lid_a"');
    expect(html).not.toContain('pkc-portable-reference-placeholder');
  });
});

describe('renderMarkdown — raw href preservation', () => {
  it('keeps the raw permalink string intact on the anchor', () => {
    // Downstream features (P2P resolve, subset export, share UI)
    // rely on the original URL surviving the render cycle so they
    // can re-parse it without re-deriving from data attributes.
    const raw = 'pkc://other-cid/entry/e123#log/xyz';
    const html = renderMarkdown(`[link](${raw})`, {
      currentContainerId: SELF,
    });
    expect(html).toContain(`href="${raw}"`);
  });
});
