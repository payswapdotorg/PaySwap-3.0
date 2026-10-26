/**
 * @payswap/app — THE ARMED CARD + THE TWO-ACT DISPATCH FLOW (P19-B,
 * ADR-0012 D1).
 *
 * The dispatch act's surface, mirroring the P18-B scope-card law: the
 * operator engages the dispatch control (the armed card renders), then
 * makes TWO explicit acts — the execution-lane choice and the send
 * confirm. The "Send this payment" control is DISABLED until a lane is
 * chosen and fires dispatch(missionId, connectionRef) with EXACTLY
 * those two arguments; the host recomputes the eligible set at act
 * time (the wire carries a choice, never a grant — the single-use
 * artifact NEVER crosses, ADR-0012 D1).
 *
 * THE HONEST STATES: NOT-ARMED (the host's reason VERBATIM + the path
 * back), NO-LANE (the typed prerequisite — never a fabricated lane;
 * ineligible lanes render as disabled rows with their reasons, never
 * hidden), the REFUSED outcome note (the summary verbatim — a refusal
 * returns to the lane choice: the artifact was not consumed), and the
 * DISPATCHED/REPLAYED outcome note (the summary + the attempt state
 * landing on the mission record). The outcome kinds are DATA rendered
 * through the people-language label map only (the scan-clean law). The
 * expiry renders as an ABSOLUTE instant — no countdown. A11y: a
 * fieldset/legend radio group with visible focus; aria-live on the
 * outcome note ONLY.
 */

import "./payment-missions-dispatch.css";
import {
  PAYMENT_MISSIONS_ARMED_BINDING_NOTE,
  PAYMENT_MISSIONS_DISPATCH_ENTRY_NOTE,
  PAYMENT_MISSIONS_DISPATCH_OUTCOME_LABELS,
  PAYMENT_MISSIONS_DISPATCH_TWO_ACT_NOTE,
  PAYMENT_MISSIONS_DISPATCH_UNAVAILABLE_NOTE,
  PAYMENT_MISSIONS_NOT_ARMED_PATH_BACK_NOTE,
  PAYMENT_MISSIONS_NO_LANE_NOTE,
  type PaymentMissionsDispatchOutcome,
  type PaymentMissionsDispatchWiring,
  type PaymentMissionsExecLane,
} from "./paymentMissionsDispatchPins.js";

export interface PaymentMissionsArmedCardProps {
  readonly missionId: string;
  /** True once this session's approval flow resolved GRANTED (the section's gate, with the armed effect). */
  readonly approvalGranted: boolean;
  /** The dispatch-flow wiring (null/absent when the bound port lacks the dispatch members). */
  readonly dispatch?: PaymentMissionsDispatchWiring | null;
}

/** The outcome note — the ONLY aria-live region on this surface. */
function PaymentMissionsDispatchOutcomeNote({
  outcome,
}: {
  readonly outcome: PaymentMissionsDispatchOutcome;
}): React.ReactNode {
  const label = PAYMENT_MISSIONS_DISPATCH_OUTCOME_LABELS[outcome.kind];
  if (outcome.kind === "REFUSED") {
    return (
      <p className="ps-agent-missions-note ps-agent-missions-note--error" role="status">
        {label} — {outcome.summary} — nothing was sent; the refusal is surfaced, never masked.
      </p>
    );
  }
  return (
    <p className="ps-agent-missions-note ps-agent-missions-note--granted" role="status">
      {label}: {outcome.summary} — the attempt state lands on the mission record.
    </p>
  );
}

/** One lane row: an eligible lane is a real radio choice; an ineligible
 * lane renders as a DISABLED row carrying its reason (never hidden).
 * While the send is in flight or resolved, the choices lock. */
function PaymentMissionsLaneRow({
  lane,
  groupName,
  checked,
  locked,
  onChooseLane,
}: {
  readonly lane: PaymentMissionsExecLane;
  readonly groupName: string;
  readonly checked: boolean;
  readonly locked: boolean;
  readonly onChooseLane: (connectionRef: string) => void;
}): React.ReactNode {
  const ineligible = lane.ineligible !== undefined;
  return (
    <label className={`ps-agent-missions-lane${ineligible ? " ps-agent-missions-lane--ineligible" : ""}`}>
      <input
        type="radio"
        name={groupName}
        value={lane.connectionRef}
        checked={!ineligible && checked}
        disabled={ineligible || locked}
        onChange={() => onChooseLane(lane.connectionRef)}
        data-testid={`ps-agent-missions-lane-${lane.connectionRef}`}
      />
      <span className="ps-agent-missions-lane-text">
        <strong>{lane.label}</strong> — provider <span className="ps-num">{lane.providerId}</span> ·
        lane <span className="ps-num">{lane.connectionRef}</span>
        {ineligible ? ` — not eligible: ${lane.ineligible.reason}` : ""}
      </span>
    </label>
  );
}

/** The engaged armed card: the scope echo + the lane radio group + the two-act send. */
function PaymentMissionsArmedScopeCard({
  missionId,
  wiring,
}: {
  readonly missionId: string;
  readonly wiring: PaymentMissionsDispatchWiring;
}): React.ReactNode {
  const { state } = wiring;
  const effect = state.effect;
  if (effect === undefined || effect.armed !== true) {
    // The loaded effect went not-armed — the honest cards below carry it.
    return null;
  }
  const chosen = state.connectionRef;
  const locked = state.phase === "DISPATCHING" || state.phase === "RESOLVED";
  return (
    <div className="ps-agent-missions-armed" data-testid="ps-agent-missions-armed-card">
      <h5 className="ps-agent-missions-armed-title">The armed scope — choose the lane, then confirm</h5>
      <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_DISPATCH_TWO_ACT_NOTE}</p>
      {effect.scope !== undefined ? (
        <>
          <ul className="ps-agent-missions-plainlist">
            <li>
              <strong>amount:</strong>{" "}
              <span className="ps-num">
                {effect.scope.amount.minorUnits} {effect.scope.amount.currency} (exact minor units)
              </span>
            </li>
            <li>
              <strong>destination:</strong> {effect.scope.destinationSummary}
            </li>
            <li>
              <strong>direction:</strong> <span className="ps-num">{effect.scope.direction}</span>
            </li>
            <li>
              <strong>mission:</strong> <span className="ps-num">{missionId}</span>
            </li>
            <li>
              <strong>armed until:</strong>{" "}
              <span className="ps-num">{effect.expiresAt ?? "not stated"}</span> — the armed state
              never outlives this instant
            </li>
            <li>
              <strong>intent digest:</strong> <span className="ps-num">{effect.scope.intentDigest}</span>
            </li>
          </ul>
          <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_ARMED_BINDING_NOTE}</p>
        </>
      ) : null}
      <fieldset className="ps-agent-missions-lanes">
        <legend className="ps-agent-missions-lanes-legend">The execution lanes</legend>
        {effect.lanes.map((lane) => (
          <PaymentMissionsLaneRow
            key={lane.connectionRef}
            lane={lane}
            groupName={`ps-agent-missions-lane-${missionId}`}
            checked={chosen === lane.connectionRef}
            locked={locked}
            onChooseLane={wiring.onChooseLane}
          />
        ))}
      </fieldset>
      {state.phase === "DISPATCHING" ? (
        <p className="ps-agent-missions-empty">Sending the payment…</p>
      ) : state.phase === "RESOLVED" ? null : (
        <button
          type="button"
          className="ps-agent-missions-act ps-agent-missions-act--confirm"
          data-ps-missions-act="SEND_PAYMENT"
          data-testid="ps-agent-missions-send"
          disabled={chosen === undefined}
          onClick={() => {
            if (chosen !== undefined) {
              wiring.onSend(missionId, chosen);
            }
          }}
        >
          Send this payment
        </button>
      )}
    </div>
  );
}

export function PaymentMissionsArmedCard({
  missionId,
  approvalGranted,
  dispatch,
}: PaymentMissionsArmedCardProps): React.ReactNode {
  const wiring = dispatch ?? null;
  const effect = wiring?.state.effect;
  const armed = effect?.armed === true;
  // The section's gate: this session's approval flow granted, or the
  // loaded effect says the mission IS armed (an artifact from an earlier
  // session stays visible — ADR-0012's lifetime-visibility law).
  if (!approvalGranted && !armed) {
    return null;
  }
  let content: React.ReactNode;
  if (wiring === null) {
    content = <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_DISPATCH_UNAVAILABLE_NOTE}</p>;
  } else if (effect === undefined) {
    content = <p className="ps-agent-missions-empty">Reading the armed state…</p>;
  } else if (!armed) {
    content = (
      <div className="ps-agent-missions-armed" data-testid="ps-agent-missions-not-armed">
        <h5 className="ps-agent-missions-armed-title">Not armed</h5>
        <p className="ps-agent-missions-note">
          {effect.reason ?? "The mission is not armed right now."}
        </p>
        <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_NOT_ARMED_PATH_BACK_NOTE}</p>
      </div>
    );
  } else if (!effect.lanes.some((lane) => lane.ineligible === undefined)) {
    content = (
      <div className="ps-agent-missions-armed" data-testid="ps-agent-missions-no-lane">
        <h5 className="ps-agent-missions-armed-title">Armed — but no execution lane</h5>
        <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_NO_LANE_NOTE}</p>
        {effect.lanes.length > 0 ? (
          <ul className="ps-agent-missions-plainlist">
            {effect.lanes.map((lane) => (
              <li key={lane.connectionRef}>
                <strong>{lane.label}</strong> — provider{" "}
                <span className="ps-num">{lane.providerId}</span> · lane{" "}
                <span className="ps-num">{lane.connectionRef}</span> — not eligible:{" "}
                {lane.ineligible?.reason ?? "not stated"}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  } else {
    // Armed with at least one eligible lane: the two-act flow.
    content =
      wiring.state.phase === "IDLE" ? (
        <>
          <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_DISPATCH_ENTRY_NOTE}</p>
          <button
            type="button"
            className="ps-agent-missions-act"
            data-ps-missions-act="ENGAGE_DISPATCH"
            data-testid="ps-agent-missions-engage-dispatch"
            onClick={() => wiring.onEngage(missionId)}
          >
            Review the armed payment
          </button>
        </>
      ) : (
        <PaymentMissionsArmedScopeCard missionId={missionId} wiring={wiring} />
      );
  }
  const outcome = wiring?.state.outcome;
  return (
    <section
      className="ps-agent-missions-section"
      id="ps-agent-missions-section-armed"
      aria-label="The armed payment and the execution lanes"
    >
      <h4 className="ps-agent-missions-section-title">The armed payment — the send</h4>
      {content}
      {outcome !== undefined ? <PaymentMissionsDispatchOutcomeNote outcome={outcome} /> : null}
    </section>
  );
}
