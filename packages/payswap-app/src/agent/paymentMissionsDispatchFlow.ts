/**
 * @payswap/app — the PAYMENT-MISSIONS DISPATCH-FLOW STATE MACHINE
 * (P19-B, ADR-0012 D1) — the mount-side hook that owns the armed
 * card's flow. The P18-B law keeps its shape: the MOUNT owns every
 * port call and every flow state, the panel family stays a pure
 * projection — this module carries the dispatch slice so the mount
 * file stays under the line law.
 *
 * THE FLOW: the armed card's own read (armedEffect) loads when a
 * mission detail is selected, and again when this session's approval
 * resolves GRANTED (the stale pre-approval effect is cleared first —
 * never a stale flash). The two-act send fires dispatch with EXACTLY
 * (missionId, connectionRef); every outcome re-reads the mission
 * detail (the attempt state lands on the record) and the armed truth.
 * A REFUSED outcome resolves the flow — the artifact is consumed either
 * way, so the armed truth re-reads honestly (the not-armed card + the
 * path back). Every honest failure lands on the mount's flow-error
 * line; a failed armed read leaves the section absent with the reason
 * surfaced, never an error mask.
 */

import { useCallback, useRef, useState } from "react";
import {
  type PaymentMissionsDispatchState,
  type PaymentMissionsDispatchWiring,
  type PaymentMissionsPortWithDispatch,
} from "./paymentMissionsDispatchPins.js";

function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/** The mount-facing dispatch-flow API. */
export interface PaymentMissionsDispatchFlow {
  /** The wiring for the panel/detail/armed card (null when the bound port lacks the dispatch members). */
  readonly wiring: PaymentMissionsDispatchWiring | null;
  /** The armed card's own read — called when a mission detail is selected. */
  readonly loadArmedEffect: (missionId: string) => void;
  /** Called when this session's approval resolves GRANTED (the mission arms). */
  readonly onApprovalGranted: (missionId: string) => void;
}

/**
 * The dispatch-flow state machine. `onFlowError` is the mount's honest
 * flow-error line (null clears it); `refreshDetail` re-reads the open
 * mission so the attempt states land on the detail after an outcome.
 */
export function usePaymentMissionsDispatchFlow(
  dispatchPort: PaymentMissionsPortWithDispatch | undefined,
  onFlowError: (message: string | null) => void,
  refreshDetail: (missionId: string) => void,
): PaymentMissionsDispatchFlow {
  const [state, setState] = useState<PaymentMissionsDispatchState>({ phase: "IDLE" });
  // The mission whose armed effect is live — a late response for a
  // closed mission is dropped, never merged into the open one.
  const armedMission = useRef<string | null>(null);

  const loadArmedEffect = useCallback(
    (missionId: string): void => {
      if (dispatchPort === undefined) {
        return;
      }
      armedMission.current = missionId;
      void dispatchPort
        .armedEffect(missionId)
        .then((effect) => {
          if (armedMission.current === missionId) {
            setState((current) => ({ ...current, effect }));
          }
        })
        .catch((thrown: unknown) => {
          onFlowError(`the armed state could not be read: ${messageOf(thrown)}`);
        });
    },
    [dispatchPort, onFlowError],
  );

  const onApprovalGranted = useCallback(
    (missionId: string): void => {
      // Clear the stale pre-approval effect first — the fresh armed truth
      // renders when the read returns (never a stale not-armed flash).
      setState({ phase: "IDLE" });
      loadArmedEffect(missionId);
    },
    [loadArmedEffect],
  );

  const onEngage = useCallback(
    (missionId: string): void => {
      setState((current) => (current.phase === "IDLE" ? { ...current, phase: "ARMED_CARD" } : current));
      loadArmedEffect(missionId);
    },
    [loadArmedEffect],
  );

  const onChooseLane = useCallback((connectionRef: string): void => {
    setState((current) => ({ ...current, phase: "LANE_CHOSEN", connectionRef }));
  }, []);

  const onSend = useCallback(
    (missionId: string, connectionRef: string): void => {
      if (dispatchPort === undefined) {
        return;
      }
      onFlowError(null);
      setState((current) => ({ ...current, phase: "DISPATCHING", connectionRef }));
      void dispatchPort
        .dispatch(missionId, connectionRef)
        .then((outcome) => {
          setState((current) => ({
            ...current,
            // A refused or sent outcome RESOLVES the flow — the artifact is
            // consumed either way, so the armed truth re-reads honestly.
            phase: "RESOLVED",
            outcome,
          }));
          // The attempt state lands on the mission record and the armed
          // truth changes — re-read both honestly.
          refreshDetail(missionId);
          loadArmedEffect(missionId);
        })
        .catch((thrown: unknown) => {
          // A THROWN typed failure (a lane outside the host's act-time
          // recomputed set — no attempt recorded, the artifact not
          // consumed): back to the chosen lane — the choice survives, the
          // failure surfaces honestly and a re-choice is possible.
          setState((current) =>
            current.phase === "DISPATCHING" ? { ...current, phase: "LANE_CHOSEN" } : current,
          );
          onFlowError(messageOf(thrown));
        });
    },
    [dispatchPort, onFlowError, refreshDetail, loadArmedEffect],
  );

  const wiring: PaymentMissionsDispatchWiring | null =
    dispatchPort === undefined ? null : { state, onEngage, onChooseLane, onSend };

  return { wiring, loadArmedEffect, onApprovalGranted };
}
