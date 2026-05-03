import { describe, it, expect } from 'vitest';
import {
  slugifyHeading,
  makeSlugCounter,
  extractHeadingsFromMarkdown,
  extractTocFromEntry,
  makeLogLabel,
  renderStaticTocHtml,
} from '../../../src/features/markdown/markdown-toc';
import type { TocNode } from '../../../src/features/markdown/markdown-toc';
import type { Entry } from '../../../src/core/model/record';

// ── slugifyHeading ──

describe('slugifyHeading', () => {
  it('lower-cases and joins words with -', () => {
    expect(slugifyHeading('Hello World')).toBe('hello-world');
  });

  it('strips punctuation but keeps unicode letters/digits', () => {
    expect(slugifyHeading('What is it?')).toBe('what-is-it');
    expect(slugifyHeading('日本語の見出し')).toBe('日本語の見出し');
  });

  it('collapses repeated separators and trims', () => {
    expect(slugifyHeading('  spaced   out  ')).toBe('spaced-out');
    expect(slugifyHeading('-leading and trailing-')).toBe('leading-and-trailing');
  });

  it('returns empty string when the text has no slug-worthy characters', () => {
    expect(slugifyHeading('???')).toBe('');
    expect(slugifyHeading('')).toBe('');
  });
});

// ── makeSlugCounter ──

describe('makeSlugCounter', () => {
  it('returns a bare slug for the first occurrence', () => {
    const slugOf = makeSlugCounter();
    expect(slugOf('Overview')).toBe('overview');
  });

  it('suffixes subsequent collisions with -1, -2, …', () => {
    const slugOf = makeSlugCounter();
    expect(slugOf('Intro')).toBe('intro');
    expect(slugOf('Intro')).toBe('intro-1');
    expect(slugOf('Intro')).toBe('intro-2');
  });

  it('falls back to "heading" when the text slugifies to empty', () => {
    const slugOf = makeSlugCounter();
    expect(slugOf('???')).toBe('heading');
    expect(slugOf('!!!')).toBe('heading-1');
  });

  it('independent counter instances do not share state', () => {
    const a = makeSlugCounter();
    const b = makeSlugCounter();
    expect(a('Title')).toBe('title');
    expect(b('Title')).toBe('title');
  });
});

// ── extractHeadingsFromMarkdown ──

describe('extractHeadingsFromMarkdown', () => {
  it('returns empty array for empty input', () => {
    expect(extractHeadingsFromMarkdown('')).toEqual([]);
  });

  it('extracts h1/h2/h3 with correct levels', () => {
    const md = '# A\n\n## B\n\n### C';
    expect(extractHeadingsFromMarkdown(md)).toEqual([
      { level: 1, text: 'A', slug: 'a' },
      { level: 2, text: 'B', slug: 'b' },
      { level: 3, text: 'C', slug: 'c' },
    ]);
  });

  it('ignores h4 and deeper', () => {
    const md = '# A\n\n#### D\n\n##### E\n\n###### F';
    const out = extractHeadingsFromMarkdown(md);
    expect(out.map((h) => h.level)).toEqual([1]);
  });

  it('ignores headings inside fenced code blocks', () => {
    const md = '```\n# not a heading\n```\n\n# real';
    const out = extractHeadingsFromMarkdown(md);
    expect(out.map((h) => h.text)).toEqual(['real']);
  });

  it('supports tilde-fenced code blocks', () => {
    const md = '~~~\n# also not\n~~~\n\n# yes';
    const out = extractHeadingsFromMarkdown(md);
    expect(out.map((h) => h.text)).toEqual(['yes']);
  });

  it('strips ATX closing hashes', () => {
    const md = '## Heading ##';
    expect(extractHeadingsFromMarkdown(md)[0]!.text).toBe('Heading');
  });

  it('disambiguates duplicate heading slugs', () => {
    const md = '# Overview\n\n## Overview\n\n# Overview';
    const slugs = extractHeadingsFromMarkdown(md).map((h) => h.slug);
    expect(slugs).toEqual(['overview', 'overview-1', 'overview-2']);
  });

  it('preserves CRLF line endings (not just LF)', () => {
    const md = '# A\r\n\r\n## B';
    expect(extractHeadingsFromMarkdown(md).map((h) => h.text)).toEqual(['A', 'B']);
  });

  it('does not match lines starting with # that are not headings', () => {
    // Missing space after # → not an ATX heading.
    expect(extractHeadingsFromMarkdown('#foo')).toEqual([]);
  });
});

// ── extractTocFromEntry ──

function makeEntry(archetype: Entry['archetype'], body: string): Entry {
  return {
    lid: 'lid-1',
    archetype,
    title: '',
    body,
    created_at: '2026-04-12T00:00:00.000Z',
    updated_at: '2026-04-12T00:00:00.000Z',
  };
}

describe('extractTocFromEntry — TEXT', () => {
  it('returns empty for archetypes without markdown bodies', () => {
    expect(extractTocFromEntry(makeEntry('todo', '# should not appear'))).toEqual([]);
    expect(extractTocFromEntry(makeEntry('form', '# nope'))).toEqual([]);
    expect(extractTocFromEntry(makeEntry('folder', '# nope'))).toEqual([]);
    expect(extractTocFromEntry(makeEntry('attachment', '# nope'))).toEqual([]);
  });

  it('flattens headings from entry.body as heading nodes', () => {
    const out = extractTocFromEntry(makeEntry('text', '# A\n## B\n### C'));
    expect(out).toHaveLength(3);
    expect(out.every((n) => n.kind === 'heading')).toBe(true);
    expect(out.map((n) => (n as { text: string }).text)).toEqual(['A', 'B', 'C']);
    expect(out.map((n) => (n as { level: number }).level)).toEqual([1, 2, 3]);
  });

  it('TEXT heading nodes carry no logId', () => {
    const out = extractTocFromEntry(makeEntry('text', '# A'));
    expect(out[0]).toMatchObject({ kind: 'heading' });
    expect((out[0] as { logId?: string }).logId).toBeUndefined();
  });
});

describe('extractTocFromEntry — TEXTLOG (time-driven)', () => {
  it('emits day / log / heading nodes in linearized pre-order', () => {
    const body = JSON.stringify({
      entries: [
        // Two logs on 2026-04-09, one on 2026-04-10 → viewer/TOC
        // use desc so 2026-04-10 comes first.
        { id: 'log-a', text: '# Morning notes', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-b', text: '## Afternoon section', createdAt: '2026-04-09T14:00:00Z', flags: [] },
        { id: 'log-c', text: '# Today\n\nintro', createdAt: '2026-04-10T09:00:00Z', flags: [] },
      ],
    });
    const out = extractTocFromEntry(makeEntry('textlog', body));
    expect(out.map((n) => n.kind)).toEqual([
      'day', 'log', 'heading',        // 2026-04-10
      'day', 'log', 'heading',        // 2026-04-09 log-b (desc)
      'log', 'heading',               //           log-a (desc within day)
    ]);
  });

  it('day nodes carry dateKey and a pre-computed targetId', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-x', text: 'plain', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    });
    const out = extractTocFromEntry(makeEntry('textlog', body));
    const day = out.find((n): n is Extract<TocNode, { kind: 'day' }> => n.kind === 'day')!;
    // dateKey is the local yyyy-mm-dd produced by buildTextlogDoc; assert
    // shape rather than exact value to stay timezone-portable.
    expect(day.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(day.targetId).toBe(`day-${day.dateKey}`);
    expect(day.text).toBe(day.dateKey);
    expect(day.level).toBe(1);
  });

  it('log nodes carry logId, targetId, and a time-prefixed label', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-x', text: 'hello world', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    });
    const out = extractTocFromEntry(makeEntry('textlog', body));
    const log = out.find((n): n is Extract<TocNode, { kind: 'log' }> => n.kind === 'log')!;
    expect(log.logId).toBe('log-x');
    expect(log.targetId).toBe('log-log-x');
    expect(log.level).toBe(2);
    // Label contains a time portion and a first-line preview.
    expect(log.text).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(log.text).toContain('hello world');
  });

  it('heading nodes under a log carry logId and depth >= 3', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-x', text: '# h1\n\n## h2\n\n### h3', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    });
    const out = extractTocFromEntry(makeEntry('textlog', body));
    const hs = out.filter((n): n is Extract<TocNode, { kind: 'heading' }> => n.kind === 'heading');
    expect(hs.map((h) => h.level)).toEqual([3, 4, 5]); // shifted by +2
    expect(hs.every((h) => h.logId === 'log-x')).toBe(true);
    expect(hs.map((h) => h.slug)).toEqual(['h1', 'h2', 'h3']);
  });

  it('emits day/log rows even when a log has no markdown headings', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-plain', text: 'just prose, no heading', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    });
    const out = extractTocFromEntry(makeEntry('textlog', body));
    expect(out.map((n) => n.kind)).toEqual(['day', 'log']);
  });

  it('empty textlog produces empty TOC (no day / log / heading rows)', () => {
    expect(extractTocFromEntry(makeEntry('textlog', ''))).toEqual([]);
    expect(extractTocFromEntry(makeEntry('textlog', '{"entries":[]}'))).toEqual([]);
  });

  it('slug collisions across logs are scoped per log (matches renderer)', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-1', text: '# Overview', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-2', text: '# Overview', createdAt: '2026-04-09T11:00:00Z', flags: [] },
      ],
    });
    const out = extractTocFromEntry(makeEntry('textlog', body));
    const hs = out.filter((n): n is Extract<TocNode, { kind: 'heading' }> => n.kind === 'heading');
    expect(hs.map((h) => h.slug)).toEqual(['overview', 'overview']);
    expect(hs.map((h) => h.logId)).toEqual(['log-2', 'log-1']); // desc order
  });

  it('undated logs get a day node with text "Undated" and targetId "day-undated"', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-bad', text: 'broken', createdAt: 'not-a-date', flags: [] },
      ],
    });
    const out = extractTocFromEntry(makeEntry('textlog', body));
    const day = out.find((n): n is Extract<TocNode, { kind: 'day' }> => n.kind === 'day')!;
    expect(day.dateKey).toBe('');
    expect(day.text).toBe('Undated');
    expect(day.targetId).toBe('day-undated');
  });

  it('respects { order: "asc" } so callers can match TOC to ascending content', () => {
    // The bug this guards: rendered viewer + detached entry-window
    // render TEXTLOG content with order:'asc' but TOC was always
    // forced to desc, leaving TOC top != content top. The fix lets
    // the caller pass the same order to both.
    const body = JSON.stringify({
      entries: [
        { id: 'log-a', text: '# A', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-b', text: '# B', createdAt: '2026-04-10T10:00:00Z', flags: [] },
      ],
    });
    const desc = extractTocFromEntry(makeEntry('textlog', body));
    const asc = extractTocFromEntry(makeEntry('textlog', body), { order: 'asc' });

    const descLogIds = desc
      .filter((n): n is Extract<TocNode, { kind: 'log' }> => n.kind === 'log')
      .map((n) => n.logId);
    const ascLogIds = asc
      .filter((n): n is Extract<TocNode, { kind: 'log' }> => n.kind === 'log')
      .map((n) => n.logId);

    expect(descLogIds).toEqual(['log-b', 'log-a']);  // newest first
    expect(ascLogIds).toEqual(['log-a', 'log-b']);   // oldest first
  });

  it('default order is desc (preserves pre-2026-05-03 sidebar / live viewer behavior)', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-x', text: 'plain', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-y', text: 'plain', createdAt: '2026-04-10T10:00:00Z', flags: [] },
      ],
    });
    const out = extractTocFromEntry(makeEntry('textlog', body));
    const logIds = out
      .filter((n): n is Extract<TocNode, { kind: 'log' }> => n.kind === 'log')
      .map((n) => n.logId);
    expect(logIds).toEqual(['log-y', 'log-x']);
  });
});

// ── makeLogLabel ──

describe('makeLogLabel', () => {
  it('prefixes the label with HH:mm:ss from the ISO timestamp', () => {
    const d = new Date(2026, 3, 9, 10, 15, 30);
    const label = makeLogLabel(d.toISOString(), 'hello');
    expect(label).toMatch(/^10:15:30/);
    expect(label).toContain('hello');
  });

  it('falls back to the time alone when body is empty', () => {
    const d = new Date(2026, 3, 9, 7, 5, 2);
    expect(makeLogLabel(d.toISOString(), '')).toBe('07:05:02');
    expect(makeLogLabel(d.toISOString(), '   \n  ')).toBe('07:05:02');
  });

  it('truncates preview beyond 60 chars with an ellipsis', () => {
    const d = new Date(2026, 3, 9, 0, 0, 0);
    const long = 'x'.repeat(200);
    const label = makeLogLabel(d.toISOString(), long);
    // 60 preview chars + ellipsis.
    expect(label).toMatch(/x{60}…$/);
  });

  it('skips ATX heading lines so the preview does not duplicate the heading child row', () => {
    const d = new Date(2026, 3, 9, 0, 0, 0);
    const body = '# Title\n\nthe real content';
    const label = makeLogLabel(d.toISOString(), body);
    // `# Title` is already surfaced as a heading child node; the log
    // label should instead show the first non-heading prose line.
    expect(label).toContain('the real content');
    expect(label).not.toContain('# Title');
  });

  it('falls back to the time when only heading lines exist', () => {
    const d = new Date(2026, 3, 9, 12, 0, 0);
    expect(makeLogLabel(d.toISOString(), '# Only')).toBe('12:00:00');
  });

  it('returns the raw ISO string when the timestamp is unparseable', () => {
    expect(makeLogLabel('not-a-date', 'body')).toContain('not-a-date');
  });
});

// ── renderStaticTocHtml ──

describe('renderStaticTocHtml', () => {
  it('returns empty string when there are no nodes', () => {
    expect(renderStaticTocHtml([])).toBe('');
  });

  it('emits a <nav class="pkc-toc pkc-toc-preview"> wrapper with a Contents label', () => {
    const nodes = extractTocFromEntry(makeEntry('text', '# A\n## B'));
    const html = renderStaticTocHtml(nodes);
    expect(html).toContain('class="pkc-toc pkc-toc-preview"');
    expect(html).toContain('>Contents<');
    expect(html).toContain('data-pkc-region="toc"');
  });

  it('heading nodes link to #slug (native anchors)', () => {
    const nodes = extractTocFromEntry(
      makeEntry('text', '# First Heading\n## Nested'),
    );
    const html = renderStaticTocHtml(nodes);
    expect(html).toContain('href="#first-heading"');
    expect(html).toContain('href="#nested"');
    expect(html).toContain('data-pkc-toc-kind="heading"');
    expect(html).toContain('data-pkc-toc-level="1"');
    expect(html).toContain('data-pkc-toc-level="2"');
  });

  it('TEXTLOG day nodes link to #day-<key>, log nodes to #log-<id>', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'l1', text: '# H1', createdAt: '2026-04-10T10:00:00.000Z', flags: [] },
      ],
    });
    const nodes = extractTocFromEntry(makeEntry('textlog', body));
    const html = renderStaticTocHtml(nodes);
    const day = nodes.find((n): n is Extract<TocNode, { kind: 'day' }> => n.kind === 'day')!;
    // dateKey depends on the local TZ of the test runner — assert via
    // the extracted key rather than a hardcoded value.
    expect(html).toContain(`href="#day-${day.dateKey}"`);
    expect(html).toContain('href="#log-l1"');
    expect(html).toContain('data-pkc-toc-kind="day"');
    expect(html).toContain('data-pkc-toc-kind="log"');
    // Headings inside a log use the raw slug (matches markdown-render).
    expect(html).toContain('href="#h1"');
  });

  it('HTML-escapes node text so headings cannot inject markup', () => {
    const nodes = extractTocFromEntry(
      makeEntry('text', '# <script>alert("x")</script>'),
    );
    const html = renderStaticTocHtml(nodes);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('produces a single <ul class="pkc-toc-list"> with one <li> per node', () => {
    const nodes = extractTocFromEntry(makeEntry('text', '# A\n# B\n# C'));
    const html = renderStaticTocHtml(nodes);
    const liCount = (html.match(/<li\s/g) || []).length;
    expect(liCount).toBe(3);
    expect(html.match(/<ul class="pkc-toc-list">/g)?.length).toBe(1);
  });
});
