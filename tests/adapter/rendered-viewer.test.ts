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
    expect(html).toContain('<h1>Hello</h1>');
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
  it('flattens the log through serializeTextlogAsMarkdown and renders markdown', () => {
    const entry = textlogEntry();
    const html = buildRenderedViewerHtml(entry, baseContainer());
    // Each log row becomes an `h2` because the serializer emits `## ts`.
    const h2Count = (html.match(/<h2>/g) ?? []).length;
    expect(h2Count).toBe(2);
    // First row's markdown body is rendered as bold.
    expect(html).toContain('<strong>bold</strong>');
    // Second (important) row's heading gets the ★ marker.
    expect(html).toMatch(/<h2>[^<]*★<\/h2>/);
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
});
