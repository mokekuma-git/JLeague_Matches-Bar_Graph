import { describe, test, expect } from 'vitest';
import {
  dateFormat,
  timeFormat,
  dateOnly,
  zonedWallToUtc,
  formatInTimeZone,
} from '../../core/date-utils';

describe('dateFormat', () => {
  test('formats a Date object as YYYY/MM/DD by default', () => {
    const d = new Date(2025, 2, 15); // March 15, 2025
    expect(dateFormat(d)).toBe('2025/03/15');
  });

  test('pads single-digit month and day', () => {
    const d = new Date(2025, 0, 5); // January 5, 2025
    expect(dateFormat(d)).toBe('2025/01/05');
  });

  test('formats with hyphen separator for HTML date input', () => {
    const d = new Date(2025, 2, 15);
    expect(dateFormat(d, '-')).toBe('2025-03-15');
  });

  test('passes a string through unchanged regardless of separator', () => {
    expect(dateFormat('2025/03/15')).toBe('2025/03/15');
    expect(dateFormat('already-formatted', '-')).toBe('already-formatted');
  });
});

describe('timeFormat', () => {
  test('formats a Date object as HH:MM', () => {
    const d = new Date(2025, 0, 1, 14, 5, 30); // 14:05:30
    expect(timeFormat(d)).toBe('14:05');
  });

  test('strips seconds from a time string', () => {
    expect(timeFormat('15:00:00')).toBe('15:00');
    expect(timeFormat('09:30:45')).toBe('09:30');
  });

  test('passes a string with no seconds through unchanged', () => {
    expect(timeFormat('15:00')).toBe('15:00');
  });
});

describe('dateOnly', () => {
  test('strips the year prefix', () => {
    expect(dateOnly('2025/03/15')).toBe('03/15');
    expect(dateOnly('1993/01/01')).toBe('01/01');
  });

  test('returns the string unchanged if no year prefix', () => {
    expect(dateOnly('03/15')).toBe('03/15');
  });
});

describe('zonedWallToUtc', () => {
  test('Mexico City 13:00 (UTC-6, no DST) → 19:00 UTC', () => {
    const utc = zonedWallToUtc('2026/06/11', '13:00', 'America/Mexico_City');
    expect(utc.toISOString()).toBe('2026-06-11T19:00:00.000Z');
  });

  test('New York 16:00 in June (EDT, UTC-4) → 20:00 UTC', () => {
    const utc = zonedWallToUtc('2026/06/15', '16:00', 'America/New_York');
    expect(utc.toISOString()).toBe('2026-06-15T20:00:00.000Z');
  });

  test('Chicago 15:00 in June (CDT, UTC-5) → 20:00 UTC', () => {
    const utc = zonedWallToUtc('2026/06/15', '15:00', 'America/Chicago');
    expect(utc.toISOString()).toBe('2026-06-15T20:00:00.000Z');
  });

  test('Los Angeles 12:00 in June (PDT, UTC-7) → 19:00 UTC', () => {
    const utc = zonedWallToUtc('2026/06/15', '12:00', 'America/Los_Angeles');
    expect(utc.toISOString()).toBe('2026-06-15T19:00:00.000Z');
  });

  test('accepts hyphen-separated dates and seconds in time', () => {
    const utc = zonedWallToUtc('2026-06-11', '13:00:00', 'America/Mexico_City');
    expect(utc.toISOString()).toBe('2026-06-11T19:00:00.000Z');
  });

  test('resolves DST: New York 12:00 in January is EST (UTC-5)', () => {
    const utc = zonedWallToUtc('2026/01/15', '12:00', 'America/New_York');
    expect(utc.toISOString()).toBe('2026-01-15T17:00:00.000Z');
  });

  test('Tokyo wall-clock (UTC+9, no DST) → UTC', () => {
    const utc = zonedWallToUtc('2026/06/11', '13:00', 'Asia/Tokyo');
    expect(utc.toISOString()).toBe('2026-06-11T04:00:00.000Z');
  });
});

describe('formatInTimeZone', () => {
  const mexicoCity13 = zonedWallToUtc('2026/06/11', '13:00', 'America/Mexico_City');

  test('renders a UTC instant in Tokyo (next-day rollover)', () => {
    expect(formatInTimeZone(mexicoCity13, 'Asia/Tokyo')).toEqual({
      date: '2026/06/12',
      time: '04:00',
    });
  });

  test('renders the same instant back in the source zone', () => {
    expect(formatInTimeZone(mexicoCity13, 'America/Mexico_City')).toEqual({
      date: '2026/06/11',
      time: '13:00',
    });
  });

  test('round-trips an EDT match wall-clock through UTC', () => {
    const ny = zonedWallToUtc('2026/06/15', '16:00', 'America/New_York');
    expect(formatInTimeZone(ny, 'America/New_York')).toEqual({
      date: '2026/06/15',
      time: '16:00',
    });
  });

  test('uses the runtime default zone when targetTz is omitted', () => {
    const defaultZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(formatInTimeZone(mexicoCity13)).toEqual(
      formatInTimeZone(mexicoCity13, defaultZone),
    );
  });
});
