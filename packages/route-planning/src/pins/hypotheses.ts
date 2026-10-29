/**
 * @payswap/route-planning — the PINNED WIRE SHAPES of the multi-hop
 * hypothesis tier (P23-C, lane C; ADR-0015 D5 + appendix A.5/A.6).
 *
 * LAYER LAW: zero sibling imports. The hypothetical-view discipline extends
 * the Lab intervention PATTERN into route-planning's own advisory tier
 * WITHOUT crossing INV-L01: an assumed element is a DISTINCT pinned type
 * (an `assumed: true` brand), never a fake real rail, never carrying
 * fabricated observation ids or instance ids, provider names as plain
 * assumed strings. A RouteHypothesis is NEVER a RoutePlan, never enters
 * available-now, never feeds eligibility; the frozen nine-shape vocabulary
 * is UNCHANGED (the P21-0 C8 law) — a hypothesis CITES a shape skeleton as
 * provenance (`shapeId` + the leg-kind sequence), never compiles one.
 *
 * Pins in this module:
 * - the augmentation kinds (A.5) + the verification vocabulary (A.6)
 * - the assumed-element structural pins (rail / conversion asset /
 *   connector operation) + the augmentation union
 * - the hypothetical corridor view + the route hypothesis + the cited
 *   shape skeleton (reusing PINNED_ROUTE_SHAPE_IDS from pins/route-compiler.ts)
 * - the route-leg kind vocabulary (authority: @payswap/route-compiler
 *   src/leg-kinds.ts `ROUTE_LEG_KINDS` — mirrored HERE, not in
 *   pins/route-compiler.ts, because that module stands at the 400-line
 *   file-law edge; the pin lands with its only consumer)
 */

import type { PinnedRouteShapeId } from "./route-compiler.ts";

/**
 * VALUE PIN — authority: ADR-0015 appendix A.5: the hypothetical
 * augmentation kinds (frozen).
 */
export const PINNED_HYPOTHESIS_AUGMENTATION_KINDS = Object.freeze([
  "ADD_ASSUMED_RAIL",
  "ADD_ASSUMED_CONVERSION_ASSET",
  "ADD_ASSUMED_CONNECTOR_OPERATION",
] as const);

/**
 * VALUE PIN — authority: ADR-0015 appendix A.6: the verification pairing
 * vocabulary (`PLANNER_VERIFIED` — the D5 re-run composed a rank-eligible
 * route over the real sub-views — vs `UNVERIFIED` with the honest
 * remaining reason).
 */
export const PINNED_HYPOTHESIS_VERIFICATION_STATUSES = Object.freeze([
  "PLANNER_VERIFIED", "UNVERIFIED",
] as const);

/**
 * VALUE PIN — authority: @payswap/route-compiler src/leg-kinds.ts
 * `ROUTE_LEG_KINDS` (the closed 8-kind leg vocabulary, byte-identical in
 * the authority's order). Pinned here per the module note above.
 */
export const PINNED_ROUTE_LEG_KINDS = Object.freeze([
  "FIAT_PSP_COLLECT",
  "PSP_STABLECOIN_ISSUANCE",
  "OFF_RAMP_PAYOUT",
  "BANK_SETTLEMENT",
  "ONCHAIN_DEX_SWAP",
  "ONCHAIN_TRANSFER",
  "ONCHAIN_BRIDGE",
  "MERCHANT_BALANCE_SETTLEMENT",
] as const);

export type PinnedHypothesisAugmentationKind = (typeof PINNED_HYPOTHESIS_AUGMENTATION_KINDS)[number];
export type PinnedHypothesisVerification = (typeof PINNED_HYPOTHESIS_VERIFICATION_STATUSES)[number];
export type PinnedLegKind = (typeof PINNED_ROUTE_LEG_KINDS)[number];

/**
 * STRUCTURAL PIN — an ASSUMED rail (DISTINCT from every real rail type:
 * the `assumed: true` brand, NO observation id, NO instance id, the
 * provider name a plain assumed string). Never a fake real rail.
 */
export interface PinnedAssumedRail {
  readonly assumed: true;
  readonly assumedRailId: string;
  readonly providerName: string;
  readonly railKind: "ONCHAIN" | "FIAT" | "FX";
  readonly sourceCurrency: string;
  readonly destinationCurrency: string;
  readonly summary: string;
}

/**
 * STRUCTURAL PIN — an ASSUMED conversion asset (the same distinct-type
 * laws: assumed brand, no observation/instance ids, no invented symbols —
 * only the corridor's real conversion dimensions).
 */
export interface PinnedAssumedConversionAsset {
  readonly assumed: true;
  readonly assumedAssetId: string;
  readonly fromCurrency: string;
  readonly toCurrency: string;
  readonly summary: string;
}

/**
 * STRUCTURAL PIN — an ASSUMED connector operation (the same distinct-type
 * laws; the operation kind is the catalogue's declared label).
 */
export interface PinnedAssumedConnectorOperation {
  readonly assumed: true;
  readonly assumedOperationId: string;
  readonly providerName: string;
  readonly operationKind: string;
  readonly sourceCurrency: string;
  readonly destinationCurrency: string;
  readonly summary: string;
}

/**
 * STRUCTURAL PIN — exactly ONE named augmentation (A.5): the kind + the
 * assumed element payload.
 */
export type PinnedHypotheticalAugmentation =
  | { readonly kind: "ADD_ASSUMED_RAIL"; readonly rail: PinnedAssumedRail }
  | { readonly kind: "ADD_ASSUMED_CONVERSION_ASSET"; readonly asset: PinnedAssumedConversionAsset }
  | { readonly kind: "ADD_ASSUMED_CONNECTOR_OPERATION"; readonly operation: PinnedAssumedConnectorOperation };

/**
 * STRUCTURAL PIN — the cited frozen shape skeleton (PROVENANCE ONLY — a
 * hypothesis never compiles a plan; the nine-shape vocabulary is
 * unchanged, the P21-0 C8 law). `shapeId` is one of the NINE pinned
 * PINNED_ROUTE_SHAPE_IDS; `legKindSequence` cites the skeleton's leg-kind
 * sequence over the pinned 8-kind vocabulary.
 */
export interface PinnedCitedShapeSkeleton {
  readonly shapeId: PinnedRouteShapeId;
  readonly legKindSequence: readonly PinnedLegKind[];
}

/**
 * STRUCTURAL PIN — one hypothesis segment: an id + the honest label (a
 * real planner-verified segment, or an assumed element).
 */
export interface PinnedHypothesisSegment {
  readonly segmentId: string;
  readonly label: "VERIFIED" | "ASSUMED";
}

/**
 * STRUCTURAL PIN — the hypothetical corridor view: the REAL merged base
 * view + exactly ONE assumed element, with the variant identity
 * `hypothesis:<baseViewDigest>:<operatorId>` (the one-change law).
 */
export interface PinnedHypotheticalCorridorView {
  readonly variantId: string;
  readonly baseViewDigest: string;
  readonly operatorId: string;
  readonly baseView: {
    readonly projectionVersion: string;
    readonly query: {
      readonly sourceCountry: string;
      readonly destinationCountry: string;
      readonly sourceCurrency: string;
      readonly destinationCurrency: string;
      readonly asOf: string;
    };
    readonly routes: readonly unknown[];
    readonly eligibleRoutes: readonly unknown[];
  };
  readonly augmentation: PinnedHypotheticalAugmentation;
  readonly hypotheticalViewDigest: string;
}

/**
 * STRUCTURAL PIN — the RouteHypothesis (D5): the assumption (verbatim
 * augmentation), the verified segments (the REAL planner re-run over the
 * REAL sub-views — ids only, labeled verified), the hypothetical segments
 * (labeled assumed), the cited shape skeleton (provenance, never a
 * compiled plan), the blockers (the remaining REAL exclusions verbatim),
 * the honest structural assessment, and the never-executable advisory
 * literals. NEVER a RoutePlan.
 */
export interface PinnedRouteHypothesis {
  readonly hypothesisId: string;
  readonly operatorId: string;
  readonly assumption: PinnedHypotheticalAugmentation;
  readonly verifiedSegments: readonly PinnedHypothesisSegment[];
  readonly hypotheticalSegments: readonly PinnedHypothesisSegment[];
  readonly citedShapeSkeleton: PinnedCitedShapeSkeleton;
  readonly blockers: readonly {
    readonly side: "SENDER" | "RECIPIENT";
    readonly routeId: string;
    readonly code: string;
    readonly message: string;
    readonly fundingMethod?: string;
  }[];
  readonly wouldCompose: boolean;
  readonly verification: PinnedHypothesisVerification;
  readonly verificationReason: string;
  readonly neverExecutable: true;
  readonly advisoryOnly: true;
  readonly derivedAt: number;
  readonly hypothesisDigest: string;
}
