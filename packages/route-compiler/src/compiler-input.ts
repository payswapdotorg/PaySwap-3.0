/**
 * @payswap/route-compiler — the compiler input contract (P5-W1).
 *
 * PORT+ADAPT of the old compiler's RouteCompilerInput (MMI-19): the
 * compilation's complete evidence surface. The old input carried 11
 * sibling-package types; the rebuild carries the PINNED shapes (zero
 * sibling imports) plus the INJECTED security-gate evaluator (the real
 * one lives in the security lane):
 *
 * - the neutral intent (economic pin) + the deterministic compile
 *   instant (caller-supplied, refused after expiry);
 * - the corridor view (the capability lane's discovery projection);
 * - the venue engine surface (registered venues + the swap evidence);
 * - the location observations (which rail each neutral funds location
 *   actually is — the old intent-kind dispatch, re-homed as evidence);
 * - the conversion rules, payout constraints and merchant eligibility
 *   evidence;
 * - the routing hints (explicit, never inferred);
 * - every array input is canonically ordered at consumption (the
 *   permutation-invariance law).
 */

import { RouteCompilerInputError } from "./errors.ts";
import { isNonEmptyString } from "./canonical.ts";
import type { MoneyMovementIntent } from "./intent.ts";
import type { RoutingHints } from "./routing-hints.ts";
import type { FiatConversionRule } from "./conversion.ts";
import type { PinnedCorridorView } from "./pins/capability.ts";
import type { FundsLocationObservation } from "./grounding.ts";
import type { ExecutionVenue, SwapRequest } from "./venue-port.ts";
import type { BestExecutionPolicy } from "./policy.ts";
import type { SecurityGateEvaluator, BestExecutionRequest } from "./best-execution.ts";
import type { MerchantSettlementEligibilityEvidence } from "./merchant-legs.ts";
import type { PayoutGateReport } from "./authorization.ts";
import type { PayoutDestination, SettlementDestination } from "./payout-gate.ts";
import type { LiquidityEstimate } from "./liquidity.ts";
import type { PinnedAssetIdentity } from "./pins/onchain.ts";

/** The compiler input (the complete, versioned evidence surface). */
export interface RouteCompilerInput {
  readonly intent: MoneyMovementIntent;
  /** Deterministic compile instant (ms, caller-supplied; no ambient clock). */
  readonly at: number;
  /** The corridor discovery projection (capability lane output, pinned). */
  readonly corridorView: PinnedCorridorView;
  /** The venue registrations the compiler's engine consults. */
  readonly venues: readonly ExecutionVenue[];
  /** The engine request surface for onchain lanes. */
  readonly onchain: {
    readonly policy: BestExecutionPolicy;
    readonly security: BestExecutionRequest["security"];
    readonly instances: BestExecutionRequest["instances"];
    readonly owner: string;
    readonly requestedBy: string;
    readonly routeExpiryMs: number;
  };
  /** The canonical location observations (which rail each location is). */
  readonly locationObservations: readonly FundsLocationObservation[];
  /** The asset observations searched for onchain groundings. */
  readonly assetObservations: readonly FundsLocationObservation[];
  /** Declared conversion rules (the compiler never invents FX). */
  readonly conversionRules: readonly FiatConversionRule[];
  /** Payout constraints: destinations + the REAL gate reports (F-1). */
  readonly payoutConstraints: readonly {
    readonly routeId: string;
    readonly destination: PayoutDestination;
    readonly gateReport: PayoutGateReport;
  }[];
  /** External settlement destinations (the bank arrivals). */
  readonly settlementDestinations: readonly SettlementDestination[];
  /** Provider-verified merchant settlement eligibility evidence. */
  readonly merchantEligibility: readonly MerchantSettlementEligibilityEvidence[];
  /** Liquidity estimates (ADVISORY ONLY — never custody, never authorization). */
  readonly liquidityEstimates: readonly LiquidityEstimate[];
  /** Explicit routing hints (never intent data, never inferred). */
  readonly routingHints?: RoutingHints;
  /** The numeraire policy the compiler scores plans under. */
  readonly scoringPolicy: BestExecutionPolicy;
}

/** Fail-closed validation of the compiler input shape (pre-compile). */
export function validateCompilerInput(input: RouteCompilerInput): void {
  if (typeof input.at !== "number" || !Number.isSafeInteger(input.at) || input.at < 0) {
    throw new RouteCompilerInputError(
      "the compile instant must be a non-negative integer millisecond instant (no ambient clock)",
    );
  }
  if (input.at >= input.intent.expiresAt) {
    throw new RouteCompilerInputError(
      "an expired authorization window compiles nothing (the compile instant is at/after the intent expiry)",
    );
  }
  if (input.corridorView === null || typeof input.corridorView !== "object") {
    throw new RouteCompilerInputError("corridorView must be the capability lane's corridor projection output");
  }
  if (!Array.isArray(input.venues)) {
    throw new RouteCompilerInputError("venues must be an array of registered venue implementations");
  }
  if (!isNonEmptyString(input.onchain.owner) || !isNonEmptyString(input.onchain.requestedBy)) {
    throw new RouteCompilerInputError("the onchain owner and requestedBy references must be non-empty strings");
  }
  if (typeof input.onchain.security?.evaluateGate !== "function") {
    throw new RouteCompilerInputError("the security gate evaluator must be injected (never re-implemented here)");
  }
  if (!Array.isArray(input.locationObservations) || !Array.isArray(input.assetObservations)) {
    throw new RouteCompilerInputError("locationObservations and assetObservations must be arrays");
  }
  if (!Array.isArray(input.conversionRules)) {
    throw new RouteCompilerInputError("conversionRules must be an array of declared rules");
  }
  if (!Array.isArray(input.payoutConstraints) || !Array.isArray(input.settlementDestinations)) {
    throw new RouteCompilerInputError("payoutConstraints and settlementDestinations must be arrays");
  }
  if (!Array.isArray(input.merchantEligibility)) {
    throw new RouteCompilerInputError("merchantEligibility must be an array of provider-verified evidence");
  }
  if (!Array.isArray(input.liquidityEstimates)) {
    throw new RouteCompilerInputError("liquidityEstimates must be an array of advisory estimates");
  }
}

/** The swap-request builder for a lane (deterministic identity scheme). */
export function laneSwapRequest(input: {
  readonly intentRef: string;
  readonly shapeId: string;
  readonly chain: string;
  readonly inputAsset: PinnedAssetIdentity;
  readonly outputAsset: PinnedAssetIdentity;
  readonly amount: { readonly currency: string; readonly minorUnits: string };
}): SwapRequest {
  return {
    requestId: `route-swap:${input.intentRef}:${input.shapeId}`,
    chain: input.chain,
    inputAsset: input.inputAsset,
    outputAsset: input.outputAsset,
    swapKind: "EXACT_INPUT",
    amount: input.amount,
  };
}

/** The injected security-gate evaluator type re-export (input surface). */
export type { SecurityGateEvaluator };
