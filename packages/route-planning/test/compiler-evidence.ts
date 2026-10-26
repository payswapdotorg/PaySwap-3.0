/**
 * @payswap/route-planning test fixtures — the compiler evidence bundle
 * (P16-A): the REAL @payswap/route-compiler bound through the
 * RouteCompilationPort. The venue, gate evaluator, conversion rules,
 * payout constraint, settlement destinations, merchant evidence,
 * liquidity estimate, location observations, routing hints and policies
 * are real-shaped values (the route-compiler battery's proven fixture
 * discipline, rebuilt here with this package's own constants); the port
 * adapter invokes the REAL compileMoneyMovementRoute.
 */

import { compileMoneyMovementRoute } from "../../route-compiler/src/compiler.ts";
import type { RouteCompilerInput } from "../../route-compiler/src/compiler-input.ts";
import type { ExecutionVenue } from "../../route-compiler/src/venue-port.ts";
import type { RouteCompilationPort } from "../src/ports.ts";
import type { RouteCompilerEvidenceBundle } from "../src/candidates.ts";
import {
  CHAIN,
  DESTINATION_IBAN,
  NOW,
  NOW_ISO,
  ORIGIN_WALLET,
  PSP_PROVIDER,
  RECIPIENT_INSTANCE_ID,
  SENDER_INSTANCE_ID,
} from "./fixtures.ts";

export const VENUE_ID = "planning-dex-alpha";
export const USC_ASSET = Object.freeze({
  chain: CHAIN,
  assetId: `${CHAIN}/asset:USC`,
  symbol: "USC",
});
export const ETH_ASSET = Object.freeze({
  chain: CHAIN,
  assetId: `${CHAIN}/asset:ETH`,
  symbol: "ETH",
});

/** The deterministic security-policy reference + state (injected). */
export function planningSecurity() {
  return {
    policy: { policyId: "security-policy-planning", version: 1 },
    state: { observedAt: NOW, networkEpoch: 0n },
  };
}

/** The always-ALLOW gate evaluator (deterministic test injection). */
export function allowAllGate() {
  return (input: { write: { writeDigest: string } }) => ({
    decision: "ALLOW" as const,
    evidenceRefs: [`gate-allow:${input.write.writeDigest}`],
  });
}

/** The reference best-execution policy (every constant declared). */
export function planningBestExecutionPolicy() {
  return {
    policyId: "best-execution-policy-planning",
    version: 1,
    numeraire: "USC",
    conversions: [
      { asset: USC_ASSET, rate: { numerator: "1", denominator: "1" } },
      { asset: ETH_ASSET, rate: { numerator: "3", denominator: "1000000000" } },
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
    timeCostPerMs: { numerator: "1", denominator: "1000" },
    tieBreakers: [
      "LOWER_RISK_CLASS",
      "FASTER_SETTLEMENT",
      "FEWER_HOPS",
      "FEWER_RAIL_CROSSINGS",
      "PLAN_ID",
    ],
  };
}

/** The neutral deterministic test venue (the full port surface). */
export function planningVenue(): ExecutionVenue {
  const quote = {
    quoteId: "quote:planning-dex:001",
    venueId: VENUE_ID,
    requestId: "route-swap:fixture",
    chain: CHAIN,
    swapKind: "EXACT_INPUT" as const,
    inputAsset: ETH_ASSET,
    outputAsset: USC_ASSET,
    inputAmount: { currency: "ETH", minorUnits: "10000000000000000" },
    quoteSemantics: "EXECUTABLE" as const,
    fees: [
      {
        feeKind: "VENUE_FEE",
        asset: ETH_ASSET,
        minorUnits: "300000000000000",
        description: "the planning venue's declared swap fee",
      },
    ],
    gasCost: {
      gasUnits: "160000",
      pricePerUnitNativeMinor: { numerator: "3", denominator: "1000000000000000000" },
      feeAsset: ETH_ASSET,
    },
    slippage: {
      protection: "DECLARED_LIMIT" as const,
      worstCaseOutput: { currency: "USC", minorUnits: "3200000" },
      limitBasisPoints: 50,
      expectedOutput: { currency: "USC", minorUnits: "3300000" },
    },
    failureRisk: {
      riskClass: "LOW" as const,
      retryPolicy: "SAFE_TO_RETRY" as const,
      description: "the planning venue's declared failure risk",
    },
    timeToSettlement: {
      estimatedMs: 120_000,
      finalityModel: "PROBABILISTIC" as const,
      description: "the planning venue's declared settlement estimate",
    },
    routeShape: [{ venue: VENUE_ID, chain: CHAIN, description: "single hop" }],
    optimizationOrigin: "COMPOSED" as const,
    freshness: { asOfMs: NOW, maxAgeMs: 10_000 },
    provenance: {
      providerName: "venue-planning-fixture",
      source: "VENUE_API" as const,
      capturedAtMs: NOW,
      evidenceRefs: ["planning:venue-quote:001"],
    },
    observer: { observerId: "observer:planning-dex", observerKind: "VENUE_API" as const },
  };
  return {
    descriptor: {
      venueId: VENUE_ID,
      displayName: "Planning DEX Alpha (neutral test venue)",
      chains: [CHAIN],
      swapKinds: ["EXACT_INPUT"],
      quoteSemantics: "EXECUTABLE",
      slippageProtection: "DECLARED_LIMIT",
      supportsSimulation: false,
    },
    protocol: { protocolKey: "planning-dex-router", chainKey: CHAIN },
    quote(request, at) {
      void at;
      return { kind: "QUOTE", quote: { ...quote, requestId: request.requestId } };
    },
    observeHealth(at) {
      void at;
      return {
        status: "HEALTHY",
        observedAtMs: NOW,
        maxAgeMs: 30_000,
        provenance: {
          providerName: "venue-planning-fixture",
          source: "VENUE_API",
          capturedAtMs: NOW,
          evidenceRefs: ["planning:venue-health:001"],
        },
      };
    },
    planWrite(input) {
      const write = {
        writeId: `write:planning:${input.routeRef}`,
        action: "onchain.swap",
        chain: input.quote.chain,
        route: { routeId: input.routeRef, routeHash: input.routeHash },
        expiry: input.expiryMs,
        requestedBy: input.requestedBy,
        preparedAt: NOW,
      };
      return { ...write, writeDigest: `fnv1a64:${write.writeId.length.toString(16).padStart(16, "0")}` };
    },
  };
}

/** The declared conversion rules (the compiler never invents FX). */
export function planningConversionRules() {
  return [
    {
      ruleId: "rule:usc-eur",
      fromCurrency: "USC",
      toCurrency: "EUR",
      rate: { numerator: "92", denominator: "1000000" },
      declaredBy: "planning:peg-declaration",
    },
    {
      ruleId: "rule:eth-eur",
      fromCurrency: "ETH",
      toCurrency: "EUR",
      rate: { numerator: "276", denominator: "1000000000000000" },
      declaredBy: "planning:peg-declaration",
    },
  ];
}

/** The payout constraint (explicit external destination + REAL gate report). */
export function planningPayoutConstraint(routeId: string) {
  return {
    routeId,
    destination: { kind: "PROVIDER_BANK_INSTRUMENT" as const, providerDestinationRef: DESTINATION_IBAN },
    gateReport: {
      allowed: true,
      checks: [
        { gate: "TRANSFER_OUT_GRANT_EXISTS", pass: true, reason: "the transfer-out grant exists" },
        { gate: "CURRENCY_SCOPE", pass: true, reason: "the payout currency is in scope" },
        { gate: "LIMITS", pass: true, reason: "the payout amount is within limits" },
        { gate: "NOT_EXPIRED", pass: true, reason: "the grant is unexpired" },
        { gate: "DESTINATION_EXPLICIT_EXTERNAL", pass: true, reason: "the destination is explicit and external" },
        { gate: "PROVIDER_STEP_UP", pass: true, reason: "no step-up required" },
      ],
      evidenceRefs: ["planning:payout-gate:001"],
    },
  };
}

/** The external settlement destinations (the bank arrivals). */
export function planningSettlementDestinations() {
  return [
    {
      destinationId: "dest:planning-bank-eur",
      kind: "BANK_ACCOUNT" as const,
      currency: "EUR",
      externalRef: DESTINATION_IBAN,
      provenance: { source: "planning-fixtures", reference: "dest:planning-bank-eur", recordedAt: 1_000_000_000_000n },
    },
  ];
}

/** The provider-verified merchant settlement eligibility evidence. */
export function planningMerchantEvidence() {
  return [
    {
      evidenceId: "merchant-eligibility:planning-1",
      providerName: PSP_PROVIDER,
      merchantAccountRef: "acct-merchant-planning",
      currency: "USD",
      eligible: true as const,
      providerVerified: true as const,
      verificationRef: "merchant-verify:planning-1",
      observedAt: NOW_ISO,
      freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
      awaitingAuthority: "P5-W3",
    },
  ];
}

/** The advisory liquidity estimate (advisory-only law). */
export function planningLiquidityEstimate() {
  return [
    {
      estimateId: "liquidity:planning:001",
      model: "POOL_STATE",
      venueId: VENUE_ID,
      assetPair: { inputSymbol: "ETH", outputSymbol: "USC" },
      declaredDepthMinorUnits: "1000000000",
      declaredImpactBasisPoints: 30,
      advisoryOnly: true as const,
      observedAt: NOW_ISO,
      freshness: { asOf: NOW_ISO, maxAgeSeconds: 60 },
      evidenceRefs: ["planning:liquidity:001"],
    },
  ];
}

/** The location observations (which rail each neutral location is). */
export function planningLocationObservations() {
  return [
    {
      observationKind: "ONCHAIN_POSITION",
      observationRef: "obs:planning-origin",
      observationVersion: 1,
      locationRef: "fundsloc:planning-origin-wallet",
      chainKey: CHAIN,
      accountRef: ORIGIN_WALLET,
      assetId: `${CHAIN}/asset:ETH`,
      symbol: "ETH",
      observedAmount: { currency: "ETH", minorUnits: "100000000000000000" },
      freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
    },
    {
      observationKind: "BANK_INSTRUMENT",
      observationRef: "obs:planning-destination",
      observationVersion: 1,
      locationRef: "fundsloc:planning-destination-bank",
      externalRef: DESTINATION_IBAN,
      currency: "EUR",
      freshness: { asOf: NOW_ISO, maxAgeSeconds: 3600 },
    },
  ];
}

/** The explicit routing hints (never intent data, never inferred). */
export function planningRoutingHints() {
  return {
    intermediateAsset: USC_ASSET,
    offRampDeposit: {
      providerName: PSP_PROVIDER,
      chainKey: CHAIN,
      accountRef: "0x5555555555555555555555555555555555555555",
    },
    offRampPayoutRouteId: RECIPIENT_INSTANCE_ID,
    nativeBaselineRouteId: SENDER_INSTANCE_ID,
  };
}

/** The onchain engine bundle (policy + injected security + instances). */
export function planningOnchainBundle() {
  const security = planningSecurity();
  return {
    policy: planningBestExecutionPolicy(),
    security: { ...security, evaluateGate: allowAllGate() },
    instances: [
      {
        instanceId: "instance:planning-dex:001",
        capabilityId: `protocol.${CHAIN}:planning-dex-router`,
        protocolKey: "planning-dex-router",
        chainKey: CHAIN,
        authorizationStatus: "ACTIVE",
        eligible: true,
      },
    ],
    owner: ORIGIN_WALLET,
    requestedBy: "requester:route-planning-fixtures",
    routeExpiryMs: NOW + 3_600_000,
  };
}

/** The complete evidence bundle the enumeration carries verbatim. */
export function planningEvidenceBundle(): RouteCompilerEvidenceBundle {
  return {
    venues: [planningVenue()],
    onchain: planningOnchainBundle(),
    locationObservations: planningLocationObservations(),
    assetObservations: planningLocationObservations(),
    conversionRules: planningConversionRules(),
    payoutConstraints: [planningPayoutConstraint(RECIPIENT_INSTANCE_ID)],
    settlementDestinations: planningSettlementDestinations(),
    merchantEligibility: planningMerchantEvidence(),
    liquidityEstimates: planningLiquidityEstimate(),
    routingHints: planningRoutingHints(),
    scoringPolicy: planningBestExecutionPolicy(),
  };
}

/**
 * The REAL route compilation port: invokes the REAL
 * compileMoneyMovementRoute over the pinned input (the composition-root
 * adapter; the REAL compiler validates its full input fail-closed).
 */
export function realRouteCompilationPort(): RouteCompilationPort {
  return {
    compile(pinned) {
      return compileMoneyMovementRoute(pinned as unknown as RouteCompilerInput);
    },
  };
}
