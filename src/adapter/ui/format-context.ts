/**
 * Format context: runtime locale/timezone for Intl formatters.
 *
 * Set by renderer at the start of each render cycle from
 * `state.settings.locale`. Read by presenters and formatters
 * that need locale/timezone without threading it through every
 * function signature.
 *
 * Defaults to undefined (= browser default) until the first render.
 */

let currentLocale: string | undefined;
let currentTimeZone: string | undefined;

export function setFormatContext(locale: string | null | undefined, timeZone: string | null | undefined): void {
  currentLocale = locale ?? undefined;
  currentTimeZone = timeZone ?? undefined;
}

export function getFormatLocale(): string | undefined {
  return currentLocale;
}

export function getFormatTimeZone(): string | undefined {
  return currentTimeZone;
}
