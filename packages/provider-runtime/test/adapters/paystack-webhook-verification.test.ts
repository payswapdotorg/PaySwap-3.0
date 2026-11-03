import { createHmac, timingSafeEqual } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/errors.ts';
import { ProviderEventIngestor, canonicalWebhookBody } from '../../src/events.ts';
import { RawProviderStateStore } from '../../src/raw-state.ts';
import { DeterministicClock } from '../../src/clock.ts';
import {
  PAYSTACK_WEBHOOK_SIGNATURE_HEADER,
  PAYSTACK_WEBHOOK_VERIFIER_ID,
  verifyPaystackWebhookSignature,
  type PaystackWebhookCrypto,
} from '../../src/adapters/paystack/webhook-signature.ts';
import {
  createPaystackWebhookVerificationModule,
  createPaystackWebhookIngestorVerifier,
  createInMemoryPaystackWebhookConsumedStore,
  paystackWebhookReconciliationEvidenceOf,
} from '../../src/adapters/paystack/webhook-verification.ts';

/**
 * P27-C battery (ADR-0020 D4): the Paystack webhook machinery — the
 * claimed HMAC-SHA512 scheme over the RAW body, the pinned check order,
 * the typed event extraction, the event-key single-use consumption law
 * and the reconciliation feed. The battery signs events LOCALLY with
 * the REAL node:crypto primitive (the package stays crypto-free by
 * injection; the tests prove the machinery against the same primitive
 * the composition edge binds). NO live provider→station delivery is
 * claimed or simulated; the real-secret receipt is the operator-gated
 * harness tier.
 */

const WEBHOOK_SECRET = 'sk_test_LOCAL_battery_only_webhook_key_material';

/** The REAL crypto binding (the composition-edge seam). */
const realCrypto: PaystackWebhookCrypto = {
  hmacSha512Hex(key: string, message: string): string {
    return createHmac('sha512', key).update(message, 'utf8').digest('hex');
  },
  timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  },
};

function sign(body: string, secret: string = WEBHOOK_SECRET): string {
  return realCrypto.hmacSha512Hex(secret, body);
}

const module_ = () =>
  createPaystackWebhookVerificationModule({
    webhookSecret: WEBHOOK_SECRET,
    crypto: realCrypto,
  });

const chargeBody = JSON.stringify({
  event: 'charge.success',
  data: {
    reference: 'ref_p27c_collection_0001',
    status: 'success',
    amount: 500000,
    currency: 'NGN',
  },
});
const transferSuccessBody = JSON.stringify({
  event: 'transfer.success',
  data: { reference: 'ref_p27c_payout_0001', transfer_code: 'TRF_p27c', status: 'success' },
});
const transferReversedBody = JSON.stringify({
  event: 'transfer.reversed',
  data: { reference: 'ref_p27c_payout_0001', transfer_code: 'TRF_p27c', status: 'reversed' },
});

describe('the claimed signature scheme (webhook-signature.ts)', () => {
  it('the constants carry the claimed header + verifier identity (never a secret)', () => {
    expect(PAYSTACK_WEBHOOK_SIGNATURE_HEADER).toBe('x-paystack-signature');
    expect(PAYSTACK_WEBHOOK_VERIFIER_ID).toBe('paystack-x-signature-hmac-sha512');
  });

  it('verifies a locally-signed raw body and refuses a tampered body or wrong key', () => {
    expect(
      verifyPaystackWebhookSignature({
        crypto: realCrypto,
        webhookSecret: WEBHOOK_SECRET,
        signature: sign(chargeBody),
        body: chargeBody,
      }),
    ).toBe(true);
    expect(
      verifyPaystackWebhookSignature({
        crypto: realCrypto,
        webhookSecret: WEBHOOK_SECRET,
        signature: sign(chargeBody, 'sk_test_a_different_secret_key'),
        body: chargeBody,
      }),
    ).toBe(false);
    expect(
      verifyPaystackWebhookSignature({
        crypto: realCrypto,
        webhookSecret: WEBHOOK_SECRET,
        signature: sign(chargeBody),
        body: `${chargeBody} `,
      }),
    ).toBe(false);
    expect(
      verifyPaystackWebhookSignature({
        crypto: realCrypto,
        webhookSecret: WEBHOOK_SECRET,
        signature: '',
        body: chargeBody,
      }),
    ).toBe(false);
  });

  it('a short secret is refused at construction (fail-closed — never a guessed key)', () => {
    expect(() =>
      createPaystackWebhookVerificationModule({
        webhookSecret: 'short',
        crypto: realCrypto,
      }),
    ).toThrow(ValidationError);
  });
});

describe('the verification module (the pinned check order)', () => {
  it('a signed charge.success event VERIFIES with the typed extraction and never echoes the secret', () => {
    const result = module_()({ signatureHeader: sign(chargeBody), body: chargeBody });
    expect(result.kind).toBe('VERIFIED');
    if (result.kind === 'VERIFIED' && result.event.eventName === 'charge.success') {
      expect(result.event.eventId).toBe('charge.success|ref_p27c_collection_0001');
      expect(result.event.reference).toBe('ref_p27c_collection_0001');
      expect(result.event.status).toBe('success');
      expect(result.event.amount).toBe(500000);
      expect(result.event.currency).toBe('NGN');
    }
    expect(JSON.stringify(result)).not.toContain(WEBHOOK_SECRET);
  });

  it('the negative controls: malformed delivery, bad signature, unparseable body — in the pinned order', () => {
    const verify = module_();
    expect(verify({ signatureHeader: '', body: chargeBody }).kind).toBe('REFUSED');
    expect(
      verify({ signatureHeader: 'deadbeef', body: chargeBody }).kind,
    ).toBe('REFUSED');
    // A signed but unparseable body is refused, never fabricated.
    const badJson = 'not-json';
    const signedBad = verify({ signatureHeader: sign(badJson), body: badJson });
    expect(signedBad.kind).toBe('REFUSED');
    if (signedBad.kind === 'REFUSED') {
      expect(signedBad.refusal.kind).toBe('UNPARSEABLE_EVENT_BODY');
    }
    // A signed body with no event name is refused.
    const noEvent = JSON.stringify({ data: {} });
    const signedNoEvent = verify({ signatureHeader: sign(noEvent), body: noEvent });
    expect(signedNoEvent.kind).toBe('REFUSED');
    // A signed mapped event with NO data object is refused.
    const noData = JSON.stringify({ event: 'charge.success' });
    const signedNoData = verify({ signatureHeader: sign(noData), body: noData });
    expect(signedNoData.kind).toBe('REFUSED');
    if (signedNoData.kind === 'REFUSED') {
      expect(signedNoData.refusal.kind).toBe('UNPARSEABLE_EVENT_BODY');
    }
    // A charge event without the reference cannot be typed.
    const noReference = JSON.stringify({ event: 'charge.success', data: { status: 'success' } });
    const signedNoReference = verify({
      signatureHeader: sign(noReference),
      body: noReference,
    });
    expect(signedNoReference.kind).toBe('REFUSED');
    // A transfer event with neither reference nor code is refused.
    const noKeys = JSON.stringify({ event: 'transfer.success', data: { status: 'success' } });
    const signedNoKeys = verify({ signatureHeader: sign(noKeys), body: noKeys });
    expect(signedNoKeys.kind).toBe('REFUSED');
  });

  it('a signed event outside the typed vocabulary is VERIFIED_UNMAPPED (fails soft, nothing invented)', () => {
    const unmapped = JSON.stringify({ event: 'refund.processed', data: { reference: 'x' } });
    const result = module_()({ signatureHeader: sign(unmapped), body: unmapped });
    expect(result.kind).toBe('VERIFIED_UNMAPPED');
    if (result.kind === 'VERIFIED_UNMAPPED') {
      expect(result.eventName).toBe('refund.processed');
    }
  });

  it('the CONSUMPTION LAW: VERIFIED answers at most once per derived event key (replays refused)', () => {
    const verify = module_();
    const first = verify({ signatureHeader: sign(chargeBody), body: chargeBody });
    expect(first.kind).toBe('VERIFIED');
    const replay = verify({ signatureHeader: sign(chargeBody), body: chargeBody });
    expect(replay.kind).toBe('REFUSED');
    if (replay.kind === 'REFUSED') {
      expect(replay.refusal.kind).toBe('EVENT_ALREADY_CONSUMED');
    }
    // A DIFFERENT event key is not consumed by the first (the key is
    // derived from the verified content, not the delivery).
    const otherBody = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'ref_other', status: 'success' },
    });
    const other = verify({ signatureHeader: sign(otherBody), body: otherBody });
    expect(other.kind).toBe('VERIFIED');
    // An injected store lets compositions dedupe durably (the seam law).
    const consumed = new Set<string>();
    const withStore = createPaystackWebhookVerificationModule({
      webhookSecret: WEBHOOK_SECRET,
      crypto: realCrypto,
      consumedStore: {
        consumeOnce(key: string): boolean {
          if (consumed.has(key)) {
            return false;
          }
          consumed.add(key);
          return true;
        },
      },
    });
    expect(withStore({ signatureHeader: sign(chargeBody), body: chargeBody }).kind).toBe('VERIFIED');
    expect(withStore({ signatureHeader: sign(chargeBody), body: chargeBody }).kind).toBe('REFUSED');
    expect(createInMemoryPaystackWebhookConsumedStore().consumeOnce('k')).toBe(true);
    expect(createInMemoryPaystackWebhookConsumedStore().consumeOnce('k')).toBe(true);
  });

  it('the transfer events type with the code-only shape too (either identity key)', () => {
    const codeOnly = JSON.stringify({
      event: 'transfer.failed',
      data: { transfer_code: 'TRF_only', status: 'failed' },
    });
    const result = module_()({ signatureHeader: sign(codeOnly), body: codeOnly });
    expect(result.kind).toBe('VERIFIED');
    if (result.kind === 'VERIFIED' && result.event.eventName === 'transfer.failed') {
      expect(result.event.transferCode).toBe('TRF_only');
      expect(result.event.reference).toBeNull();
    }
  });
});

describe('the reconciliation feed (terminal-only resolutions)', () => {
  it('charge.success and transfer.success resolve CONFIRMED; transfer.failed resolves FAILED', async () => {
    const verify = module_();
    const charge = verify({ signatureHeader: sign(chargeBody), body: chargeBody });
    if (charge.kind !== 'VERIFIED') {
      throw new Error('expected the charge event to verify');
    }
    expect(paystackWebhookReconciliationEvidenceOf(charge.event)).toEqual({
      resolvedTo: 'CONFIRMED',
      reference: 'ref_p27c_collection_0001',
    });
    const transfer = verify({ signatureHeader: sign(transferSuccessBody), body: transferSuccessBody });
    if (transfer.kind !== 'VERIFIED') {
      throw new Error('expected the transfer event to verify');
    }
    expect(paystackWebhookReconciliationEvidenceOf(transfer.event)).toEqual({
      resolvedTo: 'CONFIRMED',
      reference: 'ref_p27c_payout_0001',
    });
    const failedBody = JSON.stringify({
      event: 'transfer.failed',
      data: { reference: 'ref_fail', status: 'failed' },
    });
    const failed = verify({ signatureHeader: sign(failedBody), body: failedBody });
    if (failed.kind !== 'VERIFIED') {
      throw new Error('expected the failed event to verify');
    }
    expect(paystackWebhookReconciliationEvidenceOf(failed.event)).toEqual({
      resolvedTo: 'FAILED',
      reference: 'ref_fail',
    });
  });

  it('transfer.reversed is an OBSERVATION, never a resolution (new truth for the mission layer)', () => {
    const verify = module_();
    const reversed = verify({
      signatureHeader: sign(transferReversedBody),
      body: transferReversedBody,
    });
    expect(reversed.kind).toBe('VERIFIED');
    if (reversed.kind !== 'VERIFIED') {
      throw new Error('expected the reversed event to verify');
    }
    expect(paystackWebhookReconciliationEvidenceOf(reversed.event)).toBeNull();
  });
});

describe('the events.ts INGESTOR PLUG (the pluggable WebhookSignatureVerifier contract)', () => {
  it('a delivery signed over the canonical body is INGESTED through the real verifier', () => {
    const payload = { event: 'charge.success', data: { reference: 'ref_ingest', status: 'success' } };
    const canonical = canonicalWebhookBody(payload);
    const clock = new DeterministicClock(20_000_000n);
    const ingestor = new ProviderEventIngestor({
      clock,
      store: new RawProviderStateStore(),
      verifier: createPaystackWebhookIngestorVerifier({
        webhookSecret: WEBHOOK_SECRET,
        crypto: realCrypto,
      }),
    });
    const outcome = ingestor.ingest({
      providerName: 'paystack',
      eventId: 'charge.success|ref_ingest',
      signatureTimestamp: '20000',
      eventCreatedAt: '20000',
      payload,
      signature: realCrypto.hmacSha512Hex(WEBHOOK_SECRET, canonical),
    });
    expect(outcome.kind).toBe('INGESTED');
    // A tampered delivery is refused at the signature.
    const refused = ingestor.ingest({
      providerName: 'paystack',
      eventId: 'charge.success|ref_ingest2',
      signatureTimestamp: '20000',
      eventCreatedAt: '20000',
      payload,
      signature: 'f'.repeat(128),
    });
    expect(refused.kind).toBe('REJECTED');
  });
});
