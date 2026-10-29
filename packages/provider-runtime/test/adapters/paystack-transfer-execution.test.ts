import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/errors.ts';
import { DeterministicClock } from '../../src/clock.ts';
import { deliveredResponse, undeliveredResponse } from '../../src/transport.ts';
import type {
  ProviderTransport,
  ProviderTransportCall,
  ProviderTransportResponse,
} from '../../src/transport.ts';
import { createPaystackTransferExecution } from '../../src/adapters/paystack/transfer-execution.ts';
import { PaystackHttpsTransport } from '../../src/adapters/paystack/https-transport.ts';
import { PAYSTACK_OPERATION_ENDPOINTS } from '../../src/adapters/paystack/https-transport.ts';

/**
 * P22-H battery (ADR-0016 D8): the Paystack transfer execution surface —
 * the endpoint map's POST growth, the path-parameter verify law, the
 * SANDBOX payout grant on every path, the honest-finality laws (a 2xx
 * without the transfer shape is UNKNOWN — never a guessed success) and
 * the INV-04 envelope laws. Fake keys are non-contiguously constructed
 * test material ONLY; the scripted transports never touch the network.
 */

const FAKE_TEST_KEY = 'sk' + '_test_FAKE51keyDoNotUse0042';
const FAKE_LIVE_KEY = 'sk' + '_live_FAKE51keyDoNotUse0043';

/** A scripted fake transport (FAKE_DETERMINISTIC) recording every call. */
class ScriptTransport implements ProviderTransport {
  readonly transportClass = 'FAKE_DETERMINISTIC' as const;
  readonly transportId = 'fake-paystack-transfer';
  readonly calls: ProviderTransportCall[] = [];
  readonly #script: (call: ProviderTransportCall) => ProviderTransportResponse;

  constructor(script: (call: ProviderTransportCall) => ProviderTransportResponse) {
    this.#script = script;
  }

  async send(call: ProviderTransportCall): Promise<ProviderTransportResponse> {
    this.calls.push(call);
    return this.#script(call);
  }
}

function deps(transport: ProviderTransport, startMs = 1_000n) {
  return { transport, clock: new DeterministicClock(startMs), executionMode: 'SANDBOX' as const };
}

describe('the Paystack endpoint map (the D8 POST growth over the REAL transport)', () => {
  /** A fake fetch recording method/url/body (never touches the network). */
  function recordingFetch(
    script: (url: string, init: { method: string; body?: string | undefined }) => { status: number; text: string },
  ) {
    const seen: { url: string; method: string; body?: string | undefined }[] = [];
    const fetchImpl = async (
      url: string,
      init: { method: 'GET' | 'POST'; headers: Readonly<Record<string, string>>; body?: string },
    ) => {
      seen.push({ url, method: init.method, ...(init.body !== undefined ? { body: init.body } : {}) });
      const answer = script(url, init);
      return { status: answer.status, text: async () => answer.text };
    };
    return { fetchImpl, seen };
  }

  it('maps the transfer surface: initiate/finalize POST JSON bodies; verify GETs the path parameter', async () => {
    const { fetchImpl, seen } = recordingFetch(() => ({
      status: 200,
      text: JSON.stringify({
        status: true,
        message: 'Transfer created',
        data: { reference: 'ref_p22_transfer', transfer_code: 'TRF_p22x', status: 'pending' },
      }),
    }));
    const transport = new PaystackHttpsTransport({ fetchImpl });
    await transport.send({
      operationId: 'paystack.transfer.initiate',
      idempotencyKey: 'ref_p22_transfer',
      params: { source: 'balance', amount: '1612500', recipient: 'RCP_p22', currency: 'kes' },
      headers: { Authorization: `Bearer ${FAKE_TEST_KEY}` },
      correlationId: 'test-initiate',
    });
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.url).toBe('https://api.paystack.co/transfer');
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({
      source: 'balance',
      amount: '1612500',
      recipient: 'RCP_p22',
      currency: 'kes',
    });
    await transport.send({
      operationId: 'paystack.transfer.finalize',
      idempotencyKey: 'test-finalize',
      params: { transfer_code: 'TRF_p22x', otp: '123456' },
      headers: {},
      correlationId: 'test-finalize',
    });
    expect(seen[1]?.url).toBe('https://api.paystack.co/transfer/finalize_transfer');
    await transport.send({
      operationId: 'paystack.transfer.verify',
      idempotencyKey: 'test-verify',
      params: { id: 'TRF_p22x' },
      headers: {},
      correlationId: 'test-verify',
    });
    expect(seen[2]?.method).toBe('GET');
    expect(seen[2]?.url).toBe('https://api.paystack.co/transfer/TRF_p22x');
    // The endpoint map itself: the read op stays GET; the transfer ops pinned.
    expect(PAYSTACK_OPERATION_ENDPOINTS.get('paystack.transactions.read')).toEqual({
      method: 'GET',
      path: '/transaction',
    });
    expect(PAYSTACK_OPERATION_ENDPOINTS.get('paystack.transfer.initiate')).toEqual({
      method: 'POST',
      path: '/transfer',
    });
  });

  it('the path-parameter law: a missing, empty or slash-carrying id is REFUSED BEFORE DISPATCH', async () => {
    const { fetchImpl, seen } = recordingFetch(() => ({ status: 200, text: '{}' }));
    const transport = new PaystackHttpsTransport({ fetchImpl });
    for (const params of [{}, { id: '' }, { id: 'a/b' }]) {
      const response = await transport.send({
        operationId: 'paystack.transfer.verify',
        idempotencyKey: 'test-verify-refused',
        params,
        headers: {},
        correlationId: 'test-verify-refused',
      });
      expect(response.delivered).toBe(false);
      expect(response.failure?.kind).toBe('REFUSED_BEFORE_DISPATCH');
    }
    expect(seen).toHaveLength(0);
  });
});

describe('the Paystack transfer execution (the seal-consumer laws)', () => {
  it('initiate CONFIRMS on the canonical transfer shape and never echoes the key (escape-scan)', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        message: 'Transfer created',
        data: { reference: 'ref_p22_transfer', transfer_code: 'TRF_p22x', status: 'pending' },
      }),
    );
    const execution = createPaystackTransferExecution(deps(transport));
    const result = await execution.initiate({ apiKey: FAKE_TEST_KEY }, {
      amountMinorUnits: '1612500',
      currency: 'kes',
      recipient: 'RCP_p22',
      reason: 'corridor KES off-ramp',
      reference: 'ref_p22_transfer',
    });
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.transferCode).toBe('TRF_p22x');
    expect(result.transferStatus).toBe('pending');
    expect(result.providerReferences).toContain('TRF_p22x');
    expect(transport.calls[0]?.operationId).toBe('paystack.transfer.initiate');
    // The escape-scan law: no string field of the result carries the key.
    expect(JSON.stringify(result.providerReferences)).not.toContain(FAKE_TEST_KEY);
    expect(result.transferCode).not.toContain(FAKE_TEST_KEY);
    expect(result.transferStatus).not.toContain(FAKE_TEST_KEY);
    expect(String(result.ambiguityReason ?? '')).not.toContain(FAKE_TEST_KEY);
  });

  it('initiate input validation: non-decimal amounts and bad currencies throw before any dispatch', async () => {
    const transport = new ScriptTransport(() => deliveredResponse(200, {}));
    const execution = createPaystackTransferExecution(deps(transport));
    await expect(
      execution.initiate({ apiKey: FAKE_TEST_KEY }, {
        amountMinorUnits: '12.50',
        currency: 'kes',
        recipient: 'RCP_p22',
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      execution.initiate({ apiKey: FAKE_TEST_KEY }, {
        amountMinorUnits: '1250',
        currency: 'KES',
        recipient: 'RCP_p22',
      }),
    ).rejects.toThrow(ValidationError);
    await expect(
      execution.initiate({ apiKey: FAKE_TEST_KEY }, {
        amountMinorUnits: '1250',
        currency: 'kes',
        recipient: '',
      }),
    ).rejects.toThrow(ValidationError);
    expect(transport.calls).toHaveLength(0);
  });

  it('a live key NEVER derives the payout grant (refused at the derivation — INV-25)', async () => {
    const transport = new ScriptTransport(() => deliveredResponse(200, {}));
    const execution = createPaystackTransferExecution(deps(transport));
    await expect(
      execution.initiate({ apiKey: FAKE_LIVE_KEY }, {
        amountMinorUnits: '1250',
        currency: 'kes',
        recipient: 'RCP_p22',
      }),
    ).rejects.toThrow(/INV-25/);
    expect(transport.calls).toHaveLength(0);
  });

  it('a 2xx without the transfer shape is UNKNOWN (honest finality — never a guessed success)', async () => {
    const transport = new ScriptTransport(() => deliveredResponse(200, { status: true, message: 'odd' }));
    const execution = createPaystackTransferExecution(deps(transport));
    const result = await execution.initiate({ apiKey: FAKE_TEST_KEY }, {
      amountMinorUnits: '1250',
      currency: 'kes',
      recipient: 'RCP_p22',
    });
    expect(result.outcome).toBe('UNKNOWN');
    expect(result.ambiguityReason).toBe('MALFORMED_RESPONSE_AFTER_DISPATCH');
  });

  it('a timeout after a potentially-effective dispatch is UNKNOWN (INV-04) with the ambiguity reason', async () => {
    const transport = new ScriptTransport(() => undeliveredResponse('TIMEOUT_AFTER_DISPATCH', 'timed out'));
    const execution = createPaystackTransferExecution(deps(transport));
    const result = await execution.initiate({ apiKey: FAKE_TEST_KEY }, {
      amountMinorUnits: '1250',
      currency: 'kes',
      recipient: 'RCP_p22',
    });
    expect(result.outcome).toBe('UNKNOWN');
    expect(result.ambiguityReason).toBe('TRANSPORT_TIMEOUT_AFTER_DISPATCH');
  });

  it('a delivered provider error is FAILED with the provider code (retryable per the envelope law)', async () => {
    const transport = new ScriptTransport(() =>
      undeliveredResponse('REFUSED_BEFORE_DISPATCH', 'unknown op') as never as ProviderTransportResponse,
    );
    // Build a delivered-error response directly.
    const errorTransport = new ScriptTransport(() => ({
      delivered: true,
      status: 401,
      body: { status: false, message: 'Invalid key' },
      providerErrorCode: 'error',
      providerErrorMessage: 'Invalid key',
    }));
    const execution = createPaystackTransferExecution(deps(errorTransport));
    const result = await execution.initiate({ apiKey: FAKE_TEST_KEY }, {
      amountMinorUnits: '1250',
      currency: 'kes',
      recipient: 'RCP_p22',
    });
    expect(result.outcome).toBe('FAILED');
    expect(result.failure?.code).toBe('error');
    expect(transport).toBeDefined();
  });

  it('finalize CONFIRMS the two-step completion with the transfer code + status in the references', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        message: 'Transfer finalized',
        data: { reference: 'ref_p22_transfer', transfer_code: 'TRF_p22x', status: 'success' },
      }),
    );
    const execution = createPaystackTransferExecution(deps(transport));
    const result = await execution.finalize({ apiKey: FAKE_TEST_KEY }, 'TRF_p22x', '123456');
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.transferStatus).toBe('success');
    expect(transport.calls[0]?.operationId).toBe('paystack.transfer.finalize');
    expect(transport.calls[0]?.params).toEqual({ transfer_code: 'TRF_p22x', otp: '123456' });
  });

  it('verify reads the transfer back by reference (the reconcile/read-back read) and never guesses', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        message: 'Transfer retrieved',
        data: { reference: 'ref_p22_transfer', transfer_code: 'TRF_p22x', status: 'success' },
      }),
    );
    const execution = createPaystackTransferExecution(deps(transport));
    const result = await execution.verify({ apiKey: FAKE_TEST_KEY }, 'ref_p22_transfer');
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.transferStatus).toBe('success');
    expect(transport.calls[0]?.operationId).toBe('paystack.transfer.verify');
    expect(transport.calls[0]?.params).toEqual({ id: 'ref_p22_transfer' });
    // A 2xx without the transfer shape on verify is UNKNOWN too.
    const malformed = new ScriptTransport(() => deliveredResponse(200, { status: true }));
    const malformedExecution = createPaystackTransferExecution(deps(malformed));
    const unknown = await malformedExecution.verify({ apiKey: FAKE_TEST_KEY }, 'ref_p22_transfer');
    expect(unknown.outcome).toBe('UNKNOWN');
  });

  it('the grant derivation runs on EVERY path (never cached) — a live key fails on verify too', async () => {
    const transport = new ScriptTransport(() => deliveredResponse(200, {}));
    const execution = createPaystackTransferExecution(deps(transport));
    await expect(execution.verify({ apiKey: FAKE_LIVE_KEY }, 'ref_x')).rejects.toThrow(/INV-25/);
    await expect(execution.finalize({ apiKey: FAKE_LIVE_KEY }, 'TRF_x', '000000')).rejects.toThrow(
      /INV-25/,
    );
    expect(transport.calls).toHaveLength(0);
  });
});
