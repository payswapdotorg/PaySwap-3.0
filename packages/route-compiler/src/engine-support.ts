/**
 * @payswap/route-compiler — engine support: the quote validation law and
 * the shared trace types (P5-W1).
 *
 * PORT of the old best-execution venue-port quote validation (MMI-19),
 * split out of the engine so the decision machine stays under the file
 * law. `validateVenueQuote` is the fail-closed validation of a venue
 * quote — AGGREGATING every violation into one error (never
 * first-fail) — with the deterministic coupling rules: assets live on
 * the quote's chain, the input amount is denominated in the input
 * asset's symbol, the worst-case output in the output asset's symbol,
 * the route shape is non-empty, freshness/provenance/observer are
 * mandatory (an observation without provenance is not evidence).
 */

import { ValidationError } from "./errors.ts";
import { deepFreeze, requireBoundedString, requireObject, LIMITS, type Fail } from "./canonical.ts";
import { validateAmountSpec } from "./amount.ts";
import {
  validateQuoteFreshness,
  validateQuoteProvenance,
  validateQuoteObserver,
  validateSlippageDisclosure,
  validateTimeToSettlement,
  isQuoteSemantics,
  isOptimizationOrigin,
  type QuoteFreshness,
  type QuoteProvenance,
  type QuoteObserver,
  type VenueQuote,
  type VenueQuoteOutcome,
} from "./quote.ts";
import {
  isQuoteFeeKind,
  isRiskClass,
  isVenueHealthStatus,
  validateFailureRiskDisclosure,
  type HealthObservation,
} from "./quote-fees.ts";

const fail: Fail = (message: string) => new ValidationError(message);

/** The health observation shape as the engine records it (trace type). */
export type HealthObservationLike = HealthObservation;

/** The venue quote-stage provenance part as the chain records it. */
export interface VenueQuoteProvenanceLike {
  readonly venueId: string;
  readonly outcome: "QUOTED" | "UNAVAILABLE" | "OUTCOME_UNKNOWN";
  readonly quoteId?: string;
  readonly quoteSemantics?: string;
  readonly optimizationOrigin?: string;
  readonly freshness?: QuoteFreshness;
  readonly provenance?: QuoteProvenance;
  readonly reason?: string;
}

/**
 * Fail-closed validation of a venue quote (aggregates every violation
 * into one ValidationError with the complete list — never first-fail).
 */
export function validateVenueQuote(candidate: unknown): VenueQuote {
  const record = requireObject(candidate, "a VenueQuote", fail);
  const errors: string[] = [];

  const quoteId = boundedOr(record["quoteId"], "quoteId", errors);
  const venueId = boundedOr(record["venueId"], "venueId", errors);
  const requestId = boundedOr(record["requestId"], "requestId", errors);
  const chain = boundedOr(record["chain"], "chain", errors);
  const swapKind = record["swapKind"];
  if (swapKind !== "EXACT_INPUT" && swapKind !== "EXACT_OUTPUT") {
    errors.push("quote.swapKind must be EXACT_INPUT or EXACT_OUTPUT");
  }
  const inputAsset = validateAssetPart(record["inputAsset"], "inputAsset", errors);
  const outputAsset = validateAssetPart(record["outputAsset"], "outputAsset", errors);
  let inputAmount: { currency: string; minorUnits: string } | undefined;
  try {
    inputAmount = validateAmountSpec(record["inputAmount"], "quote.inputAmount");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "quote.inputAmount is malformed");
  }
  const quoteSemantics = record["quoteSemantics"];
  if (!isQuoteSemantics(quoteSemantics)) {
    errors.push("quote.quoteSemantics must be INDICATIVE or EXECUTABLE");
  }
  const feesRaw = record["fees"];
  const fees: {
    feeKind: string;
    asset: { chain: string; assetId: string; symbol: string };
    minorUnits: string;
    description: string;
  }[] = [];
  if (!Array.isArray(feesRaw)) {
    errors.push("quote.fees must be an array (possibly empty)");
  } else {
    for (const fee of feesRaw) {
      const feeRecord = requireObject(fee, "a quote fee", fail);
      const feeKind = feeRecord["feeKind"];
      if (!isQuoteFeeKind(feeKind)) {
        errors.push("fee.feeKind must be a member of the closed fee vocabulary");
        continue;
      }
      const asset = validateAssetPart(feeRecord["asset"], "fee.asset", errors);
      const minorUnits = feeRecord["minorUnits"];
      if (typeof minorUnits !== "string" || !/^(0|[1-9][0-9]*)$/.test(minorUnits)) {
        errors.push("fee.minorUnits must be a canonical integer string (INV-F01)");
        continue;
      }
      const description = boundedOr(feeRecord["description"], "fee.description", errors);
      if (asset !== undefined && description !== undefined) {
        fees.push(Object.freeze({ feeKind, asset, minorUnits, description }));
      }
    }
  }
  let slippage: VenueQuote["slippage"] | undefined;
  const slippageRaw = record["slippage"];
  if (slippageRaw === undefined) {
    errors.push("quote.slippage is mandatory (the worst-case output is the scored number)");
  } else {
    try {
      slippage = validateSlippageOrNull(slippageRaw, outputAsset?.symbol);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "quote.slippage is malformed");
    }
  }
  const failureRiskRaw = record["failureRisk"];
  let failureRisk: ReturnType<typeof validateFailureRiskDisclosure> | undefined;
  if (failureRiskRaw === undefined) {
    errors.push("quote.failureRisk is mandatory (a declared property, never guessed)");
  } else {
    try {
      failureRisk = validateFailureRiskDisclosure(failureRiskRaw);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "quote.failureRisk is malformed");
    }
  }
  let timeToSettlement: ReturnType<typeof validateTimeToSettlement> | undefined;
  const timeRaw = record["timeToSettlement"];
  if (timeRaw === undefined) {
    errors.push("quote.timeToSettlement is mandatory");
  } else {
    try {
      timeToSettlement = validateTimeToSettlement(timeRaw, "quote.timeToSettlement");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "quote.timeToSettlement is malformed");
    }
  }
  const routeShapeRaw = record["routeShape"];
  const routeShape: { venue: string; chain: string; description: string }[] = [];
  if (!Array.isArray(routeShapeRaw) || routeShapeRaw.length === 0) {
    errors.push("quote.routeShape must be a non-empty array");
  } else {
    for (const hop of routeShapeRaw) {
      const hopRecord = requireObject(hop, "a route hop", fail);
      routeShape.push(
        Object.freeze({
          venue: boundedOr(hopRecord["venue"], "hop.venue", errors) ?? "",
          chain: boundedOr(hopRecord["chain"], "hop.chain", errors) ?? "",
          description: boundedOr(hopRecord["description"], "hop.description", errors) ?? "",
        }),
      );
    }
  }
  const optimizationOrigin = record["optimizationOrigin"];
  if (!isOptimizationOrigin(optimizationOrigin)) {
    errors.push("quote.optimizationOrigin must be PROVIDER_NATIVE or COMPOSED");
  }
  let freshness: QuoteFreshness | undefined;
  try {
    freshness = validateQuoteFreshness(record["freshness"], "quote.freshness");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "quote.freshness is malformed");
  }
  let provenance: QuoteProvenance | undefined;
  try {
    provenance = validateQuoteProvenance(record["provenance"], "quote.provenance");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "quote.provenance is malformed");
  }
  let observer: QuoteObserver | undefined;
  try {
    observer = validateQuoteObserver(record["observer"], "quote.observer");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "quote.observer is malformed");
  }

  if (
    inputAsset !== undefined &&
    inputAmount !== undefined &&
    inputAmount.currency !== inputAsset.symbol
  ) {
    errors.push("quote.inputAmount must be denominated in the input asset's symbol");
  }
  if (inputAsset !== undefined && outputAsset !== undefined && inputAsset.chain !== outputAsset.chain) {
    errors.push("the quote's assets must live on the quote's chain (ONE quote = ONE chain)");
  }

  if (errors.length > 0) {
    throw new ValidationError(
      `the venue quote failed validation (every violation listed): ${errors.join("; ")}`,
      { errors },
    );
  }

  const gasCostRaw = record["gasCost"];
  const gasCost =
    gasCostRaw === undefined
      ? undefined
      : deepFreeze({
          gasUnits: (gasCostRaw as Record<string, unknown>)["gasUnits"] as string,
          pricePerUnitNativeMinor: (gasCostRaw as Record<string, unknown>)[
            "pricePerUnitNativeMinor"
          ] as { numerator: string; denominator: string },
          feeAsset: validateAssetPart(
            (gasCostRaw as Record<string, unknown>)["feeAsset"],
            "gas.feeAsset",
            errors,
          ) as NonNullable<ReturnType<typeof validateAssetPart>>,
        });

  return deepFreeze({
    quoteId: quoteId as string,
    venueId: venueId as string,
    requestId: requestId as string,
    chain: chain as string,
    swapKind: swapKind as "EXACT_INPUT" | "EXACT_OUTPUT",
    inputAsset: inputAsset as NonNullable<ReturnType<typeof validateAssetPart>>,
    outputAsset: outputAsset as NonNullable<ReturnType<typeof validateAssetPart>>,
    inputAmount: inputAmount as { currency: string; minorUnits: string },
    quoteSemantics: quoteSemantics as "INDICATIVE" | "EXECUTABLE",
    fees: Object.freeze(fees) as unknown as VenueQuote["fees"],
    ...(gasCost !== undefined ? { gasCost } : {}),
    slippage: slippage as NonNullable<ReturnType<typeof validateSlippageOrNull>> as VenueQuote["slippage"],
    failureRisk: failureRisk as ReturnType<typeof validateFailureRiskDisclosure>,
    timeToSettlement: timeToSettlement as ReturnType<typeof validateTimeToSettlement>,
    routeShape: Object.freeze(routeShape),
    optimizationOrigin: optimizationOrigin as "PROVIDER_NATIVE" | "COMPOSED",
    freshness: freshness as QuoteFreshness,
    provenance: provenance as QuoteProvenance,
    observer: observer as QuoteObserver,
  });
}

/** Fail-closed validation of a quote OUTCOME (never a fabricated quote). */
export function validateVenueQuoteOutcome(candidate: unknown): VenueQuoteOutcome {
  const record = requireObject(candidate, "a VenueQuoteOutcome", fail);
  const kind = record["kind"];
  switch (kind) {
    case "QUOTE":
      return deepFreeze({ kind, quote: validateVenueQuote(record["quote"]) });
    case "UNAVAILABLE":
    case "OUTCOME_UNKNOWN": {
      const reason = requireBoundedString(record["reason"], "outcome.reason", LIMITS.descriptionMaxLength, fail);
      return deepFreeze({ kind, reason });
    }
    default:
      throw fail("a quote outcome must be QUOTE, UNAVAILABLE or OUTCOME_UNKNOWN (INV-X01: UNKNOWN is never converted)");
  }
}

/** The health-observation helpers re-exported for the engine stages. */
export { isHealthObservationStale, isRiskClass, isVenueHealthStatus, riskClassRank } from "./quote-fees.ts";

function boundedOr(value: unknown, subject: string, errors: string[]): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`quote.${subject} must be a non-empty string`);
    return undefined;
  }
  return value;
}

function validateAssetPart(
  candidate: unknown,
  subject: string,
  errors: string[],
): { chain: string; assetId: string; symbol: string } | undefined {
  if (typeof candidate !== "object" || candidate === null) {
    errors.push(`quote.${subject} must be an asset identity object`);
    return undefined;
  }
  const record = candidate as Record<string, unknown>;
  if (typeof record["chain"] !== "string" || typeof record["assetId"] !== "string" || typeof record["symbol"] !== "string") {
    errors.push(`quote.${subject} must carry chain, assetId and symbol strings`);
    return undefined;
  }
  return { chain: record["chain"], assetId: record["assetId"], symbol: record["symbol"] };
}

function validateSlippageOrNull(
  candidate: unknown,
  outputSymbol: string | undefined,
): VenueQuote["slippage"] {
  if (outputSymbol === undefined) {
    throw fail("the slippage cannot be validated before the output asset is known");
  }
  return validateSlippageDisclosure(candidate, "quote.slippage", outputSymbol);
}
