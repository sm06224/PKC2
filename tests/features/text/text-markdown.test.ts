import { describe, it, expect } from 'vitest';
import {
  collectMarkdownAssetKeys,
  compactMarkdownAgainst,
} from '@features/text/text-markdown';

describe('collectMarkdownAssetKeys', () => {
  it('returns empty for empty input', () => {
    expect(collectMarkdownAssetKeys('')).toEqual([]);
  });

  it('finds image-form references', () => {
    expect(collectMarkdownAssetKeys('![alt](asset:ast-001)')).toEqual(['ast-001']);
  });

  it('finds link-form references', () => {
    expect(collectMarkdownAssetKeys('[label](asset:ast-002)')).toEqual(['ast-002']);
  });

  it('deduplicates repeated references, preserving first-occurrence order', () => {
    const md = '![](asset:a) and ![](asset:b) and ![](asset:a) and ![](asset:c)';
    expect(collectMarkdownAssetKeys(md)).toEqual(['a', 'b', 'c']);
  });

  it('tolerates an optional title after the key', () => {
    const md = '![](asset:ast-001 "a caption") then [l](asset:ast-002 "b")';
    expect(collectMarkdownAssetKeys(md)).toEqual(['ast-001', 'ast-002']);
  });

  it('ignores plain HTTP links and non-asset schemes', () => {
    const md = '[home](https://example.com) and ![alt](https://cdn/a.png) and [x](asset:ast-x)';
    expect(collectMarkdownAssetKeys(md)).toEqual(['ast-x']);
  });
});

describe('compactMarkdownAgainst', () => {
  it('returns empty for empty input', () => {
    expect(compactMarkdownAgainst('', new Set())).toBe('');
  });

  it('strips broken image refs down to alt text', () => {
    const out = compactMarkdownAgainst('See ![chart](asset:ast-gone) now', new Set());
    expect(out).toBe('See chart now');
  });

  it('strips broken link refs down to label text', () => {
    const out = compactMarkdownAgainst('Open [budget](asset:ast-gone)', new Set());
    expect(out).toBe('Open budget');
  });

  it('leaves present refs untouched', () => {
    const out = compactMarkdownAgainst(
      'See ![chart](asset:ast-ok)',
      new Set(['ast-ok']),
    );
    expect(out).toBe('See ![chart](asset:ast-ok)');
  });

  it('handles mixed present and missing in the same document', () => {
    const md = 'Start ![a](asset:x) mid [b](asset:y) end ![c](asset:z).';
    const out = compactMarkdownAgainst(md, new Set(['x', 'z']));
    expect(out).toBe('Start ![a](asset:x) mid b end ![c](asset:z).');
  });

  it('does not mutate the input string', () => {
    const input = '![](asset:ast-gone)';
    const before = input;
    compactMarkdownAgainst(input, new Set());
    expect(input).toBe(before);
  });
});
