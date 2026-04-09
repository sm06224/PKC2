/**
 * Date/Time format helpers for input-assistance shortcuts.
 *
 * Pure functions — no browser APIs.
 * All formatters accept an optional Date for testability (default: now).
 */

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/** yyyy/MM/dd */
export function formatDate(d: Date = new Date()): string {
  return `${pad4(d.getFullYear())}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

/** HH:mm:ss */
export function formatTime(d: Date = new Date()): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** yyyy/MM/dd HH:mm:ss */
export function formatDateTime(d: Date = new Date()): string {
  return `${formatDate(d)} ${formatTime(d)}`;
}

/** yy/MM/dd ddd */
export function formatShortDate(d: Date = new Date()): string {
  const yy = pad2(d.getFullYear() % 100);
  return `${yy}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${DAY_ABBR[d.getDay()]}`;
}

/** yy/MM/dd ddd HH:mm:ss */
export function formatShortDateTime(d: Date = new Date()): string {
  return `${formatShortDate(d)} ${formatTime(d)}`;
}

/** ISO 8601: yyyy-MM-ddTHH:mm:ss±HH:mm */
export function formatISO8601(d: Date = new Date()): string {
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const oh = pad2(Math.floor(absOffset / 60));
  const om = pad2(absOffset % 60);
  return `${pad4(d.getFullYear())}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${formatTime(d)}${sign}${oh}:${om}`;
}
