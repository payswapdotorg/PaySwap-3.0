/**
 * @payswap/app — the ROUTE-PLANNING OPPORTUNITY-EMERGENCE pins (P23-B, lane
 * B; ADR-0015 D8 + appendix A.1/A.6/A.7 — the actionable-card contract).
 *
 * MIRROR DISCIPLINE (the routePlanningPins.ts pattern): @payswap/app src
 * NEVER imports a @payswap/* workspace package (product law P2,
 * machine-checked) — the three advisory engine-view sections
 * (`conditionalOpportunities`, `platformWork`, `hypotheses`, the A.7 order)
 * are pinned STRUCTURALLY here, mirroring @payswap/route-planning's own
 * pins (pins/repairs.ts + pins/hypotheses.ts + pins/opportunities.ts — the
 * lane-C shapes) field-for-field. The mirror is verified against the REAL
 * sources by test/payswap/route-planning-opportunity-pins-mirror.test.ts
 * (test-only relative imports); the platform host binds the REAL derivation
 * engines at its composition root (ADR-0015 D9).
 *
 * LAWS (ADR-0015 D8 + AGENTS.md financial boundary):
 * - ADVISORY ONLY: every pin in this module names a REPAIR CANDIDATE — a
 *   conditional opportunity, a platform work item or a multi-hop hypothesis
 *   NEVER dispatches, never enters available-now, never feeds eligibility;
 *   the only route onward is fresh planning, preview and NEW explicit
 *   authorization (the frozen never-executable literals).
 * - HONEST VERIFICATION (A.6): the verification pairing is
 *   `PLANNER_VERIFIED | UNVERIFIED` — PLANNER_VERIFIED asserts only that the
 *   REAL planner re-run composed a rank-eligible route over the
 *   party-changed view; UNVERIFIED carries the honest remaining reason
 *   VERBATIM, never a softened guess.
 * - The platform prerequisites (gapId + note) are DISTINCT from the party
 *   prerequisites (the ADR-0014 D9 labeling law, first-class here): what
 *   PaySwap itself would need to build is never conflated with what a party
 *   could change on its own.
 * - Frozen people-language labels: the party-change vocabulary renders
 *   through the frozen label maps below (never machine codes alone).
 */

/* ======== the frozen vocabularies (mirrored, VALUE pins) ======== */

/**
 * VALUE PIN — authority: @payswap/opportunities src/conditional.ts
 * `CONDITIONAL_PARTY_CHANGES` (the ADR-0015 A.1 growth, canonical order):
 * the three P21 members preserved first, the three general members
 * appended. Mirrored through route-planning's pins/repairs.ts
 * PINNED_REPAIR_PARTY_CHANGES (same literals, same order).
 */
export const ROUTE_PLANNING_CONDITIONAL_PARTY_CHANGES_PIN = Object.freeze([
  "ENABLES_FLUTTERWAVE_RECEIVING_METHOD",
  "ADDS_STRIPE_COMPATIBLE_INSTRUMENT",
  "INTERMEDIARY_INTRODUCED",
  "ENABLES_COMPATIBLE_RECEIVING_METHOD",
  "ADDS_COMPATIBLE_FUNDING_INSTRUMENT",
  "COMPLETES_PROVIDER_PERMISSIONS",
] as const);
export type RoutePlanningConditionalPartyChangePin = (typeof ROUTE_PLANNING_CONDITIONAL_PARTY_CHANGES_PIN)[number];

/** VALUE PIN — authority: route-planning pins/opportunities.ts PINNED_CONDITIONAL_PARTIES. */
export const ROUTE_PLANNING_CONDITIONAL_PARTIES_PIN = Object.freeze([
  "SENDER", "RECIPIENT", "THIRD_PARTY",
] as const);
export type RoutePlanningConditionalPartyPin = (typeof ROUTE_PLANNING_CONDITIONAL_PARTIES_PIN)[number];

/**
 * VALUE PIN — authority: ADR-0015 appendix A.6 (mirrored through
 * route-planning pins/hypotheses.ts PINNED_HYPOTHESIS_VERIFICATION_STATUSES):
 * the verification pairing vocabulary.
 */
export const ROUTE_PLANNING_VERIFICATION_STATUSES_PIN = Object.freeze([
  "PLANNER_VERIFIED", "UNVERIFIED",
] as const);
export type RoutePlanningVerificationPin = (typeof ROUTE_PLANNING_VERIFICATION_STATUSES_PIN)[number];

/**
 * VALUE PIN — authority: route-planning src/lab-facts.ts (the derived
 * repair interventions' deterministic identity `repair-intervention:<operatorId>`):
 * the prefix the hypothesis card's advisory-measurement attachment matches on.
 */
export const ROUTE_PLANNING_REPAIR_INTERVENTION_ID_PREFIX = "repair-intervention:" as const;

/* ======== the frozen people-language label maps ======== */

/** The party labels (people language, frozen — never a bare machine code). */
export const ROUTE_PLANNING_PARTY_LABELS: Readonly<Record<RoutePlanningConditionalPartyPin, string>> = Object.freeze({
  SENDER: "the sender",
  RECIPIENT: "the recipient",
  THIRD_PARTY: "a third party",
});

/**
 * The party-change labels (people language, frozen). Each label reads as a
 * verb phrase following its party label — "the recipient enables an
 * eligible Flutterwave receiving method" — anchored to the same corpus the
 * repair-operator catalogue's titles carry (the P21 texts byte-anchored).
 */
export const ROUTE_PLANNING_PARTY_CHANGE_LABELS: Readonly<Record<RoutePlanningConditionalPartyChangePin, string>> = Object.freeze({
  ENABLES_FLUTTERWAVE_RECEIVING_METHOD: "enables an eligible Flutterwave receiving method",
  ADDS_STRIPE_COMPATIBLE_INSTRUMENT: "adds a genuinely supported Stripe-compatible payment instrument",
  INTERMEDIARY_INTRODUCED: "is introduced as a verified intermediary bridging both sides",
  ENABLES_COMPATIBLE_RECEIVING_METHOD: "enables a receiving method the corridor already serves",
  ADDS_COMPATIBLE_FUNDING_INSTRUMENT: "adds a funding instrument the receiving rail serves",
  COMPLETES_PROVIDER_PERMISSIONS: "completes the provider permissions",
});

/* ======== the three advisory section pins (the A.7 growth) ======== */

/** One required party change: WHO must change WHAT (mirrors RequiredPartyChange). */
export interface RoutePlanningPartyChangePin {
  readonly party: RoutePlanningConditionalPartyPin;
  readonly change: RoutePlanningConditionalPartyChangePin;
}

/** One honest platform prerequisite (gapId + note — DISTINCT from party prerequisites). */
export interface RoutePlanningPlatformPrerequisitePin {
  readonly gapId: string;
  readonly note: string;
}

/**
 * STRUCTURAL PIN — the actionable conditional-opportunity card (ADR-0015 D8):
 * the advisory identity, the people-language title, the honest corridor
 * description, the party-change preconditions, the assumptions, the platform
 * prerequisites DISTINCT, the expiry and the A.6 verification pairing.
 * Mirrors route-planning's PinnedConditionalOpportunity (the P21-B panel's
 * consumption surface) + the construction request's presentation payloads +
 * the A.6 verification pairing the composition derives.
 */
export interface RoutePlanningConditionalOpportunityPin {
  readonly conditionalId: string;
  /** People language (the construction request's title — byte-anchored to the catalogue). */
  readonly title: string;
  /** The honest corridor explanation (the {facts}-substituted description, verbatim). */
  readonly description: string;
  readonly requiredPartyChanges: readonly RoutePlanningPartyChangePin[];
  readonly assumptions: readonly string[];
  readonly platformPrerequisites: readonly RoutePlanningPlatformPrerequisitePin[];
  /** Absolute expiry (ms — the same countdown-free instant honesty as the armed card). */
  readonly expiresAt: number;
  /** (A.6) PLANNER_VERIFIED iff the REAL planner re-run composed a rank-eligible route over the party-changed view. */
  readonly verification: RoutePlanningVerificationPin;
  /** The honest pairing reason (verbatim — the UNVERIFIED reason is never softened). */
  readonly verificationReason: string;
}

/**
 * STRUCTURAL PIN — the platform work item card (ADR-0015 D4/D8): what
 * PaySwap itself would need to build, each citing the verbatim exclusion
 * facts that prove the gap. Mirrors route-planning's
 * PinnedPlatformWorkRequest field-for-field.
 */
export interface RoutePlanningPlatformWorkPin {
  readonly workItemId: string;
  readonly gapId: string;
  readonly title: string;
  readonly requiredByOperatorIds: readonly string[];
  /** The fact refs (the verbatim grounded exclusion codes + messages that prove the gap). */
  readonly evidenceBasis: readonly RoutePlanningGroundedFactRefPin[];
}

/**
 * STRUCTURAL PIN — one verbatim grounded exclusion fact ref (mirrors
 * route-planning's PinnedGroundedFactRef / GroundedExclusionFact).
 */
export interface RoutePlanningGroundedFactRefPin {
  readonly side: "SENDER" | "RECIPIENT";
  readonly routeId: string;
  readonly code: string;
  readonly message: string;
  readonly fundingMethod?: string;
}

/**
 * STRUCTURAL PIN — the multi-hop hypothesis card (ADR-0015 D5/D8): the
 * assumption summary, the segments the REAL planner verified TODAY vs the
 * assumed segments, the cited frozen shape skeleton (provenance), the
 * remaining REAL blockers, the honest structural assessment and the A.6
 * verification pairing. NEVER a route: `neverExecutable` is the literal
 * true and the panel renders the frozen never-executable note.
 */
export interface RoutePlanningHypothesisPin {
  readonly hypothesisId: string;
  readonly operatorId: string;
  readonly assumptionSummary: string;
  /** Real planner-verified segment ids (labeled "verified today" on the card). */
  readonly verifiedSegmentIds: readonly string[];
  /** The assumed element's id (labeled "assumed" on the card). */
  readonly assumedSegmentIds: readonly string[];
  /** The cited frozen shape skeleton (provenance only — one of the NINE pinned shapes). */
  readonly citedShapeId: string;
  /** The remaining REAL exclusions (verbatim — the honest blockers). */
  readonly blockers: readonly RoutePlanningGroundedFactRefPin[];
  /** The honest structural assessment (conservative; UNKNOWN is never guessed into true). */
  readonly wouldCompose: boolean;
  readonly verification: RoutePlanningVerificationPin;
  readonly verificationReason: string;
  /** The pinned literal: a hypothesis is NEVER executable. */
  readonly neverExecutable: true;
  /** The pinned literal: the hypothesis tier is advisory only. */
  readonly advisoryOnly: true;
}

/**
 * (P23-B, ADR-0015 D6/D9) The model-proposal tier's composed state —
 * PROVENANCE ONLY, deliberately OUTSIDE the view digest projection (the
 * model-independent computation digest, the modelSelection precedent).
 * UNBOUND_NO_MODEL is the CDP-proven zero-model deployment truth.
 */
export type RoutePlanningModelProposalStatePin =
  | { readonly kind: "UNBOUND_NO_MODEL" }
  | { readonly kind: "UNBOUND_NO_TRANSPORT" }
  | { readonly kind: "BOUND"; readonly modelId: string; readonly foldedOperatorIds: readonly string[]; readonly novelProposalIds: readonly string[] };

/* ======== the honest standing notes (rendered VERBATIM) ======== */

/** The conditional-opportunities section's advisory law. */
export const ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_NOTE =
  "Conditional opportunities are advisory, never routes you can take today: each names what would need to change for this corridor to compose, grounded in the verbatim exclusion facts — a conditional never dispatches, and the only route onward is fresh planning, preview and a new explicit authorization." as const;

/** The honest not-composed note (the web/unbound tier's truth — rendered VERBATIM). */
export const ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_UNCOMPOSED_NOTE =
  "Conditional opportunities are not composed in this deployment — the repair-discovery derivation is not wired here, so none can be honestly derived. The composition root binds the repair-operator catalogue and the conditional construction engines; until then this section states the gap instead of inventing opportunities." as const;

/** The honest empty state (a derivation that ran and derived nothing). */
export const ROUTE_PLANNING_CONDITIONAL_OPPORTUNITIES_EMPTY_NOTE =
  "No conditional opportunity was derived for this corridor — an honest empty result, never a fabricated alternative." as const;

/** The platform-work section's framing law (what PaySwap itself would need to build). */
export const ROUTE_PLANNING_PLATFORM_WORK_NOTE =
  "Platform work is what PaySwap itself would need to build: each item cites the verbatim exclusion facts that prove the gap, and stays distinct from what any party could change on its own — a work item is advisory evidence, never a backlog promise." as const;

/** The honest not-composed note (the web/unbound tier's truth — rendered VERBATIM). */
export const ROUTE_PLANNING_PLATFORM_WORK_UNCOMPOSED_NOTE =
  "Platform work items are not composed in this deployment — the repair-discovery derivation is not wired here, so no gap can be honestly evidenced. The composition root binds the repair-operator catalogue; until then this section states the gap instead of inventing work." as const;

/** The honest empty state (a derivation that ran and derived nothing). */
export const ROUTE_PLANNING_PLATFORM_WORK_EMPTY_NOTE =
  "No platform work item was derived for this corridor — an honest empty result, never a fabricated gap." as const;

/** The hypotheses section's advisory law. */
export const ROUTE_PLANNING_HYPOTHESES_NOTE =
  "Multi-hop hypotheses are structural what-ifs over exactly one assumed element: the segments the real planner verified today are labeled verified, the assumed element is labeled assumed, and the cited shape skeleton is provenance only — never a compiled plan." as const;

/** The never-executable note (the frozen card law). */
export const ROUTE_PLANNING_HYPOTHESIS_NEVER_EXECUTABLE_NOTE =
  "A hypothesis is never a route — the only path onward is fresh planning, preview and new explicit authorization." as const;

/** The honest not-composed note (the web/unbound tier's truth — rendered VERBATIM). */
export const ROUTE_PLANNING_HYPOTHESES_UNCOMPOSED_NOTE =
  "Multi-hop hypotheses are not composed in this deployment — the hypothesis stage is not wired here, so none can be honestly derived. The composition root binds the planner re-run over the real sub-views; until then this section states the gap instead of inventing hypotheses." as const;

/** The honest empty state (a derivation that ran and derived nothing). */
export const ROUTE_PLANNING_HYPOTHESES_EMPTY_NOTE =
  "No multi-hop hypothesis was derived for this corridor — an honest empty result, never a fabricated bridge." as const;

/** The PLANNER_VERIFIED badge's standing text (the green-branded honesty). */
export const ROUTE_PLANNING_VERIFIED_BADGE_NOTE =
  "the planner re-verified this over the party-changed view" as const;

/** The model-proposal tier's honest zero-model note (the CDP-proven deployment truth). */
export const ROUTE_PLANNING_MODEL_PROPOSALS_UNBOUND_NO_MODEL_NOTE =
  "Model-assisted repair proposals are not composed in this deployment — no session model is selected (the zero-model deployment truth); the deterministic repair catalogue stands alone, never a fabricated proposal." as const;

/** The model-proposal tier's honest no-transport note (the named carry-forward). */
export const ROUTE_PLANNING_MODEL_PROPOSALS_UNBOUND_NO_TRANSPORT_NOTE =
  "A session model is selected but the model-proposal transport is not bound in this deployment — the live-model binding is a named carry-forward; no proposal is fabricated." as const;

/** The wait-criteria concrete-preconditions line's frozen prefix. */
export const ROUTE_PLANNING_WAIT_PRECONDITIONS_PREFIX =
  "Waiting for:" as const;

/** The wait-criteria concrete-preconditions line's frozen suffix (the D8 law). */
export const ROUTE_PLANNING_WAIT_PRECONDITIONS_SUFFIX =
  "— the concrete preconditions the derived conditional opportunities name, not just trigger categories." as const;
