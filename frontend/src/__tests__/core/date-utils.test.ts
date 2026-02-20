import { describe, test, expect } from 'vitest';
import { dgt, dateFormat, timeFormat, dateOnly } from '../../core/date-utils';

describe('dgt', () => {
  test('pads single digit to 2 places', () => {
    expect(dgt(5, 2)).toBe('05');
    expect(dgt(0, 2)).toBe('00');
    expect(dgt(9, 2)).toBe('09');
  });

  test('no padding needed', () => {
    expect(dgt(12, 2)).toBe('12');
    expect(dgt(31, 2)).toBe('31');
  });

  test('pads to 4 places', () => {
    expect(dgt(25, 4)).toBe('0025');
    expect(dgt(2025, 4)).toBe('2025');
  });
});

describe('dateFormat', () => {
  test('formats a Date object as YYYY/MM/DD', () => {
    // Use UTC offset-safe construction: new Date(year, month-1, day)
    const d = new Date(2025, 2, 15); // March 15, 2025
    expect(dateFormat(d)).toBe('2025/03/15');
  });

  test('pads single-digit month and day', () => {
    const d = new Date(2025, 0, 5); // January 5, 2025
    expect(dateFormat(d)).toBe('2025/01/05');
  });

  test('passes a string through unchanged', () => {
    expect(dateFormat('2025/03/15')).toBe('2025/03/15');
    expect(dateFormat('already-formatted')).toBe('already-formatted');
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
