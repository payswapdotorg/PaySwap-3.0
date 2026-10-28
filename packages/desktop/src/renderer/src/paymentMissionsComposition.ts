/**
 * PaySwap Desktop renderer (P18-C, ADR-0011 D1; grown P19-C + P20-C) — the
 * payment-missions composition root: binds the payswap-desktop
 * channel's mission-plane members (the P17-A read/input members + the
 * P18-A edge-pinned approval members + the P19-A dispatch members +
 * the P20-A reconciliation members) into the app's pinned
 * PaymentMissionsPort, at the desktop renderer's business-root
 * initialization.
 *
 * THE WIRING (ADR-0011 D1/D2):
 * - The port: channelPaymentMissionsPort adapts the channel client to
 *   the pinned port. The read/input members pass through structurally
 *   (the wire DTOs ARE the pin shapes — the two-sided mirror pins them);
 *   the approval RESOLUTION is mapped (the wire nests the outcome under
 *   {outcome: {kind, ...}} — the pin's flat discriminated union), and
 *   the channel's typed fail-closed PaymentPlaneNotConfiguredError is
 *   rethrown as the app's PaymentMissionsPlaneNotConfiguredError so the
 *   mount renders the honest note (never an error mask).
 * - THE ORIGIN LAW (ADR-0011 D2) is preserved by the channel members
 *   themselves: the renderer supplies ONLY requestId + APPROVE|DECLINE;
 *   the origin (PREVIEW_UI_ACT) and the principal are pinned HOST-SIDE
 *   at the channel edge. This adapter never touches an origin. The
 *   P20-A reconciliation members carry the same discipline
 *   (ADR-0013 D1): the renderer supplies ONLY the attemptId + the
 *   transcribed evidence; the origin (OPERATOR_EVIDENCE_ACT) and the
 *   principal stay pinned host-side at the channel edge.
 * - HONEST FAILURE: if the composition cannot bind (the channel is
 *   absent), the seam stays at its honest default — the missions
 *   surface renders the not-wired note; nothing is masked.
 *
 * Mounting law: this module is the composition root — the ONLY renderer
 * file besides main.tsx that may import @payswap/app for the missions
 * surface (the ADR-0010 D1 renderer-exemption precedent; module
 * ownership unchanged — no new edges).
 */

import {
  bindPaymentMissionsPort,
  PaymentMissionsPlaneNotConfiguredError,
  resetSharedPaymentMissionsPort,
  type PaymentMissionsApprovalResolution,
  type PaymentMissionsPortWithDispatch,
  type PaymentMissionsPortWithReconciliation,
  type PaymentMissionsPortWithVerification,
} from "@payswap/app";
import type { DesktopConsoleChannelServices } from "./consoleWorkspaceMount.js";
import type {
  PaySwapPaymentAuthorizationRequestDto,
  PaySwapPaymentAuthorizationResolutionDto,
  PaySwapPaymentDispatchOutcomeDto,
  PaySwapPaymentMissionArmedEffectDto,
  PaySwapPaymentMissionBoardItemDto,
  PaySwapPaymentMissionDetailDto,
  PaySwapPaymentMissionPendingReconciliationDto,
  PaySwapPaymentMissionReconciliationOutcomeDto,
  PaySwapPaymentMissionVerificationOutcomeDto,
  PaySwapPaymentPreviewDto,
  PaySwapPaymentReconcileEvidenceDto,
} from "./consolePaymentMissionWire.js";

/* ------------- the channel client surface this composition rides ------------- */

/**
 * The mission-plane members the port rides (the channel client's
 * surface — the drift-tested member set; see consoleWorkspaceMount.tsx).
 */
export interface MissionPlaneApprovalChannelClient {
  paymentMissionBoard(): Promise<readonly PaySwapPaymentMissionBoardItemDto[]>;
  paymentMissionDetail(missionId: string): Promise<PaySwapPaymentMissionDetailDto | null>;
  paymentMissionAskNextField(
    missionId: string,
  ): Promise<{ readonly fieldId: string; readonly question: string } | null>;
  paymentMissionCapture(
    missionId: string,
    fieldId: string,
    value: unknown,
  ): Promise<PaySwapPaymentMissionDetailDto>;
  paymentMissionPresentPreview(missionId: string): Promise<PaySwapPaymentPreviewDto | null>;
  paymentMissionRequestApproval(missionId: string): Promise<PaySwapPaymentAuthorizationRequestDto>;
  paymentMissionResolveApproval(
    requestId: string,
    decision: "APPROVE" | "DECLINE",
  ): Promise<PaySwapPaymentAuthorizationResolutionDto>;
  paymentMissionArmedEffect(missionId: string): Promise<PaySwapPaymentMissionArmedEffectDto>;
  paymentMissionDispatch(
    missionId: string,
    connectionRef: string,
  ): Promise<PaySwapPaymentDispatchOutcomeDto>;
  paymentMissionPendingReconciliation(
    missionId: string,
  ): Promise<PaySwapPaymentMissionPendingReconciliationDto>;
  paymentMissionReconcile(
    missionId: string,
    attemptId: string,
    evidence: PaySwapPaymentReconcileEvidenceDto,
  ): Promise<PaySwapPaymentMissionReconciliationOutcomeDto>;
  paymentMissionVerifyAttempt(
    missionId: string,
    attemptId: string,
  ): Promise<PaySwapPaymentMissionVerificationOutcomeDto>;
}

/** The wire shapes are the pin shapes structurally (the mirror pins both sides). */

/**
 * Map the wire resolution onto the pin union (the ONE shape mapping the
 * bridge owns): the wire nests the outcome under {outcome: {kind, ...}}
 * with the mission/preview echo; the pin is the flat discriminated union
 * the panel renders. The wire's REJECTED kind (unreachable through the
 * edge-pinned member) maps onto the pin's FAILED variant honestly.
 */
function mapResolution(dto: PaySwapPaymentAuthorizationResolutionDto): PaymentMissionsApprovalResolution {
  switch (dto.outcome.kind) {
    case "GRANTED":
      return { outcome: "GRANTED", scope: dto.outcome.scope, expiresAt: dto.outcome.expiresAt };
    case "DECLINED":
      return { outcome: "DECLINED", reason: dto.outcome.reason };
    case "REJECTED":
      return { outcome: "FAILED", failure: "REJECTED", reason: dto.outcome.reason };
  }
}

/** True iff the thrown value is the host's typed fail-closed plane error. */
function isHostPlaneNotConfigured(thrown: unknown): boolean {
  return (
    thrown !== null &&
    typeof thrown === "object" &&
    (thrown as { readonly name?: unknown }).name === "PaymentPlaneNotConfiguredError"
  );
}

/**
 * The composed channel-backed port: the dispatch-capable,
 * reconciliation-capable AND verification-capable port (the app's three
 * composed interfaces, intersected — all structural guards pass over
 * the same object).
 */
type ChannelPaymentMissionsPort = PaymentMissionsPortWithDispatch &
  PaymentMissionsPortWithReconciliation &
  PaymentMissionsPortWithVerification;

/**
 * Adapt the channel services (the payswap-desktop proxy) to the pinned
 * PaymentMissionsPort. Every member's rejection path maps the host's
 * typed plane-not-configured error onto the app's typed class; every
 * other rejection passes through untouched (fail-closed, never masked).
 */
export function channelPaymentMissionsPort(
  services: DesktopConsoleChannelServices,
): ChannelPaymentMissionsPort {
  const client = services.payswapDesktopService as unknown as MissionPlaneApprovalChannelClient;
  const guard = async <T>(call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (thrown: unknown) {
      if (isHostPlaneNotConfigured(thrown)) {
        throw new PaymentMissionsPlaneNotConfiguredError(
          "The payment-mission plane is not configured in this host — payment-mission calls fail closed",
        );
      }
      throw thrown;
    }
  };
  return {
    board: () => guard(() => client.paymentMissionBoard()),
    detail: (missionId) => guard(() => client.paymentMissionDetail(missionId)),
    askNextField: (missionId) => guard(() => client.paymentMissionAskNextField(missionId)),
    capture: (missionId, fieldId, value) =>
      guard(() => client.paymentMissionCapture(missionId, fieldId, value)),
    presentPreview: (missionId) => guard(() => client.paymentMissionPresentPreview(missionId)),
    requestApproval: (missionId) => guard(() => client.paymentMissionRequestApproval(missionId)),
    resolveApproval: (requestId, decision) =>
      guard(async () => mapResolution(await client.paymentMissionResolveApproval(requestId, decision))),
    armedEffect: (missionId) => guard(() => client.paymentMissionArmedEffect(missionId)),
    dispatch: (missionId, connectionRef) =>
      guard(() => client.paymentMissionDispatch(missionId, connectionRef)),
    pendingReconciliation: (missionId) =>
      guard(() => client.paymentMissionPendingReconciliation(missionId)),
    reconcile: (missionId, attemptId, evidence) =>
      guard(() => client.paymentMissionReconcile(missionId, attemptId, evidence)),
    verifyAttempt: (missionId, attemptId) =>
      guard(() => client.paymentMissionVerifyAttempt(missionId, attemptId)),
  };
}

/* ------------------------------ the composition ------------------------------ */

/** The composed binding handle (the dispatch + reconciliation-capable port + the reset for the bridge-tier battery). */
export interface PaymentMissionsComposition {
  readonly port: ChannelPaymentMissionsPort;
  /** Restore the seam's honest default (unbound — the not-wired note). */
  readonly reset: () => void;
}

/**
 * Compose + bind the payment-missions port. Called ONCE at the
 * renderer's business-root initialization (after the console services
 * connect); the channel-backed port is the default, and the bridge-tier
 * battery may inject its own (the DI seam — the port is the only
 * replaced part, always labeled).
 */
export function composePaymentMissionsBinding(options: {
  readonly services?: DesktopConsoleChannelServices;
  readonly port?: ChannelPaymentMissionsPort;
}): PaymentMissionsComposition {
  const port =
    options.port ?? (options.services !== undefined ? channelPaymentMissionsPort(options.services) : null);
  if (port === null) {
    // HONEST FAILURE: no channel and no injected port — the seam stays
    // at its default (unbound) and the missions surface renders the
    // not-wired note. Nothing is masked.
    throw new Error(
      "the payment-missions composition requires the payswap-desktop channel services (or an injected port) — nothing is bound, the honest default stands",
    );
  }
  bindPaymentMissionsPort(port);
  return { port, reset: resetSharedPaymentMissionsPort };
}
