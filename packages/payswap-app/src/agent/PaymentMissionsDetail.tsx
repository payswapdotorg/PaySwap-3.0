/**
 * @payswap/app — the PAYMENT-MISSION DETAIL VIEW (P18-B, ADR-0011 D1).
 *
 * The mission's observation projection (a PURE projection of its state —
 * INV-23): the append-only timeline (people-language summaries only — the
 * machine kinds stay host-side, the scan-clean law), the nine intake
 * fields with the ask-next-field capture UX (askNextField → the question
 * renders → a text answer → capture → the detail refreshes), the compiled
 * 11-key intent (read-only), the presented preview + the two-act approve
 * flow (./PaymentMissionsPreviewCard.tsx), the armed card + the two-act
 * dispatch flow (./PaymentMissionsArmedCard.tsx, P19-B), the reconcile
 * card + the two-act evidence entry (./PaymentMissionsReconcileCard.tsx,
 * P20-B — beside the armed card), the plan-selection record and the
 * attempt states (people-language outcomes — ADR-0011 D3).
 *
 * The captured intake values render DEFENSIVELY: the per-field typed
 * shapes stay host-side, so this surface formats what it recognizes and
 * says "captured as recorded" otherwise — it never guesses, converts or
 * defaults a value (no money arithmetic ever happens here — INV-01).
 */

import { PaymentMissionsArmedCard } from "./PaymentMissionsArmedCard.js";
import { PaymentMissionsPreviewCard } from "./PaymentMissionsPreviewCard.js";
import { PaymentMissionsReconcileCard } from "./PaymentMissionsReconcileCard.js";
import { PaymentMissionsVerifyCard } from "./PaymentMissionsVerifyCard.js";
import type { PaymentMissionsDispatchWiring } from "./paymentMissionsDispatchPins.js";
import type { PaymentMissionsReconcileWiring } from "./paymentMissionsReconcilePins.js";
import type { PaymentMissionsVerifyWiring } from "./paymentMissionsVerifyPins.js";
import {
  PAYMENT_MISSIONS_ATTEMPT_OPERATION_LABELS,
  PAYMENT_MISSIONS_ATTEMPT_OUTCOME_LABELS,
  PAYMENT_MISSIONS_FIELD_IDS_PIN,
  PAYMENT_MISSIONS_INTAKE_COMPLETE_NOTE,
  PAYMENT_MISSIONS_INTAKE_NOTE,
  PAYMENT_MISSIONS_TIMELINE_NOTE,
  type PaymentMissionsDetailState,
} from "./paymentMissionsPins.js";

export interface PaymentMissionsDetailProps {
  /** The detail interaction state (the mount owns it; this component projects it). */
  readonly state: PaymentMissionsDetailState;
  /** The honest flow-error line (surfaced, never masked). */
  readonly flowError: string | null;
  readonly onBack?: () => void;
  readonly onAskNextField?: (missionId: string) => void;
  readonly onCapture?: (missionId: string, fieldId: string, value: string) => void;
  readonly onPresentPreview?: (missionId: string) => void;
  readonly onEngageApproval?: (missionId: string) => void;
  readonly onResolveApproval?: (requestId: string, decision: "APPROVE" | "DECLINE") => void;
  /** The dispatch-flow wiring (null/absent when the bound port lacks the dispatch members — P19-B). */
  readonly dispatch?: PaymentMissionsDispatchWiring | null;
  /** The reconcile-flow wiring (null/absent when the bound port lacks the reconciliation members — P20-B). */
  readonly reconcile?: PaymentMissionsReconcileWiring | null;
  /** The verify-flow wiring (null/absent when the bound port lacks the verify member — the P21-D reviewer-gate, Gap C; the card does not render). */
  readonly verify?: PaymentMissionsVerifyWiring | null;
}

/** The people-language names of the nine intake fields (string-keyed: the
 * ask's fieldId arrives as a channel string — an unknown id renders as
 * itself, never fabricated). */
const FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  amountAndCurrency: "Amount and currency",
  fundingSource: "Funding source",
  recipient: "Recipient",
  countryCorridor: "Country corridor",
  speedDeadline: "Speed deadline",
  feeCap: "Fee cap",
  purpose: "Purpose",
  privacyCompliance: "Privacy and compliance",
  partialPaymentPreference: "Partial payment preference",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function amountLine(value: unknown): string {
  return isRecord(value) && typeof value.currency === "string" && typeof value.minorUnits === "string"
    ? `${value.minorUnits} ${value.currency} (exact minor units)`
    : "captured as recorded";
}

/** The defensive, people-language render of one captured value (never a guess, never arithmetic). */
function fieldValueLine(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!isRecord(value)) {
    return "captured as recorded";
  }
  if (typeof value.deadlineAt === "string") {
    return `arrive by ${value.deadlineAt}`;
  }
  if (value.kind === "CAPPED") {
    return `capped at ${amountLine(value.amount)}`;
  }
  if (value.kind === "UNCAPPED") {
    return "no cap — accepted explicitly";
  }
  if (value.kind === "CONSTRAINED") {
    return typeof value.notes === "string" ? value.notes : "constraints stated";
  }
  if (value.kind === "NONE_STATED") {
    return "none stated";
  }
  if (value.kind === "REQUIRE_FULL") {
    return "full settlement required";
  }
  if (value.kind === "ALLOW_PARTIAL") {
    return "partial settlement allowed";
  }
  if (
    typeof value.sourceCountry === "string" &&
    typeof value.destinationCountry === "string" &&
    typeof value.destinationCurrency === "string"
  ) {
    return `${value.sourceCountry} → ${value.destinationCountry}, arrival ${value.destinationCurrency}`;
  }
  if (typeof value.currency === "string" && typeof value.minorUnits === "string") {
    return amountLine(value);
  }
  return "captured as recorded";
}

/** One read-only intent fact line. */
function factLine(label: string, value: string): React.ReactNode {
  return (
    <li>
      <strong>{label}</strong> <span className="ps-num">{value}</span>
    </li>
  );
}

export function PaymentMissionsDetail({
  state,
  flowError,
  onBack,
  onAskNextField,
  onCapture,
  onPresentPreview,
  onEngageApproval,
  onResolveApproval,
  dispatch,
  reconcile,
  verify,
}: PaymentMissionsDetailProps): React.ReactNode {
  const { detail, ask } = state;
  const answerInputId = `ps-agent-missions-answer-${detail.id}`;
  // Const locals so the narrowed ask survives into the form's closures.
  const askedField = ask.phase === "ASKED" ? ask.fieldId : undefined;
  const askedQuestion = ask.phase === "ASKED" ? ask.question : undefined;
  return (
    <article className="ps-agent-missions-detail" aria-label="Payment mission detail">
      <div className="ps-agent-missions-detail-head">
        <p className="ps-agent-missions-detail-title">
          <span className="ps-agent-missions-direction ps-num">{detail.direction}</span> —{" "}
          {detail.goalStatement}
        </p>
        <span
          className={`ps-agent-missions-status ps-agent-missions-status--${
            detail.status === "COMPLETED" ? "ok" : "unknown"
          }`}
        >
          {detail.status}
        </span>
      </div>
      {onBack !== undefined ? (
        <button
          type="button"
          className="ps-agent-missions-headact"
          data-ps-missions-act="BACK"
          data-testid="ps-agent-missions-back"
          onClick={onBack}
        >
          Back to the board
        </button>
      ) : null}
      <p className="ps-agent-missions-meta ps-num">
        {detail.id} · created {detail.createdAt} · updated {detail.updatedAt} · origin{" "}
        {detail.origin}
      </p>

      <section className="ps-agent-missions-section" id="ps-agent-missions-section-timeline">
        <h4 className="ps-agent-missions-section-title">Timeline</h4>
        <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_TIMELINE_NOTE}</p>
        <ol className="ps-agent-missions-timeline">
          {detail.events.map((event) => (
            <li key={event.id}>
              <span className="ps-num">{event.at}</span> <span>{event.summary}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="ps-agent-missions-section" id="ps-agent-missions-section-intake">
        <h4 className="ps-agent-missions-section-title">Intake — the nine questions</h4>
        <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_INTAKE_NOTE}</p>
        <ul className="ps-agent-missions-fields">
          {PAYMENT_MISSIONS_FIELD_IDS_PIN.map((fieldId) => {
            const field = detail.fields[fieldId];
            return (
              <li key={fieldId}>
                <strong>{FIELD_LABELS[fieldId]}</strong>
                {field.status === "CAPTURED" ? (
                  <span>: {fieldValueLine(field.value)}</span>
                ) : (
                  <span className="ps-agent-missions-missing">: missing</span>
                )}
              </li>
            );
          })}
        </ul>
        {askedField !== undefined && askedQuestion !== undefined ? (
          <form
            className="ps-agent-missions-ask"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const answer = String(data.get("ps-agent-missions-answer") ?? "");
              if (answer.trim().length > 0) {
                onCapture?.(detail.id, askedField, answer);
              }
            }}
          >
            <p className="ps-agent-missions-question">{askedQuestion}</p>
            <label className="ps-agent-missions-answer-label" htmlFor={answerInputId}>
              Your answer — {FIELD_LABELS[askedField] ?? askedField}
            </label>
            <input
              id={answerInputId}
              name="ps-agent-missions-answer"
              className="ps-agent-missions-answer"
              type="text"
              autoComplete="off"
            />
            {onCapture !== undefined ? (
              <button
                type="submit"
                className="ps-agent-missions-act"
                data-ps-missions-act="CAPTURE"
                data-testid="ps-agent-missions-capture"
              >
                Record the answer
              </button>
            ) : null}
          </form>
        ) : ask.phase === "ASKING" ? (
          <p className="ps-agent-missions-empty" role="status">
            Asking for the next question…
          </p>
        ) : ask.phase === "CAPTURING" ? (
          <p className="ps-agent-missions-empty" role="status">
            Recording the answer…
          </p>
        ) : ask.phase === "COMPLETE" ? (
          <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_INTAKE_COMPLETE_NOTE}</p>
        ) : onAskNextField !== undefined ? (
          <button
            type="button"
            className="ps-agent-missions-act"
            data-ps-missions-act="ASK_NEXT"
            data-testid="ps-agent-missions-ask"
            onClick={() => onAskNextField(detail.id)}
          >
            Answer the next question
          </button>
        ) : null}
      </section>

      {detail.intent !== undefined ? (
        <section className="ps-agent-missions-section" id="ps-agent-missions-section-intent">
          <h4 className="ps-agent-missions-section-title">Compiled intent — the 11-key record</h4>
          <ul className="ps-agent-missions-plainlist">
            {factLine("intent id:", detail.intent.intentId)}
            {factLine("principal:", detail.intent.principalRef)}
            {factLine(
              "origin:",
              `${detail.intent.origin.locationRef} (${detail.intent.origin.currency}, observed ${detail.intent.origin.observationRef})`,
            )}
            {factLine(
              "destination:",
              `${detail.intent.destination.locationRef} (${detail.intent.destination.currency}, observed ${detail.intent.destination.observationRef})`,
            )}
            {factLine(
              "origin amount:",
              `${detail.intent.originAmount.minorUnits} ${detail.intent.originAmount.currency} (exact minor units)`,
            )}
            {factLine("arrival currency:", detail.intent.arrivalCurrency)}
            {factLine(
              "constraints:",
              `settle within ${String(detail.intent.constraints.maxSettlementMs)}ms · at most ${String(detail.intent.constraints.maxRouteHops)} hops`,
            )}
            {factLine("lineage reference:", detail.intent.intentAuthorizationRef)}
            {factLine("declared at (ms):", String(detail.intent.declaredAt))}
            {factLine("expires at (ms):", String(detail.intent.expiresAt))}
            {factLine("commerce reference:", detail.intent.commerceRef)}
          </ul>
        </section>
      ) : null}

      <PaymentMissionsPreviewCard
        missionId={detail.id}
        preview={state.preview}
        presenting={state.presenting}
        approval={state.approval}
        onPresentPreview={onPresentPreview}
        onEngageApproval={onEngageApproval}
        onResolveApproval={onResolveApproval}
      />

      <PaymentMissionsArmedCard
        missionId={detail.id}
        approvalGranted={
          state.approval.phase === "RESOLVED" && state.approval.resolution?.outcome === "GRANTED"
        }
        dispatch={dispatch}
      />

      {/* The reconcile section beside the armed card (P20-B): the pending
       * card drives it — the section renders whenever the port supports
       * it (the empty card IS the designed state), and a mission whose
       * attempts look unresolved states the honest gap when it does not. */}
      <PaymentMissionsReconcileCard
        missionId={detail.id}
        unresolvedAttempts={
          (detail.attempts ?? []).some(
            (attempt) => attempt.outcome === "OUTCOME_UNKNOWN" || attempt.outcome === "STARTED",
          )
        }
        reconcile={reconcile}
      />

      {/* The verify section beside the reconcile card (the P21-D
       * reviewer-gate, Gap C): SINGLE-ACT — it renders only when the
       * LATEST attempt is CONFIRMED and carries NO typed verification
       * fact (a RECONCILED outcome means provider evidence already
       * closed an ambiguity — the reconciliation surface owns that
       * case), and only when the bound port carries the verify member
       * (an absent member keeps it unrendered — never a dead button). */}
      {(() => {
        const attempts = detail.attempts ?? [];
        const latest = attempts[attempts.length - 1];
        if (latest === undefined || verify == null) {
          return null;
        }
        // The act is offerable while the latest attempt is CONFIRMED and
        // carries no typed verification fact; once the fact lands, the
        // card withdraws the affordance and only the flow's outcome note
        // remains (the honest post-state).
        const available =
          latest.outcome === "CONFIRMED" && latest.verification === undefined;
        const outcomeForLatest = verify.state.outcome?.attemptId === latest.attemptId;
        if (!available && !outcomeForLatest) {
          return null;
        }
        return (
          <PaymentMissionsVerifyCard
            missionId={detail.id}
            attemptId={latest.attemptId}
            available={available}
            verify={verify}
          />
        );
      })()}

      {detail.planSelection !== undefined ? (
        <section className="ps-agent-missions-section" id="ps-agent-missions-section-plan">
          <h4 className="ps-agent-missions-section-title">Selected plan — a record, never an authorization</h4>
          <ul className="ps-agent-missions-plainlist">
            {factLine("plan:", detail.planSelection.planId)}
            {factLine("view digest:", detail.planSelection.viewDigest)}
            {factLine("routine:", `${detail.planSelection.routineId} v${detail.planSelection.routineVersion}`)}
            {factLine("selected at:", detail.planSelection.selectedAt)}
          </ul>
        </section>
      ) : null}

      {detail.attempts !== undefined && detail.attempts.length > 0 ? (
        <section className="ps-agent-missions-section" id="ps-agent-missions-section-attempts">
          <h4 className="ps-agent-missions-section-title">Attempts — observed states</h4>
          <ul className="ps-agent-missions-plainlist">
            {detail.attempts.map((attempt) => (
              <li key={attempt.attemptId}>
                <span className="ps-num">{attempt.attemptId}</span> —{" "}
                {PAYMENT_MISSIONS_ATTEMPT_OPERATION_LABELS[attempt.operation] ?? "an operation"} (
                {attempt.executionMode.toLowerCase()} mode),{" "}
                {PAYMENT_MISSIONS_ATTEMPT_OUTCOME_LABELS[attempt.outcome] ?? "outcome recorded"}:{" "}
                {attempt.summary}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {flowError !== null ? (
        <p className="ps-agent-missions-note ps-agent-missions-note--error" role="alert">
          The last action was refused: {flowError} — nothing was changed by this surface; the
          refusal is surfaced, never masked.
        </p>
      ) : null}
    </article>
  );
}
