/**
 * PaySwap Desktop (P13-C) — the pure execution-state helpers (the
 * consequential slice's decision functions).
 *
 * Pure laws only: every function here is deterministic over its inputs
 * (no clock, no store, no authority) — the runtime (payment-mission-
 * runtime.ts / its dispatch slice) owns persistence and the authority
 * call, and composes THESE helpers for every consequential decision so
 * the decision logic itself is unit-testable and honest by inspection:
 *
 * - UNRESOLVED means UNKNOWN-or-never-answered (INV-04): an attempt
 *   whose envelope says UNKNOWN, or whose write-ahead persisted but
 *   whose answer never did, BLOCKS every retry and every cancel until
 *   reconciliation evidence closes it;
 * - a REFUSED attempt is definitively no-effect (the authority refused
 *   before any dispatch — no envelope is fabricated for a refusal);
 * - the interruption recovery plan is derived purely from the persisted
 *   records: an attempt with neither envelope nor refusal and no prior
 *   OUTCOME_UNKNOWN event bound to it (correlationRef) is an interrupted
 *   write-ahead — potentially effective, reconciles before retry.
 */

import type { PaymentAttemptRecord, CompiledPaymentIntent, PaymentMissionRecord } from "./contracts.js";
import { paymentIntentDigest } from "./authorization-gate.js";

/**
 * An attempt is UNRESOLVED iff its outcome is UNKNOWN or was never
 * recorded (and it was not refused): potentially effective — it blocks
 * retry, cancel and expiry until reconciliation closes it.
 */
export function attemptIsUnresolved(attempt: PaymentAttemptRecord): boolean {
  if (attempt.refusal !== undefined) {
    return false; // refused before any effect — definitively no-effect
  }
  if (attempt.reconciliation !== undefined) {
    return false; // provider evidence closed the attempt (INV-04 satisfied)
  }
  if (attempt.envelope === undefined) {
    return true; // write-ahead persisted, answer never recorded
  }
  return attempt.envelope.outcome === "UNKNOWN";
}

/** True iff reconciliation evidence has closed an attempt (it carries a reconciliation record). */
export function attemptIsReconciled(attempt: PaymentAttemptRecord): boolean {
  return attempt.reconciliation !== undefined;
}

/** The last attempt on a mission (the current consequential frontier), or undefined. */
export function lastAttempt(mission: PaymentMissionRecord): PaymentAttemptRecord | undefined {
  return mission.attempts.length === 0 ? undefined : mission.attempts[mission.attempts.length - 1];
}

/** The most recent CONFIRMED create-effect attempt (a compensation target), or undefined. */
export function confirmedCreateAttempt(mission: PaymentMissionRecord): PaymentAttemptRecord | undefined {
  for (let index = mission.attempts.length - 1; index >= 0; index -= 1) {
    const attempt = mission.attempts[index]!;
    if (attempt.operation !== "CREATE_EXTERNAL_EFFECT") continue;
    if (attempt.reconciliation?.resolvedTo === "CONFIRMED") return attempt;
    if (attempt.envelope?.outcome === "CONFIRMED") return attempt;
  }
  return undefined;
}

/** The deterministic digest of a compiled intent (the material-change binding). */
export function compiledIntentDigest(intent: CompiledPaymentIntent): string {
  return paymentIntentDigest({
    intentId: intent.intentId,
    originLocationRef: intent.origin.locationRef,
    destinationLocationRef: intent.destination.locationRef,
    minorUnits: intent.originAmount.minorUnits,
    currency: intent.originAmount.currency,
    arrivalCurrency: intent.arrivalCurrency,
    expiresAt: intent.expiresAt,
  });
}

/** Does the mission timeline already carry an OUTCOME_UNKNOWN event for this attempt? */
function hasOutcomeUnknownEvent(mission: PaymentMissionRecord, attemptId: string): boolean {
  return mission.events.some(
    (event) => event.kind === "OUTCOME_UNKNOWN" && event.correlationRef === attemptId,
  );
}

/** One interrupted write-ahead the restart sweep must mark UNKNOWN. */
export interface InterruptionRecoveryItem {
  readonly missionId: string;
  readonly attemptId: string;
}

/**
 * The interruption recovery plan: every attempt across every mission
 * whose write-ahead persisted but whose answer never did (no envelope,
 * no refusal, no prior OUTCOME_UNKNOWN event). The runtime marks each
 * UNKNOWN and AMBIGUOUS in the idempotency registrar — the conservative
 * truth: the process cannot know whether the crash happened before or
 * after the authority call, so the command may have landed.
 */
export function planInterruptionRecovery(
  missions: readonly PaymentMissionRecord[],
): readonly InterruptionRecoveryItem[] {
  const plan: InterruptionRecoveryItem[] = [];
  for (const mission of missions) {
    for (const attempt of mission.attempts) {
      if (attempt.envelope !== undefined || attempt.refusal !== undefined) continue;
      if (hasOutcomeUnknownEvent(mission, attempt.attemptId)) continue;
      plan.push({ missionId: mission.id, attemptId: attempt.attemptId });
    }
  }
  return plan;
}

/**
 * The mission-level unresolved guard: true iff ANY attempt on the
 * mission is unresolved (UNKNOWN or never answered) — dispatch, cancel
 * and expiry all fail closed with the typed reason while this holds.
 */
export function missionHasUnresolvedAttempt(mission: PaymentMissionRecord): boolean {
  return mission.attempts.some((attempt) => attemptIsUnresolved(attempt));
}
