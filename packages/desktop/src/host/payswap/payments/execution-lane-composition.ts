/**
 * PaySwap Desktop (P21-A, ADR-0014 D8; GENERALIZED by P22-H, ADR-0016
 * D8) — the LANE-AWARE EXECUTION AUTHORITY composition: the per-provider
 * KERNEL TABLE. The REAL kernels (Stripe: the payment-intent surface;
 * Paystack: the transfer payout lane; Stellar: the onchain rail's
 * SANDBOX lane) compose ONLY behind their ACTIVE SANDBOX connections,
 * over those connections' SEALED credentials, through the REAL
 * host-side HTTPS transports; otherwise the UNWIRED authority's honest
 * NO_AUTHORITY_WIRED remains the answer.
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
 * connection record is ACTIVE, its execution mode is SANDBOX, and its
 * provider carries a kernel in THIS deployment's table — stripe, the
 * Paystack payout lane (ADR-0016 D8: the amendment this wave IS), and
 * the stellar:testnet onchain rail (ADR-0016 D2/D9). FLUTTERWAVE STAYS
 * READ-ONLY byte-identically (F3 — its transfers terminate at
 * bank/MOMO; that finding is not amended by this wave; no FLW kernel
 * exists, so no authority can ever wire an FLW lane). The grant checks
 * happen INSIDE the credential seal on every dispatch (each kernel's
 * own law — the single enforcement point).
 *
 * LIVE never binds: a LIVE-mode connection is never an eligible lane
 * here (INV-25 — the unwired refusal answers, honestly).
 */

import type { ExecutionAuthorityPort } from "./execution-authority.js";
import { PaymentMissionError } from "./contracts.js";
import { createStripeExecutionKernel } from "./execution-kernel.js";
import { createPaystackExecutionKernel } from "./paystack-execution-kernel.js";
import { createStellarExecutionKernel } from "./stellar-execution-kernel.js";
import type { StripeReadBackPort } from "./stripe-read-back.js";
import { createStripeReadBack } from "./stripe-read-back.js";
import {
  createPaystackHostTransport,
  createStellarHorizonHostTransport,
  createStripeHostTransport,
  type HostFetch,
} from "../connections/host-https-transports.js";
import { PINNED_STELLAR_CHAIN_KEY } from "../connections/onchain-rail-pins.js";

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

/**
 * THE PER-PROVIDER KERNEL TABLE (ADR-0016 D8: the lane composition's
 * Stripe hardcode becomes this table). The keys are the provider ids a
 * REAL kernel exists for; the stellar:testnet key is the onchain rail's
 * chain key (the rail connection's providerId — never a PSP id).
 */
export function kernelTableOf(
  options: LaneAwareExecutionAuthorityOptions,
): ReadonlyMap<string, ExecutionAuthorityPort> {
  return new Map<string, ExecutionAuthorityPort>([
    [
      "stripe",
      createStripeExecutionKernel({
        connectionAuthority: options.connectionAuthority,
        transport: createStripeHostTransport(options.fetchImpl),
        ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
        ...(options.testPaymentMethod !== undefined
          ? { testPaymentMethod: options.testPaymentMethod }
          : {}),
      }),
    ],
    [
      "paystack",
      createPaystackExecutionKernel({
        connectionAuthority: options.connectionAuthority,
        transport: createPaystackHostTransport(options.fetchImpl),
        ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
      }),
    ],
    [
      PINNED_STELLAR_CHAIN_KEY,
      createStellarExecutionKernel({
        connectionAuthority: options.connectionAuthority,
        transport: createStellarHorizonHostTransport(options.fetchImpl),
        ...(options.nowMs !== undefined ? { nowMs: options.nowMs } : {}),
      }),
    ],
  ]);
}

/** The pinned lane-not-wired reason (surfaced verbatim on the refusal). */
export const LANE_NOT_WIRED_REASON_PREFIX =
  "No execution authority is wired for this dispatch lane in this deployment — the REAL per-provider kernels (the Stripe payment-intent kernel, the Paystack transfer payout kernel, the Stellar onchain rail kernel) compose only behind their own ACTIVE SANDBOX connections, with each grant checked inside the credential seal on every dispatch";

/** Options (all seams injected; no ambient fetch, no ambient clock). */
export interface LaneAwareExecutionAuthorityOptions {
  readonly connectionAuthority: LaneAwareConnectionSeam;
  /** The REAL fetch binding the kernel transports ride (the composition edge binds globalThis.fetch; tests inject fakes). */
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
    return `${LANE_NOT_WIRED_REASON_PREFIX}. The chosen ${lane.providerId} connection is not ACTIVE (${lane.state}) — only a connection whose read-only verification probe confirmed it ACTIVE can execute.`;
  }
  if (lane.executionMode !== "SANDBOX") {
    return `${LANE_NOT_WIRED_REASON_PREFIX}. The chosen ${lane.providerId} connection runs in ${lane.executionMode} mode — live execution requires the live-grant derivation this deployment does not perform (INV-25: SANDBOX only).`;
  }
  return `${LANE_NOT_WIRED_REASON_PREFIX}. The chosen ${lane.providerId} connection is ACTIVE SANDBOX but carries no consequential operation surface in this deployment — Flutterwave is read-only by construction (its transfers terminate at bank/MOMO; F3), so no FLW kernel exists (the Paystack payout lane and the stellar:testnet onchain rail are the P22-H growths, ADR-0016 D8/D2).`;
}

/**
 * Compose the lane-aware execution authority (P21-A, ADR-0014 D8; the
 * P22-H kernel table). The REAL kernels are composed ONCE over the
 * connection seam + their REAL host transports; every dispatch
 * re-resolves the lane from the registry's own read model (a connection
 * that becomes ACTIVE after composition dispatches without a process
 * restart; a revoked one stops dispatching).
 */
export function createLaneAwareExecutionAuthority(
  options: LaneAwareExecutionAuthorityOptions,
): ExecutionAuthorityPort {
  const table = kernelTableOf(options);
  const log = options.log;
  return {
    async dispatch(command) {
      const statuses = await options.connectionAuthority.connectionStatuses();
      const lane = statuses.find((status) => status.connectionId === command.connectionRef);
      const kernel = lane === undefined ? undefined : table.get(lane.providerId);
      const eligible =
        lane !== undefined &&
        lane.state === "ACTIVE" &&
        lane.executionMode === "SANDBOX" &&
        kernel !== undefined;
      if (!eligible || kernel === undefined) {
        const reason = laneNotWiredReason(lane);
        if (log !== undefined) {
          log(
            "info",
            `payswap-desktop: dispatch refused NO_AUTHORITY_WIRED (lane ${command.connectionRef} not eligible) — the REAL per-provider kernels compose only behind their own ACTIVE SANDBOX connections`,
          );
        }
        return {
          kind: "REFUSED" as const,
          refusal: { kind: "NO_AUTHORITY_WIRED" as const, reason },
        };
      }
      // The eligible lane: the REAL kernel answers (its own admission
      // re-checks the ACTIVE + mode facts, and the grant is enforced
      // INSIDE the seal on every dispatch).
      return kernel.dispatch(command);
    },
  };
}

/**
 * (P21-D reviewer-gate, Gap C) Compose the LANE-AWARE STRIPE READ-BACK
 * port (the generic verify path's port — Stripe-shaped by the frozen
 * verify() law): the SAME lane law as the dispatch authority above —
 * every read re-resolves the connection from the registry's own read
 * model, and a lane is eligible exactly when providerId === "stripe"
 * AND state === "ACTIVE" AND executionMode === "SANDBOX". A read-back
 * is NEVER fabricated over an ineligible lane: the not-eligible case
 * throws the typed PaymentMissionError carrying the lane-not-wired
 * reason (the dispatch authority returns its refusal as an answer
 * because the dispatch envelope has a refusal channel; the read-back
 * port's result union carries only the three-valued outcome, so the
 * honest mapping for an ineligible lane is the typed throw — the
 * channel member propagates it, never masking it).
 *
 * (P22-H: the Paystack/Stellar read-backs are their OWN ports —
 * paystack-read-back.ts / stellar-read-back.ts — composed lane-aware
 * by the corridor surfaces; the frozen verify() path stays
 * Stripe-shaped byte-identically.)
 */
export function createLaneAwareStripeReadBack(
  options: LaneAwareExecutionAuthorityOptions,
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
