/**
 * System Settings payload schema (FI-Settings v1).
 *
 * Canonical spec:
 *   - `docs/spec/system-settings-hidden-entry-v1-minimum-scope.md`
 *   - `docs/spec/system-settings-hidden-entry-v1-behavior-contract.md`
 *
 * The payload lives as the JSON body of the reserved `__settings__`
 * entry (archetype `system-settings`). Unlike About — which is
 * build-time immutable and treated as all-or-nothing — Settings is
 * user-mutable and parsed with **per-field fallback**: a single bad
 * value does not discard the rest of the user's preferences.
 *
 * Unknown top-level / nested keys are silently ignored so future
 * additive fields can be rolled out without a version bump.
 *
 * Pure — no DOM, no I/O.
 */

export type ThemeMode = 'dark' | 'light' | 'auto';

export interface SystemSettingsPayload {
  format: 'pkc2-system-settings';
  version: 1;
  theme: {
    mode: ThemeMode;
    scanline: boolean;
    accentColor: string | null;
    borderColor: string | null;
    textColor: string | null;
  };
  display: {
    preferredFont: string | null;
  };
  locale: {
    language: string | null;
    timezone: string | null;
  };
}

export const SETTINGS_DEFAULTS: SystemSettingsPayload = {
  format: 'pkc2-system-settings',
  version: 1,
  theme: {
    mode: 'auto',
    scanline: false,
    accentColor: null,
    borderColor: null,
    textColor: null,
  },
  display: {
    preferredFont: null,
  },
  locale: {
    language: null,
    timezone: null,
  },
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const BCP47_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const IANA_RE = /^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+)+$/;

export function isValidThemeMode(v: unknown): v is ThemeMode {
  return v === 'dark' || v === 'light' || v === 'auto';
}

export function isValidHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v);
}

export function isValidFontFamily(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (v.length === 0 || v.length > 200) return false;
  // Reject obvious CSS-injection payloads (semicolons, braces, newlines).
  return !/[;{}\n\r]/.test(v);
}

export function isValidLanguageTag(v: unknown): v is string {
  return typeof v === 'string' && BCP47_RE.test(v);
}

export function isValidTimezone(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (!IANA_RE.test(v) && v !== 'UTC') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse and normalize a settings payload with per-field fallback.
 *
 * - `undefined` / parse failure / format mismatch / version mismatch
 *   → full `SETTINGS_DEFAULTS`.
 * - Partial / malformed individual fields → that field falls back to
 *   its default while the rest are preserved.
 * - Unknown top-level or nested keys are ignored (forward-compatible).
 */
export function resolveSettingsPayload(body: string | undefined): SystemSettingsPayload {
  if (!body) return SETTINGS_DEFAULTS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.warn('[PKC2] Settings entry parse failed, using defaults');
    return SETTINGS_DEFAULTS;
  }
  if (typeof parsed !== 'object' || parsed === null) return SETTINGS_DEFAULTS;
  const o = parsed as Record<string, unknown>;
  if (o.format !== 'pkc2-system-settings') return SETTINGS_DEFAULTS;
  if (o.version !== 1) {
    console.warn('[PKC2] Settings entry version mismatch, using defaults');
    return SETTINGS_DEFAULTS;
  }

  const theme = (typeof o.theme === 'object' && o.theme !== null)
    ? o.theme as Record<string, unknown>
    : {};
  const display = (typeof o.display === 'object' && o.display !== null)
    ? o.display as Record<string, unknown>
    : {};
  const locale = (typeof o.locale === 'object' && o.locale !== null)
    ? o.locale as Record<string, unknown>
    : {};

  return {
    format: 'pkc2-system-settings',
    version: 1,
    theme: {
      mode: isValidThemeMode(theme.mode) ? theme.mode : SETTINGS_DEFAULTS.theme.mode,
      scanline: typeof theme.scanline === 'boolean' ? theme.scanline : SETTINGS_DEFAULTS.theme.scanline,
      accentColor: isValidHexColor(theme.accentColor) ? theme.accentColor : null,
      borderColor: isValidHexColor(theme.borderColor) ? theme.borderColor : null,
      textColor: isValidHexColor(theme.textColor) ? theme.textColor : null,
    },
    display: {
      preferredFont: isValidFontFamily(display.preferredFont) ? display.preferredFont : null,
    },
    locale: {
      language: isValidLanguageTag(locale.language) ? locale.language : null,
      timezone: isValidTimezone(locale.timezone) ? locale.timezone : null,
    },
  };
}

/**
 * Serialize a settings payload back to JSON body form. The output is
 * stable (no unknown keys carried through) so saves never reintroduce
 * invalid or forward-compat data into a round-trip.
 */
export function serializeSettingsPayload(p: SystemSettingsPayload): string {
  return JSON.stringify(p, null, 2);
}
