/**
 * @payswap/app — the PAYMENT-MISSIONS RECONCILE-FLOW STATE MACHINE
 * (P20-B, ADR-0013 D1) — the mount-side hook that owns the reconcile
 * card's flow. The P18-B/P19-B law keeps its shape: the MOUNT owns
 * every port call and every flow state, the panel family stays a pure
 * projection — this module carries the reconciliation slice so the
 * mount file keeps the line law.
 *
 * THE FLOW: the pending card's own read (pendingReconciliation) loads
 * when a mission detail is selected — the read landing moves the flow
 * IDLE → PENDING_CARD (the pending card renders; the empty card IS the
 * designed state when nothing is pending). The engage (act one, with a
 * fresh read — the armed-card pattern) opens the evidence entry; the
 * confirm (act two) computes the evidence from the entry state — the
 * refs split into trimmed non-empty lines, never a guess — and fires
 * reconcile with EXACTLY (missionId, attemptId, evidence). A THROWN
 * typed failure (the host's act-time recomputed-set refusal, or the
 * runtime's own) returns the flow to the entry with every entered fact
 * intact; every outcome re-reads the mission detail (the reconciliation
 * facts land on the record) and the pending card. THE CALL-ORDER LAW is
 * enforced here too: a submit from any phase but the evidence entry
 * never fires.
 */

import { useCallback, useRef, useState } from "react";
import {
  type PaymentMissionsReconcileEvidence,
  type PaymentMissionsReconcileState,
  type PaymentMissionsReconcileWiring,
  type PaymentMissionsPortWithReconciliation,
  reconcileRefsOf,
} from "./paymentMissionsReconcilePins.js";

function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/** The mount-facing reconcile-flow API. */
export interface PaymentMissionsReconcileFlow {
  /** The wiring for the panel/detail/reconcile card (null when the bound port lacks the reconciliation members). */
  readonly wiring: PaymentMissionsReconcileWiring | null;
  /** The pending card's own read — called when a mission detail is selected. */
  readonly loadPendingReconciliation: (missionId: string) => void;
}

/**
 * The reconcile-flow state machine. `onFlowError` is the mount's honest
 * flow-error line (null clears it); `refreshDetail` re-reads the open
 * mission so the reconciliation facts land on the detail after an
 * outcome.
 */
export function usePaymentMissionsReconcileFlow(
  reconcilePort: PaymentMissionsPortWithReconciliation | undefined,
  onFlowError: (message: string | null) => void,
  refreshDetail: (missionId: string) => void,
): PaymentMissionsReconcileFlow {
  // The state + its synchronous mirror: the call-order guard and the
  // submit's input computation read the CURRENT entry state, so the ref
  // is the source of truth and the useState renders it (the mount-owned
  // single-threaded flow makes this deterministic).
  const [state, setState] = useState<PaymentMissionsReconcileState>({ phase: "IDLE" });
  const stateRef = useRef<PaymentMissionsReconcileState>({ phase: "IDLE" });
  // The mission whose pending card is live — a late response for a
  // closed mission is dropped, and a mission switch resets the flow (a
  // prior mission's entry or outcome never bleeds into the opened one).
  const reconcileMission = useRef<string | null>(null);

  const transition = useCallback(
    (update: (current: PaymentMissionsReconcileState) => PaymentMissionsReconcileState): void => {
      const next = update(stateRef.current);
      stateRef.current = next;
      setState(next);
    },
    [],
  );

  const loadPendingReconciliation = useCallback(
    (missionId: string): void => {
      if (reconcilePort === undefined) {
        return;
      }
      if (reconcileMission.current !== missionId) {
        reconcileMission.current = missionId;
        transition(() => ({ phase: "IDLE" }));
      }
      void reconcilePort
        .pendingReconciliation(missionId)
        .then((pending) => {
          if (reconcileMission.current === missionId) {
            // The read landing moves IDLE → PENDING_CARD; every later
            // re-read only refreshes the data — a RESOLVED outcome note
            // is never clobbered by its own re-read.
            transition((current) =>
              current.phase === "IDLE"
                ? { ...current, phase: "PENDING_CARD", pending }
                : { ...current, pending },
            );
          }
        })
        .catch((thrown: unknown) => {
          onFlowError(`the pending reconciliation could not be read: ${messageOf(thrown)}`);
        });
    },
    [reconcilePort, onFlowError, transition],
  );

  /** Act one: the engage opens the evidence entry over the pending card. */
  const onEngage = useCallback(
    (missionId: string): void => {
      transition((current) => {
        if (current.phase !== "PENDING_CARD" && current.phase !== "RESOLVED") {
          return current;
        }
        // The addressed attempt is the unambiguous single pending
        // attempt; a read listing several leaves the choice to the
        // operator (the entry's confirm stays locked until they choose).
        const single =
          current.pending?.pending.length === 1 ? current.pending.pending[0]?.attemptId : undefined;
        // A fresh act begins — a prior outcome note does not carry into it.
        return { ...current, phase: "EVIDENCE_ENTRY", attemptId: current.attemptId ?? single, outcome: undefined };
      });
      // A fresh read at the engage (the armed-card pattern): the pending
      // facts the operator is about to transcribe over are current.
      loadPendingReconciliation(missionId);
    },
    [transition, loadPendingReconciliation],
  );

  const onChooseAttempt = useCallback(
    (attemptId: string): void => {
      transition((current) => ({ ...current, attemptId }));
    },
    [transition],
  );

  const onChooseDirection = useCallback(
    (direction: PaymentMissionsReconcileState["direction"]): void => {
      transition((current) => ({ ...current, direction }));
    },
    [transition],
  );

  const onChooseSource = useCallback(
    (source: PaymentMissionsReconcileState["source"]): void => {
      transition((current) => ({ ...current, source }));
    },
    [transition],
  );

  const onEditRefs = useCallback(
    (text: string): void => {
      transition((current) => ({ ...current, refsText: text }));
    },
    [transition],
  );

  /**
   * Act two: the confirm. The input is computed from the entry state and
   * fired with EXACTLY (missionId, attemptId, evidence) — never a guess:
   * an unchosen attempt/direction/source or an empty reference floor
   * refuses here (the card's confirm stays disabled besides).
   */
  const onSubmit = useCallback(
    (missionId: string): void => {
      if (reconcilePort === undefined) {
        return;
      }
      // THE CALL-ORDER LAW (the two-act proof): the act fires ONLY from
      // the evidence entry — a submit attempted from any other phase
      // never fires.
      const entry = stateRef.current;
      if (entry.phase !== "EVIDENCE_ENTRY") {
        return;
      }
      if (
        entry.attemptId === undefined ||
        entry.direction === undefined ||
        entry.source === undefined
      ) {
        return;
      }
      const evidenceRefs = reconcileRefsOf(entry.refsText);
      if (evidenceRefs.length === 0) {
        return;
      }
      const attemptId = entry.attemptId;
      const evidence: PaymentMissionsReconcileEvidence = {
        resolvedTo: entry.direction,
        source: entry.source,
        evidenceRefs,
      };
      onFlowError(null);
      transition((current) => ({ ...current, phase: "SUBMITTING" }));
      void reconcilePort
        .reconcile(missionId, attemptId, evidence)
        .then((outcome) => {
          transition((current) => ({ ...current, phase: "RESOLVED", outcome }));
          // The reconciliation facts land on the mission record and the
          // pending truth changes — re-read both honestly.
          refreshDetail(missionId);
          loadPendingReconciliation(missionId);
        })
        .catch((thrown: unknown) => {
          // A THROWN typed failure (the host's act-time refusal or the
          // runtime's own): back to the evidence entry — every entered
          // fact survives, the failure surfaces honestly on the mount's
          // flow-error line, and a corrected re-submit is possible.
          transition((current) =>
            current.phase === "SUBMITTING" ? { ...current, phase: "EVIDENCE_ENTRY" } : current,
          );
          onFlowError(messageOf(thrown));
        });
    },
    [reconcilePort, onFlowError, refreshDetail, loadPendingReconciliation, transition],
  );

  /** The cancel returns to the pending card with the entry cleared (a fresh engage starts clean). */
  const onCancel = useCallback((): void => {
    transition((current) =>
      current.phase === "EVIDENCE_ENTRY"
        ? { phase: "PENDING_CARD", pending: current.pending }
        : current,
    );
  }, [transition]);

  const wiring: PaymentMissionsReconcileWiring | null =
    reconcilePort === undefined
      ? null
      : {
          state,
          onEngage,
          onChooseAttempt,
          onChooseDirection,
          onChooseSource,
          onEditRefs,
          onSubmit,
          onCancel,
        };

  return { wiring, loadPendingReconciliation };
}
