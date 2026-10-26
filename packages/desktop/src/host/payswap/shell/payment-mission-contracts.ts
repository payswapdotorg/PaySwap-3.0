/**
 * PaySwap Desktop (P17-A, ADR-0010 D2/D3; P18-A, ADR-0011 D2/D3; P19-A,
 * ADR-0012 D1) — the payment-mission channel members' contracts: the
 * read/input surface the renderer consumes over the payswap-desktop
 * channel, and its JSON-safe DTOs.
 *
 * THE CHANNEL LAW (the no-parallel-engine discipline, extended):
 * - every member is a READ or an INTAKE-PLANE INPUT verb — all names
 *   pass the no-authority-verb law (never execute/retry/cancel/
 *   confirm/settle/payout/approve — desktop-console-client.test.ts);
 * - THE APPROVAL ACT (P18-A, ADR-0011 D2 — the lawful amendment of
 *   the ADR-0010 D2 boundary): the authorization round-trip crosses
 *   as TWO edge-pinned members (paymentMissionRequestApproval /
 *   paymentMissionResolveApproval) mirroring the runtime's
 *   requestAuthorization / resolveAuthorization 1:1. The ORIGIN LAW
 *   is preserved AT THE EDGE: the resolve member PINS the decision
 *   origin to PREVIEW_UI_ACT and the principal to the host operator
 *   ref — the renderer supplies ONLY requestId + APPROVE|DECLINE and
 *   can never supply, forge or see an origin or principal, so the
 *   approval act IS a preview UI act by construction. THE ARTIFACT
 *   NEVER CROSSES: no artifactId or artifact field exists on any
 *   wire shape here — the single-use artifact is minted and consumed
 *   host-side; the observable truth is the mission state + the
 *   AUTHORIZATION_GRANTED / AUTHORIZATION_DECLINED timeline events;
 * - THE DISPATCH ACT (P19-A, ADR-0012 D1 — the lawful narrowing of
 *   the ADR-0011 D3 boundary, the same pattern as the approval
 *   amendment above): the dispatch crosses as TWO members — the
 *   armed-effect READ + the lane-choice ACT (see
 *   ./dispatch-contracts.ts, split for the ≤400-line file law). The
 *   wire carries a CHOICE, never a grant: the eligible lane set is
 *   recomputed host-side at act time, and the artifact, the
 *   operation and the INV-25 mode resolve HOST-SIDE — the artifact
 *   never crosses, NOT EVEN AS AN INPUT. The detail DTO projects
 *   attempt STATES — outcome facts only, derived host-side — never
 *   the attempt records themselves (they carry the
 *   consumed-authorization lineage);
 * - the DTOs carry NO credentials, NO secrets and NO authorization
 *   artifacts: the detail projects the mission's demand-side record
 *   (timeline, intake fields, compiled intent, preview id, plan
 *   selection, attempt states) and a COUNT of attempts;
 * - the seed member PINS the origin to COMPOSER_TEXT: the channel
 *   seed comes from the composer text plane; PREVIEW_UI_ACT is
 *   reserved for the authority act, which arrives only through the
 *   approval member's edge pin above.
 */

import type {
  CompiledPaymentIntent,
  PaymentExecutionMode,
  PaymentIntakeFieldStates,
  PaymentMissionDirection,
  PaymentMissionPlanSelection,
  PaymentMissionPlanSelectionInput,
  PaymentTaskEventKind,
  PaymentTaskOrigin,
  PaymentTaskStatus,
} from "../payments/contracts.js";
import type { PaymentGateId } from "../payments/validation-gates.js";
import type { IPaySwapDesktopDispatchMembers } from "./dispatch-contracts.js";
export type {
  IPaySwapDesktopDispatchMembers,
  PaymentDispatchLaneDto,
  PaymentMissionArmedEffectDto,
  PaymentMissionDispatchOutcomeDto,
} from "./dispatch-contracts.js";

// ---------------------------------------------------------------------------
// The DTOs (JSON-safe channel shapes — projections of host records)
// ---------------------------------------------------------------------------

/** One timeline event on the wire (append-only; summary is people language). */
export interface PaymentMissionEventDto {
  readonly id: string;
  /** ISO-8601 UTC instant. */
  readonly at: string;
  readonly kind: PaymentTaskEventKind;
  readonly summary: string;
  readonly correlationRef?: string;
}

/**
 * The full mission record, JSON-safe: the append-only timeline, the nine
 * intake captures, the compiled 11-key canonical intent (pinned shape),
 * the presented preview id, the stage-9a plan selection and the
 * attempt-state projection (P18-A, ADR-0011 D3 — outcome facts only;
 * the attempt records themselves stay host-side: they carry the
 * consumed-authorization lineage this channel never exposes) — plus
 * the attempt COUNT (kept for the P17 read model).
 */
export interface PaymentMissionDetailDto {
  readonly id: string;
  readonly direction: PaymentMissionDirection;
  readonly goalStatement: string;
  readonly origin: PaymentTaskOrigin;
  readonly status: PaymentTaskStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly events: readonly PaymentMissionEventDto[];
  readonly fields: PaymentIntakeFieldStates;
  readonly intent?: CompiledPaymentIntent;
  readonly previewId?: string;
  readonly planSelection?: PaymentMissionPlanSelection;
  /** The attempt states, in start order (ADR-0011 D3 — no lineage). */
  readonly attempts: readonly PaymentMissionAttemptStateDto[];
  readonly attemptCount: number;
}

/** One board row (the read-model the payments surface renders). */
export interface PaymentMissionBoardItemDto {
  readonly missionId: string;
  readonly direction: PaymentMissionDirection;
  readonly goalStatement: string;
  readonly status: PaymentTaskStatus;
  readonly hasCompiledIntent: boolean;
  readonly hasPreview: boolean;
  readonly planSelection?: PaymentMissionPlanSelection;
  readonly updatedAt: string;
}

/** One per-gate decision on the wire (the reason carried VERBATIM). */
export interface PaymentPreviewGateDecisionDto {
  readonly gate: PaymentGateId;
  readonly decision: "BLOCK" | "PROCEED";
  readonly reason: string;
}

/** The gate aggregate on the wire: the decision + every reason verbatim. */
export interface PaymentPreviewGatesDto {
  readonly decision: "BLOCK" | "PROCEED";
  readonly decisions: readonly PaymentPreviewGateDecisionDto[];
  /** Every BLOCK reason verbatim, in gate order (empty iff PROCEED). */
  readonly reasons: readonly string[];
}

/**
 * The presented preview on the wire. In this deployment the six gates
 * run over the HONEST EMPTY environment (zero connected capability
 * instances) and the compile may BLOCK typed (INV-7 — no observed
 * funding source): the member surfaces that typed block honestly —
 * BLOCK reasons verbatim, dispatchable false — and NEVER fabricates an
 * intent, a route or a gate outcome.
 */
export interface PaymentPreviewDto {
  readonly previewId: string;
  readonly missionId: string;
  readonly gates: PaymentPreviewGatesDto;
  readonly dispatchable: boolean;
  readonly presentedAt: string;
  readonly planSelection?: PaymentMissionPlanSelection;
}

/** The channel seed input (the host pins the origin to COMPOSER_TEXT). */
export interface PaymentMissionSeedInputDto {
  readonly direction: PaymentMissionDirection;
  readonly goalStatement: string;
}

/** The seed outcome (create-or-resume convergence, ADR-0007 D6). */
export interface PaymentMissionSeedOutcomeDto {
  readonly missionId: string;
  readonly action: "CREATED" | "RESUMED";
}

// ---------------------------------------------------------------------------
// The approval wire shapes (P18-A, ADR-0011 D2) — the scoped request, the
// typed resolution, and NOTHING from the artifact plane
// ---------------------------------------------------------------------------

/**
 * The authorization scope on the wire (P18-A, ADR-0011 D2): mirrors the
 * host PaymentAuthorizationScope shape verbatim — the exact terms an
 * approval would cover. The material-change intentDigest binding stays
 * host-side (the digest crosses as an opaque value; the compiler of it
 * does not).
 */
export interface PaymentAuthorizationScopeDto {
  readonly missionId: string;
  readonly direction: PaymentMissionDirection;
  readonly amount: { readonly currency: string; readonly minorUnits: string };
  readonly destinationSummary: string;
  readonly intentDigest: string;
}

/**
 * A pending authorization request on the wire (P18-A, ADR-0011 D2):
 * the scoped request over the mission's PERSISTED preview — the scope
 * copies the preview verbatim and the request carries the
 * scopeSummary + expiry the operator decides against. NO artifact
 * fields: the single-use artifact a grant mints stays host-side and
 * NEVER crosses the channel.
 */
export interface PaymentAuthorizationRequestDto {
  readonly requestId: string;
  readonly previewId: string;
  readonly missionId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly scope: PaymentAuthorizationScopeDto;
  readonly scopeSummary: string;
}

/**
 * The typed resolution outcome on the wire (P18-A, ADR-0011 D2) —
 * mirrors the runtime's AuthorizationResolution outcome kinds
 * honestly:
 * - GRANTED echoes the approved scope + expiry and NEVER the
 *   artifactId (the artifact stays host-side);
 * - DECLINED carries the people-language reason;
 * - REJECTED mirrors the runtime's non-UI-origin rejection —
 *   UNREACHABLE through this member, because the channel edge pins
 *   origin := PREVIEW_UI_ACT (a non-UI origin can never arrive); the
 *   kind exists so the wire type mirrors the runtime's resolution
 *   type without lying about the channel's reach.
 * Failures beyond these outcomes (unknown / expired / already-resolved
 * request, absent mission or preview) are THROWN typed
 * PaymentMissionError — the channel's established fail-closed
 * discipline, identical to every other mission-plane member.
 */
export type PaymentAuthorizationResolutionDto = {
  readonly outcome:
    | { readonly kind: "GRANTED"; readonly scope: PaymentAuthorizationScopeDto; readonly expiresAt: string }
    | { readonly kind: "DECLINED"; readonly reason: string }
    | { readonly kind: "REJECTED"; readonly reason: string };
  readonly missionId: string;
  readonly previewId: string;
};

// ---------------------------------------------------------------------------
// The attempt-state projection (P18-A, ADR-0011 D3) — outcome facts only
// ---------------------------------------------------------------------------

/** The attempt outcome vocabulary (P18-A, ADR-0011 D3 — derived host-side). */
export const PAYMENT_ATTEMPT_OUTCOMES = [
  "STARTED",
  "CONFIRMED",
  "FAILED",
  "OUTCOME_UNKNOWN",
  "RECONCILED",
  "REFUSED",
] as const;
export type PaymentAttemptOutcome = (typeof PAYMENT_ATTEMPT_OUTCOMES)[number];

/**
 * One consequential attempt's STATE on the wire (P18-A, ADR-0011 D3):
 * outcome facts only, derived host-side from the attempt record —
 * STARTED (no answer recorded yet), CONFIRMED / FAILED / OUTCOME_UNKNOWN
 * (the envelope's three-valued outcome), RECONCILED (provider evidence
 * closed an unknown), REFUSED (the authority refused before any
 * effect). The projection carries NO idempotency keys, NO
 * command/correlation ids, NO connection refs and NO authorization
 * artifact ids — the consumed-artifact lineage stays host-side.
 */
export interface PaymentMissionAttemptStateDto {
  readonly attemptId: string;
  readonly startedAt: string;
  readonly operation: "CREATE_EXTERNAL_EFFECT" | "CANCEL_OR_REVERSE_EFFECT";
  readonly executionMode: PaymentExecutionMode;
  readonly outcome: PaymentAttemptOutcome;
  /** People language (the outcome fact, phrased for the operator). */
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// The member surface (read/input verbs only — no authority verbs)
// ---------------------------------------------------------------------------

/**
 * The payment-mission channel members (P17-A, ADR-0010 D2; P19-A,
 * ADR-0012 D1 for the dispatch members). Every member fails closed
 * with PaymentPlaneNotConfiguredError when the host composed no
 * payment-mission runtime (the workspace-store posture — never a
 * silent no-op).
 */
export interface IPaySwapDesktopPaymentMissionMembers extends IPaySwapDesktopDispatchMembers {
  /**
   * The mission board, newest-updated-first: the read model for the
   * payments surface (status, compiled-intent/preview presence and the
   * stage-9a plan selection — demand-side facts only).
   */
  paymentMissionBoard(): Promise<readonly PaymentMissionBoardItemDto[]>;

  /** The full mission detail, or null when no such mission exists. */
  paymentMissionDetail(missionId: string): Promise<PaymentMissionDetailDto | null>;

  /**
   * Seed-or-resume a mission from the composer text plane: the host
   * PINS the origin to COMPOSER_TEXT (PREVIEW_UI_ACT is reserved for
   * the authority act and can never arrive through this channel).
   */
  paymentMissionSeed(input: PaymentMissionSeedInputDto): Promise<PaymentMissionSeedOutcomeDto>;

  /**
   * Ask for the next missing intake field (deterministic order), or
   * null when the intake is complete.
   */
  paymentMissionAskNextField(
    missionId: string,
  ): Promise<{ readonly fieldId: string; readonly question: string } | null>;

  /** Capture one intake field (fail-closed validation) → the updated detail. */
  paymentMissionCapture(
    missionId: string,
    fieldId: string,
    value: unknown,
  ): Promise<PaymentMissionDetailDto>;

  /**
   * Present the structured preview over the HONEST EMPTY gate
   * environment (the deployment fact: zero connected capability
   * instances) — six gates + compile + PREVIEW_PRESENTED, persisted.
   * The typed BLOCK outcome is surfaced honestly (see the DTO law);
   * null when the mission does not exist.
   */
  paymentMissionPresentPreview(missionId: string): Promise<PaymentPreviewDto | null>;

  /**
   * Record the stage-9a plan selection (P17-A, ADR-0010 D3): a RECORD,
   * never an authorization — the field carries the latest selection
   * while the PLAN_SELECTION_RECORDED events stay append-only.
   */
  paymentMissionRecordPlanSelection(
    missionId: string,
    input: PaymentMissionPlanSelectionInput,
  ): Promise<PaymentMissionDetailDto>;

  /**
   * Mint a pending authorization request over the mission's PERSISTED
   * preview (P18-A, ADR-0011 D2): the scope copies the preview verbatim
   * and the request carries the scopeSummary + expiry the operator
   * decides against. NO artifact fields exist on the request or any
   * successor shape. Fails typed (the runtime's PaymentMissionError)
   * when the mission does not exist, has no presented preview, or the
   * persisted preview is not dispatchable — a blocked preview can
   * never arm authorization.
   */
  paymentMissionRequestApproval(missionId: string): Promise<PaymentAuthorizationRequestDto>;

  /**
   * Resolve a pending request with the operator's decision (P18-A,
   * ADR-0011 D2). The renderer supplies ONLY the requestId and
   * "APPROVE" | "DECLINE" — the channel edge PINS the decision origin
   * to PREVIEW_UI_ACT and the principal to the host operator ref (the
   * renderer can never supply, forge or see either). The single-use
   * artifact a grant mints NEVER crosses the channel: the observable
   * truth is the resolution outcome + the mission timeline's
   * AUTHORIZATION_GRANTED / AUTHORIZATION_DECLINED event.
   */
  paymentMissionResolveApproval(
    requestId: string,
    decision: "APPROVE" | "DECLINE",
  ): Promise<PaymentAuthorizationResolutionDto>;
}
