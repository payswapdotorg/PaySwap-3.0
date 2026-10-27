/**
 * PaySwap Desktop (P20-A, ADR-0013 D1/D2/D3) — the RECONCILIATION
 * channel contracts, split from ./payment-mission-contracts.ts for the
 * ≤400-line file law (the dispatch-contracts precedent): the
 * pending-reconciliation READ + the evidence-submission ACT's wire
 * shapes and member surface.
 *
 * THE CHANNEL LAW (ADR-0013):
 * - D1 — THE RUNTIME VERB STAYS THE ONLY CLOSER: no shape here closes
 *   an UNKNOWN by itself. The ACT validates at the edge, recomputes the
 *   pending set host-side AT ACT TIME, and then calls the runtime's
 *   reconcile() — the one path out of UNKNOWN. Its typed errors
 *   (RECONCILIATION_NOT_PENDING / RECONCILIATION_EVIDENCE_INVALID)
 *   rethrow through this channel unchanged.
 * - D2 — THE COURIER-NOT-SOURCE LAW: the source vocabulary is the
 *   runtime's frozen two-kind set, echoed VERBATIM so the UI renders
 *   exactly what is enterable; the operator TRANSCRIBES provider
 *   evidence (they pick WHICH kind they are transcribing and supply the
 *   provider-side reference strings) — no operator provenance kind is
 *   ever grown here. The non-empty bounded refs floor ("reconciliation
 *   never closes on a bare assertion") is the enforcing edge.
 * - D3 — THE SAME-RULE PENDING DERIVATION: the pending set derives by
 *   the runtime's own attemptIsUnresolved rule (refused → not pending,
 *   reconciled → not pending, no-envelope → pending, envelope UNKNOWN →
 *   pending). No parallel derivation, no cached list, no derived store.
 * - NO envelope internals, NO idempotency/command/correlation ids, NO
 *   connectionRef and NO artifact ids exist on any shape here; the
 *   evidence refs NEVER echo as structure (they live in the runtime's
 *   reconciliation record and cross as timeline-event prose only).
 * - Fail-closed: both members throw the typed
 *   PaymentPlaneNotConfiguredError when the runtime was not composed.
 */

// ---------------------------------------------------------------------------
// The frozen source-kind vocabulary (ADR-0013 D2 — the mirror law)
// ---------------------------------------------------------------------------

/**
 * The frozen provider-evidence source vocabulary. THE MIRROR LAW: this
 * set mirrors the runtime's PaymentReconciliationEvidence["source"]
 * union VERBATIM (payments/payment-dispatch-runtime.ts) — this channel
 * can never grow a source kind the runtime's reconcile verb would
 * reject, and the READ echoes it so the UI renders exactly what is
 * enterable. The operator is the COURIER of provider evidence, never
 * its source: no operator/UI provenance kind exists on this plane.
 */
export const PAYMENT_RECONCILIATION_SOURCE_KINDS = [
  "EXTERNAL_PROVIDER_STATEMENT",
  "EXTERNAL_PROVIDER_RETRIEVAL",
] as const;
export type PaymentReconciliationSourceKind =
  (typeof PAYMENT_RECONCILIATION_SOURCE_KINDS)[number];

// ---------------------------------------------------------------------------
// The pending-reconciliation wire shapes (ADR-0013 D1/D3 — the READ)
// ---------------------------------------------------------------------------

/**
 * One attempt pending reconciliation on the wire (ADR-0013 D1):
 * people-language facts only — which attempt, when it started, what it
 * was doing, under which INV-25 mode, and a summary phrased for the
 * operator. NO envelope internals, NO connection ref, NO lineage ids.
 */
export interface PaymentMissionPendingAttemptDto {
  readonly attemptId: string;
  /** ISO-8601 UTC instant (when the write-ahead persisted). */
  readonly startedAt: string;
  readonly operation: "CREATE_EXTERNAL_EFFECT" | "CANCEL_OR_REVERSE_EFFECT";
  readonly executionMode: "SANDBOX" | "LIVE";
  /** People language (the honest unknown-or-never-answered phrasing). */
  readonly summary: string;
}

/**
 * The pending-reconciliation card (ADR-0013 D1 — the READ): the
 * attempts whose outcome is unknown or was never answered, derived
 * host-side by the runtime's own unresolved rule (D3 — the card is
 * computed per read from the same records the runtime enforces over,
 * never a cached or parallel state); the acceptedSources echo (the
 * frozen vocabulary verbatim, so the evidence entry renders exactly
 * what is enterable); and the honest people-language note.
 */
export interface PaymentMissionPendingReconciliationDto {
  readonly pending: readonly PaymentMissionPendingAttemptDto[];
  readonly acceptedSources: readonly PaymentReconciliationSourceKind[];
  readonly note: string;
}

// ---------------------------------------------------------------------------
// The evidence-submission wire shapes (ADR-0013 D1/D2 — the ACT)
// ---------------------------------------------------------------------------

/**
 * The evidence triple the reconcile act submits (ADR-0013 D2): the
 * direction the provider evidence closes the unknown outcome to (the
 * operator's transcription — the member never guesses or derives it),
 * WHICH kind of provider evidence is being transcribed, and the
 * provider-side reference strings. Mirrors the runtime's
 * PaymentReconciliationEvidence shape 1:1.
 */
export interface PaymentMissionReconcileEvidenceDto {
  readonly resolvedTo: "CONFIRMED" | "FAILED";
  readonly source: PaymentReconciliationSourceKind;
  /** Non-empty; each ref 1..512 chars (the runtime's own bounds). */
  readonly evidenceRefs: readonly string[];
}

/**
 * The full evidence-submission input (ADR-0013 D1): the addressing key
 * (which pending attempt) + the evidence triple — the single shape the
 * evidence entry composes and validates (the confirm stays
 * disabled-until-valid). The channel member takes the addressing key as
 * its own parameter, so the act is (missionId, attemptId, evidence).
 */
export interface PaymentMissionReconcileInputDto extends PaymentMissionReconcileEvidenceDto {
  readonly attemptId: string;
}

/**
 * The typed reconciliation outcome on the wire (ADR-0013 D1): outcome
 * facts ONLY — the addressing echo, the resolved direction and a
 * people-language summary. The evidence refs NEVER echo as structure on
 * this or any successor shape: they live in the runtime's
 * reconciliation record and cross as timeline-event prose only (the
 * existing law). Failures beyond this outcome (unknown mission, an
 * attempt outside the host-recomputed pending set, invalid evidence, a
 * double reconcile) are THROWN typed PaymentMissionError — the
 * channel's established fail-closed discipline.
 */
export interface PaymentMissionReconciliationOutcomeDto {
  readonly attemptId: string;
  readonly resolvedTo: "CONFIRMED" | "FAILED";
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// The member surface (the evidence submission — the runtime verb stays
// the only closer)
// ---------------------------------------------------------------------------

/**
 * The reconciliation channel members (P20-A, ADR-0013 D1). Both fail
 * closed with the typed PaymentPlaneNotConfiguredError when the host
 * composed no payment-mission runtime. The act's actor is pinned at the
 * channel edge (see ./reconcile-members.ts): the renderer supplies ONLY
 * the mission id, the attempt id and the evidence — never an origin or
 * a principal.
 */
export interface IPaySwapDesktopReconcileMembers {
  /**
   * The pending-reconciliation READ (ADR-0013 D1/D3): the pending card
   * — the unresolved attempts by the runtime's own rule, the
   * accepted-sources echo (the frozen vocabulary verbatim) and the
   * honest people-language note. Nothing on this card closes anything.
   */
  paymentMissionPendingReconciliation(
    missionId: string,
  ): Promise<PaymentMissionPendingReconciliationDto>;

  /**
   * The evidence-submission ACT (ADR-0013 D1/D2): the operator's
   * transcription of provider evidence. The pending set is recomputed
   * HOST-SIDE at act time — an attemptId outside it is the typed
   * INVALID_FIELD_VALUE refusal BEFORE any runtime call ("no
   * reconciliation was recorded", nothing changed). The evidence bounds
   * validate at the edge by the runtime's own bounds (source ∈ the
   * frozen vocabulary; refs non-empty, each 1..512) BEFORE the runtime
   * call. The runtime's reconcile() is then the ONLY closer; its typed
   * errors rethrow through unchanged. The outcome carries facts only.
   */
  paymentMissionReconcile(
    missionId: string,
    attemptId: string,
    evidence: PaymentMissionReconcileEvidenceDto,
  ): Promise<PaymentMissionReconciliationOutcomeDto>;
}
