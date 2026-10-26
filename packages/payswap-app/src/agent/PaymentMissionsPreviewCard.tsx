/**
 * @payswap/app — the PRESENTED-PREVIEW CARD + the TWO-ACT APPROVE FLOW
 * (P18-B, ADR-0011 D1/D2).
 *
 * The preview presentation: the present control (an intake-plane input —
 * the host runs the six gates over the honest environment and persists
 * the presentation), then the preview's gates — EVERY decision + reason
 * VERBATIM, the aggregate verdict, and the not-dispatchable honesty (a
 * BLOCK is the surfaced outcome, never repaired here; no intent, route
 * or gate outcome is ever fabricated on this surface).
 *
 * THE TWO-ACT APPROVE FLOW (ADR-0011 D2): act one — the operator engages
 * "Review and approve" (only when a preview exists) and the scope card
 * renders the request's scopeSummary, amount, destination, the honest
 * expiry instant (no countdown — the instant is the DTO's) and the
 * intent-digest binding note in people language. Act two — the Confirm /
 * Decline controls. THE TWO-ACT LAW IS STRUCTURAL: the Confirm control
 * exists ONLY inside the scope card, and the scope card exists only
 * after requestApproval returned — no resolveApproval call can ever be
 * wired without act one. No authority verb appears on any control; the
 * dispatch stays host-side (D3), and the granted outcome says so.
 */

import {
  PAYMENT_MISSIONS_ARMED_NOTE,
  PAYMENT_MISSIONS_DECLINED_NOTE,
  PAYMENT_MISSIONS_NOT_DISPATCHABLE_NOTE,
  PAYMENT_MISSIONS_PRESENT_NOTE,
  PAYMENT_MISSIONS_SCOPE_BINDING_NOTE,
  PAYMENT_MISSIONS_TWO_ACT_NOTE,
  type PaymentMissionsApprovalRequest,
  type PaymentMissionsApprovalResolution,
  type PaymentMissionsApprovalState,
  type PaymentMissionsPreview,
} from "./paymentMissionsPins.js";

export interface PaymentMissionsPreviewCardProps {
  readonly missionId: string;
  /** The presented preview (null until one is presented). */
  readonly preview: PaymentMissionsPreview | null;
  readonly presenting: boolean;
  readonly approval: PaymentMissionsApprovalState;
  readonly onPresentPreview?: (missionId: string) => void;
  readonly onEngageApproval?: (missionId: string) => void;
  readonly onResolveApproval?: (requestId: string, decision: "APPROVE" | "DECLINE") => void;
}

/** Act two's surface: the scope card. Confirm / Decline live HERE and only here. */
function PaymentMissionsScopeCard({
  request,
  resolving,
  onResolveApproval,
}: {
  readonly request: PaymentMissionsApprovalRequest;
  readonly resolving: boolean;
  readonly onResolveApproval?: (requestId: string, decision: "APPROVE" | "DECLINE") => void;
}): React.ReactNode {
  return (
    <div className="ps-agent-missions-scope" data-testid="ps-agent-missions-scope-card">
      <h5 className="ps-agent-missions-scope-title">The approval scope — act two of two</h5>
      <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_TWO_ACT_NOTE}</p>
      <p className="ps-agent-missions-scope-summary">{request.scopeSummary}</p>
      <ul className="ps-agent-missions-plainlist">
        <li>
          <strong>amount:</strong>{" "}
          <span className="ps-num">
            {request.scope.amount.minorUnits} {request.scope.amount.currency} (exact minor units)
          </span>
        </li>
        <li>
          <strong>destination:</strong> {request.scope.destinationSummary}
        </li>
        <li>
          <strong>direction:</strong> <span className="ps-num">{request.scope.direction}</span>
        </li>
        <li>
          <strong>request:</strong> <span className="ps-num">{request.requestId}</span>
        </li>
        <li>
          <strong>expires:</strong> <span className="ps-num">{request.expiresAt}</span> — approval
          never outlives this instant
        </li>
        <li>
          <strong>intent digest:</strong> <span className="ps-num">{request.scope.intentDigest}</span>
        </li>
      </ul>
      <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_SCOPE_BINDING_NOTE}</p>
      {resolving ? (
        <p className="ps-agent-missions-empty" role="status">
          Recording your decision…
        </p>
      ) : onResolveApproval !== undefined ? (
        <div className="ps-agent-missions-scope-actions">
          <button
            type="button"
            className="ps-agent-missions-act ps-agent-missions-act--confirm"
            data-ps-missions-act="CONFIRM"
            data-testid="ps-agent-missions-confirm"
            onClick={() => onResolveApproval(request.requestId, "APPROVE")}
          >
            Confirm
          </button>
          <button
            type="button"
            className="ps-agent-missions-act"
            data-ps-missions-act="DECLINE"
            data-testid="ps-agent-missions-decline"
            onClick={() => onResolveApproval(request.requestId, "DECLINE")}
          >
            Decline
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The honest outcome after act two (the armed / declined / typed-failure notes). */
function PaymentMissionsApprovalOutcome({
  resolution,
  request,
}: {
  readonly resolution: PaymentMissionsApprovalResolution;
  readonly request?: PaymentMissionsApprovalRequest;
}): React.ReactNode {
  if (resolution.outcome === "GRANTED") {
    return (
      <div className="ps-agent-missions-outcome" data-testid="ps-agent-missions-outcome">
        <p className="ps-agent-missions-note ps-agent-missions-note--granted" role="status">
          {PAYMENT_MISSIONS_ARMED_NOTE}
        </p>
        <p className="ps-agent-missions-meta ps-num">
          armed until {resolution.expiresAt}
          {request !== undefined ? ` · scope ${request.scope.intentDigest}` : ""}
        </p>
      </div>
    );
  }
  if (resolution.outcome === "DECLINED") {
    return (
      <p className="ps-agent-missions-note" role="status">
        {PAYMENT_MISSIONS_DECLINED_NOTE}
        {resolution.reason.length > 0 ? ` (${resolution.reason})` : ""}
      </p>
    );
  }
  return (
    <p className="ps-agent-missions-note ps-agent-missions-note--error" role="alert">
      The approval could not be recorded: {resolution.reason} (failure{" "}
      <span className="ps-num">{resolution.failure}</span>) — nothing was approved; the failure is
      surfaced, never masked.
    </p>
  );
}

export function PaymentMissionsPreviewCard({
  missionId,
  preview,
  presenting,
  approval,
  onPresentPreview,
  onEngageApproval,
  onResolveApproval,
}: PaymentMissionsPreviewCardProps): React.ReactNode {
  return (
    <section
      className="ps-agent-missions-section"
      id="ps-agent-missions-section-preview"
      aria-label="The presented preview and the two-act approval"
    >
      <h4 className="ps-agent-missions-section-title">Presented preview</h4>
      {preview === null ? (
        <>
          <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_PRESENT_NOTE}</p>
          {presenting ? (
            <p className="ps-agent-missions-empty" role="status">
              Presenting the preview…
            </p>
          ) : onPresentPreview !== undefined ? (
            <button
              type="button"
              className="ps-agent-missions-act"
              data-ps-missions-act="PRESENT_PREVIEW"
              data-testid="ps-agent-missions-present"
              onClick={() => onPresentPreview(missionId)}
            >
              Present the structured preview
            </button>
          ) : null}
        </>
      ) : (
        <>
          <p className="ps-agent-missions-meta ps-num">
            preview {preview.previewId} · presented {preview.presentedAt} · gates{" "}
            {preview.gates.decision}
          </p>
          <ul className="ps-agent-missions-gates">
            {preview.gates.decisions.map((decision) => (
              <li key={decision.gate}>
                <strong>{decision.gate}</strong> — {decision.decision}: {decision.reason}
              </li>
            ))}
          </ul>
          {preview.gates.decision === "BLOCK" ? (
            <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_NOT_DISPATCHABLE_NOTE}</p>
          ) : (
            <p className="ps-agent-missions-meta">
              The gates allow this preview to proceed to the approval scope.
            </p>
          )}
          {preview.dispatchable ? null : (
            <p className="ps-agent-missions-meta ps-num">dispatchable: false</p>
          )}
          {approval.phase === "IDLE" && onEngageApproval !== undefined ? (
            <button
              type="button"
              className="ps-agent-missions-act"
              data-ps-missions-act="ENGAGE_APPROVAL"
              data-testid="ps-agent-missions-engage"
              onClick={() => onEngageApproval(missionId)}
            >
              Review and approve
            </button>
          ) : null}
          {approval.phase === "REQUESTING" ? (
            <p className="ps-agent-missions-empty" role="status">
              Preparing the approval scope…
            </p>
          ) : null}
          {(approval.phase === "SCOPE_CARD" || approval.phase === "RESOLVING") &&
          approval.request !== undefined ? (
            <PaymentMissionsScopeCard
              request={approval.request}
              resolving={approval.phase === "RESOLVING"}
              onResolveApproval={onResolveApproval}
            />
          ) : null}
          {approval.phase === "RESOLVED" && approval.resolution !== undefined ? (
            <PaymentMissionsApprovalOutcome resolution={approval.resolution} request={approval.request} />
          ) : null}
        </>
      )}
    </section>
  );
}
