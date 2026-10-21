/**
 * @payswap/app — STRUCTURAL PINS of the accepted @payswap/surface
 * contracts (packages/surface/src, P2-W3 ACCEPTED).
 *
 * LAYER LAW (MODULE-OWNERSHIP.yaml): packages/web is a ZCode-substrate
 * PLATFORM package and depends on @zcode/* workspace packages ONLY — a
 * substrate package NEVER imports @payswap/*. Every cross-lane contract
 * shape this product renders is therefore pinned STRUCTURALLY here
 * (field-for-field, same literals, same unions), mirroring the wire shapes
 * read from the accepted source packages. The mirror is verified against
 * the source by test/payswap/pin-mirror.test.ts (it imports the surface
 * source directly and asserts equality); the TL wires real imports at
 * accept-time integration — exactly the Phase-2 pinning pattern
 * (spec/surface/SURFACE-CONTRACTS.md §1 "Layer law").
 *
 * Pins in this file (source modules named per pin):
 * - SURFACE_API_VERSION ................ packages/surface/src/version.ts
 * - AmountSpec / validation patterns ... packages/surface/src/amount-spec.ts
 * - Outcome registry vocabulary ......... packages/surface/src/outcomes.ts
 * - Outcome area aliases ................ packages/surface/src/outcome-area-aliases.ts
 * - Progress stages + observations ...... packages/surface/src/progress-states.ts
 * - Security gate vocabulary ............ packages/surface/src/security-vocabulary.ts
 * - Universal areas (navigation IA) ..... packages/surface/src/areas.ts
 * - Money display input ................. packages/surface/src/money-view.ts
 */

/* ====================================================================
 * version.ts pin
 * ==================================================================== */

/**
 * The surface contract version this product compiled against (mirrors
 * packages/surface/src/version.ts SURFACE_API_VERSION — "1.1.0"). Drift is
 * detectable by the mirror test, not discovered in production.
 */
export const PINNED_SURFACE_API_VERSION = "1.1.0" as const;

/** Mirrors surface's SurfaceContractProvenance (version.ts). */
export interface SurfaceProvenancePin {
  readonly surfaceApiVersion: typeof PINNED_SURFACE_API_VERSION;
  readonly stability: "stable" | "experimental";
  readonly workOrder: string;
}

/* ====================================================================
 * amount-spec.ts pin
 * ==================================================================== */

/**
 * AmountSpec — the pinned cross-lane money wire shape (P1-W1/P1-W2/P1-W3/
 * P2-W3 authoritative pin; mirrored field-for-field):
 *
 *   interface AmountSpec {
 *     readonly currency: string;   // /^[A-Z]{3}$/
 *     readonly minorUnits: string; // /^(0|[1-9][0-9]*)$/
 *   }
 *
 * The web product DISPLAYS amounts in this wire form only; it never
 * computes money (INV-02 at the display boundary; INV-23 projection law).
 */
export interface AmountSpecPin {
  readonly currency: string;
  readonly minorUnits: string;
}

/* ====================================================================
 * outcomes.ts pin
 * ==================================================================== */

/** The five outcome actions (mirrors surface OutcomeActionId, same order). */
export const OUTCOME_ACTION_IDS = [
  "pay",
  "receive",
  "move",
  "convert",
  "checkout",
] as const;

export type OutcomeActionIdPin = (typeof OUTCOME_ACTION_IDS)[number];

/** Mirrors surface OutcomeDispatchAuthority (same union literals). */
export interface OutcomeDispatchAuthorityPin {
  readonly authority:
    | "economic-intent-plane"
    | "quote-projection-plane"
    | "merchant-checkout-plane";
  readonly intentKind: "MoneyMovementIntent" | "PaymentIntent" | "ServiceAccessIntent";
  readonly journeyId: string;
  readonly topologyNote: string;
}

/** Mirrors surface OutcomeCapabilityState. */
export interface OutcomeCapabilityStatePin {
  readonly dispatchable: boolean;
  readonly missingPrerequisite?: string;
}

/** Mirrors surface OutcomeDeploymentContext (honest deployment facts). */
export interface OutcomeDeploymentContextPin {
  readonly economicIntakeConfigured: boolean;
  readonly capabilityObservationsAvailable: boolean;
  readonly merchantCheckoutContextBound: boolean;
}

/** Mirrors surface OutcomeAction (the registry record the web renders). */
export interface OutcomeActionPin {
  readonly id: OutcomeActionIdPin;
  readonly label: string;
  readonly outcomeLine: string;
  readonly advancedDisclosure: readonly string[];
  readonly dispatch: OutcomeDispatchAuthorityPin;
  readonly provenance: SurfaceProvenancePin;
}

/* ====================================================================
 * outcome-area-aliases.ts pin
 * ==================================================================== */

/** Mirrors surface OutcomeAreaAlias (actionId + real area anchors + note). */
export interface OutcomeAreaAliasPin {
  readonly actionId: OutcomeActionIdPin;
  /** Where the action's lane lives in the eleven-area IA (real area ids only). */
  readonly navAreas: readonly string[];
  /** Why this mapping holds (auditable, one line). */
  readonly note: string;
}

/* ====================================================================
 * progress-states.ts pin
 * ==================================================================== */

/**
 * The canonical 16-stage lifecycle (mirrors SURFACE_PROGRESS_STAGES, same
 * literals, same order — the ONE truthful financial lifecycle).
 */
export const SURFACE_PROGRESS_STAGES_PIN = [
  "INTENT_RECORDED",
  "ELIGIBILITY_CHECKED",
  "QUOTE_ACCEPTED",
  "FUNDING_INSTRUCTED",
  "FUNDING_RECEIVED",
  "CONVERSION_EXECUTED",
  "PAYOUT_INSTRUCTED",
  "PAYOUT_SUBMITTED",
  "PAYOUT_SENT",
  "BENEFICIARY_CREDITED",
  "FINALITY_RECORDED",
  "RECONCILED",
  "RETURNED",
  "REFUNDED",
  "CHARGED_BACK",
  "CANCELLED",
] as const;

export type SurfaceProgressStagePin = (typeof SURFACE_PROGRESS_STAGES_PIN)[number];

/** Mirrors surface StageStatus — UNKNOWN is a first-class status (INV-04). */
export type StageStatusPin =
  | "ACHIEVED"
  | "IN_PROGRESS"
  | "PENDING"
  | "UNKNOWN"
  | "FAILED"
  | "NOT_APPLICABLE";

/** Mirrors surface StageObservation (a projection input — references only). */
export interface StageObservationPin {
  readonly stage: SurfaceProgressStagePin;
  readonly status: StageStatusPin;
  readonly authorityRecordRef: string;
  readonly evidenceRefs: readonly string[];
  readonly observedAt: string;
  readonly providerStatus?: string;
}

/* ====================================================================
 * security-vocabulary.ts pin
 * ==================================================================== */

/** Mirrors surface GatePresentationTone (UI tone, not a new verdict). */
export type GatePresentationTonePin = "danger" | "success" | "warning";

/** Mirrors surface GateBlockReason. */
export interface GateBlockReasonPin {
  readonly dimension: string;
  readonly code: string;
  readonly message: string;
  readonly invariantRefs: readonly string[];
}

/** Mirrors surface GateAllowCheck. */
export interface GateAllowCheckPin {
  readonly dimension: string;
  readonly outcome: string;
  readonly code: string;
  readonly detail: string;
}

/** Mirrors surface GateUnknownDimension. */
export interface GateUnknownDimensionPin {
  readonly dimension: string;
  readonly code: string;
  readonly message: string;
}

/** Mirrors surface SecurityGateDecisionSource (BLOCK/ALLOW/UNKNOWN only). */
export interface SecurityGateDecisionSourcePin {
  readonly decision: "BLOCK" | "ALLOW" | "UNKNOWN";
  readonly reasons?: readonly GateBlockReasonPin[];
  readonly checks?: readonly GateAllowCheckPin[];
  readonly unknownDimensions?: readonly GateUnknownDimensionPin[];
}

/* ====================================================================
 * areas.ts pin
 * ==================================================================== */

/**
 * The eleven operational areas of the navigation IA (mirrors surface
 * UniversalAreaId — the canonical, versioned AREA SET and ORDER).
 */
export const UNIVERSAL_AREA_IDS = [
  "overview",
  "payments",
  "accounts",
  "activity",
  "opportunities",
  "connections",
  "capabilities",
  "security",
  "reports",
  "developers",
  "settings",
] as const;

export type UniversalAreaIdPin = (typeof UNIVERSAL_AREA_IDS)[number];

/** Mirrors surface AreaEmptyStateContract. */
export interface AreaEmptyStateContractPin {
  readonly reason: string;
  readonly nextAction: { readonly kind: "route" | "outcome"; readonly value: string };
}

/** Mirrors surface UniversalArea. */
export interface UniversalAreaPin {
  readonly id: UniversalAreaIdPin;
  readonly label: string;
  readonly route: string;
  readonly purpose: string;
  readonly lawCitations: readonly string[];
  readonly emptyState: AreaEmptyStateContractPin;
  readonly provenance: SurfaceProvenancePin;
}

/* ====================================================================
 * money-view.ts pin
 * ==================================================================== */

/** Mirrors surface DisplayLocaleInput (explicit, never ambient). */
export interface DisplayLocaleInputPin {
  readonly thousandsSeparator?: string;
  readonly decimalSeparator?: string;
  readonly groupSize?: number;
}

/** Mirrors surface MoneyDisplayInput (currencyDigits + locale as inputs). */
export interface MoneyDisplayInputPin {
  readonly currencyDigits?: ReadonlyMap<string, number>;
  readonly locale?: DisplayLocaleInputPin;
}
