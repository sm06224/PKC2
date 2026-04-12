import { describe, it, expect } from 'vitest';
import {
  slugifyHeading,
  makeSlugCounter,
  extractHeadingsFromMarkdown,
  extractTocFromEntry,
} from '../../../src/features/markdown/markdown-toc';
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

describe('extractTocFromEntry', () => {
  it('returns empty for archetypes without markdown bodies', () => {
    expect(extractTocFromEntry(makeEntry('todo', '# should not appear'))).toEqual([]);
    expect(extractTocFromEntry(makeEntry('form', '# nope'))).toEqual([]);
    expect(extractTocFromEntry(makeEntry('folder', '# nope'))).toEqual([]);
    expect(extractTocFromEntry(makeEntry('attachment', '# nope'))).toEqual([]);
  });

  it('TEXT: flattens headings from entry.body without logId', () => {
    const out = extractTocFromEntry(makeEntry('text', '# A\n## B\n### C'));
    expect(out).toHaveLength(3);
    expect(out.every((h) => h.logId === undefined)).toBe(true);
    expect(out.map((h) => h.text)).toEqual(['A', 'B', 'C']);
  });

  it('TEXTLOG: concatenates headings across log entries, each tagged with its logId', () => {
    const body = JSON.stringify({
      entries: [
        {
          id: 'log-1',
          text: '# First log\n\nSome body',
          createdAt: '2026-04-09T10:00:00Z',
          flags: [],
        },
        {
          id: 'log-2',
          text: '## Second log heading',
          createdAt: '2026-04-09T11:00:00Z',
          flags: [],
        },
      ],
    });
    const out = extractTocFromEntry(makeEntry('textlog', body));
    expect(out).toEqual([
      { level: 1, text: 'First log', slug: 'first-log', logId: 'log-1' },
      { level: 2, text: 'Second log heading', slug: 'second-log-heading', logId: 'log-2' },
    ]);
  });

  it('TEXTLOG: skips log entries with no headings but keeps ordering', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-1', text: 'plain log line', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-2', text: '# heading here', createdAt: '2026-04-09T11:00:00Z', flags: [] },
        { id: 'log-3', text: 'another plain', createdAt: '2026-04-09T12:00:00Z', flags: [] },
      ],
    });
    const out = extractTocFromEntry(makeEntry('textlog', body));
    expect(out).toEqual([
      { level: 1, text: 'heading here', slug: 'heading-here', logId: 'log-2' },
    ]);
  });

  it('TEXTLOG: slug collisions are scoped per log entry (matches renderer)', () => {
    // Because each log entry renders independently, the renderer resets
    // its slug counter per-entry. The TOC extractor mirrors that, so the
    // same heading text in two different log entries gets the same slug
    // `overview` (not `overview-1`). The click handler disambiguates by
    // scoping the DOM lookup to `data-pkc-log-id`.
    const body = JSON.stringify({
      entries: [
        { id: 'log-1', text: '# Overview', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-2', text: '# Overview', createdAt: '2026-04-09T11:00:00Z', flags: [] },
      ],
    });
    const out = extractTocFromEntry(makeEntry('textlog', body));
    expect(out.map((h) => h.slug)).toEqual(['overview', 'overview']);
    expect(out.map((h) => h.logId)).toEqual(['log-1', 'log-2']);
  });

  it('TEXTLOG: empty body produces empty TOC', () => {
    expect(extractTocFromEntry(makeEntry('textlog', ''))).toEqual([]);
    expect(extractTocFromEntry(makeEntry('textlog', '{"entries":[]}'))).toEqual([]);
  });
});
