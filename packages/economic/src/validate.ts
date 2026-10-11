/**
 * @payswap/economic — shared fail-closed validation helpers (P1-W1).
 *
 * Discipline ported from payswap.org@8a735bf packages/route-compiler/src/intent.ts
 * (requireNonEmptyString / requireCurrency / requireNonNegativeInteger and the
 * frozen-return law): validators never repair, never guess, never default;
 * they throw with a field-path message or return the validated value FROZEN.
 *
 * The old helpers were hard-bound to InvalidMoneyMovementIntentError; here
 * the helpers are parameterized by a `fail` error factory so EVERY module
 * throws its own canonical error class while sharing one law. Same input ->
 * same verdict, zero side effects, zero clock/network/filesystem access.
 */

/** Bounded-string limits (documented in spec/economic/ECONOMIC-MODEL.md). */
export const LIMITS = {
  refMaxLength: 512,
  objectiveMaxLength: 4096,
  nonGoalMaxLength: 512,
  descriptionMaxLength: 1024,
  policyStatementMaxLength: 2048,
  parameterValueMaxLength: 1024,
  contentMaxLength: 16384,
  maxOutcomes: 8,
  maxProofs: 16,
  maxNonGoals: 16,
  maxEconomicInputs: 16,
  maxParameters: 16,
  maxOccurrences: 64,
  maxRouteHops: 8,
} as const;

/** Error factory: each module passes its own canonical error class. */
export type Fail = (message: string) => Error;

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** Requires a non-null plain object (arrays are NOT objects here). */
export function requireObject(
  value: unknown,
  what: string,
  fail: Fail,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw fail(`${what} is required`);
  }
  return value as Readonly<Record<string, unknown>>;
}

/**
 * Fail-closed exact key-set law: the object carries EXACTLY the expected
 * fields (sorted comparison) — unknown fields are rejected, never ignored.
 */
export function requireExactKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  what: string,
  fail: Fail,
): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((k, i) => k !== wanted[i])) {
    throw fail(
      `${what} must carry exactly the fields [${wanted.join(", ")}] (got: [${actual.join(", ")}])`,
    );
  }
}

/** Non-empty string. */
export function requireNonEmptyString(value: unknown, field: string, fail: Fail): string {
  if (typeof value !== "string" || value.length === 0) {
    throw fail(`${field} must be a non-empty string`);
  }
  return value;
}

/** Non-empty bounded string. */
export function requireBoundedString(
  value: unknown,
  field: string,
  maxLength: number,
  fail: Fail,
): string {
  const text = requireNonEmptyString(value, field, fail);
  if (text.length > maxLength) {
    throw fail(`${field} must be at most ${maxLength} characters`);
  }
  return text;
}

/** Uppercase 3-letter currency/symbol code (the AmountSpec wire law). */
export function requireCurrencyCode(value: unknown, field: string, fail: Fail): string {
  const text = requireNonEmptyString(value, field, fail);
  if (!CURRENCY_PATTERN.test(text)) {
    throw fail(
      `${field} '${text}' must be an uppercase 3-letter currency/symbol code (the AmountSpec law)`,
    );
  }
  return text;
}

/** Any safe integer. */
export function requireSafeInteger(value: unknown, field: string, fail: Fail): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw fail(`${field} must be a safe integer (caller-supplied, no ambient clock)`);
  }
  return value;
}

/** Non-negative safe integer. */
export function requireNonNegativeSafeInteger(
  value: unknown,
  field: string,
  fail: Fail,
): number {
  const n = requireSafeInteger(value, field, fail);
  if (n < 0) {
    throw fail(`${field} must be a non-negative integer`);
  }
  return n;
}

/** Positive safe integer. */
export function requirePositiveSafeInteger(
  value: unknown,
  field: string,
  fail: Fail,
): number {
  const n = requireSafeInteger(value, field, fail);
  if (n <= 0) {
    throw fail(`${field} must be a positive integer`);
  }
  return n;
}

/** Strict boolean (no truthy coercion). */
export function requireBoolean(value: unknown, field: string, fail: Fail): boolean {
  if (typeof value !== "boolean") {
    throw fail(`${field} must be a boolean`);
  }
  return value;
}

/**
 * Array of non-empty bounded strings, no duplicates (a set-like field):
 * bounded length, bounded items, fail-closed on duplicates.
 */
export function requireUniqueBoundedStringArray(
  value: unknown,
  field: string,
  maxItems: number,
  itemMaxLength: number,
  fail: Fail,
): readonly string[] {
  if (!Array.isArray(value)) {
    throw fail(`${field} must be an array of non-empty strings`);
  }
  if (value.length === 0) {
    throw fail(`${field} must not be empty`);
  }
  if (value.length > maxItems) {
    throw fail(`${field} must carry at most ${maxItems} entries`);
  }
  const items = value.map((entry, index) =>
    requireBoundedString(entry, `${field}[${index}]`, itemMaxLength, fail),
  );
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) {
      throw fail(`${field} must not contain duplicates ('${item}')`);
    }
    seen.add(item);
  }
  return items;
}

/** Deep-freezes plain JSON-shaped data (arrays and objects, recursively). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== null && typeof child === "object" && !Object.isFrozen(child)) {
        deepFreeze(child);
      }
    }
  }
  return value;
}
