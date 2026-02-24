import { describe, test, expect } from 'vitest';
import { dateFormat, timeFormat, dateOnly } from '../../core/date-utils';

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
