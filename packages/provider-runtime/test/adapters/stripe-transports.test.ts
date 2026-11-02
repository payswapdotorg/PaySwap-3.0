/**
 * @payswap/provider-runtime — the v1/v2 TRANSPORT DISPATCH battery (P24-1,
 * ADR-0017 D6).
 *
 * The dispatch law chain of StripeCatalogueTransport, exercised against
 * DETERMINISTIC FAKES (the fake-transport pattern — no network, no SDK, no
 * fabricated provider answers):
 * - the operationId must resolve to a census record whose support state is
 *   an IMPLEMENTED state (unknown id or PLANNED/other state → REFUSED
 *   before dispatch — the DENY law; ADR-0017 D7);
 * - parameters must pass the strict schema validator (D4) — unknown fields,
 *   missing required fields and type mismatches never reach the wire;
 * - the URL is assembled from the pinned path template + charset-safe path
 *   params — never caller text; no arbitrary host/URL/header injection;
 * - the API version comes from the explicit per-call context (D2's migration
 *   law: the 2025-08-27.basil legacy pin in declaration.ts stays untouched);
 * - per-operation idempotency classification is honored (required keys,
 *   refused keys, Stripe's replay-the-stored-response semantics);
 * - a timeout/connection-loss/malformed answer after possible dispatch is
 *   UNKNOWN, never FAILED (INV-04);
 * - errors are classified (401/403/404/409/429/5xx — typed, testable);
 * - pagination walks through the transport under a bounded budget.
 *
 * The pure protocol layer (serializers, paginators, classifier functions,
 * the call-context gate) has its own battery: stripe-protocol.test.ts.
 */

import { describe, expect, it } from 'vitest';
import {
  StripeCatalogueTransport,
} from '../../src/adapters/stripe/transport/catalogue-transport.ts';
import { FakeStripeFetch, fakeCallContext } from './stripe-fake-transport.test.ts';

describe('the catalogue transport — dispatch law chain (fakes only)', () => {
  it('dispatches a GET read with the context version header and returns the body losslessly', async () => {
    const fake = new FakeStripeFetch().script({
      kind: 'OK',
      status: 200,
      body: { object: 'balance', available: [{ amount: 1000, currency: 'usd' }] },
      requestId: 'req_FAKE001',
    });
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'GetBalance',
      params: {},
      context: fakeCallContext(),
    });
    expect(result.kind).toBe('OK');
    if (result.kind === 'OK') {
      expect(result.status).toBe(200);
      expect(result.requestId).toBe('req_FAKE001');
      expect(result.body).toEqual({ object: 'balance', available: [{ amount: 1000, currency: 'usd' }] });
    }
    expect(fake.calls()[0]?.url).toBe('https://api.stripe.com/v1/balance');
    expect(fake.calls()[0]?.method).toBe('GET');
    expect(fake.calls()[0]?.stripeVersion).toBe('2026-09-30.endive');
  });

  it('dispatches a v1 POST with a form body and the registrar idempotency key bound', async () => {
    const fake = new FakeStripeFetch().script({
      kind: 'OK',
      status: 200,
      body: { id: 'cus_FAKE900', object: 'customer' },
      requestId: 'req_FAKE002',
    });
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'PostCustomers',
      params: { email: 'buyer@example.test', metadata: { tier: 'gold' } },
      context: fakeCallContext(),
      idempotencyKey: 'registrar-mission-1',
    });
    expect(result.kind).toBe('OK');
    const call = fake.calls()[0]!;
    expect(call.method).toBe('POST');
    expect(call.url).toBe('https://api.stripe.com/v1/customers');
    expect(call.body).toBe('email=buyer%40example.test&metadata%5Btier%5D=gold');
    expect(call.idempotencyKey).toBe('registrar-mission-1');
    expect(call.headerNames).toContain('Content-Type');
  });

  it('dispatches a DELETE (the new method) for product archive', async () => {
    const fake = new FakeStripeFetch().script({
      kind: 'OK',
      status: 200,
      body: { id: 'prod_FAKE1', object: 'product', deleted: true },
    });
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'DeleteProductsId',
      params: { id: 'prod_FAKE1' },
      context: fakeCallContext(),
    });
    expect(result.kind).toBe('OK');
    expect(fake.calls()[0]?.method).toBe('DELETE');
    expect(fake.calls()[0]?.url).toBe('https://api.stripe.com/v1/products/prod_FAKE1');
    expect(fake.calls()[0]?.body).toBeUndefined();
  });

  it('REFUSES unknown operationIds before the wire (fail-closed)', async () => {
    const fake = new FakeStripeFetch();
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'DefinitelyNotAnOperation',
      params: {},
      context: fakeCallContext(),
    });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') expect(result.reason).toBe('UNKNOWN_OPERATION');
    expect(fake.callCount).toBe(0);
  });

  it('REFUSES a held credential-admin operation (NOT_SUPPORTED_WITH_REASON — the P25 DENY)', async () => {
    const fake = new FakeStripeFetch();
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'PostWebhookEndpoints', // the secrets-in-response hold
      params: { url: 'https://example.com/hook' },
      context: fakeCallContext(),
    });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') {
      expect(result.reason).toBe('NOT_DISPATCHABLE');
      expect(result.detail).toContain('NOT_SUPPORTED_WITH_REASON');
    }
    expect(fake.callCount).toBe(0);
  });

  it('DISPATCHES a historically-PLANNED read under P25 (the flip proof)', async () => {
    const fake = new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { object: 'search_result', data: [] } });
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'GetCustomersSearch', // in the P24 74-set, was PLANNED — flips with P25
      params: { query: 'name:\'Annual\'' },
      context: fakeCallContext(),
    });
    expect(result.kind).toBe('OK');
    expect(fake.callCount).toBe(1);
    expect(fake.calls()[0]?.url).toContain('/v1/customers/search');
  });

  it('DISPATCHES a v2 operation under P25 (the v2 flip proof)', async () => {
    const fake = new FakeStripeFetch().script({ kind: 'OK', status: 200, body: { object: 'list', data: [] } });
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'GetV2CoreEvents',
      params: {},
      context: fakeCallContext(),
    });
    expect(result.kind).toBe('OK');
    expect(fake.callCount).toBe(1);
    expect(fake.calls()[0]?.url).toContain('/v2/core/events');
  });

  it('REFUSES the secrets-law create (the audit’s live catch, held at REAUTH class)', async () => {
    const fake = new FakeStripeFetch();
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'PostAppsSecrets', // 3-segment path — the family rule missed it; the path-prefix law holds it
      params: { name: 'a', payload: 'b' },
      context: fakeCallContext(),
    });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') expect(result.reason).toBe('NOT_DISPATCHABLE');
    expect(fake.callCount).toBe(0);
  });

  it('REFUSES params that fail strict validation (unknown field) before the wire', async () => {
    const fake = new FakeStripeFetch();
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'PostPaymentIntents',
      params: { amount: 100, currency: 'usd', bogus: 1 },
      context: fakeCallContext(),
      idempotencyKey: 'registrar-1',
    });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') {
      expect(result.reason).toBe('INVALID_PARAMETERS');
      expect(result.issues?.some((i) => i.kind === 'UNKNOWN_FIELD')).toBe(true);
    }
    expect(fake.callCount).toBe(0);
  });

  it('REFUSES path params carrying injection shapes (the URL is catalogue-built only)', async () => {
    const fake = new FakeStripeFetch();
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'GetCustomersCustomer',
      params: { customer: '../customers/../admin' },
      context: fakeCallContext(),
    });
    expect(result.kind).toBe('REFUSED');
    expect(fake.callCount).toBe(0);
  });

  it('REFUSES a v1 state-changing POST without the registrar idempotency key', async () => {
    const fake = new FakeStripeFetch();
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'PostRefunds',
      params: { payment_intent: 'pi_FAKE1' },
      context: fakeCallContext(),
    });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') expect(result.reason).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(fake.callCount).toBe(0);
  });

  it('REFUSES an idempotency key on an operation whose class does not take one', async () => {
    const fake = new FakeStripeFetch();
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'GetBalance',
      params: {},
      context: fakeCallContext(),
      idempotencyKey: 'registrar-1',
    });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') expect(result.reason).toBe('IDEMPOTENCY_KEY_NOT_ALLOWED');
    expect(fake.callCount).toBe(0);
  });

  it('REFUSES an invalid credential context (pk_/live) before the wire', async () => {
    const fake = new FakeStripeFetch();
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'GetBalance',
      params: {},
      context: { apiVersion: '2026-09-30.endive', authorizationHeader: `Bearer ${['pk','test','FAKE51key'+'DoNotUse0001'].join('_')}` },
    });
    expect(result.kind).toBe('REFUSED');
    if (result.kind === 'REFUSED') expect(result.reason).toBe('INVALID_CONTEXT');
    expect(fake.callCount).toBe(0);
  });

  it('a timeout after possible dispatch is UNKNOWN, never FAILED (INV-04)', async () => {
    const fake = new FakeStripeFetch().script({ kind: 'TIMEOUT' });
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'PostRefunds',
      params: { payment_intent: 'pi_FAKE1' },
      context: fakeCallContext(),
      idempotencyKey: 'registrar-1',
    });
    expect(result.kind).toBe('UNKNOWN');
    if (result.kind === 'UNKNOWN') expect(result.ambiguity).toBe('TIMEOUT_AFTER_DISPATCH');
  });

  it('connection loss and malformed bodies are UNKNOWN (the request may have landed)', async () => {
    const lost = new FakeStripeFetch().script({ kind: 'CONNECTION_LOST' });
    const transport = new StripeCatalogueTransport({ fetchImpl: lost.fetch });
    const lostResult = await transport.dispatch({
      operationId: 'GetBalance',
      params: {},
      context: fakeCallContext(),
    });
    expect(lostResult.kind).toBe('UNKNOWN');
    if (lostResult.kind === 'UNKNOWN') expect(lostResult.ambiguity).toBe('CONNECTION_LOST_AFTER_DISPATCH');

    const malformed = new FakeStripeFetch().script({ kind: 'MALFORMED', status: 200, text: '<html>nope</html>' });
    const malformedTransport = new StripeCatalogueTransport({ fetchImpl: malformed.fetch });
    const malformedResult = await malformedTransport.dispatch({
      operationId: 'GetBalance',
      params: {},
      context: fakeCallContext(),
    });
    expect(malformedResult.kind).toBe('UNKNOWN');
    if (malformedResult.kind === 'UNKNOWN') expect(malformedResult.ambiguity).toBe('MALFORMED_RESPONSE');
  });

  it('classifies a delivered 403 scope error with the typed surface', async () => {
    const fake = new FakeStripeFetch().script({
      kind: 'HTTP_ERROR',
      status: 403,
      body: { error: { type: 'invalid_request_error', message: 'The provided key does not have the required permissions.' } },
      requestId: 'req_FAKE403',
    });
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'GetCustomers',
      params: {},
      context: fakeCallContext(),
    });
    expect(result.kind).toBe('ERROR_STATUS');
    if (result.kind === 'ERROR_STATUS') {
      expect(result.error.errorClass).toBe('PERMISSION_SCOPE_ERROR');
      expect(result.error.retryable).toBe(false);
      expect(result.requestId).toBe('req_FAKE403');
    }
  });

  it('honors Stripe idempotency replay: a repeated key returns the stored response', async () => {
    const fake = new FakeStripeFetch().withIdempotentReplay().script(
      { kind: 'OK', status: 200, body: { id: 'cus_FAKE777', object: 'customer' } },
      { kind: 'OK', status: 200, body: { id: 'cus_FAKE888', object: 'customer' } },
    );
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const context = fakeCallContext();
    const first = await transport.dispatch({
      operationId: 'PostCustomers',
      params: { email: 't1@example.test' },
      context,
      idempotencyKey: 'registrar-key-X',
    });
    const replay = await transport.dispatch({
      operationId: 'PostCustomers',
      params: { email: 't2@example.test' },
      context,
      idempotencyKey: 'registrar-key-X',
    });
    expect(first.kind).toBe('OK');
    expect(replay.kind).toBe('OK');
    if (first.kind === 'OK' && replay.kind === 'OK') {
      expect(replay.body).toEqual(first.body);
    }
  });

  it('paginates a v1 list through the transport with a bounded budget', async () => {
    const fake = new FakeStripeFetch().script(
      { kind: 'OK', status: 200, body: { object: 'list', data: [{ id: 'cus_FAKE1' }, { id: 'cus_FAKE2' }], has_more: true } },
      { kind: 'OK', status: 200, body: { object: 'list', data: [{ id: 'cus_FAKE3' }], has_more: false } },
    );
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.paginateList(
      { operationId: 'GetCustomers', params: { limit: 2 }, context: fakeCallContext() },
      { maxPages: 5 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.walk.items).toHaveLength(3);
      expect(result.walk.truncated).toBe(false);
    }
    expect(fake.calls()[1]?.url).toContain('starting_after=cus_FAKE2');
  });

  it('honors a custom base URL (composition edge for tests/proxies)', async () => {
    const fake = new FakeStripeFetch().script({ kind: 'OK', status: 200, body: {} });
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch, baseUrl: 'https://fake-stripe.local/' });
    await transport.dispatch({ operationId: 'GetAccount', params: {}, context: fakeCallContext() });
    expect(fake.calls()[0]?.url).toBe('https://fake-stripe.local/v1/account');
  });
});
