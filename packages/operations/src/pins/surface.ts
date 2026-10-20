/**
 * @payswap/operations — pinned wire shapes of the Surface (P8-W3, lane
 * p8-w3; commit 1/4).
 *
 * Authority: @payswap/surface (P2-W3). Health/observability contracts in
 * this package must not contradict the honest-state laws the
 * customer-facing surface already enforces: UNKNOWN is a first-class
 * status (never rendered as FAILED), submission is not finality, and a
 * claim without evidence is a contract violation. The progress-stage and
 * stage-status vocabularies below are the closed sets the observability
 * taxonomy correlates against. PINS ARE NOT IMPORTS.
 */

/**
 * VALUE PIN — authority: @payswap/surface src/progress-states.ts
 * `SURFACE_PROGRESS_STAGES` (byte-identical closed vocabulary, lifecycle
 * order then late-exception paths).
 */
export const PINNED_SURFACE_PROGRESS_STAGES = Object.freeze([
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
] as const);

/** STRUCTURAL PIN — authority: @payswap/surface `SurfaceProgressStage`. */
export type PinnedSurfaceProgressStage =
  (typeof PINNED_SURFACE_PROGRESS_STAGES)[number];

/**
 * VALUE PIN — authority: @payswap/surface src/progress-states.ts
 * `StageStatus` (byte-identical). UNKNOWN is a first-class status — the
 * observability law mirrors it: an UNKNOWN outcome event is never
 * collapsed into a failure event.
 */
export const PINNED_STAGE_STATUSES = Object.freeze([
  "ACHIEVED",
  "IN_PROGRESS",
  "PENDING",
  "UNKNOWN",
  "FAILED",
  "NOT_APPLICABLE",
] as const);

/** STRUCTURAL PIN — authority: @payswap/surface `StageStatus`. */
export type PinnedStageStatus = (typeof PINNED_STAGE_STATUSES)[number];

/**
 * VALUE PIN — authority: @payswap/surface src/outcomes.ts: the five
 * outcome actions (pay/receive/move/convert/checkout) — the fixed,
 * versioned primary-surface vocabulary. Operational rollout gates that
 * reference "the surface is ready" correlate to these.
 */
export const PINNED_OUTCOME_ACTIONS = Object.freeze([
  "pay",
  "receive",
  "move",
  "convert",
  "checkout",
] as const);

/** STRUCTURAL PIN — authority: @payswap/surface `OutcomeActionId`. */
export type PinnedOutcomeActionId = (typeof PINNED_OUTCOME_ACTIONS)[number];

/**
 * VALUE PIN — authority: @payswap/surface src/progress-states.ts header
 * law (INV-24 at the projection boundary): a beneficiary-credit or other
 * provider-effect claim "claimed without evidence throws — no fabricated
 * provider effects". The readiness law in this package is the
 * operational form: no health claim without a contract-backed source.
 */
export const PINNED_NO_FABRICATED_EFFECTS_LAW =
  "claimed-without-evidence-throws-no-fabricated-provider-effects" as const;
