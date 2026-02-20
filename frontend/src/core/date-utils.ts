// Utility functions for date and time formatting.

/** Zero-pads number `m` to `n` digits. */
export function dgt(m: number, n: number): string {
  const longstr = '0000' + m;
  return longstr.substring(longstr.length - n);
}

/**
 * Formats a Date object as "YYYY/MM/DD".
 * If a string is given, returns it as-is (already formatted).
 */
export function dateFormat(date: Date | string): string {
  if (typeof date === 'string') return date;
  return [date.getFullYear(), dgt(date.getMonth() + 1, 2), dgt(date.getDate(), 2)].join('/');
}

/**
 * Formats a Date object or time string as "HH:MM" (seconds omitted).
 */
export function timeFormat(date: Date | string): string {
  if (typeof date === 'string') return date.replace(/(\d\d:\d\d):\d\d/, '$1');
  return [dgt(date.getHours(), 2), dgt(date.getMinutes(), 2)].join(':');
}

/**
 * Strips the year prefix ("YYYY/") from a date string.
 * e.g. "2025/03/15" → "03/15"
 */
export function dateOnly(dateStr: string): string {
  return dateStr.replace(/^\d{4}\//, '');
}
