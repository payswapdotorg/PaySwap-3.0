/**
 * @payswap/merchant — refund initiation + lifecycle flow (P5-W3, lane
 * R3-W3; the flow half of the PORT of old
 * packages/merchant-checkout/src/refunds.ts @ 8a735bf).
 *
 * Laws: initiation ONLY where the typed rail observation supports it
 * (honest NOT_SUPPORTED otherwise); evidence-mandatory definitive
 * outcomes; UNKNOWN preserved with reconciliation the only exit;
 * terminal monotonicity; IMMUTABLE ORIGINALS — a refund references its
 * original attempt by id and never rewrites it; the recourse
 * vocabulary is the payment plane's own, consumed through the pins.
 * Native-family semantics follow the Stripe research law: stablecoins
 * to the original wallet, partial refunds supported, no chargeback
 * path.
 */

import { ValidationError } from "./errors.ts";
import { asRefundId } from "./identifiers.ts";
import type { RefundId } from "./identifiers.ts";
import type { PinnedMoney, PinnedTimestampMs, PinnedUnknownOutcomeResolution } from "./pins/protocol.ts";
import type { PinnedRecoursePolicyKind } from "./pins/payment.ts";
import type { CryptoAmount } from "./assets.ts";
import type { CheckoutPaymentAttempt } from "./lifecycle.ts";
import type {
  RailRefundSupportObservation,
  RefundInitiationResult,
  RefundRecord,
  RefundState,
} from "./refunds.ts";
import { refundStateMachine } from "./refunds.ts";
import { assertNoSecretMaterial } from "./secrets.ts";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function requireEvidenceIds(evidenceIds: readonly string[], label: string): void {
  if (
    !Array.isArray(evidenceIds) ||
    evidenceIds.length === 0 ||
    !evidenceIds.every((id) => isNonEmptyString(id))
  ) {
    throw new ValidationError(label);
  }
}

/**
 * Initiate a refund of a CONFIRMED payment attempt.
 *
 * - the attempt must be CONFIRMED (fail-closed — no refunding
 *   non-succeeded payments);
 * - the rail observation must declare refund support: an unsupported
 *   rail answers with the TYPED NOT_SUPPORTED outcome (never silent,
 *   never an implied future support);
 * - the refund amount must be exact Money in the original currency and
 *   not exceed the original payment amount (partial refunds allowed
 *   when the rail supports them);
 * - the original attempt is NEVER mutated: the refund references it by
 *   id.
 */
export function initiateRefund(input: {
  readonly refundId: string;
  readonly attempt: CheckoutPaymentAttempt;
  readonly originalAmount: PinnedMoney;
  readonly amount: PinnedMoney;
  readonly railSupport: RailRefundSupportObservation;
  readonly destinationRef: string;
  readonly recourse: PinnedRecoursePolicyKind;
  readonly now: PinnedTimestampMs;
}): RefundInitiationResult {
  const id = asRefundId(input.refundId);
  if (input.attempt === null || typeof input.attempt !== "object") {
    throw new ValidationError("initiateRefund requires a CheckoutPaymentAttempt", { id });
  }
  if (input.attempt.attempt.state !== "CONFIRMED") {
    throw new ValidationError(
      "only a CONFIRMED payment attempt can be refunded (originals are immutable and never rewritten)",
      { refundId: id, attemptId: input.attempt.attempt.id, state: input.attempt.attempt.state },
    );
  }
  if (input.railSupport === null || typeof input.railSupport !== "object") {
    throw new ValidationError("initiateRefund requires a RailRefundSupportObservation", {
      id,
    });
  }
  if (!isNonEmptyString(input.destinationRef)) {
    throw new ValidationError("a refund requires a destinationRef", { id });
  }
  if (typeof input.now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { id });
  }
  if (!input.railSupport.supportsRefunds) {
    return Object.freeze({
      outcome: "NOT_SUPPORTED" as const,
      routeFamily: input.railSupport.routeFamily,
      reason:
        "the underlying rail does not support refunds (typed rail capability observation — not an implied future support)",
    });
  }
  const original = input.originalAmount;
  const amount = input.amount;
  for (const [label, value] of [
    ["originalAmount", original],
    ["amount", amount],
  ] as const) {
    if (value === null || typeof value !== "object" || typeof value.value !== "bigint") {
      throw new ValidationError(`the refund ${label} must be exact Money`, { id });
    }
  }
  if (amount.value <= 0n) {
    throw new ValidationError("the refund amount must be positive", { id });
  }
  if (amount.currency !== original.currency) {
    throw new ValidationError("the refund must be denominated in the original currency", {
      id,
      refundCurrency: amount.currency,
      originalCurrency: original.currency,
    });
  }
  if (amount.value > original.value) {
    throw new ValidationError(
      "the refund amount must not exceed the original payment amount",
      { id, refundValue: amount.value, originalValue: original.value },
    );
  }
  const isPartial = amount.value < original.value;
  if (isPartial && !input.railSupport.partialRefunds) {
    throw new ValidationError(
      "the rail does not support partial refunds (typed rail capability observation)",
      { id },
    );
  }
  if (input.railSupport.refundMedium === undefined) {
    throw new ValidationError(
      "a supporting rail observation must declare its refundMedium",
      { id },
    );
  }
  const refund: RefundRecord = Object.freeze({
    id,
    originalAttemptId: input.attempt.attempt.id,
    intentId: input.attempt.attempt.intentId,
    amount,
    routeFamily: input.railSupport.routeFamily,
    refundMedium: input.railSupport.refundMedium,
    destinationRef: input.destinationRef,
    recourse: input.recourse,
    railObservationId: input.railSupport.observationId,
    state: "PENDING",
    evidenceIds: Object.freeze([
      `rail-observation:${input.railSupport.observationId}`,
      ...input.railSupport.evidenceRefs,
    ]),
    createdAt: input.now,
    updatedAt: input.now,
  });
  assertNoSecretMaterial(refund, "refund record");
  return Object.freeze({ outcome: "REFUND_STARTED" as const, refund });
}

/** Submit a PENDING refund to the rail (a NEW frozen record). */
export function submitRefund(
  refund: RefundRecord,
  input: {
    readonly submissionRef: string;
    readonly refundedCryptoAmount?: CryptoAmount;
    readonly now: PinnedTimestampMs;
  },
): RefundRecord {
  if (refund === null || typeof refund !== "object" || !isNonEmptyString(refund.id)) {
    throw new ValidationError("submitRefund requires a RefundRecord");
  }
  if (!isNonEmptyString(input.submissionRef)) {
    throw new ValidationError("a refund submission requires a submissionRef", {
      refundId: refund.id,
    });
  }
  if (typeof input.now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { refundId: refund.id });
  }
  const record = refundStateMachine.transition(refund.state, "SUBMIT");
  return Object.freeze({
    ...refund,
    state: record.to,
    ...(input.refundedCryptoAmount !== undefined
      ? { refundedCryptoAmount: input.refundedCryptoAmount }
      : {}),
    evidenceIds: Object.freeze([...refund.evidenceIds, `submission:${input.submissionRef}`]),
    updatedAt: input.now,
  });
}

/** One externally-observed refund outcome. */
export type RefundOutcomeObservation =
  | { readonly kind: "SUCCEEDED"; readonly evidenceIds: readonly string[] }
  | { readonly kind: "FAILED"; readonly evidenceIds: readonly string[] }
  | { readonly kind: "OUTCOME_UNKNOWN"; readonly evidenceIds: readonly string[] };

/**
 * Observe the outcome of a SUBMITTED refund. Evidence is MANDATORY for
 * definitive outcomes; UNKNOWN is preserved first-class. Returns a NEW
 * frozen record.
 */
export function observeRefundOutcome(
  refund: RefundRecord,
  observation: RefundOutcomeObservation,
  now: PinnedTimestampMs,
): RefundRecord {
  if (refund === null || typeof refund !== "object" || !isNonEmptyString(refund.id)) {
    throw new ValidationError("observeRefundOutcome requires a RefundRecord");
  }
  if (
    observation === null ||
    typeof observation !== "object" ||
    (observation.kind !== "SUCCEEDED" &&
      observation.kind !== "FAILED" &&
      observation.kind !== "OUTCOME_UNKNOWN")
  ) {
    throw new ValidationError("a refund outcome observation must be typed");
  }
  if (typeof now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { refundId: refund.id });
  }
  requireEvidenceIds(
    observation.evidenceIds,
    "recording a refund outcome requires linked evidence",
  );
  const event =
    observation.kind === "SUCCEEDED"
      ? "CONFIRM_SUCCEEDED"
      : observation.kind === "FAILED"
        ? "CONFIRM_FAILED"
        : "REPORT_UNKNOWN";
  const record = refundStateMachine.transition(refund.state, event);
  const merged = [...refund.evidenceIds];
  for (const id of observation.evidenceIds) {
    if (!merged.includes(id)) {
      merged.push(id);
    }
  }
  return Object.freeze({
    ...refund,
    state: record.to,
    evidenceIds: Object.freeze(merged),
    updatedAt: now,
  });
}

/**
 * Resolve an OUTCOME_UNKNOWN refund through a reconciliation
 * resolution (the only exit from ambiguity). Returns a NEW frozen
 * record.
 */
export function resolveRefundUnknown(
  refund: RefundRecord,
  resolution: PinnedUnknownOutcomeResolution,
  now: PinnedTimestampMs,
): RefundRecord {
  if (refund === null || typeof refund !== "object" || !isNonEmptyString(refund.id)) {
    throw new ValidationError("resolveRefundUnknown requires a RefundRecord");
  }
  if (
    resolution === null ||
    typeof resolution !== "object" ||
    (resolution.resolvedOutcome !== "CONFIRMED_SUCCEEDED" &&
      resolution.resolvedOutcome !== "CONFIRMED_FAILED")
  ) {
    throw new ValidationError(
      "a refund resolution must be an UnknownOutcomeResolution with a declared resolvedOutcome",
      { refundId: refund.id },
    );
  }
  if (typeof now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs", { refundId: refund.id });
  }
  requireEvidenceIds(
    resolution.evidenceIds,
    "a refund reconciliation resolution requires evidence ids",
  );
  const event =
    resolution.resolvedOutcome === "CONFIRMED_SUCCEEDED" ? "RESOLVE_SUCCEEDED" : "RESOLVE_FAILED";
  const record = refundStateMachine.transition(refund.state, event);
  const merged = [...refund.evidenceIds];
  for (const id of resolution.evidenceIds) {
    if (!merged.includes(id)) {
      merged.push(id);
    }
  }
  return Object.freeze({
    ...refund,
    state: record.to,
    evidenceIds: Object.freeze(merged),
    updatedAt: now,
  });
}

/** Read-only status projection over one refund. */
export function refundStatusView(
  refund: RefundRecord,
): {
  readonly refundId: string;
  readonly state: RefundState;
  readonly outcome: "PENDING" | "SUCCEEDED" | "FAILED" | "OUTCOME_UNKNOWN";
  readonly evidenceIds: readonly string[];
} {
  if (refund === null || typeof refund !== "object" || !isNonEmptyString(refund.id)) {
    throw new ValidationError("refundStatusView requires a RefundRecord");
  }
  const outcome =
    refund.state === "CONFIRMED"
      ? ("SUCCEEDED" as const)
      : refund.state === "FAILED"
        ? ("FAILED" as const)
        : refund.state === "OUTCOME_UNKNOWN"
          ? ("OUTCOME_UNKNOWN" as const)
          : ("PENDING" as const);
  return Object.freeze({
    refundId: refund.id,
    state: refund.state,
    outcome,
    evidenceIds: Object.freeze([...refund.evidenceIds]),
  });
}
