import { describe, expect, it } from 'vitest';
import { DeterministicClock } from '../../src/clock.ts';
import { deliveredResponse, providerErrorResponse, undeliveredResponse } from '../../src/transport.ts';
import type { ProviderTransport } from '../../src/transport.ts';
import { createStripeVerificationProbe } from '../../src/adapters/stripe/verification-probe.ts';
import { stripeUseCaseScope } from '../../src/adapters/stripe/capabilities.ts';
import { scopeAdmits } from '../../src/connection-scope.ts';
import { assertNoSecretMaterial } from '../../src/redaction.ts';
import { ValidationError } from '../../src/errors.ts';

/**
 * The Stripe read-only verification probe battery (P13-B, ADR-0007 D1/D5).
 *
 * THE NEVER-ACTIVE LAW under test: this probe is the ONLY evidence path to
 * a connection ACTIVE state. Every test asserts the honest outcome
 * vocabulary (CONFIRMED / UNKNOWN / FAILED) and — on every path — that NO
 * key material appears anywhere in the probe result (a leak THROWS inside
 * the probe; the battery also re-scans independently).
 *
 * The transport is the package's scripted FAKE (clearly labeled: no
 * network is touched). The probe code under test is the production
 * consumer that runs INSIDE broker.withMaterial.
 */

/** Fake restricted key (test material ONLY, constructed to avoid a contiguous secret literal). */
const FAKE_KEY = 'rk' + '_test_FAKE51keyDoNotUse0001';

/** A scripted fake transport for the probe (FAKE_DETERMINISTIC — SANDBOX-compatible). */
class ProbeScriptTransport implements ProviderTransport {
  readonly transportClass = 'FAKE_DETERMINISTIC' as const;
  readonly transportId = 'fake-stripe-probe';
  readonly calls: { operationId: string; authorization: string }[] = [];
  #script: (operationId: string, call: { headers: Record<string, string> }) => ReturnType<ProviderTransport['send']>;

  constructor(
    script: (
      operationId: string,
      call: { headers: Record<string, string> },
    ) => ReturnType<ProviderTransport['send']>,
  ) {
    this.#script = script;
  }

  send(call: Parameters<ProviderTransport['send']>[0]): ReturnType<ProviderTransport['send']> {
    this.calls.push({
      operationId: call.operationId,
      authorization: call.headers.Authorization ?? '',
    });
    return this.#script(call.operationId, call);
  }
}

function probeDeps(transport: ProviderTransport, startMs = 1_000n) {
  return {
    transport,
    clock: new DeterministicClock(startMs),
    executionMode: 'SANDBOX' as const,
  };
}

describe('the CONFIRMED path (the only evidence that can carry a connection to ACTIVE)', () => {
  it('requires BOTH /v1/balance and /v1/account to confirm, in order', async () => {
    const transport = new ProbeScriptTransport((operationId) => {
      if (operationId === 'stripe.balance.read') {
        return Promise.resolve(deliveredResponse(200, { object: 'balance', livemode: false }));
      }
      return Promise.resolve(
        deliveredResponse(200, { id: 'acct_FAKE0001test', object: 'account', livemode: false }),
      );
    });
    const probe = createStripeVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_KEY });
    expect(result.outcome).toBe('CONFIRMED');
    expect(result.accountRef).toBe('acct_FAKE0001test');
    expect(result.providerLiveMode).toBe(false);
    expect(result.providerReferences).toEqual(['acct_FAKE0001test', 'balance']);
    expect(transport.calls.map((c) => c.operationId)).toEqual([
      'stripe.balance.read',
      'stripe.account.read',
    ]);
  });

  it('binds the sealed key as a Bearer header on every dispatch (inside the seal)', async () => {
    const transport = new ProbeScriptTransport(() =>
      Promise.resolve(deliveredResponse(200, { id: 'acct_FAKE0001test', livemode: false })),
    );
    const probe = createStripeVerificationProbe(probeDeps(transport));
    await probe({ apiKey: FAKE_KEY });
    expect(transport.calls).toHaveLength(2);
    for (const call of transport.calls) {
      expect(call.authorization).toBe(`Bearer ${FAKE_KEY}`);
    }
  });

  it('carries the execution mode, transport class and dispatch/complete timestamps', async () => {
    const transport = new ProbeScriptTransport(() =>
      Promise.resolve(deliveredResponse(200, { id: 'acct_FAKE0001test', livemode: false })),
    );
    const deps = probeDeps(transport);
    const probe = createStripeVerificationProbe(deps);
    const result = await probe({ apiKey: FAKE_KEY });
    expect(result.executionMode).toBe('SANDBOX');
    expect(result.transportClass).toBe('FAKE_DETERMINISTIC');
    expect(result.dispatchedAt).toBe(1_000n);
    expect(result.completedAt).toBe(1_000n);
  });

  it('CONFIRMED evidence still grants ONLY the read-only scope (the write classes stay refused)', async () => {
    const transport = new ProbeScriptTransport(() =>
      Promise.resolve(deliveredResponse(200, { id: 'acct_FAKE0001test', livemode: false })),
    );
    const probe = createStripeVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_KEY });
    expect(result.outcome).toBe('CONFIRMED');
    const scope = stripeUseCaseScope({ apiKey: FAKE_KEY }, 'SANDBOX');
    expect(
      scopeAdmits(scope, { operationClass: 'CREATE_EXTERNAL_EFFECT', effectClass: 'STATE_CHANGING' }, 2_000n)
        .kind,
    ).toBe('REFUSED');
  });
});

describe('the FAILED path (definitive provider answers)', () => {
  it('a 401 marks the key rejected and NEVER echoes the provider text (Stripe error text can carry key fragments)', async () => {
    // Contract-shaped scripting: the REAL https-transport parses Stripe's
    // {error:{code,message}} envelope into providerErrorCode/Message — the
    // fake scripts the PARSED response, exactly what the real transport
    // would emit for this Stripe body (envelope parsing itself is covered
    // by the transport battery).
    const transport = new ProbeScriptTransport(() =>
      Promise.resolve(
        providerErrorResponse(
          401,
          'invalid_api_key',
          `Invalid API Key provided: ${FAKE_KEY}`,
        ),
      ),
    );
    const probe = createStripeVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_KEY });
    expect(result.outcome).toBe('FAILED');
    expect(result.failure?.keyRejected).toBe(true);
    expect(result.failure?.retryable).toBe(false);
    expect(result.failure?.code).toBe('invalid_api_key');
    expect(result.failure?.message).not.toContain(FAKE_KEY);
    expect(result.failure?.message).toContain('rejected');
  });

  it('a provider code naming the key marks keyRejected even on other statuses', async () => {
    const transport = new ProbeScriptTransport(() =>
      Promise.resolve(providerErrorResponse(403, 'api_key_expired', 'key expired')),
    );
    const probe = createStripeVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_KEY });
    expect(result.outcome).toBe('FAILED');
    expect(result.failure?.keyRejected).toBe(true);
  });

  it('a non-key 4xx is FAILED with the provider message surfaced', async () => {
    const transport = new ProbeScriptTransport(() =>
      Promise.resolve(providerErrorResponse(403, 'account_locked', 'locked')),
    );
    const probe = createStripeVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_KEY });
    expect(result.outcome).toBe('FAILED');
    expect(result.failure?.keyRejected).toBe(false);
    expect(result.failure?.message).toBe('locked');
  });

  it('a 5xx is FAILED and retryable (the provider answered; transient)', async () => {
    const transport = new ProbeScriptTransport(() =>
      Promise.resolve(providerErrorResponse(503, 'server_error', 'overloaded')),
    );
    const probe = createStripeVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_KEY });
    expect(result.outcome).toBe('FAILED');
    expect(result.failure?.retryable).toBe(true);
    expect(result.ambiguityReason).toBeUndefined();
  });

  it('INV-25: a provider-reported livemode mismatch with the runtime mode is FAILED', async () => {
    const transport = new ProbeScriptTransport((operationId) => {
      if (operationId === 'stripe.balance.read') {
        return Promise.resolve(deliveredResponse(200, { object: 'balance', livemode: true }));
      }
      return Promise.resolve(
        deliveredResponse(200, { id: 'acct_FAKE0001test', livemode: true }),
      );
    });
    const probe = createStripeVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_KEY });
    expect(result.outcome).toBe('FAILED');
    expect(result.failure?.code).toBe('STRIPE_LIVE_MODE_MISMATCH');
    expect(result.failure?.keyRejected).toBe(false);
  });
});

describe('the UNKNOWN path (INV-04 — never collapsed into FAILED)', () => {
  it('a timeout after dispatch is UNKNOWN with the canonical ambiguity reason', async () => {
    const transport = new ProbeScriptTransport(() =>
      Promise.resolve(undeliveredResponse('TIMEOUT_AFTER_DISPATCH', 'timed out')),
    );
    const probe = createStripeVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_KEY });
    expect(result.outcome).toBe('UNKNOWN');
    expect(result.ambiguityReason).toBe('TRANSPORT_TIMEOUT_AFTER_DISPATCH');
    expect(result.failure).toBeUndefined();
  });

  it('a connection lost after dispatch is UNKNOWN', async () => {
    const transport = new ProbeScriptTransport(() =>
      Promise.resolve(undeliveredResponse('CONNECTION_LOST_AFTER_DISPATCH')),
    );
    const probe = createStripeVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_KEY });
    expect(result.outcome).toBe('UNKNOWN');
    expect(result.ambiguityReason).toBe('TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH');
  });

  it('a 2xx without an account id is UNKNOWN (uninterpretable evidence is never a fabricated CONFIRMED)', async () => {
    const transport = new ProbeScriptTransport((operationId) => {
      if (operationId === 'stripe.balance.read') {
        return Promise.resolve(deliveredResponse(200, { object: 'balance' }));
      }
      return Promise.resolve(deliveredResponse(200, { object: 'account' }));
    });
    const probe = createStripeVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_KEY });
    expect(result.outcome).toBe('UNKNOWN');
    expect(result.ambiguityReason).toBe('MALFORMED_RESPONSE_AFTER_DISPATCH');
  });

  it('the first step failing UNKNOWN short-circuits (the account read never dispatches)', async () => {
    const transport = new ProbeScriptTransport(() =>
      Promise.resolve(undeliveredResponse('MALFORMED_RESPONSE')),
    );
    const probe = createStripeVerificationProbe(probeDeps(transport));
    const result = await probe({ apiKey: FAKE_KEY });
    expect(result.outcome).toBe('UNKNOWN');
    expect(transport.calls).toHaveLength(1);
  });
});

describe('the seal discipline (INV-19 — the probe result never carries key material)', () => {
  it('the probe REFUSES malformed material before any dispatch', async () => {
    const transport = new ProbeScriptTransport(() => Promise.resolve(deliveredResponse(200, {})));
    const probe = createStripeVerificationProbe(probeDeps(transport));
    await expect(probe({ apiKey: 'not-a-key' })).rejects.toThrow(ValidationError);
    await expect(probe(null)).rejects.toThrow(ValidationError);
    expect(transport.calls).toHaveLength(0);
  });

  it('the probe REFUSES a mode-mismatched key (INV-25 binding law, pre-dispatch)', async () => {
    const transport = new ProbeScriptTransport(() => Promise.resolve(deliveredResponse(200, {})));
    const probe = createStripeVerificationProbe(probeDeps(transport));
    const fakeLiveKey = 'rk' + '_live_FAKE51keyDoNotUse0001';
    await expect(probe({ apiKey: fakeLiveKey })).rejects.toThrow();
    expect(transport.calls).toHaveLength(0);
  });

  it('CONFIRMED/UNKNOWN/FAILED results are all independently re-scanned: zero key material', async () => {
    const outcomes: ('CONFIRMED' | 'UNKNOWN' | 'FAILED')[] = ['CONFIRMED', 'UNKNOWN', 'FAILED'];
    for (const outcome of outcomes) {
      const transport = new ProbeScriptTransport(() => {
        if (outcome === 'CONFIRMED') {
          return Promise.resolve(
            deliveredResponse(200, { id: 'acct_FAKE0001test', livemode: false }),
          );
        }
        if (outcome === 'UNKNOWN') {
          return Promise.resolve(undeliveredResponse('TIMEOUT_AFTER_DISPATCH'));
        }
        return Promise.resolve(
          providerErrorResponse(401, 'invalid_api_key', `bad key ${FAKE_KEY}`),
        );
      });
      const probe = createStripeVerificationProbe(probeDeps(transport));
      const result = await probe({ apiKey: FAKE_KEY });
      expect(result.outcome).toBe(outcome);
      expect(() => assertNoSecretMaterial(result, [FAKE_KEY], 'battery re-scan')).not.toThrow();
      // BigInt-aware serialization (the timestamps are bigint by contract).
      expect(JSON.stringify(result, (_, value) => (typeof value === 'bigint' ? String(value) : value))).not.toContain(
        FAKE_KEY,
      );
    }
  });
});
