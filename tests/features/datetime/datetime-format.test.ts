import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatShortDate,
  formatShortDateTime,
  formatISO8601,
} from '@features/datetime/datetime-format';

// Fixed date: 2026-04-09 Thu 14:05:09 (local time)
// We construct a known Date to make tests deterministic.

function makeDate(year: number, month: number, day: number, h: number, m: number, s: number): Date {
  return new Date(year, month - 1, day, h, m, s);
}

const THU = makeDate(2026, 4, 9, 14, 5, 9);   // Thursday
const SUN = makeDate(2026, 1, 4, 0, 0, 0);    // Sunday
const SAT = makeDate(2025, 12, 27, 23, 59, 59); // Saturday

/** Derive expected localized day abbreviation using the same Intl API. */
function expectedDay(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);
}

describe('formatDate', () => {
  it('formats yyyy/MM/dd', () => {
    expect(formatDate(THU)).toBe('2026/04/09');
  });

  it('pads single-digit month and day', () => {
    expect(formatDate(SUN)).toBe('2026/01/04');
  });
});

describe('formatTime', () => {
  it('formats HH:mm:ss', () => {
    expect(formatTime(THU)).toBe('14:05:09');
  });

  it('formats midnight', () => {
    expect(formatTime(SUN)).toBe('00:00:00');
  });

  it('formats 23:59:59', () => {
    expect(formatTime(SAT)).toBe('23:59:59');
  });
});

describe('formatDateTime', () => {
  it('formats yyyy/MM/dd HH:mm:ss', () => {
    expect(formatDateTime(THU)).toBe('2026/04/09 14:05:09');
  });
});

describe('formatShortDate', () => {
  it('formats yy/MM/dd with locale day abbreviation', () => {
    expect(formatShortDate(THU)).toBe(`26/04/09 ${expectedDay(THU)}`);
  });

  it('uses locale day for Sunday', () => {
    expect(formatShortDate(SUN)).toBe(`26/01/04 ${expectedDay(SUN)}`);
  });

  it('uses locale day for Saturday', () => {
    expect(formatShortDate(SAT)).toBe(`25/12/27 ${expectedDay(SAT)}`);
  });

  it('all 7 days produce non-empty abbreviations', () => {
    for (let i = 0; i < 7; i++) {
      const d = makeDate(2026, 4, 5 + i, 0, 0, 0); // 2026-04-05 is Sunday
      const result = formatShortDate(d);
      // Should end with a non-empty day abbreviation after the date part
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{2} .+$/);
    }
  });
});

describe('formatShortDateTime', () => {
  it('formats yy/MM/dd with locale day + HH:mm:ss', () => {
    expect(formatShortDateTime(THU)).toBe(`26/04/09 ${expectedDay(THU)} 14:05:09`);
  });
});

describe('formatISO8601', () => {
  it('includes T separator and timezone offset', () => {
    const result = formatISO8601(THU);
    // Should start with date-time part
    expect(result).toMatch(/^2026-04-09T14:05:09[+-]\d{2}:\d{2}$/);
  });

  it('uses local timezone offset', () => {
    const result = formatISO8601(THU);
    // Verify offset format
    const offsetPart = result.slice(19);
    expect(offsetPart).toMatch(/^[+-]\d{2}:\d{2}$/);
  });

  it('midnight date formats correctly', () => {
    const result = formatISO8601(SUN);
    expect(result).toMatch(/^2026-01-04T00:00:00[+-]\d{2}:\d{2}$/);
  });
});
