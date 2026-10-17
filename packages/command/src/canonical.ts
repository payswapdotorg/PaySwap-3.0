/**
 * @payswap/command — canonical JSON serialization and strict-UTC timestamp
 * DATA parsing (P7-W3).
 *
 * Canonicalization is the deterministic serialization contract used for
 * hashing and signing wire objects (request hashes, approval artifacts,
 * webhook payloads, session-token material). PORTED verbatim in semantics
 * from the old repository's @payswap/interfaces canonical-json.ts:
 *
 * - object keys are sorted by UTF-16 code-unit order (ascending);
 * - no insignificant whitespace;
 * - `undefined`-valued object keys are dropped;
 * - `undefined` array entries serialize as null (JSON compatibility);
 * - non-finite numbers, bigint, symbols and functions are rejected;
 * - strings use standard JSON escaping.
 *
 * `canonicalSafe` adapts the old API handler's bigint-safe transform
 * (bigints become decimal strings, structure preserved) so envelope-shaped
 * values carrying TimestampMs DATA remain hashable.
 *
 * `parseStrictIsoUtc` is the strict ISO-8601 UTC calendar parser
 * (civil-calendar integer math, no JS Date): wire timestamps carried as
 * ISO strings are DATA and are validated, never read from an ambient clock.
 */

import { ValidationError } from './errors.ts';

/** Canonical JSON serialization (sorted keys, no whitespace; see module doc). */
export function canonicalJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  const type = typeof value;
  if (type === 'string' || type === 'boolean') {
    return JSON.stringify(value);
  }
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new ValidationError('canonical JSON: non-finite numbers are not allowed');
    }
    return JSON.stringify(value);
  }
  if (type === 'bigint') {
    throw new ValidationError('canonical JSON: bigint is not allowed; encode as a decimal string');
  }
  if (type === 'undefined') {
    throw new ValidationError('canonical JSON: top-level undefined is not representable');
  }
  if (type !== 'object') {
    throw new ValidationError(`canonical JSON: unsupported value of type ${type}`);
  }
  if (Array.isArray(value)) {
    const items = value.map((element) => (element === undefined ? 'null' : canonicalJson(element)));
    return `[${items.join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const body = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',');
  return `{${body}}`;
}

/**
 * Bigint-safe canonicalization for hashing envelope-shaped values: bigints
 * become decimal strings, arrays and objects are transformed
 * structure-preservingly, `undefined` object entries are dropped. Pure and
 * deterministic.
 */
export function canonicalSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((element) => canonicalSafe(element));
  }
  if (typeof value === 'object' && value !== null) {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) {
        output[key] = canonicalSafe(entry);
      }
    }
    return output;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Strict ISO-8601 UTC parsing (civil-calendar integer math — no JS Date)
// ---------------------------------------------------------------------------

const STRICT_ISO_UTC_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

/** Parsed strict ISO-8601 UTC timestamp (validated civil-calendar DATA). */
export interface StrictUtcTimestamp {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/**
 * Parse a strict ISO-8601 UTC instant (`YYYY-MM-DDTHH:MM:SSZ`, exactly) as
 * DATA: calendar-validated with integer math, no JS Date, no ambient clock.
 * Throws ValidationError on any other shape.
 */
export function parseStrictIsoUtc(value: unknown, subject: string): StrictUtcTimestamp {
  if (typeof value !== 'string') {
    throw new ValidationError(`${subject} must be a strict ISO-8601 UTC string (YYYY-MM-DDTHH:MM:SSZ)`, { subject });
  }
  const match = STRICT_ISO_UTC_PATTERN.exec(value);
  if (match === null) {
    throw new ValidationError(`${subject} must be a strict ISO-8601 UTC string (YYYY-MM-DDTHH:MM:SSZ)`, {
      subject,
      value,
    });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12) {
    throw new ValidationError(`${subject} month is out of range`, { subject, value });
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new ValidationError(`${subject} day is out of range for the month`, { subject, value });
  }
  if (hour > 23 || minute > 59 || second > 59) {
    throw new ValidationError(`${subject} time-of-day is out of range`, { subject, value });
  }
  return Object.freeze({ year, month, day, hour, minute, second });
}

/**
 * Convert a strict ISO-8601 UTC string to epoch milliseconds (bigint DATA)
 * using pure civil-calendar arithmetic. Round-trips with
 * {@link strictIsoUtcFromMs} for the supported range.
 */
export function strictIsoUtcToMs(value: unknown, subject: string): bigint {
  const parsed = parseStrictIsoUtc(value, subject);
  // Days since 1970-01-01 (Howard Hinnant's civil-from-days, inverted).
  const y = parsed.month <= 2 ? parsed.year - 1 : parsed.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (parsed.month + (parsed.month > 2 ? -3 : 9)) + 2) / 5) + parsed.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const days = era * 146097 + doe - 719468;
  const seconds = days * 86400 + parsed.hour * 3600 + parsed.minute * 60 + parsed.second;
  return BigInt(seconds) * 1000n;
}

/** Render epoch milliseconds (bigint DATA) as a strict ISO-8601 UTC string. */
export function strictIsoUtcFromMs(ms: bigint): string {
  if (ms < 0n) {
    throw new ValidationError('strictIsoUtcFromMs does not render pre-1970 instants', { ms: ms.toString() });
  }
  const totalSeconds = Number(ms / 1000n);
  const days = Math.floor(totalSeconds / 86400);
  const secondsOfDay = totalSeconds % 86400;
  // civil_from_days (Howard Hinnant).
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  const year = y + (m <= 2 ? 1 : 0);
  const hour = Math.floor(secondsOfDay / 3600);
  const minute = Math.floor((secondsOfDay % 3600) / 60);
  const second = secondsOfDay % 60;
  const pad = (n: number, width: number): string => String(n).padStart(width, '0');
  return `${pad(year, 4)}-${pad(m, 2)}-${pad(d, 2)}T${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}Z`;
}
