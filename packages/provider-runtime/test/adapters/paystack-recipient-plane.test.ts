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
import { validatePaystackRecipientTypeEvidence } from '../../src/adapters/paystack/recipient-facts.ts';
import type { PaystackRecipientTypeEvidence } from '../../src/adapters/paystack/recipient-facts.ts';
import {
  createPaystackRecipientExecution,
  recipientRefOf,
} from '../../src/adapters/paystack/recipient-plane.ts';

/**
 * P27-C battery (ADR-0020 D4/D10): the recipient-plane EXECUTION paths —
 * the seal-consumer create/list drivers over scripted transports (the
 * battery never touches the network) and the TRANSFER-LANE WIRING (the
 * recipient stops being an opaque external string). Fake keys are
 * non-contiguously constructed test material ONLY; the registry
 * observations below are FIXTURES, never shipped evidence.
 */

const FAKE_TEST_KEY = 'sk' + '_test_FAKE51keyDoNotUse0077';
const FAKE_LIVE_KEY = 'sk' + '_live_FAKE51keyDoNotUse0078';

/** A scripted fake transport (FAKE_DETERMINISTIC) recording every call. */
class ScriptTransport implements ProviderTransport {
  readonly transportClass = 'FAKE_DETERMINISTIC' as const;
  readonly transportId = 'fake-paystack-recipient';
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

/** A verified observation fixture (TEST MATERIAL ONLY — never promoted to the shipped registry). */
function verifiedKesBankEvidence(overrides: Record<string, unknown> = {}): PaystackRecipientTypeEvidence {
  return validatePaystackRecipientTypeEvidence({
    recipientType: 'kepss',
    country: 'KE',
    currency: 'KES',
    status: 'VERIFIED_AVAILABLE',
    sourceUrl: 'https://docs.paystack.com/transfers',
    retrievedAt: '2026-11-03',
    evidenceTier: 'LIVE_PROVIDER_DOC',
    requiredFields: ['name', 'account_number', 'bank_code'],
    ...overrides,
  });
}

describe('the recipient-plane execution (the seal-consumer laws)', () => {
  it('with the SHIPPED (empty) registry, create REFUSES before any dispatch (K3/K4 fail-closed)', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        message: 'Recipient created',
        data: { recipient_code: 'RCP_p27c1', type: 'kepss' },
      }),
    );
    const execution = createPaystackRecipientExecution(deps(transport));
    await expect(
      execution.create({ apiKey: FAKE_TEST_KEY }, {
        recipientType: 'kepss',
        name: 'Kes Beneficiary Ltd',
        country: 'KE',
        currency: 'KES',
        accountNumber: '0123456789',
        bankCode: '00199',
      }),
    ).rejects.toThrow(/UNVERIFIED/);
    expect(transport.calls).toHaveLength(0);
  });

  it('with a verified evidence registry injected, create dispatches and CONFIRMS', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        message: 'Recipient created',
        data: { recipient_code: 'RCP_p27c1', type: 'kepss' },
      }),
    );
    const execution = createPaystackRecipientExecution({
      ...deps(transport),
      evidenceRegistry: [verifiedKesBankEvidence()],
    });
    const result = await execution.create({ apiKey: FAKE_TEST_KEY }, {
      recipientType: 'kepss',
      name: 'Kes Beneficiary Ltd',
      country: 'KE',
      currency: 'KES',
      accountNumber: '0123456789',
      bankCode: '00199',
    });
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.recipientCode).toBe('RCP_p27c1');
    expect(result.recipientType).toBe('kepss');
    expect(transport.calls[0]?.operationId).toBe('paystack.transfer_recipient.create');
    expect(transport.calls[0]?.params).toEqual({
      type: 'kepss',
      name: 'Kes Beneficiary Ltd',
      currency: 'KES',
      account_number: '0123456789',
      bank_code: '00199',
    });
    expect(JSON.stringify(result.providerReferences)).not.toContain(FAKE_TEST_KEY);
  });

  it('a live key NEVER derives the recipient grant (INV-25 — refused at the derivation)', async () => {
    const transport = new ScriptTransport(() => deliveredResponse(200, {}));
    const execution = createPaystackRecipientExecution({
      ...deps(transport),
      evidenceRegistry: [verifiedKesBankEvidence()],
    });
    await expect(
      execution.create({ apiKey: FAKE_LIVE_KEY }, {
        recipientType: 'kepss',
        name: 'Kes Beneficiary Ltd',
        country: 'KE',
        currency: 'KES',
        accountNumber: '0123456789',
        bankCode: '00199',
      }),
    ).rejects.toThrow(/INV-25/);
    await expect(execution.list({ apiKey: FAKE_LIVE_KEY })).rejects.toThrow(/INV-25/);
    expect(transport.calls).toHaveLength(0);
  });

  it('a 2xx without the recipient shape is UNKNOWN (INV-04 — never a guessed success)', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, { status: true, message: 'odd' }),
    );
    const execution = createPaystackRecipientExecution({
      ...deps(transport),
      evidenceRegistry: [verifiedKesBankEvidence()],
    });
    const result = await execution.create({ apiKey: FAKE_TEST_KEY }, {
      recipientType: 'kepss',
      name: 'Kes Beneficiary Ltd',
      country: 'KE',
      currency: 'KES',
      accountNumber: '0123456789',
      bankCode: '00199',
    });
    expect(result.outcome).toBe('UNKNOWN');
    expect(result.ambiguityReason).toBe('MALFORMED_RESPONSE_AFTER_DISPATCH');
  });

  it('a timeout after a potentially-effective dispatch is UNKNOWN with the canonical ambiguity reason', async () => {
    const transport = new ScriptTransport(() =>
      undeliveredResponse('TIMEOUT_AFTER_DISPATCH', 'timed out'),
    );
    const execution = createPaystackRecipientExecution({
      ...deps(transport),
      evidenceRegistry: [verifiedKesBankEvidence()],
    });
    const result = await execution.create({ apiKey: FAKE_TEST_KEY }, {
      recipientType: 'kepss',
      name: 'Kes Beneficiary Ltd',
      country: 'KE',
      currency: 'KES',
      accountNumber: '0123456789',
      bankCode: '00199',
    });
    expect(result.outcome).toBe('UNKNOWN');
    expect(result.ambiguityReason).toBe('TRANSPORT_TIMEOUT_AFTER_DISPATCH');
  });

  it('list is the read-back: CONFIRMED with the observed count + capped recipient codes', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        message: 'Recipients retrieved',
        data: [
          { recipient_code: 'RCP_a' },
          { recipient_code: 'RCP_b' },
          { type: 'nuban' },
        ],
      }),
    );
    const execution = createPaystackRecipientExecution(deps(transport));
    const result = await execution.list({ apiKey: FAKE_TEST_KEY });
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.observedCount).toBe(3);
    expect(result.providerReferences).toEqual(['RCP_a', 'RCP_b']);
    expect(transport.calls[0]?.operationId).toBe('paystack.transfer_recipient.list');
    // A 2xx without the canonical list shape is UNKNOWN.
    const malformed = new ScriptTransport(() => deliveredResponse(200, { status: true }));
    const malformedExecution = createPaystackRecipientExecution(deps(malformed));
    const unknown = await malformedExecution.list({ apiKey: FAKE_TEST_KEY });
    expect(unknown.outcome).toBe('UNKNOWN');
  });

  it('THE TRANSFER-LANE WIRING: recipientRefOf feeds the existing initiate path (the recipient stops being opaque)', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        data: { recipient_code: 'RCP_p27c1', type: 'kepss' },
      }),
    );
    const execution = createPaystackRecipientExecution({
      ...deps(transport),
      evidenceRegistry: [verifiedKesBankEvidence()],
    });
    const created = await execution.create({ apiKey: FAKE_TEST_KEY }, {
      recipientType: 'kepss',
      name: 'Kes Beneficiary Ltd',
      country: 'KE',
      currency: 'KES',
      accountNumber: '0123456789',
      bankCode: '00199',
    });
    const recipient = recipientRefOf(created);
    expect(recipient).toBe('RCP_p27c1');
    // The P22-H transfer lane accepts the typed plane's product verbatim.
    const transferTransport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        data: { reference: 'ref_p27c', transfer_code: 'TRF_p27c', status: 'pending' },
      }),
    );
    const transferExecution = createPaystackTransferExecution(deps(transferTransport));
    const transfer = await transferExecution.initiate({ apiKey: FAKE_TEST_KEY }, {
      amountMinorUnits: '1612500',
      currency: 'kes',
      recipient,
      reference: 'ref_p27c',
    });
    expect(transfer.outcome).toBe('CONFIRMED');
    expect(transferTransport.calls[0]?.params).toEqual({
      source: 'balance',
      amount: '1612500',
      recipient: 'RCP_p27c1',
      currency: 'kes',
      reference: 'ref_p27c',
    });
    // An unconfirmed creation carries no transfer recipient reference (fail-closed).
    expect(() =>
      recipientRefOf({ ...created, outcome: 'UNKNOWN', recipientCode: null }),
    ).toThrow(ValidationError);
  });
});
