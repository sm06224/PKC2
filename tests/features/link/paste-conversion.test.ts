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

// ─────────────────────────────────────────────────────────────────
// Post-correction additions: External Permalink + non-interference.
// Spec: docs/spec/pkc-link-unification-v0.md (post-correction §4 / §7).
// ─────────────────────────────────────────────────────────────────

const BASE_FILE = 'file:///home/u/pkc2.html';
const BASE_HTTP = 'https://example.com/pkc2.html';

describe('convertPastedText — External Permalink (post-correction §7.1)', () => {
  it('demotes a same-container entry external permalink (file:// base)', () => {
    const r = convertPastedText(
      `${BASE_FILE}#pkc?container=${SELF}&entry=lid_a`,
      SELF,
    );
    expect(r).toEqual<PasteConversionResult>({
      type: 'internal',
      target: 'entry:lid_a',
      presentation: 'link',
    });
  });

  it('demotes a same-container entry external permalink (https:// base)', () => {
    const r = convertPastedText(
      `${BASE_HTTP}#pkc?container=${SELF}&entry=lid_a`,
      SELF,
    );
    expect(r.type).toBe('internal');
    expect(r.target).toBe('entry:lid_a');
  });

  it('preserves the fragment from external permalink query (`fragment=`)', () => {
    const r = convertPastedText(
      `${BASE_FILE}#pkc?container=${SELF}&entry=lid_a&fragment=log/xyz`,
      SELF,
    );
    expect(r.target).toBe('entry:lid_a#log/xyz');
  });

  it('demotes a same-container asset external permalink', () => {
    const r = convertPastedText(
      `${BASE_HTTP}#pkc?container=${SELF}&asset=ast-001`,
      SELF,
    );
    expect(r.target).toBe('asset:ast-001');
  });
});

describe('convertPastedText — External Permalink cross-container (§7.2)', () => {
  it('keeps a cross-container entry external permalink verbatim', () => {
    const raw = `${BASE_HTTP}#pkc?container=${OTHER}&entry=lid_a`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('keeps a cross-container asset external permalink verbatim', () => {
    const raw = `${BASE_FILE}#pkc?container=${OTHER}&asset=ast-001`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('cross-container fragment is preserved in the raw string', () => {
    const raw = `${BASE_HTTP}#pkc?container=${OTHER}&entry=lid_a&fragment=log/xyz`;
    const r = convertPastedText(raw, SELF);
    expect(r.target).toBe(raw);
  });
});

describe('convertPastedText — malformed external permalink fallback', () => {
  it('missing container falls through to external', () => {
    const raw = `${BASE_HTTP}#pkc?entry=lid_a`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('missing entry/asset falls through to external', () => {
    const raw = `${BASE_HTTP}#pkc?container=${SELF}`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('unknown query (`#pkc?` prefix but garbage) falls through to external', () => {
    const raw = `${BASE_HTTP}#pkc?garbage`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });

  it('container_id mismatch is exact (case-sensitive) on external permalink', () => {
    const raw = `${BASE_HTTP}#pkc?container=${SELF.toUpperCase()}&entry=lid_a`;
    const r = convertPastedText(raw, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(raw);
  });
});

describe('convertPastedText — URI scheme non-interference (§12)', () => {
  // PKC parser MUST NOT touch external URI schemes that the
  // browser / OS handle natively. The presence of `#pkc?` is the
  // single trigger for External Permalink interpretation; ordinary
  // URLs without it pass through verbatim.
  const externals = [
    'https://example.com/path?q=1',
    'https://example.com/page#section', // ordinary fragment
    'http://example.com/',
    'file:///home/u/notes.txt',
    'mailto:user@example.com',
    'tel:+1-555-0100',
    'ms-word:ofe|u|https://example.com/file.docx',
    'ms-excel:ofv|u|https://example.com/file.xlsx',
    'ms-powerpoint:ofv|u|https://example.com/file.pptx',
    'onenote:https://example.com/section.one',
    'obsidian://open?vault=Notes&file=Today',
    'vscode://file/home/u/code.ts',
  ];

  it.each(externals)('keeps %s as external pass-through', (url) => {
    const r = convertPastedText(url, SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe(url);
  });

  it('treats https URL with non-PKC fragment as ordinary external', () => {
    const r = convertPastedText('https://example.com/#some-other-fragment', SELF);
    expect(r.type).toBe('external');
    expect(r.target).toBe('https://example.com/#some-other-fragment');
  });
});

describe('convertPastedText — cross-form idempotency (post-correction)', () => {
  it('external permalink demotion is idempotent: convert(convert(x).target)', () => {
    const raw = `${BASE_HTTP}#pkc?container=${SELF}&entry=lid_a`;
    const a = convertPastedText(raw, SELF);
    const b = convertPastedText(a.target, SELF);
    expect(b).toEqual(a);
  });

  it('cross-container external permalink stays cross-container on re-paste', () => {
    const raw = `${BASE_HTTP}#pkc?container=${OTHER}&entry=lid_a`;
    const a = convertPastedText(raw, SELF);
    const b = convertPastedText(a.target, SELF);
    expect(b).toEqual(a);
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
