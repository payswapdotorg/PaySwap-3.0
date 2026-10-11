/**
 * @payswap/surface — AmountSpec: the pinned cross-lane money wire shape (P2-W3).
 *
 * PINNED WIRE CONTRACT — identical to the Phase-1 pins (P1-W1 economic,
 * P1-W2 financial protocol, P1-W3 trust, the authoritative wire type). Do NOT
 * deviate; the declaration below is verbatim the pin recorded in the Phase-1
 * dispatch, in spec/development-state/current-state.json and in
 * packages/trust/src/amount-spec.ts:
 *
 *   interface AmountSpec {
 *     readonly currency: string;
 *     readonly minorUnits: string;
 *   }
 *
 * - `currency` matches /^[A-Z]{3}$/ — fiat ISO-style and onchain symbols
 *   share the SAME shape.
 * - `minorUnits` is a canonical non-negative decimal integer string: no
 *   sign, no decimal point, no exponent, no leading zeros except "0"
 *   (/^(0|[1-9][0-9]*)$/).
 *
 * DUPLICATE-TYPE RISK (ACCEPTED, TL-RECONCILED — same decision as the
 * economic lane): this package declares the shape STRUCTURALLY because the
 * contracts layer (MODULE-OWNERSHIP.yaml layer `contracts`,
 * may_depend_on [contracts]) forbids imports from the trust layer while
 * sibling Phase-2 lanes are in flight, and the work order pins sibling
 * shapes as opaque, versioned projections. @payswap/trust owns the
 * authoritative wire type; the TL wires imports at integration if the layer
 * law ever allows it. Byte-identical shape + identical validation patterns
 * are verified by tests against the pin above.
 *
 * SINGLE-OWNER LAW (INV-01 — one Financial Protocol Authority): this module
 * implements the wire SHAPE and its STRUCTURAL validation ONLY. It does NOT
 * implement money arithmetic — no Money type, no add/scale/compare money API
 * is exported from @payswap/surface. The surface DISPLAYS exact amounts
 * (money-view.ts) and never computes financial truth (INV-23).
 */

/** Exact monetary amount on the wire: integer minor units as a canonical decimal string. */
export interface AmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}

/** Raised when an AmountSpec is structurally invalid (fail-closed). */
export class InvalidSurfaceAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSurfaceAmountError";
  }
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*)$/;

/**
 * Structural validation of the pinned wire format (identical semantics to
 * the Phase-1 lanes' validateAmountSpec; cross-lane consistency is
 * machine-checked by tests on both sides).
 */
export function validateSurfaceAmountSpec(amount: AmountSpec): void {
  if (amount === null || typeof amount !== "object") {
    throw new InvalidSurfaceAmountError("amount must be an AmountSpec object");
  }
  if (typeof amount.currency !== "string" || !CURRENCY_PATTERN.test(amount.currency)) {
    throw new InvalidSurfaceAmountError(
      `currency must be a 3-letter uppercase code, got '${String(amount.currency)}'`,
    );
  }
  if (typeof amount.minorUnits !== "string" || !MINOR_UNITS_PATTERN.test(amount.minorUnits)) {
    throw new InvalidSurfaceAmountError(
      `minorUnits must be a non-negative integer decimal string, got '${String(amount.minorUnits)}'`,
    );
  }
}

/** Type predicate form of validateSurfaceAmountSpec for inbound wire data. */
export function isSurfaceAmountSpec(amount: AmountSpec): boolean {
  try {
    validateSurfaceAmountSpec(amount);
    return true;
  } catch {
    return false;
  }
}

/** Require a structurally valid AmountSpec and return it typed (fail-closed). */
export function requireSurfaceAmountSpec(amount: AmountSpec, field: string): AmountSpec {
  try {
    validateSurfaceAmountSpec(amount);
    return amount;
  } catch (error) {
    throw new InvalidSurfaceAmountError(
      `${field}: ${(error as Error).message}`,
    );
  }
}
