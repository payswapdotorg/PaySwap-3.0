/**
 * @payswap/provider-runtime — the Stripe GLOBAL PAYOUTS status, event and
 * exception vocabulary (P27-B; the dated manage-payouts facts, re-verified
 * 2026-11-03 — see payouts-evidence.ts).
 *
 * The status laws are the live docs' own vocabulary (retrieved 2026-11-03):
 * - OutboundPayment statuses: processing / failed / canceled / posted /
 *   returned. "A posted status doesn't guarantee that your recipient has
 *   received money, because their bank might delay the release of funds."
 * - Status-detail reasons: processing.reason = under_review (a payout held
 *   for Stripe review); failed.reason = review_rejected;
 *   failed.reason = fx_rate_drift_exceeded_after_review.
 * - Pre-creation rejection error code: outbound_payment_cannot_be_processed
 *   ("If Stripe rejects a payout before creating it, the API returns the
 *   outbound_payment_cannot_be_processed error code and doesn't create an
 *   OutboundPayment").
 * - The recipient-verification error code observed on the send-money page:
 *   outbound_payment_recipient_verification_missing.
 * - PayoutIntent statuses (the docs' scheduled-payout surface — the v2 API
 *   is NOT pinned, see payouts-product.ts's census gap; recorded here so the
 *   vocabulary is complete for the TL integration): pending / processing /
 *   requires_action / posted / canceled.
 * - Returned payouts: "Stripe returns the funds to you in a separate
 *   transaction"; the return reason lands in the OutboundPayment's
 *   status_details.returned field; "typically returned within 2–3 business
 *   days".
 *
 * THE CLASSIFIER never guesses: an unrecognized body yields a typed
 * UNRECOGNIZED record (fail-closed), never an invented status.
 */

import { STRIPE_GLOBAL_PAYOUTS_EVIDENCE_STAMP } from './payouts-evidence.ts';

/** The dated OutboundPayment status vocabulary (the pinned v1 object's statuses). */
export const STRIPE_GLOBAL_PAYOUTS_OUTBOUND_PAYMENT_STATUSES = [
  'processing',
  'failed',
  'canceled',
  'posted',
  'returned',
] as const;
export type StripeGlobalPayoutsOutboundPaymentStatus =
  (typeof STRIPE_GLOBAL_PAYOUTS_OUTBOUND_PAYMENT_STATUSES)[number];

/** The dated PayoutIntent status vocabulary (the unpinned v2 surface — disclosure only). */
export const STRIPE_GLOBAL_PAYOUTS_PAYOUT_INTENT_STATUSES = [
  'pending',
  'processing',
  'requires_action',
  'posted',
  'canceled',
] as const;
export type StripeGlobalPayoutsPayoutIntentStatus =
  (typeof STRIPE_GLOBAL_PAYOUTS_PAYOUT_INTENT_STATUSES)[number];

/** The dated status-detail reason vocabulary (docs 2026-11-03). */
export const STRIPE_GLOBAL_PAYOUTS_STATUS_DETAIL_REASONS = [
  'under_review',
  'review_rejected',
  'fx_rate_drift_exceeded_after_review',
] as const;
export type StripeGlobalPayoutsStatusDetailReason =
  (typeof STRIPE_GLOBAL_PAYOUTS_STATUS_DETAIL_REASONS)[number];

/** The dated provider error codes for payout risk review / recipient verification. */
export const STRIPE_GLOBAL_PAYOUTS_ERROR_CODES = [
  'outbound_payment_cannot_be_processed',
  'outbound_payment_recipient_verification_missing',
] as const;
export type StripeGlobalPayoutsErrorCode =
  (typeof STRIPE_GLOBAL_PAYOUTS_ERROR_CODES)[number];

/** The typed, fail-closed status classification of one provider payout body. */
export interface StripeGlobalPayoutsOutboundPaymentClassification {
  /** 'RECOGNIZED' = the body carried a dated status; 'UNRECOGNIZED' = fail-closed. */
  readonly kind: 'RECOGNIZED' | 'UNRECOGNIZED';
  readonly status?: StripeGlobalPayoutsOutboundPaymentStatus;
  /** The status_details.processing/failed/returned reason, when the provider stated one. */
  readonly statusDetailReason?: string;
  /** The provider's `cancelable` field (docs: cancel only while true). */
  readonly cancelable?: boolean;
  readonly outboundPaymentId?: string;
  readonly raw?: Readonly<Record<string, unknown>>;
  /** The D10 evidence stamp for the vocabulary the classification used. */
  readonly evidence: typeof STRIPE_GLOBAL_PAYOUTS_EVIDENCE_STAMP;
}

function readReason(statusDetails: Readonly<Record<string, unknown>> | undefined, key: 'processing' | 'failed' | 'returned'): string | undefined {
  const inner = statusDetails?.[key];
  if (inner === null || typeof inner !== 'object') return undefined;
  const reason = (inner as Readonly<Record<string, unknown>>).reason;
  return typeof reason === 'string' && reason.length > 0 ? reason : undefined;
}

/**
 * Classify one provider OutboundPayment body (the v1 Treasury object the
 * pinned slice reads back). Fail-closed: no status string, or a status
 * outside the dated vocabulary, yields kind 'UNRECOGNIZED' with the raw body
 * preserved for reconciliation — never a guessed status (INV-24).
 */
export function classifyStripeGlobalPayoutsOutboundPayment(
  body: unknown,
): StripeGlobalPayoutsOutboundPaymentClassification {
  const evidence = STRIPE_GLOBAL_PAYOUTS_EVIDENCE_STAMP;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { kind: 'UNRECOGNIZED', evidence };
  }
  const record = body as Readonly<Record<string, unknown>>;
  const raw = Object.freeze({ ...record });
  const status =
    typeof record.status === 'string' && record.status.length > 0 ? (record.status as string) : undefined;
  if (status === undefined) {
    return { kind: 'UNRECOGNIZED', evidence, ...(typeof record.id === 'string' ? { outboundPaymentId: record.id } : {}), raw };
  }
  if (!(STRIPE_GLOBAL_PAYOUTS_OUTBOUND_PAYMENT_STATUSES as readonly string[]).includes(status)) {
    return { kind: 'UNRECOGNIZED', evidence, ...(typeof record.id === 'string' ? { outboundPaymentId: record.id } : {}), raw };
  }
  const statusDetails =
    record.status_details !== null && typeof record.status_details === 'object' && !Array.isArray(record.status_details)
      ? (record.status_details as Readonly<Record<string, unknown>>)
      : undefined;
  const reason =
    readReason(statusDetails, 'processing') ?? readReason(statusDetails, 'failed') ?? readReason(statusDetails, 'returned');
  return {
    kind: 'RECOGNIZED',
    status: status as StripeGlobalPayoutsOutboundPaymentStatus,
    ...(reason !== undefined ? { statusDetailReason: reason } : {}),
    ...(typeof record.cancelable === 'boolean' ? { cancelable: record.cancelable } : {}),
    ...(typeof record.id === 'string' ? { outboundPaymentId: record.id } : {}),
    raw,
    evidence,
  };
}

/**
 * Is the payout still cancellable per the dated docs law? ("You can cancel
 * the payout while its OutboundPayment's cancelable field is true.") A
 * missing `cancelable` field means NO — fail-closed.
 */
export function globalPayoutsOutboundPaymentCancellable(
  classification: StripeGlobalPayoutsOutboundPaymentClassification,
): boolean {
  if (classification.kind !== 'RECOGNIZED') return false;
  if (classification.status !== 'processing') return false;
  return classification.cancelable === true;
}

/** The honest arrival disclosure for a posted payout (the docs' own caveat). */
export const STRIPE_GLOBAL_PAYOUTS_POSTED_IS_NOT_DELIVERY_NOTE =
  'a posted status doesn\'t guarantee that the recipient has received money — their bank might delay the release of funds; use the payout trace ID to investigate (docs 2026-11-03)' as const;
