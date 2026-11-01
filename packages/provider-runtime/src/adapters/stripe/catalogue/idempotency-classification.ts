/**
 * @payswap/provider-runtime — the per-operation IDEMPOTENCY CLASSIFICATION
 * (P24-1, ADR-0017 D6 + handoff §5.3).
 *
 * Every state-changing operation declares its endpoint-specific idempotency
 * behavior here (the overlay law); the transport honors the class:
 * - v1 state-changing POSTs carry the `Idempotency-Key` header — Stripe
 *   REPLAYS THE STORED RESPONSE for a repeated key (the wire mechanism the
 *   mission registrar owns; ADR-0008 D3);
 * - v1 POST searches are read-like: no key, naturally safe to re-issue;
 * - v2 POSTs have NO v1-style header replay contract — dedupe happens via
 *   operation-specific identifier fields (e.g. meter-event `identifier`)
 *   or read-back; AUTOMATIC RETRY IS REFUSED (never v1 semantics applied
 *   to v2 — handoff §5.3);
 * - DELETEs are not blindly re-issuable (a repeat may error on the already
 *   deleted resource) — ambiguity resolves by read-back;
 * - GETs are naturally idempotent reads.
 */

import type { StripeOperationCensusRecord } from './census.ts';

/** The idempotency vocabulary (the transport + registrar consume it). */
export const STRIPE_IDEMPOTENCY_CLASSES = [
  'NATURALLY_IDEMPOTENT_READ',
  'V1_IDEMPOTENCY_KEY_HEADER',
  'V1_READ_SEARCH_NO_KEY',
  'V2_IDENTIFIER_OR_READ_BACK_ONLY',
  'DELETE_NO_AUTOMATIC_RETRY',
] as const;
export type StripeIdempotencyClass = (typeof STRIPE_IDEMPOTENCY_CLASSES)[number];

/**
 * THE CLASSIFIER (reviewed derivation — namespace + method + effect class;
 * the census record is the single input, never the raw spec).
 */
export function stripeIdempotencyClassOf(
  record: Pick<StripeOperationCensusRecord, 'apiNamespace' | 'method' | 'effectClass'>,
): StripeIdempotencyClass {
  if (record.method === 'GET') return 'NATURALLY_IDEMPOTENT_READ';
  if (record.method === 'DELETE') return 'DELETE_NO_AUTOMATIC_RETRY';
  // POST below.
  if (record.apiNamespace === 'v2') {
    return 'V2_IDENTIFIER_OR_READ_BACK_ONLY';
  }
  if (record.effectClass === 'READ_ONLY') {
    // POST /search-style reads (handoff §7.1: POST can be a read-like search).
    return 'V1_READ_SEARCH_NO_KEY';
  }
  return 'V1_IDEMPOTENCY_KEY_HEADER';
}

/** May an Idempotency-Key header be bound for this operation? */
export function stripeIdempotencyKeyAllowed(
  record: Pick<StripeOperationCensusRecord, 'apiNamespace' | 'method' | 'effectClass'>,
): boolean {
  return stripeIdempotencyClassOf(record) === 'V1_IDEMPOTENCY_KEY_HEADER';
}

/** May an automatic (no-reconciliation) retry be issued? */
export function stripeAutomaticRetryAllowed(
  record: Pick<StripeOperationCensusRecord, 'apiNamespace' | 'method' | 'effectClass'>,
): boolean {
  const clazz = stripeIdempotencyClassOf(record);
  return (
    clazz === 'NATURALLY_IDEMPOTENT_READ' ||
    clazz === 'V1_IDEMPOTENCY_KEY_HEADER' ||
    clazz === 'V1_READ_SEARCH_NO_KEY'
  );
}
