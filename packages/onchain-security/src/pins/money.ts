/**
 * @payswap/onchain-security — structural pin: AmountSpec, the pinned
 * cross-lane money wire format (R2-W2).
 *
 * PINNED WIRE CONTRACT — verbatim the pin recorded in the trust lane
 * (packages/trust/src/amount-spec.ts, P1-W3) and honored by the economic
 * and protocol lanes:
 *
 *   interface AmountSpec {
 *     readonly currency: string;
 *     readonly minorUnits: string;
 *   }
 *
 * - `currency` matches /^[A-Z]{3}$/ — fiat ISO-style and onchain symbols
 *   share the shape.
 * - `minorUnits` is a canonical non-negative decimal integer string: no
 *   sign, no decimal point, no exponent, no leading zeros except "0".
 *
 * This package (layer `security`, zero sibling imports) pins the SHAPE and
 * its STRUCTURAL validation + exact comparison locally; exact-integer
 * money SEMANTICS (arithmetic, registered codes, minor-unit scales)
 * remain owned by the financial protocol lane (single-owner law, INV-1
 * territory — this pin never re-implements money).
 *
 * Deterministic only: pure functions.
 */

/** Exact monetary amount on the wire: integer minor units as a canonical decimal string. */
export interface AmountSpec {
  readonly currency: string;
  /** Canonical non-negative integer decimal string (INV-2: exact/lossless only). */
  readonly minorUnits: string;
}

/** Raised when an AmountSpec is structurally invalid (fail closed). */
export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAmountError";
  }
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*)$/;

/** Structural validation of the pinned wire format (fail closed). */
export function validateAmountSpec(amount: AmountSpec): void {
  if (!CURRENCY_PATTERN.test(amount.currency)) {
    throw new InvalidAmountError(
      `currency must be a 3-letter uppercase code, got '${amount.currency}'`,
    );
  }
  if (!MINOR_UNITS_PATTERN.test(amount.minorUnits)) {
    throw new InvalidAmountError(
      `minorUnits must be a non-negative integer decimal string, got '${amount.minorUnits}'`,
    );
  }
}

/** Type predicate form of validateAmountSpec for inbound wire data. */
export function isValidAmountSpec(amount: AmountSpec): boolean {
  try {
    validateAmountSpec(amount);
    return true;
  } catch {
    return false;
  }
}

/**
 * Exact comparison of two canonical minor-unit strings (same currency
 * required). Deterministic integer comparison by (length, lexicographic)
 * over canonical digits — never floating point (INV-2).
 */
export function compareCanonicalMinorUnits(a: string, b: string): -1 | 0 | 1 {
  if (!MINOR_UNITS_PATTERN.test(a)) {
    throw new InvalidAmountError(`'${a}' is not a canonical non-negative integer string`);
  }
  if (!MINOR_UNITS_PATTERN.test(b)) {
    throw new InvalidAmountError(`'${b}' is not a canonical non-negative integer string`);
  }
  if (a === b) {
    return 0;
  }
  // Canonical form: no leading zeros, so longer = larger; equal length =
  // lexicographic order IS numeric order.
  const byLength = a.length - b.length;
  if (byLength !== 0) {
    return byLength < 0 ? -1 : 1;
  }
  return a < b ? -1 : 1;
}

/**
 * Exact comparison of two AmountSpecs of the SAME currency (the trust
 * lane's compareAmounts semantics). Cross-currency comparison throws —
 * it requires an FX quote and is a financial-lane concern (INV-1/INV-2).
 */
export function compareAmounts(a: AmountSpec, b: AmountSpec): -1 | 0 | 1 {
  validateAmountSpec(a);
  validateAmountSpec(b);
  if (a.currency !== b.currency) {
    throw new InvalidAmountError(
      `cannot compare ${a.currency} with ${b.currency}: cross-currency comparison requires an FX quote`,
    );
  }
  return compareCanonicalMinorUnits(a.minorUnits, b.minorUnits);
}
