import { describe, it, expect } from 'vitest';
import { buildPongProfile } from '@adapter/transport/profile';
import type { PongProfile } from '@adapter/transport/profile';
import { APP_ID, SCHEMA_VERSION, BUILD_FEATURES } from '@runtime/release-meta';
import { MESSAGE_CAPABILITIES } from '@adapter/transport/capability';

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

  // Decision D1 / spec §5.2.1 (PR-B', 2026-04-26): PongProfile.capabilities
  // is the message-type advertise list (MESSAGE_CAPABILITIES), NOT the
  // build-side feature flag list (BUILD_FEATURES).
  it('advertises MESSAGE_CAPABILITIES (message-type names, colon-separated)', () => {
    const profile = buildPongProfile({ version: '2.0.0', embedded: false });
    expect(profile.capabilities).toEqual(MESSAGE_CAPABILITIES);
    // Spec §5.2.1: every advertised entry uses message-type vocabulary.
    for (const cap of profile.capabilities) {
      expect(cap).toMatch(/^[a-z]+:[a-z-]+$/);
    }
    // PKC2 v1 canonical advertised types.
    expect(profile.capabilities).toContain('record:offer');
    expect(profile.capabilities).toContain('export:request');
  });

  // Decision D4 (PR-B'): build-side feature flags must NOT leak into
  // the transport advertise list. They serve different audiences.
  it('does not advertise build-side feature flags', () => {
    const profile = buildPongProfile({ version: '2.0.0', embedded: false });
    for (const flag of BUILD_FEATURES) {
      expect(profile.capabilities).not.toContain(flag);
    }
  });

  // Decision D2 (PR-B'): protocol primitives (ping/pong) are always
  // available and must NOT be advertised — spec §5.2.1 / §7.1.
  it('does not advertise ping/pong (protocol primitives)', () => {
    const profile = buildPongProfile({ version: '2.0.0', embedded: false });
    expect(profile.capabilities).not.toContain('ping');
    expect(profile.capabilities).not.toContain('pong');
  });

  it('produces a serializable object', () => {
    const profile = buildPongProfile({ version: '2.0.0', embedded: true });
    const json = JSON.stringify(profile);
    const parsed = JSON.parse(json) as PongProfile;
    expect(parsed.app_id).toBe('pkc2');
    expect(parsed.embedded).toBe(true);
  });
});
