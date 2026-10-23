import { createHmac, timingSafeEqual } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DeterministicClock } from '../../src/clock.ts';
import { ProviderEventIngestor, canonicalWebhookBody } from '../../src/events.ts';
import { RawProviderStateStore } from '../../src/raw-state.ts';
import {
  createStripeWebhookVerifier,
  parseStripeSignatureHeader,
  type StripeWebhookCrypto,
} from '../../src/adapters/stripe/webhook-signature.ts';

/**
 * P14-B battery (ADR-0008 D4): the Stripe-Signature header parser and
 * the events.ts ingestor plug, proven with LOCALLY signed canonical
 * bodies. The HMAC seam is the REAL node:crypto primitive (the package
 * stays crypto-free by injection; the tests prove the machinery against
 * the same primitive the composition edge binds). The REAL operator key
 * is exercised only at the P14-D receipt tier.
 */

const WEBHOOK_SECRET = 'whsec_LOCAL_battery_only_key_material';

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

describe('the Stripe-Signature header parser', () => {
  it('parses t= and v1= (whitespace tolerated, any order)', () => {
    const parsed = parseStripeSignatureHeader(' t=1234 , v1=AbCdEf0123456789AbCdEf0123456789 ');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.parsed.timestamp).toBe('1234');
      expect(parsed.parsed.signatures).toEqual(['abcdef0123456789abcdef0123456789']);
    }
  });

  it('collects multiple v1= entries (endpoint-secret rotation shape)', () => {
    const parsed = parseStripeSignatureHeader('t=99,v1=' + 'a'.repeat(64) + ',v1=' + 'b'.repeat(64));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.parsed.signatures).toHaveLength(2);
    }
  });

  it('refuses a header without t=, without v1=, with a non-integer t=, or with a non-hex v1=', () => {
    expect(parseStripeSignatureHeader('v1=' + 'a'.repeat(64)).ok).toBe(false);
    expect(parseStripeSignatureHeader('t=99').ok).toBe(false);
    expect(parseStripeSignatureHeader('t=not-a-number,v1=' + 'a'.repeat(64)).ok).toBe(false);
    expect(parseStripeSignatureHeader('t=99,v1=not-hex!!').ok).toBe(false);
    expect(parseStripeSignatureHeader('').ok).toBe(false);
  });
});

describe('the events.ts ingestor plug (ProviderEventIngestor composition)', () => {
  it('a delivery signed over the canonical body is INGESTED through the real verifier', () => {
    const clock = new DeterministicClock(nowMs);
    const ingestor = new ProviderEventIngestor({
      clock,
      store: new RawProviderStateStore(),
      verifier: createStripeWebhookVerifier({
        webhookSecret: WEBHOOK_SECRET,
        crypto: realCrypto,
        clock,
      }),
    });
    const payload = {
      objectType: 'payment_intent',
      externalId: 'pi_local_1',
      revision: '1',
      state: { status: 'succeeded' },
    };
    const canonicalBody = canonicalWebhookBody(payload);
    const outcome = ingestor.ingest({
      providerName: 'stripe',
      eventId: 'evt_local_1',
      signatureTimestamp: String(nowSeconds),
      eventCreatedAt: String(nowSeconds),
      payload,
      signature: sign(WEBHOOK_SECRET, String(nowSeconds), canonicalBody),
    });
    expect(outcome.kind).toBe('INGESTED');
  });

  it('a tampered delivery is REJECTED SIGNATURE_INVALID through the real verifier', () => {
    const clock = new DeterministicClock(nowMs);
    const ingestor = new ProviderEventIngestor({
      clock,
      store: new RawProviderStateStore(),
      verifier: createStripeWebhookVerifier({
        webhookSecret: WEBHOOK_SECRET,
        crypto: realCrypto,
        clock,
      }),
    });
    const payload = {
      objectType: 'payment_intent',
      externalId: 'pi_local_1',
      revision: '1',
      state: { status: 'succeeded' },
    };
    const canonicalBody = canonicalWebhookBody(payload);
    const outcome = ingestor.ingest({
      providerName: 'stripe',
      eventId: 'evt_local_1',
      signatureTimestamp: String(nowSeconds),
      eventCreatedAt: String(nowSeconds),
      payload: { ...payload, state: { status: 'tampered' } },
      signature: sign(WEBHOOK_SECRET, String(nowSeconds), canonicalBody),
    });
    expect(outcome.kind).toBe('REJECTED');
    if (outcome.kind === 'REJECTED') {
      expect(outcome.reason).toBe('SIGNATURE_INVALID');
    }
  });
});
