/**
 * PaySwap Desktop (P21-D reviewer-gate, Gap C) — the VERIFICATION channel
 * contracts, split from ./payment-mission-contracts.ts for the ≤400-line
 * file law (the dispatch-contracts/reconcile-contracts precedent): the
 * authoritative read-back verification act's wire shape and member
 * surface.
 *
 * THE CHANNEL LAW (the reviewer's Gap C contract):
 * - THE SINGLE ACT: the member takes ONLY (missionId, attemptId) — the
 *   host performs the authoritative provider read-back INSIDE the
 *   credential seal over the attempt's own recorded facts (its
 *   connection, its provider reference, its INV-25 mode). There is NO
 *   evidence entry on this surface (unlike the reconcile act): no
 *   operator transcription exists, because no ambiguity ever existed.
 *   The composed read-back port is supplied BY THE HOST at the service
 *   composition edge (the lane-aware Stripe read-back over the same
 *   connection + probe planes the dispatch authority rides).
 * - THE OUTCOME CARRIES FACTS ONLY: the addressing echo, the provider
 *   status the read-back observed, the verification instant and a
 *   people-language summary. NO connectionRef echo, NO provider
 *   internals beyond the observed status, NO envelope fields.
 * - THE TYPED REFUSALS PROPAGATE (never masked): an ambiguous attempt
 *   (UNKNOWN envelope) refuses with the runtime's typed
 *   VERIFICATION_REFUSED carrying the reviewer's law — "an ambiguous
 *   outcome must remain UNKNOWN and require the actual reconciliation
 *   path"; a read-back that disagrees or is itself ambiguous throws
 *   with NOTHING rewritten. The runtime verb is the only writer.
 * - Fail-closed: the member throws the typed
 *   PaymentPlaneNotConfiguredError when the payment-mission runtime was
 *   not composed, and when the connection + probe planes backing the
 *   read-back port were not composed (the workspace-store posture —
 *   never a fabricated verification masking a missing plane).
 */

/** The typed verification outcome on the wire (facts only). */
export interface PaymentMissionVerificationOutcomeDto {
  /** The verified attempt's id (the addressing echo). */
  readonly attemptId: string;
  /** Always true on this outcome — every non-verifiable state is a THROWN typed error. */
  readonly verified: true;
  /** The provider status the authoritative read-back observed (e.g. "succeeded"). */
  readonly readBackStatus: string;
  /** ISO-8601 UTC instant (stamped at the channel edge from the host clock). */
  readonly verifiedAt: string;
  /** People language (the read-back, the provider references, the observed status — never the word "reconciled"). */
  readonly summary: string;
}

/** The verification channel member (the single-act surface). */
export interface IPaySwapDesktopVerifyMembers {
  /**
   * Verify a CONFIRMED attempt through the AUTHORITATIVE provider
   * read-back (the P21-D reviewer-gate, Gap C): the host performs the
   * retrieval inside the credential seal over the attempt's own
   * recorded facts, and a read-back that agrees with the recorded
   * confirmation appends the ATTEMPT_VERIFIED event + the typed
   * persisted verification fact on the attempt record — the final
   * stage's completion contract for a confirmed attempt. An ambiguous
   * attempt NEVER verifies: it must remain UNKNOWN and require the
   * actual reconciliation path (the runtime's typed refusal carries the
   * law and propagates through this channel unchanged).
   */
  paymentMissionVerifyAttempt(
    missionId: string,
    attemptId: string,
  ): Promise<PaymentMissionVerificationOutcomeDto>;
}
