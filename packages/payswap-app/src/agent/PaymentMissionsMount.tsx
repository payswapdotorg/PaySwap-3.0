/**
 * @payswap/app — the PAYMENT-MISSIONS MOUNT (P18-B, ADR-0011 D1).
 *
 * The observation surface's composition seam + state owner: resolves the
 * payment-missions port (prop ?? the module-level shared binding — the
 * P17-B session-seam pattern exactly), loads the board, opens mission
 * details, drives the intake capture UX (askNextField → capture), the
 * preview presentation and the TWO-ACT approve flow (requestApproval →
 * the scope card → resolveApproval), and the TWO-ACT DISPATCH flow
 * (P19-B: armedEffect when the detail is selected → the armed card →
 * the lane choice → the send confirm — ./paymentMissionsDispatchFlow.ts
 * owns the slice so this file keeps the line law), and the TWO-ACT
 * RECONCILE flow (P20-B: pendingReconciliation when the detail is
 * selected → the pending card → the evidence entry → the submit —
 * ./paymentMissionsReconcileFlow.ts owns the slice). The panel family
 * is a PURE projection of the view model; every port call and every
 * honest failure lands here.
 *
 * HONESTY LAWS: no port → the not-wired note (never fabricated
 * missions); the typed plane-not-configured rejection → its pinned note
 * (checked BEFORE the generic error — never an error mask); a failed
 * call → the surfaced error card; an absent mission → the honest
 * not-found state; an empty board → the designed-empty contract. THE
 * TWO-ACT LAW is structural: the Confirm control renders only on the
 * scope card, and the scope card exists only after requestApproval
 * returned — no resolveApproval call can be wired without act one (the
 * host still fails any un-scoped resolve closed; it is the authority).
 * ZERO ambient clock/random — every instant arrives on a DTO (the one carve-out: the task-completion projection instant — the pinned ambient site).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PaymentMissionsPanel } from "./PaymentMissionsPanel.js";
import "./payment-missions.css";
import {
  isPaymentMissionsPlaneNotConfigured,
  type PaymentMissionsBoardItem,
  type PaymentMissionsDetailState,
  type PaymentMissionsPort,
  type PaymentMissionsView,
} from "./paymentMissionsPins.js";
import { usePaymentMissionsDispatchFlow } from "./paymentMissionsDispatchFlow.js";
import { isPaymentMissionsDispatchPort } from "./paymentMissionsDispatchPins.js";
import { usePaymentMissionsReconcileFlow } from "./paymentMissionsReconcileFlow.js";
import { isPaymentMissionsReconciliationPort } from "./paymentMissionsReconcilePins.js";
import { useMissionCompletionProjection, type AgentTaskSessionPort } from "./missionCompletionProjection.js";

/* ------------- the shared port binding (the composition seam) ------------- */

let sharedPort: PaymentMissionsPort | undefined;

/** The ONE shared payment-missions port per document (default: undefined — the honest not-wired note). */
export function sharedPaymentMissionsPort(): PaymentMissionsPort | undefined {
  return sharedPort;
}

/** The composition-root binding (the platform host / the bridge tests — P18-C). */
export function bindPaymentMissionsPort(port: PaymentMissionsPort): void {
  sharedPort = port;
}

/** Test/inspection helper: drop the shared binding (never used in src). */
export function resetSharedPaymentMissionsPort(): void {
  sharedPort = undefined;
}

/* --------------------------------- helpers --------------------------------- */

/** The typed catch ordering: the plane-not-configured note FIRST, then the honest error card. */
function failureView(thrown: unknown): PaymentMissionsView {
  if (isPaymentMissionsPlaneNotConfigured(thrown)) {
    return { kind: "PLANE_NOT_CONFIGURED" };
  }
  return { kind: "ERROR", message: thrown instanceof Error ? thrown.message : String(thrown) };
}

/** Newest-updated-first (mission id breaks ties — the channel's own total order, never ambient). */
function newestUpdatedFirst(
  items: readonly PaymentMissionsBoardItem[],
): readonly PaymentMissionsBoardItem[] {
  return [...items].sort((a, b) =>
    a.updatedAt === b.updatedAt
      ? a.missionId < b.missionId
        ? 1
        : -1
      : a.updatedAt < b.updatedAt
        ? 1
        : -1,
  );
}

/** The fresh detail interaction state (every flow starts idle — never a stale carry-over). */
function freshDetailState(detail: PaymentMissionsDetailState["detail"]): PaymentMissionsDetailState {
  return { detail, ask: { phase: "IDLE" }, preview: null, presenting: false, approval: { phase: "IDLE" } };
}

function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/* --------------------------------- the mount -------------------------------- */

export interface PaymentMissionsMountProps {
  /** Injectable port (tests); default: the shared binding (absent → the honest not-wired note). */
  readonly port?: PaymentMissionsPort;
  /** (P21-D, Gap B) The task-completion projection seam: the composer's ONE task-session port + the live mission↔task link (absent = not composed). */
  readonly taskSession?: AgentTaskSessionPort;
  readonly missionLink?: () => { readonly missionId: string; readonly taskId: string } | null;
}

export function PaymentMissionsMount({ port, taskSession, missionLink }: PaymentMissionsMountProps): React.ReactNode {
  const resolvedPort = port ?? sharedPaymentMissionsPort();
  const [view, setView] = useState<PaymentMissionsView>({ kind: "LOADING" });
  const [flowError, setFlowError] = useState<string | null>(null);
  // The mission whose scope card is engaged (act one) — the refresh target after act two.
  const approvalMission = useRef<string | null>(null);

  // (P21-D, Gap B) The task-completion projection: every mission detail this
  // mount observes flows through it (see ./missionCompletionProjection.ts).
  const observeMissionCompletion = useMissionCompletionProjection(taskSession, missionLink, setFlowError);

  /** Update the current DETAIL view's interaction state (a no-op on any other view). */
  const updateDetail = useCallback(
    (update: (state: PaymentMissionsDetailState) => PaymentMissionsDetailState): void => {
      setView((current) =>
        current.kind === "DETAIL" ? { kind: "DETAIL", state: update(current.state) } : current,
      );
    },
    [],
  );

  const loadBoard = useCallback((): void => {
    if (resolvedPort === undefined) {
      setView({ kind: "NOT_WIRED" });
      return;
    }
    setView({ kind: "LOADING" });
    void resolvedPort
      .board()
      .then((items) => {
        setView(
          items.length === 0
            ? { kind: "BOARD_EMPTY" }
            : { kind: "BOARD", items: newestUpdatedFirst(items) },
        );
      })
      .catch((thrown: unknown) => setView(failureView(thrown)));
  }, [resolvedPort]);

  // The initial load (and the reload whenever the resolved port changes).
  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const refreshDetail = useCallback(
    (missionId: string): void => {
      if (resolvedPort === undefined) {
        return;
      }
      void resolvedPort
        .detail(missionId)
        .then((detail) => {
          if (detail !== null) {
            // (P21-D, Gap B) the outcome re-read feeds the task-completion projection.
            observeMissionCompletion(detail);
            updateDetail((state) =>
              state.detail.id === missionId ? { ...state, detail } : state,
            );
          }
        })
        .catch((thrown: unknown) => {
          // The primary call's outcome already rendered; a failed re-read is
          // surfaced honestly, never masked — the shown detail stays as last read.
          setFlowError(`the mission detail could not be re-read: ${messageOf(thrown)}`);
        });
    },
    [resolvedPort, updateDetail, observeMissionCompletion],
  );

  // The dispatch-capable seam resolution (P19-B): a P18-only port keeps
  // the honest dispatch-unavailable note on the armed section — never an
  // error. The flow hook owns the armed card's state machine (the line law).
  const dispatchPort =
    resolvedPort !== undefined && isPaymentMissionsDispatchPort(resolvedPort)
      ? resolvedPort
      : undefined;
  const { wiring: dispatchWiring, loadArmedEffect, onApprovalGranted } =
    usePaymentMissionsDispatchFlow(dispatchPort, setFlowError, refreshDetail);

  // The reconciliation-capable seam resolution (P20-B): a port without
  // the members keeps the honest reconciliation-unavailable note on the
  // reconcile section (gated by the mission's unresolved-looking
  // attempts) — never an error. The flow hook owns the reconcile card's
  // state machine (the line law).
  const reconcilePort =
    resolvedPort !== undefined && isPaymentMissionsReconciliationPort(resolvedPort)
      ? resolvedPort
      : undefined;
  const { wiring: reconcileWiring, loadPendingReconciliation } =
    usePaymentMissionsReconcileFlow(reconcilePort, setFlowError, refreshDetail);

  const openMission = useCallback(
    (missionId: string): void => {
      if (resolvedPort === undefined) {
        return;
      }
      setFlowError(null);
      approvalMission.current = null;
      setView({ kind: "LOADING_MISSION", missionId });
      void resolvedPort
        .detail(missionId)
        .then((detail) => {
          setView(
            detail === null
              ? { kind: "MISSION_NOT_FOUND", missionId }
              : { kind: "DETAIL", state: freshDetailState(detail) },
          );
          // The armed card's own read (P19-B): the dispatch-capable port
          // loads the armed effect when the detail is selected. The
          // reconcile card's own read (P20-B): the reconciliation-capable
          // port loads the pending card alongside it.
          if (detail !== null) {
            observeMissionCompletion(detail);
            loadArmedEffect(missionId);
            loadPendingReconciliation(missionId);
          }
        })
        .catch((thrown: unknown) => setView(failureView(thrown)));
    },
    [resolvedPort, loadArmedEffect, loadPendingReconciliation, observeMissionCompletion],
  );

  const askNextField = useCallback(
    (missionId: string): void => {
      if (resolvedPort === undefined) {
        return;
      }
      setFlowError(null);
      updateDetail((state) => ({ ...state, ask: { phase: "ASKING" } }));
      void resolvedPort
        .askNextField(missionId)
        .then((ask) => {
          updateDetail((state) => ({
            ...state,
            ask:
              ask === null
                ? { phase: "COMPLETE" }
                : { phase: "ASKED", fieldId: ask.fieldId, question: ask.question },
          }));
        })
        .catch((thrown: unknown) => {
          updateDetail((state) => ({ ...state, ask: { phase: "IDLE" } }));
          setFlowError(messageOf(thrown));
        });
    },
    [resolvedPort, updateDetail],
  );

  const capture = useCallback(
    (missionId: string, fieldId: string, value: string): void => {
      if (resolvedPort === undefined) {
        return;
      }
      setFlowError(null);
      updateDetail((state) => ({ ...state, ask: { phase: "CAPTURING" } }));
      void resolvedPort
        .capture(missionId, fieldId, value)
        .then((detail) => {
          // The capture answer IS the refreshed detail (the channel returns it).
          updateDetail((state) =>
            state.detail.id === missionId
              ? { ...state, detail, ask: { phase: "IDLE" } }
              : { ...state, ask: { phase: "IDLE" } },
          );
        })
        .catch((thrown: unknown) => {
          updateDetail((state) => ({ ...state, ask: { phase: "IDLE" } }));
          setFlowError(messageOf(thrown));
        });
    },
    [resolvedPort, updateDetail],
  );

  const presentPreview = useCallback(
    (missionId: string): void => {
      if (resolvedPort === undefined) {
        return;
      }
      setFlowError(null);
      updateDetail((state) => ({ ...state, presenting: true }));
      void resolvedPort
        .presentPreview(missionId)
        .then((preview) => {
          updateDetail((state) => ({ ...state, preview, presenting: false }));
          // The presentation lands on the timeline — re-read the detail honestly.
          refreshDetail(missionId);
        })
        .catch((thrown: unknown) => {
          updateDetail((state) => ({ ...state, presenting: false }));
          setFlowError(messageOf(thrown));
        });
    },
    [resolvedPort, updateDetail, refreshDetail],
  );

  /** Act one of the approval: the scoped request → the scope card. */
  const engageApproval = useCallback(
    (missionId: string): void => {
      if (resolvedPort === undefined) {
        return;
      }
      setFlowError(null);
      approvalMission.current = missionId;
      updateDetail((state) => ({ ...state, approval: { phase: "REQUESTING" } }));
      void resolvedPort
        .requestApproval(missionId)
        .then((request) => {
          updateDetail((state) => ({ ...state, approval: { phase: "SCOPE_CARD", request } }));
        })
        .catch((thrown: unknown) => {
          updateDetail((state) => ({ ...state, approval: { phase: "IDLE" } }));
          setFlowError(messageOf(thrown));
        });
    },
    [resolvedPort, updateDetail],
  );

  /**
   * Act two of the approval: the operator's decision on the scope card. The
   * panel renders Confirm/Decline ONLY on the scope card (the structural
   * two-act law); the mount resolves strictly over the request it engaged,
   * and the HOST remains the authority — an un-scoped resolve fails closed
   * there and surfaces here honestly.
   */
  const resolveApproval = useCallback(
    (requestId: string, decision: "APPROVE" | "DECLINE"): void => {
      if (resolvedPort === undefined) {
        return;
      }
      setFlowError(null);
      const missionId = approvalMission.current;
      updateDetail((state) =>
        state.approval.phase === "SCOPE_CARD" && state.approval.request?.requestId === requestId
          ? { ...state, approval: { phase: "RESOLVING", request: state.approval.request } }
          : state,
      );
      void resolvedPort
        .resolveApproval(requestId, decision)
        .then((resolution) => {
          updateDetail((state) =>
            state.approval.request?.requestId === requestId
              ? {
                  ...state,
                  approval: { phase: "RESOLVED", request: state.approval.request, resolution },
                }
              : state,
          );
          // The outcome lands on the timeline — re-read the detail honestly.
          if (missionId !== null) {
            refreshDetail(missionId);
            // A granted approval arms the mission — re-read the armed truth
            // (the stale pre-approval effect is cleared first, never shown).
            if (resolution.outcome === "GRANTED") {
              onApprovalGranted(missionId);
            }
          }
        })
        .catch((thrown: unknown) => {
          updateDetail((state) =>
            state.approval.request?.requestId === requestId
              ? { ...state, approval: { phase: "SCOPE_CARD", request: state.approval.request } }
              : state,
          );
          setFlowError(messageOf(thrown));
        });
    },
    [resolvedPort, updateDetail, refreshDetail, onApprovalGranted],
  );

  if (resolvedPort === undefined) {
    return <PaymentMissionsPanel view={{ kind: "NOT_WIRED" }} />;
  }

  return (
    <PaymentMissionsPanel
      view={view}
      flowError={flowError}
      onRefresh={loadBoard}
      onOpenMission={openMission}
      onBack={loadBoard}
      onAskNextField={askNextField}
      onCapture={capture}
      onPresentPreview={presentPreview}
      onEngageApproval={engageApproval}
      onResolveApproval={resolveApproval}
      dispatch={dispatchWiring}
      reconcile={reconcileWiring}
    />
  );
}
