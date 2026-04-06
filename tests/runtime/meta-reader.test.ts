/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readReleaseMeta, formatTripleVersion } from '@runtime/meta-reader';
import type { ReleaseMeta } from '@runtime/release-meta';

const sampleMeta: ReleaseMeta = {
  app: 'pkc2',
  version: '2.0.0',
  schema: 1,
  kind: 'dev',
  timestamp: '20260406143052',
  build_at: '2026-04-06T14:30:52Z',
  source_commit: 'abc1234',
  code_integrity: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  capabilities: ['core', 'idb'],
};

beforeEach(() => {
  // Clean up any existing pkc-meta element
  document.getElementById('pkc-meta')?.remove();
});

function injectMeta(json: string): void {
  const el = document.createElement('script');
  el.id = 'pkc-meta';
  el.type = 'application/json';
  el.textContent = json;
  document.body.appendChild(el);
}

describe('readReleaseMeta', () => {
  it('reads valid pkc-meta from DOM', () => {
    injectMeta(JSON.stringify(sampleMeta));
    const meta = readReleaseMeta();
    expect(meta).not.toBeNull();
    expect(meta!.app).toBe('pkc2');
    expect(meta!.version).toBe('2.0.0');
    expect(meta!.schema).toBe(1);
    expect(meta!.kind).toBe('dev');
    expect(meta!.timestamp).toBe('20260406143052');
    expect(meta!.capabilities).toEqual(['core', 'idb']);
  });

  it('returns null when pkc-meta element is missing', () => {
    expect(readReleaseMeta()).toBeNull();
  });

  it('returns null when pkc-meta is empty JSON', () => {
    injectMeta('{}');
    // Empty object is treated as no metadata
    // readReleaseMeta returns the parsed object but it won't have 'app'
    // For now it returns the parsed result; downstream validates
    const meta = readReleaseMeta();
    expect(meta).toBeNull();
  });

  it('returns null when pkc-meta contains invalid JSON', () => {
    injectMeta('not valid json {');
    expect(readReleaseMeta()).toBeNull();
  });

  it('reads all metadata fields correctly', () => {
    injectMeta(JSON.stringify(sampleMeta));
    const meta = readReleaseMeta()!;
    expect(meta.code_integrity).toMatch(/^sha256:/);
    expect(meta.source_commit).toBe('abc1234');
    expect(meta.build_at).toBe('2026-04-06T14:30:52Z');
  });
});

describe('formatTripleVersion', () => {
  it('formats dev version correctly', () => {
    expect(formatTripleVersion(sampleMeta)).toBe('2.0.0-dev+20260406143052');
  });

  it('formats product version correctly', () => {
    const productMeta = { ...sampleMeta, kind: 'product' as const, timestamp: '20260501120000' };
    expect(formatTripleVersion(productMeta)).toBe('2.0.0-product+20260501120000');
  });

  it('formats stage version correctly', () => {
    const stageMeta = { ...sampleMeta, kind: 'stage' as const };
    expect(formatTripleVersion(stageMeta)).toBe('2.0.0-stage+20260406143052');
  });
});
