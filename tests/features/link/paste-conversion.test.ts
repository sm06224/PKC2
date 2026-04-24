import { describe, it, expect } from 'vitest';
import {
  convertPastedText,
  type PasteConversionResult,
} from '@features/link/paste-conversion';

/**
 * Paste Conversion Engine — minimal slice test suite.
 *
 * Spec: `docs/spec/pkc-link-unification-v0.md` §7.
 * Pins the entry-point behaviour before any parser / renderer /
 * markdown layer is built. Every downstream link feature depends on
 * these contracts being stable.
 */

const SELF = 'self-container-id';
const OTHER = 'other-container-id';

describe('convertPastedText — §7.1 permalink → internal (same container)', () => {
  it('entry permalink to self is demoted to internal entry: reference', () => {
    const r = convertPastedText(`pkc://${SELF}/entry/lid_a`, SELF);
    expect(r).toEqual<PasteConversionResult>({
      type: 'internal',
      target: 'entry:lid_a',
      presentation: 'link',
    });
  });

  it('asset permalink to self is demoted to internal asset: reference', () => {
    const r = convertPastedText(`pkc://${SELF}/asset/ast-001`, SELF);
    expect(r).toEqual<PasteConversionResult>({
      type: 'internal',
      target: 'asset:ast-001',
      presentation: 'link',
    });
  });

  it('preserves the log fragment verbatim', () => {
    const r = convertPastedText(`pkc://${SELF}/entry/lid_a#log/xyz`, SELF);
    expect(r.type).toBe('internal');
    expect(r.target).toBe('entry:lid_a#log/xyz');
  });

  it('preserves a log range fragment', () => {
    const r = convertPastedText(`pkc://${SELF}/entry/lid_a#log/a..b`, SELF);
    expect(r.target).toBe('entry:lid_a#log/a..b');
  });

  it('preserves a day fragment', () => {
    const r = convertPastedText(`pkc://${SELF}/entry/lid_a#day/2026-04-24`, SELF);
    expect(r.target).toBe('entry:lid_a#day/2026-04-24');
  });

  it('preserves a heading fragment (log/<id>/<slug>)', () => {
    const r = convertPastedText(`pkc://${SELF}/entry/lid_a#log/xyz/heading`, SELF);
    expect(r.target).toBe('entry:lid_a#log/xyz/heading');
  });
});

describe('convertPastedText — §7.2 permalink → external (cross-container)', () => {
  it('entry permalink to a different container is kept verbatim', () => {
    const raw = `pkc://${OTHER}/entry/lid_a`;
    const r = convertPastedText(raw, SELF);
    expect(r).toEqual<PasteConversionResult>({
      type: 'external',
      target: raw,
      presentation: 'link',
    });
  });

  it('asset permalink to a different container is kept verbatim', () => {
    const raw = `pkc://${OTHER}/asset/ast-001`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('cross-container fragment is preserved without demotion', () => {
    const raw = `pkc://${OTHER}/entry/lid_a#log/xyz`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('container-id match is case-sensitive (exact match only)', () => {
    // Conservative: when casing differs, treat as a different container.
    const raw = `pkc://${SELF.toUpperCase()}/entry/lid_a`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });
});

describe('convertPastedText — §7.3 internal reference pass-through', () => {
  it('entry: reference is classified internal without rewriting', () => {
    const r = convertPastedText('entry:lid_a', SELF);
    expect(r).toEqual<PasteConversionResult>({
      type: 'internal',
      target: 'entry:lid_a',
      presentation: 'link',
    });
  });

  it('entry: with fragment is passed through as internal', () => {
    const r = convertPastedText('entry:lid_a#log/xyz', SELF);
    expect(r.type).toBe('internal');
    expect(r.target).toBe('entry:lid_a#log/xyz');
  });

  it('asset: reference is classified internal without rewriting', () => {
    const r = convertPastedText('asset:ast-001', SELF);
    expect(r).toEqual<PasteConversionResult>({
      type: 'internal',
      target: 'asset:ast-001',
      presentation: 'link',
    });
  });
});

describe('convertPastedText — §7.4 plain text / other URLs are external', () => {
  it('plain text is external with raw target', () => {
    const r = convertPastedText('hello world', SELF);
    expect(r).toEqual<PasteConversionResult>({
      type: 'external',
      target: 'hello world',
      presentation: 'link',
    });
  });

  it('https URL is external with raw target (no web-link handling here)', () => {
    const raw = 'https://example.com/path?q=1';
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('empty string is external with empty target', () => {
    const r = convertPastedText('', SELF);
    expect(r).toEqual<PasteConversionResult>({
      type: 'external',
      target: '',
      presentation: 'link',
    });
  });
});

describe('convertPastedText — malformed permalink fallback (safety)', () => {
  it('missing kind segment falls back to external', () => {
    const raw = `pkc://${SELF}/lid_a`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('unknown kind segment falls back to external', () => {
    const raw = `pkc://${SELF}/folder/lid_a`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('empty id segment falls back to external', () => {
    const raw = `pkc://${SELF}/entry/`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('invalid container_id characters fall back to external', () => {
    const raw = `pkc://bad id!/entry/lid_a`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('asset with fragment is malformed and falls back to external', () => {
    // Assets have no sub-locations (spec §5.2). A fragmented asset
    // permalink is ambiguous, so we keep the raw form rather than
    // silently dropping the fragment.
    const raw = `pkc://${SELF}/asset/ast-001#something`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('extra path segments fall back to external', () => {
    const raw = `pkc://${SELF}/entry/lid_a/extra`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('bare scheme (just "pkc://") falls back to external', () => {
    const r = convertPastedText('pkc://', SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe('pkc://');
  });

  it('non-string input does not throw', () => {
    // Cast to exercise the defensive guard that absorbs non-string
    // payloads from less-disciplined intake surfaces.
    const r = convertPastedText(null as unknown as string, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe('null');
  });
});

describe('convertPastedText — §7.6 idempotency', () => {
  it('feeding the output target back in yields the same classification (same container)', () => {
    const raw = `pkc://${SELF}/entry/lid_a`;
    const first = convertPastedText(raw, SELF);
    const second = convertPastedText(first.target, SELF);
    expect(second).toEqual(first);
  });

  it('feeding the output target back in yields the same classification (cross-container)', () => {
    const raw = `pkc://${OTHER}/entry/lid_a`;
    const first = convertPastedText(raw, SELF);
    const second = convertPastedText(first.target, SELF);
    expect(second).toEqual(first);
  });

  it('idempotent on plain text', () => {
    const first = convertPastedText('hello', SELF);
    const second = convertPastedText(first.target, SELF);
    expect(second).toEqual(first);
  });

  it('idempotent on fragment-carrying same-container permalink', () => {
    const raw = `pkc://${SELF}/entry/lid_a#log/xyz`;
    const first = convertPastedText(raw, SELF);
    const second = convertPastedText(first.target, SELF);
    expect(second).toEqual(first);
  });

  it('does not mutate the input string (pure function)', () => {
    const raw = `pkc://${SELF}/entry/lid_a`;
    const before = String(raw);
    convertPastedText(raw, SELF);
    expect(raw).toBe(before);
  });
});

describe('convertPastedText — output shape invariants', () => {
  it('always sets presentation to "link" in this slice (embed/card comes later)', () => {
    const samples = [
      `pkc://${SELF}/entry/lid_a`,
      `pkc://${OTHER}/entry/lid_a`,
      'entry:lid_a',
      'asset:ast-001',
      'https://example.com',
      'plain',
      '',
    ];
    for (const s of samples) {
      expect(convertPastedText(s, SELF).presentation).toBe('link');
    }
  });

  it('result fields are defined (no undefined leak into callers)', () => {
    const r = convertPastedText(`pkc://${SELF}/entry/lid_a`, SELF);
    expect(r.type).toBeDefined();
    expect(r.target).toBeDefined();
    expect(r.presentation).toBeDefined();
  });
});
