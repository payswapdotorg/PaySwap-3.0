/**
 * @payswap/route-compiler — liquidity estimates: ADVISORY ONLY (P5-W1).
 *
 * NET-NEW as a first-class contract (the work-order law: "Liquidity
 * estimates are NOT custody and NOT authorization"). The old tree
 * carried liquidity only as a quote's liquidityImpact cost dimension;
 * the rebuild makes the advisory-only law STRUCTURAL:
 *
 * - a LiquidityEstimate is an OBSERVATION of depth/impact (model +
 *   venue + freshness + evidence), never a balance, never a hold;
 * - `advisoryOnly: true` is a LITERAL type — a liquidity record that
 *   claims to carry anything but advisory content is unrepresentable
 *   and rejected by validation;
 * - liquidityPermitsCustody() and liquidityPermitsAuthorization() are
 *   first-class ALWAYS-FALSE contracts (the settlement-gate pattern of
 *   the never-production tier);
 * - the comparability gate's FUNDING requirement demands an
 *   observation-grounded position record — a liquidity estimate NEVER
 *   satisfies it (test-enforced);
 * - scoring consumes ONLY the declared impact cost (a cost dimension);
 *   the depth fields never enter valuation, never enter custody
 *   contracts, never appear in authorization lineage.
 */

import { ValidationError } from "./errors.ts";
import { epochMillisFromIso, isIsoUtcTimestamp } from "./canonical-time.ts";
import { deepFreeze, requireBoundedString, requireNonEmptyStringArray, requireNonNegativeSafeInteger, requireObject, LIMITS, type Fail } from "./canonical.ts";

const fail: Fail = (message: string) => new ValidationError(message);

/** The closed liquidity model vocabulary (frozen). */
export const LIQUIDITY_ESTIMATE_MODELS = Object.freeze([
  "DEPTH_SNAPSHOT",
  "POOL_STATE",
  "VENUE_DECLARED",
  "AGGREGATED_DEPTH",
] as const);

export type LiquidityEstimateModel = (typeof LIQUIDITY_ESTIMATE_MODELS)[number];

/** True iff the value is a member of the closed model vocabulary. */
export function isLiquidityEstimateModel(value: unknown): value is LiquidityEstimateModel {
  return typeof value === "string" && (LIQUIDITY_ESTIMATE_MODELS as readonly unknown[]).includes(value);
}

/**
 * A liquidity estimate: ADVISORY ONLY. `advisoryOnly: true` is a LITERAL
 * type (the declarative law, type-visible): an estimate that claims to
 * be more than advisory is unrepresentable.
 */
export interface LiquidityEstimate {
  readonly estimateId: string;
  readonly model: LiquidityEstimateModel;
  readonly venueId: string;
  /** The asset pair the depth is observed over (advisory context). */
  readonly assetPair: { readonly inputSymbol: string; readonly outputSymbol: string };
  /** Declared depth in output-asset minor units (advisory, never a hold). */
  readonly declaredDepthMinorUnits: string;
  /** Declared price impact in basis points (advisory). */
  readonly declaredImpactBasisPoints: number;
  /** LITERAL: a liquidity estimate is advisory content ONLY. */
  readonly advisoryOnly: true;
  readonly observedAt: string;
  readonly freshness: { readonly asOf: string; readonly maxAgeSeconds: number };
  readonly evidenceRefs: readonly string[];
}

/**
 * THE ADVISORY-ONLY SETTLEMENT GATE (first-class, always false): a
 * liquidity estimate can NEVER permit custody. There is no input that
 * passes; the function exists so downstream consumers call it.
 */
export function liquidityPermitsCustody(): false {
  return false;
}

/**
 * THE ADVISORY-ONLY AUTHORIZATION GATE (first-class, always false): a
 * liquidity estimate can NEVER permit authorization.
 */
export function liquidityPermitsAuthorization(): false {
  return false;
}

/** True iff the value structurally carries the advisory-only literal. */
export function isLiquidityAdvisoryOnly(value: unknown): value is LiquidityEstimate {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { advisoryOnly?: unknown }).advisoryOnly === true
  );
}

/** Fail-closed validation of a liquidity estimate (the advisory-only law). */
export function validateLiquidityEstimate(candidate: unknown): LiquidityEstimate {
  const record = requireObject(candidate, "a LiquidityEstimate", fail);
  const estimateId = requireBoundedString(record["estimateId"], "estimate.estimateId", LIMITS.refMaxLength, fail);
  const model = record["model"];
  if (!isLiquidityEstimateModel(model)) {
    throw fail(
      `estimate.model must be one of the closed vocabulary [${LIQUIDITY_ESTIMATE_MODELS.join(", ")}]`,
    );
  }
  const venueId = requireBoundedString(record["venueId"], "estimate.venueId", LIMITS.venueIdMaxLength, fail);
  const pairRecord = requireObject(record["assetPair"], "estimate.assetPair", fail);
  const inputSymbol = requireBoundedString(pairRecord["inputSymbol"], "estimate.assetPair.inputSymbol", 3, fail);
  const outputSymbol = requireBoundedString(pairRecord["outputSymbol"], "estimate.assetPair.outputSymbol", 3, fail);
  const declaredDepthMinorUnits = record["declaredDepthMinorUnits"];
  if (typeof declaredDepthMinorUnits !== "string" || !/^(0|[1-9][0-9]*)$/.test(declaredDepthMinorUnits)) {
    throw fail("estimate.declaredDepthMinorUnits must be a canonical integer string (INV-F01 — even advisory numbers are exact)");
  }
  const declaredImpactBasisPoints = record["declaredImpactBasisPoints"];
  if (
    typeof declaredImpactBasisPoints !== "number" ||
    !Number.isSafeInteger(declaredImpactBasisPoints) ||
    declaredImpactBasisPoints < 0
  ) {
    throw fail("estimate.declaredImpactBasisPoints must be a non-negative integer");
  }
  if (record["advisoryOnly"] !== true) {
    throw fail("estimate.advisoryOnly must be true — a liquidity record claiming non-advisory content is unrepresentable (the work-order law: liquidity is never custody and never authorization)");
  }
  const observedAt = record["observedAt"];
  if (typeof observedAt !== "string" || !isIsoUtcTimestamp(observedAt)) {
    throw fail("estimate.observedAt must be a strict ISO-8601 UTC timestamp (data, never a clock read)");
  }
  const freshnessRecord = requireObject(record["freshness"], "estimate.freshness", fail);
  const asOf = freshnessRecord["asOf"];
  if (typeof asOf !== "string" || !isIsoUtcTimestamp(asOf)) {
    throw fail("estimate.freshness.asOf must be a strict ISO-8601 UTC timestamp");
  }
  const maxAgeSeconds = requireNonNegativeSafeInteger(freshnessRecord["maxAgeSeconds"], "estimate.freshness.maxAgeSeconds", fail);
  if (maxAgeSeconds < 1) {
    throw fail("estimate.freshness.maxAgeSeconds must be positive (a boundless estimate is not evidence)");
  }
  const evidenceRefs = requireNonEmptyStringArray(record["evidenceRefs"], "estimate.evidenceRefs", fail);
  return deepFreeze({
    estimateId,
    model,
    venueId,
    assetPair: Object.freeze({ inputSymbol, outputSymbol }),
    declaredDepthMinorUnits,
    declaredImpactBasisPoints,
    advisoryOnly: true,
    observedAt,
    freshness: Object.freeze({ asOf, maxAgeSeconds }),
    evidenceRefs,
  });
}

/**
 * The liquidity-impact COST projection (the ONLY scoring consumption of
 * liquidity): an advisory cost in numeraire-scaled minor units derived
 * from the declared impact basis points over a value — computed by the
 * CALLER's conversion policy, never a hidden constant here.
 */
export function liquidityImpactCostBasisPoints(estimate: LiquidityEstimate): number {
  return estimate.declaredImpactBasisPoints;
}

/** True iff a liquidity estimate is fresh at the instant (inclusive bound). */
export function isLiquidityEstimateFresh(estimate: LiquidityEstimate, atMs: number): boolean {
  if (typeof atMs !== "number" || !Number.isSafeInteger(atMs) || atMs < 0) {
    throw fail("the evaluation instant must be a non-negative integer (no ambient clock)");
  }
  return atMs - epochMillisFromIso(estimate.freshness.asOf) <= estimate.freshness.maxAgeSeconds * 1000;
}
