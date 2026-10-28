/**
 * PaySwap Desktop (P21-D reviewer-gate, Gap C) — the VERIFICATION channel
 * member, implemented over the REAL PaymentMissionRuntime's verify
 * operation, following the dispatch/reconcile member patterns (the
 * ≤400-line file law; the contracts live in ./verify-contracts.ts).
 *
 * THE SINGLE-ACT LAW: unlike the reconcile act (a two-act evidence
 * entry), the verify act is ONE explicit act — the operator presses
 * "verify" and the HOST does the retrieval inside the credential seal.
 * No evidence transcription exists here because no ambiguity ever
 * existed: the attempt is CONFIRMED (the authority's own answer) and
 * the read-back is the provider's authoritative record. The renderer
 * supplies ONLY (missionId, attemptId).
 *
 * THE READ-BACK PORT IS SUPPLIED BY THE HOST at the service composition
 * edge (the lane-aware Stripe read-back over the same connection +
 * probe planes the dispatch authority rides); the member injects it
 * into the runtime's verify call — the runtime stays seam-pure (the
 * port is a parameter, never a constructor captive).
 *
 * THE RUNTIME VERB IS THE ONLY WRITER: the member validates the
 * channel-supplied shapes at the edge (fail-closed typed, BEFORE any
 * runtime call) and delegates to runtime.dispatch.verify(); the
 * runtime's typed refusals — including the reviewer's law for an
 * ambiguous attempt — rethrow through unchanged (no mapping, no
 * masking). The outcome carries facts only. Instants are stamped HERE,
 * at the channel edge, from the injected host clock.
 */

import { PaymentMissionError } from "../payments/contracts.js";
import type { PaymentAttemptVerificationOutcome } from "../payments/payment-dispatch-runtime.js";
import type { StripeReadBackPort } from "../payments/stripe-read-back.js";
import type { PaymentMissionChannelDeps } from "./payment-mission-members.js";
import type {
  IPaySwapDesktopPaymentMissionMembers,
  PaymentMissionVerificationOutcomeDto,
} from "./payment-mission-contracts.js";
import { PaymentPlaneNotConfiguredError } from "./plane-errors.js";

/**
 * The channel-edge id maxima (the reconcile-members precedent): a
 * channel-supplied id beyond them is a typed refusal, never a store
 * lookup.
 */
const MISSION_ID_MAX = 128;
const ATTEMPT_ID_MAX = 128;

/** What the verify member needs from the service (injected — never ambient). */
export interface PaymentVerifyChannelDeps extends PaymentMissionChannelDeps {
  /**
   * The composed authoritative read-back port (the lane-aware Stripe
   * read-back, composed at the service edge when the connection +
   * probe planes are present). Required by the composed member; the
   * ABSENT-planes posture below is what the service spreads instead.
   */
  readonly readBackPort: StripeReadBackPort;
}

/** Fail-closed on the channel-supplied mission id (the reconcile-members precedent). */
function requireMissionIdShape(missionId: string): void {
  if (typeof missionId !== "string" || missionId.length === 0 || missionId.length > MISSION_ID_MAX) {
    throw new PaymentMissionError(
      "MISSION_NOT_FOUND",
      `missionId must be a non-empty string of at most ${String(MISSION_ID_MAX)} characters (the mission the verification act runs over)`,
    );
  }
}

/** Project the runtime outcome to the wire DTO (facts only — no connectionRef echo, no provider internals beyond the status). */
function toOutcomeDto(outcome: PaymentAttemptVerificationOutcome): PaymentMissionVerificationOutcomeDto {
  return {
    attemptId: outcome.attemptId,
    verified: true,
    readBackStatus: outcome.readBackStatus,
    verifiedAt: outcome.verifiedAt,
    summary: outcome.summary,
  };
}

/**
 * The ABSENT-planes posture (the service wiring spreads this when the
 * connection or probe plane was not composed — the absent probe-members
 * precedent): the member is REAL or absent — it fails closed with the
 * typed PaymentPlaneNotConfiguredError on first use, after the runtime
 * resolver's own fail-closed check, never a fabricated verification
 * masking a missing plane.
 */
export function createAbsentPaymentVerifyChannelMembers(
  resolveRuntime: PaymentMissionChannelDeps["resolveRuntime"],
): Pick<IPaySwapDesktopPaymentMissionMembers, "paymentMissionVerifyAttempt"> {
  return {
    async paymentMissionVerifyAttempt() {
      // The runtime resolver first: an absent payment-mission plane is
      // the payment-plane error; a present runtime with absent
      // connection/probe planes leaves the read-back uncomposed — the
      // verification plane is honestly not configured either way.
      resolveRuntime();
      throw new PaymentPlaneNotConfiguredError();
    },
  };
}

/**
 * Create the verification channel member over the injected runtime +
 * composed read-back port (the P21-D reviewer-gate, Gap C). Returned as
 * a Pick of the mission-member interface so the service can spread it
 * beside the P17-A/P18-A/P19-A/P20-A families over the SAME fail-closed
 * resolver and host clock.
 */
export function createPaymentVerifyChannelMembers(
  deps: PaymentVerifyChannelDeps,
): Pick<IPaySwapDesktopPaymentMissionMembers, "paymentMissionVerifyAttempt"> {
  return {
    async paymentMissionVerifyAttempt(missionId, attemptId) {
      const runtime = deps.resolveRuntime();
      // (1) THE EDGE VALIDATION — all of it BEFORE any runtime call (the
      // P19-A/P20-A law): shape first, so a malformed submission can
      // never reach the store, the pure decision or the read-back.
      requireMissionIdShape(missionId);
      if (typeof attemptId !== "string" || attemptId.length === 0 || attemptId.length > ATTEMPT_ID_MAX) {
        throw new PaymentMissionError(
          "INVALID_FIELD_VALUE",
          `attemptId must be a non-empty string of at most ${String(ATTEMPT_ID_MAX)} characters (the confirmed attempt the verification act runs over)`,
          { missionId },
        );
      }
      // (2) Mission existence (the member convention: an unknown mission
      // is the typed MISSION_NOT_FOUND refusal).
      if ((await runtime.getMission(missionId)) === null) {
        throw new PaymentMissionError("MISSION_NOT_FOUND", `No payment mission '${missionId}' exists`, {
          missionId,
        });
      }
      // (3) THE ACT — the runtime's verify verb with the composed
      // read-back port + the host-clock instant. Its typed refusals
      // (the reviewer's law among them) rethrow through unchanged.
      const outcome = await runtime.dispatch.verify(missionId, attemptId, deps.readBackPort, deps.now());
      deps.log(
        "info",
        `payswap-desktop: attempt ${attemptId} verified by the authoritative read-back on mission ${missionId} — the host performed the retrieval inside the seal; outcome facts only on the wire`,
      );
      return toOutcomeDto(outcome);
    },
  };
}
