import { describe, it, expect } from 'vitest';
import { parseFrontmatter, getFrontmatterKind } from '@features/markdown/frontmatter';

describe('parseFrontmatter', () => {
  it('returns empty meta and unchanged body when no frontmatter', () => {
    const body = '# Hello\nworld\n';
    const r = parseFrontmatter(body);
    expect(r.found).toBe(false);
    expect(r.meta).toEqual({});
    expect(r.body).toBe(body);
  });

  it('parses simple key:value frontmatter', () => {
    const body = '---\nkind: book\nauthor: 村上春樹\nyear: 1987\n---\n# memo\n';
    const r = parseFrontmatter(body);
    expect(r.found).toBe(true);
    expect(r.meta).toEqual({ kind: 'book', author: '村上春樹', year: 1987 });
    expect(r.body).toBe('# memo\n');
  });

  it('parses booleans, null, and quoted strings', () => {
    const body = '---\nactive: true\nfinished: false\nnote: ~\nname: "with: colon"\nalt: \'plain\'\n---\nbody\n';
    const r = parseFrontmatter(body);
    expect(r.meta.active).toBe(true);
    expect(r.meta.finished).toBe(false);
    expect(r.meta.note).toBe(null);
    expect(r.meta.name).toBe('with: colon');
    expect(r.meta.alt).toBe('plain');
  });

  it('parses inline arrays', () => {
    const body = '---\ntags: [a, b, c]\nnums: [1, 2, 3]\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.tags).toEqual(['a', 'b', 'c']);
    expect(r.meta.nums).toEqual([1, 2, 3]);
  });

  it('parses block-style arrays', () => {
    const body = '---\ntags:\n  - a\n  - b\n  - c\nname: thing\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.tags).toEqual(['a', 'b', 'c']);
    expect(r.meta.name).toBe('thing');
  });

  it('keeps date-like strings as strings (no Date object)', () => {
    const body = '---\nread_at: 2024-03-15\nstamp: 2024-01-10T00:00:00Z\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.read_at).toBe('2024-03-15');
    expect(r.meta.stamp).toBe('2024-01-10T00:00:00Z');
  });

  it('returns body untouched when closing fence is missing', () => {
    const body = '---\nkind: book\nbody never closed\n# memo\n';
    const r = parseFrontmatter(body);
    expect(r.found).toBe(false);
    expect(r.meta).toEqual({});
    expect(r.body).toBe(body);
  });

  it('returns body untouched when there is no opening fence at byte 0', () => {
    const body = '\n---\nkind: book\n---\n# memo\n';
    const r = parseFrontmatter(body);
    expect(r.found).toBe(false);
    expect(r.meta).toEqual({});
  });

  it('drops invalid keys (with spaces or special chars)', () => {
    const body = '---\nkind: book\n bad key: x\n!badly: y\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta.kind).toBe('book');
    expect(r.meta).not.toHaveProperty(' bad key');
    expect(r.meta).not.toHaveProperty('!badly');
  });

  it('strips trailing whitespace # comments', () => {
    const body = '---\nkind: book   # main type\nyear: 1987 # publication\n---\n';
    const r = parseFrontmatter(body);
    expect(r.meta).toEqual({ kind: 'book', year: 1987 });
  });

  it('preserves the rest of the body verbatim', () => {
    const body = '---\nkind: book\n---\n# Heading\n\nParagraph 1.\n\n```code\nfoo\n```\n';
    const r = parseFrontmatter(body);
    expect(r.body).toBe('# Heading\n\nParagraph 1.\n\n```code\nfoo\n```\n');
  });
});

describe('getFrontmatterKind', () => {
  it('returns the kind when present', () => {
    expect(getFrontmatterKind('---\nkind: book\n---\n')).toBe('book');
    expect(getFrontmatterKind('---\nkind: youtube\nurl: https://x\n---\n')).toBe('youtube');
  });

  it('returns null when no frontmatter', () => {
    expect(getFrontmatterKind('# memo\n')).toBe(null);
  });

  it('returns null when kind is missing or empty', () => {
    expect(getFrontmatterKind('---\nauthor: x\n---\n')).toBe(null);
    expect(getFrontmatterKind('---\nkind: ""\n---\n')).toBe(null);
  });
});

// ── reform-2026-05 PR-B 拡張(warnings + size cap)──

describe('parseFrontmatter — reform PR-B 拡張', () => {
  it('clean parse は warnings: []', () => {
    const r = parseFrontmatter('---\nkind: book\nyear: 2026\n---\n');
    expect(r.warnings).toEqual([]);
  });

  it('frontmatter 不在は warnings: []', () => {
    const r = parseFrontmatter('# no fm\n');
    expect(r.warnings).toEqual([]);
  });

  it('size cap(SOFT_DEFAULTS 16 KB)超過で size_limit warning + parse 中止', () => {
    const huge = 'x'.repeat(17 * 1024);
    const body = `---\nbig: "${huge}"\n---\nbody content\n`;
    const r = parseFrontmatter(body);
    expect(r.found).toBe(true);
    expect(r.meta).toEqual({});
    expect(r.warnings.length).toBeGreaterThanOrEqual(1);
    expect(r.warnings[0]!.kind).toBe('size_limit');
    expect(r.warnings[0]!.detail).toContain('frontmatter サイズ');
    expect(r.body).toBe('body content\n');
  });

  it('cap 以下なら size_limit warning なし', () => {
    const justUnder = 'x'.repeat(15 * 1024);
    const body = `---\nbig: "${justUnder}"\n---\n`;
    const r = parseFrontmatter(body);
    expect(r.warnings.filter((w) => w.kind === 'size_limit').length).toBe(0);
  });
});
