/**
 * @payswap/app — the PAYMENT-MISSIONS VERIFY-FLOW STATE MACHINE (the
 * P21-D reviewer-gate, Gap C) — the mount-side hook that owns the verify
 * card's flow. The dispatch/reconcile law keeps its shape: the MOUNT
 * owns every port call and every flow state, the panel family stays a
 * pure projection — this module carries the single-act slice so the
 * mount file keeps the line law.
 *
 * THE FLOW (single-act: IDLE → VERIFYING → VERIFIED): the verify
 * control fires ONLY from a CONFIRMED-unverified attempt (the card's
 * own gate — the detail's latest attempt state) and calls
 * verifyAttempt with EXACTLY (missionId, attemptId) — the host does
 * the authoritative retrieval inside the credential seal. A THROWN
 * typed failure (the reviewer's law for an ambiguous attempt among
 * them) returns the flow to IDLE and surfaces the honest error prose
 * on the mount's flow-error line — never masked, never a fabricated
 * outcome; a corrected re-act is possible. Every outcome re-reads the
 * mission detail (the typed verification fact lands on the attempt
 * record, so the card's own gate withdraws it — the honest post-state).
 * THE CALL-ORDER LAW: an act from any phase but IDLE or VERIFIED never
 * fires; a mission switch resets the flow (a prior mission's outcome
 * never bleeds into the opened one).
 */

import { useCallback, useRef, useState } from "react";
import type {
  PaymentMissionsPortWithVerification,
  PaymentMissionsVerifyState,
  PaymentMissionsVerifyWiring,
} from "./paymentMissionsVerifyPins.js";

function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/** The mount-facing verify-flow API. */
export interface PaymentMissionsVerifyFlow {
  /** The wiring for the panel/detail/verify card (null when the bound port lacks the verify member — the card does not render). */
  readonly wiring: PaymentMissionsVerifyWiring | null;
  /** Resets the flow when a different mission's detail opens (a prior mission's outcome never bleeds into the opened one). */
  readonly resetForMission: (missionId: string) => void;
}

/**
 * The single-act verify-flow state machine. `onFlowError` is the mount's
 * honest flow-error line (null clears it); `refreshDetail` re-reads the
 * open mission so the typed verification fact lands on the detail after
 * an outcome.
 */
export function usePaymentMissionsVerifyFlow(
  verifyPort: PaymentMissionsPortWithVerification | undefined,
  onFlowError: (message: string | null) => void,
  refreshDetail: (missionId: string) => void,
): PaymentMissionsVerifyFlow {
  const [state, setState] = useState<PaymentMissionsVerifyState>({ phase: "IDLE" });
  const stateRef = useRef<PaymentMissionsVerifyState>({ phase: "IDLE" });
  // The mission whose verify flow is live — a late response for a closed
  // mission is dropped, and a mission switch resets the flow.
  const verifyMission = useRef<string | null>(null);

  const transition = useCallback(
    (update: (current: PaymentMissionsVerifyState) => PaymentMissionsVerifyState): void => {
      const next = update(stateRef.current);
      stateRef.current = next;
      setState(next);
    },
    [],
  );

  /** Reset the flow when a different mission's detail opens (a prior outcome never bleeds). */
  const resetForMission = useCallback(
    (missionId: string): void => {
      if (verifyMission.current !== missionId) {
        verifyMission.current = missionId;
        transition(() => ({ phase: "IDLE" }));
      }
    },
    [transition],
  );

  /** The one explicit act: fires verifyAttempt with EXACTLY (missionId, attemptId). */
  const onVerify = useCallback(
    (missionId: string, attemptId: string): void => {
      if (verifyPort === undefined) {
        return;
      }
      // THE CALL-ORDER LAW: the act fires only from the idle-or-verified
      // posture — a re-act while one is in flight never fires.
      if (stateRef.current.phase === "VERIFYING") {
        return;
      }
      onFlowError(null);
      transition((current) => ({ ...current, phase: "VERIFYING", attemptId, outcome: undefined }));
      void verifyPort
        .verifyAttempt(missionId, attemptId)
        .then((outcome) => {
          if (verifyMission.current !== missionId) {
            return;
          }
          transition((current) => ({ ...current, phase: "VERIFIED", outcome }));
          // The typed verification fact lands on the mission record —
          // re-read the detail honestly (the card's gate withdraws it).
          refreshDetail(missionId);
        })
        .catch((thrown: unknown) => {
          if (verifyMission.current !== missionId) {
            return;
          }
          // A THROWN typed failure (the reviewer's law among them): back
          // to IDLE — the honest error prose lands on the mount's
          // flow-error line and a corrected re-act is possible.
          transition((current) => ({ ...current, phase: "IDLE" }));
          onFlowError(messageOf(thrown));
        });
    },
    [verifyPort, onFlowError, refreshDetail, transition],
  );

  const wiring: PaymentMissionsVerifyWiring | null =
    verifyPort === undefined
      ? null
      : {
          state,
          onVerify,
        };

  return { wiring, resetForMission };
}
