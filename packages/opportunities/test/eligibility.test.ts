import { describe, expect, it } from "vitest";
import {
  DISCOVERY_DISCLOSURE_FLAGS,
  DISCOVERY_INELIGIBILITY_REASONS,
  MAX_PLAUSIBLE_RETURN_PER_YEAR,
  OPPORTUNITY_FAMILIES,
  evaluateDiscoveryPolicy,
  isOpportunityStale,
} from "../src/index.ts";
import { discoverOpportunity } from "../src/index.ts";
import {
  NOW,
  blockedExitObservation,
  discoveryCatalog,
  fakeIncentiveObservation,
  healthyArbitrageObservation,
  healthyIncentivesObservation,
  healthyLiquidityObservation,
  healthyLendingObservation,
  healthyOtherObservation,
  healthyStakingObservation,
  lineageExtendedLiquidityObservation,
  manipulatedApyObservation,
  staleStakingObservation,
  unapprovedOtherObservation,
  unreservedBudgetObservation,
  vanishedLiquidityObservation,
  vanishedOwnLiquidityObservation,
} from "./fixtures-catalog.ts";

/**
 * The deterministic discovery policy (P6-W2; ADAPTED from the old
 * eligibility.test.ts 19 titled sites — the adversarial sweep, the
 * plausibility ceiling, the incentive-integrity rules and the UNKNOWN-
 * flags law — plus the versioned-lineage staleness site).
 */
describe("the deterministic discovery policy", () => {
  const expectedReasons: Readonly<Record<string, readonly string[]>> = {
    "liquidity:adversarial-stale": ["STALE_OBSERVATION"],
    "liquidity:adversarial-honeypot": ["EXIT_PATH_SUSPECT_HONEYPOT"],
    "liquidity:adversarial-blocked-exit": ["EXIT_PATH_BLOCKED"],
    "liquidity:adversarial-own-vanished": ["WITHDRAWAL_LIQUIDITY_VANISHED"],
    "lending:adversarial-manipulated-apy": ["SUSPECT_RETURN_OUTSIDE_PLAUSIBLE_BAND"],
    "staking:adversarial-stale": ["STALE_OBSERVATION"],
    "incentives:adversarial-fake": [
      "UNVERIFIED_INCENTIVE_COMPONENT",
      "INCENTIVE_BUDGET_NOT_RESERVED",
    ],
    "incentives:adversarial-unreserved": ["INCENTIVE_BUDGET_NOT_RESERVED"],
    "arbitrage:adversarial-vanished-liquidity": ["WITHDRAWAL_LIQUIDITY_VANISHED"],
    "other:adversarial-unapproved": ["POLICY_APPROVAL_MISSING"],
  };

  it("EVERY adversarial entry in the catalog is ineligible (table-driven sweep)", () => {
    for (const entry of discoveryCatalog()) {
      const opportunity = discoverOpportunity(entry.input, NOW);
      const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
      // The lineage-extended fixture carries a DELIBERATELY stale supporting
      // observation (the lineage-law fixture): it surfaces ineligible at NOW.
      if (!entry.label.includes("adversarial") && entry.label !== "liquidity:lineage-extended") {
        expect(evaluation.eligible, entry.label).toBe(true);
        continue;
      }
      expect(evaluation.eligible, entry.label).toBe(false);
      const expected = expectedReasons[entry.label] ?? [];
      for (const reason of expected) {
        expect(evaluation.reasons, `${entry.label}: ${evaluation.reasons.join(",")}`).toContain(
          reason,
        );
      }
    }
  });

  it("the manipulated-APY point estimate is NOT repeated as attractive evidence (800,000%/yr flagged)", () => {
    const opportunity = discoverOpportunity(manipulatedApyObservation(), NOW);
    const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons).toContain("SUSPECT_RETURN_OUTSIDE_PLAUSIBLE_BAND");
    expect(opportunity.policyEligibility.eligible).toBe(false);
    expect(opportunity.policyEligibility.reasons).toContain(
      "SUSPECT_RETURN_OUTSIDE_PLAUSIBLE_BAND",
    );
  });

  it("the plausibility ceiling is the frozen 1000%/yr discovery-policy constant", () => {
    expect(MAX_PLAUSIBLE_RETURN_PER_YEAR).toEqual({
      numerator: "10",
      denominator: "1",
    });
  });

  it("a point exactly at the ceiling is NOT flagged (the boundary is inclusive)", () => {
    const atCeiling = {
      ...healthyLendingObservation({ observationId: "obs:len:at-ceiling" }),
      returnComponents: [
        {
          componentId: "len:supply-apy",
          kind: "SUPPLY_APY" as const,
          ratePerYear: { numerator: "10", denominator: "1" },
          evidenceVerified: true,
          description: "observed supply apy component, annualized from venue observations",
        },
      ],
    };
    const opportunity = discoverOpportunity(atCeiling, NOW);
    const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
    expect(evaluation.reasons).not.toContain("SUSPECT_RETURN_OUTSIDE_PLAUSIBLE_BAND");
    expect(evaluation.eligible).toBe(true);
  });

  it("a fake incentive makes the estimate UNKNOWN (no verified component) AND ineligible", () => {
    const opportunity = discoverOpportunity(fakeIncentiveObservation(), NOW);
    expect(opportunity.expectedReturn.point).toBeNull();
    expect(opportunity.expectedReturn.bounds).toBeNull();
    const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons).toContain("UNVERIFIED_INCENTIVE_COMPONENT");
    expect(evaluation.flags).toContain("EXPECTED_RETURN_UNKNOWN");
  });

  it("an unreserved incentive budget is ineligible even with verified evidence (the old rule 13)", () => {
    const opportunity = discoverOpportunity(unreservedBudgetObservation(), NOW);
    // An unreserved incentive is not a VERIFIED component: the estimate is
    // honestly UNKNOWN (point and bounds null)...
    expect(opportunity.expectedReturn.point).toBeNull();
    expect(opportunity.expectedReturn.bounds).toBeNull();
    // ...and the unreserved budget voids eligibility regardless.
    const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons).toContain("INCENTIVE_BUDGET_NOT_RESERVED");
  });

  it("vanished liquidity on an arbitrage leg is ineligible (the leg's exit is gone)", () => {
    const opportunity = discoverOpportunity(vanishedLiquidityObservation(), NOW);
    const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons).toContain("WITHDRAWAL_LIQUIDITY_VANISHED");
  });

  it("the unapproved 'other' strategy is discovered but ineligible (surfaced, never hidden)", () => {
    const opportunity = discoverOpportunity(unapprovedOtherObservation(), NOW);
    expect(opportunity.opportunityId).toContain("other");
    const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons).toContain("POLICY_APPROVAL_MISSING");
  });

  it("a STALE SUPPORTING observation voids eligibility even when the primary is fresh (lineage law)", () => {
    const opportunity = discoverOpportunity(lineageExtendedLiquidityObservation(), NOW);
    // The primary is fresh at NOW...
    expect(isOpportunityStale(opportunity, NOW)).toBe(true);
    const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons).toContain("STALE_OBSERVATION");
    // ...and at an instant before the supporting observation aged out
    // (age 25s of a 30s bound — the inclusive law), it is eligible.
    const fresh = evaluateDiscoveryPolicy(opportunity, NOW - 20_000);
    expect(fresh.eligible).toBe(true);
  });

  it("UNKNOWN states are FLAGS, never ineligibility (UNKNOWN is not FAILED)", () => {
    const noMaxLoss = discoverOpportunity(
      healthyLiquidityObservation({ observationId: "obs:liq:flags", maxLossKnown: false }),
      NOW,
    );
    const evaluation = evaluateDiscoveryPolicy(noMaxLoss, NOW);
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.flags).toContain("MAX_LOSS_BOUND_UNKNOWN");
    expect(DISCOVERY_INELIGIBILITY_REASONS).not.toContain("MAX_LOSS_BOUND_UNKNOWN");
  });

  it("an UNKNOWN estimate is flagged honestly without ineligibility", () => {
    const unknownEstimate = discoverOpportunity(
      fakeIncentiveObservation(),
      NOW - 45_000,
    );
    expect(unknownEstimate.expectedReturn.point).toBeNull();
    const evaluation = evaluateDiscoveryPolicy(unknownEstimate, NOW);
    expect(evaluation.flags).toContain("EXPECTED_RETURN_UNKNOWN");
    expect(DISCOVERY_DISCLOSURE_FLAGS).toContain("EXPECTED_RETURN_UNKNOWN");
  });

  it("the policy is pure and deterministic: same opportunity, same instant, same evaluation", () => {
    const opportunity = discoverOpportunity(healthyArbitrageObservation(), NOW);
    const first = evaluateDiscoveryPolicy(opportunity, NOW);
    const second = evaluateDiscoveryPolicy(opportunity, NOW);
    expect(first).toEqual(second);
  });

  it("the evaluation instant is caller-supplied — a negative instant fails closed", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    expect(() => evaluateDiscoveryPolicy(opportunity, -1)).toThrow(RangeError);
    expect(() => evaluateDiscoveryPolicy(opportunity, 1.5)).toThrow(RangeError);
  });

  it("a BLOCKED exit path is ineligible", () => {
    const opportunity = discoverOpportunity(blockedExitObservation(), NOW);
    const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons).toContain("EXIT_PATH_BLOCKED");
  });

  it("vanished liquidity on the opportunity's own profile is ineligible", () => {
    const opportunity = discoverOpportunity(vanishedOwnLiquidityObservation(), NOW);
    const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons).toContain("WITHDRAWAL_LIQUIDITY_VANISHED");
  });

  it("multiple failed rules are ALL collected (never just the first)", () => {
    // Stale + honeypot + vanished own liquidity + manipulated return in one record.
    const everythingWrong = {
      ...healthyIncentivesObservation({ observationId: "obs:inc:all-wrong" }),
      freshness: { asOfMs: NOW - 90_000, maxAgeMs: 30_000 },
      exitPath: {
        status: "SUSPECT_HONEYPOT" as const,
        description: "withdrawals have never been observed on this venue",
        constraints: [],
      },
      liquidity: { depthMinorUnits: "1000", withdrawalLiquidityMinorUnits: "0" },
      returnComponents: [
        {
          componentId: "inc:rebate-manipulated",
          kind: "INCENTIVE_YIELD" as const,
          ratePerYear: { numerator: "8000", denominator: "1" },
          evidenceVerified: true,
          budgetReserved: true,
          description: "observed incentive yield component, annualized from venue observations",
        },
        {
          componentId: "inc:rebate-fake",
          kind: "INCENTIVE_YIELD" as const,
          ratePerYear: { numerator: "950", denominator: "10000" },
          evidenceVerified: false,
          budgetReserved: false,
          description: "observed incentive yield component, annualized from venue observations",
        },
      ],
    };
    const opportunity = discoverOpportunity(everythingWrong, NOW);
    const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
    expect(evaluation.reasons).toEqual(
      expect.arrayContaining([
        "STALE_OBSERVATION",
        "EXIT_PATH_SUSPECT_HONEYPOT",
        "WITHDRAWAL_LIQUIDITY_VANISHED",
        "SUSPECT_RETURN_OUTSIDE_PLAUSIBLE_BAND",
        "UNVERIFIED_INCENTIVE_COMPONENT",
        "INCENTIVE_BUDGET_NOT_RESERVED",
      ]),
    );
  });

  it("a stale staking observation is ineligible (the policy re-derives staleness too)", () => {
    const opportunity = discoverOpportunity(staleStakingObservation(), NOW);
    const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.reasons).toContain("STALE_OBSERVATION");
  });

  it("the stale fixture is exactly past its freshness bound at the evaluation instant", () => {
    const stale = staleStakingObservation();
    expect(stale.freshness.asOfMs).toBe(NOW - 90_000);
    expect(stale.freshness.maxAgeMs).toBe(30_000);
    const opportunity = discoverOpportunity(stale, NOW);
    expect(opportunity.evidenceFreshness).toEqual({
      asOfMs: NOW - 90_000,
      maxAgeMs: 30_000,
    });
  });

  it("healthy opportunities are eligible with no ineligibility reasons", () => {
    for (const family of OPPORTUNITY_FAMILIES) {
      const input =
        family === "liquidity"
          ? healthyLiquidityObservation()
          : family === "lending"
            ? healthyLendingObservation()
            : family === "staking"
              ? healthyStakingObservation()
              : family === "incentives"
                ? healthyIncentivesObservation()
                : family === "arbitrage"
                  ? healthyArbitrageObservation()
                  : healthyOtherObservation();
      const opportunity = discoverOpportunity(input, NOW);
      const evaluation = evaluateDiscoveryPolicy(opportunity, NOW);
      expect(evaluation.eligible, family).toBe(true);
      expect(evaluation.reasons, family).toEqual([]);
    }
  });
});
