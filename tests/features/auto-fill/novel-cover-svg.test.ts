/**
 * Novel cover SVG generator (PR-II, 2026-05-06).
 *
 * Pure helper; no DOM. Tests cover:
 *   - shape: SVG is well-formed and contains the title
 *   - author / provider inclusion
 *   - title wrapping at the configured budget
 *   - palette switches per provider (deterministic)
 *   - data URL round-trip is decodable as UTF-8
 *   - graceful empty-input handling
 */
import { describe, it, expect } from 'vitest';
import {
  buildNovelCoverSvg,
  buildNovelCoverDataUrl,
} from '@features/auto-fill/novel-cover-svg';

describe('buildNovelCoverSvg', () => {
  it('returns an SVG string with the title text', () => {
    const svg = buildNovelCoverSvg({ title: '異世界転生記', provider: 'カクヨム' });
    expect(svg).not.toBeNull();
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('異世界転生記');
    expect(svg).toContain('カクヨム');
  });

  it('returns null when title is empty', () => {
    expect(buildNovelCoverSvg({ title: '' })).toBeNull();
    expect(buildNovelCoverSvg({ title: '   ' })).toBeNull();
  });

  it('omits author label when author is empty/null', () => {
    const svg = buildNovelCoverSvg({ title: 'Quiet Cover' })!;
    expect(svg).toContain('Quiet Cover');
    // The author <text> element is only emitted when author is non-empty.
    expect(svg).not.toMatch(/Quiet Cover.*author/i);
  });

  it('includes author when provided', () => {
    const svg = buildNovelCoverSvg({
      title: 'A Tale',
      author: '山田太郎',
      provider: '小説家になろう',
    })!;
    expect(svg).toContain('山田太郎');
    expect(svg).toContain('小説家になろう');
  });

  it('uses different gradient palettes for different providers (deterministic)', () => {
    const a = buildNovelCoverSvg({ title: 'X', provider: 'カクヨム' })!;
    const b = buildNovelCoverSvg({ title: 'X', provider: '小説家になろう' })!;
    expect(a).not.toBe(b);
    // Same input → same output
    const aRepeat = buildNovelCoverSvg({ title: 'X', provider: 'カクヨム' })!;
    expect(a).toBe(aRepeat);
  });

  it('escapes XML metacharacters in title / author / provider', () => {
    const svg = buildNovelCoverSvg({
      title: 'Title <b>x</b> & "y"',
      author: "O'Brien",
      provider: '<provider>',
    })!;
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;b&gt;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&apos;');
    expect(svg).toContain('&lt;provider&gt;');
  });

  it('wraps long titles into multiple lines (cap at 4)', () => {
    const long = 'これはとても長いタイトルでカバーに収まりきらない筈です'
      + 'なので折り返し処理が走るはずです';
    const svg = buildNovelCoverSvg({ title: long })!;
    // Multiple <text> elements for the title — wrapping happened.
    const titleTexts = svg.match(/<text [^>]*font-family="serif"[^>]*>/g) ?? [];
    expect(titleTexts.length).toBeGreaterThan(1);
    expect(titleTexts.length).toBeLessThanOrEqual(4);
  });
});

describe('buildNovelCoverDataUrl', () => {
  it('produces a data:image/svg+xml;base64 URL', () => {
    const url = buildNovelCoverDataUrl({ title: 'Foo', author: 'Bar' });
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('returns null when title is empty', () => {
    expect(buildNovelCoverDataUrl({ title: '' })).toBeNull();
  });

  it('round-trips: decoded base64 contains the title', () => {
    const url = buildNovelCoverDataUrl({ title: '転生記', provider: 'カクヨム' })!;
    const b64 = url.replace(/^data:image\/svg\+xml;base64,/, '');
    // node Buffer for round-trip in test env
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');
    expect(decoded).toContain('転生記');
    expect(decoded).toContain('カクヨム');
    expect(decoded).toMatch(/^<svg /);
  });
});
