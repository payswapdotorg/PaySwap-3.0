/**
 * @payswap/merchant — merchant payment attempt, part 2: the outcome +
 * settlement-attachment family (P5-W3, lane R3-W3; PORT of old
 * packages/merchant-crypto/src/attempt.ts outcome half @ 8a735bf).
 *
 * The evidence-mandatory law: a definitive (or ambiguity-reporting)
 * outcome REQUIRES linked evidence ids — the observation itself is
 * evidence. The reconciliation resolution is the ONLY exit from
 * OUTCOME_UNKNOWN (the pinned protocol-plane
 * `UnknownOutcomeResolution`, consumed verbatim). Settlement linkage
 * carries the PINNED SettlementInstructionId typed reference (the
 * delegation handle) — money movement is referenced, never owned.
 */

import { ValidationError } from "./errors.ts";
import { asSettlementInstructionId } from "./identifiers.ts";
import type { PinnedSettlementInstructionId, PinnedTimestampMs, PinnedUnknownOutcomeResolution } from "./pins/protocol.ts";
import type { PinnedPaymentMethodTranslation } from "./pins/payment.ts";
import { merchantPaymentAttemptStateMachine } from "./attempt.ts";
import { mergeEvidence, requireAttempt, requireNow } from "./attempt.ts";
import type { MerchantPaymentAttempt } from "./attempt.ts";
import { assertRouteFamilyDiscriminated } from "./settlement-routes.ts";
import type { MerchantCryptoSettlementRoute } from "./settlement-routes.ts";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** The evidence-mandatory gate: a definitive or ambiguity-reporting outcome needs evidence. */
function requireEvidenceIds(evidenceIds: readonly string[], message: string): void {
  if (
    !Array.isArray(evidenceIds) ||
    evidenceIds.length === 0 ||
    !evidenceIds.every((id) => isNonEmptyString(id))
  ) {
    throw new ValidationError(message);
  }
}

/**
 * Record definitive SUCCESS. Only legal from SUBMITTED (the machine's
 * CONFIRM_SUCCEEDED transition enforces it); evidence ids are MANDATORY
 * (recording a definitive outcome requires linked evidence) and are
 * merged with the existing linkage (existing order first, then new).
 * Optionally attaches the external tx ref and the pinned
 * PaymentMethodTranslation. Returns a NEW frozen record.
 */
export function confirmMerchantPaymentAttemptSucceeded(
  attempt: MerchantPaymentAttempt,
  input: {
    readonly evidenceIds: readonly string[];
    readonly externalTxRef?: string;
    readonly translation?: PinnedPaymentMethodTranslation;
    readonly now: PinnedTimestampMs;
  },
): MerchantPaymentAttempt {
  requireAttempt(attempt);
  requireNow(input.now);
  requireEvidenceIds(
    input.evidenceIds,
    "recording a definitive outcome requires linked evidence (the evidence-mandatory law)",
  );
  if (input.externalTxRef !== undefined && !isNonEmptyString(input.externalTxRef)) {
    throw new ValidationError("externalTxRef must be a non-empty string when present", {
      attemptId: attempt.id,
    });
  }
  if (
    input.translation !== undefined &&
    (input.translation === null ||
      typeof input.translation !== "object" ||
      !isNonEmptyString(input.translation.id))
  ) {
    throw new ValidationError("translation must be a PaymentMethodTranslation when present", {
      attemptId: attempt.id,
    });
  }
  const record = merchantPaymentAttemptStateMachine.transition(attempt.state, "CONFIRM_SUCCEEDED");
  const externalTxRef =
    input.externalTxRef !== undefined ? input.externalTxRef : attempt.externalTxRef;
  const translation = input.translation !== undefined ? input.translation : attempt.translation;
  return Object.freeze({
    ...attempt,
    state: record.to,
    evidenceIds: Object.freeze(mergeEvidence(attempt.evidenceIds, input.evidenceIds)),
    ...(externalTxRef !== undefined ? { externalTxRef } : {}),
    ...(translation !== undefined ? { translation } : {}),
    updatedAt: input.now,
  });
}

/**
 * Record definitive FAILURE. Only legal from SUBMITTED; evidence ids
 * are MANDATORY. Returns a NEW frozen record.
 */
export function confirmMerchantPaymentAttemptFailed(
  attempt: MerchantPaymentAttempt,
  input: { readonly evidenceIds: readonly string[]; readonly now: PinnedTimestampMs },
): MerchantPaymentAttempt {
  requireAttempt(attempt);
  requireNow(input.now);
  requireEvidenceIds(
    input.evidenceIds,
    "recording a definitive outcome requires linked evidence (the evidence-mandatory law)",
  );
  const record = merchantPaymentAttemptStateMachine.transition(attempt.state, "CONFIRM_FAILED");
  return Object.freeze({
    ...attempt,
    state: record.to,
    evidenceIds: Object.freeze(mergeEvidence(attempt.evidenceIds, input.evidenceIds)),
    updatedAt: input.now,
  });
}

/**
 * Report the outcome as UNKNOWN. Only legal from SUBMITTED; evidence
 * ids are MANDATORY — the ambiguity observation itself is evidence.
 * UNKNOWN is first-class, never FAILED. Returns a NEW frozen record.
 */
export function reportMerchantPaymentAttemptUnknown(
  attempt: MerchantPaymentAttempt,
  input: { readonly evidenceIds: readonly string[]; readonly now: PinnedTimestampMs },
): MerchantPaymentAttempt {
  requireAttempt(attempt);
  requireNow(input.now);
  requireEvidenceIds(
    input.evidenceIds,
    "reporting an unknown outcome requires linked evidence — the ambiguity observation itself is evidence",
  );
  const record = merchantPaymentAttemptStateMachine.transition(attempt.state, "REPORT_UNKNOWN");
  return Object.freeze({
    ...attempt,
    state: record.to,
    evidenceIds: Object.freeze(mergeEvidence(attempt.evidenceIds, input.evidenceIds)),
    updatedAt: input.now,
  });
}

/**
 * Resolve an OUTCOME_UNKNOWN attempt through a reconciliation
 * resolution (the ONLY exit from ambiguity). The resolution type is
 * the PINNED protocol-plane `UnknownOutcomeResolution`, consumed
 * verbatim: `resolvedOutcome` selects RESOLVE_SUCCEEDED /
 * RESOLVE_FAILED; the resolution's evidence ids are mandatory and
 * merged into the attempt's linkage (the resolution `caseId` is NOT
 * evidence and is never merged). Returns a NEW frozen record.
 */
export function resolveMerchantPaymentAttemptUnknown(
  attempt: MerchantPaymentAttempt,
  resolution: PinnedUnknownOutcomeResolution,
  now: PinnedTimestampMs,
): MerchantPaymentAttempt {
  requireAttempt(attempt);
  requireNow(now);
  if (
    resolution === null ||
    typeof resolution !== "object" ||
    (resolution.resolvedOutcome !== "CONFIRMED_SUCCEEDED" &&
      resolution.resolvedOutcome !== "CONFIRMED_FAILED")
  ) {
    throw new ValidationError(
      "resolution must be an UnknownOutcomeResolution with a declared resolvedOutcome",
      { attemptId: attempt.id },
    );
  }
  requireEvidenceIds(
    resolution.evidenceIds,
    "a reconciliation resolution requires non-empty evidence ids (the ambiguity-exit law)",
  );
  const event =
    resolution.resolvedOutcome === "CONFIRMED_SUCCEEDED" ? "RESOLVE_SUCCEEDED" : "RESOLVE_FAILED";
  const record = merchantPaymentAttemptStateMachine.transition(attempt.state, event);
  return Object.freeze({
    ...attempt,
    state: record.to,
    evidenceIds: Object.freeze(mergeEvidence(attempt.evidenceIds, resolution.evidenceIds)),
    updatedAt: now,
  });
}

/**
 * Abandon a PENDING attempt (never one already submitted — the
 * machine's ABANDON transition is only declared from PENDING).
 * Returns a NEW frozen record.
 */
export function abandonMerchantPaymentAttempt(
  attempt: MerchantPaymentAttempt,
  now: PinnedTimestampMs,
): MerchantPaymentAttempt {
  requireAttempt(attempt);
  requireNow(now);
  const record = merchantPaymentAttemptStateMachine.transition(attempt.state, "ABANDON");
  return Object.freeze({ ...attempt, state: record.to, updatedAt: now });
}

/**
 * Attach the settlement mapping onto the protocol settlement plane:
 * the PINNED SettlementInstructionId typed reference plus the ids of
 * the protocol-owned SettlementAttempt records executing this
 * attempt's settlement leg (non-empty strings). Only legal on a
 * CONFIRMED attempt — settlement linkage exists once the payment
 * outcome is definitive. Returns a NEW frozen record.
 */
export function attachSettlement(
  attempt: MerchantPaymentAttempt,
  input: {
    readonly settlementInstructionId: string;
    readonly settlementAttemptIds: readonly string[];
    readonly now: PinnedTimestampMs;
  },
): MerchantPaymentAttempt {
  requireAttempt(attempt);
  requireNow(input.now);
  if (attempt.state !== "CONFIRMED") {
    throw new ValidationError("settlement can only be attached to a CONFIRMED attempt", {
      attemptId: attempt.id,
      state: attempt.state,
    });
  }
  const settlementInstructionId: PinnedSettlementInstructionId = asSettlementInstructionId(
    input.settlementInstructionId,
  );
  if (
    !Array.isArray(input.settlementAttemptIds) ||
    input.settlementAttemptIds.length === 0 ||
    !input.settlementAttemptIds.every((id) => isNonEmptyString(id))
  ) {
    throw new ValidationError("settlementAttemptIds must be non-empty strings", {
      attemptId: attempt.id,
    });
  }
  return Object.freeze({
    ...attempt,
    settlementInstructionId,
    settlementAttemptIds: Object.freeze([...input.settlementAttemptIds]),
    updatedAt: input.now,
  });
}

/**
 * Attach the settlement route this attempt settles through. The route
 * is discrimination-checked FIRST (`assertRouteFamilyDiscriminated` —
 * a conflated route throws `RouteFamilyConflationError`); only legal
 * on a SUBMITTED or CONFIRMED attempt. Returns a NEW frozen record.
 */
export function attachSettlementRoute(
  attempt: MerchantPaymentAttempt,
  route: MerchantCryptoSettlementRoute,
  now: PinnedTimestampMs,
): MerchantPaymentAttempt {
  requireAttempt(attempt);
  requireNow(now);
  if (attempt.state !== "SUBMITTED" && attempt.state !== "CONFIRMED") {
    throw new ValidationError(
      "a settlement route can only be attached to a SUBMITTED or CONFIRMED attempt",
      { attemptId: attempt.id, state: attempt.state },
    );
  }
  assertRouteFamilyDiscriminated(route);
  return Object.freeze({ ...attempt, settlementRoute: route, updatedAt: now });
}

/**
 * Attach the pinned PaymentMethodTranslation realizing this attempt
 * (requested STABLECOIN_CRYPTO method → selected capability chain →
 * actual rail effects → merchant settlement result). Only legal on a
 * SUBMITTED or CONFIRMED attempt. Returns a NEW frozen record.
 */
export function attachTranslation(
  attempt: MerchantPaymentAttempt,
  translation: PinnedPaymentMethodTranslation,
  now: PinnedTimestampMs,
): MerchantPaymentAttempt {
  requireAttempt(attempt);
  requireNow(now);
  if (attempt.state !== "SUBMITTED" && attempt.state !== "CONFIRMED") {
    throw new ValidationError(
      "a translation can only be attached to a SUBMITTED or CONFIRMED attempt",
      { attemptId: attempt.id, state: attempt.state },
    );
  }
  if (
    translation === null ||
    typeof translation !== "object" ||
    !isNonEmptyString(translation.id)
  ) {
    throw new ValidationError("translation must be a PaymentMethodTranslation", {
      attemptId: attempt.id,
    });
  }
  return Object.freeze({ ...attempt, translation, updatedAt: now });
}
