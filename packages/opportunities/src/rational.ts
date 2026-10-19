/**
 * @payswap/opportunities — exact rational arithmetic (P6-W2, lane r4-w2).
 *
 * VALUE LAW (authority: @payswap/route-compiler src/exact-math.ts — the
 * old package consumed @payswap/best-execution as-is; re-implemented
 * locally under the zero-sibling pins discipline, behaviour-identical,
 * asserted by test/pins.test.ts): canonical DECIMAL INTEGER STRINGS
 * (numerator non-negative, denominator positive); native BigInt — NO
 * floating point anywhere; NOT GCD-reduced (byte-stable traces);
 * subtraction FLOORS AT ZERO (a lower bound is never negative).
 */

import { InvalidEvidenceError } from "./errors.ts";
import type { PinnedExactRational } from "./pins/route-compiler.ts";
import {
  PINNED_NON_NEGATIVE_INTEGER_PATTERN,
  PINNED_POSITIVE_INTEGER_PATTERN,
  PINNED_ZERO_RATIONAL,
} from "./pins/route-compiler.ts";

/** The exact rational wire shape (the pinned route-compiler shape). */
export type ExactRational = PinnedExactRational;

/** The rational zero (byte-identical to the authority's ZERO_RATIONAL). */
export const ZERO_RATIONAL: ExactRational = PINNED_ZERO_RATIONAL;

/**
 * Fail-closed structural validation of an ExactRational (the authority's
 * validateExactRational law, behaviour-identical).
 */
export function validateExactRational(value: ExactRational): void {
  if (value === null || typeof value !== "object") {
    throw new InvalidEvidenceError("an ExactRational must be an object");
  }
  const record = value as Partial<ExactRational>;
  if (
    typeof record.numerator !== "string" ||
    !PINNED_NON_NEGATIVE_INTEGER_PATTERN.test(record.numerator)
  ) {
    throw new InvalidEvidenceError(
      "ExactRational.numerator must be a canonical non-negative decimal integer string",
    );
  }
  if (
    typeof record.denominator !== "string" ||
    !PINNED_POSITIVE_INTEGER_PATTERN.test(record.denominator)
  ) {
    throw new InvalidEvidenceError(
      "ExactRational.denominator must be a canonical positive decimal integer string",
    );
  }
}

/** Is the rational exactly zero? (fail-closed on malformed input) */
export function isRationalZero(value: ExactRational): boolean {
  validateExactRational(value);
  return value.numerator === "0";
}

/**
 * The exact ordering of two rationals via BigInt cross-multiplication —
 * negative when a < b, zero when equal, positive when a > b. NEVER
 * floating point (the authority's compareRationals law).
 */
export function compareRationals(a: ExactRational, b: ExactRational): number {
  validateExactRational(a);
  validateExactRational(b);
  const left = BigInt(a.numerator) * BigInt(b.denominator);
  const right = BigInt(b.numerator) * BigInt(a.denominator);
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/** Adds two exact rationals (exact; NOT reduced — byte-stable). */
export function addRationals(a: ExactRational, b: ExactRational): ExactRational {
  validateExactRational(a);
  validateExactRational(b);
  const numerator =
    BigInt(a.numerator) * BigInt(b.denominator) +
    BigInt(b.numerator) * BigInt(a.denominator);
  const denominator = BigInt(a.denominator) * BigInt(b.denominator);
  return Object.freeze({
    numerator: numerator.toString(),
    denominator: denominator.toString(),
  });
}

/**
 * Subtracts b from a, FLOORED AT ZERO — never a negative rational (the
 * estimation lower-bound law: a bound is never negative).
 */
export function subtractRationalsFlooredAtZero(
  a: ExactRational,
  b: ExactRational,
): ExactRational {
  validateExactRational(a);
  validateExactRational(b);
  if (compareRationals(a, b) <= 0) {
    return { ...ZERO_RATIONAL };
  }
  const numerator =
    BigInt(a.numerator) * BigInt(b.denominator) -
    BigInt(b.numerator) * BigInt(a.denominator);
  const denominator = BigInt(a.denominator) * BigInt(b.denominator);
  return Object.freeze({
    numerator: numerator.toString(),
    denominator: denominator.toString(),
  });
}

/** Sums a list of exact rationals (empty list sums to zero). */
export function sumRationals(
  values: readonly ExactRational[],
): ExactRational {
  let sum: ExactRational = { ...ZERO_RATIONAL };
  for (const value of values) {
    sum = addRationals(sum, value);
  }
  return sum;
}
