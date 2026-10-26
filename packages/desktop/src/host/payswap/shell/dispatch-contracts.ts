/**
 * PaySwap Desktop (P19-A, ADR-0012 D1/D2) — the DISPATCH channel
 * contracts, split from ./payment-mission-contracts.ts for the
 * ≤400-line file law: the armed-effect read + the dispatch act's wire
 * shapes and member surface.
 *
 * THE CHANNEL LAW (the ADR-0011 D3 boundary, lawfully narrowed by
 * ADR-0012 D1 — the same invariants enforced at the channel edge
 * instead of by absence):
 * - THE ARTIFACT NEVER CROSSES, NOT EVEN AS AN INPUT: no artifactId
 *   or artifact field exists on any shape here. The dispatch member
 *   resolves the mission's latest unconsumed artifact HOST-SIDE and
 *   pins the operation (CREATE_EXTERNAL_EFFECT) and the INV-25 mode
 *   (SANDBOX) host-side — the renderer supplies ONLY the mission id
 *   and the operator-picked connectionRef (a CHOICE, never a grant:
 *   the eligible set is recomputed host-side at act time).
 * - THE OUTCOME CARRIES FACTS ONLY: { kind, attemptId, summary } —
 *   no artifactId, no connectionRef echo, no envelope internals
 *   beyond the people-language summary (the attempt-state projection
 *   on the detail DTO carries the honest facts after refresh).
 * - THE LANES CARRY NO MATERIAL: exactly the registry's own ids +
 *   people-language labels (ADR-0012 D2) — no credentials, no
 *   credential handles, no secrets; LIVE and non-ACTIVE records are
 *   listed as ineligible with their reasons, never silently hidden.
 * - Fail-closed: every member throws the typed
 *   PaymentPlaneNotConfiguredError when the runtime was not composed,
 *   and the typed ConnectionPlaneNotConfiguredError when the
 *   connections plane was not composed (the lane set is never
 *   fabricated to mask a missing plane).
 */

import type { PaymentAuthorizationScopeDto } from "./payment-mission-contracts.js";

// ---------------------------------------------------------------------------
// The lane + armed-card wire shapes (ADR-0012 D1/D2)
// ---------------------------------------------------------------------------

/**
 * One executing lane on the wire (ADR-0012 D2): the registry's own ids
 * + a people-language label — the same ids the Connections section
 * already shows the operator. An ineligible lane carries its reason
 * (LIVE per INV-25, or the non-ACTIVE state); NO credentials, NO
 * credential handles and NO secrets ever appear on this shape.
 */
export interface PaymentDispatchLaneDto {
  /** The operator's choice key (the registry's connection id). */
  readonly connectionRef: string;
  /** People language (the registry's own display names — never guessed). */
  readonly label: string;
  readonly providerId: string;
  /** Present exactly when the lane is not dispatchable, with its reason. */
  readonly ineligible?: { readonly reason: string };
}

/**
 * The armed card (ADR-0012 D1 — the READ): whether the mission is
 * ARMED (an unconsumed, unexpired authorization artifact exists for
 * it), the approved scope + expiry echo when it is, the people-language
 * reason when it is not (no artifact exists / expired at <instant> /
 * was consumed at <instant> — each naming the path back), and the
 * executing lanes. NO artifactId exists on this shape; the scope echo
 * is the P18-A approval-scope shape verbatim.
 */
export interface PaymentMissionArmedEffectDto {
  readonly armed: boolean;
  /** The verbatim not-armed reason (present iff armed is false). */
  readonly reason?: string;
  /** The approved scope echo (present iff armed is true). */
  readonly scope?: PaymentAuthorizationScopeDto;
  /** The artifact's expiry instant (present iff armed is true). */
  readonly expiresAt?: string;
  /** The resolved executing lanes (eligible + ineligible-with-reason). */
  readonly lanes: readonly PaymentDispatchLaneDto[];
}

// ---------------------------------------------------------------------------
// The dispatch outcome wire shape (ADR-0012 D1 — outcome facts only)
// ---------------------------------------------------------------------------

/**
 * The typed dispatch outcome on the wire (ADR-0012 D1): outcome facts
 * only — the kind, the attempt id and a people-language summary. NO
 * artifactId, NO connectionRef echo, NO envelope internals beyond the
 * summary. REPLAYED mirrors the runtime's idempotent-replay kind (a
 * completed record replays its recorded envelope with no duplicate
 * write); through THIS member it is unreachable in practice (a
 * confirmed create-effect completes the mission, and the runtime
 * refuses further creates on terminal missions before the idempotency
 * decision) — the kind exists so the wire type mirrors the runtime's
 * outcome union without lying about the channel's reach (the REJECTED
 * precedent on the P18-A resolution DTO). Failures beyond these
 * outcomes (unknown mission, ineligible lane, no artifact, expired or
 * consumed artifacts, unresolved attempts) are THROWN typed
 * PaymentMissionError — the channel's established fail-closed
 * discipline.
 */
export type PaymentMissionDispatchOutcomeDto =
  | { readonly kind: "DISPATCHED"; readonly attemptId: string; readonly summary: string }
  | { readonly kind: "REPLAYED"; readonly attemptId: string; readonly summary: string }
  | { readonly kind: "REFUSED"; readonly attemptId: string; readonly summary: string };

// ---------------------------------------------------------------------------
// The member surface (the dispatch act — a lane choice, never a grant)
// ---------------------------------------------------------------------------

/**
 * The dispatch channel members (P19-A, ADR-0012 D1). Both fail closed
 * with the typed PaymentPlaneNotConfiguredError when the host composed
 * no payment-mission runtime, and with the typed
 * ConnectionPlaneNotConfiguredError when the host composed no
 * connections plane (the lane set is never fabricated).
 */
export interface IPaySwapDesktopDispatchMembers {
  /**
   * The armed-effect READ (ADR-0012 D1): the armed card — the armed
   * truth, the scope + expiry echo when armed, the verbatim
   * not-armed reason when not, and the resolved executing lanes. The
   * artifact never crosses: no artifactId exists on the card.
   */
  paymentMissionArmedEffect(missionId: string): Promise<PaymentMissionArmedEffectDto>;

  /**
   * The dispatch ACT (ADR-0012 D1): the operator-picked lane. The
   * renderer supplies ONLY the mission id and the connectionRef — a
   * CHOICE, never a grant: the eligible set is recomputed host-side
   * at act time (a connectionRef outside the recomputed ACTIVE
   * SANDBOX set is a typed refusal with NO attempt recorded), and
   * the artifact, the operation and the INV-25 mode resolve
   * HOST-SIDE. The outcome carries facts only: kind, attemptId and
   * the people-language summary.
   */
  paymentMissionDispatch(
    missionId: string,
    connectionRef: string,
  ): Promise<PaymentMissionDispatchOutcomeDto>;
}
