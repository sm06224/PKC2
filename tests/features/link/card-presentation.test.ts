import { describe, it, expect } from 'vitest';
import {
  parseCardPresentation,
  formatCardPresentation,
  isCardPresentationLabel,
  type ParsedCardPresentation,
  type CardVariant,
} from '@features/link/card-presentation';

/**
 * Card presentation parser / formatter test suite.
 *
 * Spec: docs/spec/card-embed-presentation-v0.md §5 / §5.3 / §5.4 / §8.
 *
 * Slice 1 is syntax-only: the helper decides whether a string is a
 * card notation and extracts variant + target. No DOM, no renderer,
 * no widget. The renderer still shows `@[card](…)` as `@` + plain
 * link until Slice 2 lands.
 */

describe('parseCardPresentation — accepted shapes', () => {
  it('parses default variant with entry target', () => {
    const r = parseCardPresentation('@[card](entry:e1)');
    expect(r).toEqual<ParsedCardPresentation>({
      variant: 'default',
      target: 'entry:e1',
      raw: '@[card](entry:e1)',
    });
  });

  it('parses compact variant', () => {
    const r = parseCardPresentation('@[card:compact](entry:e1)');
    expect(r).toEqual<ParsedCardPresentation>({
      variant: 'compact',
      target: 'entry:e1',
      raw: '@[card:compact](entry:e1)',
    });
  });

  it('parses wide variant', () => {
    const r = parseCardPresentation('@[card:wide](entry:e1)');
    expect(r?.variant).toBe<CardVariant>('wide');
    expect(r?.target).toBe('entry:e1');
  });

  it('parses timeline variant', () => {
    const r = parseCardPresentation('@[card:timeline](entry:e1)');
    expect(r?.variant).toBe<CardVariant>('timeline');
    expect(r?.target).toBe('entry:e1');
  });

  it('parses entry target with log fragment', () => {
    const r = parseCardPresentation('@[card](entry:e1#log/log-1)');
    expect(r?.target).toBe('entry:e1#log/log-1');
    expect(r?.variant).toBe<CardVariant>('default');
  });

  it('parses entry target with day fragment', () => {
    const r = parseCardPresentation('@[card](entry:e1#day/2026-04-24)');
    expect(r?.target).toBe('entry:e1#day/2026-04-24');
  });

  it('parses entry target with legacy bare-id fragment', () => {
    const r = parseCardPresentation('@[card](entry:e1#legacy-id)');
    expect(r?.target).toBe('entry:e1#legacy-id');
  });

  it('parses Portable PKC Reference target (self-container shape)', () => {
    const r = parseCardPresentation('@[card](pkc://cid/entry/e1)');
    expect(r?.target).toBe('pkc://cid/entry/e1');
  });

  it('parses Portable PKC Reference with fragment', () => {
    const r = parseCardPresentation('@[card:compact](pkc://cid/entry/e1#log/xyz)');
    expect(r?.variant).toBe<CardVariant>('compact');
    expect(r?.target).toBe('pkc://cid/entry/e1#log/xyz');
  });

  it('preserves the target substring byte-for-byte', () => {
    const r = parseCardPresentation('@[card](entry:lid_a-123#log/log_42)');
    expect(r?.target).toBe('entry:lid_a-123#log/log_42');
  });

  it('preserves the raw string byte-for-byte', () => {
    const raw = '@[card:wide](pkc://other-cid/entry/lid_a#day/2026-04-24)';
    const r = parseCardPresentation(raw);
    expect(r?.raw).toBe(raw);
  });
});

describe('parseCardPresentation — rejected shapes', () => {
  it('rejects plain markdown link without @ prefix', () => {
    expect(parseCardPresentation('[card](entry:e1)')).toBeNull();
    expect(parseCardPresentation('[card:compact](entry:e1)')).toBeNull();
  });

  // Slice-3.5: asset-target cards are a v0 future dialect (spec §5.4
  // ❌ 非対応, audit Option C). The parser rejects them so that a
  // migration scanner / editor insertion UI cannot build a notation
  // the renderer does not support.
  it('rejects `asset:` target (v0 future dialect)', () => {
    expect(parseCardPresentation('@[card](asset:a1)')).toBeNull();
    expect(parseCardPresentation('@[card:compact](asset:a1)')).toBeNull();
    expect(parseCardPresentation('@[card:wide](asset:a1)')).toBeNull();
    expect(parseCardPresentation('@[card:timeline](asset:a1)')).toBeNull();
  });

  it('rejects `pkc://<cid>/asset/<key>` target (v0 future dialect)', () => {
    expect(
      parseCardPresentation('@[card](pkc://cid/asset/a1)'),
    ).toBeNull();
    expect(
      parseCardPresentation('@[card:compact](pkc://cid/asset/a1)'),
    ).toBeNull();
    expect(
      parseCardPresentation('@[card:wide](pkc://other-cid/asset/a1)'),
    ).toBeNull();
  });

  it('rejects unknown variant', () => {
    expect(parseCardPresentation('@[card:unknown](entry:e1)')).toBeNull();
    expect(parseCardPresentation('@[card:tiny](entry:e1)')).toBeNull();
    expect(parseCardPresentation('@[card:COMPACT](entry:e1)')).toBeNull();
  });

  it('rejects empty / whitespace-only target', () => {
    expect(parseCardPresentation('@[card]()')).toBeNull();
    expect(parseCardPresentation('@[card]( )')).toBeNull();
    expect(parseCardPresentation('@[card](   )')).toBeNull();
    expect(parseCardPresentation('@[card]( entry:e1 )')).toBeNull();
  });

  it('rejects ordinary web URLs', () => {
    expect(parseCardPresentation('@[card](https://example.com)')).toBeNull();
    expect(parseCardPresentation('@[card](http://example.com)')).toBeNull();
  });

  it('rejects javascript: and other foreign schemes', () => {
    expect(parseCardPresentation('@[card](javascript:alert(1))')).toBeNull();
    expect(parseCardPresentation('@[card](mailto:x@example.com)')).toBeNull();
    expect(parseCardPresentation('@[card](file:///etc/passwd)')).toBeNull();
  });

  it('rejects clickable-image notation', () => {
    expect(
      parseCardPresentation('[![alt](asset:a1)](asset:a1)'),
    ).toBeNull();
    expect(parseCardPresentation('[![](entry:e1)](entry:e1)')).toBeNull();
  });

  it('rejects image-embed notation (different presentation)', () => {
    expect(parseCardPresentation('![alt](entry:e1)')).toBeNull();
    expect(parseCardPresentation('![](asset:a1)')).toBeNull();
  });

  it('rejects External Permalink target (do-not-emit in body)', () => {
    expect(
      parseCardPresentation(
        '@[card](https://host/#pkc?container=c&entry=e1)',
      ),
    ).toBeNull();
  });

  it('rejects malformed entry fragment', () => {
    expect(
      parseCardPresentation('@[card](entry:e1#day/2026-13-99)'),
    ).toBeNull();
    expect(parseCardPresentation('@[card](entry:)')).toBeNull();
  });

  it('rejects malformed Portable PKC Reference', () => {
    expect(parseCardPresentation('@[card](pkc://cid)')).toBeNull();
    expect(parseCardPresentation('@[card](pkc://cid/entry/)')).toBeNull();
    expect(parseCardPresentation('@[card](pkc://cid/unknown/e1)')).toBeNull();
  });

  it('rejects leading / trailing whitespace around the whole notation', () => {
    expect(parseCardPresentation(' @[card](entry:e1)')).toBeNull();
    expect(parseCardPresentation('@[card](entry:e1) ')).toBeNull();
    expect(parseCardPresentation('\n@[card](entry:e1)')).toBeNull();
  });

  it('rejects case-mismatched label', () => {
    expect(parseCardPresentation('@[Card](entry:e1)')).toBeNull();
    expect(parseCardPresentation('@[CARD](entry:e1)')).toBeNull();
  });

  it('rejects text surrounding the notation', () => {
    expect(parseCardPresentation('see @[card](entry:e1)')).toBeNull();
    expect(parseCardPresentation('@[card](entry:e1) trailing')).toBeNull();
  });

  it('is null-safe for non-string input', () => {
    // Intentionally exercises the type-guard.
    expect(parseCardPresentation(undefined as unknown as string)).toBeNull();
    expect(parseCardPresentation(null as unknown as string)).toBeNull();
    expect(parseCardPresentation(42 as unknown as string)).toBeNull();
    expect(parseCardPresentation({} as unknown as string)).toBeNull();
  });
});

describe('formatCardPresentation', () => {
  it('formats default variant', () => {
    expect(formatCardPresentation({ target: 'entry:e1' })).toBe(
      '@[card](entry:e1)',
    );
  });

  it('formats explicit default variant identically', () => {
    expect(
      formatCardPresentation({ target: 'entry:e1', variant: 'default' }),
    ).toBe('@[card](entry:e1)');
  });

  it('formats each known variant', () => {
    expect(
      formatCardPresentation({ target: 'entry:e1', variant: 'compact' }),
    ).toBe('@[card:compact](entry:e1)');
    expect(
      formatCardPresentation({ target: 'entry:e1', variant: 'wide' }),
    ).toBe('@[card:wide](entry:e1)');
    expect(
      formatCardPresentation({ target: 'entry:e1', variant: 'timeline' }),
    ).toBe('@[card:timeline](entry:e1)');
  });

  it('formats Portable PKC Reference entry target', () => {
    expect(
      formatCardPresentation({ target: 'pkc://cid/entry/e1' }),
    ).toBe('@[card](pkc://cid/entry/e1)');
    expect(
      formatCardPresentation({
        target: 'pkc://cid/entry/e1',
        variant: 'compact',
      }),
    ).toBe('@[card:compact](pkc://cid/entry/e1)');
  });

  it('returns null for asset-flavoured targets (v0 future dialect)', () => {
    // Slice-3.5: asset preview cards are not canonical in v0. The
    // formatter must not round-trip an asset target into a notation
    // the renderer would silently drop.
    expect(formatCardPresentation({ target: 'asset:a1' })).toBeNull();
    expect(
      formatCardPresentation({ target: 'pkc://cid/asset/a1' }),
    ).toBeNull();
    expect(
      formatCardPresentation({
        target: 'pkc://cid/asset/a1',
        variant: 'wide',
      }),
    ).toBeNull();
  });

  it('returns null for an invalid target', () => {
    expect(formatCardPresentation({ target: '' })).toBeNull();
    expect(formatCardPresentation({ target: 'https://example.com' })).toBeNull();
    expect(formatCardPresentation({ target: 'javascript:alert(1)' })).toBeNull();
    expect(formatCardPresentation({ target: 'entry:' })).toBeNull();
  });

  it('returns null for unknown variant', () => {
    expect(
      formatCardPresentation({
        target: 'entry:e1',
        variant: 'unknown' as CardVariant,
      }),
    ).toBeNull();
  });

  it('is null-safe for non-object input', () => {
    expect(
      formatCardPresentation(null as unknown as { target: string }),
    ).toBeNull();
    expect(
      formatCardPresentation(undefined as unknown as { target: string }),
    ).toBeNull();
  });
});

describe('parse → format round trip', () => {
  const samples: readonly string[] = [
    '@[card](entry:e1)',
    '@[card:compact](entry:e1)',
    '@[card:wide](entry:e1)',
    '@[card:timeline](entry:e1)',
    '@[card](entry:e1#log/log-1)',
    '@[card](entry:e1#day/2026-04-24)',
    '@[card](entry:e1#log/xyz/heading-slug)',
    '@[card](pkc://cid/entry/e1)',
    '@[card:compact](pkc://cid/entry/e1#log/xyz)',
  ];

  for (const s of samples) {
    it(`round-trips ${s}`, () => {
      const parsed = parseCardPresentation(s);
      expect(parsed).not.toBeNull();
      const round = formatCardPresentation({
        target: parsed!.target,
        variant: parsed!.variant,
      });
      expect(round).toBe(s);
    });
  }
});

describe('isCardPresentationLabel', () => {
  it('accepts the bare `card` label', () => {
    expect(isCardPresentationLabel('card')).toBe(true);
  });

  it('accepts known variant labels', () => {
    expect(isCardPresentationLabel('card:compact')).toBe(true);
    expect(isCardPresentationLabel('card:wide')).toBe(true);
    expect(isCardPresentationLabel('card:timeline')).toBe(true);
  });

  it('rejects unknown variant labels', () => {
    expect(isCardPresentationLabel('card:unknown')).toBe(false);
    expect(isCardPresentationLabel('card:')).toBe(false);
  });

  it('rejects case-mismatched labels', () => {
    expect(isCardPresentationLabel('Card')).toBe(false);
    expect(isCardPresentationLabel('CARD')).toBe(false);
    expect(isCardPresentationLabel('card:Compact')).toBe(false);
  });

  it('rejects unrelated labels', () => {
    expect(isCardPresentationLabel('')).toBe(false);
    expect(isCardPresentationLabel('some entry title')).toBe(false);
    expect(isCardPresentationLabel('entry:e1')).toBe(false);
  });

  it('is null-safe for non-string input', () => {
    expect(isCardPresentationLabel(undefined as unknown as string)).toBe(false);
    expect(isCardPresentationLabel(null as unknown as string)).toBe(false);
    expect(isCardPresentationLabel(42 as unknown as string)).toBe(false);
  });
});
