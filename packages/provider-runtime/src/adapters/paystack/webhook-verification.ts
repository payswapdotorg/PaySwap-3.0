/**
 * @payswap/provider-runtime — the Paystack webhook verification module
 * (P27-C, ADR-0020 D4): the full verification path + the typed event
 * extraction feeding collection/payout reconciliation. The claimed
 * signature scheme (the constants, the crypto seam, the shared
 * signature check) lives in webhook-signature.ts — split per the
 * <=400-line file law (the Stripe webhook-signature/webhook-verification
 * precedent).
 *
 * THE CLAIM-LEVEL FACTS (honestly recorded): the event names below are
 * the registration's claimed vocabulary; the docs were UNREACHABLE at
 * the 2026-11-03 station (see the P27-C lane report) and the
 * re-verification is the operator-gated harness tier. A wrong event
 * name fails SOFT (VERIFIED_UNMAPPED — nothing fabricated); a wrong
 * signature scheme fails CLOSED (SIGNATURE_INVALID). The scheme carries
 * NO timestamp, so the replay defense here is the EVENT-KEY SINGLE-USE
 * CONSUMPTION law (below), not a signature-time tolerance window.
 *
 * THE VERIFICATION PATH (pinned order; the FIRST failure wins):
 *   1. delivery shape        → MALFORMED_DELIVERY
 *   2. constant-time HMAC    → SIGNATURE_INVALID
 *   3. body parse + shape    → UNPARSEABLE_EVENT_BODY
 *   4. typed extraction      → VERIFIED / VERIFIED_UNMAPPED
 *   5. event-key single use  → EVENT_ALREADY_CONSUMED
 *
 * LAWS (the P14-B stripe/webhook-verification.ts precedent, applied):
 * - TYPED EXTRACTION, NEVER GUESSES: only the typed event names in the
 *   claim vocabulary extract to the typed feed; any other signed event
 *   name is VERIFIED_UNMAPPED (signature-good, reported, nothing
 *   invented); an unparseable or shape-incomplete body is a typed
 *   UNPARSEABLE_EVENT_BODY refusal — a signed body is not a licence to
 *   fabricate an event.
 * - CONSUMPTION LAW: only a COMPLETE typed verification consumes the
 *   derived event key (`event name | the data reference the verified
 *   body carries`); a second delivery of the same key is refused
 *   EVENT_ALREADY_CONSUMED, so VERIFIED is answered at most once per
 *   event. Unmapped events carry no derivable reference and are never
 *   consumed (they resolve nothing — re-reporting them is harmless).
 * - RECONCILIATION FEED (the reconciled-attempt law): ONLY
 *   `charge.success` and `transfer.success` map to CONFIRMED evidence
 *   and ONLY `transfer.failed` maps to FAILED evidence; a
 *   `transfer.reversed` event is a typed OBSERVATION, never a
 *   resolution (a reversal after success is new financial truth for the
 *   mission layer, not a retroactive classification of the transfer).
 * - SECRETS: the webhook secret arrives by injection at the composition
 *   edge; every result shape is escape-scanned (assertNoSecretMaterial
 *   — a leak THROWS, never silently sanitized).
 * - HONEST DELIVERY BOUNDARY: no inbound public endpoint exists in this
 *   station, so live provider→station delivery is NOT claimed and never
 *   simulated. The battery signs events LOCALLY; the operator-gated
 *   harness verifies the machinery with real secret material supplied
 *   through the station secret channel.
 */

import { ValidationError } from '../../errors.ts';
import { assertNoSecretMaterial } from '../../redaction.ts';
import type { WebhookSignatureVerifier } from '../../events.ts';
import { PAYSTACK_WEBHOOK_VERIFIER_ID, verifyPaystackWebhookSignature } from './webhook-signature.ts';
import type { PaystackWebhookCrypto } from './webhook-signature.ts';

/** One Paystack webhook delivery exactly as the verification module consumes it. */
export interface PaystackWebhookDelivery {
  /** The raw `x-paystack-signature` header value. */
  readonly signatureHeader: string;
  /** The raw request body the provider signed (never re-serialized). */
  readonly body: string;
}

/** The typed refusal vocabulary (each negative control is pinned). */
export type PaystackWebhookRefusalKind =
  | 'MALFORMED_DELIVERY'
  | 'SIGNATURE_INVALID'
  | 'UNPARSEABLE_EVENT_BODY'
  | 'EVENT_ALREADY_CONSUMED';

/** The claimed typed event vocabulary (K4-adjacent; see the file header). */
export const PAYSTACK_WEBHOOK_EVENT_NAMES = [
  'charge.success',
  'transfer.success',
  'transfer.failed',
  'transfer.reversed',
] as const;
export type PaystackWebhookEventName = (typeof PAYSTACK_WEBHOOK_EVENT_NAMES)[number];

/** A verified, typed collection event (charge.success — secret-free by construction). */
export interface PaystackChargeEvent {
  readonly eventName: 'charge.success';
  /** The derived event key (the dedupe/consumption key). */
  readonly eventId: string;
  /** The transaction's unique reference (the caller-scoped collection reference). */
  readonly reference: string;
  /** The provider's status word, carried verbatim. */
  readonly status: string;
  /** Amount in minor units when the body carries one. */
  readonly amount: number | null;
  /** Lowercase currency code when the body carries one. */
  readonly currency: string | null;
}

/** A verified, typed payout event (the transfer.* family). */
export interface PaystackTransferEvent {
  readonly eventName: 'transfer.success' | 'transfer.failed' | 'transfer.reversed';
  /** The derived event key (the dedupe/consumption key). */
  readonly eventId: string;
  /** The transfer's unique reference when the body carries one. */
  readonly reference: string | null;
  /** The transfer code (`TRF_…`) when the body carries one. */
  readonly transferCode: string | null;
  /** The provider's status word, carried verbatim (reversed stays an observation). */
  readonly status: string | null;
}

/** The verification module's answer (typed, frozen, secret-free). */
export type PaystackWebhookVerificationResult =
  | { readonly kind: 'VERIFIED'; readonly event: PaystackChargeEvent | PaystackTransferEvent }
  | {
      /** Signature-good but not a typed event name in the claim vocabulary. */
      readonly kind: 'VERIFIED_UNMAPPED';
      readonly eventName: string;
    }
  | {
      readonly kind: 'REFUSED';
      readonly refusal: {
        readonly kind: PaystackWebhookRefusalKind;
        readonly message: string;
      };
    };

/**
 * The reconciliation evidence a VERIFIED terminal event supplies to the
 * mission runtime's reconcile path (the reconciled-attempt law). ONLY
 * `charge.success`/`transfer.success` resolve to CONFIRMED and ONLY
 * `transfer.failed` resolves to FAILED; a `transfer.reversed` event is
 * an observation (null) — never a retroactive resolution.
 */
export type PaystackWebhookReconciliationEvidence =
  | { readonly resolvedTo: 'CONFIRMED'; readonly reference: string }
  | { readonly resolvedTo: 'FAILED'; readonly reference: string };

/**
 * Map a typed event to reconciliation evidence (the terminal-only law).
 * A transfer event whose body carried no match key cannot supply
 * evidence (the extraction law refuses such bodies, so this is the
 * fail-closed guard) — null, never a fabricated match key.
 */
export function paystackWebhookReconciliationEvidenceOf(
  event: PaystackChargeEvent | PaystackTransferEvent,
): PaystackWebhookReconciliationEvidence | null {
  if (event.eventName === 'charge.success' || event.eventName === 'transfer.success') {
    const reference =
      event.eventName === 'charge.success' ? event.reference : event.reference ?? event.transferCode;
    if (reference === null || reference.length === 0) {
      return null;
    }
    return { resolvedTo: 'CONFIRMED', reference };
  }
  if (event.eventName === 'transfer.failed') {
    const reference = event.reference ?? event.transferCode;
    if (reference === null || reference.length === 0) {
      return null;
    }
    return { resolvedTo: 'FAILED', reference };
  }
  // transfer.reversed: a typed OBSERVATION, never a resolution — a
  // reversal after success is new financial truth for the mission layer.
  return null;
}

/**
 * The consumed-set store: single consumption of one derived event key
 * (monotonic). The in-memory default serves tests; a durable
 * composition injects a store backed by the mission store's durability law.
 */
export interface PaystackWebhookConsumedEventStore {
  /** Atomically mark consumed; false iff already consumed (a replay). */
  consumeOnce(eventKey: string): boolean;
}

/** The in-memory default (tests; deterministic; monotonic by set law). */
export function createInMemoryPaystackWebhookConsumedStore(): PaystackWebhookConsumedEventStore {
  const consumed = new Set<string>();
  return {
    consumeOnce(eventKey: string): boolean {
      if (consumed.has(eventKey)) {
        return false;
      }
      consumed.add(eventKey);
      return true;
    },
  };
}

/** The module deps (all injected; the secret never leaves this closure). */
export interface PaystackWebhookVerificationModuleDeps {
  /** The webhook secret — composition edge only (the station secret channel). */
  readonly webhookSecret: string;
  /** The injected crypto seam (node:crypto at the edge; fakes in tests). */
  readonly crypto: PaystackWebhookCrypto;
  /** Defaults to the in-memory store (tests); compositions inject durable. */
  readonly consumedStore?: PaystackWebhookConsumedEventStore;
}

function refusal(
  kind: PaystackWebhookRefusalKind,
  message: string,
): PaystackWebhookVerificationResult {
  return Object.freeze({
    kind: 'REFUSED' as const,
    refusal: Object.freeze({ kind, message }),
  });
}

/** The typed event names the typed extraction covers (frozen vocabulary). */
const TYPED_EVENT_NAMES: ReadonlySet<string> = new Set<string>(PAYSTACK_WEBHOOK_EVENT_NAMES);

/**
 * Create the verification module: `(delivery) => result`. See the file
 * header for the pinned check order and the consumption law.
 */
export function createPaystackWebhookVerificationModule(
  deps: PaystackWebhookVerificationModuleDeps,
): (delivery: PaystackWebhookDelivery) => PaystackWebhookVerificationResult {
  if (typeof deps.webhookSecret !== 'string' || deps.webhookSecret.length < 8) {
    throw new ValidationError(
      'a Paystack webhook secret is required at the composition edge (supplied through the station secret channel, never chat)',
    );
  }
  const consumedStore = deps.consumedStore ?? createInMemoryPaystackWebhookConsumedStore();
  const secrets = [deps.webhookSecret];
  const scan = (
    result: PaystackWebhookVerificationResult,
  ): PaystackWebhookVerificationResult => {
    assertNoSecretMaterial(result, secrets, 'paystack webhook verification result');
    return result;
  };

  return (delivery: PaystackWebhookDelivery): PaystackWebhookVerificationResult => {
    if (
      delivery === null ||
      typeof delivery !== 'object' ||
      typeof delivery.signatureHeader !== 'string' ||
      delivery.signatureHeader.length === 0 ||
      typeof delivery.body !== 'string' ||
      delivery.body.length === 0
    ) {
      return scan(refusal('MALFORMED_DELIVERY', 'the delivery shape is incomplete'));
    }
    // The claimed scheme (webhook-signature.ts): HMAC-SHA512 over the
    // RAW body, constant-time comparison — the one shared seam.
    if (
      !verifyPaystackWebhookSignature({
        crypto: deps.crypto,
        webhookSecret: deps.webhookSecret,
        signature: delivery.signatureHeader,
        body: delivery.body,
      })
    ) {
      return scan(refusal('SIGNATURE_INVALID', 'the signature does not match the raw body'));
    }

    // Body parse + shape (a signed body is not a licence to fabricate).
    let root: { event?: unknown; data?: unknown };
    try {
      const json: unknown = JSON.parse(delivery.body);
      if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        return scan(refusal('UNPARSEABLE_EVENT_BODY', 'the signed body is not an event object'));
      }
      root = json as { event?: unknown; data?: unknown };
    } catch {
      return scan(refusal('UNPARSEABLE_EVENT_BODY', 'the signed body is not valid JSON'));
    }
    if (typeof root.event !== 'string' || root.event.length === 0) {
      return scan(refusal('UNPARSEABLE_EVENT_BODY', 'the signed event carries no event name'));
    }
    if (!TYPED_EVENT_NAMES.has(root.event)) {
      // Signature-good but outside the typed vocabulary: reported, never
      // invented — and never consumed (no derivable key; resolves nothing).
      return scan(
        Object.freeze({
          kind: 'VERIFIED_UNMAPPED' as const,
          eventName: root.event,
        }),
      );
    }
    const data =
      root.data !== null && typeof root.data === 'object' && !Array.isArray(root.data)
        ? (root.data as Record<string, unknown>)
        : undefined;
    if (data === undefined) {
      return scan(refusal('UNPARSEABLE_EVENT_BODY', 'the typed event carries no data object'));
    }
    const reference = typeof data['reference'] === 'string' ? data['reference'] : null;
    const transferCode =
      typeof data['transfer_code'] === 'string' && data['transfer_code'].length > 0
        ? data['transfer_code']
        : null;
    const status = typeof data['status'] === 'string' ? data['status'] : null;

    // THE CONSUMPTION LAW: the event key is derived from the VERIFIED
    // content (never caller-supplied); only a complete typed extraction
    // consumes it, so VERIFIED is answered at most once per event key.
    if (root.event === 'charge.success') {
      if (reference === null || status === null) {
        return scan(
          refusal('UNPARSEABLE_EVENT_BODY', 'the charge event carries no reference or status'),
        );
      }
      const eventId = `${root.event}|${reference}`;
      if (!consumedStore.consumeOnce(eventId)) {
        return scan(refusal('EVENT_ALREADY_CONSUMED', 'the event key was already consumed (replay refused)'));
      }
      const amount =
        typeof data['amount'] === 'number' && Number.isSafeInteger(data['amount'])
          ? data['amount']
          : null;
      const currency = typeof data['currency'] === 'string' ? data['currency'] : null;
      return scan(
        Object.freeze({
          kind: 'VERIFIED' as const,
          event: Object.freeze({
            eventName: 'charge.success' as const,
            eventId,
            reference,
            status,
            amount,
            currency,
          }),
        }),
      );
    }
    // The transfer.* family: the reference OR the transfer code is the
    // identity a mission matches on (fail-closed: at least one must be
    // present in the verified body).
    if (reference === null && transferCode === null) {
      return scan(
        refusal('UNPARSEABLE_EVENT_BODY', 'the transfer event carries neither a reference nor a transfer code'),
      );
    }
    const eventId = `${root.event}|${reference ?? transferCode}`;
    if (!consumedStore.consumeOnce(eventId)) {
      return scan(refusal('EVENT_ALREADY_CONSUMED', 'the event key was already consumed (replay refused)'));
    }
    return scan(
      Object.freeze({
        kind: 'VERIFIED' as const,
        event: Object.freeze({
          eventName: root.event as 'transfer.success' | 'transfer.failed' | 'transfer.reversed',
          eventId,
          reference,
          transferCode,
          status,
        }),
      }),
    );
  };
}

/**
 * The events.ts INGESTOR PLUG (the pluggable WebhookSignatureVerifier
 * contract): the signature check only — the ingestor applies its own
 * replay window over the caller-supplied signature timestamp (the
 * claimed Paystack scheme carries no timestamp in the signature itself;
 * a composition edge that wants the ingestor's window supplies the
 * event's own creation timestamp as the delivery's signatureTimestamp).
 */
export function createPaystackWebhookIngestorVerifier(deps: {
  readonly webhookSecret: string;
  readonly crypto: PaystackWebhookCrypto;
}): WebhookSignatureVerifier {
  return Object.freeze({
    verifierId: PAYSTACK_WEBHOOK_VERIFIER_ID,
    verify(input: {
      readonly delivery: { readonly signature: string };
      readonly canonicalBody: string;
    }):
      | { readonly valid: true }
      | { readonly valid: false; readonly reason: string } {
      const ok = verifyPaystackWebhookSignature({
        crypto: deps.crypto,
        webhookSecret: deps.webhookSecret,
        signature: input.delivery.signature,
        body: input.canonicalBody,
      });
      return ok ? { valid: true } : { valid: false, reason: 'the signature does not match the canonical body' };
    },
  });
}
