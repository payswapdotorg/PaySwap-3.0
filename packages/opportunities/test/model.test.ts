import { describe, expect, it } from "vitest";
import {
  InvalidOpportunityError,
  OPPORTUNITY_FAMILIES,
  RAIL_KINDS,
  opportunityId,
  validateFinancialOpportunity,
} from "../src/index.ts";
import { discoverOpportunity } from "../src/index.ts";
import {
  ONCHAIN_RAIL,
  healthyLiquidityObservation,
  healthyOtherObservation,
  lineageExtendedLiquidityObservation,
  staleSupportingOracleObservation,
  supportingPoolTelemetryObservation,
} from "./fixtures-catalog.ts";
import { NOW, discoveryCatalog } from "./fixtures-catalog.ts";

/**
 * The FinancialOpportunity model law (P6-W2; PORTED/ADAPTED from the old
 * model.test.ts 20 titled sites, plus the versioned-lineage coherence
 * sites the P6-W2 hard law 1 adds).
 */
describe("the FinancialOpportunity model (typed first-class fields + lineage)", () => {
  it("the six policy-approved families are the frozen family vocabulary", () => {
    expect([...OPPORTUNITY_FAMILIES]).toEqual([
      "liquidity",
      "lending",
      "staking",
      "incentives",
      "arbitrage",
      "other",
    ]);
  });

  it("the rail kinds are the frozen across-rails vocabulary (ONCHAIN, FIAT, FX)", () => {
    expect([...RAIL_KINDS]).toEqual(["ONCHAIN", "FIAT", "FX"]);
  });

  it("the deterministic identity is `opportunity:${family}:${railKey}:${venueId}:${observationId}`", () => {
    expect(
      opportunityId("liquidity", ONCHAIN_RAIL, "venue:stable-pair", "obs:liq:001"),
    ).toBe(
      "opportunity:liquidity:ethereum:mainnet:venue:stable-pair:obs:liq:001",
    );
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    expect(opportunity.opportunityId).toBe(
      "opportunity:liquidity:ethereum:mainnet:venue:stable-pair:obs:liq:001",
    );
  });

  it("EVERY catalog opportunity exposes ALL mandated first-class fields (typed)", () => {
    for (const entry of discoveryCatalog()) {
      const opportunity = discoverOpportunity(entry.input, NOW);
      expect(opportunity.capitalRequired, entry.label).toBeDefined();
      expect(opportunity.expectedReturn, entry.label).toBeDefined();
      expect(opportunity.liquidity, entry.label).toBeDefined();
      expect(opportunity.fees, entry.label).toBeDefined();
      expect(opportunity.exitPath, entry.label).toBeDefined();
      expect(opportunity.lockUp, entry.label).toBeDefined();
      expect(opportunity.smartContractRisk, entry.label).toBeDefined();
      expect(opportunity.oracleBridgeRisk, entry.label).toBeDefined();
      expect(opportunity.maxLossBound, entry.label).toBeDefined();
      expect(opportunity.evidenceFreshness, entry.label).toBeDefined();
      expect(opportunity.policyEligibility, entry.label).toBeDefined();
      expect(opportunity.rail, entry.label).toBeDefined();
    }
  });

  it("a healthy liquidity opportunity round-trips through the validator", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const roundTripped = validateFinancialOpportunity(
      JSON.parse(JSON.stringify(opportunity)),
    );
    expect(roundTripped).toEqual(opportunity);
  });

  it("the record is deep-frozen (immutable data, never mutable authority)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    expect(Object.isFrozen(opportunity)).toBe(true);
    expect(Object.isFrozen(opportunity.primaryObservation)).toBe(true);
    expect(Object.isFrozen(opportunity.supportingObservations)).toBe(true);
    expect(() => {
      (opportunity as { title: string }).title = "mutated";
    }).toThrow();
  });

  it("Knowable values: KNOWN carries the value; UNKNOWN carries an honest reason", () => {
    const known = discoverOpportunity(healthyLiquidityObservation(), NOW);
    expect(known.capitalRequired.kind).toBe("KNOWN");
    const unknownMaxLoss = discoverOpportunity(
      healthyLiquidityObservation({ observationId: "obs:liq:no-max", maxLossKnown: false }),
      NOW,
    );
    expect(unknownMaxLoss.maxLossBound.kind).toBe("UNKNOWN");
    if (unknownMaxLoss.maxLossBound.kind === "UNKNOWN") {
      expect(unknownMaxLoss.maxLossBound.reason.length).toBeGreaterThan(0);
    }
  });

  it("the versioned lineage: primary IS element zero; versions are positive; evidence verbatim", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    expect(opportunity.supportingObservations.length).toBe(1);
    expect(opportunity.primaryObservation.observationId).toBe("obs:liq:001");
    expect(opportunity.primaryObservation.version).toBe(3);
    expect(opportunity.supportingObservations[0]?.version).toBe(3);
    expect(opportunity.primaryObservation.evidenceRefs).toEqual([
      "evidence:pool-state:001",
      "evidence:fee-tier:001",
    ]);
    expect(opportunity.evidenceFreshness).toEqual(
      opportunity.primaryObservation.freshness,
    );
  });

  it("the extended lineage carries additional versioned observations verbatim (hard law 1)", () => {
    const opportunity = discoverOpportunity(lineageExtendedLiquidityObservation(), NOW);
    expect(opportunity.supportingObservations).toHaveLength(3);
    expect(opportunity.supportingObservations[1]).toEqual(
      supportingPoolTelemetryObservation(),
    );
    expect(opportunity.supportingObservations[2]).toEqual(
      staleSupportingOracleObservation(),
    );
    expect(opportunity.supportingObservations[1]?.version).toBe(2);
  });

  it("the validator rejects a lineage whose primary is NOT element zero (coherence law)", () => {
    const opportunity = discoverOpportunity(
      lineageExtendedLiquidityObservation(),
      NOW,
    );
    const swapped = {
      ...JSON.parse(JSON.stringify(opportunity)),
      supportingObservations: [
        ...JSON.parse(JSON.stringify(opportunity.supportingObservations)),
      ].reverse(),
    };
    expect(() => validateFinancialOpportunity(swapped)).toThrow(
      InvalidOpportunityError,
    );
    expect(() => validateFinancialOpportunity(swapped)).toThrow(/element zero/);
  });

  it("the validator rejects a duplicate versioned observation in the lineage", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const primary = JSON.parse(JSON.stringify(opportunity.primaryObservation));
    const duplicated = {
      ...JSON.parse(JSON.stringify(opportunity)),
      supportingObservations: [primary, primary],
    };
    expect(() => validateFinancialOpportunity(duplicated)).toThrow(/duplicate/);
  });

  it("the validator rejects a versionless (or non-positive) observation version", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const versionless = JSON.parse(JSON.stringify(opportunity));
    versionless.primaryObservation.version = 0;
    versionless.supportingObservations[0].version = 0;
    expect(() => validateFinancialOpportunity(versionless)).toThrow(
      /positive integer/,
    );
  });

  it("rejects a wrong nominal observationKind", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const forged = { ...JSON.parse(JSON.stringify(opportunity)), observationKind: "ExecutionRequest" };
    expect(() => validateFinancialOpportunity(forged)).toThrow(/observationKind/);
  });

  it("rejects a missing never-authorization tier", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const tierless = JSON.parse(JSON.stringify(opportunity));
    delete tierless.discoveryTier;
    expect(() => validateFinancialOpportunity(tierless)).toThrow(/discoveryTier/);
  });

  it("rejects a forged tier value", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const forged = {
      ...JSON.parse(JSON.stringify(opportunity)),
      discoveryTier: "PRODUCTION_AUTHORIZATION",
    };
    expect(() => validateFinancialOpportunity(forged)).toThrow(/discoveryTier/);
  });

  it("rejects an unknown family", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const forged = { ...JSON.parse(JSON.stringify(opportunity)), family: "yield-farming" };
    expect(() => validateFinancialOpportunity(forged)).toThrow(/family/);
  });

  it("rejects a non-deterministic identity", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const forged = {
      ...JSON.parse(JSON.stringify(opportunity)),
      opportunityId: "opportunity:liquidity:some:other:id",
    };
    expect(() => validateFinancialOpportunity(forged)).toThrow(/deterministic/);
  });

  it("rejects missing evidence freshness (the observation law)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const freshnessless = JSON.parse(JSON.stringify(opportunity));
    delete freshnessless.evidenceFreshness;
    expect(() => validateFinancialOpportunity(freshnessless)).toThrow(
      /evidenceFreshness/,
    );
  });

  it("rejects an empty evidence chain (the observation law)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const evidenceless = JSON.parse(JSON.stringify(opportunity));
    evidenceless.primaryObservation.evidenceRefs = [];
    evidenceless.supportingObservations[0].evidenceRefs = [];
    expect(() => validateFinancialOpportunity(evidenceless)).toThrow(
      /evidenceRefs is MANDATORY and non-empty/,
    );
  });

  it("rejects a non-canonical rail key (the pinned rail law)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const forged = JSON.parse(JSON.stringify(opportunity));
    forged.rail.railKey = "Ethereum Mainnet";
    expect(() => validateFinancialOpportunity(forged)).toThrow(/rail key/);
  });

  it("rejects an unknown rail kind (the across-rails vocabulary)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const forged = JSON.parse(JSON.stringify(opportunity));
    forged.rail.railKind = "CROSS_CHAIN";
    expect(() => validateFinancialOpportunity(forged)).toThrow(/railKind/);
  });

  it("rejects an estimate without bounds (a claim, not an estimate)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const claim = JSON.parse(JSON.stringify(opportunity));
    claim.expectedReturn.bounds = null;
    expect(() => validateFinancialOpportunity(claim)).toThrow(
      /point and bounds are set together/,
    );
  });

  it("rejects floating-point-shaped money (the exact-money law)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const floated = JSON.parse(JSON.stringify(opportunity));
    floated.capitalRequired.value.minorUnits = "1000000.5";
    expect(() => validateFinancialOpportunity(floated)).toThrow(/minorUnits/);
    const exponent = JSON.parse(JSON.stringify(opportunity));
    exponent.capitalRequired.value.minorUnits = "1e7";
    expect(() => validateFinancialOpportunity(exponent)).toThrow(/minorUnits/);
  });

  it("rejects an unknown exit-path status", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const forged = JSON.parse(JSON.stringify(opportunity));
    forged.exitPath.status = "FAST";
    expect(() => validateFinancialOpportunity(forged)).toThrow(/exitPath.status/);
  });

  it("rejects an ineligible opportunity with no machine-readable reason", () => {
    const opportunity = discoverOpportunity(healthyOtherObservation(), NOW);
    const ineligible = JSON.parse(JSON.stringify(opportunity));
    ineligible.policyEligibility.eligible = false;
    ineligible.policyEligibility.reasons = [];
    expect(() => validateFinancialOpportunity(ineligible)).toThrow(
      /at least one machine-readable reason/,
    );
  });

  it("rejects non-object input outright", () => {
    expect(() => validateFinancialOpportunity(null)).toThrow(InvalidOpportunityError);
    expect(() => validateFinancialOpportunity("opportunity")).toThrow(
      InvalidOpportunityError,
    );
    expect(() => validateFinancialOpportunity(42)).toThrow(InvalidOpportunityError);
  });

  it("the 'other' family preserves its policy approval reference on the record", () => {
    const opportunity = discoverOpportunity(healthyOtherObservation(), NOW);
    expect(opportunity.policyApprovalRef).toBe(
      "policy-approval:strategy:rebalance-001",
    );
  });
});
