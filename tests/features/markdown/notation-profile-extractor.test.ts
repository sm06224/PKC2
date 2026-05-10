import { describe, it, expect } from 'vitest';
import {
  extractNotationProfile,
  extractNotationOverridesFlat,
} from '@features/markdown/notation-profile-extractor';
import { DEFAULT_PROFILE } from '@features/notation/profiles';

describe('extractNotationProfile — frontmatter から profile 解決', () => {
  it('frontmatter なし → DEFAULT_PROFILE', () => {
    expect(extractNotationProfile('# memo\n')).toBe(DEFAULT_PROFILE);
    expect(extractNotationProfile('')).toBe(DEFAULT_PROFILE);
  });

  it('notation 省略 → DEFAULT_PROFILE', () => {
    expect(extractNotationProfile('---\nkind: book\n---\n')).toBe(DEFAULT_PROFILE);
  });

  it('notation: pkc-markdown-1.0 → そのまま', () => {
    expect(extractNotationProfile('---\nnotation: pkc-markdown-1.0\n---\n')).toBe(
      'pkc-markdown-1.0',
    );
  });

  it('notation: gfm → そのまま', () => {
    expect(extractNotationProfile('---\nnotation: gfm\n---\n')).toBe('gfm');
  });

  it('notation: commonmark → そのまま', () => {
    expect(extractNotationProfile('---\nnotation: commonmark\n---\n')).toBe('commonmark');
  });

  it('notation が string でない(数値)→ DEFAULT_PROFILE', () => {
    expect(extractNotationProfile('---\nnotation: 12345\n---\n')).toBe(DEFAULT_PROFILE);
  });

  it('notation 空文字 → DEFAULT_PROFILE', () => {
    expect(extractNotationProfile('---\nnotation: ""\n---\n')).toBe(DEFAULT_PROFILE);
  });

  it('notation 未知 name → そのまま返す(profile resolver 側で fallback)', () => {
    // resolver responsibility:本 helper は raw を返すだけ
    expect(extractNotationProfile('---\nnotation: my-custom-profile\n---\n')).toBe(
      'my-custom-profile',
    );
  });

  it('複数 frontmatter field との混在', () => {
    const body = '---\nkind: book\nnotation: pandoc\nyear: 2026\n---\n# title\n';
    expect(extractNotationProfile(body)).toBe('pandoc');
  });
});

describe('extractNotationOverridesFlat — flat dot-notation override 抽出', () => {
  it('notation_overrides 不在 → 空 record', () => {
    expect(extractNotationOverridesFlat('---\nkind: book\n---\n')).toEqual({});
    expect(extractNotationOverridesFlat('')).toEqual({});
  });

  it('flat dot-notation の boolean / string 値', () => {
    const body = [
      '---',
      'notation: pkc-markdown-1.0',
      'notation_overrides.ruby: false',
      'notation_overrides.embed_default: quote',
      'notation_overrides.math: true',
      '---',
    ].join('\n');
    const out = extractNotationOverridesFlat(body);
    expect(out).toEqual({
      ruby: false,
      embed_default: 'quote',
      math: true,
    });
  });

  it('number / null は skip(notation override の値として意味を成さない)', () => {
    const body = '---\nnotation_overrides.depth: 3\nnotation_overrides.x: ~\n---\n';
    const out = extractNotationOverridesFlat(body);
    // number と null は skip
    expect(out).toEqual({});
  });

  it('無効 key 名(英字始まり以外)は skip', () => {
    const body = '---\nnotation_overrides.123abc: true\nnotation_overrides.valid: true\n---\n';
    const out = extractNotationOverridesFlat(body);
    expect(out).toEqual({ valid: true });
  });

  it('notation field 自体は overrides に含まれない', () => {
    const body = '---\nnotation: pkc-markdown-1.0\nnotation_overrides.ruby: false\n---\n';
    const out = extractNotationOverridesFlat(body);
    expect(out).toEqual({ ruby: false });
    expect(out).not.toHaveProperty('notation');
  });
});
