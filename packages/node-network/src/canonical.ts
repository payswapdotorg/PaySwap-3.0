/**
 * @payswap/node-network — the digest backbone and fail-closed validation
 * helpers (P27-D, ADR-0020; the ADR-0009 D4 digest discipline).
 *
 * LOCAL re-declaration of the route-compiler/route-planning canonical
 * flavor (the leaf-in-flight law: zero sibling imports). ONE digest flavor
 * for this package: the value-form canonicalization — recursively
 * key-sorted JSON text with bigint rendered `b:<decimal>` and number
 * rendered `n:<decimal>` — hashed with FNV-1a 64 and namespaced
 * `fnv1a64:<16-hex>`. Digests are deterministic binding, NEVER security
 * (offer/enrollment authenticity is Ed25519 in offer.ts/attestation.ts).
 *
 * Determinism law: no ambient clock, no randomness, no filesystem, no
 * network, no float parsing. Caller-supplied instants everywhere. Same
 * input -> same output, always.
 */

import { NodeNetworkValidationError } from "./errors.ts";

/** Shared reference-shaped string bounds (bounded, never unbounded). */
export const LIMITS = Object.freeze({
  refMaxLength: 256,
  descriptionMaxLength: 2048,
  maxRouteHops: 8,
  maxSagaLegs: 8,
  maxOfferPurposeEntries: 16,
  maxInstanceBindings: 8,
  maxDisclosureFields: 24,
} as const);

/** True iff the value is a non-null, non-array object record. */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True iff the value is a non-empty string. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** True iff the value is a non-empty array of strings. */
export function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.length > 0 && value.every((item) => isNonEmptyString(item))
  );
}

/** Require an object record (fail closed with the subject's name). */
export function requireObject(
  candidate: unknown,
  subject: string,
): Readonly<Record<string, unknown>> {
  if (!isRecord(candidate)) {
    throw new NodeNetworkValidationError(`${subject} must be an object`);
  }
  return candidate;
}

/** Require a bounded non-empty string. */
export function requireBoundedString(value: unknown, subject: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new NodeNetworkValidationError(`${subject} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new NodeNetworkValidationError(`${subject} must be at most ${maxLength} characters`);
  }
  return value;
}

/** Require a three-letter uppercase currency code. */
export function requireCurrencyCode(value: unknown, subject: string): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
    throw new NodeNetworkValidationError(
      `${subject} must be a three-letter uppercase currency code`,
    );
  }
  return value;
}

/** Require a two-letter uppercase ISO-3166-1 alpha-2 country code. */
export function requireCountryCode(value: unknown, subject: string): string {
  if (typeof value !== "string" || !/^[A-Z]{2}$/.test(value)) {
    throw new NodeNetworkValidationError(
      `${subject} must be a two-letter uppercase ISO-3166 country code`,
    );
  }
  return value;
}

/** Require a non-negative safe integer (ms instants, counts, versions). */
export function requireNonNegativeSafeInteger(value: unknown, subject: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new NodeNetworkValidationError(`${subject} must be a non-negative integer`);
  }
  return value;
}

/** Require a positive safe integer (budgets, versions, windows). */
export function requirePositiveSafeInteger(value: unknown, subject: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new NodeNetworkValidationError(`${subject} must be a positive integer`);
  }
  return value;
}

/** Require a canonical positive decimal integer string (amounts). */
export function requirePositiveIntegerString(value: unknown, subject: string): string {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new NodeNetworkValidationError(
      `${subject} must be a canonical positive integer string`,
    );
  }
  return value;
}

/** Require a canonical non-negative decimal integer string. */
export function requireIntegerString(value: unknown, subject: string): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new NodeNetworkValidationError(
      `${subject} must be a canonical non-negative integer string`,
    );
  }
  return value;
}

/** Require the EXACT closed key set (unknown fields rejected, never dropped). */
export function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  subject: string,
): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new NodeNetworkValidationError(
      `${subject} must carry exactly the keys [${expected.join(", ")}] — unknown or missing fields are rejected`,
    );
  }
}

/**
 * Recursively freeze a wire value (idempotent; the immutability law).
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
 * Canonical, sort-stable JSON text (bigint-aware) — byte-identical in
 * DISCIPLINE to the route-compiler/route-planning flavor (objects
 * serialize with recursively sorted keys; bigints as `b:<decimal>`;
 * numbers as `n:<decimal>`; strings via JSON.stringify; functions,
 * symbols, undefined and non-finite numbers rejected).
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
        throw new NodeNetworkValidationError("canonical JSON rejects non-finite numbers");
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
      throw new NodeNetworkValidationError(
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
 * Content digest over the canonical JSON projection: `fnv1a64:<16 hex>`
 * (the one digest flavor of this package).
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

const ISO_UTC_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?Z$/;

/**
 * True iff the value is a STRICT ISO-8601 UTC timestamp of the shape
 * YYYY-MM-DDTHH:MM:SS(.fff)?Z (shape check only — freshness stamps are
 * DATA, never clock reads).
 */
export function isStrictIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || ISO_UTC_PATTERN.exec(value) === null) {
    return false;
  }
  return true;
}

/** Require a strict ISO-8601 UTC timestamp (fail closed). */
export function requireIsoUtcTimestamp(value: unknown, subject: string): string {
  if (!isStrictIsoUtcTimestamp(value)) {
    throw new NodeNetworkValidationError(
      `${subject} must be a strict ISO-8601 UTC string (YYYY-MM-DDTHH:MM:SS(.fff)?Z)`,
    );
  }
  return value;
}
