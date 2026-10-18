import { describe, expect, it } from "vitest";
import { BestExecutionEngine } from "../src/best-execution.ts";
import { discoverOnchainLane } from "../src/onchain-lane.ts";
import { OnchainLaneDiscoveryError } from "../src/errors.ts";
import {
  allowAllGate,
  baseBestExecutionPolicy,
  baseSecurity,
  blockAllGate,
  fixtureVenue,
  onchainInstanceFixture,
  unknownAllGate,
} from "./venue-fixtures.ts";
import { baseEngineRequest, fixtureEngine, provedFixtureLane } from "./lane-fixtures.ts";
import { NOW, OWNER, CHAIN, routeLocationObservations, route1Intent, USC_ASSET, ETH_ASSET, ORIGIN_ETH_MINOR } from "./fixtures.ts";

/**
 * Onchain lane discovery (PORT of the old mixed-rail lane-discovery
 * suite): the REAL engine is the sole selection authority; the honest
 * three-status outcome; exact input-asset grounding (INV-C05).
 */
function discoveryInput(overrides?: Record<string, unknown>) {
  const request = baseEngineRequest();
  return {
    executionId: request.executionId,
    swap: request.swap,
    policy: request.policy,
    security: request.security,
    instances: request.instances,
    owner: OWNER,
    beneficiary: OWNER,
    requestedBy: request.requestedBy,
    routeExpiryMs: request.routeExpiryMs,
    at: NOW,
    assetObservations: routeLocationObservations(route1Intent()),
    ...overrides,
  };
}

describe("onchain-lane discovery through the real engine", () => {
  it("proves a lane with the engine artifacts: gate ALLOW, prepared write, evaluation, grounding", () => {
    const result = provedFixtureLane();
    expect(result.status).toBe("LANE_PROVED");
    if (result.status !== "LANE_PROVED") {
      throw new Error("unreachable");
    }
    const lane = result.lane;
    expect(lane.venueId).toBe("fixture-dex-alpha");
    expect(lane.gateDecision.decision).toBe("ALLOW");
    expect(lane.write.writeDigest).toMatch(/^fnv1a64:/);
    expect(lane.evaluation.netNumeraireMinorUnits).toBe("2299880");
    expect(lane.inputAssetObservation.observationKind).toBe("ONCHAIN_POSITION");
    expect(lane.railId).toBe(`onchain.${CHAIN}`);
    expect(lane.evidenceRefs.length).toBeGreaterThan(0);
  });

  it("the lane id is the deterministic function of (executionId, venueId, quoteId)", () => {
    const result = provedFixtureLane();
    if (result.status !== "LANE_PROVED") {
      throw new Error("unreachable");
    }
    expect(result.lane.laneId).toBe(`onchain-lane:execution:fixture-lane:001:fixture-dex-alpha:quote:fixture-dex:001`);
  });

  it("an UNAVAILABLE venue yields NO_EXECUTABLE_ROUTE (the honest empty state, provenance carried)", () => {
    const engine = new BestExecutionEngine();
    engine.register(fixtureVenue({ quoteOutcome: "UNAVAILABLE" }));
    const result = discoverOnchainLane(engine, discoveryInput());
    expect(result.status).toBe("NO_EXECUTABLE_ROUTE");
    if (result.status === "NO_EXECUTABLE_ROUTE") {
      expect(result.detail).toContain("no venue produced a quote");
      expect(result.provenance.venues.length).toBe(1);
    }
  });

  it("an OUTCOME_UNKNOWN venue quote stage is honest — never a fabricated route", () => {
    const engine = new BestExecutionEngine();
    engine.register(fixtureVenue({ quoteOutcome: "OUTCOME_UNKNOWN" }));
    const result = discoverOnchainLane(engine, discoveryInput());
    expect(result.status).toBe("NO_EXECUTABLE_ROUTE");
  });

  it("retains ELIGIBILITY semantics: an ineligible instance yields no route (honest; folded with the REVOKED law)", () => {
    const engine = fixtureEngine();
    const ineligible = discoverOnchainLane(
      engine,
      discoveryInput({ instances: [{ ...onchainInstanceFixture(), eligible: false }] }),
    );
    expect(ineligible.status).toBe("NO_EXECUTABLE_ROUTE");
    const revoked = discoverOnchainLane(
      engine,
      discoveryInput({ instances: [{ ...onchainInstanceFixture(), authorizationStatus: "REVOKED" }] }),
    );
    expect(revoked.status).toBe("NO_EXECUTABLE_ROUTE");
  });

  it("retains SECURITY semantics: a BLOCKed write kills the lane (kernel gates)", () => {
    const engine = fixtureEngine();
    const result = discoverOnchainLane(
      engine,
      discoveryInput({ security: { ...baseSecurity(), evaluateGate: blockAllGate("spender_not_permitted") } }),
    );
    expect(result.status).toBe("NO_EXECUTABLE_ROUTE");
  });

  it("an UNKNOWN gate holds the lane unproved — never selected, never failed (INV-X01)", () => {
    const engine = fixtureEngine();
    const result = discoverOnchainLane(
      engine,
      discoveryInput({ security: { ...baseSecurity(), evaluateGate: unknownAllGate() } }),
    );
    expect(result.status).toBe("NO_EXECUTABLE_ROUTE");
  });

  it("a MISSING input-asset observation grounding refuses to prove the lane (INV-C05)", () => {
    const engine = fixtureEngine();
    const result = discoverOnchainLane(engine, discoveryInput({ assetObservations: [] }));
    expect(result.status).toBe("LANE_UNPROVED_GROUNDING");
    if (result.status === "LANE_UNPROVED_GROUNDING") {
      expect(result.reason).toBe("INPUT_ASSET_OBSERVATION_MISSING");
      expect(result.detail).toContain("never grounds execution");
    }
  });

  it("a STALE input-asset observation grounding refuses to prove the lane (freshness law)", () => {
    const venue = fixtureVenue();
    const engine = new BestExecutionEngine();
    engine.register({
      ...venue,
      quote: (request: Parameters<typeof venue.quote>[0], at: number) => {
        const outcome = venue.quote(request, at);
        return outcome.kind === "QUOTE"
          ? {
              kind: "QUOTE",
              quote: {
                ...outcome.quote,
                freshness: { asOfMs: NOW, maxAgeMs: 20_000_000 },
              },
            }
          : outcome;
      },
      observeHealth: (at: number) => ({
        status: "HEALTHY" as const,
        observedAtMs: NOW,
        maxAgeMs: 20_000_000,
        provenance: { providerName: "venue-fixture", source: "VENUE_API", capturedAtMs: NOW, evidenceRefs: ["fixture:venue-health:long"] },
      }),
    });
    const result = discoverOnchainLane(
      engine,
      discoveryInput({
        at: NOW + 7_200_000,
        routeExpiryMs: NOW + 10_000_000,
        policy: { ...baseBestExecutionPolicy(), maxSettlementMs: 20_000_000 },
      }),
    );
    expect(result.status).toBe("LANE_UNPROVED_GROUNDING");
    if (result.status === "LANE_UNPROVED_GROUNDING") {
      expect(result.reason).toBe("INPUT_ASSET_OBSERVATION_STALE");
    }
  });

  it("a grounded observation for the WRONG account does not prove the lane (exact grounding)", () => {
    const engine = fixtureEngine();
    const wrongAccount = routeLocationObservations(route1Intent()).map((observation) =>
      observation.observationKind === "ONCHAIN_POSITION" ? { ...observation, accountRef: "0x9999" } : observation,
    );
    const result = discoverOnchainLane(engine, discoveryInput({ assetObservations: wrongAccount }));
    expect(result.status).toBe("LANE_UNPROVED_GROUNDING");
  });

  it("invalid discovery input is rejected fail-closed (empty executionId, negative at)", () => {
    expect(() => discoverOnchainLane(fixtureEngine(), discoveryInput({ executionId: "" }))).toThrowError(
      OnchainLaneDiscoveryError,
    );
    expect(() => discoverOnchainLane(fixtureEngine(), discoveryInput({ at: -1 }))).toThrowError(
      /non-negative integer/,
    );
  });

  it("the engine's five-stage laws hold through discovery (INDICATIVE never selectable)", () => {
    const engine = fixtureEngine();
    const venue = fixtureVenue();
    const engineIndicative = new BestExecutionEngine();
    engineIndicative.register({
      ...venue,
      quote: (request, at) => {
        const outcome = venue.quote(request, at);
        return outcome.kind === "QUOTE"
          ? { kind: "QUOTE", quote: { ...outcome.quote, quoteSemantics: "INDICATIVE" as const } }
          : outcome;
      },
    });
    const result = discoverOnchainLane(engineIndicative, discoveryInput());
    expect(result.status).toBe("NO_EXECUTABLE_ROUTE");
    void engine;
  });

  it("determinism: the same discovery inputs produce byte-identical lanes", () => {
    const first = provedFixtureLane();
    const second = provedFixtureLane();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
