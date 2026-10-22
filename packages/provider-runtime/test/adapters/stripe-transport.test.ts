import { describe, expect, it } from 'vitest';
import {
  StripeHttpsTransport,
  type StripeFetch,
  type StripeFetchResponse,
} from '../../src/adapters/stripe/https-transport.ts';
import type { ProviderTransportCall } from '../../src/transport.ts';
import { validateTransportResponse } from '../../src/transport.ts';
import { ValidationError } from '../../src/errors.ts';

/**
 * The REAL Stripe HTTPS transport battery (P13-B, ADR-0007 D1/D5).
 *
 * THE BATTERY NEVER TOUCHES THE NETWORK: the fetch binding is a
 * deterministic fake (clearly labeled). The transport under test is the
 * production code path — endpoint mapping, fail-closed refusal of unknown
 * operations, the INV-04 failure positions, and the header discipline.
 */

/** The fake key used in Authorization headers (test material ONLY). */
const FAKE_BEARER = 'Bearer rk' + '_test_FAKE51keyDoNotUse0001';

function textResponse(status: number, body: string): StripeFetchResponse {
  return {
    status,
    text: async () => body,
  };
}

function json(status: number, value: unknown): StripeFetchResponse {
  return textResponse(status, JSON.stringify(value));
}

/** A recording fake fetch: captures method/headers/url, returns scripted responses per URL path. */
function recordingFetch(
  script: (url: string) => StripeFetchResponse | Error,
): { fetch: StripeFetch; calls: { url: string; method: string; headers: Record<string, string> }[] } {
  const calls: { url: string; method: string; headers: Record<string, string> }[] = [];
  const fetch: StripeFetch = async (url, init) => {
    calls.push({ url, method: init.method, headers: { ...init.headers } });
    const step = script(url);
    if (step instanceof Error) {
      throw step;
    }
    return step;
  };
  return { fetch, calls };
}

function call(operationId: string, extra: Partial<ProviderTransportCall> = {}): ProviderTransportCall {
  return {
    operationId,
    idempotencyKey: 'idem-1',
    params: {},
    headers: { Authorization: FAKE_BEARER },
    correlationId: 'corr-1',
    ...extra,
  };
}

describe('the Stripe HTTPS transport (endpoint mapping + fail-closed)', () => {
  it('maps the two read operations to the real GET endpoints on api.stripe.com', async () => {
    const { fetch, calls } = recordingFetch(() => json(200, { object: 'balance' }));
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    const balance = await transport.send(call('stripe.balance.read'));
    expect(balance.delivered).toBe(true);
    expect(balance.status).toBe(200);
    expect(calls[0]?.url).toBe('https://api.stripe.com/v1/balance');
    expect(calls[0]?.method).toBe('GET');
    const account = await transport.send(call('stripe.account.read'));
    expect(account.delivered).toBe(true);
    expect(calls[1]?.url).toBe('https://api.stripe.com/v1/account');
  });

  it('sends the pinned Stripe-Version header and the caller Authorization header verbatim', async () => {
    const { fetch, calls } = recordingFetch(() => json(200, {}));
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    await transport.send(call('stripe.balance.read'));
    expect(calls[0]?.headers['Stripe-Version']).toBe('2025-08-27.basil');
    expect(calls[0]?.headers.Authorization).toBe(FAKE_BEARER);
  });

  it('serializes GET params into the query string and skips empty params', async () => {
    const { fetch, calls } = recordingFetch(() => json(200, {}));
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    await transport.send(call('stripe.balance.read', { params: { 'expand[]': 'data.balance' } }));
    expect(calls[0]?.url).toBe('https://api.stripe.com/v1/balance?expand%5B%5D=data.balance');
    await transport.send(call('stripe.balance.read', { params: {} }));
    expect(calls[1]?.url).toBe('https://api.stripe.com/v1/balance');
  });

  it('REFUSES unknown operations BEFORE dispatch (fail-closed: nothing reaches the wire)', async () => {
    const { fetch, calls } = recordingFetch(() => json(200, {}));
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    const response = await transport.send(call('stripe.charges.create'));
    expect(response.delivered).toBe(false);
    expect(response.failure?.kind).toBe('REFUSED_BEFORE_DISPATCH');
    expect(calls).toHaveLength(0);
  });

  it('requires an injected fetch binding (no ambient fetch, no SDK)', () => {
    expect(() => new StripeHttpsTransport({ fetchImpl: undefined as unknown as StripeFetch })).toThrow(
      ValidationError,
    );
    expect(() => new StripeHttpsTransport({ fetchImpl: (() => {}) as unknown as StripeFetch })).not.toThrow();
  });
});

describe('the INV-04 failure positions (UNKNOWN is never FAILED)', () => {
  it('a timeout after dispatch is TIMEOUT_AFTER_DISPATCH (the request may have landed)', async () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    const { fetch } = recordingFetch(() => abort);
    const transport = new StripeHttpsTransport({ fetchImpl: fetch, timeoutMs: 50 });
    const response = await transport.send(call('stripe.balance.read'));
    expect(response.delivered).toBe(false);
    expect(response.failure?.kind).toBe('TIMEOUT_AFTER_DISPATCH');
    validateTransportResponse(response);
  });

  it('a connection failure is CONNECTION_LOST_AFTER_DISPATCH (UNKNOWN, never FAILED)', async () => {
    const { fetch } = recordingFetch(() => new Error('ECONNRESET'));
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    const response = await transport.send(call('stripe.balance.read'));
    expect(response.delivered).toBe(false);
    expect(response.failure?.kind).toBe('CONNECTION_LOST_AFTER_DISPATCH');
  });

  it('a non-JSON body is MALFORMED_RESPONSE (bytes came back but cannot be interpreted)', async () => {
    const { fetch } = recordingFetch(() => textResponse(200, '<html>not json</html>'));
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    const response = await transport.send(call('stripe.balance.read'));
    expect(response.delivered).toBe(false);
    expect(response.failure?.kind).toBe('MALFORMED_RESPONSE');
  });

  it('a response without an integer status is MALFORMED_RESPONSE', async () => {
    const { fetch } = recordingFetch(() => ({ status: NaN, text: async () => '{}' }) as StripeFetchResponse);
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    const response = await transport.send(call('stripe.balance.read'));
    expect(response.delivered).toBe(false);
    expect(response.failure?.kind).toBe('MALFORMED_RESPONSE');
  });

  it('an unreadable body is MALFORMED_RESPONSE', async () => {
    const { fetch } = recordingFetch(() => ({
      status: 200,
      text: async () => {
        throw new Error('stream destroyed');
      },
    }));
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    const response = await transport.send(call('stripe.balance.read'));
    expect(response.delivered).toBe(false);
    expect(response.failure?.kind).toBe('MALFORMED_RESPONSE');
  });
});

describe('delivered responses (2xx vs provider error envelope)', () => {
  it('a 2xx JSON body is delivered losslessly', async () => {
    const body = { object: 'balance', available: [{ amount: 1000, currency: 'usd' }] };
    const { fetch } = recordingFetch(() => json(200, body));
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    const response = await transport.send(call('stripe.balance.read'));
    expect(response).toEqual({ delivered: true, status: 200, body });
  });

  it('an empty 2xx body is delivered as an empty object', async () => {
    const { fetch } = recordingFetch(() => textResponse(200, ''));
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    const response = await transport.send(call('stripe.balance.read'));
    expect(response.delivered).toBe(true);
    expect(response.body).toEqual({});
  });

  it("reads Stripe's canonical error envelope (code preferred, type fallback)", async () => {
    const { fetch } = recordingFetch(() =>
      json(401, { error: { type: 'invalid_request_error', code: 'invalid_api_key', message: 'Invalid API Key provided' } }),
    );
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    const response = await transport.send(call('stripe.balance.read'));
    expect(response.delivered).toBe(true);
    expect(response.status).toBe(401);
    expect(response.providerErrorCode).toBe('invalid_api_key');
    expect(response.providerErrorMessage).toBe('Invalid API Key provided');
  });

  it('falls back to the error type when no code is present, and to HTTP_<status> when no envelope', async () => {
    const { fetch } = recordingFetch((url) =>
      url.includes('balance')
        ? json(403, { error: { type: 'card_error' } })
        : json(429, { message: 'no envelope' }),
    );
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    const withType = await transport.send(call('stripe.balance.read'));
    expect(withType.providerErrorCode).toBe('card_error');
    const withoutEnvelope = await transport.send(call('stripe.account.read'));
    expect(withoutEnvelope.providerErrorCode).toBe('HTTP_429');
    expect(withoutEnvelope.providerErrorMessage).toBeUndefined();
  });
});

describe('transport construction options (composition edge)', () => {
  it('honors a custom base URL (trailing slashes stripped) and a custom API version', async () => {
    const { fetch, calls } = recordingFetch(() => json(200, {}));
    const transport = new StripeHttpsTransport({
      fetchImpl: fetch,
      baseUrl: 'https://fake-stripe.local/',
      apiVersion: '2099-01-01.test',
    });
    await transport.send(call('stripe.balance.read'));
    expect(calls[0]?.url).toBe('https://fake-stripe.local/v1/balance');
    expect(calls[0]?.headers['Stripe-Version']).toBe('2099-01-01.test');
  });

  it('refuses a non-positive-integer timeout', () => {
    const { fetch } = recordingFetch(() => json(200, {}));
    expect(
      () => new StripeHttpsTransport({ fetchImpl: fetch, timeoutMs: 0 }),
    ).toThrow(ValidationError);
    expect(
      () => new StripeHttpsTransport({ fetchImpl: fetch, timeoutMs: 1.5 }),
    ).toThrow(ValidationError);
  });

  it('declares the PRODUCTION_HTTP transport class with a stable transport id', () => {
    const { fetch } = recordingFetch(() => json(200, {}));
    const transport = new StripeHttpsTransport({ fetchImpl: fetch });
    expect(transport.transportClass).toBe('PRODUCTION_HTTP');
    expect(transport.transportId).toBe('stripe-https');
  });
});
