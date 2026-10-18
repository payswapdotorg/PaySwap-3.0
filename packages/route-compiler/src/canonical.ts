/**
 * @payswap/route-compiler — canonicalization, digests and freezing (P5-W1).
 *
 * The deterministic backbone shared by every wire shape in this package
 * (the execution-graph lane's digest law, re-declared locally because this
 * v1 intelligence-layer package allows ZERO sibling imports — even
 * TYPE-ONLY ones; the accepted leaf-in-flight pattern):
 * - CANONICAL JSON: recursively key-sorted, bigint-aware, byte-stable text;
 * - FNV-1a 64 digests: deterministic content binding (binding, not security);
 * - deepFreeze: immutability of every recorded fact (INV-03);
 * - strict ISO-8601 UTC timestamp validation lives in canonical-time.ts.
 *
 * Determinism law: no ambient clock, no randomness, no filesystem, no
 * network, no float parsing. Same input -> same output, always.
 */

import { ValidationError } from "./errors.ts";

/** Maximum lengths for reference-shaped strings (bounded, never unbounded). */
export const LIMITS = Object.freeze({
  refMaxLength: 256,
  descriptionMaxLength: 2048,
  maxRouteHops: 8,
  maxPlanLegs: 8,
  venueIdMaxLength: 64,
} as const);

/** A fail-closed factory: every require* helper throws through this. */
export type Fail = (message: string) => Error;

const fail: Fail = (message: string) => new ValidationError(message);

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const NON_EMPTY_PATTERN = /^.+$/s;

/** True iff the value is a non-null, non-array object record. */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True iff the value is a non-empty string. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && NON_EMPTY_PATTERN.test(value);
}

/** Require an object record (fail closed with the subject's name). */
export function requireObject(
  candidate: unknown,
  subject: string,
  on: Fail,
): Readonly<Record<string, unknown>> {
  if (!isRecord(candidate)) {
    throw on(`${subject} must be an object`);
  }
  return candidate;
}

/** Require a bounded non-empty string. */
export function requireBoundedString(
  value: unknown,
  subject: string,
  maxLength: number,
  on: Fail,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw on(`${subject} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw on(`${subject} must be at most ${maxLength} characters`);
  }
  return value;
}

/** Require a three-letter uppercase currency/symbol code. */
export function requireCurrencyCode(value: unknown, subject: string, on: Fail): string {
  if (typeof value !== "string" || !CURRENCY_CODE_PATTERN.test(value)) {
    throw on(`${subject} must be a three-letter uppercase currency code`);
  }
  return value;
}

/** Require a non-negative safe integer (ms instants, counts, versions of that shape). */
export function requireNonNegativeSafeInteger(value: unknown, subject: string, on: Fail): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw on(`${subject} must be a non-negative integer`);
  }
  return value;
}

/** Require a positive safe integer (expiry bounds, versions). */
export function requirePositiveSafeInteger(value: unknown, subject: string, on: Fail): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw on(`${subject} must be a positive integer`);
  }
  return value;
}

/** Require the EXACT closed key set (unknown fields rejected — never silently dropped). */
export function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  subject: string,
  on: Fail,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw on(
      `${subject} must carry exactly the keys [${expected.join(", ")}] — unknown or missing fields are rejected`,
    );
  }
}

/** Require a non-empty array of non-empty strings (the evidence law, INV-E02). */
export function requireNonEmptyStringArray(
  value: unknown,
  subject: string,
  on: Fail,
): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw on(`${subject} must be a non-empty array`);
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) {
      throw on(`${subject} entries must all be non-empty strings`);
    }
    items.push(item);
  }
  return Object.freeze(items);
}

/** Require a (possibly empty) array of non-empty strings. */
export function requireStringArray(
  value: unknown,
  subject: string,
  on: Fail,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw on(`${subject} must be an array`);
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0) {
      throw on(`${subject} entries must all be non-empty strings`);
    }
    items.push(item);
  }
  return Object.freeze(items);
}

/**
 * Recursively freeze a wire value (idempotent; INV-03 immutability law).
 * Arrays and plain objects are frozen in depth; primitives pass through.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/**
 * Canonical, sort-stable JSON text (bigint-aware). Objects serialize with
 * recursively sorted keys; bigints serialize as `b:<decimal>`; numbers as
 * `n:<decimal>`; strings via JSON.stringify. Functions/symbols/undefined
 * are rejected — canonical text is total over wire data.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new ValidationError("canonical JSON rejects non-finite numbers");
      }
      return `n:${value.toString()}`;
    case "bigint":
      return `b:${value.toString()}`;
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJsonStringify(item)).join(",")}]`;
      }
      const record = value as Readonly<Record<string, unknown>>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        parts.push(`${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`);
      }
      return `{${parts.join(",")}}`;
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

/** FNV-1a 64 digest over text (deterministic binding, not security). */
export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index) & 0xff);
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Content digest over the canonical JSON projection: `fnv1a64:<16 hex>`.
 * Binding-never-security tamper evidence, re-derived at validation.
 */
export function contentDigest(value: unknown): string {
  return `fnv1a64:${fnv1a64(canonicalJsonStringify(value))}`;
}

/** Deterministic sort by a string key (stable, total; the input order law). */
export function sortedBy<T>(items: readonly T[], keyOf: (item: T) => string): readonly T[] {
  return [...items].sort((left, right) => {
    const leftKey = keyOf(left);
    const rightKey = keyOf(right);
    if (leftKey < rightKey) {
      return -1;
    }
    if (leftKey > rightKey) {
      return 1;
    }
    return 0;
  });
}

/** Deterministic sort by a numeric key (stable, total). */
export function sortedByNumber<T>(
  items: readonly T[],
  keyOf: (item: T) => number,
): readonly T[] {
  return [...items].sort((left, right) => keyOf(left) - keyOf(right));
}

/** Deduplicate string arrays order-preserving (canonical input ordering). */
export function dedupeStrings(items: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return Object.freeze(result);
}

/** The shared structural require helpers under this module's fail factory. */
export const structural = {
  object: (candidate: unknown, subject: string) => requireObject(candidate, subject, fail),
  boundedString: (value: unknown, subject: string, maxLength: number) =>
    requireBoundedString(value, subject, maxLength, fail),
  currencyCode: (value: unknown, subject: string) => requireCurrencyCode(value, subject, fail),
  nonNegativeSafeInteger: (value: unknown, subject: string) =>
    requireNonNegativeSafeInteger(value, subject, fail),
  positiveSafeInteger: (value: unknown, subject: string) =>
    requirePositiveSafeInteger(value, subject, fail),
} as const;
