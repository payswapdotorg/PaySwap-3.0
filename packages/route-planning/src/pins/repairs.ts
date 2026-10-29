/**
 * @payswap/route-planning — the PINNED WIRE SHAPES of the P23-A
 * repair-operator catalogue (P23-C, lane C; ADR-0015 D2/D4/D5/D6 — the
 * frozen appendix A.1–A.8 contract, AMENDED 2026-10-29: the A.3
 * operator-applicable set is 16 codes, the A.4 non-operator set 10, 26
 * total, the totality law exact).
 *
 * LAYER LAW: zero sibling imports. route-planning NEVER imports the REAL
 * `@payswap/opportunities` catalogue — it receives it through the INJECTED
 * `RepairOperatorCataloguePort` (src/exclusion-repair.ts; the real
 * catalogue binds at the composition root, the leaf-in-flight law). The
 * mirrors below are deliberately SUBSET-typed structural pins naming their
 * authority; the frozen VALUE lists are pinned verbatim from the amended
 * ADR-0015 appendix so the cross-lane contract is byte-checkable at the
 * P23-D bridge. Vocabulary fidelity is asserted by test/exclusion-repair.test.ts.
 *
 * Pins in this module (authority: @payswap/opportunities repair-operators /
 * platform-work / repair-proposals, frozen by ADR-0015):
 * - the party-change vocabulary growth (A.1 — the three P21 members
 *   preserved, the three general members appended)
 * - the operator kinds (A.2) + the 15 operator ids (A.3) + the 16/10 code
 *   classification (A.3/A.4 amended) + the non-operator classification
 *   kinds + the model-proposal seam shapes and rejection codes (A.8)
 * - the structural operator/classification/proposal/request pins the
 *   derivation consumes through the port
 */

import type { PinnedHypotheticalAugmentation } from "./hypotheses.ts";

/**
 * VALUE PIN — authority: ADR-0015 appendix A.1 (`CONDITIONAL_PARTY_CHANGES`
 * growth, canonical order): the three P21 members PRESERVED (byte-compat
 * with pins/opportunities.ts PINNED_CONDITIONAL_PARTY_CHANGES) plus the
 * three general members.
 */
export const PINNED_REPAIR_PARTY_CHANGES = Object.freeze([
  "ENABLES_FLUTTERWAVE_RECEIVING_METHOD",
  "ADDS_STRIPE_COMPATIBLE_INSTRUMENT",
  "INTERMEDIARY_INTRODUCED",
  "ENABLES_COMPATIBLE_RECEIVING_METHOD",
  "ADDS_COMPATIBLE_FUNDING_INSTRUMENT",
  "COMPLETES_PROVIDER_PERMISSIONS",
] as const);

/**
 * VALUE PIN — authority: ADR-0015 appendix A.2: the repair-operator kinds.
 */
export const PINNED_REPAIR_OPERATOR_KINDS = Object.freeze([
  "PARTY_CHANGE", "PLATFORM_WORK", "MULTI_HOP",
] as const);

/**
 * VALUE PIN — authority: ADR-0015 appendix A.3: the initial frozen
 * operator-catalogue ids (15, the A.3 row order).
 */
export const PINNED_REPAIR_OPERATOR_IDS = Object.freeze([
  "repair:recipient-enables-flw-receiving-method",
  "repair:sender-adds-stripe-compatible-instrument",
  "repair:recipient-enables-served-funding-method",
  "repair:sender-adds-served-funding-instrument",
  "repair:recipient-enables-served-payout-method",
  "repair:sender-completes-provider-permissions",
  "repair:intermediary-introduced",
  "repair:convert-through-supported-asset",
  "repair:bridge-via-intermediary-rail",
  "repair:split-below-maximum",
  "platform:connector-operation",
  "platform:provider-integration",
  "platform:permission-model",
  "platform:cross-provider-route-shape",
  "platform:flutterwave-send-operation",
] as const);

/**
 * VALUE PIN — authority: ADR-0015 appendix A.3 (amended 2026-10-29): the
 * operator-APPLICABLE exclusion codes (16 of the 26 — the codes at least
 * one A.3 operator row answers), canonical order.
 */
export const PINNED_OPERATOR_APPLICABLE_EXCLUSION_CODES = Object.freeze([
  "FUNDING_METHOD_NOT_SERVED",
  "PAYOUT_METHOD_NOT_SERVED",
  "MISSING_PERMISSIONS",
  "AUTHORIZATION_NOT_ACTIVE",
  "SOURCE_COUNTRY_NOT_SERVED",
  "DESTINATION_COUNTRY_NOT_SERVED",
  "SOURCE_CURRENCY_NOT_SUPPORTED",
  "DESTINATION_CURRENCY_NOT_SUPPORTED",
  "AMOUNT_ABOVE_MAXIMUM",
  "NOT_EXECUTABLE_CAPABILITY",
  "IMPLEMENTATION_SCOPE_NOT_SERVED",
  "INSTANCE_INELIGIBLE",
  "CUSTOMER_TYPE_NOT_SERVED",
  "RECIPIENT_TYPE_NOT_SERVED",
  "INSTANCE_GEOGRAPHY_NOT_SERVED",
  "INSTANCE_CURRENCY_NOT_SUPPORTED",
] as const);

/**
 * VALUE PIN — authority: ADR-0015 appendix A.4 (amended 2026-10-29): the
 * NON-operator exclusion codes (10 of the 26 — the honest non-repairs),
 * canonical order. 16 + 10 = 26: the totality law exact.
 */
export const PINNED_NON_OPERATOR_EXCLUSION_CODES = Object.freeze([
  "STALE_OBSERVATION",
  "AVAILABILITY_UNKNOWN",
  "OBSERVATION_ELIGIBILITY_UNKNOWN",
  "OBSERVATION_NOT_ELIGIBLE",
  "AVAILABILITY_UNAVAILABLE",
  "QUOTA_EXHAUSTED",
  "CUTOFF_PASSED",
  "AMOUNT_BELOW_MINIMUM",
  "MISSING_REQUIRED_FIELDS",
  "AMOUNT_CURRENCY_MISMATCH",
] as const);

/**
 * VALUE PIN — authority: ADR-0015 appendix A.4: the honest non-operator
 * classification kinds (recheck / wait / intake / revise).
 */
export const PINNED_NON_OPERATOR_CLASSIFICATIONS = Object.freeze([
  "RECHECK", "WAIT", "INTAKE_ASK_LOOP", "REVISE_PATH",
] as const);

/**
 * VALUE PIN — the A.4 recheck-trigger codes (the wait-recheck plane).
 */
export const PINNED_RECHECK_EXCLUSION_CODES = Object.freeze([
  "STALE_OBSERVATION", "AVAILABILITY_UNKNOWN",
  "OBSERVATION_ELIGIBILITY_UNKNOWN", "OBSERVATION_NOT_ELIGIBLE",
] as const);

/**
 * VALUE PIN — the A.4 wait-trigger codes (bounded in time, never a repair card).
 */
export const PINNED_WAIT_EXCLUSION_CODES = Object.freeze([
  "AVAILABILITY_UNAVAILABLE", "QUOTA_EXHAUSTED",
  "CUTOFF_PASSED", "AMOUNT_BELOW_MINIMUM",
] as const);

/**
 * VALUE PIN — the A.4 intake-ask-loop code (MISSING_REQUIRED_FIELDS).
 */
export const PINNED_INTAKE_EXCLUSION_CODES = Object.freeze(["MISSING_REQUIRED_FIELDS"] as const);

/**
 * VALUE PIN — the A.4 revise-path code (AMOUNT_CURRENCY_MISMATCH).
 */
export const PINNED_REVISE_EXCLUSION_CODES = Object.freeze(["AMOUNT_CURRENCY_MISMATCH"] as const);

/**
 * VALUE PIN — the A.3 no-route-state operators' ids (the MULTI_HOP rows
 * keyed to "the honest no-route state" — the stage-6/7 repair-intervention
 * mapping's intermediary detection).
 */
export const PINNED_INTERMEDIARY_OPERATOR_IDS = Object.freeze([
  "repair:intermediary-introduced", "repair:bridge-via-intermediary-rail",
] as const);

/**
 * VALUE PIN — the corridor-state key the general derivation additionally
 * consults (NOT an exclusion code): ADR-0015 A.3 keys the intermediary and
 * P21 platform-gap operators to "the honest no-route state (rails both
 * sides, nothing eligible)" — a corridor STATE, not a code, so the
 * two-method catalogue port carries it as a pinned lookup key.
 */
export const PINNED_NO_ROUTE_STATE_KEY = "NO_ROUTE_STATE" as const;

/**
 * VALUE PIN — the P21 corridor pattern's Flutterwave provider identity
 * (authority: the provider-runtime Flutterwave provider id — the Stripe
 * twin of pins/opportunities.ts PINNED_P21_STRIPE_PROVIDER_NAME).
 */
export const PINNED_P21_FLW_PROVIDER_NAME = "flutterwave" as const;

/**
 * VALUE PIN — authority: ADR-0015 appendix A.8: the model-proposal
 * provenance source + the rejection codes (the D6 bounded, grounded
 * model-proposal interface's frozen vocabulary; the P23-B lane mirrors
 * these seam shapes).
 */
export const PINNED_MODEL_PROPOSAL_SOURCE = "MODEL_PROPOSAL" as const;
export const PINNED_MODEL_PROPOSAL_REJECTION_CODES = Object.freeze([
  "MODEL_PROPOSAL_UNGROUNDED",
  "MODEL_PROPOSAL_OUT_OF_VOCABULARY",
  "MODEL_PROPOSAL_COMMAND_SHAPE",
  "MODEL_PROPOSAL_BUDGET_EXCEEDED",
] as const);

export type PinnedRepairPartyChange = (typeof PINNED_REPAIR_PARTY_CHANGES)[number];
export type PinnedRepairOperatorKind = (typeof PINNED_REPAIR_OPERATOR_KINDS)[number];
export type PinnedRepairOperatorId = (typeof PINNED_REPAIR_OPERATOR_IDS)[number];
export type PinnedNonOperatorClassificationKind = (typeof PINNED_NON_OPERATOR_CLASSIFICATIONS)[number];

/**
 * STRUCTURAL PIN — the verbatim grounded exclusion fact a repair cites
 * (authority: src/conditional-stage.ts `GroundedExclusionFact`, re-typed
 * structurally so the pins stay leaf modules; every genuine fact value
 * remains assignable to this pin).
 */
export interface PinnedGroundedFactRef {
  readonly side: "SENDER" | "RECIPIENT";
  readonly routeId: string;
  readonly code: string;
  readonly message: string;
  readonly fundingMethod?: string;
}

/**
 * STRUCTURAL PIN — one typed side condition of a repair operator. The
 * derivation grounds every condition in the corridor's verbatim facts
 * (never prose): the P21 funding pattern is FACT-level (it selects the
 * facts an operator answers); the others are corridor-level.
 */
export type PinnedRepairSideCondition =
  | { readonly kind: "P21_FLW_WALLET_FUNDING_PATTERN" }
  | { readonly kind: "STRIPE_RECEIVING_RAIL" }
  | { readonly kind: "ANY_RECEIVING_RAIL" }
  | { readonly kind: "NO_ROUTE_STATE" }
  | { readonly kind: "CROSS_PROVIDER_PAIR" }
  | { readonly kind: "FLW_PROVIDER_RAIL" };

/**
 * STRUCTURAL PIN — the PARTY_CHANGE proposal an operator carries (the
 * conditional-construction payload: title, description, party change,
 * assumptions, the honest platform prerequisites). The literal token
 * `{facts}` in `description` is substituted with the cited facts'
 * verbatim messages joined "; " — never invented text.
 */
export interface PinnedPartyChangeProposal {
  readonly party: "SENDER" | "RECIPIENT" | "THIRD_PARTY";
  readonly change: PinnedRepairPartyChange;
  readonly title: string;
  readonly description: string;
  readonly assumptions: readonly string[];
  readonly platformPrerequisites: readonly { readonly gapId: string; readonly note: string }[];
}

/**
 * STRUCTURAL PIN — the PLATFORM_WORK proposal an operator carries (the
 * explicit platform/integration work item with evidence, D4).
 */
export interface PinnedPlatformWorkProposal {
  readonly gapId: string;
  readonly title: string;
}

/**
 * STRUCTURAL PIN — the MULTI_HOP proposal an operator carries (the assumed
 * augmentation kind, A.5, + the assumption's statement; the payload's
 * corridor dimensions are grounded by the derivation, never the catalogue).
 */
export interface PinnedHypothesisProposal {
  readonly augmentationKind: "ADD_ASSUMED_RAIL" | "ADD_ASSUMED_CONVERSION_ASSET" | "ADD_ASSUMED_CONNECTOR_OPERATION";
  readonly assumptionSummary: string;
  /** ADD_ASSUMED_CONNECTOR_OPERATION only: the assumed operation's kind label. */
  readonly operationKind?: string;
}

/**
 * STRUCTURAL PIN (subset) — authority: @payswap/opportunities
 * repair-operators.ts `RepairOperator`: one typed row of the frozen
 * catalogue. The `kind` is the A.2 classification and is PROPOSAL-CONSISTENT
 * (PARTY_CHANGE ⇒ partyChangeProposal, PLATFORM_WORK ⇒ platformWorkProposal,
 * MULTI_HOP ⇒ hypothesisProposal); an operator MAY carry additional
 * cross-kind proposals — the P21 `repair:intermediary-introduced` operator
 * (kind MULTI_HOP) also carries the P21 party-change conditional, the
 * D3 byte-compat precedent.
 */
export interface PinnedRepairOperator {
  readonly operatorId: string;
  readonly kind: PinnedRepairOperatorKind;
  /** The exclusion codes this operator answers (empty for state-keyed rows). */
  readonly applicableExclusionCodes: readonly string[];
  /**
   * The more-specific operator ids that shadow THIS operator when they are
   * emitted over the same facts (the most-specific-applicable-operator
   * rule, ADR-0015 D2 — the shadowedBy data from the catalogue).
   */
  readonly shadowedBy?: readonly string[];
  readonly sideConditions?: readonly PinnedRepairSideCondition[];
  readonly partyChangeProposal?: PinnedPartyChangeProposal;
  readonly platformWorkProposal?: PinnedPlatformWorkProposal;
  readonly hypothesisProposal?: PinnedHypothesisProposal;
}

/**
 * STRUCTURAL PIN — the honest non-operator row for one exclusion code
 * (A.4): the classification kind + the catalogue's verbatim reason.
 */
export interface PinnedNonOperatorClassification {
  readonly classification: PinnedNonOperatorClassificationKind;
  readonly reason: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/opportunities platform-work.ts
 * `PlatformWorkItem` (D4): what PaySwap itself would need to build, each
 * citing the exclusions that prove the gap, never a backlog fabrication.
 */
export interface PinnedPlatformWorkRequest {
  readonly workItemId: string;
  readonly gapId: string;
  readonly title: string;
  readonly requiredByOperatorIds: readonly string[];
  readonly evidenceBasis: readonly PinnedGroundedFactRef[];
  readonly status: "OPEN";
  readonly advisoryOnly: true;
}

/**
 * STRUCTURAL PIN — the multi-hop hypothesis request (D5): the operator, the
 * assumed augmentation (verbatim) and the cited grounded facts.
 */
export interface PinnedHypothesisRequest {
  readonly operatorId: string;
  readonly assumption: PinnedHypotheticalAugmentation;
  readonly citedFacts: readonly PinnedGroundedFactRef[];
  readonly summary: string;
}

/**
 * STRUCTURAL PIN — the model-proposal provenance (A.8) + the bounded
 * proposal seam shape (D6; models PROPOSE within the frozen vocabulary,
 * never invent kinds, eligibility or authority — the P23-B lane mirrors).
 */
export interface PinnedModelProposalProvenance {
  readonly source: typeof PINNED_MODEL_PROPOSAL_SOURCE;
  readonly modelId: string;
  readonly proposedAt: number;
}
export interface PinnedModelProposal {
  readonly operatorId: string;
  readonly citedFactCodes: readonly string[];
  readonly provenance: PinnedModelProposalProvenance;
}
