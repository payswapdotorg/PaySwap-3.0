/**
 * @payswap/route-compiler — the planned-amount contracts (P5-W1).
 *
 * PORT of the old compiler's PlannedLegAmount block (MMI-19): every leg
 * carries its planned amount with an EXPLICIT GROUNDING BASIS — the
 * compiler never invents an amount:
 *
 * - INTENT_DECLARED: the amount is the intent's own declared value (the
 *   movement's origin amount flows a leg verbatim);
 * - QUOTE_GROUNDED: the amount is a quote's guaranteed worst-case output
 *   (the quoteId binds the exact quote observation);
 * - CONVERSION_GROUNDED: the amount is an exact-rational conversion
 *   through a DECLARED rule (the ruleId binds the exact peg/policy);
 * - UNKNOWN: the amount is honestly unknown (a bridge arrival observed
 *   at destination-chain finality, an ungrounded conversion) — carrying a
 *   reason, never a guess (INV-C01).
 *
 * There is no "ESTIMATED" basis: an estimate is either grounded in a
 * declared quote/rule or it is UNKNOWN.
 */

import { InvalidRouteLegContractError } from "./errors.ts";
import { deepFreeze, requireBoundedString, requireObject, LIMITS, type Fail } from "./canonical.ts";
import { validateAmountSpec, type AmountSpec } from "./amount.ts";

const fail: Fail = (message: string) => new InvalidRouteLegContractError(message);

/** The closed planned-amount basis vocabulary (frozen). */
export const PLANNED_AMOUNT_BASES = Object.freeze([
  "INTENT_DECLARED",
  "QUOTE_GROUNDED",
  "CONVERSION_GROUNDED",
  "UNKNOWN",
] as const);

export type PlannedAmountBasis = (typeof PLANNED_AMOUNT_BASES)[number];

/** The planned amount with its explicit grounding basis. */
export type PlannedLegAmount =
  | { readonly basis: "INTENT_DECLARED"; readonly amount: AmountSpec }
  | { readonly basis: "QUOTE_GROUNDED"; readonly amount: AmountSpec; readonly quoteId: string }
  | { readonly basis: "CONVERSION_GROUNDED"; readonly amount: AmountSpec; readonly ruleId: string }
  | { readonly basis: "UNKNOWN"; readonly reason: string };

/** True iff the value is a PlannedLegAmount of the given basis. */
export function isPlannedLegAmountOfBasis(
  value: unknown,
  basis: PlannedAmountBasis,
): value is PlannedLegAmount {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { basis?: unknown }).basis === basis
  );
}

/**
 * Honest narrowing: the grounded amount (INTENT_DECLARED, QUOTE_GROUNDED,
 * CONVERSION_GROUNDED) or a throw — an UNKNOWN basis never coerces to a
 * number (the old fixtures' narrowing discipline, kept).
 */
export function groundedPlannedAmount(planned: PlannedLegAmount): AmountSpec {
  if (planned.basis === "UNKNOWN") {
    throw new InvalidRouteLegContractError(
      `the planned amount is UNKNOWN: ${planned.reason} — an unknown amount never coerces to a grounded one`,
    );
  }
  return planned.amount;
}

/** Honest narrowing: the unknown reason or a throw. */
export function unknownPlannedReason(planned: PlannedLegAmount): string {
  if (planned.basis !== "UNKNOWN") {
    throw new InvalidRouteLegContractError(
      `the planned amount is grounded (${planned.basis}) — there is no unknown reason to read`,
    );
  }
  return planned.reason;
}

/** Fail-closed validation of a planned leg amount. */
export function validatePlannedLegAmount(candidate: unknown): PlannedLegAmount {
  const record = requireObject(candidate, "a PlannedLegAmount", fail);
  const basis = record["basis"];
  switch (basis) {
    case "INTENT_DECLARED":
      return deepFreeze({ basis, amount: validateAmountSpec(record["amount"], "plannedAmount.amount") });
    case "QUOTE_GROUNDED": {
      const amount = validateAmountSpec(record["amount"], "plannedAmount.amount");
      const quoteId = requireBoundedString(record["quoteId"], "plannedAmount.quoteId", LIMITS.refMaxLength, fail);
      return deepFreeze({ basis, amount, quoteId });
    }
    case "CONVERSION_GROUNDED": {
      const amount = validateAmountSpec(record["amount"], "plannedAmount.amount");
      const ruleId = requireBoundedString(record["ruleId"], "plannedAmount.ruleId", LIMITS.refMaxLength, fail);
      return deepFreeze({ basis, amount, ruleId });
    }
    case "UNKNOWN": {
      const reason = requireBoundedString(record["reason"], "plannedAmount.reason", LIMITS.descriptionMaxLength, fail);
      return deepFreeze({ basis, reason });
    }
    default:
      throw fail(
        `plannedAmount.basis must be one of [${PLANNED_AMOUNT_BASES.join(", ")}] — an invented basis is unrepresentable`,
      );
  }
}
