import { describe, it, expect } from 'vitest';
import {
  renderForExtension,
  RENDER_SERVICE_VERSION,
  type ExtensionRenderContext,
} from '@features/markdown/render-for-extension';
import { renderMarkdown } from '@features/markdown/markdown-render';
import { resolveAssetReferences } from '@features/markdown/asset-resolver';

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';

function fullCtx(): ExtensionRenderContext {
  return {
    deliveredAssets: { 'ast-img-1': PNG_B64 },
    deliveredMime: { 'ast-img-1': 'image/png' },
  };
}

describe('renderForExtension — PKC Render Service seam (PR-RS-1)', () => {
  it('returns rendered HTML with the engine version (happy path)', () => {
    const r = renderForExtension('# Title\n\nHello **world**.');
    expect(r.ok).toBe(true);
    expect(r.engine_version).toBe(RENDER_SERVICE_VERSION);
    expect(r.html).toContain('<h1');
    expect(r.html).toContain('Title');
    expect(r.html).toContain('<strong>world</strong>');
  });

  it('empty source renders to an empty, ok result', () => {
    const r = renderForExtension('');
    expect(r.ok).toBe(true);
    expect(r.html).toBe('');
  });

  // ── §12 parity: full ctx must equal the host reader-surface pipeline ──

  it('parity: full asset ctx === host resolveAssetReferences→renderMarkdown', () => {
    const source = '# Doc\n\n![pic](asset:ast-img-1)\n\nbody text';
    const r = renderForExtension(source, {}, fullCtx());

    const expected = renderMarkdown(
      resolveAssetReferences(source, {
        assets: { 'ast-img-1': PNG_B64 },
        mimeByKey: { 'ast-img-1': 'image/png' },
        nameByKey: undefined,
      }),
      { vars: {}, headingNumber: null, sourceLineAnchors: false, silentHallucinationWarnings: true },
    );
    expect(r.ok).toBe(true);
    expect(r.html).toBe(expected);
    // delivered asset became an inline data URI, not a broken ref.
    expect(r.html).toContain('data:image/png;base64,');
    expect(r.html).not.toContain('missing asset');
  });

  // ── §6 consent: undelivered assets must NOT resolve ──

  it('consent: an undelivered asset renders as a broken-ref placeholder', () => {
    // ctx delivers ast-img-1 only; the source references ast-secret.
    const r = renderForExtension('![x](asset:ast-secret)', {}, fullCtx());
    expect(r.ok).toBe(true);
    expect(r.html).toContain('missing asset');
    // the base64 of the *delivered* asset must never leak for an undelivered key.
    expect(r.html).not.toContain(PNG_B64);
  });

  it('consent: empty ctx resolves nothing (no pull side-channel)', () => {
    const r = renderForExtension('![x](asset:ast-img-1)');
    expect(r.ok).toBe(true);
    expect(r.html).toContain('missing asset');
    expect(r.html).not.toContain('data:image/png');
  });

  // ── opts ──

  it('toc: extracts the heading outline when requested', () => {
    const r = renderForExtension('# A\n\n## B\n\ntext', { toc: true });
    expect(r.headings?.map((h) => [h.level, h.text])).toEqual([
      [1, 'A'],
      [2, 'B'],
    ]);
  });

  it('toc: omitted by default', () => {
    const r = renderForExtension('# A');
    expect(r.headings).toBeUndefined();
  });

  it('source_line_anchors: stamps data-pkc-source-line when requested', () => {
    const withAnchors = renderForExtension('para', { source_line_anchors: true });
    const without = renderForExtension('para');
    expect(withAnchors.html).toContain('data-pkc-source-line');
    expect(without.html).not.toContain('data-pkc-source-line');
  });

  it('strip_dialect: downgrades PKC dialect to CommonMark (lossy)', () => {
    // `:strong:[X]` is a PKC inline role; strip_dialect drops the marker.
    const stripped = renderForExtension(':strong:[hi] there', { strip_dialect: true });
    expect(stripped.ok).toBe(true);
    expect(stripped.html).not.toContain(':strong:');
    expect(stripped.html).toContain('hi');
  });

  it('frontmatter is stripped from the body but vars still expand', () => {
    const source = '---\nvars:\n  who: World\n---\nHello {{vars.who}}';
    const r = renderForExtension(source);
    expect(r.ok).toBe(true);
    expect(r.html).toContain('Hello World');
    // YAML must not render as body content.
    expect(r.html).not.toContain('vars:');
  });
});
