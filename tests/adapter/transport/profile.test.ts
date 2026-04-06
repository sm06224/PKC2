import { describe, it, expect } from 'vitest';
import { buildPongProfile } from '@adapter/transport/profile';
import type { PongProfile } from '@adapter/transport/profile';
import { APP_ID, SCHEMA_VERSION, CAPABILITIES } from '@runtime/release-meta';

describe('buildPongProfile', () => {
  it('builds profile with correct app_id and schema_version', () => {
    const profile = buildPongProfile({ version: '2.0.0', embedded: false });
    expect(profile.app_id).toBe(APP_ID);
    expect(profile.schema_version).toBe(SCHEMA_VERSION);
  });

  it('includes version from input', () => {
    const profile = buildPongProfile({ version: '2.1.0', embedded: false });
    expect(profile.version).toBe('2.1.0');
  });

  it('reflects embedded=true', () => {
    const profile = buildPongProfile({ version: '2.0.0', embedded: true });
    expect(profile.embedded).toBe(true);
  });

  it('reflects embedded=false', () => {
    const profile = buildPongProfile({ version: '2.0.0', embedded: false });
    expect(profile.embedded).toBe(false);
  });

  it('includes current capabilities', () => {
    const profile = buildPongProfile({ version: '2.0.0', embedded: false });
    expect(profile.capabilities).toEqual(CAPABILITIES);
    expect(profile.capabilities).toContain('core');
    expect(profile.capabilities).toContain('export');
    expect(profile.capabilities).toContain('record-offer');
  });

  it('produces a serializable object', () => {
    const profile = buildPongProfile({ version: '2.0.0', embedded: true });
    const json = JSON.stringify(profile);
    const parsed = JSON.parse(json) as PongProfile;
    expect(parsed.app_id).toBe('pkc2');
    expect(parsed.embedded).toBe(true);
  });
});
