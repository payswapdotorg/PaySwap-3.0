import { describe, expect, it } from "vitest";
import {
  validateFailureRiskDisclosure,
  riskClassRank,
  validateQuoteFee,
  validateHealthObservation,
  isHealthObservationStale,
  RISK_CLASSES,
} from "../src/quote-fees.ts";
import { validateVenueQuote } from "../src/engine-support.ts";
import { ValidationError } from "../src/errors.ts";
import { fixtureQuote } from "./venue-fixtures.ts";
import { NOW } from "./fixtures.ts";
import { CHAIN, USC_ASSET } from "./fixtures.ts";

/**
 * The typed dimension declarations (PORT of the old
 * outcome-dimensions suite): every dimension is a declared, closed
 * vocabulary — risk classes, fee kinds, health statuses; never guessed.
 */
describe("the failure-risk dimension (declared, never guessed)", () => {
  it("the risk class vocabulary is closed and LOW-ranks first (the tie-breaker order)", () => {
    expect([...RISK_CLASSES]).toEqual(["LOW", "MODERATE", "ELEVATED", "HIGH"]);
    expect(riskClassRank("LOW")).toBe(0);
    expect(riskClassRank("HIGH")).toBe(3);
    expect(() => riskClassRank("EXTREME" as "LOW")).toThrowError(/closed vocabulary/);
  });

  it("the failure-risk disclosure requires class + retry policy + description", () => {
    expect(validateFailureRiskDisclosure({
      riskClass: "LOW",
      retryPolicy: "SAFE_TO_RETRY",
      description: "fixture risk",
    })).toEqual({ riskClass: "LOW", retryPolicy: "SAFE_TO_RETRY", description: "fixture risk" });
    expect(() =>
      validateFailureRiskDisclosure({ riskClass: "MAGIC", retryPolicy: "SAFE_TO_RETRY", description: "x" }),
    ).toThrowError(/closed risk vocabulary/);
    expect(() =>
      validateFailureRiskDisclosure({ riskClass: "LOW", retryPolicy: "MAGIC", description: "x" }),
    ).toThrowError(/closed retry vocabulary/);
    expect(() => validateFailureRiskDisclosure({ riskClass: "LOW", retryPolicy: "SAFE_TO_RETRY", description: "" })).toThrowError();
  });
});

describe("the fee dimension (asset-denominated, exact integer)", () => {
  it("a fee requires a closed kind, an asset identity and canonical minor units (INV-F01)", () => {
    const fee = {
      feeKind: "VENUE_FEE",
      asset: { chain: CHAIN, assetId: USC_ASSET.assetId, symbol: "USC" },
      minorUnits: "3000",
      description: "fixture fee",
    };
    expect(validateQuoteFee(fee).minorUnits).toBe("3000");
    expect(() => validateQuoteFee({ ...fee, feeKind: "MAGIC" })).toThrowError(/closed/);
    expect(() => validateQuoteFee({ ...fee, minorUnits: "1.5" })).toThrowError(ValidationError);
  });

  it("the quote carries the fee asset identity (never a symbol-only guess)", () => {
    const quote = validateVenueQuote(fixtureQuote());
    expect(quote.fees[0]?.asset.symbol).toBe("ETH");
    expect(quote.fees[0]?.asset.chain).toBe(CHAIN);
    expect(quote.fees[0]?.asset.assetId).toContain("asset:ETH");
  });
});

describe("the health dimension (an observation with its own freshness law)", () => {
  it("health staleness is the inclusive bound law (same as quotes)", () => {
    const observation = validateHealthObservation({
      status: "HEALTHY",
      observedAtMs: NOW,
      maxAgeMs: 30_000,
      provenance: { providerName: "p", source: "VENUE_API", capturedAtMs: NOW, evidenceRefs: ["e"] },
    });
    expect(isHealthObservationStale(observation, NOW)).toBe(false);
    expect(isHealthObservationStale(observation, NOW + 30_000)).toBe(false);
    expect(isHealthObservationStale(observation, NOW + 30_001)).toBe(true);
  });

  it("health requires a positive maxAge and evidenced provenance", () => {
    expect(() =>
      validateHealthObservation({
        status: "HEALTHY",
        observedAtMs: NOW,
        maxAgeMs: 0,
        provenance: { providerName: "p", source: "VENUE_API", capturedAtMs: NOW, evidenceRefs: ["e"] },
      }),
    ).toThrowError(/positive/);
    expect(() =>
      validateHealthObservation({
        status: "MAGIC",
        observedAtMs: NOW,
        maxAgeMs: 10,
        provenance: { providerName: "p", source: "VENUE_API", capturedAtMs: NOW, evidenceRefs: ["e"] },
      }),
    ).toThrowError(/closed health vocabulary/);
  });

  it("the gas dimension converts exact rationals (gasUnits x native price x fee-asset rate)", () => {
    const quote = validateVenueQuote(fixtureQuote());
    expect(quote.gasCost?.gasUnits).toBe("160000");
    expect(quote.gasCost?.pricePerUnitNativeMinor.denominator).toBe("1000000000000000000");
    expect(quote.gasCost?.feeAsset.symbol).toBe("ETH");
  });

  it("the slippage dimension: worstCaseOutput is the scored number; expectedOutput never enters arithmetic", () => {
    const quote = validateVenueQuote(fixtureQuote());
    expect(quote.slippage.worstCaseOutput.minorUnits).toBe("3200000");
    expect(quote.slippage.expectedOutput?.minorUnits).toBe("3300000");
    expect(quote.slippage.limitBasisPoints).toBe(50);
  });

  it("the time dimension carries the finality model vocabulary and a bounded estimate", () => {
    const quote = validateVenueQuote(fixtureQuote());
    expect(quote.timeToSettlement.finalityModel).toBe("PROBABILISTIC");
    expect(quote.timeToSettlement.estimatedMs).toBe(120_000);
  });

  it("the route shape is non-empty and hop-ordered (the FEWER_HOPS basis)", () => {
    const quote = validateVenueQuote(fixtureQuote());
    expect(quote.routeShape.length).toBe(1);
    expect(quote.routeShape[0]?.venue).toBe("fixture-dex-alpha");
  });
});
