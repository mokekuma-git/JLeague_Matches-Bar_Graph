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

/**
 * Returns the UTC offset (in ms) of `timeZone` at the given instant, such that
 * wall-clock = UTC + offset. East of UTC is positive, west is negative.
 *
 * Derived via Intl.DateTimeFormat: render the instant as wall-clock fields in
 * `timeZone`, reinterpret those fields as if they were UTC, and subtract the
 * real instant. Because the offset is measured at the instant, DST is handled.
 */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) parts[part.type] = part.value;
  // Some engines emit "24" for midnight; normalize to "00".
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(hour), Number(parts.minute), Number(parts.second),
  );
  return asIfUtc - instant.getTime();
}

/**
 * Interprets a wall-clock date/time in a source IANA timezone and returns the
 * corresponding UTC instant.
 *
 * JS has no direct "wall-clock + zone → instant" API, so we treat the wall time
 * as if it were UTC, measure that zone's offset at that approximate instant, and
 * correct for it. The offset is resolved for the specific date (DST-aware).
 *
 * @param dateStr - "YYYY/MM/DD" or "YYYY-MM-DD"
 * @param timeStr - "HH:MM" (optionally with seconds)
 * @param sourceTz - IANA timezone name, e.g. "America/Mexico_City"
 */
export function zonedWallToUtc(dateStr: string, timeStr: string, sourceTz: string): Date {
  const datePart = dateStr.replace(/\//g, '-');
  const timePart = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const naiveUtc = new Date(`${datePart}T${timePart}Z`);
  const offsetMs = tzOffsetMs(naiveUtc, sourceTz);
  return new Date(naiveUtc.getTime() - offsetMs);
}

/**
 * Formats a UTC instant for display in a target IANA timezone.
 * When `targetTz` is undefined, the runtime's default zone is used.
 * Returns date "YYYY/MM/DD" and time "HH:MM" (24-hour) as rendered in that zone.
 */
export function formatInTimeZone(
  date: Date,
  targetTz?: string,
): { date: string; time: string } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    ...(targetTz ? { timeZone: targetTz } : {}),
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) parts[part.type] = part.value;
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    date: `${parts.year}/${parts.month}/${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
}
