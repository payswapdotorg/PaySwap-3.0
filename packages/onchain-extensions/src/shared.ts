/**
 * @payswap/onchain-extensions — shared internal helpers (Work Order P5-W2,
 * lane R3-W2). NOT exported from the package barrel (law-enforcement
 * internals, the accepted capability/shared.ts policy): every module in this
 * package repeats its own local copy of the one-liners it needs when that
 * keeps files independent; the non-trivial helpers live here.
 */

/** Deterministic non-empty-string guard (the accepted lane idiom). */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Deterministic plain-object guard (null is not an object here). */
export function isStringRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A finite non-negative integer (basis points, counts, tiers). */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Deep-clone-then-freeze so validated output can never be mutated by the
 * caller AND caller-supplied objects are never frozen out from under their
 * owner (the accepted validate-then-freeze law).
 */
export function cloneAndFreeze<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    const cloned = Object.freeze(value.map((item) => cloneAndFreeze(item)));
    return cloned as unknown as Readonly<T>;
  }
  if (typeof value === 'object' && value !== null) {
    const source = value as Readonly<Record<string, unknown>>;
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      copy[key] = cloneAndFreeze(source[key]);
    }
    return Object.freeze(copy) as Readonly<T>;
  }
  return value;
}

/**
 * Deep frozen-state probe (the declarative law's runtime evidence: a
 * validated pack is FROZEN DATA, all the way down).
 */
export function isDeepFrozen(value: unknown): boolean {
  if (Array.isArray(value)) {
    if (!Object.isFrozen(value)) {
      return false;
    }
    return value.every((item) => isDeepFrozen(item));
  }
  if (typeof value === 'object' && value !== null) {
    if (!Object.isFrozen(value)) {
      return false;
    }
    return Object.values(value).every((item) => isDeepFrozen(item));
  }
  return true;
}
