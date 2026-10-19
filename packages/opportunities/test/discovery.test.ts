import { describe, expect, it } from "vitest";
import {
  OpportunityDiscoveryError,
  deriveArbitrageComponents,
  discoverOpportunity,
  estimateExpectedReturn,
} from "../src/index.ts";
import {
  FIAT_RAIL,
  NOW,
  ONCHAIN_RAIL,
  discoveryCatalog,
  healthyArbitrageObservation,
  healthyFiatLiquidityObservation,
  healthyFxArbitrageObservation,
  healthyIncentivesObservation,
  healthyLendingObservation,
  healthyLiquidityObservation,
  healthyOtherObservation,
  healthyStakingObservation,
} from "./fixtures-catalog.ts";

/**
 * Evidence-backed discovery (P6-W2; ADAPTED from the old discovery.test.ts
 * 17 titled sites — the per-family estimate discipline, arbitrage
 * derivation, fail-closed input laws, determinism — plus the
 * versioned-evidence + across-rails sites).
 */
describe("evidence-backed discovery (the ONE constructor)", () => {
  it("liquidity: the estimate is the observed fee yield with bounds [verified, total]", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    expect(opportunity.expectedReturn.point).toEqual({ numerator: "431", denominator: "10000" });
    expect(opportunity.expectedReturn.bounds).toEqual({
      low: { numerator: "431", denominator: "10000" },
      high: { numerator: "431", denominator: "10000" },
    });
  });

  it("lending: the estimate is the observed supply APY with the same bounds discipline", () => {
    const opportunity = discoverOpportunity(healthyLendingObservation(), NOW);
    expect(opportunity.expectedReturn.point).toEqual({ numerator: "350", denominator: "10000" });
    expect(opportunity.expectedReturn.bounds?.low).toEqual({
      numerator: "350",
      denominator: "10000",
    });
  });

  it("staking: the estimate is the observed staking yield; the unbonding lock is disclosed", () => {
    const opportunity = discoverOpportunity(healthyStakingObservation(), NOW);
    expect(opportunity.expectedReturn.point).toEqual({ numerator: "380", denominator: "10000" });
    expect(opportunity.lockUp.locked).toBe(true);
    expect(opportunity.lockUp.durationMs).toBe(1_209_600_000);
    expect(opportunity.exitPath.status).toBe("RESTRICTED");
  });

  it("incentives: the estimate is the observed reward rate; budget reservation is recorded", () => {
    const opportunity = discoverOpportunity(healthyIncentivesObservation(), NOW);
    const component = opportunity.expectedReturn.components[0];
    expect(component?.kind).toBe("INCENTIVE_YIELD");
    expect(component?.budgetReserved).toBe(true);
    expect(opportunity.expectedReturn.point).toEqual({ numerator: "120", denominator: "10000" });
  });

  it("an unverified-only incentive estimate is honestly UNKNOWN (point and bounds null)", () => {
    const components = [
      {
        componentId: "inc:rebate",
        kind: "INCENTIVE_YIELD" as const,
        ratePerYear: { numerator: "950", denominator: "10000" },
        evidenceVerified: false,
        budgetReserved: false,
        description: "observed incentive yield component, annualized from venue observations",
      },
    ];
    const estimate = estimateExpectedReturn(components);
    expect(estimate.point).toBeNull();
    expect(estimate.bounds).toBeNull();
    expect(estimate.basis).toMatch(/UNKNOWN/);
  });

  it("a verified component PLUS an unverified component: the lower bound counts the verified one only", () => {
    const components = [
      {
        componentId: "liq:fee-yield",
        kind: "FEE_YIELD" as const,
        ratePerYear: { numerator: "431", denominator: "10000" },
        evidenceVerified: true,
        description: "observed fee yield component, annualized from venue observations",
      },
      {
        componentId: "inc:rebate",
        kind: "INCENTIVE_YIELD" as const,
        ratePerYear: { numerator: "500", denominator: "10000" },
        evidenceVerified: false,
        description: "observed incentive yield component, annualized from venue observations",
      },
    ];
    const estimate = estimateExpectedReturn(components);
    // Unreduced exact sums (the repo exact-math convention): the point is
    // 9310000/100000000, the lower bound is the verified 431/10000 verbatim.
    expect(estimate.point).toEqual({ numerator: "9310000", denominator: "100000000" });
    expect(estimate.bounds?.low).toEqual({ numerator: "431", denominator: "10000" });
    expect(estimate.bounds?.high).toEqual({ numerator: "9310000", denominator: "100000000" });
  });

  it("the point is the gross observed spread; the lower bound is net of observed costs", () => {
    const opportunity = discoverOpportunity(healthyArbitrageObservation(), NOW);
    // spread = (1020/1000 − 1005/1000) / (1005/1000) = 15000/1005000
    expect(opportunity.expectedReturn.point).toEqual({
      numerator: "15000",
      denominator: "1005000",
    });
    // net lower bound = 15000/1005000 − 5/10000
    //   = 144975000/10050000000 (exact; unreduced — the repo convention).
    expect(opportunity.expectedReturn.bounds?.low).toEqual({
      numerator: "144975000",
      denominator: "10050000000",
    });
  });

  it("the legs are preserved verbatim on the record (evidence preservation)", () => {
    const opportunity = discoverOpportunity(healthyArbitrageObservation(), NOW);
    expect(opportunity.arbitrageLegs).toHaveLength(2);
    expect(opportunity.arbitrageLegs?.[0]?.venueId).toBe("venue:quote-a");
    expect(opportunity.arbitrageLegs?.[1]?.venueId).toBe("venue:quote-b");
    expect(opportunity.arbitrageLegs?.[0]?.price).toEqual({
      numerator: "1005",
      denominator: "1000",
    });
  });

  it("an equal-price pair yields an honest zero estimate (no fabricated spread)", () => {
    const equalLegs = healthyArbitrageObservation().arbitrageLegs ?? [];
    const components = deriveArbitrageComponents([
      equalLegs[0] as typeof equalLegs[number],
      { ...(equalLegs[1] as typeof equalLegs[number]), price: { numerator: "1005", denominator: "1000" } },
    ]);
    // Equal prices: an honest ZERO spread (0/1005000 — unreduced), never fabricated.
    expect(components[0]?.ratePerYear).toEqual({ numerator: "0", denominator: "1005000" });
  });

  it("a zero-price leg fails closed (a zero price is malformed evidence, not a spread)", () => {
    const legs = healthyArbitrageObservation().arbitrageLegs ?? [];
    expect(() =>
      deriveArbitrageComponents([
        legs[0] as typeof legs[number],
        { ...(legs[1] as typeof legs[number]), price: { numerator: "0", denominator: "1" } },
      ]),
    ).toThrow(OpportunityDiscoveryError);
  });

  it("an arbitrage observation requires EXACTLY two legs (fail closed)", () => {
    const legs = healthyArbitrageObservation().arbitrageLegs ?? [];
    expect(() => deriveArbitrageComponents([legs[0] as typeof legs[number]])).toThrow(
      /exactly two venue price legs/,
    );
    expect(() => deriveArbitrageComponents([])).toThrow(/exactly two venue price legs/);
  });

  it("a PRICE_DIFFERENCE component can never be supplied directly (derived only)", () => {
    const input = {
      ...healthyLiquidityObservation(),
      returnComponents: [
        {
          componentId: "liq:spread",
          kind: "PRICE_DIFFERENCE" as const,
          ratePerYear: { numerator: "15", denominator: "1005" },
          evidenceVerified: true,
          description: "observed price difference component, annualized from venue observations",
        },
      ],
    };
    expect(() => discoverOpportunity(input, NOW)).toThrow(/PRICE_DIFFERENCE/);
  });

  it("non-arbitrage families require at least one observed component (empty evidence is not an estimate)", () => {
    const input = { ...healthyLiquidityObservation(), returnComponents: [] };
    expect(() => discoverOpportunity(input, NOW)).toThrow(
      /at least one observed return component/,
    );
  });

  it("the discovery instant is caller-supplied (no ambient clock) — a negative instant fails closed", () => {
    expect(() => discoverOpportunity(healthyLiquidityObservation(), -1)).toThrow(
      OpportunityDiscoveryError,
    );
    expect(() => discoverOpportunity(healthyLiquidityObservation(), 1.5)).toThrow(
      OpportunityDiscoveryError,
    );
  });

  it("missing optional evidence surfaces honestly as UNKNOWN with a reason (never guessed)", () => {
    const noExtras = discoverOpportunity(
      healthyLiquidityObservation({ observationId: "obs:liq:sparse", maxLossKnown: false }),
      NOW,
    );
    // fees were supplied; maxLoss was not.
    expect(noExtras.maxLossBound.kind).toBe("UNKNOWN");
    if (noExtras.maxLossBound.kind === "UNKNOWN") {
      expect(noExtras.maxLossBound.reason).toMatch(/honest UNKNOWN/);
    }
    const sparse = { ...healthyLiquidityObservation({ observationId: "obs:liq:sparse-2" }) };
    delete (sparse as { capitalRequired?: unknown }).capitalRequired;
    delete (sparse as { fees?: unknown }).fees;
    delete (sparse as { liquidity?: unknown }).liquidity;
    const opportunity = discoverOpportunity(sparse, NOW);
    expect(opportunity.capitalRequired.kind).toBe("UNKNOWN");
    expect(opportunity.fees.kind).toBe("UNKNOWN");
    expect(opportunity.liquidity).toEqual({
      depthMinorUnits: null,
      withdrawalLiquidityMinorUnits: null,
    });
  });

  it("the full discovery catalog constructs across all six families (deterministic counts)", () => {
    const opportunities = discoveryCatalog().map((entry) =>
      discoverOpportunity(entry.input, NOW),
    );
    expect(opportunities).toHaveLength(28);
    const families = new Set(opportunities.map((opportunity) => opportunity.family));
    expect([...families].sort()).toEqual([
      "arbitrage",
      "incentives",
      "lending",
      "liquidity",
      "other",
      "staking",
    ]);
  });

  it("the across-rails law: FIAT and FX rails construct with canonical rail keys", () => {
    const fiat = discoverOpportunity(healthyFiatLiquidityObservation(), NOW);
    expect(fiat.rail).toEqual({ railKind: "FIAT", railKey: FIAT_RAIL });
    expect(fiat.opportunityId).toContain(`fiat:sepa`);
    const fx = discoverOpportunity(healthyFxArbitrageObservation(), NOW);
    expect(fx.rail).toEqual({ railKind: "FX", railKey: "fx:eur-usd" });
    expect(fx.expectedReturn.point).not.toBeNull();
  });

  it("an unknown rail kind or non-canonical rail key fails closed", () => {
    const badKind = {
      ...healthyLiquidityObservation(),
      railKind: "TELEGRAPH" as never,
    };
    expect(() => discoverOpportunity(badKind, NOW)).toThrow(/railKind/);
    const badKey = { ...healthyLiquidityObservation(), railKey: "Ethereum Mainnet" };
    expect(() => discoverOpportunity(badKey, NOW)).toThrow(/railKey/);
  });

  it("the versioned-evidence law: a missing or non-positive observation version fails closed", () => {
    const versionless = { ...healthyLiquidityObservation(), observationVersion: 0 };
    expect(() => discoverOpportunity(versionless, NOW)).toThrow(
      /observationVersion must be a positive integer/,
    );
    const versioned = discoverOpportunity(
      { ...healthyLiquidityObservation(), observationVersion: 41 },
      NOW,
    );
    expect(versioned.primaryObservation.version).toBe(41);
  });

  it("the ONCHAIN rail fixture carries the canonical onchain-domain chain key", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    expect(opportunity.rail.railKind).toBe("ONCHAIN");
    expect(opportunity.rail.railKey).toBe(ONCHAIN_RAIL);
  });

  it("discovery is deterministic: the same input at the same instant yields the identical record", () => {
    const first = discoverOpportunity(healthyOtherObservation(), NOW);
    const second = discoverOpportunity(healthyOtherObservation(), NOW);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("healthy opportunities are eligible with no ineligibility reasons", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    expect(opportunity.policyEligibility.eligible).toBe(true);
    expect(opportunity.policyEligibility.reasons).toEqual([]);
    expect(opportunity.policyEligibility.decidedBy).toBe("discovery-policy");
  });
});
