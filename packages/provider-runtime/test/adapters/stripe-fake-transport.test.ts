/**
 * @payswap/provider-runtime — the DETERMINISTIC FAKE STRIPE FETCH (P24-1).
 *
 * The fake-transport.ts pattern (the P2-W2 battery) extended to the
 * catalogue transport's fetch seam: a scripted, in-memory fetch that
 * touches NO network, NO filesystem and NO process boundaries. Every
 * "provider answer" is a caller-scripted value (INV-24 — no fabricated
 * provider behavior); an unscripted call REFUSES before dispatch.
 *
 * ISOLATION PROOF SURFACE (INV-19, same law as test/fake-transport.ts):
 * the fake records each call's URL, method, SERIALIZED body, header NAMES
 * only — plus the two non-credential header values tests must assert
 * (Stripe-Version is public metadata; Idempotency-Key is a registrar-minted
 * dedup reference, never a secret). The Authorization header VALUE is
 * NEVER recorded anywhere: the fake demonstrates by construction that the
 * transport edge can use secrets without any artifact retaining them.
 *
 * This file is BOTH a test (the fake's own battery — determinism, script
 * exhaustion, secret-free recording) and the shared fixture the other
 * stripe-*.test.ts batteries import.
 */

import { describe, expect, it } from 'vitest';
import type {
  StripeCatalogueFetch,
  StripeCatalogueFetchResponse,
} from '../../src/adapters/stripe/transport/catalogue-transport.ts';

/** One scripted outcome for the next fetch(). */
export type FakeStripeStep =
  | {
      readonly kind: 'OK';
      readonly status: number;
      readonly body: unknown;
      readonly requestId?: string;
      readonly extraHeaders?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'HTTP_ERROR';
      readonly status: number;
      readonly body: unknown;
      readonly requestId?: string;
      readonly retryAfterSeconds?: number;
    }
  | { readonly kind: 'TIMEOUT' }
  | { readonly kind: 'CONNECTION_LOST' }
  | { readonly kind: 'MALFORMED'; readonly status: number; readonly text: string };

/** The recorded (secret-free) view of one fetch call. */
export interface FakeStripeCall {
  readonly url: string;
  readonly method: 'GET' | 'POST' | 'DELETE';
  /** Header NAMES only — header VALUES are never recorded (INV-19). */
  readonly headerNames: readonly string[];
  /** The serialized wire body (validated params only — never credentials);
   *  P25: multipart operations dispatch binary bodies (the file upload). */
  readonly body: string | Uint8Array | undefined;
  /** The Stripe-Version header value (public metadata, not a secret). */
  readonly stripeVersion: string | null;
  /** The Idempotency-Key header value (registrar-minted dedup ref, not a secret). */
  readonly idempotencyKey: string | null;
  /** The Stripe-Account header value when a host-verified context set one. */
  readonly stripeAccount: string | null;
}

/** The deterministic fake fetch for the catalogue transport. */
export class FakeStripeFetch {
  readonly #script: FakeStripeStep[] = [];
  readonly #calls: FakeStripeCall[] = [];
  /** Stripe's documented Idempotency-Key replay: same key → stored response. */
  readonly #replayedResponses = new Map<string, { status: number; body: unknown }>();
  #replayMode = false;

  /** Queue the next outcomes (in order). */
  script(...steps: readonly FakeStripeStep[]): this {
    this.#script.push(...steps);
    return this;
  }

  /** Enable the Idempotency-Key replay ledger (Stripe's v1 semantics). */
  withIdempotentReplay(): this {
    this.#replayMode = true;
    return this;
  }

  /** The fetch binding to hand to the transport. */
  readonly fetch: StripeCatalogueFetch = async (url, init): Promise<StripeCatalogueFetchResponse> => {
    const headers = init.headers as Readonly<Record<string, string>>;
    const idempotencyKey = readHeader(headers, 'idempotency-key');
    if (this.#replayMode && idempotencyKey !== null && this.#replayedResponses.has(idempotencyKey)) {
      const stored = this.#replayedResponses.get(idempotencyKey)!;
      this.#calls.push(recordCall(url, init));
      return jsonResponse(stored.status, stored.body, null);
    }
    const step = this.#script.shift();
    this.#calls.push(recordCall(url, init));
    if (step === undefined) {
      // Fail-closed default: an unscripted call never gets an invented answer.
      throw new UnscriptedFetchError(`fake stripe fetch: no scripted outcome for ${url}`);
    }
    switch (step.kind) {
      case 'OK': {
        if (this.#replayMode && idempotencyKey !== null && step.status >= 200 && step.status < 300) {
          this.#replayedResponses.set(idempotencyKey, { status: step.status, body: step.body });
        }
        const headersOut: Record<string, string> = {};
        if (step.requestId !== undefined) headersOut['request-id'] = step.requestId;
        for (const [key, value] of Object.entries(step.extraHeaders ?? {})) {
          headersOut[key] = value;
        }
        return { status: step.status, headers: headersOut, text: async () => JSON.stringify(step.body) };
      }
      case 'HTTP_ERROR': {
        const headersOut: Record<string, string> = {};
        if (step.requestId !== undefined) headersOut['request-id'] = step.requestId;
        if (step.retryAfterSeconds !== undefined) headersOut['retry-after'] = String(step.retryAfterSeconds);
        return { status: step.status, headers: headersOut, text: async () => JSON.stringify(step.body) };
      }
      case 'TIMEOUT': {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      }
      case 'CONNECTION_LOST': {
        throw new Error('ECONNRESET (fake)');
      }
      case 'MALFORMED': {
        return { status: step.status, text: async () => step.text };
      }
    }
  };

  /** The recorded calls (secret-free views). */
  calls(): readonly FakeStripeCall[] {
    return [...this.#calls];
  }

  get callCount(): number {
    return this.#calls.length;
  }
}

/** Raised when the wire was touched without a scripted outcome (fail-closed). */
export class UnscriptedFetchError extends Error {}

function recordCall(url: string, init: Parameters<StripeCatalogueFetch>[1]): FakeStripeCall {
  const headers = init.headers as Readonly<Record<string, string>>;
  return Object.freeze({
    url,
    method: init.method,
    headerNames: Object.freeze(Object.keys(headers).sort()),
    body: init.body,
    stripeVersion: readHeader(headers, 'stripe-version'),
    idempotencyKey: readHeader(headers, 'idempotency-key'),
    stripeAccount: readHeader(headers, 'stripe-account'),
  });
}

function readHeader(headers: Readonly<Record<string, string>>, lowerName: string): string | null {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lowerName) {
      const value = headers[key];
      return typeof value === 'string' && value.length > 0 ? value : null;
    }
  }
  return null;
}

function jsonResponse(status: number, body: unknown, requestId: string | null): StripeCatalogueFetchResponse {
  return {
    status,
    ...(requestId !== null ? { headers: { 'request-id': requestId } } : {}),
    text: async () => JSON.stringify(body),
  };
}

/** A fake test-mode bearer for call contexts (test material ONLY — FAKE-marked). */
export const FAKE_TEST_BEARER = `Bearer ${['sk', 'test', 'FAKE51key' + 'DoNotUse0001'].join('_')}`;

/** A fake per-call context bound to the catalogue-coherent version. */
export function fakeCallContext(overrides: { apiVersion?: string; stripeAccount?: string } = {}): {
  apiVersion: string;
  authorizationHeader: string;
  stripeAccount?: string;
} {
  const context: { apiVersion: string; authorizationHeader: string; stripeAccount?: string } = {
    apiVersion: overrides.apiVersion ?? '2026-09-30.endive',
    authorizationHeader: FAKE_TEST_BEARER,
  };
  if (overrides.stripeAccount !== undefined) {
    context.stripeAccount = overrides.stripeAccount;
  }
  return context;
}

describe('the deterministic fake stripe fetch (its own battery)', () => {
  it('records calls with header NAMES only — the Authorization VALUE never appears', async () => {
    const fake = new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { ok: true } });
    await fake.fetch('https://api.stripe.com/v1/account', {
      method: 'GET',
      headers: { Authorization: FAKE_TEST_BEARER, 'Stripe-Version': '2026-09-30.endive' },
    });
    const call = fake.calls()[0]!;
    expect(call.headerNames).toEqual(['Authorization', 'Stripe-Version']);
    expect(JSON.stringify(fake.calls())).not.toContain(FAKE_TEST_BEARER);
    expect(JSON.stringify(fake.calls())).not.toContain('sk_test_');
  });

  it('plays the script in order and refuses unscripted calls (no invented answers)', async () => {
    const fake = new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { a: 1 } });
    const first = await fake.fetch('https://api.stripe.com/v1/balance', {
      method: 'GET',
      headers: {},
    });
    expect(await first.text()).toBe('{"a":1}');
    await expect(
      fake.fetch('https://api.stripe.com/v1/balance', { method: 'GET', headers: {} }),
    ).rejects.toBeInstanceOf(UnscriptedFetchError);
    expect(fake.callCount).toBe(2);
  });

  it('replays the stored response for a repeated Idempotency-Key (v1 semantics)', async () => {
    const fake = new FakeStripeFetch().withIdempotentReplay().script(
      { kind: 'OK', status: 200, body: { id: 'cus_FAKE1', object: 'customer' } },
      { kind: 'OK', status: 200, body: { id: 'cus_FAKE2', object: 'customer' } },
    );
    const headers = { Authorization: FAKE_TEST_BEARER, 'Idempotency-Key': 'registrar-key-1' };
    const first = await fake.fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers,
    });
    const replay = await fake.fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers,
    });
    expect(await first.text()).toBe(await replay.text());
    expect(fake.calls()[1]?.idempotencyKey).toBe('registrar-key-1');
  });
});
