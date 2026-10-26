/**
 * @payswap/app — the PAYMENT-MISSIONS PANEL (P18-B, ADR-0011 D1).
 *
 * The board surface: the newest-updated-first mission rows (direction,
 * goal, status, intent/preview presence, the plan-selection marker, the
 * updated instant) with the designed-empty contract, plus the honest
 * states the mount resolves — NOT-WIRED, PLANE-NOT-CONFIGURED, LOADING,
 * the mission-not-found truth and the surfaced ERROR (never a mask).
 * The detail view is ./PaymentMissionsDetail.tsx (a pure projection of
 * its state); the preview + two-act approve flow is
 * ./PaymentMissionsPreviewCard.tsx.
 *
 * ZERO AUTHORITY (ADR-0011 D3): no control here fires anything — Refresh
 * re-reads, a row opens the detail, Back returns to the board. The
 * approve flow's acts live on the scope card (Confirm / Decline — the
 * ADR-0011 D2 act vocabulary); no dispatch/execute verb exists anywhere.
 * The panel prose is scan-clean: no authority-surface machine literal
 * ever renders (the timeline shows people-language summaries only).
 */

import { PaymentMissionsDetail } from "./PaymentMissionsDetail.js";
import {
  PAYMENT_MISSIONS_EMPTY_NOTE,
  PAYMENT_MISSIONS_NOT_WIRED_NOTE,
  PAYMENT_MISSIONS_PLANE_NOT_CONFIGURED_NOTE,
  type PaymentMissionsBoardItem,
  type PaymentMissionsView,
} from "./paymentMissionsPins.js";

export interface PaymentMissionsPanelProps {
  /** The view model (every honest state; the mount owns it). */
  readonly view: PaymentMissionsView;
  /** The honest flow-error line (a failed ask/capture/present/approve call — surfaced, never masked). */
  readonly flowError?: string | null;
  /** Wired only by a host that can re-read the board. */
  readonly onRefresh?: () => void;
  /** Wired only by a host that can open a mission detail. */
  readonly onOpenMission?: (missionId: string) => void;
  /** Wired only by a host that can return to the board. */
  readonly onBack?: () => void;
  /** Wired only by a host that can ask for the next intake field. */
  readonly onAskNextField?: (missionId: string) => void;
  /** Wired only by a host that can capture one intake field. */
  readonly onCapture?: (missionId: string, fieldId: string, value: string) => void;
  /** Wired only by a host that can present the structured preview. */
  readonly onPresentPreview?: (missionId: string) => void;
  /** Wired only by a host that can request the approval scope (act one). */
  readonly onEngageApproval?: (missionId: string) => void;
  /** Wired only by a host that can resolve the approval on the scope card (act two). */
  readonly onResolveApproval?: (requestId: string, decision: "APPROVE" | "DECLINE") => void;
}

/** The status badge tone per lifecycle status (terminal failure vs done vs in flight).
 * Rendered as a styled span (importing @zcode/ui here would add new TS6305
 * diagnostics to the package's known tsc baseline — the zero-new-diagnostics
 * law wins; the badge carries the same tone semantics). */
function statusTone(status: PaymentMissionsBoardItem["status"]): "ok" | "blocked" | "unknown" {
  if (status === "COMPLETED") {
    return "ok";
  }
  return status === "FAILED" || status === "CANCELLED" || status === "EXPIRED" ? "blocked" : "unknown";
}

/** The status badge (a real text node — screen-reader read, never a div). */
function MissionStatusBadge({ status }: { readonly status: PaymentMissionsBoardItem["status"] }): React.ReactNode {
  return (
    <span className={`ps-agent-missions-status ps-agent-missions-status--${statusTone(status)}`}>
      {status}
    </span>
  );
}

/** One board row: the whole row is the open-detail control (a real button, labelled by its content). */
function PaymentMissionsBoardRow({
  item,
  onOpenMission,
}: {
  readonly item: PaymentMissionsBoardItem;
  readonly onOpenMission?: (missionId: string) => void;
}): React.ReactNode {
  return (
    <li className="ps-agent-missions-row">
      <button
        type="button"
        className="ps-agent-missions-row-button"
        data-ps-missions-act="OPEN_MISSION"
        data-testid={`ps-agent-missions-open-${item.missionId}`}
        onClick={() => onOpenMission?.(item.missionId)}
      >
        <span className="ps-agent-missions-row-head">
          <span className="ps-agent-missions-direction ps-num">{item.direction}</span>
          <MissionStatusBadge status={item.status} />
        </span>
        <span className="ps-agent-missions-row-goal">{item.goalStatement}</span>
        <span className="ps-agent-missions-row-meta ps-num">
          {item.hasCompiledIntent ? "intent compiled" : "no compiled intent"} ·{" "}
          {item.hasPreview ? "preview presented" : "no preview yet"}
          {item.planSelection !== undefined ? ` · plan selected: ${item.planSelection.planId}` : ""} ·
          updated {item.updatedAt}
        </span>
      </button>
    </li>
  );
}

export function PaymentMissionsPanel({
  view,
  flowError,
  onRefresh,
  onOpenMission,
  onBack,
  onAskNextField,
  onCapture,
  onPresentPreview,
  onEngageApproval,
  onResolveApproval,
}: PaymentMissionsPanelProps): React.ReactNode {
  const onBoard = view.kind === "BOARD" || view.kind === "BOARD_EMPTY";
  return (
    <section className="ps-agent-missions" aria-label="Payment missions — the observation board">
      <header className="ps-agent-missions-head">
        <h3 className="ps-agent-missions-title">Payment missions</h3>
        {onBoard && onRefresh !== undefined ? (
          <button
            type="button"
            className="ps-agent-missions-headact"
            data-ps-missions-act="REFRESH"
            data-testid="ps-agent-missions-refresh"
            onClick={onRefresh}
          >
            Refresh
          </button>
        ) : null}
      </header>

      {view.kind === "NOT_WIRED" ? (
        <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_NOT_WIRED_NOTE}</p>
      ) : view.kind === "PLANE_NOT_CONFIGURED" ? (
        <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_PLANE_NOT_CONFIGURED_NOTE}</p>
      ) : view.kind === "LOADING" ? (
        <p className="ps-agent-missions-empty" role="status">
          Loading the payment-mission board…
        </p>
      ) : view.kind === "LOADING_MISSION" ? (
        <p className="ps-agent-missions-empty" role="status">
          Loading the mission…
        </p>
      ) : view.kind === "BOARD_EMPTY" ? (
        <p className="ps-agent-missions-empty">{PAYMENT_MISSIONS_EMPTY_NOTE}</p>
      ) : view.kind === "MISSION_NOT_FOUND" ? (
        <div className="ps-agent-missions-notfound">
          <p className="ps-agent-missions-empty">
            No mission <span className="ps-num">{view.missionId}</span> exists anymore — the board
            above stays the honest record; nothing is fabricated in its place.
          </p>
          {onBack !== undefined ? (
            <button
              type="button"
              className="ps-agent-missions-headact"
              data-ps-missions-act="BACK"
              onClick={onBack}
            >
              Back to the board
            </button>
          ) : null}
        </div>
      ) : view.kind === "ERROR" ? (
        <p className="ps-agent-missions-note ps-agent-missions-note--error" role="alert">
          The mission board could not be read: {view.message} — nothing is fabricated; the failure
          is surfaced, never masked.
        </p>
      ) : view.kind === "DETAIL" ? (
        <PaymentMissionsDetail
          state={view.state}
          flowError={flowError ?? null}
          onBack={onBack}
          onAskNextField={onAskNextField}
          onCapture={onCapture}
          onPresentPreview={onPresentPreview}
          onEngageApproval={onEngageApproval}
          onResolveApproval={onResolveApproval}
        />
      ) : (
        <ol className="ps-agent-missions-list">
          {view.items.map((item) => (
            <PaymentMissionsBoardRow key={item.missionId} item={item} onOpenMission={onOpenMission} />
          ))}
        </ol>
      )}
    </section>
  );
}
