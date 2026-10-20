import { describe, expect, it } from "vitest";
import { discoverOpportunity, resolveOpportunity, resolveOpportunities } from "../src/index.ts";
import {
  MAX_AGE_MS,
  NOW,
  discoveryCatalog,
  healthyArbitrageObservation,
  healthyLiquidityObservation,
  staleQuoteObservation,
} from "./fixtures-catalog.ts";

/**
 * The observation law (P6-W2; ADAPTED from the old observation.test.ts 9
 * titled sites — freshness/provenance/invalidation — plus the
 * supporting-observation lineage staleness sites).
 */
describe("the observation law (freshness, provenance, invalidation)", () => {
  it("the evidence chain is preserved verbatim: venue, protocol, rail, adapter, observer, refs, VERSION", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    expect(opportunity.primaryObservation.observationId).toBe("obs:liq:001");
    expect(opportunity.primaryObservation.version).toBe(3);
    expect(opportunity.primaryObservation.venueId).toBe("venue:stable-pair");
    expect(opportunity.primaryObservation.protocolKey).toBe("protocol:amm-v2");
    expect(opportunity.rail.railKey).toBe("ethereum:mainnet");
    expect(opportunity.primaryObservation.adapterId).toBe("adapter:onchain:evm");
    expect(opportunity.primaryObservation.observerId).toBe("observer:indexer:001");
    expect([...opportunity.primaryObservation.evidenceRefs]).toEqual([
      "evidence:pool-state:001",
      "evidence:fee-tier:001",
    ]);
    expect(opportunity.evidenceFreshness).toEqual({ asOfMs: NOW, maxAgeMs: MAX_AGE_MS });
  });

  it("staleness is deterministic with an INCLUSIVE freshness bound (the pinned law)", () => {
    // Evidence exactly maxAgeMs old is STILL fresh at the instant.
    const exactlyAgedInput = {
      ...healthyLiquidityObservation({ observationId: "obs:liq:boundary" }),
      freshness: { asOfMs: NOW - MAX_AGE_MS, maxAgeMs: MAX_AGE_MS },
    };
    const atBoundary = discoverOpportunity(exactlyAgedInput, NOW);
    expect(resolveOpportunity(atBoundary, NOW).status).toBe("CURRENT");
    expect(atBoundary.policyEligibility.eligible).toBe(true);

    // One millisecond later it is stale — deterministic, no grace, no guess.
    expect(resolveOpportunity(atBoundary, NOW + 1).status).toBe("STALE");
  });

  it("a stale observation is INVALIDATED at read time: eligibility forced false with the reason", () => {
    const opportunity = discoverOpportunity(staleQuoteObservation(), NOW);
    const resolution = resolveOpportunity(opportunity, NOW);
    expect(resolution.status).toBe("STALE");
    if (resolution.status === "STALE") {
      expect(resolution.reason).toBe("STALE_OBSERVATION");
      expect(resolution.invalidatedAt).toBe(NOW);
      expect(resolution.policy.eligible).toBe(false);
      expect(resolution.policy.reasons).toContain("STALE_OBSERVATION");
    }
  });

  it("invalidation preserves the FULL evidence chain (which observation went stale is visible)", () => {
    const opportunity = discoverOpportunity(staleQuoteObservation(), NOW);
    const resolution = resolveOpportunity(opportunity, NOW);
    // The stale record is carried through verbatim — never dropped, never
    // repaired, never silently re-observed.
    expect(resolution.opportunity.opportunityId).toBe(opportunity.opportunityId);
    expect(resolution.opportunity.primaryObservation.observationId).toBe("obs:liq:stale-001");
    expect(resolution.opportunity.primaryObservation.venueId).toBe("venue:stable-pair");
    expect(resolution.opportunity.evidenceFreshness.asOfMs).toBe(NOW - (MAX_AGE_MS + 30_000));
  });

  it("a CURRENT resolution re-derives the policy from the typed fields (defense in depth)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    const resolution = resolveOpportunity(opportunity, NOW);
    expect(resolution.status).toBe("CURRENT");
    if (resolution.status === "CURRENT") {
      expect(resolution.policy.eligible).toBe(true);
      expect(resolution.policy.evaluatedAt).toBe(NOW);
    }
  });

  it("an arbitrage leg going stale invalidates the WHOLE opportunity (one stale side voids the spread)", () => {
    const input = healthyArbitrageObservation();
    const legs = input.arbitrageLegs ?? [];
    const staleLegInput = {
      ...input,
      observationId: "obs:arb:stale-leg",
      arbitrageLegs: [
        legs[0] as typeof legs[number],
        {
          ...(legs[1] as typeof legs[number]),
          freshness: { asOfMs: NOW - (MAX_AGE_MS + 1), maxAgeMs: MAX_AGE_MS },
        },
      ],
    };
    const opportunity = discoverOpportunity(staleLegInput, NOW);
    // The opportunity's OWN evidence is fresh — but one leg is stale.
    expect(opportunity.evidenceFreshness.asOfMs).toBe(NOW);
    const resolution = resolveOpportunity(opportunity, NOW);
    expect(resolution.status).toBe("STALE");
    if (resolution.status === "STALE") {
      expect(resolution.reason).toBe("STALE_OBSERVATION");
    }
  });

  it("a stale SUPPORTING observation invalidates the whole opportunity (the lineage law)", () => {
    const input = healthyLiquidityObservation({ observationId: "obs:liq:lineage-stale" });
    const withStaleSupport = {
      ...input,
      additionalSupportingObservations: [
        {
          observationId: "obs:liq:aux:001",
          version: 1,
          venueId: "venue:aux-feed",
          adapterId: "adapter:onchain:evm",
          observerId: "observer:indexer:011",
          freshness: { asOfMs: NOW - (MAX_AGE_MS + 5_000), maxAgeMs: MAX_AGE_MS },
          evidenceRefs: ["evidence:aux-feed:001"],
        },
      ],
    };
    const opportunity = discoverOpportunity(withStaleSupport, NOW);
    expect(opportunity.primaryObservation.freshness.asOfMs).toBe(NOW);
    expect(opportunity.supportingObservations).toHaveLength(2);
    const resolution = resolveOpportunity(opportunity, NOW);
    expect(resolution.status).toBe("STALE");
    if (resolution.status === "STALE") {
      expect(resolution.reason).toBe("STALE_OBSERVATION");
    }
  });

  it("batch resolution is order-preserving and deterministic", () => {
    const opportunities = discoveryCatalog().map((entry) =>
      discoverOpportunity(entry.input, NOW),
    );
    const resolutions = resolveOpportunities(opportunities, NOW);
    expect(resolutions).toHaveLength(opportunities.length);
    for (let index = 0; index < opportunities.length; index += 1) {
      expect(resolutions[index]?.opportunity.opportunityId).toBe(
        opportunities[index]?.opportunityId,
      );
    }
    expect(resolveOpportunities(opportunities, NOW)).toEqual(
      resolveOpportunities(opportunities, NOW),
    );
  });

  it("the resolution instant is caller-supplied (no ambient clock)", () => {
    const opportunity = discoverOpportunity(healthyLiquidityObservation(), NOW);
    expect(() => resolveOpportunity(opportunity, -1)).toThrow(RangeError);
    expect(() => resolveOpportunity(opportunity, 1.5)).toThrow(RangeError);
  });

  it("every stale catalog entry resolves STALE; every healthy entry resolves CURRENT", () => {
    for (const entry of discoveryCatalog()) {
      const opportunity = discoverOpportunity(entry.input, NOW);
      const resolution = resolveOpportunity(opportunity, NOW);
      const expected =
        entry.label.includes("stale") || entry.label === "liquidity:lineage-extended"
          ? "STALE"
          : "CURRENT";
      expect(resolution.status, entry.label).toBe(expected);
    }
  });
});
