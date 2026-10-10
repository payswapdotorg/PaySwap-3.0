/**
 * AmountSpec — the pinned cross-lane money wire format (P1-W3).
 *
 * PINNED WIRE CONTRACT — identical in all three Phase-1 lanes (P1-W1
 * economic model, P1-W2 financial protocol, P1-W3 trust). Do NOT deviate:
 * the declaration below is verbatim the pin recorded in the P1 dispatch and
 * in spec/trust/TRUST-BOUNDARY.md.
 *
 *   interface AmountSpec {
 *     readonly currency: string;
 *     readonly minorUnits: string;
 *   }
 *
 * - `currency` matches /^[A-Z]{3}$/ — fiat ISO-style and onchain symbols
 *   share the shape. The trust lane validates the SHAPE only; currency
 *   knowledge (registered codes, minor-unit scales, onchain symbols) is a
 *   financial-lane concern.
 * - `minorUnits` is a canonical non-negative decimal integer string: no
 *   sign, no decimal point, no exponent, no leading zeros except "0".
 *
 * SINGLE-OWNER LAW (INV-01 — one Financial Protocol Authority):
 * this package owns the wire TYPE and its STRUCTURAL validation only. It
 * does NOT implement money arithmetic — no Money type, no add/scale/compare
 * money API is exported from @payswap/trust, and no AmountSpec->Money
 * bridge lives here. Exact-integer money semantics and the AmountSpec->Money
 * bridge are owned exclusively by the financial protocol lane (P1-W2,
 * packages/protocol). The old repository's reversed dependency
 * (trust importing protocol Money) is deliberately NOT ported; see
 * docs/trust-evidence/BASELINE-VERIFICATION-RECORD.md (decision D-1/D-2).
 */

/** Exact monetary amount on the wire: integer minor units as a canonical decimal string. */
export interface AmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}

/** Raised when an AmountSpec is structurally invalid. */
export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAmountError";
  }
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*)$/;

/**
 * Structural validation of the pinned wire format (ported from
 * payswap.org@8a735bf packages/trust/src/mandate.ts, verbatim semantics).
 */
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
