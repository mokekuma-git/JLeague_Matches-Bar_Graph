// Utility functions for date and time formatting.

/** Zero-pads a number to 2 digits. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Formats a Date as "YYYY/MM/DD" (default) or "YYYY-MM-DD" (sep='-').
 * If a string is given, returns it as-is (already formatted).
 */
export function dateFormat(date: Date | string, sep = '/'): string {
  if (typeof date === 'string') return date;
  return `${date.getFullYear()}${sep}${pad2(date.getMonth() + 1)}${sep}${pad2(date.getDate())}`;
}

/**
 * Formats a Date object or time string as "HH:MM" (seconds omitted).
 */
export function timeFormat(date: Date | string): string {
  if (typeof date === 'string') return date.replace(/(\d\d:\d\d):\d\d/, '$1');
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * Strips the year prefix ("YYYY/") from a date string.
 * e.g. "2025/03/15" → "03/15"
 */
export function dateOnly(dateStr: string): string {
  return dateStr.replace(/^\d{4}\//, '');
}
