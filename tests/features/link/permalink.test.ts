import { describe, it, expect } from 'vitest';
import {
  parsePermalink,
  formatPermalink,
  isSamePermalinkContainer,
  PKC_SCHEME,
  type ParsedPermalink,
} from '@features/link/permalink';

/**
 * Permalink parser / formatter / same-container test suite.
 *
 * Spec: docs/spec/pkc-link-unification-v0.md §4 (canonical form) /
 * §5 (token shape). This helper is the single grammar source
 * shared with paste-conversion.ts — its regressions would ripple
 * into every future intake surface, so we pin the shape tightly.
 */

const SELF = 'self-container-id';
const OTHER = 'other-container-id';

describe('parsePermalink — valid forms', () => {
  it('parses a bare entry permalink', () => {
    const r = parsePermalink(`pkc://${SELF}/entry/lid_a`);
    expect(r).toEqual<ParsedPermalink>({
      kind: 'entry',
      containerId: SELF,
      targetId: 'lid_a',
      raw: `pkc://${SELF}/entry/lid_a`,
    });
  });

  it('parses an entry permalink with a log fragment', () => {
    const r = parsePermalink(`pkc://${SELF}/entry/lid_a#log/xyz`);
    expect(r).toEqual<ParsedPermalink>({
      kind: 'entry',
      containerId: SELF,
      targetId: 'lid_a',
      fragment: '#log/xyz',
      raw: `pkc://${SELF}/entry/lid_a#log/xyz`,
    });
  });

  it('parses entry permalinks for every fragment flavour', () => {
    const samples = [
      `pkc://${SELF}/entry/lid_a#log/a..b`,
      `pkc://${SELF}/entry/lid_a#day/2026-04-24`,
      `pkc://${SELF}/entry/lid_a#log/xyz/heading`,
    ];
    for (const s of samples) {
      const r = parsePermalink(s);
      expect(r).not.toBeNull();
      expect(r!.kind).toBe('entry');
      expect(r!.fragment).toBe(s.slice(s.indexOf('#')));
    }
  });

  it('parses a bare asset permalink', () => {
    const r = parsePermalink(`pkc://${SELF}/asset/ast-001`);
    expect(r).toEqual<ParsedPermalink>({
      kind: 'asset',
      containerId: SELF,
      targetId: 'ast-001',
      raw: `pkc://${SELF}/asset/ast-001`,
    });
  });

  it('normalizes a bare "#" suffix to no fragment', () => {
    const r = parsePermalink(`pkc://${SELF}/entry/lid_a#`);
    expect(r).not.toBeNull();
    expect(r!.fragment).toBeUndefined();
  });
});

describe('parsePermalink — malformed / rejected', () => {
  it('rejects wrong scheme', () => {
    expect(parsePermalink(`https://${SELF}/entry/lid_a`)).toBeNull();
  });

  it('rejects missing kind segment', () => {
    expect(parsePermalink(`pkc://${SELF}/lid_a`)).toBeNull();
  });

  it('rejects unknown kind segment', () => {
    expect(parsePermalink(`pkc://${SELF}/folder/lid_a`)).toBeNull();
  });

  it('rejects empty containerId', () => {
    expect(parsePermalink(`pkc:///entry/lid_a`)).toBeNull();
  });

  it('rejects empty targetId', () => {
    expect(parsePermalink(`pkc://${SELF}/entry/`)).toBeNull();
  });

  it('rejects containerId with invalid characters', () => {
    expect(parsePermalink(`pkc://bad id!/entry/lid_a`)).toBeNull();
  });

  it('rejects extra path segments', () => {
    expect(parsePermalink(`pkc://${SELF}/entry/lid_a/extra`)).toBeNull();
  });

  it('rejects asset permalink carrying a fragment', () => {
    expect(parsePermalink(`pkc://${SELF}/asset/ast-001#something`)).toBeNull();
  });

  it('rejects bare scheme (just "pkc://")', () => {
    expect(parsePermalink('pkc://')).toBeNull();
  });

  it('rejects non-string input', () => {
    expect(parsePermalink(null as unknown as string)).toBeNull();
    expect(parsePermalink(42 as unknown as string)).toBeNull();
    expect(parsePermalink(undefined as unknown as string)).toBeNull();
  });

  it('rejects empty string', () => {
    expect(parsePermalink('')).toBeNull();
  });

  it('treats container-id casing as distinct (case-sensitive)', () => {
    const upper = parsePermalink(`pkc://${SELF.toUpperCase()}/entry/lid_a`);
    expect(upper).not.toBeNull();
    // Case is preserved verbatim in the parsed shape.
    expect(upper!.containerId).toBe(SELF.toUpperCase());
    expect(upper!.containerId).not.toBe(SELF);
  });
});

describe('formatPermalink', () => {
  it('formats a bare entry permalink', () => {
    expect(
      formatPermalink({ kind: 'entry', containerId: SELF, targetId: 'lid_a' }),
    ).toBe(`pkc://${SELF}/entry/lid_a`);
  });

  it('formats an entry permalink with a fragment', () => {
    expect(
      formatPermalink({
        kind: 'entry',
        containerId: SELF,
        targetId: 'lid_a',
        fragment: '#log/xyz',
      }),
    ).toBe(`pkc://${SELF}/entry/lid_a#log/xyz`);
  });

  it('formats a bare asset permalink', () => {
    expect(
      formatPermalink({ kind: 'asset', containerId: SELF, targetId: 'ast-001' }),
    ).toBe(`pkc://${SELF}/asset/ast-001`);
  });

  it('returns null for asset + fragment combination', () => {
    expect(
      formatPermalink({
        kind: 'asset',
        containerId: SELF,
        targetId: 'ast-001',
        fragment: '#log/xyz',
      }),
    ).toBeNull();
  });

  it('returns null for invalid containerId characters', () => {
    expect(
      formatPermalink({ kind: 'entry', containerId: 'bad id!', targetId: 'lid_a' }),
    ).toBeNull();
  });

  it('returns null for invalid targetId characters', () => {
    expect(
      formatPermalink({ kind: 'entry', containerId: SELF, targetId: 'bad/id' }),
    ).toBeNull();
  });

  it('returns null for empty containerId / targetId', () => {
    expect(
      formatPermalink({ kind: 'entry', containerId: '', targetId: 'lid_a' }),
    ).toBeNull();
    expect(
      formatPermalink({ kind: 'entry', containerId: SELF, targetId: '' }),
    ).toBeNull();
  });

  it('returns null for unknown kind', () => {
    expect(
      // @ts-expect-error: exercising the runtime guard on bad kind
      formatPermalink({ kind: 'folder', containerId: SELF, targetId: 'lid_a' }),
    ).toBeNull();
  });

  it('requires the leading # on fragment input', () => {
    expect(
      formatPermalink({
        kind: 'entry',
        containerId: SELF,
        targetId: 'lid_a',
        fragment: 'log/xyz',
      }),
    ).toBeNull();
  });

  it('rejects a bare "#" fragment (too short to carry meaning)', () => {
    expect(
      formatPermalink({
        kind: 'entry',
        containerId: SELF,
        targetId: 'lid_a',
        fragment: '#',
      }),
    ).toBeNull();
  });
});

describe('parse / format round-trip', () => {
  it('bare entry round-trips', () => {
    const raw = `pkc://${SELF}/entry/lid_a`;
    const parsed = parsePermalink(raw);
    expect(parsed).not.toBeNull();
    expect(formatPermalink(parsed!)).toBe(raw);
  });

  it('entry with fragment round-trips', () => {
    const raw = `pkc://${SELF}/entry/lid_a#log/xyz/heading`;
    const parsed = parsePermalink(raw);
    expect(parsed).not.toBeNull();
    expect(formatPermalink(parsed!)).toBe(raw);
  });

  it('bare asset round-trips', () => {
    const raw = `pkc://${SELF}/asset/ast-001`;
    const parsed = parsePermalink(raw);
    expect(parsed).not.toBeNull();
    expect(formatPermalink(parsed!)).toBe(raw);
  });

  it('bare "#" suffix normalizes away on re-format', () => {
    // Input with a bare "#" is parsed without a fragment; re-formatting
    // therefore omits the trailing "#". Pinned so callers can trust the
    // normalization step.
    const parsed = parsePermalink(`pkc://${SELF}/entry/lid_a#`);
    expect(parsed).not.toBeNull();
    expect(formatPermalink(parsed!)).toBe(`pkc://${SELF}/entry/lid_a`);
  });
});

describe('isSamePermalinkContainer', () => {
  const parsed = parsePermalink(`pkc://${SELF}/entry/lid_a`);

  it('returns true on exact container id match', () => {
    expect(isSamePermalinkContainer(parsed!, SELF)).toBe(true);
  });

  it('returns false on mismatched container id', () => {
    expect(isSamePermalinkContainer(parsed!, OTHER)).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(isSamePermalinkContainer(parsed!, SELF.toUpperCase())).toBe(false);
  });

  it('returns false when the current container id is empty', () => {
    // Bootstrap safety: if we don't know our own id yet, never demote
    // a permalink to an internal reference.
    expect(isSamePermalinkContainer(parsed!, '')).toBe(false);
  });

  it('returns false for non-string current container ids', () => {
    expect(isSamePermalinkContainer(parsed!, null as unknown as string)).toBe(false);
    expect(isSamePermalinkContainer(parsed!, undefined as unknown as string)).toBe(false);
  });
});

describe('PKC_SCHEME constant', () => {
  it('is exposed and equals "pkc://"', () => {
    expect(PKC_SCHEME).toBe('pkc://');
  });
});
