# i18n Requirements (FI-Settings v2)

## Current State (2026-04-18)

### Implemented

- **Locale setting** (`settings.locale.language`): persisted in `__settings__`
  - Affects `Intl.DateTimeFormat` locale parameter for date formatting
  - Affects `toLocaleDateString` in todo date display
  - Sets `<html lang>` attribute for accessibility
  - Available values: System (browser default), ja, en, en-US, zh-Hant-TW, ko

- **Timezone setting** (`settings.locale.timezone`): persisted in `__settings__`
  - Affects `Intl.DateTimeFormat` `timeZone` option
  - Used by textlog timestamp display and date input shortcuts
  - Available values: System (browser default), Asia/Tokyo, UTC, America/New_York, America/Los_Angeles, Europe/London

### Not Implemented

- **UI string translation**: all UI labels, buttons, menu items, and help text
  remain hardcoded in English (with some Japanese in Quick Help).
  No translation dictionary or string table exists.

- **RTL layout**: no right-to-left text direction support.

- **Number formatting**: no locale-aware number formatting.

- **Locale-aware sorting**: entry title sort uses default `localeCompare`
  without explicit locale parameter.

## Requirements for Full i18n

### Priority 1 — String Table

1. Create a string table module (`src/features/i18n/strings.ts`) with a
   `t(key)` lookup function.
2. Default language: Japanese (matches shipped `<html lang="ja">`).
3. Second language: English.
4. String keys should be hierarchical: `menu.theme`, `menu.scanline`, etc.
5. Renderer and action-binder must use `t()` for all user-visible text.

### Priority 2 — Formatter Locale Threading

1. All `Intl.DateTimeFormat` / `toLocaleDateString` / `toLocaleString` calls
   must pass `settings.locale.language` as the locale parameter.
2. All date/time formatters must pass `settings.locale.timezone` as the
   `timeZone` option where applicable.
3. Entry-window (pop-out) and rendered-viewer must inherit locale/timezone
   from the parent state.

### Priority 3 — RTL and Number Formatting

1. Detect RTL languages and apply `dir="rtl"` to `<html>`.
2. Use `Intl.NumberFormat` for locale-aware number display.

## Architecture Notes

- String table belongs in `features/` layer (pure, no DOM).
- Renderer reads from the string table; no hardcoded strings in `renderer.ts`.
- The `format-context.ts` module in `adapter/ui/` provides runtime
  locale/timezone to formatters without threading through every function
  signature.
