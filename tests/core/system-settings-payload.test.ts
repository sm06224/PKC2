import { describe, it, expect } from 'vitest';
import {
  resolveSettingsPayload,
  serializeSettingsPayload,
  SETTINGS_DEFAULTS,
  isValidHexColor,
  isValidThemeMode,
  isValidFontFamily,
  isValidLanguageTag,
  isValidTimezone,
} from '@core/model/system-settings-payload';

describe('isValidThemeMode', () => {
  it('accepts dark / light / auto', () => {
    expect(isValidThemeMode('dark')).toBe(true);
    expect(isValidThemeMode('light')).toBe(true);
    expect(isValidThemeMode('auto')).toBe(true);
  });

  it('rejects unknown strings and non-strings', () => {
    expect(isValidThemeMode('system')).toBe(false);
    expect(isValidThemeMode('')).toBe(false);
    expect(isValidThemeMode(null)).toBe(false);
    expect(isValidThemeMode(undefined)).toBe(false);
    expect(isValidThemeMode(0)).toBe(false);
  });
});

describe('isValidHexColor', () => {
  it('accepts 6-char lowercase and uppercase hex', () => {
    expect(isValidHexColor('#abcdef')).toBe(true);
    expect(isValidHexColor('#ABCDEF')).toBe(true);
    expect(isValidHexColor('#112233')).toBe(true);
  });

  it('rejects 3-char hex (must be canonicalized by caller)', () => {
    expect(isValidHexColor('#abc')).toBe(false);
  });

  it('rejects non-hex strings', () => {
    expect(isValidHexColor('abcdef')).toBe(false);
    expect(isValidHexColor('#xyzxyz')).toBe(false);
    expect(isValidHexColor('rgb(1,2,3)')).toBe(false);
    expect(isValidHexColor(null)).toBe(false);
    expect(isValidHexColor(undefined)).toBe(false);
  });
});

describe('isValidFontFamily', () => {
  it('accepts plain font names', () => {
    expect(isValidFontFamily('Inter')).toBe(true);
    expect(isValidFontFamily('BIZ UDGothic')).toBe(true);
  });

  it('rejects empty / too-long / injection payloads', () => {
    expect(isValidFontFamily('')).toBe(false);
    expect(isValidFontFamily('a'.repeat(201))).toBe(false);
    expect(isValidFontFamily('Foo; color: red')).toBe(false);
    expect(isValidFontFamily('Foo\n')).toBe(false);
    expect(isValidFontFamily('Foo{Bar}')).toBe(false);
  });
});

describe('isValidLanguageTag', () => {
  it('accepts BCP 47 tags', () => {
    expect(isValidLanguageTag('en')).toBe(true);
    expect(isValidLanguageTag('ja')).toBe(true);
    expect(isValidLanguageTag('en-US')).toBe(true);
    expect(isValidLanguageTag('zh-Hant-TW')).toBe(true);
  });

  it('rejects malformed tags', () => {
    expect(isValidLanguageTag('')).toBe(false);
    expect(isValidLanguageTag('e')).toBe(false);
    expect(isValidLanguageTag('english')).toBe(false);
    expect(isValidLanguageTag('en_US')).toBe(false);
  });
});

describe('isValidTimezone', () => {
  it('accepts common IANA timezones', () => {
    expect(isValidTimezone('Asia/Tokyo')).toBe(true);
    expect(isValidTimezone('America/Los_Angeles')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
  });

  it('rejects unknown / malformed timezones', () => {
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(isValidTimezone('Tokyo')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });
});

describe('resolveSettingsPayload', () => {
  it('returns defaults when body is undefined', () => {
    expect(resolveSettingsPayload(undefined)).toEqual(SETTINGS_DEFAULTS);
  });

  it('returns defaults when body is empty', () => {
    expect(resolveSettingsPayload('')).toEqual(SETTINGS_DEFAULTS);
  });

  it('returns defaults on malformed JSON', () => {
    expect(resolveSettingsPayload('{ not json')).toEqual(SETTINGS_DEFAULTS);
  });

  it('returns defaults when format discriminator is wrong', () => {
    expect(resolveSettingsPayload(JSON.stringify({ format: 'something-else', version: 1 }))).toEqual(SETTINGS_DEFAULTS);
  });

  it('returns defaults when version mismatches', () => {
    expect(resolveSettingsPayload(JSON.stringify({
      format: 'pkc2-system-settings', version: 2,
      theme: { mode: 'dark', scanline: true },
    }))).toEqual(SETTINGS_DEFAULTS);
  });

  it('accepts a fully-populated valid payload round-trip', () => {
    const input = {
      format: 'pkc2-system-settings' as const,
      version: 1 as const,
      theme: { mode: 'dark' as const, scanline: true, accentColor: '#ff00aa', borderColor: '#112233', backgroundColor: null, uiTextColor: '#fafafa', bodyTextColor: null },
      display: { preferredFont: 'Inter', fontDirectInput: null },
      locale: { language: 'en-US', timezone: 'Asia/Tokyo' },
    };
    expect(resolveSettingsPayload(serializeSettingsPayload(input))).toEqual(input);
  });

  it('falls back per-field for individually malformed fields', () => {
    const body = JSON.stringify({
      format: 'pkc2-system-settings',
      version: 1,
      theme: {
        mode: 'nope',                       // invalid → default
        scanline: 'yes',                    // invalid → default false
        accentColor: '#abc',                // invalid (3-char) → null
        borderColor: '#AABBCC',             // valid → kept
        textColor: 42,                      // invalid → null
      },
      display: { preferredFont: 'Foo; evil' }, // invalid → null
      locale: { language: 'english', timezone: 'Asia/Tokyo' }, // lang invalid, tz valid
    });
    const resolved = resolveSettingsPayload(body);
    expect(resolved.theme.mode).toBe(SETTINGS_DEFAULTS.theme.mode);
    expect(resolved.theme.scanline).toBe(false);
    expect(resolved.theme.accentColor).toBeNull();
    expect(resolved.theme.borderColor).toBe('#AABBCC');
    expect(resolved.theme.uiTextColor).toBeNull();
    expect(resolved.theme.bodyTextColor).toBeNull();
    expect(resolved.theme.backgroundColor).toBeNull();
    expect(resolved.display.preferredFont).toBeNull();
    expect(resolved.locale.language).toBeNull();
    expect(resolved.locale.timezone).toBe('Asia/Tokyo');
  });

  it('ignores unknown top-level and nested keys (forward-compatible)', () => {
    const body = JSON.stringify({
      format: 'pkc2-system-settings',
      version: 1,
      theme: { mode: 'light', unknown_theme: 'x' },
      display: { preferredFont: null },
      locale: { language: null, timezone: null },
      future_section: { foo: 'bar' },
    });
    const resolved = resolveSettingsPayload(body);
    expect(resolved.theme.mode).toBe('light');
    expect('unknown_theme' in resolved.theme).toBe(false);
    expect('future_section' in resolved).toBe(false);
  });

  it('returns defaults when theme/display/locale are missing entirely', () => {
    const body = JSON.stringify({ format: 'pkc2-system-settings', version: 1 });
    expect(resolveSettingsPayload(body)).toEqual(SETTINGS_DEFAULTS);
  });
});

describe('serializeSettingsPayload', () => {
  it('round-trips SETTINGS_DEFAULTS', () => {
    const body = serializeSettingsPayload(SETTINGS_DEFAULTS);
    expect(resolveSettingsPayload(body)).toEqual(SETTINGS_DEFAULTS);
  });

  it('produces pretty-printed JSON (stable diff-friendly)', () => {
    const body = serializeSettingsPayload(SETTINGS_DEFAULTS);
    expect(body).toContain('\n  ');
  });
});
