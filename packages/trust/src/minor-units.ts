/**
 * INTERNAL canonical-integer operations on AmountSpec.minorUnits (P1-W3).
 *
 * NOT PART OF THE PUBLIC API — deliberately not re-exported from index.ts.
 *
 * Why this exists: the trust plane must machine-check its own laws —
 * INV-12 (child delegation strictly attenuated: a child amount ceiling may
 * never exceed the parent's) and mandate limit enforcement (per-transaction
 * bounds, velocity window sums). Those laws require an exact ordering and an
 * exact sum over the canonical wire form. Delegating that arithmetic to the
 * caller (or to the financial lane at evaluation time) would make the
 * security boundary only as strong as caller-supplied code, so the boundary
 * computes it itself.
 *
 * Why this is NOT money arithmetic (single-owner law, INV-01): these helpers
 * operate on the canonical decimal-integer STRING that this package owns and
 * structurally validates. There is no Money type, no currency semantics, no
 * conversion, no scaling, no rounding, no cross-currency operation, and no
 * public export. Currency equality is enforced by every caller BEFORE these
 * helpers run. Exact-integer MONEY semantics and the AmountSpec->Money
 * bridge remain exclusively owned by the financial protocol lane (P1-W2).
 *
 * Determinism: both functions are pure functions of their string inputs.
 * Arbitrarily large values are handled via length/lexicographic ordering on
 * the canonical form (no numeric parsing needed for comparison), and BigInt
 * for summation (exact for any length the wire admits).
 */

import { validateAmountSpec } from "./amount-spec.ts";
import type { AmountSpec } from "./amount-spec.ts";

const CANONICAL_MINOR_UNITS = /^(0|[1-9][0-9]*)$/;

function requireCanonical(minorUnits: string, label: string): void {
  if (!CANONICAL_MINOR_UNITS.test(minorUnits)) {
    throw new Error(
      `internal invariant violated: ${label} minorUnits '${minorUnits}' is not a canonical non-negative decimal integer string`,
    );
  }
}

/**
 * Exact ordering of two canonical minorUnits strings: -1 | 0 | 1.
 * Canonical form (no leading zeros) makes length-then-lexicographic ordering
 * identical to integer ordering, with no size limit.
 */
export function compareCanonicalMinorUnits(a: string, b: string): -1 | 0 | 1 {
  requireCanonical(a, "left");
  requireCanonical(b, "right");
  if (a === b) {
    return 0;
  }
  if (a.length !== b.length) {
    return a.length < b.length ? -1 : 1;
  }
  return a < b ? -1 : 1;
}

/**
 * Exact sum of two canonical minorUnits strings, returned in canonical form.
 * BigInt keeps the sum exact for arbitrarily large operands.
 */
export function addCanonicalMinorUnits(a: string, b: string): string {
  requireCanonical(a, "left");
  requireCanonical(b, "right");
  return (BigInt(a) + BigInt(b)).toString(10);
}

/**
 * Amount-bounded check used by trust law enforcement: is `amount` within the
 * `bound` ceiling? Fails closed (throws) unless both AmountSpecs are
 * structurally valid AND share one currency — a bound in another currency
 * can never bound this amount.
 */
export function amountWithinBound(
  amount: AmountSpec,
  bound: AmountSpec,
): boolean {
  validateAmountSpec(amount);
  validateAmountSpec(bound);
  if (amount.currency !== bound.currency) {
    throw new Error(
      `currency mismatch: cannot bound ${amount.currency} amount with a ${bound.currency} bound (fail closed)`,
    );
  }
  return compareCanonicalMinorUnits(amount.minorUnits, bound.minorUnits) <= 0;
}
