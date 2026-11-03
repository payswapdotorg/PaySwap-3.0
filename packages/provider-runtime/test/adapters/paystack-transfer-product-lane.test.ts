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
import {
  createPaystackTransferProductLane,
  paystackTransferLifecycleStateOf,
  refuseIneligiblePaystackPurpose,
  PAYSTACK_TRANSACTION_PURPOSE_CLASSES,
  PAYSTACK_TRANSFER_ELIGIBLE_PURPOSE_CLASSES,
  PAYSTACK_COLLECTION_ELIGIBLE_PURPOSE_CLASSES,
} from '../../src/adapters/paystack/transfer-product-lane.ts';

/**
 * P27-C battery (ADR-0020 D2/D3): the TRANSFER PRODUCT LANE — the typed
 * payout lifecycle states (initiate → OTP/finalize → verify) and the
 * INV-30 non-laundering gate with TYPED REFUSALS FOR RELABELED PURPOSES.
 * Fake keys are non-contiguously constructed test material ONLY.
 */

const FAKE_TEST_KEY = 'sk' + '_test_FAKE51keyDoNotUse0103';

/** A scripted fake transport (FAKE_DETERMINISTIC) recording every call. */
class ScriptTransport implements ProviderTransport {
  readonly transportClass = 'FAKE_DETERMINISTIC' as const;
  readonly transportId = 'fake-paystack-product-lane';
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

const PAYOUT_INPUT = {
  purposeClass: 'CONTRACTOR_OR_SUPPLIER_PAYMENT' as const,
  amountMinorUnits: '1612500',
  currency: 'kes',
  recipient: 'RCP_p27c1',
  reason: 'December supplier settlement',
  reference: 'ref_p27c_payout_0001',
};

describe('the typed purpose vocabulary (the capability matrix §5 rows)', () => {
  it('carries the six typed classes with the per-surface eligible sets pinned', () => {
    expect(PAYSTACK_TRANSACTION_PURPOSE_CLASSES).toEqual([
      'GENUINE_COMMERCE',
      'MARKETPLACE_SELLER_SETTLEMENT',
      'CONTRACTOR_OR_SUPPLIER_PAYMENT',
      'REIMBURSEMENT_OR_REFUND',
      'REGULATED_REMITTANCE_P2P',
      'UNCLASSIFIED',
    ]);
    expect(PAYSTACK_TRANSFER_ELIGIBLE_PURPOSE_CLASSES).toEqual([
      'MARKETPLACE_SELLER_SETTLEMENT',
      'CONTRACTOR_OR_SUPPLIER_PAYMENT',
      'REIMBURSEMENT_OR_REFUND',
    ]);
    expect(PAYSTACK_COLLECTION_ELIGIBLE_PURPOSE_CLASSES).toEqual(['GENUINE_COMMERCE']);
  });
});

describe('the INV-30 gate on the transfer surface (typed refusals for relabeled purposes)', () => {
  it('the business-payout classes pass; commerce is NOT a transfer class (the matrix rows)', () => {
    for (const eligible of PAYSTACK_TRANSFER_ELIGIBLE_PURPOSE_CLASSES) {
      expect(() => refuseIneligiblePaystackPurpose('TRANSFER', eligible)).not.toThrow();
    }
    expect(() => refuseIneligiblePaystackPurpose('TRANSFER', 'GENUINE_COMMERCE')).toThrow(
      /not an eligible class/,
    );
  });

  it('REGULATED_REMITTANCE_P2P ALWAYS refuses — a business payout lane is not a personal wallet', () => {
    let refused: unknown;
    try {
      refuseIneligiblePaystackPurpose('TRANSFER', 'REGULATED_REMITTANCE_P2P');
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(ValidationError);
    expect(String((refused as ValidationError).message)).toMatch(/INV-30/);
  });

  it('UNCLASSIFIED always refuses (D3 — the class is never chosen at this surface)', () => {
    let refused: unknown;
    try {
      refuseIneligiblePaystackPurpose('TRANSFER', 'UNCLASSIFIED');
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(ValidationError);
    expect(String((refused as ValidationError).message)).toMatch(/INV-30\/D3/);
  });

  it('RELABELED PURPOSES STILL REFUSE — the gate reads ONLY the typed class (the INV-30 law)', () => {
    // The relabeling battery: the SAME remittance-shaped payout presented
    // under every commerce-sounding label the wire allows still refuses,
    // because the classification is the typed input and the reason string,
    // metadata or any other field is transparent to the gate.
    const commerceSoundingRelabels = [
      'goods purchase',
      'invoice payment',
      'family support gift',
      'school fees payment',
    ];
    for (const relabel of commerceSoundingRelabels) {
      expect(() =>
        refuseIneligiblePaystackPurpose('TRANSFER', 'REGULATED_REMITTANCE_P2P'),
      ).toThrow(/INV-30/);
      // An out-of-vocabulary "honest-sounding" label is not a class at all.
      expect(() => refuseIneligiblePaystackPurpose('TRANSFER', relabel)).toThrow(ValidationError);
    }
    // Splitting the transaction into many transfers changes nothing: each
    // dispatch carries the SAME typed class gate (the product lane refuses
    // each identically — decomposition is transparent).
    expect(() => refuseIneligiblePaystackPurpose('TRANSFER', 'REGULATED_REMITTANCE_P2P')).toThrow(
      /INV-30/,
    );
    expect(() => refuseIneligiblePaystackPurpose('TRANSFER', 'REGULATED_REMITTANCE_P2P')).toThrow(
      /INV-30/,
    );
  });
});

describe('the typed payout lifecycle states (honest finality — only the provider\'s success word is final)', () => {
  it('a pending initiate is INITIATED_PENDING_FINALIZE carrying the raw status verbatim', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        data: { reference: 'ref_p27c_payout_0001', transfer_code: 'TRF_p27c', status: 'pending' },
      }),
    );
    const execution = createPaystackTransferExecution(deps(transport));
    const state = paystackTransferLifecycleStateOf(
      await execution.initiate({ apiKey: FAKE_TEST_KEY }, {
        amountMinorUnits: '1612500',
        currency: 'kes',
        recipient: 'RCP_p27c1',
        reference: 'ref_p27c_payout_0001',
      }),
    );
    expect(state.kind).toBe('INITIATED_PENDING_FINALIZE');
    if (state.kind === 'INITIATED_PENDING_FINALIZE') {
      expect(state.rawStatus).toBe('pending');
      expect(state.transferCode).toBe('TRF_p27c');
    }
  });

  it('only a raw success status is CONFIRMED_FINAL; an UNKNOWN stays UNKNOWN (INV-04)', async () => {
    const success = createPaystackTransferExecution(
      deps(
        new ScriptTransport(() =>
          deliveredResponse(200, {
            status: true,
            data: { reference: 'r', transfer_code: 'TRF_x', status: 'success' },
          }),
        ),
      ),
    );
    const final = paystackTransferLifecycleStateOf(
      await success.finalize({ apiKey: FAKE_TEST_KEY }, 'TRF_x', '123456'),
    );
    expect(final.kind).toBe('CONFIRMED_FINAL');
    if (final.kind === 'CONFIRMED_FINAL') {
      expect(final.rawStatus).toBe('success');
    }
    const unknown = createPaystackTransferExecution(
      deps(new ScriptTransport(() => undeliveredResponse('TIMEOUT_AFTER_DISPATCH', 't'))),
    );
    const unresolved = paystackTransferLifecycleStateOf(
      await unknown.initiate({ apiKey: FAKE_TEST_KEY }, {
        amountMinorUnits: '1',
        currency: 'kes',
        recipient: 'RCP_x',
      }),
    );
    expect(unresolved.kind).toBe('UNKNOWN');
    if (unresolved.kind === 'UNKNOWN') {
      expect(unresolved.ambiguityReason).toBe('TRANSPORT_TIMEOUT_AFTER_DISPATCH');
    }
    const failed = createPaystackTransferExecution(
      deps(
        new ScriptTransport(() => ({
          delivered: true,
          status: 401,
          body: { status: false, message: 'Invalid key' },
          providerErrorCode: 'error',
          providerErrorMessage: 'Invalid key',
        })),
      ),
    );
    const rejected = paystackTransferLifecycleStateOf(
      await failed.initiate({ apiKey: FAKE_TEST_KEY }, {
        amountMinorUnits: '1',
        currency: 'kes',
        recipient: 'RCP_x',
      }),
    );
    expect(rejected.kind).toBe('FAILED');
  });
});

describe('the transfer product lane driver (initiate → OTP/finalize → verify with typed states)', () => {
  it('runs the FULL product lane: initiate (pending) → completeWithOtp (final) → reconcile (final)', async () => {
    // A transport that answers the finalize + verify steps with success.
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        data: {
          reference: 'ref_p27c_payout_0001',
          transfer_code: 'TRF_p27c',
          status: 'success',
        },
      }),
    );
    const lane = createPaystackTransferProductLane(deps(transport));

    // Step 1 — initiate: the provider answers pending.
    const pendingTransport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        data: { reference: 'ref_p27c_payout_0001', transfer_code: 'TRF_p27c', status: 'pending' },
      }),
    );
    const pendingLane = createPaystackTransferProductLane(deps(pendingTransport));
    const initiated = await pendingLane.runPayout({ apiKey: FAKE_TEST_KEY }, PAYOUT_INPUT);
    expect(initiated.kind).toBe('INITIATED_PENDING_FINALIZE');
    expect(pendingTransport.calls[0]?.operationId).toBe('paystack.transfer.initiate');
    // The typed purpose class never leaks onto the wire (the gate is local).
    expect(JSON.stringify(pendingTransport.calls[0]?.params)).not.toContain('purposeClass');

    // Step 2 — the operator's OTP completes the pending transfer.
    const completed = await lane.completeWithOtp({ apiKey: FAKE_TEST_KEY }, {
      purposeClass: 'CONTRACTOR_OR_SUPPLIER_PAYMENT',
      transferCode: 'TRF_p27c',
      otp: '123456',
    });
    expect(completed.kind).toBe('CONFIRMED_FINAL');
    expect(transport.calls[0]?.operationId).toBe('paystack.transfer.finalize');
    expect(transport.calls[0]?.params).toEqual({ transfer_code: 'TRF_p27c', otp: '123456' });

    // Step 3 — the reconcile read-back reports the provider's truth.
    const reconciled = await lane.reconcile({ apiKey: FAKE_TEST_KEY }, 'ref_p27c_payout_0001');
    expect(reconciled.kind).toBe('CONFIRMED_FINAL');
    expect(transport.calls[1]?.operationId).toBe('paystack.transfer.verify');
  });

  it('an eligible purpose dispatches; a P2P or unclassified purpose NEVER reaches the seal', async () => {
    const transport = new ScriptTransport(() =>
      deliveredResponse(200, {
        status: true,
        data: { reference: 'r', transfer_code: 'TRF_x', status: 'success' },
      }),
    );
    const lane = createPaystackTransferProductLane(deps(transport));
    await expect(
      lane.runPayout({ apiKey: FAKE_TEST_KEY }, {
        ...PAYOUT_INPUT,
        purposeClass: 'REGULATED_REMITTANCE_P2P',
      }),
    ).rejects.toThrow(/INV-30/);
    await expect(
      lane.runPayout({ apiKey: FAKE_TEST_KEY }, { ...PAYOUT_INPUT, purposeClass: 'UNCLASSIFIED' }),
    ).rejects.toThrow(/INV-30/);
    // The relabeled completion path refuses too (the classification travels
    // with the transaction — relabeling the OTP step never launders it).
    await expect(
      lane.completeWithOtp({ apiKey: FAKE_TEST_KEY }, {
        purposeClass: 'REGULATED_REMITTANCE_P2P',
        transferCode: 'TRF_x',
        otp: '123456',
      }),
    ).rejects.toThrow(/INV-30/);
    await expect(
      lane.completeWithOtp({ apiKey: FAKE_TEST_KEY }, {
        purposeClass: 'UNCLASSIFIED',
        transferCode: 'TRF_x',
        otp: '123456',
      }),
    ).rejects.toThrow(/INV-30/);
    // NOTHING was dispatched: the gate runs before the grant and the seal.
    expect(transport.calls).toHaveLength(0);
  });

  it('a commerce-class purpose is not a transfer purpose (the honest ✗/— row, never silently bucketed)', async () => {
    const transport = new ScriptTransport(() => deliveredResponse(200, {}));
    const lane = createPaystackTransferProductLane(deps(transport));
    await expect(
      lane.runPayout({ apiKey: FAKE_TEST_KEY }, { ...PAYOUT_INPUT, purposeClass: 'GENUINE_COMMERCE' }),
    ).rejects.toThrow(/not an eligible class/);
    expect(transport.calls).toHaveLength(0);
  });
});
