/**
 * @payswap/app — THE RECONCILE CARD + THE TWO-ACT EVIDENCE ENTRY (P20-B,
 * ADR-0013 D1/D2).
 *
 * The reconciliation act's surface, mirroring the P19-B armed-card law:
 * the operator engages the reconcile control over the pending card (act
 * one), then enters the provider evidence — the direction, the source
 * kind and the reference strings — and confirms (act two). The confirm
 * is DISABLED until a direction, a source and at least one non-empty
 * trimmed reference all exist, and fires reconcile(missionId, attemptId,
 * evidence) with EXACTLY those facts; the host recomputes the pending
 * set at act time and the runtime verb stays the ONLY closer of an
 * unknown outcome — never a guess, never a fabricated provider effect
 * (ADR-0013 D2: the operator is the courier of the provider's evidence,
 * not its source).
 *
 * THE HONEST STATES: NOTHING-PENDING (the designed empty card — the
 * host's own note explains what this surface does, for when an unknown
 * appears), the typed-failure return (the entry stands with every fact
 * intact; the honest error prose lands on the detail's flow-error line
 * — never masked), the unavailable-port note, and the reconciled
 * outcome note (the ONLY aria-live region: the resolved direction in
 * people language through the frozen label map). The directions and the
 * source kinds are DATA rendered through the label maps only (the
 * scan-clean law). A11y: fieldset/legend radio groups with visible
 * focus; a labelled textarea; absolute instants only.
 */

import "./payment-missions-reconcile.css";
import { PAYMENT_MISSIONS_ATTEMPT_OPERATION_LABELS } from "./paymentMissionsPins.js";
import {
  PAYMENT_MISSIONS_RECONCILIATION_DIRECTION_LABELS,
  PAYMENT_MISSIONS_RECONCILIATION_DIRECTIONS,
  PAYMENT_MISSIONS_RECONCILIATION_SOURCE_LABELS,
  PAYMENT_MISSIONS_RECONCILE_COURIER_NOTE,
  PAYMENT_MISSIONS_RECONCILE_REFS_NOTE,
  PAYMENT_MISSIONS_RECONCILE_TWO_ACT_NOTE,
  PAYMENT_MISSIONS_RECONCILIATION_UNAVAILABLE_NOTE,
  reconcileRefsOf,
  type PaymentMissionsPendingAttempt,
  type PaymentMissionsReconcileOutcome,
  type PaymentMissionsReconcileWiring,
} from "./paymentMissionsReconcilePins.js";

export interface PaymentMissionsReconcileCardProps {
  readonly missionId: string;
  /** True when the detail's attempt states show an unresolved-looking
   * outcome (the gate for the unavailable note when the port lacks the
   * members — a mission with nothing unresolved keeps the section
   * absent rather than noisy). */
  readonly unresolvedAttempts: boolean;
  /** The reconcile-flow wiring (null/absent when the bound port lacks the reconciliation members). */
  readonly reconcile?: PaymentMissionsReconcileWiring | null;
}

/** One pending attempt's facts (ADR-0013 D1 — attempt facts only, never envelope internals). */
function PendingAttemptFacts({
  attempt,
}: {
  readonly attempt: PaymentMissionsPendingAttempt;
}): React.ReactNode {
  return (
    <li>
      <span className="ps-num">{attempt.attemptId}</span> —{" "}
      {PAYMENT_MISSIONS_ATTEMPT_OPERATION_LABELS[attempt.operation] ?? "an operation"} (
      {attempt.executionMode.toLowerCase()} mode), started {attempt.startedAt}: {attempt.summary}
    </li>
  );
}

/** The outcome note — the ONLY aria-live region on this surface. */
function PaymentMissionsReconcileOutcomeNote({
  outcome,
}: {
  readonly outcome: PaymentMissionsReconcileOutcome;
}): React.ReactNode {
  return (
    <p className="ps-agent-missions-note ps-agent-missions-note--granted" role="status">
      Reconciled: {PAYMENT_MISSIONS_RECONCILIATION_DIRECTION_LABELS[outcome.resolvedTo]} —{" "}
      {outcome.summary} — the reconciliation facts land on the mission record.
    </p>
  );
}

/** The engaged evidence-entry card: the pending facts + the direction +
 * source choices + the references entry + the two-act confirm. */
function PaymentMissionsEvidenceEntryCard({
  missionId,
  wiring,
}: {
  readonly missionId: string;
  readonly wiring: PaymentMissionsReconcileWiring;
}): React.ReactNode {
  const { state } = wiring;
  const pending = state.pending;
  const locked = state.phase === "SUBMITTING";
  const refsInputId = `ps-agent-missions-refs-${missionId}`;
  // DISABLED-UNTIL-VALID (never a guess): the addressed attempt, a
  // direction, a source and at least one non-empty trimmed reference.
  const valid =
    state.attemptId !== undefined &&
    state.direction !== undefined &&
    state.source !== undefined &&
    reconcileRefsOf(state.refsText).length > 0;
  return (
    <div className="ps-agent-missions-reconcile" data-testid="ps-agent-missions-reconcile-entry">
      <h5 className="ps-agent-missions-reconcile-title">The evidence entry — transcribe the provider's record</h5>
      <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_RECONCILE_TWO_ACT_NOTE}</p>
      {pending !== undefined && pending.pending.length > 0 ? (
        <ul className="ps-agent-missions-plainlist">
          {pending.pending.map((attempt) => (
            <PendingAttemptFacts key={attempt.attemptId} attempt={attempt} />
          ))}
        </ul>
      ) : null}
      {pending !== undefined && pending.pending.length > 1 ? (
        // The defensive never-guess branch: the wire shape is a LIST, so
        // a read listing several pending attempts leaves the choice to
        // the operator — the confirm stays locked until they make it.
        <fieldset className="ps-agent-missions-reconcile-fields">
          <legend className="ps-agent-missions-reconcile-legend">Which attempt are you reconciling?</legend>
          {pending.pending.map((attempt) => (
            <label className="ps-agent-missions-choice" key={attempt.attemptId}>
              <input
                type="radio"
                name={`ps-agent-missions-reconcile-attempt-${missionId}`}
                value={attempt.attemptId}
                checked={state.attemptId === attempt.attemptId}
                disabled={locked}
                onChange={() => wiring.onChooseAttempt(attempt.attemptId)}
                data-testid={`ps-agent-missions-reconcile-attempt-${attempt.attemptId}`}
              />
              <span className="ps-agent-missions-choice-text">
                <span className="ps-num">{attempt.attemptId}</span> — started {attempt.startedAt}:{" "}
                {attempt.summary}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <fieldset className="ps-agent-missions-reconcile-fields">
        <legend className="ps-agent-missions-reconcile-legend">The provider evidence's direction</legend>
        {PAYMENT_MISSIONS_RECONCILIATION_DIRECTIONS.map((direction) => (
          <label className="ps-agent-missions-choice" key={direction}>
            <input
              type="radio"
              name={`ps-agent-missions-reconcile-direction-${missionId}`}
              value={direction}
              checked={state.direction === direction}
              disabled={locked}
              onChange={() => wiring.onChooseDirection(direction)}
              data-testid={`ps-agent-missions-reconcile-direction-${direction}`}
            />
            <span className="ps-agent-missions-choice-text">
              {PAYMENT_MISSIONS_RECONCILIATION_DIRECTION_LABELS[direction]}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="ps-agent-missions-reconcile-fields">
        <legend className="ps-agent-missions-reconcile-legend">
          Which kind of provider evidence are you transcribing?
        </legend>
        {(pending?.acceptedSources ?? []).map((source) => (
          <label className="ps-agent-missions-choice" key={source}>
            <input
              type="radio"
              name={`ps-agent-missions-reconcile-source-${missionId}`}
              value={source}
              checked={state.source === source}
              disabled={locked}
              onChange={() => wiring.onChooseSource(source)}
              data-testid={`ps-agent-missions-reconcile-source-${source}`}
            />
            <span className="ps-agent-missions-choice-text">
              {PAYMENT_MISSIONS_RECONCILIATION_SOURCE_LABELS[source] ?? "a provider evidence record"}
            </span>
          </label>
        ))}
        <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_RECONCILE_COURIER_NOTE}</p>
      </fieldset>
      <label className="ps-agent-missions-refs-label" htmlFor={refsInputId}>
        The provider's reference strings — one per line
      </label>
      <textarea
        id={refsInputId}
        className="ps-agent-missions-refs"
        rows={3}
        disabled={locked}
        value={state.refsText ?? ""}
        onChange={(event) => wiring.onEditRefs(event.target.value)}
        data-testid="ps-agent-missions-reconcile-refs"
      />
      <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_RECONCILE_REFS_NOTE}</p>
      {state.phase === "SUBMITTING" ? (
        <p className="ps-agent-missions-empty">Submitting the reconciliation evidence…</p>
      ) : (
        <div className="ps-agent-missions-reconcile-actions">
          <button
            type="button"
            className="ps-agent-missions-act ps-agent-missions-act--confirm"
            data-ps-missions-act="SUBMIT_RECONCILIATION"
            data-testid="ps-agent-missions-reconcile-submit"
            disabled={!valid}
            onClick={() => {
              if (valid) {
                wiring.onSubmit(missionId);
              }
            }}
          >
            Close this unknown with the evidence
          </button>
          <button
            type="button"
            className="ps-agent-missions-act"
            data-ps-missions-act="CANCEL_RECONCILIATION"
            data-testid="ps-agent-missions-reconcile-cancel"
            onClick={wiring.onCancel}
          >
            Cancel — back to the pending card
          </button>
        </div>
      )}
    </div>
  );
}

export function PaymentMissionsReconcileCard({
  missionId,
  unresolvedAttempts,
  reconcile,
}: PaymentMissionsReconcileCardProps): React.ReactNode {
  const wiring = reconcile ?? null;
  // The section's gate: the port supports reconciliation (the pending
  // card drives the content — the empty card IS the designed state), or
  // the mission shows unresolved-looking attempts and the honest gap
  // note states what is missing (never a dead control).
  if (wiring === null && !unresolvedAttempts) {
    return null;
  }
  let content: React.ReactNode;
  if (wiring === null) {
    content = <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_RECONCILIATION_UNAVAILABLE_NOTE}</p>;
  } else if (wiring.state.phase === "EVIDENCE_ENTRY" || wiring.state.phase === "SUBMITTING") {
    content = <PaymentMissionsEvidenceEntryCard missionId={missionId} wiring={wiring} />;
  } else {
    // IDLE (the read is in flight), PENDING_CARD and RESOLVED all render
    // the pending card's own truth — the RESOLVED re-read drives the
    // post-state (the armed-card pattern: the fresh read, never a stale
    // entry, is what shows).
    const pending = wiring.state.pending;
    content =
      pending === undefined ? (
        <p className="ps-agent-missions-empty">Reading the pending reconciliation…</p>
      ) : pending.pending.length === 0 ? (
        <div className="ps-agent-missions-reconcile" data-testid="ps-agent-missions-reconcile-empty">
          <p className="ps-agent-missions-empty">Nothing pending reconciliation on this mission.</p>
          <p className="ps-agent-missions-note">{pending.note}</p>
        </div>
      ) : (
        <div className="ps-agent-missions-reconcile" data-testid="ps-agent-missions-reconcile-pending">
          <p className="ps-agent-missions-note">{pending.note}</p>
          <ul className="ps-agent-missions-plainlist">
            {pending.pending.map((attempt) => (
              <PendingAttemptFacts key={attempt.attemptId} attempt={attempt} />
            ))}
          </ul>
          <button
            type="button"
            className="ps-agent-missions-act"
            data-ps-missions-act="ENGAGE_RECONCILE"
            data-testid="ps-agent-missions-engage-reconcile"
            onClick={() => wiring.onEngage(missionId)}
          >
            Review reconciliation
          </button>
        </div>
      );
  }
  const outcome = wiring?.state.outcome;
  return (
    <section
      className="ps-agent-missions-section"
      id="ps-agent-missions-section-reconcile"
      aria-label="Reconciliation — closing an unknown outcome with provider evidence"
    >
      <h4 className="ps-agent-missions-section-title">Reconciliation — closing an unknown outcome</h4>
      {content}
      {outcome !== undefined ? <PaymentMissionsReconcileOutcomeNote outcome={outcome} /> : null}
    </section>
  );
}
