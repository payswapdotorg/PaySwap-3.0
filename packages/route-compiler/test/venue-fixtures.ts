/**
 * @payswap/route-compiler test fixtures — the neutral venue, the policies
 * and the injected security-gate evaluators (P5-W1; the old suites'
 * syntheticVenue/basePolicy/baseSecurity discipline, provider-neutral).
 */

import type { ExecutionVenue, SwapRequest } from "../src/venue-port.ts";
import type { VenueQuote } from "../src/quote.ts";
import type { VenueQuoteOutcome } from "../src/quote.ts";
import type { HealthObservation } from "../src/quote-fees.ts";
import type { BestExecutionPolicy } from "../src/policy.ts";
import type { PinnedGateDecision } from "../src/pins/onchain.ts";
import { contentDigest } from "../src/canonical.ts";
import { rationalOf } from "../src/exact-math.ts";
import { CHAIN, NOW } from "./fixtures.ts";

export const VENUE_ID = "fixture-dex-alpha";
export const VENUE_PROTOCOL_KEY = "fixture-dex-router";

/** The reference best-execution policy (every constant declared). */
export function baseBestExecutionPolicy(): BestExecutionPolicy {
  return {
    policyId: "best-execution-policy-fixture",
    version: 1,
    numeraire: "USC",
    conversions: [
      { asset: { chain: CHAIN, assetId: `${CHAIN}/asset:USC`, symbol: "USC" }, rate: rationalOf(1, 1) },
      { asset: { chain: CHAIN, assetId: `${CHAIN}/asset:ETH`, symbol: "ETH" }, rate: rationalOf(3, 1_000_000_000) },
    ],
    maxSettlementMs: 600_000,
    maxFailureRiskClass: "MODERATE",
    degradedVenuePolicy: "ADMIT",
    failureRiskDeductions: {
      LOW: "0",
      MODERATE: "100000",
      ELEVATED: "1000000",
      HIGH: "10000000",
    },
    timeCostPerMs: rationalOf(1, 1000),
    tieBreakers: ["LOWER_RISK_CLASS", "FASTER_SETTLEMENT", "FEWER_HOPS", "VENUE_ID"],
  };
}

/** The deterministic security-policy reference + state (injected gates). */
export function baseSecurity(): {
  policy: { policyId: string; version: number };
  state: { observedAt: number; networkEpoch: bigint };
} {
  return {
    policy: { policyId: "security-policy-fixture", version: 1 },
    state: { observedAt: NOW, networkEpoch: 0n },
  };
}

/** The always-ALLOW gate evaluator (deterministic test injection). */
export function allowAllGate(): (input: { write: { writeDigest: string } }) => PinnedGateDecision {
  return (input) => ({
    decision: "ALLOW",
    evidenceRefs: [`gate-allow:${input.write.writeDigest}`],
  });
}

/** The always-BLOCK gate evaluator (security BLOCK is terminal — rule 27). */
export function blockAllGate(reasonCode = "fixture_block"): (input: { write: { writeDigest: string } }) => PinnedGateDecision {
  return (input) => ({
    decision: "BLOCK",
    reasons: [{ code: reasonCode, message: `the fixture gate blocks write ${input.write.writeDigest}` }],
    evidenceRefs: [`gate-block:${input.write.writeDigest}`],
  });
}

/** The always-UNKNOWN gate evaluator (never converted — INV-X01). */
export function unknownAllGate(): (input: { write: { writeDigest: string } }) => PinnedGateDecision {
  return (input) => ({
    decision: "UNKNOWN",
    dimensions: [{ code: "fixture_unknown_dimension", message: `the fixture gate cannot decide write ${input.write.writeDigest}` }],
    evidenceRefs: [`gate-unknown:${input.write.writeDigest}`],
  });
}

/** The onchain instance fixture (ACTIVE + eligible, the INV-13 scope). */
export function onchainInstanceFixture() {
  return {
    instanceId: "instance:fixture-dex:001",
    capabilityId: `protocol.${CHAIN}:${VENUE_PROTOCOL_KEY}`,
    protocolKey: VENUE_PROTOCOL_KEY,
    chainKey: CHAIN,
    authorizationStatus: "ACTIVE",
    eligible: true,
  };
}

/** The deterministic neutral venue quote. */
export function fixtureQuote(options?: {
  quoteId?: string;
  worstCaseOutputMinor?: string;
  riskClass?: "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
  estimatedSettlementMs?: number;
  quoteSemantics?: "INDICATIVE" | "EXECUTABLE";
  optimizationOrigin?: "PROVIDER_NATIVE" | "COMPOSED";
}): VenueQuote {
  return {
    quoteId: options?.quoteId ?? "quote:fixture-dex:001",
    venueId: VENUE_ID,
    requestId: "route-swap:fixture",
    chain: CHAIN,
    swapKind: "EXACT_INPUT",
    inputAsset: { chain: CHAIN, assetId: `${CHAIN}/asset:ETH`, symbol: "ETH" },
    outputAsset: { chain: CHAIN, assetId: `${CHAIN}/asset:USC`, symbol: "USC" },
    inputAmount: { currency: "ETH", minorUnits: "10000000000000000" },
    quoteSemantics: options?.quoteSemantics ?? "EXECUTABLE",
    fees: [
      {
        feeKind: "VENUE_FEE",
        asset: { chain: CHAIN, assetId: `${CHAIN}/asset:ETH`, symbol: "ETH" },
        minorUnits: "300000000000000",
        description: "the fixture venue's declared swap fee",
      },
    ],
    gasCost: {
      gasUnits: "160000",
      pricePerUnitNativeMinor: { numerator: "3", denominator: "1000000000000000000" },
      feeAsset: { chain: CHAIN, assetId: `${CHAIN}/asset:ETH`, symbol: "ETH" },
    },
    slippage: {
      protection: "DECLARED_LIMIT",
      worstCaseOutput: { currency: "USC", minorUnits: options?.worstCaseOutputMinor ?? "3200000" },
      limitBasisPoints: 50,
      expectedOutput: { currency: "USC", minorUnits: "3300000" },
    },
    failureRisk: {
      riskClass: options?.riskClass ?? "LOW",
      retryPolicy: "SAFE_TO_RETRY",
      description: "the fixture venue's declared failure risk",
    },
    timeToSettlement: {
      estimatedMs: options?.estimatedSettlementMs ?? 120_000,
      finalityModel: "PROBABILISTIC",
      description: "the fixture venue's declared settlement estimate",
    },
    routeShape: [
      { venue: VENUE_ID, chain: CHAIN, description: "the fixture venue's single hop" },
    ],
    optimizationOrigin: options?.optimizationOrigin ?? "COMPOSED",
    freshness: { asOfMs: NOW, maxAgeMs: 10_000 },
    provenance: {
      providerName: "venue-fixture",
      source: "VENUE_API",
      capturedAtMs: NOW,
      evidenceRefs: ["fixture:venue-quote:001"],
    },
    observer: { observerId: "observer:fixture-dex", observerKind: "VENUE_API" },
  };
}

/** The neutral test venue (the full port surface, deterministic). */
export function fixtureVenue(options?: {
  quoteOutcome?: "QUOTE" | "UNAVAILABLE" | "OUTCOME_UNKNOWN";
  quote?: VenueQuote;
  healthStatus?: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";
  nativeBaseline?: boolean;
  planWriteThrows?: boolean;
}): ExecutionVenue {
  const quote = options?.quote ?? fixtureQuote();
  return {
    descriptor: {
      venueId: VENUE_ID,
      displayName: "Fixture DEX Alpha (neutral test venue)",
      chains: [CHAIN],
      swapKinds: ["EXACT_INPUT"],
      quoteSemantics: "EXECUTABLE",
      slippageProtection: "DECLARED_LIMIT",
      supportsSimulation: false,
      ...(options?.nativeBaseline === true
        ? {
            nativeOptimization: {
              optimizationKind: "ROUTER_NATIVE_PATH_SELECTION",
              benchmarkBaseline: true as const,
              description: "the fixture venue's provider-native baseline declaration",
            },
          }
        : {}),
    },
    protocol: { protocolKey: VENUE_PROTOCOL_KEY, chainKey: CHAIN },
    quote(request: SwapRequest, at: number): VenueQuoteOutcome {
      void at;
      if (options?.quoteOutcome === "UNAVAILABLE") {
        return { kind: "UNAVAILABLE", reason: "the fixture venue declares itself unavailable for this request" };
      }
      if (options?.quoteOutcome === "OUTCOME_UNKNOWN") {
        return { kind: "OUTCOME_UNKNOWN", reason: "the fixture venue could not observe a quote" };
      }
      return { kind: "QUOTE", quote: { ...quote, requestId: request.requestId } };
    },
    observeHealth(at: number): HealthObservation {
      void at;
      return {
        status: options?.healthStatus ?? "HEALTHY",
        observedAtMs: NOW,
        maxAgeMs: 30_000,
        provenance: {
          providerName: "venue-fixture",
          source: "VENUE_API",
          capturedAtMs: NOW,
          evidenceRefs: ["fixture:venue-health:001"],
        },
      };
    },
    planWrite(input): { writeId: string; action: string; chain: string; route: { routeId: string; routeHash: string }; expiry: number; requestedBy: string; writeDigest: string; preparedAt: number } {
      if (options?.planWriteThrows === true) {
        throw new Error("the fixture venue's write planning throws (the contained-failure law)");
      }
      const write = {
        writeId: `write:fixture:${input.routeRef}`,
        action: "onchain.swap",
        chain: input.quote.chain,
        route: { routeId: input.routeRef, routeHash: input.routeHash },
        expiry: input.expiryMs,
        requestedBy: input.requestedBy,
        preparedAt: NOW,
      };
      return { ...write, writeDigest: contentDigest(write) };
    },
  };
}
