/**
 * @payswap/economic — AmountSpec: the pinned cross-lane money wire shape (P1-W1).
 *
 * PINNED WIRE CONTRACT — identical in all three Phase-1 lanes (P1-W1
 * economic model, P1-W2 financial protocol, P1-W3 trust). Do NOT deviate.
 * The declaration below is verbatim the pin recorded in the P1 dispatch, in
 * spec/development-state/current-state.json and in
 * packages/trust/src/amount-spec.ts (the authoritative wire type, P1-W3):
 *
 *   interface AmountSpec {
 *     readonly currency: string;
 *     readonly minorUnits: string;
 *   }
 *
 * - `currency` matches /^[A-Z]{3}$/ — fiat ISO-style and onchain symbols
 *   share the SAME shape (the old-repo AmountSpec law, preserved).
 * - `minorUnits` is a canonical non-negative decimal integer string: no
 *   sign, no decimal point, no exponent, no leading zeros except "0"
 *   (/^(0|[1-9][0-9]*)$/).
 *
 * DUPLICATE-TYPE RISK (ACCEPTED, TL-RECONCILED): this package declares the
 * shape STRUCTURALLY because parallel-lane self-containment forbids imports
 * from @payswap/trust while lanes are in flight. The trust lane owns the
 * authoritative wire type; the TL reconciles the duplicate structural pins
 * at integration (dependency direction stays financial -> trust, never the
 * reverse). Byte-identical shape + identical validation patterns are
 * verified by tests against the pin above.
 *
 * SINGLE-OWNER LAW (INV-01 — one Financial Protocol Authority): this module
 * implements the wire SHAPE and its STRUCTURAL validation ONLY. It does NOT
 * implement money arithmetic — no add/scale/compare of amounts is exported
 * from @payswap/economic. Exact-integer money semantics are owned
 * exclusively by the financial protocol lane (P1-W2, packages/protocol).
 */

import { InvalidAmountSpecError } from "./errors.ts";
import {
  deepFreeze,
  requireCurrencyCode,
  requireExactKeys,
  requireObject,
  type Fail,
} from "./validate.ts";

const MINOR_UNITS_PATTERN = /^(0|[1-9][0-9]*)$/;

const AMOUNT_SPEC_KEYS = ["currency", "minorUnits"] as const;

const fail: Fail = (message: string) => new InvalidAmountSpecError(message);

/** Exact monetary amount on the wire: integer minor units as a canonical decimal string. */
export interface AmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}

/**
 * Fail-closed STRUCTURAL validation of the pinned wire format (adapts the
 * semantics of payswap.org@8a735bf packages/trust/src/mandate.ts
 * validateAmountSpec, re-declared locally per the pin above; the old
 * route-compiler intent.ts wrapped the trust validator — the wrap discipline
 * is ported, the import is not). Unknown fields are rejected.
 */
export function validateAmountSpec(candidate: unknown): AmountSpec {
  const record = requireObject(candidate, "an AmountSpec (currency + canonical minorUnits)", fail);
  requireExactKeys(record, AMOUNT_SPEC_KEYS, "AmountSpec", fail);
  const currency = requireCurrencyCode(record["currency"], "AmountSpec.currency", fail);
  const rawMinorUnits = record["minorUnits"];
  if (typeof rawMinorUnits !== "string" || !MINOR_UNITS_PATTERN.test(rawMinorUnits)) {
    throw new InvalidAmountSpecError(
      `AmountSpec.minorUnits must be a canonical non-negative decimal integer string (no sign, no decimal point, no exponent, no leading zeros except "0"), got '${String(
        rawMinorUnits,
      )}'`,
    );
  }
  return deepFreeze({ currency, minorUnits: rawMinorUnits });
}

/**
 * Fail-closed validation that additionally requires a POSITIVE amount (a
 * value transfer moves value). `field` names the carrying field in errors.
 */
export function validatePositiveAmountSpec(candidate: unknown, field: string): AmountSpec {
  const amount = validateAmountSpec(candidate);
  if (amount.minorUnits === "0") {
    throw new InvalidAmountSpecError(
      `${field} must be positive — a value transfer moves value (got minorUnits "0")`,
    );
  }
  return amount;
}

/** Structural type-predicate form for inbound wire data. */
export function isValidAmountSpec(candidate: unknown): candidate is AmountSpec {
  try {
    validateAmountSpec(candidate);
    return true;
  } catch {
    return false;
  }
}
