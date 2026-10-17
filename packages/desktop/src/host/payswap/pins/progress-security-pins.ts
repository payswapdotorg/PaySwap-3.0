/**
 * PaySwap Desktop (P7-W2) — structural pins of the @payswap/surface
 * progress-state and security-vocabulary contracts (mirrors
 * packages/surface/src/{progress-states,security-vocabulary,
 * authorization-changes}.ts at the base commit recorded in pin-registry.ts;
 * pins surface.progress-states + surface.security-vocabulary).
 *
 * HONEST-STATES LAW (ported with the pins — the desktop composition's
 * core law):
 * - Submission is not finality: PAYOUT_SUBMITTED renders an acknowledgement,
 *   never finality.
 * - A payout sent is not beneficiary credit: BENEFICIARY_CREDITED exists
 *   only as its own evidence-backed observation (claimed without evidence,
 *   the fold refuses — INV-24).
 * - UNKNOWN is neither failure nor success (INV-04): rendered as UNKNOWN
 *   with reconciliation-first wording; no blind retry from this surface.
 * - Late returns: whenever PAYOUT_SENT is observed, the return path stays
 *   open and history is never rewritten.
 * - Every stage observation carries a REFERENCE to the authoritative
 *   record (INV-23) — the view never embeds the record itself.
 * - BLOCK stays BLOCK at the display boundary (INV-21); UNKNOWN stays
 *   UNKNOWN (never rendered as failure or success).
 */

import type { PinnedSurfaceProvenance } from "./surface-pins.js";

// ---------------------------------------------------------------------------
// Progress stages (pin surface.progress-states)
// ---------------------------------------------------------------------------

/** Mirrors SURFACE_PROGRESS_STAGES — the sixteen-stage lifecycle vocabulary. */
export const PINNED_SURFACE_PROGRESS_STAGES = [
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

export type PinnedSurfaceProgressStage = (typeof PINNED_SURFACE_PROGRESS_STAGES)[number];

/** Mirrors StageStatus — UNKNOWN is a first-class status (INV-04). */
export const PINNED_STAGE_STATUSES = [
  "ACHIEVED",
  "IN_PROGRESS",
  "PENDING",
  "UNKNOWN",
  "FAILED",
  "NOT_APPLICABLE",
] as const;

export type PinnedStageStatus = (typeof PINNED_STAGE_STATUSES)[number];

/**
 * Mirrors StageObservation — one stage observation, a PROJECTION input.
 * The surface references the authoritative record; it never carries the
 * record itself (INV-23).
 */
export interface PinnedStageObservation {
  readonly stage: PinnedSurfaceProgressStage;
  readonly status: PinnedStageStatus;
  /** Reference to the authoritative record that owns this stage. */
  readonly authorityRecordRef: string;
  /** Evidence references — every definitive claim is evidence-backed. */
  readonly evidenceRefs: readonly string[];
  /** When this observation was made (ISO-8601 string, explicit input). */
  readonly observedAt: string;
  /** Optional provider-visible status label, displayed verbatim. */
  readonly providerStatus?: string;
}

/** Mirrors ProgressFoldInput — the clock is an INPUT, never ambient. */
export interface PinnedProgressFoldInput {
  readonly now: string;
}

/** Mirrors StageTone — people-language tone (UI tone, not a new verdict). */
export type PinnedStageTone = "neutral" | "progress" | "success" | "warning" | "danger";

/** Mirrors StageView — one stage's people-language view. */
export interface PinnedStageView {
  readonly stage: PinnedSurfaceProgressStage;
  readonly status: PinnedStageStatus;
  readonly tone: PinnedStageTone;
  readonly headline: string;
  readonly explanation: string;
  readonly authorityRecordRef: string;
  readonly evidenceRefs: readonly string[];
  readonly observedAt: string;
  readonly providerStatus?: string;
}

/** Mirrors ProgressFacts — honest facts the renderer can branch on. */
export interface PinnedProgressFacts {
  readonly submissionIsNotFinality: boolean;
  readonly payoutSentWithoutBeneficiaryCredit: boolean;
  readonly returnPathOpen: boolean;
}

/** Mirrors ProgressTimelineView — the full progress timeline view. */
export interface PinnedProgressTimelineView {
  readonly outcomeLine: string;
  readonly stages: readonly PinnedStageView[];
  readonly facts: PinnedProgressFacts;
  readonly provenance: PinnedSurfaceProvenance;
}

// ---------------------------------------------------------------------------
// Security gate vocabulary (pin surface.security-vocabulary)
// ---------------------------------------------------------------------------

/** Mirrors GatePresentationTone — the people-language tone per verdict. */
export type PinnedGatePresentationTone = "danger" | "success" | "warning";

/** Mirrors GateBlockReason — a BLOCK reason (structural pin). */
export interface PinnedGateBlockReason {
  readonly dimension: string;
  readonly code: string;
  readonly message: string;
  readonly invariantRefs: readonly string[];
}

/** Mirrors GateAllowCheck — an ALLOW check (structural pin). */
export interface PinnedGateAllowCheck {
  readonly dimension: string;
  readonly outcome: string;
  readonly code: string;
  readonly detail: string;
}

/** Mirrors GateUnknownDimension — an UNKNOWN dimension (structural pin). */
export interface PinnedGateUnknownDimension {
  readonly dimension: string;
  readonly code: string;
  readonly message: string;
}

/** Mirrors SecurityGateDecisionSource — what the fold reads (structural pin). */
export interface PinnedSecurityGateDecisionSource {
  readonly decision: "BLOCK" | "ALLOW" | "UNKNOWN";
  readonly reasons?: readonly PinnedGateBlockReason[];
  readonly checks?: readonly PinnedGateAllowCheck[];
  readonly dimensions?: readonly PinnedGateUnknownDimension[];
  readonly evidenceRefs: readonly string[];
}

/** Mirrors SecurityDecisionView — the human-readable fold of one decision. */
export interface PinnedSecurityDecisionView {
  readonly verdict: "BLOCK" | "ALLOW" | "UNKNOWN";
  readonly tone: PinnedGatePresentationTone;
  readonly headline: string;
  readonly explanation: string;
  readonly drilldown: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly provenance: PinnedSurfaceProvenance;
}

// ---------------------------------------------------------------------------
// Authorization changes (pin surface.progress-states — change linkage)
// ---------------------------------------------------------------------------

/** Mirrors AUTHORIZATION_CHANGE_KINDS — the closed change vocabulary. */
export const PINNED_AUTHORIZATION_CHANGE_KINDS = [
  "QUOTE_EXPIRED",
  "QUOTE_TERMS_CHANGED",
  "RECIPIENT_CHANGED",
  "AMOUNT_CHANGED",
  "FUNDING_METHOD_CHANGED",
  "PROVIDER_OBSERVATION_CHANGED",
  "SECURITY_EPOCH_ADVANCED",
  "MANDATE_REVOKED",
] as const;

export type PinnedAuthorizationChangeKind = (typeof PINNED_AUTHORIZATION_CHANGE_KINDS)[number];

/** Mirrors AuthorizationChangeClass. */
export type PinnedAuthorizationChangeClass = "TERMS_MATERIAL" | "AUTHORITY_SIDE";

// ---------------------------------------------------------------------------
// Guards (closed vocabularies, fail-closed)
// ---------------------------------------------------------------------------

/** Guard: a stage is in the pinned (mirrored) vocabulary. */
export function isPinnedProgressStage(
  value: unknown,
): value is PinnedSurfaceProgressStage {
  return (
    typeof value === "string" &&
    (PINNED_SURFACE_PROGRESS_STAGES as readonly unknown[]).includes(value)
  );
}

/** Guard: a stage status is in the pinned (mirrored) vocabulary. */
export function isPinnedStageStatus(value: unknown): value is PinnedStageStatus {
  return (
    typeof value === "string" &&
    (PINNED_STAGE_STATUSES as readonly unknown[]).includes(value)
  );
}

/** Guard: a gate decision verdict is in the pinned (mirrored) vocabulary. */
export function isPinnedGateVerdict(value: unknown): value is "BLOCK" | "ALLOW" | "UNKNOWN" {
  return (
    typeof value === "string" &&
    ["BLOCK", "ALLOW", "UNKNOWN"].includes(value)
  );
}
