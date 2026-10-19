/**
 * @payswap/adversarial — structural pin: AmountSpec, the pinned
 * cross-lane money wire format (P6-W3, lane r4-w3).
 *
 * PINNED WIRE CONTRACT — verbatim the pin recorded in the trust lane
 * (packages/trust/src/amount-spec.ts, P1-W3), honored by the economic
 * and protocol lanes and mirrored by the onchain-security lane's own
 * pin (packages/onchain-security/src/pins/money.ts, R2-W2):
 *
 *   interface AmountSpec {
 *     readonly currency: string;
 *     readonly minorUnits: string;
 *   }
 *
 * - `currency` matches /^[A-Z]{3}$/ — fiat ISO-style and onchain
 *   symbols share the shape;
 * - `minorUnits` is a canonical non-negative decimal integer string:
 *   no sign, no decimal point, no exponent, no leading zeros except
 *   "0".
 *
 * This package (layer `security`, zero sibling imports) pins the SHAPE
 * and its STRUCTURAL validation locally; exact-integer money SEMANTICS
 * (arithmetic, registered codes, minor-unit scales) remain owned by the
 * financial protocol lane (single-owner law, INV-1/INV-2 territory —
 * this pin never re-implements money). Provider observations carry
 * AmountSpec-shaped amounts (partial-payment deltas, incident
 * exposure); the pin keeps them exact.
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
