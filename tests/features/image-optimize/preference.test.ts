import { describe, it, expect } from 'vitest';
import {
  parsePreference,
  preferenceStorageKey,
  serializePreference,
} from '@features/image-optimize/preference';

describe('preferenceStorageKey', () => {
  it('produces surface-scoped keys', () => {
    expect(preferenceStorageKey('paste')).toBe('pkc2.imageOptimize.preference.paste');
    expect(preferenceStorageKey('drop')).toBe('pkc2.imageOptimize.preference.drop');
    expect(preferenceStorageKey('attach')).toBe('pkc2.imageOptimize.preference.attach');
  });
});

describe('parsePreference', () => {
  it('returns null for empty / invalid input', () => {
    expect(parsePreference(null)).toBeNull();
    expect(parsePreference(undefined)).toBeNull();
    expect(parsePreference('')).toBeNull();
    expect(parsePreference('not json')).toBeNull();
    expect(parsePreference('{}')).toBeNull();
  });

  it('rejects invalid action values', () => {
    const bad = JSON.stringify({
      action: 'maybe',
      keepOriginal: false,
      rememberedAt: '2026-04-19T00:00:00Z',
    });
    expect(parsePreference(bad)).toBeNull();
  });

  it('rejects non-boolean keepOriginal', () => {
    const bad = JSON.stringify({
      action: 'optimize',
      keepOriginal: 'yes',
      rememberedAt: '2026-04-19T00:00:00Z',
    });
    expect(parsePreference(bad)).toBeNull();
  });

  it('parses a valid optimize preference', () => {
    const raw = JSON.stringify({
      action: 'optimize',
      keepOriginal: false,
      rememberedAt: '2026-04-19T10:30:00.000Z',
    });
    expect(parsePreference(raw)).toEqual({
      action: 'optimize',
      keepOriginal: false,
      rememberedAt: '2026-04-19T10:30:00.000Z',
    });
  });

  it('parses a valid decline preference with keepOriginal true', () => {
    const raw = JSON.stringify({
      action: 'decline',
      keepOriginal: true,
      rememberedAt: '2026-04-19T10:30:00.000Z',
    });
    expect(parsePreference(raw)).toEqual({
      action: 'decline',
      keepOriginal: true,
      rememberedAt: '2026-04-19T10:30:00.000Z',
    });
  });
});

describe('serializePreference', () => {
  it('round-trips through parsePreference', () => {
    const original = {
      action: 'optimize' as const,
      keepOriginal: true,
      rememberedAt: '2026-04-19T10:30:00.000Z',
    };
    const raw = serializePreference(original);
    expect(parsePreference(raw)).toEqual(original);
  });
});
