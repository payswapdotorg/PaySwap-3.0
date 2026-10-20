/**
 * @payswap/financial-certification — the pinned wire shapes of the
 * customer-facing surface authority (P8-W1).
 *
 * Authority: @payswap/surface (P2-W3 — the progress/exception/UNKNOWN
 * state projections). Under the zero-sibling law the wire shapes are
 * LOCAL STRUCTURAL PINS; cross-lane consistency asserted by
 * test/pins.test.ts.
 */

/**
 * VALUE PIN — authority: @payswap/surface src/progress-states.ts
 * `SURFACE_PROGRESS_STAGES` late-event tail (byte-identical): the
 * first-class late-exception stages — RETURNED, REFUNDED, CHARGED_BACK.
 * Late money movement is a SURFACE-VISIBLE lifecycle stage, never a
 * silent edit of an earlier stage.
 */
export const PINNED_SURFACE_LATE_STAGES = Object.freeze([
  "RETURNED",
  "REFUNDED",
  "CHARGED_BACK",
] as const);

export type PinnedSurfaceLateStage = (typeof PINNED_SURFACE_LATE_STAGES)[number];

/**
 * VALUE PIN — authority: @payswap/surface src/progress-states.ts
 * `StageStatus` (byte-identical): UNKNOWN is a first-class status
 * (INV-04) — an honest projection renders ambiguity as UNKNOWN, neither
 * failure nor success.
 */
export const PINNED_STAGE_STATUSES = Object.freeze([
  "ACHIEVED",
  "IN_PROGRESS",
  "PENDING",
  "UNKNOWN",
  "FAILED",
  "NOT_APPLICABLE",
] as const);

export type PinnedStageStatus = (typeof PINNED_STAGE_STATUSES)[number];

/**
 * VALUE PIN — authority: @payswap/surface src/progress-states.ts law
 * "submission is not finality" + "a payout sent is not beneficiary
 * credit": the ordered stage pair whose DISTINCTION the surface must
 * preserve — PAYOUT_SUBMITTED / PAYOUT_SENT are acknowledgements of
 * submission/sending; only the separate evidence-backed
 * BENEFICIARY_CREDITED observation is credit.
 */
export const PINNED_PAYOUT_STAGE_ORDER = Object.freeze([
  "PAYOUT_INSTRUCTED",
  "PAYOUT_SUBMITTED",
  "PAYOUT_SENT",
  "BENEFICIARY_CREDITED",
] as const);

export type PinnedPayoutStage = (typeof PINNED_PAYOUT_STAGE_ORDER)[number];
