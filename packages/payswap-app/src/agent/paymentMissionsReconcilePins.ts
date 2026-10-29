/**
 * @payswap/app — STRUCTURAL PINS of the payment-missions RECONCILIATION
 * surface (P20-B, ADR-0013 D1/D2/D3 — the pending-reconciliation read +
 * the two-act evidence-entry flow).
 *
 * MIRROR DISCIPLINE (the paymentMissionsDispatchPins.ts pattern, product
 * law P2): @payswap/app src NEVER imports a @payswap/* workspace package
 * or the desktop host — every cross-package surface is pinned
 * STRUCTURALLY here. The mirrored source of record is the payswap-desktop
 * reconciliation members (ADR-0013 D1: paymentMissionPendingReconciliation
 * / paymentMissionReconcile) — READ-ONLY reference, never imported; the
 * TL's renderer composition (P20-C) binds the REAL channel members
 * behind the composed port below and reconciles any drift.
 *
 * LAWS (ADR-0013): the reconcile act crosses ONLY as an evidence
 * submission over the host-recomputed pending set — the runtime verb
 * stays the ONLY closer of an unknown outcome, and this surface never
 * guesses a direction and never fabricates provider evidence (D2: the
 * operator is the COURIER of the provider's evidence, not its source).
 * The resolution directions and the source kinds are DATA, rendered only
 * through the people-language label maps below — never as authored prose
 * (the scan-clean law). The evidence refs never echo as structure on any
 * outcome shape. ZERO ambient clock/random — every instant arrives on a
 * DTO.
 */

import type { PinnedCorridorLegKind } from "../pins/corridor-pins.js";
import type { PaymentMissionsPort } from "./paymentMissionsPins.js";

/* ==== the frozen reconciliation vocabularies (ADR-0013 D2) ==== */

/** The resolution directions the operator transcribes (mirrors the
 * runtime's evidence resolvedTo union) — DATA ONLY: the UI renders them
 * through the label map below (the scan-clean law). */
export const PAYMENT_MISSIONS_RECONCILIATION_DIRECTIONS = Object.freeze([
  "CONFIRMED", "FAILED",
] as const);
export type PaymentMissionsReconciliationDirection =
  (typeof PAYMENT_MISSIONS_RECONCILIATION_DIRECTIONS)[number];

/** The evidence source kinds (mirrors the runtime's frozen two-kind
 * vocabulary VERBATIM): the operator selects WHICH kind of provider
 * evidence they are transcribing — the courier-not-source law (D2). */
export const PAYMENT_MISSIONS_RECONCILIATION_SOURCES = Object.freeze([
  "EXTERNAL_PROVIDER_STATEMENT", "EXTERNAL_PROVIDER_RETRIEVAL",
] as const);
export type PaymentMissionsReconciliationSource =
  (typeof PAYMENT_MISSIONS_RECONCILIATION_SOURCES)[number];

/** The people-language renders of the resolution directions (the label
 * map — the raw direction NEVER renders as prose). */
export const PAYMENT_MISSIONS_RECONCILIATION_DIRECTION_LABELS: Readonly<
  Record<PaymentMissionsReconciliationDirection, string>
> = Object.freeze({
  CONFIRMED: "confirmed — the effect stands, as the provider evidence records it",
  FAILED: "failed — no effect stands, as the provider evidence records it",
});

/** The people-language renders of the evidence source kinds (the label
 * map — the raw kind NEVER renders as prose). */
export const PAYMENT_MISSIONS_RECONCILIATION_SOURCE_LABELS: Readonly<
  Record<PaymentMissionsReconciliationSource, string>
> = Object.freeze({
  EXTERNAL_PROVIDER_STATEMENT: "a provider statement",
  EXTERNAL_PROVIDER_RETRIEVAL: "a provider retrieval",
});

/* ==== the DTO pins (ADR-0013 D1 — the read + the act's input/output) ==== */

/** One pending attempt on the read (mirrors the ADR-0013 D1 pending
 * entry): attempt facts only — NO envelope internals, NO idempotency /
 * command / correlation ids, NO connectionRef, NO artifact ids.
 * (P22-B, ADR-0016 D6) `legIndex`/`legKind` are the additive per-leg
 * attribution: a corridor leg UNKNOWN shows the pending-reconciliation
 * card NAMING the leg (the partial-failure presentation). */
export interface PaymentMissionsPendingAttempt {
  readonly attemptId: string;
  readonly startedAt: string;
  readonly operation: string;
  readonly executionMode: "SANDBOX" | "LIVE";
  readonly summary: string;
  /** Present only on a corridor leg's attempt — never fabricated. */
  readonly legIndex?: number;
  readonly legKind?: PinnedCorridorLegKind;
}

/** The pending-reconciliation card (mirrors the ADR-0013 D1 read): the
 * pending attempts derived by the runtime's OWN rule, the
 * accepted-sources echo (the frozen vocabulary — the UI renders exactly
 * what is enterable) and the host's people-language note. */
export interface PaymentMissionsPendingReconciliation {
  readonly pending: readonly PaymentMissionsPendingAttempt[];
  readonly acceptedSources: readonly PaymentMissionsReconciliationSource[];
  readonly note: string;
}

/** The reconcile act's evidence input (mirrors the runtime's evidence
 * shape): the transcribed direction + source + the provider-side
 * reference strings (non-empty and bounded — validated at the host edge). */
export interface PaymentMissionsReconcileEvidence {
  readonly resolvedTo: PaymentMissionsReconciliationDirection;
  readonly source: PaymentMissionsReconciliationSource;
  readonly evidenceRefs: readonly string[];
}

/** The reconcile outcome (mirrors the ADR-0013 D1 outcome DTO): outcome
 * facts only — the addressing echo, the resolved direction and the
 * people-language summary. The evidence refs NEVER echo as structure. */
export interface PaymentMissionsReconcileOutcome {
  readonly attemptId: string;
  readonly resolvedTo: PaymentMissionsReconciliationDirection;
  readonly summary: string;
}

/* ==== THE PORT EXTENSION (the composed reconciliation seam) ==== */

/** The reconciliation-capable payment-missions port (ADR-0013 D1): the
 * P18 port plus the two reconciliation members, composed as a NEW
 * interface so the P18 pins stay untouched (the dispatch-pins split
 * precedent). The mount resolves it through the structural guard below —
 * a port lacking the members renders the honest reconciliation-
 * unavailable note on the reconcile section, never an error. */
export interface PaymentMissionsPortWithReconciliation extends PaymentMissionsPort {
  /** The pending-reconciliation read (the pending card's data): the
   * host-derived pending attempts, the accepted sources, the honest note. */
  pendingReconciliation(missionId: string): Promise<PaymentMissionsPendingReconciliation>;
  /** The evidence-submission act: the host recomputes the pending set AT
   * ACT TIME — an outside attemptId is the typed refusal BEFORE any
   * runtime call. The runtime verb stays the ONLY closer. */
  reconcile(
    missionId: string,
    attemptId: string,
    evidence: PaymentMissionsReconcileEvidence,
  ): Promise<PaymentMissionsReconcileOutcome>;
}

/** True iff the port carries the two reconciliation members (structural —
 * the composition root may bind any port-shaped object; a port without
 * them fails this check and the section states the gap honestly). */
export function isPaymentMissionsReconciliationPort(
  port: PaymentMissionsPort,
): port is PaymentMissionsPortWithReconciliation {
  const candidate = port as { pendingReconciliation?: unknown; reconcile?: unknown };
  return (
    typeof candidate.pendingReconciliation === "function" &&
    typeof candidate.reconcile === "function"
  );
}

/* ==== the two-act evidence-entry flow's phases + state (mount-owned) ==== */

/** The reconcile flow's phases — THE TWO-ACT LAW is structural: the
 * pending card renders when the read lands (IDLE → PENDING_CARD), the
 * evidence entry exists only after the operator engages the reconcile
 * control over it (PENDING_CARD → EVIDENCE_ENTRY), and the submission
 * fires only from the entry (EVIDENCE_ENTRY → SUBMITTING). A THROWN
 * typed failure returns the flow to the entry with every entered fact
 * intact; a resolved outcome lands the reconciled note while the pending
 * card re-reads honestly. */
export const PAYMENT_MISSIONS_RECONCILE_PHASES = Object.freeze([
  "IDLE", "PENDING_CARD", "EVIDENCE_ENTRY", "SUBMITTING", "RESOLVED",
] as const);
export type PaymentMissionsReconcilePhase =
  (typeof PAYMENT_MISSIONS_RECONCILE_PHASES)[number];

/** The reconcile flow's state (the mount owns it; the card projects it). */
export interface PaymentMissionsReconcileState {
  readonly phase: PaymentMissionsReconcilePhase;
  /** The loaded pending card (absent until the read returns). */
  readonly pending?: PaymentMissionsPendingReconciliation;
  /** The addressed attempt (the unambiguous single pending attempt at
   * the engage, or the operator's explicit choice when the read lists
   * several — never a guess). */
  readonly attemptId?: string;
  /** The transcribed direction (absent until chosen). */
  readonly direction?: PaymentMissionsReconciliationDirection;
  /** The transcribed source kind (absent until chosen). */
  readonly source?: PaymentMissionsReconciliationSource;
  /** The raw references entry (one reference per non-empty trimmed line). */
  readonly refsText?: string;
  /** The latest reconcile outcome (absent until one resolves). */
  readonly outcome?: PaymentMissionsReconcileOutcome;
}

/** The reconcile-flow wiring the mount projects down through the panel +
 * the detail to the reconcile card (the armed-card props pattern). */
export interface PaymentMissionsReconcileWiring {
  readonly state: PaymentMissionsReconcileState;
  readonly onEngage: (missionId: string) => void;
  readonly onChooseAttempt: (attemptId: string) => void;
  readonly onChooseDirection: (direction: PaymentMissionsReconciliationDirection) => void;
  readonly onChooseSource: (source: PaymentMissionsReconciliationSource) => void;
  readonly onEditRefs: (text: string) => void;
  readonly onSubmit: (missionId: string) => void;
  readonly onCancel: () => void;
}

/** The trimmed, non-empty reference lines of the entry (the confirm's
 * validity floor + the submit's input derivation — never a guess). */
export function reconcileRefsOf(refsText: string | undefined): readonly string[] {
  return (refsText ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/* ==== the pinned honest notes (scan-clean people language) ==== */

/** The reconciliation-unavailable seam truth (a port without the members
 * is bound — the act cannot even be offered). */
export const PAYMENT_MISSIONS_RECONCILIATION_UNAVAILABLE_NOTE =
  "The reconciliation act is not wired in this deployment — an unknown outcome cannot be closed from here. The platform host binds the reconciliation members at its composition root; until then this surface states the gap instead of acting." as const;

/** The two-act law of the evidence entry, in people language (ADR-0013 D1). */
export const PAYMENT_MISSIONS_RECONCILE_TWO_ACT_NOTE =
  "Two explicit acts, exactly as the reconciliation law requires: review the pending attempt's facts, then enter the provider evidence and confirm. Nothing is closed until you confirm it here." as const;

/** The courier-not-source law, in people language (ADR-0013 D2). */
export const PAYMENT_MISSIONS_RECONCILE_COURIER_NOTE =
  "You are the courier of the provider's evidence, not its source: choose which kind you are transcribing and give the provider's own reference strings. This surface never invents evidence and never guesses a direction." as const;

/** The non-empty-refs floor, in people language (the runtime's own bound). */
export const PAYMENT_MISSIONS_RECONCILE_REFS_NOTE =
  "Each line below is one provider-side reference. Reconciliation never closes on a bare assertion — at least one non-empty reference is required before the confirm unlocks." as const;
