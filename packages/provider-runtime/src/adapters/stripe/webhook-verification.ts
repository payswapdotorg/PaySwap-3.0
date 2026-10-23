/**
 * @payswap/provider-runtime — the Stripe webhook verification module
 * (P14-B, ADR-0008 D4): the full verification path and the typed event
 * extraction feeding the mission reconciliation. The signature scheme
 * itself (header parser, crypto seam, tolerance constants, the ingestor
 * plug) lives in webhook-signature.ts (the <=400-line file law).
 *
 * THE VERIFICATION PATH (pinned order; the FIRST failure wins — each
 * negative control is deterministic and independently pinnable):
 *   1. header shape        → MALFORMED_SIGNATURE_HEADER
 *   2. freshness window    → FUTURE_TIMESTAMP / TIMESTAMP_OUTSIDE_WINDOW
 *   3. constant-time v1    → SIGNATURE_INVALID
 *   4. body parse + shape  → UNPARSEABLE_EVENT_BODY
 *   5. event-id single use → EVENT_ALREADY_CONSUMED
 *   6. typed extraction    → VERIFIED / VERIFIED_UNMAPPED
 *
 * LAWS:
 * - TYPED EXTRACTION, NEVER GUESSES: only the four payment-intent event
 *   types extract to the typed vocabulary; any other signed event type
 *   is VERIFIED_UNMAPPED (signature-good, observation recorded, nothing
 *   invented); an unparseable or shape-incomplete body is a typed
 *   UNPARSEABLE_EVENT_BODY refusal — a signed body is not a licence to
 *   fabricate an event.
 * - CONSUMPTION LAW: only a COMPLETE verification consumes the event id
 *   — every refusal path (including unparseable bodies) leaves the id
 *   re-deliverable; a second delivery of a consumed id is refused
 *   EVENT_ALREADY_CONSUMED, so VERIFIED is answered at most once per id
 *   (the caller maps that to exactly-once reconcile application).
 * - RECONCILIATION FEED (the reconciled-attempt law): ONLY
 *   `payment_intent.succeeded` maps to CONFIRMED evidence and ONLY
 *   `payment_intent.payment_failed` maps to FAILED evidence;
 *   `processing` and `amount_captured_updated` are observations, never
 *   resolutions (an UNKNOWN attempt stays UNKNOWN until a terminal
 *   event or a retrieval closes it — INV-04).
 * - SECRETS: every result shape is escape-scanned (assertNoSecretMaterial
 *   — a leak THROWS, never silently sanitized).
 * - HONEST DELIVERY BOUNDARY (verbatim from ADR-0008 D4): no inbound
 *   public endpoint exists in this station, so live provider→station
 *   delivery is NOT claimed and never simulated. The battery signs
 *   events LOCALLY; the P14-D receipt signs them with the REAL
 *   operator whsec_ key (machinery verified with real key material).
 */

import { ValidationError } from '../../errors.ts';
import type { RuntimeClock, TimestampMs } from '../../clock.ts';
import { assertNoSecretMaterial } from '../../redaction.ts';
import {
  STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS,
  STRIPE_WEBHOOK_TOLERANCE_SECONDS,
  parseStripeSignatureHeader,
  type StripeWebhookCrypto,
} from './webhook-signature.ts';

/** One webhook delivery exactly as the verification module consumes it. */
export interface StripeWebhookDelivery {
  /** The Stripe event id (root payload `id`, `evt_…`) — the dedupe key. */
  readonly eventId: string;
  /** The raw `Stripe-Signature` header value. */
  readonly signatureHeader: string;
  /** The raw request body the provider signed (never re-serialized). */
  readonly body: string;
}

/** The typed refusal vocabulary (each negative control is pinned). */
export type StripeWebhookRefusalKind =
  | 'MALFORMED_SIGNATURE_HEADER'
  | 'TIMESTAMP_OUTSIDE_WINDOW'
  | 'FUTURE_TIMESTAMP'
  | 'SIGNATURE_INVALID'
  | 'EVENT_ALREADY_CONSUMED'
  | 'UNPARSEABLE_EVENT_BODY';

/** The four payment-intent event types the feed vocabulary covers. */
export type StripePaymentIntentEventType =
  | 'payment_intent.succeeded'
  | 'payment_intent.processing'
  | 'payment_intent.amount_captured_updated'
  | 'payment_intent.payment_failed';

/** A verified, typed payment-intent event (secret-free by construction). */
export interface StripePaymentIntentEvent {
  readonly eventType: StripePaymentIntentEventType;
  readonly eventId: string;
  /** Provider event creation time (epoch ms). */
  readonly createdAt: TimestampMs;
  /** The PaymentIntent id (`pi_…`) — the provider reference missions match on. */
  readonly paymentIntentId: string;
  /** The intent status the event carries (e.g. 'succeeded', 'processing'). */
  readonly status: string;
  /** Amount in minor units when present. */
  readonly amount: number | null;
  /** Lowercase currency code when present. */
  readonly currency: string | null;
  /** The failure code when the event carries one (payment_failed only). */
  readonly lastPaymentErrorCode: string | null;
}

/** The verification module's answer (typed, frozen, secret-free). */
export type StripeWebhookVerificationResult =
  | { readonly kind: 'VERIFIED'; readonly event: StripePaymentIntentEvent }
  | {
      /** Signature-good but not a mapped payment-intent event type. */
      readonly kind: 'VERIFIED_UNMAPPED';
      readonly eventType: string;
      readonly eventId: string;
    }
  | {
      readonly kind: 'REFUSED';
      readonly refusal: {
        readonly kind: StripeWebhookRefusalKind;
        readonly message: string;
      };
    };

/**
 * The reconciliation evidence a VERIFIED terminal event supplies to the
 * mission runtime's reconcile path (the reconciled-attempt law). The
 * composition edge matches `paymentIntentId` against the attempt's
 * provider references and calls reconcile exactly once.
 */
export type StripeWebhookReconciliationEvidence =
  | { readonly resolvedTo: 'CONFIRMED'; readonly paymentIntentId: string }
  | {
      readonly resolvedTo: 'FAILED';
      readonly paymentIntentId: string;
      readonly failureCode: string | null;
    };

/**
 * Map a typed event to reconciliation evidence. ONLY the two terminal
 * event types resolve; processing/amount_captured_updated return null
 * (observations — an UNKNOWN attempt stays UNKNOWN until terminal
 * evidence or a canonical retrieval closes it).
 */
export function stripeReconciliationEvidenceOf(
  event: StripePaymentIntentEvent,
): StripeWebhookReconciliationEvidence | null {
  if (event.eventType === 'payment_intent.succeeded') {
    return { resolvedTo: 'CONFIRMED', paymentIntentId: event.paymentIntentId };
  }
  if (event.eventType === 'payment_intent.payment_failed') {
    return {
      resolvedTo: 'FAILED',
      paymentIntentId: event.paymentIntentId,
      failureCode: event.lastPaymentErrorCode,
    };
  }
  return null;
}

/**
 * The consumed-set store: single consumption of an event id (monotonic).
 * The in-memory default serves tests; a durable composition injects a
 * store backed by the mission store's durability law.
 */
export interface StripeWebhookConsumedEventStore {
  /** Atomically mark consumed; false iff already consumed (a replay). */
  consumeOnce(eventId: string): boolean;
}

/** The in-memory default (tests; deterministic; monotonic by set law). */
export function createInMemoryStripeWebhookConsumedStore(): StripeWebhookConsumedEventStore {
  const consumed = new Set<string>();
  return {
    consumeOnce(eventId: string): boolean {
      if (consumed.has(eventId)) {
        return false;
      }
      consumed.add(eventId);
      return true;
    },
  };
}

/** The module deps (all injected; the secret never leaves this closure). */
export interface StripeWebhookVerificationModuleDeps {
  /** The whsec_ endpoint secret — composition edge only. */
  readonly webhookSecret: string;
  /** The injected crypto seam (node:crypto at the edge; fakes in tests). */
  readonly crypto: StripeWebhookCrypto;
  readonly clock: RuntimeClock;
  /** Defaults to the in-memory store (tests); compositions inject durable. */
  readonly consumedStore?: StripeWebhookConsumedEventStore;
  /** Defaults to the pinned 300 s. */
  readonly toleranceSeconds?: number;
  /** Defaults to the pinned 5 s. */
  readonly futureSkewSeconds?: number;
}

function refusal(
  kind: StripeWebhookRefusalKind,
  message: string,
): StripeWebhookVerificationResult {
  return Object.freeze({
    kind: 'REFUSED' as const,
    refusal: Object.freeze({ kind, message }),
  });
}

/** The four mapped event types (frozen vocabulary). */
const PAYMENT_INTENT_EVENT_TYPES: ReadonlySet<string> = new Set<StripePaymentIntentEventType>([
  'payment_intent.succeeded',
  'payment_intent.processing',
  'payment_intent.amount_captured_updated',
  'payment_intent.payment_failed',
]);

/**
 * Create the verification module: `(delivery) => result`. See the file
 * header for the pinned check order and the consumption law.
 */
export function createStripeWebhookVerificationModule(
  deps: StripeWebhookVerificationModuleDeps,
): (delivery: StripeWebhookDelivery) => StripeWebhookVerificationResult {
  if (typeof deps.webhookSecret !== 'string' || deps.webhookSecret.length < 8) {
    throw new ValidationError(
      'a Stripe webhook secret (whsec_…) is required at the composition edge',
    );
  }
  const toleranceSeconds = deps.toleranceSeconds ?? STRIPE_WEBHOOK_TOLERANCE_SECONDS;
  const futureSkewSeconds = deps.futureSkewSeconds ?? STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS;
  const consumedStore = deps.consumedStore ?? createInMemoryStripeWebhookConsumedStore();
  const secrets = [deps.webhookSecret];

  const scan = (result: StripeWebhookVerificationResult): StripeWebhookVerificationResult => {
    assertNoSecretMaterial(result, secrets, 'stripe webhook verification result');
    return result;
  };

  return (delivery: StripeWebhookDelivery): StripeWebhookVerificationResult => {
    if (
      delivery === null ||
      typeof delivery !== 'object' ||
      typeof delivery.signatureHeader !== 'string' ||
      typeof delivery.body !== 'string' ||
      typeof delivery.eventId !== 'string' ||
      delivery.eventId.length === 0
    ) {
      return scan(refusal('MALFORMED_SIGNATURE_HEADER', 'the delivery shape is incomplete'));
    }
    const parsed = parseStripeSignatureHeader(delivery.signatureHeader);
    if (!parsed.ok) {
      return scan(refusal(parsed.reason, parsed.detail));
    }

    // Freshness (pinned window; measured on the injected clock).
    const signatureMs = BigInt(parsed.parsed.timestamp) * 1000n;
    const nowMs = deps.clock.now();
    if (signatureMs > nowMs + BigInt(futureSkewSeconds) * 1000n) {
      return scan(
        refusal('FUTURE_TIMESTAMP', 'the signature timestamp is unreasonably far in the future'),
      );
    }
    if (nowMs - signatureMs > BigInt(toleranceSeconds) * 1000n) {
      return scan(
        refusal(
          'TIMESTAMP_OUTSIDE_WINDOW',
          `the signature timestamp is older than the pinned ${toleranceSeconds}s tolerance window`,
        ),
      );
    }

    // Constant-time signature match (any listed v1 candidate).
    const signedPayload = `${parsed.parsed.timestamp}.${delivery.body}`;
    const expected = deps.crypto.hmacSha256Hex(deps.webhookSecret, signedPayload);
    const signatureGood = parsed.parsed.signatures.some((candidate) =>
      deps.crypto.timingSafeEqualHex(candidate, expected),
    );
    if (!signatureGood) {
      return scan(refusal('SIGNATURE_INVALID', 'the v1 signature does not match the signed payload'));
    }

    // Body parse + shape (a signed body is not a licence to fabricate).
    let root: { id?: unknown; type?: unknown; created?: unknown; data?: unknown };
    try {
      const json: unknown = JSON.parse(delivery.body);
      if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        return scan(refusal('UNPARSEABLE_EVENT_BODY', 'the signed body is not an event object'));
      }
      root = json as { id?: unknown; type?: unknown; created?: unknown; data?: unknown };
    } catch {
      return scan(refusal('UNPARSEABLE_EVENT_BODY', 'the signed body is not valid JSON'));
    }
    if (root.id !== delivery.eventId) {
      return scan(
        refusal('UNPARSEABLE_EVENT_BODY', 'the signed body id does not match the delivered event id'),
      );
    }
    if (typeof root.type !== 'string' || root.type.length === 0) {
      return scan(refusal('UNPARSEABLE_EVENT_BODY', 'the signed event carries no type'));
    }
    if (!PAYMENT_INTENT_EVENT_TYPES.has(root.type)) {
      if (!consumedStore.consumeOnce(delivery.eventId)) {
        return scan(
          refusal('EVENT_ALREADY_CONSUMED', 'the event id was already consumed (replay refused)'),
        );
      }
      return scan(
        Object.freeze({
          kind: 'VERIFIED_UNMAPPED' as const,
          eventType: root.type,
          eventId: delivery.eventId,
        }),
      );
    }

    // Typed extraction of the payment-intent event (never guesses).
    const data =
      root.data !== null && typeof root.data === 'object' && !Array.isArray(root.data)
        ? (root.data as Record<string, unknown>)
        : undefined;
    const object =
      data !== undefined &&
      data.object !== null &&
      typeof data.object === 'object' &&
      !Array.isArray(data.object)
        ? (data.object as Record<string, unknown>)
        : undefined;
    const paymentIntentId = object !== undefined && typeof object.id === 'string' ? object.id : '';
    if (paymentIntentId.length === 0) {
      return scan(refusal('UNPARSEABLE_EVENT_BODY', 'the payment-intent event carries no intent id'));
    }
    const status = object !== undefined && typeof object.status === 'string' ? object.status : '';
    if (status.length === 0) {
      return scan(refusal('UNPARSEABLE_EVENT_BODY', 'the payment-intent event carries no intent status'));
    }
    if (!consumedStore.consumeOnce(delivery.eventId)) {
      return scan(
        refusal('EVENT_ALREADY_CONSUMED', 'the event id was already consumed (replay refused)'),
      );
    }
    const amount =
      object !== undefined &&
      typeof object.amount === 'number' &&
      Number.isSafeInteger(object.amount)
        ? object.amount
        : null;
    const currency =
      object !== undefined && typeof object.currency === 'string' ? object.currency : null;
    const lastPaymentError =
      object !== undefined &&
      object.last_payment_error !== null &&
      typeof object.last_payment_error === 'object' &&
      !Array.isArray(object.last_payment_error)
        ? (object.last_payment_error as Record<string, unknown>)
        : undefined;
    const lastPaymentErrorCode =
      lastPaymentError !== undefined && typeof lastPaymentError.code === 'string'
        ? lastPaymentError.code
        : null;
    const createdAt: TimestampMs =
      typeof root.created === 'number' && Number.isSafeInteger(root.created)
        ? BigInt(root.created) * 1000n
        : 0n;

    return scan(
      Object.freeze({
        kind: 'VERIFIED' as const,
        event: Object.freeze({
          eventType: root.type as StripePaymentIntentEventType,
          eventId: delivery.eventId,
          createdAt,
          paymentIntentId,
          status,
          amount,
          currency,
          lastPaymentErrorCode,
        }),
      }),
    );
  };
}
