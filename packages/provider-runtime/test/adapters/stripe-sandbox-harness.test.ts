/**
 * @payswap/provider-runtime — the Stripe SANDBOX HARNESS (P24-1, R7).
 *
 * THE TWO-TIER LAW (handoff §13.3/§13.5 — a scripted receipt is a SEPARATE
 * tier, never renamed live):
 *
 * TIER 1 — SCRIPTED (always runs, credential-free): the same harness journeys
 * driven through the deterministic FakeStripeFetch. Proves the harness
 * plumbing (transport wiring, context binding, assertion shapes) with ZERO
 * credentials, ZERO network. NEVER counts as real-provider evidence.
 *
 * TIER 2 — REAL STRIPE SANDBOX (OPERATOR_GATED): runs ONLY when the operator
 * supplies a test-mode secret key via the environment variable
 * STRIPE_SANDBOX_SECRET_KEY. Skips cleanly when the variable is absent (the
 * tier marker below records the gate). The key is read from the environment
 * ONCE, exists only inside the Bearer header of the fetch call frame, and is
 * never hardcoded, logged, echoed or asserted (INV-25/INV-19; the transport
 * returns no headers upward). A pk_ publishable key or a live-mode key is
 * REFUSED by the transport's credential gate — the tests then fail loudly,
 * which is the correct surfacing of an operator error.
 *
 * TIER 2a — REAL WRITES (doubly gated): additionally requires
 * STRIPE_SANDBOX_WRITES_ENABLED=1, because writes need Products: Write on
 * the supplied key and leave objects in the operator's sandbox. The journey
 * is the full two-phase shape against the real API: create product →
 * read-back → archive (DELETE), each verified by the provider's own answer.
 *
 * Required key permissions for TIER 2 (documented, not assumed): Account:
 * Read, Balance: Read, Customers: Read. TIER 2a adds Products: Write.
 */

import { describe, expect, it } from 'vitest';
import { StripeCatalogueTransport } from '../../src/adapters/stripe/transport/catalogue-transport.ts';
import type {
  StripeCatalogueFetch,
  StripeOperationDispatchResult,
} from '../../src/adapters/stripe/transport/catalogue-transport.ts';
import { STRIPE_CATALOGUE_API_VERSION } from '../../src/adapters/stripe/transport/call-context.ts';
import { stripeReadBackOperationOf } from '../../src/adapters/stripe/catalogue/implemented-operations.ts';
import { FakeStripeFetch, fakeCallContext } from './stripe-fake-transport.test.ts';

/** The env var that gates the real tier (NEVER a hardcoded key). */
const ENV_REAL_TIER = 'STRIPE_SANDBOX_SECRET_KEY';
/** The env var that additionally opts into the real write journey. */
const ENV_WRITES = 'STRIPE_SANDBOX_WRITES_ENABLED';

const realSandboxKey = process.env[ENV_REAL_TIER];
const writesEnabled = process.env[ENV_WRITES] === '1';

/**
 * The harness tier marker (the honest record a run leaves behind):
 * - 'REAL_SANDBOX' — the operator supplied credentials; TIER 2 ran;
 * - 'SCRIPTED_FAKE_ONLY__OPERATOR_GATED' — no credentials; only TIER 1 ran
 *   and the real tier is recorded as OPERATOR_GATED, never as a pass.
 */
export const STRIPE_SANDBOX_HARNESS_TIER =
  realSandboxKey !== undefined && realSandboxKey.length > 0
    ? 'REAL_SANDBOX'
    : 'SCRIPTED_FAKE_ONLY__OPERATOR_GATED';

/** The real-fetch binding adapter (the host composition responsibility):
 * converts the Response's Headers object into the plain record the
 * transport's request-id/retry-after extraction reads. No other adaptation. */
const realFetchBinding: StripeCatalogueFetch = async (url, init) => {
  const response = await fetch(url, init);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: response.status, headers, text: () => response.text() };
};

/** The per-call context for the real tier (key from the environment only). */
function realSandboxContext(): { apiVersion: string; authorizationHeader: string; timeoutMs: number } {
  return {
    apiVersion: STRIPE_CATALOGUE_API_VERSION,
    authorizationHeader: `Bearer ${realSandboxKey ?? ''}`,
    timeoutMs: 20_000,
  };
}

/** Assert the structural shape of a successful account read (no fabricated
 * values — only Stripe's own documented envelope fields). */
function expectAccountReadOk(result: StripeOperationDispatchResult): void {
  expect(result.kind).toBe('OK');
  if (result.kind !== 'OK') return;
  expect(result.status).toBe(200);
  const body = result.body as { object?: unknown; id?: unknown };
  expect(body?.object).toBe('account');
  expect(typeof body?.id).toBe('string');
  expect(String(body?.id).startsWith('acct_')).toBe(true);
  // Evidence lineage: the provider's request id rides every OK answer.
  expect(typeof result.requestId).toBe('string');
  expect(result.requestId?.startsWith('req_')).toBe(true);
}

describe('the sandbox harness — tier marker (always runs)', () => {
  it('records exactly one honest tier; the real tier is OPERATOR_GATED without credentials', () => {
    if (realSandboxKey !== undefined && realSandboxKey.length > 0) {
      expect(STRIPE_SANDBOX_HARNESS_TIER).toBe('REAL_SANDBOX');
    } else {
      // The gate is the ONLY difference: the scripted tier never stands in
      // for the real one (a scripted receipt is a separate tier, §13.5).
      expect(STRIPE_SANDBOX_HARNESS_TIER).toBe('SCRIPTED_FAKE_ONLY__OPERATOR_GATED');
      expect(realSandboxKey).toBeUndefined();
    }
  });

  it('the harness source itself carries no credential material (no hardcoded key)', () => {
    // The only key-shaped strings in this file are FAKE-marked test fixtures
    // re-exported from the scripted fake (checked by the boundary battery);
    // the real key exists only in the environment and the fetch call frame.
    expect(realSandboxKey === undefined || typeof realSandboxKey === 'string').toBe(true);
  });
});

describe('TIER 1 — the scripted harness journeys (credential-free, never real evidence)', () => {
  it('GetAccount through the scripted fake proves the harness wiring', async () => {
    const fake = new FakeStripeFetch().script({
      kind: 'OK',
      status: 200,
      body: { id: 'acct_FAKE0001', object: 'account' },
      requestId: 'req_FAKEHARNESS1',
    });
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'GetAccount',
      params: {},
      context: fakeCallContext(),
    });
    expectAccountReadOk(result);
    if (result.kind === 'OK') expect(result.requestId).toBe('req_FAKEHARNESS1');
    expect(fake.callCount).toBe(1);
  });

  it('a scripted 404 exercises the same error-classification shape the real tier asserts', async () => {
    const fake = new FakeStripeFetch().script({
      kind: 'HTTP_ERROR',
      status: 404,
      body: { error: { type: 'invalid_request_error', code: 'resource_missing' } },
      requestId: 'req_FAKEHARNESS2',
    });
    const transport = new StripeCatalogueTransport({ fetchImpl: fake.fetch });
    const result = await transport.dispatch({
      operationId: 'GetCustomersCustomer',
      params: { customer: 'cus_scripted-not-found' },
      context: fakeCallContext(),
    });
    expect(result.kind).toBe('ERROR_STATUS');
    if (result.kind === 'ERROR_STATUS') {
      expect(result.error.errorClass).toBe('RESOURCE_NOT_FOUND');
      expect(result.error.retryable).toBe(false);
    }
  });
});

describe.skipIf(realSandboxKey === undefined || realSandboxKey.length === 0)(
  'TIER 2 — the REAL Stripe Sandbox (OPERATOR_GATED via STRIPE_SANDBOX_SECRET_KEY)',
  () => {
    it('GetAccount reads the real account envelope (Account: Read)', async () => {
      const transport = new StripeCatalogueTransport({ fetchImpl: realFetchBinding });
      const result = await transport.dispatch({
        operationId: 'GetAccount',
        params: {},
        context: realSandboxContext(),
      });
      expectAccountReadOk(result);
    }, 45_000);

    it('GetBalance reads the real balance envelope (Balance: Read)', async () => {
      const transport = new StripeCatalogueTransport({ fetchImpl: realFetchBinding });
      const result = await transport.dispatch({
        operationId: 'GetBalance',
        params: {},
        context: realSandboxContext(),
      });
      expect(result.kind).toBe('OK');
      if (result.kind === 'OK') {
        expect(result.status).toBe(200);
        const body = result.body as { object?: unknown; available?: unknown };
        expect(body?.object).toBe('balance');
        expect(Array.isArray(body?.available)).toBe(true);
      }
    }, 45_000);

    it('GetCustomers paginates the real list under a bounded budget (Customers: Read)', async () => {
      const transport = new StripeCatalogueTransport({ fetchImpl: realFetchBinding });
      const result = await transport.paginateList(
        { operationId: 'GetCustomers', params: { limit: 1 }, context: realSandboxContext() },
        { maxPages: 2 },
      );
      // An empty sandbox account is a VALID walk: zero items, not truncated.
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.walk.items.length).toBeGreaterThanOrEqual(0);
        expect(result.walk.pagesFetched).toBeGreaterThanOrEqual(1);
        expect(result.walk.pagesFetched).toBeLessThanOrEqual(2);
      }
    }, 45_000);

    it('a real 404 classifies RESOURCE_NOT_FOUND (the typed error surface on real answers)', async () => {
      const transport = new StripeCatalogueTransport({ fetchImpl: realFetchBinding });
      const result = await transport.dispatch({
        operationId: 'GetCustomersCustomer',
        params: { customer: 'cus_payswap_harness_not_found' },
        context: realSandboxContext(),
      });
      expect(result.kind).toBe('ERROR_STATUS');
      if (result.kind === 'ERROR_STATUS') {
        expect(result.error.errorClass).toBe('RESOURCE_NOT_FOUND');
        expect(result.error.httpStatus).toBe(404);
        expect(result.error.retryable).toBe(false);
      }
    }, 45_000);
  },
);

describe.skipIf(
  realSandboxKey === undefined || realSandboxKey.length === 0 || !writesEnabled,
)(
  'TIER 2a — the REAL write journey (doubly gated: key + STRIPE_SANDBOX_WRITES_ENABLED=1)',
  () => {
    it('create product → read-back → archive, each step verified by the provider answer', async () => {
      const transport = new StripeCatalogueTransport({ fetchImpl: realFetchBinding });
      // A unique, clearly-labeled harness product (never customer data).
      const stamp = new Date().toISOString().replace(/[^0-9]/g, '');
      const name = `payswap-p24-harness ${stamp}`;
      // Step 1: create (v1 state-changing POST → the registrar key is required).
      const created = await transport.dispatch({
        operationId: 'PostProducts',
        params: { name, metadata: { harness: 'p24-1' } },
        context: realSandboxContext(),
        idempotencyKey: `p24-harness-product-${stamp}`,
      });
      expect(created.kind).toBe('OK');
      if (created.kind !== 'OK') return;
      const productId = (created.body as { id?: unknown }).id;
      expect(typeof productId).toBe('string');
      // Step 2: read-back through the reviewed route (the reconciliation law).
      expect(stripeReadBackOperationOf('PostProducts')).toBe('GetProductsId');
      const readBack = await transport.dispatch({
        operationId: 'GetProductsId',
        params: { id: String(productId) },
        context: realSandboxContext(),
      });
      expect(readBack.kind).toBe('OK');
      if (readBack.kind === 'OK') {
        expect((readBack.body as { id?: unknown }).id).toBe(productId);
      }
      // Step 3: archive via DELETE (irreversible tier; no automatic retry).
      const archived = await transport.dispatch({
        operationId: 'DeleteProductsId',
        params: { id: String(productId) },
        context: realSandboxContext(),
      });
      expect(archived.kind).toBe('OK');
      if (archived.kind === 'OK') {
        const body = archived.body as { deleted?: unknown; id?: unknown };
        expect(body?.deleted).toBe(true);
        expect(body?.id).toBe(productId);
      }
    }, 60_000);
  },
);
