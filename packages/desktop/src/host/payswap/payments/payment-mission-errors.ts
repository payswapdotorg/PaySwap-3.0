/**
 * PaySwap Desktop (P13-C, split for the ≤400-line file law) — the payment
 * mission plane's ONE typed error family, split from ./contracts.ts.
 *
 * Fail-closed control flow only: every refusal in the runtime, the store
 * and the channel members is a typed PaymentMissionError — never a
 * stringly-typed signal, never a silent no-op. The kind vocabulary is a
 * frozen closed set (no TS enums — the union literal discipline).
 */

/** The one typed error family of the payment-mission runtime. */
export type PaymentMissionErrorKind =
  | "MISSION_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "FIELD_ALREADY_CAPTURED"
  | "INVALID_FIELD_VALUE"
  | "INTAKE_INCOMPLETE"
  | "GATES_BLOCKED"
  | "PREVIEW_REQUIRED"
  | "PREVIEW_EXPIRED"
  | "AUTHORIZATION_REQUIRED"
  | "AUTHORIZATION_ORIGIN_REJECTED"
  | "AUTHORIZATION_EXPIRED"
  | "AUTHORIZATION_CONSUMED"
  | "AUTHORIZATION_MISMATCH"
  | "IDEMPOTENCY_CONFLICT"
  | "RETRY_BLOCKED_UNKNOWN"
  | "RECONCILIATION_NOT_PENDING"
  | "RECONCILIATION_EVIDENCE_INVALID"
  | "MISSION_TERMINAL"
  | "STORE_NOT_CONFIGURED"
  | "PERSISTENCE_FAILED"
  /**
   * (P21-D reviewer-gate, Gap C) The verify operation's typed refusal
   * family: the attempt is not in a verifiable state (already reconciled,
   * ambiguous — the reviewer's law: an ambiguous outcome must remain
   * UNKNOWN and require the actual reconciliation path —, refused,
   * definitively failed, or carrying no provider reference), or the
   * authoritative read-back itself was ambiguous / disagreed with the
   * recorded confirmation. ONE kind, many honest reasons in the message.
   */
  | "VERIFICATION_REFUSED";

/** The one typed error family of the payment-mission runtime. */
export class PaymentMissionError extends Error {
  readonly kind: PaymentMissionErrorKind;
  readonly missionId?: string;
  readonly reasons?: readonly string[];

  constructor(
    kind: PaymentMissionErrorKind,
    message: string,
    details: { readonly missionId?: string; readonly reasons?: readonly string[] } = {},
  ) {
    super(message);
    this.name = "PaymentMissionError";
    this.kind = kind;
    if (details.missionId !== undefined) this.missionId = details.missionId;
    if (details.reasons !== undefined) this.reasons = details.reasons;
  }
}
