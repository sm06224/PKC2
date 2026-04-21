/**
 * serializeProvenanceMetadataCanonical — unit tests.
 *
 * Canonical spec:  docs/spec/provenance-relation-profile.md §2.2
 * Implementation:  src/features/provenance/serialize-metadata.ts
 */
import { describe, it, expect } from 'vitest';
import { serializeProvenanceMetadataCanonical } from '@features/provenance';

describe('serializeProvenanceMetadataCanonical', () => {
  it('returns "{}" for undefined metadata', () => {
    expect(serializeProvenanceMetadataCanonical(undefined)).toBe('{}');
  });

  it('returns "{}" for empty-object metadata', () => {
    expect(serializeProvenanceMetadataCanonical({})).toBe('{}');
  });

  it('returns "{}" when all values are non-string / empty string / null', () => {
    const m = {
      a: 42 as unknown as string,
      b: null as unknown as string,
      c: '',
      d: undefined as unknown as string,
    };
    expect(serializeProvenanceMetadataCanonical(m)).toBe('{}');
  });

  it('emits canonical keys in priority order: required → recommended → alphabetical', () => {
    // Keys provided in mixed order to confirm sorting is independent of input order.
    const m: Record<string, string> = {
      split_mode: 'heading',
      segment_count: '3',
      source_content_hash: 'abcd1234ef567890',
      converted_at: '2026-04-16T12:34:56Z',
      conversion_kind: 'text-to-textlog',
    };
    const json = serializeProvenanceMetadataCanonical(m);
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed)).toEqual([
      'conversion_kind',
      'converted_at',
      'source_content_hash',
      'segment_count',
      'split_mode',
    ]);
  });

  it('preserves raw canonical values (no pretty-print applied)', () => {
    const m: Record<string, string> = {
      conversion_kind: 'text-to-textlog',
      converted_at: '2026-04-16T12:34:56Z',
      source_content_hash: 'abcd1234ef567890',
    };
    const json = serializeProvenanceMetadataCanonical(m);
    const parsed = JSON.parse(json);
    // Raw ISO 8601 — NOT locale-formatted.
    expect(parsed.converted_at).toBe('2026-04-16T12:34:56Z');
    // Full hash — NOT truncated.
    expect(parsed.source_content_hash).toBe('abcd1234ef567890');
    expect(parsed.conversion_kind).toBe('text-to-textlog');
  });

  it('filters non-string values, keeping only valid string keys', () => {
    const m = {
      conversion_kind: 'text-to-textlog',
      bad_num: 42 as unknown as string,
      bad_null: null as unknown as string,
      empty: '',
      good: 'value',
    };
    const json = serializeProvenanceMetadataCanonical(m);
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed).sort()).toEqual(['conversion_kind', 'good']);
    expect(parsed.conversion_kind).toBe('text-to-textlog');
    expect(parsed.good).toBe('value');
  });

  it('uses 2-space indentation (readable JSON)', () => {
    const m: Record<string, string> = {
      conversion_kind: 'text-to-textlog',
      converted_at: '2026-04-16T12:34:56Z',
    };
    const json = serializeProvenanceMetadataCanonical(m);
    expect(json.split('\n')[1]).toMatch(/^ {2}"/);
  });

  it('unknown keys sort alphabetically among themselves', () => {
    const m: Record<string, string> = {
      zebra: 'Z',
      alpha: 'A',
      mike: 'M',
    };
    const json = serializeProvenanceMetadataCanonical(m);
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed)).toEqual(['alpha', 'mike', 'zebra']);
  });

  it('output is deterministic for the same input (two calls return identical strings)', () => {
    const m: Record<string, string> = {
      conversion_kind: 'text-to-textlog',
      converted_at: '2026-04-16T12:34:56Z',
      source_content_hash: 'abcd1234ef567890',
      split_mode: 'heading',
    };
    const a = serializeProvenanceMetadataCanonical(m);
    const b = serializeProvenanceMetadataCanonical(m);
    expect(a).toBe(b);
  });
});
