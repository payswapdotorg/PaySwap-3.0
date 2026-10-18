/**
 * @payswap/route-compiler — the fee/risk/health dimension vocabularies
 * (P5-W1).
 *
 * PORT of the old best-execution outcome-dimensions block (MMI-19): the
 * typed DECLARATIONS every scored quote carries. Dimensions are NOT a
 * weighted vector — every dimension reduces to an explicit numeraire
 * value through the policy's conversion table (see scoring.ts); the
 * vocabularies here are the closed, frozen declaration languages.
 */

import { ValidationError } from "./errors.ts";
import { requireBoundedString, requireObject, requireStringArray, LIMITS, type Fail } from "./canonical.ts";

const fail: Fail = (message: string) => new ValidationError(message);

/** The closed fee-kind vocabulary (frozen). */
export const QUOTE_FEE_KINDS = Object.freeze([
  "VENUE_FEE",
  "PROTOCOL_FEE",
  "INTEGRATOR_FEE",
  "SOLVER_FEE",
  "NETWORK_FEE",
  "PROVIDER_DEFINED",
] as const);

export type QuoteFeeKind = (typeof QUOTE_FEE_KINDS)[number];

/** One declared quote fee (asset-denominated + description). */
export interface QuoteFee {
  readonly feeKind: QuoteFeeKind;
  readonly asset: { readonly chain: string; readonly assetId: string; readonly symbol: string };
  readonly minorUnits: string;
  readonly description: string;
}

/** True iff the value is a member of the closed fee vocabulary. */
export function isQuoteFeeKind(value: unknown): value is QuoteFeeKind {
  return typeof value === "string" && (QUOTE_FEE_KINDS as readonly unknown[]).includes(value);
}

/** Fail-closed validation of one declared fee. */
export function validateQuoteFee(candidate: unknown): QuoteFee {
  const record = requireObject(candidate, "a QuoteFee", fail);
  const feeKind = record["feeKind"];
  if (!isQuoteFeeKind(feeKind)) {
    throw fail(`fee.feeKind must be one of the closed vocabulary [${QUOTE_FEE_KINDS.join(", ")}]`);
  }
  const asset = validateAsset(record["asset"]);
  const minorUnits = record["minorUnits"];
  if (typeof minorUnits !== "string" || !/^(0|[1-9][0-9]*)$/.test(minorUnits)) {
    throw fail("fee.minorUnits must be a canonical integer string (INV-F01)");
  }
  const description = requireBoundedString(record["description"], "fee.description", LIMITS.descriptionMaxLength, fail);
  return Object.freeze({ feeKind, asset, minorUnits, description });
}

function validateAsset(candidate: unknown): { chain: string; assetId: string; symbol: string } {
  const record = requireObject(candidate, "an asset identity", fail);
  return {
    chain: requireBoundedString(record["chain"], "asset.chain", LIMITS.refMaxLength, fail),
    assetId: requireBoundedString(record["assetId"], "asset.assetId", LIMITS.refMaxLength, fail),
    symbol: requireBoundedString(record["symbol"], "asset.symbol", 3, fail),
  };
}

/** The closed risk-class vocabulary (frozen; LOW is best). */
export const RISK_CLASSES = Object.freeze(["LOW", "MODERATE", "ELEVATED", "HIGH"] as const);

export type RiskClass = (typeof RISK_CLASSES)[number];

/** The risk-class rank (LOW = 0 .. HIGH = 3; the tie-breaker ordering). */
export function riskClassRank(riskClass: RiskClass): number {
  const index = (RISK_CLASSES as readonly string[]).indexOf(riskClass);
  if (index < 0) {
    throw new ValidationError(`risk class '${riskClass}' is not a member of the closed vocabulary`);
  }
  return index;
}

/** True iff the value is a member of the closed risk vocabulary. */
export function isRiskClass(value: unknown): value is RiskClass {
  return typeof value === "string" && (RISK_CLASSES as readonly unknown[]).includes(value);
}

/** The retry-policy vocabulary (the failure-risk disclosure's own law). */
export const RETRY_POLICIES = Object.freeze([
  "SAFE_TO_RETRY",
  "REQUIRES_RECONCILIATION",
  "NOT_RETRYABLE",
] as const);

export type RetryPolicy = (typeof RETRY_POLICIES)[number];

/** The declared failure-risk dimension (never guessed). */
export interface FailureRiskDisclosure {
  readonly riskClass: RiskClass;
  readonly retryPolicy: RetryPolicy;
  readonly description: string;
}

/** Fail-closed validation of the failure-risk disclosure. */
export function validateFailureRiskDisclosure(candidate: unknown): FailureRiskDisclosure {
  const record = requireObject(candidate, "a FailureRiskDisclosure", fail);
  const riskClass = record["riskClass"];
  if (!isRiskClass(riskClass)) {
    throw fail("risk.riskClass must be a member of the closed risk vocabulary");
  }
  const retryPolicy = record["retryPolicy"];
  if (typeof retryPolicy !== "string" || !(RETRY_POLICIES as readonly unknown[]).includes(retryPolicy)) {
    throw fail("risk.retryPolicy must be a member of the closed retry vocabulary");
  }
  const description = requireBoundedString(record["description"], "risk.description", LIMITS.descriptionMaxLength, fail);
  return Object.freeze({ riskClass, retryPolicy: retryPolicy as "SAFE_TO_RETRY" | "REQUIRES_RECONCILIATION" | "NOT_RETRYABLE", description }) as FailureRiskDisclosure;
}

/** The closed venue-health vocabulary (frozen; an observation, not truth). */
export const VENUE_HEALTH_STATUSES = Object.freeze([
  "HEALTHY",
  "DEGRADED",
  "UNHEALTHY",
  "UNKNOWN",
] as const);

export type VenueHealthStatus = (typeof VENUE_HEALTH_STATUSES)[number];

/** True iff the value is a member of the closed health vocabulary. */
export function isVenueHealthStatus(value: unknown): value is VenueHealthStatus {
  return typeof value === "string" && (VENUE_HEALTH_STATUSES as readonly unknown[]).includes(value);
}

/** A venue health observation (freshness-bounded, provenance-carried). */
export interface HealthObservation {
  readonly status: VenueHealthStatus;
  readonly observedAtMs: number;
  readonly maxAgeMs: number;
  readonly provenance: {
    readonly providerName: string;
    readonly source: string;
    readonly capturedAtMs: number;
    readonly evidenceRefs: readonly string[];
  };
}

/** Fail-closed validation of a health observation. */
export function validateHealthObservation(candidate: unknown): HealthObservation {
  const record = requireObject(candidate, "a HealthObservation", fail);
  const status = record["status"];
  if (!isVenueHealthStatus(status)) {
    throw fail("health.status must be a member of the closed health vocabulary");
  }
  const observedAtMs = record["observedAtMs"];
  if (typeof observedAtMs !== "number" || !Number.isSafeInteger(observedAtMs) || observedAtMs < 0) {
    throw fail("health.observedAtMs must be a non-negative integer");
  }
  const maxAgeMs = record["maxAgeMs"];
  if (typeof maxAgeMs !== "number" || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1) {
    throw fail("health.maxAgeMs must be a positive integer (a boundless health record is not evidence)");
  }
  const provenance = requireObject(record["provenance"], "health.provenance", fail);
  const providerName = requireBoundedString(provenance["providerName"], "health.provenance.providerName", LIMITS.refMaxLength, fail);
  const source = requireBoundedString(provenance["source"], "health.provenance.source", LIMITS.refMaxLength, fail);
  const capturedAtMs = provenance["capturedAtMs"];
  if (typeof capturedAtMs !== "number" || !Number.isSafeInteger(capturedAtMs) || capturedAtMs < 0) {
    throw fail("health.provenance.capturedAtMs must be a non-negative integer");
  }
  const evidenceRefs = requireStringArray(provenance["evidenceRefs"], "health.provenance.evidenceRefs", fail);
  return Object.freeze({
    status,
    observedAtMs,
    maxAgeMs,
    provenance: Object.freeze({ providerName, source, capturedAtMs, evidenceRefs }),
  });
}

/**
 * Health staleness (the inclusive bound law, same as quotes): stale iff
 * (at - observedAtMs) > maxAgeMs.
 */
export function isHealthObservationStale(observation: HealthObservation, at: number): boolean {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw fail("the evaluation instant must be a non-negative integer (no ambient clock)");
  }
  return at - observation.observedAtMs > observation.maxAgeMs;
}
