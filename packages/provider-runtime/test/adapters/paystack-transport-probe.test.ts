import { describe, expect, it } from 'vitest';
import { DeterministicClock } from '../../src/clock.ts';
import { deliveredResponse, providerErrorResponse, undeliveredResponse } from '../../src/transport.ts';
import type { ProviderTransport, ProviderTransportResponse } from '../../src/transport.ts';
import { PaystackHttpsTransport } from '../../src/adapters/paystack/https-transport.ts';
import type { PaystackFetch } from '../../src/adapters/paystack/https-transport.ts';
import { createPaystackVerificationProbe } from '../../src/adapters/paystack/verification-probe.ts';
import { assertNoSecretMaterial } from '../../src/redaction.ts';

/**
 * P14-C battery (ADR-0008 D5): the Paystack HTTPS transport + the
 * read-only verification probe. The transport tests inject a scripted
 * fetch (no network); the probe tests use the package's scripted fake
 * transport. Fake keys are non-contiguously constructed test material.
 */

const FAKE_TEST_KEY = 'sk' + '_test_FAKE51keyDoNotUse0007';

describe('the Paystack HTTPS transport (injected fetch, fail-closed)', () => {
  it('maps paystack.transactions.read to GET /transaction and passes the Bearer header through', async () => {
    const calls: { url: string; init: { method: string; headers: Record<string, string> } }[] = [];
    const fetchImpl: PaystackFetch = async (url, init) => {
      calls.push({ url, init });
      return { status: 200, text: async () => JSON.stringify({ status: true, data: [] }) };
    };
    const transport = new PaystackHttpsTransport({ fetchImpl });
    const response = await transport.send({
      operationId: 'paystack.transactions.read',
      idempotencyKey: 'idem-1',
      params: {},
      headers: { Authorization: `Bearer ${FAKE_TEST_KEY}` },
      correlationId: 'corr-1',
    });
    expect(response).toEqual({ delivered: true, status: 200, body: { status: true, data: [] } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.paystack.co/transaction');
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.init.headers.Authorization).toBe(`Bearer ${FAKE_TEST_KEY}`);
    expect(transport.transportClass).toBe('PRODUCTION_HTTP');
    expect(transport.transportId).toBe('paystack-https');
  });

  it('refuses unknown operations BEFORE dispatch (the fetch is never called)', async () => {
    let fetchCalls = 0;
    const fetchImpl: PaystackFetch = async () => {
      fetchCalls += 1;
      return { status: 200, text: async () => '{}' };
    };
    const transport = new PaystackHttpsTransport({ fetchImpl });
    const response = await transport.send({
      operationId: 'paystack.charge.create',
      idempotencyKey: 'idem-2',
      params: {},
      headers: {},
      correlationId: 'corr-2',
    });
    expect(response.delivered).toBe(false);
    expect(response.failure?.kind).toBe('REFUSED_BEFORE_DISPATCH');
    expect(fetchCalls).toBe(0);
  });

  it('a non-2xx reads the provider error envelope; a timeout is UNKNOWN (INV-04)', async () => {
    const failing: PaystackFetch = async () => ({
      status: 401,
      text: async () => JSON.stringify({ status: false, message: 'Invalid key' }),
    });
    const transport = new PaystackHttpsTransport({ fetchImpl: failing });
    const refused = await transport.send({
      operationId: 'paystack.transactions.read',
      idempotencyKey: 'idem-3',
      params: {},
      headers: {},
      correlationId: 'corr-3',
    });
    expect(refused.delivered).toBe(true);
    expect(refused.status).toBe(401);
    expect(refused.providerErrorCode).toBe('error');
    expect(refused.providerErrorMessage).toBe('Invalid key');

    const timingOut: PaystackFetch = async () =>
      new Promise((_resolve, reject) => {
        const error = new Error('too slow');
        error.name = 'AbortError';
        reject(error);
      });
    const timeoutTransport = new PaystackHttpsTransport({ fetchImpl: timingOut });
    const unknown = await timeoutTransport.send({
      operationId: 'paystack.transactions.read',
      idempotencyKey: 'idem-4',
      params: {},
      headers: {},
      correlationId: 'corr-4',
    });
    expect(unknown.delivered).toBe(false);
    expect(unknown.failure?.kind).toBe('TIMEOUT_AFTER_DISPATCH');
  });
});

/** A scripted fake transport for the probe (FAKE_DETERMINISTIC). */
class ProbeScriptTransport implements ProviderTransport {
  readonly transportClass = 'FAKE_DETERMINISTIC' as const;
  readonly transportId = 'fake-paystack-probe';
  readonly calls: { operationId: string; authorization: string }[] = [];
  readonly #script: () => ProviderTransportResponse;

  constructor(script: () => ProviderTransportResponse) {
    this.#script = script;
  }

  async send(call: Parameters<ProviderTransport['send']>[0]): Promise<ProviderTransportResponse> {
    this.calls.push({ operationId: call.operationId, authorization: call.headers.Authorization ?? '' });
    return this.#script();
  }
}

function probeDeps(transport: ProviderTransport, startMs = 1_000n) {
  return { transport, clock: new DeterministicClock(startMs), executionMode: 'SANDBOX' as const };
}

describe('the Paystack read-only verification probe (the never-ACTIVE law)', () => {
  it('CONFIRMS on the canonical transactions shape and reports the transaction references (capped)', async () => {
    const data = Array.from({ length: 10 }, (_unused, index) => ({
      id: 1_000 + index,
      status: 'success',
      amount: 1500,
      currency: 'NGN',
    }));
    const transport = new ProbeScriptTransport(() =>
      deliveredResponse(200, { status: true, message: 'Retrieved', data }),
    );
    const probe = createPaystackVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_TEST_KEY });
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.providerReferences).toHaveLength(6);
    expect(result.providerReferences[0]).toBe('txn_1000');
    expect(transport.calls[0]?.operationId).toBe('paystack.transactions.read');
    expect(transport.calls[0]?.authorization).toBe(`Bearer ${FAKE_TEST_KEY}`);
  });

  it('a brand-new account answering data: [] is still canonical CONFIRMED evidence (the read path works)', async () => {
    const transport = new ProbeScriptTransport(() =>
      deliveredResponse(200, { status: true, message: 'Retrieved', data: [] }),
    );
    const probe = createPaystackVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_TEST_KEY });
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.providerReferences).toEqual([]);
  });

  it('a 2xx without the canonical shape is UNKNOWN (never a fabricated CONFIRMED)', async () => {
    for (const body of [
      { status: false, data: [] },
      { status: true, data: 'not-an-array' },
      { status: true, data: [{ not: 'an id' }] },
      {},
    ]) {
      const transport = new ProbeScriptTransport(() => deliveredResponse(200, body));
      const probe = createPaystackVerificationProbe(probeDeps(transport));
      const result = await probe({ apiKey: FAKE_TEST_KEY });
      expect(result.outcome).toBe('UNKNOWN');
      expect(result.ambiguityReason).toBe('MALFORMED_RESPONSE_AFTER_DISPATCH');
    }
  });

  it('a 401 answer is FAILED with keyRejected and a message that never echoes the key', async () => {
    const transport = new ProbeScriptTransport(() =>
      providerErrorResponse(401, 'error', `Invalid key ${FAKE_TEST_KEY}`),
    );
    const probe = createPaystackVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_TEST_KEY });
    expect(result.outcome).toBe('FAILED');
    expect(result.failure?.keyRejected).toBe(true);
    expect(result.failure?.message).not.toContain(FAKE_TEST_KEY);
  });

  it('a timeout is UNKNOWN (INV-04 — reconcile by re-probing, never a blind retry)', async () => {
    const transport = new ProbeScriptTransport(() =>
      undeliveredResponse('TIMEOUT_AFTER_DISPATCH', 'timed out'),
    );
    const probe = createPaystackVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_TEST_KEY });
    expect(result.outcome).toBe('UNKNOWN');
    expect(result.ambiguityReason).toBe('TRANSPORT_TIMEOUT_AFTER_DISPATCH');
  });

  it('the probe result never carries key material (the escape-scan law, re-scanned)', async () => {
    const transport = new ProbeScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        data: [{ id: 42, status: 'success', amount: 1500, currency: 'NGN' }],
      }),
    );
    const probe = createPaystackVerificationProbe(probeDeps(transport));
    const confirmed = await probe({ apiKey: FAKE_TEST_KEY });
    assertNoSecretMaterial(confirmed, [FAKE_TEST_KEY], 'paystack probe battery re-scan');
    const serialized = JSON.stringify(confirmed, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(serialized).not.toContain(FAKE_TEST_KEY);
  });

  it('an invalid material shape or mode mismatch is refused before any dispatch', async () => {
    const transport = new ProbeScriptTransport(() =>
      deliveredResponse(200, { status: true, data: [] }),
    );
    const probe = createPaystackVerificationProbe(probeDeps(transport));
    await expect(probe({ apiKey: 'pk_test_public' })).rejects.toThrow(/canonical prefix/);
    await expect(probe({ apiKey: 'sk' + '_live_FAKE51live0008' })).rejects.toThrow(/INV-25/);
    expect(transport.calls).toHaveLength(0);
  });
});
