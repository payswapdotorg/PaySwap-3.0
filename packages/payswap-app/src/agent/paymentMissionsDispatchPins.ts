/**
 * @payswap/app — STRUCTURAL PINS of the payment-missions DISPATCH
 * surface (P19-B, ADR-0012 D1/D2 — the armed card + the two-act
 * dispatch flow).
 *
 * MIRROR DISCIPLINE (the paymentMissionsPins.ts pattern, product law P2):
 * @payswap/app src NEVER imports a @payswap/* workspace package or the
 * desktop host — every cross-package surface is pinned STRUCTURALLY here.
 * The mirrored source of record is the payswap-desktop dispatch members
 * (ADR-0012 D1: paymentMissionArmedEffect / paymentMissionDispatch) —
 * READ-ONLY reference, never imported; the TL's renderer composition
 * (P19-C) binds the REAL channel members behind the composed port below
 * and reconciles any drift.
 *
 * LAWS (ADR-0012): the dispatch act crosses ONLY as a lane choice over
 * the host-recomputed eligible set — the wire carries a CHOICE, never a
 * grant, and the single-use authorization artifact NEVER crosses onto
 * any shape pinned here (no artifactId key exists below, not even as an
 * input). THE SCAN-CLEAN LAW (P16-D): the outcome kinds are DATA,
 * rendered only through the people-language label map — never as
 * authored prose. ZERO ambient clock/random — every instant arrives on
 * a DTO.
 */

import type { CorridorLaneLegAttributionPin } from "../pins/corridor-pins.js";
import type { PaymentMissionsApprovalScope, PaymentMissionsPort } from "./paymentMissionsPins.js";

/* ==== the execution-lane + armed-effect pins (ADR-0012 D1/D2) ==== */

/** One execution lane (mirrors the ADR-0012 D2 lane shape): the same ids
 * the Connections section shows the operator — no credentials, no
 * credential handles, no secrets ever appear. A lane listed with
 * `ineligible` stays VISIBLE but is not a choice (its reason renders,
 * never silently hidden).
 * (P22-B, ADR-0016 D6) `leg` is the additive per-leg attribution: a
 * composite plan's lane rows name the corridor leg they would ride
 * (leg index + kind + lane kind) — the per-leg dispatch surface. */
export interface PaymentMissionsExecLane {
  readonly connectionRef: string;
  readonly label: string;
  readonly providerId: string;
  readonly ineligible?: { readonly reason: string };
  /** Present only on a composite (plan-scoped) mission's lane — never fabricated. */
  readonly leg?: CorridorLaneLegAttributionPin;
}

/** The armed effect (mirrors the ADR-0012 D1 read): when an unconsumed,
 * unexpired approval artifact exists for the mission — armed true + the
 * scope echo (the P18 approval-scope shape) + the expiry instant + the
 * lanes; otherwise armed false + the people-language reason VERBATIM.
 * No artifactId ever appears on this shape. */
export interface PaymentMissionsArmedEffect {
  readonly armed: boolean;
  readonly reason?: string;
  readonly scope?: PaymentMissionsApprovalScope;
  readonly expiresAt?: string;
  readonly lanes: readonly PaymentMissionsExecLane[];
}

/** The dispatch outcome kinds (mirrors the ADR-0012 D1 act outcome) —
 * DATA ONLY: the UI renders them through the label map below, never as
 * authored prose (the scan-clean law). */
export const PAYMENT_MISSIONS_DISPATCH_OUTCOME_KINDS = Object.freeze([
  "DISPATCHED", "REPLAYED", "REFUSED",
] as const);
export type PaymentMissionsDispatchOutcomeKind =
  (typeof PAYMENT_MISSIONS_DISPATCH_OUTCOME_KINDS)[number];

/** The dispatch outcome (mirrors the ADR-0012 D1 outcome DTO): outcome
 * facts only — no artifactId, no connectionRef echo, no envelope
 * internals beyond the summary. */
export interface PaymentMissionsDispatchOutcome {
  readonly kind: PaymentMissionsDispatchOutcomeKind;
  readonly attemptId: string;
  readonly summary: string;
}

/** The people-language renders of the dispatch outcomes (the label map —
 * the raw kind NEVER renders as prose). */
export const PAYMENT_MISSIONS_DISPATCH_OUTCOME_LABELS: Readonly<
  Record<PaymentMissionsDispatchOutcomeKind, string>
> = Object.freeze({
  DISPATCHED: "The payment was sent",
  REPLAYED: "The payment was sent as a replay — an earlier attempt already carried this exact instruction",
  REFUSED: "The dispatch was refused",
});

/* ==== THE PORT EXTENSION (the composed dispatch seam) ==== */

/** The dispatch-capable payment-missions port (ADR-0012 D1): the P18
 * port plus the two dispatch members, composed as a NEW interface so
 * the P18 pins stay untouched. The mount resolves it through the
 * structural guard below — a P18-only port renders the honest
 * dispatch-unavailable note on the armed section, never an error. */
export interface PaymentMissionsPortWithDispatch extends PaymentMissionsPort {
  /** The armed-effect read (the armed card's data): the scope echo, the
   * expiry instant and the lanes — or the verbatim not-armed reason. */
  armedEffect(missionId: string): Promise<PaymentMissionsArmedEffect>;
  /** The dispatch act: the operator-picked lane. The host recomputes the
   * eligible set AT ACT TIME — the wire carries a choice, never a grant. */
  dispatch(missionId: string, connectionRef: string): Promise<PaymentMissionsDispatchOutcome>;
}

/** True iff the port carries the two dispatch members (structural — the
 * composition root may bind any port-shaped object; a P18-only port
 * fails this check and the armed section states the gap honestly). */
export function isPaymentMissionsDispatchPort(
  port: PaymentMissionsPort,
): port is PaymentMissionsPortWithDispatch {
  const candidate = port as { armedEffect?: unknown; dispatch?: unknown };
  return typeof candidate.armedEffect === "function" && typeof candidate.dispatch === "function";
}

/* ==== the two-act dispatch flow's phases + state (mount-owned) ==== */

/** The dispatch flow's phases — THE TWO-ACT LAW is structural: the armed
 * card renders only after the operator engages the dispatch control
 * (IDLE → ARMED_CARD), and the send control can fire only from a chosen
 * lane (LANE_CHOSEN → DISPATCHING). A THROWN typed failure (a lane
 * outside the host's act-time recomputed set — no attempt recorded, the
 * artifact not consumed) returns the flow to the chosen lane; a refused
 * or sent outcome RESOLVES it (the artifact is consumed either way —
 * the armed truth re-reads honestly). */
export const PAYMENT_MISSIONS_DISPATCH_PHASES = Object.freeze([
  "IDLE", "ARMED_CARD", "LANE_CHOSEN", "DISPATCHING", "RESOLVED",
] as const);
export type PaymentMissionsDispatchPhase = (typeof PAYMENT_MISSIONS_DISPATCH_PHASES)[number];

/** The dispatch flow's state (the mount owns it; the armed card projects it). */
export interface PaymentMissionsDispatchState {
  readonly phase: PaymentMissionsDispatchPhase;
  /** The loaded armed effect (absent until the read returns). */
  readonly effect?: PaymentMissionsArmedEffect;
  /** The operator's chosen lane (absent until a choice is made). */
  readonly connectionRef?: string;
  /** The latest dispatch outcome (absent until one resolves). */
  readonly outcome?: PaymentMissionsDispatchOutcome;
}

/** The dispatch-flow wiring the mount projects down through the panel +
 * the detail to the armed card (the preview-card props pattern). */
export interface PaymentMissionsDispatchWiring {
  readonly state: PaymentMissionsDispatchState;
  readonly onEngage: (missionId: string) => void;
  readonly onChooseLane: (connectionRef: string) => void;
  readonly onSend: (missionId: string, connectionRef: string) => void;
}

/* ==== the pinned honest notes (scan-clean people language) ==== */

/** The dispatch-unavailable seam truth (a P18-only port is bound — the send cannot even be offered). */
export const PAYMENT_MISSIONS_DISPATCH_UNAVAILABLE_NOTE =
  "The dispatch act is not wired in this deployment — the armed state cannot be shown or sent from here. The platform host binds the dispatch members at its composition root; until then this surface states the gap instead of acting." as const;

/** The two-act law of the send, in people language (ADR-0012 D1). */
export const PAYMENT_MISSIONS_DISPATCH_TWO_ACT_NOTE =
  "Two explicit acts, exactly as the dispatch law requires: choose the execution lane below, then confirm the send. Nothing is sent until you confirm it here." as const;

/** The intent-digest binding of the armed scope, in people language. */
export const PAYMENT_MISSIONS_ARMED_BINDING_NOTE =
  "This armed scope is bound to the exact intent the approval covered (the digest above): if anything material changes host-side, the send is refused — it can never silently send a different payment." as const;

/** The not-armed path back (the artifact's lifetime is visible — ADR-0012). */
export const PAYMENT_MISSIONS_NOT_ARMED_PATH_BACK_NOTE =
  "A fresh preview and a fresh explicit approval are required — the armed state never carries over, and nothing can be sent while the mission is not armed." as const;

/** The no-lane typed prerequisite (never a fabricated lane). */
export const PAYMENT_MISSIONS_NO_LANE_NOTE =
  "Armed, but no execution lane exists in this deployment — connect a payment capability first. This surface never invents a lane; the Connections section of the console shows what is actually connected." as const;

/** The armed summary before the card is engaged (the entry note). */
export const PAYMENT_MISSIONS_DISPATCH_ENTRY_NOTE =
  "This mission is armed — review the exact scope, the expiry and the execution lanes before anything is sent." as const;
