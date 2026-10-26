/**
 * PaySwap Desktop (P17-A, ADR-0010 D2/D3) — the payment-mission channel
 * members' contracts: the read/input surface the renderer consumes over
 * the payswap-desktop channel, and its JSON-safe DTOs.
 *
 * THE CHANNEL LAW (the no-parallel-engine discipline, extended):
 * - every member is a READ or an INTAKE-PLANE INPUT verb — all names
 *   pass the no-authority-verb law (never execute/retry/cancel/
 *   confirm/settle/payout/approve — desktop-console-client.test.ts);
 * - NO authorization member is exposed: requestAuthorization /
 *   resolveAuthorization / dispatch stay HOST-SIDE (ADR-0010 D2 — the
 *   D7 chain is preserved; approval is minted only by a PREVIEW_UI_ACT
 *   behind the origin law, and the channel never sees it);
 * - the DTOs carry NO credentials, NO secrets and NO authorization
 *   artifacts: the detail projects the mission's demand-side record
 *   (timeline, intake fields, compiled intent, preview id, plan
 *   selection) and a COUNT of attempts — never the attempt records
 *   themselves (they carry the consumed-artifact lineage);
 * - the seed member PINS the origin to COMPOSER_TEXT: the channel seed
 *   comes from the composer text plane; PREVIEW_UI_ACT is reserved for
 *   the authority act and can never arrive through this channel.
 */

import type {
  CompiledPaymentIntent,
  PaymentIntakeFieldStates,
  PaymentMissionDirection,
  PaymentMissionPlanSelection,
  PaymentMissionPlanSelectionInput,
  PaymentTaskEventKind,
  PaymentTaskOrigin,
  PaymentTaskStatus,
} from "../payments/contracts.js";
import type { PaymentGateId } from "../payments/validation-gates.js";

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
 * the presented preview id and the stage-9a plan selection — plus the
 * attempt COUNT (the attempt records themselves stay host-side: they
 * carry the consumed-authorization lineage this channel never exposes).
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
// The member surface (read/input verbs only — no authority verbs)
// ---------------------------------------------------------------------------

/**
 * The payment-mission channel members (P17-A, ADR-0010 D2). Every
 * member fails closed with PaymentPlaneNotConfiguredError when the
 * host composed no payment-mission runtime (the workspace-store
 * posture — never a silent no-op).
 */
export interface IPaySwapDesktopPaymentMissionMembers {
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
}
