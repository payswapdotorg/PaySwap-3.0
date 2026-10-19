/**
 * @payswap/merchant — payment lifecycle outcomes (P5-W3, lane R3-W3;
 * the outcome half of the PORT of old
 * packages/merchant-checkout/src/lifecycle.ts @ 8a735bf).
 *
 * Laws: evidence-mandatory definitive outcomes; UNKNOWN preserved
 * (never collapsed to FAILED or SUCCESS); reconciliation the only
 * ambiguity exit; blind-retry forbidden (a re-observe appends evidence
 * without a state change); the intent settles ONLY from the attempt's
 * own state (never from a handoff receipt — the no-success-inference
 * law). Deterministic only: every operation takes an explicit `now`.
 */

import { ValidationError } from "./errors.ts";
import type { PinnedTimestampMs, PinnedUnknownOutcomeResolution } from "./pins/protocol.ts";
import type { PinnedPaymentMethodTranslation } from "./pins/payment.ts";
import type { MerchantPaymentAttempt, MerchantPaymentAttemptState } from "./attempt.ts";
import { merchantPaymentAttemptStateMachine } from "./attempt.ts";
import {
  confirmMerchantPaymentAttemptFailed,
  confirmMerchantPaymentAttemptSucceeded,
  reportMerchantPaymentAttemptUnknown,
  resolveMerchantPaymentAttemptUnknown,
} from "./attempt-outcomes.ts";
import { merchantPaymentIntentStateMachine } from "./intent.ts";
import type { MerchantPaymentIntent, MerchantPaymentIntentState } from "./intent.ts";
import type { CheckoutPaymentAttempt } from "./lifecycle.ts";

function requireIntent(intent: MerchantPaymentIntent): void {
  if (intent === null || typeof intent !== "object" || typeof intent.id !== "string" || intent.id.length === 0) {
    throw new ValidationError("the operation requires a MerchantPaymentIntent");
  }
}

function requireRecord(record: CheckoutPaymentAttempt): void {
  if (record === null || typeof record !== "object") {
    throw new ValidationError("the operation requires a CheckoutPaymentAttempt");
  }
}

function requireNow(now: PinnedTimestampMs): void {
  if (typeof now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs");
  }
}

/** One externally-observed outcome of a submitted attempt. */
export type AttemptOutcomeObservation =
  | { readonly kind: "SUCCEEDED"; readonly evidenceIds: readonly string[]; readonly externalTxRef?: string; readonly translation?: PinnedPaymentMethodTranslation }
  | { readonly kind: "FAILED"; readonly evidenceIds: readonly string[] }
  | { readonly kind: "OUTCOME_UNKNOWN"; readonly evidenceIds: readonly string[] };

/**
 * Observe the outcome of a SUBMITTED attempt. Definitive outcomes
 * REQUIRE evidence (enforced by the attempt helpers); UNKNOWN is
 * first-class and preserved verbatim — never converted into FAILED or
 * SUCCESS. Returns a NEW frozen record.
 */
export function observeAttemptOutcome(
  record: CheckoutPaymentAttempt,
  observation: AttemptOutcomeObservation,
  now: PinnedTimestampMs,
): CheckoutPaymentAttempt {
  requireRecord(record);
  if (
    observation === null ||
    typeof observation !== "object" ||
    (observation.kind !== "SUCCEEDED" &&
      observation.kind !== "FAILED" &&
      observation.kind !== "OUTCOME_UNKNOWN")
  ) {
    throw new ValidationError("an outcome observation must be typed SUCCEEDED/FAILED/OUTCOME_UNKNOWN");
  }
  requireNow(now);
  let attempt: MerchantPaymentAttempt;
  switch (observation.kind) {
    case "SUCCEEDED":
      attempt = confirmMerchantPaymentAttemptSucceeded(record.attempt, {
        evidenceIds: observation.evidenceIds,
        ...(observation.externalTxRef !== undefined
          ? { externalTxRef: observation.externalTxRef }
          : {}),
        ...(observation.translation !== undefined
          ? { translation: observation.translation }
          : {}),
        now,
      });
      break;
    case "FAILED":
      attempt = confirmMerchantPaymentAttemptFailed(record.attempt, {
        evidenceIds: observation.evidenceIds,
        now,
      });
      break;
    default:
      attempt = reportMerchantPaymentAttemptUnknown(record.attempt, {
        evidenceIds: observation.evidenceIds,
        now,
      });
      break;
  }
  return Object.freeze({ ...record, attempt });
}

/**
 * A re-observe of an ambiguous attempt: appends NEW evidence linkage
 * to an OUTCOME_UNKNOWN attempt WITHOUT any state change — a
 * re-observe is a new observation, never a mutation of history and
 * never a blind retry. The attempt stays OUTCOME_UNKNOWN until a
 * reconciliation resolution arrives.
 */
export function recordAmbiguityEvidence(
  record: CheckoutPaymentAttempt,
  evidenceIds: readonly string[],
  now: PinnedTimestampMs,
): CheckoutPaymentAttempt {
  requireRecord(record);
  requireNow(now);
  if (
    !Array.isArray(evidenceIds) ||
    evidenceIds.length === 0 ||
    !evidenceIds.every((id) => typeof id === "string" && id.length > 0)
  ) {
    throw new ValidationError(
      "an ambiguity re-observation requires non-empty evidence ids — the observation itself is evidence",
    );
  }
  if (record.attempt.state !== "OUTCOME_UNKNOWN") {
    throw new ValidationError(
      "ambiguity evidence can only be recorded on an OUTCOME_UNKNOWN attempt",
      { attemptId: record.attempt.id, state: record.attempt.state },
    );
  }
  const merged = [...record.attempt.evidenceIds];
  for (const id of evidenceIds) {
    if (!merged.includes(id)) {
      merged.push(id);
    }
  }
  const attempt = Object.freeze({
    ...record.attempt,
    evidenceIds: Object.freeze(merged),
    updatedAt: now,
  });
  return Object.freeze({ ...record, attempt });
}

/**
 * Resolve an OUTCOME_UNKNOWN attempt through a reconciliation
 * resolution (the ONLY exit from ambiguity). The resolution is the
 * pinned protocol-plane `UnknownOutcomeResolution`, consumed verbatim;
 * its evidence ids are mandatory and merged. Returns a NEW frozen
 * record.
 */
export function resolveAttemptUnknown(
  record: CheckoutPaymentAttempt,
  resolution: PinnedUnknownOutcomeResolution,
  now: PinnedTimestampMs,
): CheckoutPaymentAttempt {
  requireRecord(record);
  requireNow(now);
  const attempt = resolveMerchantPaymentAttemptUnknown(record.attempt, resolution, now);
  return Object.freeze({ ...record, attempt });
}

/**
 * Project the attempt's outcome onto the intent machine: PROCESSING →
 * SUCCEEDED / FAILED / OUTCOME_UNKNOWN (or the reconciliation
 * resolutions from OUTCOME_UNKNOWN). The attempt's state is the
 * authority for which intent event is legal; evidence ids are mandatory
 * and carried on the composite record. Returns a NEW frozen intent.
 */
export function settleIntentOutcome(
  intent: MerchantPaymentIntent,
  record: CheckoutPaymentAttempt,
  input: { readonly evidenceIds: readonly string[]; readonly now: PinnedTimestampMs },
): MerchantPaymentIntent {
  requireIntent(intent);
  requireRecord(record);
  requireNow(input.now);
  if (
    !Array.isArray(input.evidenceIds) ||
    input.evidenceIds.length === 0 ||
    !input.evidenceIds.every((id) => typeof id === "string" && id.length > 0)
  ) {
    throw new ValidationError(
      "an intent outcome transition requires non-empty evidence ids (the evidence-mandatory law)",
    );
  }
  const attemptState: MerchantPaymentAttemptState = record.attempt.state;
  let event: Parameters<typeof merchantPaymentIntentStateMachine.transition>[1];
  switch (attemptState) {
    case "CONFIRMED":
      event = "CONFIRM_SUCCEEDED";
      break;
    case "FAILED":
      event = "CONFIRM_FAILED";
      break;
    case "OUTCOME_UNKNOWN":
      event = "REPORT_UNKNOWN";
      break;
    default:
      throw new ValidationError(
        "the intent can only be settled from a definitive or ambiguous attempt outcome (SUBMITTED attempts are still PROCESSING)",
        { attemptId: record.attempt.id, attemptState },
      );
  }
  const transitionRecord = merchantPaymentIntentStateMachine.transition(intent.state, event, {
    now: input.now,
    expiresAt: intent.expiresAt,
  });
  return Object.freeze({
    ...intent,
    state: transitionRecord.to as MerchantPaymentIntentState,
  });
}

/**
 * Resolve the INTENT's ambiguity through a reconciliation resolution:
 * OUTCOME_UNKNOWN → SUCCEEDED or FAILED. Only legal while the intent
 * is OUTCOME_UNKNOWN and the attempt was resolved the same way.
 */
export function resolveIntentUnknown(
  intent: MerchantPaymentIntent,
  record: CheckoutPaymentAttempt,
  resolution: PinnedUnknownOutcomeResolution,
  now: PinnedTimestampMs,
): MerchantPaymentIntent {
  requireIntent(intent);
  requireRecord(record);
  requireNow(now);
  const event =
    resolution.resolvedOutcome === "CONFIRMED_SUCCEEDED"
      ? ("RESOLVE_SUCCEEDED" as const)
      : ("RESOLVE_FAILED" as const);
  const consistent =
    (event === "RESOLVE_SUCCEEDED" && record.attempt.state === "CONFIRMED") ||
    (event === "RESOLVE_FAILED" && record.attempt.state === "FAILED");
  if (!consistent) {
    throw new ValidationError(
      "the intent resolution must match the attempt's reconciled outcome",
      { intentState: intent.state, attemptState: record.attempt.state, resolvedOutcome: resolution.resolvedOutcome },
    );
  }
  const transitionRecord = merchantPaymentIntentStateMachine.transition(intent.state, event, {
    now,
    expiresAt: intent.expiresAt,
  });
  return Object.freeze({
    ...intent,
    state: transitionRecord.to as MerchantPaymentIntentState,
  });
}

/**
 * Deterministic read-only status projection over one attempt (used by
 * the status views and the webhook layer): the canonical outcome on
 * the settlement plane's definiteness dimension.
 */
export function attemptStatusView(
  record: CheckoutPaymentAttempt,
): {
  readonly attemptId: string;
  readonly state: MerchantPaymentAttemptState;
  readonly outcome: "PENDING" | "SUCCEEDED" | "FAILED" | "OUTCOME_UNKNOWN";
  readonly evidenceIds: readonly string[];
  readonly authorizationRequestHash: string;
} {
  requireRecord(record);
  const state = record.attempt.state;
  const outcome =
    state === "CONFIRMED"
      ? ("SUCCEEDED" as const)
      : state === "FAILED"
        ? ("FAILED" as const)
        : state === "OUTCOME_UNKNOWN"
          ? ("OUTCOME_UNKNOWN" as const)
          : ("PENDING" as const);
  return Object.freeze({
    attemptId: record.attempt.id,
    state,
    outcome,
    evidenceIds: Object.freeze([...record.attempt.evidenceIds]),
    authorizationRequestHash: record.authorization.authorizationRequestHash,
  });
}

/** Whether the attempt machine allows an outcome observation in this state. */
export function attemptMayObserveOutcome(record: CheckoutPaymentAttempt): boolean {
  requireRecord(record);
  return (
    merchantPaymentAttemptStateMachine.canTransition(record.attempt.state, "CONFIRM_SUCCEEDED") ||
    merchantPaymentAttemptStateMachine.canTransition(record.attempt.state, "CONFIRM_FAILED") ||
    merchantPaymentAttemptStateMachine.canTransition(record.attempt.state, "REPORT_UNKNOWN")
  );
}
