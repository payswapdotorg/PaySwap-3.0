import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/errors.ts';
import { DeterministicClock } from '../../src/clock.ts';
import { deliveredResponse, undeliveredResponse } from '../../src/transport.ts';
import type {
  ProviderTransport,
  ProviderTransportCall,
  ProviderTransportResponse,
} from '../../src/transport.ts';
import { createPaystackCollectionExecution } from '../../src/adapters/paystack/collection-execution.ts';
import { createPaystackHostedPaymentPage } from '../../src/adapters/paystack/hosted-payment-page.ts';
import { PaystackHttpsTransport } from '../../src/adapters/paystack/https-transport.ts';
import { PAYSTACK_OPERATION_ENDPOINTS } from '../../src/adapters/paystack/https-transport.ts';
import {
  derivePaystackSandboxCollectionGrant,
  refuseConsequentialPaystackGrant,
} from '../../src/adapters/paystack/capabilities.ts';
import { refuseIneligiblePaystackPurpose } from '../../src/adapters/paystack/transfer-product-lane.ts';

/**
 * P27-C battery (ADR-0020 D4): the COLLECTION SURFACE — transaction
 * initialization (the hosted payment page), the verify read-back and
 * the hosted payment-page product; the collection grant derivation;
 * the INV-30 purpose gate (a collection is the genuine-commerce
 * product); reference-idempotency and the INV-04 envelope laws. Fake
 * keys are non-contiguously constructed test material ONLY.
 */

const FAKE_TEST_KEY = 'sk' + '_test_FAKE51keyDoNotUse0091';
const FAKE_LIVE_KEY = 'sk' + '_live_FAKE51keyDoNotUse0092';

/** A scripted fake transport (FAKE_DETERMINISTIC) recording every call. */
class ScriptTransport implements ProviderTransport {
  readonly transportClass = 'FAKE_DETERMINISTIC' as const;
  readonly transportId = 'fake-paystack-collection';
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

const COMMERCE_INPUT = {
  purposeClass: 'GENUINE_COMMERCE' as const,
  email: 'customer@example.com',
  amountMinorUnits: '500000',
  currency: 'kes',
  reference: 'ref_p27c_collection_0001',
};

describe('the endpoint map growth (the collection + page rows over the REAL transport)', () => {
  it('maps the collection surface: initialize POSTs; verify GETs the reference path segment; the page POSTs', async () => {
    const seen: { url: string; method: string; body?: string }[] = [];
    const fetchImpl = async (
      url: string,
      init: { method: 'GET' | 'POST'; headers: Readonly<Record<string, string>>; body?: string },
    ) => {
      seen.push({ url, method: init.method, ...(init.body !== undefined ? { body: init.body } : {}) });
      return { status: 200, text: async () => JSON.stringify({ status: true, data: {} }) };
    };
    const transport = new PaystackHttpsTransport({ fetchImpl });
    await transport.send({
      operationId: 'paystack.transaction.initialize',
      idempotencyKey: 'ref_x',
      params: { email: 'a@b.co', amount: '100', currency: 'kes', reference: 'ref_x' },
      headers: {},
      correlationId: 't-init',
    });
    await transport.send({
      operationId: 'paystack.transaction.verify',
      idempotencyKey: 'ref_x',
      params: { reference: 'ref_x' },
      headers: {},
      correlationId: 't-verify',
    });
    await transport.send({
      operationId: 'paystack.transfer_recipient.create',
      idempotencyKey: 'r',
      params: { type: 'nuban', name: 'x', currency: 'NGN' },
      headers: {},
      correlationId: 't-recipient',
    });
    await transport.send({
      operationId: 'paystack.transfer_recipient.list',
      idempotencyKey: 'rl',
      params: {},
      headers: {},
      correlationId: 't-recipient-list',
    });
    await transport.send({
      operationId: 'paystack.page.create',
      idempotencyKey: 'p',
      params: { name: 'Storefront' },
      headers: {},
      correlationId: 't-page',
    });
    expect(seen[0]).toEqual({
      url: 'https://api.paystack.co/transaction/initialize',
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.co', amount: '100', currency: 'kes', reference: 'ref_x' }),
    });
    expect(seen[1]).toEqual({ url: 'https://api.paystack.co/transaction/verify/ref_x', method: 'GET' });
    expect(seen[2]?.url).toBe('https://api.paystack.co/transferrecipient');
    expect(seen[3]).toEqual({ url: 'https://api.paystack.co/transferrecipient', method: 'GET' });
    expect(seen[4]?.url).toBe('https://api.paystack.co/page');
    // The P22-H rows are unchanged (the audited surface pins).
    expect(PAYSTACK_OPERATION_ENDPOINTS.get('paystack.transactions.read')).toEqual({
      method: 'GET',
      path: '/transaction',
    });
    expect(PAYSTACK_OPERATION_ENDPOINTS.get('paystack.transfer.initiate')).toEqual({
      method: 'POST',
      path: '/transfer',
    });
  });

  it('the path-parameter law: a missing, empty or slash-carrying verify reference REFUSES BEFORE DISPATCH', async () => {
    const seen: unknown[] = [];
    const fetchImpl = async () => {
      seen.push('called');
      return { status: 200, text: async () => '{}' };
    };
    const transport = new PaystackHttpsTransport({ fetchImpl });
    for (const params of [{}, { reference: '' }, { reference: 'a/b' }]) {
      const response = await transport.send({
        operationId: 'paystack.transaction.verify',
        idempotencyKey: 't-refused',
        params,
        headers: {},
        correlationId: 't-refused',
      });
      expect(response.delivered).toBe(false);
      expect(response.failure?.kind).toBe('REFUSED_BEFORE_DISPATCH');
    }
    expect(seen).toHaveLength(0);
  });
});

describe('the INV-30 purpose gate on the collection surface (the §5 rows made mechanical)', () => {
  it('GENUINE_COMMERCE passes; every other typed class REFUSES', () => {
    expect(() =>
      refuseIneligiblePaystackPurpose('COLLECTION', 'GENUINE_COMMERCE'),
    ).not.toThrow();
    // A P2P purpose is NEVER eligible on collection.
    expect(() => refuseIneligiblePaystackPurpose('COLLECTION', 'REGULATED_REMITTANCE_P2P')).toThrow(
      /INV-30/,
    );
    // An unclassified transaction never dispatches.
    expect(() => refuseIneligiblePaystackPurpose('COLLECTION', 'UNCLASSIFIED')).toThrow(
      /INV-30\/D3/,
    );
    // Payout classes are NOT collection classes (the matrix ✗/— rows).
    expect(() =>
      refuseIneligiblePaystackPurpose('COLLECTION', 'MARKETPLACE_SELLER_SETTLEMENT'),
    ).toThrow(/not an eligible class/);
    expect(() =>
      refuseIneligiblePaystackPurpose('COLLECTION', 'CONTRACTOR_OR_SUPPLIER_PAYMENT'),
    ).toThrow(/not an eligible class/);
  });

  it('RELABELING CHANGES NOTHING: the gate reads ONLY the typed class (INV-30)', () => {
    // A remittance-class transaction stays refused no matter what the
    // commerce-shaped labels around it claim.
    expect(() =>
      refuseIneligiblePaystackPurpose('COLLECTION', 'REGULATED_REMITTANCE_P2P'),
    ).toThrow(/INV-30/);
    // And an out-of-vocabulary value is refused (never guessed into a class).
    expect(() => refuseIneligiblePaystackPurpose('COLLECTION', 'goods_purchase_honest_sounding')).toThrow(
      ValidationError,
    );
    expect(() => refuseIneligiblePaystackPurpose('COLLECTION', undefined)).toThrow(ValidationError);
  });
});

describe('the collection execution (initialize + verify + the hosted page)', () => {
  it('initialize CONFIRMS a payment REQUEST (never money movement) and carries the unique reference', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        message: 'Authorization URL created',
        data: {
          authorization_url: 'https://checkout.paystack.co/test_ref_0001',
          access_code: 'abc',
          reference: 'ref_p27c_collection_0001',
        },
      }),
    );
    const execution = createPaystackCollectionExecution(deps(transport));
    const result = await execution.initializeTransaction({ apiKey: FAKE_TEST_KEY }, COMMERCE_INPUT);
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.reference).toBe('ref_p27c_collection_0001');
    expect(result.authorizationUrl).toBe('https://checkout.paystack.co/test_ref_0001');
    expect(result.confirmedPaid).toBe(false);
    expect(transport.calls[0]?.operationId).toBe('paystack.transaction.initialize');
    // The unique-reference idempotency law: the caller's reference IS the idempotency key.
    expect(transport.calls[0]?.idempotencyKey).toBe('ref_p27c_collection_0001');
    expect(JSON.stringify(result.providerReferences)).not.toContain(FAKE_TEST_KEY);
  });

  it('a P2P or unclassified purpose NEVER reaches the wire (INV-30 before dispatch)', async () => {
    const transport = new ScriptTransport(() => deliveredResponse(200, {}));
    const execution = createPaystackCollectionExecution(deps(transport));
    await expect(
      execution.initializeTransaction({ apiKey: FAKE_TEST_KEY }, {
        ...COMMERCE_INPUT,
        purposeClass: 'REGULATED_REMITTANCE_P2P',
      }),
    ).rejects.toThrow(/INV-30/);
    await expect(
      execution.initializeTransaction({ apiKey: FAKE_TEST_KEY }, {
        ...COMMERCE_INPUT,
        purposeClass: 'UNCLASSIFIED',
      }),
    ).rejects.toThrow(/INV-30/);
    expect(transport.calls).toHaveLength(0);
  });

  it('input validation: email, amount, currency and the REQUIRED unique reference (fail-closed)', async () => {
    const transport = new ScriptTransport(() => deliveredResponse(200, {}));
    const execution = createPaystackCollectionExecution(deps(transport));
    await expect(
      execution.initializeTransaction({ apiKey: FAKE_TEST_KEY }, { ...COMMERCE_INPUT, email: 'not-an-email' }),
    ).rejects.toThrow(ValidationError);
    await expect(
      execution.initializeTransaction({ apiKey: FAKE_TEST_KEY }, { ...COMMERCE_INPUT, amountMinorUnits: '12.5' }),
    ).rejects.toThrow(ValidationError);
    await expect(
      execution.initializeTransaction({ apiKey: FAKE_TEST_KEY }, { ...COMMERCE_INPUT, currency: 'KES' }),
    ).rejects.toThrow(ValidationError);
    await expect(
      execution.initializeTransaction({ apiKey: FAKE_TEST_KEY }, { ...COMMERCE_INPUT, reference: '' }),
    ).rejects.toThrow(/UNIQUE reference/);
    expect(transport.calls).toHaveLength(0);
  });

  it('a 2xx without the hosted-page shape is UNKNOWN; a timeout is UNKNOWN with the ambiguity reason (INV-04)', async () => {
    const malformed = createPaystackCollectionExecution(
      deps(new ScriptTransport(() => deliveredResponse(200, { status: true, message: 'odd' }))),
    );
    const unknown = await malformed.initializeTransaction({ apiKey: FAKE_TEST_KEY }, COMMERCE_INPUT);
    expect(unknown.outcome).toBe('UNKNOWN');
    expect(unknown.ambiguityReason).toBe('MALFORMED_RESPONSE_AFTER_DISPATCH');

    const timedOut = createPaystackCollectionExecution(
      deps(new ScriptTransport(() => undeliveredResponse('TIMEOUT_AFTER_DISPATCH', 'timed out'))),
    );
    const timeout = await timedOut.initializeTransaction({ apiKey: FAKE_TEST_KEY }, COMMERCE_INPUT);
    expect(timeout.outcome).toBe('UNKNOWN');
    expect(timeout.ambiguityReason).toBe('TRANSPORT_TIMEOUT_AFTER_DISPATCH');
  });

  it('verify is the read-back: paid ONLY on the provider\'s own success status word', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        message: 'Verification successful',
        data: { reference: 'ref_p27c_collection_0001', status: 'success', amount: 500000, currency: 'NGN' },
      }),
    );
    const execution = createPaystackCollectionExecution(deps(transport));
    const paid = await execution.verifyTransaction({ apiKey: FAKE_TEST_KEY }, 'ref_p27c_collection_0001');
    expect(paid.outcome).toBe('CONFIRMED');
    expect(paid.confirmedPaid).toBe(true);
    expect(transport.calls[0]?.operationId).toBe('paystack.transaction.verify');
    // A non-success provider status is an honest not-paid observation.
    const pending = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        data: { reference: 'ref_p27c_collection_0001', status: 'abandoned' },
      }),
    );
    const pendingExecution = createPaystackCollectionExecution(deps(pending));
    const abandoned = await pendingExecution.verifyTransaction(
      { apiKey: FAKE_TEST_KEY },
      'ref_p27c_collection_0001',
    );
    expect(abandoned.outcome).toBe('CONFIRMED');
    expect(abandoned.confirmedPaid).toBe(false);
    expect(abandoned.transactionStatus).toBe('abandoned');
  });

  it('the hosted payment page: CONFIRMED on the page id; a 2xx without it is UNKNOWN', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        message: 'Page created',
        data: { id: 217, name: 'Storefront' },
      }),
    );
    const createPage = createPaystackHostedPaymentPage(deps(transport));
    const page = await createPage({ apiKey: FAKE_TEST_KEY }, {
      purposeClass: 'GENUINE_COMMERCE',
      name: 'Storefront',
      description: 'Goods',
      amountMinorUnits: '500000',
      currency: 'kes',
    });
    expect(page.outcome).toBe('CONFIRMED');
    expect(page.providerReferences).toEqual(['217', 'Storefront']);
    expect(transport.calls[0]?.operationId).toBe('paystack.page.create');
    // A P2P purpose never creates a page.
    await expect(
      createPage({ apiKey: FAKE_TEST_KEY }, { purposeClass: 'REGULATED_REMITTANCE_P2P', name: 'x' }),
    ).rejects.toThrow(/INV-30/);
    // A 2xx without the page shape is UNKNOWN.
    const malformed = createPaystackHostedPaymentPage(
      deps(new ScriptTransport(() => deliveredResponse(200, { status: true }))),
    );
    const unknown = await malformed({ apiKey: FAKE_TEST_KEY }, {
      purposeClass: 'GENUINE_COMMERCE',
      name: 'Storefront',
    });
    expect(unknown.outcome).toBe('UNKNOWN');
  });

  it('a live key NEVER derives the collection grant (INV-25)', async () => {
    const transport = new ScriptTransport(() => deliveredResponse(200, {}));
    const execution = createPaystackCollectionExecution(deps(transport));
    await expect(
      execution.initializeTransaction({ apiKey: FAKE_LIVE_KEY }, COMMERCE_INPUT),
    ).rejects.toThrow(/INV-25/);
    await expect(execution.verifyTransaction({ apiKey: FAKE_LIVE_KEY }, 'ref_x')).rejects.toThrow(
      /INV-25/,
    );
    expect(transport.calls).toHaveLength(0);
  });
});

describe('the D4 grant law on the collection surface (the read-only scope NEVER widens)', () => {
  it('the collection grant is SANDBOX-only, derived at dispatch, distinct from the read-only scope', () => {
    const scope = derivePaystackSandboxCollectionGrant(FAKE_TEST_KEY, 'SANDBOX');
    expect(scope.allowedOperations).toContain('CREATE_EXTERNAL_EFFECT');
    expect(scope.allowedEffectClasses).toContain('STATE_CHANGING');
    expect(scope.allowedDataClasses).toContain('COLLECTION_WRITE');
    expect(Object.isFrozen(scope)).toBe(true);
    expect(() => derivePaystackSandboxCollectionGrant(FAKE_LIVE_KEY, 'SANDBOX')).toThrow(/INV-25/);
    expect(() => derivePaystackSandboxCollectionGrant(FAKE_TEST_KEY, 'LIVE')).toThrow(/INV-25/);
    // The read-only slice's refusal law is UNCHANGED (D4).
    expect(() => refuseConsequentialPaystackGrant('CREATE_EXTERNAL_EFFECT')).toThrow(ValidationError);
  });
});
