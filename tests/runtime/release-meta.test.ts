import { describe, it, expect } from 'vitest';
import type { ReleaseMeta, ReleaseKind } from '@runtime/release-meta';
import { APP_ID, SCHEMA_VERSION, BUILD_FEATURES, CAPABILITIES } from '@runtime/release-meta';

describe('ReleaseMeta type and constants', () => {
  it('APP_ID is pkc2', () => {
    expect(APP_ID).toBe('pkc2');
  });

  it('SCHEMA_VERSION is a positive integer', () => {
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
  });

  it('BUILD_FEATURES is a non-empty array of strings', () => {
    expect(BUILD_FEATURES.length).toBeGreaterThan(0);
    for (const cap of BUILD_FEATURES) {
      expect(typeof cap).toBe('string');
    }
  });

  // Decision D4 (PR-B', 2026-04-26): BUILD_FEATURES is build-side only,
  // never message-type names. The presence of a colon in any entry
  // signals contamination of message-type vocabulary into the build
  // flag list, which spec §5.2.1 forbids.
  it('BUILD_FEATURES does not contain message-type names', () => {
    for (const flag of BUILD_FEATURES) {
      expect(flag).not.toContain(':');
    }
  });

  it('CAPABILITIES is a backward-compat alias for BUILD_FEATURES', () => {
    expect(CAPABILITIES).toBe(BUILD_FEATURES);
  });

  it('ReleaseMeta can be constructed with all fields', () => {
    const meta: ReleaseMeta = {
      app: 'pkc2',
      version: '2.0.0',
      schema: 1,
      kind: 'dev',
      timestamp: '20260406143052',
      build_at: '2026-04-06T14:30:52Z',
      source_commit: 'abc1234',
      code_integrity: 'sha256:0000',
      capabilities: ['core', 'idb'],
    };
    expect(meta.app).toBe('pkc2');
    expect(meta.version).toBe('2.0.0');
  });

  it('ReleaseKind covers dev, stage, product', () => {
    const kinds: ReleaseKind[] = ['dev', 'stage', 'product'];
    expect(kinds).toHaveLength(3);
  });

  it('code_integrity format is sha256:<hex>', () => {
    const integrity = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('timestamp is 14 digits', () => {
    const ts = '20260406143052';
    expect(ts).toMatch(/^\d{14}$/);
  });
});
