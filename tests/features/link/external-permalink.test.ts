import { describe, it, expect } from 'vitest';
import {
  parseExternalPermalink,
  formatExternalPermalink,
  type ParsedExternalPermalink,
} from '@features/link/permalink';

/**
 * External Permalink — `<base>#pkc?container=&entry=...` form.
 *
 * Spec: docs/spec/pkc-link-unification-v0.md §4 (post-correction).
 *
 * The External Permalink is the only PKC link form that is
 * **clickable in external apps** (Loop / Office / mail / note
 * apps). It uses host URL + a `#pkc?` query fragment so legacy
 * receivers that don't understand the fragment still land on
 * `pkc2.html`.
 */

const BASE_FILE = 'file:///home/u/pkc2.html';
const BASE_HTTP = 'https://example.com/pkc2.html';
const SELF = 'self-cid';

describe('parseExternalPermalink — valid forms', () => {
  it('parses an entry permalink under file:// base', () => {
    const r = parseExternalPermalink(`${BASE_FILE}#pkc?container=${SELF}&entry=lid_a`);
    expect(r).toEqual<ParsedExternalPermalink>({
      kind: 'entry',
      containerId: SELF,
      targetId: 'lid_a',
      baseUrl: BASE_FILE,
      raw: `${BASE_FILE}#pkc?container=${SELF}&entry=lid_a`,
    });
  });

  it('parses an entry permalink under https:// base', () => {
    const r = parseExternalPermalink(`${BASE_HTTP}#pkc?container=${SELF}&entry=lid_a`);
    expect(r).not.toBeNull();
    expect(r!.baseUrl).toBe(BASE_HTTP);
  });

  it('parses an asset permalink', () => {
    const r = parseExternalPermalink(`${BASE_FILE}#pkc?container=${SELF}&asset=ast-001`);
    expect(r).toEqual<ParsedExternalPermalink>({
      kind: 'asset',
      containerId: SELF,
      targetId: 'ast-001',
      baseUrl: BASE_FILE,
      raw: `${BASE_FILE}#pkc?container=${SELF}&asset=ast-001`,
    });
  });

  it('captures an optional fragment for entry references', () => {
    const r = parseExternalPermalink(
      `${BASE_FILE}#pkc?container=${SELF}&entry=lid_a&fragment=log/xyz`,
    );
    expect(r).not.toBeNull();
    expect(r!.fragment).toBe('log/xyz');
  });

  it('decodes URL-encoded fragment values', () => {
    const r = parseExternalPermalink(
      `${BASE_FILE}#pkc?container=${SELF}&entry=lid_a&fragment=${encodeURIComponent('log/xyz')}`,
    );
    expect(r!.fragment).toBe('log/xyz');
  });

  it('accepts param order entry→container (URLSearchParams is order-agnostic)', () => {
    const r = parseExternalPermalink(`${BASE_FILE}#pkc?entry=lid_a&container=${SELF}`);
    expect(r).not.toBeNull();
    expect(r!.kind).toBe('entry');
    expect(r!.containerId).toBe(SELF);
    expect(r!.targetId).toBe('lid_a');
  });
});

describe('parseExternalPermalink — malformed / rejected', () => {
  it('rejects missing #pkc? prefix', () => {
    expect(parseExternalPermalink(`${BASE_HTTP}#other-fragment`)).toBeNull();
  });

  it('rejects empty base URL', () => {
    expect(parseExternalPermalink(`#pkc?container=${SELF}&entry=lid_a`)).toBeNull();
  });

  it('rejects empty query string', () => {
    expect(parseExternalPermalink(`${BASE_FILE}#pkc?`)).toBeNull();
  });

  it('rejects missing container', () => {
    expect(parseExternalPermalink(`${BASE_FILE}#pkc?entry=lid_a`)).toBeNull();
  });

  it('rejects missing entry AND asset', () => {
    expect(parseExternalPermalink(`${BASE_FILE}#pkc?container=${SELF}`)).toBeNull();
  });

  it('rejects when both entry AND asset are present (ambiguous)', () => {
    expect(
      parseExternalPermalink(`${BASE_FILE}#pkc?container=${SELF}&entry=e&asset=a`),
    ).toBeNull();
  });

  it('rejects invalid container_id characters', () => {
    expect(
      parseExternalPermalink(`${BASE_FILE}#pkc?container=bad%20id&entry=lid_a`),
    ).toBeNull();
  });

  it('rejects asset with a fragment', () => {
    expect(
      parseExternalPermalink(`${BASE_FILE}#pkc?container=${SELF}&asset=a&fragment=x`),
    ).toBeNull();
  });

  it('rejects non-string input', () => {
    expect(parseExternalPermalink(null as unknown as string)).toBeNull();
    expect(parseExternalPermalink(undefined as unknown as string)).toBeNull();
  });
});

describe('formatExternalPermalink', () => {
  it('formats a bare entry permalink', () => {
    expect(
      formatExternalPermalink({
        baseUrl: BASE_FILE,
        kind: 'entry',
        containerId: SELF,
        targetId: 'lid_a',
      }),
    ).toBe(`${BASE_FILE}#pkc?container=${SELF}&entry=lid_a`);
  });

  it('formats an entry permalink with a fragment (canonical order)', () => {
    expect(
      formatExternalPermalink({
        baseUrl: BASE_HTTP,
        kind: 'entry',
        containerId: SELF,
        targetId: 'lid_a',
        fragment: 'log/xyz',
      }),
    ).toBe(`${BASE_HTTP}#pkc?container=${SELF}&entry=lid_a&fragment=log%2Fxyz`);
  });

  it('formats an asset permalink', () => {
    expect(
      formatExternalPermalink({
        baseUrl: BASE_FILE,
        kind: 'asset',
        containerId: SELF,
        targetId: 'ast-001',
      }),
    ).toBe(`${BASE_FILE}#pkc?container=${SELF}&asset=ast-001`);
  });

  it('returns null when baseUrl already contains a #', () => {
    expect(
      formatExternalPermalink({
        baseUrl: `${BASE_HTTP}#stale`,
        kind: 'entry',
        containerId: SELF,
        targetId: 'lid_a',
      }),
    ).toBeNull();
  });

  it('returns null on empty baseUrl', () => {
    expect(
      formatExternalPermalink({
        baseUrl: '',
        kind: 'entry',
        containerId: SELF,
        targetId: 'lid_a',
      }),
    ).toBeNull();
  });

  it('returns null on invalid container_id', () => {
    expect(
      formatExternalPermalink({
        baseUrl: BASE_FILE,
        kind: 'entry',
        containerId: 'bad id',
        targetId: 'lid_a',
      }),
    ).toBeNull();
  });

  it('returns null for asset+fragment combination', () => {
    expect(
      formatExternalPermalink({
        baseUrl: BASE_FILE,
        kind: 'asset',
        containerId: SELF,
        targetId: 'ast-001',
        fragment: 'log/xyz',
      }),
    ).toBeNull();
  });
});

describe('parse / format round-trip', () => {
  it('bare entry round-trips', () => {
    const url = `${BASE_FILE}#pkc?container=${SELF}&entry=lid_a`;
    const parsed = parseExternalPermalink(url);
    expect(parsed).not.toBeNull();
    expect(formatExternalPermalink(parsed!)).toBe(url);
  });

  it('entry with fragment round-trips through encoded canonical form', () => {
    // Input has unencoded "log/xyz" in fragment value; canonical
    // form encodes the slash, so the round-trip uses encoded form.
    const parsed = parseExternalPermalink(
      `${BASE_HTTP}#pkc?container=${SELF}&entry=lid_a&fragment=log/xyz`,
    );
    expect(parsed!.fragment).toBe('log/xyz');
    expect(formatExternalPermalink(parsed!)).toBe(
      `${BASE_HTTP}#pkc?container=${SELF}&entry=lid_a&fragment=log%2Fxyz`,
    );
  });

  it('asset round-trips', () => {
    const url = `${BASE_FILE}#pkc?container=${SELF}&asset=ast-001`;
    const parsed = parseExternalPermalink(url);
    expect(parsed).not.toBeNull();
    expect(formatExternalPermalink(parsed!)).toBe(url);
  });
});
