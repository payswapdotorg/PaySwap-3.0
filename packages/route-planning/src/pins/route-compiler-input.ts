/**
 * @payswap/route-planning — the PINNED INPUT-side wire shapes of the
 * route compiler (P22-C, ADR-0016; the 400-line file-law split of
 * ./route-compiler.ts per the pins/hypotheses.ts precedent).
 *
 * LAYER LAW: zero sibling imports. Every mirror below names its AUTHORITY
 * — @payswap/route-compiler (P5-W1). These are the INPUT-side mirrors:
 * the compiler's injected evidence adapters (venues, the security gate
 * evaluator, conversion rules, payout constraints, merchant evidence,
 * liquidity estimates, location observations, routing hints) modeled as
 * PASS-THROUGH pinned types — carried verbatim to the compilation port,
 * never interpreted; the REAL compiler validates its full input
 * fail-closed. The OUTPUT-side mirrors (plans, results, exclusions,
 * scores, policies) stay in ./route-compiler.ts.
 */

import type { MoneyMovementIntentPin } from "./economic.ts";
import type { PinnedCorridorView } from "./capability.ts";
import type { PinnedAssetIdentity, PinnedBestExecutionPolicy, PinnedExactRational, PinnedGateDecision } from "./route-compiler.ts";

/**
 * STRUCTURAL PIN — authority: src/best-execution.ts
 * `SecurityGateEvaluator` (the injected gate evaluator; the REAL one
 * lives in the security lane — never re-implemented here).
 */
export type PinnedSecurityGateEvaluator = (input: {
  readonly write: {
    readonly writeId: string;
    readonly action: string;
    readonly chain: string;
    readonly route: { readonly routeId: string; readonly routeHash: string };
    readonly expiry: number;
    readonly requestedBy: string;
    readonly writeDigest: string;
    readonly preparedAt: number;
  };
  readonly policy: unknown;
  readonly securityState: unknown;
  readonly at: number;
}) => PinnedGateDecision;

/**
 * STRUCTURAL PIN — authority: src/venue-port.ts `ExecutionVenue`
 * (SUBSET: the port surface; descriptor/protocol carried as the identity
 * the planner sees, the quote/health/write-planning methods opaque —
 * method syntax keeps every genuine authority venue assignable).
 */
export interface PinnedExecutionVenue {
  readonly descriptor: {
    readonly venueId: string;
    readonly displayName: string;
    readonly chains: readonly string[];
  };
  readonly protocol: { readonly protocolKey: string; readonly chainKey: string };
  quote(request: unknown, at: number): unknown;
  observeHealth(at: number): unknown;
  planWrite(input: unknown): unknown;
}

/** STRUCTURAL PIN — authority: src/conversion.ts `FiatConversionRule`. */
export interface PinnedFiatConversionRule {
  readonly ruleId: string;
  readonly fromCurrency: string;
  readonly toCurrency: string;
  readonly rate: PinnedExactRational;
  readonly declaredBy: string;
}

/** STRUCTURAL PIN — authority: src/payout-gate.ts `PayoutDestination`. */
export interface PinnedPayoutDestination {
  readonly kind: "PROVIDER_BANK_INSTRUMENT";
  readonly providerDestinationRef: string;
}

/** STRUCTURAL PIN — authority: src/payout-gate.ts `SettlementDestination`. */
export interface PinnedSettlementDestination {
  readonly destinationId: string;
  readonly kind: "BANK_ACCOUNT";
  readonly currency: string;
  readonly externalRef: string;
  readonly provenance: {
    readonly source: string;
    readonly reference: string;
    readonly recordedAt: bigint;
  };
}

/** STRUCTURAL PIN — authority: src/merchant-legs.ts `MerchantSettlementEligibilityEvidence`. */
export interface PinnedMerchantEligibilityEvidence {
  readonly evidenceId: string;
  readonly providerName: string;
  readonly merchantAccountRef: string;
  readonly currency: string;
  readonly eligible: true;
  readonly providerVerified: true;
  readonly verificationRef: string;
  readonly observedAt: string;
  readonly freshness: { readonly asOf: string; readonly maxAgeSeconds: number };
  readonly awaitingAuthority: string;
}

/** STRUCTURAL PIN — authority: src/liquidity.ts `LiquidityEstimate` (ADVISORY ONLY). */
export interface PinnedLiquidityEstimate {
  readonly estimateId: string;
  readonly model: string;
  readonly venueId: string;
  readonly assetPair: { readonly inputSymbol: string; readonly outputSymbol: string };
  readonly declaredDepthMinorUnits: string;
  readonly declaredImpactBasisPoints: number;
  readonly advisoryOnly: true;
  readonly observedAt: string;
  readonly freshness: { readonly asOf: string; readonly maxAgeSeconds: number };
  readonly evidenceRefs: readonly string[];
}

/** STRUCTURAL PIN — authority: src/grounding.ts
 * `FundsLocationObservation` (SUBSET: the common observation surface —
 * kind/ref/version/location/freshness; the per-kind rail detail is owned
 * by the compiler's grounding, opaque here).
 */
export interface PinnedFundsLocationObservation {
  readonly observationKind: string;
  readonly observationRef: string;
  readonly observationVersion: number;
  readonly locationRef: string;
  readonly freshness: { readonly asOf: string; readonly maxAgeSeconds: number };
}

/** STRUCTURAL PIN — authority: src/routing-hints.ts `RoutingHints`. */
export interface PinnedRoutingHints {
  readonly intermediateAsset?: PinnedAssetIdentity;
  readonly bridgeDepositAsset?: PinnedAssetIdentity;
  readonly bridgeProtocol?: { readonly protocolKey: string; readonly chainKey: string };
  readonly offRampDeposit?: {
    readonly providerName: string;
    readonly chainKey: string;
    readonly accountRef: string;
  };
  readonly onrampDeliveryAccount?: { readonly chainKey: string; readonly accountRef: string };
  readonly offRampPayoutRouteId?: string;
  readonly nativeBaselineRouteId?: string;
}

/**
 * STRUCTURAL PIN — authority: src/compiler-input.ts `RouteCompilerInput`
 * (the compilation's complete evidence surface, re-typed over this
 * package's pins; every injected adapter is carried VERBATIM — the REAL
 * compiler validates the full input fail-closed).
 */
export interface RouteCompilerInputPin {
  readonly intent: MoneyMovementIntentPin;
  /** Deterministic compile instant (ms, caller-supplied; no ambient clock). */
  readonly at: number;
  readonly corridorView: PinnedCorridorView;
  readonly venues: readonly PinnedExecutionVenue[];
  readonly onchain: {
    readonly policy: PinnedBestExecutionPolicy;
    readonly security: {
      readonly policy: { readonly policyId: string; readonly version: number };
      readonly state: unknown;
      readonly evaluateGate: PinnedSecurityGateEvaluator;
    };
    readonly instances: readonly {
      readonly instanceId: string;
      readonly capabilityId: string;
      readonly protocolKey: string;
      readonly chainKey: string;
      readonly authorizationStatus: string;
      readonly eligible: boolean;
    }[];
    readonly owner: string;
    readonly requestedBy: string;
    readonly routeExpiryMs: number;
  };
  readonly locationObservations: readonly PinnedFundsLocationObservation[];
  readonly assetObservations: readonly PinnedFundsLocationObservation[];
  readonly conversionRules: readonly PinnedFiatConversionRule[];
  readonly payoutConstraints: readonly {
    readonly routeId: string;
    readonly destination: PinnedPayoutDestination;
    readonly gateReport: unknown;
  }[];
  readonly settlementDestinations: readonly PinnedSettlementDestination[];
  readonly merchantEligibility: readonly PinnedMerchantEligibilityEvidence[];
  readonly liquidityEstimates: readonly PinnedLiquidityEstimate[];
  readonly routingHints?: PinnedRoutingHints;
  readonly scoringPolicy: PinnedBestExecutionPolicy;
}
