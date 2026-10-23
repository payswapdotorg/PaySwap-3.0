import { createHmac, timingSafeEqual } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DeterministicClock } from '../../src/clock.ts';
import {
  createInMemoryStripeWebhookConsumedStore,
  createStripeWebhookVerificationModule,
  stripeReconciliationEvidenceOf,
} from '../../src/adapters/stripe/webhook-verification.ts';
import {
  STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS,
  STRIPE_WEBHOOK_TOLERANCE_SECONDS,
  type StripeWebhookCrypto,
} from '../../src/adapters/stripe/webhook-signature.ts';

/**
 * P14-B battery (ADR-0008 D4): the whsec_ verification module proven with
 * LOCALLY signed events (real node:crypto HMAC seam; the REAL operator
 * key is exercised only at the P14-D receipt tier — unit tests mint
 * throwaway whsec_ material and never read secrets).
 */
const WEBHOOK_SECRET = 'whsec_LOCAL_battery_only_key_material';
const OTHER_SECRET = 'whsec_A_DIFFERENT_endpoint_secret';

/** The REAL crypto binding (the composition-edge seam). */
const realCrypto: StripeWebhookCrypto = {
  hmacSha256Hex(key: string, message: string): string {
    return createHmac('sha256', key).update(message, 'utf8').digest('hex');
  },
  timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  },
};

const nowSeconds = 20_000;
const nowMs = BigInt(nowSeconds * 1000);

function sign(secret: string, timestamp: string, body: string): string {
  return `t=${timestamp},v1=${realCrypto.hmacSha256Hex(secret, `${timestamp}.${body}`)}`;
}

function paymentIntentBody(overrides?: {
  readonly eventId?: string;
  readonly type?: string;
  readonly intentId?: string;
  readonly status?: string;
  readonly created?: number;
  readonly amount?: number;
  readonly currency?: string;
  readonly lastPaymentErrorCode?: string | null;
}): string {
  const eventId = overrides?.eventId ?? 'evt_local_1';
  const type = overrides?.type ?? 'payment_intent.succeeded';
  const intentId = overrides?.intentId ?? 'pi_local_1';
  return JSON.stringify({
    id: eventId,
    object: 'event',
    api_version: '2025-08-27.basil',
    created: overrides?.created ?? nowSeconds,
    type,
    data: {
      object: {
        id: intentId,
        object: 'payment_intent',
        status: overrides?.status ?? 'succeeded',
        amount: overrides?.amount ?? 4200,
        currency: overrides?.currency ?? 'usd',
        ...(overrides?.lastPaymentErrorCode === undefined
          ? {}
          : overrides.lastPaymentErrorCode === null
            ? {}
            : { last_payment_error: { code: overrides.lastPaymentErrorCode } }),
      },
    },
  });
}

function moduleWith(overrides?: {
  readonly clock?: DeterministicClock;
  readonly secret?: string;
}) {
  const clock = overrides?.clock ?? new DeterministicClock(nowMs);
  const verify = createStripeWebhookVerificationModule({
    webhookSecret: overrides?.secret ?? WEBHOOK_SECRET,
    crypto: realCrypto,
    clock,
    consumedStore: createInMemoryStripeWebhookConsumedStore(),
  });
  return { clock, verify };
}

describe('the verification module (locally signed events)', () => {
  it('a correctly signed payment_intent.succeeded event is VERIFIED with typed extraction', () => {
    const { verify } = moduleWith();
    const body = paymentIntentBody();
    const result = verify({
      eventId: 'evt_local_1',
      signatureHeader: sign(WEBHOOK_SECRET, String(nowSeconds), body),
      body,
    });
    expect(result.kind).toBe('VERIFIED');
    if (result.kind === 'VERIFIED') {
      expect(result.event.eventType).toBe('payment_intent.succeeded');
      expect(result.event.paymentIntentId).toBe('pi_local_1');
      expect(result.event.status).toBe('succeeded');
      expect(result.event.amount).toBe(4200);
      expect(result.event.currency).toBe('usd');
      expect(result.event.createdAt).toBe(BigInt(nowSeconds * 1000));
    }
  });

  it('a correctly signed event of an unmapped type is VERIFIED_UNMAPPED (nothing invented)', () => {
    const { verify } = moduleWith();
    const body = paymentIntentBody({ type: 'charge.succeeded' });
    const result = verify({
      eventId: 'evt_local_1',
      signatureHeader: sign(WEBHOOK_SECRET, String(nowSeconds), body),
      body,
    });
    expect(result.kind).toBe('VERIFIED_UNMAPPED');
    if (result.kind === 'VERIFIED_UNMAPPED') {
      expect(result.eventType).toBe('charge.succeeded');
    }
  });

  it('verifies when ANY listed v1 matches (rotation: old + new secret both listed)', () => {
    const { verify } = moduleWith({ secret: OTHER_SECRET });
    const body = paymentIntentBody();
    const old = realCrypto.hmacSha256Hex(WEBHOOK_SECRET, `${nowSeconds}.${body}`);
    const current = realCrypto.hmacSha256Hex(OTHER_SECRET, `${nowSeconds}.${body}`);
    const result = verify({
      eventId: 'evt_local_1',
      signatureHeader: `t=${nowSeconds},v1=${old},v1=${current}`,
      body,
    });
    expect(result.kind).toBe('VERIFIED');
  });

  it('a tampered body is refused SIGNATURE_INVALID', () => {
    const { verify } = moduleWith();
    const body = paymentIntentBody();
    const header = sign(WEBHOOK_SECRET, String(nowSeconds), body);
    const tampered = paymentIntentBody({ amount: 1_000_000 });
    const result = verify({ eventId: 'evt_local_1', signatureHeader: header, body: tampered });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') {
      expect(result.refusal.kind).toBe('SIGNATURE_INVALID');
    }
  });

  it('a signature from a DIFFERENT endpoint secret is refused SIGNATURE_INVALID', () => {
    const { verify } = moduleWith();
    const body = paymentIntentBody();
    const result = verify({
      eventId: 'evt_local_1',
      signatureHeader: sign(OTHER_SECRET, String(nowSeconds), body),
      body,
    });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') {
      expect(result.refusal.kind).toBe('SIGNATURE_INVALID');
    }
  });

  it(`a timestamp older than the pinned ${STRIPE_WEBHOOK_TOLERANCE_SECONDS}s window is refused`, () => {
    const { verify } = moduleWith();
    const body = paymentIntentBody();
    const stale = String(nowSeconds - STRIPE_WEBHOOK_TOLERANCE_SECONDS - 1);
    const result = verify({
      eventId: 'evt_local_1',
      signatureHeader: sign(WEBHOOK_SECRET, stale, body),
      body,
    });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') {
      expect(result.refusal.kind).toBe('TIMESTAMP_OUTSIDE_WINDOW');
    }
  });

  it('the boundary is inclusive: exactly 300s old still verifies', () => {
    const { verify } = moduleWith();
    const body = paymentIntentBody();
    const boundary = String(nowSeconds - STRIPE_WEBHOOK_TOLERANCE_SECONDS);
    const result = verify({
      eventId: 'evt_local_1',
      signatureHeader: sign(WEBHOOK_SECRET, boundary, body),
      body,
    });
    expect(result.kind).toBe('VERIFIED');
  });

  it(`a timestamp beyond the ${STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS}s future skew is refused`, () => {
    const { verify } = moduleWith();
    const body = paymentIntentBody();
    const future = String(nowSeconds + STRIPE_WEBHOOK_FUTURE_SKEW_SECONDS + 1);
    const result = verify({
      eventId: 'evt_local_1',
      signatureHeader: sign(WEBHOOK_SECRET, future, body),
      body,
    });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') {
      expect(result.refusal.kind).toBe('FUTURE_TIMESTAMP');
    }
  });

  it('a replayed event id is refused EVENT_ALREADY_CONSUMED (single consumption)', () => {
    const { verify } = moduleWith();
    const body = paymentIntentBody();
    const delivery = {
      eventId: 'evt_local_1',
      signatureHeader: sign(WEBHOOK_SECRET, String(nowSeconds), body),
      body,
    };
    expect(verify(delivery).kind).toBe('VERIFIED');
    const replay = verify(delivery);
    expect(replay.kind).toBe('REFUSED');
    if (replay.kind === 'REFUSED') {
      expect(replay.refusal.kind).toBe('EVENT_ALREADY_CONSUMED');
    }
  });

  it('a signed body whose root id disagrees with the delivery is refused UNPARSEABLE_EVENT_BODY', () => {
    const { verify } = moduleWith();
    const body = paymentIntentBody({ eventId: 'evt_OTHER' });
    const result = verify({
      eventId: 'evt_local_1',
      signatureHeader: sign(WEBHOOK_SECRET, String(nowSeconds), body),
      body,
    });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') {
      expect(result.refusal.kind).toBe('UNPARSEABLE_EVENT_BODY');
    }
  });

  it('signed non-JSON, typed-less, and intent-id-less bodies are refused UNPARSEABLE_EVENT_BODY', () => {
    const { verify } = moduleWith();
    const notJson = 'this is not json';
    expect(
      verify({
        eventId: 'evt_local_1',
        signatureHeader: sign(WEBHOOK_SECRET, String(nowSeconds), notJson),
        body: notJson,
      }).kind,
    ).toBe('REFUSED');
    const typeless = JSON.stringify({ id: 'evt_local_1' });
    const typelessResult = verify({
      eventId: 'evt_local_1',
      signatureHeader: sign(WEBHOOK_SECRET, String(nowSeconds), typeless),
      body: typeless,
    });
    expect(typelessResult.kind).toBe('REFUSED');
    if (typelessResult.kind === 'REFUSED') {
      expect(typelessResult.refusal.kind).toBe('UNPARSEABLE_EVENT_BODY');
    }
    const noIntentId = JSON.stringify({
      id: 'evt_local_1',
      type: 'payment_intent.succeeded',
      data: { object: { status: 'succeeded' } },
    });
    const noIntentResult = verify({
      eventId: 'evt_local_1',
      signatureHeader: sign(WEBHOOK_SECRET, String(nowSeconds), noIntentId),
      body: noIntentId,
    });
    expect(noIntentResult.kind).toBe('REFUSED');
    if (noIntentResult.kind === 'REFUSED') {
      expect(noIntentResult.refusal.kind).toBe('UNPARSEABLE_EVENT_BODY');
    }
  });

  it('no result shape ever carries the webhook secret (the escape-scan law)', () => {
    const { verify } = moduleWith();
    const cases: string[] = [];
    const bigintSafe = (_key: string, value: unknown): unknown =>
      typeof value === 'bigint' ? value.toString() : value;
    const body = paymentIntentBody();
    cases.push(
      JSON.stringify(
        verify({
          eventId: 'evt_local_1',
          signatureHeader: sign(WEBHOOK_SECRET, String(nowSeconds), body),
          body,
        }),
        bigintSafe,
      ),
    );
    const tampered = paymentIntentBody({ amount: 99 });
    cases.push(
      JSON.stringify(
        verify({
          eventId: 'evt_local_1',
          signatureHeader: sign(WEBHOOK_SECRET, String(nowSeconds), body),
          body: tampered,
        }),
        bigintSafe,
      ),
    );
    for (const serialized of cases) {
      expect(serialized).not.toContain(WEBHOOK_SECRET);
      expect(serialized).not.toContain('whsec_');
    }
  });

  it('the deep-scan law: no string field of any result carries the secret (BigInt-safe walk)', () => {
    const { verify } = moduleWith();
    const body = paymentIntentBody();
    const result = verify({
      eventId: 'evt_local_1',
      signatureHeader: sign(WEBHOOK_SECRET, String(nowSeconds), body),
      body,
    });
    const strings: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') {
        strings.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          walk(item);
        }
      } else if (value !== null && typeof value === 'object') {
        for (const item of Object.values(value)) {
          walk(item);
        }
      }
    };
    walk(result);
    for (const text of strings) {
      expect(text).not.toContain(WEBHOOK_SECRET);
    }
  });

  it('the module refuses an absurdly short secret at construction (fail-closed)', () => {
    expect(() =>
      createStripeWebhookVerificationModule({
        webhookSecret: 'short',
        crypto: realCrypto,
        clock: new DeterministicClock(nowMs),
      }),
    ).toThrow();
  });
});

describe('the reconciliation evidence mapping (the reconciled-attempt law)', () => {
  it('succeeded maps to CONFIRMED evidence carrying the intent id', () => {
    const evidence = stripeReconciliationEvidenceOf({
      eventType: 'payment_intent.succeeded',
      eventId: 'evt_1',
      createdAt: nowMs,
      paymentIntentId: 'pi_1',
      status: 'succeeded',
      amount: 4200,
      currency: 'usd',
      lastPaymentErrorCode: null,
    });
    expect(evidence).toEqual({ resolvedTo: 'CONFIRMED', paymentIntentId: 'pi_1' });
  });

  it('payment_failed maps to FAILED evidence carrying the failure code', () => {
    const evidence = stripeReconciliationEvidenceOf({
      eventType: 'payment_intent.payment_failed',
      eventId: 'evt_2',
      createdAt: nowMs,
      paymentIntentId: 'pi_2',
      status: 'requires_payment_method',
      amount: 1000,
      currency: 'usd',
      lastPaymentErrorCode: 'card_declined',
    });
    expect(evidence).toEqual({
      resolvedTo: 'FAILED',
      paymentIntentId: 'pi_2',
      failureCode: 'card_declined',
    });
  });

  it('processing and amount_captured_updated are observations — NEVER resolutions', () => {
    for (const eventType of ['payment_intent.processing', 'payment_intent.amount_captured_updated'] as const) {
      expect(
        stripeReconciliationEvidenceOf({
          eventType,
          eventId: 'evt_3',
          createdAt: nowMs,
          paymentIntentId: 'pi_3',
          status: 'processing',
          amount: 1000,
          currency: 'usd',
          lastPaymentErrorCode: null,
        }),
      ).toBeNull();
    }
  });
});

