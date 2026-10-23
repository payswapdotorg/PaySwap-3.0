import { describe, expect, it } from 'vitest';
import { DeterministicClock } from '../../src/clock.ts';
import { deliveredResponse, providerErrorResponse, undeliveredResponse } from '../../src/transport.ts';
import type { ProviderTransport, ProviderTransportResponse } from '../../src/transport.ts';
import { FlutterwaveHttpsTransport } from '../../src/adapters/flutterwave/https-transport.ts';
import type { FlutterwaveFetch } from '../../src/adapters/flutterwave/https-transport.ts';
import { createFlutterwaveVerificationProbe } from '../../src/adapters/flutterwave/verification-probe.ts';
import { assertNoSecretMaterial } from '../../src/redaction.ts';

/**
 * P14-C battery (ADR-0008 D5): the Flutterwave HTTPS transport + the
 * read-only verification probe. The transport tests inject a scripted
 * fetch (no network); the probe tests use the package's scripted fake
 * transport. Fake keys are non-contiguously constructed test material.
 */

const FAKE_TEST_KEY = 'FLWSECK_TEST-' + 'FAKE51keyDoNotUse0003';

describe('the Flutterwave HTTPS transport (injected fetch, fail-closed)', () => {
  it('maps flutterwave.balances.read to GET /v3/balances and passes the Bearer header through', async () => {
    const calls: { url: string; init: { method: string; headers: Record<string, string> } }[] = [];
    const fetchImpl: FlutterwaveFetch = async (url, init) => {
      calls.push({ url, init });
      return { status: 200, text: async () => JSON.stringify({ status: 'success', data: [] }) };
    };
    const transport = new FlutterwaveHttpsTransport({ fetchImpl });
    const response = await transport.send({
      operationId: 'flutterwave.balances.read',
      idempotencyKey: 'idem-1',
      params: {},
      headers: { Authorization: `Bearer ${FAKE_TEST_KEY}` },
      correlationId: 'corr-1',
    });
    expect(response).toEqual({ delivered: true, status: 200, body: { status: 'success', data: [] } });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.flutterwave.com/v3/balances');
    expect(calls[0]?.init.method).toBe('GET');
    expect(calls[0]?.init.headers.Authorization).toBe(`Bearer ${FAKE_TEST_KEY}`);
    expect(transport.transportClass).toBe('PRODUCTION_HTTP');
    expect(transport.transportId).toBe('flutterwave-https');
  });

  it('refuses unknown operations BEFORE dispatch (the fetch is never called)', async () => {
    let fetchCalls = 0;
    const fetchImpl: FlutterwaveFetch = async () => {
      fetchCalls += 1;
      return { status: 200, text: async () => '{}' };
    };
    const transport = new FlutterwaveHttpsTransport({ fetchImpl });
    const response = await transport.send({
      operationId: 'flutterwave.charge.create',
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
    const failing: FlutterwaveFetch = async () => ({
      status: 401,
      text: async () => JSON.stringify({ status: 'error', message: 'Invalid secret key' }),
    });
    const transport = new FlutterwaveHttpsTransport({ fetchImpl: failing });
    const refused = await transport.send({
      operationId: 'flutterwave.balances.read',
      idempotencyKey: 'idem-3',
      params: {},
      headers: {},
      correlationId: 'corr-3',
    });
    expect(refused.delivered).toBe(true);
    expect(refused.status).toBe(401);
    expect(refused.providerErrorCode).toBe('error');
    expect(refused.providerErrorMessage).toBe('Invalid secret key');

    const timingOut: FlutterwaveFetch = async () =>
      new Promise((_resolve, reject) => {
        const error = new Error('too slow');
        error.name = 'AbortError';
        reject(error);
      });
    const timeoutTransport = new FlutterwaveHttpsTransport({ fetchImpl: timingOut });
    const unknown = await timeoutTransport.send({
      operationId: 'flutterwave.balances.read',
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
  readonly transportId = 'fake-flw-probe';
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

describe('the Flutterwave read-only verification probe (the never-ACTIVE law)', () => {
  it('CONFIRMS on the canonical balances shape and reports the currency wallets as provider references', async () => {
    const transport = new ProbeScriptTransport(() =>
      deliveredResponse(200, {
        status: 'success',
        data: [
          { currency: 'NGN', available_balance: 1, ledger_balance: 1 },
          { currency: 'KES', available_balance: 2, ledger_balance: 2 },
          { currency: 'GHS', available_balance: 3, ledger_balance: 3 },
          { currency: 'USD', available_balance: 4, ledger_balance: 4 },
        ],
      }),
    );
    const probe = createFlutterwaveVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_TEST_KEY });
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.providerReferences).toEqual(['NGN', 'KES', 'GHS', 'USD']);
    expect(result.executionMode).toBe('SANDBOX');
    expect(transport.calls[0]?.operationId).toBe('flutterwave.balances.read');
    expect(transport.calls[0]?.authorization).toBe(`Bearer ${FAKE_TEST_KEY}`);
  });

  it('a 2xx without the canonical shape is UNKNOWN (never a fabricated CONFIRMED)', async () => {
    for (const body of [
      { status: 'error', data: [] },
      { status: 'success', data: 'not-an-array' },
      { status: 'success', data: [{ not: 'currency' }] },
      {},
    ]) {
      const transport = new ProbeScriptTransport(() => deliveredResponse(200, body));
      const probe = createFlutterwaveVerificationProbe(probeDeps(transport));
      const result = await probe({ apiKey: FAKE_TEST_KEY });
      expect(result.outcome).toBe('UNKNOWN');
      expect(result.ambiguityReason).toBe('MALFORMED_RESPONSE_AFTER_DISPATCH');
    }
  });

  it('a 401 answer is FAILED with keyRejected and a message that never echoes the key', async () => {
    const transport = new ProbeScriptTransport(() =>
      providerErrorResponse(401, 'error', `Invalid secret key ${FAKE_TEST_KEY}`),
    );
    const probe = createFlutterwaveVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_TEST_KEY });
    expect(result.outcome).toBe('FAILED');
    expect(result.failure?.keyRejected).toBe(true);
    expect(result.failure?.message).not.toContain(FAKE_TEST_KEY);
  });

  it('a timeout is UNKNOWN (INV-04 — reconcile by re-probing, never a blind retry)', async () => {
    const transport = new ProbeScriptTransport(() =>
      undeliveredResponse('TIMEOUT_AFTER_DISPATCH', 'timed out'),
    );
    const probe = createFlutterwaveVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_TEST_KEY });
    expect(result.outcome).toBe('UNKNOWN');
    expect(result.ambiguityReason).toBe('TRANSPORT_TIMEOUT_AFTER_DISPATCH');
  });

  it('the probe result never carries key material (the escape-scan law, re-scanned)', async () => {
    const transport = new ProbeScriptTransport(() =>
      deliveredResponse(200, { status: 'success', data: [{ currency: 'NGN', available_balance: 1 }] }),
    );
    const probe = createFlutterwaveVerificationProbe(probeDeps(transport));
    const confirmed = await probe({ apiKey: FAKE_TEST_KEY });
    assertNoSecretMaterial(confirmed, [FAKE_TEST_KEY], 'flw probe battery re-scan');
    // Serialization with the bigint-safe replacer (TimestampMs fields are
    // legit typed data) stays secret-free.
    const serialized = JSON.stringify(confirmed, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(serialized).not.toContain(FAKE_TEST_KEY);
  });

  it('an invalid material shape or mode mismatch is refused before any dispatch', async () => {
    const transport = new ProbeScriptTransport(() => deliveredResponse(200, { status: 'success', data: [] }));
    const probe = createFlutterwaveVerificationProbe(probeDeps(transport));
    await expect(probe({ apiKey: 'garbage' })).rejects.toThrow(/canonical prefix/);
    await expect(probe({ apiKey: 'FLWSECK-' + 'FAKE51live0004' })).rejects.toThrow(/INV-25/);
    expect(transport.calls).toHaveLength(0);
  });
});
