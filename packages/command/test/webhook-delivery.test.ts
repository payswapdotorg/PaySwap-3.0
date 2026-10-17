import { describe, expect, it } from 'vitest';

import {
  validateWebhookEventEnvelope,
  signedWebhookPayload,
  signWebhookEventVia,
  verifyWebhookSignature,
  validateWebhookEndpointConfig,
  backoffDelayMs,
  SIGNATURE_SCHEME,
  DEFAULT_REPLAY_WINDOW_SECONDS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  type WebhookEventEnvelope,
} from '../src/webhook-delivery.ts';
import { ValidationError } from '../src/errors.ts';
import { realHmac } from './fixtures.ts';

const SECRET = 'whsec_test_1';
const NOW_SECONDS = 1767225600; // 2026-01-01T00:00:00Z

function envelope(): WebhookEventEnvelope<unknown> {
  return {
    id: 'evt_1',
    type: 'payment.observed',
    occurredAt: '2026-01-01T00:00:00Z',
    schemaVersion: '1.0.0',
    data: { note: 'an observation, never authority' },
  };
}

describe('webhook envelope + endpoint validation (fail closed)', () => {
  it('accepts a well-formed envelope; occurredAt is strict ISO-8601 UTC DATA', () => {
    expect(() => validateWebhookEventEnvelope(envelope())).not.toThrow();
    expect(() =>
      validateWebhookEventEnvelope({ ...envelope(), occurredAt: '2026-01-01 00:00:00Z' }),
    ).toThrow(ValidationError);
    expect(() => validateWebhookEventEnvelope({ ...envelope(), id: '' })).toThrow(ValidationError);
    expect(() => validateWebhookEventEnvelope({ ...envelope(), type: '' })).toThrow(ValidationError);
    expect(() => validateWebhookEventEnvelope({ ...envelope(), schemaVersion: '' })).toThrow(ValidationError);
  });

  it('rejects unknown endpoints and empty secrets (fail closed)', () => {
    expect(() =>
      validateWebhookEndpointConfig({ endpointId: 'ep_1', url: 'https://x.example/hook', secret: 's' }),
    ).not.toThrow();
    expect(() =>
      validateWebhookEndpointConfig({ endpointId: '', url: 'https://x.example/hook', secret: 's' }),
    ).toThrow(ValidationError);
    expect(() =>
      validateWebhookEndpointConfig({ endpointId: 'ep_1', url: '', secret: 's' }),
    ).toThrow(ValidationError);
    expect(() =>
      validateWebhookEndpointConfig({ endpointId: 'ep_1', url: 'https://x.example/hook', secret: '' }),
    ).toThrow(ValidationError);
  });
});

describe('webhook signing + verification (HMAC via the injected port)', () => {
  it('delivers signed events and the signature verifies against the contract (round trip)', () => {
    const headers = signWebhookEventVia(realHmac, envelope(), SECRET, NOW_SECONDS);
    expect(headers.timestamp).toBe(String(NOW_SECONDS));
    expect(headers.signature.startsWith(`${SIGNATURE_SCHEME}=`)).toBe(true);
    expect(SIGNATURE_HEADER).toBe('X-PaySwap-Signature');
    expect(TIMESTAMP_HEADER).toBe('X-PaySwap-Timestamp');
    expect(
      verifyWebhookSignature(realHmac, envelope(), SECRET, headers, { nowSeconds: NOW_SECONDS }),
    ).toEqual({ valid: true });
  });

  it('a wrong secret fails verification (SIGNATURE_MISMATCH)', () => {
    const headers = signWebhookEventVia(realHmac, envelope(), SECRET, NOW_SECONDS);
    expect(
      verifyWebhookSignature(realHmac, envelope(), 'whsec_other', headers, { nowSeconds: NOW_SECONDS }),
    ).toEqual({ valid: false, reason: 'SIGNATURE_MISMATCH' });
  });

  it('a tampered payload fails verification (SIGNATURE_MISMATCH)', () => {
    const headers = signWebhookEventVia(realHmac, envelope(), SECRET, NOW_SECONDS);
    const tampered = { ...envelope(), data: { note: 'tampered' } };
    expect(
      verifyWebhookSignature(realHmac, tampered, SECRET, headers, { nowSeconds: NOW_SECONDS }),
    ).toEqual({ valid: false, reason: 'SIGNATURE_MISMATCH' });
  });

  it('canonical JSON: key order does not affect verification', () => {
    const headers = signWebhookEventVia(realHmac, envelope(), SECRET, NOW_SECONDS);
    const reordered: WebhookEventEnvelope<unknown> = {
      schemaVersion: '1.0.0',
      data: { note: 'an observation, never authority' },
      occurredAt: '2026-01-01T00:00:00Z',
      type: 'payment.observed',
      id: 'evt_1',
    };
    expect(
      verifyWebhookSignature(realHmac, reordered, SECRET, headers, { nowSeconds: NOW_SECONDS }),
    ).toEqual({ valid: true });
  });

  it('timestamps outside the replay window are rejected (replay protection, both directions)', () => {
    const headers = signWebhookEventVia(realHmac, envelope(), SECRET, NOW_SECONDS);
    const stale = verifyWebhookSignature(realHmac, envelope(), SECRET, headers, {
      nowSeconds: NOW_SECONDS + DEFAULT_REPLAY_WINDOW_SECONDS + 1,
    });
    expect(stale).toEqual({ valid: false, reason: 'TIMESTAMP_OUTSIDE_REPLAY_WINDOW' });
    const future = verifyWebhookSignature(realHmac, envelope(), SECRET, headers, {
      nowSeconds: NOW_SECONDS - DEFAULT_REPLAY_WINDOW_SECONDS - 1,
    });
    expect(future).toEqual({ valid: false, reason: 'TIMESTAMP_OUTSIDE_REPLAY_WINDOW' });
    // Inside the window (either side) stays valid.
    expect(
      verifyWebhookSignature(realHmac, envelope(), SECRET, headers, {
        nowSeconds: NOW_SECONDS + DEFAULT_REPLAY_WINDOW_SECONDS,
      }),
    ).toEqual({ valid: true });
  });

  it('a custom replay window is honored (DATA parameter, never ambient time)', () => {
    const headers = signWebhookEventVia(realHmac, envelope(), SECRET, NOW_SECONDS);
    expect(
      verifyWebhookSignature(realHmac, envelope(), SECRET, headers, {
        nowSeconds: NOW_SECONDS + 30,
        replayWindowSeconds: 10,
      }),
    ).toEqual({ valid: false, reason: 'TIMESTAMP_OUTSIDE_REPLAY_WINDOW' });
  });

  it('a malformed signature is rejected (MALFORMED_SIGNATURE)', () => {
    expect(
      verifyWebhookSignature(realHmac, envelope(), SECRET, { signature: 'v1=nothex', timestamp: String(NOW_SECONDS) }, {
        nowSeconds: NOW_SECONDS,
      }),
    ).toEqual({ valid: false, reason: 'MALFORMED_SIGNATURE' });
    expect(
      verifyWebhookSignature(realHmac, envelope(), SECRET, { signature: 'garbage', timestamp: String(NOW_SECONDS) }, {
        nowSeconds: NOW_SECONDS,
      }),
    ).toEqual({ valid: false, reason: 'MALFORMED_SIGNATURE' });
  });

  it('a malformed timestamp is rejected (MALFORMED_TIMESTAMP)', () => {
    const headers = signWebhookEventVia(realHmac, envelope(), SECRET, NOW_SECONDS);
    expect(
      verifyWebhookSignature(realHmac, envelope(), SECRET, { ...headers, timestamp: 'not-a-number' }, {
        nowSeconds: NOW_SECONDS,
      }),
    ).toEqual({ valid: false, reason: 'MALFORMED_TIMESTAMP' });
  });

  it('signing is deterministic given the explicit timestamp (no ambient wall clock)', () => {
    const a = signWebhookEventVia(realHmac, envelope(), SECRET, NOW_SECONDS);
    const b = signWebhookEventVia(realHmac, envelope(), SECRET, NOW_SECONDS);
    expect(a).toEqual(b);
    const other = signWebhookEventVia(realHmac, envelope(), SECRET, NOW_SECONDS + 1);
    expect(other.signature).not.toBe(a.signature);
    expect(other.timestamp).toBe(String(NOW_SECONDS + 1));
  });

  it('the signed payload is `${timestamp}.${canonicalJson(envelope)}` (the wire contract)', () => {
    const payload = signedWebhookPayload(NOW_SECONDS, envelope());
    // Pinned canonical form (sorted keys, no whitespace):
    expect(payload).toBe(
      '1767225600.{"data":{"note":"an observation, never authority"},"id":"evt_1","occurredAt":"2026-01-01T00:00:00Z","schemaVersion":"1.0.0","type":"payment.observed"}',
    );
    expect(() => signedWebhookPayload(-1, envelope())).toThrow(ValidationError);
    expect(() => signedWebhookPayload(1.5, envelope())).toThrow(ValidationError);
  });
});

describe('deterministic exponential backoff (the pure retry math)', () => {
  it('failed deliveries schedule retries with base * 2^(attempt-1)', () => {
    expect(backoffDelayMs(1000, 1)).toBe(1000);
    expect(backoffDelayMs(1000, 2)).toBe(2000);
    expect(backoffDelayMs(1000, 3)).toBe(4000);
    expect(backoffDelayMs(1000, 5)).toBe(16000);
    expect(backoffDelayMs(250, 4)).toBe(2000);
  });

  it('rejects invalid bases and attempt numbers (fail closed)', () => {
    expect(() => backoffDelayMs(0, 1)).toThrow(ValidationError);
    expect(() => backoffDelayMs(-1000, 1)).toThrow(ValidationError);
    expect(() => backoffDelayMs(1000, 0)).toThrow(ValidationError);
    expect(() => backoffDelayMs(1000, 1.5)).toThrow(ValidationError);
  });
});
