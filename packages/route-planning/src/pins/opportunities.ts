/**
 * @payswap/route-planning — the PINNED WIRE SHAPES of the opportunities
 * conditional family (P21-C, lane C; ADR-0014 D9).
 *
 * LAYER LAW: zero sibling imports. Every mirror below names its AUTHORITY
 * — @payswap/opportunities (the conditional opportunity, the offer
 * lifecycle, the consent law, the model vocabularies). The mirrors are
 * deliberately SUBSET-typed (the pins/capability.ts discipline): any
 * genuine authority value remains structurally assignable to the pin,
 * while a pin can never widen an authority law. Vocabulary VALUES are
 * pinned byte-identical and their cross-lane consistency is asserted by
 * test/conditional-stage.test.ts (the pins-fidelity law).
 *
 * Pins in this module (authority: @payswap/opportunities unless noted):
 * - the closed party / party-change vocabularies + the conditional kind
 *   + the discovery tier + the opportunity families + the rail kinds
 * - the required-party-change, platform-prerequisite, evidence-freshness,
 *   supporting-observation, opt-in and disclosure-scope structural pins
 * - the conditional-opportunity consumption surface (the P21-B panel pin)
 * - the two corridor exclusion codes the P21 pattern recognition consumes
 *   (authority: @payswap/capability corridor-types.ts)
 * - the P21 corridor-pattern identities + the honest platform-gap ids
 *   (authority: ADR-0014 D7/D9 + the P21-0 gap matrix §2)
 */

/**
 * VALUE PIN — authority: @payswap/opportunities src/conditional.ts
 * `CONDITIONAL_PARTIES` (the closed party vocabulary), byte-identical.
 */
export const PINNED_CONDITIONAL_PARTIES = Object.freeze(["SENDER", "RECIPIENT", "THIRD_PARTY"] as const);
/**
 * VALUE PIN — authority: @payswap/opportunities src/conditional.ts
 * `CONDITIONAL_PARTY_CHANGES` (the closed party-change vocabulary, the
 * ADR-0015 A.1 growth): the three P21 members preserved byte-identically
 * in name and position (first), the three P23 provider-neutral members
 * appended (canonical order).
 */
export const PINNED_CONDITIONAL_PARTY_CHANGES = Object.freeze([
  "ENABLES_FLUTTERWAVE_RECEIVING_METHOD",
  "ADDS_STRIPE_COMPATIBLE_INSTRUMENT",
  "INTERMEDIARY_INTRODUCED",
  "ENABLES_COMPATIBLE_RECEIVING_METHOD",
  "ADDS_COMPATIBLE_FUNDING_INSTRUMENT",
  "COMPLETES_PROVIDER_PERMISSIONS",
] as const);
/** VALUE PIN — authority: @payswap/opportunities src/conditional.ts `CONDITIONAL_KIND`. */
export const PINNED_CONDITIONAL_KIND = "ConditionalOpportunity" as const;
/** VALUE PIN — authority: @payswap/opportunities src/discovery-tier.ts `DISCOVERY_TIER`. */
export const PINNED_DISCOVERY_TIER = "DISCOVERY_NEVER_AUTHORIZATION" as const;
/** VALUE PIN — authority: @payswap/opportunities src/model.ts `OPPORTUNITY_FAMILIES`. */
export const PINNED_OPPORTUNITY_FAMILIES = Object.freeze([
  "liquidity", "lending", "staking", "incentives", "arbitrage", "other",
] as const);
/** VALUE PIN — authority: @payswap/opportunities src/model.ts `RAIL_KINDS`. */
export const PINNED_OPPORTUNITY_RAIL_KINDS = Object.freeze(["ONCHAIN", "FIAT", "FX"] as const);
/**
 * VALUE PIN — authority: @payswap/capability src/corridor-types.ts
 * `CORRIDOR_EXCLUSION_CODES` member "FUNDING_METHOD_NOT_SERVED" (the typed
 * fact the P21 pattern recognition consumes).
 */
export const PINNED_CORRIDOR_FUNDING_NOT_SERVED_CODE = "FUNDING_METHOD_NOT_SERVED" as const;
/**
 * VALUE PIN — authority: @payswap/capability src/corridor-types.ts
 * `CORRIDOR_EXCLUSION_CODES` member "NOT_EXECUTABLE_CAPABILITY" (the typed
 * read-only-rail fact the no-route recognition consumes).
 */
export const PINNED_CORRIDOR_NOT_EXECUTABLE_CODE = "NOT_EXECUTABLE_CAPABILITY" as const;
/**
 * VALUE PIN — the P21 corridor pattern's funding-method identity (the
 * sender's Flutterwave test-mode wallet as a corridor funding method).
 * Authority: ADR-0014 D7 + the P21-0 gap matrix §2 (the ordered journey's
 * sender rail). The derivation recognizes the P21 pattern ONLY through
 * this typed identity — a foreign funding method never derives the
 * FLW/Stripe party-change conditionals.
 */
export const PINNED_P21_FLW_WALLET_FUNDING_METHOD = "flutterwave_wallet" as const;
/**
 * VALUE PIN — the P21 corridor pattern's receiving provider (the
 * Stripe-only merchant context). Authority: ADR-0014 D7 + the
 * provider-runtime Stripe provider id.
 */
export const PINNED_P21_STRIPE_PROVIDER_NAME = "stripe" as const;
/**
 * VALUE PIN — the honest platform-gap identities (ADR-0014 D7/D9: where a
 * party change ALONE is insufficient, the platform gap is labeled DISTINCT
 * from the party prerequisite — never conflated, never hidden).
 */
export const PINNED_P21_FLW_SEND_OPERATION_GAP = "platform:flutterwave-send-operation" as const;
export const PINNED_P21_CROSS_PROVIDER_SHAPE_GAP = "platform:cross-provider-route-shape" as const;

export type PinnedConditionalParty = (typeof PINNED_CONDITIONAL_PARTIES)[number];
export type PinnedConditionalPartyChange = (typeof PINNED_CONDITIONAL_PARTY_CHANGES)[number];
export type PinnedOpportunityFamily = (typeof PINNED_OPPORTUNITY_FAMILIES)[number];
export type PinnedOpportunityRailKind = (typeof PINNED_OPPORTUNITY_RAIL_KINDS)[number];

/** STRUCTURAL PIN — authority: @payswap/opportunities `RequiredPartyChange`. */
export interface PinnedRequiredPartyChange {
  readonly party: PinnedConditionalParty;
  readonly change: PinnedConditionalPartyChange;
}
/** STRUCTURAL PIN — authority: @payswap/opportunities `PlatformPrerequisite`. */
export interface PinnedPlatformPrerequisite {
  readonly gapId: string;
  readonly note: string;
}
/** STRUCTURAL PIN — authority: @payswap/opportunities src/freshness.ts `EvidenceFreshness`. */
export interface PinnedEvidenceFreshness {
  readonly asOfMs: number;
  readonly maxAgeMs: number;
}
/** STRUCTURAL PIN (subset) — authority: @payswap/opportunities src/model.ts `SupportingObservation`. */
export interface PinnedSupportingObservation {
  readonly observationId: string;
  readonly version: number;
  readonly venueId: string;
  readonly protocolKey?: string;
  readonly adapterId: string;
  readonly observerId: string;
  readonly freshness: PinnedEvidenceFreshness;
  readonly evidenceRefs: readonly string[];
}
/** STRUCTURAL PIN — authority: @payswap/opportunities src/offer-lifecycle.ts `OfferOptIn`. */
export interface PinnedOfferOptIn {
  readonly participantRef: string;
  readonly optedInAt: number;
}
/** STRUCTURAL PIN — authority: @payswap/opportunities src/consent.ts `DisclosureScope`. */
export interface PinnedDisclosureScope {
  readonly fields: readonly string[];
  readonly purpose: string;
}
/**
 * STRUCTURAL PIN (subset) — authority: @payswap/opportunities
 * `ConditionalOpportunity` (the P21-B panel's consumption surface: the
 * advisory identity, the party-change precondition, the assumptions, the
 * honest platform prerequisites, the grounding evidence, the disclosure
 * controls, the opt-in, the expiry and the never-authorization tier).
 */
export interface PinnedConditionalOpportunity {
  readonly conditionalKind: typeof PINNED_CONDITIONAL_KIND;
  readonly conditionalId: string;
  readonly opportunityId: string;
  readonly family: PinnedOpportunityFamily;
  readonly railKey: string;
  readonly summary: string;
  readonly requiredPartyChanges: readonly PinnedRequiredPartyChange[];
  readonly assumptions: readonly string[];
  readonly platformPrerequisites: readonly PinnedPlatformPrerequisite[];
  readonly evidence: readonly PinnedSupportingObservation[];
  readonly disclosureScope: PinnedDisclosureScope;
  readonly optIn: PinnedOfferOptIn;
  readonly publishedAt: number;
  readonly expiresAt: number;
  readonly state: string;
  readonly discoveryTier: typeof PINNED_DISCOVERY_TIER;
}
