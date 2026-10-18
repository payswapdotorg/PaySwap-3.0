/**
 * @payswap/route-compiler — exact rational arithmetic (P5-W1).
 *
 * PORT of payswap.org@8a735bf packages/best-execution/src/exact-math.ts
 * (134 lines, MMI-19): every valued boundary in route scoring crosses this
 * module — no floating point anywhere, ever (INV-F01 extended to
 * valuations).
 *
 * The approach: exact NON-NEGATIVE rationals represented externally as
 * canonical decimal integer strings, computed with native BigInt.
 * Rationals are NOT GCD-reduced (reduction is a canonicalization choice
 * that would change byte-stability of intermediate traces — exactness
 * does not require it); each valued component floors toward zero at its
 * single boundary — the same rule for outputs and costs, so no component
 * is systematically favored.
 */

import { ValidationError } from "./errors.ts";

const NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

/** An exact non-negative rational: canonical decimal integer strings. */
export interface ExactRational {
  /** Non-negative canonical decimal integer (no leading zeros). */
  readonly numerator: string;
  /** Positive canonical decimal integer (never zero). */
  readonly denominator: string;
}

/** The rational zero (the additive identity of the valued-component law). */
export const ZERO_RATIONAL: ExactRational = Object.freeze({ numerator: "0", denominator: "1" });

/** The rational one (the multiplicative identity). */
export const UNIT_RATIONAL: ExactRational = Object.freeze({ numerator: "1", denominator: "1" });

/** Fail-closed structural validation of an ExactRational. */
export function validateExactRational(value: ExactRational): void {
  if (value === null || typeof value !== "object") {
    throw new ValidationError("an ExactRational must be an object");
  }
  const record = value as Partial<ExactRational>;
  if (typeof record.numerator !== "string" || !NON_NEGATIVE_INTEGER.test(record.numerator)) {
    throw new ValidationError(
      "ExactRational.numerator must be a canonical non-negative decimal integer string",
    );
  }
  if (typeof record.denominator !== "string" || !POSITIVE_INTEGER.test(record.denominator)) {
    throw new ValidationError(
      "ExactRational.denominator must be a canonical positive decimal integer string",
    );
  }
}

/** Exact product (NOT reduced — byte-stable intermediate traces). */
export function multiplyRationals(a: ExactRational, b: ExactRational): ExactRational {
  validateExactRational(a);
  validateExactRational(b);
  return Object.freeze({
    numerator: (BigInt(a.numerator) * BigInt(b.numerator)).toString(),
    denominator: (BigInt(a.denominator) * BigInt(b.denominator)).toString(),
  });
}

/** Exact product of a rational and a canonical non-negative integer string. */
export function rationalTimesInteger(rational: ExactRational, integer: string): ExactRational {
  validateExactRational(rational);
  if (typeof integer !== "string" || !NON_NEGATIVE_INTEGER.test(integer)) {
    throw new ValidationError("the integer must be a canonical non-negative decimal integer string");
  }
  return Object.freeze({
    numerator: (BigInt(rational.numerator) * BigInt(integer)).toString(),
    denominator: rational.denominator,
  });
}

/**
 * Floor of a rational to a canonical integer string. BigInt division
 * truncates toward zero, which IS floor for non-negative rationals — the
 * single documented rounding boundary of this package.
 */
export function floorRationalToIntegerString(rational: ExactRational): string {
  validateExactRational(rational);
  return (BigInt(rational.numerator) / BigInt(rational.denominator)).toString();
}

/** Exact comparison via cross-multiplication (no float, no reduction). */
export function compareRationals(a: ExactRational, b: ExactRational): -1 | 0 | 1 {
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

/** True iff the rational is exactly zero. */
export function isRationalZero(rational: ExactRational): boolean {
  validateExactRational(rational);
  return BigInt(rational.numerator) === 0n;
}

/**
 * The value of an amount (minor units string) through a rate: exact
 * multiplication then a single floor — the conversion law of every valued
 * component boundary in scoring.
 */
export function valueThroughRate(amountMinorUnits: string, rate: ExactRational): string {
  if (typeof amountMinorUnits !== "string" || !NON_NEGATIVE_INTEGER.test(amountMinorUnits)) {
    throw new ValidationError(
      "the amount must be a canonical non-negative decimal integer string",
    );
  }
  return floorRationalToIntegerString(rationalTimesInteger(rate, amountMinorUnits));
}

/** Build a frozen rational from numeric literals (test/declaration convenience). */
export function rationalOf(numerator: number, denominator: number): ExactRational {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator < 0 ||
    denominator < 1
  ) {
    throw new ValidationError(
      "rationalOf requires a non-negative integer numerator and a positive integer denominator",
    );
  }
  return Object.freeze({ numerator: numerator.toString(), denominator: denominator.toString() });
}
