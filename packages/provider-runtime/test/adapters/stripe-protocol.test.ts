/**
 * @payswap/provider-runtime — the Stripe PROTOCOL battery (P24-1, ADR-0017 D6).
 *
 * The namespace-protocol layer, tested in isolation from dispatch (the
 * dispatch law chain lives in stripe-transports.test.ts):
 * - v1 form serialization: nested arrays/objects, metadata maps, the
 *   empty-vs-null law, deterministic key order;
 * - v2 JSON serialization: typed pass-through, canonical order, nulls omitted;
 * - v1 cursor pagination AND v2 page-token pagination (bounded budgets,
 *   honest truncation, the never-follow-URLs law, eventual-consistency
 *   recording);
 * - typed error classification: 401/403/404/409/429/5xx (handoff §13.3);
 * - the per-operation idempotency classification vocabulary;
 * - the call-context credential law: pk_ refused, live keys refused (INV-25),
 *   the API version supplied per call (never hardcoded).
 *
 * All assertions are pure (no fetch, no network, no fabricated provider
 * answers).
 */

import { describe, expect, it } from 'vitest';
import { stripeV1FormBody, stripeV1QueryString } from '../../src/adapters/stripe/transport/v1-form.ts';
import { stripeV2JsonBody } from '../../src/adapters/stripe/transport/v2-json.ts';
import {
  classifyStripeHttpError,
  readStripeErrorEnvelope,
} from '../../src/adapters/stripe/transport/errors.ts';
import {
  validateStripeCallContext,
  STRIPE_CATALOGUE_API_VERSION,
} from '../../src/adapters/stripe/transport/call-context.ts';
import {
  stripePaginateV1List,
  stripePaginateV2List,
  stripeV1ListPageOf,
  stripeV2ListPageOf,
  pageTokenOfNextPageUrl,
  STRIPE_PAGINATION_MAX_PAGES_CEILING,
} from '../../src/adapters/stripe/transport/pagination.ts';
import {
  stripeIdempotencyClassOf,
  stripeIdempotencyKeyAllowed,
  stripeAutomaticRetryAllowed,
} from '../../src/adapters/stripe/catalogue/idempotency-classification.ts';
import { ValidationError } from '../../src/errors.ts';

describe('the v1 form serializer', () => {
  it('encodes scalars, nested objects, metadata maps and indexed arrays', () => {
    const body = stripeV1FormBody({
      amount: 1500,
      currency: 'usd',
      metadata: { mission: 'm-1', command: 'cmd-9' },
      expand: ['data.customer', 'data.payment_method'],
      'automatic_payment_methods': { enabled: true, allow_redirects: 'never' },
    });
    expect(body).toBe(
      'amount=1500' +
        '&automatic_payment_methods%5Ballow_redirects%5D=never' +
        '&automatic_payment_methods%5Benabled%5D=true' +
        '&currency=usd' +
        '&expand%5B0%5D=data.customer' +
        '&expand%5B1%5D=data.payment_method' +
        '&metadata%5Bcommand%5D=cmd-9' +
        '&metadata%5Bmission%5D=m-1',
    );
  });

  it('the empty-vs-null law: "" is SENT (clears), null/undefined are OMITTED', () => {
    const body = stripeV1FormBody({ description: '', email: null, name: undefined, city: 'Lagos' });
    expect(body).toBe('city=Lagos&description=');
  });

  it('percent-encodes reserved characters with form encoding (space → +)', () => {
    expect(stripeV1FormBody({ description: 'a b&c=d' })).toBe('description=a+b%26c%3Dd');
  });

  it('refuses non-finite numbers', () => {
    expect(() => stripeV1FormBody({ amount: Number.POSITIVE_INFINITY })).toThrow(ValidationError);
  });

  it('the query string honors deepObject vs form styles', () => {
    const query = stripeV1QueryString(
      { created: { gte: 1700000000 }, email: 'a@b.c', expand: ['customer'] },
      { created: 'deepObject', email: 'form', expand: 'deepObject' },
    );
    expect(query).toBe('?created%5Bgte%5D=1700000000&email=a%40b.c&expand%5B0%5D=customer');
    const formArray = stripeV1QueryString({ types: ['a', 'b'] }, { types: 'form' });
    expect(formArray).toBe('?types=a&types=b');
  });
});

describe('the v2 JSON serializer', () => {
  it('passes typed values through with canonical (sorted) keys and omits nulls', () => {
    const body = stripeV2JsonBody({
      event_name: 'ai_searches_run',
      payload: { stripe_customer_id: 'cus_FAKE1', value: '25' },
      timestamp: null,
      identifier: 'idem-FAKE-1',
    });
    expect(body).toBe(
      '{"event_name":"ai_searches_run","identifier":"idem-FAKE-1","payload":{"stripe_customer_id":"cus_FAKE1","value":"25"}}',
    );
  });

  it('refuses non-finite numbers', () => {
    expect(() => stripeV2JsonBody({ x: Number.NaN })).toThrow(ValidationError);
  });
});

describe('the paginators (v1 cursor vs v2 page-token)', () => {
  it('walks v1 pages by starting_after until has_more is false', async () => {
    const pages = [
      { data: [{ id: 'cus_FAKE1' }, { id: 'cus_FAKE2' }], has_more: true },
      { data: [{ id: 'cus_FAKE3' }], has_more: false },
    ];
    const requested: Record<string, unknown>[] = [];
    const walk = await stripePaginateV1List(async (overrides) => {
      requested.push(overrides);
      return pages[requested.length - 1];
    });
    expect(walk.items).toHaveLength(3);
    expect(walk.pagesFetched).toBe(2);
    expect(walk.truncated).toBe(false);
    expect(walk.nextCursor).toBeNull();
    expect(requested[1]).toEqual({ starting_after: 'cus_FAKE2' });
  });

  it('surfaces honest truncation at the budget boundary', async () => {
    let calls = 0;
    const walk = await stripePaginateV1List(
      async () => {
        calls += 1;
        return { data: [{ id: `cus_FAKE${String(calls)}` }], has_more: true };
      },
      { maxPages: 3 },
    );
    expect(walk.pagesFetched).toBe(3);
    expect(walk.truncated).toBe(true);
    expect(walk.nextCursor).toBe('cus_FAKE3');
  });

  it('refuses unbounded or over-ceiling budgets', async () => {
    await expect(
      stripePaginateV1List(async () => ({ data: [], has_more: false }), { maxPages: 0 }),
    ).rejects.toThrow(ValidationError);
    await expect(
      stripePaginateV1List(async () => ({ data: [], has_more: false }), {
        maxPages: STRIPE_PAGINATION_MAX_PAGES_CEILING + 1,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('extracts the page token from a v2 next_page_url and NEVER follows the URL', () => {
    expect(pageTokenOfNextPageUrl('https://api.stripe.com/v2/core/events?page=eyJvIjoxfQ&page_size=10')).toBe(
      'eyJvIjoxfQ',
    );
    expect(() => pageTokenOfNextPageUrl('https://evil.example/v2/core/events?evil=1')).toThrow(ValidationError);
    expect(stripeV2ListPageOf({ data: [], next_page_url: null }).nextPageToken).toBeNull();
  });

  it('walks v2 pages by page token and records eventual consistency (ALWAYS true)', async () => {
    const pages = [
      { data: [{ id: 'evt_FAKE1' }], next_page_url: '/v2/core/events?page=tok-2' },
      { data: [{ id: 'evt_FAKE2' }], next_page_url: null },
    ];
    const requested: Record<string, unknown>[] = [];
    const walk = await stripePaginateV2List(async (overrides) => {
      requested.push(overrides);
      return pages[requested.length - 1];
    });
    expect(walk.items).toHaveLength(2);
    expect(walk.pagesFetched).toBe(2);
    expect(walk.truncated).toBe(false);
    expect(walk.eventualConsistency).toBe(true);
    expect(requested[1]).toEqual({ page: 'tok-2' });
  });

  it('reads list pages defensively (a malformed page throws, never guesses)', () => {
    expect(() => stripeV1ListPageOf({ data: 'not-an-array' })).toThrow(ValidationError);
    expect(() => stripeV2ListPageOf({ nope: true })).toThrow(ValidationError);
  });
});

describe('the typed error classification (handoff §13.3)', () => {
  const envelope = { error: { type: 'invalid_request_error', code: 'card_error', message: 'Your card was declined.' } };

  it('classifies 401/403/404/409/429/5xx with retry basis', () => {
    expect(classifyStripeHttpError(401, envelope).errorClass).toBe('AUTHENTICATION_ERROR');
    expect(classifyStripeHttpError(401, envelope).retryable).toBe(false);
    expect(classifyStripeHttpError(403, envelope).errorClass).toBe('PERMISSION_SCOPE_ERROR');
    const notFound = classifyStripeHttpError(404, { error: { type: 'invalid_request_error' } });
    expect(notFound.errorClass).toBe('RESOURCE_NOT_FOUND');
    expect(classifyStripeHttpError(409, envelope).errorClass).toBe('CONFLICT');
    const rate = classifyStripeHttpError(429, envelope, '27');
    expect(rate.errorClass).toBe('RATE_LIMITED');
    expect(rate.retryable).toBe(true);
    expect(rate.retryAfterSeconds).toBe(27);
    const serverError = classifyStripeHttpError(502, envelope);
    expect(serverError.errorClass).toBe('PROVIDER_INTERNAL_ERROR');
    expect(serverError.retryable).toBe(true);
    const badRequest = classifyStripeHttpError(400, envelope);
    expect(badRequest.errorClass).toBe('INVALID_REQUEST');
    expect(badRequest.retryable).toBe(false);
  });

  it('reads the canonical Stripe error envelope safely', () => {
    const read = readStripeErrorEnvelope(envelope);
    expect(read?.type).toBe('invalid_request_error');
    expect(read?.code).toBe('card_error');
    expect(readStripeErrorEnvelope({ error: 'not-an-object' })).toBeNull();
    expect(readStripeErrorEnvelope('nope')).toBeNull();
  });
});

describe('the per-operation idempotency classification (overlay law)', () => {
  it('v1 state-changing POSTs take the Idempotency-Key header; reads do not', () => {
    const createPi = stripeIdempotencyClassOf({ apiNamespace: 'v1', method: 'POST', effectClass: 'FINANCIAL_CREATE' });
    expect(createPi).toBe('V1_IDEMPOTENCY_KEY_HEADER');
    expect(stripeIdempotencyKeyAllowed({ apiNamespace: 'v1', method: 'POST', effectClass: 'FINANCIAL_CREATE' })).toBe(true);
    expect(stripeAutomaticRetryAllowed({ apiNamespace: 'v1', method: 'POST', effectClass: 'FINANCIAL_CREATE' })).toBe(true);
    expect(stripeIdempotencyKeyAllowed({ apiNamespace: 'v1', method: 'GET', effectClass: 'READ_ONLY' })).toBe(false);
    expect(stripeIdempotencyClassOf({ apiNamespace: 'v1', method: 'GET', effectClass: 'READ_ONLY' })).toBe('NATURALLY_IDEMPOTENT_READ');
  });

  it('v2 POSTs never take v1 retry semantics; DELETEs never auto-retry', () => {
    expect(stripeIdempotencyClassOf({ apiNamespace: 'v2', method: 'POST', effectClass: 'FINANCIAL_CREATE' })).toBe(
      'V2_IDENTIFIER_OR_READ_BACK_ONLY',
    );
    expect(stripeAutomaticRetryAllowed({ apiNamespace: 'v2', method: 'POST', effectClass: 'FINANCIAL_CREATE' })).toBe(false);
    expect(stripeIdempotencyClassOf({ apiNamespace: 'v1', method: 'DELETE', effectClass: 'FINANCIAL_IRREVERSIBLE_OR_REVERSAL' })).toBe(
      'DELETE_NO_AUTOMATIC_RETRY',
    );
    expect(stripeAutomaticRetryAllowed({ apiNamespace: 'v1', method: 'DELETE', effectClass: 'FINANCIAL_IRREVERSIBLE_OR_REVERSAL' })).toBe(false);
  });
});

describe('the call context credential law (INV-25)', () => {
  it('accepts test-mode secret keys and validates the version shape', () => {
    expect(() =>
      validateStripeCallContext({
        apiVersion: STRIPE_CATALOGUE_API_VERSION,
        authorizationHeader: `Bearer ${['sk','test','FAKE51key'+'DoNotUse0001'].join('_')}`,
      }),
    ).not.toThrow();
  });

  it('REFUSES publishable pk_ keys as server-side credentials', () => {
    expect(() =>
      validateStripeCallContext({
        apiVersion: '2026-09-30.endive',
        authorizationHeader: `Bearer ${['pk','test','FAKE51key'+'DoNotUse0001'].join('_')}`,
      }),
    ).toThrow(/publishable pk_ key/);
  });

  it('REFUSES live-mode keys (ADR-0017 D14 — live is a separate future ADR)', () => {
    expect(() =>
      validateStripeCallContext({
        apiVersion: '2026-09-30.endive',
        authorizationHeader: `Bearer ${['sk','live','FAKE51key'+'DoNotUse0001'].join('_')}`,
      }),
    ).toThrow(/INV-25/);
    expect(() =>
      validateStripeCallContext({
        apiVersion: '2026-09-30.endive',
        authorizationHeader: `Bearer ${['rk','live','FAKE51key'+'DoNotUse0001'].join('_')}`,
      }),
    ).toThrow(/live-mode/);
  });

  it('requires an explicit, well-shaped apiVersion (never hardcoded)', () => {
    expect(() =>
      validateStripeCallContext({ apiVersion: '', authorizationHeader: `Bearer ${['sk','test','FAKE51key'+'DoNotUse0001'].join('_')}` }),
    ).toThrow(ValidationError);
    expect(() =>
      validateStripeCallContext({ apiVersion: 'not-a-version', authorizationHeader: `Bearer ${['sk','test','FAKE51key'+'DoNotUse0001'].join('_')}` }),
    ).toThrow(ValidationError);
  });

  it('validates the host-verified Stripe-Account shape', () => {
    expect(() =>
      validateStripeCallContext({
        apiVersion: '2026-09-30.endive',
        authorizationHeader: `Bearer ${['sk','test','FAKE51key'+'DoNotUse0001'].join('_')}`,
        stripeAccount: 'acct_FAKE123',
      }),
    ).not.toThrow();
    expect(() =>
      validateStripeCallContext({
        apiVersion: '2026-09-30.endive',
        authorizationHeader: `Bearer ${['sk','test','FAKE51key'+'DoNotUse0001'].join('_')}`,
        stripeAccount: 'cus_FAKE123',
      }),
    ).toThrow(ValidationError);
  });
});
