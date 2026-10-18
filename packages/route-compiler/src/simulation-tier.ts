/**
 * @payswap/route-compiler — the simulation tier law (P5-W1).
 *
 * PORT of the old mixed-rail simulation-tier.ts (MMI-19): the
 * never-production tier. Route-plan WALKS (route-walk.ts) simulate
 * execution deterministically — they are LAB-TIERED by construction and
 * structurally barred from production financial settlement:
 *
 * - `LAB_EXECUTION_TIER` is the ONLY tier this package may ever produce;
 * - the tier is a runtime-brand (`executionTier` on every walk result)
 *   re-derivable by `isLabTieredValue` and fail-closed asserted by
 *   `assertLabExecutionTier`;
 * - `labTierPermitsFinancialSettlement()` is a first-class ALWAYS-FALSE
 *   contract and `rejectLabTierForFinancialSettlement` ALWAYS throws
 *   (the downstream gate every settlement-adjacent consumer must call);
 * - the tier is DISTINCT from chain-environment classes: a simulated
 *   venue may model a PRODUCTION-classified chain while Lab execution
 *   is always LAB_SIMULATION_NON_PRODUCTION (both recorded, never
 *   conflated).
 */

import { LabTierSettlementRejectedError, ValidationError } from "./errors.ts";

/** The ONLY execution tier a route walk may ever produce. */
export const LAB_EXECUTION_TIER = "LAB_SIMULATION_NON_PRODUCTION" as const;

/** The phantom brand key (module-private nominal discipline). */
declare const brand: unique symbol;

/** The Lab-tier brand: structurally incompatible with production evidence shapes. */
export interface LabExecutionTierBrand {
  readonly [brand]: typeof LAB_EXECUTION_TIER;
  readonly executionTier: typeof LAB_EXECUTION_TIER;
}

/** True iff the value carries the structural non-production tier. */
export function isLabTieredValue(value: unknown): value is LabExecutionTierBrand {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Partial<LabExecutionTierBrand>).executionTier === LAB_EXECUTION_TIER
  );
}

/** Fail-closed tier assertion (throws ValidationError on forgeries). */
export function assertLabExecutionTier(value: unknown): asserts value is LabExecutionTierBrand {
  if (typeof value !== "object" || value === null) {
    throw new ValidationError("the tier assertion demands an object (a forged tier is not a tier)");
  }
  if (!isLabTieredValue(value)) {
    throw new ValidationError(
      `the value does not carry the Lab execution tier '${LAB_EXECUTION_TIER}' (fail closed, never guessed)`,
    );
  }
}

/**
 * THE SETTLEMENT GATE (first-class, always false): a Lab-tiered
 * execution result can never be production financial settlement.
 */
export function labTierPermitsFinancialSettlement(): false {
  return false;
}

/**
 * The always-throwing settlement gate: every settlement-adjacent
 * consumer calls this with any artifact demanded as settleable.
 */
export function rejectLabTierForFinancialSettlement(value: unknown): never {
  const description = isLabTieredValue(value)
    ? "a Lab-tiered execution record (tier 'LAB_SIMULATION_NON_PRODUCTION')"
    : "a non-tiered value passed where a settleable artifact was demanded";
  throw new LabTierSettlementRejectedError(
    `financial settlement rejected: ${description} can never be production financial execution — Lab simulation results carry the structural non-production tier and are rejected by every settlement gate (the walk law)`,
  );
}
