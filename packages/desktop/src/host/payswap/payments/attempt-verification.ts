/**
 * PaySwap Desktop (P21-D reviewer-gate, Gap C) — the PURE verification
 * decision: can an attempt on a mission be verified by an authoritative
 * provider read-back, and if not, WHY (typed, never stringly).
 *
 * THE REVIEWER'S LAW, encoded: "A confirmed operation with authoritative
 * read-back can complete the stage through a typed, persisted
 * verification result when reconciliation is not needed. An ambiguous
 * outcome must remain UNKNOWN and require the actual reconciliation
 * path. Do not fake a RECONCILED event merely to make the checklist
 * green."
 *
 * Concretely:
 * - a CONFIRMED attempt carrying providerReferences[0] (the PaymentIntent
 *   id) is VERIFIABLE — the read-back can address the provider's object;
 * - an ALREADY-VERIFIED attempt replays its recorded verification fact
 *   (the idempotent path — the runtime appends NOTHING);
 * - an ALREADY_RECONCILED attempt never verifies (reconciliation closed
 *   it; verification is not applicable);
 * - RECONCILIATION_REQUIRED is the honest answer for an unresolved
 *   attempt — an UNKNOWN envelope, or a write-ahead whose answer never
 *   landed (no envelope and no refusal): the command may have landed,
 *   so ONLY the actual reconciliation path may close it;
 * - NOT_CONFIRMED covers a refused attempt (definitively no effect — no
 *   provider object exists to read back) and a definitively FAILED
 *   attempt (the mission stays open for a fresh authorization);
 * - NO_PROVIDER_REFERENCE: a CONFIRMED envelope with no
 *   providerReferences[0] gives the read-back nothing to address;
 * - a foreign attemptId is NO_SUCH_ATTEMPT (never a guess).
 *
 * PURE: no I/O, no clock, no store — deterministic over the record. The
 * runtime's verify operation (payment-dispatch-runtime.ts) turns this
 * decision into the store-transaction discipline; the battery
 * (test/payswap/attempt-verification.test.ts) machine-checks every branch.
 */

import type { PaymentAttemptRecord, PaymentMissionRecord } from "./contracts.js";

/** The typed verification decision (every branch is a law, not a hint). */
export type AttemptVerificationDecision =
  | { readonly kind: "NO_SUCH_ATTEMPT" }
  | { readonly kind: "ALREADY_VERIFIED"; readonly verification: NonNullable<PaymentAttemptRecord["verification"]> }
  | { readonly kind: "ALREADY_RECONCILED" }
  | { readonly kind: "RECONCILIATION_REQUIRED" }
  | { readonly kind: "NOT_CONFIRMED" }
  | { readonly kind: "NO_PROVIDER_REFERENCE" }
  | { readonly kind: "VERIFIABLE"; readonly attempt: PaymentAttemptRecord; readonly paymentIntentId: string };

/**
 * Project the verification decision for one attempt on a mission. PURE —
 * the caller owns persistence, the read-back call and the instants.
 */
export function projectAttemptVerification(
  mission: PaymentMissionRecord,
  attemptId: string,
): AttemptVerificationDecision {
  const attempt = mission.attempts.find((candidate) => candidate.attemptId === attemptId);
  if (attempt === undefined) {
    return { kind: "NO_SUCH_ATTEMPT" };
  }
  // The idempotent replay: the recorded typed fact answers first.
  if (attempt.verification !== undefined) {
    return { kind: "ALREADY_VERIFIED", verification: attempt.verification };
  }
  // Reconciliation closed it — verification is not applicable.
  if (attempt.reconciliation !== undefined) {
    return { kind: "ALREADY_RECONCILED" };
  }
  // A refused attempt had no effect — no provider object exists to read back.
  if (attempt.refusal !== undefined) {
    return { kind: "NOT_CONFIRMED" };
  }
  const envelope = attempt.envelope;
  if (envelope === undefined) {
    // The write-ahead persisted but the answer never landed — unresolved.
    return { kind: "RECONCILIATION_REQUIRED" };
  }
  if (envelope.outcome === "UNKNOWN") {
    // THE REVIEWER'S LAW: an ambiguous outcome must remain UNKNOWN and
    // require the actual reconciliation path.
    return { kind: "RECONCILIATION_REQUIRED" };
  }
  if (envelope.outcome === "FAILED") {
    // A definitively failed attempt stays on the record; the mission
    // stays open for a fresh authorization.
    return { kind: "NOT_CONFIRMED" };
  }
  // CONFIRMED: the read-back addresses the provider's own object.
  const paymentIntentId = envelope.providerReferences[0];
  if (typeof paymentIntentId !== "string" || paymentIntentId.length === 0) {
    return { kind: "NO_PROVIDER_REFERENCE" };
  }
  return { kind: "VERIFIABLE", attempt, paymentIntentId };
}
