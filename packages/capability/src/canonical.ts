/**
 * @payswap/capability — internal canonical-order helpers (P2-W1).
 *
 * NOT exported from the package index (deliberately — same policy as the
 * trust lane's minor-units helpers): these are law-enforcement internals
 * over wire shapes THIS package already validates structurally.
 *
 * Determinism law: no ambient clock, no randomness, no filesystem. Timestamp
 * comparisons operate on STRICT ISO-8601 UTC strings carried as DATA
 * (observation records declare their own timestamps; evaluation receives an
 * explicit asOf). The parser below is total and deterministic.
 */

import { ValidationError } from './errors.ts';

/**
 * Strict ISO-8601 UTC timestamp: YYYY-MM-DDTHH:MM:SS(.fff)?Z — the only
 * timestamp form accepted by this package. Fixed width except optional
 * milliseconds, so parsing is unambiguous and comparison is exact.
 */
const ISO_UTC_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?Z$/;

/** Comparable decomposition of a strict ISO-8601 UTC timestamp. */
export interface CanonicalTimestamp {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  /** Milliseconds 0..999 (fractional digits beyond ms are truncated). */
  readonly millisecond: number;
  /** Day of week, 0=Sunday .. 6=Saturday (deterministic civil computation). */
  readonly dayOfWeek: number;
  /** Time-of-day as 'HH:MM' UTC (comparable with cutoff times). */
  readonly timeOfDayUtc: string;
}

/**
 * Parse a strict ISO-8601 UTC timestamp (as DATA — the ambient JS clock is
 * never consulted).
 * Throws ValidationError on any non-conforming string, including non-UTC
 * offsets (force the writer to normalize; ambiguity is never smoothed over).
 */
export function parseIsoUtcTimestamp(value: string, subject: string): CanonicalTimestamp {
  if (typeof value !== 'string') {
    throw new ValidationError(`${subject} must be a strict ISO-8601 UTC string`, {
      subject,
      value,
    });
  }
  const match = ISO_UTC_PATTERN.exec(value);
  if (match === null) {
    throw new ValidationError(
      `${subject} must be a strict ISO-8601 UTC timestamp matching YYYY-MM-DDTHH:MM:SS(.fff)?Z exactly (UTC 'Z' suffix required)`,
      { subject, value },
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? '';
  const millisecond = fraction === '' ? 0 : Math.trunc(Number(fraction.slice(1)) * 1000);
  // Calendar-range enforcement (deterministic; no Date object involved).
  if (month < 1 || month > 12) {
    throw new ValidationError(`${subject} month is out of range`, { subject, value });
  }
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > (daysInMonth[month - 1] ?? 31)) {
    throw new ValidationError(`${subject} day is out of range`, { subject, value });
  }
  if (hour > 23 || minute > 59 || second > 59) {
    throw new ValidationError(`${subject} time is out of range`, { subject, value });
  }
  const days = daysSinceEpoch({ year, month, day, hour, minute, second, millisecond: 0, dayOfWeek: 0, timeOfDayUtc: '' });
  const dayOfWeek = ((days % 7) + 11) % 7; // 1970-01-01 was a Thursday (4); ((days+4) mod 7) with non-negative result
  const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    dayOfWeek,
    timeOfDayUtc: `${pad2(hour)}:${pad2(minute)}`,
  };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Total order over canonical timestamps (negative => a < b). */
export function compareCanonicalTimestamps(
  a: CanonicalTimestamp,
  b: CanonicalTimestamp,
): number {
  const fields: readonly (keyof CanonicalTimestamp)[] = [
    'year',
    'month',
    'day',
    'hour',
    'minute',
    'second',
    'millisecond',
  ];
  for (const field of fields) {
    const left = a[field];
    const right = b[field];
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
  }
  return 0;
}

/** Seconds between two canonical timestamps (a - b), truncated to integer. */
export function secondsBetween(a: CanonicalTimestamp, b: CanonicalTimestamp): number {
  // Day-count via cumulative month days; fully deterministic integer math.
  const daysA = daysSinceEpoch(a);
  const daysB = daysSinceEpoch(b);
  const secondsA = daysA * 86400 + a.hour * 3600 + a.minute * 60 + a.second;
  const secondsB = daysB * 86400 + b.hour * 3600 + b.minute * 60 + b.second;
  return secondsA - secondsB;
}

function daysSinceEpoch(t: CanonicalTimestamp): number {
  // Civil-days algorithm (Howard Hinnant's days_from_civil), exact integers.
  const y = t.month <= 2 ? t.year - 1 : t.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (t.month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + t.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Canonical minor-unit ordering (length + lexicographic over the validated
 * /^(0|[1-9][0-9]*)$/ string). This is STRUCTURAL comparison, not money
 * arithmetic: no Money type, no add/scale, no currency semantics (callers
 * enforce currency equality before comparing). Mirrors the trust lane's
 * internal D-2 discipline.
 */
export function compareMinorUnitStrings(a: string, b: string): number {
  if (a.length !== b.length) {
    return a.length < b.length ? -1 : 1;
  }
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
