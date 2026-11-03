/**
 * @payswap/provider-runtime — the Paystack Africa SANDBOX HARNESS
 * companion battery (P27-C, ADR-0020 D11; the scripts/p27/c1 harness's
 * journey laws under hermetic test — the stripe-sandbox-harness.test.ts
 * two-tier precedent).
 *
 * THE TWO-TIER LAW (never renamed, never a silent pass):
 *
 * TIER 1 — SCRIPTED (always runs, credential-free): the SAME c1 harness
 * journeys driven through a deterministic fake fetch over the REAL
 * PaystackHttpsTransport — the read-only probe, the recipient list
 * read-back, the K3/K4 typed refusal (the empty registry), the collection
 * initialize → verify read-back, the payout reconcile read-back's typed
 * states, the webhook signature self-check (a fake crypto seam) and the
 * INV-30 purpose-gate refusals. Proves the harness plumbing with ZERO
 * credentials, ZERO network. NEVER counts as real-provider evidence.
 *
 * TIER 2 — REAL PAYSTACK SANDBOX (OPERATOR_GATED): runs ONLY when the
 * operator supplies a test-mode secret key via PAYSTACK_SECRET_KEY (the
 * station secret store; the run card's per-business convention is
 * PAYSTACK_SECRET_KEY_<BUSINESS>). Skips cleanly when the variable is
 * absent — the tier marker records the gate, never a pass. A live-mode
 * key is REFUSED (INV-25) and the harness itself exits 1 on it.
 */

import { describe, expect, it } from 'vitest';
import { DeterministicClock, SystemRuntimeClock } from '../../src/clock.ts';
import { PaystackHttpsTransport } from '../../src/adapters/paystack/https-transport.ts';
import { createPaystackVerificationProbe } from '../../src/adapters/paystack/verification-probe.ts';
import { createPaystackRecipientExecution } from '../../src/adapters/paystack/recipient-plane.ts';
import { buildPaystackTransferRecipientRequest } from '../../src/adapters/paystack/recipient-request.ts';
import { createPaystackCollectionExecution } from '../../src/adapters/paystack/collection-execution.ts';
import { createPaystackTransferProductLane } from '../../src/adapters/paystack/transfer-product-lane.ts';
import { createPaystackWebhookVerificationModule } from '../../src/adapters/paystack/webhook-verification.ts';
import { createInMemoryPaystackWebhookConsumedStore } from '../../src/adapters/paystack/webhook-verification.ts';
import type { PaystackWebhookCrypto } from '../../src/adapters/paystack/webhook-signature.ts';

/** The env var that gates the real tier (NEVER a hardcoded key). */
const ENV_REAL_TIER = 'PAYSTACK_SECRET_KEY';
/** The env var that additionally opts into the real write journeys. */
const ENV_WRITES = 'PAYSTACK_SANDBOX_WRITES_ENABLED';

const realSandboxKey = process.env[ENV_REAL_TIER];
const writesEnabled = process.env[ENV_WRITES] === '1';

/**
 * The harness tier marker (the honest record a run leaves behind):
 * - 'REAL_SANDBOX' — the operator supplied credentials; TIER 2 ran;
 * - 'SCRIPTED_FAKE_ONLY__OPERATOR_GATED' — no credentials; only TIER 1
 *   ran and the real tier is recorded as OPERATOR_GATED, never as a pass.
 */
export const PAYSTACK_AFRICA_HARNESS_TIER =
  realSandboxKey !== undefined && realSandboxKey.length > 0
    ? 'REAL_SANDBOX'
    : 'SCRIPTED_FAKE_ONLY__OPERATOR_GATED';

/** The real-fetch binding adapter (the host composition responsibility). */
const realFetchBinding = async (
  url: string,
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string; signal?: AbortSignal },
): Promise<{ status: number; text(): Promise<string> }> => {
  const response = await fetch(url, init);
  return { status: response.status, text: () => response.text() };
};

/** A scripted Paystack-shaped fetch (TIER 1; deterministic, no network). */
class FakePaystackFetch {
  readonly seen: { url: string; method: string; body?: string }[] = [];
  readonly #pages: Record<string, () => { status: number; body: unknown }>;

  constructor(pages: Record<string, () => { status: number; body: unknown }>) {
    this.#pages = pages;
  }

  readonly impl = async (
    url: string,
    init: { method: 'GET' | 'POST'; headers: Readonly<Record<string, string>>; body?: string },
  ): Promise<{ status: number; text(): Promise<string> }> => {
    this.seen.push({ url, method: init.method, ...(init.body !== undefined ? { body: init.body } : {}) });
    const page = this.#pages[url.split('?')[0] ?? ''];
    const answer = page !== undefined ? page() : { status: 404, body: { status: false, message: 'not scripted' } };
    return { status: answer.status, text: async () => JSON.stringify(answer.body) };
  };
}

function transportOf(fetch: FakePaystackFetch): PaystackHttpsTransport {
  return new PaystackHttpsTransport({ fetchImpl: fetch.impl });
}

function deps(transport: PaystackHttpsTransport, startMs = 1_000n) {
  return { transport, clock: new DeterministicClock(startMs), executionMode: 'SANDBOX' as const };
}

/** A fake key is non-contiguously constructed test material ONLY. */
const FAKE_TEST_KEY = 'sk' + '_test_FAKE61keyDoNotUse0093';

/** A deterministic fake crypto seam (TIER 1's webhook self-check) — the
 * digest is a pure function of the FULL key and the FULL message. */
const FAKE_CRYPTO: PaystackWebhookCrypto = {
  hmacSha512Hex(key: string, message: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < message.length; i += 1) {
      h1 = (h1 ^ message.charCodeAt(i)) * 0x01000193;
      h2 = (h2 + message.charCodeAt(i) * key.charCodeAt(i % key.length)) * 0x01000193;
    }
    return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
  },
  timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (a.charCodeAt(i) !== b.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  },
};

describe('TIER 1 — the scripted c1 harness journeys (credential-free, never real evidence)', () => {
  it('G1 + G2: the read-only probe and the recipient list read-back through the real transport', async () => {
    const fetch = new FakePaystackFetch({
      'https://api.paystack.co/transaction': () => ({
        status: 200,
        body: { status: true, message: 'ok', data: [{ id: 12345, status: 'success' }] },
      }),
      'https://api.paystack.co/transferrecipient': () => ({
        status: 200,
        body: { status: true, message: 'ok', data: [{ recipient_code: 'RCP_scripted1', type: 'nuban' }] },
      }),
    });
    const transport = transportOf(fetch);
    const probe = createPaystackVerificationProbe(deps(transport));
    const recipientPlane = createPaystackRecipientExecution(deps(transport));
    const material = { apiKey: FAKE_TEST_KEY };
    const probed = await probe(material);
    const listed = await recipientPlane.list(material);
    expect(probed.outcome).toBe('CONFIRMED');
    expect(probed.providerReferences).toEqual(['txn_12345']);
    expect(listed.outcome).toBe('CONFIRMED');
    expect(listed.observedCount).toBe(1);
    expect(listed.recipientCode).toBe('RCP_scripted1');
    expect(fetch.seen[0]?.url).toBe('https://api.paystack.co/transaction');
    expect(fetch.seen[1]?.url).toBe('https://api.paystack.co/transferrecipient');
  });

  it("G3: the K3/K4 gate — the shipped registry is EMPTY and the typed request builder refuses every recipient create", () => {
    let refused = false;
    let refusal = '';
    try {
      buildPaystackTransferRecipientRequest({
        recipientType: 'kepss',
        name: 'never-dispatched',
        country: 'KE',
        currency: 'KES',
      });
    } catch (error) {
      refused = true;
      refusal = String(error);
    }
    expect(refused).toBe(true);
    expect(refusal).toContain('UNVERIFIED');
    expect(refusal).toContain('K3/K4');
    expect(refusal).toContain("dated-evidence registry");
  });

  it('G4: the collection journey — initialize answers the hosted page; the verify read-back carries the provider truth', async () => {
    const reference = 'p27c_t1_collection_0001';
    const fetch = new FakePaystackFetch({
      [`https://api.paystack.co/transaction/initialize`]: () => ({
        status: 200,
        body: {
          status: true,
          message: 'Authorization URL created',
          data: {
            authorization_url: 'https://checkout.paystack.co/fixture-page',
            access_code: 'AC_scripted',
            reference,
          },
        },
      }),
      [`https://api.paystack.co/transaction/verify/${reference}`]: () => ({
        status: 200,
        body: { status: true, message: 'ok', data: { reference, status: 'abandoned' } },
      }),
    });
    const transport = transportOf(fetch);
    const collection = createPaystackCollectionExecution(deps(transport));
    const material = { apiKey: FAKE_TEST_KEY };
    const initialized = await collection.initializeTransaction(material, {
      purposeClass: 'GENUINE_COMMERCE',
      email: 'customer@example.test',
      amountMinorUnits: '50000',
      currency: 'kes',
      reference,
    });
    expect(initialized.outcome).toBe('CONFIRMED');
    expect(initialized.authorizationUrl).toBe('https://checkout.paystack.co/fixture-page');
    // HONEST SEMANTICS: a CONFIRMED initialize is a payment REQUEST.
    expect(initialized.confirmedPaid).toBe(false);
    const readBack = await collection.verifyTransaction(material, reference);
    expect(readBack.outcome).toBe('CONFIRMED');
    expect(readBack.transactionStatus).toBe('abandoned');
    expect(readBack.confirmedPaid).toBe(false);
    expect(fetch.seen[0]?.body).toBe(
      JSON.stringify({ email: 'customer@example.test', amount: '50000', currency: 'kes', reference }),
    );
  });

  it("G5: the payout reconcile read-back's typed states (only the provider's success is final)", async () => {
    const fetch = new FakePaystackFetch({
      'https://api.paystack.co/transfer/TRF_pending': () => ({
        status: 200,
        body: { status: true, message: 'ok', data: { transfer_code: 'TRF_pending', reference: 'ref_pending', status: 'pending' } },
      }),
      'https://api.paystack.co/transfer/TRF_done': () => ({
        status: 200,
        body: { status: true, message: 'ok', data: { transfer_code: 'TRF_done', reference: 'ref_done', status: 'success' } },
      }),
    });
    const transport = transportOf(fetch);
    const lane = createPaystackTransferProductLane(deps(transport));
    const material = { apiKey: FAKE_TEST_KEY };
    const pending = await lane.reconcile(material, 'TRF_pending');
    expect(pending.kind).toBe('INITIATED_PENDING_FINALIZE');
    if (pending.kind === 'INITIATED_PENDING_FINALIZE') {
      expect(pending.rawStatus).toBe('pending');
    }
    const done = await lane.reconcile(material, 'TRF_done');
    expect(done.kind).toBe('CONFIRMED_FINAL');
  });

  it('G6: the webhook signature self-check — verify, replay refusal, tamper refusal', () => {
    const secret = 'whsec_scripted_tier1_only';
    const module_ = createPaystackWebhookVerificationModule({
      webhookSecret: secret,
      crypto: FAKE_CRYPTO,
      consumedStore: createInMemoryPaystackWebhookConsumedStore(),
    });
    const body = JSON.stringify({
      event: 'charge.success',
      data: { reference: 'p27c_t1_selfcheck', status: 'success', amount: 50000, currency: 'KES' },
    });
    const signature = FAKE_CRYPTO.hmacSha512Hex(secret, body);
    const verified = module_({ signatureHeader: signature, body });
    expect(verified.kind).toBe('VERIFIED');
    if (verified.kind === 'VERIFIED') {
      expect(verified.event.eventName).toBe('charge.success');
      expect(verified.event.reference).toBe('p27c_t1_selfcheck');
    }
    const replay = module_({ signatureHeader: signature, body });
    expect(replay.kind === 'REFUSED' && replay.refusal.kind).toBe('EVENT_ALREADY_CONSUMED');
    const tampered = module_({
      signatureHeader: signature,
      body: JSON.stringify({ event: 'charge.success', data: { reference: 'other', status: 'success' } }),
    });
    expect(tampered.kind === 'REFUSED' && tampered.refusal.kind).toBe('SIGNATURE_INVALID');
  });

  it('G7: the INV-30 purpose gate refuses remittance and unclassified purposes before any dispatch', async () => {
    const fetch = new FakePaystackFetch({});
    const transport = transportOf(fetch);
    const lane = createPaystackTransferProductLane(deps(transport));
    const collection = createPaystackCollectionExecution(deps(transport));
    const material = { apiKey: FAKE_TEST_KEY };
    await expect(
      lane.runPayout(material, {
        purposeClass: 'REGULATED_REMITTANCE_P2P',
        amountMinorUnits: '1000',
        currency: 'kes',
        recipient: 'RCP_never_reached',
      }),
    ).rejects.toThrow(/INV-30[\s\S]*regulated remittance/);
    await expect(
      collection.initializeTransaction(material, {
        purposeClass: 'UNCLASSIFIED',
        email: 'customer@example.test',
        amountMinorUnits: '1000',
        currency: 'kes',
        reference: 'p27c_t1_never_dispatched',
      }),
    ).rejects.toThrow(/INV-30/);
    // Neither refusal dispatched anything (the fake saw no calls).
    expect(fetch.seen.length).toBe(0);
  });
});

describe.skipIf(realSandboxKey === undefined || realSandboxKey.length === 0)(
  'TIER 2 — the REAL Paystack Sandbox journeys (operator-gated; PAYSTACK_SECRET_KEY supplied)',
  () => {
    const transport = new PaystackHttpsTransport({ fetchImpl: realFetchBinding });
    const material = { apiKey: realSandboxKey as string };
    const probe = createPaystackVerificationProbe({
      transport,
      clock: new SystemRuntimeClock(),
      executionMode: 'SANDBOX',
    });

    it(
      writesEnabled ? 'the read-only probe reads the real transaction list' : 'the read-only probe reads the real transaction list (writes NOT enabled)',
      async () => {
        const result = await probe(material);
        expect(['CONFIRMED', 'UNKNOWN', 'FAILED']).toContain(result.outcome);
        if (result.outcome === 'FAILED' && result.failure?.keyRejected) {
          throw new Error(`the provider rejected the supplied key — ${result.failure.code}`);
        }
        expect(result.outcome).toBe('CONFIRMED');
      },
    );
  },
);

/** The tier marker is importable and honest (SCRIPTED_FAKE_ONLY when ungated). */
describe('the harness tier marker (the honest record)', () => {
  it('records the scripted tier as OPERATOR_GATED when no credential is supplied', () => {
    const tier =
      realSandboxKey === undefined || realSandboxKey.length === 0
        ? 'SCRIPTED_FAKE_ONLY__OPERATOR_GATED'
        : 'REAL_SANDBOX';
    expect(PAYSTACK_AFRICA_HARNESS_TIER).toBe(tier);
  });
});
