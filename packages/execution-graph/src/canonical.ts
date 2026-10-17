/**
 * @payswap/execution-graph — canonicalization, digests and freezing (P3-W2).
 *
 * The deterministic backbone shared by every wire shape in this package:
 * - CANONICAL JSON: recursively key-sorted, bigint-aware, byte-stable text
 *   (the economic lane's digest law, re-declared locally because sibling
 *   imports here are TYPE-ONLY);
 * - FNV-1a 64 digests: deterministic content binding (binding, not security);
 * - deepFreeze: immutability of every recorded fact (INV-03);
 * - strict ISO-8601 UTC timestamp validation: timestamps are DATA declared
 *   by the writer — this module never reads a clock.
 *
 * Determinism law: no ambient clock, no randomness, no filesystem, no
 * network. Same input -> same output, always.
 */

import { ValidationError } from './errors.ts';

const ISO_UTC_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?Z$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Strict ISO-8601 UTC timestamp: YYYY-MM-DDTHH:MM:SS(.fff)?Z — the only
 * timestamp form accepted by this package (calendar ranges enforced
 * deterministically; no Date object involved). Throws ValidationError on
 * anything else, including non-UTC offsets.
 */
export function requireIsoUtcTimestamp(value: string, subject: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${subject} must be a strict ISO-8601 UTC string`);
  }
  const match = ISO_UTC_PATTERN.exec(value);
  if (match === null) {
    throw new ValidationError(
      `${subject} must match YYYY-MM-DDTHH:MM:SS(.fff)?Z exactly (UTC 'Z' suffix required)`,
      { subject, value },
    );
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
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maxDay = daysInMonth[month - 1] ?? 31;
  if (day < 1 || day > maxDay) {
    throw new ValidationError(`${subject} day is out of range`, { subject, value });
  }
  if (hour > 23 || minute > 59 || second > 59) {
    throw new ValidationError(`${subject} time is out of range`, { subject, value });
  }
  return value;
}

/** True iff the value is a strict ISO-8601 UTC timestamp (total predicate). */
export function isIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    requireIsoUtcTimestamp(value, 'timestamp');
    return true;
  } catch {
    return false;
  }
}

/**
 * Canonical, sort-stable JSON text (bigint-aware). Objects serialize with
 * recursively sorted keys; bigints serialize as `b:<decimal>`; numbers as
 * `n:<decimal>`; strings via JSON.stringify. Functions/symbols/undefined
 * are rejected — canonical text is total over wire data.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        throw new ValidationError('canonical JSON rejects non-finite numbers');
      }
      return `n:${value.toString()}`;
    case 'bigint':
      return `b:${value.toString()}`;
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJsonStringify(item)).join(',')}]`;
      }
      const record = value as Readonly<Record<string, unknown>>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        parts.push(`${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new ValidationError(
        `canonical JSON rejects values of type '${typeof value}'`,
      );
  }
}

const MASK64 = 0xffff_ffff_ffff_ffffn;
const FNV_OFFSET = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME = 0x100_0000_01b3n;

/** FNV-1a 64 digest over canonical text (deterministic binding, not security). */
export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index) & 0xff);
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Canonical digest of any wire-shaped value (sorted keys, bigint-aware). */
export function canonicalDigest(value: unknown): string {
  return fnv1a64(canonicalJsonStringify(value));
}

/** Deep-freeze a recorded fact (INV-03: historical facts are immutable). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    if (Object.isFrozen(value)) {
      return value;
    }
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** Deterministic equality of canonical digests over two values. */
export function canonicallyEqual(left: unknown, right: unknown): boolean {
  return canonicalJsonStringify(left) === canonicalJsonStringify(right);
}
