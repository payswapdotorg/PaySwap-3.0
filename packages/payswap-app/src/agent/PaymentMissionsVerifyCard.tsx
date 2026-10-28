/**
 * @payswap/app — THE VERIFY CARD (the P21-D reviewer-gate, Gap C): the
 * single-act authoritative read-back affordance, mirroring the P20-B
 * reconcile card's visual language but SINGLE-ACT — one explicit
 * button, NO evidence entry: the host performs the provider retrieval
 * inside the credential seal, because no ambiguity ever existed on a
 * CONFIRMED attempt.
 *
 * THE CARD'S GATE (the detail owns it): the card renders only when the
 * mission's LATEST attempt is CONFIRMED and carries NO typed
 * verification fact (an outcome of RECONCILED means provider evidence
 * already closed an ambiguity — the reconciliation surface owns that
 * case; this card never renders beside it) AND the bound port carries
 * the verify member (an absent member keeps the card unrendered — the
 * honest unbound tier, never a dead button).
 *
 * THE HONEST STATES: VERIFYING (the act is in flight — the control
 * disables), the typed-failure return (the flow returns to idle; the
 * honest error prose lands on the detail's flow-error line — never
 * masked, e.g. the reviewer's law for an attempt that turned out
 * ambiguous), and the verified outcome note (the ONLY aria-live region:
 * the observed provider status + the summary verbatim). A11y: a
 * labelled button with visible focus; absolute instants only.
 */

import {
  PAYMENT_MISSIONS_VERIFICATION_CARD_NOTE,
  type PaymentMissionsVerifyWiring,
} from "./paymentMissionsVerifyPins.js";

export interface PaymentMissionsVerifyCardProps {
  readonly missionId: string;
  /** The addressed attempt (the detail's latest — the CONFIRMED one, verified or not). */
  readonly attemptId: string;
  /** True while the addressed attempt is still CONFIRMED-unverified (the act is offerable); false once the typed fact landed — only the outcome note remains. */
  readonly available: boolean;
  /** The verify-flow wiring (null/absent when the bound port lacks the verify member — the card does not render). */
  readonly verify?: PaymentMissionsVerifyWiring | null;
}

/** The verified outcome note — the ONLY aria-live region on this surface. */
function PaymentMissionsVerifiedNote({
  outcome,
}: {
  readonly outcome: NonNullable<PaymentMissionsVerifyWiring["state"]["outcome"]>;
}): React.ReactNode {
  return (
    <p className="ps-agent-missions-note ps-agent-missions-note--granted" role="status">
      Verified by the authoritative read-back — the provider's own record reports &quot;
      {outcome.readBackStatus}&quot;. {outcome.summary}
    </p>
  );
}

export function PaymentMissionsVerifyCard({
  missionId,
  attemptId,
  available,
  verify,
}: PaymentMissionsVerifyCardProps): React.ReactNode {
  const wiring = verify ?? null;
  if (wiring === null) {
    // The honest unbound tier: no member, no card — never a dead button.
    return null;
  }
  const busy = wiring.state.phase === "VERIFYING";
  const outcome = wiring.state.outcome;
  return (
    <section
      className="ps-agent-missions-section"
      id="ps-agent-missions-section-verify"
      aria-label="Verification — the authoritative read-back of a confirmed attempt"
    >
      <h4 className="ps-agent-missions-section-title">
        Verification — the authoritative read-back
      </h4>
      {available ? (
        <div className="ps-agent-missions-reconcile" data-testid="ps-agent-missions-verify-card">
          <p className="ps-agent-missions-note">{PAYMENT_MISSIONS_VERIFICATION_CARD_NOTE}</p>
          {busy ? (
            <p className="ps-agent-missions-empty">
              Reading the provider&rsquo;s own record for the confirmed attempt…
            </p>
          ) : (
            <button
              type="button"
              className="ps-agent-missions-act ps-agent-missions-act--confirm"
              data-ps-missions-act="VERIFY_ATTEMPT"
              data-testid="ps-agent-missions-verify-submit"
              onClick={() => wiring.onVerify(missionId, attemptId)}
            >
              Verify with the provider&rsquo;s own record
            </button>
          )}
        </div>
      ) : null}
      {outcome !== undefined ? <PaymentMissionsVerifiedNote outcome={outcome} /> : null}
    </section>
  );
}
