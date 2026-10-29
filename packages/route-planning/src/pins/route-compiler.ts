/**
 * @payswap/route-planning — the PINNED WIRE SHAPES of the route compiler
 * (P16-A, ADR-0009 D2).
 *
 * LAYER LAW: zero sibling imports. Every mirror below names its AUTHORITY
 * — @payswap/route-compiler (P5-W1). The OUTPUT-side mirrors (plans,
 * results, exclusions, scores, policies) are SUBSET-typed so any genuine
 * authority value remains structurally assignable to the pin while a pin
 * can never widen an authority law. The INPUT-side mirrors (venues,
 * security gate evaluator, conversion rules, payout constraints,
 * merchant evidence, liquidity estimates, location observations, routing
 * hints, the compiler-input surface) moved to ./route-compiler-input.ts
 * (the P22-C 400-line file-law split per the pins/hypotheses.ts
 * precedent — the pin lands split along the module's own documented
 * output/input seam, every consumer import updated, no re-export haze).
 * Vocabulary VALUES are pinned byte-identical (test/pins-fidelity.test.ts).
 */

/**
 * VALUE PIN — authority: @payswap/route-compiler src/shapes.ts
 * `ROUTE_SHAPE_IDS` (the closed shape vocabulary, byte-identical in the
 * authority's order — the plan identity law; grown to TEN members by
 * P22-C/ADR-0016 D5: `cross-provider-corridor`, the fiat -> chain -> fiat
 * corridor over the OBSERVED onchain middle).
 */
export const PINNED_ROUTE_SHAPE_IDS = Object.freeze([
  "onchain-direct-transfer",
  "provider-native-bridge",
  "mixed-dex-bridge",
  "provider-native-offramp",
  "mixed-dex-offramp",
  "provider-native-onramp",
  "mixed-psp-onramp",
  "merchant-native-settlement",
  "merchant-external-payswap-route",
  "cross-provider-corridor",
] as const);
export type PinnedRouteShapeId = (typeof PINNED_ROUTE_SHAPE_IDS)[number];

/**
 * VALUE PIN — authority: @payswap/route-compiler src/shapes.ts
 * `ROUTE_PLAN_CANDIDATE_STATUSES` (the honest candidate-status vocabulary,
 * byte-identical).
 */
export const PINNED_ROUTE_PLAN_CANDIDATE_STATUSES = Object.freeze([
  "EXECUTABLE_CANDIDATE",
  "PROVIDER_NATIVE_BASELINE",
  "INELIGIBLE_CANDIDATE",
  "NOT_COMPARABLE",
] as const);
export type PinnedRoutePlanCandidateStatus = (typeof PINNED_ROUTE_PLAN_CANDIDATE_STATUSES)[number];

/** STRUCTURAL PIN — authority: src/exact-math.ts `ExactRational`. */
export interface PinnedExactRational {
  readonly numerator: string;
  readonly denominator: string;
}

/** STRUCTURAL PIN — authority: src/pins/onchain.ts `PinnedAssetIdentity`. */
export interface PinnedAssetIdentity {
  readonly chain: string;
  readonly assetId: string;
  readonly symbol: string;
}

/** STRUCTURAL PIN — authority: src/pins/onchain.ts `PinnedGateDecision`. */
export type PinnedGateDecision =
  | { readonly decision: "ALLOW"; readonly evidenceRefs: readonly string[] }
  | {
      readonly decision: "BLOCK";
      readonly reasons: readonly { readonly code: string; readonly message: string }[];
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly decision: "UNKNOWN";
      readonly dimensions: readonly { readonly code: string; readonly message: string }[];
      readonly evidenceRefs: readonly string[];
    };

/** STRUCTURAL PIN — authority: src/policy.ts `BestExecutionPolicy`
 * (every constant that influences a scored decision is a DECLARED policy
 * field — no hidden constants).
 */
export interface PinnedBestExecutionPolicy {
  readonly policyId: string;
  readonly version: number;
  readonly numeraire: string;
  readonly conversions: readonly {
    readonly asset: PinnedAssetIdentity;
    readonly rate: PinnedExactRational;
  }[];
  readonly maxSettlementMs: number;
  readonly maxFailureRiskClass: string;
  readonly degradedVenuePolicy: string;
  readonly failureRiskDeductions: Readonly<Record<string, string>>;
  readonly timeCostPerMs: PinnedExactRational;
  readonly allowedVenues?: readonly string[];
  readonly maxRouteHops?: number;
  readonly tieBreakers: readonly string[];
}

/** STRUCTURAL PIN — authority: src/scoring.ts `ValuedComponent` (signed, evidenced). */
export interface PinnedValuedComponent {
  readonly kind: string;
  readonly description: string;
  readonly sourceAmount?: { readonly currency: string; readonly minorUnits: string };
  readonly appliedRate?: PinnedExactRational;
  readonly gasUnits?: string;
  readonly milliseconds?: number;
  readonly riskClass?: string;
  /** SIGNED canonical decimal string: OUTPUT positive; every cost negative. */
  readonly numeraireMinorUnits: string;
}

/** STRUCTURAL PIN — authority: src/scoring.ts `NetOutcomeEvaluation`. */
export interface PinnedNetOutcomeEvaluation {
  readonly candidateId: string;
  readonly numeraire: string;
  readonly components: readonly PinnedValuedComponent[];
  /** The signed BigInt sum of every component (the scored number). */
  readonly netNumeraireMinorUnits: string;
}

/** STRUCTURAL PIN — authority: src/comparability-gate.ts `ComparabilityVerdict`. */
export type PinnedComparabilityVerdict =
  | { readonly comparable: true }
  | {
      readonly comparable: false;
      readonly gaps: readonly {
        readonly legId: string;
        readonly requirement: string;
        readonly code: string;
        readonly detail: string;
      }[];
    };

/** STRUCTURAL PIN — authority: src/custody.ts `CustodyTransfer` (SUBSET). */
export interface PinnedCustodyTransfer {
  readonly from: { readonly kind: string };
  readonly to: { readonly kind: string };
  readonly via?: { readonly kind: string };
  readonly assetRef: string;
  readonly amount: { readonly currency: string; readonly minorUnits: string };
  readonly evidenceRefs: readonly string[];
}

/** STRUCTURAL PIN — authority: src/rail-family.ts `RailCrossingMetric` (SUBSET). */
export interface PinnedRailCrossingMetric {
  readonly crossings: number;
  readonly legs: readonly {
    readonly hopIndex: number;
    readonly fromFamily: string;
    readonly toFamily: string;
    readonly crosses: boolean;
  }[];
}

/** STRUCTURAL PIN — authority: src/leg-contracts.ts `RouteLegBase` (SUBSET). */
export interface PinnedRouteLeg {
  readonly legId: string;
  readonly legKind: string;
  readonly hopIndex: number;
  readonly intentRef: string;
  readonly custody: PinnedCustodyTransfer;
  /** The leg's pricing basis (QUOTE/CONVERSION/INTENT_DECLARED/UNKNOWN). */
  readonly plannedAmount: { readonly basis: string };
  readonly stateGrounding: { readonly groundingFailures: readonly string[] };
  readonly assumptions: readonly unknown[];
  readonly evidenceRefs: readonly string[];
}

/** STRUCTURAL PIN — authority: src/route-plan.ts `RoutePlan` (SUBSET). */
export interface PinnedRoutePlan {
  readonly planId: string;
  readonly shapeId: PinnedRouteShapeId;
  readonly intentRef: string;
  readonly compositionClass: string;
  readonly executionMode: string;
  /** INV-C08: this plan IS the incumbent provider's own native flow. */
  readonly isProviderNativeBaseline: boolean;
  readonly candidateStatus: PinnedRoutePlanCandidateStatus;
  readonly comparability: PinnedComparabilityVerdict;
  readonly ineligibilityReasons: readonly {
    readonly legId: string;
    readonly code: string;
    readonly detail: string;
  }[];
  readonly legs: readonly PinnedRouteLeg[];
  readonly evidenceRefs: readonly string[];
  readonly planDigest: string;
  readonly railCrossings: PinnedRailCrossingMetric;
  readonly environmentClasses: readonly string[];
  /** The scored evaluation (present for comparable plans and baselines). */
  readonly score?: PinnedNetOutcomeEvaluation;
}

/** STRUCTURAL PIN — authority: src/compiler.ts `ExcludedRouteShape`. */
export interface PinnedExcludedRouteShape {
  readonly shapeId: string;
  readonly reasons: readonly string[];
}
/** STRUCTURAL PIN — authority: src/compiler.ts observation version pins. */
export interface PinnedObservationVersionPin {
  readonly instanceId: string;
  readonly observationVersion: number;
  readonly pinnedDigest: string;
}

/**
 * STRUCTURAL PIN — authority: src/compiler.ts `RouteCompilationResult`
 * (the discovery-tier output contract; `discoveryPermitsExecution` is the
 * LITERAL false — preserved as a literal on this pin too).
 */
export interface PinnedRouteCompilationResult {
  readonly status: "ROUTES_COMPILED" | "NO_COMPILABLE_ROUTE";
  readonly intentRef: string;
  readonly compiledAt: number;
  readonly plans: readonly PinnedRoutePlan[];
  readonly exclusions: readonly PinnedExcludedRouteShape[];
  readonly observationVersionPins: readonly PinnedObservationVersionPin[];
  /** LITERAL: the discovery tier never authorizes execution. */
  readonly discoveryPermitsExecution: false;
  readonly compilationDigest: string;
}

/** STRUCTURAL PIN — authority: src/scoring-order.ts `ScoredRoutePlan`. */
export interface PinnedScoredRoutePlan {
  readonly planId: string;
  readonly evaluation: PinnedNetOutcomeEvaluation;
  readonly custodies: readonly PinnedCustodyTransfer[];
  readonly riskClass: "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
  readonly estimatedSettlementMs: number;
  readonly hopCount: number;
}

