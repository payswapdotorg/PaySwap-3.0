/**
 * @payswap/route-compiler — the quote observation law (P5-W1).
 *
 * PORT of the old best-execution quote-observation block (MMI-19): a
 * quote is an OBSERVATION, never custody, never finality (INV-C09/rule
 * 21), and the credible-pricing requirement of the comparability gate is
 * judged through THIS module's laws:
 *
 * - FRESHNESS is mandatory and bounded: {asOfMs, maxAgeMs} with maxAge
 *   POSITIVE (a quote without a bound is not evidence); the staleness
 *   law is INCLUSIVE (fresh at exactly maxAge, stale one ms later);
 * - PROVENANCE is mandatory with NON-EMPTY evidenceRefs (INV-E02);
 * - OBSERVER identity is mandatory;
 * - QUOTE SEMANTICS is the pinned vocabulary (INDICATIVE vs EXECUTABLE —
 *   an INDICATIVE quote is never credible pricing for comparability);
 * - the quote OUTCOME vocabulary carries UNKNOWN (never converted to
 *   failure — INV-X01).
 */

import { ValidationError } from "./errors.ts";
import { deepFreeze, requireBoundedString, requireNonNegativeSafeInteger, requireNonEmptyStringArray, requireObject, LIMITS, type Fail } from "./canonical.ts";
import { PINNED_QUOTE_SEMANTICS, type PinnedQuoteSemantics } from "./pins/onchain.ts";
import type { PinnedAssetIdentity } from "./pins/onchain.ts";
import { validateAmountSpec, type AmountSpec } from "./amount.ts";

const fail: Fail = (message: string) => new ValidationError(message);

/** The quote source vocabulary (how the quote was observed). */
export const QUOTE_SOURCE_KINDS = Object.freeze([
  "VENUE_API",
  "RFQ",
  "SOLVER",
  "INDEXED_POOL_STATE",
  "OPERATOR",
  "INTERNAL",
] as const);

export type QuoteSourceKind = (typeof QUOTE_SOURCE_KINDS)[number];

/** The quote observer vocabulary (who observed the quote). */
export const QUOTE_OBSERVER_KINDS = Object.freeze([
  "VENUE_NODE",
  "VENUE_API",
  "INDEXER",
  "RPC_PROVIDER",
  "OPERATOR",
  "OTHER",
] as const);

export type QuoteObserverKind = (typeof QUOTE_OBSERVER_KINDS)[number];

/** Quote freshness: bounded observation window (mandatory). */
export interface QuoteFreshness {
  readonly asOfMs: number;
  /** POSITIVE: a quote without a bound is not evidence. */
  readonly maxAgeMs: number;
}

/** Quote provenance: mandatory, evidenced (INV-E02). */
export interface QuoteProvenance {
  readonly providerName: string;
  readonly source: QuoteSourceKind;
  readonly capturedAtMs: number;
  readonly evidenceRefs: readonly string[];
}

/** Quote observer identity: mandatory. */
export interface QuoteObserver {
  readonly observerId: string;
  readonly observerKind: QuoteObserverKind;
}

/** Fail-closed validation of quote freshness (inclusive bound law). */
export function validateQuoteFreshness(candidate: unknown, subject: string): QuoteFreshness {
  const record = requireObject(candidate, `${subject} (QuoteFreshness)`, fail);
  const asOfMs = requireNonNegativeSafeInteger(record["asOfMs"], `${subject}.asOfMs`, fail);
  const maxAgeMs = record["maxAgeMs"];
  if (typeof maxAgeMs !== "number" || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1) {
    throw fail(`${subject}.maxAgeMs must be a positive integer (a boundless quote is not evidence)`);
  }
  return Object.freeze({ asOfMs, maxAgeMs });
}

/**
 * The quote staleness law: stale iff (at - asOfMs) > maxAgeMs — fresh at
 * exactly maxAge, stale one ms later. `at` must be a non-negative
 * integer; there is no ambient clock.
 */
export function isQuoteStale(freshness: QuoteFreshness, at: number): boolean {
  if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0) {
    throw fail("the evaluation instant must be a non-negative integer (no ambient clock)");
  }
  return at - freshness.asOfMs > freshness.maxAgeMs;
}

/** Fail-closed validation of quote provenance. */
export function validateQuoteProvenance(candidate: unknown, subject: string): QuoteProvenance {
  const record = requireObject(candidate, `${subject} (QuoteProvenance)`, fail);
  const providerName = requireBoundedString(record["providerName"], `${subject}.providerName`, LIMITS.refMaxLength, fail);
  const source = record["source"];
  if (typeof source !== "string" || !(QUOTE_SOURCE_KINDS as readonly unknown[]).includes(source)) {
    throw fail(`${subject}.source must be one of the closed quote-source vocabulary`);
  }
  const capturedAtMs = requireNonNegativeSafeInteger(record["capturedAtMs"], `${subject}.capturedAtMs`, fail);
  const evidenceRefs = requireNonEmptyStringArray(record["evidenceRefs"], `${subject}.evidenceRefs`, fail);
  return Object.freeze({ providerName, source, capturedAtMs, evidenceRefs }) as QuoteProvenance;
}

/** Fail-closed validation of the quote observer. */
export function validateQuoteObserver(candidate: unknown, subject: string): QuoteObserver {
  const record = requireObject(candidate, `${subject} (QuoteObserver)`, fail);
  const observerId = requireBoundedString(record["observerId"], `${subject}.observerId`, LIMITS.refMaxLength, fail);
  const observerKind = record["observerKind"];
  if (typeof observerKind !== "string" || !(QUOTE_OBSERVER_KINDS as readonly unknown[]).includes(observerKind)) {
    throw fail(`${subject}.observerKind must be one of the closed observer vocabulary`);
  }
  return Object.freeze({ observerId, observerKind }) as QuoteObserver;
}

/** The quote's time-to-settlement disclosure (advisory estimate + finality model). */
export interface TimeToSettlementDisclosure {
  readonly estimatedMs: number;
  readonly finalityModel: "PROBABILISTIC" | "DETERMINISTIC" | "INSTANT" | "HYBRID";
  readonly description: string;
}

/** Fail-closed validation of the time-to-settlement disclosure. */
export function validateTimeToSettlement(
  candidate: unknown,
  subject: string,
): TimeToSettlementDisclosure {
  const record = requireObject(candidate, `${subject} (TimeToSettlementDisclosure)`, fail);
  const estimatedMs = requireNonNegativeSafeInteger(record["estimatedMs"], `${subject}.estimatedMs`, fail);
  const finalityModel = record["finalityModel"];
  if (
    typeof finalityModel !== "string" ||
    !["PROBABILISTIC", "DETERMINISTIC", "INSTANT", "HYBRID"].includes(finalityModel)
  ) {
    throw fail(`${subject}.finalityModel must be a member of the pinned finality vocabulary`);
  }
  const description = requireBoundedString(record["description"], `${subject}.description`, LIMITS.descriptionMaxLength, fail);
  return Object.freeze({ estimatedMs, finalityModel, description }) as TimeToSettlementDisclosure;
}

/** The quote's slippage disclosure (the executable number is worstCaseOutput). */
export interface SlippageDisclosure {
  readonly protection: "DECLARED_LIMIT" | "PROVIDER_DEFINED";
  /** GUARANTEED minimum received — the number the evaluation uses. */
  readonly worstCaseOutput: AmountSpec;
  readonly limitBasisPoints?: number;
  /** Optional mid estimate — CONTEXT ONLY, never enters arithmetic. */
  readonly expectedOutput?: AmountSpec;
}

/** Fail-closed validation of the slippage disclosure. */
export function validateSlippageDisclosure(
  candidate: unknown,
  subject: string,
  outputSymbol: string,
): SlippageDisclosure {
  const record = requireObject(candidate, `${subject} (SlippageDisclosure)`, fail);
  const protection = record["protection"];
  if (
    typeof protection !== "string" ||
    !(PINNED_QUOTE_SEMANTICS.length >= 0 && ["DECLARED_LIMIT", "PROVIDER_DEFINED"].includes(protection))
  ) {
    throw fail(`${subject}.protection must be DECLARED_LIMIT or PROVIDER_DEFINED`);
  }
  const worstCaseOutput = validateAmountSpec(record["worstCaseOutput"], `${subject}.worstCaseOutput`);
  if (worstCaseOutput.currency !== outputSymbol) {
    throw fail(`${subject}.worstCaseOutput must be denominated in the quote's output asset`);
  }
  const limitBasisPoints = record["limitBasisPoints"];
  if (limitBasisPoints !== undefined) {
    if (typeof limitBasisPoints !== "number" || !Number.isSafeInteger(limitBasisPoints) || limitBasisPoints < 0 || limitBasisPoints > 10000) {
      throw fail(`${subject}.limitBasisPoints must be an integer in [0, 10000] when present`);
    }
  }
  const expectedOutput = record["expectedOutput"];
  return deepFreeze({
    protection: protection as "DECLARED_LIMIT" | "PROVIDER_DEFINED",
    worstCaseOutput,
    ...(limitBasisPoints !== undefined ? { limitBasisPoints } : {}),
    ...(expectedOutput !== undefined
      ? { expectedOutput: validateAmountSpec(expectedOutput, `${subject}.expectedOutput`) }
      : {}),
  }) as SlippageDisclosure;
}

/** The quote's optimization origin (INV-C08: never consulted by scoring). */
export const OPTIMIZATION_ORIGINS = Object.freeze(["PROVIDER_NATIVE", "COMPOSED"] as const);

export type OptimizationOrigin = (typeof OPTIMIZATION_ORIGINS)[number];

/** True iff the value is a member of the origin vocabulary. */
export function isOptimizationOrigin(value: unknown): value is OptimizationOrigin {
  return typeof value === "string" && (OPTIMIZATION_ORIGINS as readonly unknown[]).includes(value);
}

/** The quote semantics vocabulary (locally named pin). */
export type QuoteSemantics = PinnedQuoteSemantics;

/** True iff the value is a member of the pinned semantics vocabulary. */
export function isQuoteSemantics(value: unknown): value is QuoteSemantics {
  return typeof value === "string" && (PINNED_QUOTE_SEMANTICS as readonly unknown[]).includes(value);
}

/** The venue quote: an observation carrying every scored dimension. */
export interface VenueQuote {
  readonly quoteId: string;
  readonly venueId: string;
  readonly requestId: string;
  readonly chain: string;
  readonly swapKind: "EXACT_INPUT" | "EXACT_OUTPUT";
  readonly inputAsset: PinnedAssetIdentity;
  readonly outputAsset: PinnedAssetIdentity;
  readonly inputAmount: AmountSpec;
  readonly quoteSemantics: QuoteSemantics;
  readonly fees: readonly {
    readonly feeKind: string;
    readonly asset: PinnedAssetIdentity;
    readonly minorUnits: string;
    readonly description: string;
  }[];
  readonly gasCost?: {
    readonly gasUnits: string;
    readonly pricePerUnitNativeMinor: { readonly numerator: string; readonly denominator: string };
    readonly feeAsset: PinnedAssetIdentity;
  };
  readonly slippage: SlippageDisclosure;
  readonly failureRisk: {
    readonly riskClass: "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
    readonly retryPolicy: "SAFE_TO_RETRY" | "REQUIRES_RECONCILIATION" | "NOT_RETRYABLE";
    readonly description: string;
  };
  readonly timeToSettlement: TimeToSettlementDisclosure;
  readonly routeShape: readonly { readonly venue: string; readonly chain: string; readonly description: string }[];
  readonly optimizationOrigin: OptimizationOrigin;
  readonly freshness: QuoteFreshness;
  readonly provenance: QuoteProvenance;
  readonly observer: QuoteObserver;
}

/**
 * The quote outcome (UNKNOWN-capable, never a fabricated quote):
 * QUOTE | UNAVAILABLE | OUTCOME_UNKNOWN with a mandatory reason.
 */
export type VenueQuoteOutcome =
  | { readonly kind: "QUOTE"; readonly quote: VenueQuote }
  | { readonly kind: "UNAVAILABLE"; readonly reason: string }
  | { readonly kind: "OUTCOME_UNKNOWN"; readonly reason: string };
