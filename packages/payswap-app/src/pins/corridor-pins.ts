/**
 * @payswap/app — the CORRIDOR PINS (P22-B, ADR-0016 — the app-side
 * structural mirror of the cross-provider corridor vocabulary).
 *
 * LAYER LAW (MODULE-OWNERSHIP.yaml, the established pins pattern — see
 * pins/onchain-pins.ts): @payswap/app src NEVER imports a @payswap/*
 * workspace package (product law P2, machine-checked). The corridor's
 * vocabulary is therefore pinned STRUCTURALLY here — same literals, same
 * order — against TWO authorities, verified test-only by
 * test/payswap/corridor-pins-mirror.test.ts through relative imports:
 *
 * - the ROUTE authority: @payswap/route-planning src/pins/corridor.ts
 *   (the P22-C lane's frozen pin contract, byte-identical to the
 *   ADR-0016 appendix);
 * - the PRESENTATION authority: @payswap/surface src/corridor-plan.ts
 *   (the P22-B presentation contract — the fold the panels project).
 *
 * The composite-act facts (the plan digest + the leg count the
 * authorization scope may carry — ADR-0016 D6) are pinned against the
 * ADR's named field shapes, mirroring the host authorization-gate growth
 * by value.
 */

/** VALUE PIN — authority: route-planning pins/corridor.ts `PINNED_STELLAR_CHAIN_KEY` (ADR-0016 appendix). */
export const PINNED_STELLAR_CHAIN_KEY = "stellar:testnet" as const;

/** VALUE PIN — authority: route-planning pins/corridor.ts `PINNED_CORRIDOR_RELAY_RAIL` (ADR-0016 appendix). */
export const PINNED_CORRIDOR_RELAY_RAIL = Object.freeze({
  railKind: "ONCHAIN",
  railKey: PINNED_STELLAR_CHAIN_KEY,
} as const);

/** VALUE PIN — authority: route-planning pins/corridor.ts `PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD` (the appendix acceptance addendum). */
export const PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD = "flutterwave_ghs_mobile_money" as const;

/** VALUE PIN — authority: route-planning pins/corridor.ts `PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD` (the appendix acceptance addendum). */
export const PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD = "paystack_kes_bank_transfer" as const;

/** VALUE PIN — authority: route-planning pins/corridor.ts `PINNED_CORRIDOR_DIRECTION_CLASSES` (ADR-0016 D11). */
export const PINNED_CORRIDOR_DIRECTION_CLASSES = Object.freeze(["MOVE", "CONVERT"] as const);
export type PinnedCorridorDirectionClass = (typeof PINNED_CORRIDOR_DIRECTION_CLASSES)[number];

/** VALUE PIN — authority: route-planning pins/corridor.ts `PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS`. */
export const PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS = 1 as const;

/** VALUE PIN — authority: route-planning pins/corridor.ts `PINNED_CORRIDOR_LEG_SKELETON` (ADR-0016 D5 — the exact four-leg law). */
export const PINNED_CORRIDOR_LEG_SKELETON = Object.freeze([
  "FIAT_PSP_COLLECT",
  "PSP_STABLECOIN_ISSUANCE",
  "ONCHAIN_TRANSFER",
  "OFF_RAMP_PAYOUT",
] as const);
export type PinnedCorridorLegKind = (typeof PINNED_CORRIDOR_LEG_SKELETON)[number];

/** VALUE PIN — authority: route-planning pins/corridor.ts `PINNED_CORRIDOR_LEG_OUTCOMES` (ADR-0016 D6 — the partial-failure law's terms). */
export const PINNED_CORRIDOR_LEG_OUTCOMES = Object.freeze(["CONFIRMED", "UNKNOWN", "FAILED"] as const);
export type PinnedCorridorLegOutcome = (typeof PINNED_CORRIDOR_LEG_OUTCOMES)[number];

/** VALUE PIN — authority: route-planning pins/corridor.ts `PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID` (route-compiler shapes.ts member). */
export const PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID = "cross-provider-corridor" as const;

/**
 * VALUE PIN — authority: surface corridor-plan.ts (the presentation
 * contract's leg-kind vocabulary — same literals as the route skeleton,
 * re-verified against the surface authority test-only).
 */
export const CORRIDOR_PLAN_LEG_KINDS_PIN = PINNED_CORRIDOR_LEG_SKELETON;

/**
 * VALUE PIN — authority: surface corridor-plan.ts
 * `CORRIDOR_PLAN_LEG_PEOPLE_LABELS` (the frozen people-language labels —
 * the presentation renders these verbatim).
 */
export const CORRIDOR_PLAN_LEG_PEOPLE_LABELS_PIN: Readonly<
  Record<PinnedCorridorLegKind, string>
> = Object.freeze({
  FIAT_PSP_COLLECT: "Collect the departure currency from the payer's provider account",
  PSP_STABLECOIN_ISSUANCE: "Issue the stablecoin against the collected fiat",
  ONCHAIN_TRANSFER: "Transfer the stablecoin onchain to the off-ramp's receiving address",
  OFF_RAMP_PAYOUT: "Pay out the arrival currency to the beneficiary's bank account",
});

/**
 * VALUE PIN — authority: surface corridor-plan.ts
 * `CORRIDOR_PLAN_STELLAR_ISSUER_STRKEY_PATTERN` + the ADR-0016 appendix
 * StrKey laws. The G-address account StrKey shape (issuer-scoping law).
 */
export const CORRIDOR_PLAN_STELLAR_ISSUER_STRKEY_PATTERN_PIN = /^G[A-Z2-7]{55}$/;

/**
 * The app-side presentation shape of one corridor leg (mirrors surface
 * CorridorPlanLegView BY VALUE — the panel projection; the surface fold
 * is the authority, this is the app's structural view of it).
 */
export interface CorridorPlanLegViewPin {
  readonly legIndex: number;
  readonly legKind: PinnedCorridorLegKind;
  readonly peopleLabel: string;
  readonly lane: {
    readonly kind: "PROVIDER" | "ONCHAIN_CHAIN";
    readonly id: string;
    readonly label: string;
  };
  readonly custody: { readonly from: string; readonly to: string };
  readonly assetRef?: string;
  readonly prerequisites: readonly string[];
}

/**
 * The app-side presentation shape of the corridor plan (mirrors surface
 * CorridorPlanPresentation BY VALUE). Carried as an OPTIONAL projection
 * on the ranked-route pin when the route's shape is the corridor.
 */
export interface CorridorPlanPresentationPin {
  readonly planId: string;
  readonly shapeId: typeof PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID;
  readonly directionClass: PinnedCorridorDirectionClass;
  readonly legCount: number;
  readonly legs: readonly CorridorPlanLegViewPin[];
  readonly custodyChain: readonly string[];
  readonly relayAssetRef: string;
  readonly relayChainKey: string;
  readonly fundingMethod: string;
  readonly payoutMethod: string;
  readonly outcomeLine: string;
}

/**
 * The composite-act fields the authorization scope may carry (ADR-0016
 * D6 — the plan-scoped two-act approval; mirrors the host
 * authorization-gate's additive `planDigest` + `planLegCount` field
 * shapes BY VALUE, flat — never imported; the wire crosses them
 * structurally).
 */
export type CorridorPlanDigest = string;
export type CorridorPlanLegCount = number;

/** The leg attribution a dispatch lane may carry (the per-leg surfaces). */
export interface CorridorLaneLegAttributionPin {
  readonly legIndex: number;
  readonly legKind: PinnedCorridorLegKind;
  readonly laneKind: "PROVIDER" | "ONCHAIN_CHAIN";
}

/**
 * The honest composite-act note (rendered on the dispatch surfaces when
 * a plan-scoped approval is in force — ADR-0016 D6, people language).
 */
export const PAYMENT_MISSIONS_COMPOSITE_ACT_NOTE =
  "This approval covers the whole presented plan, not one hop: the digest binds every leg, and each leg is its own dispatch with its own single-use share of the authorization. A leg that returns UNKNOWN shows the pending-reconciliation card — a later leg never dispatches until the chain is honestly resolved." as const;
