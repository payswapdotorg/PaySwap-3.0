/**
 * PaySwap Desktop (P21-A, ADR-0014 D8) — the LANE-AWARE EXECUTION
 * AUTHORITY composition: the REAL Stripe kernel composes ONLY behind an
 * ACTIVE SANDBOX Stripe connection (the dispatch-lane resolver's own
 * eligibility law), over that connection's SEALED credential, through
 * the REAL host-side HTTPS transport; otherwise the UNWIRED authority's
 * honest NO_AUTHORITY_WIRED remains the answer.
 *
 * THE SEAM LAW (the frozen-runtime law): the dispatch runtime files
 * (payment-dispatch-runtime.ts, authorization-gate.ts,
 * mission-execution.ts, idempotency.ts) are UNTOUCHED — this module is
 * the composition edge that swaps ONE constructor argument
 * (executionAuthority) at composePaymentMissionRuntime. The dispatch
 * path then follows the existing P19/P20 attempt-state +
 * reconciliation laws byte-identically.
 *
 * THE LANE LAW (D8 + ADR-0012 D2): a lane is eligible exactly when the
 * connection record is ACTIVE and its execution mode is SANDBOX; this
 * composition additionally requires providerId === "stripe" — the only
 * provider with a consequential operation surface in this deployment
 * (F3/C9: Flutterwave + Paystack are read-only by construction; no FLW
 * send operation exists, so no authority can ever wire an FLW lane).
 * The sk_test_ full-key GRANT check happens INSIDE the credential seal
 * on every dispatch (the kernel's own law — the single enforcement
 * point); a RESTRICTED key that reached ACTIVE is delegated to the
 * kernel and refused there with the typed COMMAND_REJECTED reason.
 *
 * LIVE never binds: a LIVE-mode connection is never an eligible lane
 * here (INV-25 — the unwired refusal answers, honestly).
 */

import type { ExecutionAuthorityPort } from "./execution-authority.js";
import { PaymentMissionError } from "./contracts.js";
import { createStripeExecutionKernel } from "./execution-kernel.js";
import type { StripeReadBackPort } from "./stripe-read-back.js";
import { createStripeReadBack } from "./stripe-read-back.js";
import { createStripeHostTransport, type HostFetch } from "../connections/host-https-transports.js";

/**
 * The connection seam the lane resolution reads: the registry's own
 * status views (a structural subset — the REAL
 * ConnectionSessionAuthority is assignable).
 */
export interface LaneAwareConnectionSeam {
  connectionStatuses(): Promise<
    ReadonlyArray<{
      readonly connectionId: string;
      readonly providerId: string;
      readonly state: string;
      readonly executionMode: string;
    }>
  >;
  withSealedCredential<T>(
    connectionId: string,
    consumer: (material: unknown) => T,
    context: string,
  ): Promise<Awaited<T>>;
}

/** The pinned lane-not-wired reason (surfaced verbatim on the refusal). */
export const LANE_NOT_WIRED_REASON_PREFIX =
  "No execution authority is wired for this dispatch lane in this deployment — the REAL Stripe kernel composes only behind an ACTIVE SANDBOX Stripe connection (the sk_test_ full-key grant is checked inside the credential seal on every dispatch)";

/** Options (all seams injected; no ambient fetch, no ambient clock). */
export interface LaneAwareStripeExecutionAuthorityOptions {
  readonly connectionAuthority: LaneAwareConnectionSeam;
  /** The REAL fetch binding the kernel transport rides (the composition edge binds globalThis.fetch; tests inject fakes). */
  readonly fetchImpl: HostFetch;
  readonly nowMs?: () => number;
  /** The published Stripe TEST payment-method token (public vocabulary; default pm_card_visa). */
  readonly testPaymentMethod?: string;
  /** The host seam log (never console; no secret material is ever logged). */
  readonly log?: (level: "info" | "warn" | "error", message: string) => void;
}

/** Explain WHY a lane is not wired (the honest, lane-specific reason). */
function laneNotWiredReason(lane: { providerId: string; state: string; executionMode: string } | undefined): string {
  if (lane === undefined) {
    return `${LANE_NOT_WIRED_REASON_PREFIX}. The chosen connection does not exist in this deployment's registry.`;
  }
  if (lane.state !== "ACTIVE") {
    return `${LANE_NOT_WIRED_REASON_PREFIX}. The chosen ${lane.providerId} connection is not ACTIVE (${lane.state}) — only a connection whose read-only verification probe confirmed it ACTIVE can execute a payment.`;
  }
  if (lane.executionMode !== "SANDBOX") {
    return `${LANE_NOT_WIRED_REASON_PREFIX}. The chosen ${lane.providerId} connection runs in ${lane.executionMode} mode — live execution requires the live-grant derivation this deployment does not perform (INV-25: SANDBOX only).`;
  }
  return `${LANE_NOT_WIRED_REASON_PREFIX}. The chosen ${lane.providerId} connection is ACTIVE SANDBOX but carries no consequential operation surface in this deployment — Flutterwave and Paystack are read-only by construction (no send or transfer operation exists for them; F3/C9).`;
}

/**
 * Compose the lane-aware execution authority (P21-A, ADR-0014 D8). The
 * REAL kernel is composed ONCE over the connection seam + the REAL
 * Stripe host transport; every dispatch re-resolves the lane from the
 * registry's own read model (a connection that becomes ACTIVE after
 * composition dispatches without a process restart; a revoked one
 * stops dispatching).
 */
export function createLaneAwareStripeExecutionAuthority(
  options: LaneAwareStripeExecutionAuthorityOptions,
): ExecutionAuthorityPort {
  // The REAL kernel behind the port (the p14/a1 script precedent,
  // composed here for the product): the SAME injected fetch binding the
  // verification probes ride, the SAME connection seam.
  const kernel = createStripeExecutionKernel({
    connectionAuthority: options.connectionAuthority,
    transport: createStripeHostTransport(options.fetchImpl),
    ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
    ...(options.testPaymentMethod !== undefined
      ? { testPaymentMethod: options.testPaymentMethod }
      : {}),
  });
  const log = options.log;
  return {
    async dispatch(command) {
      const statuses = await options.connectionAuthority.connectionStatuses();
      const lane = statuses.find((status) => status.connectionId === command.connectionRef);
      const eligible =
        lane !== undefined &&
        lane.providerId === "stripe" &&
        lane.state === "ACTIVE" &&
        lane.executionMode === "SANDBOX";
      if (!eligible) {
        const reason = laneNotWiredReason(lane);
        if (log !== undefined) {
          log(
            "info",
            `payswap-desktop: dispatch refused NO_AUTHORITY_WIRED (lane ${command.connectionRef} not eligible) — the REAL kernel composes only behind an ACTIVE SANDBOX Stripe connection`,
          );
        }
        return {
          kind: "REFUSED" as const,
          refusal: { kind: "NO_AUTHORITY_WIRED" as const, reason },
        };
      }
      // The eligible lane: the REAL kernel answers (its own admission
      // re-checks the ACTIVE + mode facts, and the sk_test_ full-key
      // grant is enforced INSIDE the seal on every dispatch).
      return kernel.dispatch(command);
    },
  };
}

/**
 * (P21-D reviewer-gate, Gap C) Compose the LANE-AWARE STRIPE READ-BACK
 * port: the SAME lane law as the dispatch authority above — every read
 * re-resolves the connection from the registry's own read model, and a
 * lane is eligible exactly when providerId === "stripe" AND state ===
 * "ACTIVE" AND executionMode === "SANDBOX". A read-back is NEVER
 * fabricated over an ineligible lane: the not-eligible case throws the
 * typed PaymentMissionError carrying the lane-not-wired reason (the
 * dispatch authority returns its refusal as an answer because the
 * dispatch envelope has a refusal channel; the read-back port's result
 * union carries only the three-valued outcome, so the honest mapping for
 * an ineligible lane is the typed throw — the channel member propagates
 * it, never masking it).
 */
export function createLaneAwareStripeReadBack(
  options: LaneAwareStripeExecutionAuthorityOptions,
): StripeReadBackPort {
  const readBack = createStripeReadBack({
    connectionAuthority: options.connectionAuthority,
    transport: createStripeHostTransport(options.fetchImpl),
    ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
  });
  return {
    async readBack(input) {
      const statuses = await options.connectionAuthority.connectionStatuses();
      const lane = statuses.find((status) => status.connectionId === input.connectionRef);
      const eligible =
        lane !== undefined &&
        lane.providerId === "stripe" &&
        lane.state === "ACTIVE" &&
        lane.executionMode === "SANDBOX";
      if (!eligible) {
        throw new PaymentMissionError(
          "VERIFICATION_REFUSED",
          `${laneNotWiredReason(lane)} — an authoritative read-back is never fabricated over an ineligible lane`,
        );
      }
      return readBack.readBack(input);
    },
  };
}
