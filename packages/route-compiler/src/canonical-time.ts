/**
 * @payswap/route-compiler — canonical time: PURE civil arithmetic over
 * strict ISO-8601 UTC timestamps (P5-W1; NET-NEW vs the old repo, which
 * leaned on the platform Date parser inside freshness probes).
 *
 * THE LAW: timestamps are DATA. This module never constructs a Date, never
 * reads a clock, never consults a timezone database — every conversion
 * between a strict ISO string and epoch milliseconds is performed by pure
 * civil-calendar arithmetic (proleptic Gregorian, UTC only):
 *
 * - `parseIsoUtc` decomposes a STRICT `YYYY-MM-DDTHH:MM:SS(.fff)?Z` string
 *   into components with full calendar-range validation (month 1..12, day
 *   1..days-in-month including the leap-year rule, hour 0..23, minute and
 *   second 0..59; no offsets, no 'z' lowercase, no date-time separators);
 * - `epochMillisFromIso` converts components to epoch milliseconds by the
 *   days-from-civil algorithm (Howard Hinnant's) — the same integer math
 *   the platform uses, performed here in plain arithmetic so no ambient
 *   parser can ever be consulted;
 * - `compareIsoUtc` orders two strict timestamps component-wise;
 * - `millisecondsBetween` is the civil difference (b - a) in epoch ms.
 *
 * Why pure arithmetic: the old `Date.parse` accepts non-strict forms
 * (offsets, space separators, lowercase z, even 'YYYY-MM-DD') and silently
 * normalizes them — a freshness probe on a leniently-parsed timestamp is
 * a hidden normalization channel. Rejecting everything except the strict
 * UTC form makes staleness law testable and replayable (determinism law).
 */

import { ValidationError } from "./errors.ts";

const ISO_UTC_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?Z$/;

/** The civil components of a strict ISO-8601 UTC instant. */
export interface IsoUtcComponents {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  /** 0..999 — trailing zero digits beyond milliseconds are rejected. */
  readonly millisecond: number;
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Leap-year rule of the proleptic Gregorian calendar (pure). */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in a civil month (pure; February follows the leap-year rule). */
export function daysInMonth(year: number, month: number): number {
  const monthDays = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const days = monthDays[month - 1];
  if (days === undefined) {
    throw new ValidationError(`month ${month} is out of the civil range 1..12`);
  }
  return days;
}

/** Decompose a strict ISO-8601 UTC string into civil components (fail closed). */
export function parseIsoUtc(value: string): IsoUtcComponents {
  const match = ISO_UTC_PATTERN.exec(value);
  if (match === null) {
    throw new ValidationError(
      `timestamp must match YYYY-MM-DDTHH:MM:SS(.fff)?Z exactly (UTC 'Z' suffix required)`,
      { value },
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? ".0";
  if (month < 1 || month > 12) {
    throw new ValidationError(`timestamp month is out of range`, { value });
  }
  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    throw new ValidationError(`timestamp day is out of range for the civil month`, { value });
  }
  if (hour > 23 || minute > 59 || second > 59) {
    throw new ValidationError(`timestamp time is out of range`, { value });
  }
  const millisecond = Number((fraction.slice(1) + "000").slice(0, 3));
  return { year, month, day, hour, minute, second, millisecond };
}

/** Require a strict ISO-8601 UTC string (validation form of parseIsoUtc). */
export function requireIsoUtcTimestamp(value: unknown, subject: string): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${subject} must be a strict ISO-8601 UTC string`);
  }
  parseIsoUtc(value);
  return value;
}

/** True iff the value is a strict ISO-8601 UTC timestamp (total predicate). */
export function isIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    parseIsoUtc(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Days from the civil epoch (1970-01-01) to the civil date — the pure
 * days-from-civil algorithm. Negative years are handled (proleptic).
 */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Strict ISO components to epoch milliseconds (pure civil arithmetic). */
export function epochMillisFromComponents(components: IsoUtcComponents): number {
  const days = daysFromCivil(components.year, components.month, components.day);
  return (
    days * MS_PER_DAY +
    components.hour * MS_PER_HOUR +
    components.minute * MS_PER_MINUTE +
    components.second * MS_PER_SECOND +
    components.millisecond
  );
}

/** Strict ISO string to epoch milliseconds (parse + civil arithmetic; no Date). */
export function epochMillisFromIso(value: string): number {
  return epochMillisFromComponents(parseIsoUtc(value));
}

/** Civil components from epoch milliseconds (the inverse; pure arithmetic, proleptic). */
export function componentsFromEpochMillis(epochMillis: number): IsoUtcComponents {
  if (typeof epochMillis !== "number" || !Number.isSafeInteger(epochMillis)) {
    throw new ValidationError("epoch milliseconds must be an integer");
  }
  const days = Math.floor(epochMillis / MS_PER_DAY);
  let remainder = epochMillis % MS_PER_DAY;
  if (remainder < 0) {
    remainder += MS_PER_DAY;
  }
  const hour = Math.floor(remainder / MS_PER_HOUR);
  remainder -= hour * MS_PER_HOUR;
  const minute = Math.floor(remainder / MS_PER_MINUTE);
  remainder -= minute * MS_PER_MINUTE;
  const second = Math.floor(remainder / MS_PER_SECOND);
  const millisecond = remainder - second * MS_PER_SECOND;
  // Civil-from-days (the inverse of daysFromCivil), pure integer math.
  let z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = month <= 2 ? y + 1 : y;
  z = 0;
  return { year, month, day, hour, minute, second, millisecond };
}

/** Render civil components as the strict ISO-8601 UTC string. */
export function isoUtcFromComponents(components: IsoUtcComponents): string {
  const { year, month, day, hour, minute, second, millisecond } = components;
  const dayMax = daysInMonth(year, month);
  if (month < 1 || month > 12 || day < 1 || day > dayMax || hour > 23 || minute > 59 || second > 59) {
    throw new ValidationError("civil components are out of range");
  }
  const pad = (value: number, width: number): string => value.toString().padStart(width, "0");
  const base = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}`;
  return millisecond === 0 ? `${base}Z` : `${base}.${pad(millisecond, 3)}Z`;
}

/** Strict ISO string from epoch milliseconds (civil inverse round-trip). */
export function isoUtcFromEpochMillis(epochMillis: number): string {
  return isoUtcFromComponents(componentsFromEpochMillis(epochMillis));
}

/** Order two strict ISO timestamps: -1, 0 or 1 (component-wise, pure). */
export function compareIsoUtc(left: string, right: string): -1 | 0 | 1 {
  const leftMs = epochMillisFromIso(left);
  const rightMs = epochMillisFromIso(right);
  if (leftMs < rightMs) {
    return -1;
  }
  if (leftMs > rightMs) {
    return 1;
  }
  return 0;
}

/** Civil difference (b - a) in epoch milliseconds (pure arithmetic). */
export function millisecondsBetween(left: string, right: string): number {
  return epochMillisFromIso(right) - epochMillisFromIso(left);
}

/** The epoch-origin strict instant (the zero of civil epoch arithmetic). */
export const ISO_EPOCH_ORIGIN = "1970-01-01T00:00:00Z" as const;
