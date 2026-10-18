/**
 * @payswap/route-compiler test fixtures — policy variants (P5-W1).
 * Extracted from venue-fixtures so each fixture module stays under the
 * file law; re-exports the base builders for one-line imports.
 */

export { baseBestExecutionPolicy, baseSecurity, allowAllGate, blockAllGate, unknownAllGate } from "./venue-fixtures.ts";
import { baseBestExecutionPolicy } from "./venue-fixtures.ts";
import type { BestExecutionPolicy } from "../src/policy.ts";
import { rationalOf } from "../src/exact-math.ts";

/** A policy with a stricter risk cap (LOW only). */
export function lowRiskOnlyPolicy(): BestExecutionPolicy {
  return { ...baseBestExecutionPolicy(), maxFailureRiskClass: "LOW" };
}

/** A policy with a tight time budget. */
export function tightTimePolicy(): BestExecutionPolicy {
  return { ...baseBestExecutionPolicy(), maxSettlementMs: 60_000 };
}

/** A policy with a venue allowlist. */
export function allowlistPolicy(allowedVenues: readonly string[]): BestExecutionPolicy {
  return { ...baseBestExecutionPolicy(), allowedVenues };
}

/** A policy with doubled time cost (the no-hidden-constants probe). */
export function doubleTimeCostPolicy(): BestExecutionPolicy {
  return { ...baseBestExecutionPolicy(), timeCostPerMs: rationalOf(2, 1000) };
}

/** A policy with a raised MODERATE risk deduction (the no-hidden-constants probe). */
export function raisedDeductionPolicy(): BestExecutionPolicy {
  return { ...baseBestExecutionPolicy(), failureRiskDeductions: { LOW: "0", MODERATE: "250000", ELEVATED: "1000000", HIGH: "10000000" } };
}
