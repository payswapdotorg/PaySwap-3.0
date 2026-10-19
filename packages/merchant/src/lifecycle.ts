/**
 * @payswap/merchant — payment lifecycle (P5-W3, lane R3-W3; PORT+ADAPT
 * of old packages/merchant-checkout/src/lifecycle.ts @ 8a735bf: the
 * wallet-payment submission now flows through the INJECTION PORT's
 * evidence-bearing receipt — money movement DELEGATED).
 *
 * PaymentAttempt lineage over the canonical primitives: every record
 * wraps the attempt machine (PENDING → SUBMITTED →
 * CONFIRMED/FAILED/OUTCOME_UNKNOWN, evidence-mandatory definitive
 * outcomes, reconciliation as the only UNKNOWN exit) and the intent
 * machine. Laws:
 *
 * - ACCEPTANCE LAW (structural): a wallet payment attempt CANNOT exist
 *   without its explicit customer authorization lineage — the
 *   composite record type requires it, so
 *   "authorization-without-explicit-approval" is unrepresentable;
 * - UNKNOWN is preserved: OUTCOME_UNKNOWN is never collapsed to FAILED
 *   or SUCCESS; leaving it requires a reconciliation resolution
 *   through the pinned protocol-plane UnknownOutcomeResolution;
 * - blind-retry forbidden: there is NO resubmit function — a
 *   re-observe is a new observation over the same immutable history
 *   (`recordAmbiguityEvidence` appends evidence linkage without a
 *   state change);
 * - every definitive outcome carries evidence (enforced by the
 *   attempt helpers);
 * - the intent settles ONLY from the attempt's own state — never from
 *   a handoff receipt (the no-success-inference law).
 *
 * Deterministic only: every operation takes an explicit `now`.
 */

import { ValidationError } from "./errors.ts";
import type { PinnedTimestampMs, PinnedUnknownOutcomeResolution } from "./pins/protocol.ts";
import type { PinnedPaymentMethodTranslation } from "./pins/payment.ts";
import { attachSubmission } from "./attempt.ts";
import { beginMerchantPaymentAttempt, submitMerchantPaymentAttempt } from "./attempt.ts";
import {
  abandonMerchantPaymentAttempt,
  attachSettlement,
  attachSettlementRoute,
  attachTranslation,
  confirmMerchantPaymentAttemptFailed,
  confirmMerchantPaymentAttemptSucceeded,
  reportMerchantPaymentAttemptUnknown,
  resolveMerchantPaymentAttemptUnknown,
} from "./attempt-outcomes.ts";
import type { MerchantPaymentAttempt, MerchantPaymentAttemptState } from "./attempt.ts";
import { merchantPaymentAttemptStateMachine } from "./attempt.ts";
import { merchantPaymentIntentStateMachine } from "./intent.ts";
import type { MerchantPaymentIntent, MerchantPaymentIntentState } from "./intent.ts";
import type { CryptoQuote } from "./quotes.ts";
import type { WalletAuthorizationLineage } from "./authorization.ts";
import { requireLineage } from "./authorization.ts";
import type { MerchantCryptoSettlementRoute } from "./settlement-routes.ts";

/**
 * A checkout payment attempt: the canonical MerchantPaymentAttempt
 * PLUS the mandatory explicit customer authorization lineage. The
 * lineage is REQUIRED by the type — a wallet payment without it is
 * structurally unrepresentable.
 */
export interface CheckoutPaymentAttempt {
  readonly attempt: MerchantPaymentAttempt;
  readonly authorization: WalletAuthorizationLineage;
}

function requireIntent(intent: MerchantPaymentIntent): void {
  if (intent === null || typeof intent !== "object" || typeof intent.id !== "string" || intent.id.length === 0) {
    throw new ValidationError("the operation requires a MerchantPaymentIntent");
  }
}

function requireNow(now: PinnedTimestampMs): void {
  if (typeof now !== "bigint") {
    throw new ValidationError("now must be a bigint TimestampMs");
  }
}

function requireRecord(record: CheckoutPaymentAttempt): void {
  if (record === null || typeof record !== "object") {
    throw new ValidationError("the operation requires a CheckoutPaymentAttempt");
  }
}

/**
 * Attach the selected payment method to the intent (the customer chose
 * an option): REQUIRES_PAYMENT_METHOD → REQUIRES_CONFIRMATION through
 * the intent machine. Returns a NEW frozen intent record.
 */
export function attachMethodToIntent(
  intent: MerchantPaymentIntent,
  now: PinnedTimestampMs,
): MerchantPaymentIntent {
  requireIntent(intent);
  requireNow(now);
  const record = merchantPaymentIntentStateMachine.transition(intent.state, "ATTACH_METHOD", {
    now,
    expiresAt: intent.expiresAt,
  });
  return Object.freeze({ ...intent, state: record.to as MerchantPaymentIntentState });
}

/**
 * Confirm the intent (the wallet payment was handed off and accepted
 * at the trusted surface): REQUIRES_CONFIRMATION → PROCESSING.
 * Returns a NEW frozen intent record.
 */
export function confirmIntentSubmission(
  intent: MerchantPaymentIntent,
  now: PinnedTimestampMs,
): MerchantPaymentIntent {
  requireIntent(intent);
  requireNow(now);
  const record = merchantPaymentIntentStateMachine.transition(intent.state, "CONFIRM", {
    now,
    expiresAt: intent.expiresAt,
  });
  return Object.freeze({ ...intent, state: record.to as MerchantPaymentIntentState });
}

/**
 * Submit a wallet payment attempt: begins the canonical attempt under
 * the option's quote (which must be unexpired), submits it, attaches
 * the external submission reference from the authorization lineage,
 * and binds the lineage to the composite record. This is the ONLY
 * attempt-submission path in the package — there is no resubmit
 * (blind-retry forbidden; the machine's SUBMIT transition exists only
 * from PENDING). The authorization's chain must be the chain the quote
 * was accepted on.
 */
export function submitWalletPaymentAttempt(input: {
  readonly attemptId: string;
  readonly intent: MerchantPaymentIntent;
  readonly quote: CryptoQuote;
  readonly authorization: WalletAuthorizationLineage;
  readonly now: PinnedTimestampMs;
}): CheckoutPaymentAttempt {
  if (typeof input.attemptId !== "string" || input.attemptId.length === 0) {
    throw new ValidationError("attemptId must be a non-empty string");
  }
  requireIntent(input.intent);
  requireNow(input.now);
  requireLineage(input.authorization, "submitWalletPaymentAttempt");
  if (input.authorization.chainRef !== input.quote.chainId) {
    throw new ValidationError(
      "the authorized chain must be the chain the quote was accepted on",
      {
        authorizedChain: input.authorization.chainRef,
        quoteChain: input.quote.chainId,
      },
    );
  }
  const pending = beginMerchantPaymentAttempt({
    id: input.attemptId,
    intent: input.intent,
    quote: input.quote,
    now: input.now,
  });
  const submitted = submitMerchantPaymentAttempt(pending, input.quote, input.now);
  const withSubmission = attachSubmission(submitted, {
    externalTxRef: input.authorization.externalSubmissionRef,
    now: input.now,
  });
  return Object.freeze({
    attempt: withSubmission,
    authorization: input.authorization,
  });
}

/** Abandon a PENDING attempt (never a submitted one — the machine's law). */
export function abandonCheckoutAttempt(
  record: CheckoutPaymentAttempt,
  now: PinnedTimestampMs,
): CheckoutPaymentAttempt {
  requireRecord(record);
  requireNow(now);
  const abandoned = abandonMerchantPaymentAttempt(record.attempt, now);
  return Object.freeze({ ...record, attempt: abandoned });
}

/**
 * Attach the settlement route this attempt settles through
 * (discrimination-checked by the route guard). Only legal on SUBMITTED
 * or CONFIRMED attempts.
 */
export function attachAttemptSettlementRoute(
  record: CheckoutPaymentAttempt,
  route: MerchantCryptoSettlementRoute,
  now: PinnedTimestampMs,
): CheckoutPaymentAttempt {
  requireRecord(record);
  requireNow(now);
  const attempt = attachSettlementRoute(record.attempt, route, now);
  return Object.freeze({ ...record, attempt });
}

/** Attach the pinned PaymentMethodTranslation realizing this attempt. */
export function attachAttemptTranslation(
  record: CheckoutPaymentAttempt,
  translation: PinnedPaymentMethodTranslation,
  now: PinnedTimestampMs,
): CheckoutPaymentAttempt {
  requireRecord(record);
  requireNow(now);
  const attempt = attachTranslation(record.attempt, translation, now);
  return Object.freeze({ ...record, attempt });
}

/** Attach the protocol settlement mapping (only on a CONFIRMED attempt). */
export function attachAttemptSettlement(
  record: CheckoutPaymentAttempt,
  input: {
    readonly settlementInstructionId: string;
    readonly settlementAttemptIds: readonly string[];
    readonly now: PinnedTimestampMs;
  },
): CheckoutPaymentAttempt {
  requireRecord(record);
  const attempt = attachSettlement(record.attempt, input);
  return Object.freeze({ ...record, attempt });
}


export {
  observeAttemptOutcome,
  recordAmbiguityEvidence,
  resolveAttemptUnknown,
  settleIntentOutcome,
  resolveIntentUnknown,
  attemptStatusView,
  attemptMayObserveOutcome,
} from "./lifecycle-outcomes.ts";
export type { AttemptOutcomeObservation } from "./lifecycle-outcomes.ts";
