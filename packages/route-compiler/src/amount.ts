/**
 * @payswap/route-compiler — the AmountSpec law on the economic pin (P5-W1).
 *
 * The wire shape is the PINNED cross-lane money type (authority:
 * @payswap/economic src/amount-spec.ts — see src/pins/economic.ts). This
 * module owns the compiler-side STRUCTURAL validation and the exact-integer
 * disciplines every leg amount crosses:
 * - INV-F01: integer minor units only — canonical decimal strings, no
 *   sign, no decimal point, no exponent, no leading zeros except "0";
 * - the currency is a three-letter code shared by fiat and onchain
 *   symbols (the old-repo AmountSpec law, preserved);
 * - POSITIVE amounts where a movement is demanded (the origin amount).
 */

import { ValidationError } from "./errors.ts";
import { requireCurrencyCode, requireObject, type Fail } from "./canonical.ts";
import type { AmountSpecPin } from "./pins/economic.ts";

const MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*)$/;
const AMOUNT_SPEC_KEYS = ["currency", "minorUnits"] as const;

const fail: Fail = (message: string) => new ValidationError(message);

/** The canonical amount wire shape (the economic pin, locally named). */
export type AmountSpec = AmountSpecPin;

/** True iff a minor-units string is canonical (INV-F01). */
export function isCanonicalMinorUnits(value: unknown): value is string {
  return typeof value === "string" && MINOR_UNITS_PATTERN.test(value);
}

/**
 * Fail-closed STRUCTURAL validation of the pinned wire format (adapts the
 * old validateAmountSpec semantics): returns the frozen amount or throws.
 */
export function validateAmountSpec(candidate: unknown, subject: string): AmountSpec {
  const record = requireObject(candidate, `${subject} (an AmountSpec)`, fail);
  const currency = requireCurrencyCode(record["currency"], `${subject}.currency`, fail);
  const minorUnits = record["minorUnits"];
  if (!isCanonicalMinorUnits(minorUnits)) {
    throw new ValidationError(
      `${subject}.minorUnits must be a canonical non-negative decimal integer string (no sign, no point, no leading zeros)`,
    );
  }
  return Object.freeze({ currency, minorUnits });
}

/** Positive-amount validation (movements demand positive value; INV-F01). */
export function validatePositiveAmountSpec(candidate: unknown, subject: string): AmountSpec {
  const amount = validateAmountSpec(candidate, subject);
  if (amount.minorUnits === "0") {
    throw new ValidationError(`${subject}.minorUnits must be positive (a zero movement is refused)`);
  }
  return amount;
}

/** Exact integer comparison of two minor-unit strings (BigInt, pure). */
export function compareMinorUnits(left: string, right: string): -1 | 0 | 1 {
  if (!isCanonicalMinorUnits(left) || !isCanonicalMinorUnits(right)) {
    throw new ValidationError("minor-unit comparison requires canonical integer strings");
  }
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  if (leftValue < rightValue) {
    return -1;
  }
  if (leftValue > rightValue) {
    return 1;
  }
  return 0;
}

/** True iff the two amounts carry the same currency and equal minor units. */
export function amountsEqual(left: AmountSpec, right: AmountSpec): boolean {
  return left.currency === right.currency && left.minorUnits === right.minorUnits;
}
