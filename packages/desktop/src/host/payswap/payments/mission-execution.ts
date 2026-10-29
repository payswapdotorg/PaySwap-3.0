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

// ---------------------------------------------------------------------------
// (P22-H, ADR-0016 D6) The corridor leg-outcome projection — the pure
// input of the custody-continuity law (the C-lane corridor-leg-laws
// mirror, pinned by value in onchain-rail-pins.js).
// ---------------------------------------------------------------------------

/** One corridor leg's recorded outcome (or undefined = UNRECORDED). */
export type CorridorLegOutcomeProjection = "CONFIRMED" | "UNKNOWN" | "FAILED" | undefined;

/**
 * Project the index-aligned per-leg outcome vector of a mission's
 * corridor attempts (pure, deterministic): for each legIndex in
 * [0, legCount), the LAST attempt of that leg carrying a definitive
 * answer (an envelope outcome, or a reconciliation's resolvedTo —
 * reconciliation wins as the later evidence); a leg with only refused
 * attempts (or no attempt at all) is UNRECORDED (undefined) — a refused
 * attempt is definitively no-effect, never a passed leg.
 */
export function corridorLegOutcomes(
  mission: PaymentMissionRecord,
  legCount: number,
): readonly CorridorLegOutcomeProjection[] {
  const outcomes: CorridorLegOutcomeProjection[] = new Array<CorridorLegOutcomeProjection>(legCount).fill(undefined);
  for (const attempt of mission.attempts) {
    if (attempt.legIndex === undefined) {
      continue; // the N=1 attempts are not corridor legs
    }
    if (attempt.legIndex < 0 || attempt.legIndex >= legCount) {
      continue; // outside the projected domain (the dispatch law refused it already)
    }
    let outcome: CorridorLegOutcomeProjection;
    if (attempt.reconciliation !== undefined) {
      outcome = attempt.reconciliation.resolvedTo;
    } else if (attempt.envelope !== undefined) {
      outcome = attempt.envelope.outcome;
    } else {
      outcome = undefined; // refused or never answered — not a passed leg
    }
    // Later attempts of the same leg overwrite earlier ones ONLY when
    // they carry a definitive answer; a later refusal does not erase a
    // recorded outcome (append-only evidence).
    if (outcome !== undefined) {
      outcomes[attempt.legIndex] = outcome;
    }
  }
  return Object.freeze(outcomes);
}

/**
 * THE CUSTODY-CONTINUITY DISPATCH VERDICT (D6, the C-lane
 * corridor-leg-laws mirror, pinned by value): may leg `legIndex`
 * dispatch given the index-aligned recorded outcomes of every EARLIER
 * leg? A later leg dispatches ONLY when every earlier leg's outcome is
 * exactly CONFIRMED — an earlier UNKNOWN blocks (pending
 * reconciliation); an earlier FAILED blocks (the chain stops honestly);
 * an earlier UNRECORDED blocks (legs never silently skip). The FIRST
 * blocking leg is named — never a vague refusal. The refused verdict
 * throws nothing here (pure data); the caller maps it to the typed
 * CORRIDOR_LEG_BLOCKED.
 */
export function corridorLegDispatchPermitted(
  legIndex: number,
  priorOutcomes: readonly CorridorLegOutcomeProjection[],
): { readonly permitted: true } | { readonly permitted: false; readonly reason: string } {
  for (let index = 0; index < legIndex; index += 1) {
    const outcome = priorOutcomes[index];
    if (outcome === undefined) {
      return {
        permitted: false,
        reason: `corridor leg ${String(index)}'s outcome is UNRECORDED — legs never silently skip; an unrecorded leg is not a passed leg (the chain waits for its outcome, honestly)`,
      };
    }
    if (outcome === "UNKNOWN") {
      return {
        permitted: false,
        reason: `corridor leg ${String(index)}'s outcome is UNKNOWN — the mission goes OUTCOME_UNKNOWN with the per-leg attempt pending reconciliation; a later leg NEVER dispatches after an earlier leg's non-CONFIRMED outcome`,
      };
    }
    if (outcome === "FAILED") {
      return {
        permitted: false,
        reason: `corridor leg ${String(index)}'s outcome is FAILED — the mission stays open with the legs before it as recorded facts; the chain stops honestly (custody continuity)`,
      };
    }
  }
  return { permitted: true };
}
