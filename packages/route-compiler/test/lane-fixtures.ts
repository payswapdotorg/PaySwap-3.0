/**
 * @payswap/route-compiler test fixtures — the engine/lane assembly and
 * the walk inputs (P5-W1).
 */

import { BestExecutionEngine } from "../src/best-execution.ts";
import type { BestExecutionRequest } from "../src/best-execution.ts";
import { discoverOnchainLane } from "../src/onchain-lane.ts";
import { fixtureQuote, fixtureVenue, allowAllGate, baseBestExecutionPolicy, baseSecurity, onchainInstanceFixture } from "./venue-fixtures.ts";
import { CHAIN, NOW, USC_ASSET, ETH_ASSET, OWNER, ORIGIN_ETH_MINOR } from "./fixtures.ts";

/** Build the base engine request for the fixture swap. */
export function baseEngineRequest(overrides?: Partial<BestExecutionRequest>): BestExecutionRequest {
  const security = baseSecurity();
  return {
    executionId: "execution:fixture-lane:001",
    swap: {
      requestId: "route-swap:fixture",
      chain: CHAIN,
      inputAsset: ETH_ASSET,
      outputAsset: USC_ASSET,
      swapKind: "EXACT_INPUT",
      amount: { currency: "ETH", minorUnits: ORIGIN_ETH_MINOR },
    },
    policy: baseBestExecutionPolicy(),
    security: { ...security, evaluateGate: allowAllGate() },
    instances: [onchainInstanceFixture()],
    owner: OWNER,
    beneficiary: OWNER,
    requestedBy: "requester:route-compiler-fixtures",
    routeExpiryMs: NOW + 3_600_000,
    at: NOW,
    ...overrides,
  };
}

/** The engine with the fixture venue registered. */
export function fixtureEngine(): BestExecutionEngine {
  const engine = new BestExecutionEngine();
  engine.register(fixtureVenue());
  return engine;
}

/** Prove a lane through the fixture engine (throws when unproved). */
export function provedFixtureLane(): ReturnType<typeof discoverOnchainLane> {
  const engine = fixtureEngine();
  const request = baseEngineRequest();
  const assetObservations = [
    {
      observationKind: "ONCHAIN_POSITION" as const,
      observationRef: "obs:route-1-origin",
      observationVersion: 1,
      locationRef: "fundsloc:route-1-origin-wallet",
      chainKey: CHAIN,
      accountRef: OWNER,
      assetId: `${CHAIN}/asset:ETH`,
      symbol: "ETH",
      observedAmount: { currency: "ETH", minorUnits: "100000000000000000" },
      freshness: { asOf: "2026-10-03T00:00:00Z", maxAgeSeconds: 3600 },
    },
  ];
  return discoverOnchainLane(engine, {
    executionId: request.executionId,
    swap: request.swap,
    policy: request.policy,
    security: request.security,
    instances: request.instances,
    owner: request.owner,
    beneficiary: request.beneficiary,
    requestedBy: request.requestedBy,
    routeExpiryMs: request.routeExpiryMs,
    at: request.at,
    assetObservations,
  });
}

export { fixtureQuote };
