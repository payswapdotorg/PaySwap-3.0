/**
 * @payswap/app — STRUCTURAL PINS of the payment-missions VERIFICATION
 * surface (the P21-D reviewer-gate, Gap C — the single-act authoritative
 * read-back affordance).
 *
 * MIRROR DISCIPLINE (the paymentMissionsDispatchPins.ts /
 * paymentMissionsReconcilePins.ts pattern, product law P2): @payswap/app
 * src NEVER imports a @payswap/* workspace package or the desktop host —
 * every cross-package surface is pinned STRUCTURALLY here. The mirrored
 * source of record is the payswap-desktop verification member
 * (paymentMissionVerifyAttempt) — READ-ONLY reference, never imported;
 * the renderer composition binds the REAL channel member behind the
 * composed port below and reconciles any drift.
 *
 * LAWS (the reviewer's Gap C contract): the verify act is ONE explicit
 * act — the HOST performs the authoritative provider read-back inside
 * the credential seal (no evidence entry exists on this surface; no
 * ambiguity ever existed on a CONFIRMED attempt). The verification is a
 * typed persisted fact on the attempt record, NEVER a new outcome (the
 * attempt-outcome vocabulary stays frozen at its six values) and NEVER a
 * substitute for reconciliation (an ambiguous outcome must remain
 * UNKNOWN and require the actual reconciliation path — the host refuses
 * such a verification typed and the refusal propagates to this
 * surface's flow-error line, never masked). The outcome DTO carries
 * facts ONLY: no connectionRef echo, no provider internals beyond the
 * observed status. ZERO ambient clock/random — every instant arrives on
 * a DTO. THE SCAN-CLEAN LAW: no pinned string below carries an
 * authority-surface machine literal — people language only.
 */

import type { PaymentMissionsPort } from "./paymentMissionsPins.js";

/* ==== the DTO pin (the verification outcome — facts only) ==== */

/**
 * The typed verification outcome (mirrors the host DTO): the addressing
 * echo, the provider status the authoritative read-back observed, the
 * verification instant and a people-language summary. Every
 * non-verifiable state is a THROWN typed error (propagated to the
 * surface's flow-error line, never masked, never a fabricated outcome).
 */
export interface PaymentMissionsAttemptVerification {
  readonly attemptId: string;
  /** Always true on this outcome — a refusal throws instead. */
  readonly verified: true;
  /** The provider status the read-back observed (e.g. "succeeded"). */
  readonly readBackStatus: string;
  readonly verifiedAt: string;
  readonly summary: string;
}

/* ==== THE PORT EXTENSION (the composed verification seam) ==== */

/**
 * The verification-capable payment-missions port (the P21-D reviewer-gate,
 * Gap C): the pinned port plus the single verify member, composed as a
 * NEW interface so the P18 pins stay untouched (the dispatch/reconcile
 * split precedents). The mount resolves it through the structural guard
 * below — a port lacking the member keeps the verify card UNRENDERED
 * (the honest unbound tier, never a dead button).
 */
export interface PaymentMissionsPortWithVerification extends PaymentMissionsPort {
  /**
   * Verify a CONFIRMED attempt through the authoritative provider
   * read-back: the host performs the retrieval inside the credential
   * seal over the attempt's own recorded facts. A read-back that agrees
   * appends the typed persisted verification fact; an ambiguous attempt
   * refuses typed (the reviewer's law) and the refusal propagates.
   */
  verifyAttempt(missionId: string, attemptId: string): Promise<PaymentMissionsAttemptVerification>;
}

/** True iff the port carries the verify member (structural — the composition root may bind any port-shaped object). */
export function isPaymentMissionsVerificationPort(
  port: PaymentMissionsPort,
): port is PaymentMissionsPortWithVerification {
  return typeof (port as { verifyAttempt?: unknown }).verifyAttempt === "function";
}

/* ==== the single-act flow's phases + state (mount-owned) ==== */

/**
 * The verify flow's phases — THE SINGLE-ACT LAW is structural: IDLE →
 * VERIFYING (the one explicit act) → VERIFIED. A THROWN typed failure
 * returns the flow to IDLE with the honest error prose on the mount's
 * flow-error line; a resolved outcome lands the verified note while the
 * detail re-reads honestly (the verified attempt state carries the
 * typed fact, so the card no longer renders — the honest post-state).
 */
export const PAYMENT_MISSIONS_VERIFY_PHASES = Object.freeze([
  "IDLE", "VERIFYING", "VERIFIED",
] as const);
export type PaymentMissionsVerifyPhase = (typeof PAYMENT_MISSIONS_VERIFY_PHASES)[number];

/** The verify flow's state (the mount owns it; the card projects it). */
export interface PaymentMissionsVerifyState {
  readonly phase: PaymentMissionsVerifyPhase;
  /** The addressed attempt (the CONFIRMED-unverified one). */
  readonly attemptId?: string;
  /** The latest verification outcome (absent until one resolves). */
  readonly outcome?: PaymentMissionsAttemptVerification;
}

/** The verify-flow wiring the mount projects down through the panel + the detail to the verify card. */
export interface PaymentMissionsVerifyWiring {
  readonly state: PaymentMissionsVerifyState;
  /** The one explicit act — fires verifyAttempt with EXACTLY (missionId, attemptId). */
  readonly onVerify: (missionId: string, attemptId: string) => void;
}

/* ==== the pinned honest note (scan-clean people language) ==== */

/** The single-act card's note (the reviewer's contract, in people language). */
export const PAYMENT_MISSIONS_VERIFICATION_CARD_NOTE =
  "The host performs the authoritative read-back inside the credential seal — no evidence transcription, one explicit act; verification never substitutes for reconciliation." as const;
