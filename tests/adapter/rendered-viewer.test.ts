/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { buildRenderedViewerHtml } from '@adapter/ui/rendered-viewer';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { serializeTextlogBody } from '@features/textlog/textlog-body';

function baseContainer(overrides: Partial<Container> = {}): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'Test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries: [],
    relations: [],
    revisions: [],
    assets: {},
    ...overrides,
  };
}

function textEntry(body: string, title = 'Note'): Entry {
  return {
    lid: 'e-text',
    title,
    body,
    archetype: 'text',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function textlogEntry(): Entry {
  const body = serializeTextlogBody({
    entries: [
      { id: 'log-1', text: '**bold** first', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      { id: 'log-2', text: 'starred row', createdAt: '2026-04-09T11:00:00Z', flags: ['important'] },
    ],
  });
  return {
    lid: 'e-log',
    title: 'My Log',
    body,
    archetype: 'textlog',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('buildRenderedViewerHtml — TEXT archetype', () => {
  it('wraps body in a standalone HTML document with the entry title', () => {
    const entry = textEntry('# Hello\n\nWorld', 'Greetings');
    const html = buildRenderedViewerHtml(entry, baseContainer());
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>Greetings</title>');
    expect(html).toContain('<h1>Greetings</h1>');
    // Rendered markdown appears inside the article wrapper.
    expect(html).toContain('<article class="pkc-viewer-body pkc-md-rendered">');
    expect(html).toMatch(/<h1[^>]*>Hello<\/h1>/);
    expect(html).toContain('<p>World</p>');
  });

  it('escapes HTML characters in the title and falls back to "(untitled)" for empty titles', () => {
    const entry = textEntry('body', '');
    const html = buildRenderedViewerHtml(entry, baseContainer());
    expect(html).toContain('<title>(untitled)</title>');

    const entry2 = textEntry('body', '<script>alert(1)</script>');
    const html2 = buildRenderedViewerHtml(entry2, baseContainer());
    // Title must be escaped — raw `<script>` must never reach the output.
    expect(html2).not.toContain('<title><script>');
    expect(html2).toContain('&lt;script&gt;');
  });

  it('preserves the markdown-render safety posture (raw <script> in the body is not executed)', () => {
    // `renderMarkdown` is configured with `html: false`, so any raw HTML
    // inside a TEXT body should be emitted as text, not as a live tag.
    const entry = textEntry('<script>evil()</script>\n\nplain paragraph');
    const html = buildRenderedViewerHtml(entry, baseContainer());
    expect(html).not.toMatch(/<script>evil\(\)<\/script>/);
    // The escaped form must appear inside the article.
    expect(html).toContain('&lt;script&gt;evil()&lt;/script&gt;');
  });

  it('resolves asset references (image) via the shared asset-resolver', () => {
    const container = baseContainer({
      entries: [
        {
          lid: 'att',
          title: 'photo',
          body: JSON.stringify({ name: 'photo.png', mime: 'image/png', size: 100, asset_key: 'ak1' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { ak1: 'AAAA' },
    });
    const entry = textEntry('See: ![photo](asset:ak1)');
    const html = buildRenderedViewerHtml(entry, container);
    // The resolved image should end up as a data: URL inside an <img>.
    expect(html).toMatch(/<img[^>]+src="data:image\/png;base64,AAAA"/);
  });

  it('does NOT emit any editor UI (no textarea, no commit/cancel buttons)', () => {
    const entry = textEntry('plain body', 'Title');
    const html = buildRenderedViewerHtml(entry, baseContainer());
    // Editor hallmarks must be absent.
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('data-pkc-action="commit-edit"');
    expect(html).not.toContain('data-pkc-action="cancel-edit"');
    expect(html).not.toContain('data-pkc-action="begin-edit"');
    expect(html).not.toContain('data-pkc-field="body"');
  });
});

describe('buildRenderedViewerHtml — TEXTLOG archetype', () => {
  it('emits day-grouped structure via buildTextlogDoc (Slice 4-B)', () => {
    // Slice 4-B: the viewer drives off `buildTextlogDoc`, producing
    // `<section class="pkc-textlog-day">` wrappers around
    // `<article class="pkc-textlog-log">` entries. The legacy
    // flat `## <ISO>` heading path is gone.
    const entry = textlogEntry();
    const html = buildRenderedViewerHtml(entry, baseContainer());
    expect(html).toContain('<section class="pkc-textlog-day"');
    expect(html).toContain('<article class="pkc-textlog-log"');
    // Two log entries render two articles.
    const articleCount = (html.match(/<article class="pkc-textlog-log"/g) ?? []).length;
    expect(articleCount).toBe(2);
    // First row's markdown body is rendered as bold.
    expect(html).toContain('<strong>bold</strong>');
    // Second (important) row surfaces the flag via a data attribute.
    expect(html).toMatch(/data-pkc-log-important="true"/);
  });

  it('labels the viewer meta line with "Textlog · rendered view (read-only)"', () => {
    const entry = textlogEntry();
    const html = buildRenderedViewerHtml(entry, baseContainer());
    expect(html).toContain('Textlog · rendered view (read-only)');
  });

  it('labels a TEXT viewer meta line with "Text · rendered view (read-only)"', () => {
    const html = buildRenderedViewerHtml(textEntry('body'), baseContainer());
    expect(html).toContain('Text · rendered view (read-only)');
  });

  // ── Slice 4-B: Output Actions + meta tags ──

  it('includes Print and Download HTML toolbar buttons (hidden under @media print)', () => {
    const html = buildRenderedViewerHtml(textlogEntry(), baseContainer());
    expect(html).toContain('id="pkc-viewer-print-btn"');
    expect(html).toContain('id="pkc-viewer-download-btn"');
    expect(html).toContain('data-pkc-region="viewer-toolbar"');
    // Print media query hides the toolbar.  The @media block contains
    // multiple rules (body, header, toolbar, day, log); we match the
    // toolbar-hide rule directly and separately assert it lives in a
    // print context.
    expect(html).toContain('@media print');
    expect(html).toMatch(/\.pkc-viewer-toolbar\s*\{\s*display:\s*none;?\s*\}/);
  });

  it('emits pkc-source-lid and pkc-exported-at meta tags', () => {
    const html = buildRenderedViewerHtml(textlogEntry(), baseContainer());
    expect(html).toMatch(/<meta\s+name="pkc-source-lid"\s+content="e-log"\s*\/?>/);
    expect(html).toMatch(/<meta\s+name="pkc-exported-at"\s+content="[^"]+"\s*\/?>/);
    expect(html).toMatch(/<meta\s+name="pkc-archetype"\s+content="textlog"\s*\/?>/);
  });

  it('includes an inline viewer script that builds a Blob download (no toolbar in the output)', () => {
    const html = buildRenderedViewerHtml(textlogEntry(), baseContainer());
    // Inline script marker.
    expect(html).toContain('data-pkc-viewer-script');
    // The download strategy uses Blob + URL.createObjectURL.
    expect(html).toContain('createObjectURL');
    expect(html).toContain('Blob');
  });

  it('bakes a `<slug>-<yyyymmdd>.textlog.html` download filename into the script', () => {
    // Title "My Log" → "my-log", archetype textlog → `.textlog.html` extension.
    const html = buildRenderedViewerHtml(textlogEntry(), baseContainer());
    expect(html).toMatch(/a\.download\s*=\s*"my-log-\d{8}\.textlog\.html"/);
  });

  it('uses `.text.html` extension for a TEXT entry download filename', () => {
    const html = buildRenderedViewerHtml(textEntry('body', 'Hello World'), baseContainer());
    expect(html).toMatch(/a\.download\s*=\s*"hello-world-\d{8}\.text\.html"/);
  });
});

// ── Screen-first prose density ──
// Rendered viewer previously ran at `body { line-height: 1.65 }` which
// users read as "too airy" on screen. The density pass aligns it with
// the main app (body 1.4 / `.pkc-md-rendered` 1.4) and pins
// `article.pkc-viewer-body` to 1.4 explicitly so it cannot drift.
describe('buildRenderedViewerHtml — prose density', () => {
  it('body line-height is tightened toward the main-app baseline', () => {
    const html = buildRenderedViewerHtml(textEntry('body'), baseContainer());
    // The body rule should carry a screen line-height below the old
    // 1.65. Pin 1.5 directly — this is the documented screen value.
    const bodyRule = html.match(/\n\s*body\s*\{[^}]*\}/)?.[0] ?? '';
    expect(bodyRule).toMatch(/line-height:\s*1\.5(?!\d)/);
    // And the old looser value must not re-appear at body scope.
    expect(bodyRule).not.toMatch(/line-height:\s*1\.65/);
  });

  it('article.pkc-viewer-body pins line-height 1.35 to match the main app', () => {
    // Tightened alongside the main-app .pkc-md-rendered baseline
    // (1.4 → 1.35). Keeps exported HTML at the same density as the
    // live center pane.
    const html = buildRenderedViewerHtml(textEntry('body'), baseContainer());
    expect(html).toMatch(
      /article\.pkc-viewer-body\s*\{\s*line-height:\s*1\.35(?!\d)[^}]*\}/,
    );
  });

  it('print block loosens the body article to 1.5 for paper breathing room', () => {
    const html = buildRenderedViewerHtml(textEntry('body'), baseContainer());
    const printBlock = html.match(/@media print\s*\{[\s\S]*?\n\s*\}/);
    expect(printBlock).not.toBeNull();
    expect(printBlock![0]).toMatch(
      /article\.pkc-viewer-body\s*\{\s*line-height:\s*1\.5(?!\d)[^}]*\}/,
    );
  });
});

// ── Screen-first width policy ──
// See the width-policy comment block above the `style` template in
// `src/adapter/ui/rendered-viewer.ts` for the design rationale.
describe('buildRenderedViewerHtml — screen-first body width', () => {
  it('main element uses a viewport-scaling clamp instead of a fixed A4 cap', () => {
    const html = buildRenderedViewerHtml(textEntry('body'), baseContainer());
    // A viewport-scaling clamp keeps the measure wide on screen.
    // The exact bounds are documented in rendered-viewer.ts; we pin
    // the SHAPE (clamp with a vw middle term) rather than the numeric
    // bounds so minor tuning stays test-friendly.
    expect(html).toMatch(/main\s*\{\s*max-width:\s*clamp\([^)]*vw[^)]*\)/);
    // The old, unconditional A4-ish 48rem cap should no longer be the
    // default on-screen width rule.
    expect(html).not.toMatch(/main\s*\{\s*max-width:\s*48rem;\s*margin:\s*0\s*auto/);
  });

  it('restores the A4-ish 48rem cap under @media print for paper output', () => {
    const html = buildRenderedViewerHtml(textEntry('body'), baseContainer());
    // Grab just the @media print block and confirm the narrower cap
    // is re-applied inside it (so saved PDFs / physical prints stay
    // laid out like the original A4 target).
    const printBlock = html.match(/@media print\s*\{[\s\S]*?\n\s*\}/);
    expect(printBlock).not.toBeNull();
    expect(printBlock![0]).toMatch(/main\s*\{\s*max-width:\s*48rem;?\s*\}/);
  });
});

// ── Table of Contents in exported preview ──
// Both TEXT and TEXTLOG entries must carry a static <nav class="pkc-toc
// pkc-toc-preview"> at the top of the exported HTML so readers can jump
// to headings (TEXT) or day / log / heading layers (TEXTLOG) without
// any JavaScript — anchors are native href="#id".
describe('buildRenderedViewerHtml — Table of Contents', () => {
  it('emits pkc-toc-preview nav for a TEXT entry with h1/h2/h3', () => {
    const html = buildRenderedViewerHtml(
      textEntry('# Alpha\n\n## Beta\n\n### Gamma\n\nbody'),
      baseContainer(),
    );
    expect(html).toContain('class="pkc-toc pkc-toc-preview"');
    expect(html).toContain('data-pkc-region="toc"');
    expect(html).toContain('>Contents<');
    expect(html).toContain('href="#alpha"');
    expect(html).toContain('href="#beta"');
    expect(html).toContain('href="#gamma"');
  });

  it('emits day / log anchors for a TEXTLOG entry', () => {
    const html = buildRenderedViewerHtml(textlogEntry(), baseContainer());
    expect(html).toContain('class="pkc-toc pkc-toc-preview"');
    // textlogEntry() logs are dated 2026-04-09.
    expect(html).toContain('href="#day-2026-04-09"');
    expect(html).toContain('href="#log-log-1"');
    expect(html).toContain('href="#log-log-2"');
  });

  it('omits the TOC section entirely for an entry with no TOC-producing content', () => {
    // An attachment archetype produces no headings / logs, so the TOC
    // helper returns '' and the nav must not appear.
    const container = baseContainer({
      entries: [
        {
          lid: 'att',
          title: 'photo',
          body: JSON.stringify({ name: 'photo.png', mime: 'image/png', size: 10, asset_key: 'a1' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { a1: 'AAAA' },
    });
    const attEntry: Entry = {
      lid: 'att',
      title: 'photo',
      body: JSON.stringify({ name: 'photo.png', mime: 'image/png', size: 10, asset_key: 'a1' }),
      archetype: 'attachment',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const html = buildRenderedViewerHtml(attEntry, container);
    // CSS declarations mentioning the class still ship; what must be
    // absent is the actual <nav> element (checked via the class attr).
    expect(html).not.toContain('class="pkc-toc pkc-toc-preview"');
  });

  it('omits the TOC section for a TEXT entry with no headings', () => {
    const html = buildRenderedViewerHtml(textEntry('just body with **no** headings'), baseContainer());
    expect(html).not.toContain('class="pkc-toc pkc-toc-preview"');
  });
});
